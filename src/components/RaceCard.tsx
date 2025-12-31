import { motion } from "framer-motion";
import { MapPin, Calendar, CheckCircle, Circle, PlayCircle } from "lucide-react";
import { Race } from "@/data/f1Data";

interface RaceCardProps {
  race: Race;
  status: "completed" | "current" | "upcoming";
  winner?: string;
  onClick?: () => void;
}

export function RaceCard({ race, status, winner, onClick }: RaceCardProps) {
  return (
    <motion.div
      className={`
        relative rounded-lg p-4 border transition-all
        ${status === "current" ? "bg-gradient-card border-primary glow-primary" : ""}
        ${status === "completed" ? "bg-card/50 border-border/30" : ""}
        ${status === "upcoming" ? "bg-card/30 border-border/20 opacity-60" : ""}
        ${onClick && status === "current" ? "cursor-pointer hover:border-primary" : ""}
      `}
      whileHover={onClick && status === "current" ? { scale: 1.02 } : {}}
      onClick={onClick && status === "current" ? onClick : undefined}
      layout
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{race.flag}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-racing text-xs text-muted-foreground">R{race.id}</span>
              <h3 className="font-racing font-semibold text-foreground text-sm">{race.name}</h3>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {race.circuit}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {race.date}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status === "completed" && (
            <CheckCircle className="w-5 h-5 text-green-400" />
          )}
          {status === "current" && (
            <PlayCircle className="w-5 h-5 text-primary animate-pulse" />
          )}
          {status === "upcoming" && (
            <Circle className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      </div>

      {winner && status === "completed" && (
        <div className="mt-3 pt-3 border-t border-border/30">
          <p className="text-xs text-muted-foreground">
            Winner: <span className="text-primary font-semibold">{winner}</span>
          </p>
        </div>
      )}
    </motion.div>
  );
}
