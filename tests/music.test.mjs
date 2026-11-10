/*
 * Background music: it waits for the player, plays one track per round taking turns,
 * follows the sound switch, ends with the round, and the game never depends on it.
 * Music is real audio running in real time, so these tests wait for it instead of
 * advancing the virtual clock.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { Game, startHarness } from './support/game.mjs';
import { ROOT } from './support/server.mjs';

const manifest = JSON.parse(await readFile(path.join(ROOT, 'deployment/music.json'), 'utf8'));
const OPUS = manifest.tracks.map(track => `/${track.files.opus.url}`);
const VOLUME = 0.35;
/** What reaches the speakers while each track plays: the music volume times the track's own gain. */
const LEVELS = manifest.tracks.map(track => VOLUME * track.gain);

let harness;
before(async () => { harness = await startHarness(); });
after(() => harness.close());

const music = game => game.page.evaluate(() => window.__test.music());
const playing = game => game.page.waitForFunction(() => window.__test.music().playing === 1, null, { timeout: 10_000 });
const silent = game => game.page.waitForFunction(() => window.__test.music().playing === 0, null, { timeout: 10_000 });
const starts = async game => (await music(game)).log.filter(entry => entry.event === 'start');

/** The fingerprint of each track, in the order the game lists them. */
const tracks = game => game.page.evaluate(async urls => {
  const result = [];
  for (const url of urls) {
    const buffer = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(await (await fetch(url)).arrayBuffer());
    result.push(window.__test.fingerprint(buffer));
  }
  return result;
}, OPUS);

test('music loads only after the game is playable, and waits for the player', async () => {
  const local = await startHarness();
  const game = await Game.open(local);
  try {
    await game.page.waitForFunction(count => window.performance.getEntriesByType('resource').filter(entry => entry.name.endsWith('.opus')).length === count, OPUS.length, { timeout: 10_000 });
    const paths = local.server.requests.map(request => request.pathname);
    const lastImage = Math.max(...paths.map((pathname, index) => pathname.endsWith('.avif') ? index : -1));
    const firstMusic = paths.findIndex(pathname => /\.(opus|m4a)$/.test(pathname));
    assert.ok(firstMusic > lastImage, `Music was requested before the character images: ${paths.join(', ')}`);
    assert.deepEqual(paths.filter(pathname => /\.(opus|m4a)$/.test(pathname)), OPUS, 'Each track is fetched once, in playing order');
    await game.page.waitForTimeout(300);
    assert.deepEqual((await music(game)).log, [], 'Nothing may play before the player starts a round');
  } finally {
    await game.close();
    await local.close();
  }
});

test('each round plays the next track from its start, and the music ends with the round', async () => {
  const game = await Game.open(harness);
  try {
    const order = await tracks(game);
    assert.equal(new Set(order).size, order.length, 'Every track must sound different');
    const heard = [];
    for (let round = 0; round < order.length + 1; round += 1) {
      await game.start();
      await playing(game);
      const latest = (await starts(game)).at(-1);
      heard.push(latest.track);
      const { level } = await music(game);
      assert.ok(Math.abs(level - LEVELS[round % LEVELS.length]) < 0.01, `Round ${round + 1} plays at ${level}, expected ${LEVELS[round % LEVELS.length]}`);
      assert.ok(latest.offset < 0.5, `Round ${round + 1} joined its track ${latest.offset}s in`);
      await game.advance(31_000);
      assert.equal(await game.overlayShown(), true);
      await silent(game);
    }
    assert.deepEqual(heard, [...order, order[0]], 'Every track plays once, in order, before the first returns');
    game.assertNoErrors();
  } finally {
    await game.close();
  }
});

test('the sound switch silences the music and brings it back without restarting it', async () => {
  const game = await Game.open(harness);
  try {
    await game.start();
    await playing(game);
    assert.ok(Math.abs((await music(game)).level - LEVELS[0]) < 0.01, 'Music plays at its set volume');
    await game.page.locator('#soundBtn').click();
    await game.page.waitForFunction(() => window.__test.music().level < 0.001);
    await game.page.locator('#soundBtn').click();
    await game.page.waitForFunction(volume => Math.abs(window.__test.music().level - volume) < 0.01, LEVELS[0]);
    assert.equal((await starts(game)).length, 1, 'Switching sound must not restart the track');
  } finally {
    await game.close();
  }
});

test('a round started with the sound off plays its music silently', async () => {
  const game = await Game.open(harness);
  try {
    await game.page.locator('#soundBtn').click();
    await game.start();
    await playing(game);
    assert.equal((await music(game)).level, 0);
  } finally {
    await game.close();
  }
});

