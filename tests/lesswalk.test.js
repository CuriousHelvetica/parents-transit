// Fastest and least-walking trips in one list (v1.9.3): every search asks Transport for NSW both ways at the
// same time; both kinds of trip appear in time order, the same trip only once; a failed least-walking request
// never stops the list, and its trips from the last search don't vanish.
const { open, chooseTo, search, journey } = require('./helpers');

module.exports = async (check) => {
  // Least walking: a bus (line 423) instead of the train, leaving 5 minutes after each train
  const t = await open({ api: { every: 30 } });
  const { page } = t;
  // Record when each trip request starts
  await page.evaluate(() => { const f = window.fetch; window.__tripStarts = [];
    window.fetch = (u, o) => { if (String(u).includes('/tp/trip')) window.__tripStarts.push(performance.now()); return f(u, o); }; });
  t.api.lessWalk = (T, arrive, rides) => rides.map((r) => journey(r + 5 * 60000, { line: '423', cls: 5 }));
  await chooseTo(page, '寶活站'); await search(page);
  await page.waitForTimeout(500);
  const asked = t.api.calls;
  check(asked.some((c) => c.less) && asked.some((c) => !c.less), `each search asks both ways (${asked.filter((c) => c.less).length} least-walking of ${asked.length})`);
  const first = asked.find((c) => !c.less);
  check(asked.some((c) => c.less && c.T === first.T && c.arrive === first.arrive), 'the two requests are for the same time');
  // Never more than 4 trip requests a second (Transport for NSW refuses more than about 5)
  const starts = await page.evaluate(() => window.__tripStarts || []);
  let worst = 0;
  starts.forEach((s, i) => { worst = Math.max(worst, starts.filter((x) => x >= s && x < s + 1000).length); });
  check(starts.length >= 4 && worst <= 4, `at most 4 trip requests in any second (${worst} of ${starts.length})`);
  const cards = await page.locator('.card[data-j]:not(.departed)').allInnerTexts();
  const bus = cards.filter((c) => c.includes('423')).length, train = cards.filter((c) => c.includes('T9')).length;
  check(bus > 0 && train > 0, `both kinds of trip listed (${train} train, ${bus} bus)`);
  // Departure time on each card, in minutes (「早上 10:03 開車」, 「下午 1:33 開車」 …)
  const mins = (txt) => { const m = txt.match(/(凌晨|早上|中午|下午|晚上)\s*(\d{1,2}):(\d{2})/); if (!m) return NaN;
    let h = +m[2] % 12; if (['下午', '晚上'].includes(m[1]) || (m[1] === '中午' && h < 11)) h += 12; return h * 60 + +m[3]; };
  const deps = cards.map(mins);
  check(deps.every((d) => !isNaN(d)) && deps.every((d, i) => i === 0 || d >= deps[i - 1]), `one list, earliest departure first (${deps.join(', ')})`);
  check(new Set(cards).size === cards.length, 'no trip shown twice');

  // The least-walking request fails (e.g. too many requests): the list still works, nothing vanishes
  const before = bus;
  t.api.lessFail = true;
  await page.click('[data-step="1"]'); await page.waitForTimeout(300);
  await page.click('[data-now]'); await page.waitForTimeout(1500);
  const after = await page.locator('.card[data-j]:not(.departed)').allInnerTexts();
  check(after.length > 0 && !(await page.locator('.err').count()), 'least-walking request fails: trips still shown, no error');
  check(after.filter((c) => c.includes('423')).length >= Math.min(before, 1), 'its bus trips from before are kept, not dropped');
  check(t.errors.length === 0, `no page errors (${t.errors.join(' | ')})`);
  await t.close();

  // Transport for NSW refuses a request (429): tried once more, the list still appears
  const r = await open({ api: { every: 30 } });
  r.api.refuse = 1;
  await chooseTo(r.page, '寶活站'); await search(r.page);
  await r.page.waitForTimeout(2500);   // the retry waits 1.5 s
  const c0 = r.api.calls[0];
  const repeats = r.api.calls.filter((c) => c.T === c0.T && c.less === c0.less && c.arrive === c0.arrive).length;
  check(repeats === 2, `a request refused as "too many" is sent once more (${repeats} times)`);
  check(await r.page.locator('.card[data-j]').count() > 0 && !(await r.page.locator('.err').count()), 'and the trips are shown, no error');
  await r.close();

  // Same trips both ways (the usual case for a short walk): each shown once
  const u = await open({ api: { every: 30 } });
  await chooseTo(u.page, '寶活站'); await search(u.page);
  await u.page.waitForTimeout(500);
  const k2 = await u.page.locator('.card[data-j]').allInnerTexts();
  check(k2.length > 0 && new Set(k2).size === k2.length, `identical answers: each trip once (${k2.length} cards)`);
  await u.close();
};
