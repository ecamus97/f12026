// The calendar of the current season. It can change from one year to the next
// (races added, dropped or replaced by the FIA or the teams), so the game reads
// it through `calendar()` instead of the fixed 2026 list.
import { races2026, type Race, type Track } from "./f1Data";

const t = (
  laps: number, baseLap: number, overtaking: number, pitLoss: number, scChance: number, deg: number,
  rain = 0.15, temp = 24, downforce = 0.5, power = 0.5,
): Track => ({ laps, baseLap, overtaking, pitLoss, scChance, deg, rain, temp, downforce, power });

/** Circuits that can join the calendar in future seasons (outlines in extraCircuits). */
export const EXTRA_RACES: Race[] = [
  { id: 25, name: "French Grand Prix", country: "France", circuit: "Paul Ricard", date: "", flag: "🇫🇷", track: t(53, 92.5, 0.5, 20, 0.25, 1.0, 0.1, 30, 0.5, 0.7) },
  { id: 26, name: "German Grand Prix", country: "Germany", circuit: "Hockenheim", date: "", flag: "🇩🇪", track: t(67, 74.0, 0.45, 18, 0.4, 0.95, 0.25, 26, 0.45, 0.75) },
  { id: 27, name: "Emilia Romagna Grand Prix", country: "Emilia-Romagna", circuit: "Imola", date: "", flag: "🇮🇹", track: t(63, 76.5, 0.8, 27, 0.5, 0.9, 0.3, 22, 0.6, 0.5) },
  { id: 28, name: "Eifel Grand Prix", country: "Eifel", circuit: "Nürburgring", date: "", flag: "🇩🇪", track: t(60, 89.0, 0.5, 21, 0.4, 0.9, 0.45, 14, 0.55, 0.55) },
  { id: 29, name: "Portuguese Grand Prix", country: "Portugal", circuit: "Portimão", date: "", flag: "🇵🇹", track: t(66, 81.0, 0.55, 20, 0.3, 1.05, 0.1, 24, 0.55, 0.55) },
  { id: 30, name: "Tuscan Grand Prix", country: "Tuscany", circuit: "Mugello", date: "", flag: "🇮🇹", track: t(59, 79.0, 0.75, 22, 0.6, 1.1, 0.15, 28, 0.7, 0.6) },
  { id: 31, name: "Malaysian Grand Prix", country: "Malaysia", circuit: "Sepang", date: "", flag: "🇲🇾", track: t(56, 96.0, 0.4, 21, 0.3, 1.3, 0.55, 34, 0.55, 0.65) },
  { id: 32, name: "Turkish Grand Prix", country: "Turkey", circuit: "Istanbul Park", date: "", flag: "🇹🇷", track: t(58, 88.0, 0.4, 22, 0.35, 1.15, 0.2, 24, 0.6, 0.6) },
  { id: 33, name: "South African Grand Prix", country: "South Africa", circuit: "Kyalami", date: "", flag: "🇿🇦", track: t(68, 79.5, 0.5, 21, 0.3, 1.0, 0.15, 25, 0.55, 0.6) },
  { id: 34, name: "Argentine Grand Prix", country: "Argentina", circuit: "Buenos Aires", date: "", flag: "🇦🇷", track: t(72, 76.0, 0.55, 20, 0.35, 1.0, 0.2, 22, 0.5, 0.55) },
];

export const ALL_RACES: Race[] = [...races2026, ...EXTRA_RACES];
export const raceById = (id: number) => ALL_RACES.find((r) => r.id === id);

/** 2026 sprint weekends: China, Miami, Canada, Great Britain, Netherlands, Singapore. */
export const SPRINTS_2026 = [2, 6, 7, 11, 14, 18];

let active: Race[] = races2026;
/** Races of the season being played, in order (round = index + 1). */
export const calendar = () => active;
export const setActiveCalendar = (races: Race[]) => {
  active = races.length ? races : races2026;
};

// --- Dates -----------------------------------------------------------------------

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS: Record<string, number> = Object.fromEntries(MON.map((m, i) => [m, i]));

/** "06-08 Mar" (or "30 Oct-01 Nov") -> the Sunday of that weekend in a given year. */
export function raceSunday(date: string, year: number): Date {
  const m = date.match(/(\d{1,2})(?:\s*([A-Za-z]{3}))?\s*-\s*(\d{1,2})\s*([A-Za-z]{3})/);
  if (!m) return new Date(year, 5, 1);
  return new Date(year, MONTHS[m[4]] ?? 5, +m[3]);
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Friday-Sunday label for a Sunday. */
export function weekendLabel(sunday: Date) {
  const fri = new Date(sunday.getTime() - 2 * 86400000);
  return fri.getMonth() === sunday.getMonth()
    ? `${pad(fri.getDate())}-${pad(sunday.getDate())} ${MON[sunday.getMonth()]}`
    : `${pad(fri.getDate())} ${MON[fri.getMonth()]}-${pad(sunday.getDate())} ${MON[sunday.getMonth()]}`;
}

/** Same weekends in another year: each race moves to the nearest Sunday. */
export function datesForSeason(races: Race[], season: number): Race[] {
  return races.map((r) => {
    const base = raceSunday(r.date, 2026);
    const d = new Date(season, base.getMonth(), base.getDate());
    const dow = d.getDay();
    const shift = dow === 0 ? 0 : dow <= 3 ? -dow : 7 - dow;
    return { ...r, date: weekendLabel(new Date(d.getTime() + shift * 86400000)) };
  });
}

/** A free weekend for a new race: the middle of the longest gap between two races (in 2026 terms). */
export function freeSlot(races: Race[]): string {
  const sundays = races.map((r) => raceSunday(r.date, 2026)).sort((a, b) => a.getTime() - b.getTime());
  let best = { gap: 0, at: sundays[sundays.length - 1] };
  for (let i = 1; i < sundays.length; i++) {
    const gap = (sundays[i].getTime() - sundays[i - 1].getTime()) / 86400000;
    if (gap > best.gap) best = { gap, at: new Date(sundays[i - 1].getTime() + Math.round(gap / 14) * 7 * 86400000) };
  }
  if (best.gap < 14) best.at = new Date(sundays[sundays.length - 1].getTime() + 7 * 86400000); // add at the end
  return weekendLabel(best.at);
}

/** Calendar sorted by date. */
export const sortByDate = (races: Race[]) => [...races].sort((a, b) => raceSunday(a.date, 2026).getTime() - raceSunday(b.date, 2026).getTime());
