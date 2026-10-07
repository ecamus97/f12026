// Drivers and staff over the years: contracts, salaries, the market, ageing and retirements.
import type { Driver, Team } from "@/data/f1Data";
import {
  EXTRA_DRIVERS, GRID_BIOS, STAFF, STAFF_ROLES, STAFF_ROLE_INFO,
  type StaffRole,
} from "@/data/peopleData";
import { createRng, type Rng } from "./rng";
import { F1_EXPERIENCE, F2_SEASONS, F2_TEAMS, F3_TEAMS, nameFor, pickNationality } from "@/data/names";

export const FIRST_SEASON = 2026;

export interface Contract {
  teamId: string;
  salary: number; // M USD per season
  until: number; // last season (inclusive)
}

export type DriverStatus = "active" | "free" | "junior" | "retired";
export type Series = "F2" | "F3" | "Fórmula E" | "IndyCar" | "WEC" | "NASCAR" | "Super Formula";

/** Other championships drivers go to when there's no F1 seat. */
export const OTHER_SERIES: Record<Exclude<Series, "F2" | "F3">, string[]> = {
  "Fórmula E": ["Jaguar", "Porsche", "Nissan", "DS Penske", "Mahindra", "Envision", "Andretti", "Maserati", "Lola Yamaha", "Cupra Kiro"],
  IndyCar: ["Penske", "Chip Ganassi", "Andretti", "Arrow McLaren", "Rahal Letterman Lanigan", "Meyer Shank"],
  WEC: ["Ferrari AF Corse", "Toyota Gazoo Racing", "Porsche Penske", "Cadillac", "BMW", "Alpine", "Peugeot", "Aston Martin"],
  NASCAR: ["Hendrick Motorsports", "Joe Gibbs Racing", "Team Penske", "Trackhouse Racing", "23XI Racing"],
  "Super Formula": ["Team Impul", "TOM'S", "Dandelion", "Nakajima Racing"],
};

/** Where a driver is right now, in one standard format. */
export function whereIs(d: DriverRecord, teamName: (id: string) => string | undefined): string {
  if (d.status === "retired") return "Retirado";
  if (d.status === "active" && d.contract) return `F1 · ${teamName(d.contract.teamId) ?? d.contract.teamId}`;
  if (d.reserveOf) return `Reserva F1 · ${teamName(d.reserveOf) ?? d.reserveOf}`;
  if (d.series) return `${d.series}${d.juniorTeam ? ` · ${d.juniorTeam}` : ""}`;
  return "Sin equipo";
}

export interface DriverRecord extends Driver {
  birthYear: number;
  potential: number;
  contract: Contract | null; // current contract
  nextContract: Contract | null; // signed for the following season
  status: DriverStatus;
  origin?: string;
  f1Seasons?: number; // seasons raced in F1
  series?: Series; // where they race when not in F1 (juniors: F2/F3)
  juniorTeam?: string; // team in that series
  reserveOf?: string | null; // F1 team they are reserve/test driver for
  reserveSalary?: number;
  reserveUntil?: number;
  seriesSeasons?: number; // juniors: seasons in the current series
  mods?: { stat: string; delta: number; label: string; season: number }[]; // recent changes from events
  morale?: number; // 0-100 (65 = neutral)
  formLog?: import("./mood").FormEntry[]; // last Grand Prix results against expectations
}

export interface StaffRecord {
  id: string;
  name: string;
  role: StaffRole;
  rating: number;
  nationality: string;
  teamId: string | null;
  salary: number;
  until?: number; // last season of the contract
  fictional?: boolean;
  birthYear?: number;
  retired?: boolean;
  /** Signed to replace someone: joins this team when the season ends. */
  signed?: { teamId: string; until: number; salary: number } | null;
}

export interface PeopleState {
  version: 1;
  season: number;
  drivers: Record<string, DriverRecord>;
  staff: Record<string, StaffRecord>;
  rngState: number;
  nextJunior: number;
  salaryCap?: number | null; // regulation: max salary per driver
  talks?: Record<string, Talk>; // ongoing negotiations ("d:<id>" drivers, "s:<id>" staff)
}

// --- Negotiations -----------------------------------------------------------------

export type TalkResult = "accept" | "counter" | "reject" | "walkout" | "locked";

export interface TalkEntry {
  round: number;
  salary: number;
  years: number;
  result: TalkResult;
  counter?: number;
  msg: string;
}

export interface Talk {
  patience: number;
  maxPatience: number;
  lastCounter: number | null;
  lockedUntil: { season: number; round: number } | null;
  log: TalkEntry[];
}

const hash01 = (str: string) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
};
const r1 = (x: number) => Math.round(x * 10) / 10;

export function talkOf(p: PeopleState, key: string, star = false): Talk {
  const t = p.talks?.[key];
  if (t) return t;
  const max = Math.max(2, 3 + (hash01(key + "pat") < 0.35 ? 1 : 0) - (star ? 1 : 0));
  return { patience: max, maxPatience: max, lastCounter: null, lockedUntil: null, log: [] };
}

export function talkLocked(t: Talk, season: number, round: number) {
  const l = t.lockedUntil;
  return !!l && (season < l.season || (season === l.season && round < l.round));
}

/**
 * One offer in a negotiation. The person has a hidden minimum (around the estimated salary),
 * prefers some contract lengths, answers with a counter-offer and loses patience with low
 * offers: when it runs out, they stop talking for a few races.
 */
export function negotiate(
  p: PeopleState,
  key: string,
  o: { ask: number; salary: number; years: number; age?: number; name: string; round: number; star?: boolean },
): { people: PeopleState; result: TalkResult; counter?: number; message: string } {
  const season = p.season;
  let t = talkOf(p, key, o.star);
  if (talkLocked(t, season, o.round)) {
    return { people: p, result: "locked", message: `${o.name} no quiere negociar contigo hasta la ronda ${t.lockedUntil!.round}.` };
  }
  if (t.lockedUntil) t = { ...t, lockedUntil: null, patience: t.maxPatience, lastCounter: null };
  const reservation = o.ask * (0.84 + hash01(`${key}:${season}`) * 0.16); // never above the estimated salary
  const age = o.age ?? 30;
  const yearsAdj = age >= 33 ? 1 - 0.05 * (o.years - 1) : age <= 24 ? (o.years === 1 ? 0.96 : 1 + 0.02 * (o.years - 1)) : 1;
  const eff = o.salary * yearsAdj;
  const save = (tt: Talk, entry: TalkEntry) => ({ ...p, talks: { ...(p.talks ?? {}), [key]: { ...tt, log: [...tt.log, entry].slice(-8) } } });

  const meetsCounter = t.lastCounter !== null && o.salary >= t.lastCounter - 1e-6;
  if (eff >= reservation - 1e-6 || meetsCounter) {
    const msg = o.salary >= o.ask * 1.15 ? `¡${o.name} acepta encantado!` : `¡Trato hecho! ${o.name} acepta la oferta.`;
    return { people: save({ ...t, lastCounter: null }, { round: o.round, salary: o.salary, years: o.years, result: "accept", msg }), result: "accept", message: msg };
  }
  const ratio = eff / reservation;
  const patience = t.patience - (ratio < 0.7 ? 2 : 1);
  if (patience <= 0) {
    const until = { season, round: o.round + 4 };
    const msg = `${o.name} se cansó de las ofertas: su representante corta las negociaciones hasta la ronda ${until.round}.`;
    return {
      people: save({ ...t, patience: t.maxPatience, lastCounter: null, lockedUntil: until }, { round: o.round, salary: o.salary, years: o.years, result: "walkout", msg }),
      result: "walkout",
      message: msg,
    };
  }
  const base = Math.max(reservation, (t.lastCounter ?? 0) * yearsAdj);
  const counter = r1(Math.ceil(((base * (ratio < 0.7 ? 1.06 : 1)) / yearsAdj) * 10) / 10);
  const msg =
    ratio >= 0.9
      ? `Estamos cerca. ${o.name} firma por US$ ${counter.toFixed(1)} M al año.`
      : ratio >= 0.7
        ? `La oferta está lejos de lo que espera. Su representante pide US$ ${counter.toFixed(1)} M al año.`
        : `${o.name} se siente ofendido por la oferta. Exige US$ ${counter.toFixed(1)} M al año y su paciencia se agota.`;
  const result: TalkResult = ratio >= 0.7 ? "counter" : "reject";
  return {
    people: save({ ...t, patience, lastCounter: counter }, { round: o.round, salary: o.salary, years: o.years, result, counter, msg }),
    result,
    counter,
    message: msg,
  };
}

