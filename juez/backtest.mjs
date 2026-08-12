// Recorre el histórico jornada por jornada y genera una predicción para cada
// partido usando SOLO datos anteriores a esa jornada. Cero fuga temporal
// (regla 6): ni la jornada actual ni ninguna posterior entran al cálculo.
//
// Cero dependencias, matemática pura + orquestación de las otras dos piezas
// del motor (elo.mjs y dixoncoles.mjs).

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fuerzas, lambdas } from '../motor/elo.mjs';
import { probabilidades } from '../motor/dixoncoles.mjs';
import { JORNADAS_DESCARTADAS } from '../config.mjs';

const PARTIDOS_POR_JORNADA = 10; // 20 equipos en LaLiga -> 10 partidos por jornada

// El CSV de football-data.co.uk no trae número de jornada. Se aproxima
// agrupando los partidos de cada temporada, ordenados por fecha, en bloques
// de 10. Es una aproximación: un partido aplazado que se juega semanas
// después puede quedar en el bloque equivocado. Para el propósito de "no ver
// el futuro" esto no importa (el filtro real es por fecha), pero si algún
// día se consigue el número de jornada real de la fuente, se debe reemplazar
// esta función y no la lógica de fuga.
function agregarJornadas(partidos) {
  const porTemporada = new Map();
  for (const p of partidos) {
    if (!porTemporada.has(p.temporada)) porTemporada.set(p.temporada, []);
    porTemporada.get(p.temporada).push(p);
  }
  const conJornada = [];
  for (const lista of porTemporada.values()) {
    lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
    lista.forEach((p, i) => {
      conJornada.push({ ...p, jornada: Math.floor(i / PARTIDOS_POR_JORNADA) + 1 });
    });
  }
  return conJornada;
}

// Fecha de inicio de cada jornada (temporada+jornada -> fecha mínima de sus
// partidos). Se usa como corte en vez de la fecha del propio partido: una
// jornada se juega en varios días (viernes a lunes), y el partido del lunes
// no puede ver los resultados del viernes de SU MISMA jornada.
function inicioDeJornada(conJornada) {
  const inicio = new Map();
  for (const p of conJornada) {
    const clave = `${p.temporada}|${p.jornada}`;
    const actual = inicio.get(clave);
    if (actual === undefined || p.fecha < actual) inicio.set(clave, p.fecha);
  }
  return inicio;
}

function resultadoDe(golesLocal, golesVisitante) {
  if (golesLocal > golesVisitante) return 'local';
  if (golesLocal === golesVisitante) return 'empate';
  return 'visitante';
}

// Genera una predicción por partido, descartando las primeras
// jornadasDescartadas de cada temporada (no hay historial reciente
// suficiente) y cualquier partido donde algún equipo no tenga fuerzas
// calculables todavía (recién ascendido, sin partidos previos).
export function backtest(partidos, opciones = {}) {
  const { jornadasDescartadas = JORNADAS_DESCARTADAS, semividaJornadas, rho, pesoPrior, ajustarLambdas } = opciones;

  const conJornada = agregarJornadas(partidos);
  const inicio = inicioDeJornada(conJornada);
  const predicciones = [];

  for (const partido of conJornada) {
    if (partido.jornada <= jornadasDescartadas) continue;

    const fechaCorte = inicio.get(`${partido.temporada}|${partido.jornada}`);
    const { porEquipo, promedioLigaCasa, promedioLigaFuera } = fuerzas(
      partidos,
      fechaCorte,
      semividaJornadas,
      pesoPrior
    );

    const fLocal = porEquipo.get(partido.local);
    const fVisitante = porEquipo.get(partido.visitante);
    if (!fLocal || !fVisitante) continue;

    const valores = [fLocal.ataqueCasa, fLocal.defensaCasa, fVisitante.ataqueFuera, fVisitante.defensaFuera];
    if (valores.some((v) => !Number.isFinite(v))) continue;

    let { lh, la } = lambdas(fLocal, fVisitante, promedioLigaCasa, promedioLigaFuera);
    if (ajustarLambdas) {
      ({ lh, la } = ajustarLambdas({ lh, la, partido, fechaCorte }));
    }
    const probs = rho === undefined ? probabilidades(lh, la) : probabilidades(lh, la, rho);

    predicciones.push({
      fecha: partido.fecha,
      temporada: partido.temporada,
      jornada: partido.jornada,
      local: partido.local,
      visitante: partido.visitante,
      golesLocal: partido.golesLocal,
      golesVisitante: partido.golesVisitante,
      lh,
      la,
      probLocal: probs.local,
      probEmpate: probs.empate,
      probVisitante: probs.visitante,
      resultadoReal: resultadoDe(partido.golesLocal, partido.golesVisitante),
    });
  }

  return predicciones;
}

async function main() {
  const RUTA_HISTORICO = new URL('../datos/cache/laliga.json', import.meta.url);
  const RUTA_SALIDA = new URL('./resultados.json', import.meta.url);

  const partidos = JSON.parse(await readFile(RUTA_HISTORICO, 'utf8'));
  const predicciones = backtest(partidos);

  await writeFile(RUTA_SALIDA, JSON.stringify(predicciones, null, 2), 'utf8');

  const porTemporada = new Map();
  for (const p of predicciones) {
    porTemporada.set(p.temporada, (porTemporada.get(p.temporada) ?? 0) + 1);
  }

  console.log(`Predicciones generadas: ${predicciones.length} de ${partidos.length} partidos totales`);
  for (const [temporada, cantidad] of porTemporada) {
    console.log(`  ${temporada}: ${cantidad} predicciones`);
  }
  console.log(`Guardado en: ${fileURLToPath(RUTA_SALIDA)}`);
}

const esEjecutadoDirectamente = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (esEjecutadoDirectamente) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
