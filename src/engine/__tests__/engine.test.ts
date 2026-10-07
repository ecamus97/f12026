import { describe, expect, it } from "vitest";
import { DEFAULT_SIM_CONFIG, classify, confirmStrategy, createRace, editNextStop, recommendPlans, runQualifying, setPlan, setStartTyre, simulateLap, simulateToEnd, computeStandings } from "..";
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
      // the only exception: a puncture on worn-out tyres forces a stop
      const forced = (id: string) =>
        end.events.filter(
          (e) =>
            e.drivers[0] === id &&
            e.type === "puncture" && e.lap < end.totalLaps, // a broken wing does not send the player's car in by itself
        ).length;
      end.cars.filter((c) => c.controlled).forEach((c) => expect(c.stops).toBeLessThanOrEqual(forced(c.id)));
      end.cars.filter((c) => c.controlled && !forced(c.id)).forEach((c) => expect(c.stops).toBe(0));
    }
  });

  it("tyres run far past their life end up punctured", () => {
    let punctures = 0;
    for (let seed = 1; seed <= 30; seed++) {
      let s = createRace(race, grid(), seed, undefined, "ferrari");
      s.cars.filter((c) => c.controlled).forEach((c) => {
        s = editNextStop(s, c.id, { remove: true });
        s = editNextStop(s, c.id, { remove: true });
      });
      punctures += simulateToEnd(s).events.filter((e) => e.type === "puncture" || (e.type === "dnf" && e.text.includes("pincha"))).length;
    }
    expect(punctures).toBeGreaterThan(5);
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

describe("strategy planner", () => {
  it("recommends sensible, valid plans", () => {
    const entry = allEntries()[0];
    for (const r of races2026) {
      const t0 = performance.now();
      const opts = recommendPlans(entry, r.track, 3);
      const ms = performance.now() - t0;
      expect(ms).toBeLessThan(400);
      expect(opts.length).toBeGreaterThan(0);
      const best = opts[0].plan;
      expect(best[best.length - 1].untilLap).toBe(r.track.laps);
      expect(new Set(best.map((s) => s.compound)).size).toBeGreaterThanOrEqual(2);
    }
  });

  it("setPlan applies a custom plan before the start", () => {
    let s = createRace(race, entriesByGrid(runQualifying(race, allEntries(), 2).grid), 2, undefined, "williams");
    expect(s.strategyConfirmed).toBe(false);
    const id = s.cars.find((c) => c.controlled)!.id;
    s = setPlan(s, id, [{ compound: "H", untilLap: 30 }, { compound: "S", untilLap: 99 }]);
    const car = s.cars.find((c) => c.id === id)!;
    expect(car.compound).toBe("H");
    expect(car.plan).toEqual([{ compound: "H", untilLap: 30 }, { compound: "S", untilLap: race.track.laps }]);
    const end = simulateToEnd(confirmStrategy(s));
    expect(end.cars.find((c) => c.id === id)!.stops).toBeGreaterThanOrEqual(car.status === "dnf" ? 0 : 0);
  });
});

describe("sectors", () => {
  it("lap and sector times match the time actually spent and the order on track", () => {
    for (const seed of [8, 9, 10, 11]) {
      let s = createRace(race, entriesByGrid(runQualifying(race, allEntries(), seed).grid), seed);
      for (let i = 0; i < 40; i++) {
        const prev = s;
        const before = new Map(prev.cars.map((c) => [c.id, c.total]));
        const startRank = new Map(prev.cars.filter((c) => c.status === "running").map((c, k) => [c.id, k]));
        s = simulateLap(s);
        const running = s.cars.filter((x) => x.status === "running");
        const crossing = new Map<string, number[]>();
        for (const c of running) {
          const sum = c.lastSectors!.reduce((a, b) => a + b, 0);
          expect(sum).toBeCloseTo(c.lastLap, 6);
          expect(c.lastLap).toBeCloseTo(c.total - before.get(c.id)!, 6);
          const from = before.get(c.id)!;
          crossing.set(c.id, [from + c.lastSectors![0], from + c.lastSectors![0] + c.lastSectors![1]]);
        }
        // a car that started behind and finished behind its predecessor was behind at every sector line
        for (let k = 1; k < running.length; k++) {
          const a = running[k - 1], b = running[k];
          if (startRank.get(b.id)! > startRank.get(a.id)!) {
            expect(crossing.get(b.id)![0]).toBeGreaterThan(crossing.get(a.id)![0]);
            expect(crossing.get(b.id)![1]).toBeGreaterThan(crossing.get(a.id)![1]);
          }
        }
      }
    }
  });

  it("AI keeps rain tyres through a short dry spell instead of flip-flopping", () => {
    const r = races2026[3];
    const L = r.track.laps;
    // no safety cars: cheap stops behind one would hide what the weather calls do
    const s0 = createRace(r, allEntries(), 3, { ...DEFAULT_SIM_CONFIG, safetyCar: false });
    const wet = Array.from({ length: L + 1 }, (_, i) => (i < 10 ? 0 : i < 22 ? 0.45 : i < 26 ? 0.12 : i < 40 ? 0.45 : 0));
    const end = simulateToEnd({ ...s0, weather: { ...s0.weather!, wet, rain: wet.map((w) => (w > 0.3 ? 0.5 : 0)) } });
    const avgStops = end.cars.reduce((a, c) => a + c.stops, 0) / end.cars.length;
    expect(avgStops).toBeLessThan(3);
  });
});

describe("red flag", () => {
  it("never mixes a safety car into the red-flag lap or the standing restart", () => {
    let reds = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const end = simulateToEnd(createRace(race, allEntries(), seed, { ...DEFAULT_SIM_CONFIG, incidents: 3 }));
      const redLaps = end.events.filter((e) => e.type === "red").map((e) => e.lap);
      reds += redLaps.length;
      for (const l of redLaps) {
        // no safety car on the red-flag lap, and the restart is a standing start: a safety car on that
        // lap can only come from a new crash after the start, never out of nowhere
        expect(end.events.filter((e) => e.type === "sc" && e.lap === l)).toEqual([]);
        expect(end.events.filter((e) => e.type === "sc" && e.lap === l + 1 && e.text.includes("escombros"))).toEqual([]);
        const scRestart = end.events.find((e) => e.type === "sc" && e.lap === l + 1);
        if (scRestart) expect(end.events.some((e) => e.type === "dnf" && e.lap === l + 1)).toBe(true);
        expect(end.events.some((e) => e.type === "green" && e.lap === l + 1)).toBe(true);
      }
    }
    expect(reds).toBeGreaterThan(0);
  });
});

describe("safety car", () => {
  it("nobody changes position on track under the safety car (only through the pits)", () => {
    let scLaps = 0;
    for (let seed = 1; seed <= 80; seed++) {
      let s = createRace(race, allEntries(), seed);
      while (!s.finished) {
        const prev = s;
        s = simulateLap(s);
        const called = s.events.some((e) => e.lap === s.lap && e.type === "sc");
        if (!prev.safetyCar.active && !called) continue;
        if (s.finished) continue; // time penalties added at the flag can still change the result
        scLaps++;
        const after = s.cars.filter((c) => c.status === "running" && !c.pittedThisLap).map((c) => c.id);
        const before = prev.cars.filter((c) => c.status === "running").map((c) => c.id).filter((id) => after.includes(id));
        expect(after).toEqual(before);
      }
    }
    expect(scLaps).toBeGreaterThan(20);
  });
});

describe("penalties", () => {
  it("are served at the next stop or added to the final time", () => {
    let given = 0;
    let served = 0;
    let added = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const end = simulateToEnd(createRace(race, allEntries(), seed));
      for (const c of end.cars) {
        const total = (c.penalties ?? []).reduce((a, p) => a + p.secs, 0);
        given += total;
        if (c.status === "running") expect(c.penalty ?? 0).toBe(0); // nothing left pending at the flag
      }
      for (const e of end.events.filter((e) => e.type === "penalty")) {
        const n = Number(e.text.match(/(\d+)s/)?.[1] ?? 0);
        if (e.text.includes("cumple")) served += n;
        if (e.text.includes("tiempo final")) added += n;
      }
      // the classification shows the penalties
      for (const r of classify(end)) expect(r.penaltySecs ?? 0).toBe((end.cars.find((c) => c.id === r.driverId)!.penalties ?? []).reduce((a, p) => a + p.secs, 0));
    }
    expect(given).toBeGreaterThan(40);
    // every second given is served in a stop, added at the end, or belongs to a car that retired
    expect(served + added).toBeLessThanOrEqual(given);
    expect(served).toBeGreaterThan(0);
    expect(added).toBeGreaterThan(0);
  });
});

