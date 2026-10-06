// Sporting & technical regulations that can change from one season to the next:
// some are imposed by the FIA, others are voted by the team principals.
import { createRng } from "./rng";
import { ALL_RACES, freeSlot, raceById, sortByDate } from "@/data/calendar";
import type { Race } from "@/data/f1Data";
import type { ClassifiedRow } from "./types";

export interface RuleSet {
  points: "top10" | "top12";
  fastestLapPoint: boolean;
  twoCompound: boolean;
  overtakeAid: boolean; // boosted overtaking mode
  highDegTyres: boolean;
  budgetCap: number | null; // M USD per season on R&D + facilities
  salaryCap: number | null; // M USD per driver per season
  puFreeze: boolean; // no power unit development
  flatPrize: boolean; // prize money shared more equally
}

export const DEFAULT_RULES: RuleSet = {
  points: "top10",
  fastestLapPoint: false,
  twoCompound: true,
  overtakeAid: false,
  highDegTyres: false,
  budgetCap: null,
  salaryCap: null,
  puFreeze: false,
  flatPrize: false,
};

export const POINTS_TABLES: Record<RuleSet["points"], number[]> = {
  top10: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
  top12: [25, 20, 16, 13, 11, 9, 7, 5, 4, 3, 2, 1],
};

/** Human-readable list of the rules in force. */
export function describeRules(r: RuleSet): { label: string; value: string; changed: boolean }[] {
  const d = DEFAULT_RULES;
  return [
    { label: "Sistema de puntos", value: r.points === "top10" ? "Top 10 (25-18-15…1)" : "Top 12 (25-20-16…1)", changed: r.points !== d.points },
    { label: "Punto por vuelta rápida", value: r.fastestLapPoint ? "Sí (si termina en el top 10)" : "No", changed: r.fastestLapPoint !== d.fastestLapPoint },
    { label: "Dos compuestos obligatorios", value: r.twoCompound ? "Sí" : "No", changed: r.twoCompound !== d.twoCompound },
    { label: "Modo adelantamiento reforzado", value: r.overtakeAid ? "Activo" : "No", changed: r.overtakeAid !== d.overtakeAid },
    { label: "Neumáticos", value: r.highDegTyres ? "Alta degradación" : "Estándar", changed: r.highDegTyres !== d.highDegTyres },
    { label: "Límite presupuestario (I+D e instalaciones)", value: r.budgetCap ? `US$ ${r.budgetCap} M por temporada` : "Sin límite", changed: r.budgetCap !== d.budgetCap },
    { label: "Tope salarial por piloto", value: r.salaryCap ? `US$ ${r.salaryCap} M por año` : "Sin tope", changed: r.salaryCap !== d.salaryCap },
    { label: "Desarrollo de motores", value: r.puFreeze ? "Congelado" : "Libre", changed: r.puFreeze !== d.puFreeze },
    { label: "Reparto de premios", value: r.flatPrize ? "Más equitativo" : "Por posición", changed: r.flatPrize !== d.flatPrize },
  ];
}

// --- Proposals ---------------------------------------------------------------

export type Vote = "for" | "against" | "abstain";
/** Technical regulation changes that reshuffle one area of every car. */
export type TechEffect = "aero" | "powerUnit" | "chassis";
export type ProposalStatus = "pending" | "approved" | "rejected" | "decreed";

export interface RuleProposal {
  id: string;
  season: number; // season in which it is discussed
  effective: number; // season in which it applies
  round: number; // announced after this round
  key: string;
  patch: Partial<RuleSet>;
  title: string;
  desc: string;
  by: "fia" | "vote";
  status: ProposalStatus;
  effect?: TechEffect; // one-off impact on every car when it comes into force
  calendar?: { op: "add" | "remove" | "swap"; add?: number; remove?: number }; // calendar change for next season
  mega?: boolean; // a new generation of cars: the whole order is reshuffled
  votes?: Record<string, Vote>;
  playerVote?: Vote;
}

/** What a team knows about itself when deciding a vote. */
export interface TeamContext {
  teamId: string;
  carRank: number; // 1 = best car
  puRank: number;
  aeroRank?: number;
  chassisRank?: number;
  driverPayroll: number; // M USD
  teams: number;
}

