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
