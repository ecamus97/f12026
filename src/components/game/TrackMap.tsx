import { useEffect, useMemo, useRef, useState } from "react";
import { circuits } from "@/data/circuits";
import type { CarState, RaceState } from "@/engine";
import { cn } from "@/lib/utils";

export interface LapAnimation {
  from: Record<string, number>; // total race time per car at the start of the animated lap
  to: RaceState; // state at the end of the lap
  start: number; // performance.now() when the animation began
  duration: number; // ms
  pausedElapsed?: number | null; // set while paused mid-lap (ms already played)
}

/** 0..1 progress of the animated lap. */
export const animProgress = (anim: LapAnimation, now: number) =>
  Math.min(1, (anim.pausedElapsed ?? now - anim.start) / anim.duration);

/**
 * How much of its current lap each running car has covered (0..1, can be <0 while
 * still finishing the previous lap). Shared by the map and the live sector times.
 */
export function lapProgress(
  target: RaceState,
  anim: LapAnimation | null,
  now: number,
  prev?: RaceState | null,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(lapProgressDetailed(target, anim, now, prev))) out[id] = v.frac;
  return out;
}

/**
 * Same as lapProgress plus whether each car is in the pit lane. Cars still finishing the
 * previous lap (behind the leader) follow that lap's sectors and pit stop (`prev` state).
 */
export function lapProgressDetailed(
  target: RaceState,
  anim: LapAnimation | null,
  now: number,
  prev?: RaceState | null,
): Record<string, { frac: number; inPit: boolean; stopped?: boolean }> {
  const out: Record<string, { frac: number; inPit: boolean; stopped?: boolean }> = {};
  const running = target.cars.filter((c) => c.status === "running");
  const leaderTo = target.cars[0]?.total ?? 0;
  const leaderFrom = anim ? Math.min(...Object.values(anim.from)) : leaderTo - (target.cars[0]?.lastLap ?? 1);
  const p = anim ? animProgress(anim, now) : 1;
  const clock = leaderFrom + (leaderTo - leaderFrom) * p;
  const prevCars = prev ? new Map(prev.cars.map((c) => [c.id, c])) : null;
  for (const c of running) {
    const to = c.total;
    const from = anim?.from[c.id] ?? to - (c.lastLap || 1);
    const before = prevCars?.get(c.id);
    if (clock < from && before && before.lastLap) {
      // still on the previous lap: use its sectors and its pit stop
      const pFrom = from - before.lastLap;
      const f = sectorFraction(pFrom, from, before.lastSectors, clock, before.lastPitTime ?? 0) - 1;
      out[c.id] = { frac: f, inPit: inPitLane(f + 1, before.lastPitTime) };
    } else {
      const f = sectorFraction(from, to, c.lastSectors, clock, c.lastPitTime ?? 0);
      out[c.id] = { frac: f, inPit: inPitLane(f, c.lastPitTime) };
    }
  }
  // cars that retire on this lap keep going until the point where they stop
  if (anim && prevCars) {
    for (const c of target.cars) {
      if (c.status !== "dnf" || c.dnfLap !== target.lap || c.dnfAt == null) continue;
      const before = prevCars.get(c.id);
      if (!before || before.status !== "running") continue;
      const from = anim.from[c.id] ?? before.total;
      const f = Math.max(0, (clock - from) / Math.max(1, before.lastLap || 90));
      out[c.id] = f < c.dnfAt ? { frac: f, inPit: false } : { frac: c.dnfAt, inPit: false, stopped: true };
    }
  }
  return out;
}

interface Props {
  raceId: number;
  state: RaceState; // committed state (shown when not animating)
  anim: LapAnimation | null;
  playerTeamId: string | null;
}

interface Geometry {
  points: [number, number][];
  cum: number[];
  length: number;
}

function buildGeometry(points: [number, number][]): Geometry {
  const pts = [...points];
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) pts.push(first);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return { points: pts, cum, length: cum[cum.length - 1] };
}

