// AI strategy: builds a tyre plan before the race and makes in-race pit calls.
import type { Track } from "@/data/f1Data";
import type { Rng } from "./rng";
import type { CarState, Compound, Stint } from "./types";
import { bestTyreFor, DRY_COMPOUNDS, isWetTyre, raceLapTime, tyreLife } from "./model";
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
export function recommendPlans(entry: Entry, track: Track, max = 4): PlanOption[] {
  const C = DRY_COMPOUNDS;
  const laps = track.laps;
  const options: PlanOption[] = [];
  const minStint = 5;

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
export function aiWeatherPit(car: CarState, wetNow: number, wetSoon: number, lapsLeft: number, track: Track, jitter: number): Compound | null {
  if (lapsLeft <= 2) return null;
  const target = bestTyreFor(wetNow * 0.5 + wetSoon * 0.5 + jitter * 0.04);
  const onWet = isWetTyre(car.compound);
  if (!onWet && target !== "slick") return target;
  if (onWet && target === "slick") return dryCompoundFor(lapsLeft, track, car.entry.driver.tyreMgmt);
  if (onWet && target !== "slick" && target !== car.compound) {
    // only swap between inters and wets when clearly worth it
    if (target === "W" && wetNow > 0.68) return "W";
    if (target === "I" && wetNow < 0.55) return "I";
  }
  return null;
}
