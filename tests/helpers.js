// Shared test setup. Serves the app from this repository, fakes Transport for NSW (through the Worker
// address in config.js), OpenStreetMap and the translation service, and collects pass/fail checks.
// Nothing here touches the real services, so the tests run anywhere without keys.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

// APP_ROOT=<folder> tests another copy of the app (e.g. an older version) with these same tests
const ROOT = process.env.APP_ROOT ? path.resolve(process.env.APP_ROOT) : path.join(__dirname, '..');
const WORKER_URL = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8').match(/WORKER_URL\s*=\s*'([^']+)'/)[1];

// ---------- results ----------
function makeChecker(file) {
  const results = [];
  const check = (ok, label) => {
    results.push({ ok: !!ok, label });
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
  };
  return { check, results, file };
}

// ---------- static server for the app (random free port) ----------
function serve() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
  const srv = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, p === '/' ? 'index.html' : p);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((ok) => srv.listen(0, () => ok({ url: `http://localhost:${srv.address().port}/`, close: () => srv.close() })));
}

// ---------- Sydney time ----------
function sydParts(ms) {
  const p = {};
  new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
  return p;
}
// itdDate 'YYYYMMDD' + itdTime 'HHMM' (Sydney) -> ms
function sydMs(ymd, hm) {
  const want = Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8), +hm.slice(0, 2), +hm.slice(2, 4));
  let t = want;
  for (let k = 0; k < 2; k++) { const p = sydParts(t); t += want - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute); }
  return t;
}
// '下午 4:30' style label as the app shows it
function sydLabel(ms) {
  const p = sydParts(ms); const h = +p.hour;
  const part = h < 5 ? '凌晨' : h < 7 ? '清晨' : h < 12 ? '早上' : h === 12 ? '中午' : h < 18 ? '下午' : '晚上';
  return `${part} ${h % 12 || 12}:${p.minute}`;
}

