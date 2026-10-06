// Drivers and staff over the years: contracts, salaries, the market, ageing and retirements.
import type { Driver, Team } from "@/data/f1Data";
import {
  EXTRA_DRIVERS, GRID_BIOS, JUNIOR_FIRST, JUNIOR_FLAGS, JUNIOR_LAST, STAFF,
  type StaffRole,
} from "@/data/peopleData";
import { createRng, type Rng } from "./rng";

export const FIRST_SEASON = 2026;

export interface Contract {
  teamId: string;
  salary: number; // M USD per season
  until: number; // last season (inclusive)
}

export type DriverStatus = "active" | "free" | "junior" | "retired";

export interface DriverRecord extends Driver {
  birthYear: number;
  potential: number;
  contract: Contract | null; // current contract
  nextContract: Contract | null; // signed for the following season
  status: DriverStatus;
  origin?: string;
}

export interface StaffRecord {
  id: string;
  name: string;
  role: StaffRole;
  rating: number;
  nationality: string;
  teamId: string | null;
  salary: number;
}

export interface PeopleState {
  version: 1;
  season: number;
  drivers: Record<string, DriverRecord>;
  staff: Record<string, StaffRecord>;
  rngState: number;
  nextJunior: number;
  salaryCap?: number | null; // regulation: max salary per driver
}

export const ageOf = (d: { birthYear: number }, season: number) => season - d.birthYear;

/** What a driver is worth per season (M USD): the best are very expensive, rookies cheap. */
export function marketValue(d: DriverRecord, season: number) {
  const age = ageOf(d, season);
  const base = 0.3 + Math.max(0, d.pace - 75) ** 2 * 0.075;
  const promise = age <= 23 ? Math.max(0, d.potential - d.pace) * 0.35 : 0;
  return Math.round((base + promise) * 10) / 10;
}

/** Salary a driver asks a given team: weaker cars must pay more, a known team principal helps. */
export function askingSalary(d: DriverRecord, season: number, carRank: number, tpRating = 80, cap?: number | null) {
  const k = (1 + (carRank - 5) * 0.04) * (1.08 - (tpRating - 70) * 0.006);
  const ask = Math.max(0.3, Math.round(marketValue(d, season) * k * 10) / 10);
  return cap ? Math.min(cap, ask) : ask;
}

export const staffSalary = (role: StaffRole, rating: number) =>
  Math.round((role === "tp" ? 1 + (rating - 70) * 0.25 : 1.5 + (rating - 70) * 0.35) * 10) / 10;

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
      };
      rec.contract = { teamId: t.id, salary: marketValue(rec, FIRST_SEASON), until: bio.until ?? FIRST_SEASON };
      drivers[d.id] = rec;
    }
  }
  for (const e of EXTRA_DRIVERS) {
    const { status, origin, birthYear, potential, ...base } = e;
    drivers[e.id] = { ...base, birthYear, potential, contract: null, nextContract: null, status, origin };
  }
  const staff: Record<string, StaffRecord> = {};
  for (const s of STAFF) staff[s.id] = { ...s, salary: staffSalary(s.role, s.rating) };
  return { version: 1, season: FIRST_SEASON, drivers, staff, rngState: seed, nextJunior: 1 };
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

export function teamStaff(p: PeopleState, teamId: string) {
  const list = Object.values(p.staff).filter((s) => s.teamId === teamId);
  return { tp: list.find((s) => s.role === "tp") ?? null, td: list.find((s) => s.role === "td") ?? null };
}

/** Ratings used by the management engine. */
export function staffRatings(p: PeopleState): Record<string, { tp: number; td: number }> {
  const out: Record<string, { tp: number; td: number }> = {};
  for (const s of Object.values(p.staff)) {
    if (!s.teamId) continue;
    out[s.teamId] ??= { tp: 75, td: 75 };
    out[s.teamId][s.role] = s.rating;
  }
  return out;
}

