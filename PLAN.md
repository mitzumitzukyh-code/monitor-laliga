# Plan de ejecución

Cada fase trae el prompt exacto para pegarle a Claude Code y el criterio para
saber si pasó o no. **No avanzar de fase sin cumplir el criterio.**

---

## Fase 0 — El histórico

**Qué necesitas antes:** nada. Ni llaves, ni cuentas, ni servidor. Solo Node 20+.

### Prompt

```
Lee CLAUDE.md. Vamos con la Fase 0 completa.

1. Crea la estructura de carpetas del proyecto y el .gitignore
   (que incluya .env y datos/cache/).

2. Escribe datos/historico.mjs que:
   - Baje las últimas 5 temporadas de LaLiga desde football-data.co.uk
     (archivos SP1.csv de cada temporada)
   - Las guarde en datos/cache/ y no vuelva a bajarlas si ya están
   - Las una en un solo archivo datos/cache/laliga.json con esta forma:
     { fecha, local, visitante, golesLocal, golesVisitante, temporada }
   - Ordene todo por fecha ascendente
   - Imprima un resumen: partidos por temporada y rango de fechas

3. Escribe pruebas/historico.test.mjs que verifique:
   - No hay partidos duplicados (misma fecha + mismos dos equipos)
   - Todas las fechas caen dentro de su temporada
   - No hay goles negativos, nulos ni no numéricos
   - Cada temporada tiene exactamente 380 partidos
   - Los nombres de equipo son consistentes entre temporadas
     (si "Ath Bilbao" aparece en una y "Athletic Club" en otra, avísame)

4. Córrelo y muéstrame el resumen.

No toques api-sports. No escribas el motor. No escribas nada de red que no sea
la descarga de los CSV.
```

### Criterio para pasar

- 1.900 partidos exactos (5 × 380)
- Cero duplicados
- Nombres de equipo unificados
- Correr el script dos veces no vuelve a descargar nada

---

## Fase 1 — El motor y el juez

**La fase que decide todo.** Si el motor no pasa aquí, el proyecto se replantea.

### Prompt

```
Lee CLAUDE.md. Fase 1. Hazlo en cuatro pasos y párate a mostrarme
resultados en cada uno.

PASO 1 — motor/dixoncoles.mjs
  - poisson(k, lambda)
  - tau(x, y, lh, la, rho)   ← la corrección de marcadores bajos
  - matrizMarcadores(lh, la, maxGoles, rho)
  - probabilidades(lh, la) → { local, empate, visitante }
  Pruebas con números verificables a mano:
  - poisson(0, 1) debe dar exactamente e^-1
  - las probabilidades siempre suman 1 (tolerancia 1e-9)
  - con lh == la y rho == 0, local y visitante deben ser idénticos
  - con lambdas 1.35 y 1.15, sale aprox 41 / 27 / 32

PASO 2 — motor/elo.mjs
  - fuerzas de ataque y defensa por equipo, separadas casa / fuera
  - decaimiento exponencial, vida media configurable en jornadas
  - lambdas(local, visitante, promedioLigaCasa, promedioLigaFuera)
  Prueba: un equipo que mete el doble del promedio debe dar ataque ≈ 2.0

PASO 3 — juez/backtest.mjs
  Este es el más importante. Requisitos innegociables:
  - Recorre las 5 temporadas jornada por jornada
  - En cada jornada, calcula las fuerzas SOLO con partidos anteriores a esa
    fecha. Nunca con la jornada actual ni con ninguna posterior.
  - Descarta las primeras 6 jornadas de cada temporada (no hay datos suficientes)
  - Guarda cada predicción con su resultado real en juez/resultados.json

  Escribe también una prueba anti-fuga: corre el backtest sobre un histórico
  recortado a la mitad y verifica que las predicciones de la primera mitad
  salgan idénticas a cuando corre con el histórico completo. Si cambian,
  hay fuga y hay que arreglarla antes de seguir.

PASO 4 — juez/notas.mjs
  - Brier score multiclase
  - Log loss
  - Porcentaje de acierto del resultado más probable
  - Las mismas tres métricas para las cuotas de mercado (déjalo preparado,
    aunque en Fase 1 todavía no tengamos cuotas)
  - Tabla comparativa por temporada

Muéstrame la tabla final.
```

### Criterio para pasar

| Métrica | Umbral |
|---|---|
| Acierto del resultado más probable | ≥ 48% |
| Brier score | ≤ 0,21 |
| Prueba anti-fuga | pasa |
| Suma de probabilidades | 1,000 siempre |

