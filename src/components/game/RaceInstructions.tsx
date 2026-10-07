import { Swords, Shield, Users, Hand, ArrowDownUp } from "lucide-react";
import {
  FUEL_MODES, MODES, moraleLabel, obeyChance, overtakeChance, setInstruction, setTeamOrder, tyreLife,
  type CarState, type Instruction, type RaceState,
} from "@/engine";
import { TyreBadge } from "./common";
import { cn } from "@/lib/utils";

const INSTRUCTIONS: { id: Instruction; label: string; icon: typeof Swords; hint: string }[] = [
  { id: "free", label: "Libre", icon: Hand, hint: "Corre su carrera sin forzar duelos." },
  {
    id: "attack",
    label: "Atacar",
    icon: Swords,
    hint: "Con el auto de adelante a menos de 1s: más opciones de adelantar, gasta más batería y sube el riesgo de error o contacto.",
  },
  {
    id: "defend",
    label: "Defender",
    icon: Shield,
    hint: "Con un auto detrás a menos de 1s: cierra la puerta y cuesta mucho más pasarlo, pero pierde algo de tiempo por vuelta, gasta batería y arriesga contacto.",
  },
];

const pct = (p: number) => `${Math.round(p * 100)}%`;

function Rival({ car, me, state, side }: { car: CarState; me: CarState; state: RaceState; side: "ahead" | "behind" }) {
  const life = tyreLife(car.compound, state.track, car.entry.driver.tyreMgmt, state.weather?.trackTemp[state.lap]);
  const wear = Math.min(1.3, car.tyreAge / life);
  const gap = side === "ahead" ? me.total - car.total : car.total - me.total;
  // pace of the last lap compared with ours (positive = we are quicker)
  const paceDiff = side === "ahead" ? car.lastLap - me.lastLap : me.lastLap - car.lastLap;
  const battery = Math.round(car.battery ?? 80);
  const extra = [
    car.mode !== "normal" && MODES[car.mode].label.toLowerCase(),
    car.fuelMode && car.fuelMode !== "normal" && FUEL_MODES[car.fuelMode].label.toLowerCase(),
    car.instruction === "defend" && side === "ahead" && "defendiendo",
    car.instruction === "attack" && side === "behind" && "atacando",
  ].filter(Boolean);
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-3 text-muted-foreground">{side === "ahead" ? "▲" : "▼"}</span>
      <span className="w-1 h-3.5 rounded-full" style={{ backgroundColor: car.entry.team.hex }} />
      <span className="font-racing w-9" title={extra.join(" · ") || undefined}>
        {car.entry.driver.shortName}
        {extra.length > 0 && <span className="text-orange-300">*</span>}
      </span>
      <span className={cn("font-mono tabular-nums w-12", gap < 1 ? "text-orange-300" : "text-muted-foreground")}>
        {side === "ahead" ? "+" : "−"}
        {gap.toFixed(2)}s
      </span>
      <TyreBadge compound={car.compound} />
      <span className={cn("tabular-nums w-8", wear > 0.9 ? "text-red-400" : wear > 0.6 ? "text-yellow-300" : "text-muted-foreground")} title="Desgaste">
        {Math.round(wear * 100)}%
      </span>
      <span className={cn("tabular-nums w-10 whitespace-nowrap", battery < 25 ? "text-red-400" : "text-muted-foreground")} title="Batería">
        ⚡{battery}%
      </span>
      <span className={cn("tabular-nums", paceDiff > 0.05 ? "text-green-400" : paceDiff < -0.05 ? "text-red-400" : "text-muted-foreground")} title="Ritmo de la última vuelta frente al tuyo">
        {paceDiff >= 0 ? "▲" : "▼"}
        {Math.abs(paceDiff).toFixed(2)}
      </span>
    </div>
  );
}