/** Yearly payroll of a team (drivers + staff), M USD. */
export function payroll(p: PeopleState, teamId: string) {
  const drivers = lineup(p, teamId).reduce((a, id) => a + (p.drivers[id].contract?.salary ?? 0), 0);
  const st = teamStaff(p, teamId);
  return { drivers, staff: (st.tp?.salary ?? 0) + (st.td?.salary ?? 0) };
}

// --- Market -------------------------------------------------------------------

/** Can this driver be signed for next season? */
export function availableForNextSeason(p: PeopleState, d: DriverRecord) {
  if (d.status === "retired" || d.nextContract) return false;
  if (!d.contract) return true;
  return d.contract.until <= p.season; // contract ends this season
}

export interface OfferResult {
  ok: boolean;
  message: string;
  people: PeopleState;
}

export function offerDriverContract(
  p: PeopleState,
  driverId: string,
  teamId: string,
  salary: number,
  years: number,
  carRank: number,
  tpRating: number,
): OfferResult {
  const d = p.drivers[driverId];
  if (!d) return { ok: false, message: "Piloto no encontrado", people: p };
  if (!availableForNextSeason(p, d)) return { ok: false, message: `${d.name} tiene contrato para la próxima temporada`, people: p };
  const seats = nextSeasonLineup(p, teamId).filter((x) => x.id !== driverId).length;
  if (seats >= 2) return { ok: false, message: "Ya tienes dos pilotos para la próxima temporada", people: p };
  const ask = askingSalary(d, p.season + 1, carRank, tpRating, p.salaryCap);
  if (p.salaryCap && salary > p.salaryCap + 1e-6) return { ok: false, message: `El tope salarial es US$ ${p.salaryCap} M por piloto`, people: p };
  const age = ageOf(d, p.season + 1);
  if (age >= 38 && years > 1) return { ok: false, message: `${d.name} solo acepta contratos de 1 año a su edad`, people: p };
  if (salary < ask * 0.97) return { ok: false, message: `${d.name} rechaza la oferta: pide al menos US$ ${ask.toFixed(1)} M por año`, people: p };
  const next = p.season + 1;
  return {
    ok: true,
    message: `${d.name} firma por ${years} año${years > 1 ? "s" : ""} (US$ ${salary.toFixed(1)} M/año) desde ${next}`,
    people: {
      ...p,
      drivers: { ...p.drivers, [driverId]: { ...d, nextContract: { teamId, salary, until: next + years - 1 } } },
    },
  };
}

/** Let a driver go at the end of the season (no renewal). */
export function releaseAtSeasonEnd(p: PeopleState, driverId: string): PeopleState {
  const d = p.drivers[driverId];
  if (!d?.contract || d.contract.until <= p.season) return p;
  return { ...p, drivers: { ...p.drivers, [driverId]: { ...d, contract: { ...d.contract, until: p.season } } } };
}

export function hireStaff(p: PeopleState, staffId: string, teamId: string): { people: PeopleState; cost: number; message: string } {
  const s = p.staff[staffId];
  if (!s || s.teamId) return { people: p, cost: 0, message: "No disponible" };
  const current = Object.values(p.staff).find((x) => x.teamId === teamId && x.role === s.role);
  const staff = { ...p.staff, [staffId]: { ...s, teamId } };
  let cost = s.salary * 0.5; // signing fee
  if (current) {
    staff[current.id] = { ...current, teamId: null };
    cost += current.salary * 0.5; // severance
  }
  return {
    people: { ...p, staff },
    cost: Math.round(cost * 10) / 10,
    message: `${s.name} es el nuevo ${s.role === "tp" ? "jefe de equipo" : "director técnico"}${current ? ` (reemplaza a ${current.name})` : ""}`,
  };
}

// --- Season change -------------------------------------------------------------

const capSalary = (p: PeopleState, s: number) => (p.salaryCap ? Math.min(p.salaryCap, s) : s);

const clamp = (x: number, lo = 50, hi = 99) => Math.max(lo, Math.min(hi, x));

