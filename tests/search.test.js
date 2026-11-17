// 🔍 其他地點 in Chinese with the AI: places the app doesn't know are found through the Worker's /place
// (faked here), shown with an icon, a short line and the 🤖 note, in both themes and at 320 px.
const { open, noOverflow } = require('./helpers');

// What the Worker's /place answers: real-looking Transport for NSW locations with zh and kind added
const UNI = {
  places: [
    { id: 'poi1', name: 'University of Sydney, Camperdown', disassembledName: 'University of Sydney', type: 'poi',
      coord: [-33.8886, 151.1873], parent: { name: 'Camperdown' }, zh: '悉尼大學', kind: 'university' },
    { id: '2050123', name: 'Parramatta Rd at Sydney University, Camperdown', type: 'stop', modes: [5],
      coord: [-33.8869, 151.1840], parent: { name: 'Camperdown' }, zh: '悉尼大學巴士站', kind: 'other' },
  ],
};
const HOSPITAL = {
  places: [
    { id: 'poi2', name: 'Chatswood Private Hospital, Chatswood', type: 'poi', coord: [-33.79, 151.18],
      parent: { name: 'Chatswood' }, zh: '車士活私家醫院', kind: 'hospital' },
    { id: '206710', name: 'Chatswood Station, Chatswood', type: 'stop', modes: [1, 5], coord: [-33.797, 151.181],
      parent: { name: 'Chatswood' }, zh: '車士活站', kind: 'other' },
  ],
};

module.exports = async (check) => {
  for (const [theme, width] of [['1', 393], ['2', 320]]) await run(check, theme, width);
};

async function run(check, theme, width) {
  const tag = `主題 ${theme}, ${width} px`;
  const t = await open({ width, aiPlace: (text) => (text.includes('大學') ? UNI : text.includes('醫院') ? HOSPITAL : text === '慢' ? UNI : null) });
  const { page } = t;
  if (theme === '2') { await page.evaluate(() => localStorage.setItem('parents-transit-theme', '2')); await page.reload(); }
  await page.click('[data-row=to]'); await page.click('[data-other]');

  // Not in the app's lists: the AI's places, with icon, short line (kind · suburb) and the 🤖 note
  await page.fill('#q', '雪梨大學'); await page.click('[data-search]');
  await page.waitForSelector('.result');
  const rs = await page.locator('.result').allInnerTexts();
  check(t.ai.placeCalls.join() === '雪梨大學', `${tag}: the AI is asked (${t.ai.placeCalls.join()})`);
  check(rs.length === 2 && rs[0].includes('🎓 悉尼大學') && rs[0].includes('大學 · Camperdown') && rs[0].includes('University of Sydney'),
    `${tag}: AI result shows Chinese name, 大學 · suburb, English (${rs[0].replace(/\n/g, ' ')})`);
  check(rs[1].includes('🚌') && rs[1].includes('巴士站 · Camperdown'), `${tag}: a bus stop is marked 🚌 巴士站, whatever the AI said`);
  check(await page.locator('.aihint:has-text("自動翻譯")').count() === 1, `${tag}: 🤖 note shown above AI results`);
  check(await noOverflow(page), `${tag}: results fit the screen`);
  const sel = await page.evaluate(() => [...document.querySelectorAll('.result')].every((e) => getComputedStyle(e).userSelect === 'none'
    || getComputedStyle(e).webkitUserSelect === 'none'));
  check(sel, `${tag}: results can't be selected as text (long press still a tap)`);

  // Choosing one: becomes the destination, with its place (no second search needed)
  await page.locator('.result').first().click();
  check((await page.locator('[data-row=to]').innerText()).includes('悉尼大學'), `${tag}: AI result chosen as destination`);
  const to = await page.evaluate(() => state.to);
  check(to.ref && to.ref.type === 'coord' && to.searched && to.en === 'University of Sydney', `${tag}: chosen place keeps its position (${JSON.stringify(to.ref)})`);

  // Partly known (車士活 + 醫院): the app's station first, then the AI's places, without repeating the station
  await page.click('[data-row=to]'); await page.click('[data-other]');
  await page.fill('#q', '車士活醫院'); await page.click('[data-search]');
  await page.waitForSelector('.aihint');
  const hs = await page.locator('.result').allInnerTexts();
  check(hs.length === 2 && hs[0].includes('車士活站') && hs[1].includes('🏥 車士活私家醫院') && hs[1].includes('醫院 · 車士活 Chatswood'),
    `${tag}: known station first, then the AI's hospital, station not repeated (${hs.map((h) => h.split('\n')[0]).join(' / ')})`);

  // The AI can't help: friendly message, no technical words
  await page.fill('#q', '嘉年華市場'); await page.click('[data-search]');
  await page.waitForSelector('#results .msg:has-text("找不到")');
  const msg = await page.locator('#results').innerText();
  check(msg.includes('找不到「嘉年華市場」') && msg.includes('請子女幫忙輸入英文') && !/HTTP|502|error/i.test(msg), `${tag}: not found: friendly message`);

  // Leaving the screen while the AI is still answering: nothing breaks
  await page.fill('#q', '慢'); await page.click('[data-search]'); await page.click('[data-back]');
  await page.waitForTimeout(300);
  check(await page.locator('h1:has-text("去哪裡")').count() === 1, `${tag}: back while searching returns to the list`);

  check(t.errors.length === 0, `${tag}: no page errors (${t.errors.join(' | ')})`);
  await t.close();
}
