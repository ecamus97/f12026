import { motion } from "framer-motion";
import { Trophy, Flag, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Race } from "@/data/f1Data";
import { classify, formatLap, type RaceState } from "@/engine";
import { PositionBadge, TeamStripe, mineStyle } from "./common";
import { cn } from "@/lib/utils";

interface Props {
  race: Race;
  state: RaceState;
  playerTeamId: string | null;
  onConfirm: () => void;
}

export function RaceResults({ race, state, playerTeamId, onConfirm }: Props) {
  const rows = classify(state);
  const carMap = new Map(state.cars.map((c) => [c.id, c]));
  const podium = rows.slice(0, 3).map((r) => carMap.get(r.driverId)!);
  const fastest = state.fastest ? carMap.get(state.fastest.driverId) : null;
  const myPoints = rows.filter((r) => carMap.get(r.driverId)?.entry.team.id === playerTeamId).reduce((a, r) => a + r.points, 0);

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="text-center space-y-1">
        <Trophy className="w-12 h-12 mx-auto text-yellow-400" />
        <h2 className="font-display text-4xl md:text-5xl">🏁 Bandera a cuadros</h2>
        <p className="text-muted-foreground text-sm">
          {race.flag} {race.name}
        </p>
      </div>

      {/* Podium */}
      <div className="grid grid-cols-3 gap-2 items-end max-w-md mx-auto">
        {[1, 0, 2].map((idx) => {
          const c = podium[idx];
          if (!c) return <div key={idx} />;
          const h = idx === 0 ? "h-28" : idx === 1 ? "h-20" : "h-16";
          return (
            <motion.div
              key={c.id}
              className="text-center space-y-1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + idx * 0.15 }}
            >
              <div className="font-racing text-sm">{c.entry.driver.shortName}</div>
              <div className="text-[10px] text-muted-foreground truncate">{c.entry.team.name}</div>
              <div className={cn("rounded-t-md flex items-start justify-center pt-2 font-racing text-xl", h)} style={{ backgroundColor: c.entry.team.hex }}>
                <span className="text-black/80">{idx + 1}</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="flex flex-wrap justify-center gap-3 text-xs">
        {fastest && (
          <span className="flex items-center gap-1 rounded-full bg-purple-600/20 border border-purple-500/40 px-3 py-1">
            <Timer className="w-3 h-3" /> Vuelta rápida: {fastest.entry.driver.shortName} {formatLap(state.fastest!.time)}
          </span>
        )}
        {playerTeamId && (
          <span className="rounded-full bg-primary/15 border border-primary/40 px-3 py-1">Tu equipo suma {myPoints} pts</span>
        )}
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/30">
          <span className="w-7">Pos</span>
          <span className="flex-1 pl-3">Piloto</span>
          <span className="w-12 text-center hidden sm:block">Salida</span>
          <span className="w-10 text-center">Pits</span>
          <span className="w-24 text-right">Tiempo</span>
          <span className="w-10 text-right">Pts</span>
        </div>
        {rows.map((r, i) => {
          const c = carMap.get(r.driverId)!;
          const mine = c.entry.team.id === playerTeamId;
          const delta = r.grid - r.position;
          return (
            <motion.div
              key={r.driverId}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-sm border-b border-border/30 last:border-0",
                r.status === "dnf" && "text-muted-foreground",
              )}
              style={mine ? mineStyle(c.entry.team.hex) : undefined}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.02 }}
            >
              {r.status === "dnf" ? <span className="w-7 text-center text-xs text-destructive font-racing">RET</span> : <PositionBadge pos={r.position} />}
              <TeamStripe color={c.entry.team.hex} />
              <span className="flex-1 min-w-0 truncate">
                <span className="font-racing text-xs mr-2">{c.entry.driver.shortName}</span>
                <span className="text-xs text-muted-foreground">{c.entry.driver.name}</span>
              </span>
              <span className="w-12 text-center text-xs hidden sm:block">
                {r.grid}
                {r.status === "finished" && delta !== 0 && (
                  <span className={cn("ml-1", delta > 0 ? "text-green-400" : "text-red-400")}>
                    {delta > 0 ? `▲${delta}` : `▼${-delta}`}
                  </span>
                )}
              </span>
              <span className="w-10 text-center text-xs">{r.stops}</span>
              <span className="w-24 text-right font-mono text-xs truncate" title={r.dnfReason}>
                {r.gap}
                {r.penaltySecs ? <span className="block text-[10px] text-amber-300">incl. {r.penaltySecs}s pen.</span> : null}
              </span>
              <span className="w-10 text-right font-racing text-xs text-primary">{r.points || ""}</span>
            </motion.div>
          );
        })}
      </div>

      <Button onClick={onConfirm} className="w-full font-racing" size="lg">
        <Flag className="w-4 h-4 mr-2" />
        Confirmar resultado
      </Button>
    </motion.div>
  );
}
