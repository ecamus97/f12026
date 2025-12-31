import { motion } from "framer-motion";
import { Driver } from "@/data/f1Data";

interface DriverCardProps {
  driver: Driver & { teamColor: string; teamName: string; carLevel: number };
  position?: number;
  points?: number;
  isActive?: boolean;
  showStats?: boolean;
  onClick?: () => void;
}

export function DriverCard({ 
  driver, 
  position, 
  points, 
  isActive = false, 
  showStats = false,
  onClick 
}: DriverCardProps) {
  return (
    <motion.div
      className={`
        relative bg-gradient-card rounded-lg p-3 border
        ${isActive ? "border-primary glow-primary" : "border-border/50"}
        ${onClick ? "cursor-pointer hover:border-primary/50 transition-colors" : ""}
      `}
      whileHover={onClick ? { scale: 1.02 } : {}}
      onClick={onClick}
      layout
    >
      <div className="flex items-center gap-3">
        {position !== undefined && (
          <div className={`
            w-8 h-8 rounded-full flex items-center justify-center font-racing font-bold text-sm
            ${position === 1 ? "bg-gradient-to-br from-yellow-400 to-yellow-600 text-background" : ""}
            ${position === 2 ? "bg-gradient-to-br from-gray-300 to-gray-500 text-background" : ""}
            ${position === 3 ? "bg-gradient-to-br from-amber-600 to-amber-800 text-foreground" : ""}
            ${position > 3 ? "bg-muted text-muted-foreground" : ""}
          `}>
            {position}
          </div>
        )}
        
        <div className={`w-1 h-10 rounded-full ${driver.teamColor}`} />
        
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">{driver.nationality}</span>
            <span className="font-racing font-semibold text-foreground">{driver.shortName}</span>
          </div>
          <p className="text-xs text-muted-foreground truncate">{driver.name}</p>
        </div>

        {points !== undefined && (
          <div className="text-right">
            <p className="font-racing text-lg text-primary">{points}</p>
            <p className="text-xs text-muted-foreground">pts</p>
          </div>
        )}
      </div>

      {showStats && (
        <div className="mt-3 pt-3 border-t border-border/30 grid grid-cols-3 gap-2">
          <StatBadge label="OVT" value={driver.overtaking} />
          <StatBadge label="DEF" value={driver.maintainingPosition} />
          <StatBadge label="SAF" value={driver.avoidingCollision} />
        </div>
      )}
    </motion.div>
  );
}

function StatBadge({ label, value }: { label: string; value: number }) {
  const getColor = (v: number) => {
    if (v >= 5) return "text-green-400";
    if (v >= 4) return "text-yellow-400";
    if (v >= 3) return "text-orange-400";
    return "text-red-400";
  };

  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-racing font-bold ${getColor(value)}`}>{value}</p>
    </div>
  );
}
