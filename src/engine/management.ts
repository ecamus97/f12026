// Team management: budget, R&D projects, facilities and AI development.
// Pure functions over a serialisable ManagementState.
import { races2026, type Team } from "@/data/f1Data";
import { createRng, type Rng } from "./rng";
import { generateOffers, SLOT_INFO, sponsorPayout, tvRights, type RaceOutcome, type SponsorDeal, type SponsorSlot } from "./sponsors";
import type { ClassifiedRow } from "./types";

export type DevArea = "aero" | "powerUnit" | "chassis" | "reliability" | "pitCrew";
export type FacilityKey = "windTunnel" | "dyno" | "factory" | "reliabilityLab" | "pitTraining";

export interface CarDev {
  aero: number;
  powerUnit: number;
  chassis: number;
  reliability: number;
  pitCrew: number;
}

export const AREA_INFO: Record<DevArea, { label: string; short: string; facility: FacilityKey; desc: string }> = {
  aero: { label: "Aerodinámica", short: "Aero", facility: "windTunnel", desc: "Carga aerodinámica: el mayor aporte al ritmo." },
  powerUnit: { label: "Unidad de potencia", short: "Motor", facility: "dyno", desc: "Potencia y gestión de energía (2026: 50% eléctrico)." },
  chassis: { label: "Chasis", short: "Chasis", facility: "factory", desc: "Rigidez, peso y suspensión." },
  reliability: { label: "Fiabilidad", short: "Fiab.", facility: "reliabilityLab", desc: "Menos averías y abandonos." },
  pitCrew: { label: "Pit crew", short: "Pits", facility: "pitTraining", desc: "Paradas más rápidas y consistentes." },
};

/** Weights of each component in the overall car pace rating. */
export const PACE_WEIGHTS = { aero: 0.4, powerUnit: 0.3, chassis: 0.3 } as const;

export const FACILITY_INFO: Record<FacilityKey, { label: string; desc: string }> = {
  windTunnel: { label: "Túnel de viento", desc: "Mejora el resultado de los proyectos de aerodinámica." },
  dyno: { label: "Banco de potencia", desc: "Mejora el resultado de los proyectos de motor." },
  factory: { label: "Fábrica", desc: "Mejora el chasis. Nivel 3+: un proyecto simultáneo extra. Nivel 5: proyectos 1 carrera más rápidos." },
  reliabilityLab: { label: "Laboratorio de fiabilidad", desc: "Mejora los proyectos de fiabilidad." },
  pitTraining: { label: "Centro de entrenamiento de pits", desc: "Mejora el entrenamiento del pit crew." },
};

export const MAX_FACILITY_LEVEL = 5;

export interface ProjectTemplate {
  id: string;
  area: DevArea;
  name: string;
  cost: number; // M USD
  races: number; // races until it is ready
  gain: [number, number]; // rating points on success
  success: number; // base probability of full success
}

// Each category has its own parts, with their own cost, lead time and risk.
// Every upgrade of the same part gives a bit less (×0.85 per previous upgrade).
const P = (id: string, area: DevArea, name: string, cost: number, races: number, gain: [number, number], success: number): ProjectTemplate =>
  ({ id, area, name, cost, races, gain, success });

export const PROJECTS: ProjectTemplate[] = [
  // Aerodinámica
  P("fw", "aero", "Alerón delantero", 3.5, 2, [1, 2.2], 0.85),
  P("rw", "aero", "Alerón trasero", 3.5, 2, [1, 2.2], 0.85),
  P("floor", "aero", "Fondo plano", 9, 4, [2.5, 4.5], 0.7),
  P("sidepods", "aero", "Pontones y refrigeración", 6, 3, [1.8, 3.2], 0.75),
  P("diffuser", "aero", "Difusor", 7, 3, [2, 3.6], 0.72),
  // Unidad de potencia
  P("ice", "powerUnit", "Motor de combustión (ICE)", 10, 5, [3, 5.5], 0.65),
  P("mguk", "powerUnit", "MGU-K", 6, 3, [1.8, 3.2], 0.75),
  P("es", "powerUnit", "Batería (almacenamiento de energía)", 5, 3, [1.5, 3], 0.78),
  P("turbo", "powerUnit", "Turbo", 4.5, 2, [1.2, 2.4], 0.8),
  P("pu-sw", "powerUnit", "Software de despliegue", 2.5, 1, [0.6, 1.4], 0.9),
  // Chasis
  P("fsusp", "chassis", "Suspensión delantera", 3.5, 2, [1, 2.2], 0.85),
  P("rsusp", "chassis", "Suspensión trasera", 3.5, 2, [1, 2.2], 0.85),
  P("weight", "chassis", "Reducción de peso", 8, 4, [2.2, 4], 0.7),
  P("brakes", "chassis", "Frenos", 3, 2, [0.9, 1.8], 0.88),
  P("gearbox", "chassis", "Caja de cambios", 5, 3, [1.5, 2.8], 0.78),
  // Fiabilidad
  P("cooling", "reliability", "Sistema de refrigeración", 2.5, 2, [1.5, 3], 0.9),
  P("hydraulics", "reliability", "Hidráulica", 2, 1, [1, 2], 0.9),
  P("electronics", "reliability", "Electrónica", 3, 2, [1.5, 3], 0.88),
  // Pit crew
  P("guns", "pitCrew", "Pistolas de rueda", 1.5, 1, [0.8, 1.6], 0.9),
  P("jacks", "pitCrew", "Gatos y equipamiento", 1.2, 1, [0.6, 1.4], 0.9),
  P("pit-training", "pitCrew", "Entrenamiento del pit crew", 1, 1, [0.8, 2], 0.85),
];

