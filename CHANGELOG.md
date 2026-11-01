# 爸媽出行 Sydney Trip Planner — change log

The version is shown at the bottom of **⚙️ 設定** (e.g. `版本 v1.0 · 2026-11-01`). If a phone shows an older version than the latest below, close the app fully (swipe it away) and open it again.

## What the app does (v1.0)

**Planning a trip**
- Start from 🏠 家 (saved home address) or 📍 現在位置 (current location).
- Leave ⏱️ 現在 (now) or 📅 預先計劃 (plan ahead: today / tomorrow / day after / any date; leave at or arrive by a time).
- 38 destination buttons (Chinese + English names), plus 🔍 其他地點 to search any station, address or place (English, or Chinese for known stations). Searched places can be saved with ⭐ 加到常去地點.
- Only public transport and walking — never cycling, driving or taxi legs.

**Trip list**
- 「X 分鐘後出門」 countdown, departure and arrival times (上午 / 下午), total time, number of changes, delays, service-notice warning.
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
### v1.1 — YYYY-MM-DD
- What changed
-->

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
