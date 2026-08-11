import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brierScore, logLoss, porcentajeAcierto, metricas, probabilidadesImplicitas, metricasMercado } from '../juez/notas.mjs';

// Dos partidos hechos a mano:
//   1) probs 0.5/0.3/0.2, gana el local (favorito, prob puesta = 0.5)
//   2) probs 0.2/0.3/0.5, gana el visitante (favorito, prob puesta = 0.5)
// Suma de error al cuadrado de cada uno: (0.5-1)^2+(0.3-0)^2+(0.2-0)^2 = 0.25+0.09+0.04 = 0.38
// Brier normalizado por 3 clases: 0.38 / 3 = 0.126666...
// Log loss de cada uno: -ln(0.5) = ln(2)
const PREDICCIONES = [
  { probLocal: 0.5, probEmpate: 0.3, probVisitante: 0.2, resultadoReal: 'local', temporada: '2099-00' },
  { probLocal: 0.2, probEmpate: 0.3, probVisitante: 0.5, resultadoReal: 'visitante', temporada: '2099-00' },
];

test('brierScore da 0.38/3 a mano', () => {
  assert.ok(Math.abs(brierScore(PREDICCIONES) - 0.38 / 3) < 1e-12);
});

test('logLoss da ln(2) a mano', () => {
  assert.ok(Math.abs(logLoss(PREDICCIONES) - Math.log(2)) < 1e-12);
});

test('porcentajeAcierto da 100% (el favorito acertó las dos veces)', () => {
  assert.equal(porcentajeAcierto(PREDICCIONES), 1);
});

test('predicción perfecta da brier=0, logLoss=0, acierto=100%', () => {
  const perfectas = [
    { probLocal: 1, probEmpate: 0, probVisitante: 0, resultadoReal: 'local' },
    { probLocal: 0, probEmpate: 0, probVisitante: 1, resultadoReal: 'visitante' },
  ];
  const m = metricas(perfectas);
  assert.equal(m.brier, 0);
  assert.equal(m.logLoss, 0);
  assert.equal(m.acierto, 1);
});

test('predicción totalmente errada (confianza 1 en la clase equivocada) da brier=2/3', () => {
  const errada = [{ probLocal: 1, probEmpate: 0, probVisitante: 0, resultadoReal: 'visitante' }];
  assert.ok(Math.abs(brierScore(errada) - 2 / 3) < 1e-12);
});

test('probabilidadesImplicitas normaliza y quita el margen de la casa', () => {
  // cuotas 2.0 / 3.5 / 4.0 -> brutas 0.5 / 0.2857.. / 0.25, suman 1.0357 (margen 3.57%)
  // cuota más baja = probabilidad más alta: local > empate > visitante
  const p = probabilidadesImplicitas(2.0, 3.5, 4.0);
  assert.ok(Math.abs(p.local + p.empate + p.visitante - 1) < 1e-9);
  assert.ok(p.local > p.empate && p.empate > p.visitante);
});

test('metricasMercado da null cuando ninguna predicción trae cuotas (Fase 1, sin cuotas todavía)', () => {
  assert.equal(metricasMercado(PREDICCIONES), null);
});

test('metricasMercado calcula igual que metricas() cuando sí hay cuotas', () => {
  const conMercado = [
    { ...PREDICCIONES[0], mercadoProbLocal: 0.5, mercadoProbEmpate: 0.3, mercadoProbVisitante: 0.2 },
    { ...PREDICCIONES[1], mercadoProbLocal: 0.2, mercadoProbEmpate: 0.3, mercadoProbVisitante: 0.5 },
  ];
  const m = metricasMercado(conMercado);
  assert.ok(Math.abs(m.brier - 0.38 / 3) < 1e-12);
});
