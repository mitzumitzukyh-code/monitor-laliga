// Toda la agregación del panel, sin una sola línea de HTML. Funciones puras
// sobre las predicciones del backtest: se pueden probar sola con números
// verificables a mano (ver pruebas/panel-datos.test.mjs).
//
// Regla 1: acá se CALCULA todo lo que después se pinta. La plantilla solo
// formatea lo que estas funciones devuelven — ningún número va escrito a
// mano del otro lado.

import { execFileSync } from 'node:child_process';
import { fuerzas } from '../../motor/elo.mjs';
import { matrizMarcadores } from '../../motor/dixoncoles.mjs';
import { metricas, brierScore, logLoss, tablaPorTemporada } from '../../juez/notas.mjs';
import { RHO, MAX_GOLES, SEMIVIDA_JORNADAS, PESO_PRIOR_PARTIDOS, JORNADAS_DESCARTADAS } from '../../config.mjs';

export const RESULTADOS = ['local', 'empate', 'visitante'];

// --- referencias contra las que se mide el motor -------------------------

// Las dos líneas base. Se calculan sobre las MISMAS predicciones, no se
// copian de ningún lado ni se escriben a mano.
export function referencias(preds) {
  // 1) Adivinar sin datos: 1/3 - 1/3 - 1/3 en todos los partidos.
  const ciego = preds.map((p) => ({
    ...p,
    probLocal: 1 / 3,
    probEmpate: 1 / 3,
    probVisitante: 1 / 3,
  }));
  // 2) Apostar siempre al local: acierta cuando el resultado real fue local.
  const locales = preds.filter((p) => p.resultadoReal === 'local').length;
  return {
    ciegoBrier: brierScore(ciego),
    ciegoLogLoss: logLoss(ciego),
    ciegoAcierto: 1 / 3,
    siempreLocal: preds.length > 0 ? locales / preds.length : 0,
  };
}

// --- clasificación: fuerzas de ataque/defensa por equipo -----------------

// Goles esperados de un equipo contra un rival exactamente promedio (uno
// cuyas fuerzas valen 1 en las cuatro casillas). Es la forma honesta de
// reducir cuatro coeficientes a un solo número ordenable: no es un "rating"
// inventado, es lo que el propio motor predeciría en un partido neutral.
export function rendimientoNeutral(f, promedioLigaCasa, promedioLigaFuera) {
  const golesFavorCasa = f.ataqueCasa * promedioLigaCasa;
  const golesContraCasa = f.defensaCasa * promedioLigaFuera;
  const golesFavorFuera = f.ataqueFuera * promedioLigaFuera;
  const golesContraFuera = f.defensaFuera * promedioLigaCasa;
  return {
    golesFavorCasa,
    golesContraCasa,
    golesFavorFuera,
    golesContraFuera,
    // Diferencia media por partido, promediando el escenario de casa y el
    // de fuera. Positivo = mete más de lo que le meten contra un rival medio.
    diferencia: (golesFavorCasa - golesContraCasa + (golesFavorFuera - golesContraFuera)) / 2,
  };
}

function ultimaFecha(preds, temporada) {
  let max = '';
  for (const p of preds) if (p.temporada === temporada && p.fecha > max) max = p.fecha;
  return max;
}

function primeraFecha(preds, temporada) {
  let min = '9999-99-99';
  for (const p of preds) if (p.temporada === temporada && p.fecha < min) min = p.fecha;
  return min === '9999-99-99' ? '' : min;
}

