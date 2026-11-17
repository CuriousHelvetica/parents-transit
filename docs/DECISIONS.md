# Decision log

What was decided, what else was on the table, and why. Newest first. Version numbers refer to
[`../CHANGELOG.md`](../CHANGELOG.md). "Owner" is the person who runs the project; "parents" are the users.

## Look and feel

**Two themes, switchable in 設定 (v1.8.0).**
The owner designed a new colour scheme to match the app icon. Options: replace the old colours in place, or
keep both with a switch. Chosen: both, with the new one (主題 1) as the default. Reason: it can be tried on
real phones and reverted with one tap. Cost accepted: every new screen must be checked in both. If 主題 2 falls
out of use, fold 主題 1 into `style.css` and remove the switch.
- Plain names (主題 1 / 主題 2), at the owner's request, in place of descriptive names.
- **Font:** the design asked for Public Sans. Skipped: it needs a download and barely differs from the iPhone
  system font; Chinese uses PingFang either way.
- **Page background:** the design had a cream-to-peach gradient with a fixed background. Dropped for flat
  cream, because iPhones handle fixed backgrounds unreliably.
- **Main button:** four options were mocked up (pale peach, deeper peach, solid orange, solid blue). The
  recommendation was solid orange, for visibility. The owner chose pale peach, for consistency with the icon,
  judging it still legible. This is a deliberate choice, not an oversight.
- **Warning colour:** "may not make it" is amber everywhere (it was amber on the card and red in the steps).

**Long presses and double taps (v1.8.1–v1.8.3).**
Found on a real iPhone: a slow press selected a button's label as text and the tap was lost; a quick double
tap zoomed the page. Fixes: labels can't be selected; double-tap zoom is off on every element, with a guard
that ignores a quick second tap on plain text. Pinch zoom was kept on purpose, in case they want to enlarge
something. The first zoom fix (rule on the page only) did not work on iPhone; the second did, confirmed by
the owner.

## Main screen and navigation

**去哪裡 before 從哪裡出發 (v1.7.1).**
The start is already 家, so the destination is the only thing they must choose. Asking it first also puts
🏠 回家 two taps away. Alternatives: a separate green 回家 button on the main screen (one tap, but one more
element), or offering 回家 only when GPS shows they are away from home (rejected: depends on GPS and makes the
screen change from day to day).

**回家 goes straight to trips from the current location (v1.7.0).**
Options for a return trip: start from the previous destination, or from the current position. Chosen: current
position. It is right even if they have walked somewhere else, and needs nothing remembered. If another start
was chosen on purpose, it is kept.

**設定 behind a 2-second hold (v1.7.0).**
The parents could delete places or reset the app by accident. Options: a confirmation question, or a hold.
Chosen: hold, with 設定 moved to a small line at the bottom.

**Drag to reorder, delete in a separate mode (v1.7.0).**
⬆️ and 🗑️ sat side by side on every row. Now reordering is by a ☰ drag handle and deleting needs a mode
switch. The owner asked for dragging in place of up/down arrows.

**Every place in every list, same spot (v1.5.5).**
The chosen start used to disappear from the destination list, shifting everything after it. The owner wants
muscle memory: stations found by position. Options when the same place is picked on both sides: clear the
other side, warn on search, or grey it out. Chosen: grey it out in place. 回家 fills the first row of the
destination list so both lists line up.

**Two questions, time moved to the trip list (v1.5.0).**
The main screen asked from, when, to. The owner found that the time is what changes while comparing options,
so it belongs next to the results. The list always opens at "leave now".

## Trip list and times

**Departure times, not "leave home" times (v1.6.0).**
The app used to say 「X 分鐘後出門」 and added 5 minutes to the walk from home. The owner judged the offsets
messy. A review also found that a trip vanished from the list while they were walking to the station. Now the
card shows when the train or bus leaves, plus the walk time, and they decide when to go.

**Walking times shown 40% longer (v1.6.0).**
The owner wanted a percentage for slow walking in place of a fixed 5 minutes. 40% is an estimate, not a
measurement; it is one constant (`WALK_SLOW`) to tune once real walking times are known. It applies to every
walk, including changes between platforms, and only changes the minutes shown. The arrival time is Transport
for NSW's and does not include the slower final walk.

**A trip that can't be reached stays listed, with a hint (v1.6.0).**
The owner's call: keep it normal, show 「步行需時較長,可能趕不及」, and let them judge. Tight changes get the
same treatment.

**Trains that just left: one folded line (v1.5.2, v1.6.0).**
Added after the owner jumped on a train and could not find it in the app. First shown as up to three grey
cards at the top (20 minutes back). A review found these pushed the coming trips off the screen. Options: a
compact row each, one folded line, the bottom of the list, or only the latest one. Chosen: one folded line.

**No "updated at" line; a warning only when stale (v1.6.0).**
The small 「更新時間」 line was easy to miss and the owner had forgotten what it meant. A failed refresh left
old times looking current. Now nothing shows while all is well, and a yellow warning appears when a refresh
fails or the times are a few minutes old.

**Arrive-by lists show the hour before (v1.5.6).**
An "arrive by 8 pm" search listed two hours of trips earliest first, so the useful one was at the bottom.
Options: latest first (the owner found a backwards list odd), or only the hour before the time, earliest
first. Chosen: the hour before. On a quiet line with nothing in that hour, the last trip that makes it shows.

