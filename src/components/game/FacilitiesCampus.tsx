import { useState } from "react";
import { motion } from "framer-motion";
import { Hammer, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AREA_INFO, FACILITY_INFO, MAX_FACILITY_LEVEL, PROJECTS, canUpgradeFacility, expectedGain, facilityBuildRaces, facilityLevelEffects,
  facilityUpgradeCost, facilityMult, successChance,
  type DevArea, type FacilityKey, type ManagementState,
} from "@/engine";
import { cn } from "@/lib/utils";

const T = 30; // px per ground unit
const C = 0.866;

/** Isometric projection of a ground point (x, y) at height z. */
const iso = (x: number, y: number, z = 0): [number, number] => [(x - y) * T * C, (x + y) * T * 0.5 - z * T];
const pts = (list: [number, number][]) => list.map((p) => p.join(",")).join(" ");

interface Building {
  key: FacilityKey;
  x: number;
  y: number;
  w: number;
  d: number;
  icon: string;
}

const BUILDINGS: Building[] = [
  { key: "factory", x: 1, y: 1, w: 4, d: 3, icon: "🏭" },
  { key: "windTunnel", x: 7, y: 1, w: 4, d: 2, icon: "🌀" },
  { key: "dyno", x: 7, y: 5, w: 3, d: 2, icon: "⚡" },
  { key: "reliabilityLab", x: 1, y: 6, w: 2.5, d: 2, icon: "🔬" },
  { key: "pitTraining", x: 4.5, y: 8.5, w: 4, d: 1.6, icon: "🛞" },
];

const AREA_OF: Record<FacilityKey, DevArea> = {
  windTunnel: "aero",
  dyno: "powerUnit",
  factory: "chassis",
  reliabilityLab: "reliability",
  pitTraining: "pitCrew",
};

function Box({
  b, h, color, selected, building, onClick,
}: { b: Building; h: number; color: string; selected: boolean; building: boolean; onClick: () => void }) {
  const { x, y, w, d } = b;
  const top = [iso(x, y, h), iso(x + w, y, h), iso(x + w, y + d, h), iso(x, y + d, h)];
  const left = [iso(x, y + d, 0), iso(x + w, y + d, 0), iso(x + w, y + d, h), iso(x, y + d, h)];
  const right = [iso(x + w, y, 0), iso(x + w, y + d, 0), iso(x + w, y + d, h), iso(x + w, y, h)];
  const floors = Math.max(1, Math.round(h / 0.5));
  return (
    <g onClick={onClick} className="cursor-pointer" style={{ filter: selected ? `drop-shadow(0 0 12px ${color})` : undefined }}>
      <polygon points={pts(left)} fill="#323a4a" stroke="#0b0d12" strokeWidth={1} />
      <polygon points={pts(right)} fill="#252b37" stroke="#0b0d12" strokeWidth={1} />
      {/* windows: one row per floor */}
      {Array.from({ length: floors }, (_, i) => {
        const z = (i + 0.35) * (h / floors);
        const a = iso(x + 0.25, y + d, z);
        const c = iso(x + w - 0.25, y + d, z);
        return <line key={i} x1={a[0]} y1={a[1]} x2={c[0]} y2={c[1]} stroke={building ? "#f59e0b" : "#93c5fd"} strokeOpacity={0.55} strokeWidth={3} strokeDasharray="6 5" />;
      })}
      <polygon points={pts(top)} fill="#46506380" stroke={selected ? color : "#3b4252"} strokeWidth={selected ? 2.5 : 1} />
      {/* team-coloured roof strip */}
      <polygon points={pts([iso(x, y, h), iso(x + w, y, h), iso(x + w, y + 0.35, h), iso(x, y + 0.35, h)])} fill={color} opacity={0.9} />
    </g>
  );
}

