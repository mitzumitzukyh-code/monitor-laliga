# Monitor LaLiga

## Qué es esto

Sistema que monitorea todos los partidos de LaLiga, calcula la probabilidad de
victoria local / empate / victoria visitante, se pone nota a sí mismo contra los
resultados reales, y avisa por Discord.

Un solo usuario: el dueño. **No hay** login, registro, cobro, multiusuario ni
panel de administración. Si una tarea implica cualquiera de esas cosas, está
fuera de alcance — pregunta antes de escribirla.

## Stack

- JavaScript, módulos ES, extensión `.mjs`. **Nada de TypeScript.**
- Node 20+
- Cero dependencias en `motor/` y `juez/` — es matemática pura
- Supabase para guardar (solo a partir de Fase 3)
- n8n autoalojado como orquestador (solo a partir de Fase 3)
- Discord webhook para avisos y errores

## Las seis reglas duras

Estas no se negocian. Si un cambio las rompe, no se hace.

1. **Los porcentajes siempre salen del cálculo matemático.** Ningún modelo de
   lenguaje estima probabilidades. Un LLM solo puede: leer texto desordenado y
   convertirlo en variables, y redactar la narrativa. Nunca produce un número
   que llegue al usuario.

2. **Todos los ajustes se aplican a los goles esperados, nunca a los
   porcentajes finales.** Si falta el goleador, se baja lambda de 1,35 a 1,22 y
   se vuelve a construir la matriz. No se le resta 5 puntos al porcentaje.

3. **Nada llega a Discord ni a la web sin haber pasado por el backtest.** Cada
   funcionalidad nueva se mide contra las temporadas históricas antes de
   activarse en producción.

4. **Cada cosa nueva tiene que ganarse el puesto.** Si al agregar un ajuste el
   Brier score no mejora, el ajuste se corrige o se bota. No se queda porque
   "suena lógico".

5. **Nunca pedir a la API lo que ya está guardado.** Presupuesto: 100 peticiones
   al día, compartidas con desarrollo. Revisar la base antes de pedir. Cachear
   todo lo que cambia lento.

6. **Cero fuga de información temporal.** Al calcular la predicción de un
   partido de la jornada 15, el código solo puede ver datos de las jornadas 1 a
   14. Si un cálculo puede ver el futuro, el backtest es mentira y el proyecto
   entero no vale nada.

## Estructura

```
datos/     lo que entra (histórico, del día, lesionados, alineaciones, cuotas)
motor/     elo.mjs, dixoncoles.mjs, ajustes.mjs
juez/      backtest.mjs, notas.mjs, registro.mjs
salida/    discord.mjs, web/
n8n/       los JSON de los flujos
pruebas/   una prueba por cada función del motor
datos/cache/   archivos descargados (en .gitignore)
```

## Fuentes de datos

| Qué | De dónde | Costo |
|---|---|---|
| Histórico (5 temporadas) | football-data.co.uk, archivos SP1.csv | gratis, sin llave |
| Partidos del día | api-sports.io (liga 140) | 100 peticiones/día |
| Tabla de posiciones | api-sports.io `/standings` | incluido en plan gratis |
| Cuotas | api-sports.io `/odds` | incluido en plan gratis, solo para comparar, nunca para predecir |
| ~~Lesionados~~ | ~~api-sports.io `/injuries`~~ | **NO incluido en plan gratis para La Liga** (verificado 2026-08-12: `coverage.injuries: false` para la temporada 2026 vía `/leagues?id=140`). El ajuste de ausencias de Fase 2 ya se había botado por no ganarse el puesto contra el backtest — esto confirma que tampoco tendría de dónde alimentarse en vivo. Requeriría plan de pago (desde Pro, $19/mes) si algún día se retoma. |
| ~~Alineaciones~~ | ~~api-sports.io `/fixtures/lineups`~~ | **NO incluido en plan gratis para La Liga** (mismo chequeo: `coverage.fixtures.lineups: false`). Mismo límite que arriba. |

Límite real confirmado por headers de la propia API (no asumido): `x-ratelimit-requests-limit: 100` (día), `10` (minuto) — coincide con el presupuesto de la regla 5.

## Orden de fases

```
Fase 0  bajar el histórico y validarlo
Fase 1  motor + backtest        ← aquí se decide si el proyecto sigue
Fase 2  lesionados y banca      ← lo diferencial, probado contra el backtest
Fase 3  conectar en vivo (API, Supabase, n8n)
Fase 4  Discord
Fase 5  web
```

**No adelantar fases.** No escribir la web antes de que el motor pase la prueba.
No tocar api-sports en Fase 0 ni 1. Si el usuario pide saltar, recordarle el
orden y preguntar si de verdad quiere saltarlo.

## Secretos

Nunca en el código. Siempre en `.env`, que va en `.gitignore` desde el primer
commit. Las llaves no se necesitan hasta la Fase 3.

## Estilo de trabajo

- Español venezolano, informal, directo. Sin rodeos ni disculpas de más.
- Entregables listos para copiar y pegar, no ensayos explicativos.
- Cada función del motor lleva su prueba con números verificables a mano.
- Antes de escribir código nuevo, revisar si ya existe algo parecido en el repo.
- Al terminar una tarea, decir qué quedó pendiente. No declarar victoria a medias.
