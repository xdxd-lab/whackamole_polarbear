/* Damaged or missing character art must stop the game, never degrade it silently. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { BROWSER_NAME } from './support/browser.mjs';
import { Game, startHarness } from './support/game.mjs';
import { ROOT } from './support/server.mjs';

const manifest = JSON.parse(await readFile(path.join(ROOT, 'deployment/v16-release.json'), 'utf8'));
const fox = `/${manifest.atlases.fox.url}`;
const music = JSON.parse(await readFile(path.join(ROOT, 'deployment/music.json'), 'utf8'));
const MUSIC = music.tracks.flatMap(track => Object.values(track.files).map(file => `/${file.url}`));

async function failingLoad(override, expectedText) {
  const harness = await startHarness({ override });
  const game = await Game.open(harness, { ready: false });
  try {
    await game.page.waitForFunction(() => document.getElementById('modalTitle').textContent === '角色圖片未載入');
    assert.match(await game.page.textContent('#modalText'), expectedText);
    assert.equal(await game.page.isDisabled('#modalBtn'), true);
    assert.equal(await game.page.isDisabled('#startBtn'), true);
    assert.equal(await game.page.locator('#board .hole').count(), 0);
  } finally {
    await game.close();
    await harness.close();
  }
}

test('a corrupted image is rejected before play', () => failingLoad(
  pathname => pathname === fox ? { body: Buffer.alloc(manifest.atlases.fox.bytes) } : null,
  /圖檔完整性驗證失敗/,
));

test('a missing image stops the game', () => failingLoad(
  pathname => pathname === fox ? { status: 404 } : null,
  /HTTP 404/,
));

test('declares a favicon, so browsers do not request a missing one', async () => {
  const harness = await startHarness();
  const game = await Game.open(harness);
  try {
    assert.equal(await game.page.locator('link[rel="icon"]').count(), 1);
  } finally {
    await game.close();
    await harness.close();
  }
});

// On CI, Playwright's WebKit fetched the images again on a second visit even after leaving the page
// first, so it seems to keep no HTTP cache between page loads and this cannot be observed there.
const NO_HTTP_CACHE = BROWSER_NAME === 'webkit' && 'the test WebKit does not reuse cached images between page loads';

test('a repeat visit reuses cached images, as GitHub Pages allows for 10 minutes', { skip: NO_HTTP_CACHE }, async () => {
  const harness = await startHarness({ cacheControl: 'max-age=600' });
  const game = await Game.open(harness);
  const images = () => harness.server.requests.filter(request => request.pathname.endsWith('.avif')).length;
  try {
    assert.equal(images(), 3);
    // Leave first: going to the address already shown is a reload, and WebKit fetches everything again on a reload.
    await game.page.goto('about:blank');
    await game.page.goto(`${harness.server.origin}/`);
    await game.page.waitForFunction(() => document.getElementById('modalBtn')?.disabled === false && document.querySelectorAll('#board .hole').length === 9);
    assert.equal(images(), 3);
  } finally {
    await game.close();
    await harness.close();
  }
});

test('loads exactly the three official images, listed music and no retired files', async () => {
  const harness = await startHarness();
  const game = await Game.open(harness);
  try {
    const paths = harness.server.requests.map(request => request.pathname);
    const images = paths.filter(pathname => pathname.endsWith('.avif')).sort();
    assert.deepEqual(images, Object.values(manifest.atlases).map(atlas => `/${atlas.url}`).sort());
    assert.deepEqual(paths.filter(pathname => /\.webp$|assets\/(style\.css|app\.js)$/.test(pathname)), []);
    assert.deepEqual(paths.filter(pathname => pathname !== '/' && !pathname.endsWith('.avif') && !/\.(js|css)$/.test(pathname) && !MUSIC.includes(pathname)), []);
  } finally {
    await game.close();
    await harness.close();
  }
});
