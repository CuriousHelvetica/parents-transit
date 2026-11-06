// Runs every tests/*.test.js (or the files named on the command line) one after another.
// Exit code 1 if any check fails or a test file crashes.  Usage: npm test   or   node tests/run.js trips
const fs = require('fs');
const path = require('path');
const { makeChecker } = require('./helpers');

async function runFile(file) {
  const c = makeChecker(file);
  console.log(`\n▶ ${path.basename(file)}`);
  const started = Date.now();
  try {
    await require(file)(c.check);
  } catch (e) {
    c.check(false, `crashed: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`);
  }
  console.log(`  (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  return c.results;
}

async function main() {
  const want = process.argv.slice(2);
  const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js'))
    .filter((f) => !want.length || want.some((w) => f.includes(w))).sort()
    .map((f) => path.join(__dirname, f));
  let pass = 0, fail = 0;
  const failed = [];
  for (const f of files) {
    for (const r of await runFile(f)) {
      if (r.ok) pass++; else { fail++; failed.push(`${path.basename(f)}: ${r.label}`); }
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  failed.forEach((x) => console.log(`  FAIL ${x}`));
  process.exit(fail ? 1 : 0);
}
main();
