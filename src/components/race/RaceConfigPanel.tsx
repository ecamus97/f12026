import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Settings, Play } from "lucide-react";
import { RaceConfig, DEFAULT_CONFIG } from "./types";

interface RaceConfigPanelProps {
  onStartRace: (config: RaceConfig) => void;
  raceName: string;
  raceFlag: string;
}

export function RaceConfigPanel({ onStartRace, raceName, raceFlag }: RaceConfigPanelProps) {
  const [config, setConfig] = useState<RaceConfig>(DEFAULT_CONFIG);
  const [showConfig, setShowConfig] = useState(false);

  return (
    <div className="space-y-6 p-6 bg-card/50 rounded-xl border border-border/30">
      <div className="text-center">
        <h2 className="font-racing text-2xl text-gradient-primary mb-2">
          {raceFlag} {raceName}
        </h2>
        <p className="text-muted-foreground text-sm">Configurar y comenzar carrera</p>
      </div>

      <Button
        variant="ghost"
        onClick={() => setShowConfig(!showConfig)}
        className="w-full justify-start gap-2"
      >
        <Settings className="w-4 h-4" />
        {showConfig ? "Ocultar configuración" : "Mostrar configuración avanzada"}
      </Button>

      {showConfig && (
        <div className="space-y-6 p-4 bg-background/50 rounded-lg border border-border/20">
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Probabilidad de pits por turno: {Math.round(config.pitCheckChance * 100)}%
            </Label>
            <Slider
              value={[config.pitCheckChance * 100]}
              onValueChange={([v]) => setConfig(c => ({ ...c, pitCheckChance: v / 100 }))}
              min={1}
              max={20}
              step={1}
              className="w-full"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Pit 1 (turnos)</Label>
              <Slider
                value={[config.pitDurations[1]]}
                onValueChange={([v]) =>
                  setConfig(c => ({ ...c, pitDurations: { ...c.pitDurations, 1: v } }))
                }
                min={1}
                max={10}
                step={1}
              />
              <span className="text-xs text-muted-foreground">{config.pitDurations[1]}</span>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Pit 2 (turnos)</Label>
              <Slider
                value={[config.pitDurations[2]]}
                onValueChange={([v]) =>
                  setConfig(c => ({ ...c, pitDurations: { ...c.pitDurations, 2: v } }))
                }
                min={1}
                max={15}
                step={1}
              />
              <span className="text-xs text-muted-foreground">{config.pitDurations[2]}</span>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Pit 3 (turnos)</Label>
              <Slider
                value={[config.pitDurations[3]]}
                onValueChange={([v]) =>
                  setConfig(c => ({ ...c, pitDurations: { ...c.pitDurations, 3: v } }))
                }
                min={1}
                max={20}
                step={1}
              />
              <span className="text-xs text-muted-foreground">{config.pitDurations[3]}</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-sm">Chance de DNF en 2do pit</Label>
            <Switch
              checked={config.dnfOnSecondPitChance}
              onCheckedChange={v => setConfig(c => ({ ...c, dnfOnSecondPitChance: v }))}
            />
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Pits máximos antes de DNF: {config.maxPitsBeforeDNF}
            </Label>
            <Slider
              value={[config.maxPitsBeforeDNF]}
              onValueChange={([v]) => setConfig(c => ({ ...c, maxPitsBeforeDNF: v }))}
              min={2}
              max={6}
              step={1}
              className="w-full"
            />
          </div>
        </div>
      )}

      <Button
        onClick={() => onStartRace(config)}
        className="w-full gap-2 h-12 font-racing text-lg"
        size="lg"
      >
        <Play className="w-5 h-5" />
        Iniciar Carrera
      </Button>
    </div>
  );
}
