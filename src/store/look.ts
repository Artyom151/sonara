import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Profile looks: a banner across the top (gradient, photo or video), a page background and an avatar frame. */

/** Gradient pairs for the banner and the background. */
export const LOOK_GRADIENTS: { from: string; to: string }[] = [
  { from: '#8b5cf6', to: '#ec4899' },
  { from: '#0ea5e9', to: '#6366f1' },
  { from: '#f97316', to: '#ef4444' },
  { from: '#22c55e', to: '#0d9488' },
  { from: '#f59e0b', to: '#f43f5e' },
  { from: '#1e293b', to: '#0f172a' },
];

/** Frame styles around the avatar; 0 is no frame. */
export const FRAME_COUNT = 6;

/** Background: a gradient index, or 'artwork' for the cover of the last played track. */
export type Background = number | 'artwork';

export type BannerKind = 'gradient' | 'photo' | 'video';

/** Where the banner media shows: the focus point in percent and a zoom (1 = fill the banner). */
export interface BannerPos {
  x: number;
  y: number;
  zoom: number;
}

interface LookState {
  banner: number;
  bannerKind: BannerKind;
  /** A photo as a JPEG data URL, kept on this device. */
  bannerImage: string | null;
  bannerPos: BannerPos;
  background: Background;
  frame: number;
  set: (patch: Partial<Pick<LookState, 'banner' | 'bannerKind' | 'bannerImage' | 'bannerPos' | 'background' | 'frame'>>) => void;
}

export const useLook = create<LookState>()(
  persist(
    (set) => ({
      banner: 0,
      bannerKind: 'gradient',
      bannerImage: null,
      bannerPos: { x: 50, y: 50, zoom: 1 },
      background: 'artwork',
      frame: 0,
      set: (patch) => set(patch),
    }),
    {
      name: 'sonara.look',
      version: 1,
      // Photos saved before 2.0.1 have no kind: they were banners already, so they stay photos.
      migrate: (state, version) => {
        const s = state as Partial<LookState>;
        if (version < 1) {
          s.bannerKind = s.bannerImage ? 'photo' : 'gradient';
          s.bannerPos = { x: 50, y: 50, zoom: 1 };
        }
        return s as LookState;
      },
    },
  ),
);