export const ageOf = (d: { birthYear: number }, season: number) => season - d.birthYear;

/** What a driver is worth per season (M USD): the best are very expensive, rookies cheap. */
export function marketValue(d: DriverRecord, season: number) {
  const age = ageOf(d, season);
  const base = 0.3 + Math.max(0, d.pace - 75) ** 2 * 0.075;
  // promise is only paid for once a driver is close to F1 level
  const promise = age <= 23 ? Math.max(0, d.potential - d.pace) * 0.3 * Math.max(0, Math.min(1, (d.pace - 70) / 8)) : 0;
  return Math.round((base + promise) * 10) / 10;
}

/** Salary a driver asks a given team: weaker cars must pay more, a known team principal helps. */
export function askingSalary(d: DriverRecord, season: number, carRank: number, tpRating = 80, cap?: number | null) {
  const k = (1 + (carRank - 5) * 0.04) * (1.08 - (tpRating - 70) * 0.006);
  const ask = Math.max(0.3, Math.round(marketValue(d, season) * k * 10) / 10);
  return cap ? Math.min(cap, ask) : ask;
}

export const staffSalary = (role: StaffRole, rating: number) =>
  Math.round(
    (role === "tp" ? 1 + (rating - 70) * 0.25 : role === "td" ? 1.5 + (rating - 70) * 0.35 : 0.8 + (rating - 70) * 0.18) * 10,
  ) / 10;

/** Rating used when a position is empty. */
export const VACANT_RATING = 65;

/** Paying off the rest of a contract: half of what is left (at least half a year). */
export function severance(s: StaffRecord, season: number) {
  const yearsLeft = Math.max(1, (s.until ?? season) - season + 1);
  return Math.round(s.salary * Math.max(0.5, yearsLeft * 0.5) * 10) / 10;
}

export function initPeople(teams: Team[], seed: number): PeopleState {
  const drivers: Record<string, DriverRecord> = {};
  for (const t of teams) {
    for (const d of t.drivers) {
      const bio = GRID_BIOS[d.id] ?? { birthYear: 2000, potential: d.pace + 2, until: FIRST_SEASON };
      const rec: DriverRecord = {
        ...d,
        birthYear: bio.birthYear,
        potential: Math.max(d.pace, bio.potential),
        contract: null,
        nextContract: null,
        status: "active",
        f1Seasons: F1_EXPERIENCE[d.id] ?? 0,
      };
      rec.contract = { teamId: t.id, salary: marketValue(rec, FIRST_SEASON), until: bio.until ?? FIRST_SEASON };
      drivers[d.id] = rec;
    }
  }
  for (const e of EXTRA_DRIVERS) {
    const { status, origin, birthYear, potential, ...base } = e;
    drivers[e.id] = {
      ...base, birthYear, potential, contract: null, nextContract: null, status, origin, f1Seasons: F1_EXPERIENCE[e.id] ?? 0,
      ...(status === "junior" ? { series: "F2" as const, seriesSeasons: F2_SEASONS[e.id] ?? 1 } : {}),
    };
  }
  seedFeeder(drivers, seed, FIRST_SEASON);
  if (drivers.tsu) drivers.tsu = { ...drivers.tsu, reserveOf: "redbull", reserveSalary: reserveAsk(drivers.tsu, FIRST_SEASON), reserveUntil: FIRST_SEASON };
  assignReserves(drivers, teams, FIRST_SEASON, null, createRng(seed ^ 0xbeef));
  const staff: Record<string, StaffRecord> = {};
  for (const s of STAFF) staff[s.id] = { ...s, salary: staffSalary(s.role, s.rating), until: s.teamId ? s.until ?? FIRST_SEASON + 1 : undefined, birthYear: staffBirth(s.id) };
  return { version: 1, season: FIRST_SEASON, drivers, staff, rngState: seed, nextJunior: 100 };
}

/** Staff ages (game values): between 38 and 64 in 2026. */
const staffBirth = (id: string) => FIRST_SEASON - 38 - Math.floor(hash01(id + "age") * 27);

/** Saves from before reserves, other series and staff ages. */
export function migrateReserves(p: PeopleState, teams: Team[]): PeopleState {
  const hasReserves = Object.values(p.drivers).some((d) => d.reserveOf);
  const agesOk = Object.values(p.staff).every((s) => s.birthYear);
  if (hasReserves && agesOk) return p;
  const drivers = structuredClone(p.drivers);
  if (!hasReserves) assignReserves(drivers, teams, p.season, null, createRng(p.rngState ^ 0xbeef));
  const staff = Object.fromEntries(Object.entries(p.staff).map(([id, s]) => [id, s.birthYear ? s : { ...s, birthYear: staffBirth(id) }]));
  return { ...p, drivers, staff };
}

/** Invented young drivers already racing in F3 and F2 when the game starts. */
function seedFeeder(drivers: Record<string, DriverRecord>, seed: number, season: number) {
  const rng = createRng(seed ^ 0x5eed);
  for (let i = 0; i < 12; i++) {
    const j = newJunior(rng, season, i + 1, drivers, "F3");
    j.seriesSeasons = rng.int(0, 1);
    drivers[j.id] = j;
  }
  for (let i = 0; i < 6; i++) {
    const j = newJunior(rng, season, i + 50, drivers, "F2");
    j.seriesSeasons = rng.int(0, 1);
    drivers[j.id] = j;
  }
}

/** Saves from before the feeder series: put juniors in F2, add F1 experience and the F2/F3 grids. */
export function migrateFeeder(p: PeopleState): PeopleState {
  if (Object.values(p.drivers).some((d) => d.series)) return p;
  const drivers = structuredClone(p.drivers);
  for (const d of Object.values(drivers)) {
    if (d.f1Seasons === undefined) d.f1Seasons = (F1_EXPERIENCE[d.id] ?? 0) + (d.status === "active" ? p.season - FIRST_SEASON : 0);
    if (d.status === "junior") Object.assign(d, { series: "F2", seriesSeasons: F2_SEASONS[d.id] ?? 1 });
  }
  seedFeeder(drivers, p.rngState ^ p.season, p.season);
  return { ...p, drivers, nextJunior: Math.max(p.nextJunior, 100) };
}

