// Qualifying: Q1 (22 → 16), Q2 (16 → 10), Q3 (top 10 shoot-out), run as timed sessions.
// Every car decides when to leave the garage; a run is a warm-up (out) lap, a flying lap and an
// in-lap. The lap depends on the moment it is driven: the track gains grip as it rubbers in,
// a cooler track (clouds) gives a little less grip, and rain or a drying track changes everything.
import type { Race, Track } from "@/data/f1Data";
import { createRng } from "./rng";
import type { Compound, Entry, SimConfig } from "./types";
import { DEFAULT_SIM_CONFIG } from "./types";
import { basePace, bestTyreFor, COMPOUNDS, wetPenalty } from "./model";
import { forecast, type ForecastPoint } from "./weather";

export type SessionName = "Q1" | "Q2" | "Q3";

export interface QualiRow {
  driverId: string;
  best: number; // 0 = no time
  runs: number[]; // 0 = lap deleted / aborted
  eliminated: boolean;
}

export interface QualiSession {
  name: SessionName;
  rows: QualiRow[]; // sorted by best time
}

export interface QualifyingResult {
  raceId: number;
  sessions: QualiSession[]; // completed sessions
  grid: string[]; // driver ids, P1 first (empty until Q3 is over)
  wet?: number; // track wetness in the decisive part of qualifying (0 = dry)
}

// --- Weather of a qualifying day ---------------------------------------------

/** Minute by minute weather of a qualifying day (index 0 = start of Q1). */
export interface DayWeather {
  rain: number[];
  cloud: number[]; // 0 = clear sky, 1 = overcast
  wet: number[]; // track wetness
  trackTemp: number[];
  airTemp: number;
  seed: number;
}

const lerpAt = (arr: number[], m: number) => {
  const i = Math.max(0, Math.min(arr.length - 1, m));
  const a = Math.floor(i);
  const b = Math.min(arr.length - 1, a + 1);
  return arr[a] + (arr[b] - arr[a]) * (i - a);
};

export function generateDayWeather(track: Track, seed: number, rainyWeekend: boolean, minutes = 80): DayWeather {
  const rng = createRng((seed ^ 0x0da7) >>> 0);
  const chance = Math.min(0.9, (track.rain ?? 0.15) * 0.75 + (rainyWeekend ? 0.22 : 0));
  const rain = new Array(minutes + 1).fill(0);
  if (rng.chance(chance)) {
    const n = rng.chance(0.3) ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const start = rng.int(-35, minutes - 8); // can already be raining when Q1 starts
      const len = rng.int(8, 40);
      const peak = 0.12 + rng.next() * 0.8;
      for (let m = Math.max(0, start); m <= Math.min(minutes, start + len); m++) {
        const x = (m - start) / len;
        const shape = x < 0.2 ? x / 0.2 : x > 0.8 ? (1 - x) / 0.2 : 1;
        rain[m] = Math.min(1, Math.max(rain[m], peak * shape * (0.85 + rng.next() * 0.3)));
      }
    }
  }
  // sky: a base cloud cover, sometimes it changes during the afternoon; rain brings clouds first
  const base = rng.next() * 0.7;
  const change = rng.chance(0.35) ? { at: rng.int(5, minutes - 10), to: rng.next() } : null;
  const cloud = rain.map((_, m) => {
    let c = base;
    if (change) c = base + (change.to - base) * Math.min(1, Math.max(0, (m - change.at) / 8));
    for (let k = m; k <= Math.min(minutes, m + 10); k++) if (rain[k] > 0.03) c = Math.max(c, 0.95 - (k - m) * 0.03);
    return +Math.min(1, c).toFixed(2);
  });
  const airTemp = Math.round((track.temp ?? 24) - 1 + (rng.next() - 0.5) * 8);
  const wet = new Array(minutes + 1).fill(0);
  const trackTemp = new Array(minutes + 1).fill(0);
  // the track can be damp from earlier rain
  wet[0] = rain[0] > 0 ? Math.min(1, rain[0] * 1.1) : rng.chance(chance * 0.25) ? 0.12 + rng.next() * 0.3 : 0;
  for (let m = 0; m <= minutes; m++) {
    const target = airTemp + 15 * (1 - 0.55 * cloud[m]) - rain[m] * 14 - (m ? wet[m - 1] : wet[0]) * 6;
    trackTemp[m] = m === 0 ? target : trackTemp[m - 1] + (target - trackTemp[m - 1]) * 0.12;
    if (m === 0) continue;
    const drying = rain[m] < 0.05 ? 0.025 + Math.max(0, trackTemp[m] - 20) * 0.0015 : 0;
    wet[m] = Math.max(0, Math.min(1, wet[m - 1] + rain[m] * 0.2 - drying));
  }
  return { rain, cloud, wet, trackTemp: trackTemp.map((t) => +t.toFixed(1)), airTemp, seed };
}

