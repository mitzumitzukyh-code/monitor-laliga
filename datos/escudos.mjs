// Escudos de los equipos para el panel web. Fuente: football-data.org
// (/v4/competitions/PD/teams devuelve el campo `crest` de cada equipo).
//
// Regla 5, cero excepciones: el índice y los archivos viven en
// datos/cache/escudos/ y sobreviven entre corridas. Una sola petición a la
// API cubre los 20 equipos de la temporada, y solo se repite cuando el TTL
// vence. Los archivos de imagen se bajan de crests.football-data.org, que
// no lleva token y no gasta presupuesto de la API.
//
//   node --env-file=.env datos/escudos.mjs     baja lo que falte
//   node datos/escudos.mjs                     solo informa qué hay en caché
//
// Sin token no revienta nada: el panel cae al escudo de iniciales, que es
// justo lo que hace el diseño cuando no tiene el crest real.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pedir } from './api.mjs';
import { EQUIPOS_VIVOS_2026_27, VIVO_A_CORTO } from './equipos-vivo.mjs';

const CACHE_DIR = new URL('./cache/escudos/', import.meta.url);
const INDICE = new URL('./indice.json', CACHE_DIR);

// Un mes. Un escudo no cambia casi nunca; cuando cambia, se borra la caché.
const TTL_HORAS = 720;

const EXTENSION_A_MIME = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function extensionDe(url) {
  const limpio = String(url).split('?')[0];
  const punto = limpio.lastIndexOf('.');
  const ext = punto === -1 ? '' : limpio.slice(punto).toLowerCase();
  return EXTENSION_A_MIME[ext] ? ext : '.png';
}

// Nombre de archivo seguro a partir del nombre corto canónico ("Ath Bilbao"
// -> "ath-bilbao"). No se usa el id de football-data.org a propósito: el
// panel indexa por nombre corto, que es lo que usa el motor desde Fase 0.
function archivoDe(corto, ext) {
  return corto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') + ext;
}

// --- lectura (lo que usa el generador del panel) -------------------------

// Devuelve Map<nombreCorto, { mime, base64 }> con lo que haya en disco.
// Nunca pide red. Si no hay nada, devuelve un Map vacío y el panel usa
// iniciales.
export async function escudosEnCache() {
  const escudos = new Map();
  let indice;
  try {
    indice = JSON.parse(await readFile(INDICE, 'utf8'));
  } catch {
    return escudos;
  }
  for (const [corto, entrada] of Object.entries(indice.equipos ?? {})) {
    try {
      const binario = await readFile(new URL(entrada.archivo, CACHE_DIR));
      escudos.set(corto, {
        mime: EXTENSION_A_MIME[entrada.ext] ?? 'image/png',
        base64: binario.toString('base64'),
      });
    } catch {
      // Un archivo suelto que falta no invalida el resto del índice.
    }
  }
  return escudos;
}

// --- escritura (lo que corre a mano, con token) --------------------------

async function indiceVigente() {
  try {
    const indice = JSON.parse(await readFile(INDICE, 'utf8'));
    const edadHoras = (Date.now() - new Date(indice.actualizado).getTime()) / 3_600_000;
    return edadHoras < TTL_HORAS ? indice : null;
  } catch {
    return null;
  }
}

// Baja el índice de equipos (1 petición) y después cada escudo que falte.
// Devuelve un resumen de qué se hizo, para poder decirlo por consola sin
// que el módulo imprima nada por su cuenta.
export async function actualizarEscudos({ forzar = false } = {}) {
  await mkdir(CACHE_DIR, { recursive: true });

  const vigente = forzar ? null : await indiceVigente();
  if (vigente) {
    return { desdeCache: true, equipos: Object.keys(vigente.equipos).length, bajados: 0, fallidos: [] };
  }

  const data = await pedir(`/competitions/PD/teams`, {}, { tipo: 'equipos', ttlHoras: TTL_HORAS });

  const equipos = {};
  const fallidos = [];
  let bajados = 0;

  for (const equipo of data.teams ?? []) {
    // El nombre corto canónico sale del mapeo verificado de Fase 3. Si un
    // equipo no está mapeado, se salta: meterlo con el nombre largo de la
    // API rompería el cruce con el motor.
    const corto = VIVO_A_CORTO.get(equipo.name);
    if (!corto || !equipo.crest) continue;

    const ext = extensionDe(equipo.crest);
    const archivo = archivoDe(corto, ext);
    equipos[corto] = { archivo, ext, origen: equipo.crest };

    try {
      await readFile(new URL(archivo, CACHE_DIR));
      continue; // ya estaba bajado
    } catch {
      // no está, se baja abajo
    }

    try {
      const res = await fetch(equipo.crest);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const binario = Buffer.from(await res.arrayBuffer());
      await writeFile(new URL(archivo, CACHE_DIR), binario);
      bajados += 1;
    } catch (e) {
      fallidos.push(`${corto}: ${e.message}`);
      delete equipos[corto];
    }
  }

  await writeFile(INDICE, JSON.stringify({ actualizado: new Date().toISOString(), equipos }, null, 2));
  return { desdeCache: false, equipos: Object.keys(equipos).length, bajados, fallidos };
}

// Equipos del histórico que nunca van a tener escudo por esta vía: los que
// no están en la temporada actual de football-data.org. El panel los pinta
// con iniciales y eso es correcto, no un error que haya que arreglar.
export function equiposSinEscudoPosible(nombresDelHistorico) {
  const mapeados = new Set(EQUIPOS_VIVOS_2026_27.map((e) => e.corto));
  return nombresDelHistorico.filter((n) => !mapeados.has(n)).sort();
}

// --- CLI -----------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  const forzar = process.argv.includes('--forzar');
  if (!process.env.FOOTBALL_DATA_ORG_TOKEN) {
    const cache = await escudosEnCache();
    console.log(
      cache.size > 0
        ? `Sin token. En caché hay ${cache.size} escudos: ${[...cache.keys()].sort().join(', ')}`
        : 'Sin token y sin caché. El panel va a usar escudos de iniciales.\nCorre: node --env-file=.env datos/escudos.mjs'
    );
    process.exit(0);
  }
  const r = await actualizarEscudos({ forzar });
  if (r.desdeCache) console.log(`Índice vigente (TTL ${TTL_HORAS} h): ${r.equipos} equipos, no se pidió nada.`);
  else console.log(`Índice actualizado: ${r.equipos} equipos, ${r.bajados} escudos bajados.`);
  if (r.fallidos.length > 0) console.log(`No se pudieron bajar: ${r.fallidos.join(' · ')}`);
}
