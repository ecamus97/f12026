// Run with: CALIBRATE=1 npx vitest run src/engine/__tests__/calibrate.test.ts
import { it } from "vitest";
import { classify, createRace, runQualifying, simulateLap } from "..";
import { races2026 } from "@/data/f1Data";
import { allEntries, entriesByGrid } from "./helpers";

const N = Number(process.env.CALIBRATE_N ?? 20); // seasons

it.runIf(!!process.env.CALIBRATE)("calibration report", () => {
  const wins: Record<string, number> = {};
  const poles: Record<string, number> = {};
  let rainRaces = 0, wetPits = 0, fuelDnf = 0, slickWetLaps = 0;
  const monzaWins: Record<string, number> = {}, monacoWins: Record<string, number> = {};
  let races = 0, poleWins = 0, dnfs = 0, scRaces = 0, overtakes = 0, stops = 0, winGap = 0, mistakes = 0;
  const perTrack: Record<string, { ovt: number; n: number; stops: number }> = {};
  const strat: Record<string, number> = {};
  let seed = 1;
  for (let s = 0; s < N; s++) {
    for (const race of races2026) {
      const q = runQualifying(race, allEntries(), seed++);
      poles[q.grid[0]] = (poles[q.grid[0]] ?? 0) + 1;
      const start = createRace(race, entriesByGrid(q.grid), seed++);
      start.cars.forEach((c) => {
        const k = c.plan.map((p) => p.compound).join("-");
        strat[k] = (strat[k] ?? 0) + 1;
      });
      let sim = start;
      while (!sim.finished) {
        sim = simulateLap(sim);
        const w = sim.weather!.wet[sim.lap];
        if (w > 0.35) slickWetLaps += sim.cars.filter((c) => c.status === "running" && !["I", "W"].includes(c.compound)).length;
      }
      const end = sim;
      if (end.weather!.rain.some((r) => r > 0.08)) rainRaces++;
      wetPits += end.events.filter((e) => e.type === "pit" && /Intermedio|Lluvia/.test(e.text)).length;
      fuelDnf += end.cars.filter((c) => c.dnfReason === "Sin combustible").length;
      const wteam = end.cars[0].entry.team.id;
      if (race.id === 15) monzaWins[wteam] = (monzaWins[wteam] ?? 0) + 1;
      if (race.id === 8) monacoWins[wteam] = (monacoWins[wteam] ?? 0) + 1;
      const rows = classify(end);
      races++;
      wins[rows[0].driverId] = (wins[rows[0].driverId] ?? 0) + 1;
      if (rows[0].driverId === q.grid[0]) poleWins++;
      dnfs += rows.filter((r) => r.status === "dnf").length;
      if (end.events.some((e) => e.type === "sc")) scRaces++;
      const o = end.events.filter((e) => e.type === "overtake").length;
      overtakes += o;
      mistakes += end.events.filter((e) => e.type === "mistake").length;
      const st = rows.reduce((a, r) => a + r.stops, 0) / 22;
      stops += st;
      const running = end.cars.filter((c) => c.status === "running");
      winGap += running[1].total - running[0].total;
      const pt = (perTrack[race.circuit] ??= { ovt: 0, n: 0, stops: 0 });
      pt.ovt += o; pt.n++; pt.stops += st;
    }
  }
  const pct = (x: number) => ((x / races) * 100).toFixed(1) + "%";
  const top = (m: Record<string, number>) =>
    Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${pct(v)}`).join("  ");
  console.log(`races=${races}`);
  console.log(`pole->win ${pct(poleWins)} | DNF/race ${(dnfs / races).toFixed(2)} | SC races ${pct(scRaces)} | overtakes/race ${(overtakes / races).toFixed(1)} | mistakes/race ${(mistakes / races).toFixed(1)} | stops/car ${(stops / races).toFixed(2)} | P1-P2 gap ${(winGap / races).toFixed(2)}s`);
  console.log("WINS  " + top(wins));
  console.log(`rain races ${pct(rainRaces)} | wet-tyre stops/race ${(wetPits / races).toFixed(1)} | car-laps on slicks with wet>0.35: ${slickWetLaps} | fuel DNFs ${fuelDnf}`);
  console.log("MONZA winners " + JSON.stringify(monzaWins) + " | MONACO winners " + JSON.stringify(monacoWins));
  console.log("POLES " + top(poles));
  console.log("STRAT " + Object.entries(strat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${(v / races / 22 * 100).toFixed(0)}%`).join("  "));
  console.log("TRACKS " + Object.entries(perTrack).map(([k, v]) => `${k}: ovt ${(v.ovt / v.n).toFixed(0)} st ${(v.stops / v.n).toFixed(1)}`).join(" | "));
});
