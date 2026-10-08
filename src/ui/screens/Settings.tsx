import { useEffect, useState } from 'react';
import { api } from '../../core';
import { isAndroid, isTauri, platformName } from '../../platform';
import { useLibrary } from '../../store/library';
import { useSettings, type AccentMode } from '../../store/settings';
import { useUi } from '../../store/ui';
import { getSystemPalette } from '../../theme/dynamic';
import { Logo } from '../components/Brand';
import { Select, Toggle } from '../components/controls';
import { toast } from '../components/Toast';
import { useT } from '../i18n';
import { IconChevronLeft, IconChevronRight, IconDeezer, IconDiscord, IconMusic, IconQuote, IconSoundCloud, IconYouTube } from '../icons';
import { useAccount } from '../../account/store';
import { pull, useCloud } from '../../account/cloud';
import { Avatar } from '../components/Avatar';
import { useDesktop } from '../useMedia';

const SWATCHES = ['#8b5cf6', '#ff375f', '#ff9f0a', '#ffd60a', '#30d158', '#64d2ff', '#0a84ff', '#bf5af2', '#ff6482'];
const REGIONS = ['US', 'GB', 'DE', 'FR', 'RU', 'UA', 'KZ', 'BR', 'JP', 'KR', 'IN', 'TR', 'PL', 'ES', 'IT', 'CA', 'AU'];

function Cell({ icon, color, label, hint, children, noicon }: { icon?: React.ReactNode; color?: string; label: string; hint?: string; children?: React.ReactNode; noicon?: boolean }) {
  return (
    <div className={`cell ${noicon ? 'noicon' : ''}`}>
      {icon && (
        <span className="cell-icon" style={{ background: color }}>
          {icon}
        </span>
      )}
      <span className="cell-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </div>
  );
}

