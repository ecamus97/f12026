// F1 2026 Season Data

export interface Driver {
  id: string;
  name: string;
  shortName: string;
  nationality: string;
  overtaking: number; // 1-6
  maintainingPosition: number; // 1-6
  avoidingCollision: number; // 1-6 (higher = better at avoiding pits)
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  carLevel: number; // 4-5 for dice probability
  color: string;
  drivers: Driver[];
}

export interface Race {
  id: number;
  name: string;
  country: string;
  circuit: string;
  date: string;
  flag: string;
}

export const teams: Team[] = [
  {
    id: "mclaren",
    name: "McLaren F1 Team",
    shortName: "MCL",
    carLevel: 5,
    color: "bg-mclaren",
    drivers: [
      { id: "nor", name: "Lando Norris", shortName: "NOR", nationality: "🇬🇧", overtaking: 5, maintainingPosition: 5, avoidingCollision: 5 },
      { id: "pia", name: "Oscar Piastri", shortName: "PIA", nationality: "🇦🇺", overtaking: 5, maintainingPosition: 4, avoidingCollision: 5 },
    ],
  },
  {
    id: "ferrari",
    name: "Scuderia Ferrari",
    shortName: "FER",
    carLevel: 5,
    color: "bg-ferrari",
    drivers: [
      { id: "lec", name: "Charles Leclerc", shortName: "LEC", nationality: "🇲🇨", overtaking: 5, maintainingPosition: 5, avoidingCollision: 4 },
      { id: "ham", name: "Lewis Hamilton", shortName: "HAM", nationality: "🇬🇧", overtaking: 6, maintainingPosition: 6, avoidingCollision: 5 },
    ],
  },
  {
    id: "redbull",
    name: "Red Bull Racing",
    shortName: "RBR",
    carLevel: 5,
    color: "bg-redbull",
    drivers: [
      { id: "ver", name: "Max Verstappen", shortName: "VER", nationality: "🇳🇱", overtaking: 6, maintainingPosition: 6, avoidingCollision: 5 },
      { id: "had", name: "Isack Hadjar", shortName: "HAD", nationality: "🇫🇷", overtaking: 3, maintainingPosition: 3, avoidingCollision: 3 },
    ],
  },
  {
    id: "mercedes",
    name: "Mercedes AMG F1",
    shortName: "MER",
    carLevel: 5,
    color: "bg-secondary",
    drivers: [
      { id: "rus", name: "George Russell", shortName: "RUS", nationality: "🇬🇧", overtaking: 5, maintainingPosition: 5, avoidingCollision: 4 },
      { id: "ant", name: "Kimi Antonelli", shortName: "ANT", nationality: "🇮🇹", overtaking: 4, maintainingPosition: 3, avoidingCollision: 3 },
    ],
  },
  {
    id: "aston-martin",
    name: "Aston Martin F1 Team",
    shortName: "AMR",
    carLevel: 4.5,
    color: "bg-aston-martin",
    drivers: [
      { id: "alo", name: "Fernando Alonso", shortName: "ALO", nationality: "🇪🇸", overtaking: 6, maintainingPosition: 6, avoidingCollision: 5 },
      { id: "str", name: "Lance Stroll", shortName: "STR", nationality: "🇨🇦", overtaking: 3, maintainingPosition: 4, avoidingCollision: 3 },
    ],
  },
  {
    id: "williams",
    name: "Williams Racing",
    shortName: "WIL",
    carLevel: 4,
    color: "bg-williams",
    drivers: [
      { id: "alb", name: "Alex Albon", shortName: "ALB", nationality: "🇹🇭", overtaking: 5, maintainingPosition: 4, avoidingCollision: 4 },
      { id: "sai", name: "Carlos Sainz", shortName: "SAI", nationality: "🇪🇸", overtaking: 5, maintainingPosition: 5, avoidingCollision: 5 },
    ],
  },
  {
    id: "alpine",
    name: "Alpine F1 Team",
    shortName: "ALP",
    carLevel: 4,
    color: "bg-alpine",
    drivers: [
      { id: "gas", name: "Pierre Gasly", shortName: "GAS", nationality: "🇫🇷", overtaking: 4, maintainingPosition: 4, avoidingCollision: 4 },
      { id: "col", name: "Franco Colapinto", shortName: "COL", nationality: "🇦🇷", overtaking: 3, maintainingPosition: 3, avoidingCollision: 3 },
    ],
  },
  {
    id: "haas",
    name: "Haas F1 Team",
    shortName: "HAA",
    carLevel: 4,
    color: "bg-haas",
    drivers: [
      { id: "oco", name: "Esteban Ocon", shortName: "OCO", nationality: "🇫🇷", overtaking: 4, maintainingPosition: 4, avoidingCollision: 3 },
      { id: "bea", name: "Ollie Bearman", shortName: "BEA", nationality: "🇬🇧", overtaking: 3, maintainingPosition: 3, avoidingCollision: 3 },
    ],
  },
  {
    id: "racing-bulls",
    name: "Racing Bulls",
    shortName: "RCB",
    carLevel: 4,
    color: "bg-racing-bulls",
    drivers: [
      { id: "law", name: "Liam Lawson", shortName: "LAW", nationality: "🇳🇿", overtaking: 4, maintainingPosition: 4, avoidingCollision: 4 },
      { id: "lin", name: "Arvid Lindblad", shortName: "LIN", nationality: "🇬🇧", overtaking: 3, maintainingPosition: 3, avoidingCollision: 3 },
    ],
  },
  {
    id: "audi",
    name: "Audi F1 Team",
    shortName: "AUD",
    carLevel: 4,
    color: "bg-sauber",
    drivers: [
      { id: "hul", name: "Nico Hulkenberg", shortName: "HUL", nationality: "🇩🇪", overtaking: 4, maintainingPosition: 5, avoidingCollision: 4 },
      { id: "bor", name: "Gabriel Bortoleto", shortName: "BOR", nationality: "🇧🇷", overtaking: 3, maintainingPosition: 3, avoidingCollision: 3 },
    ],
  },
  {
    id: "cadillac",
    name: "Cadillac F1 Team",
    shortName: "CAD",
    carLevel: 3.5,
    color: "bg-cadillac",
    drivers: [
      { id: "bot", name: "Valtteri Bottas", shortName: "BOT", nationality: "🇫🇮", overtaking: 4, maintainingPosition: 5, avoidingCollision: 4 },
      { id: "per", name: "Sergio Perez", shortName: "PER", nationality: "🇲🇽", overtaking: 4, maintainingPosition: 4, avoidingCollision: 3 },
    ],
  },
];

