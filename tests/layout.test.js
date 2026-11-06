// Every screen fits the phone: no sideways scrolling at 393 px (iPhone 14 Pro), 375 px and 320 px,
// and the time bar buttons stay inside the screen.
const { open, chooseTo, search, noOverflow, STOPS } = require('./helpers');

module.exports = async (check) => {
  const t = await open({ api: { notices: [{ subtitle: 'Trackwork at Redfern Station tonight', priority: 'high' }, { subtitle: 'Lift upgrade' }] } });
  const { page } = t;
  await chooseTo(page, '寶活站');
  await search(page);
  await page.waitForTimeout(1500);
  for (const width of [393, 375, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const bad = [];
    const look = async (name) => { await page.waitForTimeout(150); if (!(await noOverflow(page))) bad.push(name); };
    await page.click('[data-back]'); await look('main screen');
    await page.click('[data-row=from]'); await look('start list');
    await page.click('[data-other]'); await look('other place search');
    await page.click('[data-back]'); await page.click('[data-back]');
    await page.click('[data-settings]'); await look('settings');
    await page.click('[data-back]');
    await search(page); await look('trip list');
    const bar = await page.evaluate(() => [...document.querySelectorAll('.tbar button, .tb-change')].every((b) => b.getBoundingClientRect().right <= innerWidth && b.scrollWidth <= b.clientWidth + 1));
    if (!bar) bad.push('time bar buttons');
    await page.click('[data-change]'); await look('change time page');
    await page.click('[data-cancel]'); await page.waitForSelector('[data-j]');
    await page.click('.card:not(.departed)'); await page.waitForSelector('.step');
    await page.click('details.stops summary'); await page.click('details.notices summary'); await look('trip details');
    await t.ctx.setGeolocation({ latitude: STOPS[0][1][0], longitude: STOPS[0][1][1], accuracy: 10 });
    await page.click('[data-track]'); await look('stop countdown');
    await page.click('[data-back]'); await page.click('[data-back]'); await page.waitForSelector('[data-j]');
    check(!bad.length, `${width} px: every screen fits${bad.length ? ` (too wide: ${bad.join(', ')})` : ''}`);
  }
  check(t.errors.length === 0, `no page errors (${t.errors.join(' | ')})`);
  await t.close();
};
