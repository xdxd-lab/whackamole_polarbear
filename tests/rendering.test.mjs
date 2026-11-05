/* Costs and accessibility promises that are easy to undo by accident. */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Game, startHarness } from './support/game.mjs';

let harness;
before(async () => { harness = await startHarness(); });
after(() => harness.close());

test('nothing re-blurs the animated background on every frame', async () => {
  const game = await Game.open(harness);
  try {
    const blurred = await game.page.evaluate(() => [...document.querySelectorAll('body *')]
      .filter(element => getComputedStyle(element).backdropFilter !== 'none')
      .map(element => element.className || element.tagName));
    assert.deepEqual(blurred, []);
  } finally {
    await game.close();
  }
});

test('panels stay opaque enough to read without the blur', async () => {
  const game = await Game.open(harness);
  try {
    const background = await game.page.evaluate(() => getComputedStyle(document.querySelector('.brand')).backgroundColor);
    assert.ok(Number(background.match(/[\d.]+/g)[3]) >= 0.9, `Panel background is ${background}`);
  } finally {
    await game.close();
  }
});