export const races2026: Race[] = [
  { id: 1, name: "Australian Grand Prix", country: "Australia", circuit: "Albert Park", date: "06-08 Mar", flag: "🇦🇺" },
  { id: 2, name: "Chinese Grand Prix", country: "China", circuit: "Shanghai", date: "13-15 Mar", flag: "🇨🇳" },
  { id: 3, name: "Japanese Grand Prix", country: "Japan", circuit: "Suzuka", date: "27-29 Mar", flag: "🇯🇵" },
  { id: 4, name: "Bahrain Grand Prix", country: "Bahrain", circuit: "Sakhir", date: "10-12 Apr", flag: "🇧🇭" },
  { id: 5, name: "Saudi Arabian Grand Prix", country: "Saudi Arabia", circuit: "Jeddah", date: "17-19 Apr", flag: "🇸🇦" },
  { id: 6, name: "Miami Grand Prix", country: "USA", circuit: "Miami", date: "01-03 May", flag: "🇺🇸" },
  { id: 7, name: "Canadian Grand Prix", country: "Canada", circuit: "Montreal", date: "22-24 May", flag: "🇨🇦" },
  { id: 8, name: "Monaco Grand Prix", country: "Monaco", circuit: "Monte Carlo", date: "05-07 Jun", flag: "🇲🇨" },
  { id: 9, name: "Spanish Grand Prix", country: "Spain", circuit: "Barcelona", date: "12-14 Jun", flag: "🇪🇸" },
  { id: 10, name: "Austrian Grand Prix", country: "Austria", circuit: "Red Bull Ring", date: "26-28 Jun", flag: "🇦🇹" },
  { id: 11, name: "British Grand Prix", country: "Great Britain", circuit: "Silverstone", date: "03-05 Jul", flag: "🇬🇧" },
  { id: 12, name: "Belgian Grand Prix", country: "Belgium", circuit: "Spa-Francorchamps", date: "17-19 Jul", flag: "🇧🇪" },
  { id: 13, name: "Hungarian Grand Prix", country: "Hungary", circuit: "Hungaroring", date: "24-26 Jul", flag: "🇭🇺" },
  { id: 14, name: "Dutch Grand Prix", country: "Netherlands", circuit: "Zandvoort", date: "21-23 Aug", flag: "🇳🇱" },
  { id: 15, name: "Italian Grand Prix", country: "Italy", circuit: "Monza", date: "04-06 Sep", flag: "🇮🇹" },
  { id: 16, name: "Spanish Grand Prix 2", country: "Spain", circuit: "Valencia", date: "11-13 Sep", flag: "🇪🇸" },
  { id: 17, name: "Azerbaijan Grand Prix", country: "Azerbaijan", circuit: "Baku", date: "24-26 Sep", flag: "🇦🇿" },
  { id: 18, name: "Singapore Grand Prix", country: "Singapore", circuit: "Marina Bay", date: "09-11 Oct", flag: "🇸🇬" },
  { id: 19, name: "United States Grand Prix", country: "USA", circuit: "Austin", date: "23-25 Oct", flag: "🇺🇸" },
  { id: 20, name: "Mexican Grand Prix", country: "Mexico", circuit: "Mexico City", date: "30 Oct-01 Nov", flag: "🇲🇽" },
  { id: 21, name: "Brazilian Grand Prix", country: "Brazil", circuit: "Interlagos", date: "06-08 Nov", flag: "🇧🇷" },
  { id: 22, name: "Las Vegas Grand Prix", country: "USA", circuit: "Las Vegas", date: "19-21 Nov", flag: "🇺🇸" },
  { id: 23, name: "Qatar Grand Prix", country: "Qatar", circuit: "Lusail", date: "27-29 Nov", flag: "🇶🇦" },
  { id: 24, name: "Abu Dhabi Grand Prix", country: "UAE", circuit: "Yas Marina", date: "04-06 Dec", flag: "🇦🇪" },
];

