// A trip's details page: the steps, platform and direction, stop list, service notices (translated,
// severe ones open, HTML in them harmless), 🔊 朗讀 and the map links.
const { open, chooseTo, search, STOPS } = require('./helpers');

module.exports = async (check) => {
  const notices = [
    { subtitle: 'Trackwork at Redfern Station tonight', priority: 'high' },
    { subtitle: 'Lift upgrade', content: '<p>Lifts at <b>Rhodes Station</b> closed.<img src="x:" onerror="window.__ran=1"></p>', priority: 'normal' },
    { subtitle: 'New timetable from Sunday' },
  ];
  const t = await open({ api: { notices } });
  const { page } = t;
  await chooseTo(page, '寶活站');
  await search(page);
  check((await page.locator('.card:not(.departed)').first().innerText()).includes('有重要服務通知'), 'trip card warns about the important notice');
  await page.click('.card:not(.departed)');
  await page.waitForSelector('.step');
  await page.waitForTimeout(800);   // translations come in

  const steps = await page.locator('.step').allInnerTexts();
  const flat = steps.map((s) => s.replace(/\s+/g, ' '));
  check(flat[0].includes('步行 15 分鐘') && flat[0].includes('羅德站 Rhodes'), `walk step: ${flat[0].slice(0, 40)}`);
  check(/乘搭 T9 火車/.test(flat[1]) && flat[1].includes('2號月台') && flat[1].includes('往 康士比 Hornsby via Strathfield 方向') && flat[1].includes('共 4 個站'),
    'board step: line, platform, direction (Chinese + English), number of stops');
  check(flat[2].includes('寶活站 Burwood') && flat[2].includes('下車') && steps.length === 5, 'get-off step, walk, 🏁 arrive');
  check(await page.locator('[data-remind]').count() === 0, '⏰ 提醒我 hidden');

  // stop list
  await page.click('details.stops summary');
  check((await page.locator('details.stops summary').innerText()).includes('4 個站') && (await page.locator('li.bell').innerText()).includes('史卓菲站')
    && (await page.locator('li.getoff').innerText()).includes('寶活站'), 'stop list: 🔔 on the stop before, 📍 on the stop to get off');

  // notices
  const severe = await page.locator('.notice.severe').allInnerTexts();
  check(severe.length === 1 && severe[0].includes('重要服務通知') && severe[0].includes('紅坊站 Redfern'), 'important notice open, translated, station name kept as 中文 + English');
  check((await page.locator('details.notices > summary').innerText()).includes('服務通知 (2)') && !(await page.locator('details.notices').evaluate((d) => d.open)),
    'routine notices folded under one line (2)');
  check((await page.locator('details.notices .notice').first().textContent()).includes('中文:'), 'routine notices translated too');
  check(await page.evaluate(() => window.__ran) === undefined, 'HTML inside a notice did not run');
  check(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem(TR_KEY))).length) >= 1, 'translations remembered on the phone');

  // map links: walking directions to the boarding stop's position
  const href = await page.locator('a.maplink').first().getAttribute('href');
  check(href.includes(`daddr=${encodeURIComponent(`${STOPS[0][1][0]},${STOPS[0][1][1]}`)}`) && href.includes('dirflg=w'), '地圖指路: Apple Maps walking to the stop');

  // read aloud
  await page.click('[data-say]');
  const said = await page.evaluate(() => window.__said.slice());
  check(said[0] === '，，' && said[1].includes('乘搭T9火車') && said[1].includes('2號月台') && !said[1].includes('Trackwork'),
    'read aloud: short pause first, then the steps (not the notices)');
  check((await page.locator('[data-say]').innerText()).includes('停止'), 'button turns into ⏹ 停止');
  await page.click('[data-say]');
  check((await page.locator('[data-say]').innerText()).includes('朗讀') && await page.evaluate(() => window.__cancelled > 0), 'tap again: stops');

  await page.click('[data-back]');
  check(await page.locator('[data-j]').count() > 0, '← 返回: back to the list');
  check(t.errors.length === 0, `no page errors (${t.errors.join(' | ')})`);
  await t.close();
};
