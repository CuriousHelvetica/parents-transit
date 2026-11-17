// Cloudflare Worker: a small go-between for the Transport for NSW Trip Planner API.
// - Keeps the API key secret (stored as the TFNSW_API_KEY secret, never in the web page).
// - Adds the CORS headers the TfNSW API does not send, for the web page's origin only.
// - /ics makes a calendar event with an alarm, used for "remind me when to leave".
// - /translate translates service notices into Traditional Chinese with Workers AI (free tier).
//   If a model fails (e.g. Cloudflare retired it), the next model in the list is tried automatically.
// - /place finds a place typed in Chinese: one Workers AI call says what the person most likely means
//   (up to 3 places, each with an English and a Chinese name), then each is looked up in Transport for NSW
//   and the best real match is kept by fixed rules. Add &debug=1 to see models, timings and raw answers.
// - /status shows which translation models are set up and which one answers (open it in a browser).
//
// Settings (Cloudflare dashboard → Worker → Settings → Variables and Secrets):
//   TFNSW_API_KEY   (Secret)  your Transport for NSW Open Data API key
//   ALLOWED_ORIGIN  (Text)    e.g. https://curioushelvetica.github.io
//   TRANSLATE_MODEL (Text, optional) Workers AI models to try first, in order, separated by commas,
//                   e.g. "@cf/qwen/qwen3.8-27b, @cf/google/gemma-4-26b-a4b-it". The built-in list below
//                   is always tried after these. Change it when Cloudflare announces new models.
//   PLACE_MODEL     (Text, optional) the same, for the Chinese place search (/place). Fast models suit it best.
// Bindings (Worker → Settings → Bindings): Workers AI, variable name AI

const UPSTREAM = 'https://api.transport.nsw.gov.au/v1/tp/';
const ALLOWED_ENDPOINTS = ['trip', 'stop_finder', 'departure_mon'];
// Tried in this order (after any in TRANSLATE_MODEL). Cloudflare retires models from time to time.
const DEFAULT_TRANSLATE_MODELS = ['@cf/qwen/qwen3.8-27b', '@cf/google/gemma-4-26b-a4b-it'];
const STATUS_TEXT = 'Lifts at Central Station are closed today.';
const TRANSLATE_PROMPT =
  'You translate Sydney public transport service notices from English into Traditional Chinese ' +
  '(繁體中文), written in clear, simple standard written Chinese for elderly readers. ' +
  'Keep station names, street names, line and route numbers (e.g. T1, T9, 525) in English exactly as written, ' +
  'so they match the signs. Keep all times and dates. Output only the translation, nothing else.';
// Place search wants a quick answer, not long reasoning: fast models first, the translation ones after
const DEFAULT_PLACE_MODELS = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/google/gemma-4-26b-a4b-it'];
const PLACE_MODEL_TIMEOUT_MS = 12000;   // a model slower than this is skipped (the app waits up to 30 s in all)
const PLACE_PROMPT =
  'An elderly Cantonese speaker in Sydney, Australia typed the name of a place they want to travel to, in Chinese. ' +
  '雪梨 and 悉尼 both mean Sydney. Chinese names of Sydney suburbs are often Cantonese sound-alikes ' +
  '(e.g. 好市圍 = Hurstville, 車士活 = Chatswood, 寶活 = Burwood). ' +
  'Say which real places in Sydney they most likely mean: at most 3, most likely first, only more than one if it is ' +
  'genuinely unclear. For each give "en": the official English name exactly as Transport for NSW would list it ' +
  '(e.g. "University of Sydney", "Royal Prince Alfred Hospital", "Taronga Zoo"), no suburb or address; ' +
  '"zh": a short Traditional Chinese (繁體中文) name as Sydney Chinese speakers say it; and "kind", one of: ' +
  'airport, shopping, hospital, university, school, club, park, beach, museum, church, temple, market, government, ' +
  'suburb, station, other. Answer with JSON only, like {"places":[{"en":"...","zh":"...","kind":"..."}]}.';
const PLACE_KINDS = ['airport', 'shopping', 'hospital', 'university', 'school', 'club', 'park', 'beach', 'museum',
  'church', 'temple', 'market', 'government', 'suburb', 'station', 'other'];
