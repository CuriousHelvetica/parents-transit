# 爸媽出行 Sydney Trip Planner — simple Sydney trip planner in Traditional Chinese

A home-screen web app for getting around Sydney by train and bus. Big buttons, Traditional Chinese (standard written) with English place names, Cantonese read-aloud, and live Transport for NSW times.

- **Main screen:** two questions — where to (home, any saved station or a searched place) and where from (already set to home; or current location, a station, a searched place) — then 🔍 搜尋路線. Current suburb and street shown in the header card, updating live while the main screen is open.
- **Results:** when each train or bus leaves ("6:21 pm · in 21 minutes"), the walk to it at a slower pace, live delays, and the line badges for each trip. Listed by departure time, starting from now; ◀ earlier / ⏱️ now / later ▶ (30-minute steps) and 📅🕘 change time and date. Trips are kept in memory so stepping is instant. Updates every minute.
- **Trip details:** step by step, with platform or bus stand, number of stops, and where to change and get off.
- **⚠️ Service notices:** translated into Traditional Chinese with Cloudflare Workers AI, with the English original one tap away.
- **🔊 朗讀:** reads the steps aloud in Cantonese, using the iPhone's built-in voice.
- **⏰ 提醒我:** (hidden since v1.3.3) adds a calendar event with an alarm before it's time to leave.
- **⚙️ 設定:** set the home address, and add, remove or reorder places. All of this is stored only on the phone.

**Setup:** see [SETUP.md](SETUP.md). **What changed:** see [CHANGELOG.md](CHANGELOG.md).

## Files
| File | What it is |
|---|---|
| `index.html`, `app.js`, `style.css` | The web app (hosted on GitHub Pages) |
| `theme-sunrise.css` | Colours of 主題 1 (the default), layered on `style.css`; switched off for 主題 2 |
| `names.js` | Chinese names for stations and the default places |
| `config.js` | Address of your Cloudflare Worker |
| `worker/worker.js` | Cloudflare Worker that holds the API key, passes requests to Transport for NSW, translates notices and makes reminder calendar files |
| `tests/`, `package.json` | Automated tests (not part of the app) |
| `docs/` | Project notes: design goals and rules, the decision log, how the code works, working preferences, open items |
| `CLAUDE.md` | Short hand-over notes, read automatically by Claude Code |

Data: [Transport for NSW Open Data](https://opendata.transport.nsw.gov.au) Trip Planner API.

## Tests

Automated checks in a headless browser, with Transport for NSW and the other services faked:

```bash
npm install
npx playwright install chromium
npm test
```

See [tests/README.md](tests/README.md) for what they cover.
