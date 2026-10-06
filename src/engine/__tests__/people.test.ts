import { describe, expect, it } from "vitest";
import { teams } from "@/data/f1Data";
import {
  advanceSeason, applyLineups, askingSalary, carRankOf, initManagement, initPeople, lineup, offerDriverContract,
  hireStaff, payroll, startNewSeason, constructorsPrize, applyDevToTeams, staffRatings, nextSeasonLineup,
  willRetire, signableNow, midSeasonMarket, fireStaff, ageOf,
} from "@/engine";

const ranks = () => Object.fromEntries(teams.map((t, i) => [t.id, i + 1]));

describe("people and seasons", () => {
  it("starts with the real grid under contract", () => {
    const p = initPeople(teams, 1);
    for (const t of teams) expect(lineup(p, t.id).sort()).toEqual(t.drivers.map((d) => d.id).sort());
    expect(staffRatings(p).mclaren.td).toBeGreaterThan(80);
    expect(payroll(p, "mclaren").drivers).toBeGreaterThan(payroll(p, "haas").drivers);
  });

  it("keeps two drivers per team over many seasons, with retirements and growth", () => {
    let p = initPeople(teams, 7);
    let ts = applyLineups(teams, p);
    const news: string[] = [];
    for (let y = 0; y < 8; y++) {
      const r = advanceSeason(p, ts, "williams", ranks());
      p = r.people;
      news.push(...r.news);
      // the player's empty seats are not filled for them: sign free agents now
      while (lineup(p, "williams").length < 2) {
        const pick = Object.values(p.drivers).filter(signableNow).sort((a, b) => b.pace - a.pace)[0];
        const o = offerDriverContract(p, pick.id, "williams", 99, 1, 6, 86);
        expect(o.ok).toBe(true);
        p = o.people;
      }
      ts = applyLineups(ts, p);
      const seen = new Set<string>();
      for (const t of ts) {
        expect(t.drivers.length).toBe(2);
        for (const d of t.drivers) {
          expect(seen.has(d.id)).toBe(false);
          seen.add(d.id);
        }
      }
    }
    expect(p.season).toBe(2034);
    expect(p.drivers.alo.status).toBe("retired");
    expect(p.drivers.ham.status).toBe("retired");
    // a top prospect should have grown close to his potential
    expect(p.drivers.cam.pace).toBeGreaterThan(84);
    expect(news.length).toBeGreaterThan(10);
  });

  it("market: asking salary, refusals and signings for next season", () => {
    const p = initPeople(teams, 3);
    const ask = askingSalary(p.drivers.cam, 2027, 6, 86);
    const low = offerDriverContract(p, "cam", "williams", ask * 0.5, 2, 6, 86);
    expect(low.ok).toBe(false);
    // Albon is under contract until 2027: can't be signed for 2027
    expect(offerDriverContract(p, "nor", "williams", 99, 2, 6, 86).ok).toBe(false);
    // Sainz's deal ends in 2026; Williams can't sign a third driver while Albon continues + Câmara signed
    const ok = offerDriverContract(p, "cam", "williams", ask, 2, 6, 86);
    expect(ok.ok).toBe(true);
    expect(nextSeasonLineup(ok.people, "williams").map((d) => d.id).sort()).toEqual(["alb", "cam"]);
    expect(offerDriverContract(ok.people, "tsu", "williams", 50, 1, 6, 86).ok).toBe(false);
    const next = advanceSeason(ok.people, teams, "williams", ranks()).people;
    expect(lineup(next, "williams").sort()).toEqual(["alb", "cam"]);
    expect(next.drivers.sai.contract?.teamId).not.toBe("williams");
  });

  it("hiring staff for a taken post: no severance, joins when the season ends", () => {
    const p = initPeople(teams, 3);
    const r = hireStaff(p, "horner", "haas", 2, 5);
    expect(r.cost).toBeCloseTo(2.5, 5); // only the signing fee
    expect(r.people.staff.horner.teamId).toBeNull();
    expect(r.people.staff.horner.signed?.teamId).toBe("haas");
    expect(r.people.staff.komatsu.teamId).toBe("haas");
    const next = advanceSeason(r.people, teams, "haas", ranks()).people;
    expect(next.staff.horner.teamId).toBe("haas");
    expect(next.staff.horner.until).toBe(2028);
    expect(next.staff.komatsu.teamId).not.toBe("haas");
    // firing the holder brings the signed replacement in at once
    const f = fireStaff(r.people, "komatsu");
    expect(f.cost).toBeGreaterThan(0);
    expect(f.people.staff.horner.teamId).toBe("haas");
  });

  it("the player's empty seat stays empty and renewed veterans don't retire", () => {
    let p = initPeople(teams, 4);
    // let Hamilton's deal run out at Ferrari and renew him for next year
    p = { ...p, drivers: { ...p.drivers, ham: { ...p.drivers.ham, contract: { ...p.drivers.ham.contract!, until: 2026 }, nextContract: { teamId: "ferrari", salary: 20, until: 2027 } } } };
    const lec = p.drivers.lec;
    p = { ...p, drivers: { ...p.drivers, lec: { ...lec, contract: { ...lec.contract!, until: 2026 } } } };
    const r = advanceSeason(p, teams, "ferrari", ranks());
    expect(r.people.drivers.ham.status).toBe("active");
    expect(r.people.drivers.ham.contract?.teamId).toBe("ferrari");
    expect(lineup(r.people, "ferrari")).toEqual(["ham"]);
    expect(r.news.some((n) => n.startsWith("Tu equipo") && n.includes("asiento libre"))).toBe(true);
    // AI teams still fill their seats
    for (const t of teams) if (t.id !== "ferrari") expect(lineup(r.people, t.id).length).toBe(2);
  });

  it("drivers who will retire refuse to renew", () => {
    const p = initPeople(teams, 4);
    const old = Object.values(p.drivers).find((d) => d.contract && ageOf(d, 2027) >= 38);
    expect(old).toBeTruthy();
    for (let seed = 0; seed < 40; seed++) {
      const d = { ...old!, id: `${old!.id}${seed}`, contract: { ...old!.contract!, until: 2026 } };
      if (!willRetire(d, 2026)) continue;
      const q = { ...p, drivers: { ...p.drivers, [d.id]: d } };
      const o = offerDriverContract(q, d.id, d.contract.teamId, 99, 1, 6, 86);
      expect(o.ok).toBe(false);
      expect(o.message).toContain("retira");
      return;
    }
    throw new Error("no retiring case found");
  });

  it("mid-season renewals never give a team three drivers", () => {
    let p = initPeople(teams, 9);
    const end = (id: string) => ({ ...p.drivers[id], contract: { ...p.drivers[id].contract!, until: 2026 } });
    p = { ...p, drivers: { ...p.drivers, oco: end("oco"), bea: end("bea") } };
    for (let i = 0; i < 30; i++) {
      p = midSeasonMarket(p, teams, "williams", ranks(), i).people;
      for (const t of teams) expect(nextSeasonLineup(p, t.id).length).toBeLessThanOrEqual(2);
    }
    const after = advanceSeason(p, teams, "williams", ranks()).people;
    for (const d of Object.values(p.drivers)) if (d.nextContract && d.status !== "retired") expect(after.drivers[d.id].contract?.teamId).toBe(d.nextContract.teamId);
  });

  it("new season pays the constructors prize and narrows the field", () => {
    const m = initManagement(teams, "williams", 5);
    const order = teams.map((t) => t.id);
    const n = startNewSeason(m, teams, order, 2027);
    expect(n.player!.budget).toBeCloseTo(m.player!.budget + constructorsPrize(order.indexOf("williams") + 1), 1);
    const spread = (x: typeof m) => {
      const ps = applyDevToTeams(teams, x).map((t) => t.pace);
      return Math.max(...ps) - Math.min(...ps);
    };
    expect(spread(n)).toBeLessThan(spread(m));
    expect(n.history.map((h) => h.round)).toEqual([-1, 0]);
    expect(carRankOf(n, "williams")).toBeGreaterThan(0);
  });
});