/** Is a junior good enough for an F1 seat? Only proven F2 drivers are. */
export function f1Ready(d: DriverRecord) {
  if (d.status !== "junior") return true;
  if (d.series !== "F2" && d.series !== "F3") return true;
  if (d.series !== "F2") return false;
  return d.pace >= 77 || ((d.seriesSeasons ?? 0) >= 2 && d.pace >= 75);
}

/** Contract length: usually two or three years, one for veterans (or sometimes). */
export function contractYears(rng: Rng, age: number) {
  if (age >= 36) return 1;
  if (age >= 33) return rng.chance(0.55) ? 2 : 1;
  const r = rng.next();
  return r < 0.15 ? 1 : r < 0.6 ? 2 : 3;
}

/** Saves from before the extra staff roles: add the missing people. */
export function migrateStaff(p: PeopleState): PeopleState {
  const staff = { ...p.staff };
  let changed = false;
  for (const seed of STAFF) {
    if (staff[seed.id]) continue;
    const taken = seed.teamId && Object.values(staff).some((x) => x.teamId === seed.teamId && x.role === seed.role);
    staff[seed.id] = {
      ...seed,
      teamId: taken ? null : seed.teamId,
      salary: staffSalary(seed.role, seed.rating),
      until: seed.teamId && !taken ? Math.max(seed.until ?? p.season, p.season) : undefined,
    };
    changed = true;
  }
  for (const x of Object.values(staff)) {
    if (x.teamId && x.until === undefined) {
      staff[x.id] = { ...x, until: p.season + 1 };
      changed = true;
    }
  }
  return changed ? { ...p, staff } : p;
}

/** Driver ids racing for a team in a given season. */
export function lineup(p: PeopleState, teamId: string, season = p.season): string[] {
  return Object.values(p.drivers)
    .filter((d) => d.status === "active" && d.contract?.teamId === teamId && d.contract.until >= season)
    .map((d) => d.id);
}

/** Who will drive for a team next season (contracts that continue + already signed). */
export function nextSeasonLineup(p: PeopleState, teamId: string): DriverRecord[] {
  const next = p.season + 1;
  return Object.values(p.drivers).filter(
    (d) =>
      d.status !== "retired" &&
      ((d.nextContract?.teamId === teamId) || (!d.nextContract && d.contract?.teamId === teamId && d.contract.until >= next)),
  );
}

export function teamStaff(p: PeopleState, teamId: string): Record<StaffRole, StaffRecord | null> {
  const list = Object.values(p.staff).filter((s) => s.teamId === teamId);
  return Object.fromEntries(STAFF_ROLES.map((r) => [r, list.find((s) => s.role === r) ?? null])) as Record<StaffRole, StaffRecord | null>;
}

export type StaffRatings = Record<StaffRole, number> & { reserve?: number };

/** What a reserve driver asks: a fraction of a race seat. */
export const reserveAsk = (d: DriverRecord, season: number) => Math.round(Math.max(0.3, marketValue(d, season) * 0.18 + 0.3) * 10) / 10;
/** Simulator and test work: a good reserve speeds up development a little (up to +6%). */
export const reserveBonus = (pace?: number) => (pace ? Math.max(0, Math.min(0.06, (pace - 74) * 0.006)) : 0);
export const reserveOf = (p: PeopleState, teamId: string) => Object.values(p.drivers).find((d) => d.reserveOf === teamId && d.status !== "retired") ?? null;

/** Ratings used by the management engine (an empty position counts as a weak one). */
export function staffRatings(p: PeopleState): Record<string, StaffRatings> {
  const out: Record<string, StaffRatings> = {};
  const teams = new Set(Object.values(p.drivers).map((d) => d.contract?.teamId).filter(Boolean) as string[]);
  for (const s of Object.values(p.staff)) if (s.teamId) teams.add(s.teamId);
  for (const t of teams) out[t] = Object.fromEntries(STAFF_ROLES.map((r) => [r, VACANT_RATING])) as StaffRatings;
  for (const s of Object.values(p.staff)) if (s.teamId) out[s.teamId][s.role] = s.rating;
  for (const d of Object.values(p.drivers)) if (d.reserveOf && out[d.reserveOf] && d.status !== "retired") out[d.reserveOf].reserve = d.pace;
  return out;
}

/** Yearly payroll of a team (drivers + staff), M USD. */
export function payroll(p: PeopleState, teamId: string) {
  const drivers = lineup(p, teamId).reduce((a, id) => a + (p.drivers[id].contract?.salary ?? 0), 0) + (reserveOf(p, teamId)?.reserveSalary ?? 0);
  const staff = Object.values(p.staff).filter((s) => s.teamId === teamId).reduce((a, s) => a + s.salary, 0);
  return { drivers, staff: +staff.toFixed(2) };
}

// --- Market -------------------------------------------------------------------

/**
 * Will this driver retire when the season ends? Decided in advance (same answer all
 * year) so the market can respect it: a running contract is always honoured.
 */
export function willRetire(d: DriverRecord, season: number) {
  if (d.status === "retired" || d.status === "junior") return false;
  if (d.contract && d.contract.until > season) return false;
  // the fast ones keep going longer
  const k = d.pace >= 88 ? 0.5 : d.pace >= 84 ? 0.8 : 1;
  return hash01(`${d.id}:${season}`) < retireChance(ageOf(d, season + 1), false) * k;
}

/** Does the team have an empty seat right now (this season)? */
export const seatOpenNow = (p: PeopleState, teamId: string) => lineup(p, teamId).length < 2;

/** Can this driver join right away (a free agent or a junior)? */
export const signableNow = (d: DriverRecord) => (d.status === "free" || d.status === "junior") && !d.contract && !d.nextContract && f1Ready(d);

/** Can this driver be signed for next season? */
export function availableForNextSeason(p: PeopleState, d: DriverRecord) {
  if (d.status === "retired" || d.nextContract) return false;
  if (!f1Ready(d)) return false;
  if (!d.contract) return true;
  return d.contract.until <= p.season; // contract ends this season
}

export interface OfferResult {
  ok: boolean;
  message: string;
  people: PeopleState;
  result?: TalkResult;
  counter?: number;
}

export function offerDriverContract(
  p: PeopleState,
  driverId: string,
  teamId: string,
  salary: number,
  years: number,
  carRank: number,
  tpRating: number,
  round = 0,
): OfferResult {
  const d = p.drivers[driverId];
  if (!d) return { ok: false, message: "Piloto no encontrado", people: p };
  // an empty seat right now is filled at once with a free agent or a junior
  const now = seatOpenNow(p, teamId) && signableNow(d);
  if (!now) {
    if (!availableForNextSeason(p, d)) return { ok: false, message: `${d.name} tiene contrato para la próxima temporada`, people: p };
    if (willRetire(d, p.season)) return { ok: false, message: `${d.name} anunció que se retira al final de la temporada ${p.season}. No firmará más contratos.`, people: p, result: "reject" };
    const seats = nextSeasonLineup(p, teamId).filter((x) => x.id !== driverId).length;
    if (seats >= 2) return { ok: false, message: "Ya tienes dos pilotos para la próxima temporada", people: p };
  }
  const ask = askingSalary(d, p.season + 1, carRank, tpRating, p.salaryCap);
  if (p.salaryCap && salary > p.salaryCap + 1e-6) return { ok: false, message: `El tope salarial es US$ ${p.salaryCap} M por piloto`, people: p };
  const age = ageOf(d, p.season + 1);
  if (age >= 38 && years > 1) return { ok: false, message: `${d.name} solo acepta contratos de 1 año a su edad`, people: p };
  const n = negotiate(p, `d:${driverId}`, { ask, salary, years, age, name: d.name, round, star: d.pace >= 92 });
  if (n.result !== "accept") return { ok: false, message: n.message, people: n.people, result: n.result, counter: n.counter };
  if (now) {
    const until = p.season + years - 1;
    return {
      ok: true,
      result: "accept",
      message: `${d.name} firma por ${years} año${years > 1 ? "s" : ""} (US$ ${salary.toFixed(1)} M/año) y corre desde ya`,
      people: { ...n.people, drivers: { ...n.people.drivers, [driverId]: { ...d, status: "active", contract: { teamId, salary, until } } } },
    };
  }
  const next = p.season + 1;
  return {
    ok: true,
    result: "accept",
    message: `${d.name} firma por ${years} año${years > 1 ? "s" : ""} (US$ ${salary.toFixed(1)} M/año) desde ${next}`,
    people: {
      ...n.people,
      drivers: { ...n.people.drivers, [driverId]: { ...d, nextContract: { teamId, salary, until: next + years - 1 } } },
    },
  };
}

