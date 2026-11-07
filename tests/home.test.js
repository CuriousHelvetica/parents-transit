// Main screen, the two pickers, 🔍 其他地點, ⚙️ 設定 and the live 📍 你在 box.
const { open, chooseTo, chooseFrom, STOPS } = require('./helpers');

// How many default places names.js has (so adding a station doesn't break the tests)
const N = (require('fs').readFileSync(require('path').join(__dirname, '..', 'names.js'), 'utf8').match(/const DEFAULT_ORDER = \[([\s\S]*?)\];/)[1].match(/'[^']+'/g) || []).length;

module.exports = async (check) => {
  const t = await open({
    places: (name) => (/westfield/i.test(name)
      ? [{ id: 'w1', name: 'Westfield Burwood, Burwood', type: 'poi', coord: [-33.8771, 151.1036] }]
      : [{ id: '1', name, type: 'stop', isBest: true, coord: STOPS[4][1] }]),
    promptAnswer: '西田',
  });
  const { page } = t;

  // ---- main screen
  const h2 = await page.locator('h2').allInnerTexts();
  check(h2.join('|') === '從哪裡出發?|去哪裡?', `two questions: ${h2.join(' / ')}`);
  check(await page.locator('h2 .num, [data-when]').count() === 0, 'no numbers, no time question');
  check((await page.locator('[data-row=from]').innerText()).includes('家'), 'starts from 家');
  check(await page.locator('[data-row=to].empty').count() === 1, 'destination empty at start');
  await page.click('[data-search-trip]');
  check(await page.locator('h1:has-text("去哪裡?")').count() === 1, 'search without a destination opens the destination list');
  await page.click('[data-back]');

  // ---- pickers
  await page.click('[data-row=from]');
  const fromList = await page.locator('.picklist button').allInnerTexts();
  check(fromList[0].startsWith('🏠 家') && fromList[1].startsWith('📍 現在位置') && fromList[2].startsWith('好市圍站'),
    `start list: 家, 現在位置, then saved places in order (${fromList.slice(0, 3).map((x) => x.split('\n')[0]).join(', ')})`);
  const fl = fromList.findIndex((x) => x.startsWith('菲林明頓站'));
  check(fl > 0 && fromList[fl + 1].replace(/\s+/g, ' ').startsWith('賓士鎮站 Bankstown'), '賓士鎮站 Bankstown comes right after 菲林明頓站');
  check(fromList.length === N + 2, `start list has 家 + 現在位置 + ${N} places (${fromList.length})`);
  await page.click('[data-back]');
  // Every place in every list, each in the same spot in both lists; the other side's choice greyed out
  const spot = (label) => page.locator(`.picklist button:has-text("${label}")`).first().boundingBox();
  await page.click('[data-row=to]');
  const toHome = page.locator('.picklist button').first();
  check((await toHome.innerText()).startsWith('🏠 回家') && await toHome.isDisabled(), 'start 家: 回家 still first in the destination list, greyed');
  const toSpots = [await spot('寶活站'), await spot('中央站'), await spot('賓士鎮站')];
  check(await page.locator('.picklist button').count() === N + 1, `destination list has 回家 + all ${N} places`);
  await page.click('[data-back]');
  await page.click('[data-row=from]');
  const fromSpots = [await spot('寶活站'), await spot('中央站'), await spot('賓士鎮站')];
  check(toSpots.every((b, i) => Math.abs(b.x - fromSpots[i].x) < 1 && Math.abs(b.y - fromSpots[i].y) < 1),
    'each place is in the same spot in the start and destination lists');
  await page.click('[data-back]');
  await chooseTo(page, '寶活站');
  check((await page.locator('[data-row=to]').innerText()).includes('寶活站'), 'destination chosen: 寶活站');
  await page.click('[data-row=from]');
  check(await page.locator('.picklist button:has-text("寶活站")').isDisabled() && await page.locator('.picklist button:disabled').count() === 1,
    'start list: 寶活站 (the destination) greyed in its spot, nothing else');
  await page.click('.picklist button:has-text("寶活站")', { force: true }).catch(() => {});
  check(await page.locator('h1:has-text("從哪裡出發?")').count() === 1, 'tapping the greyed place does nothing');
  await page.click('.picklist button:has-text("中央站")');
  await page.click('[data-row=to]');
  const toList = await page.locator('.picklist button').allInnerTexts();
  check(toList[0].startsWith('🏠 回家') && !(await page.locator('.picklist button').first().isDisabled())
    && await page.locator('.picklist button:has-text("中央站")').isDisabled(), 'start 中央站: 回家 available, 中央站 greyed');
  check(toList.length === N + 1, 'destination list still has every place');
  await page.click('[data-back]');
  await page.click('[data-reset-trip]');
  check((await page.locator('[data-row=from]').innerText()).includes('家') && await page.locator('[data-row=to].empty').count() === 1,
    '↺ 重新開始: back to 家 and no destination');

  // ---- 🔍 其他地點
  await page.click('[data-row=to]'); await page.click('[data-other]');
  await page.fill('#q', '伊頻'); await page.click('[data-search]');
  check((await page.locator('.result').allInnerTexts()).join().includes('Epping Station'), 'Chinese search finds 伊頻 Epping');
  await page.fill('#q', '不存在'); await page.click('[data-search]');
  check((await page.locator('#results').innerText()).includes('找不到這個中文名稱'), 'unknown Chinese name: asks for English');
  await page.fill('#q', 'Westfield Burwood'); await page.press('#q', 'Enter');
  await page.waitForSelector('.result');
  await page.click('.result');
  check((await page.locator('[data-row=to]').innerText()).includes('Westfield Burwood'), 'English search result chosen as destination');
  const saved = await page.evaluate(() => settings.places.length);
  check(saved === N, 'a searched place is not added to the saved places by itself');

  // ---- ⚙️ 設定
  await page.click('[data-settings]');
  const version = (await page.locator('.version').innerText());
  const expected = require('fs').readFileSync(require('path').join(__dirname, '..', 'version.js'), 'utf8').match(/APP_VERSION = '([^']+)'/)[1];
  check(version.includes(expected), `settings show the version (${expected})`);
  const firstTwo = () => page.evaluate(() => settings.places.slice(0, 2).map((p) => p.en).join(','));
  await page.click('[data-up="1"]');
  check(await firstTwo() === 'Burwood,Hurstville', 'move up: Burwood now first');
  await page.click('[data-del="0"]');
  check(await page.evaluate(() => settings.places.length) === N - 1 && await firstTwo() === 'Hurstville,Blacktown', 'delete: Burwood removed');
  await page.click('[data-add]'); await page.fill('#q', 'Westfield Burwood'); await page.click('[data-search]');
  await page.waitForSelector('.result'); await page.click('.result');
  check(await page.evaluate(() => { const p = settings.places[settings.places.length - 1]; return `${p.zh}/${p.en}`; }) === '西田/Westfield Burwood',
    'add place: saved with the Chinese name typed');
  check(await page.evaluate(() => JSON.parse(localStorage.getItem(STORE_KEY)).places.length) === N, 'settings saved on the phone');
  await page.click('[data-reset]');
  check(await page.evaluate(() => settings.places.length) === N && await firstTwo() === 'Hurstville,Burwood', '還原預設: defaults back');
  await page.click('[data-testvoice]');
  check((await page.evaluate(() => window.__said)).some((x) => x.includes('二號月台')), '試聽廣東話 speaks');
  await page.click('[data-back]');

  // ---- 📍 你在: live while the main screen is open
  await page.waitForTimeout(800);
  const box = () => page.locator('#here').innerText();
  check(/羅德 Rhodes/.test(await box()) && /Shoreline Drive/.test(await box()), `shows suburb and street: ${(await box()).replace(/\n/g, ' / ')}`);
  const n0 = t.osm.calls;
  await t.ctx.setGeolocation({ latitude: -33.8304, longitude: 151.0870, accuracy: 10 }); await page.waitForTimeout(800);
  check(t.osm.calls === n0, 'moved 45 m: no new address lookup');
  await t.ctx.setGeolocation({ latitude: -33.8340, longitude: 151.0870, accuracy: 10 }); await page.waitForTimeout(800);
  check(t.osm.calls === n0, 'moved 400 m within 30 s: waits');
  await page.evaluate(() => { here.at -= 31000; });   // 30 seconds later
  await t.ctx.setGeolocation({ latitude: -33.8341, longitude: 151.0870, accuracy: 10 }); await page.waitForTimeout(800);
  check(t.osm.calls === n0 + 1 && /Concord/.test(await box()), `after 30 s: looked up again (${(await box()).split('\n')[0]})`);
  check(await page.evaluate(() => here.watch !== null), 'GPS on while the main screen is open');
  await page.click('[data-row=to]');
  check(await page.evaluate(() => here.watch === null), 'GPS off on another screen');
  await page.click('[data-back]'); await page.waitForTimeout(300);
  check(await page.evaluate(() => here.watch !== null), 'GPS back on with the main screen');
  const n1 = t.osm.calls;
  await page.click('#here'); await page.waitForTimeout(800);
  check(t.osm.calls === n1 + 1, 'tap: fresh address lookup');
  await page.evaluate(() => {
    navigator.geolocation.getCurrentPosition = (ok, fail) => setTimeout(() => fail({ code: 3 }), 30);
    here.fixAt = Date.now() - 70000; checkHereStale();
  });
  await page.waitForTimeout(300);
  check(/位置未能更新/.test(await box()) && /Concord/.test(await box()), 'no GPS for a minute: keeps the place, adds 「(位置未能更新)」');

  check(t.errors.length === 0, `no page errors (${t.errors.join(' | ')})`);
  await t.close();

  // Location permission refused: never a wrong place
  const d = await open();
  await d.ctx.clearPermissions();
  await d.page.reload(); await d.page.waitForTimeout(800);
  const txt = await d.page.locator('#here').innerText().catch(() => '');
  check(!/你在/.test(txt), `no permission: no place shown (${txt.replace(/\n/g, ' ') || 'hidden'})`);
  await d.close();
};
