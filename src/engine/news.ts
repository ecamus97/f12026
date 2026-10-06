// Paddock news: generated from what happens in races, the championship, development and the regulations.
import type { ClassifiedRow, RaceEvent } from "./types";

export type NewsKind = "race" | "championship" | "team" | "development" | "rules" | "market" | "weather" | "season";

export type NewsChart =
  | { type: "podium"; rows: { name: string; team: string; color: string; note: string }[] }
  | { type: "bars"; title: string; unit: string; rows: { label: string; color: string; value: number; mine?: boolean }[] }
  | { type: "dev"; teamIds: string[]; metric: "pace" }
  | { type: "votes"; proposalId: string }
  | { type: "positions"; rows: { label: string; color: string; from: number; to: number }[] };

export interface NewsItem {
  id: string;
  season: number;
  round: number; // 0 = pre-season
  kind: NewsKind;
  title: string;
  summary: string;
  body: string[];
  teamIds: string[];
  color?: string; // accent (team colour)
  mine?: boolean; // about the player's team
  raceId?: number;
  chart?: NewsChart;
  importance: number; // 1..3, for ordering the featured story
}

export const NEWS_KIND_INFO: Record<NewsKind, { label: string; color: string }> = {
  race: { label: "Carrera", color: "#ef4444" },
  championship: { label: "Campeonato", color: "#facc15" },
  team: { label: "Tu equipo", color: "#22c55e" },
  development: { label: "Desarrollo", color: "#38bdf8" },
  rules: { label: "FIA", color: "#a78bfa" },
  market: { label: "Mercado", color: "#fb923c" },
  weather: { label: "Clima", color: "#60a5fa" },
  season: { label: "Temporada", color: "#f472b6" },
};

export interface NewsLookup {
  driver: (id: string) => { name: string; short: string; teamId: string } | undefined;
  team: (id: string) => { name: string; hex: string } | undefined;
}

export interface StandingLite {
  id: string;
  name: string;
  teamId: string;
  points: number;
}

const ord = (n: number) => `P${n}`;
const surname = (n: string) => n.split(" ").slice(-1)[0];

