import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Profile looks: a banner across the top, a page background (like a Steam profile) and an avatar frame. */

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

interface LookState {
  banner: number;
  /** A photo for the banner (JPEG data URL, kept on this device); null uses the gradient. */
  bannerImage: string | null;
  background: Background;
  frame: number;
  set: (patch: Partial<Pick<LookState, 'banner' | 'bannerImage' | 'background' | 'frame'>>) => void;
}

export const useLook = create<LookState>()(
  persist(
    (set) => ({
      banner: 0,
      bannerImage: null,
      background: 'artwork',
      frame: 0,
      set: (patch) => set(patch),
    }),
    { name: 'sonara.look' },
  ),
);
