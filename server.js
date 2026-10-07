// Static file server only. All processing happens in the visitor's browser; no data is ever sent here.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));
/** @type {Record<string, string>} */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

/**
 * Maps a request URL to a file inside public/, or null if it escapes it.
 * @param {string} urlPath
 * @returns {string | null}
 */
export function resolvePath(urlPath) {
  let p;
  try {
    p = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  const file = join(PUBLIC_DIR, normalize(p === '/' ? '/index.html' : p));
  return file.startsWith(PUBLIC_DIR) ? file : null;
}

export const server = createServer(async (req, res) => {
  const file = resolvePath(req.url ?? '/');
  const isFile =
    file &&
    (await stat(file).then(
      (s) => s.isFile(),
      () => false,
    ));
  if (!isFile) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  createReadStream(file).pipe(res);
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8080);
  const host = process.env.HOST ?? '127.0.0.1';
  server.listen(port, host, () => console.log(`http://${host}:${port}`));
}