/** One year of experience: young drivers grow towards their potential, veterans decline. */
function develop(d: DriverRecord, season: number, rng: Rng): DriverRecord {
  const age = ageOf(d, season);
  const gap = Math.max(0, d.potential - d.pace);
  let dp: number;
  if (age <= 23) dp = gap * (0.25 + rng.next() * 0.25);
  else if (age <= 27) dp = gap * (0.15 + rng.next() * 0.2);
  else if (age <= 31) dp = (rng.next() - 0.4) * 0.8;
  else if (age <= 35) dp = -rng.next() * 0.9;
  else dp = -(0.8 + rng.next() * 1.6);
  const exp = age <= 30 ? 0.5 + rng.next() : age >= 36 ? -(rng.next() * 0.8) : rng.next() * 0.4;
  return {
    ...d,
    pace: +clamp(d.pace + dp).toFixed(1),
    racecraft: +clamp(d.racecraft + exp).toFixed(1),
    defending: +clamp(d.defending + exp).toFixed(1),
    consistency: +clamp(d.consistency + exp * 1.2).toFixed(1),
    tyreMgmt: +clamp(d.tyreMgmt + exp).toFixed(1),
  };
}

function retireChance(age: number, contracted: boolean) {
  if (age < 35) return 0;
  const p = (age - 34) * 0.12;
  return contracted ? (age >= 41 ? p * 0.5 : 0) : p;
}

function newJunior(rng: Rng, season: number, n: number): DriverRecord {
  const first = rng.pick(JUNIOR_FIRST);
  const last = rng.pick(JUNIOR_LAST);
  const pace = 70 + rng.next() * 7;
  const potential = Math.min(98, pace + 8 + rng.next() * 16);
  const base = 72 + rng.next() * 6;
  return {
    id: `jr${season}-${n}`,
    name: `${first} ${last}`,
    shortName: last.slice(0, 3).toUpperCase(),
    number: 50 + ((n * 7) % 49),
    nationality: rng.pick(JUNIOR_FLAGS),
    pace: +pace.toFixed(1),
    racecraft: +base.toFixed(1),
    defending: +(base - 1).toFixed(1),
    consistency: +(base + rng.next() * 2).toFixed(1),
    tyreMgmt: +base.toFixed(1),
    birthYear: season - rng.int(18, 20),
    potential: +potential.toFixed(1),
    contract: null,
    nextContract: null,
    status: "junior",
    origin: "Fórmula 2",
  };
}

