# Setup guide

This takes about 30–45 minutes the first time. Everything is free.

There are three pieces:

1. **Transport for NSW Open Data account** → gives you an API key (the "password" for live timetable data).
2. **Cloudflare Worker** → a tiny free server that keeps the key secret and passes requests to Transport for NSW.
3. **GitHub Pages** → hosts the web page your parents open from their home screen.

> Note: website menus change over time. If a button below has a slightly different name, look for the closest match.

---

## Step 1 — Get a Transport for NSW API key

1. Go to <https://opendata.transport.nsw.gov.au> and create a free account (confirm your email).
2. Log in and create a new **Application** (any name, e.g. `parents-transit`).
3. Add the **Trip Planner APIs** to the application.
4. Copy the **API key**. Keep it private — do not put it in GitHub.

## Step 2 — Create the Cloudflare Worker

1. Sign up for free at <https://dash.cloudflare.com/sign-up>.
2. Go to **Workers & Pages** → **Create** → **Create Worker** (start from "Hello World").
3. Name it `parents-transit` and click **Deploy**.
4. Click **Edit code**, delete everything, and paste the whole contents of [`worker/worker.js`](worker/worker.js). Click **Deploy**.
5. Go to the Worker's **Settings** → **Variables and Secrets** and add:
   | Type   | Name             | Value                                   |
   |--------|------------------|-----------------------------------------|
   | Secret | `TFNSW_API_KEY`  | the key from Step 1                     |
   | Text   | `ALLOWED_ORIGIN` | `https://curioushelvetica.github.io`    |
6. Still in **Settings**, go to **Bindings** → **Add binding** → **Workers AI**, and set the variable name to `AI`. Save and deploy. This is what translates service notices into Chinese. It uses Cloudflare's free daily AI allowance; if that allowance ever runs out, notices simply show in English.
7. Copy the Worker's address, e.g. `https://parents-transit.yourname.workers.dev`.
8. Quick check: open `<worker address>/tp/trip` in your browser. You should see **Forbidden**. That's correct: it only answers your web page.

## Step 3 — Point the web page at the Worker

Edit [`config.js`](config.js) in this repository and replace `https://REPLACE-ME.workers.dev` with your Worker's address (no slash at the end). The Worker address is not secret.

## Step 4 — Turn on GitHub Pages

1. In this repository on GitHub: **Settings** → **Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, branch **main**, folder **/ (root)**. Save.
3. After a minute or two the site is live at **<https://curioushelvetica.github.io/parents-transit/>**.
4. Open it on your own phone first and try a trip.

---

## Step 5 — On your parents' iPhone (in person)

### Add the icon to the home screen
1. Open **Safari** (it must be Safari) and go to `https://curioushelvetica.github.io/parents-transit/`.
2. Tap the **Share** button (square with an arrow) → **Add to Home Screen** → name it `爸媽出行` → **Add**.
3. From now on, open it from the 「爸媽出行」 icon (the heart with the Opera House).

### Set their real home address
The default "home" is Rhodes Station. For accurate "leave home at…" times, set their real address:
1. In the app tap **⚙️ 設定** → next to 住址 tap **更改**.
2. Type their address in English (e.g. `1 Walker St Rhodes`), tap **🔍 搜尋**, and pick the right result.

Their home address is stored **only on their phone**, not on GitHub.

### Allow location (for 「現在位置」 "where I am now")
The first time they tap **📍 現在位置** then a destination, iPhone will ask for location → tap **Allow**.
If they tapped "Don't Allow" by mistake: **Settings → Privacy & Security → Location Services → Safari Websites → While Using the App**.

### Cantonese voice (for 🔊 朗讀)
1. In the app: **⚙️ 設定** → **🔊 試聽廣東話**. If it speaks Cantonese, you're done.
2. If it sounds like Mandarin or English, on the iPhone go to **Settings → Accessibility → Spoken Content → Voices → Chinese → Chinese (Hong Kong)** and download a voice (e.g. Sin-ji). Then try again.
3. Make sure the phone isn't on silent mode if they can't hear it.

### Reminders (⏰ 提醒我)
On a trip's detail page, **⏰ 提醒我** opens a calendar invite. Tap **Add to Calendar**. The iPhone Calendar then alerts them 10 minutes before leaving (change to 5 or 15 in 設定), and again at departure time.
- Make sure **Settings → Notifications → Calendar** is allowed.
- This is the part I could not test on a real iPhone. Please try it once yourself.

