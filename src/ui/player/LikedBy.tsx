import { useEffect, useState } from 'react';
import { useAccount } from '../../account/store';
import { useLikeSync } from '../../account/sync';
import { api } from '../../core';
import type { Track } from '../../core/types';
import { Avatar } from '../components/Avatar';
import { useT } from '../i18n';
import { IconHeart } from '../icons';

interface Person {
  name: string;
  avatar?: string;
  preset?: boolean;
}

/** "Liked by Anna, Max and 12": Sonara listeners first, SoundCloud likers when there are none. */
export function LikedBy({ track }: { track: Track }) {
  const t = useT();
  const provider = useAccount((s) => s.provider);
  const mode = useAccount((s) => s.mode);
  const version = useLikeSync((s) => s.version);
  const [state, setState] = useState<{ people: Person[]; count: number; sonara: boolean }>({ people: [], count: 0, sonara: false });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const own = await provider().likes.likedBy(track.key).catch(() => ({ users: [], count: 0 }));
      if (!alive) return;
      if (own.count > 0) {
        setState({ people: own.users.map((u) => ({ name: u.displayName, avatar: u.avatar, preset: true })), count: own.count, sonara: true });
        return;
      }
      const sc = await api.likers(track).catch(() => []);
      if (alive) setState({ people: sc.map((l) => ({ name: l.name, avatar: l.avatar })), count: sc.length, sonara: false });
    })();
    return () => {
      alive = false;
    };
  }, [track.key, version, mode, provider]);

  if (!state.people.length) return null;
  const names = state.people.map((p) => p.name.split(' ')[0]);
  const extra = state.count - names.length;
  const label =
    extra > 0 ? `${names.join(', ')} ${t('and')} ${extra}` : names.length > 1 ? `${names.slice(0, -1).join(', ')} ${t('and')} ${names.at(-1)}` : names[0];
  return (
    <div className="liked-by">
      <div className="avatars">
        {state.people.map((p, i) =>
          p.preset ? <Avatar key={i} avatar={p.avatar} name={p.name} size={22} /> : p.avatar ? <img key={i} src={p.avatar} alt="" /> : <span key={i} />,
        )}
      </div>
      <div>
        <small>
          {t('likedBy')} <IconHeart size={9} filled />
          {state.sonara && <span className="liked-src"> Sonara</span>}
        </small>
        <b>{label}</b>
      </div>
    </div>
  );
}