/** Conditions at `sec` seconds after the start of Q1. */
export function dayConditions(w: DayWeather, sec: number) {
  const m = sec / 60;
  return { rain: lerpAt(w.rain, m), wet: lerpAt(w.wet, m), cloud: lerpAt(w.cloud, m), trackTemp: lerpAt(w.trackTemp, m) };
}

/** Rain forecast for the qualifying day in windows of minutes (fromLap/toLap are minutes). */
export function dayForecast(w: DayWeather, nowMin: number, window = 3): ForecastPoint[] {
  return forecast({ rain: w.rain, wet: w.wet, airTemp: w.airTemp, trackTemp: w.trackTemp, seed: w.seed }, nowMin, window);
}

/** A rough picture of the day for the weekend preview. */
export function daySummary(w: DayWeather) {
  const fc = dayForecast(w, 0, 10).filter((f) => f.fromLap <= 62);
  const chance = fc.reduce((a, f) => Math.max(a, f.chance), 0);
  const cloud = w.cloud.slice(0, 62).reduce((a, c) => a + c, 0) / Math.min(62, w.cloud.length);
  const icon = chance >= 65 ? "🌧️" : chance >= 40 ? "🌦️" : chance >= 20 || cloud > 0.55 ? "⛅" : "☀️";
  return { chance, icon, airTemp: w.airTemp, cloud };
}

// --- Session format ------------------------------------------------------------

export const QUALI_FORMAT = {
  gp: { names: ["Q1", "Q2", "Q3"], minutes: [18, 15, 12], breaks: [7, 8] },
  sprint: { names: ["SQ1", "SQ2", "SQ3"], minutes: [12, 10, 8], breaks: [7, 7] },
};
const ADVANCE = [16, 10, 0];

/** Seconds from the start of Q1 to the start of a session. */
export function sessionOffset(index: number, sprint = false) {
  const f = sprint ? QUALI_FORMAT.sprint : QUALI_FORMAT.gp;
  let t = 0;
  for (let i = 0; i < index; i++) t += (f.minutes[i] + f.breaks[i]) * 60;
  return t;
}

export interface QualiRun {
  start: number; // leaves the garage (session seconds)
  flyStart: number; // crosses the line to start the flying lap
  flyEnd: number;
  inEnd: number; // back in the garage
  sectors: number[];
  time: number; // 0 = no valid time
  compound: Compound;
  note?: string; // what happened ("Vuelta anulada: límites de pista", "Tráfico"...)
  aborted?: boolean; // the flag fell before the flying lap started
  traffic?: boolean;
  retired?: "crash" | "failure"; // stopped on track during the flying lap (at flyEnd): out of the session
  damage?: boolean; // the car can't be repaired in time for the next session
}

export interface QualiCar {
  id: string;
  noCar?: boolean; // still being repaired after a crash in the previous session
  manual: boolean; // the player decides when to go out
  runs: QualiRun[]; // started and planned runs
}

