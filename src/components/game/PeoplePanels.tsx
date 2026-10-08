import { useMemo, useState } from "react";
import { UserPlus, UserMinus, CheckCircle2, AlertTriangle, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Team } from "@/data/f1Data";
import { STAFF_ROLE_INFO, STAFF_ROLES, type StaffRole } from "@/data/peopleData";
import { SectionTitle } from "./visuals";
import { NegotiationDialog, type NegotiationAnswer } from "./NegotiationDialog";
import {
  ageOf, askingSalary, availableForNextSeason, carRankOf, lineup, nextSeasonLineup, payroll, teamStaff,
  tdMult, tdSuccess, tpSponsorMult, severance, VACANT_RATING, talkOf, renewalAsk, willRetire, seatOpenNow, signableNow, signedFor, f1Ready, whereIs, reserveOf, reserveAsk, reserveDevBonus,
  type DriverRecord, type ManagementState, type PeopleState, type StaffRecord,
} from "@/engine";
import { TeamStripe } from "./common";
import { cn } from "@/lib/utils";
import { MoodSummary } from "./DriverMood";

const m1 = (x: number) => `US$ ${x.toFixed(1)} M`;

/** The potential of young drivers is only known roughly. */
function potentialLabel(d: DriverRecord, season: number) {
  const age = ageOf(d, season);
  if (age >= 27 || d.potential - d.pace < 1) return "—";
  const fuzz = ((d.id.charCodeAt(0) + d.id.length * 7) % 5) - 2; // stable per driver
  const mid = Math.round(d.potential + fuzz);
  return `${mid - 2}–${Math.min(99, mid + 2)}`;
}

const STAT_ES: Record<string, string> = { pace: "Ritmo", consistency: "Constancia", racecraft: "Carrera", tyreMgmt: "Neumáticos", defending: "Defensa" };

