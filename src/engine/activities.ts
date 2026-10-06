// Agenda between races: sponsor commitments, media, factory life... each with three choices.
import { createRng, type Rng } from "./rng";
import type { DevArea } from "./management";
import type { SponsorDeal } from "./sponsors";
import type { StaffRole } from "@/data/peopleData";

export type DriverStat = "pace" | "consistency" | "racecraft" | "tyreMgmt";

export interface ActivityEffect {
  budget?: number; // M USD
  area?: { area: DevArea; delta: number }; // car rating
  drivers?: { stat: DriverStat; delta: number; which: "both" | "first" | "second" };
  project?: number; // races gained (+) or lost (-) on the longest running project
  sponsorRaces?: number; // the sponsor's contract gets longer (+) or shorter (-)
  staff?: { role: StaffRole; delta: number };
}

export interface ActivityChoice {
  label: string;
  desc: string;
  effect: ActivityEffect;
  risk?: { chance: number; effect: ActivityEffect; text: string }; // something can go wrong (or right)
}

export type ActivityKind = "sponsor" | "media" | "team" | "technical" | "fans" | "charity";

export interface Activity {
  id: string;
  season: number;
  beforeRound: number; // shown before this round (1-based); 1 = pre-season
  date: string; // ISO yyyy-mm-dd
  kind: ActivityKind;
  icon: string;
  title: string;
  text: string;
  sponsorId?: string;
  tpl?: string; // template used
  choices: ActivityChoice[];
  chosen?: number;
  outcome?: string; // what happened
}

export const ACTIVITY_KIND_INFO: Record<ActivityKind, { label: string; color: string }> = {
  sponsor: { label: "Patrocinador", color: "#f59e0b" },
  media: { label: "Medios", color: "#a78bfa" },
  team: { label: "Equipo", color: "#22c55e" },
  technical: { label: "Técnico", color: "#38bdf8" },
  fans: { label: "Aficionados", color: "#f472b6" },
  charity: { label: "Solidario", color: "#34d399" },
};

// --- Dates ----------------------------------------------------------------------

const MONTHS: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

/** "06-08 Mar" -> first and last day of the race weekend (handles "30 Oct-01 Nov"). */
export function weekendDates(date: string, season: number): { start: Date; end: Date } {
  const m = date.match(/(\d{1,2})(?:\s*([A-Za-z]{3}))?\s*-\s*(\d{1,2})\s*([A-Za-z]{3})/);
  if (!m) return { start: new Date(season, 0, 1), end: new Date(season, 0, 1) };
  const endMonth = MONTHS[m[4]] ?? 0;
  const startMonth = m[2] ? MONTHS[m[2]] ?? endMonth : endMonth;
  return { start: new Date(season, startMonth, +m[1]), end: new Date(season, endMonth, +m[3]) };
}

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// --- Sponsor industries -------------------------------------------------------------

export type Industry =
  | "coffee" | "drinks" | "food" | "energy" | "tech" | "telecom" | "finance" | "travel" | "watches" | "fashion" | "beauty" | "tools" | "logistics" | "mobility" | "optics";

const INDUSTRY: Record<string, Industry> = {
  "Voltara Energy": "energy", "Helios Solar": "energy",
  "Nimbus Cloud": "tech", "Quantix Labs": "tech", "Vantage Software": "tech", "Atlas Robotics": "tech",
  "Pulse Telecom": "telecom",
  "Aurora Bank": "finance", "Tidal Fintech": "finance", "Granite Capital": "finance", "Cobalt Insurance": "finance",
  "Halcyon Air": "travel", "Orbis Travel": "travel", "Riviera Resorts": "travel",
  "Kestrel Watches": "watches",
  "Northwind Apparel": "fashion",
  "Solenne Cosmetics": "beauty",
  "Ironbark Tools": "tools",
  "Meridian Logistics": "logistics",
  "Zephyr Mobility": "mobility",
  "Lumen Optics": "optics",
  "Ember Coffee": "coffee",
  "Vireo Beverages": "drinks",
  "Saffron Foods": "food",
};
export const industryOf = (name: string): Industry => INDUSTRY[name] ?? "tech";

// --- Templates --------------------------------------------------------------------------

interface Ctx {
  team: string;
  d1: string;
  d2: string;
  sponsor?: SponsorDeal;
  rng: Rng;
}

