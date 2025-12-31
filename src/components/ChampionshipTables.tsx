import { motion } from "framer-motion";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

import { DriverStanding, TeamStanding, RaceResult } from "@/hooks/useGameState";
import { races2026, teams } from "@/data/f1Data";

interface DriverChampionshipTableProps {
  standings: DriverStanding[];
  raceResults: RaceResult[];
}

function getPositionColor(pos: number | string | undefined): string {
  if (pos === undefined || pos === null || pos === "DNF" || pos === 99) return "bg-muted/30 text-muted-foreground";
  const position = typeof pos === "string" ? parseInt(pos) : pos;
  if (position === 1) return "bg-yellow-400 text-yellow-900 font-bold";
  if (position === 2) return "bg-gray-300 text-gray-800 font-bold";
  if (position === 3) return "bg-amber-600 text-white font-bold";
  if (position <= 5) return "bg-green-500/30 text-green-400";
  if (position <= 10) return "bg-primary/20 text-primary";
  return "bg-muted/20 text-muted-foreground";
}

export function DriverChampionshipTable({ standings, raceResults }: DriverChampionshipTableProps) {
  const completedRaces = races2026.filter(race =>
    raceResults.some(r => r.raceId === race.id)
  );

  // Get driver result for a specific race
  const getDriverResult = (driverId: string, raceId: number) => {
    const result = raceResults.find(r => r.raceId === raceId);
    if (!result) return undefined;
    const pos = result.positions.find(p => p.driverId === driverId);
    if (!pos) return undefined;
    if (pos.retired) return "DNF";
    return pos.position;
  };

  // Find team color for driver
  const getDriverTeamColor = (driverId: string): string => {
    for (const team of teams) {
      if (team.drivers.some(d => d.id === driverId)) {
        return team.color;
      }
    }
    return "bg-muted";
  };

  return (
    <div className="rounded-lg border border-border/30 overflow-hidden">
      <ScrollArea className="w-full">
        <div className="min-w-max">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-2 py-2 text-left font-racing text-xs sticky left-0 bg-muted/50 z-10">Pos</th>
                <th className="px-2 py-2 text-left font-racing text-xs sticky left-8 bg-muted/50 z-10">N°</th>
                <th className="px-2 py-2 text-left font-racing text-xs sticky left-16 bg-muted/50 z-10 min-w-[120px]">Piloto</th>
                {completedRaces.map(race => (
                  <th key={race.id} className="px-1 py-2 text-center font-racing text-xs min-w-[40px]">
                    <div className="flex flex-col items-center">
                      <span className="text-lg">{race.flag}</span>
                    </div>
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-racing text-xs">Pts</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((driver, index) => {
                const teamColor = getDriverTeamColor(driver.driverId);
                return (
                  <motion.tr
                    key={driver.driverId}
                    className="border-t border-border/20 hover:bg-card/50 transition-colors"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                  >
                    <td className="px-2 py-2 font-racing sticky left-0 bg-background z-10">{index + 1}</td>
                    <td className="px-2 py-2 sticky left-8 bg-background z-10">
                      <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${teamColor} text-white`}>
                        {driver.shortName.charAt(0)}
                      </div>
                    </td>
                    <td className="px-2 py-2 sticky left-16 bg-background z-10">
                      <div className="flex items-center gap-1">
                        <div className={`w-1 h-5 rounded ${teamColor}`} />
                        <span className="mr-1">{driver.nationality}</span>
                        <span className="font-medium truncate">{driver.shortName}</span>
                      </div>
                    </td>
                    {completedRaces.map(race => {
                      const result = getDriverResult(driver.driverId, race.id);
                      return (
                        <td key={race.id} className="px-1 py-1 text-center">
                          <div className={`w-8 h-7 mx-auto rounded flex items-center justify-center text-xs ${getPositionColor(result)}`}>
                            {result === "DNF" ? "Ret" : result ?? "-"}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right">
                      <span className="font-racing text-primary font-bold">{driver.points}</span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

interface TeamChampionshipTableProps {
  standings: TeamStanding[];
  raceResults: RaceResult[];
}

export function TeamChampionshipTable({ standings, raceResults }: TeamChampionshipTableProps) {
  const completedRaces = races2026.filter(race =>
    raceResults.some(r => r.raceId === race.id)
  );

  // Get all driver results for a team in a specific race
  const getTeamResults = (teamId: string, raceId: number) => {
    const result = raceResults.find(r => r.raceId === raceId);
    if (!result) return [];
    return result.positions.filter(p => p.teamId === teamId).sort((a, b) => {
      if (a.retired && !b.retired) return 1;
      if (!a.retired && b.retired) return -1;
      return a.position - b.position;
    });
  };

  // Get team drivers from teams data
  const getTeamDrivers = (teamId: string) => {
    const team = teams.find(t => t.id === teamId);
    return team?.drivers || [];
  };

  return (
    <div className="rounded-lg border border-border/30 overflow-hidden">
      <ScrollArea className="w-full">
        <div className="min-w-max">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-2 py-2 text-left font-racing text-xs sticky left-0 bg-muted/50 z-10">Pos</th>
                <th className="px-2 py-2 text-left font-racing text-xs sticky left-8 bg-muted/50 z-10 min-w-[140px]">Constructor</th>
                <th className="px-2 py-2 text-left font-racing text-xs sticky left-36 bg-muted/50 z-10">N°</th>
                {completedRaces.map(race => (
                  <th key={race.id} className="px-1 py-2 text-center font-racing text-xs min-w-[40px]">
                    <div className="flex flex-col items-center">
                      <span className="text-lg">{race.flag}</span>
                    </div>
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-racing text-xs">Pts</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((team, index) => {
                const teamDrivers = getTeamDrivers(team.teamId);
                
                return teamDrivers.map((driver, driverIndex) => {
                  const isFirstDriver = driverIndex === 0;
                  
                  return (
                    <motion.tr
                      key={`${team.teamId}-${driver.id}`}
                      className={`border-t border-border/20 hover:bg-card/50 transition-colors ${!isFirstDriver ? "border-t-0" : ""}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: (index * 2 + driverIndex) * 0.02 }}
                    >
                      {isFirstDriver && (
                        <>
                          <td className="px-2 py-2 font-racing sticky left-0 bg-background z-10" rowSpan={teamDrivers.length}>
                            {index + 1}
                          </td>
                          <td className="px-2 py-2 sticky left-8 bg-background z-10" rowSpan={teamDrivers.length}>
                            <div className="flex items-center gap-2">
                              <div className={`w-1 h-8 rounded ${team.teamColor}`} />
                              <span className="font-medium truncate text-xs">{team.teamName.replace(" F1 Team", "").replace(" Racing", "")}</span>
                            </div>
                          </td>
                        </>
                      )}
                      <td className={`px-2 py-2 ${isFirstDriver ? "sticky left-36 bg-background z-10" : "sticky left-36 bg-background z-10"}`}>
                        <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${team.teamColor} text-white`}>
                          {driver.shortName.charAt(0)}
                        </div>
                      </td>
                      {completedRaces.map(race => {
                        const teamResults = getTeamResults(team.teamId, race.id);
                        const driverResult = teamResults.find(r => r.driverId === driver.id);
                        const pos = driverResult?.retired ? "DNF" : driverResult?.position;
                        
                        return (
                          <td key={race.id} className="px-1 py-1 text-center">
                            <div className={`w-8 h-6 mx-auto rounded flex items-center justify-center text-xs ${getPositionColor(pos)}`}>
                              {pos === "DNF" ? "Ret" : pos ?? "-"}
                            </div>
                          </td>
                        );
                      })}
                      {isFirstDriver && (
                        <td className="px-3 py-2 text-right" rowSpan={teamDrivers.length}>
                          <span className="font-racing text-primary font-bold">{team.points}</span>
                        </td>
                      )}
                    </motion.tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
