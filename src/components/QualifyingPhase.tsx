import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Dice } from "@/components/Dice";
import { DriverCard } from "@/components/DriverCard";
import { Race, getAllDrivers, rollDice, canAdvance, Driver, Team } from "@/data/f1Data";
import { Flag, Play, SkipForward, Zap } from "lucide-react";

interface QualifyingDriverState {
  driver: Driver & { teamColor: string; teamName: string; carLevel: number; teamId: string };
  totalScore: number;
  advances: number;
  rolls: number[];
  eliminated: boolean;
  finalPosition?: number;
}

interface QualifyingPhaseProps {
  race: Race;
  onComplete: (grid: QualifyingDriverState[]) => void;
  teamsData?: Team[];
}

const getDriversFromTeams = (teamsData?: Team[]) => {
  if (!teamsData) return getAllDrivers();
  return teamsData.flatMap(team =>
    team.drivers.map(driver => ({
      ...driver,
      teamId: team.id,
      teamName: team.name,
      teamColor: team.color,
      carLevel: team.carLevel,
    }))
  );
};

export function QualifyingPhase({ race, onComplete, teamsData }: QualifyingPhaseProps) {
  const [drivers, setDrivers] = useState<QualifyingDriverState[]>(() =>
    getDriversFromTeams(teamsData).map(d => ({
      driver: d,
      totalScore: 0,
      advances: 0,
      rolls: [],
      eliminated: false,
    }))
  );
  const [currentPhase, setCurrentPhase] = useState<"Q1" | "Q2" | "Q3" | "complete">("Q1");
  const [currentDriverIndex, setCurrentDriverIndex] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const [phaseComplete, setPhaseComplete] = useState(false);

  const activeDrivers = drivers.filter(d => !d.eliminated);
  const currentDriver = activeDrivers[currentDriverIndex];

  const eliminationCounts: Record<string, number> = {
    Q1: 5, // Eliminate bottom 5 (22 drivers total, keep 17)
    Q2: 5, // Eliminate next 5 (keep 12)
    Q3: 0, // Top 12 fight for positions
  };

  const advancesNeeded = 10;

  const rollForDriver = useCallback(() => {
    if (!currentDriver) return;

    setIsRolling(true);
    setLastRoll(null);

    setTimeout(() => {
      const roll = rollDice();
      const carLevel = currentDriver.driver.carLevel;
      const advances = canAdvance(carLevel, roll);

      setLastRoll(roll);
      setIsRolling(false);

      setDrivers(prev =>
        prev.map(d => {
          if (d.driver.id !== currentDriver.driver.id) return d;
          const newAdvances = d.advances + (advances ? 1 : 0);
          const newRolls = [...d.rolls, roll];
          const newTotalScore = newRolls.reduce((a, b) => a + b, 0);

          return {
            ...d,
            advances: newAdvances,
            rolls: newRolls,
            totalScore: newTotalScore,
          };
        })
      );
    }, 500);
  }, [currentDriver]);

  const nextDriver = useCallback(() => {
    const updatedDriver = drivers.find(d => d.driver.id === currentDriver?.driver.id);
    
    if (updatedDriver && updatedDriver.advances >= advancesNeeded) {
      // Driver finished qualifying
      if (currentDriverIndex < activeDrivers.length - 1) {
        setCurrentDriverIndex(prev => prev + 1);
        setLastRoll(null);
      } else {
        // All drivers done, end phase
        setPhaseComplete(true);
      }
    } else if (currentDriverIndex < activeDrivers.length - 1) {
      setCurrentDriverIndex(prev => prev + 1);
      setLastRoll(null);
    } else {
      // Cycle back to first driver who hasn't completed
      setCurrentDriverIndex(0);
      setLastRoll(null);
    }
  }, [currentDriverIndex, activeDrivers.length, currentDriver, drivers]);

  const completePhase = useCallback(() => {
    const sortedDrivers = [...drivers]
      .filter(d => !d.eliminated)
      .sort((a, b) => a.totalScore - b.totalScore);

    const eliminateCount = eliminationCounts[currentPhase] || 0;
    const toEliminate = sortedDrivers.slice(-eliminateCount);

    if (currentPhase === "Q3" || eliminateCount === 0) {
      // Final positions
      const finalGrid = sortedDrivers.map((d, index) => ({
        ...d,
        finalPosition: index + 1,
      }));
      
      // Add eliminated drivers at the end
      const eliminatedDrivers = drivers
        .filter(d => d.eliminated)
        .map((d, index) => ({
          ...d,
          finalPosition: sortedDrivers.length + index + 1,
        }));

      setDrivers([...finalGrid, ...eliminatedDrivers]);
      setCurrentPhase("complete");
      return;
    }

    setDrivers(prev =>
      prev.map(d => {
        if (toEliminate.find(e => e.driver.id === d.driver.id)) {
          return { ...d, eliminated: true };
        }
        // Reset for next phase
        return { ...d, totalScore: 0, advances: 0, rolls: [] };
      })
    );

    if (currentPhase === "Q1") setCurrentPhase("Q2");
    else if (currentPhase === "Q2") setCurrentPhase("Q3");

    setCurrentDriverIndex(0);
    setPhaseComplete(false);
    setLastRoll(null);
  }, [currentPhase, drivers]);

  const autoCompletePhase = useCallback(() => {
    // Simulate all remaining rolls for all drivers
    const simulatedDrivers = drivers.map(d => {
      if (d.eliminated || d.advances >= advancesNeeded) return d;

      let advances = d.advances;
      let rolls = [...d.rolls];
      const carLevel = d.driver.carLevel;

      while (advances < advancesNeeded) {
        const roll = rollDice();
        rolls.push(roll);
        if (canAdvance(carLevel, roll)) {
          advances++;
        }
      }

      return {
        ...d,
        advances,
        rolls,
        totalScore: rolls.reduce((a, b) => a + b, 0),
      };
    });

    setDrivers(simulatedDrivers);
    setPhaseComplete(true);
  }, [drivers]);

  if (currentPhase === "complete") {
    const sortedGrid = drivers
      .filter(d => d.finalPosition !== undefined)
      .sort((a, b) => (a.finalPosition || 99) - (b.finalPosition || 99));

    return (
      <motion.div
        className="space-y-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="text-center">
          <h2 className="font-racing text-2xl text-gradient-primary mb-2">
            Clasificación Completa
          </h2>
          <p className="text-muted-foreground">{race.flag} {race.name}</p>
        </div>

        <div className="grid gap-2 max-h-[400px] overflow-y-auto">
          {sortedGrid.map(d => (
            <DriverCard
              key={d.driver.id}
              driver={d.driver}
              position={d.finalPosition}
            />
          ))}
        </div>

        <Button
          onClick={() => onComplete(sortedGrid)}
          className="w-full font-racing"
          size="lg"
        >
          <Flag className="w-4 h-4 mr-2" />
          Iniciar Carrera
        </Button>
      </motion.div>
    );
  }

  const driverDone = currentDriver?.advances >= advancesNeeded;

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-racing text-xl text-gradient-primary">{currentPhase}</h2>
          <p className="text-sm text-muted-foreground">{race.flag} {race.name}</p>
        </div>
        <div className="text-right">
          <p className="font-racing text-sm text-muted-foreground">
            {activeDrivers.length} pilotos
          </p>
        </div>
      </div>

      {currentDriver && !phaseComplete && (
        <div className="bg-card rounded-lg p-4 border border-border">
          <DriverCard driver={currentDriver.driver} showStats />
          
          <div className="mt-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Avances: <span className="text-primary font-bold">{currentDriver.advances}</span> / {advancesNeeded}
              </p>
              <p className="text-xs text-muted-foreground">
                Tiempo total: {currentDriver.totalScore}
              </p>
            </div>

            <div className="flex items-center gap-4">
              <Dice value={lastRoll || 0} rolling={isRolling} />
              
              {lastRoll && (
                <div className="text-center">
                  <p className={`text-sm font-bold ${
                    canAdvance(currentDriver.driver.carLevel, lastRoll) 
                      ? "text-green-400" 
                      : "text-red-400"
                  }`}>
                    {canAdvance(currentDriver.driver.carLevel, lastRoll) ? "¡Avanza!" : "No avanza"}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            {!driverDone ? (
              <Button
                onClick={rollForDriver}
                disabled={isRolling}
                className="flex-1 font-racing"
              >
                <Play className="w-4 h-4 mr-2" />
                Lanzar Dado
              </Button>
            ) : (
              <Button
                onClick={nextDriver}
                className="flex-1 font-racing"
                variant="secondary"
              >
                <SkipForward className="w-4 h-4 mr-2" />
                Siguiente Piloto
              </Button>
            )}
          </div>
        </div>
      )}

      {phaseComplete && (
        <div className="text-center space-y-4">
          <p className="text-lg text-muted-foreground">Fase {currentPhase} completada</p>
          <Button onClick={completePhase} className="font-racing" size="lg">
            {currentPhase === "Q3" ? "Ver Parrilla" : `Continuar a ${currentPhase === "Q1" ? "Q2" : "Q3"}`}
          </Button>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          onClick={autoCompletePhase}
          variant="outline"
          className="flex-1 font-racing"
          size="sm"
        >
          <Zap className="w-4 h-4 mr-2" />
          Auto-completar {currentPhase}
        </Button>
      </div>

      <div className="mt-4">
        <h3 className="font-racing text-sm text-muted-foreground mb-2">Tiempos actuales</h3>
        <div className="grid gap-1 max-h-[200px] overflow-y-auto text-xs">
          {[...activeDrivers]
            .sort((a, b) => a.totalScore - b.totalScore)
            .map((d, i) => (
              <div
                key={d.driver.id}
                className={`flex items-center gap-2 p-1 rounded ${
                  d.driver.id === currentDriver?.driver.id ? "bg-primary/20" : ""
                }`}
              >
                <span className="w-5 text-muted-foreground">{i + 1}.</span>
                <span className={`w-1 h-4 rounded ${d.driver.teamColor}`} />
                <span className="font-racing">{d.driver.shortName}</span>
                <span className="ml-auto text-muted-foreground">
                  {d.totalScore} ({d.advances}/{advancesNeeded})
                </span>
              </div>
            ))}
        </div>
      </div>
    </motion.div>
  );
}
