import { useMemo, useState } from "react";
import { UserPlus, UserMinus, CheckCircle2, AlertTriangle, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Team } from "@/data/f1Data";
import { STAFF_ROLE_INFO, STAFF_ROLES, type StaffRole } from "@/data/peopleData";
import { SectionTitle } from "./visuals";
import {
  ageOf, askingSalary, availableForNextSeason, carRankOf, lineup, nextSeasonLineup, payroll, teamStaff,
  tdMult, tdSuccess, tpSponsorMult, severance, VACANT_RATING,
  type DriverRecord, type ManagementState, type PeopleState, type StaffRecord,
} from "@/engine";
import { TeamStripe } from "./common";
import { cn } from "@/lib/utils";

const m1 = (x: number) => `US$ ${x.toFixed(1)} M`;

/** The potential of young drivers is only known roughly. */
function potentialLabel(d: DriverRecord, season: number) {
  const age = ageOf(d, season);
  if (age >= 27 || d.potential - d.pace < 1) return "—";
  const fuzz = ((d.id.charCodeAt(0) + d.id.length * 7) % 5) - 2; // stable per driver
  const mid = Math.round(d.potential + fuzz);
  return `${mid - 2}–${Math.min(99, mid + 2)}`;
}

function Ratings({ d }: { d: DriverRecord }) {
  return (
    <span className="text-[11px] text-muted-foreground tabular-nums">
      Ritmo <b className="text-foreground">{d.pace.toFixed(0)}</b> · Carrera {d.racecraft.toFixed(0)} · Defensa {d.defending.toFixed(0)} · Constancia{" "}
      {d.consistency.toFixed(0)} · Neum. {d.tyreMgmt.toFixed(0)}
    </span>
  );
}

type MarketFilter = "all" | "contract" | "free" | "junior";

