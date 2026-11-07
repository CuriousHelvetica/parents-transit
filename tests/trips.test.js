// The trip list: time order, ◀ 早一點 · ⏱️ 現在 · 遲一點 ▶, 改時間及日期, trips kept in memory, trains that just
// left, the 30-minute rule for live buttons, errors, and the 15-second / back-from-another-app updates.
const { open, chooseTo, chooseFrom, search, sydParts, MIN } = require('./helpers');

const whenx = (page) => page.locator('.whenx').innerText();
const loading = (page) => page.locator('.msg:has-text("正在搜尋")').count();
const minutesOf = (txt) => { const m = txt.match(/(凌晨|清晨|早上|中午|下午|晚上) (\d+):(\d+)/); if (!m) return NaN;
  let h = +m[2] % 12; if (['下午', '晚上'].includes(m[1]) || (m[1] === '中午' && h === 0)) h += 12; if (m[1] === '中午') h = 12; return h * 60 + +m[3]; };

module.exports = async (check) => {
  // ---------- leave now, stepping, memory, plans ----------
  let t = await open();
  let { page } = t;
  await chooseTo(page, '寶活站');
  await search(page);
  check(/現在出發/.test(await whenx(page)), 'opens at 「現在出發」');
  check(await page.locator('[data-step="-1"]').isDisabled() && await page.locator('.tb-mid.on').count() === 1, '◀ 早一點 greyed, ⏱️ 現在 highlighted');
  check(await page.locator('[data-sort]').count() === 0, 'no sort buttons');
  const times = await page.$$eval('.card:not(.departed) .times', (els) => els.map((e) => e.innerText.split('→')[0]));
  const mins = times.map(minutesOf);
  check(mins.length >= 6 && mins.every((m, i) => i === 0 || m >= mins[i - 1] || m < 120), `upcoming trips in time order (${times.length})`);
  await page.click('.card:not(.departed)');
  check((await page.locator('.step .what').first().innerText()).includes('步行 15 分鐘'), 'from 家: 10-minute walk shown as 15 (slower walk)');
  await page.click('[data-back]'); await page.waitForSelector('[data-j]');
  await page.waitForTimeout(1500);   // read-ahead

  // ▶ once: rounded, instant
  const target = Date.now() + 30 * MIN;
  const low = Math.floor(target / (30 * MIN)) * 30 * MIN;
  const exp = sydParts(target - low < 15 * MIN ? low : low + 30 * MIN);
  const label = `${+exp.hour % 12 || 12}:${exp.minute}`;
  await page.click('[data-step="1"]'); await page.waitForTimeout(100);
  check((await whenx(page)).includes(label), `▶: ${await whenx(page)} (expected ${label})`);
  check(await page.locator('[data-j]').count() > 0 && await loading(page) === 0, '▶: trips at once, from memory');
  check(!(await page.locator('[data-step="-1"]').isDisabled()) && await page.locator('.tb-mid.on').count() === 0, '▶: 早一點 active, 現在 not highlighted');
  const first = minutesOf(await page.locator('.card:not(.departed) .times').first().innerText());
  const chosen = +exp.hour * 60 + +exp.minute;
  check(first >= chosen - 5, 'first trip shown leaves at (or just before) the chosen time');
  await page.click('[data-step="1"]'); await page.click('[data-step="1"]'); await page.click('[data-step="1"]');
  await page.waitForTimeout(100);
  check(await loading(page) === 0, '▶ ×3 more, quickly: still instant');
  await page.click('[data-step="-1"]'); await page.waitForTimeout(100);
  check(await loading(page) === 0, '◀: instant');
  await page.click('[data-now]'); await page.waitForTimeout(100);
  check(/現在出發/.test(await whenx(page)) && await page.locator('[data-step="-1"]').isDisabled(), '⏱️ 現在: back to leave now');

  // 改時間及日期
  await page.click('[data-step="1"]'); await page.waitForTimeout(100);
  const keep = await whenx(page);
  await page.click('[data-change]');
  check(await page.locator('[data-arrive="0"].on').count() === 1, 'plan page: 出發 selected by default');
  await page.click('[data-cancel]'); await page.waitForSelector('[data-j]');
  check(await whenx(page) === keep, '✕ 取消: list keeps its time');
  await page.click('[data-change]');
  await page.click('[data-day]:nth-child(2)'); await page.click('[data-arrive="1"]');
  await page.selectOption('[data-hour]', '9'); await page.selectOption('[data-min]', '0');
  check((await page.locator('#whenSummary').innerText()).includes('早上 9:00 前到達'), 'plan page summary updates');
  await page.click('[data-confirm]'); await page.waitForSelector('[data-j]');
  check(/明天 早上 9:00 前到達/.test(await whenx(page)), `✓ 確定: ${await whenx(page)}`);
  const arr = await page.$$eval('[data-j] .times', (els) => els.map((e) => e.innerText.split('→')[1]));
  check(arr.length > 0 && arr.every((x) => minutesOf(x) <= 9 * 60 && minutesOf(x) >= 8 * 60), `arrive-by: only trips arriving 8:00–9:00 (${arr.map((x) => x.trim()).join(', ')})`);
  check(minutesOf(arr[arr.length - 1]) >= 9 * 60 - 15, 'arrive-by: the one arriving just before 9:00 is in the list (last)');
  check(minutesOf(arr[0]) <= minutesOf(arr[arr.length - 1]), 'arrive-by: earliest first');
  await page.waitForTimeout(1500);
  await page.click('[data-step="1"]'); await page.waitForTimeout(100);
  check(/明天 早上 9:30 前到達/.test(await whenx(page)) && await loading(page) === 0, '▶ on an arrive-by plan moves the arrival time, instantly');
  check(await page.locator('.card.departed').count() === 0, 'no 「已開出」 trips on a planned time');
  await page.waitForTimeout(1000);
  const wb = await whenx(page);
  await page.click('[data-j="0"]'); await page.waitForSelector('.step');
  await page.click('[data-back]'); await page.waitForTimeout(150);
  check(await whenx(page) === wb && await page.locator('[data-j]').count() > 0, 'back from trip details: same time, trips at once');

  // Offline on a time not in memory, then 重試
  t.api.offline = true;
  for (let k = 0; k < 14; k++) await page.click('[data-step="1"]');
  await page.waitForSelector('.err', { timeout: 25000 }).catch(() => {});
  check(await page.locator('.err').count() === 1 && await page.locator('.tbar').count() === 1, 'offline: error with 重試, time bar still usable');
  t.api.offline = false;
  await page.click('[data-retry]');
  await page.waitForSelector('[data-j]', { timeout: 5000 }).catch(() => {});
  check(await page.locator('[data-j]').count() > 0, '重試: trips shown');

  // Live buttons: only from 30 minutes before departure
  await page.click('[data-now]'); await page.waitForSelector('.card:not(.departed)');
  check(await page.locator('a.btn.uber').count() === 1, '現在: Uber button active');
  await page.click('.card:not(.departed)'); await page.waitForSelector('.step');
  check(await page.locator('a.maplink').count() > 0 && await page.locator('[data-track]:not([disabled])').count() === 1, 'trip leaving soon: 地圖指路 and 還有幾個站 active');
  await page.click('[data-back]'); await page.waitForSelector('[data-j]');
  for (let k = 0; k < 4; k++) await page.click('[data-step="1"]');
  await page.waitForTimeout(1500);
  check(await page.locator('.btn.uber.off').count() === 1, '2 hours ahead: Uber greyed');
  await page.click('[data-j="0"]'); await page.waitForSelector('.step');
  check(await page.locator('.maplink.off').count() > 0 && await page.locator('.btn.track[disabled]').count() === 1
    && (await page.locator('.offnote').first().innerText()).includes('30 分鐘'), 'trip 2 hours ahead: live buttons greyed with 「出發前 30 分鐘才可使用」');
  check(t.errors.length === 0, `no page errors (${t.errors.join(' | ')})`);
  await t.close();

  // ---------- trains that just left (from a station, slow network) ----------
  t = await open({ api: { walk: false, every: 10, lag: 1500 } });
  page = t.page;
  await chooseFrom(page, '哥頓站'); await chooseTo(page, '雲耶站');
  await search(page);
  const shownAt = Date.now();
  await page.waitForSelector('.card.departed', { timeout: 10000 }).catch(() => {});
  const after = (Date.now() - shownAt) / 1000;
  check(after < 2.5, `「已開出」 trips appear one search after the list (${after.toFixed(1)} s with a 1.5 s network)`);
  const dep = await page.$$eval('.card.departed .leave', (els) => els.map((e) => e.innerText));
  const agos = dep.map((x) => +((x.match(/(\d+) 分鐘/) || [0, 0])[1]));
  check(dep.length >= 1 && dep.length <= 3 && dep.every((x) => /火車(已開出|剛開出)/.test(x)) && agos.every((a) => a <= 20),
    `at the top: ${dep.join(', ')}`);
  check(await page.locator('[data-j="0"].departed').count() === 1, 'they come first');
  await page.click('[data-j="0"]'); await page.waitForSelector('.step');
  check(/已開出|剛開出/.test(await page.locator('.leave').first().innerText()) && await page.locator('[data-track]:not([disabled])').count() === 1,
    'details: 「已開出」, 還有幾個站 available');
  await page.click('[data-back]'); await page.waitForSelector('[data-j]');
  await page.click('[data-step="1"]'); await page.waitForTimeout(100);
  check(await page.locator('.card.departed').count() === 0, '▶: no 「已開出」 trips');
  await page.click('[data-now]'); await page.waitForTimeout(100);
  check(await page.locator('.card.departed').count() === dep.length, '⏱️ 現在: they are back');
  await t.close();

  // ---------- quick tapping on a busy line with a slow network ----------
  // Three searches at once, each ~48 minutes of trips per 2 s, keep ahead of 2 taps (60 min) a second.
  // (At 2.5 s per search the two rates are about equal, which makes the result a coin toss.)
  t = await open({ api: { every: 6, lag: 2000 } });
  page = t.page;
  await chooseTo(page, '寶活站'); await search(page);
  await page.waitForTimeout(6000);
  let waits = 0;
  for (let k = 0; k < 12; k++) {
    await page.click('[data-step="1"]'); await page.waitForTimeout(100);
    if (await loading(page)) waits++;
    await page.waitForTimeout(400);
  }
  check(waits === 0, `12 taps 0.5 s apart, a train every 6 min, 2 s network: ${12 - waits} of 12 instant`);
  await t.close();

  // ---------- same first train, different connection: both trips listed ----------
  t = await open({ api: { walk: false, alt: 12 } });
  page = t.page;
  await chooseFrom(page, '寶活站'); await chooseTo(page, '中央站'); await search(page);
  const firstTimes = await page.$$eval('.card:not(.departed) .times', (els) => els.map((e) => e.innerText.split('→')[0].trim()));
  check(firstTimes[0] === firstTimes[1], `two trips with the same first train both shown (${firstTimes.slice(0, 2).join(' / ')})`);
  await t.close();

  // ---------- arrive-by on a quiet line (a train every 90 minutes) ----------
  t = await open({ api: { walk: false, every: 90 } });
  page = t.page;
  await chooseFrom(page, '寶活站'); await chooseTo(page, '中央站'); await search(page);
  await page.click('[data-change]');
  await page.click('[data-day]:nth-child(2)'); await page.click('[data-arrive="1"]');
  await page.selectOption('[data-hour]', '12'); await page.selectOption('[data-min]', '0');
  await page.click('[data-confirm]'); await page.waitForSelector('[data-j]');
  const quiet = await page.$$eval('[data-j] .times', (els) => els.map((e) => e.innerText.split('→')[1].trim()));
  check(quiet.length >= 1 && quiet.every((x) => minutesOf(x) <= 12 * 60), `quiet line: a trip arriving by 12:00 is shown (${quiet.join(', ')})`);
  await t.close();

  // ---------- errors ----------
  t = await open({ places: () => [] });
  await chooseTo(t.page, '寶活站'); await t.page.click('[data-search-trip]');
  await t.page.waitForSelector('.err');
  check((await t.page.locator('.err').innerText()).includes('找不到地點'), 'place not found: clear message');
  await t.close();
  t = await open();
  t.api.empty = true;
  await chooseTo(t.page, '寶活站'); await t.page.click('[data-search-trip]');
  await t.page.waitForSelector('.msg:has-text("找不到路線")');
  check(await t.page.locator('.tbar').count() === 1 && await t.page.locator('a.btn.uber').count() === 1,
    'no route now: message, time bar and Uber still there');
  await t.close();

  // ---------- ⭐ save a searched destination ----------
  t = await open({ places: (name) => [{ id: 'w1', name: `${name}, Burwood`, type: 'poi', coord: [-33.8771, 151.1036] }] });
  page = t.page;
  await page.click('[data-row=to]'); await page.click('[data-other]');
  await page.fill('#q', 'Westfield Burwood'); await page.click('[data-search]');
  await page.waitForSelector('.result'); await page.click('.result');
  await search(page);
  await page.click('[data-save]');
  check((await page.locator('.sub.ontime').innerText()).includes('已加到常去地點') && await page.evaluate(() => settings.places.length === DEFAULT_PLACES.length + 1),
    '⭐ 加到常去地點 saves it');
  await t.close();

  // ---------- updates over time (fake clock) ----------
  // Start at hh:10:20: trains at :03 and :33, so the top trip (left at :03) says 「已開出 7 分鐘」 and turns
  // into 8 at :10:30, well before the once-a-minute refresh (which redraws the page anyway).
  const start = Math.floor(Date.now() / 3600000) * 3600000 + 10 * MIN + 20000;
  t = await open({ clock: start, api: { walk: false, every: 30 } });
  page = t.page;
  await chooseTo(page, '寶活站'); await search(page);
  await page.waitForSelector('.card.departed', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.evaluate(() => { document.querySelector('[data-j]').__same = 1; });
  const card0 = () => page.evaluate(() => { const c = document.querySelector('[data-j]');
    return { same: c.__same === 1, leave: c.querySelector('.leave').innerText }; });
  const before = await card0();
  await page.clock.runFor(15000);
  const changed = await card0();
  check(changed.leave !== before.leave && changed.same, `the minute changes: 「${before.leave}」 → 「${changed.leave}」, updated in place (not redrawn)`);
  await page.clock.runFor(15000);
  const still = await card0();
  check(still.leave === changed.leave && still.same, '15 s later, nothing changed: page left alone');
  const elapsed = 30000;
  // Past the once-a-minute refresh, then 35 s without one
  await page.clock.runFor(Math.ceil((elapsed + 1) / 60000) * 60000 - elapsed + 1000);
  await page.waitForTimeout(1000);
  await page.clock.runFor(35000);
  const calls = t.api.calls.length;
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(1000);
  check(t.api.calls.length > calls, 'back from another app: live times refreshed at once');
  check(t.errors.length === 0, `no page errors (${t.errors.join(' | ')})`);
  await t.close();
};
