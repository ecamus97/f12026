import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Pause, Play, FastForward, Flag, Wrench, ChevronUp, ChevronDown, Minus, Siren, Star, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Race } from "@/data/f1Data";
import {
  COMPOUNDS, MODES, setRedFlagTyre, FUEL_MODES, ERS_MODES, setFuelMode, setErsMode, confirmStrategy, editNextStop, formatLap, gapToLeader, requestPit, setMode, simulateLap, simulateToEnd, tyreLife,
  type CarState, type Compound, type DriverMode, type FuelMode, type ErsMode, type RaceEvent, type RaceState,
} from "@/engine";
import { TeamStripe, TyreBadge, mineStyle } from "./common";
import { RaceResults } from "./RaceResults";
import { TrackMap, lapProgressDetailed, PIT_ENTRY, type LapAnimation } from "./TrackMap";
import { StrategyPlanner } from "./StrategyPlanner";
import { DuelPanel, TeamOrdersPanel } from "./RaceInstructions";
import { moraleLabel } from "@/engine";
import { WeatherWidget } from "./WeatherWidget";
import { cn } from "@/lib/utils";

interface Props {
  race: Race;
  state: RaceState;
  playerTeamId: string | null;
  onUpdate: (s: RaceState) => void;
  onFinish: () => void;
  round?: number;
}

// Time on screen per lap
const SPEEDS = [
  { label: "1x", ms: 12000 },
  { label: "2x", ms: 6000 },
  { label: "4x", ms: 3000 },
  { label: "16x", ms: 750 },
  { label: "64x", ms: 190 },
];

