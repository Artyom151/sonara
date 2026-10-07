import { AnimatePresence, motion, useAnimationControls } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { blobToDataUrl, squareImage } from '../../account/image';
import { setPendingAvatar } from '../../account/sync';
import { useAccount } from '../../account/store';
import { normalizeUsername, USERNAME_RE } from '../../account/types';
import { Logo } from '../components/Brand';
import { Avatar, AVATAR_PRESETS } from '../components/Avatar';
import { Field, Segmented, Sheet } from '../components/controls';
import { toast } from '../components/Toast';
import { useT, type StrKey } from '../i18n';
import { IconCamera, IconCheck, IconClose, IconPerson } from '../icons';

const ERRORS: Record<string, StrKey> = {
  invalid_credentials: 'errCredentials',
  email_not_confirmed: 'errNotConfirmed',
  email_taken: 'errEmailTaken',
  username_taken: 'errUsernameTaken',
  username_invalid: 'errUsernameInvalid',
  weak_password: 'errWeakPassword',
};

/** Debounced username availability: 'idle' | 'checking' | 'ok' | 'taken' | 'invalid'. */
export function useUsernameCheck(raw: string, current?: string) {
  const [state, setState] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle');
  const usernameAvailable = useAccount((s) => s.usernameAvailable);
  useEffect(() => {
    const u = normalizeUsername(raw);
    if (!raw) return setState('idle');
    if (!USERNAME_RE.test(u)) return setState('invalid');
    if (u === current) return setState('ok');
    setState('checking');
    const id = setTimeout(() => usernameAvailable(u).then((ok) => setState(ok ? 'ok' : 'taken')).catch(() => setState('ok')), 400);
    return () => clearTimeout(id);
  }, [raw, current, usernameAvailable]);
  return state;
}

export function UsernameHint({ state }: { state: ReturnType<typeof useUsernameCheck> }) {
  const t = useT();
  if (state === 'idle') return <span className="field-hint">{t('usernameRules')}</span>;
  if (state === 'checking') return <span className="field-hint">{t('checking')}</span>;
  if (state === 'invalid') return <span className="field-hint bad">{t('errUsernameInvalid')}</span>;
  if (state === 'taken') return <span className="field-hint bad">{t('errUsernameTaken')}</span>;
  return (
    <span className="field-hint ok">
      <IconCheck size={12} /> {t('usernameFree')}
    </span>
  );
}

