// People of the paddock: contracts, ages, potential and team staff.
// Ratings, salaries and contract lengths are game values (approximations), editable.
// Team staff are the real people in each role as of the start of 2026, to the best of our knowledge.

export interface DriverBio {
  birthYear: number;
  potential: number; // ceiling for pace
  until?: number; // last season of the current contract
}

/** Extra data for the drivers already on the grid (by driver id). */
export const GRID_BIOS: Record<string, DriverBio> = {
  nor: { birthYear: 1999, potential: 96, until: 2027 },
  pia: { birthYear: 2001, potential: 96, until: 2028 },
  rus: { birthYear: 1998, potential: 94, until: 2026 },
  ant: { birthYear: 2006, potential: 96, until: 2027 },
  lec: { birthYear: 1997, potential: 96, until: 2029 },
  ham: { birthYear: 1985, potential: 92, until: 2026 },
  ver: { birthYear: 1997, potential: 98, until: 2028 },
  had: { birthYear: 2004, potential: 90, until: 2026 },
  alb: { birthYear: 1996, potential: 88, until: 2027 },
  sai: { birthYear: 1994, potential: 90, until: 2026 },
  alo: { birthYear: 1981, potential: 90, until: 2026 },
  str: { birthYear: 1998, potential: 81, until: 2027 },
  law: { birthYear: 2002, potential: 88, until: 2026 },
  lin: { birthYear: 2007, potential: 93, until: 2026 },
  oco: { birthYear: 1996, potential: 86, until: 2026 },
  bea: { birthYear: 2005, potential: 92, until: 2027 },
  gas: { birthYear: 1996, potential: 87, until: 2028 },
  col: { birthYear: 2003, potential: 87, until: 2026 },
  hul: { birthYear: 1987, potential: 86, until: 2026 },
  bor: { birthYear: 2004, potential: 91, until: 2027 },
  bot: { birthYear: 1989, potential: 85, until: 2026 },
  per: { birthYear: 1990, potential: 85, until: 2027 },
};

export interface ExtraDriver {
  id: string;
  name: string;
  shortName: string;
  number: number;
  nationality: string;
  pace: number;
  racecraft: number;
  defending: number;
  consistency: number;
  tyreMgmt: number;
  birthYear: number;
  potential: number;
  status: "free" | "junior";
  origin: string;
}

const x = (
  id: string, name: string, shortName: string, number: number, nationality: string,
  pace: number, racecraft: number, defending: number, consistency: number, tyreMgmt: number,
  birthYear: number, potential: number, status: "free" | "junior", origin: string,
): ExtraDriver => ({ id, name, shortName, number, nationality, pace, racecraft, defending, consistency, tyreMgmt, birthYear, potential, status, origin });

/** Drivers without a 2026 race seat: reserves/free agents and young F2 talents. */
export const EXTRA_DRIVERS: ExtraDriver[] = [
  x("tsu", "Yuki Tsunoda", "TSU", 22, "🇯🇵", 85, 85, 81, 80, 82, 2000, 86, "free", "Piloto reserva"),
  x("zho", "Zhou Guanyu", "ZHO", 24, "🇨🇳", 82, 80, 81, 85, 84, 1999, 83, "free", "Piloto reserva"),
  x("mag", "Kevin Magnussen", "MAG", 20, "🇩🇰", 83, 86, 88, 80, 80, 1992, 83, "free", "Agente libre"),
  x("doo", "Jack Doohan", "DOO", 7, "🇦🇺", 79, 79, 77, 77, 78, 2003, 85, "free", "Agente libre"),
  x("drg", "Felipe Drugovich", "DRU", 34, "🇧🇷", 80, 80, 79, 82, 80, 2000, 83, "free", "Piloto reserva"),
  x("msc", "Mick Schumacher", "MSC", 47, "🇩🇪", 80, 79, 79, 81, 80, 1999, 82, "free", "Agente libre"),
  x("pou", "Théo Pourchaire", "POU", 9, "🇫🇷", 79, 80, 77, 80, 79, 2003, 86, "free", "Agente libre"),
  x("ves", "Frederik Vesti", "VES", 15, "🇩🇰", 78, 79, 77, 80, 79, 2002, 84, "free", "Piloto reserva"),
  x("aro", "Paul Aron", "ARO", 97, "🇪🇪", 79, 80, 77, 78, 78, 2004, 87, "free", "Piloto reserva"),
  x("cam", "Rafael Câmara", "CAM", 21, "🇧🇷", 76, 77, 74, 76, 75, 2005, 93, "junior", "Fórmula 2"),
  x("for", "Leonardo Fornaroli", "FOR", 8, "🇮🇹", 77, 77, 76, 80, 79, 2004, 89, "junior", "Fórmula 2"),
  x("bro", "Luke Browning", "BRO", 33, "🇬🇧", 76, 77, 75, 78, 76, 2002, 86, "junior", "Fórmula 2"),
  x("dun", "Alex Dunne", "DUN", 36, "🇮🇪", 76, 79, 74, 74, 75, 2005, 90, "junior", "Fórmula 2"),
  x("min", "Gabriele Minì", "MIN", 28, "🇮🇹", 75, 76, 74, 77, 76, 2005, 88, "junior", "Fórmula 2"),
  x("tso", "Nikola Tsolov", "TSO", 25, "🇧🇬", 74, 76, 73, 74, 74, 2006, 90, "junior", "Fórmula 2"),
  x("ste", "Martinius Stenshorne", "STE", 26, "🇳🇴", 74, 74, 73, 76, 75, 2006, 88, "junior", "Fórmula 2"),
  x("mon", "Sebastián Montoya", "MON", 29, "🇨🇴", 73, 74, 73, 75, 74, 2005, 85, "junior", "Fórmula 2"),
  x("beg", "Dino Beganovic", "BEG", 35, "🇸🇪", 74, 75, 73, 76, 75, 2004, 86, "junior", "Fórmula 2"),
  x("cra", "Jak Crawford", "CRA", 38, "🇺🇸", 76, 77, 75, 77, 76, 2005, 87, "junior", "Fórmula 2"),
  x("vrs", "Richard Verschoor", "VSR", 39, "🇳🇱", 77, 78, 77, 79, 78, 2000, 80, "junior", "Fórmula 2"),
  x("mar", "Victor Martins", "MAR", 45, "🇫🇷", 75, 76, 74, 77, 75, 2001, 82, "junior", "Fórmula 2"),
];

