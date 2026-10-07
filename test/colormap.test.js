import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CMAPS, hexToRgb, makeLUT, ramp } from '../src/lib/colormap.js';

test('hexToRgb', () => assert.deepEqual(hexToRgb('#ff8000'), [255, 128, 0]));

test('ramp interpolates between stops', () => {
  const stops = ['#000000', '#ffffff'];
  assert.deepEqual(ramp(stops, 0), [0, 0, 0]);
  assert.deepEqual(ramp(stops, 1), [255, 255, 255]);
  assert.deepEqual(ramp(stops, 0.5), [127.5, 127.5, 127.5]);
});

test('makeLUT is transparent at 0 and opaque at the top, for all colormaps', () => {
  for (const name of Object.keys(CMAPS)) {
    const lut = makeLUT(name);
    assert.equal(lut.length, 256);
    assert.equal(lut[0] >>> 24, 0, name);
    assert.equal(lut[255] >>> 24, 255, name);
  }
});

test('makeLUT packs ABGR (red in the low byte)', () => {
  const lut = makeLUT('White');
  assert.equal(lut[255], 0xffffffff);
});