export const pointsSystem: Record<number, number> = {
  1: 25,
  2: 18,
  3: 15,
  4: 12,
  5: 10,
  6: 8,
  7: 6,
  8: 4,
  9: 2,
  10: 1,
};

export function rollDice(sides: number = 6): number {
  return Math.floor(Math.random() * sides) + 1;
}

export function rollDice50(): number {
  return Math.floor(Math.random() * 50) + 1;
}

export function canAdvance(carLevel: number, diceRoll: number): boolean {
  // Car level determines probability. E.g., carLevel 5 means roll 1-5 advances
  const threshold = Math.round(carLevel);
  return diceRoll <= threshold;
}

export function checkPitStop(avoidingCollision: number, diceRoll50: number): boolean {
  // Higher avoiding collision = less chance of pit
  // Level 5 = only 50 triggers pit
  // Level 4 = 49-50 triggers pit
  // Level 3 = 48-50 triggers pit
  // Level 2 = 47-50 triggers pit
  // Level 1 = 46-50 triggers pit
  const pitThreshold = 50 - (5 - avoidingCollision);
  return diceRoll50 >= pitThreshold;
}

export function getAllDrivers(): (Driver & { teamId: string; teamName: string; teamColor: string; carLevel: number })[] {
  return teams.flatMap(team => 
    team.drivers.map(driver => ({
      ...driver,
      teamId: team.id,
      teamName: team.name,
      teamColor: team.color,
      carLevel: team.carLevel,
    }))
  );
}
