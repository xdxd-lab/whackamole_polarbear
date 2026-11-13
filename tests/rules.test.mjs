/*
 * The game's rules, stated once as numbers a player could verify.
 * A failure here means gameplay changed, not that code moved.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { DIFFICULTY, Game, SPECIES_ROLL, holeRoll, startHarness } from './support/game.mjs';

const BEST_KEY = 'wam_best_20260904v7';
// Normal keeps the key every version before 21 wrote to.
const BEST_KEYS = { easy: BEST_KEY + '_easy', normal: BEST_KEY, hard: BEST_KEY + '_hard' };
/** What the footer shows: the best score line, or the practice mark in its place. */
const footer = game => game.page.evaluate(() => {
  const shown = id => { const style = getComputedStyle(document.getElementById(id)); return style.display !== 'none' && style.visibility !== 'hidden'; };
  return { best: shown('bestLine'), practice: shown('practiceMark') ? document.getElementById('practiceMark').textContent : null };
});
// Every 練習局 on show: how it is drawn, and its contrast against its own tint laid over white.
const practiceWords = game => game.page.evaluate(() => {
  const rgba = text => text.match(/[\d.]+/g).map(Number);
  const light = ([r, g, b]) => [r, g, b].map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  // Not checkVisibility: the overlay fades in, and WebKit calls it hidden until the fade is over.
  const onShow = word => !word.closest('[hidden]') && (word.closest('.overlay')?.classList.contains('show') ?? true);
  return [...document.querySelectorAll('.practice')].filter(onShow).map(word => {
    const style = getComputedStyle(word);
    const [r, g, b, alpha = 1] = rgba(style.backgroundColor);
    const behind = light([r, g, b].map(v => v * alpha + 255 * (1 - alpha)));
    const slot = word.closest('#practiceMark')?.parentElement.getBoundingClientRect();
    const mark = word.closest('#practiceMark')?.getBoundingClientRect();
    return {
      text: word.textContent, bold: Number(style.fontWeight) >= 700,
      coloured: style.color !== getComputedStyle(word.parentElement).color,
      contrast: Math.round((behind + 0.05) / (light(rgba(style.color)) + 0.05) * 10) / 10,
      spill: slot ? Math.round(Math.max(0, mark.width - slot.width)) : 0,
    };
  });
});
const savedBests = game => game.page.evaluate(
  keys => Object.fromEntries(Object.entries(keys).map(([level, key]) => [level, localStorage.getItem(key)])), BEST_KEYS);
let harness;
before(async () => { harness = await startHarness(); });
after(() => harness.close());

async function play(run, options) {
  const game = await Game.open(harness, options);
  try {
    await run(game);
    game.assertNoErrors();
  } finally {
    await game.close();
  }
}