// ---------- fake trips ----------
// Rhodes -> Burwood on the T9 (or a bus), stops 5 minutes apart. Real-ish coordinates [lat, lon].
const STOPS = [
  ['Rhodes Station, Platform 2, Rhodes', [-33.8306, 151.0872]],
  ['Concord West Station, Platform 2, Concord West', [-33.8476, 151.0861]],
  ['North Strathfield Station, Platform 2, North Strathfield', [-33.8594, 151.0880]],
  ['Strathfield Station, Platform 4, Strathfield', [-33.8718, 151.0943]],
  ['Burwood Station, Platform 2, Burwood', [-33.8771, 151.1040]],
];
const MIN = 60000;
const iso = (ms) => new Date(ms).toISOString();
// One journey whose train/bus leaves the first stop at `ride` (ms).
// opts: walk (10-min walk from home first), line ('T9'), cls (1 train, 5 bus), notices ([{subtitle, content, priority}]),
//       late (minutes of delay, live), arriveExtra (minutes added to the final arrival: a different connection),
//       gap (minutes between stops, default 5)
function journey(ride, opts = {}) {
  const { walk = true, line = 'T9', cls = 1, notices = [], late = 0, arriveExtra = 0, gap = 5 } = opts;
  const est = (ms) => (late ? iso(ms + late * MIN) : undefined);
  const legs = [];
  if (walk) {
    legs.push({ duration: 600, transportation: { product: { class: 100 } },
      origin: { name: 'Home', departureTimePlanned: iso(ride - 10 * MIN) },
      destination: { name: STOPS[0][0], coord: STOPS[0][1], arrivalTimePlanned: iso(ride - MIN) } });
  }
  const end = ride + 4 * gap * MIN + arriveExtra * MIN;
  legs.push({ duration: (end - ride) / 1000,
    transportation: { disassembledName: line, number: line, product: { class: cls }, destination: { name: 'Hornsby via Strathfield' } },
    origin: { name: STOPS[0][0], coord: STOPS[0][1], departureTimePlanned: iso(ride), departureTimeEstimated: est(ride) },
    destination: { name: STOPS[4][0], coord: STOPS[4][1], arrivalTimePlanned: iso(end), arrivalTimeEstimated: est(end) },
    stopSequence: STOPS.map(([name, coord], k) => ({ name, disassembledName: name.split(',')[0], coord,
      arrivalTimePlanned: iso(ride + k * gap * MIN), arrivalTimeEstimated: est(ride + k * gap * MIN) })),
    infos: notices });
  if (walk) {
    legs.push({ duration: 180, transportation: { product: { class: 100 } },
      origin: { name: STOPS[4][0], departureTimePlanned: iso(end) },
      destination: { name: 'Burwood', coord: STOPS[4][1], arrivalTimePlanned: iso(end + 3 * MIN) } });
  }
  return { legs };
}
// Fake Transport for NSW trip planner: a service every `every` minutes (at :03 past the grid), answering
// like the real one: leave-at = the next 8 trips from the asked time, arrive-by = the last 8 arriving by then.
// state.calls records each request; state.offline makes trip requests fail; state.lag delays answers (ms);
// state.extra(T, arrive) can add journeys; state.empty answers with no trips. Each search asks twice (fastest, and
// routeType=leastwalking, recorded as calls[].less); state.lessWalk(T, arrive, rides) answers the second one
// differently, state.lessFail makes it fail. state.refuse = n: the next n trip requests get 429 (too many).
function tripApi(opts = {}) {
  const state = { calls: [], offline: false, lag: opts.lag || 0, every: opts.every || 15, extra: opts.extra || null, opts };
  const handler = (route) => {
    const u = new URL(route.request().url());
    const q = u.searchParams;
    const T = sydMs(q.get('itdDate'), q.get('itdTime'));
    const arrive = q.get('depArrMacro') === 'arr';
    const less = q.get('routeType') === 'leastwalking';
    state.calls.push({ T, arrive, less });
    if (state.offline) return route.abort();
    if (less && state.lessFail) return route.fulfill({ status: 429, body: 'Too many requests' }).catch(() => {});
    if (state.refuse > 0) { state.refuse -= 1; return route.fulfill({ status: 429, body: 'Too many requests' }).catch(() => {}); }
    const G = state.every * MIN, OFF = 3 * MIN;
    const lead = (opts.walk === false ? 0 : 10 * MIN);
    const total = 4 * (opts.gap || 5) * MIN + (opts.walk === false ? 0 : 3 * MIN);
    const rides = [];
    if (!arrive) {
      const first = Math.ceil((T + lead - OFF) / G) * G + OFF;
      for (let k = 0; k < 8; k++) rides.push(first + k * G);
    } else {
      const last = Math.floor((T - total - OFF) / G) * G + OFF;
      for (let k = 7; k >= 0; k--) rides.push(last - k * G);
    }
    const js = state.empty ? [] : rides.map((r) => journey(r, opts));
    // opts.alt: each train also has a second trip with a different connection (arrives opts.alt minutes later)
    if (opts.alt && !state.empty) js.push(...rides.map((r) => journey(r, { ...opts, arriveExtra: opts.alt })));
    if (state.extra) js.push(...state.extra(T, arrive));
    // The least-walking request answers the same trips unless state.lessWalk(T, arrive, rides) gives others
    if (less && state.lessWalk) { js.length = 0; js.push(...state.lessWalk(T, arrive, rides)); }
    const reply = () => route.fulfill({ json: { journeys: js } }).catch(() => {});
    return state.lag ? new Promise((ok) => setTimeout(() => ok(reply()), state.lag)) : reply();
  };
  return { state, handler };
}

