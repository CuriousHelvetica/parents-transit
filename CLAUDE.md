# Notes for Claude (and anyone else picking this project up)

Read this first. It holds what the code, CHANGELOG.md and SETUP.md don't: how the owner wants to work,
why things are the way they are, and what is still open.

This is the short version. The full notes are in `docs/`: `DESIGN.md` (goals and rules), `DECISIONS.md`
(what was chosen and why), `ARCHITECTURE.md` (how the code works), `HOW-WE-WORK.md` (working preferences)
and `OPEN-ITEMS.md` (unverified and parked items, real-phone checklist). Read the relevant one before a
change in its area, and keep them in step with the app.

## What this is

爸媽出行 is a home-screen web app that plans Sydney public transport trips in Traditional Chinese.
The users are the owner's parents: about 80 years old, Cantonese speakers, limited English, on iPhones.
The owner (their adult child) sets it up and tests it; the parents only use it.

Every decision is judged against that: large text, few choices, nothing that moves around, no jargon,
and nothing that can be broken by a stray tap.

- App: static files on GitHub Pages, `https://curioushelvetica.github.io/parents-transit/`
- Data: Transport for NSW Trip Planner API, through a Cloudflare Worker (`worker/worker.js`) that holds the API key
- Translation of service notices: Cloudflare Workers AI, in the same Worker
- No build step. `index.html` loads `style.css`, `theme-sunrise.css`, then `config.js`, `version.js`, `names.js`, `app.js`.

## How the owner wants to work

- **Ask before building.** Ask clarifying questions, don't guess, don't jump to conclusions. Verify facts
  (read the code, run a test, search) before stating them, and say plainly when something could not be verified.
- **Mock up UI changes first.** Screenshot the real app with the change faked in, send it, and wait for a choice.
  Offer options with a recommendation.
- **Explain in plain language.** The owner is technical enough to follow, but wants outcomes, not code tours.
- **Versions:** small fixes bump the last number (v1.7.1 → v1.7.2); new features bump the middle (v1.8.0).
  Update `version.js` (version and date) and add a CHANGELOG.md entry with every change. The version shows at
  the bottom of 設定, which is how the owner checks a phone has the update.
- **Shipping:** run `npm test` and push only if everything passes. Push straight to `main` (no pull requests).
  Then confirm the "pages build and deployment" run for that commit succeeded, and say so.
- **Docs:** keep CHANGELOG.md ("What the app does" at the top, then history), SETUP.md and README.md in step
  with the behaviour.
- **Privacy:** the repository is public. Never commit the parents' home address or any personal detail.
  The home address is set on each phone (設定 → 住址) and stays there. The default home is "Rhodes Station"
  on purpose.

## Things that are easy to get wrong

- **This environment cannot reach Transport for NSW, OpenStreetMap or Cloudflare.** Everything is tested against
  fakes in `tests/helpers.js`. Say so when reporting, and list what the owner should try on a real phone.
- **The Worker is deployed by hand.** A change to `worker/worker.js` does nothing until the owner pastes the file
  into the Cloudflare dashboard (Workers & Pages → parents-transit → Edit code → Deploy). Avoid Worker changes
  unless needed; when one is needed, walk the owner through it and have them open `<worker address>/status`.
- **Workers AI may return JSON answers already decoded** (an object in `response`, not text). `runModel` handles
  both; v1.9.0–v1.9.1 missed this and every place search failed.
- **Translation models get retired.** The Worker tries `TRANSLATE_MODEL` (dashboard setting, comma-separated)
  and then `DEFAULT_TRANSLATE_MODELS`, moving to the next on failure. See SETUP.md, "Translation models".
- **Phones keep their own settings.** Saved places and the home address live in `localStorage`. Changing
  `names.js` defaults only affects fresh installs or 還原預設; tell the owner how to apply a change by hand.
- **iPhone specifics:** web apps can't vibrate (alerts are visual); the screen-on request needs iOS 18.4+ and is
  dropped whenever the app goes to the background; the time picker ignores `step`, so the app uses `<select>`s;
  the first word of speech is clipped without a warm-up utterance; the system may restart the app after a
  phone call or a visit to another app.
- **Long presses.** Older users press slowly. On iPhone a long press on selectable text starts a text selection
  and the tap is lost, so everything that is pressed has `user-select: none` (`style.css`). Give any new
  pressable element the same; the layout tests check it.
