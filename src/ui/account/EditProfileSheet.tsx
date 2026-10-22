import { motion } from 'motion/react';
import { useRef, useState } from 'react';
import { useAccount } from '../../account/store';
import { normalizeUsername } from '../../account/types';
import { Avatar, AVATAR_PRESETS, presetIndex } from '../components/Avatar';
import { Field, Sheet } from '../components/controls';
import { toast } from '../components/Toast';
import { useT, type StrKey } from '../i18n';
import { IconCamera, IconCheck, IconPlus } from '../icons';
import { UsernameHint, useUsernameCheck } from './AuthSheet';

const SAVE_ERRORS: Record<string, StrKey> = { username_taken: 'errUsernameTaken', username_invalid: 'errUsernameInvalid' };

export function EditProfileSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const profile = useAccount((s) => s.profile)!;
  const update = useAccount((s) => s.update);
  const uploadAvatar = useAccount((s) => s.uploadAvatar);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [username, setUsername] = useState(profile.username);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const check = useUsernameCheck(username, profile.username);
  const custom = presetIndex(avatar) < 0 ? avatar : null;

  const save = async () => {
    if (check === 'taken' || check === 'invalid') return;
    setBusy(true);
    try {
      await update({ avatar, displayName: displayName.trim() || username, username });
      toast(t('saved'));
      onClose();
    } catch (e) {
      const code = (e as Error).message;
      toast(t(SAVE_ERRORS[code] ?? 'errNetwork'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={t('editProfile')}>
      <div className="edit-profile">
        <motion.button
          key={avatar}
          className="edit-avatar"
          onClick={() => fileRef.current?.click()}
          aria-label={t('uploadPhoto')}
          initial={{ scale: 0.85, opacity: 0.4 }}
          animate={{ scale: 1, opacity: 1 }}
          whileTap={{ scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 420, damping: 22 }}
        >
          <Avatar avatar={avatar} name={displayName} size={104} />
          <span className="edit-avatar-badge">{uploading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <IconCamera size={15} />}</span>
        </motion.button>
        <button className="btn tonal small edit-upload" onClick={() => fileRef.current?.click()} disabled={uploading}>
          <IconCamera size={15} />
          <span>{t('uploadPhoto')}</span>
        </button>

        <div className="avatar-grid">
          <button className={`avatar-pick upload ${custom ? 'on' : ''}`} onClick={() => fileRef.current?.click()} aria-label={t('uploadPhoto')} disabled={uploading}>
            {custom ? <Avatar avatar={custom} size={52} /> : uploading ? <span className="spinner" /> : <IconPlus size={20} />}
          </button>
          {AVATAR_PRESETS.map((_, i) => {
            const v = `preset:${i}`;
            return (
              <button key={v} className={`avatar-pick ${avatar === v ? 'on' : ''}`} onClick={() => setAvatar(v)} aria-label={`Avatar ${i + 1}`}>
                <Avatar avatar={v} size={52} />
                {avatar === v && (
                  <motion.span layoutId="avatar-check" className="avatar-check">
                    <IconCheck size={12} />
                  </motion.span>
                )}
              </button>
            );
          })}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setUploading(true);
            try {
              setAvatar(await uploadAvatar(f));
            } catch {
              toast(t('errUpload'));
            } finally {
              setUploading(false);
            }
          }}
        />

        <label className="edit-label">{t('displayName')}</label>
        <Field value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} />
        <label className="edit-label">{t('username')}</label>
        <div className="field-prefix">
          <span>@</span>
          <Field value={username} onChange={(e) => setUsername(normalizeUsername(e.target.value))} autoCapitalize="none" />
        </div>
        <UsernameHint state={check} />

        <button className="btn primary edit-save" onClick={save} disabled={busy || check === 'taken' || check === 'invalid' || check === 'checking'}>
          {busy ? <span className="spinner dark" /> : <span>{t('save')}</span>}
        </button>
      </div>
    </Sheet>
  );
}