export interface QualiLive {
  session: number; // 0..2
  sprint: boolean;
  seed: number;
  offset: number; // seconds after Q1 start when this session starts
  duration: number; // seconds
  clock: number; // seconds elapsed (can go past `duration` while the last laps finish)
  cars: QualiCar[];
}

export interface QualiCtx {
  track: Track;
  entries: Map<string, Entry>;
  cfg: SimConfig;
  weather: DayWeather;
}

export const MAX_RUNS = 3; // sets of tyres for a session
const OUT = 1.3; // out-lap vs flying lap
const IN = 1.4; // in-lap (with the pit lane)
const TURNAROUND = 45; // seconds in the garage between runs

function mix(...xs: number[]) {
  let h = 0x811c9dc5;
  for (const x of xs) {
    h = Math.imul(h ^ (x >>> 0), 16777619);
    h ^= h >>> 13;
  }
  return h >>> 0;
}
const strHash = (s: string) => {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};
const hash01 = (...xs: number[]) => mix(...xs) / 4294967296;

const nominal = (ctx: QualiCtx, e: Entry) => ctx.track.baseLap + 0.6 + basePace(e, ctx.track);
const tyreFor = (wet: number): Compound => {
  const b = bestTyreFor(wet);
  return b === "slick" ? "S" : b;
};
const tyreCost = (c: Compound, wet: number) => (c === "S" ? COMPOUNDS.S.offset + wetPenalty("S", wet) : wetPenalty(c, wet) + wet * 3);

/** Grip the track has gained from rubber (seconds), washed away by water. */
export function trackEvolution(live: Pick<QualiLive, "seed" | "session" | "offset" | "duration">, sec: number, wet: number) {
  // rubber laid all afternoon, plus the extra grip of a busy session
  const rubber = 0.55 * (1 - Math.exp(-sec / 2400)) + 0.22 * Math.min(1, Math.max(0, (sec - live.offset) / live.duration));
  const swing = (hash01(live.seed, live.session, 77) - 0.5) * 0.1; // not every session evolves the same
  return Math.max(0, rubber * (1 - Math.min(1, wet * 2)) + swing);
}
/** A hotter track gives a bit more grip; clouds cool it down. */
export const tempGain = (w: DayWeather, trackTemp: number) => Math.max(-0.1, Math.min(0.08, (trackTemp - (w.airTemp + 15)) * 0.008));

