// Genera salida/web/index.html: un HTML claro, autocontenido, sin dependencias
// externas ni runtime de diseño. Todos los números salen de calcularlos acá --
// ninguno va escrito a mano en la plantilla (ese era el problema del panel
// anterior: los valores estaban incrustados y no se recalculaban nunca).
//
//   node salida/web/generar.mjs                 solo backtest (offline)
//   node --env-file=.env salida/web/generar.mjs backtest + partidos en vivo
//
// Sin .env funciona igual: la sección de "en vivo" muestra su estado vacío.

import { readFile, writeFile } from 'node:fs/promises';
import { metricas, tablaPorTemporada, brierScore, logLoss } from '../../juez/notas.mjs';
import { RHO, SEMIVIDA_JORNADAS, PESO_PRIOR_PARTIDOS, JORNADAS_DESCARTADAS } from '../../config.mjs';

const RAIZ = new URL('../../', import.meta.url);

// --- datos ---------------------------------------------------------------

async function cargarBacktest() {
  const preds = JSON.parse(await readFile(new URL('juez/resultados.json', RAIZ), 'utf8'));
  return {
    preds,
    global: metricas(preds),
    porTemporada: tablaPorTemporada(preds),
    referencias: referencias(preds),
  };
}

// Las dos referencias contra las que se mide el modelo. Se calculan sobre las
// MISMAS predicciones, no se copian de ningún lado.
function referencias(preds) {
  // 1) Adivinar sin datos: 1/3 - 1/3 - 1/3 en todos los partidos.
  const ciego = preds.map((p) => ({
    ...p,
    probLocal: 1 / 3,
    probEmpate: 1 / 3,
    probVisitante: 1 / 3,
  }));
  // 2) Apostar siempre al local: acierta cuando el resultado real fue local.
  const locales = preds.filter((p) => p.resultadoReal === 'local').length;
  return {
    ciegoBrier: brierScore(ciego),
    ciegoLogLoss: logLoss(ciego),
    siempreLocal: locales / preds.length,
  };
}

// Supabase es opcional: si no hay .env o la red falla, el panel se genera igual.
async function cargarVivo() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { disponible: false, motivo: 'sin credenciales (corre con --env-file=.env)' };
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
      partidos: partidos.map((f) => ({
        fecha: f.date,
        jornada: f.round,
        estado: f.status,
        local: nombre.get(f.home_team_id) ?? `#${f.home_team_id}`,
        visitante: nombre.get(f.away_team_id) ?? `#${f.away_team_id}`,
        golesLocal: f.home_goals,
        golesVisitante: f.away_goals,
        pred: predPorFixture.get(f.id) ?? null,
      })),
    };
  } catch (e) {
    return { disponible: false, motivo: `Supabase no respondió: ${e.message.slice(0, 90)}` };
  }
}

// --- formato -------------------------------------------------------------

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
const num = (x, d = 4) => x.toFixed(d);
const signo = (x, d = 4) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(d);

function fechaLarga(d = new Date()) {
  return d.toLocaleString('es-VE', { dateStyle: 'long', timeStyle: 'short' });
}

// --- plantilla -----------------------------------------------------------

function kpi(etiqueta, valor, sufijo, comparacion, pie) {
  return `
      <div class="kpi">
        <div class="etiqueta">${esc(etiqueta)}</div>
        <div class="cifra">${esc(valor)}${sufijo ? `<span class="sufijo">${esc(sufijo)}</span>` : ''}</div>
        ${comparacion ? `<div class="comparacion">${comparacion}</div>` : ''}
        ${pie ? `<div class="pie">${esc(pie)}</div>` : ''}
      </div>`;
}

function filasTemporada(tabla) {
  return tabla
    .map((t) => {
      const m = t.modelo;
      const total = t.temporada === 'TOTAL';
      return `
        <tr${total ? ' class="total"' : ''}>
          <td class="mono">${esc(t.temporada)}</td>
          <td class="mono num">${m.n}</td>
          <td class="mono num">${pct(m.acierto)}</td>
          <td class="mono num">${num(m.brier)}</td>
          <td class="mono num">${num(m.logLoss)}</td>
          <td class="barra-celda">
            <div class="barra"><div class="relleno" style="width:${(m.acierto * 100).toFixed(1)}%"></div></div>
          </td>
        </tr>`;
    })
    .join('');
}

