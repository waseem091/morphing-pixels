import { ease, easeOut } from './ease';
import { paintPixels } from './paint';
import { mix, NOTHING, shapeFor, type Shape, type Variant } from './variants';

// iOS Safari refuses to draw a canvas with more device pixels than this.
const MAX_AREA = 16_000_000;
// How long a newly typed character takes to grow to full size, in ms.
const GROW_MS = 280;
// How many steps the stagger sweeps across the text in; pixels in one step share a shape.
const BANDS = 48;

/** The part of the block the canvas covers, in px from the block's top-left. */
export type Frame = { left: number; top: number; width: number; height: number };

/**
 * Draws every pixel of the text on one canvas in a shape that can be part way
 * between two Geist Pixel faces, and plays the morph from one to the other.
 * A new morph starts from whatever shape is on screen, so switching faces in
 * the middle of a morph turns it smoothly instead of jumping.
 */
export class MorphPainter {
  private readonly canvas: HTMLCanvasElement;
  private pixels: Float32Array = new Float32Array(0);
  // For each pixel, when its character was typed (performance.now() ms), or 0 if it is not growing.
  private born: Float64Array | null = null;
  private cell = 1;
  private color = '#000';
  private frame: Frame = { left: 0, top: 0, width: 0, height: 0 };
  private dpr = 1;