type Template = {
  kind: ActivityKind;
  icon: string;
  needs?: Industry[]; // only with a sponsor of these industries
  anySponsor?: boolean;
  make: (c: Ctx) => { title: string; text: string; choices: ActivityChoice[] };
};

const m = (x: number) => Math.round(x * 10) / 10;

const TEMPLATES: Template[] = [
  // ---- sponsors -------------------------------------------------------------------
  {
    kind: "sponsor",
    icon: "☕",
    needs: ["coffee", "drinks", "food"],
    make: ({ sponsor, d1, d2, team }) => ({
      title: `${sponsor!.name} lanza un producto edición ${team}`,
      text: `${sponsor!.name} quiere usar a tus pilotos en el lanzamiento de su nueva línea con los colores del equipo: grabación, degustación con fans y tienda pop-up.`,
      choices: [
        {
          label: "Todo el día con ambos pilotos",
          desc: "Gran activación. Pagan un bono extra, pero los pilotos pierden un día de simulador.",
          effect: { budget: 0.9, sponsorRaces: 2, drivers: { stat: "consistency", delta: -0.4, which: "both" } },
        },
        {
          label: `Solo ${d1} por la tarde`,
          desc: "Una aparición corta: bono moderado, sin afectar la preparación.",
          effect: { budget: 0.4 },
        },
        {
          label: `Mandar un video de ${d2}`,
          desc: "Cumples lo mínimo del contrato. Al patrocinador no le encanta.",
          effect: { sponsorRaces: -1 },
        },
      ],
    }),
  },
  {
    kind: "sponsor",
    icon: "⚡",
    needs: ["energy", "drinks", "mobility"],
    make: ({ sponsor, d1 }) => ({
      title: `${sponsor!.name} propone un evento extremo`,
      text: `Para su nueva campaña, ${sponsor!.name} quiere grabar a ${d1} manejando un prototipo en una pista de hielo y saltando en paracaídas.`,
      choices: [
        {
          label: "Aceptar todo",
          desc: "El video será viral y el contrato mejora… si nadie se lesiona.",
          effect: { budget: 1.3, sponsorRaces: 3 },
          risk: { chance: 0.15, effect: { drivers: { stat: "pace", delta: -1, which: "first" } }, text: `${d1} se lesionó la muñeca: pierde ritmo.` },
        },
        { label: "Solo el prototipo, sin paracaídas", desc: "Menos espectacular, sin riesgos.", effect: { budget: 0.5 } },
        { label: "Rechazar", desc: "Prioridad absoluta a la temporada.", effect: { sponsorRaces: -1 } },
      ],
    }),
  },
  {
    kind: "sponsor",
    icon: "⌚",
    needs: ["watches", "fashion", "beauty", "optics"],
    make: ({ sponsor, team }) => ({
      title: `${sponsor!.name}: colección cápsula ${team}`,
      text: `${sponsor!.name} quiere diseñar una edición limitada con el logo del equipo y lanzarla en el próximo Gran Premio.`,
      choices: [
        {
          label: "Codiseñar con el equipo de diseño del auto",
          desc: "Se vende muy bien, pero quitas horas al túnel de viento.",
          effect: { budget: 1.2, sponsorRaces: 3, area: { area: "aero", delta: -0.3 } },
        },
        { label: "Ceder la marca y aprobar el diseño", desc: "Ingreso por licencias sin distraer al equipo.", effect: { budget: 0.6 } },
        { label: "Solo una sesión de fotos", desc: "Neutral: cumples lo pactado.", effect: {} },
      ],
    }),
  },
  {
    kind: "sponsor",
    icon: "💼",
    needs: ["finance"],
    make: ({ sponsor, d1 }) => ({
      title: `Cena de inversores de ${sponsor!.name}`,
      text: `${sponsor!.name} organiza una cena con sus clientes más importantes y quiere a alguien del equipo como figura principal.`,
      choices: [
        { label: "Va el jefe de equipo", desc: "Buen networking: mejora el contrato.", effect: { budget: 0.8, sponsorRaces: 2 } },
        {
          label: `Va ${d1}`,
          desc: "Los invitados felices, pero el piloto llega cansado al fin de semana.",
          effect: { budget: 1.1, drivers: { stat: "consistency", delta: -0.3, which: "first" } },
        },
        { label: "Excusarse", desc: "Sin efectos, pero pierdes la oportunidad.", effect: {} },
      ],
    }),
  },
  {
    kind: "sponsor",
    icon: "🛰️",
    needs: ["tech", "telecom", "logistics", "tools"],
    make: ({ sponsor }) => ({
      title: `${sponsor!.name} ofrece colaboración tecnológica`,
      text: `${sponsor!.name} propone integrar su tecnología en el análisis de datos del equipo a cambio de usar el caso en su publicidad.`,
      choices: [
        {
          label: "Integrarla en la simulación del auto",
          desc: "Acelera el proyecto en curso, pero compartes datos sensibles.",
          effect: { project: 1 },
          risk: { chance: 0.2, effect: { budget: -0.8 }, text: "Una filtración obligó a pagar una auditoría de seguridad." },
        },
        { label: "Usarla solo en logística", desc: "Ahorro de costos seguro.", effect: { budget: 0.5 } },
        { label: "Solo hacer el comercial", desc: "Pago pequeño y nada más.", effect: { budget: 0.2 } },
      ],
    }),
  },
  {
    kind: "sponsor",
    icon: "✈️",
    needs: ["travel"],
    make: ({ sponsor, d2 }) => ({
      title: `Vuelo con aficionados de ${sponsor!.name}`,
      text: `${sponsor!.name} sortea un viaje al próximo Gran Premio con un piloto a bordo y quiere hacer un show durante el vuelo.`,
      choices: [
        { label: `${d2} viaja con los fans`, desc: "Experiencia memorable, mejor contrato.", effect: { budget: 0.6, sponsorRaces: 2, drivers: { stat: "consistency", delta: -0.2, which: "second" } } },
        { label: "Un video saludo y entradas para el paddock", desc: "Cumple bien y no molesta a nadie.", effect: { budget: 0.3 } },
        { label: "Rechazar", desc: "El patrocinador lo anota.", effect: { sponsorRaces: -1 } },
      ],
    }),
  },
  {
    kind: "sponsor",
    icon: "🎉",
    anySponsor: true,
    make: ({ sponsor, team }) => ({
      title: `${sponsor!.name} presenta su nueva campaña`,
      text: `${sponsor!.name} lanza su campaña global y quiere que ${team} sea el centro del evento de presentación.`,
      choices: [
        { label: "Evento en la fábrica", desc: "Gran exposición, pero la fábrica para un día.", effect: { budget: 1.0, sponsorRaces: 2, project: -1 } },
        { label: "Evento en su sede", desc: "Bono moderado y nada se detiene.", effect: { budget: 0.5 } },
        { label: "Participación digital", desc: "Lo mínimo. Neutral.", effect: { budget: 0.1 } },
      ],
    }),
  },
  // ---- not about sponsors ---------------------------------------------------------
  {
    kind: "technical",
    icon: "🛞",
    make: ({ d1 }) => ({
      title: "Pirelli pide un día de pruebas de neumáticos",
      text: "Pirelli busca equipos para probar los compuestos del próximo año. Es un día de pista con datos valiosos, pero cuesta mantener al equipo allí.",
      choices: [
        { label: `Con ${d1} al volante`, desc: "Tu piloto aprende a cuidar mejor los neumáticos.", effect: { budget: -0.4, drivers: { stat: "tyreMgmt", delta: 0.8, which: "first" } } },
        { label: "Con el piloto reserva", desc: "Pirelli paga los costos; aprendes algo del auto.", effect: { budget: 0.2, area: { area: "chassis", delta: 0.2 } } },
        { label: "No participar", desc: "Sin efectos.", effect: {} },
      ],
    }),
  },
  {
    kind: "fans",
    icon: "🏭",
    make: ({ team }) => ({
      title: "Día de puertas abiertas",
      text: `Miles de aficionados quieren visitar la sede de ${team}. Se puede abrir la fábrica, hacer un evento afuera o no hacer nada.`,
      choices: [
        { label: "Abrir la fábrica completa", desc: "Mucho merchandising vendido, pero se para el trabajo un día.", effect: { budget: 0.8, project: -1 } },
        { label: "Fan zone en el estacionamiento", desc: "Algo de dinero sin molestar a nadie.", effect: { budget: 0.35 } },
        { label: "Turno extra en la fábrica", desc: "Pagas horas extra y avanza el desarrollo.", effect: { budget: -0.6, project: 1 } },
      ],
    }),
  },
  {
    kind: "media",
    icon: "🎙️",
    make: ({ d2 }) => ({
      title: `Polémica: ${d2} critica la estrategia del equipo`,
      text: `En una entrevista, ${d2} dijo que el equipo "lo dejó tirado" en la última carrera. La prensa pide una reacción.`,
      choices: [
        { label: "Respaldarlo públicamente", desc: "El piloto se siente apoyado y rinde con más confianza.", effect: { drivers: { stat: "consistency", delta: 0.6, which: "second" } } },
        { label: "Multarlo en privado", desc: "Disciplina: recuperas dinero pero el ambiente se enfría.", effect: { budget: 0.3, drivers: { stat: "consistency", delta: -0.4, which: "second" } } },
        { label: "No comentar", desc: "Se apaga solo. Neutral.", effect: {} },
      ],
    }),
  },
  {
    kind: "technical",
    icon: "🖥️",
    make: () => ({
      title: "Oferta de un simulador de última generación",
      text: "Un fabricante ofrece su nuevo simulador con modelos de neumáticos mucho más precisos.",
      choices: [
        { label: "Comprarlo", desc: "Caro, pero ambos pilotos mejoran.", effect: { budget: -2.5, drivers: { stat: "pace", delta: 0.4, which: "both" } } },
        { label: "Arrendarlo por la temporada", desc: "Más barato, mejora menor.", effect: { budget: -1, drivers: { stat: "pace", delta: 0.2, which: "both" } } },
        { label: "Quedarse con el actual", desc: "Sin gasto ni mejora.", effect: {} },
      ],
    }),
  },
  {
    kind: "team",
    icon: "🧑‍🔬",
    make: ({ team }) => ({
      title: "Un ingeniero de un rival quiere venir",
      text: `Un ingeniero de aerodinámica de un equipo rival ofrece sus servicios a ${team}. Trae ideas frescas… y quizás algún problema legal.`,
      choices: [
        {
          label: "Contratarlo ya",
          desc: "Mejora la aerodinámica, pero el rival podría demandar.",
          effect: { budget: -1.2, area: { area: "aero", delta: 0.8 } },
          risk: { chance: 0.25, effect: { budget: -2 }, text: "El rival demandó: hubo que pagar un acuerdo." },
        },
        { label: "Esperar a que cumpla su jardinería", desc: "Llega más tarde y sin riesgo.", effect: { budget: -0.8, area: { area: "aero", delta: 0.4 } } },
        { label: "Rechazar", desc: "Sin efectos.", effect: {} },
      ],
    }),
  },
  {
    kind: "technical",
    icon: "🔧",
    make: () => ({
      title: "Problema en la cadena de suministro",
      text: "Un proveedor de piezas de carbono se atrasa. El próximo paquete de mejoras podría retrasarse.",
      choices: [
        { label: "Pagar envío urgente", desc: "Caro pero no pierdes tiempo.", effect: { budget: -0.9 } },
        { label: "Fabricar en casa", desc: "Barato, pero la fábrica pierde ritmo.", effect: { budget: -0.2, project: -1 } },
        { label: "Esperar", desc: "Sin costo; el proyecto en curso se atrasa más.", effect: { project: -2 } },
      ],
    }),
  },
  {
    kind: "charity",
    icon: "💙",
    make: ({ d1, d2 }) => ({
      title: "Visita a un hospital infantil",
      text: `Una fundación invita a ${d1} y ${d2} a visitar un hospital infantil y subastar un casco firmado.`,
      choices: [
        { label: "Ir con ambos pilotos y donar", desc: "Motiva a todo el equipo.", effect: { budget: -0.3, drivers: { stat: "consistency", delta: 0.4, which: "both" } } },
        { label: "Donar el casco", desc: "Buen gesto, sin costo.", effect: {} },
        { label: "Subastar y quedarse parte", desc: "Algo de dinero, mala prensa.", effect: { budget: 0.3, drivers: { stat: "consistency", delta: -0.2, which: "both" } } },
      ],
    }),
  },
  {
    kind: "team",
    icon: "🏋️",
    make: ({ d1 }) => ({
      title: "Campamento de preparación física",
      text: `El preparador físico propone llevar a ${d1} a un campamento de altura antes del próximo GP.`,
      choices: [
        { label: "Una semana completa", desc: "Mejor forma física y constancia.", effect: { budget: -0.4, drivers: { stat: "consistency", delta: 0.6, which: "first" } } },
        { label: "Fin de semana corto", desc: "Algo de mejora.", effect: { budget: -0.15, drivers: { stat: "consistency", delta: 0.25, which: "first" } } },
        { label: "Entrenar en casa", desc: "Sin cambios.", effect: {} },
      ],
    }),
  },
  {
    kind: "media",
    icon: "🎬",
    make: ({ team }) => ({
      title: "Una plataforma de streaming quiere grabar un documental",
      text: `Proponen seguir a ${team} toda la temporada con cámaras en la fábrica y en el muro de boxes.`,
      choices: [
        { label: "Acceso total", desc: "Buen pago, pero las cámaras distraen a los ingenieros.", effect: { budget: 1.4, project: -1 } },
        { label: "Acceso limitado", desc: "Pago menor sin molestias.", effect: { budget: 0.6 } },
        { label: "No participar", desc: "Neutral.", effect: {} },
      ],
    }),
  },
];

