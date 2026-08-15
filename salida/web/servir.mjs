// Servidor estático mínimo para ver el panel en el navegador.
//
//   node salida/web/servir.mjs      ->  http://127.0.0.1:4321
//
// El panel es un HTML autocontenido: también se abre con doble click. Esto
// existe para tener una URL estable y poder recargar mientras se itera.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const PUERTO = Number(process.env.PUERTO) || 4321;
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

createServer(async (req, res) => {
  const ruta = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    const datos = await readFile(new URL('.' + ruta, import.meta.url));
    res.writeHead(200, {
      'Content-Type': TIPOS[extname(ruta)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(datos);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('no existe: ' + ruta + '\n\n¿corriste "node salida/web/generar.mjs" primero?');
  }
}).listen(PUERTO, '127.0.0.1', () => {
  console.log('panel en http://127.0.0.1:' + PUERTO);
});
