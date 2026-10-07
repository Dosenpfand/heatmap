import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { resolvePath, server } from '../server.js';

let base;
before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('resolvePath blocks traversal and bad encodings', () => {
  assert.match(resolvePath('/../package.json'), /public\/package\.json$/); // clamped to public/
  assert.match(resolvePath('/%2e%2e/%2e%2e/package.json'), /public\/package\.json$/);
  assert.equal(resolvePath('/%zz'), null);
  assert.match(resolvePath('/'), /public\/index\.html$/);
});

test('serves index.html, 404s otherwise', async () => {
  const ok = await fetch(`${base}/`);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'text/html');
  assert.equal((await fetch(`${base}/missing.js`)).status, 404);
  assert.equal((await fetch(`${base}/../package.json`)).status, 404);
  assert.equal((await fetch(`${base}/`, { method: 'GET' })).status, 200);
});
