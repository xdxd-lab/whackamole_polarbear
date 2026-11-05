/*
 * Full rounds, replayed with a fixed clock and random stream, compared line by
 * line with recordings taken from the released V18 game. Regenerate only when a
 * behaviour change is intended: UPDATE_GOLDEN=1 node --test tests/golden.test.mjs
 */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { Game, startHarness } from './support/game.mjs';
import { ROOT } from './support/server.mjs';

const SCENARIOS = [
  { name: 'normal-no-hits', difficulty: 'normal', mode: 'none', reaction: 0 },
  { name: 'normal-hit-everything', difficulty: 'normal', mode: 'all', reaction: 200 },
  { name: 'normal-skip-bears', difficulty: 'normal', mode: 'skip-bears', reaction: 300 },
  { name: 'easy-every-second', difficulty: 'easy', mode: 'every-2nd', reaction: 400 },
  { name: 'hard-skip-bears', difficulty: 'hard', mode: 'skip-bears', reaction: 150 },
];

let harness;
before(async () => { harness = await startHarness(); });
after(() => harness.close());

for (const scenario of SCENARIOS) {
  test(`round replays identically: ${scenario.name}`, async () => {
    const game = await Game.open(harness);
    try {
      await game.page.evaluate(({ mode, reaction }) => window.__test.setPolicy({ mode, reaction }), scenario);
      await game.start({ difficulty: scenario.difficulty });
      await game.advance(31_000);
      const actual = (await game.trace()).join('\n') + '\n';
      const file = path.join(ROOT, 'tests/golden', `${scenario.name}.trace`);
      if (process.env.UPDATE_GOLDEN) await writeFile(file, actual);
      const expected = await readFile(file, 'utf8');
      assert.equal(actual, expected, `${scenario.name} no longer matches its recording`);
      const { maxActive } = await game.page.evaluate(() => window.__test.stats());
      assert.equal(maxActive, 1, 'At most one character may be on the board');
      game.assertNoErrors();
    } finally {
      await game.close();
    }
  });
}
