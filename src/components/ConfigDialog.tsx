import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Settings, Users, Car, Save, RotateCcw, ChevronDown, Search } from "lucide-react";
import type { Team } from "@/data/f1Data";
import { DEFAULT_SIM_CONFIG, ageOf, carPace, whereIs, type ManagementState, type PeopleState, type SimConfig } from "@/engine";
import type { ConfigEdits } from "@/hooks/useGameState";
import { toast } from "@/hooks/use-toast";
import { TeamStripe } from "@/components/game/common";
import { cn } from "@/lib/utils";

interface ConfigDialogProps {
  simConfig: SimConfig;
  teamsData: Team[];
  management: ManagementState | null;
  people: PeopleState | null;
  season: number;
  onSave: (edits: ConfigEdits) => void;
}

type TeamEdit = ConfigEdits["teams"][number];
type DriverEdit = { id: string; name: string; shortName: string; number: number; nationality: string; pace: number; racecraft: number; defending: number; consistency: number; tyreMgmt: number; potential?: number };

const DRIVER_STATS: { key: "pace" | "racecraft" | "defending" | "consistency" | "tyreMgmt"; label: string }[] = [
  { key: "pace", label: "Ritmo" },
  { key: "racecraft", label: "Ataque" },
  { key: "defending", label: "Defensa" },
  { key: "consistency", label: "Constancia" },
  { key: "tyreMgmt", label: "Neumáticos" },
];

const TEAM_STATS: { key: "aero" | "powerUnit" | "chassis" | "reliability" | "pitCrew"; label: string }[] = [
  { key: "aero", label: "Aerodinámica" },
  { key: "powerUnit", label: "Motor" },
  { key: "chassis", label: "Chasis" },
  { key: "reliability", label: "Fiabilidad" },
  { key: "pitCrew", label: "Pit stops" },
];

type DriverGroup = "f1" | "reserve" | "junior" | "other";
const GROUPS: [DriverGroup, string][] = [
  ["f1", "Titulares F1"],
  ["reserve", "Reservas"],
  ["junior", "Cantera F2/F3"],
  ["other", "Otros"],
];

function RatingSlider({ label, value, onChange, min = 50 }: { label: string; value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <span className="font-mono text-muted-foreground">{value.toFixed(1)}</span>
      </div>
      <Slider value={[value]} onValueChange={([v]) => onChange(v)} min={min} max={100} step={0.5} />
    </div>
  );
}

