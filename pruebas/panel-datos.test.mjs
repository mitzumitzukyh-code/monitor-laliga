import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  referencias,
  rendimientoNeutral,
  topMarcadores,
  marcadoresDePartido,
  formaDe,
  historialDirecto,
  armarPayload,
  clasificacionPorTemporada,
  RESULTADOS,
} from '../salida/web/panel-datos.mjs';
import { esc, iniciales, colorEquipo } from '../salida/web/panel-vistas.mjs';

// Tres partidos a mano: dos los ganó el local, uno el visitante.
const PREDS = [
  {
    fecha: '2020-08-10', temporada: '2020-21', jornada: 7,
    local: 'Uno', visitante: 'Dos', golesLocal: 2, golesVisitante: 0,
    lh: 1.5, la: 0.8, probLocal: 0.6, probEmpate: 0.25, probVisitante: 0.15, resultadoReal: 'local',
  },
  {
    fecha: '2020-08-17', temporada: '2020-21', jornada: 8,
    local: 'Dos', visitante: 'Uno', golesLocal: 0, golesVisitante: 1,
    lh: 1.0, la: 1.2, probLocal: 0.3, probEmpate: 0.3, probVisitante: 0.4, resultadoReal: 'visitante',
  },
  {
    fecha: '2020-08-24', temporada: '2020-21', jornada: 9,
    local: 'Uno', visitante: 'Tres', golesLocal: 3, golesVisitante: 1,
    lh: 2.0, la: 0.9, probLocal: 0.7, probEmpate: 0.2, probVisitante: 0.1, resultadoReal: 'local',
  },
];

// --- referencias ---------------------------------------------------------

// Con 1/3 en las tres casillas, el error al cuadrado de cualquier partido es
// (1/3-1)^2 + (1/3)^2 + (1/3)^2 = 4/9 + 1/9 + 1/9 = 6/9 = 2/3.
// Brier normalizado por las 3 clases: (2/3)/3 = 2/9 = 0.2222...
test('referencias: el Brier del ciego es exactamente 2/9', () => {
  const r = referencias(PREDS);
  assert.ok(Math.abs(r.ciegoBrier - 2 / 9) < 1e-12);
});

test('referencias: el log loss del ciego es ln(3)', () => {
  const r = referencias(PREDS);
  assert.ok(Math.abs(r.ciegoLogLoss - Math.log(3)) < 1e-12);
});

test('referencias: siempre-local acierta 2 de 3', () => {
  const r = referencias(PREDS);
  assert.ok(Math.abs(r.siempreLocal - 2 / 3) < 1e-12);
});

test('referencias con lista vacía no divide entre cero', () => {
  assert.equal(referencias([]).siempreLocal, 0);
});

// --- rendimiento neutral -------------------------------------------------

// Equipo que ataca el doble en casa y concede la mitad, promedio de liga
// 1.5 en casa y 1.0 fuera:
//   goles a favor en casa   = 2.0 * 1.5 = 3.0
//   goles en contra en casa = 0.5 * 1.0 = 0.5
//   goles a favor fuera     = 1.0 * 1.0 = 1.0
//   goles en contra fuera   = 1.0 * 1.5 = 1.5
//   diferencia = ((3.0-0.5) + (1.0-1.5)) / 2 = (2.5 - 0.5) / 2 = 1.0
test('rendimientoNeutral da la diferencia calculada a mano', () => {
  const r = rendimientoNeutral(
    { ataqueCasa: 2, defensaCasa: 0.5, ataqueFuera: 1, defensaFuera: 1 },
    1.5,
    1.0
  );
  assert.ok(Math.abs(r.golesFavorCasa - 3.0) < 1e-12);
  assert.ok(Math.abs(r.golesContraCasa - 0.5) < 1e-12);
  assert.ok(Math.abs(r.diferencia - 1.0) < 1e-12);
});

test('un equipo exactamente promedio tiene diferencia igual a la ventaja de campo', () => {
  // Con las cuatro fuerzas en 1, la diferencia es (promCasa - promFuera) + (promFuera - promCasa)
  // dividido entre 2, que es exactamente 0: la ventaja de campo se cancela al
  // promediar el escenario de casa con el de fuera.
  const r = rendimientoNeutral({ ataqueCasa: 1, defensaCasa: 1, ataqueFuera: 1, defensaFuera: 1 }, 1.6, 1.1);
  assert.ok(Math.abs(r.diferencia) < 1e-12);
});

