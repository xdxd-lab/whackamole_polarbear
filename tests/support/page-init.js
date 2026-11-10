/*
 * Test-only shim, injected before the game runs. It never ships to players.
 *
 * It replaces the page's clock and random source so a 30-second round replays
 * identically in milliseconds, then records what a player could observe: the
 * DOM, sounds and vibration. Tests read those observations instead of game
 * internals, so moving or restructuring the source cannot break them.
 */
(() => {
  'use strict';

  // Deterministic random numbers: queued values first, then a seeded stream.
  const queuedRandom = [];
  let seed = 0x20261105;
  Math.random = () => {
    if (queuedRandom.length) return queuedRandom.shift();
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Virtual clock. Time moves only when a test calls advance().
  let now = 0;
  let order = 0;
  let nextId = 1;
  const timers = new Map();
  const schedule = (fn, ms, every, args = []) => {
    const id = nextId++;
    timers.set(id, { at: now + Math.max(0, Number(ms) || 0), order: ++order, fn, every, args });
    return id;
  };
  window.setTimeout = (fn, ms, ...args) => schedule(fn, ms, 0, args);
  window.setInterval = (fn, ms, ...args) => schedule(fn, ms, Math.max(1, Number(ms) || 0), args);
  window.clearTimeout = window.clearInterval = id => { timers.delete(id); };
  performance.now = () => now;

  // Observations, in the order a player would perceive them.
  const trace = [];
  const log = text => trace.push({ t: now, text });
  const round = (value, digits) => Number(value.toFixed(digits));

  // Sound: wraps the real Web Audio API so a real oscillator still runs.
  // The audio clock is the one clock left running in real time, and it can move
  // between two reads when the machine is busy. Durations are therefore measured
  // from the value the game itself last read, not from a fresh reading.
  const audioClock = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'currentTime');
  const lastAudioTime = new WeakMap();
  Object.defineProperty(BaseAudioContext.prototype, 'currentTime', {
    ...audioClock,
    get() {
      const value = audioClock.get.call(this);
      lastAudioTime.set(this, value);
      return value;
    },
  });
  let oscillators = new WeakMap();
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    if (this instanceof OscillatorNode && target instanceof GainNode) oscillators.set(this, { gainNode: target });
    return connect.call(this, target, ...rest);
  };
  const start = OscillatorNode.prototype.start;
  OscillatorNode.prototype.start = function (...args) {
    const info = oscillators.get(this);
    if (info) info.gain = info.gainNode.gain.value;
    return start.apply(this, args);
  };
  const stop = OscillatorNode.prototype.stop;
  OscillatorNode.prototype.stop = function (when, ...rest) {
    const info = oscillators.get(this);
    if (info && when !== undefined) {
      log(`sound ${this.type} ${round(this.frequency.value, 1)}Hz gain=${round(info.gain, 3)} dur=${round(when - (lastAudioTime.get(this.context) ?? audioClock.get.call(this.context)), 2)}`);
    }
    return when === undefined ? stop.call(this) : stop.call(this, when, ...rest);
  };

  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: ms => { log(`vibrate ${ms}`); return true; } });

  const holes = () => [...document.querySelectorAll('#board .hole')];
  const activeHoles = () => holes()
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => element.dataset.state && element.dataset.state !== 'hidden');
  const text = id => document.getElementById(id)?.textContent ?? '';

  const sample = () => {
    const active = activeHoles();
    const hole = active.length
      ? active.map(({ element, index }) => [index, element.dataset.character, element.dataset.state, element.dataset.outcome || '-', element.getAttribute('aria-label')].join(':')).join(',')
      : 'empty';
    const overlay = document.getElementById('overlay')?.classList.contains('show') ? 'overlay' : 'playing';
    return `${hole} score=${text('score')} combo=${text('combo')} time=${text('time')} best=${text('best')} toast=${text('toast')} ${overlay}`;
  };

  let lastSample = '';
  let maxActive = 0;
  let policy = null;
  let lastTarget = -1;
  let spawnsSeen = 0;

  const input = index => {
    holes()[index].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch' }));
    record();
  };

  // Scripted player: reacts to what is on screen, a fixed time after it appears.
  const react = () => {
    if (!policy) return;
    const current = activeHoles()[0];
    if (!current) { lastTarget = -1; return; }
    if (current.index === lastTarget || current.element.dataset.state !== 'peek') return;
    lastTarget = current.index;
    spawnsSeen += 1;
    const species = current.element.dataset.character;
    const shouldHit = policy.mode === 'all'
      || (policy.mode === 'skip-bears' && species !== 'bear')
      || (policy.mode === 'every-2nd' && spawnsSeen % 2 === 0);
    if (shouldHit) schedule(() => input(current.index), policy.reaction, 0);
  };

  function record() {
    maxActive = Math.max(maxActive, activeHoles().length);
    const current = sample();
    if (current !== lastSample) { lastSample = current; log(current); }
    react();
  }

  async function advance(ms) {
    const end = now + ms;
    for (;;) {
      let next = null;
      for (const [id, timer] of timers) {
        if (timer.at > end) continue;
        if (!next || timer.at < next.timer.at || (timer.at === next.timer.at && timer.order < next.timer.order)) next = { id, timer };
      }
      if (!next) break;
      now = next.timer.at;
      if (next.timer.every) {
        next.timer.at += next.timer.every;
        next.timer.order = ++order;
      } else {
        timers.delete(next.id);
      }
      next.timer.fn(...next.timer.args);
      await Promise.resolve();
      record();
    }
    now = end;
    record();
  }

  window.__test = {
    advance,
    activeIndex: () => activeHoles()[0]?.index ?? -1,
    state: () => activeHoles()[0]?.element.dataset.state ?? 'hidden',
    species: () => activeHoles()[0]?.element.dataset.character ?? null,
    input,
    // Moves time without firing timers, as a busy main thread would.
    jump: ms => { now += ms; },
    now: () => now,
    queueRandom: values => queuedRandom.push(...values),
    record,
    resetTrace: () => { trace.length = 0; lastSample = ''; },
    setPolicy: value => { policy = value; lastTarget = -1; spawnsSeen = 0; },
    stats: () => ({ maxActive }),
    trace: () => trace.map(entry => `${String(entry.t).padStart(6)} ${entry.text}`),
  };
})();
