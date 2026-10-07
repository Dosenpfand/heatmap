import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportSize, fitRatio } from '../src/lib/selection.js';

const sel = { x0: 0, y0: 0, x1: 4, y1: 2 };

test('exportSize scales the long side', () => {
  assert.deepEqual(exportSize(sel, 1000), [1000, 500]);
  assert.deepEqual(exportSize({ x0: 0, y0: 0, x1: 2, y1: 4 }, 1000), [500, 1000]);
  assert.deepEqual(exportSize(null, 1000), [0, 0]);
  assert.deepEqual(exportSize({ x0: 0, y0: 0, x1: 1e9, y1: 1 }, 100), [100, 1]);
});

test('fitRatio shrinks around the center', () => {
  assert.deepEqual(fitRatio(sel, 1), { x0: 1, x1: 3, y0: 0, y1: 2 });
  assert.deepEqual(fitRatio(sel, 4), { x0: 0, x1: 4, y0: 0.5, y1: 1.5 });
});

test('fitRatio is a no-op for free ratio or no selection', () => {
  assert.equal(fitRatio(sel, 0), sel);
  assert.equal(fitRatio(null, 1), null);
});
