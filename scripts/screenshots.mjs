// Screenshots for a human review of the layout, in the engine WAM_BROWSER names:
// the start screen and a round in play at every size the layout tests cover.
// Writes test-results/screens/<browser>/<width>x<height>-{start,round}.png. Checks nothing.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { BROWSER_NAME } from '../tests/support/browser.mjs';
import { Game, startHarness } from '../tests/support/game.mjs';
import { ROOT } from '../tests/support/server.mjs';
import { VIEWPORTS } from '../tests/support/viewports.mjs';

const out = path.join(ROOT, 'test-results', 'screens', BROWSER_NAME);
await mkdir(out, { recursive: true });
const harness = await startHarness();
try {
  for (const [width, height] of VIEWPORTS) {
    const game = await Game.open(harness, { viewport: { width, height } });
    try {
      await game.page.screenshot({ path: path.join(out, `${width}x${height}-start.png`) });
      await game.startWith('penguin', 4);
      await game.settle();
      await game.page.screenshot({ path: path.join(out, `${width}x${height}-round.png`) });
    } finally {
      await game.close();
    }
  }
  console.log(`${VIEWPORTS.length * 2} screenshots in ${path.relative(ROOT, out)}`);
} finally {
  await harness.close();
}
