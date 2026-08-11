// Fuerzas de ataque y defensa por equipo, separadas casa/fuera, con
// decaimiento exponencial por antigüedad. Matemática pura, cero dependencias.
//
// Convención (Maher 1982 / Dixon-Coles 1997):
//   lambda_local     = ataqueCasa[local] * defensaFuera[visitante] * promedioLigaCasa
//   lambda_visitante = ataqueFuera[visitante] * defensaCasa[local] * promedioLigaFuera
//
// "defensaCasa[equipo]" mide cuánto concede el equipo jugando en casa,
// normalizado contra lo que anotaría un visitante promedio (promedioLigaFuera).
// "defensaFuera[equipo]" es lo simétrico jugando de visitante.

import { SEMIVIDA_JORNADAS } from '../config.mjs';

function pesoDecaimiento(indiceDesdeElMasReciente, semividaJornadas) {
  // indice 0 = partido más reciente del equipo -> peso 1
  return 0.5 ** (indiceDesdeElMasReciente / semividaJornadas);
}

// Regla 6 (cero fuga temporal): solo entran partidos con fecha < fechaCorte,
// estrictamente anterior. Nunca el mismo día ni después.
function partidosAnteriores(partidos, fechaCorte) {
  return partidos
    .filter((p) => p.fecha < fechaCorte)
    .slice()
    .sort((a, b) => b.fecha.localeCompare(a.fecha)); // más reciente primero
}

// Recorre el historial ordenado (más reciente primero) y arma, por equipo,
// la lista de sus partidos con el "índice de jornada" (0 = el más reciente
// de ESE equipo, sin importar si jugó de local o visitante) y el peso que le
// corresponde según la vida media configurada.
function historialPorEquipo(anteriores, semividaJornadas) {
  const contador = new Map(); // equipo -> cuántos partidos suyos ya se vieron
  const porEquipo = new Map(); // equipo -> [{ esCasa, golesFavor, golesContra, peso }]

  for (const p of anteriores) {
    for (const [equipo, esCasa, golesFavor, golesContra] of [
      [p.local, true, p.golesLocal, p.golesVisitante],
      [p.visitante, false, p.golesVisitante, p.golesLocal],
    ]) {
      const indice = contador.get(equipo) ?? 0;
      const peso = pesoDecaimiento(indice, semividaJornadas);
      if (!porEquipo.has(equipo)) porEquipo.set(equipo, []);
      porEquipo.get(equipo).push({ esCasa, golesFavor, golesContra, peso });
      contador.set(equipo, indice + 1);
    }
  }
  return porEquipo;
}

function promedioPonderado(registros, filtro, campo) {
  let numerador = 0;
  let denominador = 0;
  for (const r of registros) {
    if (!filtro(r)) continue;
    numerador += r.peso * r[campo];
    denominador += r.peso;
  }
  return denominador > 0 ? numerador / denominador : NaN;
}

// Calcula las fuerzas de ataque/defensa de todos los equipos usando SOLO
// partidos anteriores a fechaCorte, con decaimiento exponencial por vida
// media en jornadas del propio equipo.
export function fuerzas(partidos, fechaCorte, semividaJornadas = SEMIVIDA_JORNADAS) {
  const anteriores = partidosAnteriores(partidos, fechaCorte);

  let sumaGolesCasa = 0;
  let sumaGolesFuera = 0;
  for (const p of anteriores) {
    sumaGolesCasa += p.golesLocal;
    sumaGolesFuera += p.golesVisitante;
  }
  const promedioLigaCasa = anteriores.length > 0 ? sumaGolesCasa / anteriores.length : NaN;
  const promedioLigaFuera = anteriores.length > 0 ? sumaGolesFuera / anteriores.length : NaN;

  const historial = historialPorEquipo(anteriores, semividaJornadas);
  const porEquipo = new Map();

  for (const [equipo, registros] of historial) {
    const esCasa = (r) => r.esCasa;
    const esFuera = (r) => !r.esCasa;
    porEquipo.set(equipo, {
      ataqueCasa: promedioPonderado(registros, esCasa, 'golesFavor') / promedioLigaCasa,
      defensaCasa: promedioPonderado(registros, esCasa, 'golesContra') / promedioLigaFuera,
      ataqueFuera: promedioPonderado(registros, esFuera, 'golesFavor') / promedioLigaFuera,
      defensaFuera: promedioPonderado(registros, esFuera, 'golesContra') / promedioLigaCasa,
    });
  }

  return { porEquipo, promedioLigaCasa, promedioLigaFuera };
}

// Goles esperados del local y del visitante para un partido puntual, a partir
// de las fuerzas ya calculadas de cada equipo (ver fuerzas()).
export function lambdas(local, visitante, promedioLigaCasa, promedioLigaFuera) {
  return {
    lh: local.ataqueCasa * visitante.defensaFuera * promedioLigaCasa,
    la: visitante.ataqueFuera * local.defensaCasa * promedioLigaFuera,
  };
}
