// Drivers and staff over the years: contracts, salaries, the market, ageing and retirements.
import type { Driver, Team } from "@/data/f1Data";
import {
  EXTRA_DRIVERS, GRID_BIOS, JUNIOR_FIRST, JUNIOR_FLAGS, JUNIOR_LAST, STAFF, STAFF_ROLES, STAFF_ROLE_INFO, STAFF_FIRST, STAFF_LAST,
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
  mods?: { stat: string; delta: number; label: string; season: number }[]; // recent changes from events
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
  for (const s of STAFF) staff[s.id] = { ...s, salary: staffSalary(s.role, s.rating), until: s.teamId ? s.until ?? FIRST_SEASON + 1 : undefined };
  return { version: 1, season: FIRST_SEASON, drivers, staff, rngState: seed, nextJunior: 1 };
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

export type StaffRatings = Record<StaffRole, number>;

/** Ratings used by the management engine (an empty position counts as a weak one). */
export function staffRatings(p: PeopleState): Record<string, StaffRatings> {
  const out: Record<string, StaffRatings> = {};
  const teams = new Set(Object.values(p.drivers).map((d) => d.contract?.teamId).filter(Boolean) as string[]);
  for (const s of Object.values(p.staff)) if (s.teamId) teams.add(s.teamId);
  for (const t of teams) out[t] = Object.fromEntries(STAFF_ROLES.map((r) => [r, VACANT_RATING])) as StaffRatings;
  for (const s of Object.values(p.staff)) if (s.teamId) out[s.teamId][s.role] = s.rating;
  return out;
}

/** Yearly payroll of a team (drivers + staff), M USD. */
export function payroll(p: PeopleState, teamId: string) {
  const drivers = lineup(p, teamId).reduce((a, id) => a + (p.drivers[id].contract?.salary ?? 0), 0);
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
  return hash01(`${d.id}:${season}`) < retireChance(ageOf(d, season + 1), false);
}

/** Does the team have an empty seat right now (this season)? */
export const seatOpenNow = (p: PeopleState, teamId: string) => lineup(p, teamId).length < 2;

/** Can this driver join right away (a free agent or a junior)? */
export const signableNow = (d: DriverRecord) => (d.status === "free" || d.status === "junior") && !d.contract && !d.nextContract;

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

/** Let a driver go at the end of the season (no renewal). */
export function releaseAtSeasonEnd(p: PeopleState, driverId: string): PeopleState {
  const d = p.drivers[driverId];
  if (!d?.contract || d.contract.until <= p.season) return p;
  return { ...p, drivers: { ...p.drivers, [driverId]: { ...d, contract: { ...d.contract, until: p.season } } } };
}

export function hireStaff(p: PeopleState, staffId: string, teamId: string, years = 3, salary?: number): { people: PeopleState; cost: number; message: string } {
  const s = p.staff[staffId];
  if (!s || s.teamId || s.signed) return { people: p, cost: 0, message: "No disponible" };
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
  if (!s || s.teamId || s.signed) return { people: p, result: "reject", message: "No disponible", cost: 0 };
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

function newStaff(rng: Rng, role: StaffRole, season: number, n: number): StaffRecord {
  const rating = Math.round(68 + rng.next() * 16);
  return {
    id: `st${season}-${n}`,
    name: `${rng.pick(STAFF_FIRST)} ${rng.pick(STAFF_LAST)}`,
    role,
    rating,
    nationality: rng.pick(JUNIOR_FLAGS),
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
      const keep = age <= 37 && d.pace >= (mate?.pace ?? 0) - 4;
      if (keep && rng.chance(0.35)) {
        const years = age >= 34 ? 1 : rng.int(1, 3);
        const salary = capSalary(p0, marketValue(d, next));
        drivers[d.id] = { ...d, nextContract: { teamId: t.id, salary, until: next + years - 1 } };
        moves.push({ kind: "renew", driverId: d.id, teamId: t.id, fromTeamId: t.id, until: next + years - 1, salary });
      }
    }
    // 2) a signing for an open seat next year
    if (nextSeasonLineup(p, t.id).length >= 2 || !rng.chance(0.3)) continue;
    const pool = Object.values(drivers).filter(
      (d) => d.status !== "retired" && !d.nextContract && d.contract?.teamId !== t.id && availableForNextSeason(p, d) && ageOf(d, next) <= 36 && !willRetire(d, p0.season),
    );
    if (!pool.length) continue;
    const score = (d: DriverRecord) =>
      d.pace + (ageOf(d, next) <= 23 ? (d.potential - d.pace) * 0.35 : 0) - marketValue(d, next) * (0.08 + rank * 0.03) + rng.next();
    const pick = pool.sort((a, b) => score(b) - score(a))[0];
    const current = Object.values(drivers).filter((d) => d.contract?.teamId === t.id && d.status === "active");
    if (pick.pace < Math.min(...current.map((d) => d.pace), 99) - 1) continue; // only if it's an upgrade
    const years = ageOf(pick, next) <= 24 ? 2 : rng.int(1, 2);
    const salary = capSalary(p0, marketValue(pick, next));
    drivers[pick.id] = { ...pick, nextContract: { teamId: t.id, salary, until: next + years - 1 } };
    moves.push({ kind: "sign", driverId: pick.id, teamId: t.id, fromTeamId: pick.contract?.teamId ?? null, until: next + years - 1, salary });
  }
  return { people: p, moves };
}

// --- Season change -------------------------------------------------------------

const capSalary = (p: PeopleState, s: number) => (p.salaryCap ? Math.min(p.salaryCap, s) : s);

const clamp = (x: number, lo = 50, hi = 99) => Math.max(lo, Math.min(hi, x));

/** One year of experience: young drivers grow towards their potential, veterans decline. */
function develop(d: DriverRecord, season: number, rng: Rng, coach = 80): DriverRecord {
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
  const ratings = staffRatings(p0);
  for (const id of Object.keys(drivers)) {
    const d = drivers[id];
    if (d.status === "retired") continue;
    const before = d.pace;
    const coach = d.contract?.teamId ? ratings[d.contract.teamId]?.race ?? VACANT_RATING : 75;
    const dev = develop(d, season, rng, coach);
    drivers[id] = dev;
    const age = ageOf(dev, season);
    if (dev.status === "active" && dev.pace - before >= 3) news.push(`${dev.name} da un gran salto (+${(dev.pace - before).toFixed(1)} de ritmo).`);
    if (retiring.has(id)) {
      if (p0.drivers[id]?.contract || dev.pace > 82) news.push(`${dev.name} se retira de la Fórmula 1 a los ${age} años.`);
      drivers[id] = { ...dev, status: "retired", contract: null, nextContract: null };
    }
    if (dev.status === "junior" && age >= 26) drivers[id] = { ...drivers[id], status: "free" };
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
      const pick = aiPick(p1, carRanks[t.id] ?? 6, season, taken);
      if (!pick) break;
      taken.add(pick.id);
      const years = ageOf(pick, season) <= 24 ? 2 : 1;
      const salary = capSalary(p0, marketValue(pick, season));
      drivers[pick.id] = { ...pick, status: "active", contract: { teamId: t.id, salary, until: season + years - 1 } };
      const again = prevTeam.get(pick.id) === t.id;
      news.push(
        again
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
    } else if (rng.chance(0.8)) {
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
  let n = p0.nextJunior * 10;
  for (const role of STAFF_ROLES) for (let i = 0; i < 1; i++) {
    const x = newStaff(rng, role, season, n++);
    if (rng.chance(0.5)) staff[x.id] = x;
  }
  for (const t of teams) {
    if (t.id === playerTeamId) continue;
    for (const role of STAFF_ROLES) {
      if (Object.values(staff).some((x) => x.teamId === t.id && x.role === role)) continue;
      const pool = Object.values(staff).filter((x) => !x.teamId && !x.signed && x.role === role).sort((a, b) => b.rating - a.rating);
      const pick = pool.length && rng.chance(0.7) ? pool[rng.int(0, Math.min(2, pool.length - 1))] : newStaff(rng, role, season, n++);
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
