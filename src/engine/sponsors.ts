// Sponsorship market: offers with different trade-offs (base, signing fee, bonuses, requirements).
import type { Rng } from "./rng";

export type SponsorSlot = "principal" | "secundario";
export type SponsorStyle = "estable" | "rendimiento" | "firma" | "premium";

export interface SponsorDeal {
  id: string;
  name: string;
  slot: SponsorSlot;
  style: SponsorStyle;
  base: number; // M USD per race
  signing: number; // paid once when signing
  perPoint: number;
  perPodium: number;
  perWin: number;
  perPole: number;
  perDnf: number; // penalty (negative) per retirement
  duration: number; // races
  racesLeft: number;
  minRank: number | null; // team must be at least this high in the constructors' championship to sign
  earned: number; // total paid so far
  goals?: SponsorGoal[]; // objectives for the length of the contract
}

export type GoalKind = "points" | "podiums" | "doublePoints" | "champRank" | "beatRival" | "maxDnf";

export interface SponsorGoal {
  kind: GoalKind;
  target: number;
  progress: number;
  rivalId?: string;
  rivalName?: string;
  rivalProgress?: number; // rival's points during the contract
  reward: number; // M USD when achieved
  fine: number; // M USD (positive) charged if failed
  status: "active" | "done" | "failed";
}

export const SLOT_INFO: Record<SponsorSlot, { label: string; count: number }> = {
  principal: { label: "Patrocinador principal", count: 1 },
  secundario: { label: "Patrocinador secundario", count: 2 },
};

export const STYLE_INFO: Record<SponsorStyle, { label: string; desc: string }> = {
  estable: { label: "Estable", desc: "Pago fijo alto, sin bonos." },
  rendimiento: { label: "Por rendimiento", desc: "Pago fijo bajo, grandes bonos por puntos, podios y victorias." },
  firma: { label: "Prima de firma", desc: "Gran pago al firmar y contrato largo, pero multa por abandonos." },
  premium: { label: "Premium", desc: "El que más paga, pero exige mantenerse arriba en el campeonato de constructores y penaliza abandonos." },
};

const NAMES = [
  "Voltara Energy", "Nimbus Cloud", "Kestrel Watches", "Aurora Bank", "Halcyon Air", "Quantix Labs", "Solenne Cosmetics",
  "Ironbark Tools", "Meridian Logistics", "Pulse Telecom", "Vireo Beverages", "Cobalt Insurance", "Lumen Optics",
  "Northwind Apparel", "Tidal Fintech", "Orbis Travel", "Ember Coffee", "Granite Capital", "Zephyr Mobility", "Atlas Robotics",
  "Saffron Foods", "Helios Solar", "Vantage Software", "Riviera Resorts",
];

/** Reference per-race value of a principal sponsor by constructors' championship position (1 = leader). */
export const sponsorReference = (champRank: number) => +(1.75 - (Math.min(11, Math.max(1, champRank)) - 1) * 0.075).toFixed(3);

/** TV / commercial rights from the sport, by constructors' championship position (1 = leader). */
export const tvRights = (carRank: number) => +(2.6 + (11 - Math.min(11, carRank)) * 0.13).toFixed(2);

const round2 = (x: number) => Math.round(x * 100) / 100;

export function generateOffers(
  rng: Rng,
  opts: { slot: SponsorSlot; count: number; champRank: number; racesLeftInSeason: number; usedNames: Set<string>; uidStart: number },
): SponsorDeal[] {
  const { slot, count, champRank, racesLeftInSeason, usedNames } = opts;
  const R = sponsorReference(champRank) * (slot === "principal" ? 1 : 0.3);
  const k = R / 1.9; // bonus scale
  const styles: SponsorStyle[] = ["estable", "rendimiento", "firma", "premium"];
  const out: SponsorDeal[] = [];
  let uid = opts.uidStart;
  // every batch shows a variety of styles (shuffled, then cycled)
  const order = [...styles].sort(() => rng.next() - 0.5);
  for (let i = 0; i < count; i++) {
    const style = order[i % order.length];
    const pool = NAMES.filter((n) => !usedNames.has(n));
    const name = pool.length ? rng.pick(pool) : `Socio ${uid}`;
    usedNames.add(name);
    const v = 0.85 + rng.next() * 0.3; // ±15% market variation
    const dur = (min: number, max: number) => Math.max(1, Math.min(racesLeftInSeason, rng.int(min, max)));
    const base: SponsorDeal = {
      id: `s${uid++}`, name, slot, style,
      base: 0, signing: 0, perPoint: 0, perPodium: 0, perWin: 0, perPole: 0, perDnf: 0,
      duration: 0, racesLeft: 0, minRank: null, earned: 0,
    };
    let d: SponsorDeal;
    switch (style) {
      case "estable":
        d = { ...base, base: R * v, signing: R * 0.5 * v, duration: dur(8, 12) };
        break;
      case "rendimiento":
        d = { ...base, base: R * 0.55 * v, perPoint: 0.06 * k * v, perPodium: 0.8 * k * v, perWin: 1.5 * k * v, perPole: 0.4 * k * v, duration: dur(6, 10) };
        break;
      case "firma":
        d = { ...base, base: R * 0.75 * v, signing: R * 3.5 * v, perDnf: -0.4 * k, duration: dur(14, 24) };
        break;
      case "premium":
      default:
        d = { ...base, base: R * 1.45 * v, signing: R * v, perDnf: -0.6 * k, minRank: Math.max(1, champRank - rng.int(0, 2)), duration: dur(6, 10) };
        break;
    }
    out.push({
      ...d,
      base: round2(d.base), signing: round2(d.signing), perPoint: round2(d.perPoint), perPodium: round2(d.perPodium),
      perWin: round2(d.perWin), perPole: round2(d.perPole), perDnf: round2(d.perDnf), racesLeft: d.duration,
    });
  }
  return out;
}

