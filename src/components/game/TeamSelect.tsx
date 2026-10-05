import { motion } from "framer-motion";
import type { Team } from "@/data/f1Data";
import { StatBar, TeamStripe } from "./common";
import { startBudget } from "@/engine";

export function TeamSelect({ teams, onChoose }: { teams: Team[]; onChoose: (teamId: string) => void }) {
  const sorted = [...teams].sort((a, b) => b.pace - a.pace);
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="font-racing text-3xl text-gradient-primary">Elige tu escudería</h2>
        <p className="text-muted-foreground text-sm max-w-lg mx-auto">
          Serás el director del equipo: decides la estrategia de neumáticos, cuándo entrar a pits y cuánto arriesgan tus pilotos.
          También manejas el presupuesto: proyectos de I+D e instalaciones para mejorar el auto durante la temporada. Los equipos de abajo son un desafío mayor.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sorted.map((team, i) => (
          <motion.button
            key={team.id}
            onClick={() => onChoose(team.id)}
            className="text-left rounded-xl border border-border bg-card p-4 space-y-3 hover:border-primary/60 transition-colors group"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
          >
            <div className="flex items-center gap-2">
              <TeamStripe color={team.hex} className="h-8 w-1.5" />
              <div className="flex-1">
                <div className="font-racing text-sm">{team.name}</div>
                <div className="text-xs text-muted-foreground">
                  {team.drivers.map((d) => `${d.nationality} ${d.name}`).join(" · ")}
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <StatBar label="Auto" value={team.pace} color={team.hex} />
              <StatBar label="Fiabilidad" value={team.reliability} color={team.hex} />
              <StatBar label="Pit crew" value={team.pitCrew} color={team.hex} />
            </div>
            <div className="text-xs text-muted-foreground">
              Presupuesto de desarrollo: <span className="text-foreground font-medium">US$ {startBudget(team.pace)} M</span>
            </div>
            <div className="w-full rounded-md bg-secondary py-2 text-center font-racing text-xs transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              Dirigir {team.shortName}
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
