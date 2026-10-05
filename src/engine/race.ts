// Lap-by-lap race simulation. Pure functions: (state) -> new state.
import type { Race } from "@/data/f1Data";
import { pointsSystem } from "@/data/f1Data";
import { createRng, type Rng } from "./rng";
import type { CarState, ClassifiedRow, Compound, DriverMode, Entry, RaceEvent, RaceState, SimConfig, Stint } from "./types";
import { DEFAULT_SIM_CONFIG } from "./types";
import { COMPOUNDS, DIRTY_AIR_WINDOW, MIN_GAP, MODES, overtakeChance, raceLapTime } from "./model";
import { advancePlan, aiPitDecision, buildPlan, normalisePlan, recommendPlans } from "./strategy";

const clone = <T,>(x: T): T => structuredClone(x);

export function createRace(
  race: Race,
  grid: Entry[],
  seed: number,
  config: SimConfig = DEFAULT_SIM_CONFIG,
  playerTeamId: string | null = null,
): RaceState {
  const rng = createRng(seed);
  const track = race.track;
  const cars: CarState[] = grid.map((entry, i) => {
    const controlled = entry.team.id === playerTeamId;
    // player cars start from the engineer's recommendation (editable before the start)
    const plan = controlled ? recommendPlans(entry, track, 1)[0].plan : buildPlan(track, entry.driver.tyreMgmt, rng);
    return {
      id: entry.driver.id,
      entry,
      grid: i + 1,
      // staggered grid: ~8m per slot, plus reaction time
      total: i * 0.22 + Math.abs(rng.gauss()) * 0.12,
      lastLap: 0,
      bestLap: 0,
      compound: plan[0].compound,
      tyreAge: 0,
      usedCompounds: [plan[0].compound],
      plan,
      stops: 0,
      mode: "normal",
      pitRequest: null,
      controlled,
      status: "running",
      pittedThisLap: false,
    };
  });
  return {
    raceId: race.id,
    track,
    config,
    rngState: rng.state(),
    lap: 0,
    totalLaps: track.laps,
    cars,
    events: [{ lap: 0, type: "start", text: `Se apagan las luces en ${race.circuit}`, drivers: [] }],
    safetyCar: { active: false, lapsLeft: 0, restartLap: false },
    fastest: null,
    finished: false,
    strategyConfirmed: !playerTeamId,
  };
}

/** Replace a car's whole tyre plan (pre-race planner). */
export function setPlan(state: RaceState, driverId: string, plan: Stint[]): RaceState {
  if (state.lap > 0 || plan.length === 0) return state;
  const clean = normalisePlan(plan, state.totalLaps);
  return {
    ...state,
    cars: state.cars.map((c) =>
      c.id === driverId ? { ...c, plan: clean, compound: clean[0].compound, usedCompounds: [clean[0].compound] } : c,
    ),
  };
}

export function confirmStrategy(state: RaceState): RaceState {
  return { ...state, strategyConfirmed: true };
}

const name = (c: CarState) => c.entry.driver.shortName;

function doPitStop(car: CarState, compound: Compound, state: RaceState, rng: Rng, events: RaceEvent[], lap: number) {
  const { track } = state;
  const scFactor = state.safetyCar.active ? 0.55 : 1;
  let stationary = 2.2 + (100 - car.entry.team.pitCrew) * 0.025 + Math.abs(rng.gauss()) * 0.25;
  let slow = "";
  if (rng.chance(0.03 + (100 - car.entry.team.pitCrew) * 0.002)) {
    const extra = 2 + rng.next() * 6;
    stationary += extra;
    slow = ` (parada lenta, ${stationary.toFixed(1)}s)`;
  }
  const pitTime = track.pitLoss * scFactor + stationary;
  car.total += pitTime;
  car.lastPitTime = pitTime;
  car.plan = advancePlan(car, compound, lap, state.totalLaps);
  car.compound = compound;
  car.tyreAge = 0;
  if (!car.usedCompounds.includes(compound)) car.usedCompounds.push(compound);
  car.stops += 1;
  car.pitRequest = null;
  car.pittedThisLap = true;
  events.push({
    lap,
    type: "pit",
    text: `${name(car)} entra a pits → ${COMPOUNDS[compound].name}${slow}`,
    drivers: [car.id],
  });
}

