import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tilesForView, tileURL } from '../src/lib/tiles.js';

test('tileURL fills placeholders and wraps x', () => {
  assert.equal(tileURL('https://{s}.t/{z}/{x}/{y}{r}.png', 2, 5, 1), 'https://c.t/2/1/1@2x.png');
  assert.equal(tileURL('{z}/{x}/{y}', 2, -1, 0), '2/3/0');
});

test('tilesForView covers the viewport', () => {
  const W = 800;
  const H = 600;
  const S = 256 * 2 ** 4;
  const list = tilesForView('{z}/{x}/{y}', 0.5, 0.5, S, W, H, false);
  assert.ok(list.length > 0);
  for (const t of list) assert.ok(t.ts > 0);
  const minX = Math.min(...list.map((t) => t.px));
  const maxX = Math.max(...list.map((t) => t.px + t.ts));
  const minY = Math.min(...list.map((t) => t.py));
  const maxY = Math.max(...list.map((t) => t.py + t.ts));
  assert.ok(minX <= 0 && maxX >= W && minY <= 0 && maxY >= H);
});

test('tilesForView clamps y to the world and sharp mode goes deeper', () => {
  const S = 256 * 2 ** 3;
  const all = tilesForView('{z}/{x}/{y}', 0.5, 0, S, 400, 400, false);
  assert.ok(all.every((t) => !t.url.includes('/-')));
  const zoom = (l) => +l[0].url.split('/')[0];
  const sharp = tilesForView('{z}/{x}/{y}', 0.5, 0.5, S, 400, 400, true);
  const soft = tilesForView('{z}/{x}/{y}', 0.5, 0.5, S, 400, 400, false);
  assert.ok(zoom(sharp) < zoom(soft) + 1 && zoom(sharp) !== undefined);
});

test('presets are well-formed', async () => {
  const { PRESETS } = await import('../src/lib/tiles.js');
  assert.ok(PRESETS.length > 0);
  for (const p of PRESETS) {
    assert.equal(typeof p.name, 'string');
    assert.equal(typeof p.light, 'boolean');
    assert.equal(p.needsKey, p.url.includes('{key}'));
  }
});
