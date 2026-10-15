import { describe, expect, it } from "vitest";
import { teams } from "@/data/f1Data";
import { advanceSeason, ageOf, applyLineups, initPeople, lineup, migrateJuniors, offerDriverContract, signableNow, type PeopleState } from "@/engine";

const ranks = () => Object.fromEntries(teams.map((t, i) => [t.id, i + 1]));

function seasons(seed: number, n: number, each?: (p: PeopleState, news: string[]) => void) {
  let p = initPeople(teams, seed);
  for (let y = 0; y < n; y++) {
    const r = advanceSeason(p, applyLineups(teams, p), "williams", ranks());
    p = r.people;
    while (lineup(p, "williams").length < 2) {
      const pick = Object.values(p.drivers).filter(signableNow).sort((a, b) => b.pace - a.pace)[0];
      p = offerDriverContract(p, pick.id, "williams", 99, 1, 6, 86).people;
    }
    each?.(p, r.news);
  }
  return p;
}

describe("junior ladder", () => {
  it("invented teenagers don't show up with F1 pace", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      seasons(seed, 4, (p) => {
        const fast = Object.values(p.drivers).filter((d) => d.id.startsWith("jr") && d.status === "junior" && ageOf(d, p.season) <= 19 && d.pace >= 78);
        expect(fast.length).toBe(0);
      });
    }
  });

  it("in the first seasons F1 teams sign the real F2/F3 talents before invented ones", () => {
    let real = 0;
    let invented = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      seasons(seed, 3, (p) => {
        for (const d of Object.values(p.drivers)) {
          if (d.status !== "active" || (d.f1Seasons ?? 0) > 0 || !d.contract || d.contract.teamId === "williams") continue;
          if (d.id.startsWith("jr")) invented++;
          else real++;
        }
      });
    }
    expect(real).toBeGreaterThan(invented * 3);
  });

  it("old saves: inflated invented juniors are brought back and the real F3 drivers are added", () => {
    const p0 = initPeople(teams, 3);
    const d = Object.values(p0.drivers).find((x) => x.id.startsWith("jr"))!;
    const drivers = { ...p0.drivers, [d.id]: { ...d, pace: 82.1, birthYear: 2028 - 18 } };
    delete drivers.ugo;
    const p = migrateJuniors({ ...p0, season: 2028, drivers, juniorsV: undefined });
    expect(p.drivers[d.id].pace).toBeLessThan(76);
    expect(p.drivers.ugo?.series).toBe("F2");
  });
});
