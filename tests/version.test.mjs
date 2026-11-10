/*
 * One version, written the same everywhere a person can read it.
 * The rules for choosing the number are in docs/VERSIONING.md.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { ROOT } from './support/server.mjs';

const read = name => readFile(path.join(ROOT, name), 'utf8');

test('the page, the README and the changelog agree on the version and its date', async () => {
  const html = await read('index.html');
  const version = html.match(/const VERSION = '(\d+\.\d+\.\d+)';/)?.[1];
  assert.ok(version, 'index.html must declare VERSION as MAJOR.MINOR.PATCH');
  const major = version.split('.')[0];

  const changelog = await read('CHANGELOG.md');
  const latest = changelog.match(/^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/m);
  assert.ok(latest, 'CHANGELOG.md must have a "## [x.y.z] - YYYY-MM-DD" heading');
  assert.equal(latest[1], version, 'The newest CHANGELOG.md entry must be the version in index.html');
  const date = latest[2];

  assert.ok(html.includes(`版本 ${version}（${date}）`), `The page footer must read "版本 ${version}（${date}）"`);
  assert.match(html, new RegExp(`<title>[^<]*V${major}</title>`), `The page title must end with V${major}`);
  assert.ok((await read('README.md')).includes(`**V${major}（${version}，${date}）**`), `README.md must present V${major}（${version}，${date}）as the current version`);
});
