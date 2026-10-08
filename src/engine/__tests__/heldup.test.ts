import { describe, expect, it } from "vitest";
import { createRace, simulateLap } from "../race";
import { races2026 } from "@/data/f1Data";
import { allEntries } from "./helpers";

describe("being held up", () => {
  it("the car right behind one that runs wide goes straight past it instead of losing the same time", () => {
    let cases = 0;
    let passed = 0;
    for (let seed = 1; seed <= 40; seed++) {
      let s = createRace(races2026[seed % races2026.length], allEntries(), seed);
      while (!s.finished) {
        const run = s.cars.filter((c) => c.status === "running");
        const n0 = s.events.length;
        const quiet = !s.safetyCar.active && !s.safetyCar.restartLap && !s.standingRestart && s.lap > 2;
        s = simulateLap(s);
        if (!quiet || s.safetyCar.active || s.redFlag) continue;
        const fresh = s.events.slice(n0);
        for (const e of fresh.filter((x) => x.type === "mistake" && x.text.includes("se pasa de largo"))) {
          const i = run.findIndex((c) => c.id === e.drivers[0]);
          const behind = run[i + 1];
          if (!behind || behind.total - run[i].total > 1.0) continue;
          const b = s.cars.find((c) => c.id === behind.id)!;
          if (b.status !== "running" || b.pittedThisLap || fresh.some((x) => x.type !== "overtake" && x.drivers.includes(b.id))) continue;
          cases++;
          const order = s.cars.map((c) => c.id);
          if (order.indexOf(b.id) < order.indexOf(e.drivers[0])) passed++;
        }
      }
    }
    expect(cases).toBeGreaterThan(15);
    expect(passed / cases).toBeGreaterThan(0.9);
  });
});
