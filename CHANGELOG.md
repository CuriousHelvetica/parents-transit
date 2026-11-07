# 爸媽出行 Sydney Trip Planner — change log

The version is shown at the bottom of **⚙️ 設定** (e.g. `版本 v1.0 · 2026-11-01`). If a phone shows an older version than the latest below, close the app fully (swipe it away) and open it again.

Numbering: bug fixes and small tweaks bump the last number (v1.2.1, v1.2.2 …); bigger new features bump the middle number (v1.3, v1.4 …).

## What the app does

**Main screen**
- 📍 你在: current suburb and street, following GPS while the main screen is open (「(位置未能更新)」 when there is no GPS, e.g. underground; tap to update).

**Planning a trip**
- Two questions, then 🔍 搜尋路線: 從哪裡出發? (家, 現在位置, any saved station, or 🔍 其他地點) and 去哪裡? (回家, any saved station, or 🔍 其他地點).
- The trip list starts at leave now; the time is changed on the list (see below).
- 39 saved stations (Chinese + English names) in both lists, plus 🔍 其他地點 to search any station, address or place (English, or Chinese for known stations). A searched destination can be saved with ⭐ 加到常去地點.
- Only public transport and walking — never cycling, driving or taxi legs.

**Trip list**
- 「X 分鐘後出門」 countdown, departure and arrival times (凌晨 / 清晨 / 早上 / 中午 / 下午 / 晚上), total time, number of changes, delays, service-notice warning.
- In time order (earliest departure first). Arrive-by: only trips arriving in the hour before the chosen time. At 現在, trains and buses that left in the last 20 minutes are shown greyed at the top (「火車已開出 X 分鐘」), so someone who jumped on in a rush can still open theirs.
- Time bar: ◀ 早一點 / 遲一點 ▶ move 30 minutes (rounded to :00 or :30), ⏱️ 現在 goes back to leave now, 📅🕘 改時間及日期 picks a day and a leave-at or arrive-by time. Trips already fetched for the route are kept in memory, so ◀ ▶ show trips at once while live times refresh in the background.
- Updates automatically (every minute for trips leaving within about 90 minutes, every 5 minutes for later ones).
- 🚕 改搭 Uber? 查看價錢 (always; a price guide for planned trips): opens Uber with pickup = current location and the destination filled in.

**Trip details**
- Step by step: walk / board (platform or bus stand, direction, number of stops) / get off (🔄 change or 📍 destination) / 🏁 arrive.
- Service notices translated into Traditional Chinese (Cloudflare Workers AI); station names kept as Chinese + English, other place names and Opal kept in English; English original one tap away.
- 🔊 朗讀: reads the steps aloud in Cantonese (directions in short English, as on station displays); tap again to stop.
- ⏰ 提醒我 (hidden since v1.3.3): adds a calendar event with an alarm before leaving time.
- 顯示途經車站: every stop with times; 🔔 on the stop before the one to get off at.
- From 30 minutes before departure:
  - 🗺️ 地圖指路: Apple Maps walking directions to each stop.
  - 📍 上車後按這裡:還有幾個站: GPS countdown of stops; whole screen flashes 「🔔 下一站下車 請按鐘!」 when the next stop is theirs and turns green 「📍 到站,請下車!」 on arrival. Keeps the screen on (iOS 18.4+), adapts to GPS accuracy, catches up after GPS gaps. Shows 「✓ 已上車」 once the vehicle leaves; if they caught an earlier or later service on the same line, the stop times follow the real departure, and a yellow 「⚠️ 可能不是原定班次」 note asks them to check the display shows their stop.

**Settings (⚙️ 設定)**
- Home address, frequent places (add, delete, reorder), Cantonese voice test, restore defaults. (Reminder lead time hidden with ⏰ 提醒我.)
- Everything personal is stored only on the phone.

## History

<!-- Add new versions here (below this note), newest first:
### vX.Y(.Z) — YYYY-MM-DD
- What changed
-->

