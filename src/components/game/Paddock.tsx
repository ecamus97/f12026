import { motion } from "framer-motion";
import { Play, FastForward, Gavel, Wallet, Gauge, FlaskConical, Handshake, ChevronRight, Trophy, MapPin, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Race, Team } from "@/data/f1Data";
import type { DriverStanding, TeamStanding, NewsItem, WeatherTimeline } from "@/engine";
import { forecast, forecastIcon } from "@/engine";
import { NewsFeed } from "./NewsCenter";
import { AgendaCard } from "./AgendaCalendar";
import type { Activity } from "@/engine";
import { carRankOf, ageOf, type ManagementState, type PeopleState, type RuleProposal } from "@/engine";
import { CarSilhouette, CircuitOutline, DriverNumber, SectionTitle, StatTile } from "./visuals";
import { InboxList, money } from "./TeamHQ";
import { cn } from "@/lib/utils";

export type NavTarget = "weekend" | "car" | "drivers" | "finance" | "rules" | "standings" | "calendar" | "news";

export function Paddock({
  team, season, race, round, totalRaces, weekendActive, weekendHasRace, drivers, teamsStanding, management, people, proposals, onWeekend, onQuickSim, onNavigate, news, teams, weather, activities, onChooseActivity,
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
  activities: Activity[];
  onChooseActivity: (id: string, idx: number) => void;
}) {
  const fc = weather ? forecast(weather, 0, Math.max(3, Math.round(weather.rain.length / 10))) : [];
  const raceChance = fc.reduce((a, f) => Math.max(a, f.chance), 0);
  const satWet = weather?.qualiWet ?? 0;
  const satIcon = satWet >= 0.45 ? "🌧️" : satWet > 0.05 ? "🌦️" : raceChance >= 40 ? "⛅" : "☀️";
  const teamPos = teamsStanding.findIndex((t) => t.teamId === team.id) + 1;
  const myTeam = teamsStanding.find((t) => t.teamId === team.id);
  const myDrivers = drivers.map((d, i) => ({ ...d, pos: i + 1 })).filter((d) => d.teamId === team.id);
  const p = management?.player;
  const pending = proposals.filter((x) => x.status === "pending" && x.season === season);
  const carRank = management ? carRankOf(management, team.id) : 0;
  const leaderPts = drivers[0]?.points ?? 0;

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
                  Ronda {race.id} de {totalRaces} · {season}
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
                <Chip label="Vueltas" value={race.track.laps} />
                <Chip label="Adelantar" value={race.track.overtaking > 0.7 ? "Difícil" : race.track.overtaking < 0.4 ? "Fácil" : "Medio"} />
                <Chip label="Desgaste" value={race.track.deg >= 1.2 ? "Alto" : race.track.deg <= 0.8 ? "Bajo" : "Medio"} />

                <Chip label="Tipo" value={(race.track.downforce ?? 0.5) >= 0.7 ? "Alta carga" : (race.track.power ?? 0.5) >= 0.75 ? "Motor" : "Mixto"} />
              </div>
              {weather && (
                <div className="flex gap-2">
                  <WeatherDay label="Sábado · Clasificación" icon={satIcon} temp={weather.airTemp - 1} />
                  <WeatherDay label="Domingo · Carrera" icon={forecastIcon(raceChance)} temp={weather.airTemp} />
                </div>
              )}
              <div className="mt-auto flex flex-wrap gap-2">
                <Button onClick={onWeekend} size="lg" className="font-display text-lg h-12 px-6 shine">
                  <Play className="w-5 h-5 mr-2 fill-current" />
                  {weekendActive ? (weekendHasRace ? "Volver a la carrera" : "Volver a la clasificación") : "Comenzar fin de semana"}
                </Button>
                <Button
                  onClick={onQuickSim}
                  size="lg"
                  variant="outline"
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
            <p className="tv-label text-muted-foreground">Tu escudería</p>
            <div className="font-display text-3xl" style={{ color: team.hex }}>
              {team.name}
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
