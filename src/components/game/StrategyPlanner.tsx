import { useMemo } from "react";
import { Lightbulb, Plus, Trash2, AlertTriangle } from "lucide-react";
import {
  COMPOUNDS, estimatePlanTime, recommendPlans, setPlan, tyreLife,
  type CarState, type Compound, type RaceState, type Stint,
} from "@/engine";
import { TeamStripe, TyreBadge } from "./common";
import { cn } from "@/lib/utils";

interface Props {
  state: RaceState;
  cars: CarState[];
  onApply: (fn: (s: RaceState) => RaceState) => void;
}

const fmtDelta = (s: number) => (s < 0.05 ? "mejor estimada" : `+${s.toFixed(1)} s`);

export function StrategyPlanner({ state, cars, onApply }: Props) {
  return (
    <div className="rounded-xl border border-primary/40 bg-card p-4 space-y-4">
      <div>
        <h3 className="font-display text-xl">Estrategia de carrera</h3>
        <p className="text-xs text-muted-foreground">
          Define con qué neumático sale cada piloto y en qué vuelta para. Durante la carrera puedes cambiarla desde el muro de boxes.
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {cars.map((car) => (
          <CarPlanner key={car.id} car={car} state={state} onApply={onApply} />
        ))}
      </div>
    </div>
  );
}

function CarPlanner({ car, state, onApply }: { car: CarState; state: RaceState; onApply: Props["onApply"] }) {
  const track = state.track;
  const laps = state.totalLaps;
  const twoRule = state.rules?.twoCompound !== false;
  const options = useMemo(() => recommendPlans(car.entry, track, 4, !twoRule), [car.entry, track, twoRule]);
  const best = options[0]?.time ?? 0;
  const plan = car.plan;
  const current = estimatePlanTime(car.entry, track, plan);
  const compounds = Object.keys(COMPOUNDS) as Compound[];
  const twoCompounds = new Set(plan.map((s) => s.compound)).size >= 2;

  const update = (next: Stint[]) => onApply((s) => setPlan(s, car.id, next));
  const setCompound = (i: number, c: Compound) => update(plan.map((s, j) => (j === i ? { ...s, compound: c } : s)));
  const setLap = (i: number, lap: number) => update(plan.map((s, j) => (j === i ? { ...s, untilLap: lap } : s)));
  const removeStint = (i: number) => {
    if (plan.length < 2) return;
    // the previous stint (or the next one, for the first) absorbs the removed laps
    const next = plan.filter((_, j) => j !== i).map((s) => ({ ...s }));
    if (i === plan.length - 1) next[next.length - 1].untilLap = laps;
    update(next);
  };
  const addStop = () => {
    if (plan.length >= 4) return;
    const last = plan[plan.length - 1];
    const prevEnd = plan.length > 1 ? plan[plan.length - 2].untilLap : 0;
    const split = Math.round((prevEnd + laps) / 2);
    const other = compounds.find((c) => c !== last.compound) ?? "M";
    update([...plan.slice(0, -1), { compound: last.compound, untilLap: split }, { compound: other, untilLap: laps }]);
  };

  return (
    <div className="rounded-lg border border-border bg-background/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <TeamStripe color={car.entry.team.hex} className="h-7 w-1.5" />
        <div className="flex-1">
          <div className="font-racing text-sm">{car.entry.driver.name}</div>
          <div className="text-[11px] text-muted-foreground">
            Sale P{car.grid} · tiempo estimado {fmtDelta(current - best)}
          </div>
        </div>
      </div>

      {/* Engineer recommendations */}
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Lightbulb className="w-3 h-3 text-yellow-400" /> Recomendaciones del ingeniero
        </div>
        <div className="flex flex-wrap gap-1.5">
          {options.map((o, i) => {
            const active = JSON.stringify(o.plan) === JSON.stringify(plan);
            return (
              <button
                key={o.label}
                onClick={() => update(o.plan)}
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] text-left",
                  active ? "border-primary bg-primary/15" : "border-border hover:bg-muted",
                )}
                title={`Paradas en vuelta ${o.plan.slice(0, -1).map((p) => p.untilLap).join(" y ")}`}
              >
                <span className="flex items-center gap-0.5">
                  {o.plan.map((p, k) => (
                    <TyreBadge key={k} compound={p.compound} className="scale-90" />
                  ))}
                </span>
                <span className="block text-muted-foreground">
                  {i === 0 ? "★ " : ""}
                  {o.plan.length - 1} parada{o.plan.length === 2 ? "" : "s"} · {fmtDelta(o.time - best)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stint editor */}
      <div className="space-y-1.5">
        {plan.map((stint, i) => {
          const start = i === 0 ? 0 : plan[i - 1].untilLap;
          const len = stint.untilLap - start;
          const life = tyreLife(stint.compound, track, car.entry.driver.tyreMgmt);
          const wear = len / life;
          const isLast = i === plan.length - 1;
          return (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 px-2 py-1.5">
              <span className="text-[11px] text-muted-foreground w-12">Stint {i + 1}</span>
              <div className="flex gap-0.5">
                {compounds.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCompound(i, c)}
                    className={cn("rounded-full p-0.5", stint.compound === c ? "ring-2 ring-primary" : "opacity-40 hover:opacity-100")}
                    title={COMPOUNDS[c].name}
                  >
                    <TyreBadge compound={c} />
                  </button>
                ))}
              </div>
              {isLast ? (
                <span className="text-[11px] text-muted-foreground">hasta el final</span>
              ) : (
                <div className="flex items-center rounded-md border border-border text-xs">
                  <button className="px-2 py-0.5 hover:bg-muted" onClick={() => setLap(i, stint.untilLap - 1)}>−</button>
                  <span className="w-16 text-center font-mono">box V{stint.untilLap}</span>
                  <button className="px-2 py-0.5 hover:bg-muted" onClick={() => setLap(i, stint.untilLap + 1)}>+</button>
                </div>
              )}
              <span
                className={cn(
                  "text-[11px] ml-auto",
                  wear > 1.1 ? "text-red-400" : wear > 0.9 ? "text-yellow-300" : "text-muted-foreground",
                )}
                title="Vida útil del neumático consumida al final del stint"
              >
                {len} v · {Math.round(wear * 100)}%
              </span>
              {plan.length > 1 && (
                <button onClick={() => removeStint(i)} className="text-muted-foreground hover:text-destructive" title="Quitar stint">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
        {plan.length < 4 && (
          <button onClick={addStop} className="flex items-center gap-1 text-[11px] text-primary hover:underline">
            <Plus className="w-3 h-3" /> Agregar parada
          </button>
        )}
      </div>

      {twoRule && !twoCompounds && (
        <div className="flex items-center gap-1 text-[11px] text-orange-400">
          <AlertTriangle className="w-3 h-3" /> Debe usar al menos 2 compuestos distintos o recibe 30 s de penalización.
        </div>
      )}
      {plan.some((s, i) => (s.untilLap - (i ? plan[i - 1].untilLap : 0)) / tyreLife(s.compound, track, car.entry.driver.tyreMgmt) > 1.1) && (
        <div className="flex items-center gap-1 text-[11px] text-red-400">
          <AlertTriangle className="w-3 h-3" /> Algún stint pasa la vida útil del neumático: perderá mucho tiempo al final.
        </div>
      )}
    </div>
  );
}
