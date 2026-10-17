import { easeOut } from './ease';
import { paintPixels } from './paint';
import { faceOf, FACES, NOTHING, shapeFor, type Shape, type Variant } from './variants';

// iOS Safari refuses to draw a canvas with more device pixels than this.
const MAX_AREA = 16_000_000;
// How many of the spring's time constants a morph takes to settle (see morph).
const SETTLE = 7.5;
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
  // For each pixel, its lane: which face it takes in salad (see layout).
  private lanes: Uint8Array = new Uint8Array(0);
  private cell = 1;
  private color = '#000';
  private frame: Frame = { left: 0, top: 0, width: 0, height: 0 };
  private dpr = 1;

  // The shape on screen, one per lane, each of its 32 numbers pulled toward
  // its target shape by a critically damped spring: it keeps its speed when
  // the target changes mid-morph, so a new face bends the motion instead of
  // stopping it. In a single face every lane heads for the same shape; in
  // salad each lane heads for its own.
  private readonly now: Shape[] = FACES.map(() => NOTHING.slice());
  private readonly velocity = FACES.map(() => new Float32Array(32));
  private to: Shape[] = FACES.map(() => NOTHING);
  // The face the current (or last) morph is heading for.
  private target: Variant | null = null;
  // When the spring may start moving (a delayed morph waits until then), and when it last moved.
  private start = 0;
  private last = 0;
  // The spring's angular frequency, per ms; 0 jumps straight to the target.
  private omega = 0;
  private settled = true;
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
  setScene(pixels: Float32Array, cell: number, frame: Frame, born: Float64Array | null = null, lanes: Uint8Array | null = null) {
    this.pixels = pixels;
    this.born = born;
    this.lanes = lanes ?? new Uint8Array(pixels.length / 2);
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
   * Morphs into face `to`, settling in about `duration` ms, starting after
   * `delay` ms: from the shape on screen (keeping its speed), or from face
   * `from` ('nothing' grows the pixels out of thin air).
   */
  morph(to: Variant, { from, duration, delay = 0 }: { from?: Variant | 'nothing'; duration: number; delay?: number }) {
    const now = performance.now();
    this.step(now);
    const before = from === undefined ? this.target : from === 'nothing' ? null : from;
    const resting = this.settled;
    FACES.forEach((_, lane) => {
      const face = faceOf(to, lane);
      const was = before ? faceOf(before, lane) : null;
      let start: Shape | null = null;
      if (from === 'nothing') start = NOTHING;
      else if (from) start = shapeFor(faceOf(from, lane), face);
      // At rest on a face, start from that face written the best way for this morph.
      else if (this.target && resting) start = shapeFor(faceOf(this.target, lane), face);
      if (start) {
        this.now[lane].set(start);
        this.velocity[lane].fill(0);
      }
      this.to[lane] = shapeFor(face, was);
    });
    this.target = to;
    this.start = now + delay;
    this.last = this.start;
    // Critically damped, a spring is within half a percent of its target after
    // about 7.5 / omega, so that is when the morph reads as done.
    this.omega = duration > 0 ? SETTLE / duration : 0;
    this.settled = false;
    if (this.omega === 0 && delay <= 0) this.snap();
    this.draw(now);
    if (!this.settled && !this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  // Moves the spring on to `time`.
  private step(time: number) {
    if (this.settled || time <= this.start) return;
    if (this.omega === 0) {
      this.snap();
      return;
    }
    // Long gaps (a hidden tab) are taken in pieces, so the spring stays exact.
    let dt = Math.min(time - this.last, 1000);
    this.last = time;
    const w = this.omega;
    let moving = false;
    while (dt > 0) {
      const h = Math.min(dt, 32);
      dt -= h;
      const decay = Math.exp(-w * h);
      for (let lane = 0; lane < FACES.length; lane++) {
        const now = this.now[lane];
        const to = this.to[lane];
        const vel = this.velocity[lane];
        for (let i = 0; i < 32; i++) {
          // The exact critically damped solution over h, for offset y and speed v.
          const y = now[i] - to[i];
          const v = vel[i];
          const c = v + w * y;
          now[i] = to[i] + (y + c * h) * decay;
          vel[i] = (v - w * c * h) * decay;
        }
      }
    }
    for (let lane = 0; lane < FACES.length && !moving; lane++) {
      for (let i = 0; i < 32; i++) {
        if (Math.abs(this.now[lane][i] - this.to[lane][i]) > 1e-4 || Math.abs(this.velocity[lane][i]) > 1e-6) moving = true;
      }
    }
    if (!moving) this.snap();
  }

  private snap() {
    FACES.forEach((_, lane) => {
      // Settled on one face, every lane takes the same plain shape (not the
      // variant written for rounding into a circle), so they draw in one batch.
      if (this.target && this.target !== 'salad') this.to[lane] = shapeFor(this.target, null);
      this.now[lane].set(this.to[lane]);
      this.velocity[lane].fill(0);
    });
    this.settled = true;
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
    this.step(now);
    this.draw(now);
    this.raf = !this.settled || this.growing(now) ? requestAnimationFrame(this.tick) : 0;
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
    // When every lane has the same shape, every pixel goes in one batch, so
    // touching pixels (square, line) merge without seams.
    const same = this.now.every((shape) => shape.every((v, i) => v === this.now[0][i]));
    const growing = this.growing(time);
    if (same && !growing) {
      paintPixels(ctx, this.pixels, this.cell, this.now[0]);
      return;
    }
    // Otherwise a batch per lane (in salad), and pixels still growing in
    // (typed a moment ago) drawn smaller about their cell's middle, a batch per edit.
    const born = this.born;
    const groups = new Map<string, { lane: number; at: number; xy: number[] }>();
    for (let i = 0; i < this.lanes.length; i++) {
      const lane = same ? 0 : this.lanes[i];
      const at = growing && born && time - born[i] < GROW_MS ? born[i] : -1;
      const key = `${lane}:${at}`;
      let group = groups.get(key);
      if (!group) groups.set(key, (group = { lane, at, xy: [] }));
      group.xy.push(this.pixels[i * 2], this.pixels[i * 2 + 1]);
    }
    for (const { lane, at, xy } of groups.values()) {
      const shape = this.now[lane];
      const t = at < 0 ? 1 : easeOut(Math.max(0, (time - at) / GROW_MS));
      for (let i = 0; i < 32; i++) this.grown[i] = 0.5 + (shape[i] - 0.5) * t;
      paintPixels(ctx, Float32Array.from(xy), this.cell, this.grown);
    }
  }
}
