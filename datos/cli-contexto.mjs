// CLI para el flujo n8n 02-contexto.json: tabla de posiciones actual.
// No hace falta fecha -- la tabla de posiciones no es "de un día".
import { fileURLToPath } from 'node:url';
import { tablaPosiciones } from './api.mjs';

async function main() {
  const tabla = await tablaPosiciones();
  console.log(JSON.stringify({ equipos: tabla.length, tabla }));
}

const esEjecutadoDirectamente = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (esEjecutadoDirectamente) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
