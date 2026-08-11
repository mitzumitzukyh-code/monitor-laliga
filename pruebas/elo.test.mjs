import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fuerzas, lambdas } from '../motor/elo.mjs';

// Liga sintética: muchos partidos de relleno 1-1 entre otros equipos (fijan
// el promedio de liga cerca de 1.0 gol) y pocos partidos de "Doble" de local
// metiendo 2 goles. Con pocos partidos de Doble frente a muchos de relleno,
// su propio aporte al promedio de liga es despreciable.
function ligaSintetica({ filler = 200, doblePartidos = 3 } = {}) {
  const partidos = [];
  let fecha = 20230101;
  const otros = ['A', 'B', 'C', 'D'];
  for (let i = 0; i < filler; i++) {
    partidos.push({
      fecha: String(fecha++),
      local: otros[i % otros.length],
      visitante: otros[(i + 1) % otros.length],
      golesLocal: 1,
      golesVisitante: 1,
      temporada: '2024-25',
    });
  }
  for (let i = 0; i < doblePartidos; i++) {
    partidos.push({
      fecha: String(fecha++),
      local: 'Doble',
      visitante: otros[i % otros.length],
      golesLocal: 2,
      golesVisitante: 1,
      temporada: '2024-25',
    });
  }
  return partidos;
}

test('un equipo que mete el doble del promedio de local da ataqueCasa ≈ 2.0 (sin suavizado, pesoPrior=0)', () => {
  const partidos = ligaSintetica();
  const fechaCorte = '99999999'; // después de todos los partidos sintéticos
  // vida media grande para que el decaimiento no distorsione el promedio;
  // pesoPrior=0 para probar la tasa cruda, sin el empujón bayesiano hacia
  // el promedio de liga (eso se prueba aparte).
  const { porEquipo, promedioLigaCasa } = fuerzas(partidos, fechaCorte, 1000, 0);

  assert.ok(Math.abs(promedioLigaCasa - 1.0) < 0.02, `promedioLigaCasa=${promedioLigaCasa}`);
  const doble = porEquipo.get('Doble');
  assert.ok(Math.abs(doble.ataqueCasa - 2.0) < 0.05, `ataqueCasa=${doble.ataqueCasa}`);
});

test('suavizado bayesiano: un equipo con muy pocos partidos queda cerca del promedio de liga (ataqueCasa ≈ 1.0), no en su tasa cruda', () => {
  // "Doble" solo tiene 1 partido de local (metió 2, el doble del promedio),
  // pero con pesoPrior alto el suavizado lo empuja hacia 1.0 en vez de 2.0.
  const partidos = ligaSintetica({ doblePartidos: 1 });
  const fechaCorte = '99999999';
  const { porEquipo } = fuerzas(partidos, fechaCorte, 1000, 20); // pesoPrior=20, mucho más que 1 partido real

  const doble = porEquipo.get('Doble');
  assert.ok(doble.ataqueCasa < 1.2, `ataqueCasa=${doble.ataqueCasa}, debería estar cerca de 1.0 (promedio de liga), no de 2.0`);
});

test('suavizado bayesiano: un equipo sin ningún partido de local no da NaN ni 0, da ≈1.0 (promedio de liga)', () => {
  const partidos = ligaSintetica();
  // "Nuevo" solo juega de visitante, nunca de local, antes del corte.
  partidos.push({ fecha: '99999998', local: 'A', visitante: 'Nuevo', golesLocal: 1, golesVisitante: 1, temporada: '2024-25' });
  const fechaCorte = '99999999';
  const { porEquipo } = fuerzas(partidos, fechaCorte, 1000, 4);

  const nuevo = porEquipo.get('Nuevo');
  assert.ok(Number.isFinite(nuevo.ataqueCasa), 'no debería dar NaN');
  assert.ok(Math.abs(nuevo.ataqueCasa - 1.0) < 1e-9, `ataqueCasa=${nuevo.ataqueCasa}, sin partidos de local debe quedar exacto en el promedio de liga`);
});

test('fuerzas() da resultados idénticos sin importar lo que pase después de fechaCorte (anti-fuga)', () => {
  const base = ligaSintetica();
  const fechaCorte = '99999999';
  // Partido "futuro": si se filtrara mal, este 10-0 dispararía las fuerzas.
  const futuro = { fecha: '99999999', local: 'Doble', visitante: 'A', golesLocal: 10, golesVisitante: 0, temporada: '2024-25' };

  const sinFuturo = fuerzas(base, fechaCorte, 8);
  const conFuturo = fuerzas([...base, futuro], fechaCorte, 8);

  assert.equal(conFuturo.promedioLigaCasa, sinFuturo.promedioLigaCasa);
  assert.deepEqual([...conFuturo.porEquipo.entries()], [...sinFuturo.porEquipo.entries()]);
});

test('lambdas() combina fuerzas y promedios de liga correctamente', () => {
  const local = { ataqueCasa: 1.5, defensaCasa: 0.8, ataqueFuera: 1.0, defensaFuera: 1.0 };
  const visitante = { ataqueCasa: 1.0, defensaCasa: 1.0, ataqueFuera: 0.9, defensaFuera: 1.2 };
  const { lh, la } = lambdas(local, visitante, 1.4, 1.1);
  assert.ok(Math.abs(lh - 1.5 * 1.2 * 1.4) < 1e-9);
  assert.ok(Math.abs(la - 0.9 * 0.8 * 1.1) < 1e-9);
});
