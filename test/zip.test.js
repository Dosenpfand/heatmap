import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listZip, readEntry } from '../src/lib/zip.js';
import { makeZip } from './helpers.js';

for (const deflate of [true, false]) {
  test(`listZip/readEntry round trip (${deflate ? 'deflate' : 'stored'})`, async () => {
    const zip = makeZip({ 'a.txt': 'hello', 'dir/b.txt': 'world'.repeat(100) }, { deflate });
    const entries = await listZip(zip);
    assert.deepEqual(
      entries.map((e) => e.name),
      ['a.txt', 'dir/b.txt'],
    );
    assert.equal(new TextDecoder().decode(await readEntry(zip, entries[0])), 'hello');
    assert.equal(new TextDecoder().decode(await readEntry(zip, entries[1])), 'world'.repeat(100));
  });
}

test('listZip rejects non-zip input', async () => {
  await assert.rejects(listZip(new Blob(['not a zip file at all, really'])), /Not a zip/);
});

test('readEntry rejects unsupported compression', async () => {
  const zip = makeZip({ 'a.txt': 'x' });
  const [entry] = await listZip(zip);
  await assert.rejects(readEntry(zip, { ...entry, method: 99 }), /unsupported/);
});
