/**
 * Tests the tests. Each mutant is a throwaway copy of the game:
 *   MUTANTS break a rule, so the suite must FAIL.
 *   EQUIVALENTS only change how the code is written, so the suite must PASS.
 *
 * A mutant whose search text no longer exists (because the source was
 * legitimately refactored) is reported as stale. That is a warning by default
 * and an error with --strict, which CI uses so coverage cannot quietly shrink.
 *
 * This is heavy: every case runs the whole browser suite. It runs one case at a
 * time unless told otherwise, and the full list belongs on CI, not a laptop.
 *
 *   --only <name>      run one case, by its exact name
 *   --shard <i>/<n>    run every n-th case, for parallel CI jobs
 *   --strict           stale cases fail the run
 *   MUTATION_WORKERS   cases run at once (default 1)
 *   MUTATION_CASE_TIMEOUT_MS   per test process (default 180000)
 *
 * Results: test-results/mutation-report*.json, and the full output of every
 * failing case in test-results/mutation/<case>.log.
 */
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from '../tests/support/server.mjs';

const replace = (from, to) => async ({ html, setHtml }) => {
  const source = await html();
  if (!source.includes(from)) return false;
  await setHtml(source.replace(from, to));
  return true;
};

const MUTANTS = {
  'penguin +1 becomes +5': replace("delta=a.type==='bonus'?3:1", "delta=a.type==='bonus'?3:5"),
  'bear -2 becomes 0': replace('delta=-2;combo=0', 'delta=0;'),
  'round 30 s becomes 5 s': replace('30-(performance.now()-started)/1000', '5-(performance.now()-started)/1000'),
  'normal show 600 becomes 6000': replace('normal: {spawn: 850, show: 600}', 'normal: {spawn: 850, show: 6000}'),
  'bear chance .12 becomes .9': replace("r<.12?'bad'", "r<.9?'bad'"),
  'BEST_KEY renamed': replace('wam_best_20260904v7', 'wam_best_new'),
  'hard difficulty removed': replace('<option value="hard">高手</option>', ''),
  'hits never land': replace('if(!running||!a||a.i!==i||', 'if(true||!running||!a||a.i!==i||'),
  'fox +3 becomes +2': replace("delta=a.type==='bonus'?3:1", "delta=a.type==='bonus'?2:1"),
  'combo bonus removed': replace('if(combo%5===0){delta++;', 'if(false){delta++;'),
  'bear no longer breaks combo': replace('delta=-2;combo=0', 'delta=-2'),
  'score may go negative': replace('score=Math.max(0,score+delta)', 'score=score+delta'),
  'escape keeps combo': replace("if(a.type!=='bad')combo=0;", ''),
  'fox chance .34 becomes .5': replace("r<.34?'bonus'", "r<.5?'bonus'"),
  'easy spawn 1050 becomes 1000': replace('easy: {spawn: 1050, show: 780}', 'easy: {spawn: 1000, show: 780}'),
  'hard show 470 becomes 500': replace('hard: {spawn: 650, show: 470}', 'hard: {spawn: 650, show: 500}'),
  'warning at 62% becomes 70%': replace('cfg.show*.62', 'cfg.show*.7'),
  'hit deadline ignored': replace('if(performance.now()>=a.deadline){escape(a);return;}', ''),
  'pain 220 ms becomes 300 ms': replace('},220);', '},300);'),
  'next spawn 80 ms becomes 200 ms': replace('later(spawn,80)', 'later(spawn,200)'),
  'same hole may repeat': replace('while(i===lastHole)', 'while(false)'),
  'bear sound quieter': replace("beep(120,.12,'sawtooth',.16)", "beep(120,.12,'sawtooth',.08)"),
  'hidden page keeps playing': replace('if(document.hidden&&running)finish();', ''),
  'sprite frames swapped': replace('.hole[data-state="warning"] .sprite{background-position-x:25%}', '.hole[data-state="warning"] .sprite{background-position-x:0%}'),
  'sad frame shows pain': replace('.hole[data-state="sad"] .sprite{background-position-x:100%}', '.hole[data-state="sad"] .sprite{background-position-x:75%}'),
  'expressions slide across the sheet under reduced motion': replace('transform-origin:50% 100%;transition:none!important}', 'transform-origin:50% 100%}'),
  'sprite sheet tiles': replace('0 0/500% 100% no-repeat', '0 0/500% 100%'),
  'penguin drawn square': replace('--sheet:var(--sheet-penguin);--ratio:1.5', '--sheet:var(--sheet-penguin);--ratio:1'),
  'fox shown with the bear sheet': replace('--sheet:var(--sheet-fox)', '--sheet:var(--sheet-bear)'),
  'sad frame no longer drops': replace("{duration:340,easing:'ease-in',fill:'forwards'}", "{duration:340,easing:'ease-in'}"),
  'scoreboard rewritten on every tick': replace('if(el.textContent!==text)el.textContent=text;', 'el.textContent=text;'),
  'images forced to revalidate': replace('fetch(file.url)', "fetch(file.url, {cache:'no-cache'})"),
  'image hash no longer checked': replace('if (digest !== file.sha256)', 'if (false)'),
  'page may outgrow the screen': replace('.game{width:min(680px,100%);max-height:100%;', '.game{width:min(680px,100%);'),
  'board no longer centred': replace('height:min(100cqw,100cqh);margin:auto}', 'height:min(100cqw,100cqh)}'),
  'landscape loses its two columns': replace('@media(orientation:landscape) and (max-height:560px){', '@media(orientation:landscape) and (max-height:1px){'),
  'panel blur restored': replace('.brand,.scoreboard,.controls,.card{background:var(--panel);', '.brand,.scoreboard,.controls,.card{background:var(--panel);backdrop-filter:blur(8px);'),
  'panels too transparent': replace('--panel:rgba(255,255,255,.94)', '--panel:rgba(255,255,255,.8)'),
  'snow loop no longer a whole tile': replace('@keyframes snowfall{to{transform:translateY(var(--tile))}}', '@keyframes snowfall{to{transform:translateY(calc(var(--tile) * 1.3))}}'),
  'snow layer too short for its loop': replace('top:calc(-10vh - var(--tile));bottom:-10vh', 'top:0;bottom:0'),
  'holes get the default button border back': replace('.hole{position:relative;overflow:hidden;border:0;padding:0;', '.hole{position:relative;overflow:hidden;'),
  'score message back in one fixed place': replace("el.style.top=Math.max(box.top-area.top+10,el.offsetHeight+2)+'px';", ''),
  'score message may cover the scoreboard': replace('Math.max(box.top-area.top+10,el.offsetHeight+2)', '(box.top-area.top+10)'),
  'score message may leave the board area': replace('area.width-half)', 'area.width+half)'),
  'version changed in the script but not on the page': replace("const VERSION = '19.1.2';", "const VERSION = '19.1.3';"),
  'version shown without its release date': replace('· 版本 19.1.2（2026-11-11）', '· 版本 19.1.2'),
  'music starts with the page instead of the round': replace('  track(MUSIC_TRACKS.length-1);\n', '  track(MUSIC_TRACKS.length-1);running=true;playMusic();running=false;\n'),
  'same track every round': replace('music.next=(i+1)%MUSIC_TRACKS.length;', 'music.next=0;'),
  'music ignores the sound switch': replace('if(music.gain)music.gain.gain.setTargetAtTime(soundOn?MUSIC_VOLUME:0,audioCtx.currentTime,.03);', ''),
  'music plays although sound is off': replace('music.gain.gain.value=soundOn?MUSIC_VOLUME:0;', 'music.gain.gain.value=MUSIC_VOLUME;'),
  'music keeps playing after the round': replace("stopMusic();beep(260,.09,'triangle');", "beep(260,.09,'triangle');"),
  'tracks lose their own level': replace('fade.gain.value=MUSIC_TRACKS[i].gain;', ''),
  'happy played as quietly as before': replace('"m4a":"assets/music-20261110/happy-5e3a15364b4c.m4a","gain":1.5}', '"m4a":"assets/music-20261110/happy-5e3a15364b4c.m4a","gain":1}'),
  'music louder than set': replace('const MUSIC_VOLUME=.35;', 'const MUSIC_VOLUME=.7;'),
  'music skips the start of its track': replace('source.start(0,Math.min(buffer.duration,Math.max(0,(performance.now()-started)/1000)));', 'source.start(0,5);'),
  'a late track starts from its beginning': replace('source.start(0,Math.min(buffer.duration,Math.max(0,(performance.now()-started)/1000)));', 'source.start(0,0);'),
  'the round waits for its music': async ({ html, setHtml }) => {
    const source = await html();
    const next = source.replace('  function start(){', '  async function start(){').replace("update();spawn();playMusic();", "await track(music.next);update();spawn();playMusic();");
    if (next === source || !next.includes('await track(music.next)') || !next.includes('async function start(){')) return false;
    await setHtml(next);
    return true;
  },
  'tap marks removed': replace("ripple(i,e,hit(i)||'miss');", 'hit(i);'),
  'tap marks ignore where the finger landed': replace('const pointed=e&&(e.clientX||e.clientY);', 'const pointed=false;'),
  'tap marks swallow taps': replace('.fx{position:absolute;inset:0;pointer-events:none;z-index:5}', '.fx{position:absolute;inset:0;z-index:5}'),
  'tap marks pile up': replace('.finished.then(remove,remove);', ';'),
  'reduced motion still spreads the ring': replace('grow=calm.matches?.5:1.5', 'grow=1.5'),
  'reduced motion still bounces the character': replace('if(calm.matches)return;', ''),
  'reduced motion snow keeps falling': replace('.snow-layer{animation:none;will-change:auto}', ''),
  'reduced motion hides the toast': replace('.toast.show{animation:none;opacity:1;transform:translate(-50%,-8px)}', ''),
  'toast never clears': replace("toastTimer=setTimeout(()=>el.classList.remove('show'),550);", ''),
  'hit no longer locks the position': replace('a.m.style.bottom=cs.bottom;', ''),
  'bear warning stance lost': replace('.hole.bear-warning .mole{bottom:2%;left:2%}', ''),
};

