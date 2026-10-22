import { motion } from 'motion/react';
import { useAccount } from '../../account/store';
import { useLibrary } from '../../store/library';
import { LOOK_GRADIENTS, useLook } from '../../store/look';
import { useUi } from '../../store/ui';
import { Avatar } from '../components/Avatar';
import { TrackList } from '../components/TrackRow';
import { useT } from '../i18n';
import { IconChevronRight, IconGear, IconPencil, IconPerson } from '../icons';

export function Profile() {
  const t = useT();
  const { status, profile, mode } = useAccount();
  const likes = useLibrary((s) => s.likes.length);
  const playlists = useLibrary((s) => s.playlists.length);
  const recent = useLibrary((s) => s.recent);
  const push = useUi((s) => s.push);
  const open = useUi((s) => s.open);
  const { banner, background, frame } = useLook();
  const artwork = recent[0]?.artworkLarge ?? recent[0]?.artwork;
  const bannerGradient = LOOK_GRADIENTS[banner % LOOK_GRADIENTS.length];
  const bg = background === 'artwork' ? (artwork ? `url("${artwork}")` : null) : null;
  const bgGradient = background === 'artwork' ? null : LOOK_GRADIENTS[background % LOOK_GRADIENTS.length];

  return (
    <div className="screen profile-page">
      <div className="profile-bg" aria-hidden style={bg ? { backgroundImage: bg } : { background: `linear-gradient(180deg, ${(bgGradient ?? LOOK_GRADIENTS[0]).from}, ${(bgGradient ?? LOOK_GRADIENTS[0]).to})` }} />
      <div className="profile-banner" style={{ background: `linear-gradient(120deg, ${bannerGradient.from}, ${bannerGradient.to})` }}>
        <button className="profile-gear glass glass-icon glass-press" aria-label={t('settings')} onClick={() => push({ name: 'settings' })}>
          <IconGear size={20} />
        </button>
      </div>

      {status === 'signedIn' && profile ? (
        <div className="profile-head">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 22 }}>
            <div className={`profile-frame frame-${frame}`}>
              <Avatar avatar={profile.avatar} name={profile.displayName} size={104} className="profile-avatar" />
            </div>
          </motion.div>
          <h1 className="profile-name">{profile.displayName}</h1>
          <div className="profile-username">
            @{profile.username}
            <span className={`mode-pill ${mode}`}>{mode === 'supabase' ? t('modeCloud') : t('modeLocal')}</span>
          </div>
          <div className="profile-actions">
            <button className="btn tonal small" onClick={() => open({ type: 'editProfile' })}>
              <IconPencil size={15} />
              <span>{t('editProfile')}</span>
            </button>
            <button className="btn tonal small" onClick={() => open({ type: 'look' })}>
              <span>{t('appearance')}</span>
            </button>
            <button className="btn tonal small" onClick={() => open({ type: 'together' })}>
              <span>{t('together')}</span>
            </button>
          </div>
        </div>
      ) : (
        <motion.div className="signin-card glass" initial={{ scale: 0.96, y: 14 }} animate={{ scale: 1, y: 0 }}>
          <div>
            <span className="signin-icon">
              <IconPerson size={30} filled />
            </span>
            <h2>{t('signInTitle')}</h2>
            <p>{t('signInPitch')}</p>
            <div className="signin-actions">
              <button className="btn primary" onClick={() => open({ type: 'auth', tab: 'signIn' })}>
                <span>{t('signIn')}</span>
              </button>
              <button className="btn tonal" onClick={() => open({ type: 'auth', tab: 'signUp' })}>
                <span>{t('signUp')}</span>
              </button>
            </div>
          </div>
        </motion.div>
      )}

      <div className="stats">
        <div className="stat glass">
          <div>
            <b>{likes}</b>
            <small>{t('liked')}</small>
          </div>
        </div>
        <div className="stat glass">
          <div>
            <b>{playlists}</b>
            <small>{t('created')}</small>
          </div>
        </div>
        <div className="stat glass">
          <div>
            <b>{recent.length}</b>
            <small>{t('played')}</small>
          </div>
        </div>
      </div>
      <button className="stats-entry glass glass-press" onClick={() => push({ name: 'stats' })}>
        <span>{t('statsTitle')}</span>
        <IconChevronRight size={18} />
      </button>
      {recent.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>{t('recentlyPlayed')}</h2>
            <button className="see-all" onClick={() => push({ name: 'recent' })}>
              {t('seeAll')}
            </button>
          </div>
          <TrackList tracks={recent.slice(0, 8)} context={{ title: t('recentlyPlayed') }} />
        </section>
      )}
    </div>
  );
}
