# Renderers

## Optical tier: `assets/gl/liquid-glass-gl.js` (+ `liquid-glass-gl.css`)

WebGL2, no dependencies, works in Safari and Chromium. The library creates a fixed canvas behind the page.
Each frame it draws your content layer into it with `drawBackdrop`, then renders every `[data-gl]`
element as a glass shape. The DOM keeps the element's text, icons, focus order and accessibility; the
canvas only paints the glass.

### Markup

```html
<nav class="tabs" data-gl data-role="bar" data-group="2" data-adapt="on" aria-label="Main">
  <span class="lens" data-gl data-role="lens"></span>   <!-- selection bubble, shown only while moving -->
  <button class="tab" aria-current="page">…</button> …
</nav>
<button class="rb" data-gl data-role="control" data-group="1" aria-label="Search">…</button>
<div class="mini" data-gl data-role="accessory">…</div>
```

| Attribute | Meaning |
| --- | --- |
| `data-gl` | This element is a glass shape. Its box and `border-radius` are the shape. |
| `data-role` | `control` · `bar` · `accessory` · `surface` · `lens` (see SKILL.md). |
| `data-group` | Shapes in one group may melt together, but only while `morph(group, true)` is on. 0 means no group. |
| `data-adapt="on"` | Opt in to adaptive ink. The renderer sets `color`, `--lg-ink` and `--lg-ink-2` on the element. |

### API

```js
const glass = LiquidGlass.mount({
  drawBackdrop(ctx, W, H, t) { /* draw the content layer: images, video frames, a feed, a map */ },
  scrollEdge: { color: '18,19,23', top: 96, topAlpha: () => Math.min(1, scrollY / 60) * .85, bottom: 210 },
  config: { /* optional overrides of LiquidGlass.CONFIG */ },
  roles:  { /* optional overrides of LiquidGlass.ROLES */ }
});
glass.morph(1, true);            // a morph in group 1 starts: allow melting (ramps in over ~120ms)
glass.morph(1, false);           // it settled: shapes separate again
glass.level(lensEl, v);          // 0..1 visibility (the lens is driven by how fast the selection moves)
glass.set(el, { dim, frost, press });   // live profile change, e.g. a control becoming a surface
glass.scale(el, s);              // app-driven scale; composed with the press squash (do not set style.scale yourself)
glass.inkTowards(el, v);         // drive ink 0..1 from a morph; pass null to hand control back to the timer
glass.reduceTransparency(true);  // user setting; the OS setting is also honoured
glass.debug();                   // per-shape state (appear, level, merge, ink, role); used by the audit
```

### Recipes (all in `examples/listen.html`)

- **Lens tab bar.** On pointer down, set a target of 1 for the selection's "activity"; spring a position
  toward the finger or the chosen tab; write the lens element's left, top, width and height (it overflows
  the bar, about 1.4× its height); call `glass.level(lens, activity)`; when the position settles, set the
  target to 0. Scale the tab icons under the lens slightly (about 1.2×) to match the magnifier. The lens is
  rendered in a second pass that samples the finished frame, so it bends the bar itself.
- **Button grows into its menu.** One element animates its width, height and radius with a spring. During
  the animation call `glass.morph(group, true)`. Interpolate `glass.set(el, {dim, frost})` from the
  control profile to the surface profile, drive `inkTowards` from the same progress, and fade the menu
  items in after about 55% of the progress. Neighbours in the same group shrink with
  `level` and `scale`, so they melt in and vanish.
- **Content.** Draw only what the backdrop needs: media, artwork, maps. Keep readable text in the DOM. If
  the screen's real content is DOM (lists of text), use the DOM tier for that screen instead.

### Limits

- The backdrop must be something the app renders. Arbitrary DOM behind the glass cannot be refracted.
- WebGL2 is required; without it the page gets `html.lg-no-webgl` and a clear frosted fallback.
- Ten shapes at most per renderer (`maxShapes`).
- No access to device motion inside sandboxed frames, so the tilt-driven light is not implemented.
- Tested in headless Chromium with software GL; not yet profiled on phone GPUs.
  Adaptive resolution lowers the pixel ratio if frames run slow.

## DOM tier: `assets/dom/`

Load `liquid-glass.css`, then `owner-overrides.css`, then `liquid-glass.js`, then call `LG.init()`. Mark
glass with `data-glass` inside an ancestor with `data-layer="controls"`. Use `data-adaptive` to opt in to
ink adaptation (with the same hold and cool-down) and `data-lens` for Chromium-only refraction.
`data-role="bar|accessory"` gives the compact centred width. Reduced transparency, increased contrast and
reduced motion are honoured. This runtime passed the original 38-check audit (master §12, §15). The
overrides apply the owner's later decisions: clear, no shadow, directional rim.

## Renderer additions (v0.7)

