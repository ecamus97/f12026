import { motion } from "framer-motion";
import { Play, FastForward, Gavel, Wallet, Gauge, FlaskConical, Handshake, ChevronRight, Trophy, MapPin, CalendarDays, UserPlus, Briefcase, Info, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Race, Team } from "@/data/f1Data";
import type { DriverStanding, TeamStanding, NewsItem, WeatherTimeline, DayWeather } from "@/engine";
import { daySummary, forecast, forecastIcon } from "@/engine";
import { NewsFeed } from "./NewsCenter";
import { AgendaCard } from "./AgendaCalendar";
import type { Activity } from "@/engine";
import { carRankOf, ageOf, teamStaff, signedFor, pendingMega, MEGA_PREP_MAX, type ManagementState, type PeopleState, type RuleProposal } from "@/engine";
import { STAFF_ROLES, STAFF_ROLE_INFO } from "@/data/peopleData";
import { CarSilhouette, CircuitOutline, DriverNumber, SectionTitle, StatTile, TeamLogo } from "./visuals";
import { InboxList, money } from "./TeamHQ";
import { cn } from "@/lib/utils";

export type NavTarget = "weekend" | "car" | "drivers" | "staff" | "finance" | "rules" | "standings" | "calendar" | "news";

export function Paddock({
  team, season, race, round, totalRaces, weekendActive, weekendHasRace, drivers, teamsStanding, management, people, proposals, onWeekend, onQuickSim, onNavigate, news, teams, weather, days, activities, onChooseActivity, isSprint, notices = [],
}: {
  team: Team;
  season: number;
  race: Race | null;
  round: number; // races completed
  totalRaces: number;
  weekendActive: boolean;
  weekendHasRace: boolean;
  drivers: DriverStanding[];
  teamsStanding: TeamStanding[];
  management: ManagementState | null;
  people: PeopleState | null;
  proposals: RuleProposal[];
  onWeekend: () => void;
  onQuickSim: () => void;
  onNavigate: (t: NavTarget) => void;
  news: NewsItem[];
  teams: Team[];
  weather: WeatherTimeline | null;
  days?: { fri?: DayWeather; sat: DayWeather } | null; // qualifying days
  activities: Activity[];
  isSprint?: boolean;
  notices?: string[]; // things that happened to your team in the off-season
  onChooseActivity: (id: string, idx: number) => void;
}) {
  const fc = weather ? forecast(weather, 0, Math.max(3, Math.round(weather.rain.length / 10))) : [];
  const raceChance = fc.reduce((a, f) => Math.max(a, f.chance), 0);
  const sat = days ? daySummary(days.sat) : null;
  const fri = days?.fri ? daySummary(days.fri) : null;
  const teamPos = teamsStanding.findIndex((t) => t.teamId === team.id) + 1;
  const myTeam = teamsStanding.find((t) => t.teamId === team.id);
  const myDrivers = drivers.map((d, i) => ({ ...d, pos: i + 1 })).filter((d) => d.teamId === team.id);
  const p = management?.player;
  const pending = proposals.filter((x) => x.status === "pending" && x.season === season);
  const carRank = management ? carRankOf(management, team.id) : 0;
  const leaderPts = drivers[0]?.points ?? 0;
  const missing = Math.max(0, 2 - team.drivers.length);

  return (
    <div className="space-y-6">
      {/* Hero: next race + team */}
      <div className="grid xl:grid-cols-[1.6fr_1fr] gap-4">
        {race ? (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="panel panel-accent overflow-hidden relative min-h-[260px]">
            <CircuitOutline raceId={race.id} className="absolute right-2 top-1/2 -translate-y-1/2 h-[115%] max-w-[55%] text-primary opacity-90 pointer-events-none drop-shadow-[0_0_12px_hsl(var(--primary)/0.6)]" width={12} />
            <div className="absolute inset-0 bg-gradient-to-r from-[hsl(222_22%_7%)] via-[hsl(222_22%_7%/0.7)] to-transparent" />
            <div className="relative p-5 md:p-7 h-full flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="tv-label bg-primary text-primary-foreground px-2 py-1 clip-slant pr-4">
                  {weekendActive ? "En curso" : "Próxima carrera"}
                </span>
                <span className="tv-label text-muted-foreground">
                  Ronda {round + 1} de {totalRaces} · {season}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-5xl md:text-6xl drop-shadow">{race.flag}</span>
                <div>
                  <h1 className="font-display text-3xl md:text-5xl">{race.name.replace(" Grand Prix", "")}</h1>
                  <div className="font-display text-lg md:text-xl text-primary">Grand Prix</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {race.circuit}</span>
                <span className="flex items-center gap-1.5"><CalendarDays className="w-4 h-4" /> {race.date}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {isSprint && <span className="rounded-md bg-sky-400 text-black px-2.5 py-1 text-xs font-bold">FIN DE SEMANA SPRINT</span>}
                <Chip label="Vueltas" value={race.track.laps} />
                <Chip label="Adelantar" value={race.track.overtaking > 0.7 ? "Difícil" : race.track.overtaking < 0.4 ? "Fácil" : "Medio"} />
                <Chip label="Desgaste" value={race.track.deg >= 1.2 ? "Alto" : race.track.deg <= 0.8 ? "Bajo" : "Medio"} />

                <Chip label="Tipo" value={(race.track.downforce ?? 0.5) >= 0.7 ? "Alta carga" : (race.track.power ?? 0.5) >= 0.75 ? "Motor" : "Mixto"} />
              </div>
              {weather && (
                <div className="flex gap-2">
                  {fri && <WeatherDay label="Viernes · Clasif. sprint" icon={fri.icon} temp={fri.airTemp} />}
                  {sat && <WeatherDay label={fri ? "Sábado · Sprint y clasif." : "Sábado · Clasificación"} icon={sat.icon} temp={sat.airTemp} />}
                  <WeatherDay label="Domingo · Carrera" icon={forecastIcon(raceChance)} temp={weather.airTemp} />
                </div>
              )}
              <div className="mt-auto flex flex-wrap gap-2">
                {missing > 0 && !weekendActive && (
                  <span className="w-full text-sm text-amber-300">Necesitas dos pilotos para correr: ficha {missing === 1 ? "uno" : "dos"} en Pilotos.</span>
                )}
                <Button onClick={onWeekend} size="lg" className="font-display text-lg h-12 px-6 shine" disabled={missing > 0 && !weekendActive}>
                  <Play className="w-5 h-5 mr-2 fill-current" />
                  {weekendActive ? (weekendHasRace ? "Volver a la carrera" : "Volver a la clasificación") : "Comenzar fin de semana"}
                </Button>
                <Button
                  onClick={onQuickSim}
                  size="lg"
                  variant="outline"
                  disabled={missing > 0 && !weekendActive}
                  className="font-display text-base h-12 px-5 bg-black/30"
                  title="Clasificación y carrera se simulan al instante con la estrategia recomendada"
                >
                  <FastForward className="w-5 h-5 mr-2" /> Simulación rápida
                </Button>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="panel panel-accent p-6 flex items-center gap-4">
            <Trophy className="w-14 h-14 text-yellow-400" />
            <div>
              <div className="font-display text-3xl">Temporada {season} terminada</div>
              <p className="text-muted-foreground text-sm">Revisa el cierre abajo para pasar al año siguiente.</p>
            </div>
          </div>
        )}

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="panel overflow-hidden relative">
          <div className="absolute inset-0" style={{ background: `radial-gradient(400px 200px at 70% 30%, ${team.hex}33, transparent 70%)` }} />
          <div className="relative p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="tv-label text-muted-foreground">Tu escudería</p>
                <div className="font-display text-3xl" style={{ color: team.hex }}>
                  {team.name}
                </div>
              </div>
              <TeamLogo teamId={team.id} color={team.hex} label={team.shortName} className="h-14 w-14 shrink-0" />
            </div>
            <CarSilhouette color={team.hex} className="w-[78%] mx-auto block h-auto drop-shadow-[0_12px_20px_rgba(0,0,0,0.6)]" />
            <div className="grid grid-cols-3 gap-2 text-center">
              <MiniStat label="Constructores" value={`P${teamPos || "-"}`} />
              <MiniStat label="Puntos" value={myTeam?.points ?? 0} />
              <MiniStat label="Auto" value={carRank ? `P${carRank}` : "-"} />
            </div>
          </div>
        </motion.div>
      </div>

      <TeamTodos team={team} people={people} management={management} notices={round === 0 ? notices : []} onNavigate={onNavigate} proposals={proposals} season={season} />

      <AgendaCard activities={activities} season={season} nextRound={round + 1} onChoose={onChooseActivity} />

      {pending.length > 0 && (
        <button onClick={() => onNavigate("rules")} className="panel panel-hover w-full text-left p-4 flex items-center gap-4 border-primary/50">
          <span className="grid place-items-center w-11 h-11 rounded-full bg-primary text-primary-foreground animate-pulse">
            <Gavel className="w-5 h-5" />
          </span>
          <div className="flex-1">
            <div className="tv-label text-primary">Votación pendiente</div>
            <div className="font-display text-xl">{pending[0].title}</div>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </button>
      )}

      {/* Drivers */}
      <div className="space-y-3">
        <SectionTitle right={<button className="hover:text-foreground" onClick={() => onNavigate("drivers")}>Contratos y mercado →</button>}>Pilotos</SectionTitle>
        <div className="grid md:grid-cols-2 gap-4">
          {myDrivers.map((d, i) => {
            const rec = people?.drivers[d.driverId];
            return (
              <motion.div
                key={d.driverId}
                initial={{ opacity: 0, x: i ? 12 : -12 }}
                animate={{ opacity: 1, x: 0 }}
                className="panel overflow-hidden relative p-5 flex items-center gap-4"
              >
                <div className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: team.hex }} />
                <DriverNumber n={d.number} color={team.hex} className="text-7xl md:text-8xl w-24 text-center shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-muted-foreground">{d.nationality} {d.driverName.split(" ").slice(0, -1).join(" ")}</div>
                  <div className="font-display text-3xl truncate">{d.driverName.split(" ").slice(-1)[0]}</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm">
                    <span><b className="font-display text-xl">P{d.pos}</b> <span className="text-muted-foreground">campeonato</span></span>
                    <span><b className="font-display text-xl">{d.points}</b> <span className="text-muted-foreground">pts</span></span>
                    {d.wins > 0 && <span><b className="font-display text-xl">{d.wins}</b> <span className="text-muted-foreground">victorias</span></span>}
                    {d.podiums > 0 && <span><b className="font-display text-xl">{d.podiums}</b> <span className="text-muted-foreground">podios</span></span>}
                  </div>
                  {leaderPts > 0 && (
                    <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(d.points / leaderPts) * 100}%`, backgroundColor: team.hex }} />
                    </div>
                  )}
                  {rec && (
                    <div className="text-[11px] text-muted-foreground mt-2">
                      {ageOf(rec, season)} años · ritmo {rec.pace.toFixed(0)} · contrato hasta {rec.contract?.until ?? "—"}
                      {rec.contract && rec.contract.until <= season && !rec.nextContract && <span className="text-yellow-300"> · termina este año</span>}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Team numbers */}
      {p && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <button className="text-left" onClick={() => onNavigate("finance")}>
            <StatTile icon={<Wallet className="w-3 h-3" />} label="Presupuesto" value={money(p.budget)} tone={p.budget < 0 ? "bad" : undefined} sub="Ver finanzas →" />
          </button>
          <button className="text-left" onClick={() => onNavigate("car")}>
            <StatTile icon={<FlaskConical className="w-3 h-3" />} label="I+D en curso" value={`${p.projects.length} proyecto${p.projects.length === 1 ? "" : "s"}`} sub={p.facilityWork ? "1 obra en construcción" : "Sin obras"} />
          </button>
          <button className="text-left" onClick={() => onNavigate("car")}>
            <StatTile icon={<Gauge className="w-3 h-3" />} label="Ritmo del auto" value={team.pace.toFixed(1)} sub={`P${carRank} de la parrilla`} />
          </button>
          <button className="text-left" onClick={() => onNavigate("finance")}>
            <StatTile
              icon={<Handshake className="w-3 h-3" />}
              label="Patrocinadores"
              value={`${p.sponsors.length}/3`}
              tone={p.sponsors.length < 3 ? "bad" : "good"}
              sub={p.sponsors.length < 3 ? "Hay espacios libres" : "Completo"}
            />
          </button>
        </div>
      )}

      <NewsFeed news={news} ctx={{ teams, management, proposals, playerTeamId: team.id }} onAll={() => onNavigate("news")} />

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4">
        {management && <InboxList management={management} limit={6} />}
        <div className="panel p-4 space-y-3">
          <SectionTitle right={<button className="hover:text-foreground" onClick={() => onNavigate("standings")}>Completo →</button>}>Campeonato</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <MiniTable
              title="Pilotos"
              rows={drivers.slice(0, 6).map((d) => ({ id: d.driverId, name: d.shortName, color: d.teamColor, pts: d.points, mine: d.teamId === team.id }))}
            />
            <MiniTable
              title="Constructores"
              rows={teamsStanding.slice(0, 6).map((t) => ({ id: t.teamId, name: t.teamName.replace(/ (F1 Team|AMG F1|Racing)$/, ""), color: t.teamColor, pts: t.points, mine: t.teamId === team.id }))}
            />
          </div>
          <div className="text-[11px] text-muted-foreground">
            {round} de {totalRaces} carreras disputadas
          </div>
        </div>
      </div>
    </div>
  );
}

function WeatherDay({ label, icon, temp }: { label: string; icon: string; temp: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5">
      <span className="text-2xl leading-none">{icon}</span>
      <div>
        <div className="tv-label text-muted-foreground !text-[9px]">{label}</div>
        <div className="text-sm font-semibold">{temp}°C</div>
      </div>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="rounded-md border border-white/10 bg-black/30 px-2.5 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span> <b className="ml-1">{value}</b>
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-black/30 border border-white/5 py-2">
      <div className="font-display text-2xl">{value}</div>
      <div className="tv-label text-muted-foreground !text-[9px]">{label}</div>
    </div>
  );
}

function MiniTable({ title, rows }: { title: string; rows: { id: string; name: string; color: string; pts: number; mine: boolean }[] }) {
  return (
    <div>
      <div className="tv-label text-muted-foreground mb-1">{title}</div>
      {rows.map((r, i) => (
        <div key={r.id} className={cn("flex items-center gap-2 py-1 text-sm", r.mine && "text-primary font-semibold")}>
          <span className="w-4 font-display text-muted-foreground">{i + 1}</span>
          <span className="h-4 w-1 rounded-full" style={{ backgroundColor: r.color }} />
          <span className="flex-1 truncate font-racing">{r.name}</span>
          <span className="tabular-nums">{r.pts}</span>
        </div>
      ))}
    </div>
  );
}

/** Agenda: what your team has to sort out (empty seats, vacant posts, sponsor slots) and off-season notices. */
function TeamTodos({
  team, people, management, notices, onNavigate, proposals, season,
}: {
  proposals: RuleProposal[];
  season: number;
  team: Team;
  people: PeopleState | null;
  management: ManagementState | null;
  notices: string[];
  onNavigate: (t: NavTarget) => void;
}) {
  const items: { icon: JSX.Element; tone: "bad" | "warn" | "info"; title: string; text: string; to?: NavTarget }[] = [];
  const missing = Math.max(0, 2 - team.drivers.length);
  if (missing)
    items.push({
      icon: <UserPlus className="w-5 h-5" />,
      tone: "bad",
      title: missing === 1 ? "Asiento libre" : "Dos asientos libres",
      text: "Ficha un piloto libre o un juvenil de F2: sin dos pilotos no puedes correr.",
      to: "drivers",
    });
  if (people) {
    const st = teamStaff(people, team.id);
    for (const r of STAFF_ROLES) {
      if (st[r]) continue;
      const rep = signedFor(people, team.id, r);
      items.push({
        icon: <Briefcase className="w-5 h-5" />,
        tone: "warn",
        title: `${STAFF_ROLE_INFO[r].label}: vacante`,
        text: rep ? `${rep.name} ya firmó.` : "El área rinde como un 65 mientras nadie ocupe el puesto.",
        to: "staff",
      });
    }
  }
  if (people && !Object.values(people.drivers).some((d) => d.reserveOf === team.id && d.status !== "retired"))
    items.push({
      icon: <UserPlus className="w-5 h-5" />,
      tone: "warn",
      title: "Sin piloto de reserva",
      text: "Un reserva trabaja en el simulador (más desarrollo) y cubre un asiento si hace falta.",
      to: "drivers",
    });
  const mega = pendingMega(season, proposals);
  const prep = management?.player?.megaPrep ?? 0;
  if (mega && prep < MEGA_PREP_MAX)
    items.push({
      icon: <Gavel className="w-5 h-5" />,
      tone: "warn",
      title: `Nueva generación de autos ${mega.effective}`,
      text: `Todo se reinicia el próximo año. Programa del auto nuevo: ${prep}/${MEGA_PREP_MAX} fases.`,
      to: "rules",
    });
  const sp = management?.player?.sponsors.length ?? 3;
  if (sp < 3)
    items.push({
      icon: <Handshake className="w-5 h-5" />,
      tone: "warn",
      title: `Patrocinios por definir (${3 - sp})`,
      text: `Tienes ${3 - sp} espacio${3 - sp > 1 ? "s" : ""} libre${3 - sp > 1 ? "s" : ""} en el auto: revisa las ofertas.`,
      to: "finance",
    });
  for (const n of notices.filter((x) => !/asientos? libres?|vacante/.test(x))) items.push({ icon: <Info className="w-5 h-5" />, tone: "info", title: "Pretemporada", text: n.replace(/^Tu equipo:\s*/, "") });
  if (!items.length) return null;
  const urgent = items.filter((i) => i.tone !== "info").length;
  const toneCls = { bad: "border-red-500/50 bg-red-500/10 text-red-300", warn: "border-amber-500/40 bg-amber-500/10 text-amber-300", info: "border-white/10 bg-black/25 text-sky-300" };
  return (
    <div className={cn("panel p-4 space-y-3", urgent && "border-amber-500/50")}>
      <SectionTitle right={urgent ? <span className="text-amber-300">{urgent} pendiente{urgent > 1 ? "s" : ""}</span> : "Avisos"}>
        <span className="inline-flex items-center gap-2">
          <ClipboardList className="w-4 h-4" /> Agenda del equipo
        </span>
      </SectionTitle>
      <div className="grid md:grid-cols-2 gap-3">
        {items.map((it, i) => {
          const body = (
            <>
              <span className={cn("grid place-items-center w-10 h-10 rounded-full border shrink-0", toneCls[it.tone])}>{it.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold leading-snug">{it.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{it.text}</div>
              </div>
              {it.to && <ChevronRight className="w-4 h-4 text-muted-foreground mt-2" />}
            </>
          );
          return it.to ? (
            <button key={i} onClick={() => onNavigate(it.to!)} className="panel-hover text-left rounded-xl border border-white/10 bg-black/25 p-3 flex gap-3 items-start">
              {body}
            </button>
          ) : (
            <div key={i} className="rounded-xl border border-white/10 bg-black/25 p-3 flex gap-3 items-start">
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
