// Visual building blocks of the game UI (car silhouettes, circuit outlines, headings, tiles).
import { useId, type CSSProperties, type ReactNode } from "react";
import { circuits } from "@/data/circuits";
import { cn } from "@/lib/utils";

/** "#ff8000" -> "30 100% 50%" (for CSS hsl() variables). */
export function hexToHslVar(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let hue = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    hue = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hue *= 60;
  }
  return { h: Math.round(hue), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** CSS variables that paint the whole UI with the team's colour. */
export function teamThemeVars(hex: string): CSSProperties {
  const { h, s, l } = hexToHslVar(hex);
  // keep the accent readable on a dark background
  const L = Math.max(42, Math.min(62, l));
  const S = s < 15 ? 8 : Math.max(55, s);
  const light = L >= 58 || (h >= 40 && h <= 70);
  return {
    ["--primary" as string]: `${h} ${S}% ${L}%`,
    ["--ring" as string]: `${h} ${S}% ${L}%`,
    ["--primary-foreground" as string]: light ? "220 20% 8%" : "0 0% 100%",
    ["--team" as string]: hex,
    ["--gradient-primary" as string]: `linear-gradient(135deg, hsl(${h} ${S}% ${L + 6}%) 0%, hsl(${h} ${S}% ${Math.max(30, L - 14)}%) 100%)`,
    ["--shadow-glow" as string]: `0 0 48px hsl(${h} ${S}% ${L}% / 0.28)`,
  };
}

/** Generic top-view single-seater painted in the team colour (original drawing). */
export function CarSilhouette({ color, className, accent = "#0b0d12" }: { color: string; className?: string; accent?: string }) {
  const gid = `body-${useId().replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox="0 0 400 140" className={className} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="1" />
          <stop offset="0.5" stopColor={color} stopOpacity="0.85" />
          <stop offset="1" stopColor={color} stopOpacity="0.6" />
        </linearGradient>
      </defs>
      {/* wheels */}
      {[
        [62, 12, 46, 24], [62, 104, 46, 24], [290, 8, 56, 28], [290, 104, 56, 28],
      ].map(([x, y, w, h], i) => (
        <g key={i}>
          <rect x={x} y={y} width={w} height={h} rx={7} fill="#16181d" stroke="#3b3f49" strokeWidth={1.5} />
          <rect x={x + 4} y={i % 2 ? y + 3 : y + h - 6} width={w - 8} height={3} rx={1.5} fill="#facc15" opacity={0.85} />
        </g>
      ))}
      {/* front wing */}
      <path d="M8 22 L30 22 L36 118 L8 118 Z" fill={accent} />
      <path d="M14 26 L44 30 L48 110 L14 114 Z" fill={`url(#${gid})`} />
      {/* nose + chassis */}
      <path d="M40 62 C80 56 120 52 160 50 L250 46 C270 46 290 48 300 52 L300 88 C290 92 270 94 250 94 L160 90 C120 88 80 84 40 78 Z" fill={`url(#${gid})`} />
      {/* sidepods */}
      <path d="M170 34 C200 26 250 26 286 36 L300 52 L300 88 L286 104 C250 114 200 114 170 106 C160 96 158 44 170 34 Z" fill={`url(#${gid})`} />
      {/* floor edge */}
      <path d="M150 30 L310 26 L310 30 L150 34 Z M150 106 L310 110 L310 114 L150 110 Z" fill={accent} opacity="0.9" />
      {/* cockpit + halo */}
      <ellipse cx="205" cy="70" rx="26" ry="12" fill={accent} />
      <path d="M180 70 C185 56 225 56 232 70 C225 84 185 84 180 70" fill="none" stroke="#c9ccd3" strokeWidth={3} />
      {/* engine cover stripe */}
      <path d="M232 64 L330 66 L330 74 L232 76 Z" fill="#fff" opacity="0.25" />
      {/* rear wing */}
      <path d="M346 18 L382 18 L382 122 L346 122 Z" fill={accent} />
      <path d="M352 24 L376 24 L376 116 L352 116 Z" fill={`url(#${gid})`} />
      <rect x="320" y="60" width="30" height="20" fill={accent} />
    </svg>
  );
}

/** Circuit outline as a small decorative SVG. */
export function CircuitOutline({ raceId, className, stroke = "currentColor", width = 10 }: { raceId: number; className?: string; stroke?: string; width?: number }) {
  const c = circuits[raceId];
  if (!c) return null;
  const d = c.points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") + " Z";
  return (
    <svg viewBox={`-30 -30 ${c.width + 60} ${c.height + 60}`} className={className} aria-hidden>
      <path d={d} fill="none" stroke={stroke} strokeWidth={width * 2.4} strokeLinejoin="round" opacity={0.18} />
      <path d={d} fill="none" stroke={stroke} strokeWidth={width} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Slanted section heading in the style of a TV graphic. */
export function SectionTitle({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <h3 className="flex items-center gap-2 font-display text-lg md:text-xl">
        <span className="inline-block h-5 w-2 -skew-x-12 bg-primary" />
        {children}
      </h3>
      {right && <div className="text-xs text-muted-foreground">{right}</div>}
    </div>
  );
}

/** Big number tile. */
export function StatTile({
  label, value, sub, tone, icon,
}: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad"; icon?: ReactNode }) {
  return (
    <div className="panel p-3 md:p-4 relative overflow-hidden">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {icon} {label}
      </div>
      <div className={cn("font-display text-2xl md:text-3xl mt-1 tabular-nums", tone === "bad" && "text-red-400", tone === "good" && "text-emerald-400")}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

/** Driver number in the team colour, outlined like on the car. */
export function DriverNumber({ n, color, className }: { n: number; color: string; className?: string }) {
  return (
    <span
      className={cn("font-display italic leading-none tabular-nums", className)}
      style={{ color: "transparent", WebkitTextStroke: `2px ${color}` }}
    >
      {n}
    </span>
  );
}
