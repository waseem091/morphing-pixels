import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ElementType } from 'react';
import { CELL_EM, layout, type Align } from './layout';
import { MorphPainter } from './painter';
import { VARIANTS, type Variant } from './variants';

// The first morph grows the text out of nothing, a moment after the page appears.
const INTRO_DELAY_MS = 150;
// Room around the pixels for their antialiased edges, in px.
const BLEED = 2;
// Off screen but still read by screen readers, found by search and copied with the page.
const HIDDEN: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  border: 0,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export type PixelMorphProps = {
  /** What to show. Newlines start a new line; lines also wrap to fit. */
  text: string;
  /** Which Geist Pixel face. Change it and every pixel morphs into the new face's shape. Default 'square'. */
  variant?: Variant;
  /** Font size in px; one pixel of the font is 0.038 of it. Default 64. */
  fontSize?: number;
  /** Extra space after every character, in px. Default 0. */
  letterSpacing?: number;
  /** Extra space between lines, in px. Default a fifth of fontSize. */
  lineSpacing?: number;
  /** Any CSS colour, var(--x) included. Defaults to the colour the component inherits. */
  color?: string;
  /** How long one morph takes, in ms. Default 800. */
  duration?: number;
  /** How the lines line up, and where the text sits in its width. Default 'left'. */
  align?: Align;
  /**
   * Keep morphing on its own: through every face (true) or through the faces
   * listed, starting from `variant`. Default false.
   */
  cycle?: boolean | readonly Variant[];
  /** With cycle: how long each face rests between morphs, in ms. Default 900. */
  hold?: number;
  /** Grow the text out of nothing when it first appears. Default true. */
  appear?: boolean;
  /** Bumping this plays a morph into the current face again, from `replayFrom` (or from nothing). */
  replay?: number;
  replayFrom?: Variant | null;
  /** The element that holds the text. Default 'div'. */
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  /** Called with the characters Geist Pixel has no glyph for, which are left out. */
  onMissingGlyphs?: (chars: string[]) => void;
};

/**
 * Text set in Geist Pixel, drawn pixel by pixel on a canvas. Change `variant`
 * and every pixel morphs from its shape in one face to its shape in the other:
 * solid squares break into dots, dots sharpen into triangles, and so on.
 */
export default function PixelMorph({
  text,
  variant = 'square',
  fontSize = 64,
  letterSpacing = 0,
  lineSpacing = fontSize / 5,
  color,
  duration = 800,
  align = 'left',
  cycle = false,
  hold = 900,
  appear = true,
  replay = 0,
  replayFrom = null,
  as: Tag = 'div',
  className,
  style,
  onMissingGlyphs,
}: PixelMorphProps) {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painterRef = useRef<MorphPainter | null>(null);
  const [room, setRoom] = useState(0);

  // With cycle on, the face is `variant` moved on by however many turns have passed.
  const faces = cycle === true ? VARIANTS : cycle || null;
  const cycleKey = faces ? faces.join(' ') : '';
  const [turns, setTurns] = useState(0);
  const face = faces && faces.length > 1 ? faces[(Math.max(0, faces.indexOf(variant)) + turns) % faces.length] : variant;
  useEffect(() => {
    if (!cycleKey.includes(' ')) return;
    const timer = window.setInterval(() => setTurns((t) => t + 1), duration + hold);
    return () => window.clearInterval(timer);
  }, [cycleKey, duration, hold]);

  // Read by the effects below without restarting them.
  const latest = useRef({ face, duration, appear, replayFrom, onMissingGlyphs });
  useLayoutEffect(() => {
    latest.current = { face, duration, appear, replayFrom, onMissingGlyphs };
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
    latest.current.onMissingGlyphs?.([...missing]);
  }, [missing]);

  // The canvas needs a real colour; the root resolves currentColor, var(--x) and the like.
  useLayoutEffect(() => {
    painterRef.current?.setColor(getComputedStyle(rootRef.current!).color);
  }, [color]);

  const introduced = useRef(false);
  useLayoutEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const first = !introduced.current;
    introduced.current = true;
    const ms = reduced ? 0 : latest.current.duration;
    if (first && !latest.current.appear) painterRef.current?.morph(face, { from: face, duration: 0 });
    else painterRef.current?.morph(face, { duration: ms, delay: first ? INTRO_DELAY_MS : 0 });
  }, [face]);

  useLayoutEffect(() => {
    if (!replay) return;
    const { face: to, replayFrom: from, duration: ms } = latest.current;
    painterRef.current?.morph(to, { from: from ?? 'nothing', duration: ms });
  }, [replay]);

  const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';

  return (
    <Tag ref={rootRef} className={className} style={{ display: 'flex', justifyContent: justify, color, ...style }}>
      <span style={HIDDEN}>{text}</span>
      <span aria-hidden="true" style={{ position: 'relative', display: 'block', flex: 'none', width: laid.width, height: laid.height }}>
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            left: frame.left,
            top: frame.top,
            width: Math.max(0, frame.width),
            height: Math.max(0, frame.height),
            pointerEvents: 'none',
          }}
        />
      </span>
    </Tag>
  );
}
