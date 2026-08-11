// Baja las últimas 5 temporadas de LaLiga (SP1.csv) desde football-data.co.uk,
// las cachea en datos/cache/ y las une en datos/cache/laliga.json.
//
// No pide nada que ya esté en caché. No toca api-sports. No calcula nada.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nombresSospechosos } from './nombres.mjs';

const BASE_URL = 'https://www.football-data.co.uk/mmz4281';
const CACHE_DIR = new URL('./cache/', import.meta.url);
const SALIDA = new URL('./cache/laliga.json', import.meta.url);

// Últimas 5 temporadas completas de LaLiga (código de football-data.co.uk).
const TEMPORADAS = ['2122', '2223', '2324', '2425', '2526'];

function codigoATemporada(codigo) {
  const inicio = 2000 + Number(codigo.slice(0, 2));
  const fin = 2000 + Number(codigo.slice(2, 4));
  return `${inicio}-${String(fin).slice(2)}`;
}

async function descargarSiHaceFalta(codigo) {
  const archivo = new URL(`SP1_${codigo}.csv`, CACHE_DIR);
  if (existsSync(archivo)) {
    return { texto: await readFile(archivo, 'utf8'), deCache: true };
  }
  const url = `${BASE_URL}/${codigo}/SP1.csv`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`No se pudo bajar ${url}: HTTP ${res.status}`);
  }
  const texto = await res.text();
  await writeFile(archivo, texto, 'utf8');
  return { texto, deCache: false };
}

function parsearFecha(crudo) {
  const partes = crudo.split('/');
  if (partes.length !== 3) return null;
  const [d, m, aCrudo] = partes;
  let a;
  if (aCrudo.length === 4) {
    a = aCrudo;
  } else if (aCrudo.length === 2) {
    a = `20${aCrudo}`; // football-data solo usa años 2000+ en este rango de temporadas
  } else {
    throw new Error(`Año con formato inesperado en fecha "${crudo}"`);
  }
  return `${a}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function parsearCSV(texto, temporada) {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const cabecera = lineas[0].split(',');
  const idx = {
    fecha: cabecera.indexOf('Date'),
    local: cabecera.indexOf('HomeTeam'),
    visitante: cabecera.indexOf('AwayTeam'),
    golesLocal: cabecera.indexOf('FTHG'),
    golesVisitante: cabecera.indexOf('FTAG'),
  };
  for (const [clave, valor] of Object.entries(idx)) {
    if (valor === -1) {
      throw new Error(`Falta la columna "${clave}" en el CSV de la temporada ${temporada}`);
    }
  }

  const partidos = [];
  for (let i = 1; i < lineas.length; i++) {
    const campos = lineas[i].split(',');
    if (campos.length < cabecera.length) continue; // fila basura/incompleta

    const fecha = parsearFecha(campos[idx.fecha]);
    const local = campos[idx.local]?.trim();
    const visitante = campos[idx.visitante]?.trim();
    const golesLocal = Number(campos[idx.golesLocal]);
    const golesVisitante = Number(campos[idx.golesVisitante]);

    if (!fecha || !local || !visitante) continue;
    if (!Number.isFinite(golesLocal) || !Number.isFinite(golesVisitante)) continue; // partido sin resultado (fila incompleta)

    if (golesLocal < 0 || golesVisitante < 0) {
      throw new Error(
        `Goles negativos en ${fecha} ${local} vs ${visitante}: ${golesLocal}-${golesVisitante} (temporada ${temporada})`
      );
    }

    partidos.push({ fecha, local, visitante, golesLocal, golesVisitante, temporada });
  }
  return partidos;
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });

  const todos = [];
  const resumen = [];

  for (const codigo of TEMPORADAS) {
    const temporada = codigoATemporada(codigo);
    const { texto, deCache } = await descargarSiHaceFalta(codigo);
    const partidos = parsearCSV(texto, temporada);
    todos.push(...partidos);
    resumen.push({
      temporada,
      partidos: partidos.length,
      desde: partidos[0]?.fecha,
      hasta: partidos[partidos.length - 1]?.fecha,
      fuente: deCache ? 'caché' : 'descarga',
    });
  }

  todos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  await writeFile(SALIDA, JSON.stringify(todos, null, 2), 'utf8');

  console.log('Resumen por temporada:');
  for (const r of resumen) {
    console.log(
      `  ${r.temporada}: ${r.partidos} partidos (${r.desde} a ${r.hasta}) [${r.fuente}]`
    );
  }
  console.log(`\nTotal: ${todos.length} partidos`);
  console.log(`Rango completo: ${todos[0].fecha} a ${todos[todos.length - 1].fecha}`);
  console.log(`Guardado en: ${fileURLToPath(SALIDA)}`);

  const nombres = todos.flatMap((p) => [p.local, p.visitante]);
  const sospechosos = nombresSospechosos(nombres);
  if (sospechosos.length > 0) {
    console.warn('\nPosibles inconsistencias de nombre de equipo:');
    for (const [a, b] of sospechosos) console.warn(`  "${a}" vs "${b}"`);
  } else {
    console.log('\nNombres de equipo: sin inconsistencias detectadas.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
