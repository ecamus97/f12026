// Lap-by-lap race simulation. Pure functions: (state) -> new state.
import type { Race } from "@/data/f1Data";
import { pointsSystem } from "@/data/f1Data";
import { createRng, type Rng } from "./rng";
import type { CarState, ClassifiedRow, Compound, DriverMode, Entry, ErsMode, FuelMode, Instruction, RaceEvent, RaceState, SimConfig, Stint, TeamOrder } from "./types";
import { obeyChance } from "./mood";
import { DEFAULT_SIM_CONFIG } from "./types";
import {
  bestTyreFor, COMPOUNDS, DIRTY_AIR_WINDOW, ERS_MODES, FUEL_MARGIN, FUEL_MODES, isWetTyre, MIN_GAP, MODES,
  overtakeChance, raceLapTime, tyreLife,
} from "./model";
import { advancePlan, aiPitDecision, aiWeatherPit, buildPlan, normalisePlan, recommendPlans, replan, weatherStyle } from "./strategy";
import { generateWeather, type WeatherTimeline } from "./weather";

const clone = <T,>(x: T): T => structuredClone(x);

export function createRace(
  race: Race,
  grid: Entry[],
  seed: number,
  config: SimConfig = DEFAULT_SIM_CONFIG,
  playerTeamId: string | null = null,
  weather?: WeatherTimeline,
): RaceState {
  const rng = createRng(seed);
  const track = race.track;
  const wx = weather ?? generateWeather(track, track.laps, seed);
  const startTyre = bestTyreFor(wx.wet[0]);
  const cars: CarState[] = grid.map((entry, i) => {
    const controlled = entry.team.id === playerTeamId;
    // player cars start from the engineer's recommendation (editable before the start)
    let plan = controlled ? recommendPlans(entry, track, 1)[0].plan : buildPlan(track, entry.driver.tyreMgmt, rng);
    // wet start: on a borderline track the gamblers start on the less wet tyre
    let start: "slick" | "I" | "W" = startTyre;
    if (!controlled && start === "slick" && (wx.wet[0] ?? 0) > 0.1 && weatherStyle(entry.team.id, race.id).margin > 2) start = "I"; // damp: the careful ones play safe
    else if (!controlled && start !== "slick") {
      const st = weatherStyle(entry.team.id, race.id);
      const w0 = wx.wet[0] ?? 0;
      if (st.early && start === "W" && w0 < 0.8) start = "I";
      else if (st.margin > 2 && start === "I" && w0 > 0.55) start = "W"; // the careful ones go full wets
    }
    if (start !== "slick") plan = replan(start, 0, track.laps, track, entry.driver.tyreMgmt);
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
      fuelMode: "normal",
      ersMode: "balanced",
      fuel: track.laps + FUEL_MARGIN,
      battery: 80,
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
    weather: wx,
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

/** Stewards: a time penalty, served at the next stop or added to the final time. */
function givePenalty(car: CarState, secs: number, reason: string, lap: number, events: RaceEvent[], at?: number) {
  car.penalty = (car.penalty ?? 0) + secs;
  car.penalties = [...(car.penalties ?? []), { lap, secs, reason }];
  events.push({
    lap,
    type: "penalty",
    text: `⚖️ Penalización de ${secs}s para ${name(car)}: ${reason}`,
    drivers: [car.id],
    at,
  });
}

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
  // a pending time penalty is served first: the car waits in the box before the crew can touch it
  const served = car.penalty ?? 0;
  if (served > 0) {
    stationary += served;
    car.penalty = 0;
    events.push({ lap, type: "penalty", text: `⚖️ ${name(car)} cumple su penalización de ${served}s en boxes`, drivers: [car.id], at: 0.97 });
  }
  if (car.damage) {
    stationary += 4 + rng.next() * 2; // new nose and front wing
    slow += " · cambia el alerón delantero";
    car.damage = undefined;
  }
  const pitTime = track.pitLoss * scFactor + stationary;
  car.pitFrom = { compound: car.compound, tyreAge: car.tyreAge, stops: car.stops };
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
  // pit lane infringements
  if (lap < state.totalLaps) {
    if (rng.chance(0.003 + (100 - car.entry.team.pitCrew) * 0.0003)) givePenalty(car, 5, "liberación insegura en boxes", lap, events, 0.99);
    else if (rng.chance(0.0015)) givePenalty(car, 5, "exceso de velocidad en el pit lane", lap, events, 0.99);
  }
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

  // restart after a red flag: tyre choices are fitted in the pit lane, then a standing start
  const standing = lap === 1 || !!state.standingRestart;
  if (state.redFlag) {
    for (const car of state.cars) {
      const c = state.redFlag.choices[car.id];
      if (!c || car.status !== "running") continue;
      if (c !== car.compound) car.plan = advancePlan(car, c, lap - 1, state.totalLaps);
      car.compound = c;
      car.tyreAge = 0;
      if (!car.usedCompounds.includes(c)) car.usedCompounds.push(c);
    }
    state.redFlag = null;
    events.push({ lap, type: "green", text: "🟢 Bandera verde: largada detenida, se reanuda la carrera", drivers: [], at: 0.01 });
  }
  state.standingRestart = false;
  let newRedFlag: string | null = null;
  let incidentAt = 0.5; // where on the lap the incident behind a safety car / red flag happened
  const stopAt = (car: CarState) => {
    const at = +(0.08 + rng.next() * 0.84).toFixed(3);
    car.dnfAt = at;
    return at;
  };

  const running = state.cars.filter((c) => c.status === "running");
  const retired = state.cars.filter((c) => c.status === "dnf");

  // --- Weather on this lap ---
  const wx = state.weather;
  const rainNow = wx?.rain[Math.min(lap, wx.rain.length - 1)] ?? 0;
  const rainBefore = wx?.rain[Math.min(lap - 1, wx.rain.length - 1)] ?? 0;
  const wetStart = wx?.wet[Math.max(0, lap - 1)] ?? 0;
  const wetEnd = wx?.wet[Math.min(lap, wx.wet.length - 1)] ?? 0;
  const wet = (wetStart + wetEnd) / 2;
  const wetSoon = wx ? Math.max(...wx.wet.slice(lap, lap + 3)) : 0;
  const trackTemp = wx?.trackTemp[Math.min(lap, wx.trackTemp.length - 1)];
  if (wx && lap > 1) {
    if (rainNow >= 0.08 && rainBefore < 0.08) events.push({ lap, type: "weather", text: "🌧️ Empieza a llover", drivers: [], at: 0.15 });
    if (rainNow < 0.08 && rainBefore >= 0.08) events.push({ lap, type: "weather", text: "🌤️ Deja de llover", drivers: [], at: 0.15 });
    if (rainNow >= 0.6 && rainBefore < 0.6) events.push({ lap, type: "weather", text: "⛈️ La lluvia se intensifica: pista para neumáticos de lluvia extrema", drivers: [], at: 0.15 });
    if (wetEnd < 0.2 && wetStart >= 0.2) events.push({ lap, type: "weather", text: "☀️ La pista se está secando: ya se puede volver a los slicks", drivers: [], at: 0.15 });
    if (wetEnd >= 0.2 && wetStart < 0.2) events.push({ lap, type: "weather", text: "💧 La pista está mojada: los slicks ya no funcionan", drivers: [], at: 0.15 });
  }

  // previous intervals for dirty air
  const prevTotals = running.map((c) => c.total);
  const startTotal = new Map(running.map((c) => [c.id, c.total]));
  const startRank = new Map(running.map((c, i) => [c.id, i]));

  let newSafetyCar = false;
  // cars that went off or limped this lap (a mistake, a puncture): whoever is right behind goes straight by
  const slowed = new Map<string, number>();

  running.forEach((car, idx) => {
    car.pittedThisLap = false;
    car.lastPitTime = 0;
    car.pitFrom = undefined;
    car.prevLastLap = car.lastLap;
    car.tyreAge = +(car.tyreAge + (scLap ? 0.25 : 1)).toFixed(2); // behind the safety car the tyres hardly wear
    const e = car.entry;

    // --- Battles: instructions to attack the car ahead or defend from the one behind ---
    const gapAheadNow = idx > 0 ? prevTotals[idx] - prevTotals[idx - 1] : 99;
    const gapBehindNow = idx < running.length - 1 ? prevTotals[idx + 1] - prevTotals[idx] : 99;
    if (!car.controlled) {
      // the AI fights hard near the end, or when someone is right behind
      const late = state.totalLaps - lap < 15;
      car.instruction = late && gapAheadNow < 1.0 ? "attack" : gapBehindNow < 0.7 || (late && gapBehindNow < 1.0) ? "defend" : "free";
    }
    const attacking = !scLap && !standing && car.instruction === "attack" && gapAheadNow < 1.0;
    const defending = !scLap && !standing && car.instruction === "defend" && gapBehindNow < 1.0;
    const battleRisk = (attacking ? 1.2 : 1) * (defending ? 1.15 : 1);

    // --- Energy (ERS) and fuel ---
    if (!car.controlled) {
      const gapAhead = idx > 0 ? prevTotals[idx] - prevTotals[idx - 1] : 99;
      const bat = car.battery ?? 80;
      car.ersMode = scLap || bat < 25 ? "harvest" : gapAhead < 1.0 && bat > 30 ? "deploy" : bat > 85 ? "deploy" : "balanced";
    }
    const ers = car.ersMode ?? "balanced";
    const blend = car.modeBlend;
    car.modeBlend = undefined;
    const bf = blend ? Math.max(0, Math.min(1, blend.frac)) : 0; // share of the lap run with the previous modes
    const batteryBefore = car.battery ?? 80;
    const charge = blend ? ERS_MODES[blend.ersMode].charge * bf + ERS_MODES[ers].charge * (1 - bf) : ERS_MODES[ers].charge;
    // fighting wheel to wheel uses extra energy
    const battleDrain = attacking ? 4 : defending ? 3 : 0;
    car.battery = Math.max(0, Math.min(100, batteryBefore + (scLap ? 15 : charge) - battleDrain));
    const lapsToGo = state.totalLaps - lap + 1;
    const burnRate = blend
      ? FUEL_MODES[blend.fuelMode].burn * bf + FUEL_MODES[car.fuelMode ?? "normal"].burn * (1 - bf)
      : FUEL_MODES[car.fuelMode ?? "normal"].burn;
    let burn = burnRate * (scLap ? 0.55 : 1);
    let liftAndCoast = 0;
    if ((car.fuel ?? lapsToGo) < lapsToGo - 0.05 && !scLap) {
      // not enough fuel: forced to lift and coast
      liftAndCoast = 1.0;
      burn *= 0.85;
      if (!car.fuelWarned) {
        car.fuelWarned = true;
        events.push({ lap, type: "mistake", text: `${name(car)} tiene que ahorrar combustible (lift & coast)`, drivers: [car.id] });
      }
    }
    car.fuel = (car.fuel ?? lapsToGo) - burn;
    if (car.fuel < -0.1) {
      car.status = "dnf";
      car.dnfLap = lap;
      car.dnfReason = "Sin combustible";
      events.push({ lap, type: "dnf", text: `${name(car)} se queda sin combustible`, drivers: [car.id], at: stopAt(car) });
      return;
    }

    // --- Retirements ---
    const slickOnWet = !isWetTyre(car.compound) && wet > 0.3 ? 1 + 8 * (wet - 0.3) : 1;
    const risk = MODES[car.mode].risk * (1 + 2 * wet) * slickOnWet * battleRisk;
    const lap1 = lap === 1 ? 4 : 1;
    const mech = (100 - e.team.reliability) * 0.00011 * config.incidents;
    const crash = (100 - e.driver.consistency) * 0.00004 * config.incidents * lap1 * risk * (scLap ? 0.1 : 1);
    if (rng.chance(mech)) {
      car.status = "dnf";
      car.dnfLap = lap;
      car.dnfReason = rng.pick(["Motor", "Hidráulica", "Caja de cambios", "Sistema eléctrico", "Frenos", "Batería ERS"]);
      const at = stopAt(car);
      events.push({ lap, type: "dnf", text: `${name(car)} abandona: ${car.dnfReason}`, drivers: [car.id], at });
      if (config.safetyCar && rng.chance(0.25)) {
        newSafetyCar = true;
        incidentAt = at;
      }
      return;
    }
    if (rng.chance(crash)) {
      car.status = "dnf";
      car.dnfLap = lap;
      car.dnfReason = lap === 1 ? "Accidente en la largada" : "Accidente";
      const at = lap === 1 ? +(0.03 + rng.next() * 0.2).toFixed(3) : stopAt(car);
      car.dnfAt = at;
      events.push({ lap, type: "dnf", text: `${name(car)} se estrella — fuera de carrera`, drivers: [car.id], at });
      // a heavy crash (barriers damaged, debris everywhere) stops the race
      if (config.safetyCar && !newRedFlag && lap < state.totalLaps - 2 && rng.chance(0.13 * (1 + wet * 1.5) * (lap === 1 ? 1.5 : 1))) {
        newRedFlag = name(car);
        incidentAt = at;
      } else if (config.safetyCar && rng.chance(0.55)) {
        newSafetyCar = true;
        incidentAt = at;
      }
      return;
    }

    // --- Lap time ---
    let time: number;
    let mistakeLoss = 0;
    if (scLap) {
      time = track.baseLap * 1.4 + wet * 4 + rng.next() * 0.3;
    } else {
      const lapParams = {
        entry: e,
        track,
        compound: car.compound,
        tyreAge: car.tyreAge,
        mode: car.mode,
        lap,
        totalLaps: state.totalLaps,
        cfg: config,
        noise: rng.gauss(),
        fuelMode: car.fuelMode,
        ersMode: ers,
        battery: batteryBefore,
        wet,
        trackTemp,
      };
      time = raceLapTime(lapParams);
      if (blend && bf > 0) {
        const before = raceLapTime({ ...lapParams, mode: blend.mode, fuelMode: blend.fuelMode, ersMode: blend.ersMode });
        time = before * bf + time * (1 - bf);
      }
      time += liftAndCoast;
      if (car.damage) time += car.damage.pace; // broken front wing
      if (attacking) time -= 0.05; // pushing to stay in the slipstream
      if (defending) time += 0.06; // defensive lines cost time
      if (standing) time += 2.5 + idx * 0.05; // standing start (race start or red-flag restart)
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
        slowed.set(car.id, loss);
        events.push({ lap, type: "mistake", text: `${name(car)} se pasa de largo y pierde ${loss.toFixed(1)}s`, drivers: [car.id] });
      }
      // track limits: three warnings, then 5 seconds (and 10 more after three more)
      const limitsP = (100 - e.driver.consistency) * 0.0015 * config.incidents * (1 + wet) * (car.mode === "push" ? 1.6 : car.mode === "conserve" ? 0.6 : 1) * (attacking ? 1.3 : 1);
      if (!standing && rng.chance(limitsP)) {
        car.trackLimits = (car.trackLimits ?? 0) + 1;
        const n = car.trackLimits;
        if (n === 3) events.push({ lap, type: "mistake", text: `🏁 Bandera blanca y negra para ${name(car)}: tercera advertencia por límites de pista`, drivers: [car.id] });
        if (n === 4) givePenalty(car, 5, "límites de pista (4 infracciones)", lap, events);
        if (n === 7) givePenalty(car, 10, "límites de pista (7 infracciones)", lap, events);
      }
      if (lap === 1 && rng.chance(0.003 * config.incidents)) givePenalty(car, 5, "salida anticipada", lap, events, 0.05);
      // tyres worn past their life can puncture: a slow lap back to the pits
      if (!isWetTyre(car.compound)) {
        const worn = car.tyreAge / tyreLife(car.compound, track, e.driver.tyreMgmt);
        const p = worn > 1.2 ? Math.min(0.3, ((worn - 1.2) * 2.5) ** 2 * 0.5 * MODES[car.mode].wear * config.incidents) : 0;
        if (p > 0 && rng.chance(p)) {
          if (rng.chance(0.06)) {
            car.status = "dnf";
            car.dnfLap = lap;
            car.dnfReason = "Pinchazo";
            const at = stopAt(car);
            events.push({ lap, type: "dnf", text: `💥 ${name(car)} pincha y daña el auto: abandona`, drivers: [car.id], at });
            if (config.safetyCar && rng.chance(0.3)) {
              newSafetyCar = true;
              incidentAt = at;
            }
            return;
          }
          const loss = 16 + rng.next() * 12;
          time += loss;
          mistakeLoss += loss;
          slowed.set(car.id, (slowed.get(car.id) ?? 0) + loss);
          events.push({
            lap,
            type: "puncture",
            text: `💥 Pinchazo de ${name(car)} (neumático al ${Math.round(worn * 100)}%): vuelve lento a pits y pierde ${loss.toFixed(0)}s`,
            drivers: [car.id],
            at: +(0.1 + rng.next() * 0.6).toFixed(3),
          });
          if (lap < state.totalLaps) car.pitRequest = car.pitRequest ?? (car.plan[1]?.compound ?? (car.compound === "H" ? "M" : "H"));
        }
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
      const jitter = ((car.id.charCodeAt(0) * 31 + car.id.charCodeAt(1) * 7 + lap) % 21) / 10 - 1;
      const weatherCall =
        !car.controlled && wx ? aiWeatherPit(car, wx.wet, lap, state.totalLaps - lap, track, jitter, scLap, weatherStyle(car.entry.team.id, state.raceId)) : null;
      const call = car.pitRequest ?? weatherCall ?? aiPitDecision(car, lap, state.totalLaps, track, scLap);
      if (call) {
        const manual = !!car.pitRequest;
        doPitStop(car, call, state, rng, events, lap);
        // weather stops (or switching between dry and rain tyres) need a fresh plan
        if (weatherCall && !manual) car.plan = replan(call, lap, state.totalLaps, track, car.entry.driver.tyreMgmt);
        else if (manual && isWetTyre(call)) car.plan = [{ compound: call, untilLap: state.totalLaps }];
      }
    }
  });

  // --- Safety car called on this lap? From that moment nobody can pass on track ---
  let deploySc = false;
  if (!scLap && !newRedFlag && config.safetyCar && lap < state.totalLaps - 2) {
    // none out of nowhere on a standing-start lap
    const randomSc = !standing && rng.chance(((state.track.scChance * 0.4) / state.totalLaps) * (1 + 3 * wet));
    deploySc = newSafetyCar || randomSc;
  }
  const neutral = scLap || deploySc || !!newRedFlag;

  // --- Order & overtakes ---
  const order = running.filter((c) => c.status === "running");
  applyTeamOrders(state, order, lap, rng, events, scLap);
  const contacted = new Set<string>();
  const bonus = standing ? 1.2 : restart ? 0.6 : 0;
  for (let i = 1; i < order.length; i++) {
    let j = i;
    while (j > 0) {
      const behind = order[j];
      const ahead = order[j - 1];
      if (behind.total >= ahead.total + MIN_GAP) break;
      const pitSwap = behind.pittedThisLap || ahead.pittedThisLap;
      if (pitSwap || neutral) {
        if (behind.total < ahead.total) {
          // positions change through the pit lane; on track nobody passes under a safety car or red flag
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
      const sameTeam = behind.entry.team.id === ahead.entry.team.id;
      if (sameTeam && behind.total < ahead.total && state.teamOrders?.[behind.entry.team.id]?.kind === "hold") {
        // team order: hold positions
        behind.total = ahead.total + MIN_GAP + rng.next() * 0.3;
        break;
      }
      if (behind.total < ahead.total) {
        const delta = ahead.total - behind.total;
        const atk = behind.instruction === "attack" ? 0.7 * (behind.entry.driver.racecraft / 90) : 0;
        const def = ahead.instruction === "defend" ? 1.3 * (ahead.entry.driver.defending / 90) : 0;
        // wheel to wheel: hard fights (and teammates racing each other) can end in contact
        if ((atk || def || sameTeam) && !contacted.has(behind.id) && !standing) {
          const cons = (200 - behind.entry.driver.consistency - ahead.entry.driver.consistency) / 40;
          const pc = 0.0015 * (atk ? 1.8 : 1) * (def ? 1.8 : 1) * (sameTeam ? 1.5 : 1) * config.incidents * (1 + wet) * (1 + cons);
          if (rng.chance(pc)) {
            contacted.add(behind.id);
            contacted.add(ahead.id);
            const at = +(0.2 + rng.next() * 0.7).toFixed(3);
            const who = `${name(behind)} y ${name(ahead)}${sameTeam ? " (¡compañeros de equipo!)" : ""}`;
            const roll = rng.next();
            const victim = rng.chance(0.5) ? behind : ahead;
            const other = victim === behind ? ahead : behind;
            const hurt = (c: CarState) => {
              // a broken front wing: time lost now and every lap until it's changed
              c.damage = { part: "wing", pace: +(0.8 + rng.next() * 1.4).toFixed(2) };
              c.total += 1.5 + rng.next() * 2;
              if (!c.controlled && lap < state.totalLaps - 1) c.pitRequest = c.pitRequest ?? c.plan[1]?.compound ?? c.compound;
            };
            const retiredHere: CarState[] = [];
            const out = (c: CarState, by: CarState) => {
              retiredHere.push(c);
              c.status = "dnf";
              c.dnfLap = lap;
              c.dnfReason = `Accidente: contacto con ${name(by)}`;
              c.dnfAt = at;
            };
            if (roll < 0.04) {
              // both out
              out(behind, ahead);
              out(ahead, behind);
              events.push({ lap, type: "dnf", text: `💥 Choque entre ${who}: ¡abandonan los dos!`, drivers: [behind.id, ahead.id], at });
            } else if (roll < 0.12) {
              // one of them is out (broken suspension, puncture and floor damage...)
              out(victim, other);
              events.push({ lap, type: "dnf", text: `💥 Choque entre ${who}: ${name(victim)} abandona`, drivers: [victim.id, other.id], at });
              if (rng.chance(0.5)) {
                hurt(other);
                events.push({ lap, type: "damage", text: `🔧 ${name(other)} sigue con el alerón dañado (−${other.damage!.pace.toFixed(1)}s por vuelta)`, drivers: [other.id], at: Math.min(0.99, at + 0.01) });
              } else other.total += 0.5 + rng.next();
            } else if (roll < 0.37) {
              hurt(behind);
              hurt(ahead);
              events.push({ lap, type: "damage", text: `💥 Contacto entre ${who}: los dos dañan el alerón delantero`, drivers: [behind.id, ahead.id], at });
            } else if (roll < 0.8) {
              hurt(victim);
              other.total += 0.5 + rng.next();
              events.push({ lap, type: "damage", text: `💥 Contacto entre ${who}: ${name(victim)} daña el alerón delantero (−${victim.damage!.pace.toFixed(1)}s por vuelta)`, drivers: [victim.id, other.id], at });
            } else {
              behind.total += 0.4 + rng.next() * 0.8;
              ahead.total += 0.4 + rng.next() * 0.8;
              events.push({ lap, type: "mistake", text: `💥 Toque entre ${who}, sin daños: pierden algo de tiempo`, drivers: [behind.id, ahead.id], at });
            }
            // the stewards look at it: usually the attacker is to blame (even if he is the one who retired)
            if (rng.chance(0.55)) {
              const guilty = rng.chance(def && !atk ? 0.45 : 0.7) ? behind : ahead;
              const reason = guilty === behind ? `provocar un choque con ${name(ahead)}` : `cambiar de trayectoria al defenderse de ${name(behind)}`;
              if (guilty.status === "running") givePenalty(guilty, rng.chance(0.3) ? 10 : 5, reason, lap, events, Math.min(0.99, at + 0.05));
              else {
                // out of the race: the penalty moves to the grid of the next one
                const places = rng.chance(0.3) ? 5 : 3;
                guilty.gridPenalty = { places, reason };
                events.push({
                  lap,
                  type: "penalty",
                  text: `⚖️ Penalización para ${name(guilty)}: ${places} puestos en la parrilla de la próxima carrera por ${reason}`,
                  drivers: [guilty.id],
                  at: Math.min(0.99, at + 0.05),
                });
              }
            }
            if (retiredHere.length) {
              for (const c of retiredHere) order.splice(order.indexOf(c), 1);
              i -= retiredHere.length;
              break;
            }
            if (behind.total >= ahead.total + MIN_GAP) break;
            continue;
          }
        }
        const ersBonus =
          (behind.ersMode === "deploy" && (behind.battery ?? 0) > 10 ? 0.6 : 0) -
          (ahead.ersMode === "deploy" && (ahead.battery ?? 0) > 10 ? 0.4 : 0);
        let p = overtakeChance({
          delta,
          attacker: behind.entry,
          defender: ahead.entry,
          track,
          bonus: bonus + ersBonus + (state.rules?.overtakeAid ? 0.6 : 0) + atk - def,
        });
        // a car that ran wide or is limping can't defend; a much faster car gets by sooner or later
        if ((slowed.get(ahead.id) ?? 0) > 0.5 && delta > 0.3) p = 1;
        else if (delta > 1.2) p = 1 - (1 - p) * (1 - Math.min(0.9, (delta - 1.2) * 0.5) * (def ? 0.6 : 1));
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
  if (newRedFlag) {
    // handled after the timing below
  } else if (scLap) {
    // field bunches up behind the safety car
    for (let i = 1; i < order.length; i++) {
      const interval = order[i].total - order[i - 1].total;
      order[i].total = order[i - 1].total + Math.max(0.5, interval * 0.35);
    }
    sc.lapsLeft -= 1;
    if (sc.lapsLeft <= 0) {
      sc.active = false;
      sc.restartLap = true;
      events.push({ lap, type: "sc_end", text: "Safety car entra a pits — ¡relanzamiento!", drivers: [], at: 0.96 });
    }
  } else if (deploySc) {
    // (a red flag already neutralises the race and restarts from the grid: no safety car on top of it)
    {
      sc.active = true;
      sc.lapsLeft = rng.int(3, 5);
      events.push({
        lap,
        type: "sc",
        text: newSafetyCar ? "🚨 Safety car en pista" : "🚨 Safety car: escombros en la pista",
        drivers: [],
        at: newSafetyCar ? Math.min(0.98, incidentAt + 0.03) : +(0.1 + rng.next() * 0.8).toFixed(3),
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

  if (newRedFlag) {
    // everyone back to the pit lane: gaps are wiped and the race restarts from a grid in race order
    sc.active = false;
    sc.lapsLeft = 0;
    sc.restartLap = false;
    events.push({
      lap,
      type: "red",
      text: `🟥 BANDERA ROJA: fuerte accidente de ${newRedFlag}. Carrera detenida, se puede cambiar neumáticos`,
      drivers: [],
      at: Math.min(0.98, incidentAt + 0.03),
    });
    const leaderT = order[0]?.total ?? 0;
    const wetNow = wetEnd;
    order.forEach((car, i) => {
      car.total = leaderT + i * 0.22;
      if (car.controlled) return; // the player chooses
      const best = bestTyreFor(wetNow);
      const next = best !== "slick" ? best : isWetTyre(car.compound) ? "M" : car.plan[1]?.compound ?? car.compound;
      if (next !== car.compound) car.plan = advancePlan(car, next, lap, state.totalLaps);
      car.compound = next;
      car.tyreAge = 0;
      if (!car.usedCompounds.includes(next)) car.usedCompounds.push(next);
    });
    state.redFlag = { lap, choices: Object.fromEntries(order.filter((c) => c.controlled).map((c) => [c.id, c.compound])) };
    state.standingRestart = true;
  }

  const newlyRetired = running.filter((c) => c.status === "dnf");
  state.cars = [...order, ...newlyRetired, ...retired];
  state.lap = lap;
  state.rngState = rng.state();

  if (lap >= state.totalLaps) {
    // penalties never served in a stop go on the final time
    for (const c of order) {
      if (c.penalty) {
        c.total += c.penalty;
        events.push({ lap, type: "penalty", text: `⚖️ ${name(c)} recibe +${c.penalty}s sobre su tiempo final`, drivers: [c.id], at: 1 });
        c.penalty = 0;
      }
    }
    // Dry-race rule: at least two different compounds
    for (const c of order) {
      if (state.rules?.twoCompound !== false && c.usedCompounds.length < 2 && !c.usedCompounds.some(isWetTyre)) {
        c.total += 30;
        events.push({ lap, type: "mistake", text: `${name(c)} penalizado con 30s: no usó dos compuestos`, drivers: [c.id], at: 1 });
      }
    }
    order.sort((a, b) => a.total - b.total);
    state.cars = [...order, ...newlyRetired, ...retired];
    state.finished = true;
    const winner = order[0];
    if (winner) events.push({ lap, type: "finish", text: `🏁 ¡${winner.entry.driver.name} gana la carrera!`, drivers: [winner.id], at: 1 });
  }
  state.events = [...state.events, ...events];
  return state;
}

export function simulateToEnd(state: RaceState): RaceState {
  let s = state;
  while (!s.finished) s = simulateLap(s);
  return s;
}

/**
 * Team orders that act at the end of a lap: a driver lets his teammate through when told to
 * (if he's close enough, and if his morale lets him accept it). After the swap, positions are held.
 */
function applyTeamOrders(state: RaceState, order: CarState[], lap: number, rng: Rng, events: RaceEvent[], scLap: boolean) {
  if (!state.teamOrders) return;
  for (const [teamId, ord] of Object.entries(state.teamOrders)) {
    if (ord.kind !== "swap" || !ord.favored) continue;
    const f = order.find((c) => c.id === ord.favored);
    const y = order.find((c) => c.entry.team.id === teamId && c.id !== ord.favored);
    if (!f || !y) {
      state.teamOrders[teamId] = { kind: "free", since: lap };
      continue;
    }
    if (f.total <= y.total) {
      state.teamOrders[teamId] = { kind: "hold", since: lap }; // already ahead
      continue;
    }
    const fi = order.indexOf(f);
    const yi = order.indexOf(y);
    const between = order.some((c) => c !== f && c !== y && c.total > y.total && c.total < f.total);
    if (scLap || between || fi !== yi + 1 || f.total - y.total > 2.5) {
      if (lap - ord.since >= 5) {
        state.teamOrders[teamId] = { kind: "free", since: lap };
        events.push({ lap, type: "mistake", text: `📻 Orden de equipo cancelada: ${name(f)} no logró acercarse a ${name(y)}`, drivers: [f.id, y.id], at: 0.9 });
      }
      continue;
    }
    const obeyed = rng.chance(obeyChance(y.morale ?? 65));
    state.orderLog = [...(state.orderLog ?? []), { lap, teamId, kind: "swap", yielded: y.id, favored: f.id, obeyed }];
    if (obeyed) {
      f.total = Math.min(f.total, y.total - 0.05);
      y.total = f.total + MIN_GAP + 0.35;
      order[yi] = f;
      order[fi] = y;
      events.push({ lap, type: "overtake", text: `🔁 ${name(y)} deja pasar a ${name(f)} (orden de equipo)`, drivers: [f.id, y.id], at: 0.7 });
      state.teamOrders[teamId] = { kind: "hold", since: lap };
    } else {
      events.push({ lap, type: "mistake", text: `📻 ${name(y)} ignora la orden de equipo y no deja pasar a ${name(f)}`, drivers: [y.id, f.id], at: 0.7 });
      state.teamOrders[teamId] = { kind: "free", since: lap };
    }
  }
}

/** Manager controls */
export function setInstruction(state: RaceState, driverId: string, instruction: Instruction): RaceState {
  return { ...state, cars: state.cars.map((c) => (c.id === driverId ? { ...c, instruction } : c)) };
}
export function setTeamOrder(state: RaceState, teamId: string, order: Omit<TeamOrder, "since">): RaceState {
  const prev = state.teamOrders?.[teamId];
  const log =
    order.kind === "hold" && prev?.kind !== "hold"
      ? (() => {
          // the car behind is held back: noted for morale if he was the quicker one
          const cars = state.cars.filter((c) => c.entry.team.id === teamId && c.status === "running");
          if (cars.length < 2) return [];
          const [a, b] = cars;
          return b.lastLap < a.lastLap - 0.2
            ? [{ lap: state.lap, teamId, kind: "hold" as const, yielded: b.id, favored: a.id, obeyed: true }]
            : [];
        })()
      : [];
  return {
    ...state,
    teamOrders: { ...(state.teamOrders ?? {}), [teamId]: { ...order, since: state.lap } },
    orderLog: [...(state.orderLog ?? []), ...log],
  };
}
/** Tyres to fit during a red flag (applied at the restart). */
export function setRedFlagTyre(state: RaceState, driverId: string, compound: Compound): RaceState {
  if (!state.redFlag) return state;
  return { ...state, redFlag: { ...state.redFlag, choices: { ...state.redFlag.choices, [driverId]: compound } } };
}

export function setMode(state: RaceState, driverId: string, mode: DriverMode): RaceState {
  return { ...state, cars: state.cars.map((c) => (c.id === driverId ? { ...c, mode } : c)) };
}
export function setFuelMode(state: RaceState, driverId: string, fuelMode: FuelMode): RaceState {
  return { ...state, cars: state.cars.map((c) => (c.id === driverId ? { ...c, fuelMode } : c)) };
}
export function setErsMode(state: RaceState, driverId: string, ersMode: ErsMode): RaceState {
  return { ...state, cars: state.cars.map((c) => (c.id === driverId ? { ...c, ersMode } : c)) };
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
      points: !finished
        ? 0
        : (state.rules?.points ? state.rules.points[position - 1] ?? 0 : pointsSystem[position] ?? 0) +
          (state.rules?.fastestLapPoint && position <= 10 && state.fastest?.driverId === c.id ? 1 : 0),
      stops: c.stops,
      bestLap: c.bestLap,
      dnfReason: c.dnfReason,
      penaltySecs: c.penalties?.reduce((x, p) => x + p.secs, 0) || undefined,
    };
  });
}
