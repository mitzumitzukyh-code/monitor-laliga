// Cliente de football-data.org (Fase 3). Reemplaza a api-sports.io — el
// plan gratis de api-sports NO da acceso a la temporada actual (verificado
// 2026-08-13 con llamadas reales, ver CLAUDE.md). football-data.org SÍ,
// verificado el mismo día con una llamada real a /v4/competitions/PD
// (temporada 2026-27 real, matchday 1 con los 20 equipos reales).
//
// Límite real del plan gratis: 10 peticiones por minuto. No hay tope diario
// documentado (a diferencia de api-sports) — igual se cuenta el uso diario
// en Supabase por disciplina y visibilidad, pero el freno que de verdad
// aplica es por minuto.
//
// Regla 5 sigue al pie de la letra: caché en disco con TTL por tipo de
// dato, nunca pedir lo que ya está guardado en Supabase y sigue vigente.
//
// No hay endpoint de cuotas en esta fuente (football-data.org no las
// ofrece) — se pierde esa comparación, nunca fue el núcleo del proyecto.
// Tampoco hay lineups/injuries en el plan gratis, igual que con api-sports.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { seleccionar, upsert } from './supabase.mjs';
import { VIVO_A_CORTO } from './equipos-vivo.mjs';

const BASE_URL = 'https://api.football-data.org/v4';
const COMPETITION_CODE = 'PD'; // Primera División — verificado real, no asumido
const COMPETITION_ID = 2014; // id numérico de football-data.org, solo para la columna league_id
const CACHE_DIR = new URL('./cache/api/', import.meta.url);

export const FRENO_POR_MINUTO = 8; // de 10 reales/minuto, deja 2 de reserva

const TTL_HORAS_POR_TIPO = {
  partidos: 6,
  standings: 12,
};

// Ventana deslizante de 60s en memoria. Cada corrida de n8n es un proceso
// nuevo (Execute Command), así que esto alcanza — no hace falta persistirlo
// como el contador diario.
let peticionesUltimoMinuto = [];

function limpiarVentana() {
  const ahora = Date.now();
  peticionesUltimoMinuto = peticionesUltimoMinuto.filter((t) => ahora - t < 60_000);
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export async function contadorHoy() {
  const filas = await seleccionar('api_usage', `date=eq.${hoyISO()}&select=requests_used`);
  return filas[0]?.requests_used ?? 0;
}

async function incrementarContador() {
  const usado = await contadorHoy();
  const nuevo = usado + 1;
  await upsert(
    'api_usage',
    [{ date: hoyISO(), requests_used: nuevo, updated_at: new Date().toISOString() }],
    { onConflict: 'date' }
  );
  return nuevo;
}

function nombreCache(tipo, params) {
  const clave = `${tipo}_${JSON.stringify(params)}`.replace(/[^a-zA-Z0-9_]/g, '_');
  return new URL(`${clave}.json`, CACHE_DIR);
}

async function leerCache(tipo, params, ttlHoras) {
  const archivo = nombreCache(tipo, params);
  if (!existsSync(archivo)) return null;
  const { guardadoEn, datos } = JSON.parse(await readFile(archivo, 'utf8'));
  const edadHoras = (Date.now() - new Date(guardadoEn).getTime()) / 3_600_000;
  if (edadHoras > ttlHoras) return null;
  return datos;
}

async function guardarCache(tipo, params, datos) {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(
    nombreCache(tipo, params),
    JSON.stringify({ guardadoEn: new Date().toISOString(), datos }, null, 2),
    'utf8'
  );
}

// Pide un endpoint de football-data.org respetando caché y el freno por
// minuto. tipo/ttlHoras activan el cacheo en disco.
export async function pedir(endpoint, params = {}, { tipo, ttlHoras } = {}) {
  if (tipo) {
    const enCache = await leerCache(tipo, params, ttlHoras ?? TTL_HORAS_POR_TIPO[tipo] ?? 6);
    if (enCache !== null) return enCache;
  }

  limpiarVentana();
  if (peticionesUltimoMinuto.length >= FRENO_POR_MINUTO) {
    throw new Error(
      `Freno por minuto: ${peticionesUltimoMinuto.length}/${FRENO_POR_MINUTO} peticiones en los últimos 60s. No se pide "${endpoint}".`
    );
  }

  const token = process.env.FOOTBALL_DATA_ORG_TOKEN;
  if (!token) throw new Error('Falta FOOTBALL_DATA_ORG_TOKEN en .env');

  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url, { headers: { 'X-Auth-Token': token } });
  peticionesUltimoMinuto.push(Date.now());
  await incrementarContador();

  if (!res.ok) {
    const cuerpo = await res.text();
    throw new Error(`football-data.org ${endpoint}: HTTP ${res.status} ${cuerpo}`);
  }
  const data = await res.json();

  if (tipo) await guardarCache(tipo, params, data);
  return data;
}

