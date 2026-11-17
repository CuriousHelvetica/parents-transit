# How it works

## The pieces

```
iPhone (home-screen web app)
   │  static files from GitHub Pages
   │
   ├── Cloudflare Worker  ──►  Transport for NSW Trip Planner API   (trips, places)
   │       └──────────────►  Cloudflare Workers AI                  (notice translation)
   ├── OpenStreetMap Nominatim                                       (suburb and street for 📍 你在)
   ├── Apple Maps / Uber                                             (opened by link, nothing sent by the app)
   └── iPhone itself: GPS, speech, screen-on, storage
```

- **GitHub Pages** serves the files in this repository. There is no build step and no server of our own.
- **The Worker** exists to keep the Transport for NSW API key off the web page, and to add the headers browsers
  need. It only answers requests coming from the app's own address.
- **Everything personal stays on the phone** (`localStorage`): home address, places and their order, the theme,
  and translations already made.

## Files

| File | Role |
|---|---|
| `index.html` | Loads the styles, then `config.js`, `version.js`, `names.js`, `app.js`. Switches the theme file off before first paint when 主題 2 is chosen |
| `app.js` | The whole app: one file, plain JavaScript, no framework |
| `style.css` | All styles; on its own this is 主題 2 |
| `theme-sunrise.css` | Colours of 主題 1, layered on `style.css` |
| `names.js` | Chinese station names, and the default places and their order |
| `config.js` | The Worker's address |
| `version.js` | Version and date shown in 設定 |
| `worker/worker.js` | The Cloudflare Worker (deployed by pasting into the Cloudflare dashboard) |
| `tests/` | Automated tests (Playwright, with every outside service faked) |

## Screens

