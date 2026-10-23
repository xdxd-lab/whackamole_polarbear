/** V17 regression gate: actual repo bytes -> hash -> Chromium AVIF decode -> game smoke test. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const states = ['peek', 'warning', 'sneaky', 'pain', 'sad'];
const species = ['bear', 'fox', 'penguin'];
const report = { version: 'v17-asset-audit', date: new Date().toISOString(), files: [], browser: {}, passed: false };
let server;
let browser;
try {
  const manifest = JSON.parse(await readFile(path.join(root, 'deployment/v16-release.json'), 'utf8'));
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /const VERSION\s*=\s*['"][^'"]*v1[67]['"]/, 'Unexpected game version');
  assert.equal(/assets\/(?:style\.css|app\.js|[^'"\s]*\.webp)/.test(html), false, 'Legacy CSS/JS/WebP referenced by game');
  assert.deepEqual(Object.keys(manifest.atlases).sort(), [...species].sort(), 'Expected exactly three official atlases');

  for (const name of species) {
    const { url, sha256, bytes, width, height } = manifest.atlases[name];
    assert.match(url, /^assets\/v16-20260909\/[a-z0-9-]+\.avif$/, name + ': wrong asset path');
    assert.equal(html.includes(url), true, name + ': image not referenced by index.html');
    const file = path.resolve(root, url);
    assert.equal(file.startsWith(root + path.sep), true, name + ': path escape');
    const buf = await readFile(file);
    const actual = createHash('sha256').update(buf).digest('hex');
    assert.equal(actual, sha256, name + ': SHA-256 mismatch');
    assert.equal(buf.length, bytes, name + ': wrong file size');
    assert.ok(width > 0 && height > 0, name + ': invalid dimensions in manifest');
    report.files.push({ species: name, path: url, bytes: buf.length, sha256: actual, expectedDimensions: [width * 5, height] });
    console.log('PASS bytes/hash/path: ' + name + ' ' + buf.length + ' bytes SHA-256=' + actual);
  }

  server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      const f = path.resolve(root, (pathname === '/' ? 'index.html' : pathname.slice(1)));
      if (!f.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const data = await readFile(f);
      res.writeHead(200, { 'Content-Type': f.endsWith('.avif') ? 'image/avif' : f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(origin + '/', { waitUntil: 'load' });

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

  // The real application must finish its own crypto verification and display sprites.
  await page.waitForFunction(() => document.querySelector('#modalBtn')?.disabled === false && document.querySelectorAll('#board .hole').length === 9, null, { timeout: 15000 });
  const label = await page.locator('#modalBtn').innerText();
  assert.match(label, /開始遊戲/, 'Game remained on asset-loading or error screen');
  assert.deepEqual(pageErrors, [], 'JavaScript runtime errors before game start');
  await page.locator('#modalBtn').click();
  await page.waitForFunction(() => {
    const hole = document.querySelector('.hole.up .mole');
    const img = hole?.querySelector('img[src^="data:image/png"]');
    return Boolean(img && img.complete && img.naturalWidth > 0 && getComputedStyle(img).display !== 'none');
  }, null, { timeout: 8000 });
  assert.deepEqual(pageErrors, [], 'JavaScript runtime errors during game');
  assert.equal(await page.locator('.hole').count(), 9, 'Game board must have nine holes');
  await mkdir(path.join(root, 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'test-results', 'v17-smoke.png'), animations: 'disabled' });
  report.browser.gameSmoke = 'pass: 9 holes, successfully decoded sprite visible after starting game';
  report.passed = true;
  console.log('PASS Chromium decode: ' + species.length + ' atlases, ' + species.length * states.length + ' nonblank frames; V17 smoke test');
} catch (error) {
  report.error = String(error?.stack ?? error);
  process.exitCode = 1;
  console.error('FAIL V17 asset audit: ' + report.error);
} finally {
  await mkdir(path.join(root, 'test-results'), { recursive: true });
  await writeFile(path.join(root, 'test-results', 'asset-audit.json'), JSON.stringify(report, null, 2) + '\n');
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
