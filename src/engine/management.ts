// Team management: budget, R&D projects, facilities and AI development.
// Pure functions over a serialisable ManagementState.
import type { Team } from "@/data/f1Data";
import { createRng, type Rng } from "./rng";
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

export interface LedgerEntry {
  race: number; // round number (1-24), 0 = pre-season
  concept: string;
  amount: number; // + income, - expense (M USD)
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
}

export interface ManagementState {
  version: 1;
  dev: Record<string, CarDev>; // every team
  aiBudget: Record<string, number>;
  player: PlayerEconomy | null;
  inbox: InboxMessage[];
  rngState: number;
  nextUid: number;
}

// --- Economy constants -------------------------------------------------------
export const RACE_OPERATIONS = 3.2; // M USD per race weekend
export const CRASH_REPAIR = 1.5; // M USD per accident
export const PRIZE_PER_POINT = 0.12; // M USD
export const facilityUpgradeCost = (level: number) => 6 + level * 5; // to go from level -> level+1
export const FACILITY_BUILD_RACES = 3;

/** Starting development budget (M USD) by car rating: big teams have more money. */
export const startBudget = (pace: number) => Math.round(30 + (pace - 78) * 1.8);
/** Sponsor income per race (M USD). */
export const sponsorIncome = (teamPace: number) => +(2.8 + (teamPace - 78) * 0.13).toFixed(2);
const startFacility = (pace: number) => (pace >= 92 ? 4 : pace >= 85 ? 3 : 2);

export function initManagement(teams: Team[], playerTeamId: string | null, seed: number): ManagementState {
  const dev: Record<string, CarDev> = {};
  const aiBudget: Record<string, number> = {};
  for (const t of teams) {
    dev[t.id] = { aero: t.pace, powerUnit: t.pace, chassis: t.pace, reliability: t.reliability, pitCrew: t.pitCrew };
    aiBudget[t.id] = startBudget(t.pace);
  }
  const pt = teams.find((t) => t.id === playerTeamId);
  const lvl = pt ? startFacility(pt.pace) : 2;
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
          ledger: [{ race: 0, concept: "Presupuesto de desarrollo inicial", amount: startBudget(pt.pace) }],
        }
      : null,
    inbox: pt
      ? [{ race: 0, tone: "info", text: `Bienvenido a ${pt.name}. Tienes US$ ${startBudget(pt.pace)} M para desarrollar el auto esta temporada.` }]
      : [],
    rngState: seed,
    nextUid: 1,
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
      ledger: [...p.ledger, { race: round, concept: `I+D: ${t.name}`, amount: -t.cost }],
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
      ledger: [...p.ledger, { race: round, concept: `Obra: ${FACILITY_INFO[key].label} nivel ${p.facilities[key] + 1}`, amount: -cost }],
    },
  };
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
): ManagementState {
  const rng = createRng(m.rngState);
  const inbox: InboxMessage[] = [];
  let dev = developAi(m, teams, rng);
  let player = m.player;

  if (player) {
    const team = teams.find((t) => t.id === player!.teamId)!;
    const myRows = rows.filter((r) => r.teamId === player!.teamId);
    const points = myRows.reduce((a, r) => a + r.points, 0);
    const crashes = myRows.filter((r) => r.status === "dnf" && (r.dnfReason ?? "").toLowerCase().includes("accidente")).length;
    const ledger: LedgerEntry[] = [];
    const sponsor = sponsorIncome(team.pace);
    ledger.push({ race: round, concept: "Patrocinadores", amount: sponsor });
    if (points > 0) ledger.push({ race: round, concept: `Premio por puntos (${points} pts)`, amount: +(points * PRIZE_PER_POINT).toFixed(2) });
    ledger.push({ race: round, concept: "Operación del fin de semana", amount: -RACE_OPERATIONS });
    if (crashes > 0) {
      ledger.push({ race: round, concept: `Reparación por accidente${crashes > 1 ? "s" : ""}`, amount: -CRASH_REPAIR * crashes });
      inbox.push({ race: round, tone: "bad", text: `Reparar el auto accidentado cuesta US$ ${(CRASH_REPAIR * crashes).toFixed(1)} M.` });
    }
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
  }

  return {
    ...m,
    dev,
    player,
    inbox: [...m.inbox, ...inbox].slice(-60),
    rngState: rng.state(),
  };
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
