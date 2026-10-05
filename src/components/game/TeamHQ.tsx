import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Building2, FlaskConical, Wallet, Inbox, Hammer, TrendingUp, TrendingDown, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Team } from "@/data/f1Data";
import {
  AREA_INFO, CATEGORY_INFO, FACILITY_INFO, MAX_FACILITY_LEVEL, PROJECTS, SLOT_INFO, STYLE_INFO,
  areaRanks, baseRaceBalance, canSignSponsor, canStartProject, canUpgradeFacility, carPace, expectedGain,
  expectedPerRace, facilityUpgradeCost, maxProjects, projectRaces, FACILITY_BUILD_RACES,
  type DevArea, type FacilityKey, type LedgerCategory, type ManagementState, type SponsorDeal, type SponsorSlot,
} from "@/engine";
import { PerformanceChart, type Metric } from "./PerformanceChart";
import { TeamStripe } from "./common";
import { cn } from "@/lib/utils";

interface Props {
  team: Team;
  teams: Team[];
  round: number; // races already completed
  management: ManagementState;
  onStartProject: (id: string) => void;
  onUpgradeFacility: (key: FacilityKey) => void;
  onSignSponsor: (offerId: string) => void;
}

export const money = (m: number) => `US$ ${m.toFixed(1)} M`;

const AREAS: DevArea[] = ["aero", "powerUnit", "chassis", "reliability", "pitCrew"];

