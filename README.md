# 出行 — simple Sydney trip planner in Traditional Chinese

A home-screen web app for getting around Sydney by train and bus. Big buttons, Traditional Chinese (standard written) with English place names, Cantonese read-aloud, and live Transport for NSW times.

- **Main screen:** start from 🏠 home or 📍 current location, now or planned ahead (any day, leave at or arrive by a time), then tap a saved place.
- **Results:** "leave in X minutes", live delays, and the line badges for each trip. Sort by 🔁 fewest changes (direct trips first) or ⚡ fastest. Updates every minute.
- **Trip details:** step by step, with platform or bus stand, number of stops, and where to change and get off.
- **⚠️ Service notices:** translated into Traditional Chinese with Cloudflare Workers AI, with the English original one tap away.
- **🔊 朗讀:** reads the steps aloud in Cantonese, using the iPhone's built-in voice.
- **⏰ 提醒我:** adds a calendar event with an alarm before it's time to leave.
- **⚙️ 設定:** set the home address, and add, remove or reorder places. All of this is stored only on the phone.

**Setup:** see [SETUP.md](SETUP.md).

## Files
| File | What it is |
|---|---|
| `index.html`, `app.js`, `style.css` | The web app (hosted on GitHub Pages) |
| `names.js` | Chinese names for stations and the default places |
| `config.js` | Address of your Cloudflare Worker |
| `worker/worker.js` | Cloudflare Worker that holds the API key, passes requests to Transport for NSW, translates notices and makes reminder calendar files |

Data: [Transport for NSW Open Data](https://opendata.transport.nsw.gov.au) Trip Planner API.
