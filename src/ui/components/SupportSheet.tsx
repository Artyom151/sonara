import cardImage from '../../assets/support-card.png';
import { Sheet } from './controls';
import { toast } from './Toast';
import { useT } from '../i18n';
import { IconCheck } from '../icons';

/** Card for voluntary support of the author: a bank transfer to this card number. */
export const SUPPORT_CARD = '40817810000124619161';

export function SupportSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_CARD);
      toast(t('supportCopied'));
    } catch {
      toast(t('supportCopyFailed'));
    }
  };
  return (
    <Sheet open onClose={onClose} title={t('supportAuthor')}>
      <div className="support">
        <p className="support-text">{t('supportText')}</p>
        <div className="support-card" aria-label={t('supportCard')} style={{ backgroundImage: `url(${cardImage})` }}>
          {SUPPORT_CARD.replace(/(\d{4})(?=\d)/g, '$1 ')}
        </div>
        <button className="btn primary" onClick={copy}>
          <IconCheck size={16} />
          <span>{t('supportCopy')}</span>
        </button>
      </div>
    </Sheet>
  );
}
