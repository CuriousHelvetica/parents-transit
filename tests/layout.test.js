// Every screen fits the phone: no sideways scrolling at 393 px (iPhone 14 Pro), 375 px and 320 px,
// and the time bar buttons stay inside the screen. Run once for each colour theme.
const { open, chooseTo, search, noOverflow, openSettings, STOPS } = require('./helpers');

module.exports = async (check) => {
  for (const theme of ['1', '2']) await run(check, theme);
};

async function run(check, theme) {
  const t = await open({ api: { notices: [{ subtitle: 'Trackwork at Redfern Station tonight', priority: 'high' }, { subtitle: 'Lift upgrade' }] } });
  const { page } = t;
  if (theme === '2') { await page.evaluate(() => localStorage.setItem('parents-transit-theme', '2')); await page.reload(); }
  const on = await page.evaluate(() => document.getElementById('theme1').media !== 'not all');
  check(on === (theme === '1'), `主題 ${theme}: theme file ${theme === '1' ? 'on' : 'off'}`);
  await chooseTo(page, '寶活站');
  await search(page);
  // Double-tap zoom is off everywhere (pinch zoom is left alone)
  check(await page.evaluate(() => getComputedStyle(document.documentElement).touchAction === 'manipulation' && getComputedStyle(document.body).touchAction === 'manipulation'),
    `主題 ${theme}: double-tap zoom switched off`);
  // Second safeguard: a quick second tap on plain text is cancelled; taps on buttons never are
  const taps = await page.evaluate(() => {
    const tap = (el) => {
      const touch = new Touch({ identifier: 1, target: el, clientX: 10, clientY: 10 });
      const ev = new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [touch] });
      el.dispatchEvent(ev); return ev.defaultPrevented;
    };
    const text = document.querySelector('.whenx') || document.querySelector('h1');
    const btn = document.querySelector('[data-step="1"]');
    return { first: tap(text), second: tap(text), btn1: tap(btn), btn2: tap(btn) };
  });
  check(!taps.first && taps.second, `主題 ${theme}: quick second tap on text cancelled (no zoom)`);
  check(!taps.btn1 && !taps.btn2, `主題 ${theme}: quick repeated taps on a button still go through`);
  check(!/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\D|$)/.test(await page.evaluate(() => document.querySelector('meta[name=viewport]').content)), `主題 ${theme}: pinch zoom still allowed`);
  // Labels of things that are pressed can't be selected as text (a long press must still be a tap)
  const sel = async (where) => {
    const bad = await page.evaluate(() => [...document.querySelectorAll('button, a.btn, a.maplink, summary')]
      .filter((e) => { const cs = getComputedStyle(e); return (cs.userSelect || cs.webkitUserSelect) !== 'none'; })
      .map((e) => (e.textContent || '').trim().slice(0, 12)));
    check(bad.length === 0, `主題 ${theme}, ${where}: button labels can't be selected as text${bad.length ? ` (selectable: ${bad.join(', ')})` : ''}`);
  };
  await sel('trip list');
  await page.click('.card[data-j]'); await page.waitForSelector('.step'); await sel('trip details');
  await page.click('[data-back]'); await page.click('[data-back]');
  await openSettings(page); await sel('settings');
  await page.click('[data-back]'); await sel('main screen');
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
    await openSettings(page); await look('settings');
    await page.click('[data-delmode]'); await look('settings, delete mode'); await page.click('[data-done]');
    await page.click('[data-back]');
    await search(page); await look('trip list');
    const bar = await page.evaluate(() => [...document.querySelectorAll('.tbar button, .tb-change')].every((b) => b.getBoundingClientRect().right <= innerWidth && b.scrollWidth <= b.clientWidth + 1));
    if (!bar) bad.push('time bar buttons');
    await page.click('[data-change]'); await look('change time page');
    // 改時間及日期 fits one iPhone 14 Pro screen (852 pt minus status bar and home bar = 759)
    if (width === 393) {
      await page.setViewportSize({ width, height: 759 });
      const bottom = await page.evaluate(() => document.querySelector('[data-confirm]').getBoundingClientRect().bottom);
      check(bottom <= 759, `主題 ${theme}, 改時間及日期: ✓ 確定 visible without scrolling on an iPhone 14 Pro (bottom at ${Math.round(bottom)} of 759)`);
      await page.setViewportSize({ width, height: 800 });
    }
    await page.click('[data-cancel]'); await page.waitForSelector('.card[data-j]');
    await page.click('.card[data-j]'); await page.waitForSelector('.step');
    await page.click('details.stops summary'); await page.click('details.notices summary'); await look('trip details');
    await t.ctx.setGeolocation({ latitude: STOPS[0][1][0], longitude: STOPS[0][1][1], accuracy: 10 });
    await page.click('[data-track]'); await look('stop countdown');
    await page.click('[data-back]'); await page.click('[data-back]'); await page.waitForSelector('.card[data-j]');
    check(!bad.length, `主題 ${theme}, ${width} px: every screen fits${bad.length ? ` (too wide: ${bad.join(', ')})` : ''}`);
  }
  check(t.errors.length === 0, `主題 ${theme}: no page errors (${t.errors.join(' | ')})`);
  await t.close();
}
