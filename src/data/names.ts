// Invented people: names that fit each nationality, and the feeder-series teams.
import type { Rng } from "@/engine/rng";

interface NamePool {
  first: string[];
  last: string[];
  weight: number; // how often this country produces young drivers
}

export const NAME_POOLS: Record<string, NamePool> = {
  "🇬🇧": { weight: 6, first: ["Oliver", "Harry", "Jack", "George", "Alfie", "Charlie", "Freddie", "Archie", "Thomas", "James", "William", "Joshua", "Callum", "Rory", "Ethan"], last: ["Turner", "Hughes", "Bennett", "Fletcher", "Harrison", "Marsh", "Whitaker", "Ashworth", "Collins", "Pemberton", "Holloway", "Barker", "Sutton", "Lowe", "Kendrick", "Hartley"] },
  "🇫🇷": { weight: 4, first: ["Louis", "Théo", "Hugo", "Arthur", "Raphaël", "Jules", "Mathis", "Gabriel", "Nathan", "Enzo", "Adrien", "Baptiste", "Clément"], last: ["Lefèvre", "Moreau", "Girard", "Rousseau", "Fontaine", "Chevalier", "Garnier", "Marchand", "Duval", "Lacroix", "Bonnet", "Perrin", "Mercier", "Lambert"] },
  "🇩🇪": { weight: 3, first: ["Lukas", "Felix", "Jonas", "Leon", "Maximilian", "Paul", "Niklas", "Tim", "Moritz", "Jannik", "Finn", "Elias"], last: ["Becker", "Hoffmann", "Krüger", "Schäfer", "Wagner", "Brandt", "Lehmann", "Vogel", "Hartmann", "Zimmermann", "Seidel", "Kraus"] },
  "🇮🇹": { weight: 4, first: ["Lorenzo", "Matteo", "Alessandro", "Leonardo", "Tommaso", "Riccardo", "Davide", "Federico", "Gabriele", "Andrea", "Edoardo", "Pietro"], last: ["Ferraro", "Colombo", "Marchetti", "Galli", "Conti", "Moretti", "Barbieri", "Lombardi", "Fontana", "Santoro", "Rinaldi", "Caruso", "Bellini"] },
  "🇪🇸": { weight: 3, first: ["Pablo", "Álvaro", "Hugo", "Daniel", "Javier", "Sergio", "Marc", "Pol", "Iker", "Adrián", "Rubén", "Unai"], last: ["García", "Navarro", "Ortega", "Serrano", "Molina", "Delgado", "Castillo", "Vidal", "Soler", "Ibarra", "Rovira", "Iglesias"] },
  "🇳🇱": { weight: 3, first: ["Daan", "Sem", "Milan", "Thijs", "Lars", "Bram", "Jesse", "Ruben", "Niels", "Joost", "Stijn"], last: ["Hoekstra", "van Dijk", "Bakker", "Visser", "Smit", "Mulder", "de Boer", "van Leeuwen", "Dekker", "Brouwer", "Kuipers", "van den Berg"] },
  "🇧🇷": { weight: 3, first: ["Gabriel", "Rafael", "Enzo", "Pedro", "Lucas", "Matheus", "Guilherme", "Caio", "Felipe", "Bruno", "Thiago", "Vinícius"], last: ["Ribeiro", "Carvalho", "Almeida", "Pereira", "Barbosa", "Rocha", "Cardoso", "Teixeira", "Moura", "Nogueira", "Fonseca", "Azevedo"] },
  "🇦🇷": { weight: 2, first: ["Valentino", "Santiago", "Joaquín", "Facundo", "Tomás", "Bautista", "Agustín", "Ignacio", "Franco", "Lautaro"], last: ["Fernández", "Gómez", "Benítez", "Aguirre", "Sosa", "Ledesma", "Ferreyra", "Quiroga", "Medina", "Paz", "Villalba"] },
  "🇲🇽": { weight: 2, first: ["Emiliano", "Diego", "Rodrigo", "Santiago", "Iñaki", "Alejandro", "Sebastián", "Andrés", "Mateo", "Patricio"], last: ["Hernández", "Ramírez", "Cervantes", "Salazar", "Treviño", "Villarreal", "Orozco", "Guerrero", "Zapata", "Mendoza"] },
  "🇨🇱": { weight: 1, first: ["Benjamín", "Vicente", "Martín", "Maximiliano", "Cristóbal", "Agustín", "Tomás", "Joaquín", "Matías"], last: ["Contreras", "Muñoz", "Rojas", "Espinoza", "Valenzuela", "Araya", "Fuentes", "Sepúlveda", "Carrasco", "Tapia"] },
  "🇨🇴": { weight: 1, first: ["Juan Pablo", "Samuel", "Nicolás", "Santiago", "Simón", "David", "Esteban"], last: ["Restrepo", "Cárdenas", "Ospina", "Arango", "Montes", "Londoño", "Quintero", "Salcedo"] },
  "🇺🇸": { weight: 3, first: ["Tyler", "Mason", "Logan", "Carter", "Brady", "Cole", "Hunter", "Austin", "Wyatt", "Dylan", "Connor", "Ryan"], last: ["Mitchell", "Reynolds", "Parker", "Brooks", "Sullivan", "Hayes", "Carver", "Donovan", "Whitman", "Bradley", "Foster", "Coleman"] },
  "🇨🇦": { weight: 1, first: ["Liam", "Noah", "Owen", "Logan", "Félix", "Samuel", "Nathan", "Zachary"], last: ["Tremblay", "Gagnon", "MacDonald", "Campbell", "Bouchard", "Fraser", "Lavoie", "Sinclair"] },
  "🇦🇺": { weight: 2, first: ["Lachlan", "Cooper", "Mitchell", "Riley", "Hayden", "Jayden", "Blake", "Jye", "Nate", "Kai"], last: ["Thompson", "McKenzie", "Gallagher", "Kerr", "Whitfield", "Brennan", "Doyle", "Hollis", "Strang", "Pearce"] },
  "🇳🇿": { weight: 1, first: ["Hamish", "Finn", "Nico", "Toby", "Angus", "Reuben"], last: ["Hale", "Rangi", "Murdoch", "Kingi", "Tane", "Ellis", "Burnett"] },
  "🇯🇵": { weight: 2, first: ["Ren", "Haruto", "Sota", "Yuto", "Riku", "Kaito", "Hayato", "Ritomo", "Kenta", "Daiki"], last: ["Takeda", "Nakamura", "Hoshino", "Yamamoto", "Matsuda", "Fujita", "Kimura", "Okada", "Hasegawa", "Mori", "Ishikawa"] },
  "🇨🇳": { weight: 1, first: ["Hao", "Jun", "Yifan", "Zihan", "Tianyu", "Ruiqi", "Bowen"], last: ["Li", "Wang", "Chen", "Zhang", "Liu", "Huang", "Xu", "Lin"] },
  "🇮🇳": { weight: 1, first: ["Arjun", "Kush", "Rohan", "Aditya", "Vihaan", "Ishaan"], last: ["Maini", "Sharma", "Reddy", "Kapoor", "Nair", "Mehta", "Iyer"] },
  "🇹🇭": { weight: 1, first: ["Tasanapol", "Kiattisak", "Pongsakorn", "Nattapong"], last: ["Inthraphuvasak", "Srisawat", "Chaiyaporn", "Wongsakul"] },
  "🇫🇮": { weight: 1, first: ["Eetu", "Aleksi", "Onni", "Juho", "Valtteri", "Niko"], last: ["Virtanen", "Korhonen", "Mäkinen", "Heikkinen", "Laaksonen", "Rantanen"] },
  "🇸🇪": { weight: 1, first: ["William", "Hugo", "Elias", "Viktor", "Oscar", "Linus"], last: ["Lindgren", "Bergström", "Nyström", "Sandberg", "Holm", "Ekström"] },
  "🇳🇴": { weight: 1, first: ["Magnus", "Sander", "Jonas", "Henrik", "Emil", "Sindre"], last: ["Haugen", "Solberg", "Bakken", "Lunde", "Dahl", "Strand"] },
  "🇩🇰": { weight: 1, first: ["Mads", "Frederik", "Oliver", "Mikkel", "Rasmus", "Asger"], last: ["Kjær", "Lauridsen", "Mortensen", "Holm", "Thomsen", "Bech"] },
  "🇧🇪": { weight: 1, first: ["Maxime", "Arthur", "Lucas", "Jarno", "Wout", "Thibault"], last: ["Peeters", "Janssens", "Maes", "Claes", "Wouters", "Dubois", "Lambert"] },
  "🇨🇭": { weight: 1, first: ["Luca", "Noah", "Jérôme", "Fabio", "Yannick"], last: ["Müller", "Keller", "Brunner", "Favre", "Ammann", "Rochat"] },
  "🇦🇹": { weight: 1, first: ["Lukas", "Tobias", "Florian", "Jakob", "Valentin"], last: ["Gruber", "Steiner", "Pichler", "Mayr", "Huber", "Moser"] },
  "🇵🇱": { weight: 1, first: ["Jakub", "Kacper", "Szymon", "Filip", "Mikołaj"], last: ["Nowak", "Wiśniewski", "Kowalczyk", "Zieliński", "Wróbel", "Mazur"] },
  "🇵🇹": { weight: 1, first: ["Tiago", "Duarte", "Rodrigo", "Afonso", "Martim"], last: ["Silva", "Costa", "Ferreira", "Gonçalves", "Pinto", "Lopes"] },
  "🇮🇪": { weight: 1, first: ["Cian", "Oisín", "Seán", "Darragh", "Conor"], last: ["O'Brien", "Byrne", "Kavanagh", "Doherty", "Gallagher", "Brennan"] },
  "🇪🇪": { weight: 1, first: ["Rasmus", "Karl", "Markus", "Sander"], last: ["Tamm", "Saar", "Kask", "Mägi", "Ilves"] },
  "🇧🇬": { weight: 1, first: ["Nikolay", "Georgi", "Martin", "Viktor"], last: ["Petrov", "Dimitrov", "Ivanov", "Stoyanov", "Kolev"] },
};

