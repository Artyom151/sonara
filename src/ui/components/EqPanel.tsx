import { useRef } from 'react';
import { useEq, EQ_PRESETS, EQ_RANGE, type EqPresetId } from '../../player/equalizer';
import { EQ_FREQS } from '../../player/audioGraph';
import { useAudioDevice } from '../../platform/audioDevices';
import { useT } from '../i18n';
import { Select, Toggle } from './controls';

const label = (f: number) => (f >= 1000 ? `${f / 1000}k` : String(f));

/**
 * One band: a vertical track in the app's slider style (accent fill from the zero line, white knob).
 * Drag with a mouse or a finger, or step with the arrow keys.
 */
function EqBand({ value, hz, onChange }: { value: number; hz: string; onChange: (db: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const set = (clientY: number) => {
    const r = track.current!.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    onChange(EQ_RANGE - k * 2 * EQ_RANGE);
  };
  // Position from the top, in percent: +12 dB at the top, -12 dB at the bottom.
  const top = ((EQ_RANGE - value) / (2 * EQ_RANGE)) * 100;
  return (
    <div className="eq-band">
      <span className="eq-db">{value > 0 ? `+${value}` : value}</span>
      <div
        ref={track}
        className="eq-track"
        role="slider"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label={`${hz} Hz`}
        aria-valuemin={-EQ_RANGE}
        aria-valuemax={EQ_RANGE}
        aria-valuenow={value}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = true;
          set(e.clientY);
        }}
        onPointerMove={(e) => drag.current && set(e.clientY)}
        onPointerUp={() => (drag.current = false)}
        onPointerCancel={() => (drag.current = false)}
        onKeyDown={(e) => {
          switch (e.key) {
            case 'ArrowUp':
            case 'ArrowRight':
              return onChange(value + 0.5);
            case 'ArrowDown':
            case 'ArrowLeft':
              return onChange(value - 0.5);
          }
        }}
      >
        <div className="eq-rail" />
        <div className="eq-fill" style={{ top: `${Math.min(top, 50)}%`, height: `${Math.abs(top - 50)}%` }} />
        <div className="eq-zero" />
        <div className="eq-knob" style={{ top: `${top}%` }} />
      </div>
      <span className="eq-hz">{hz}</span>
    </div>
  );
}

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
                <EqBand key={f} value={eq.gains[i]} hz={label(f)} onChange={(db) => eq.setBand(i, db)} />
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
