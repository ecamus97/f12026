import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGameState } from "@/hooks/useGameState";
import { RaceCard } from "@/components/RaceCard";
import { DriverChampionshipTable, TeamChampionshipTable } from "@/components/ChampionshipTables";
import { QualifyingPhase } from "@/components/QualifyingPhase";
import { RacePhase } from "@/components/RacePhase";
import { ConfigDialog } from "@/components/ConfigDialog";
import heroImage from "@/assets/f1-hero.jpg";
import { 
  Flag, 
  Trophy, 
  Users, 
  Calendar, 
  Play, 
  RotateCcw,
  ChevronRight,
  Sparkles,
  Save,
  Download
} from "lucide-react";

type GameScreen = "home" | "calendar" | "qualifying" | "race" | "standings";

export default function F1Game() {
  const { 
    gameState, 
    getCurrentRace, 
    recordRaceResult, 
    resetSeason, 
    saveProgress, 
    loadProgress, 
    updateRaceConfig,
    updateTeamsData,
    races 
  } = useGameState();
  const [screen, setScreen] = useState<GameScreen>("home");
  const [qualifyingGrid, setQualifyingGrid] = useState<any[]>([]);

  const currentRace = getCurrentRace();

  const handleQualifyingComplete = (grid: any[]) => {
    setQualifyingGrid(grid);
    setScreen("race");
  };

  const handleRaceComplete = (positions: any[]) => {
    recordRaceResult(positions);
    setScreen("standings");
  };

  const startNextRace = () => {
    if (currentRace) {
      setScreen("qualifying");
    }
  };

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <motion.h1 
              className="font-racing text-xl md:text-2xl text-gradient-primary cursor-pointer"
              onClick={() => setScreen("home")}
              whileHover={{ scale: 1.02 }}
            >
              F1 DICE GAME 2026
            </motion.h1>
            
            <nav className="flex items-center gap-1 md:gap-2">
              <ConfigDialog
                raceConfig={gameState.raceConfig}
                onRaceConfigChange={updateRaceConfig}
                teamsData={gameState.teamsData}
                onTeamsDataChange={updateTeamsData}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={saveProgress}
                className="font-racing text-xs"
                title="Guardar progreso"
              >
                <Save className="w-4 h-4" />
                <span className="hidden lg:inline ml-1">Guardar</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadProgress}
                className="font-racing text-xs"
                title="Cargar progreso"
              >
                <Download className="w-4 h-4" />
                <span className="hidden lg:inline ml-1">Cargar</span>
              </Button>
              <Button
                variant={screen === "calendar" ? "default" : "ghost"}
                size="sm"
                onClick={() => setScreen("calendar")}
                className="font-racing text-xs"
              >
                <Calendar className="w-4 h-4 md:mr-1" />
                <span className="hidden md:inline">Calendario</span>
              </Button>
              <Button
                variant={screen === "standings" ? "default" : "ghost"}
                size="sm"
                onClick={() => setScreen("standings")}
                className="font-racing text-xs"
              >
                <Trophy className="w-4 h-4 md:mr-1" />
                <span className="hidden md:inline">Campeonato</span>
              </Button>
            </nav>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          {/* HOME SCREEN */}
          {screen === "home" && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="relative text-center space-y-4 py-12">
                {/* Hero Background */}
                <div className="absolute inset-0 -z-10 overflow-hidden rounded-xl opacity-30">
                  <img 
                    src={heroImage} 
                    alt="F1 Racing" 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
                </div>

                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                >
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/20 mb-4 animate-pulse-glow">
                    <Flag className="w-10 h-10 text-primary" />
                  </div>
                </motion.div>
                <h2 className="font-racing text-4xl md:text-6xl text-gradient-primary">
                  Temporada 2026
                </h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Simula la temporada completa de F1 con dados. 
                  24 carreras, 11 equipos, 22 pilotos.
                </p>
              </div>

              {currentRace && !gameState.seasonComplete && (
                <motion.div
                  className="bg-gradient-card rounded-xl p-6 border border-border glow-primary"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-5 h-5 text-primary" />
                    <h3 className="font-racing text-lg">Próxima Carrera</h3>
                  </div>
                  
                  <RaceCard race={currentRace} status="current" />

                  <Button 
                    onClick={startNextRace} 
                    className="w-full mt-4 font-racing"
                    size="lg"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Iniciar Clasificación
                  </Button>
                </motion.div>
              )}

              {gameState.seasonComplete && (
                <motion.div
                  className="text-center space-y-6 py-8"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <Trophy className="w-24 h-24 mx-auto text-yellow-400" />
                  <h2 className="font-racing text-3xl text-gradient-primary">
                    ¡Temporada Completa!
                  </h2>
                  <div className="space-y-2">
                    <p className="text-muted-foreground">
                      Campeón de Pilotos: <span className="text-primary font-bold">
                        {gameState.driverStandings[0]?.driverName}
                      </span>
                    </p>
                    <p className="text-muted-foreground">
                      Campeón de Constructores: <span className="text-primary font-bold">
                        {gameState.teamStandings[0]?.teamName}
                      </span>
                    </p>
                  </div>
                  <Button onClick={resetSeason} className="font-racing" size="lg">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Nueva Temporada
                  </Button>
                </motion.div>
              )}

              {/* Quick Stats */}
              <div className="grid md:grid-cols-2 gap-4">
                <motion.div
                  className="bg-card rounded-lg p-4 border border-border"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="w-5 h-5 text-yellow-400" />
                    <h3 className="font-racing text-sm">Top 5 Pilotos</h3>
                  </div>
                  <DriverChampionshipTable 
                    standings={gameState.driverStandings.slice(0, 5)} 
                    raceResults={gameState.raceResults}
                  />
                </motion.div>

                <motion.div
                  className="bg-card rounded-lg p-4 border border-border"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-5 h-5 text-primary" />
                    <h3 className="font-racing text-sm">Top 5 Constructores</h3>
                  </div>
                  <TeamChampionshipTable 
                    standings={gameState.teamStandings.slice(0, 5)} 
                    raceResults={gameState.raceResults}
                  />
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* CALENDAR SCREEN */}
          {screen === "calendar" && (
            <motion.div
              key="calendar"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-racing text-2xl text-gradient-primary">
                  Calendario 2026
                </h2>
                <span className="text-sm text-muted-foreground">
                  {gameState.raceResults.length} / {races.length} carreras
                </span>
              </div>

              <div className="grid gap-3">
                {races.map((race, index) => {
                  const result = gameState.raceResults.find(r => r.raceId === race.id);
                  const isCurrent = index === gameState.currentRaceIndex;
                  const status = result ? "completed" : isCurrent ? "current" : "upcoming";
                  const winner = result?.positions.find(p => p.position === 1)?.driverName;

                  return (
                    <RaceCard
                      key={race.id}
                      race={race}
                      status={status}
                      winner={winner}
                      onClick={isCurrent ? startNextRace : undefined}
                    />
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* QUALIFYING SCREEN */}
          {screen === "qualifying" && currentRace && (
            <motion.div
              key="qualifying"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <QualifyingPhase 
                race={currentRace} 
                onComplete={handleQualifyingComplete}
                teamsData={gameState.teamsData}
              />
            </motion.div>
          )}

          {/* RACE SCREEN */}
          {screen === "race" && currentRace && (
            <motion.div
              key="race"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <RacePhase
                race={currentRace}
                grid={qualifyingGrid}
                onComplete={handleRaceComplete}
                raceConfig={gameState.raceConfig}
              />
            </motion.div>
          )}

          {/* STANDINGS SCREEN */}
          {screen === "standings" && (
            <motion.div
              key="standings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-racing text-2xl text-gradient-primary">
                  Campeonato
                </h2>
                {currentRace && !gameState.seasonComplete && (
                  <Button onClick={startNextRace} className="font-racing" size="sm">
                    <ChevronRight className="w-4 h-4 mr-1" />
                    Siguiente Carrera
                  </Button>
                )}
              </div>

              <Tabs defaultValue="drivers" className="w-full">
                <TabsList className="w-full grid grid-cols-2">
                  <TabsTrigger value="drivers" className="font-racing">
                    <Trophy className="w-4 h-4 mr-2" />
                    Pilotos
                  </TabsTrigger>
                  <TabsTrigger value="teams" className="font-racing">
                    <Users className="w-4 h-4 mr-2" />
                    Constructores
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="drivers" className="mt-4">
                  <DriverChampionshipTable 
                    standings={gameState.driverStandings}
                    raceResults={gameState.raceResults}
                  />
                </TabsContent>
                
                <TabsContent value="teams" className="mt-4">
                  <TeamChampionshipTable 
                    standings={gameState.teamStandings}
                    raceResults={gameState.raceResults}
                  />
                </TabsContent>
              </Tabs>

              {gameState.seasonComplete && (
                <Button onClick={resetSeason} className="w-full font-racing" variant="outline">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reiniciar Temporada
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
