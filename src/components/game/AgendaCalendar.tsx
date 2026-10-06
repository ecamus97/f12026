import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, ChevronRight, Flag } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { Race } from "@/data/f1Data";
import { ACTIVITY_KIND_INFO, describeEffect, isoDate, weekendDates, type Activity, type StoredRaceResult } from "@/engine";
import { SectionTitle } from "./visuals";
import { cn } from "@/lib/utils";

const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DOW = ["L", "M", "X", "J", "V", "S", "D"];

const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][date.getDay()]} ${d} ${MONTH_NAMES[m - 1].slice(0, 3).toLowerCase()}`;
};

/** One agenda item with its three choices. */
export function ActivityDialog({ a, onChoose, onClose }: { a: Activity | null; onChoose: (id: string, idx: number) => void; onClose: () => void }) {
  return (
    <Dialog open={!!a} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl bg-[hsl(222_22%_8%)] border-white/10 max-h-[90vh] overflow-y-auto">
        {a && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="tv-label px-2 py-0.5 rounded-sm text-black" style={{ backgroundColor: ACTIVITY_KIND_INFO[a.kind].color }}>
                {ACTIVITY_KIND_INFO[a.kind].label}
              </span>
              <span className="tv-label text-muted-foreground">{fmtDay(a.date)}</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-5xl leading-none">{a.icon}</span>
              <div>
                <DialogTitle className="font-display text-2xl md:text-3xl leading-tight">{a.title}</DialogTitle>
                <p className="text-sm text-muted-foreground mt-2">{a.text}</p>
              </div>
            </div>
            {a.chosen !== undefined ? (
              <div className="rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm">
                <div className="tv-label text-primary mb-1">Decisión tomada</div>
                {a.outcome}
                {a.applied && a.applied.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {a.applied.map((f) => (
                      <span key={f.text} className={cn("text-[11px] rounded px-1.5 py-0.5 border", f.good ? "border-emerald-500/40 text-emerald-300" : "border-red-500/40 text-red-300")}>
                        {f.text}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid gap-2">
                {a.choices.map((c, i) => {
                  const fx = describeEffect(c.effect);
                  return (
                    <motion.button
                      key={i}
                      whileHover={{ scale: 1.01 }}
                      onClick={() => {
                        onChoose(a.id, i);
                        onClose();
                      }}
                      className="text-left rounded-xl border border-white/10 bg-black/30 p-4 hover:border-primary/60 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-display text-xl text-primary">{String.fromCharCode(65 + i)}</span>
                        <span className="font-semibold">{c.label}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{c.desc}</div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {fx.length ? (
                          fx.map((f) => (
                            <span
                              key={f.text}
                              className={cn("text-[11px] rounded px-1.5 py-0.5 border", f.good ? "border-emerald-500/40 text-emerald-300" : "border-red-500/40 text-red-300")}
                            >
                              {f.text}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] rounded px-1.5 py-0.5 border border-white/10 text-muted-foreground">sin efectos</span>
                        )}
                        {c.risk && <span className="text-[11px] rounded px-1.5 py-0.5 border border-amber-500/40 text-amber-300">⚠ riesgo {Math.round(c.risk.chance * 100)}%</span>}
                      </div>
                    </motion.button>
                  );
                })}
                <p className="text-[11px] text-muted-foreground">Si no decides antes del fin de semana, se elige automáticamente la última opción.</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Agenda card for the Paddock: what comes before the next race. */
export function AgendaCard({ activities, season, nextRound, onChoose }: { activities: Activity[]; season: number; nextRound: number; onChoose: (id: string, idx: number) => void }) {
  const [open, setOpen] = useState<Activity | null>(null);
  const items = activities.filter((a) => a.season === season && a.beforeRound === nextRound);
  if (!items.length) return null;
  const pending = items.filter((a) => a.chosen === undefined).length;
  return (
    <div className={cn("panel p-4 space-y-3", pending && "border-amber-500/50")}>
      <SectionTitle right={pending ? <span className="text-amber-300">{pending} decisión{pending > 1 ? "es" : ""} pendiente{pending > 1 ? "s" : ""}</span> : "Todo resuelto"}>
        Agenda antes del GP
      </SectionTitle>
      <div className="grid md:grid-cols-2 gap-3">
        {items.map((a) => (
          <button key={a.id} onClick={() => setOpen(a)} className="panel-hover text-left rounded-xl border border-white/10 bg-black/25 p-3 flex gap-3 items-start">
            <span className="text-3xl leading-none">{a.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="tv-label" style={{ color: ACTIVITY_KIND_INFO[a.kind].color }}>
                  {ACTIVITY_KIND_INFO[a.kind].label}
                </span>
                <span className="text-[10px] text-muted-foreground">{fmtDay(a.date)}</span>
              </div>
              <div className="font-semibold leading-snug mt-0.5">{a.title}</div>
              <div className={cn("text-xs mt-1", a.chosen === undefined ? "text-amber-300" : "text-muted-foreground")}>
                {a.chosen === undefined ? "Elige qué hacer →" : a.outcome}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground mt-2" />
          </button>
        ))}
      </div>
      <ActivityDialog a={open} onChoose={onChoose} onClose={() => setOpen(null)} />
    </div>
  );
}

/** Real calendar: month grids with the race weekends and the agenda. */
export function SeasonCalendar({
  races, season, results, currentRaceIndex, activities, winnerOf, onRace, onChoose,
}: {
  races: Race[];
  season: number;
  results: StoredRaceResult[];
  currentRaceIndex: number;
  activities: Activity[];
  winnerOf: (raceId: number) => string | undefined;
  onRace: () => void;
  onChoose: (id: string, idx: number) => void;
}) {
  const [open, setOpen] = useState<Activity | null>(null);
  const days = useMemo(() => {
    const map = new Map<string, { race?: { r: Race; i: number; first: boolean; sunday: boolean }; acts: Activity[] }>();
    races.forEach((r, i) => {
      const { start, end } = weekendDates(r.date, season);
      for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) {
        const k = isoDate(d);
        map.set(k, { ...(map.get(k) ?? { acts: [] }), race: { r, i, first: d.getTime() === start.getTime(), sunday: d.getTime() === end.getTime() } });
      }
    });
    for (const a of activities.filter((x) => x.season === season)) {
      const cur = map.get(a.date) ?? { acts: [] };
      map.set(a.date, { ...cur, acts: [...cur.acts, a] });
    }
    return map;
  }, [races, season, activities]);

  const months = Array.from({ length: 12 }, (_, k) => k); // Jan..Dec
  const nextKey = races[currentRaceIndex] ? isoDate(weekendDates(races[currentRaceIndex].date, season).start) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-primary" /> Próximo GP</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-white/25" /> Gran Premio</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-600/60" /> Disputado</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-400" /> Actividad pendiente</span>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {months.map((mo) => {
          const first = new Date(season, mo, 1);
          const offset = (first.getDay() + 6) % 7;
          const len = new Date(season, mo + 1, 0).getDate();
          const cells = Array.from({ length: offset + len }, (_, i) => (i < offset ? null : i - offset + 1));
          return (
            <div key={mo} className="panel p-3">
              <div className="font-display text-lg mb-2 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-primary" /> {MONTH_NAMES[mo]} {season}
              </div>
              <div className="grid grid-cols-7 gap-1 text-center">
                {DOW.map((d) => (
                  <div key={d} className="tv-label text-muted-foreground !text-[9px]">{d}</div>
                ))}
                {cells.map((d, i) => {
                  if (!d) return <div key={i} />;
                  const k = isoDate(new Date(season, mo, d));
                  const info = days.get(k);
                  const race = info?.race;
                  const done = race && results.some((r) => r.raceId === race.r.id);
                  const next = race && race.i === currentRaceIndex;
                  const pendingAct = info?.acts.some((a) => a.chosen === undefined);
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        if (info?.acts.length) setOpen(info.acts[0]);
                        else if (next) onRace();
                      }}
                      title={[race ? `R${race.r.id} ${race.r.name}${done ? ` · ganó ${winnerOf(race.r.id) ?? ""}` : ""}` : "", ...(info?.acts.map((a) => `${a.icon} ${a.title}`) ?? [])].filter(Boolean).join("\n")}
                      className={cn(
                        "relative aspect-square rounded-md text-[11px] flex flex-col items-center justify-center leading-none",
                        race ? (next ? "bg-primary text-primary-foreground" : done ? "bg-emerald-600/40" : "bg-white/15") : "bg-white/[0.03]",
                        k === nextKey && "ring-2 ring-primary",
                        (info?.acts.length || next) && "cursor-pointer hover:brightness-125",
                      )}
                    >
                      <span className={cn(race?.sunday && "font-bold")}>{d}</span>
                      {race?.first && <span className="text-[13px] leading-none mt-0.5">{race.r.flag}</span>}
                      {race?.sunday && <Flag className="w-2.5 h-2.5 mt-0.5" />}
                      {info?.acts.length ? (
                        <span className={cn("absolute -top-1 -right-1 text-[11px] rounded-full w-4 h-4 grid place-items-center", pendingAct ? "bg-amber-400" : "bg-white/20")}>
                          {info.acts[0].icon}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {/* list of what happens this month */}
              <div className="mt-2 space-y-1">
                {races
                  .map((r, i) => ({ r, i, d: weekendDates(r.date, season) }))
                  .filter((x) => x.d.end.getMonth() === mo)
                  .map(({ r, i, d }) => {
                    const done = results.some((x) => x.raceId === r.id);
                    return (
                      <div key={r.id} className={cn("flex items-center gap-2 text-xs", i === currentRaceIndex && "text-primary font-semibold")}>
                        <span className="w-9 text-muted-foreground">R{r.id}</span>
                        <span>{r.flag}</span>
                        <span className="flex-1 truncate">{r.name}</span>
                        <span className="text-muted-foreground">{d.start.getDate()}-{d.end.getDate()}</span>
                        {done && <span className="text-emerald-400 truncate max-w-[90px]">🏆 {winnerOf(r.id)?.split(" ").slice(-1)[0]}</span>}
                      </div>
                    );
                  })}
                {activities
                  .filter((a) => a.season === season && Number(a.date.slice(5, 7)) - 1 === mo)
                  .map((a) => (
                    <button key={a.id} onClick={() => setOpen(a)} className="w-full flex items-center gap-2 text-xs text-left hover:text-foreground text-muted-foreground">
                      <span className="w-9">{Number(a.date.slice(8))}</span>
                      <span>{a.icon}</span>
                      <span className={cn("flex-1 truncate", a.chosen === undefined && "text-amber-300")}>{a.title}</span>
                    </button>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
      <ActivityDialog a={open} onChoose={onChoose} onClose={() => setOpen(null)} />
    </div>
  );
}