const EQUIVALENTS = {
  'frame position written as a fraction': replace('background-position-x:25%}', 'background-position-x:calc(100% / 4)}'),
  'gain written as 0.12': replace('vol=.12', 'vol=0.12'),
  // resetHole() also drops the type class, so every sprite is display:none while hidden;
  // the visibility rule is a second guard and removing it is not visible to the player.
  'redundant hidden-state visibility rule removed': replace('.hole[data-state="hidden"] .mole{visibility:hidden}', ''),
  'reformatted with spaces': async ({ html, setHtml }) => {
    const source = await html();
    const next = source.replace('vol=.12', 'vol = 0.12').replace("beep(120,.12,'sawtooth',.16)", "beep(120, 0.12, 'sawtooth', 0.16)");
    if (next === source) return false;
    await setHtml(next);
    return true;
  },
  'sound constants extracted': async ({ html, setHtml }) => {
    const source = await html();
    const next = source.replace("beep(120,.12,'sawtooth',.16)", 'beep(...BEAR_SOUND)').replace('function beep(', "const BEAR_SOUND=[120,.12,'sawtooth',.16];\n  function beep(");
    if (next === source) return false;
    await setHtml(next);
    return true;
  },
  // A release changes the number everywhere it is written, and nothing else.
  'version bumped': async ({ html, setHtml, read, write }) => {
    const bump = text => text.replaceAll('19.1.2', '19.1.3').replaceAll('2026-11-11', '2026-12-01');
    const source = await html();
    if (!source.includes("const VERSION = '19.1.2';")) return false;
    await setHtml(bump(source));
    await write('README.md', bump(await read('README.md')));
    await write('CHANGELOG.md', bump(await read('CHANGELOG.md')));
    return true;
  },
  'script moved to a module file': async ({ html, setHtml, write }) => {
    const source = await html();
    const match = source.match(/<script>([\s\S]*)<\/script>/);
    if (!match) return false;
    await write('app.js', match[1]);
    await setHtml(source.replace(match[0], '<script type="module" src="app.js"></script>'));
    return true;
  },
};