let workingPlaceModel = null;
const placeMemo = new Map();          // typed text -> answer (only answers that found something)
const translationMemo = new Map();   // text -> { zh, model }
let workingModel = null;              // the model that last answered (tried first next time)

function translateModels(env) {
  const own = String(env.TRANSLATE_MODEL || '').split(',').map((x) => x.trim()).filter(Boolean);
  const all = [...new Set([...own, ...DEFAULT_TRANSLATE_MODELS])];
  return workingModel && all.includes(workingModel) ? [workingModel, ...all.filter((m) => m !== workingModel)] : all;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || '',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });

    if (url.pathname === '/ics') return makeIcs(url);
    // Open <worker address>/status in a browser: the models set up, and a short test translation
    if (url.pathname === '/status') return status(env);
    if (url.pathname === '/translate') {
      if (!allowed.includes(origin)) return new Response('Forbidden', { status: 403, headers: cors });
      return translate(url.searchParams.get('text') || '', env, cors);
    }
    if (url.pathname === '/place') {
      if (!allowed.includes(origin)) return new Response('Forbidden', { status: 403, headers: cors });
      return place(url.searchParams.get('text') || '', env, cors, url.searchParams.get('debug') === '1');
    }

    const match = url.pathname.match(/^\/tp\/([a-z_]+)$/);
    if (!match || !ALLOWED_ENDPOINTS.includes(match[1])) {
      return new Response('Not found', { status: 404, headers: cors });
    }
    // Only answer the web page (browsers always send Origin on cross-site fetches).
    if (!allowed.includes(origin)) return new Response('Forbidden', { status: 403, headers: cors });
    if (!env.TFNSW_API_KEY) return new Response('TFNSW_API_KEY is not set', { status: 500, headers: cors });

    const upstream = await fetch(UPSTREAM + match[1] + url.search, {
      headers: { Authorization: 'apikey ' + env.TFNSW_API_KEY, Accept: 'application/json' },
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...cors,
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  },
};

// One model, one answer. Throws if the model fails or answers nothing.
async function runModel(env, model, text, prompt = TRANSLATE_PROMPT, maxTokens = 1000) {
  // "/no_think" asks Qwen3-family models to answer directly without a reasoning section; others don't need it
  const ask = /qwen3/i.test(model) ? `${text}\n\n/no_think` : text;
  const result = await env.AI.run(model, {
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: ask },
    ],
    max_tokens: maxTokens,
    temperature: 0.2,
  });
  let zh = result && (result.response ?? result.choices?.[0]?.message?.content);
  // When a model answers in JSON, Workers AI may hand the answer back already decoded, as an object
  if (zh && typeof zh === 'object') zh = JSON.stringify(zh);
  if (typeof zh !== 'string') zh = '';
  zh = zh.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  if (!zh) {
    // Say what came back, so /place?…&debug=1 shows it
    const shape = result && typeof result === 'object'
      ? Object.entries(result).map(([k, v]) => `${k}:${Array.isArray(v) ? 'array' : typeof v}`).join(',') : typeof result;
    throw new Error(`empty translation (answer was {${shape}})`);
  }
  return zh;
}

// Tries each model in turn until one answers: { zh, model } or { error }
async function translateText(text, env) {
  if (translationMemo.has(text)) return translationMemo.get(text);
  const errors = [];
  for (const model of translateModels(env)) {
    try {
      const zh = await runModel(env, model, text);
      workingModel = model;
      if (translationMemo.size > 500) translationMemo.clear();
      translationMemo.set(text, { zh, model });
      return { zh, model };
    } catch (e) {
      errors.push(`${model}: ${String((e && e.message) || e).slice(0, 200)}`);
    }
  }
  return { error: errors.join(' | ') || 'no model' };
}

// GET /translate?text=...  ->  { "zh": "...", "model": "..." }
async function translate(text, env, cors) {
  const headers = { ...cors, 'Content-Type': 'application/json; charset=utf-8' };
  text = text.trim().slice(0, 1500);
  if (!text) return new Response(JSON.stringify({ zh: '' }), { headers });
  if (!env.AI) return new Response(JSON.stringify({ error: 'Workers AI binding "AI" is not set' }), { status: 501, headers });
  const out = await translateText(text, env);
  return new Response(JSON.stringify(out), { status: out.error ? 502 : 200, headers });
}

