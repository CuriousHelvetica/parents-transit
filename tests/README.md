# Tests

Automated checks for the app, run in a real (headless) Chromium browser with Playwright.
Transport for NSW, OpenStreetMap and the translation service are **faked** inside the tests,
so no keys or internet access are needed and nothing real is called.

## Run

```bash
npm install
npx playwright install chromium
npm test
```

Run one area only, e.g. the trip list: `node tests/run.js trips`.
Each check prints `PASS` or `FAIL`; the run ends with a summary and exits with an error if anything failed.

## What is covered

| File | Covers |
|---|---|
| `logic.test.js` | Time words, Sydney time and daylight saving, ◀ ▶ rounding, plans never in the past, notice text cleaning (HTML can't run), notice priority (important ones kept), slower walking and tight changes, trips listed until the train leaves, station names kept out of translation, trip matching, slower walk from home, ◀ ▶ memory bookkeeping, stop countdown maths, which service was boarded, Cantonese voice choice, Chinese place search, Uber link |
| `home.test.js` | Main screen (two questions), start / destination lists, ↺ 重新開始, 🔍 其他地點, ⚙️ 設定 (move, delete, add, restore, voice test, version), live 📍 你在 (movement, 30 s gap, GPS on/off with the screen, tap, no GPS, no permission) |
| `trips.test.js` | Trip list in time order, ◀ 早一點 · ⏱️ 現在 · 遲一點 ▶ (rounding, instant from memory, quick tapping on a slow network), 改時間及日期 (cancel, arrive-by), back from details, offline + 重試, 30-minute rule for live buttons, trains that just left (folded), stale-times warning, details refresh, scroll position, two trips sharing a first train, errors, ⭐ save, 15-second updates without redrawing, refresh when coming back to the app |
| `details.test.js` | Steps, platform, direction, stop list, service notices (translated, severe open, routine folded, HTML harmless, remembered), map link, 🔊 朗讀 |
| `countdown.test.js` | 📍 還有幾個站 on a simulated bus ride (🔔 and arrival alerts), no GPS signal, location refused, one-stop rides, the 下一程 button, and the 「可能不是原定班次」 note for earlier / later services |
| `lesswalk.test.js` | Fastest + least-walking trips in one list: both asked for the same time, both kinds shown in time order, no duplicates, at most 4 requests a second, a failed least-walking request doesn't stop the list or drop trips |
| `search.test.js` | 🔍 其他地點 in Chinese through the AI (faked `/place`): icons, short lines, 🤖 note, known station first, waiting estimate and seconds, not-found message, both themes, 320 px |
| `worker.test.js` | The Cloudflare Worker with a fake Workers AI: model order, automatic fallback when a model is retired, `TRANSLATE_MODEL`, `/status`, origin checks, `/place` (one AI call, 雪梨 → 悉尼, best real match by rules on real-looking results, slow or retired models skipped, `PLACE_MODEL`, `debug=1`, errors) |
| `layout.test.js` | Every screen fits at 393, 375 and 320 px wide |

`helpers.js` holds the shared set-up: a small web server for the app, the fake services, and the fake
trip data (a Rhodes → Burwood train or bus with five stops, answering like the real trip planner).

To check an older copy of the app with these tests: `APP_ROOT=/path/to/old/copy npm test`.
