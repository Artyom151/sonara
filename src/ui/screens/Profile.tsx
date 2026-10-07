import { motion } from 'motion/react';
import { useAccount } from '../../account/store';
import { useLibrary } from '../../store/library';
import { useUi } from '../../store/ui';
import { Avatar } from '../components/Avatar';
import { TrackList } from '../components/TrackRow';
import { useT } from '../i18n';
import { IconGear, IconPencil, IconPerson } from '../icons';

export function Profile() {
  const t = useT();
  const { status, profile, mode } = useAccount();
  const likes = useLibrary((s) => s.likes.length);
  const playlists = useLibrary((s) => s.playlists.length);
  const recent = useLibrary((s) => s.recent);
  const push = useUi((s) => s.push);
  const open = useUi((s) => s.open);

  return (
    <div className="screen">
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 16px' }}>
        <button className="glass glass-icon glass-press" aria-label={t('settings')} onClick={() => push({ name: 'settings' })}>
          <IconGear size={20} />
        </button>
      </div>

      {status === 'signedIn' && profile ? (
        <div className="profile-head">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 22 }}>
            <Avatar avatar={profile.avatar} name={profile.displayName} size={104} className="profile-avatar" />
          </motion.div>
          <h1 className="profile-name">{profile.displayName}</h1>
          <div className="profile-username">
            @{profile.username}
            <span className={`mode-pill ${mode}`}>{mode === 'supabase' ? t('modeCloud') : t('modeLocal')}</span>
          </div>
          <button className="btn tonal small" onClick={() => open({ type: 'editProfile' })}>
            <IconPencil size={15} />
            <span>{t('editProfile')}</span>
          </button>
        </div>
      ) : (
        <motion.div className="signin-card glass" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
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
