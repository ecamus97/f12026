import { describe, expect, it } from "vitest";
import { exportFileName, metaOf, parseImport } from "../saves";

const game = {
  version: 2,
  playerTeamId: "williams",
  teamsData: [{ id: "williams", name: "Williams Racing", hex: "#1868db" }],
  season: 2027,
  currentRaceIndex: 5,
  calendar: new Array(24).fill({}),
};

describe("saved game files", () => {
  it("reads an exported file and a raw saved game", () => {
    const wrapped = parseImport(JSON.stringify({ app: "f1-manager-2026", format: 1, state: game }));
    const raw = parseImport(JSON.stringify(game));
    for (const r of [wrapped, raw]) {
      expect("error" in r).toBe(false);
      if (!("error" in r)) expect(r.meta).toEqual({ team: "Williams Racing", hex: "#1868db", season: 2027, round: 5, totalRounds: 24 });
    }
  });

  it("rejects anything that isn't a game", () => {
    expect("error" in parseImport("not json")).toBe(true);
    expect("error" in parseImport(JSON.stringify({ hello: 1 }))).toBe(true);
    expect("error" in parseImport(JSON.stringify({ ...game, version: 1 }))).toBe(true);
  });

  it("names the file after the team, season and round", () => {
    expect(exportFileName(game)).toMatch(/^f1manager-williams-racing-2027-r5-\d{8}\.json$/);
    expect(metaOf({ ...game, playerTeamId: null }).team).toBeNull();
  });
});