/** AI choice for an empty seat: top teams want pace, smaller teams value price and promise. */
function aiPick(p: PeopleState, carRank: number, season: number, taken: Set<string>): DriverRecord | null {
  const pool = Object.values(p.drivers).filter(
    (d) => (d.status === "free" || d.status === "junior") && !taken.has(d.id) && !d.nextContract,
  );
  if (!pool.length) return null;
  const priceWeight = 0.08 + carRank * 0.03;
  const score = (d: DriverRecord) =>
    d.pace + (ageOf(d, season) <= 23 ? (d.potential - d.pace) * 0.35 : 0) - marketValue(d, season) * priceWeight;
  return pool.sort((a, b) => score(b) - score(a))[0];
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
): SeasonChange {
  const rng = createRng(p0.rngState);
  const news: string[] = [];
  const old = p0.season;
  const season = old + 1;
  const drivers: Record<string, DriverRecord> = structuredClone(p0.drivers);

  // 1) AI renewals for contracts ending now
  for (const d of Object.values(drivers)) {
    if (!d.contract || d.contract.until !== old || d.nextContract || d.status !== "active") continue;
    if (d.contract.teamId === playerTeamId) continue;
    const age = ageOf(d, season);
    const teamPace = teams.find((t) => t.id === d.contract!.teamId)?.drivers.map((x) => x.pace) ?? [];
    const keep = age <= 38 && d.pace >= Math.max(...teamPace, 0) - 4 && rng.chance(0.8);
    if (keep) {
      const years = age >= 35 ? 1 : rng.int(1, 3);
      d.nextContract = { teamId: d.contract.teamId, salary: capSalary(p0, marketValue(d, season)), until: season + years - 1 };
    }
  }

  const prevTeam = new Map(Object.values(drivers).map((d) => [d.id, d.contract?.teamId ?? null]));

  // 2) contracts change over
  for (const d of Object.values(drivers)) {
    if (d.status === "retired") continue;
    if (d.nextContract) {
      if (d.contract?.teamId && d.nextContract.teamId !== d.contract.teamId) {
        const to = teams.find((t) => t.id === d.nextContract!.teamId)?.name ?? d.nextContract.teamId;
        news.push(`${d.name} se cambia a ${to}.`);
      }
      if (d.status === "junior") news.push(`${d.name} debuta en la Fórmula 1 con ${teams.find((t) => t.id === d.nextContract!.teamId)?.name}.`);
      d.contract = d.nextContract;
      d.nextContract = null;
      d.status = "active";
    } else if (d.contract && d.contract.until < season) {
      d.contract = null;
      d.status = "free";
    }
  }

  // 3) development and retirements
  for (const id of Object.keys(drivers)) {
    const d = drivers[id];
    if (d.status === "retired") continue;
    const before = d.pace;
    const dev = develop(d, season, rng);
    drivers[id] = dev;
    const age = ageOf(dev, season);
    if (dev.status === "active" && dev.pace - before >= 3) news.push(`${dev.name} da un gran salto (+${(dev.pace - before).toFixed(1)} de ritmo).`);
    if (rng.chance(retireChance(age, !!dev.contract))) {
      if (dev.contract) news.push(`${dev.name} anuncia su retiro a los ${age} años.`);
      else if (dev.status === "free" && dev.pace > 82) news.push(`${dev.name} se retira de la Fórmula 1 (${age} años).`);
      drivers[id] = { ...dev, status: "retired", contract: null, nextContract: null };
    }
    if (dev.status === "junior" && age >= 26) drivers[id] = { ...drivers[id], status: "free" };
  }

  // 4) fill seats
  const p1: PeopleState = { ...p0, drivers, season };
  const taken = new Set<string>();
  for (const t of teams) {
    let current = lineup(p1, t.id, season);
    while (current.length < 2) {
      const pick = aiPick(p1, carRanks[t.id] ?? 6, season, taken);
      if (!pick) break;
      taken.add(pick.id);
      const years = ageOf(pick, season) <= 24 ? 2 : 1;
      const salary = capSalary(p0, marketValue(pick, season));
      drivers[pick.id] = { ...pick, status: "active", contract: { teamId: t.id, salary, until: season + years - 1 } };
      const again = prevTeam.get(pick.id) === t.id;
      news.push(
        t.id === playerTeamId
          ? `Tu equipo tenía un asiento libre: se contrató a ${pick.name} (US$ ${salary.toFixed(1)} M/año).`
          : again
            ? `${pick.name} renueva con ${t.name}.`
            : `${t.name} ficha a ${pick.name}${prevTeam.get(pick.id) ? "" : pick.origin === "Fórmula 2" ? " desde la Fórmula 2" : ""}.`,
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

  // 5) new juniors from the feeder series
  let nextJunior = p0.nextJunior;
  for (let i = 0; i < 4; i++) {
    const j = newJunior(rng, season, nextJunior++);
    const used = new Set(Object.values(drivers).filter((d) => d.status !== "retired").map((d) => d.shortName));
    const last = j.name.split(" ").slice(-1)[0].toUpperCase();
    for (const cand of [j.shortName, last.slice(0, 2) + last.slice(-1), last[0] + last.slice(2, 4), `J${(nextJunior % 90) + 10}`]) {
      if (!used.has(cand)) {
        j.shortName = cand;
        break;
      }
    }
    drivers[j.id] = j;
  }

  return { people: { ...p1, drivers, rngState: rng.state(), nextJunior }, news };
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
