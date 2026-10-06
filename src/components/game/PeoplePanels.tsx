import { useMemo, useState } from "react";
import { UserPlus, UserMinus, CheckCircle2, AlertTriangle, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Team } from "@/data/f1Data";
import { STAFF_ROLE_INFO } from "@/data/peopleData";
import {
  ageOf, askingSalary, availableForNextSeason, carRankOf, lineup, nextSeasonLineup, payroll, teamStaff,
  tdMult, tdSuccess, tpSponsorMult,
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
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-racing text-sm">Tus pilotos · {season}</h3>
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

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-racing text-sm">Mercado de pilotos para {next}</h3>
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

export function StaffPanel({
  people, team, teams, management, onHire,
}: {
  people: PeopleState;
  team: Team;
  teams: Team[];
  management: ManagementState;
  onHire: (staffId: string) => void;
}) {
  const mine = teamStaff(people, team.id);
  const free = Object.values(people.staff).filter((s) => !s.teamId).sort((a, b) => b.rating - a.rating);
  const budget = management.player?.budget ?? 0;
  const effect = (s: StaffRecord) =>
    s.role === "td"
      ? `Mejoras de I+D ×${tdMult(s.rating).toFixed(2)} · éxito ${tdSuccess(s.rating) >= 0 ? "+" : ""}${Math.round(tdSuccess(s.rating) * 100)}%`
      : `Patrocinadores ×${tpSponsorMult(s.rating).toFixed(2)} · sueldos de pilotos ×${(1.08 - (s.rating - 70) * 0.006).toFixed(2)}`;

  const card = (s: StaffRecord | null, role: "tp" | "td") => (
    <div className="rounded-lg border border-border/60 p-3 space-y-1">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{STAFF_ROLE_INFO[role].label}</div>
      {s ? (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {s.nationality} {s.name}
            </span>
            <span className="font-racing">{s.rating}</span>
          </div>
          <div className="text-xs text-green-400">{effect(s)}</div>
          <div className="text-[11px] text-muted-foreground">Sueldo {m1(s.salary)}/año</div>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">Vacante</div>
      )}
      <div className="text-[11px] text-muted-foreground">{STAFF_ROLE_INFO[role].effect}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-racing text-sm flex items-center gap-2">
          <Briefcase className="w-4 h-4" /> Dirección de {team.name}
        </h3>
        <div className="grid md:grid-cols-2 gap-3">
          {card(mine.tp, "tp")}
          {card(mine.td, "td")}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <h3 className="font-racing text-sm">Disponibles para contratar</h3>
        <p className="text-[11px] text-muted-foreground">
          Contratar cuesta medio año de sueldo como prima, más medio año de indemnización para quien deja el cargo. El efecto es inmediato.
        </p>
        <div className="divide-y divide-border/40">
          {free.map((s) => {
            const current = mine[s.role];
            const cost = s.salary * 0.5 + (current ? current.salary * 0.5 : 0);
            const better = !current || s.rating > current.rating;
            return (
              <div key={s.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm">
                  {s.nationality} {s.name}
                </span>
                <span className="text-[11px] text-muted-foreground">{STAFF_ROLE_INFO[s.role].label}</span>
                <span className="text-xs text-green-400/80">{effect(s)}</span>
                <span className="ml-auto flex items-center gap-3 text-xs">
                  <span className={cn("font-racing", better ? "text-green-400" : "text-muted-foreground")}>{s.rating}</span>
                  <span className="text-muted-foreground">{m1(s.salary)}/año</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={budget < cost} onClick={() => onHire(s.id)}>
                    Contratar · {m1(cost)}
                  </Button>
                </span>
              </div>
            );
          })}
          {!free.length && <div className="py-2 text-sm text-muted-foreground">No hay directivos libres.</div>}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <h3 className="font-racing text-sm">Directivos de la parrilla</h3>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
          {teams.map((t) => {
            const st = teamStaff(people, t.id);
            return (
              <div key={t.id} className="flex items-center gap-2 text-xs py-1">
                <TeamStripe color={t.hex} />
                <span className="w-24 truncate">{t.shortName ?? t.name}</span>
                <span className="text-muted-foreground truncate flex-1">
                  {st.tp?.name ?? "—"} ({st.tp?.rating ?? "–"}) · {st.td?.name ?? "—"} ({st.td?.rating ?? "–"})
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
