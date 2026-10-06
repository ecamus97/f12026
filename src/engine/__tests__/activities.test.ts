import { describe, expect, it } from "vitest";
import { races2026 } from "@/data/f1Data";
import { generateActivities, weekendDates, describeEffect } from "@/engine";

describe("agenda", () => {
  it("parses race weekends into real dates", () => {
    for (const r of races2026) {
      const d = weekendDates(r.date, 2026);
      expect(d.end.getTime()).toBeGreaterThanOrEqual(d.start.getTime());
      expect([0, 6]).toContain(d.end.getDay()); // Sunday (Las Vegas runs on Saturday night)
    }
  });
  it("creates activities between races with three choices", () => {
    let total = 0;
    for (let i = 1; i < races2026.length; i++) {
      const a = generateActivities({
        season: 2026, beforeRound: i + 1, from: weekendDates(races2026[i - 1].date, 2026).end, to: weekendDates(races2026[i].date, 2026).start,
        team: "Williams", drivers: ["Alex Albon", "Carlos Sainz"], sponsors: [], seed: 5, taken: [],
      });
      for (const x of a) {
        expect(x.choices).toHaveLength(3);
        expect(x.date > `2026-01-01`).toBe(true);
        x.choices.forEach((c) => describeEffect(c.effect));
      }
      total += a.length;
    }
    expect(total).toBeGreaterThan(10);
  });
});