/** Simulate one lap for the whole field. */
export function simulateLap(prev: RaceState): RaceState {
  if (prev.finished) return prev;
  const state = clone(prev);
  const rng = createRng(state.rngState);
  const lap = state.lap + 1;
  const { track, config } = state;
  const events: RaceEvent[] = [];
  const sc = state.safetyCar;
  const scLap = sc.active;
  const restart = sc.restartLap;
  sc.restartLap = false;

  const running = state.cars.filter((c) => c.status === "running");
  const retired = state.cars.filter((c) => c.status === "dnf");

  // previous intervals for dirty air
  const prevTotals = running.map((c) => c.total);
  const startTotal = new Map(running.map((c) => [c.id, c.total]));
  const startRank = new Map(running.map((c, i) => [c.id, i]));

  let newSafetyCar = false;

  running.forEach((car, idx) => {
    car.pittedThisLap = false;
    car.lastPitTime = 0;
    car.tyreAge += 1;
    const e = car.entry;

    // --- Retirements ---
    const risk = MODES[car.mode].risk;
    const lap1 = lap === 1 ? 4 : 1;
    const mech = (100 - e.team.reliability) * 0.00011 * config.incidents;
    const crash = (100 - e.driver.consistency) * 0.00004 * config.incidents * lap1 * risk * (scLap ? 0.1 : 1);
    if (rng.chance(mech)) {
      car.status = "dnf";
      car.dnfLap = lap;
      car.dnfReason = rng.pick(["Motor", "Hidráulica", "Caja de cambios", "Sistema eléctrico", "Frenos", "Batería ERS"]);
      events.push({ lap, type: "dnf", text: `${name(car)} abandona: ${car.dnfReason}`, drivers: [car.id] });
      if (config.safetyCar && rng.chance(0.25)) newSafetyCar = true;
      return;
    }
    if (rng.chance(crash)) {
      car.status = "dnf";
      car.dnfLap = lap;
      car.dnfReason = lap === 1 ? "Accidente en la largada" : "Accidente";
      events.push({ lap, type: "dnf", text: `${name(car)} se estrella — fuera de carrera`, drivers: [car.id] });
      if (config.safetyCar && rng.chance(0.55)) newSafetyCar = true;
      return;
    }

    // --- Lap time ---
    let time: number;
    let mistakeLoss = 0;
    if (scLap) {
      time = track.baseLap * 1.4 + rng.next() * 0.3;
    } else {
      time = raceLapTime({
        entry: e,
        track,
        compound: car.compound,
        tyreAge: car.tyreAge,
        mode: car.mode,
        lap,
        totalLaps: state.totalLaps,
        cfg: config,
        noise: rng.gauss(),
      });
      if (lap === 1) time += 2.5 + idx * 0.05; // standing start
      // dirty air
      if (idx > 0) {
        const interval = prevTotals[idx] - prevTotals[idx - 1];
        if (interval < DIRTY_AIR_WINDOW) time += 0.15 * (1 - interval / DIRTY_AIR_WINDOW);
      }
      // mistakes
      if (rng.chance((100 - e.driver.consistency) * 0.00025 * config.incidents * risk)) {
        const loss = 1 + rng.next() * 3;
        time += loss;
        mistakeLoss = loss;
        events.push({ lap, type: "mistake", text: `${name(car)} se pasa de largo y pierde ${loss.toFixed(1)}s`, drivers: [car.id] });
      }
    }
    car.lastLap = time;
    car.total += time;

    // --- Sector times (3 per lap) ---
    let sectors: number[];
    if (scLap) sectors = [time / 3, time / 3, time / 3];
    else {
      const n = [rng.gauss(), rng.gauss(), rng.gauss()].map((x) => x * 0.06);
      const mean = (n[0] + n[1] + n[2]) / 3;
      sectors = n.map((x) => (time - mistakeLoss) / 3 + x - mean);
      if (mistakeLoss) sectors[rng.int(0, 2)] += mistakeLoss;
    }
    car.lastSectors = sectors; // raw split; made consistent with the final order below

    // --- Pit stop at end of lap ---
    if (lap < state.totalLaps) {
      const call = car.pitRequest ?? aiPitDecision(car, lap, state.totalLaps, track, scLap);
      if (call) doPitStop(car, call, state, rng, events, lap);
    }
  });

  // --- Order & overtakes ---
  const order = running.filter((c) => c.status === "running");
  const bonus = lap === 1 ? 1.2 : restart ? 0.6 : 0;
  for (let i = 1; i < order.length; i++) {
    let j = i;
    while (j > 0) {
      const behind = order[j];
      const ahead = order[j - 1];
      if (behind.total >= ahead.total + MIN_GAP) break;
      const pitSwap = behind.pittedThisLap || ahead.pittedThisLap;
      if (pitSwap || scLap) {
        if (behind.total < ahead.total && !scLap) {
          order[j] = ahead;
          order[j - 1] = behind;
          j--;
          continue;
        }
        if (scLap && behind.total < ahead.total) {
          // no passing under SC (pit lane order still counts)
          if (pitSwap) {
            order[j] = ahead;
            order[j - 1] = behind;
            j--;
            continue;
          }
          behind.total = ahead.total + MIN_GAP;
        }
        break;
      }
      if (behind.total < ahead.total) {
        const delta = ahead.total - behind.total;
        const p = overtakeChance({ delta, attacker: behind.entry, defender: ahead.entry, track, bonus });
        if (rng.chance(p)) {
          order[j] = ahead;
          order[j - 1] = behind;
          ahead.total = Math.max(ahead.total, behind.total + MIN_GAP + rng.next() * 0.3);
          behind.total += 0.1;
          ahead.total += 0.1;
          events.push({
            lap,
            type: "overtake",
            text: `${name(behind)} adelanta a ${name(ahead)} por P${j}`,
            drivers: [behind.id, ahead.id],
          });
          j--;
          continue;
        }
        behind.total = ahead.total + MIN_GAP + rng.next() * 0.3;
      }
      break;
    }
  }

  // --- Safety car ---
  if (scLap) {
    // field bunches up behind the safety car
    for (let i = 1; i < order.length; i++) {
      const interval = order[i].total - order[i - 1].total;
      order[i].total = order[i - 1].total + Math.max(0.5, interval * 0.35);
    }
    sc.lapsLeft -= 1;
    if (sc.lapsLeft <= 0) {
      sc.active = false;
      sc.restartLap = true;
      events.push({ lap, type: "sc_end", text: "Safety car entra a pits — ¡relanzamiento!", drivers: [] });
    }
  } else if (config.safetyCar && lap < state.totalLaps - 2) {
    const randomSc = rng.chance((state.track.scChance * 0.4) / state.totalLaps);
    if (newSafetyCar || randomSc) {
      sc.active = true;
      sc.lapsLeft = rng.int(3, 5);
      events.push({
        lap,
        type: "sc",
        text: newSafetyCar ? "🚨 Safety car en pista" : "🚨 Safety car: escombros en la pista",
        drivers: [],
      });
    }
  }

  // --- Lap & sector times consistent with what happened on track ---
  // Each car's real lap time is the time it actually spent (incl. being held up,
  // battles and the pit lane). Sector crossing times keep a car that stayed behind
  // the car in front behind it at every sector line, so the timing screen, the live
  // order and the gaps always agree.
  const cross = new Map<string, [number, number]>();
  order.forEach((car, i) => {
    const from = startTotal.get(car.id)!;
    const to = car.total;
    const pit = car.lastPitTime ?? 0; // the stop happens at the end of the lap, all of it in S3
    const raw = car.lastSectors ?? [1, 1, 1];
    const sum = raw[0] + raw[1] + raw[2] || 1;
    const onTrack = to - from - pit;
    let c1 = from + (onTrack * raw[0]) / sum;
    let c2 = from + (onTrack * (raw[0] + raw[1])) / sum;
    const prev = order[i - 1];
    if (prev && startRank.get(car.id)! > startRank.get(prev.id)!) {
      const [p1, p2] = cross.get(prev.id)!;
      c1 = Math.max(c1, p1 + 0.1);
      c2 = Math.max(c2, p2 + 0.1);
    }
    c2 = Math.min(Math.max(c2, c1 + 0.1), to - pit - 0.05);
    c1 = Math.min(c1, c2 - 0.05);
    cross.set(car.id, [c1, c2]);
    car.lastSectors = [c1 - from, c2 - c1, to - c2];
    car.lastLap = to - from;

    // personal / overall bests only from clean laps (no SC, no pit lane, not the start)
    if (scLap || lap === 1 || car.pittedThisLap) return;
    const best = car.bestSectors ?? [0, 0, 0];
    state.bestSectors ??= [null, null, null];
    car.lastSectors.forEach((t, k) => {
      if (!best[k] || t < best[k]) best[k] = t;
      const overall = state.bestSectors![k];
      if (!overall || t < overall.time) state.bestSectors![k] = { time: t, driverId: car.id };
    });
    car.bestSectors = best;
    const time = car.lastLap;
    if (car.bestLap === 0 || time < car.bestLap) car.bestLap = time;
    if (!state.fastest || time < state.fastest.time) {
      const changedHands = state.fastest?.driverId !== car.id;
      state.fastest = { driverId: car.id, time, lap };
      if (lap > 3 && changedHands) events.push({ lap, type: "fastest", text: `Vuelta rápida de ${name(car)}: ${formatLap(time)}`, drivers: [car.id] });
    }
  });

  const newlyRetired = running.filter((c) => c.status === "dnf");
  state.cars = [...order, ...newlyRetired, ...retired];
  state.lap = lap;
  state.rngState = rng.state();

  if (lap >= state.totalLaps) {
    // Dry-race rule: at least two different compounds
    for (const c of order) {
      if (c.usedCompounds.length < 2) {
        c.total += 30;
        events.push({ lap, type: "mistake", text: `${name(c)} penalizado con 30s: no usó dos compuestos`, drivers: [c.id] });
      }
    }
    order.sort((a, b) => a.total - b.total);
    state.cars = [...order, ...newlyRetired, ...retired];
    state.finished = true;
    const winner = order[0];
    if (winner) events.push({ lap, type: "finish", text: `🏁 ¡${winner.entry.driver.name} gana la carrera!`, drivers: [winner.id] });
  }
  state.events = [...state.events, ...events];
  return state;
}

