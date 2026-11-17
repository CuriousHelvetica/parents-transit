// Cloudflare Worker: a small go-between for the Transport for NSW Trip Planner API.
// - Keeps the API key secret (stored as the TFNSW_API_KEY secret, never in the web page).
// - Adds the CORS headers the TfNSW API does not send, for the web page's origin only.
// - /ics makes a calendar event with an alarm, used for "remind me when to leave".
// - /translate translates service notices into Traditional Chinese with Workers AI (free tier).
//   If a model fails (e.g. Cloudflare retired it), the next model in the list is tried automatically.
// - /place finds a place typed in Chinese: Workers AI turns it into English search words, Transport for NSW
//   finds the real places, and Workers AI picks the few most likely ones and names them in Chinese.
// - /status shows which translation models are set up and which one answers (open it in a browser).
//
// Settings (Cloudflare dashboard → Worker → Settings → Variables and Secrets):
//   TFNSW_API_KEY   (Secret)  your Transport for NSW Open Data API key
//   ALLOWED_ORIGIN  (Text)    e.g. https://curioushelvetica.github.io
//   TRANSLATE_MODEL (Text, optional) Workers AI models to try first, in order, separated by commas,
//                   e.g. "@cf/qwen/qwen3.8-27b, @cf/google/gemma-4-26b-a4b-it". The built-in list below
//                   is always tried after these. Change it when Cloudflare announces new models.
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
const PLACE_TERMS_PROMPT =
  'An elderly Cantonese speaker in Sydney, Australia typed the name of a place they want to travel to, in Chinese. ' +
  '雪梨 and 悉尼 both mean Sydney. Chinese names of Sydney suburbs are often Cantonese sound-alikes ' +
  '(e.g. 好市圍 = Hurstville, 車士活 = Chatswood, 寶活 = Burwood). ' +
  'Give up to 3 short English search terms that the Transport for NSW trip planner would recognise for this place, ' +
  'most likely first, using official English names (e.g. "Sydney Airport", "Royal Prince Alfred Hospital"). ' +
  'Answer with JSON only, like {"terms":["..."]}.';
const PLACE_PICK_PROMPT =
  'An elderly Cantonese speaker in Sydney typed a place name in Chinese. Below it is a numbered list of places ' +
  'found by the Transport for NSW trip planner. Choose at most 4 that the person most likely means, best first. ' +
  'Prefer the place itself and its train, metro or light rail station. Leave out hotels, car parks, post offices, ' +
  'police, shops inside a centre, and places in other cities, unless the person asked for them. ' +
  'For each, give a short name in Traditional Chinese (繁體中文) as Sydney Chinese speakers would say it, and a kind, ' +
  'one of: airport, shopping, hospital, university, school, club, park, beach, museum, church, temple, market, ' +
  'government, other. Answer with JSON only, like {"picks":[{"n":1,"zh":"...","kind":"..."}]}.';
const PLACE_KINDS = ['airport', 'shopping', 'hospital', 'university', 'school', 'club', 'park', 'beach', 'museum',
  'church', 'temple', 'market', 'government', 'other'];
const placeMemo = new Map();          // typed text -> answer
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
      return place(url.searchParams.get('text') || '', env, cors);
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
async function runModel(env, model, text, prompt = TRANSLATE_PROMPT) {
  // "/no_think" asks Qwen3-family models to answer directly without a reasoning section; others don't need it
  const ask = /qwen3/i.test(model) ? `${text}\n\n/no_think` : text;
  const result = await env.AI.run(model, {
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: ask },
    ],
    max_tokens: 1000,
    temperature: 0.2,
  });
  let zh = result && (result.response ?? result.choices?.[0]?.message?.content);
  if (typeof zh !== 'string') zh = '';
  zh = zh.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  if (!zh) throw new Error('empty translation');
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

