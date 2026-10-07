// Driver morale and form: results against what the car allows, beating the teammate and
// team orders move them; both nudge the driver's pace and consistency a little.
import type { Entry } from "./types";
import type { ClassifiedRow } from "./types";
import type { DriverRecord, PeopleState } from "./people";

export const BASE_MORALE = 65;

export interface FormEntry {
  season: number;
  round: number;
  pos: number | null; // null = did not finish
  expected: number;
  score: number; // -3 (disaster) .. +3 (outstanding) against expectations
  note?: string; // "Accidente", "Avería"...
}

export interface OrderLog {
  lap: number;
  teamId: string;
  kind: "swap" | "hold";
  yielded: string; // driver who had to give way / hold back
  favored: string;
  obeyed: boolean;
}

export const moraleOf = (d: Pick<DriverRecord, "morale"> | undefined) => Math.round(d?.morale ?? BASE_MORALE);

/** Average of the last five results against expectations (-3..+3). */
export function formOf(d: Pick<DriverRecord, "formLog"> | undefined) {
  const log = d?.formLog ?? [];
  const last = log.slice(-5);
  if (!last.length) return 0;
  // the most recent races weigh a bit more
  let sum = 0;
  let w = 0;
  last.forEach((f, i) => {
    const k = 1 + i * 0.25;
    sum += f.score * k;
    w += k;
  });
  // one or two races say little: the form firms up over three or more
  return +((sum / w) * Math.min(1, last.length / 3)).toFixed(2);
}

export function moraleLabel(m: number): { label: string; tone: string; color: string } {
  if (m >= 85) return { label: "Excelente", tone: "text-emerald-300", color: "#34d399" };
  if (m >= 70) return { label: "Buena", tone: "text-green-400", color: "#4ade80" };
  if (m >= 50) return { label: "Normal", tone: "text-yellow-300", color: "#facc15" };
  if (m >= 35) return { label: "Baja", tone: "text-orange-400", color: "#fb923c" };
  return { label: "Muy baja", tone: "text-red-400", color: "#f87171" };
}

export function formLabel(f: number): { label: string; tone: string; arrow: string } {
  if (f >= 1.2) return { label: "En racha", tone: "text-emerald-300", arrow: "▲▲" };
  if (f >= 0.4) return { label: "Buena", tone: "text-green-400", arrow: "▲" };
  if (f > -0.4) return { label: "Regular", tone: "text-muted-foreground", arrow: "▬" };
  if (f > -1.2) return { label: "Floja", tone: "text-orange-400", arrow: "▼" };
  return { label: "Mala racha", tone: "text-red-400", arrow: "▼▼" };
}

/** Rating points added to the driver's stats by morale and form. */
export function moodEffect(d: Pick<DriverRecord, "morale" | "formLog"> | undefined) {
  const m = moraleOf(d);
  const f = formOf(d);
  return {
    pace: +((m - BASE_MORALE) * 0.025 + f * 0.25).toFixed(2),
    consistency: +((m - BASE_MORALE) * 0.08).toFixed(2),
  };
}

/** Race entries with each driver's current morale and form applied. */
export function withMood(entries: Entry[], people: PeopleState | null | undefined): Entry[] {
  if (!people) return entries;
  return entries.map((e) => {
    const rec = people.drivers[e.driver.id];
    if (!rec) return e;
    const fx = moodEffect(rec);
    if (!fx.pace && !fx.consistency) return e;
    return {
      ...e,
      driver: {
        ...e.driver,
        pace: Math.min(100, +(e.driver.pace + fx.pace).toFixed(2)),
        consistency: Math.min(100, Math.max(40, +(e.driver.consistency + fx.consistency).toFixed(2))),
      },
    };
  });
}

/** Will this driver follow a team order that costs him? */
export const obeyChance = (morale: number) => (morale >= 55 ? 0.97 : Math.max(0.35, 0.97 - (55 - morale) * 0.018));

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/**
 * After a race (or a sprint, with half the weight): morale and form of every driver on the grid.
 * `carRank` is where each team's car stands (1 = best). Returns notes for the player's drivers.
 */