/** Sign a reserve driver (replaces the current one, who is released). */
export function hireReserve(p: PeopleState, driverId: string, teamId: string, years = 1): { ok: boolean; people: PeopleState; message: string } {
  const d = p.drivers[driverId];
  if (!d || d.status === "retired" || d.contract || d.nextContract) return { ok: false, people: p, message: "No disponible" };
  if (d.reserveOf && d.reserveOf !== teamId) return { ok: false, people: p, message: `${d.name} ya es reserva de otro equipo` };
  if (d.status === "junior" && !f1Ready(d)) return { ok: false, people: p, message: `${d.name} todavía no tiene nivel de F1` };
  const drivers = { ...p.drivers };
  const cur = reserveOf(p, teamId);
  if (cur && cur.id !== driverId) drivers[cur.id] = { ...cur, reserveOf: null, reserveSalary: undefined, reserveUntil: undefined };
  const salary = reserveAsk(d, p.season);
  drivers[driverId] = { ...d, reserveOf: teamId, reserveSalary: salary, reserveUntil: p.season + years - 1 };
  return { ok: true, people: { ...p, drivers }, message: `${d.name} es tu piloto de reserva hasta ${p.season + years - 1} (US$ ${salary.toFixed(1)} M/año)` };
}

export function releaseReserve(p: PeopleState, teamId: string): PeopleState {
  const cur = reserveOf(p, teamId);
  if (!cur) return p;
  return { ...p, drivers: { ...p.drivers, [cur.id]: { ...cur, reserveOf: null, reserveSalary: undefined, reserveUntil: undefined } } };
}

/** AI teams without a reserve pick one: a cheap, experienced or promising driver without a seat. */
function assignReserves(drivers: Record<string, DriverRecord>, teams: Team[], season: number, skip: string | null, rng: Rng, news?: string[]) {
  for (const t of teams) {
    if (t.id === skip) continue;
    if (Object.values(drivers).some((d) => d.reserveOf === t.id && d.status !== "retired")) continue;
    const pool = Object.values(drivers).filter(
      (d) => (d.status === "free" || (d.status === "junior" && f1Ready(d))) && !d.reserveOf && !d.contract && !d.nextContract && d.series !== "NASCAR" && ageOf(d, season) <= 36,
    );
    if (!pool.length) continue;
    const score = (d: DriverRecord) => d.pace + Math.min(d.f1Seasons ?? 0, 5) * 0.4 - reserveAsk(d, season) * 1.2 + rng.next();
    const pick = pool.sort((a, b) => score(b) - score(a))[0];
    drivers[pick.id] = { ...pick, reserveOf: t.id, reserveSalary: reserveAsk(pick, season), reserveUntil: season + rng.int(0, 1) };
    news?.push(`${t.name} elige a ${pick.name} como piloto de reserva.`);
  }
}

/** Let a driver go at the end of the season (no renewal). */
export function releaseAtSeasonEnd(p: PeopleState, driverId: string): PeopleState {
  const d = p.drivers[driverId];
  if (!d?.contract || d.contract.until <= p.season) return p;
  return { ...p, drivers: { ...p.drivers, [driverId]: { ...d, contract: { ...d.contract, until: p.season } } } };
}

export function hireStaff(p: PeopleState, staffId: string, teamId: string, years = 3, salary?: number): { people: PeopleState; cost: number; message: string } {
  const s = p.staff[staffId];
  if (!s || s.teamId || s.signed || s.retired) return { people: p, cost: 0, message: "No disponible" };
  const current = Object.values(p.staff).find((x) => x.teamId === teamId && x.role === s.role);
  const pay = salary ?? s.salary;
  const cost = Math.round(pay * 0.5 * 10) / 10; // signing fee
  const role = STAFF_ROLE_INFO[s.role].label.toLowerCase();
  if (current) {
    // the post is taken: they join when the season ends, the current holder leaves then (no severance)
    const until = p.season + years;
    return {
      people: {
        ...p,
        staff: {
          ...p.staff,
          [staffId]: { ...s, signed: { teamId, until, salary: pay } },
          [current.id]: { ...current, until: Math.min(current.until ?? p.season, p.season) },
        },
      },
      cost,
      message: `${s.name} será el nuevo ${role} desde ${p.season + 1} (hasta ${until}). ${current.name} sigue hasta el final de ${p.season}.`,
    };
  }
  return {
    people: { ...p, staff: { ...p.staff, [staffId]: { ...s, teamId, until: p.season + years - 1, salary: pay, signed: null } } },
    cost,
    message: `${s.name} es el nuevo ${role} hasta ${p.season + years - 1}`,
  };
}

/** Someone already signed to take this post next season. */
export const signedFor = (p: PeopleState, teamId: string, role: StaffRole) =>
  Object.values(p.staff).find((x) => x.signed?.teamId === teamId && x.role === role) ?? null;

/** Hiring through a negotiation: on agreement the person joins right away. */
export function offerStaffContract(
  p: PeopleState,
  staffId: string,
  teamId: string,
  salary: number,
  years: number,
  round: number,
): { people: PeopleState; result: TalkResult; counter?: number; message: string; cost: number } {
  const s = p.staff[staffId];
  if (!s || s.teamId || s.signed || s.retired) return { people: p, result: "reject", message: "No disponible", cost: 0 };
  const already = signedFor(p, teamId, s.role);
  if (already) return { people: p, result: "reject", message: `Ya firmaste a ${already.name} para ese puesto desde ${p.season + 1}.`, cost: 0 };
  const n = negotiate(p, `s:${staffId}`, { ask: s.salary, salary, years, name: s.name, round, star: s.rating >= 88 });
  if (n.result !== "accept") return { people: n.people, result: n.result, counter: n.counter, message: n.message, cost: 0 };
  const h = hireStaff(n.people, staffId, teamId, years, salary);
  return { people: h.people, result: "accept", message: h.message, cost: h.cost };
}