export interface ActiveProject {
  uid: string;
  templateId: string;
  area: DevArea;
  name: string;
  racesLeft: number;
  totalRaces: number;
}

export interface FacilityWork {
  key: FacilityKey;
  racesLeft: number;
}

export type LedgerCategory =
  | "initial" | "tv" | "sponsor" | "prize" | "owners" | "logistics" | "staff" | "parts" | "operations" | "repairs" | "salaries" | "transfers" | "rnd" | "facilities";

export const CATEGORY_INFO: Record<LedgerCategory, { label: string; kind: "income" | "expense" }> = {
  initial: { label: "Presupuesto inicial", kind: "income" },
  tv: { label: "Derechos comerciales y TV", kind: "income" },
  sponsor: { label: "Patrocinadores", kind: "income" },
  prize: { label: "Premios", kind: "income" },
  owners: { label: "Aporte de los dueños para sueldos", kind: "income" },
  logistics: { label: "Logística y viajes", kind: "expense" },
  staff: { label: "Personal de carrera", kind: "expense" },
  parts: { label: "Componentes y neumáticos", kind: "expense" },
  operations: { label: "Operación del fin de semana", kind: "expense" },
  repairs: { label: "Reparaciones", kind: "expense" },
  salaries: { label: "Sueldos de pilotos y dirección", kind: "expense" },
  transfers: { label: "Fichajes e indemnizaciones", kind: "expense" },
  rnd: { label: "Investigación y desarrollo", kind: "expense" },
  facilities: { label: "Instalaciones", kind: "expense" },
};

/** Category of a ledger line (older saves stored lines without one). */
export function ledgerCategory(l: LedgerEntry): LedgerCategory {
  if (l.category) return l.category;
  const c = l.concept.toLowerCase();
  if (c.startsWith("presupuesto")) return "initial";
  if (c.startsWith("i+d")) return "rnd";
  if (c.startsWith("obra")) return "facilities";
  if (c.startsWith("premio")) return "prize";
  if (c.startsWith("reparación")) return "repairs";
  if (c.startsWith("operación")) return "operations";
  if (c.startsWith("derechos")) return "tv";
  return l.amount >= 0 ? "sponsor" : "operations";
}

/** Investments are decisions taken between races; the rest happens on the race weekend. */
export const isInvestment = (cat: LedgerCategory) => cat === "rnd" || cat === "facilities" || cat === "transfers";

export interface LedgerEntry {
  race: number; // round number (1-24), 0 = pre-season
  concept: string;
  amount: number; // + income, - expense (M USD)
  category?: LedgerCategory;
}

export interface InboxMessage {
  race: number;
  tone: "good" | "bad" | "info";
  text: string;
}

export interface PlayerEconomy {
  teamId: string;
  budget: number;
  facilities: Record<FacilityKey, number>;
  facilityWork: FacilityWork | null;
  projects: ActiveProject[];
  ledger: LedgerEntry[];
  sponsors: SponsorDeal[]; // signed contracts
  offers: SponsorDeal[]; // available on the market
  partLevels?: Record<string, number>; // upgrades completed per part
  salaryFund?: number; // M USD per season the owners put in for salaries
}

export interface DevSnapshot {
  round: number;
  dev: Record<string, CarDev>;
}

export interface ManagementState {
  version: 1;
  dev: Record<string, CarDev>; // every team
  aiBudget: Record<string, number>;
  player: PlayerEconomy | null;
  inbox: InboxMessage[];
  rngState: number;
  nextUid: number;
  history: DevSnapshot[]; // development of every team, after each round
  staffRatings?: Record<string, { tp: number; td: number }>; // team principal / technical director per team
  regs?: { budgetCap: number | null; puFreeze: boolean; flatPrize: boolean }; // regulations that affect development and money
}

/** R&D + facilities spent this season (the ledger restarts every season). */
export function seasonInvestment(p: PlayerEconomy) {
  return p.ledger.filter((l) => {
    const c = ledgerCategory(l);
    return (c === "rnd" || c === "facilities") && l.amount < 0;
  }).reduce((a, l) => a - l.amount, 0);
}