/** News after a Grand Prix. */
export function raceNews(ctx: {
  season: number;
  round: number;
  raceId: number;
  raceName: string;
  country: string;
  rows: ClassifiedRow[];
  events: RaceEvent[];
  fastest?: { driverId: string; time: number } | null;
  poleId?: string;
  before: StandingLite[]; // drivers' standings before the race
  after: StandingLite[];
  teamsAfter: StandingLite[];
  playerTeamId: string | null;
  look: NewsLookup;
}): NewsItem[] {
  const { season, round, rows, look } = ctx;
  const out: NewsItem[] = [];
  const id = (k: string) => `${season}-${round}-${k}`;
  const dn = (did: string) => look.driver(did)?.name ?? did;
  const tm = (tid: string) => look.team(tid);
  const finished = rows.filter((r) => r.status === "finished");
  const win = finished[0];
  if (!win) return out;
  const winTeam = tm(win.teamId);
  const second = finished[1];

  // 1) race report
  const margin = second?.gap ?? "";
  const dnfs = rows.filter((r) => r.status === "dnf");
  const rain = ctx.events.some((e) => e.type === "weather");
  const sc = ctx.events.filter((e) => e.type === "sc").length;
  const overtakes = ctx.events.filter((e) => e.type === "overtake").length;
  const body = [
    `${dn(win.driverId)} ganó el ${ctx.raceName} con ${winTeam?.name ?? ""}, largando desde ${ord(win.grid)}${
      second ? ` y con ${margin.replace("+", "")} de ventaja sobre ${dn(second.driverId)}` : ""
    }.`,
    `El podio lo completaron ${finished
      .slice(1, 3)
      .map((r) => `${dn(r.driverId)} (${tm(r.teamId)?.name})`)
      .join(" y ")}.`,
    `${overtakes} adelantamientos, ${sc ? `${sc} safety car${sc > 1 ? "s" : ""}` : "sin safety car"} y ${dnfs.length} abandono${dnfs.length === 1 ? "" : "s"}${
      dnfs.length ? ` (${dnfs.map((r) => `${surname(dn(r.driverId))}: ${r.dnfReason ?? "abandono"}`).join(", ")})` : ""
    }.`,
  ];
  if (ctx.fastest) body.push(`La vuelta rápida fue para ${dn(ctx.fastest.driverId)}.`);
  if (ctx.poleId && ctx.poleId !== win.driverId) body.push(`El poleman, ${dn(ctx.poleId)}, terminó ${rows.find((r) => r.driverId === ctx.poleId)?.status === "dnf" ? "abandonando" : ord(rows.find((r) => r.driverId === ctx.poleId)?.position ?? 0)}.`);
  out.push({
    id: id("race"),
    season,
    round,
    kind: "race",
    title: `${surname(dn(win.driverId))} gana en ${ctx.country}`,
    summary: `${dn(win.driverId)} se impone en el ${ctx.raceName}${win.grid > 3 ? ` remontando desde ${ord(win.grid)}` : ""}.`,
    body,
    teamIds: [win.teamId],
    color: winTeam?.hex,
    raceId: ctx.raceId,
    importance: 3,
    chart: {
      type: "podium",
      rows: finished.slice(0, 3).map((r) => ({
        name: dn(r.driverId),
        team: tm(r.teamId)?.name ?? "",
        color: tm(r.teamId)?.hex ?? "#888",
        note: r.position === 1 ? "Ganador" : r.gap,
      })),
    },
  });

  // 2) player's team
  if (ctx.playerTeamId) {
    const mine = rows.filter((r) => r.teamId === ctx.playerTeamId);
    const pts = mine.reduce((a, r) => a + r.points, 0);
    const best = mine.filter((r) => r.status === "finished").sort((a, b) => a.position - b.position)[0];
    const team = tm(ctx.playerTeamId);
    const teamPos = ctx.teamsAfter.findIndex((t) => t.id === ctx.playerTeamId) + 1;
    out.push({
      id: id("mine"),
      season,
      round,
      kind: "team",
      title: best ? (best.position <= 3 ? `¡Podio para ${team?.name}!` : pts > 0 ? `${team?.name} suma ${pts} punto${pts === 1 ? "" : "s"}` : `${team?.name} se va sin puntos`) : `Doble abandono de ${team?.name}`,
      summary: mine.map((r) => `${surname(dn(r.driverId))} ${r.status === "dnf" ? "abandonó" : ord(r.position)} (salía ${ord(r.grid)})`).join(" · "),
      body: [
        ...mine.map((r) =>
          r.status === "dnf"
            ? `${dn(r.driverId)} abandonó: ${r.dnfReason ?? "abandono"}.`
            : `${dn(r.driverId)} terminó ${ord(r.position)} tras largar ${ord(r.grid)}, con ${r.stops} parada${r.stops === 1 ? "" : "s"}${r.points ? ` y ${r.points} puntos` : ""}.`,
        ),
        `El equipo queda ${ord(teamPos)} en el campeonato de constructores.`,
      ],
      teamIds: [ctx.playerTeamId],
      color: team?.hex,
      mine: true,
      raceId: ctx.raceId,
      importance: best && best.position <= 3 ? 3 : 2,
      chart: {
        type: "positions",
        rows: mine.map((r) => ({ label: surname(dn(r.driverId)), color: team?.hex ?? "#888", from: r.grid, to: r.status === "dnf" ? 0 : r.position })),
      },
    });
  }

  // 3) championship
  const leaderBefore = ctx.before[0];
  const leader = ctx.after[0];
  const runner = ctx.after[1];
  if (leader && runner) {
    const gap = leader.points - runner.points;
    const changed = leaderBefore && leaderBefore.points > 0 && leaderBefore.id !== leader.id;
    if (changed || gap <= 10 || round % 4 === 0 || round === 1) {
      out.push({
        id: id("champ"),
        season,
        round,
        kind: "championship",
        title: changed ? `${surname(leader.name)} es el nuevo líder del campeonato` : gap <= 10 ? `Lucha al rojo vivo: ${gap} puntos entre ${surname(leader.name)} y ${surname(runner.name)}` : `${surname(leader.name)} manda con ${gap} puntos de ventaja`,
        summary: `Tras ${round} carrera${round === 1 ? "" : "s"}: ${leader.name} ${leader.points} pts, ${runner.name} ${runner.points} pts.`,
        body: [
          `${leader.name} lidera con ${leader.points} puntos, ${gap} más que ${runner.name}.`,
          `En constructores manda ${tm(ctx.teamsAfter[0]?.id ?? "")?.name ?? ""} con ${ctx.teamsAfter[0]?.points ?? 0} puntos, seguido de ${tm(ctx.teamsAfter[1]?.id ?? "")?.name ?? ""} (${ctx.teamsAfter[1]?.points ?? 0}).`,
          `Quedan ${24 - round} carreras: hay ${(24 - round) * 26} puntos en juego.`,
        ],
        teamIds: [leader.teamId],
        color: tm(leader.teamId)?.hex,
        importance: changed ? 3 : 2,
        chart: {
          type: "bars",
          title: "Campeonato de pilotos",
          unit: "pts",
          rows: ctx.after.slice(0, 6).map((d) => ({ label: d.name, color: tm(d.teamId)?.hex ?? "#888", value: d.points, mine: d.teamId === ctx.playerTeamId })),
        },
      });
    }
  }

  // 4) comeback of the day
  const climber = [...finished].sort((a, b) => b.grid - b.position - (a.grid - a.position))[0];
  if (climber && climber.grid - climber.position >= 6) {
    out.push({
      id: id("comeback"),
      season,
      round,
      kind: "race",
      title: `Remontada de ${surname(dn(climber.driverId))}: de ${ord(climber.grid)} a ${ord(climber.position)}`,
      summary: `${dn(climber.driverId)} ganó ${climber.grid - climber.position} posiciones en ${ctx.country}.`,
      body: [
        `${dn(climber.driverId)} (${tm(climber.teamId)?.name}) firmó la remontada del día: largó ${ord(climber.grid)} y cruzó la meta ${ord(climber.position)}.`,
        `Hizo ${climber.stops} parada${climber.stops === 1 ? "" : "s"} y sumó ${climber.points} punto${climber.points === 1 ? "" : "s"}.`,
      ],
      teamIds: [climber.teamId],
      color: tm(climber.teamId)?.hex,
      importance: 1,
      raceId: ctx.raceId,
      chart: { type: "positions", rows: [{ label: surname(dn(climber.driverId)), color: tm(climber.teamId)?.hex ?? "#888", from: climber.grid, to: climber.position }] },
    });
  }

  // 5) weather
  if (rain) {
    const ev = ctx.events.filter((e) => e.type === "weather");
    out.push({
      id: id("rain"),
      season,
      round,
      kind: "weather",
      title: `La lluvia condiciona el GP de ${ctx.country}`,
      summary: ev.map((e) => `V${e.lap}: ${e.text.replace(/^[^\s]+\s/, "")}`).slice(0, 3).join(" · "),
      body: [
        `El clima cambió durante la carrera: ${ev.map((e) => `vuelta ${e.lap}, ${e.text.replace(/^[^\s]+\s/, "").toLowerCase()}`).join("; ")}.`,
        `Los equipos que acertaron con el momento de cambiar a intermedios o volver a slicks marcaron la diferencia.`,
      ],
      teamIds: [],
      importance: 2,
      raceId: ctx.raceId,
    });
  }

  // 6) top driver out
  const bigDnf = dnfs.find((r) => (ctx.before.findIndex((d) => d.id === r.driverId) + 1 || 99) <= 4);
  if (bigDnf) {
    out.push({
      id: id("dnf"),
      season,
      round,
      kind: "race",
      title: `Golpe para ${surname(dn(bigDnf.driverId))}: abandono en ${ctx.country}`,
      summary: `${dn(bigDnf.driverId)} no terminó (${bigDnf.dnfReason ?? "abandono"}) y pierde terreno en el campeonato.`,
      body: [`${dn(bigDnf.driverId)} abandonó por ${(bigDnf.dnfReason ?? "abandono").toLowerCase()}, un duro golpe para sus aspiraciones en el campeonato.`],
      teamIds: [bigDnf.teamId],
      color: tm(bigDnf.teamId)?.hex,
      importance: 1,
      raceId: ctx.raceId,
    });
  }
  return out;
}

