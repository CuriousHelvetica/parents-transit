'use strict';

// ---------- Storage (everything personal stays on this phone) ----------
const STORE_KEY = 'parents-transit-v1';
const TR_KEY = 'parents-transit-translations-v2';

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
  return p.hour + ':' + p.minute;
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
function protectPlaces(en) {
  const places = [];
  let text = en;
  PLACE_KEYS.forEach((name) => {
    text = text.replace(new RegExp(`\\b${reEscape(name)}(\\s+Station)?\\b`, 'g'), (m, st) => {
      places.push(`${withStation(ZH_NAMES[name], !!st)} ${name}`);
      return `[[${places.length}]]`;
    });
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
// For read-aloud: say only the Chinese name.
function speakable(text) {
  let out = text;
  PLACE_KEYS.forEach((name) => {
    out = out.replace(new RegExp(`(${reEscape(ZH_NAMES[name])}站?) ${reEscape(name)}\\b`, 'g'), '$1');
  });
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
  return `${dayLabel(when.date)} ${when.time} ${when.arrive ? '前到達' : '出發'}`;
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
    <div class="sub">${esc(whenSummary(w))}</div>`;
  render(`
    <h1>出行 <span class="en">Sydney</span></h1>
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
  const other = $app.querySelector('#otherDate');
  if (other) other.onchange = () => { if (other.value) { state.when.date = other.value; showHome(); } };
  const time = $app.querySelector('#time');
  if (time) time.onchange = () => { if (time.value) { state.when.time = time.value; showHome(); } };
  $app.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => {
    const dest = b.dataset.go === 'home' ? settings.home : settings.places[+b.dataset.go];
    showTrips(fromHome ? settings.home : 'here', dest, { ...state.when });
  });
  $app.querySelector('[data-settings]').onclick = showSettings;
}

async function showTrips(originPlace, destPlace, when) {
  clearTimers();
  state.screen = 'trips';
  const fromLabel = originPlace === 'here' ? '📍 現在位置' : esc(originPlace.zh || originPlace.en);
  const toLabel = esc(destPlace.zh || destPlace.en);
  const header = `<button class="back" data-back>← 返回</button>
    <h1>${fromLabel} → ${toLabel}</h1>
    <div class="when">${esc(whenSummary(when))}</div>`;
  render(header + `<div class="msg">正在搜尋路線…</div>`);
  $app.querySelector('[data-back]').onclick = showHome;

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
    if (!journeys.length) return showError(header, '找不到路線。請改一下時間,或稍後再試。');
    const sort = settings.sort || 'changes';
    const sorted = sortJourneys(journeys, sort, when);
    render(header + `<div class="toggle sort">
        <button data-sort="changes" class="${sort === 'changes' ? 'on' : ''}">🔁 最少轉車</button>
        <button data-sort="fast" class="${sort === 'fast' ? 'on' : ''}">⚡ 最快</button>
      </div>
      <div class="sub">更新時間 ${fmtTime(new Date())}・自動更新</div>` +
      sorted.map((j, i) => journeyCard(j, i)).join(''), true);
    $app.querySelector('[data-back]').onclick = showHome;
    $app.querySelectorAll('[data-sort]').forEach((b) => b.onclick = () => {
      settings.sort = b.dataset.sort; saveSettings(); draw();
    });
    $app.querySelectorAll('[data-j]').forEach((b) => b.onclick = () =>
      showJourney(sorted[+b.dataset.j], () => showTrips(originPlace, destPlace, when)));
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

function showError(header, text) {
  render(header + `<div class="err">${esc(text)}</div>
    <div class="bar"><button class="btn primary" data-retry>重試</button></div>`);
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
    if (d != null) delay = d > 0 ? `・<span class="late">第一程車延誤 ${d} 分鐘</span>` : `・<span class="ontime">準時</span>`;
  }
  const hasNotice = j.legs.some((l) => noticesOf(l).length);
  const badges = j.legs.map((l) => {
    const m = modeOf(l);
    if (m.walk) return `<span class="badge m-walk">🚶${Math.max(1, Math.round((l.duration || 0) / 60))}'</span>`;
    return `<span class="badge m-${m.key}">${m.icon} ${esc(lineName(l))}</span>`;
  }).join(' › ');
  return `<button class="card tap" data-j="${i}">
    <div class="leave ${lt.cls}">${lt.text}</div>
    <div class="times">${fmtTime(leave)} 出發 → ${fmtTime(arrive)} 到達 (${total} 分鐘)</div>
    <div class="sub">${changes ? `轉車 ${changes} 次` : '不用轉車'} ${delay}</div>
    ${hasNotice ? '<div class="sub late">⚠️ 有服務通知,請按入查看</div>' : ''}
    <div class="lines">${badges}</div>
  </button>`;
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
        (towards ? `<br>往 ${placeLabel(towards)} 方向` : '') +
        (stops ? `<br>共 ${stops} 個站` : ''),
      notices,
      say: `${fmtTime(dep)},在${speakName(leg.origin.name)}` + (plat ? `${plat.zh}` : '') +
        `,乘搭${line}${m.zh}` + (towards ? `,往${speakName(towards)}方向` : '') +
        (stops ? `,共${stops}個站` : '') + '。',
    });
    const arr = arrTime(leg.destination);
    const isLastRide = !j.legs.slice(i + 1).some((l) => !modeOf(l).walk);
    steps.push({
      icon: '🛑',
      what: `${fmtTime(arr)} 在 ${placeLabel(leg.destination.name)} 下車`,
      detail: isLastRide ? '' : '然後轉車',
      say: `${fmtTime(arr)},在${speakName(leg.destination.name)}下車` + (isLastRide ? '。' : ',然後轉車。'),
    });
  });
  return steps;
}