### Going somewhere not on the buttons (🔍 其他地點)
Below the destination buttons, **🔍 其他地點** opens a search box. Type a station, suburb, address or place in English (e.g. `Eastwood`, `Westfield Burwood`). Station names the app knows also work in Chinese (e.g. 伊頻). Tap a result to see trips straight away; the buttons don't change. To keep it as a button, tap **⭐ 加到常去地點** on the trip screen.

### Walking directions (🗺️ 地圖指路)
For trips leaving **now**, each walking step (to a station, bus stop or the destination) has a **🗺️ 地圖指路** button. It opens **Apple Maps** with walking directions from where the phone is now to that exact stop. Check **Settings → Privacy & Security → Location Services → Maps → While Using the App**.

### When to get off (顯示途經車站 / 還有幾個站)
- Each ride step has **顯示途經車站**: the list of every stop with times. The stop before theirs is marked **🔔 下一站下車,請按鐘**, and their stop **📍 在此下車**.
- For trips leaving **now**, buses (and trains) also have **📍 上車後按這裡:還有幾個站**. Tap it once on board: the screen shows **還有 N 個站**, crossing off stops using GPS. When the next stop is theirs the whole screen **flashes** with **🔔 下一站下車 請按鐘!**; at their stop it turns **green: 📍 到站,請下車!** Tap **← 結束** when done.
- The app must stay **open on screen** during the ride (it keeps the screen on by itself on iOS 18.4 or later). iPhone web apps cannot vibrate, so the alert is visual only.
- Worth trying once together on a short bus ride.

### Uber price (🚕 改搭 Uber? 查看價錢)
For trips leaving **now**, a button at the bottom of the trip list (and on the "no route found" screen) opens the **Uber app** with pickup = their current location and the destination already filled in. Uber then shows the real price. Nothing is booked until they press Uber's own confirm button.
- Check **Settings → Uber → Location → While Using the App** so Uber can find them.
- Worth doing one practice booking together, including confirming the pickup pin at home.

### Edit places
In **⚙️ 設定** you can add places (➕ 加新地方), delete (🗑️), or move them up (⬆️). When adding, you can type a Chinese name for the button.

---

## How to use (to show your parents)

1. Open **爸媽出行**.
2. Choose where they're starting: **🏠 家** (home) or **📍 現在位置** (where I am now).
3. Choose when: **⏱️ 現在** (now), or **📅 預先計劃** (plan ahead). For planning ahead, pick 今天 / 明天 / 後天 (today, tomorrow, the day after) or another date. Then choose **出發時間** (leave at) or **到達時間** (arrive by), and set the time.
4. Tap where they're going. If starting from "where I am now", there's also a green **🏠 回家** (go home) button.
5. At the top, **🔁 最少轉車** (fewest changes, direct trips first) or **⚡ 最快** (fastest) changes the order of the trips; nothing is removed. The first card says **「X 分鐘後出門」** (leave in X minutes), or the date and time to leave for trips further ahead. Tap a card for step-by-step directions: which train or bus, which platform, how many stops, and where to get off.
6. **⚠️ 服務通知** (service notices such as trackwork) are translated into Chinese automatically. Tap 英文原文 to see the original English.
7. **🔊 朗讀** reads the steps aloud in Cantonese.
8. The screen updates itself with live delays (every minute for trips leaving now).

## Checking the Chinese place names

The names in [`names.js`](names.js) are rough sound-alike names I chose. **Please check and correct them**, especially 河木 (Riverwood), 菲林明頓 (Flemington), and 羅德 (Rhodes). Add more lines in the same format for other stations they use.

## Troubleshooting

| What you see | What to check |
|---|---|
| 無法連接伺服器 (can't connect) | Phone has internet? `config.js` has the right Worker address? |
| Error mentioning HTTP 401/403 | API key wrong or missing in Cloudflare, or `ALLOWED_ORIGIN` doesn't exactly match `https://curioushelvetica.github.io` |
| 服務通知 stays in English / 暫時無法翻譯 | Check the Workers AI binding is named exactly `AI`. In the Cloudflare dashboard, the Worker's **Logs** show errors |
| 找不到地點 (place not found) | Delete the place and add it again via search |
| Changes to the site don't show | Wait 2 minutes; then close and reopen the app |
