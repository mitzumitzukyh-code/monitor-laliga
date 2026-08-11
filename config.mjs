// Coeficientes del motor. Ningún número mágico va incrustado en las funciones,
// todos viven aquí para poder recalibrarlos y que el cambio quede a la vista.

// Corrección Dixon-Coles para marcadores bajos (Dixon & Coles, 1997).
// Calibrado con barrido sobre el histórico real (5 temporadas, 1600
// predicciones del backtest): rho entre -0.02 y -0.05 gana por muy poco
// margen (4ta cifra decimal) frente a rho=0 en Brier/logLoss/acierto. La
// diferencia es casi ruido, pero es consistente en dirección con la
// literatura (Dixon & Coles usan valores negativos), así que se deja activa
// en el extremo suave del barrido en vez de forzar rho=0.
export const RHO = -0.02;

// Marcador máximo considerado al construir la matriz de probabilidades.
// La cola de Poisson más allá de esto es despreciable para lambdas de fútbol
// (típicamente entre 0.5 y 3).
export const MAX_GOLES = 15;

// Vida media del decaimiento exponencial de fuerzas de ataque/defensa, en
// jornadas jugadas por cada equipo (no en días de calendario). Cuántas
// jornadas atrás de un equipo pesan la mitad que su partido más reciente.
// Calibrado con barrido sobre el histórico real: con solo 5 temporadas de
// datos por equipo, una vida media corta (8 jornadas, el valor inicial sin
// calibrar) es puro ruido — el acierto sube de 47.6% a ~50.6% y el log loss
// pasa de PEOR que adivinar 1/3-1/3-1/3 (1.107 > ln(3)=1.099) a mejor
// (1.069), simplemente alargando la memoria. La mejora se aplana entre
// semivida 100 y 400 (resultados casi idénticos en ese rango); 150 queda
// cómodo en el medio de esa meseta, ni en el borde corto ni forzando el
// límite superior del barrido.
export const SEMIVIDA_JORNADAS = 150;

// Jornadas descartadas al inicio de cada temporada en el backtest: no hay
// suficiente historial reciente para calcular fuerzas confiables.
export const JORNADAS_DESCARTADAS = 6;