function capCheck(m: ManagementState, cost: number): string | null {
  const cap = m.regs?.budgetCap;
  if (!cap || !m.player) return null;
  const spent = seasonInvestment(m.player);
  return spent + cost > cap + 1e-6 ? `Límite presupuestario: quedan US$ ${Math.max(0, cap - spent).toFixed(1)} M esta temporada` : null;
}

/** Technical director: better development results (0.85x .. 1.2x) and success chance. */
export const tdMult = (td = 80) => 0.85 + (td - 70) * 0.012;
export const tdSuccess = (td = 80) => (td - 80) * 0.005;
/** Team principal: sponsors pay more with a well-known leader. */
export const tpSponsorMult = (tp = 80) => 0.92 + (tp - 70) * 0.006;

// --- Economy constants -------------------------------------------------------
export const CRASH_REPAIR = 1.5; // M USD per accident
export const PRIZE_PER_POINT = 0.12; // M USD
export const STAFF_COST = 1.2;
export const PARTS_COST = 0.7;
const EUROPE = new Set(["Monaco", "Spain", "Austria", "Great Britain", "Belgium", "Hungary", "Netherlands", "Italy", "Azerbaijan"]);
/** Logistics depend on where the race is: European rounds are cheaper than fly-aways. */
export const logisticsCost = (round: number) => (EUROPE.has(races2026[round - 1]?.country ?? "") ? 0.8 : 1.4);
export const raceRunningCost = (round: number) => logisticsCost(round) + STAFF_COST + PARTS_COST;
export const facilityUpgradeCost = (level: number) => 8 + level * 6; // to go from level -> level+1
/** Building takes a long time: 10 races for level 2, up to 16 races for level 5 (it continues across seasons). */
export const facilityBuildRaces = (level: number) => 8 + level * 2;
export const FACILITY_BUILD_RACES = facilityBuildRaces(1);

/** Starting development budget (M USD) by car rating: big teams have more money. */
export const startBudget = (pace: number) => Math.round(30 + (pace - 78) * 1.8);
const startFacility = (pace: number) => (pace >= 92 ? 4 : pace >= 85 ? 3 : 2);

export function initManagement(teams: Team[], playerTeamId: string | null, seed: number): ManagementState {
  const rng = createRng(seed);
  const dev: Record<string, CarDev> = {};
  const aiBudget: Record<string, number> = {};
  for (const t of teams) {
    dev[t.id] = {
      aero: t.aero ?? t.pace,
      powerUnit: t.powerUnit ?? t.pace,
      chassis: t.chassis ?? t.pace,
      reliability: t.reliability,
      pitCrew: t.pitCrew,
    };
    aiBudget[t.id] = startBudget(t.pace);
  }
  const pt = teams.find((t) => t.id === playerTeamId);
  const lvl = pt ? startFacility(pt.pace) : 2;
  const carRank = pt ? 1 + teams.filter((t) => t.pace > pt.pace).length : 11;
  const used = new Set<string>();
  const offers = pt
    ? [
        ...generateOffers(rng, { slot: "principal", count: 3, pace: pt.pace, carRank, racesLeftInSeason: races2026.length, usedNames: used, uidStart: 1 }),
        ...generateOffers(rng, { slot: "secundario", count: 4, pace: pt.pace, carRank, racesLeftInSeason: races2026.length, usedNames: used, uidStart: 10 }),
      ]
    : [];
  return {
    version: 1,
    dev,
    aiBudget,
    player: pt
      ? {
          teamId: pt.id,
          budget: startBudget(pt.pace),
          facilities: { windTunnel: lvl, dyno: lvl, factory: lvl, reliabilityLab: lvl, pitTraining: lvl },
          facilityWork: null,
          projects: [],
          ledger: [{ race: 0, concept: "Presupuesto de desarrollo inicial", amount: startBudget(pt.pace), category: "initial" }],
          sponsors: [],
          offers,
        }
      : null,
    inbox: pt
      ? [
          { race: 0, tone: "info", text: `Bienvenido a ${pt.name}. Tienes US$ ${startBudget(pt.pace)} M para desarrollar el auto esta temporada.` },
          { race: 0, tone: "info", text: "Hay ofertas de patrocinio esperando: revísalas en Equipo → Finanzas." },
        ]
      : [],
    rngState: rng.state(),
    nextUid: 100,
    history: [{ round: 0, dev: structuredClone(dev) }],
  };
}

export const carPace = (d: CarDev) =>
  +(d.aero * PACE_WEIGHTS.aero + d.powerUnit * PACE_WEIGHTS.powerUnit + d.chassis * PACE_WEIGHTS.chassis).toFixed(2);

