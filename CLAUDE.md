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
| Partidos del día | football-data.org `/v4/competitions/PD/matches` | gratis, con token, 10 peticiones/minuto |
| Tabla de posiciones | football-data.org `/v4/competitions/PD/standings` | gratis, con token |
| ~~Cuotas~~ | — | Sin fuente gratis conocida. No es crítico, solo se usaba para comparar, nunca para predecir. |
| ~~Lesionados~~ | — | No incluido en ningún plan gratis probado (ni api-sports ni football-data.org). El ajuste de ausencias de Fase 2 ya se había botado por no ganarse el puesto contra el backtest. |
| ~~Alineaciones~~ | — | Mismo límite que lesionados. |

### api-sports.io — descartado para "en vivo" (2026-08-13)

Se probó primero con api-sports.io. Con llamadas reales se confirmó que su plan
gratis **solo da acceso a las temporadas 2022 a 2024** para `/fixtures`, `/standings`
y `/teams` — nunca a la temporada actual, ni siquiera con la fecha dentro de la
ventana permitida (`"Free plans do not have access to this season, try from 2022 to
2024"`). El chequeo de `coverage` en `/leagues?id=140` (que sí mostraba banderas en
`true` para 2026) describe qué existe para la liga en general, no qué te deja pedir
el plan — son cosas distintas, y confundirlas costó una ronda completa de trabajo.
No confirmado si un plan de pago (Pro, $19/mes) lo resuelve — quedó sin probar porque
se encontró una alternativa gratis que sí funciona.

### football-data.org — fuente en vivo actual, verificada con llamadas reales (2026-08-13)

Registro gratis, sin tarjeta, token instantáneo por correo. Verificado con llamadas
reales (no solo documentación):

- `/v4/competitions/PD` → 200, temporada real 2026-27 (`currentSeason` con
  `startDate: 2026-08-16`)
- `/v4/competitions/PD/matches?matchday=1` → 200, los 10 partidos reales de la
  jornada 1 con los 20 equipos reales de la temporada
- `partidosDelDia('2026-08-15')` end-to-end contra Supabase real → guardó 4 equipos
  y 2 partidos reales, verificado con un select posterior

Límite real: **10 peticiones por minuto**, sin tope diario documentado (a diferencia
de api-sports). Sin lineups/injuries/odds en el plan gratis (igual que api-sports).

Tres equipos de la temporada 2026-27 no tienen ninguna fila en el histórico de Fase 0
(nunca estuvieron en las últimas 5 temporadas): Racing de Santander, Deportivo de La
Coruña y Málaga — recién ascendidos o de vuelta. El suavizado bayesiano de
`motor/elo.mjs` (`PESO_PRIOR_PARTIDOS`) ya maneja este caso sin romperse. Ver
`datos/equipos-vivo.mjs` para el mapeo de nombres (football-data.org ↔ nombre corto
canónico que usa el motor desde Fase 0).

**Fase 3 en vivo sigue adelante sobre esta fuente.** `datos/api.mjs` fue reescrito
para football-data.org (antes apuntaba a api-sports), con `sql/schema.sql` ajustado
(`league_id` default 2014, antes 140). Todo probado con fetch simulado en los tests
automáticos, y verificado además con llamadas reales puntuales (no en cada corrida
de `node --test`, por presupuesto).

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
No tocar la fuente en vivo (football-data.org) en Fase 0 ni 1. Si el usuario pide
saltar, recordarle el orden y preguntar si de verdad quiere saltarlo.

## Secretos

Nunca en el código. Siempre en `.env`, que va en `.gitignore` desde el primer
commit. Las llaves no se necesitan hasta la Fase 3.

## Estilo de trabajo

- Español venezolano, informal, directo. Sin rodeos ni disculpas de más.
- Entregables listos para copiar y pegar, no ensayos explicativos.
- Cada función del motor lleva su prueba con números verificables a mano.
- Antes de escribir código nuevo, revisar si ya existe algo parecido en el repo.
- Al terminar una tarea, decir qué quedó pendiente. No declarar victoria a medias.
