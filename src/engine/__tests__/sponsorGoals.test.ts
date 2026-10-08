import { describe, expect, it } from "vitest";
import { goalLabel, makeSponsorGoals, updateSponsorGoals, type SponsorGoal } from "../sponsors";
import { ensureSponsorGoals, initManagement, processRaceWeekend } from "../management";
import { teams } from "@/data/f1Data";

const race = (o: Partial<{ points: number; podiums: number; bothScored: boolean; dnfs: number; rivalPoints: Record<string, number> }> = {}) => ({
  points: 0, podiums: 0, bothScored: false, dnfs: 0, rivalPoints: {}, ...o,
});

describe("sponsor objectives", () => {
  it("principal sponsors set two different goals, secondary ones one, scaled to the team", () => {
    const top = makeSponsorGoals({ id: "s1", name: "A", slot: "principal", style: "rendimiento" }, { champRank: 1, carRank: 1, races: 10 });
    const back = makeSponsorGoals({ id: "s1", name: "A", slot: "principal", style: "rendimiento" }, { champRank: 10, carRank: 10, races: 10 });
    expect(top).toHaveLength(2);
    expect(new Set(top.map((g) => g.kind)).size).toBe(2);
    const sec = makeSponsorGoals({ id: "s2", name: "B", slot: "secundario", style: "estable" }, { champRank: 5, carRank: 5, races: 8 });
    expect(sec).toHaveLength(1);
    const pts = (gs: SponsorGoal[]) => gs.find((g) => g.kind === "points")?.target ?? 0;
    if (pts(top) && pts(back)) expect(pts(top)).toBeGreaterThan(pts(back));
    expect(back.some((g) => g.kind === "podiums")).toBe(false); // no podium goals for a backmarker
    for (const g of [...top, ...back, ...sec]) expect(goalLabel(g).length).toBeGreaterThan(5);
  });

  it("is deterministic per deal", () => {
    const a = makeSponsorGoals({ id: "s9", name: "X", slot: "principal", style: "premium" }, { champRank: 3, carRank: 4, races: 6 });
    const b = makeSponsorGoals({ id: "s9", name: "X", slot: "principal", style: "premium" }, { champRank: 3, carRank: 4, races: 6 });
    expect(a).toEqual(b);
  });

  it("points goals complete when reached, dnf goals fail when exceeded, the rest settle at the end", () => {
    const goals: SponsorGoal[] = [
      { kind: "points", target: 10, progress: 0, reward: 2, fine: 0, status: "active" },
      { kind: "maxDnf", target: 1, progress: 0, reward: 1, fine: 0.5, status: "active" },
      { kind: "beatRival", target: 0, progress: 0, rivalId: "x", rivalProgress: 0, reward: 1, fine: 0, status: "active" },
      { kind: "champRank", target: 4, progress: 0, reward: 1, fine: 0, status: "active" },
    ];
    let r = updateSponsorGoals(goals, race({ points: 12, dnfs: 1, rivalPoints: { x: 4 } }), 5, false);
    expect(r.goals[0].status).toBe("done");
    expect(r.goals[1].status).toBe("active");
    expect(r.settled.map((g) => g.kind)).toEqual(["points"]);
    r = updateSponsorGoals(r.goals, race({ dnfs: 1, rivalPoints: { x: 2 } }), 4, true);
    expect(r.goals[1].status).toBe("failed");
    expect(r.goals[2].status).toBe("done"); // 12 vs 6
    expect(r.goals[3].status).toBe("done");
  });

  it("contracts from old saves get goals, and goals pay out after a race", () => {
    let m = initManagement(teams, teams[5].id, 7);
    const offer = m.player!.offers[0];
    expect(offer.goals?.length).toBeGreaterThan(0);
    // an old save: a signed contract without goals
    m = { ...m, player: { ...m.player!, sponsors: [{ ...offer, goals: undefined, racesLeft: 1 }], offers: m.player!.offers.slice(1) } };
    m = ensureSponsorGoals(m);
    expect(m.player!.sponsors[0].goals?.length).toBeGreaterThan(0);
    const rows = teams.flatMap((t) => t.drivers.map((d) => ({ driverId: d.id, teamId: t.id })))
      .map((r, i) => ({ ...r, position: i + 1, status: "finished" as const, points: Math.max(0, 10 - i), laps: 50, gap: "", totalTime: 0, bestLap: 0, stops: 1 }));
    const after = processRaceWeekend(m, teams, rows as never, 1);
    // last race of the contract: every goal is settled
    const msgs = after.inbox.filter((x) => x.text.includes(offer.name));
    expect(msgs.length).toBeGreaterThan(0);
  });
});
