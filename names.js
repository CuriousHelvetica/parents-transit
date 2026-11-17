// Rough Chinese (Traditional) names for places, shown next to the English name.
// These are approximate sound-alike / commonly used names — please check and edit.
// Key = English name as Transport for NSW writes it, without " Station".
const ZH_NAMES = {
  'Rhodes': '羅德',
  'Central': '中央',
  'Hurstville': '好市圍',
  'Burwood': '寶活',
  'Chatswood': '車士活',
  'Blacktown': '黑鎮',
  'Riverwood': '河木',
  'Flemington': '菲林明頓',
  'Bankstown': '賓士鎮',
  'Circular Quay': '環形碼頭',
  'Strathfield': '史卓菲',
  'Town Hall': '市政廳',
  'Redfern': '紅坊',
  'Parramatta': '百拉孖打',
  'Hornsby': '康士比',
  'Epping': '伊頻',
  'Wynyard': '雲耶',
  'Sydenham': '雪登咸',
  'Wolli Creek': '和利溪',
  'Meadowbank': '米度賓',
  'Concord West': '西康科',
  'North Strathfield': '北史卓菲',
  'North Sydney': '北悉尼',
  'Bondi Junction': '邦迪交匯處',
  'Martin Place': '馬丁廣場',
  'Auburn': '奧本',
  'Kings Cross': '國王十字',
  'Lidcombe': '利德甘',
  'Liverpool': '利物浦',
  'Ashfield': '艾士菲',
  'Macquarie Park': '麥覺理公園',
  'Kingsgrove': '金斯格羅夫',
  'Revesby': '利維斯比',
  'Cabramatta': '卡市 (越南城)',
  'Gordon': '哥頓',
  'Eastwood': '伊士活',
  'Campsie': '金時',
  'Kogarah': '高嘉華',
  'Carlingford': '卡靈福',
  'Chinatown': '唐人街',
};

// Places in ZH_NAMES that are not train stations (light rail stops etc.):
// searched by plain name, and shown without 站.
const NOT_TRAIN_STATIONS = ['Chinatown', 'Carlingford'];

// The buttons on the main screen the first time the app opens (editable in 設定), in order.
const DEFAULT_HOME = { zh: '家', en: 'Home', query: 'Rhodes Station' };
const DEFAULT_ORDER = [
  'Hurstville', 'Burwood', 'Blacktown', 'Riverwood', 'Flemington', 'Bankstown', 'Chatswood', 'Parramatta', 'Cabramatta',
  'Eastwood', 'Gordon', 'Campsie', 'Kogarah', 'Carlingford', 'Chinatown', 'Central', 'Circular Quay',
  'Strathfield', 'Town Hall', 'Redfern', 'Hornsby', 'Epping', 'Wynyard', 'Sydenham', 'Wolli Creek',
  'Meadowbank', 'Concord West', 'North Strathfield', 'North Sydney', 'Bondi Junction', 'Martin Place',
  'Auburn', 'Kings Cross', 'Lidcombe', 'Liverpool', 'Ashfield', 'Macquarie Park', 'Kingsgrove', 'Revesby',
];
const DEFAULT_PLACES = DEFAULT_ORDER.map((en) => {
  const train = !NOT_TRAIN_STATIONS.includes(en);
  const zh = ZH_NAMES[en];
  // 中央 -> 中央站; names with a nickname in brackets, and light rail stops, stay as written
  return { zh: train && !/[()（）]/.test(zh) ? zh + '站' : zh, en, query: train ? `${en} Station` : en };
});

