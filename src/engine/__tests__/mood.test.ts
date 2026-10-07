import { describe, expect, it } from "vitest";
import { teams, races2026 } from "@/data/f1Data";
import {
  BASE_MORALE, classify, createRace, formOf, initPeople, moodAfterRace, moodEffect, moraleOf, setInstruction, setTeamOrder, simulateLap,
  withMood, type ClassifiedRow,
} from "..";
import { allEntries } from "./helpers";

const row = (driverId: string, teamId: string, position: number, status: "finished" | "dnf" = "finished", dnfReason?: string): ClassifiedRow => ({
  position, driverId, teamId, grid: position, status, gap: "", points: 0, stops: 1, bestLap: 90, dnfReason,
});

describe("morale and form", () => {
  const people = initPeople(teams, 1);
  const wil = teams.find((t) => t.id === "williams")!;
  const [a, b] = wil.drivers.map((d) => d.id);
  const opts = { season: 2026, round: 1, carRank: () => 6, playerTeamId: "williams" };

  it("a podium beyond what the car allows lifts morale; a crash drops it", () => {
    const res = moodAfterRace(people, [row(a, "williams", 3), row(b, "williams", 22, "dnf", "Accidente")], opts);
    expect(moraleOf(res.people.drivers[a])).toBeGreaterThan(BASE_MORALE + 5);
    expect(moraleOf(res.people.drivers[b])).toBeLessThan(BASE_MORALE - 2);
    expect(formOf(res.people.drivers[a])).toBeGreaterThan(0.5); // one race only counts a third
    expect(res.people.drivers[a].formLog).toHaveLength(1);
  });

  it("good spirits make the driver a bit quicker and more consistent", () => {
    const happy = { ...people.drivers[a], morale: 95, formLog: [{ season: 2026, round: 1, pos: 2, expected: 11, score: 3 }] };
    expect(moodEffect(happy).pace).toBeGreaterThan(0.5);
    const entries = withMood(allEntries(), { ...people, drivers: { ...people.drivers, [a]: happy } });
    const before = allEntries().find((e) => e.driver.id === a)!.driver.pace;
    expect(entries.find((e) => e.driver.id === a)!.driver.pace).toBeGreaterThan(before);
  });

  it("obeying a team order costs the driver who gives way", () => {
    const res = moodAfterRace(people, [row(a, "williams", 10), row(b, "williams", 11)], {
      ...opts,
      orders: [{ lap: 20, teamId: "williams", kind: "swap", yielded: b, favored: a, obeyed: true }],
    });
    expect(moraleOf(res.people.drivers[b])).toBeLessThan(moraleOf(res.people.drivers[a]) - 5);
    expect(res.notes.length).toBeGreaterThan(0);
  });
});

describe("race instructions and team orders", () => {
  const race = races2026[3];
  it("a team order lets the teammate through and is logged", () => {
    let swaps = 0;
    let logged = 0;
    for (let seed = 1; seed <= 20; seed++) {
      let s = createRace(race, allEntries(), seed, undefined, "williams");
      while (s.lap < 20) s = simulateLap(s);
      const mine = s.cars.filter((c) => c.controlled && c.status === "running");
      if (mine.length < 2) continue;
      s = setTeamOrder(s, "williams", { kind: "swap", favored: mine[1].id });
      for (let i = 0; i < 6 && !s.finished; i++) s = simulateLap(s);
      if (s.orderLog?.some((o) => o.kind === "swap")) logged++;
      if (s.orderLog?.some((o) => o.obeyed && o.kind === "swap")) swaps++;
    }
    // happy drivers obey (only when the teammate gets close enough is the order carried out)
    expect(swaps).toBeGreaterThan(5);
    expect(swaps / logged).toBeGreaterThan(0.8);
  });

  it("attacking gains positions on average over racing free", () => {
    const gain = (instr: "free" | "attack") => {
      let g = 0;
      for (let seed = 1; seed <= 25; seed++) {
        let s = createRace(race, allEntries(), seed, undefined, "williams");
        for (const c of s.cars.filter((c) => c.controlled)) s = setInstruction(s, c.id, instr);
        while (!s.finished) s = simulateLap(s);
        for (const r of classify(s).filter((r) => r.teamId === "williams")) g += r.grid - r.position;
      }
      return g;
    };
    expect(gain("attack")).toBeGreaterThan(gain("free"));
  });
});