/** A team brought a big upgrade (from the development history). */
export function developmentNews(ctx: {
  season: number;
  round: number;
  before: Record<string, number>; // car pace per team
  after: Record<string, number>;
  playerTeamId: string | null;
  look: NewsLookup;
}): NewsItem[] {
  const gains = Object.keys(ctx.after)
    .filter((id) => id !== ctx.playerTeamId)
    .map((id) => ({ id, g: (ctx.after[id] ?? 0) - (ctx.before[id] ?? 0) }))
    .sort((a, b) => b.g - a.g);
  const top = gains[0];
  if (!top || top.g < 0.45) return [];
  const t = ctx.look.team(top.id);
  const rank = (id: string, m: Record<string, number>) => 1 + Object.keys(m).filter((x) => m[x] > m[id]).length;
  return [
    {
      id: `${ctx.season}-${ctx.round}-dev-${top.id}`,
      season: ctx.season,
      round: ctx.round,
      kind: "development",
      title: `${t?.name ?? top.id} estrena un paquete de mejoras`,
      summary: `El auto gana ${top.g.toFixed(1)} puntos de ritmo y pasa a ser el ${rank(top.id, ctx.after)}º más rápido.`,
      body: [
        `${t?.name} llevó a la pista una evolución importante: su ritmo sube de ${ctx.before[top.id]?.toFixed(1)} a ${ctx.after[top.id]?.toFixed(1)}.`,
        `Antes era el ${rank(top.id, ctx.before)}º auto más rápido; ahora es el ${rank(top.id, ctx.after)}º.`,
        ...(ctx.playerTeamId
          ? [`Tu auto está en ${ctx.after[ctx.playerTeamId]?.toFixed(1)} (${rank(ctx.playerTeamId, ctx.after)}º).`]
          : []),
      ],
      teamIds: [top.id],
      color: t?.hex,
      importance: 2,
      chart: { type: "dev", teamIds: ctx.playerTeamId ? [top.id, ctx.playerTeamId] : [top.id], metric: "pace" },
    },
  ];
}
