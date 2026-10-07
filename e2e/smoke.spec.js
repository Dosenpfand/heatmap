import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { gpx, makeZip } from '../test/helpers.js';

/** A zip with 40 short runs/rides over four years. */
async function sampleZip() {
  const files = {};
  for (let i = 0; i < 40; i++) {
    const points = Array.from({ length: 60 }, (_, k) => [
      8.5 + k * 0.001 + i * 0.0003,
      50 + Math.sin(k / 6 + i) * 0.01 + i * 0.0005,
    ]);
    files[`activities/${i}.gpx`] = gpx(points, {
      type: i % 3 ? 'running' : 'cycling',
      time: `${2019 + (i % 4)}-05-04T10:00:00Z`,
    });
  }
  return Buffer.from(await makeZip(files).arrayBuffer());
}

/** Uncaught errors and console.error output seen by each test. */
const problems = new WeakMap();

test.beforeEach(({ page }) => {
  const list = [];
  problems.set(page, list);
  page.on('pageerror', (e) => list.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && list.push(`console.error: ${m.text()}`));
});

// Any error fails the test: this catches broken wiring between modules.
test.afterEach(({ page }) => {
  expect(problems.get(page)).toEqual([]);
});

test('import, render, persist and export', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loadmsg')).toContainText('No data yet');

  // import
  await page
    .locator('#upfile')
    .setInputFiles({ name: 'export.zip', mimeType: 'application/zip', buffer: await sampleZip() });
  await expect(page.locator('#upstat')).toContainText('Loaded 40 activities');
  await expect(page.locator('#count')).toHaveText('40 of 40 activities');
  await expect(page.locator('.chip')).toHaveText(['Run · 26', 'Ride · 14', '2019', '2020', '2021', '2022']);

  // the heat layer is drawn
  await expect
    .poll(() =>
      page.locator('#view').evaluate((c) => {
        const { data } = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')).getImageData(
          0,
          0,
          c.width,
          c.height,
        );
        let bright = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i] > 60) bright++;
        return bright;
      }),
    )
    .toBeGreaterThan(1000);

  // filtering updates the count
  await page.locator('.chip', { hasText: 'Ride' }).click();
  await expect(page.locator('#count')).toHaveText('26 of 40 activities');
  await page.locator('.chip', { hasText: 'Ride' }).click();

  // PNG export of a selected area
  await page.locator('#selbtn').click();
  await expect(page.locator('#selhint')).toContainText('Selection →');
  await page.locator('#px').selectOption('2000');
  const [png] = await Promise.all([page.waitForEvent('download'), page.locator('#exbtn').click()]);
  expect(png.suggestedFilename()).toMatch(/^heatmap_2000x\d+\.png$/);
  const head = (await readFile(await png.path())).subarray(0, 8);
  expect([...head]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // short video export (WebM via WebCodecs, or MediaRecorder as fallback)
  await page.locator('#fps').selectOption('24');
  await page.locator('#vpx').selectOption('1280');
  await page.locator('#durn').fill('1');
  const [video] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.locator('#vidbtn').click(),
  ]);
  expect(video.suggestedFilename()).toMatch(/^heatmap_\d+x\d+\.(webm|mp4)$/);
  expect((await readFile(await video.path())).length).toBeGreaterThan(1000);

  // the data survives a reload
  await page.reload();
  await expect(page.locator('#count')).toHaveText('40 of 40 activities');
  await expect(page.locator('#loading')).toHaveCount(0);
});

test('rejects a zip without activities', async ({ page }) => {
  await page.goto('/');
  const zip = Buffer.from(await makeZip({ 'readme.txt': 'x' }).arrayBuffer());
  await page.locator('#upfile').setInputFiles({ name: 'bad.zip', mimeType: 'application/zip', buffer: zip });
  await expect(page.locator('#loadmsg')).toContainText('Failed: No activities');
});
