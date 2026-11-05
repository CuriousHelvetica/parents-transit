'use strict';

// ---------- Storage (everything personal stays on this phone) ----------
const STORE_KEY = 'parents-transit-v1';
const TR_KEY = 'parents-transit-translations-v3';
// ⏰ 提醒我 (calendar reminder) is hidden for now; set to true to bring it back (button + 設定 section).
const FEATURE_REMINDER = false;

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.home && Array.isArray(s.places)) return s;
  } catch (e) { /* fall through to defaults */ }
  return { home: { ...DEFAULT_HOME }, places: DEFAULT_PLACES.map((p) => ({ ...p })), remindBefore: 10 };
}
// Saving can fail (full storage, private browsing): the app keeps working, just without saving.
function storeSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* not saved this time */ }
}
function saveSettings() { storeSet(STORE_KEY, JSON.stringify(settings)); }

let settings = loadSettings();
// when: { mode: 'now' } or { mode: 'later', date: 'YYYY-MM-DD', time: 'HH:MM', arrive: bool }
// from: 'home' | 'here' | place;  to: null | 'home' | place.  The app always opens with from = 家.
let state = { from: 'home', to: null, screen: 'home' };
let timers = [];

// ---------- Helpers ----------
const $app = document.getElementById('app');
const TZ = 'Australia/Sydney';
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function clearTimers() { timers.forEach(clearInterval); timers = []; }

function sydneyParts(d) {
  const p = {};
  new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  return p;
}
function fmtTime(d) {
  const p = sydneyParts(d);
  return fmt12(+p.hour, p.minute);
}
// Time of day words: 凌晨 0–4, 清晨 5–6, 早上 7–11, 中午 12, 下午 13–17, 晚上 18–23
function dayPart(h) {
  return h < 5 ? '凌晨' : h < 7 ? '清晨' : h < 12 ? '早上' : h === 12 ? '中午' : h < 18 ? '下午' : '晚上';
}
// 19, '30' -> '晚上 7:30'; 0, '15' -> '凌晨 12:15'; 12, '00' -> '中午 12:00'
function fmt12(h, mm) {
  return `${dayPart(h)} ${h % 12 || 12}:${mm}`;
}
// '09:30' (from the time picker) -> '早上 9:30'
function fmtHHMM(hhmm) {
  const [h, mm] = hhmm.split(':');
  return fmt12(+h, mm);
}
function minutesUntil(d) { return Math.round((d.getTime() - Date.now()) / 60000); }

