import { describe, expect, it } from "vitest";
import { generatePress, type PressDriver } from "..";

const drivers: PressDriver[] = [
  { id: "alb", name: "Alex Albon", index: 0, morale: 65, form: 0, contractEnds: false },
  { id: "sai", name: "Carlos Sainz", index: 1, morale: 65, form: 0, contractEnds: false },
];
const base = { season: 2026, from: new Date(2026, 2, 9), team: "Williams Racing", rival: "Ferrari", drivers, orders: [] };

describe("press conferences", () => {
  it("ask about what happened: a team order", () => {
    let asked = 0;
    for (let r = 2; r <= 40; r++) {
      const a = generatePress({
        ...base,
        beforeRound: r,
        seed: r * 13,
        lastRace: [{ id: "alb", pos: 8, crash: false }, { id: "sai", pos: 9, crash: false }],
        orders: [{ lap: 30, teamId: "williams", kind: "swap", yielded: "alb", favored: "sai", obeyed: true }],
      });
      if (a?.title.includes("dejar pasar")) {
        asked++;
        expect(a.kind).toBe("press");
        expect(a.choices).toHaveLength(3);
        expect(a.choices[0].effect.morale?.find((m) => m.id === "alb")!.delta).toBeLessThan(0);
      }
    }
    expect(asked).toBeGreaterThan(10);
  });

  it("not before the first race, and not always", () => {
    expect(generatePress({ ...base, beforeRound: 1, seed: 1, lastRace: [] })).toBeNull();
    let n = 0;
    for (let r = 2; r <= 40; r++) if (generatePress({ ...base, beforeRound: r, seed: r, lastRace: [{ id: "alb", pos: 12, crash: false }, { id: "sai", pos: 14, crash: false }] })) n++;
    expect(n).toBeLessThan(25); // quiet weekends rarely make the news
  });
});
