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
import { DIFFICULTY, Game, holeRoll, SPECIES_ROLL, startHarness } from './support/game.mjs';
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
    const visible = [...mole.querySelectorAll('img')].filter(img => getComputedStyle(img).display !== 'none');
    const image = visible[0];
    const imageStyle = getComputedStyle(image);
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
      visibleImages: visible.length,
      imageObjectFit: imageStyle.objectFit,
      imageObjectPosition: imageStyle.objectPosition,
      imageOpacity: imageStyle.opacity,
      imageWidth: percent(imageStyle.width, parseFloat(style.width)),
      imageHeight: percent(imageStyle.height, parseFloat(style.height)),
    };
  }, species);
}

function frameDifference(page, species, frame) {
  const { url, width, height } = manifest.atlases[species];
  return page.evaluate(async ({ name, url, width, height, frame }) => {
    const hole = document.querySelector(`#board .hole[data-character="${name}"]`);
    const shown = [...hole.querySelectorAll('img')].find(img => getComputedStyle(img).display !== 'none');
    const atlas = new Image();
    atlas.src = `/${url}`;
    await atlas.decode();
    const pixels = (source, sx) => {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(source, sx, 0, width, height, 0, 0, width, height);
      return context.getImageData(0, 0, width, height).data;
    };
    const a = pixels(shown, 0);
    const b = pixels(atlas, frame * width);
    let total = 0;
    for (let i = 0; i < a.length; i += 1) total += Math.abs(a[i] - b[i]);
    return total / a.length;
  }, { name: species, url, width, height, frame });
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
