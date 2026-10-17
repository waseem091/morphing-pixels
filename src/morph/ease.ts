// Cubic ease-in-out: the pixels start changing gently, turn quickly through the
// middle, and settle slowly into the new shape.
export function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
