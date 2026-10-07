import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Flag,
  Timer,
  FastForward,
  Pause,
  Play,
  Star,
  SkipForward,
  Thermometer,
  Droplets,
  LogOut,
  Home,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Race } from "@/data/f1Data";
import {
  advanceTo,
  runToEnd,
  clockRemaining,
  redFlagAt,
  autoPlan,
  canGoOut,
  carPhase,
  dayConditions,
  dayForecast,
  formatLap,
  goOut,
  tyreOptions,
  lastCall,
  MAX_RUNS,
  QUALI_FORMAT,
  runOutlook,
  sectorsDone,
  sessionEnd,
  SKY_INFO,
  skyFor,
  stayIn,
  trackEvolution,
  wetLabel,
  type Entry,
  type QualiCtx,
  type QualifyingResult,
  type QualiLive,
  type QualiRun,
  type WeatherTimeline,
} from "@/engine";
import { WeatherWidget } from "./WeatherWidget";
import { CircuitMap, type MapMarker } from "./TrackMap";
import { PositionBadge, TeamStripe, TyreBadge, mineStyle } from "./common";
import { cn } from "@/lib/utils";

interface Props {
  race: Race;
  quali: QualifyingResult; // completed sessions
  live: QualiLive | null; // session in progress
  ctx: QualiCtx | null;
  entryMap: Map<string, Entry>;
  playerTeamId: string | null;
  onLive: (live: QualiLive) => void; // save clock and decisions
  onNext: (all?: boolean) => void; // close the session (or the whole qualifying)
  onStartRace: () => void;
  weather?: WeatherTimeline; // the race's weather (shown as a forecast)
  sprint?: boolean; // sprint qualifying (SQ1-SQ3)
}

const INFO = {
  gp: [
    { out: 6, text: "22 autos · los 6 más lentos quedan eliminados" },
    { out: 6, text: "16 autos · otros 6 quedan eliminados" },
    { out: 0, text: "Top 10 · pelean la pole position" },
  ],
  sprint: [
    {
      out: 6,
      text: "Clasificación sprint · los 6 más lentos quedan eliminados",
    },
    { out: 6, text: "16 autos · otros 6 quedan eliminados" },
    { out: 0, text: "Top 10 · pelean la pole del sprint" },
  ],
};

// session seconds per real second
const SPEEDS = [
  { label: "1x", rate: 5 },
  { label: "2x", rate: 10 },
  { label: "4x", rate: 20 },
  { label: "16x", rate: 80 },
  { label: "64x", rate: 320 },
];