/** Hides or shows the page, as switching browser tabs does. */
function setHidden(game, hidden) {
  return game.page.evaluate(value => {
    Object.defineProperty(document, 'hidden', { configurable: true, value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

/** Plays one target to completion and queues the next spawn. */
async function hitTarget(game, species, nextHole) {
  assert.equal(await game.species(), species);
  await game.nextSpawn('penguin', nextHole);
  await game.hitCurrent();
  await game.advance(640);
}

describe('round setup', () => {
  test('offers exactly three difficulties, defaulting to normal', () => play(async game => {
    const options = await game.page.$$eval('#difficulty option', list => list.map(o => [o.value, o.textContent]));
    assert.deepEqual(options, [['easy', '悠閒'], ['normal', '普通'], ['hard', '高手']]);
    assert.equal(await game.page.inputValue('#difficulty'), 'normal');
  }));

  test('starts at 30 seconds with zero score and combo', () => play(async game => {
    await game.start();
    assert.equal(await game.number('#time'), 30);
    assert.equal(await game.number('#score'), 0);
    assert.equal(await game.number('#combo'), 0);
  }));

  test('the start screen states every scoring rule', () => play(async game => {
    const text = await game.text('#modalText');
    for (const rule of ['企鵝 +1', '北極狐 +3', '北極熊會 -2 並中斷連擊', '漏掉企鵝或北極狐也會中斷連擊', '每連擊 5 次多得 +1']) {
      assert.ok(text.includes(rule), `The start screen must say "${rule}": ${text}`);
    }
  }));

  test('shows nine holes', () => play(async game => {
    assert.equal(await game.page.locator('#board .hole').count(), 9);
  }));
});

describe('scoring', () => {
  test('penguin scores +1 and builds combo', () => play(async game => {
    await game.startWith('penguin');
    await game.hitCurrent();
    assert.equal(await game.number('#score'), 1);
    assert.equal(await game.number('#combo'), 1);
    assert.equal(await game.page.textContent('#toast'), '企鵝 +1');
  }));

  test('fox scores +3 and builds combo', () => play(async game => {
    await game.startWith('fox');
    await game.hitCurrent();
    assert.equal(await game.number('#score'), 3);
    assert.equal(await game.number('#combo'), 1);
    assert.equal(await game.page.textContent('#toast'), '北極狐 +3');
  }));

  test('bear costs 2 points and breaks the combo', () => play(async game => {
    await game.startWith('fox');
    await game.nextSpawn('bear', 1);
    await game.hitCurrent();
    await game.advance(640);
    assert.equal(await game.species(), 'bear');
    await game.hitCurrent();
    assert.equal(await game.number('#score'), 1);
    assert.equal(await game.number('#combo'), 0);
    assert.equal(await game.page.textContent('#toast'), '誤敲北極熊 -2');
  }));

  test('score never drops below zero', () => play(async game => {
    await game.startWith('bear');
    await game.hitCurrent();
    assert.equal(await game.number('#score'), 0);
  }));

  test('every fifth consecutive hit earns one bonus point', () => play(async game => {
    await game.startWith('penguin');
    for (let i = 1; i <= 4; i += 1) await hitTarget(game, 'penguin', i);
    assert.equal(await game.number('#score'), 4);
    await game.hitCurrent();
    assert.equal(await game.number('#score'), 6);
    assert.equal(await game.number('#combo'), 5);
    assert.equal(await game.page.textContent('#toast'), '連擊獎勵 +2');
  }));

  test('a fifth-hit fox earns its bonus on top of +3', () => play(async game => {
    await game.startWith('penguin');
    for (let i = 1; i <= 3; i += 1) await hitTarget(game, 'penguin', i);
    await game.nextSpawn('fox', 4);
    await game.hitCurrent();
    await game.advance(640);
    await game.hitCurrent();
    assert.equal(await game.number('#score'), 8);
  }));

  test('an escaped penguin or fox breaks the combo', () => play(async game => {
    await game.startWith('penguin');
    await game.nextSpawn('fox', 1);
    await game.hitCurrent();
    await game.advance(640);
    assert.equal(await game.number('#combo'), 1);
    await game.advance(DIFFICULTY.normal.hide);
    assert.equal(await game.number('#combo'), 0);
  }));

  test('an escaped bear leaves the combo intact', () => play(async game => {
    await game.startWith('penguin');
    await game.nextSpawn('bear', 1);
    await game.hitCurrent();
    await game.advance(640);
    assert.equal(await game.species(), 'bear');
    await game.advance(DIFFICULTY.normal.hide);
    assert.equal(await game.state(), 'sneaky');
    assert.equal(await game.number('#combo'), 1);
  }));
});

describe('spawning', () => {
  for (const [roll, species] of [[0, 'bear'], [0.1199, 'bear'], [0.12, 'fox'], [0.3399, 'fox'], [0.34, 'penguin'], [0.9999, 'penguin']]) {
    test(`a roll of ${roll} spawns a ${species}`, () => play(async game => {
      await game.start({ random: [holeRoll(0), roll] });
      assert.equal(await game.species(), species);
    }));
  }

  test('never uses the same hole twice in a row', () => play(async game => {
    await game.startWith('penguin', 4);
    await game.queueRandom([holeRoll(4), holeRoll(4), holeRoll(7), SPECIES_ROLL.penguin]);
    await game.advance(DIFFICULTY.normal.next);
    assert.equal(await game.activeIndex(), 7);
  }));
});

describe('timing', () => {
  for (const [difficulty, timing] of Object.entries(DIFFICULTY)) {
    test(`${difficulty}: warning, escape and next spawn fall on the agreed milliseconds`, () => play(async game => {
      await game.startWith('penguin', 0, { difficulty });
      assert.equal(await game.state(), 'peek');
      await game.advance(timing.warning - 1);
      assert.equal(await game.state(), 'peek');
      await game.advance(1);
      assert.equal(await game.state(), 'warning');
      await game.advance(timing.hide - timing.warning - 1);
      assert.equal(await game.state(), 'warning');
      await game.advance(1);
      assert.equal(await game.state(), 'sneaky');
      await game.nextSpawn('penguin', 1);
      await game.advance(timing.next - timing.hide - 1);
      assert.equal(await game.activeIndex(), 0);
      await game.advance(1);
      assert.equal(await game.activeIndex(), 1);
      assert.equal(await game.state(), 'peek');
    }));
  }

  test('a hit lands up to the last millisecond of the window', () => play(async game => {
    await game.startWith('penguin');
    await game.advance(DIFFICULTY.normal.hide - 1);
    await game.hit(0);
    assert.equal(await game.number('#score'), 1);
    assert.equal(await game.state(), 'pain');
  }));

  test('a hit after the window has closed scores nothing', () => play(async game => {
    await game.startWith('penguin');
    await game.advance(DIFFICULTY.normal.hide);
    await game.hit(0);
    assert.equal(await game.number('#score'), 0);
    assert.equal(await game.state(), 'sneaky');
  }));

  test('a late hit misses even if a busy main thread delayed the escape timer', () => play(async game => {
    await game.startWith('penguin');
    await game.jump(DIFFICULTY.normal.hide);
    await game.hit(0);
    assert.equal(await game.number('#score'), 0);
    assert.equal(await game.state(), 'sneaky');
  }));

  for (const [difficulty, timing] of Object.entries(DIFFICULTY)) {
    const { pain, sad, rest } = timing;
    test(`${difficulty}: after a hit, pain ${pain} ms, sad ${sad} ms, then ${rest} ms until the next spawn`, () => play(async game => {
      await game.startWith('penguin', 0, { difficulty });
      await game.nextSpawn('fox', 3);
      await game.hitCurrent();
      await game.advance(pain - 1);
      assert.equal(await game.state(), 'pain');
      await game.advance(1);
      assert.equal(await game.state(), 'sad');
      await game.advance(sad - 1);
      assert.equal(await game.state(), 'sad');
      await game.advance(1);
      assert.equal(await game.activeIndex(), -1);
      await game.advance(rest - 1);
      assert.equal(await game.activeIndex(), -1);
      await game.advance(1);
      assert.equal(await game.activeIndex(), 3);
    }));
  }

  test('each difficulty is set apart from the next by at least a quarter', () => {
    const afterHit = t => t.pain + t.sad + t.rest;
    const { easy, normal, hard } = DIFFICULTY;
    assert.deepEqual([easy, normal, hard].map(t => t.hide), [1000, 725, 480]);
    assert.deepEqual([easy, normal, hard].map(afterHit), [800, 640, 450]);
    for (const [slower, faster] of [[easy, normal], [normal, hard]]) {
      assert.ok(slower.hide >= faster.hide * 1.25, `Time to hit: ${slower.hide} then ${faster.hide}`);
      assert.ok(afterHit(slower) >= afterHit(faster) * 1.25, `After a hit: ${afterHit(slower)} then ${afterHit(faster)}`);
    }
  });

  test('a round lasts exactly 30 seconds and spawns nothing afterwards', () => play(async game => {
    await game.startWith('penguin');
    await game.advance(29_999);
    assert.equal(await game.overlayShown(), false);
    await game.advance(1);
    assert.equal(await game.overlayShown(), true);
    assert.equal(await game.number('#time'), 0);
    assert.equal(await game.activeIndex(), -1);
    await game.advance(5_000);
    assert.equal(await game.activeIndex(), -1);
  }));

  test('a hit after 30 seconds scores nothing, even before the clock tick ends the round', () => play(async game => {
    // The round clock ticks every 100 ms. A penguin that rose at 29.75 s is still up at 30.01 s,
    // and a busy main thread can delay the 30.0 s tick that would end the round.
    await game.startWith('penguin');
    await game.advance(29_700);
    await game.nextSpawn('penguin', 4);
    await game.advance(250);
    assert.equal(await game.activeIndex(), 4);
    const before = await game.number('#score');
    await game.jump(60);
    await game.hit(4);
    assert.equal(await game.number('#score'), before, 'A hit after time is up must not score');
    assert.equal(await game.overlayShown(), true, 'The round must be over');
    assert.equal(await game.number('#finalScore'), before);
  }));

  test('the time bar drains linearly', () => play(async game => {
    await game.start();
    const scale = () => game.page.$eval('#bar', bar => Number(bar.style.transform.match(/scaleX\(([^)]+)\)/)[1]));
    assert.equal(await scale(), 1);
    await game.advance(15_000);
    assert.equal(await scale(), 0.5);
  }));
});

describe('input', () => {
  test('hitting the wrong hole does nothing', () => play(async game => {
    await game.startWith('penguin', 0);
    await game.hit(5);
    assert.equal(await game.number('#score'), 0);
    assert.equal(await game.state(), 'peek');
  }));

  test('a second hit on the same target scores nothing', () => play(async game => {
    await game.startWith('fox', 0);
    await game.hit(0);
    await game.hit(0);
    assert.equal(await game.number('#score'), 3);
  }));

  test('a real mouse press on a hole lands', () => play(async game => {
    await game.startWith('fox', 4);
    const box = await game.page.locator('#board .hole').nth(4).boundingBox();
    await game.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await game.page.mouse.down();
    await game.page.mouse.up();
    assert.equal(await game.number('#score'), 3);
  }));

  for (const key of ['Enter', ' ']) {
    test(`the ${JSON.stringify(key)} key hits the focused hole`, () => play(async game => {
      await game.startWith('penguin', 2);
      await game.page.locator('#board .hole').nth(2).focus();
      await game.page.keyboard.press(key);
      assert.equal(await game.number('#score'), 1);
    }));
  }

  test('hiding the page pauses the round: no time passes and nothing scores until the player continues', () => play(async game => {
    await game.startWith('penguin', 0);
    await game.advance(200);
    await setHidden(game, true);
    assert.equal(await game.overlayShown(), true);
    assert.equal(await game.page.textContent('#modalTitle'), '暫停中');
    const time = await game.number('#time');
    await game.advance(60_000);
    assert.equal(await game.number('#time'), time, 'The clock must stand still');
    assert.equal(await game.state(), 'peek', 'The target must wait where it was');
    await game.hit(0);
    assert.equal(await game.number('#score'), 0, 'Nothing scores while paused');
    await setHidden(game, false);
    assert.equal(await game.overlayShown(), true, 'Coming back waits for the player');
    await game.page.locator('#modalBtn').click();
    assert.equal(await game.overlayShown(), false);
    await game.hit(0);
    assert.equal(await game.number('#score'), 1, 'The same target can still be hit');
  }));

  test('a paused round still lasts 30 seconds of play', () => play(async game => {
    await game.startWith('penguin');
    await game.advance(10_000);
    await setHidden(game, true);
    await game.advance(45_000);
    await setHidden(game, false);
    await game.page.locator('#modalBtn').click();
    await game.advance(19_999);
    assert.equal(await game.overlayShown(), false);
    await game.advance(1);
    assert.equal(await game.page.textContent('#modalTitle'), '時間到！');
  }));

  test('a target keeps the rest of its window after a pause', () => play(async game => {
    await game.startWith('penguin', 0);
    await game.advance(DIFFICULTY.normal.hide - 100);
    await setHidden(game, true);
    await game.advance(5_000);
    await setHidden(game, false);
    await game.page.locator('#modalBtn').click();
    await game.advance(99);
    assert.equal(await game.state(), 'warning');
    await game.advance(1);
    assert.equal(await game.state(), 'sneaky');
  }));

  test('the restart button during a pause starts a fresh round', () => play(async game => {
    await game.startWith('fox');
    await game.hitCurrent();
    await setHidden(game, true);
    await setHidden(game, false);
    await game.page.locator('#startBtn').click();
    assert.equal(await game.overlayShown(), false);
    assert.equal(await game.number('#score'), 0);
    assert.equal(await game.number('#time'), 30);
  }));

  test('changing difficulty mid-round takes over at once and makes it a practice round', () => play(async game => {
    await game.startWith('fox');
    await game.hitCurrent();
    await game.choose('hard');
    assert.equal(await game.number('#score'), 3, 'The round goes on with its score');
    assert.equal(await game.overlayShown(), false);
    assert.deepEqual(await footer(game), { best: false, practice: '練習局・不計紀錄' });
    const inFooter = await practiceWords(game);
    assert.equal(inFooter.length, 1);
    assert.deepEqual({ ...inFooter[0], contrast: 0, spill: 0 }, { text: '練習局', bold: true, coloured: true, contrast: 0, spill: 0 });
    assert.ok(inFooter[0].contrast >= 4.5, `Contrast ${inFooter[0].contrast}`);
    assert.ok(inFooter[0].spill <= 6, `The mark is ${inFooter[0].spill}px wider than the line it covers`);
    // The next target already keeps the hard window.
    // After a hit the next target rises 640 ms later (pain 220 + sad 340 + 80).
    await game.nextSpawn('penguin', 4);
    await game.advance(640);
    assert.equal(await game.activeIndex(), 4);
    await game.advance(DIFFICULTY.hard.hide - 1);
    assert.equal(await game.state(), 'warning');
    await game.advance(1);
    assert.equal(await game.state(), 'sneaky', 'A normal window would still be open');
    await game.advance(30_000);
    assert.equal(await game.page.textContent('#modalTitle'), '練習局結束');
    assert.match(await game.page.textContent('#modalText'), /練習局，不計入紀錄/);
    const atTheEnd = await practiceWords(game);
    assert.equal(atTheEnd.length, 2, 'The title and the text');
    for (const word of atTheEnd) {
      assert.deepEqual({ ...word, contrast: 0 }, { text: '練習局', bold: true, coloured: true, contrast: 0, spill: 0 });
      assert.ok(word.contrast >= 4.5, `Contrast ${word.contrast}`);
    }
    assert.equal(await game.number('#finalScore'), 3, 'The score is still shown');
    assert.deepEqual(await savedBests(game), { easy: null, normal: null, hard: null });
    assert.equal(await game.number('#best'), 0);
    assert.equal(await game.page.textContent('#bestLevel'), '（高手）');
    assert.deepEqual(await footer(game), { best: true, practice: null }, 'The mark goes when the round ends');
    // Playing again is a real round, in the difficulty now chosen.
    await game.startWith('fox');
    await game.hitCurrent();
    await game.advance(30_000);
    assert.equal(await game.page.textContent('#modalTitle'), '🏆 新紀錄！');
    assert.deepEqual(await savedBests(game), { easy: null, normal: null, hard: '3' });
  }));

  test('changing difficulty and back again is still a practice round', () => play(async game => {
    await game.startWith('fox');
    await game.choose('easy');
    await game.choose('normal');
    await game.hitCurrent();
    await game.advance(30_000);
    assert.equal(await game.page.textContent('#modalTitle'), '練習局結束');
    assert.deepEqual(await savedBests(game), { easy: null, normal: null, hard: null });
  }));

  test('the restart button turns a practice round into a real one', () => play(async game => {
    await game.startWith('fox');
    await game.choose('easy');
    await game.queueRandom([holeRoll(0), SPECIES_ROLL.fox]);
    await game.page.locator('#startBtn').click();
    assert.equal(await game.page.textContent('#bestLevel'), '（悠閒）');
    assert.deepEqual(await footer(game), { best: true, practice: null });
    await game.hitCurrent();
    await game.advance(30_000);
    assert.equal(await game.page.textContent('#modalTitle'), '🏆 新紀錄！');
    assert.deepEqual(await savedBests(game), { easy: '3', normal: null, hard: null });
  }));

  test('the restart button clears the round', () => play(async game => {
    await game.startWith('fox');
    await game.hitCurrent();
    await game.page.locator('#startBtn').click();
    assert.equal(await game.number('#score'), 0);
    assert.equal(await game.overlayShown(), false);
  }));
});

describe('scoreboard updates', () => {
  test('a timer tick that changes nothing writes nothing', () => play(async game => {
    await game.startWith('penguin');
    await game.page.evaluate(() => {
      window.__writes = 0;
      new MutationObserver(list => { window.__writes += list.length; })
        .observe(document.querySelector('.scoreboard'), { subtree: true, childList: true, characterData: true });
    });
    await game.advance(900);
    assert.equal(await game.page.evaluate(() => window.__writes), 0);
    await game.advance(4_100);
    assert.equal(await game.number('#time'), 25);
    assert.equal(await game.page.evaluate(() => window.__writes), 5);
  }));

  test('screen readers hear the result, not the countdown', () => play(async game => {
    assert.equal(await game.page.locator('[aria-live] #time, #time[aria-live]').count(), 0);
    assert.equal(await game.page.getAttribute('#modalText', 'aria-live'), 'polite');
  }));
});

describe('best score', () => {
  const finishRound = async game => { await game.advance(30_000); };

  test('the saved score from earlier versions is the normal record', () => play(async game => {
    assert.equal(await game.number('#best'), 12);
    assert.equal(await game.page.textContent('#bestLevel'), '（普通）');
  }, { storage: { [BEST_KEY]: '12' } }));

  test('each difficulty shows its own record', () => play(async game => {
    const shown = async () => [await game.page.textContent('#bestLevel'), await game.number('#best')];
    assert.deepEqual(await shown(), ['（普通）', 12]);
    await game.choose('easy');
    assert.deepEqual(await shown(), ['（悠閒）', 5]);
    await game.choose('hard');
    assert.deepEqual(await shown(), ['（高手）', 0]);
  }, { storage: { [BEST_KEY]: '12', [BEST_KEYS.easy]: '5' } }));

  test('writes a new record to the same key', () => play(async game => {
    await game.startWith('fox');
    await game.hitCurrent();
    await finishRound(game);
    assert.deepEqual(await savedBests(game), { easy: null, normal: '3', hard: null });
    assert.equal(await game.number('#best'), 3);
    assert.equal(await game.page.textContent('#modalTitle'), '🏆 新紀錄！');
  }));

  test('a record in one difficulty leaves the others alone', () => play(async game => {
    await game.startWith('fox', 0, { difficulty: 'hard' });
    await game.hitCurrent();
    await finishRound(game);
    assert.equal(await game.page.textContent('#modalTitle'), '🏆 新紀錄！', 'Chosen before the round, so it counts');
    assert.deepEqual(await savedBests(game), { easy: null, normal: '50', hard: '3' });
    assert.equal(await game.number('#best'), 3);
    await game.choose('normal');
    assert.equal(await game.number('#best'), 50);
  }, { storage: { [BEST_KEY]: '50' } }));

  test('keeps a higher saved score', () => play(async game => {
    await game.startWith('fox');
    await game.hitCurrent();
    await finishRound(game);
    assert.equal(await game.page.evaluate(key => localStorage.getItem(key), BEST_KEY), '50');
    assert.equal(await game.page.textContent('#modalTitle'), '時間到！');
  }, { storage: { [BEST_KEY]: '50' } }));
});

describe('sound and vibration', () => {
  const effects = async game => (await game.trace()).map(line => line.trim().replace(/^\d+ /, '')).filter(line => /^(sound|vibrate) /.test(line));

  test('start, penguin, fox, bear and finish keep their exact sounds', () => play(async game => {
    await game.startWith('penguin');
    await game.nextSpawn('fox', 1);
    await game.hitCurrent();
    await game.advance(640);
    await game.nextSpawn('bear', 2);
    await game.hitCurrent();
    await game.advance(640);
    await game.hitCurrent();
    await game.advance(30_000);
    assert.deepEqual(await effects(game), [
      'sound triangle 520Hz gain=0.12 dur=0.08',
      'sound sine 445Hz gain=0.12 dur=0.07',
      'vibrate 10',
      'sound triangle 760Hz gain=0.12 dur=0.07',
      'vibrate 18',
      'sound sawtooth 120Hz gain=0.16 dur=0.12',
      'vibrate 55',
      'sound triangle 260Hz gain=0.12 dur=0.09',
    ]);
  }));

  test('muting silences sound', () => play(async game => {
    await game.page.locator('#soundBtn').click();
    assert.equal(await game.page.getAttribute('#soundBtn', 'aria-pressed'), 'false');
    await game.startWith('penguin');
    await game.hitCurrent();
    assert.deepEqual((await effects(game)).filter(line => line.startsWith('sound')), []);
  }));
});