interface Template {
  key: string;
  fiaOk: boolean; // can be imposed by the FIA
  voteOk: boolean;
  available: (r: RuleSet) => boolean;
  make: (r: RuleSet) => { patch: Partial<RuleSet>; title: string; desc: string; effect?: TechEffect };
  /** >0 the team likes it, <0 it doesn't (roughly -1..1). */
  interest: (c: TeamContext, p: Partial<RuleSet>) => number;
}

const mid = (c: TeamContext) => (c.teams + 1) / 2;
/** +1 for the backmarkers, -1 for the front-runners. */
const underdog = (c: TeamContext) => Math.max(-1, Math.min(1, (c.carRank - mid(c)) / (mid(c) - 1)));

/** +1 for teams that are behind in an area (they want a reset), -1 for the leaders. */
const behindIn = (c: TeamContext, rank?: number) => Math.max(-1, Math.min(1, ((rank ?? mid(c)) - mid(c)) / (mid(c) - 1)));

const TEMPLATES: Template[] = [
  {
    key: "aeroRegs",
    fiaOk: true,
    voteOk: true,
    available: () => true,
    make: () => ({
      patch: {},
      effect: "aero",
      title: "Nuevo reglamento aerodinámico",
      desc: "Cambian las reglas de alerones y fondo: las diferencias de aerodinámica se reducen a menos de la mitad y el orden puede cambiar. Las piezas aerodinámicas desarrolladas quedan obsoletas.",
    }),
    interest: (c) => behindIn(c, c.aeroRank),
  },
  {
    key: "puRegs",
    fiaOk: true,
    voteOk: true,
    available: () => true,
    make: () => ({
      patch: {},
      effect: "powerUnit",
      title: "Nueva fórmula de motores",
      desc: "Más energía eléctrica y nuevo combustible: las diferencias entre motores se reducen a menos de la mitad y el orden puede cambiar. Las mejoras de motor quedan obsoletas.",
    }),
    interest: (c) => behindIn(c, c.puRank),
  },
  {
    key: "chassisRegs",
    fiaOk: true,
    voteOk: true,
    available: () => true,
    make: () => ({
      patch: {},
      effect: "chassis",
      title: "Autos más cortos y livianos",
      desc: "Nuevas medidas y peso mínimo: las diferencias de chasis se reducen a menos de la mitad y el orden puede cambiar. Las mejoras de chasis quedan obsoletas.",
    }),
    interest: (c) => behindIn(c, c.chassisRank),
  },
  {
    key: "budgetCap",
    fiaOk: true,
    voteOk: true,
    available: () => true,
    make: (r) => {
      if (r.budgetCap === null) {
        return {
          patch: { budgetCap: 60 },
          title: "Límite presupuestario de US$ 60 M",
          desc: "Cada equipo podrá gastar como máximo US$ 60 M por temporada en I+D e instalaciones. Al entrar en vigor, los autos por encima del promedio pierden parte de su ventaja.",
        };
      }
      if (r.budgetCap > 40) {
        return {
          patch: { budgetCap: r.budgetCap - 10 },
          title: `Bajar el límite presupuestario a US$ ${r.budgetCap - 10} M`,
          desc: "Un límite más estricto acerca a los equipos (los de adelante pierden parte de su ventaja al entrar en vigor) y hace más lento el desarrollo de todos.",
        };
      }
      return { patch: { budgetCap: null }, title: "Eliminar el límite presupuestario", desc: "Cada equipo vuelve a gastar lo que pueda. Favorece a los ricos." };
    },
    interest: (c, p) => (p.budgetCap === null ? -1 : 1) * underdog(c),
  },
  {
    key: "points",
    fiaOk: false,
    voteOk: true,
    available: () => true,
    make: (r) =>
      r.points === "top10"
        ? { patch: { points: "top12" }, title: "Puntos hasta el 12º lugar", desc: "Nuevo sistema 25-20-16-13-11-9-7-5-4-3-2-1. Más equipos suman puntos." }
        : { patch: { points: "top10" }, title: "Volver a puntos hasta el 10º", desc: "Sistema clásico 25-18-15-12-10-8-6-4-2-1." },
    interest: (c, p) => (p.points === "top12" ? 1 : -1) * underdog(c) * 0.8,
  },
  {
    key: "fastestLap",
    fiaOk: false,
    voteOk: true,
    available: () => true,
    make: (r) =>
      r.fastestLapPoint
        ? { patch: { fastestLapPoint: false }, title: "Eliminar el punto por vuelta rápida", desc: "La vuelta rápida deja de dar puntos." }
        : { patch: { fastestLapPoint: true }, title: "Punto extra por vuelta rápida", desc: "1 punto para quien haga la vuelta rápida si termina en el top 10." },
    interest: (c, p) => (p.fastestLapPoint ? 1 : -1) * -underdog(c) * 0.6,
  },
  {
    key: "twoCompound",
    fiaOk: true,
    voteOk: true,
    available: () => true,
    make: (r) =>
      r.twoCompound
        ? { patch: { twoCompound: false }, title: "Liberar la regla de compuestos", desc: "Ya no es obligatorio usar dos compuestos de seco: se podrá correr a cero paradas." }
        : { patch: { twoCompound: true }, title: "Volver a exigir dos compuestos", desc: "En carreras en seco habrá que usar al menos dos compuestos distintos." },
    interest: (c) => (c.carRank <= 3 ? -0.2 : 0.1),
  },
  {
    key: "overtakeAid",
    fiaOk: true,
    voteOk: true,
    available: () => true,
    make: (r) =>
      r.overtakeAid
        ? { patch: { overtakeAid: false }, title: "Quitar el modo adelantamiento reforzado", desc: "Adelantar vuelve a ser tan difícil como antes." }
        : { patch: { overtakeAid: true }, title: "Modo adelantamiento reforzado", desc: "Más energía eléctrica para el auto que ataca: adelantar será bastante más fácil." },
    interest: (c, p) => (p.overtakeAid ? 1 : -1) * underdog(c) * 0.5,
  },
  {
    key: "highDeg",
    fiaOk: true,
    voteOk: false,
    available: () => true,
    make: (r) =>
      r.highDegTyres
        ? { patch: { highDegTyres: false }, title: "Pirelli vuelve a neumáticos estándar", desc: "Menos degradación y estrategias más conservadoras." }
        : { patch: { highDegTyres: true }, title: "Pirelli: neumáticos de alta degradación", desc: "Compuestos más blandos que se gastan un 20% más rápido: más paradas y más estrategia." },
    interest: () => 0,
  },
  {
    key: "puFreeze",
    fiaOk: true,
    voteOk: true,
    available: () => true,
    make: (r) =>
      r.puFreeze
        ? { patch: { puFreeze: false }, title: "Descongelar el desarrollo de motores", desc: "Los equipos vuelven a poder mejorar la unidad de potencia." }
        : { patch: { puFreeze: true }, title: "Congelar el desarrollo de motores", desc: "Nadie podrá mejorar la unidad de potencia. Conviene a quien hoy tiene el mejor motor." },
    interest: (c, p) => {
      const lead = Math.max(-1, Math.min(1, (mid(c) - c.puRank) / (mid(c) - 1)));
      return (p.puFreeze ? 1 : -1) * lead;
    },
  },
  {
    key: "flatPrize",
    fiaOk: false,
    voteOk: true,
    available: () => true,
    make: (r) =>
      r.flatPrize
        ? { patch: { flatPrize: false }, title: "Premios según posición", desc: "El dinero vuelve a repartirse según el puesto en constructores." }
        : { patch: { flatPrize: true }, title: "Reparto más equitativo de premios", desc: "La diferencia de premio entre el primero y el último se reduce a la mitad." },
    interest: (c, p) => (p.flatPrize ? 1 : -1) * underdog(c),
  },
  {
    key: "salaryCap",
    fiaOk: false,
    voteOk: true,
    available: () => true,
    make: (r) =>
      r.salaryCap === null
        ? { patch: { salaryCap: 18 }, title: "Tope salarial de US$ 18 M por piloto", desc: "Ningún piloto podrá ganar más de US$ 18 M al año. Las estrellas serán más accesibles." }
        : { patch: { salaryCap: null }, title: "Eliminar el tope salarial", desc: "Los sueldos de los pilotos vuelven a ser libres." },
    interest: (c, p) => (p.salaryCap ? 1 : -1) * (c.driverPayroll > 30 ? -0.8 : 0.5) + underdog(c) * 0.3,
  },
];

