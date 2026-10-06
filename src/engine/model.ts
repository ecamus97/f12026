// Performance model: everything that turns ratings into seconds lives here.
import type { Compound, DriverMode, Entry, ErsMode, FuelMode, SimConfig } from "./types";
import type { Track } from "@/data/f1Data";

export const COMPOUNDS: Record<Compound, { offset: number; deg: number; life: number; name: string; color: string; wet?: boolean }> = {
  S: { offset: -0.6, deg: 0.07, life: 17, name: "Blando", color: "#ef4444" },
  M: { offset: 0, deg: 0.04, life: 28, name: "Medio", color: "#facc15" },
  H: { offset: 0.45, deg: 0.025, life: 40, name: "Duro", color: "#e5e7eb" },
  I: { offset: 0, deg: 0.045, life: 30, name: "Intermedio", color: "#22c55e", wet: true },
  W: { offset: 0, deg: 0.035, life: 35, name: "Lluvia extrema", color: "#3b82f6", wet: true },
};
export const DRY_COMPOUNDS: Compound[] = ["S", "M", "H"];
export const WET_COMPOUNDS: Compound[] = ["I", "W"];
export const isWetTyre = (c: Compound) => !!COMPOUNDS[c].wet;

/** Tyre mode (how hard the driver uses the tyres). */
export const MODES: Record<DriverMode, { pace: number; wear: number; risk: number; label: string }> = {
  push: { pace: -0.3, wear: 1.35, risk: 1.6, label: "Atacar" },
  normal: { pace: 0, wear: 1, risk: 1, label: "Normal" },
  conserve: { pace: 0.35, wear: 0.7, risk: 0.6, label: "Cuidar" },
};

/** Fuel mixture: richer = faster but burns more. Fuel is measured in laps of normal running. */
export const FUEL_MODES: Record<FuelMode, { pace: number; burn: number; label: string }> = {
  rich: { pace: -0.2, burn: 1.07, label: "Potencia máx." },
  normal: { pace: 0, burn: 1, label: "Estándar" },
  lean: { pace: 0.25, burn: 0.93, label: "Lift & coast" },
};

/** Energy (ERS) use: deploy spends battery for pace and attack, harvest refills it. */
export const ERS_MODES: Record<ErsMode, { pace: number; charge: number; label: string }> = {
  deploy: { pace: -0.35, charge: -14, label: "Ataque" },
  balanced: { pace: 0, charge: 2, label: "Automático" },
  harvest: { pace: 0.3, charge: 12, label: "Recargar" },
};

export const MIN_GAP = 0.2; // seconds between cars when one is stuck behind
export const DIRTY_AIR_WINDOW = 1.0;
export const FUEL_MARGIN = 0.4; // laps of fuel above race distance at the start

/** Track temperature effect on tyre wear (hot tracks eat tyres). */
export const heatFactor = (trackTemp = 35) => Math.max(0.75, 1 + (trackTemp - 35) * 0.018);

/** Effective tyre life on a given track for a given driver. */
export function tyreLife(c: Compound, track: Track, tyreMgmt = 85, trackTemp?: number) {
  return (COMPOUNDS[c].life / (track.deg * heatFactor(trackTemp))) * (1 + (tyreMgmt - 85) * 0.006);
}

/** Time lost to tyre wear at a given age (seconds per lap). */
export function tyreWear(c: Compound, age: number, track: Track, tyreMgmt: number, mode: DriverMode, trackTemp?: number, wet = 0) {
  // rain tyres on a drying track overheat and wear very fast
  const dryRainTyre = isWetTyre(c) ? 1 + 3 * Math.max(0, 0.2 - wet) / 0.2 : 1;
  const wearMult = track.deg * heatFactor(trackTemp) * MODES[mode].wear * (1 + (85 - tyreMgmt) * 0.01) * dryRainTyre;
  const life = tyreLife(c, track, tyreMgmt, trackTemp) / dryRainTyre;
  const linear = COMPOUNDS[c].deg * age * wearMult;
  const cliff = age > life ? (age - life) ** 2 * 0.05 * MODES[mode].wear : 0;
  return linear + cliff;
}

