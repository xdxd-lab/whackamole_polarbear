/**
 * Tests the tests. Each mutant is a throwaway copy of the game:
 *   MUTANTS break a rule, so the suite must FAIL.
 *   EQUIVALENTS only change how the code is written, so the suite must PASS.
 *
 * A mutant whose search text no longer exists (because the source was
 * legitimately refactored) is reported as stale. That is a warning by default
 * and an error with --strict, so a refactor cannot fail CI by itself while the
 * list can still be kept honest.
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
  'sprite frames swapped': replace("const ids = ['peek','warning','sneaky','pain','sad'];", "const ids = ['warning','peek','sneaky','pain','sad'];"),
  'sad frame no longer drops': replace("{duration:340,easing:'ease-in',fill:'forwards'}", "{duration:340,easing:'ease-in'}"),
  'scoreboard rewritten on every tick': replace('if(el.textContent!==text)el.textContent=text;', 'el.textContent=text;'),
  'images forced to revalidate': replace('fetch(cfg.url)', "fetch(cfg.url, {cache:'no-cache'})"),
  'image hash no longer checked': replace('if (digest !== cfg.sha256)', 'if (false)'),
  'page may outgrow the screen': replace('.game{width:min(680px,100%);max-height:100%;', '.game{width:min(680px,100%);'),
  'board no longer centred': replace('height:min(100cqw,100cqh);margin:auto}', 'height:min(100cqw,100cqh)}'),
  'landscape loses its two columns': replace('@media(orientation:landscape) and (max-height:560px){', '@media(orientation:landscape) and (max-height:1px){'),
  'bear warning stance lost': replace('.hole.bear-warning .mole{bottom:2%!important;left:2%!important}', ''),
};

const EQUIVALENTS = {
  'sprites use blob URLs': async ({ html, setHtml }) => {
    const source = await html();
    const next = source
      .replace('ids.forEach((state,i)=>{', 'for(const [i,state] of ids.entries()){')
      .replace("result[species][state]=canvas.toDataURL('image/png');\n        });", "result[species][state]=URL.createObjectURL(await new Promise(r=>canvas.toBlob(r,'image/png')));\n        }");
    if (next === source || next.includes('toDataURL')) return false;
    await setHtml(next);
    return true;
  },
  'gain written as 0.12': replace('vol=.12', 'vol=0.12'),
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
  'version bumped': replace('20261024-v18', '20261201-v19'),
  'script moved to a module file': async ({ html, setHtml, write }) => {
    const source = await html();
    const match = source.match(/<script>([\s\S]*)<\/script>/);
    if (!match) return false;
    await write('app.js', match[1]);
    await setHtml(source.replace(match[0], '<script type="module" src="app.js"></script>'));
    return true;
  },
};

const strict = process.argv.includes('--strict');
const COPY = ['index.html', 'assets', 'deployment', 'scripts', 'tests', 'package.json'];

function run(args, cwd) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, args, { cwd, timeout: 180_000 });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('close', status => resolve({ status, output }));
  });
}

async function runCase(transform) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mutation-'));
  try {
    for (const item of COPY) await cp(path.join(ROOT, item), path.join(dir, item), { recursive: true });
    await symlink(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'));
    const htmlFile = path.join(dir, 'index.html');
    const applied = await transform({
      html: () => readFile(htmlFile, 'utf8'),
      setHtml: value => writeFile(htmlFile, value),
      write: (name, value) => writeFile(path.join(dir, name), value),
    });
    if (!applied) return { result: 'stale' };
    // The gate runs these same tests. Running them first keeps caught mutants cheap;
    // only survivors pay for the full gate with its real-time browser smoke test.
    let { status, output } = await run(['--test', '--test-reporter=spec', 'tests/**/*.test.mjs'], dir);
    if (status === 0) ({ status, output } = await run(['scripts/verify-assets.mjs'], dir));
    if (status === 0) return { result: 'pass' };
    const reason = output.match(/^\s*✖ (.+?)(?: \(\d|$)/m)?.[1] ?? output.match(/FAIL .*/)?.[0] ?? 'failed';
    return { result: 'fail', reason: reason.slice(0, 100) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const queue = [
  ...Object.entries(MUTANTS).map(([name, transform]) => ({ name, transform, expected: 'fail' })),
  ...Object.entries(EQUIVALENTS).map(([name, transform]) => ({ name, transform, expected: 'pass' })),
];
const results = [];
const worker = async () => {
  for (let item = queue.shift(); item; item = queue.shift()) {
    const { name, transform, expected } = item;
    const { result, reason = '' } = await runCase(transform);
    const ok = result === expected;
    results.push({ name, expected, result, ok, reason });
    console.log(`${ok ? 'ok  ' : result === 'stale' ? 'STALE' : 'BAD '} expected ${expected.toUpperCase()}, got ${result.toUpperCase()}: ${name}${reason ? ` <- ${reason}` : ''}`);
  }
};
await Promise.all(Array.from({ length: Math.max(2, Math.min(6, os.availableParallelism() >> 1)) }, worker));

const stale = results.filter(entry => entry.result === 'stale');
const wrong = results.filter(entry => !entry.ok && entry.result !== 'stale');
await mkdir(path.join(ROOT, 'test-results'), { recursive: true });
await writeFile(path.join(ROOT, 'test-results', 'mutation-report.json'), JSON.stringify(results, null, 2) + '\n');
console.log(`\n${results.filter(entry => entry.ok).length}/${results.length} as expected, ${wrong.length} wrong, ${stale.length} stale`);
for (const entry of stale) console.log(`::warning::Mutation check is stale, update its search text: ${entry.name}`);
if (wrong.length || (strict && stale.length)) process.exitCode = 1;