function buildRun(ctx: QualiCtx, live: QualiLive, id: string, start: number, k: number): QualiRun {
  const e = ctx.entries.get(id)!;
  const L = nominal(ctx, e);
  const rng = createRng(mix(live.seed, live.session, strHash(id), k));
  const T0 = live.offset + start;
  const out = L * OUT * (1 + dayConditions(ctx.weather, T0).wet * 0.15);
  const flyStart = start + out;
  const compound = tyreFor(dayConditions(ctx.weather, T0 + out * 0.7).wet); // chosen in the garage, with the radar
  const midT = live.offset + flyStart + L / 2;
  const c = dayConditions(ctx.weather, midT);
  const cons = e.driver.consistency;
  let time =
    L +
    tyreCost(compound, c.wet) -
    trackEvolution(live, midT, c.wet) -
    tempGain(ctx.weather, c.trackTemp) +
    rng.gauss() * (0.1 + (100 - cons) * 0.004) * ctx.cfg.randomness * (1 + 1.5 * c.wet);
  let note: string | undefined;
  let deleted = false;
  let loss = 0;
  if (rng.chance((100 - cons) * 0.0025 * ctx.cfg.incidents * (1 + 2 * c.wet))) {
    if (rng.chance(0.5)) {
      deleted = true;
      note = "Vuelta anulada: límites de pista";
    } else {
      loss = 0.8 + rng.next() * 1.8;
      note = `Error: pierde ${loss.toFixed(1)}s`;
    }
  }
  const n = [rng.gauss(), rng.gauss(), rng.gauss()].map((x) => x * 0.06);
  const mean = (n[0] + n[1] + n[2]) / 3;
  const sectors = n.map((x) => time / 3 + x - mean);
  if (loss) sectors[rng.int(0, 2)] += loss;
  time = sectors.reduce((a, b) => a + b, 0);
  const aborted = flyStart > live.duration;
  // rarer than in a race, but a crash or a failure can ruin anyone's qualifying
  if (!aborted) {
    const crash = (0.003 + (100 - cons) * 0.0005) * ctx.cfg.incidents * (1 + 3 * c.wet);
    const failure = (100 - e.team.reliability) * 0.0012 * ctx.cfg.incidents;
    const roll = rng.next();
    if (roll < crash + failure) {
      const isCrash = roll < crash;
      const at = 0.05 + rng.next() * 0.9;
      const reason = isCrash
        ? rng.pick(["se estrella contra las barreras", "pierde el auto y queda en la grava", "trompo y golpe contra el muro"])
        : `se detiene en pista: ${rng.pick(["motor", "hidráulica", "caja de cambios", "sistema eléctrico", "batería ERS", "frenos"]).toLowerCase()}`;
      return {
        start,
        flyStart,
        flyEnd: flyStart + time * at,
        inEnd: Number.MAX_SAFE_INTEGER, // stays out there until the end of the session
        sectors,
        time: 0,
        compound,
        note: reason,
        retired: isCrash ? "crash" : "failure",
        damage: isCrash ? rng.chance(0.45) : rng.chance(0.2),
        traffic: false,
      };
    }
  }
  const flyEnd = aborted ? flyStart : flyStart + time;
  return {
    start,
    flyStart,
    flyEnd,
    inEnd: flyEnd + L * IN * (aborted ? 0.55 : 1),
    sectors,
    time: deleted || aborted ? 0 : time,
    compound,
    note: aborted ? "Bandera a cuadros antes de abrir vuelta" : note,
    aborted,
  };
}

/** Cars bunched on the same flying lap get in each other's way. */
function applyTraffic(live: QualiLive, id: string, run: QualiRun, k: number) {
  if (run.aborted || run.retired || run.traffic !== undefined) return run;
  let near = 0;
  for (const c of live.cars) {
    if (c.id === id) continue;
    for (const r of c.runs) if (!r.aborted && Math.abs(r.flyStart - run.flyStart) < 7) near++;
  }
  const rng = createRng(mix(live.seed, live.session, strHash(id), k, 99));
  if (!near || !rng.chance(Math.min(0.35, near * 0.07))) return { ...run, traffic: false };
  const loss = 0.1 + rng.next() * 0.3;
  const sectors = [...run.sectors];
  sectors[rng.int(0, 2)] += loss;
  const time = run.time ? run.time + loss : 0;
  return {
    ...run,
    sectors,
    time,
    flyEnd: run.flyEnd + loss,
    inEnd: run.inEnd + loss,
    traffic: true,
    note: run.note ?? `Tráfico: pierde ${loss.toFixed(2)}s`,
  };
}

/** When the car is next free to leave the garage. */
export function readyAt(car: QualiCar, clock: number) {
  const done = car.runs.filter((r) => r.start <= clock);
  const last = done[done.length - 1];
  return last ? Math.max(clock, last.inEnd + TURNAROUND) : clock;
}

/** Latest moment to leave the garage and still start a flying lap before the flag. */
export function lastCall(ctx: QualiCtx, live: QualiLive, id: string) {
  const e = ctx.entries.get(id)!;
  return live.duration - nominal(ctx, e) * OUT - 3;
}

