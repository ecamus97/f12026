# F1 Manager 2026

Juego de gestión de F1 en modo carrera: eliges una escudería en 2026 y la diriges temporada tras temporada (estrategia, desarrollo del auto, contratos de pilotos y dirección del equipo).

## Cómo se juega

1. **Elige tu equipo** al iniciar la temporada.
2. **Clasificación**: Q1 (elimina 6), Q2 (elimina 6) y Q3 (top 10) con tiempos simulados.
3. **Carrera vuelta a vuelta** con el circuito animado arriba (1x ≈ 6 s por vuelta, 2x, 4x, 16x, de a una vuelta o directo al final). Desde el *muro de boxes* controlas:
   - tres modos: **neumáticos** (Atacar / Normal / Cuidar), **combustible** (Mezcla rica / Normal / Ahorro, con margen de vueltas: si se acaba, abandona) y **energía ERS** (Desplegar / Equilibrado / Recargar, con batería);
   - **parada en boxes** con el compuesto que elijas (blando / medio / duro / intermedio / lluvia extrema). En seco es obligatorio usar dos compuestos.
   - **Clima**: lluvia que puede empezar o parar durante la carrera, pista que se moja y se seca, temperatura que aumenta el desgaste, y un pronóstico por tramos de vueltas (antes y durante la carrera) que se vuelve más fiable a medida que se acerca.
   - La carrera se pausa sola con safety car, cambios de clima o abandonos tuyos.
4. **Sede del equipo**: gráfico de evolución de todas las escuderías (general o por componente), patrocinadores a elegir (estable, por rendimiento, prima de firma, premium), presupuesto, proyectos de I+D (aerodinámica, motor, chasis, fiabilidad, pit crew), mejoras de instalaciones y finanzas por carrera. Los rivales también desarrollan según su presupuesto.
5. **Pilotos y dirección**: contratos con sueldo y fecha de término; renovar o fichar para la próxima temporada entre la parrilla, agentes libres y juveniles de F2 (los jóvenes son baratos y crecen hacia su potencial, los veteranos decaen y se retiran). Jefe de equipo y director técnico reales, con efectos en patrocinios, sueldos e I+D.
6. **Temporadas**: al terminar las 24 carreras se cobra el premio de constructores, los pilotos envejecen, hay fichajes y retiros, llegan juveniles nuevos y empieza el año siguiente. Proyectos, obras y patrocinios continúan.
7. **Circuitos y auto**: cada circuito pondera distinto aerodinámica, motor y chasis, así que algunos equipos rinden mejor en ciertas pistas. Cada área tiene sus propias piezas a desarrollar (con costos, plazos y riesgo distintos) y las instalaciones tardan 10 a 16 carreras.
8. Puntos 2026 (25-18-15-12-10-8-6-4-2-1, sin punto por vuelta rápida). El progreso se autoguarda en el navegador.

## Motor de simulación (`src/engine`)

Funciones puras y deterministas (PRNG con semilla), separadas de la UI:

- `model.ts` – convierte ratings en segundos: ritmo de auto y piloto, desgaste por compuesto (con "cliff"), combustible, aire sucio, probabilidad de adelantamiento según circuito.
- `race.ts` – simulación por vuelta: tiempos, adelantamientos, paradas, abandonos, errores, safety car y clasificación.
- `strategy.ts` – estrategia de la IA (planes 1-2 paradas según desgaste del circuito, paradas oportunistas con SC).
- `qualifying.ts` – formato Q1/Q2/Q3 de 22 autos.
- `management.ts` – economía y desarrollo: presupuesto, ingresos/gastos por carrera, proyectos, instalaciones, desarrollo de la IA.
- `weather.ts` – clima por vuelta (lluvia, humedad de pista, temperatura) y pronóstico con incertidumbre.
- `people.ts` – pilotos y directivos: contratos, mercado, sueldos, desarrollo por edad, retiros, juveniles y cambio de temporada (datos en `src/data/peopleData.ts`).
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