- `data-tint="#rrggbb"` on a glass element → the renderer sets `--lg-tint`, the accent lifted toward white on dark
  glass and deepened toward black on light glass, following the adaptive-ink fade. Use for selected tab labels.
- `glass.transparency(v)` — iOS/macOS 27 transparency slider, 0 = clear (default) … 1 = tinted. Reduce Transparency
  still forces solid.
- CSS `opacity` on a glass element now fades its glass too; `display:none` elements no longer take a shape slot.
- Roles `sidebar` (.34 · 6) and `toolbar` (.22 · 4) for Mac chrome.

# LUX — the UX runtime (`assets/ux/liquid-ux.js` + `liquid-ux.css`)

Load after the glass renderer (optional) and call `LUX.init()`. Add class `lux` to `<html>` (init does it).

| API | What it does |
|---|---|
| `LUX.init({ autoPress = true, haptics = true })` | idiom detection → `<html data-idiom>` (+ `lux:idiom` event on change); touch-down `[data-pressed]` on every tappable thing, cancelled past 15pt or on scroll; keyboard press states |
| `LUX.idiom()` / `LUX.isTouchIdiom()` | `'phone' | 'tablet' | 'mac'`; force with `<html data-idiom-force="mac">` |
| `LUX.spring(from, to, { duration=.5, bounce=0, velocity, instant }, onUpdate, onDone)` | Apple spring, sub-stepped; returns `{ stop, value, velocity }`; instant under reduced motion |
| `LUX.springParams(d, b)`, `LUX.rubber(x, dim, c=.55)`, `LUX.project(v, r=.998)`, `LUX.tracker()` | the physics |
| `LUX.overscroll(scroller, { content, onOffset, onRefresh, threshold=70, spinnerHost })` | rubber-band edges (touch + wheel), pull to refresh with spinner; ignores gestures that start on sheets, menus, glass chrome or `[data-lux-chrome]`; marks `content` with `data-lux-overscroll` |
| `LUX.load(el, promise, { skeleton, render, error, delay=120, minShow=350, fade=180 })` | skeleton without flash, crossfade, in-place error + Retry; returns a promise |
| `LUX.skeleton.lines(n, widths) / block(h, r) / row(artRadius)` | layout-matched placeholder HTML |
| `LUX.sheet({ source, content, title, label, detents=['medium','large'], start, glass=true, inert, onClose, onProgress, confirmClose, actions, height })` | phone: grabber, X, drag/detents/throw, scroll handoff; Mac: centred card, footer `actions` (`{label, primary, run}`), Return/Esc; all: focus trap, focus returns to `source`, one at a time, `lux-sheet-open` on `<html>`; returns `{ el, body, close, detent, detentName }` |
| `LUX.present({ inline, ...sheetOptions })` | Mac + `inline` → `inline()`; otherwise `LUX.sheet()` |
| `LUX.swipe(row, { actions: [{ label, icon, destructive, run }] })` | row swipe actions; first child of `row` slides |
| `LUX.context(el, { items: [{ label, destructive, hidden, run }], delay=450, glass })` | touch-and-hold (lift + dim) / right-click at pointer (Mac, no dim) / Shift+F10 |
| `LUX.menu(anchor, items)` | pull-down menu from a control |
| `LUX.toast(text, { action, onAction, duration, glass })` | non-blocking feedback; `action:'Undo'` |
| `LUX.shortcuts({ 'mod+f': fn, 'escape': fn, ' ': fn })`, `LUX.modLabel` | keyboard shortcuts (mod = ⌘ / Ctrl), ignored while typing |
| `LUX.haptic(type)`, `LUX.nudge(el)` | haptics by meaning (none on Mac/iOS web); disabled-control nudge |

Attributes: `data-entity` (opens via present; the UX gate drives it), `data-press` / `data-press="row"` /
`data-press="off"`, `data-lux-chrome` (fixed DOM chrome a sheet may cover), `data-lux-page` (page that recedes under a
full sheet). Tokens: `--lux-body --lux-lh --lux-title --lux-headline --lux-foot --lux-target --lux-row --lux-control`
(iOS 17/22/34/17/13/44/52/44 · Mac 13/16/26/13/11/28/30/28), colours `--lux-ink --lux-accent --lux-danger --lux-sk`.

## Recipe: an entity that is a sheet on iPhone and inline on Mac

```js
tile.dataset.entity = 'album';
tile.onclick = () => LUX.present({
  source: tile, label: album.title,
  inline: () => showInline(album, tile),               // Mac: same window, Back/⌘[/Esc returns, restore scroll + focus
});
// phone: fill the sheet LUX just opened
const s = LUX._sheets[0]; if (s) LUX.load(s.body, fetchAlbum(album), { skeleton: albumSkeleton, render: albumHTML });
```
See `examples/music.html` for the full app (tabs + lens, morphing + menu, overscroll, swipe/hold menus, Undo, sidebar,
toolbar, ⌘F live search, hover play, click-select / double-click play).
