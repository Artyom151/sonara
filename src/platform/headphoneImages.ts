/**
 * Official product photos for the island's "Connected" card, picked by the name the headphones
 * advertise. Loaded from the makers' own image servers at runtime (never stored in this repo:
 * they are Apple's and Samsung's images); when a model is unknown, offline or the image fails,
 * the card falls back to our drawing (HeadphoneArt).
 *
 * Apple: store.storeimages.cdn-apple.com, `fmt=png-alpha` (transparent). `_AV1` is the "earbuds
 * only" view where the store has one. Samsung: images.samsung.com product renders (white colour
 * so they read on the black island), `$330_330_PNG$` (transparent).
 * Note: every AirPods generation advertises the same name ("…'s AirPods Pro"), so the newest
 * look is used unless the user put the generation into the name.
 */

const apple = (code: string) => `https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/${code}?wid=240&hei=240&fmt=png-alpha`;
const samsung = (path: string) => `https://images.samsung.com/is/image/samsung/${path}?$330_330_PNG$`;

/** Most specific first: "Buds3 Pro" before "Buds3", "AirPods Pro 3" before "AirPods Pro". */
const CATALOG: [RegExp, string][] = [
  // ── Apple ──
  [/airpods\s*max/, apple('airpods-max-hero-select-202011')],
  [/airpods\s*pro\s*\(?\s*3/, apple('airpods-pro-3-hero-select-202509')],
  [/airpods\s*pro\s*\(?\s*(1|1st|first)\b/, apple('MWP22_AV1')],
  [/airpods\s*pro/, apple('MTJV3_AV1')], // Pro 2
  [/airpods\s*\(?\s*4/, apple('MXP93')],
  [/airpods\s*\(?\s*(1|2|1st|2nd)\b/, apple('MV7N2_AV1')],
  [/airpods/, apple('MME73_AV1')], // AirPods 3 / 4 earbuds look
  // ── Samsung Galaxy Buds ──
  [/\bbuds\s*4\s*pro/, samsung('p6pim/uk/s2602/gallery/uk-galaxy-buds4-r640-579822-sm-r640nzwaeub-551034391')],
  [/\bbuds\s*4/, samsung('p6pim/uk/s2602/gallery/uk-galaxy-buds4-r540-sm-r540nzwaeub-551006028')],
  [/\bbuds\s*3\s*fe/, samsung('p6pim/uk/sm-r420nzaaeua/gallery/uk-galaxy-buds3-fe-sm-r420nzaaeua-548603658')],
  [/\bbuds\s*3\s*pro/, samsung('p6pim/uk/2407/gallery/uk-galaxy-buds3-pro-r630-sm-r630nzwaeua-542217332')],
  [/\bbuds\s*3/, samsung('p6pim/uk/2407/gallery/uk-galaxy-buds3-r530-sm-r530nzwaeua-542217422')],
  [/\bbuds\s*2\s*pro/, samsung('p6pim/uk/2208/gallery/uk-galaxy-buds2-pro-r510-sm-r510nzwaeua-533240921')],
  [/\bbuds\s*2/, samsung('p6pim/uk/2108/gallery/uk-galaxy-buds2-r177-sm-r177nzwaeua-481839305')],
  [/\bbuds\s*fe/, samsung('p6pim/uk/sm-r400nzwaeua/gallery/uk-galaxy-buds-fe-sm-r400nzwaeua-538543302')],
  [/\bbuds\s*live/, samsung('uk-galaxy-buds-live-r180-sm-r180nzwaeua-frontmysticwhite-288498207')],
  [/galaxy\s*buds\s*pro/, samsung('p6pim/uk/sm-r190nzwaeua/gallery/uk-galaxy-buds-pro-r190-369191-sm-r190nzwaeua-500856687')],
  [/galaxy\s*buds\s*(\+|plus)/, samsung('uk/galaxy-s20/gallery/uk-galaxy-buds-plus-sm-r175nzwaeua-frontwhite-208767392')],
  [/galaxy\s*buds\b/, samsung('uk-galaxy-buds-sm-r170nzwabtu-frontwhite-148309193')], // the 2019 original
];

import { PHOTO_CATALOG } from './headphonePhotos';

/** The product photo for a device name, or null when there is none (the drawing is used). */
export function headphoneImage(name: string): string | null {
  const n = name.toLowerCase();
  return [...PHOTO_CATALOG, ...CATALOG].find(([re]) => re.test(n))?.[1] ?? null;
}
