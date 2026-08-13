// Pruebas de datos/api.mjs con fetch simulado — CERO llamadas reales a
// api-sports ni a Supabase. Si estas pruebas llamaran a la red de verdad,
// cada corrida de `node --test` gastaría presupuesto real (regla 5), lo
// cual sería absurdo para un test que se corre veinte veces al día.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

process.env.SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key';
process.env.API_SPORTS_KEY = 'fake-api-sports-key';

const { pedir, contadorHoy, FRENO_DURO } = await import('../datos/api.mjs');

const fetchOriginal = globalThis.fetch;
// El caché de pedir() escribe en disco de verdad (datos/cache/api/). Para que
// las pruebas no queden "contaminadas" por una corrida anterior, cada clave
// de caché lleva una marca única de esta corrida — así cada `node --test`
// arranca con claves que nunca existieron antes.
const marcaCorrida = `test${Date.now()}`;

function respuestaJSON(obj) {
  return { ok: true, status: 200, json: async () => obj, text: async () => JSON.stringify(obj) };
}

// Fetch falso: distingue Supabase (contador + selects) de api-sports, y
// lleva la cuenta de cuántas veces se llamó a cada uno.
function instalarFetchFalso({ contadorInicial = 0, filasFixturesGuardadas = [] } = {}) {
  let contador = contadorInicial;
  const llamadas = { supabase: 0, apiSports: 0 };

  globalThis.fetch = async (url, opciones = {}) => {
    const urlStr = String(url);

    if (urlStr.startsWith('https://supabase.test')) {
      llamadas.supabase++;
      if (urlStr.includes('/rest/v1/api_usage') && opciones.method === 'POST') {
        const body = JSON.parse(opciones.body);
        contador = body[0].requests_used;
        return respuestaJSON(body);
      }
      if (urlStr.includes('/rest/v1/api_usage')) {
        return respuestaJSON([{ requests_used: contador }]);
      }
      if (urlStr.includes('/rest/v1/fixtures')) {
        return respuestaJSON(filasFixturesGuardadas);
      }
      return respuestaJSON([]);
    }

    llamadas.apiSports++;
    return respuestaJSON({ response: [{ dato: 'fresco' }], errors: [] });
  };

  return llamadas;
}

after(async () => {
  globalThis.fetch = fetchOriginal;
  await rm(new URL('../datos/cache/api/', import.meta.url), { recursive: true, force: true });
});

test('pedir() con tipo cacheable solo llama a api-sports una vez; la segunda vez usa caché', async () => {
  const llamadas = instalarFetchFalso();
  const params = { league: 999, date: '2099-01-01', _run: marcaCorrida };

  const r1 = await pedir('/fixtures', params, { tipo: 'fixtures', ttlHoras: 6 });
  assert.deepEqual(r1, [{ dato: 'fresco' }]);
  assert.equal(llamadas.apiSports, 1);

  const r2 = await pedir('/fixtures', params, { tipo: 'fixtures', ttlHoras: 6 });
  assert.deepEqual(r2, [{ dato: 'fresco' }]);
  assert.equal(llamadas.apiSports, 1, 'la segunda pedida no debería tocar la red, tenía que salir de caché');
});

test('freno duro: si el contador ya llegó a FRENO_DURO, no se llama a api-sports', async () => {
  const llamadas = instalarFetchFalso({ contadorInicial: FRENO_DURO });

  await assert.rejects(
    () => pedir('/fixtures', { league: 999, date: '2099-02-02', _run: marcaCorrida }, { tipo: 'fixtures' }),
    /Freno duro/
  );
  assert.equal(llamadas.apiSports, 0, 'no debería haber llamado a api-sports con el freno activado');
});

test('freno duro: justo por debajo del límite, sí deja pedir', async () => {
  const llamadas = instalarFetchFalso({ contadorInicial: FRENO_DURO - 1 });

  await pedir('/fixtures', { league: 999, date: '2099-03-03', _run: marcaCorrida }, { tipo: 'fixtures' });
  assert.equal(llamadas.apiSports, 1);
});

test('contadorHoy() lee el valor real que devuelve Supabase', async () => {
  instalarFetchFalso({ contadorInicial: 37 });
  assert.equal(await contadorHoy(), 37);
});

test('pedir() incrementa el contador en cada llamada real (no en los hits de caché)', async () => {
  instalarFetchFalso({ contadorInicial: 10 });
  const params = { league: 999, date: '2099-04-04', _run: marcaCorrida };

  await pedir('/fixtures', params, { tipo: 'fixtures' });
  assert.equal(await contadorHoy(), 11);

  await pedir('/fixtures', params, { tipo: 'fixtures' }); // esta sale de caché
  assert.equal(await contadorHoy(), 11, 'un hit de caché no debería incrementar el contador');
});
