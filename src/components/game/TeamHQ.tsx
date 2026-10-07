import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Building2, FlaskConical, Wallet, Inbox, Hammer, Users, Briefcase, TrendingUp, TrendingDown, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { races2026, type Team } from "@/data/f1Data";
import { calendar } from "@/data/calendar";
import {
  AREA_INFO, CATEGORY_INFO, FACILITY_INFO, MAX_FACILITY_LEVEL, PROJECTS, SLOT_INFO, STYLE_INFO,
  areaRanks, baseRaceBalance, isInvestment, ledgerCategory, canSignSponsor, canStartProject, canUpgradeFacility, carPace, expectedGain,
  expectedPerRace, facilityUpgradeCost, facilityBuildRaces, maxProjects, projectRaces, successChance, payroll,
  seasonInvestment, constructorsPrize, carRankOf, champRankOf,
  type PeopleState,
  type DevArea, type FacilityKey, type LedgerCategory, type ManagementState, type SponsorDeal, type SponsorSlot,
} from "@/engine";
import { PerformanceChart, type Metric } from "./PerformanceChart";
import { TeamStripe } from "./common";
import { DriversPanel, StaffPanel } from "./PeoplePanels";
import { SectionTitle } from "./visuals";
import { FacilitiesCampus } from "./FacilitiesCampus";
import type { NegotiationAnswer } from "./NegotiationDialog";
import { cn } from "@/lib/utils";

interface Props {
  team: Team;
  teams: Team[];
  round: number; // races already completed
  management: ManagementState;
  onStartProject: (id: string) => void;
  onUpgradeFacility: (key: FacilityKey) => void;
  onSignSponsor: (offerId: string) => void;
  people?: PeopleState | null;
  onOffer?: (driverId: string, salary: number, years: number) => NegotiationAnswer;
  onRelease?: (driverId: string) => void;
  onHireStaff?: (staffId: string, salary: number, years: number) => NegotiationAnswer;
  onFireStaff?: (staffId: string) => void;
  onRenewStaff?: (staffId: string, salary: number, years: number) => NegotiationAnswer;
  onHireReserve?: (driverId: string, years: number) => { ok: boolean; message: string };
  onReleaseReserve?: () => void;
  onProfile?: (driverId: string) => void;
  section?: "car" | "facilities" | "drivers" | "staff" | "finance"; // show a single section (no tab bar)
}

export const money = (m: number) => `US$ ${m.toFixed(1)} M`;

const AREAS: DevArea[] = ["aero", "powerUnit", "chassis", "reliability", "pitCrew"];

