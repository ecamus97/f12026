// Small seeded PRNG (mulberry32) so simulations are reproducible and serialisable.
export interface Rng {
  next(): number; // [0,1)
  gauss(): number; // standard normal
  int(min: number, max: number): number; // inclusive
  chance(p: number): boolean;
  pick<T>(items: T[]): T;
  weighted<T>(items: { item: T; weight: number }[]): T;
  state(): number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    gauss: () => {
      const u = Math.max(next(), 1e-9);
      const v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)],
    weighted: (items) => {
      const total = items.reduce((a, b) => a + b.weight, 0);
      let r = next() * total;
      for (const it of items) {
        r -= it.weight;
        if (r <= 0) return it.item;
      }
      return items[items.length - 1].item;
    },
    state: () => s,
  };
  return rng;
}

export const randomSeed = () => Math.floor(Math.random() * 2 ** 31);
