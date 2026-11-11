/* Every control must be reachable without scrolling, because the page cannot scroll. */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { Game, startHarness } from './support/game.mjs';
import { VIEWPORTS } from './support/viewports.mjs';

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
        assertInside(await inspect(game, ['#startBtn', '#difficulty', '#soundBtn', '#score', '#time', '#best', '.credits', '.credits a:last-of-type']), label);
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

    test('the practice round mark takes no room from the game', async () => {
      const game = await Game.open(harness, { viewport });
      try {
        await game.startWith('penguin');
        const boxes = () => inspect(game, ['#board', '#startBtn', '.foot', '.credits']);
        const before = await boxes();
        await game.page.selectOption('#difficulty', 'hard');
        const marked = await boxes();
        assertInside(await inspect(game, ['#practiceMark', '#startBtn', '.credits a:last-of-type']), label);
        for (const selector of Object.keys(marked)) {
          for (const side of ['top', 'bottom', 'height']) {
            assert.ok(Math.abs(marked[selector][side] - before[selector][side]) < 0.5, `${label}: the practice mark moves or resizes ${selector} (${side} ${before[selector][side]} -> ${marked[selector][side]})`);
          }
        }
        assert.equal(await game.page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight), true, 'Page content is taller than the screen');
      } finally {
        await game.close();
      }
    });

    test('the music credits take no room from the game', async () => {
      const game = await Game.open(harness, { viewport });
      try {
        const boxes = () => inspect(game, ['#board', '#startBtn', '#best']);
        const withCredits = await boxes();
        await game.page.addStyleTag({ content: '.credits{display:none!important}' });
        const without = await boxes();
        for (const selector of Object.keys(without)) {
          for (const side of ['top', 'bottom', 'width', 'height']) {
            assert.ok(Math.abs(withCredits[selector][side] - without[selector][side]) < 0.5, `${label}: the credits move or resize ${selector} (${side} ${without[selector][side]} -> ${withCredits[selector][side]})`);
          }
        }
      } finally {
        await game.close();
      }
    });

    test('the panels beside or below the board stay together, without gaps between them', async () => {
      const game = await Game.open(harness, { viewport });
      try {
        const gaps = await game.page.evaluate(() => {
          const box = selector => document.querySelector(selector).getBoundingClientRect();
          const [top, card, progress, controls] = ['.top', '.card', '.progress', '.controls'].map(box);
          // Side by side, the title sits right above the time bar; stacked, the board is between them.
          const beside = card.right <= top.left;
          return [...(beside ? [progress.top - top.bottom] : []), controls.top - progress.bottom];
        });
        const gap = parseFloat(await game.page.evaluate(() => getComputedStyle(document.querySelector('.game')).rowGap));
        for (const between of gaps) assert.ok(between <= gap + 0.5, `${label}: ${between}px of empty space between the panels (gap ${gap}px)`);
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
