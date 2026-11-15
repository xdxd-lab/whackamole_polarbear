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

/**
 * Init script: an audio device that is slow to start, as Firefox on CI sometimes is.
 * Every resume() and suspend() waits, in the order it was called, until the test calls
 * window.__audioDevice.start(); idle() resolves once they have run, and stall() makes
 * the ones after it wait again.
 * Until then a new context stays suspended, the state a slow device leaves it in.
 */
const slowAudioDevice = {
  script: () => {
    const Real = window.AudioContext;
    const { resume, suspend } = Real.prototype;
    let open = () => {};
    let queue = Promise.resolve();
    const stall = () => { queue = queue.then(() => new Promise(resolve => { open = resolve; })); };
    const later = (context, method) => (queue = queue.then(() => method.call(context)).catch(() => {}));
    stall();
    window.AudioContext = class extends Real {
      constructor(...args) { super(...args); suspend.call(this); }
      resume() { return later(this, resume); }
      suspend() { return later(this, suspend); }
    };
    window.__audioDevice = { start: () => open(), stall, idle: () => queue };
  },
};

/**
 * Init script: watches the real resume() and suspend() without changing their timing.
 * window.__audioSettled() resolves once every one asked for so far has been carried out;
 * window.__audioAsked() lists them as [name, asked while a tap was being handled].
 */
const watchAudio = {
  script: () => {
    const asked = [];
    const names = [];
    let tapping = false;
    addEventListener('click', () => { tapping = true; }, true);
    addEventListener('click', () => { tapping = false; });
    for (const name of ['resume', 'suspend']) {
      const method = AudioContext.prototype[name];
      AudioContext.prototype[name] = function (...args) {
        const result = method.apply(this, args);
        asked.push(result);
        names.push([name, tapping]);
        return result;
      };
    }
    window.__audioAsked = () => names;
    window.__audioSettled = async () => {
      for (let seen = -1; seen !== asked.length;) {
        seen = asked.length;
        await Promise.allSettled(asked);
      }
    };
  },
};
const audioSettled = game => game.page.evaluate(() => window.__audioSettled());

/** Hides or shows the page, as switching tabs does. */
const setHidden = (game, hidden) => game.page.evaluate(value => {
  Object.defineProperty(document, 'hidden', { configurable: true, value });
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);

test('leaving the page pauses the music, and continuing carries on with the same track', async () => {
  const game = await Game.open(harness);
  try {
    await game.start();
    await playing(game);
    await setHidden(game, true);
    await game.page.waitForFunction(() => window.__test.music().audio === 'suspended', null, { timeout: 10_000 });
    assert.equal((await music(game)).playing, 1, 'The track is held, not stopped');
    await setHidden(game, false);
    await game.page.locator('#modalBtn').click();
    await game.page.waitForFunction(() => window.__test.music().audio === 'running', null, { timeout: 10_000 });
    assert.equal((await starts(game)).length, 1, 'Continuing must not restart the track');
  } finally {
    await game.close();
  }
});

test('leaving the page while the sound is still starting pauses the music all the same', async () => {
  const game = await Game.open(harness, { before: slowAudioDevice });
  try {
    await game.start();
    await playing(game);
    await setHidden(game, true);
    assert.equal(await game.overlayShown(), true, 'The round is paused');
    await game.page.evaluate(() => { window.__audioDevice.start(); return window.__audioDevice.idle(); });
    assert.equal((await music(game)).audio, 'suspended', 'The sound started after the page was left, and must not play');
    await setHidden(game, false);
    await game.page.locator('#modalBtn').click();
    await game.page.waitForFunction(() => window.__test.music().audio === 'running', null, { timeout: 10_000 });
    assert.equal((await starts(game)).length, 1, 'Continuing must not restart the track');
  } finally {
    await game.close();
  }
});

test('continuing while the sound is still pausing brings the music back', async () => {
  const game = await Game.open(harness, { before: slowAudioDevice });
  try {
    await game.start();
    await playing(game);
    await game.page.evaluate(() => { window.__audioDevice.start(); return window.__audioDevice.idle(); });
    assert.equal((await music(game)).audio, 'running', 'The sound has started');
    // The device stalls again: the pause asks for silence, and the player is back before it comes.
    await game.page.evaluate(() => window.__audioDevice.stall());
    await setHidden(game, true);
    await setHidden(game, false);
    await game.page.locator('#modalBtn').click();
    await game.page.evaluate(() => { window.__audioDevice.start(); return window.__audioDevice.idle(); });
    assert.equal((await music(game)).audio, 'running', 'The round goes on, and so must its music');
  } finally {
    await game.close();
  }
});

test('leaving the page in the same moment the round starts pauses the music', async () => {
  const game = await Game.open(harness, { before: watchAudio });
  try {
    // Hidden right after the game handles the tap, before the browser can start the sound.
    await game.page.evaluate(() => document.getElementById('modalBtn').addEventListener('click', () => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }));
    await game.page.locator('#modalBtn').click();
    assert.equal(await game.text('#modalTitle'), '暫停中');
    await playing(game);
    await audioSettled(game);
    assert.equal((await music(game)).audio, 'suspended', 'The sound must not play behind the pause');
  } finally {
    await game.close();
  }
});

test('music that arrives during a pause waits silently for the player', async () => {
  const local = await startHarness({ override: pathname => /\.(opus|m4a)$/.test(pathname) ? { delay: 2000 } : null });
  const game = await Game.open(local, { before: watchAudio });
  try {
    await game.start();
    assert.equal((await music(game)).playing, 0, 'The music is still on its way');
    await setHidden(game, true);
    await playing(game);
    await audioSettled(game);
    assert.equal((await music(game)).audio, 'suspended', 'The late track must not start the sound while paused');
    await setHidden(game, false);
    await game.page.locator('#modalBtn').click();
    await game.page.waitForFunction(() => window.__test.music().audio === 'running', null, { timeout: 10_000 });
  } finally {
    await game.close();
    await local.close();
  }
});

