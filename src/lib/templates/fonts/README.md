# Template fonts (Satori)

Satori (`src/lib/templates/render.ts`) needs real TTF/OTF font data — it
cannot load woff2 or reference a system/CSS font by name. These three static
Inter weights are vendored here (not npm-installed) so template rendering
works without a network call at render time:

- `Inter-Regular.ttf` (weight 400) — body/footer/attribution text
- `Inter-Bold.ttf` (weight 700) — subheads, badges, eyebrow labels
- `Inter-Black.ttf` (weight 900) — display headlines

Source: the official Inter release (rsms/inter), `extras/ttf/` static build,
version 4.1 — https://github.com/rsms/inter/releases. License: SIL Open Font
License 1.1, see `LICENSE.txt` in this directory (free to embed/redistribute).

## If these files are missing

`src/lib/templates/render.ts` loads them defensively via `loadTemplateFonts()`
and throws a clear `TemplateFontsMissingError` naming the exact missing
file(s) rather than letting `fs.readFile` fail with an opaque ENOENT — so if
you see that error, re-download the three files above from the Inter release
zip's `extras/ttf/` folder and drop them in this directory with the exact
filenames listed.
