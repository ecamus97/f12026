import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Dice } from "@/components/Dice";
import { Race, rollDice, rollDice50, canAdvance, checkPitStop, pointsSystem, Driver } from "@/data/f1Data";
import { RaceResult } from "@/hooks/useGameState";
import { Flag, Play, Zap, AlertTriangle, Wrench, XCircle, Trophy } from "lucide-react";

interface RaceDriverState {
  driver: Driver & { teamColor: string; teamName: string; carLevel: number; teamId: string };
  position: number;
  distance: number;
  inPits: boolean;
  pitsRemaining: number;
  pitStops: number;
  retired: boolean;
  finished: boolean;
}

interface RacePhaseProps {
  race: Race;
  grid: { driver: Driver & { teamColor: string; teamName: string; carLevel: number; teamId: string }; finalPosition?: number }[];
  onComplete: (positions: RaceResult['positions']) => void;
}

const RACE_DISTANCE = 50; // Total distance units to complete

export function RacePhase({ race, grid, onComplete }: RacePhaseProps) {
  const [drivers, setDrivers] = useState<RaceDriverState[]>(() =>
    grid
      .sort((a, b) => (a.finalPosition || 99) - (b.finalPosition || 99))
      .map((g, index) => ({
        driver: g.driver,
        position: index + 1,
        distance: 0,
        inPits: false,
        pitsRemaining: 0,
        pitStops: 0,
        retired: false,
        finished: false,
      }))
  );
  
  const [lap, setLap] = useState(1);
  const [isRolling, setIsRolling] = useState(false);
  const [currentAction, setCurrentAction] = useState<string | null>(null);
  const [battleInfo, setBattleInfo] = useState<{
    attacker: string;
    defender: string;
    attackerRoll: number;
    defenderRoll: number;
    result: "overtake" | "defend" | "pending";
  } | null>(null);
  const [raceComplete, setRaceComplete] = useState(false);

  const activeDrivers = drivers.filter(d => !d.retired && !d.finished);
  const finishedDrivers = drivers.filter(d => d.finished);

  const updatePositions = useCallback(() => {
    setDrivers(prev => {
      const sorted = [...prev]
        .filter(d => !d.retired)
        .sort((a, b) => {
          if (a.finished && !b.finished) return -1;
          if (!a.finished && b.finished) return 1;
          return b.distance - a.distance;
        });
      
      return prev.map(d => {
        const pos = sorted.findIndex(s => s.driver.id === d.driver.id);
        return { ...d, position: d.retired ? 99 : pos + 1 };
      });
    });
  }, []);

  const simulateLap = useCallback(() => {
    setIsRolling(true);
    setCurrentAction("Simulando vuelta...");

    setTimeout(() => {
      setDrivers(prev => {
        let updatedDrivers = prev.map(d => {
          if (d.retired || d.finished) return d;

          // Handle pit stop cooldown
          if (d.inPits) {
            const newPitsRemaining = d.pitsRemaining - 1;
            if (newPitsRemaining <= 0) {
              return { ...d, inPits: false, pitsRemaining: 0 };
            }
            return { ...d, pitsRemaining: newPitsRemaining };
          }

          // Roll for advancement
          const roll = rollDice();
          const advances = canAdvance(d.driver.carLevel, roll);
          const newDistance = d.distance + (advances ? 1 : 0);
          const finished = newDistance >= RACE_DISTANCE;

          return { ...d, distance: newDistance, finished };
        });

        // Check for battles (drivers at same distance)
        const activeByDistance = new Map<number, RaceDriverState[]>();
        updatedDrivers
          .filter(d => !d.retired && !d.finished && !d.inPits)
          .forEach(d => {
            const existing = activeByDistance.get(d.distance) || [];
            activeByDistance.set(d.distance, [...existing, d]);
          });

        // Resolve battles and check for pit stops
        activeByDistance.forEach((driversAtDistance) => {
          if (driversAtDistance.length > 1) {
            // Battle between drivers
            for (let i = 0; i < driversAtDistance.length - 1; i++) {
              const attacker = driversAtDistance[i + 1];
              const defender = driversAtDistance[i];

              // Check pit stops for both
              const attackerPitRoll = rollDice50();
              const defenderPitRoll = rollDice50();

              const attackerPits = checkPitStop(attacker.driver.avoidingCollision, attackerPitRoll);
              const defenderPits = checkPitStop(defender.driver.avoidingCollision, defenderPitRoll);

              updatedDrivers = updatedDrivers.map(d => {
                if (d.driver.id === attacker.driver.id && attackerPits) {
                  return handlePitStop(d);
                }
                if (d.driver.id === defender.driver.id && defenderPits) {
                  return handlePitStop(d);
                }
                return d;
              });
            }
          }
        });

        return updatedDrivers;
      });

      updatePositions();
      setLap(prev => prev + 1);
      setIsRolling(false);
      setCurrentAction(null);

      // Check if race is complete
      const allFinished = drivers.every(d => d.finished || d.retired);
      if (allFinished) {
        setRaceComplete(true);
      }
    }, 800);
  }, [updatePositions, drivers]);

  const handlePitStop = (driver: RaceDriverState): RaceDriverState => {
    const newPitStops = driver.pitStops + 1;
    
    if (newPitStops >= 4) {
      // Retire after 4th pit
      return { ...driver, retired: true, pitStops: newPitStops };
    }

    // Check if retire on subsequent pits
    if (newPitStops > 1) {
      const retireRoll = rollDice(2);
      if (retireRoll === 2) {
        return { ...driver, retired: true, pitStops: newPitStops };
      }
    }

    // Pit stop duration
    const pitDurations: Record<number, number> = { 1: 5, 2: 7, 3: 10 };
    const duration = pitDurations[newPitStops] || 5;

    return {
      ...driver,
      inPits: true,
      pitsRemaining: duration,
      pitStops: newPitStops,
    };
  };

  const autoCompleteRace = useCallback(() => {
    setIsRolling(true);
    setCurrentAction("Completando carrera...");

    setTimeout(() => {
      let simulatedDrivers = [...drivers];
      let safeguard = 0;
      const maxIterations = 1000;

      while (
        !simulatedDrivers.every(d => d.finished || d.retired) && 
        safeguard < maxIterations
      ) {
        safeguard++;
        
        simulatedDrivers = simulatedDrivers.map(d => {
          if (d.retired || d.finished) return d;

          if (d.inPits) {
            const newPitsRemaining = d.pitsRemaining - 1;
            if (newPitsRemaining <= 0) {
              return { ...d, inPits: false, pitsRemaining: 0 };
            }
            return { ...d, pitsRemaining: newPitsRemaining };
          }

          const roll = rollDice();
          const advances = canAdvance(d.driver.carLevel, roll);
          const newDistance = d.distance + (advances ? 1 : 0);
          const finished = newDistance >= RACE_DISTANCE;

          // Random pit check
          if (!finished && Math.random() < 0.02) {
            const pitRoll = rollDice50();
            if (checkPitStop(d.driver.avoidingCollision, pitRoll)) {
              const newPitStops = d.pitStops + 1;
              if (newPitStops >= 4) {
                return { ...d, retired: true, pitStops: newPitStops };
              }
              if (newPitStops > 1) {
                const retireRoll = rollDice(2);
                if (retireRoll === 2) {
                  return { ...d, retired: true, pitStops: newPitStops };
                }
              }
              const pitDurations: Record<number, number> = { 1: 5, 2: 7, 3: 10 };
              return {
                ...d,
                distance: newDistance,
                inPits: true,
                pitsRemaining: pitDurations[newPitStops] || 5,
                pitStops: newPitStops,
              };
            }
          }

          return { ...d, distance: newDistance, finished };
        });
      }

      // Sort by finish order
      simulatedDrivers.sort((a, b) => {
        if (a.retired && !b.retired) return 1;
        if (!a.retired && b.retired) return -1;
        return b.distance - a.distance;
      });

      simulatedDrivers = simulatedDrivers.map((d, i) => ({
        ...d,
        position: d.retired ? 99 : i + 1,
      }));

      setDrivers(simulatedDrivers);
      setRaceComplete(true);
      setIsRolling(false);
      setCurrentAction(null);
    }, 1000);
  }, [drivers]);

  const completeRace = useCallback(() => {
    const finalPositions = [...drivers]
      .filter(d => !d.retired)
      .sort((a, b) => b.distance - a.distance)
      .map((d, index) => ({
        position: index + 1,
        driverId: d.driver.id,
        driverName: d.driver.name,
        shortName: d.driver.shortName,
        teamId: d.driver.teamId,
        teamColor: d.driver.teamColor,
        points: pointsSystem[index + 1] || 0,
        retired: false,
      }));

    // Add retired drivers
    const retiredDrivers = drivers
      .filter(d => d.retired)
      .map(d => ({
        position: 99,
        driverId: d.driver.id,
        driverName: d.driver.name,
        shortName: d.driver.shortName,
        teamId: d.driver.teamId,
        teamColor: d.driver.teamColor,
        points: 0,
        retired: true,
      }));

    onComplete([...finalPositions, ...retiredDrivers]);
  }, [drivers, onComplete]);

  useEffect(() => {
    updatePositions();
  }, []);

  const sortedDrivers = [...drivers].sort((a, b) => {
    if (a.retired && !b.retired) return 1;
    if (!a.retired && b.retired) return -1;
    if (a.finished && !b.finished) return -1;
    if (!a.finished && b.finished) return 1;
    return b.distance - a.distance;
  });

  if (raceComplete) {
    const winner = sortedDrivers.find(d => !d.retired);
    
    return (
      <motion.div
        className="space-y-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="text-center space-y-2">
          <Trophy className="w-16 h-16 mx-auto text-yellow-400" />
          <h2 className="font-racing text-2xl text-gradient-primary">
            ¡Carrera Finalizada!
          </h2>
          <p className="text-muted-foreground">{race.flag} {race.name}</p>
          {winner && (
            <p className="font-racing text-xl text-primary mt-4">
              Ganador: {winner.driver.nationality} {winner.driver.name}
            </p>
          )}
        </div>

        <div className="grid gap-2 max-h-[350px] overflow-y-auto">
          {sortedDrivers.map((d, index) => (
            <motion.div
              key={d.driver.id}
              className={`flex items-center gap-3 p-2 rounded-lg border ${
                d.retired ? "bg-destructive/10 border-destructive/30" : "bg-card/50 border-border/30"
              }`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              {!d.retired && (
                <div className={`
                  w-7 h-7 rounded-full flex items-center justify-center font-racing font-bold text-xs
                  ${index === 0 ? "bg-gradient-to-br from-yellow-400 to-yellow-600 text-background" : ""}
                  ${index === 1 ? "bg-gradient-to-br from-gray-300 to-gray-500 text-background" : ""}
                  ${index === 2 ? "bg-gradient-to-br from-amber-600 to-amber-800 text-foreground" : ""}
                  ${index > 2 ? "bg-muted text-muted-foreground" : ""}
                `}>
                  {index + 1}
                </div>
              )}
              {d.retired && (
                <XCircle className="w-7 h-7 text-destructive" />
              )}
              <div className={`w-1 h-6 rounded-full ${d.driver.teamColor}`} />
              <span className="text-lg">{d.driver.nationality}</span>
              <span className="font-racing text-sm flex-1">{d.driver.shortName}</span>
              <span className="font-racing text-primary">
                {d.retired ? "DNF" : `+${pointsSystem[index + 1] || 0} pts`}
              </span>
            </motion.div>
          ))}
        </div>

        <Button
          onClick={completeRace}
          className="w-full font-racing"
          size="lg"
        >
          <Flag className="w-4 h-4 mr-2" />
          Finalizar Gran Premio
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-racing text-xl text-gradient-primary">Carrera</h2>
          <p className="text-sm text-muted-foreground">{race.flag} {race.name}</p>
        </div>
        <div className="text-right">
          <p className="font-racing text-lg text-primary">Vuelta {lap}</p>
          <p className="text-xs text-muted-foreground">
            {finishedDrivers.length} finalizados
          </p>
        </div>
      </div>

      {currentAction && (
        <div className="text-center py-2 text-muted-foreground animate-pulse">
          {currentAction}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          onClick={simulateLap}
          disabled={isRolling || raceComplete}
          className="flex-1 font-racing"
        >
          <Play className="w-4 h-4 mr-2" />
          Simular Vuelta
        </Button>
        <Button
          onClick={autoCompleteRace}
          disabled={isRolling || raceComplete}
          variant="outline"
          className="font-racing"
        >
          <Zap className="w-4 h-4 mr-2" />
          Auto
        </Button>
      </div>

      <div className="grid gap-1 max-h-[350px] overflow-y-auto">
        {sortedDrivers.map((d, index) => (
          <motion.div
            key={d.driver.id}
            className={`flex items-center gap-2 p-2 rounded text-sm ${
              d.retired ? "bg-destructive/10 opacity-50" : ""
            } ${d.finished ? "bg-green-500/10" : ""} ${
              d.inPits ? "bg-yellow-500/10" : ""
            }`}
            layout
          >
            <span className="w-5 font-racing text-muted-foreground">
              {d.retired ? "-" : index + 1}
            </span>
            <div className={`w-1 h-5 rounded ${d.driver.teamColor}`} />
            <span className="text-sm">{d.driver.nationality}</span>
            <span className="font-racing flex-1">{d.driver.shortName}</span>
            
            <div className="flex items-center gap-2">
              {d.inPits && (
                <div className="flex items-center gap-1 text-yellow-400">
                  <Wrench className="w-3 h-3" />
                  <span className="text-xs">{d.pitsRemaining}</span>
                </div>
              )}
              {d.pitStops > 0 && !d.inPits && (
                <span className="text-xs text-muted-foreground">
                  P×{d.pitStops}
                </span>
              )}
              {d.retired && (
                <XCircle className="w-4 h-4 text-destructive" />
              )}
              {d.finished && (
                <Flag className="w-4 h-4 text-green-400" />
              )}
            </div>

            <div className="w-24 bg-muted rounded-full h-2 overflow-hidden">
              <motion.div
                className={`h-full ${d.retired ? "bg-destructive" : "bg-primary"}`}
                initial={{ width: 0 }}
                animate={{ width: `${(d.distance / RACE_DISTANCE) * 100}%` }}
              />
            </div>
            <span className="w-10 text-right text-xs text-muted-foreground">
              {d.distance}/{RACE_DISTANCE}
            </span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