/** Write development ratings into the team list used by the simulation. */
export function applyDevToTeams(teams: Team[], m: ManagementState): Team[] {
  return teams.map((t) => {
    const d = m.dev[t.id];
    if (!d) return t;
    return {
      ...t,
      pace: carPace(d),
      aero: +d.aero.toFixed(2),
      powerUnit: +d.powerUnit.toFixed(2),
      chassis: +d.chassis.toFixed(2),
      reliability: +d.reliability.toFixed(1),
      pitCrew: +d.pitCrew.toFixed(1),
    };
  });
}

/** Rating points are harder to find the better the car already is. */
const diminishing = (current: number) => Math.max(0.25, Math.min(1.2, (100 - current) / 15));

export function maxProjects(p: PlayerEconomy) {
  return 3 + (p.facilities.factory >= 3 ? 1 : 0);
}

/** Extra multiplier for a part that has already been upgraded several times. */
export const partMult = (p: PlayerEconomy, templateId: string) => 0.85 ** (p.partLevels?.[templateId] ?? 0);

export function projectRaces(t: ProjectTemplate, p: PlayerEconomy) {
  return Math.max(1, t.races - (p.facilities.factory >= 5 ? 1 : 0));
}

/** Facility multiplier for an area: level 1 = 0.8x ... level 5 = 1.2x */
export const facilityMult = (level: number) => 0.7 + level * 0.1;

/** Expected gain range shown in the UI (after facilities and diminishing returns). */
export function expectedGain(t: ProjectTemplate, m: ManagementState): [number, number] {
  const p = m.player!;
  const current = m.dev[p.teamId][t.area];
  const k =
    facilityMult(p.facilities[AREA_INFO[t.area].facility]) * diminishing(current) * partMult(p, t.id) * tdMult(m.staffRatings?.[p.teamId]?.td);
  return [+(t.gain[0] * k).toFixed(1), +(t.gain[1] * k).toFixed(1)];
}

/** Probability that a project delivers its full gain. */
export function successChance(t: ProjectTemplate, m: ManagementState) {
  const p = m.player!;
  return Math.min(0.97, Math.max(0.3, t.success + (p.facilities[AREA_INFO[t.area].facility] - 3) * 0.04 + tdSuccess(m.staffRatings?.[p.teamId]?.td)));
}

export function canStartProject(m: ManagementState, templateId: string): string | null {
  const p = m.player;
  const t = PROJECTS.find((x) => x.id === templateId);
  if (!p || !t) return "Proyecto no disponible";
  if (p.projects.length >= maxProjects(p)) return "No hay capacidad: espera que termine un proyecto";
  if (p.projects.some((x) => x.templateId === t.id)) return "Ya está en desarrollo";
  if (t.area === "powerUnit" && m.regs?.puFreeze) return "Motores congelados por reglamento";
  if (p.budget < t.cost) return "Presupuesto insuficiente";
  return capCheck(m, t.cost);
}

export function startProject(m: ManagementState, templateId: string, round: number): ManagementState {
  if (canStartProject(m, templateId)) return m;
  const p = m.player!;
  const t = PROJECTS.find((x) => x.id === templateId)!;
  const races = projectRaces(t, p);
  return {
    ...m,
    nextUid: m.nextUid + 1,
    player: {
      ...p,
      budget: +(p.budget - t.cost).toFixed(2),
      projects: [...p.projects, { uid: `p${m.nextUid}`, templateId: t.id, area: t.area, name: t.name, racesLeft: races, totalRaces: races }],
      ledger: [...p.ledger, { race: round, concept: `I+D: ${t.name}`, amount: -t.cost, category: "rnd" }],
    },
  };
}

export function canUpgradeFacility(m: ManagementState, key: FacilityKey): string | null {
  const p = m.player;
  if (!p) return "Sin equipo";
  const lvl = p.facilities[key];
  if (lvl >= MAX_FACILITY_LEVEL) return "Nivel máximo";
  if (p.facilityWork) return "Ya hay una obra en curso";
  if (p.budget < facilityUpgradeCost(lvl)) return "Presupuesto insuficiente";
  return capCheck(m, facilityUpgradeCost(lvl));
}

export function upgradeFacility(m: ManagementState, key: FacilityKey, round: number): ManagementState {
  if (canUpgradeFacility(m, key)) return m;
  const p = m.player!;
  const cost = facilityUpgradeCost(p.facilities[key]);
  return {
    ...m,
    player: {
      ...p,
      budget: +(p.budget - cost).toFixed(2),
      facilityWork: { key, racesLeft: facilityBuildRaces(p.facilities[key]) },
      ledger: [...p.ledger, { race: round, concept: `Obra: ${FACILITY_INFO[key].label} nivel ${p.facilities[key] + 1}`, amount: -cost, category: "facilities" }],
    },
  };
}

// --- Sponsors ---------------------------------------------------------------
export function carRankOf(m: ManagementState, teamId: string) {
  const ids = Object.keys(m.dev);
  return 1 + ids.filter((id) => carPace(m.dev[id]) > carPace(m.dev[teamId])).length;
}