**Earlier / later in 30-minute steps, rounded (v1.5.0).**
One rule: move 30 minutes, then round to the nearest :00 or :30. So the first tap moves 15–45 minutes and
lands on a neat time; later taps move exactly 30. A plain +30 would give times like 4:26.

**Trips kept in memory, read ahead (v1.5.0, v1.5.1).**
The owner did not want a wait on every tap. Trips for the route stay in memory, about three hours ahead are
fetched in the background (up to three searches at once), and live times refresh once the taps stop.

**Sort buttons removed (v1.5.0).**
"Fewest changes" and "fastest" were not useful to them; the badges already show the changes. Trips are listed
by departure time.

**Uber always available (v1.5.7).**
It was limited to 30 minutes before departure. The owner wanted a price guide at any time: Uber only needs
the destination, and uses the phone's own position.

**Live buttons from 30 minutes before (v1.3.8).**
Walking directions and the stop countdown depend on being on the way. They used to exist only for "now"
searches, which left a gap when a planned trip came due. Now they follow the time until departure, and show
greyed with the reason before that.

## Stop countdown

**No GPS: warn, and estimate by the timetable (v1.6.0).**
Underground, the count used to stand still without a word. Options: a warning only, or a warning plus a
timetable estimate. Chosen: both, with the estimate marked 「大約」. The estimate never says "arrived".

**Following a different service (v1.4.0).**
They often catch an earlier or later train on the same line. GPS shows when the vehicle really left; the stop
times shift to match. A yellow note asks them to check the display when the departure fits a different
service, because an express may skip their stop. The owner's rule: services are almost never more than 2
minutes early but can be very late, so a service is ruled out only if it would have had to leave more than 2
minutes early, and the closest remaining fit wins. An unnecessary note is acceptable: it only asks them to
glance at the display.

**Alerts are visual (v1.0).**
iPhone web apps can't vibrate. The screen flashes for "next stop" and turns green on arrival.

## Other

**Chinese place search: one AI step and fixed rules (v1.9.1).**
The first version (v1.9.0) used two AI steps with the large translation models. On the real service it took
about a minute (the app gave up after 20 seconds), and the second step failed, so Transport for NSW's own
order put Brownlow Hill bus stops before the Camperdown campus for 悉尼大學. Options: two steps with a faster
model, or one AI step plus fixed rules for choosing among Transport for NSW's results. The owner chose one
step plus rules (faster, fewer ways to fail, one result per meaning). The rules were checked against 15 real
searches before shipping. The owner asked for up to 30 seconds of waiting with an honest estimate on screen,
and for the model to be changeable in the dashboard (`PLACE_MODEL`).

**Chinese search for any place (v1.9.0).**
The owner's mother typed 悉尼機場 into 🔍 其他地點 on her first try, and it failed: Chinese only matched known
stations. Considered: a longer built-in list only (reliable, but limited to what was thought of), AI translation
only (covers everything, but can be wrong), or both. Chosen: both. The built-in list (airports, Opera House,
clubs, big shopping centres) answers instantly with hand-written short lines; anything else goes to the AI.
The AI only chooses among places Transport for NSW really returns, so it cannot invent a stop. The owner chose
a short line under each result so they know they picked the right place; for AI results that line is limited
to the kind of place and the suburb, because the AI could confidently state wrong facts. AI results are marked
🤖. Airports are listed by terminal (T1, T2, T3), since the parents know their airline. 雪梨 and 悉尼 both
mean Sydney (the owner: they often say 雪梨). No Chinese addresses or street names. The new Sydney Fish
Market (opened January 2026) is not in Transport for NSW's place data yet, so it was left off the list.

**Home address never in the repository.**
The owner asked for their parents' address as the default home. The repository is public and Git history is
permanent, so it was not added; it is set on each phone in 設定. The default stays "Rhodes Station".

**Translation model fallback (Worker update, November 2026).**
Cloudflare retired the model in use. The Worker now tries a list in order and moves on when one fails, and the
list can be changed in the Cloudflare dashboard without touching code. Expecting more retirements, the owner
asked for switching to be easy.

**Chinese name for Bankstown (v1.5.4).**
Four names were found (班士廳, 班士湯, 賓士鎮, 班克斯敦). The owner chose 賓士鎮.

**Tests in the repository (v1.5.3).**
Earlier test scripts only printed output and lived outside the repository. They were replaced by checks that
state an expected result, stored in `tests/`. The owner asked that tests actually verify something.

**Reminder hidden (v1.3.3).**
「⏰ 提醒我」 downloaded a calendar file each time, which the owner found clumsy. It is switched off
(`FEATURE_REMINDER`), with the code kept. The parents set alarms their own way.

**Notices: important open, routine folded (v1.3.7).**
Most notices are routine (lift works, timetable changes) and crowded the steps. Only high-priority ones stay
open.

**Only public transport and walking (v1.0).**
Transport for NSW sometimes suggests cycling or driving legs. Trips containing them are never shown.

**Not built, by decision**
- **Opening with no connection.** Possible with a service worker, but a mistake could leave phones stuck on an
  old version. Not worth it for a "good to have".
- **Securing the Worker beyond the origin check.** Non-browser programs can fake the origin. Proper
  authentication would need a manual Cloudflare redeploy; left as is.