export type StaffRole = "tp" | "td";

export interface StaffSeed {
  id: string;
  name: string;
  role: StaffRole;
  rating: number; // 60-99
  nationality: string;
  teamId: string | null;
}

export const STAFF_ROLE_INFO: Record<StaffRole, { label: string; effect: string }> = {
  tp: {
    label: "Jefe de equipo",
    effect: "Patrocinadores pagan más con un líder reconocido y los pilotos piden menos sueldo para venir.",
  },
  td: {
    label: "Director técnico",
    effect: "Multiplica las mejoras de los proyectos de I+D y sube su probabilidad de éxito.",
  },
};

const s = (id: string, name: string, role: StaffRole, rating: number, nationality: string, teamId: string | null): StaffSeed =>
  ({ id, name, role, rating, nationality, teamId });

export const STAFF: StaffSeed[] = [
  s("stella", "Andrea Stella", "tp", 93, "🇮🇹", "mclaren"),
  s("prodromou", "Peter Prodromou", "td", 90, "🇬🇧", "mclaren"),
  s("wolff", "Toto Wolff", "tp", 92, "🇦🇹", "mercedes"),
  s("allison", "James Allison", "td", 92, "🇬🇧", "mercedes"),
  s("vasseur", "Frédéric Vasseur", "tp", 86, "🇫🇷", "ferrari"),
  s("serra", "Loïc Serra", "td", 85, "🇫🇷", "ferrari"),
  s("mekies", "Laurent Mekies", "tp", 84, "🇫🇷", "redbull"),
  s("wache", "Pierre Waché", "td", 90, "🇫🇷", "redbull"),
  s("vowles", "James Vowles", "tp", 86, "🇬🇧", "williams"),
  s("fry", "Pat Fry", "td", 86, "🇬🇧", "williams"),
  s("newey", "Adrian Newey", "tp", 84, "🇬🇧", "aston-martin"),
  s("cardile", "Enrico Cardile", "td", 86, "🇮🇹", "aston-martin"),
  s("permane", "Alan Permane", "tp", 82, "🇬🇧", "racing-bulls"),
  s("goss", "Tim Goss", "td", 80, "🇬🇧", "racing-bulls"),
  s("komatsu", "Ayao Komatsu", "tp", 84, "🇯🇵", "haas"),
  s("dezordo", "Andrea de Zordo", "td", 78, "🇮🇹", "haas"),
  s("briatore", "Flavio Briatore", "tp", 80, "🇮🇹", "alpine"),
  s("sanchez", "David Sanchez", "td", 80, "🇫🇷", "alpine"),
  s("wheatley", "Jonathan Wheatley", "tp", 83, "🇬🇧", "audi"),
  s("key", "James Key", "td", 84, "🇬🇧", "audi"),
  s("lowdon", "Graeme Lowdon", "tp", 78, "🇬🇧", "cadillac"),
  s("chester", "Nick Chester", "td", 80, "🇬🇧", "cadillac"),
  // available on the market
  s("horner", "Christian Horner", "tp", 90, "🇬🇧", null),
  s("steiner", "Guenther Steiner", "tp", 78, "🇮🇹", null),
  s("szafnauer", "Otmar Szafnauer", "tp", 77, "🇺🇸", null),
  s("elliott", "Mike Elliott", "td", 84, "🇬🇧", null),
  s("fallows", "Dan Fallows", "td", 83, "🇬🇧", null),
];

/** Names for procedurally generated junior drivers in future seasons. */
export const JUNIOR_FIRST = ["Lucas", "Mateo", "Oliver", "Noah", "Leo", "Hugo", "Tomás", "Kai", "Emil", "Arthur", "Diego", "Felix", "Ren", "Isaac", "Nico", "Max", "Elias", "Jonah", "Sami", "Luca"];
export const JUNIOR_LAST = ["Moreau", "Hansen", "Rossi", "Silva", "Novak", "Tanaka", "Keller", "Duarte", "Larsen", "Petrov", "Okafor", "Bianchi", "Walsh", "Costa", "Weber", "Ishida", "Fontaine", "Lindqvist", "Herrera", "Kowalski"];
export const JUNIOR_FLAGS = ["🇬🇧", "🇫🇷", "🇮🇹", "🇧🇷", "🇩🇪", "🇯🇵", "🇪🇸", "🇳🇱", "🇦🇺", "🇺🇸", "🇦🇷", "🇨🇱", "🇲🇽", "🇸🇪", "🇩🇰", "🇳🇴", "🇧🇪", "🇨🇳"];
