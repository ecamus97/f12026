import { useMemo } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { Team } from "@/data/f1Data";
import { DRIVER_HISTORY, TEAM_HISTORY } from "@/data/history";
import { STAFF_ROLES, STAFF_ROLE_INFO } from "@/data/peopleData";
import { ageOf, computeStandings, teamStaff, whereIs, reserveDevBonus, type ManagementState, type PeopleState, type StoredRaceResult } from "@/engine";
import { TeamLogo } from "./visuals";
import { cn } from "@/lib/utils";

export interface SeasonData {
  season: number;
  teams: Team[];
  results: StoredRaceResult[];
  finished: boolean; // titles only count for completed seasons
}

export type ProfileTarget = { kind: "driver"; id: string } | { kind: "team"; id: string } | null;

interface Line {
  season: number;
  teamId: string;
  pos: number;
  points: number;
  starts: number;
  wins: number;
  podiums: number;
  poles: number;
  dnfs: number;
  best: number | null;
  champion: boolean;
}

function driverLines(id: string, seasons: SeasonData[]): Line[] {
  const out: Line[] = [];
  for (const s of seasons) {
    const rows = s.results.flatMap((r) => r.rows.filter((x) => x.driverId === id).map((x) => ({ ...x, pole: r.pole === id })));
    if (!rows.length) continue;
    const st = computeStandings(s.teams, s.results);
    const pos = st.drivers.findIndex((d) => d.driverId === id) + 1;
    const fin = rows.filter((x) => x.status === "finished");
    const teamCount = new Map<string, number>();
    rows.forEach((x) => teamCount.set(x.teamId, (teamCount.get(x.teamId) ?? 0) + 1));
    out.push({
      season: s.season,
      teamId: [...teamCount.entries()].sort((a, b) => b[1] - a[1])[0][0],
      pos,
      points: st.drivers[pos - 1]?.points ?? 0,
      starts: rows.length,
      wins: fin.filter((x) => x.position === 1).length,
      podiums: fin.filter((x) => x.position <= 3).length,
      poles: rows.filter((x) => x.pole).length,
      dnfs: rows.length - fin.length,
      best: fin.length ? Math.min(...fin.map((x) => x.position)) : null,
      champion: s.finished && pos === 1,
    });
  }
  return out;
}

function teamLines(id: string, seasons: SeasonData[]): Line[] {
  const out: Line[] = [];
  for (const s of seasons) {
    if (!s.results.length) continue;
    const st = computeStandings(s.teams, s.results);
    const pos = st.teams.findIndex((t) => t.teamId === id) + 1;
    if (!pos) continue;
    const rows = s.results.flatMap((r) => r.rows.filter((x) => x.teamId === id).map((x) => ({ ...x, pole: r.pole === x.driverId })));
    const fin = rows.filter((x) => x.status === "finished");
    out.push({
      season: s.season,
      teamId: id,
      pos,
      points: st.teams[pos - 1]?.points ?? 0,
      starts: s.results.length,
      wins: fin.filter((x) => x.position === 1).length,
      podiums: fin.filter((x) => x.position <= 3).length,
      poles: rows.filter((x) => x.pole).length,
      dnfs: rows.length - fin.length,
      best: fin.length ? Math.min(...fin.map((x) => x.position)) : null,
      champion: s.finished && pos === 1,
    });
  }
  return out;
}

const sum = (ls: Line[], k: "wins" | "podiums" | "poles" | "starts" | "points" | "dnfs") => ls.reduce((a, l) => a + l[k], 0);

