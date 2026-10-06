import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { races2026, teams as defaultTeams, teamInfo, type Race, type Team } from "@/data/f1Data";
import { calendar, setActiveCalendar, SPRINTS_2026, datesForSeason } from "@/data/calendar";
import {
  classify,
  type ClassifiedRow,
  simulateToEnd,
  confirmStrategy,
  computeStandings,
  createRace,
  DEFAULT_SIM_CONFIG,
  randomSeed,
  runQualifying,
  generateWeather,
  type Entry,
  type QualifyingResult,
  type RaceState,
  type SimConfig,
  type StoredRaceResult,
  type WeatherTimeline,
  applyDevToTeams,
  initManagement,
  processRaceWeekend,
  startProject as startProjectFn,
  autopilot,
  upgradeFacility as upgradeFacilityFn,
  signSponsor as signSponsorFn,
  chargePlayer,
  carRankOf,
  startNewSeason,
  type FacilityKey,
  type ManagementState,
  FIRST_SEASON,
  initPeople,
  staffRatings,
  payroll,
  advanceSeason,
  applyLineups,
  ageOf,
  willRetire,
  offerDriverContract,
  releaseAtSeasonEnd,
  hireStaff as hireStaffFn,
  teamStaff,
  lineup,
  type PeopleState,
  type TalkResult,
  offerStaffContract,
  offerStaffRenewal,
  migrateStaff,
  migrateFeeder,
  fireStaff as fireStaffFn,
  renewStaff as renewStaffFn,
  DEFAULT_RULES,
  POINTS_TABLES,
  generateProposals,
  resolveVote,
  rulesFor,
  areaRanks,
  type RuleSet,
  type RuleProposal,
  type TeamContext,
  type Vote,
  techChanges,
  COUNTRY_ES,
  calendarFor,
  completeOffSeason,
  generateActivities,
  describeEffect,
  rivalEvent,
  weekendDates,
  createRng,
  type Activity,
  raceNews,
  developmentNews,
  playerDevNews,
  marketNews,
  midSeasonMarket,
  FACILITY_INFO,
  carPace,
  type NewsItem,
  type NewsLookup,
  applyRegulationImpact,
  AREA_INFO,
} from "@/engine";

const STORAGE_KEY = "f1-manager-2026-v2";

export interface NegotiationAnswer {
  ok: boolean;
  message: string;
  result: TalkResult;
  counter?: number;
}

export interface SprintWeekend {
  quali: QualifyingResult;
  qualiRevealed: number;
  race: RaceState | null;
  rows?: ClassifiedRow[]; // set when the sprint is over
}

/** Sprint first (its own qualifying and race), then the Grand Prix. */
export const inSprint = (w: Weekend | null | undefined) => !!w?.sprint && !w.sprint.rows;

export const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];

/** A sprint is a third of the race distance. */
export const sprintOf = (race: Race): Race => ({ ...race, track: { ...race.track, laps: Math.max(10, Math.round(race.track.laps / 3)) } });

export interface Weekend {
  sprint?: SprintWeekend;
  raceIndex: number;
  quali: QualifyingResult;
  qualiRevealed: number; // sessions shown to the player (0-3)
  race: RaceState | null;
  weather?: WeatherTimeline; // Sunday's real weather (the player only sees the forecast)
}

/** Everything needed to show the final tables of a past season. */
export interface SeasonArchive {
  season: number;
  calendar: { id: number; name: string; flag: string; country: string }[];
  teams: Team[];
  results: StoredRaceResult[];
}

export interface SeasonSummary {
  season: number;
  driverChampion: { name: string; team: string };
  constructorChampion: string;
  playerPos: number;
  playerPoints: number;
  playerWins: number;
}

export interface GameState {
  version: 2;
  playerTeamId: string | null;
  currentRaceIndex: number;
  results: StoredRaceResult[];
  simConfig: SimConfig;
  teamsData: Team[];
  weekend: Weekend | null;
  management: ManagementState | null; // budget, R&D, facilities (needs a chosen team)
  baseTeams: Team[] | null; // ratings when the career started (for "new game")
  season: number;
  people: PeopleState | null; // contracts, ages, staff
  pastSeasons: SeasonSummary[];
  seasonNews: string[]; // what happened in the last off-season
  rules: RuleSet; // regulations in force this season
  proposals: RuleProposal[]; // FIA decrees and votes (all seasons)
  news: NewsItem[]; // paddock news, newest last
  activities: Activity[]; // agenda between races (sponsor events, media, factory...)
  agendaRounds: string[]; // "season-round" whose agenda was already planned
  calendar: Race[]; // races of this season, in order
  sprints: number[]; // race ids with a sprint this season
  nextSprints?: number[]; // announced for next season
  archive: SeasonArchive[]; // full results of past seasons
  seed: number; // career seed: makes each weekend's weather fixed (paddock, qualifying and race agree)
}

/** The weather of a weekend is decided in advance so every forecast is consistent. */
export function weekendWeather(s: Pick<GameState, "seed" | "season">, raceIndex: number) {
  const race = calendar()[raceIndex];
  if (!race) return null;
  const seed = (Math.imul(s.seed ^ (s.season * 2654435761), 1) + raceIndex * 40503) >>> 0;
  return generateWeather(race.track, race.track.laps, seed);
}

const initialState = (teamsData: Team[] = defaultTeams, simConfig: SimConfig = DEFAULT_SIM_CONFIG): GameState => ({
  version: 2,
  playerTeamId: null,
  currentRaceIndex: 0,
  results: [],
  simConfig,
  teamsData,
  weekend: null,
  management: null,
  baseTeams: null,
  season: FIRST_SEASON,
  people: null,
  pastSeasons: [],
  seasonNews: [],
  rules: DEFAULT_RULES,
  proposals: [],
  news: [],
  activities: [],
  agendaRounds: [],
  calendar: races2026,
  sprints: SPRINTS_2026,
  archive: [],
  seed: randomSeed(),
});

const regsOf = (r: RuleSet) => ({ budgetCap: r.budgetCap, puFreeze: r.puFreeze, flatPrize: r.flatPrize });

const MAX_NEWS = 160;
const addNews = (list: NewsItem[], items: NewsItem[]) => {
  const ids = new Set(items.map((n) => n.id));
  return [...list.filter((n) => !ids.has(n.id)), ...items].slice(-MAX_NEWS);
};

function lookupOf(s: GameState): NewsLookup {
  const drivers = new Map(s.teamsData.flatMap((t) => t.drivers.map((d) => [d.id, { name: d.name, short: d.shortName, teamId: t.id }])));
  const teams = new Map(s.teamsData.map((t) => [t.id, { name: t.name, hex: t.hex }]));
  return {
    driver: (id) => drivers.get(id) ?? (s.people?.drivers[id] ? { name: s.people.drivers[id].name, short: s.people.drivers[id].shortName, teamId: "" } : undefined),
    team: (id) => teams.get(id),
  };
}

/** News about a regulation: announced, or resolved with the votes. */
function ruleNews(p: RuleProposal, round: number, s: GameState): NewsItem {
  const resolved = p.status !== "pending";
  const passed = p.status === "approved" || p.status === "decreed";
  return {
    id: `${p.id}-${p.status}`,
    season: p.season,
    round,
    kind: "rules",
    title:
      p.by === "fia"
        ? `La FIA impone para ${p.effective}: ${p.title}`
        : resolved
          ? `${passed ? "Aprobado" : "Rechazado"}: ${p.title}`
          : `Los equipos votarán: ${p.title}`,
    summary: p.desc,
    body: [
      p.desc,
      p.by === "fia"
        ? `Es una decisión de la FIA: no se vota y entra en vigor en ${p.effective}.`
        : resolved
          ? `Resultado de la votación entre los jefes de equipo. Rige desde ${p.effective}.`
          : `Los 11 jefes de equipo votarán antes de la próxima carrera. Tu voto está en la sección Reglamento.`,
    ],
    teamIds: s.playerTeamId ? [s.playerTeamId] : [],
    importance: p.effect || p.key === "budgetCap" ? 3 : 2,
    chart: resolved && p.votes ? { type: "votes", proposalId: p.id } : undefined,
  };
}

