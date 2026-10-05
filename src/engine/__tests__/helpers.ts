import { races2026, teams, teamInfo } from "@/data/f1Data";
import type { Entry } from "../types";

export const allEntries = (): Entry[] =>
  teams.flatMap((t) => t.drivers.map((driver) => ({ driver, team: teamInfo(t) })));

export const entriesByGrid = (grid: string[]): Entry[] => {
  const map = new Map(allEntries().map((e) => [e.driver.id, e]));
  return grid.map((id) => map.get(id)!);
};

export { races2026 };

export const entriesFromTeamsForTest = (teams: import("@/data/f1Data").Team[]): Entry[] =>
  teams.flatMap((t) => t.drivers.map((driver) => ({ driver, team: teamInfo(t) })));