/** Renewing staff: they ask a raise and negotiate like anyone else. */
export function offerStaffRenewal(
  p: PeopleState,
  staffId: string,
  salary: number,
  years: number,
  round: number,
): { people: PeopleState; result: TalkResult; counter?: number; message: string } {
  const s = p.staff[staffId];
  if (!s?.teamId) return { people: p, result: "reject", message: "No disponible" };
  const rep = signedFor(p, s.teamId, s.role);
  if (rep) return { people: p, result: "reject", message: `Ya firmaste a ${rep.name} para reemplazarlo en ${p.season + 1}.` };
  const n = negotiate(p, `r:${staffId}`, { ask: renewalAsk(s), salary, years, name: s.name, round, star: s.rating >= 88 });
  if (n.result !== "accept") return n;
  const until = Math.max(s.until ?? p.season, p.season) + years;
  return {
    people: { ...n.people, staff: { ...n.people.staff, [staffId]: { ...s, until, salary } } },
    result: "accept",
    message: `${s.name} renueva hasta ${until} (US$ ${salary.toFixed(1)} M/año)`,
  };
}

/** What someone expects to renew: a raise, bigger for the best. */
export const renewalAsk = (s: StaffRecord) => r1(Math.max(s.salary * 1.08, staffSalary(s.role, s.rating) * 1.05));

/** Let someone go now, paying the rest of the contract. */
export function fireStaff(p: PeopleState, staffId: string): { people: PeopleState; cost: number; message: string } {
  const s = p.staff[staffId];
  if (!s?.teamId) return { people: p, cost: 0, message: "No disponible" };
  const cost = severance(s, p.season);
  const staff = { ...p.staff, [staffId]: { ...s, teamId: null } };
  // a replacement already signed for next year takes over right away
  const rep = signedFor(p, s.teamId, s.role);
  if (rep) staff[rep.id] = { ...rep, teamId: rep.signed!.teamId, until: rep.signed!.until, salary: rep.signed!.salary, signed: null };
  return {
    people: { ...p, staff },
    cost,
    message: `${s.name} deja el cargo de ${STAFF_ROLE_INFO[s.role].label.toLowerCase()} (indemnización US$ ${cost.toFixed(1)} M).${rep ? ` ${rep.name} asume desde ya.` : " El puesto queda vacante."}`,
  };
}

/** Extend a contract: they ask for a 10% raise. */
export function renewStaff(p: PeopleState, staffId: string, years = 2): { people: PeopleState; message: string } {
  const s = p.staff[staffId];
  if (!s?.teamId) return { people: p, message: "No disponible" };
  const until = Math.max(s.until ?? p.season, p.season) + years;
  const salary = Math.round(s.salary * 1.1 * 10) / 10;
  return {
    people: { ...p, staff: { ...p.staff, [staffId]: { ...s, until, salary } } },
    message: `${s.name} renueva hasta ${until} (US$ ${salary.toFixed(1)} M/año)`,
  };
}

function newStaff(rng: Rng, role: StaffRole, season: number, n: number, used = new Set<string>()): StaffRecord {
  const r = rng.next();
  const rating = Math.round(r < 0.04 ? 86 + rng.next() * 5 : r < 0.35 ? 60 + rng.next() * 10 : 70 + rng.next() * 14);
  const flag = pickNationality(rng);
  return {
    id: `st${season}-${n}`,
    name: nameFor(flag, rng, used),
    role,
    rating,
    nationality: flag,
    birthYear: season - rng.int(31, 52),
    teamId: null,
    salary: staffSalary(role, rating),
    fictional: true,
  };
}

// --- Mid-season market ---------------------------------------------------------

export interface MarketMove {
  kind: "renew" | "sign";
  driverId: string;
  teamId: string;
  fromTeamId: string | null;
  until: number;
  salary: number;
}

/**
 * During the season AI teams close deals for next year: they renew drivers whose
 * contracts end, or sign someone better from the market (a free agent, a junior or a
 * driver whose contract ends elsewhere). The player can lose targets this way.
 */
export function midSeasonMarket(p0: PeopleState, teams: Team[], playerTeamId: string | null, carRanks: Record<string, number>, seed: number): { people: PeopleState; moves: MarketMove[] } {
  const rng = createRng(seed);
  const next = p0.season + 1;
  const drivers = { ...p0.drivers };
  const p: PeopleState = { ...p0, drivers };
  const moves: MarketMove[] = [];
  for (const t of teams) {
    if (t.id === playerTeamId) continue;
    const rank = carRanks[t.id] ?? 6;
    // 1) renewals
    for (const d of Object.values(drivers)) {
      if (d.status !== "active" || d.contract?.teamId !== t.id || d.contract.until > p0.season || d.nextContract) continue;
      if (willRetire(d, p0.season) || nextSeasonLineup(p, t.id).length >= 2) continue;
      const age = ageOf(d, next);
      const mate = Object.values(drivers).find((x) => x.id !== d.id && x.contract?.teamId === t.id && x.status === "active");
      const keep = age <= 37 && d.pace >= (mate?.pace ?? 0) - 5;
      if (keep && rng.chance(0.5)) {
        const years = contractYears(rng, age);
        const salary = capSalary(p0, marketValue(d, next));
        drivers[d.id] = { ...d, nextContract: { teamId: t.id, salary, until: next + years - 1 } };
        moves.push({ kind: "renew", driverId: d.id, teamId: t.id, fromTeamId: t.id, until: next + years - 1, salary });
      }
    }
    // 2) a signing for an open seat next year
    if (nextSeasonLineup(p, t.id).length >= 2 || !rng.chance(0.3)) continue;
    // top teams can buy a driver out of a smaller team's contract (not the player's)
    const buyout = (d: DriverRecord) =>
      rank <= 4 &&
      d.status === "active" &&
      !!d.contract &&
      d.contract.until > p0.season &&
      d.contract.teamId !== playerTeamId &&
      (carRanks[d.contract.teamId] ?? 6) > rank + 2 &&
      ageOf(d, next) <= 28;
    const pool = Object.values(drivers).filter(
      (d) =>
        d.status !== "retired" && !d.nextContract && d.contract?.teamId !== t.id && (availableForNextSeason(p, d) || buyout(d)) && ageOf(d, next) <= 36 && !willRetire(d, p0.season),
    );
    if (!pool.length) continue;
    const score = (d: DriverRecord) => teamWants(d, rank, next) + rng.next();
    const pick = pool.sort((a, b) => score(b) - score(a))[0];
    const current = Object.values(drivers).filter((d) => d.contract?.teamId === t.id && d.status === "active");
    const worst = Math.min(...current.map((d) => d.pace), 99);
    // big teams only sign upgrades; small teams also bet on promise
    if (pick.pace < worst - 1 && !(rank >= 6 && ageOf(pick, next) <= 23 && pick.potential >= worst + 2)) continue;
    if (buyout(pick) && (pick.pace < worst + 3 || !rng.chance(0.4))) continue; // a buy-out must be worth it
    if (buyout(pick)) drivers[pick.id] = { ...pick, contract: { ...pick.contract!, until: p0.season } };
    const years = contractYears(rng, ageOf(pick, next));
    const salary = capSalary(p0, marketValue(pick, next));
    drivers[pick.id] = { ...drivers[pick.id], nextContract: { teamId: t.id, salary, until: next + years - 1 } };
    moves.push({ kind: "sign", driverId: pick.id, teamId: t.id, fromTeamId: pick.contract?.teamId ?? null, until: next + years - 1, salary });
  }
  return { people: p, moves };
}

/**
 * How much a team wants a driver. Top teams pay for proven pace; small teams look for
 * cheap young talent they can develop (and later lose to the big teams).
 */
