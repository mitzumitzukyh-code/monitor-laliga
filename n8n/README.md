# Flujos de n8n (Fase 3)

Siete flujos, cada uno dispara un script de Node que ya existe y tiene su
prueba. n8n no guarda ningún secreto: todo pasa por `--env-file="D:\web 2\.env"`
directo al proceso de Node. **No se usa ninguna Credential de n8n.**

## ⚠️ n8n deshabilita Execute Command por defecto — 5 de estos 7 flujos no corren sin arreglarlo

Encontrado el 2026-08-14 en la instalación real (n8n 2.34.5,
`@n8n/config/dist/configs/nodes.config.js`):

```js
this.exclude = ['n8n-nodes-base.executeCommand', 'n8n-nodes-base.localFileTrigger'];
```

El nodo **está en disco pero n8n no lo carga**. Los flujos importan sin
error, pero al abrir el nodo dice *"This node is not currently installed"* y
no se puede ejecutar. La confirmación de "importó bien, sin errores" del
2026-08-13 no era evidencia suficiente: el import acepta el JSON igual,
falla en silencio hasta que intentas correrlo.

Afecta a `01-partidos`, `02-contexto`, `03-fuerzas`, `04-motor`, `06-nota` y
`99-errores`. Para habilitarlo, arrancar n8n así (dejando `localFileTrigger`
excluido, que no se usa):

```bash
NODES_EXCLUDE='["n8n-nodes-base.localFileTrigger"]' npx n8n start
```

Está excluido a propósito porque permite ejecutar comandos arbitrarios del
sistema desde un workflow. En una instancia local de un solo usuario el
riesgo es acotado, pero **habilitarlo es decisión del dueño.** Para
verificar que quedó activo: en un workflow presionar `N` y buscar "Execute
Command"; si no aparece, la variable no se aplicó.

| Archivo | Qué hace | Corre después de |
|---|---|---|
| `01-partidos.json` | Baja los partidos del día (football-data.org) y guarda equipos/fixtures en Supabase | — |
| `02-contexto.json` | Tabla de posiciones actual, cacheada en disco (no se persiste, no hay tabla para esto) | 01 |
| `03-fuerzas.json` | Diagnóstico: imprime fuerzas de ataque/defensa de los equipos de hoy. No persiste nada | 01 |
| `04-motor.json` | Predice los partidos del día (Dixon-Coles) y guarda en `predictions` | 01 |
| `05-alineaciones.json` | **Inactivo a propósito.** Sin fuente gratis de lineups/injuries todavía (ver `CLAUDE.md`) | — |
| `06-nota.json` | Actualiza `resultado_real` y Brier de las predicciones de partidos ya terminados | después de que terminen los partidos del día (ajustar hora) |
| `99-errores.json` | Flujo de error central. Registra fallos de los otros 6 en el log de n8n | — |

## Orden de importación

**Importar `99-errores.json` primero.** Los otros 6 necesitan apuntar a él
como su "Error Workflow" (paso manual, ver abajo), y n8n solo deja elegir
workflows que ya existen en la instancia.

1. `99-errores.json`
2. Los otros 6, en cualquier orden.

## Cómo importar (gotchas reales, encontrados esta sesión)

1. **Create workflow** primero (canvas vacío) — **no** usar el importador
   directo desde la lista de Overview, ese menú no tiene esa opción.
2. Menú ⋮ (arriba a la derecha) → **Import from file** → elegir el JSON.
3. n8n **no renombra el workflow** al nombre interno del JSON (`"name"`).
   Va a seguir diciendo "My workflow". Cambiar el título a mano (click en
   el texto arriba a la izquierda) para que coincida con el archivo, por
   ejemplo `01-partidos`.
4. **Guardar explícitamente con Ctrl+S antes de navegar a otro lado.**
   El import solo reemplaza el contenido del canvas abierto — si no se
   guarda, se pierde en silencio y no queda ningún rastro de error.
5. Repetir para los 7.

## Conectar el flujo de errores (manual, por cada uno de los 6)

n8n no permite meter esto en el JSON porque el ID del workflow de errores
lo asigna n8n recién al importarlo — no se puede saber de antemano.

Para cada uno de `01`, `02`, `03`, `04`, `06` (y `05` si algún día se activa):

1. Abrir el flujo → **Settings** (⋮ → Settings, o el ícono de engranaje).
2. **Error Workflow** → elegir `99-errores`.
3. Guardar.

## Activar

Todos quedan con `"active": false` al importar (menos `05`, que se deja
inactivo a propósito para siempre). Activar desde el toggle de cada
workflow cuando se quiera que corran solos. Antes de activar, ajustar la
hora de cada Schedule Trigger — todos quedan con el intervalo por defecto
(hay que abrir el nodo y poner la hora real).

## Lo que está verificado y lo que no

- **Verificado con import real** en la instancia del usuario:
  `n8n-nodes-base.scheduleTrigger` (v1.3), `n8n-nodes-base.executeCommand`,
  `n8n-nodes-base.stickyNote`.
- **No verificado en vivo:** `n8n-nodes-base.errorTrigger` en
  `99-errores.json`. Los nombres de campo usados en el comando
  (`{{$json.workflow.name}}`, `{{$json.execution.lastNodeExecuted}}`,
  `{{$json.execution.error.message}}`) vienen de la documentación de n8n,
  no de una ejecución real de prueba. Antes de confiar en las notificaciones
  de error: forzar un fallo real en cualquiera de los 6 flujos y revisar
  que `salida/cli-log-error.mjs` reciba los tres valores correctos (no
  `undefined`). Ajustar las rutas de campo si no coinciden.
