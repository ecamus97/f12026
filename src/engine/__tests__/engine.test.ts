import { describe, expect, it } from "vitest";
import { classify, createRace, runQualifying, simulateLap, simulateToEnd, computeStandings } from "..";
import { teams, races2026 } from "@/data/f1Data";
import { allEntries, entriesByGrid } from "./helpers";

const race = races2026[0];

describe("qualifying", () => {
  it("eliminates 6 in Q1, 6 in Q2 and produces a full grid", () => {
    const q = runQualifying(race, allEntries(), 42);
    expect(q.sessions[0].rows).toHaveLength(22);
    expect(q.sessions[1].rows).toHaveLength(16);
    expect(q.sessions[2].rows).toHaveLength(10);
    expect(new Set(q.grid).size).toBe(22);
    // grid 11-16 are Q2 eliminated ordered by Q2 time
    const q2out = q.sessions[1].rows.filter((r) => r.eliminated).map((r) => r.driverId);
    expect(q.grid.slice(10, 16)).toEqual(q2out);
  });

  it("is deterministic for a seed", () => {
    expect(runQualifying(race, allEntries(), 7).grid).toEqual(runQualifying(race, allEntries(), 7).grid);
  });
});

describe("race", () => {
  it("runs the full distance and classifies every car", () => {
    const q = runQualifying(race, allEntries(), 1);
    const end = simulateToEnd(createRace(race, entriesByGrid(q.grid), 1));
    expect(end.lap).toBe(race.track.laps);
    const rows = classify(end);
    expect(rows).toHaveLength(22);
    expect(rows.map((r) => r.position)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
    const finishers = rows.filter((r) => r.status === "finished");
    // displayed order == time order
    const running = end.cars.filter((c) => c.status === "running");
    for (let i = 1; i < running.length; i++) expect(running[i].total).toBeGreaterThanOrEqual(running[i - 1].total);
    // every finisher used 2 compounds
    running.forEach((c) => expect(c.usedCompounds.length).toBeGreaterThanOrEqual(2));
    expect(finishers.length).toBeGreaterThanOrEqual(10);
    expect(rows.reduce((a, r) => a + r.points, 0)).toBe(101);
  });

  it("is deterministic and survives JSON round-trips (autosave)", () => {
    const grid = entriesByGrid(runQualifying(race, allEntries(), 3).grid);
    let a = createRace(race, grid, 99);
    let b = JSON.parse(JSON.stringify(a));
    for (let i = 0; i < 20; i++) {
      a = simulateLap(a);
      b = JSON.parse(JSON.stringify(simulateLap(b)));
    }
    expect(b.cars.map((c: { id: string }) => c.id)).toEqual(a.cars.map((c) => c.id));
  });

  it("builds standings from results", () => {
    const grid = entriesByGrid(runQualifying(race, allEntries(), 5).grid);
    const end = simulateToEnd(createRace(race, grid, 5));
    const rows = classify(end);
    const s = computeStandings(teams, [{ raceId: 1, rows, pole: grid[0].driver.id, fastestLap: null }]);
    expect(s.drivers[0].driverId).toBe(rows[0].driverId);
    expect(s.drivers[0].points).toBe(25);
    expect(s.teams.reduce((a, t) => a + t.points, 0)).toBe(rows.reduce((a, r) => a + r.points, 0));
  });
});
