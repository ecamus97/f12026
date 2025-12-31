import { motion } from "framer-motion";
import { DriverStanding, TeamStanding } from "@/hooks/useGameState";


interface DriverStandingsProps {
  standings: DriverStanding[];
  limit?: number;
}

export function DriverStandings({ standings, limit }: DriverStandingsProps) {
  const displayStandings = limit ? standings.slice(0, limit) : standings;

  return (
    <div className="space-y-2">
      {displayStandings.map((driver, index) => (
        <motion.div
          key={driver.driverId}
          className="flex items-center gap-3 p-2 rounded-lg bg-card/50 border border-border/30"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.05 }}
        >
          <div className={`
            w-7 h-7 rounded-full flex items-center justify-center font-racing font-bold text-xs
            ${index === 0 ? "bg-gradient-to-br from-yellow-400 to-yellow-600 text-background" : ""}
            ${index === 1 ? "bg-gradient-to-br from-gray-300 to-gray-500 text-background" : ""}
            ${index === 2 ? "bg-gradient-to-br from-amber-600 to-amber-800 text-foreground" : ""}
            ${index > 2 ? "bg-muted text-muted-foreground" : ""}
          `}>
            {index + 1}
          </div>

          <div className={`w-1 h-6 rounded-full ${driver.teamColor}`} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span>{driver.nationality}</span>
              <span className="font-racing text-sm text-foreground truncate">{driver.shortName}</span>
            </div>
          </div>


          <div className="text-right min-w-[50px]">
            <p className="font-racing text-sm text-primary">{driver.points}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

interface TeamStandingsProps {
  standings: TeamStanding[];
  limit?: number;
}

export function TeamStandings({ standings, limit }: TeamStandingsProps) {
  const displayStandings = limit ? standings.slice(0, limit) : standings;

  return (
    <div className="space-y-2">
      {displayStandings.map((team, index) => (
        <motion.div
          key={team.teamId}
          className="flex items-center gap-3 p-2 rounded-lg bg-card/50 border border-border/30"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.05 }}
        >
          <div className={`
            w-7 h-7 rounded-full flex items-center justify-center font-racing font-bold text-xs
            ${index === 0 ? "bg-gradient-to-br from-yellow-400 to-yellow-600 text-background" : ""}
            ${index === 1 ? "bg-gradient-to-br from-gray-300 to-gray-500 text-background" : ""}
            ${index === 2 ? "bg-gradient-to-br from-amber-600 to-amber-800 text-foreground" : ""}
            ${index > 2 ? "bg-muted text-muted-foreground" : ""}
          `}>
            {index + 1}
          </div>

          <div className={`w-1 h-6 rounded-full ${team.teamColor}`} />

          <div className="flex-1 min-w-0">
            <span className="font-racing text-sm text-foreground truncate">{team.teamName}</span>
          </div>


          <div className="text-right min-w-[50px]">
            <p className="font-racing text-sm text-primary">{team.points}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
