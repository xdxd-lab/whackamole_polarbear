/*
 * Full rounds, replayed with a fixed clock and random stream, compared line by
 * line with recordings taken from the released V18 game. Regenerate only when a
 * behaviour change is intended: UPDATE_GOLDEN=1 node --test tests/golden.test.mjs
 */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { Game, beside, startHarness } from './support/game.mjs';
import { ROOT } from './support/server.mjs';

// together: how many targets the board shows at once. Only hard sends pairs.
// wobble: the rhythm wobbles from a seeded stream; without it every wobble roll is the middle one.
const SCENARIOS = [
  { name: 'normal-no-hits', difficulty: 'normal', mode: 'none', reaction: 0, together: 1 },
  { name: 'normal-hit-everything', difficulty: 'normal', mode: 'all', reaction: 200, together: 1 },
  { name: 'normal-skip-bears', difficulty: 'normal', mode: 'skip-bears', reaction: 300, together: 1 },
  { name: 'easy-every-second', difficulty: 'easy', mode: 'every-2nd', reaction: 400, together: 1 },
  { name: 'hard-skip-bears', difficulty: 'hard', mode: 'skip-bears', reaction: 150, together: 2 },
  { name: 'hard-hit-everything', difficulty: 'hard', mode: 'all', reaction: 150, together: 2 },
  { name: 'normal-skip-bears-wobble', difficulty: 'normal', mode: 'skip-bears', reaction: 300, together: 1, wobble: true },
  { name: 'hard-skip-bears-wobble', difficulty: 'hard', mode: 'skip-bears', reaction: 150, together: 2, wobble: true },
];

/** The holes on the board in each recorded moment that shows more than one target. */
const crowded = trace => trace
  .map(line => line.trim().replace(/^\d+ /, '').split(' ')[0])
  .filter(board => board.includes(','))
  .map(board => board.split(',').map(target => Number(target.split(':')[0])));

let harness;
before(async () => { harness = await startHarness(); });
after(() => harness.close());

for (const scenario of SCENARIOS) {
  test(`round replays identically: ${scenario.name}`, async () => {
    const game = await Game.open(harness);
    try {
      await game.page.evaluate(({ mode, reaction }) => window.__test.setPolicy({ mode, reaction }), scenario);
      if (scenario.wobble) await game.seedWobble();
      await game.start({ difficulty: scenario.difficulty });
      await game.advance(31_000);
      const actual = (await game.trace()).join('\n') + '\n';
      const file = path.join(ROOT, 'tests/golden', `${scenario.name}.trace`);
      if (process.env.UPDATE_GOLDEN) await writeFile(file, actual);
      const expected = await readFile(file, 'utf8');
      assert.equal(actual, expected, `${scenario.name} no longer matches its recording`);
      const { maxActive } = await game.page.evaluate(() => window.__test.stats());
      assert.equal(maxActive, scenario.together, `Targets on the board at once in ${scenario.difficulty}`);
      for (const [first, second] of crowded(actual.trimEnd().split('\n'))) {
        assert.ok(!beside(first, second), `Two targets side by side in holes ${first} and ${second}`);
      }
      game.assertNoErrors();
    } finally {
      await game.close();
    }
  });
}