test('the sound switch and the start button work during a pause without waking the music early', async () => {
  const game = await Game.open(harness, { before: watchAudio });
  try {
    await game.start();
    await playing(game);
    await setHidden(game, true);
    await game.page.locator('#soundBtn').click();
    await game.page.locator('#soundBtn').click();
    await audioSettled(game);
    assert.equal((await music(game)).audio, 'suspended', 'Turning the sound back on must not play it behind the pause');
    await setHidden(game, false);
    // With the sound off no start beep asks for the sound, so the round itself must.
    await game.page.locator('#soundBtn').click();
    const before = (await game.page.evaluate(() => window.__audioAsked())).length;
    await game.page.locator('#startBtn').click();
    assert.equal(await game.overlayShown(), false, 'A new round begins');
    // Some browsers start sound only from inside the tap itself.
    const tap = (await game.page.evaluate(() => window.__audioAsked())).slice(before).filter(([, duringTap]) => duringTap);
    assert.ok(tap.some(([name]) => name === 'resume'), `The start button must resume the sound during its tap: ${JSON.stringify(tap)}`);
    await game.page.waitForFunction(() => window.__test.music().playing === 1 && window.__test.music().audio === 'running', null, { timeout: 10_000 });
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

test('every track lasts the whole round, fades out and sounds as loud as the others on a small speaker', async () => {
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
        // What a phone or laptop speaker plays, almost nothing below about 300 Hz, weighted the
        // way the ear hears it (the +4 dB high shelf of ITU-R BS.1770, as scripts/music/speaker.py).
        const offline = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
        const source = offline.createBufferSource();
        let node = source;
        for (const [type, frequency, gain] of [['highpass', 300], ['highpass', 300], ['highshelf', 1682, 4]]) {
          const filter = offline.createBiquadFilter();
          filter.type = type; filter.frequency.value = frequency;
          if (gain) filter.gain.value = gain;
          // Web Audio gives a high-pass Q in dB; -3.01 dB is Q 0.707, without a resonant bump.
          if (type === 'highpass') filter.Q.value = -3.0103;
          node.connect(filter); node = filter;
        }
        node.connect(offline.destination);
        source.buffer = buffer; source.start();
        const speaker = await offline.startRendering();
        const level = (audio, from, to) => {
          let sum = 0, count = 0;
          for (let c = 0; c < audio.numberOfChannels; c += 1) {
            const data = audio.getChannelData(c);
            for (let i = Math.floor(from * audio.sampleRate); i < to * audio.sampleRate; i += 1) { sum += data[i] ** 2; count += 1; }
          }
          return 10 * Math.log10(sum / count);
        };
        result.push({ url, duration: buffer.duration, body: rms(1, 27), tail: rms(buffer.duration - 0.2, buffer.duration), speaker: level(speaker, 1, 27) });
      }
      return result;
    }, OPUS);
    for (const { url, duration, body, tail } of shapes) {
      assert.ok(duration >= 30.5, `${url} is ${duration}s, shorter than a round`);
      assert.ok(body.peak < 0.95, `${url} peaks at ${body.peak}, too close to clipping`);
      assert.ok(tail.db < body.db - 20, `${url} does not fade out (${tail.db} dB at the end, ${body.db} dB overall)`);
    }
    // Played at their own gain, the tracks sound equally loud where small speakers can play.
    const levels = shapes.map((shape, i) => shape.speaker + 20 * Math.log10(manifest.tracks[i].gain));
    assert.ok(Math.max(...levels) - Math.min(...levels) < 2, `Tracks differ above 300 Hz: ${levels.map(db => db.toFixed(1)).join(', ')} dB`);
  } finally {
    await game.close();
  }
});

test('each track is played at the level chosen for it by ear', () => {
  // Happy is the reference. Clappy matches it above 300 Hz and is then 1 dB louder, by ear
  // (2026-11-11, each track heard alone). Snowfall and Snow Theme match it above 300 Hz, as measured.
  assert.deepEqual(manifest.tracks.map(track => [track.id, track.gain]), [['happy', 1.5], ['snowfall', 1], ['clappy', 1.9], ['snowtheme', 1.1]]);
  for (const level of LEVELS) assert.ok(level < 0.9, 'A track must leave headroom below full scale');
});

test('the page credits every composer, with a link to the source of each track', async () => {
  const game = await Game.open(harness);
  try {
    const shown = await game.page.$$eval('.credits .names a', links => links.map(link => ({ author: link.textContent, source: link.href, title: link.title, newTab: link.target === '_blank' && link.rel.includes('noopener') })));
    assert.deepEqual(shown, manifest.tracks.map(track => ({ author: track.author, source: track.source, title: track.title, newTab: true })));
    assert.match(await game.page.textContent('.credits'), /CC0/);
    // Where the names do not fit, one link stands for them; it leads to the full credits.
    const short = await game.page.$eval('.credits .short', link => ({ text: link.textContent, href: link.href, newTab: link.target === '_blank' && link.rel.includes('noopener') }));
    assert.deepEqual(short, { text: `音樂：${manifest.tracks.length} 位作者（CC0）`, href: 'https://github.com/xdxd-lab/whackamole_polarbear/blob/main/CREDITS.md', newTab: true });
  } finally {
    await game.close();
  }
});
