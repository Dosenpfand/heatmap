import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normType, parseGpx } from '../src/lib/activity.js';
import { gpx } from './helpers.js';

test('normType normalizes sport names', () => {
  const cases = {
    Run: 'Run',
    running: 'Run',
    'Virtual Ride': 'Ride (virtual/e)',
    cycling: 'Ride',
    9: 'Ride',
    Walk: 'Walk',
    hiking: 'Hike',
    swimming: 'Swim',
    'Alpine Ski': 'Ski',
    kayaking: 'Kayaking',
  };
  for (const [input, expected] of Object.entries(cases)) assert.equal(normType(input), expected, input);
  assert.equal(normType(undefined), 'Other');
  assert.equal(normType(''), 'Other');
});

test('parseGpx extracts type, time and points', () => {
  const a = parseGpx(
    gpx([
      [1.5, 50],
      [1.6, 50.1],
    ]),
  );
  assert.equal(a.type, 'running');
  assert.equal(a.year, 2021);
  assert.equal(a.ts, Date.UTC(2021, 4, 4, 10) / 1000);
  assert.deepEqual(a.segs, [{ lon: [1.5, 1.6], lat: [50, 50.1] }]);
});

test('parseGpx handles negative coordinates and multiple segments', () => {
  const txt =
    '<time>2020-01-01T00:00:00Z</time><trkseg><trkpt lat="-33.5" lon="-70.5"/><trkpt lat="-33.6" lon="-70.6"/></trkseg><trkseg><trkpt lat="1" lon="2"/></trkseg>';
  const a = parseGpx(txt);
  assert.equal(a.segs.length, 1, 'single-point segments are dropped');
  assert.deepEqual(a.segs[0].lat, [-33.5, -33.6]);
});

test('parseGpx tolerates missing metadata', () => {
  const a = parseGpx('<trkseg></trkseg>');
  assert.deepEqual(a, { type: undefined, year: 0, ts: 0, segs: [] });
});
