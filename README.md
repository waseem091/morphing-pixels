# Pixel Shift

Type anything in Geist Pixel, then switch faces and watch every pixel morph
into the new one: solid Square letters break down into Circle dots, dots
sharpen into Triangles, triangles flatten into Line bars, and so on.

Live at [geist-pixel-animation.vercel.app](https://geist-pixel-animation.vercel.app).

```sh
npm install
npm run dev       # the editor on http://localhost:5173
npm run build
npm run glyphs    # regenerate src/morph/glyph-data.ts from the font
npm run registry  # rebuild the copy-in component in public/r/
```

The editor keeps its settings in the address (`?text=hello&face=circle&size=96&color=ff0055`),
so **Share** copies a link that opens the page exactly as it is. **Autoplay** morphs through every
face on its own. Press 1–5 to switch faces from the keyboard.

## Use it in your project

The morph is one component, `<PixelMorph>`, in one file that needs only React 18 or later. It does
not even need the font: every character's pixels are in the file.

1. **Try it.** Run the editor or open
   [geist-pixel-animation.vercel.app](https://geist-pixel-animation.vercel.app), set the text, face,
   size and colour.
2. **Using an AI assistant?** "Copy Prompt" copies a prompt with your settings. The assistant reads
   [`/r/pixel-morph.md`](https://geist-pixel-animation.vercel.app/r/pixel-morph.md), which holds the
   instructions, the props and the code, and adds the component for you.
3. **Or do it by hand.** "Copy .TSX" copies the whole component; save it as
   `components/pixel-morph.tsx`. It is also served at
   `https://geist-pixel-animation.vercel.app/r/pixel-morph.tsx`, and as a shadcn registry item:
   `npx shadcn@latest add https://geist-pixel-animation.vercel.app/r/pixel-morph.json`.

```tsx
const [face, setFace] = useState<Variant>('square');

<PixelMorph text="hello world" fontSize={96} variant={face} />  // change face to morph
<PixelMorph text="hello world" fontSize={96} cycle />           // or let it go round on its own
```

| prop              | default        | what it does                                                       |
| ----------------- | -------------- | ------------------------------------------------------------------ |
| `text`            |                | the text; newlines start a new line, and lines wrap to fit         |
| `variant`         | `'square'`     | `square`, `grid`, `circle`, `line` or `triangle`; changing it morphs every pixel |
| `fontSize`        | `64`           | px; one pixel of the font is 0.038 of it                           |
| `letterSpacing`   | `0`            | extra space after each character, in px                            |
| `lineSpacing`     | `fontSize / 5` | extra space between lines, in px                                   |
| `color`           | inherited      | any CSS colour, `var(--x)` included                                |
| `duration`        | `800`          | ms one morph takes                                                 |
| `align`           | `'left'`       | how the lines line up, and where the text sits in its width        |
| `cycle`           | `false`        | `true` morphs through every face on its own; or a list of faces    |
| `hold`            | `900`          | with `cycle`: ms each face rests                                    |
| `appear`          | `true`         | grow the text out of nothing when it first shows                   |
| `as`              | `'div'`        | the element that holds the text                                    |
| `onMissingGlyphs` |                | called with characters Geist Pixel has no glyph for (left out)     |

The text is drawn on a canvas, and the same text is in the page, visually hidden, for screen
readers and search. With `prefers-reduced-motion`, faces change without the morph.

`scripts/registry.ts` builds `public/r/pixel-morph.tsx`, `.json` and `.md` on every build by joining
the modules in `src/morph/` that the site itself renders, so what people install is exactly what the
page shows.

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
- **Rounding.** Into or out of Circle, Square, Grid and Line put their control
  points on their corners instead of halfway along each side. They draw the
  same at rest, but every corner then sits halfway between its two controls,
  like the circle's points do, so the steps between are smooth rounded
  rectangles instead of squares with kinked corners.
- **Drawing.** One canvas. Rectangles (and every step between Square, Grid and
  Line) go into one path filled once a frame, so touching pixels merge
  without seams. Other shapes are filled a dozen pixels at a time: one path
  with thousands of outlines gets slower than linearly in Chrome. Picking a
  face mid-morph starts the next morph from the shape on screen.
- **Typing.** Each pixel knows which character it came from. When the text
  changes, the characters between the unchanged start and end are new, and
  their pixels grow out of nothing in 280ms while the rest stay put.
- **Layout.** Letter and line spacing are in px. Lines wrap between words; a
  word too wide for a line on its own is cut between letters. Characters the
  font has no glyph for are left out, and the editor says which.

## Fonts

Geist Pixel is by Vercel in collaboration with basement.studio, under the SIL
Open Font License 1.1 (`public/fonts/OFL.txt`), taken from the `geist` npm
package (1.8.1).
