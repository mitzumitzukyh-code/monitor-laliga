import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const RUTA_ALINEACIONES = new URL('../datos/cache/alineaciones.json', import.meta.url);
const RUTA_HISTORICO = new URL('../datos/cache/laliga.json', import.meta.url);

if (!existsSync(RUTA_ALINEACIONES)) {
  throw new Error('No existe datos/cache/alineaciones.json. Corre primero: node datos/lineups.mjs');
}

const filas = JSON.parse(await readFile(RUTA_ALINEACIONES, 'utf8'));
const historico = JSON.parse(await readFile(RUTA_HISTORICO, 'utf8'));

test('hay filas cargadas', () => {
  assert.ok(filas.length > 0);
});

test('no hay jugador duplicado dentro del mismo partido', () => {
  const vistos = new Set();
  for (const f of filas) {
    const clave = `${f.fecha}|${f.local}|${f.visitante}|${f.jugadorId}`;
    assert.equal(vistos.has(clave), false, `duplicado: ${clave}`);
    vistos.add(clave);
  }
});

test('minutos jugados están en un rango razonable (0 a 130)', () => {
  for (const f of filas) {
    assert.ok(Number.isFinite(f.minutos), `minutos no numérico en ${f.fecha} ${f.jugador}`);
    assert.ok(f.minutos >= 0 && f.minutos <= 130, `minutos=${f.minutos} fuera de rango en ${f.fecha} ${f.jugador}`);
  }
});

test('goles y asistencias no son negativos', () => {
  for (const f of filas) {
    assert.ok(f.goles >= 0, `goles negativos en ${f.fecha} ${f.jugador}`);
    assert.ok(f.asistencias >= 0, `asistencias negativas en ${f.fecha} ${f.jugador}`);
  }
});

test('equipo y esLocal son consistentes: equipo=local cuando esLocal, equipo=visitante si no', () => {
  for (const f of filas) {
    if (f.esLocal) {
      assert.equal(f.equipo, f.local, `fila dice esLocal pero equipo="${f.equipo}" != local="${f.local}"`);
    } else {
      assert.equal(f.equipo, f.visitante, `fila dice visitante pero equipo="${f.equipo}" != visitante="${f.visitante}"`);
    }
  }
});

test('cada partido tiene jugadores de ambos equipos (local y visitante), no solo uno', () => {
  const equiposPorPartido = new Map();
  for (const f of filas) {
    const clave = `${f.fecha}|${f.local}|${f.visitante}`;
    if (!equiposPorPartido.has(clave)) equiposPorPartido.set(clave, new Set());
    equiposPorPartido.get(clave).add(f.equipo);
  }
  let incompletos = 0;
  for (const equipos of equiposPorPartido.values()) {
    if (equipos.size < 2) incompletos++;
  }
  assert.equal(incompletos, 0, `${incompletos} partidos con jugadores de un solo equipo`);
});

test('todo partido de alineaciones existe también en el histórico de resultados', () => {
  const clavesHistorico = new Set(historico.map((p) => `${p.temporada}|${p.local}|${p.visitante}`));
  const partidosAlineaciones = new Set(filas.map((f) => `${f.temporada}|${f.local}|${f.visitante}`));
  for (const clave of partidosAlineaciones) {
    assert.ok(clavesHistorico.has(clave), `partido de alineaciones sin match en historico: ${clave}`);
  }
});

test('cobertura: al menos 1890 de los 1900 partidos del histórico tienen alineación (permite huecos puntuales de la fuente)', () => {
  const partidosAlineaciones = new Set(filas.map((f) => `${f.temporada}|${f.local}|${f.visitante}`));
  assert.ok(
    partidosAlineaciones.size >= 1890,
    `solo ${partidosAlineaciones.size} partidos con alineación de 1900 esperados`
  );
});

test('cada equipo titular tiene entre 9 y 13 titulares por partido (formaciones válidas, con margen por datos sueltos)', () => {
  const titularesPorPartidoEquipo = new Map();
  for (const f of filas) {
    if (!f.esTitular) continue;
    const clave = `${f.fecha}|${f.local}|${f.visitante}|${f.equipo}`;
    titularesPorPartidoEquipo.set(clave, (titularesPorPartidoEquipo.get(clave) ?? 0) + 1);
  }
  let fueraDeRango = 0;
  for (const cantidad of titularesPorPartidoEquipo.values()) {
    if (cantidad < 9 || cantidad > 13) fueraDeRango++;
  }
  // tolerancia: algunos partidos puntuales pueden tener datos incompletos en la fuente
  assert.ok(
    fueraDeRango / titularesPorPartidoEquipo.size < 0.02,
    `${fueraDeRango} de ${titularesPorPartidoEquipo.size} equipos-partido con conteo de titulares raro`
  );
});
