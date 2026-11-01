# 爸媽出行 Sydney Trip Planner — change log

The version is shown at the bottom of **⚙️ 設定** (e.g. `版本 v1.0 · 2026-11-01`). If a phone shows an older version than the latest below, close the app fully (swipe it away) and open it again.

Numbering: bug fixes and small tweaks bump the last number (v1.2.1, v1.2.2 …); bigger new features bump the middle number (v1.3, v1.4 …).

## What the app does

**Main screen**
- 📍 你在: current suburb and street (tap to update).

**Planning a trip**
- Start from 🏠 家 (saved home address) or 📍 現在位置 (current location).
- Leave ⏱️ 現在 (now) or 📅 預先計劃 (plan ahead: today / tomorrow / day after / any date; leave at or arrive by a time).
- 38 destination buttons (Chinese + English names), plus 🔍 其他地點 to search any station, address or place (English, or Chinese for known stations). Searched places can be saved with ⭐ 加到常去地點.
- Only public transport and walking — never cycling, driving or taxi legs.

**Trip list**
- 「X 分鐘後出門」 countdown, departure and arrival times (凌晨 / 清晨 / 早上 / 中午 / 下午 / 晚上), total time, number of changes, delays, service-notice warning.
- Sort by 🔁 最少轉車 (fewest changes, default) or ⚡ 最快 (fastest).
- Updates automatically (every minute for trips leaving now).
- 🚕 改搭 Uber? 查看價錢 (trips leaving now): opens Uber with pickup = current location and the destination filled in.

**Trip details**
- Step by step: walk / board (platform or bus stand, direction, number of stops) / get off (🔄 change or 📍 destination) / 🏁 arrive.
- Service notices translated into Traditional Chinese (Cloudflare Workers AI); station names kept as Chinese + English, other place names and Opal kept in English; English original one tap away.
- 🔊 朗讀: reads the steps aloud in Cantonese (directions in short English, as on station displays); tap again to stop.
- ⏰ 提醒我: adds a calendar event with an alarm before leaving time.
- 顯示途經車站: every stop with times; 🔔 on the stop before the one to get off at.
- Trips leaving now:
  - 🗺️ 地圖指路: Apple Maps walking directions to each stop.
  - 📍 上車後按這裡:還有幾個站: GPS countdown of stops; whole screen flashes 「🔔 下一站下車 請按鐘!」 when the next stop is theirs and turns green 「📍 到站,請下車!」 on arrival. Keeps the screen on (iOS 18.4+), adapts to GPS accuracy, catches up after GPS gaps.

**Settings (⚙️ 設定)**
- Home address, frequent places (add, delete, reorder), reminder lead time (5 / 10 / 15 min), Cantonese voice test, restore defaults.
- Everything personal is stored only on the phone.

## History

<!-- Add new versions here (below this note), newest first:
### vX.Y(.Z) — YYYY-MM-DD
- What changed
-->

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
