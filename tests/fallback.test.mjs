/*
 * Browsers without AVIF (iOS 15 and older) must still see every character,
 * drawn from verified WebP or PNG sheets, and a sheet that cannot be decoded
 * must stop the game with a message instead of a blank board.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { failDecoding, Game, holeRoll, SPECIES_ROLL, spriteFrameDifference, startHarness } from './support/game.mjs';
import { ROOT } from './support/server.mjs';

const manifest = JSON.parse(await readFile(path.join(ROOT, 'deployment/v16-release.json'), 'utf8'));
const SPECIES = Object.keys(manifest.atlases);

async function playWithout(before, format) {
  const harness = await startHarness();
  const game = await Game.open(harness, { before });
  try {
    const images = harness.server.requests.map(request => request.pathname).filter(pathname => /\.(avif|webp|png)$/.test(pathname)).sort();
    assert.deepEqual(images, SPECIES.map(name => `/${manifest.fallbacks[format][name].url}`).sort(), `loads only the ${format} sheets`);
    assert.equal(await game.page.evaluate(() => document.documentElement.dataset.spriteFormat), format);
    const points = { bear: 0, fox: 3, penguin: 1 };
    for (const [index, species] of SPECIES.entries()) {
      await game.queueRandom([holeRoll(index), SPECIES_ROLL[species]]);
      await game.page.evaluate(() => document.getElementById('startBtn').click());
      await game.page.waitForFunction(() => !document.getElementById('overlay').classList.contains('show'));
      const selector = `#board .hole[data-character="${species}"] .sprite`;
      // Compared with the official AVIF frame: the fallback must look the same.
      const peek = await spriteFrameDifference(game.page, selector, manifest.atlases[species], 0);
      assert.ok(peek < 2, `${format} ${species} peek differs from the official art (${peek})`);
      await game.advance(100);
      await game.hit(index);
      const pain = await spriteFrameDifference(game.page, selector, manifest.atlases[species], 3);
      assert.ok(pain < 2, `${format} ${species} pain differs from the official art (${pain})`);
      assert.equal(await game.number('#score'), points[species], `${format} ${species} scores as usual`);
    }
    game.assertNoErrors();
  } finally {
    await game.close();
    await harness.close();
  }
}

test('without AVIF the game plays from the verified WebP sheets', () => playWithout(failDecoding('data:image/avif'), 'webp'));

test('without AVIF or WebP the game plays from the verified PNG sheets', () => playWithout(failDecoding('data:image/avif', 'data:image/webp'), 'png'));

test('a corrupted fallback sheet is rejected before play', async () => {
  const fox = `/${manifest.fallbacks.webp.fox.url}`;
  const harness = await startHarness({ override: pathname => pathname === fox ? { body: Buffer.alloc(manifest.fallbacks.webp.fox.bytes) } : null });
  const game = await Game.open(harness, { ready: false, before: failDecoding('data:image/avif') });
  try {
    await game.page.waitForFunction(() => document.getElementById('modalTitle').textContent === '角色圖片未載入');
    assert.match(await game.page.textContent('#modalText'), /fox: 圖檔完整性驗證失敗/);
    assert.equal(await game.page.isDisabled('#modalBtn'), true);
  } finally {
    await game.close();
    await harness.close();
  }
});

test('a sheet the browser cannot decode stops the game with a message', async () => {
  const harness = await startHarness();
  const game = await Game.open(harness, { ready: false, before: failDecoding('blob:') });
  try {
    await game.page.waitForFunction(() => document.getElementById('modalTitle').textContent === '角色圖片未載入');
    assert.match(await game.page.textContent('#modalText'), /圖片解碼失敗/);
    assert.equal(await game.page.isDisabled('#modalBtn'), true);
    assert.equal(await game.page.isDisabled('#startBtn'), true);
    assert.equal(await game.page.locator('#board .hole').count(), 0);
  } finally {
    await game.close();
    await harness.close();
  }
});
