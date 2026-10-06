// F1 2026 Season Data
// Ratings are 0-100 game ratings (not official data). Edit them freely from the Config dialog.

export interface Driver {
  id: string;
  name: string;
  shortName: string;
  number: number;
  nationality: string; // flag emoji
  pace: number; // one-lap and race speed
  racecraft: number; // attacking / overtaking
  defending: number; // holding position
  consistency: number; // fewer mistakes and crashes
  tyreMgmt: number; // tyre wear management
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  hex: string; // team colour
  pace: number; // car performance
  reliability: number; // mechanical failures
  pitCrew: number; // pit stop speed/consistency
  // car components (overall pace is their weighted mix; each circuit weighs them differently)
  aero?: number;
  powerUnit?: number;
  chassis?: number;
  /** Size of the team (initial budget and facilities), when it differs from what the car suggests. */
  budgetBase?: number;
  drivers: Driver[];
}

export type TeamInfo = Omit<Team, "drivers">;

export interface Track {
  laps: number;
  baseLap: number; // reference lap time in seconds (approx. pole time)
  overtaking: number; // 0 = easy to overtake, 1 = almost impossible
  pitLoss: number; // seconds lost driving through the pit lane
  scChance: number; // probability of at least one safety car per race (aprox.)
  deg: number; // tyre degradation multiplier
  rain?: number; // chance of rain during the race
  temp?: number; // typical air temperature (°C)
  downforce?: number; // 0 = low-downforce (Monza) .. 1 = maximum downforce (Monaco)
  power?: number; // 0..1 how much engine power matters
}

export interface Race {
  id: number;
  name: string;
  country: string;
  circuit: string;
  date: string;
  flag: string;
  track: Track;
}

const d = (
  id: string, name: string, shortName: string, number: number, nationality: string,
  pace: number, racecraft: number, defending: number, consistency: number, tyreMgmt: number,
): Driver => ({ id, name, shortName, number, nationality, pace, racecraft, defending, consistency, tyreMgmt });

export const teams: Team[] = [
  {
    id: "mclaren", name: "McLaren F1 Team", shortName: "MCL", hex: "#FF8000",
    pace: 95, reliability: 93, pitCrew: 95,
    aero: 97, powerUnit: 94.5, chassis: 94,
    drivers: [
      d("nor", "Lando Norris", "NOR", 1, "🇬🇧", 95, 90, 88, 88, 90),
      d("pia", "Oscar Piastri", "PIA", 81, "🇦🇺", 94, 89, 89, 91, 90),
    ],
  },
  {
    id: "mercedes", name: "Mercedes AMG F1", shortName: "MER", hex: "#27F4D2",
    pace: 96, reliability: 93, pitCrew: 92,
    aero: 95.5, powerUnit: 98, chassis: 95,
    drivers: [
      d("rus", "George Russell", "RUS", 63, "🇬🇧", 93, 88, 89, 90, 87),
      d("ant", "Kimi Antonelli", "ANT", 12, "🇮🇹", 88, 85, 80, 80, 81),
    ],
  },
  {
    id: "ferrari", name: "Scuderia Ferrari", shortName: "FER", hex: "#E8002D",
    pace: 93, reliability: 90, pitCrew: 93,
    aero: 93, powerUnit: 94, chassis: 92.5,
    drivers: [
      d("lec", "Charles Leclerc", "LEC", 16, "🇲🇨", 95, 90, 88, 86, 85),
      d("ham", "Lewis Hamilton", "HAM", 44, "🇬🇧", 92, 93, 92, 90, 93),
    ],
  },
  {
    id: "redbull", name: "Red Bull Racing", shortName: "RBR", hex: "#3671C6",
    pace: 92, reliability: 89, pitCrew: 98,
    aero: 93, powerUnit: 90, chassis: 93,
    drivers: [
      d("ver", "Max Verstappen", "VER", 3, "🇳🇱", 98, 97, 95, 94, 92),
      d("had", "Isack Hadjar", "HAD", 6, "🇫🇷", 85, 83, 80, 81, 80),
    ],
  },
  {
    id: "williams", name: "Williams Racing", shortName: "WIL", hex: "#64C4FF",
    pace: 86, reliability: 89, pitCrew: 92,
    aero: 86, powerUnit: 84.5, chassis: 87.5,
    budgetBase: 87,
    drivers: [
      d("alb", "Alex Albon", "ALB", 23, "🇹🇭", 87, 86, 87, 89, 88),
      d("sai", "Carlos Sainz", "SAI", 55, "🇪🇸", 89, 88, 89, 90, 89),
    ],
  },
  {
    id: "aston-martin", name: "Aston Martin F1 Team", shortName: "AMR", hex: "#229971",
    pace: 84, reliability: 88, pitCrew: 86,
    aero: 84, powerUnit: 85.5, chassis: 82.5,
    budgetBase: 86,
    drivers: [
      d("alo", "Fernando Alonso", "ALO", 14, "🇪🇸", 90, 95, 95, 93, 92),
      d("str", "Lance Stroll", "STR", 18, "🇨🇦", 80, 82, 80, 80, 80),
    ],
  },
  {
    id: "racing-bulls", name: "Racing Bulls", shortName: "RCB", hex: "#6692FF",
    pace: 87, reliability: 90, pitCrew: 88,
    aero: 86, powerUnit: 88.5, chassis: 87,
    budgetBase: 86,
    drivers: [
      d("law", "Liam Lawson", "LAW", 30, "🇳🇿", 83, 84, 82, 80, 80),
      d("lin", "Arvid Lindblad", "LIN", 41, "🇬🇧", 81, 80, 77, 78, 78),
    ],
  },
  {
    id: "haas", name: "Haas F1 Team", shortName: "HAA", hex: "#B6BABD",
    pace: 85, reliability: 88, pitCrew: 85,
    aero: 84.5, powerUnit: 86.5, chassis: 84,
    drivers: [
      d("oco", "Esteban Ocon", "OCO", 31, "🇫🇷", 85, 85, 88, 85, 85),
      d("bea", "Oliver Bearman", "BEA", 87, "🇬🇧", 85, 85, 80, 82, 80),
    ],
  },
  {
    id: "alpine", name: "Alpine F1 Team", shortName: "ALP", hex: "#0093CC",
    pace: 86, reliability: 86, pitCrew: 90,
    aero: 87.5, powerUnit: 84.5, chassis: 86,
    budgetBase: 84,
    drivers: [
      d("gas", "Pierre Gasly", "GAS", 10, "🇫🇷", 86, 85, 84, 87, 85),
      d("col", "Franco Colapinto", "COL", 43, "🇦🇷", 80, 82, 78, 76, 78),
    ],
  },
  {
    id: "audi", name: "Audi F1 Team", shortName: "AUD", hex: "#F2552C",
    pace: 84, reliability: 85, pitCrew: 87,
    aero: 84.5, powerUnit: 82, chassis: 85,
    drivers: [
      d("hul", "Nico Hülkenberg", "HUL", 27, "🇩🇪", 86, 84, 88, 90, 87),
      d("bor", "Gabriel Bortoleto", "BOR", 5, "🇧🇷", 84, 82, 79, 82, 80),
    ],
  },
  {
    id: "cadillac", name: "Cadillac F1 Team", shortName: "CAD", hex: "#C9A227",
    pace: 79, reliability: 82, pitCrew: 82,
    aero: 78, powerUnit: 80.5, chassis: 78.5,
    drivers: [
      d("bot", "Valtteri Bottas", "BOT", 77, "🇫🇮", 85, 82, 85, 90, 88),
      d("per", "Sergio Pérez", "PER", 11, "🇲🇽", 85, 86, 85, 82, 92),
    ],
  },
];

