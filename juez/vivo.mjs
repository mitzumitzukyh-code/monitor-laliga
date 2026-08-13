// Helpers compartidos para las predicciones en vivo (Fase 3). Fusiona el
// histórico de Fase 0 (football-data.co.uk, en datos/cache/laliga.json) con
// los partidos ya jugados en vivo (Supabase, football-data.org) en un solo
// arreglo, mismo shape que usa motor/elo.mjs desde Fase 1.
//
// Regla 6 (cero fuga temporal): el corte para calcular fuerzas de un partido
// es la fecha de INICIO de su jornada real (football-data.org sí manda
// número de jornada, a diferencia del histórico de Fase 0 que tuvo que
// aproximarlo) — nunca la fecha del propio partido. Así un partido del
// domingo no ve los resultados del viernes de su misma jornada.

import { readFile } from 'node:fs/promises';
import { seleccionar } from '../datos/supabase.mjs';

function temporadaDesdeSeason(season) {
  return `${season}-${String(season + 1).slice(2)}`;
}

function numeroDeJornada(round) {
  const m = /Matchday (\d+)/.exec(round ?? '');
  return m ? Number(m[1]) : null;
}

// Nombre corto canónico de cada equipo guardado en Supabase, por su id de
// football-data.org (teams.name ya se guarda en corto, ver datos/api.mjs).
export async function mapaDeEquipos() {
  const equipos = await seleccionar('teams', 'select=id,name');
  return new Map(equipos.map((e) => [e.id, e.name]));
}

// Histórico completo: Fase 0 + partidos en vivo ya terminados, mismo shape
// { fecha, local, visitante, golesLocal, golesVisitante, temporada }.
export async function historicoCompleto(nombrePorId) {
  const historico = JSON.parse(
    await readFile(new URL('../datos/cache/laliga.json', import.meta.url), 'utf8')
  );

  const terminados = await seleccionar('fixtures', 'status=eq.FINISHED&select=*');
  const enVivo = terminados
    .filter((f) => f.home_goals !== null && f.away_goals !== null)
    .map((f) => ({
      fecha: f.date.slice(0, 10),
      local: nombrePorId.get(f.home_team_id) ?? String(f.home_team_id),
      visitante: nombrePorId.get(f.away_team_id) ?? String(f.away_team_id),
      golesLocal: f.home_goals,
      golesVisitante: f.away_goals,
      temporada: temporadaDesdeSeason(f.season),
    }));

  const clavesHistoricas = new Set(historico.map((p) => `${p.fecha}|${p.local}|${p.visitante}`));
  const soloNuevos = enVivo.filter((p) => !clavesHistoricas.has(`${p.fecha}|${p.local}|${p.visitante}`));

  return [...historico, ...soloNuevos].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Partidos de una fecha puntual, con equipos resueltos a nombre corto y la
// fechaCorte segura (inicio real de su jornada) ya calculada.
export async function partidosDe(fecha, nombrePorId) {
  const filas = await seleccionar(
    'fixtures',
    `date=gte.${fecha}T00:00:00&date=lte.${fecha}T23:59:59&select=*`
  );
  if (filas.length === 0) return [];

  const todas = await seleccionar('fixtures', 'select=date,season,round');
  const inicioPorJornada = new Map();
  for (const f of todas) {
    const clave = `${temporadaDesdeSeason(f.season)}|${numeroDeJornada(f.round)}`;
    const actual = inicioPorJornada.get(clave);
    const fechaSolo = f.date.slice(0, 10);
    if (actual === undefined || fechaSolo < actual) inicioPorJornada.set(clave, fechaSolo);
  }

  return filas.map((f) => {
    const temporada = temporadaDesdeSeason(f.season);
    const jornada = numeroDeJornada(f.round);
    const fecha10 = f.date.slice(0, 10);
    return {
      id: f.id,
      fecha: fecha10,
      fechaCorte: inicioPorJornada.get(`${temporada}|${jornada}`) ?? fecha10,
      local: nombrePorId.get(f.home_team_id) ?? String(f.home_team_id),
      visitante: nombrePorId.get(f.away_team_id) ?? String(f.away_team_id),
      status: f.status,
      golesLocal: f.home_goals,
      golesVisitante: f.away_goals,
      temporada,
      jornada,
    };
  });
}
