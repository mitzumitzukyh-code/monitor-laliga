// Le pone nota al motor contra los resultados reales: Brier score multiclase,
// log loss y porcentaje de acierto del resultado más probable. Mismo cálculo
// preparado para las cuotas de mercado en cuanto existan (Fase 3).
//
// Cero dependencias, matemática pura.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const EPS = 1e-15;

function resultadoComoVector(resultadoReal) {
  return {
    local: resultadoReal === 'local' ? 1 : 0,
    empate: resultadoReal === 'empate' ? 1 : 0,
    visitante: resultadoReal === 'visitante' ? 1 : 0,
  };
}

function favorito(p) {
  if (p.probLocal >= p.probEmpate && p.probLocal >= p.probVisitante) return 'local';
  if (p.probVisitante >= p.probEmpate && p.probVisitante >= p.probLocal) return 'visitante';
  return 'empate';
}

// Brier score multiclase (Brier, 1950), normalizado por número de clases (3)
// para que quede acotado [0, 1] igual que el caso binario: promedio, sobre
// los partidos, del promedio de error al cuadrado sobre las tres clases.
// 0 = predicción perfecta, 1 = la peor posible.
export function brierScore(predicciones) {
  const K = 3;
  let suma = 0;
  for (const p of predicciones) {
    const o = resultadoComoVector(p.resultadoReal);
    suma += (p.probLocal - o.local) ** 2 + (p.probEmpate - o.empate) ** 2 + (p.probVisitante - o.visitante) ** 2;
  }
  return suma / (predicciones.length * K);
}

// Log loss (entropía cruzada) multiclase: promedio de -ln(probabilidad
// puesta en el resultado que sí ocurrió). Penaliza mucho más fuerte que el
// Brier score los fallos con mucha confianza.
export function logLoss(predicciones) {
  let suma = 0;
  for (const p of predicciones) {
    const probReal =
      p.resultadoReal === 'local' ? p.probLocal : p.resultadoReal === 'empate' ? p.probEmpate : p.probVisitante;
    suma += -Math.log(Math.max(probReal, EPS));
  }
  return suma / predicciones.length;
}

// Porcentaje de veces que el resultado con mayor probabilidad fue el que
// realmente pasó.
export function porcentajeAcierto(predicciones) {
  let aciertos = 0;
  for (const p of predicciones) {
    if (favorito(p) === p.resultadoReal) aciertos++;
  }
  return aciertos / predicciones.length;
}

export function metricas(predicciones) {
  if (predicciones.length === 0) return null;
  return {
    n: predicciones.length,
    brier: brierScore(predicciones),
    logLoss: logLoss(predicciones),
    acierto: porcentajeAcierto(predicciones),
  };
}

// Convierte cuotas decimales (formato europeo, ej. 2.10) en probabilidades
// implícitas normalizadas, quitando el margen de la casa (overround): se
// divide cada 1/cuota por la suma de los tres 1/cuota para que sumen 1.
export function probabilidadesImplicitas(cuotaLocal, cuotaEmpate, cuotaVisitante) {
  const bruto = {
    local: 1 / cuotaLocal,
    empate: 1 / cuotaEmpate,
    visitante: 1 / cuotaVisitante,
  };
  const total = bruto.local + bruto.empate + bruto.visitante;
  return {
    local: bruto.local / total,
    empate: bruto.empate / total,
    visitante: bruto.visitante / total,
  };
}

// Mismas tres métricas pero para el mercado, preparado para cuando existan
// cuotas reales (Fase 3). Cada predicción tendría que traer
// mercadoProbLocal/mercadoProbEmpate/mercadoProbVisitante, calculadas con
// probabilidadesImplicitas() a partir de las cuotas crudas de la API.
// En Fase 1 no hay cuotas: si ninguna predicción las trae, devuelve null.
export function metricasMercado(predicciones) {
  const conMercado = predicciones.filter((p) => p.mercadoProbLocal !== undefined);
  if (conMercado.length === 0) return null;
  const adaptadas = conMercado.map((p) => ({
    probLocal: p.mercadoProbLocal,
    probEmpate: p.mercadoProbEmpate,
    probVisitante: p.mercadoProbVisitante,
    resultadoReal: p.resultadoReal,
  }));
  return metricas(adaptadas);
}

// Tabla comparativa por temporada (y una fila TOTAL), modelo y mercado
// lado a lado (mercado sale null hasta que haya cuotas).
export function tablaPorTemporada(predicciones) {
  const porTemporada = new Map();
  for (const p of predicciones) {
    if (!porTemporada.has(p.temporada)) porTemporada.set(p.temporada, []);
    porTemporada.get(p.temporada).push(p);
  }

  const filas = [];
  for (const temporada of [...porTemporada.keys()].sort()) {
    const lista = porTemporada.get(temporada);
    filas.push({ temporada, modelo: metricas(lista), mercado: metricasMercado(lista) });
  }
  filas.push({ temporada: 'TOTAL', modelo: metricas(predicciones), mercado: metricasMercado(predicciones) });
  return filas;
}

async function main() {
  const RUTA = new URL('./resultados.json', import.meta.url);
  const predicciones = JSON.parse(await readFile(RUTA, 'utf8'));
  const tabla = tablaPorTemporada(predicciones);

  console.log('Temporada   N     Acierto   Brier    LogLoss   Mercado(Brier)');
  console.log('---------------------------------------------------------------');
  for (const fila of tabla) {
    const m = fila.modelo;
    const mercadoBrier = fila.mercado ? fila.mercado.brier.toFixed(4) : '— (sin cuotas)';
    console.log(
      `${fila.temporada.padEnd(11)} ${String(m.n).padEnd(5)} ${(m.acierto * 100).toFixed(1).padStart(6)}%   ${m.brier.toFixed(4)}   ${m.logLoss.toFixed(4)}    ${mercadoBrier}`
    );
  }
}

const esEjecutadoDirectamente = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (esEjecutadoDirectamente) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