`app.js` draws one screen at a time into `<main id="app">`. Each screen is a function that starts by calling
`clearTimers()` (which stops timers and the main screen's GPS) and sets `state.screen`.

| Function | Screen |
|---|---|
| `showHome` | Main screen |
| `showPicker(kind)` | Start or destination list |
| `showSearchPlace(kind)` | 🔍 其他地點 |
| `showTrips(origin, dest, when, opts)` | Trip list |
| `showPlanPage(draft, done)` | 改時間及日期 |
| `showJourney(j, goBack, others, refetch)` | Trip details |
| `showTracking(leg, goBack, others, nextOf)` | Stop countdown |
| `showSettings(deleting, keepScroll)`, `showAddPlace(isHome)` | 設定 |

`state` holds only the start (`from`), the destination (`to`) and the current screen. The app always opens with
the start set to 家.

## Time

A time choice (`when`) is either `{ mode: 'now' }` or
`{ mode: 'later', date: 'YYYY-MM-DD', time: 'HH:MM', arrive: bool }`, always in Sydney time whatever the
phone's own time zone. `sydneyEpoch` converts to a timestamp, handling daylight saving. `stepWhen` moves 30
minutes and rounds to :00 or :30; stepping back past now returns to `now`.

## The trip list

**The time that matters** for a trip is when its first train or bus leaves its stop (`rideMs`). Cards show it,
and lists are ordered by it.

**Trips are kept in memory** for as long as a route's list is open (`newTripPool`):
- Each search asks Transport for NSW for 8 trips and records the stretch of time it covers.
- `tripsFor` builds what to show for the chosen time from memory; if that time isn't covered yet, the screen
  shows 「正在搜尋路線…」 and fetches it at once.
- In the background the app reads ahead about 3 hours (up to 3 searches at once), plus 2 steps behind, and at
  "now" the last 20 minutes, for trains that just left.
- Live times for the time on screen refresh every minute when it is within about 90 minutes, every 5 minutes
  otherwise, and at once when the app comes back from the background.
- Trips are matched between searches by first ride, lines used and planned arrival (`tripKey`).

**What the list shows**
- At "now": every trip whose train has not left, plus a folded line for those that left in the last 20
  minutes (at most 3).
- At a chosen leave-at time: trips starting from that time.
- At an arrive-by time: trips arriving in the hour before it; if none, the last one that makes it.
- At most 8 trips at a time.

**Redrawing.** The list is rebuilt only when its HTML changes. Every 15 seconds, if only the countdown text
changed, those lines are updated in place.

## Walking

`slowWalkMin` shows every walking time 40% longer than Transport for NSW's, rounded up. `tightChanges` flags a
change where the time between two rides is shorter than that. Nothing else is shifted.

## Service notices

`noticesOf` takes a ride's notices, strips their HTML with an inert parser, drops duplicates, puts important
ones first (priority high, veryHigh or urgent) and keeps three. Translation goes through the Worker; before
sending, station names and other place names are replaced with placeholders and put back afterwards as 中文 +
English. Up to 150 translations are remembered on the phone.

## The stop countdown

Uses the list of stops in the ride (`stopSequence`), each with a position and an expected time.

- **Reaching a stop** (`stopsPassed`): within a circle around the stop, or already past it towards the next
  one. The circle is 80 m, or GPS accuracy plus 30 m if larger, capped at 200 m and at half the distance to
  the nearest neighbouring stop. Readings less accurate than 300 m are ignored.
- **Timetable check:** a stop due more than 4 minutes from now is not considered, so a route that winds back
  near a later stop can't jump ahead. After a GPS gap it catches up in one go.
- **Boarding:** the vehicle counts as having left when the phone is more than 200 m from the first stop, or
  more than 100 m and moving faster than about 15 km/h. Stop times then shift to the real departure, earlier
  only. If the countdown is opened mid-ride, times are left alone.
- **Different service:** departures of the same line from the same stop are compared with the real departure;
  see the rule in [`DECISIONS.md`](DECISIONS.md).
- **No GPS:** after 45 seconds without a usable position, or if location is refused, a warning shows and the
  count follows the timetable, marked as an estimate and never reaching "arrived".
- **Alerts:** the screen flashes when one stop remains (only once on the way) and turns green on arrival.
- **Screen:** the app asks the iPhone to keep the screen on, and asks again whenever it returns from the
  background, restarting GPS at the same time.

## The Worker

| Path | What it does |
|---|---|
| `/tp/trip`, `/tp/stop_finder`, `/tp/departure_mon` | Passes the request to Transport for NSW with the API key added |
| `/translate?text=…` | Translates a notice; tries each model in turn until one answers |
| `/place?text=…` | Finds a place typed in Chinese (v1.9.1): one AI call says what was meant, up to 3 places with English and Chinese names and a kind; each is looked up in Transport for NSW at the same time, and `bestMatch` keeps the best real match (name must match; place itself > suburb > station/wharf > bus stop > street; no hotels, car parks, post offices). Places only ever come from Transport for NSW. Fast models first (`DEFAULT_PLACE_MODELS`, `PLACE_MODEL`), 12 s per model. `&debug=1` adds models, timings and raw answers. Answers that found something are remembered per text |
| `/status` | Lists the translation models in order and shows which one answered a test sentence |
| `/ics` | Makes a calendar file for the hidden reminder feature |

Settings live in the Cloudflare dashboard: `TFNSW_API_KEY` (secret), `ALLOWED_ORIGIN`, optional
`TRANSLATE_MODEL` (comma-separated models tried first), and the Workers AI binding named `AI`.

## Reliability measures

- Every network request gives up after 20 seconds, including while downloading the answer.
- 重試 repeats the same search with the same choices.
- If the phone refuses to save data, the app carries on without saving.
- An unexpected error shows 「出了點問題 — 按此重新開始」 instead of a frozen screen.
- `?debug=1` on the app's address shows hidden trips, raw transport types, notice priorities and location
  lookups.

## Settings that are easy to tune (`app.js`)

| Constant | Value | Meaning |
|---|---|---|
| `WALK_SLOW` | 1.4 | Walking times shown this many times longer |
| `LIVE_WINDOW_MIN` | 30 | Minutes before departure when walking directions and the countdown switch on |
| `DEPARTED_MIN`, `DEPARTED_MAX` | 20, 3 | How far back, and how many, "just left" trips are offered |
| `STEP_MS` | 30 min | Size of an earlier / later step |
| `SHOW_TRIPS` | 8 | Trips shown at a time |
| `ARRIVE_WINDOW_MS` | 60 min | Arrive-by lists show trips arriving within this long before the time |
| `STALE_SOON_MS`, `STALE_LATER_MS` | 3 min, 8 min | Age of live times before the stale warning shows |
| `NO_GPS_MS` | 45 s | No position for this long switches the countdown to the timetable estimate |
| `MAX_EARLY_MIN` | 2 | A service is assumed never to leave more than this early |
| `EARLY_MINUTES` | 4 | Countdown ignores stops due more than this far ahead |
| `SETTINGS_HOLD_MS` | 2 s | How long to hold ⚙️ 設定 |
| `HERE_MOVE_M`, `HERE_GAP_MS` | 150 m, 30 s | 📍 你在 looks up a new address after this much movement, at most this often |
| `FETCH_TIMEOUT_MS` | 20 s | Network time limit |
| `FEATURE_REMINDER` | false | Set to true to bring back ⏰ 提醒我 |

## 🔍 其他地點 in Chinese (v1.9.0)

1. `sameSydney` treats 雪梨 as 悉尼 and ignores spaces.
2. `localChineseMatches` looks in `ZH_NAMES` (stations) and `ZH_PLACES` (common places, with other spellings).
   An *exact* match (what was typed is part of a name) is shown alone, with no AI. A *partial* match (a known
   name inside what was typed, e.g. 車士活 in 車士活醫院) is shown first, and the AI is asked as well.
3. Otherwise the Worker's `/place` answers (the app waits up to 30 s, showing an estimate from the last five
   searches on the phone, kept under `parents-transit-place-ms`, and the seconds waited); `aiPlace` turns each place into a result. The icon and the word in
   the short line come from Transport for NSW's type (station, bus stop, street) or, for other places, from the
   AI's `kind`; the suburb comes from Transport for NSW. The AI never writes the short line itself.
4. The `ZH_PLACES` search names were checked against the live search (each resolves to itself as the best
   match). Recheck one with the app open on the real site and `searchPlaces('<name>')` in the browser console.