// --- marcadores ----------------------------------------------------------

test('topMarcadores devuelve la cantidad pedida, ordenada de mayor a menor', () => {
  const m = topMarcadores(1.5, 1.0, 6);
  assert.equal(m.length, 6);
  for (let i = 1; i < m.length; i++) assert.ok(m[i - 1].p >= m[i].p);
});

test('topMarcadores: las probabilidades nunca suman más de 1', () => {
  const m = topMarcadores(1.5, 1.0, 20);
  const suma = m.reduce((a, x) => a + x.p, 0);
  assert.ok(suma > 0 && suma <= 1 + 1e-12);
});

// Un 5-1 con lambdas de 1.5 y 1.0 nunca entra entre los seis más probables,
// y aun así la ficha tiene que mostrarlo (si no, el pie "el punto marca el
// marcador real" queda mintiendo).
test('marcadoresDePartido añade el marcador real cuando queda fuera del top', () => {
  const m = marcadoresDePartido(1.5, 1.0, 5, 1, 6);
  assert.equal(m.length, 7);
  const ultimo = m[m.length - 1];
  assert.equal(ultimo.local, 5);
  assert.equal(ultimo.visitante, 1);
  assert.equal(ultimo.fueraDelTop, true);
});

test('marcadoresDePartido no duplica cuando el real ya está entre los probables', () => {
  const m = marcadoresDePartido(1.5, 1.0, 1, 1, 6);
  assert.equal(m.length, 6);
  const cuantos = m.filter((x) => x.local === 1 && x.visitante === 1).length;
  assert.equal(cuantos, 1);
});

test('marcadoresDePartido no inventa un marcador por encima de MAX_GOLES', () => {
  const m = marcadoresDePartido(1.5, 1.0, 40, 0, 6);
  assert.equal(m.length, 6);
});

// --- forma e historial (regla 6) -----------------------------------------

test('formaDe solo mira hacia atrás, nunca el mismo día ni después', () => {
  const f = formaDe(PREDS, 'Uno', '2020-08-17');
  assert.equal(f.length, 1);
  assert.equal(f[0].fecha, '2020-08-10');
  assert.equal(f[0].signo, 'G');
  assert.equal(f[0].rival, 'Dos');
});

test('formaDe cuenta bien goles a favor y en contra jugando de visitante', () => {
  const f = formaDe(PREDS, 'Uno', '2020-08-24');
  // El más reciente antes del 24 es el del 17, donde Uno era visitante y ganó 0-1.
  assert.equal(f[0].esLocal, false);
  assert.equal(f[0].golesFavor, 1);
  assert.equal(f[0].golesContra, 0);
  assert.equal(f[0].signo, 'G');
});

test('formaDe de un equipo sin partidos anteriores da lista vacía', () => {
  assert.deepEqual(formaDe(PREDS, 'Uno', '2020-01-01'), []);
});

test('historialDirecto encuentra el cruce en las dos localías', () => {
  const h = historialDirecto(PREDS, 'Uno', 'Dos', '2020-12-31');
  assert.equal(h.length, 2);
  assert.equal(h[0].fecha, '2020-08-17'); // más reciente primero
  assert.equal(h[0].marcador, '0-1');
  assert.equal(h[0].resultado, 'visitante');
});

test('historialDirecto no incluye partidos del mismo día ni posteriores', () => {
  const h = historialDirecto(PREDS, 'Uno', 'Dos', '2020-08-17');
  assert.equal(h.length, 1);
  assert.equal(h[0].fecha, '2020-08-10');
});

// --- carga útil ----------------------------------------------------------

test('armarPayload conserva los datos: los índices resuelven al equipo correcto', () => {
  const p = armarPayload(PREDS);
  assert.equal(p.partidos.length, 3);
  const primero = p.partidos[0];
  assert.equal(p.equipos[primero[3]], 'Uno');
  assert.equal(p.equipos[primero[4]], 'Dos');
  assert.equal(p.temporadas[primero[0]], '2020-21');
  assert.equal(RESULTADOS[primero[12]], 'local');
});

test('armarPayload ordena por fecha ascendente', () => {
  const p = armarPayload(PREDS);
  const fechas = p.partidos.map((f) => f[2]);
  assert.deepEqual(fechas, [...fechas].sort());
});

