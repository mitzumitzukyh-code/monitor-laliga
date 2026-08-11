// Detección de posibles inconsistencias de nombre de equipo entre temporadas
// (ej. "Ath Bilbao" vs "Athletic Club"). No corrige nada, solo avisa.

function distanciaLevenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

// Compara cada par de nombres distintos y devuelve los que se parecen
// demasiado como para ser equipos distintos (probable inconsistencia de grafía).
export function nombresSospechosos(nombres) {
  const lista = [...new Set(nombres)].sort();
  const sospechosos = [];
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      const a = lista[i];
      const b = lista[j];
      if (a.length > 4 && b.length > 4 && distanciaLevenshtein(a, b) <= 2) {
        sospechosos.push([a, b]);
      }
    }
  }
  return sospechosos;
}
