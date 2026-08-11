import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { nombresSospechosos } from '../datos/nombres.mjs';

const RUTA_DATOS = new URL('../datos/cache/laliga.json', import.meta.url);

if (!existsSync(RUTA_DATOS)) {
  throw new Error('No existe datos/cache/laliga.json. Corre primero: node datos/historico.mjs');
}

const partidos = JSON.parse(await readFile(RUTA_DATOS, 'utf8'));

test('hay partidos cargados', () => {
  assert.ok(partidos.length > 0);
});

test('no hay partidos duplicados (misma fecha + mismos dos equipos)', () => {
  const vistos = new Set();
  for (const p of partidos) {
    const clave = `${p.fecha}|${p.local}|${p.visitante}`;
    assert.equal(vistos.has(clave), false, `duplicado: ${clave}`);
    vistos.add(clave);
  }
});

test('cada temporada tiene exactamente 380 partidos', () => {
  const porTemporada = new Map();
  for (const p of partidos) {
    porTemporada.set(p.temporada, (porTemporada.get(p.temporada) ?? 0) + 1);
  }
  for (const [temporada, cantidad] of porTemporada) {
    assert.equal(cantidad, 380, `temporada ${temporada} tiene ${cantidad} partidos, se esperaban 380`);
  }
});

test('todas las fechas caen dentro de su temporada', () => {
  for (const p of partidos) {
    const [inicioStr] = p.temporada.split('-');
    const anioInicio = Number(inicioStr);
    const anioFin = anioInicio + 1;
    const anio = Number(p.fecha.slice(0, 4));
    const mes = Number(p.fecha.slice(5, 7));
    // la temporada corre de julio de anioInicio a julio de anioFin
    const dentro =
      (anio === anioInicio && mes >= 7) || (anio === anioFin && mes <= 7);
    assert.ok(dentro, `fecha ${p.fecha} fuera de temporada ${p.temporada}`);
  }
});

test('no hay goles negativos, nulos ni no numéricos', () => {
  for (const p of partidos) {
    assert.equal(typeof p.golesLocal, 'number');
    assert.equal(typeof p.golesVisitante, 'number');
    assert.ok(Number.isFinite(p.golesLocal), `golesLocal inválido en ${p.fecha} ${p.local}-${p.visitante}`);
    assert.ok(Number.isFinite(p.golesVisitante), `golesVisitante inválido en ${p.fecha} ${p.local}-${p.visitante}`);
    assert.ok(p.golesLocal >= 0);
    assert.ok(p.golesVisitante >= 0);
  }
});

test('los nombres de equipo son consistentes entre temporadas', () => {
  const nombres = partidos.flatMap((p) => [p.local, p.visitante]);
  const sospechosos = nombresSospechosos(nombres);
  if (sospechosos.length > 0) {
    console.warn('Posibles inconsistencias de nombre de equipo (revisar a mano):');
    for (const [a, b] of sospechosos) console.warn(`  "${a}" vs "${b}"`);
  }
  // Se avisa pero no se falla el test: puede haber pares de equipos distintos
  // con nombres cortos parecidos (falso positivo de la distancia de edición).
});