export function canSignSponsor(m: ManagementState, offerId: string): string | null {
  const p = m.player;
  const o = p?.offers.find((x) => x.id === offerId);
  if (!p || !o) return "Oferta no disponible";
  if (p.sponsors.filter((s) => s.slot === o.slot).length >= SLOT_INFO[o.slot].count) return "Espacio ocupado";
  if (o.minRank !== null && carRankOf(m, p.teamId) > o.minRank) return `Requiere auto top ${o.minRank}`;
  return null;
}

export function signSponsor(m: ManagementState, offerId: string, round: number): ManagementState {
  if (canSignSponsor(m, offerId)) return m;
  const p = m.player!;
  const o = p.offers.find((x) => x.id === offerId)!;
  const ledger = o.signing > 0 ? [{ race: round, concept: `${o.name}: prima por firma`, amount: o.signing, category: "sponsor" as const }] : [];
  return {
    ...m,
    player: {
      ...p,
      budget: +(p.budget + o.signing).toFixed(2),
      sponsors: [...p.sponsors, { ...o, earned: o.signing }],
      offers: p.offers.filter((x) => x.id !== offerId),
      ledger: [...p.ledger, ...ledger],
    },
    inbox: [...m.inbox, { race: round, tone: "good" as const, text: `Firmaste con ${o.name} por ${o.duration} carreras.` }].slice(-60),
  };
}

function refreshSlotOffers(m: ManagementState, p: PlayerEconomy, slot: SponsorSlot, round: number, rng: Rng, teams: Team[]): PlayerEconomy {
  const team = teams.find((t) => t.id === p.teamId)!;
  const used = new Set([...p.sponsors.map((s) => s.name), ...p.offers.map((s) => s.name)]);
  const fresh = generateOffers(rng, {
    slot,
    count: slot === "principal" ? 3 : 4,
    pace: team.pace,
    carRank: carRankOf(m, p.teamId),
    racesLeftInSeason: Math.max(1, races2026.length - round),
    usedNames: used,
    uidStart: m.nextUid + round * 20 + (slot === "principal" ? 0 : 10),
  });
  return { ...p, offers: [...p.offers.filter((o) => o.slot !== slot), ...fresh] };
}

function applyGain(d: CarDev, area: DevArea, gain: number): CarDev {
  return { ...d, [area]: Math.min(99.5, +(d[area] + gain).toFixed(2)) };
}

/** AI teams develop a little every race, proportional to their budget. */
function developAi(m: ManagementState, teams: Team[], rng: Rng): Record<string, CarDev> {
  const dev = { ...m.dev };
  for (const t of teams) {
    if (t.id === m.player?.teamId) continue;
    const d = dev[t.id];
    if (!d) continue;
    const cap = m.regs?.budgetCap;
    const budget = Math.min(m.aiBudget[t.id] ?? 40, cap ? cap * 0.8 : Infinity);
    const budgetFactor = (budget / 45) * tdMult(m.staffRatings?.[t.id]?.td);
    let next = d;
    // ~1.6 projects' worth of gains per race spread over areas
    for (const area of ["aero", "powerUnit", "chassis"] as DevArea[]) {
      if (rng.chance(0.42) && !(area === "powerUnit" && m.regs?.puFreeze)) {
        const g = (0.6 + rng.next() * 1.2) * budgetFactor * diminishing(next[area]) * 0.28;
        next = applyGain(next, area, g);
      }
    }
    if (rng.chance(0.2)) next = applyGain(next, "reliability", (1 + rng.next() * 2) * diminishing(next.reliability) * 0.6);
    if (rng.chance(0.15)) next = applyGain(next, "pitCrew", (0.5 + rng.next() * 1.5) * diminishing(next.pitCrew) * 0.6);
    dev[t.id] = next;
  }
  return dev;
}

/**
 * Close a race weekend: money in/out, project and construction progress, AI development.
 * `round` is the 1-based number of the race just completed.
 */
