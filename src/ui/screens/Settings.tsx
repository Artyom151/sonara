import { trayAvailable } from '../../platform/tray';
import { EqPanel } from '../components/EqPanel';
import { glassStatus } from '../glass/liquid';
import { updatesSupported, useUpdates } from '../../platform/updates';
import { Bypass, autoPickBypass, bypassAutoSupported, BYPASS_HOSTS, bypassSupported, type BypassPreset, type BypassService, type BypassServiceConfig } from '../../platform/dpi';
import { SOURCE_ORDER, SOURCES } from '../sources';
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
import { openExternal } from '../components/actions';
import { copyLogs } from '../../platform/logs';
import { useT } from '../i18n';
import { IconChevronLeft, IconChevronRight,  IconDiscord, IconMusic, IconQuote, IconShield } from '../icons';
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

/** Built-in DPI bypass (platform/dpi.ts, src-tauri/src/dpi.rs). */
function BypassSettings() {
  const t = useT();
  const s = useSettings();
  const b = s.bypass;
  const [picking, setPicking] = useState<BypassService | null>(null);
  const autoPick = (k: BypassService) => {
    setPicking(k);
    autoPickBypass(k)
      .then((r) => toast(r ? `${SOURCES[k].name}: ${r.strategy || t('bypassOff')} · ${(r.ms / 1000).toFixed(1)} s` : `${SOURCES[k].name}: ${t('bypassAutoNone')}`))
      .catch((e) => toast(String((e as Error).message ?? e)))
      .finally(() => setPicking(null));
  };
  const setService = (k: BypassService, patch: Partial<BypassServiceConfig>) =>
    s.set({ bypass: { ...b, services: { ...b.services, [k]: { ...b.services[k], ...patch } } } });
  const presets: { value: BypassPreset; label: string }[] = [
    { value: 'off', label: t('bypassOff') },
    { value: 'tlsrec', label: 'TLS record' },
    { value: 'split', label: 'Split' },
    { value: 'disorder', label: 'Disorder' },
    { value: 'strong', label: t('bypassStrong') },
    { value: 'custom', label: t('bypassCustom') },
  ];
  return (
    <>
      <div className="group-label">{t('bypass')}</div>
      <div className="group">
        <Cell icon={<IconShield size={18} />} color="#30d158" label={t('bypassEnable')}>
          <Toggle checked={b.enabled} onChange={(v) => s.set({ bypass: { ...b, enabled: v } })} />
        </Cell>
        {b.enabled &&
          (Object.keys(BYPASS_HOSTS) as BypassService[]).map((k) => {
            const { name, Icon, color, fg } = SOURCES[k];
            const c = b.services[k];
            return (
              <div key={k}>
                <Cell icon={<Icon size={18} style={fg ? { color: fg } : undefined} />} color={color} label={name}>
                  <Select value={c.preset} options={presets} onChange={(v) => setService(k, { preset: v })} />
                </Cell>
                {bypassAutoSupported && (
                  <button className="cell noicon" onClick={() => autoPick(k)} disabled={picking !== null}>
                    {picking === k ? t('bypassAutoRunning') : t('bypassAuto')}
                  </button>
                )}
                {c.preset === 'custom' && (
                  <Cell noicon label={t('bypassStrategy')}>
                    <input className="cell-input mono" placeholder="tlsrec=sni+1,split=sni+3,disorder" value={c.custom} onChange={(e) => setService(k, { custom: e.target.value })} />
                  </Cell>
                )}
              </div>
            );
          })}
      </div>
      <div className="group-foot">{t('bypassHint')}</div>
    </>
  );
}

/** "Close to tray": only offered when the system has a tray (Linux needs an appindicator library). */
function TrayCell() {
  const t = useT();
  const s = useSettings();
  const [ok, setOk] = useState(false);
  useEffect(() => void trayAvailable().then(setOk), []);
  if (!ok) return null;
  return (
    <Cell noicon label={t('closeToTray')} hint={t('closeToTrayHint')}>
      <Toggle checked={s.closeToTray} onChange={(v) => s.set({ closeToTray: v })} />
    </Cell>
  );
}