export function TeamHQ({ team, teams, round, management, onStartProject, onUpgradeFacility, onSignSponsor }: Props) {
  const [metric, setMetric] = useState<Metric>("pace");
  const p = management.player!;
  const myDev = management.dev[team.id];
  const ranks = areaRanks(management, team.id);
  const [tab, setTab] = useState<"dev" | "facilities" | "finance">("dev");

  const fieldBest = useMemo(() => {
    const ds = Object.values(management.dev);
    return {
      pace: Math.max(...ds.map(carPace)),
      aero: Math.max(...ds.map((d) => d.aero)),
      powerUnit: Math.max(...ds.map((d) => d.powerUnit)),
      chassis: Math.max(...ds.map((d) => d.chassis)),
      reliability: Math.max(...ds.map((d) => d.reliability)),
      pitCrew: Math.max(...ds.map((d) => d.pitCrew)),
    };
  }, [management.dev]);

  const bal = baseRaceBalance(management, round + 1);
  const perRace = bal.income - bal.costs;
  const missingSponsors = (Object.keys(SLOT_INFO) as SponsorSlot[]).reduce(
    (a, slot) => a + SLOT_INFO[slot].count - p.sponsors.filter((s) => s.slot === slot).length,
    0,
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="h-1.5" style={{ backgroundColor: team.hex }} />
        <div className="p-5 grid gap-4 md:grid-cols-3">
          <div className="md:col-span-1">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Sede del equipo</p>
            <h2 className="font-racing text-2xl flex items-center gap-2">
              <TeamStripe color={team.hex} className="h-7 w-1.5" /> {team.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              Auto P{ranks.pace} de {Object.keys(management.dev).length} · rating {carPace(myDev).toFixed(1)}
            </p>
          </div>
          <Stat icon={Wallet} label="Presupuesto disponible" value={money(p.budget)} tone={p.budget < 0 ? "bad" : undefined} />
          <Stat
            icon={perRace >= 0 ? TrendingUp : TrendingDown}
            label="Balance base por carrera"
            value={`${perRace >= 0 ? "+" : ""}${perRace.toFixed(1)} M`}
            hint={`Ingresos fijos ${bal.income.toFixed(1)} M − costos ${bal.costs.toFixed(1)} M. Sin contar bonos ni premios.${
              missingSponsors ? ` Tienes ${missingSponsors} espacio(s) de patrocinio libre(s).` : ""
            }`}
          />
        </div>
      </div>

      {/* Car ratings */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-racing text-sm uppercase tracking-wider text-muted-foreground">Rendimiento del auto</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {AREAS.map((a) => (
            <RatingCard
              key={a}
              selected={metric === a}
              onClick={() => setMetric(metric === a ? "pace" : a)}
              label={AREA_INFO[a].label}
              value={myDev[a]}
              best={fieldBest[a]}
              rank={ranks[a]}
              color={team.hex}
              desc={AREA_INFO[a].desc}
            />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          El ritmo del auto = 40% aerodinámica + 30% motor + 30% chasis. Toca un componente para ver cómo se compara con las demás escuderías.
        </p>
      </div>

      <PerformanceChart management={management} teams={teams} playerTeamId={team.id} metric={metric} onMetric={setMetric} />

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted/40 p-1">
        {[
          { k: "dev", label: "Desarrollo", icon: FlaskConical },
          { k: "facilities", label: "Instalaciones", icon: Building2 },
          { k: "finance", label: "Finanzas", icon: Wallet },
        ].map(({ k, label, icon: Icon }) => (
          <button
            key={k}
            onClick={() => setTab(k as typeof tab)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-racing",
              tab === k ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === "dev" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-racing text-sm">En desarrollo</h3>
              <span className="text-xs text-muted-foreground">
                {p.projects.length}/{maxProjects(p)} proyectos simultáneos
              </span>
            </div>
            {p.projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay proyectos en curso. Elige uno abajo: se entregan después de las carreras indicadas.</p>
            ) : (
              <div className="space-y-2">
                {p.projects.map((pr) => (
                  <div key={pr.uid} className="rounded-md border border-border/60 p-2.5">
                    <div className="flex items-center justify-between text-sm">
                      <span>
                        {pr.name} <span className="text-xs text-muted-foreground">· {AREA_INFO[pr.area].label}</span>
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {pr.racesLeft} carrera{pr.racesLeft === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${((pr.totalRaces - pr.racesLeft) / pr.totalRaces) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            {PROJECTS.map((t) => {
              const blocked = canStartProject(management, t.id);
              const [g0, g1] = expectedGain(t, management);
              const facLvl = p.facilities[AREA_INFO[t.area].facility];
              const success = Math.min(0.97, t.success + (facLvl - 3) * 0.04);
              return (
                <div key={t.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">{t.name}</div>
                      <div className="text-[11px] text-muted-foreground">{AREA_INFO[t.area].label}</div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-racing">{money(t.cost)}</div>
                      <div className="text-muted-foreground">{projectRaces(t, p)} carrera{projectRaces(t, p) === 1 ? "" : "s"}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span>
                      Mejora esperada: <span className="text-green-400">+{g0}–{g1}</span>
                    </span>
                    <span className="text-muted-foreground">Éxito {Math.round(success * 100)}%</span>
                  </div>
                  <Button
                    size="sm"
                    variant={blocked ? "outline" : "default"}
                    disabled={!!blocked}
                    onClick={() => onStartProject(t.id)}
                    className="w-full text-xs"
                  >
                    {blocked ?? "Iniciar proyecto"}
                  </Button>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Si un proyecto falla entrega solo ~30% de la mejora. Mientras mejor es un área, más cuesta seguir mejorándola.
          </p>
        </div>
      )}

      {tab === "facilities" && (
        <div className="space-y-3">
          {p.facilityWork && (
            <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm flex items-center gap-2">
              <Hammer className="w-4 h-4 text-yellow-400" />
              Obra en curso: {FACILITY_INFO[p.facilityWork.key].label} → nivel {p.facilities[p.facilityWork.key] + 1} · faltan{" "}
              {p.facilityWork.racesLeft} carrera{p.facilityWork.racesLeft === 1 ? "" : "s"}
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-3">
            {(Object.keys(FACILITY_INFO) as FacilityKey[]).map((k) => {
              const lvl = p.facilities[k];
              const blocked = canUpgradeFacility(management, k);
              return (
                <div key={k} className="rounded-xl border border-border bg-card p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{FACILITY_INFO[k].label}</div>
                    <div className="flex gap-1">
                      {Array.from({ length: MAX_FACILITY_LEVEL }, (_, i) => (
                        <span key={i} className={cn("w-3 h-3 rounded-sm", i < lvl ? "bg-primary" : "bg-muted")} />
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{FACILITY_INFO[k].desc}</p>
                  <Button
                    size="sm"
                    variant={blocked ? "outline" : "secondary"}
                    disabled={!!blocked}
                    onClick={() => onUpgradeFacility(k)}
                    className="w-full text-xs"
                  >
                    {lvl >= MAX_FACILITY_LEVEL
                      ? "Nivel máximo"
                      : blocked ?? `Mejorar a nivel ${lvl + 1} · ${money(facilityUpgradeCost(lvl))} · ${FACILITY_BUILD_RACES} carreras`}
                  </Button>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Cada nivel multiplica la mejora de los proyectos de su área (nivel 1 = ×0,8 … nivel 5 = ×1,2) y sube su probabilidad de éxito.
          </p>
        </div>
      )}

      {tab === "finance" && <Finance management={management} onSignSponsor={onSignSponsor} />}

      <InboxList management={management} />
    </div>
  );
}

function Stat({
  icon: Icon, label, value, hint, tone,
}: { icon: typeof Wallet; label: string; value: string; hint?: string; tone?: "bad" }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={cn("font-racing text-xl mt-1", tone === "bad" && "text-destructive")}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function RatingCard({
  label, value, best, rank, color, desc, selected, onClick,
}: { label: string; value: number; best: number; rank: number; color: string; desc: string; selected: boolean; onClick: () => void }) {
  const pct = Math.max(4, Math.min(100, ((value - 70) / 30) * 100));
  const bestPct = Math.max(4, Math.min(100, ((best - 70) / 30) * 100));
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border bg-background/40 p-3 space-y-1.5 text-left transition-colors",
        selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50",
      )}
      title={desc}
    >
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-racing">P{rank}</span>
      </div>
      <div className="font-racing text-lg">{value.toFixed(1)}</div>
      <div className="relative h-1.5 rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
        <div className="absolute -top-1 w-0.5 h-3.5 bg-foreground/60" style={{ left: `${bestPct}%` }} title={`Mejor del grid: ${best.toFixed(1)}`} />
      </div>
    </button>
  );
}

function Finance({ management, onSignSponsor }: { management: ManagementState; onSignSponsor: (id: string) => void }) {
  const p = management.player!;
  const ledger = p.ledger;
  const [showAll, setShowAll] = useState(false);

  // season totals by category
  const totals = new Map<LedgerCategory | "other", number>();
  for (const l of ledger) totals.set(l.category ?? "other", (totals.get(l.category ?? "other") ?? 0) + l.amount);
  const incomeCats = (Object.keys(CATEGORY_INFO) as LedgerCategory[]).filter((c) => CATEGORY_INFO[c].kind === "income" && totals.has(c));
  const expenseCats = (Object.keys(CATEGORY_INFO) as LedgerCategory[]).filter((c) => CATEGORY_INFO[c].kind === "expense" && totals.has(c));
  const income = incomeCats.reduce((a, c) => a + (totals.get(c) ?? 0), 0);
  const spend = expenseCats.reduce((a, c) => a + (totals.get(c) ?? 0), 0);

  const byRace = new Map<number, typeof ledger>();
  for (const l of ledger) byRace.set(l.race, [...(byRace.get(l.race) ?? []), l]);
  const rounds = [...byRace.entries()].reverse();

  return (
    <div className="space-y-4">
      <Sponsors management={management} onSignSponsor={onSignSponsor} />

      <div className="grid md:grid-cols-2 gap-3">
        <Breakdown title="Ingresos de la temporada" total={income} cats={incomeCats} totals={totals} positive />
        <Breakdown title="Gastos de la temporada" total={spend} cats={expenseCats} totals={totals} />
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-3 py-2 text-xs font-racing border-b border-border">Movimientos por ronda</div>
        {(showAll ? rounds : rounds.slice(0, 4)).map(([race, items]) => {
          const net = items.reduce((a, l) => a + l.amount, 0);
          return (
            <div key={race} className="border-b border-border/40 last:border-0">
              <div className="flex justify-between px-3 py-1.5 bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                <span>{race === 0 ? "Pretemporada" : `Ronda ${race}`}</span>
                <span className={net >= 0 ? "text-green-400" : "text-red-400"}>
                  {net >= 0 ? "+" : ""}
                  {net.toFixed(2)} M
                </span>
              </div>
              {items.map((l, i) => (
                <div key={i} className="flex justify-between px-3 py-1 text-sm">
                  <span>{l.concept}</span>
                  <span className={cn("font-mono text-xs", l.amount >= 0 ? "text-green-400" : "text-red-400")}>
                    {l.amount >= 0 ? "+" : ""}
                    {l.amount.toFixed(2)} M
                  </span>
                </div>
              ))}
            </div>
          );
        })}
        {rounds.length > 4 && (
          <button onClick={() => setShowAll((v) => !v)} className="w-full py-2 text-xs text-primary hover:underline">
            {showAll ? "Ver menos" : `Ver todas las rondas (${rounds.length})`}
          </button>
        )}
      </div>
    </div>
  );
}

function Breakdown({
  title, total, cats, totals, positive,
}: { title: string; total: number; cats: LedgerCategory[]; totals: Map<string, number>; positive?: boolean }) {
  const max = Math.max(...cats.map((c) => Math.abs(totals.get(c) ?? 0)), 0.01);
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div className="flex justify-between items-baseline">
        <span className="text-xs text-muted-foreground">{title}</span>
        <span className={cn("font-racing", positive ? "text-green-400" : "text-red-400")}>
          {total >= 0 ? "+" : ""}
          {total.toFixed(1)} M
        </span>
      </div>
      {cats.map((c) => {
        const v = totals.get(c) ?? 0;
        return (
          <div key={c} className="space-y-0.5">
            <div className="flex justify-between text-xs">
              <span>{CATEGORY_INFO[c].label}</span>
              <span className="font-mono">{v.toFixed(1)} M</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full", positive ? "bg-green-500/80" : "bg-red-500/70")}
                style={{ width: `${(Math.abs(v) / max) * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const TYPICAL = { points: 6, podiums: 0, wins: 0, pole: false, dnfs: 0.2 };

function Sponsors({ management, onSignSponsor }: { management: ManagementState; onSignSponsor: (id: string) => void }) {
  const p = management.player!;
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div>
        <h3 className="font-racing text-sm">Patrocinadores</h3>
        <p className="text-[11px] text-muted-foreground">
          1 principal y 2 secundarios. Cada contrato tiene un estilo distinto: pago fijo, bonos por resultado, prima de firma o
          exigencias de rendimiento. Llegan ofertas nuevas cada 6 carreras o cuando termina un contrato.
        </p>
      </div>

      {(Object.keys(SLOT_INFO) as SponsorSlot[]).map((slot) => {
        const signed = p.sponsors.filter((s) => s.slot === slot);
        const offers = p.offers.filter((o) => o.slot === slot);
        const free = SLOT_INFO[slot].count - signed.length;
        return (
          <div key={slot} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">{SLOT_INFO[slot].label}</span>
              <span className="text-[11px] text-muted-foreground">
                {signed.length}/{SLOT_INFO[slot].count} ocupados
              </span>
            </div>
            {signed.map((s) => (
              <SponsorCard key={s.id} s={s} signed />
            ))}
            {free > 0 && (
              <div className="grid md:grid-cols-2 gap-2">
                {offers.map((o) => {
                  const blocked = canSignSponsor(management, o.id);
                  return <SponsorCard key={o.id} s={o} blocked={blocked} onSign={() => onSignSponsor(o.id)} />;
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SponsorCard({ s, signed, blocked, onSign }: { s: SponsorDeal; signed?: boolean; blocked?: string | null; onSign?: () => void }) {
  const bonuses = [
    s.perPoint > 0 && `${s.perPoint.toFixed(2)} M por punto`,
    s.perPodium > 0 && `${s.perPodium.toFixed(2)} M por podio`,
    s.perWin > 0 && `${s.perWin.toFixed(2)} M por victoria`,
    s.perPole > 0 && `${s.perPole.toFixed(2)} M por pole`,
  ].filter(Boolean);
  return (
    <div className={cn("rounded-lg border p-3 space-y-2", signed ? "border-primary/50 bg-primary/5" : "border-border bg-background/40")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{s.name}</div>
          <div className="text-[11px] text-muted-foreground" title={STYLE_INFO[s.style].desc}>
            {STYLE_INFO[s.style].label} · {STYLE_INFO[s.style].desc}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-racing text-sm">{s.base.toFixed(2)} M</div>
          <div className="text-[10px] text-muted-foreground">por carrera</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {s.signing > 0 && <span className="rounded bg-green-500/15 text-green-300 px-1.5 py-0.5">Prima firma +{s.signing.toFixed(1)} M</span>}
        {bonuses.map((b) => (
          <span key={String(b)} className="rounded bg-sky-500/15 text-sky-300 px-1.5 py-0.5">
            {b}
          </span>
        ))}
        {s.perDnf < 0 && <span className="rounded bg-red-500/15 text-red-300 px-1.5 py-0.5">Multa {s.perDnf.toFixed(2)} M por abandono</span>}
        {s.minRank !== null && <span className="rounded bg-yellow-500/15 text-yellow-300 px-1.5 py-0.5">Requiere auto top {s.minRank}</span>}
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {signed ? `Quedan ${s.racesLeft} carrera${s.racesLeft === 1 ? "" : "s"} · cobrado ${s.earned.toFixed(1)} M` : `Contrato de ${s.duration} carreras`}
        </span>
        {!signed && <span>≈ {expectedPerRace(s, TYPICAL).toFixed(2)} M/carrera (estimado)</span>}
      </div>
      {!signed && (
        <Button size="sm" className="w-full text-xs" variant={blocked ? "outline" : "default"} disabled={!!blocked} onClick={onSign}>
          {blocked ?? "Firmar contrato"}
        </Button>
      )}
    </div>
  );
}

export function InboxList({ management, limit = 8 }: { management: ManagementState; limit?: number }) {
  const items = [...management.inbox].reverse().slice(0, limit);
  if (!items.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <h3 className="font-racing text-sm flex items-center gap-2">
        <Inbox className="w-4 h-4" /> Novedades del equipo
      </h3>
      {items.map((m, i) => (
        <motion.div
          key={`${m.race}-${i}-${m.text}`}
          className="flex gap-2 text-sm"
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.03 }}
        >
          <span className="w-10 shrink-0 text-xs text-muted-foreground font-mono">{m.race === 0 ? "Pre" : `R${m.race}`}</span>
          <CheckCircle2
            className={cn(
              "w-4 h-4 shrink-0 mt-0.5",
              m.tone === "good" ? "text-green-400" : m.tone === "bad" ? "text-red-400" : "text-muted-foreground",
            )}
          />
          <span>{m.text}</span>
        </motion.div>
      ))}
    </div>
  );
}
