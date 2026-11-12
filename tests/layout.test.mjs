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

/** The last link of the music credits that is on show: the last composer, or the one link that stands for them all. */
const lastCredit = game => game.page.evaluate(() => getComputedStyle(document.querySelector('.credits .short')).display === 'none' ? '.credits .names a:last-of-type' : '.credits .short');

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
        assertInside(await inspect(game, ['#startBtn', '#difficulty', '#soundBtn', '#score', '#time', '#best', '.credits', await lastCredit(game)]), label);
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
        await game.choose('easy');
        const marked = await boxes();
        assertInside(await inspect(game, ['#practiceMark', '#startBtn', await lastCredit(game)]), label);
        for (const side of ['left', 'width']) assert.ok(Math.abs(marked['.foot'][side] - before['.foot'][side]) < 0.5, `${label}: the practice mark changes the footer's ${side}`);
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

    test('the best score and the version share one line of the footer', async () => {
      // A record of three digits is the widest a player will see; fifteen digits cannot fit on a small screen,
      // and must run past the edge sooner than break the line in the middle of the date.
      for (const [best, fits] of [['888', true], ['888888888888888', false]]) {
        const game = await Game.open(harness, { viewport, storage: { wam_best_20260904v7: best } });
        try {
          const line = await game.page.evaluate(() => {
            const text = document.querySelector('.foot > span');
            const box = text.getBoundingClientRect();
            const foot = document.querySelector('.foot').getBoundingClientRect();
            return { shown: document.getElementById('best').textContent, width: foot.width, dated: getComputedStyle(text.querySelector('.date')).display !== 'none', height: box.height, fontSize: parseFloat(getComputedStyle(text).fontSize), spill: Math.max(foot.left - box.left, box.right - foot.right) };
          });
          assert.equal(line.shown, best, 'The footer must show the stored record');
          // Two lines of text are at least twice the font size high; one line never is.
          assert.ok(line.height < line.fontSize * 2, `${label}: with a record of ${best} the footer's first line is ${line.height}px high, more than one line of ${line.fontSize}px text`);
          // How wide the words are depends on the fonts a machine has, so the date goes by the room
          // the footer has, not by whether it happened to fit: under 330px there is none to spare.
          assert.equal(line.dated, line.width >= 330, `${label}: a footer ${line.width}px wide ${line.dated ? 'shows' : 'hides'} the release date`);
          if (fits) assert.ok(line.spill <= 0.5, `${label}: the footer's first line runs ${line.spill}px past the footer`);
        } finally {
          await game.close();
        }
      }
    });

    test('the music credits are never cut short', async () => {
      const game = await Game.open(harness, { viewport });
      try {
        // How wide the names are depends on the fonts of the machine, so this measures rather than
        // expects a width: the names are listed wherever they fit, and only there.
        const read = () => game.page.evaluate(() => {
          const credits = document.querySelector('.credits');
          const shown = selector => [...credits.querySelectorAll(selector)].filter(link => link.getClientRects().length);
          const cut = links => links.filter(link => {
            const text = document.createRange();
            text.selectNodeContents(link);
            return text.getBoundingClientRect().width > link.getBoundingClientRect().width + 0.5;
          }).map(link => link.textContent);
          const state = { names: shown('.names a').length, short: shown('.short').length, cut: cut([...shown('.names a'), ...shown('.short')]) };
          // Would the names have fitted, had the page listed them?
          const brief = credits.classList.contains('brief');
          credits.classList.remove('brief');
          state.namesFit = cut(shown('.names a')).length === 0;
          credits.classList.toggle('brief', brief);
          return state;
        });
        const check = (credits, when) => {
          assert.deepEqual(credits.cut, [], `${label}${when}: the credits are cut short`);
          assert.deepEqual([credits.names > 0, credits.short], credits.namesFit ? [true, 0] : [false, 1], `${label}${when}: the names ${credits.namesFit ? 'fit' : 'do not fit'}, yet the footer shows ${credits.names} of them and ${credits.short} short link`);
        };
        check(await read(), '');
        // Two more composers than today, and the screen turned or resized: the page fits the credits again.
        const listed = await game.page.evaluate(() => {
          const names = document.querySelector('.credits .names');
          for (const name of ['A Fifth Composer', 'A Sixth Composer']) {
            const link = names.querySelector('a').cloneNode();
            link.textContent = name;
            names.append('、', link);
          }
          dispatchEvent(new Event('resize'));
          return names.querySelectorAll('a').length;
        });
        const longer = await read();
        check(longer, ' with six composers');
        if (longer.names) assert.equal(longer.names, listed, `${label}: only ${longer.names} of ${listed} composers are listed`);
        // The smallest landscape screens have no room for six names in any font.
        if (width <= 568 && height <= 320) assert.equal(longer.short, 1, `${label}: six composers cannot fit a footer this narrow`);
      } finally {
        await game.close();
      }
    });

    test('more composers than fit stay on one line', async () => {
      const game = await Game.open(harness, { viewport });
      try {
        // Where the credits have a line of their own, that line is in the page's bottom margin: a second
        // line would fall off the screen. Two more composers than today must shorten the names, not wrap.
        const line = await game.page.evaluate(() => {
          const credits = document.querySelector('.credits');
          // On their own line the credits drop the words around the names.
          const ownLine = getComputedStyle(credits.querySelector('.label')).display === 'none';
          const names = credits.querySelector('.names');
          const height = () => credits.getBoundingClientRect().height;
          const before = height();
          for (const name of ['A Fifth Composer', 'A Sixth Composer']) {
            const link = names.querySelector('a').cloneNode();
            link.textContent = name;
            names.append('、', link);
          }
          return { ownLine, listed: getComputedStyle(names).display !== 'none', before, after: height() };
        });
        if (line.ownLine && line.listed) assert.ok(Math.abs(line.after - line.before) < 0.5, `${label}: six composers make the credits ${line.after}px high, not the ${line.before}px of one line`);
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