export function teamWants(d: DriverRecord, carRank: number, season: number) {
  const t = Math.min(1, Math.max(0, (carRank - 1) / 9)); // 0 = best car, 1 = worst
  const age = ageOf(d, season);
  const growth = age <= 24 ? Math.max(0, d.potential - d.pace) : 0;
  const exp = d.f1Seasons ?? 0;
  return (
    d.pace * (1.15 - 0.3 * t) +
    // F1 experience always counts; rookies are a risk, above all for the top teams
    Math.min(exp, 6) * (0.4 + 0.4 * (1 - t)) -
    (exp === 0 ? 2 + 7 * (1 - t) : 0) +
    growth * (0.08 + 0.6 * t) +
    (age <= 22 ? 3 * t : 0) -
    (age >= 34 ? (age - 33) * (0.4 + t) : 0) -
    marketValue(d, season) * (0.015 + 0.12 * t)
  );
}

// --- Season change -------------------------------------------------------------

const capSalary = (p: PeopleState, s: number) => (p.salaryCap ? Math.min(p.salaryCap, s) : s);

const clamp = (x: number, lo = 50, hi = 99) => Math.max(lo, Math.min(hi, x));

/** One year of experience: young drivers grow towards their potential, veterans decline. */
function develop(d: DriverRecord, season: number, rng: Rng, coach = 80, form = 0): DriverRecord {
  const age = ageOf(d, season);
  const gap = Math.max(0, d.potential - d.pace);
  const k = Math.max(0.7, Math.min(1.3, 1 + (coach - 80) * 0.02)); // race engineering boss helps them grow
  let dp: number;
  if (age <= 23) dp = gap * (0.25 + rng.next() * 0.25) * k;
  else if (age <= 27) dp = gap * (0.15 + rng.next() * 0.2) * k;
  else if (age <= 31) dp = (rng.next() - 0.4) * 0.8;
  else if (age <= 35) dp = -rng.next() * 0.9;
  else dp = -(0.8 + rng.next() * 1.6);
  const exp = age <= 30 ? 0.5 + rng.next() : age >= 36 ? -(rng.next() * 0.8) : rng.next() * 0.4;
  // a good year against the team-mate builds confidence; a bad one costs it
  dp += form * 0.8;
  // a year without a seat: juniors keep racing in F2, everybody else gets rusty
  if (d.status === "free" && age >= 24) dp -= 0.3 + rng.next() * 0.7;
  if (d.status === "junior") dp += rng.next() * 0.6; // an F2 season
  return {
    ...d,
    pace: +clamp(d.pace + dp).toFixed(1),
    racecraft: +clamp(d.racecraft + exp + form * 0.5).toFixed(1),
    defending: +clamp(d.defending + exp).toFixed(1),
    consistency: +clamp(d.consistency + exp * 1.2).toFixed(1),
    tyreMgmt: +clamp(d.tyreMgmt + exp).toFixed(1),
  };
}

function retireChance(age: number, contracted: boolean) {
  if (age < 36) return 0;
  const p = (age - 35) * 0.11;
  return contracted ? (age >= 41 ? p * 0.5 : 0) : p;
}

function newJunior(rng: Rng, season: number, n: number, existing: Record<string, DriverRecord>, series: "F2" | "F3" = "F3"): DriverRecord {
  const flag = pickNationality(rng);
  const name = nameFor(flag, rng, new Set(Object.values(existing).map((d) => d.name)));
  const last = name.split(" ").slice(-1)[0].normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase();
  const f3 = series === "F3";
  const pace = f3 ? 64 + rng.next() * 7 : 70 + rng.next() * 6;
  const potential = Math.min(97, pace + (f3 ? 12 : 8) + rng.next() * (f3 ? 16 : 12));
  const base = (f3 ? 66 : 71) + rng.next() * 6;
  const used = new Set(Object.values(existing).filter((d) => d.status !== "retired").map((d) => d.shortName));
  const short = [last.slice(0, 3), last.slice(0, 2) + last.slice(-1), last[0] + last.slice(2, 4), `J${(n % 90) + 10}`].find((c) => c.length === 3 && !used.has(c)) ?? `J${(n % 90) + 10}`;
  return {
    id: `jr${season}-${n}`,
    name,
    shortName: short,
    number: 50 + ((n * 7) % 49),
    nationality: flag,
    pace: +pace.toFixed(1),
    racecraft: +base.toFixed(1),
    defending: +(base - 1).toFixed(1),
    consistency: +(base + rng.next() * 2).toFixed(1),
    tyreMgmt: +base.toFixed(1),
    birthYear: season - (f3 ? rng.int(16, 18) : rng.int(18, 20)),
    potential: +potential.toFixed(1),
    contract: null,
    nextContract: null,
    status: "junior",
    origin: f3 ? "Fórmula 3" : "Fórmula 2",
    series,
    juniorTeam: rng.pick(f3 ? F3_TEAMS : F2_TEAMS),
    seriesSeasons: 0,
    f1Seasons: 0,
  };
}

/** AI choice for an empty seat: top teams want pace, smaller teams value price and promise. */
function aiPick(p: PeopleState, carRank: number, season: number, taken: Set<string>, teamId?: string): DriverRecord | null {
  const open = (d: DriverRecord) => (d.status === "free" || d.status === "junior") && !taken.has(d.id) && !d.nextContract && !d.contract;
  let pool = Object.values(p.drivers).filter((d) => open(d) && f1Ready(d));
  if (!pool.length) pool = Object.values(p.drivers).filter((d) => open(d) && d.series !== "F3");
  if (!pool.length) return null;
  // the team's own reserve knows the car: a head start
  const want = (d: DriverRecord) => teamWants(d, carRank, season) + (teamId && d.reserveOf === teamId ? 4 : 0) - (d.reserveOf && d.reserveOf !== teamId ? 1.5 : 0);
  return pool.sort((a, b) => want(b) - want(a))[0];
}

export interface SeasonChange {
  people: PeopleState;
  news: string[];
}

/**
 * Close a season and open the next one:
 * AI renewals → contracts start/end → ageing and development → retirements →
 * AI teams fill their seats → new juniors. The player's empty seats are filled
 * with the best cheap option (and reported) so the game can always continue.
 */