function showJourney(j, goBack) {
  clearTimers();
  state.screen = 'journey';
  const leave = depTime(j.legs[0].origin);
  const arrive = arrTime(j.legs[j.legs.length - 1].destination);
  const steps = journeySteps(j);
  const sayText = () => steps.map((s) => s.say +
    (s.notices || []).map((n) => (translations[n.key] ? `服務通知:${speakable(translations[n.key])}` : '')).join('')).join(' ');
  const draw = (keepScroll) => {
    const lt = leaveText(leave);
    render(`<button class="back" data-back>← 返回</button>
      <div class="card">
        <div class="leave ${lt.cls}">${lt.text}</div>
        <div class="times">${dayLabel(ymdOf(leave))}</div>
        <div class="times">${fmtTime(leave)} 出發 → ${fmtTime(arrive)} 到達</div>
      </div>
      <div class="bar">
        <button class="btn primary" data-say>🔊 朗讀</button>
        <button class="btn" data-remind>⏰ 提醒我</button>
      </div>
      <div class="card">${steps.map((s) => `<div class="step"><div class="icon">${s.icon}</div>
        <div><div class="what">${s.what}</div><div class="detail">${s.detail}</div>${s.debug || ''}
        ${(s.notices || []).map(noticeHtml).join('')}</div></div>`).join('')}
        <div class="step"><div class="icon">🏁</div><div class="what">${fmtTime(arrive)} 到達</div></div>
      </div>`, keepScroll);
    $app.querySelector('[data-back]').onclick = () => { stopSpeaking(); goBack(); };
    $app.querySelector('[data-say]').onclick = () => speak(sayText());
    $app.querySelector('[data-remind]').onclick = () => remind(j, steps);
    fillNotices();
  };
  draw(false);
  // Redraw only the countdown, so open notices stay open.
  timers.push(setInterval(() => {
    const el = $app.querySelector('.leave');
    if (el) { const lt = leaveText(leave); el.className = `leave ${lt.cls}`; el.innerHTML = lt.text; }
  }, 15000));
}

// ---------- Read aloud in Cantonese ----------
function cantoneseVoice() {
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => /zh[-_]HK/i.test(v.lang)) || voices.find((v) => /yue/i.test(v.lang)) || null;
}
function speak(text) {
  if (!('speechSynthesis' in window)) return alert('這部電話不支援朗讀');
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-HK';
  const v = cantoneseVoice();
  if (v) u.voice = v;
  u.rate = 0.9;
  speechSynthesis.speak(u);
}
function stopSpeaking() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
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
