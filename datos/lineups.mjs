// Baja alineaciones y minutos históricos de LaLiga desde el dataset abierto
// de transfermarkt-datasets (CC0, github.com/dcaribou/transfermarkt-datasets),
// filtra a las mismas 5 temporadas de datos/historico.mjs, y los cruza con
// datos/cache/laliga.json por temporada+equipos.
//
// No pide nada que ya esté en caché. No toca api-sports.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { TRANSFERMARKT_A_FOOTBALL_DATA } from './equipos.mjs';

const BASE_URL = 'https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data';
const CACHE_DIR = new URL('./cache/', import.meta.url);
const SALIDA = new URL('./cache/alineaciones.json', import.meta.url);

const COMPETITION_ID = 'ES1'; // LaLiga en transfermarkt-datasets
const TEMPORADAS_TM = ['2021', '2022', '2023', '2024', '2025']; // season = año de inicio

function temporadaDesde(seasonTm) {
  const inicio = Number(seasonTm);
  return `${inicio}-${String(inicio + 1).slice(2)}`;
}

async function descargarSiHaceFalta(nombreArchivo) {
  const archivo = new URL(nombreArchivo, CACHE_DIR);
  if (existsSync(archivo)) {
    return readFile(archivo);
  }
  const url = `${BASE_URL}/${nombreArchivo}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`No se pudo bajar ${url}: HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(archivo, buffer);
  return buffer;
}

