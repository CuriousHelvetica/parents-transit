// 📍 還有幾個站: a simulated bus ride, and which service they actually boarded.
const { open, chooseFrom, chooseTo, search, journey, STOPS, MIN } = require('./helpers');

const mid = (a, b, f = 0.5) => ({ latitude: a[0] + (b[0] - a[0]) * f, longitude: a[1] + (b[1] - a[1]) * f, accuracy: 10 });
const at = (c) => ({ latitude: c[0], longitude: c[1], accuracy: 10 });

module.exports = async (check) => {
  // ---- a bus ride: 526, a bus every 3 minutes, stops a minute apart
  let t = await open({ api: { walk: false, cls: 5, line: '526', every: 3, gap: 1 } });
  let page = t.page;
  await chooseFrom(page, '史卓菲站'); await chooseTo(page, '寶活站'); await search(page);
  await page.waitForSelector('.card.departed', { timeout: 8000 }).catch(() => {});
  const nDep = await page.locator('.card.departed').count();
  check(nDep >= 1, `bus that just left listed (${nDep})`);
  await page.click(`[data-j="${nDep - 1}"]`);   // the most recent one
  await page.waitForSelector('[data-track]');
  await t.ctx.setGeolocation(at(STOPS[0][1]));
  await page.click('[data-track]');
  const big = () => page.locator('.track-big').innerText();
  const cls = () => page.evaluate(() => document.body.className);
  const go = async (pos) => { await t.ctx.setGeolocation(pos); await page.waitForTimeout(400); };
  await page.waitForTimeout(400);
  check((await big()).includes('還有 4 個站') && await page.locator('.boarded').count() === 0, 'at the stop: 還有 4 個站');
  await go(mid(STOPS[0][1], STOPS[1][1], 0.3));
  check((await big()).includes('還有 4 個站') && await page.locator('.boarded').count() === 1, 'bus moving: ✓ 已上車');
  await go(at(STOPS[1][1]));
  check((await big()).includes('還有 3 個站') && await page.locator('ol.track-list li.done').count() === 2, 'at stop 1: 還有 3 個站, stops crossed off');
  await go(mid(STOPS[1][1], STOPS[2][1], 0.7));
  check((await big()).includes('還有 3 個站') || (await big()).includes('還有 2 個站'), 'between stops: counts on');
  await go(at(STOPS[3][1]));
  check((await big()).includes('下一站下車') && (await big()).includes('請按鐘') && /alert-bell/.test(await cls()), 'next stop is theirs: 🔔 下一站下車 請按鐘! and the screen flashes');
  await go(at(STOPS[4][1]));
  check((await big()).includes('到站') && /alert-off/.test(await cls()), 'at their stop: 📍 到站,請下車! on green');
  await page.click('[data-back]');
  check(await page.locator('.step').count() > 0 && !/alert/.test(await cls()), '← 結束: back to the trip, colours cleared');
  check(t.errors.length === 0, `no page errors (${t.errors.join(' | ')})`);
  await t.close();

  // ---- which service: open the countdown for one trip, the GPS shows when the train really left
  t = await open();
  page = t.page;
  const run = async (label, specs, sel, { startAway = false, wantNote }) => {
    await t.ctx.setGeolocation(startAway ? at(STOPS[1][1]) : at(STOPS[0][1]));
    await page.evaluate(() => new Promise((ok) => navigator.geolocation.getCurrentPosition(ok, ok, { maximumAge: 0, timeout: 3000 })));
    const now = await page.evaluate(() => Date.now());
    const js = specs.map(([planned, est, line]) => {
      const j = journey(now + planned * MIN, { walk: false, line: line || 'T9', late: est - planned });
      return j;
    });
    await page.evaluate(([js, sel]) => showTracking(js[sel].legs[0], () => showHome(), js), [js, sel]);
    await page.waitForTimeout(400);
    if (!startAway) check(await page.locator('.boarded').count() === 0, `${label}: not boarded at the platform`);
    await t.ctx.setGeolocation(mid(STOPS[0][1], STOPS[1][1], 0.15));   // ~280 m along the line
    await page.waitForTimeout(400);
    const note = await page.locator('.other-service').count();
    check(await page.locator('.boarded').count() === 1 && note === (wantNote ? 1 : 0),
      `${label}: ✓ 已上車, ${wantNote ? 'note' : 'no note'}${note ? ` (${(await page.locator('.other-service').innerText()).replace(/\s+/g, ' ')})` : ''}`);
    await page.click('[data-back]');
  };
  await run('on time', [[0, 0], [10, 10]], 0, { wantNote: false });
  await run('earlier train running late', [[-5, 0], [10, 10]], 1, { wantNote: true });
  await run('missed it, caught the next', [[-10, -10], [1, 1]], 0, { wantNote: true });
  await run('selected one 15 min late', [[-15, -15], [12, 12]], 0, { wantNote: false });
  await run('left 5 min early, no other trains', [[5, 5]], 0, { wantNote: true });
  await run('other line ignored', [[0, 0], [1, 1, 'T1']], 0, { wantNote: false });
  await run('opened on board', [[10, 10]], 0, { startAway: true, wantNote: false });
  check(t.errors.length === 0, `no page errors (${t.errors.join(' | ')})`);
  await t.close();
};