/** The cars around one of the player's drivers, and how he should race them. */
export function DuelPanel({ car, state, onMode }: { car: CarState; state: RaceState; onMode: (fn: (s: RaceState) => RaceState) => void }) {
  const running = state.cars.filter((c) => c.status === "running");
  const i = running.findIndex((c) => c.id === car.id);
  const ahead = i > 0 ? running[i - 1] : null;
  const behind = i >= 0 && i < running.length - 1 ? running[i + 1] : null;
  const instr = car.instruction ?? "free";
  const bonus = state.rules?.overtakeAid ? 0.6 : 0;
  const ersB = (c: CarState) => (c.ersMode === "deploy" && (c.battery ?? 0) > 10 ? 0.6 : 0);
  // chance of a pass when the cars meet, from the pace of the last lap
  const attackChance = (attack: boolean) =>
    ahead
      ? overtakeChance({
          delta: Math.max(0.1, ahead.lastLap - car.lastLap),
          attacker: car.entry,
          defender: ahead.entry,
          track: state.track,
          bonus: bonus + ersB(car) + (attack ? 0.7 * (car.entry.driver.racecraft / 90) : 0) - (ahead.instruction === "defend" ? (1.3 * ahead.entry.driver.defending) / 90 : 0),
        })
      : 0;
  const passedChance = (defend: boolean) =>
    behind
      ? overtakeChance({
          delta: Math.max(0.1, car.lastLap - behind.lastLap),
          attacker: behind.entry,
          defender: car.entry,
          track: state.track,
          bonus: bonus + ersB(behind) + (behind.instruction === "attack" ? 0.7 * (behind.entry.driver.racecraft / 90) : 0) - (defend ? (1.3 * car.entry.driver.defending) / 90 : 0),
        })
      : 0;
  const closeAhead = !!ahead && car.total - ahead.total < 1.0;
  const closeBehind = !!behind && behind.total - car.total < 1.0;
  const lowBattery = (car.battery ?? 80) < 20;
  const hint = INSTRUCTIONS.find((x) => x.id === instr)!.hint;
  return (
    <div className="rounded-md border border-border/60 p-2 space-y-1.5">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Duelo e instrucciones</span>
        {state.lap > 0 && (closeAhead || closeBehind) && <span className="normal-case tracking-normal text-orange-300">en lucha</span>}
      </div>
      {ahead && <Rival car={ahead} me={car} state={state} side="ahead" />}
      {behind && <Rival car={behind} me={car} state={state} side="behind" />}
      <div className="grid grid-cols-3 gap-1">
        {INSTRUCTIONS.map((o) => {
          const Icon = o.icon;
          return (
            <button
              key={o.id}
              onClick={() => onMode((s) => setInstruction(s, car.id, o.id))}
              className={cn(
                "rounded-md border py-1 text-[11px] font-racing flex items-center justify-center gap-1",
                instr === o.id ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
              )}
              title={o.hint}
            >
              <Icon className="w-3 h-3" /> {o.label}
            </button>
          );
        })}
      </div>
      <div className="text-[10px] text-muted-foreground space-y-0.5">
        {state.safetyCar.active && <div className="text-yellow-300">Safety car: no se puede adelantar hasta el relanzamiento.</div>}
        {ahead && state.lap > 0 && !state.safetyCar.active && (
          <div>
            Adelantar a {ahead.entry.driver.shortName} al alcanzarlo: {pct(attackChance(false))} libre · {pct(attackChance(true))} atacando
          </div>
        )}
        {behind && state.lap > 0 && !state.safetyCar.active && (
          <div>
            Que {behind.entry.driver.shortName} te pase si te alcanza: {pct(passedChance(false))} libre · {pct(passedChance(true))} defendiendo
          </div>
        )}
        <div>{hint}</div>
        {instr !== "free" && lowBattery && <div className="text-orange-300">Batería baja: el ERS ya no ayuda en el duelo.</div>}
      </div>
    </div>
  );
}

/** Orders between the two cars of the player's team. */
export function TeamOrdersPanel({ state, teamId, onApply }: { state: RaceState; teamId: string; onApply: (fn: (s: RaceState) => RaceState) => void }) {
  const cars = state.cars.filter((c) => c.entry.team.id === teamId && c.status === "running");
  if (cars.length < 2 || state.finished) return null;
  const [front, back] = cars; // classification order
  const ord = state.teamOrders?.[teamId] ?? { kind: "free" as const, since: 0 };
  const gap = back.total - front.total;
  const frontMorale = front.morale ?? 65;
  const ml = moraleLabel(frontMorale);
  const options = [
    { id: "free", label: "Pelear libre", icon: Swords, active: ord.kind === "free", run: (s: RaceState) => setTeamOrder(s, teamId, { kind: "free" }) },
    { id: "hold", label: "Mantener", icon: Users, active: ord.kind === "hold", run: (s: RaceState) => setTeamOrder(s, teamId, { kind: "hold" }) },
    {
      id: "swap",
      label: `Pasar a ${back.entry.driver.shortName}`,
      icon: ArrowDownUp,
      active: ord.kind === "swap",
      run: (s: RaceState) => setTeamOrder(s, teamId, { kind: "swap", favored: back.id }),
    },
  ] as const;
  return (
    <div className="rounded-md border border-border/60 p-2 space-y-1.5">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Órdenes de equipo</span>
        <span className="normal-case tracking-normal font-mono">
          {front.entry.driver.shortName} → {back.entry.driver.shortName} {gap.toFixed(1)}s
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {options.map((o) => {
          const Icon = o.icon;
          return (
            <button
              key={o.id}
              onClick={() => onApply(o.run)}
              className={cn(
                "rounded-md border py-1 text-[11px] font-racing flex items-center justify-center gap-1 px-1",
                o.active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
              )}
            >
              <Icon className="w-3 h-3 shrink-0" /> <span className="truncate">{o.label}</span>
            </button>
          );
        })}
      </div>
      <div className="text-[10px] text-muted-foreground">
        {ord.kind === "free" && "Tus pilotos pueden pelear entre ellos: más riesgo de contacto entre compañeros."}
        {ord.kind === "hold" && "Mantienen posiciones: el de atrás no ataca a su compañero. Si es más rápido, le baja un poco la moral."}
        {ord.kind === "swap" &&
          (gap > 2.5
            ? `Esperando que ${back.entry.driver.shortName} se acerque a menos de 2.5s (se cancela tras 5 vueltas).`
            : `${front.entry.driver.shortName} lo dejará pasar al final de esta vuelta.`)}
        {ord.kind === "swap" && (
          <span className={cn("block", ml.tone)}>
            Moral de {front.entry.driver.shortName}: {Math.round(frontMorale)} ({ml.label.toLowerCase()}) · obedece {pct(obeyChance(frontMorale))} · ceder le baja la moral.
          </span>
        )}
      </div>
    </div>
  );
}
