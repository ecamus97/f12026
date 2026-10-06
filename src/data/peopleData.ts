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

export type StaffRole = "tp" | "td" | "aero" | "pu" | "sport" | "race";

export const STAFF_ROLES: StaffRole[] = ["tp", "td", "aero", "pu", "sport", "race"];

export interface StaffSeed {
  id: string;
  name: string;
  role: StaffRole;
  rating: number; // 60-99
  nationality: string;
  teamId: string | null;
  until?: number; // last season of the contract
  fictional?: boolean; // no public data: invented name
}

export const STAFF_ROLE_INFO: Record<StaffRole, { label: string; short: string; effect: string }> = {
  tp: {
    label: "Jefe de equipo",
    short: "Jefe",
    effect: "Patrocinadores pagan más con un líder reconocido y los pilotos piden menos sueldo para venir.",
  },
  td: {
    label: "Director técnico",
    short: "Técnico",
    effect: "Multiplica todas las mejoras de I+D (sobre todo el chasis) y sube su probabilidad de éxito.",
  },
  aero: {
    label: "Jefe de aerodinámica",
    short: "Aero",
    effect: "Multiplica las mejoras de aerodinámica.",
  },
  pu: {
    label: "Jefe de unidad de potencia",
    short: "Motor",
    effect: "Multiplica las mejoras de motor y de fiabilidad.",
  },
  sport: {
    label: "Director deportivo",
    short: "Deportivo",
    effect: "Paradas en boxes más rápidas y mejores resultados en los proyectos del pit crew.",
  },
  race: {
    label: "Jefe de ingeniería de pista",
    short: "Pista",
    effect: "Tus pilotos crecen más rápido cada temporada y ganan constancia.",
  },
};

const s = (
  id: string, name: string, role: StaffRole, rating: number, nationality: string, teamId: string | null, until = 2027, fictional = false,
): StaffSeed => ({ id, name, role, rating, nationality, teamId, until, fictional });
const f = (id: string, name: string, role: StaffRole, rating: number, nationality: string, teamId: string | null, until = 2027) =>
  s(id, name, role, rating, nationality, teamId, until, true);

