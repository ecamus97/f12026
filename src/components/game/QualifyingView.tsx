import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Flag, Timer, FastForward, Pause, Play, Star, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Race } from "@/data/f1Data";
import { formatLap, type Entry, type QualifyingResult } from "@/engine";
import { PositionBadge, TeamStripe, mineStyle } from "./common";
import { cn } from "@/lib/utils";

interface Props {
  race: Race;
  quali: QualifyingResult;
  revealed: number; // completed sessions (0-3)
  entryMap: Map<string, Entry>;
  playerTeamId: string | null;
  onReveal: (all?: boolean) => void;
  onStartRace: () => void;
}

type Row = QualifyingResult["sessions"][number]["rows"][number];

const SESSION_INFO = [
  { name: "Q1", out: 6, text: "22 autos · los 6 más lentos quedan eliminados" },
  { name: "Q2", out: 6, text: "16 autos · otros 6 quedan eliminados" },
  { name: "Q3", out: 0, text: "Top 10 · pelean la pole position" },
];

const SPEEDS = [
  { label: "1x", ms: 900 },
  { label: "4x", ms: 260 },
  { label: "16x", ms: 70 },
];

interface Step {
  driverId: string;
  run: number;
}

/** Deterministic run order: everyone does a first attempt, then a second one. */
function buildSequence(rows: Row[], salt: number): Step[] {
  const hash = (s: string) => {
    let h = salt * 2654435761;
    for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return h >>> 0;
  };
  const order = (run: number) =>
    [...rows].sort((a, b) => hash(a.driverId + run) - hash(b.driverId + run)).map((r) => ({ driverId: r.driverId, run }));
  return [...order(0), ...order(1)];
}

