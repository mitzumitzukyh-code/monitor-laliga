import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poisson, tau, matrizMarcadores, probabilidades } from '../motor/dixoncoles.mjs';

test('poisson(0, 1) da exactamente e^-1', () => {
  assert.equal(poisson(0, 1), Math.exp(-1));
});

test('las probabilidades siempre suman 1 (tolerancia 1e-9)', () => {
  const casos = [
    [1.35, 1.15, 0],
    [1.35, 1.15, -0.1],
    [0.8, 2.4, -0.15],
    [2.0, 2.0, 0.05],
  ];
  for (const [lh, la, rho] of casos) {
    const { local, empate, visitante } = probabilidades(lh, la, rho);
    assert.ok(Math.abs(local + empate + visitante - 1) < 1e-9, `lh=${lh} la=${la} rho=${rho}`);
  }
});

test('con lh == la y rho == 0, local y visitante son idénticos', () => {
  const { local, visitante } = probabilidades(1.4, 1.4, 0);
  assert.ok(Math.abs(local - visitante) < 1e-12);
});

test('con lambdas 1.35 y 1.15 (rho=0), sale aprox 41/27/32', () => {
  const { local, empate, visitante } = probabilidades(1.35, 1.15, 0);
  assert.ok(Math.abs(local * 100 - 41) < 1, `local=${local * 100}`);
  assert.ok(Math.abs(empate * 100 - 27) < 1, `empate=${empate * 100}`);
  assert.ok(Math.abs(visitante * 100 - 32) < 1, `visitante=${visitante * 100}`);
});

test('tau: rho=0 no corrige nada, siempre da 1', () => {
  for (const [x, y] of [[0, 0], [0, 1], [1, 0], [1, 1], [2, 2]]) {
    assert.equal(tau(x, y, 1.3, 1.1, 0), 1);
  }
});

test('tau: corrige exactamente los cuatro marcadores bajos, nada más', () => {
  const rho = -0.1;
  const lh = 1.3;
  const la = 1.1;
  assert.equal(tau(0, 0, lh, la, rho), 1 - lh * la * rho);
  assert.equal(tau(0, 1, lh, la, rho), 1 + lh * rho);
  assert.equal(tau(1, 0, lh, la, rho), 1 + la * rho);
  assert.equal(tau(1, 1, lh, la, rho), 1 - rho);
  assert.equal(tau(2, 0, lh, la, rho), 1);
  assert.equal(tau(0, 2, lh, la, rho), 1);
});

test('matrizMarcadores devuelve una matriz cuadrada que suma 1', () => {
  const maxGoles = 10;
  const matriz = matrizMarcadores(1.3, 1.1, maxGoles, -0.1);
  assert.equal(matriz.length, maxGoles + 1);
  assert.equal(matriz[0].length, maxGoles + 1);
  let total = 0;
  for (const fila of matriz) for (const p of fila) total += p;
  assert.ok(Math.abs(total - 1) < 1e-9);
});
