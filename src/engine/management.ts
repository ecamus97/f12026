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

export const PROJECTS: ProjectTemplate[] = [
  { id: "aero-s", area: "aero", name: "Actualización de alerones", cost: 4, races: 2, gain: [1.5, 3], success: 0.85 },
  { id: "aero-l", area: "aero", name: "Nuevo paquete aerodinámico", cost: 11, races: 4, gain: [3.5, 6], success: 0.7 },
  { id: "pu-s", area: "powerUnit", name: "Mapas de motor y ERS", cost: 4, races: 2, gain: [1.5, 3], success: 0.85 },
  { id: "pu-l", area: "powerUnit", name: "Evolución de la unidad de potencia", cost: 12, races: 5, gain: [4, 7], success: 0.65 },
  { id: "ch-s", area: "chassis", name: "Ajustes de suspensión", cost: 3.5, races: 2, gain: [1.5, 3], success: 0.85 },
  { id: "ch-l", area: "chassis", name: "Chasis aligerado", cost: 10, races: 4, gain: [3.5, 5.5], success: 0.7 },
  { id: "rel", area: "reliability", name: "Programa de fiabilidad", cost: 3, races: 2, gain: [2, 4], success: 0.9 },
  { id: "pit", area: "pitCrew", name: "Entrenamiento del pit crew", cost: 1.5, races: 1, gain: [1, 2.5], success: 0.9 },
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
  | "initial" | "tv" | "sponsor" | "prize" | "logistics" | "staff" | "parts" | "operations" | "repairs" | "rnd" | "facilities";

export const CATEGORY_INFO: Record<LedgerCategory, { label: string; kind: "income" | "expense" }> = {
  initial: { label: "Presupuesto inicial", kind: "income" },
  tv: { label: "Derechos comerciales y TV", kind: "income" },
  sponsor: { label: "Patrocinadores", kind: "income" },
  prize: { label: "Premios por puntos", kind: "income" },
  logistics: { label: "Logística y viajes", kind: "expense" },
  staff: { label: "Personal de carrera", kind: "expense" },
  parts: { label: "Componentes y neumáticos", kind: "expense" },
  operations: { label: "Operación del fin de semana", kind: "expense" },
  repairs: { label: "Reparaciones", kind: "expense" },
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
export const isInvestment = (cat: LedgerCategory) => cat === "rnd" || cat === "facilities";

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
}

// --- Economy constants -------------------------------------------------------
export const CRASH_REPAIR = 1.5; // M USD per accident
export const PRIZE_PER_POINT = 0.12; // M USD
export const STAFF_COST = 1.2;
export const PARTS_COST = 0.7;
const EUROPE = new Set(["Monaco", "Spain", "Austria", "Great Britain", "Belgium", "Hungary", "Netherlands", "Italy", "Azerbaijan"]);
/** Logistics depend on where the race is: European rounds are cheaper than fly-aways. */
export const logisticsCost = (round: number) => (EUROPE.has(races2026[round - 1]?.country ?? "") ? 0.8 : 1.4);
export const raceRunningCost = (round: number) => logisticsCost(round) + STAFF_COST + PARTS_COST;
export const facilityUpgradeCost = (level: number) => 6 + level * 5; // to go from level -> level+1
export const FACILITY_BUILD_RACES = 3;

/** Starting development budget (M USD) by car rating: big teams have more money. */
export const startBudget = (pace: number) => Math.round(30 + (pace - 78) * 1.8);
const startFacility = (pace: number) => (pace >= 92 ? 4 : pace >= 85 ? 3 : 2);

export function initManagement(teams: Team[], playerTeamId: string | null, seed: number): ManagementState {
  const rng = createRng(seed);
  const dev: Record<string, CarDev> = {};
  const aiBudget: Record<string, number> = {};
  for (const t of teams) {
    dev[t.id] = { aero: t.pace, powerUnit: t.pace, chassis: t.pace, reliability: t.reliability, pitCrew: t.pitCrew };
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
    return { ...t, pace: carPace(d), reliability: +d.reliability.toFixed(1), pitCrew: +d.pitCrew.toFixed(1) };
  });
}

/** Rating points are harder to find the better the car already is. */
const diminishing = (current: number) => Math.max(0.25, Math.min(1.2, (100 - current) / 15));

export function maxProjects(p: PlayerEconomy) {
  return 2 + (p.facilities.factory >= 3 ? 1 : 0);
}

export function projectRaces(t: ProjectTemplate, p: PlayerEconomy) {
  return Math.max(1, t.races - (p.facilities.factory >= 5 ? 1 : 0));
}

/** Facility multiplier for an area: level 1 = 0.8x ... level 5 = 1.2x */
export const facilityMult = (level: number) => 0.7 + level * 0.1;

/** Expected gain range shown in the UI (after facilities and diminishing returns). */
export function expectedGain(t: ProjectTemplate, m: ManagementState): [number, number] {
  const p = m.player!;
  const current = m.dev[p.teamId][t.area];
  const k = facilityMult(p.facilities[AREA_INFO[t.area].facility]) * diminishing(current);
  return [+(t.gain[0] * k).toFixed(1), +(t.gain[1] * k).toFixed(1)];
}

export function canStartProject(m: ManagementState, templateId: string): string | null {
  const p = m.player;
  const t = PROJECTS.find((x) => x.id === templateId);
  if (!p || !t) return "Proyecto no disponible";
  if (p.projects.length >= maxProjects(p)) return "No hay capacidad: espera que termine un proyecto";
  if (p.projects.some((x) => x.templateId === t.id)) return "Ya está en desarrollo";
  if (p.budget < t.cost) return "Presupuesto insuficiente";
  return null;
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
  return null;
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
      facilityWork: { key, racesLeft: FACILITY_BUILD_RACES },
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
    const budgetFactor = (m.aiBudget[t.id] ?? 40) / 45;
    let next = d;
    // ~1.6 projects' worth of gains per race spread over areas
    for (const area of ["aero", "powerUnit", "chassis"] as DevArea[]) {
      if (rng.chance(0.42)) {
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
      lines.forEach((l) => ledger.push({ race: round, concept: l.concept, amount: l.amount, category: "sponsor" }));
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
      const k = facilityMult(player.facilities[AREA_INFO[t.area].facility]) * diminishing(myDev[t.area]);
      const success = rng.chance(Math.min(0.97, t.success + (player.facilities[AREA_INFO[t.area].facility] - 3) * 0.04));
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
export function baseRaceBalance(m: ManagementState, round: number) {
  const p = m.player!;
  const income = tvRights(carRankOf(m, p.teamId)) + p.sponsors.reduce((a, s) => a + s.base, 0);
  return { income, costs: raceRunningCost(Math.max(1, round)) };
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