export interface RaceOutcome {
  points: number;
  podiums: number;
  wins: number;
  pole: boolean;
  dnfs: number;
}

/** Breakdown of what a sponsor pays for one race. */
export function sponsorPayout(s: SponsorDeal, o: RaceOutcome): { concept: string; amount: number }[] {
  const lines: { concept: string; amount: number }[] = [{ concept: `${s.name}: pago por carrera`, amount: s.base }];
  const bonus =
    o.points * s.perPoint + o.podiums * s.perPodium + o.wins * s.perWin + (o.pole ? s.perPole : 0);
  if (bonus > 0) lines.push({ concept: `${s.name}: bonos por resultados`, amount: round2(bonus) });
  if (s.perDnf < 0 && o.dnfs > 0) lines.push({ concept: `${s.name}: multa por abandono`, amount: round2(s.perDnf * o.dnfs) });
  return lines;
}

/** Expected value per race of an offer, for comparison in the UI. */
export function expectedPerRace(s: SponsorDeal, typical: RaceOutcome) {
  const lines = sponsorPayout(s, typical);
  return lines.reduce((a, l) => a + l.amount, 0) + s.signing / Math.max(1, s.duration);
}

// ---------------------------------------------------------------------------
// Sponsor objectives
// ---------------------------------------------------------------------------

// rough points per race of a team by where its car stands (1 = best)
const EXP_POINTS = [0, 38, 28, 21, 15, 10, 6.5, 4, 2.5, 1.5, 0.8, 0.4];
const PODIUM_RATE = [0, 1.1, 0.7, 0.4, 0.2];
const DOUBLE_RATE = [0, 0.95, 0.85, 0.75, 0.6, 0.45, 0.3, 0.2, 0.12];

