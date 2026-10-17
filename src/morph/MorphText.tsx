import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CELL_EM, layout, type Align } from './layout';
import { MorphPainter } from './painter';
import { NOTHING, SHAPES, type Variant } from './variants';

// The first morph grows the text out of nothing, a moment after the page appears.
const INTRO_DELAY_MS = 150;
// Room around the pixels for their antialiased edges, in px.
const BLEED = 2;

export type MorphTextProps = {
  /** What to show. Newlines start a new line; lines also wrap to fit. */
  text: string;
  /** Which Geist Pixel face. Changing it morphs every pixel into the new face's shape. */
  variant: Variant;
  /** Font size in px; one pixel of the font is 0.038 of it. */
  fontSize: number;
  /** Extra space after every character, in px. */
  letterSpacing: number;
  /** Extra space between lines, in px. */
  lineSpacing: number;
  /** Any CSS colour. Defaults to the colour the component inherits. */
  color?: string;
  /** How long one morph takes, in ms. */
  duration: number;
  /** How the lines line up with each other. */
  align?: Align;
  /** Bumping this plays a morph into `variant` again, from `replayFrom` (or from nothing). */
  replay?: number;
  replayFrom?: Variant | null;
  /** Called with the characters Geist Pixel has no glyph for, which are left out. */
  onMissing?: (chars: string[]) => void;
  className?: string;
  style?: CSSProperties;
};

/**
 * Text set in Geist Pixel, drawn pixel by pixel on a canvas. Change `variant`
 * and every pixel morphs from its shape in one face to its shape in the other:
 * solid squares break into dots, dots into triangles, and so on.
 */
export default function MorphText({
  text,
  variant,
  fontSize,
  letterSpacing,
  lineSpacing,
  color,
  duration,
  align = 'center',
  replay = 0,
  replayFrom = null,
  onMissing,
  className,
  style,
}: MorphTextProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painterRef = useRef<MorphPainter | null>(null);
  const [room, setRoom] = useState(0);

  // Read by the effects below without restarting them.
  const latest = useRef({ variant, duration, replayFrom, onMissing });
  useLayoutEffect(() => {
    latest.current = { variant, duration, replayFrom, onMissing };
  });

  useLayoutEffect(() => {
    const painter = new MorphPainter(canvasRef.current!);
    painterRef.current = painter;
    return () => painter.destroy();
  }, []);

  // The width the text may fill before it wraps.
  useLayoutEffect(() => {
    const el = rootRef.current!;
    const observer = new ResizeObserver(() => setRoom(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cell = fontSize * CELL_EM;
  const laid = useMemo(
    () => layout(text, { cell, letterSpacing, lineSpacing, maxWidth: room > 0 ? room : Infinity, align }),
    [text, cell, letterSpacing, lineSpacing, room, align],
  );
  const frame = {
    left: laid.ink.left - BLEED,
    top: laid.ink.top - BLEED,
    width: laid.ink.right - laid.ink.left + 2 * BLEED,
    height: laid.ink.bottom - laid.ink.top + 2 * BLEED,
  };

  useLayoutEffect(() => {
    painterRef.current?.setScene(laid.pixels, cell, { left: frame.left, top: frame.top, width: frame.width, height: frame.height });
  }, [laid, cell, frame.left, frame.top, frame.width, frame.height]);

  const missing = laid.missing.join('');
  useLayoutEffect(() => {
    latest.current.onMissing?.([...missing]);
  }, [missing]);

  // The canvas needs a real colour; the root resolves currentColor, var(--x) and the like.
  useLayoutEffect(() => {
    painterRef.current?.setColor(getComputedStyle(rootRef.current!).color);
  }, [color]);

  const introduced = useRef(false);
  useLayoutEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const delay = introduced.current ? 0 : INTRO_DELAY_MS;
    introduced.current = true;
    painterRef.current?.morph(SHAPES[variant], { duration: reduced ? 0 : latest.current.duration, delay });
  }, [variant]);

  useLayoutEffect(() => {
    if (!replay) return;
    const { variant: to, replayFrom: from, duration: ms } = latest.current;
    painterRef.current?.morph(SHAPES[to], { from: from ? SHAPES[from] : NOTHING, duration: ms });
  }, [replay]);

  return (
    <div ref={rootRef} className={className} style={{ display: 'flex', justifyContent: 'center', color, ...style }}>
      <div role="img" aria-label={text} style={{ position: 'relative', flex: 'none', width: laid.width, height: laid.height }}>
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: frame.left,
            top: frame.top,
            width: Math.max(0, frame.width),
            height: Math.max(0, frame.height),
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}
