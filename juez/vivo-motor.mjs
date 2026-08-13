// Predicción en vivo (flujo n8n 04-motor). Para cada partido de la fecha
// dada que todavía no tenga predicción, calcula fuerzas + lambdas +
// probabilidades (mismo motor de Fase 1, sin ajustes — el de ausencias
// sigue botado desde Fase 2) y las guarda en predictions.
//
// Regla 6: fuerzas() se calcula con fechaCorte = inicio real de la jornada
// del partido (ver juez/vivo.mjs), nunca con la fecha del propio partido.

import { fileURLToPath } from 'node:url';
import { mapaDeEquipos, historicoCompleto, partidosDe } from './vivo.mjs';
import { fuerzas, lambdas } from '../motor/elo.mjs';
import { probabilidades } from '../motor/dixoncoles.mjs';
import { upsert } from '../datos/supabase.mjs';
import { RHO, SEMIVIDA_JORNADAS, PESO_PRIOR_PARTIDOS } from '../config.mjs';

export async function predecirDia(fecha) {
  const nombrePorId = await mapaDeEquipos();
  const partidos = await partidosDe(fecha, nombrePorId);
  if (partidos.length === 0) return { predicciones: [], sinFuerzas: [] };

  const historico = await historicoCompleto(nombrePorId);

  const predicciones = [];
  const sinFuerzas = [];
  for (const partido of partidos) {
    const { porEquipo, promedioLigaCasa, promedioLigaFuera } = fuerzas(historico, partido.fechaCorte);
    const fLocal = porEquipo.get(partido.local);
    const fVisitante = porEquipo.get(partido.visitante);

    // Un equipo con CERO partidos previos (nunca, ni uno) no tiene entrada
    // en porEquipo -- el suavizado bayesiano regulariza a los que ya
    // tienen algún historial, pero no inventa uno de la nada. Pasa, por
    // ejemplo, en el primer partido de un recién ascendido. Se anota y se
    // sigue de largo en vez de reventar todo el flujo por un partido.
    if (!fLocal || !fVisitante) {
      sinFuerzas.push({ local: partido.local, visitante: partido.visitante });
      continue;
    }

    const { lh, la } = lambdas(fLocal, fVisitante, promedioLigaCasa, promedioLigaFuera);
    const probs = probabilidades(lh, la);

    predicciones.push({
      fixture_id: partido.id,
      lh,
      la,
      prob_local: probs.local,
      prob_empate: probs.empate,
      prob_visitante: probs.visitante,
      rho: RHO,
      semivida_jornadas: SEMIVIDA_JORNADAS,
      peso_prior: PESO_PRIOR_PARTIDOS,
    });
  }

  if (predicciones.length > 0) {
    await upsert('predictions', predicciones, { onConflict: 'fixture_id' });
  }

  return { predicciones, sinFuerzas };
}

async function main() {
  const fecha = process.argv[2] || new Date().toISOString().slice(0, 10);
  const { predicciones, sinFuerzas } = await predecirDia(fecha);
  console.log(JSON.stringify({ fecha, predicciones: predicciones.length, sinFuerzas }));
}

const esEjecutadoDirectamente = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (esEjecutadoDirectamente) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