function Crane({ b, h }: { b: Building; h: number }) {
  const [bx, by] = iso(b.x + b.w - 0.4, b.y + 0.4, 0);
  const [tx, ty] = iso(b.x + b.w - 0.4, b.y + 0.4, h + 2.2);
  return (
    <g>
      <line x1={bx} y1={by} x2={tx} y2={ty} stroke="#facc15" strokeWidth={3} />
      <motion.g
        style={{ originX: `${tx}px`, originY: `${ty}px` }}
        animate={{ rotate: [-12, 12, -12] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      >
        <line x1={tx - 40} y1={ty} x2={tx + 70} y2={ty} stroke="#facc15" strokeWidth={3} />
        <line x1={tx + 55} y1={ty} x2={tx + 55} y2={ty + 28} stroke="#facc15" strokeWidth={1.2} />
        <rect x={tx + 49} y={ty + 28} width={12} height={8} fill="#f59e0b" />
      </motion.g>
    </g>
  );
}

export function FacilitiesCampus({
  management, teamColor, onUpgrade,
}: { management: ManagementState; teamColor: string; onUpgrade: (k: FacilityKey) => void }) {
  const p = management.player!;
  const [sel, setSel] = useState<FacilityKey>(p.facilityWork?.key ?? "factory");
  const work = p.facilityWork;
  const heightOf = (k: FacilityKey) => 0.4 + p.facilities[k] * 0.42;

  // ground
  const g = [iso(-0.5, -0.5), iso(12.5, -0.5), iso(12.5, 11), iso(-0.5, 11)];
  const order = [...BUILDINGS].sort((a, b) => a.x + a.y - (b.x + b.y)); // paint back to front
  const selB = BUILDINGS.find((b) => b.key === sel)!;
  const lvl = p.facilities[sel];
  const blocked = canUpgradeFacility(management, sel);
  const area = AREA_OF[sel];

  return (
    <div className="grid xl:grid-cols-[1.5fr_1fr] gap-4">
      <div className="panel overflow-hidden relative">
        <div className="absolute left-4 top-3 z-10">
          <div className="tv-label text-muted-foreground">Sede del equipo</div>
          <div className="font-display text-xl">Toca un edificio</div>
        </div>
        <svg viewBox="-330 -70 690 440" className="w-full h-auto">
          <defs>
            <radialGradient id="campus-glow" cx="50%" cy="40%" r="60%">
              <stop offset="0" stopColor={teamColor} stopOpacity="0.18" />
              <stop offset="1" stopColor={teamColor} stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x={-330} y={-70} width={690} height={440} fill="url(#campus-glow)" />
          <polygon points={pts(g)} fill="#171c25" stroke="#2c3443" strokeWidth={2} />
          {/* lawn */}
          <polygon points={pts([iso(0, 5.6), iso(5.2, 5.6), iso(5.2, 8.2), iso(0, 8.2)])} fill="#15301f" opacity={0.6} />
          {/* roads */}
          <polygon points={pts([iso(5.6, -0.5), iso(6.4, -0.5), iso(6.4, 11), iso(5.6, 11)])} fill="#222834" />
          <polygon points={pts([iso(-0.5, 4.6), iso(12.5, 4.6), iso(12.5, 5.2), iso(-0.5, 5.2)])} fill="#222834" />
          {/* trees */}
          {[
            [11.5, 8], [11.8, 9.8], [0.2, 9.8], [3.8, 4.9], [10.8, 4], [0, 4.2],
          ].map(([x, y], i) => {
            const [cx, cy] = iso(x, y, 0.6);
            return <circle key={i} cx={cx} cy={cy} r={9} fill="#14532d" stroke="#166534" />;
          })}
          {order.map((b) => {
            const h = heightOf(b.key);
            const [lx, ly] = iso(b.x + b.w / 2, b.y + b.d / 2, h + 0.9);
            const isWork = work?.key === b.key;
            return (
              <g key={b.key}>
                {isWork && (
                  <polygon
                    points={pts([iso(b.x, b.y, h + 0.55), iso(b.x + b.w, b.y, h + 0.55), iso(b.x + b.w, b.y + b.d, h + 0.55), iso(b.x, b.y + b.d, h + 0.55)])}
                    fill="none"
                    stroke="#f59e0b"
                    strokeDasharray="6 5"
                    strokeWidth={2}
                  />
                )}
                <Box b={b} h={h} color={teamColor} selected={sel === b.key} building={isWork} onClick={() => setSel(b.key)} />
                {isWork && <Crane b={b} h={h} />}
                <g onClick={() => setSel(b.key)} className="cursor-pointer">
                  <rect x={lx - 34} y={ly - 15} width={68} height={22} rx={6} fill="#0b0d12" stroke={sel === b.key ? teamColor : "#3b4252"} />
                  <text x={lx} y={ly + 1} textAnchor="middle" fontSize={12} fill="#e5e7eb" fontFamily="Titillium Web, sans-serif" fontWeight={700}>
                    {b.icon} Nv {p.facilities[b.key]}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      <motion.div key={sel} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="panel panel-accent p-5 space-y-4">
        <div>
          <div className="tv-label text-muted-foreground">{selB.icon} Instalación</div>
          <div className="font-display text-3xl">{FACILITY_INFO[sel].label}</div>
          <p className="text-sm text-muted-foreground mt-1">{FACILITY_INFO[sel].desc}</p>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: MAX_FACILITY_LEVEL }, (_, i) => (
            <div key={i} className={cn("h-3 flex-1 rounded-sm", i < lvl ? "bg-primary" : work?.key === sel && i === lvl ? "bg-amber-500 animate-pulse" : "bg-white/10")} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-black/30 border border-white/5 p-2">
            <div className="tv-label text-muted-foreground !text-[9px]">Nivel</div>
            <div className="font-display text-2xl">
              {lvl}/{MAX_FACILITY_LEVEL}
            </div>
          </div>
          <div className="rounded-lg bg-black/30 border border-white/5 p-2">
            <div className="tv-label text-muted-foreground !text-[9px]">Mejoras de {AREA_INFO[area].label.toLowerCase()}</div>
            <div className="font-display text-2xl">×{facilityMult(lvl).toFixed(1)}</div>
          </div>
        </div>
        {work?.key === sel ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Hammer className="w-4 h-4 text-amber-400" /> En construcción: nivel {lvl + 1}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" /> Faltan {work.racesLeft} carrera{work.racesLeft === 1 ? "" : "s"} de {facilityBuildRaces(lvl)}
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-amber-500" style={{ width: `${((facilityBuildRaces(lvl) - work.racesLeft) / facilityBuildRaces(lvl)) * 100}%` }} />
            </div>
          </div>
        ) : lvl >= MAX_FACILITY_LEVEL ? (
          <div className="text-sm text-emerald-400">Nivel máximo alcanzado.</div>
        ) : (
          <div className="space-y-2">
            <div className="text-sm">
              Nivel {lvl + 1}: <b>US$ {facilityUpgradeCost(lvl).toFixed(1)} M</b> · {facilityBuildRaces(lvl)} carreras · luego ×{facilityMult(lvl + 1).toFixed(1)}
            </div>
            <Button className="w-full font-display" disabled={!!blocked} onClick={() => onUpgrade(sel)}>
              {blocked ?? `Construir nivel ${lvl + 1}`}
            </Button>
          </div>
        )}
        <LevelTable management={management} fkey={sel} level={lvl} />
        <p className="text-[11px] text-muted-foreground">Una obra a la vez; si no termina, sigue en la temporada siguiente.</p>
      </motion.div>
    </div>
  );
}

const pctTxt = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;

/** Benefits per level, and what the next level would change on a real project of the area. */
function LevelTable({ management, fkey, level }: { management: ManagementState; fkey: FacilityKey; level: number }) {
  const area = AREA_OF[fkey];
  const p = management.player!;
  const withLevel = (l: number): ManagementState => ({ ...management, player: { ...p, facilities: { ...p.facilities, [fkey]: l } } });
  // a typical project of the area: the cheapest one, so the example is one you can actually afford
  const sample = PROJECTS.filter((t) => t.area === area).sort((a, b) => a.cost - b.cost)[0];
  const next = Math.min(MAX_FACILITY_LEVEL, level + 1);
  const gNow = sample ? expectedGain(sample, management) : null;
  const gNext = sample ? expectedGain(sample, withLevel(next)) : null;
  const sNow = sample ? successChance(sample, management) : 0;
  const sNext = sample ? successChance(sample, withLevel(next)) : 0;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-white/10 overflow-hidden text-xs">
        <div className="grid grid-cols-[44px_1fr_1fr_1.4fr] gap-2 px-2 py-1.5 bg-black/30 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>Nivel</span>
          <span>Mejora</span>
          <span>Éxito</span>
          <span>Extra</span>
        </div>
        {Array.from({ length: MAX_FACILITY_LEVEL }, (_, i) => i + 1).map((l) => {
          const fx = facilityLevelEffects(fkey, l);
          const cur = l === level;
          const nxt = l === level + 1;
          return (
            <div
              key={l}
              className={cn(
                "grid grid-cols-[44px_1fr_1fr_1.4fr] gap-2 px-2 py-1.5 border-t border-white/5 items-center",
                cur && "bg-primary/15",
                nxt && "bg-amber-500/10",
                l < level && "text-muted-foreground",
              )}
            >
              <span className="font-display">
                {l}
                {cur && <span className="ml-1 text-[9px] text-primary">actual</span>}
                {nxt && <span className="ml-1 text-[9px] text-amber-300">sig.</span>}
              </span>
              <span className={cn("font-mono", fx.gain > 1.001 ? "text-green-400" : fx.gain < 0.999 ? "text-red-400" : "")}>{pctTxt(+(fx.gain - 1).toFixed(2))}</span>
              <span className={cn("font-mono", fx.success > 0 ? "text-green-400" : fx.success < 0 ? "text-red-400" : "")}>{pctTxt(fx.success)}</span>
              <span className="text-[11px]">{fx.extras.length ? fx.extras.join(" · ") : "—"}</span>
            </div>
          );
        })}
      </div>
      {sample && gNow && gNext && level < MAX_FACILITY_LEVEL && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Ejemplo: {sample.name}</div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Mejora esperada</span>
            <span className="font-mono">
              +{gNow[0].toFixed(1)}–{gNow[1].toFixed(1)} → <b className="text-amber-300">+{gNext[0].toFixed(1)}–{gNext[1].toFixed(1)}</b>
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Probabilidad de éxito</span>
            <span className="font-mono">
              {Math.round(sNow * 100)}% → <b className="text-amber-300">{Math.round(sNext * 100)}%</b>
            </span>
          </div>
          {facilityLevelEffects(fkey, next).extras.length > facilityLevelEffects(fkey, level).extras.length && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Además</span>
              <span className="text-amber-300">{facilityLevelEffects(fkey, next).extras.slice(-1)[0]}</span>
            </div>
          )}
          <div className="text-[10px] text-muted-foreground">Vale para todos los proyectos de {AREA_INFO[area].label.toLowerCase()} desde que termina la obra.</div>
        </div>
      )}
    </div>
  );
}