function seccionVivo(vivo) {
  if (!vivo.disponible) {
    return `
      <div class="vacio">
        <div class="vacio-titulo">Sin partidos en vivo</div>
        <div class="vacio-texto">${esc(vivo.motivo)}</div>
      </div>`;
  }
  if (vivo.partidos.length === 0) {
    return `
      <div class="vacio">
        <div class="vacio-titulo">Sin partidos guardados</div>
        <div class="vacio-texto">La base respondió, pero no hay filas en <code>fixtures</code> todavía.</div>
      </div>`;
  }
  return `
      <div class="tabla-scroll">
      <table>
        <thead>
          <tr><th>Fecha</th><th>J</th><th>Partido</th><th>Estado</th><th class="num">Local</th><th class="num">Empate</th><th class="num">Visitante</th><th class="num">Marcador</th></tr>
        </thead>
        <tbody>
          ${vivo.partidos
            .map((p) => {
              const pr = p.pred;
              const marcador =
                p.golesLocal == null || p.golesVisitante == null ? '—' : `${p.golesLocal}–${p.golesVisitante}`;
              const celda = (v) => (pr ? `<td class="mono num">${pct(v)}</td>` : '<td class="mono num apagado">—</td>');
              // El favorito se marca sobre la probabilidad más alta de las tres.
              const maxima = pr ? Math.max(pr.prob_local, pr.prob_empate, pr.prob_visitante) : null;
              const marca = (v) => (pr && v === maxima ? ' favorito' : '');
              return `
          <tr>
            <td class="mono">${esc(String(p.fecha).slice(0, 10))}</td>
            <td class="mono num">${esc(p.jornada ?? '—')}</td>
            <td><strong>${esc(p.local)}</strong> <span class="apagado">vs</span> ${esc(p.visitante)}</td>
            <td><span class="chip">${esc(p.estado ?? '—')}</span></td>
            ${pr ? `<td class="mono num${marca(pr.prob_local)}">${pct(pr.prob_local)}</td>` : celda()}
            ${pr ? `<td class="mono num${marca(pr.prob_empate)}">${pct(pr.prob_empate)}</td>` : celda()}
            ${pr ? `<td class="mono num${marca(pr.prob_visitante)}">${pct(pr.prob_visitante)}</td>` : celda()}
            <td class="mono num">${esc(marcador)}</td>
          </tr>`;
            })
            .join('')}
        </tbody>
      </table>
      </div>`;
}

function plantilla({ bt, vivo }) {
  const g = bt.global;
  const r = bt.referencias;
  const mejoraBrier = g.brier - r.ciegoBrier;
  const mejoraAcierto = g.acierto - r.siempreLocal;
  const mejoraLog = g.logLoss - r.ciegoLogLoss;
  // Cuánto del camino entre "adivinar" y "perfecto (0)" recorre el modelo.
  const avance = ((r.ciegoBrier - g.brier) / r.ciegoBrier) * 100;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Monitor LaLiga</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --fondo: #ffffff;
    --fondo-suave: #f7f6f4;
    --tinta: #171615;
    --tinta-media: #55504e;
    --tinta-suave: #8a8481;
    --linea: rgba(23,22,21,0.12);
    --linea-fuerte: rgba(23,22,21,0.42);
    --acento: #c4381f;
    --acento-claro: #ff563c;
    --verde: #1f7a4d;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--fondo);
    color: var(--tinta);
    font-family: 'Archivo', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    -webkit-font-smoothing: antialiased;
  }
  .mono, .cifra, .etiqueta, code { font-family: 'IBM Plex Mono', 'Consolas', monospace; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .apagado { color: var(--tinta-suave); }

  header {
    display: flex; align-items: baseline; justify-content: space-between;
    flex-wrap: wrap; gap: 12px;
    border-bottom: 2px solid var(--linea-fuerte);
    padding: 16px 24px;
  }
  .marca { font-family: 'IBM Plex Mono', monospace; font-size: 13px; font-weight: 600; letter-spacing: 0.14em; }
  .sub { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.08em; color: var(--tinta-suave); }

  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); border-bottom: 2px solid var(--linea-fuerte); }
  .kpi { padding: 20px 24px; border-right: 1px solid var(--linea); }
  .kpi:last-child { border-right: 0; }
  .etiqueta { font-size: 11px; letter-spacing: 0.12em; color: var(--tinta-suave); margin-bottom: 10px; }
  .cifra { font-size: clamp(26px, 3.4vw, 40px); font-weight: 500; line-height: 1; font-variant-numeric: tabular-nums; }
  .sufijo { font-size: 20px; color: var(--tinta-suave); margin-left: 2px; }
  .comparacion { margin-top: 10px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; }
  .mejor { color: var(--verde); font-weight: 600; }
  .peor { color: var(--acento); font-weight: 600; }
  .pie { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--tinta-suave); margin-top: 6px; }

  section { border-bottom: 1px solid var(--linea); padding: 24px; }
  h2 { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.14em; color: var(--tinta-suave);
       text-transform: uppercase; margin: 0 0 16px; font-weight: 600; }

  /* Las tablas anchas (la de en vivo tiene 8 columnas) hacen scroll dentro de
     su propia caja: el body nunca desborda horizontalmente en el teléfono. */
  .tabla-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 520px; }
  th { text-align: left; font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: 0.1em;
       text-transform: uppercase; color: var(--tinta-suave); font-weight: 600;
       border-bottom: 1px solid var(--linea-fuerte); padding: 8px 10px; }
  th.num { text-align: right; }
  td { padding: 9px 10px; border-bottom: 1px solid var(--linea); }
  tbody tr:hover { background: var(--fondo-suave); }
  .favorito { color: var(--acento); font-weight: 600; }
  tr.total td { border-top: 2px solid var(--linea-fuerte); border-bottom: 0; font-weight: 600; background: var(--fondo-suave); }

  .barra-celda { width: 28%; min-width: 110px; }
  .barra { height: 6px; background: rgba(23,22,21,0.10); position: relative; }
  .relleno { position: absolute; left: 0; top: 0; bottom: 0; background: var(--acento-claro); }

  .chip { font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: 0.08em;
          border: 1px solid var(--linea-fuerte); padding: 2px 7px; text-transform: uppercase; }

  .vacio { border: 1px dashed var(--linea-fuerte); padding: 28px; text-align: center; background: var(--fondo-suave); }
  .vacio-titulo { font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 6px; }
  .vacio-texto { font-size: 13px; color: var(--tinta-media); }
  code { background: rgba(23,22,21,0.06); padding: 1px 5px; font-size: 12px; }

  .params { display: flex; flex-wrap: wrap; gap: 8px; }
  .param { border: 1px solid var(--linea); padding: 8px 12px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; }
  .param b { color: var(--tinta); font-weight: 600; }
  .param span { color: var(--tinta-suave); }

  footer { padding: 20px 24px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--tinta-suave); line-height: 1.7; }
  @media (max-width: 640px) {
    .barra-celda { display: none; }
    header, section, .kpi, footer { padding-left: 16px; padding-right: 16px; }
  }
