import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mensajeMañana, mensajeAlineacion, mensajeNoche, logError } from '../salida/discord.mjs';

// Dos partidos reales del backtest (juez/resultados.json, 2021-09-25,
// jornada 7 de la 2021-22) — uno donde el favorito acertó y otro donde no.
const ACIERTO_REAL = {
  fecha: '2021-09-25',
  local: 'Sevilla',
  visitante: 'Espanol',
  probLocal: 0.5905171751254094,
  probEmpate: 0.24365304493964657,
  probVisitante: 0.16582977993494472,
  resultadoReal: 'local',
};

const FALLO_REAL = {
  fecha: '2021-09-25',
  local: 'Real Madrid',
  visitante: 'Villarreal',
  probLocal: 0.6234973970697298,
  probEmpate: 0.2042308516647481,
  probVisitante: 0.1722717512655212,
  resultadoReal: 'empate', // el favorito era "local" (62.3%), no acertó
};

test('mensajeMañana lista los partidos con sus tres probabilidades y el contador', () => {
  const historial = { n: 10, aciertos: 5, acierto: 0.5 };
  const msg = mensajeMañana([ACIERTO_REAL], historial);
  assert.ok(msg.content.includes('Sevilla vs Espanol'));
  assert.ok(msg.content.includes('Local 59.1%'));
  assert.ok(msg.content.includes('Empate 24.4%'));
  assert.ok(msg.content.includes('Visitante 16.6%'));
  assert.ok(msg.content.includes('favorito: local'));
  assert.ok(msg.content.includes('Acierto acumulado: 5/10 (50.0%)'));
});

test('mensajeMañana sin historial no rompe, avisa que no hay historial', () => {
  const msg = mensajeMañana([ACIERTO_REAL], { n: 0 });
  assert.ok(msg.content.includes('sin historial todavía'));
});

test('mensajeAlineacion: cambio por debajo del umbral no avisa', () => {
  const antes = { local: 0.5, empate: 0.3, visitante: 0.2 };
  const despues = { local: 0.52, empate: 0.29, visitante: 0.19 }; // max diff = 0.02, bajo el umbral de 0.03
  assert.equal(mensajeAlineacion({ local: 'A', visitante: 'B' }, antes, despues), null);
});

test('mensajeAlineacion: cambio de más de 3 puntos sí avisa, con antes y después', () => {
  const antes = { local: 0.5, empate: 0.3, visitante: 0.2 };
  const despues = { local: 0.55, empate: 0.27, visitante: 0.18 }; // max diff = 0.05
  const msg = mensajeAlineacion({ local: 'A', visitante: 'B' }, antes, despues);
  assert.ok(msg !== null);
  assert.ok(msg.content.includes('A vs B'));
  assert.ok(msg.content.includes('Antes:'));
  assert.ok(msg.content.includes('Local 50.0%'));
  assert.ok(msg.content.includes('Después:'));
  assert.ok(msg.content.includes('Local 55.0%'));
});

test('mensajeNoche marca acierto y fallo real con el mismo formato (fallos igual de visibles)', () => {
  const historial = { n: 20, aciertos: 11, acierto: 0.55 };
  const msg = mensajeNoche([ACIERTO_REAL, FALLO_REAL], historial);

  assert.ok(msg.content.includes('✅ Sevilla vs Espanol — terminó local, predicho local (59.1%)'));
  assert.ok(msg.content.includes('❌ Real Madrid vs Villarreal — terminó empate, predicho local (62.3%)'));
  assert.ok(msg.content.includes('Acierto acumulado: 11/20 (55.0%)'));

  // "igual de visibles": misma estructura, ninguna marca queda opcional/vacía
  const lineaAcierto = msg.content.split('\n').find((l) => l.includes('Sevilla'));
  const lineaFallo = msg.content.split('\n').find((l) => l.includes('Real Madrid'));
  assert.equal(lineaAcierto.startsWith('✅ '), true);
  assert.equal(lineaFallo.startsWith('❌ '), true);
});

test('logError formatea flujo, nodo y el mensaje del error', () => {
  const msg = logError('01-partidos', 'HTTP Request', new Error('HTTP 429'));
  assert.ok(msg.content.includes('01-partidos'));
  assert.ok(msg.content.includes('HTTP Request'));
  assert.ok(msg.content.includes('HTTP 429'));
});

test('logError acepta un error que no es instancia de Error', () => {
  const msg = logError('99-errores', 'Set', 'algo se rompió');
  assert.ok(msg.content.includes('algo se rompió'));
});

test('ningún mensaje sugiere apostar, en ningún caso', () => {
  const historial = { n: 5, aciertos: 3, acierto: 0.6 };
  const mensajes = [
    mensajeMañana([ACIERTO_REAL, FALLO_REAL], historial),
    mensajeAlineacion({ local: 'A', visitante: 'B' }, { local: 0.5, empate: 0.3, visitante: 0.2 }, { local: 0.6, empate: 0.25, visitante: 0.15 }),
    mensajeNoche([ACIERTO_REAL, FALLO_REAL], historial),
    logError('flujo', 'nodo', new Error('x')),
  ];
  const prohibidas = /apuesta|apostar|bet\b|wager/i;
  for (const m of mensajes) {
    assert.ok(m !== null);
    assert.equal(prohibidas.test(m.content), false, `mensaje sospechoso: ${m.content}`);
  }
});