// Parser CSV mínimo con soporte de comillas (RFC4180): algunos nombres de
// jugador/club traen comas o comillas dentro del campo.
function parsearLineaCSV(linea) {
  const campos = [];
  let actual = '';
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (entreComillas) {
      if (c === '"') {
        if (linea[i + 1] === '"') {
          actual += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        actual += c;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === ',') {
      campos.push(actual);
      actual = '';
    } else {
      actual += c;
    }
  }
  campos.push(actual);
  return campos;
}

function parsearCSV(buffer) {
  const texto = gunzipSync(buffer).toString('utf8');
  const lineas = texto.split(/\r?\n/).filter((l) => l.length > 0);
  const cabecera = parsearLineaCSV(lineas[0]);
  const filas = [];
  for (let i = 1; i < lineas.length; i++) {
    const campos = parsearLineaCSV(lineas[i]);
    const fila = {};
    for (let j = 0; j < cabecera.length; j++) fila[cabecera[j]] = campos[j];
    filas.push(fila);
  }
  return filas;
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });

  console.log('Bajando games.csv.gz, game_lineups.csv.gz, appearances.csv.gz...');
  const [gamesBuf, lineupsBuf, appearancesBuf] = await Promise.all([
    descargarSiHaceFalta('games.csv.gz'),
    descargarSiHaceFalta('game_lineups.csv.gz'),
    descargarSiHaceFalta('appearances.csv.gz'),
  ]);

  const games = parsearCSV(gamesBuf);
  const juegosES1 = new Map(); // game_id -> { fecha, temporada, local, visitante }
  for (const g of games) {
    if (g.competition_id !== COMPETITION_ID) continue;
    if (!TEMPORADAS_TM.includes(g.season)) continue;
    const local = TRANSFERMARKT_A_FOOTBALL_DATA[g.home_club_name];
    const visitante = TRANSFERMARKT_A_FOOTBALL_DATA[g.away_club_name];
    if (!local || !visitante) {
      console.warn(`Equipo sin mapeo: "${g.home_club_name}" o "${g.away_club_name}" (game_id ${g.game_id})`);
      continue;
    }
    juegosES1.set(g.game_id, {
      fecha: g.date,
      temporada: temporadaDesde(g.season),
      local,
      visitante,
      localClubId: g.home_club_id,
      visitanteClubId: g.away_club_id,
    });
  }
  console.log(`Partidos de LaLiga 2021-2026 encontrados en games.csv: ${juegosES1.size}`);

  const lineups = parsearCSV(lineupsBuf);
  // clave: `${game_id}|${player_id}` -> { esTitular, posicion }
  const infoLineup = new Map();
  for (const l of lineups) {
    if (!juegosES1.has(l.game_id)) continue;
    infoLineup.set(`${l.game_id}|${l.player_id}`, {
      esTitular: l.type === 'starting_lineup',
      posicion: l.position || null,
      nombre: l.player_name,
      clubId: l.club_id,
    });
  }
  console.log(`Filas de convocatoria (titulares+banca) para esos partidos: ${infoLineup.size}`);

  const appearances = parsearCSV(appearancesBuf);
  const filas = [];
  let sinLineup = 0;
  for (const a of appearances) {
    const partido = juegosES1.get(a.game_id);
    if (!partido) continue;
    const clave = `${a.game_id}|${a.player_id}`;
    const lineup = infoLineup.get(clave);
    if (!lineup) {
      sinLineup++;
      continue;
    }
    const esLocal = lineup.clubId === partido.localClubId;
    const esVisitante = lineup.clubId === partido.visitanteClubId;
    if (!esLocal && !esVisitante) {
      console.warn(`club_id ${lineup.clubId} no coincide con local ni visitante en game_id ${a.game_id}`);
      continue;
    }
    filas.push({
      fecha: partido.fecha,
      temporada: partido.temporada,
      local: partido.local,
      visitante: partido.visitante,
      equipo: esLocal ? partido.local : partido.visitante,
      esLocal,
      jugadorId: a.player_id,
      jugador: lineup.nombre,
      posicion: lineup.posicion,
      esTitular: lineup.esTitular,
      minutos: Number(a.minutes_played) || 0,
      goles: Number(a.goals) || 0,
      asistencias: Number(a.assists) || 0,
    });
  }

  // Jugadores que estuvieron en la convocatoria pero nunca pisaron la cancha
  // (banca completa, 0 minutos) no aparecen en appearances.csv. Igual importan
  // para saber "quién estaba disponible": se agregan con minutos=0.
  const vistos = new Set(filas.map((f) => `${f.fecha}|${f.jugadorId}`));
  for (const [clave, lineup] of infoLineup) {
    const [gameId, playerId] = clave.split('|');
    const partido = juegosES1.get(gameId);
    if (!partido) continue;
    const clavePartido = `${partido.fecha}|${playerId}`;
    if (vistos.has(clavePartido)) continue;
    const esLocal = lineup.clubId === partido.localClubId;
    const esVisitante = lineup.clubId === partido.visitanteClubId;
    if (!esLocal && !esVisitante) continue;
    filas.push({
      fecha: partido.fecha,
      temporada: partido.temporada,
      local: partido.local,
      visitante: partido.visitante,
      equipo: esLocal ? partido.local : partido.visitante,
      esLocal,
      jugadorId: playerId,
      jugador: lineup.nombre,
      posicion: lineup.posicion,
      esTitular: lineup.esTitular,
      minutos: 0,
      goles: 0,
      asistencias: 0,
    });
  }

  filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
  await writeFile(SALIDA, JSON.stringify(filas, null, 2), 'utf8');

  const porTemporada = new Map();
  const partidosConDatos = new Set();
  for (const f of filas) {
    porTemporada.set(f.temporada, (porTemporada.get(f.temporada) ?? 0) + 1);
    partidosConDatos.add(`${f.fecha}|${f.local}|${f.visitante}`);
  }

  console.log('\nFilas jugador-partido por temporada:');
  for (const [temporada, cantidad] of [...porTemporada.entries()].sort()) {
    console.log(`  ${temporada}: ${cantidad} filas`);
  }
  console.log(`\nTotal filas: ${filas.length}`);
  console.log(`Partidos distintos con alineación: ${partidosConDatos.size} (de ${juegosES1.size} encontrados en games.csv)`);
  console.log(`Guardado en: ${fileURLToPath(SALIDA)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
