import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { backtest } from '../juez/backtest.mjs';

const RUTA_DATOS = new URL('../datos/cache/laliga.json', import.meta.url);

if (!existsSync(RUTA_DATOS)) {
  throw new Error('No existe datos/cache/laliga.json. Corre primero: node datos/historico.mjs');
}

const partidos = JSON.parse(await readFile(RUTA_DATOS, 'utf8'));

function clave(p) {
  return `${p.fecha}|${p.local}|${p.visitante}`;
}

test('cada temporada descarta exactamente las primeras 6 jornadas (60 partidos)', () => {
  const predicciones = backtest(partidos);
  const porTemporada = new Map();
  for (const p of predicciones) {
    porTemporada.set(p.temporada, (porTemporada.get(p.temporada) ?? 0) + 1);
  }
  for (const [temporada, cantidad] of porTemporada) {
    assert.equal(cantidad, 320, `temporada ${temporada} dio ${cantidad} predicciones, se esperaban 320`);
  }
});

test('todas las predicciones suman 1 en sus tres probabilidades', () => {
  const predicciones = backtest(partidos);
  assert.ok(predicciones.length > 0);
  for (const p of predicciones) {
    const suma = p.probLocal + p.probEmpate + p.probVisitante;
    assert.ok(Math.abs(suma - 1) < 1e-9, `${clave(p)} suma ${suma}`);
  }
});

test('control 4: ninguna probabilidad real del backtest es exactamente 0 o 1 (equipos con muestra chica no deben dar certezas absolutas)', () => {
  const predicciones = backtest(partidos);
  assert.ok(predicciones.length > 0);
  for (const p of predicciones) {
    for (const [nombre, valor] of [['probLocal', p.probLocal], ['probEmpate', p.probEmpate], ['probVisitante', p.probVisitante]]) {
      assert.ok(valor > 0, `${clave(p)} ${nombre}=${valor} (debería ser > 0, no un 0% exacto)`);
      assert.ok(valor < 1, `${clave(p)} ${nombre}=${valor} (debería ser < 1, no un 100% exacto)`);
    }
  }
});

test('anti-fuga: recortar el histórico a la mitad no cambia ni una predicción de la primera mitad', () => {
  const mitad = Math.floor(partidos.length / 2);
  const partidosRecortados = partidos.slice(0, mitad);

  const prediccionesCompletas = backtest(partidos);
  const prediccionesRecortadas = backtest(partidosRecortados);

  assert.ok(prediccionesRecortadas.length > 0, 'el histórico recortado no generó ninguna predicción');

  const porClaveCompleto = new Map(prediccionesCompletas.map((p) => [clave(p), p]));

  let comparadas = 0;
  for (const recortada of prediccionesRecortadas) {
    const completa = porClaveCompleto.get(clave(recortada));
    assert.ok(completa, `predicción de ${clave(recortada)} no aparece en la corrida completa`);
    assert.equal(recortada.lh, completa.lh, `lh distinto en ${clave(recortada)}`);
    assert.equal(recortada.la, completa.la, `la distinto en ${clave(recortada)}`);
    assert.equal(recortada.probLocal, completa.probLocal, `probLocal distinto en ${clave(recortada)}`);
    assert.equal(recortada.probEmpate, completa.probEmpate, `probEmpate distinto en ${clave(recortada)}`);
    assert.equal(recortada.probVisitante, completa.probVisitante, `probVisitante distinto en ${clave(recortada)}`);
    comparadas++;
  }
  assert.equal(comparadas, prediccionesRecortadas.length);
});