// Sydney calendar date as 'YYYY-MM-DD', `offset` days from today
function sydneyDate(offset = 0) {
  const p = sydneyParts(new Date());
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + offset));
  return d.toISOString().slice(0, 10);
}
// 'YYYY-MM-DD' -> '明天 11月1日 (星期六)'
function dayLabel(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const rel = { [sydneyDate(0)]: '今天 ', [sydneyDate(1)]: '明天 ', [sydneyDate(2)]: '後天 ' }[ymd] || '';
  return `${rel}${m}月${d}日 (星期${wd})`;
}
function ymdOf(date) {
  const p = sydneyParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

// "Hurstville Station, Platform 1, Hurstville" -> "Hurstville"
function baseName(name) {
  return String(name || '').split(',')[0].replace(/\s+(Station|Wharf|Light Rail|Metro Station)$/i, '').trim();
}
// 中央 -> 中央站, but names with a nickname in brackets stay as written: 卡市 (越南城)
function withStation(zh, isStation) { return isStation && !/[()（）]/.test(zh) ? zh + '站' : zh; }
function zhOf(name) { return ZH_NAMES[baseName(name)] || ''; }
// Chinese + English label, e.g. 好市圍站 Hurstville
function placeLabel(name) {
  const en = baseName(name);
  const isStation = /Station/i.test(name || '');
  const zh = ZH_NAMES[en];
  return zh ? `${esc(withStation(zh, isStation))} <span class="en">${esc(en)}</span>` : esc(en);
}
function speakName(name) {
  const zh = zhOf(name);
  return zh ? withStation(zh, /Station/i.test(name || '')) : baseName(name);
}
// Direction for read-aloud, always in English and short, like the station displays:
// "Gordon via City" -> "Gordon", "Rockdale Stn (Railway St)" -> "Rockdale".
function speakDirection(name) {
  return String(name || '').split(',')[0]
    .replace(/\s+via\s+.*$/i, '').replace(/\s*\(.*?\)/g, '').replace(/\s+(Stn|Station)$/i, '').trim();
}
// Direction on screen: Chinese for the main name + the full English, as on the displays:
// "Gordon via City" -> "哥頓 Gordon via City"
function directionLabel(name) {
  const zh = ZH_NAMES[speakDirection(name)];
  const en = String(name || '').split(',')[0].trim();
  return zh ? `${esc(zh)} <span class="en">${esc(en)}</span>` : esc(en);
}
function platformOf(name) {
  const m = String(name || '').match(/Platform\s+(\w+)/i);
  if (m) return { zh: `${m[1]}號月台`, en: `Platform ${m[1]}` };
  const s = String(name || '').match(/Stand\s+(\w+)/i);
  if (s) return { zh: `${s[1]} 號巴士站`, en: `Stand ${s[1]}` };
  const w = String(name || '').match(/Wharf\s+(\w+)/i);
  if (w) return { zh: `${w[1]}號碼頭`, en: `Wharf ${w[1]}` };
  return null;
}

// "Strathfield Station, The Boulevarde, Stand A" -> "The Boulevarde"
function streetOf(name) {
  const part = String(name || '').split(',')[1];
  return part && !/Platform|Stand|Wharf/i.test(part) ? part.trim() : '';
}

// Transport for NSW product classes. Anything that is not public transport or walking
// (e.g. cycling, taxi, car) is marked `other` and those trips are never shown.
function modeOf(leg) {
  const t = leg.transportation;
  if (!t || !t.product) return { key: 'walk', zh: '步行', icon: '🚶', walk: true };
  switch (t.product.class) {
    case 1: return { key: 'train', zh: '火車', icon: '🚆' };
    case 2: return { key: 'metro', zh: '地鐵', icon: '🚇' };
    case 4: return { key: 'lightrail', zh: '輕鐵', icon: '🚊' };
    case 5: case 11: return { key: 'bus', zh: '巴士', icon: '🚌' };
    case 7: return { key: 'coach', zh: '長途巴士', icon: '🚌' };
    case 9: return { key: 'ferry', zh: '渡輪', icon: '⛴️' };
    case 99: case 100: return { key: 'walk', zh: '步行', icon: '🚶', walk: true };
    case 107: return { key: 'other', zh: '單車', icon: '🚲', other: true };
    default: return { key: 'other', zh: t.product.name || '其他交通', icon: '❓', other: true };
  }
}
// Open the app with ?debug=1 to see hidden trips and each leg's raw transport type.
const DEBUG = new URLSearchParams(location.search).has('debug');
function debugTag(leg) {
  if (!DEBUG) return '';
  const p = (leg.transportation && leg.transportation.product) || {};
  return `<div class="small">[debug] class ${esc(p.class)} · ${esc(p.name || '')} · ${esc((leg.transportation || {}).name || '')}</div>`;
}
function lineName(leg) {
  const t = leg.transportation || {};
  return t.disassembledName || t.number || (t.name || '').split(' ')[0] || '';
}
function depTime(stop) { return new Date(stop.departureTimeEstimated || stop.departureTimePlanned); }
function arrTime(stop) { return new Date(stop.arrivalTimeEstimated || stop.arrivalTimePlanned); }
function delayMin(stop, kind) {
  const p = stop[kind + 'TimePlanned'];
  const e = stop[kind + 'TimeEstimated'];
  if (!p || !e) return null;
  return Math.round((new Date(e) - new Date(p)) / 60000);
}

// Service notices on a leg: [{ key, en }]
function stripHtml(s) {
  const div = document.createElement('div');
  div.innerHTML = String(s || '');
  return div.textContent.replace(/\s+/g, ' ').trim();
}
function noticesOf(leg) {
  const seen = new Set();
  return (leg.infos || []).map((x) => {
    const title = stripHtml(x.subtitle || x.title);
    const body = stripHtml(x.content);
    const en = (body && body !== title ? `${title}. ${body}` : title).slice(0, 700);
    // Transport for NSW gives each notice a priority (veryLow … veryHigh); only high ones stay open
    const priority = String(x.priority || '');
    return { key: en, en, priority, severe: /^(high|veryhigh|urgent)$/i.test(priority) };
  }).filter((n) => n.en && !seen.has(n.key) && seen.add(n.key)).slice(0, 3);
}

// ---------- API (through the Cloudflare Worker) ----------
// Every request gives up after 20 seconds, so a weak connection shows 「無法連接」 + 重試
// instead of 「正在搜尋路線…」 forever.
const FETCH_TIMEOUT_MS = 20000;
async function fetchWithTimeout(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? '連線逾時' : e.message);
  } finally {
    clearTimeout(t);
  }
}
async function api(endpoint, params) {
  const q = new URLSearchParams({ outputFormat: 'rapidJSON', coordOutputFormat: 'EPSG:4326', version: '10.2.1.42', ...params });
  const res = await fetchWithTimeout(`${WORKER_URL}/tp/${endpoint}?${q}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function searchPlaces(text) {
  const data = await api('stop_finder', { type_sf: 'any', name_sf: text, TfNSWSF: 'true' });
  return (data.locations || []).slice(0, 10);
}

// A saved place -> trip planner parameters. Looks it up once, then remembers it.
async function resolvePlace(place) {
  if (!place.ref) {
    const found = await searchPlaces(place.query);
    const best = found.find((l) => l.isBest) || found[0];
    if (!best) throw new Error('找不到地點 ' + place.query);
    place.ref = refFromLocation(best);
    saveSettings();
  }
  return place.ref;
}
function refFromLocation(loc) {
  if (loc.type === 'stop' || !loc.coord) return { type: 'any', name: loc.id };
  // coord is [lat, lon]; the trip planner wants lon:lat:EPSG:4326
  return { type: 'coord', name: `${loc.coord[1]}:${loc.coord[0]}:EPSG:4326` };
}

function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('這部電話不支援定位'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ type: 'coord', name: `${p.coords.longitude}:${p.coords.latitude}:EPSG:4326` }),
      () => reject(new Error('無法取得你的位置。請在「設定 → 私隱 → 定位服務」開啟 Safari 定位。')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

async function planTrip(origin, dest, when) {
  let date, time, arrive = false;
  if (when.mode === 'later') {
    date = when.date.replace(/-/g, '');
    time = when.time.replace(':', '');
    arrive = when.arrive;
  } else {
    const p = sydneyParts(new Date());
    date = p.year + p.month + p.day;
    time = p.hour + p.minute;
  }
  const data = await api('trip', {
    depArrMacro: arrive ? 'arr' : 'dep',
    itdDate: date,
    itdTime: time,
    type_origin: origin.type, name_origin: origin.name,
    type_destination: dest.type, name_destination: dest.name,
    calcNumberOfTrips: '8',
    TfNSWTR: 'true',
  });
  const all = (data.journeys || []).filter((j) => j.legs && j.legs.length);
  if (DEBUG) return all;
  // Only public transport + walking: never cycling, driving or taxi.
  return all.filter((j) => !j.legs.some((l) => modeOf(l).other));
}

// Notice translation (English -> Traditional Chinese), remembered on the phone.
let translations = {};
try { translations = JSON.parse(localStorage.getItem(TR_KEY)) || {}; } catch (e) { translations = {}; }
const pendingTr = {};
// Station names are swapped for [[1]], [[2]]… before translating, so the AI cannot
// mistranslate them, then put back as "紅坊 Redfern" (Chinese + English).
const PLACE_KEYS = Object.keys(ZH_NAMES).sort((a, b) => b.length - a.length);
function reEscape(x) { return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// Words that start with a capital but are ordinary words, not names (still translated).
const NOT_NAMES = new Set(('Coach Coaches Contact Centre Center Customer Customers Station Stations Platform Platforms ' +
  'Bus Buses Train Trains Metro Light Rail Lift Lifts Please Note Trackwork Service Services Passengers Replacement ' +
  'Update Updates Notice Alert Change Changes Closure Closed Works Work Planned Temporary Delay Delays Information ' +
  'Access Accessibility Entrance Exit Escalator Escalators Stairs Concourse Level Upper Lower Car Park Parking ' +
  'Ticket Tickets Free Wheelchair Toilets Staff Customers Today Tomorrow Weekend Night Morning Evening ' +
  'Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August ' +
  'September October November December I If When Use Opal').split(' '));
const NAME_RE = "[A-Z][a-zA-Z']+(?:\\s+[A-Z][a-zA-Z']+)*";
// "Use Bathurst" -> "Bathurst"; "Coach" -> '' (not a name)
function cleanName(n) {
  const words = n.split(/\s+/);
  while (words.length && NOT_NAMES.has(words[0])) words.shift();
  return words.join(' ');
}
function protectPlaces(en) {
  const places = [];
  const token = (label) => { places.push(label); return `[[${places.length}]]`; };
  let text = en;
  // 1. Stations with a Chinese name: 紅坊 Redfern
  PLACE_KEYS.forEach((name) => {
    text = text.replace(new RegExp(`\\b${reEscape(name)}(\\s+Station)?\\b`, 'g'),
      (m, st) => token(`${withStation(ZH_NAMES[name], !!st)} ${name}`));
  });
  // 2. Opal card -> Opal卡
  text = text.replace(/\bOpal cards?\b/g, () => token('Opal卡')).replace(/\bOpal\b/g, () => token('Opal'));
  // 3. Other stations stay in English: "Bathurst and Lithgow Stations" -> Bathurst站 和 Lithgow站
  text = text.replace(new RegExp(`(${NAME_RE}(?:\\s*(?:,|and|&)\\s*${NAME_RE})*)\\s+[Ss]tations?\\b`, 'g'), (m, list) =>
    list.replace(new RegExp(NAME_RE, 'g'), (n) => {
      const name = cleanName(n);
      return name ? n.slice(0, n.length - name.length) + token(`${name}站`) : n;
    }));
  // 4. Other capitalised names in mid-sentence ("to or from Bathurst") stay in English
  text = text.replace(new RegExp(NAME_RE, 'g'), (n, offset) => {
    const before = text.slice(0, offset).trimEnd();
    const sentenceStart = !before || /[.!?:\-(]$/.test(before);
    const name = cleanName(n);
    // At a sentence start the first capital is ordinary, unless it's followed by a name ("Use Eddy Avenue")
    if (sentenceStart && name === n) return n;
    return name ? n.slice(0, n.length - name.length) + token(name) : n;
  });
  return { text, places };
}
function restorePlaces(zh, places) {
  const used = new Set();
  let out = zh.replace(/[\[［]{2}\s*(\d+)\s*[\]］]{2}/g, (m, i) => {
    const label = places[+i - 1];
    if (!label) return m;
    used.add(+i - 1);
    return ` ${label} `;
  }).replace(/ {2,}/g, ' ').replace(/ ([,。,、:;!?)」])/g, '$1').replace(/([，。、：；（「,]) /g, '$1').trim();
  // Safety net: if the AI dropped or broke a placeholder, list the places separately.
  const missing = places.filter((_, i) => !used.has(i));
  if (missing.length || /\[\[\d+\]\]/.test(out)) {
    out = out.replace(/[\[［]{2}\s*\d+\s*[\]］]{2}/g, '');
    out += ` (提及地點:${[...new Set(places)].join('、')})`;
  }
  return out;
}
function translate(text) {
  if (translations[text]) return Promise.resolve(translations[text]);
  if (!pendingTr[text]) {
    const { text: masked, places } = protectPlaces(text);
    pendingTr[text] = fetchWithTimeout(`${WORKER_URL}/translate?${new URLSearchParams({ text: masked })}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const zh = d && d.zh ? restorePlaces(d.zh, places) : null;
        if (zh) {
          translations[text] = zh;
          const keys = Object.keys(translations);
          if (keys.length > 150) keys.slice(0, keys.length - 150).forEach((k) => delete translations[k]);
          storeSet(TR_KEY, JSON.stringify(translations));
        }
        return zh || null;
      })
      .catch(() => null)
      .finally(() => { delete pendingTr[text]; });
  }
  return pendingTr[text];
}
// Severe notices stay open; routine ones (renovations etc.) fold away under one line, like the stop list.
function noticesHtml(list) {
  if (!list || !list.length) return '';
  const severe = list.filter((n) => n.severe), routine = list.filter((n) => !n.severe);
  return severe.map((n) => noticeHtml(n, true)).join('') + (routine.length
    ? `<details class="notices"><summary>⚠️ 服務通知 (${routine.length}) — 按此查看</summary>${routine.map((n) => noticeHtml(n)).join('')}</details>`
    : '');
}
function noticeHtml(n, severe = false) {
  const zh = translations[n.key];
  return `<div class="notice${severe ? ' severe' : ''}" data-notice="${esc(n.key)}" data-severe="${severe ? 1 : ''}">⚠️ <b>${severe ? '重要服務通知' : '服務通知'}</b>:
    ${zh ? esc(zh) : '<span class="small">翻譯中…</span>'}
    <details><summary class="small">英文原文</summary><div class="small">${esc(n.en)}</div></details>
    ${DEBUG ? `<div class="small">[debug] priority=${esc(n.priority || '(none)')}</div>` : ''}</div>`;
}
// Fill in translations after the page is drawn.
function fillNotices() {
  $app.querySelectorAll('[data-notice]').forEach((el) => {
    const key = el.dataset.notice;
    if (translations[key]) return;
    translate(key).then((zh) => {
      if (!el.isConnected) return;
      const open = el.querySelector('details') && el.querySelector('details').open;
      const sev = !!el.dataset.severe;
      el.outerHTML = zh ? noticeHtml({ key, en: key }, sev) : noticeHtml({ key, en: key }, sev).replace('翻譯中…', '暫時無法翻譯,請看英文原文');
      if (open) { const d = $app.querySelector(`[data-notice="${CSS.escape(key)}"] details`); if (d) d.open = true; }
    });
  });
}

// ---------- Screens ----------
function render(html, keepScroll) {
  const y = window.scrollY;
  $app.innerHTML = html;
  window.scrollTo(0, keepScroll ? y : 0);
}

function whenSummary(when) {
  if (when.mode !== 'later') return '現在出發';
  return `${dayLabel(when.date)} ${fmtHHMM(when.time)} ${when.arrive ? '前到達' : '出發'}`;
}

// ---------- 📍 你在: current suburb + street on the main screen ----------
// Looked up when the main screen opens (at most every 2 minutes) and when tapped. No continuous tracking.
// Address lookup: OpenStreetMap (Nominatim) first, Transport for NSW (through our Worker) as fallback.
// Nominatim policy: max 1 request/s overall, identify the app (the browser sends our address), credit OSM.
const HERE_REFRESH_MS = 2 * 60000;
const HERE_STREET_ACCURACY = 100;   // metres; less precise than this -> suburb only
let here = { info: null, at: 0, busy: false, log: null };

