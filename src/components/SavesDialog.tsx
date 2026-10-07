import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, FolderOpen, HardDrive, History, Save, Trash2, Upload } from "lucide-react";
import type { GameState } from "@/hooks/useGameState";
import {
  deleteSave, exportGame, getSave, listSaves, metaOf, parseImport, saveToSlot, SLOT_COUNT, AUTO_KEEP, type SaveInfo, type SaveMeta,
} from "@/lib/saves";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const when = (t: number) =>
  new Date(t).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const kb = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

function MetaLine({ meta, className }: { meta: SaveMeta; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 min-w-0", className)}>
      <span className="w-1 h-4 rounded-full shrink-0" style={{ backgroundColor: meta.hex ?? "#64748b" }} />
      <span className="font-medium truncate">{meta.team ?? "Sin equipo"}</span>
      <span className="text-muted-foreground shrink-0">
        · {meta.season} · {meta.round}/{meta.totalRounds} carreras
      </span>
    </div>
  );
}

interface Confirm {
  title: string;
  text: string;
  label: string;
  danger?: boolean;
  run: () => void | Promise<void>;
}

export function SavesDialog({ game, onLoad }: { game: GameState; onLoad: (raw: unknown) => boolean }) {
  const [open, setOpen] = useState(false);
  const [saves, setSaves] = useState<SaveInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    listSaves()
      .then((s) => {
        setSaves(s);
        setStorageError(null);
      })
      .catch(() => setStorageError("Este navegador no permite guardar copias (modo privado o almacenamiento bloqueado). Usa Exportar."));
  }, []);
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const current = metaOf(game);
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => saves.find((s) => s.id === `slot-${i + 1}`) ?? null);
  const autos = saves.filter((s) => s.kind === "auto");

  const load = async (id: string, label: string) => {
    setBusy(true);
    try {
      const rec = await getSave(id);
      if (!rec || !onLoad(JSON.parse(rec.data))) throw new Error();
      toast({ title: "Partida cargada", description: label });
      setOpen(false);
    } catch {
      toast({ title: "No se pudo cargar", description: "La copia está dañada o es de un formato desconocido.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const saveSlot = async (n: number) => {
    setBusy(true);
    try {
      await saveToSlot(n, game);
      toast({ title: `Guardado en la ranura ${n}` });
      refresh();
    } catch {
      toast({ title: "No se pudo guardar", description: "No queda espacio en el navegador. Exporta la partida a un archivo.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const res = parseImport(text);
    if ("error" in res) {
      toast({ title: "No se pudo importar", description: res.error, variant: "destructive" });
      return;
    }
    setConfirm({
      title: "¿Importar esta partida?",
      text: `${res.meta?.team ?? "Sin equipo"} · temporada ${res.meta?.season} · ${res.meta?.round}/${res.meta?.totalRounds} carreras. Reemplaza la partida actual (antes se guarda una copia automática).`,
      label: "Importar",
      run: () => {
        if (onLoad(res.state)) {
          toast({ title: "Partida importada", description: file.name });
          setOpen(false);
        } else toast({ title: "No se pudo importar", description: "El archivo está dañado.", variant: "destructive" });
      },
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="font-racing text-xs" title="Guardar y cargar partidas">
            <HardDrive className="w-4 h-4" />
            <span className="hidden lg:inline ml-1">Partidas</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Partidas</DialogTitle>
            <DialogDescription>
              El juego se guarda solo en este navegador. Para no perder tu carrera si borras los datos del navegador o cambias de
              computador, exporta un archivo de vez en cuando.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-3">
            <div className="space-y-5">
              {/* current game + file */}
              <section className="rounded-lg border border-border bg-background/40 p-3 space-y-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Partida actual</div>
                <MetaLine meta={current} className="text-sm" />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => exportGame(game)} disabled={!game.playerTeamId}>
                    <Download className="w-4 h-4 mr-1" /> Exportar a archivo
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                    <Upload className="w-4 h-4 mr-1" /> Importar archivo
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => {
                      onFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </div>
              </section>

              {storageError && <p className="text-sm text-amber-300">{storageError}</p>}

              {/* manual slots */}
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <Save className="w-3.5 h-3.5" /> Ranuras de guardado
                </div>
                {slots.map((s, i) => {
                  const n = i + 1;
                  return (
                    <div key={n} className="rounded-lg border border-border p-2.5 flex flex-wrap items-center gap-2">
                      <span className="font-racing text-xs w-16 shrink-0">Ranura {n}</span>
                      <div className="flex-1 min-w-[180px] text-sm">
                        {s ? (
                          <>
                            <MetaLine meta={s.meta} />
                            <div className="text-[11px] text-muted-foreground">
                              {when(s.savedAt)} · {kb(s.bytes)}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Vacía</span>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          disabled={busy || !game.playerTeamId}
                          onClick={() =>
                            s
                              ? setConfirm({
                                  title: `¿Sobrescribir la ranura ${n}?`,
                                  text: "Se reemplaza lo que tiene guardado por la partida actual.",
                                  label: "Guardar",
                                  run: () => saveSlot(n),
                                })
                              : saveSlot(n)
                          }
                        >
                          <Save className="w-3.5 h-3.5 mr-1" /> Guardar aquí
                        </Button>
                        {s && (
                          <>
                            <Button
                              size="sm"
                              className="h-8 text-xs"
                              disabled={busy}
                              onClick={() =>
                                setConfirm({
                                  title: `¿Cargar la ranura ${n}?`,
                                  text: "Reemplaza la partida actual (antes se guarda una copia automática).",
                                  label: "Cargar",
                                  run: () => load(s.id, `Ranura ${n}`),
                                })
                              }
                            >
                              <FolderOpen className="w-3.5 h-3.5 mr-1" /> Cargar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-destructive hover:text-destructive"
                              title="Borrar"
                              disabled={busy}
                              onClick={() =>
                                setConfirm({
                                  title: `¿Borrar la ranura ${n}?`,
                                  text: "Esta copia se elimina para siempre.",
                                  label: "Borrar",
                                  danger: true,
                                  run: async () => {
                                    await deleteSave(s.id);
                                    refresh();
                                  },
                                })
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </section>

              {/* automatic backups */}
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <History className="w-3.5 h-3.5" /> Copias automáticas
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Se guarda una copia después de cada carrera, al empezar cada temporada y antes de cargar o empezar otra partida. Se
                  conservan las últimas {AUTO_KEEP}.
                </p>
                {autos.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay copias.</p>}
                {autos.map((s) => (
                  <div key={s.id} className="rounded-lg border border-border/60 p-2.5 flex flex-wrap items-center gap-2 text-sm">
                    <div className="flex-1 min-w-[200px]">
                      <MetaLine meta={s.meta} />
                      <div className="text-[11px] text-muted-foreground">
                        {s.name} · {when(s.savedAt)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={busy}
                      onClick={() =>
                        setConfirm({
                          title: "¿Restaurar esta copia?",
                          text: `${s.name}. Reemplaza la partida actual (antes se guarda una copia de la actual).`,
                          label: "Restaurar",
                          run: () => load(s.id, s.name),
                        })
                      }
                    >
                      <History className="w-3.5 h-3.5 mr-1" /> Restaurar
                    </Button>
                  </div>
                ))}
              </section>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.text}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={cn(confirm?.danger && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
              onClick={() => {
                const c = confirm;
                setConfirm(null);
                c?.run();
              }}
            >
              {confirm?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
