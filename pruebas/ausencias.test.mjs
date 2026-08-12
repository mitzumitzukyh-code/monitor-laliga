import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  grupoDePosicion,
  pesoAusente,
  impactoOfensivo,
  impactoDefensivo,
  aplicarAusencias,
  estadisticasJugadores,
  detectarAusentes,
} from '../motor/ausencias.mjs';

test('grupoDePosicion clasifica correctamente las 13 posiciones reales de la fuente', () => {
  assert.equal(grupoDePosicion('Goalkeeper'), 'portero');
  assert.equal(grupoDePosicion('Centre-Back'), 'defensa');
  assert.equal(grupoDePosicion('Right-Back'), 'defensa');
  assert.equal(grupoDePosicion('Left-Back'), 'defensa');
  assert.equal(grupoDePosicion('Central Midfield'), 'medio');
  assert.equal(grupoDePosicion('Defensive Midfield'), 'medio');
  assert.equal(grupoDePosicion('Attacking Midfield'), 'medio');
  assert.equal(grupoDePosicion('Centre-Forward'), 'delantero');
  assert.equal(grupoDePosicion('Right Winger'), 'delantero');
  assert.equal(grupoDePosicion('Left Winger'), 'delantero');
});

// Config real: IMPORTANCIA_BASE_POSICION.delantero=0.8, COEF_GOL_POR_90=2.0
test('pesoAusente: delantero regular sin goles da cuotaMinutos * 0.8', () => {
  const jugador = { cuotaMinutos: 0.2, posicion: 'Centre-Forward', golesPor90: 0 };
  assert.ok(Math.abs(pesoAusente(jugador) - 0.2 * 0.8) < 1e-12);
});

test('pesoAusente: sube con el aporte de gol por 90', () => {
  const sinGoles = { cuotaMinutos: 0.5, posicion: 'Centre-Forward', golesPor90: 0 };
  const conGoles = { cuotaMinutos: 0.5, posicion: 'Centre-Forward', golesPor90: 0.5 };
  assert.ok(pesoAusente(conGoles) > pesoAusente(sinGoles));
  // ajusteGol = 1 + 0.5*2 = 2 -> peso = 0.5*0.8*2 = 0.8
  assert.ok(Math.abs(pesoAusente(conGoles) - 0.8) < 1e-12);
});

test('impactoOfensivo: delantero pesa full (factor 1.0), sin tocar el tope', () => {
  const jugador = { cuotaMinutos: 0.2, posicion: 'Centre-Forward', golesPor90: 0 };
  // peso = 0.16, factor ofensivo delantero = 1.0 -> 0.16, bajo el tope 0.35
  assert.ok(Math.abs(impactoOfensivo([jugador]) - 0.16) < 1e-12);
});

test('impactoDefensivo: el mismo delantero casi no golpea la defensa (factor 0.1)', () => {
  const jugador = { cuotaMinutos: 0.2, posicion: 'Centre-Forward', golesPor90: 0 };
  // peso = 0.16, factor defensivo delantero = 0.1 -> 0.016
  assert.ok(Math.abs(impactoDefensivo([jugador]) - 0.016) < 1e-12);
});

test('impactoOfensivo respeta el tope aunque la ausencia sea enorme', () => {
  const jugadorImposible = { cuotaMinutos: 1, posicion: 'Centre-Forward', golesPor90: 3 };
  // peso = 1 * 0.8 * (1+3*2) = 5.6, muy por encima del tope 0.35
  assert.equal(impactoOfensivo([jugadorImposible]), 0.35);
});

test('aplicarAusencias modifica lambda, nunca porcentajes (regla 2)', () => {
  const jugador = { cuotaMinutos: 0.2, posicion: 'Centre-Forward', golesPor90: 0 };
  const { lh, la } = aplicarAusencias(1.5, 1.1, [jugador], []);
  // impactoOfLocal=0.16, impactoDefLocal=0.016, impactoOfVisitante=0, impactoDefVisitante=0
  assert.ok(Math.abs(lh - 1.5 * (1 - 0.16)) < 1e-9, `lh=${lh}`);
  assert.ok(Math.abs(la - 1.1 * (1 + 0.016)) < 1e-9, `la=${la}`);
});

test('aplicarAusencias sin ausentes no cambia nada', () => {
  const { lh, la } = aplicarAusencias(1.5, 1.1, [], []);
  assert.equal(lh, 1.5);
  assert.equal(la, 1.1);
});

