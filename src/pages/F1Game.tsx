import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useGameState, weekendWeather } from "@/hooks/useGameState";
import { NewsScreen } from "@/components/game/NewsCenter";
import { SeasonCalendar } from "@/components/game/AgendaCalendar";
import { RaceCard } from "@/components/RaceCard";
import { DriverChampionshipTable, TeamChampionshipTable } from "@/components/ChampionshipTables";
import { ConfigDialog } from "@/components/ConfigDialog";
import { TeamSelect } from "@/components/game/TeamSelect";
import { QualifyingView } from "@/components/game/QualifyingView";
import { RaceView } from "@/components/game/RaceView";
import { RulesView } from "@/components/game/RulesView";
import { Paddock, type NavTarget } from "@/components/game/Paddock";
import { CarSilhouette, SectionTitle, teamThemeVars } from "@/components/game/visuals";
import heroImage from "@/assets/f1-hero.jpg";
import {
  Newspaper, Trophy, Calendar, Play, RotateCcw, ChevronRight, Flag, Home, Building2, Users, Briefcase, Wallet, Gavel, Wrench, MoreHorizontal, X,
} from "lucide-react";
import { TeamHQ, money } from "@/components/game/TeamHQ";
import { nextSeasonLineup } from "@/engine";
import { cn } from "@/lib/utils";

type Screen = "home" | "news" | "weekend" | "calendar" | "standings" | "car" | "facilities" | "drivers" | "staff" | "finance" | "rules";

const NAV: { group: string; items: { k: Screen; label: string; icon: typeof Home }[] }[] = [
  {
    group: "Temporada",
    items: [
      { k: "home", label: "Paddock", icon: Home },
      { k: "news", label: "Noticias", icon: Newspaper },
      { k: "weekend", label: "Fin de semana", icon: Flag },
      { k: "calendar", label: "Calendario", icon: Calendar },
      { k: "standings", label: "Campeonato", icon: Trophy },
    ],
  },
  {
    group: "Equipo",
    items: [
      { k: "car", label: "Auto e I+D", icon: Wrench },
      { k: "facilities", label: "Instalaciones", icon: Building2 },
      { k: "drivers", label: "Pilotos", icon: Users },
      { k: "staff", label: "Dirección", icon: Briefcase },
      { k: "finance", label: "Finanzas", icon: Wallet },
    ],
  },
  { group: "FIA", items: [{ k: "rules", label: "Reglamento", icon: Gavel }] },
];

const TITLES: Record<Screen, string> = {
  home: "Paddock",
  news: "Noticias",
  weekend: "Fin de semana",
  calendar: "Calendario",
  standings: "Campeonato",
  car: "Auto e I+D",
  facilities: "Instalaciones",
  drivers: "Pilotos",
  staff: "Dirección",
  finance: "Finanzas",
  rules: "Reglamento",
};

const fade = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.2 },
};

