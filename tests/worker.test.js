// The Cloudflare Worker (worker/worker.js), run in Node with a fake Workers AI and fake settings:
// translation model order, automatic fallback when a model is retired, /status, and the origin check.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const ORIGIN = 'https://curioushelvetica.github.io';

// A fresh copy of the Worker each time (its memory of translations and of the working model starts empty)
let copies = 0;
async function loadWorker() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'worker.js'), 'utf8');
  const file = path.join(os.tmpdir(), `parents-transit-worker-${process.pid}-${copies++}.mjs`);
  fs.writeFileSync(file, src);
  const mod = await import(pathToFileURL(file).href);
  fs.unlinkSync(file);
  return mod.default;
}
// Fake Workers AI: `retired` models fail like Cloudflare's 410; records every call
function fakeAI({ retired = [], answer = (model, text) => `中文(${model}):${text.split('\n')[0]}` } = {}) {
  const calls = [];
  return {
    calls,
    async run(model, input) {
      const user = input.messages[1].content;
      calls.push({ model, user });
      if (retired.includes(model)) throw new Error('5028: model has been deprecated (410 Gone)');
      return { response: answer(model, user) };
    },
  };
}
const ask = (worker, env, text, origin = ORIGIN) => worker.fetch(
  new Request(`https://w.example/translate?text=${encodeURIComponent(text)}`, { headers: origin ? { Origin: origin } : {} }), env);

module.exports = async (check) => {
  // Default order, no setting
  let w = await loadWorker();
  let ai = fakeAI();
  let res = await ask(w, { AI: ai, ALLOWED_ORIGIN: ORIGIN }, 'Lift closed.');
  let body = await res.json();
  check(res.status === 200 && body.model === '@cf/qwen/qwen3.8-27b' && body.zh.startsWith('中文(@cf/qwen/qwen3.8-27b)'),
    `no setting: built-in first model answers (${body.model})`);
  check(ai.calls[0].user.endsWith('/no_think'), 'Qwen3 models are asked to skip their thinking step');
  check(!ai.calls.some((c) => c.model.includes('qwq-32b') || c.model.includes('qwen3-30b')), 'the retired qwen3-30b model is no longer used');

  // The first model retired: the next one answers, and is tried first next time
  w = await loadWorker();
  ai = fakeAI({ retired: ['@cf/qwen/qwen3.8-27b'] });
  res = await ask(w, { AI: ai, ALLOWED_ORIGIN: ORIGIN }, 'Trackwork tonight.');
  body = await res.json();
  check(res.status === 200 && body.model === '@cf/google/gemma-4-26b-a4b-it', `first model retired: falls back to ${body.model}`);
  check(!ai.calls.find((c) => c.model.includes('gemma')).user.includes('/no_think'), 'no Qwen-only instruction sent to Gemma');
  const before = ai.calls.length;
  await ask(w, { AI: ai, ALLOWED_ORIGIN: ORIGIN }, 'Another notice.');
  check(ai.calls.length === before + 1 && ai.calls[before].model.includes('gemma'), 'next notice goes straight to the working model (one call)');

  // TRANSLATE_MODEL list goes first; spaces and repeats are fine
  w = await loadWorker();
  ai = fakeAI({ retired: ['@cf/new/model-a'] });
  const env = { AI: ai, ALLOWED_ORIGIN: ORIGIN, TRANSLATE_MODEL: ' @cf/new/model-a ,@cf/new/model-b, @cf/qwen/qwen3.8-27b ' };
  body = await (await ask(w, env, 'Buses replace trains.')).json();
  check(body.model === '@cf/new/model-b' && ai.calls.map((c) => c.model).join() === '@cf/new/model-a,@cf/new/model-b',
    `TRANSLATE_MODEL tried first, in order (${ai.calls.map((c) => c.model).join(' → ')})`);

  // Every model fails: an error, so the app shows the English
  w = await loadWorker();
  ai = fakeAI({ retired: ['@cf/qwen/qwen3.8-27b', '@cf/google/gemma-4-26b-a4b-it'] });
  res = await ask(w, { AI: ai, ALLOWED_ORIGIN: ORIGIN }, 'Lift closed.');
  body = await res.json();
  check(res.status === 502 && /qwen3\.8-27b: .*410/.test(body.error) && /gemma/.test(body.error) && !body.zh, 'all models fail: error listing each model, no translation');

  // A model that only "thinks" or answers nothing counts as failed
  w = await loadWorker();
  ai = fakeAI({ answer: (model) => (model.includes('qwen') ? '<think>hmm</think>' : '升降機關閉。') });
  body = await (await ask(w, { AI: ai, ALLOWED_ORIGIN: ORIGIN }, 'Lift closed.')).json();
  check(body.zh === '升降機關閉。' && body.model.includes('gemma'), 'empty answer after removing <think>: next model used');

  // Same text again: remembered, no AI call
  const n = ai.calls.length;
  await ask(w, { AI: ai, ALLOWED_ORIGIN: ORIGIN }, 'Lift closed.');
  check(ai.calls.length === n, 'same notice again: answered from memory');

  // Only the app may ask for translations
  res = await ask(w, { AI: ai, ALLOWED_ORIGIN: ORIGIN }, 'Lift closed.', 'https://someone-else.example');
  check(res.status === 403, 'other websites: Forbidden');
  res = await ask(w, { AI: ai, ALLOWED_ORIGIN: ORIGIN }, 'Lift closed.', null);
  check(res.status === 403, 'no origin: Forbidden');
  res = await ask(w, { ALLOWED_ORIGIN: ORIGIN }, 'Lift closed.');
  check(res.status === 501, 'no Workers AI binding: clear error');

  // /status: models in order and a test translation, opened directly in a browser
  w = await loadWorker();
  ai = fakeAI({ retired: ['@cf/qwen/qwen3.8-27b'] });
  res = await w.fetch(new Request('https://w.example/status'), { AI: ai, TRANSLATE_MODEL: '@cf/qwen/qwen3.8-27b' });
  body = await res.json();
  check(res.status === 200 && body.models.join() === '@cf/qwen/qwen3.8-27b,@cf/google/gemma-4-26b-a4b-it'
    && body.test.model.includes('gemma') && body.test.zh, `/status: models listed, test answered by ${body.test && body.test.model}`);
  const m = ai.calls.length;
  await w.fetch(new Request('https://w.example/status'), { AI: ai });
  check(ai.calls.length === m, '/status again: no extra AI use');

  // Trip planner requests still need the app's origin
  res = await w.fetch(new Request('https://w.example/tp/trip?x=1'), { ALLOWED_ORIGIN: ORIGIN, TFNSW_API_KEY: 'k' });
  check(res.status === 403, 'trip planner without the app origin: Forbidden');
};
