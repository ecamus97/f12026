import { createRng } from "./rng";
// AI strategy: builds a tyre plan before the race and makes in-race pit calls.
import type { Track } from "@/data/f1Data";
import type { Rng } from "./rng";
import type { CarState, Compound, Stint } from "./types";
import { bestTyreFor, DRY_COMPOUNDS, isWetTyre, raceLapTime, tyreLife, wetPenalty } from "./model";
import type { Entry } from "./types";
import { DEFAULT_SIM_CONFIG } from "./types";

interface Template {
  stints: Compound[];
  split: number[]; // fraction of race where each stop happens
  weight: number;
}

const TEMPLATES: Template[] = [
  { stints: ["M", "H"], split: [0.42], weight: 5 },
  { stints: ["H", "M"], split: [0.58], weight: 2 },
  { stints: ["S", "H"], split: [0.3], weight: 3 },
  { stints: ["M", "S"], split: [0.68], weight: 1 },
  { stints: ["S", "M", "M"], split: [0.28, 0.64], weight: 2 },
  { stints: ["M", "H", "S"], split: [0.33, 0.75], weight: 2 },
  { stints: ["S", "H", "S"], split: [0.25, 0.72], weight: 1 },
  { stints: ["S", "M", "S"], split: [0.27, 0.62], weight: 1 },
];

/** Build a feasible tyre plan; adjusts weights so stints fit within tyre life. */
export function buildPlan(track: Track, tyreMgmt: number, rng: Rng): Stint[] {
  const laps = track.laps;
  const options = TEMPLATES.map((tpl) => {
    const bounds = [0, ...tpl.split.map((f) => f * laps), laps];
    let feasible = true;
    tpl.stints.forEach((c, i) => {
      const len = bounds[i + 1] - bounds[i];
      if (len > tyreLife(c, track, tyreMgmt) * 1.1) feasible = false;
    });
    // high-deg tracks prefer more stops, low-deg tracks prefer fewer
    const stopBias = tpl.stints.length === 2 ? 1 / track.deg ** 2 : track.deg ** 2;
    return { item: tpl, weight: feasible ? tpl.weight * stopBias : 0.01 };
  });
  const tpl = rng.weighted(options);
  const stints: Stint[] = [];
  let last = 0;
  tpl.stints.forEach((c, i) => {
    let until = i < tpl.split.length ? Math.round(tpl.split[i] * laps + rng.int(-3, 3)) : laps;
    until = Math.max(last + 5, Math.min(laps - 3, until));
    if (i === tpl.stints.length - 1) until = laps;
    stints.push({ compound: c, untilLap: until });
    last = until;
  });
  return stints;
}

/** Decide whether an AI car pits at the end of `lap`. Returns compound to fit or null. */
export function aiPitDecision(car: CarState, lap: number, totalLaps: number, track: Track, scActive: boolean): Compound | null {
  const lapsLeft = totalLaps - lap;
  if (lapsLeft <= 1) return null;
  const [current, next] = car.plan;
  const life = tyreLife(car.compound, track, car.entry.driver.tyreMgmt);

  // Planned stop
  if (next && lap >= current.untilLap) return next.compound;
  // Player cars only follow their (editable) plan or manual calls
  if (car.controlled) return null;

  // Cheap stop under safety car if a stop is coming anyway or tyres are worn
  if (scActive && lapsLeft > 6) {
    if (next && current.untilLap - lap <= 10) return next.compound;
    if (!next && car.tyreAge > life * 0.55 && lapsLeft > 10) {
      return lapsLeft < 22 ? "S" : lapsLeft < 34 ? "M" : "H";
    }
  }

  // Emergency: tyres well past the cliff
  if (car.tyreAge > life * 1.2 && lapsLeft > 4) {
    if (next) return next.compound;
    return lapsLeft < 20 ? "S" : lapsLeft < 32 ? "M" : "H";
  }
  return null;
}

/** After a stop, drop the finished stint (or rebuild the remainder if the stop was unplanned). */
export function advancePlan(car: CarState, fitted: Compound, lap: number, totalLaps: number): Stint[] {
  const [, next, ...rest] = car.plan;
  if (next && next.compound === fitted) return [next, ...rest];
  // Unplanned stop: run the new tyre to the end, or keep the following stint if there is one
  if (next) return [{ compound: fitted, untilLap: Math.max(lap + 5, next.untilLap) }, ...rest];
  return [{ compound: fitted, untilLap: totalLaps }];
}

