import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { races2026, type Team } from "@/data/f1Data";
import { calendar } from "@/data/calendar";
import { AREA_INFO, carPace, type CarDev, type DevArea, type ManagementState } from "@/engine";
import { cn } from "@/lib/utils";

export type Metric = DevArea | "pace";

export const METRIC_LABEL: Record<Metric, string> = {
  pace: "Ritmo general del auto",
  aero: AREA_INFO.aero.label,
  powerUnit: AREA_INFO.powerUnit.label,
  chassis: AREA_INFO.chassis.label,
  reliability: AREA_INFO.reliability.label,
  pitCrew: AREA_INFO.pitCrew.label,
};

const value = (d: CarDev, metric: Metric) => (metric === "pace" ? carPace(d) : d[metric]);

interface Props {
  management: ManagementState;
  teams: Team[];
  playerTeamId: string;
  metric: Metric;
  onMetric: (m: Metric) => void;
}

export function PerformanceChart({ management, teams, playerTeamId, metric, onMetric }: Props) {
  const [focus, setFocus] = useState<string | null>(null);
  const history = management.history ?? [];

  // the whole season is always on the x-axis; future rounds stay empty
  const data = useMemo(() => {
    const byRound = new Map(history.map((h) => [h.round, h]));
    const first = byRound.has(-1) ? -1 : 0;
    return Array.from({ length: calendar().length + 1 - first }, (_, i) => {
      const r = i + first;
      const row: Record<string, number | string> = { label: r === -1 ? "Año ant." : r === 0 ? "Inicio" : `R${r}` };
      const h = byRound.get(r);
      if (h) for (const t of teams) if (h.dev[t.id]) row[t.id] = +value(h.dev[t.id], metric).toFixed(2);
      return row;
    });
  }, [history, teams, metric]);
  const fewPoints = history.length < 4;

  const latest = history[history.length - 1];
  const ordered = useMemo(
    () => (latest ? [...teams].sort((a, b) => value(latest.dev[b.id], metric) - value(latest.dev[a.id], metric)) : teams),
    [latest, teams, metric],
  );

  const highlighted = focus ?? playerTeamId;
  const nameOf = (id: string) => teams.find((t) => t.id === id)?.name ?? id;

  return (
    <div className="panel p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-lg">{METRIC_LABEL[metric]}</h3>
          <p className="text-[11px] text-muted-foreground">Evolución de todas las escuderías carrera a carrera</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => onMetric(m)}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px]",
                metric === m ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "pace" ? "General" : AREA_INFO[m].short}
            </button>
          ))}
        </div>
      </div>

      {history.length === 0 ? null : (
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="label"
                interval={2}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[(min: number) => Math.floor(min - 1), (max: number) => Math.ceil(max + 1)]}
                tickFormatter={(v: number) => v.toFixed(0)}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip
                cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const items = [...payload].sort((a, b) => Number(b.value) - Number(a.value));
                  return (
                    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg space-y-0.5">
                      <div className="font-medium mb-1">{label}</div>
                      {items.map((it) => (
                        <div key={String(it.dataKey)} className={cn("flex items-center gap-2", it.dataKey === playerTeamId && "font-semibold")}>
                          <span className="w-2.5 h-0.5 rounded" style={{ backgroundColor: it.color }} />
                          <span className="flex-1">{nameOf(String(it.dataKey))}</span>
                          <span className="font-mono">{Number(it.value).toFixed(1)}</span>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
              {teams.map((t) => {
                const hi = t.id === highlighted;
                return (
                  <Line
                    key={t.id}
                    type="monotone"
                    dataKey={t.id}
                    stroke={t.hex}
                    strokeWidth={hi ? 3 : 1.5}
                    strokeOpacity={hi ? 1 : 0.45}
                    dot={fewPoints ? { r: hi ? 4 : 2.5, strokeWidth: 0, fill: t.hex } : false}
                    activeDot={{ r: hi ? 5 : 3, strokeWidth: 2, stroke: "hsl(var(--card))" }}
                    isAnimationActive={false}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Legend = current ranking; hover/click to highlight a team */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {ordered.map((t, i) => (
          <button
            key={t.id}
            onMouseEnter={() => setFocus(t.id)}
            onMouseLeave={() => setFocus(null)}
            onClick={() => setFocus((f) => (f === t.id ? null : t.id))}
            className={cn(
              "flex items-center gap-1.5 text-[11px]",
              t.id === highlighted ? "text-foreground font-medium" : "text-muted-foreground",
            )}
          >
            <span className="w-3 h-1 rounded" style={{ backgroundColor: t.hex }} />
            {i + 1}. {t.shortName}
            {latest && <span className="font-mono">{value(latest.dev[t.id], metric).toFixed(1)}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