/** Agenda between two races (or before the first one). */
export function generateActivities(opts: {
  season: number;
  beforeRound: number;
  from: Date; // day after the previous race (or start of pre-season)
  to: Date; // first day of the next race weekend
  team: string;
  drivers: [string, string];
  sponsors: SponsorDeal[];
  seed: number;
  taken: string[]; // templates used recently (avoid repeats)
}): Activity[] {
  const rng = createRng(opts.seed ^ (opts.season * 7907) ^ (opts.beforeRound * 15485863));
  const days = Math.max(1, Math.round((opts.to.getTime() - opts.from.getTime()) / 86400000) - 1);
  const count = days > 10 ? 2 : rng.chance(0.75) ? 1 : 0;
  const out: Activity[] = [];
  const used = new Set(opts.taken);
  for (let i = 0; i < count; i++) {
    const sponsor = opts.sponsors.length && rng.chance(0.55) ? rng.pick(opts.sponsors) : undefined;
    const ind = sponsor ? industryOf(sponsor.name) : null;
    const pool = TEMPLATES.filter((t) => {
      if (t.needs) return !!ind && t.needs.includes(ind);
      if (t.anySponsor) return !!sponsor;
      return !sponsor;
    }).filter((t) => !used.has(String(TEMPLATES.indexOf(t))));
    const list = pool.length ? pool : TEMPLATES.filter((t) => !t.needs && !t.anySponsor);
    const t = rng.pick(list);
    used.add(String(TEMPLATES.indexOf(t)));
    const made = t.make({ team: opts.team, d1: opts.drivers[0], d2: opts.drivers[1], sponsor, rng });
    const day = new Date(opts.from.getTime() + (1 + Math.floor(((i + 1) * days) / (count + 1))) * 86400000);
    out.push({
      id: `${opts.season}-${opts.beforeRound}-${i}`,
      season: opts.season,
      beforeRound: opts.beforeRound,
      date: isoDate(day),
      kind: t.kind,
      icon: t.icon,
      sponsorId: sponsor?.id,
      tpl: String(TEMPLATES.indexOf(t)),
      ...made,
      choices: made.choices.map((c) => ({ ...c, effect: { ...c.effect, budget: c.effect.budget !== undefined ? m(c.effect.budget) : undefined } })),
    });
  }
  return out;
}