function Tile({ label, value, sub, gold }: { label: string; value: string | number; sub?: string; gold?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-3", gold ? "border-yellow-400/50 bg-yellow-400/10" : "border-white/10 bg-black/30")}>
      <div className="tv-label text-muted-foreground">{label}</div>
      <div className={cn("font-display text-2xl leading-tight", gold && "text-yellow-300")}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Bar({ label, value, max = 100, min = 60, color }: { label: string; value: number; max?: number; min?: number; color: string }) {
  const pct = Math.max(4, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-10 text-right tabular-nums font-semibold">{value.toFixed(1)}</span>
    </div>
  );
}

function SeasonTable({ lines, teams, showTeam }: { lines: Line[]; teams: Team[]; showTeam?: boolean }) {
  if (!lines.length) return <div className="text-sm text-muted-foreground">Todavía no hay carreras disputadas en el juego.</div>;
  const teamOf = (id: string) => teams.find((t) => t.id === id);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[460px]">
        <thead>
          <tr className="tv-label text-muted-foreground text-left">
            <th className="py-1 pr-2">Año</th>
            {showTeam && <th className="py-1 pr-2">Equipo</th>}
            <th className="py-1 pr-2 text-center">Pos</th>
            <th className="py-1 pr-2 text-right">Pts</th>
            <th className="py-1 pr-2 text-right">Carreras</th>
            <th className="py-1 pr-2 text-right">Vict.</th>
            <th className="py-1 pr-2 text-right">Podios</th>
            <th className="py-1 pr-2 text-right">Poles</th>
            <th className="py-1 text-right">Abandonos</th>
          </tr>
        </thead>
        <tbody>
          {[...lines].reverse().map((l) => (
            <tr key={l.season} className="border-t border-white/5">
              <td className="py-1.5 pr-2 font-racing">{l.season}</td>
              {showTeam && (
                <td className="py-1.5 pr-2 whitespace-nowrap">
                  <span className="inline-block h-3 w-1 rounded-full mr-1.5 align-middle" style={{ backgroundColor: teamOf(l.teamId)?.hex }} />
                  {teamOf(l.teamId)?.name ?? l.teamId}
                </td>
              )}
              <td className="py-1.5 pr-2 text-center">{l.champion ? "🏆" : `P${l.pos}`}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{l.points}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{l.starts}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{l.wins}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{l.podiums}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{l.poles}</td>
              <td className="py-1.5 text-right tabular-nums">{l.dnfs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Driver or team card: ratings now and results over the years. */
export function ProfileDialog({
  target, onClose, seasons, people, management, teams, season, onOpen,
}: {
  target: ProfileTarget;
  onClose: () => void;
  seasons: SeasonData[];
  people: PeopleState | null;
  management: ManagementState | null;
  teams: Team[]; // current teams (names, colours, ratings)
  season: number;
  onOpen: (t: ProfileTarget) => void;
}) {
  const allTeams = useMemo(() => {
    const m = new Map<string, Team>();
    for (const s of seasons) for (const t of s.teams) m.set(t.id, t);
    for (const t of teams) m.set(t.id, t);
    return [...m.values()];
  }, [seasons, teams]);

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl bg-[hsl(222_22%_8%)] border-white/10 max-h-[92vh] overflow-y-auto">
        {target?.kind === "driver" && (
          <DriverProfile id={target.id} seasons={seasons} people={people} teams={allTeams} season={season} onOpen={onOpen} />
        )}
        {target?.kind === "team" && (
          <TeamProfile id={target.id} seasons={seasons} people={people} management={management} teams={allTeams} season={season} onOpen={onOpen} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DriverProfile({
  id, seasons, people, teams, season, onOpen,
}: {
  id: string;
  seasons: SeasonData[];
  people: PeopleState | null;
  teams: Team[];
  season: number;
  onOpen: (t: ProfileTarget) => void;
}) {
  const rec = people?.drivers[id];
  const fromGrid = teams.flatMap((t) => t.drivers.map((d) => ({ d, t }))).find((x) => x.d.id === id);
  const d = rec ?? fromGrid?.d;
  const lines = useMemo(() => driverLines(id, seasons), [id, seasons]);
  if (!d) return <DialogTitle>Piloto no encontrado</DialogTitle>;
  const team = teams.find((t) => t.id === (rec?.contract?.teamId ?? rec?.reserveOf ?? fromGrid?.t.id));
  const color = team?.hex ?? "#9ca3af";
  const past = DRIVER_HISTORY[id];
  const titles = lines.filter((l) => l.champion).length + (past?.titles ?? 0);
  const wins = sum(lines, "wins") + (past?.wins ?? 0);
  const podiums = sum(lines, "podiums") + (past?.podiums ?? 0);
  const nameOf = (tid: string) => teams.find((t) => t.id === tid)?.name;
  const status = rec
    ? `${whereIs(rec, nameOf)}${rec.status === "active" && rec.contract ? ` · contrato hasta ${rec.contract.until}` : ""}${
        rec.reserveOf && rec.series && rec.series !== "F2" && rec.series !== "F3" ? ` · también corre en ${rec.series}` : ""
      }`
    : team?.name ?? "";
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <span className="font-display text-6xl w-20 text-center" style={{ color }}>
          {d.number}
        </span>
        <div className="min-w-0 flex-1">
          <div className="tv-label text-primary">Ficha del piloto</div>
          <DialogTitle className="font-display text-3xl leading-tight">
            {d.nationality} {d.name}
          </DialogTitle>
          <div className="text-xs text-muted-foreground">
            {rec ? `${ageOf(rec, season)} años · ` : ""}
            {status}
            {rec ? ` · ${(rec.f1Seasons ?? 0) > 0 ? `${rec.f1Seasons} temporadas en F1` : "sin experiencia en F1"}` : ""}
          </div>
        </div>
        {team && (
          <button className="mr-6" onClick={() => onOpen({ kind: "team", id: team.id })} title={`Ver ${team.name}`}>
            <TeamLogo teamId={team.id} color={team.hex} label={team.shortName} className="h-14 w-14" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Tile label="Campeonatos" value={titles} gold={titles > 0} />
        <Tile label="Victorias" value={wins} />
        <Tile label="Podios" value={podiums} />
        <Tile label="Poles" value={sum(lines, "poles")} sub="en el juego" />
        <Tile label="Carreras" value={sum(lines, "starts")} sub="en el juego" />
        <Tile label="Puntos" value={sum(lines, "points")} sub="en el juego" />
        <Tile label="Abandonos" value={sum(lines, "dnfs")} sub="en el juego" />
        <Tile label="Mejor resultado" value={lines.some((l) => l.best) ? `P${Math.min(...lines.filter((l) => l.best).map((l) => l.best!))}` : "—"} />
      </div>
      {rec?.reserveOf && (
        <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-xs text-sky-200 -mt-2">
          Piloto de reserva de {nameOf(rec.reserveOf)} hasta {rec.reserveUntil}: aporta {Math.round(reserveDevBonus(rec.pace) * 100)}% extra al desarrollo con su trabajo en el simulador.
        </div>
      )}
      {past && <p className="text-[10px] text-muted-foreground -mt-3">Campeonatos, victorias y podios incluyen su carrera antes de 2026 (valores aproximados).</p>}

      <div className="space-y-2">
        <div className="tv-label text-muted-foreground">Nivel actual</div>
        <Bar label="Ritmo" value={d.pace} color={color} />
        <Bar label="Carrera" value={d.racecraft} color={color} />
        <Bar label="Defensa" value={d.defending} color={color} />
        <Bar label="Constancia" value={d.consistency} color={color} />
        <Bar label="Neumáticos" value={d.tyreMgmt} color={color} />
        {rec && ageOf(rec, season) <= 25 && <Bar label="Potencial" value={rec.potential} color="#a78bfa" />}
      </div>

      <div className="space-y-2">
        <div className="tv-label text-muted-foreground">Temporada por temporada</div>
        <SeasonTable lines={lines} teams={teams} showTeam />
      </div>
    </div>
  );
}

function TeamProfile({
  id, seasons, people, management, teams, season, onOpen,
}: {
  id: string;
  seasons: SeasonData[];
  people: PeopleState | null;
  management: ManagementState | null;
  teams: Team[];
  season: number;
  onOpen: (t: ProfileTarget) => void;
}) {
  const team = teams.find((t) => t.id === id);
  const lines = useMemo(() => teamLines(id, seasons), [id, seasons]);
  if (!team) return <DialogTitle>Equipo no encontrado</DialogTitle>;
  const past = TEAM_HISTORY[id];
  const titles = lines.filter((l) => l.champion).length + (past?.titles ?? 0);
  const dev = management?.dev[id];
  const staff = people ? teamStaff(people, id) : null;
  const driverTitles = seasons.filter((s) => s.finished).filter((s) => computeStandings(s.teams, s.results).drivers[0]?.teamId === id).length;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <TeamLogo teamId={team.id} color={team.hex} label={team.shortName} className="h-16 w-16 shrink-0" />
        <div className="min-w-0">
          <div className="tv-label text-primary">Ficha de la escudería</div>
          <DialogTitle className="font-display text-3xl leading-tight" style={{ color: team.hex }}>
            {team.name}
          </DialogTitle>
          <div className="text-xs text-muted-foreground">Temporada {season}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Tile label="Constructores" value={titles} sub="títulos" gold={titles > 0} />
        <Tile label="Pilotos" value={driverTitles} sub="títulos en el juego" gold={driverTitles > 0} />
        <Tile label="Victorias" value={sum(lines, "wins") + (past?.wins ?? 0)} />
        <Tile label="Podios" value={sum(lines, "podiums") + (past?.podiums ?? 0)} />
        <Tile label="Poles" value={sum(lines, "poles")} sub="en el juego" />
        <Tile label="Puntos" value={sum(lines, "points")} sub="en el juego" />
        <Tile label="Abandonos" value={sum(lines, "dnfs")} sub="en el juego" />
        <Tile label="Mejor posición" value={lines.length ? `P${Math.min(...lines.map((l) => l.pos))}` : "—"} sub="en constructores" />
      </div>
      {past && <p className="text-[10px] text-muted-foreground -mt-3">Títulos, victorias y podios incluyen la historia del equipo antes de 2026 (valores aproximados).</p>}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="tv-label text-muted-foreground">Auto</div>
          <Bar label="Ritmo" value={team.pace} color={team.hex} />
          {dev && (
            <>
              <Bar label="Aerodinámica" value={dev.aero} color={team.hex} />
              <Bar label="Motor" value={dev.powerUnit} color={team.hex} />
              <Bar label="Chasis" value={dev.chassis} color={team.hex} />
            </>
          )}
          <Bar label="Fiabilidad" value={team.reliability} color={team.hex} />
          <Bar label="Pit stops" value={team.pitCrew} color={team.hex} />
        </div>
        <div className="space-y-2">
          <div className="tv-label text-muted-foreground">Pilotos</div>
          {team.drivers.map((d) => (
            <button
              key={d.id}
              onClick={() => onOpen({ kind: "driver", id: d.id })}
              className="w-full flex items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-left hover:bg-white/5"
            >
              <span className="font-display text-2xl w-9" style={{ color: team.hex }}>
                {d.number}
              </span>
              <span className="flex-1 text-sm">
                {d.nationality} {d.name}
              </span>
              <span className="text-xs text-muted-foreground">ritmo {d.pace.toFixed(1)}</span>
            </button>
          ))}
          {people &&
            (() => {
              const r = Object.values(people.drivers).find((d) => d.reserveOf === id && d.status !== "retired");
              return r ? (
                <button
                  onClick={() => onOpen({ kind: "driver", id: r.id })}
                  className="w-full flex items-center gap-2 rounded-lg border border-dashed border-white/15 px-3 py-2 text-left hover:bg-white/5"
                >
                  <span className="tv-label text-sky-300 w-9">RES</span>
                  <span className="flex-1 text-sm">
                    {r.nationality} {r.name}
                  </span>
                  <span className="text-xs text-muted-foreground">ritmo {r.pace.toFixed(1)}</span>
                </button>
              ) : (
                <div className="text-xs text-muted-foreground">Sin piloto de reserva</div>
              );
            })()}
          {staff && (
            <>
              <div className="tv-label text-muted-foreground pt-2">Dirección</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {STAFF_ROLES.map((r) => (
                  <div key={r} className="flex justify-between gap-2">
                    <span className="text-muted-foreground truncate">{STAFF_ROLE_INFO[r].short}</span>
                    <span className="truncate">
                      {staff[r] ? (
                        <>
                          {staff[r]!.name.split(" ").slice(-1)[0]} <b>{staff[r]!.rating}</b>
                        </>
                      ) : (
                        <span className="text-red-400">vacante</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="tv-label text-muted-foreground">Temporada por temporada</div>
        <SeasonTable lines={lines} teams={teams} />
      </div>
    </div>
  );
}