// --- Normalización al esquema de sql/schema.sql ---

function nombreCorto(equipoVivo) {
  return VIVO_A_CORTO.get(equipoVivo.name) ?? equipoVivo.name;
}

function normalizarPartido(m) {
  return {
    id: m.id,
    league_id: COMPETITION_ID,
    season: new Date(m.season.startDate).getFullYear(),
    round: m.matchday ? `Matchday ${m.matchday}` : null,
    date: m.utcDate,
    home_team_id: m.homeTeam.id,
    away_team_id: m.awayTeam.id,
    home_goals: m.score.fullTime.home,
    away_goals: m.score.fullTime.away,
    status: m.status,
    updated_at: new Date().toISOString(),
  };
}

function equiposDePartido(m) {
  return [
    { id: m.homeTeam.id, name: nombreCorto(m.homeTeam) },
    { id: m.awayTeam.id, name: nombreCorto(m.awayTeam) },
  ];
}

function sinDuplicados(equipos) {
  return [...new Map(equipos.map((e) => [e.id, e])).values()];
}

// --- Helpers de alto nivel ---

// Partidos de un día. Si ya están todos en Supabase con status FINISHED, no
// hace falta volver a pedirle nada a la fuente — ya no van a cambiar.
export async function partidosDelDia(fecha) {
  const guardados = await seleccionar(
    'fixtures',
    `date=gte.${fecha}T00:00:00&date=lte.${fecha}T23:59:59&select=id,status`
  );
  const hayAlgoGuardado = guardados.length > 0;
  const todosTerminados = hayAlgoGuardado && guardados.every((f) => f.status === 'FINISHED');
  if (todosTerminados) return guardados;

  const data = await pedir(
    `/competitions/${COMPETITION_CODE}/matches`,
    { dateFrom: fecha, dateTo: fecha },
    { tipo: 'partidos', ttlHoras: 6 }
  );
  const crudos = data.matches ?? [];
  if (crudos.length === 0) return [];

  const equipos = sinDuplicados(crudos.flatMap(equiposDePartido));
  const fixturesNormalizados = crudos.map(normalizarPartido);

  await upsert('teams', equipos, { onConflict: 'id' });
  await upsert('fixtures', fixturesNormalizados, { onConflict: 'id' });

  return fixturesNormalizados;
}

// Tabla de posiciones actual, con nombres ya llevados al corto canónico.
export async function tablaPosiciones() {
  const data = await pedir(`/competitions/${COMPETITION_CODE}/standings`, {}, { tipo: 'standings', ttlHoras: 12 });
  const tabla = data.standings?.find((s) => s.type === 'TOTAL')?.table ?? [];
  return tabla.map((t) => ({
    equipo: nombreCorto(t.team),
    posicion: t.position,
    jugados: t.playedGames,
    puntos: t.points,
    golesFavor: t.goalsFor,
    golesContra: t.goalsAgainst,
  }));
}

// CLI para el flujo n8n/01-partidos.json: node datos/api.mjs [fecha AAAA-MM-DD]
async function main() {
  const fecha = process.argv[2] || new Date().toISOString().slice(0, 10);
  const partidos = await partidosDelDia(fecha);
  console.log(JSON.stringify({ fecha, partidos: partidos.length, contador: await contadorHoy() }));
}

const esEjecutadoDirectamente = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (esEjecutadoDirectamente) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
