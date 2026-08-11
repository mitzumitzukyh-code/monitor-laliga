# Cómo arrancar

## Antes de abrir Claude Code

```bash
node --version    # tiene que decir 20 o más
git --version
```

Nada más. Fase 0 y Fase 1 no necesitan llaves, ni cuentas, ni servidor.

## Los cuatro archivos

```
CLAUDE.md                       la constitución — Claude Code la lee sola
PLAN.md                         las fases y los prompts para copiar
ARRANQUE.md                     este archivo
.claude/agents/motor-engineer.md   el que construye
.claude/agents/auditor.md          el de respaldo
```

Los metes en la carpeta del proyecto y ya. Claude Code detecta la carpeta
`.claude/agents/` solo.

## El ciclo de trabajo

Para cada fase, siempre lo mismo:

1. Copias el prompt de la fase desde `PLAN.md` y se lo pegas
2. Claude Code trabaja con el agente `motor-engineer`
3. Cuando dice que terminó, le escribes:

```
Llama al agente auditor. Que corra la auditoría completa de esta fase
y me dé el veredicto.
```

4. Si el veredicto es NO CERRAR, le pasas los bloqueantes al motor-engineer
5. Repites hasta CERRAR
6. Recién ahí pasas a la fase siguiente

**No te saltes el paso 3.** Es todo el punto de tener dos agentes: el que
construye tiene sesgo a favor de su propio trabajo, y el de respaldo no.

## Primer comando

```
Lee CLAUDE.md y PLAN.md. Arranca la Fase 0.
```

## Lo que te toca a ti (no lo hace Claude Code)

Nada en Fase 0 ni Fase 1.

A partir de Fase 3:

- Registrarte en api-sports.io y verificar que el plan gratis te dé la
  temporada actual
- Crear el proyecto en Supabase
- Crear el webhook de Discord
- Levantar n8n (local primero, servidor después)
- Importar los JSON de los flujos y pegar las credenciales

La extensión de Chrome ayuda con la verificación de la llave y con importar los
flujos en n8n. No ayuda con Discord ni con Oracle Cloud.

## Recordatorio

El acierto normal en LaLiga está entre 50 y 55%. Si el backtest te da mucho
más, el auditor tiene que revisarlo antes de que celebres.