/** How each team sees itself when it votes. */
function teamContexts(s: GameState): TeamContext[] {
  const m = s.management;
  if (!m) return [];
  return s.teamsData.map((t) => ({
    teamId: t.id,
    carRank: carRankOf(m, t.id),
    puRank: areaRanks(m, t.id).powerUnit,
    aeroRank: areaRanks(m, t.id).aero,
    chassisRank: areaRanks(m, t.id).chassis,
    driverPayroll: s.people ? payroll(s.people, t.id).drivers : 30,
    teams: s.teamsData.length,
  }));
}

const totalPayroll = (p: PeopleState, teamId: string) => {
  const x = payroll(p, teamId);
  return +(x.drivers + x.staff).toFixed(2);
};

/** Keep the management engine in sync with who works where. */
function withStaff(m: ManagementState, people: PeopleState): ManagementState {
  return { ...m, staffRatings: staffRatings(people) };
}

function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as GameState;
    if (parsed?.version !== 2 || !Array.isArray(parsed.teamsData)) return initialState();
    const state = { ...initialState(), ...parsed };
    state.rules = { ...DEFAULT_RULES, ...(parsed.rules ?? {}) };
    if (typeof parsed.seed !== "number") state.seed = randomSeed();
    if (!Array.isArray(parsed.calendar) || !parsed.calendar.length) state.calendar = races2026;
    if (!Array.isArray(parsed.sprints)) state.sprints = SPRINTS_2026;
    if (!Array.isArray(parsed.archive)) state.archive = [];
    setActiveCalendar(state.calendar);
    if (!Array.isArray(parsed.news)) state.news = [];
    if (!Array.isArray(parsed.activities)) state.activities = [];
    if (!Array.isArray(parsed.agendaRounds)) state.agendaRounds = [];
    // saves from before team management existed
    if (state.playerTeamId && !state.management) {
      state.management = initManagement(state.teamsData, state.playerTeamId, randomSeed());
      state.baseTeams = state.teamsData;
    }
    // saves from before contracts and staff existed
    if (state.playerTeamId && !state.people) state.people = initPeople(state.teamsData, randomSeed());
    if (state.people) state.people = migrateFeeder(migrateStaff(state.people));
    if (state.management && state.people) {
      state.management = withStaff(state.management, state.people);
      const pl = state.management.player;
      if (pl && pl.salaryFund === undefined) {
        state.management = { ...state.management, player: { ...pl, salaryFund: totalPayroll(state.people, pl.teamId) } };
      }
    }
    // saves from before sponsors / development history existed
    if (state.management) {
      const m = state.management;
      // one snapshot per completed round; rounds played before the chart existed use the oldest known values
      const hist = [...(m.history ?? [{ round: state.currentRaceIndex, dev: m.dev }])].sort((x, y) => x.round - y.round);
      const filled = [];
      for (let r = 0; r <= state.currentRaceIndex; r++) {
        const exact = hist.find((h) => h.round === r);
        const fallback = hist.find((h) => h.round >= r) ?? hist[hist.length - 1];
        filled.push(exact ?? { round: r, dev: fallback.dev });
      }
      m.history = [...hist.filter((h) => h.round < 0), ...filled];
      if (m.player && !m.player.sponsors) {
        const fresh = initManagement(state.teamsData, state.playerTeamId, randomSeed());
        m.player.sponsors = [];
        m.player.offers = fresh.player?.offers ?? [];
      }
    }
    return withAgenda(state);
  } catch {
    return initialState();
  }
}

/** Stories of the off-season: champions, new regulations, the driver market. */
function seasonStories(
  s: GameState,
  newSeason: number,
  sum: SeasonSummary,
  impact: { label: string; color: string; value: number; mine?: boolean }[],
  market: string[],
  proposals: RuleProposal[],
): NewsItem[] {
  const st = computeStandings(s.teamsData, s.results);
  const out: NewsItem[] = [
    {
      id: `${s.season}-champions`,
      season: newSeason,
      round: 0,
      kind: "season",
      title: `${sum.driverChampion.name}, campeón del mundo ${s.season}`,
      summary: `${sum.constructorChampion} se queda con el título de constructores. Tu equipo terminó P${sum.playerPos}.`,
      body: [
        `${sum.driverChampion.name} (${sum.driverChampion.team}) es el campeón de pilotos ${s.season} con ${st.drivers[0]?.points ?? 0} puntos y ${st.drivers[0]?.wins ?? 0} victorias.`,
        `${sum.constructorChampion} gana el campeonato de constructores.`,
        `Tu equipo cerró ${s.season} en P${sum.playerPos} con ${sum.playerPoints} puntos.`,
      ],
      teamIds: [],
      importance: 3,
      chart: {
        type: "bars",
        title: `Constructores ${s.season}`,
        unit: "pts",
        rows: st.teams.slice(0, 8).map((t) => ({ label: t.teamName, color: t.teamColor, value: t.points, mine: t.teamId === s.playerTeamId })),
      },
    },
  ];
  const changes = proposals.filter((p) => p.effective === newSeason && (p.status === "approved" || p.status === "decreed"));
  if (impact.length) {
    out.push({
      id: `${newSeason}-reg-impact`,
      season: newSeason,
      round: 0,
      kind: "rules",
      title: `Nuevo reglamento ${newSeason}: así cambian los autos`,
      summary: changes.map((p) => p.title).join(" · "),
      body: [
        `Entran en vigor: ${changes.map((p) => p.title).join(", ")}.`,
        `Los cambios técnicos acercan a los equipos en las áreas afectadas y algunos se adaptan mejor que otros.`,
      ],
      teamIds: [],
      importance: 3,
      chart: { type: "bars", title: "Cambio de rendimiento por el reglamento", unit: "", rows: [...impact].sort((a, b) => b.value - a.value) },
    });
  }
  const transfers = market.filter((n) => !n.startsWith("Tu equipo") && !n.startsWith("Cantera") && /ficha|se cambia|debuta|retiro|se retira/.test(n));
  const youth = market.filter((n) => n.startsWith("Cantera"));
  if (youth.length) {
    out.push({
      id: `${newSeason}-feeder`,
      season: newSeason,
      round: 0,
      kind: "market",
      title: `La cantera se mueve: ascensos y nuevas promesas para ${newSeason}`,
      summary: youth[0].replace(/^Cantera:\s*/, ""),
      body: youth.map((n) => n.replace(/^Cantera:\s*/, "")),
      teamIds: [],
      importance: 1,
    });
  }
  const staffMoves = market.filter((n) => !n.startsWith("Tu equipo") && /contrata a|deja |se incorpora/.test(n));
  if (staffMoves.length) {
    out.push({
      id: `${newSeason}-staff-market`,
      season: newSeason,
      round: 0,
      kind: "market",
      title: `Cambios en los muros: ${staffMoves.length} movimientos de directivos para ${newSeason}`,
      summary: staffMoves.slice(0, 2).join(" "),
      body: staffMoves,
      teamIds: [],
      importance: 2,
    });
  }
  if (transfers.length) {
    out.push({
      id: `${newSeason}-market`,
      season: newSeason,
      round: 0,
      kind: "market",
      title: `Mercado de pilotos: ${transfers.length} movimientos para ${newSeason}`,
      summary: transfers.slice(0, 2).join(" "),
      body: transfers,
      teamIds: [],
      importance: 2,
    });
  }
  return out;
}

/** Plan the agenda before the next race (once per round). */
function withAgenda(s: GameState): GameState {
  const p = s.management?.player;
  const team = s.teamsData.find((t) => t.id === s.playerTeamId);
  const r = s.currentRaceIndex;
  const race = calendar()[r];
  if (!p || !team || !race) return s;
  const key = `${s.season}-${r + 1}`;
  if (s.agendaRounds.includes(key)) return s;
  const from = r === 0 ? new Date(s.season, 0, 6) : weekendDates(calendar()[r - 1].date, s.season).end;
  const to = weekendDates(race.date, s.season).start;
  const items = generateActivities({
    season: s.season,
    beforeRound: r + 1,
    from,
    to,
    team: team.name,
    drivers: [team.drivers[0]?.name ?? "tu piloto", team.drivers[1]?.name ?? "tu otro piloto"],
    sponsors: p.sponsors,
    seed: s.seed,
    taken: s.activities.slice(-6).map((a) => a.tpl ?? ""),
  });
  return { ...s, activities: [...s.activities, ...items].slice(-120), agendaRounds: [...s.agendaRounds, key].slice(-60) };
}

