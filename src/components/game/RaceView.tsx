import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Pause, Play, StepForward, FastForward, Flag, Wrench, ChevronUp, ChevronDown, Minus, Siren, Star, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Race } from "@/data/f1Data";
import {
  COMPOUNDS, MODES, editNextStop, formatLap, gapToLeader, requestPit, setMode, setStartTyre, simulateLap, simulateToEnd, tyreLife,
  type CarState, type Compound, type DriverMode, type RaceEvent, type RaceState,
} from "@/engine";
import { TeamStripe, TyreBadge, mineStyle } from "./common";
import { RaceResults } from "./RaceResults";
import { cn } from "@/lib/utils";

interface Props {
  race: Race;
  state: RaceState;
  playerTeamId: string | null;
  onUpdate: (s: RaceState) => void;
  onFinish: () => void;
}

const SPEEDS = [
  { label: "1x", ms: 1400 },
  { label: "4x", ms: 380 },
  { label: "16x", ms: 90 },
];

export function RaceView({ race, state, playerTeamId, onUpdate, onFinish }: Props) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [showInterval, setShowInterval] = useState(false);
  const [feedFilter, setFeedFilter] = useState<"all" | "mine">("all");

  const isMine = (id: string) => state.cars.find((c) => c.id === id)?.entry.team.id === playerTeamId;

  // Playback loop
  useEffect(() => {
    if (!playing || state.finished) return;
    const id = window.setTimeout(() => {
      const next = simulateLap(state);
      onUpdate(next);
      const fresh = next.events.slice(state.events.length);
      const pause = fresh.some(
        (e) => e.type === "sc" || (e.type === "dnf" && e.drivers.some((d) => next.cars.find((c) => c.id === d)?.entry.team.id === playerTeamId)),
      );
      if (pause || next.finished) setPlaying(false);
    }, SPEEDS[speed].ms);
    return () => window.clearTimeout(id);
  }, [playing, speed, state, onUpdate, playerTeamId]);

  const leader = state.cars[0];
  const myCars = state.cars.filter((c) => c.entry.team.id === playerTeamId);

  const feed = useMemo(() => {
    const list = state.events.filter((e) => e.type !== "fastest" || e.lap > 5);
    const filtered = feedFilter === "mine" ? list.filter((e) => e.drivers.some(isMine) || e.type === "sc" || e.type === "sc_end") : list;
    return filtered.slice(-80).reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.events, feedFilter, playerTeamId]);

  if (state.finished) {
    return <RaceResults race={race} state={state} playerTeamId={playerTeamId} onConfirm={onFinish} />;
  }

  const sc = state.safetyCar.active;
  const progress = (state.lap / state.totalLaps) * 100;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-racing text-lg md:text-xl">
              {race.flag} {race.name}
            </h2>
            <p className="text-xs text-muted-foreground">{race.circuit}</p>
          </div>
          <div className="text-right">
            <div className="font-racing text-2xl tabular-nums">
              {state.lap}
              <span className="text-muted-foreground text-base">/{state.totalLaps}</span>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Vuelta</div>
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={cn("h-full transition-all", sc ? "bg-yellow-400" : "bg-primary")} style={{ width: `${progress}%` }} />
        </div>
        <AnimatePresence>
          {sc && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 rounded-md bg-yellow-400 text-black px-3 py-1.5 text-sm font-racing"
            >
              <Siren className="w-4 h-4" /> SAFETY CAR · parar en pits cuesta ~45% menos
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setPlaying((p) => !p)} className="font-racing min-w-28">
            {playing ? <Pause className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
            {playing ? "Pausa" : state.lap === 0 ? "Largada" : "Seguir"}
          </Button>
          <div className="flex rounded-md border border-border overflow-hidden">
            {SPEEDS.map((s, i) => (
              <button
                key={s.label}
                onClick={() => setSpeed(i)}
                className={cn("px-3 py-2 text-xs font-racing", i === speed ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                {s.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" onClick={() => onUpdate(simulateLap(state))} disabled={playing} title="Una vuelta">
            <StepForward className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setPlaying(false);
              onUpdate(simulateToEnd(state));
            }}
            className="ml-auto text-xs"
            title="Simular hasta la bandera a cuadros"
          >
            <FastForward className="w-4 h-4 mr-1" /> Al final
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] lg:grid-rows-[auto_1fr] gap-4 items-start">
        {myCars.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-3 space-y-3 lg:col-start-2">
            <div className="font-racing text-xs text-muted-foreground uppercase tracking-wider">Muro de boxes</div>
            {myCars.map((car) => (
              <PitWallCard
                key={car.id}
                car={car}
                pos={state.cars.indexOf(car) + 1}
                state={state}
                onUpdate={onUpdate}
              />
            ))}
          </div>
        )}

        {/* Timing tower */}
        <div className="rounded-xl border border-border bg-card overflow-hidden lg:col-start-1 lg:row-start-1 lg:row-span-2">
          <div className="flex items-center gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
            <span className="w-6">Pos</span>
            <span className="w-4" />
            <span className="flex-1">Piloto</span>
            <button onClick={() => setShowInterval((v) => !v)} className="w-20 text-right underline decoration-dotted">
              {showInterval ? "Intervalo" : "Gap"}
            </button>
            <span className="w-20 text-right hidden sm:block">Última</span>
            <span className="w-14 text-center">Neum.</span>
            <span className="w-6 text-center">P</span>
          </div>
          <div>
            {state.cars.map((car, i) => (
              <TowerRow
                key={car.id}
                car={car}
                pos={i + 1}
                gap={
                  car.status === "dnf"
                    ? "DNF"
                    : showInterval && i > 0
                      ? `+${(car.total - state.cars[i - 1].total).toFixed(3)}`
                      : gapToLeader(state, car, leader)
                }
                mine={car.entry.team.id === playerTeamId}
                fastest={state.fastest?.driverId === car.id}
                lap={state.lap}
              />
            ))}
          </div>
        </div>

          <div className="rounded-xl border border-border bg-card lg:col-start-2">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="font-racing text-xs uppercase tracking-wider text-muted-foreground">Dirección de carrera</span>
              {playerTeamId && (
                <div className="flex text-[10px] rounded border border-border overflow-hidden">
                  {(["all", "mine"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFeedFilter(f)}
                      className={cn("px-2 py-1", feedFilter === f ? "bg-muted text-foreground" : "text-muted-foreground")}
                    >
                      {f === "all" ? "Todo" : "Mi equipo"}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="max-h-[420px] overflow-y-auto p-2 space-y-1">
              {feed.map((e, i) => (
                <EventRow key={`${e.lap}-${i}-${e.text}`} e={e} mine={e.drivers.some(isMine)} />
              ))}
            </div>
          </div>
      </div>
    </div>
  );
}

function TowerRow({ car, pos, gap, mine, fastest, lap }: { car: CarState; pos: number; gap: string; mine: boolean; fastest: boolean; lap: number }) {
  const dnf = car.status === "dnf";
  const change = car.grid - pos;
  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-sm border-b border-border/30 last:border-0",
        dnf && "opacity-40",
      )}
      style={mine ? mineStyle(car.entry.team.hex) : undefined}
    >
      <span className="w-6 font-racing text-xs tabular-nums">{dnf ? "—" : pos}</span>
      <span className="w-4 flex justify-center">
        {dnf ? null : change > 0 ? (
          <ChevronUp className="w-3.5 h-3.5 text-green-400" />
        ) : change < 0 ? (
          <ChevronDown className="w-3.5 h-3.5 text-red-400" />
        ) : (
          <Minus className="w-3 h-3 text-muted-foreground/50" />
        )}
      </span>
      <TeamStripe color={car.entry.team.hex} />
      <span className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className="font-racing text-xs">{car.entry.driver.shortName}</span>
        {mine && <Star className="w-3 h-3 text-primary fill-primary" />}
        {fastest && lap > 1 && <span className="text-[9px] px-1 rounded bg-purple-600 text-white">VR</span>}
        {car.pittedThisLap && <span className="text-[9px] px-1 rounded bg-orange-500 text-black font-bold">PIT</span>}
        {dnf && <span className="text-[10px] text-destructive truncate">{car.dnfReason}</span>}
      </span>
      <span className="w-20 text-right font-mono text-xs tabular-nums">{gap}</span>
      <span className="w-20 text-right font-mono text-[11px] text-muted-foreground hidden sm:block tabular-nums">
        {car.lastLap && !dnf ? formatLap(car.lastLap) : ""}
      </span>
      <span className="w-14 flex justify-center">{!dnf && <TyreBadge compound={car.compound} age={car.tyreAge} />}</span>
      <span className="w-6 text-center text-xs text-muted-foreground">{car.stops}</span>
    </motion.div>
  );
}

function PitWallCard({
  car, pos, state, onUpdate,
}: {
  car: CarState;
  pos: number;
  state: RaceState;
  onUpdate: (s: RaceState) => void;
}) {
  const dnf = car.status === "dnf";
  const preRace = state.lap === 0;
  const life = tyreLife(car.compound, state.track, car.entry.driver.tyreMgmt);
  const wear = Math.min(1.3, car.tyreAge / life);
  const wearColor = wear < 0.6 ? "bg-green-500" : wear < 0.9 ? "bg-yellow-400" : "bg-red-500";
  const next = car.plan.length > 1 ? { lap: car.plan[0].untilLap, compound: car.plan[1].compound } : null;
  const compounds = Object.keys(COMPOUNDS) as Compound[];
  const sc = state.safetyCar.active;
  const plannedCompounds = new Set([...car.usedCompounds, ...car.plan.map((s) => s.compound)]);
  const ruleRisk = plannedCompounds.size < 2;

  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <TeamStripe color={car.entry.team.hex} className="h-8 w-1.5" />
        <div className="flex-1">
          <div className="font-racing text-sm">
            {dnf ? "—" : `P${pos}`} · {car.entry.driver.name}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {dnf ? `Abandono: ${car.dnfReason}` : preRace ? `Sale desde P${car.grid}` : `${car.stops} parada${car.stops === 1 ? "" : "s"}`}
          </div>
        </div>
        {!dnf && <TyreBadge compound={car.compound} />}
      </div>

      {!dnf && preRace && (
        <div className="space-y-1">
          <div className="text-[11px] text-muted-foreground">Neumático de salida</div>
          <div className="grid grid-cols-3 gap-1">
            {compounds.map((c) => (
              <button
                key={c}
                onClick={() => onUpdate(setStartTyre(state, car.id, c))}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md border py-1.5 text-[11px]",
                  car.compound === c ? "border-primary bg-primary/15" : "border-border hover:bg-muted",
                )}
              >
                <TyreBadge compound={c} /> {COMPOUNDS[c].name}
              </button>
            ))}
          </div>
        </div>
      )}

      {!dnf && !preRace && (
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Desgaste neumático</span>
            <span>{car.tyreAge} v · {Math.round(wear * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={cn("h-full", wearColor)} style={{ width: `${Math.min(100, wear * 100)}%` }} />
          </div>
        </div>
      )}

      {!dnf && (
        <div className="rounded-md border border-border/60 p-2 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Próxima parada planificada</span>
            {next ? (
              <button className="text-muted-foreground hover:text-destructive" onClick={() => onUpdate(editNextStop(state, car.id, { remove: true }))}>
                quitar
              </button>
            ) : (
              <button className="text-primary hover:underline" onClick={() => onUpdate(editNextStop(state, car.id, { add: true }))}>
                + agregar parada
              </button>
            )}
          </div>
          {next ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-md border border-border">
                <button className="px-2 py-1 hover:bg-muted" onClick={() => onUpdate(editNextStop(state, car.id, { lap: next.lap - 1 }))}>
                  −
                </button>
                <span className="px-1 text-xs font-mono tabular-nums w-14 text-center">V{next.lap}</span>
                <button className="px-2 py-1 hover:bg-muted" onClick={() => onUpdate(editNextStop(state, car.id, { lap: next.lap + 1 }))}>
                  +
                </button>
              </div>
              <span className="text-[11px] text-muted-foreground">→</span>
              {compounds.map((c) => (
                <button
                  key={c}
                  onClick={() => onUpdate(editNextStop(state, car.id, { compound: c }))}
                  className={cn("rounded-full p-0.5", next.compound === c ? "ring-2 ring-primary" : "opacity-50 hover:opacity-100")}
                  title={COMPOUNDS[c].name}
                >
                  <TyreBadge compound={c} />
                </button>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground">Sin más paradas: sigue con este neumático hasta el final.</div>
          )}
          {ruleRisk && <div className="text-[10px] text-orange-400">Ojo: debe usar al menos 2 compuestos o recibe 30s de penalización.</div>}
        </div>
      )}

      {!dnf && !preRace && (
        <>
          <div className="grid grid-cols-3 gap-1">
            {(Object.keys(MODES) as DriverMode[]).map((m) => (
              <button
                key={m}
                onClick={() => onUpdate(setMode(state, car.id, m))}
                className={cn(
                  "rounded-md border py-1.5 text-[11px] font-racing",
                  car.mode === m ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
                )}
              >
                {MODES[m].label}
              </button>
            ))}
          </div>

          {car.pitRequest ? (
            <div className="flex items-center gap-2 rounded-md bg-orange-500/15 border border-orange-500/40 px-2 py-1.5 text-xs">
              <Wrench className="w-3.5 h-3.5 text-orange-400" />
              <span className="flex-1">Box al final de esta vuelta → {COMPOUNDS[car.pitRequest].name}</span>
              <button onClick={() => onUpdate(requestPit(state, car.id, null))} title="Cancelar">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className={cn("flex items-center gap-1 rounded-md px-1", sc && "bg-yellow-400/10 py-1")}>
              <span className="text-[11px] text-muted-foreground mr-1">{sc ? "Box ahora (barato con SC):" : "Box ahora:"}</span>
              {compounds.map((c) => (
                <button key={c} onClick={() => onUpdate(requestPit(state, car.id, c))} className="hover:scale-110 transition-transform" title={`Parar y poner ${COMPOUNDS[c].name}`}>
                  <TyreBadge compound={c} />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const EVENT_STYLE: Record<RaceEvent["type"], string> = {
  start: "text-foreground",
  overtake: "text-green-400",
  pit: "text-orange-300",
  dnf: "text-red-400",
  sc: "text-yellow-300 font-semibold",
  sc_end: "text-yellow-300",
  fastest: "text-purple-400",
  mistake: "text-amber-400",
  finish: "text-primary font-semibold",
};

function EventRow({ e, mine }: { e: RaceEvent; mine: boolean }) {
  return (
    <div className={cn("flex gap-2 text-xs rounded px-1.5 py-1", mine && "bg-white/[0.06]")}>
      <span className="w-8 shrink-0 font-mono text-muted-foreground">V{e.lap}</span>
      <span className={EVENT_STYLE[e.type]}>{e.text}</span>
    </div>
  );
}