/** Check for updates by hand; a newer release gets a Download row. */
function UpdateCells() {
  const t = useT();
  const u = useUpdates();
  const status =
    u.status === 'checking' ? t('checkingUpdates') : u.status === 'available' ? `${t('updateAvailable')} · ${u.info?.version}` : u.status === 'latest' ? t('upToDate') : u.status === 'error' ? t('updateError') : '';
  return (
    <>
      <button className="cell noicon" onClick={() => void u.check(true)} disabled={u.status === 'checking'}>
        <span className="cell-label">
          {t('checkUpdates')}
          {status && <small>{status}</small>}
        </span>
        {u.status === 'checking' ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <IconChevronRight size={16} style={{ opacity: 0.4 }} />}
      </button>
      {u.status === 'available' && u.info && (
        <button className="cell noicon" onClick={() => void openExternal(u.info!.downloadUrl)}>
          <span className="cell-label" style={{ color: 'var(--accent)' }}>
            {t('updateDownload')} {u.info.version}
          </span>
        </button>
      )}
    </>
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
  const [dynamicOk, setDynamicOk] = useState<boolean | null>(null);

  useEffect(() => {
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
        <Cell noicon label={t('theme')}>
          <Select
            value={s.theme}
            options={[
              { value: 'system', label: t('themeSystem') },
              { value: 'light', label: t('themeLight') },
              { value: 'dark', label: t('themeDark') },
            ]}
            onChange={(v) => s.set({ theme: v })}
          />
        </Cell>
        {desktop && (
          <Cell noicon label={t('railSide')}>
            <Select
              value={s.railSide}
              options={[
                { value: 'left', label: t('railLeft') },
                { value: 'right', label: t('railRight') },
              ]}
              onChange={(v) => s.set({ railSide: v })}
            />
          </Cell>
        )}
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
        {SOURCE_ORDER.map((src) => {
          const { name, Icon, color, fg } = SOURCES[src];
          return (
            <Cell key={src} icon={<Icon size={18} style={fg ? { color: fg } : undefined} />} color={color} label={name}>
              <Toggle checked={s.sources[src] ?? true} onChange={(v) => s.set({ sources: { ...s.sources, [src]: v } })} />
            </Cell>
          );
        })}
        <Cell noicon label={t('region')}>
          <Select value={s.region} options={REGIONS.map((r) => ({ value: r, label: r }))} onChange={(v) => s.set({ region: v })} />
        </Cell>
      </div>
      <div className="group-foot">{t('youtubeKeyHint')}</div>

      <EqPanel />

      {bypassSupported && <BypassSettings />}

      <div className="group-label">{t('playback')}</div>
      <div className="group">
        <Cell icon={<IconMusic size={17} />} color="#0a84ff" label={t('autoplay')}>
          <Toggle checked={s.autoplay} onChange={(v) => s.set({ autoplay: v })} />
        </Cell>
        <Cell icon={<IconMusic size={17} />} color="#ff9f0a" label={t('normalize')}>
          <Toggle checked={s.normalize} onChange={(v) => s.set({ normalize: v })} />
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
            <TrayCell />
            <Cell icon={<IconDiscord size={18} />} color="#5865F2" label={t('discordStatus')}>
              <Toggle checked={s.discordEnabled} onChange={(v) => s.set({ discordEnabled: v })} />
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
        <div className="cell noicon">
          <span className="cell-label">
            {t('glassEngine')}
            <small>
              {glassStatus.mode === 'off' ? `${t('glassOff')}: ${glassStatus.reason || '—'}` : glassStatus.mode === 'svg' ? t('glassShader') : t('glassOverlay')}
            </small>
          </span>
        </div>
        {updatesSupported && <UpdateCells />}
      </div>
      <div className="group">
        <button className="cell noicon" onClick={() => void copyLogs()}>
          <span className="cell-label">
            {t('copyLogs')}
            <small>{t('copyLogsHint')}</small>
          </span>
        </button>
      </div>
      <div className="group-foot">Lyrics: LRCLIB · Icons: Framework7 Icons (MIT)</div>
    </div>
  );
}
