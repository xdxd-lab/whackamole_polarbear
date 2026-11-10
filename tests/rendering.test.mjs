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

test('the snow loop ends exactly where it began', async () => {
  const game = await Game.open(harness);
  try {
    const layers = await game.page.$$eval('.snow-layer', elements => elements.map(element => {
      const animation = element.getAnimations()[0];
      const { duration } = animation.effect.getComputedTiming();
      const at = time => { animation.currentTime = time; const matrix = new DOMMatrix(getComputedStyle(element).transform); return [matrix.m41, matrix.m42]; };
      animation.pause();
      const [x0, y0] = at(0);
      const [x1, y1] = at(duration / 2);
      animation.play();
      return {
        name: element.className,
        tile: parseFloat(getComputedStyle(element).backgroundSize),
        across: (x1 - x0) * 2,
        down: (y1 - y0) * 2,
        // Before it leans: the layer must reach one loop above the screen, and to every edge.
        covers: element.offsetTop <= -(y1 - y0) * 2 && element.offsetTop + element.offsetHeight >= innerHeight
          && element.offsetLeft <= 0 && element.offsetLeft + element.offsetWidth >= innerWidth,
      };
    }));
    assert.equal(layers.length, 3);
    for (const { name, tile, across, down, covers } of layers) {
      const tiles = down / tile;
      assert.ok(tiles >= 1 && Math.abs(tiles - Math.round(tiles)) < 0.001, `${name} falls ${down}px per loop, which is not a whole number of its ${tile}px tiles`);
      assert.ok(Math.abs(across / tile - Math.round(across / tile)) < 0.001, `${name} drifts ${across}px per loop, which is not a whole number of tiles`);
      assert.ok(covers, `${name} leaves part of the screen without snow at the start of a loop`);
    }
  } finally {
    await game.close();
  }
});

test('holes do not look like default buttons', async () => {
  const game = await Game.open(harness);
  try {
    const style = await game.page.$eval('#board .hole', element => {
      const { borderTopWidth, borderLeftWidth, paddingTop, paddingLeft } = getComputedStyle(element);
      return { borderTopWidth, borderLeftWidth, paddingTop, paddingLeft };
    });
    assert.deepEqual(style, { borderTopWidth: '0px', borderLeftWidth: '0px', paddingTop: '0px', paddingLeft: '0px' });
  } finally {
    await game.close();
  }
});

const marks = game => game.page.$$eval('#fx > *', elements => elements.map(element => element.className).sort());

test('a tap leaves a mark coloured by what it hit, which then disappears', async () => {
  const game = await Game.open(harness);
  try {
    await game.startWith('penguin', 4);
    await game.hit(0);
    assert.deepEqual(await marks(game), ['ripple miss'], 'A tap on an empty hole shows a plain ring');
    await game.settle();
    await game.page.waitForFunction(() => document.querySelectorAll('#fx > *').length === 0);
    await game.nextSpawn('bear', 2);
    await game.hitCurrent();
    assert.deepEqual(await marks(game), ['dot normal', 'ripple normal']);
    await game.settle();
    await game.advance(640);
    await game.hitCurrent();
    assert.deepEqual(await marks(game), ['dot bad', 'ripple bad']);
    await game.settle();
    await game.page.waitForFunction(() => document.querySelectorAll('#fx > *').length === 0);
    game.assertNoErrors();
  } finally {
    await game.close();
  }
});

test('a tap mark appears where the finger landed and never blocks the next tap', async () => {
  const game = await Game.open(harness);
  try {
    await game.startWith('penguin', 4);
    const box = await game.page.locator('#board .hole').nth(4).boundingBox();
    const point = { x: box.x + box.width * 0.25, y: box.y + box.height * 0.7 };
    await game.page.mouse.click(point.x, point.y);
    const centre = await game.page.$eval('#fx .ripple', element => {
      for (const animation of element.getAnimations()) animation.pause();
      const { left, top, width, height } = element.getBoundingClientRect();
      return { x: left + width / 2, y: top + height / 2, target: document.elementFromPoint(left + width / 2, top + height / 2).className };
    });
    assert.ok(Math.abs(centre.x - point.x) < 1 && Math.abs(centre.y - point.y) < 1, `Ring is centred at ${centre.x},${centre.y}, the tap was at ${point.x},${point.y}`);
    assert.match(centre.target, /hole/, 'The mark must let taps through to the hole');
    assert.equal(await game.number('#score'), 1);
  } finally {
    await game.close();
  }
});

test('reduced motion: a tap mark fades in place instead of spreading', async () => {
  const game = await Game.open(harness, { reducedMotion: 'reduce' });
  try {
    await game.startWith('penguin', 4);
    await game.hitCurrent();
    const sizes = await game.page.$eval('#fx .ripple', element => {
      const animation = element.getAnimations()[0];
      animation.pause();
      const width = time => { animation.currentTime = time; return element.getBoundingClientRect().width; };
      return [width(0), width(349)];
    });
    assert.equal(sizes[0], sizes[1]);
    assert.equal(await game.page.$$eval('.mole img', images => images.flatMap(image => image.getAnimations()).length), 0, 'The character must not bounce');
  } finally {
    await game.close();
  }
});

test('the score message appears by the hole that was hit and stays on screen', async () => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1280, height: 720 }]) {
    for (const hole of [0, 2, 8]) {
      const game = await Game.open(harness, { viewport, reducedMotion: 'reduce' });
      try {
        await game.startWith('bear', hole);
        await game.settle();
        await game.hitCurrent();
        await game.settle();
        const { message, target, scoreboard, area } = await game.page.evaluate(index => {
          const box = element => { const { left, top, right, bottom } = element.getBoundingClientRect(); return { left, top, right, bottom }; };
          return {
            message: box(document.getElementById('toast')),
            target: box(document.querySelectorAll('#board .hole')[index]),
            scoreboard: box(document.querySelector('.scoreboard')),
            area: box(document.getElementById('fx')),
          };
        }, hole);
        const label = `${viewport.width}x${viewport.height}, hole ${hole + 1}`;
        assert.ok(message.left >= area.left && message.right <= area.right && message.top >= 0, `${label}: the message leaves the board area (${JSON.stringify({ message, area })})`);
        assert.ok(message.bottom <= target.top + (target.bottom - target.top) * 0.25, `${label}: the message covers the character`);
        assert.ok(message.right > target.left && message.left < target.right, `${label}: the message is not above the hole that was hit`);
        const overlapsScoreboard = message.left < scoreboard.right && message.right > scoreboard.left && message.top < scoreboard.bottom && message.bottom > scoreboard.top;
        assert.ok(!overlapsScoreboard, `${label}: the message covers the scoreboard`);
        game.assertNoErrors();
      } finally {
        await game.close();
      }
    }
  }
});