export function Settings() {
  const t = useT();
  const s = useSettings();
  const pop = useUi((x) => x.pop);
  const open = useUi((x) => x.open);
  const account = useAccount();
  const desktop = useDesktop();
  const cloud = useCloud();
  const [clientId, setClientId] = useState('…');
  const [dynamicOk, setDynamicOk] = useState<boolean | null>(null);

  useEffect(() => {
    api.clientId().then(setClientId).catch(() => setClientId('—'));
    getSystemPalette().then((p) => setDynamicOk(p.supported));
  }, []);

  const accentOptions: { value: AccentMode; label: string }[] = [
    ...(isAndroid ? [{ value: 'system' as const, label: t('accentSystem') }] : []),
    { value: 'artwork', label: t('accentArtwork') },
    { value: 'sonara', label: t('accentSonara') },
    { value: 'custom', label: t('accentCustom') },
  ];

  return (
    <div className="screen">
      <div className="nav-bar">
        <button className="glass glass-icon glass-press" onClick={pop} aria-label="Back">
          <IconChevronLeft size={20} />
        </button>
        <div className="title">{t('settings')}</div>
        <div style={{ width: 44 }} />
      </div>

      <div className="group-label">{t('appearance')}</div>
      <div className="group">
        <Cell noicon label={t('accent')} hint={s.accentMode === 'system' && dynamicOk === false ? t('dynamicUnsupported') : undefined}>
          <Select value={!isAndroid && s.accentMode === 'system' ? 'artwork' : s.accentMode} options={accentOptions} onChange={(v) => s.set({ accentMode: v })} />
        </Cell>
        {s.accentMode === 'custom' && (
          <div className="swatches">
            {SWATCHES.map((c) => (
              <button key={c} className={`swatch ${s.customAccent === c ? 'on' : ''}`} style={{ background: c, color: c }} onClick={() => s.set({ customAccent: c })} aria-label={c} />
            ))}
          </div>
        )}
        <Cell noicon label={t('tintInterface')} hint={t('tintInterfaceHint')}>
          <Toggle checked={s.tintInterface} onChange={(v) => s.set({ tintInterface: v })} />
        </Cell>
        <Cell noicon label={t('glassStyle')}>
          <Select value={s.glass} options={[{ value: 'clear', label: t('glassClear') }, { value: 'tinted', label: t('glassTinted') }]} onChange={(v) => s.set({ glass: v })} />
        </Cell>
        <Cell noicon label={t('graphics')} hint={t('graphicsHint')}>
          <Select
            value={s.graphics}
            options={[
              { value: 'auto', label: t('gfxAuto') },
              { value: 'high', label: t('gfxHigh') },
              { value: 'balanced', label: t('gfxBalanced') },
              { value: 'low', label: t('gfxLow') },
            ]}
            onChange={(v) => s.set({ graphics: v })}
          />
        </Cell>
        <Cell noicon label={t('islandPlayer')} hint={t(desktop ? 'islandPlayerHintDesk' : 'islandPlayerHint')}>
          <Toggle checked={s.islandPlayer} onChange={(v) => s.set({ islandPlayer: v })} />
        </Cell>
        <Cell noicon label={t('reduceMotion')}>
          <Toggle checked={s.reduceMotion} onChange={(v) => s.set({ reduceMotion: v })} />
        </Cell>
        <Cell noicon label={t('splash')}>
          <Toggle checked={s.showSplash} onChange={(v) => s.set({ showSplash: v })} />
        </Cell>
        <Cell noicon label={t('language')}>
          <Select value={s.lang} options={[{ value: 'auto', label: t('auto') }, { value: 'ru', label: 'Русский' }, { value: 'en', label: 'English' }]} onChange={(v) => s.set({ lang: v })} />
        </Cell>
      </div>

      <div className="group-label">{t('sources')}</div>
      <div className="group">
        <Cell icon={<IconSoundCloud size={18} />} color="#ff5500" label="SoundCloud">
          <Toggle checked={s.sources.soundcloud} onChange={(v) => s.set({ sources: { ...s.sources, soundcloud: v } })} />
        </Cell>
        <Cell icon={<IconYouTube size={18} />} color="#ff0033" label="YouTube">
          <Toggle checked={s.sources.youtube} onChange={(v) => s.set({ sources: { ...s.sources, youtube: v } })} />
        </Cell>
        <Cell icon={<IconDeezer size={18} />} color="#a238ff" label="Deezer">
          <Toggle checked={s.sources.deezer ?? true} onChange={(v) => s.set({ sources: { ...s.sources, deezer: v } })} />
        </Cell>
        <Cell noicon label={t('soundcloudClientId')}>
          <span className="cell-value mono">{clientId.length > 12 ? `${clientId.slice(0, 6)}…${clientId.slice(-4)}` : clientId}</span>
          <button
            className="btn small glass glass-press"
            style={{ height: 30, padding: '0 12px', fontSize: 13 }}
            onClick={() => {
              setClientId('…');
              api.clientId(true).then((id) => (setClientId(id), toast(`${t('soundcloudClientId')}: ${t('done')}`))).catch(() => setClientId('—'));
            }}
          >
            <span>{t('refresh')}</span>
          </button>
        </Cell>
        <Cell noicon label={t('youtubeKey')}>
          <input className="cell-input mono" type="password" placeholder="AIza…" value={s.youtubeApiKey} onChange={(e) => s.set({ youtubeApiKey: e.target.value.trim() })} />
        </Cell>
        <Cell noicon label={t('region')}>
          <Select value={s.region} options={REGIONS.map((r) => ({ value: r, label: r }))} onChange={(v) => s.set({ region: v })} />
        </Cell>
      </div>
      <div className="group-foot">{t('youtubeKeyHint')}</div>

      <div className="group-label">{t('playback')}</div>
      <div className="group">
        <Cell icon={<IconMusic size={17} />} color="#0a84ff" label={t('autoplay')}>
          <Toggle checked={s.autoplay} onChange={(v) => s.set({ autoplay: v })} />
        </Cell>
        <Cell icon={<IconMusic size={17} />} color="#5e5ce6" label={t('skipUnavailable')}>
          <Toggle checked={s.skipUnavailable} onChange={(v) => s.set({ skipUnavailable: v })} />
        </Cell>
        <Cell icon={<IconQuote size={17} />} color="#ff9f0a" label={t('lyricsLine')}>
          <Toggle checked={s.showLyricsLine} onChange={(v) => s.set({ showLyricsLine: v })} />
        </Cell>
      </div>

      {isTauri && (
        <>
          <div className="group-label">Discord</div>
          <div className="group">
            <Cell icon={<IconDiscord size={18} />} color="#5865F2" label={t('discordStatus')}>
              <Toggle checked={s.discordEnabled} onChange={(v) => s.set({ discordEnabled: v })} />
            </Cell>
            <Cell noicon label="Application ID">
              <input className="cell-input mono" inputMode="numeric" placeholder={(import.meta.env.VITE_DISCORD_APP_ID as string | undefined) || '123456789012345678'} value={s.discordAppId} onChange={(e) => s.set({ discordAppId: e.target.value.replace(/\D/g, '') })} />
            </Cell>
          </div>
          <div className="group-foot">{t('discordHint')}</div>
        </>
      )}

      <div className="group-label">{t('account')}</div>
      <div className="group">
        {account.profile ? (
          <>
            <div className="cell" style={{ gap: 12 }}>
              <Avatar avatar={account.profile.avatar} name={account.profile.displayName} size={40} />
              <span className="cell-label">
                {account.profile.displayName}
                <small>
                  @{account.profile.username} · {account.mode === 'supabase' ? t('modeCloud') : t('modeLocal')}
                </small>
              </span>
              <button className="btn tonal small" onClick={() => open({ type: 'editProfile' })}>
                <span>{t('edit')}</span>
              </button>
            </div>
            {account.profile.email && !account.profile.email.endsWith('.local') && (
              <div className="cell noicon">
                <span className="cell-label">{t('email')}</span>
                <span className="cell-value">{account.profile.email}</span>
              </div>
            )}
            <button className="cell noicon" onClick={() => pull()} disabled={cloud.status === 'syncing'}>
              <span className="cell-label">
                {t('syncNow')}
                <small>
                  {cloud.status === 'syncing'
                    ? t('syncing')
                    : cloud.status === 'not_setup'
                      ? t('syncNotSetup')
                      : cloud.status === 'error'
                        ? t('syncError')
                        : cloud.lastSync
                          ? `${t('syncOk')} · ${new Date(cloud.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : t('syncHint')}
                </small>
              </span>
              {cloud.status === 'syncing' ? <span className="spinner" style={{ width: 16, height: 16 }} /> : null}
            </button>
            <button className="cell destructive" onClick={() => account.signOut()}>
              {t('signOut')}
            </button>
          </>
        ) : (
          <button className="cell noicon" onClick={() => open({ type: 'auth' })}>
            <span className="cell-label">{t('signIn')}</span>
            <IconChevronRight size={16} style={{ opacity: 0.4 }} />
          </button>
        )}
      </div>
      <div className="group-foot">
        {account.profile ? (account.mode === 'supabase' ? t('syncHint') : t('syncLocal')) : account.cloudAvailable ? t('cloudNote') : t('localNote')}
      </div>

      <div className="group-label">{t('storage')}</div>
      <div className="group">
        <button
          className="cell destructive"
          onClick={() =>
            open({
              type: 'confirm',
              title: t('clearCache'),
              action: t('delete'),
              destructive: true,
              onConfirm: () => useLibrary.setState({ likes: [], dislikes: [], playlists: [], savedPlaylists: [], recent: [], recentSearches: [] }),
            })
          }
        >
          {t('clearCache')}
        </button>
      </div>

      <div className="group-label">{t('about')}</div>
      <div className="group">
        <div className="cell" style={{ gap: 14 }}>
          <Logo size={44} />
          <span className="cell-label">
            <b>Sonara</b>
            <small>
              {t('version')} {__APP_VERSION__} · {platformName}
            </small>
          </span>
        </div>
      </div>
      <div className="group-foot">Lyrics: LRCLIB · Icons: Framework7 Icons (MIT)</div>
    </div>
  );
}
