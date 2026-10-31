// Cloudflare Worker: a small go-between for the Transport for NSW Trip Planner API.
// - Keeps the API key secret (stored as the TFNSW_API_KEY secret, never in the web page).
// - Adds the CORS headers the TfNSW API does not send, for the web page's origin only.
// - /ics makes a calendar event with an alarm, used for "remind me when to leave".
// - /translate translates service notices into Traditional Chinese with Workers AI (free tier).
//
// Settings (Cloudflare dashboard → Worker → Settings → Variables and Secrets):
//   TFNSW_API_KEY   (Secret)  your Transport for NSW Open Data API key
//   ALLOWED_ORIGIN  (Text)    e.g. https://curioushelvetica.github.io
//   TRANSLATE_MODEL (Text, optional) Workers AI model; default below
// Bindings (Worker → Settings → Bindings): Workers AI, variable name AI

const UPSTREAM = 'https://api.transport.nsw.gov.au/v1/tp/';
const ALLOWED_ENDPOINTS = ['trip', 'stop_finder', 'departure_mon'];
const DEFAULT_TRANSLATE_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
const TRANSLATE_PROMPT =
  'You translate Sydney public transport service notices from English into Traditional Chinese ' +
  '(繁體中文), written in clear, simple standard written Chinese for elderly readers. ' +
  'Keep station names, street names, line and route numbers (e.g. T1, T9, 525) in English exactly as written, ' +
  'so they match the signs. Keep all times and dates. Output only the translation, nothing else.';
const translationMemo = new Map();

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
    if (url.pathname === '/translate') {
      if (!allowed.includes(origin)) return new Response('Forbidden', { status: 403, headers: cors });
      return translate(url.searchParams.get('text') || '', env, cors);
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

// GET /translate?text=...  ->  { "zh": "..." }
async function translate(text, env, cors) {
  const headers = { ...cors, 'Content-Type': 'application/json; charset=utf-8' };
  text = text.trim().slice(0, 1500);
  if (!text) return new Response(JSON.stringify({ zh: '' }), { headers });
  if (!env.AI) return new Response(JSON.stringify({ error: 'Workers AI binding "AI" is not set' }), { status: 501, headers });
  if (translationMemo.has(text)) return new Response(JSON.stringify({ zh: translationMemo.get(text) }), { headers });
  try {
    const result = await env.AI.run(env.TRANSLATE_MODEL || DEFAULT_TRANSLATE_MODEL, {
      messages: [
        { role: 'system', content: TRANSLATE_PROMPT },
        // "/no_think" asks Qwen3 models to answer directly without a reasoning section
        { role: 'user', content: text + '\n\n/no_think' },
      ],
      max_tokens: 1000,
      temperature: 0.2,
    });
    let zh = result && (result.response ?? result.choices?.[0]?.message?.content);
    if (typeof zh !== 'string') zh = '';
    zh = zh.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!zh) throw new Error('empty translation');
    if (translationMemo.size > 500) translationMemo.clear();
    translationMemo.set(text, zh);
    return new Response(JSON.stringify({ zh }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 502, headers });
  }
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
