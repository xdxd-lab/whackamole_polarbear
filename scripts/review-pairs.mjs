// Pictures of hard's pairs for a human review, in the engine WAM_BROWSER names: two targets on a
// phone held upright and on its side, a pair with a bear, one target going down while the other
// stays, and both hit at once with their tap marks frozen part-way. The random rolls are fixed,
// so every run shows the same holes and animals. Writes test-results/screens/<browser>/pair-*.png.
// Checks nothing.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { BROWSER_NAME } from '../tests/support/browser.mjs';
import { Game, PAIR, startHarness } from '../tests/support/game.mjs';
import { ROOT } from '../tests/support/server.mjs';

const out = path.join(ROOT, 'test-results', 'screens', BROWSER_NAME);
await mkdir(out, { recursive: true });
const UPRIGHT = { width: 360, height: 740 };
const ON_ITS_SIDE = { width: 740, height: 360 };

/**
 * Stops the picture. Tap marks and the floating score stop `marks` of the way through, a hit
 * target's way down `down` of the way; everything else, the targets rising included, ends.
 */
const freeze = (game, { marks, down } = {}) => game.page.evaluate(({ marks, down }) => {
  const stop = (animation, part) => {
    animation.pause();
    animation.currentTime = animation.effect.getComputedTiming().duration * part;
  };
  for (const animation of document.getAnimations()) {
    const target = animation.effect?.target;
    if (!target || animation.effect.getComputedTiming().iterations === Infinity) continue;
    if (marks !== undefined && (target.closest('#fx') || target.id === 'toast')) stop(animation, marks);
    else if (down !== undefined && target.classList.contains('mole') && animation.constructor === Animation) stop(animation, down);
    else animation.finish();
  }
}, { marks, down });

// The pair rises in holes 3 and 5, the middle row's two ends: they share no edge.
const SCENES = [
  ['pair-upright', UPRIGHT, async game => {
    await game.toPair('penguin', 3, ['fox', 5]);
    await game.advance(PAIR.delay + 100);
    await freeze(game);
  }],
  ['pair-on-its-side', ON_ITS_SIDE, async game => {
    await game.toPair('penguin', 3, ['fox', 5]);
    await game.advance(PAIR.delay + 100);
    await freeze(game);
  }],
  ['pair-with-bear', UPRIGHT, async game => {
    await game.toPair('penguin', 3, ['bear', 5]);
    await game.advance(PAIR.delay + 100);
    await freeze(game);
  }],
  // The penguin was hit 250 ms ago: it is part-way down while the fox is still up.
  ['pair-one-down', UPRIGHT, async game => {
    await game.toPair('penguin', 3, ['fox', 5]);
    await game.advance(50);
    // Virtual time jumps, but a target rises in real time: let it finish before it is hit.
    await game.settle();
    await game.hit(3);
    await game.advance(250);
    await freeze(game, { down: 0.45 });
  }],
  // Both hit in the same moment: two sets of tap marks, and the fox's score over the penguin's.
  ['pair-both-hit', UPRIGHT, async game => {
    await game.toPair('penguin', 3, ['fox', 5]);
    await game.advance(PAIR.delay + 100);
    await game.settle();
    await game.page.evaluate(() => { window.__test.input(3); window.__test.input(5); });
    await freeze(game, { marks: 0.35 });
  }],
];

const harness = await startHarness();
try {
  for (const [name, viewport, play] of SCENES) {
    const game = await Game.open(harness, { viewport });
    try {
      await play(game);
      await game.page.screenshot({ path: path.join(out, `${name}.png`) });
    } finally {
      await game.close();
    }
  }
  console.log(`${SCENES.length} pair pictures in ${path.relative(ROOT, out)}`);
} finally {
  await harness.close();
}
