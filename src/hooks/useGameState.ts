import { useState, useCallback } from 'react';
import { races2026, getAllDrivers, pointsSystem, Driver, Race } from '@/data/f1Data';
import { toast } from '@/hooks/use-toast';

const STORAGE_KEY = 'f1-dice-game-2026-save';

export interface DriverStanding {
  driverId: string;
  driverName: string;
  shortName: string;
  teamId: string;
  teamName: string;
  teamColor: string;
  nationality: string;
  points: number;
  wins: number;
}

export interface TeamStanding {
  teamId: string;
  teamName: string;
  teamColor: string;
  points: number;
  wins: number;
}

export interface RaceResult {
  raceId: number;
  positions: {
    position: number;
    driverId: string;
    driverName: string;
    shortName: string;
    teamId: string;
    teamColor: string;
    points: number;
    retired: boolean;
  }[];
  completed: boolean;
}

export interface GameState {
  currentRaceIndex: number;
  driverStandings: DriverStanding[];
  teamStandings: TeamStanding[];
  raceResults: RaceResult[];
  seasonComplete: boolean;
}

const initialDriverStandings = (): DriverStanding[] => {
  return getAllDrivers().map(driver => ({
    driverId: driver.id,
    driverName: driver.name,
    shortName: driver.shortName,
    teamId: driver.teamId,
    teamName: driver.teamName,
    teamColor: driver.teamColor,
    nationality: driver.nationality,
    points: 0,
    wins: 0,
  }));
};

const initialTeamStandings = (): TeamStanding[] => {
  const allDrivers = getAllDrivers();
  const teamMap = new Map<string, TeamStanding>();
  
  allDrivers.forEach(driver => {
    if (!teamMap.has(driver.teamId)) {
      teamMap.set(driver.teamId, {
        teamId: driver.teamId,
        teamName: driver.teamName,
        teamColor: driver.teamColor,
        points: 0,
        wins: 0,
      });
    }
  });
  
  return Array.from(teamMap.values());
};

export function useGameState() {
  const [gameState, setGameState] = useState<GameState>({
    currentRaceIndex: 0,
    driverStandings: initialDriverStandings(),
    teamStandings: initialTeamStandings(),
    raceResults: [],
    seasonComplete: false,
  });

  const getCurrentRace = useCallback((): Race | null => {
    if (gameState.currentRaceIndex >= races2026.length) return null;
    return races2026[gameState.currentRaceIndex];
  }, [gameState.currentRaceIndex]);

  const recordRaceResult = useCallback((positions: RaceResult['positions']) => {
    setGameState(prev => {
      const newRaceResult: RaceResult = {
        raceId: races2026[prev.currentRaceIndex].id,
        positions,
        completed: true,
      };

      // Update driver standings
      const newDriverStandings = prev.driverStandings.map(standing => {
        const result = positions.find(p => p.driverId === standing.driverId);
        if (!result) return standing;
        
        return {
          ...standing,
          points: standing.points + result.points,
          wins: result.position === 1 ? standing.wins + 1 : standing.wins,
        };
      }).sort((a, b) => b.points - a.points);

      // Update team standings
      const newTeamStandings = prev.teamStandings.map(standing => {
        const teamResults = positions.filter(p => p.teamId === standing.teamId);
        const teamPoints = teamResults.reduce((sum, r) => sum + r.points, 0);
        const teamWins = teamResults.filter(r => r.position === 1).length;
        
        return {
          ...standing,
          points: standing.points + teamPoints,
          wins: standing.wins + teamWins,
        };
      }).sort((a, b) => b.points - a.points);

      const nextRaceIndex = prev.currentRaceIndex + 1;
      const seasonComplete = nextRaceIndex >= races2026.length;

      return {
        ...prev,
        currentRaceIndex: nextRaceIndex,
        driverStandings: newDriverStandings,
        teamStandings: newTeamStandings,
        raceResults: [...prev.raceResults, newRaceResult],
        seasonComplete,
      };
    });
  }, []);

  const resetSeason = useCallback(() => {
    setGameState({
      currentRaceIndex: 0,
      driverStandings: initialDriverStandings(),
      teamStandings: initialTeamStandings(),
      raceResults: [],
      seasonComplete: false,
    });
  }, []);

  const saveProgress = useCallback(() => {
    try {
      const saveData = JSON.stringify(gameState);
      localStorage.setItem(STORAGE_KEY, saveData);
      toast({
        title: "Progreso guardado",
        description: `Carrera ${gameState.currentRaceIndex} de ${races2026.length} guardada correctamente.`,
      });
      return true;
    } catch (error) {
      toast({
        title: "Error al guardar",
        description: "No se pudo guardar el progreso. Verifica el almacenamiento del navegador.",
        variant: "destructive",
      });
      return false;
    }
  }, [gameState]);

  const loadProgress = useCallback(() => {
    try {
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (!savedData) {
        toast({
          title: "Sin datos guardados",
          description: "No se encontró ningún progreso guardado.",
          variant: "destructive",
        });
        return false;
      }
      
      const parsedState = JSON.parse(savedData) as GameState;
      setGameState(parsedState);
      toast({
        title: "Progreso cargado",
        description: `Carrera ${parsedState.currentRaceIndex} de ${races2026.length} cargada correctamente.`,
      });
      return true;
    } catch (error) {
      toast({
        title: "Error al cargar",
        description: "El archivo de guardado está corrupto o es incompatible.",
        variant: "destructive",
      });
      return false;
    }
  }, []);

  const hasSavedProgress = useCallback(() => {
    return localStorage.getItem(STORAGE_KEY) !== null;
  }, []);

  return {
    gameState,
    getCurrentRace,
    recordRaceResult,
    resetSeason,
    saveProgress,
    loadProgress,
    hasSavedProgress,
    races: races2026,
  };
}
