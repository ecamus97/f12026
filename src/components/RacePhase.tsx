import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Race,
  rollDice,
  rollDice50,
  canAdvance,
  checkPitStop,
  pointsSystem,
  Driver,
} from "@/data/f1Data";
import { RaceResult } from "@/hooks/useGameState";
import { Flag, Play, Zap, Wrench, XCircle, Trophy, Swords, History, Users } from "lucide-react";
import {
  RaceDriverState,
  BattleInfo,
  RaceEvent,
  RaceConfig,
  DEFAULT_CONFIG,
  RACE_DISTANCE,
} from "./race/types";
import { RaceConfigPanel } from "./race/RaceConfigPanel";
import { RaceEventHistory } from "./race/RaceEventHistory";
import { resolveBattle } from "./race/battleLogic";

interface RacePhaseProps {
  race: Race;
  grid: {
    driver: Driver & {
      teamColor: string;
      teamName: string;
      carLevel: number;
      teamId: string;
    };
    finalPosition?: number;
  }[];
  onComplete: (positions: RaceResult["positions"]) => void;
  raceConfig?: RaceConfig;
}

function isPlayable(d: RaceDriverState) {
  return !d.retired && !d.finished;
}

function findNextPlayableIndex(drivers: RaceDriverState[], startIndex: number): number | null {
  for (let i = Math.max(0, startIndex); i < drivers.length; i++) {
    if (isPlayable(drivers[i])) return i;
  }
  return null;
}

