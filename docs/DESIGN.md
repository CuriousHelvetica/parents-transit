# Design: goals, rules and intent

## Who it is for

Two people, both about 80, living in Sydney. They speak Cantonese and read Traditional Chinese; their English
is limited, and they find English place names hard to pronounce. They travel by train and bus, mostly from
home to a set of familiar places, on iPhones with mobile data. Their Opal cards top up automatically.

The existing apps did not work for them: the official ones are in English, and general map apps were too
complicated and only partly in Chinese. They often missed trains because working out when to leave was hard.

The owner (their adult child) builds and sets up the app, and is the only person who changes settings.

## Goals

1. **Answer one question well: which train or bus, when, and where do I get off?**
2. **Readable without English.** Everything in Traditional Chinese (standard written Chinese, not colloquial
   Cantonese), with the English place name beside it so it can be matched to station signs.
3. **Reliable above clever.** A wrong or stale answer is worse than a plain one. When the app can't be sure,
   it says so.
4. **Free to run.** GitHub Pages, a free Cloudflare Worker, and the free Transport for NSW data.
5. **Nothing to maintain on the phones.** A home-screen icon that updates itself.

## Design rules

These came out of real use and should be kept unless the owner decides otherwise.

**Clarity**
- Large text. Small grey text is the exception and is never the only place something important appears.
- Chinese first, English beside it at the same size: 「寶活站 Burwood」.
- Times use day-part words, not am/pm: 凌晨 (0–4), 清晨 (5–6), 早上 (7–11), 中午 (12), 下午 (1–5 pm),
  晚上 (6–11 pm). Example: 「晚上 7:30」.
- Status is always a word, never colour alone (「延誤 4 分鐘」, 「準時」).
- Train, metro, bus, ferry and light rail badges keep the official Transport for NSW colours.

**Few choices, fixed places**
- The main screen asks two questions. Everything else has a sensible default.
- **Nothing moves.** Lists never reorder or drop items; every station is in the same spot in every list, so it
  can be found by position. An unavailable choice is greyed in place, not removed.
- Things that are not available yet stay visible, greyed, with the reason (「開車前 30 分鐘才可使用」), so
  nothing seems to have vanished.

**Honesty**
- Show what Transport for NSW says (when the train leaves), and let them judge. Don't shift times.
- Say when information may be wrong: stale live times, no GPS, a possibly different service, a tight change.
- 「到站」 (you have arrived) is only ever said from GPS, never from a timetable estimate.
- No reassurance the app can't back up: a warning asks them to check the platform display or listen to the
  announcements.

**Forgiving hands**
- A slow or long press counts as a tap. Button labels can't be selected as text.
- Double-tap doesn't zoom. Pinch zoom stays available.
- The page is not redrawn under a finger; countdown text is updated in place.
- Tap targets aim for at least 44 points high (the folds and link buttons were raised to this in v1.6.0).
- Anything destructive is out of reach: 設定 opens only after a 2-second hold, deleting is a separate mode, and
  each delete and 還原預設 asks first.

**iPhone limits the design works around**
- Web apps can't vibrate, so alerts are visual: the whole screen flashes or turns green.
- The app must stay on screen during a ride; it asks the iPhone to keep the screen on (iOS 18.4+).
- The iPhone may restart the app after a phone call or a visit to another app.

## The screens and what each is for

**Main screen.** 去哪裡? first, then 從哪裡出發? (already 家), then 🔍 搜尋路線. A header card shows the date,
time and 📍 你在 (current suburb and street, live). ↺ 重新開始 resets to the clean state. ⚙️ 設定 is a small
line at the bottom.

**Place lists.** A two-column grid of big tiles in the order set in 設定. The destination list starts with
🏠 回家 (full width), which goes straight to trips home from the current location. The start list starts with
🏠 家 and 📍 現在位置. 🔍 其他地點 at the bottom searches any station, address or place.

**Trip list.** Starts at "leave now". The time bar (◀ 早一點 · ⏱️ 現在 · 遲一點 ▶, and 📅🕘 改時間及日期) is
the only place time is chosen. Each card leads with when the train or bus leaves and how long until then,
then the walk to it at their pace, the arrival time and the journey length. Warnings appear on the card only
when something needs attention. Trains that just left sit under one folded line. 🚕 Uber is at the bottom.

**Trip details.** The same headline, then the trip as plain steps: walk, board (platform or stand, direction,
number of stops), get off, change or arrive. Each ride can show its stops. Service notices are translated;
important ones are open, routine ones folded. 🔊 朗讀 reads the steps in Cantonese.

**Stop countdown (還有幾個站).** For use on board. One big line: 「還有 N 個站」, then 「🔔 下一站下車 請按鐘!」
with the screen flashing, then green 「📍 到站,請下車!」. When changing, a 「➡️ 下一程」 button carries on with
the next ride.

**設定 (owner only).** Theme, home address, places (add, drag to reorder, delete in a separate mode), voice
test, restore defaults, version.

## Colour and type

Two themes, chosen in 設定 → 主題 and saved per phone.

- **主題 1 (default).** Warm cream page, near-white cards, soft blue station tiles with dark text, green 回家,
  pale peach main buttons, delay and on-time shown as pills. Chosen to match the app icon. The page is flat
  cream (a gradient was dropped because iPhones handle fixed backgrounds badly) and the font is the system
  font (a custom font was not worth a download).
- **主題 2.** The original look: cream page, solid slate-blue tiles and main buttons with white text.

The arrival alert is a deep green with white text in both themes. Contrast targets: body text at least 7:1,
other text at least 4.5:1, outlines at least 3:1.

## Wording

- Station names: a short Chinese sound-alike or commonly used name plus 站, e.g. 好市圍站, 寶活站, 車士活站.
  Names with a nickname in brackets stay as written: 卡市 (越南城). The list is in `names.js`; the owner
  chooses and corrects the names.
- Directions are read aloud in short English, as on station displays ("Hornsby"), because that is what the
  platform screens show.
- Service notices are translated by AI, but station names are taken out first and put back as 中文 + English,
  so they can't be mistranslated. The English original is one tap away.
- Warnings name what to do: 「請看月台或車上顯示屏」, 「請留意車上廣播及顯示屏」.
