import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeDataset } from '../src/lib/dataset.js';
import { build } from '../src/worker.js';
import { gpx, makeZip } from './helpers.js';

const line = (n, lat0 = 50) => Array.from({ length: n }, (_, i) => [8 + i * 0.001, lat0 + (i % 2 ? 0.001 : 0)]);

test('build produces a dataset from a zip of GPX files', async () => {
  const zip = makeZip({
    'activities/1.gpx': gpx(line(10)),
    'activities/2.gpx': gpx(line(5, 51), { type: 'cycling', time: '2022-01-01T00:00:00Z' }),
    'activities/empty.gpx': gpx([]),
    'activities/bad.fit': 'garbage',
    'other/3.gpx': gpx(line(5)),
  });
  const progress = [];
  const { meta, pts } = decodeDataset(await build(zip, (i, n) => progress.push([i, n])));
  assert.deepEqual(meta.types.slice(0, 2), ['Run', 'Ride']);
  assert.equal(meta.tracks.length, 2);
  const [type, year, offset, count, minX, minY, maxX, maxY] = meta.tracks[0];
  assert.deepEqual([type, year, offset, count], [0, 2021, 0, 10]);
  assert.equal(minX, 8e6);
  assert.equal(maxX, 8.009e6);
  assert.equal(minY, 50e6);
  assert.equal(maxY, 50.001e6);
  assert.equal(pts.length, (10 + 5) * 2);
  assert.equal(meta.tracks[1][1], 2022);
  assert.deepEqual(progress[0], [0, 4]);
});

test('build rejects archives without activities', async () => {
  await assert.rejects(build(makeZip({ 'readme.txt': 'x' })), /No activities/);
});

test('build rejects archives without GPS data', async () => {
  await assert.rejects(build(makeZip({ 'activities/1.gpx': gpx([]) })), /none contained GPS/);
});
