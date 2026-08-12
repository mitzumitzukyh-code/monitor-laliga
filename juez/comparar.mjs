// Corre el backtest CON y SIN el ajuste de ausencias sobre el mismo
// histórico, y muestra las dos notas lado a lado. Regla 4: lo nuevo se gana
// el puesto, o se bota. Nada de esto llega a producción sin pasar por acá.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { backtest } from './backtest.mjs';
import { metricas } from './notas.mjs';
import { estadisticasJugadores, detectarAusentes, aplicarAusencias } from '../motor/ausencias.mjs';

// Agrupar por equipo una sola vez (en vez de filtrar las ~84.000 filas
// completas en cada partido) es puramente una optimización de velocidad:
// motor/ausencias.mjs igual vuelve a filtrar por fecha adentro, solo que
// sobre un array ~26 veces más chico. No cambia qué partidos entran ni el
// resultado, verificado con pruebas/comparar.test.mjs.
function crearAjusteAusencias(alineaciones, opcionesAusencias = {}) {
  const porEquipo = new Map();
  for (const fila of alineaciones) {
    if (!porEquipo.has(fila.equipo)) porEquipo.set(fila.equipo, []);
    porEquipo.get(fila.equipo).push(fila);
  }

  return ({ lh, la, partido, fechaCorte }) => {
    const filasLocal = porEquipo.get(partido.local) ?? [];
    const filasVisitante = porEquipo.get(partido.visitante) ?? [];
    const { semividaJornadasJugador, umbralRegular, ...coeficientes } = opcionesAusencias;

    const statsLocal = estadisticasJugadores(filasLocal, partido.local, fechaCorte, semividaJornadasJugador);
    const statsVisitante = estadisticasJugadores(filasVisitante, partido.visitante, fechaCorte, semividaJornadasJugador);
    const ausentesLocal = detectarAusentes(filasLocal, partido.local, partido.fecha, statsLocal, umbralRegular);
    const ausentesVisitante = detectarAusentes(filasVisitante, partido.visitante, partido.fecha, statsVisitante, umbralRegular);
    return aplicarAusencias(lh, la, ausentesLocal, ausentesVisitante, coeficientes);
  };
}

function filaTabla(etiqueta, m) {
  return `${etiqueta.padEnd(22)} N=${String(m.n).padEnd(5)} acierto=${(m.acierto * 100).toFixed(1).padStart(5)}%  brier=${m.brier.toFixed(4)}  logLoss=${m.logLoss.toFixed(4)}`;
}

export async function compararConYSinAusencias(partidos, alineaciones, opcionesAusencias = {}) {
  const sinAjuste = backtest(partidos);
  const conAjuste = backtest(partidos, { ajustarLambdas: crearAjusteAusencias(alineaciones, opcionesAusencias) });
  return { sinAjuste, conAjuste };
}

async function main() {
  const RUTA_HISTORICO = new URL('../datos/cache/laliga.json', import.meta.url);
  const RUTA_ALINEACIONES = new URL('../datos/cache/alineaciones.json', import.meta.url);

  if (!existsSync(RUTA_HISTORICO) || !existsSync(RUTA_ALINEACIONES)) {
    throw new Error(
      'Faltan datos. Corre primero: node datos/historico.mjs && node datos/lineups.mjs'
    );
  }

  const partidos = JSON.parse(await readFile(RUTA_HISTORICO, 'utf8'));
  const alineaciones = JSON.parse(await readFile(RUTA_ALINEACIONES, 'utf8'));

  console.log('Corriendo backtest sin ajuste de ausencias, y luego CON ajuste (esto tarda más: recalcula estadísticas de jugador por partido)...');
  const { sinAjuste, conAjuste } = await compararConYSinAusencias(partidos, alineaciones);

  if (sinAjuste.length !== conAjuste.length) {
    console.warn(
      `Aviso: cantidad de predicciones distinta (sin ajuste ${sinAjuste.length}, con ajuste ${conAjuste.length}). No debería pasar — el ajuste no filtra partidos, solo cambia lambdas.`
    );
  }

  const mSin = metricas(sinAjuste);
  const mCon = metricas(conAjuste);

  console.log('\nComparación global:');
  console.log(filaTabla('SIN ausencias', mSin));
  console.log(filaTabla('CON ausencias', mCon));

  const porTemporadaSin = new Map();
  const porTemporadaCon = new Map();
  for (const p of sinAjuste) {
    if (!porTemporadaSin.has(p.temporada)) porTemporadaSin.set(p.temporada, []);
    porTemporadaSin.get(p.temporada).push(p);
  }
  for (const p of conAjuste) {
    if (!porTemporadaCon.has(p.temporada)) porTemporadaCon.set(p.temporada, []);
    porTemporadaCon.get(p.temporada).push(p);
  }

  console.log('\nPor temporada:');
  for (const temporada of [...porTemporadaSin.keys()].sort()) {
    const mS = metricas(porTemporadaSin.get(temporada));
    const mC = metricas(porTemporadaCon.get(temporada));
    console.log(`  ${temporada}`);
    console.log(`    ${filaTabla('sin', mS)}`);
    console.log(`    ${filaTabla('con', mC)}`);
  }

  const deltaBrier = mCon.brier - mSin.brier;
  const deltaLogLoss = mCon.logLoss - mSin.logLoss;
  const deltaAcierto = mCon.acierto - mSin.acierto;

  console.log('\nVeredicto sin adornos:');
  console.log(`  Brier:   ${deltaBrier < 0 ? 'MEJORA' : deltaBrier > 0 ? 'EMPEORA' : 'IGUAL'} (${deltaBrier >= 0 ? '+' : ''}${deltaBrier.toFixed(5)})`);
  console.log(`  LogLoss: ${deltaLogLoss < 0 ? 'MEJORA' : deltaLogLoss > 0 ? 'EMPEORA' : 'IGUAL'} (${deltaLogLoss >= 0 ? '+' : ''}${deltaLogLoss.toFixed(5)})`);
  console.log(`  Acierto: ${deltaAcierto > 0 ? 'MEJORA' : deltaAcierto < 0 ? 'EMPEORA' : 'IGUAL'} (${deltaAcierto >= 0 ? '+' : ''}${(deltaAcierto * 100).toFixed(2)} puntos)`);
}

const esEjecutadoDirectamente = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (esEjecutadoDirectamente) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
