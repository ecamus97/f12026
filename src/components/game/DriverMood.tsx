import { formLabel, formOf, moodEffect, moraleLabel, moraleOf, type DriverRecord, type FormEntry } from "@/engine";
import { calendar } from "@/data/calendar";
import { cn } from "@/lib/utils";

const scoreColor = (s: number) =>
  s >= 1.2 ? "bg-emerald-500 text-black" : s >= 0.3 ? "bg-green-600/80 text-white" : s > -0.3 ? "bg-white/15 text-white" : s > -1.2 ? "bg-orange-500/80 text-black" : "bg-red-600 text-white";

const raceName = (f: FormEntry) => calendar()[f.round - 1]?.name ?? `Ronda ${f.round}`;

function chipText(f: FormEntry) {
  return f.pos == null ? "DNF" : `P${f.pos}`;
}

/** Morale as a meter from 0 to 100 with the neutral point marked. */
export function MoraleMeter({ value, compact = false }: { value: number; compact?: boolean }) {
  const ml = moraleLabel(value);
  return (
    <div className={cn("space-y-1", compact && "space-y-0.5")}>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="uppercase tracking-wider text-muted-foreground text-[10px]">Moral</span>
        <span className={cn("font-semibold tabular-nums", ml.tone)}>
          {Math.round(value)} · {ml.label}
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-gradient-to-r from-red-600/40 via-yellow-400/30 to-emerald-500/40">
        <span className="absolute top-1/2 -translate-y-1/2 h-3 w-px bg-white/40" style={{ left: "65%" }} title="Normal" />
        <span
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full border-2 border-background"
          style={{ left: `${Math.max(2, Math.min(98, value))}%`, backgroundColor: ml.color }}
        />
      </div>
    </div>
  );
}

/** Last results against what the car allowed: green = better, red = worse. */
export function FormStrip({ log, count = 5 }: { log: FormEntry[]; count?: number }) {
  const last = log.slice(-count);
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: count - last.length }).map((_, i) => (
        <span key={`e${i}`} className="w-8 h-5 rounded-sm border border-dashed border-white/10" />
      ))}
      {last.map((f) => (
        <span
          key={`${f.season}-${f.round}`}
          className={cn("w-8 h-5 rounded-sm grid place-items-center text-[10px] font-racing", scoreColor(f.score))}
          title={`${raceName(f)} ${f.season}: ${chipText(f)}${f.note ? ` (${f.note})` : ""} · esperado P${Math.round(f.expected)}`}
        >
          {chipText(f)}
        </span>
      ))}
    </div>
  );
}

/** Compact morale + form block for driver lists. */
export function MoodSummary({ d }: { d: DriverRecord }) {
  const m = moraleOf(d);
  const f = formOf(d);
  const fl = formLabel(f);
  return (
    <div className="grid sm:grid-cols-[1fr_auto] gap-x-4 gap-y-2 items-end">
      <MoraleMeter value={m} />
      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>Forma</span>
          <span className={cn("normal-case tracking-normal text-[11px] font-semibold", fl.tone)}>
            {fl.arrow} {fl.label}
          </span>
        </div>
        <FormStrip log={d.formLog ?? []} />
      </div>
    </div>
  );
}

/** Full block for the driver profile: meter, form, the effect on track and the recent results chart. */
export function MoodDetail({ d }: { d: DriverRecord }) {
  const fx = moodEffect(d);
  const log = (d.formLog ?? []).slice(-10);
  const sign = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;
  return (
    <div className="space-y-3">
      <MoodSummary d={d} />
      <div className="text-[11px] text-muted-foreground">
        Efecto en pista ahora: ritmo <b className={fx.pace >= 0 ? "text-green-400" : "text-red-400"}>{sign(fx.pace)}</b> · constancia{" "}
        <b className={fx.consistency >= 0 ? "text-green-400" : "text-red-400"}>{sign(fx.consistency)}</b>. Sube con resultados por encima de lo que da el
        auto y al ganarle al compañero; baja con malos resultados, accidentes y órdenes de equipo que lo perjudican. Con la moral baja puede
        desobedecer órdenes.
      </div>
      {log.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Últimos Grandes Premios frente a lo esperado</div>
          <div className="flex items-stretch gap-1 h-20">
            {log.map((f) => {
              const h = Math.min(1, Math.abs(f.score) / 3);
              const up = f.score >= 0;
              return (
                <div key={`${f.season}-${f.round}`} className="flex-1 flex flex-col items-center min-w-0" title={`${raceName(f)}: ${chipText(f)} · esperado P${Math.round(f.expected)}`}>
                  <div className="flex-1 w-full flex flex-col justify-end">
                    {up && <div className="w-full rounded-t-sm bg-green-500/80" style={{ height: `${Math.max(4, h * 100)}%` }} />}
                  </div>
                  <div className="w-full h-px bg-white/30" />
                  <div className="flex-1 w-full">
                    {!up && <div className="w-full rounded-b-sm bg-red-500/80" style={{ height: `${Math.max(4, h * 100)}%` }} />}
                  </div>
                  <span className="text-[9px] text-muted-foreground font-racing">{chipText(f)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