const t = (
  laps: number, baseLap: number, overtaking: number, pitLoss: number, scChance: number, deg: number,
  rain = 0.15, temp = 24, downforce = 0.5, power = 0.5,
): Track => ({ laps, baseLap, overtaking, pitLoss, scChance, deg, rain, temp, downforce, power });

export const races2026: Race[] = [
  { id: 1, name: "Australian Grand Prix", country: "Australia", circuit: "Albert Park", date: "06-08 Mar", flag: "🇦🇺", track: t(58, 76.5, 0.6, 19, 0.6, 1.0, .15, 22, .6, .5) },
  { id: 2, name: "Chinese Grand Prix", country: "China", circuit: "Shanghai", date: "13-15 Mar", flag: "🇨🇳", track: t(56, 91.5, 0.4, 22, 0.35, 1.1, .25, 18, .5, .55) },
  { id: 3, name: "Japanese Grand Prix", country: "Japan", circuit: "Suzuka", date: "27-29 Mar", flag: "🇯🇵", track: t(53, 87.5, 0.65, 22, 0.35, 1.1, .3, 20, .75, .45) },
  { id: 4, name: "Bahrain Grand Prix", country: "Bahrain", circuit: "Sakhir", date: "10-12 Apr", flag: "🇧🇭", track: t(57, 90.0, 0.3, 23, 0.3, 1.3, .03, 28, .5, .6) },
  { id: 5, name: "Saudi Arabian Grand Prix", country: "Saudi Arabia", circuit: "Jeddah", date: "17-19 Apr", flag: "🇸🇦", track: t(50, 87.5, 0.45, 20, 0.6, 0.9, .02, 27, .35, .8) },
  { id: 6, name: "Miami Grand Prix", country: "USA", circuit: "Miami", date: "01-03 May", flag: "🇺🇸", track: t(57, 86.5, 0.5, 20, 0.45, 1.0, .25, 30, .5, .55) },
  { id: 7, name: "Canadian Grand Prix", country: "Canada", circuit: "Montreal", date: "22-24 May", flag: "🇨🇦", track: t(70, 72.0, 0.4, 18, 0.65, 0.9, .3, 20, .35, .7) },
  { id: 8, name: "Monaco Grand Prix", country: "Monaco", circuit: "Monte Carlo", date: "05-07 Jun", flag: "🇲🇨", track: t(78, 70.5, 0.95, 20, 0.5, 0.6, .15, 22, 1, .1) },
  { id: 9, name: "Barcelona-Catalunya Grand Prix", country: "Spain", circuit: "Barcelona", date: "12-14 Jun", flag: "🇪🇸", track: t(66, 72.0, 0.6, 22, 0.25, 1.2, .1, 25, .8, .45) },
  { id: 10, name: "Austrian Grand Prix", country: "Austria", circuit: "Red Bull Ring", date: "26-28 Jun", flag: "🇦🇹", track: t(71, 64.0, 0.35, 21, 0.35, 1.0, .25, 24, .45, .65) },
  { id: 11, name: "British Grand Prix", country: "Great Britain", circuit: "Silverstone", date: "03-05 Jul", flag: "🇬🇧", track: t(52, 85.0, 0.45, 20, 0.4, 1.1, .35, 19, .7, .55) },
  { id: 12, name: "Belgian Grand Prix", country: "Belgium", circuit: "Spa-Francorchamps", date: "17-19 Jul", flag: "🇧🇪", track: t(44, 101.0, 0.3, 21, 0.4, 1.0, .45, 17, .35, .85) },
  { id: 13, name: "Hungarian Grand Prix", country: "Hungary", circuit: "Hungaroring", date: "24-26 Jul", flag: "🇭🇺", track: t(70, 75.5, 0.8, 21, 0.3, 1.1, .15, 30, .9, .3) },
  { id: 14, name: "Dutch Grand Prix", country: "Netherlands", circuit: "Zandvoort", date: "21-23 Aug", flag: "🇳🇱", track: t(72, 69.5, 0.75, 21, 0.4, 1.0, .3, 18, .85, .35) },
  { id: 15, name: "Italian Grand Prix", country: "Italy", circuit: "Monza", date: "04-06 Sep", flag: "🇮🇹", track: t(53, 79.0, 0.3, 24, 0.35, 0.9, .1, 26, .1, 1) },
  { id: 16, name: "Spanish Grand Prix", country: "Spain", circuit: "Madring (Madrid)", date: "11-13 Sep", flag: "🇪🇸", track: t(57, 88.0, 0.5, 21, 0.55, 1.0, .1, 27, .55, .55) },
  { id: 17, name: "Azerbaijan Grand Prix", country: "Azerbaijan", circuit: "Baku", date: "24-26 Sep", flag: "🇦🇿", track: t(51, 101.0, 0.35, 20, 0.65, 0.8, .05, 22, .25, .9) },
  { id: 18, name: "Singapore Grand Prix", country: "Singapore", circuit: "Marina Bay", date: "09-11 Oct", flag: "🇸🇬", track: t(62, 89.5, 0.8, 28, 0.9, 1.0, .3, 31, .95, .3) },
  { id: 19, name: "United States Grand Prix", country: "USA", circuit: "Austin", date: "23-25 Oct", flag: "🇺🇸", track: t(56, 93.0, 0.4, 20, 0.4, 1.1, .1, 27, .6, .55) },
  { id: 20, name: "Mexico City Grand Prix", country: "Mexico", circuit: "Mexico City", date: "30 Oct-01 Nov", flag: "🇲🇽", track: t(71, 75.5, 0.5, 22, 0.45, 0.9, .15, 22, .55, .6) },
  { id: 21, name: "São Paulo Grand Prix", country: "Brazil", circuit: "Interlagos", date: "06-08 Nov", flag: "🇧🇷", track: t(71, 69.5, 0.35, 21, 0.6, 1.0, .4, 24, .55, .6) },
  { id: 22, name: "Las Vegas Grand Prix", country: "USA", circuit: "Las Vegas", date: "19-21 Nov", flag: "🇺🇸", track: t(50, 92.5, 0.35, 21, 0.55, 0.8, .02, 14, .2, .9) },
  { id: 23, name: "Qatar Grand Prix", country: "Qatar", circuit: "Lusail", date: "27-29 Nov", flag: "🇶🇦", track: t(57, 80.0, 0.55, 26, 0.3, 1.4, .02, 29, .7, .5) },
  { id: 24, name: "Abu Dhabi Grand Prix", country: "UAE", circuit: "Yas Marina", date: "04-06 Dec", flag: "🇦🇪", track: t(58, 82.5, 0.5, 22, 0.25, 0.9, .02, 27, .55, .55) },
];

// 2026 points: top 10, no fastest-lap point
export const pointsSystem: Record<number, number> = {
  1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1,
};

export const teamInfo = (team: Team): TeamInfo => {
  const { drivers, ...info } = team;
  return info;
};