function Ratings({ d, season }: { d: DriverRecord; season?: number }) {
  const mods = (d.mods ?? []).filter((m) => season === undefined || m.season === season);
  return (
    <div className="space-y-1">
      <span className="text-[11px] text-muted-foreground tabular-nums">
        Ritmo <b className="text-foreground">{d.pace.toFixed(1)}</b> · Carrera {d.racecraft.toFixed(1)} · Defensa {d.defending.toFixed(1)} · Constancia{" "}
        {d.consistency.toFixed(1)} · Neum. {d.tyreMgmt.toFixed(1)}
      </span>
      {mods.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {mods.map((m, i) => (
            <span
              key={i}
              title={m.label}
              className={cn("text-[10px] rounded px-1.5 py-0.5 border", m.delta > 0 ? "border-emerald-500/40 text-emerald-300" : "border-red-500/40 text-red-300")}
            >
              {STAT_ES[m.stat] ?? m.stat} {m.delta > 0 ? "+" : ""}
              {m.delta} · {m.label.length > 28 ? m.label.slice(0, 28) + "…" : m.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

type MarketFilter = "all" | "contract" | "free" | "junior";

export function DriversPanel({
  people, team, teams, management, onOffer, onRelease, round = 0, onHireReserve, onReleaseReserve, onProfile,
}: {
  onHireReserve?: (driverId: string, years: number) => { ok: boolean; message: string };
  onReleaseReserve?: () => void;
  onProfile?: (driverId: string) => void;
  people: PeopleState;
  team: Team;
  teams: Team[];
  management: ManagementState;
  onOffer: (driverId: string, salary: number, years: number) => NegotiationAnswer;
  onRelease: (driverId: string) => void;
  round?: number;
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
  const teamName = (id?: string | null) => teams.find((t) => t.id === id);
  const openNow = seatOpenNow(people, team.id);

  const market = useMemo(
    () =>
      Object.values(people.drivers)
        .filter(
          (d) =>
            d.status !== "retired" &&
            d.contract?.teamId !== team.id &&
            (availableForNextSeason(people, d) || (openNow && signableNow(d)) || (filter === "junior" && d.status === "junior")),
        )
        .filter((d) =>
          filter === "all" ? true : filter === "contract" ? d.status === "active" : filter === "free" ? d.status === "free" : d.status === "junior",
        )
        .sort((a, b) => b.pace - a.pace),
    [people, filter, team.id, openNow],
  );

  const openOffer = (d: DriverRecord) => setOffering(d.id);
  const offerFor = offering ? people.drivers[offering] : null;
  const offerForm = (_d: DriverRecord) => null;

  return (
    <div className="space-y-4">
      <div className="panel p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg">Tus pilotos · {season}</h3>
          <span className="text-xs text-muted-foreground">Sueldos de pilotos: {m1(pay.drivers)}/año</span>
        </div>
        {openNow && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Tienes {mine.length === 1 ? "un asiento libre" : "dos asientos libres"} para {season}. Los pilotos libres y los juveniles de F2 firman y corren desde ya.
          </div>
        )}
        {mine.map((d) => {
          const ends = d.contract && d.contract.until <= season;
          const renewed = d.nextContract?.teamId === team.id;
          const leaving = d.nextContract && d.nextContract.teamId !== team.id;
          return (
            <div key={d.id} className="rounded-lg border border-border/60 p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <button className="text-sm font-medium hover:underline" onClick={() => onProfile?.(d.id)}>
                  {d.nationality} {d.name}
                </button>
                <span className="text-xs text-muted-foreground">{ageOf(d, season)} años · potencial {potentialLabel(d, season)}</span>
                <span className="ml-auto text-xs">
                  {m1(d.contract?.salary ?? 0)}/año · hasta {d.contract?.until}
                </span>
              </div>
              <Ratings d={d} season={season} />
              <div className="mt-3 rounded-md bg-black/20 p-2">
                <MoodSummary d={d} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {renewed ? (
                  <span className="text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Renovado hasta {d.nextContract!.until} ({m1(d.nextContract!.salary)}/año)
                  </span>
                ) : leaving ? (
                  <span className="text-orange-300">Se va a {teamName(d.nextContract!.teamId)?.name} en {next}</span>
                ) : ends && willRetire(d, season) ? (
                  <span className="text-orange-300 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Se retira al final de {season}: no renovará
                  </span>
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
          {nextLine.length < 2 && " Si no completas la dupla, el asiento quedará libre y tendrás que ficharlo antes del primer GP."}
        </div>
      </div>

      <ReservePanel
        people={people}
        team={team}
        teams={teams}
        onHire={onHireReserve}
        onRelease={onReleaseReserve}
        onProfile={onProfile}
      />

      <div className="panel p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg">Mercado de pilotos {openNow ? `· ${season} y ${next}` : `para ${next}`}</h3>
          <div className="flex text-[11px] rounded border border-border overflow-hidden">
            {(
              [
                ["all", "Todos"],
                ["contract", "Fin de contrato"],
                ["free", "Libres"],
                ["junior", "Cantera F2/F3"],
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
          competitivo y un jefe de equipo reconocido bajan lo que piden. Los mayores de 35 pueden retirarse. Los juveniles empiezan en la
          F3, suben a la F2 y solo están listos para la F1 cuando muestran nivel (ritmo 77 o dos temporadas sólidas en F2).
        </p>
        <div className="divide-y divide-border/40">
          {market.map((d) => {
            const t = teamName(d.contract?.teamId);
            const retiring = willRetire(d, season) && !(openNow && signableNow(d));
            const notReady = d.status === "junior" && !f1Ready(d);
            const now = openNow && signableNow(d);
            return (
              <div key={d.id} className="py-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {t ? <TeamStripe color={t.hex} /> : <span className="w-1" />}
                  <button className="text-sm hover:underline text-left" onClick={() => onProfile?.(d.id)}>
                    {d.nationality} {d.name}
                  </button>
                  <span className="text-[11px] text-muted-foreground">
                    {ageOf(d, next)} años · {whereIs(d, (id) => teamName(id)?.name)}
                    {" · "}
                    {(d.f1Seasons ?? 0) > 0 ? `${d.f1Seasons} temp. en F1` : "sin experiencia en F1"}
                  </span>
                  <span className="ml-auto flex items-center gap-3 text-xs tabular-nums">
                    <span>
                      Ritmo <b>{d.pace.toFixed(0)}</b>
                    </span>
                    <span className="text-muted-foreground">Pot. {potentialLabel(d, season)}</span>
                    <span className="w-24 text-right">{m1(askingSalary(d, next, carRank, tp))}</span>
                    {notReady ? (
                      <span className="text-[11px] text-muted-foreground w-[74px] text-center" title="Todavía no tiene nivel para la F1: sigue en la cantera">
                        En desarrollo
                      </span>
                    ) : retiring ? (
                      <span className="text-[11px] text-orange-300 w-[74px] text-center">Se retira</span>
                    ) : (
                      <Button size="sm" variant={now ? "default" : "outline"} className="h-7 text-xs" onClick={() => openOffer(d)}>
                        <UserPlus className="w-3 h-3 mr-1" /> {now ? "Fichar ya" : "Ofertar"}
                      </Button>
                    )}
                  </span>
                </div>
                {offerForm(d)}
              </div>
            );
          })}
          {!market.length && <div className="py-3 text-sm text-muted-foreground">No hay pilotos en esta categoría.</div>}
        </div>
      </div>
      {offerFor && (
        <NegotiationDialog
          open={!!offerFor}
          onClose={() => setOffering(null)}
          title={offerFor.name}
          subtitle={`${offerFor.nationality} ${ageOf(offerFor, next)} años · ritmo ${offerFor.pace.toFixed(0)} · potencial ${potentialLabel(offerFor, season)} · contrato desde ${openNow && signableNow(offerFor) ? `ya (${season})` : next}`}
          avatar={<span className="font-display text-5xl w-16 text-center" style={{ color: team.hex }}>{offerFor.number}</span>}
          ask={askingSalary(offerFor, next, carRank, tp, people.salaryCap)}
          maxYears={ageOf(offerFor, next) >= 38 ? 1 : 3}
          defaultYears={ageOf(offerFor, next) >= 33 ? 1 : 2}
          talk={talkOf(people, `d:${offerFor.id}`, offerFor.pace >= 92)}
          season={season}
          round={round + 1}
          cap={people.salaryCap}
          onOffer={(salary, years) => onOffer(offerFor.id, salary, years)}
        />
      )}
    </div>
  );
}

/** The reserve / test driver: cheap, works in the simulator and is the first option if a seat opens. */
function ReservePanel({
  people, team, teams, onHire, onRelease, onProfile,
}: {
  people: PeopleState;
  team: Team;
  teams: Team[];
  onHire?: (driverId: string, years: number) => { ok: boolean; message: string };
  onRelease?: () => void;
  onProfile?: (driverId: string) => void;
}) {
  const season = people.season;
  const cur = reserveOf(people, team.id);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name;
  const candidates = useMemo(
    () =>
      Object.values(people.drivers)
        .filter(
          (d) =>
            (d.status === "free" || (d.status === "junior" && f1Ready(d))) &&
            !d.contract &&
            !d.nextContract &&
            (!d.reserveOf || d.reserveOf === team.id) &&
            d.id !== cur?.id &&
            d.series !== "NASCAR",
        )
        .sort((a, b) => b.pace - a.pace)
        .slice(0, 10),
    [people, team.id, cur?.id],
  );
  const pct = (pace?: number) => `+${Math.round(reserveDevBonus(pace) * 100)}%`;
  return (
    <div className="panel p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg">Piloto de reserva</h3>
        <span className="text-[11px] text-muted-foreground">Trabaja en el simulador y en las pruebas: acelera el desarrollo. Es la primera opción si se libera un asiento.</span>
      </div>
      {cur ? (
        <div className="rounded-lg border border-border/60 p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button className="text-sm font-medium hover:underline" onClick={() => onProfile?.(cur.id)}>
            {cur.nationality} {cur.name}
          </button>
          <span className="text-xs text-muted-foreground">
            {ageOf(cur, season)} años · ritmo {cur.pace.toFixed(1)} · {(cur.f1Seasons ?? 0) > 0 ? `${cur.f1Seasons} temp. en F1` : "sin experiencia en F1"}
            {cur.series && cur.series !== "F2" && cur.series !== "F3" ? ` · también corre en ${cur.series}` : ""}
          </span>
          <span className="text-xs text-green-400">Desarrollo {pct(cur.pace)}</span>
          <span className="ml-auto text-xs">
            {m1(cur.reserveSalary ?? 0)}/año · hasta {cur.reserveUntil ?? season}
          </span>
          <div className="w-full flex gap-2">
            <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => setOpen((o) => !o)}>
              Cambiar reserva
            </Button>
            {onHire && (cur.reserveUntil ?? season) <= season && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMsg(onHire(cur.id, 2).message)}>
                Renovar 2 años · {m1(reserveAsk(cur, season))}/año
              </Button>
            )}
            {onRelease && (
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-destructive" onClick={onRelease}>
                Liberar
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-center gap-3 text-sm text-amber-200">
          <AlertTriangle className="w-4 h-4" /> Sin piloto de reserva: el desarrollo pierde el trabajo de simulador.
          <Button size="sm" variant="secondary" className="h-7 text-xs ml-auto" onClick={() => setOpen(true)}>
            Elegir reserva
          </Button>
        </div>
      )}
      {msg && <div className="text-xs text-emerald-300">{msg}</div>}
      {open && (
        <div className="divide-y divide-border/40">
          {candidates.map((d) => (
            <div key={d.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <button className="text-sm hover:underline" onClick={() => onProfile?.(d.id)}>
                {d.nationality} {d.name}
              </button>
              <span className="text-[11px] text-muted-foreground">
                {ageOf(d, season)} años · {whereIs(d, teamName)} · {(d.f1Seasons ?? 0) > 0 ? `${d.f1Seasons} temp. en F1` : "sin experiencia en F1"}
              </span>
              <span className="ml-auto flex items-center gap-3 text-xs tabular-nums">
                <span>
                  Ritmo <b>{d.pace.toFixed(0)}</b>
                </span>
                <span className="text-green-400">{pct(d.pace)}</span>
                <span className="w-20 text-right">{m1(reserveAsk(d, season))}/año</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={!onHire}
                  onClick={() => {
                    const r = onHire!(d.id, 1);
                    setMsg(r.message);
                    if (r.ok) setOpen(false);
                  }}
                >
                  Contratar
                </Button>
              </span>
            </div>
          ))}
          {!candidates.length && <div className="py-2 text-sm text-muted-foreground">No hay pilotos disponibles.</div>}
        </div>
      )}
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
  people, team, teams, management, onHire, onFire, onRenew, round = 0,
}: {
  people: PeopleState;
  team: Team;
  teams: Team[];
  management: ManagementState;
  onHire: (staffId: string, salary: number, years: number) => NegotiationAnswer;
  onFire?: (staffId: string) => void;
  onRenew?: (staffId: string, salary: number, years: number) => NegotiationAnswer;
  round?: number;
}) {
  const season = people.season;
  const mine = teamStaff(people, team.id);
  const [role, setRole] = useState<StaffRole | "all">("all");
  const [confirmFire, setConfirmFire] = useState<string | null>(null);
  const [talking, setTalking] = useState<{ id: string; mode: "hire" | "renew" } | null>(null);
  const tStaff = talking ? people.staff[talking.id] : null;
  const free = Object.values(people.staff)
    .filter((s) => !s.teamId && !s.signed && !s.retired && (role === "all" || s.role === role))
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
            const incoming = signedFor(people, team.id, r);
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
                    {incoming && (
                      <div className="text-[11px] text-sky-300">
                        Reemplazo firmado: {incoming.name} ({incoming.rating}) llega en {season + 1}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {ends && onRenew && !incoming && (
                        <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => setTalking({ id: st.id, mode: "renew" })}>
                          Negociar renovación
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
                    <div className="text-[11px] text-muted-foreground">
                      {incoming ? `${incoming.name} ya firmó y llega en ${season + 1}.` : `Sin nadie en el puesto el área rinde como un ${VACANT_RATING}. Contrata abajo.`}
                    </div>
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
          Cada candidato tiene un sueldo estimado; puedes ofrecer más o menos. La prima de firma es medio año del sueldo acordado. Si el puesto
          está vacante entra de inmediato y la prima se paga al firmar; si está ocupado, llega al final de la temporada (cuando sale quien lo
          ocupa, sin indemnización) y la prima se paga al llegar. Solo despedir a alguien tiene costo de indemnización.
        </p>
        <div className="divide-y divide-border/40">
          {free.map((s) => {
            const current = mine[s.role];
            const cost = s.salary * 0.5;
            const taken = !!signedFor(people, team.id, s.role);
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
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={taken || (!current && budget < cost * 0.6)}
                    onClick={() => setTalking({ id: s.id, mode: "hire" })}
                    title={
                      taken
                        ? "Ya firmaste a alguien para ese puesto"
                        : !current && budget < cost * 0.6
                          ? `Sin presupuesto para la prima de firma (≈ US$ ${cost.toFixed(1)} M)`
                          : current
                            ? `Llega en ${season + 1}; la prima de firma se paga entonces`
                            : undefined
                    }
                  >
                    Negociar
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
      {tStaff && talking && (
        <NegotiationDialog
          open
          onClose={() => setTalking(null)}
          title={tStaff.name}
          subtitle={`${tStaff.nationality} ${STAFF_ROLE_INFO[tStaff.role].label} · valoración ${tStaff.rating} · ${talking.mode === "renew" ? `contrato actual hasta ${tStaff.until ?? season}` : "disponible"}`}
          avatar={<span className="text-5xl w-16 text-center">{ROLE_ICON[tStaff.role]}</span>}
          ask={talking.mode === "renew" ? renewalAsk(tStaff) : tStaff.salary}
          defaultYears={talking.mode === "renew" ? 2 : 3}
          talk={talkOf(people, `${talking.mode === "renew" ? "r" : "s"}:${tStaff.id}`, tStaff.rating >= 88)}
          season={season}
          round={round + 1}
          onOffer={(salary, years) => (talking.mode === "renew" ? onRenew!(tStaff.id, salary, years) : onHire(tStaff.id, salary, years))}
          costNote={(salary) => {
            if (talking.mode === "renew") return `Renovación: el nuevo sueldo rige desde ya.`;
            const cur = mine[tStaff.role];
            return cur
              ? `Llega al terminar ${season}, cuando sale ${cur.name} (sin indemnización). La prima de US$ ${(salary * 0.5).toFixed(1)} M se paga al llegar.`
              : `Al firmar pagas US$ ${(salary * 0.5).toFixed(1)} M de prima. Entra de inmediato.`;
          }}
        />
      )}
    </div>
  );
}