export function QualifyingView({ race, quali, revealed, entryMap, playerTeamId, onReveal, onStartRace }: Props) {
  const done = revealed >= 3;
  const liveIndex = done ? -1 : revealed; // session that is next / in progress
  const [tab, setTab] = useState<string>(done ? "grid" : `${revealed}`);
  const [step, setStep] = useState(-1); // -1 = session not started
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(0);

  useEffect(() => {
    setTab(done ? "grid" : `${revealed}`);
    setStep(-1);
    setPlaying(false);
  }, [revealed, done]);

  const liveSession = liveIndex >= 0 ? quali.sessions[liveIndex] : null;
  const sequence = useMemo(
    () => (liveSession ? buildSequence(liveSession.rows, quali.raceId * 7 + liveIndex) : []),
    [liveSession, quali.raceId, liveIndex],
  );

  // Playback
  useEffect(() => {
    if (!playing || step < 0 || step >= sequence.length - 1) return;
    const t = window.setTimeout(() => setStep((s) => s + 1), SPEEDS[speed].ms);
    return () => window.clearTimeout(t);
  }, [playing, step, sequence.length, speed]);

  const sessionOver = step >= 0 && step >= sequence.length - 1;

  const pole = entryMap.get(quali.grid[0]);
  const viewingLive = !done && tab === `${liveIndex}`;

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Clasificación</p>
        <h2 className="font-racing text-2xl text-gradient-primary">
          {race.flag} {race.name}
        </h2>
        <p className="text-xs text-muted-foreground">{race.circuit}</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-4">
          {quali.sessions.map((s, i) => (
            <TabsTrigger key={s.name} value={`${i}`} disabled={i > revealed} className="font-racing text-xs">
              {s.name}
              {i === liveIndex && step >= 0 && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
            </TabsTrigger>
          ))}
          <TabsTrigger value="grid" disabled={!done} className="font-racing text-xs">
            Parrilla
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {viewingLive && liveSession && (
        <LiveSession
          info={SESSION_INFO[liveIndex]}
          rows={liveSession.rows}
          sequence={sequence}
          step={step}
          over={sessionOver}
          entryMap={entryMap}
          playerTeamId={playerTeamId}
        />
      )}

      {!viewingLive && tab !== "grid" && (
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
              🏆 Pole position: <span className="font-racing">{pole.driver.name}</span> ({pole.team.name})
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
                  className={cn("flex items-center gap-2 rounded-md border border-border/40 bg-card/50 px-2 py-1.5 text-sm", i % 2 === 1 && "mt-4")}
                  style={mine ? mineStyle(e.team.hex) : undefined}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                >
                  <PositionBadge pos={i + 1} />
                  <TeamStripe color={e.team.hex} />
                  <span className="font-racing text-xs">{e.driver.shortName}</span>
                  {mine && <Star className="w-3 h-3 text-primary fill-primary" />}
                  <span className="text-[10px] text-muted-foreground truncate">{e.team.shortName}</span>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-2">
        {done ? (
          <Button onClick={onStartRace} className="flex-1 font-racing" size="lg">
            <Flag className="w-4 h-4 mr-2" />
            Ir a la carrera
          </Button>
        ) : step < 0 ? (
          <>
            <Button
              onClick={() => {
                setTab(`${liveIndex}`);
                setStep(0);
                setPlaying(true);
              }}
              className="flex-1 font-racing"
              size="lg"
            >
              <Timer className="w-4 h-4 mr-2" />
              Iniciar {SESSION_INFO[liveIndex].name}
            </Button>
            <Button onClick={() => onReveal(true)} variant="outline" size="lg" title="Simular toda la clasificación">
              <FastForward className="w-4 h-4" />
            </Button>
          </>
        ) : sessionOver ? (
          <Button onClick={() => onReveal(false)} className="flex-1 font-racing" size="lg">
            <SkipForward className="w-4 h-4 mr-2" />
            {liveIndex < 2 ? `Siguiente: ${SESSION_INFO[liveIndex + 1].name}` : "Ver parrilla de salida"}
          </Button>
        ) : (
          <>
            <Button onClick={() => setPlaying((p) => !p)} className="font-racing min-w-28">
              {playing ? <Pause className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
              {playing ? "Pausa" : "Seguir"}
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
            <Button
              variant="outline"
              onClick={() => {
                setPlaying(false);
                setStep(sequence.length - 1);
              }}
              className="ml-auto text-xs"
              title="Mostrar todos los tiempos de la sesión"
            >
              <SkipForward className="w-4 h-4 mr-1" /> Terminar {SESSION_INFO[liveIndex].name}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function LiveSession({
  info,
  rows,
  sequence,
  step,
  over,
  entryMap,
  playerTeamId,
}: {
  info: (typeof SESSION_INFO)[number];
  rows: Row[];
  sequence: Step[];
  step: number;
  over: boolean;
  entryMap: Map<string, Entry>;
  playerTeamId: string | null;
}) {
  const rowMap = new Map(rows.map((r) => [r.driverId, r]));
  const doneSteps = sequence.slice(0, step + 1);
  const last = step >= 0 ? sequence[step] : null;

  // best valid time so far per driver
  const best = new Map<string, number>();
  for (const s of doneSteps) {
    const t = rowMap.get(s.driverId)!.runs[s.run];
    if (t > 0 && (!best.has(s.driverId) || t < best.get(s.driverId)!)) best.set(s.driverId, t);
  }
  // drivers without a time yet stay in team order (no spoilers of the final result)
  const teamOrder = Array.from(entryMap.keys());
  const board = rows
    .map((r) => ({ id: r.driverId, t: best.get(r.driverId) ?? 0 }))
    .sort((a, b) => (a.t || 9999) - (b.t || 9999) || teamOrder.indexOf(a.id) - teamOrder.indexOf(b.id));
  const leaderT = board[0]?.t ?? 0;
  const cutoff = rows.length - info.out; // positions > cutoff are in the drop zone

  // last lap description
  let ticker: { text: string; tone: string } | null = null;
  if (last) {
    const e = entryMap.get(last.driverId)!;
    const t = rowMap.get(last.driverId)!.runs[last.run];
    const prevSteps = doneSteps.slice(0, -1);
    const prevBestSession = Math.min(
      ...prevSteps.map((s) => rowMap.get(s.driverId)!.runs[s.run]).filter((x) => x > 0),
      Infinity,
    );
    const prevPersonal = Math.min(
      ...prevSteps.filter((s) => s.driverId === last.driverId).map((s) => rowMap.get(s.driverId)!.runs[s.run]).filter((x) => x > 0),
      Infinity,
    );
    const pos = board.findIndex((b) => b.id === last.driverId) + 1;
    if (t === 0) ticker = { text: `${e.driver.shortName} se sale de pista: vuelta anulada`, tone: "text-orange-400" };
    else if (t < prevBestSession) ticker = { text: `${e.driver.shortName} ${formatLap(t)} · ¡mejor tiempo de la sesión!`, tone: "text-purple-400" };
    else if (t < prevPersonal) ticker = { text: `${e.driver.shortName} ${formatLap(t)} · mejora, sube a P${pos}`, tone: "text-green-400" };
    else ticker = { text: `${e.driver.shortName} ${formatLap(t)} · no mejora (P${pos})`, tone: "text-yellow-300" };
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card p-3 flex flex-wrap items-center gap-3 justify-between">
        <div>
          <div className="font-racing text-sm">{info.name}</div>
          <div className="text-xs text-muted-foreground">{info.text}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {over ? "🏁 Sesión terminada" : step < 0 ? "Esperando" : step < sequence.length / 2 ? "Primer intento" : "Segundo intento"} ·{" "}
            {Math.max(0, step + 1)}/{sequence.length}
          </div>
          {ticker && <div className={cn("text-sm font-medium", ticker.tone)}>{ticker.text}</div>}
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        {board.map((b, i) => {
          const e = entryMap.get(b.id);
          if (!e) return null;
          const mine = e.team.id === playerTeamId;
          const isLast = last?.driverId === b.id;
          const inDrop = info.out > 0 && i >= cutoff;
          return (
            <motion.div
              layout
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
              key={b.id}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-sm border-b border-border/30 last:border-0",
                inDrop && "bg-destructive/10",
                i === cutoff && info.out > 0 && "border-t-2 border-t-destructive/60",
              )}
              style={mine ? mineStyle(e.team.hex) : undefined}
            >
              <span className="w-6 font-racing text-xs">{i + 1}</span>
              <TeamStripe color={e.team.hex} />
              <span className="font-racing text-xs w-10">{e.driver.shortName}</span>
              {mine && <Star className="w-3 h-3 text-primary fill-primary" />}
              <span className="text-xs text-muted-foreground flex-1 truncate">{e.driver.name}</span>
              {isLast && <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
              <span className="font-mono text-xs w-20 text-right">{b.t ? formatLap(b.t) : "—"}</span>
              <span className="font-mono text-xs w-16 text-right text-muted-foreground">
                {i === 0 || !b.t ? "" : `+${(b.t - leaderT).toFixed(3)}`}
              </span>
              {info.out > 0 && (
                <span className="text-[10px] uppercase text-destructive w-10 text-right">{over && inDrop ? "Fuera" : ""}</span>
              )}
            </motion.div>
          );
        })}
      </div>
      {info.out > 0 && !over && <p className="text-[11px] text-muted-foreground">La zona roja queda eliminada al terminar la sesión.</p>}
    </div>
  );
}

function SessionTable({
  rows,
  entryMap,
  playerTeamId,
}: {
  rows: Row[];
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
            <span className="font-racing text-xs w-10">{e.driver.shortName}</span>
            {mine && <Star className="w-3 h-3 text-primary fill-primary" />}
            <span className="text-xs text-muted-foreground flex-1 truncate">{e.driver.name}</span>
            <span className="font-mono text-xs w-20 text-right">{r.best ? formatLap(r.best) : "Sin tiempo"}</span>
            <span className="font-mono text-xs w-16 text-right text-muted-foreground">
              {i === 0 || !r.best ? "" : `+${(r.best - best).toFixed(3)}`}
            </span>
            <span className="text-[10px] uppercase text-destructive w-10 text-right">{r.eliminated ? "Fuera" : ""}</span>
          </motion.div>
        );
      })}
    </div>
  );
}