/** Expected gain (s, higher = better) of a flying lap for a run leaving the garage at `start`, as the team sees it. */
export function runOutlook(ctx: QualiCtx, live: QualiLive, id: string, start: number, perfect = false) {
  const e = ctx.entries.get(id)!;
  const L = nominal(ctx, e);
  const T0 = live.offset + start;
  const out = L * OUT;
  const midT = T0 + out + L / 2;
  // the weather radar gets less reliable the further ahead it looks
  const ahead = Math.max(0, (midT - (live.offset + live.clock)) / 60);
  const err = perfect ? 0 : (hash01(live.seed, strHash(id), Math.floor(midT / 120)) - 0.5) * Math.min(0.12, ahead * 0.01);
  const wetMid = Math.max(0, dayConditions(ctx.weather, midT).wet + err);
  const wetGarage = Math.max(0, dayConditions(ctx.weather, T0 + out * 0.7).wet + err);
  const c = dayConditions(ctx.weather, midT);
  return trackEvolution(live, midT, wetMid) + tempGain(ctx.weather, c.trackTemp) - tyreCost(tyreFor(wetGarage), wetMid);
}

/** When the engineers would send a car out from `from` on (seconds of the session). */
export function engineerPlan(ctx: QualiCtx, live: QualiLive, id: string, from: number, runsLeft = 2): number[] {
  const e = ctx.entries.get(id)!;
  const L = nominal(ctx, e);
  const last = lastCall(ctx, live, id);
  if (from > last || runsLeft <= 0) return [];
  const runLen = L * (OUT + 1 + IN) + TURNAROUND;
  const cands: { s: number; v: number }[] = [];
  for (let s = from; s <= last; s += 15) cands.push({ s, v: runOutlook(ctx, live, id, s) });
  const vs = cands.map((c) => c.v);
  const range = Math.max(...vs) - Math.min(...vs);
  const j1 = hash01(live.seed, live.session, strHash(id), 1);
  const j2 = hash01(live.seed, live.session, strHash(id), 2);
  const runs: number[] = [];
  const dryish = range < 0.3 || ctx.weather.wet.every((w) => w < 0.05);
  if (dryish) {
    // banker lap early on, then the final attempt when the track is best (crossing the line just before the flag)
    // (fixed from the session start, so re-planning later doesn't keep pushing it back)
    const final = Math.max(from, last - 5 - j2 * 55);
    const first = (0.08 + 0.3 * j1) * live.duration * 0.6;
    if (first >= from && first + runLen <= final) runs.push(first);
    runs.push(final);
    return runs.slice(-runsLeft).map((s) => Math.round(s));
  } else {
    // weather matters: go when the conditions look best, with a banker lap where it fits
    const top = cands.reduce((a, c) => (c.v > a.v ? c : a), { s: from, v: -Infinity });
    // not everyone at the same second: some go a little earlier when that costs almost nothing
    const near = cands.filter((c) => c.s <= top.s && c.s >= top.s - 60 && c.v >= top.v - 0.15);
    const best = near.length ? near[Math.floor(j2 * near.length)].s : top.s;
    runs.push(best);
    if (runsLeft >= 2) {
      const other = cands.filter((c) => Math.abs(c.s - best) >= runLen).sort((a, b) => b.v - a.v || a.s - b.s)[0];
      if (other && other.v > Math.max(...vs) - 1.5) runs.push(other.s);
    }
  }
  return runs.sort((a, b) => a - b).map((s) => Math.round(s));
}

function plannedRuns(ctx: QualiCtx, live: QualiLive, id: string, starts: number[], k0: number) {
  const runs: QualiRun[] = [];
  for (const [i, s] of starts.entries()) {
    const r = buildRun(ctx, live, id, s, k0 + i);
    runs.push(r);
    if (r.retired) break; // out of the session
  }
  return runs;
}

/** A new session with every car's plan (the player's cars follow the engineers until told otherwise). */
export function createSession(ctx: QualiCtx, index: number, ids: string[], seed: number, sprint: boolean, noCar: string[] = []): QualiLive {
  const f = sprint ? QUALI_FORMAT.sprint : QUALI_FORMAT.gp;
  const live: QualiLive = {
    session: index,
    sprint,
    seed,
    offset: sessionOffset(index, sprint),
    duration: f.minutes[index] * 60,
    clock: 0,
    cars: ids.map((id) => (noCar.includes(id) ? { id, manual: true, noCar: true, runs: [] } : { id, manual: false, runs: [] })),
  };
  for (const car of live.cars) if (!car.noCar) car.runs = plannedRuns(ctx, live, car.id, engineerPlan(ctx, live, car.id, 0), 0);
  for (const car of live.cars) car.runs = car.runs.map((r, k) => applyTraffic(live, car.id, r, k));
  return live;
}