function cleanStreet(st) { return String(st || '').replace(/^[\d\-\/]+[A-Za-z]?\s+/, '').trim(); }
async function lookupTfnsw(lat, lon) {
  const data = await api('stop_finder', { type_sf: 'coord', name_sf: `${lon}:${lat}:EPSG:4326`, TfNSWSF: 'true' });
  const loc = (data.locations || []).find((l) => ['singlehouse', 'street', 'address'].includes(l.type));
  if (!loc) return null;
  const parts = String(loc.name || '').split(',').map((x) => x.trim()).filter(Boolean);
  const suburb = (loc.parent && loc.parent.name) || (parts.length > 1 ? parts[parts.length - 1] : '');
  let street = cleanStreet(loc.streetName || parts[0]);
  if (street === suburb) street = '';
  return suburb ? { suburb, street, source: 'tfnsw', raw: loc.name } : null;
}
async function lookupOsm(lat, lon) {
  const q = new URLSearchParams({ format: 'jsonv2', lat, lon, zoom: '18', addressdetails: '1', 'accept-language': 'en' });
  const res = await fetchWithTimeout(`https://nominatim.openstreetmap.org/reverse?${q}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const a = (await res.json()).address || {};
  const suburb = a.suburb || a.city_district || a.town || a.village || a.city || '';
  return suburb ? { suburb, street: a.road || a.pedestrian || '', source: 'osm',
    raw: [a.house_number, a.road, suburb].filter(Boolean).join(' ') } : null;
}
// Location row in the header card: suburb on one line, street on the next (each wraps only if too long).
function hereHtml() {
  const dbg = DEBUG && here.log ? `<div class="here-debug">[debug] ${esc(here.log.join(' · '))}</div>` : '';
  if (here.busy && !here.info) return '<div class="here-line small">📍 更新中…</div>';
  if (!here.info) return here.at ? `<div class="here-line small">📍 按此顯示位置</div>${dbg}` : '';
  const { suburb, street, source, raw } = here.info;
  const zh = ZH_NAMES[suburb];
  return `<div class="here-line">📍 你在 <b>${zh ? `${esc(zh)} <span class="en">${esc(suburb)}</span>` : esc(suburb)}</b>${
      here.busy ? ' <span class="small">(更新中…)</span>' : ''}</div>
    ${street ? `<div class="here-street">${esc(street)}</div>` : ''}
    ${DEBUG ? `<div class="here-debug">[debug] ${esc(source)} ${esc(raw || '')}</div>${dbg}` : ''}`;
}
function updateHereBox() {
  const el = $app.querySelector('#here');
  if (!el) return;
  const html = hereHtml();
  el.innerHTML = html;
  el.style.display = html ? '' : 'none';   // no divider until there is something to show
  el.onclick = () => refreshHere(true);
}
async function refreshHere(force) {
  if (here.busy || (!force && Date.now() - here.at < HERE_REFRESH_MS) || !navigator.geolocation) return;
  here.busy = true;
  updateHereBox();
  try {
    const pos = await new Promise((ok, fail) => navigator.geolocation.getCurrentPosition(ok, fail,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }));
    const { latitude: lat, longitude: lon, accuracy } = pos.coords;
    here.log = [`GPS ok, ±${Math.round(accuracy)}m`];
    // OpenStreetMap finds the nearest road (more accurate street); Transport for NSW is the backup.
    let place = await lookupOsm(lat, lon).catch((e) => { here.log.push(`osm error: ${e.message}`); return null; });
    if (!place) {
      here.log.push('osm: no address');
      place = await lookupTfnsw(lat, lon).catch((e) => { here.log.push(`tfnsw error: ${e.message}`); return null; });
      if (!place) here.log.push('tfnsw: no address');
    }
    here.info = place ? { ...place, street: accuracy <= HERE_STREET_ACCURACY ? place.street : '' } : null;
  } catch (e) {
    // no permission or no position: never show a wrong place
    here.info = null;
    here.log = [e && e.code === 1 ? 'location permission denied' : e && e.code === 3 ? 'location timed out'
      : `location error: ${(e && e.message) || e}`];
  }
  here.at = Date.now();
  here.busy = false;
  updateHereBox();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.screen === 'home') refreshHere(false);
});

// Time picker: one hour wheel in daily order (清晨 5時 … 晚上 11時, then 凌晨 12時 … 4時) and a minutes
// wheel in 5-minute steps. iPhone's own time picker ignores steps (all 60 minutes), so we use <select>s,
// which open iPhone's wheel.
const MINUTE_STEP = 5;
const HOUR_ORDER = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4];
// limit = [hour, minute] of the earliest allowed time (today only), or null for the full list.
function minuteOptions(h, selected, limit) {
  const start = limit && h === limit[0] ? limit[1] : 0;
  return Array.from({ length: 60 / MINUTE_STEP }, (_, k) => k * MINUTE_STEP).filter((x) => x >= start)
    .map((x) => `<option value="${x}"${x === selected ? ' selected' : ''}>${String(x).padStart(2, '0')}分</option>`).join('');
}
function timePickerHtml(hhmm, limit = null) {
  let [h, m] = hhmm.split(':').map(Number);
  m = Math.round(m / MINUTE_STEP) * MINUTE_STEP;
  if (m === 60) { m = 0; h = (h + 1) % 24; }
  // Today: only the hours still to come, in clock order; other days: daily order from 清晨 5時
  const order = limit ? Array.from({ length: 24 - limit[0] }, (_, k) => limit[0] + k) : HOUR_ORDER;
  const hours = order.map((x) => `<option value="${x}"${x === h ? ' selected' : ''}>${dayPart(x)} ${x % 12 || 12}時</option>`).join('');
  return `<div class="bar timepick">
    <select data-hour aria-label="時">${hours}</select>
    <select data-min aria-label="分">${minuteOptions(h, m, limit)}</select></div>`;
}
function timeFromPicker(tp) {
  const h = +tp.querySelector('[data-hour]').value;
  return `${String(h).padStart(2, '0')}:${String(tp.querySelector('[data-min]').value).padStart(2, '0')}`;
}

// ---------- Choosing 從哪裡出發 / 去哪裡 ----------
const placeKey = (x) => (x === 'home' || x === 'here' ? x : x && (x.query || x.en));
const samePlace = (a, b) => !!a && !!b && placeKey(a) === placeKey(b);
const asPlace = (x) => (x === 'home' ? settings.home : x);   // 'here' stays 'here'
function choiceLabel(x, empty = '') {
  if (!x) return `<span class="placeholder">${esc(empty)}</span>`;
  if (x === 'home') return '<span>🏠 家 <span class="en">Home</span></span>';
  if (x === 'here') return '<span>📍 現在位置 <span class="en">Current location</span></span>';
  return `<span>${esc(x.zh || x.en)} <span class="en">${esc(x.zh ? x.en : '')}</span></span>`;
}
function setChoice(kind, value) {
  if (kind === 'from') {
    state.from = value;
    if (samePlace(state.to, value)) state.to = null;   // can't go from a place to itself
  } else {
    state.to = value;
  }
  showHome();
}
// Full-screen list: 家 / 現在位置 (start) or 回家 (destination), the saved places in 設定 order,
// and 🔍 其他地點 at the bottom of both lists.
function showPicker(kind) {
  clearTimers();
  state.screen = 'pick';
  const isFrom = kind === 'from';
  const items = [];
  if (isFrom) {
    items.push({ v: 'home', html: '🏠 家<span class="en">Home</span>', cls: 'home' });
    items.push({ v: 'here', html: '📍 現在位置<span class="en">Current location</span>', cls: 'here' });
  } else if (state.from !== 'home') {
    items.push({ v: 'home', html: '🏠 回家<span class="en">Home</span>', cls: 'home' });
  }
  settings.places.forEach((pl, i) => {
    if (!isFrom && samePlace(pl, state.from)) return;
    items.push({ v: i, html: `${esc(pl.zh || pl.en)}<span class="en">${esc(pl.zh ? pl.en : '')}</span>` });
  });
  render(`<button class="back" data-back>← 返回</button>
    <h1>${isFrom ? '從哪裡出發?' : '去哪裡?'}</h1>
    <div class="grid picklist">${items.map((it, k) =>
      `<button class="place ${it.cls || ''}" data-pick="${k}">${it.html}</button>`).join('')}</div>
    <div class="bar"><button class="btn other" data-other>🔍 其他地點<span class="en">Other places</span></button></div>`);
  $app.querySelector('[data-back]').onclick = showHome;
  $app.querySelectorAll('[data-pick]').forEach((b) => b.onclick = () => {
    const v = items[+b.dataset.pick].v;
    setChoice(kind, typeof v === 'number' ? settings.places[v] : v);
  });
  $app.querySelector('[data-other]').onclick = () => showSearchPlace(kind);
}

function showHome() {
  clearTimers();
  state.screen = 'home';
  const now = new Date();
  render(`
    <div class="hdr">
      <h1 class="title">爸媽出行</h1>
      <div class="sub">現在 ${todayLine(now)}</div>
      <button class="herebox" id="here" aria-label="你在"></button>
    </div>
    <h2>從哪裡出發?</h2>
    <button class="choice" data-row="from">${choiceLabel(state.from)}<span class="chev">›</span></button>
    <h2>去哪裡?</h2>
    <button class="choice ${state.to ? '' : 'empty'}" data-row="to">${choiceLabel(state.to, '請選擇目的地')}<span class="chev">›</span></button>
    <div class="bar"><button class="btn primary big" data-search-trip>🔍 搜尋路線</button></div>
    <div class="bar">
      <button class="btn" data-reset-trip>↺ 重新開始</button>
      <button class="btn" data-settings>⚙️ 設定</button>
    </div>
  `, true);
  $app.querySelectorAll('[data-row]').forEach((b) => b.onclick = () => showPicker(b.dataset.row));
  $app.querySelector('[data-search-trip]').onclick = () => {
    if (!state.to) return showPicker('to');
    // The list always starts at "leave now"; the time is changed on the list itself
    showTrips(asPlace(state.from), asPlace(state.to), { mode: 'now' }, { oneOff: !!state.to.searched });
  };
  $app.querySelector('[data-settings]').onclick = showSettings;
  // ↺ 重新開始: back to the clean state (家, no destination); saved places are not touched
  $app.querySelector('[data-reset-trip]').onclick = () => {
    state.from = 'home'; state.to = null;
    showHome();
  };
  updateHereBox();
  refreshHere(false);
}

// 「11月2日 星期一・晚上 7:30」 for the header card
function todayLine(now) {
  const [, m, d] = sydneyDate(0).split('-').map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(...sydneyDate(0).split('-').map((x, k) => (k === 1 ? x - 1 : +x)))).getUTCDay()];
  return `${m}月${d}日 星期${wd}・${fmtTime(now)}`;
}

// ---------- 📅 預先計劃 page ----------
// Short summary for the trip list: 「明天 早上 9:30 出發」 / 「11月20日 晚上 7:00 前到達」
function planShort(w) {
  const rel = { [sydneyDate(0)]: '今天', [sydneyDate(1)]: '明天', [sydneyDate(2)]: '後天' }[w.date];
  const [, m, d] = w.date.split('-').map(Number);
  return `${rel || `${m}月${d}日`} ${fmtHHMM(w.time)} ${w.arrive ? '前到達' : '出發'}`;
}
// Default: today at the next round hour, leaving (late at night that hour is tomorrow).
function defaultPlan() {
  const p = sydneyParts(new Date());
  const h = +p.hour + 1;
  return { mode: 'later', date: sydneyDate(h >= 24 ? 1 : 0), time: `${String(h % 24).padStart(2, '0')}:00`, arrive: false };
}
// Earliest time that can still be chosen today: the next 5-minute slot after now; null if none is left.
function earliestToday() {
  const p = sydneyParts(new Date());
  let h = +p.hour, m = Math.floor(+p.minute / MINUTE_STEP) * MINUTE_STEP + MINUTE_STEP;
  if (m >= 60) { m = 0; h += 1; }
  return h >= 24 ? null : [h, m];
}
// Never plan a time that has already passed today.
function clampPlan(draft) {
  if (draft.date < sydneyDate(0)) draft.date = sydneyDate(0);   // a date in the past -> today
  if (draft.date !== sydneyDate(0)) return draft;
  const e = earliestToday();
  if (!e) { draft.date = sydneyDate(1); return draft; }
  const [h, m] = draft.time.split(':').map(Number);
  if (h * 60 + m < e[0] * 60 + e[1]) draft.time = `${String(e[0]).padStart(2, '0')}:${String(e[1]).padStart(2, '0')}`;
  return draft;
}
// 改時間及日期. Works on a copy: ✕ 取消 discards it (done(null)), ✓ 確定 keeps it (done(plan)).
function showPlanPage(draftIn, done) {
  clearTimers();
  state.screen = 'plan';
  const draft = clampPlan(draftIn || defaultPlan());
  const todayLeft = !!earliestToday();
  const limit = draft.date === sydneyDate(0) ? earliestToday() : null;
  const dayChips = [0, 1, 2].map((o) => {
    const ymd = sydneyDate(o);
    const [, m, d] = ymd.split('-').map(Number);
    const wd = WEEKDAYS[new Date(Date.UTC(...ymd.split('-').map((x, k) => (k === 1 ? x - 1 : +x)))).getUTCDay()];
    const off = o === 0 && !todayLeft;   // nothing left to plan today
    return `<button data-day="${ymd}" class="${draft.date === ymd ? 'on' : ''}"${off ? ' disabled' : ''}>${['今天', '明天', '後天'][o]}<br><span class="small">${m}月${d}日<br>星期${wd}</span></button>`;
  }).join('');
  const otherDay = ![0, 1, 2].some((o) => sydneyDate(o) === draft.date);
  render(`<button class="back" data-cancel>✕ 取消</button>
    <h1>甚麼時候?</h1>
    <h2>哪一天?</h2>
    <div class="toggle three">${dayChips}</div>
    <div class="bar"><label class="grow small">或選擇其他日子
      <input type="date" id="otherDate" min="${sydneyDate(0)}" value="${otherDay ? draft.date : ''}"></label></div>
    <h2>出發還是到達?</h2>
    <div class="toggle">
      <button data-arrive="0" class="${draft.arrive ? '' : 'on'}">🚶 出發時間</button>
      <button data-arrive="1" class="${draft.arrive ? 'on' : ''}">🏁 到達時間</button>
    </div>
    <h2>幾點?</h2>
    ${timePickerHtml(draft.time, limit)}
    <div class="card plan-card" id="whenSummary">${esc(whenSummary(draft))}</div>
    <div class="bar"><button class="btn primary big" data-confirm>✓ 確定</button></div>`, true);
  $app.querySelector('[data-cancel]').onclick = () => done(null);
  $app.querySelector('[data-confirm]').onclick = () => done({ ...clampPlan(draft), mode: 'later' });
  $app.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => { draft.date = b.dataset.day; showPlanPage(draft, done); });
  $app.querySelectorAll('[data-arrive]').forEach((b) => b.onclick = () => { draft.arrive = b.dataset.arrive === '1'; showPlanPage(draft, done); });
  // iPhone fires a change on every turn of a picker wheel, so only record the value and update the
  // summary; redrawing the page would close the picker before it's confirmed.
  const updateSummary = () => { $app.querySelector('#whenSummary').textContent = whenSummary(draft); };
  const other = $app.querySelector('#otherDate');
  other.onchange = () => { if (other.value) { draft.date = other.value; clampPlan(draft); updateSummary(); } };
  other.onblur = () => showPlanPage(draft, done);   // after the picker closes: refresh the 今天/明天/後天 highlight
  const tp = $app.querySelector('.timepick');
  const minSel = tp.querySelector('[data-min]');
  tp.querySelector('[data-hour]').onchange = () => {
    // Today, the current hour has fewer minutes: refresh only the minutes list (not the whole page)
    const h = +tp.querySelector('[data-hour]').value;
    const keep = +minSel.value;
    minSel.innerHTML = minuteOptions(h, keep, limit);   // keeps the minute if allowed, else the first allowed one
    draft.time = timeFromPicker(tp);
    updateSummary();
  };
  minSel.onchange = () => { draft.time = timeFromPicker(tp); updateSummary(); };
}

// ---------- Time on the trip list: ◀ 早一點 · ⏱️ 現在 · 遲一點 ▶ ----------
const STEP_MS = 30 * 60000;
const SHOW_TRIPS = 8;   // trips shown at a time
// 'YYYY-MM-DD', 'HH:MM' (Sydney time) -> milliseconds. Two passes settle the daylight-saving offset.
function sydneyEpoch(date, time) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wanted = Date.UTC(y, mo - 1, d, h, mi);
  let t = wanted;
  for (let k = 0; k < 2; k++) {
    const p = sydneyParts(new Date(t));
    t += wanted - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  }
  return t;
}
function isArrive(when) { return when.mode === 'later' && !!when.arrive; }
function whenTime(when) { return when.mode === 'later' ? sydneyEpoch(when.date, when.time) : Date.now(); }
function planAt(ms, arrive) {
  const p = sydneyParts(new Date(ms));
  return { mode: 'later', date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, arrive };
}
// One tap: move 30 minutes, then round to the nearest :00 or :30 (a tie goes the way of the tap).
// Sydney is a whole number of hours ahead of UTC, so half hours line up. Before now -> back to 現在.
// Arrive-by plans move the arrival time; 現在 is always "leave now".
function stepWhen(when, dir) {
  const target = whenTime(when) + dir * STEP_MS;
  const low = Math.floor(target / STEP_MS) * STEP_MS;
  const rest = target - low;
  const t = rest * 2 < STEP_MS ? low : rest * 2 > STEP_MS ? low + STEP_MS : dir > 0 ? low + STEP_MS : low;
  if (t <= Date.now()) return { mode: 'now' };
  return planAt(t, isArrive(when));
}
function timeBarHtml(when) {
  const now = when.mode !== 'later';
  return `<div class="whenx">${now ? '⏱️ 現在出發' : esc(planShort(when))}</div>
    <div class="tbar">
      <button class="tb-step" data-step="-1"${now ? ' disabled' : ''}>◀ 早一點</button>
      <button class="tb-mid${now ? ' on' : ''}" data-now>⏱️ 現在</button>
      <button class="tb-step" data-step="1">遲一點 ▶</button>
    </div>
    <button class="tb-change" data-change>📅🕘 改時間及日期</button>`;
}

// ---------- Trips kept in memory for one route ----------
// Every trip fetched for this route stays in memory while the list is open (a few hundred KB at most),
// so ◀ ▶ show trips straight away. Each fetch "covers" a stretch of time: for leave-at searches from the
// asked time to the last departure returned; for arrive-by searches from the first arrival to the asked
// time. Trips inside a fresh stretch that are no longer returned (e.g. cancelled) are dropped.
function newTripPool() { return { trips: new Map(), spans: { dep: [], arr: [] }, updated: 0 }; }
const depMs = (j) => depTime(j.legs[0].origin).getTime();
const arrMs = (j) => arrTime(j.legs[j.legs.length - 1].destination).getTime();
// Same trip in two fetches: same first ride (planned time + line) and same lines after it
function tripKey(j) {
  const rides = j.legs.filter((l) => !modeOf(l).walk);
  if (!rides.length) return `walk|${j.legs[0].origin.departureTimePlanned || ''}`;
  return `${rides[0].origin.departureTimePlanned || ''}|${rides.map(lineName).join('>')}`;
}
async function fetchTrips(pool, origin, dest, when) {
  const arrive = isArrive(when);
  const T = whenTime(when);
  const js = await planTrip(origin, dest, when);
  const times = js.map(arrive ? arrMs : depMs).filter((x) => !isNaN(x));
  // Nothing found: count the next (or previous) hour as known-empty, so the screen doesn't wait forever
  const span = times.length ? (arrive ? [Math.min(T, ...times), T] : [T, Math.max(T, ...times)])
    : (arrive ? [T - 3600000, T] : [T, T + 3600000]);
  const keys = new Set(js.map(tripKey));
  for (const [k, j] of pool.trips) {
    const x = arrive ? arrMs(j) : depMs(j);
    if (x >= span[0] && x <= span[1] && !keys.has(k)) pool.trips.delete(k);
  }
  js.forEach((j) => pool.trips.set(tripKey(j), j));
  pool.spans[arrive ? 'arr' : 'dep'].push(span);
  pool.updated = Date.now();
}
// How far the known stretch reaches from t: forward for leave-at, backward for arrive-by. null = unknown.
function knownUntil(pool, arrive, t) {
  const spans = pool.spans[arrive ? 'arr' : 'dep'];
  const slack = 60000;
  let edge = null;
  for (let grew = true; grew;) {
    grew = false;
    for (const [a, b] of spans) {
      if (!arrive && a <= (edge ?? t) + slack && b >= (edge ?? t) && (edge === null || b > edge)) { edge = b; grew = true; }
      if (arrive && b >= (edge ?? t) - slack && a <= (edge ?? t) && (edge === null || a < edge)) { edge = a; grew = true; }
    }
  }
  return edge;
}
// The trips to show for `when`, earliest departure first. null = not fetched yet.
function tripsFor(pool, when, fromHome) {
  const arrive = isArrive(when);
  const t = whenTime(when);
  const edge = knownUntil(pool, arrive, t);
  if (edge === null) return null;
  let list = [...pool.trips.values()];
  if (arrive) {
    list = list.filter((j) => arrMs(j) <= t + 60000 && arrMs(j) >= edge).sort((a, b) => arrMs(b) - arrMs(a));
  } else {
    // A few minutes' leeway: Transport for NSW sometimes includes a trip just before the asked time
    list = list.filter((j) => depMs(j) >= t - 5 * 60000 && depMs(j) <= edge).sort((a, b) => depMs(a) - depMs(b));
  }
  // They walk slowly from home; hide trips that left more than a minute ago
  return list.map((j) => (fromHome ? slowerHomeWalk(j) : j))
    .filter((j) => minutesUntil(depTime(j.legs[0].origin)) >= -1)
    .slice(0, SHOW_TRIPS)
    .sort((a, b) => depMs(a) - depMs(b));
}

// opts.oneOff: a place found with 🔍 其他地點 (not one of the saved buttons)
// opts.pool: trips already fetched for this route (kept when coming back from a trip's details)
let tripsRun = 0;
async function showTrips(originPlace, destPlace, when, opts = {}) {
  clearTimers();
  state.screen = 'trips';
  const run = ++tripsRun;
  const mine = () => state.screen === 'trips' && tripsRun === run;
  // 📍 現在位置 can change between visits, so its trips are never reused
  const pool = (originPlace !== 'here' && opts.pool) || newTripPool();
  const fromHome = originPlace === settings.home;
  const fromLabel = originPlace === 'here' ? '📍 現在位置' : esc(originPlace.zh || originPlace.en);
  const toLabel = esc(destPlace.zh || destPlace.en);
  const isSaved = () => settings.places.some((p) => p.query === destPlace.query);
  const saveBtn = () => (!opts.oneOff ? '' : isSaved()
    ? '<div class="sub ontime">✓ 已加到常去地點</div>'
    : '<div class="bar"><button class="btn" data-save>⭐ 加到常去地點</button></div>');
  // English underneath, e.g. 「家 → 寶活站」 / Home → Burwood
  const fromEn = originPlace === 'here' ? 'Current location' : (originPlace.en || '');
  const toEn = destPlace.en || '';
  const enLine = fromEn && toEn && `${fromEn} → ${toEn}` !== `${originPlace.zh || ''} → ${destPlace.zh || ''}`
    ? `<div class="route-en">${esc(fromEn)} → ${esc(toEn)}</div>` : '';
  const header = () => `<button class="back" data-back>← 返回</button>
    <h1 class="route">${fromLabel} → ${toLabel}</h1>${enLine}${saveBtn()}`;
  const wireSave = () => {
    const b = $app.querySelector('[data-save]');
    if (b) b.onclick = () => {
      const { searched, ...keep } = destPlace;
      settings.places.push(keep);
      saveSettings();
      b.parentElement.outerHTML = '<div class="sub ontime">✓ 已加到常去地點</div>';
    };
  };
  render(header() + `<div class="msg">正在搜尋路線…</div>`);
  $app.querySelector('[data-back]').onclick = showHome;
  wireSave();

  let origin, dest;
  try {
    origin = originPlace === 'here' ? await currentPosition() : (pool.origin || await resolvePlace(originPlace));
    dest = pool.dest || await resolvePlace(destPlace);
    if (originPlace !== 'here') pool.origin = origin;
    pool.dest = dest;
  } catch (e) {
    if (!mine()) return;
    // Our own messages (place not found, no location) are shown as they are; network problems get a clear sentence.
    const ours = /^(找不到|無法取得|這部電話)/.test(e.message);
    return showError(header(), ours ? e.message : `無法連接伺服器,請檢查網絡。(${e.message})`, '',
      () => showTrips(originPlace, destPlace, when, opts));
  }

  let failed = null;   // error text when the current time's trips could not be fetched
  const again = () => showTrips(originPlace, destPlace, when, { ...opts, pool });
  const draw = () => {
    if (!mine()) return;
    const shown = tripsFor(pool, when, fromHome);
    let body;
    if (!shown) {
      body = failed
        ? `<div class="err">無法連接伺服器,請檢查網絡。(${esc(failed)})</div>
           <div class="bar"><button class="btn primary" data-retry>重試</button></div>`
        : '<div class="msg">正在搜尋路線…</div>';
    } else {
      // Uber: available when a trip leaves within 30 minutes (or, with no trips found, when searching for now)
      const soon = shown.length ? shown.some((jj) => liveNow(depTime(jj.legs[0].origin))) : when.mode === 'now';
      const uber = uberBlock(destPlace, shown, soon);
      body = `<div class="sub">更新時間 ${fmtTime(new Date(pool.updated))}・自動更新</div>` + (shown.length
        ? shown.map((j, i) => journeyCard(j, i)).join('')
        : '<div class="msg">這段時間找不到路線。<br>請按 ◀ 早一點 / 遲一點 ▶,或改時間。</div>') + uber;
    }
    render(header() + timeBarHtml(when) + body, true);
    $app.querySelector('[data-back]').onclick = showHome;
    wireSave();
    $app.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => setWhen(stepWhen(when, +b.dataset.step)));
    $app.querySelector('[data-now]').onclick = () => setWhen({ mode: 'now' });
    $app.querySelector('[data-change]').onclick = () =>
      showPlanPage(when.mode === 'later' ? { ...when } : null, (w) => { if (w) when = w; again(); });
    const r = $app.querySelector('[data-retry]');
    if (r) r.onclick = () => { failed = null; draw(); settle(); };
    if (shown) {
      $app.querySelectorAll('[data-j]').forEach((b) => b.onclick = () =>
        showJourney(shown[+b.dataset.j], again, [...pool.trips.values()]));
    }
  };
  // Fetch the trips for the time on screen (fresh live times), then quietly the next step either way.
  let busy = null;
  const settle = async () => {
    const w = when;
    try {
      await fetchTrips(pool, origin, dest, w);
      if (w === when) failed = null;
    } catch (e) {
      if (w === when) failed = e.message;
    }
    if (!mine()) return;
    draw();
    for (const dir of [1, -1]) {
      if (dir < 0 && w.mode !== 'later') continue;
      const n = stepWhen(w, dir);
      if (n.mode !== 'later' || knownUntil(pool, isArrive(n), whenTime(n)) !== null) continue;
      try { await fetchTrips(pool, origin, dest, n); } catch (e) { /* tried again when tapped */ }
      if (!mine()) return;
    }
  };
  // A tap shows what is in memory at once; the fetch waits until the taps stop.
  const setWhen = (w) => {
    when = w;
    failed = null;
    draw();
    clearTimeout(busy);
    busy = setTimeout(settle, 600);
    timers.push(busy);
  };
  draw();
  await settle();
  // Live times matter for trips leaving soon; later trips change less often.
  let tick = 0;
  timers.push(setInterval(() => {
    tick += 1;
    const soon = whenTime(when) - Date.now() < 90 * 60000;
    if (soon || tick % 5 === 0) settle();
  }, 60000));
  timers.push(setInterval(draw, 15000));
}

// They walk slowly: the first walk from 家 gets HOME_WALK_EXTRA_MIN more minutes, so they leave earlier
// and still catch the same bus or train (its time doesn't change).
const HOME_WALK_EXTRA_MIN = 5;
function slowerHomeWalk(j) {
  const first = j.legs[0];
  if (!first || !modeOf(first).walk || j.legs.length < 2) return j;
  const extra = HOME_WALK_EXTRA_MIN * 60000;
  const earlier = (t) => (t ? new Date(new Date(t).getTime() - extra).toISOString() : t);
  const origin = { ...first.origin,
    departureTimePlanned: earlier(first.origin.departureTimePlanned),
    departureTimeEstimated: earlier(first.origin.departureTimeEstimated) };
  return { ...j, legs: [{ ...first, origin, duration: (first.duration || 0) + HOME_WALK_EXTRA_MIN * 60 }, ...j.legs.slice(1)] };
}


// 🚕 Uber: opens the Uber app (or Uber's website) with pickup = the phone's current location and the
// destination filled in, so the real price shows before booking. Nothing is booked automatically.
// Only shown for 「現在」 trips, because Uber's price is for right now.
function uberLink(destPlace, journeys) {
  const q = new URLSearchParams({ action: 'setPickup', pickup: 'my_location' });
  const name = destPlace.query || destPlace.en || '';
  // Destination position: from the trip results, or from the saved place
  let coord = null;
  const last = journeys && journeys[0] && journeys[0].legs[journeys[0].legs.length - 1];
  if (last && last.destination && Array.isArray(last.destination.coord)) coord = last.destination.coord; // [lat, lon]
  else if (destPlace.ref && destPlace.ref.type === 'coord') {
    const [lon, lat] = destPlace.ref.name.split(':');
    coord = [lat, lon];
  }
  if (coord) {
    q.set('dropoff[latitude]', coord[0]);
    q.set('dropoff[longitude]', coord[1]);
  }
  q.set('dropoff[nickname]', name);
  q.set('dropoff[formatted_address]', /NSW/.test(name) ? name : `${name}, NSW`);
  return `https://m.uber.com/ul/?${q}`;
}
function uberBlock(destPlace, journeys, active = true) {
  if (!active) return `<div class="btn uber off">🚕 改搭 Uber? 查看價錢<span class="small">${LIVE_NOTE}</span></div>`;
  return `<a class="btn uber" href="${esc(uberLink(destPlace, journeys))}" target="_blank" rel="noopener">
    🚕 改搭 Uber? 查看價錢
    <span class="small">會打開 Uber app,起點用你現在的位置,目的地已經填好。按確認才會叫車。</span></a>`;
}

// retry: repeats the same search (keeps the chosen start, destination and time)
function showError(header, text, extra = '', retry = null) {
  render(header + `<div class="err">${esc(text)}</div>
    <div class="bar"><button class="btn primary" data-retry>重試</button></div>${extra}`);
  $app.querySelector('[data-back]').onclick = showHome;
  $app.querySelector('[data-retry]').onclick = () => (retry ? retry() : location.reload());
}

function leaveText(leave) {
  const mins = minutesUntil(leave);
  if (mins < -1) return { cls: 'missed', text: '已錯過' };
  if (mins <= 1) return { cls: 'now', text: '現在出門!' };
  if (mins < 60) return { cls: '', text: `${mins} 分鐘後出門` };
  if (mins < 180) return { cls: '', text: `${Math.floor(mins / 60)} 小時 ${mins % 60} 分鐘後出門` };
  return { cls: '', text: `${dayLabel(ymdOf(leave))}<br>${fmtTime(leave)} 出門` };
}

function journeyCard(j, i) {
  const first = j.legs[0];
  const last = j.legs[j.legs.length - 1];
  const leave = depTime(first.origin);
  const arrive = arrTime(last.destination);
  const lt = leaveText(leave);
  const rides = j.legs.filter((l) => !modeOf(l).walk);
  const changes = Math.max(0, rides.length - 1);
  const total = Math.round((arrive - leave) / 60000);
  const firstRide = rides[0];
  let delay = '';
  if (firstRide) {
    const d = delayMin(firstRide.origin, 'departure');
    if (d != null) delay = d > 0 ? `<div class="sub late">第一程車延誤 ${d} 分鐘</div>` : `<div class="sub ontime">準時</div>`;
  }
  const allNotices = j.legs.flatMap((l) => noticesOf(l));
  const noticeLine = allNotices.some((n) => n.severe) ? '<div class="sub late">⚠️ 有重要服務通知,請按入查看</div>'
    : allNotices.length ? '<div class="sub">ℹ️ 有一般服務通知</div>' : '';
  const badges = j.legs.map((l) => {
    const m = modeOf(l);
    if (m.walk) return `<span class="badge m-walk">🚶${Math.max(1, Math.round((l.duration || 0) / 60))}'</span>`;
    return `<span class="badge m-${m.key}">${m.icon} ${esc(lineName(l))}</span>`;
  }).join(' › ');
  return `<button class="card tap" data-j="${i}">
    <div class="leave ${lt.cls}">${lt.text}</div>
    <div class="times">${fmtTime(leave)} 出發 → ${fmtTime(arrive)} 到達</div>
    <div class="sub">全程 ${total} 分鐘・${changes ? `轉車 ${changes} 次` : '不用轉車'}</div>
    ${delay}
    ${noticeLine}
    <div class="lines">${badges}</div>
  </button>`;
}

// Stops a ride passes through, from the trip data: [{ name, coord, time }]
function rideStops(leg) {
  return (Array.isArray(leg.stopSequence) ? leg.stopSequence : []).map((st) => ({
    name: st.disassembledName || st.name || '',
    full: st.name || '',
    coord: Array.isArray(st.coord) ? st.coord : null,
    time: st.arrivalTimeEstimated || st.arrivalTimePlanned || st.departureTimeEstimated || st.departureTimePlanned,
  }));
}
// The 「顯示途經車站」 list: every stop, with 🔔 on the stop before the one to get off at.
function stopListHtml(leg, m) {
  const list = rideStops(leg);
  if (list.length < 2) return '';
  const last = list.length - 1;
  const bell = m.key === 'bus' ? '🔔 下一站下車,請按鐘' : '下一站下車';
  const rows = list.map((st, k) => {
    const label = placeLabel(st.full || st.name);
    const time = st.time ? `<span class="small">${fmtTime(new Date(st.time))}</span>` : '';
    if (k === 0) return `<li class="first">${label} ${time}<div class="small">上車</div></li>`;
    if (k === last) return `<li class="getoff">📍 ${label} ${time}<div>在此下車</div></li>`;
    if (k === last - 1) return `<li class="bell">${label} ${time}<div>${bell}</div></li>`;
    return `<li>${label} ${time}</li>`;
  }).join('');
  return `<details class="stops"><summary>顯示途經車站 (${last} 個站)</summary><ol>${rows}</ol></details>`;
}

// 🗺️ Apple Maps walking directions from where the phone is now to a stop or place.
// https://maps.apple.com/?daddr=<lat,lon>&dirflg=w  (no start given = "here")
function mapLink(stop) {
  const q = new URLSearchParams({ dirflg: 'w' });
  if (stop && Array.isArray(stop.coord)) q.set('daddr', `${stop.coord[0]},${stop.coord[1]}`); // [lat, lon]
  else q.set('daddr', `${String((stop && stop.name) || '')}, NSW`);
  return `https://maps.apple.com/?${q}`;
}

// Turn the journey into plain steps, each with screen text and spoken text.
function journeySteps(j) {
  const steps = [];
  j.legs.forEach((leg, i) => {
    const m = modeOf(leg);
    const mins = Math.max(1, Math.round((leg.duration || 0) / 60));
    if (m.walk) {
      const to = i === j.legs.length - 1 ? '目的地' : speakName(leg.destination.name);
      steps.push({
        icon: m.icon,
        what: `步行 ${mins} 分鐘`,
        debug: debugTag(leg),
        detail: i === j.legs.length - 1 ? '步行到目的地' : `步行到 ${placeLabel(leg.destination.name)}`,
        say: `步行 ${mins} 分鐘,到${to}。`,
        map: mapLink(leg.destination),
      });
      return;
    }
    const line = lineName(leg);
    const towards = leg.transportation && leg.transportation.destination ? leg.transportation.destination.name : '';
    const plat = platformOf(leg.origin.name);
    const dep = depTime(leg.origin);
    const d = delayMin(leg.origin, 'departure');
    const stops = Array.isArray(leg.stopSequence) ? leg.stopSequence.length - 1 : null;
    const notices = noticesOf(leg);
    steps.push({
      icon: m.icon,
      debug: debugTag(leg),
      what: `${fmtTime(dep)} 乘搭 <span class="badge m-${m.key}">${esc(line)}</span> ${m.zh}` +
        (d > 0 ? ` <span class="late">延誤 ${d} 分鐘</span>` : ''),
      detail: `在 ${placeLabel(leg.origin.name)} <span class="nowrap">上車</span>` +
        (plat ? `,<span class="nowrap"><b>${esc(plat.zh)}</b> <span class="en">${esc(plat.en)}</span></span>` : '') +
        (m.key === 'bus' && streetOf(leg.origin.name) ? `<br><span class="en">${esc(streetOf(leg.origin.name))}</span>` : '') +
        (towards ? `<br>往 ${directionLabel(towards)} <span class="nowrap">方向</span>` : '') +
        (stops ? `<br>共 ${stops} 個站` : ''),
      notices,
      leg,
      stopList: stopListHtml(leg, m),
      map: i === 0 ? mapLink(leg.origin) : '',
      say: `${fmtTime(dep)},在${speakName(leg.origin.name)}` + (plat ? `${plat.zh}` : '') +
        `,乘搭${line}${m.zh}` + (towards ? `,往 ${speakDirection(towards)} 方向` : '') +
        (stops ? `,共${stops}個站` : '') + '。',
    });
    const arr = arrTime(leg.destination);
    const isLastRide = !j.legs.slice(i + 1).some((l) => !modeOf(l).walk);
    steps.push({
      icon: isLastRide ? '📍' : '🔄',
      what: `${fmtTime(arr)} 在 ${placeLabel(leg.destination.name)} 下車`,
      detail: isLastRide ? '' : '然後轉車',
      say: `${fmtTime(arr)},在${speakName(leg.destination.name)}下車` + (isLastRide ? '。' : ',然後轉車。'),
    });
  });
  return steps;
}

// 🗺️ 地圖指路, 📍 還有幾個站 and 🚕 Uber use the phone's location (or today's price), so they are
// available from LIVE_WINDOW_MIN minutes before departure, however the trip was searched; before that
// they are shown greyed out with the reason, so nothing seems to vanish.
const LIVE_WINDOW_MIN = 30;
const LIVE_NOTE = `出發前 ${LIVE_WINDOW_MIN} 分鐘才可使用`;
function liveNow(leave) { return minutesUntil(leave) <= LIVE_WINDOW_MIN; }

// others: all trips in the list, so the countdown can tell which service they actually boarded
function showJourney(j, goBack, others = []) {
  clearTimers();
  state.screen = 'journey';
  const leave = depTime(j.legs[0].origin);
  const arrive = arrTime(j.legs[j.legs.length - 1].destination);
  const steps = journeySteps(j);
  // Read only the trip steps, not the service notices.
  const sayText = () => steps.map((s) => s.say).join(' ');
  let live = liveNow(leave);
  const draw = (keepScroll) => {
    const lt = leaveText(leave);
    live = liveNow(leave);
    render(`<button class="back" data-back>← 返回</button>
      <div class="card">
        <div class="leave ${lt.cls}">${lt.text}</div>
        <div class="times">${dayLabel(ymdOf(leave))}</div>
        <div class="times">${fmtTime(leave)} 出發 → ${fmtTime(arrive)} 到達</div>
      </div>
      <div class="bar">
        <button class="btn" data-say>🔊 朗讀</button>
        ${FEATURE_REMINDER ? '<button class="btn" data-remind>⏰ 提醒我</button>' : ''}
      </div>
      <div class="card">${steps.map((s) => `<div class="step"><div class="icon">${s.icon}</div>
        <div><div class="what">${s.what}</div><div class="detail">${s.detail}</div>${s.debug || ''}
        ${!s.map ? '' : live ? `<a class="maplink" href="${esc(s.map)}" target="_blank" rel="noopener">🗺️ 地圖指路</a>`
          : `<span class="maplink off">🗺️ 地圖指路</span><div class="offnote">${LIVE_NOTE}</div>`}
        ${s.stopList || ''}
        ${!(s.leg && canTrack(s.leg)) ? '' : live ? `<button class="btn track" data-track="${steps.indexOf(s)}">📍 上車後按這裡:還有幾個站</button>`
          : `<button class="btn track" disabled>📍 上車後按這裡:還有幾個站</button><div class="offnote">${LIVE_NOTE}</div>`}
        ${noticesHtml(s.notices)}</div></div>`).join('')}
        <div class="step"><div class="icon">🏁</div><div class="what">${fmtTime(arrive)} 到達</div></div>
      </div>`, keepScroll);
    $app.querySelector('[data-back]').onclick = () => { stopSpeaking(); goBack(); };
    // White when idle, blue with 「停止」 while reading; tap again to stop.
    const sayBtn = $app.querySelector('[data-say]');
    const showSaying = (on) => {
      sayBtn.classList.toggle('primary', on);
      sayBtn.textContent = on ? '⏹ 停止' : '🔊 朗讀';
    };
    sayBtn.onclick = () => {
      if (isSpeaking()) return stopSpeaking();
      speak(sayText(), () => showSaying(false));
      showSaying(true);
    };
    if (FEATURE_REMINDER) $app.querySelector('[data-remind]').onclick = () => remind(j, steps);
    $app.querySelectorAll('[data-track]').forEach((b) => b.onclick = () =>
      showTracking(steps[+b.dataset.track].leg, () => showJourney(j, goBack, others), others));
    fillNotices();
  };
  draw(false);
  // Redraw only the countdown, so open notices stay open — unless the live buttons just became available.
  timers.push(setInterval(() => {
    if (liveNow(leave) !== live) return draw(true);
    const el = $app.querySelector('.leave');
    if (el) { const lt = leaveText(leave); el.className = `leave ${lt.cls}`; el.innerHTML = lt.text; }
  }, 15000));
}

// ---------- 還有幾個站: live stop countdown on the bus ----------
// Uses the phone's GPS while the app is open on screen (iPhone pauses web apps when the screen locks,
// so we ask iPhone to keep the screen on). The alert is visual: iPhone web apps can't vibrate.
function canTrack(leg) {
  const list = rideStops(leg);
  return list.length >= 2 && list.every((st) => st.coord);
}
function metres(a, b) {   // a, b = [lat, lon]
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Which stops could the bus have reached by now? Each stop has its expected (live, if available) time;
// stops due more than EARLY_MINUTES from now are not considered, so a winding route that passes near a
// later stop can't jump ahead, but a long GPS gap still catches up fully. Without times: LOOK_AHEAD stops.
const EARLY_MINUTES = 4;
const LOOK_AHEAD = 6;
// Highest stop index the bus has reached or gone past, given the current position.
// accuracy = GPS accuracy in metres: the "near the stop" circle grows when GPS is less precise.
function stopsPassed(list, pos, passed, accuracy = 0, now = Date.now()) {
  let found = passed;
  for (let k = passed + 1; k < list.length; k++) {
    if (list[k].time) {
      if (new Date(list[k].time).getTime() > now + EARLY_MINUTES * 60000) break;
    } else if (k > passed + LOOK_AHEAD) break;
    // Circle: max(80 m, accuracy + 30 m), at most 200 m, and at most half the distance to a neighbouring stop
    const gaps = [metres(list[k].coord, list[k - 1].coord),
      k + 1 < list.length ? metres(list[k].coord, list[k + 1].coord) : Infinity];
    const radius = Math.max(30, Math.min(Math.max(80, accuracy + 30), 200, Math.min(...gaps) / 2));
    const atStop = metres(pos, list[k].coord) < radius;
    // Past stop k: closer to stop k+1 than stop k is, and already away from stop k
    const pastStop = k + 1 < list.length &&
      metres(pos, list[k + 1].coord) < metres(list[k].coord, list[k + 1].coord) && metres(pos, list[k].coord) > 40;
    if (atStop || pastStop) found = k;
  }
  return found;
}
const WORST_USABLE_ACCURACY = 300;   // metres; readings worse than this are ignored

async function keepScreenOn() {
  try { return await navigator.wakeLock.request('screen'); } catch (e) { return null; }
}
// ---------- Which service did they actually board? ----------
// Same line, different time (one train earlier or later). GPS shows when the vehicle really left the
// boarding stop; the stop times are then shifted to match, so the "not due yet" check follows the real
// service. Services are almost never more than 2 minutes early, but can be very late.
const BOARD_SPEED_MS = 4.2;          // about 15 km/h: faster than walking
const MAX_EARLY_MIN = 2;
// Departures of the same line from the same stop, from all trips in the list: [{ planned, expected, selected }]
function sameLineServices(leg, others) {
  const key = (l) => `${lineName(l)}|${baseName(l.origin.name)}|${(l.transportation && l.transportation.destination || {}).name || ''}`;
  const want = key(leg);
  const seen = new Set();
  const out = [];
  [{ legs: [leg] }, ...others].forEach((j) => j.legs.forEach((l) => {
    if (modeOf(l).walk || key(l) !== want) return;
    const planned = new Date(l.origin.departureTimePlanned || l.origin.departureTimeEstimated).getTime();
    if (seen.has(planned)) return;
    seen.add(planned);
    out.push({ planned, expected: depTime(l.origin).getTime(), selected: l === leg });
  }));
  return out;
}
// Which service fits a real departure time best? Rule out any that would be more than 2 minutes early,
// then take the closest expected (live, if known) time. Returns true if it isn't the selected one.
function boardedDifferentService(leftAt, services) {
  const fits = services.filter((sv) => leftAt >= sv.planned - MAX_EARLY_MIN * 60000);
  if (!fits.length) return true;   // earlier than every listed service allows
  const best = fits.reduce((a, b) => (Math.abs(leftAt - b.expected) < Math.abs(leftAt - a.expected) ? b : a));
  return !best.selected;
}

function showTracking(leg, goBack, others = []) {
  clearTimers();
  state.screen = 'tracking';
  const m = modeOf(leg);
  const list = rideStops(leg);
  const target = list.length - 1;
  let passed = 0, watchId = null, wake = null, lastFix = null;
  // Boarding: when the vehicle leaves the first stop. shiftMs moves the stop times to the real service.
  let boarded = false, shiftMs = 0, otherService = false, firstFix = true;
  const services = sameLineServices(leg, others);
  // Expected (live, if known) departure from the boarding stop, the time the stop list was worked out from
  const firstStopTime = depTime(leg.origin).getTime() || (list[0].time ? new Date(list[0].time).getTime() : null);
  function startWatch() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = navigator.geolocation.watchPosition(onPosition, () => { lastFix = null; draw(); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }
  function onPosition(p) {
    if (state.screen !== 'tracking') return;
    lastFix = p.coords.accuracy;
    if (lastFix <= WORST_USABLE_ACCURACY) {
      const pos = [p.coords.latitude, p.coords.longitude];
      const away = list[0].coord ? metres(pos, list[0].coord) : 0;
      if (!boarded && firstFix && away > 200) {
        boarded = true;   // already riding when the countdown was opened: keep the card's times
      } else if (!boarded && (away > 200 || (away > 100 && (p.coords.speed || 0) > BOARD_SPEED_MS))) {
        boarded = true;
        const leftAt = p.timestamp || Date.now();
        // Only ever move the times earlier: a later service is never held back by the timetable check
        // anyway, and a wrong (late) boarding time must not stop the countdown crossing off stops.
        if (firstStopTime) shiftMs = Math.min(0, leftAt - firstStopTime);
        otherService = boardedDifferentService(leftAt, services);
      }
      firstFix = false;
      passed = stopsPassed(list, pos, passed, lastFix, Date.now() - shiftMs);
    }
    draw();
  }
  // iPhone cancels the screen-on request whenever the app goes to the background; ask again on return.
  const askScreenOn = () => keepScreenOn().then((w) => {
    wake = w;
    if (wake) wake.addEventListener('release', draw);
    draw();
  });
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    if (!wake || wake.released) askScreenOn();
    // Back from another app: restart GPS tracking, which delivers a fresh position straight away
    startWatch();
  };
  document.addEventListener('visibilitychange', onVisible);
  const stop = () => {
    document.removeEventListener('visibilitychange', onVisible);
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    if (wake) wake.release().catch(() => {});
    document.body.classList.remove('alert-bell', 'alert-off');
  };
  const draw = () => {
    if (state.screen !== 'tracking') return;
    const left = target - passed;
    const bell = left === 1, here = left <= 0;
    document.body.classList.toggle('alert-bell', bell);
    document.body.classList.toggle('alert-off', here);
    const big = here ? '📍 到站,請下車!' : bell ? (m.key === 'bus' ? '🔔 下一站下車<br>請按鐘!' : '下一站下車!') : `還有 ${left} 個站`;
    const next = list[Math.min(passed + 1, target)];
    render(`<button class="back" data-back>← 結束</button>
      <div class="track-head">乘搭 <span class="badge m-${m.key}">${esc(lineName(leg))}</span> ${m.zh}${
        boarded ? ' <span class="boarded">✓ 已上車</span>' : ''}</div>
      ${otherService ? `<div class="other-service">⚠️ 可能不是原定班次 — 請看月台或車上顯示屏,確認會停
        <b>${placeLabel(list[target].full || list[target].name)}</b></div>` : ''}
      <div class="track-big">${big}</div>
      ${here ? '' : `<div class="track-row">下一站:<b>${placeLabel(next.full || next.name)}</b></div>`}
      <div class="track-row">下車站:<b>${placeLabel(list[target].full || list[target].name)}</b></div>
      <div class="small">${!lastFix ? '定位中…'
        : lastFix > WORST_USABLE_ACCURACY ? `定位不準 (約 ${Math.round(lastFix)} 米),等待中…`
        : `定位準確度約 ${Math.round(lastFix)} 米`}・${wake && !wake.released
        ? '螢幕會保持開啟' : '請保持此畫面開啟,不要鎖機'}</div>
      <ol class="track-list">${list.map((st, k) => `<li class="${k <= passed ? 'done' : ''} ${k === target ? 'getoff' : ''} ${k === target - 1 ? 'bell' : ''}">
        ${k === target ? '📍 ' : ''}${placeLabel(st.full || st.name)}</li>`).join('')}</ol>`, true);
    $app.querySelector('[data-back]').onclick = () => { stop(); goBack(); };
  };
  if (!navigator.geolocation) { alert('這部電話不支援定位'); return goBack(); }
  startWatch();
  askScreenOn();
  draw();
}

// ---------- Read aloud in Cantonese ----------
// Same Cantonese voice every time: iPhone may list several Cantonese voices (and loads the list in
// the background), so pick by a fixed rule — premium > enhanced > standard, then by name — and skip
// Apple's novelty/Eloquence voices. The list is loaded at start-up so it's ready when 🔊 is tapped.
let voiceList = [];
function loadVoices() {
  const v = speechSynthesis.getVoices();
  if (v.length) voiceList = v;
}
function cantoneseVoice() {
  if (!voiceList.length) loadVoices();
  const id = (v) => `${v.voiceURI || ''} ${v.name || ''}`;
  const rank = (v) => (/premium/i.test(id(v)) ? 0 : /enhanced/i.test(id(v)) ? 1 : 2);
  return voiceList
    .filter((v) => /^(zh[-_]HK|yue)/i.test(v.lang) && !/eloquence|speech\.synthesis|novelty/i.test(v.voiceURI || ''))
    .sort((a, b) => rank(a) - rank(b) || id(a).localeCompare(id(b)))[0] || null;
}
// speak(text, onDone): onDone runs once when reading ends or is stopped.
let speakDone = null;
function speak(text, onDone) {
  if (!('speechSynthesis' in window)) return alert('這部電話不支援朗讀');
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-HK';
  const v = cantoneseVoice();
  if (v) u.voice = v;
  u.rate = 0.9;
  const done = () => { if (speakDone === done) { speakDone = null; if (onDone) onDone(); } };
  speakDone = done;
  u.onend = done;
  u.onerror = done;
  // iPhone often clips the start of the first thing it says: a short pause goes first, so only the pause is lost
  const warm = new SpeechSynthesisUtterance('，，');
  warm.lang = 'zh-HK';
  if (v) warm.voice = v;
  speechSynthesis.speak(warm);
  speechSynthesis.speak(u);
}
function isSpeaking() { return speakDone !== null; }
function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (speakDone) speakDone();
}
if ('speechSynthesis' in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

// ---------- Reminder: a calendar event with an alarm ----------
function remind(j, steps) {
  const leave = depTime(j.legs[0].origin);
  const before = settings.remindBefore || 10;
  if (minutesUntil(leave) <= 1) return alert('現在就要出門了!');
  const firstRide = j.legs.find((l) => !modeOf(l).walk);
  const title = '出門!' + (firstRide ? `乘搭 ${lineName(firstRide)} ${modeOf(firstRide).zh}` : '');
  const desc = steps.map((s) => s.say).join('\n');
  const q = new URLSearchParams({ title, start: leave.toISOString(), before: String(before), desc });
  location.href = `${WORKER_URL}/ics?${q}`;
}

// ---------- Settings ----------
function showSettings() {
  clearTimers();
  state.screen = 'settings';
  const rows = settings.places.map((p, i) => `<div class="row">
      <div class="grow">${esc(p.zh || p.en)} <span class="en">${esc(p.en || '')}</span></div>
      <button data-up="${i}" ${i === 0 ? 'disabled' : ''}>⬆️</button>
      <button data-del="${i}">🗑️</button></div>`).join('');
  render(`<button class="back" data-back>← 返回</button>
    <h1>設定</h1>
    <h2>住址</h2>
    <div class="row"><div class="grow">${esc(settings.home.query)}</div><button data-home>更改</button></div>
    <h2>常去地點</h2>
    ${rows || '<div class="small">未有地點</div>'}
    <div class="bar"><button class="btn primary" data-add>➕ 新增地點</button></div>
    ${FEATURE_REMINDER ? `<h2>出門提醒</h2>
    <div class="toggle three">${[5, 10, 15].map((n) =>
      `<button data-before="${n}" class="${settings.remindBefore === n ? 'on' : ''}">提前 ${n} 分鐘</button>`).join('')}</div>` : ''}
    <h2>朗讀</h2>
    <div class="bar"><button class="btn" data-testvoice>🔊 試聽廣東話</button></div>
    <div class="small">如果不是廣東話,請參閱設定說明。</div>
    <div class="bar"><button class="btn danger" data-reset>還原預設</button></div>
    <div class="version">版本 ${esc(APP_VERSION)} · ${esc(APP_DATE)} ·
      <a href="${esc(CHANGELOG_URL)}" target="_blank" rel="noopener">更新紀錄</a><br>
      地址資料 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></div>`);
  $app.querySelector('[data-back]').onclick = showHome;
  $app.querySelector('[data-home]').onclick = () => showAddPlace(true);
  $app.querySelector('[data-add]').onclick = () => showAddPlace(false);
  $app.querySelector('[data-testvoice]').onclick = () => speak('你好,下一班火車三分鐘後在二號月台開出。');
  $app.querySelectorAll('[data-before]').forEach((b) => b.onclick = () => {
    settings.remindBefore = +b.dataset.before; saveSettings(); showSettings();
  });
  $app.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
    const p = settings.places[+b.dataset.del];
    if (confirm(`刪除「${p.zh || p.en}」?`)) { settings.places.splice(+b.dataset.del, 1); saveSettings(); showSettings(); }
  });
  $app.querySelectorAll('[data-up]').forEach((b) => b.onclick = () => {
    const i = +b.dataset.up;
    [settings.places[i - 1], settings.places[i]] = [settings.places[i], settings.places[i - 1]];
    saveSettings(); showSettings();
  });
  $app.querySelector('[data-reset]').onclick = () => {
    if (confirm('還原所有設定?住址和常去地點都會還原成預設。')) { localStorage.removeItem(STORE_KEY); settings = loadSettings(); showSettings(); }
  };
}