/** Rounds after which proposals are announced: FIA decree first, then two votes. */
export const PROPOSAL_ROUNDS: { round: number; by: "fia" | "vote" }[] = [
  { round: 6, by: "fia" },
  { round: 10, by: "vote" },
  { round: 17, by: "vote" },
];

/** New proposals announced after `round` of `season` (rules = rules that will be in force next season so far). */
const CLASSICS = new Set([1, 8, 11, 15, 24]); // opener, Monaco, Silverstone, Monza, finale

/** A calendar change for next season (FIA decision or team vote). */
function calendarProposal(season: number, round: number, by: "fia" | "vote", calIds: number[], rng: ReturnType<typeof createRng>): RuleProposal | null {
  const outside = ALL_RACES.filter((r) => !calIds.includes(r.id));
  const removable = calIds.filter((id) => !CLASSICS.has(id));
  const ops: ("add" | "remove" | "swap")[] = [];
  if (outside.length && calIds.length < 25) ops.push("add");
  if (removable.length && calIds.length > 21) ops.push("remove");
  if (outside.length && removable.length) ops.push("swap", "swap");
  if (!ops.length) return null;
  const op = rng.pick(ops);
  const add = op !== "remove" ? rng.pick(outside) : undefined;
  const rem = op !== "add" ? raceById(rng.pick(removable)) : undefined;
  const nm = (r?: Race) => r?.name.replace(" Grand Prix", "") ?? "";
  const title =
    op === "add" ? `Nuevo Gran Premio: ${nm(add)} se suma al calendario` : op === "remove" ? `${nm(rem)} sale del calendario` : `${nm(add)} reemplaza a ${nm(rem)}`;
  const desc =
    op === "add"
      ? `${add!.name} (${add!.circuit}) se agrega en ${season + 1}: una carrera más, más ingresos por TV y más logística.`
      : op === "remove"
        ? `${rem!.name} deja de estar en ${season + 1}: una carrera menos en la temporada.`
        : `${add!.name} (${add!.circuit}) ocupa la fecha de ${rem!.name} desde ${season + 1}.`;
  return {
    id: `${season}-${round}-cal`,
    season,
    effective: season + 1,
    round,
    key: "calendar",
    patch: {},
    title,
    desc,
    by,
    status: by === "fia" ? "decreed" : "pending",
    calendar: { op, add: add?.id, remove: rem?.id },
  };
}

