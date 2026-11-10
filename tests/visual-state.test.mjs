/*
 * What each character looks like in each state, as computed styles rather than
 * screenshots: fonts differ between machines, these numbers do not. CSS can be
 * reorganised freely as long as the result stays the same.
 * Regenerate only for an intended visual change:
 * UPDATE_GOLDEN=1 node --test tests/visual-state.test.mjs
 */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { DIFFICULTY, Game, holeRoll, SPECIES_ROLL, spriteFrameDifference, startHarness } from './support/game.mjs';
import { ROOT } from './support/server.mjs';

const manifest = JSON.parse(await readFile(path.join(ROOT, 'deployment/v16-release.json'), 'utf8'));
const FRAME = { peek: 0, warning: 1, sneaky: 2, pain: 3, sad: 4 };
const VIEWPORTS = [{ width: 390, height: 844 }, { width: 1280, height: 720 }, { width: 844, height: 390 }];
const SPECIES = Object.keys(SPECIES_ROLL);

let harness;
before(async () => { harness = await startHarness(); });
after(() => harness.close());

const reach = {
  peek: async () => {},
  warning: game => game.advance(DIFFICULTY.normal.warning),
  sneaky: game => game.advance(DIFFICULTY.normal.hide),
  pain: async game => { await game.settle(); await game.hit(await game.activeIndex()); },
  sad: async game => { await game.settle(); await game.hit(await game.activeIndex()); await game.advance(220); },
};

function capture(page, species) {
  return page.evaluate(name => {
    const hole = document.querySelector(`#board .hole[data-character="${name}"]`);
    const mole = hole.querySelector('.mole');
    const style = getComputedStyle(mole);
    // clientWidth rounds to whole pixels, which would make these ratios drift with board size.
    const holeStyle = getComputedStyle(hole);
    const holeBox = hole.getBoundingClientRect();
    const holeWidth = holeBox.width - parseFloat(holeStyle.borderLeftWidth) - parseFloat(holeStyle.borderRightWidth);
    const holeHeight = holeBox.height - parseFloat(holeStyle.borderTopWidth) - parseFloat(holeStyle.borderBottomWidth);
    const percent = (value, base) => Math.round(parseFloat(value) / base * 100);
    const visible = [...mole.querySelectorAll('.sprite')].filter(sprite => getComputedStyle(sprite).display !== 'none');
    const sprite = visible[0];
    const spriteStyle = getComputedStyle(sprite);
    const spriteBox = sprite.getBoundingClientRect();
    const moleBox = mole.getBoundingClientRect();
    return {
      moleBottom: percent(style.bottom, holeHeight),
      moleLeft: percent(style.left, holeWidth),
      moleWidth: percent(style.width, holeWidth),
      moleHeight: percent(style.height, holeHeight),
      moleTransform: style.transform === 'none' ? 'none' : 'moved',
      moleAnimation: style.animationName,
      moleFilter: style.filter,
      moleVisibility: style.visibility,
      moleDisplay: style.display,
      moleTransition: `${style.transitionProperty} ${style.transitionDuration} ${style.transitionTimingFunction}`,
      holeShadeOpacity: getComputedStyle(hole, '::before').opacity,
      visibleSprites: visible.length,
      spriteOpacity: spriteStyle.opacity,
      spriteRepeat: spriteStyle.backgroundRepeat,
      // The drawn frame: contained in the mole box, centred, standing on its bottom edge.
      spriteWidth: Math.round(spriteBox.width / moleBox.width * 100),
      spriteHeight: Math.round(spriteBox.height / moleBox.height * 100),
      spriteCentreOffset: 0 + Math.round(((spriteBox.left + spriteBox.right) / 2 - (moleBox.left + moleBox.right) / 2) / moleBox.width * 100),
      spriteBottomGap: 0 + Math.round((moleBox.bottom - spriteBox.bottom) / moleBox.height * 100),
    };
  }, species);
}

function frameDifference(page, species, frame) {
  return spriteFrameDifference(page, `#board .hole[data-character="${species}"] .sprite`, manifest.atlases[species], frame);
}

test('every species and state matches its recorded look, at every viewport', async () => {
  const actual = {};
  for (const viewport of VIEWPORTS) {
    const game = await Game.open(harness, { viewport });
    let spawn = 0;
    for (const species of SPECIES) {
      for (const state of Object.keys(FRAME)) {
        spawn += 1;
        await game.queueRandom([holeRoll(spawn % 9), SPECIES_ROLL[species]]);
        await game.page.evaluate(() => document.getElementById('startBtn').click());
        await game.page.waitForFunction(() => !document.getElementById('overlay').classList.contains('show'));
        await reach[state](game);
        assert.equal(await game.state(), state);
        await game.settle();
        actual[`${viewport.width}x${viewport.height} ${species} ${state}`] = await capture(game.page, species);
        const difference = await frameDifference(game.page, species, FRAME[state]);
        assert.ok(difference < 2, `${species} ${state} shows the wrong sprite frame (difference ${difference})`);
      }
    }
    game.assertNoErrors();
    await game.close();
  }
  const file = path.join(ROOT, 'tests/golden/visual-states.json');
  if (process.env.UPDATE_GOLDEN) await writeFile(file, JSON.stringify(actual, null, 1) + '\n');
  assert.deepEqual(actual, JSON.parse(await readFile(file, 'utf8')));
});
