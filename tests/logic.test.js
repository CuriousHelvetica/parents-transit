// The app's own functions, called directly in the page: time words, rounding, notices, trip matching,
// the stop countdown and which service was boarded.
const { open, MIN } = require('./helpers');

module.exports = async (check) => {
  const t = await open();
  const { page } = t;
  const ev = (fn, arg) => page.evaluate(fn, arg);

  // Time words
  const words = await ev(() => [[0, '15'], [6, '05'], [9, '30'], [12, '00'], [15, '45'], [19, '30']].map(([h, m]) => fmt12(h, m)));
  check(JSON.stringify(words) === JSON.stringify(['凌晨 12:15', '清晨 6:05', '早上 9:30', '中午 12:00', '下午 3:45', '晚上 7:30']),
    `fmt12: ${words.join(', ')}`);

  // Sydney time <-> ms, both sides of daylight saving
  const epochs = await ev(() => [sydneyEpoch('2026-11-06', '09:00'), sydneyEpoch('2026-07-01', '09:00')]);
  check(epochs[0] === Date.UTC(2026, 10, 5, 22, 0) && epochs[1] === Date.UTC(2026, 5, 30, 23, 0), 'sydneyEpoch: summer +11, winter +10');
  const round = await ev(() => { const w = planAt(sydneyEpoch('2026-12-24', '18:30'), true); return `${w.date} ${w.time} ${w.arrive}`; });
  check(round === '2026-12-24 18:30 true', `planAt round trip: ${round}`);

  // ◀ ▶ steps: 30 minutes, rounded to :00 / :30, ties go the way of the tap; into the past -> 現在
  const steps = await ev(() => {
    const d = sydneyDate(1);
    const f = (time, dir, arrive = false) => { const w = stepWhen({ mode: 'later', date: d, time, arrive }, dir); return w.time + (w.arrive ? ' arr' : ''); };
    return [f('09:10', 1), f('09:10', -1), f('09:15', 1), f('09:15', -1), f('09:30', 1), f('23:50', 1), f('09:00', 1, true)];
  });
  check(JSON.stringify(steps) === JSON.stringify(['09:30', '08:30', '10:00', '08:30', '10:00', '00:30', '09:30 arr']), `stepWhen: ${steps.join(', ')}`);
  check(await ev(() => stepWhen({ mode: 'later', date: sydneyDate(0), time: '00:00', arrive: false }, -1).mode) === 'now', 'stepWhen: before now -> 現在');
  const fromNow = await ev(() => { const w = stepWhen({ mode: 'now' }, 1); return sydneyEpoch(w.date, w.time) - Date.now(); });
  check(fromNow >= 15 * 60000 - 60000 && fromNow <= 45 * 60000 && Math.round((Date.now() + fromNow) / 60000) % 30 === 0,
    `stepWhen from now: lands on :00/:30, ${Math.round(fromNow / 60000)} min ahead`);

  // Plans never in the past
  const clamp = await ev(() => {
    const a = clampPlan({ date: '2020-01-01', time: '09:00' });
    const e = earliestToday();
    const b = clampPlan({ date: sydneyDate(0), time: '00:00' });
    return { a: a.date === sydneyDate(0) || a.date === sydneyDate(1), b: e ? b.time === `${String(e[0]).padStart(2, '0')}:${String(e[1]).padStart(2, '0')}` : b.date === sydneyDate(1) };
  });
  check(clamp.a && clamp.b, 'clampPlan: past date -> today, past time -> earliest allowed');

  // Notice text: HTML is removed without running anything in it
  const strip = await ev(() => new Promise((ok) => {
    const text = stripHtml('<p>Lift  works</p><img src="x:" onerror="window.__ran=1"><script>window.__ran=2</script>');
    setTimeout(() => ok({ text, ran: window.__ran || 0 }), 300);
  }));
  check(strip.text === 'Lift works' && strip.ran === 0, `stripHtml: "${strip.text}", code in the notice ran: ${strip.ran ? 'YES' : 'no'}`);

  // Notices: priority, duplicates, at most 3
  const n = await ev(() => noticesOf({ infos: [
    { subtitle: 'Trackwork tonight', priority: 'high' }, { subtitle: 'Lift upgrade', priority: 'normal' },
    { subtitle: 'Lift upgrade', priority: 'normal' }, { subtitle: 'A', priority: 'low' }, { subtitle: 'B', priority: 'veryHigh' }] }));
  check(n.length === 3 && n[0].severe && !n[1].severe && n.map((x) => x.en).join('|') === 'Trackwork tonight|Lift upgrade|A',
    `noticesOf: ${n.map((x) => `${x.en}${x.severe ? '(severe)' : ''}`).join(', ')}`);

  // Station names kept out of the AI translation, then put back as 中文 + English
  const prot = await ev(() => {
    const { text, places } = protectPlaces('Lifts at Redfern Station are closed. Use Opal at Bathurst Station.');
    return { text, places, back: restorePlaces(text.replace('Lifts at', '升降機在'), places), lost: restorePlaces('升降機關閉', places) };
  });
  check(!/Redfern|Bathurst/.test(prot.text) && prot.back.includes('紅坊站 Redfern') && prot.back.includes('Bathurst站'),
    `protect/restore places: ${prot.back}`);
  check(prot.lost.includes('提及地點') && prot.lost.includes('紅坊站 Redfern'), 'restorePlaces: places the AI dropped are listed at the end');

  // Trip matching: same first train and lines but a different connection = two different trips
  const keys = await ev(() => {
    const leg = (dep, arr) => ({ transportation: { disassembledName: 'T9', product: { class: 1 } }, origin: { departureTimePlanned: dep }, destination: { arrivalTimePlanned: arr } });
    const a = { legs: [leg('2026-11-06T08:00:00Z', '2026-11-06T08:20:00Z')] };
    const b = { legs: [leg('2026-11-06T08:00:00Z', '2026-11-06T08:35:00Z')] };
    return [tripKey(a), tripKey(b), tripKey(a)];
  });
  check(keys[0] !== keys[1] && keys[0] === keys[2], 'tripKey: different arrival -> different trip, same trip -> same key');

  // Slower walk from home: 5 minutes earlier start, nothing else moves
  const walk = await ev(() => {
    const j = { legs: [{ duration: 600, origin: { departureTimePlanned: '2026-11-06T08:00:00.000Z' }, destination: {} },
      { transportation: { product: { class: 1 } }, origin: { departureTimePlanned: '2026-11-06T08:10:00.000Z' }, destination: {} }] };
    const s = slowerHomeWalk(j);
    return [s.legs[0].origin.departureTimePlanned, s.legs[0].duration, s.legs[1].origin.departureTimePlanned, j.legs[0].origin.departureTimePlanned];
  });
  check(walk[0] === '2026-11-06T07:55:00.000Z' && walk[1] === 900 && walk[2] === '2026-11-06T08:10:00.000Z' && walk[3] === '2026-11-06T08:00:00.000Z',
    'slowerHomeWalk: walk starts 5 min earlier, train unchanged, original untouched');

  // Coverage bookkeeping for ◀ ▶ (stretches within a minute of each other join up)
  const ku = await ev((MIN) => {
    const pool = newTripPool();
    const at = (m) => 1e12 + m * MIN;
    pool.spans.dep.push([at(0), at(40), 0], [at(40.5), at(90), 0], [at(120), at(180), 0]);
    pool.spans.arr.push([at(0), at(50), 0], [at(40), at(90), 0]);
    return [knownUntil(pool, false, at(10)), knownUntil(pool, false, at(100)), knownUntil(pool, true, at(80))].map((x) => (x === null ? null : (x - 1e12) / MIN));
  }, MIN);
  check(JSON.stringify(ku) === '[90,null,0]', `knownUntil: from 10 -> 90, gap at 100 -> unknown, arrive-by from 80 -> 0 (${ku.join(', ')})`);

  // Stop countdown: which stop has the bus reached?
  const sp = await ev((MIN) => {
    const now = Date.now();
    const list = [[-33.8306, 151.0872], [-33.8476, 151.0861], [-33.8594, 151.0880], [-33.8718, 151.0943], [-33.8771, 151.1040]]
      .map((coord, k) => ({ coord, time: new Date(now + (k - 2) * 5 * MIN).toISOString() }));
    return [stopsPassed(list, list[2].coord, 0, 10, now),                  // at stop 2, which is due now
      stopsPassed(list, [-33.8650, 151.0910], 2, 10, now),                   // between 2 and 3
      stopsPassed(list, list[4].coord, 0, 10, now),                          // GPS near stop 4, due in 10 min: only up to stop 2 (due now)
      stopsPassed(list, list[4].coord, 0, 10, now + 9 * MIN)];               // ... but 9 minutes later, yes
  }, MIN);
  check(JSON.stringify(sp) === '[2,2,2,4]', `stopsPassed: at stop 2 -> 2, between -> 2, near a stop not due yet -> 2 (no jump), later -> 4 (${sp.join(', ')})`);

  // Which service was boarded (max 2 minutes early, any amount late, closest expected time)
  const bd = await ev((MIN) => {
    const T = 1e12;
    const sv = (p, e, sel) => ({ planned: T + p * MIN, expected: T + e * MIN, selected: sel });
    return [
      boardedDifferentService(T, [sv(0, 0, true), sv(10, 10, false)]),        // on time
      boardedDifferentService(T, [sv(-5, 0, false), sv(10, 10, true)]),       // earlier one, running late
      boardedDifferentService(T, [sv(-15, -15, true), sv(12, 12, false)]),    // selected 15 late, no live data
      boardedDifferentService(T, [sv(5, 5, true)]),                           // left 5 min early, nothing else
      boardedDifferentService(T, [sv(1, 1, true)]),                           // left 1 min early
    ];
  }, MIN);
  check(JSON.stringify(bd) === '[false,true,false,true,false]', `boardedDifferentService: ${bd.join(', ')}`);

  // Cantonese voice: premium > enhanced > standard, novelty voices skipped
  const voice = await ev(() => {
    voiceList = [
      { lang: 'zh-HK', name: 'Sinji', voiceURI: 'com.apple.voice.compact.zh-HK.Sinji' },
      { lang: 'zh-HK', name: 'Sinji (Enhanced)', voiceURI: 'com.apple.voice.enhanced.zh-HK.Sinji' },
      { lang: 'zh-HK', name: 'Grandma', voiceURI: 'com.apple.eloquence.zh-HK.Grandma' },
      { lang: 'zh-TW', name: 'Meijia (Premium)', voiceURI: 'com.apple.voice.premium.zh-TW.Meijia' }];
    return cantoneseVoice().name;
  });
  check(voice === 'Sinji (Enhanced)', `cantoneseVoice: ${voice}`);

  // Chinese search for known stations
  const zh = await ev(() => localChineseMatches('伊頻').map((p) => `${p.zh}/${p.query}`));
  check(zh.join() === '伊頻站/Epping Station', `localChineseMatches 伊頻: ${zh.join()}`);

  // Uber link: drop-off position and name
  const up = await ev(() => Object.fromEntries(new URL(uberLink({ query: 'Burwood Station' },
    [{ legs: [{ destination: { coord: [-33.8771, 151.104] } }] }])).searchParams));
  check(up['dropoff[latitude]'] === '-33.8771' && up['dropoff[longitude]'] === '151.104' && up.pickup === 'my_location'
    && up['dropoff[formatted_address]'] === 'Burwood Station, NSW', 'uberLink: drop-off position, pickup = my location');

  check(t.errors.length === 0, `no page errors (${t.errors.join(' | ')})`);
  await t.close();
};
