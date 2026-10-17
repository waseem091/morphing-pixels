import { isStraight, type Shape } from './variants';

const scaled = new Float32Array(32);

// [left, top, width, height] if the shape is an upright rectangle (square,
// grid, line, and every step between them), which can be drawn in one call.
function asRect(s: Shape): [number, number, number, number] | null {
  const right = s[4];
  const bottom = s[13];
  const left = s[20];
  const top = s[1];
  const same = (a: number, b: number) => Math.abs(a - b) < 1e-4;
  if (!isStraight(s)) return null;
  if (!same(s[5], top) || !same(s[29], top) || !same(s[8], right) || !same(s[12], right)) return null;
  if (!same(s[17], bottom) || !same(s[21], bottom) || !same(s[24], left) || !same(s[28], left)) return null;
  return [left, top, right - left, bottom - top];
}

/**
 * Adds one copy of `shape`, `cell` px across, at every pixel position to the
 * current path. All pixels go into one path and are filled at once, so
 * neighbours that touch (square, line) merge without seams.
 */
export function tracePixels(ctx: CanvasRenderingContext2D, pixels: Float32Array, cell: number, shape: Shape) {
  const rect = asRect(shape);
  if (rect) {
    const [l, t, w, h] = rect.map((v) => v * cell);
    if (w <= 0 || h <= 0) return;
    for (let i = 0; i < pixels.length; i += 2) ctx.rect(pixels[i] + l, pixels[i + 1] + t, w, h);
    return;
  }
  for (let i = 0; i < 32; i++) scaled[i] = shape[i] * cell;
  const p = scaled;
  if (isStraight(shape)) {
    for (let i = 0; i < pixels.length; i += 2) {
      const x = pixels[i];
      const y = pixels[i + 1];
      ctx.moveTo(x + p[0], y + p[1]);
      for (let k = 4; k < 32; k += 4) ctx.lineTo(x + p[k], y + p[k + 1]);
      ctx.closePath();
    }
    return;
  }
  for (let i = 0; i < pixels.length; i += 2) {
    const x = pixels[i];
    const y = pixels[i + 1];
    ctx.moveTo(x + p[0], y + p[1]);
    for (let k = 0; k < 32; k += 4) {
      const n = (k + 4) % 32;
      ctx.quadraticCurveTo(x + p[k + 2], y + p[k + 3], x + p[n], y + p[n + 1]);
    }
    ctx.closePath();
  }
}
