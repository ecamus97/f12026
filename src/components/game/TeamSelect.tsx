import { motion } from "framer-motion";
import type { Team } from "@/data/f1Data";
import { startBudget } from "@/engine";
import { CarSilhouette, SectionTitle, TeamLogo } from "./visuals";

const difficulty = (rank: number) => (rank <= 3 ? "Favorito" : rank <= 6 ? "Contendiente" : rank <= 9 ? "Desafío" : "Muy difícil");

export function TeamSelect({ teams, onChoose }: { teams: Team[]; onChoose: (teamId: string) => void }) {
  const sorted = [...teams].sort((a, b) => b.pace - a.pace);
  return (
    <div className="space-y-5">
      <SectionTitle right="Los equipos de abajo son un desafío mayor">Elige tu escudería</SectionTitle>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((team, i) => (
          <motion.button
            key={team.id}
            onClick={() => onChoose(team.id)}
            className="panel panel-hover text-left overflow-hidden group"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.035 }}
          >
            <div className="relative h-32 overflow-hidden" style={{ background: `linear-gradient(135deg, ${team.hex}55, transparent 70%)` }}>
              <span className="absolute left-20 top-3 font-display text-6xl opacity-15" style={{ color: team.hex }}>
                {i + 1}
              </span>
              <CarSilhouette
                color={team.hex}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-[64%] h-auto transition-transform duration-300 group-hover:translate-x-[-8px] group-hover:scale-105 drop-shadow-[0_12px_18px_rgba(0,0,0,0.7)]"
              />
              <span className="absolute left-4 bottom-3 tv-label rounded bg-black/50 px-2 py-1">{difficulty(i + 1)}</span>
              <TeamLogo teamId={team.id} color={team.hex} label={team.shortName} className="absolute left-4 top-3 h-12 w-12" />
            </div>
            <div className="p-4 space-y-3">
              <div>
                <div className="font-display text-2xl" style={{ color: team.hex }}>
                  {team.name}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{team.drivers.map((d) => `${d.nationality} ${d.name}`).join("  ·  ")}</div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["Auto", team.pace],
                  ["Fiabilidad", team.reliability],
                  ["Pits", team.pitCrew],
                ].map(([l, v]) => (
                  <div key={l as string} className="rounded-lg bg-black/30 border border-white/5 px-2 py-1.5">
                    <div className="tv-label text-muted-foreground !text-[9px]">{l}</div>
                    <div className="font-display text-xl">{(v as number).toFixed(0)}</div>
                    <div className="h-1 rounded-full bg-white/5 mt-1 overflow-hidden">
                      <div className="h-full" style={{ width: `${Math.max(5, ((v as number) - 70) / 0.3)}%`, backgroundColor: team.hex }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Presupuesto inicial <b className="text-foreground">US$ {startBudget(team.budgetBase ?? team.pace)} M</b>
                </span>
                <span className="font-display text-sm px-3 py-1 clip-slant-both transition-colors" style={{ backgroundColor: team.hex, color: "#0b0d12" }}>
                  Dirigir
                </span>
              </div>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
