/*
 * One version, written the same everywhere a person can read it.
 * Read from the running page, like every other test, so moving code around
 * cannot fail it. The rules for choosing the number are in docs/VERSIONING.md.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { Game, startHarness } from './support/game.mjs';
import { ROOT } from './support/server.mjs';

let harness;
before(async () => { harness = await startHarness(); });
after(() => harness.close());

test('the page, the README and the changelog agree on the version and its date', async () => {
  const game = await Game.open(harness);
  let page;
  try {
    page = await game.page.evaluate(() => ({
      version: document.documentElement.dataset.gameVersion,
      title: document.title,
      footer: document.querySelector('main > .tiny')?.textContent ?? '',
    }));
  } finally {
    await game.close();
  }
  const { version } = page;
  assert.match(version ?? '', /^\d+\.\d+\.\d+$/, 'The page must report its version as MAJOR.MINOR.PATCH');
  const major = version.split('.')[0];

  const changelog = await readFile(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  const latest = changelog.match(/^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/m);
  assert.ok(latest, 'CHANGELOG.md must have a "## [x.y.z] - YYYY-MM-DD" heading');
  assert.equal(latest[1], version, 'The newest CHANGELOG.md entry must be the version the page reports');
  const date = latest[2];

  assert.ok(page.footer.includes(`版本 ${version}（${date}）`), `The footer must read "版本 ${version}（${date}）", got "${page.footer}"`);
  assert.match(page.title, new RegExp(`V${major}$`), `The page title must end with V${major}`);
  const readme = await readFile(path.join(ROOT, 'README.md'), 'utf8');
  assert.ok(readme.includes(`**V${major}（${version}，${date}）**`), `README.md must present V${major}（${version}，${date}）as the current version`);
});
