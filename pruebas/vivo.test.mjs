import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key';

const { historicoCompleto, partidosDe, mapaDeEquipos } = await import('../juez/vivo.mjs');

const fetchOriginal = globalThis.fetch;
after(() => {
  globalThis.fetch = fetchOriginal;
});

function respuestaJSON(obj) {
  return { ok: true, status: 200, json: async () => obj, text: async () => JSON.stringify(obj) };
}

function instalarSupabaseFalso(rutas) {
  globalThis.fetch = async (url) => {
    const urlStr = String(url);
    for (const [patron, datos] of rutas) {
      if (urlStr.includes(patron)) return respuestaJSON(typeof datos === 'function' ? datos(urlStr) : datos);
    }
    return respuestaJSON([]);
  };
}

test('mapaDeEquipos() devuelve id -> nombre corto', async () => {
  instalarSupabaseFalso([['/rest/v1/teams', [{ id: 81, name: 'Barcelona' }, { id: 77, name: 'Ath Bilbao' }]]]);
  const mapa = await mapaDeEquipos();
  assert.equal(mapa.get(81), 'Barcelona');
  assert.equal(mapa.get(77), 'Ath Bilbao');
});

test('historicoCompleto() agrega los partidos en vivo ya terminados al histórico real de Fase 0', async () => {
  const historicoReal = JSON.parse(await readFile(new URL('../datos/cache/laliga.json', import.meta.url), 'utf8'));

  const partidoVivo = {
    id: 999001,
    date: '2026-08-15T17:30:00Z',
    season: 2026,
    home_team_id: 263,
    away_team_id: 82,
    home_goals: 2,
    away_goals: 1,
    status: 'FINISHED',
  };
  instalarSupabaseFalso([['/rest/v1/fixtures', [partidoVivo]]]);

  const nombrePorId = new Map([[263, 'Alaves'], [82, 'Getafe']]);
  const combinado = await historicoCompleto(nombrePorId);

  assert.equal(combinado.length, historicoReal.length + 1);
  const nuevo = combinado.find((p) => p.fecha === '2026-08-15');
  assert.deepEqual(nuevo, {
    fecha: '2026-08-15',
    local: 'Alaves',
    visitante: 'Getafe',
    golesLocal: 2,
    golesVisitante: 1,
    temporada: '2026-27',
  });
  // sigue ordenado por fecha ascendente
  for (let i = 1; i < combinado.length; i++) {
    assert.ok(combinado[i].fecha >= combinado[i - 1].fecha);
  }
});

test('historicoCompleto() no duplica un partido que ya está en el histórico de Fase 0', async () => {
  const historicoReal = JSON.parse(await readFile(new URL('../datos/cache/laliga.json', import.meta.url), 'utf8'));
  const yaExiste = historicoReal[0];

  instalarSupabaseFalso([
    [
      '/rest/v1/fixtures',
      [
        {
          id: 1,
          date: `${yaExiste.fecha}T20:00:00Z`,
          season: Number(yaExiste.temporada.slice(0, 4)),
          home_team_id: 1,
          away_team_id: 2,
          home_goals: yaExiste.golesLocal,
          away_goals: yaExiste.golesVisitante,
          status: 'FINISHED',
        },
      ],
    ],
  ]);
  const nombrePorId = new Map([[1, yaExiste.local], [2, yaExiste.visitante]]);
  const combinado = await historicoCompleto(nombrePorId);
  assert.equal(combinado.length, historicoReal.length, 'no debería haber agregado una fila duplicada');
});

test('partidosDe(): fechaCorte es el INICIO real de la jornada, no la fecha del propio partido (anti-fuga)', async () => {
  // Jornada 5 de la 2026-27: un partido el viernes, otro el lunes (misma
  // jornada, distintos días). El de hoy (lunes) no puede ver el resultado
  // del viernes de SU MISMA jornada al calcular sus fuerzas.
  const partidoViernes = {
    id: 1, date: '2026-10-02T19:00:00Z', season: 2026, round: 'Matchday 5',
    home_team_id: 1, away_team_id: 2, home_goals: 1, away_goals: 0, status: 'FINISHED',
  };
  const partidoLunes = {
    id: 2, date: '2026-10-05T19:00:00Z', season: 2026, round: 'Matchday 5',
    home_team_id: 3, away_team_id: 4, home_goals: null, away_goals: null, status: 'TIMED',
  };

  instalarSupabaseFalso([
    [
      '/rest/v1/fixtures',
      (urlStr) => {
        // la query de "hoy" (rango de fecha) solo debe devolver el partido del lunes
        if (urlStr.includes('date=gte')) return [partidoLunes];
        // la query de "todas" (para calcular inicio de jornada) devuelve ambos
        return [partidoViernes, partidoLunes];
      },
    ],
  ]);

  const nombrePorId = new Map([[1, 'A'], [2, 'B'], [3, 'C'], [4, 'D']]);
  const partidos = await partidosDe('2026-10-05', nombrePorId);

  assert.equal(partidos.length, 1);
  assert.equal(partidos[0].fecha, '2026-10-05');
  assert.equal(partidos[0].fechaCorte, '2026-10-02', 'debe ser el viernes (inicio de la jornada), no el lunes');
  assert.equal(partidos[0].jornada, 5);
  assert.equal(partidos[0].temporada, '2026-27');
});

test('partidosDe() devuelve vacío si no hay partidos ese día', async () => {
  instalarSupabaseFalso([['/rest/v1/fixtures', []]]);
  const partidos = await partidosDe('2026-12-25', new Map());
  assert.deepEqual(partidos, []);
});
