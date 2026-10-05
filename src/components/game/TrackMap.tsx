import { useEffect, useMemo, useRef, useState } from "react";
import { circuits } from "@/data/circuits";
import type { CarState, RaceState } from "@/engine";

export interface LapAnimation {
  from: Record<string, number>; // total race time per car at the start of the animated lap
  to: RaceState; // state at the end of the lap
  start: number; // performance.now() when the animation began
  duration: number; // ms
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

/** Fraction of the lap each car has covered at race clock `t`. */
function carFraction(from: number, to: number, t: number) {
  const lap = Math.max(1, to - from);
  return (t - from) / lap; // can be <0 (still finishing previous lap) — wraps around the loop
}

export function TrackMap({ raceId, state, anim, playerTeamId }: Props) {
  const shape = circuits[raceId];
  const geo = useMemo(() => (shape ? buildGeometry(shape.points) : null), [shape]);
  const [now, setNow] = useState(() => performance.now());
  const [allLabels, setAllLabels] = useState(false);
  const raf = useRef<number>();

  useEffect(() => {
    if (!anim) return;
    const tick = () => {
      setNow(performance.now());
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [anim]);

  if (!shape || !geo) return null;

  const pad = 70;
  const vb = `${-pad} ${-pad} ${shape.width + pad * 2} ${shape.height + pad * 2}`;
  const pathD = "M" + geo.points.map((p) => `${p[0]},${p[1]}`).join("L") + "Z";
  const sc = (anim?.to ?? state).safetyCar.active;

  // Positions
  const target = anim ? anim.to : state;
  const running = target.cars.filter((c) => c.status === "running" || (anim && anim.from[c.id] !== undefined && c.dnfLap === target.lap));
  let markers: { car: CarState; frac: number; pos: number }[] = [];

  if (target.lap === 0 && !anim) {
    // on the grid, just behind the line
    markers = target.cars.map((c, i) => ({ car: c, frac: -0.004 - i * 0.0035, pos: i + 1 }));
  } else {
    const leaderTo = target.cars[0]?.total ?? 0;
    const leaderFrom = anim ? Math.min(...Object.values(anim.from)) : leaderTo - (target.cars[0]?.lastLap ?? 1);
    const p = anim ? Math.min(1, (now - anim.start) / anim.duration) : 1;
    const clock = leaderFrom + (leaderTo - leaderFrom) * p;
    markers = running.map((c) => {
      const to = c.total;
      const from = anim?.from[c.id] ?? to - (c.lastLap || 1);
      let frac = carFraction(from, to, clock);
      if (c.status === "dnf") frac = Math.min(frac, 0.5); // stops on track
      return { car: c, frac, pos: target.cars.indexOf(c) + 1 };
    });
  }

  // draw back markers first so the leader is on top
  markers.sort((a, b) => b.pos - a.pos);
  const [sx, sy] = geo.points[0];
  const [nx, ny] = geo.points[1];
  const ang = Math.atan2(ny - sy, nx - sx) + Math.PI / 2;
  const lineLen = 26;

  return (
    <div className="relative rounded-xl border border-border bg-card overflow-hidden">
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
        {markers.map(({ car, frac, pos }) => {
          const [x, y] = pointAt(geo, frac);
          const mine = car.entry.team.id === playerTeamId;
          const showLabel = allLabels || mine || pos <= 3;
          const dnf = car.status === "dnf";
          return (
            <g key={car.id} transform={`translate(${x},${y})`} opacity={dnf ? 0.35 : 1}>
              <circle r={mine ? 22 : 17} fill={car.entry.team.hex} stroke={mine ? "white" : "#0b0d12"} strokeWidth={mine ? 6 : 4} />
              {showLabel && (
                <g transform="translate(24,-22)">
                  <rect x={0} y={-24} width={pos >= 10 ? 112 : 98} height={34} rx={8} fill="#0b0d12" fillOpacity={0.85} />
                  <text x={10} y={1} fontSize={24} fontFamily="Orbitron, sans-serif" fill={mine ? "white" : "#cbd5e1"}>
                    {pos} {car.entry.driver.shortName}
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
      {sc && (
        <div className="absolute top-2 left-2 rounded bg-yellow-400 text-black text-[11px] font-racing px-2 py-0.5">SAFETY CAR</div>
      )}
    </div>
  );
}
