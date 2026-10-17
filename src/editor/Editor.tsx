import { useEffect, useRef, useState, type CSSProperties } from 'react';
import MorphText from '../morph/MorphText';
import type { Align } from '../morph/layout';
import { VARIANTS, type Variant } from '../morph/variants';
import ColorPicker from './ColorPicker';
import { DEFAULT_SETTINGS, LIMITS, type Settings } from './settings';
import VariantPicker from './VariantPicker';
import './editor.css';

const REPO = 'https://github.com/waseem091/geist-pixel-animation';

// The controls, split in two for a phone; a wide screen shows them all.
const TABS = [
  ['text', 'Text'],
  ['style', 'Style'],
] as const;

const ALIGNS: [Align, string][] = [
  ['left', 'Left'],
  ['center', 'Center'],
  ['right', 'Right'],
];

// How far along its track a slider is, for the filled part of the track.
const fill = (v: number, lo: number, hi: number) => ({ '--p': `${((v - lo) / (hi - lo)) * 100}%` }) as CSSProperties;

type SliderProps = {
  id: string;
  label: string;
  value: number;
  range: readonly [number, number];
  step: number;
  unit: string;
  onChange: (value: number) => void;
};

function Slider({ id, label, value, range: [lo, hi], step, unit, onChange }: SliderProps) {
  return (
    <div className="row">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={lo}
        max={hi}
        step={step}
        value={value}
        style={fill(value, lo, hi)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="row-value">
        <output htmlFor={id}>{value}</output>
        <span className="unit">{unit}</span>
      </span>
    </div>
  );
}

export default function Editor() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  // The face the text was in before the current one, so Replay can play that morph again.
  const [previous, setPrevious] = useState<Variant | null>(null);
  const [replay, setReplay] = useState(0);
  const [missing, setMissing] = useState<string[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('text');

  const set = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));

  const pick = (variant: Variant) => {
    if (variant === settings.variant) return;
    setPrevious(settings.variant);
    set({ variant });
  };

  // 1–5 pick a face from anywhere but a text field.
  const pickRef = useRef(pick);
  useEffect(() => {
    pickRef.current = pick;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest('textarea, input:not([type="range"]), [contenteditable="true"]')) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= VARIANTS.length) pickRef.current(VARIANTS[n - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="editor" style={{ background: settings.background }}>
      <nav className="chips" aria-label="About this project">
        <a href={REPO} className="chip" target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          GitHub
        </a>
      </nav>

      <div className="stage">
        <MorphText
          className="stage-text"
          text={settings.text}
          variant={settings.variant}
          fontSize={settings.fontSize}
          letterSpacing={settings.letterSpacing}
          lineSpacing={settings.lineSpacing}
          align={settings.align}
          color={settings.color}
          duration={settings.duration}
          replay={replay}
          replayFrom={previous}
          onMissing={setMissing}
        />
      </div>

      <aside className="panel" aria-label="Customize" data-tab={tab}>
        <div className="field">
          <span className="picker-label" id="variant-label">
            Typeface
          </span>
          <VariantPicker value={settings.variant} onChange={pick} labelledBy="variant-label" />
          <p className="hint hint-keys">Pick a face to morph into it, or press 1–5.</p>
        </div>

        {/* On a phone the rest is split in two; on a wide screen all of it shows and this row is hidden. */}
        <div className="tabs" style={{ '--n': TABS.length, '--i': TABS.findIndex(([id]) => id === tab) } as CSSProperties}>
          <span className="slide" aria-hidden="true" />
          {TABS.map(([id, label]) => (
            <button key={id} type="button" className="tab" aria-pressed={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        <div className="group group-text">
          <div className="field">
            <label htmlFor="text">Your text</label>
            <textarea
              id="text"
              rows={2}
              maxLength={LIMITS.chars}
              spellCheck={false}
              placeholder="Type something…"
              value={settings.text}
              onChange={(e) => set({ text: e.target.value })}
            />
            <p className={missing.length > 0 ? 'hint hint-count has-warning' : 'hint hint-count'}>
              {settings.text.length}/{LIMITS.chars}. Enter starts a new line.
              {missing.length > 0 && (
                <> Geist Pixel has no glyph for {missing.map((c) => `“${c}”`).join(' ')}, so {missing.length === 1 ? 'it was' : 'they were'} left out.</>
              )}
            </p>
          </div>

          <div className="field field-inline">
            <span className="picker-label" id="align-label">
              Align
            </span>
            <div
              className="variants segments"
              role="radiogroup"
              aria-labelledby="align-label"
              style={{ '--n': ALIGNS.length, '--i': ALIGNS.findIndex(([a]) => a === settings.align) } as CSSProperties}
            >
              <span className="slide" aria-hidden="true" />
              {ALIGNS.map(([a, label]) => (
                <button key={a} type="button" role="radio" className="variant" aria-checked={settings.align === a} onClick={() => set({ align: a })}>
                  <span className="variant-name">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="group group-style">
          <div className="sliders">
            <Slider id="size" label="Font size" value={settings.fontSize} range={LIMITS.fontSize} step={1} unit="px" onChange={(fontSize) => set({ fontSize })} />
            <Slider
              id="letter-spacing"
              label="Letter spacing"
              value={settings.letterSpacing}
              range={LIMITS.letterSpacing}
              step={1}
              unit="px"
              onChange={(letterSpacing) => set({ letterSpacing })}
            />
            <Slider
              id="line-spacing"
              label="Line spacing"
              value={settings.lineSpacing}
              range={LIMITS.lineSpacing}
              step={1}
              unit="px"
              onChange={(lineSpacing) => set({ lineSpacing })}
            />
            <Slider
              id="duration"
              label="Duration"
              value={settings.duration}
              range={LIMITS.duration}
              step={50}
              unit="ms"
              onChange={(duration) => set({ duration })}
            />
          </div>

          <div className="colors">
            <ColorPicker label="Background" value={settings.background} onChange={(background) => set({ background })} />
            <ColorPicker label="Text color" value={settings.color} onChange={(color) => set({ color })} />
          </div>
        </div>

        <div className="buttons">
          <button type="button" onClick={() => setReplay((r) => r + 1)}>
            Replay
          </button>
          <button type="button" onClick={() => setSettings((s) => ({ ...DEFAULT_SETTINGS, text: s.text, variant: s.variant }))}>
            Reset
          </button>
        </div>
      </aside>
    </div>
  );
}
