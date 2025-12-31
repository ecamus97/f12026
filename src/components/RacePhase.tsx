import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
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
import {
  Flag,
  Play,
  Zap,
  Wrench,
  XCircle,
  Trophy,
  Swords,
} from "lucide-react";

interface RaceDriverState {
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
}

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
}

type Advantage = "attacker" | "defender" | "none";

type BattleInfo = {
  attacker: string;
  defender: string;
  advantage: Advantage;
  attackerRoll1: number;
  defenderRoll1: number;
  attackerRoll2?: number;
  defenderRoll2?: number;
  result: "overtake" | "defend";
};

const RACE_DISTANCE = 50; // Total distance units to complete

// Probabilidad por turno (por piloto) de intentar un chequeo de pits.
// La tirada real (d50) + checkPitStop() ya filtran bastante, así que este valor puede ser “moderado”.
const PIT_CHECK_CHANCE_PER_TURN = 0.07;

function isPlayable(d: RaceDriverState) {
  return !d.retired && !d.finished;
}

function findNextPlayableIndex(drivers: RaceDriverState[], startIndex: number): number | null {
  for (let i = Math.max(0, startIndex); i < drivers.length; i++) {
    if (isPlayable(drivers[i])) return i;
  }
  return null;
}

function resolveBattle(attacker: RaceDriverState, defender: RaceDriverState): { overtake: boolean; info: BattleInfo } {
  const attackerStat = attacker.driver.overtaking;
  const defenderStat = defender.driver.maintainingPosition;

  const advantage: Advantage =
    attackerStat > defenderStat ? "attacker" : attackerStat < defenderStat ? "defender" : "none";

  const attackerRoll1 = rollDice();
  const defenderRoll1 = rollDice();

  const attackerWinsFirst = attackerRoll1 > defenderRoll1; // empate favorece al que se defiende
  const advantagedSideLostOrTied =
    advantage === "attacker"
      ? !attackerWinsFirst
      : advantage === "defender"
        ? attackerWinsFirst
        : false;

  // Si el que tenía ventaja “perdió” el primer duelo, tiene una segunda oportunidad.
  if (advantage !== "none" && advantagedSideLostOrTied) {
    const attackerRoll2 = rollDice();
    const defenderRoll2 = rollDice();
    const attackerWinsSecond = attackerRoll2 > defenderRoll2; // empate defiende

    return {
      overtake: attackerWinsSecond,
      info: {
        attacker: attacker.driver.shortName,
        defender: defender.driver.shortName,
        advantage,
        attackerRoll1,
        defenderRoll1,
        attackerRoll2,
        defenderRoll2,
        result: attackerWinsSecond ? "overtake" : "defend",
      },
    };
  }

  return {
    overtake: attackerWinsFirst,
    info: {
      attacker: attacker.driver.shortName,
      defender: defender.driver.shortName,
      advantage,
      attackerRoll1,
      defenderRoll1,
      result: attackerWinsFirst ? "overtake" : "defend",
    },
  };
}

