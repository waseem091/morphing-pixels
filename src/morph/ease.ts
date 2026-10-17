// Cubic ease-in-out: the pixels start changing gently, turn quickly through the
// middle, and settle slowly into the new shape.
export function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Cubic ease-out: a typed character grows quickly, then settles.
export function easeOut(t: number): number {
  return 1 - Math.pow(1 - Math.min(1, t), 3);
}