// Real people where their role is public (as of early 2026, to the best of our knowledge); the rest are invented.
export const STAFF: StaffSeed[] = [
  // McLaren
  s("stella", "Andrea Stella", "tp", 93, "🇮🇹", "mclaren", 2029),
  s("houldey", "Neil Houldey", "td", 88, "🇬🇧", "mclaren", 2028),
  s("prodromou", "Peter Prodromou", "aero", 92, "🇬🇧", "mclaren", 2027),
  f("mcl-pu", "Tom Ashworth", "pu", 80, "🇬🇧", "mclaren", 2026),
  s("rsingh", "Randeep Singh", "sport", 87, "🇬🇧", "mclaren", 2027),
  s("temple", "Mark Temple", "race", 86, "🇬🇧", "mclaren", 2027),
  // Mercedes
  s("wolff", "Toto Wolff", "tp", 92, "🇦🇹", "mercedes", 2029),
  s("allison", "James Allison", "td", 92, "🇬🇧", "mercedes", 2027),
  s("murphy", "Jarrod Murphy", "aero", 85, "🇬🇧", "mercedes", 2027),
  s("hthomas", "Hywel Thomas", "pu", 91, "🇬🇧", "mercedes", 2028),
  s("meadows", "Ron Meadows", "sport", 88, "🇬🇧", "mercedes", 2026),
  s("shovlin", "Andrew Shovlin", "race", 88, "🇬🇧", "mercedes", 2027),
  // Ferrari
  s("vasseur", "Frédéric Vasseur", "tp", 86, "🇫🇷", "ferrari", 2027),
  s("serra", "Loïc Serra", "td", 85, "🇫🇷", "ferrari", 2027),
  s("tondi", "Diego Tondi", "aero", 83, "🇮🇹", "ferrari", 2026),
  s("gualtieri", "Enrico Gualtieri", "pu", 86, "🇮🇹", "ferrari", 2027),
  s("ioverno", "Diego Ioverno", "sport", 84, "🇮🇹", "ferrari", 2027),
  s("togninalli", "Matteo Togninalli", "race", 83, "🇮🇹", "ferrari", 2026),
  // Red Bull
  s("mekies", "Laurent Mekies", "tp", 84, "🇫🇷", "redbull", 2028),
  s("wache", "Pierre Waché", "td", 90, "🇫🇷", "redbull", 2027),
  s("balbo", "Enrico Balbo", "aero", 85, "🇮🇹", "redbull", 2027),
  s("hodgkinson", "Ben Hodgkinson", "pu", 84, "🇬🇧", "redbull", 2028),
  f("rbr-sport", "Daniel Hartley", "sport", 82, "🇬🇧", "redbull", 2026),
  s("lambiase", "Gianpiero Lambiase", "race", 89, "🇬🇧", "redbull", 2027),
  // Williams
  s("vowles", "James Vowles", "tp", 86, "🇬🇧", "williams", 2029),
  s("fry", "Pat Fry", "td", 86, "🇬🇧", "williams", 2027),
  f("wil-aero", "Owen Pritchard", "aero", 79, "🇬🇧", "williams", 2026),
  f("wil-pu", "Mark Ellis", "pu", 76, "🇬🇧", "williams", 2027),
  s("smeets", "Sven Smeets", "sport", 82, "🇧🇪", "williams", 2027),
  f("wil-race", "Chris Doyle", "race", 79, "🇬🇧", "williams", 2026),
  // Aston Martin
  s("newey", "Adrian Newey", "tp", 84, "🇬🇧", "aston-martin", 2030),
  s("cardile", "Enrico Cardile", "td", 86, "🇮🇹", "aston-martin", 2029),
  s("blandin", "Eric Blandin", "aero", 82, "🇫🇷", "aston-martin", 2027),
  f("amr-pu", "Kenji Morita", "pu", 80, "🇯🇵", "aston-martin", 2027),
  s("stevenson", "Andy Stevenson", "sport", 83, "🇬🇧", "aston-martin", 2026),
  s("krack", "Mike Krack", "race", 82, "🇱🇺", "aston-martin", 2027),
  // Racing Bulls
  s("permane", "Alan Permane", "tp", 82, "🇬🇧", "racing-bulls", 2027),
  s("goss", "Tim Goss", "td", 80, "🇬🇧", "racing-bulls", 2027),
  f("rcb-aero", "Paolo Ferri", "aero", 78, "🇮🇹", "racing-bulls", 2026),
  f("rcb-pu", "Sam Whitfield", "pu", 76, "🇬🇧", "racing-bulls", 2027),
  f("rcb-sport", "Luca Bertolini", "sport", 77, "🇮🇹", "racing-bulls", 2027),
  f("rcb-race", "Jamie Fenton", "race", 78, "🇬🇧", "racing-bulls", 2026),
  // Haas
  s("komatsu", "Ayao Komatsu", "tp", 84, "🇯🇵", "haas", 2028),
  s("dezordo", "Andrea de Zordo", "td", 78, "🇮🇹", "haas", 2027),
  f("haa-aero", "Marco Lenzi", "aero", 76, "🇮🇹", "haas", 2026),
  f("haa-pu", "Greg Hollis", "pu", 74, "🇺🇸", "haas", 2027),
  f("haa-sport", "Rachel Kemp", "sport", 78, "🇬🇧", "haas", 2027),
  s("lmuller", "Laura Müller", "race", 79, "🇩🇪", "haas", 2027),
  // Alpine
  s("briatore", "Flavio Briatore", "tp", 80, "🇮🇹", "alpine", 2027),
  s("sanchez", "David Sanchez", "td", 80, "🇫🇷", "alpine", 2027),
  f("alp-aero", "Julien Marchand", "aero", 77, "🇫🇷", "alpine", 2026),
  f("alp-pu", "Nicolas Ferrand", "pu", 74, "🇫🇷", "alpine", 2027),
  f("alp-sport", "Hugo Lambert", "sport", 76, "🇫🇷", "alpine", 2027),
  f("alp-race", "Simon Graves", "race", 77, "🇬🇧", "alpine", 2026),
  // Audi
  s("wheatley", "Jonathan Wheatley", "tp", 83, "🇬🇧", "audi", 2029),
  s("key", "James Key", "td", 84, "🇬🇧", "audi", 2028),
  f("aud-aero", "Felix Brandt", "aero", 78, "🇩🇪", "audi", 2027),
  s("dreyer", "Stefan Dreyer", "pu", 80, "🇩🇪", "audi", 2028),
  f("aud-sport", "Jonas Keller", "sport", 79, "🇩🇪", "audi", 2027),
  f("aud-race", "Tobias Reiter", "race", 78, "🇩🇪", "audi", 2026),
  // Cadillac
  s("lowdon", "Graeme Lowdon", "tp", 78, "🇬🇧", "cadillac", 2028),
  s("chester", "Nick Chester", "td", 80, "🇬🇧", "cadillac", 2028),
  s("symonds", "Pat Symonds", "aero", 82, "🇬🇧", "cadillac", 2026),
  f("cad-pu", "Ryan Mitchell", "pu", 74, "🇺🇸", "cadillac", 2027),
  f("cad-sport", "Dana Brooks", "sport", 76, "🇺🇸", "cadillac", 2027),
  f("cad-race", "Kevin Ortiz", "race", 77, "🇺🇸", "cadillac", 2027),
  // Available on the market
  s("horner", "Christian Horner", "tp", 90, "🇬🇧", null),
  s("steiner", "Guenther Steiner", "tp", 78, "🇮🇹", null),
  s("szafnauer", "Otmar Szafnauer", "tp", 77, "🇺🇸", null),
  s("elliott", "Mike Elliott", "td", 84, "🇬🇧", null),
  s("fallows", "Dan Fallows", "aero", 84, "🇬🇧", null),
  s("smedley", "Rob Smedley", "race", 82, "🇬🇧", null),
  f("free-pu1", "Martin Kessler", "pu", 83, "🇩🇪", null),
  f("free-pu2", "Hiro Takeda", "pu", 79, "🇯🇵", null),
  f("free-sport1", "Claire Dubois", "sport", 82, "🇫🇷", null),
  f("free-sport2", "Peter Lindgren", "sport", 77, "🇸🇪", null),
  f("free-aero2", "Alessio Conti", "aero", 79, "🇮🇹", null),
  f("free-td2", "Richard Hale", "td", 79, "🇬🇧", null),
  f("free-race2", "Ana Ribeiro", "race", 80, "🇵🇹", null),
  // more candidates on the market
  f("m-tp1", "Marco Bellandi", "tp", 82, "🇮🇹", null),
  f("m-tp2", "Sarah Whitmore", "tp", 80, "🇬🇧", null),
  f("m-tp3", "Julien Arnoux", "tp", 76, "🇫🇷", null),
  f("m-tp4", "Daniel Kessler", "tp", 73, "🇩🇪", null),
  f("m-td1", "Paolo Marchetti", "td", 85, "🇮🇹", null),
  f("m-td2", "Hannah Brooks", "td", 82, "🇬🇧", null),
  f("m-td3", "Takeshi Mori", "td", 80, "🇯🇵", null),
  f("m-td4", "Lukas Brenner", "td", 76, "🇦🇹", null),
  f("m-aero1", "Clara Vidal", "aero", 86, "🇪🇸", null),
  f("m-aero2", "Edward Lyle", "aero", 82, "🇬🇧", null),
  f("m-aero3", "Stefano Galli", "aero", 78, "🇮🇹", null),
  f("m-aero4", "Noah Fischer", "aero", 75, "🇨🇭", null),
  f("m-pu1", "Oliver Grant", "pu", 86, "🇬🇧", null),
  f("m-pu2", "Yuki Hamada", "pu", 81, "🇯🇵", null),
  f("m-pu3", "Pierre Lacombe", "pu", 77, "🇫🇷", null),
  f("m-pu4", "Rafael Duarte", "pu", 74, "🇧🇷", null),
  f("m-sport1", "Emma Laurent", "sport", 85, "🇫🇷", null),
  f("m-sport2", "Gareth Hughes", "sport", 80, "🇬🇧", null),
  f("m-sport3", "Matteo Rinaldi", "sport", 77, "🇮🇹", null),
  f("m-sport4", "Ines Carvalho", "sport", 73, "🇵🇹", null),
  f("m-race1", "Lucas Moreno", "race", 86, "🇦🇷", null),
  f("m-race2", "Chloé Martin", "race", 83, "🇫🇷", null),
  f("m-race3", "James Whitaker", "race", 79, "🇬🇧", null),
  f("m-race4", "Sebastián Rojas", "race", 75, "🇨🇱", null),
];

