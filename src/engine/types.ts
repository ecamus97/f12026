import type { Driver, TeamInfo, Track } from "@/data/f1Data";

export type Compound = "S" | "M" | "H" | "I" | "W";
export type DriverMode = "push" | "normal" | "conserve"; // tyre usage
export type FuelMode = "rich" | "normal" | "lean";
export type ErsMode = "deploy" | "balanced" | "harvest";

export interface Entry {
  driver: Driver;
  team: TeamInfo;
}

export interface SimConfig {
  randomness: number; // 0.5 - 1.5 multiplier on lap-time noise
  incidents: number; // 0 - 2 multiplier on DNFs / mistakes
  safetyCar: boolean;
}

export const DEFAULT_SIM_CONFIG: SimConfig = {
  randomness: 1,
  incidents: 1,
  safetyCar: true,
};

export interface Stint {
  compound: Compound;
  untilLap: number; // planned pit lap at the end of this stint (last stint = race distance)
}

export interface CarState {
  id: string; // driver id
  entry: Entry;
  grid: number;
  total: number; // cumulative race time (s)
  lastLap: number;
  bestLap: number;
  lastSectors?: number[]; // S1, S2, S3 of the last lap
  bestSectors?: number[]; // personal best per sector (0 = none)
  compound: Compound;
  tyreAge: number;
  usedCompounds: Compound[];
  plan: Stint[]; // remaining stints including the current one
  stops: number;
  mode: DriverMode; // tyres
  fuelMode?: FuelMode;
  ersMode?: ErsMode;
  fuel?: number; // laps of fuel left (normal consumption)
  battery?: number; // 0-100 %
  fuelWarned?: boolean;
  /** Modes changed in the middle of the lap: the old ones count for the first `frac` of it. */
  modeBlend?: { frac: number; mode: DriverMode; fuelMode: FuelMode; ersMode: ErsMode };
  pitRequest: Compound | null; // manual pit call (manager)
  controlled?: boolean; // player car: only planned/manual stops, no AI improvisation
  status: "running" | "dnf";
  dnfReason?: string;
  dnfLap?: number;
  pittedThisLap: boolean;
  lastPitTime?: number; // seconds spent in the pit lane at the end of the last lap (0 = no stop)
}

export type RaceEventType =
  | "start" | "overtake" | "pit" | "dnf" | "sc" | "sc_end" | "fastest" | "mistake" | "finish" | "weather" | "red";

export interface RaceEvent {
  lap: number;
  type: RaceEventType;
  text: string;
  drivers: string[];
}

export interface RaceState {
  raceId: number;
  track: Track;
  config: SimConfig;
  rngState: number;
  lap: number; // completed laps
  totalLaps: number;
  cars: CarState[]; // classification order (running by time, then DNFs)
  events: RaceEvent[];
  safetyCar: { active: boolean; lapsLeft: number; restartLap: boolean };
  fastest: { driverId: string; time: number; lap: number } | null;
  finished: boolean;
  strategyConfirmed?: boolean; // player has reviewed the pre-race plan
  bestSectors?: ({ time: number; driverId: string } | null)[]; // overall best per sector
  weather?: import("./weather").WeatherTimeline;
  /** Red flag: race stopped, waiting for the standing restart (tyres can be changed). */
  redFlag?: { lap: number; choices: Record<string, Compound> } | null;
  standingRestart?: boolean;
  rules?: { twoCompound: boolean; overtakeAid: boolean; points?: number[]; fastestLapPoint?: boolean };
}

export interface ClassifiedRow {
  position: number; // 1..n, DNFs included at the bottom
  driverId: string;
  teamId: string;
  grid: number;
  status: "finished" | "dnf";
  gap: string; // "Ganador", "+12.345", "+1 V", "DNF"
  points: number;
  stops: number;
  bestLap: number;
  dnfReason?: string;
}