// Asks each model in turn for a JSON answer; returns the parsed object, or null if none gave one
async function askJson(env, prompt, text) {
  for (const model of translateModels(env)) {
    try {
      const raw = await runModel(env, model, text, prompt);
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('no JSON');
      const out = JSON.parse(m[0]);
      workingModel = model;
      return out;
    } catch (e) { /* next model */ }
  }
  return null;
}

// GET /place?text=悉尼機場 -> { places: [ <Transport for NSW location> + zh, kind ], terms: [...] }
// The places always come from Transport for NSW; the AI only chooses among them and names them.
async function place(text, env, cors) {
  const headers = { ...cors, 'Content-Type': 'application/json; charset=utf-8' };
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  text = text.trim().slice(0, 60);
  if (!text) return reply({ places: [] });
  if (!env.AI) return reply({ error: 'Workers AI binding "AI" is not set' }, 501);
  if (!env.TFNSW_API_KEY) return reply({ error: 'TFNSW_API_KEY is not set' }, 500);
  if (placeMemo.has(text)) return reply(placeMemo.get(text));

  const asked = await askJson(env, PLACE_TERMS_PROMPT, text.replace(/雪梨/g, '悉尼'));
  const terms = [...new Set((asked && Array.isArray(asked.terms) ? asked.terms : [])
    .filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().slice(0, 80)))].slice(0, 3);
  if (!terms.length) return reply({ error: 'translation failed' }, 502);

  // Look up every term; keep each place once, in the order found
  const seen = new Set();
  const found = [];
  let answered = 0;
  for (const term of terms) {
    const q = new URLSearchParams({ outputFormat: 'rapidJSON', coordOutputFormat: 'EPSG:4326', version: '10.2.1.42',
      type_sf: 'any', name_sf: term, TfNSWSF: 'true' });
    try {
      const res = await fetch(`${UPSTREAM}stop_finder?${q}`, {
        headers: { Authorization: 'apikey ' + env.TFNSW_API_KEY, Accept: 'application/json' } });
      if (!res.ok) continue;
      answered += 1;
      for (const loc of ((await res.json()).locations || []).slice(0, 8)) {
        if (loc && loc.id && !seen.has(loc.id)) { seen.add(loc.id); found.push(loc); }
      }
    } catch (e) { /* try the next term */ }
  }
  if (!answered) return reply({ error: 'Transport for NSW did not answer', terms }, 502);
  if (!found.length) {
    const out = { places: [], terms };
    placeMemo.set(text, out);
    return reply(out);
  }

  const list = found.map((l, i) => `${i + 1}. ${l.name} (${l.type})`).join('\n');
  const picked = await askJson(env, PLACE_PICK_PROMPT, `Typed: ${text}\n\n${list}`);
  let places = [];
  if (picked && Array.isArray(picked.picks)) {
    const used = new Set();
    for (const p of picked.picks) {
      const loc = found[(p && Number.isInteger(+p.n) ? +p.n : 0) - 1];
      if (!loc || used.has(loc.id)) continue;   // only places Transport for NSW really returned
      used.add(loc.id);
      places.push({ ...loc, zh: typeof p.zh === 'string' ? p.zh.trim().slice(0, 40) : '',
        kind: PLACE_KINDS.includes(p.kind) ? p.kind : 'other' });
      if (places.length === 4) break;
    }
  }
  // If the second step failed (no usable answer at all), fall back to Transport for NSW's own order,
  // without Chinese names. An answer that picks nothing means none of the places fit.
  if (!picked || !Array.isArray(picked.picks)) places = found.slice(0, 4).map((l) => ({ ...l, zh: '', kind: 'other' }));
  const out = { places, terms };
  if (placeMemo.size > 300) placeMemo.clear();
  placeMemo.set(text, out);
  return reply(out);
}

// GET /status -> the models in the order they are tried, and a test translation of one fixed sentence
// (remembered, so opening the page again doesn't use the AI allowance)
async function status(env) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  const body = { models: translateModels(env), ai: !!env.AI };
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
