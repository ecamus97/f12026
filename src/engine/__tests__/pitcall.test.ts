import { describe, expect, it } from "vitest";
import { createRace, requestPit, simulateLap } from "../race";
import { races2026 } from "@/data/f1Data";
import { allEntries } from "./helpers";

describe("pit call in the middle of a lap", () => {
  it("the car stops on that lap and the rest of the field's lap barely changes", () => {
    let same = 0;
    let total = 0;
    for (let seed = 1; seed <= 30; seed++) {
      let s = createRace(races2026[seed % races2026.length], allEntries(), seed, undefined, "williams");
      while (s.lap < 15 && !s.finished) s = simulateLap(s);
      const me = s.cars.find((c) => c.controlled && c.status === "running");
      if (!me || s.safetyCar.active) continue;
      const plain = simulateLap(s);
      const called = simulateLap(requestPit(s, me.id, "H"));
      expect(called.cars.find((c) => c.id === me.id)!.pittedThisLap).toBe(true);
      const others = (x: typeof s) =>
        x.events.slice(s.events.length).filter((e) => !e.drivers.includes(me.id) && e.type !== "overtake" && e.type !== "fastest").map((e) => e.text);
      total++;
      if (JSON.stringify(others(plain)) === JSON.stringify(others(called))) same++;
    }
    expect(total).toBeGreaterThan(15);
    expect(same / total).toBeGreaterThan(0.9);
  });
});