/** Next season's calendar after the approved changes (sorted by date). */
export function calendarFor(season: number, races: Race[], proposals: RuleProposal[]): Race[] {
  let cal = [...races];
  for (const p of proposals.filter((x) => x.effective === season && x.calendar && (x.status === "approved" || x.status === "decreed"))) {
    const c = p.calendar!;
    const removed = c.remove ? cal.find((r) => r.id === c.remove) : undefined;
    if (removed) cal = cal.filter((r) => r.id !== removed.id);
    const add = c.add ? raceById(c.add) : undefined;
    if (add && !cal.some((r) => r.id === add.id)) cal.push({ ...add, date: removed?.date ?? freeSlot(cal) });
  }
  return sortByDate(cal);
}

/** Every five years the FIA brings a new generation of cars (2026 was the last one). */
export const MEGA_EVERY = 5;
export const isMegaYear = (season: number) => season > 2026 && (season - 2026) % MEGA_EVERY === 0;
/** Round after which the next generation is announced (the season before). */
export const MEGA_ANNOUNCE_ROUND = 3;

const MEGA_CONCEPTS = [
  {
    title: "Nueva generación de autos: efecto suelo 2.0 y motores 100% sostenibles",
    desc: "Autos nuevos desde cero: fondos con túneles Venturi más grandes, alerones simplificados y unidades de potencia con combustible totalmente sostenible y más energía eléctrica.",
  },
  {
    title: "Nueva generación de autos: aerodinámica activa total y chasis más chico",
    desc: "Alerones móviles en las rectas y en las curvas, autos 30 cm más cortos y 50 kg más livianos, y una nueva arquitectura de motor.",
  },
  {
    title: "Nueva generación de autos: V8 híbridos y neumáticos más anchos",
    desc: "Vuelven los motores V8 con un sistema híbrido más simple, neumáticos más anchos y un reglamento aerodinámico pensado para seguir de cerca.",
  },
];

export function megaProposal(season: number): RuleProposal {
  const effective = season + 1;
  const c = MEGA_CONCEPTS[Math.floor((effective - 2026) / MEGA_EVERY - 1) % MEGA_CONCEPTS.length];
  return {
    id: `${season}-mega`,
    season,
    effective,
    round: MEGA_ANNOUNCE_ROUND,
    key: "megaRegs",
    patch: {},
    title: c.title,
    desc: `${c.desc} Todo lo desarrollado queda obsoleto: el orden de la parrilla puede cambiar por completo. Los equipos que inviertan antes en el auto ${effective} parten con ventaja.`,
    by: "fia",
    status: "decreed",
    mega: true,
  };
}