### v1.5.7 — 2026-11-07
- 改時間及日期 fits on one iPhone screen: title beside ✕ 取消, two-line day buttons (今天 / 11月7日 (六)), 「或選擇其他日子」 beside its date box, and the summary shown on the ✓ 確定 button instead of a separate card.
- 🚕 改搭 Uber? 查看價錢 is always available, not only from 30 minutes before departure: Uber shows today's price from where the phone is, as a guide.

### v1.5.6 — 2026-11-07
- Arrive-by lists (改時間及日期 → 🏁 到達時間) now show only the trips arriving in the hour before the chosen time, earliest first, so the one that arrives just in time is in view instead of at the bottom of a 2-hour list. On a quiet line with nothing in that hour, the last trip that still makes it is shown. ◀ 早一點 for earlier ones.

### Worker update — 2026-11-07 (paste `worker/worker.js` into Cloudflare again)
- Cloudflare retires `@cf/qwen/qwen3-30b-a3b-fp8` on 20 November 2026. Translation now uses `@cf/qwen/qwen3.8-27b`, and falls back to `@cf/google/gemma-4-26b-a4b-it` (or the next in the list) by itself if a model fails.
- `TRANSLATE_MODEL` can now hold several models, comma-separated, tried first. New `/status` page shows the model order and which one answers.

### v1.5.5 — 2026-11-07
- Start and destination lists always show every place, each in the same spot (回家 now fills the first row of the destination list, like 家 + 現在位置 in the start list), so places can be found by position. The place already chosen on the other side is greyed out in its spot instead of being removed.

### v1.5.4 — 2026-11-07
- 賓士鎮站 Bankstown added to the default places (after 菲林明頓站 Flemington) and to the Chinese station names. Phones that already have their places saved don't change by themselves: add it in ⚙️ 設定 → ➕ 新增地點 (the Chinese name is filled in), or 還原預設.

### v1.5.3 — 2026-11-06
Code review fixes:
- Service notices are cleaned with a safe parser: HTML inside a notice can no longer run anything in the app.
- Trains that just left (at ⏱️ 現在) are now fetched first, so they appear one search sooner.
- The trip list no longer rebuilds itself every 15 seconds: the 「X 分鐘後出門」 lines update in place, and the page is only redrawn when something else changed (a rebuild under a finger could lose a tap).
- Two trips that share the first train but take different connections are no longer merged into one.
- Coming back to the app from another app refreshes the trip list's live times at once.
- 「更新時間」 shows when the trips on screen were fetched, not the last background search.
- Smaller memory and bookkeeping while a list stays open for a long time; unused styles removed; docs updated for the 30-minute rule.
- Automated tests added in `tests/` (`npm test`): about 140 checks across logic, main screen, trip list, details, countdown and layout.

### v1.5.2 — 2026-11-06
- Jumped on in a rush? At ⏱️ 現在 the list now also shows, greyed at the top, up to 3 trips whose train or bus left in the last 20 minutes: 「火車已開出 X 分鐘 · 如已上車,按此查看下車站」. Tapping one opens its stops and 📍 還有幾個站 as usual; its details page says 已開出 instead of 已錯過.
- 📍 你在 is now live while the main screen is open: GPS follows the phone and the suburb and street update after moving about 150 m (at most every 30 seconds). GPS stops on other screens and when the app is hidden. With no position for a minute (e.g. underground), the last place stays with 「(位置未能更新)」. Tapping it uses a fresh position.

### v1.5.1 — 2026-11-05
- Faster ◀ 早一點 / 遲一點 ▶: about 3 hours of trips after the time on screen (and 2 steps before it) are now fetched in the background, up to 3 blocks at once, so quick taps no longer wait for a search. A time that isn't in memory yet is fetched straight away instead of after the taps stop.