export default function F1Game() {
  const game = useGameState();
  const { gameState, standings, currentRace, seasonComplete, races, entryMap } = game;
  const [screen, setScreen] = useState<Screen>(gameState.weekend ? "weekend" : "home");
  const [moreOpen, setMoreOpen] = useState(false);

  const playerTeam = gameState.teamsData.find((t) => t.id === gameState.playerTeamId) ?? null;
  // dialogs render outside the app wrapper: paint the whole document with the team colours
  useEffect(() => {
    const root = document.documentElement;
    const vars = playerTeam ? teamThemeVars(playerTeam.hex) : {};
    const keys = Object.keys(teamThemeVars("#e10600"));
    for (const k of keys) {
      const v = (vars as Record<string, string>)[k];
      if (v) root.style.setProperty(k, v);
      else root.style.removeProperty(k);
    }
  }, [playerTeam?.hex]);
  const weekend = gameState.weekend;
  const weekendRace = weekend ? races[weekend.raceIndex] : null;
  const pendingVotes = gameState.proposals.filter((p) => p.status === "pending" && p.season === gameState.season).length;
  const p = gameState.management?.player;

  const go = (s: Screen) => {
    setMoreOpen(false);
    if (s === "weekend" && !weekend) {
      if (!currentRace || seasonComplete) return setScreen("calendar");
      game.startWeekend();
    }
    setScreen(s);
  };

  const resetDialog = (trigger: ReactNode) => (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Empezar una partida nueva?</AlertDialogTitle>
          <AlertDialogDescription>
            Se borra toda tu carrera: temporadas, resultados, contratos, reglamento y tu equipo elegido. Vuelves a 2026. La configuración se mantiene.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              game.resetSeason();
              setScreen("home");
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Reiniciar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const config = (
    <ConfigDialog
      simConfig={gameState.simConfig}
      onSimConfigChange={game.updateSimConfig}
      teamsData={gameState.teamsData}
      onTeamsDataChange={game.updateTeamsData}
    />
  );

  // ---- No team yet: full-screen team selection ----------------------------------
  if (!playerTeam) {
    return (
      <div className="min-h-screen game-bg">
        <header className="sticky top-0 z-50 bg-black/60 backdrop-blur border-b border-white/5">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <span className="font-display text-2xl">
              F1 <span className="text-primary">Manager</span>
            </span>
            <div className="flex items-center gap-1">{config}</div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
          <div className="relative overflow-hidden rounded-2xl py-14 md:py-20 px-6 text-center isolate panel">
            <img src={heroImage} alt="" className="absolute inset-0 -z-10 w-full h-full object-cover opacity-30" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/70 to-transparent" />
            <p className="tv-label text-primary">Modo carrera</p>
            <h1 className="font-display text-5xl md:text-7xl mt-2">Temporada {gameState.season}</h1>
            <p className="text-muted-foreground mt-3">24 Grandes Premios · 11 escuderías · contratos, desarrollo y reglamento año tras año</p>
          </div>
          <TeamSelect teams={gameState.teamsData} onChoose={game.chooseTeam} />
        </main>
      </div>
    );
  }

  const navButton = (k: Screen, label: string, Icon: typeof Home, compact = false) => {
    const active = screen === k;
    const badge = k === "rules" && pendingVotes > 0 ? pendingVotes : k === "weekend" && weekend ? "•" : null;
    return (
      <button
        key={k}
        onClick={() => go(k)}
        className={cn(
          "relative w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-racing transition-colors",
          active ? "bg-primary text-primary-foreground shadow-[0_0_24px_-6px_hsl(var(--primary)/0.8)]" : "text-muted-foreground hover:text-foreground hover:bg-white/5",
          compact && "justify-center px-0",
        )}
        title={label}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {!compact && <span className="flex-1 text-left">{label}</span>}
        {badge && (
          <span className={cn("rounded-full text-[10px] font-bold px-1.5", active ? "bg-black/30" : "bg-primary text-primary-foreground", compact && "absolute top-0.5 right-1")}>
            {badge}
          </span>
        )}
      </button>
    );
  };

  const focusMode = false; // the sidebar keeps its size on every screen
  const sideW = focusMode ? "lg:w-[68px]" : "lg:w-60";
  const padL = focusMode ? "lg:pl-[68px]" : "lg:pl-60";

  return (
    <div className="min-h-screen game-bg" style={teamThemeVars(playerTeam.hex)}>
      {/* Sidebar */}
      <aside className={cn("hidden lg:flex fixed inset-y-0 left-0 z-40 flex-col border-r border-white/5 bg-black/50 backdrop-blur-xl transition-all", sideW)}>
        <button onClick={() => go("home")} className="relative overflow-hidden px-3 pt-4 pb-3 text-left border-b border-white/5">
          <div className="absolute inset-0" style={{ background: `radial-gradient(220px 120px at 30% 0%, ${playerTeam.hex}40, transparent 70%)` }} />
          {focusMode ? (
            <div className="relative h-8 w-1.5 mx-auto rounded-full" style={{ backgroundColor: playerTeam.hex }} />
          ) : (
            <div className="relative">
              <div className="tv-label text-muted-foreground">F1 Manager · {gameState.season}</div>
              <div className="font-display text-xl mt-1 leading-tight" style={{ color: playerTeam.hex }}>
                {playerTeam.name}
              </div>
              <CarSilhouette color={playerTeam.hex} className="w-[85%] h-auto mt-2" />
            </div>
          )}
        </button>
        <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 py-3 space-y-4">
          {NAV.map((g) => (
            <div key={g.group} className="space-y-1">
              {!focusMode && <div className="tv-label text-muted-foreground/70 px-3">{g.group}</div>}
              {g.items.map((it) => navButton(it.k, it.label, it.icon, focusMode))}
            </div>
          ))}
        </nav>
        <div className={cn("border-t border-white/5 p-2 space-y-1", focusMode && "flex flex-col items-center")}>
          {p && !focusMode && (
            <div className="px-3 py-2">
              <div className="tv-label text-muted-foreground">Presupuesto</div>
              <div className={cn("font-display text-xl", p.budget < 0 && "text-red-400")}>{money(p.budget)}</div>
            </div>
          )}
          <div className={cn("flex items-center gap-1", !focusMode && "px-1")}>
            {config}
            {resetDialog(
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" title="Nueva partida">
                <RotateCcw className="w-4 h-4" />
              </Button>,
            )}
          </div>
        </div>
      </aside>

      <div className={cn("transition-all", padL)}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-black/55 backdrop-blur-xl border-b border-white/5">
          <div className="px-4 md:px-8 py-2.5 flex items-center gap-3">
            <span className="lg:hidden h-7 w-1.5 rounded-full" style={{ backgroundColor: playerTeam.hex }} />
            <div className="min-w-0">
              <div className="tv-label text-muted-foreground hidden sm:block">
                {playerTeam.name} · Temporada {gameState.season}
              </div>
              <div className="font-display text-xl md:text-2xl truncate">{TITLES[screen]}</div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden md:inline-flex tv-label rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5">
                Ronda {Math.min(gameState.currentRaceIndex + 1, races.length)}/{races.length}
              </span>
              {p && (
                <span className={cn("hidden sm:inline-flex rounded-md border border-white/10 bg-black/40 px-2.5 py-1 font-display text-sm", p.budget < 0 && "text-red-400")}>
                  {money(p.budget)}
                </span>
              )}
              {currentRace && !seasonComplete && screen !== "weekend" && (
                <Button size="sm" onClick={() => go("weekend")} className="font-display">
                  <Play className="w-3.5 h-3.5 mr-1 fill-current" />
                  <span className="hidden sm:inline">{weekend ? "Volver al" : "Ir al"} GP</span> {currentRace.flag}
                </Button>
              )}
              <div className="lg:hidden flex items-center">{config}</div>
            </div>
          </div>
        </header>

        <main className={cn("px-4 md:px-8 py-6 pb-28 lg:pb-10 mx-auto", screen === "weekend" ? "max-w-[1500px]" : "max-w-7xl")}>
          <AnimatePresence mode="wait">
            {screen === "home" && (
              <motion.div key="home" {...fade} className="space-y-6">
                {gameState.currentRaceIndex === 0 && gameState.seasonNews.length > 0 && (
                  <div className="panel p-4 space-y-2">
                    <SectionTitle>Mercado de fichajes · pretemporada {gameState.season}</SectionTitle>
                    <ul className="grid md:grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
                      {gameState.seasonNews.map((n, i) => (
                        <li key={i} className={n.startsWith("Tu equipo") ? "text-primary" : ""}>
                          • {n}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {seasonComplete && (
                  <SeasonEnd
                    season={gameState.season}
                    champion={standings.drivers[0]?.driverName}
                    constructor={standings.teams[0]?.teamName}
                    teamPos={standings.teams.findIndex((t) => t.teamId === playerTeam.id) + 1}
                    nextDrivers={gameState.people ? nextSeasonLineup(gameState.people, playerTeam.id).map((d) => d.name) : []}
                    canContinue={!!gameState.people && !!gameState.management}
                    onContinue={() => game.startNextSeason()}
                    onReviewDrivers={() => setScreen("drivers")}
                    onReset={game.resetSeason}
                  />
                )}

                <Paddock
                  team={playerTeam}
                  season={gameState.season}
                  race={seasonComplete ? null : currentRace}
                  round={gameState.results.length}
                  totalRaces={races.length}
                  weekendActive={!!weekend}
                  weekendHasRace={!!weekend?.race}
                  drivers={standings.drivers}
                  teamsStanding={standings.teams}
                  management={gameState.management}
                  people={gameState.people}
                  proposals={gameState.proposals}
                  onWeekend={() => go("weekend")}
                  onQuickSim={() => {
                    game.quickSimWeekend();
                    setScreen("weekend");
                  }}
                  onNavigate={(t: NavTarget) => go(t)}
                  news={gameState.news}
                  teams={gameState.teamsData}
                  activities={gameState.activities}
                  onChooseActivity={game.chooseActivity}
                  weather={seasonComplete ? null : weekend?.weather ?? weekendWeather(gameState, gameState.currentRaceIndex)}
                />

                {gameState.pastSeasons.length > 0 && (
                  <div className="panel p-4 space-y-3">
                    <SectionTitle>Historial de la carrera</SectionTitle>
                    <div className="space-y-1.5 text-sm">
                      {[...gameState.pastSeasons].reverse().map((ps) => (
                        <div key={ps.season} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 border-b border-white/5 pb-1.5">
                          <span className="font-display text-lg w-14">{ps.season}</span>
                          <span>
                            🏆 <b>{ps.driverChampion.name}</b> <span className="text-muted-foreground">({ps.driverChampion.team})</span>
                          </span>
                          <span className="text-muted-foreground">Constructores: {ps.constructorChampion}</span>
                          <span className="ml-auto text-primary font-semibold">
                            Tu equipo P{ps.playerPos} · {ps.playerPoints} pts{ps.playerWins ? ` · ${ps.playerWins} victorias` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {screen === "news" && (
              <motion.div key="news" {...fade}>
                <NewsScreen
                  news={gameState.news}
                  ctx={{ teams: gameState.teamsData, management: gameState.management, proposals: gameState.proposals, playerTeamId: gameState.playerTeamId }}
                />
              </motion.div>
            )}

            {screen === "calendar" && (
              <motion.div key="calendar" {...fade} className="space-y-4">
                <SectionTitle right={`${gameState.results.length} / ${races.length}`}>Calendario {gameState.season}</SectionTitle>
                <SeasonCalendar
                  races={races}
                  season={gameState.season}
                  results={gameState.results}
                  currentRaceIndex={gameState.currentRaceIndex}
                  activities={gameState.activities}
                  winnerOf={(id) => {
                    const w = gameState.results.find((r) => r.raceId === id)?.rows[0]?.driverId;
                    return w ? entryMap.get(w)?.driver.name : undefined;
                  }}
                  onRace={() => go("weekend")}
                  onChoose={game.chooseActivity}
                />
              </motion.div>
            )}

            {screen === "weekend" && (
              <motion.div key="weekend" {...fade}>
                {!weekend || !weekendRace ? (
                  <div className="text-center text-muted-foreground py-12">No hay un fin de semana en curso.</div>
                ) : weekend.race ? (
                  <RaceView
                    race={weekendRace}
                    state={weekend.race}
                    playerTeamId={gameState.playerTeamId}
                    onUpdate={game.updateRace}
                    onFinish={() => {
                      game.finishRace();
                      setScreen("standings");
                    }}
                  />
                ) : (
                  <QualifyingView
                    race={weekendRace}
                    quali={weekend.quali}
                    weather={weekend.weather}
                    revealed={weekend.qualiRevealed}
                    entryMap={entryMap}
                    playerTeamId={gameState.playerTeamId}
                    onReveal={game.revealSession}
                    onStartRace={game.startRace}
                  />
                )}
              </motion.div>
            )}

            {(["car", "facilities", "drivers", "staff", "finance"] as Screen[]).includes(screen) && gameState.management?.player && (
              <motion.div key={screen} {...fade}>
                <TeamHQ
                  section={screen as "car" | "facilities" | "drivers" | "staff" | "finance"}
                  team={playerTeam}
                  teams={gameState.teamsData}
                  round={gameState.currentRaceIndex}
                  management={gameState.management}
                  onStartProject={game.startProject}
                  onUpgradeFacility={game.upgradeFacility}
                  onSignSponsor={game.signSponsor}
                  people={gameState.people}
                  onOffer={game.offerContract}
                  onRelease={game.releaseDriver}
                  onHireStaff={game.hireStaff}
                  onFireStaff={game.fireStaff}
                  onRenewStaff={game.renewStaff}
                />
              </motion.div>
            )}

            {screen === "rules" && (
              <motion.div key="rules" {...fade}>
                <RulesView
                  season={gameState.season}
                  rules={gameState.rules}
                  proposals={gameState.proposals}
                  teams={gameState.teamsData}
                  playerTeamId={gameState.playerTeamId}
                  onVote={game.castVote}
                />
              </motion.div>
            )}

            {screen === "standings" && (
              <motion.div key="standings" {...fade} className="space-y-5">
                <div className="flex items-center justify-between gap-2">
                  <SectionTitle>Campeonato {gameState.season}</SectionTitle>
                  {currentRace && !seasonComplete && (
                    <Button onClick={() => go("weekend")} className="font-display" size="sm">
                      Siguiente: {currentRace.flag} {currentRace.country}
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  )}
                </div>
                <Tabs defaultValue="drivers">
                  <TabsList className="w-full grid grid-cols-2">
                    <TabsTrigger value="drivers" className="font-racing">Pilotos</TabsTrigger>
                    <TabsTrigger value="teams" className="font-racing">Constructores</TabsTrigger>
                  </TabsList>
                  <TabsContent value="drivers" className="mt-4">
                    <DriverChampionshipTable standings={standings.drivers} results={gameState.results} playerTeamId={gameState.playerTeamId} />
                  </TabsContent>
                  <TabsContent value="teams" className="mt-4">
                    <TeamChampionshipTable standings={standings.teams} results={gameState.results} playerTeamId={gameState.playerTeamId} />
                  </TabsContent>
                </Tabs>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-black/80 backdrop-blur-xl border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {(
            [
              ["home", "Paddock", Home],
              ["weekend", "GP", Flag],
              ["car", "Auto", Wrench],
              ["drivers", "Pilotos", Users],
            ] as [Screen, string, typeof Home][]
          ).map(([k, label, Icon]) => (
            <button key={k} onClick={() => go(k)} className={cn("flex flex-col items-center gap-0.5 py-2 text-[10px] font-racing", screen === k ? "text-primary" : "text-muted-foreground")}>
              <Icon className="w-5 h-5" />
              {label}
            </button>
          ))}
          <button onClick={() => setMoreOpen((v) => !v)} className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-racing", moreOpen ? "text-primary" : "text-muted-foreground")}>
            {moreOpen ? <X className="w-5 h-5" /> : <MoreHorizontal className="w-5 h-5" />}
            Más
            {pendingVotes > 0 && <span className="absolute top-1 right-5 w-2 h-2 rounded-full bg-primary" />}
          </button>
        </div>
        <AnimatePresence>
          {moreOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-full inset-x-2 mb-2 panel p-2 grid grid-cols-2 gap-1"
            >
              {NAV.flatMap((g) => g.items)
                .filter((it) => !["home", "weekend", "car", "drivers"].includes(it.k))
                .map((it) => navButton(it.k, it.label, it.icon))}
              <div className="col-span-2 flex justify-end">
                {resetDialog(
                  <Button variant="ghost" size="sm" className="text-destructive">
                    <RotateCcw className="w-4 h-4 mr-1" /> Nueva partida
                  </Button>,
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </div>
  );
}

function SeasonEnd({
  season, champion, constructor, teamPos, nextDrivers, canContinue, onContinue, onReviewDrivers, onReset,
}: {
  season: number;
  champion?: string;
  constructor?: string;
  teamPos: number;
  nextDrivers: string[];
  canContinue: boolean;
  onContinue: () => void;
  onReviewDrivers: () => void;
  onReset: () => void;
}) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="panel panel-accent overflow-hidden text-center p-6 md:p-10 space-y-4 relative">
      <div className="absolute inset-0 bg-[radial-gradient(600px_220px_at_50%_0%,rgba(250,204,21,0.18),transparent_70%)]" />
      <Trophy className="relative w-16 h-16 mx-auto text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.5)]" />
      <p className="relative tv-label text-yellow-300">Fin de temporada</p>
      <h2 className="relative font-display text-4xl md:text-5xl">Temporada {season}</h2>
      <div className="relative grid sm:grid-cols-3 gap-3 max-w-3xl mx-auto">
        <EndStat label="Campeón de pilotos" value={champion ?? "—"} />
        <EndStat label="Campeón de constructores" value={constructor ?? "—"} />
        <EndStat label="Tu equipo" value={`P${teamPos}`} highlight />
      </div>
      {canContinue ? (
        <div className="relative space-y-3">
          <p className="text-sm">
            Pilotos para {season + 1}: <b>{nextDrivers.length ? nextDrivers.join(" y ") : "ninguno confirmado"}</b>
            {nextDrivers.length < 2 && (
              <span className="text-yellow-300"> · faltan {2 - nextDrivers.length}: fíchalos ahora o se contratará automáticamente</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground max-w-2xl mx-auto">
            Al continuar: premio por tu posición, entra en vigor el nuevo reglamento, los pilotos envejecen y evolucionan, hay fichajes y retiros y
            llegan juveniles de la F2. Tus proyectos, obras y patrocinadores continúan.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {nextDrivers.length < 2 && (
              <Button variant="outline" onClick={onReviewDrivers} className="font-racing">
                Revisar pilotos
              </Button>
            )}
            <Button onClick={onContinue} size="lg" className="font-display text-lg shine">
              Comenzar temporada {season + 1} <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={onReset} className="relative font-racing">
          <RotateCcw className="w-4 h-4 mr-2" /> Nueva partida
        </Button>
      )}
    </motion.div>
  );
}

function EndStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl border border-white/10 bg-black/30 p-3", highlight && "border-primary/60")}>
      <div className="tv-label text-muted-foreground">{label}</div>
      <div className={cn("font-display text-xl mt-1", highlight && "text-primary text-3xl")}>{value}</div>
    </div>
  );
}