function placeModels(env) {
  const own = String(env.PLACE_MODEL || '').split(',').map((x) => x.trim()).filter(Boolean);
  const all = [...new Set([...own, ...DEFAULT_PLACE_MODELS])];
  return workingPlaceModel && all.includes(workingPlaceModel)
    ? [workingPlaceModel, ...all.filter((m) => m !== workingPlaceModel)] : all;
}
const withTimeout = (promise, ms) => Promise.race([promise,
  new Promise((_, no) => setTimeout(() => no(new Error(`no answer in ${ms / 1000} s`)), ms))]);

// Which places the person means: [{ en, zh, kind }] from the first model that gives a usable answer
async function askPlaces(env, text, log) {
  for (const model of placeModels(env)) {
    const t0 = Date.now();
    try {
      const raw = await withTimeout(runModel(env, model, text, PLACE_PROMPT, 300), PLACE_MODEL_TIMEOUT_MS);
      log.push({ model, ms: Date.now() - t0, raw: raw.slice(0, 600) });
      const m = raw.match(/\{[\s\S]*\}/);
      const list = m ? JSON.parse(m[0]).places : null;
      if (!Array.isArray(list)) throw new Error('no usable JSON');
      const places = list.filter((p) => p && typeof p.en === 'string' && p.en.trim()).slice(0, 3).map((p) => ({
        en: p.en.trim().slice(0, 80), zh: typeof p.zh === 'string' ? p.zh.trim().slice(0, 40) : '',
        kind: PLACE_KINDS.includes(p.kind) ? p.kind : 'other' }));
      workingPlaceModel = model;
      return places;
    } catch (e) {
      const last = log[log.length - 1];
      const err = String((e && e.message) || e).slice(0, 200);
      if (last && last.model === model) last.error = err; else log.push({ model, ms: Date.now() - t0, error: err });
    }
  }
  return null;
}

