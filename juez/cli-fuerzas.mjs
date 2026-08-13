// CLI para el flujo n8n 03-fuerzas.json: diagnóstico, no persiste nada (no
// hay tabla para esto en sql/schema.sql). juez/vivo-motor.mjs (04-motor)
// recalcula esto mismo internamente al predecir -- barato, mismo patrón
// que juez/backtest.mjs desde Fase 1. Este script es solo para ver en el
// log de n8n qué fuerzas se están usando, útil para auditar sin tener que
// ir a leer la base.
import { fileURLToPath } from 'node:url';
import { mapaDeEquipos, historicoCompleto, partidosDe } from './vivo.mjs';
import { fuerzas } from '../motor/elo.mjs';

async function main() {
  const fecha = process.argv[2] || new Date().toISOString().slice(0, 10);
  const nombrePorId = await mapaDeEquipos();
  const partidos = await partidosDe(fecha, nombrePorId);
  const historico = await historicoCompleto(nombrePorId);

  const resumen = partidos.map((p) => {
    const { porEquipo } = fuerzas(historico, p.fechaCorte);
    return {
      local: p.local,
      visitante: p.visitante,
      fuerzasLocal: porEquipo.get(p.local) ?? null,
      fuerzasVisitante: porEquipo.get(p.visitante) ?? null,
    };
  });
  console.log(JSON.stringify({ fecha, resumen }, null, 2));
}

const esEjecutadoDirectamente = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (esEjecutadoDirectamente) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
