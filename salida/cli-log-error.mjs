// CLI para el flujo n8n 99-errores.json. Fase 3: sin webhook de Discord
// todavía (eso es Fase 4, sin conectar) -- solo imprime el mensaje
// formateado, que queda en el log de ejecución de n8n. logError() ya está
// probado en pruebas/discord.test.mjs.
import { fileURLToPath } from 'node:url';
import { logError } from './discord.mjs';

function main() {
  const [flujo, nodo, mensaje] = process.argv.slice(2);
  const payload = logError(flujo || 'desconocido', nodo || 'desconocido', mensaje || 'sin detalle');
  console.log(payload.content);
}

const esEjecutadoDirectamente = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (esEjecutadoDirectamente) {
  main();
}