### v1.5.0 — 2026-11-05
- Main screen asks only 從哪裡出發? and 去哪裡? (no numbers); 🔍 搜尋路線 always starts at leave now.
- The time is set on the trip list: ◀ 早一點 · ⏱️ 現在 · 遲一點 ▶, and 📅🕘 改時間及日期 underneath. The chosen time shows above the bar, e.g. 「今天 下午 5:00 出發」.
- ◀ ▶ move 30 minutes and round to the nearest :00 or :30 (e.g. 3:40 → 4:00, 3:56 → 4:30). 早一點 is greyed out at 現在, and stepping back past now returns to 現在. For an arrive-by plan they move the arrival time.
- 改時間及日期 opens the same page as before (出發 is the default, 到達 on the right); ✓ 確定 / ✕ 取消 return to the list.
- Trips fetched for the route stay in memory, and the next step either way is fetched in the background, so ◀ ▶ show trips at once. Live times refresh after the taps stop.
- 🔁 最少轉車 / ⚡ 最快 removed: trips are listed by departure time (the badges show the changes).

### v1.4.0 — 2026-11-02
- 📍 還有幾個站 now notices when the train or bus actually leaves (GPS distance and speed) and shows 「✓ 已上車」.
- Catching a different service on the same line (one earlier or later) works: the stop times shift to the real departure, so the countdown still crosses off stops.
- If the real departure points to a different service than the card they opened, a yellow note says 「⚠️ 可能不是原定班次 — 請看月台或車上顯示屏，確認會停 (their stop)」, in case it is an express that skips their stop. Rule: a service can leave at most 2 minutes early but any amount late (live times used when known); the closest fit is picked. With no other services listed, the note shows only if they left more than 2 minutes before the card's time.

### v1.3.8 — 2026-11-02
- 🗺️ 地圖指路, 📍 還有幾個站 and 🚕 Uber are available from 30 minutes before departure, however the trip was searched (現在 or 預先計劃); earlier they show greyed out with 「出發前 30 分鐘才可使用」, and switch on by themselves when the time comes.
- Folded service notices line is now plain grey, so only red important notices stand out.
- English names shown the same size as the Chinese (slightly larger English on the big buttons too).

### v1.3.7 — 2026-11-02
- Service notices: routine ones fold away under 「⚠️ 服務通知 (N) — 按此查看」; only high-priority ones stay open (red, 重要服務通知). Trip cards say 「⚠️ 有重要服務通知」 or a quiet 「ℹ️ 有一般服務通知」. ?debug=1 shows each notice's priority.
- Walking from 家: the first walk gets 5 extra minutes (e.g. 7 → 12), so they leave 5 minutes earlier for the same bus/train.
- 🔊 朗讀: a short pause is spoken first so iPhone no longer clips the first word.

### v1.3.6 — 2026-11-02
- Header card: 爸媽出行 only (English title removed); date line 「現在 11月2日 星期一・晚上 7:30」; 📍 location moved under a thin divider with the suburb on one line and the street on the next, so long names no longer squeeze the title.

### v1.3.5 — 2026-11-02
- Main screen: title, time and 📍 location in a white card, and the three questions numbered ① 從哪裡出發? ② 甚麼時候? ③ 去哪裡?, so the header stands apart and the steps read in order.

### v1.3.4 — 2026-11-01
Reliability review:
- Network requests give up after 20 seconds (「無法連接伺服器,請檢查網絡。(連線逾時)」) instead of 「正在搜尋路線…」 forever.
- 重試 repeats the same search instead of reloading the app (keeps the chosen start, destination and time).
- A 預先計劃 time that has gone stale (or a past date) moves forward automatically.
- If iPhone refuses to save data (full storage / private browsing), the app keeps working.
- Safety net: an unexpected error shows 「出了點問題 — 按此重新開始」 instead of a frozen screen.
- 還原預設 confirmation says it also resets the home address and saved places.

### v1.3.3 — 2026-11-01
- ↺ 重新開始 button on the main screen (next to ⚙️ 設定): back to 家 / 現在 / no destination. Saved places are not affected.
- ⏰ 提醒我 and the 出門提醒 setting are hidden for now (code kept; FEATURE_REMINDER in app.js turns them back on).

### v1.3.2 — 2026-11-01
- 📅 預先計劃: for 今天, only times from the next 5-minute slot onwards (past hours and minutes not offered); other days keep the full list. Switching to 今天 moves an earlier time to the earliest available; 今天 is greyed out when nothing is left today.