test('leaving the page ends the music with the round', async () => {
  const game = await Game.open(harness);
  try {
    await game.start();
    await playing(game);
    await game.page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await silent(game);
  } finally {
    await game.close();
  }
});

test('a slow music download never holds up a round, and the track joins where the round is', async () => {
  const local = await startHarness({ override: pathname => /\.(opus|m4a)$/.test(pathname) ? { delay: 3000 } : null });
  const game = await Game.open(local);
  try {
    // The download has begun, so the game is as ready as it will be without its music.
    while (!local.server.requests.some(request => /\.(opus|m4a)$/.test(request.pathname))) await game.page.waitForTimeout(20);
    await game.nextSpawn('penguin', 0);
    await game.page.locator('#modalBtn').click();
    assert.equal(await game.overlayShown(), false, 'The round must start at once, without its music');
    assert.equal((await music(game)).playing, 0);
    await game.advance(4_000);
    await playing(game);
    const [first] = await starts(game);
    assert.ok(first.offset > 3.5 && first.offset < 6, `The late track joined ${first.offset}s in, the round was about 4s old`);
    game.assertNoErrors();
  } finally {
    await game.close();
    await local.close();
  }
});

test('the game plays normally when its music cannot load', async () => {
  const local = await startHarness({ override: pathname => /\.(opus|m4a)$/.test(pathname) ? { status: 404 } : null });
  const game = await Game.open(local);
  try {
    await game.startWith('penguin');
    await game.hitCurrent();
    assert.equal(await game.number('#score'), 1);
    await game.page.waitForTimeout(500);
    await game.advance(31_000);
    assert.equal(await game.overlayShown(), true);
    assert.deepEqual((await music(game)).log, []);
    game.assertNoErrors();
  } finally {
    await game.close();
    await local.close();
  }
});

test('every track lasts the whole round, fades out and is as loud as the others', async () => {
  const game = await Game.open(harness);
  try {
    const shapes = await game.page.evaluate(async urls => {
      const result = [];
      for (const url of urls) {
        const buffer = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(await (await fetch(url)).arrayBuffer());
        const rms = (from, to) => {
          let sum = 0, count = 0, peak = 0;
          for (let c = 0; c < buffer.numberOfChannels; c += 1) {
            const data = buffer.getChannelData(c);
            for (let i = Math.floor(from * buffer.sampleRate); i < Math.min(data.length, to * buffer.sampleRate); i += 1) { sum += data[i] ** 2; count += 1; peak = Math.max(peak, Math.abs(data[i])); }
          }
          return { db: 10 * Math.log10(sum / count), peak };
        };
        result.push({ url, duration: buffer.duration, body: rms(1, 27), tail: rms(buffer.duration - 0.2, buffer.duration) });
      }
      return result;
    }, OPUS);
    for (const { url, duration, body, tail } of shapes) {
      assert.ok(duration >= 30.5, `${url} is ${duration}s, shorter than a round`);
      assert.ok(body.peak < 0.95, `${url} peaks at ${body.peak}, too close to clipping`);
      assert.ok(tail.db < body.db - 20, `${url} does not fade out (${tail.db} dB at the end, ${body.db} dB overall)`);
    }
    const levels = shapes.map(shape => shape.body.db);
    assert.ok(Math.max(...levels) - Math.min(...levels) < 4, `Tracks differ in loudness: ${levels.join(', ')} dB`);
  } finally {
    await game.close();
  }
});

test('each track is played at the level chosen for it by ear', () => {
  // Happy and Winter were set by listening on 2026-11-10: equal measured loudness left Happy too quiet
  // and Winter too loud. Clappy is bass-heavy like Happy and a little thinner above it.
  assert.deepEqual(manifest.tracks.map(track => [track.id, track.gain]), [['happy', 1.5], ['winter', 0.67], ['clappy', 1.7]]);
  for (const level of LEVELS) assert.ok(level < 0.9, 'A track must leave headroom below full scale');
});

test('the page credits every composer, with a link to the source of each track', async () => {
  const game = await Game.open(harness);
  try {
    const shown = await game.page.$$eval('.credits a', links => links.map(link => ({ author: link.textContent, source: link.href, title: link.title, newTab: link.target === '_blank' && link.rel.includes('noopener') })));
    assert.deepEqual(shown, manifest.tracks.map(track => ({ author: track.author, source: track.source, title: track.title, newTab: true })));
    assert.match(await game.page.textContent('.credits'), /CC0/);
  } finally {
    await game.close();
  }
});
