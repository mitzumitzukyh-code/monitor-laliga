// El JavaScript que viaja al navegador, como texto. Vanilla puro: ni React,
// ni build, ni una sola dependencia — igual que el resto del proyecto.
//
// Lo único que hace es PINTAR y FILTRAR lo que panel-datos.mjs ya calculó.
// No hay una sola fórmula de probabilidad de este lado: si algún día hiciera
// falta una, va en motor/ y el resultado viaja en la carga útil.

export function cliente() {
  return `
(function () {
  'use strict';

  var D = window.__PANEL__;
  var ESCUDOS = D.escudos || {};
  var COLORES = D.colores || {};
  var VIVO = D.vivo || { disponible: false, partidos: [] };

  // Índices de la carga útil compacta (ver armarPayload en panel-datos.mjs).
  var T = 0, J = 1, F = 2, L = 3, V = 4, GL = 5, GV = 6, LH = 7, LA = 8, PL = 9, PE = 10, PV = 11, RES = 12;
  var NOMBRE_RES = ['local', 'empate', 'visitante'];

  var eq = function (i) { return D.equipos[i]; };
  var temp = function (i) { return D.temporadas[i]; };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pct(x, d) { return (x * 100).toFixed(d == null ? 1 : d) + ' %'; }
  function iniciales(n) {
    var p = String(n).trim().split(/\\s+/);
    return (p.length >= 2 ? p[0][0] + p[1][0] : String(n).slice(0, 2)).toUpperCase();
  }
  function escudo(nombre, clase) {
    var cls = 'escudo' + (clase ? ' ' + clase : '');
    var e = ESCUDOS[nombre];
    if (e) return '<span class="' + cls + '"><img src="' + e + '" alt=""></span>';
    var c = COLORES[nombre] || 'var(--tinta-media)';
    return '<span class="' + cls + '" style="color:' + c +
      ';border-color:color-mix(in srgb, ' + c + ' 45%, transparent)' +
      ';background:color-mix(in srgb, ' + c + ' 12%, transparent)" aria-hidden="true">' +
      esc(iniciales(nombre)) + '</span>';
  }

  // --- navegación entre vistas ------------------------------------------

  var secciones = {};
  Array.prototype.forEach.call(document.querySelectorAll('[data-vista]'), function (s) {
    secciones[s.getAttribute('data-vista')] = s;
  });

  function ir(vista, opciones) {
    Object.keys(secciones).forEach(function (k) { secciones[k].hidden = k !== vista; });
    // El rail y la nav marcan 'match' como si fuera 'preds': la ficha se
    // abre desde ahí y no tiene entrada propia.
    var activa = vista === 'match' ? 'preds' : vista;
    Array.prototype.forEach.call(document.querySelectorAll('[data-ir]'), function (b) {
      if (b.getAttribute('data-ir') === activa) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    if (!(opciones && opciones.sinScroll)) window.scrollTo(0, 0);
    if (location.hash !== '#' + vista && vista !== 'match') history.replaceState(null, '', '#' + vista);
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-ir]');
    if (b) { ir(b.getAttribute('data-ir')); return; }
    var fila = ev.target.closest('[data-ficha]');
    if (fila) abrirFicha(Number(fila.getAttribute('data-ficha')));
  });

  // --- piezas compartidas ------------------------------------------------

  function barra1x2(pl, pe, pv) {
    return '<div class="barra1x2">' +
      '<i class="bl" style="width:' + (pl * 100).toFixed(2) + '%"></i>' +
      '<i class="be" style="width:' + (pe * 100).toFixed(2) + '%"></i>' +
      '<i class="bv" style="width:' + (pv * 100).toFixed(2) + '%"></i></div>' +
      '<div class="leyenda1x2">' +
      '<span><span class="punto" style="background:var(--acento)"></span>Local <b class="mono">' + pct(pl) + '</b></span>' +
      '<span><span class="punto" style="background:#4C5566"></span>Empate <b class="mono">' + pct(pe) + '</b></span>' +
      '<span><span class="punto" style="background:#2FA8C7"></span>Visitante <b class="mono">' + pct(pv) + '</b></span>' +
      '</div>';
  }

  function favorito(p) {
    var probs = [p[PL], p[PE], p[PV]];
    var max = Math.max(probs[0], probs[1], probs[2]);
    return probs.indexOf(max);
  }
  function acerto(p) { return favorito(p) === p[RES]; }

  function chipNota(p) {
    return acerto(p)
      ? '<span class="chip ok">ACIERTO</span>'
      : '<span class="chip aviso">FALLO</span>';
  }

  function tarjetaPartido(p, i) {
    var local = eq(p[L]), visitante = eq(p[V]);
    return '<button type="button" class="partido" data-ficha="' + i + '">' +
      '<div class="partido-cab">' +
        '<span class="chip">J' + p[J] + ' · ' + esc(temp(p[T])) + '</span>' +
        '<span class="mono apagado">' + esc(p[F]) + '</span>' +
      '</div>' +
      '<div class="partido-cuerpo">' +
        '<div class="enfrentamiento">' +
          '<span class="lado">' + escudo(local) + '<b>' + esc(local) + '</b></span>' +
          '<span class="marcador-real">' + p[GL] + '–' + p[GV] + '</span>' +
          '<span class="lado der"><b>' + esc(visitante) + '</b>' + escudo(visitante) + '</span>' +
        '</div>' +
        '<div>' + barra1x2(p[PL], p[PE], p[PV]) + '</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">' +
          chipNota(p) +
          '<span class="mono apagado" style="font-size:12px">goles esperados ' + p[LH].toFixed(2) + ' – ' + p[LA].toFixed(2) + '</span>' +
        '</div>' +
      '</div>' +
    '</button>';
  }

  // --- Inicio ------------------------------------------------------------

  function pintarInicio() {
    var n = D.partidos.length;

    // Próximos partidos: solo existen si Supabase respondió. Sin credenciales
    // esto queda vacío a propósito — no se rellena con nada inventado.
    var prox = document.getElementById('proximos');
    if (!VIVO.disponible || VIVO.partidos.length === 0) {
      prox.innerHTML = '<div class="vacio">' +
        '<div class="vacio-titulo">Sin partidos próximos</div>' +
        '<div class="vacio-texto">' + esc(VIVO.motivo || 'No hay filas en fixtures todavía.') + '</div></div>';
    } else {
      prox.innerHTML = '<div class="rejilla k2">' + VIVO.partidos.slice(0, 4).map(tarjetaVivo).join('') + '</div>';
    }

    var ultimos = D.partidos.slice(Math.max(0, n - 4)).reverse();
    var base = n - Math.min(4, n);
    document.getElementById('ultimos').innerHTML = ultimos
      .map(function (p, k) { return tarjetaPartido(p, n - 1 - k); })
      .join('');

    var recientes = D.partidos.slice(Math.max(0, n - 12)).reverse();
    document.getElementById('recientes').innerHTML = recientes.map(function (p, k) {
      var i = n - 1 - k;
      return '<div data-ficha="' + i + '" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--linea);cursor:pointer">' +
        '<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
          esc(eq(p[L])) + ' <span class="apagado">vs</span> ' + esc(eq(p[V])) + '</span>' +
        '<span class="mono ' + (acerto(p) ? 'pos' : 'neg') + '" style="flex:none;font-size:12px">' +
          (acerto(p) ? '✓' : '✕') + ' ' + p[GL] + '–' + p[GV] + '</span>' +
      '</div>';
    }).join('');
    void base;
  }

  function tarjetaVivo(f) {
    var tiene = f.probLocal != null;
    return '<div class="partido" style="cursor:default">' +
      '<div class="partido-cab">' +
        '<span class="chip">' + esc(f.jornada || '—') + '</span>' +
        '<span class="mono apagado">' + esc(String(f.fecha).slice(0, 16).replace('T', ' ')) + '</span>' +
      '</div>' +
      '<div class="partido-cuerpo">' +
        '<div class="enfrentamiento">' +
          '<span class="lado">' + escudo(f.local) + '<b>' + esc(f.local) + '</b></span>' +
          '<span class="vs">VS</span>' +
          '<span class="lado der"><b>' + esc(f.visitante) + '</b>' + escudo(f.visitante) + '</span>' +
        '</div>' +
        (tiene
          ? '<div>' + barra1x2(f.probLocal, f.probEmpate, f.probVisitante) + '</div>'
          : '<div class="apagado" style="font-size:12px">Sin predicción guardada para este partido.</div>') +
        '<div><span class="chip">' + esc(f.estado || '—') + '</span></div>' +
      '</div>' +
    '</div>';
  }

  // --- Predicciones ------------------------------------------------------

  var filtroTemporada = 'todas';
  var ordenCampo = 'fecha';
  var ordenDir = 'desc';
  var tope = 100;

  function indicesFiltrados() {
    var out = [];
    for (var i = 0; i < D.partidos.length; i++) {
      if (filtroTemporada !== 'todas' && temp(D.partidos[i][T]) !== filtroTemporada) continue;
      out.push(i);
    }
    var clave = {
      fecha: function (p) { return p[F]; },
      local: function (p) { return p[PL]; },
      visitante: function (p) { return p[PV]; },
      confianza: function (p) { return Math.max(p[PL], p[PE], p[PV]); }
    }[ordenCampo];
    out.sort(function (a, b) {
      var va = clave(D.partidos[a]), vb = clave(D.partidos[b]);
      if (va < vb) return ordenDir === 'desc' ? 1 : -1;
      if (va > vb) return ordenDir === 'desc' ? -1 : 1;
      return 0;
    });
    return out;
  }

  function pintarPreds() {
    var idx = indicesFiltrados();
    var visibles = idx.slice(0, tope);
    document.getElementById('preds-cuerpo').innerHTML = visibles.map(function (i) {
      var p = D.partidos[i];
      var fav = favorito(p);
      var marca = function (k) { return fav === k ? ' style="color:var(--tinta);font-weight:700"' : ''; };
      return '<tr class="clicable" data-ficha="' + i + '">' +
        '<td class="mono apagado">' + esc(p[F]) + '</td>' +
        '<td class="mono num apagado">' + p[J] + '</td>' +
        '<td><div class="equipo-celda">' + escudo(eq(p[L]), 'sm') +
          '<span>' + esc(eq(p[L])) + ' <span class="apagado">vs</span> ' + esc(eq(p[V])) + '</span></div></td>' +
        '<td class="mono num"' + marca(0) + '>' + pct(p[PL]) + '</td>' +
        '<td class="mono num"' + marca(1) + '>' + pct(p[PE]) + '</td>' +
        '<td class="mono num"' + marca(2) + '>' + pct(p[PV]) + '</td>' +
        '<td class="mono num apagado">' + pct(Math.max(p[PL], p[PE], p[PV])) + '</td>' +
        '<td class="mono num">' + p[GL] + '–' + p[GV] + '</td>' +
        '<td>' + chipNota(p) + '</td>' +
      '</tr>';
    }).join('');

    document.getElementById('preds-conteo').textContent =
      visibles.length.toLocaleString('es') + ' de ' + idx.length.toLocaleString('es');
    document.getElementById('preds-mas').hidden = visibles.length >= idx.length;
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-temporada]'), function (b) {
    b.addEventListener('click', function () {
      filtroTemporada = b.getAttribute('data-temporada');
      tope = 100;
      Array.prototype.forEach.call(document.querySelectorAll('[data-temporada]'), function (o) {
        o.setAttribute('aria-pressed', String(o === b));
      });
      pintarPreds();
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-orden]'), function (b) {
    b.addEventListener('click', function () {
      var campo = b.getAttribute('data-orden');
      if (ordenCampo === campo) ordenDir = ordenDir === 'desc' ? 'asc' : 'desc';
      else { ordenCampo = campo; ordenDir = 'desc'; }
      Array.prototype.forEach.call(document.querySelectorAll('th'), function (th) { th.removeAttribute('aria-sort'); });
      b.closest('th').setAttribute('aria-sort', ordenDir === 'desc' ? 'descending' : 'ascending');
      pintarPreds();
    });
  });

  document.getElementById('preds-mas').addEventListener('click', function () {
    tope += 200;
    pintarPreds();
  });

  // --- Clasificación: pestañas por temporada ------------------------------

  Array.prototype.forEach.call(document.querySelectorAll('[data-board]'), function (b) {
    b.addEventListener('click', function () {
      var t = b.getAttribute('data-board');
      Array.prototype.forEach.call(document.querySelectorAll('[data-board]'), function (o) {
        o.setAttribute('aria-pressed', String(o === b));
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-board-tabla]'), function (tabla) {
        tabla.hidden = tabla.getAttribute('data-board-tabla') !== t;
      });
    });
  });

  // --- Ficha -------------------------------------------------------------

  // Forma e historial se calculan acá sobre la MISMA lista de partidos que
  // ya viajó, mirando solo hacia atrás (regla 6). No se pide nada de vuelta.
  function formaDe(equipo, fecha, n) {
    var out = [];
    for (var i = D.partidos.length - 1; i >= 0 && out.length < n; i--) {
      var p = D.partidos[i];
      if (p[F] >= fecha) continue;
      var esLocal = eq(p[L]) === equipo;
      if (!esLocal && eq(p[V]) !== equipo) continue;
      var gf = esLocal ? p[GL] : p[GV], gc = esLocal ? p[GV] : p[GL];
      out.push({ signo: gf > gc ? 'G' : gf === gc ? 'E' : 'P', rival: esLocal ? eq(p[V]) : eq(p[L]), gf: gf, gc: gc, fecha: p[F] });
    }
    return out;
  }

  function historialDirecto(local, visitante, fecha, n) {
    var out = [];
    for (var i = D.partidos.length - 1; i >= 0 && out.length < n; i--) {
      var p = D.partidos[i];
      if (p[F] >= fecha) continue;
      var a = eq(p[L]), b = eq(p[V]);
      if (!((a === local && b === visitante) || (a === visitante && b === local))) continue;
      out.push({ fecha: p[F], temporada: temp(p[T]), local: a, visitante: b, marcador: p[GL] + '–' + p[GV] });
    }
    return out;
  }

  function pintarForma(lista) {
    if (lista.length === 0) return '<span class="apagado">Sin partidos anteriores.</span>';
    return '<div class="forma">' + lista.map(function (f) {
      var c = f.signo === 'G' ? 'g' : f.signo === 'P' ? 'p' : '';
      return '<i class="' + c + '" title="' + esc(f.fecha + ' vs ' + f.rival + ' ' + f.gf + '-' + f.gc) + '">' + f.signo + '</i>';
    }).join('') + '</div>';
  }

  function abrirFicha(i) {
    var p = D.partidos[i];
    var local = eq(p[L]), visitante = eq(p[V]);
    var marcadores = D.marcadores[i] || [];
    var maxPct = marcadores.length ? marcadores[0][1] : 1;
    var real = p[GL] + '-' + p[GV];

    var filasMarcador = marcadores.map(function (m) {
      var esReal = m[0] === real;
      return '<div class="marcador-fila">' +
        '<span class="mono' + (esReal ? '' : ' apagado') + '">' + esc(m[0].replace('-', '–')) + (esReal ? ' ●' : '') + '</span>' +
        '<span class="marcador-barra"><i style="width:' + ((m[1] / maxPct) * 100).toFixed(1) + '%' +
          (esReal ? '' : ';background:var(--linea-fuerte)') + '"></i></span>' +
        '<span class="mono num">' + m[1].toFixed(1) + ' %</span>' +
      '</div>';
    }).join('');

    var h2h = historialDirecto(local, visitante, p[F], 5);
    var filasH2h = h2h.length === 0
      ? '<div class="apagado">Sin enfrentamientos anteriores en el histórico.</div>'
      : h2h.map(function (h) {
          return '<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--linea)">' +
            '<span class="mono apagado">' + esc(h.fecha) + '</span>' +
            '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(h.local) + ' vs ' + esc(h.visitante) + '</span>' +
            '<span class="mono">' + esc(h.marcador) + '</span></div>';
        }).join('');

    document.getElementById('ficha').innerHTML =
      '<div class="encabezado"><div>' +
        '<h1 class="titulo">' + esc(local) + ' vs ' + esc(visitante) + '</h1>' +
        '<p class="bajada">Jornada ' + p[J] + ' · temporada ' + esc(temp(p[T])) + ' · ' + esc(p[F]) + '</p>' +
      '</div><div>' + chipNota(p) + '</div></div>' +

      '<div class="rejilla k3">' +
        '<div class="tarjeta"><div class="kpi-etq">Marcador real</div>' +
          '<div class="kpi-cifra">' + p[GL] + '–' + p[GV] + '</div>' +
          '<div class="kpi-pie">Ganó ' + esc(NOMBRE_RES[p[RES]]) + '</div></div>' +
        '<div class="tarjeta"><div class="kpi-etq">Goles esperados</div>' +
          '<div class="kpi-cifra">' + p[LH].toFixed(2) + ' – ' + p[LA].toFixed(2) + '</div>' +
          '<div class="kpi-pie">Lambda de cada equipo, antes de construir la matriz</div></div>' +
        '<div class="tarjeta"><div class="kpi-etq">Probabilidad del favorito</div>' +
          '<div class="kpi-cifra ' + (acerto(p) ? 'ok' : 'acento') + '">' + pct(Math.max(p[PL], p[PE], p[PV])) + '</div>' +
          '<div class="kpi-pie">El motor apuntaba a ' + esc(NOMBRE_RES[favorito(p)]) + '</div></div>' +
      '</div>' +

      '<div class="rotulo">Las tres probabilidades</div>' +
      '<div class="tarjeta">' + barra1x2(p[PL], p[PE], p[PV]) + '</div>' +

      '<div class="con-lateral" style="margin-top:26px"><div>' +
        '<div class="rotulo" style="margin-top:0">Marcadores más probables</div>' +
        '<div class="tarjeta">' + filasMarcador +
          '<div class="kpi-pie" style="margin-top:14px">Sale de la misma matriz de Dixon-Coles con la que se calcularon las tres probabilidades de arriba: es esa misma cuenta, desagregada. El punto marca el marcador que de verdad pasó — si no estaba entre los más probables, se añade igual al final, con la probabilidad que el motor le daba.</div>' +
        '</div>' +
      '</div><div>' +
        '<div class="rotulo" style="margin-top:0">Forma previa</div>' +
        '<div class="tarjeta">' +
          '<div style="margin-bottom:14px"><div class="kpi-etq">' + esc(local) + '</div>' +
            '<div style="margin-top:8px">' + pintarForma(formaDe(local, p[F], 5)) + '</div></div>' +
          '<div><div class="kpi-etq">' + esc(visitante) + '</div>' +
            '<div style="margin-top:8px">' + pintarForma(formaDe(visitante, p[F], 5)) + '</div></div>' +
        '</div>' +
        '<div class="rotulo">Historial directo</div>' +
        '<div class="tarjeta">' + filasH2h + '</div>' +
      '</div></div>';

    ir('match');
  }

  // --- arranque ----------------------------------------------------------

  pintarInicio();
  pintarPreds();
  var inicial = (location.hash || '#home').slice(1);
  ir(secciones[inicial] ? inicial : 'home', { sinScroll: true });
})();
`;
}
