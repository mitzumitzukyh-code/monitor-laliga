// Las seis vistas del panel, en HTML. Cero cálculo acá dentro: todo lo que
// se pinta llega ya calculado desde panel-datos.mjs.
//
// Reparto entre servidor y navegador:
//   - Calidad, Cambios y Clasificación se generan enteras acá (son tablas
//     agregadas, no cambian con la interacción salvo el cambio de pestaña).
//   - Inicio, Predicciones y Ficha son cascarones que el JS del cliente
//     rellena desde la carga útil compacta. 1.600 partidos como HTML serían
//     megabytes; como datos son 218 KB y además se pueden filtrar y ordenar.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pct = (x, d = 1) => (x * 100).toFixed(d) + ' %';
const num = (x, d = 4) => Number(x).toFixed(d);
const signo = (x, d = 3) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(d);

// Iniciales de un nombre corto: "Ath Bilbao" -> "AB", "Barcelona" -> "BA".
export function iniciales(nombre) {
  const palabras = String(nombre).trim().split(/\s+/);
  if (palabras.length >= 2) return (palabras[0][0] + palabras[1][0]).toUpperCase();
  return String(nombre).slice(0, 2).toUpperCase();
}

// Color estable por equipo, derivado del nombre. No es identidad de marca
// (para eso está el escudo real): es para que 26 fichas de iniciales no se
// vean como 26 cuadros grises iguales. Determinista, así que el mismo equipo
// tiene el mismo color en todas las pantallas y entre corridas.
export function colorEquipo(nombre) {
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) % 360;
  return `hsl(${h} 58% 62%)`;
}

// Escudo real si está en caché, iniciales si no. El diseño original hacía
// exactamente esto y es lo correcto: 6 de los 26 equipos del histórico ya no
// están en la liga y nunca van a tener crest por esta vía.
export function escudoHtml(nombre, escudos, clase = '') {
  const e = escudos.get(nombre);
  const cls = clase ? ` ${clase}` : '';
  if (!e) {
    const c = colorEquipo(nombre);
    return `<span class="escudo${cls}" style="color:${c};border-color:color-mix(in srgb, ${c} 45%, transparent);background:color-mix(in srgb, ${c} 12%, transparent)" aria-hidden="true">${esc(iniciales(nombre))}</span>`;
  }
  return `<span class="escudo${cls}"><img src="data:${e.mime};base64,${e.base64}" alt=""></span>`;
}

const ICONOS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-6h5v6"/>',
  preds: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/>',
  board: '<path d="M7 4h10v6a5 5 0 0 1-10 0V4Z"/><path d="M7 5.5H4.2v1.8A3.2 3.2 0 0 0 7.4 10.5"/><path d="M17 5.5h2.8v1.8a3.2 3.2 0 0 1-3.2 3.2"/><path d="M12 15v3.5M8.5 20.5h7"/>',
  calidad: '<path d="M3 19h18"/><path d="M4 15l5-5 4 3.5 6.5-7"/><path d="M17 5.5h3v3"/>',
  news: '<path d="M4 8h13l-3-3"/><path d="M20 16H7l3 3"/>',
};

// El segundo texto es el del rail: lleva guion blando (U+00AD) para partir
// dentro de los 92px sin recortar. El de la nav de arriba va entero.
const VISTAS = [
  ['home', 'INICIO', 'INICIO'],
  ['preds', 'PREDICCIONES', 'PREDIC\u00ADCIONES'],
  ['board', 'CLASIFICACIÓN', 'CLASIFI\u00ADCACIÓN'],
  ['calidad', 'CALIDAD', 'CALIDAD'],
  ['news', 'CAMBIOS', 'CAMBIOS'],
];

