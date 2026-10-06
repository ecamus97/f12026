import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Newspaper, ChevronRight } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { Team } from "@/data/f1Data";
import { NEWS_KIND_INFO, carPace, type ManagementState, type NewsChart, type NewsItem, type NewsKind, type RuleProposal } from "@/engine";
import { CarSilhouette, CircuitOutline, SectionTitle } from "./visuals";
import { ProposalCard } from "./RulesView";
import { cn } from "@/lib/utils";

interface Ctx {
  teams: Team[];
  management: ManagementState | null;
  proposals: RuleProposal[];
  playerTeamId: string | null;
}

const when = (n: NewsItem) => (n.round === 0 ? `Pretemporada ${n.season}` : `${n.season} · Ronda ${n.round}`);

function KindTag({ kind }: { kind: NewsKind }) {
  const k = NEWS_KIND_INFO[kind];
  return (
    <span className="tv-label px-2 py-0.5 rounded-sm text-black" style={{ backgroundColor: k.color }}>
      {k.label}
    </span>
  );
}

const KIND_ICON: Record<NewsKind, string> = {
  race: "🏁",
  championship: "🏆",
  team: "⭐",
  development: "🔧",
  rules: "⚖️",
  market: "✍️",
  weather: "🌧️",
  season: "🏆",
};

