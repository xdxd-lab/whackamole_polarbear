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

test('reduced motion: the snow stands still', async () => {
  const game = await Game.open(harness, { reducedMotion: 'reduce' });
  try {
    const running = await game.page.$$eval('.snow-layer', layers => layers.flatMap(layer => layer.getAnimations()).length);
    assert.equal(running, 0);
  } finally {
    await game.close();
  }
});

test('reduced motion: hit feedback appears without animating, then clears', async () => {
  const game = await Game.open(harness, { reducedMotion: 'reduce' });
  const toast = async () => {
    await game.settle();
    return game.page.$eval('#toast', element => ({ opacity: getComputedStyle(element).opacity, animation: getComputedStyle(element).animationName }));
  };
  try {
    await game.startWith('penguin');
    await game.hitCurrent();
    assert.deepEqual(await toast(), { opacity: '1', animation: 'none' });
    await game.advance(549);
    assert.equal((await toast()).opacity, '1');
    await game.advance(1);
    assert.equal((await toast()).opacity, '0');
  } finally {
    await game.close();
  }
});

test('normal motion keeps the snow and the animated toast', async () => {
  const game = await Game.open(harness);
  try {
    const running = await game.page.$$eval('.snow-layer', layers => layers.flatMap(layer => layer.getAnimations()).length);
    assert.equal(running, 3);
    await game.startWith('penguin');
    await game.hitCurrent();
    assert.equal(await game.page.$eval('#toast', element => getComputedStyle(element).animationName), 'pop');
  } finally {
    await game.close();
  }
});