  // The morph is staggered across the text from left to right: pixels fall
  // into BANDS columns of the block, and each band starts its morph a little
  // after the one to its left. Each band remembers the shape it started from,
  // so a new morph begun part way through starts every band where it is.
  private bands: Uint8Array = new Uint8Array(0);
  private from: Shape[] = new Array<Shape>(BANDS).fill(NOTHING);
  private to: Shape = NOTHING;
  // The face the current (or last) morph is heading for.
  private target: Variant | null = null;
  private start = 0;
  private duration = 0;
  private stagger = 0;
  private raf = 0;
  private readonly grown = new Float32Array(32);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('resize', this.onResize);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    window.removeEventListener('resize', this.onResize);
  }

  /**
   * The pixels to draw (top-left corners in px), one cell's size, the part of
   * the block the canvas covers, and optionally when each pixel's character
   * was typed, so new characters grow in instead of popping up.
   */
  setScene(pixels: Float32Array, cell: number, frame: Frame, born: Float64Array | null = null) {
    this.pixels = pixels;
    this.born = born;
    this.bands = bandsOf(pixels);
    this.cell = cell;
    this.frame = frame;
    this.resize();
    const now = performance.now();
    this.draw(now);
    if (this.growing(now) && !this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  setColor(color: string) {
    if (color === this.color) return;
    this.color = color;
    this.draw(performance.now());
  }

  /**
   * Morphs into face `to`: from the shape on screen, or from face `from`
   * ('nothing' grows the pixels out of thin air). The leftmost pixels start
   * after `delay` ms, the rightmost `stagger` ms after them, and each takes
   * `duration` ms.
   */
  morph(
    to: Variant,
    { from, duration, delay = 0, stagger = 0 }: { from?: Variant | 'nothing'; duration: number; delay?: number; stagger?: number },
  ) {
    const now = performance.now();
    const before = from === undefined ? this.target : from === 'nothing' ? null : from;
    let start: Shape | null = null;
    if (from === 'nothing') start = NOTHING;
    else if (from) start = shapeFor(from, to);
    // At rest on a face, start from that face written the best way for this morph.
    else if (this.target && this.done(now)) start = shapeFor(this.target, to);
    // Part way through a morph, each band starts from exactly what is on screen.
    this.from = start ? new Array<Shape>(BANDS).fill(start) : this.from.map((_, b) => this.bandShape(b, now, new Float32Array(32)));
    this.to = shapeFor(to, before);
    this.target = to;
    this.start = now + delay;
    this.duration = duration;
    this.stagger = stagger;
    if (this.done(now)) {
      this.draw(now);
      return;
    }
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  // How far band `b` is through its morph, 0 to 1, before easing.
  private bandProgress(b: number, time: number): number {
    const begin = this.start + (this.stagger * b) / (BANDS - 1);
    if (this.duration <= 0) return time >= begin ? 1 : 0;
    return Math.min(1, Math.max(0, (time - begin) / this.duration));
  }

  private bandShape(b: number, time: number, out: Shape): Shape {
    return mix(this.from[b], this.to, ease(this.bandProgress(b, time)), out);
  }

  private done(time: number): boolean {
    return time >= this.start + this.stagger + Math.max(0, this.duration);
  }

  private growing(time: number): boolean {
    const born = this.born;
    if (!born) return false;
    for (let i = 0; i < born.length; i++) if (time - born[i] < GROW_MS) return true;
    return false;
  }

  private tick = (time: number) => {
    // rAF's timestamp is when the frame began, which can be a moment before a morph that started in it.
    const now = Math.max(time, performance.now());
    this.draw(now);
    this.raf = !this.done(now) || this.growing(now) ? requestAnimationFrame(this.tick) : 0;
  };

  private onResize = () => {
    if (this.deviceRatio() === this.dpr) return;
    this.resize();
    this.draw(performance.now());
  };

  private deviceRatio(): number {
    const { width, height } = this.frame;
    const want = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const area = width * height;
    return area > 0 ? Math.min(want, Math.sqrt(MAX_AREA / area)) : want;
  }

  // The backing store is a whole number of device pixels, and the element is
  // sized to exactly that, so the browser shows it one to one instead of
  // stretching it a fraction and blurring every edge.
  private resize() {
    this.dpr = this.deviceRatio();
    const w = Math.max(1, Math.ceil(this.frame.width * this.dpr));
    const h = Math.max(1, Math.ceil(this.frame.height * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.canvas.style.width = `${w / this.dpr}px`;
    this.canvas.style.height = `${h / this.dpr}px`;
  }

  private draw(time: number) {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.pixels.length) return;
    const d = this.dpr;
    ctx.setTransform(d, 0, 0, d, -this.frame.left * d, -this.frame.top * d);
    ctx.fillStyle = this.color;
    const growing = this.growing(time);
    if (this.done(time) && !growing) {
      paintPixels(ctx, this.pixels, this.cell, this.to);
      return;
    }
    // Pixels that share a shape go into one batch: every band that has
    // finished, every band yet to start from the same shape, each band in
    // between on its own. Pixels still growing in (typed a moment ago) are
    // drawn smaller about their cell's middle, a batch per edit.
    const born = this.born;
    const groups = new Map<string, { band: number; at: number; xy: number[] }>();
    const bandKey = new Array<string>(BANDS);
    for (let b = 0; b < BANDS; b++) {
      const t = this.bandProgress(b, time);
      bandKey[b] = t >= 1 ? 'to' : t <= 0 && this.from[b] === this.from[0] ? 'from' : `b${b}`;
    }
    for (let i = 0; i < this.bands.length; i++) {
      const band = this.bands[i];
      const at = born && time - born[i] < GROW_MS ? born[i] : -1;
      const key = `${bandKey[band]}:${at}`;
      let group = groups.get(key);
      if (!group) groups.set(key, (group = { band, at, xy: [] }));
      group.xy.push(this.pixels[i * 2], this.pixels[i * 2 + 1]);
    }
    for (const { band, at, xy } of groups.values()) {
      const shape = this.bandShape(band, time, this.grown);
      if (at >= 0) {
        const t = easeOut(Math.max(0, (time - at) / GROW_MS));
        for (let i = 0; i < 32; i++) shape[i] = 0.5 + (shape[i] - 0.5) * t;
      }
      paintPixels(ctx, Float32Array.from(xy), this.cell, shape);
    }
  }
}

// Which band of the stagger each pixel is in: its place from the left edge of the text to the right.
function bandsOf(pixels: Float32Array): Uint8Array {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < pixels.length; i += 2) {
    lo = Math.min(lo, pixels[i]);
    hi = Math.max(hi, pixels[i]);
  }
  const bands = new Uint8Array(pixels.length / 2);
  const span = hi - lo;
  if (span > 0) for (let i = 0; i < bands.length; i++) bands[i] = Math.min(BANDS - 1, Math.floor(((pixels[i * 2] - lo) / span) * BANDS));
  return bands;
}
