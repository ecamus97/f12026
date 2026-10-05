import { describe, expect, it } from "vitest";
import { races2026, teams as baseTeams } from "@/data/f1Data";
import {
  applyDevToTeams, canStartProject, carPace, classify, createRace, initManagement, processRaceWeekend,
  PROJECTS, canSignSponsor, signSponsor, runQualifying, simulateToEnd, startProject, upgradeFacility, type ManagementState,
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
      for (const id of ["aero-l", "aero-s", "pu-s", "ch-s", "pu-l", "ch-l", "rel", "pit"]) {
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
    m = startProject(m, "aero-s", 0);
    expect(m.player!.budget).toBeCloseTo(before - PROJECTS.find((p) => p.id === "aero-s")!.cost);
    m = startProject(m, "pu-s", 0);
    m = startProject(m, "ch-s", 0); // Williams factory level 3 = 3 slots
    expect(canStartProject(m, "rel")).toMatch(/capacidad/);
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
