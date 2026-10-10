/**
 * Headphone families from the name a device advertises ("Arvind's AirPods Pro", "WH-1000XM5",
 * "Galaxy Buds2"), and output names that are not headphones. Pure: no platform or store imports.
 */
export type HeadphoneModel = 'airpods' | 'airpods3' | 'airpods-pro' | 'airpods-max' | 'buds' | 'over-ear' | 'wired';
export type DeviceKind = 'bluetooth' | 'wired' | 'usb' | 'default-output';

/** Model from the name the headphones advertise ("Arvind's AirPods Pro", "WH-1000XM5", "Galaxy Buds2"). */
export function headphoneModel(name: string, kind?: DeviceKind): HeadphoneModel {
  const n = name.toLowerCase();
  if (/airpods\s*max/.test(n)) return 'airpods-max';
  if (/airpods\s*pro/.test(n)) return 'airpods-pro';
  // AirPods 3 / 4: short stems, no tips.
  if (/airpods\s*\(?(3|4)(rd|th)?\b|airpods\s*(3|4)/.test(n)) return 'airpods3';
  if (/airpods/.test(n)) return 'airpods';
  if (
    /\bbuds\b|buds\s*\d|buds\s*(pro|live|fe|plus|\+)|earbuds|\bwf-|freebuds|\bear\s*\(|nothing\s*ear|elite\s*\d|soundcore\s*(liberty|life\s*p|space\s*a)|enco|\btws\b|powerbeats|studio\s*buds|fit\s*pro|pixel\s*buds|jabra\s*elite|liberty|\bpods\b/.test(
      n,
    )
  )
    return 'buds';
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