function icono(clave) {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[clave]}</svg>`;
}

export function rail() {
  const botones = VISTAS.map(
    ([id, etq, corta]) =>
      `<button type="button" class="rail-btn" data-ir="${id}"${id === 'home' ? ' aria-current="page"' : ''} title="${esc(etq)}">${icono(id)}<span>${esc(corta)}</span></button>`
  ).join('\n      ');
  return `<aside class="rail">
      ${botones}
    </aside>`;
}

export function cabecera({ generado }) {
  const nav = VISTAS.map(
    ([id, etq]) =>
      `<button type="button" class="nav-btn" data-ir="${id}"${id === 'home' ? ' aria-current="page"' : ''}>${esc(etq)}</button>`
  ).join('\n        ');
  return `<header class="barra">
      <div class="marca">
        <span class="marca-sigla">ML</span>
        <div>
          <div class="marca-nombre">MONITOR <em>LALIGA</em></div>
          <div class="marca-bajada">Cálculo, no opinión</div>
        </div>
      </div>
      <nav class="principal" aria-label="Secciones">
        ${nav}
      </nav>
      <div class="sello">
        <div class="sello-etq">Panel generado</div>
        <div class="sello-val">${esc(generado)}</div>
      </div>
    </header>`;
}

export function franja({ vivo, escudosEnCache, sinEscudo }) {
  const partes = [];
  if (!vivo.disponible) {
    partes.push(
      `<div class="franja aviso"><span class="punto" style="background:var(--aviso)"></span>SOLO HISTÓRICO — ${esc(vivo.motivo)}. Las pantallas de próximos partidos muestran su estado vacío.</div>`
    );
  } else {
    partes.push(
      `<div class="franja ok"><span class="punto" style="background:var(--ok)"></span>EN VIVO — ${vivo.partidos.length} partidos leídos de Supabase.</div>`
    );
  }
  if (escudosEnCache === 0 && sinEscudo.length > 0) {
    partes.push(
      `<div class="franja"><span class="punto" style="background:var(--tinta-apagada)"></span>Sin escudos en caché: se usan iniciales. Para bajarlos, <code>node --env-file=.env datos/escudos.mjs</code></div>`
    );
  }
  return partes.join('\n    ');
}

export function pie() {
  return `<footer class="pie">
      <span>Monitor LaLiga · un solo dueño, sin cuentas</span>
      <span>Sin apuestas · sin cuotas · solo cálculo</span>
    </footer>`;
}

// --- Inicio --------------------------------------------------------------

export function vistaHome({ global, referencias }) {
  const g = global;
  const r = referencias;
  const mejoraBrier = r.ciegoBrier - g.brier;
  const avance = (mejoraBrier / r.ciegoBrier) * 100;

  return `<section class="vista" data-vista="home">
      <div class="encabezado">
        <div>
          <h1 class="titulo">Estado del motor</h1>
          <p class="bajada">Nota puesta contra ${g.n.toLocaleString('es')} partidos reales de LaLiga, cinco temporadas. Cada número de esta pantalla sale de recalcularlo sobre esas mismas predicciones.</p>
        </div>
      </div>

      <div class="rejilla k4">
        <div class="tarjeta">
          <div class="kpi-etq">Acierto</div>
          <div class="kpi-cifra acento">${pct(g.acierto, 2)}</div>
          <div class="kpi-pie">Adivinar 1/3 da 33,33 % · siempre local da ${pct(r.siempreLocal, 2)}</div>
        </div>
        <div class="tarjeta">
          <div class="kpi-etq">Brier</div>
          <div class="kpi-cifra">${num(g.brier)}</div>
          <div class="kpi-pie">Ciego ${num(r.ciegoBrier)} · mejora ${num(mejoraBrier)} (${avance.toFixed(1)} % del camino)</div>
        </div>
        <div class="tarjeta">
          <div class="kpi-etq">Log loss</div>
          <div class="kpi-cifra">${num(g.logLoss)}</div>
          <div class="kpi-pie">Ciego ${num(r.ciegoLogLoss)} = ln(3). Por debajo es mejor que adivinar.</div>
        </div>
        <div class="tarjeta">
          <div class="kpi-etq">Predicciones</div>
          <div class="kpi-cifra">${g.n.toLocaleString('es')}</div>
          <div class="kpi-pie">Backtest cronológico, sin fuga temporal</div>
        </div>
      </div>

      <div class="rotulo">Próximos partidos</div>
      <div id="proximos"></div>

      <div class="con-lateral" style="margin-top:26px">
        <div>
          <div class="rotulo" style="margin-top:0">Últimos partidos con nota</div>
          <div class="rejilla k2" id="ultimos"></div>
        </div>
        <div>
          <div class="rotulo" style="margin-top:0">La regla de la casa</div>
          <div class="tarjeta">
            <p style="margin:0 0 12px;color:var(--tinta-suave)">Los porcentajes salen solo del cálculo: Elo para las fuerzas de ataque y defensa, Dixon-Coles para convertirlas en probabilidad de local, empate y visitante.</p>
            <p style="margin:0 0 12px;color:var(--tinta-suave)">Ningún modelo de lenguaje produce un número que llegue a esta pantalla.</p>
            <p style="margin:0;color:var(--tinta-apagada);font-size:12px">No hay cuotas de casas de apuestas en ninguna parte del proyecto: no existe fuente gratis y nunca se usaron para predecir.</p>
          </div>
          <div class="rotulo">Aciertos y fallos recientes</div>
          <div class="tarjeta" id="recientes"></div>
        </div>
      </div>
    </section>`;
}

// --- Predicciones --------------------------------------------------------

export function vistaPreds({ temporadas }) {
  const pastillas = ['todas', ...temporadas]
    .map(
      (t) =>
        `<button type="button" class="pastilla" data-temporada="${esc(t)}" aria-pressed="${t === 'todas'}">${esc(t === 'todas' ? 'TODAS' : t)}</button>`
    )
    .join('\n        ');

  return `<section class="vista" data-vista="preds" hidden>
      <div class="encabezado">
        <div>
          <h1 class="titulo">Predicciones</h1>
          <p class="bajada">Las tres probabilidades de cada partido, el marcador real y si el favorito del motor acertó. Click en una fila para abrir la ficha.</p>
        </div>
        <div class="sello">
          <div class="sello-etq">Mostrando</div>
          <div class="sello-val" id="preds-conteo">—</div>
        </div>
      </div>

      <div class="filtros" style="margin-bottom:16px">
        ${pastillas}
      </div>

      <div class="tabla tabla-scroll">
        <table>
          <thead>
            <tr>
              <th><button type="button" data-orden="fecha">Fecha</button></th>
              <th class="num">J</th>
              <th>Partido</th>
              <th class="num"><button type="button" data-orden="local">Local</button></th>
              <th class="num">Empate</th>
              <th class="num"><button type="button" data-orden="visitante">Visitante</button></th>
              <th class="num"><button type="button" data-orden="confianza">Confianza</button></th>
              <th class="num">Marcador</th>
              <th>Nota</th>
            </tr>
          </thead>
          <tbody id="preds-cuerpo"></tbody>
        </table>
      </div>
      <div style="margin-top:14px;text-align:center">
        <button type="button" class="pastilla" id="preds-mas" hidden>Mostrar más</button>
      </div>
    </section>`;
}

// --- Clasificación -------------------------------------------------------

export function vistaBoard({ clasificacion, escudos }) {
  const temporadas = Object.keys(clasificacion).sort();
  const pestanas = temporadas
    .map(
      (t, i) =>
        `<button type="button" class="pastilla" data-board="${esc(t)}" aria-pressed="${i === temporadas.length - 1}">${esc(t)}</button>`
    )
    .join('\n        ');

  const tablas = temporadas
    .map((t, i) => {
      const filas = clasificacion[t]
        .map((f, idx) => {
          const tend =
            f.tendencia === null
              ? '<span class="apagado">sin historial</span>'
              : `<span class="${f.tendencia >= 0 ? 'pos' : 'neg'}">${f.tendencia >= 0 ? '▲' : '▼'} ${Math.abs(f.tendencia).toFixed(3)}</span>`;
          return `<tr>
                <td class="mono apagado num">${idx + 1}</td>
                <td><div class="equipo-celda">${escudoHtml(f.equipo, escudos, 'sm')}<span>${esc(f.equipo)}</span></div></td>
                <td class="mono num">${f.partidas}</td>
                <td class="mono num">${f.ataqueCasa.toFixed(2)}</td>
                <td class="mono num">${f.defensaCasa.toFixed(2)}</td>
                <td class="mono num">${f.ataqueFuera.toFixed(2)}</td>
                <td class="mono num">${f.defensaFuera.toFixed(2)}</td>
                <td class="mono num"><b>${signo(f.diferencia)}</b></td>
                <td class="mono num">${tend}</td>
              </tr>`;
        })
        .join('\n              ');

      return `<div class="tabla tabla-scroll" data-board-tabla="${esc(t)}"${i === temporadas.length - 1 ? '' : ' hidden'}>
          <table>
            <thead>
              <tr>
                <th class="num">#</th>
                <th>Equipo</th>
                <th class="num">PJ</th>
                <th class="num">Ataque casa</th>
                <th class="num">Defensa casa</th>
                <th class="num">Ataque fuera</th>
                <th class="num">Defensa fuera</th>
                <th class="num">Dif. esperada</th>
                <th class="num">vs arranque</th>
              </tr>
            </thead>
            <tbody>
              ${filas}
            </tbody>
          </table>
        </div>`;
    })
    .join('\n      ');

  return `<section class="vista" data-vista="board" hidden>
      <div class="encabezado">
        <div>
          <h1 class="titulo">Clasificación por fuerzas</h1>
          <p class="bajada">No es la tabla de puntos: son las fuerzas de ataque y defensa que el motor le atribuye a cada equipo al cierre de la temporada, calculadas con decaimiento exponencial sobre todo el historial anterior. 1,00 es exactamente el promedio de la liga.</p>
        </div>
      </div>

      <div class="filtros" style="margin-bottom:16px">
        ${pestanas}
      </div>

      ${tablas}

      <div class="rotulo">Cómo leer esta tabla</div>
      <div class="tarjeta">
        <ul class="puntos">
          <li><b>Ataque casa 1,20</b> significa que ese equipo mete un 20 % más de goles en casa que un equipo promedio de la liga.</li>
          <li><b>Defensa casa 0,80</b> significa que concede un 20 % menos de lo que concedería un equipo promedio. Más bajo es mejor.</li>
          <li><b>Dif. esperada</b> es la diferencia de goles por partido que el motor predeciría contra un rival exactamente promedio, promediando el escenario de casa y el de fuera. Es la forma de ordenar cuatro coeficientes con un solo número sin inventar un rating.</li>
          <li><b>vs arranque</b> compara esa misma diferencia contra la que el equipo tenía el primer día de la temporada. Los recién ascendidos salen «sin historial» porque no hay contra qué compararlos.</li>
        </ul>
      </div>
    </section>`;
}

// --- Calidad -------------------------------------------------------------

export function vistaCalidad({ global, referencias, porTemporada, coeficientes }) {
  const g = global;
  const r = referencias;

  const filas = porTemporada
    .map((t) => {
      const m = t.modelo;
      const total = t.temporada === 'TOTAL';
      const mejoraCiego = r.ciegoBrier - m.brier;
      return `<tr${total ? ' class="total"' : ''}>
            <td class="mono">${esc(t.temporada)}</td>
            <td class="mono num">${m.n}</td>
            <td class="mono num">${pct(m.acierto, 2)}</td>
            <td class="mono num">${num(m.brier)}</td>
            <td class="mono num">${num(m.logLoss)}</td>
            <td class="mono num ${mejoraCiego >= 0 ? 'pos' : 'neg'}">${signo(mejoraCiego, 4)}</td>
          </tr>`;
    })
    .join('\n          ');

  const comparaciones = [
    {
      nombre: 'Adivinar 1/3 – 1/3 – 1/3',
      detalle: 'Sin mirar un solo dato. Es el piso: cualquier motor que no le gane a esto no sirve para nada.',
      brier: r.ciegoBrier,
      acierto: r.ciegoAcierto,
    },
    {
      nombre: 'Apostar siempre al local',
      detalle: 'La ventaja de campo sin modelo. Sorprendentemente difícil de superar en acierto bruto.',
      brier: null,
      acierto: r.siempreLocal,
    },
  ]
    .map((c) => {
      const dAcierto = g.acierto - c.acierto;
      const dBrier = c.brier === null ? null : c.brier - g.brier;
      return `<tr>
            <td><b>${esc(c.nombre)}</b><div class="kpi-pie" style="margin-top:4px">${esc(c.detalle)}</div></td>
            <td class="mono num">${pct(c.acierto, 2)}</td>
            <td class="mono num ${dAcierto >= 0 ? 'pos' : 'neg'}">${(dAcierto >= 0 ? '+' : '−') + Math.abs(dAcierto * 100).toFixed(2)} pp</td>
            <td class="mono num">${c.brier === null ? '<span class="apagado">—</span>' : num(c.brier)}</td>
            <td class="mono num ${dBrier === null ? '' : dBrier >= 0 ? 'pos' : 'neg'}">${dBrier === null ? '<span class="apagado">—</span>' : signo(dBrier, 4)}</td>
          </tr>`;
    })
    .join('\n          ');

  const coefs = [
    ['RHO', coeficientes.RHO, 'Corrección Dixon-Coles para marcadores bajos'],
    ['SEMIVIDA_JORNADAS', coeficientes.SEMIVIDA_JORNADAS, 'Vida media del decaimiento de fuerzas, en jornadas del propio equipo'],
    ['PESO_PRIOR_PARTIDOS', coeficientes.PESO_PRIOR_PARTIDOS, 'Partidos fantasma con el promedio de liga (suavizado bayesiano)'],
    ['JORNADAS_DESCARTADAS', coeficientes.JORNADAS_DESCARTADAS, 'Jornadas de arranque que el backtest no puntúa'],
    ['MAX_GOLES', coeficientes.MAX_GOLES, 'Marcador máximo de la matriz de probabilidad'],
  ]
    .map(
      ([k, v, d]) =>
        `<tr><td class="mono">${esc(k)}</td><td class="mono num"><b>${esc(v)}</b></td><td class="apagado">${esc(d)}</td></tr>`
    )
    .join('\n          ');

  return `<section class="vista" data-vista="calidad" hidden>
      <div class="encabezado">
        <div>
          <h1 class="titulo">Calidad del motor</h1>
          <p class="bajada">Los fallos se publican con el mismo tamaño de letra que los aciertos. No hay rachas, no hay «acierto asegurado», no hay ningún número redondeado hacia un titular más vendedor.</p>
        </div>
      </div>

      <div class="rejilla k3">
        <div class="tarjeta">
          <div class="kpi-etq">Acierto sobre ${g.n.toLocaleString('es')} partidos</div>
          <div class="kpi-cifra acento">${pct(g.acierto, 2)}</div>
          <div class="kpi-pie">Se cuenta acierto cuando el resultado real fue el de mayor probabilidad de las tres.</div>
        </div>
        <div class="tarjeta">
          <div class="kpi-etq">Brier (normalizado por K=3)</div>
          <div class="kpi-cifra">${num(g.brier)}</div>
          <div class="kpi-pie">Más bajo es mejor. Cero sería adivinar el resultado exacto con probabilidad 1 siempre.</div>
        </div>
        <div class="tarjeta">
          <div class="kpi-etq">Log loss</div>
          <div class="kpi-cifra">${num(g.logLoss)}</div>
          <div class="kpi-pie">ln(3) = ${num(r.ciegoLogLoss)} es el valor de adivinar. Por debajo, el motor aporta información.</div>
        </div>
      </div>

      <div class="rotulo">Contra qué se mide</div>
      <div class="tabla tabla-scroll">
        <table>
          <thead>
            <tr><th>Línea base</th><th class="num">Acierto</th><th class="num">Δ motor</th><th class="num">Brier</th><th class="num">Δ motor</th></tr>
          </thead>
          <tbody>
          ${comparaciones}
          </tbody>
        </table>
      </div>

      <div class="rotulo">Temporada por temporada</div>
      <div class="tabla tabla-scroll">
        <table>
          <thead>
            <tr><th>Temporada</th><th class="num">N</th><th class="num">Acierto</th><th class="num">Brier</th><th class="num">Log loss</th><th class="num">Brier vs ciego</th></tr>
          </thead>
          <tbody>
          ${filas}
          </tbody>
        </table>
      </div>

      <div class="con-lateral" style="margin-top:26px">
        <div>
          <div class="rotulo" style="margin-top:0">Método</div>
          <div class="tarjeta">
            <ul class="puntos">
              <li>Pasada partido por partido en orden cronológico: al predecir la jornada 15 el código solo ve datos de las jornadas 1 a 14.</li>
              <li>Las fuerzas de cada equipo se recalculan en cada partido con fecha de corte estricta (<code>fecha &lt; corte</code>), nunca el mismo día ni después.</li>
              <li>Las primeras ${coeficientes.JORNADAS_DESCARTADAS} jornadas de cada temporada no se puntúan: no hay historial reciente suficiente para calcular fuerzas confiables.</li>
              <li>Los coeficientes se calibraron con barridos sobre este mismo histórico, y el resultado de cada barrido está documentado en <code>config.mjs</code>.</li>
            </ul>
          </div>
        </div>
        <div>
          <div class="rotulo" style="margin-top:0">Límites</div>
          <div class="tarjeta">
            <ul class="puntos">
              <li>Los coeficientes se eligieron mirando este mismo histórico. Una parte de la mejora es ajuste a estos datos, no señal que vaya a repetirse.</li>
              <li>El ajuste por ausencias de Fase 2 se botó: empeoraba la nota. El código sigue en el repo, desactivado.</li>
              <li>No hay cuotas, así que no hay forma de medirse contra el mercado. La columna existe en <code>juez/notas.mjs</code> y devuelve null.</li>
              <li>Un 51 % de acierto en un problema de tres salidas es poco margen. Está publicado tal cual.</li>
            </ul>
          </div>
        </div>
      </div>

      <div class="rotulo">Coeficientes con los que se calculó todo esto</div>
      <div class="tabla tabla-scroll">
        <table>
          <thead><tr><th>Coeficiente</th><th class="num">Valor</th><th>Qué controla</th></tr></thead>
          <tbody>
          ${coefs}
          </tbody>
        </table>
      </div>
    </section>`;
}

// --- Cambios -------------------------------------------------------------

export function vistaNews({ cambios }) {
  if (cambios.length === 0) {
    return `<section class="vista" data-vista="news" hidden>
      <div class="encabezado"><div><h1 class="titulo">Cambios</h1></div></div>
      <div class="vacio">
        <div class="vacio-titulo">Sin historial de git</div>
        <div class="vacio-texto">El changelog se arma con <code>git log</code> sobre motor/, juez/, datos/ y config.mjs. Acá no hay repositorio.</div>
      </div>
    </section>`;
  }

  const clase = { CORRECCIÓN: 'aviso', MOTOR: 'acento', DATOS: '', SALIDA: 'ok' };
  const filas = cambios
    .map(
      (c) => `<div class="cambio">
          <div class="mono apagado">${esc(c.fecha)}</div>
          <div><span class="chip ${clase[c.tipo] ?? ''}">${esc(c.tipo)}</span></div>
          <div>
            <div class="cambio-titulo">${esc(c.titulo)}</div>
            ${c.texto ? `<div class="cambio-texto">${esc(c.texto)}</div>` : ''}
            <div class="mono apagado" style="font-size:11px;margin-top:5px">${esc(c.hash)}</div>
          </div>
        </div>`
    )
    .join('\n        ');

  return `<section class="vista" data-vista="news" hidden>
      <div class="encabezado">
        <div>
          <h1 class="titulo">Cambios del motor</h1>
          <p class="bajada">Sale de <code>git log</code> sobre motor/, juez/, datos/, config.mjs y salida/. No hay una lista que mantener a mano, así que no se puede desactualizar.</p>
        </div>
      </div>
      <div class="tarjeta">
        ${filas}
      </div>
    </section>`;
}

// --- Ficha ---------------------------------------------------------------

export function vistaMatch() {
  return `<section class="vista" data-vista="match" hidden>
      <button type="button" class="pastilla" data-ir="preds" style="margin-bottom:18px">← Volver</button>
      <div id="ficha"></div>
    </section>`;
}