test('armarPayload alinea marcadores con partidos, índice por índice', () => {
  const p = armarPayload(PREDS);
  assert.equal(p.marcadores.length, p.partidos.length);
  // El tercer partido acabó 3-1, que con lh=2.0 y la=0.9 no está entre los
  // seis más probables: tiene que aparecer igual, al final.
  const etiquetas = p.marcadores[2].map((m) => m[0]);
  assert.ok(etiquetas.includes('3-1'));
});

test('armarPayload redondea sin perder el orden de magnitud', () => {
  const p = armarPayload(PREDS);
  const [, , , , , , , lh, la, pl] = p.partidos[0];
  assert.equal(lh, 1.5);
  assert.equal(la, 0.8);
  assert.equal(pl, 0.6);
});

// --- clasificación -------------------------------------------------------

// Dos temporadas. En la segunda entra un equipo nuevo que no jugó nunca
// antes: tiene que salir con tendencia null, no con 0.
const DOS_TEMPORADAS = [
  ...['2020-08-01', '2020-08-08', '2020-08-15', '2020-08-22'].map((fecha, i) => ({
    fecha, temporada: '2020-21', jornada: 7 + i,
    local: i % 2 === 0 ? 'Uno' : 'Dos', visitante: i % 2 === 0 ? 'Dos' : 'Uno',
    golesLocal: 2, golesVisitante: 1,
    lh: 1.5, la: 1.0, probLocal: 0.5, probEmpate: 0.3, probVisitante: 0.2, resultadoReal: 'local',
  })),
  ...['2021-08-01', '2021-08-08', '2021-08-15'].map((fecha, i) => ({
    fecha, temporada: '2021-22', jornada: 7 + i,
    local: ['Uno', 'Nuevo', 'Dos'][i], visitante: ['Nuevo', 'Dos', 'Uno'][i],
    golesLocal: 1, golesVisitante: 1,
    lh: 1.2, la: 1.2, probLocal: 0.4, probEmpate: 0.35, probVisitante: 0.25, resultadoReal: 'empate',
  })),
];

test('clasificacionPorTemporada arma una tabla por temporada', () => {
  const t = clasificacionPorTemporada(DOS_TEMPORADAS);
  assert.deepEqual(Object.keys(t).sort(), ['2020-21', '2021-22']);
});

test('un equipo sin historial al arrancar la temporada sale con tendencia null', () => {
  const t = clasificacionPorTemporada(DOS_TEMPORADAS);
  const nuevo = t['2021-22'].find((f) => f.equipo === 'Nuevo');
  assert.ok(nuevo, 'el equipo nuevo tiene que aparecer en la tabla');
  assert.equal(nuevo.tendencia, null);
});

test('un equipo con historial previo sí trae tendencia numérica', () => {
  const t = clasificacionPorTemporada(DOS_TEMPORADAS);
  const uno = t['2021-22'].find((f) => f.equipo === 'Uno');
  assert.equal(typeof uno.tendencia, 'number');
  assert.ok(Number.isFinite(uno.tendencia));
});

test('la tabla viene ordenada por diferencia esperada, de mayor a menor', () => {
  const t = clasificacionPorTemporada(DOS_TEMPORADAS);
  for (const filas of Object.values(t)) {
    for (let i = 1; i < filas.length; i++) {
      assert.ok(filas[i - 1].diferencia >= filas[i].diferencia);
    }
  }
});

test('cuenta los partidos de la temporada, no los de toda la historia', () => {
  const t = clasificacionPorTemporada(DOS_TEMPORADAS);
  const uno2021 = t['2021-22'].find((f) => f.equipo === 'Uno');
  assert.equal(uno2021.partidas, 2); // jugó 2 en 2021-22, aunque tenga 4 en 2020-21
});

// --- plantilla -----------------------------------------------------------

test('esc escapa todo lo que puede romper el HTML', () => {
  assert.equal(esc('<script>"x"&\'y\'</script>'), '&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;');
});

test('esc convierte null y undefined en cadena vacía, no en "null"', () => {
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
});

test('iniciales toma una letra de cada palabra, o dos de la única', () => {
  assert.equal(iniciales('Ath Bilbao'), 'AB');
  assert.equal(iniciales('Barcelona'), 'BA');
});

test('colorEquipo es estable: el mismo nombre da siempre el mismo color', () => {
  assert.equal(colorEquipo('Barcelona'), colorEquipo('Barcelona'));
  assert.notEqual(colorEquipo('Barcelona'), colorEquipo('Real Madrid'));
});
