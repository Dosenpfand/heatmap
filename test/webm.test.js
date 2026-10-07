import assert from 'node:assert/strict';
import { test } from 'node:test';
import { element, muxWebM, uint } from '../src/lib/webm.js';

test('uint is big endian with minimum width', () => {
  assert.deepEqual([...uint(0)], [0]);
  assert.deepEqual([...uint(256)], [1, 0]);
  assert.deepEqual([...uint(1, 4)], [0, 0, 0, 1]);
});

test('element encodes id, 8-byte size and payload', () => {
  assert.deepEqual(
    [...element(0x1a45dfa3, new Uint8Array([7, 8]))],
    [0x1a, 0x45, 0xdf, 0xa3, 1, 0, 0, 0, 0, 0, 0, 2, 7, 8],
  );
});

test('muxWebM produces an EBML file with one cluster per keyframe', async () => {
  const frame = (t, key) => ({ t, key, d: new Uint8Array([1, 2, 3]) });
  const blob = muxWebM([frame(0, true), frame(33, false), frame(66, true)], 'V_VP9', 640, 480, 100);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 4)], [0x1a, 0x45, 0xdf, 0xa3]);
  const text = Buffer.from(bytes).toString('latin1');
  assert.ok(text.includes('webm') && text.includes('V_VP9'));
  const clusters = bytes.filter(
    (_, i) => bytes[i] === 0x1f && bytes[i + 1] === 0x43 && bytes[i + 2] === 0xb6 && bytes[i + 3] === 0x75,
  );
  assert.equal(clusters.length, 2);
  assert.equal(blob.type, 'video/webm');
});