/** Apply the choice of an agenda item (with its possible risk). */
function applyActivity(s: GameState, id: string, idx: number, auto = false): GameState {
  const a = s.activities.find((x) => x.id === id);
  if (!a || a.chosen !== undefined || !s.management?.player) return s;
  const c = a.choices[idx];
  if (!c) return s;
  const rng = createRng((s.seed ^ id.length * 7919 ^ idx * 104729 ^ a.beforeRound * 31) >>> 0);
  const risky = c.risk && rng.chance(c.risk.chance);
  const effects = [c.effect, ...(risky ? [c.risk!.effect] : [])];
  let m = s.management;
  let people = s.people;
  let teamsData = s.teamsData;
  const team = teamsData.find((t) => t.id === s.playerTeamId)!;
  for (const e of effects) {
    if (e.budget) m = chargePlayer(m, s.currentRaceIndex, `Agenda: ${a.title}`, e.budget, e.budget > 0 ? "eventsIn" : "eventsOut");
    if (e.sponsorRaces && a.sponsorId && m.player) {
      m = {
        ...m,
        player: {
          ...m.player,
          sponsors: m.player.sponsors.map((sp) =>
            sp.id === a.sponsorId ? { ...sp, racesLeft: Math.max(1, sp.racesLeft + e.sponsorRaces!), duration: Math.max(1, sp.duration + e.sponsorRaces!) } : sp,
          ),
        },
      };
    }
    if (e.project && m.player?.projects.length) {
      const longest = [...m.player.projects].sort((x, y) => y.racesLeft - x.racesLeft)[0];
      m = {
        ...m,
        player: {
          ...m.player,
          projects: m.player.projects.map((pr) =>
            pr.uid === longest.uid
              ? { ...pr, racesLeft: Math.max(1, pr.racesLeft - e.project!), totalRaces: Math.max(pr.totalRaces, pr.racesLeft - e.project!) }
              : pr,
          ),
        },
      };
    }
    if (e.area) {
      const d = m.dev[team.id];
      m = { ...m, dev: { ...m.dev, [team.id]: { ...d, [e.area.area]: Math.min(99.5, +(d[e.area.area] + e.area.delta).toFixed(2)) } } };
    }
    if (e.drivers) {
      const ids = team.drivers.map((d) => d.id).filter((_, i) => e.drivers!.which === "both" || (e.drivers!.which === "first" ? i === 0 : i === 1));
      const bump = (x: number) => Math.max(50, Math.min(99, +(x + e.drivers!.delta).toFixed(1)));
      teamsData = teamsData.map((t) =>
        t.id === team.id ? { ...t, drivers: t.drivers.map((d) => (ids.includes(d.id) ? { ...d, [e.drivers!.stat]: bump(d[e.drivers!.stat]) } : d)) } : t,
      );
      if (people) {
        const drivers = { ...people.drivers };
        for (const did of ids)
          if (drivers[did])
            drivers[did] = {
              ...drivers[did],
              [e.drivers.stat]: bump(drivers[did][e.drivers.stat]),
              mods: [...(drivers[did].mods ?? []), { stat: e.drivers.stat, delta: e.drivers.delta, label: a.title, season: s.season }].slice(-4),
            };
        people = { ...people, drivers };
      }
    }
  }
  const names: [string, string] = a.drivers ?? [team.drivers[0]?.name ?? "", team.drivers[1]?.name ?? ""];
  const applied = effects.flatMap((e) => describeEffect(e, names));
  const outcome = `${auto ? "Sin decisión a tiempo: " : ""}${c.label}.${c.risk ? ` ${risky ? c.risk.text : c.risk.safe ?? "Todo salió bien, sin contratiempos."}` : ""}${
    applied.length ? ` Resultado: ${applied.map((x) => x.text).join(", ")}.` : " Sin efectos."
  }`;
  m = { ...m, inbox: [...m.inbox, { race: s.currentRaceIndex, tone: risky ? ("bad" as const) : ("info" as const), text: `${a.icon} ${a.title}: ${outcome}` }].slice(-60) };
  return {
    ...s,
    management: m,
    people,
    teamsData: applyDevToTeams(teamsData, m),
    activities: s.activities.map((x) => (x.id === id ? { ...x, chosen: idx, outcome, applied } : x)),
  };
}

/** The player needs two drivers to race. */
export const missingSeats = (s: GameState) => {
  const t = s.teamsData.find((x) => x.id === s.playerTeamId);
  return t ? Math.max(0, 2 - t.drivers.length) : 0;
};

function openWeekend(s0: GameState): GameState {
  const race = calendar()[s0.currentRaceIndex];
  if (!race) return s0;
  if (missingSeats(s0) && s0.weekend?.raceIndex !== s0.currentRaceIndex) return s0;
  if (s0.weekend?.raceIndex === s0.currentRaceIndex) return s0; // resume
  // agenda items still open are settled with the most conservative option
  let s = s0;
  for (const a of s0.activities) {
    if (a.season === s0.season && a.beforeRound <= s0.currentRaceIndex + 1 && a.chosen === undefined) s = applyActivity(s, a.id, a.choices.length - 1, true);
  }
  const weather = weekendWeather(s, s.currentRaceIndex)!;
  const quali = runQualifying(race, entriesFromTeams(s.teamsData), randomSeed(), s.simConfig, weather.qualiWet);
  const sprint = s.sprints.includes(race.id)
    ? { quali: runQualifying(race, entriesFromTeams(s.teamsData), randomSeed(), s.simConfig, weather.qualiWet), qualiRevealed: 0, race: null }
    : undefined;
  return { ...s, weekend: { raceIndex: s.currentRaceIndex, quali, qualiRevealed: 0, race: null, weather, sprint } };
}

/** Sprint race: short, no mandatory stop, everyone on one set of tyres unless they decide otherwise. */
function openSprint(s: GameState): GameState {
  const w = s.weekend;
  if (!w?.sprint || w.sprint.race) return s;
  const race = sprintOf(calendar()[w.raceIndex]);
  const map = new Map(entriesFromTeams(s.teamsData).map((e) => [e.driver.id, e]));
  const grid = w.sprint.quali.grid.map((id) => map.get(id)).filter((e): e is Entry => !!e);
  const r = s.rules;
  const weather = generateWeather(race.track, race.track.laps, ((w.weather?.seed ?? 1) ^ 0x51) >>> 0);
  const rs = createRace(race, grid, randomSeed(), s.simConfig, s.playerTeamId, weather);
  const laps = race.track.laps;
  rs.cars = rs.cars.map((c, i) => {
    const wet = c.plan[0] && (c.plan[0].compound === "I" || c.plan[0].compound === "W");
    const compound = wet ? c.plan[0].compound : !c.controlled && i % 4 === 3 ? "S" : "M";
    return { ...c, compound, usedCompounds: [compound], plan: [{ compound, untilLap: laps }] };
  });
  rs.rules = { twoCompound: false, overtakeAid: r.overtakeAid, points: SPRINT_POINTS, fastestLapPoint: false };
  return { ...s, weekend: { ...w, sprint: { ...w.sprint, qualiRevealed: 3, race: rs } } };
}

function openRace(s: GameState): GameState {
  const w = s.weekend;
  if (inSprint(w)) return openSprint(s);
  if (!w || w.race) return s;
  const race = calendar()[w.raceIndex];
  const map = new Map(entriesFromTeams(s.teamsData).map((e) => [e.driver.id, e]));
  const grid = w.quali.grid.map((id) => map.get(id)).filter((e): e is Entry => !!e);
  const r = s.rules;
  const raceForRules = r.highDegTyres ? { ...race, track: { ...race.track, deg: +(race.track.deg * 1.2).toFixed(2) } } : race;
  const rs = createRace(raceForRules, grid, randomSeed(), s.simConfig, s.playerTeamId, w.weather);
  rs.rules = { twoCompound: r.twoCompound, overtakeAid: r.overtakeAid, points: POINTS_TABLES[r.points], fastestLapPoint: r.fastestLapPoint };
  return { ...s, weekend: { ...w, race: rs } };
}