const mmss = (sec: number) => {
  const s = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

type Tone = "purple" | "green" | "yellow" | "red" | "out" | "old" | "empty";
const TONE: Record<Tone, string> = {
  purple: "text-purple-400 font-semibold",
  green: "text-green-400",
  yellow: "text-yellow-300",
  red: "text-red-400 line-through",
  out: "text-red-400 font-semibold",
  old: "text-muted-foreground/50",
  empty: "",
};

/** Overall and personal best sectors and laps completed by session time `t`. */
function timingAt(live: QualiLive, t: number) {
  const overall: { t: number; id: string }[] = [
    { t: Infinity, id: "" },
    { t: Infinity, id: "" },
    { t: Infinity, id: "" },
  ];
  const personal = new Map<string, number[]>();
  const bestLap = new Map<string, number>();
  let sessionBest = Infinity;
  for (const c of live.cars) {
    const pb = [Infinity, Infinity, Infinity];
    for (const r of c.runs) {
      if (r.flyStart > live.duration) continue;
      sectorsDone(r, t).forEach((s, k) => {
        pb[k] = Math.min(pb[k], s);
        if (s < overall[k].t) overall[k] = { t: s, id: c.id };
      });
      if (r.flyEnd <= t && r.time > 0) {
        bestLap.set(c.id, Math.min(bestLap.get(c.id) ?? Infinity, r.time));
        sessionBest = Math.min(sessionBest, r.time);
      }
    }
    personal.set(c.id, pb);
  }
  return { overall, personal, bestLap, sessionBest };
}

type Timing = ReturnType<typeof timingAt>;

function sectorTone(tm: Timing, id: string, k: number, v: number): Tone {
  if (tm.overall[k].id === id && Math.abs(tm.overall[k].t - v) < 1e-9)
    return "purple";
  if (Math.abs((tm.personal.get(id)?.[k] ?? Infinity) - v) < 1e-9)
    return "green";
  return "yellow";
}

/** What the timing screen shows for a car: the lap being driven, or the last one. */
function carTiming(live: QualiLive, id: string, t: number, tm: Timing) {
  const car = live.cars.find((c) => c.id === id)!;
  const ph = carPhase(live, id, t);
  const valid = (r: QualiRun) => r.flyStart <= live.duration && !r.aborted;
  const lastDone = [...car.runs]
    .reverse()
    .find((r) => valid(r) && r.flyEnd <= t);
  let run: QualiRun | undefined;
  let old = false;
  if (ph.phase === "push" && ph.run) run = ph.run;
  else if (lastDone) {
    run = lastDone;
    old = ph.phase === "out"; // a new run has started: the previous lap is greyed out
  }
  const done = run ? sectorsDone(run, t) : [];
  const sectors = [0, 1, 2].map((k) =>
    k < done.length
      ? {
          text: done[k].toFixed(3),
          tone: (old ? "old" : sectorTone(tm, id, k, done[k])) as Tone,
        }
      : { text: "", tone: "empty" as Tone },
  );
  let last: { text: string; tone: Tone } = { text: "", tone: "empty" };
  if (lastDone) {
    if (lastDone.retired) last = { text: lastDone.retired === "crash" ? "ACCIDENTE" : "AVERÍA", tone: "out" };
    else if (lastDone.redFlagged) last = { text: "ABORTADA", tone: "old" };
    else if (!lastDone.time) last = { text: "ANULADA", tone: "red" };
    else
      last = {
        text: formatLap(lastDone.time),
        tone:
          Math.abs(lastDone.time - tm.sessionBest) < 1e-9
            ? "purple"
            : Math.abs(lastDone.time - (tm.bestLap.get(id) ?? 0)) < 1e-9
              ? "green"
              : "yellow",
      };
  }
  const started = car.runs.filter((r) => r.start <= t).length;
  return {
    ph,
    sectors,
    last,
    started,
    car,
    compound: ph.run?.compound ?? lastDone?.compound ?? "S",
  };
}

export function QualifyingView({
  sprint,
  weather,
  race,
  quali,
  live,
  ctx,
  entryMap,
  playerTeamId,
  onLive,
  onNext,
  onStartRace,
}: Props) {
  const fmt = sprint ? QUALI_FORMAT.sprint : QUALI_FORMAT.gp;
  const info = sprint ? INFO.sprint : INFO.gp;
  const done = quali.grid.length > 0;
  const [tab, setTab] = useState<string>(done ? "grid" : "live");
  const [lv, setLv] = useState<QualiLive | null>(live);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const lastSave = useRef(performance.now());

  // a new session from the game state
  useEffect(() => {
    setLv(live);
    setPlaying(false);
    setTab(live ? "live" : "grid");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.session, live?.sprint, done]);

  const end = lv ? sessionEnd(lv) : 0;
  const over = !!lv && lv.clock >= end;

  // the session clock
  useEffect(() => {
    if (!playing || !lv || !ctx) return;
    let raf = 0;
    let prev = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.25, (now - prev) / 1000);
      prev = now;
      setLv((cur) => {
        if (!cur) return cur;
        const target = Math.min(
          sessionEnd(cur),
          cur.clock + dt * SPEEDS[speed].rate,
        );
        return advanceTo(ctx, cur, target);
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, ctx, lv?.session]);

  // stop at the flag (once the last laps are in), stop for red flags, and save now and then
  const red = lv ? redFlagAt(lv, lv.clock) : null;
  const seenRed = useRef<number | null>(null);
  useEffect(() => {
    if (!lv) return;
    if (red && playing && seenRed.current !== red.at) {
      seenRed.current = red.at;
      setPlaying(false);
      onLive(lv);
      return;
    }
    if (over && playing) {
      setPlaying(false);
      onLive(lv);
      return;
    }
    if (performance.now() - lastSave.current > 3000) {
      lastSave.current = performance.now();
      onLive(lv);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lv?.clock, over]);

  const act = (fn: (l: QualiLive) => QualiLive) => {
    if (!lv) return;
    const next = fn(lv);
    setLv(next);
    onLive(next);
  };

  const finishSession = () => {
    if (!lv || !ctx) return;
    setPlaying(false);
    let next = runToEnd(ctx, lv);
    next = { ...next, clock: Math.max(next.clock, sessionEnd(next)) };
    setLv(next);
    onLive(next);
  };

  const pole = entryMap.get(quali.grid[0]);
  const sessionName = (i: number) => fmt.names[i];
  const started = !!lv && (lv.clock > 0 || playing);

  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {sprint ? "Viernes · Clasificación sprint" : "Sábado · Clasificación"}
        </p>
        <h2 className="font-display text-4xl md:text-5xl">
          {race.flag} {race.name}
        </h2>
        <p className="text-xs text-muted-foreground">{race.circuit}</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-4">
          {[0, 1, 2].map((i) => {
            const isLive = lv?.session === i && !done;
            const has = !!quali.sessions[i];
            return (
              <TabsTrigger
                key={i}
                value={isLive ? "live" : `${i}`}
                disabled={!isLive && !has}
                className="font-racing text-xs"
              >
                {sessionName(i)}
                {isLive && playing && (
                  <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                )}
              </TabsTrigger>
            );
          })}
          <TabsTrigger
            value="grid"
            disabled={!done}
            className="font-racing text-xs"
          >
            Parrilla
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "live" && lv && ctx && (
        <LiveSession
          name={sessionName(lv.session)}
          info={info[lv.session]}
          live={lv}
          ctx={ctx}
          raceId={race.id}
          entryMap={entryMap}
          playerTeamId={playerTeamId}
          over={over}
          onAct={act}
        />
      )}

      {tab !== "live" && tab !== "grid" && quali.sessions[Number(tab)] && (
        <SessionTable
          key={tab}
          rows={quali.sessions[Number(tab)].rows}
          entryMap={entryMap}
          playerTeamId={playerTeamId}
        />
      )}

      {done && tab === "grid" && (
        <div className="space-y-3">
          {pole && (
            <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-center text-sm">
              🏆 Pole position:{" "}
              <span className="font-racing">{pole.driver.name}</span> (
              {pole.team.name})
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {quali.grid.map((id, i) => {
              const e = entryMap.get(id);
              if (!e) return null;
              const mine = e.team.id === playerTeamId;
              return (
                <motion.div
                  key={id}
                  className={cn(
                    "flex items-center gap-2 rounded-md border border-border/40 bg-card/50 px-2 py-1.5 text-sm",
                    i % 2 === 1 && "mt-4",
                  )}
                  style={mine ? mineStyle(e.team.hex) : undefined}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                >
                  <PositionBadge pos={i + 1} />
                  <TeamStripe color={e.team.hex} />
                  <span className="font-racing text-xs">
                    {e.driver.shortName}
                  </span>
                  {mine && (
                    <Star className="w-3 h-3 text-primary fill-primary" />
                  )}
                  <span className="text-[10px] text-muted-foreground truncate">
                    {e.team.shortName}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-2">
        {done ? (
          <Button
            onClick={onStartRace}
            className="flex-1 font-racing"
            size="lg"
          >
            <Flag className="w-4 h-4 mr-2" />
            {sprint ? "Ir a la carrera sprint" : "Ir a la carrera"}
          </Button>
        ) : !lv ? null : red && !playing ? (
          <Button
            onClick={() => {
              if (!ctx) return;
              const next = advanceTo(ctx, lv, red.at + red.dur);
              setLv(next);
              onLive(next);
              setPlaying(true);
            }}
            className="flex-1 font-racing bg-red-600 hover:bg-red-500 text-white"
            size="lg"
          >
            🟥 Bandera roja · Reanudar la sesión
          </Button>
        ) : over ? (
          <Button
            onClick={() => onNext(false)}
            className="flex-1 font-racing"
            size="lg"
          >
            <SkipForward className="w-4 h-4 mr-2" />
            {lv.session < 2
              ? `Siguiente: ${sessionName(lv.session + 1)}`
              : "Ver parrilla de salida"}
          </Button>
        ) : !started ? (
          <>
            <Button
              onClick={() => {
                setTab("live");
                setPlaying(true);
              }}
              className="flex-1 font-racing"
              size="lg"
            >
              <Timer className="w-4 h-4 mr-2" />
              Iniciar {sessionName(lv.session)}
            </Button>
            <Button
              onClick={() => {
                onLive(lv);
                onNext(true);
              }}
              variant="outline"
              size="lg"
              title="Simular toda la clasificación"
            >
              <FastForward className="w-4 h-4" />
            </Button>
          </>
        ) : (
          <>
            <Button
              onClick={() => setPlaying((p) => !p)}
              className="font-racing min-w-28"
            >
              {playing ? (
                <Pause className="w-4 h-4 mr-1" />
              ) : (
                <Play className="w-4 h-4 mr-1" />
              )}
              {playing ? "Pausa" : "Seguir"}
            </Button>
            <div className="flex rounded-md border border-border overflow-hidden">
              {SPEEDS.map((s, i) => (
                <button
                  key={s.label}
                  onClick={() => setSpeed(i)}
                  className={cn(
                    "px-3 py-2 text-xs font-racing",
                    i === speed
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              onClick={finishSession}
              className="ml-auto text-xs"
              title="Simular lo que queda de la sesión"
            >
              <SkipForward className="w-4 h-4 mr-1" /> Terminar{" "}
              {sessionName(lv.session)}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setPlaying(false);
                onLive(lv);
                onNext(true);
              }}
              className="text-xs"
              title="Simular toda la clasificación"
            >
              <FastForward className="w-4 h-4" />
            </Button>
          </>
        )}
      </div>

      {weather && (
        <WeatherWidget
          weather={weather}
          lap={0}
          preview
          title={
            sprint
              ? "Pronóstico para el sprint (sábado)"
              : "Pronóstico para la carrera (domingo)"
          }
        />
      )}
    </div>
  );
}

function LiveSession({
  name,
  info,
  live,
  ctx,
  raceId,
  entryMap,
  playerTeamId,
  over,
  onAct,
}: {
  name: string;
  info: { out: number; text: string };
  live: QualiLive;
  ctx: QualiCtx;
  raceId: number;
  entryMap: Map<string, Entry>;
  playerTeamId: string | null;
  over: boolean;
  onAct: (fn: (l: QualiLive) => QualiLive) => void;
}) {
  const t = live.clock;
  const tm = useMemo(() => timingAt(live, t), [live, t]);
  const teamOrder = useMemo(() => Array.from(entryMap.keys()), [entryMap]);
  const board = live.cars
    .map((c) => ({ id: c.id, best: tm.bestLap.get(c.id) ?? 0 }))
    .sort(
      (a, b) =>
        (a.best || 9999) - (b.best || 9999) ||
        teamOrder.indexOf(a.id) - teamOrder.indexOf(b.id),
    );
  const leader = board[0]?.best ?? 0;
  const cutoff = live.cars.length - info.out;
  const red = redFlagAt(live, t);
  const remaining = clockRemaining(live, t);
  const flag = t >= live.duration;

  const markers: MapMarker[] = live.cars.flatMap((c) => {
    const e = entryMap.get(c.id);
    const ph = carPhase(live, c.id, t);
    if (!e || ph.phase === "garage") return [];
    const pos = board.findIndex((b) => b.id === c.id);
    return [
      {
        id: c.id,
        hex: e.team.hex,
        short: e.driver.shortName,
        mine: e.team.id === playerTeamId,
        frac: ph.frac,
        inPit: ph.inPit,
        stopped: ph.phase === "stopped",
        pos: board[pos]?.best ? pos + 1 : undefined,
        dim: ph.phase !== "push",
        tag: ph.phase === "push" ? "⏱" : undefined,
        label: ph.phase === "push",
      },
    ];
  });

  // weather now and ahead
  const T = live.offset + Math.min(t, live.duration);
  const cond = dayConditions(ctx.weather, T);
  const sky = skyFor(cond.rain, cond.cloud > 0.5);
  const evo = trackEvolution(live, T, cond.wet);
  const nowMin = Math.floor(T / 60);
  const endMin = (live.offset + live.duration) / 60;
  const fc = dayForecast(ctx.weather, nowMin, 3).filter(
    (f) => f.fromLap <= endMin,
  );

  // session log
  const log = useMemo(() => {
    const out: { at: number; text: string; tone: string }[] = [];
    for (const c of live.cars) {
      const e = entryMap.get(c.id);
      if (!e) continue;
      for (const r of c.runs) {
        if (r.start <= t)
          out.push({
            at: r.start,
            text: `${e.driver.shortName} sale a pista (${r.compound === "S" ? "blandos" : r.compound === "I" ? "intermedios" : "lluvia"})`,
            tone: "text-muted-foreground",
          });
        if (r.aborted && r.flyStart <= t)
          out.push({
            at: r.flyStart,
            text: `${e.driver.shortName}: ${r.note}`,
            tone: "text-orange-300",
          });
        if (r.retired && r.flyEnd <= t) {
          out.push({
            at: r.flyEnd,
            text: `${r.retired === "crash" ? "💥" : "⚠️"} ${e.driver.name} ${r.note}: fuera de la sesión${r.damage ? " (daños serios)" : ""}`,
            tone: "text-red-400 font-semibold",
          });
          continue;
        }
        if (!r.aborted && !r.redFlagged && r.flyStart <= live.duration && r.flyEnd <= t) {
          const pb = tm.bestLap.get(c.id);
          const isBest = r.time > 0 && Math.abs(r.time - tm.sessionBest) < 1e-9;
          const text = r.time
            ? `${e.driver.shortName} ${formatLap(r.time)}${isBest ? " · ¡mejor tiempo!" : r.time === pb ? " · mejora" : ""}${r.note ? ` (${r.note.toLowerCase()})` : ""}`
            : `${e.driver.shortName}: ${r.note ?? "vuelta anulada"}`;
          out.push({
            at: r.flyEnd,
            text,
            tone: !r.time
              ? "text-red-400"
              : isBest
                ? "text-purple-400"
                : r.time === pb
                  ? "text-green-400"
                  : "text-yellow-300",
          });
        }
      }
    }
    // rain starting / stopping during the session
    for (
      let m = Math.ceil(live.offset / 60) + 1;
      m <= Math.min(nowMin, endMin);
      m++
    ) {
      const a = ctx.weather.rain[m - 1] ?? 0;
      const b = ctx.weather.rain[m] ?? 0;
      if (a < 0.08 && b >= 0.08)
        out.push({
          at: m * 60 - live.offset,
          text: "🌧️ Empieza a llover",
          tone: "text-sky-300 font-semibold",
        });
      if (a >= 0.08 && b < 0.08)
        out.push({
          at: m * 60 - live.offset,
          text: "🌤️ Deja de llover",
          tone: "text-sky-300 font-semibold",
        });
    }
    for (const f of live.redFlags ?? []) {
      if (f.at > t) continue;
      const who = entryMap.get(f.by.split("@")[0])?.driver.name ?? "un piloto";
      out.push({ at: f.at, text: `🟥 Bandera roja por el accidente de ${who}: sesión detenida, todos a boxes`, tone: "text-red-400 font-semibold" });
      if (f.at + f.dur <= t) out.push({ at: f.at + f.dur, text: "🟢 Se reanuda la sesión: el pit lane está abierto", tone: "text-emerald-400 font-semibold" });
    }
    if (flag)
      out.push({
        at: live.duration,
        text: "🏁 Bandera a cuadros: solo cuentan las vueltas ya abiertas",
        tone: "text-white font-semibold",
      });
    return out.sort((a, b) => b.at - a.at).slice(0, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, Math.floor(t)]);

  const mine = live.cars.filter(
    (c) => entryMap.get(c.id)?.team.id === playerTeamId,
  );

  return (
    <div className="space-y-3">
      {/* session header: clock and conditions */}
      <div className="panel p-3 flex flex-wrap items-center gap-4 justify-between">
        <div>
          <div className="font-display text-2xl">{name}</div>
          <div className="text-xs text-muted-foreground">{info.text}</div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-lg leading-none" title={SKY_INFO[sky].label}>
            {SKY_INFO[sky].icon}
          </span>
          <span>{SKY_INFO[sky].label}</span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Thermometer className="w-3.5 h-3.5" /> Aire {ctx.weather.airTemp}°
            · Pista {Math.round(cond.trackTemp)}°
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Droplets className="w-3.5 h-3.5" /> {wetLabel(cond.wet)}
          </span>
          <span
            className="rounded bg-white/5 px-2 py-0.5"
            title="Agarre ganado por el caucho en la pista (menos tiempo por vuelta)"
          >
            Agarre de pista <b className="text-green-400">-{evo.toFixed(2)}s</b>
          </span>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-2">
            <span className="tv-label text-muted-foreground">
              {over
                ? "🏁 Sesión terminada"
                : red
                  ? "🟥 Bandera roja: reloj detenido"
                  : flag
                  ? "🏁 Últimas vueltas"
                  : t <= 0
                    ? "Esperando"
                    : "Tiempo restante"}
            </span>
            <span
              className={cn(
                "font-display text-3xl tabular-nums rounded-md px-2 py-0.5 bg-black/50 border border-white/10",
                !flag && remaining < 120 && t > 0 && "text-red-400",
              )}
            >
              {mmss(remaining)}
            </span>
          </div>
        </div>
      </div>

      {/* rain forecast for what is left of the session */}
      {fc.some((f) => f.chance >= 15) && (
        <div className="panel px-3 py-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-muted-foreground mr-1">
            Radar (prob. de lluvia):
          </span>
          {fc.map((f) => (
            <span
              key={f.fromLap}
              className={cn(
                "rounded px-1.5 py-0.5 font-mono",
                f.chance >= 70
                  ? "bg-blue-500/80 text-white"
                  : f.chance >= 40
                    ? "bg-sky-500/50 text-white"
                    : f.chance >= 20
                      ? "bg-sky-500/20 text-sky-200"
                      : "bg-muted/40 text-muted-foreground",
              )}
            >
              {f.fromLap * 60 <= T + 1
                ? "ahora"
                : `+${Math.round(f.fromLap - T / 60)}'`}{" "}
              {f.chance}%
            </span>
          ))}
        </div>
      )}

      <CircuitMap
        raceId={raceId}
        markers={markers}
        highlight={red ? "BANDERA ROJA" : flag ? "BANDERA A CUADROS" : undefined}
      />

      <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
        {/* timing tower */}
        <div className="panel overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 tv-label text-muted-foreground border-b border-white/10 bg-black/40">
            <span className="w-6">Pos</span>
            <span className="flex-1">Piloto</span>
            <span className="w-[54px] text-right hidden md:block">S1</span>
            <span className="w-[54px] text-right hidden md:block">S2</span>
            <span className="w-[54px] text-right hidden md:block">S3</span>
            <span className="w-20 text-right hidden sm:block">Última</span>
            <span className="w-20 text-right">Mejor</span>
            <span className="w-16 text-right">Gap</span>
          </div>
          {board.map((b, i) => {
            const e = entryMap.get(b.id);
            if (!e) return null;
            const isMine = e.team.id === playerTeamId;
            const ct = carTiming(live, b.id, t, tm);
            const inDrop = info.out > 0 && i >= cutoff && leader > 0;
            const status =
              ct.ph.phase === "stopped"
                ? { text: ct.ph.run?.retired === "crash" ? "ACCIDENTE" : "AVERÍA", cls: "bg-red-600 text-white" }
                : ct.car.noCar
                ? { text: "SIN AUTO", cls: "bg-red-900 text-white" }
                : ct.ph.phase === "push"
                ? { text: "VUELTA RÁPIDA", cls: "bg-purple-600 text-white" }
                : ct.ph.phase === "out"
                  ? { text: "SALIDA", cls: "bg-white/15 text-white" }
                  : ct.ph.phase === "in"
                    ? {
                        text: "ENTRANDO",
                        cls: "bg-white/10 text-muted-foreground",
                      }
                    : null;
            return (
              <motion.div
                layout
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
                key={b.id}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-sm border-b border-white/[0.04] last:border-0",
                  inDrop && "bg-destructive/10",
                  i === cutoff &&
                    info.out > 0 &&
                    leader > 0 &&
                    "border-t-2 border-t-destructive/60",
                )}
                style={isMine ? mineStyle(e.team.hex) : undefined}
              >
                <span
                  className={cn(
                    "w-6 h-5 grid place-items-center font-display text-sm tabular-nums rounded-sm",
                    !b.best
                      ? "text-muted-foreground"
                      : i < 3
                        ? "bg-white text-black"
                        : "bg-white/10",
                  )}
                >
                  {b.best ? i + 1 : "–"}
                </span>
                <TeamStripe color={e.team.hex} />
                <span className="flex-1 min-w-0 flex items-center gap-1.5">
                  <span className="font-display text-base tracking-wide">
                    {e.driver.shortName}
                  </span>
                  {isMine && (
                    <Star className="w-3 h-3 text-primary fill-primary" />
                  )}
                  {status && (
                    <span
                      className={cn(
                        "text-[9px] px-1 rounded font-bold",
                        status.cls,
                      )}
                    >
                      {status.text}
                    </span>
                  )}
                  {ct.ph.phase !== "garage" && (
                    <TyreBadge compound={ct.compound} />
                  )}
                  {over && inDrop && (
                    <span className="text-[10px] uppercase text-destructive">
                      Fuera
                    </span>
                  )}
                </span>
                {ct.sectors.map((c, k) => (
                  <span
                    key={k}
                    className={cn(
                      "w-[54px] text-right font-mono text-[11px] tabular-nums hidden md:block",
                      TONE[c.tone],
                    )}
                  >
                    {c.text}
                  </span>
                ))}
                <span
                  className={cn(
                    "w-20 text-right font-mono text-[11px] tabular-nums hidden sm:block",
                    TONE[ct.last.tone],
                  )}
                >
                  {ct.last.text}
                </span>
                <span className="w-20 text-right font-mono text-xs tabular-nums">
                  {b.best ? formatLap(b.best) : "—"}
                </span>
                <span className="w-16 text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {i === 0 || !b.best ? "" : `+${(b.best - leader).toFixed(3)}`}
                </span>
              </motion.div>
            );
          })}
        </div>

        <div className="space-y-3">
          {mine.length > 0 && (
            <div className="panel p-3 space-y-3">
              <div className="tv-label bg-primary text-primary-foreground w-fit px-3 py-1 clip-slant pr-6">
                Muro de boxes
              </div>
              {mine.map((c) => (
                <PlayerCar
                  key={c.id}
                  id={c.id}
                  live={live}
                  ctx={ctx}
                  entry={entryMap.get(c.id)!}
                  pos={board.findIndex((b) => b.id === c.id) + 1}
                  hasTime={!!tm.bestLap.get(c.id)}
                  inDrop={
                    info.out > 0 &&
                    board.findIndex((b) => b.id === c.id) >= cutoff
                  }
                  onAct={onAct}
                />
              ))}
              
            </div>
          )}
          <div className="panel">
            <div className="px-3 py-2 border-b border-border tv-label bg-white/10 w-fit clip-slant pr-6">
              Dirección de carrera
            </div>
            <div className="max-h-[320px] overflow-y-auto p-2 space-y-0.5">
              {log.length === 0 && (
                <p className="text-xs text-muted-foreground p-1.5">
                  Los autos esperan en boxes.
                </p>
              )}
              {log.map((l, i) => (
                <div key={i} className="flex gap-2 text-xs px-1.5 py-1">
                  <span className="w-10 shrink-0 font-mono text-muted-foreground">
                    {l.at > live.duration ? "🏁" : mmss(clockRemaining(live, l.at))}
                  </span>
                  <span className={l.tone}>{l.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerCar({
  id,
  live,
  ctx,
  entry,
  pos,
  hasTime,
  inDrop,
  onAct,
}: {
  id: string;
  live: QualiLive;
  ctx: QualiCtx;
  entry: Entry;
  pos: number;
  hasTime: boolean;
  inDrop: boolean;
  onAct: (fn: (l: QualiLive) => QualiLive) => void;
}) {
  const t = live.clock;
  const car = live.cars.find((c) => c.id === id)!;
  const ph = carPhase(live, id, t);
  const used = car.runs.filter((r) => r.start <= t).length;
  const next = car.runs.find((r) => r.start > t);
  const blocked = canGoOut(ctx, live, id);
  const last = lastCall(ctx, live, id);
  const closed = t > last; // too late to start another flying lap

  // the engineer's read of the conditions: now vs. later
  const advice = useMemo(() => {
    if (t > last) return null;
    const now = runOutlook(ctx, live, id, t);
    let best = { s: t, v: now };
    for (let s = t + 30; s <= last; s += 30) {
      const v = runOutlook(ctx, live, id, s);
      if (v > best.v) best = { s, v };
    }
    if (best.v - now > 0.3)
      return {
        text: `La pista va a estar mejor en unos ${Math.round((best.s - t) / 60)} min.`,
        tone: "text-sky-300",
      };
    if (now - runOutlook(ctx, live, id, Math.min(last, t + 240)) > 0.3)
      return {
        text: "Conviene salir ya: las condiciones empeoran.",
        tone: "text-amber-300",
      };
    return {
      text: "Pista estable: lo ideal es marcar al final, con más agarre.",
      tone: "text-muted-foreground",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.session, Math.floor(t / 15), car.runs.length]);

  const phaseText = car.noCar
    ? "El auto sigue en reparación tras el accidente: no puede salir en esta sesión"
    : ph.phase === "stopped"
    ? `${ph.run?.retired === "crash" ? "Accidente" : "Avería"}: ${ph.run?.note}. Fuera de la sesión`
    : ph.phase === "push"
      ? "En vuelta rápida"
      : ph.phase === "out"
        ? "Vuelta de calentamiento"
        : ph.phase === "in"
          ? "Volviendo a boxes"
          : "En boxes";

  return (
    <div
      className="rounded-lg border border-border bg-background/40 p-2.5 space-y-2"
      style={mineStyle(entry.team.hex)}
    >
      <div className="flex items-center justify-between">
        <div className="font-racing text-sm">
          {hasTime ? `P${pos}` : "Sin tiempo"} · {entry.driver.name}
        </div>
        {inDrop && hasTime && (
          <span className="text-[10px] text-destructive uppercase">
            Zona de eliminación
          </span>
        )}
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{phaseText}</span>
        <span>
          Blandos nuevos: {Math.max(0, MAX_RUNS - used)}/{MAX_RUNS}
        </span>
      </div>
      <div className="text-[11px]">
        {next ? (
          <span>
            Próxima salida: <b>{mmss(clockRemaining(live, next.start))}</b> con{" "}
            <TyreBadge compound={next.compound} className="align-middle" /> {car.manual ? "" : "(plan del ingeniero)"}
          </span>
        ) : closed ? (
          <span className="text-muted-foreground">
            Ya no hay tiempo para otra salida.
          </span>
        ) : car.manual ? (
          <span className="text-muted-foreground">
            Control manual: espera tu orden en boxes.
          </span>
        ) : (
          <span className="text-muted-foreground">
            Sin más salidas planificadas.
          </span>
        )}
      </div>
      {advice && ph.phase === "garage" && (
        <div className={cn("text-[11px]", advice.tone)}>🎧 {advice.text}</div>
      )}
      {!closed && !blocked && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <LogOut className="w-3 h-3" /> Salir ahora con
          </div>
          <div className="grid grid-cols-3 gap-1">
            {tyreOptions(ctx, live, id).map((o) => (
              <button
                key={o.compound}
                onClick={() => onAct((l) => goOut(ctx, l, id, o.compound))}
                className={cn(
                  "rounded-md border px-1 py-1 text-[11px] flex items-center justify-center gap-1",
                  o.best ? "border-primary bg-primary/15" : "border-border hover:bg-muted",
                )}
                title={o.best ? "El neumático más rápido según el radar" : `≈ ${o.loss.toFixed(1)}s más lento por vuelta según el radar`}
              >
                <TyreBadge compound={o.compound} />
                <span className="font-racing">{o.compound === "S" ? "Slick" : o.compound === "I" ? "Inter" : "Lluvia"}</span>
                <span className={cn("tabular-nums", o.best ? "text-primary" : o.loss > 2 ? "text-red-400" : "text-muted-foreground")}>
                  {o.best ? "★" : `+${o.loss.toFixed(1)}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {!closed && (
        <div className="flex flex-wrap gap-1.5">
          {blocked && (
            <span className="text-[11px] text-muted-foreground flex-1 self-center">{ph.phase !== "garage" ? "En pista" : blocked}</span>
          )}
          {next && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7"
              onClick={() => onAct((l) => stayIn(l, id))}
              title="Cancela las salidas planificadas"
            >
              <Home className="w-3.5 h-3.5 mr-1" /> Esperar
            </Button>
          )}
          {car.manual && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7"
              onClick={() => onAct((l) => autoPlan(ctx, l, id))}
              title="Que el ingeniero decida cuándo salir"
            >
              <Wand2 className="w-3.5 h-3.5 mr-1" /> Ingeniero
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function SessionTable({
  rows,
  entryMap,
  playerTeamId,
}: {
  rows: QualifyingResult["sessions"][number]["rows"];
  entryMap: Map<string, Entry>;
  playerTeamId: string | null;
}) {
  const best = rows[0]?.best ?? 0;
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {rows.map((r, i) => {
        const e = entryMap.get(r.driverId);
        if (!e) return null;
        const mine = e.team.id === playerTeamId;
        return (
          <motion.div
            key={r.driverId}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-sm border-b border-border/30 last:border-0",
              r.eliminated && "bg-destructive/10 text-muted-foreground",
            )}
            style={mine ? mineStyle(e.team.hex) : undefined}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.02 }}
          >
            <span className="w-6 font-racing text-xs">{i + 1}</span>
            <TeamStripe color={e.team.hex} />
            <span className="font-racing text-xs w-10">
              {e.driver.shortName}
            </span>
            {mine && <Star className="w-3 h-3 text-primary fill-primary" />}
            <span className="text-xs text-muted-foreground flex-1 truncate">
              {e.driver.name}
            </span>
            <span className="text-[10px] text-muted-foreground hidden sm:block">
              {r.runs.map((x) => (x ? formatLap(x) : "anulada")).join(" · ")}
            </span>
            <span className="font-mono text-xs w-20 text-right">
              {r.best ? formatLap(r.best) : "Sin tiempo"}
            </span>
            <span className="font-mono text-xs w-16 text-right text-muted-foreground">
              {i === 0 || !r.best ? "" : `+${(r.best - best).toFixed(3)}`}
            </span>
            <span className="text-[10px] uppercase text-destructive w-10 text-right">
              {r.eliminated ? "Fuera" : ""}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
