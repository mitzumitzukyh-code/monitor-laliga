import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { compararConYSinAusencias } from '../juez/comparar.mjs';

const RUTA_HISTORICO = new URL('../datos/cache/laliga.json', import.meta.url);

if (!existsSync(RUTA_HISTORICO)) {
  throw new Error('No existe datos/cache/laliga.json. Corre primero: node datos/historico.mjs');
}

const partidos = JSON.parse(await readFile(RUTA_HISTORICO, 'utf8'));

test('sin alineaciones (array vacío), CON ausencias da exactamente lo mismo que SIN ausencias', async () => {
  const { sinAjuste, conAjuste } = await compararConYSinAusencias(partidos, []);
  assert.equal(sinAjuste.length, conAjuste.length);
  for (let i = 0; i < sinAjuste.length; i++) {
    assert.equal(sinAjuste[i].lh, conAjuste[i].lh, `lh distinto en fila ${i}`);
    assert.equal(sinAjuste[i].la, conAjuste[i].la, `la distinto en fila ${i}`);
    assert.equal(sinAjuste[i].probLocal, conAjuste[i].probLocal, `probLocal distinto en fila ${i}`);
  }
});

test('el ajuste de ausencias nunca cambia cuántas predicciones salen (solo toca lambdas, no filtra partidos)', async () => {
  const alineaciones = JSON.parse(await readFile(new URL('../datos/cache/alineaciones.json', import.meta.url), 'utf8'));
  const { sinAjuste, conAjuste } = await compararConYSinAusencias(partidos, alineaciones);
  assert.equal(sinAjuste.length, conAjuste.length);
});