export function processRaceWeekend(
  m: ManagementState,
  teams: Team[],
  rows: ClassifiedRow[],
  round: number,
  pole?: string,
  payrollPerSeason?: number,
): ManagementState {
  const rng = createRng(m.rngState);
  const inbox: InboxMessage[] = [];
  let dev = developAi(m, teams, rng);
  let player = m.player;

  if (player) {
    const myRows = rows.filter((r) => r.teamId === player!.teamId);
    const points = myRows.reduce((a, r) => a + r.points, 0);
    const dnfs = myRows.filter((r) => r.status === "dnf");
    const crashes = dnfs.filter((r) => (r.dnfReason ?? "").toLowerCase().includes("accidente")).length;
    const outcome: RaceOutcome = {
      points,
      podiums: myRows.filter((r) => r.status === "finished" && r.position <= 3).length,
      wins: myRows.filter((r) => r.status === "finished" && r.position === 1).length,
      pole: !!pole && myRows.some((r) => r.driverId === pole),
      dnfs: dnfs.length,
    };
    const ledger: LedgerEntry[] = [];
    ledger.push({ race: round, concept: "Derechos comerciales y TV", amount: tvRights(carRankOf(m, player.teamId)), category: "tv" });
    // sponsors pay and count down
    const sponsors: SponsorDeal[] = [];
    const expiredSlots = new Set<SponsorSlot>();
    for (const sp of player.sponsors) {
      const lines = sponsorPayout(sp, outcome);
      const tpK = tpSponsorMult(m.staffRatings?.[player.teamId]?.tp);
      lines.forEach((l, li) =>
        ledger.push({ race: round, concept: l.concept, amount: li === 0 ? +(l.amount * tpK).toFixed(2) : l.amount, category: "sponsor" }),
      );
      const paid = lines.reduce((a, l) => a + l.amount, 0);
      const left = sp.racesLeft - 1;
      if (left <= 0) {
        expiredSlots.add(sp.slot);
        inbox.push({ race: round, tone: "info", text: `Terminó el contrato con ${sp.name} (pagó US$ ${(sp.earned + paid).toFixed(1)} M en total). Hay nuevas ofertas.` });
      } else sponsors.push({ ...sp, racesLeft: left, earned: +(sp.earned + paid).toFixed(2) });
    }
    if (points > 0) ledger.push({ race: round, concept: `Premio por puntos (${points} pts)`, amount: +(points * PRIZE_PER_POINT).toFixed(2), category: "prize" });
    ledger.push({ race: round, concept: "Logística y viajes", amount: -logisticsCost(round), category: "logistics" });
    ledger.push({ race: round, concept: "Personal de carrera", amount: -STAFF_COST, category: "staff" });
    ledger.push({ race: round, concept: "Componentes y neumáticos", amount: -PARTS_COST, category: "parts" });
    if (payrollPerSeason !== undefined) {
      const fund = player.salaryFund ?? payrollPerSeason;
      ledger.push({ race: round, concept: "Aporte de los dueños para sueldos", amount: +(fund / races2026.length).toFixed(2), category: "owners" });
      ledger.push({ race: round, concept: "Sueldos de pilotos y dirección", amount: -(payrollPerSeason / races2026.length).toFixed(2), category: "salaries" });
    }
    if (crashes > 0) {
      ledger.push({ race: round, concept: `Reparación por accidente${crashes > 1 ? "s" : ""}`, amount: -CRASH_REPAIR * crashes, category: "repairs" });
      inbox.push({ race: round, tone: "bad", text: `Reparar el auto accidentado cuesta US$ ${(CRASH_REPAIR * crashes).toFixed(1)} M.` });
    }
    player = { ...player, sponsors };
    const delta = ledger.reduce((a, l) => a + l.amount, 0);

    // projects
    const remaining: ActiveProject[] = [];
    let myDev = dev[player.teamId];
    for (const pr of player.projects) {
      const left = pr.racesLeft - 1;
      if (left > 0) {
        remaining.push({ ...pr, racesLeft: left });
        continue;
      }
      const t = PROJECTS.find((x) => x.id === pr.templateId)!;
      const k =
        facilityMult(player.facilities[AREA_INFO[t.area].facility]) * diminishing(myDev[t.area]) * partMult(player, t.id) *
        tdMult(m.staffRatings?.[player.teamId]?.td);
      const success = rng.chance(successChance(t, { ...m, player }));
      player = { ...player, partLevels: { ...(player.partLevels ?? {}), [t.id]: (player.partLevels?.[t.id] ?? 0) + 1 } };
      const raw = t.gain[0] + rng.next() * (t.gain[1] - t.gain[0]);
      const gain = +(raw * k * (success ? 1 : 0.3)).toFixed(2);
      myDev = applyGain(myDev, t.area, gain);
      inbox.push({
        race: round,
        tone: success ? "good" : "bad",
        text: success
          ? `${t.name} listo: ${AREA_INFO[t.area].label} +${gain.toFixed(1)}.`
          : `${t.name} no rindió lo esperado: solo +${gain.toFixed(1)} en ${AREA_INFO[t.area].label.toLowerCase()}.`,
      });
    }
    dev = { ...dev, [player.teamId]: myDev };

    // facility construction
    let facilities = player.facilities;
    let facilityWork = player.facilityWork;
    if (facilityWork) {
      const left = facilityWork.racesLeft - 1;
      if (left <= 0) {
        facilities = { ...facilities, [facilityWork.key]: facilities[facilityWork.key] + 1 };
        inbox.push({ race: round, tone: "good", text: `${FACILITY_INFO[facilityWork.key].label} mejorado a nivel ${facilities[facilityWork.key]}.` });
        facilityWork = null;
      } else facilityWork = { ...facilityWork, racesLeft: left };
    }

    const budget = +(player.budget + delta).toFixed(2);
    if (budget < 0) inbox.push({ race: round, tone: "bad", text: "Estás en números rojos: no podrás iniciar proyectos hasta recuperar presupuesto." });
    player = { ...player, budget, projects: remaining, facilities, facilityWork, ledger: [...player.ledger, ...ledger] };

    // sponsorship market: new offers when a contract ends, and a full refresh every 6 rounds
    const refresh = round % 6 === 0 ? (["principal", "secundario"] as SponsorSlot[]) : [...expiredSlots];
    const mNow = { ...m, dev };
    for (const slot of refresh) player = refreshSlotOffers(mNow, player, slot, round, rng, teams);
    if (round % 6 === 0 && round < races2026.length) inbox.push({ race: round, tone: "info", text: "Nuevas ofertas de patrocinio disponibles." });
  }

  return {
    ...m,
    dev,
    player,
    inbox: [...m.inbox, ...inbox].slice(-60),
    rngState: rng.state(),
    history: [...(m.history ?? []), { round, dev: structuredClone(dev) }],
  };
}