export function RacePhase({ race, grid, onComplete, raceConfig }: RacePhaseProps) {
  const [config, setConfig] = useState<RaceConfig | null>(raceConfig || null);
  const [drivers, setDrivers] = useState<RaceDriverState[]>(() =>
    grid
      .slice()
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
        finishOrder: 0,
        justOvertaken: false,
      }))
  );

  const [nextFinishOrder, setNextFinishOrder] = useState(1);
  const [lap, setLap] = useState(1);
  const [turnCursor, setTurnCursor] = useState(0);
  const [turnInLap, setTurnInLap] = useState(1);
  const [isRolling, setIsRolling] = useState(false);
  const [currentAction, setCurrentAction] = useState<string | null>(null);
  const [battleInfo, setBattleInfo] = useState<BattleInfo | null>(null);
  const [raceComplete, setRaceComplete] = useState(false);
  const [events, setEvents] = useState<RaceEvent[]>([]);

  const addEvent = useCallback(
    (driverShortName: string, type: RaceEvent["type"], description: string) => {
      setEvents((prev) => [
        ...prev,
        { lap, turn: turnInLap, driverShortName, type, description, timestamp: Date.now() },
      ]);
    },
    [lap, turnInLap]
  );

  const nextPlayableIndex = useMemo(() => findNextPlayableIndex(drivers, turnCursor), [drivers, turnCursor]);
  const nextDriver = nextPlayableIndex != null ? drivers[nextPlayableIndex] : null;

  const finishedCount = useMemo(() => drivers.filter((d) => d.finished).length, [drivers]);

  const handlePitStop = useCallback(
    (driver: RaceDriverState): RaceDriverState => {
      const cfg = config || DEFAULT_CONFIG;
      const newPitStops = driver.pitStops + 1;

      if (newPitStops >= cfg.maxPitsBeforeDNF) {
        return { ...driver, retired: true, pitStops: newPitStops };
      }

      if (cfg.dnfOnSecondPitChance && newPitStops > 1) {
        const retireRoll = rollDice(2);
        if (retireRoll === 2) {
          return { ...driver, retired: true, pitStops: newPitStops };
        }
      }

      const duration = cfg.pitDurations[newPitStops as 1 | 2 | 3] || 5;

      return {
        ...driver,
        inPits: true,
        pitsRemaining: duration,
        pitStops: newPitStops,
      };
    },
    [config]
  );

  const stepTurn = useCallback(() => {
    if (isRolling || raceComplete || !config) return;

    setIsRolling(true);
    setBattleInfo(null);

    setTimeout(() => {
      setDrivers((prev) => {
        const currentIdx = findNextPlayableIndex(prev, turnCursor);
        if (currentIdx == null) {
          setRaceComplete(true);
          setIsRolling(false);
          setCurrentAction(null);
          return prev;
        }

        // IMPORTANTE: El array mantiene el orden de posiciones
        // drivers[0] = P1, drivers[1] = P2, etc.
        let updated = prev.slice();
        let d = { ...updated[currentIdx] };

        setCurrentAction(`Turno: ${d.driver.shortName}`);

        // Si fue adelantado en este turno, solo limpia el flag y pasa al siguiente
        if (d.justOvertaken) {
          d = { ...d, justOvertaken: false };
          updated[currentIdx] = d;

          const nextIdx = findNextPlayableIndex(updated, currentIdx + 1);
          if (nextIdx == null) {
            // Nueva vuelta - limpiar flags
            updated = updated.map((drv) => ({ ...drv, justOvertaken: false }));
            setLap((l) => l + 1);
            setTurnCursor(0);
            setTurnInLap(1);
          } else {
            setTurnCursor(nextIdx);
            setTurnInLap((t) => t + 1);
          }

          setIsRolling(false);
          setCurrentAction(null);
          return updated;
        }

        // 1) Pits cooldown
        if (d.inPits) {
          const newRemaining = d.pitsRemaining - 1;
          d = newRemaining <= 0 ? { ...d, inPits: false, pitsRemaining: 0 } : { ...d, pitsRemaining: newRemaining };
          updated[currentIdx] = d;
          addEvent(d.driver.shortName, "pit", `En pits (${d.pitsRemaining} turnos restantes)`);
        } else {
          // 2) Avance
          const roll = rollDice();
          const advances = canAdvance(d.driver.carLevel, roll);
          const newDistance = d.distance + (advances ? 1 : 0);

          d = { ...d, distance: newDistance };

          if (advances) {
            addEvent(d.driver.shortName, "advance", `Avanza a ${newDistance}/${RACE_DISTANCE}`);
          } else {
            addEvent(d.driver.shortName, "stay", `Se mantiene en ${d.distance}/${RACE_DISTANCE}`);
          }

          // 3) Chequeo pits
          if (Math.random() < (config?.pitCheckChance || DEFAULT_CONFIG.pitCheckChance)) {
            const pitRoll = rollDice50();
            if (checkPitStop(d.driver.avoidingCollision, pitRoll)) {
              const beforeRetired = d.retired;
              d = handlePitStop(d);
              if (d.retired && !beforeRetired) {
                addEvent(d.driver.shortName, "dnf", "Retirado por múltiples paradas");
              } else if (d.inPits) {
                addEvent(d.driver.shortName, "pit", `Entra a pits (${d.pitsRemaining} turnos)`);
              }
            }
          }

          // 4) Meta - solo si está liderando (posición 0 en el array de activos)
          if (!d.retired && newDistance >= RACE_DISTANCE) {
            d = { ...d, finished: true, finishOrder: nextFinishOrder };
            setNextFinishOrder((n) => n + 1);
            addEvent(d.driver.shortName, "finish", `Cruza la meta en P${nextFinishOrder}`);
          }

          updated[currentIdx] = d;

          // 5) Batalla de adelantamiento
          // Solo puede haber batalla si el piloto actual alcanza o supera la distancia del de adelante
          if (isPlayable(d) && currentIdx > 0) {
            const defenderIdx = currentIdx - 1;
            const defender = updated[defenderIdx];

            const canBattle =
              !defender.retired &&
              !defender.finished &&
              !d.inPits &&
              !defender.inPits &&
              d.distance >= defender.distance;

            if (canBattle) {
              const { overtake, info } = resolveBattle(d, defender);
              setBattleInfo(info);

              if (overtake) {
                // Verificar si el defensor era el primero en esa distancia
                const isDefenderFirstAtDistance = !updated
                  .slice(0, defenderIdx)
                  .some((other) => isPlayable(other) && other.distance === defender.distance);

                // Si el defensor era el primero en esa distancia, el atacante avanza una vuelta
                const attackerNewDistance = isDefenderFirstAtDistance 
                  ? defender.distance + 1 
                  : defender.distance;

                const attackerWithNewDist = { ...d, distance: attackerNewDistance };
                const defenderMarked = { ...defender, justOvertaken: true };
                
                updated[defenderIdx] = attackerWithNewDist;
                updated[currentIdx] = defenderMarked;
                
                if (isDefenderFirstAtDistance) {
                  addEvent(d.driver.shortName, "battle_win", `Adelanta a ${defender.driver.shortName} y avanza a ${attackerNewDistance}/${RACE_DISTANCE}`);
                } else {
                  addEvent(d.driver.shortName, "battle_win", `Adelanta a ${defender.driver.shortName}`);
                }
              } else {
                // No adelanta - su distancia se iguala a la del defensor (no puede tener más)
                d = { ...d, distance: defender.distance };
                updated[currentIdx] = d;
                addEvent(d.driver.shortName, "battle_lose", `No puede adelantar a ${defender.driver.shortName}`);
              }
            }
          }
        }

        // Actualizar posiciones basadas en el orden del array
        updated = updated.map((drv, idx) => ({ ...drv, position: drv.retired ? 99 : idx + 1 }));

        // 6) Siguiente piloto
        // Buscar al siguiente piloto jugable DESPUÉS del actual
        const nextIdx = findNextPlayableIndex(updated, currentIdx + 1);
        if (nextIdx == null) {
          // Nueva vuelta
          updated = updated.map((drv) => ({ ...drv, justOvertaken: false }));
          setLap((l) => l + 1);
          setTurnCursor(0);
          setTurnInLap(1);
        } else {
          setTurnCursor(nextIdx);
          setTurnInLap((t) => t + 1);
        }

        const allDone = updated.every((x) => x.retired || x.finished);
        if (allDone) {
          setRaceComplete(true);
        }

        setIsRolling(false);
        setCurrentAction(null);
        return updated;
      });
    }, 550);
  }, [addEvent, config, handlePitStop, isRolling, nextFinishOrder, raceComplete, turnCursor]);

  const autoCompleteRace = useCallback(() => {
    if (isRolling || raceComplete || !config) return;

    setIsRolling(true);
    setCurrentAction("Completando carrera...");
    setBattleInfo(null);

    setTimeout(() => {
      let simulated = drivers.slice();
      let cursor = turnCursor;
      let localFinishOrder = nextFinishOrder;
      let safeguard = 0;
      const cfg = config || DEFAULT_CONFIG;

      while (!simulated.every((d) => d.retired || d.finished) && safeguard < 20000) {
        safeguard++;

        const currentIdx = findNextPlayableIndex(simulated, cursor);
        if (currentIdx == null) {
          simulated = simulated.map((drv) => ({ ...drv, justOvertaken: false }));
          cursor = 0;
          continue;
        }

        let d = { ...simulated[currentIdx] };

        // Skip si fue adelantado
        if (d.justOvertaken) {
          d = { ...d, justOvertaken: false };
          simulated[currentIdx] = d;
          const nextIdx = findNextPlayableIndex(simulated, currentIdx + 1);
          if (nextIdx == null) {
            simulated = simulated.map((drv) => ({ ...drv, justOvertaken: false }));
            cursor = 0;
          } else {
            cursor = nextIdx;
          }
          continue;
        }

        if (d.inPits) {
          const newRemaining = d.pitsRemaining - 1;
          d = newRemaining <= 0 ? { ...d, inPits: false, pitsRemaining: 0 } : { ...d, pitsRemaining: newRemaining };
          simulated[currentIdx] = d;
        } else {
          const roll = rollDice();
          const advances = canAdvance(d.driver.carLevel, roll);
          const newDistance = d.distance + (advances ? 1 : 0);
          d = { ...d, distance: newDistance };

          if (Math.random() < cfg.pitCheckChance) {
            const pitRoll = rollDice50();
            if (checkPitStop(d.driver.avoidingCollision, pitRoll)) {
              const newPitStops = d.pitStops + 1;
              if (newPitStops >= cfg.maxPitsBeforeDNF) {
                d = { ...d, retired: true, pitStops: newPitStops };
              } else if (cfg.dnfOnSecondPitChance && newPitStops > 1 && rollDice(2) === 2) {
                d = { ...d, retired: true, pitStops: newPitStops };
              } else {
                const duration = cfg.pitDurations[newPitStops as 1 | 2 | 3] || 5;
                d = { ...d, inPits: true, pitsRemaining: duration, pitStops: newPitStops };
              }
            }
          }

          if (!d.retired && newDistance >= RACE_DISTANCE) {
            d = { ...d, finished: true, finishOrder: localFinishOrder++ };
            simulated[currentIdx] = d;
          } else {
            simulated[currentIdx] = d;

            if (isPlayable(d) && currentIdx > 0) {
              const defenderIdx = currentIdx - 1;
              const defender = simulated[defenderIdx];
              const canBattle =
                !defender.retired && !defender.finished && !d.inPits && !defender.inPits && d.distance >= defender.distance;

              if (canBattle) {
                const { overtake } = resolveBattle(d, defender);
                if (overtake) {
                  // Verificar si el defensor era el primero en esa distancia
                  const isDefenderFirstAtDistance = !simulated
                    .slice(0, defenderIdx)
                    .some((other) => isPlayable(other) && other.distance === defender.distance);

                  const attackerNewDistance = isDefenderFirstAtDistance 
                    ? defender.distance + 1 
                    : defender.distance;

                  const attackerWithNewDist = { ...d, distance: attackerNewDistance };
                  const defenderMarked = { ...defender, justOvertaken: true };
                  simulated[defenderIdx] = attackerWithNewDist;
                  simulated[currentIdx] = defenderMarked;
                } else {
                  simulated[currentIdx] = { ...d, distance: defender.distance };
                }
              }
            }
          }
        }

        simulated = simulated.map((drv, idx) => ({ ...drv, position: drv.retired ? 99 : idx + 1 }));

        const nextIdx = findNextPlayableIndex(simulated, currentIdx + 1);
        if (nextIdx == null) {
          simulated = simulated.map((drv) => ({ ...drv, justOvertaken: false }));
          cursor = 0;
        } else {
          cursor = nextIdx;
        }
      }

      setDrivers(simulated);
      setNextFinishOrder(localFinishOrder);
      setRaceComplete(true);
      setIsRolling(false);
      setCurrentAction(null);
    }, 900);
  }, [config, drivers, isRolling, nextFinishOrder, raceComplete, turnCursor]);

  const completeRace = useCallback(() => {
    const finished = drivers.filter((d) => d.finished).sort((a, b) => a.finishOrder - b.finishOrder);
    const notFinished = drivers.filter((d) => !d.finished && !d.retired).sort((a, b) => b.distance - a.distance);
    const retired = drivers.filter((d) => d.retired);

    const classified = [...finished, ...notFinished];

    const finalPositions = classified.map((d, index) => ({
      position: index + 1,
      driverId: d.driver.id,
      driverName: d.driver.name,
      shortName: d.driver.shortName,
      teamId: d.driver.teamId,
      teamColor: d.driver.teamColor,
      points: pointsSystem[index + 1] || 0,
      retired: false,
    }));

    const retiredDrivers = retired.map((d) => ({
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

  // Si no hay config, mostrar panel de configuración
  if (!config) {
    return <RaceConfigPanel onStartRace={setConfig} raceName={race.name} raceFlag={race.flag} />;
  }

  if (raceComplete) {
    const winner = drivers.find((d) => d.finished && d.finishOrder === 1);

    return (
      <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="text-center space-y-2">
          <Trophy className="w-16 h-16 mx-auto text-yellow-400" />
          <h2 className="font-racing text-2xl text-gradient-primary">¡Carrera Finalizada!</h2>
          <p className="text-muted-foreground">
            {race.flag} {race.name}
          </p>
          {winner && (
            <p className="font-racing text-xl text-primary mt-4">
              Ganador: {winner.driver.nationality} {winner.driver.name}
            </p>
          )}
        </div>

        <Tabs defaultValue="results" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="results" className="gap-1">
              <Users className="w-4 h-4" /> Resultados
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1">
              <History className="w-4 h-4" /> Historial
            </TabsTrigger>
          </TabsList>
          <TabsContent value="results">
            <div className="grid gap-2 max-h-[300px] overflow-y-auto">
              {drivers.map((d, index) => (
                <motion.div
                  key={d.driver.id}
                  className={`flex items-center gap-3 p-2 rounded-lg border ${
                    d.retired ? "bg-destructive/10 border-destructive/30" : "bg-card/50 border-border/30"
                  }`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                >
                  {!d.retired ? (
                    <div
                      className={`
                        w-7 h-7 rounded-full flex items-center justify-center font-racing font-bold text-xs
                        ${d.finishOrder === 1 ? "bg-gradient-to-br from-yellow-400 to-yellow-600 text-background" : ""}
                        ${d.finishOrder === 2 ? "bg-gradient-to-br from-gray-300 to-gray-500 text-background" : ""}
                        ${d.finishOrder === 3 ? "bg-gradient-to-br from-amber-600 to-amber-800 text-white" : ""}
                        ${d.finishOrder > 3 || !d.finished ? "bg-muted text-muted-foreground" : ""}
                      `}
                    >
                      {d.finished ? d.finishOrder : "-"}
                    </div>
                  ) : (
                    <XCircle className="w-7 h-7 text-destructive" />
                  )}

                  <div className="w-1 h-6 rounded-full" style={{ backgroundColor: d.driver.teamColor }} />

                  <span className="font-racing text-sm flex-1">{d.driver.shortName}</span>

                  <span className="text-xs text-muted-foreground">
                    {d.finished ? `${d.distance}/${RACE_DISTANCE}` : d.retired ? "DNF" : `${d.distance}/${RACE_DISTANCE}`}
                  </span>

                  {d.finished && pointsSystem[d.finishOrder] && (
                    <span className="text-xs font-bold text-primary">+{pointsSystem[d.finishOrder]}</span>
                  )}
                </motion.div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="history">
            <RaceEventHistory events={events} />
          </TabsContent>
        </Tabs>

        <Button onClick={completeRace} className="w-full gap-2" size="lg">
          <Flag className="w-4 h-4" />
          Confirmar Resultados
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="text-center space-y-1">
        <h2 className="font-racing text-xl text-gradient-primary">
          {race.flag} {race.name}
        </h2>
        <p className="text-sm text-muted-foreground">
          Vuelta {lap} / {RACE_DISTANCE} • {finishedCount} finalizados
        </p>
        {currentAction && <p className="text-xs text-primary animate-pulse">{currentAction}</p>}
      </div>

      {battleInfo && (
        <motion.div
          className="p-3 bg-card/80 border border-yellow-500/30 rounded-lg text-sm"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-2 justify-center mb-2">
            <Swords className="w-4 h-4 text-yellow-400" />
            <span className="font-racing text-yellow-400">BATALLA</span>
          </div>
          <div className="flex justify-center items-center gap-4 text-xs">
            <div className="text-center">
              <div className="font-bold">{battleInfo.attacker}</div>
              <div className="text-muted-foreground">Ataca</div>
              <div className="font-mono">
                🎲 {battleInfo.attackerRoll1}
                {battleInfo.attackerRoll2 !== undefined && ` → ${battleInfo.attackerRoll2}`}
              </div>
            </div>
            <div className="text-lg font-bold">VS</div>
            <div className="text-center">
              <div className="font-bold">{battleInfo.defender}</div>
              <div className="text-muted-foreground">Defiende</div>
              <div className="font-mono">
                🎲 {battleInfo.defenderRoll1}
                {battleInfo.defenderRoll2 !== undefined && ` → ${battleInfo.defenderRoll2}`}
              </div>
            </div>
          </div>
          <div className="text-center mt-2">
            <span className={`font-bold ${battleInfo.result === "overtake" ? "text-green-400" : "text-red-400"}`}>
              {battleInfo.result === "overtake" ? "¡ADELANTAMIENTO!" : "DEFENSA EXITOSA"}
            </span>
            {battleInfo.advantage !== "none" && (
              <span className="text-xs text-muted-foreground ml-2">
                (Ventaja: {battleInfo.advantage === "attacker" ? battleInfo.attacker : battleInfo.defender})
              </span>
            )}
          </div>
        </motion.div>
      )}

      <Tabs defaultValue="grid" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="grid" className="gap-1">
            <Users className="w-4 h-4" /> Posiciones
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1">
            <History className="w-4 h-4" /> Historial
          </TabsTrigger>
        </TabsList>
        <TabsContent value="grid">
          <div className="grid gap-1 max-h-[280px] overflow-y-auto">
            {drivers.map((d, index) => {
              const isCurrentDriver = nextPlayableIndex === index;

              return (
                <motion.div
                  key={d.driver.id}
                  className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${
                    d.retired
                      ? "bg-destructive/10 border-destructive/30 opacity-50"
                      : d.finished
                        ? "bg-primary/10 border-primary/30"
                        : d.inPits
                          ? "bg-orange-500/10 border-orange-500/30"
                          : isCurrentDriver
                            ? "bg-yellow-500/20 border-yellow-500/50 ring-2 ring-yellow-500/30"
                            : "bg-card/30 border-border/20"
                  }`}
                  layout
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                >
                  <div
                    className={`
                      w-6 h-6 rounded-full flex items-center justify-center font-racing font-bold text-xs
                      ${d.finished && d.finishOrder === 1 ? "bg-gradient-to-br from-yellow-400 to-yellow-600 text-background" : ""}
                      ${d.finished && d.finishOrder === 2 ? "bg-gradient-to-br from-gray-300 to-gray-500 text-background" : ""}
                      ${d.finished && d.finishOrder === 3 ? "bg-gradient-to-br from-amber-600 to-amber-800 text-white" : ""}
                      ${!d.finished || d.finishOrder > 3 ? "bg-muted text-muted-foreground" : ""}
                    `}
                  >
                    {d.finished ? d.finishOrder : index + 1}
                  </div>

                  <div className="w-1 h-5 rounded-full" style={{ backgroundColor: d.driver.teamColor }} />

                  <span className="font-racing text-sm flex-1">{d.driver.shortName}</span>

                  {d.retired && <XCircle className="w-4 h-4 text-destructive" />}
                  {d.inPits && (
                    <span className="flex items-center gap-1 text-xs text-orange-400">
                      <Wrench className="w-3 h-3" /> {d.pitsRemaining}
                    </span>
                  )}
                  {d.finished && <Flag className="w-4 h-4 text-primary" />}

                  <div className="w-16 bg-muted/30 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${(d.distance / RACE_DISTANCE) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-12 text-right font-mono">
                    {d.distance}/{RACE_DISTANCE}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </TabsContent>
        <TabsContent value="history">
          <RaceEventHistory events={events} />
        </TabsContent>
      </Tabs>

      <div className="flex gap-2">
        <Button onClick={stepTurn} disabled={isRolling || !nextDriver} className="flex-1 gap-2" size="lg">
          <Play className="w-4 h-4" />
          {nextDriver ? `Turno: ${nextDriver.driver.shortName}` : "Sin pilotos"}
        </Button>
        <Button onClick={autoCompleteRace} disabled={isRolling} variant="outline" className="gap-2">
          <Zap className="w-4 h-4" />
          Auto
        </Button>
      </div>
    </motion.div>
  );
}
