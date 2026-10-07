import { describe, expect, it } from "vitest";
import { races2026, teams as baseTeams } from "@/data/f1Data";
import {
  applyDevToTeams, canStartProject, carPace, classify, createRace, initManagement, processRaceWeekend,
  PROJECTS, canSignSponsor, signSponsor, runQualifying, simulateToEnd, startProject, upgradeFacility, champRankOf, type ManagementState,
} from "..";
import { entriesFromTeamsForTest } from "./helpers";

function season(playerTeamId: string, policy: "idle" | "greedy", seed = 1) {
  let m: ManagementState = initManagement(baseTeams, playerTeamId, seed);
  let teams = applyDevToTeams(baseTeams, m);
  const startPace = carPace(m.dev[playerTeamId]);
  races2026.forEach((race, i) => {
    // always keep sponsor slots filled with the first eligible offer
    for (const o of [...m.player!.offers]) if (!canSignSponsor(m, o.id)) m = signSponsor(m, o.id, i);
    if (policy === "greedy") {
      if (i === 0) m = upgradeFacility(m, "windTunnel", i);
      for (const id of ["floor", "fw", "rw", "ice", "mguk", "weight", "diffuser", "turbo", "fsusp", "rsusp", "cooling", "guns"]) {
        if (!canStartProject(m, id)) m = startProject(m, id, i);
      }
    }
    const entries = entriesFromTeamsForTest(teams);
    const q = runQualifying(race, entries, seed * 100 + i);
    const map = new Map(entries.map((e) => [e.driver.id, e]));
    const end = simulateToEnd(createRace(race, q.grid.map((id) => map.get(id)!), seed * 100 + i));
    m = processRaceWeekend(m, teams, classify(end), i + 1, q.grid[0]);
    teams = applyDevToTeams(teams, m);
  });
  return { m, teams, startPace, endPace: carPace(m.dev[playerTeamId]) };
}

describe("management", () => {
  it("projects cost money and need capacity", () => {
    let m = initManagement(baseTeams, "williams", 1);
    const before = m.player!.budget;
    m = startProject(m, "fw", 0);
    expect(m.player!.budget).toBeCloseTo(before - PROJECTS.find((p) => p.id === "fw")!.cost);
    m = startProject(m, "turbo", 0);
    m = startProject(m, "brakes", 0);
    m = startProject(m, "guns", 0); // Williams factory level 3 = 4 slots
    expect(canStartProject(m, "cooling")).toMatch(/capacidad/);
  });

  it("investing beats standing still over a season", () => {
    const idle = season("williams", "idle");
    const greedy = season("williams", "greedy");
    expect(greedy.endPace).toBeGreaterThan(idle.endPace + 2);
    expect(greedy.m.player!.ledger.length).toBeGreaterThan(24 * 2);
  });

  it.runIf(!!process.env.CALIBRATE)("season development report", () => {
    for (const pol of ["idle", "greedy"] as const) {
      const r = season("williams", pol, 4);
      const field = Object.entries(r.m.dev).map(([id, d]) => `${id}:${carPace(d).toFixed(1)}`).join(" ");
      console.log(`${pol}: WIL ${r.startPace.toFixed(1)} -> ${r.endPace.toFixed(1)} | budget ${r.m.player!.budget.toFixed(1)} | ${field}`);
    }
    console.log("start: " + baseTeams.map((t) => `${t.id}:${t.pace}`).join(" "));
  });
});

describe("sponsors", () => {
  it("offers exist, signing pays the fee and fills the slot", () => {
    let m = initManagement(baseTeams, "alpine", 5);
    const p0 = m.player!;
    expect(p0.offers.filter((o) => o.slot === "principal").length).toBe(3);
    const offer = p0.offers.find((o) => o.slot === "principal" && o.minRank === null)!;
    m = signSponsor(m, offer.id, 0);
    expect(m.player!.budget).toBeCloseTo(p0.budget + offer.signing);
    const other = m.player!.offers.find((o) => o.slot === "principal")!;
    expect(canSignSponsor(m, other.id)).toMatch(/ocupado/);
  });

  it("keeps history of development per round", () => {
    const r = season("haas", "idle", 2);
    expect(r.m.history.length).toBe(races2026.length + 1);
    expect(r.m.player!.ledger.some((l) => l.category === "tv")).toBe(true);
  });
});

describe("sponsors follow the constructors' championship", () => {
  it("offers more to a team leading the championship than to one at the back, whatever its car", () => {
    const m0 = initManagement(baseTeams, "haas", 3);
    const ids = baseTeams.map((t) => t.id);
    const leading = ["haas", ...ids.filter((id) => id !== "haas")];
    const last = [...ids.filter((id) => id !== "haas"), "haas"];
    // round 6 refreshes every slot
    const rows = classify(simulateToEnd(createRace(races2026[0], entriesFromTeamsForTest(baseTeams), 3)));
    const top = processRaceWeekend(m0, baseTeams, rows, 6, undefined, undefined, leading);
    const bottom = processRaceWeekend(m0, baseTeams, rows, 6, undefined, undefined, last);
    expect(champRankOf(top, "haas")).toBe(1);
    expect(champRankOf(bottom, "haas")).toBe(ids.length);
    const principal = (m: ManagementState) => m.player!.offers.filter((x) => x.slot === "principal").reduce((a, x) => a + x.base, 0);
    expect(principal(top)).toBeGreaterThan(principal(bottom) * 1.3);
  });
});