**Fórmula exacta del Brier score** (esto quedó ambiguo durante la Fase 1 y
tardó tres rondas de auditoría en resolverse — que no se repita): multiclase,
normalizado por número de clases (K=3), promediado sobre los partidos:

```
brier = (1/N) * Σ_partidos [ (1/3) * Σ_clases (prob_clase - resultado_clase)² ]
```

Rango real **[0, 2/3]**, no [0,1] — el error máximo posible en las tres
clases suma 2, dividido entre 3 da 2/3. Un modelo que siempre predice
1/3-1/3-1/3 (sin usar ningún dato) da brier ≈ 0,222 bajo esta fórmula; el
umbral de 0,21 exige superar ese piso, no acercarse a la perfección.

Si el acierto sale por encima de 60%, **desconfía**: casi seguro hay fuga
temporal. Que el auditor lo revise antes de celebrar.

---

## Fase 2 — Lesionados y banca

Lo que hace distinto este proyecto. Y lo que hay que probar mejor.

### Prompt

```
Lee CLAUDE.md. Fase 2.

1. motor/ausencias.mjs
   - pesoAusente(jugador) usando: cuota de minutos jugados, posición y
     aporte de gol por 90
   - impactoOfensivo(ausentes) y impactoDefensivo(ausentes), ambos topados
   - aplicarAusencias(lh, la, ausentesLocal, ausentesVisitante)
     Recordatorio de la regla 2: esto modifica los LAMBDAS, nunca los
     porcentajes finales.

2. Coeficientes configurables en config.mjs, no incrustados en el código.

3. juez/comparar.mjs: corre el backtest CON y SIN el ajuste de ausencias
   sobre el mismo histórico y me muestra las dos notas lado a lado.

4. Dime el veredicto sin adornos: ¿el ajuste mejora la nota, la empeora,
   o no cambia nada?

Ojo: el histórico de football-data.co.uk NO trae lesionados. Antes de
escribir nada, dime cómo propones conseguir ausencias históricas para poder
probar esto de verdad, y cuánto trabajo es cada opción.
```

### Criterio para pasar

El Brier score con ausencias tiene que ser **mejor** que sin ellas. Si es igual
o peor, se ajustan los coeficientes o se bota el ajuste. No se activa en
producción un ajuste que no mejora nada.

---

## Fase 3 — En vivo

**Qué necesitas antes:**
- Llave de api-sports.io, con la temporada actual verificada
- Proyecto de Supabase creado
- n8n corriendo (local o en servidor)

### Prompt

```
Lee CLAUDE.md. Fase 3.

1. Esquema de Supabase en sql/schema.sql: teams, fixtures, absences,
   lineups, predictions, calibration.

2. datos/api.mjs: cliente de api-sports con
   - Contador de peticiones del día, persistido
   - Freno duro a las 80 peticiones (deja 20 de reserva)
   - Caché en disco con vencimiento por tipo de dato
   - Nunca pide algo que ya esté en Supabase y siga vigente

3. Los siete flujos de n8n como JSON importables, en n8n/:
   01-partidos.json, 02-contexto.json, 03-fuerzas.json, 04-motor.json,
   05-alineaciones.json, 06-nota.json, 99-errores.json

4. Un README en n8n/ con el orden de importación y qué credencial va en
   cada nodo.

Las llaves van en .env. Ningún valor real dentro de un JSON.
```

---

## Fase 4 — Discord

```
Lee CLAUDE.md. Fase 4.

salida/discord.mjs con tres funciones:
- mensajeMañana(partidos, historial)
- mensajeAlineacion(partido, antes, despues)  ← solo si cambió más de 3 puntos
- mensajeNoche(resultados, historial)
Y logError(flujo, nodo, error) para el flujo 99.

Los fallos se muestran igual de visibles que los aciertos.
El contador de acierto acumulado va en los tres mensajes.
Ningún mensaje sugiere apostar.
```

---

## Fase 5 — La web

**Solo arrancar cuando haya 100 partidos reales con nota puesta.**

```
Lee CLAUDE.md. Fase 5.
Página estática, un solo usuario, sin login. Lee de Supabase.
Pantalla principal: nota y aciertos arriba, partidos del día, últimos resultados
con aciertos y fallos igual de visibles.
Ficha de partido: goles esperados, matriz de marcadores, ausencias con su
impacto, antes/después de la alineación, forma de los últimos 5.
Sin cuotas de casas de apuestas más allá de la comparación de nota.
```
