import { create } from 'zustand';
import { mockProvider } from './mock';
import { remoteProvider, supabase } from './remote';
import { squareImage } from './image';
import { normalizeUsername, USERNAME_RE, type AccountProvider, type Profile, type SignUpInput } from './types';

/**
 * Account state. Supabase is used when configured (.env); the offline mock
 * provider is used otherwise, or when the user explicitly picks the demo account.
 */
const MODE_KEY = 'sonara.account.mode';
const remote = supabase ? remoteProvider(supabase) : null;

const savedMode = (): 'supabase' | 'mock' => {
  try {
    return localStorage.getItem(MODE_KEY) === 'mock' || !remote ? 'mock' : 'supabase';
  } catch {
    return remote ? 'supabase' : 'mock';
  }
};

export const providerFor = (mode: 'supabase' | 'mock'): AccountProvider => (mode === 'supabase' && remote ? remote : mockProvider);

interface AccountState {
  status: 'loading' | 'signedOut' | 'signedIn';
  mode: 'supabase' | 'mock';
  profile: Profile | null;
  /** Email waiting for confirmation after sign-up (Supabase). */
  pendingEmail: string | null;
  cloudAvailable: boolean;
  provider: () => AccountProvider;
  init: () => Promise<void>;
  signIn: (email: string, password: string, mode?: 'supabase' | 'mock') => Promise<void>;
  signUp: (input: SignUpInput, mode?: 'supabase' | 'mock') => Promise<'signedIn' | 'confirm'>;
  demo: () => Promise<void>;
  resend: () => Promise<void>;
  signOut: () => Promise<void>;
  update: (patch: Partial<Pick<Profile, 'username' | 'displayName' | 'avatar'>>) => Promise<void>;
  uploadAvatar: (file: Blob) => Promise<string>;
  usernameAvailable: (username: string) => Promise<boolean>;
}

const setMode = (mode: 'supabase' | 'mock') => {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
};

export const useAccount = create<AccountState>((set, get) => ({
  status: 'loading',
  mode: savedMode(),
  profile: null,
  pendingEmail: null,
  cloudAvailable: !!remote,
  provider: () => providerFor(get().mode),

  async init() {
    try {
      const profile = await get().provider().restore();
      set({ profile, status: profile ? 'signedIn' : 'signedOut' });
    } catch {
      set({ status: 'signedOut' });
    }
    supabase?.auth.onAuthStateChange(async (event, session) => {
      if (get().mode !== 'supabase') return;
      if (event === 'SIGNED_OUT') set({ profile: null, status: 'signedOut' });
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user && !get().profile) {
        const profile = await remote!.restore();
        if (profile) set({ profile, status: 'signedIn', pendingEmail: null });
      }
    });
  },

  async signIn(email, password, mode = get().mode) {
    const profile = await providerFor(mode).signIn(email, password);
    setMode(mode);
    set({ mode, profile, status: 'signedIn', pendingEmail: null });
  },

  async signUp(input, mode = get().mode) {
    const username = normalizeUsername(input.username);
    if (!USERNAME_RE.test(username)) throw new Error('username_invalid');
    const r = await providerFor(mode).signUp({ ...input, username });
    setMode(mode);
    if (r.needsConfirm) {
      set({ mode, pendingEmail: input.email.trim() });
      return 'confirm';
    }
    set({ mode, profile: r.profile!, status: 'signedIn', pendingEmail: null });
    return 'signedIn';
  },

  /** One tap, fully offline account with a generated username. */
  async demo() {
    const n = Math.floor(1000 + Math.random() * 9000);
    const username = `listener${n}`;
    const r = await mockProvider.signUp({
      email: `${username}@demo.sonara.local`,
      password: crypto.randomUUID(),
      username,
      displayName: `Listener ${n}`,
      avatar: `preset:${n % 12}`,
    });
    setMode('mock');
    set({ mode: 'mock', profile: r.profile!, status: 'signedIn', pendingEmail: null });
  },

  async resend() {
    const email = get().pendingEmail;
    if (email) await providerFor('supabase').resendConfirmation(email);
  },

  async signOut() {
    await get().provider().signOut();
    set({ profile: null, status: 'signedOut' });
  },

  async update(patch) {
    const p = get().profile;
    if (!p) return;
    if (patch.username !== undefined) {
      patch.username = normalizeUsername(patch.username);
      if (!USERNAME_RE.test(patch.username)) throw new Error('username_invalid');
    }
    const profile = await get().provider().updateProfile(p.id, patch);
    set({ profile });
  },

  async uploadAvatar(file) {
    const p = get().profile;
    if (!p) throw new Error('signed_out');
    const small = await squareImage(file, 256);
    return get().provider().uploadAvatar(p.id, small);
  },

  async usernameAvailable(username) {
    return get().provider().usernameAvailable(normalizeUsername(username), get().profile?.id);
  },
}));
