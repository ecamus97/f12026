import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Handshake, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { talkLocked, type Talk, type TalkResult } from "@/engine";
import { cn } from "@/lib/utils";

export interface NegotiationAnswer {
  ok: boolean;
  message: string;
  result: TalkResult;
  counter?: number;
}

const RESULT_STYLE: Record<TalkResult, string> = {
  accept: "border-emerald-500/50 bg-emerald-500/10 text-emerald-200",
  counter: "border-amber-500/50 bg-amber-500/10 text-amber-100",
  reject: "border-red-500/50 bg-red-500/10 text-red-200",
  walkout: "border-red-600/70 bg-red-600/15 text-red-200",
  locked: "border-white/15 bg-white/5 text-muted-foreground",
};

/**
 * A negotiation: estimated salary, your offer (more or less), contract length, and the
 * other side's answers. Bad offers burn patience; when it runs out they stop talking for a while.
 */
export function NegotiationDialog({
  open, onClose, title, subtitle, avatar, ask, minYears = 1, maxYears = 3, defaultYears = 2, talk, season, round, onOffer, costNote, cap,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: ReactNode;
  avatar?: ReactNode;
  ask: number; // estimated salary (M USD / year)
  minYears?: number;
  maxYears?: number;
  defaultYears?: number;
  talk: Talk;
  season: number;
  round: number; // next round (for locks)
  onOffer: (salary: number, years: number) => NegotiationAnswer;
  costNote?: (salary: number) => string | null;
  cap?: number | null; // salary cap
}) {
  const [salary, setSalary] = useState(ask);
  const [years, setYears] = useState(defaultYears);
  const [last, setLast] = useState<NegotiationAnswer | null>(null);
  useEffect(() => {
    if (open) {
      setSalary(+Math.max(0.3, ask * 0.9).toFixed(1));
      setYears(Math.min(maxYears, Math.max(minYears, defaultYears)));
      setLast(null);
    }
  }, [open, ask, defaultYears, maxYears, minYears]);

  const locked = talkLocked(talk, season, round);
  const done = last?.result === "accept";
  const min = +(ask * 0.5).toFixed(1);
  const max = +Math.min(cap ?? Infinity, ask * 1.6).toFixed(1);
  const pct = Math.round((salary / ask) * 100);
  const mood = locked ? 0 : talk.patience / talk.maxPatience;

  const send = (value = salary) => {
    const r = onOffer(+value.toFixed(1), years);
    setLast(r);
    if (r.counter) setSalary(r.counter);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl bg-[hsl(222_22%_8%)] border-white/10 max-h-[92vh] overflow-y-auto">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {avatar}
            <div className="min-w-0">
              <div className="tv-label text-primary flex items-center gap-1">
                <Handshake className="w-3 h-3" /> Negociación
              </div>
              <DialogTitle className="font-display text-2xl md:text-3xl leading-tight">{title}</DialogTitle>
              <div className="text-xs text-muted-foreground">{subtitle}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="tv-label text-muted-foreground">Sueldo estimado</div>
              <div className="font-display text-2xl">US$ {ask.toFixed(1)} M</div>
              <div className="text-[10px] text-muted-foreground">por año · referencia del mercado</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="tv-label text-muted-foreground">Paciencia</div>
              <div className="flex gap-1 mt-2">
                {Array.from({ length: talk.maxPatience }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-2.5 flex-1 rounded-sm",
                      i < (locked ? 0 : talk.patience) ? (mood > 0.6 ? "bg-emerald-500" : mood > 0.34 ? "bg-amber-400" : "bg-red-500") : "bg-white/10",
                    )}
                  />
                ))}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                {locked ? "No quiere hablar" : mood > 0.6 ? "Dispuesto a negociar" : mood > 0.34 ? "Empieza a impacientarse" : "A punto de cortar la negociación"}
              </div>
            </div>
          </div>

          {/* history */}
          {talk.log.length > 0 && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
              {talk.log.map((e, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-end">
                    <span className="text-xs rounded-lg bg-primary/20 border border-primary/40 px-2.5 py-1">
                      Tu oferta: US$ {e.salary.toFixed(1)} M × {e.years} año{e.years > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className={cn("text-xs rounded-lg border px-2.5 py-1.5 w-fit max-w-[90%]", RESULT_STYLE[e.result])}>{e.msg}</div>
                </div>
              ))}
            </div>
          )}

          <AnimatePresence mode="wait">
            {last && (
              <motion.div
                key={last.message}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn("rounded-xl border p-3 text-sm font-medium", RESULT_STYLE[last.result])}
              >
                {last.message}
              </motion.div>
            )}
          </AnimatePresence>

          {locked && !done ? (
            <div className="rounded-xl border border-white/10 bg-black/30 p-4 flex items-center gap-3 text-sm text-muted-foreground">
              <Lock className="w-5 h-5" /> Las negociaciones están cortadas hasta la ronda {talk.lockedUntil!.round}.
            </div>
          ) : done ? (
            <Button className="w-full font-display" onClick={onClose}>
              Cerrar
            </Button>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="flex items-end justify-between">
                  <span className="tv-label text-muted-foreground">Tu oferta por año</span>
                  <span className={cn("text-xs", pct < 85 ? "text-red-300" : pct < 100 ? "text-amber-200" : "text-emerald-300")}>{pct}% del estimado</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <button className="h-9 w-9 rounded-md border border-white/10 hover:bg-white/5" onClick={() => setSalary((v) => Math.max(min, +(v - 0.1).toFixed(1)))}>
                    −
                  </button>
                  <div className="flex-1 text-center font-display text-4xl tabular-nums">US$ {salary.toFixed(1)} M</div>
                  <button className="h-9 w-9 rounded-md border border-white/10 hover:bg-white/5" onClick={() => setSalary((v) => Math.min(max, +(v + 0.1).toFixed(1)))}>
                    +
                  </button>
                </div>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={0.1}
                  value={salary}
                  onChange={(e) => setSalary(Number(e.target.value))}
                  className="w-full accent-[hsl(var(--primary))] mt-2"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>US$ {min.toFixed(1)} M</span>
                  <span>US$ {max.toFixed(1)} M{cap ? " (tope)" : ""}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="tv-label text-muted-foreground mr-1">Duración</span>
                {Array.from({ length: maxYears - minYears + 1 }, (_, i) => i + minYears).map((y) => (
                  <button
                    key={y}
                    onClick={() => setYears(y)}
                    className={cn("rounded-md border px-3 py-1.5 text-xs", years === y ? "border-primary bg-primary text-primary-foreground" : "border-white/10 hover:bg-white/5")}
                  >
                    {y} año{y > 1 ? "s" : ""}
                  </button>
                ))}
              </div>
              {costNote?.(salary) && <div className="text-[11px] text-muted-foreground">{costNote(salary)}</div>}
              <div className="flex flex-wrap gap-2">
                <Button className="flex-1 font-display" onClick={() => send()}>
                  Enviar oferta
                </Button>
                {talk.lastCounter !== null && (
                  <Button variant="secondary" className="font-display" onClick={() => send(talk.lastCounter!)}>
                    Aceptar su pedido · US$ {talk.lastCounter.toFixed(1)} M
                  </Button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Cada persona tiene un mínimo que no conoces (nunca más alto que el estimado) y prefiere ciertas duraciones: los veteranos contratos cortos,
                los jóvenes más largos. Las ofertas bajas gastan su paciencia; las muy bajas, el doble.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
