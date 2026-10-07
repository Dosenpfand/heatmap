import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeDataset, encodeDataset } from '../src/lib/dataset.js';

test('dataset round trip, for every padding length', () => {
  for (let n = 0; n < 5; n++) {
    const meta = { types: ['Run'.repeat(n + 1)], tracks: [[0, 2020, 0, 2, 1, 2, 3, 4, 99]] };
    const pts = [1000000, -2000000, 3, 4];
    const buf = encodeDataset(meta, pts);
    const out = decodeDataset(buf);
    assert.deepEqual(out.meta, meta);
    assert.deepEqual([...out.pts], pts);
  }
});
