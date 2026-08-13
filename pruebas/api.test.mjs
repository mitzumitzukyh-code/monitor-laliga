// Pruebas de datos/api.mjs con fetch simulado — CERO llamadas reales a
// football-data.org ni a Supabase. Si estas pruebas llamaran a la red de
// verdad, cada corrida de `node --test` gastaría presupuesto real (regla 5).

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

process.env.SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key';
process.env.FOOTBALL_DATA_ORG_TOKEN = 'fake-football-data-org-token';

const { pedir, contadorHoy, partidosDelDia, tablaPosiciones, FRENO_POR_MINUTO } = await import('../datos/api.mjs');

const fetchOriginal = globalThis.fetch;
// El caché de pedir() escribe en disco de verdad (datos/cache/api/). Se
// limpia ANTES de correr las pruebas (no solo después) — si alguien corrió
// un script real (ej. datos/cli-contexto.mjs) antes de las pruebas, esa
// caché real quedaría pisando el mock de tablaPosiciones(), que no acepta
// parámetros para llevar una marca única de corrida como el resto.
await rm(new URL('../datos/cache/api/', import.meta.url), { recursive: true, force: true });

// Cada clave de caché lleva una marca única de esta corrida para no chocar
// con una corrida anterior (para los casos que sí aceptan parámetros).
const marcaCorrida = `test${Date.now()}`;

function respuestaJSON(obj) {
  return { ok: true, status: 200, json: async () => obj, text: async () => JSON.stringify(obj) };
}

// Fetch falso: distingue Supabase (contador + selects) de football-data.org,
// y lleva la cuenta de cuántas veces se llamó a cada uno.
function instalarFetchFalso({ contadorInicial = 0, filasFixturesGuardadas = [], respuestaVivo = { matches: [] } } = {}) {
  let contador = contadorInicial;
  const llamadas = { supabase: 0, vivo: 0 };

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

    llamadas.vivo++;
    return respuestaJSON(respuestaVivo);
  };

  return llamadas;
}

after(async () => {
  globalThis.fetch = fetchOriginal;
  await rm(new URL('../datos/cache/api/', import.meta.url), { recursive: true, force: true });
});

test('pedir() con tipo cacheable solo llama a football-data.org una vez; la segunda vez usa caché', async () => {
  const llamadas = instalarFetchFalso({ respuestaVivo: { dato: 'fresco' } });
  const params = { dateFrom: '2099-01-01', dateTo: '2099-01-01', _run: marcaCorrida };

  const r1 = await pedir('/competitions/PD/matches', params, { tipo: 'fixtures', ttlHoras: 6 });
  assert.deepEqual(r1, { dato: 'fresco' });
  assert.equal(llamadas.vivo, 1);

  const r2 = await pedir('/competitions/PD/matches', params, { tipo: 'fixtures', ttlHoras: 6 });
  assert.deepEqual(r2, { dato: 'fresco' });
  assert.equal(llamadas.vivo, 1, 'la segunda pedida no debería tocar la red, tenía que salir de caché');
});

test('contadorHoy() lee el valor real que devuelve Supabase', async () => {
  instalarFetchFalso({ contadorInicial: 37 });
  assert.equal(await contadorHoy(), 37);
});