export function TeamHQ({
  team, teams, round, management, onStartProject, onUpgradeFacility, onSignSponsor, people, onOffer, onRelease, onHireStaff, onFireStaff, onRenewStaff, onHireReserve, onReleaseReserve, onProfile, section,
}: Props) {
  const [metric, setMetric] = useState<Metric>("pace");
  const p = management.player!;
  const myDev = management.dev[team.id];
  const ranks = areaRanks(management, team.id);
  const [tabState, setTab] = useState<"dev" | "facilities" | "drivers" | "staff" | "finance">("dev");
  const tab = section ? (section === "car" ? "dev" : section) : tabState;
  const showOverview = !section || section === "car";
  const pay = people ? payroll(people, team.id) : null;
  const [devArea, setDevArea] = useState<DevArea>("aero");

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

  const bal = baseRaceBalance(management, round + 1, pay ? pay.drivers + pay.staff : 0);
  const perRace = bal.income - bal.costs;
  const missingSponsors = (Object.keys(SLOT_INFO) as SponsorSlot[]).reduce(
    (a, slot) => a + SLOT_INFO[slot].count - p.sponsors.filter((s) => s.slot === slot).length,
    0,
  );

  return (
    <div className="space-y-5">
      {showOverview && (
        <>
      {!section && (
<>      {/* Header */}
      <div className="panel overflow-hidden">
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
            hint={`Ingresos fijos ${bal.income.toFixed(1)} M − costos ${bal.costs.toFixed(1)} M (incluye sueldos). Sin contar bonos ni premios.${
              missingSponsors ? ` Tienes ${missingSponsors} espacio(s) de patrocinio libre(s).` : ""
            }`}
          />
        </div>
      </div>

</>
      )}
      {/* Car ratings */}
      <div className="panel p-4 space-y-3">
        <SectionTitle right={`Auto P${ranks.pace} de ${Object.keys(management.dev).length} · ritmo ${carPace(myDev).toFixed(1)}`}>Rendimiento del auto</SectionTitle>
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

        </>
      )}

      {/* Tabs */}
      {!section && <div className="flex gap-1 rounded-lg bg-muted/40 p-1">
        {[
          { k: "dev", label: "Desarrollo", icon: FlaskConical },
          { k: "facilities", label: "Instalaciones", icon: Building2 },
          ...(people ? [{ k: "drivers", label: "Pilotos", icon: Users }, { k: "staff", label: "Dirección", icon: Briefcase }] : []),
          { k: "finance", label: "Finanzas", icon: Wallet },
        ].map(({ k, label, icon: Icon }) => (
          <button
            key={k}
            onClick={() => setTab(k as typeof tab)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-[11px] sm:text-xs font-racing",
              tab === k ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="w-3.5 h-3.5 hidden sm:block" /> {label}
          </button>
        ))}
      </div>}

      {tab === "dev" && (
        <div className="space-y-4">
          <div className="panel p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg">En desarrollo</h3>
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

          <div className="flex flex-wrap gap-1.5">
            {AREAS.map((a) => {
              const active = p.projects.filter((x) => x.area === a).length;
              return (
                <button
                  key={a}
                  onClick={() => setDevArea(a)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors min-w-[130px]",
                    devArea === a ? "border-primary bg-primary/15" : "border-white/10 bg-black/20 hover:border-white/25",
                  )}
                >
                  <div className="tv-label text-muted-foreground">{AREA_INFO[a].label}</div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-2xl">{myDev[a].toFixed(1)}</span>
                    <span className="text-xs text-muted-foreground">P{ranks[a]}</span>
                    {active > 0 && <span className="ml-auto text-[10px] rounded bg-primary text-primary-foreground px-1.5">{active} en curso</span>}
                  </div>
                </button>
              );
            })}
          </div>
          {[devArea].map((area) => (
            <div key={area} className="space-y-2">
              <div className="flex items-baseline justify-between">
                <h4 className="font-display text-lg">{AREA_INFO[area].label}</h4>
                <span className="text-xs text-muted-foreground">
                  {myDev[area].toFixed(1)} · P{ranks[area]} · {FACILITY_INFO[AREA_INFO[area].facility].label} nivel {p.facilities[AREA_INFO[area].facility]}
                </span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {PROJECTS.filter((t) => t.area === area).map((t) => {
                  const blocked = canStartProject(management, t.id);
                  const [g0, g1] = expectedGain(t, management);
                  const level = p.partLevels?.[t.id] ?? 0;
                  const fails = p.failures?.[t.id] ?? 0;
                  const running = p.projects.find((x) => x.templateId === t.id);
                  return (
                    <div key={t.id} className="rounded-lg border border-border bg-card p-2.5 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium leading-tight">
                          {t.name}
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {level > 0 ? `Versión actual v${level} · próxima v${level + 1}` : "Sin mejoras todavía · próxima v1"}
                          </div>
                        </div>
                        <div className="text-right text-xs shrink-0">
                          <div className="font-racing">{money(t.cost)}</div>
                          <div className="text-muted-foreground">
                            {projectRaces(t, p)} carrera{projectRaces(t, p) === 1 ? "" : "s"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span>
                          Mejora: <span className="text-green-400">+{g0}–{g1}</span>
                        </span>
                        <span className={cn(fails ? "text-emerald-300" : "text-muted-foreground")}>
                          Éxito {Math.round(successChance(t, management) * 100)}%{fails ? ` (reintento +${fails * 12}%)` : ""}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant={blocked ? "outline" : "default"}
                        disabled={!!blocked}
                        onClick={() => onStartProject(t.id)}
                        className="w-full h-7 text-xs"
                      >
                        {running ? `En desarrollo · ${running.racesLeft} carrera${running.racesLeft === 1 ? "" : "s"}` : blocked ?? (fails ? "Reintentar" : level ? `Desarrollar v${level + 1}` : "Desarrollar")}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">
            Cada pieza se puede mejorar una y otra vez (v1, v2, v3…); cada nueva versión rinde un 15% menos. Si un proyecto falla entrega
            solo ~30% de la mejora, no sube de versión y el siguiente intento tiene +12% de probabilidad de éxito. Las piezas grandes
            (fondo plano, motor, peso) tardan hasta 10 carreras. El director técnico multiplica las mejoras. Aerodinámica pesa más en
            circuitos de alta carga (Mónaco, Hungría, Singapur), el motor en los rápidos (Monza, Spa, Las Vegas).
          </p>
        </div>
      )}

      {tab === "facilities" && <FacilitiesCampus management={management} teamColor={team.hex} onUpgrade={onUpgradeFacility} />}

      {tab === "drivers" && people && onOffer && onRelease && (
        <DriversPanel
          people={people}
          team={team}
          teams={teams}
          management={management}
          onOffer={onOffer}
          onRelease={onRelease}
          round={round}
          onHireReserve={onHireReserve}
          onReleaseReserve={onReleaseReserve}
          onProfile={onProfile}
        />
      )}
      {tab === "staff" && people && onHireStaff && (
        <StaffPanel people={people} team={team} teams={teams} management={management} onHire={onHireStaff} onFire={onFireStaff} onRenew={onRenewStaff} round={round} />
      )}

      {tab === "finance" && (
        <Finance management={management} onSignSponsor={onSignSponsor} round={round} payrollYear={pay ? pay.drivers + pay.staff : 0} />
      )}

      {!section && <InboxList management={management} />}
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
      <div className="font-display text-3xl">{value.toFixed(1)}</div>
      <div className="relative h-1.5 rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
        <div className="absolute -top-1 w-0.5 h-3.5 bg-foreground/60" style={{ left: `${bestPct}%` }} title={`Mejor del grid: ${best.toFixed(1)}`} />
      </div>
    </button>
  );
}

type Group = "income" | "running" | "invest";

const groupOf = (cat: LedgerCategory): Group | null =>
  cat === "initial" ? null : isInvestment(cat) ? "invest" : CATEGORY_INFO[cat].kind === "income" ? "income" : "running";

const GROUP_LABEL: Record<Group, string> = {
  income: "Ingresos",
  running: "Gastos de carrera",
  invest: "Inversiones (I+D, instalaciones y fichajes)",
};

const fmt = (x: number, sign = true) => `${sign && x > 0 ? "+" : ""}${x.toFixed(1)} M`;

/** Budget cap in force: how much of it has gone into R&D and facilities this season. */
function CapTracker({ management }: { management: ManagementState }) {
  const cap = management.regs?.budgetCap;
  if (!cap || !management.player) return null;
  const spent = seasonInvestment(management.player);
  const pct = Math.min(100, (spent / cap) * 100);
  const tone = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div className="panel p-4 space-y-2 border-primary/40">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg">Límite presupuestario</h3>
        <span className="font-racing text-lg tabular-nums">
          US$ {spent.toFixed(1)} M <span className="text-muted-foreground text-sm">/ {cap} M</span>
          <span className={cn("ml-2 text-sm", pct >= 90 ? "text-red-400" : pct >= 70 ? "text-amber-300" : "text-emerald-300")}>{pct.toFixed(0)}%</span>
        </span>
      </div>
      <div className="h-3 rounded-full bg-white/10 overflow-hidden">
        <motion.div className={cn("h-full rounded-full", tone)} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} />
      </div>
      <p className="text-xs text-muted-foreground">
        Te quedan <b className="text-foreground">US$ {Math.max(0, cap - spent).toFixed(1)} M</b> para I+D e instalaciones esta temporada. Los gastos de
        carrera, sueldos y fichajes no cuentan para el límite.
      </p>
    </div>
  );
}

/** Where the season is heading if things go on like this. */
function SeasonOutlook({ management, round, payrollYear }: { management: ManagementState; round: number; payrollYear: number }) {
  const p = management.player!;
  const total = calendar().length;
  const left = Math.max(0, total - round);
  const ledger = p.ledger.map((l) => ({ ...l, cat: ledgerCategory(l) }));
  const raced = ledger.filter((l) => l.race >= 1 && l.race <= round);
  const perRace = (cats: LedgerCategory[]) =>
    round > 0 ? raced.filter((l) => cats.includes(l.cat) && !/prima/i.test(l.concept)).reduce((a, l) => a + l.amount, 0) / round : null;
  const base = baseRaceBalance(management, Math.max(1, round + 1), payrollYear);
  const incPer = perRace(["tv", "sponsor", "prize"]) ?? base.income;
  const costPer = -(perRace(["logistics", "staff", "parts", "operations", "repairs", "salaries"]) ?? -base.costs);
  // sponsor contracts ending before the season does: what they pay if the slot isn't filled again
  const sponsorRisk = p.sponsors.reduce((a, s) => a + s.base * Math.max(0, left - s.racesLeft), 0);
  const income = Math.max(0, incPer * left);
  const costs = costPer * left;
  const end = p.budget + income - costs;
  const rank = champRankOf(management, p.teamId);
  const prize = constructorsPrize(rank, management.regs?.flatPrize);
  const row = (label: string, value: number, hint?: string, strong = false) => (
    <div className={cn("flex justify-between items-baseline gap-3 text-sm", strong && "border-t border-border pt-2")}>
      <span className={cn(strong ? "font-medium" : "text-muted-foreground")}>
        {label}
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      <span className={cn("font-mono tabular-nums", strong && "font-racing text-lg", value < 0 && "text-destructive")}>
        {value >= 0 && !strong ? "+" : ""}
        {value.toFixed(1)} M
      </span>
    </div>
  );
  return (
    <div className="panel p-4 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg">Proyección a fin de temporada</h3>
        <span className="text-xs text-muted-foreground">
          {left} carrera{left === 1 ? "" : "s"} por disputar de {total}
        </span>
      </div>
      {row("Presupuesto actual", p.budget, undefined)}
      {row("Ingresos estimados", income, `TV, patrocinadores y premios: ~${incPer.toFixed(1)} M por carrera${sponsorRisk > 0 ? `. Supone que reemplazas los patrocinios que vencen (si no, −${sponsorRisk.toFixed(1)} M)` : ""}`)}
      {row("Gastos de carrera estimados", -costs, `Logística, operación, reparaciones y sueldos: ~${costPer.toFixed(1)} M por carrera`)}
      {row("Presupuesto al final de la temporada", end, undefined, true)}
      <div className="flex justify-between items-baseline gap-3 text-sm pt-1">
        <span className="text-muted-foreground">
          Premio de constructores esperado
          <span className="block text-[11px]">Si terminas P{rank} en constructores (posición actual); se cobra al empezar la próxima temporada</span>
        </span>
        <span className="font-mono text-emerald-300">+{prize} M</span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Estimación con el promedio de las carreras disputadas. No incluye nuevas inversiones, fichajes ni eventos de la agenda.
        {end < 0 ? " ⚠️ Al ritmo actual terminarías en negativo." : ""}
      </p>
    </div>
  );
}

function Finance({
  management, onSignSponsor, round, payrollYear,
}: {
  management: ManagementState;
  onSignSponsor: (id: string) => void;
  round: number;
  payrollYear: number;
}) {
  const p = management.player!;
  const ledger = p.ledger.map((l) => ({ ...l, cat: ledgerCategory(l) }));
  const [open, setOpen] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const initial = ledger.filter((l) => l.cat === "initial").reduce((a, l) => a + l.amount, 0);
  const byGroup = (g: Group) => ledger.filter((l) => groupOf(l.cat) === g);
  const sum = (ls: { amount: number }[]) => ls.reduce((a, l) => a + l.amount, 0);
  const catTotals = (g: Group) => {
    const m = new Map<LedgerCategory, number>();
    for (const l of byGroup(g)) m.set(l.cat, (m.get(l.cat) ?? 0) + l.amount);
    return [...m.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  };

  // per-round table with running balance
  const rounds = [...new Set(ledger.map((l) => l.race))].sort((a, b) => a - b);
  let balance = 0;
  const rows = rounds.map((r) => {
    const items = ledger.filter((l) => l.race === r);
    const inc = sum(items.filter((l) => groupOf(l.cat) === "income"));
    const run = sum(items.filter((l) => groupOf(l.cat) === "running"));
    const inv = sum(items.filter((l) => groupOf(l.cat) === "invest"));
    const init = sum(items.filter((l) => l.cat === "initial"));
    balance += init + inc + run + inv;
    return { r, items, inc, run, inv, net: inc + run + inv, balance };
  });
  const shown = showAll ? [...rows].reverse() : [...rows].reverse().slice(0, 6);

  return (
    <div className="space-y-4">
      <CapTracker management={management} />
      {/* Statement: how the available budget is reached */}
      <div className="panel p-4 space-y-2">
        <h3 className="font-display text-lg">Estado de cuenta de la temporada</h3>
        <StatementLine label="Presupuesto inicial" value={initial} strong={false} sign={false} />
        {(["income", "running", "invest"] as Group[]).map((g) => (
          <details key={g} className="group">
            <summary className="list-none cursor-pointer">
              <StatementLine label={`${g === "income" ? "+" : "−"} ${GROUP_LABEL[g]}`} value={sum(byGroup(g))} expandable />
            </summary>
            <div className="ml-4 mt-1 mb-2 space-y-0.5">
              {catTotals(g).length === 0 && <div className="text-xs text-muted-foreground">Sin movimientos todavía</div>}
              {catTotals(g).map(([cat, v]) => (
                <div key={cat} className="flex justify-between text-xs text-muted-foreground">
                  <span>{CATEGORY_INFO[cat].label}</span>
                  <span className="font-mono">{fmt(v)}</span>
                </div>
              ))}
            </div>
          </details>
        ))}
        <div className="border-t border-border pt-2 flex justify-between items-baseline">
          <span className="font-medium">= Presupuesto disponible</span>
          <span className={cn("font-racing text-lg", p.budget < 0 ? "text-destructive" : "text-foreground")}>
            US$ {p.budget.toFixed(1)} M
          </span>
        </div>
      </div>

      <SeasonOutlook management={management} round={round} payrollYear={payrollYear} />

      <Sponsors management={management} onSignSponsor={onSignSponsor} />

      {/* Round by round */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-3 py-2 text-xs font-racing border-b border-border">Resumen por ronda</div>
        <div className="grid grid-cols-[1fr_repeat(5,minmax(0,80px))] gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30">
          <span>Ronda</span>
          <span className="text-right">Ingresos</span>
          <span className="text-right">Carrera</span>
          <span className="text-right">Inversión</span>
          <span className="text-right">Neto</span>
          <span className="text-right">Saldo</span>
        </div>
        {shown.map((row) => (
          <div key={row.r} className="border-t border-border/40">
            <button
              onClick={() => setOpen(open === row.r ? null : row.r)}
              className="w-full grid grid-cols-[1fr_repeat(5,minmax(0,80px))] gap-2 px-3 py-2 text-sm hover:bg-muted/20 text-left"
            >
              <span>
                {open === row.r ? "▾" : "▸"} {row.r === 0 ? "Pretemporada" : `Ronda ${row.r} · ${calendar()[row.r - 1]?.flag ?? ""}`}
              </span>
              <span className="text-right font-mono text-xs text-green-400">{row.inc ? fmt(row.inc) : "—"}</span>
              <span className="text-right font-mono text-xs text-red-400">{row.run ? fmt(row.run) : "—"}</span>
              <span className="text-right font-mono text-xs text-red-400">{row.inv ? fmt(row.inv) : "—"}</span>
              <span className={cn("text-right font-mono text-xs", row.net >= 0 ? "text-green-400" : "text-red-400")}>{fmt(row.net)}</span>
              <span className="text-right font-mono text-xs">{row.balance.toFixed(1)}</span>
            </button>
            {open === row.r && (
              <div className="px-6 pb-3 space-y-2">
                {(["income", "running", "invest"] as Group[]).map((g) => {
                  const items = row.items.filter((l) => groupOf(l.cat) === g).sort((a, b) => b.amount - a.amount);
                  if (!items.length) return null;
                  return (
                    <div key={g}>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{GROUP_LABEL[g]}</div>
                      {items.map((l, i) => (
                        <div key={i} className="flex justify-between text-xs py-0.5">
                          <span>{l.concept}</span>
                          <span className={cn("font-mono", l.amount >= 0 ? "text-green-400" : "text-red-400")}>{fmt(l.amount)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
                {row.r > 0 && row.inv !== 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    Las inversiones de esta fila se hicieron después de la ronda {row.r}, antes de la siguiente carrera.
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
        {rows.length > 6 && (
          <button onClick={() => setShowAll((v) => !v)} className="w-full py-2 text-xs text-primary hover:underline border-t border-border/40">
            {showAll ? "Ver menos" : `Ver todas las rondas (${rows.length})`}
          </button>
        )}
      </div>
    </div>
  );
}

function StatementLine({
  label, value, strong, sign = true, expandable,
}: { label: string; value: number; strong?: boolean; sign?: boolean; expandable?: boolean }) {
  return (
    <div className="flex justify-between items-baseline text-sm">
      <span className={cn(strong && "font-medium")}>
        {label} {expandable && <span className="text-[10px] text-muted-foreground group-open:hidden">(ver detalle)</span>}
      </span>
      <span className={cn("font-mono", !sign ? "" : value >= 0 ? "text-green-400" : "text-red-400")}>
        {sign ? fmt(value) : `${value.toFixed(1)} M`}
      </span>
    </div>
  );
}

const TYPICAL = { points: 6, podiums: 0, wins: 0, pole: false, dnfs: 0.2 };

function Sponsors({ management, onSignSponsor }: { management: ManagementState; onSignSponsor: (id: string) => void }) {
  const p = management.player!;
  return (
    <div className="panel p-4 space-y-4">
      <div>
        <h3 className="font-display text-lg">Patrocinadores</h3>
        <p className="text-[11px] text-muted-foreground">
          1 principal y 2 secundarios. Cada contrato tiene un estilo distinto: pago fijo, bonos por resultado, prima de firma o
          exigencias de rendimiento. Lo que ofrecen depende de tu posición en el campeonato de constructores (ahora
          P{champRankOf(management, p.teamId)}). Llegan ofertas nuevas cada 6 carreras o cuando termina un contrato.
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
        {s.minRank !== null && <span className="rounded bg-yellow-500/15 text-yellow-300 px-1.5 py-0.5">Requiere top {s.minRank} en constructores</span>}
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
    <div className="panel p-4 space-y-2">
      <h3 className="font-display text-lg flex items-center gap-2">
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
