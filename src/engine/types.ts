import type { Driver, TeamInfo, Track } from "@/data/f1Data";

export type Compound = "S" | "M" | "H";
export type DriverMode = "push" | "normal" | "conserve";

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
  compound: Compound;
  tyreAge: number;
  usedCompounds: Compound[];
  plan: Stint[]; // remaining stints including the current one
  stops: number;
  mode: DriverMode;
  pitRequest: Compound | null; // manual pit call (manager)
  controlled?: boolean; // player car: only planned/manual stops, no AI improvisation
  status: "running" | "dnf";
  dnfReason?: string;
  dnfLap?: number;
  pittedThisLap: boolean;
}

export type RaceEventType =
  | "start" | "overtake" | "pit" | "dnf" | "sc" | "sc_end" | "fastest" | "mistake" | "finish";

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
