import { Driver } from "@/data/f1Data";

export interface RaceDriverState {
  driver: Driver & {
    teamColor: string;
    teamName: string;
    carLevel: number;
    teamId: string;
  };
  position: number;
  distance: number;
  inPits: boolean;
  pitsRemaining: number;
  pitStops: number;
  retired: boolean;
  finished: boolean;
  finishOrder: number;
  justOvertaken: boolean;
}

export type Advantage = "attacker" | "defender" | "none";

export interface BattleInfo {
  attacker: string;
  defender: string;
  advantage: Advantage;
  attackerRoll1: number;
  defenderRoll1: number;
  attackerRoll2?: number;
  defenderRoll2?: number;
  result: "overtake" | "defend";
}

export interface RaceEvent {
  lap: number;
  turn: number;
  driverShortName: string;
  type: "advance" | "stay" | "battle_win" | "battle_lose" | "pit" | "dnf" | "finish";
  description: string;
  timestamp: number;
}

export interface RaceConfig {
  pitCheckChance: number;
  pitDurations: { 1: number; 2: number; 3: number };
  maxPitsBeforeDNF: number;
  dnfOnSecondPitChance: boolean;
}

export const DEFAULT_CONFIG: RaceConfig = {
  pitCheckChance: 0.07,
  pitDurations: { 1: 5, 2: 7, 3: 10 },
  maxPitsBeforeDNF: 4,
  dnfOnSecondPitChance: true,
};

export const RACE_DISTANCE = 50;