const replaceCar = (live: QualiLive, car: QualiCar): QualiLive => ({ ...live, cars: live.cars.map((c) => (c.id === car.id ? car : c)) });

export function canGoOut(ctx: QualiCtx, live: QualiLive, id: string): string | null {
  const car = live.cars.find((c) => c.id === id);
  if (!car) return "No está en esta sesión";
  if (car.noCar) return "Auto en reparación";
  if (car.runs.some((r) => r.retired && r.start <= live.clock)) return "Fuera de la sesión";
  const started = car.runs.filter((r) => r.start <= live.clock);
  if (started.length >= MAX_RUNS) return "Sin juegos de neumáticos";
  if (readyAt(car, live.clock) > live.clock) return "En pista / cambiando neumáticos";
  if (live.clock > lastCall(ctx, live, id)) return "Ya no alcanza a abrir vuelta";
  return null;
}

/** The player sends a car out right now. */
export function goOut(ctx: QualiCtx, live: QualiLive, id: string): QualiLive {
  if (canGoOut(ctx, live, id)) return live;
  const car = live.cars.find((c) => c.id === id)!;
  const kept = car.runs.filter((r) => r.start <= live.clock);
  const run = applyTraffic(live, id, buildRun(ctx, live, id, live.clock, kept.length + 10), kept.length + 10);
  return replaceCar(live, { ...car, manual: true, runs: [...kept, run] });
}

/** The player keeps a car in the garage (cancels what was planned). */
export function stayIn(live: QualiLive, id: string): QualiLive {
  const car = live.cars.find((c) => c.id === id);
  if (!car) return live;
  return replaceCar(live, { ...car, manual: true, runs: car.runs.filter((r) => r.start <= live.clock) });
}

/** Back to the engineers' plan from now on. */
export function autoPlan(ctx: QualiCtx, live: QualiLive, id: string): QualiLive {
  const car = live.cars.find((c) => c.id === id);
  if (!car || car.noCar) return live;
  const kept = car.runs.filter((r) => r.start <= live.clock);
  const from = readyAt({ ...car, runs: kept }, live.clock);
  const starts = engineerPlan(ctx, live, id, from, Math.max(1, Math.min(PLANNED_RUNS - kept.length, MAX_RUNS - kept.length)));
  const runs = plannedRuns(ctx, live, id, starts, kept.length + 20).map((r, i) => applyTraffic(live, id, r, kept.length + 20 + i));
  return replaceCar(live, { ...car, manual: false, runs: [...kept, ...runs] });
}

const PLANNED_RUNS = 2;
const REPLAN_EVERY = 60;

/** The engineers look at the radar again: future runs of the cars on auto can move. */
function replan(ctx: QualiCtx, live: QualiLive, at: number): QualiLive {
  const view = { ...live, clock: at };
  const cars = live.cars.map((car) => {
    if (car.manual || car.noCar || car.runs.some((r) => r.retired && r.start <= at)) return car;
    const kept = car.runs.filter((r) => r.start <= at);
    const future = car.runs.filter((r) => r.start > at);
    const left = Math.max(0, Math.min(PLANNED_RUNS - kept.length, MAX_RUNS - kept.length));
    const starts = engineerPlan(ctx, view, car.id, readyAt({ ...car, runs: kept }, at), left);
    const same = starts.length === future.length && starts.every((s, i) => Math.abs(s - future[i].start) < 30);
    if (same) return car;
    const k0 = kept.length + 30 + Math.round(at / REPLAN_EVERY);
    return { ...car, runs: [...kept, ...plannedRuns(ctx, view, car.id, starts, k0)] };
  });
  const next = { ...live, cars };
  // traffic for the runs that were just planned
  next.cars = next.cars.map((c) => ({ ...c, runs: c.runs.map((r, k) => (r.traffic === undefined ? applyTraffic(next, c.id, r, k) : r)) }));
  return next;
}