export function AuthSheet({ initialTab = 'signIn', onClose }: { initialTab?: 'signIn' | 'signUp'; onClose: () => void }) {
  const t = useT();
  const { cloudAvailable, pendingEmail, signIn, signUp, demo, resend } = useAccount();
  const [tab, setTab] = useState<'signIn' | 'signUp'>(initialTab);
  const [mode, setMode] = useState<'supabase' | 'mock'>(cloudAvailable ? 'supabase' : 'mock');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatar] = useState(() => `preset:${Math.floor(Math.random() * AVATAR_PRESETS.length)}`);
  const [photo, setPhoto] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shake = useAnimationControls();
  const check = useUsernameCheck(tab === 'signUp' ? username : '');

  const fail = (e: unknown) => {
    const code = (e as Error).message;
    setError(ERRORS[code] ? t(ERRORS[code]) : code === 'network' || code.includes('fetch') ? t('errNetwork') : code);
    shake.start({ x: [0, -10, 9, -6, 4, 0], transition: { duration: 0.42 } });
  };

  const submit = async () => {
    setError(null);
    if (!email.trim() || password.length < 6) return fail(new Error(password.length < 6 ? 'weak_password' : 'invalid_credentials'));
    setBusy(true);
    try {
      if (tab === 'signIn') {
        await signIn(email, password, mode);
        toast(t('welcomeBack'));
        onClose();
      } else {
        if (check === 'taken' || check === 'invalid') throw new Error(check === 'taken' ? 'username_taken' : 'username_invalid');
        // Local accounts keep the photo inline; cloud accounts upload it on the first signed-in session.
        const r = await signUp({ email, password, username, displayName, avatar: mode === 'mock' && photo ? photo : avatar }, mode);
        if (photo && mode === 'supabase') setPendingAvatar(photo);
        if (r === 'signedIn') {
          toast(t('welcome'));
          onClose();
        }
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const confirmView = pendingEmail && mode === 'supabase';

  return (
    <Sheet open onClose={onClose}>
      <div className="auth">
        <button className="auth-close glass glass-icon" onClick={onClose} aria-label={t('cancel')}>
          <IconClose size={16} />
        </button>
        <motion.div className="auth-logo" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
          <Logo size={64} />
        </motion.div>

        <AnimatePresence mode="wait" initial={false}>
          {confirmView ? (
            <motion.div key="confirm" className="auth-confirm" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
              <h2>{t('checkEmail')}</h2>
              <p>
                {t('checkEmailText')} <b>{pendingEmail}</b>
              </p>
              <button className="btn tonal" onClick={() => resend().then(() => toast(t('emailSent'))).catch(fail)}>
                <span>{t('resend')}</span>
              </button>
              <button className="auth-link" onClick={() => (useAccount.setState({ pendingEmail: null }), setTab('signIn'))}>
                {t('haveConfirmed')}
              </button>
            </motion.div>
          ) : (
            <motion.div key="form" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
              <h2 className="auth-title">{tab === 'signIn' ? t('signInTitle') : t('signUpTitle')}</h2>
              <p className="auth-sub">{t('authSub')}</p>
              <div className="auth-seg">
                <Segmented
                  value={tab}
                  onChange={(v) => (setTab(v), setError(null))}
                  options={[
                    { value: 'signIn', label: t('signIn') },
                    { value: 'signUp', label: t('signUp') },
                  ]}
                />
              </div>

              <motion.form
                className="auth-form"
                animate={shake}
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <AnimatePresence initial={false}>
                  {tab === 'signUp' && (
                    <motion.div key="signup-fields" className="auth-signup" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}>
                      <div className="auth-row">
                        <button type="button" className="auth-avatar" onClick={() => fileRef.current?.click()} aria-label={t('uploadPhoto')}>
                          <Avatar avatar={photo ?? avatar} size={46} />
                          <span className="edit-avatar-badge small">
                            <IconCamera size={11} />
                          </span>
                        </button>
                        <input
                          ref={fileRef}
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (!f) return;
                            const small = await squareImage(f, 256);
                            setPhoto(await blobToDataUrl(small));
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Field placeholder={t('displayName')} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} autoComplete="nickname" />
                        </div>
                      </div>
                      <div className="field-prefix">
                        <span>@</span>
                        <Field placeholder={t('username')} value={username} onChange={(e) => setUsername(normalizeUsername(e.target.value))} autoCapitalize="none" autoComplete="username" />
                      </div>
                      <UsernameHint state={check} />
                    </motion.div>
                  )}
                </AnimatePresence>
                <Field type="email" placeholder={t('email')} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" inputMode="email" />
                <Field
                  type="password"
                  placeholder={t('password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={tab === 'signIn' ? 'current-password' : 'new-password'}
                />

                {cloudAvailable && (
                  <div className="auth-mode">
                    <Segmented
                      value={mode}
                      onChange={setMode}
                      options={[
                        { value: 'supabase', label: t('modeCloud') },
                        { value: 'mock', label: t('modeLocal') },
                      ]}
                    />
                  </div>
                )}

                <AnimatePresence>
                  {error && (
                    <motion.p className="auth-error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>

                <button type="submit" className="btn primary auth-submit" disabled={busy}>
                  {busy ? <span className="spinner dark" /> : <span>{tab === 'signIn' ? t('signIn') : t('createAccount')}</span>}
                </button>
              </motion.form>

              <div className="auth-or">
                <span>{t('or')}</span>
              </div>
              <button
                className="btn tonal auth-demo"
                onClick={() =>
                  demo()
                    .then(() => (toast(t('welcome')), onClose()))
                    .catch(fail)
                }
              >
                <IconPerson size={18} />
                <span>{t('demoAccount')}</span>
              </button>
              <p className="auth-foot">{mode === 'mock' ? t('localNote') : t('cloudNote')}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Sheet>
  );
}
