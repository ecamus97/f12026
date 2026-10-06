// Weather: a rain/temperature timeline per race (hidden), track wetness and a forecast
// whose accuracy improves as the laps get closer.
import type { Track } from "@/data/f1Data";
import { createRng } from "./rng";

export interface WeatherTimeline {
  rain: number[]; // rain intensity per lap (index 0 = start), 0..1
  wet: number[]; // track wetness at the END of each lap, index 0 = at the start
  airTemp: number;
  trackTemp: number[]; // per lap
  seed: number;
  qualiWet?: number; // track wetness during Saturday's qualifying
}

export type Sky = "sol" | "nubes" | "llovizna" | "lluvia" | "tormenta";

export const SKY_INFO: Record<Sky, { label: string; icon: string }> = {
  sol: { label: "Despejado", icon: "☀️" },
  nubes: { label: "Nublado", icon: "⛅" },
  llovizna: { label: "Llovizna", icon: "🌦️" },
  lluvia: { label: "Lluvia", icon: "🌧️" },
  tormenta: { label: "Lluvia intensa", icon: "⛈️" },
};

export const skyFor = (rain: number, cloudy = false): Sky =>
  rain >= 0.7 ? "tormenta" : rain >= 0.35 ? "lluvia" : rain >= 0.08 ? "llovizna" : cloudy ? "nubes" : "sol";

export const wetLabel = (w: number) =>
  w < 0.08 ? "Seca" : w < 0.25 ? "Húmeda" : w < 0.55 ? "Mojada" : w < 0.8 ? "Muy mojada" : "Inundada";

/** Generate the real weather of a race (the player only sees the forecast). */
export function generateWeather(track: Track, laps: number, seed: number): WeatherTimeline {
  const rng = createRng(seed ^ 0x5eed);
  const rain = new Array(laps + 1).fill(0);
  const chance = track.rain ?? 0.15;
  const events = rng.chance(chance) ? (rng.chance(0.25) ? 2 : 1) : 0;
  for (let e = 0; e < events; e++) {
    const start = Math.round(-0.25 * laps + rng.next() * 1.1 * laps); // can already be raining at the start
    const len = rng.int(4, Math.max(6, Math.round(laps * 0.45)));
    const peak = 0.15 + rng.next() * 0.85;
    for (let l = Math.max(0, start); l <= Math.min(laps, start + len); l++) {
      const x = (l - start) / len; // 0..1 shape: ramp up, plateau, ramp down
      const shape = x < 0.2 ? x / 0.2 : x > 0.8 ? (1 - x) / 0.2 : 1;
      rain[l] = Math.min(1, Math.max(rain[l], peak * shape * (0.85 + rng.next() * 0.3)));
    }
  }
  const airTemp = Math.round((track.temp ?? 24) + (rng.next() - 0.5) * 8);
  const wet = new Array(laps + 1).fill(0);
  const trackTemp = new Array(laps + 1).fill(0);
  wet[0] = Math.min(1, rain[0] * 1.1);
  for (let l = 0; l <= laps; l++) {
    trackTemp[l] = Math.round(airTemp + 14 - rain[l] * 16 - (l > 0 ? wet[l - 1] : wet[0]) * 6);
    if (l === 0) continue;
    const prev = wet[l - 1];
    const drying = rain[l] < 0.05 ? 0.045 + Math.max(0, trackTemp[l] - 20) * 0.003 : 0;
    wet[l] = Math.max(0, Math.min(1, prev + rain[l] * 0.32 - drying - (rain[l] > 0 ? 0.02 : 0)));
  }
  // Saturday: more likely to be wet on a rainy weekend
  const sat = createRng(seed ^ 0x9a1);
  const qualiWet = sat.chance(chance * 0.6 + (events ? 0.25 : 0)) ? +(0.2 + sat.next() * 0.6).toFixed(2) : 0;
  return { rain, wet, airTemp, trackTemp, seed, qualiWet };
}

/** Deterministic pseudo-noise in [-1, 1] for (seed, a, b). */
function noise(seed: number, a: number, b: number) {
  let h = (seed ^ (a * 374761393) ^ (b * 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

export interface ForecastPoint {
  fromLap: number;
  toLap: number;
  chance: number; // % chance of rain in this window
  intensity: number; // expected intensity if it rains
}

/**
 * Rain forecast in fixed windows of laps, seen from lap `now` (0 or less = before the race:
 * the paddock, qualifying and the grid all see the same forecast). Each window has a fixed
 * forecast error that shrinks as the window gets closer, so the forecast converges smoothly
 * towards what really happens instead of jumping around.
 */
export function forecast(w: WeatherTimeline, now: number, window = 5): ForecastPoint[] {
  const laps = w.rain.length - 1;
  const at = Math.max(0, now);
  const bucket = Math.floor(at / 3);
  const out: ForecastPoint[] = [];
  for (let start = 1; start <= laps; start += window) {
    const to = Math.min(laps, start + window - 1);
    if (to <= at) continue;
    const from = Math.max(start, at + 1);
    let maxRain = 0;
    for (let l = from; l <= to; l++) maxRain = Math.max(maxRain, w.rain[l]);
    let nearby = 0;
    for (let l = Math.max(1, from - 3); l <= Math.min(laps, to + 3); l++) nearby = Math.max(nearby, w.rain[l]);
    const distance = Math.max(0, start - at) / Math.max(1, laps); // 0 = imminent, 1 = whole race away
    const uncertainty = 0.05 + distance * 0.4;
    const truth = maxRain > 0.05 ? 0.55 + 0.4 * Math.min(1, maxRain * 1.6) : 0.04 + nearby * 0.35;
    const err = noise(w.seed, start, 0) * uncertainty + (at > 0 ? noise(w.seed, start, bucket + 1) * 0.03 : 0);
    const chance = Math.round(Math.min(98, Math.max(2, (truth + err) * 100)) / 5) * 5;
    const intensity = Math.max(0, Math.min(1, Math.max(maxRain, nearby * 0.5) + noise(w.seed, start + 999, 0) * uncertainty * 0.5));
    out.push({ fromLap: from, toLap: to, chance, intensity });
  }
  return out;
}

/** Sky icon for a rain chance (used for the weekend summary). */
export function forecastIcon(chance: number) {
  return chance >= 65 ? "🌧️" : chance >= 40 ? "🌦️" : chance >= 20 ? "⛅" : "☀️";
}
