/**
 * Headphone families from the name a device advertises ("Arvind's AirPods Pro", "WH-1000XM5",
 * "Galaxy Buds2"), and output names that are not headphones. Pure: no platform or store imports.
 */
/**
 * Drawing family of a headphone model (HeadphoneArt.tsx draws one silhouette per family).
 * Finer than the brand: Galaxy Buds (2019) and Buds3/4 look different, so they get different families.
 */
export type HeadphoneModel =
  | 'airpods' // AirPods 1/2: stem with a short stub
  | 'airpods3' // AirPods 3/4: shorter stem, no tip
  | 'airpods-pro' // AirPods Pro: stem with a silicone tip
  | 'airpods-max'
  | 'buds-round' // Galaxy Buds / Buds+: round puck with a stem
  | 'buds-bean' // Galaxy Buds Live / 2 / FE, Samsung's kidney shape
  | 'buds-stem' // Galaxy Buds3 / 4, Pixel Buds A: long stem, no tip
  | 'buds-stem-tip' // Galaxy Buds3 Pro / 4 Pro, Pixel Buds Pro: stem plus an ear tip
  | 'buds-pod' // Huawei FreeBuds, OnePlus, Xiaomi, Nothing, vivo and the rest: round pod with a tip
  | 'clip' // open-ear clip-on
  | 'neck' // neckband
  | 'sport-hook' // earhook sport buds
  | 'over-ear'
  | 'wired'
  | 'speaker' // portable / smart speaker
  | 'car'; // car head unit (Bluetooth, Android Auto)
export type DeviceKind = 'bluetooth' | 'wired' | 'usb' | 'default-output';

const CAR =
  /\bcar\b|car[- ]?kit|handsfree car|\bbmw\b|\baudi\b|mercedes|toyota|lexus|skoda|mazda|nissan|hyundai|\bkia\b|\bvw\b|volkswagen|\bford\b|renault|honda|volvo|tesla|\bjeep\b|\blada\b|\bhaval\b|\bchery\b|\bgeely\b|android auto|carplay|uconnect|\bmy ?link\b|\bsync\b/;
const SPEAKER =
  /speaker|колонк|soundbar|homepod|\bsonos\b|\becho\b|\bnest\b|boombox|partybox|megaboom|wonderboom|\bboom\b|emberton|stanmore|acton|kilburn|willen|\bsrs-|jbl (charge|flip|go|clip|xtreme|pulse|extreme)|bose (soundlink|s1|home)|soundcore (motion|boom|mini|select)|marshall (emberton|stanmore|acton|kilburn|willen|middleton|tufton)|яндекс станц|алиса|\bmi (portable|smart) speaker|\bsound ?bar\b/;

/** Drawing family from the name the headphones advertise ("Arvind's AirPods Pro", "Galaxy Buds3 Pro"). */
export function headphoneModel(name: string, kind?: DeviceKind): HeadphoneModel {
  const n = name.toLowerCase().replace(/\s+/g, ' ');
  if (CAR.test(n)) return 'car';
  if (SPEAKER.test(n)) return 'speaker';
  if (/airpods\s*max/.test(n)) return 'airpods-max';
  if (/airpods\s*pro/.test(n)) return 'airpods-pro';
  if (/airpods\s*\(?(3|4)(rd|th)?\b|airpods\s*(3|4)/.test(n)) return 'airpods3';
  if (/airpods/.test(n)) return 'airpods';
  if (/pixel buds pro/.test(n)) return 'buds-stem-tip';
  if (/pixel buds/.test(n)) return 'buds-stem';
  // Samsung Galaxy Buds, by generation.
  // Bluetooth names carry a code in brackets ("Galaxy Buds (A1B2)"): ignore it.
  const base = n.replace(/\s*\([^)]*\)/g, '').trim();
  if (/galaxy buds|samsung buds/.test(base) || /^buds\s*(\d|pro|live|fe|\+|plus)/.test(base)) {
    if (/buds\s*(\+|plus)/.test(base)) return 'buds-round';
    if (/(3|4)\s*pro\b/.test(base)) return 'buds-stem-tip';
    if (/buds\s*(3|4)\b/.test(base)) return 'buds-stem';
    if (/buds\s*2 pro/.test(base)) return 'buds-pod';
    if (/buds\s*2\b|live|\bfe\b/.test(base)) return 'buds-bean';
    if (/buds\s*pro/.test(base)) return 'buds-stem-tip';
    if (/buds\s*$/.test(base) || /galaxy buds$/.test(base)) return 'buds-round';
  }
  if (/\bclip\b|open[- ]?ear|freeclip|\bopen\b/.test(n)) return 'clip';
  if (/neck|openrun|openswim|bone|freelace|\bu[- ]?shape|ear[- ]?hook.*neck/.test(n)) return 'neck';
  if (/sport|hook|openfit|open fit/.test(n) && !/airpods/.test(n)) return 'sport-hook';
  if (/\bbuds\b|buds\s*\d|earbuds|\bear\s*\(|\bear\b|freebuds|\bwf-|enco|\btws\b|powerbeats|studio buds|fit pro|liberty|\bpods\b|elite \d|nothing ear|cmf|(?!.*\b(q\d\d|space|motion|boom)\b)soundcore|beats (fit|flex|solo|studio buds)/.test(n))
    return 'buds-pod';
  if (kind === 'wired' || kind === 'usb') return 'wired';
  return 'over-ear';
}

/** Outputs that are not headphones (Windows reports every default output switch). */
export const NOT_HEADPHONES = /speaker|динамик|realtek|hdmi|displayport|monitor|display audio|digital output|s\/pdif|spdif|tv\b|soundbar|nvidia|amd high definition|intel.*(display|smart sound)/i;
/** Windows endpoint names wrap the device: "Headphones (WH-1000XM4 Stereo)" → "WH-1000XM4". */
export const cleanName = (name: string) =>
  name
    .replace(/^(headphones|headset|наушники|гарнитура|earphones)\s*\((.*)\)$/i, '$2')
    .replace(/\s+(stereo|hands-free|handsfree|ag audio|a2dp|le audio)\b.*$/i, '')
    .trim() || name;

