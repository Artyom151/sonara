import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useAccount } from '../../account/store';
import type { Comment } from '../../account/types';
import { seek } from '../../player/engine';
import { usePlayer } from '../../store/player';
import { useUi } from '../../store/ui';
import { Avatar } from '../components/Avatar';
import { toast } from '../components/Toast';
import { fmtTime, useT } from '../i18n';
import { IconComment, IconSend, IconTrash } from '../icons';

const ago = (iso: string, ru: boolean) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const f = (n: number, en: string, r: string) => `${Math.floor(n)} ${ru ? r : en}`;
  if (s < 60) return ru ? 'сейчас' : 'now';
  if (s < 3600) return f(s / 60, 'min', 'мин');
  if (s < 86400) return f(s / 3600, 'h', 'ч');
  return f(s / 86400, 'd', 'д');
};

/** Top-level comments newest first, each followed by its replies oldest first (orphans stay top-level). */
function threaded(items: Comment[]) {
  const ids = new Set(items.map((c) => c.id));
  return items
    .filter((c) => !c.parentId || !ids.has(c.parentId))
    .flatMap((c) => [
      { c, reply: false },
      ...items
        .filter((r) => r.parentId === c.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((r) => ({ c: r, reply: true })),
    ]);
}

/** Comments for a track, live-updating (Supabase Realtime or local events in mock mode). */
export function useComments(trackKey?: string) {
  const provider = useAccount((s) => s.provider);
  const mode = useAccount((s) => s.mode);
  const [state, setState] = useState<{ items: Comment[]; loading: boolean; error: string | null }>({ items: [], loading: false, error: null });

  useEffect(() => {
    if (!trackKey) return;
    let alive = true;
    const load = () =>
      provider()
        .comments.list(trackKey)
        .then((items) => alive && setState({ items, loading: false, error: null }))
        .catch((e) => alive && setState({ items: [], loading: false, error: (e as Error).message }));
    setState((s) => ({ ...s, loading: true }));
    load();
    const off = provider().comments.subscribe(trackKey, load);
    return () => {
      alive = false;
      off();
    };
  }, [trackKey, mode, provider]);

  return { ...state, setItems: (fn: (c: Comment[]) => Comment[]) => setState((s) => ({ ...s, items: fn(s.items) })) };
}

export function CommentsPanel({ compact }: { compact?: boolean }) {
  const t = useT();
  const ru = t('signIn') === 'Войти';
  const track = usePlayer((s) => s.queue[s.index]);
  const position = usePlayer((s) => s.position);
  const profile = useAccount((s) => s.profile);
  const provider = useAccount((s) => s.provider);
  const open = useUi((s) => s.open);
  const { items, loading, error, setItems } = useComments(track?.key);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);

  if (!track) return null;

  const send = async () => {
    const body = text.trim();
    if (!body || !profile || sending) return;
    setSending(true);
    try {
      const c = await provider().comments.post(profile, track.key, body.slice(0, 500), Math.floor(position), replyTo?.id ?? null);
      setItems((list) => (list.some((x) => x.id === c.id) ? list : [c, ...list]));
      setText('');
      setReplyTo(null);
    } catch (e) {
      toast((e as Error).message === 'comments_not_setup' ? t('commentsNotSetup') : t('errNetwork'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`comments ${compact ? 'compact' : ''}`}>
      <div className="comments-list">
        {loading && !items.length && (
          <div className="empty">
            <span className="spinner" />
          </div>
        )}
        {error === 'comments_not_setup' && <div className="empty">{t('commentsNotSetup')}</div>}
        {!loading && !error && !items.length && (
          <div className="empty comments-empty">
            <IconComment size={34} />
            <p>{t('noComments')}</p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {threaded(items).map(({ c, reply }) => (
            <motion.div
              key={c.id}
              layout
              className={`comment ${reply ? 'comment-reply' : ''}`}
              initial={{ opacity: 0, y: -10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            >
              <Avatar avatar={c.author.avatar} name={c.author.displayName} size={34} />
              <div className="comment-main">
                <div className="comment-head">
                  <b>{c.author.displayName}</b>
                  <span>@{c.author.username}</span>
                  <span>· {ago(c.createdAt, ru)}</span>
                </div>
                <p>{c.body}</p>
                <div className="comment-actions">
                  <button className="comment-time" onClick={() => seek(c.position)}>
                    {fmtTime(c.position)}
                  </button>
                  {profile && !reply && (
                    <button className="comment-reply-btn" onClick={() => setReplyTo(c)}>
                      {t('reply')}
                    </button>
                  )}
                </div>
              </div>
              {profile?.id === c.author.id && (
                <button
                  className="row-btn"
                  aria-label={t('delete')}
                  onClick={() =>
                    provider()
                      .comments.remove(c.id)
                      .then(() => setItems((l) => l.filter((x) => x.id !== c.id)))
                      .catch(() => toast(t('errNetwork')))
                  }
                >
                  <IconTrash size={16} />
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {profile && replyTo && (
        <div className="composer-reply">
          <span>
            {t('replyingTo')} @{replyTo.author.username}
          </span>
          <button type="button" onClick={() => setReplyTo(null)} aria-label={t('cancelReply')}>
            ×
          </button>
        </div>
      )}

      {profile ? (
        <form
          className="composer glass"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <Avatar avatar={profile.avatar} name={profile.displayName} size={30} />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`${t('commentAt')} ${fmtTime(position)}`} maxLength={500} enterKeyHint="send" />
          <motion.button type="submit" className="composer-send" disabled={!text.trim() || sending} whileTap={{ scale: 0.85 }} aria-label={t('send')}>
            <IconSend size={28} />
          </motion.button>
        </form>
      ) : (
        <button className="composer glass signin" onClick={() => open({ type: 'auth' })}>
          <span>{t('signInToComment')}</span>
        </button>
      )}
    </div>
  );
}
