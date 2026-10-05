// Performance model: everything that turns ratings into seconds lives here.
import type { Compound, DriverMode, Entry, SimConfig } from "./types";
import type { Track } from "@/data/f1Data";

export const COMPOUNDS: Record<Compound, { offset: number; deg: number; life: number; name: string; color: string }> = {
  S: { offset: -0.6, deg: 0.07, life: 17, name: "Blando", color: "#ef4444" },
  M: { offset: 0, deg: 0.04, life: 28, name: "Medio", color: "#facc15" },
  H: { offset: 0.45, deg: 0.025, life: 40, name: "Duro", color: "#e5e7eb" },
};

export const MODES: Record<DriverMode, { pace: number; wear: number; risk: number; label: string }> = {
  push: { pace: -0.3, wear: 1.35, risk: 1.6, label: "Atacar" },
  normal: { pace: 0, wear: 1, risk: 1, label: "Normal" },
  conserve: { pace: 0.35, wear: 0.7, risk: 0.6, label: "Cuidar" },
};

export const MIN_GAP = 0.2; // seconds between cars when one is stuck behind
export const DIRTY_AIR_WINDOW = 1.0;

/** Effective tyre life on a given track for a given driver. */
export function tyreLife(c: Compound, track: Track, tyreMgmt = 85) {
  return (COMPOUNDS[c].life / track.deg) * (1 + (tyreMgmt - 85) * 0.006);
}

/** Time lost to tyre wear at a given age (seconds per lap). */
export function tyreWear(c: Compound, age: number, track: Track, tyreMgmt: number, mode: DriverMode) {
  const wearMult = track.deg * MODES[mode].wear * (1 + (85 - tyreMgmt) * 0.01);
  const life = tyreLife(c, track, tyreMgmt);
  const linear = COMPOUNDS[c].deg * age * wearMult;
  const cliff = age > life ? (age - life) ** 2 * 0.05 * MODES[mode].wear : 0;
  return linear + cliff;
}

/** Car + driver pace delta vs. a perfect car/driver (seconds). */
export function basePace(e: Entry) {
  return (100 - e.team.pace) * 0.075 + (100 - e.driver.pace) * 0.04;
}

export function lapNoise(e: Entry, cfg: SimConfig) {
  return (0.12 + (100 - e.driver.consistency) * 0.006) * cfg.randomness;
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
}) {
  const { entry, track, compound, tyreAge, mode, lap, totalLaps, cfg, noise } = params;
  const fuel = (totalLaps - lap) * 0.03;
  return (
    track.baseLap + 2.0 +
    basePace(entry) +
    COMPOUNDS[compound].offset +
    tyreWear(compound, tyreAge, track, entry.driver.tyreMgmt, mode) +
    MODES[mode].pace +
    fuel +
    noise * lapNoise(entry, cfg)
  );
}

export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Probability that an attacking car completes a pass this lap. */
export function overtakeChance(params: {
  delta: number; // how many seconds faster the attacker was this lap (>0)
  attacker: Entry;
  defender: Entry;
  track: Track;
  bonus: number; // lap 1 / restarts
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