export function RacePhase({ race, grid, onComplete }: RacePhaseProps) {
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
      }))
  );

  const [nextFinishOrder, setNextFinishOrder] = useState(1);
  const [lap, setLap] = useState(1);
  const [turnCursor, setTurnCursor] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [currentAction, setCurrentAction] = useState<string | null>(null);
  const [battleInfo, setBattleInfo] = useState<BattleInfo | null>(null);
  const [raceComplete, setRaceComplete] = useState(false);

  const nextPlayableIndex = useMemo(() => findNextPlayableIndex(drivers, turnCursor), [drivers, turnCursor]);
  const nextDriver = nextPlayableIndex != null ? drivers[nextPlayableIndex] : null;

  const finishedCount = useMemo(() => drivers.filter(d => d.finished).length, [drivers]);

  const recalcPositions = useCallback((list: RaceDriverState[]) => {
    return list.map((d, idx) => ({ ...d, position: d.retired ? 99 : idx + 1 }));
  }, []);

  const handlePitStop = useCallback((driver: RaceDriverState): RaceDriverState => {
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
  }, []);

  const stepTurn = useCallback(() => {
    if (isRolling || raceComplete) return;

    setIsRolling(true);
    setBattleInfo(null);

    setTimeout(() => {
      setDrivers(prev => {
        const currentIdx = findNextPlayableIndex(prev, turnCursor);
        if (currentIdx == null) {
          setRaceComplete(true);
          setIsRolling(false);
          setCurrentAction(null);
          return prev;
        }

        let updated = prev.slice();
        let d = { ...updated[currentIdx] };

        setCurrentAction(`Turno: ${d.driver.shortName}`);

        // 1) Pits cooldown (si está en pits, solo baja el contador)
        if (d.inPits) {
          const newRemaining = d.pitsRemaining - 1;
          d = newRemaining <= 0 ? { ...d, inPits: false, pitsRemaining: 0 } : { ...d, pitsRemaining: newRemaining };
          updated[currentIdx] = d;
        } else {
          // 2) Avance
          const roll = rollDice();
          const advances = canAdvance(d.driver.carLevel, roll);
          const newDistance = d.distance + (advances ? 1 : 0);

          d = { ...d, distance: newDistance };

          // 3) Chequeo pits (por turno)
          if (Math.random() < PIT_CHECK_CHANCE_PER_TURN) {
            const pitRoll = rollDice50();
            if (checkPitStop(d.driver.avoidingCollision, pitRoll)) {
              d = handlePitStop(d);
            }
          }

          // 4) Meta: al cruzar, se congela el orden actual (NO se permite adelantar en la meta)
          if (!d.retired && newDistance >= RACE_DISTANCE) {
            d = { ...d, finished: true, finishOrder: nextFinishOrder };
            setNextFinishOrder(n => n + 1);
          }

          updated[currentIdx] = d;

          // 5) Batalla de adelantamiento (solo si NO finalizó en este turno)
          if (isPlayable(d) && currentIdx > 0) {
            const defender = updated[currentIdx - 1];

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
                // Swap (adelanta)
                updated[currentIdx - 1] = { ...d, distance: Math.max(d.distance, defender.distance) };
                updated[currentIdx] = { ...defender, distance: Math.max(d.distance, defender.distance) };
              } else {
                // No adelanta: se queda detrás (y no puede quedar “más avanzado” que el de adelante)
                updated[currentIdx] = { ...d, distance: Math.min(d.distance, defender.distance) };
              }
            }
          }
        }

        updated = recalcPositions(updated);

        // 6) Fin de vuelta / siguiente piloto
        const processedId = updated.find(u => u.driver.id === prev[currentIdx].driver.id)?.driver.id;
        const processedNewIndex = processedId
          ? updated.findIndex(x => x.driver.id === processedId)
          : currentIdx;

        const nextIdx = findNextPlayableIndex(updated, processedNewIndex + 1);
        if (nextIdx == null) {
          setLap(l => l + 1);
          setTurnCursor(0);
        } else {
          setTurnCursor(nextIdx);
        }

        const allDone = updated.every(x => x.retired || x.finished);
        if (allDone) {
          setRaceComplete(true);
        }

        setIsRolling(false);
        setCurrentAction(null);
        return updated;
      });
    }, 550);
  }, [handlePitStop, isRolling, nextFinishOrder, raceComplete, recalcPositions, turnCursor]);

  const autoCompleteRace = useCallback(() => {
    if (isRolling || raceComplete) return;

    setIsRolling(true);
    setCurrentAction("Completando carrera...");
    setBattleInfo(null);

    setTimeout(() => {
      // Simulación rápida en memoria (misma lógica conceptual, sin animación por turno)
      let simulated = drivers.slice();
      let cursor = turnCursor;
      let localFinishOrder = nextFinishOrder;
      let safeguard = 0;

      while (!simulated.every(d => d.retired || d.finished) && safeguard < 20000) {
        safeguard++;

        const currentIdx = findNextPlayableIndex(simulated, cursor);
        if (currentIdx == null) {
          cursor = 0;
          continue;
        }

        let d = { ...simulated[currentIdx] };

        if (d.inPits) {
          const newRemaining = d.pitsRemaining - 1;
          d = newRemaining <= 0 ? { ...d, inPits: false, pitsRemaining: 0 } : { ...d, pitsRemaining: newRemaining };
          simulated[currentIdx] = d;
        } else {
          const roll = rollDice();
          const advances = canAdvance(d.driver.carLevel, roll);
          const newDistance = d.distance + (advances ? 1 : 0);
          d = { ...d, distance: newDistance };

          if (Math.random() < PIT_CHECK_CHANCE_PER_TURN) {
            const pitRoll = rollDice50();
            if (checkPitStop(d.driver.avoidingCollision, pitRoll)) {
              d = handlePitStop(d);
            }
          }

          if (!d.retired && newDistance >= RACE_DISTANCE) {
            d = { ...d, finished: true, finishOrder: localFinishOrder++ };
            simulated[currentIdx] = d;
          } else {
            simulated[currentIdx] = d;

            if (isPlayable(d) && currentIdx > 0) {
              const defender = simulated[currentIdx - 1];
              const canBattle =
                !defender.retired &&
                !defender.finished &&
                !d.inPits &&
                !defender.inPits &&
                d.distance >= defender.distance;

              if (canBattle) {
                const { overtake } = resolveBattle(d, defender);
                if (overtake) {
                  simulated[currentIdx - 1] = { ...d, distance: Math.max(d.distance, defender.distance) };
                  simulated[currentIdx] = { ...defender, distance: Math.max(d.distance, defender.distance) };
                } else {
                  simulated[currentIdx] = { ...d, distance: Math.min(d.distance, defender.distance) };
                }
              }
            }
          }
        }

        simulated = recalcPositions(simulated);

        const processedId = simulated[currentIdx]?.driver.id;
        const processedNewIndex = processedId ? simulated.findIndex(x => x.driver.id === processedId) : currentIdx;
        const nextIdx = findNextPlayableIndex(simulated, processedNewIndex + 1);

        if (nextIdx == null) {
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
  }, [drivers, handlePitStop, isRolling, nextFinishOrder, raceComplete, recalcPositions, turnCursor]);

  const completeRace = useCallback(() => {
    const classified = drivers.filter(d => !d.retired);

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

  if (raceComplete) {
    const winner = drivers.find(d => !d.retired);

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

        <div className="grid gap-2 max-h-[350px] overflow-y-auto">
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
                    ${index === 0 ? "bg-gradient-to-br from-yellow-400 to-yellow-600 text-background" : ""}
                    ${index === 1 ? "bg-gradient-to-br from-gray-300 to-gray-500 text-background" : ""}
                    ${index === 2 ? "bg-gradient-to-br from-amber-600 to-amber-800 text-foreground" : ""}
                    ${index > 2 ? "bg-muted text-muted-foreground" : ""}
                  `}
                >
                  {index + 1}
                </div>
              ) : (
                <XCircle className="w-7 h-7 text-destructive" />
              )}

              <div className={`w-1 h-6 rounded-full ${d.driver.teamColor}`} />
              <span className="text-lg">{d.driver.nationality}</span>
              <span className="font-racing text-sm flex-1">{d.driver.shortName}</span>
              <span className="font-racing text-primary">{d.retired ? "DNF" : `+${pointsSystem[index + 1] || 0} pts`}</span>
            </motion.div>
          ))}
        </div>

        <Button onClick={completeRace} className="w-full font-racing" size="lg">
          <Flag className="w-4 h-4 mr-2" />
          Finalizar Gran Premio
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-racing text-xl text-gradient-primary">Carrera</h2>
          <p className="text-sm text-muted-foreground">
            {race.flag} {race.name}
          </p>
        </div>
        <div className="text-right">
          <p className="font-racing text-lg text-primary">Vuelta {lap}</p>
          <p className="text-xs text-muted-foreground">{finishedCount} finalizados</p>
        </div>
      </div>

      {currentAction && <div className="text-center py-2 text-muted-foreground animate-pulse">{currentAction}</div>}

      <div className="grid gap-2">
        <div className="flex gap-2">
          <Button onClick={stepTurn} disabled={isRolling || raceComplete || !nextDriver} className="flex-1 font-racing">
            <Play className="w-4 h-4 mr-2" />
            {nextDriver ? `Turno: ${nextDriver.driver.shortName}` : "Sin turnos"}
          </Button>
          <Button onClick={autoCompleteRace} disabled={isRolling || raceComplete} variant="outline" className="font-racing">
            <Zap className="w-4 h-4 mr-2" />
            Auto
          </Button>
        </div>

        {battleInfo && (
          <div className="rounded-lg border border-border bg-card/40 p-3 text-sm">
            <div className="flex items-center gap-2 font-racing">
              <Swords className="w-4 h-4 text-primary" />
              Batalla: {battleInfo.attacker} vs {battleInfo.defender}
            </div>
            <div className="mt-2 text-muted-foreground space-y-1">
              <p>
                Ventaja: {battleInfo.advantage === "none" ? "Ninguna" : battleInfo.advantage === "attacker" ? battleInfo.attacker : battleInfo.defender}
              </p>
              <p>
                Tirada 1: {battleInfo.attacker} {battleInfo.attackerRoll1} - {battleInfo.defender} {battleInfo.defenderRoll1}
              </p>
              {battleInfo.attackerRoll2 != null && battleInfo.defenderRoll2 != null && (
                <p>
                  Tirada 2: {battleInfo.attacker} {battleInfo.attackerRoll2} - {battleInfo.defender} {battleInfo.defenderRoll2}
                </p>
              )}
              <p className="font-racing text-primary">Resultado: {battleInfo.result === "overtake" ? "Adelantamiento" : "Defensa"}</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-1 max-h-[350px] overflow-y-auto">
        {drivers.map((d, index) => {
          const isActive = nextPlayableIndex === index && !raceComplete;

          return (
            <motion.div
              key={d.driver.id}
              className={`flex items-center gap-2 p-2 rounded text-sm border border-transparent ${
                d.retired ? "bg-destructive/10 opacity-50" : ""
              } ${d.finished ? "bg-green-500/10" : ""} ${d.inPits ? "bg-yellow-500/10" : ""} ${
                isActive ? "border-primary/40 bg-primary/5" : ""
              }`}
              layout
            >
              <span className="w-5 font-racing text-muted-foreground">{d.retired ? "-" : index + 1}</span>
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
                {d.pitStops > 0 && !d.inPits && <span className="text-xs text-muted-foreground">P×{d.pitStops}</span>}
                {d.retired && <XCircle className="w-4 h-4 text-destructive" />}
                {d.finished && <Flag className="w-4 h-4 text-green-400" />}
              </div>

              <div className="w-24 bg-muted rounded-full h-2 overflow-hidden">
                <motion.div
                  className={`h-full ${d.retired ? "bg-destructive" : "bg-primary"}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${(Math.min(d.distance, RACE_DISTANCE) / RACE_DISTANCE) * 100}%` }}
                />
              </div>
              <span className="w-10 text-right text-xs text-muted-foreground">
                {Math.min(d.distance, RACE_DISTANCE)}/{RACE_DISTANCE}
              </span>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