export function simulateToEnd(state: RaceState): RaceState {
  let s = state;
  while (!s.finished) s = simulateLap(s);
  return s;
}

/** Manager controls */
export function setMode(state: RaceState, driverId: string, mode: DriverMode): RaceState {
  return { ...state, cars: state.cars.map((c) => (c.id === driverId ? { ...c, mode } : c)) };
}
export function requestPit(state: RaceState, driverId: string, compound: Compound | null): RaceState {
  return { ...state, cars: state.cars.map((c) => (c.id === driverId ? { ...c, pitRequest: compound } : c)) };
}

const otherCompound = (c: Compound): Compound => (c === "H" ? "M" : "H");

/** Before the start: choose the starting tyre (keeps the plan valid: two compounds). */
export function setStartTyre(state: RaceState, driverId: string, compound: Compound): RaceState {
  if (state.lap > 0) return state;
  return {
    ...state,
    cars: state.cars.map((c) => {
      if (c.id !== driverId) return c;
      const plan = c.plan.map((s, i) => (i === 0 ? { ...s, compound } : s));
      if (plan.length > 1 && plan.every((s) => s.compound === compound)) {
        plan[1] = { ...plan[1], compound: otherCompound(compound) };
      }
      return { ...c, compound, usedCompounds: [compound], plan };
    }),
  };
}

