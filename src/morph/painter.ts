import { ease, easeOut } from './ease';
import { paintPixels } from './paint';
import { mix, NOTHING, shapeFor, type Shape, type Variant } from './variants';

// iOS Safari refuses to draw a canvas with more device pixels than this.
const MAX_AREA = 16_000_000;
// How long a newly typed character takes to grow to full size, in ms.
const GROW_MS = 280;

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

  private from: Shape = NOTHING;
  private to: Shape = NOTHING;
  // The face the current (or last) morph is heading for.
  private target: Variant | null = null;
  private start = 0;
  private duration = 0;
  private raf = 0;
  private readonly now = new Float32Array(32);
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
    this.cell = cell;
    this.frame = frame;
    this.resize();
    const now = performance.now();
    this.draw(now);
    if (this.growing(now) && !this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  setColor(color: string) {
    this.color = color;
    this.draw(performance.now());
  }

  /**
   * Morphs into face `to` over `duration` ms, starting after `delay` ms: from
   * the shape on screen, or from face `from` ('nothing' grows the pixels out
   * of thin air).
   */
  morph(to: Variant, { from, duration, delay = 0 }: { from?: Variant | 'nothing'; duration: number; delay?: number }) {
    const now = performance.now();
    const before = from === undefined ? this.target : from === 'nothing' ? null : from;
    if (from === 'nothing') this.from = NOTHING;
    else if (from) this.from = shapeFor(from, to);
    // At rest on a face, start from that face written the best way for this morph.
    else if (this.target && this.progress(now) >= 1) this.from = shapeFor(this.target, to);
    // Part way through a morph, start from exactly what is on screen.
    else this.from = this.shapeAt(now, new Float32Array(32));
    this.to = shapeFor(to, before);
    this.target = to;
    this.start = now + delay;
    this.duration = duration;
    if (duration <= 0 && delay <= 0) {
      this.draw(now);
      return;
    }
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  private progress(time: number): number {
    if (this.duration <= 0) return time >= this.start ? 1 : 0;
    return Math.min(1, Math.max(0, (time - this.start) / this.duration));
  }

  private shapeAt(time: number, out: Shape): Shape {
    return mix(this.from, this.to, ease(this.progress(time)), out);
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
    this.raf = this.progress(now) < 1 || this.growing(now) ? requestAnimationFrame(this.tick) : 0;
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

  private resize() {
    this.dpr = this.deviceRatio();
    const w = Math.max(1, Math.ceil(this.frame.width * this.dpr));
    const h = Math.max(1, Math.ceil(this.frame.height * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private draw(time: number) {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.pixels.length) return;
    // Device pixels per CSS px, exactly, even after the backing store was rounded up.
    const sx = this.canvas.width / Math.max(1e-6, this.frame.width);
    const sy = this.canvas.height / Math.max(1e-6, this.frame.height);
    ctx.setTransform(sx, 0, 0, sy, -this.frame.left * sx, -this.frame.top * sy);
    ctx.fillStyle = this.color;
    const shape = this.shapeAt(time, this.now);
    if (!this.growing(time)) {
      paintPixels(ctx, this.pixels, this.cell, shape);
      return;
    }
    // Pixels still growing are drawn smaller, about their cell's middle; the
    // ones typed in one go share a size, so each edit is one batch.
    const born = this.born!;
    const groups = new Map<number, number[]>();
    for (let i = 0; i < born.length; i++) {
      const key = time - born[i] < GROW_MS ? born[i] : -1;
      let group = groups.get(key);
      if (!group) groups.set(key, (group = []));
      group.push(this.pixels[i * 2], this.pixels[i * 2 + 1]);
    }
    for (const [at, xy] of groups) {
      const t = at < 0 ? 1 : easeOut(Math.max(0, (time - at) / GROW_MS));
      for (let i = 0; i < 32; i++) this.grown[i] = 0.5 + (shape[i] - 0.5) * t;
      paintPixels(ctx, Float32Array.from(xy), this.cell, this.grown);
    }
  }
}
