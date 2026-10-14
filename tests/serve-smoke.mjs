import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const parent = new URL('./smoke.html', import.meta.url);
const child = new URL('./smoke-frame.html', import.meta.url);

for (const [port, file] of [[8765, parent], [8766, child]]) {
  const page = await readFile(file);
  createServer((request, response) => {
    if (request.url?.startsWith('/favicon.ico')) {
      response.writeHead(204).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(page);
  }).listen(port, '127.0.0.1', () => {
    process.stdout.write(`Smoke page: http://127.0.0.1:${port}/\n`);
  });
}