/** Seconds lost on a track with a given wetness (0 dry .. 1 flooded) for each tyre type. */
export function wetPenalty(c: Compound, wet: number) {
  if (c === "I") return 1.2 + 14 * (wet - 0.45) ** 2;
  if (c === "W") return 0.6 + 14 * (wet - 0.9) ** 2;
  return 30 * Math.max(0, wet) ** 1.6; // slicks
}

/** The quickest tyre type for a wetness level (used by the AI and the forecast hints). */
export function bestTyreFor(wet: number): "slick" | "I" | "W" {
  const s = wetPenalty("M", wet);
  const i = wetPenalty("I", wet);
  const w = wetPenalty("W", wet);
  if (s <= i && s <= w) return "slick";
  return i <= w ? "I" : "W";
}

/** How much each car component matters on a track (sums to 1). */
export function trackWeights(track: Track) {
  const df = track.downforce ?? 0.5;
  const pw = track.power ?? 0.5;
  const aero = 0.25 + 0.3 * df;
  const pu = 0.2 + 0.3 * pw;
  const chassis = Math.max(0.15, 1 - aero - pu);
  const sum = aero + pu + chassis;
  return { aero: aero / sum, powerUnit: pu / sum, chassis: chassis / sum };
}

/** Car rating on a given track: teams with the right strengths shine on the right circuits. */
export function carRatingOnTrack(e: Entry, track?: Track) {
  const t = e.team;
  if (!track || t.aero === undefined || t.powerUnit === undefined || t.chassis === undefined) return t.pace;
  const w = trackWeights(track);
  return t.aero * w.aero + t.powerUnit * w.powerUnit + t.chassis * w.chassis;
}

/** Car + driver pace delta vs. a perfect car/driver (seconds). */
export function basePace(e: Entry, track?: Track) {
  return (100 - carRatingOnTrack(e, track)) * 0.075 + (100 - e.driver.pace) * 0.04;
}

export function lapNoise(e: Entry, cfg: SimConfig, wet = 0) {
  // wet conditions separate the consistent drivers from the rest
  return (0.12 + (100 - e.driver.consistency) * 0.006) * cfg.randomness * (1 + wet * 1.5);
}

export function raceLapTime(params: {
  entry: Entry;
  track: Track;
  compound: Compound;
  tyreAge: number;
  mode: DriverMode;
  lap: number;
  totalLaps: number;
  cfg: SimConfig;
  noise: number; // standard normal sample
  fuelMode?: FuelMode;
  ersMode?: ErsMode;
  battery?: number; // 0-100
  wet?: number; // track wetness 0-1
  trackTemp?: number;
}) {
  const { entry, track, compound, tyreAge, mode, lap, totalLaps, cfg, noise } = params;
  const wet = params.wet ?? 0;
  const fuel = (totalLaps - lap) * 0.03;
  const ers = params.ersMode ?? "balanced";
  // deploying with an empty battery gives nothing
  const ersPace = ers === "deploy" ? ERS_MODES.deploy.pace * Math.min(1, (params.battery ?? 100) / 14) : ERS_MODES[ers].pace;
  return (
    track.baseLap + 2.0 +
    basePace(entry, track) +
    COMPOUNDS[compound].offset +
    tyreWear(compound, tyreAge, track, entry.driver.tyreMgmt, mode, params.trackTemp, wet) +
    MODES[mode].pace +
    FUEL_MODES[params.fuelMode ?? "normal"].pace +
    ersPace +
    wet * 7 + // everyone is slower in the wet
    wetPenalty(compound, wet) +
    fuel +
    noise * lapNoise(entry, cfg, wet)
  );
}

export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Probability that an attacking car completes a pass this lap. */
export function overtakeChance(params: {
  delta: number; // how many seconds faster the attacker was this lap (>0)
  attacker: Entry;
  defender: Entry;
  track: Track;
  bonus: number; // lap 1 / restarts / energy deployment
}) {
  const { delta, attacker, defender, track, bonus } = params;
  const x =
    -1.6 +
    Math.min(delta, 2.5) * 2.0 +
    (attacker.driver.racecraft - defender.driver.defending) * 0.04 -
    track.overtaking * 4.0 +
    bonus;
  return sigmoid(x);
}
