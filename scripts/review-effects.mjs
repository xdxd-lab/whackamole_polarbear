// Pictures of the tap marks for a human review, in the engine WAM_BROWSER names: a hit on a
// penguin, a fox and a bear, and a tap on an empty hole, each frozen part-way through.
// Writes test-results/screens/<browser>/tap-<kind>.png. Checks nothing.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { BROWSER_NAME } from '../tests/support/browser.mjs';
import { Game, startHarness } from '../tests/support/game.mjs';
import { ROOT } from '../tests/support/server.mjs';

const out = path.join(ROOT, 'test-results', 'screens', BROWSER_NAME);
await mkdir(out, { recursive: true });
const harness = await startHarness();
/** Stops every tap mark a given part of the way through its animation. */
const freeze = (game, part) => game.page.evaluate(at => {
  for (const mark of document.querySelectorAll('#fx > *')) {
    for (const animation of mark.getAnimations()) { animation.pause(); animation.currentTime = animation.effect.getComputedTiming().duration * at; }
  }
}, part);
try {
  for (const [kind, species] of [['penguin', 'penguin'], ['fox', 'fox'], ['bear', 'bear'], ['empty', 'penguin']]) {
    const game = await Game.open(harness, { viewport: { width: 390, height: 844 } });
    try {
      await game.startWith(species, 4);
      await game.settle();
      await (kind === 'empty' ? game.hit(0) : game.hitCurrent());
      await freeze(game, 0.35);
      await game.page.locator('.card').screenshot({ path: path.join(out, `tap-${kind}.png`) });
    } finally {
      await game.close();
    }
  }
  console.log(`4 tap mark pictures in ${path.relative(ROOT, out)}`);
} finally {
  await harness.close();
}
