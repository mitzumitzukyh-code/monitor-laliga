// Ajuste por lesionados y banca: pesa cuánto importa cada jugador ausente y
// traduce eso en un impacto sobre los goles esperados (lambda), nunca sobre
// los porcentajes finales (regla 2). Matemática pura, cero dependencias.
//
// "Ausente" acá no distingue la causa (lesión, suspensión, descanso,
// decisión técnica): es cualquier jugador que normalmente es titular fijo
// y hoy no arrancó. Eso es justo lo que dice el nombre de la fase,
// "lesionados y banca" — a efectos de goles esperados, un titular fijo en
// el banco pesa igual que uno en la enfermería.

import {
  SEMIVIDA_JORNADAS_JUGADOR,
  UMBRAL_MINUTOS_REGULAR,
  COEF_GOL_POR_90,
  IMPORTANCIA_BASE_POSICION,
  FACTOR_OFENSIVO_POSICION,
  FACTOR_DEFENSIVO_POSICION,
  TOPE_IMPACTO_OFENSIVO,
  TOPE_IMPACTO_DEFENSIVO,
} from '../config.mjs';

const GRUPO_POR_POSICION = {
  Goalkeeper: 'portero',
  'Centre-Back': 'defensa',
  'Right-Back': 'defensa',
  'Left-Back': 'defensa',
  'Central Midfield': 'medio',
  'Defensive Midfield': 'medio',
  'Attacking Midfield': 'medio',
  'Left Midfield': 'medio',
  'Right Midfield': 'medio',
  'Centre-Forward': 'delantero',
  'Right Winger': 'delantero',
  'Left Winger': 'delantero',
  'Second Striker': 'delantero',
};

export function grupoDePosicion(posicion) {
  return GRUPO_POR_POSICION[posicion] ?? 'medio';
}

// Importancia general de un jugador a partir de cuánto juega, su posición y
// cuánto aporta de gol. jugador = { cuotaMinutos, posicion, golesPor90 }.
export function pesoAusente(jugador) {
  const grupo = grupoDePosicion(jugador.posicion);
  const base = IMPORTANCIA_BASE_POSICION[grupo] ?? IMPORTANCIA_BASE_POSICION.medio;
  const ajusteGol = 1 + jugador.golesPor90 * COEF_GOL_POR_90;
  return jugador.cuotaMinutos * base * ajusteGol;
}

// Cuánto golpea el ataque del equipo la lista de ausentes, topado.
export function impactoOfensivo(ausentes) {
  let suma = 0;
  for (const jugador of ausentes) {
    const grupo = grupoDePosicion(jugador.posicion);
    const factor = FACTOR_OFENSIVO_POSICION[grupo] ?? FACTOR_OFENSIVO_POSICION.medio;
    suma += pesoAusente(jugador) * factor;
  }
  return Math.min(TOPE_IMPACTO_OFENSIVO, suma);
}

// Cuánto golpea la defensa del equipo la lista de ausentes, topado.
export function impactoDefensivo(ausentes) {
  let suma = 0;
  for (const jugador of ausentes) {
    const grupo = grupoDePosicion(jugador.posicion);
    const factor = FACTOR_DEFENSIVO_POSICION[grupo] ?? FACTOR_DEFENSIVO_POSICION.medio;
    suma += pesoAusente(jugador) * factor;
  }
  return Math.min(TOPE_IMPACTO_DEFENSIVO, suma);
}

// Regla 2: esto modifica los lambdas, nunca los porcentajes finales. La
// matriz de marcadores se reconstruye después con estos lambdas ajustados.
export function aplicarAusencias(lh, la, ausentesLocal, ausentesVisitante) {
  const impactoOfLocal = impactoOfensivo(ausentesLocal);
  const impactoDefLocal = impactoDefensivo(ausentesLocal);
  const impactoOfVisitante = impactoOfensivo(ausentesVisitante);
  const impactoDefVisitante = impactoDefensivo(ausentesVisitante);

  return {
    lh: lh * (1 - impactoOfLocal) * (1 + impactoDefVisitante),
    la: la * (1 - impactoOfVisitante) * (1 + impactoDefLocal),
  };
}