// 🔍 其他地點: plan a one-off trip to any place without changing the saved buttons.
// Chinese input matches the station names this app knows; anything else is searched in English.
function localChineseMatches(text) {
  return Object.entries(ZH_NAMES).filter(([, zh]) => zh.includes(text) || text.includes(zh.split(' ')[0]))
    .map(([en, zh]) => {
      const train = !NOT_TRAIN_STATIONS.includes(en);
      return { zh: withStation(zh, train), en, query: train ? `${en} Station` : en };
    });
}
function showSearchPlace(kind) {
  clearTimers();
  state.screen = 'search';
  render(`<button class="back" data-back>← 返回</button>
    <h1>${kind === 'from' ? '從其他地點出發' : '去其他地點'}</h1>
    <div class="small">輸入車站、地址或地點名稱。中文只適用於已知車站 (例如 伊頻),其他請用英文 (例如 Eastwood)。</div>
    <div class="bar"><input type="text" id="q" placeholder="例如 伊頻 / Eastwood" autocomplete="off"></div>
    <div class="bar"><button class="btn primary" data-search>🔍 搜尋</button></div>
    <div id="results"></div>`);
  $app.querySelector('[data-back]').onclick = () => showPicker(kind);
  const input = $app.querySelector('#q');
  const go = async () => {
    const box = $app.querySelector('#results');
    const text = input.value.trim();
    if (!text) return;
    let places = [];
    if (/[\u3400-\u9fff]/.test(text)) {
      places = localChineseMatches(text);
      if (!places.length) {
        box.innerHTML = '<div class="msg">找不到這個中文名稱。請改用英文輸入 (例如 Eastwood)。</div>';
        return;
      }
    } else {
      box.innerHTML = '<div class="msg">搜尋中…</div>';
      try {
        places = (await searchPlaces(text)).map((l) => {
          const zh = zhOf(l.name) ? withStation(zhOf(l.name), /Station/i.test(l.name)) : '';
          return { zh, en: l.disassembledName || baseName(l.name), query: l.name, ref: refFromLocation(l), full: l.name };
        });
      } catch (e) {
        box.innerHTML = `<div class="err">無法連接伺服器 (${esc(e.message)})</div>`;
        return;
      }
      if (!places.length) { box.innerHTML = '<div class="msg">找不到</div>'; return; }
    }
    box.innerHTML = places.map((pl, i) => `<button class="result" data-pick="${i}">
      ${pl.zh ? `${esc(pl.zh)} <span class="en">${esc(pl.en)}</span>` : esc(pl.en)}
      <div class="small">${esc(pl.full || pl.query)}</div></button>`).join('');
    box.querySelectorAll('[data-pick]').forEach((b) => b.onclick = () => {
      const { full, ...place } = places[+b.dataset.pick];
      setChoice(kind, { ...place, searched: true });
    });
  };
  $app.querySelector('[data-search]').onclick = go;
  input.onkeydown = (e) => { if (e.key === 'Enter') go(); };
  input.focus();
}

