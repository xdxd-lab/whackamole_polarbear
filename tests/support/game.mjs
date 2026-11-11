import assert from 'node:assert/strict';
import path from 'node:path';
import { launchBrowser } from './browser.mjs';
import { ROOT, startServer } from './server.mjs';

const INIT_SCRIPT = path.join(ROOT, 'tests/support/page-init.js');

/** Random values that make the game choose a given species. */
export const SPECIES_ROLL = { bear: 0.05, fox: 0.2, penguin: 0.9 };
/** Random value that makes the game choose a given hole. */
export const holeRoll = index => (index + 0.5) / 9;

export const DIFFICULTY = {
  easy: { warning: 619, hide: 915, next: 1050 },
  normal: { warning: 497, hide: 725, next: 850 },
  hard: { warning: 381, hide: 560, next: 650 },
};

export async function startHarness(options) {
  const server = await startServer(options);
  const browser = await launchBrowser();
  return { server, browser, close: async () => { await browser.close(); await server.close(); } };
}

export class Game {
  static async open(harness, { viewport = { width: 900, height: 900 }, storage = {}, ready = true, reducedMotion = 'no-preference', before } = {}) {
    const context = await harness.browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion });
    await context.addInitScript({ path: INIT_SCRIPT });
    if (before) await context.addInitScript(before.script, before.arg);
    await context.addInitScript(entries => {
      for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
    }, storage);
    const page = await context.newPage();
    const game = new Game(context, page);
    page.on('pageerror', error => game.errors.push(error.message));
    await page.goto(`${harness.server.origin}/`);
    if (ready) await page.waitForFunction(() => document.getElementById('modalBtn')?.disabled === false && document.querySelectorAll('#board .hole').length === 9);
    return game;
  }

  constructor(context, page) {
    this.context = context;
    this.page = page;
    this.errors = [];
  }

  close() { return this.context.close(); }

  /** Starts a round through the on-screen button and waits for play to begin. */
  async start({ difficulty, random = [] } = {}) {
    if (difficulty) await this.choose(difficulty);
    await this.queueRandom(random);
    await this.page.locator('#modalBtn').click();
    await this.page.waitForFunction(() => !document.getElementById('overlay').classList.contains('show'));
    await this.page.evaluate(() => window.__test.record());
  }

  /** Picks a difficulty in the menu. A missing option fails at once instead of waiting half a minute. */
  choose(difficulty) { return this.page.selectOption('#difficulty', difficulty, { timeout: 2_000 }); }

  /** Starts with a chosen first target. */
  startWith(species, hole = 0, options = {}) {
    return this.start({ ...options, random: [holeRoll(hole), SPECIES_ROLL[species]] });
  }

  queueRandom(values) { return this.page.evaluate(list => window.__test.queueRandom(list), values); }
  /** Chooses the next spawn. */
  nextSpawn(species, hole) { return this.queueRandom([holeRoll(hole), SPECIES_ROLL[species]]); }
  advance(ms) { return this.page.evaluate(value => window.__test.advance(value), ms); }
  /** Moves time without firing timers, simulating a main thread too busy to run them. */
  jump(ms) { return this.page.evaluate(value => window.__test.jump(value), ms); }
  hit(index) { return this.page.evaluate(value => window.__test.input(value), index); }
  state() { return this.page.evaluate(() => window.__test.state()); }
  species() { return this.page.evaluate(() => window.__test.species()); }
  activeIndex() { return this.page.evaluate(() => window.__test.activeIndex()); }
  now() { return this.page.evaluate(() => window.__test.now()); }
  trace() { return this.page.evaluate(() => window.__test.trace()); }
  resetTrace() { return this.page.evaluate(() => window.__test.resetTrace()); }
  text(selector) { return this.page.locator(selector).innerText(); }
  async number(selector) { return Number(await this.page.locator(selector).textContent()); }
  overlayShown() { return this.page.evaluate(() => document.getElementById('overlay').classList.contains('show')); }

  /** Hits the current target after `wait` virtual ms, then lets the next one appear. */
  async hitCurrent(wait = 100) {
    await this.advance(wait);
    await this.hit(await this.activeIndex());
  }

  /** Finishes every animation that can finish, so sampled styles do not depend on real time. */
  settle() {
    return this.page.evaluate(() => {
      for (const animation of document.getAnimations()) {
        const timing = animation.effect?.getComputedTiming?.();
        if (timing && timing.iterations !== Infinity) animation.finish();
      }
    });
  }

  assertNoErrors() { assert.deepEqual(this.errors, [], 'JavaScript errors while playing'); }
}

/**
 * Mean per-channel difference between what a sprite element draws and frame
 * `frame` of the reference atlas. It reads the element's computed background,
 * so it checks the image, frame and scale the player actually sees.
 */
export function spriteFrameDifference(page, selector, atlas, frame) {
  const { url, width, height } = atlas;
  return page.evaluate(async ({ selector, url, width, height, frame }) => {
    const element = document.querySelector(selector);
    const style = getComputedStyle(element);
    const source = style.backgroundImage.match(/^url\("?(.*?)"?\)$/)?.[1];
    if (!source) throw new Error(`${selector} has no background image`);
    const sheet = new Image();
    sheet.src = source;
    await sheet.decode();
    const box = element.getBoundingClientRect();
    const [sizeX, sizeY] = style.backgroundSize.split(' ').map(value => parseFloat(value) / 100);
    const drawnWidth = box.width * sizeX;
    const offset = parseFloat(style.backgroundPositionX) / 100 * (box.width - drawnWidth);
    const scale = sheet.naturalWidth / drawnWidth;
    const reference = new Image();
    reference.src = `/${url}`;
    await reference.decode();
    const pixels = (image, sx, sw, sh) => {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, sx, 0, sw, sh, 0, 0, width, height);
      return context.getImageData(0, 0, width, height).data;
    };
    const a = pixels(sheet, -offset * scale, box.width * scale, sheet.naturalHeight / sizeY);
    const b = pixels(reference, frame * width, width, height);
    // Colour is weighted by opacity: what a transparent pixel "contains" is never seen.
    let total = 0;
    for (let i = 0; i < a.length; i += 4) {
      for (let c = 0; c < 3; c += 1) total += Math.abs(a[i + c] * a[i + 3] - b[i + c] * b[i + 3]) / 255;
      total += Math.abs(a[i + 3] - b[i + 3]);
    }
    return total / a.length;
  }, { selector, url, width, height, frame });
}

/** Init script: makes Image.decode() reject for sources matching any prefix, as a browser without that format would. */
export function failDecoding(...prefixes) {
  return {
    arg: prefixes,
    script: list => {
      const decode = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = function () {
        if (list.some(prefix => this.src.startsWith(prefix))) return Promise.reject(new DOMException('The source image cannot be decoded.', 'EncodingError'));
        return decode.call(this);
      };
    },
  };
}