test('estadisticasJugadores calcula cuotaMinutos y golesPor90 a mano', () => {
  const alineaciones = [
    { equipo: 'X', jugadorId: 'p1', jugador: 'Uno', posicion: 'Centre-Forward', esTitular: true, minutos: 90, goles: 1, fecha: '2024-01-01' },
    { equipo: 'X', jugadorId: 'p1', jugador: 'Uno', posicion: 'Centre-Forward', esTitular: true, minutos: 90, goles: 0, fecha: '2024-01-08' },
    { equipo: 'X', jugadorId: 'p1', jugador: 'Uno', posicion: 'Centre-Forward', esTitular: true, minutos: 45, goles: 0, fecha: '2024-01-15' },
  ];
  // semivida gigante -> el decaimiento es despreciable (peso ~= 1 para los tres)
  const stats = estadisticasJugadores(alineaciones, 'X', '2024-02-01', 1_000_000);
  const p1 = stats.get('p1');
  // cuotaMinutos = (90+90+45)/3/90 = 75/90 = 0.8333...
  assert.ok(Math.abs(p1.cuotaMinutos - 75 / 90) < 1e-5, `cuotaMinutos=${p1.cuotaMinutos}`);
  // golesPor90 = (1+0+0) goles / (90+90+45) minutos * 90 = 90/225 = 0.4
  assert.ok(Math.abs(p1.golesPor90 - 0.4) < 1e-5, `golesPor90=${p1.golesPor90}`);
});

test('estadisticasJugadores nunca usa partidos con fecha >= fechaCorte (cero fuga temporal)', () => {
  const alineaciones = [
    { equipo: 'X', jugadorId: 'p1', jugador: 'Uno', posicion: 'Centre-Forward', esTitular: true, minutos: 10, goles: 0, fecha: '2024-01-01' },
    { equipo: 'X', jugadorId: 'p1', jugador: 'Uno', posicion: 'Centre-Forward', esTitular: true, minutos: 90, goles: 5, fecha: '2024-01-08' }, // "futuro"
  ];
  const stats = estadisticasJugadores(alineaciones, 'X', '2024-01-08', 1_000_000);
  const p1 = stats.get('p1');
  // Si viera el partido del 08, cuotaMinutos subiría muchísimo (90 min, 5 goles).
  assert.ok(Math.abs(p1.cuotaMinutos - 10 / 90) < 1e-5, `cuotaMinutos=${p1.cuotaMinutos} (no debería ver el futuro)`);
  assert.equal(p1.golesPor90, 0);
});

test('detectarAusentes marca a un regular que no arrancó, ignora a un suplente ocasional', () => {
  const alineaciones = [
    // Regular: tres partidos previos de titular
    { equipo: 'X', jugadorId: 'regular', jugador: 'Regular', posicion: 'Centre-Forward', esTitular: true, minutos: 90, goles: 0, fecha: '2024-01-01' },
    { equipo: 'X', jugadorId: 'regular', jugador: 'Regular', posicion: 'Centre-Forward', esTitular: true, minutos: 90, goles: 0, fecha: '2024-01-08' },
    { equipo: 'X', jugadorId: 'regular', jugador: 'Regular', posicion: 'Centre-Forward', esTitular: true, minutos: 90, goles: 0, fecha: '2024-01-15' },
    // Suplente ocasional: pocos minutos
    { equipo: 'X', jugadorId: 'suplente', jugador: 'Suplente', posicion: 'Central Midfield', esTitular: false, minutos: 10, goles: 0, fecha: '2024-01-15' },
    // Partido de hoy: solo aparece otro jugador (ninguno de los dos anteriores)
    { equipo: 'X', jugadorId: 'otro', jugador: 'Otro', posicion: 'Centre-Forward', esTitular: true, minutos: 90, goles: 0, fecha: '2024-01-22' },
  ];
  const fechaCorte = '2024-01-22';
  const stats = estadisticasJugadores(alineaciones, 'X', fechaCorte, 1_000_000);
  const ausentes = detectarAusentes(alineaciones, 'X', fechaCorte, stats);

  const nombres = ausentes.map((a) => a.nombre);
  assert.ok(nombres.includes('Regular'), 'el regular ausente debería aparecer');
  assert.ok(!nombres.includes('Suplente'), 'el suplente ocasional no debería contar como ausencia');
});

test('detectarAusentes no marca a nadie si no hay datos de convocatoria para ese partido (hueco de la fuente)', () => {
  const alineaciones = [
    { equipo: 'X', jugadorId: 'regular', jugador: 'Regular', posicion: 'Centre-Forward', esTitular: true, minutos: 90, goles: 0, fecha: '2024-01-01' },
  ];
  const fechaCorte = '2024-01-08'; // partido sin ninguna fila en alineaciones
  const stats = estadisticasJugadores(alineaciones, 'X', fechaCorte, 1_000_000);
  const ausentes = detectarAusentes(alineaciones, 'X', fechaCorte, stats);
  assert.deepEqual(ausentes, [], 'sin datos de hoy, no se debe asumir que todos están ausentes');
});
