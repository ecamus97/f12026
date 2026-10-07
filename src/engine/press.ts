// Press conferences: questions about what just happened (team orders, crashes, results, contracts,
// unrest), answered from the agenda. Answers move the drivers' morale, and sometimes more.
import { createRng } from "./rng";
import { isoDate, type Activity, type ActivityChoice } from "./activities";
import type { OrderLog } from "./mood";

export interface PressDriver {
  id: string;
  name: string;
  index: 0 | 1; // position in the team's line-up (for stat effects)
  morale: number;
  form: number;
  contractEnds: boolean; // contract ends this season and nothing signed yet
}

export interface PressRaceRow {
  id: string;
  pos: number | null; // null = DNF
  crash: boolean;
}

const short = (n: string) => n.split(" ").slice(-1)[0];
const which = (d: PressDriver) => (d.index === 0 ? "first" : "second") as "first" | "second";

type Hook = { weight: number; make: () => { title: string; text: string; icon: string; choices: ActivityChoice[] } };

/**
 * A press conference for the agenda before `beforeRound`, about the last race and the team's mood.
 * Returns null when there's nothing worth a question (or by chance).
 */
export function generatePress(opts: {
  season: number;
  beforeRound: number;
  from: Date; // day after the last race
  team: string;
  rival: string; // another team's name (for the trash talk)
  drivers: PressDriver[];
  lastRace: PressRaceRow[]; // the player's two cars in the last Grand Prix
  orders: OrderLog[]; // team orders of the player's team in the last race
  seed: number;
}): Activity | null {
  if (opts.beforeRound <= 1 || opts.drivers.length < 2) return null;
  const rng = createRng(opts.seed ^ (opts.season * 92821) ^ (opts.beforeRound * 68917) ^ 0x9e55);
  const D = opts.drivers;
  const byId = (id: string) => D.find((d) => d.id === id);
  const hooks: Hook[] = [];

  // a team order
  const order = opts.orders.find((o) => o.kind === "swap");
  if (order) {
    const y = byId(order.yielded);
    const f = byId(order.favored);
    if (y && f)
      hooks.push({
        weight: 5,
        make: () => ({
          icon: "🎙️",
          title: `¿Por qué ${short(y.name)} tuvo que dejar pasar a ${short(f.name)}?`,
          text: `Los periodistas quieren saber por qué el equipo ordenó a ${y.name} ceder la posición${order.obeyed ? "" : ", y por qué no obedeció"}.`,
          choices: [
            {
              label: "El equipo está por encima de todo",
              desc: `Defiendes la orden. A ${short(y.name)} no le gusta escucharlo.`,
              effect: { morale: [{ id: y.id, name: y.name, delta: -3 }, { id: f.id, name: f.name, delta: 2 }] },
            },
            {
              label: `Agradecer el sacrificio de ${short(y.name)}`,
              desc: "Reconoces su trabajo en público: lo ayuda a pasar página.",
              effect: { morale: [{ id: y.id, name: y.name, delta: 4 }, { id: f.id, name: f.name, delta: -1 }] },
            },
            { label: "Sin comentarios", desc: "Evitas el tema. Queda la duda.", effect: { morale: [{ id: y.id, name: y.name, delta: -1 }] } },
          ],
        }),
      });
  }

  // a crash
  const crash = opts.lastRace.find((r) => r.crash);
  const cd = crash && byId(crash.id);
  if (cd)
    hooks.push({
      weight: 4,
      make: () => ({
        icon: "🎙️",
        title: `¿Fue culpa de ${short(cd.name)} el accidente?`,
        text: `Tras el abandono de ${cd.name} en el último Gran Premio, la prensa pregunta si el equipo confía en él.`,
        choices: [
          { label: `Respaldarlo públicamente`, desc: "Le das tu apoyo total.", effect: { morale: [{ id: cd.id, name: cd.name, delta: 5 }] } },
          {
            label: "Pedirle más cuidado",
            desc: "Mensaje firme: será más prudente, pero le duele.",
            effect: { morale: [{ id: cd.id, name: cd.name, delta: -4 }], drivers: { stat: "consistency", delta: 0.8, which: which(cd) } },
          },
          { label: "Sin comentarios", desc: "Ni a favor ni en contra.", effect: {} },
        ],
      }),
    });

  // a podium
  const best = [...opts.lastRace].filter((r) => r.pos != null && r.pos <= 3).sort((a, b) => a.pos! - b.pos!)[0];
  const pd = best && byId(best.id);
  if (pd && best) {
    const mate = D.find((d) => d.id !== pd.id)!;
    hooks.push({
      weight: 3,
      make: () => ({
        icon: "🏆",
        title: best.pos === 1 ? `Victoria de ${short(pd.name)}: rueda de prensa del ganador` : `Podio de ${short(pd.name)}: el equipo celebra`,
        text: `Los medios quieren tu opinión sobre el ${best.pos === 1 ? "triunfo" : "podio"} de ${pd.name}.`,
        choices: [
          {
            label: `Elogiar a ${short(pd.name)}`,
            desc: `Lo pones por las nubes. ${short(mate.name)} se siente un poco relegado.`,
            effect: { morale: [{ id: pd.id, name: pd.name, delta: 3 }, { id: mate.id, name: mate.name, delta: -1 }] },
          },
          {
            label: "Mérito de todo el equipo",
            desc: "Mensaje de unidad; a los patrocinadores les encanta.",
            effect: { budget: 0.3, morale: [{ id: pd.id, name: pd.name, delta: 1 }, { id: mate.id, name: mate.name, delta: 1 }] },
          },
          { label: "Pies en la tierra", desc: "Todavía queda mucho campeonato.", effect: {} },
        ],
      }),
    });
  }

  // a driver in a bad run
  const slump = [...D].sort((a, b) => a.form - b.form)[0];
  if (slump && slump.form <= -0.8)
    hooks.push({
      weight: 3,
      make: () => ({
        icon: "🎙️",
        title: `¿Está en riesgo el asiento de ${short(slump.name)}?`,
        text: `${slump.name} lleva varias carreras por debajo de lo que permite el auto y la prensa empieza a especular.`,
        choices: [
          { label: "Confianza total", desc: "Le quitas presión.", effect: { morale: [{ id: slump.id, name: slump.name, delta: 6 }] } },
          {
            label: "Tiene que mejorar ya",
            desc: "Más presión: se concentra más, pero lo pasa mal.",
            effect: { morale: [{ id: slump.id, name: slump.name, delta: -5 }], drivers: { stat: "consistency", delta: 0.6, which: which(slump) } },
          },
          { label: "No hablamos de contratos", desc: "La especulación sigue.", effect: { morale: [{ id: slump.id, name: slump.name, delta: -1 }] } },
        ],
      }),
    });

  // a contract ending
  const ending = D.find((d) => d.contractEnds);
  if (ending && opts.beforeRound >= 8)
    hooks.push({
      weight: 2,
      make: () => ({
        icon: "📝",
        title: `¿Seguirá ${short(ending.name)} el próximo año?`,
        text: `El contrato de ${ending.name} termina esta temporada y todos preguntan por su futuro.`,
        choices: [
          { label: "Queremos que siga", desc: "Lo motiva saberse valorado.", effect: { morale: [{ id: ending.id, name: ending.name, delta: 5 }] } },
          { label: "Estamos evaluando opciones", desc: "Honesto, pero lo deja inquieto.", effect: { morale: [{ id: ending.id, name: ending.name, delta: -5 }] } },
          { label: "Lo hablaremos en privado", desc: "Respuesta neutral.", effect: {} },
        ],
      }),
    });

  // unrest
  const unhappy = D.find((d) => d.morale < 40);
  if (unhappy)
    hooks.push({
      weight: 4,
      make: () => ({
        icon: "📰",
        title: `Rumores de malestar de ${short(unhappy.name)}`,
        text: `Según la prensa, ${unhappy.name} no está contento en el equipo. Te piden que lo aclares.`,
        choices: [
          {
            label: "Reunión a puertas cerradas",
            desc: "Escuchas sus quejas: cuesta algo de tiempo y dinero, pero mejora el ambiente.",
            effect: { budget: -0.1, morale: [{ id: unhappy.id, name: unhappy.name, delta: 7 }] },
          },
          { label: "Negar los rumores", desc: "Calma a la prensa, no tanto al piloto.", effect: { morale: [{ id: unhappy.id, name: unhappy.name, delta: 1 }] } },
          { label: "Sin comentarios", desc: "El malestar sigue.", effect: { morale: [{ id: unhappy.id, name: unhappy.name, delta: -2 }] } },
        ],
      }),
    });

  let pick: Hook | null = null;
  if (hooks.length && rng.chance(0.65)) {
    const total = hooks.reduce((a, h) => a + h.weight, 0);
    let r = rng.next() * total;
    for (const h of hooks) {
      r -= h.weight;
      if (r <= 0) {
        pick = h;
        break;
      }
    }
    pick ??= hooks[0];
  } else if (rng.chance(0.2)) {
    const [d1, d2] = D;
    pick = {
      weight: 1,
      make: () => ({
        icon: "🎙️",
        title: `El jefe de ${opts.rival} critica a ${opts.team}`,
        text: `En la rueda de prensa de la FIA, el jefe de ${opts.rival} dijo que tu auto "no es tan rápido como dicen". Te piden una respuesta.`,
        choices: [
          {
            label: "Responder con dureza",
            desc: "Tus pilotos lo agradecen, pero la FIA podría multarte.",
            effect: { morale: [{ id: d1.id, name: d1.name, delta: 2 }, { id: d2.id, name: d2.name, delta: 2 }] },
            risk: { chance: 0.3, effect: { budget: -0.3 }, text: "La FIA te multa por tus declaraciones.", safe: "La FIA lo deja pasar." },
          },
          { label: "Responder con humor", desc: "Buen ambiente en el equipo.", effect: { morale: [{ id: d1.id, name: d1.name, delta: 1 }, { id: d2.id, name: d2.name, delta: 1 }] } },
          { label: "Ignorarlo", desc: "No entras en su juego.", effect: {} },
        ],
      }),
    };
  }
  if (!pick) return null;
  const made = pick.make();
  const day = new Date(opts.from.getTime() + 86400000);
  return {
    id: `${opts.season}-${opts.beforeRound}-press`,
    season: opts.season,
    beforeRound: opts.beforeRound,
    date: isoDate(day),
    kind: "press",
    tpl: "press",
    drivers: [D[0].name, D[1].name],
    ...made,
  };
}