export function RaceView({ race, state, playerTeamId, onUpdate, onFinish, round }: Props) {
  const [playing, setPlaying] = useState(false);
  const handledStops = useRef(new Set<string>());
  const eventKey = (e: RaceEvent) => `${e.lap}-${e.type}-${e.text}`;
  const stopsRace = (e: RaceEvent, st: RaceState) =>
    e.type === "red" || // a red flag always stops everything
    (st.config.pauseOnIncidents !== false &&
    (e.type === "sc" ||
      ((e.type === "dnf" || e.type === "puncture" || e.type === "damage") && e.drivers.some((d) => st.cars.find((c) => c.id === d)?.entry.team.id === playerTeamId))));
  // after the last lap the cars cross the line and the chequered flag shows before the results
  const [resultsReady, setResultsReady] = useState(state.finished);
  useEffect(() => {
    if (!state.finished || resultsReady) return;
    const t = window.setTimeout(() => setResultsReady(true), 3500);
    return () => window.clearTimeout(t);
  }, [state.finished, resultsReady]);
  const [speed, setSpeed] = useState(0);
  const [showInterval, setShowInterval] = useState(false);
  const [feedFilter, setFeedFilter] = useState<"all" | "mine">("all");

  const isMine = (id: string) => state.cars.find((c) => c.id === id)?.entry.team.id === playerTeamId;

  // Playback: each lap is simulated up-front and then animated on the track map;
  // the timing tower and race control update when the lap is completed.
  const [anim, setAnim] = useState<LapAnimation | null>(null);

  const startLap = useCallback(() => {
    if (state.finished) return;
    const next = simulateLap(state);
    const from = Object.fromEntries(state.cars.filter((c) => c.status === "running").map((c) => [c.id, c.total]));
    setAnim({ from, to: next, start: performance.now(), duration: SPEEDS[speed].ms });
  }, [state, speed]);

  const pauseAnim = () =>
    setAnim((a) => (a && a.pausedElapsed == null ? { ...a, pausedElapsed: performance.now() - a.start } : a));
  const resumeAnim = () =>
    setAnim((a) => (a && a.pausedElapsed != null ? { ...a, start: performance.now() - a.pausedElapsed, pausedElapsed: null } : a));
  const pausedMidLap = !!anim && anim.pausedElapsed != null;

  // clock for live sector times while a lap is animating
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!anim || anim.pausedElapsed != null) return;
    const id = window.setInterval(() => setNow(performance.now()), 120);
    return () => window.clearInterval(id);
  }, [anim]);
  const detailed = anim
    ? lapProgressDetailed(anim.to, anim, anim.pausedElapsed != null ? anim.start + anim.pausedElapsed : now, state)
    : null;
  const progress = detailed ? Object.fromEntries(Object.entries(detailed).map(([id, v]) => [id, v.frac])) : null;
  const liveCars = anim ? new Map(anim.to.cars.map((c) => [c.id, c])) : null;
  const bestSectors = (anim?.to ?? state).bestSectors ?? [];

  // Timing tower order: live during an animated lap (positions change the moment a car passes)
  const towerRows: { car: CarState; pos: number; gap: string }[] = (() => {
    if (!anim || !progress || !liveCars) {
      const leader = state.cars[0];
      return state.cars.map((car, i) => ({
        car,
        pos: i + 1,
        gap:
          car.status === "dnf"
            ? "DNF"
            : showInterval && i > 0
              ? `+${(car.total - state.cars[i - 1].total).toFixed(3)}`
              : gapToLeader(state, car, leader),
      }));
    }
    // one reference lap for everyone (the leader's lap without pit stops), so gaps follow the order on track
    const refLap = (() => {
      const lead = anim.to.cars.find((c) => c.status === "running");
      return Math.max(1, lead?.lastLap ?? 90); // lastLap never includes the pit stop
    })();
    const lapTime = (_id: string) => refLap;
    // a car retiring on this lap stays in the classification until it actually stops on track
    const isRunning = (c: CarState) => liveCars.get(c.id)?.status === "running" || (!!detailed?.[c.id] && !detailed[c.id].stopped);
    const running = state.cars.filter(isRunning).sort((a, b) => progress[b.id] - progress[a.id]);
    const out = state.cars.filter((c) => !isRunning(c)).map((c) => liveCars.get(c.id) ?? c);
    const leaderId = running[0]?.id;
    const fmtGap = (behind: number, id: string) => {
      const t = Math.max(0, behind * lapTime(id));
      const laps = Math.floor(behind);
      return laps >= 1 ? `+${laps} ${laps === 1 ? "vuelta" : "vueltas"}` : `+${t.toFixed(3)}`;
    };
    return [
      ...running.map((car, i) => ({
        car,
        pos: i + 1,
        gap:
          i === 0
            ? showInterval
              ? ""
              : "Líder"
            : showInterval
              ? fmtGap(progress[running[i - 1].id] - progress[car.id], car.id)
              : fmtGap(progress[leaderId] - progress[car.id], car.id),
      })),
      ...out.map((car, i) => ({ car, pos: running.length + i + 1, gap: "DNF" })),
    ];
  })();

  // finish the animated lap
  useEffect(() => {
    if (!anim || anim.pausedElapsed != null) return;
    const remaining = Math.max(0, anim.duration - (performance.now() - anim.start));
    const id = window.setTimeout(() => {
      const next = anim.to;
      const fresh = next.events.slice(state.events.length);
      // incidents pause the race the moment they happen (see below); the weather only at the end of the lap
      const pause = fresh.some(
        (e) => (e.type === "weather" && next.config.pauseOnIncidents !== false) || (stopsRace(e, next) && !handledStops.current.has(eventKey(e))),
      );
      if (pause || next.finished || next.redFlag) setPlaying(false); // red flag: wait for the tyre choice and the restart
      setAnim(null);
      onUpdate(next);
    }, remaining);
    return () => window.clearTimeout(id);
  }, [anim, state.events.length, onUpdate, playerTeamId]);

  // pause right when something happens that matters to the team: safety car, red flag,
  // or one of your cars retiring / puncturing. Other drivers' retirements don't stop the race.
  useEffect(() => {
    if (!anim || anim.pausedElapsed != null || !playing) return;
    const fresh = anim.to.events.slice(state.events.length);
    const pending = fresh
      .filter((e) => e.at != null && stopsRace(e, anim.to) && !handledStops.current.has(eventKey(e)))
      .sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
    const first = pending[0];
    if (!first) return;
    const delay = Math.max(0, (first.at ?? 0) * anim.duration - (performance.now() - anim.start)) + 80;
    const id = window.setTimeout(() => {
      handledStops.current.add(eventKey(first));
      setPlaying(false);
      if (first.type === "red") {
        // the race stops right there: everyone back to the pit lane, then the grid for a standing start
        setAnim(null);
        onUpdate(anim.to);
        return;
      }
      pauseAnim();
    }, delay);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim, playing, state.events.length]);

  // keep going while playing
  useEffect(() => {
    if (playing && !anim && !state.finished) startLap();
  }, [playing, anim, state.finished, startLap]);

  /** Manager changes apply to the committed state and to the lap being animated. */
  const apply = useCallback(
    (fn: (s: RaceState) => RaceState) => {
      onUpdate(fn(state));
      setAnim((a) => (a ? { ...a, to: fn(a.to) } : a));
    },
    [onUpdate, state],
  );

  /** Speed changes apply right away, keeping the cars where they are. */
  const changeSpeed = (i: number) => {
    setSpeed(i);
    const ms = SPEEDS[i].ms;
    setAnim((a) => {
      if (!a) return a;
      if (a.pausedElapsed != null) return { ...a, pausedElapsed: (a.pausedElapsed / a.duration) * ms, duration: ms };
      const t = performance.now();
      const p = Math.min(1, (t - a.start) / a.duration);
      return { ...a, start: t - p * ms, duration: ms };
    });
  };

  /**
   * Mode changes apply from the point of the lap where the car is: the lap being animated
   * is re-simulated with the old modes for the part already driven and the new ones for the rest.
   */
  const applyMode = useCallback(
    (carId: string, fn: (s: RaceState) => RaceState) => {
      if (!anim) return apply(fn);
      const car = state.cars.find((c) => c.id === carId);
      if (!car) return;
      const frac = Math.max(0, Math.min(1, detailed?.[carId]?.frac ?? 0));
      const changed = fn(state);
      const withBlend: RaceState = {
        ...changed,
        cars: changed.cars.map((c) =>
          c.id === carId
            ? { ...c, modeBlend: { frac, mode: car.mode, fuelMode: car.fuelMode ?? "normal", ersMode: car.ersMode ?? "balanced" } }
            : c,
        ),
      };
      onUpdate(withBlend);
      setAnim((a) => (a ? { ...a, to: simulateLap(withBlend) } : a));
    },
    [anim, apply, detailed, onUpdate, state],
  );

  /**
   * Pit calls: if the car hasn't reached the pit entry yet, it stops at the end of this very lap
   * (the lap is simulated again with the call); past the entry it has to wait for the next pass.
   */
  const applyPit = useCallback(
    (carId: string, fn: (s: RaceState) => RaceState) => {
      const f = detailed?.[carId]?.frac;
      if (!anim || f == null || f >= PIT_ENTRY - 0.015 || anim.to.redFlag) return apply(fn);
      const changed = fn(state);
      onUpdate(changed);
      setAnim((a) => (a ? { ...a, to: simulateLap(changed) } : a));
    },
    [anim, apply, detailed, onUpdate, state],
  );

  const [openCards, setOpenCards] = useState<string[]>([]); // pit wall cards start closed
  const leader = state.cars[0];
  const myCars = state.cars.filter((c) => c.entry.team.id === playerTeamId);

  // events of the lap being animated appear when they happen on track
  const liveEvents = (() => {
    if (!anim || !progress) return [];
    const fresh = anim.to.events.slice(state.events.length);
    const lapP = Math.min(1, (anim.pausedElapsed ?? now - anim.start) / anim.duration);
    return fresh.filter((e) => {
      const [a, b] = e.drivers;
      // incidents appear at the moment of the lap they happen
      if (e.at != null) return lapP >= e.at;
      switch (e.type) {
        case "overtake":
          return a in progress && b in progress ? progress[a] > progress[b] : lapP > 0.5;
        case "pit":
          return !!detailed?.[a]?.inPit || (progress[a] ?? 0) >= 1;
        case "fastest":
          return (progress[a] ?? 0) >= 1;
        case "finish":
          return lapP >= 1;
        default:
          return lapP >= 0.5;
      }
    });
  })();

  const feed = useMemo(() => {
    const list = [...state.events, ...liveEvents]
      .filter((e) => e.type !== "fastest" || e.lap > 5)
      .map((e, i) => ({ e, i }))
      .sort((x, y) => x.e.lap - y.e.lap || (x.e.at ?? 0.5) - (y.e.at ?? 0.5) || x.i - y.i)
      .map((x) => x.e);
    const filtered = feedFilter === "mine" ? list.filter((e) => e.drivers.some(isMine) || ["sc", "sc_end", "red", "green", "finish"].includes(e.type)) : list;
    return filtered.slice(-80).reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.events, liveEvents.length, feedFilter, playerTeamId]);

  if (state.finished && resultsReady) {
    return <RaceResults race={race} state={state} playerTeamId={playerTeamId} onConfirm={onFinish} />;
  }

  const sc = state.safetyCar.active;
  const raceProgress = (state.lap / state.totalLaps) * 100;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="panel overflow-hidden">
        <div className="flex items-stretch">
          <div className="bg-primary text-primary-foreground px-4 md:px-6 py-3 clip-slant pr-8 md:pr-12 flex items-center gap-3">
            <span className="text-3xl">{race.flag}</span>
            <div>
              <div className="tv-label opacity-80">Ronda {round ?? race.id} · {race.circuit}</div>
              <h2 className="font-display text-xl md:text-3xl">{race.name}</h2>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-4 px-4 md:px-6">
            <div className="text-right">
              <div className="tv-label text-muted-foreground">Vuelta</div>
              <div className="font-display text-3xl md:text-4xl tabular-nums leading-none">
                {anim ? anim.to.lap : state.lap}
                <span className="text-muted-foreground text-lg md:text-xl">/{state.totalLaps}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="p-4 pt-3 space-y-3">
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={cn("h-full transition-all", sc ? "bg-yellow-400" : "bg-primary")} style={{ width: `${raceProgress}%` }} />
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
          {state.finished && (
            <Button onClick={() => setResultsReady(true)} className="font-racing">
              🏁 Ver resultados
            </Button>
          )}
          <Button
            disabled={state.finished}
            onClick={() => {
              if (state.lap === 0 && !state.strategyConfirmed) apply(confirmStrategy);
              if (playing) {
                setPlaying(false);
                pauseAnim(); // freeze right where the cars are
              } else {
                setPlaying(true);
                resumeAnim();
              }
            }}
            className="font-racing min-w-28"
          >
            {playing ? <Pause className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
            {playing ? "Pausa" : state.lap === 0 ? (myCars.length && !state.strategyConfirmed ? "Confirmar y largar" : "Largada") : "Seguir"}
          </Button>
          <div className="flex rounded-md border border-border overflow-hidden">
            {SPEEDS.map((s, i) => (
              <button
                key={s.label}
                onClick={() => changeSpeed(i)}
                className={cn("px-3 py-2 text-xs font-racing", i === speed ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                {s.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setPlaying(false);
              const base = anim ? anim.to : state;
              setAnim(null);
              setResultsReady(true);
              onUpdate(simulateToEnd(base));
            }}
            className="ml-auto text-xs font-racing"
            title="Simula en un instante el resto de la carrera con la estrategia actual"
          >
            <FastForward className="w-4 h-4 mr-1" /> Simular hasta el final
          </Button>
        </div>
        </div>
      </div>

      {state.redFlag && !anim && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="panel overflow-hidden border-red-500/60">
          <div className="bg-red-600 text-white px-5 py-3 flex flex-wrap items-center gap-3">
            <span className="font-display text-2xl">🟥 Bandera roja</span>
            <span className="text-sm opacity-90">
              Carrera detenida en la vuelta {state.redFlag.lap}. Todos a pits: se reanuda con largada detenida en el orden actual.
            </span>
          </div>
          <div className="p-4 space-y-3">
            <div className="text-sm text-muted-foreground">Elige los neumáticos para el relanzamiento (cambio gratis, no cuenta como parada):</div>
            <div className="grid md:grid-cols-2 gap-3">
              {myCars
                .filter((c) => c.status === "running")
                .map((car) => (
                  <div key={car.id} className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-2">
                    <div className="font-display text-lg">
                      P{state.cars.indexOf(car) + 1} · {car.entry.driver.name}
                    </div>
                    <div className="flex gap-2">
                      {(Object.keys(COMPOUNDS) as Compound[]).map((c) => (
                        <button
                          key={c}
                          onClick={() => apply((s) => setRedFlagTyre(s, car.id, c))}
                          className={cn("rounded-full p-1", state.redFlag!.choices[car.id] === c ? "ring-2 ring-primary" : "opacity-60 hover:opacity-100")}
                          title={COMPOUNDS[c].name}
                        >
                          <TyreBadge compound={c} />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
            <Button onClick={() => setPlaying(true)} className="font-display">
              <Play className="w-4 h-4 mr-1 fill-current" /> Reanudar carrera
            </Button>
          </div>
        </motion.div>
      )}

      {state.weather && <WeatherWidget weather={state.weather} lap={state.lap} title="Clima en pista" />}

      {state.lap === 0 && !anim && myCars.length > 0 && <StrategyPlanner state={state} cars={myCars} onApply={apply} />}

      <div className="relative">
        <TrackMap raceId={race.id} state={state} anim={anim} playerTeamId={playerTeamId} />
        <RaceFlash events={[...state.events, ...liveEvents]} />
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] lg:grid-rows-[auto_1fr] gap-4 items-start">
        {myCars.length > 0 && (state.lap > 0 || anim) && (
          <div className="panel p-3 space-y-3 lg:col-start-2">
            <div className="tv-label bg-primary text-primary-foreground w-fit px-3 py-1 clip-slant pr-6">Muro de boxes</div>
            {playerTeamId && <TeamOrdersPanel state={state} teamId={playerTeamId} onApply={apply} />}
            {myCars.map((car) => (
              <PitWallCard
                key={car.id}
                open={openCards.includes(car.id)}
                onToggle={() => setOpenCards((o) => (o.includes(car.id) ? o.filter((x) => x !== car.id) : [...o, car.id]))}
                car={car}
                pos={towerRows.find((r) => r.car.id === car.id)?.pos ?? state.cars.indexOf(car) + 1}
                state={state}
                onApply={apply}
                onMode={(fn) => applyMode(car.id, fn)}
                onPit={(fn) => applyPit(car.id, fn)}
                live={anim ? { frac: Math.max(0, Math.min(1, detailed?.[car.id]?.frac ?? 0)), to: anim.to.cars.find((c) => c.id === car.id) } : null}
                finishing={!!anim && (detailed?.[car.id]?.frac ?? 0) < 0}
              />
            ))}
          </div>
        )}

        {/* Timing tower */}
        <div className="panel overflow-hidden lg:col-start-1 lg:row-start-1 lg:row-span-2">
          <div className="flex items-center gap-2 px-3 py-2 tv-label text-muted-foreground border-b border-white/10 bg-black/40">
            <span className="w-6">Pos</span>
            <span className="w-4" />
            <span className="flex-1">Piloto</span>
            <button onClick={() => setShowInterval((v) => !v)} className="w-20 text-right underline decoration-dotted">
              {showInterval ? "Intervalo" : "Gap"}
            </button>
            <span className="w-[54px] text-right hidden md:block">S1</span>
            <span className="w-[54px] text-right hidden md:block">S2</span>
            <span className="w-[54px] text-right hidden md:block">S3</span>
            <span className="w-20 text-right hidden sm:block">Última</span>
            <span className="w-14 text-center">Neum.</span>
            <span className="w-6 text-center">P</span>
          </div>
          <div>
            {towerRows.map(({ car, pos, gap }) => (
              <TowerRow
                key={car.id}
                car={car}
                pos={pos}
                gap={gap}
                mine={car.entry.team.id === playerTeamId}
                fastest={state.fastest?.driverId === car.id}
                lap={state.lap}
                sectors={sectorCells(car, liveCars?.get(car.id), progress?.[car.id], bestSectors)}
                inPit={!!detailed?.[car.id]?.inPit}
                finishingPrevLap={!!anim && (progress?.[car.id] ?? 0) < 0}
              />
            ))}
          </div>
        </div>

          <div className="panel lg:col-start-2">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="tv-label bg-white/10 px-3 py-1 clip-slant pr-6">Dirección de carrera</span>
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

type SectorCell = { text: string; tone: "purple" | "green" | "yellow" | "old" | "empty" };

/** Sector cells for a car: live sectors of the lap being driven, or the last completed lap. */
function sectorCells(
  car: CarState,
  live: CarState | undefined,
  frac: number | undefined,
  best: ({ time: number; driverId: string } | null)[],
): SectorCell[] {
  const tone = (c: CarState, k: number, t: number): SectorCell["tone"] => {
    if (best[k] && best[k]!.driverId === c.id && Math.abs(best[k]!.time - t) < 1e-6) return "purple";
    if (c.bestSectors?.[k] && Math.abs(c.bestSectors[k] - t) < 1e-6) return "green";
    return "yellow";
  };
  const show = (c: CarState, k: number, t: number, old = false): SectorCell => ({
    text: t > 60 ? formatLap(t).slice(2) : t.toFixed(3),
    tone: old ? "old" : c.pittedThisLap && k === 2 ? "yellow" : tone(c, k, t),
  });
  if (car.status === "dnf") return [0, 1, 2].map(() => ({ text: "", tone: "empty" }));
  if (live && frac !== undefined && live.lastSectors && live.status === "running") {
    const done = frac >= 1 ? 3 : frac >= 2 / 3 ? 2 : frac >= 1 / 3 ? 1 : 0;
    if (done === 0) {
      // still on the previous lap: show it dimmed
      return car.lastSectors ? car.lastSectors.map((t, k) => show(car, k, t, true)) : [0, 1, 2].map(() => ({ text: "", tone: "empty" }));
    }
    return live.lastSectors.map((t, k) => (k < done ? show(live, k, t) : { text: "", tone: "empty" as const }));
  }
  return car.lastSectors ? car.lastSectors.map((t, k) => show(car, k, t)) : [0, 1, 2].map(() => ({ text: "", tone: "empty" }));
}

const SECTOR_TONE: Record<SectorCell["tone"], string> = {
  purple: "text-purple-400 font-semibold",
  green: "text-green-400",
  yellow: "text-yellow-300",
  old: "text-muted-foreground/50",
  empty: "",
};

function TowerRow({
  car, pos, gap, mine, fastest, lap, sectors, inPit, finishingPrevLap = false,
}: {
  car: CarState;
  pos: number;
  gap: string;
  mine: boolean;
  fastest: boolean;
  lap: number;
  sectors: SectorCell[];
  inPit: boolean;
  finishingPrevLap?: boolean; // still completing the lap before (e.g. heading into or through the pit lane)
}) {
  const dnf = car.status === "dnf";
  // while the car is still finishing the previous lap, show it as it was then: old tyres until the stop is done
  const before = finishingPrevLap && car.pitFrom ? car.pitFrom : null;
  const shownCompound = before?.compound ?? car.compound;
  const shownAge = Math.round(before?.tyreAge ?? car.tyreAge);
  const shownStops = before?.stops ?? car.stops;
  const shownLast = finishingPrevLap ? car.prevLastLap : car.lastLap;
  const change = car.grid - pos;
  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-sm border-b border-white/[0.04] last:border-0 odd:bg-white/[0.015]",
        dnf && "opacity-40",
      )}
      style={mine ? mineStyle(car.entry.team.hex) : undefined}
    >
      <span
        className={cn(
          "w-6 h-5 grid place-items-center font-display text-sm tabular-nums rounded-sm",
          dnf ? "text-muted-foreground" : pos <= 3 ? "bg-white text-black" : "bg-white/10",
        )}
      >
        {dnf ? "—" : pos}
      </span>
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
        <span className="font-display text-base tracking-wide">{car.entry.driver.shortName}</span>
        {mine && <Star className="w-3 h-3 text-primary fill-primary" />}
        {fastest && lap > 1 && <span className="text-[9px] px-1 rounded bg-purple-600 text-white">VR</span>}
        {car.damage && !dnf && <span className="text-[9px] px-1 rounded bg-red-600 text-white font-bold">ALERÓN</span>}
        {inPit ? (
          <span className="text-[9px] px-1 rounded bg-orange-500 text-black font-bold animate-pulse">EN BOXES</span>
        ) : (
          car.pittedThisLap && !before && <span className="text-[9px] px-1 rounded bg-orange-500/60 text-black font-bold">PIT</span>
        )}
        {dnf && <span className="text-[10px] text-destructive truncate">{car.dnfReason}</span>}
        {!dnf && (car.penalty ?? 0) > 0 && (
          <span className="text-[9px] px-1 rounded bg-amber-400 text-black font-bold" title="Penalización pendiente: se cumple en la próxima parada o se suma al final">
            +{car.penalty}s
          </span>
        )}
      </span>
      <span className="w-20 text-right font-mono text-xs tabular-nums">{gap}</span>
      {sectors.map((c, k) => (
        <span key={k} className={cn("w-[54px] text-right font-mono text-[11px] tabular-nums hidden md:block", SECTOR_TONE[c.tone])}>
          {c.text}
        </span>
      ))}
      <span className="w-20 text-right font-mono text-[11px] text-muted-foreground hidden sm:block tabular-nums">
        {shownLast && !dnf ? formatLap(shownLast) : ""}
      </span>
      <span className="w-14 flex justify-center">{!dnf && <TyreBadge compound={shownCompound} age={shownAge} />}</span>
      <span className="w-6 text-center text-xs text-muted-foreground">{shownStops}</span>
    </motion.div>
  );
}

function PitWallCard({
  car, pos, state, onApply, onMode, onPit, live, finishing = false, open = false, onToggle,
}: {
  onPit: (fn: (s: RaceState) => RaceState) => void;
  open?: boolean;
  onToggle?: () => void;
  finishing?: boolean; // still completing the previous lap
  onMode: (fn: (s: RaceState) => RaceState) => void;
  live: { frac: number; to?: CarState } | null;
  car: CarState;
  pos: number;
  state: RaceState;
  onApply: (fn: (s: RaceState) => RaceState) => void;
}) {
  const dnf = car.status === "dnf";
  // until the stop is really done the car still has its old tyres
  const pf = finishing && car.pitFrom ? car.pitFrom : null;
  const tyre = pf?.compound ?? car.compound;
  const tyreAgeRaw = pf?.tyreAge ?? car.tyreAge;
  const tyreAge = Math.round(tyreAgeRaw);
  const stops = pf?.stops ?? car.stops;
  const preRace = state.lap === 0 && !state.strategyConfirmed;
  const life = tyreLife(tyre, state.track, car.entry.driver.tyreMgmt, state.weather?.trackTemp[state.lap]);
  const lapsLeft = state.totalLaps - state.lap;
  // fuel and battery move continuously during the lap
  const f = live?.frac ?? 0;
  const lerp = (a: number, b: number) => a + (b - a) * f;
  const fuelNow = live?.to ? lerp(car.fuel ?? lapsLeft + 0.4, live.to.fuel ?? 0) : car.fuel ?? lapsLeft + 0.4;
  const fuelMargin = fuelNow - (lapsLeft - f);
  const ers = car.ersMode ?? "balanced";
  // automatic energy use: deploy on the straights, harvest in the braking zones
  const wave = Math.sin(2 * Math.PI * 4 * f);
  const amp = ers === "deploy" ? 9 : ers === "harvest" ? 4 : 6;
  const batteryBase = live?.to ? lerp(car.battery ?? 80, live.to.battery ?? 80) : car.battery ?? 80;
  const battery = Math.max(0, Math.min(100, batteryBase + (live ? wave * amp * Math.min(1, f * 8, (1 - f) * 8) : 0)));
  const ersState = !live ? null : Math.cos(2 * Math.PI * 4 * f) > 0 ? "⚡ desplegando" : "🔋 recuperando";
  const wear = Math.min(1.3, tyreAgeRaw / life);
  const wearColor = wear < 0.6 ? "bg-green-500" : wear < 0.9 ? "bg-yellow-400" : "bg-red-500";
  const next = car.plan.length > 1 ? { lap: car.plan[0].untilLap, compound: car.plan[1].compound } : null;
  const compounds = Object.keys(COMPOUNDS) as Compound[];
  const sc = state.safetyCar.active;
  const plannedCompounds = new Set([...car.usedCompounds, ...car.plan.map((s) => s.compound)]);
  const ruleRisk = state.rules?.twoCompound !== false && plannedCompounds.size < 2;

  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-3">
      <button className="w-full flex items-center gap-2 text-left" onClick={onToggle} title={open ? "Cerrar" : "Abrir controles"}>
        <TeamStripe color={car.entry.team.hex} className="h-8 w-1.5" />
        <div className="flex-1 min-w-0">
          <div className="font-racing text-sm flex items-center gap-1.5">
            {dnf ? "—" : `P${pos}`} · {car.entry.driver.name}
            {!dnf && (car.penalty ?? 0) > 0 && <span className="text-[9px] px-1 rounded bg-amber-400 text-black font-bold">+{car.penalty}s</span>}
            {!dnf && car.pitRequest && <span className="text-[9px] px-1 rounded bg-orange-500 text-black font-bold">BOX</span>}
            {!dnf && car.damage && <span className="text-[9px] px-1 rounded bg-red-600 text-white font-bold">ALERÓN</span>}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {dnf ? `Abandono: ${car.dnfReason}` : preRace ? `Sale desde P${car.grid}` : `${stops} parada${stops === 1 ? "" : "s"}`}
            {car.morale != null && (
              <span className={cn("ml-2", moraleLabel(car.morale).tone)} title="Moral del piloto al empezar la carrera">
                · moral {Math.round(car.morale)}
              </span>
            )}
          </div>
        </div>
        {!dnf && <TyreBadge compound={tyre} />}
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {!dnf && car.damage && (
        <div className="rounded-md border border-red-500/60 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-200 flex items-center gap-2">
          <span className="flex-1">
            🔧 Alerón delantero dañado: pierde {car.damage.pace.toFixed(1)}s por vuelta.{" "}
            {car.pitRequest ? "Entra a box en esta vuelta." : "Hay que entrar a box para cambiarlo."}
          </span>
          {!car.pitRequest && (
            <Button
              size="sm"
              className="h-7 text-xs bg-red-600 hover:bg-red-500 text-white"
              onClick={() => onPit((s) => requestPit(s, car.id, car.plan[1]?.compound ?? car.compound))}
            >
              Box ahora
            </Button>
          )}
        </div>
      )}
      {!open && !dnf && !preRace && (
        <button className="w-full grid grid-cols-4 gap-1.5 text-[10px] text-left" onClick={onToggle}>
          <Stat label="Neum." value={`${tyreAge}v · ${Math.round(wear * 100)}%`} tone={wear > 0.9 ? "text-red-400" : wear > 0.6 ? "text-yellow-300" : undefined} />
          <Stat label="Batería" value={`${Math.round(battery)}%`} tone={battery < 20 ? "text-red-400" : undefined} />
          <Stat label="Combust." value={`${fuelMargin >= 0 ? "+" : ""}${fuelMargin.toFixed(2)}`} tone={fuelMargin < 0 ? "text-red-400" : fuelMargin < 0.25 ? "text-yellow-300" : undefined} />
          <Stat label="Parada" value={car.pitRequest ? "ahora" : next ? `V${next.lap}` : "—"} />
          <Stat label="Modo" value={MODES[car.mode].label} />
          <Stat label="Mezcla" value={{ rich: "Máx.", normal: "Estándar", lean: "L&C" }[car.fuelMode ?? "normal"]} />
          <Stat label="ERS" value={{ deploy: "Ataque", balanced: "Auto", harvest: "Recarga" }[car.ersMode ?? "balanced"]} />
          <Stat label="Duelo" value={{ free: "Libre", attack: "Atacar", defend: "Defender" }[car.instruction ?? "free"]} />
        </button>
      )}

      {open && (
      <div className="space-y-3">

      {!dnf && !preRace && (
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Desgaste neumático</span>
            <span>{tyreAge} v · {Math.round(wear * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={cn("h-full", wearColor)} style={{ width: `${Math.min(100, wear * 100)}%` }} />
          </div>
        </div>
      )}

      {!dnf && (car.penalty ?? 0) > 0 && (
        <div className="rounded-md border border-amber-400/50 bg-amber-400/10 px-2 py-1.5 text-[11px] text-amber-200">
          ⚖️ Penalización pendiente de {car.penalty}s: {car.plan.length > 1 || car.pitRequest ? "la cumple en su próxima parada" : "sin más paradas, se suma a su tiempo final"}.
          {(car.penalties ?? []).length > 0 && <span className="block text-amber-300/80">{car.penalties![car.penalties!.length - 1].reason}</span>}
        </div>
      )}
      {!dnf && (car.trackLimits ?? 0) > 0 && (car.trackLimits ?? 0) < 4 && (
        <div className={cn("text-[10px]", (car.trackLimits ?? 0) >= 3 ? "text-orange-300" : "text-muted-foreground")}>
          Límites de pista: {car.trackLimits}/3 advertencias{(car.trackLimits ?? 0) >= 3 ? " · la próxima es penalización (conviene Cuidar)" : ""}
        </div>
      )}
      {!dnf && !preRace && <DuelPanel car={car} state={state} onMode={onMode} />}

      {!dnf && (
        <div className="rounded-md border border-border/60 p-2 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Próxima parada planificada</span>
            {next ? (
              <button className="text-muted-foreground hover:text-destructive" onClick={() => onApply((s) => editNextStop(s, car.id, { remove: true }))}>
                quitar
              </button>
            ) : (
              <button className="text-primary hover:underline" onClick={() => onApply((s) => editNextStop(s, car.id, { add: true }))}>
                + agregar parada
              </button>
            )}
          </div>
          {next ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-md border border-border">
                <button className="px-2 py-1 hover:bg-muted" onClick={() => onApply((s) => editNextStop(s, car.id, { lap: next.lap - 1 }))}>
                  −
                </button>
                <span className="px-1 text-xs font-mono tabular-nums w-14 text-center">V{next.lap}</span>
                <button className="px-2 py-1 hover:bg-muted" onClick={() => onApply((s) => editNextStop(s, car.id, { lap: next.lap + 1 }))}>
                  +
                </button>
              </div>
              <span className="text-[11px] text-muted-foreground">→</span>
              {compounds.map((c) => (
                <button
                  key={c}
                  onClick={() => onApply((s) => editNextStop(s, car.id, { compound: c }))}
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
          <div className="space-y-1.5">
            <ModeRow
              label="Neumáticos"
              options={(Object.keys(MODES) as DriverMode[]).map((m) => ({ id: m, label: MODES[m].label }))}
              value={car.mode}
              onPick={(m) => onMode((s) => setMode(s, car.id, m))}
            />
            <ModeRow
              label="Combustible"
              options={(Object.keys(FUEL_MODES) as FuelMode[]).map((m) => ({ id: m, label: FUEL_MODES[m].label }))}
              value={car.fuelMode ?? "normal"}
              onPick={(m) => onMode((s) => setFuelMode(s, car.id, m))}
              extra={
                <span className={cn("tabular-nums", fuelMargin < 0 ? "text-red-400 font-semibold" : fuelMargin < 0.25 ? "text-yellow-300" : "text-muted-foreground")}>
                  {fuelNow.toFixed(2)} v · margen {fuelMargin >= 0 ? `+${fuelMargin.toFixed(2)}` : fuelMargin.toFixed(2)}
                </span>
              }
            />
            {fuelMargin < 0 && (
              <div className="text-[10px] text-red-400">No llega a la meta con este consumo: pasa a Lift &amp; coast.</div>
            )}
            <ModeRow
              label="Energía (ERS)"
              options={(Object.keys(ERS_MODES) as ErsMode[]).map((m) => ({ id: m, label: ERS_MODES[m].label }))}
              value={car.ersMode ?? "balanced"}
              onPick={(m) => onMode((s) => setErsMode(s, car.id, m))}
              extra={
                <span className="flex items-center gap-1 text-muted-foreground">
                  {ersState && <span className="text-[10px] w-[86px] text-right">{ersState}</span>}
                  <span className="w-12 h-1.5 rounded-full bg-muted overflow-hidden inline-block">
                    <span
                      className={cn("block h-full", battery < 20 ? "bg-red-500" : battery < 50 ? "bg-yellow-400" : "bg-emerald-400")}
                      style={{ width: `${Math.round(battery)}%`, transition: "width 120ms linear" }}
                    />
                  </span>
                  <span className="tabular-nums">{Math.round(battery)}%</span>
                </span>
              }
            />
          </div>

          {car.pitRequest ? (
            <div className="flex items-center gap-2 rounded-md bg-orange-500/15 border border-orange-500/40 px-2 py-1.5 text-xs">
              <Wrench className="w-3.5 h-3.5 text-orange-400" />
              <span className="flex-1">Box en la próxima pasada → {COMPOUNDS[car.pitRequest].name}</span>
              <button onClick={() => onPit((s) => requestPit(s, car.id, null))} title="Cancelar">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className={cn("flex items-center gap-1 rounded-md px-1", sc && "bg-yellow-400/10 py-1")}>
              <span className="text-[11px] text-muted-foreground mr-1">{sc ? "Box ahora (barato con SC):" : "Box ahora:"}</span>
              {compounds.map((c) => (
                <button key={c} onClick={() => onPit((s) => requestPit(s, car.id, c))} className="hover:scale-110 transition-transform" title={`Parar y poner ${COMPOUNDS[c].name}`}>
                  <TyreBadge compound={c} />
                </button>
              ))}
            </div>
          )}
        </>
      )}
      </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <span className="rounded bg-white/[0.04] px-1.5 py-1 min-w-0">
      <span className="block text-[9px] uppercase tracking-wider text-muted-foreground truncate">{label}</span>
      <span className={cn("block font-semibold truncate", tone)}>{value}</span>
    </span>
  );
}

function ModeRow<T extends string>({
  label, options, value, onPick, extra,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onPick: (v: T) => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <span className="normal-case tracking-normal">{extra}</span>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => onPick(o.id)}
            className={cn(
              "rounded-md border py-1 text-[11px] font-racing",
              value === o.id ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
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
  weather: "text-sky-300 font-semibold",
  red: "text-red-500 font-bold",
  green: "text-emerald-400 font-semibold",
  puncture: "text-orange-400 font-semibold",
  penalty: "text-amber-300 font-semibold",
  damage: "text-orange-400 font-semibold",
};

/** Big moments get a banner over the track for a few seconds. */
const FLASH: Partial<Record<RaceEvent["type"], { label: string; cls: string }>> = {
  dnf: { label: "Abandono", cls: "bg-zinc-950/90 border-red-500 text-red-400" },
  sc: { label: "Safety car", cls: "bg-yellow-400/95 border-yellow-200 text-black" },
  sc_end: { label: "Bandera verde", cls: "bg-emerald-500/95 border-emerald-200 text-black" },
  red: { label: "Bandera roja", cls: "bg-red-600/95 border-red-300 text-white" },
  green: { label: "Bandera verde", cls: "bg-emerald-500/95 border-emerald-200 text-black" },
  puncture: { label: "Pinchazo", cls: "bg-orange-500/95 border-orange-200 text-black" },
  penalty: { label: "Penalización", cls: "bg-amber-400/95 border-amber-100 text-black" },
  damage: { label: "Contacto", cls: "bg-orange-600/95 border-orange-200 text-white" },
  weather: { label: "Clima", cls: "bg-sky-500/95 border-sky-200 text-black" },
  finish: { label: "Bandera a cuadros", cls: "bg-white/95 border-zinc-900 text-black" },
};

const FLASH_PRIORITY: Partial<Record<RaceEvent["type"], number>> = {
  red: 6, finish: 5, sc: 4, green: 4, sc_end: 3, dnf: 2, puncture: 2, damage: 2, penalty: 1, weather: 1,
};
const flashKey = (e: RaceEvent) => `${e.lap}-${e.type}-${e.text}`;

function RaceFlash({ events }: { events: RaceEvent[] }) {
  const big = events.filter((e) => FLASH[e.type] && (e.type !== "penalty" || e.text.includes("Penalización de")));
  const sig = big.map(flashKey).join("|");
  const [shown, setShown] = useState<{ key: string; e: RaceEvent } | null>(null);
  const [queue, setQueue] = useState<RaceEvent[]>([]);
  // don't replay what was already there when the view opened
  const seen = useRef<Set<string>>(new Set(big.map(flashKey)));
  useEffect(() => {
    const fresh = big.filter((e) => !seen.current.has(flashKey(e)));
    if (!fresh.length) return;
    fresh.forEach((e) => seen.current.add(flashKey(e)));
    setQueue((q) => {
      const lap = Math.max(...fresh.map((e) => e.lap));
      // stale banners from an older lap are dropped; the most important goes first
      return [...q.filter((e) => e.lap >= lap), ...fresh].sort(
        (a, b) => (FLASH_PRIORITY[b.type] ?? 0) - (FLASH_PRIORITY[a.type] ?? 0),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  useEffect(() => {
    if (shown || !queue.length) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setShown({ key: flashKey(next), e: next });
  }, [shown, queue]);
  useEffect(() => {
    if (!shown) return;
    const long = shown.e.type === "red" || shown.e.type === "finish";
    const t = window.setTimeout(() => setShown(null), long ? 3500 : queue.length ? 1600 : 2400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  const f = shown ? FLASH[shown.e.type]! : null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <AnimatePresence>
        {shown && f && (
          <motion.div
            key={shown.key}
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.05, y: -10 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className={cn("rounded-xl border-2 px-6 py-3 text-center shadow-2xl max-w-[80%]", f.cls)}
          >
            <div className="font-display text-2xl md:text-4xl uppercase tracking-wide">{f.label}</div>
            <div className="text-xs md:text-sm font-semibold mt-0.5 opacity-90">{shown.e.text.replace(/^[^\p{L}\p{N}]+/u, "")}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EventRow({ e, mine }: { e: RaceEvent; mine: boolean }) {
  return (
    <div className={cn("flex gap-2 text-xs rounded px-1.5 py-1", mine && "bg-white/[0.06]")}>
      <span className="w-8 shrink-0 font-mono text-muted-foreground">V{e.lap}</span>
      <span className={EVENT_STYLE[e.type]}>{e.text}</span>
    </div>
  );
}