// Un día después de una fecha ISO, para que el corte incluya el partido de
// esa fecha (fuerzas() filtra con `<` estricto, regla 6).
function diaSiguiente(fechaISO) {
  const d = new Date(`${fechaISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Clasificación al cierre de cada temporada. La tendencia compara el mismo
// número contra cómo estaba el equipo al ARRANQUE de esa temporada, así que
// también sale del cálculo y no de una etiqueta puesta a dedo.
export function clasificacionPorTemporada(
  preds,
  { semividaJornadas = SEMIVIDA_JORNADAS, pesoPrior = PESO_PRIOR_PARTIDOS } = {}
) {
  const temporadas = [...new Set(preds.map((p) => p.temporada))].sort();
  const tabla = {};

  for (const temporada of temporadas) {
    const fin = ultimaFecha(preds, temporada);
    const inicio = primeraFecha(preds, temporada);
    if (!fin || !inicio) continue;

    const alCierre = fuerzas(preds, diaSiguiente(fin), semividaJornadas, pesoPrior);
    const alArranque = fuerzas(preds, inicio, semividaJornadas, pesoPrior);

    // Partidos que cada equipo jugó EN esa temporada (no en toda la historia).
    const jugados = new Map();
    for (const p of preds) {
      if (p.temporada !== temporada) continue;
      jugados.set(p.local, (jugados.get(p.local) ?? 0) + 1);
      jugados.set(p.visitante, (jugados.get(p.visitante) ?? 0) + 1);
    }

    const filas = [];
    for (const [equipo, partidas] of jugados) {
      const f = alCierre.porEquipo.get(equipo);
      if (!f) continue;
      const valores = [f.ataqueCasa, f.defensaCasa, f.ataqueFuera, f.defensaFuera];
      if (valores.some((v) => !Number.isFinite(v))) continue;

      const ahora = rendimientoNeutral(f, alCierre.promedioLigaCasa, alCierre.promedioLigaFuera);
      const antesF = alArranque.porEquipo.get(equipo);
      const antes =
        antesF && [antesF.ataqueCasa, antesF.defensaCasa, antesF.ataqueFuera, antesF.defensaFuera].every(Number.isFinite)
          ? rendimientoNeutral(antesF, alArranque.promedioLigaCasa, alArranque.promedioLigaFuera)
          : null;

      filas.push({
        equipo,
        partidas,
        ataqueCasa: f.ataqueCasa,
        defensaCasa: f.defensaCasa,
        ataqueFuera: f.ataqueFuera,
        defensaFuera: f.defensaFuera,
        ...ahora,
        // null cuando el equipo no tenía historial al arrancar la temporada
        // (recién ascendido): no hay contra qué comparar, y decir "0" sería
        // mentir sobre un dato que no existe.
        tendencia: antes ? ahora.diferencia - antes.diferencia : null,
      });
    }

    filas.sort((a, b) => b.diferencia - a.diferencia);
    tabla[temporada] = filas;
  }

  return tabla;
}

// --- ficha de partido ----------------------------------------------------

// Los marcadores más probables de un partido, según la MISMA matriz de
// Dixon-Coles con la que se calcularon las tres probabilidades. No es una
// segunda estimación: es la misma, desagregada.
export function topMarcadores(lh, la, cuantos = 6, rho = RHO, maxGoles = MAX_GOLES) {
  const matriz = matrizMarcadores(lh, la, maxGoles, rho);
  const todos = [];
  for (let x = 0; x < matriz.length; x++) {
    for (let y = 0; y < matriz[x].length; y++) {
      todos.push({ local: x, visitante: y, p: matriz[x][y] });
    }
  }
  todos.sort((a, b) => b.p - a.p);
  return todos.slice(0, cuantos);
}

// Los marcadores que la ficha muestra: los más probables MÁS el que de
// verdad pasó, aunque haya quedado fuera del top. Sin esto, un 5-1 (que casi
// nunca entra en los seis primeros) deja la ficha sin señalar nada, y el pie
// que dice "el punto marca el marcador real" queda mintiendo. Ver el partido
// Villarreal 5-1 Ath Madrid, jornada 38 de 2025-26.
export function marcadoresDePartido(
  lh,
  la,
  golesLocal,
  golesVisitante,
  cuantos = 6,
  rho = RHO,
  maxGoles = MAX_GOLES
) {
  const matriz = matrizMarcadores(lh, la, maxGoles, rho);
  const todos = [];
  for (let x = 0; x < matriz.length; x++) {
    for (let y = 0; y < matriz[x].length; y++) {
      todos.push({ local: x, visitante: y, p: matriz[x][y] });
    }
  }
  todos.sort((a, b) => b.p - a.p);

  const top = todos.slice(0, cuantos);
  const yaEsta = top.some((m) => m.local === golesLocal && m.visitante === golesVisitante);
  if (!yaEsta) {
    const real = todos.find((m) => m.local === golesLocal && m.visitante === golesVisitante);
    // Un marcador por encima de MAX_GOLES no está en la matriz. No se
    // inventa una probabilidad para él: simplemente no se añade.
    if (real) top.push({ ...real, fueraDelTop: true });
  }
  return top;
}

function resultadoDe(golesLocal, golesVisitante) {
  if (golesLocal > golesVisitante) return 'local';
  if (golesLocal === golesVisitante) return 'empate';
  return 'visitante';
}

// Últimos n partidos de un equipo estrictamente ANTES de una fecha.
// Regla 6: nunca se mira hacia adelante, ni siquiera para pintar la forma.
export function formaDe(preds, equipo, fecha, n = 5) {
  return preds
    .filter((p) => p.fecha < fecha && (p.local === equipo || p.visitante === equipo))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, n)
    .map((p) => {
      const esLocal = p.local === equipo;
      const golesFavor = esLocal ? p.golesLocal : p.golesVisitante;
      const golesContra = esLocal ? p.golesVisitante : p.golesLocal;
      return {
        fecha: p.fecha,
        rival: esLocal ? p.visitante : p.local,
        esLocal,
        golesFavor,
        golesContra,
        signo: golesFavor > golesContra ? 'G' : golesFavor === golesContra ? 'E' : 'P',
      };
    });
}

// Historial directo entre dos equipos antes de una fecha, en cualquier orden
// de localía.
export function historialDirecto(preds, local, visitante, fecha, n = 5) {
  return preds
    .filter(
      (p) =>
        p.fecha < fecha &&
        ((p.local === local && p.visitante === visitante) || (p.local === visitante && p.visitante === local))
    )
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, n)
    .map((p) => ({
      fecha: p.fecha,
      temporada: p.temporada,
      local: p.local,
      visitante: p.visitante,
      marcador: `${p.golesLocal}-${p.golesVisitante}`,
      resultado: resultadoDe(p.golesLocal, p.golesVisitante),
    }));
}

// --- carga útil que viaja al navegador -----------------------------------

const r3 = (x) => Number(x.toFixed(3));
const r4 = (x) => Number(x.toFixed(4));

// Formato compacto a propósito: 1.600 partidos como objetos con nombres de
// campo largos son ~1 MB de JSON; como arrays con índices a un diccionario
// de equipos, son la quinta parte. El panel es un archivo suelto que se abre
// con doble click, no vale la pena hacerlo pesado por comodidad de lectura.
export function armarPayload(preds, { marcadoresPorPartido = 6 } = {}) {
  const equipos = [...new Set(preds.flatMap((p) => [p.local, p.visitante]))].sort();
  const temporadas = [...new Set(preds.map((p) => p.temporada))].sort();
  const iEquipo = new Map(equipos.map((e, i) => [e, i]));
  const iTemporada = new Map(temporadas.map((t, i) => [t, i]));

  const ordenados = preds.slice().sort((a, b) => a.fecha.localeCompare(b.fecha));

  const partidos = ordenados.map((p) => [
    iTemporada.get(p.temporada),
    p.jornada,
    p.fecha,
    iEquipo.get(p.local),
    iEquipo.get(p.visitante),
    p.golesLocal,
    p.golesVisitante,
    r3(p.lh),
    r3(p.la),
    r4(p.probLocal),
    r4(p.probEmpate),
    r4(p.probVisitante),
    RESULTADOS.indexOf(p.resultadoReal),
  ]);

  // Alineado por índice con `partidos`: [["2-1", 12.3], ...] con el
  // porcentaje ya en escala 0-100 y una decimal. El último puede ser el
  // marcador real cuando quedó fuera de los más probables.
  const marcadores = ordenados.map((p) =>
    marcadoresDePartido(p.lh, p.la, p.golesLocal, p.golesVisitante, marcadoresPorPartido).map((m) => [
      `${m.local}-${m.visitante}`,
      Number((m.p * 100).toFixed(1)),
    ])
  );

  return { equipos, temporadas, partidos, marcadores };
}

// --- changelog del motor -------------------------------------------------

// El historial de git ES el changelog: no hay una tabla que mantener a mano
// ni un texto que se desactualice. Se filtra a lo que toca el cálculo.
const RUTAS_DEL_MOTOR = ['motor', 'juez', 'datos', 'config.mjs', 'salida'];

function tipoDeCommit(asunto) {
  const s = asunto.toLowerCase();
  if (s.startsWith('revision') || s.startsWith('revisión') || s.includes('corrige') || s.includes('arregla'))
    return 'CORRECCIÓN';
  if (s.startsWith('fase 0') || s.startsWith('fase 1') || s.startsWith('fase 2')) return 'MOTOR';
  if (s.startsWith('fase 3')) return 'DATOS';
  if (s.startsWith('fase 4') || s.startsWith('fase 5')) return 'SALIDA';
  return 'MOTOR';
}

export function cambiosDeGit({ maximo = 40, raiz } = {}) {
  let salida;
  try {
    salida = execFileSync(
      'git',
      ['log', `-${maximo}`, '--date=short', '--pretty=format:%h\x1f%ad\x1f%s', '--', ...RUTAS_DEL_MOTOR],
      { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
  } catch {
    // Sin git (tarball descargado, por ejemplo) el panel se genera igual y
    // la pantalla de Cambios muestra su estado vacío.
    return [];
  }

  return salida
    .split('\n')
    .filter(Boolean)
    .map((linea) => {
      const [hash, fecha, ...resto] = linea.split('\x1f');
      const asunto = resto.join('');
      // "Fase 5: panel web claro" -> titulo "Fase 5", texto "panel web claro"
      const corte = asunto.indexOf(':');
      return {
        hash,
        fecha,
        tipo: tipoDeCommit(asunto),
        titulo: corte > 0 ? asunto.slice(0, corte).trim() : asunto,
        texto: corte > 0 ? asunto.slice(corte + 1).trim() : '',
      };
    });
}

// --- resumen completo ----------------------------------------------------

// Un solo objeto con todo lo que la plantilla necesita. Nada de esto se
// calcula del otro lado.
export function resumen(preds, { raiz } = {}) {
  return {
    global: metricas(preds),
    porTemporada: tablaPorTemporada(preds),
    referencias: referencias(preds),
    clasificacion: clasificacionPorTemporada(preds),
    cambios: cambiosDeGit({ raiz }),
    payload: armarPayload(preds),
    coeficientes: {
      RHO,
      MAX_GOLES,
      SEMIVIDA_JORNADAS,
      PESO_PRIOR_PARTIDOS,
      JORNADAS_DESCARTADAS,
    },
  };
}