export const STAFF_FIRST = ["Mark", "Paul", "Elena", "Marco", "Kenji", "Sophie", "David", "Laura", "Tom", "Andrea", "Luis", "Nina", "Oscar", "Ingrid", "Raúl", "Sven"];
export const STAFF_LAST = ["Harper", "Bianchi", "Schulz", "Moreau", "Sato", "Fernández", "Novak", "Quinn", "Larsson", "Costa", "Weber", "Hughes", "Ricci", "Dupont", "Vargas", "Holm"];

/** Names for procedurally generated junior drivers in future seasons. */
export const JUNIOR_FIRST = ["Lucas", "Mateo", "Oliver", "Noah", "Leo", "Hugo", "Tomás", "Kai", "Emil", "Arthur", "Diego", "Felix", "Ren", "Isaac", "Nico", "Max", "Elias", "Jonah", "Sami", "Luca"];
export const JUNIOR_LAST = ["Moreau", "Hansen", "Rossi", "Silva", "Novak", "Tanaka", "Keller", "Duarte", "Larsen", "Petrov", "Okafor", "Bianchi", "Walsh", "Costa", "Weber", "Ishida", "Fontaine", "Lindqvist", "Herrera", "Kowalski"];
export const JUNIOR_FLAGS = ["🇬🇧", "🇫🇷", "🇮🇹", "🇧🇷", "🇩🇪", "🇯🇵", "🇪🇸", "🇳🇱", "🇦🇺", "🇺🇸", "🇦🇷", "🇨🇱", "🇲🇽", "🇸🇪", "🇩🇰", "🇳🇴", "🇧🇪", "🇨🇳"];
