/* Every control must be reachable without scrolling, because the page cannot scroll. */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { Game, startHarness } from './support/game.mjs';

const VIEWPORTS = [
  [390, 844], [430, 932], [390, 664], [360, 640], [320, 568],
  [768, 1024], [1024, 768],
  [1280, 720], [1366, 600], [1920, 1080],
];
const MIN_TOUCH_TARGET = 44;

let harness;
before(async () => { harness = await startHarness(); });
after(() => harness.close());

/** Reports each element's box and whether a tap at its centre reaches it. */
const inspect = (game, selectors) => game.page.evaluate(list => Object.fromEntries(list.map(selector => {
  const element = document.querySelector(selector);
  const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
  const atCentre = document.elementFromPoint(left + width / 2, top + height / 2);
  return [selector, {
    left, top, right, bottom, width, height,
    inside: left >= 0 && top >= 0 && right <= innerWidth && bottom <= innerHeight,
    reachable: Boolean(atCentre) && (atCentre === element || element.contains(atCentre)),
  }];
})), selectors);

function assertInside(boxes, label) {
  for (const [selector, box] of Object.entries(boxes)) {
    assert.ok(box.inside, `${label}: ${selector} is cut off (${JSON.stringify(box)})`);
    assert.ok(box.reachable, `${label}: ${selector} cannot be tapped`);
  }
}

for (const [width, height] of VIEWPORTS) {
  describe(`${width}x${height}`, () => {
    const viewport = { width, height };
    const label = `${width}x${height}`;

    test('controls are visible and tappable during a round', async () => {
      const game = await Game.open(harness, { viewport });
      try {
        await game.startWith('penguin');
        assertInside(await inspect(game, ['#startBtn', '#difficulty', '#soundBtn', '#score', '#time', '#best']), label);
        assert.equal(await game.page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight), true, 'Page content is taller than the screen');
      } finally {
        await game.close();
      }
    });

    test('the board is whole, square and large enough to tap', async () => {
      const game = await Game.open(harness, { viewport });
      try {
        const boxes = await inspect(game, ['#board', '.card']);
        const board = boxes['#board'];
        assert.ok(board.inside, `${label}: board is cut off (${JSON.stringify(board)})`);
        assert.ok(Math.abs(board.width - board.height) <= 1, `${label}: board is not square`);
        const card = boxes['.card'];
        assert.ok(Math.abs((board.left - card.left) - (card.right - board.right)) <= 1, `${label}: board is not centred in its panel`);
        assert.ok(Math.abs((board.top - card.top) - (card.bottom - board.bottom)) <= 1, `${label}: board is not centred in its panel`);
        const hole = await game.page.locator('#board .hole').first().boundingBox();
        assert.ok(hole.width >= MIN_TOUCH_TARGET && hole.height >= MIN_TOUCH_TARGET, `${label}: holes are too small (${hole.width}x${hole.height})`);
      } finally {
        await game.close();
      }
    });

    test('the start and result dialogs fit', async () => {
      const game = await Game.open(harness, { viewport });
      try {
        assertInside(await inspect(game, ['.modal', '#modalBtn']), `${label} start`);
        await game.startWith('fox');
        await game.hitCurrent();
        await game.advance(30_000);
        await game.page.waitForFunction(() => getComputedStyle(document.getElementById('overlay')).visibility === 'visible');
        await game.settle();
        assertInside(await inspect(game, ['.modal', '#modalBtn']), `${label} result`);
      } finally {
        await game.close();
      }
    });
  });
}