function seedOf(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Objectives a sponsor sets for its contract, scaled to what the team can do.
 * `races` is how many races the objectives cover (the races left on the contract).
 */
export function makeSponsorGoals(
  deal: Pick<SponsorDeal, "id" | "name" | "slot" | "style">,
  ctx: { champRank: number; carRank: number; races: number; rivalAbove?: { id: string; name: string }; rivalBelow?: { id: string; name: string } },
): SponsorGoal[] {
  // deterministic per deal (no game RNG used, so adding goals to old saves changes nothing else)
  let h = seedOf(`${deal.id}|${deal.name}`);
  const rnd = () => {
    h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return h / 4294967296;
  };
  const r = Math.max(1, Math.min(11, Math.round((ctx.champRank + ctx.carRank) / 2)));
  const d = Math.max(1, ctx.races);
  const R = sponsorReference(ctx.champRank) * (deal.slot === "principal" ? 1 : 0.3);
  const harsh = deal.style === "premium" || deal.style === "firma";
  const goal = (kind: GoalKind, target: number, k: number, extra: Partial<SponsorGoal> = {}): SponsorGoal => ({
    kind,
    target,
    progress: 0,
    reward: round2(R * (deal.slot === "principal" ? 2.2 : 3) * k * (0.9 + rnd() * 0.2)),
    fine: harsh ? round2(R * (deal.style === "premium" ? 1 : 0.5) * k) : 0,
    status: "active",
    ...extra,
  });
  const pool: (() => SponsorGoal | null)[] = [];
  const points = () => goal("points", Math.max(1, Math.round(EXP_POINTS[r] * d * (0.8 + rnd() * 0.15))), 1);
  const podiums = () => (r <= 4 ? goal("podiums", Math.max(1, Math.round(PODIUM_RATE[r] * d * 0.8)), 1.2) : null);
  const doubles = () => (r <= 8 ? goal("doublePoints", Math.max(1, Math.round(DOUBLE_RATE[r] * d * 0.7)), 1) : null);
  const champ = () => goal("champRank", Math.max(1, deal.style === "rendimiento" || deal.style === "premium" ? ctx.champRank - (ctx.champRank > 1 ? 1 : 0) : ctx.champRank), 1.3);
  const rival = () => {
    const t = ctx.rivalAbove ?? ctx.rivalBelow;
    return t ? goal("beatRival", 0, 1.1, { rivalId: t.id, rivalName: t.name, rivalProgress: 0 }) : null;
  };
  const dnf = () => goal("maxDnf", Math.max(1, Math.floor(d * 0.2)), 0.8);
  switch (deal.style) {
    case "estable":
      pool.push(dnf, points, champ);
      break;
    case "rendimiento":
      pool.push(podiums, points, doubles);
      break;
    case "firma":
      pool.push(dnf, rival, points);
      break;
    case "premium":
    default:
      pool.push(champ, podiums, rival, points);
  }
  const want = deal.slot === "principal" ? 2 : 1;
  const out: SponsorGoal[] = [];
  const cands = pool.map((f) => f()).filter((g): g is SponsorGoal => !!g);
  // shuffle lightly, keep kinds unique
  cands.sort(() => rnd() - 0.5);
  for (const g of cands) if (out.length < want && !out.some((x) => x.kind === g.kind)) out.push(g);
  return out;
}

export function goalLabel(g: SponsorGoal): string {
  switch (g.kind) {
    case "points":
      return `Sumar ${g.target} punto${g.target === 1 ? "" : "s"}`;
    case "podiums":
      return `Conseguir ${g.target} podio${g.target === 1 ? "" : "s"}`;
    case "doublePoints":
      return `Puntuar con los dos autos en ${g.target} carrera${g.target === 1 ? "" : "s"}`;
    case "champRank":
      return g.target === 1 ? "Liderar el campeonato de constructores" : `Estar top ${g.target} en constructores al terminar`;
    case "beatRival":
      return `Sumar más puntos que ${g.rivalName ?? "el rival"}`;
    case "maxDnf":
      return `No más de ${g.target} abandono${g.target === 1 ? "" : "s"}`;
  }
}

/** Progress shown to the player ("12/30 pts", "P5 ahora"...). */
export function goalProgress(g: SponsorGoal, champRank: number): { text: string; frac: number } {
  switch (g.kind) {
    case "points":
    case "podiums":
    case "doublePoints":
      return { text: `${g.progress}/${g.target}`, frac: Math.min(1, g.progress / Math.max(1, g.target)) };
    case "champRank":
      return { text: `P${champRank} ahora`, frac: champRank <= g.target ? 1 : Math.max(0, 1 - (champRank - g.target) / 4) };
    case "beatRival": {
      const diff = g.progress - (g.rivalProgress ?? 0);
      return { text: `${g.progress} vs ${g.rivalProgress ?? 0} pts`, frac: diff > 0 ? 1 : Math.max(0, 0.5 + diff / 40) };
    }
    case "maxDnf":
      return { text: `${g.progress}/${g.target} abandonos`, frac: Math.max(0, 1 - g.progress / (g.target + 1)) };
  }
}

export interface GoalRace {
  points: number;
  podiums: number;
  bothScored: boolean;
  dnfs: number;
  rivalPoints: Record<string, number>;
}

/** Update a sponsor's objectives after a race. `last` = the contract ends with this race. */
export function updateSponsorGoals(
  goals: SponsorGoal[],
  race: GoalRace,
  champRank: number,
  last: boolean,
): { goals: SponsorGoal[]; settled: SponsorGoal[] } {
  const settled: SponsorGoal[] = [];
  const next = goals.map((g0) => {
    if (g0.status !== "active") return g0;
    const g = { ...g0 };
    switch (g.kind) {
      case "points":
        g.progress = +(g.progress + race.points).toFixed(1);
        break;
      case "podiums":
        g.progress += race.podiums;
        break;
      case "doublePoints":
        g.progress += race.bothScored ? 1 : 0;
        break;
      case "beatRival":
        g.progress = +(g.progress + race.points).toFixed(1);
        g.rivalProgress = +((g.rivalProgress ?? 0) + (race.rivalPoints[g.rivalId ?? ""] ?? 0)).toFixed(1);
        break;
      case "maxDnf":
        g.progress += race.dnfs;
        break;
      case "champRank":
        break;
    }
    if (["points", "podiums", "doublePoints"].includes(g.kind) && g.progress >= g.target) g.status = "done";
    else if (g.kind === "maxDnf" && g.progress > g.target) g.status = "failed";
    else if (last) {
      if (g.kind === "champRank") g.status = champRank <= g.target ? "done" : "failed";
      else if (g.kind === "beatRival") g.status = g.progress > (g.rivalProgress ?? 0) ? "done" : "failed";
      else if (g.kind === "maxDnf") g.status = "done";
      else g.status = "failed";
    }
    if (g.status !== "active") settled.push(g);
    return g;
  });
  return { goals: next, settled };
}