</style>
</head>
<body>

<header>
  <div class="marca">MONITOR LALIGA</div>
  <div class="sub">DIXON–COLES · GENERADO ${esc(fechaLarga().toUpperCase())}</div>
</header>

<div class="kpis">
${kpi(
  'ACIERTO',
  pct(g.acierto),
  '',
  `<span class="${mejoraAcierto >= 0 ? 'mejor' : 'peor'}">${signo(mejoraAcierto * 100, 1)} pts</span><span class="apagado">vs ${pct(r.siempreLocal)} = siempre al local</span>`,
  'clase más probable acertada'
)}
${kpi(
  'BRIER',
  num(g.brier),
  '',
  `<span class="${mejoraBrier <= 0 ? 'mejor' : 'peor'}">${signo(mejoraBrier)}</span><span class="apagado">vs ${num(r.ciegoBrier)} = adivinar sin datos</span>`,
  `${avance.toFixed(1)}% mejor que el azar · más bajo es mejor`
)}
${kpi(
  'LOG LOSS',
  num(g.logLoss),
  '',
  `<span class="${mejoraLog <= 0 ? 'mejor' : 'peor'}">${signo(mejoraLog)}</span><span class="apagado">vs ${num(r.ciegoLogLoss)} = ln(3)</span>`,
  'más bajo es mejor'
)}
${kpi(
  'PREDICCIONES',
  String(g.n),
  '',
  '',
  // tablaPorTemporada() agrega una fila TOTAL al final: no es una temporada.
  `${bt.porTemporada.filter((t) => t.temporada !== 'TOTAL').length} temporadas · backtest sin fuga temporal`
)}
</div>

<section>
  <h2>Nota por temporada</h2>
  <div class="tabla-scroll">
  <table>
    <thead>
      <tr><th>Temporada</th><th class="num">N</th><th class="num">Acierto</th><th class="num">Brier</th><th class="num">Log loss</th><th></th></tr>
    </thead>
    <tbody>
      ${filasTemporada(bt.porTemporada)}
    </tbody>
  </table>
  </div>
</section>

<section>
  <h2>Partidos en vivo</h2>
  ${seccionVivo(vivo)}
</section>

<section>
  <h2>Coeficientes activos</h2>
  <div class="params">
    <div class="param"><b>rho</b> <span>${RHO}</span></div>
    <div class="param"><b>semivida</b> <span>${SEMIVIDA_JORNADAS} jornadas</span></div>
    <div class="param"><b>peso prior</b> <span>${PESO_PRIOR_PARTIDOS} partidos</span></div>
    <div class="param"><b>jornadas descartadas</b> <span>${JORNADAS_DESCARTADAS}</span></div>
    <div class="param"><b>ajuste de ausencias</b> <span>botado (no gana el puesto)</span></div>
  </div>
</section>

<footer>
  Los porcentajes salen del cálculo Dixon–Coles sobre goles esperados. Ningún número de esta página
  está escrito a mano: todos se recalculan al correr <code>node salida/web/generar.mjs</code>.<br>
  Backtest sobre ${g.n} predicciones reales, cada una calculada usando solo jornadas anteriores.
</footer>

</body>
</html>
`;
}

// --- main ----------------------------------------------------------------

const bt = await cargarBacktest();
const vivo = await cargarVivo();
const html = plantilla({ bt, vivo });
const destino = new URL('index.html', import.meta.url);
await writeFile(destino, html, 'utf8');

console.log('panel generado:', destino.pathname);
console.log(`  backtest: ${bt.global.n} predicciones, acierto ${pct(bt.global.acierto)}, brier ${num(bt.global.brier)}`);
console.log(
  vivo.disponible ? `  en vivo: ${vivo.partidos.length} partidos desde Supabase` : `  en vivo: no disponible — ${vivo.motivo}`
);