export function moodAfterRace(
  people: PeopleState,
  rows: ClassifiedRow[],
  opts: { season: number; round: number; carRank: (teamId: string) => number; orders?: OrderLog[]; sprint?: boolean; playerTeamId?: string | null },
): { people: PeopleState; notes: { text: string; tone: "good" | "bad" | "info" }[] } {
  const drivers = { ...people.drivers };
  const notes: { text: string; tone: "good" | "bad" | "info" }[] = [];
  const weight = opts.sprint ? 0.5 : 1;
  const byTeam = new Map<string, ClassifiedRow[]>();
  for (const r of rows) byTeam.set(r.teamId, [...(byTeam.get(r.teamId) ?? []), r]);

  for (const r of rows) {
    const rec = drivers[r.driverId];
    if (!rec) continue;
    const before = moraleOf(rec);
    const mate = (byTeam.get(r.teamId) ?? []).find((x) => x.driverId !== r.driverId);
    const mateRec = mate ? drivers[mate.driverId] : undefined;
    // what the car allows; the quicker driver of the pair is expected a little ahead
    const quicker = mateRec ? (rec.pace >= mateRec.pace ? -0.5 : 0.5) : 0;
    const expected = clamp(opts.carRank(r.teamId) * 2 - 0.5 + quicker, 1, Math.max(rows.length, 20));
    const dnf = r.status === "dnf";
    const crash = dnf && /accidente|estrella|choque|contacto/i.test(r.dnfReason ?? "");
    const score = dnf ? (crash ? -2 : -0.4) : clamp((expected - r.position) / 2.5, -3, 3);
    let delta = score * 1.6;
    if (!dnf && r.position === 1) delta += 4;
    else if (!dnf && r.position <= 3) delta += 2;
    if (mate && !dnf) {
      if (mate.status === "dnf" || r.position < mate.position) delta += 1;
      else delta -= 1;
    }
    let m = before + delta * weight;
    m += (BASE_MORALE - m) * 0.06 * weight; // feelings settle with time
    const formLog = opts.sprint
      ? rec.formLog ?? []
      : [
          ...(rec.formLog ?? []),
          { season: opts.season, round: opts.round, pos: dnf ? null : r.position, expected: +expected.toFixed(1), score: +score.toFixed(2), note: dnf ? r.dnfReason : undefined },
        ].slice(-10);
    drivers[r.driverId] = { ...rec, morale: +clamp(m, 5, 100).toFixed(1), formLog };
  }

  // team orders
  for (const o of opts.orders ?? []) {
    const y = drivers[o.yielded];
    const f = drivers[o.favored];
    if (!y || !f) continue;
    const mine = o.teamId === opts.playerTeamId;
    if (o.obeyed) {
      const hit = o.kind === "swap" ? 7 : 2.5;
      drivers[o.yielded] = { ...y, morale: +clamp(moraleOf(y) - hit, 5, 100).toFixed(1) };
      drivers[o.favored] = { ...f, morale: +clamp(moraleOf(f) + 1, 5, 100).toFixed(1) };
      if (mine && o.kind === "swap") notes.push({ text: `${y.name} cumplió la orden de equipo, pero no le gustó (moral −${hit}).`, tone: "info" });
    } else {
      drivers[o.yielded] = { ...y, morale: +clamp(moraleOf(y) - 2, 5, 100).toFixed(1) };
      drivers[o.favored] = { ...f, morale: +clamp(moraleOf(f) - 3, 5, 100).toFixed(1) };
      if (mine) notes.push({ text: `${y.name} ignoró la orden de equipo: el ambiente en el box está tenso.`, tone: "bad" });
    }
  }

  // tell the player when one of his drivers crosses into low or high spirits
  if (opts.playerTeamId) {
    for (const r of rows.filter((x) => x.teamId === opts.playerTeamId)) {
      const b = moraleOf(people.drivers[r.driverId]);
      const a = moraleOf(drivers[r.driverId]);
      const name = drivers[r.driverId]?.name ?? r.driverId;
      if (b >= 40 && a < 40) notes.push({ text: `${name} está desanimado (moral ${a}): rinde menos y puede desobedecer órdenes.`, tone: "bad" });
      if (b < 85 && a >= 85) notes.push({ text: `${name} está con la moral por las nubes (${a}).`, tone: "good" });
    }
  }
  return { people: { ...people, drivers }, notes };
}