/** Six sprint weekends: keep most of last year's, rotate a couple (never the opener or the finale). */
function pickSprints(cal: Race[], prev: number[], seed: number): number[] {
  const rng = createRng(seed >>> 0);
  const ids = cal.map((r) => r.id);
  const candidates = ids.slice(1, -1);
  let keep = prev.filter((id) => candidates.includes(id));
  while (keep.length > 4) keep.splice(rng.int(0, keep.length - 1), 1);
  const pool = candidates.filter((id) => !keep.includes(id));
  while (keep.length < 6 && pool.length) keep.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  return ids.filter((id) => keep.includes(id));
}

/** Close a race (or the sprint) of the weekend. */
function finishRaceState(s: GameState): GameState {
  const w0 = s.weekend;
  if (w0 && inSprint(w0)) {
    const sr = w0.sprint!.race;
    if (!sr?.finished) return s;
    const rows = classify(sr);
    const race = calendar()[w0.raceIndex];
    const look = lookupOf(s);
    const win = rows[0];
    const mine = rows.filter((r) => r.teamId === s.playerTeamId);
    const winTeam = look.team(win.teamId);
    const story: NewsItem = {
      id: `${s.season}-${w0.raceIndex + 1}-sprint`,
      season: s.season,
      round: w0.raceIndex + 1,
      kind: "race",
      title: `${look.driver(win.driverId)?.name.split(" ").slice(-1)[0]} gana el sprint en ${COUNTRY_ES[race.country] ?? race.country}`,
      summary: `Sprint de ${sr.totalLaps} vueltas. Tu equipo: ${mine.map((r) => `${look.driver(r.driverId)?.short} ${r.status === "dnf" ? "abandonó" : `P${r.position}`}${r.points ? ` (+${r.points})` : ""}`).join(" · ")}.`,
      body: [
        `${look.driver(win.driverId)?.name} (${winTeam?.name}) ganó la carrera sprint, que reparte puntos del 1º al 8º (8-7-6-5-4-3-2-1).`,
        `Podio: ${rows.slice(0, 3).map((r) => look.driver(r.driverId)?.name).join(", ")}.`,
        `El domingo se corre el Gran Premio con su propia clasificación.`,
      ],
      teamIds: [win.teamId],
      color: winTeam?.hex,
      raceId: race.id,
      importance: 2,
      chart: {
        type: "podium",
        rows: rows.slice(0, 3).map((r) => ({ name: look.driver(r.driverId)?.name ?? r.driverId, team: look.team(r.teamId)?.name ?? "", color: look.team(r.teamId)?.hex ?? "#888", note: r.position === 1 ? "Ganador" : r.gap })),
      },
    };
    return { ...s, weekend: { ...w0, sprint: { ...w0.sprint!, rows } }, news: addNews(s.news, [story]) };
  }
  const w = s.weekend;
  if (!w?.race?.finished) return s;
  const result: StoredRaceResult = {
    raceId: calendar()[w.raceIndex].id,
    rows: classify(w.race),
    pole: w.quali.grid[0],
    fastestLap: w.race.fastest ? { driverId: w.race.fastest.driverId, time: w.race.fastest.time } : null,
    sprint: w.sprint?.rows,
  };
  const round = w.raceIndex + 1;
  const pay = s.people && s.playerTeamId ? totalPayroll(s.people, s.playerTeamId) : undefined;
  let management = s.management ? processRaceWeekend(s.management, s.teamsData, result.rows, round, result.pole, pay) : null;
  // contract reminders
  if (management && s.people && s.playerTeamId && (round === 1 || round === 12 || round === 20)) {
    const ending = lineup(s.people, s.playerTeamId)
      .map((id) => s.people!.drivers[id])
      .filter((d) => d.contract && d.contract.until <= s.people!.season && !d.nextContract);
    if (ending.length) {
      management = {
        ...management,
        inbox: [
          ...management.inbox,
          {
            race: round,
            tone: "info" as const,
            text: `Contrato${ending.length > 1 ? "s" : ""} que termina${ending.length > 1 ? "n" : ""} este año: ${ending.map((d) => d.name).join(" y ")}. Renueva o ficha en Equipo → Pilotos.`,
          },
        ].slice(-60),
      };
    }
  }
  // regulations: votes not cast in time count as abstentions, new proposals are announced
  let proposals = s.proposals.map((p) =>
    p.status === "pending" && p.round < round ? resolveVote(p, teamContexts(s), s.playerTeamId, "abstain", randomSeed()) : p,
  );
  const fresh = generateProposals(s.season, round, rulesFor(s.season + 1, s.rules, proposals), proposals, randomSeed(), calendar().map((r) => r.id));
  proposals = [...proposals, ...fresh];
  if (management && fresh.length) {
    management = {
      ...management,
      inbox: [
        ...management.inbox,
        ...fresh.map((p) => ({
          race: round,
          tone: "info" as const,
          text: p.by === "fia" ? `La FIA decreta para ${p.effective}: ${p.title}.` : `Votación de reglamento para ${p.effective}: ${p.title}. Vota en Reglamento.`,
        })),
      ].slice(-60),
    };
  }
  // news of the weekend
  const look = lookupOf(s);
  const lite = (st: ReturnType<typeof computeStandings>) => ({
    drivers: st.drivers.map((d) => ({ id: d.driverId, name: d.driverName, teamId: d.teamId, points: d.points })),
    teams: st.teams.map((t) => ({ id: t.teamId, name: t.teamName, teamId: t.teamId, points: t.points })),
  });
  const results = [...s.results.filter((r) => r.raceId !== result.raceId), result];
  const before = lite(computeStandings(s.teamsData, s.results));
  const after = lite(computeStandings(s.teamsData, results));
  const raceInfo = calendar()[w.raceIndex];
  let news = raceNews({
    season: s.season,
    round,
    raceId: raceInfo.id,
    raceName: raceInfo.name,
    country: raceInfo.country,
    rows: result.rows,
    events: w.race.events,
    fastest: result.fastestLap,
    poleId: result.pole,
    before: before.drivers,
    after: after.drivers,
    teamsAfter: after.teams,
    teamsBefore: before.teams,
    playerTeamId: s.playerTeamId,
    look,
  });
  // big upgrade packages of the other teams (the two largest of the round)
  if (management?.lastAiPackages?.length) {
    const AREA_ES = { aero: "aerodinámica", powerUnit: "unidad de potencia", chassis: "chasis", reliability: "fiabilidad", pitCrew: "pit crew" } as const;
    const PART = { aero: "un nuevo fondo y alerones", powerUnit: "una evolución del motor", chassis: "un chasis aligerado y nueva suspensión", reliability: "piezas más fiables", pitCrew: "mejoras en boxes" } as const;
    const prevH = management.history.find((x) => x.round === round - 1);
    const rank = (id: string, d: Record<string, import("@/engine").CarDev>) => 1 + Object.keys(d).filter((k) => carPace(d[k]) > carPace(d[id])).length;
    for (const pk of [...management.lastAiPackages].sort((a, b) => b.gain - a.gain).slice(0, 2)) {
      if (pk.gain < 1.2) continue;
      const t = look.team(pk.teamId);
      const before = prevH ? carPace(prevH.dev[pk.teamId]) : 0;
      const after = carPace(management.dev[pk.teamId]);
      news.push({
        id: `${s.season}-${round}-pkg-${pk.teamId}`,
        season: s.season,
        round,
        kind: "development",
        title: `${t?.name} estrena ${PART[pk.area]}`,
        summary: `${AREA_ES[pk.area]} +${pk.gain.toFixed(1)} · ritmo del auto ${before.toFixed(1)} → ${after.toFixed(1)} (${rank(pk.teamId, management.dev)}º de la parrilla)`,
        body: [
          `${t?.name} llevó a la pista un paquete grande: su ${AREA_ES[pk.area]} sube ${pk.gain.toFixed(1)} puntos.`,
          prevH ? `Antes era el ${rank(pk.teamId, prevH.dev)}º auto más rápido; ahora es el ${rank(pk.teamId, management.dev)}º.` : "",
          `Los equipos que van más atrás traen paquetes con más frecuencia: el campo tiende a apretarse durante la temporada.`,
        ].filter(Boolean),
        teamIds: [pk.teamId],
        color: t?.hex,
        importance: 2,
        chart: { type: "dev", teamIds: s.playerTeamId ? [pk.teamId, s.playerTeamId] : [pk.teamId], metric: "pace" },
      });
    }
  }
  // the title is decided when nobody can catch the leader any more
  {
    const cal = calendar();
    const left = cal.length - round;
    const sprintsLeft = cal.slice(round).filter((r) => s.sprints.includes(r.id)).length;
    const fl = s.rules.fastestLapPoint ? left : 0;
    const maxD = left * 25 + sprintsLeft * 8 + fl;
    const maxT = left * 43 + sprintsLeft * 15 + fl;
    const has = (id: string) => s.news.some((n) => n.id === id);
    const [d1, d2] = after.drivers;
    if (d1 && d2 && d1.points - d2.points > maxD && !has(`${s.season}-clinch-d`)) {
      const t = look.team(d1.teamId);
      news.push({
        id: `${s.season}-clinch-d`,
        season: s.season,
        round,
        kind: "season",
        title: `¡${d1.name} es campeón del mundo ${s.season}!`,
        summary: left > 0 ? `Asegura el título con ${left} carrera${left === 1 ? "" : "s"} por disputarse: nadie puede alcanzarlo.` : `Se lleva el título en la última carrera.`,
        body: [
          `${d1.name} (${t?.name}) se corona campeón de pilotos con ${d1.points} puntos, ${d1.points - d2.points} más que ${d2.name}.`,
          left > 0 ? `Quedan ${left} carreras con ${maxD} puntos en juego, insuficientes para que alguien lo alcance.` : `Lo decidió en la última cita del año.`,
        ],
        teamIds: [d1.teamId],
        color: t?.hex,
        mine: d1.teamId === s.playerTeamId,
        importance: 5,
        chart: { type: "bars", title: `Campeonato de pilotos ${s.season}`, unit: "pts", rows: after.drivers.slice(0, 6).map((d) => ({ label: d.name, color: look.team(d.teamId)?.hex ?? "#888", value: d.points, mine: d.teamId === s.playerTeamId })) },
      });
    }
    const [t1, t2] = after.teams;
    if (t1 && t2 && t1.points - t2.points > maxT && !has(`${s.season}-clinch-t`)) {
      const t = look.team(t1.id);
      news.push({
        id: `${s.season}-clinch-t`,
        season: s.season,
        round,
        kind: "season",
        title: `¡${t?.name} campeón de constructores ${s.season}!`,
        summary: left > 0 ? `El título de equipos queda decidido con ${left} carrera${left === 1 ? "" : "s"} por correr.` : `Se lleva el título de equipos en la última carrera.`,
        body: [`${t?.name} suma ${t1.points} puntos, ${t1.points - t2.points} más que ${look.team(t2.id)?.name}, y ya no puede ser alcanzado.`],
        teamIds: [t1.id],
        color: t?.hex,
        mine: t1.id === s.playerTeamId,
        importance: 5,
        chart: { type: "bars", title: `Constructores ${s.season}`, unit: "pts", rows: after.teams.slice(0, 6).map((x) => ({ label: look.team(x.id)?.name ?? x.name, color: look.team(x.id)?.hex ?? "#888", value: x.points, mine: x.id === s.playerTeamId })) },
      });
    }
  }
  // the player's own upgrades and finished buildings
  if (management?.player && s.management?.player && s.playerTeamId) {
    const b = s.management.dev[s.playerTeamId];
    const a = management.dev[s.playerTeamId];
    const fb = s.management.player.facilities;
    const fa = management.player.facilities;
    const done = (Object.keys(fa) as (keyof typeof fa)[]).find((k) => fa[k] > fb[k]);
    news = [
      ...news,
      ...playerDevNews({
        season: s.season,
        round,
        teamId: s.playerTeamId,
        before: b,
        after: a,
        facility: done ? { label: FACILITY_INFO[done].label, level: fa[done] } : null,
        paceBefore: carPace(b),
        paceAfter: carPace(a),
        look,
      }),
    ];
  }
  // now and then a rival has its own big event
  if (management) {
    const ev = rivalEvent(s.teamsData, s.playerTeamId, randomSeed());
    if (ev && management.dev[ev.teamId]) {
      const d = management.dev[ev.teamId];
      const dev = { ...management.dev, [ev.teamId]: { ...d, [ev.area]: Math.max(60, Math.min(99.5, +(d[ev.area] + ev.delta).toFixed(2))) } };
      // the change shows up in this round's point of the development chart
      const history = management.history.map((h) => (h.round === round ? { ...h, dev: structuredClone(dev) } : h));
      management = { ...management, dev, history };
      const AREA_ES = { aero: "aerodinámica", powerUnit: "unidad de potencia", chassis: "chasis", reliability: "fiabilidad", pitCrew: "pit crew" } as const;
      news.push({
        id: `${s.season}-${round}-rival-${ev.teamId}`,
        season: s.season,
        round,
        kind: "development",
        title: ev.title,
        summary: `${ev.text} (${AREA_ES[ev.area]} ${ev.delta > 0 ? "+" : ""}${ev.delta.toFixed(1)})`,
        body: [ev.text, `Efecto: ${AREA_ES[ev.area]} ${ev.delta > 0 ? "+" : ""}${ev.delta.toFixed(1)} para ${look.team(ev.teamId)?.name}.`],
        teamIds: [ev.teamId],
        color: look.team(ev.teamId)?.hex,
        importance: 1,
        chart: { type: "dev", teamIds: s.playerTeamId ? [ev.teamId, s.playerTeamId] : [ev.teamId], metric: "pace" },
      });
    }
  }
  // AI teams close deals for next season during the year
  let people = s.people;
  if (people && management && [8, 12, 16, 20].includes(round)) {
    const ranks = Object.fromEntries(Object.keys(management.dev).map((id) => [id, carRankOf(management!, id)]));
    const mk = midSeasonMarket(people, s.teamsData, s.playerTeamId, ranks, randomSeed());
    people = mk.people;
    for (const d of Object.values(people.drivers)) {
      if (d.status !== "active" || !willRetire(d, s.season)) continue;
      const id = `${s.season}-retire-${d.id}`;
      if (s.news.some((x) => x.id === id) || news.some((x) => x.id === id)) continue;
      const tm = d.contract ? look.team(d.contract.teamId) : null;
      news.push({
        id,
        season: s.season,
        round,
        kind: "market",
        title: `${d.name} anuncia que se retirará al final de ${s.season}`,
        summary: `A los ${ageOf(d, s.season)} años, ${d.name} pone fecha a su despedida de la Fórmula 1${tm ? ` y deja libre un asiento en ${tm.name}` : ""}.`,
        body: [
          `${d.name} confirmó que ${s.season} será su última temporada en la Fórmula 1.`,
          ...(d.contract?.teamId === s.playerTeamId ? ["Es uno de tus pilotos: no aceptará renovar, tendrás que buscar reemplazo."] : []),
        ],
        teamIds: d.contract ? [d.contract.teamId] : [],
        color: tm?.hex,
        mine: d.contract?.teamId === s.playerTeamId,
        importance: 2,
      });
    }
    for (const mv of mk.moves.slice(0, 4)) {
      const d = people.drivers[mv.driverId];
      const to = look.team(mv.teamId)?.name ?? mv.teamId;
      const from = mv.fromTeamId ? look.team(mv.fromTeamId)?.name : null;
      news.push(
        marketNews({
          season: s.season,
          round,
          id: `${mv.kind}-${mv.driverId}`,
          teamId: mv.teamId,
          look,
          title: mv.kind === "renew" ? `${d.name} renueva con ${to} hasta ${mv.until}` : `Bombazo: ${to} ficha a ${d.name} para ${s.season + 1}`,
          summary:
            mv.kind === "renew"
              ? `Contrato hasta ${mv.until} por unos US$ ${mv.salary.toFixed(1)} M al año.`
              : `${d.name}${from ? ` deja ${from}` : d.status === "junior" ? " da el salto desde la Fórmula 2" : " vuelve a la parrilla"} y firma hasta ${mv.until}.`,
          body: [
            mv.kind === "renew"
              ? `${to} aseguró la continuidad de ${d.name} hasta ${mv.until}.`
              : `${to} cerró el fichaje de ${d.name} para la próxima temporada${from ? `: deja ${from} al final del año` : ""}.`,
            `Salario estimado: US$ ${mv.salary.toFixed(1)} M por año. Ritmo actual ${d.pace.toFixed(0)}.`,
            ...(mv.fromTeamId === s.playerTeamId ? [`Es uno de tus pilotos: tendrás que buscar reemplazo.`] : []),
          ],
        }),
      );
    }
    if (mk.moves.length && management) {
      management = {
        ...management,
        inbox: [...management.inbox, { race: round, tone: "info" as const, text: `Mercado: ${mk.moves.length} movimiento(s) de otros equipos para ${s.season + 1}. Revisa Noticias.` }].slice(-60),
      };
    }
  }
  const resolvedNow = proposals.filter((p) => p.status !== "pending" && s.proposals.find((q) => q.id === p.id)?.status === "pending");
  news = [...news, ...resolvedNow.map((p) => ruleNews(p, round, s)), ...fresh.map((p) => ruleNews(p, round, s))];
  // sprint weekends of next season are announced near the end of the year
  let nextSprints = s.nextSprints;
  if (!nextSprints && round === calendar().length - 4) {
    const nextCal = calendarFor(s.season + 1, calendar(), proposals);
    nextSprints = pickSprints(nextCal, s.sprints, (s.seed ^ (s.season + 1)) >>> 0);
    const names = nextCal.filter((r) => nextSprints!.includes(r.id));
    news.push({
      id: `${s.season + 1}-sprints`,
      season: s.season,
      round,
      kind: "season",
      title: `Anunciadas las carreras sprint de ${s.season + 1}`,
      summary: names.map((r) => r.country).join(", "),
      body: [
        `La F1 confirmó los ${names.length} fines de semana con carrera sprint para ${s.season + 1}: ${names.map((r) => r.name).join(", ")}.`,
        `En esos fines de semana hay clasificación sprint y carrera sprint el sábado (puntos del 1º al 8º), además de la clasificación y el Gran Premio del domingo.`,
      ],
      teamIds: [],
      importance: 2,
    });
  }
  return withAgenda({
    ...s,
    proposals,
    nextSprints,
    news: addNews(s.news, news),
    people,
    results,
    currentRaceIndex: round,
    weekend: null,
    management,
    teamsData: management ? applyDevToTeams(s.teamsData, management) : s.teamsData,
  });
}