// ---------------------------------------------------------------------------
// Strategy planner: deterministic race-time estimate and recommendations
// ---------------------------------------------------------------------------

const PIT_STATIONARY = 2.5;

/** Expected race time (s) of a plan with no traffic, noise or incidents. */
export function estimatePlanTime(entry: Entry, track: Track, plan: Stint[]): number {
  let total = 0;
  let lap = 0;
  plan.forEach((stint, i) => {
    let age = 0;
    while (lap < stint.untilLap) {
      lap++;
      age++;
      total += raceLapTime({
        entry, track, compound: stint.compound, tyreAge: age, mode: "normal",
        lap, totalLaps: track.laps, cfg: DEFAULT_SIM_CONFIG, noise: 0,
      });
    }
    if (i < plan.length - 1) total += track.pitLoss + PIT_STATIONARY + (100 - entry.team.pitCrew) * 0.025;
  });
  return total;
}

export interface PlanOption {
  plan: Stint[];
  time: number;
  label: string;
}

export const planLabel = (plan: Stint[]) =>
  `${plan.map((s) => s.compound).join("→")} · ${plan.length - 1} parada${plan.length === 2 ? "" : "s"}`;

/** Best plan for each tyre sequence (1 and 2 stops), sorted by expected time. */
export function recommendPlans(entry: Entry, track: Track, max = 4, noStopAllowed = false): PlanOption[] {
  const C = DRY_COMPOUNDS;
  const laps = track.laps;
  const options: PlanOption[] = [];
  const minStint = 5;

  // no stop at all (sprints, or when two compounds aren't compulsory)
  if (noStopAllowed) {
    for (const a of C) {
      const plan = [{ compound: a, untilLap: laps }];
      options.push({ plan, time: estimatePlanTime(entry, track, plan), label: planLabel(plan) });
    }
  }

  // one stop
  for (const a of C) for (const b of C) {
    if (a === b) continue;
    let best: PlanOption | null = null;
    for (let s = minStint; s <= laps - minStint; s++) {
      const plan = [{ compound: a, untilLap: s }, { compound: b, untilLap: laps }];
      const time = estimatePlanTime(entry, track, plan);
      if (!best || time < best.time) best = { plan, time, label: planLabel(plan) };
    }
    if (best) options.push(best);
  }
  // two stops (coarse grid, then refine)
  for (const a of C) for (const b of C) for (const c of C) {
    if (a === b && b === c) continue;
    let best: PlanOption | null = null;
    for (let s1 = minStint; s1 <= laps - 2 * minStint; s1 += 2) {
      for (let s2 = s1 + minStint; s2 <= laps - minStint; s2 += 2) {
        const plan = [{ compound: a, untilLap: s1 }, { compound: b, untilLap: s2 }, { compound: c, untilLap: laps }];
        const time = estimatePlanTime(entry, track, plan);
        if (!best || time < best.time) best = { plan, time, label: planLabel(plan) };
      }
    }
    if (best) options.push(best);
  }
  options.sort((x, y) => x.time - y.time);
  // keep variety: at most one entry per stop count + compound set
  const seen = new Set<string>();
  const out: PlanOption[] = [];
  for (const o of options) {
    // same set of compounds and stops = same strategy family (order barely changes the time)
    const key = `${o.plan.length}-${o.plan.map((p) => p.compound).sort().join("")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
    if (out.length >= max) break;
  }
  return out;
}

/** Validate/normalise a plan: increasing stop laps, last stint to the flag, ≥5 laps each. */
export function normalisePlan(plan: Stint[], laps: number, fromLap = 0): Stint[] {
  const out = plan.map((s) => ({ ...s }));
  for (let i = 0; i < out.length; i++) {
    const min = (i === 0 ? fromLap : out[i - 1].untilLap) + 1;
    const max = laps - (out.length - 1 - i);
    out[i].untilLap = i === out.length - 1 ? laps : Math.max(min, Math.min(max, Math.round(out[i].untilLap)));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Weather calls (AI)
// ---------------------------------------------------------------------------

/** Dry compound to finish the race on, given the laps left. */
export function dryCompoundFor(lapsLeft: number, track: Track, tyreMgmt = 85): Compound {
  if (lapsLeft <= tyreLife("S", track, tyreMgmt) * 0.95) return "S";
  if (lapsLeft <= tyreLife("M", track, tyreMgmt) * 0.95) return "M";
  return "H";
}

/** Fresh plan after an unplanned (weather) stop. */
export function replan(fitted: Compound, lap: number, totalLaps: number, track: Track, tyreMgmt = 85): Stint[] {
  const left = totalLaps - lap;
  if (isWetTyre(fitted)) return [{ compound: fitted, untilLap: totalLaps }];
  const life = tyreLife(fitted, track, tyreMgmt);
  if (left <= life * 1.05) return [{ compound: fitted, untilLap: totalLaps }];
  const stop = Math.min(totalLaps - 3, lap + Math.round(life * 0.85));
  return [
    { compound: fitted, untilLap: stop },
    { compound: dryCompoundFor(totalLaps - stop, track, tyreMgmt), untilLap: totalLaps },
  ];
}

/**
 * AI reaction to the weather: switch between slicks, intermediates and wets.
 * `wetSoon` is what the team's radar expects for the next laps. Each driver reacts
 * a little differently (`jitter` in [-1, 1]).
 */
/**
 * How a team plays a wet race (fixed per team and race, so teammates follow the same idea):
 * some stay out to save a stop, some jump early to the next tyre, some think a few laps ahead
 * (wets → inters → slicks) and others wait for the big change (wets → slicks).
 */
export interface WeatherStyle {
  margin: number; // how much clear gain they want before stopping (low = eager, high = stays out)
  horizon: number; // how many laps ahead they plan
  bias: number; // optimist (<0: expects a drier track) or pessimist (>0)
  early: boolean; // fits the next tyre a lap or two before it's actually quicker (a gamble)
  label: string;
}

export function weatherStyle(teamId: string, raceId: number): WeatherStyle {
  let h = 2166136261 ^ (raceId * 2654435761);
  for (const ch of teamId) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rng = createRng(h >>> 0);
  const kind = rng.next();
  if (kind < 0.25) return { margin: 2 + rng.next() * 1.2, horizon: 12 + rng.int(0, 6), bias: rng.next() * 0.08, early: false, label: "conservador" };
  if (kind < 0.5) return { margin: 0.35 + rng.next() * 0.3, horizon: 4 + rng.int(0, 3), bias: -0.04 - rng.next() * 0.08, early: true, label: "arriesgado" };
  if (kind < 0.75) return { margin: 0.7 + rng.next() * 0.4, horizon: 5 + rng.int(0, 3), bias: (rng.next() - 0.5) * 0.06, early: false, label: "paso a paso" };
  return { margin: 1 + rng.next() * 0.6, horizon: 9 + rng.int(0, 5), bias: (rng.next() - 0.5) * 0.08, early: rng.chance(0.3), label: "equilibrado" };
}

export function aiWeatherPit(
  car: CarState,
  wet: number[], // track wetness per lap (what the team's weather service expects)
  lap: number, // lap just completed
  lapsLeft: number,
  track: Track,
  jitter: number, // -1..1: each team reads the forecast a little differently
  scActive = false,
  style?: WeatherStyle,
): Compound | null {
  if (lapsLeft <= 2) return null;
  // look ahead over the next laps: stopping only pays if the tyre is clearly better until the
  // conditions change again, by more than the time lost in the pit lane
  const horizon = Math.min(lapsLeft, style?.horizon ?? 12);
  const ahead = Array.from({ length: horizon }, (_, k) =>
    Math.max(0, Math.min(1, (wet[Math.min(lap + k, wet.length - 1)] ?? 0) * (1 + jitter * 0.12) + (style?.bias ?? 0))),
  );
  const costOver = (c: Compound) => ahead.reduce((a, w) => a + wetPenalty(c, w), 0);
  const dry = dryCompoundFor(lapsLeft, track, car.entry.driver.tyreMgmt);
  const options: Compound[] = [dry, "I", "W"];
  const stay = costOver(car.compound);
  const pitLoss = track.pitLoss * (scActive ? 0.55 : 1) + 2.5;
  let best: Compound | null = null;
  let bestGain = 0;
  for (const c of options) {
    const same = c === car.compound || (!isWetTyre(c) && !isWetTyre(car.compound));
    if (same) continue;
    // and only once the new tyre is already the quicker one: no point fitting it laps too early
    const soon = ahead.slice(0, style?.early ? 4 : 2);
    if (!soon.some((w) => wetPenalty(c, w) < wetPenalty(car.compound, w))) continue;
    const gain = stay - costOver(c) - pitLoss;
    if (gain > bestGain) {
      best = c;
      bestGain = gain;
    }
  }
  // a margin so they don't flip-flop on small differences
  return bestGain > (3 + pitLoss * 0.25) * (style?.margin ?? 1) ? best : null;
}