/** Move the session clock forward (the engineers re-plan once a minute). */
export function advanceTo(ctx: QualiCtx, live: QualiLive, t: number): QualiLive {
  let cur = live;
  for (let c = (Math.floor(live.clock / REPLAN_EVERY) + 1) * REPLAN_EVERY; c <= Math.min(t, live.duration); c += REPLAN_EVERY) cur = replan(ctx, { ...cur, clock: c }, c);
  return { ...cur, clock: t };
}

/** When the last lap started before the flag is over. */
export function sessionEnd(live: QualiLive) {
  let end = live.duration;
  for (const c of live.cars) for (const r of c.runs) if (!r.aborted && r.flyStart <= live.duration) end = Math.max(end, r.flyEnd);
  return end;
}
export const sessionOver = (live: QualiLive) => live.clock >= sessionEnd(live);

export type QualiPhase = "garage" | "out" | "push" | "in" | "stopped";

/** Where a car is at session time `t`. `frac` is the lap fraction on the map. */
export function carPhase(live: QualiLive, id: string, t: number): { phase: QualiPhase; run?: QualiRun; k: number; frac: number; inPit: boolean } {
  const car = live.cars.find((c) => c.id === id);
  const k = car ? car.runs.findIndex((r) => r.start <= t && t < r.inEnd) : -1;
  if (!car || k < 0) return { phase: "garage", k: -1, frac: 0, inPit: true };
  const r = car.runs[k];
  if (t < r.flyStart) {
    const u = (t - r.start) / (r.flyStart - r.start);
    if (u < 0.08) return { phase: "out", run: r, k, frac: 0.985 + 0.015 * (u / 0.08), inPit: true };
    return { phase: "out", run: r, k, frac: (u - 0.08) / 0.92, inPit: false };
  }
  if (r.retired && t >= r.flyEnd) {
    const [s1, s2] = r.sectors;
    const x = r.flyEnd - r.flyStart;
    const frac = x < s1 ? x / (3 * s1) : x < s1 + s2 ? 1 / 3 + (x - s1) / (3 * s2) : 2 / 3 + (x - s1 - s2) / (3 * r.sectors[2]);
    return { phase: "stopped", run: r, k, frac, inPit: false };
  }
  if (t < r.flyEnd) {
    const [s1, s2] = r.sectors;
    const x = t - r.flyStart;
    const s3 = r.retired ? r.sectors[2] : r.flyEnd - r.flyStart - s1 - s2;
    const frac = x < s1 ? x / (3 * s1) : x < s1 + s2 ? 1 / 3 + (x - s1) / (3 * s2) : 2 / 3 + (x - s1 - s2) / (3 * s3);
    return { phase: "push", run: r, k, frac, inPit: false };
  }
  const u = (t - r.flyEnd) / Math.max(1, r.inEnd - r.flyEnd);
  if (u < 0.88) return { phase: "in", run: r, k, frac: (u / 0.88) * 0.965, inPit: false };
  return { phase: "in", run: r, k, frac: 0.965 + 0.02 * ((u - 0.88) / 0.12), inPit: true };
}

/** Completed sector times of a run at time `t`. */
export function sectorsDone(r: QualiRun, t: number): number[] {
  if (r.aborted || t <= r.flyStart) return [];
  if (r.retired) t = Math.min(t, r.flyEnd);
  const out: number[] = [];
  let acc = r.flyStart;
  for (const s of r.sectors) {
    acc += s;
    if (t >= acc - 1e-9) out.push(s);
    else break;
  }
  return out;
}

