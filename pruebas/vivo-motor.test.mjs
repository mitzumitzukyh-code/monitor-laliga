import { test, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key';

const { predecirDia } = await import('../juez/vivo-motor.mjs');
const { RHO, SEMIVIDA_JORNADAS, PESO_PRIOR_PARTIDOS } = await import('../config.mjs');

const fetchOriginal = globalThis.fetch;
after(() => {
  globalThis.fetch = fetchOriginal;
});

function respuestaJSON(obj) {
  return { ok: true, status: 200, json: async () => obj, text: async () => JSON.stringify(obj) };
}

test('predecirDia() calcula y guarda una predicción real para un partido con historial', async () => {
  // Usamos dos equipos reales del histórico (Barcelona/Ath Bilbao) para que
  // fuerzas() tenga de sobra con qué calcular -- no hace falta inventar
  // historial sintético, ya está en datos/cache/laliga.json.
  const partidoDeHoy = {
    id: 777001,
    date: '2099-09-09T19:00:00Z',
    season: 2099,
    round: 'Matchday 4',
    home_team_id: 81,
    away_team_id: 77,
    home_goals: null,
    away_goals: null,
    status: 'TIMED',
  };

  let upsertPredictions = null;
  globalThis.fetch = async (url, opciones = {}) => {
    const urlStr = String(url);
    if (urlStr.includes('/rest/v1/teams')) {
      return respuestaJSON([{ id: 81, name: 'Barcelona' }, { id: 77, name: 'Ath Bilbao' }]);
    }
    if (urlStr.includes('/rest/v1/predictions') && opciones.method === 'POST') {
      upsertPredictions = JSON.parse(opciones.body);
      return respuestaJSON(upsertPredictions);
    }
    if (urlStr.includes('/rest/v1/fixtures')) {
      if (urlStr.includes('status=eq.FINISHED')) return respuestaJSON([]); // solo usamos el histórico de Fase 0
      if (urlStr.includes('date=gte')) return respuestaJSON([partidoDeHoy]);
      return respuestaJSON([partidoDeHoy]); // la query de "todas" para inicio de jornada
    }
    return respuestaJSON([]);
  };

  const { predicciones, sinFuerzas } = await predecirDia('2099-09-09');

  assert.equal(sinFuerzas.length, 0);
  assert.equal(predicciones.length, 1);
  const p = predicciones[0];
  assert.equal(p.fixture_id, 777001);
  assert.ok(p.lh > 0 && p.la > 0, 'lambdas deben ser positivos');
  assert.ok(Math.abs(p.prob_local + p.prob_empate + p.prob_visitante - 1) < 1e-9);
  assert.equal(p.rho, RHO);
  assert.equal(p.semivida_jornadas, SEMIVIDA_JORNADAS);
  assert.equal(p.peso_prior, PESO_PRIOR_PARTIDOS);

  assert.equal(upsertPredictions.length, 1);
  assert.equal(upsertPredictions[0].fixture_id, 777001);
});

test('predecirDia() no revienta con un equipo sin ningún historial -- lo salta y lo reporta', async () => {
  const partidoFantasma = {
    id: 777002,
    date: '2099-09-10T19:00:00Z',
    season: 2099,
    round: 'Matchday 4',
    home_team_id: 90001,
    away_team_id: 90002,
    home_goals: null,
    away_goals: null,
    status: 'TIMED',
  };

  let seLlamoUpsert = false;
  globalThis.fetch = async (url, opciones = {}) => {
    const urlStr = String(url);
    if (urlStr.includes('/rest/v1/teams')) {
      return respuestaJSON([{ id: 90001, name: 'EquipoFantasma A' }, { id: 90002, name: 'EquipoFantasma B' }]);
    }
    if (urlStr.includes('/rest/v1/predictions') && opciones.method === 'POST') {
      seLlamoUpsert = true;
      return respuestaJSON([]);
    }
    if (urlStr.includes('/rest/v1/fixtures')) {
      if (urlStr.includes('status=eq.FINISHED')) return respuestaJSON([]);
      return respuestaJSON([partidoFantasma]);
    }
    return respuestaJSON([]);
  };

  const { predicciones, sinFuerzas } = await predecirDia('2099-09-10');
  assert.equal(predicciones.length, 0);
  assert.equal(sinFuerzas.length, 1);
  assert.equal(sinFuerzas[0].local, 'EquipoFantasma A');
  assert.equal(seLlamoUpsert, false, 'no debería intentar guardar nada si no hay ninguna predicción');
});

test('predecirDia() sin partidos ese día devuelve arreglos vacíos sin tocar Supabase de más', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes('/rest/v1/fixtures')) return respuestaJSON([]);
    return respuestaJSON([]);
  };
  const { predicciones, sinFuerzas } = await predecirDia('2099-12-25');
  assert.deepEqual(predicciones, []);
  assert.deepEqual(sinFuerzas, []);
});

// Bug real encontrado en revisión (2026-08-14): predictions guarda la
// predicción Y su calificación (resultado_real, brier) en la MISMA fila.
// predecirDia() hacía upsert sin filtrar las ya predichas, así que si
// 04-motor corría dos veces el mismo día y entremedio 06-nota ya había
// calificado el partido, el brier guardado quedaba apuntando a unas
// probabilidades que acababan de cambiar. El comentario del propio módulo
// ya prometía este filtro ("que todavía no tenga predicción").
test('predecirDia() no re-predice un partido que ya tiene predicción guardada', async () => {
  const partidoDeHoy = {
    id: 777003,
    date: '2099-09-11T19:00:00Z',
    season: 2099,
    round: 'Matchday 4',
    home_team_id: 81,
    away_team_id: 77,
    home_goals: null,
    away_goals: null,
    status: 'TIMED',
  };

  let huboUpsert = false;
  globalThis.fetch = async (url, opciones = {}) => {
    const urlStr = String(url);
    if (urlStr.includes('/rest/v1/teams')) {
      return respuestaJSON([{ id: 81, name: 'Barcelona' }, { id: 77, name: 'Ath Bilbao' }]);
    }
    if (urlStr.includes('/rest/v1/predictions')) {
      if (opciones.method === 'POST') {
        huboUpsert = true;
        return respuestaJSON([]);
      }
      // El select de predicciones existentes: este partido ya está predicho.
      return respuestaJSON([{ fixture_id: 777003 }]);
    }
    if (urlStr.includes('/rest/v1/fixtures')) {
      if (urlStr.includes('status=eq.FINISHED')) return respuestaJSON([]);
      return respuestaJSON([partidoDeHoy]);
    }
    return respuestaJSON([]);
  };

  const { predicciones, yaPredichos } = await predecirDia('2099-09-11');

  assert.equal(predicciones.length, 0, 'no debe re-predecir');
  assert.deepEqual(yaPredichos, [777003]);
  assert.equal(huboUpsert, false, 'no debe escribir nada');
});