/** The new generation coming into force in a season (if any). */
export const megaChange = (season: number, proposals: RuleProposal[]) => proposals.find((p) => p.mega && p.effective === season) ?? null;
/** Announced and not yet in force: teams can prepare. */
export const pendingMega = (season: number, proposals: RuleProposal[]) => proposals.find((p) => p.mega && p.effective === season + 1) ?? null;

export function generateProposals(season: number, round: number, rules: RuleSet, existing: RuleProposal[], seed: number, calIds?: number[]): RuleProposal[] {
  if (round === MEGA_ANNOUNCE_ROUND && isMegaYear(season + 1) && !existing.some((p) => p.mega && p.effective === season + 1)) return [megaProposal(season)];
  const slots = PROPOSAL_ROUNDS.filter((s) => s.round === round);
  if (!slots.length) return [];
  const rng = createRng(seed ^ (season * 7919) ^ (round * 104729));
  const usedKeys = new Set(existing.filter((p) => p.season === season).map((p) => p.key));
  const out: RuleProposal[] = [];
  for (const slot of slots) {
    if (calIds && !usedKeys.has("calendar") && rng.chance(slot.by === "fia" ? 0.4 : 0.25)) {
      const cp = calendarProposal(season, round, slot.by, calIds, rng);
      if (cp) {
        usedKeys.add("calendar");
        out.push(cp);
        continue;
      }
    }
    const pool = TEMPLATES.filter((t) => (slot.by === "fia" ? t.fiaOk : t.voteOk) && t.available(rules) && !usedKeys.has(t.key));
    if (!pool.length) continue;
    const t = rng.pick(pool);
    usedKeys.add(t.key);
    const m = t.make(rules);
    out.push({
      id: `${season}-${round}-${t.key}`,
      season,
      effective: season + 1,
      round,
      key: t.key,
      ...m,
      by: slot.by,
      status: slot.by === "fia" ? "decreed" : "pending",
    });
  }
  return out;
}

function teamVote(p: RuleProposal, c: TeamContext, seed: number): Vote {
  const t = TEMPLATES.find((x) => x.key === p.key);
  const rng = createRng(seed ^ hash(p.id + c.teamId));
  const score = (t ? t.interest(c, p.patch) : 0) + (rng.next() - 0.5) * 0.7;
  return score > 0.25 ? "for" : score < -0.25 ? "against" : "abstain";
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Everyone votes; approved when there are more votes in favour than against. */
export function resolveVote(p: RuleProposal, contexts: TeamContext[], playerTeamId: string | null, playerVote: Vote, seed: number): RuleProposal {
  const votes: Record<string, Vote> = {};
  for (const c of contexts) votes[c.teamId] = c.teamId === playerTeamId ? playerVote : teamVote(p, c, seed);
  const n = tally(votes);
  return { ...p, votes, playerVote, status: n.for > n.against ? "approved" : "rejected" };
}

export function tally(votes: Record<string, Vote> = {}) {
  const v = Object.values(votes);
  return { for: v.filter((x) => x === "for").length, against: v.filter((x) => x === "against").length, abstain: v.filter((x) => x === "abstain").length };
}

/** Technical changes that come into force in a season. */
export function techChanges(season: number, proposals: RuleProposal[]): TechEffect[] {
  return proposals
    .filter((p) => p.effective === season && p.effect && (p.status === "approved" || p.status === "decreed"))
    .map((p) => p.effect!);
}

/** Rules for next season: current rules + decreed/approved changes. */
export function rulesFor(season: number, current: RuleSet, proposals: RuleProposal[]): RuleSet {
  return proposals
    .filter((p) => p.effective === season && (p.status === "approved" || p.status === "decreed"))
    .sort((a, b) => a.round - b.round)
    .reduce((r, p) => ({ ...r, ...p.patch }), current);
}

/** Points of a classified result under a rule set. */
export function scoreRows(rows: ClassifiedRow[], rules: RuleSet, fastestLapDriver?: string | null): ClassifiedRow[] {
  const table = POINTS_TABLES[rules.points];
  return rows.map((r) => {
    let points = r.status === "finished" ? table[r.position - 1] ?? 0 : 0;
    if (rules.fastestLapPoint && r.status === "finished" && r.driverId === fastestLapDriver && r.position <= 10) points += 1;
    return { ...r, points };
  });
}
