import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useGameState } from "@/hooks/useGameState";
import { RaceCard } from "@/components/RaceCard";
import { DriverChampionshipTable, TeamChampionshipTable } from "@/components/ChampionshipTables";
import { ConfigDialog } from "@/components/ConfigDialog";
import { TeamSelect } from "@/components/game/TeamSelect";
import { QualifyingView } from "@/components/game/QualifyingView";
import { RaceView } from "@/components/game/RaceView";
import { TeamStripe } from "@/components/game/common";
import heroImage from "@/assets/f1-hero.jpg";
import { Trophy, Users, Calendar, Play, RotateCcw, ChevronRight, Flag, Home, Building2 } from "lucide-react";
import { TeamHQ, InboxList, money } from "@/components/game/TeamHQ";

type Screen = "home" | "calendar" | "weekend" | "standings" | "team";

const fade = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
  transition: { duration: 0.2 },
};

export default function F1Game() {
  const game = useGameState();
  const { gameState, standings, currentRace, seasonComplete, races, entryMap } = game;
  const [screen, setScreen] = useState<Screen>(gameState.weekend ? "weekend" : "home");

  const playerTeam = gameState.teamsData.find((t) => t.id === gameState.playerTeamId) ?? null;
  const weekend = gameState.weekend;
  const weekendRace = weekend ? races[weekend.raceIndex] : null;

  const goToWeekend = () => {
    game.startWeekend();
    setScreen("weekend");
  };

  const navButton = (to: Screen, Icon: typeof Home, label: string) => (
    <Button
      variant={screen === to ? "default" : "ghost"}
      size="sm"
      onClick={() => setScreen(to)}
      className="font-racing text-xs"
    >
      <Icon className="w-4 h-4 md:mr-1" />
      <span className="hidden md:inline">{label}</span>
    </Button>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <button onClick={() => setScreen("home")} className="flex items-center gap-2">
            {playerTeam && <TeamStripe color={playerTeam.hex} className="h-6 w-1.5" />}
            <span className="font-racing text-lg md:text-2xl text-gradient-primary whitespace-nowrap">F1 <span className="hidden sm:inline">MANAGER </span>2026</span>
          </button>
          <nav className="flex items-center gap-1">
            {navButton("home", Home, "Inicio")}
            {weekend && navButton("weekend", Flag, weekend.race ? "Carrera" : "Clasificación")}
            {playerTeam && gameState.management && navButton("team", Building2, "Equipo")}
            {navButton("calendar", Calendar, "Calendario")}
            {navButton("standings", Trophy, "Campeonato")}
            <ConfigDialog
              simConfig={gameState.simConfig}
              onSimConfigChange={game.updateSimConfig}
              teamsData={gameState.teamsData}
              onTeamsDataChange={game.updateTeamsData}
            />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" title="Nueva temporada">
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Empezar una nueva temporada?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se borran los resultados, el campeonato y tu equipo elegido. La configuración y los ratings se mantienen.
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
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-6xl">
        <AnimatePresence mode="wait">
          {screen === "home" && (
            <motion.div key="home" {...fade} className="space-y-6">
              {!playerTeam ? (
                <>
                  <div className="relative overflow-hidden rounded-xl py-10 text-center isolate">
                    <img src={heroImage} alt="" className="absolute inset-0 -z-10 w-full h-full object-cover opacity-25" />
                    <div className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/70 to-transparent" />
                    <h1 className="font-racing text-4xl md:text-5xl text-gradient-primary">Temporada 2026</h1>
                    <p className="text-muted-foreground mt-2">24 carreras · 11 equipos · 22 pilotos</p>
                  </div>
                  <TeamSelect teams={gameState.teamsData} onChoose={game.chooseTeam} />
                </>
              ) : (
                <>
                  <TeamOverview
                    teamName={playerTeam.name}
                    hex={playerTeam.hex}
                    drivers={standings.drivers
                      .map((d, i) => ({ ...d, pos: i + 1 }))
                      .filter((d) => d.teamId === playerTeam.id)}
                    teamPos={standings.teams.findIndex((t) => t.teamId === playerTeam.id) + 1}
                    teamPoints={standings.teams.find((t) => t.teamId === playerTeam.id)?.points ?? 0}
                    racesDone={gameState.results.length}
                    totalRaces={races.length}
                  />

                  {gameState.management?.player && (
                    <div className="grid md:grid-cols-[260px_1fr] gap-4">
                      <button
                        onClick={() => setScreen("team")}
                        className="rounded-xl border border-border bg-card p-4 text-left hover:border-primary/60 transition-colors space-y-1"
                      >
                        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                          <Building2 className="w-4 h-4" /> Sede del equipo
                        </div>
                        <div className="font-racing text-xl">{money(gameState.management.player.budget)}</div>
                        <div className="text-xs text-muted-foreground">
                          {gameState.management.player.projects.length} proyecto(s) en desarrollo
                          {gameState.management.player.facilityWork ? " · 1 obra en curso" : ""}
                        </div>
                        {gameState.management.player.sponsors.length < 3 && (
                          <div className="text-xs text-yellow-300">
                            ⚠ {3 - gameState.management.player.sponsors.length} espacio(s) de patrocinio libre(s)
                          </div>
                        )}
                        <div className="text-xs text-primary pt-1">Gestionar presupuesto y desarrollo →</div>
                      </button>
                      <InboxList management={gameState.management} limit={4} />
                    </div>
                  )}

                  {currentRace && !seasonComplete && (
                    <div className="rounded-xl border border-border bg-gradient-card p-5 space-y-4 glow-primary">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-racing text-sm text-muted-foreground uppercase tracking-wider">
                          {weekend ? "Fin de semana en curso" : "Próxima carrera"}
                        </h3>
                        <span className="text-xs text-muted-foreground">
                          {currentRace.track.laps} vueltas · adelantar:{" "}
                          {currentRace.track.overtaking > 0.7 ? "difícil" : currentRace.track.overtaking < 0.4 ? "fácil" : "medio"} · desgaste:{" "}
                          {currentRace.track.deg >= 1.2 ? "alto" : currentRace.track.deg <= 0.8 ? "bajo" : "medio"}
                        </span>
                      </div>
                      <RaceCard race={currentRace} status="current" />
                      <Button onClick={goToWeekend} className="w-full font-racing" size="lg">
                        <Play className="w-4 h-4 mr-2" />
                        {weekend ? (weekend.race ? "Volver a la carrera" : "Volver a la clasificación") : "Comenzar fin de semana"}
                      </Button>
                    </div>
                  )}

                  {seasonComplete && (
                    <div className="rounded-xl border border-yellow-500/40 bg-card p-6 text-center space-y-3">
                      <Trophy className="w-16 h-16 mx-auto text-yellow-400" />
                      <h2 className="font-racing text-2xl text-gradient-primary">¡Temporada completa!</h2>
                      <p className="text-muted-foreground">
                        Campeón: <span className="text-foreground font-semibold">{standings.drivers[0]?.driverName}</span> ·
                        Constructores: <span className="text-foreground font-semibold">{standings.teams[0]?.teamName}</span>
                      </p>
                      <Button onClick={game.resetSeason} className="font-racing">
                        <RotateCcw className="w-4 h-4 mr-2" /> Nueva temporada
                      </Button>
                    </div>
                  )}

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h3 className="font-racing text-sm flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-yellow-400" /> Pilotos
                      </h3>
                      <DriverChampionshipTable
                        standings={standings.drivers.slice(0, 8)}
                        results={gameState.results}
                        playerTeamId={gameState.playerTeamId}
                        compact
                      />
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-racing text-sm flex items-center gap-2">
                        <Users className="w-4 h-4 text-primary" /> Constructores
                      </h3>
                      <TeamChampionshipTable
                        standings={standings.teams.slice(0, 8)}
                        results={gameState.results}
                        playerTeamId={gameState.playerTeamId}
                        compact
                      />
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {screen === "calendar" && (
            <motion.div key="calendar" {...fade} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-racing text-2xl text-gradient-primary">Calendario 2026</h2>
                <span className="text-sm text-muted-foreground">
                  {gameState.results.length} / {races.length}
                </span>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                {races.map((race, i) => {
                  const result = gameState.results.find((r) => r.raceId === race.id);
                  const isCurrent = i === gameState.currentRaceIndex;
                  const winnerId = result?.rows[0]?.driverId;
                  const winner = winnerId ? entryMap.get(winnerId)?.driver.name : undefined;
                  return (
                    <RaceCard
                      key={race.id}
                      race={race}
                      status={result ? "completed" : isCurrent ? "current" : "upcoming"}
                      winner={winner}
                      onClick={isCurrent && playerTeam ? goToWeekend : undefined}
                    />
                  );
                })}
              </div>
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
                  revealed={weekend.qualiRevealed}
                  entryMap={entryMap}
                  playerTeamId={gameState.playerTeamId}
                  onReveal={game.revealSession}
                  onStartRace={game.startRace}
                />
              )}
            </motion.div>
          )}

          {screen === "team" && playerTeam && gameState.management?.player && (
            <motion.div key="team" {...fade}>
              <TeamHQ
                team={playerTeam}
                teams={gameState.teamsData}
                round={gameState.currentRaceIndex}
                management={gameState.management}
                onStartProject={game.startProject}
                onUpgradeFacility={game.upgradeFacility}
                onSignSponsor={game.signSponsor}
              />
            </motion.div>
          )}

          {screen === "standings" && (
            <motion.div key="standings" {...fade} className="space-y-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-racing text-2xl text-gradient-primary">Campeonato</h2>
                {currentRace && !seasonComplete && playerTeam && (
                  <Button onClick={goToWeekend} className="font-racing" size="sm">
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
  );
}

function TeamOverview({
  teamName, hex, drivers, teamPos, teamPoints, racesDone, totalRaces,
}: {
  teamName: string;
  hex: string;
  drivers: { driverId: string; driverName: string; nationality: string; points: number; wins: number; podiums: number; pos: number }[];
  teamPos: number;
  teamPoints: number;
  racesDone: number;
  totalRaces: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="h-1.5" style={{ backgroundColor: hex }} />
      <div className="p-5 grid md:grid-cols-[1fr_auto] gap-4 items-center">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Tu escudería</p>
          <h2 className="font-racing text-2xl">{teamName}</h2>
          <p className="text-sm text-muted-foreground">
            P{teamPos} en constructores · {teamPoints} pts · {racesDone} de {totalRaces} carreras disputadas
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {drivers.map((d) => (
            <div key={d.driverId} className="rounded-lg border border-border bg-background/50 px-4 py-2 min-w-36">
              <div className="text-sm">
                {d.nationality} <span className="font-semibold">{d.driverName}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                P{d.pos} · {d.points} pts{d.wins ? ` · ${d.wins} V` : ""}
                {d.podiums ? ` · ${d.podiums} pod.` : ""}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
