import { describe, expect, it } from "vitest";
import { teams } from "@/data/f1Data";
import {
  advanceSeason, applyLineups, askingSalary, carRankOf, initManagement, initPeople, lineup, offerDriverContract,
  hireStaff, payroll, startNewSeason, constructorsPrize, applyDevToTeams, staffRatings, nextSeasonLineup,
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

  it("hiring staff swaps the old one out and costs money", () => {
    const p = initPeople(teams, 3);
    const r = hireStaff(p, "horner", "haas");
    expect(r.cost).toBeGreaterThan(0);
    expect(r.people.staff.horner.teamId).toBe("haas");
    expect(r.people.staff.komatsu.teamId).toBeNull();
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
    expect(n.history).toHaveLength(1);
    expect(carRankOf(n, "williams")).toBeGreaterThan(0);
  });
});
