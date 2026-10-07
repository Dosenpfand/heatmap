import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mercX, mercY, rdp } from '../src/lib/geo.js';

test('mercator maps the world onto the unit square', () => {
  assert.equal(mercX(-180), 0);
  assert.equal(mercX(0), 0.5);
  assert.equal(mercX(180), 1);
  assert.ok(Math.abs(mercY(0) - 0.5) < 1e-12);
  assert.ok(mercY(60) < mercY(0), 'north is up');
});

test('rdp keeps short lines untouched', () => {
  assert.deepEqual(rdp([], []), []);
  assert.deepEqual(rdp([1, 2], [1, 2]), [0, 1]);
});

test('rdp drops collinear points', () => {
  const lon = [0, 0.001, 0.002, 0.003];
  const lat = [50, 50, 50, 50];
  assert.deepEqual(rdp(lon, lat), [0, 3]);
});

test('rdp keeps corners beyond the tolerance', () => {
  assert.deepEqual(rdp([0, 0.001, 0.001], [50, 50, 50.001]), [0, 1, 2]);
});

test('rdp drops deviations below the tolerance', () => {
  // ~0.1 m sideways wobble
  assert.deepEqual(rdp([0, 0.001, 0.002], [50, 50.000001, 50]), [0, 2]);
});

test('rdp handles closed loops (zero-length baseline)', () => {
  const idx = rdp([0, 0.001, 0.001, 0], [50, 50, 50.001, 50]);
  assert.deepEqual(idx, [0, 1, 2, 3]);
});
