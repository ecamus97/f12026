// Qualifying: Q1 (22 → 16), Q2 (16 → 10), Q3 (top 10 shoot-out).
import type { Race } from "@/data/f1Data";
import { createRng, type Rng } from "./rng";
import type { Entry, SimConfig } from "./types";
import { DEFAULT_SIM_CONFIG } from "./types";
import { basePace, COMPOUNDS } from "./model";

export type SessionName = "Q1" | "Q2" | "Q3";

export interface QualiRow {
  driverId: string;
  best: number; // 0 = no time
  runs: number[]; // 0 = run aborted (mistake)
  eliminated: boolean;
}

export interface QualiSession {
  name: SessionName;
  rows: QualiRow[]; // sorted by best time
}

export interface QualifyingResult {
  raceId: number;
  sessions: QualiSession[];
  grid: string[]; // driver ids, P1 first
}

const SESSIONS: { name: SessionName; advance: number; evo: number }[] = [
  { name: "Q1", advance: 16, evo: 0 },
  { name: "Q2", advance: 10, evo: 0.25 },
  { name: "Q3", advance: 0, evo: 0.45 },
];

function qualiLap(e: Entry, race: Race, evo: number, rng: Rng, cfg: SimConfig): number {
  const c = e.driver.consistency;
  if (rng.chance((100 - c) * 0.0025 * cfg.incidents)) return 0; // lap ruined
  const noise = rng.gauss() * (0.1 + (100 - c) * 0.004) * cfg.randomness;
  return race.track.baseLap + 0.6 + basePace(e) + COMPOUNDS.S.offset - evo + noise;
}

function runSession(entries: Entry[], race: Race, name: SessionName, evo: number, advance: number, rng: Rng, cfg: SimConfig): QualiSession {
  const rows: QualiRow[] = entries.map((e) => {
    const runs = [qualiLap(e, race, evo, rng, cfg), qualiLap(e, race, evo + 0.12, rng, cfg)];
    const valid = runs.filter((r) => r > 0);
    return { driverId: e.driver.id, runs, best: valid.length ? Math.min(...valid) : 0, eliminated: false };
  });
  rows.sort((a, b) => (a.best || 9999) - (b.best || 9999));
  if (advance > 0) rows.forEach((r, i) => (r.eliminated = i >= advance));
  return { name, rows };
}

export function runQualifying(race: Race, entries: Entry[], seed: number, cfg: SimConfig = DEFAULT_SIM_CONFIG): QualifyingResult {
  const rng = createRng(seed);
  const sessions: QualiSession[] = [];
  let field = entries;
  for (const s of SESSIONS) {
    const session = runSession(field, race, s.name, s.evo, s.advance, rng, cfg);
    sessions.push(session);
    const through = new Set(session.rows.filter((r) => !r.eliminated).map((r) => r.driverId));
    field = field.filter((e) => through.has(e.driver.id));
  }
  // Grid: Q3 order, then Q2 eliminated, then Q1 eliminated (each by their own session time)
  const grid = [
    ...sessions[2].rows.map((r) => r.driverId),
    ...sessions[1].rows.filter((r) => r.eliminated).map((r) => r.driverId),
    ...sessions[0].rows.filter((r) => r.eliminated).map((r) => r.driverId),
  ];
  return { raceId: race.id, sessions, grid };
}