export const entriesFromTeams = (teams: Team[]): Entry[] =>
  teams.flatMap((t) => t.drivers.map((driver) => ({ driver, team: teamInfo(t) })));

/** One whole weekend at once (sprint included), with the team managed automatically. */
function simWeekendFull(s0: GameState): GameState {
  if (s0.management && !s0.weekend) {
    const ap = autopilot(s0.management, s0.currentRaceIndex);
    s0 = { ...s0, management: ap.m };
  }
  let s = openWeekend(s0);
  if (!s.weekend) return s0;
  if (inSprint(s.weekend)) {
    s = openSprint(s);
    const sr = s.weekend!.sprint!.race!;
    s = { ...s, weekend: { ...s.weekend!, sprint: { ...s.weekend!.sprint!, race: sr.finished ? sr : simulateToEnd(confirmStrategy(sr)) } } };
    s = finishRaceState(s);
  }
  if (!s.weekend!.race) s = openRace({ ...s, weekend: { ...s.weekend!, qualiRevealed: 3 } });
  const r = s.weekend!.race!;
  s = { ...s, weekend: { ...s.weekend!, qualiRevealed: 3, race: r.finished ? r : simulateToEnd(confirmStrategy(r)) } };
  return finishRaceState(s);
}

export interface SimRun {
  target: number; // race index to stop at (that race is not played)
  from: number;
  stopped?: string;
}

