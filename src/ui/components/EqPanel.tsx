import { useEq, EQ_PRESETS, EQ_RANGE, type EqPresetId } from '../../player/equalizer';
import { EQ_FREQS } from '../../player/audioGraph';
import { useAudioDevice } from '../../platform/audioDevices';
import { useT } from '../i18n';
import { Select, Toggle } from './controls';

const label = (f: number) => (f >= 1000 ? `${f / 1000}k` : String(f));

/** Equalizer settings: switch, preset, ten vertical bands, preamp, per-headphone profile. */
export function EqPanel() {
  const t = useT();
  const eq = useEq();
  const device = useAudioDevice((s) => s.current);
  const presets: { value: EqPresetId; label: string }[] = [
    { value: 'adaptive', label: t('eq_adaptive') },
    ...(Object.keys(EQ_PRESETS) as (keyof typeof EQ_PRESETS)[]).map((k) => ({ value: k as EqPresetId, label: t(`eq_${k}` as 'eq_flat') })),
    ...(eq.preset === 'custom' ? [{ value: 'custom' as EqPresetId, label: t('eq_custom') }] : []),
  ];
  return (
    <>
      <div className="group-label">{t('equalizer')}</div>
      <div className="group">
        <div className="cell noicon">
          <span className="cell-label">
            {t('equalizerOn')}
            {device && eq.perDevice && <small>{t('eqProfileFor')} {device.name}</small>}
          </span>
          <Toggle checked={eq.enabled} onChange={eq.setEnabled} />
        </div>
        {eq.enabled && (
          <>
            <div className="cell noicon">
              <span className="cell-label">{t('eqPreset')}</span>
              <Select<EqPresetId>
                value={eq.preset}
                options={presets}
                onChange={(v) => v !== 'custom' && eq.setPreset(v)}
              />
            </div>
            {eq.preset === 'adaptive' && <div className="eq-adaptive-hint">{eq.resolved ? `${t('eqAdaptiveNow')}: ${t(`eq_${eq.resolved}` as 'eq_flat')}` : t('eqAdaptiveHint')}</div>}
            <div className="eq-bands" role="group" aria-label={t('equalizer')}>
              {EQ_FREQS.map((f, i) => (
                <label key={f} className="eq-band">
                  <span className="eq-db">{eq.gains[i] > 0 ? `+${eq.gains[i]}` : eq.gains[i]}</span>
                  <input
                    type="range"
                    min={-EQ_RANGE}
                    max={EQ_RANGE}
                    step={0.5}
                    value={eq.gains[i]}
                    onChange={(e) => eq.setBand(i, Number(e.target.value))}
                    aria-label={`${label(f)} Hz`}
                    className="eq-range"
                  />
                  <span className="eq-hz">{label(f)}</span>
                </label>
              ))}
            </div>
            <div className="cell noicon">
              <span className="cell-label">{t('eqPerDevice')}</span>
              <Toggle checked={eq.perDevice} onChange={eq.setPerDevice} />
            </div>
            <button className="cell noicon" onClick={eq.reset}>
              <span className="cell-label">{t('eqReset')}</span>
            </button>
          </>
        )}
      </div>
    </>
  );
}
