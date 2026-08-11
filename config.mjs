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

// Suavizado bayesiano: cantidad de "partidos fantasma" con el promedio de
// liga que se le suman a cada equipo antes de calcular su tasa de ataque o
// defensa. Sin esto, un equipo con pocos partidos (recién ascendido, racha
// de blanqueadas al arranque) puede dar una tasa de 0 goles concedidos
// exacta, y eso produce probabilidades de 0% o 100% en el resultado final
// (la auditoría de Fase 1, ronda 2, encontró 9 casos así en las 1600
// predicciones del backtest antes de este ajuste).
//
// Calibrado con barrido real sobre backtest(partidos, { pesoPrior }),
// 1600 predicciones, midiendo brierScore/logLoss/porcentajeAcierto de
// juez/notas.mjs (auditoría Fase 1, ronda 3):
//
//   pesoPrior   acierto   brier     logLoss   ceros/unos
//   0           50.56%    0.60269   1.06867   9
//   1           50.69%    0.59897   1.00372   0
//   2           50.81%    0.59711   1.00047   0
//   3           50.94%    0.59610   0.99888   0
//   4           51.19%    0.59556   0.99807   0   <- elegido
//   6           51.13%    0.59523   0.99765   0
//   8           51.00%    0.59544   0.99801   0
//   12          51.19%    0.59651   0.99970   0
//   20          50.69%    0.59946   1.00410   0
//   30          51.00%    0.60316   1.00946   0
//   60          48.69%    0.61179   1.02164   0
//   120         47.44%    0.62144   1.03498   0
//
// Meseta amplia entre 3 y 12 (todas las métricas casi empatadas); 4 queda
// cómodo en el medio, ni en el borde donde ceros/unos aparecen de nuevo (0)
// ni forzando el extremo donde el suavizado ya empieza a emparejar equipos
// distintos y las métricas empeoran (a partir de ~30).
export const PESO_PRIOR_PARTIDOS = 4;