export function advanceSeason(
  p0: PeopleState,
  teams: Team[],
  playerTeamId: string | null,
  carRanks: Record<string, number>,
  form: Record<string, number> = {}, // -1..1: how each driver did against the team-mate
): SeasonChange {
  const rng = createRng(p0.rngState);
  const news: string[] = [];
  const old = p0.season;
  const season = old + 1;
  const drivers: Record<string, DriverRecord> = structuredClone(p0.drivers);
  // retirements were decided during the year; a signed contract for next season is always honoured
  const retiring = new Set(Object.values(p0.drivers).filter((d) => !d.nextContract && willRetire(d, old)).map((d) => d.id));

  // 1) AI renewals for contracts ending now (only while there is a seat)
  const p0n: PeopleState = { ...p0, drivers };
  for (const d of Object.values(drivers)) {
    if (!d.contract || d.contract.until !== old || d.nextContract || d.status !== "active") continue;
    if (d.contract.teamId === playerTeamId || retiring.has(d.id)) continue;
    if (nextSeasonLineup(p0n, d.contract.teamId).length >= 2) continue;
    const age = ageOf(d, season);
    const teamPace = teams.find((t) => t.id === d.contract!.teamId)?.drivers.map((x) => x.pace) ?? [];
    const res = Object.values(drivers).find((x) => x.reserveOf === d.contract!.teamId && x.status !== "retired");
    const promote = !!res && res.pace >= d.pace + 2.5 && rng.chance(0.7);
    const keep = !promote && age <= 38 && d.pace >= Math.max(...teamPace, 0) - 5 && rng.chance(0.9);
    if (keep) {
      const years = contractYears(rng, age);
      d.nextContract = { teamId: d.contract.teamId, salary: capSalary(p0, marketValue(d, season)), until: season + years - 1 };
    }
  }

  const prevTeam = new Map(Object.values(drivers).map((d) => [d.id, d.contract?.teamId ?? null]));
  for (const d of Object.values(drivers)) if (d.status === "active" && d.contract) d.f1Seasons = (d.f1Seasons ?? 0) + 1;

  // 2) contracts change over
  for (const d of Object.values(drivers)) {
    if (d.status === "retired") continue;
    if (d.nextContract) {
      if (d.contract?.teamId && d.nextContract.teamId !== d.contract.teamId) {
        const to = teams.find((t) => t.id === d.nextContract!.teamId)?.name ?? d.nextContract.teamId;
        news.push(`${d.name} se cambia a ${to}.`);
      }
      if (d.status === "junior") news.push(`${d.name} debuta en la Fórmula 1 con ${teams.find((t) => t.id === d.nextContract!.teamId)?.name}.`);
      if (d.reserveOf === d.nextContract.teamId) news.push(`${d.name} pasa de piloto de reserva a titular en ${teams.find((t) => t.id === d.nextContract!.teamId)?.name}.`);
      d.contract = d.nextContract;
      d.nextContract = null;
      d.status = "active";
      Object.assign(d, { reserveOf: null, reserveSalary: undefined, reserveUntil: undefined, series: undefined, juniorTeam: undefined });
    } else if (d.contract && d.contract.until < season) {
      d.contract = null;
      d.status = "free";
    }
  }

  // 3) development and retirements
  const ratings = staffRatings(p0);
  for (const id of Object.keys(drivers)) {
    const d = drivers[id];
    if (d.status === "retired") continue;
    const before = d.pace;
    const coach = d.contract?.teamId ? ratings[d.contract.teamId]?.race ?? VACANT_RATING : 75;
    const dev = develop(d, season, rng, coach, Math.max(-1, Math.min(1, form[id] ?? 0)));
    drivers[id] = dev;
    const age = ageOf(dev, season);
    if (dev.status === "active" && dev.pace - before >= 3) news.push(`${dev.name} da un gran salto (+${(dev.pace - before).toFixed(1)} de ritmo).`);
    if (retiring.has(id)) {
      if (p0.drivers[id]?.contract || dev.pace > 82) news.push(`${dev.name} se retira de la Fórmula 1 a los ${age} años.`);
      drivers[id] = { ...dev, status: "retired", contract: null, nextContract: null };
    }
  }

  // 4) fill seats
  const p1: PeopleState = { ...p0, drivers, season };
  const taken = new Set<string>();
  for (const t of teams) {
    let current = lineup(p1, t.id, season);
    // the player's empty seats stay empty: they choose who to sign
    if (t.id === playerTeamId && current.length < 2) {
      news.push(`Tu equipo: tienes ${2 - current.length === 1 ? "un asiento libre" : "dos asientos libres"} para ${season}. Ficha un piloto antes del primer GP.`);
    }
    while (current.length < 2 && t.id !== playerTeamId) {
      const pick = aiPick(p1, carRanks[t.id] ?? 6, season, taken, t.id);
      if (!pick) break;
      taken.add(pick.id);
      const years = contractYears(rng, ageOf(pick, season));
      const salary = capSalary(p0, marketValue(pick, season));
      if (pick.reserveOf === t.id) news.push(`${pick.name} pasa de piloto de reserva a titular en ${t.name}.`);
      drivers[pick.id] = { ...pick, status: "active", series: undefined, juniorTeam: undefined, reserveOf: null, reserveSalary: undefined, reserveUntil: undefined, contract: { teamId: t.id, salary, until: season + years - 1 } };
      const again = prevTeam.get(pick.id) === t.id;
      news.push(
        again
          ? `${pick.name} renueva con ${t.name}.`
          : `${t.name} ficha a ${pick.name}${prevTeam.get(pick.id) ? "" : pick.status === "junior" ? ` desde la Fórmula 2${pick.juniorTeam ? ` (${pick.juniorTeam})` : ""}` : ""}.`,
      );
      current = lineup(p1, t.id, season);
    }
    while (current.length > 2) {
      // too many contracts (shouldn't happen): keep the two fastest
      const sorted = current.map((id) => drivers[id]).sort((a, b) => b.pace - a.pace);
      const extra = sorted[sorted.length - 1];
      drivers[extra.id] = { ...extra, status: "free", contract: null };
      current = lineup(p1, t.id, season);
    }
  }

  // 5) the feeder ladder: F3 -> F2 -> ready for F1; new F3 drivers arrive, the ones who don't make it leave
  const promoted: string[] = [];
  for (const d of Object.values(drivers)) {
    if (d.status !== "junior") continue;
    const age = ageOf(d, season);
    d.seriesSeasons = (d.seriesSeasons ?? 0) + 1;
    if (d.series === "F3" && (d.seriesSeasons >= 2 || d.pace >= 73)) {
      d.series = "F2";
      d.origin = "Fórmula 2";
      d.seriesSeasons = 0;
      if (rng.chance(0.6)) d.juniorTeam = rng.pick(F2_TEAMS);
      if (d.pace >= 72) promoted.push(`${d.name} (${d.juniorTeam})`);
    } else if (d.series === "F2" && rng.chance(0.25)) {
      d.juniorTeam = rng.pick(F2_TEAMS); // changes team in F2
    }
    if (age >= 25) {
      // didn't reach F1 in time
      if (d.pace >= 74) Object.assign(d, { status: "free", series: undefined, juniorTeam: undefined, origin: "Ex Fórmula 2" });
      else d.status = "retired";
    }
  }
  if (promoted.length) news.push(`Cantera: suben a la Fórmula 2 ${promoted.slice(0, 5).join(", ")}.`);
  let nextJunior = Math.max(p0.nextJunior, 100);
  const rookies: string[] = [];
  for (let i = 0; i < 6; i++) {
    const j = newJunior(rng, season, nextJunior++, drivers, "F3");
    drivers[j.id] = j;
    if (j.potential >= 90) rookies.push(`${j.nationality} ${j.name} (${j.juniorTeam})`);
  }
  if (rookies.length) news.push(`Cantera: llegan a la Fórmula 3 promesas como ${rookies.slice(0, 3).join(", ")}.`);

  // 5b) drivers without an F1 seat race elsewhere: Formula E, IndyCar, WEC, NASCAR, Super Formula
  for (const d of Object.values(drivers)) {
    if (d.status !== "free" || d.contract || d.nextContract) continue;
    const age = ageOf(d, season);
    if (d.series && d.series !== "F2" && d.series !== "F3") {
      if (age >= 45 || (age >= 40 && rng.chance(0.3))) {
        d.status = "retired";
        Object.assign(d, { reserveOf: null });
        continue;
      }
      if (rng.chance(0.12)) d.juniorTeam = rng.pick(OTHER_SERIES[d.series as keyof typeof OTHER_SERIES]);
      continue;
    }
    if (d.reserveOf ? !rng.chance(0.25) : !rng.chance(0.7)) continue; // reserves usually stay focused on F1
    const pickFrom: [keyof typeof OTHER_SERIES, number][] =
      age <= 29 ? [["Fórmula E", 4], ["Super Formula", 1], ["IndyCar", 2], ["WEC", 2]]
        : age <= 34 ? [["Fórmula E", 3], ["IndyCar", 2], ["WEC", 3]]
          : [["WEC", 3], ["NASCAR", 3], ["IndyCar", 1]];
    let r = rng.next() * pickFrom.reduce((a, x) => a + x[1], 0);
    const series = pickFrom.find((x) => (r -= x[1]) <= 0)?.[0] ?? pickFrom[0][0];
    d.series = series;
    d.juniorTeam = rng.pick(OTHER_SERIES[series]);
    if (d.pace >= 79 || (d.f1Seasons ?? 0) >= 3) news.push(`${d.name} correrá en ${series} con ${d.juniorTeam}.`);
  }
  // reserve contracts: AI teams keep or change their reserve; the player's expires
  for (const d of Object.values(drivers)) {
    if (!d.reserveOf) continue;
    if (d.status === "retired" || d.status === "active") {
      Object.assign(d, { reserveOf: null, reserveSalary: undefined, reserveUntil: undefined });
      continue;
    }
    if ((d.reserveUntil ?? season) >= season) continue;
    if (d.reserveOf === playerTeamId) {
      news.push(`Tu equipo: terminó el contrato de ${d.name} como piloto de reserva.`);
      Object.assign(d, { reserveOf: null, reserveSalary: undefined, reserveUntil: undefined });
    } else if (rng.chance(0.6)) {
      d.reserveUntil = season + rng.int(0, 1);
    } else {
      Object.assign(d, { reserveOf: null, reserveSalary: undefined, reserveUntil: undefined });
    }
  }
  assignReserves(drivers, teams, season, playerTeamId, rng, news);

  // 6) staff contracts: AI teams renew most people, the rest go to the market; empty AI posts are filled
  const staff: Record<string, StaffRecord> = structuredClone(p0.staff);
  const replaced = (st: StaffRecord) => Object.values(staff).some((x) => x.signed?.teamId === st.teamId && x.role === st.role);
  for (const st of Object.values(staff)) {
    if (!st.teamId || (st.until ?? season) >= season) continue;
    if (replaced(st)) {
      news.push(`${st.name} deja ${teams.find((t) => t.id === st.teamId)?.name ?? st.teamId} al terminar su contrato.`);
      staff[st.id] = { ...st, teamId: null };
    } else if (st.teamId === playerTeamId) {
      news.push(`Tu equipo: terminó el contrato de ${st.name} (${STAFF_ROLE_INFO[st.role].label.toLowerCase()}); el puesto queda vacante.`);
      staff[st.id] = { ...st, teamId: null };
    } else if (rng.chance(season - (st.birthYear ?? season - 50) >= 63 ? 0.35 : 0.88)) {
      staff[st.id] = { ...st, until: season + rng.int(1, 3) - 1 };
    } else {
      news.push(`${st.name} deja ${teams.find((t) => t.id === st.teamId)?.name ?? st.teamId}.`);
      staff[st.id] = { ...st, teamId: null };
    }
  }
  // people signed during the year join now
  for (const st of Object.values(staff)) {
    if (!st.signed) continue;
    const holder = Object.values(staff).find((x) => x.teamId === st.signed!.teamId && x.role === st.role);
    if (holder) staff[holder.id] = { ...holder, teamId: null };
    const tn = teams.find((t) => t.id === st.signed!.teamId)?.name ?? st.signed.teamId;
    news.push(`${st.name} se incorpora a ${tn} como ${STAFF_ROLE_INFO[st.role].label.toLowerCase()}.`);
    staff[st.id] = { ...st, teamId: st.signed.teamId, until: st.signed.until, salary: st.signed.salary, signed: null };
  }
  // people get better or worse with the years, and the oldest retire
  for (const st of Object.values(staff)) {
    if (st.retired) continue;
    const age = season - (st.birthYear ?? season - 50);
    const dr = age < 45 ? rng.next() * 1.4 : age < 58 ? (rng.next() - 0.5) * 1 : -rng.next() * 1.5;
    st.rating = Math.max(55, Math.min(97, Math.round(st.rating + dr)));
    // people under contract see it through; the unemployed may call it a day
    if (!st.teamId && !st.signed && age >= 60 && rng.chance((age - 59) * 0.15)) {
      if (st.rating >= 84) news.push(`${st.name} se retira a los ${age} años.`);
      staff[st.id] = { ...st, teamId: null, retired: true, until: undefined };
    }
  }
  // new people: most are average, some are bad, a few are exceptional
  let n = p0.nextJunior * 10 + season;
  for (const role of STAFF_ROLES) {
    for (let i = 0; i < 2; i++) {
      const x = newStaff(rng, role, season, n++, new Set(Object.values(staff).map((y) => y.name)));
      staff[x.id] = x;
      if (x.rating >= 89) news.push(`Mercado de directivos: ${x.name} (${STAFF_ROLE_INFO[role].label.toLowerCase()}, valoración ${x.rating}) busca equipo.`);
    }
    // the market can't grow forever: the weakest unemployed leave the sport
    const pool = Object.values(staff).filter((x) => !x.teamId && !x.signed && !x.retired && x.role === role).sort((a, b) => b.rating - a.rating);
    for (const x of pool.slice(10)) staff[x.id] = { ...x, retired: true };
  }
  for (const t of teams) {
    if (t.id === playerTeamId) continue;
    for (const role of STAFF_ROLES) {
      if (Object.values(staff).some((x) => x.teamId === t.id && x.role === role)) continue;
      const pool = Object.values(staff).filter((x) => !x.teamId && !x.signed && !x.retired && x.role === role).sort((a, b) => b.rating - a.rating);
      const pick = pool.length && rng.chance(0.7) ? pool[rng.int(0, Math.min(2, pool.length - 1))] : newStaff(rng, role, season, n++, new Set(Object.values(staff).map((y) => y.name)));
      staff[pick.id] = { ...pick, teamId: t.id, until: season + rng.int(1, 3) };
      news.push(`${t.name} contrata a ${pick.name} como ${STAFF_ROLE_INFO[role].label.toLowerCase()}.`);
    }
  }

  return { people: { ...p1, drivers, staff, rngState: rng.state(), nextJunior, talks: {} }, news };
}

/** Put each season's line-ups into the team list used by the races (keeps team order). */
export function applyLineups(teams: Team[], p: PeopleState): Team[] {
  return teams.map((t) => {
    const ids = lineup(p, t.id);
    const prevOrder = t.drivers.map((d) => d.id);
    ids.sort((a, b) => (prevOrder.indexOf(a) + 99 * +(prevOrder.indexOf(a) < 0)) - (prevOrder.indexOf(b) + 99 * +(prevOrder.indexOf(b) < 0)));
    const drivers: Driver[] = ids.slice(0, 2).map((id) => {
      const d = p.drivers[id];
      return {
        id: d.id, name: d.name, shortName: d.shortName, number: d.number, nationality: d.nationality,
        pace: d.pace, racecraft: d.racecraft, defending: d.defending, consistency: d.consistency, tyreMgmt: d.tyreMgmt,
      };
    });
    return { ...t, drivers };
  });
}