/** Session classification at time `t` (best valid lap completed so far). */
export function boardAt(live: QualiLive, t: number) {
  return live.cars
    .map((c) => {
      const laps = c.runs.filter((r) => !r.aborted && r.flyEnd <= t && r.flyStart <= live.duration);
      const valid = laps.filter((r) => r.time > 0).map((r) => r.time);
      return { id: c.id, best: valid.length ? Math.min(...valid) : 0, laps: laps.length };
    })
    .sort((a, b) => (a.best || 9999) - (b.best || 9999));
}

/** Rows of a finished session (sorted, with the eliminated drivers marked). */
export function sessionRows(live: QualiLive, advance = ADVANCE[live.session]): QualiRow[] {
  const end = sessionEnd(live);
  const rows: QualiRow[] = live.cars.map((c) => {
    const laps = c.runs.filter((r) => r.start <= end && r.flyStart <= live.duration && !r.aborted);
    const times = laps.map((r) => r.time);
    const valid = times.filter((x) => x > 0);
    return { driverId: c.id, runs: times, best: valid.length ? Math.min(...valid) : 0, eliminated: false };
  });
  rows.sort((a, b) => (a.best || 9999) - (b.best || 9999));
  if (advance > 0) rows.forEach((r, i) => (r.eliminated = i >= Math.min(advance, rows.length)));
  return rows;
}

/** Close the session in progress and open the next one (or build the grid after Q3). */
export function nextSession(ctx: QualiCtx, live: QualiLive, result: QualifyingResult): { result: QualifyingResult; live: QualiLive | null } {
  const run = advanceTo(ctx, live, Math.max(live.clock, live.duration));
  const ended = { ...run, clock: Math.max(run.clock, sessionEnd(run)) };
  const rows = sessionRows(ended);
  const session: QualiSession = { name: (["Q1", "Q2", "Q3"] as SessionName[])[live.session], rows };
  const sessions = [...result.sessions.slice(0, live.session), session];
  if (live.session >= 2) {
    const grid = [
      ...sessions[2].rows.map((r) => r.driverId),
      ...(sessions[1]?.rows.filter((r) => r.eliminated).map((r) => r.driverId) ?? []),
      ...(sessions[0]?.rows.filter((r) => r.eliminated).map((r) => r.driverId) ?? []),
    ];
    const q3 = live.offset + live.duration / 2;
    return { result: { ...result, sessions, grid, wet: +dayConditions(ctx.weather, q3).wet.toFixed(2) }, live: null };
  }
  const through = rows.filter((r) => !r.eliminated).map((r) => r.driverId);
  const damaged = ended.cars.filter((c) => c.runs.some((r) => r.damage && r.start <= ended.clock)).map((c) => c.id);
  return { result: { ...result, sessions }, live: createSession(ctx, live.session + 1, through, live.seed, live.sprint, damaged) };
}

/** Run whatever is left of the qualifying with every car on its current plan. */
export function finishQualifying(ctx: QualiCtx, live: QualiLive | null, result: QualifyingResult): QualifyingResult {
  let cur = live;
  let res = result;
  while (cur) {
    const step = nextSession(ctx, cur, res);
    res = step.result;
    cur = step.live;
  }
  return res;
}

export function startQualifying(ctx: QualiCtx, raceId: number, seed: number, sprint = false) {
  const live = createSession(ctx, 0, Array.from(ctx.entries.keys()), seed, sprint);
  return { live, result: { raceId, sessions: [], grid: [] } as QualifyingResult };
}

/** A whole qualifying at once (AI plans for everyone). */
export function runQualifying(
  race: Race,
  entries: Entry[],
  seed: number,
  cfg: SimConfig = DEFAULT_SIM_CONFIG,
  weather?: DayWeather,
): QualifyingResult {
  const ctx: QualiCtx = {
    track: race.track,
    entries: new Map(entries.map((e) => [e.driver.id, e])),
    cfg,
    weather: weather ?? generateDayWeather(race.track, seed, false),
  };
  const { live, result } = startQualifying(ctx, race.id, seed);
  return finishQualifying(ctx, live, result);
}