export function useGameState() {
  const [gameState, setGameState] = useState<GameState>(loadState);
  setActiveCalendar(gameState.calendar);
  const stateRef = useRef(gameState);
  stateRef.current = gameState;

  // Simulating ahead: one weekend per tick so the screen can show progress
  const [simRun, setSimRun] = useState<SimRun | null>(null);
  useEffect(() => {
    if (!simRun || simRun.stopped) return;
    const s = stateRef.current;
    if (s.currentRaceIndex >= simRun.target || s.currentRaceIndex >= calendar().length) {
      setSimRun(null);
      return;
    }
    if (missingSeats(s)) {
      setSimRun({ ...simRun, stopped: "Te falta un piloto: ficha a alguien para seguir." });
      return;
    }
    const id = window.setTimeout(
      () =>
        setGameState((cur) => {
          const n = simWeekendFull(cur);
          if (n.currentRaceIndex === cur.currentRaceIndex) queueMicrotask(() => setSimRun((r) => r && { ...r, stopped: "No se pudo simular este fin de semana." }));
          return n;
        }),
      40,
    );
    return () => window.clearTimeout(id);
  }, [simRun, gameState.currentRaceIndex]);
  const simulateTo = useCallback((target: number) => {
    const s = stateRef.current;
    if (target <= s.currentRaceIndex) return;
    setSimRun({ target: Math.min(target, calendar().length), from: s.currentRaceIndex });
  }, []);
  const stopSim = useCallback(() => setSimRun(null), []);

  // Debounced autosave
  const saveTimer = useRef<number>();
  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
      } catch {
        /* storage unavailable: game keeps working in memory */
      }
    }, 400);
  }, [gameState]);

  const standings = useMemo(
    () => computeStandings(gameState.teamsData, gameState.results),
    [gameState.teamsData, gameState.results],
  );

  const entries = useMemo(() => entriesFromTeams(gameState.teamsData), [gameState.teamsData]);
  const entryMap = useMemo(() => new Map(entries.map((e) => [e.driver.id, e])), [entries]);

  const currentRace = calendar()[gameState.currentRaceIndex] ?? null;
  const seasonComplete = gameState.currentRaceIndex >= calendar().length;

  const chooseTeam = useCallback((teamId: string) => {
    setGameState((s) => {
      const people = initPeople(s.teamsData, randomSeed());
      let management = { ...withStaff(initManagement(s.teamsData, teamId, randomSeed()), people), regs: regsOf(s.rules) };
      if (management.player) management = { ...management, player: { ...management.player, salaryFund: totalPayroll(people, teamId) } };
      return withAgenda({
        ...s,
        playerTeamId: teamId,
        management,
        people,
        season: FIRST_SEASON,
        baseTeams: s.teamsData,
        teamsData: applyLineups(applyDevToTeams(s.teamsData, management), people),
      });
    });
  }, []);

  const startProject = useCallback((templateId: string) => {
    setGameState((s) => (s.management ? { ...s, management: startProjectFn(s.management, templateId, s.currentRaceIndex) } : s));
  }, []);

  const signSponsor = useCallback((offerId: string) => {
    setGameState((s) => (s.management ? { ...s, management: signSponsorFn(s.management, offerId, s.currentRaceIndex) } : s));
  }, []);

  const upgradeFacility = useCallback((key: FacilityKey) => {
    setGameState((s) => (s.management ? { ...s, management: upgradeFacilityFn(s.management, key, s.currentRaceIndex) } : s));
  }, []);

  // --- People ------------------------------------------------------------------

  /** Offer a contract for next season. Returns the driver's answer. */
  /** One offer to a driver for next season: they accept, counter or walk away. */
  const offerContract = useCallback((driverId: string, salary: number, years: number): NegotiationAnswer => {
    const s = stateRef.current;
    if (!s.people || !s.management || !s.playerTeamId) return { ok: false, message: "No disponible", result: "reject" };
    const tp = teamStaff(s.people, s.playerTeamId).tp?.rating ?? 80;
    const r = offerDriverContract(s.people, driverId, s.playerTeamId, salary, years, carRankOf(s.management, s.playerTeamId), tp, s.currentRaceIndex + 1);
    const talks = r.people.talks;
    setGameState((cur) => {
      if (!cur.people || !cur.management) return cur;
      const people = { ...cur.people, talks, drivers: r.ok ? { ...cur.people.drivers, [driverId]: r.people.drivers[driverId] } : cur.people.drivers };
      if (!r.ok) return { ...cur, people };
      const now = people.drivers[driverId].contract?.teamId === s.playerTeamId && !cur.people.drivers[driverId].contract;
      return {
        ...cur,
        people,
        teamsData: now ? applyLineups(cur.teamsData, people) : cur.teamsData,
        management: { ...cur.management, inbox: [...cur.management.inbox, { race: cur.currentRaceIndex, tone: "good" as const, text: r.message }].slice(-60) },
        news: addNews(cur.news, [
          marketNews({
            season: cur.season,
            round: cur.currentRaceIndex,
            id: `player-${driverId}`,
            teamId: s.playerTeamId!,
            mine: true,
            look: lookupOf(cur),
            title: `Oficial: ${r.people.drivers[driverId].name} firma con ${lookupOf(cur).team(s.playerTeamId!)?.name}`,
            summary: r.message,
            body: [r.message, `Ritmo actual ${r.people.drivers[driverId].pace.toFixed(0)}.`],
          }),
        ]),
      };
    });
    return { ok: r.ok, message: r.message, result: r.result ?? (r.ok ? "accept" : "reject"), counter: r.counter };
  }, []);

  const releaseDriver = useCallback((driverId: string) => {
    setGameState((s) => (s.people ? { ...s, people: releaseAtSeasonEnd(s.people, driverId) } : s));
  }, []);

  /** Negotiate with someone on the staff market; on agreement they join right away. */
  const hireStaff = useCallback((staffId: string, salary: number, years: number): NegotiationAnswer => {
    const s = stateRef.current;
    if (!s.people || !s.management || !s.playerTeamId) return { ok: false, message: "No disponible", result: "reject" };
    const r = offerStaffContract(s.people, staffId, s.playerTeamId, salary, years, s.currentRaceIndex + 1);
    if (r.result === "accept" && (s.management.player?.budget ?? 0) < r.cost) {
      return { ok: false, message: `Aceptaría, pero no tienes presupuesto para la prima de firma (US$ ${r.cost.toFixed(1)} M).`, result: "reject" };
    }
    setGameState((cur) => {
      if (!cur.people || !cur.management || !cur.playerTeamId) return cur;
      if (r.result !== "accept") return { ...cur, people: { ...cur.people, talks: r.people.talks } };
      const m = chargePlayer(withStaff(cur.management, r.people), cur.currentRaceIndex, `Contratación: ${r.people.staff[staffId].name}`, -r.cost, "transfers", r.message);
      const n = marketNews({
        season: cur.season,
        round: cur.currentRaceIndex,
        id: `staff-${staffId}`,
        teamId: cur.playerTeamId,
        mine: true,
        look: lookupOf(cur),
        title: r.people.staff[staffId].signed
          ? `${lookupOf(cur).team(cur.playerTeamId)?.name} ficha a ${r.people.staff[staffId].name} para ${cur.season + 1}`
          : `${lookupOf(cur).team(cur.playerTeamId)?.name} contrata a ${r.people.staff[staffId].name}`,
        summary: r.message,
        body: [r.message, `Sueldo US$ ${salary.toFixed(1)} M/año. Prima de firma: US$ ${r.cost.toFixed(1)} M.`],
      });
      return { ...cur, people: r.people, management: m, news: addNews(cur.news, [n]) };
    });
    return { ok: r.result === "accept", message: r.message, result: r.result, counter: r.counter };
  }, []);

  const fireStaff = useCallback((staffId: string) => {
    setGameState((s) => {
      if (!s.people || !s.management) return s;
      const r = fireStaffFn(s.people, staffId);
      if (r.people === s.people) return s;
      const m = chargePlayer(withStaff(s.management, r.people), s.currentRaceIndex, `Despido: ${s.people.staff[staffId].name}`, -r.cost, "transfers", r.message);
      return { ...s, people: r.people, management: m };
    });
  }, []);

  const renewStaff = useCallback((staffId: string, salary: number, years: number): NegotiationAnswer => {
    const s = stateRef.current;
    if (!s.people || !s.management) return { ok: false, message: "No disponible", result: "reject" };
    const r = offerStaffRenewal(s.people, staffId, salary, years, s.currentRaceIndex + 1);
    setGameState((cur) => {
      if (!cur.people || !cur.management) return cur;
      if (r.result !== "accept") return { ...cur, people: { ...cur.people, talks: r.people.talks } };
      const m = cur.management;
      return {
        ...cur,
        people: { ...cur.people, talks: r.people.talks, staff: { ...cur.people.staff, [staffId]: r.people.staff[staffId] } },
        management: { ...withStaff(m, r.people), inbox: [...m.inbox, { race: cur.currentRaceIndex, tone: "good" as const, text: r.message }].slice(-60) },
      };
    });
    return { ok: r.result === "accept", message: r.message, result: r.result, counter: r.counter };
  }, []);

  const castVote = useCallback((proposalId: string, vote: Vote) => {
    setGameState((s) => ({
      ...s,
      proposals: s.proposals.map((p) =>
        p.id === proposalId && p.status === "pending" ? resolveVote(p, teamContexts(s), s.playerTeamId, vote, randomSeed()) : p,
      ),
    }));
    setGameState((s) => {
      const p = s.proposals.find((x) => x.id === proposalId);
      return p && p.status !== "pending" ? { ...s, news: addNews(s.news, [ruleNews(p, s.currentRaceIndex, s)]) } : s;
    });
  }, []);

  // --- Race weekend ------------------------------------------------------------

  const startWeekend = useCallback(() => setGameState(openWeekend), []);

  const chooseActivity = useCallback((id: string, idx: number) => setGameState((s) => applyActivity(s, id, idx)), []);

  /** Quick weekend: qualifying and race simulated at once with the engineers' strategy. */
  const quickSimWeekend = useCallback(() => {
    setGameState((s0) => {
      let s = openWeekend(s0);
      if (!s.weekend) return s0;
      if (inSprint(s.weekend)) {
        s = openSprint(s);
        const sr = s.weekend!.sprint!.race!;
        s = { ...s, weekend: { ...s.weekend!, sprint: { ...s.weekend!.sprint!, race: sr.finished ? sr : simulateToEnd(confirmStrategy(sr)) } } };
        s = finishRaceState(s);
      }
      if (!s.weekend!.race) s = openRace({ ...s, weekend: { ...s.weekend!, qualiRevealed: 3 } });
      const r = s.weekend!.race!;
      return { ...s, weekend: { ...s.weekend!, qualiRevealed: 3, race: r.finished ? r : simulateToEnd(confirmStrategy(r)) } };
    });
  }, []);

  const revealSession = useCallback((all = false) => {
    setGameState((s) => {
      const w = s.weekend;
      if (!w) return s;
      if (inSprint(w)) {
        const sp = w.sprint!;
        return { ...s, weekend: { ...w, sprint: { ...sp, qualiRevealed: all ? 3 : Math.min(3, sp.qualiRevealed + 1) } } };
      }
      return { ...s, weekend: { ...w, qualiRevealed: all ? 3 : Math.min(3, w.qualiRevealed + 1) } };
    });
  }, []);

  const startRace = useCallback(() => setGameState(openRace), []);

  const updateRace = useCallback((race: RaceState) => {
    setGameState((s) =>
      !s.weekend ? s : inSprint(s.weekend) ? { ...s, weekend: { ...s.weekend, sprint: { ...s.weekend.sprint!, race } } } : { ...s, weekend: { ...s.weekend, race } },
    );
  }, []);

  const finishRace = useCallback(() => setGameState(finishRaceState), []);

  /** Close the season and start the next one (contracts, ageing, retirements, prize money). */
  const startNextSeason = useCallback(() => {
    setGameState((s) => {
      if (s.currentRaceIndex < calendar().length || !s.management || !s.people) return s;
      const st = computeStandings(s.teamsData, s.results);
      const order = st.teams.map((t) => t.teamId);
      const carRanks = Object.fromEntries(Object.keys(s.management.dev).map((id) => [id, carRankOf(s.management!, id)]));
      const proposals = s.proposals.map((p) =>
        p.status === "pending" ? resolveVote(p, teamContexts(s), s.playerTeamId, "abstain", randomSeed()) : p,
      );
      const rules = rulesFor(s.season + 1, s.rules, proposals);
      // archive the season that ends, then build next year's calendar (and its sprint weekends)
      const archive = [
        ...s.archive,
        { season: s.season, calendar: calendar().map((r) => ({ id: r.id, name: r.name, flag: r.flag, country: r.country })), teams: s.teamsData, results: s.results },
      ].slice(-12);
      const newCal = datesForSeason(calendarFor(s.season + 1, calendar(), proposals), s.season + 1);
      const sprints = pickSprints(newCal, s.nextSprints ?? s.sprints, s.seed ^ s.season);
      setActiveCalendar(newCal);
      // pending work in the factory is finished during the winter
      const off = completeOffSeason(s.management, randomSeed());
      s = { ...s, management: off.m };
      // how each driver did against the team-mate shapes next year's development
      const form: Record<string, number> = {};
      for (const t of s.teamsData) {
        const rows = t.drivers.map((d) => st.drivers.find((x) => x.driverId === d.id)?.points ?? 0);
        t.drivers.forEach((d, i) => {
          const mate = rows[1 - i] ?? rows[i];
          form[d.id] = ((rows[i] - mate) / Math.max(20, rows[i] + mate)) * 2;
        });
      }
      const adv = advanceSeason({ ...s.people, salaryCap: rules.salaryCap }, s.teamsData, s.playerTeamId, carRanks, form);
      const news = adv.news;
      let people = adv.people;
      if (rules.salaryCap) {
        const cap = rules.salaryCap;
        const clip = (c: typeof people.drivers[string]["contract"]) => (c && c.salary > cap ? { ...c, salary: cap } : c);
        people = {
          ...people,
          drivers: Object.fromEntries(Object.entries(people.drivers).map(([id, d]) => [id, { ...d, contract: clip(d.contract), nextContract: clip(d.nextContract) }])),
        };
      }
      let management: ManagementState = { ...withStaff(startNewSeason(s.management, s.teamsData, order, people.season), people), regs: regsOf(rules) };
      const changes = proposals.filter((p) => p.effective === people.season && (p.status === "approved" || p.status === "decreed"));
      if (changes.length) {
        management = {
          ...management,
          inbox: [...management.inbox, { race: 0, tone: "info" as const, text: `Reglamento ${people.season}: ${changes.map((p) => p.title).join(" · ")}.` }].slice(-60),
        };
      }
      // technical rules and a new budget cap change the cars right away
      const effects = techChanges(people.season, proposals);
      const newCap = !!rules.budgetCap && (s.rules.budgetCap === null || rules.budgetCap < s.rules.budgetCap);
      const reg = applyRegulationImpact(management, effects, newCap, randomSeed());
      management = reg.m;
      const regNews: string[] = [];
      if (effects.length || newCap) {
        const fmt = (d: Record<string, number | undefined>) =>
          Object.entries(d)
            .map(([a, v]) => `${AREA_INFO[a as "aero"].label} ${v! >= 0 ? "+" : ""}${v!.toFixed(1)}`)
            .join(" · ");
        const nameOf = (id: string) => s.teamsData.find((t) => t.id === id)?.name ?? id;
        const total = (id: string) => Object.values(reg.impact[id] ?? {}).reduce((a, v) => a + (v ?? 0), 0);
        const ranked = Object.keys(reg.impact).sort((a, b) => total(b) - total(a));
        if (s.playerTeamId && reg.impact[s.playerTeamId]) {
          const text = `Impacto del nuevo reglamento en tu auto: ${fmt(reg.impact[s.playerTeamId])}.`;
          regNews.push(`Tu equipo: ${text}`);
          management = {
            ...management,
            inbox: [...management.inbox, { race: 0, tone: total(s.playerTeamId) >= 0 ? ("good" as const) : ("bad" as const), text }].slice(-60),
          };
        }
        if (ranked.length) {
          regNews.push(`Nuevo reglamento: ${nameOf(ranked[0])} es quien más gana (${total(ranked[0]) >= 0 ? "+" : ""}${total(ranked[0]).toFixed(1)}) y ${nameOf(ranked[ranked.length - 1])} quien más pierde (${total(ranked[ranked.length - 1]).toFixed(1)}).`);
        }
      }
      const mine = news.filter((n) => n.startsWith("Tu equipo"));
      if (mine.length) {
        management = { ...management, inbox: [...management.inbox, ...mine.map((text) => ({ race: 0, tone: "info" as const, text }))].slice(-60) };
      }
      const regImpactRows = Object.entries(reg.impact).map(([id, d]) => ({
        label: s.teamsData.find((t) => t.id === id)?.name ?? id,
        color: s.teamsData.find((t) => t.id === id)?.hex ?? "#888",
        value: +Object.values(d).reduce((a, v) => a + (v ?? 0), 0).toFixed(2),
        mine: id === s.playerTeamId,
      }));
      const champ = st.drivers[0];
      const myTeam = st.teams.find((t) => t.teamId === s.playerTeamId);
      const summary: SeasonSummary = {
        season: s.season,
        driverChampion: { name: champ?.driverName ?? "—", team: champ?.teamName ?? "" },
        constructorChampion: st.teams[0]?.teamName ?? "—",
        playerPos: order.indexOf(s.playerTeamId ?? "") + 1,
        playerPoints: myTeam?.points ?? 0,
        playerWins: myTeam?.wins ?? 0,
      };
      return withAgenda({
        ...s,
        season: people.season,
        people,
        management,
        teamsData: applyLineups(applyDevToTeams(s.teamsData, management), people),
        results: [],
        currentRaceIndex: 0,
        weekend: null,
        pastSeasons: [...s.pastSeasons, summary],
        rules,
        proposals,
        archive,
        calendar: newCal,
        sprints,
        nextSprints: undefined,
        seasonNews: [...regNews, ...news].filter((n) => n.startsWith("Tu equipo")),
        news: addNews(s.news, [
          ...seasonStories(s, people.season, summary, regImpactRows, news, proposals),
          {
            id: `${people.season}-calendar`,
            season: people.season,
            round: 0,
            kind: "season",
            title: `Calendario ${people.season}: ${newCal.length} Grandes Premios y ${sprints.length} sprints`,
            summary: `Sprints en ${newCal.filter((r) => sprints.includes(r.id)).map((r) => r.country).join(", ")}.`,
            body: [
              `La temporada ${people.season} tiene ${newCal.length} carreras: de ${newCal[0]?.name} a ${newCal[newCal.length - 1]?.name}.`,
              `Fines de semana sprint: ${newCal.filter((r) => sprints.includes(r.id)).map((r) => r.name).join(", ")}.`,
              ...(off.done.length ? [`Tu equipo terminó en el invierno: ${off.done.join("; ")}.`] : []),
            ],
            teamIds: [],
            importance: 2,
          },
        ]),
      });
    });
  }, []);

  const resetSeason = useCallback(() => {
    setGameState((s) => initialState(s.baseTeams ?? s.teamsData, s.simConfig));
  }, []);

  const updateSimConfig = useCallback((simConfig: SimConfig) => {
    setGameState((s) => ({ ...s, simConfig }));
  }, []);

  const updateTeamsData = useCallback((teamsData: Team[]) => {
    setGameState((s) => {
      if (!s.management) return { ...s, teamsData };
      // manual edits in Config override the development ratings of the edited teams
      const dev = { ...s.management.dev };
      for (const t of teamsData) {
        const old = s.teamsData.find((o) => o.id === t.id);
        const d = dev[t.id];
        if (!old || !d) continue;
        const dp = t.pace - old.pace;
        dev[t.id] = {
          aero: d.aero + dp,
          powerUnit: d.powerUnit + dp,
          chassis: d.chassis + dp,
          reliability: t.reliability,
          pitCrew: t.pitCrew,
        };
      }
      const management = { ...s.management, dev };
      return { ...s, management, teamsData: applyDevToTeams(teamsData, management) };
    });
  }, []);

  return {
    gameState,
    standings,
    entries,
    entryMap,
    currentRace,
    seasonComplete,
    races: gameState.calendar,
    chooseTeam,
    startWeekend,
    quickSimWeekend,
    simulateTo,
    stopSim,
    simRun,
    chooseActivity,
    revealSession,
    startRace,
    updateRace,
    finishRace,
    startNextSeason,
    resetSeason,
    updateSimConfig,
    updateTeamsData,
    startProject,
    upgradeFacility,
    signSponsor,
    offerContract,
    releaseDriver,
    hireStaff,
    castVote,
    fireStaff,
    renewStaff,
  };
}
