// Sponsorship market: offers with different trade-offs (base, signing fee, bonuses, requirements).
import type { Rng } from "./rng";

export type SponsorSlot = "principal" | "secundario";
export type SponsorStyle = "estable" | "rendimiento" | "firma" | "premium";

export interface SponsorDeal {
  id: string;
  name: string;
  slot: SponsorSlot;
  style: SponsorStyle;
  base: number; // M USD per race
  signing: number; // paid once when signing
  perPoint: number;
  perPodium: number;
  perWin: number;
  perPole: number;
  perDnf: number; // penalty (negative) per retirement
  duration: number; // races
  racesLeft: number;
  minRank: number | null; // team must be at least this high in the constructors' championship to sign
  earned: number; // total paid so far
}

export const SLOT_INFO: Record<SponsorSlot, { label: string; count: number }> = {
  principal: { label: "Patrocinador principal", count: 1 },
  secundario: { label: "Patrocinador secundario", count: 2 },
};

export const STYLE_INFO: Record<SponsorStyle, { label: string; desc: string }> = {
  estable: { label: "Estable", desc: "Pago fijo alto, sin bonos." },
  rendimiento: { label: "Por rendimiento", desc: "Pago fijo bajo, grandes bonos por puntos, podios y victorias." },
  firma: { label: "Prima de firma", desc: "Gran pago al firmar y contrato largo, pero multa por abandonos." },
  premium: { label: "Premium", desc: "El que más paga, pero exige mantenerse arriba en el campeonato de constructores y penaliza abandonos." },
};

const NAMES = [
  "Voltara Energy", "Nimbus Cloud", "Kestrel Watches", "Aurora Bank", "Halcyon Air", "Quantix Labs", "Solenne Cosmetics",
  "Ironbark Tools", "Meridian Logistics", "Pulse Telecom", "Vireo Beverages", "Cobalt Insurance", "Lumen Optics",
  "Northwind Apparel", "Tidal Fintech", "Orbis Travel", "Ember Coffee", "Granite Capital", "Zephyr Mobility", "Atlas Robotics",
  "Saffron Foods", "Helios Solar", "Vantage Software", "Riviera Resorts",
];

/** Reference per-race value of a principal sponsor by constructors' championship position (1 = leader). */
export const sponsorReference = (champRank: number) => +(1.75 - (Math.min(11, Math.max(1, champRank)) - 1) * 0.075).toFixed(3);

/** TV / commercial rights from the sport, by constructors' championship position (1 = leader). */
export const tvRights = (carRank: number) => +(2.6 + (11 - Math.min(11, carRank)) * 0.13).toFixed(2);

const round2 = (x: number) => Math.round(x * 100) / 100;

export function generateOffers(
  rng: Rng,
  opts: { slot: SponsorSlot; count: number; champRank: number; racesLeftInSeason: number; usedNames: Set<string>; uidStart: number },
): SponsorDeal[] {
  const { slot, count, champRank, racesLeftInSeason, usedNames } = opts;
  const R = sponsorReference(champRank) * (slot === "principal" ? 1 : 0.3);
  const k = R / 1.9; // bonus scale
  const styles: SponsorStyle[] = ["estable", "rendimiento", "firma", "premium"];
  const out: SponsorDeal[] = [];
  let uid = opts.uidStart;
  // every batch shows a variety of styles (shuffled, then cycled)
  const order = [...styles].sort(() => rng.next() - 0.5);
  for (let i = 0; i < count; i++) {
    const style = order[i % order.length];
    const pool = NAMES.filter((n) => !usedNames.has(n));
    const name = pool.length ? rng.pick(pool) : `Socio ${uid}`;
    usedNames.add(name);
    const v = 0.85 + rng.next() * 0.3; // ±15% market variation
    const dur = (min: number, max: number) => Math.max(1, Math.min(racesLeftInSeason, rng.int(min, max)));
    const base: SponsorDeal = {
      id: `s${uid++}`, name, slot, style,
      base: 0, signing: 0, perPoint: 0, perPodium: 0, perWin: 0, perPole: 0, perDnf: 0,
      duration: 0, racesLeft: 0, minRank: null, earned: 0,
    };
    let d: SponsorDeal;
    switch (style) {
      case "estable":
        d = { ...base, base: R * v, signing: R * 0.5 * v, duration: dur(8, 12) };
        break;
      case "rendimiento":
        d = { ...base, base: R * 0.55 * v, perPoint: 0.06 * k * v, perPodium: 0.8 * k * v, perWin: 1.5 * k * v, perPole: 0.4 * k * v, duration: dur(6, 10) };
        break;
      case "firma":
        d = { ...base, base: R * 0.75 * v, signing: R * 3.5 * v, perDnf: -0.4 * k, duration: dur(14, 24) };
        break;
      case "premium":
      default:
        d = { ...base, base: R * 1.45 * v, signing: R * v, perDnf: -0.6 * k, minRank: Math.max(1, champRank - rng.int(0, 2)), duration: dur(6, 10) };
        break;
    }
    out.push({
      ...d,
      base: round2(d.base), signing: round2(d.signing), perPoint: round2(d.perPoint), perPodium: round2(d.perPodium),
      perWin: round2(d.perWin), perPole: round2(d.perPole), perDnf: round2(d.perDnf), racesLeft: d.duration,
    });
  }
  return out;
}

export interface RaceOutcome {
  points: number;
  podiums: number;
  wins: number;
  pole: boolean;
  dnfs: number;
}

/** Breakdown of what a sponsor pays for one race. */
export function sponsorPayout(s: SponsorDeal, o: RaceOutcome): { concept: string; amount: number }[] {
  const lines: { concept: string; amount: number }[] = [{ concept: `${s.name}: pago por carrera`, amount: s.base }];
  const bonus =
    o.points * s.perPoint + o.podiums * s.perPodium + o.wins * s.perWin + (o.pole ? s.perPole : 0);
  if (bonus > 0) lines.push({ concept: `${s.name}: bonos por resultados`, amount: round2(bonus) });
  if (s.perDnf < 0 && o.dnfs > 0) lines.push({ concept: `${s.name}: multa por abandono`, amount: round2(s.perDnf * o.dnfs) });
  return lines;
}

/** Expected value per race of an offer, for comparison in the UI. */
export function expectedPerRace(s: SponsorDeal, typical: RaceOutcome) {
  const lines = sponsorPayout(s, typical);
  return lines.reduce((a, l) => a + l.amount, 0) + s.signing / Math.max(1, s.duration);
}