/** Header art of a story: the team's car at speed, the circuit when it's about a race. */
function Art({ n, className, big }: { n: NewsItem; className?: string; big?: boolean }) {
  const color = n.color ?? NEWS_KIND_INFO[n.kind].color;
  const showCar = !!n.color && n.kind !== "rules";
  return (
    <div className={cn("relative overflow-hidden", className)} style={{ background: `linear-gradient(120deg, ${color}66 0%, ${color}22 45%, #0b0d12 100%)` }}>
      {/* speed streaks */}
      <div
        className="absolute inset-0 opacity-40"
        style={{ backgroundImage: `repeating-linear-gradient(170deg, transparent 0 18px, ${color}33 18px 19px, transparent 19px 46px)` }}
      />
      {n.raceId && (
        <CircuitOutline raceId={n.raceId} className={cn("absolute top-1/2 -translate-y-1/2 opacity-50", big ? "left-4 h-[90%]" : "left-3 h-[85%]")} stroke={color} width={12} />
      )}
      {showCar ? (
        <motion.div
          initial={{ x: 80, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className={cn("absolute top-1/2 -translate-y-1/2", big ? "right-6 w-[46%]" : "right-3 w-[52%]")}
        >
          <CarSilhouette color={color} className="w-full h-auto drop-shadow-[0_14px_18px_rgba(0,0,0,0.7)]" />
        </motion.div>
      ) : (
        <span className={cn("absolute right-6 top-1/2 -translate-y-1/2 drop-shadow-lg", big ? "text-7xl" : "text-5xl")}>{KIND_ICON[n.kind]}</span>
      )}
      <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-[hsl(222_22%_8%)] to-transparent" />
    </div>
  );
}

export function NewsChartView({ chart, ctx, large }: { chart: NewsChart; ctx: Ctx; large?: boolean }) {
  switch (chart.type) {
    case "podium": {
      const order = [chart.rows[1], chart.rows[0], chart.rows[2]].filter(Boolean);
      const h = [70, 100, 50];
      return (
        <div className="flex items-end justify-center gap-2 pt-2">
          {order.map((r) => {
            const place = chart.rows.indexOf(r) + 1;
            return (
              <motion.div
                key={r.name}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                transition={{ delay: place * 0.12 }}
                className="flex flex-col items-center w-28 md:w-36"
              >
                <div className="text-center mb-1">
                  <div className="font-display text-base md:text-lg leading-tight">{r.name.split(" ").slice(-1)[0]}</div>
                  <div className="text-[10px] text-muted-foreground truncate max-w-[9rem]">{r.team}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">{r.note}</div>
                </div>
                <div
                  className="w-full rounded-t-md grid place-items-start justify-center pt-2"
                  style={{ height: (large ? 1.3 : 1) * h[order.indexOf(r)], background: `linear-gradient(180deg, ${r.color}, ${r.color}55)` }}
                >
                  <span className="font-display text-3xl text-black/70">{place}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      );
    }
    case "bars": {
      const max = Math.max(1, ...chart.rows.map((r) => Math.abs(r.value)));
      const signed = chart.rows.some((r) => r.value < 0);
      return (
        <div className="space-y-1.5">
          <div className="tv-label text-muted-foreground">{chart.title}</div>
          {chart.rows.map((r, i) => (
            <div key={r.label} className={cn("flex items-center gap-2 text-xs", r.mine && "text-primary font-semibold")}>
              <span className="w-32 truncate">{r.label}</span>
              <div className={cn("flex-1 h-4 relative", signed && "bg-white/5 rounded")}>
                {signed && <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20" />}
                <motion.div
                  className="absolute top-0 bottom-0 rounded"
                  style={{
                    backgroundColor: r.color,
                    left: signed ? (r.value >= 0 ? "50%" : undefined) : 0,
                    right: signed && r.value < 0 ? "50%" : undefined,
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(Math.abs(r.value) / max) * (signed ? 50 : 100)}%` }}
                  transition={{ delay: i * 0.05, duration: 0.6 }}
                />
              </div>
              <span className="w-14 text-right tabular-nums">
                {signed && r.value > 0 ? "+" : ""}
                {r.value.toFixed(signed ? 1 : 0)} {chart.unit}
              </span>
            </div>
          ))}
        </div>
      );
    }
    case "positions":
      return (
        <div className="grid gap-2">
          {chart.rows.map((r) => {
            const delta = r.to ? r.from - r.to : 0;
            return (
              <div key={r.label} className="relative overflow-hidden rounded-lg border border-white/10 bg-black/30 p-3 flex items-center gap-4">
                <div className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: r.color }} />
                <div className="flex-1 min-w-0 pl-1">
                  <div className="text-xs text-muted-foreground truncate">{r.label.split(" ").slice(0, -1).join(" ")}</div>
                  <div className="font-display text-xl leading-none truncate">{r.label.split(" ").slice(-1)[0]}</div>
                  {r.note && <div className="text-[11px] text-muted-foreground mt-1 truncate">{r.note}</div>}
                </div>
                <div className="text-center">
                  <div className="tv-label text-muted-foreground !text-[9px]">Salida</div>
                  <div className="font-display text-2xl text-muted-foreground">P{r.from}</div>
                </div>
                <motion.span initial={{ x: -6, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="text-xl text-muted-foreground">
                  →
                </motion.span>
                <div className="text-center min-w-[64px]">
                  <div className="tv-label text-muted-foreground !text-[9px]">Llegada</div>
                  {r.to ? (
                    <div className={cn("font-display text-4xl leading-none", r.to === 1 ? "text-yellow-300" : r.to <= 3 ? "text-foreground" : "")} style={r.to > 3 ? { color: r.color } : undefined}>
                      P{r.to}
                    </div>
                  ) : (
                    <div className="font-display text-2xl text-red-400">DNF</div>
                  )}
                </div>
                <div className="w-20 text-right space-y-1">
                  <span
                    className={cn(
                      "inline-block font-display text-sm px-2 py-0.5 rounded",
                      !r.to ? "bg-red-500/20 text-red-300" : delta > 0 ? "bg-emerald-500/20 text-emerald-300" : delta < 0 ? "bg-red-500/20 text-red-300" : "bg-white/10 text-muted-foreground",
                    )}
                  >
                    {!r.to ? "—" : delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${-delta}` : "="}
                  </span>
                  {r.points !== undefined && <div className="text-xs text-muted-foreground">{r.points ? `+${r.points} pts` : "sin puntos"}</div>}
                </div>
              </div>
            );
          })}
        </div>
      );
    case "dev": {
      const hist = ctx.management?.history ?? [];
      const data = hist.map((h) => {
        const row: Record<string, number | string> = { label: h.round < 0 ? "Ant." : h.round === 0 ? "Inicio" : `R${h.round}` };
        for (const id of chart.teamIds) if (h.dev[id]) row[id] = +carPace(h.dev[id]).toFixed(2);
        return row;
      });
      return (
        <div className={large ? "h-56" : "h-36"}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} />
              <YAxis domain={["dataMin - 0.5", "dataMax + 0.5"]} tick={{ fontSize: 10, fill: "#94a3b8" }} />
              <Tooltip contentStyle={{ background: "#0b0d12", border: "1px solid #2a2f3a", fontSize: 12 }} />
              {chart.teamIds.map((id) => {
                const t = ctx.teams.find((x) => x.id === id);
                return <Line key={id} type="monotone" dataKey={id} name={t?.name ?? id} stroke={t?.hex ?? "#888"} strokeWidth={id === ctx.playerTeamId ? 3 : 2} dot={false} />;
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }
    case "votes": {
      const p = ctx.proposals.find((x) => x.id === chart.proposalId);
      return p ? <ProposalCard p={p} teams={ctx.teams} playerTeamId={ctx.playerTeamId} /> : null;
    }
  }
}

export function NewsDialog({ n, ctx, onClose }: { n: NewsItem | null; ctx: Ctx; onClose: () => void }) {
  return (
    <Dialog open={!!n} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden bg-[hsl(222_22%_8%)] border-white/10 max-h-[90vh] overflow-y-auto">
        {n && (
          <>
            <Art n={n} className="h-44" big />
            <div className="p-5 md:p-6 space-y-4 -mt-6 relative">
              <div className="flex items-center gap-2">
                <KindTag kind={n.kind} />
                <span className="tv-label text-muted-foreground">{when(n)}</span>
              </div>
              <DialogTitle className="font-display text-3xl md:text-4xl leading-none">{n.title}</DialogTitle>
              <p className="text-base text-foreground/90">{n.summary}</p>
              {n.chart && (
                <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                  <NewsChartView chart={n.chart} ctx={ctx} large />
                </div>
              )}
              <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">
                {n.body.map((b, i) => (
                  <p key={i}>{b}</p>
                ))}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Latest stories for the Paddock: a featured one plus a list. */
export function NewsFeed({ news, ctx, onAll, limit = 5 }: { news: NewsItem[]; ctx: Ctx; onAll: () => void; limit?: number }) {
  const [open, setOpen] = useState<NewsItem | null>(null);
  const latest = useMemo(() => [...news].reverse().slice(0, 12), [news]);
  if (!latest.length) {
    return (
      <div className="panel p-4 space-y-2">
        <SectionTitle>Noticias del paddock</SectionTitle>
        <p className="text-sm text-muted-foreground">Las noticias aparecen después de cada Gran Premio.</p>
      </div>
    );
  }
  const lastRound = latest[0];
  const featured = latest.filter((n) => n.season === lastRound.season && n.round === lastRound.round).sort((a, b) => b.importance - a.importance)[0];
  const rest = latest.filter((n) => n !== featured).slice(0, limit - 1);
  return (
    <div className="space-y-3">
      <SectionTitle right={<button className="hover:text-foreground" onClick={onAll}>Todas las noticias →</button>}>Noticias del paddock</SectionTitle>
      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4">
        <button onClick={() => setOpen(featured)} className="panel panel-hover text-left overflow-hidden">
          <Art n={featured} className="h-36" />
          <div className="p-4 space-y-3 -mt-6 relative">
            <div className="flex items-center gap-2">
              <KindTag kind={featured.kind} />
              <span className="tv-label text-muted-foreground">{when(featured)}</span>
            </div>
            <div className="font-display text-2xl md:text-3xl leading-none">{featured.title}</div>
            <p className="text-sm text-muted-foreground">{featured.summary}</p>
            {featured.chart && featured.chart.type !== "votes" && <NewsChartView chart={featured.chart} ctx={ctx} />}
            <div className="text-xs text-primary">Leer más →</div>
          </div>
        </button>
        <div className="panel divide-y divide-white/5">
          {rest.map((n) => (
            <button key={n.id} onClick={() => setOpen(n)} className="w-full text-left p-3 flex items-start gap-3 hover:bg-white/[0.03] transition-colors">
              <span className="mt-1 h-10 w-1 rounded-full shrink-0" style={{ backgroundColor: n.color ?? NEWS_KIND_INFO[n.kind].color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <KindTag kind={n.kind} />
                  <span className="text-[10px] text-muted-foreground">{when(n)}</span>
                </div>
                <div className="font-semibold text-sm mt-1 leading-snug">{n.title}</div>
                <div className="text-xs text-muted-foreground line-clamp-1">{n.summary}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground mt-3" />
            </button>
          ))}
        </div>
      </div>
      <NewsDialog n={open} ctx={ctx} onClose={() => setOpen(null)} />
    </div>
  );
}

/** Full news page with filters. */
export function NewsScreen({ news, ctx }: { news: NewsItem[]; ctx: Ctx }) {
  const [kind, setKind] = useState<NewsKind | "all" | "mine">("all");
  const [open, setOpen] = useState<NewsItem | null>(null);
  const list = [...news]
    .reverse()
    .filter((n) => (kind === "all" ? true : kind === "mine" ? n.mine || n.teamIds.includes(ctx.playerTeamId ?? "") : n.kind === kind));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {(["all", "mine", ...(Object.keys(NEWS_KIND_INFO) as NewsKind[])] as (NewsKind | "all" | "mine")[]).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={cn("rounded-full px-3 py-1 text-xs border", kind === k ? "bg-primary text-primary-foreground border-primary" : "border-white/10 text-muted-foreground hover:text-foreground")}
          >
            {k === "all" ? "Todas" : k === "mine" ? "Mi equipo" : NEWS_KIND_INFO[k].label}
          </button>
        ))}
      </div>
      {!list.length && <div className="panel p-5 text-sm text-muted-foreground">No hay noticias en esta categoría todavía.</div>}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {list.map((n, i) => (
          <motion.button
            key={n.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 12) * 0.02 }}
            onClick={() => setOpen(n)}
            className="panel panel-hover text-left overflow-hidden"
          >
            <Art n={n} className="h-28" />
            <div className="p-4 space-y-2 -mt-5 relative">
              <div className="flex items-center gap-2">
                <KindTag kind={n.kind} />
                <span className="tv-label text-muted-foreground">{when(n)}</span>
              </div>
              <div className="font-display text-xl leading-tight">{n.title}</div>
              <p className="text-xs text-muted-foreground line-clamp-2">{n.summary}</p>
            </div>
          </motion.button>
        ))}
      </div>
      <NewsDialog n={open} ctx={ctx} onClose={() => setOpen(null)} />
    </div>
  );
}
