// Formato de mensajes para Discord (Fase 4). Estas funciones SOLO devuelven
// el payload a enviar (objeto { content }) — no hacen fetch ni conocen la
// URL del webhook. Conectarlas a un webhook real espera a que Fase 3 (en
// vivo) esté resuelta; hasta entonces se prueban contra datos reales del
// backtest (juez/resultados.json), no contra datos inventados.
//
// Reglas del proyecto que aplican acá:
//   - Ningún mensaje sugiere apostar.
//   - Los fallos se muestran igual de visibles que los aciertos (mismo
//     formato, mismo tamaño de marca — no se esconde ni se atenúa el fallo).
//   - El contador de acierto acumulado va en los tres mensajes de partido.

import { UMBRAL_CAMBIO_ALINEACION } from '../config.mjs';

function porcentaje(p) {
  return `${(p * 100).toFixed(1)}%`;
}

function nombrePartido(p) {
  return `${p.local} vs ${p.visitante}`;
}

function favorito(p) {
  if (p.probLocal >= p.probEmpate && p.probLocal >= p.probVisitante) return 'local';
  if (p.probVisitante >= p.probEmpate && p.probVisitante >= p.probLocal) return 'visitante';
  return 'empate';
}

function probabilidadDe(p, resultado) {
  return resultado === 'local' ? p.probLocal : resultado === 'empate' ? p.probEmpate : p.probVisitante;
}

function lineaContador(historial) {
  if (!historial || historial.n === 0) return 'Acierto acumulado: sin historial todavía.';
  return `Acierto acumulado: ${historial.aciertos}/${historial.n} (${porcentaje(historial.acierto)})`;
}

// partidos: [{ fecha, local, visitante, probLocal, probEmpate, probVisitante }]
// historial: { n, aciertos, acierto } — del acumulado hasta ayer.
export function mensajeMañana(partidos, historial) {
  const lineas = partidos.map((p) => {
    const f = favorito(p);
    return `• ${nombrePartido(p)} — Local ${porcentaje(p.probLocal)} / Empate ${porcentaje(p.probEmpate)} / Visitante ${porcentaje(p.probVisitante)} (favorito: ${f})`;
  });
  return {
    content: ['**Partidos de hoy**', ...lineas, '', lineaContador(historial)].join('\n'),
  };
}

// antes/despues: { local, empate, visitante } (fracciones 0-1). Devuelve
// null si el cambio no pasa el umbral — no hay nada que avisar.
export function mensajeAlineacion(partido, antes, despues) {
  const cambioMaximo = Math.max(
    Math.abs(despues.local - antes.local),
    Math.abs(despues.empate - antes.empate),
    Math.abs(despues.visitante - antes.visitante)
  );
  if (cambioMaximo <= UMBRAL_CAMBIO_ALINEACION) return null;

  return {
    content: [
      `**Cambio de alineación: ${nombrePartido(partido)}**`,
      `Antes:    Local ${porcentaje(antes.local)} / Empate ${porcentaje(antes.empate)} / Visitante ${porcentaje(antes.visitante)}`,
      `Después:  Local ${porcentaje(despues.local)} / Empate ${porcentaje(despues.empate)} / Visitante ${porcentaje(despues.visitante)}`,
    ].join('\n'),
  };
}

// resultados: predicciones ya jugadas — [{ fecha, local, visitante, probLocal,
// probEmpate, probVisitante, resultadoReal }] (mismo shape que
// juez/resultados.json). historial: acumulado hasta ANTES de hoy.
export function mensajeNoche(resultados, historial) {
  const lineas = resultados.map((r) => {
    const f = favorito(r);
    const acerto = f === r.resultadoReal;
    const marca = acerto ? '✅' : '❌';
    return `${marca} ${nombrePartido(r)} — terminó ${r.resultadoReal}, predicho ${f} (${porcentaje(probabilidadDe(r, f))})`;
  });
  return {
    content: ['**Resultados de hoy**', ...lineas, '', lineaContador(historial)].join('\n'),
  };
}

// Para el flujo n8n 99-errores. flujo/nodo son nombres, error puede ser un
// Error o cualquier cosa con .message.
export function logError(flujo, nodo, error) {
  return {
    content: [
      `**Error — flujo "${flujo}", nodo "${nodo}"**`,
      '```',
      String(error?.message ?? error),
      '```',
    ].join('\n'),
  };
}