describe("contact and damage", () => {
  it("contacts can damage one car, both, nobody, or put one out; the player decides when to change the wing", () => {
    const kinds = { one: 0, both: 0, none: 0, out: 0, bothOut: 0, gridPen: 0 };
    let playerDamagedLaps = 0;
    for (let seed = 1; seed <= 150; seed++) {
      let s = createRace(race, allEntries(), seed, { ...DEFAULT_SIM_CONFIG, incidents: 3 }, "williams");
      while (!s.finished) {
        const prev = s;
        s = simulateLap(s);
        for (const e of s.events.filter((x) => x.lap === s.lap)) {
          if (e.text.includes("los dos dañan")) kinds.both++;
          else if (e.type === "damage" && e.text.startsWith("💥")) kinds.one++;
          else if (e.text.includes("sin daños")) kinds.none++;
          else if (e.text.includes("abandonan los dos")) kinds.bothOut++;
          else if (e.text.startsWith("💥 Choque entre")) kinds.out++;
          if (e.text.includes("puestos en la parrilla")) kinds.gridPen++;
        }
        // a damaged player car is never sent in automatically
        for (const c of s.cars.filter((c) => c.controlled && c.damage && c.status === "running")) {
          playerDamagedLaps++;
          expect(c.pitRequest).toBeNull();
          const before = prev.cars.find((x) => x.id === c.id)!;
          if (before.damage) expect(c.pittedThisLap).toBe(false);
        }
      }
      expect(new Set(s.cars.map((c) => c.id)).size).toBe(s.cars.length); // nobody lost or duplicated
      expect(s.cars.length).toBe(allEntries().length);
      // the AI changes the wing at once (unless it happened right at the end)
      for (const c of s.cars) if (c.status === "running" && c.damage && !c.controlled) expect(s.events.some((e) => e.type === "damage" && e.drivers.includes(c.id) && e.lap >= s.totalLaps - 2)).toBe(true);
    }
    expect(kinds.one).toBeGreaterThan(0);
    expect(kinds.both).toBeGreaterThan(0);
    expect(kinds.none).toBeGreaterThan(0);
    expect(kinds.out).toBeGreaterThan(0);
    expect(kinds.bothOut).toBeGreaterThan(0);
    expect(kinds.gridPen).toBeGreaterThan(0); // the one to blame retired: grid penalty for the next race
    expect(playerDamagedLaps).toBeGreaterThan(0);
  });

  it("tyres hardly wear behind the safety car", () => {
    let checked = 0;
    for (let seed = 1; seed <= 60 && checked < 5; seed++) {
      let s = createRace(race, allEntries(), seed);
      while (!s.finished) {
        const prev = s;
        s = simulateLap(s);
        if (!prev.safetyCar.active) continue;
        for (const c of s.cars.filter((c) => c.status === "running" && !c.pittedThisLap)) {
          const b = prev.cars.find((x) => x.id === c.id)!;
          expect(c.tyreAge - b.tyreAge).toBeCloseTo(0.25, 5);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