- **No double-tap zoom.** `touch-action: manipulation` on every element (`style.css`; on `html, body` alone it
  didn't work on iPhone) plus a guard in `app.js` that cancels a quick second tap on plain text. Pinch zoom is
  deliberately kept (don't add `user-scalable=no`). The owner confirmed on their iPhone that v1.8.3 stops the zoom.
- **Redrawing under a finger loses taps.** Lists and the countdown only re-render when the HTML actually changed,
  and update countdown text in place. Keep it that way.

## Design decisions and why

- **Departure times, not "leave home" times** (v1.6.0). Cards show when the first train or bus leaves its stop
  (「晚上 6:21 開車 · 21 分鐘後」) plus the walk to it. The parents judge when to leave. An earlier design
  shifted times for slow walking and made trips vanish while they walked to the station.
- **Walking times are shown 40% longer** (`WALK_SLOW`), rounded up. Display only: no train or arrival time is
  moved. The 40% is an estimate; tune it when the owner reports their real walking times.
- **Trips stay listed until the train has left.** If the walk is longer than the time left, a hint shows; the
  trip is never hidden. Tight changes are flagged the same way.
- **Trains that just left** (last 20 minutes, at 現在 only) sit under one folded line, so someone who jumped on
  in a rush can open theirs without pushing coming trips down the screen.
- **Time is chosen on the trip list**, not the main screen: ◀ 早一點 · ⏱️ 現在 · 遲一點 ▶ in 30-minute steps
  rounded to :00/:30, and 改時間及日期. Arrive-by lists show only the hour before the chosen time.
- **Trips are kept in memory and read ahead** (about 3 hours) so stepping is instant. A warning shows only when
  live times are stale; there is no "updated at" line.
- **Main screen asks 去哪裡 first**, then 從哪裡出發 (already 家). 回家 at the top of the destination list goes
  straight to trips from the current location.
- **Lists never reorder or drop items.** Every place has the same spot in both lists (muscle memory); the place
  chosen on the other side is greyed, not removed.
- **Stop countdown (還有幾個站):** GPS-based, with an adaptive radius and a timetable check so a winding route
  can't jump ahead. It detects boarding, follows an earlier service, and warns when the service looks different
  from the one chosen (a service may leave at most 2 minutes early, any amount late). Without GPS it warns and
  counts by the timetable, marked as an estimate. **「到站」 is only ever said from GPS.**
- **Live buttons** (walking directions, countdown) work from 30 minutes before departure and are greyed with
  the reason before that, so nothing seems to vanish. Uber is always available.
- **Service notices:** important ones stay open, routine ones fold away; station names are protected from the
  AI translation and shown as 中文 + English; notice HTML is parsed safely.
- **Two colour themes** (v1.8.0), chosen in 設定 → 主題 and saved per phone. 主題 1 (default) is
  `theme-sunrise.css` layered on `style.css`; 主題 2 is `style.css` alone. The owner chose 主題 1 to match the
  app icon, with a flat cream page, the system font and a pale peach main button (their choice, knowing it is
  quieter). **Any new screen or element must be styled and checked in both themes**; the layout tests run under
  both. If 主題 2 falls out of use, fold 主題 1 into `style.css` and remove the switch.
- **設定 is for the owner:** it opens after a 2-second hold, reordering is by drag handle, and deleting is a
  separate mode.
- **Chinese search** (v1.9.0): 🔍 其他地點 matches `ZH_NAMES` and `ZH_PLACES` (names.js) first, then asks the
  Worker's `/place` (v1.9.1: one fast AI call says what was meant; `bestMatch` picks the real Transport for NSW
  place by rules; `&debug=1` shows models and timings). The app waits up to 30 s with an estimate on screen. 雪梨 = 悉尼. AI results are marked 🤖 and
  their short line is only kind + suburb. New `ZH_PLACES` entries: check the search name on the live site first.
- **⏰ 提醒我 is hidden** (`FEATURE_REMINDER = false`): the calendar-file flow was too clumsy. Code is kept.

## Open items

Not verified (needs the real service or a real phone):
- How Transport for NSW marks a **cancelled** service in trip results. The app has no check for it. Ask the
  owner to open a cancelled trip with `?debug=1`.
- Whether cards **flicker** as overlapping background searches replace each other's trips.
- The no-GPS countdown in a real tunnel; dragging to reorder on a real iPhone; the +40% walking pace.
- Whether OpenStreetMap labels the Harbour Bridge as Milsons Point (📍 你在).
- How well the AI Chinese search handles names the app doesn't know; the new Fish Market is not in Transport for NSW's data.

Parked, owner's decision needed before building:
- Remembering the open trip or countdown when the iPhone restarts the app.
- Opening with no connection (service worker). Judged not worth the risk of phones stuck on an old version.
- An easier reminder than a calendar file (web push was the preferred idea).
- The Worker only checks the page's origin, so it can be called by non-browser programs. Left as is.

## Tests

`npm install`, `npx playwright install chromium`, `npm test` (about 2 minutes). See `tests/README.md`.
Every check states an expected result. When behaviour changes, update the checks and add ones for the new
behaviour; when a check fails, find out whether the app or the check is wrong before changing either.
`?debug=1` on the app shows hidden trips, raw transport classes, notice priorities and location lookups.
