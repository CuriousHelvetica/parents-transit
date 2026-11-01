'use strict';

// ---------- Storage (everything personal stays on this phone) ----------
const STORE_KEY = 'parents-transit-v1';
const TR_KEY = 'parents-transit-translations-v3';

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.home && Array.isArray(s.places)) return s;
  } catch (e) { /* fall through to defaults */ }
  return { home: { ...DEFAULT_HOME }, places: DEFAULT_PLACES.map((p) => ({ ...p })), remindBefore: 10 };
}
function saveSettings() { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); }

let settings = loadSettings();
// when: { mode: 'now' } or { mode: 'later', date: 'YYYY-MM-DD', time: 'HH:MM', arrive: bool }
let state = { from: 'home', screen: 'home', when: { mode: 'now' } };
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
// 13, '05' -> '下午 1:05'; 0, '30' -> '上午 12:30'; 12, '00' -> '下午 12:00'
function fmt12(h, mm) {
  return `${h < 12 ? '上午' : '下午'} ${h % 12 || 12}:${mm}`;
}
// '09:30' (from the time picker) -> '上午 9:30'
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
    return { key: en, en };
  }).filter((n) => n.en && !seen.has(n.key) && seen.add(n.key)).slice(0, 3);
}

// ---------- API (through the Cloudflare Worker) ----------
async function api(endpoint, params) {
  const q = new URLSearchParams({ outputFormat: 'rapidJSON', coordOutputFormat: 'EPSG:4326', version: '10.2.1.42', ...params });
  const res = await fetch(`${WORKER_URL}/tp/${endpoint}?${q}`);
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
    pendingTr[text] = fetch(`${WORKER_URL}/translate?${new URLSearchParams({ text: masked })}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const zh = d && d.zh ? restorePlaces(d.zh, places) : null;
        if (zh) {
          translations[text] = zh;
          const keys = Object.keys(translations);
          if (keys.length > 150) keys.slice(0, keys.length - 150).forEach((k) => delete translations[k]);
          localStorage.setItem(TR_KEY, JSON.stringify(translations));
        }
        return zh || null;
      })
      .catch(() => null)
      .finally(() => { delete pendingTr[text]; });
  }
  return pendingTr[text];
}
function noticeHtml(n) {
  const zh = translations[n.key];
  return `<div class="notice" data-notice="${esc(n.key)}">⚠️ <b>服務通知</b>:
    ${zh ? esc(zh) : '<span class="small">翻譯中…</span>'}
    <details><summary class="small">英文原文</summary><div class="small">${esc(n.en)}</div></details></div>`;
}
// Fill in translations after the page is drawn.
function fillNotices() {
  $app.querySelectorAll('[data-notice]').forEach((el) => {
    const key = el.dataset.notice;
    if (translations[key]) return;
    translate(key).then((zh) => {
      if (!el.isConnected) return;
      const open = el.querySelector('details') && el.querySelector('details').open;
      el.outerHTML = zh ? noticeHtml({ key, en: key }) : noticeHtml({ key, en: key }).replace('翻譯中…', '暫時無法翻譯,請看英文原文');
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

function showHome() {
  clearTimers();
  state.screen = 'home';
  const now = new Date();
  const fromHome = state.from === 'home';
  const w = state.when;
  let buttons = settings.places.map((pl, i) =>
    `<button class="place" data-go="${i}">${esc(pl.zh || pl.en)}<span class="en">${esc(pl.en || '')}</span></button>`).join('');
  if (!fromHome) {
    buttons = `<button class="place home" data-go="home">🏠 回家<span class="en">Home</span></button>` + buttons;
  }
  const dayChips = [0, 1, 2].map((o) => {
    const ymd = sydneyDate(o);
    const [, m, d] = ymd.split('-').map(Number);
    const wd = WEEKDAYS[new Date(Date.UTC(...ymd.split('-').map((x, k) => (k === 1 ? x - 1 : +x)))).getUTCDay()];
    return `<button data-day="${ymd}" class="${w.date === ymd ? 'on' : ''}">${['今天', '明天', '後天'][o]}<br><span class="small">${m}月${d}日<br>星期${wd}</span></button>`;
  }).join('');
  const otherDay = w.mode === 'later' && ![0, 1, 2].some((o) => sydneyDate(o) === w.date);
  const laterHtml = w.mode !== 'later' ? '' : `
    <div class="toggle three">${dayChips}</div>
    <div class="bar"><label class="grow small">或選擇其他日子
      <input type="date" id="otherDate" min="${sydneyDate(0)}" value="${otherDay ? w.date : ''}"></label></div>
    <div class="toggle">
      <button data-arrive="0" class="${w.arrive ? '' : 'on'}">🚶 出發時間</button>
      <button data-arrive="1" class="${w.arrive ? 'on' : ''}">🏁 到達時間</button>
    </div>
    <div class="bar"><input type="time" id="time" value="${w.time}"></div>
    <div class="sub" id="whenSummary">${esc(whenSummary(w))}</div>`;
  render(`
    <h1 class="title">爸媽出行<span class="en">Sydney Trip Planner</span></h1>
    <div class="sub">現在 ${fmtTime(now)}・${dayLabel(sydneyDate(0)).split(' ').slice(1).join(' ')}</div>
    <h2>從哪裡出發?</h2>
    <div class="toggle">
      <button data-from="home" class="${fromHome ? 'on' : ''}">🏠 家</button>
      <button data-from="here" class="${fromHome ? '' : 'on'}">📍 現在位置</button>
    </div>
    <h2>甚麼時候?</h2>
    <div class="toggle">
      <button data-when="now" class="${w.mode === 'now' ? 'on' : ''}">⏱️ 現在</button>
      <button data-when="later" class="${w.mode === 'later' ? 'on' : ''}">📅 預先計劃</button>
    </div>
    ${laterHtml}
    <h2>去哪裡?</h2>
    <div class="grid">${buttons}</div>
    <div class="bar"><button class="btn other" data-other>🔍 其他地點<span class="en">Other places</span></button></div>
    <div class="bar"><button class="btn" data-settings>⚙️ 設定</button></div>
  `, true);
  $app.querySelectorAll('[data-from]').forEach((b) => b.onclick = () => { state.from = b.dataset.from; showHome(); });
  $app.querySelectorAll('[data-when]').forEach((b) => b.onclick = () => {
    if (b.dataset.when === 'now') state.when = { mode: 'now' };
    else if (state.when.mode !== 'later') {
      // Default: tomorrow, next round hour from now
      const p = sydneyParts(new Date());
      state.when = { mode: 'later', date: sydneyDate(1), time: `${String((+p.hour + 1) % 24).padStart(2, '0')}:00`, arrive: false };
    }
    showHome();
  });
  $app.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => { state.when.date = b.dataset.day; showHome(); });
  $app.querySelectorAll('[data-arrive]').forEach((b) => b.onclick = () => { state.when.arrive = b.dataset.arrive === '1'; showHome(); });
  // iPhone fires a change on every turn of the picker wheel, so only record the value here and
  // update the summary line; redrawing the screen would close the picker before it's confirmed.
  const updateSummary = () => { $app.querySelector('#whenSummary').textContent = whenSummary(state.when); };
  const other = $app.querySelector('#otherDate');
  if (other) {
    other.onchange = () => { if (other.value) { state.when.date = other.value; updateSummary(); } };
    other.onblur = () => showHome();   // after the picker closes: refresh the 今天/明天/後天 highlight
  }
  const time = $app.querySelector('#time');
  if (time) time.onchange = () => { if (time.value) { state.when.time = time.value; updateSummary(); } };
  $app.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => {
    const dest = b.dataset.go === 'home' ? settings.home : settings.places[+b.dataset.go];
    showTrips(fromHome ? settings.home : 'here', dest, { ...state.when });
  });
  $app.querySelector('[data-other]').onclick = showSearchTrip;
  $app.querySelector('[data-settings]').onclick = showSettings;
}

// opts.oneOff: a place found with 🔍 其他地點 (not one of the saved buttons)
async function showTrips(originPlace, destPlace, when, opts = {}) {
  clearTimers();
  state.screen = 'trips';
  const fromLabel = originPlace === 'here' ? '📍 現在位置' : esc(originPlace.zh || originPlace.en);
  const toLabel = esc(destPlace.zh || destPlace.en);
  const isSaved = () => settings.places.some((p) => p.query === destPlace.query);
  const saveBtn = () => (!opts.oneOff ? '' : isSaved()
    ? '<div class="sub ontime">✓ 已加到常去地點</div>'
    : '<div class="bar"><button class="btn" data-save>⭐ 加到常去地點</button></div>');
  const headerHtml = () => `<button class="back" data-back>← 返回</button>
    <h1>${fromLabel} → ${toLabel}</h1>
    <div class="when">${esc(whenSummary(when))}</div>${saveBtn()}`;
  let header = headerHtml();
  const wireSave = () => {
    const b = $app.querySelector('[data-save]');
    if (b) b.onclick = () => {
      settings.places.push({ ...destPlace });
      saveSettings();
      header = headerHtml();
      b.parentElement.outerHTML = '<div class="sub ontime">✓ 已加到常去地點</div>';
    };
  };
  render(header + `<div class="msg">正在搜尋路線…</div>`);
  $app.querySelector('[data-back]').onclick = showHome;
  wireSave();

  let origin, dest;
  try {
    origin = originPlace === 'here' ? await currentPosition() : await resolvePlace(originPlace);
    dest = await resolvePlace(destPlace);
  } catch (e) {
    return showError(header, e.message);
  }

  let journeys = null;
  const draw = () => {
    if (state.screen !== 'trips' || !journeys) return;
    const uber = when.mode === 'now' ? uberBlock(destPlace, journeys) : '';
    if (!journeys.length) return showError(header, '找不到路線。請改一下時間,或稍後再試。', uber);
    const sort = settings.sort || 'changes';
    const sorted = sortJourneys(journeys, sort, when);
    render(header + `<div class="toggle sort">
        <button data-sort="changes" class="${sort === 'changes' ? 'on' : ''}">🔁 最少轉車</button>
        <button data-sort="fast" class="${sort === 'fast' ? 'on' : ''}">⚡ 最快</button>
      </div>
      <div class="sub">更新時間 ${fmtTime(new Date())}・自動更新</div>` +
      sorted.map((j, i) => journeyCard(j, i)).join('') + uber, true);
    $app.querySelector('[data-back]').onclick = showHome;
    $app.querySelectorAll('[data-sort]').forEach((b) => b.onclick = () => {
      settings.sort = b.dataset.sort; saveSettings(); draw();
    });
    wireSave();
    $app.querySelectorAll('[data-j]').forEach((b) => b.onclick = () =>
      showJourney(sorted[+b.dataset.j], () => showTrips(originPlace, destPlace, when, opts), when.mode === 'now'));
  };
  const load = async () => {
    try {
      // Hide trips that left more than a minute ago
      journeys = (await planTrip(origin, dest, when)).filter((j) => minutesUntil(depTime(j.legs[0].origin)) >= -1);
      draw();
    } catch (e) {
      if (!journeys) showError(header, '無法連接伺服器,請檢查網絡。(' + e.message + ')');
    }
  };
  await load();
  // Live times matter for trips leaving soon; planned trips change less often.
  timers.push(setInterval(load, when.mode === 'now' ? 60000 : 300000));
  timers.push(setInterval(draw, 15000));
}

function changesOf(j) { return Math.max(0, j.legs.filter((l) => !modeOf(l).walk).length - 1); }

// 'fast': arrive earliest (or, for arrive-by searches, leave latest).
// 'changes': fewest changes first, then fastest. Nothing is removed.
function sortJourneys(journeys, sort, when) {
  const arriveBy = when.mode === 'later' && when.arrive;
  const fast = (a, b) => (arriveBy
    ? depTime(b.legs[0].origin) - depTime(a.legs[0].origin)
    : arrTime(a.legs[a.legs.length - 1].destination) - arrTime(b.legs[b.legs.length - 1].destination));
  return journeys.slice().sort((a, b) => (sort === 'changes' ? changesOf(a) - changesOf(b) : 0) || fast(a, b));
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
function uberBlock(destPlace, journeys) {
  return `<a class="btn uber" href="${esc(uberLink(destPlace, journeys))}" target="_blank" rel="noopener">
    🚕 改搭 Uber? 查看價錢
    <span class="small">會打開 Uber app,起點用你現在的位置,目的地已經填好。按確認才會叫車。</span></a>`;
}

function showError(header, text, extra = '') {
  render(header + `<div class="err">${esc(text)}</div>
    <div class="bar"><button class="btn primary" data-retry>重試</button></div>${extra}`);
  $app.querySelector('[data-back]').onclick = showHome;
  $app.querySelector('[data-retry]').onclick = () => location.reload();
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
  const hasNotice = j.legs.some((l) => noticesOf(l).length);
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
    ${hasNotice ? '<div class="sub late">⚠️ 有服務通知,請按入查看</div>' : ''}
    <div class="lines">${badges}</div>
  </button>`;
}

// Turn the journey into plain steps, each with screen text and spoken text.
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
      detail: `在 ${placeLabel(leg.origin.name)} 上車` +
        (plat ? `,<b>${esc(plat.zh)}</b> <span class="en">${esc(plat.en)}</span>` : '') +
        (m.key === 'bus' && streetOf(leg.origin.name) ? `<br><span class="en">${esc(streetOf(leg.origin.name))}</span>` : '') +
        (towards ? `<br>往 ${directionLabel(towards)} 方向` : '') +
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

// live: trip leaves now, so walking directions from the phone's location make sense
function showJourney(j, goBack, live) {
  clearTimers();
  state.screen = 'journey';
  const leave = depTime(j.legs[0].origin);
  const arrive = arrTime(j.legs[j.legs.length - 1].destination);
  const steps = journeySteps(j);
  // Read only the trip steps, not the service notices.
  const sayText = () => steps.map((s) => s.say).join(' ');
  const draw = (keepScroll) => {
    const lt = leaveText(leave);
    render(`<button class="back" data-back>← 返回</button>
      <div class="card">
        <div class="leave ${lt.cls}">${lt.text}</div>
        <div class="times">${dayLabel(ymdOf(leave))}</div>
        <div class="times">${fmtTime(leave)} 出發 → ${fmtTime(arrive)} 到達</div>
      </div>
      <div class="bar">
        <button class="btn" data-say>🔊 朗讀</button>
        <button class="btn" data-remind>⏰ 提醒我</button>
      </div>
      <div class="card">${steps.map((s) => `<div class="step"><div class="icon">${s.icon}</div>
        <div><div class="what">${s.what}</div><div class="detail">${s.detail}</div>${s.debug || ''}
        ${live && s.map ? `<a class="maplink" href="${esc(s.map)}" target="_blank" rel="noopener">🗺️ 地圖指路</a>` : ''}
        ${s.stopList || ''}
        ${live && s.leg && canTrack(s.leg) ? `<button class="btn track" data-track="${steps.indexOf(s)}">📍 上車後按這裡:還有幾個站</button>` : ''}
        ${(s.notices || []).map(noticeHtml).join('')}</div></div>`).join('')}
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
    $app.querySelector('[data-remind]').onclick = () => remind(j, steps);
    $app.querySelectorAll('[data-track]').forEach((b) => b.onclick = () =>
      showTracking(steps[+b.dataset.track].leg, () => showJourney(j, goBack, live)));
    fillNotices();
  };
  draw(false);
  // Redraw only the countdown, so open notices stay open.
  timers.push(setInterval(() => {
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
// Highest stop index the bus has reached or gone past, given the current position.
// accuracy = GPS accuracy in metres: the "near the stop" circle grows when GPS is less precise.
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
function showTracking(leg, goBack) {
  clearTimers();
  state.screen = 'tracking';
  const m = modeOf(leg);
  const list = rideStops(leg);
  const target = list.length - 1;
  let passed = 0, watchId = null, wake = null, lastFix = null;
  function startWatch() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = navigator.geolocation.watchPosition(onPosition, () => { lastFix = null; draw(); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }
  function onPosition(p) {
    if (state.screen !== 'tracking') return;
    lastFix = p.coords.accuracy;
    if (lastFix <= WORST_USABLE_ACCURACY) {
      passed = stopsPassed(list, [p.coords.latitude, p.coords.longitude], passed, lastFix);
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
      <div class="track-head">乘搭 <span class="badge m-${m.key}">${esc(lineName(leg))}</span> ${m.zh}</div>
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
function cantoneseVoice() {
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => /zh[-_]HK/i.test(v.lang)) || voices.find((v) => /yue/i.test(v.lang)) || null;
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
  speechSynthesis.speak(u);
}
function isSpeaking() { return speakDone !== null; }
function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (speakDone) speakDone();
}
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};

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
    <h2>出門提醒</h2>
    <div class="toggle three">${[5, 10, 15].map((n) =>
      `<button data-before="${n}" class="${settings.remindBefore === n ? 'on' : ''}">提前 ${n} 分鐘</button>`).join('')}</div>
    <h2>朗讀</h2>
    <div class="bar"><button class="btn" data-testvoice>🔊 試聽廣東話</button></div>
    <div class="small">如果不是廣東話,請參閱設定說明。</div>
    <div class="bar"><button class="btn danger" data-reset>還原預設</button></div>`);
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
    if (confirm('還原所有設定?')) { localStorage.removeItem(STORE_KEY); settings = loadSettings(); showSettings(); }
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
function showSearchTrip() {
  clearTimers();
  state.screen = 'search';
  render(`<button class="back" data-back>← 返回</button>
    <h1>去其他地點</h1>
    <div class="when">${esc(state.from === 'home' ? '由 家' : '由 現在位置')}・${esc(whenSummary(state.when))}</div>
    <div class="small">輸入車站、地址或地點名稱。中文只適用於已知車站 (例如 伊頻),其他請用英文 (例如 Eastwood)。</div>
    <div class="bar"><input type="text" id="q" placeholder="例如 伊頻 / Eastwood" autocomplete="off"></div>
    <div class="bar"><button class="btn primary" data-search>🔍 搜尋</button></div>
    <div id="results"></div>`);
  $app.querySelector('[data-back]').onclick = showHome;
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
      const { full, ...dest } = places[+b.dataset.pick];
      showTrips(state.from === 'home' ? settings.home : 'here', dest, { ...state.when }, { oneOff: true });
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

showHome();
