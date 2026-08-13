// Actualiza notas en vivo (flujo n8n 06-nota). Para cada predicción que
// todavía no tiene resultado_real, revisa si su partido ya terminó
// (fixtures.status = FINISHED) y si sí, calcula el resultado real y el
// Brier de esa predicción puntual (misma fórmula oficial de Fase 1, ver
// PLAN.md) y actualiza la fila.

import { fileURLToPath } from 'node:url';
import { seleccionar, upsert } from '../datos/supabase.mjs';
import { brierScore } from './notas.mjs';

function resultadoDe(golesLocal, golesVisitante) {
  if (golesLocal > golesVisitante) return 'local';
  if (golesLocal === golesVisitante) return 'empate';
  return 'visitante';
}

export async function actualizarNotas() {
  const predicciones = await seleccionar('predictions', 'resultado_real=is.null&select=*');
  if (predicciones.length === 0) return { actualizadas: 0 };

  const idsFixtures = predicciones.map((p) => p.fixture_id);
  const fixtures = await seleccionar(
    'fixtures',
    `id=in.(${idsFixtures.join(',')})&status=eq.FINISHED&select=id,home_goals,away_goals`
  );
  const fixturePorId = new Map(fixtures.map((f) => [f.id, f]));

  const actualizaciones = [];
  for (const p of predicciones) {
    const f = fixturePorId.get(p.fixture_id);
    if (!f || f.home_goals === null || f.away_goals === null) continue; // todavía no terminó

    const resultadoReal = resultadoDe(f.home_goals, f.away_goals);
    const brier = brierScore([
      { probLocal: p.prob_local, probEmpate: p.prob_empate, probVisitante: p.prob_visitante, resultadoReal },
    ]);

    actualizaciones.push({
      fixture_id: p.fixture_id,
      lh: p.lh,
      la: p.la,
      prob_local: p.prob_local,
      prob_empate: p.prob_empate,
      prob_visitante: p.prob_visitante,
      rho: p.rho,
      semivida_jornadas: p.semivida_jornadas,
      peso_prior: p.peso_prior,
      resultado_real: resultadoReal,
      brier,
    });
  }

  if (actualizaciones.length > 0) {
    await upsert('predictions', actualizaciones, { onConflict: 'fixture_id' });
  }
  return { actualizadas: actualizaciones.length };
}

async function main() {
  const resultado = await actualizarNotas();
  console.log(JSON.stringify(resultado));
}

const esEjecutadoDirectamente = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (esEjecutadoDirectamente) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