const FLAGS = Object.keys(NAME_POOLS);

/** A nationality, weighted by how many young drivers each country produces. */
export function pickNationality(rng: Rng): string {
  const total = FLAGS.reduce((a, f) => a + NAME_POOLS[f].weight, 0);
  let r = rng.next() * total;
  for (const f of FLAGS) {
    r -= NAME_POOLS[f].weight;
    if (r <= 0) return f;
  }
  return FLAGS[0];
}

/**
 * A name that fits the nationality and isn't already in use. Prefers surnames nobody
 * has, so the paddock doesn't fill up with the same few families.
 */
export function nameFor(flag: string, rng: Rng, used: Set<string>): string {
  const pool = NAME_POOLS[flag] ?? NAME_POOLS["🇬🇧"];
  const usedLast = new Set([...used].map((n) => n.split(" ").slice(-1)[0]));
  let fallback = "";
  for (let i = 0; i < 40; i++) {
    const name = `${rng.pick(pool.first)} ${rng.pick(pool.last)}`;
    if (used.has(name)) continue;
    if (!usedLast.has(name.split(" ").slice(-1)[0]) || i > 25) return name;
    fallback ||= name;
  }
  return fallback || `${rng.pick(pool.first)} ${rng.pick(pool.last)}`;
}

/** Feeder series teams (2026 grids). */
export const F2_TEAMS = ["ART Grand Prix", "Campos Racing", "DAMS", "Hitech", "Invicta Racing", "MP Motorsport", "Prema Racing", "Rodin Motorsport", "Trident", "Van Amersfoort Racing", "AIX Racing"];
export const F3_TEAMS = ["ART Grand Prix", "Campos Racing", "DAMS", "Hitech", "MP Motorsport", "Prema Racing", "Rodin Motorsport", "Trident", "Van Amersfoort Racing", "AIX Racing", "Jenzer Motorsport"];

/** Seasons already raced in F1 before 2026 (game values). */
export const F1_EXPERIENCE: Record<string, number> = {
  nor: 7, pia: 3, rus: 7, ant: 1, lec: 8, ham: 19, ver: 11, had: 1, alb: 6, sai: 11, alo: 21, str: 9, law: 2, lin: 0, oco: 9, bea: 1,
  gas: 9, col: 1, hul: 13, bor: 1, bot: 12, per: 14, tsu: 5, zho: 3, mag: 9, doo: 1, drg: 0, msc: 2, pou: 0, ves: 0, aro: 0,
};

/** Seasons in Formula 2 of the real juniors (affects when they are ready for F1). */
export const F2_SEASONS: Record<string, number> = {
  cam: 1, for: 2, bro: 2, dun: 1, min: 2, tso: 1, ste: 1, mon: 2, beg: 2, cra: 3, vrs: 5, mar: 3,
};
