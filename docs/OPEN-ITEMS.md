# Open items

## Not verified

These could not be checked without the real services or a real iPhone.

| Item | What would settle it |
|---|---|
| **Cancelled services.** The app has no check for a cancelled train or bus, and how Transport for NSW marks one in trip results is unknown | Open a cancelled trip in the app with `?debug=1` added to the address and note what it shows |
| **Cards flickering.** Overlapping background searches could briefly remove and re-add a trip | Watch a busy route's list for a few minutes on a phone |
| **Countdown in a real tunnel.** The no-GPS warning and timetable estimate are tested only in simulation | A ride through the City Circle with the countdown open |
| **The 40% walking allowance** | Time the parents' real walk to their station against the time Transport for NSW gives |
| **Dragging to reorder** in 設定, tested with a simulated pointer | Try it on an iPhone |
| **📍 你在 on the Harbour Bridge.** It once kept showing Milsons Point; the box is now live, but how OpenStreetMap labels the bridge is unknown | Watch it while crossing |
| **Chinese search through the AI** (v1.9.2, working live since 2026-11-18): how well it handles names the parents actually use | The owner's mother types five or six places she would naturally use; the owner reports which come back wrong. **Waiting on this** before the next Worker change (below) |
| **New Sydney Fish Market** is not in Transport for NSW's place data (Nov 2026), so it isn't in the built-in list | Search `Sydney Fish Market` again later, or use a map position the owner provides |
| **Colours on a real screen**, especially outdoors, and the flashing 🔔 screen in 主題 1 | Look at them on the phone |

Confirmed on the owner's iPhone: trains that just left appear (Transport for NSW does return past
departures); the long-press fix; the double-tap zoom fix (v1.8.3); translation with the current model.

## Next Worker change (agreed, waiting for the parents' test)

Live check on 2026-11-18 (8 searches, 1–2 s each, all answered by the fast llama model): 悉尼大學, 雪梨大學,
情人港, 皇家阿爾弗雷德王子醫院, 動物園, 邦迪海灘 all correct. Two showed a weakness: for a name it doesn't
know, the AI picks a real place anyway and **labels it with the typed words**, so a wrong result looks right.
- 康縣醫院 (made up, meant as Concord Hospital) → Royal Prince Alfred Hospital, shown as 「康縣醫院」.
- 車士活醫院 → Royal North Shore Hospital (St Leonards), shown as 「車士活醫院」.

Planned fix, to be made together with whatever the parents' test shows (one Worker paste):
- `PLACE_PROMPT`: "zh" must be the usual Chinese name of the place found, never the typed words copied
  back; return nothing when unsure instead of a best guess.
- Add a `zoo` kind (🦁 動物園; the AI already answers "zoo", which now falls back to 📍 other).
- Show the suburb in the short line in Chinese where `ZH_NAMES` has it (already done in the app for known
  suburbs; check St Leonards etc.).
- Re-run the live check: with the app open on the real site, `fetch(WORKER_URL + '/place?text=…&debug=1')`.

## Parked: the owner's decision is needed before building

- **Remembering the open trip or countdown** when the iPhone restarts the app (after a phone call, Uber or
  Apple Maps).
- **An easier reminder** than a calendar file. Web push was the preferred idea. The current code is hidden
  behind `FEATURE_REMINDER`.
- **A more accurate street in 📍 你在.** The owner called it "not a big deal".

## Decided against

- **Opening with no connection** (service worker): risk of phones stuck on an old version.
- **Stronger protection for the Worker** than the origin check.
- **A custom font and a gradient background** in 主題 1.

See [`DECISIONS.md`](DECISIONS.md) for the reasoning.

## Checklist for a real-phone test

After any change to these areas, ask the owner to try:

1. **Version:** hold ⚙️ 設定 for 2 seconds; the bottom of the page shows the new version. If not, swipe the app
   away and reopen it.
2. **A search:** 去哪裡 → a station → 🔍 搜尋路線. Cards show a departure time, the walk, and the arrival.
3. **Time bar:** several quick taps on 遲一點 ▶ respond at once; ⏱️ 現在 returns to now.
4. **回家:** 去哪裡 → 🏠 回家 goes straight to trips from the current location, with Uber at the bottom.
5. **A ride with the countdown:** ✓ 已上車 appears after leaving; the screen flashes one stop before, and
   turns green on arrival.
6. **Read aloud:** 🔊 朗讀 speaks Cantonese, and the first word is not clipped.
7. **Slow presses and double taps:** a one-second press on a button still works; double-tapping does not zoom.
8. **Chinese search:** 🔍 其他地點 → type 雪梨機場: three terminals, no 🤖. Type 悉尼大學: results marked 🤖 (needs
   the v1.9.0 Worker).
9. **Both themes:** 設定 → 主題, then look at the main screen, a trip list and a trip's details.

## Possible future ideas

Raised in passing, never requested:
- Speaking the "next stop" alert aloud as well as flashing.
- A swap button for start and destination.
- Adding a newly added default station to phones that are already set up, automatically.