/** Short text of an effect for the choice buttons. */
export function describeEffect(e: ActivityEffect): string[] {
  const out: string[] = [];
  if (e.budget) out.push(`${e.budget > 0 ? "+" : ""}US$ ${e.budget.toFixed(1)} M`);
  if (e.sponsorRaces) out.push(`contrato ${e.sponsorRaces > 0 ? "+" : ""}${e.sponsorRaces} carreras`);
  if (e.project) out.push(e.project > 0 ? `proyecto −${e.project} carrera` : `proyecto +${-e.project} carrera${e.project < -1 ? "s" : ""}`);
  if (e.area) out.push(`${({ aero: "aerodinámica", powerUnit: "motor", chassis: "chasis", reliability: "fiabilidad", pitCrew: "pit crew" } as const)[e.area.area]} ${e.area.delta > 0 ? "+" : ""}${e.area.delta}`);
  if (e.drivers) {
    const stat = { pace: "ritmo", consistency: "constancia", racecraft: "carrera", tyreMgmt: "neumáticos" }[e.drivers.stat];
    out.push(`${stat} ${e.drivers.delta > 0 ? "+" : ""}${e.drivers.delta}${e.drivers.which === "both" ? " (ambos)" : ""}`);
  }
  if (e.staff) out.push(`personal ${e.staff.delta > 0 ? "+" : ""}${e.staff.delta}`);
  return out;
}