function showAddPlace(isHome) {
  state.screen = 'add';
  render(`<button class="back" data-back>← 返回</button>
    <h1>${isHome ? '設定住址' : '新增地點'}</h1>
    <div class="small">請用英文輸入地址、車站或地點名稱 (Type an address, station or place in English)</div>
    <div class="bar"><input type="text" id="q" placeholder="e.g. 1 Walker St Rhodes" autocomplete="off"></div>
    <div class="bar"><button class="btn primary" data-search>🔍 搜尋</button></div>
    <div id="results"></div>`);
  $app.querySelector('[data-back]').onclick = showSettings;
  const input = $app.querySelector('#q');
  const go = async () => {
    const box = $app.querySelector('#results');
    const text = input.value.trim();
    if (!text) return;
    box.innerHTML = '<div class="msg">搜尋中…</div>';
    try {
      const found = await searchPlaces(text);
      if (!found.length) { box.innerHTML = '<div class="msg">找不到</div>'; return; }
      box.innerHTML = found.map((l, i) => `<button class="result" data-pick="${i}">
        ${placeLabel(l.name)}<div class="small">${esc(l.name)}</div></button>`).join('');
      box.querySelectorAll('[data-pick]').forEach((b) => b.onclick = () => {
        const loc = found[+b.dataset.pick];
        const en = loc.disassembledName || baseName(loc.name);
        const ref = refFromLocation(loc);
        if (isHome) {
          settings.home = { zh: '家', en: 'Home', query: loc.name, ref };
        } else {
          const guess = zhOf(loc.name) ? withStation(zhOf(loc.name), /Station/i.test(loc.name)) : '';
          const zh = prompt('輸入中文名稱 (可留空)', guess);
          if (zh === null) return;
          settings.places.push({ zh: zh.trim(), en, query: loc.name, ref });
        }
        saveSettings();
        showSettings();
      });
    } catch (e) {
      box.innerHTML = `<div class="err">無法連接伺服器 (${esc(e.message)})</div>`;
    }
  };
  $app.querySelector('[data-search]').onclick = go;
  input.onkeydown = (e) => { if (e.key === 'Enter') go(); };
  input.focus();
}

// Safety net: if something unexpected goes wrong, offer a clear way back instead of a frozen screen.
function showOops() {
  if (document.getElementById('oops')) return;
  const bar = document.createElement('button');
  bar.id = 'oops';
  bar.className = 'oops';
  bar.textContent = '出了點問題 — 按此重新開始';
  bar.onclick = () => location.reload();
  document.body.appendChild(bar);
}
window.addEventListener('error', showOops);
window.addEventListener('unhandledrejection', showOops);


showHome();