function pesoDecaimiento(indiceDesdeElMasReciente, semividaJornadas) {
  return 0.5 ** (indiceDesdeElMasReciente / semividaJornadas);
}

// Cuota de minutos y goles por 90 de cada jugador de un equipo, usando SOLO
// partidos con fecha < fechaCorte (regla 6, cero fuga temporal), con
// decaimiento exponencial por antigüedad (partidos del propio jugador, no
// del equipo — un jugador puede estar lesionado varias jornadas seguidas).
export function estadisticasJugadores(alineaciones, equipo, fechaCorte, semividaJornadas = SEMIVIDA_JORNADAS_JUGADOR) {
  const anteriores = alineaciones
    .filter((f) => f.equipo === equipo && f.fecha < fechaCorte)
    .slice()
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  const contador = new Map(); // jugadorId -> cuántos partidos suyos ya se vieron
  const acumulado = new Map(); // jugadorId -> { nombre, posicion, sumaPesoMinutos, sumaPeso, sumaPesoGoles }

  for (const f of anteriores) {
    const indice = contador.get(f.jugadorId) ?? 0;
    const peso = pesoDecaimiento(indice, semividaJornadas);
    contador.set(f.jugadorId, indice + 1);

    if (!acumulado.has(f.jugadorId)) {
      acumulado.set(f.jugadorId, {
        nombre: f.jugador,
        posicion: f.posicion,
        sumaPesoMinutos: 0,
        sumaPeso: 0,
        sumaPesoGoles: 0,
      });
    }
    const r = acumulado.get(f.jugadorId);
    r.sumaPesoMinutos += peso * f.minutos;
    r.sumaPeso += peso;
    r.sumaPesoGoles += peso * f.goles;
    if (indice === 0) r.posicion = f.posicion; // la posición más reciente manda
  }

  const resultado = new Map();
  for (const [jugadorId, r] of acumulado) {
    const minutosPromedio = r.sumaPeso > 0 ? r.sumaPesoMinutos / r.sumaPeso : 0;
    resultado.set(jugadorId, {
      nombre: r.nombre,
      posicion: r.posicion,
      cuotaMinutos: Math.min(1, minutosPromedio / 90),
      golesPor90: r.sumaPesoMinutos > 0 ? (r.sumaPesoGoles / r.sumaPesoMinutos) * 90 : 0,
    });
  }
  return resultado;
}

// Jugadores "regulares" (cuotaMinutos >= umbralRegular según estadisticas,
// ya calculadas SOLO con datos anteriores a fechaCorte) que no arrancaron
// hoy. No mira nada del partido salvo el 11 titular real, que se conoce
// antes del pitazo inicial igual que en producción (T-40min con
// api-sports en Fase 3) — no es fuga, es información disponible pre-partido.
export function detectarAusentes(alineaciones, equipo, fecha, estadisticas, umbralRegular = UMBRAL_MINUTOS_REGULAR) {
  const filasHoy = alineaciones.filter((f) => f.equipo === equipo && f.fecha === fecha);
  if (filasHoy.length === 0) {
    // Sin datos de convocatoria para este partido puntual (hueco de la
    // fuente, ver auditoría de datos/lineups.mjs): más vale no ajustar nada
    // que asumir que toda la plantilla regular está ausente.
    return [];
  }
  const titularesHoy = new Set(filasHoy.filter((f) => f.esTitular).map((f) => f.jugadorId));
  const ausentes = [];
  for (const [jugadorId, stats] of estadisticas) {
    if (stats.cuotaMinutos < umbralRegular) continue;
    if (titularesHoy.has(jugadorId)) continue;
    ausentes.push(stats);
  }
  return ausentes;
}
