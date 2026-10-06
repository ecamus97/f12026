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

/** Generic top-view single-seater painted in the team colour (original drawing, not any real car). */
export function CarSilhouette({ color, className, accent = "#0d0f14" }: { color: string; className?: string; accent?: string }) {
  const id = useId().replace(/[^a-z0-9]/gi, "");
  const body = `body-${id}`;
  const tyre = `tyre-${id}`;
  const gloss = `gloss-${id}`;
  return (
    <svg viewBox="0 0 440 150" className={className} aria-hidden>
      <defs>
        {/* roundness: darker at the sides, lit along the centre line */}
        <linearGradient id={body} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.55" />
          <stop offset="0.42" stopColor={color} />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.58" stopColor={color} />
          <stop offset="1" stopColor={color} stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id={tyre} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#050608" />
          <stop offset="0.5" stopColor="#24272e" />
          <stop offset="1" stopColor="#050608" />
        </linearGradient>
        <linearGradient id={gloss} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* shadow */}
      <ellipse cx="220" cy="80" rx="205" ry="62" fill="#000" opacity="0.35" />

      {/* suspension */}
      <g stroke="#9aa0ab" strokeWidth="2" opacity="0.8">
        <line x1="96" y1="66" x2="112" y2="32" />
        <line x1="120" y1="64" x2="104" y2="32" />
        <line x1="96" y1="84" x2="112" y2="118" />
        <line x1="120" y1="86" x2="104" y2="118" />
        <line x1="318" y1="62" x2="344" y2="30" />
        <line x1="318" y1="88" x2="344" y2="120" />
      </g>

      {/* tyres */}
      <rect x="82" y="12" width="50" height="28" rx="8" fill={`url(#${tyre})`} />
      <rect x="82" y="110" width="50" height="28" rx="8" fill={`url(#${tyre})`} />
      <rect x="316" y="6" width="58" height="34" rx="9" fill={`url(#${tyre})`} />
      <rect x="316" y="110" width="58" height="34" rx="9" fill={`url(#${tyre})`} />
      {/* compound marking */}
      <rect x="88" y="13.5" width="38" height="2.5" rx="1.2" fill="#facc15" opacity="0.9" />
      <rect x="88" y="134" width="38" height="2.5" rx="1.2" fill="#facc15" opacity="0.9" />
      <rect x="323" y="7.5" width="44" height="2.5" rx="1.2" fill="#facc15" opacity="0.9" />
      <rect x="323" y="140" width="44" height="2.5" rx="1.2" fill="#facc15" opacity="0.9" />

      {/* floor */}
      <path d="M150 34 C200 24 290 22 336 34 L344 60 L344 90 L336 116 C290 128 200 126 150 116 C140 100 140 50 150 34 Z" fill={accent} />
      <path d="M150 34 C200 24 290 22 336 34" fill="none" stroke="#3b3f49" strokeWidth="1.5" />
      <path d="M150 116 C200 126 290 128 336 116" fill="none" stroke="#3b3f49" strokeWidth="1.5" />

      {/* front wing: three elements with endplates */}
      <path d="M14 20 C26 18 46 20 58 26 L58 124 C46 130 26 132 14 130 Z" fill={accent} />
      <path d="M20 24 C34 23 46 26 54 30 L54 120 C46 124 34 127 20 126 Z" fill={`url(#${body})`} />
      <path d="M30 26 L30 124" stroke={accent} strokeWidth="2.5" />
      <path d="M41 28 L41 122" stroke={accent} strokeWidth="2" />
      <rect x="10" y="16" width="26" height="6" rx="2" fill={accent} />
      <rect x="10" y="128" width="26" height="6" rx="2" fill={accent} />

      {/* nose and monocoque */}
      <path d="M44 70 C62 66 110 61 160 56 L240 52 L240 98 L160 94 C110 89 62 84 44 80 C38 78 38 72 44 70 Z" fill={`url(#${body})`} />

      {/* sidepods with a coke-bottle rear */}
      <path d="M176 36 C200 28 246 28 270 36 C292 44 312 58 334 64 L334 86 C312 92 292 106 270 114 C246 122 200 122 176 114 C168 100 168 50 176 36 Z" fill={`url(#${body})`} />
      {/* sidepod inlets */}
      <path d="M176 36 C182 34 190 34 196 36 L192 46 C186 45 180 45 176 46 Z" fill={accent} />
      <path d="M176 114 C182 116 190 116 196 114 L192 104 C186 105 180 105 176 104 Z" fill={accent} />

      {/* engine cover + shark fin */}
      <path d="M232 62 C270 62 320 68 380 72 L380 78 C320 82 270 88 232 88 Z" fill={`url(#${body})`} />
      <path d="M244 75 L384 75" stroke={accent} strokeWidth="3" />
      {/* livery: dark accent sweep + pinstripe */}
      <path d="M150 58 C190 54 230 50 270 44 L268 50 C230 56 190 60 152 63 Z" fill={accent} opacity="0.85" />
      <path d="M150 92 C190 96 230 100 270 106 L268 100 C230 94 190 90 152 87 Z" fill={accent} opacity="0.85" />
      <path d="M60 75 L232 75" stroke="#fff" strokeWidth="1" opacity="0.45" />

      {/* cockpit, driver helmet and halo */}
      <path d="M186 62 C196 58 222 58 232 62 L232 88 C222 92 196 92 186 88 Z" fill={accent} />
      <circle cx="214" cy="75" r="8.5" fill="#f3f4f6" />
      <rect x="208" y="71.5" width="7" height="7" rx="2" fill={color} opacity="0.85" />
      <path d="M180 75 C186 60 214 56 232 60 M180 75 C186 90 214 94 232 90" fill="none" stroke="#c9ccd3" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M180 75 L196 75" stroke="#c9ccd3" strokeWidth="3.5" strokeLinecap="round" />

      {/* rear wing + beam wing */}
      <rect x="360" y="64" width="26" height="22" rx="3" fill={accent} />
      <path d="M384 22 L426 22 C430 22 432 26 432 30 L432 120 C432 124 430 128 426 128 L384 128 Z" fill={accent} />
      <path d="M390 28 L424 28 L424 122 L390 122 Z" fill={`url(#${body})`} />
      <path d="M402 28 L402 122" stroke={accent} strokeWidth="2.5" />
      <rect x="380" y="18" width="50" height="5" rx="2" fill={accent} />
      <rect x="380" y="127" width="50" height="5" rx="2" fill={accent} />

      {/* specular highlight */}
      <path d="M60 72 C120 66 200 60 300 64 L300 70 C200 66 120 72 60 77 Z" fill={`url(#${gloss})`} />
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