/** Edit the next planned stop: lap, compound, add or remove it. */
export function editNextStop(
  state: RaceState,
  driverId: string,
  change: { lap?: number; compound?: Compound; remove?: boolean; add?: boolean },
): RaceState {
  return {
    ...state,
    cars: state.cars.map((c) => {
      if (c.id !== driverId) return c;
      let plan = c.plan.map((s) => ({ ...s }));
      const minLap = state.lap + 1;
      const maxLap = state.totalLaps - 1;
      if (change.add && plan.length === 1) {
        const lap = Math.min(maxLap, Math.max(minLap, Math.round((state.lap + state.totalLaps) / 2)));
        plan = [{ compound: plan[0].compound, untilLap: lap }, { compound: otherCompound(c.compound), untilLap: state.totalLaps }];
      }
      if (change.remove && plan.length > 1) {
        // keep running the current tyre until the following stop (or the flag)
        plan = [{ compound: plan[0].compound, untilLap: plan[1].untilLap }, ...plan.slice(2)];
      }
      if (plan.length > 1) {
        if (change.lap !== undefined) {
          const upper = plan.length > 2 ? plan[1].untilLap - 1 : maxLap;
          plan[0].untilLap = Math.max(minLap, Math.min(upper, change.lap));
        }
        if (change.compound) plan[1].compound = change.compound;
      }
      return { ...c, plan };
    }),
  };
}

export function formatLap(t: number) {
  if (!t || !isFinite(t)) return "—";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}

/** Gap/interval strings for the timing tower. */
export function gapToLeader(state: RaceState, car: CarState, leader: CarState) {
  if (car.status === "dnf") return "DNF";
  if (car.id === leader.id) return "Líder";
  const gap = car.total - leader.total;
  if (state.lap === 0) return "—";
  const avgLap = leader.total / state.lap;
  if (gap > avgLap) {
    const laps = Math.floor(gap / avgLap);
    return `+${laps} ${laps === 1 ? "vuelta" : "vueltas"}`;
  }
  return `+${gap.toFixed(3)}`;
}

export function classify(state: RaceState): ClassifiedRow[] {
  const running = state.cars.filter((c) => c.status === "running");
  const dnf = state.cars
    .filter((c) => c.status === "dnf")
    .sort((a, b) => (b.dnfLap ?? 0) - (a.dnfLap ?? 0));
  const leader = running[0];
  return [...running, ...dnf].map((c, i) => {
    const finished = c.status === "running";
    const position = i + 1;
    return {
      position,
      driverId: c.id,
      teamId: c.entry.team.id,
      grid: c.grid,
      status: finished ? "finished" : "dnf",
      gap: !finished ? `DNF (V${c.dnfLap})` : i === 0 ? "Ganador" : gapToLeader(state, c, leader),
      points: finished ? pointsSystem[position] ?? 0 : 0,
      stops: c.stops,
      bestLap: c.bestLap,
      dnfReason: c.dnfReason,
    };
  });
}