/** Rough per-race balance with the current contracts (no bonuses or prizes). */
export function baseRaceBalance(m: ManagementState, round: number, payrollPerSeason = 0) {
  const p = m.player!;
  const n = races2026.length;
  const income = tvRights(carRankOf(m, p.teamId)) + p.sponsors.reduce((a, s) => a + s.base, 0) + (p.salaryFund ?? payrollPerSeason) / n;
  return { income, costs: raceRunningCost(Math.max(1, round)) + payrollPerSeason / n };
}

/** One-off expense or income outside a race weekend (signing fees, severance...). */
export function chargePlayer(m: ManagementState, round: number, concept: string, amount: number, category: LedgerCategory, text?: string): ManagementState {
  const p = m.player;
  if (!p || amount === 0) return m;
  return {
    ...m,
    player: { ...p, budget: +(p.budget + amount).toFixed(2), ledger: [...p.ledger, { race: round, concept, amount: +amount.toFixed(2), category }] },
    inbox: text ? [...m.inbox, { race: round, tone: "info" as const, text }].slice(-60) : m.inbox,
  };
}

// --- Seasons -----------------------------------------------------------------

/** Prize money from the constructors' championship, paid when the next season starts. */
export const constructorsPrize = (pos: number, flat = false) =>
  Math.round(flat ? 18 + (11 - Math.min(11, pos)) * 1.25 : 10 + (11 - Math.min(11, pos)) * 2.5);

export interface SeasonFinance {
  income: number;
  expenses: number;
  investments: number;
}

export function seasonFinance(p: PlayerEconomy): SeasonFinance {
  let income = 0, expenses = 0, investments = 0;
  for (const l of p.ledger) {
    const c = ledgerCategory(l);
    if (c === "initial") continue;
    if (isInvestment(c)) investments -= l.amount;
    else if (l.amount >= 0) income += l.amount;
    else expenses -= l.amount;
  }
  return { income: +income.toFixed(1), expenses: +expenses.toFixed(1), investments: +investments.toFixed(1) };
}

/**
 * Start a new season: prize money by constructors' position, budgets for the AI,
 * a small convergence of the field (rules stability), fresh sponsor offers.
 * Projects, part levels, facility works and sponsor contracts carry over.
 */
export function startNewSeason(m: ManagementState, teams: Team[], constructorsOrder: string[], season: number): ManagementState {
  const rng = createRng(m.rngState ^ season);
  const ids = Object.keys(m.dev);
  const mean = (k: keyof CarDev) => ids.reduce((a, id) => a + m.dev[id][k], 0) / ids.length;
  const means = { aero: mean("aero"), powerUnit: mean("powerUnit"), chassis: mean("chassis") };
  const dev: Record<string, CarDev> = {};
  for (const id of ids) {
    const d = m.dev[id];
    const conv = (k: "aero" | "powerUnit" | "chassis") => +(d[k] + (means[k] - d[k]) * 0.12).toFixed(2);
    dev[id] = { ...d, aero: conv("aero"), powerUnit: conv("powerUnit"), chassis: conv("chassis") };
  }
  const posOf = (id: string) => {
    const i = constructorsOrder.indexOf(id);
    return i < 0 ? 11 : i + 1;
  };
  const aiBudget: Record<string, number> = {};
  for (const id of ids) aiBudget[id] = startBudget(carPace(dev[id])) + Math.round(constructorsPrize(posOf(id), m.regs?.flatPrize) * 0.3);
  let player = m.player;
  const inbox: InboxMessage[] = [{ race: 0, tone: "info", text: `Comienza la temporada ${season}. Las diferencias entre autos se reducen un poco con la estabilidad del reglamento.` }];
  let nm: ManagementState = { ...m, dev, aiBudget, nextUid: m.nextUid + 1000 };
  if (player) {
    const pos = posOf(player.teamId);
    const prize = constructorsPrize(pos, m.regs?.flatPrize);
    const fin = seasonFinance(player);
    inbox.push({ race: 0, tone: "good", text: `Premio del campeonato de constructores ${season - 1} (P${pos}): US$ ${prize} M.` });
    player = {
      ...player,
      budget: +(player.budget + prize).toFixed(2),
      ledger: [
        { race: 0, concept: `Saldo de la temporada ${season - 1}`, amount: player.budget, category: "initial" },
        { race: 0, concept: `Premio constructores ${season - 1} (P${pos})`, amount: prize, category: "prize" },
      ],
    };
    nm = { ...nm, player };
    for (const slot of ["principal", "secundario"] as SponsorSlot[]) player = refreshSlotOffers(nm, player, slot, 0, rng, applyDevToTeams(teams, nm));
    inbox.push({ race: 0, tone: "info", text: `Temporada ${season - 1}: ingresos US$ ${fin.income} M, gastos US$ ${fin.expenses} M, inversión US$ ${fin.investments} M.` });
  }
  return { ...nm, player, inbox: [...m.inbox, ...inbox].slice(-60), rngState: rng.state(), history: [{ round: -1, dev: structuredClone(m.dev) }, { round: 0, dev: structuredClone(dev) }] };
}

