import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Flag, Timer, FastForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Race } from "@/data/f1Data";
import { formatLap, type Entry, type QualifyingResult } from "@/engine";
import { PositionBadge, TeamStripe, mineStyle } from "./common";
import { cn } from "@/lib/utils";

interface Props {
  race: Race;
  quali: QualifyingResult;
  revealed: number;
  entryMap: Map<string, Entry>;
  playerTeamId: string | null;
  onReveal: (all?: boolean) => void;
  onStartRace: () => void;
}

const NEXT_LABEL = ["Simular Q1", "Simular Q2", "Simular Q3"];

export function QualifyingView({ race, quali, revealed, entryMap, playerTeamId, onReveal, onStartRace }: Props) {
  const [tab, setTab] = useState<string>(revealed === 3 ? "grid" : `${Math.max(0, revealed - 1)}`);
  useEffect(() => {
    setTab(revealed === 3 ? "grid" : `${Math.max(0, revealed - 1)}`);
  }, [revealed]);

  const done = revealed >= 3;
  const pole = entryMap.get(quali.grid[0]);

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Clasificación</p>
        <h2 className="font-racing text-2xl text-gradient-primary">
          {race.flag} {race.name}
        </h2>
        <p className="text-xs text-muted-foreground">
          {race.circuit} · Q1 elimina 6 · Q2 elimina 6 · Q3 define la pole
        </p>
      </div>

      {revealed === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center space-y-4">
          <Timer className="w-10 h-10 mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">22 autos salen a pista. Los 6 más lentos quedan eliminados.</p>
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full grid grid-cols-4">
            {quali.sessions.map((s, i) => (
              <TabsTrigger key={s.name} value={`${i}`} disabled={i >= revealed} className="font-racing text-xs">
                {s.name}
              </TabsTrigger>
            ))}
            <TabsTrigger value="grid" disabled={!done} className="font-racing text-xs">
              Parrilla
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {revealed > 0 && tab !== "grid" && (
        <SessionTable
          key={tab}
          rows={quali.sessions[Number(tab)].rows}
          entryMap={entryMap}
          playerTeamId={playerTeamId}
        />
      )}

      {done && tab === "grid" && (
        <div className="space-y-3">
          {pole && (
            <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-center text-sm">
              🏆 Pole position: <span className="font-racing">{pole.driver.name}</span> ({pole.team.name})
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {quali.grid.map((id, i) => {
              const e = entryMap.get(id);
              if (!e) return null;
              const mine = e.team.id === playerTeamId;
              return (
                <motion.div
                  key={id}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm",
                    i % 2 === 1 && "mt-4",
                    "border-border/40 bg-card/50",
                  )}
                  style={mine ? mineStyle(e.team.hex) : undefined}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                >
                  <PositionBadge pos={i + 1} />
                  <TeamStripe color={e.team.hex} />
                  <span className="font-racing text-xs">{e.driver.shortName}</span>
                  <span className="text-[10px] text-muted-foreground truncate">{e.team.shortName}</span>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {!done ? (
          <>
            <Button onClick={() => onReveal(false)} className="flex-1 font-racing" size="lg">
              <Timer className="w-4 h-4 mr-2" />
              {NEXT_LABEL[revealed]}
            </Button>
            <Button onClick={() => onReveal(true)} variant="outline" size="lg" title="Simular toda la clasificación">
              <FastForward className="w-4 h-4" />
            </Button>
          </>
        ) : (
          <Button onClick={onStartRace} className="flex-1 font-racing" size="lg">
            <Flag className="w-4 h-4 mr-2" />
            Ir a la carrera
          </Button>
        )}
      </div>
    </div>
  );
}

function SessionTable({
  rows,
  entryMap,
  playerTeamId,
}: {
  rows: QualifyingResult["sessions"][number]["rows"];
  entryMap: Map<string, Entry>;
  playerTeamId: string | null;
}) {
  const best = rows[0]?.best ?? 0;
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {rows.map((r, i) => {
        const e = entryMap.get(r.driverId);
        if (!e) return null;
        const mine = e.team.id === playerTeamId;
        return (
          <motion.div
            key={r.driverId}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-sm border-b border-border/30 last:border-0",
              r.eliminated && "bg-destructive/10 text-muted-foreground",
            )}
            style={mine ? mineStyle(e.team.hex) : undefined}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.025 }}
          >
            <span className="w-6 font-racing text-xs">{i + 1}</span>
            <TeamStripe color={e.team.hex} />
            <span className="font-racing text-xs w-10">{e.driver.shortName}</span>
            <span className="text-xs text-muted-foreground flex-1 truncate">{e.driver.name}</span>
            {r.runs.some((x) => x === 0) && (
              <span
                className="text-[10px] text-orange-400"
                title={r.best ? "Cometió un error en uno de sus dos intentos; vale el tiempo del otro." : "Cometió errores en ambos intentos."}
              >
                {r.best ? "1 intento fallido" : "sin vuelta válida"}
              </span>
            )}
            <span className="font-mono text-xs w-20 text-right">{r.best ? formatLap(r.best) : "Sin tiempo"}</span>
            <span className="font-mono text-xs w-16 text-right text-muted-foreground">
              {i === 0 || !r.best ? "" : `+${(r.best - best).toFixed(3)}`}
            </span>
            <span className="text-[10px] uppercase text-destructive w-10 text-right">{r.eliminated ? "Fuera" : ""}</span>
          </motion.div>
        );
      })}
    </div>
  );
}
