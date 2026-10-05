import { describe, expect, it } from "vitest";
import { classify, createRace, editNextStop, runQualifying, setStartTyre, simulateLap, simulateToEnd, computeStandings } from "..";
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

describe("manager controls", () => {
  const grid = () => entriesByGrid(runQualifying(race, allEntries(), 11).grid);

  it("player cars only stop when planned or requested", () => {
    for (let seed = 1; seed <= 30; seed++) {
      let s = createRace(race, grid(), seed, undefined, "ferrari");
      // remove every planned stop for Ferrari: they must never pit
      s.cars.filter((c) => c.controlled).forEach((c) => {
        s = editNextStop(s, c.id, { remove: true });
        s = editNextStop(s, c.id, { remove: true });
      });
      const end = simulateToEnd(s);
      end.cars.filter((c) => c.controlled).forEach((c) => expect(c.stops).toBe(0));
    }
  });

  it("setStartTyre changes the starting compound and keeps two compounds in the plan", () => {
    let s = createRace(race, grid(), 3, undefined, "mclaren");
    const id = s.cars.find((c) => c.controlled)!.id;
    s = setStartTyre(s, id, "H");
    const car = s.cars.find((c) => c.id === id)!;
    expect(car.compound).toBe("H");
    expect(new Set(car.plan.map((p) => p.compound)).size).toBeGreaterThanOrEqual(2);
  });

  it("editNextStop moves the stop lap within bounds", () => {
    let s = createRace(race, grid(), 4, undefined, "mclaren");
    const id = s.cars.find((c) => c.controlled)!.id;
    s = editNextStop(s, id, { remove: true });
    s = editNextStop(s, id, { remove: true });
    s = editNextStop(s, id, { add: true });
    s = editNextStop(s, id, { lap: 999 });
    expect(s.cars.find((c) => c.id === id)!.plan[0].untilLap).toBe(race.track.laps - 1);
  });
});
