import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { races2026 } from "@/data/f1Data";
import type { DriverStanding, StoredRaceResult, TeamStanding } from "@/engine";
import { TeamStripe, mineStyle } from "@/components/game/common";
import { cn } from "@/lib/utils";

function cellClass(pos: number | "DNF" | undefined) {
  if (pos === undefined) return "text-muted-foreground/40";
  if (pos === "DNF") return "bg-muted/30 text-muted-foreground";
  if (pos === 1) return "bg-yellow-400 text-yellow-950 font-bold";
  if (pos === 2) return "bg-gray-300 text-gray-900 font-bold";
  if (pos === 3) return "bg-amber-600 text-white font-bold";
  if (pos <= 10) return "bg-green-500/20 text-green-300";
  return "bg-muted/20 text-muted-foreground";
}

function useRaceColumns(results: StoredRaceResult[]) {
  const done = races2026.filter((r) => results.some((x) => x.raceId === r.id));
  const byRace = new Map(results.map((r) => [r.raceId, r]));
  const posOf = (driverId: string, raceId: number): number | "DNF" | undefined => {
    const row = byRace.get(raceId)?.rows.find((x) => x.driverId === driverId);
    if (!row) return undefined;
    return row.status === "dnf" ? "DNF" : row.position;
  };
  return { done, posOf };
}

interface DriverProps {
  standings: DriverStanding[];
  results: StoredRaceResult[];
  playerTeamId?: string | null;
  compact?: boolean;
}

export function DriverChampionshipTable({ standings, results, playerTeamId, compact }: DriverProps) {
  const { done, posOf } = useRaceColumns(results);
  const leader = standings[0]?.points ?? 0;
  return (
    <div className="rounded-lg border border-border/40 overflow-hidden">
      <ScrollArea className="w-full">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-2 py-2 text-left sticky left-0 bg-muted z-10">Pos</th>
              <th className="px-2 py-2 text-left sticky left-9 bg-muted z-10 min-w-[150px]">Piloto</th>
              {!compact && done.map((r) => (
                <th key={r.id} className="px-1 py-2 text-center text-base font-normal" title={r.name}>{r.flag}</th>
              ))}
              {!compact && <th className="px-2 py-2 text-center">V</th>}
              {!compact && <th className="px-2 py-2 text-center">Pod</th>}
              <th className="px-3 py-2 text-right">Pts</th>
              {!compact && <th className="px-2 py-2 text-right">Dif</th>}
            </tr>
          </thead>
          <tbody>
            {standings.map((d, i) => {
              const mine = d.teamId === playerTeamId;
              return (
                <tr key={d.driverId} className="border-t border-border/20" style={mine ? mineStyle(d.teamColor) : undefined}>
                  <td className="px-2 py-1.5 font-racing text-xs sticky left-0 bg-background z-10">{i + 1}</td>
                  <td className="px-2 py-1.5 sticky left-9 bg-background z-10">
                    <div className="flex items-center gap-2">
                      <TeamStripe color={d.teamColor} />
                      <span>{d.nationality}</span>
                      <span className="font-racing text-xs">{d.shortName}</span>
                      <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">{d.driverName}</span>
                    </div>
                  </td>
                  {!compact && done.map((r) => {
                    const p = posOf(d.driverId, r.id);
                    return (
                      <td key={r.id} className="px-0.5 py-1 text-center">
                        <div className={cn("w-7 h-6 mx-auto rounded flex items-center justify-center text-[11px]", cellClass(p))}>
                          {p === "DNF" ? "Ret" : p ?? "·"}
                        </div>
                      </td>
                    );
                  })}
                  {!compact && <td className="px-2 text-center text-xs">{d.wins || ""}</td>}
                  {!compact && <td className="px-2 text-center text-xs">{d.podiums || ""}</td>}
                  <td className="px-3 py-1.5 text-right font-racing text-primary font-bold">{d.points}</td>
                  {!compact && <td className="px-2 text-right text-xs text-muted-foreground">{i === 0 ? "" : `-${leader - d.points}`}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

interface TeamProps {
  standings: TeamStanding[];
  results: StoredRaceResult[];
  playerTeamId?: string | null;
  compact?: boolean;
}

export function TeamChampionshipTable({ standings, results, playerTeamId, compact }: TeamProps) {
  const { done } = useRaceColumns(results);
  const teamPointsInRace = (teamId: string, raceId: number) =>
    results.find((r) => r.raceId === raceId)?.rows.filter((x) => x.teamId === teamId).reduce((a, x) => a + x.points, 0) ?? 0;
  return (
    <div className="rounded-lg border border-border/40 overflow-hidden">
      <ScrollArea className="w-full">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-2 py-2 text-left sticky left-0 bg-muted z-10">Pos</th>
              <th className="px-2 py-2 text-left sticky left-9 bg-muted z-10 min-w-[160px]">Constructor</th>
              {!compact && done.map((r) => (
                <th key={r.id} className="px-1 py-2 text-center text-base font-normal" title={r.name}>{r.flag}</th>
              ))}
              {!compact && <th className="px-2 py-2 text-center">V</th>}
              <th className="px-3 py-2 text-right">Pts</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((t, i) => (
              <tr key={t.teamId} className="border-t border-border/20" style={t.teamId === playerTeamId ? mineStyle(t.teamColor) : undefined}>
                <td className="px-2 py-1.5 font-racing text-xs sticky left-0 bg-background z-10">{i + 1}</td>
                <td className="px-2 py-1.5 sticky left-9 bg-background z-10">
                  <div className="flex items-center gap-2">
                    <TeamStripe color={t.teamColor} />
                    <span className="text-xs font-medium truncate">{t.teamName}</span>
                  </div>
                </td>
                {!compact && done.map((r) => {
                  const pts = teamPointsInRace(t.teamId, r.id);
                  return (
                    <td key={r.id} className="px-1 py-1 text-center text-[11px] text-muted-foreground">
                      {pts || "·"}
                    </td>
                  );
                })}
                {!compact && <td className="px-2 text-center text-xs">{t.wins || ""}</td>}
                <td className="px-3 py-1.5 text-right font-racing text-primary font-bold">{t.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
