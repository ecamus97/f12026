import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { races2026, teams as defaultTeams, teamInfo, type Team } from "@/data/f1Data";
import {
  classify,
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
  offerDriverContract,
  releaseAtSeasonEnd,
  hireStaff as hireStaffFn,
  teamStaff,
  lineup,
  type PeopleState,
  migrateStaff,
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
  raceNews,
  developmentNews,
  carPace,
  type NewsItem,
  type NewsLookup,
  applyRegulationImpact,
  AREA_INFO,
} from "@/engine";

const STORAGE_KEY = "f1-manager-2026-v2";

export interface Weekend {
  raceIndex: number;
  quali: QualifyingResult;
  qualiRevealed: number; // sessions shown to the player (0-3)
  race: RaceState | null;
  weather?: WeatherTimeline; // Sunday's real weather (the player only sees the forecast)
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
  seed: number; // career seed: makes each weekend's weather fixed (paddock, qualifying and race agree)
}

/** The weather of a weekend is decided in advance so every forecast is consistent. */
export function weekendWeather(s: Pick<GameState, "seed" | "season">, raceIndex: number) {
  const race = races2026[raceIndex];
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
    if (!Array.isArray(parsed.news)) state.news = [];
    // saves from before team management existed
    if (state.playerTeamId && !state.management) {
      state.management = initManagement(state.teamsData, state.playerTeamId, randomSeed());
      state.baseTeams = state.teamsData;
    }
    // saves from before contracts and staff existed
    if (state.playerTeamId && !state.people) state.people = initPeople(state.teamsData, randomSeed());
    if (state.people) state.people = migrateStaff(state.people);
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
    return state;
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
  const transfers = market.filter((n) => /ficha|se cambia|debuta|retiro|se retira/.test(n));
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

export const entriesFromTeams = (teams: Team[]): Entry[] =>
  teams.flatMap((t) => t.drivers.map((driver) => ({ driver, team: teamInfo(t) })));

export function useGameState() {
  const [gameState, setGameState] = useState<GameState>(loadState);
  const stateRef = useRef(gameState);
  stateRef.current = gameState;

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

  const currentRace = races2026[gameState.currentRaceIndex] ?? null;
  const seasonComplete = gameState.currentRaceIndex >= races2026.length;

  const chooseTeam = useCallback((teamId: string) => {
    setGameState((s) => {
      const people = initPeople(s.teamsData, randomSeed());
      let management = { ...withStaff(initManagement(s.teamsData, teamId, randomSeed()), people), regs: regsOf(s.rules) };
      if (management.player) management = { ...management, player: { ...management.player, salaryFund: totalPayroll(people, teamId) } };
      return {
        ...s,
        playerTeamId: teamId,
        management,
        people,
        season: FIRST_SEASON,
        baseTeams: s.teamsData,
        teamsData: applyLineups(applyDevToTeams(s.teamsData, management), people),
      };
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
  const offerContract = useCallback((driverId: string, salary: number, years: number): { ok: boolean; message: string } => {
    const s = stateRef.current;
    if (!s.people || !s.management || !s.playerTeamId) return { ok: false, message: "No disponible" };
    const tp = teamStaff(s.people, s.playerTeamId).tp?.rating ?? 80;
    const r = offerDriverContract(s.people, driverId, s.playerTeamId, salary, years, carRankOf(s.management, s.playerTeamId), tp);
    if (r.ok) {
      setGameState((cur) =>
        cur.people && cur.management
          ? {
              ...cur,
              people: { ...cur.people, drivers: { ...cur.people.drivers, [driverId]: r.people.drivers[driverId] } },
              management: { ...cur.management, inbox: [...cur.management.inbox, { race: cur.currentRaceIndex, tone: "good" as const, text: r.message }].slice(-60) },
            }
          : cur,
      );
    }
    return { ok: r.ok, message: r.message };
  }, []);

  const releaseDriver = useCallback((driverId: string) => {
    setGameState((s) => (s.people ? { ...s, people: releaseAtSeasonEnd(s.people, driverId) } : s));
  }, []);

  const hireStaff = useCallback((staffId: string) => {
    setGameState((s) => {
      if (!s.people || !s.management || !s.playerTeamId) return s;
      const r = hireStaffFn(s.people, staffId, s.playerTeamId);
      if (!r.cost && r.people === s.people) return s;
      const m = chargePlayer(withStaff(s.management, r.people), s.currentRaceIndex, `Contratación: ${r.people.staff[staffId].name}`, -r.cost, "transfers", r.message);
      return { ...s, people: r.people, management: m };
    });
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

  const renewStaff = useCallback((staffId: string) => {
    setGameState((s) => {
      if (!s.people || !s.management) return s;
      const r = renewStaffFn(s.people, staffId);
      const m = s.management;
      return { ...s, people: r.people, management: { ...m, inbox: [...m.inbox, { race: s.currentRaceIndex, tone: "good" as const, text: r.message }].slice(-60) } };
    });
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

  const startWeekend = useCallback(() => {
    setGameState((s) => {
      const race = races2026[s.currentRaceIndex];
      if (!race) return s;
      if (s.weekend?.raceIndex === s.currentRaceIndex) return s; // resume
      const weather = weekendWeather(s, s.currentRaceIndex)!;
      const quali = runQualifying(race, entriesFromTeams(s.teamsData), randomSeed(), s.simConfig, weather.qualiWet);
      return { ...s, weekend: { raceIndex: s.currentRaceIndex, quali, qualiRevealed: 0, race: null, weather } };
    });
  }, []);

  const revealSession = useCallback((all = false) => {
    setGameState((s) =>
      s.weekend
        ? { ...s, weekend: { ...s.weekend, qualiRevealed: all ? 3 : Math.min(3, s.weekend.qualiRevealed + 1) } }
        : s,
    );
  }, []);

  const startRace = useCallback(() => {
    setGameState((s) => {
      const w = s.weekend;
      if (!w || w.race) return s;
      const race = races2026[w.raceIndex];
      const map = new Map(entriesFromTeams(s.teamsData).map((e) => [e.driver.id, e]));
      const grid = w.quali.grid.map((id) => map.get(id)).filter((e): e is Entry => !!e);
      const r = s.rules;
      const raceForRules = r.highDegTyres ? { ...race, track: { ...race.track, deg: +(race.track.deg * 1.2).toFixed(2) } } : race;
      const rs = createRace(raceForRules, grid, randomSeed(), s.simConfig, s.playerTeamId, w.weather);
      rs.rules = { twoCompound: r.twoCompound, overtakeAid: r.overtakeAid, points: POINTS_TABLES[r.points], fastestLapPoint: r.fastestLapPoint };
      return { ...s, weekend: { ...w, race: rs } };
    });
  }, []);

  const updateRace = useCallback((race: RaceState) => {
    setGameState((s) => (s.weekend ? { ...s, weekend: { ...s.weekend, race } } : s));
  }, []);

  const finishRace = useCallback(() => {
    setGameState((s) => {
      const w = s.weekend;
      if (!w?.race?.finished) return s;
      const result: StoredRaceResult = {
        raceId: races2026[w.raceIndex].id,
        rows: classify(w.race),
        pole: w.quali.grid[0],
        fastestLap: w.race.fastest ? { driverId: w.race.fastest.driverId, time: w.race.fastest.time } : null,
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
      const fresh = generateProposals(s.season, round, rulesFor(s.season + 1, s.rules, proposals), proposals, randomSeed());
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
      const raceInfo = races2026[w.raceIndex];
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
        playerTeamId: s.playerTeamId,
        look,
      });
      if (management) {
        const h = management.history;
        const prev = h.find((x) => x.round === round - 1);
        const cur = h.find((x) => x.round === round);
        if (prev && cur) {
          const pace = (d: Record<string, import("@/engine").CarDev>) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, carPace(v)]));
          news = [...news, ...developmentNews({ season: s.season, round, before: pace(prev.dev), after: pace(cur.dev), playerTeamId: s.playerTeamId, look })];
        }
      }
      const resolvedNow = proposals.filter((p) => p.status !== "pending" && s.proposals.find((q) => q.id === p.id)?.status === "pending");
      news = [...news, ...resolvedNow.map((p) => ruleNews(p, round, s)), ...fresh.map((p) => ruleNews(p, round, s))];
      return {
        ...s,
        proposals,
        news: addNews(s.news, news),
        results,
        currentRaceIndex: round,
        weekend: null,
        management,
        teamsData: management ? applyDevToTeams(s.teamsData, management) : s.teamsData,
      };
    });
  }, []);

  /** Close the season and start the next one (contracts, ageing, retirements, prize money). */
  const startNextSeason = useCallback(() => {
    setGameState((s) => {
      if (s.currentRaceIndex < races2026.length || !s.management || !s.people) return s;
      const st = computeStandings(s.teamsData, s.results);
      const order = st.teams.map((t) => t.teamId);
      const carRanks = Object.fromEntries(Object.keys(s.management.dev).map((id) => [id, carRankOf(s.management!, id)]));
      const proposals = s.proposals.map((p) =>
        p.status === "pending" ? resolveVote(p, teamContexts(s), s.playerTeamId, "abstain", randomSeed()) : p,
      );
      const rules = rulesFor(s.season + 1, s.rules, proposals);
      const adv = advanceSeason({ ...s.people, salaryCap: rules.salaryCap }, s.teamsData, s.playerTeamId, carRanks);
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
      return {
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
        seasonNews: [...regNews, ...news],
        news: addNews(s.news, seasonStories(s, people.season, summary, regImpactRows, news, proposals)),
      };
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
    races: races2026,
    chooseTeam,
    startWeekend,
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
