// Careers before the game starts (up to the end of 2025). Approximate figures.

export interface PastRecord {
  wins: number;
  podiums: number;
  titles: number;
}

export const DRIVER_HISTORY: Record<string, PastRecord> = {
  ham: { wins: 105, podiums: 202, titles: 7 },
  ver: { wins: 71, podiums: 127, titles: 4 },
  alo: { wins: 32, podiums: 106, titles: 2 },
  nor: { wins: 11, podiums: 44, titles: 1 },
  pia: { wins: 9, podiums: 26, titles: 0 },
  lec: { wins: 8, podiums: 50, titles: 0 },
  rus: { wins: 5, podiums: 24, titles: 0 },
  sai: { wins: 4, podiums: 28, titles: 0 },
  per: { wins: 6, podiums: 39, titles: 0 },
  bot: { wins: 10, podiums: 67, titles: 0 },
  gas: { wins: 1, podiums: 5, titles: 0 },
  oco: { wins: 1, podiums: 4, titles: 0 },
  str: { wins: 0, podiums: 3, titles: 0 },
  alb: { wins: 0, podiums: 2, titles: 0 },
  hul: { wins: 0, podiums: 1, titles: 0 },
  ant: { wins: 0, podiums: 3, titles: 0 },
  had: { wins: 0, podiums: 1, titles: 0 },
  mag: { wins: 0, podiums: 1, titles: 0 },
};

export const TEAM_HISTORY: Record<string, PastRecord> = {
  ferrari: { wins: 248, podiums: 830, titles: 16 },
  mclaren: { wins: 203, podiums: 540, titles: 10 },
  mercedes: { wins: 131, podiums: 300, titles: 8 },
  redbull: { wins: 130, podiums: 290, titles: 6 },
  williams: { wins: 114, podiums: 313, titles: 9 },
  "racing-bulls": { wins: 2, podiums: 6, titles: 0 },
  alpine: { wins: 1, podiums: 3, titles: 0 },
  "aston-martin": { wins: 0, podiums: 10, titles: 0 },
  haas: { wins: 0, podiums: 0, titles: 0 },
  audi: { wins: 0, podiums: 0, titles: 0 },
  cadillac: { wins: 0, podiums: 0, titles: 0 },
};
