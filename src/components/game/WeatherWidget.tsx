import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Thermometer, Droplets } from "lucide-react";
import { SKY_INFO, bestTyreFor, forecast, skyFor, wetLabel, type WeatherTimeline } from "@/engine";
import { TyreBadge } from "./common";
import { cn } from "@/lib/utils";

const chanceTone = (c: number) =>
  c >= 70 ? "bg-blue-500/80 text-white" : c >= 40 ? "bg-sky-500/50 text-white" : c >= 20 ? "bg-sky-500/20 text-sky-200" : "bg-muted/40 text-muted-foreground";

/**
 * Weather and forecast. Compact when the race is dry and no rain is expected;
 * it opens by itself when rain is around so the player can be attentive.
 */
export function WeatherWidget({
  weather, lap, title = "Clima", preview = false, className,
}: {
  weather: WeatherTimeline;
  lap: number; // current lap (use a negative number for a forecast days/hours before the race)
  title?: string;
  preview?: boolean; // before the race: no "now" conditions
  className?: string;
}) {
  const laps = weather.rain.length - 1;
  const at = Math.max(0, Math.min(laps, lap));
  const rainNow = preview ? 0 : weather.rain[at];
  const wetNow = preview ? 0 : weather.wet[at];
  const win = Math.max(3, Math.round(laps / 10));
  const fc = forecast(weather, lap, win);
  const maxChance = fc.reduce((a, f) => Math.max(a, f.chance), 0);
  const firstRain = fc.find((f) => f.chance >= 40);
  const attention = wetNow > 0.05 || rainNow > 0.05 || maxChance >= 30;
  const [open, setOpen] = useState(attention);
  useEffect(() => {
    if (attention) setOpen(true);
  }, [attention]);
  const sky = preview ? skyFor(firstRain ? 0.3 : 0, maxChance >= 20) : skyFor(rainNow, maxChance >= 30);
  const tyre = bestTyreFor(wetNow);
  const temp = weather.trackTemp[at];

  return (
    <div className={cn("rounded-xl border bg-card", attention ? "border-sky-500/50" : "border-border", className)}>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left">
        <span className="text-lg leading-none">{SKY_INFO[sky].icon}</span>
        <span className="font-racing text-xs uppercase tracking-wider text-muted-foreground">{title}</span>
        <span className="text-sm">{preview ? (firstRain ? "Lluvia posible" : SKY_INFO[sky].label) : SKY_INFO[sky].label}</span>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Thermometer className="w-3 h-3" /> Aire {weather.airTemp}° · Pista {temp}°
        </span>
        {!preview && (
          <span className={cn("text-xs flex items-center gap-1", wetNow > 0.08 ? "text-sky-300" : "text-muted-foreground")}>
            <Droplets className="w-3 h-3" /> {wetLabel(wetNow)}
          </span>
        )}
        {firstRain && (
          <span className="text-[11px] rounded bg-sky-500/20 text-sky-200 px-1.5 py-0.5">
            {rainNow > 0.08 ? "Sigue la lluvia" : "Atención"}: {firstRain.chance}% de lluvia V{firstRain.fromLap}–{firstRain.toLap}
          </span>
        )}
        {temp >= 45 && <span className="text-[11px] rounded bg-orange-500/20 text-orange-300 px-1.5 py-0.5">Pista muy caliente: más desgaste</span>}
        <span className="ml-auto text-muted-foreground">{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {!preview && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Humedad de la pista</span>
                <span className="flex items-center gap-1">
                  Neumático ideal ahora:
                  {tyre === "slick" ? <span className="text-foreground">slicks</span> : <TyreBadge compound={tyre} />}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-sky-500 transition-all" style={{ width: `${Math.round(wetNow * 100)}%` }} />
              </div>
            </div>
          )}
          <div className="text-[11px] text-muted-foreground">
            Pronóstico de lluvia por tramos de vueltas {preview ? "(muy incierto antes de la carrera)" : "(se actualiza cada 3 vueltas; lo lejano es menos fiable)"}
          </div>
          {fc.length ? (
            <div className="flex gap-1 overflow-x-auto pb-1">
              {fc.map((f) => (
                <div key={f.fromLap} className={cn("min-w-[52px] flex-1 rounded-md px-1 py-1 text-center", chanceTone(f.chance))}>
                  <div className="text-[10px] opacity-80">V{f.fromLap}–{f.toLap}</div>
                  <div className="text-xs font-semibold tabular-nums">{f.chance}%</div>
                  <div className="text-[10px]">{f.chance >= 30 ? (f.intensity >= 0.6 ? "fuerte" : f.intensity >= 0.3 ? "moderada" : "débil") : "—"}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground">Última vuelta.</div>
          )}
        </div>
      )}
    </div>
  );
}
