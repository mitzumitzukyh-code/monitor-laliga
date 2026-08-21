// Genera salida/web/index.html: el panel completo, un solo archivo, sin
// runtime de diseño ni framework. Seis pantallas (Inicio, Predicciones,
// Clasificación, Calidad, Cambios y la ficha de partido) sobre el sistema
// visual portado del diseño "Monitor eSports".
//
//   node salida/web/generar.mjs                 solo backtest (offline)
//   node --env-file=.env salida/web/generar.mjs backtest + partidos en vivo
//
// Sin .env funciona igual: la sección de próximos partidos muestra su estado
// vacío en vez de inventarse filas.
//
// Regla 1, otra vez y por escrito: todos los números salen de calcularlos en
// panel-datos.mjs sobre las predicciones reales. Ninguno va incrustado en la
// plantilla — ese era exactamente el problema del panel de la primera
// versión de Fase 5, y no se repite.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resumen } from './panel-datos.mjs';
import { estilos } from './panel-estilos.mjs';
import { cliente } from './panel-cliente.mjs';
import { escudosEnCache, equiposSinEscudoPosible } from '../../datos/escudos.mjs';
import {
  colorEquipo,
  rail,
  cabecera,
  franja,
  pie,
  vistaHome,
  vistaPreds,
  vistaBoard,
  vistaCalidad,
  vistaNews,
  vistaMatch,
} from './panel-vistas.mjs';

const RAIZ = new URL('../../', import.meta.url);
const SALIDA = new URL('./index.html', import.meta.url);

// --- datos en vivo (opcional) --------------------------------------------

// Supabase es opcional: si no hay .env o la red falla, el panel se genera
// igual y lo dice en la franja de estado.
async function cargarVivo() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { disponible: false, motivo: 'sin credenciales (corre con --env-file=.env)', partidos: [] };
  }
  try {
    const { seleccionar } = await import('../../datos/supabase.mjs');
    const [equipos, partidos, predicciones] = await Promise.all([
      seleccionar('teams', 'select=id,name'),
      seleccionar('fixtures', 'select=*&order=date.asc'),
      seleccionar('predictions', 'select=*'),
    ]);
    const nombre = new Map(equipos.map((e) => [e.id, e.name]));
    const predPorFixture = new Map(predicciones.map((p) => [p.fixture_id, p]));
    return {
      disponible: true,
      motivo: '',
      partidos: partidos.map((f) => {
        const pr = predPorFixture.get(f.id) ?? null;
        return {
          fecha: f.date,
          jornada: f.round,
          estado: f.status,
          local: nombre.get(f.home_team_id) ?? `#${f.home_team_id}`,
          visitante: nombre.get(f.away_team_id) ?? `#${f.away_team_id}`,
          golesLocal: f.home_goals,
          golesVisitante: f.away_goals,
          // Se normaliza al mismo nombre de campo que usa el resto del panel.
          probLocal: pr ? Number(pr.prob_local) : null,
          probEmpate: pr ? Number(pr.prob_empate) : null,
          probVisitante: pr ? Number(pr.prob_visitante) : null,
          lh: pr ? Number(pr.lh) : null,
          la: pr ? Number(pr.la) : null,
        };
      }),
    };
  } catch (e) {
    return { disponible: false, motivo: `Supabase no respondió: ${e.message.slice(0, 90)}`, partidos: [] };
  }
}

// --- plantilla -----------------------------------------------------------

function fechaLarga(d = new Date()) {
  return d.toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' });
}

// JSON incrustado en un <script>. Se escapan las secuencias que podrían
// cerrar la etiqueta o abrir un comentario HTML dentro del script.
function jsonSeguro(objeto) {
  return JSON.stringify(objeto)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function documento({ r, vivo, escudos, sinEscudo, generado }) {
  const payload = {
    ...r.payload,
    escudos: Object.fromEntries(
      [...escudos.entries()].map(([nombre, e]) => [nombre, `data:${e.mime};base64,${e.base64}`])
    ),
    colores: Object.fromEntries(r.payload.equipos.map((e) => [e, colorEquipo(e)])),
    vivo,
  };

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Monitor LaLiga</title>
<meta name="description" content="Probabilidades de LaLiga calculadas con Elo y Dixon-Coles, con la nota del motor contra ${r.global.n} partidos reales.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>${estilos()}</style>
</head>
<body>
  <div class="app">
    ${rail()}
    <div class="col">
    ${cabecera({ generado })}
    ${franja({ vivo, escudosEnCache: escudos.size, sinEscudo })}
    <main>
      ${vistaHome({ global: r.global, referencias: r.referencias })}
      ${vistaPreds({ temporadas: r.payload.temporadas })}
      ${vistaBoard({ clasificacion: r.clasificacion, escudos })}
      ${vistaCalidad({
        global: r.global,
        referencias: r.referencias,
        porTemporada: r.porTemporada,
        coeficientes: r.coeficientes,
      })}
      ${vistaNews({ cambios: r.cambios })}
      ${vistaMatch()}
    </main>
    ${pie()}
    </div>
  </div>
<script>window.__PANEL__ = ${jsonSeguro(payload)};</script>
<script>${cliente()}</script>
</body>
</html>
`;
}

// --- main ----------------------------------------------------------------

async function main() {
  const preds = JSON.parse(await readFile(new URL('juez/resultados.json', RAIZ), 'utf8'));
  if (!Array.isArray(preds) || preds.length === 0) {
    throw new Error('juez/resultados.json está vacío. Corre el backtest primero.');
  }

  const [vivo, escudos] = await Promise.all([cargarVivo(), escudosEnCache()]);
  const r = resumen(preds, { raiz: fileURLToPath(RAIZ) });

  const sinEscudo = equiposSinEscudoPosible(r.payload.equipos);
  const html = documento({ r, vivo, escudos, sinEscudo, generado: fechaLarga() });
  await writeFile(SALIDA, html);

  const kb = Math.round(html.length / 1024);
  console.log(`panel escrito: salida/web/index.html (${kb} KB)`);
  console.log(`  ${r.global.n} predicciones · acierto ${(r.global.acierto * 100).toFixed(2)} % · brier ${r.global.brier.toFixed(4)}`);
  console.log(`  clasificación: ${Object.keys(r.clasificacion).length} temporadas · cambios: ${r.cambios.length} commits`);
  console.log(
    escudos.size > 0
      ? `  escudos: ${escudos.size} en caché`
      : `  escudos: ninguno en caché, se usan iniciales (${sinEscudo.length} equipos del histórico no tienen escudo posible)`
  );
  if (!vivo.disponible) console.log(`  en vivo: ${vivo.motivo}`);
  else console.log(`  en vivo: ${vivo.partidos.length} partidos`);
}

// Solo corre cuando se invoca directamente. Importarlo (por ejemplo desde
// una prueba) no dispara la generación.
if (import.meta.url === `file://${process.argv[1]}`) await main();

export { documento, cargarVivo };
