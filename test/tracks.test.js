import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodeDataset } from '../src/lib/dataset.js';
import { mercX, mercY } from '../src/lib/geo.js';
import { inRect, loadTracks } from '../src/lib/tracks.js';

test('loadTracks projects points and bounding boxes', () => {
  const pts = [8e6, 50e6, 9e6, 51e6];
  const buf = encodeDataset({ types: ['Run'], tracks: [[0, 2021, 0, 2, 8e6, 50e6, 9e6, 51e6, 123]] }, pts);
  const { types, tracks, xs, ys } = loadTracks(buf);
  assert.deepEqual(types, ['Run']);
  assert.equal(xs[1], mercX(9));
  assert.equal(ys[0], mercY(50));
  const [t] = tracks;
  assert.deepEqual([t.t, t.y, t.o, t.c, t.ts], [0, 2021, 0, 2, 123]);
  assert.ok(t.x0 < t.x1 && t.y0 < t.y1);
  assert.equal(t.y0, mercY(51));
  assert.equal(t.y1, mercY(50));
});

test('inRect honours the margin', () => {
  const t = { t: 0, y: 0, o: 0, c: 0, ts: 0, x0: 0.4, x1: 0.5, y0: 0.4, y1: 0.5 };
  assert.ok(inRect(t, 0.45, 0.45, 0.9, 0.9, 0));
  assert.ok(!inRect(t, 0.6, 0.6, 0.9, 0.9, 0));
  assert.ok(inRect(t, 0.6, 0.6, 0.9, 0.9, 0.11));
});
