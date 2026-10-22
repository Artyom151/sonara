import { useState } from 'react';
import { supabase } from '../../account/remote';
import { useTogether } from '../../player/together';
import { toast } from './Toast';
import { Sheet } from './controls';
import { useT } from '../i18n';

/** Listen together: create a room (the host plays) or join one by its code (the guest follows). */
export function TogetherSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { role, code, start, leave } = useTogether();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (r: 'host' | 'guest', c?: string) => {
    setBusy(true);
    try {
      await start(r, c);
    } catch (e) {
      const m = (e as Error).message;
      toast(m === 'offline' ? t('togetherOffline') : t('togetherError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={t('together')}>
      <div className="together">
        {role && code ? (
          <>
            <p className="together-role">{role === 'host' ? t('togetherHost') : t('togetherGuest')}</p>
            <div className="together-code">{code}</div>
            <button className="btn tonal" onClick={() => void navigator.clipboard?.writeText(code)}>
              <span>{t('togetherCopy')}</span>
            </button>
            <button className="btn" onClick={leave}>
              <span>{t('togetherLeave')}</span>
            </button>
          </>
        ) : (
          <>
            <p className="together-hint">{supabase ? t('togetherHint') : t('togetherOffline')}</p>
            <button className="btn primary" disabled={busy || !supabase} onClick={() => void run('host')}>
              <span>{t('togetherCreate')}</span>
            </button>
            <div className="together-join">
              <input
                className="together-input"
                value={input}
                maxLength={6}
                placeholder={t('togetherCodePlaceholder')}
                onChange={(e) => setInput(e.target.value.toUpperCase())}
                aria-label={t('togetherCode')}
              />
              <button className="btn tonal" disabled={busy || !supabase || input.trim().length < 6} onClick={() => void run('guest', input)}>
                <span>{t('togetherJoin')}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
