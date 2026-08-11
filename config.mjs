// Coeficientes del motor. Ningún número mágico va incrustado en las funciones,
// todos viven aquí para poder recalibrarlos y que el cambio quede a la vista.

// Corrección Dixon-Coles para marcadores bajos (Dixon & Coles, 1997).
// rho = 0 desactiva la corrección (Poisson independiente puro). La literatura
// típica usa valores negativos entre -0.05 y -0.2, pero acá arranca en 0 hasta
// que el backtest (Fase 1, paso 4) diga si un rho calibrado mejora el Brier
// score frente a no tocar nada. Regla 4: lo nuevo se gana el puesto.
export const RHO = 0;

// Marcador máximo considerado al construir la matriz de probabilidades.
// La cola de Poisson más allá de esto es despreciable para lambdas de fútbol
// (típicamente entre 0.5 y 3).
export const MAX_GOLES = 15;

// Vida media del decaimiento exponencial de fuerzas de ataque/defensa, en
// jornadas jugadas por cada equipo (no en días de calendario). Cuántas
// jornadas atrás de un equipo pesan la mitad que su partido más reciente.
export const SEMIVIDA_JORNADAS = 8;

// Jornadas descartadas al inicio de cada temporada en el backtest: no hay
// suficiente historial reciente para calcular fuerzas confiables.
export const JORNADAS_DESCARTADAS = 6;