// Places that are not stations, for 🔍 其他地點 in Chinese. Typing any of `names` (or part of one) finds it.
// `query` is the exact Transport for NSW name (checked against the live search, Nov 2026);
// `note` is the short line under the name. 雪梨 and 悉尼 are treated as the same word (see sameSydney).
const ZH_PLACES = [
  { zh: '悉尼國內機場 T2', names: ['國內機場', '悉尼機場', '機場', '飛機場', 'T2', '本地機場'], icon: '✈️',
    note: '國內航班:Virgin、Jetstar 等', en: 'Sydney Airport T2 Domestic', query: 'Sydney Airport - T2 Domestic (SYD), Mascot' },
  { zh: '悉尼國內機場 T3', names: ['國內機場', '悉尼機場', '機場', '飛機場', 'T3', '本地機場'], icon: '✈️',
    note: 'Qantas 國內航班', en: 'Sydney Airport T3 Domestic', query: 'Sydney Airport - T3 Domestic (SYD), Mascot' },
  { zh: '悉尼國際機場 T1', names: ['國際機場', '悉尼機場', '機場', '飛機場', 'T1'], icon: '✈️',
    note: '國際航班,例如飛香港', en: 'Sydney Airport T1 International', query: 'Sydney Airport - T1 International (SYD), Mascot' },
  { zh: '悉尼歌劇院', names: ['歌劇院', '悉尼歌劇院'], icon: '🎭',
    note: '環形碼頭步行約 10 分鐘', en: 'Sydney Opera House', query: 'Sydney Opera House, Sydney' },
  { zh: '車士活 RSL', names: ['車士活RSL', '車士活退伍軍人會', '車士活會所', 'Chatswood RSL'], icon: '🍽️',
    note: '會所 · 446 Victoria Ave', en: 'Chatswood RSL', query: 'Chatswood RSL, Chatswood' },
  { zh: '好市圍 Club Central', names: ['好市圍ClubCentral', '好市圍會所', 'Club Central', 'ClubCentral'], icon: '🍽️',
    note: '會所 · 好市圍站附近', en: 'Club Central Hurstville', query: 'Club Central Hurstville, Hurstville' },
  { zh: '市中心 Westfield', names: ['市中心Westfield', '城市Westfield', '悉尼Westfield', 'PittStMall'], icon: '🛍️',
    note: '商場 · 市中心 Pitt St Mall', en: 'Westfield Sydney', query: 'Westfield Sydney, Sydney' },
  { zh: '車士活 Westfield', names: ['車士活Westfield', '車士活商場'], icon: '🛍️',
    note: '商場 · 車士活站旁', en: 'Westfield Chatswood', query: 'Westfield Chatswood, Chatswood' },
  { zh: '車士活 Chase', names: ['車士活Chase', '車士活商場', 'ChatswoodChase'], icon: '🛍️',
    note: '商場 · 車士活站附近', en: 'Chatswood Chase', query: 'Chatswood Chase Shopping Centre, Chatswood' },
  { zh: '寶活 Westfield', names: ['寶活Westfield', '寶活商場'], icon: '🛍️',
    note: '商場 · 寶活', en: 'Westfield Burwood', query: 'Westfield Burwood, Burwood' },
  { zh: '好市圍 Westfield', names: ['好市圍Westfield', '好市圍商場'], icon: '🛍️',
    note: '商場 · 好市圍站旁', en: 'Westfield Hurstville', query: 'Westfield Hurstville, Hurstville' },
  { zh: '百拉孖打 Westfield', names: ['百拉孖打Westfield', '百拉孖打商場', '帕拉馬塔Westfield'], icon: '🛍️',
    note: '商場 · 百拉孖打', en: 'Westfield Parramatta', query: 'Westfield Parramatta, Parramatta' },
  { zh: '邦迪 Westfield', names: ['邦迪Westfield', '邦迪商場', '邦迪交匯處Westfield'], icon: '🛍️',
    note: '商場 · 邦迪交匯處站', en: 'Westfield Bondi Junction', query: 'Westfield Bondi Junction, Bondi Junction' },
  { zh: '東花園 Westfield', names: ['東花園', '東花園Westfield', '東花園商場', 'Eastgardens'], icon: '🛍️',
    note: '商場 · 只有巴士', en: 'Westfield Eastgardens', query: 'Westfield Eastgardens, Eastgardens' },
  { zh: '美蘭達 Westfield', names: ['美蘭達Westfield', '美蘭達商場'], icon: '🛍️',
    note: '商場 · 美蘭達 Miranda', en: 'Westfield Miranda', query: 'Westfield Miranda, Miranda' },
  { zh: '康士比 Westfield', names: ['康士比Westfield', '康士比商場'], icon: '🛍️',
    note: '商場 · 康士比站旁', en: 'Westfield Hornsby', query: 'Westfield Hornsby, Hornsby' },
  { zh: '利物浦 Westfield', names: ['利物浦Westfield', '利物浦商場'], icon: '🛍️',
    note: '商場 · 利物浦', en: 'Westfield Liverpool', query: 'Westfield Liverpool, Liverpool' },
  { zh: '卡素山 Castle Towers', names: ['卡素山', '卡素山商場', 'CastleTowers', 'CastleHill'], icon: '🛍️',
    note: '商場 · 地鐵 Castle Hill 站', en: 'Castle Towers', query: 'Castle Towers, Castle Hill' },
  { zh: '麥覺理商場', names: ['麥覺理商場', '麥覺理中心', 'MacquarieCentre'], icon: '🛍️',
    note: '商場 · 地鐵 Macquarie University 站', en: 'Macquarie Centre', query: 'Macquarie Centre Shopping Centre, Macquarie Park' },
  { zh: '萊德商場 Top Ryde', names: ['萊德商場', 'TopRyde', '萊德'], icon: '🛍️',
    note: '商場 · 只有巴士', en: 'Top Ryde City', query: 'Top Ryde City, Ryde' },
  { zh: '羅德商場', names: ['羅德商場', 'RhodesWaterside'], icon: '🛍️',
    note: '商場 · 羅德站旁', en: 'Rhodes Waterside', query: 'Rhodes Waterside Shopping Centre, Rhodes' },
  { zh: '賓士鎮商場', names: ['賓士鎮商場', 'BankstownCentral'], icon: '🛍️',
    note: '商場 · 賓士鎮', en: 'Bankstown Central', query: 'Bankstown Central, Bankstown' },
  { zh: '黑鎮 Westpoint 商場', names: ['黑鎮商場', 'Westpoint'], icon: '🛍️',
    note: '商場 · 黑鎮站附近', en: 'Westpoint Blacktown', query: 'Westpoint Shopping Centre, Blacktown' },
];

// 雪梨 and 悉尼 both mean Sydney; spaces are ignored when matching Chinese names.
function sameSydney(s) { return String(s).replace(/雪梨/g, '悉尼').replace(/\s+/g, '').toLowerCase(); }
