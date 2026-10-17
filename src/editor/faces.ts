import { VARIANTS, type Face, type Variant } from '../morph/variants';

// What the editor needs to show the faces by name and in their own fonts. The
// component itself never loads the fonts: it draws every pixel itself.

const NAMES: Record<Variant, string> = {
  square: 'Square',
  grid: 'Grid',
  circle: 'Circle',
  line: 'Line',
  triangle: 'Triangle',
  salad: 'Salad',
};

export const variantLabel = (v: Variant) => NAMES[v];
export const fontFamily = (v: Face) => `Geist Pixel ${NAMES[v]}`;
export const isVariant = (v: unknown): v is Variant => VARIANTS.includes(v as Variant);