/** Field ranking (1 = best) of a team in each area. */
export function areaRanks(m: ManagementState, teamId: string): Record<DevArea | "pace", number> {
  const ids = Object.keys(m.dev);
  const rank = (val: (d: CarDev) => number) => 1 + ids.filter((id) => val(m.dev[id]) > val(m.dev[teamId])).length;
  return {
    pace: rank(carPace),
    aero: rank((d) => d.aero),
    powerUnit: rank((d) => d.powerUnit),
    chassis: rank((d) => d.chassis),
    reliability: rank((d) => d.reliability),
    pitCrew: rank((d) => d.pitCrew),
  };
}

// --- Regulation impact ---------------------------------------------------------

export type RegImpact = Record<string, Partial<Record<"aero" | "powerUnit" | "chassis", number>>>;

/**
 * New technical rules reshuffle an area of every car: the gaps shrink to ~45% and
 * each team lands a bit higher or lower depending on luck, its technical director and
 * (for the player) the facility of that area. A new budget cap trims the front-runners.
 * Returns the new state and the change of each team per area.
 */
export function applyRegulationImpact(
  m: ManagementState,
  effects: ("aero" | "powerUnit" | "chassis")[],
  newBudgetCap: boolean,
  seed: number,
): { m: ManagementState; impact: RegImpact } {
  if (!effects.length && !newBudgetCap) return { m, impact: {} };
  const rng = createRng(seed);
  const ids = Object.keys(m.dev);
  const dev: Record<string, CarDev> = Object.fromEntries(ids.map((id) => [id, { ...m.dev[id] }]));
  const impact: RegImpact = {};
  const note = (id: string, a: "aero" | "powerUnit" | "chassis", d: number) => {
    impact[id] ??= {};
    impact[id][a] = +((impact[id][a] ?? 0) + d).toFixed(2);
  };
  const facilityOf: Record<string, FacilityKey> = { aero: "windTunnel", powerUnit: "dyno", chassis: "factory" };
  for (const a of effects) {
    const mean = ids.reduce((acc, id) => acc + dev[id][a], 0) / ids.length;
    for (const id of ids) {
      const td = m.staffRatings?.[id]?.td ?? 80;
      const fac = id === m.player?.teamId ? (m.player.facilities[facilityOf[a]] - 3) * 0.6 : 0;
      const v = mean + (dev[id][a] - mean) * 0.45 + (rng.next() - 0.5) * 4 + (tdMult(td) - 1) * 6 + fac;
      const nv = Math.max(70, Math.min(99, +v.toFixed(2)));
      note(id, a, nv - dev[id][a]);
      dev[id][a] = nv;
    }
  }
  if (newBudgetCap) {
    for (const a of ["aero", "powerUnit", "chassis"] as const) {
      const mean = ids.reduce((acc, id) => acc + dev[id][a], 0) / ids.length;
      for (const id of ids) {
        if (dev[id][a] <= mean) continue;
        const d = -(dev[id][a] - mean) * 0.2;
        note(id, a, d);
        dev[id][a] = +(dev[id][a] + d).toFixed(2);
      }
    }
  }
  // parts of a reshuffled area are obsolete
  let player = m.player;
  if (player && effects.length) {
    const levels = { ...(player.partLevels ?? {}) };
    for (const t of PROJECTS) if ((effects as string[]).includes(t.area)) delete levels[t.id];
    player = { ...player, partLevels: levels };
  }
  return { m: { ...m, dev, player, history: [...(m.history ?? []).filter((h) => h.round < 0), { round: 0, dev: structuredClone(dev) }] }, impact };
}