import { negotiate, talkOf, talkLocked } from "@/engine";
describe("negotiations", () => {
  it("counters, accepts the counter and walks out after bad offers", () => {
    const p = initPeople(teams, 3);
    const o = { ask: 10, years: 2, age: 28, name: "X", round: 3 };
    const a = negotiate(p, "d:test", { ...o, salary: 8 });
    expect(["counter", "accept"]).toContain(a.result);
    if (a.result === "counter") {
      expect(a.counter!).toBeLessThanOrEqual(10.1);
      expect(negotiate(a.people, "d:test", { ...o, salary: a.counter! }).result).toBe("accept");
    }
    let q = p;
    let last = "";
    for (let i = 0; i < 6; i++) {
      const r = negotiate(q, "d:cheap", { ...o, salary: 3 });
      q = r.people;
      last = r.result;
      if (r.result === "walkout") break;
    }
    expect(last).toBe("walkout");
    expect(talkLocked(talkOf(q, "d:cheap"), p.season, 4)).toBe(true);
    expect(negotiate(q, "d:cheap", { ...o, salary: 50, round: 4 }).result).toBe("locked");
    expect(negotiate(q, "d:cheap", { ...o, salary: 50, round: 8 }).result).toBe("accept");
    expect(negotiate(p, "d:fair", { ...o, salary: 10 }).result).toBe("accept");
  });

  it("top teams sign proven pace, small teams young talent", () => {
    let p = initPeople(teams, 11);
    let ts = applyLineups(teams, p);
    const rk = ranks();
    const arrivals: { rank: number; age: number; pace: number }[] = [];
    for (let y = 0; y < 6; y++) {
      for (const r of [8, 12, 16, 20]) p = midSeasonMarket(p, ts, null, rk, y * 100 + r).people;
      const before = Object.fromEntries(Object.values(p.drivers).map((d) => [d.id, d.contract?.teamId ?? null]));
      p = advanceSeason(p, ts, null, rk).people;
      ts = applyLineups(ts, p);
      for (const d of Object.values(p.drivers)) {
        const to = d.contract?.teamId;
        if (to && before[d.id] !== to) arrivals.push({ rank: rk[to], age: ageOf(d, p.season), pace: d.pace });
      }
    }
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const top = arrivals.filter((a) => a.rank <= 3);
    const small = arrivals.filter((a) => a.rank >= 8);
    expect(top.length).toBeGreaterThan(0);
    expect(small.length).toBeGreaterThan(0);
    expect(avg(top.map((a) => a.pace))).toBeGreaterThan(avg(small.map((a) => a.pace)));
    expect(avg(small.map((a) => a.age))).toBeLessThan(avg(top.map((a) => a.age)) + 1);
  });

  it("free drivers keep changing: rust without a seat, form with one", () => {
    let p = initPeople(teams, 5);
    const free = Object.values(p.drivers).filter((d) => d.status === "free" && ageOf(d, 2027) >= 26);
    expect(free.length).toBeGreaterThan(0);
    const r = advanceSeason(p, teams, null, ranks(), { nor: 1, pia: -1 }).people;
    const stillFree = free.filter((d) => r.drivers[d.id].status === "free");
    expect(stillFree.some((d) => r.drivers[d.id].pace < d.pace)).toBe(true);
    expect(r.drivers.nor.racecraft).toBeGreaterThan(r.drivers.pia.racecraft - (p.drivers.pia.racecraft - p.drivers.nor.racecraft) - 0.01);
  });
});
