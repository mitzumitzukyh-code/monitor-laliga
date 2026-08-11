// Modelo Dixon-Coles: distribución de Poisson bivariada con corrección para
// marcadores bajos. Matemática pura, cero dependencias.
//
// Referencia: Dixon, M.J. y Coles, S.G. (1997), "Modelling Association
// Football Scores and Inefficiencies in the Football Betting Market".

import { RHO, MAX_GOLES } from '../config.mjs';

function factorial(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

// P(anota k goles | lambda esperados), distribución de Poisson.
export function poisson(k, lambda) {
  return (lambda ** k * Math.exp(-lambda)) / factorial(k);
}

// Factor de corrección Dixon-Coles para los cuatro marcadores bajos donde la
// independencia de Poisson falla empíricamente (0-0, 1-0, 0-1, 1-1).
// rho = 0 deja la distribución de Poisson intacta (tau siempre 1).
export function tau(x, y, lh, la, rho) {
  if (x === 0 && y === 0) return 1 - lh * la * rho;
  if (x === 0 && y === 1) return 1 + lh * rho;
  if (x === 1 && y === 0) return 1 + la * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

// Matriz de probabilidad conjunta de marcadores, filas = goles del local,
// columnas = goles del visitante. Se normaliza para que sume exactamente 1:
// la corrección tau conserva la masa total sobre la grilla infinita, pero
// truncar en maxGoles pierde la cola, así que se reparte de vuelta.
export function matrizMarcadores(lh, la, maxGoles, rho) {
  const cruda = [];
  let total = 0;
  for (let x = 0; x <= maxGoles; x++) {
    const fila = [];
    for (let y = 0; y <= maxGoles; y++) {
      const p = poisson(x, lh) * poisson(y, la) * tau(x, y, lh, la, rho);
      fila.push(p);
      total += p;
    }
    cruda.push(fila);
  }
  return cruda.map((fila) => fila.map((p) => p / total));
}

// Probabilidad de victoria local, empate y victoria visitante a partir de los
// goles esperados de cada equipo.
export function probabilidades(lh, la, rho = RHO, maxGoles = MAX_GOLES) {
  const matriz = matrizMarcadores(lh, la, maxGoles, rho);
  let local = 0;
  let empate = 0;
  let visitante = 0;
  for (let x = 0; x <= maxGoles; x++) {
    for (let y = 0; y <= maxGoles; y++) {
      const p = matriz[x][y];
      if (x > y) local += p;
      else if (x === y) empate += p;
      else visitante += p;
    }
  }
  return { local, empate, visitante };
}
