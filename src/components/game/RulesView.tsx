import { motion } from "framer-motion";
import { Gavel, Landmark, Check, X, Minus, Scale } from "lucide-react";
import type { Team } from "@/data/f1Data";
import { describeRules, rulesFor, tally, type RuleProposal, type RuleSet, type Vote } from "@/engine";
import { SectionTitle } from "./visuals";
import { cn } from "@/lib/utils";

const VOTE_INFO: Record<Vote, { label: string; icon: typeof Check; cls: string; bar: string }> = {
  for: { label: "A favor", icon: Check, cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40", bar: "bg-emerald-500" },
  abstain: { label: "Abstención", icon: Minus, cls: "bg-zinc-500/15 text-zinc-300 border-zinc-500/40", bar: "bg-zinc-500" },
  against: { label: "En contra", icon: X, cls: "bg-red-500/15 text-red-300 border-red-500/40", bar: "bg-red-500" },
};

export function RulesView({
  season, rules, proposals, teams, playerTeamId, onVote,
}: {
  season: number;
  rules: RuleSet;
  proposals: RuleProposal[];
  teams: Team[];
  playerTeamId: string | null;
  onVote: (id: string, vote: Vote) => void;
}) {
  const current = proposals.filter((p) => p.season === season).sort((a, b) => b.round - a.round);
  const pending = current.filter((p) => p.status === "pending");
  const decided = current.filter((p) => p.status !== "pending");
  const next = rulesFor(season + 1, rules, proposals);
  const nowRows = describeRules(rules);
  const nextRows = describeRules(next);
  const past = proposals.filter((p) => p.season < season).sort((a, b) => b.season - a.season || b.round - a.round);

  return (
    <div className="space-y-6">
      <div className="panel panel-accent overflow-hidden p-5 md:p-6 relative">
        <Landmark className="absolute -right-6 -bottom-8 w-48 h-48 text-primary/10" />
        <p className="tv-label text-muted-foreground">Consejo Mundial · Comisión de F1</p>
        <h1 className="font-display text-4xl md:text-5xl mt-1">Reglamento {season}</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          Durante la temporada la FIA impone cambios y los 11 jefes de equipo votan propuestas. Todo lo aprobado entra en vigor la temporada
          siguiente; los cambios técnicos modifican el rendimiento de los autos (se ve en el gráfico de desarrollo). Una propuesta se aprueba si tiene más votos a favor que en contra; cada equipo vota según le conviene. Hay anuncios después
          de las rondas 6, 10 y 17.
        </p>
      </div>

      {pending.map((p) => (
        <motion.div
          key={p.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="panel overflow-hidden border-primary/50 shadow-[0_0_60px_-20px_hsl(var(--primary)/0.7)]"
        >
          <div className="bg-primary text-primary-foreground px-5 py-2 flex items-center gap-2 clip-slant w-fit pr-10">
            <Gavel className="w-4 h-4" />
            <span className="tv-label">Votación abierta · tu voto</span>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <div className="font-display text-2xl md:text-3xl">{p.title}</div>
              <p className="text-sm text-muted-foreground mt-1">{p.desc}</p>
              <ImpactChip p={p} />
              <p className="text-xs text-muted-foreground mt-1">
                Aplica desde {p.effective}. Si no votas antes de la próxima carrera, tu voto cuenta como abstención.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              {(["for", "abstain", "against"] as Vote[]).map((v) => {
                const I = VOTE_INFO[v].icon;
                return (
                  <button
                    key={v}
                    onClick={() => onVote(p.id, v)}
                    className={cn("rounded-xl border-2 py-4 flex flex-col items-center gap-1 transition-transform hover:scale-[1.03]", VOTE_INFO[v].cls)}
                  >
                    <I className="w-6 h-6" />
                    <span className="font-display text-base md:text-lg">{VOTE_INFO[v].label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>
      ))}

      {decided.length > 0 && (
        <div className="space-y-3">
          <SectionTitle>Decisiones de esta temporada</SectionTitle>
          {decided.map((p) => (
            <ProposalCard key={p.id} p={p} teams={teams} playerTeamId={playerTeamId} />
          ))}
        </div>
      )}
      {current.length === 0 && (
        <div className="panel p-5 text-sm text-muted-foreground">Todavía no hay propuestas esta temporada. La FIA anunciará su primer cambio después de la ronda 6.</div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <RulesTable title={`En vigor · ${season}`} rows={nowRows} />
        <RulesTable title={`Próxima temporada · ${season + 1}`} rows={nextRows} compare={nowRows} />
      </div>

      {past.length > 0 && (
        <div className="space-y-3">
          <SectionTitle>Historial</SectionTitle>
          {past.map((p) => (
            <ProposalCard key={p.id} p={p} teams={teams} playerTeamId={playerTeamId} compact />
          ))}
        </div>
      )}
    </div>
  );
}

const EFFECT_LABEL = { aero: "Aerodinámica", powerUnit: "Unidad de potencia", chassis: "Chasis" } as const;

/** Rules that change the cars' ratings when they come into force. */
function ImpactChip({ p }: { p: RuleProposal }) {
  const label = p.effect ? EFFECT_LABEL[p.effect] : p.key === "budgetCap" && p.patch.budgetCap ? "Aero, motor y chasis de los equipos de adelante" : null;
  if (!label) return null;
  return (
    <span className="inline-flex mt-2 items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[11px] text-amber-200">
      ⚙️ Cambia el rendimiento de los autos en {p.effective}: {label}
    </span>
  );
}

function RulesTable({ title, rows, compare }: { title: string; rows: ReturnType<typeof describeRules>; compare?: ReturnType<typeof describeRules> }) {
  return (
    <div className="panel p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Scale className="w-4 h-4 text-primary" />
        <span className="font-display text-lg">{title}</span>
      </div>
      <div className="divide-y divide-white/5">
        {rows.map((r, i) => {
          const changedNow = compare && compare[i].value !== r.value;
          return (
            <div key={r.label} className={cn("flex items-center justify-between gap-3 py-2 text-sm", changedNow && "text-primary")}>
              <span className={cn("text-muted-foreground", changedNow && "text-primary/80")}>{r.label}</span>
              <span className="text-right font-semibold">
                {r.value}
                {changedNow && <span className="ml-2 tv-label rounded bg-primary text-primary-foreground px-1.5 py-0.5">nuevo</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ProposalCard({ p, teams, playerTeamId, compact }: { p: RuleProposal; teams: Team[]; playerTeamId: string | null; compact?: boolean }) {
  const fia = p.by === "fia";
  const ok = p.status === "approved" || p.status === "decreed";
  const n = tally(p.votes);
  const total = Math.max(1, n.for + n.against + n.abstain);
  return (
    <div className="panel p-4 space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <span className={cn("tv-label rounded px-2 py-1", fia ? "bg-sky-500/20 text-sky-300" : "bg-white/10 text-foreground")}>
          {fia ? "Decreto FIA" : "Votación"} · {p.season} R{p.round}
        </span>
        <div className="flex-1 min-w-[200px]">
          <div className="font-display text-xl">{p.title}</div>
          {!compact && <p className="text-xs text-muted-foreground mt-0.5">{p.desc}</p>}
          {!compact && <ImpactChip p={p} />}
        </div>
        <span
          className={cn(
            "font-display text-sm px-3 py-1 rounded clip-slant-both",
            ok ? "bg-emerald-500 text-black" : "bg-red-500 text-white",
          )}
        >
          {p.status === "decreed" ? "Impuesto" : ok ? "Aprobado" : "Rechazado"} · {p.effective}
        </span>
      </div>
      {p.votes && (
        <>
          <div className="flex h-3 rounded-full overflow-hidden bg-white/5">
            {(["for", "abstain", "against"] as Vote[]).map((v) => (
              <motion.div
                key={v}
                className={VOTE_INFO[v].bar}
                initial={{ width: 0 }}
                animate={{ width: `${(n[v] / total) * 100}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-emerald-300">{n.for} a favor</span>
            <span className="text-zinc-400">{n.abstain} abstenciones</span>
            <span className="text-red-300">{n.against} en contra</span>
          </div>
          {!compact && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
              {teams.map((t, i) => {
                const v = p.votes![t.id] ?? "abstain";
                const I = VOTE_INFO[v].icon;
                return (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs",
                      VOTE_INFO[v].cls,
                      t.id === playerTeamId && "ring-1 ring-primary",
                    )}
                  >
                    <span className="h-4 w-1 rounded-full" style={{ backgroundColor: t.hex }} />
                    <span className="flex-1 truncate text-foreground">{t.shortName ?? t.name}</span>
                    <I className="w-3.5 h-3.5" />
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