const argv = process.argv.slice(2);
function usage(message) {
  console.error(`mutation-check: ${message}`);
  process.exit(2);
}
function option(name) {
  const at = argv.indexOf(name);
  if (at === -1) return undefined;
  const value = argv[at + 1];
  if (value === undefined || value.startsWith('--')) usage(`${name} needs a value`);
  return value;
}
function positiveInt(text, label) {
  if (!/^[1-9]\d*$/.test(text)) usage(`${label} must be a whole number of at least 1, got "${text}"`);
  return Number(text);
}

// An argument this script does not know must stop it: ignoring one would start the whole list.
for (let at = 0; at < argv.length; at++) {
  if (argv[at] === '--only' || argv[at] === '--shard') at++;
  else if (argv[at] !== '--strict') usage(`unknown argument "${argv[at]}"`);
}
const strict = argv.includes('--strict');
const only = option('--only');
const shardText = option('--shard');
const workers = positiveInt(process.env.MUTATION_WORKERS || '1', 'MUTATION_WORKERS');
const caseTimeout = positiveInt(process.env.MUTATION_CASE_TIMEOUT_MS || '180000', 'MUTATION_CASE_TIMEOUT_MS');
const COPY = ['index.html', 'assets', 'deployment', 'scripts', 'tests', 'package.json', 'README.md', 'CHANGELOG.md'];
const RESULTS = path.join(ROOT, 'test-results');
const LOGS = path.join(RESULTS, 'mutation');