// "The University of Sydney, Camperdown" -> "university of sydney"; "Paddy's Markets Light Rail" -> "paddys markets"
function core(s) {
  return String(s || '').split(',')[0].toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/['’]/g, '')
    .replace(/\s+(metro station|station|light rail|wharf)\s*$/, '').replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
const NOT_WANTED = /\b(hotel|motel|apartments?|backpackers|hostel|car ?park|parking|post office|police|bike (lockers?|hire)|atm|toilets?|cafe|restaurant)\b/i;
// The best real match for one English name among Transport for NSW's results, or null.
// The name must match (exactly, or one containing the other); then the place itself beats the suburb,
// a station or wharf, and a bus stop. Hotels, car parks and the like only if that is what was asked for.
function bestMatch(en, locations) {
  const q = core(en);
  if (!q) return null;
  let best = null, bestScore = Infinity;
  locations.forEach((loc, i) => {
    if (!loc || !loc.id) return;
    if (NOT_WANTED.test(loc.name) && !NOT_WANTED.test(en)) return;
    const c = core(loc.name);
    const match = c === q ? 0 : (c.length >= 4 && (c.includes(q) || q.includes(c))) ? 1 : null;
    if (match === null) return;
    const modes = loc.modes || [];
    const type = loc.type === 'poi' ? 0 : (loc.type === 'suburb' || loc.type === 'locality') ? 1
      : loc.type === 'stop' && (modes.includes(1) || modes.includes(2) || modes.includes(4) || modes.includes(9)) ? 2
      : loc.type === 'stop' ? 4 : loc.type === 'street' ? 5 : 3;
    const score = match * 100 + type * 10 + Math.min(i, 9);
    if (score < bestScore) { best = loc; bestScore = score; }
  });
  return best;
}

// GET /place?text=悉尼大學 -> { places: [ <Transport for NSW location> + zh, kind ] }   (&debug=1: + debug)
// The places always come from Transport for NSW; the AI only says what was meant and names it.
async function place(text, env, cors, debug) {
  const headers = { ...cors, 'Content-Type': 'application/json; charset=utf-8' };
  const started = Date.now();
  const log = [];
  const reply = (body, status = 200) => new Response(JSON.stringify(debug
    ? { ...body, debug: { ms: Date.now() - started, models: placeModels(env), steps: log } } : body), { status, headers });
  text = text.trim().slice(0, 60);
  if (!text) return reply({ places: [] });
  if (!env.AI) return reply({ error: 'Workers AI binding "AI" is not set' }, 501);
  if (!env.TFNSW_API_KEY) return reply({ error: 'TFNSW_API_KEY is not set' }, 500);
  if (placeMemo.has(text)) { log.push({ memo: true }); return reply(placeMemo.get(text)); }

  const meant = await askPlaces(env, text.replace(/雪梨/g, '悉尼'), log);
  if (!meant) return reply({ error: 'translation failed' }, 502);
  if (!meant.length) return reply({ places: [] });

  // Look every name up at the same time
  const t0 = Date.now();
  const lookups = await Promise.all(meant.map(async (p) => {
    const q = new URLSearchParams({ outputFormat: 'rapidJSON', coordOutputFormat: 'EPSG:4326', version: '10.2.1.42',
      type_sf: 'any', name_sf: p.en, TfNSWSF: 'true' });
    try {
      const res = await fetch(`${UPSTREAM}stop_finder?${q}`, {
        headers: { Authorization: 'apikey ' + env.TFNSW_API_KEY, Accept: 'application/json' } });
      if (!res.ok) return { error: `HTTP ${res.status}` };
      return { locations: (await res.json()).locations || [] };
    } catch (e) { return { error: String((e && e.message) || e).slice(0, 200) }; }
  }));
  log.push({ lookup: meant.map((p, i) => ({ en: p.en, found: (lookups[i].locations || []).length, error: lookups[i].error })),
    ms: Date.now() - t0 });
  if (lookups.every((l) => l.error)) return reply({ error: 'Transport for NSW did not answer' }, 502);

  const seen = new Set();
  const places = [];
  meant.forEach((p, i) => {
    const loc = bestMatch(p.en, lookups[i].locations || []);
    if (!loc || seen.has(loc.id)) return;
    seen.add(loc.id);
    places.push({ ...loc, zh: p.zh, kind: p.kind });
  });
  const out = { places };
  if (places.length) {
    if (placeMemo.size > 300) placeMemo.clear();
    placeMemo.set(text, out);
  }
  return reply(out);
}

// GET /status -> the models in the order they are tried, and a test translation of one fixed sentence
// (remembered, so opening the page again doesn't use the AI allowance)
async function status(env) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  const body = { models: translateModels(env), placeModels: placeModels(env), ai: !!env.AI };
  if (env.AI) {
    const out = await translateText(STATUS_TEXT, env);
    body.test = { text: STATUS_TEXT, ...out };
  }
  return new Response(JSON.stringify(body, null, 2), { headers });
}

// GET /ics?title=...&start=2026-10-31T01:23:00Z&before=10&desc=...
function makeIcs(url) {
  const title = (url.searchParams.get('title') || '出門').slice(0, 80);
  const desc = (url.searchParams.get('desc') || '').slice(0, 500);
  const start = new Date(url.searchParams.get('start') || '');
  const before = Math.max(0, Math.min(120, parseInt(url.searchParams.get('before') || '10', 10) || 0));
  if (isNaN(start.getTime())) return new Response('Bad start time', { status: 400 });

  const end = new Date(start.getTime() + 10 * 60000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//parents-transit//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + start.getTime() + '-' + Math.random().toString(36).slice(2) + '@parents-transit',
    'DTSTAMP:' + icsDate(new Date()),
    'DTSTART:' + icsDate(start),
    'DTEND:' + icsDate(end),
    'SUMMARY:' + icsText(title),
    'DESCRIPTION:' + icsText(desc),
  ];
  if (before > 0) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(title),
      'TRIGGER:-PT' + before + 'M', 'END:VALARM');
  }
  lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(title),
    'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');

  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="reminder.ics"',
      'Cache-Control': 'no-store',
    },
  });
}

function icsDate(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsText(s) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// iCalendar lines must be at most 75 bytes; continuation lines start with a space.
function fold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '';
  for (const ch of line) {
    const limit = out.length === 0 ? 75 : 74;
    if (enc.encode(cur + ch).length > limit) {
      out.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.join('\r\n ');
}