### v1.3.1 — 2026-11-01
- 📅 預先計劃 opens its own page (哪一天? / 出發還是到達? / 幾點? and a summary), with ✕ 取消 (discard) and ✓ 確定 (save). Defaults to today, next round hour. The main-screen button then shows the plan, e.g. 「明天 早上 9:30 出發」; ⏱️ 現在 stays one tap.
- Fixed the 📍 現在位置 button in the start list (was half width, text cut off).

### v1.3 — 2026-11-01
- Simpler main screen: three questions, then search. 從哪裡出發? and 去哪裡? are one line each; tapping opens a full list (家 / 現在位置 or 回家, the saved places in 設定 order, 🔍 其他地點 at the bottom of both). Then 🔍 搜尋路線.
- Any saved station (or searched place) can now be the starting point, not only 家 / 現在位置.
- The starting point always resets to 家 when the app opens; a place can't be both start and destination.

### v1.2.5 — 2026-11-01
- Trip list heading shows English under the Chinese, e.g. 「家 → 寶活站」 / Home → Burwood.

### v1.2.4 — 2026-11-01
- Times now use time-of-day words everywhere (screen and read-aloud): 凌晨 (0–4), 清晨 (5–6), 早上 (7–11), 中午 (12), 下午 (1–5 pm), 晚上 (6–11 pm), e.g. 「晚上 7:30 出發」.
- 📅 預先計劃: two wheels instead of three — one hour wheel in daily order (清晨 5時 … 晚上 11時, then 凌晨 12時 … 4時) and minutes in 5-minute steps.

### v1.2.3 — 2026-11-01
- 📅 預先計劃: time is now picked with three small wheels — 上午/下午, hour, minutes in 5-minute steps — instead of iPhone's time picker with all 60 minutes.

### v1.2.2 — 2026-11-01
- 🔊 朗讀: same Cantonese voice every time — picks premium > enhanced > standard by a fixed rule, skips Apple's novelty/Eloquence voices, and loads the voice list at start-up.

### v1.2.1 — 2026-11-01
- 📍 你在: street now looked up with OpenStreetMap first (nearest road; Transport for NSW returned a nearby address on the next street), Transport for NSW as backup. Credit line 「地址資料 © OpenStreetMap」 in 設定.

### v1.2 — 2026-11-01
- 📍 你在: when no location could be found, shows a tappable 「📍 按此顯示位置」 instead of a blank space; the ?debug=1 page shows why (permission, timeout, lookup errors).

### v1.1 — 2026-11-01
- Main screen: 📍 你在 shows the current suburb (Chinese + English) and street, top right. Updated when the main screen opens (at most every 2 minutes) and when tapped; suburb only when GPS is imprecise; nothing shown if location is unavailable. Address lookup via Transport for NSW, OpenStreetMap as fallback (order swapped in v1.2.1).

### v1.0 — 2026-11-01
First complete version, built and refined over 31 Oct – 1 Nov 2026. Highlights in order:
- Core trip planner (Traditional Chinese, Transport for NSW data via Cloudflare Worker), Cantonese read-aloud, calendar reminders.
- Standard written Chinese; plan ahead (date, leave-at / arrive-by); translated service notices.
- Fixed walking legs that were really cycling/driving; only public transport + walking shown.
- Fewest-changes / fastest sort; station names protected in translations (later also Opal and unknown place names).
- 39 stations with Chinese names (incl. 卡市 (越南城)); 38 default buttons; 🔍 其他地點 search.
- 12-hour times (上午/下午); friendlier icons (🔄 / 📍); read-aloud start/stop toggle; directions read in short English.
- App renamed 爸媽出行; heart icon with matching 5-colour palette.
- 🚕 Uber price button; 🗺️ Apple Maps walking directions; stop list and live GPS stop countdown.
- Fixed iPhone time picker closing early; robustness fixes for the countdown (adaptive radius, timetable check, screen-on, resume after switching apps).