// ---------- browser ----------
// opts: api (tripApi options), width, places (stop_finder results), translate (fn text -> zh),
//       aiPlace (fn text -> the Worker's /place answer; without it /place is "not found" like an old Worker;
//       set t.ai.delay to make it answer slowly),
//       clock (true or a start time in ms: fake clock, still running at normal speed until moved on)
async function open(opts = {}) {
  const server = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: opts.width || 393, height: 852 },
    geolocation: { latitude: -33.8300, longitude: 151.0870, accuracy: 10 }, permissions: ['geolocation'] });
  // Read-aloud: record what would be said instead of speaking
  await ctx.addInitScript(() => {
    window.__said = [];
    const ss = { getVoices: () => window.__voices || [], speak: (u) => window.__said.push(u.text), cancel: () => { window.__cancelled = (window.__cancelled || 0) + 1; }, onvoiceschanged: null };
    Object.defineProperty(window, 'speechSynthesis', { value: ss, configurable: true });
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => (d.type() === 'prompt' ? d.accept(opts.promptAnswer ?? '') : d.accept()));
  const api = tripApi(opts.api || {});
  const osm = { calls: 0 };
  const ai = { placeCalls: [] };
  await page.route('https://nominatim.openstreetmap.org/**', (r) => {
    osm.calls += 1;
    const lat = +new URL(r.request().url()).searchParams.get('lat');
    return r.fulfill({ json: { address: lat > -33.833 ? { suburb: 'Rhodes', road: 'Shoreline Drive' } : { suburb: 'Concord', road: 'Concord Road' } } });
  });
  await page.route(`${WORKER_URL}/**`, (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.endsWith('/stop_finder')) {
      const name = u.searchParams.get('name_sf') || '';
      const list = opts.places ? opts.places(name) : [{ id: '1', name: `${name}`, type: 'stop', isBest: true, coord: STOPS[4][1] }];
      return route.fulfill({ json: { locations: list } });
    }
    if (u.pathname.endsWith('/translate')) {
      const text = u.searchParams.get('text') || '';
      return route.fulfill({ json: { zh: opts.translate ? opts.translate(text) : `中文:${text}` } });
    }
    if (u.pathname.endsWith('/place')) {
      const text = u.searchParams.get('text') || '';
      ai.placeCalls.push(text);
      if (!opts.aiPlace) return route.fulfill({ status: 404, body: '' });
      const answer = opts.aiPlace(text);
      const reply = () => (answer ? route.fulfill({ json: answer }) : route.fulfill({ status: 502, json: { error: 'translation failed' } })).catch(() => {});
      return ai.delay ? new Promise((ok) => setTimeout(() => ok(reply()), ai.delay)) : reply();
    }
    if (u.pathname.endsWith('/trip')) return api.handler(route);
    return route.fulfill({ status: 404, body: '' });
  });
  if (opts.clock) await page.clock.install(opts.clock === true ? {} : { time: opts.clock });
  await page.goto(server.url);
  const close = async () => { await browser.close(); server.close(); };
  return { page, ctx, api: api.state, osm, ai, errors, close };
}

// Common steps
async function chooseTo(page, label) { await page.click('[data-row=to]'); await page.click(`.picklist button:has-text("${label}")`); }
async function chooseFrom(page, label) { await page.click('[data-row=from]'); await page.click(`.picklist button:has-text("${label}")`); }
async function search(page) { await page.click('[data-search-trip]'); await page.waitForSelector('.card[data-j]', { timeout: 10000 }); }
// 設定 opens after a 2-second hold
async function openSettings(page) {
  await page.locator('[data-settings]').dispatchEvent('pointerdown');
  await page.waitForSelector('h1:has-text("設定")', { timeout: 5000 });
}
// Drag the ☰ handle of row `from` to the middle of row `to` (settings list)
async function dragRow(page, from, to) {
  const g = await page.locator('.places .row').nth(from).locator('[data-grip]').boundingBox();
  const t = await page.locator('.places .row').nth(to).boundingBox();
  const x = g.x + g.width / 2, y0 = g.y + g.height / 2, y1 = t.y + t.height / 2 + (to > from ? 6 : -6);
  await page.mouse.move(x, y0); await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(x, y0 + ((y1 - y0) * k) / 8);
  await page.mouse.up();
  await page.waitForTimeout(100);
}
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

module.exports = { open, makeChecker, journey, tripApi, STOPS, MIN, sydParts, sydMs, sydLabel, chooseTo, chooseFrom, search, noOverflow, openSettings, dragRow, WORKER_URL };
