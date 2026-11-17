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

  // ---- /place: one AI step (what was meant, English + Chinese names) -> Transport for NSW -> best real match
  const realFetch = global.fetch;
  const tfnswAsked = [];
  // Real-looking answers (from the live search, November 2026)
  const LOCS = {
    'University of Sydney': [
      { id: 'b1', name: 'University of Sydney Library, Brownlow Hill', type: 'stop', modes: [5, 11] },
      { id: 'b2', name: 'Werombi Rd opp The University of Sydney Library, Brownlow Hill', type: 'stop', modes: [5, 11] },
      { id: 'u1', name: 'The University of Sydney, Camperdown', type: 'poi' },
      { id: 'b3', name: 'University of Sydney Main Gate, Parramatta Rd, Camperdown', type: 'stop', modes: [5, 11] },
    ],
    'Darling Harbour': [
      { id: 'h1', name: 'Holiday Inn Darling Harbour, Haymarket', type: 'poi' },
      { id: 'd1', name: 'Darling Harbour, Sydney', type: 'poi' },
      { id: 'd2', name: 'Darling Harbour, King Street Wharf, Sydney', type: 'stop', modes: [9] },
    ],
    'Paddys Markets': [{ id: 'p1', name: "Paddy's Markets Light Rail, Haymarket", type: 'stop', modes: [4] }],
    'Cabramatta': [{ id: 's1', name: 'Cabramatta Rd, Mosman', type: 'street' }, { id: 's2', name: 'Cabramatta', type: 'suburb' }],
    'Sydney Fish Market': [{ id: 'x1', name: 'Sydney Market Plaza, Homebush West', type: 'poi', isBest: true }],
  };
  global.fetch = async (url, init) => {
    const term = new URL(url).searchParams.get('name_sf');
    tfnswAsked.push({ term, key: init && init.headers && init.headers.Authorization });
    if (term === 'Broken') return new Response('', { status: 500 });
    return new Response(JSON.stringify({ locations: LOCS[term] || [] }), { headers: { 'Content-Type': 'application/json' } });
  };
  const said = (places) => fakeAI({ answer: () => `Sure! ${JSON.stringify({ places })}` });
  const askPlace = (worker, env, text, origin = ORIGIN, extra = '') => worker.fetch(
    new Request(`https://w.example/place?text=${encodeURIComponent(text)}${extra}`, { headers: origin ? { Origin: origin } : {} }), env);
  const penv = (ai, more = {}) => ({ AI: ai, ALLOWED_ORIGIN: ORIGIN, TFNSW_API_KEY: 'k', ...more });

  w = await loadWorker();
  ai = said([{ en: 'University of Sydney', zh: '悉尼大學', kind: 'university' }]);
  res = await askPlace(w, penv(ai), '雪梨大學');
  body = await res.json();
  check(ai.calls.length === 1 && ai.calls[0].model === '@cf/meta/llama-3.3-70b-instruct-fp8-fast', `/place: one AI call, fast model first (${ai.calls.map((c) => c.model).join()})`);
  check(ai.calls[0].user.startsWith('悉尼大學'), '/place: 雪梨 is passed to the AI as 悉尼');
  check(res.status === 200 && body.places.length === 1 && body.places[0].id === 'u1' && body.places[0].zh === '悉尼大學' && body.places[0].kind === 'university',
    `/place: the Camperdown campus, not the Brownlow Hill bus stops listed first (${body.places.map((p) => p.name).join()})`);
  check(tfnswAsked.length === 1 && tfnswAsked[0].key === 'apikey k', '/place: looked up with the key');
  const k = ai.calls.length;
  await askPlace(w, penv(ai), '雪梨大學');
  check(ai.calls.length === k, '/place: same text again: answered from memory');

  // Workers AI can hand a JSON answer back already decoded, as an object (seen on the live service)
  w = await loadWorker();
  const objAI = { calls: [], async run(model) { this.calls.push(model);
    return { response: { places: [{ en: 'University of Sydney', zh: '悉尼大學', kind: 'university' }] } }; } };
  body = await (await askPlace(w, penv(objAI), '悉尼大學')).json();
  check(body.places.length === 1 && body.places[0].id === 'u1' && objAI.calls.length === 1, '/place: an answer already decoded as an object is understood');
  w = await loadWorker();
  const oddAI = { async run() { return { result: 42 }; } };
  body = await (await askPlace(w, penv(oddAI), '悉尼大學', ORIGIN, '&debug=1')).json();
  check(body.debug.steps.some((st) => /answer was \{result:number\}/.test(st.error || '')), '/place debug: an unreadable answer says what came back');

  // Several meanings, looked up together: each keeps its best real match; hotels, streets and wrong places never
  w = await loadWorker();
  tfnswAsked.length = 0;
  ai = said([{ en: 'Darling Harbour', zh: '情人港', kind: 'park' }, { en: 'Paddys Markets', zh: '派迪市場', kind: 'spaceship' },
    { en: 'Cabramatta', zh: '卡市', kind: 'suburb' }, { en: 'Sydney Fish Market', zh: '魚市場', kind: 'market' }]);
  body = await (await askPlace(w, penv(ai), '情人港')).json();
  check(body.places.map((p) => p.id).join() === 'd1,p1,s2',
    `/place: Darling Harbour itself (not the hotel), the light rail stop, the suburb (not the street); at most 3 meanings (${body.places.map((p) => p.name).join(' / ')})`);
  check(tfnswAsked.length === 3, `/place: one lookup per meaning, at most 3 (${tfnswAsked.length})`);
  check(body.places[1].kind === 'other', '/place: an unknown kind becomes "other"');

  // A meaning with no matching name: nothing, not Transport for NSW's "best" guess
  w = await loadWorker();
  ai = said([{ en: 'Sydney Fish Market', zh: '魚市場', kind: 'market' }]);
  body = await (await askPlace(w, penv(ai), '魚市場')).json();
  check(body.places.length === 0, '/place: no real match: no places (not Sydney Market Plaza in Homebush)');

  // The fast model fails or is too slow: the next one answers, and goes first next time
  w = await loadWorker();
  ai = fakeAI({ retired: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast'], answer: () => '{"places":[{"en":"University of Sydney","zh":"悉尼大學","kind":"university"}]}' });
  body = await (await askPlace(w, penv(ai), '悉尼大學', ORIGIN, '&debug=1')).json();
  check(body.places.length === 1 && ai.calls.map((c) => c.model).join() === '@cf/meta/llama-3.3-70b-instruct-fp8-fast,@cf/google/gemma-4-26b-a4b-it',
    '/place: fast model retired: the next one answers');
  check(body.debug && body.debug.steps.some((s) => s.error && /410/.test(s.error)) && body.debug.steps.some((s) => s.raw && s.model.includes('gemma'))
    && typeof body.debug.ms === 'number' && body.debug.steps.some((s) => s.lookup),
    '/place debug=1: models tried, errors, raw answer, lookups and time');
  await askPlace(w, penv(ai), '悉尼大學二');
  check(ai.calls[ai.calls.length - 1].model.includes('gemma') && ai.calls.length === 3, '/place: the working model is tried first next time');
  body = await (await askPlace(w, penv(ai), '悉尼大學')).json();
  check(!body.debug, '/place: no debug details unless asked');

  // PLACE_MODEL setting goes first
  w = await loadWorker();
  ai = said([{ en: 'University of Sydney', zh: '悉尼大學', kind: 'university' }]);
  await askPlace(w, penv(ai, { PLACE_MODEL: '@cf/new/fast' }), '悉尼大學');
  check(ai.calls[0].model === '@cf/new/fast', 'PLACE_MODEL tried first');
  res = await w.fetch(new Request('https://w.example/status'), { AI: ai, PLACE_MODEL: '@cf/new/fast' });
  check((await res.json()).placeModels[0] === '@cf/new/fast', '/status lists the place models too');

  // A model that never answers is given up on (12 s) and the next one used
  w = await loadWorker();
  const slowAI = { calls: [], async run(model) { this.calls.push(model); if (model.includes('llama')) return new Promise(() => {});
    return { response: '{"places":[{"en":"University of Sydney","zh":"悉尼大學","kind":"university"}]}' }; } };
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, ms >= 12000 ? 10 : ms, ...a);   // don't really wait 12 s
  body = await (await askPlace(w, penv(slowAI), '悉尼大學')).json();
  global.setTimeout = realSetTimeout;
  check(body.places.length === 1 && slowAI.calls.join() === '@cf/meta/llama-3.3-70b-instruct-fp8-fast,@cf/google/gemma-4-26b-a4b-it',
    '/place: a model that hangs is skipped after the time limit');

  // Failures: no usable answer, Transport for NSW down, wrong origin, missing settings
  w = await loadWorker();
  ai = fakeAI({ answer: () => 'no idea' });
  res = await askPlace(w, penv(ai), '某地');
  check(res.status === 502, '/place: no usable answer from any model: error (app shows its not-found message)');
  w = await loadWorker();
  ai = said([{ en: 'Broken', zh: '壞', kind: 'other' }]);
  res = await askPlace(w, penv(ai), '壞');
  check(res.status === 502, '/place: Transport for NSW not answering: error');
  res = await askPlace(w, penv(ai), '機場', 'https://someone-else.example');
  check(res.status === 403, '/place: other websites: Forbidden');
  res = await askPlace(w, { ALLOWED_ORIGIN: ORIGIN, TFNSW_API_KEY: 'k' }, '機場');
  check(res.status === 501, '/place: no Workers AI binding: clear error');
  global.fetch = realFetch;
};
