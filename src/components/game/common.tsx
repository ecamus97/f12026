import { COMPOUNDS, type Compound } from "@/engine";
import { cn } from "@/lib/utils";

export function TeamStripe({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block w-1 rounded-full shrink-0", className ?? "h-5")} style={{ backgroundColor: color }} />;
}

export function TyreBadge({ compound, age, className }: { compound: Compound; age?: number; className?: string }) {
  const c = COMPOUNDS[compound];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-mono", className)} title={`${c.name}${age !== undefined ? ` · ${age} vueltas` : ""}`}>
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-full border-2 bg-background text-[10px] font-bold"
        style={{ borderColor: c.color, color: c.color }}
      >
        {compound}
      </span>
      {age !== undefined && <span className="text-muted-foreground w-7">{age}v</span>}
    </span>
  );
}

export function PositionBadge({ pos, className }: { pos: number; className?: string }) {
  const medal =
    pos === 1
      ? "bg-gradient-to-br from-yellow-300 to-yellow-600 text-background"
      : pos === 2
        ? "bg-gradient-to-br from-gray-200 to-gray-500 text-background"
        : pos === 3
          ? "bg-gradient-to-br from-amber-500 to-amber-800 text-white"
          : "bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex w-7 h-7 shrink-0 rounded-md items-center justify-center font-racing text-xs font-bold", medal, className)}>
      {pos}
    </span>
  );
}

export function StatBar({ label, value, color }: { label: string; value: number; color?: string }) {
  // ratings live roughly in 75-100; stretch that range for readability
  const pct = Math.max(4, Math.min(100, ((value - 70) / 30) * 100));
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-muted-foreground">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color ?? "hsl(var(--primary))" }} />
      </div>
      <span className="w-6 text-right font-mono">{value}</span>
    </div>
  );
}

/** Subtle row highlight tinted with the player's team colour. */
export const mineStyle = (hex: string | undefined) =>
  hex ? { backgroundColor: `${hex}1f`, boxShadow: `inset 3px 0 0 ${hex}` } : undefined;
