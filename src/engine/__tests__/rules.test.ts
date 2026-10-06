import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, generateProposals, resolveVote, rulesFor, tally, initManagement, canStartProject, type TeamContext } from "@/engine";
import { teams } from "@/data/f1Data";

const ctx = (): TeamContext[] => teams.map((t, i) => ({ teamId: t.id, carRank: i + 1, puRank: i + 1, driverPayroll: 40 - i * 3, teams: teams.length }));

describe("regulations", () => {
  it("announces an FIA decree and votes during the season", () => {
    let all = [] as ReturnType<typeof generateProposals>;
    for (let r = 1; r <= 24; r++) all = [...all, ...generateProposals(2026, r, rulesFor(2027, DEFAULT_RULES, all), all, 42)];
    expect(all.filter((p) => p.by === "fia")).toHaveLength(1);
    expect(all.filter((p) => p.by === "vote")).toHaveLength(2);
    expect(new Set(all.map((p) => p.key)).size).toBe(all.length);
  });

  it("teams vote by self-interest and the result applies next season", () => {
    const p = { id: "x", season: 2026, effective: 2027, round: 10, key: "budgetCap", patch: { budgetCap: 60 }, title: "", desc: "", by: "vote" as const, status: "pending" as const };
    const r = resolveVote(p, ctx(), "williams", "for", 1);
    expect(Object.keys(r.votes!)).toHaveLength(teams.length);
    expect(r.votes!.williams).toBe("for");
    expect(r.votes![teams[0].id]).not.toBe("for"); // the best team doesn't want a cap
    const n = tally(r.votes);
    expect(r.status).toBe(n.for > n.against ? "approved" : "rejected");
    if (r.status === "approved") expect(rulesFor(2027, DEFAULT_RULES, [r]).budgetCap).toBe(60);
    expect(rulesFor(2026, DEFAULT_RULES, [r]).budgetCap).toBeNull();
  });

  it("budget cap and engine freeze limit the player's development", () => {
    const m = { ...initManagement(teams, "mclaren", 3), regs: { budgetCap: 5, puFreeze: true, flatPrize: false } };
    expect(canStartProject(m, "ice")).toMatch(/congelados/);
    expect(canStartProject(m, "floor")).toMatch(/Límite/);
    expect(canStartProject(m, "fw")).toBeNull();
  });
});

import { applyRegulationImpact, carPace } from "@/engine";
describe("regulation impact on the cars", () => {
  it("a new aero rule shrinks the aero gaps and is recorded per team", () => {
    const m = initManagement(teams, "williams", 9);
    const spread = (x: typeof m) => {
      const v = Object.values(x.dev).map((d) => d.aero);
      return Math.max(...v) - Math.min(...v);
    };
    const r = applyRegulationImpact({ ...m, player: { ...m.player!, partLevels: { fw: 2, ice: 1 } } }, ["aero"], false, 4);
    expect(spread(r.m)).toBeLessThan(spread(m) * 0.8);
    expect(Object.keys(r.impact)).toHaveLength(teams.length);
    expect(r.impact.williams.aero).toBeDefined();
    expect(r.impact.williams.powerUnit).toBeUndefined();
    expect(r.m.player!.partLevels).toEqual({ ice: 1 }); // aero parts obsolete
    expect(r.m.history.at(-1)!.round).toBe(0);
  });
  it("a new budget cap trims only the teams above average", () => {
    const m = initManagement(teams, "williams", 9);
    const r = applyRegulationImpact(m, [], true, 4);
    const best = teams[0].id;
    expect(carPace(r.m.dev[best])).toBeLessThan(carPace(m.dev[best]));
    expect(carPace(r.m.dev.cadillac)).toBe(carPace(m.dev.cadillac));
  });
});

import { forecast, generateWeather } from "@/engine";
import { races2026 } from "@/data/f1Data";
describe("forecast", () => {
  it("is the same before the race and changes gradually during it", () => {
    const track = races2026.find((r) => r.country === "Belgium")!.track;
    let maxJump = 0;
    for (let seed = 1; seed < 40; seed++) {
      const w = generateWeather(track, track.laps, seed);
      expect(forecast(w, 0)).toEqual(forecast(w, -10));
      for (let lap = 0; lap < track.laps - 6; lap += 3) {
        const a = forecast(w, lap, 4);
        const b = forecast(w, lap + 3, 4);
        for (const x of b) {
          const y = a.find((q) => q.toLap === x.toLap);
          if (y && x.fromLap === y.fromLap) maxJump = Math.max(maxJump, Math.abs(x.chance - y.chance));
        }
      }
    }
    expect(maxJump).toBeLessThanOrEqual(30);
  });
});
