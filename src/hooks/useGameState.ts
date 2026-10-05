import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { races2026, teams as defaultTeams, teamInfo, type Team } from "@/data/f1Data";
import {
  classify,
  computeStandings,
  createRace,
  DEFAULT_SIM_CONFIG,
  randomSeed,
  runQualifying,
  type Entry,
  type QualifyingResult,
  type RaceState,
  type SimConfig,
  type StoredRaceResult,
} from "@/engine";

const STORAGE_KEY = "f1-manager-2026-v2";

export interface Weekend {
  raceIndex: number;
  quali: QualifyingResult;
  qualiRevealed: number; // sessions shown to the player (0-3)
  race: RaceState | null;
}

export interface GameState {
  version: 2;
  playerTeamId: string | null;
  currentRaceIndex: number;
  results: StoredRaceResult[];
  simConfig: SimConfig;
  teamsData: Team[];
  weekend: Weekend | null;
}

const initialState = (teamsData: Team[] = defaultTeams, simConfig: SimConfig = DEFAULT_SIM_CONFIG): GameState => ({
  version: 2,
  playerTeamId: null,
  currentRaceIndex: 0,
  results: [],
  simConfig,
  teamsData,
  weekend: null,
});

function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as GameState;
    if (parsed?.version !== 2 || !Array.isArray(parsed.teamsData)) return initialState();
    return { ...initialState(), ...parsed };
  } catch {
    return initialState();
  }
}

export const entriesFromTeams = (teams: Team[]): Entry[] =>
  teams.flatMap((t) => t.drivers.map((driver) => ({ driver, team: teamInfo(t) })));

export function useGameState() {
  const [gameState, setGameState] = useState<GameState>(loadState);

  // Debounced autosave
  const saveTimer = useRef<number>();
  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
      } catch {
        /* storage unavailable: game keeps working in memory */
      }
    }, 400);
  }, [gameState]);

  const standings = useMemo(
    () => computeStandings(gameState.teamsData, gameState.results),
    [gameState.teamsData, gameState.results],
  );

  const entries = useMemo(() => entriesFromTeams(gameState.teamsData), [gameState.teamsData]);
  const entryMap = useMemo(() => new Map(entries.map((e) => [e.driver.id, e])), [entries]);

  const currentRace = races2026[gameState.currentRaceIndex] ?? null;
  const seasonComplete = gameState.currentRaceIndex >= races2026.length;

  const chooseTeam = useCallback((teamId: string) => {
    setGameState((s) => ({ ...s, playerTeamId: teamId }));
  }, []);

  const startWeekend = useCallback(() => {
    setGameState((s) => {
      const race = races2026[s.currentRaceIndex];
      if (!race) return s;
      if (s.weekend?.raceIndex === s.currentRaceIndex) return s; // resume
      const quali = runQualifying(race, entriesFromTeams(s.teamsData), randomSeed(), s.simConfig);
      return { ...s, weekend: { raceIndex: s.currentRaceIndex, quali, qualiRevealed: 0, race: null } };
    });
  }, []);

  const revealSession = useCallback((all = false) => {
    setGameState((s) =>
      s.weekend
        ? { ...s, weekend: { ...s.weekend, qualiRevealed: all ? 3 : Math.min(3, s.weekend.qualiRevealed + 1) } }
        : s,
    );
  }, []);

  const startRace = useCallback(() => {
    setGameState((s) => {
      const w = s.weekend;
      if (!w || w.race) return s;
      const race = races2026[w.raceIndex];
      const map = new Map(entriesFromTeams(s.teamsData).map((e) => [e.driver.id, e]));
      const grid = w.quali.grid.map((id) => map.get(id)).filter((e): e is Entry => !!e);
      return { ...s, weekend: { ...w, race: createRace(race, grid, randomSeed(), s.simConfig, s.playerTeamId) } };
    });
  }, []);

  const updateRace = useCallback((race: RaceState) => {
    setGameState((s) => (s.weekend ? { ...s, weekend: { ...s.weekend, race } } : s));
  }, []);

  const finishRace = useCallback(() => {
    setGameState((s) => {
      const w = s.weekend;
      if (!w?.race?.finished) return s;
      const result: StoredRaceResult = {
        raceId: races2026[w.raceIndex].id,
        rows: classify(w.race),
        pole: w.quali.grid[0],
        fastestLap: w.race.fastest ? { driverId: w.race.fastest.driverId, time: w.race.fastest.time } : null,
      };
      return {
        ...s,
        results: [...s.results.filter((r) => r.raceId !== result.raceId), result],
        currentRaceIndex: w.raceIndex + 1,
        weekend: null,
      };
    });
  }, []);

  const resetSeason = useCallback(() => {
    setGameState((s) => initialState(s.teamsData, s.simConfig));
  }, []);

  const updateSimConfig = useCallback((simConfig: SimConfig) => {
    setGameState((s) => ({ ...s, simConfig }));
  }, []);

  const updateTeamsData = useCallback((teamsData: Team[]) => {
    setGameState((s) => ({ ...s, teamsData }));
  }, []);

  return {
    gameState,
    standings,
    entries,
    entryMap,
    currentRace,
    seasonComplete,
    races: races2026,
    chooseTeam,
    startWeekend,
    revealSession,
    startRace,
    updateRace,
    finishRace,
    resetSeason,
    updateSimConfig,
    updateTeamsData,
  };
}
