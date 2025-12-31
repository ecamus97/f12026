import { ScrollArea } from "@/components/ui/scroll-area";
import { Flag, Zap, Wrench, XCircle, Swords, TrendingUp, Minus } from "lucide-react";
import { RaceEvent } from "./types";

interface RaceEventHistoryProps {
  events: RaceEvent[];
}

const eventIcons: Record<RaceEvent["type"], React.ReactNode> = {
  advance: <TrendingUp className="w-3 h-3 text-green-400" />,
  stay: <Minus className="w-3 h-3 text-muted-foreground" />,
  battle_win: <Swords className="w-3 h-3 text-yellow-400" />,
  battle_lose: <Swords className="w-3 h-3 text-red-400" />,
  pit: <Wrench className="w-3 h-3 text-orange-400" />,
  dnf: <XCircle className="w-3 h-3 text-destructive" />,
  finish: <Flag className="w-3 h-3 text-primary" />,
};

const eventColors: Record<RaceEvent["type"], string> = {
  advance: "border-green-400/30 bg-green-400/5",
  stay: "border-border/20 bg-background/30",
  battle_win: "border-yellow-400/30 bg-yellow-400/5",
  battle_lose: "border-red-400/30 bg-red-400/5",
  pit: "border-orange-400/30 bg-orange-400/5",
  dnf: "border-destructive/30 bg-destructive/5",
  finish: "border-primary/30 bg-primary/5",
};

export function RaceEventHistory({ events }: RaceEventHistoryProps) {
  if (events.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        Los eventos aparecerán aquí...
      </div>
    );
  }

  return (
    <ScrollArea className="h-[200px]">
      <div className="space-y-1 p-2">
        {events
          .slice()
          .reverse()
          .map((event, idx) => (
            <div
              key={`${event.timestamp}-${idx}`}
              className={`flex items-center gap-2 p-2 rounded border text-xs ${eventColors[event.type]}`}
            >
              {eventIcons[event.type]}
              <span className="font-mono text-muted-foreground">V{event.lap}</span>
              <span className="font-bold">{event.driverShortName}</span>
              <span className="text-muted-foreground flex-1 truncate">{event.description}</span>
            </div>
          ))}
      </div>
    </ScrollArea>
  );
}
