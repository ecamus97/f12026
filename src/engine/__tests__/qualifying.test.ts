import { describe, expect, it } from "vitest";
import { races2026 } from "@/data/f1Data";
import {
  advanceTo, autoPlan, canGoOut, carPhase, DEFAULT_SIM_CONFIG, finishQualifying, generateDayWeather, goOut, nextSession,
  sessionRows, startQualifying, stayIn, type DayWeather, type QualiCtx,
} from "..";
import { allEntries } from "./helpers";

const race = races2026[3];
const ctxWith = (weather: DayWeather): QualiCtx => ({
  track: race.track,
  entries: new Map(allEntries().map((e) => [e.driver.id, e])),
  cfg: DEFAULT_SIM_CONFIG,
  weather,
});
const custom = (rainFrom: number, rainTo: number, peak: number): DayWeather => {
  const rain = Array.from({ length: 81 }, (_, m) => (m >= rainFrom && m <= rainTo ? peak : 0));
  const wet = [0];
  for (let m = 1; m < 81; m++) wet.push(Math.max(0, Math.min(1, wet[m - 1] + rain[m] * 0.2 - (rain[m] < 0.05 ? 0.04 : 0))));
  return { rain, wet, cloud: rain.map((r) => (r ? 1 : 0.2)), trackTemp: rain.map((r) => (r ? 22 : 38)), airTemp: 24, seed: 5 };
};
const dry = custom(999, 999, 0);

describe("live qualifying", () => {
  it("in the dry the second run is usually quicker (the track rubbers in)", () => {
    let better = 0;
    let total = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { live } = startQualifying(ctxWith(dry), race.id, seed);
      for (const c of live.cars) {
        const [a, b] = c.runs;
        if (a?.time && b?.time) {
          total++;
          if (b.time < a.time) better++;
        }
      }
    }
    expect(better / total).toBeGreaterThan(0.65);
  });

  it("with rain on the way the teams set their time before it arrives", () => {
    const ctx = ctxWith(custom(9, 40, 0.5));
    const { live, result } = startQualifying(ctx, race.id, 3);
    const res = nextSession(ctx, live, result).result;
    const rows = res.sessions[0].rows.filter((r) => r.best > 0);
    // best laps are dry laps: far quicker than anything on a wet track
    expect(rows.filter((r) => r.best < race.track.baseLap + 4).length).toBeGreaterThan(rows.length * 0.8);
  });

  it("the player decides when each car goes out", () => {
    const ctx = ctxWith(dry);
    let { live } = startQualifying(ctx, race.id, 9);
    const id = live.cars[0].id;
    live = stayIn(live, id);
    expect(live.cars[0].runs).toHaveLength(0);
    live = advanceTo(ctx, live, 120);
    expect(canGoOut(ctx, live, id)).toBeNull();
    live = goOut(ctx, live, id);
    const run = live.cars[0].runs[0];
    expect(run.start).toBe(120);
    expect(carPhase(live, id, 130).phase).toBe("out");
    expect(carPhase(live, id, run.flyStart + 1).phase).toBe("push");
    expect(canGoOut(ctx, live, id)).not.toBeNull(); // already on track
    live = advanceTo(ctx, live, run.inEnd + 60);
    live = autoPlan(ctx, live, id);
    expect(live.cars[0].runs.length).toBeGreaterThan(1);
    expect(live.cars[0].runs[1].start).toBeGreaterThanOrEqual(run.inEnd);
  });

  it("a whole qualifying fills three sessions and a full grid", () => {
    const ctx = ctxWith(generateDayWeather(race.track, 4, true));
    const { live, result } = startQualifying(ctx, race.id, 4, true);
    const res = finishQualifying(ctx, live, result);
    expect(res.sessions.map((s) => s.rows.length)).toEqual([22, 16, 10]);
    expect(new Set(res.grid).size).toBe(22);
    expect(sessionRows(live).length).toBe(22);
  });
});

describe("qualifying surprises", () => {
  it("crashes and failures sometimes knock a top driver out before Q3, but not often", () => {
    const entries = allEntries();
    const top = new Set(
      [...entries].sort((a, b) => b.team.pace - a.team.pace || b.driver.pace - a.driver.pace).slice(0, 8).map((e) => e.driver.id),
    );
    let retirements = 0;
    let topOut = 0;
    let damagedNext = 0; // cars missing the next session (repairs)
    const N = 80;
    for (let seed = 1; seed <= N; seed++) {
      const ctx = ctxWith(generateDayWeather(race.track, seed, false));
      let { live, result } = startQualifying(ctx, race.id, seed);
      while (live) {
        const fin = advanceTo(ctx, live, live.duration);
        retirements += fin.cars.filter((c) => c.runs.some((r) => r.retired)).length;
        const step = nextSession(ctx, fin, result);
        result = step.result;
        live = step.live;
        if (live) damagedNext += live.cars.filter((c) => c.noCar).length;
      }
      topOut += result.grid.slice(10).filter((id) => top.has(id)).length;
    }
    const perQuali = retirements / N;
    expect(perQuali).toBeGreaterThan(0.3);
    expect(perQuali).toBeLessThan(3);
    // a top-8 car outside the top 10 happens now and then
    expect(topOut).toBeGreaterThan(3);
    expect(topOut / N).toBeLessThan(1.5);
    expect(damagedNext).toBeGreaterThan(0);
  });
});
