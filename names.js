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

// The places on the main screen the first time the app opens (editable in 設定).
const DEFAULT_HOME = { zh: '家', en: 'Home', query: 'Rhodes Station' };
const DEFAULT_PLACES = [
  { zh: '中央站', en: 'Central', query: 'Central Station' },
  { zh: '好市圍站', en: 'Hurstville', query: 'Hurstville Station' },
  { zh: '寶活站', en: 'Burwood', query: 'Burwood Station' },
  { zh: '車士活站', en: 'Chatswood', query: 'Chatswood Station' },
  { zh: '黑鎮站', en: 'Blacktown', query: 'Blacktown Station' },
  { zh: '河木站', en: 'Riverwood', query: 'Riverwood Station' },
  { zh: '菲林明頓站', en: 'Flemington', query: 'Flemington Station' },
  { zh: '環形碼頭', en: 'Circular Quay', query: 'Circular Quay Station' },
];
