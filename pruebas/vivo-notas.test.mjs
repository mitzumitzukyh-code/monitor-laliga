import { test, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key';

const { actualizarNotas } = await import('../juez/vivo-notas.mjs');

const fetchOriginal = globalThis.fetch;
after(() => {
  globalThis.fetch = fetchOriginal;
});

function respuestaJSON(obj) {
  return { ok: true, status: 200, json: async () => obj, text: async () => JSON.stringify(obj) };
}

const PREDICCION_PENDIENTE = {
  fixture_id: 1,
  lh: 1.5,
  la: 1.1,
  prob_local: 0.5,
  prob_empate: 0.3,
  prob_visitante: 0.2,
  rho: -0.02,
  semivida_jornadas: 150,
  peso_prior: 4,
  resultado_real: null,
};

test('actualizarNotas(): partido terminado 2-0 -> resultado_real=local, brier=0.38/3 a mano', async () => {
  let upsertEnviado = null;
  globalThis.fetch = async (url, opciones = {}) => {
    const urlStr = String(url);
    if (urlStr.includes('/rest/v1/predictions') && opciones.method === 'POST') {
      upsertEnviado = JSON.parse(opciones.body);
      return respuestaJSON(upsertEnviado);
    }
    if (urlStr.includes('/rest/v1/predictions')) return respuestaJSON([PREDICCION_PENDIENTE]);
    if (urlStr.includes('/rest/v1/fixtures')) {
      return respuestaJSON([{ id: 1, home_goals: 2, away_goals: 0 }]);
    }
    return respuestaJSON([]);
  };

  const resultado = await actualizarNotas();
  assert.equal(resultado.actualizadas, 1);
  assert.equal(upsertEnviado.length, 1);
  assert.equal(upsertEnviado[0].resultado_real, 'local');
  // (0.5-1)^2+(0.3-0)^2+(0.2-0)^2 = 0.38, /3 (fórmula oficial K=3) = 0.126666...
  assert.ok(Math.abs(upsertEnviado[0].brier - 0.38 / 3) < 1e-9);
  assert.equal(upsertEnviado[0].fixture_id, 1);
});

test('actualizarNotas(): partido que todavía no terminó no se toca', async () => {
  let seLlamoUpsert = false;
  globalThis.fetch = async (url, opciones = {}) => {
    const urlStr = String(url);
    if (urlStr.includes('/rest/v1/predictions') && opciones.method === 'POST') {
      seLlamoUpsert = true;
      return respuestaJSON([]);
    }
    if (urlStr.includes('/rest/v1/predictions')) return respuestaJSON([PREDICCION_PENDIENTE]);
    if (urlStr.includes('/rest/v1/fixtures')) return respuestaJSON([]); // no está FINISHED, no aparece
    return respuestaJSON([]);
  };

  const resultado = await actualizarNotas();
  assert.equal(resultado.actualizadas, 0);
  assert.equal(seLlamoUpsert, false);
});

test('actualizarNotas(): sin predicciones pendientes, no toca fixtures ni upsert', async () => {
  let seConsultoFixtures = false;
  let seLlamoUpsert = false;
  globalThis.fetch = async (url, opciones = {}) => {
    const urlStr = String(url);
    if (urlStr.includes('/rest/v1/predictions') && opciones.method === 'POST') {
      seLlamoUpsert = true;
      return respuestaJSON([]);
    }
    if (urlStr.includes('/rest/v1/predictions')) return respuestaJSON([]);
    if (urlStr.includes('/rest/v1/fixtures')) {
      seConsultoFixtures = true;
      return respuestaJSON([]);
    }
    return respuestaJSON([]);
  };

  const resultado = await actualizarNotas();
  assert.equal(resultado.actualizadas, 0);
  assert.equal(seConsultoFixtures, false, 'sin predicciones pendientes no hace falta ni preguntar por fixtures');
  assert.equal(seLlamoUpsert, false);
});

test('actualizarNotas(): partido 1-1 -> resultado_real=empate', async () => {
  let upsertEnviado = null;
  globalThis.fetch = async (url, opciones = {}) => {
    const urlStr = String(url);
    if (urlStr.includes('/rest/v1/predictions') && opciones.method === 'POST') {
      upsertEnviado = JSON.parse(opciones.body);
      return respuestaJSON(upsertEnviado);
    }
    if (urlStr.includes('/rest/v1/predictions')) return respuestaJSON([PREDICCION_PENDIENTE]);
    if (urlStr.includes('/rest/v1/fixtures')) return respuestaJSON([{ id: 1, home_goals: 1, away_goals: 1 }]);
    return respuestaJSON([]);
  };

  await actualizarNotas();
  assert.equal(upsertEnviado[0].resultado_real, 'empate');
  // (0.5-0)^2+(0.3-1)^2+(0.2-0)^2 = 0.25+0.49+0.04 = 0.78, /3 = 0.26
  assert.ok(Math.abs(upsertEnviado[0].brier - 0.78 / 3) < 1e-9);
});
