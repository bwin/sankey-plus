import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function serve() {
  const project = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  );
  const folder = path.join(project, 'demo-dist'),
    port = Number(process.env.PORT ?? 5178);
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.map': 'application/json',
  };
  return createServer(async (req, res) => {
    let file;
    try {
      const requestPath = new URL(req.url, 'http://localhost').pathname;
      file = path.resolve(
        folder,
        '.' +
          decodeURIComponent(requestPath === '/' ? '/index.html' : requestPath),
      );
    } catch {
      res.writeHead(400).end('Bad request');
      return;
    }
    if (!file.startsWith(folder + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const content = await fs.readFile(file);
      res.writeHead(200, {
        'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch {
      res.writeHead(404).end('Not found');
    }
  }).listen(port, '127.0.0.1', () =>
    console.log(`Sankey Plus demo: http://127.0.0.1:${port}`),
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  serve();
