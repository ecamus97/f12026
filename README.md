# F1 Manager 2026

Juego de gestión de F1 (temporada 2026): eliges una escudería y diriges la estrategia de tus dos pilotos durante los 24 Grandes Premios.

## Cómo se juega

1. **Elige tu equipo** al iniciar la temporada.
2. **Clasificación**: Q1 (elimina 6), Q2 (elimina 6) y Q3 (top 10) con tiempos simulados.
3. **Carrera vuelta a vuelta** con el circuito animado arriba (1x ≈ 6 s por vuelta, 2x, 4x, 16x, de a una vuelta o directo al final). Desde el *muro de boxes* controlas:
   - modo del piloto: **Atacar** (más rápido, gasta más neumático y arriesga errores), **Normal**, **Cuidar**;
   - **parada en boxes** con el compuesto que elijas (blando / medio / duro). Es obligatorio usar dos compuestos.
   - La carrera se pausa sola cuando sale el safety car (parar en boxes cuesta ~45% menos).
4. **Sede del equipo**: gráfico de evolución de todas las escuderías (general o por componente), patrocinadores a elegir (estable, por rendimiento, prima de firma, premium), presupuesto, proyectos de I+D (aerodinámica, motor, chasis, fiabilidad, pit crew), mejoras de instalaciones y finanzas por carrera. Los rivales también desarrollan según su presupuesto.
5. Puntos 2026 (25-18-15-12-10-8-6-4-2-1, sin punto por vuelta rápida). El progreso se autoguarda en el navegador.

## Motor de simulación (`src/engine`)

Funciones puras y deterministas (PRNG con semilla), separadas de la UI:

- `model.ts` – convierte ratings en segundos: ritmo de auto y piloto, desgaste por compuesto (con "cliff"), combustible, aire sucio, probabilidad de adelantamiento según circuito.
- `race.ts` – simulación por vuelta: tiempos, adelantamientos, paradas, abandonos, errores, safety car y clasificación.
- `strategy.ts` – estrategia de la IA (planes 1-2 paradas según desgaste del circuito, paradas oportunistas con SC).
- `qualifying.ts` – formato Q1/Q2/Q3 de 22 autos.
- `management.ts` – economía y desarrollo: presupuesto, ingresos/gastos por carrera, proyectos, instalaciones, desarrollo de la IA.
- `championship.ts` – standings calculados siempre desde los resultados (con desempate por countback).

Los ratings de autos/pilotos y los datos de cada circuito están en `src/data/f1Data.ts` (también editables desde **Config** en el juego). Son valores de juego, no datos oficiales.

## Desarrollo

```sh
npm i
npm run dev        # servidor local
npm test           # tests del motor
npm run calibrate  # reporte estadístico (ganadores, abandonos, adelantamientos por circuito...)
```

## Publicar en GitHub Pages

Cada push a `main` compila, corre los tests y publica en https://ecamus97.github.io/f12026/ vía GitHub Actions
(Settings → Pages → Source: *GitHub Actions*).

Alternativa manual si Actions no está disponible: `npm run deploy:pages` y `git push origin gh-pages`
(Source: *Deploy from a branch* → `gh-pages`).

Los trazados de los circuitos vienen de [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (licencia MIT).

Stack: Vite + React + TypeScript + Tailwind + shadcn/ui. Proyecto sincronizado con Lovable vía GitHub.
