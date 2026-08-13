// Cliente de api-sports.io (Fase 3). Regla 5 al pie de la letra:
//   - Nunca pide algo que ya está guardado en Supabase y sigue vigente.
//   - Contador de peticiones del día persistido en Supabase (compartido con
//     desarrollo — si corro un script a mano, cuenta igual que n8n).
//   - Freno duro a 80 peticiones (deja 20 de reserva sobre el límite real de
//     100/día, verificado por headers en la auditoría de Fase 3).
//   - Caché en disco con vencimiento por tipo de dato, para no volver a
//     pedir dentro de la misma ventana de vigencia.
//
// Cobertura real del plan gratis para LaLiga (liga 140), verificada contra
// /leagues?id=140 el 2026-08-12: fixtures y standings y odds SÍ; lineups e
// injuries NO (ver CLAUDE.md). Por eso este cliente no tiene función para
// esos dos endpoints — pedirlos solo daría un 403/plan restringido.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { seleccionar, upsert } from './supabase.mjs';

const BASE_URL = 'https://v3.football.api-sports.io';
const LEAGUE_ID = 140; // LaLiga
const CACHE_DIR = new URL('./cache/api/', import.meta.url);

export const FRENO_DURO = 80; // de 100/día reales; deja 20 de reserva

const TTL_HORAS_POR_TIPO = {
  fixtures: 6,
  standings: 12,
  odds: 6,
};

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

// Pide un endpoint de api-sports respetando caché, freno duro y contador.
// tipo/ttlHoras activan el cacheo en disco; sin tipo, siempre pide en vivo
// (para endpoints que cambian a cada momento y no tiene sentido cachear).
export async function pedir(endpoint, params = {}, { tipo, ttlHoras } = {}) {
  if (tipo) {
    const enCache = await leerCache(tipo, params, ttlHoras ?? TTL_HORAS_POR_TIPO[tipo] ?? 6);
    if (enCache !== null) return enCache;
  }

  const usado = await contadorHoy();
  if (usado >= FRENO_DURO) {
    throw new Error(`Freno duro: ${usado}/${FRENO_DURO} peticiones usadas hoy. No se pide "${endpoint}".`);
  }

  const key = process.env.API_SPORTS_KEY;
  if (!key) throw new Error('Falta API_SPORTS_KEY en .env');

  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url, { headers: { 'x-apisports-key': key } });
  await incrementarContador();

  if (!res.ok) throw new Error(`api-sports ${endpoint}: HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors && (Array.isArray(data.errors) ? data.errors.length : Object.keys(data.errors).length)) {
    throw new Error(`api-sports ${endpoint}: ${JSON.stringify(data.errors)}`);
  }

  if (tipo) await guardarCache(tipo, params, data.response);
  return data.response;
}

// --- Helpers de alto nivel, uno por tipo de dato que sí cubre el plan ---

// Partidos del día. Si ya están todos en Supabase con status 'FT' (jugados),
// no hace falta volver a pedirle nada a la API — ya no van a cambiar.
export async function partidosDelDia(fecha) {
  const guardados = await seleccionar(
    'fixtures',
    `date=gte.${fecha}T00:00:00&date=lte.${fecha}T23:59:59&select=id,status`
  );
  const hayAlgoGuardado = guardados.length > 0;
  const todosTerminados = hayAlgoGuardado && guardados.every((f) => f.status === 'FT');
  if (todosTerminados) return guardados;

  return pedir('/fixtures', { league: LEAGUE_ID, date: fecha }, { tipo: 'fixtures' });
}

export async function tablaPosiciones(temporadaApiSports) {
  return pedir('/standings', { league: LEAGUE_ID, season: temporadaApiSports }, { tipo: 'standings' });
}

// Solo para comparar contra la nota del modelo (regla del proyecto: nunca
// para predecir).
export async function cuotas(fixtureId) {
  return pedir('/odds', { fixture: fixtureId }, { tipo: 'odds' });
}