function PctSlider({
  label, hint, value, onChange, min, max,
}: { label: string; hint: string; value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm flex justify-between">
        <span>{label}</span>
        <span className="font-mono">{value.toFixed(1)}x</span>
      </Label>
      <Slider value={[value * 10]} onValueChange={([v]) => onChange(v / 10)} min={min * 10} max={max * 10} step={1} />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function ConfigDialog({ simConfig, teamsData, management, people, season, onSave }: ConfigDialogProps) {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<SimConfig>({ ...DEFAULT_SIM_CONFIG, ...simConfig });
  const [teams, setTeams] = useState<TeamEdit[]>([]);
  const [drivers, setDrivers] = useState<Record<string, DriverEdit>>({});
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [group, setGroup] = useState<DriverGroup>("f1");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [openTeam, setOpenTeam] = useState<string | null>(null);

  const teamName = (id: string) => teamsData.find((t) => t.id === id)?.name;

  // fresh copy of the current career every time the dialog opens
  useEffect(() => {
    if (!open) return;
    setCfg({ ...DEFAULT_SIM_CONFIG, ...simConfig });
    setTeams(
      teamsData.map((t) => {
        const d = management?.dev[t.id];
        return {
          id: t.id,
          name: t.name,
          hex: t.hex,
          aero: d?.aero ?? t.aero ?? t.pace,
          powerUnit: d?.powerUnit ?? t.powerUnit ?? t.pace,
          chassis: d?.chassis ?? t.chassis ?? t.pace,
          reliability: d?.reliability ?? t.reliability,
          pitCrew: d?.pitCrew ?? t.pitCrew,
        };
      }),
    );
    const all: Record<string, DriverEdit> = {};
    if (people) {
      for (const d of Object.values(people.drivers)) {
        if (d.status === "retired") continue;
        all[d.id] = { id: d.id, name: d.name, shortName: d.shortName, number: d.number, nationality: d.nationality, pace: d.pace, racecraft: d.racecraft, defending: d.defending, consistency: d.consistency, tyreMgmt: d.tyreMgmt, potential: d.potential };
      }
    } else {
      for (const t of teamsData) for (const d of t.drivers) all[d.id] = { ...d };
    }
    setDrivers(all);
    setChanged(new Set());
  }, [open, simConfig, teamsData, management, people]);

  const groupOf = (id: string): DriverGroup => {
    const d = people?.drivers[id];
    if (!d) return "f1";
    if (d.status === "active" && d.contract) return "f1";
    if (d.reserveOf) return "reserve";
    if (d.status === "junior") return "junior";
    return "other";
  };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ids = Object.keys(drivers).filter((id) => (q ? drivers[id].name.toLowerCase().includes(q) : groupOf(id) === group));
    const teamIdx = (id: string) => {
      const tid = people?.drivers[id]?.contract?.teamId ?? people?.drivers[id]?.reserveOf ?? teamsData.find((t) => t.drivers.some((d) => d.id === id))?.id;
      const i = teamsData.findIndex((t) => t.id === tid);
      return i < 0 ? 99 : i;
    };
    return ids.sort((a, b) => teamIdx(a) - teamIdx(b) || drivers[b].pace - drivers[a].pace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drivers, group, query, people, teamsData]);

  const editDriver = (id: string, patch: Partial<DriverEdit>) => {
    setDrivers((ds) => {
      const next = { ...ds[id], ...patch };
      // the ceiling can't be below the current pace
      if (next.potential !== undefined && next.potential < next.pace) next.potential = next.pace;
      return { ...ds, [id]: next };
    });
    setChanged((c) => new Set(c).add(id));
  };
  const editTeam = (id: string, patch: Partial<TeamEdit>) => setTeams((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const handleSave = () => {
    const dEdits: ConfigEdits["drivers"] = {};
    for (const id of changed) {
      const { id: _id, ...rest } = drivers[id];
      dEdits[id] = rest;
    }
    onSave({ simConfig: cfg, teams, drivers: dEdits });
    toast({
      title: "Configuración guardada",
      description: "Los cambios de equipos y pilotos se ven desde la próxima sesión; la simulación, desde la próxima carrera.",
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="font-racing text-xs" title="Configuración">
          <Settings className="w-4 h-4" />
          <span className="hidden lg:inline ml-1">Config</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[92vh]">
        <DialogHeader>
          <DialogTitle className="font-racing text-xl">Configuración</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="race" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="race" className="gap-1 text-xs"><Settings className="w-3 h-3" /> Simulación</TabsTrigger>
            <TabsTrigger value="teams" className="gap-1 text-xs"><Car className="w-3 h-3" /> Equipos</TabsTrigger>
            <TabsTrigger value="drivers" className="gap-1 text-xs"><Users className="w-3 h-3" /> Pilotos</TabsTrigger>
          </TabsList>

          <TabsContent value="race" className="mt-4">
            <ScrollArea className="h-[60vh] pr-3">
              <div className="space-y-5">
                <PctSlider label="Aleatoriedad del ritmo" hint="Más alto = más sorpresas y menos dominio del mejor auto." value={cfg.randomness} min={0.5} max={2} onChange={(v) => setCfg((c) => ({ ...c, randomness: v }))} />
                <PctSlider label="Incidentes y averías" hint="Errores de pilotos, choques, fallas mecánicas y pinchazos." value={cfg.incidents} min={0} max={2.5} onChange={(v) => setCfg((c) => ({ ...c, incidents: v }))} />
                <PctSlider label="Probabilidad de lluvia" hint="Multiplica la chance de lluvia de cada circuito (desde el próximo fin de semana)." value={cfg.rain ?? 1} min={0} max={2.5} onChange={(v) => setCfg((c) => ({ ...c, rain: v }))} />
                <PctSlider label="Desgaste de neumáticos" hint="Más alto = más paradas y más estrategia." value={cfg.tyreWear ?? 1} min={0.7} max={1.5} onChange={(v) => setCfg((c) => ({ ...c, tyreWear: v }))} />
                <PctSlider label="Dificultad: desarrollo de los rivales" hint="Qué tan rápido mejoran los autos de la IA durante la temporada." value={cfg.aiDev ?? 1} min={0.5} max={1.5} onChange={(v) => setCfg((c) => ({ ...c, aiDev: v }))} />
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label className="text-sm">Safety car y bandera roja</Label>
                    <p className="text-xs text-muted-foreground">Si se desactiva, los accidentes no neutralizan la carrera.</p>
                  </div>
                  <Switch checked={cfg.safetyCar} onCheckedChange={(v) => setCfg((c) => ({ ...c, safetyCar: v }))} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label className="text-sm">Pausar ante incidentes</Label>
                    <p className="text-xs text-muted-foreground">La carrera se detiene con safety car, bandera roja, lluvia o problemas de tus autos.</p>
                  </div>
                  <Switch checked={cfg.pauseOnIncidents !== false} onCheckedChange={(v) => setCfg((c) => ({ ...c, pauseOnIncidents: v }))} />
                </div>
                <Button variant="outline" size="sm" onClick={() => setCfg(DEFAULT_SIM_CONFIG)}>
                  <RotateCcw className="w-3 h-3 mr-1" /> Valores por defecto
                </Button>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="teams" className="mt-4">
            <p className="text-xs text-muted-foreground mb-2">
              Valores actuales de cada auto (incluye el desarrollo de la temporada). El ritmo general es la mezcla de aerodinámica, motor y chasis.
            </p>
            <ScrollArea className="h-[56vh] pr-3">
              <div className="space-y-2">
                {teams.map((t) => {
                  const isOpen = openTeam === t.id;
                  return (
                    <div key={t.id} className="rounded-lg border border-border">
                      <button className="w-full flex items-center gap-2 p-2 text-left" onClick={() => setOpenTeam(isOpen ? null : t.id)}>
                        <TeamStripe color={t.hex} />
                        <span className="flex-1 text-sm font-medium">{t.name}</span>
                        <span className="text-xs text-muted-foreground font-mono">ritmo {carPace(t).toFixed(1)}</span>
                        <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
                      </button>
                      {isOpen && (
                        <div className="p-3 pt-0 space-y-3">
                          <div className="flex items-center gap-2">
                            <Input value={t.name} onChange={(e) => editTeam(t.id, { name: e.target.value })} className="flex-1" />
                            <Input type="color" value={t.hex} onChange={(e) => editTeam(t.id, { hex: e.target.value })} className="w-14 p-1" />
                          </div>
                          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                            {TEAM_STATS.map((s) => (
                              <RatingSlider key={s.key} label={s.label} value={t[s.key]} min={60} onChange={(v) => editTeam(t.id, { [s.key]: v })} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="drivers" className="mt-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {people && !query && (
                <div className="flex flex-wrap rounded-md border border-border overflow-hidden text-[11px]">
                  {GROUPS.map(([k, l]) => (
                    <button key={k} onClick={() => setGroup(k)} className={cn("px-2 py-1", group === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                      {l}
                    </button>
                  ))}
                </div>
              )}
              <div className="relative flex-1 min-w-[160px]">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar piloto…" className="h-8 pl-7 text-xs" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Se editan los pilotos de la carrera actual: los cambios se mantienen aunque cambien de equipo, y siguen evolucionando con la edad y los resultados.
            </p>
            <ScrollArea className="h-[50vh] pr-3">
              <div className="space-y-1.5">
                {list.map((id) => {
                  const d = drivers[id];
                  const rec = people?.drivers[id];
                  const isOpen = expanded === id;
                  const tid = rec?.contract?.teamId ?? rec?.reserveOf ?? teamsData.find((t) => t.drivers.some((x) => x.id === id))?.id;
                  const color = teamsData.find((t) => t.id === tid)?.hex ?? "#71717a";
                  return (
                    <div key={id} className={cn("rounded-lg border", changed.has(id) ? "border-primary/60" : "border-border")}>
                      <button className="w-full flex items-center gap-2 px-2 py-1.5 text-left" onClick={() => setExpanded(isOpen ? null : id)}>
                        <TeamStripe color={color} />
                        <span className="text-sm">{d.nationality}</span>
                        <span className="text-sm flex-1 truncate">{d.name}</span>
                        <span className="text-[11px] text-muted-foreground hidden sm:inline truncate max-w-[180px]">
                          {rec ? `${ageOf(rec, season)} años · ${whereIs(rec, teamName)}` : ""}
                        </span>
                        <span className="text-xs font-mono w-14 text-right">{d.pace.toFixed(1)}</span>
                        <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
                      </button>
                      {isOpen && (
                        <div className="px-3 pb-3 space-y-3">
                          <div className="flex items-center gap-2">
                            <Input value={d.nationality} onChange={(e) => editDriver(id, { nationality: e.target.value })} className="w-14 text-center" title="Bandera" />
                            <Input value={d.name} onChange={(e) => editDriver(id, { name: e.target.value })} className="flex-1" />
                            <Input value={d.shortName} maxLength={3} onChange={(e) => editDriver(id, { shortName: e.target.value.toUpperCase() })} className="w-16 text-center" title="Abreviatura" />
                            <Input type="number" value={d.number} onChange={(e) => editDriver(id, { number: Number(e.target.value) })} className="w-16 text-center" title="Número" />
                          </div>
                          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                            {DRIVER_STATS.map((s) => (
                              <RatingSlider key={s.key} label={s.label} value={d[s.key]} onChange={(v) => editDriver(id, { [s.key]: v })} />
                            ))}
                            {d.potential !== undefined && (
                              <RatingSlider label="Potencial (techo de ritmo)" value={d.potential} onChange={(v) => editDriver(id, { potential: Math.max(v, d.pace) })} />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {!list.length && <div className="text-sm text-muted-foreground py-4 text-center">Sin resultados.</div>}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <div className="flex justify-between items-center gap-2 pt-2">
          <span className="text-[11px] text-muted-foreground">{changed.size ? `${changed.size} piloto${changed.size > 1 ? "s" : ""} modificado${changed.size > 1 ? "s" : ""}` : ""}</span>
          <Button onClick={handleSave} className="font-racing">
            <Save className="w-4 h-4 mr-1" /> Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