const all = [
  ...Object.entries(MUTANTS).map(([name, transform]) => ({ name, transform, expected: 'fail' })),
  ...Object.entries(EQUIVALENTS).map(([name, transform]) => ({ name, transform, expected: 'pass' })),
].map((item, index) => ({
  ...item,
  slug: `${String(index + 1).padStart(2, '0')}-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
}));

let queue = all;
let reportName = 'mutation-report.json';
if (only !== undefined) {
  queue = all.filter(item => item.name === only);
  if (!queue.length) usage(`no case is named "${only}"`);
  reportName = 'mutation-report-only.json';
}
if (shardText !== undefined) {
  const match = shardText.match(/^(\d+)\/(\d+)$/);
  const index = Number(match?.[1]);
  const total = Number(match?.[2]);
  if (!match || index < 1 || index > total) usage(`--shard must look like 1/3, got "${shardText}"`);
  // Every n-th case, so the slow equivalents at the end are spread across shards.
  queue = queue.filter((_, position) => position % total === index - 1);
  reportName = `mutation-report-${index}of${total}.json`;
}
queue = [...queue];

// Each test process leads its own process group, so a timeout or an interrupt
// can take its children down with it instead of leaving them to slow later cases.
const running = new Set();
const killGroup = child => { try { process.kill(-child.pid, 'SIGKILL'); } catch (_) {} };
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    for (const child of running) killGroup(child);
    process.exit(130);
  });
}

function run(args, cwd) {
  return new Promise(resolve => {
    const started = Date.now();
    const child = spawn(process.execPath, args, { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    running.add(child);
    let output = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killGroup(child); }, caseTimeout);
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', error => { output += `\nspawn failed: ${error.message}\n`; });
    child.on('exit', () => killGroup(child));
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      running.delete(child);
      resolve({ status, signal, timedOut, ms: Date.now() - started, output });
    });
  });
}

async function runCase({ transform, slug }) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mutation-'));
  try {
    for (const item of COPY) await cp(path.join(ROOT, item), path.join(dir, item), { recursive: true });
    await symlink(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'));
    const htmlFile = path.join(dir, 'index.html');
    const applied = await transform({
      html: () => readFile(htmlFile, 'utf8'),
      setHtml: value => writeFile(htmlFile, value),
      read: name => readFile(path.join(dir, name), 'utf8'),
      write: (name, value) => writeFile(path.join(dir, name), value),
    });
    if (!applied) return { result: 'stale' };
    // Caught mutants stop after the tests. Survivors also go through the rest of the
    // gate, with its real-time browser smoke test, but not through the same tests twice.
    const stages = [];
    let stage = 'tests';
    let last = await run(['--test', '--test-reporter=spec', 'tests/**/*.test.mjs'], dir);
    stages.push({ stage, status: last.status, signal: last.signal, timedOut: last.timedOut, ms: last.ms });
    let output = last.output;
    if (last.status === 0) {
      stage = 'gate';
      last = await run(['scripts/verify-assets.mjs', '--skip-tests'], dir);
      stages.push({ stage, status: last.status, signal: last.signal, timedOut: last.timedOut, ms: last.ms });
      output += `\n----- ${stage} -----\n${last.output}`;
    }
    if (last.status === 0) return { result: 'pass', stages };
    await mkdir(LOGS, { recursive: true });
    const log = path.join(LOGS, `${slug}.log`);
    await writeFile(log, output.replaceAll(dir, '<case>'));
    // A process killed for running too long says nothing about the rule under test,
    // so it is never counted as a caught mutant.
    if (last.timedOut) return { result: 'timeout', stages, reason: `${stage} killed after ${caseTimeout} ms`, log: path.relative(ROOT, log) };
    const reason = last.output.match(/^\s*✖ (.+?)(?: \(\d|$)/m)?.[1] ?? last.output.match(/FAIL .*/)?.[0] ?? `${stage} exited with ${last.status ?? last.signal}`;
    return { result: 'fail', stages, reason: reason.slice(0, 100), log: path.relative(ROOT, log) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const total = queue.length;
const results = [];
const worker = async () => {
  for (let item = queue.shift(); item; item = queue.shift()) {
    const { name, expected } = item;
    const { result, reason = '', stages = [], log } = await runCase(item);
    const ok = result === expected;
    const seconds = Math.round(stages.reduce((sum, entry) => sum + entry.ms, 0) / 1000);
    results.push({ name, expected, result, ok, reason, seconds, stages, log });
    console.log(`${ok ? 'ok  ' : result === 'stale' ? 'STALE' : 'BAD '} expected ${expected.toUpperCase()}, got ${result.toUpperCase()} in ${seconds}s: ${name}${reason ? ` <- ${reason}` : ''}`);
  }
};
console.log(`${total} of ${all.length} cases, ${Math.min(workers, total)} at a time`);
await Promise.all(Array.from({ length: Math.min(workers, total) }, worker));

const stale = results.filter(entry => entry.result === 'stale');
const wrong = results.filter(entry => !entry.ok && entry.result !== 'stale');
await mkdir(RESULTS, { recursive: true });
await writeFile(path.join(RESULTS, reportName), JSON.stringify(results, null, 2) + '\n');
console.log(`\n${results.filter(entry => entry.ok).length}/${results.length} as expected, ${wrong.length} wrong, ${stale.length} stale`);
for (const entry of wrong) console.log(`::error::Mutation check: expected ${entry.expected}, got ${entry.result}: ${entry.name}${entry.reason ? ` <- ${entry.reason}` : ''}`);
for (const entry of stale) console.log(`::${strict ? 'error' : 'warning'}::Mutation check is stale, update its search text: ${entry.name}`);
if (!results.length || wrong.length || (strict && stale.length)) process.exitCode = 1;