test('partidosDelDia() normaliza el partido crudo de football-data.org y guarda equipos + fixture en Supabase', async () => {
  const partidoCrudo = {
    id: 555111,
    utcDate: '2099-05-05T20:00:00Z',
    status: 'TIMED',
    matchday: 3,
    season: { startDate: '2026-08-16', endDate: '2027-05-30' },
    homeTeam: { id: 81, name: 'FC Barcelona' },
    awayTeam: { id: 77, name: 'Athletic Club' },
    score: { fullTime: { home: null, away: null } },
  };

  const upserts = { teams: null, fixtures: null };
  globalThis.fetch = async (url, opciones = {}) => {
    const urlStr = String(url);
    if (urlStr.startsWith('https://supabase.test')) {
      if (urlStr.includes('/rest/v1/api_usage') && opciones.method === 'POST') {
        return respuestaJSON(JSON.parse(opciones.body));
      }
      if (urlStr.includes('/rest/v1/api_usage')) return respuestaJSON([{ requests_used: 0 }]);
      if (urlStr.includes('/rest/v1/fixtures') && opciones.method === 'POST') {
        upserts.fixtures = JSON.parse(opciones.body);
        return respuestaJSON(upserts.fixtures);
      }
      if (urlStr.includes('/rest/v1/fixtures')) return respuestaJSON([]);
      if (urlStr.includes('/rest/v1/teams') && opciones.method === 'POST') {
        upserts.teams = JSON.parse(opciones.body);
        return respuestaJSON(upserts.teams);
      }
      return respuestaJSON([]);
    }
    return respuestaJSON({ matches: [partidoCrudo] });
  };

  const resultado = await partidosDelDia('2099-05-05');

  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].id, 555111);
  assert.equal(resultado[0].home_team_id, 81);
  assert.equal(resultado[0].away_team_id, 77);
  assert.equal(resultado[0].status, 'TIMED');
  assert.equal(resultado[0].season, 2026);
  assert.equal(resultado[0].round, 'Matchday 3');

  // FC Barcelona / Athletic Club -> nombres cortos canónicos, no los oficiales
  assert.deepEqual(upserts.teams, [
    { id: 81, name: 'Barcelona' },
    { id: 77, name: 'Ath Bilbao' },
  ]);
  assert.equal(upserts.fixtures.length, 1);
  assert.equal(upserts.fixtures[0].id, 555111);
});

test('partidosDelDia() no pide nada a la fuente si ya están todos guardados con status FINISHED', async () => {
  let llamoVivo = false;
  globalThis.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.startsWith('https://supabase.test')) {
      if (urlStr.includes('/rest/v1/fixtures')) {
        return respuestaJSON([{ id: 1, status: 'FINISHED' }, { id: 2, status: 'FINISHED' }]);
      }
      return respuestaJSON([]);
    }
    llamoVivo = true;
    return respuestaJSON({ matches: [] });
  };

  const resultado = await partidosDelDia('2099-06-06');
  assert.equal(llamoVivo, false, 'todos los partidos ya estaban FINISHED, no debía pedir nada');
  assert.equal(resultado.length, 2);
});

test('tablaPosiciones() devuelve nombres cortos canónicos, no los oficiales', async () => {
  instalarFetchFalso({
    respuestaVivo: {
      standings: [
        {
          type: 'TOTAL',
          table: [
            { position: 1, team: { name: 'Real Madrid CF' }, playedGames: 1, points: 3, goalsFor: 2, goalsAgainst: 0 },
            { position: 2, team: { name: 'FC Barcelona' }, playedGames: 1, points: 3, goalsFor: 3, goalsAgainst: 1 },
          ],
        },
      ],
    },
  });

  const tabla = await tablaPosiciones();
  assert.deepEqual(tabla.map((t) => t.equipo), ['Real Madrid', 'Barcelona']);
  assert.equal(tabla[0].puntos, 3);
});

// Va al final a propósito: satura la ventana deslizante de FRENO_POR_MINUTO
// a nivel de módulo, lo que dejaría contaminadas (con el freno ya puesto)
// a cualquier prueba real que corra después de esta dentro del mismo minuto.
test('freno por minuto: nunca deja pasar más llamadas reales que FRENO_POR_MINUTO', async () => {
  // Tampoco asume que arranca en 0: si otra prueba de este archivo ya pidió
  // algo real en el mismo minuto, ya hay entradas puestas. Solo verifica la
  // propiedad real que importa (nunca pasarse del freno), pidiendo de más y
  // confirmando que en algún punto se corta.
  const llamadas = instalarFetchFalso();
  let seDisparoElFreno = false;
  for (let i = 0; i < FRENO_POR_MINUTO + 5; i++) {
    try {
      await pedir('/competitions/PD/matches', { _run: marcaCorrida, i }, { tipo: 'fixtures' });
    } catch (e) {
      assert.match(e.message, /Freno por minuto/);
      seDisparoElFreno = true;
    }
  }
  assert.equal(seDisparoElFreno, true, 'debería haberse disparado el freno en algún punto de las 13 pedidas');
  assert.ok(llamadas.vivo <= FRENO_POR_MINUTO, `no debería exceder el freno: ${llamadas.vivo} llamadas reales`);
});
