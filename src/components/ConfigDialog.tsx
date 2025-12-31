import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Settings, Users, Car, Save } from "lucide-react";
import { teams, Team, Driver } from "@/data/f1Data";
import { RaceConfig, DEFAULT_CONFIG } from "@/components/race/types";
import { toast } from "@/hooks/use-toast";

interface ConfigDialogProps {
  raceConfig: RaceConfig;
  onRaceConfigChange: (config: RaceConfig) => void;
  teamsData: Team[];
  onTeamsDataChange: (teams: Team[]) => void;
}

export function ConfigDialog({
  raceConfig,
  onRaceConfigChange,
  teamsData,
  onTeamsDataChange,
}: ConfigDialogProps) {
  const [open, setOpen] = useState(false);
  const [localConfig, setLocalConfig] = useState<RaceConfig>(raceConfig);
  const [localTeams, setLocalTeams] = useState<Team[]>(teamsData);

  useEffect(() => {
    setLocalConfig(raceConfig);
    setLocalTeams(teamsData);
  }, [raceConfig, teamsData, open]);

  const handleSave = () => {
    onRaceConfigChange(localConfig);
    onTeamsDataChange(localTeams);
    toast({ title: "Configuración guardada", description: "Los cambios se aplicarán en la próxima carrera." });
    setOpen(false);
  };

  const updateDriver = (teamIndex: number, driverIndex: number, field: keyof Driver, value: string | number) => {
    const newTeams = [...localTeams];
    const newDrivers = [...newTeams[teamIndex].drivers];
    newDrivers[driverIndex] = { ...newDrivers[driverIndex], [field]: value };
    newTeams[teamIndex] = { ...newTeams[teamIndex], drivers: newDrivers };
    setLocalTeams(newTeams);
  };

  const updateTeam = (teamIndex: number, field: keyof Team, value: string | number) => {
    const newTeams = [...localTeams];
    newTeams[teamIndex] = { ...newTeams[teamIndex], [field]: value };
    setLocalTeams(newTeams);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="font-racing text-xs" title="Configuración">
          <Settings className="w-4 h-4" />
          <span className="hidden lg:inline ml-1">Config</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="font-racing text-xl">Configuración</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="race" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="race" className="gap-1 text-xs">
              <Settings className="w-3 h-3" /> Carrera
            </TabsTrigger>
            <TabsTrigger value="teams" className="gap-1 text-xs">
              <Car className="w-3 h-3" /> Constructores
            </TabsTrigger>
            <TabsTrigger value="drivers" className="gap-1 text-xs">
              <Users className="w-3 h-3" /> Pilotos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="race" className="space-y-4 mt-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                Probabilidad de pits por turno: {Math.round(localConfig.pitCheckChance * 100)}%
              </Label>
              <Slider
                value={[localConfig.pitCheckChance * 100]}
                onValueChange={([v]) => setLocalConfig(c => ({ ...c, pitCheckChance: v / 100 }))}
                min={1}
                max={20}
                step={1}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Pit 1 (turnos)</Label>
                <Slider
                  value={[localConfig.pitDurations[1]]}
                  onValueChange={([v]) =>
                    setLocalConfig(c => ({ ...c, pitDurations: { ...c.pitDurations, 1: v } }))
                  }
                  min={1}
                  max={10}
                  step={1}
                />
                <span className="text-xs text-muted-foreground">{localConfig.pitDurations[1]}</span>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Pit 2 (turnos)</Label>
                <Slider
                  value={[localConfig.pitDurations[2]]}
                  onValueChange={([v]) =>
                    setLocalConfig(c => ({ ...c, pitDurations: { ...c.pitDurations, 2: v } }))
                  }
                  min={1}
                  max={15}
                  step={1}
                />
                <span className="text-xs text-muted-foreground">{localConfig.pitDurations[2]}</span>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Pit 3 (turnos)</Label>
                <Slider
                  value={[localConfig.pitDurations[3]]}
                  onValueChange={([v]) =>
                    setLocalConfig(c => ({ ...c, pitDurations: { ...c.pitDurations, 3: v } }))
                  }
                  min={1}
                  max={20}
                  step={1}
                />
                <span className="text-xs text-muted-foreground">{localConfig.pitDurations[3]}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-sm">Chance de DNF en 2do pit</Label>
              <Switch
                checked={localConfig.dnfOnSecondPitChance}
                onCheckedChange={v => setLocalConfig(c => ({ ...c, dnfOnSecondPitChance: v }))}
              />
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium">
                Pits máximos antes de DNF: {localConfig.maxPitsBeforeDNF}
              </Label>
              <Slider
                value={[localConfig.maxPitsBeforeDNF]}
                onValueChange={([v]) => setLocalConfig(c => ({ ...c, maxPitsBeforeDNF: v }))}
                min={2}
                max={6}
                step={1}
              />
            </div>
          </TabsContent>

          <TabsContent value="teams" className="mt-4">
            <ScrollArea className="h-[350px] pr-4">
              <div className="space-y-4">
                {localTeams.map((team, teamIndex) => (
                  <div
                    key={team.id}
                    className="p-3 rounded-lg border border-border/30 bg-card/50 space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-8 rounded ${team.color}`} />
                      <Input
                        value={team.name}
                        onChange={(e) => updateTeam(teamIndex, "name", e.target.value)}
                        className="flex-1 font-medium"
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <Label className="text-xs whitespace-nowrap">Nivel auto: {team.carLevel}</Label>
                      <Slider
                        value={[team.carLevel]}
                        onValueChange={([v]) => updateTeam(teamIndex, "carLevel", v)}
                        min={2}
                        max={6}
                        step={0.5}
                        className="flex-1"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="drivers" className="mt-4">
            <ScrollArea className="h-[350px] pr-4">
              <div className="space-y-4">
                {localTeams.map((team, teamIndex) => (
                  <div key={team.id} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-6 rounded ${team.color}`} />
                      <span className="font-racing text-sm text-muted-foreground">{team.shortName}</span>
                    </div>
                    {team.drivers.map((driver, driverIndex) => (
                      <div
                        key={driver.id}
                        className="p-3 rounded-lg border border-border/20 bg-card/30 space-y-3 ml-4"
                      >
                        <div className="flex items-center gap-2">
                          <Input
                            value={driver.nationality}
                            onChange={(e) => updateDriver(teamIndex, driverIndex, "nationality", e.target.value)}
                            className="w-14 text-center"
                            placeholder="🏳️"
                          />
                          <Input
                            value={driver.name}
                            onChange={(e) => updateDriver(teamIndex, driverIndex, "name", e.target.value)}
                            className="flex-1"
                          />
                          <Input
                            value={driver.shortName}
                            onChange={(e) => updateDriver(teamIndex, driverIndex, "shortName", e.target.value)}
                            className="w-16 uppercase font-mono text-center"
                            maxLength={3}
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Overtaking: {driver.overtaking}</Label>
                            <Slider
                              value={[driver.overtaking]}
                              onValueChange={([v]) => updateDriver(teamIndex, driverIndex, "overtaking", v)}
                              min={1}
                              max={6}
                              step={1}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Defending: {driver.maintainingPosition}</Label>
                            <Slider
                              value={[driver.maintainingPosition]}
                              onValueChange={([v]) => updateDriver(teamIndex, driverIndex, "maintainingPosition", v)}
                              min={1}
                              max={6}
                              step={1}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Avoid Collision: {driver.avoidingCollision}</Label>
                            <Slider
                              value={[driver.avoidingCollision]}
                              onValueChange={([v]) => updateDriver(teamIndex, driverIndex, "avoidingCollision", v)}
                              min={1}
                              max={6}
                              step={1}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <Button onClick={handleSave} className="w-full gap-2 mt-4">
          <Save className="w-4 h-4" />
          Guardar Cambios
        </Button>
      </DialogContent>
    </Dialog>
  );
}