function pointAt(g: Geometry, frac: number): [number, number] {
  const f = ((frac % 1) + 1) % 1;
  const d = f * g.length;
  let lo = 0;
  let hi = g.cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (g.cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const seg = g.cum[hi] - g.cum[lo] || 1;
  const t = (d - g.cum[lo]) / seg;
  const a = g.points[lo];
  const b = g.points[hi];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Lap fraction at race clock `t` following the car's own sector times: it reaches
 * each sector line (1/3, 2/3 of the lap) exactly when its sector time says so.
 */
export const PIT_ENTRY = 0.965; // lap fraction where the pit lane starts
export const PIT_BOX = 0.985; // where the car stops

function sectorFraction(from: number, to: number, sectors: number[] | undefined, t: number, pit = 0) {
  if (!sectors || sectors.length !== 3) return carFraction(from, to, t);
  const [s1, s2, s3] = sectors.map((x) => Math.max(0.05, x));
  const c1 = from + s1;
  const c2 = c1 + s2;
  if (t <= from) return (t - from) / (3 * s1); // still finishing the previous lap
  if (t <= c1) return (t - from) / (3 * s1);
  if (t <= c2) return 1 / 3 + (t - c1) / (3 * s2);
  if (pit <= 0) return 2 / 3 + (t - c2) / (3 * s3);
  // pit lap: race to the pit entry, then drive in, stop at the box, drive out
  const pitStart = to - pit;
  if (t <= pitStart) return 2 / 3 + ((t - c2) / Math.max(0.05, pitStart - c2)) * (PIT_ENTRY - 2 / 3);
  const u = Math.min(1, (t - pitStart) / pit);
  if (u < 0.2) return PIT_ENTRY + (PIT_BOX - PIT_ENTRY) * (u / 0.2);
  if (u < 0.8) return PIT_BOX; // stationary in the box
  return PIT_BOX + (1 - PIT_BOX) * ((u - 0.8) / 0.2);
}

/** Is the car in the pit lane at this lap fraction? */
export const inPitLane = (frac: number, pitTime: number | undefined) => !!pitTime && frac >= PIT_ENTRY && frac < 1;

/** Point shifted sideways (towards the inside of the circuit) — used for the pit lane. */
function pitLanePoint(g: Geometry, frac: number, centre: [number, number], d = 38): [number, number] {
  const [x, y] = pointAt(g, frac);
  const [x2, y2] = pointAt(g, frac + 0.002);
  let nx = -(y2 - y);
  let ny = x2 - x;
  const len = Math.hypot(nx, ny) || 1;
  nx /= len;
  ny /= len;
  // point the normal to the inside (towards the centre of the layout)
  if ((centre[0] - x) * nx + (centre[1] - y) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return [x + nx * d, y + ny * d];
}

/** Fraction of the lap each car has covered at race clock `t`. */
function carFraction(from: number, to: number, t: number) {
  const lap = Math.max(1, to - from);
  return (t - from) / lap; // can be <0 (still finishing previous lap) — wraps around the loop
}

export function TrackMap({ raceId, state, anim, playerTeamId }: Props) {
  const [now, setNow] = useState(() => performance.now());
  const raf = useRef<number>();

  useEffect(() => {
    if (!anim || anim.pausedElapsed != null) return;
    const tick = () => {
      setNow(performance.now());
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [anim]);

  const sc = (anim?.to ?? state).safetyCar.active;

  // Positions
  const target = anim ? anim.to : state;
  let markers: MapMarker[] = [];
  const mk = (car: CarState, frac: number, pos: number, inPit?: boolean, stopped?: boolean): MapMarker => ({
    id: car.id,
    hex: car.entry.team.hex,
    short: car.entry.driver.shortName,
    mine: car.entry.team.id === playerTeamId,
    frac,
    pos,
    inPit,
    stopped,
  });

  if (target.lap === 0 && !anim) {
    // on the grid, just behind the line
    markers = target.cars.map((c, i) => mk(c, -0.004 - i * 0.0035, i + 1));
  } else {
    const prog = lapProgressDetailed(target, anim, now, anim ? state : null);
    markers = target.cars
      .filter((c) => prog[c.id])
      .map((c) => mk(c, prog[c.id].frac, target.cars.indexOf(c) + 1, prog[c.id].inPit, prog[c.id].stopped));
    // live positions: who is ahead on track right now (not the order at the end of the lap)
    if (anim) [...markers].filter((m) => !m.stopped).sort((a, b) => b.frac - a.frac).forEach((m, i) => (m.pos = i + 1));
  }
  return <CircuitMap raceId={raceId} markers={markers} highlight={sc ? "SAFETY CAR" : undefined} />;
}

export interface MapMarker {
  id: string;
  hex: string;
  short: string;
  mine: boolean;
  frac: number;
  pos?: number; // shown in the label (and used to draw the leaders on top)
  inPit?: boolean;
  stopped?: boolean;
  tag?: string; // extra label text (e.g. "OUT", "VR")
  dim?: boolean; // not on a timed lap
  label?: boolean; // force the name label
}

/** The circuit with cars on it (shared by the race and the qualifying). */
export function CircuitMap({ raceId, markers: input, highlight }: { raceId: number; markers: MapMarker[]; highlight?: string }) {
  const shape = circuits[raceId];
  const geo = useMemo(() => (shape ? buildGeometry(shape.points) : null), [shape]);
  const [allLabels, setAllLabels] = useState(false);
  if (!shape || !geo) return null;

  const pad = 70;
  const vb = `${-pad} ${-pad} ${shape.width + pad * 2} ${shape.height + pad * 2}`;
  const pathD = "M" + geo.points.map((p) => `${p[0]},${p[1]}`).join("L") + "Z";
  const sc = highlight === "SAFETY CAR";
  const markers = [...input];
  const centre: [number, number] = [shape.width / 2, shape.height / 2];
  const laneSamples = Array.from({ length: 14 }, (_, i) => PIT_ENTRY - 0.01 + ((1.012 - PIT_ENTRY) * i) / 13);
  const laneD = "M" + laneSamples.map((f) => pitLanePoint(geo, f, centre).join(",")).join("L");
  const box = pitLanePoint(geo, PIT_BOX, centre);

  // draw back markers first so the leader is on top
  markers.sort((a, b) => (b.pos ?? 99) - (a.pos ?? 99));
  const [sx, sy] = geo.points[0];
  const [nx, ny] = geo.points[1];
  const ang = Math.atan2(ny - sy, nx - sx) + Math.PI / 2;
  const lineLen = 26;

  return (
    <div className="relative panel overflow-hidden">
      <svg viewBox={vb} className="w-full h-[260px] sm:h-[340px] lg:h-[400px]" preserveAspectRatio="xMidYMid meet">
        <path d={pathD} fill="none" stroke={sc ? "#facc15" : "hsl(var(--muted))"} strokeOpacity={sc ? 0.35 : 1} strokeWidth={34} strokeLinejoin="round" />
        <path d={pathD} fill="none" stroke="#2a2f3a" strokeWidth={22} strokeLinejoin="round" />
        <path d={pathD} fill="none" stroke="#3b4252" strokeWidth={2} strokeDasharray="14 14" strokeLinejoin="round" />
        {/* start / finish line */}
        <line
          x1={sx - Math.cos(ang) * lineLen}
          y1={sy - Math.sin(ang) * lineLen}
          x2={sx + Math.cos(ang) * lineLen}
          y2={sy + Math.sin(ang) * lineLen}
          stroke="white"
          strokeWidth={6}
          strokeDasharray="6 6"
        />
        {/* pit lane */}
        <path d={laneD} fill="none" stroke="#3b4252" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
        <text x={box[0] + 16} y={box[1] + 30} fontSize={20} fontFamily="Titillium Web, sans-serif" fontWeight={700} fill="#94a3b8">
          BOXES
        </text>
        {/* sector boundaries */}
        {[1 / 3, 2 / 3].map((f, i) => {
          const [x, y] = pointAt(geo, f);
          return (
            <g key={f} transform={`translate(${x},${y})`}>
              <circle r={9} fill="#facc15" />
              <text x={14} y={-12} fontSize={22} fontFamily="Titillium Web, sans-serif" fontWeight={700} fill="#facc15">
                S{i + 2}
              </text>
            </g>
          );
        })}
        <text x={sx + 14} y={sy - 30} fontSize={22} fontFamily="Titillium Web, sans-serif" fontWeight={700} fill="white">
          S1
        </text>
        {markers.map(({ id, hex, short, mine, frac, pos, inPit, stopped, tag, dim, label }) => {
          const inLane = !!inPit;
          const [x, y] = inLane ? pitLanePoint(geo, frac, centre) : pointAt(geo, frac);
          if (stopped)
            return (
              <g key={id} transform={`translate(${x},${y})`} opacity={0.75}>
                <circle r={mine ? 22 : 17} fill="#3f3f46" stroke={hex} strokeWidth={5} />
                <text x={0} y={8} textAnchor="middle" fontSize={22} fontWeight={800} fill="#f87171">✕</text>
                <g transform="translate(24,-22)">
                  <rect x={0} y={-24} width={108} height={34} rx={8} fill="#7f1d1d" fillOpacity={0.9} />
                  <text x={10} y={1} fontSize={24} fontFamily="Titillium Web, sans-serif" fontWeight={700} fill="white">
                    {short} OUT
                  </text>
                </g>
              </g>
            );
          const showLabel = allLabels || mine || label || (pos ?? 99) <= 3;
          const text = `${pos != null ? `${pos} ` : ""}${short}${tag ? ` ${tag}` : ""}`;
          return (
            <g key={id} transform={`translate(${x},${y})`} opacity={dim ? 0.55 : 1}>
              <circle r={mine ? 22 : 17} fill={hex} stroke={mine ? "white" : "#0b0d12"} strokeWidth={mine ? 6 : 4} />
              {showLabel && (
                <g transform="translate(24,-22)">
                  <rect x={0} y={-24} width={22 + text.length * 12.5} height={34} rx={8} fill="#0b0d12" fillOpacity={0.85} />
                  <text x={10} y={1} fontSize={24} fontFamily="Titillium Web, sans-serif" fontWeight={700} fill={mine ? "white" : "#cbd5e1"}>
                    {text}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <button
        onClick={() => setAllLabels((v) => !v)}
        className="absolute top-2 right-2 rounded border border-border bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
      >
        {allLabels ? "Ocultar nombres" : "Ver todos los nombres"}
      </button>
      {highlight && (
        <div className={cn("absolute top-2 left-2 rounded text-[11px] font-racing px-2 py-0.5", sc ? "bg-yellow-400 text-black" : "bg-white/90 text-black")}>{highlight}</div>
      )}
    </div>
  );
}