export function DriversPanel({
  people, team, teams, management, onOffer, onRelease,
}: {
  people: PeopleState;
  team: Team;
  teams: Team[];
  management: ManagementState;
  onOffer: (driverId: string, salary: number, years: number) => { ok: boolean; message: string };
  onRelease: (driverId: string) => void;
}) {
  const season = people.season;
  const next = season + 1;
  const mine = lineup(people, team.id).map((id) => people.drivers[id]);
  const nextLine = nextSeasonLineup(people, team.id);
  const carRank = carRankOf(management, team.id);
  const tp = teamStaff(people, team.id).tp?.rating ?? 80;
  const pay = payroll(people, team.id);
  const [filter, setFilter] = useState<MarketFilter>("all");
  const [offering, setOffering] = useState<string | null>(null);
  const [salary, setSalary] = useState(0);
  const [years, setYears] = useState(2);
  const [answer, setAnswer] = useState<{ ok: boolean; message: string } | null>(null);
  const teamName = (id?: string | null) => teams.find((t) => t.id === id);

  const market = useMemo(
    () =>
      Object.values(people.drivers)
        .filter((d) => d.status !== "retired" && availableForNextSeason(people, d) && d.contract?.teamId !== team.id)
        .filter((d) =>
          filter === "all" ? true : filter === "contract" ? d.status === "active" : filter === "free" ? d.status === "free" : d.status === "junior",
        )
        .sort((a, b) => b.pace - a.pace),
    [people, filter, team.id],
  );

  const openOffer = (d: DriverRecord) => {
    setOffering(d.id);
    setSalary(askingSalary(d, next, carRank, tp));
    setYears(ageOf(d, next) >= 38 ? 1 : 2);
    setAnswer(null);
  };

  const offerForm = (d: DriverRecord) =>
    offering === d.id && (
      <div className="mt-2 rounded-md border border-primary/40 bg-primary/5 p-2 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1">
            Sueldo (US$ M/año)
            <input
              type="number"
              step={0.1}
              min={0.3}
              value={salary}
              onChange={(e) => setSalary(Number(e.target.value))}
              className="w-20 rounded border border-border bg-background px-1.5 py-1"
            />
          </label>
          <div className="flex rounded border border-border overflow-hidden">
            {[1, 2, 3].map((y) => (
              <button key={y} onClick={() => setYears(y)} className={cn("px-2 py-1", years === y ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                {y} año{y > 1 ? "s" : ""}
              </button>
            ))}
          </div>
          <span className="text-muted-foreground">Pide ~{m1(askingSalary(d, next, carRank, tp))}/año</span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="text-xs" onClick={() => setAnswer(onOffer(d.id, salary, years))}>
            Enviar oferta
          </Button>
          <Button size="sm" variant="ghost" className="text-xs" onClick={() => setOffering(null)}>
            Cancelar
          </Button>
        </div>
        {answer && <div className={cn("text-xs", answer.ok ? "text-green-400" : "text-orange-300")}>{answer.message}</div>}
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="panel p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg">Tus pilotos · {season}</h3>
          <span className="text-xs text-muted-foreground">Sueldos de pilotos: {m1(pay.drivers)}/año</span>
        </div>
        {mine.map((d) => {
          const ends = d.contract && d.contract.until <= season;
          const renewed = d.nextContract?.teamId === team.id;
          const leaving = d.nextContract && d.nextContract.teamId !== team.id;
          return (
            <div key={d.id} className="rounded-lg border border-border/60 p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-medium">
                  {d.nationality} {d.name}
                </span>
                <span className="text-xs text-muted-foreground">{ageOf(d, season)} años · potencial {potentialLabel(d, season)}</span>
                <span className="ml-auto text-xs">
                  {m1(d.contract?.salary ?? 0)}/año · hasta {d.contract?.until}
                </span>
              </div>
              <Ratings d={d} />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {renewed ? (
                  <span className="text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Renovado hasta {d.nextContract!.until} ({m1(d.nextContract!.salary)}/año)
                  </span>
                ) : leaving ? (
                  <span className="text-orange-300">Se va a {teamName(d.nextContract!.teamId)?.name} en {next}</span>
                ) : ends ? (
                  <>
                    <span className="text-yellow-300 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Su contrato termina este año
                    </span>
                    <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => openOffer(d)}>
                      Renovar
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-muted-foreground">Sigue en {next}</span>
                    <button className="text-muted-foreground hover:text-destructive flex items-center gap-1" onClick={() => onRelease(d.id)}>
                      <UserMinus className="w-3 h-3" /> no seguir después de {season}
                    </button>
                  </>
                )}
              </div>
              {offerForm(d)}
            </div>
          );
        })}
        <div className="text-xs text-muted-foreground">
          Para {next}: {nextLine.length}/2 asientos ocupados
          {nextLine.length ? ` (${nextLine.map((d) => d.name).join(", ")})` : ""}.
          {nextLine.length < 2 && " Si no completas la dupla, al terminar la temporada se contrata automáticamente al mejor piloto barato disponible."}
        </div>
      </div>

      <div className="panel p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg">Mercado de pilotos para {next}</h3>
          <div className="flex text-[11px] rounded border border-border overflow-hidden">
            {(
              [
                ["all", "Todos"],
                ["contract", "Fin de contrato"],
                ["free", "Libres"],
                ["junior", "Juveniles F2"],
              ] as [MarketFilter, string][]
            ).map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={cn("px-2 py-1", filter === k ? "bg-muted text-foreground" : "text-muted-foreground")}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Los pilotos con experiencia y mucho ritmo son caros; los jóvenes son baratos y pueden crecer hasta su potencial en pocos años. Un auto
          competitivo y un jefe de equipo reconocido bajan lo que piden. Los mayores de 35 pueden retirarse.
        </p>
        <div className="divide-y divide-border/40">
          {market.map((d) => {
            const t = teamName(d.contract?.teamId);
            return (
              <div key={d.id} className="py-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {t ? <TeamStripe color={t.hex} /> : <span className="w-1" />}
                  <span className="text-sm">
                    {d.nationality} {d.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {ageOf(d, next)} años · {t ? t.name : d.origin ?? (d.status === "junior" ? "Fórmula 2" : "Libre")}
                  </span>
                  <span className="ml-auto flex items-center gap-3 text-xs tabular-nums">
                    <span>
                      Ritmo <b>{d.pace.toFixed(0)}</b>
                    </span>
                    <span className="text-muted-foreground">Pot. {potentialLabel(d, season)}</span>
                    <span className="w-24 text-right">{m1(askingSalary(d, next, carRank, tp))}</span>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openOffer(d)}>
                      <UserPlus className="w-3 h-3 mr-1" /> Ofertar
                    </Button>
                  </span>
                </div>
                {offerForm(d)}
              </div>
            );
          })}
          {!market.length && <div className="py-3 text-sm text-muted-foreground">No hay pilotos en esta categoría.</div>}
        </div>
      </div>
    </div>
  );
}

const ROLE_ICON: Record<StaffRole, string> = { tp: "🎧", td: "📐", aero: "🌀", pu: "⚡", sport: "🏁", race: "🛠️" };

function staffEffect(role: StaffRole, r: number) {
  const pct = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;
  switch (role) {
    case "tp":
      return `Patrocinios ${pct(tpSponsorMult(r) - 1)} · sueldos de pilotos ${pct(-(r - 70) * 0.006 + 0.08)}`;
    case "td":
      return `Todas las mejoras ${pct(tdMult(r) - 1)} · éxito ${pct(tdSuccess(r))}`;
    case "aero":
      return `Mejoras de aerodinámica ${pct(Math.sqrt(tdMult(r)) - 1)}`;
    case "pu":
      return `Mejoras de motor y fiabilidad ${pct(Math.sqrt(tdMult(r)) - 1)}`;
    case "sport":
      return `Pit crew ${((r - 80) * 0.15 >= 0 ? "+" : "")}${((r - 80) * 0.15).toFixed(1)} · proyectos de pits ${pct(tdMult(r) - 1)}`;
    case "race":
      return `Crecimiento de pilotos ${pct(Math.max(-0.3, Math.min(0.3, (r - 80) * 0.02)))}`;
  }
}

export function StaffPanel({
  people, team, teams, management, onHire, onFire, onRenew,
}: {
  people: PeopleState;
  team: Team;
  teams: Team[];
  management: ManagementState;
  onHire: (staffId: string) => void;
  onFire?: (staffId: string) => void;
  onRenew?: (staffId: string) => void;
}) {
  const season = people.season;
  const mine = teamStaff(people, team.id);
  const [role, setRole] = useState<StaffRole | "all">("all");
  const [confirmFire, setConfirmFire] = useState<string | null>(null);
  const free = Object.values(people.staff)
    .filter((s) => !s.teamId && (role === "all" || s.role === role))
    .sort((a, b) => b.rating - a.rating);
  const budget = management.player?.budget ?? 0;

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <SectionTitle right={`Sueldos de dirección: US$ ${payroll(people, team.id).staff.toFixed(1)} M/año`}>Dirección de {team.name}</SectionTitle>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {STAFF_ROLES.map((r) => {
            const st = mine[r];
            const ends = st && (st.until ?? season) <= season;
            return (
              <div key={r} className={cn("panel p-4 space-y-2 relative overflow-hidden", !st && "border-red-500/40")}>
                <div className="flex items-center justify-between">
                  <span className="tv-label text-muted-foreground">
                    {ROLE_ICON[r]} {STAFF_ROLE_INFO[r].label}
                  </span>
                  <span className={cn("font-display text-3xl", st ? (st.rating >= 85 ? "text-emerald-400" : st.rating < 75 ? "text-amber-300" : "") : "text-red-400")}>
                    {st?.rating ?? VACANT_RATING}
                  </span>
                </div>
                {st ? (
                  <>
                    <div className="font-display text-xl leading-tight">
                      {st.nationality} {st.name}
                    </div>
                    <div className="text-xs text-green-400">{staffEffect(r, st.rating)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {m1(st.salary)}/año · contrato hasta <b className={cn(ends && "text-yellow-300")}>{st.until ?? season}</b>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {ends && onRenew && (
                        <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => onRenew(st.id)}>
                          Renovar 2 años (+10%)
                        </Button>
                      )}
                      {onFire &&
                        (confirmFire === st.id ? (
                          <>
                            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => (onFire(st.id), setConfirmFire(null))}>
                              Confirmar · {m1(severance(st, season))}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmFire(null)}>
                              No
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-destructive" onClick={() => setConfirmFire(st.id)}>
                            Despedir
                          </Button>
                        ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-display text-xl text-red-400">Vacante</div>
                    <div className="text-[11px] text-muted-foreground">Sin nadie en el puesto el área rinde como un {VACANT_RATING}. Contrata abajo.</div>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setRole(r)}>
                      Ver candidatos
                    </Button>
                  </>
                )}
                <div className="text-[10px] text-muted-foreground/80">{STAFF_ROLE_INFO[r].effect}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg">Disponibles para contratar</h3>
          <div className="flex flex-wrap text-[11px] rounded border border-border overflow-hidden">
            {(["all", ...STAFF_ROLES] as (StaffRole | "all")[]).map((k) => (
              <button key={k} onClick={() => setRole(k)} className={cn("px-2 py-1", role === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                {k === "all" ? "Todos" : STAFF_ROLE_INFO[k].short}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Contratar cuesta medio año de sueldo como prima (contrato de 3 años). Si el puesto está ocupado, se paga la indemnización de quien sale
          (la mitad de lo que le queda de contrato). El efecto es inmediato.
        </p>
        <div className="divide-y divide-border/40">
          {free.map((s) => {
            const current = mine[s.role];
            const cost = s.salary * 0.5 + (current ? severance(current, season) : 0);
            const better = !current || s.rating > current.rating;
            return (
              <div key={s.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm">
                  {s.nationality} {s.name}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {ROLE_ICON[s.role]} {STAFF_ROLE_INFO[s.role].label}
                </span>
                <span className="text-xs text-green-400/80">{staffEffect(s.role, s.rating)}</span>
                <span className="ml-auto flex items-center gap-3 text-xs">
                  <span className={cn("font-display text-lg", better ? "text-green-400" : "text-muted-foreground")}>
                    {s.rating}
                    {current && <span className="text-[10px] text-muted-foreground"> vs {current.rating}</span>}
                  </span>
                  <span className="text-muted-foreground">{m1(s.salary)}/año</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={budget < cost} onClick={() => onHire(s.id)}>
                    Contratar · {m1(cost)}
                  </Button>
                </span>
              </div>
            );
          })}
          {!free.length && <div className="py-2 text-sm text-muted-foreground">No hay candidatos libres para este puesto.</div>}
        </div>
      </div>

      <div className="panel p-4 space-y-2 overflow-x-auto">
        <h3 className="font-display text-lg">Directivos de la parrilla</h3>
        <table className="w-full text-xs min-w-[720px]">
          <thead>
            <tr className="tv-label text-muted-foreground text-left">
              <th className="py-1 pr-2">Equipo</th>
              {STAFF_ROLES.map((r) => (
                <th key={r} className="py-1 pr-2">{STAFF_ROLE_INFO[r].short}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => {
              const st = teamStaff(people, t.id);
              return (
                <tr key={t.id} className={cn("border-t border-white/5", t.id === team.id && "text-primary")}>
                  <td className="py-1.5 pr-2 whitespace-nowrap">
                    <span className="inline-block h-3 w-1 rounded-full mr-1.5 align-middle" style={{ backgroundColor: t.hex }} />
                    {t.shortName ?? t.name}
                  </td>
                  {STAFF_ROLES.map((r) => (
                    <td key={r} className="py-1.5 pr-2 whitespace-nowrap">
                      {st[r] ? (
                        <>
                          {st[r]!.name.split(" ").slice(-1)[0]} <span className="text-muted-foreground">{st[r]!.rating}</span>
                        </>
                      ) : (
                        <span className="text-red-400">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
