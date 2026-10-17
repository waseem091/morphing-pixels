# Morphing Pixels

Type anything in Geist Pixel, then switch faces and watch every pixel morph
into the new one: solid Square letters break down into Circle dots, dots
sharpen into Triangles, triangles flatten into Line bars, and so on.

Live at [geist-pixel-animation.vercel.app](https://geist-pixel-animation.vercel.app).

```sh
npm install
npm run dev     # the editor on http://localhost:5173
npm run build
npm run glyphs  # regenerate src/morph/glyph-data.ts from the font
```

## How it works

All five Geist Pixel faces (Square, Grid, Circle, Line, Triangle) put their
pixels on the same 38-unit lattice and share one bitmap per character; they
only differ in how a single pixel is drawn. So a morph never has to move
anything: each pixel stays in its cell and changes shape.

- **Glyphs.** `scripts/glyphs.ts` reads every character's pixels out of
  `GeistPixel-Grid.woff2` once, at build time, into `src/morph/glyph-data.ts`
  (420 characters, about 10KB gzipped). The page never rasterises the font.
- **Shapes.** Each face's pixel is written as the same eight quadratic
  segments, with its points in the same places (top middle, top right, right
  middle, …). Square, Grid, Line and Triangle are polygons; Circle is the
  font's own four-quarter circle split in half. A morph is every point
  sliding to its place in the next shape, so any face morphs into any other.
- **Drawing.** One canvas, one path with every pixel in it, filled once per
  frame, so touching pixels (Square, Line) merge without seams. Picking a face
  mid-morph starts the next morph from the shape on screen.
- **Layout.** Letter and line spacing are in px. Lines wrap between words; a
  word too wide for a line on its own is cut between letters. Characters the
  font has no glyph for are left out, and the editor says which.

Press 1–5 to switch faces from the keyboard.

## Fonts

Geist Pixel is by Vercel in collaboration with basement.studio, under the SIL
Open Font License 1.1 (`public/fonts/OFL.txt`), taken from the `geist` npm
package (1.8.1).
