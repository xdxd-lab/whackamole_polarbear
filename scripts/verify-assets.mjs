/**
 * Release gate, and the one command to run before shipping:
 * repository bytes -> hash -> Chromium AVIF decode -> real-time game smoke test -> tests/.
 * Everything checked is observable behaviour, so reformatting or moving source code
 * cannot fail it. Gameplay rules live in tests/ and run from here.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { ROOT, startServer } from '../tests/support/server.mjs';

const states = ['peek', 'warning', 'sneaky', 'pain', 'sad'];
const species = ['bear', 'fox', 'penguin'];
const report = { version: 'asset-audit', date: new Date().toISOString(), files: [], browser: {}, passed: false };
let server;
let browser;
try {
  const manifest = JSON.parse(await readFile(path.join(ROOT, 'deployment/v16-release.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.atlases).sort(), [...species].sort(), 'Expected exactly three official atlases');

  for (const name of species) {
    const { url, sha256, bytes, width, height } = manifest.atlases[name];
    assert.match(url, /^assets\/v16-20260909\/[a-z0-9-]+\.avif$/, name + ': wrong asset path');
    const file = path.resolve(ROOT, url);
    assert.equal(file.startsWith(ROOT + path.sep), true, name + ': path escape');
    const buf = await readFile(file);
    const actual = createHash('sha256').update(buf).digest('hex');
    assert.equal(actual, sha256, name + ': SHA-256 mismatch');
    assert.equal(buf.length, bytes, name + ': wrong file size');
    assert.ok(width > 0 && height > 0, name + ': invalid dimensions in manifest');
    report.files.push({ species: name, path: url, bytes: buf.length, sha256: actual, expectedDimensions: [width * 5, height] });
    console.log('PASS bytes/hash/path: ' + name + ' ' + buf.length + ' bytes SHA-256=' + actual);
  }

  server = await startServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    // Record the actual AudioParam gain at oscillator start, before the envelope ramp.
    window.__audioPeaks = [];
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (target, ...rest) {
      if (this instanceof OscillatorNode && target instanceof GainNode) this.__gainNode = target;
      return connect.call(this, target, ...rest);
    };
    const startOscillator = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...args) {
      if (this.__gainNode) window.__audioPeaks.push(this.__gainNode.gain.value);
      return startOscillator.apply(this, args);
    };
  });
  await page.goto(server.origin + '/', { waitUntil: 'load' });
  const mallet = page.locator('.brand h1 svg.toy-mallet');
  assert.equal(await mallet.count(), 1, 'Expected exactly one cute mallet icon');
  assert.equal(await mallet.isVisible(), true, 'Mallet should be visible');
  const malletSize = await mallet.boundingBox();
  assert.ok(malletSize?.width >= 24 && malletSize?.height >= 24, 'Mallet icon is too small');
  assert.equal((await page.locator('body').textContent()).includes('🔨'), false, 'Old steel-hammer emoji must stay removed');

  // Independently decode each served AVIF in a real browser and check all 5 visible tiles.
  report.browser.atlases = await page.evaluate(async (items) => {
    const result = [];
    for (const item of items) {
      const img = new Image();
      img.src = '/' + item.path;
      await img.decode();
      if (img.naturalWidth !== item.expectedDimensions[0] || img.naturalHeight !== item.expectedDimensions[1]) {
        throw new Error(item.species + ': Chromium decoded ' + img.naturalWidth + 'x' + img.naturalHeight + ', expected ' + item.expectedDimensions.join('x'));
      }
      const frameW = item.expectedDimensions[0] / 5;
      const frameH = item.expectedDimensions[1];
      const canvas = document.createElement('canvas');
      canvas.width = frameW; canvas.height = frameH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Unable to create 2D canvas');
      const counts = [];
      for (let i = 0; i < 5; i++) {
        ctx.clearRect(0, 0, frameW, frameH);
        ctx.drawImage(img, i * frameW, 0, frameW, frameH, 0, 0, frameW, frameH);
        const pixels = ctx.getImageData(0, 0, frameW, frameH).data;
        let visible = 0;
        for (let k = 3; k < pixels.length; k += 4) if (pixels[k] > 12) visible++;
        if (visible < 32) throw new Error(item.species + ' frame ' + i + ': blank/transparent sprite');
        counts.push(visible);
      }
      result.push({ species: item.species, decodedDimensions: [img.naturalWidth, img.naturalHeight], visiblePixelsPerFrame: counts });
    }
    return result;
  }, report.files);

  // The real application must finish its own verification and display sprites, on real timers.
  await page.waitForFunction(() => document.querySelector('#modalBtn')?.disabled === false && document.querySelectorAll('#board .hole').length === 9, null, { timeout: 15000 });
  const label = await page.locator('#modalBtn').innerText();
  assert.match(label, /開始遊戲/, 'Game remained on asset-loading or error screen');
  assert.deepEqual(pageErrors, [], 'JavaScript runtime errors before game start');
  const gameVersion = await page.evaluate(() => document.documentElement.dataset.gameVersion);
  assert.match(gameVersion ?? '', /^\d{8}-v\d+$/, 'Game must report its version');
  await page.locator('#modalBtn').click();
  await page.waitForFunction(() => {
    const hole = document.querySelector('.hole.up .mole');
    const img = [...(hole?.querySelectorAll('img') ?? [])].find(item => getComputedStyle(item).display !== 'none');
    return Boolean(img && img.complete && img.naturalWidth > 0);
  }, null, { timeout: 8000 });
  assert.deepEqual(pageErrors, [], 'JavaScript runtime errors during game');
  assert.equal(await page.locator('.hole').count(), 9, 'Game board must have nine holes');
  const audioPeaks = await page.evaluate(() => window.__audioPeaks || []);
  assert.ok(audioPeaks.some(value => Math.abs(value - .12) < .00001), 'Expected a real oscillator using boosted 0.12 gain');
  report.browser.gameVersion = gameVersion;
  report.browser.audioStartGains = audioPeaks;
  report.browser.toyMallet = { visible: true, width: malletSize.width, height: malletSize.height };
  await mkdir(path.join(ROOT, 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(ROOT, 'test-results', 'smoke.png'), animations: 'disabled' });
  report.browser.gameSmoke = 'pass: 9 holes, successfully decoded sprite visible after starting game';
  console.log('PASS Chromium decode: ' + species.length + ' atlases, ' + species.length * states.length + ' nonblank frames; game smoke test');

  // The mutation check runs tests/ itself, right before this script, on the same files.
  if (process.argv.includes('--skip-tests')) {
    report.gameplayTests = 'skipped';
    console.log('SKIP gameplay tests, as asked by --skip-tests');
  } else {
    const tests = spawnSync(process.execPath, ['--test', '--test-reporter=spec', 'tests/**/*.test.mjs'], { cwd: ROOT, stdio: 'inherit' });
    report.gameplayTests = tests.status === 0 ? 'pass' : 'fail';
    assert.equal(tests.status, 0, 'Gameplay tests failed');
    console.log('PASS gameplay rules, replays and visual states');
  }
  report.passed = true;
} catch (error) {
  report.error = String(error?.stack ?? error);
  process.exitCode = 1;
  console.error('FAIL asset audit: ' + report.error);
} finally {
  await mkdir(path.join(ROOT, 'test-results'), { recursive: true });
  await writeFile(path.join(ROOT, 'test-results', 'asset-audit.json'), JSON.stringify(report, null, 2) + '\n');
  if (browser) await browser.close();
  if (server) await server.close();
}
