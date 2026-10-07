import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDuration, segmentStats, statItems, sumStats, timeline } from '../src/lib/stats.js';

test('segmentStats: distance, moving time and noise-filtered elevation gain', () => {
  // ~111.2 m per 0.001 degree of latitude
  const lat = [0, 0.001, 0.002, 0.003];
  const lon = [0, 0, 0, 0];
  const s = segmentStats(lon, lat, [100, 101, 110, 105], [0, 10, 20, 1000]);
  assert.ok(Math.abs(s.dist - 333.6) < 1, `dist ${s.dist}`);
  assert.equal(s.time, 20, 'the 980 s pause (0.1 m/s) is not moving time');
  assert.equal(s.gain, 10, '+1 m is noise, then 101 -> 110 counts as 9; the 5 m drop is ignored');
});

test('segmentStats tolerates missing elevation and time', () => {
  const s = segmentStats([0, 0.001], [0, 0], [NaN, NaN], [NaN, NaN]);
  assert.equal(s.gain, 0);
  assert.equal(s.time, 0);
  assert.ok(s.dist > 100);
});

const tr = (ts, d, g, s, n = 1) => ({ ts, d, g, s, n });

test('sumStats counts activities once and distinct days', () => {
  const s = sumStats([
    tr(86400 * 10, 1000, 10, 60),
    tr(86400 * 10 + 5, 0, 0, 0, 0),
    tr(86400 * 10 + 9, 500, 5, 30),
    tr(86400 * 12, 100, 0, 5),
  ]);
  assert.deepEqual(s, { count: 3, dist: 1600, gain: 15, time: 95, days: 2, detailed: true });
});

test('statItems hides distance/elevation/time for data without them', () => {
  assert.deepEqual(
    statItems(sumStats([tr(86400, 0, 0, 0)])).map(([l]) => l),
    ['Activities', 'Active days'],
  );
  assert.equal(statItems(sumStats([tr(86400, 5000, 20, 600)])).length, 5);
});

test('timeline gives running totals', () => {
  const at = timeline([tr(100, 1000, 0, 0), tr(200, 2000, 0, 0), tr(300, 4000, 0, 0)]);
  assert.equal(at(50).count, 0);
  assert.equal(at(50).detailed, true);
  assert.equal(at(200).dist, 3000);
  assert.equal(at(1e9).dist, 7000);
});

test('formatDuration', () => {
  assert.equal(formatDuration(3900), '1 h 05 m');
  assert.equal(formatDuration(86400 * 2), '48 h');
});
