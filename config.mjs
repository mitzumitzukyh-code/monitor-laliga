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
// juez/notas.mjs. Columna brier con la fórmula OFICIAL (normalizada por
// K=3, ver PLAN.md) — recalculada en la auditoría de cierre (ronda 4)
// porque la tabla original (ronda 3) se escribió cuando brierScore()
// todavía usaba la fórmula sin normalizar; el patrón de comentario
// desactualizado ya había costado la ronda 3, no se repite dos veces:
//
//   pesoPrior   acierto   brier     logLoss   ceros/unos
//   0           50.56%    0.20090   1.06867   9
//   1           50.69%    0.19966   1.00372   0
//   2           50.81%    0.19904   1.00047   0
//   3           50.94%    0.19870   0.99888   0
//   4           51.19%    0.19852   0.99807   0   <- elegido
//   6           51.13%    0.19841   0.99765   0
//   8           51.00%    0.19848   0.99801   0
//   12          51.19%    0.19884   0.99970   0
//   20          50.69%    0.19982   1.00410   0
//   30          51.00%    0.20105   1.00946   0
//   60          48.69%    0.20393   1.02164   0
//   120         47.44%    0.20715   1.03498   0
//
// Meseta amplia entre 3 y 12 (todas las métricas casi empatadas); 4 queda
// cómodo en el medio, ni en el borde donde ceros/unos aparecen de nuevo (0)
// ni forzando el extremo donde el suavizado ya empieza a emparejar equipos
// distintos y las métricas empeoran (a partir de ~30).
export const PESO_PRIOR_PARTIDOS = 4;

// --- Fase 2: ausencias (lesionados y banca) — AJUSTE BOTADO, NO ACTIVO ---
// Veredicto de juez/comparar.mjs (regla 4): con los coeficientes de arranque
// de abajo, el ajuste EMPEORA la nota (acierto 51.2%->50.7%, brier
// 0.1985->0.1987, logLoss 0.9981->0.9990 sobre las 1600 predicciones reales).
//
// Se intentó calibrar antes de botarlo: barrido de 68 combinaciones
// (umbralRegular x tope de impacto x semividaJornadasJugador x coefGolPor90)
// sobre el mismo backtest. El mejor punto encontrado (umbralRegular=0.95,
// tope=0.03, semivida=20) da una mejora de apenas 0.055% relativo en Brier
// (0.19852 -> 0.19841) y NO es consistente por temporada: mejora en 3 de 5
// (2021-22, 2023-24, 2024-25) y empeora en las otras 2 (2022-23, 2025-26).
// Eso es la firma de ruido de haber probado 68 combinaciones sobre el mismo
// histórico que después se mide (el "mejor de muchos intentos" casi siempre
// gana por azar, no por señal real) — no de una mejora genuina.
//
// Conclusión: el proxy de "quién no arrancó del 11 esperado" (sin saber si
// fue lesión, descanso o decisión técnica) es demasiado ruidoso con los
// datos disponibles para mejorar la predicción. El código queda en el repo,
// probado y documentado (motor/ausencias.mjs, juez/comparar.mjs), pero
// backtest() NO lo aplica por defecto — hay que pasar ajustarLambdas
// explícitamente para activarlo, y Fase 3 no debe hacerlo. Si algún día se
// consigue el motivo real de la ausencia (lesión vs rotación vs suspensión),
// vale la pena reintentarlo — el problema no fue la fontanería, fue la
// calidad de la señal.
//
// Los coeficientes de abajo quedan como estaban en el barrido (no tiene
// sentido "calibrarlos más" hacia arriba cuando la conclusión es no usar
// el ajuste), documentados para quien retome esto más adelante.

// Vida media (en partidos jugados del propio jugador, no del equipo) del
// decaimiento al calcular cuota de minutos y goles por 90 de un jugador.
// Deliberadamente más corta que SEMIVIDA_JORNADAS (150): la titularidad de
// un jugador cambia mucho más rápido que la fuerza global de un equipo
// (lesiones, pérdida de forma, cambio de entrenador).
export const SEMIVIDA_JORNADAS_JUGADOR = 10;

// Cuota mínima de minutos (0 a 1) para considerar a un jugador "regular".
// Si un jugador con cuotaMinutos por debajo de esto no arranca, no cuenta
// como ausencia — nunca fue un titular fijo, no hay nada que "perder".
export const UMBRAL_MINUTOS_REGULAR = 0.5;

// Cuánto pesa cada gol por 90 minutos extra en la importancia de un
// jugador (ver motor/ausencias.mjs:pesoAusente).
export const COEF_GOL_POR_90 = 2.0;

// Importancia base por posición (0 a 1): qué tan "insustituible" es en
// general un jugador de esa posición, antes de mirar minutos o goles.
export const IMPORTANCIA_BASE_POSICION = {
  portero: 0.9,
  defensa: 0.8,
  medio: 0.85,
  delantero: 0.8,
};

// Qué fracción de la importancia de un jugador ausente golpea el ataque
// del equipo (impactoOfensivo) según su posición. Un portero ausente casi
// no afecta el ataque; un delantero, sí y mucho.
export const FACTOR_OFENSIVO_POSICION = {
  portero: 0,
  defensa: 0.15,
  medio: 0.5,
  delantero: 1.0,
};

// Simétrico: qué fracción golpea la defensa (impactoDefensivo).
export const FACTOR_DEFENSIVO_POSICION = {
  portero: 1.0,
  defensa: 1.0,
  medio: 0.5,
  delantero: 0.1,
};

// Tope al impacto total (ofensivo y defensivo) que las ausencias pueden
// aplicar sobre un lambda, aunque falte todo el equipo titular. Sin este
// tope, un caso extremo (5+ regulares ausentes) podría desplomar o disparar
// un lambda a algo absurdo.
export const TOPE_IMPACTO_OFENSIVO = 0.35;
export const TOPE_IMPACTO_DEFENSIVO = 0.35;

// --- Fase 4: mensajes de Discord ---

// mensajeAlineacion() solo avisa si el cambio en alguna de las tres
// probabilidades (local/empate/visitante) pasa este umbral. 0.03 = 3 puntos
// porcentuales, tal cual lo pide PLAN.md ("solo si cambió más de 3 puntos").
// Un cambio menor no vale una notificación — sería ruido.
export const UMBRAL_CAMBIO_ALINEACION = 0.03;
