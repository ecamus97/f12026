import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Settings, Users, Car, Save, RotateCcw } from "lucide-react";
import { teams as defaultTeams, type Driver, type Team } from "@/data/f1Data";
import { DEFAULT_SIM_CONFIG, type SimConfig } from "@/engine";
import { toast } from "@/hooks/use-toast";
import { TeamStripe } from "@/components/game/common";

interface ConfigDialogProps {
  simConfig: SimConfig;
  onSimConfigChange: (config: SimConfig) => void;
  teamsData: Team[];
  onTeamsDataChange: (teams: Team[]) => void;
}

const DRIVER_STATS: { key: keyof Driver; label: string }[] = [
  { key: "pace", label: "Ritmo" },
  { key: "racecraft", label: "Ataque" },
  { key: "defending", label: "Defensa" },
  { key: "consistency", label: "Consistencia" },
  { key: "tyreMgmt", label: "Neumáticos" },
];

const TEAM_STATS: { key: "pace" | "reliability" | "pitCrew"; label: string }[] = [
  { key: "pace", label: "Rendimiento auto" },
  { key: "reliability", label: "Fiabilidad" },
  { key: "pitCrew", label: "Pit crew" },
];

function RatingSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs flex justify-between">
        <span>{label}</span>
        <span className="font-mono">{value}</span>
      </Label>
      <Slider value={[value]} onValueChange={([v]) => onChange(v)} min={60} max={100} step={1} />
    </div>
  );
}

export function ConfigDialog({ simConfig, onSimConfigChange, teamsData, onTeamsDataChange }: ConfigDialogProps) {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<SimConfig>(simConfig);
  const [localTeams, setLocalTeams] = useState<Team[]>(teamsData);

  useEffect(() => {
    if (open) {
      setCfg(simConfig);
      setLocalTeams(teamsData);
    }
  }, [open, simConfig, teamsData]);

  const handleSave = () => {
    onSimConfigChange(cfg);
    onTeamsDataChange(localTeams);
    toast({ title: "Configuración guardada", description: "Se aplica desde la próxima sesión." });
    setOpen(false);
  };

  const updateDriver = (ti: number, di: number, field: keyof Driver, value: string | number) =>
    setLocalTeams((ts) =>
      ts.map((t, i) => (i !== ti ? t : { ...t, drivers: t.drivers.map((d, j) => (j !== di ? d : { ...d, [field]: value })) })),
    );

  const updateTeam = (ti: number, field: keyof Team, value: string | number) =>
    setLocalTeams((ts) => ts.map((t, i) => (i !== ti ? t : { ...t, [field]: value })));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="font-racing text-xs" title="Configuración">
          <Settings className="w-4 h-4" />
          <span className="hidden lg:inline ml-1">Config</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="font-racing text-xl">Configuración</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="race" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="race" className="gap-1 text-xs"><Settings className="w-3 h-3" /> Simulación</TabsTrigger>
            <TabsTrigger value="teams" className="gap-1 text-xs"><Car className="w-3 h-3" /> Equipos</TabsTrigger>
            <TabsTrigger value="drivers" className="gap-1 text-xs"><Users className="w-3 h-3" /> Pilotos</TabsTrigger>
          </TabsList>

          <TabsContent value="race" className="space-y-6 mt-4">
            <div className="space-y-2">
              <Label className="text-sm flex justify-between">
                <span>Aleatoriedad del ritmo</span>
                <span className="font-mono">{cfg.randomness.toFixed(1)}x</span>
              </Label>
              <Slider value={[cfg.randomness * 10]} onValueChange={([v]) => setCfg((c) => ({ ...c, randomness: v / 10 }))} min={5} max={20} step={1} />
              <p className="text-xs text-muted-foreground">Más alto = más sorpresas y menos dominio del mejor auto.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm flex justify-between">
                <span>Incidentes y averías</span>
                <span className="font-mono">{cfg.incidents.toFixed(1)}x</span>
              </Label>
              <Slider value={[cfg.incidents * 10]} onValueChange={([v]) => setCfg((c) => ({ ...c, incidents: v / 10 }))} min={0} max={25} step={1} />
              <p className="text-xs text-muted-foreground">Multiplica errores de pilotos, choques y fallas mecánicas.</p>
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Safety car</Label>
              <Switch checked={cfg.safetyCar} onCheckedChange={(v) => setCfg((c) => ({ ...c, safetyCar: v }))} />
            </div>
            <Button variant="outline" size="sm" onClick={() => setCfg(DEFAULT_SIM_CONFIG)}>
              <RotateCcw className="w-3 h-3 mr-1" /> Valores por defecto
            </Button>
          </TabsContent>

          <TabsContent value="teams" className="mt-4">
            <ScrollArea className="h-[420px] pr-4">
              <div className="space-y-3">
                {localTeams.map((team, ti) => (
                  <div key={team.id} className="p-3 rounded-lg border border-border/30 bg-card/50 space-y-3">
                    <div className="flex items-center gap-2">
                      <TeamStripe color={team.hex} className="h-8 w-1.5" />
                      <Input value={team.name} onChange={(e) => updateTeam(ti, "name", e.target.value)} className="flex-1" />
                      <Input type="color" value={team.hex} onChange={(e) => updateTeam(ti, "hex", e.target.value)} className="w-14 p-1" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {TEAM_STATS.map((s) => (
                        <RatingSlider key={s.key} label={s.label} value={team[s.key]} onChange={(v) => updateTeam(ti, s.key, v)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="drivers" className="mt-4">
            <ScrollArea className="h-[420px] pr-4">
              <div className="space-y-4">
                {localTeams.map((team, ti) => (
                  <div key={team.id} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <TeamStripe color={team.hex} />
                      <span className="font-racing text-sm text-muted-foreground">{team.name}</span>
                    </div>
                    {team.drivers.map((driver, di) => (
                      <div key={driver.id} className="p-3 rounded-lg border border-border/20 bg-card/30 space-y-3 ml-3">
                        <div className="flex items-center gap-2">
                          <Input value={driver.nationality} onChange={(e) => updateDriver(ti, di, "nationality", e.target.value)} className="w-14 text-center" />
                          <Input value={driver.name} onChange={(e) => updateDriver(ti, di, "name", e.target.value)} className="flex-1" />
                          <Input
                            value={driver.shortName}
                            onChange={(e) => updateDriver(ti, di, "shortName", e.target.value.toUpperCase())}
                            className="w-16 font-mono text-center"
                            maxLength={3}
                          />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                          {DRIVER_STATS.map((s) => (
                            <RatingSlider
                              key={s.key}
                              label={s.label}
                              value={driver[s.key] as number}
                              onChange={(v) => updateDriver(ti, di, s.key, v)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <div className="flex gap-2 mt-2">
          <Button variant="outline" onClick={() => setLocalTeams(defaultTeams)} className="gap-1 text-xs">
            <RotateCcw className="w-3 h-3" /> Ratings originales
          </Button>
          <Button onClick={handleSave} className="flex-1 gap-2">
            <Save className="w-4 h-4" /> Guardar cambios
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
