# Working with design-taste-frontend

The two skills split one screen into two layers. Taste owns everything that is *content*; this skill owns
the *functional glass layer* on top. Run taste first: glass is judged by what it floats over.

## Order of work

1. Taste's run for the content layer: for a page, its draw, idea, copy deck and imagery; for an app screen,
   its `references/app-screens.md` run (data, the screen's one question, style deal).
2. This skill: layer map, tiers, roles, placement, motion, adaptive ink, legibility.
3. Both gates: `glass-audit.mjs`, then taste `lint.mjs` and `inspect.mjs`.
4. One combined report.

## Which taste rules apply where

| Taste rule | Content layer | Glass layer |
| --- | --- | --- |
| No glass / backdrop blur / floating pill nav | **applies** | lifted (`--allow glass,pill-nav`) |
| No shadows at rest, no glows | **applies** | lifted; the optical tier uses none anyway (owner: no shadow) |
| No gradients | **applies** | lifted only for the rim and scroll-edge masks (`taste-skill-ignore` comment on those lines) |
| Mixed radii warning | applies | lifted: concentric and capsule radii are intentional (`--allow radius-mix`) |
| Headlines ≤2 lines, 2-3 sizes, no eyebrows, no mono, no index numbers | applies | applies to glass text too |
| One accent on the action | applies | **reinforced**: one tinted primary per bar, at most two per view |
| Real pictures, full content, no empty sections | applies, **and strengthened**: glass needs varied colour and shape behind it | — |
| Motion: transform and opacity only | applies | extended: lens strength and blur on glass |
| Contrast | applies | measured on the composited glass by `glass-audit.mjs` |
| `palette-claude`, `contrast`, `kpi-size`, `ease-in` | **never override**: in testing these were real defects, so fix them | — |

## App classes

| Class | Content follows | Extra declared overrides |
| --- | --- | --- |
| Tool app (admin, analytics, editors) | taste `app-screens.md` in full | none beyond the glass ones |
| Media / consumer app (music, photos, maps, travel, TV) | taste page rules (large type, colour fields, real pictures) plus data rules | `colour-sprawl` (colour belongs in the content layer), `app-title-size`, `below-fold` (hero-led), `rainbow-chart` (flat artwork is not a chart), `icon-chips` (round glass controls are not KPI chips), `covered-text` (content scrolls under bars by design) |

## What the taste inspector cannot see

With the optical tier, glass is drawn into a canvas. The taste inspector measures the DOM, so it cannot
see refraction, rims or the lens. Those are covered by `glass-audit.mjs` and by looking at screenshots. Keep
text in the DOM, never in the canvas, so both tools can read it and assistive technology can use it.
