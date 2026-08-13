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
| ~~Partidos del día~~ | ~~api-sports.io (liga 140)~~ | **BLOQUEADO en plan gratis, verificado 2026-08-13 con llamadas reales** — ver aviso abajo |
| ~~Tabla de posiciones~~ | ~~api-sports.io `/standings`~~ | mismo bloqueo |
| ~~Cuotas~~ | ~~api-sports.io `/odds`~~ | mismo bloqueo (de todas formas solo para comparar, nunca para predecir) |
| ~~Lesionados~~ | ~~api-sports.io `/injuries`~~ | **NO incluido en plan gratis para La Liga** (verificado 2026-08-12: `coverage.injuries: false` para la temporada 2026 vía `/leagues?id=140`). El ajuste de ausencias de Fase 2 ya se había botado por no ganarse el puesto contra el backtest. |
| ~~Alineaciones~~ | ~~api-sports.io `/fixtures/lineups`~~ | **NO incluido en plan gratis para La Liga** (mismo chequeo: `coverage.fixtures.lineups: false`). |

Límite real confirmado por headers de la propia API: `x-ratelimit-requests-limit: 100` (día), `10` (minuto) — coincide con el presupuesto de la regla 5. Esto sí es correcto, no es lo que falla.

### ⚠️ AVISO GRAVE (2026-08-13): el plan gratis no da acceso a la temporada 2026-27, punto

La verificación de `coverage` en `/leagues?id=140` (2026-08-12) decía qué existe para esa
liga en general — **no qué te deja pedir tu plan específico**. Son cosas distintas y se
confundieron. Con llamadas reales (7 peticiones gastadas, contador real en Supabase):

```
/fixtures?league=140&season=2026            -> "Free plans do not have access to this
                                                season, try from 2022 to 2024."
/standings?league=140&season=2025           -> mismo rechazo
/fixtures?league=140&date=2026-08-14&season=2026
                                             -> mismo rechazo, aunque la fecha esté
                                                dentro de la ventana permitida
```

El plan gratis de api-sports.io solo da acceso a las temporadas **2022 a 2024** para
`/fixtures`, `/standings` y `/teams` — nunca a la actual. No hay forma de traer
partidos del día, tabla de posiciones, ni el roster de equipos de la temporada en
curso con este plan. `datos/api.mjs` (Fase 3) está escrito y probado (con fetch
simulado) pero **no puede correr en vivo contra la temporada real hasta resolver
esto**.

No confirmado con documentación oficial de primera mano (api-football.com devuelve
403 a fetches automatizados). Evidencia indirecta (búsquedas, la propia página de
precios del dashboard) sugiere que los planes de pago (desde Pro, $19/mes) sí cubren
la temporada actual — "la diferencia entre planes es volumen y rango histórico, no
funcionalidades" — pero **no está verificado con una llamada real**. Antes de pagar,
preguntar al chat de soporte de api-sports si Pro cubre fixtures/standings/teams de
la temporada 2026-27.

**Fase 3 en vivo queda en pausa** hasta resolver esto. Lo que sí quedó construido y
funcionando de verdad, sin depender de este bloqueo: `sql/schema.sql` aplicado a
Supabase con los GRANT correctos, `datos/supabase.mjs`, y `datos/api.mjs` (contador
persistido, freno duro, caché, `partidosDelDia()` con persistencia real) — todo
probado con fetch simulado, cero llamadas reales en los tests.

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
