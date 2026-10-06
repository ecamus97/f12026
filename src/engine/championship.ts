// Standings are always derived from stored race results (single source of truth).
import type { Team } from "@/data/f1Data";
import type { ClassifiedRow } from "./types";

export interface StoredRaceResult {
  raceId: number;
  rows: ClassifiedRow[];
  pole: string;
  fastestLap: { driverId: string; time: number } | null;
  sprint?: ClassifiedRow[]; // sprint race of the same weekend (points only)
}

export interface DriverStanding {
  driverId: string;
  driverName: string;
  shortName: string;
  nationality: string;
  number: number;
  teamId: string;
  teamName: string;
  teamColor: string; // hex
  points: number;
  wins: number;
  podiums: number;
  poles: number;
  dnfs: number;
  bestFinish: number;
}

export interface TeamStanding {
  teamId: string;
  teamName: string;
  teamColor: string;
  points: number;
  wins: number;
  podiums: number;
}

export function computeStandings(teams: Team[], results: StoredRaceResult[]) {
  const drivers: DriverStanding[] = teams.flatMap((team) =>
    team.drivers.map((d) => ({
      driverId: d.id,
      driverName: d.name,
      shortName: d.shortName,
      nationality: d.nationality,
      number: d.number,
      teamId: team.id,
      teamName: team.name,
      teamColor: team.hex,
      points: 0,
      wins: 0,
      podiums: 0,
      poles: 0,
      dnfs: 0,
      bestFinish: 99,
    })),
  );
  const byId = new Map(drivers.map((d) => [d.driverId, d]));
  // countback: position counts per driver
  const counts = new Map<string, number[]>();

  for (const r of results) {
    for (const row of r.sprint ?? []) {
      const d = byId.get(row.driverId);
      if (d) d.points += row.points;
    }
    const pole = byId.get(r.pole);
    if (pole) pole.poles++;
    for (const row of r.rows) {
      const d = byId.get(row.driverId);
      if (!d) continue;
      d.points += row.points;
      if (row.status === "dnf") {
        d.dnfs++;
        continue;
      }
      if (row.position === 1) d.wins++;
      if (row.position <= 3) d.podiums++;
      d.bestFinish = Math.min(d.bestFinish, row.position);
      const c = counts.get(d.driverId) ?? Array(30).fill(0);
      c[row.position]++;
      counts.set(d.driverId, c);
    }
  }

  const countback = (a: string, b: string) => {
    const ca = counts.get(a) ?? [];
    const cb = counts.get(b) ?? [];
    for (let p = 1; p < 30; p++) {
      const diff = (cb[p] ?? 0) - (ca[p] ?? 0);
      if (diff) return diff;
    }
    return 0;
  };
  drivers.sort((a, b) => b.points - a.points || countback(a.driverId, b.driverId));

  const teamsStandings: TeamStanding[] = teams.map((t) => {
    const ds = drivers.filter((d) => d.teamId === t.id);
    return {
      teamId: t.id,
      teamName: t.name,
      teamColor: t.hex,
      points: ds.reduce((a, d) => a + d.points, 0),
      wins: ds.reduce((a, d) => a + d.wins, 0),
      podiums: ds.reduce((a, d) => a + d.podiums, 0),
    };
  });
  teamsStandings.sort((a, b) => b.points - a.points || b.wins - a.wins);
  return { drivers, teams: teamsStandings };
}
