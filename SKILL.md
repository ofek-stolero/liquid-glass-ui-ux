---
name: liquid-glass-ui-ux
description: Make any web app — an existing one or the plan for a new one — feel like one of Apple's own apps on each device (2026, iOS/iPadOS/macOS 26–27). On iPhone it behaves like Music or Photos on iPhone (floating Liquid Glass tab bar, items that rise as sheets over the page, touch feedback on everything, rubber-band edges, pull to refresh, skeleton loading, swipe and hold menus); on a Mac it behaves like Music or Photos on the Mac (glass sidebar and toolbar, inline detail, hover, right-click menus, keyboard shortcuts, 13pt density). Includes a real optical Liquid Glass renderer (refraction, lit edge, magnifying lens, morphs) used only where glass earns its place, a UX runtime with Apple's spring physics, and two browser gates. Use when the user asks for Liquid Glass, Apple / iOS / macOS feel, "native-feeling", bottom sheets instead of pages, skeletons, overscroll, touch responsiveness, or an iPhone-vs-Mac version of an app. Pairs with design-taste-frontend for the content layer; load both.
---

# liquid-glass-ui-ux

**Goal:** someone who uses Apple's apps all day opens yours and nothing surprises their hands. Same product and data,
two apps: the iPhone one (Music on iPhone) and the Mac one (Music on the Mac), picked automatically per device.

Three layers, three sources of truth:

| Layer | What | Truth file | Runtime | Gate |
|---|---|---|---|---|
| Behaviour (UX) | navigation, presenting, touch, scroll, loading, menus, keyboard, per-device idioms | `references/ux.md` | `assets/ux/liquid-ux.js` + `.css` (LUX) | `scripts/ux-audit.mjs` |
| Material (glass) | functional layer: bars, sidebar, toolbar, controls, sheets, menus, lens | `references/master.md` | `assets/gl/` (optical) · `assets/dom/` (fallback) | `scripts/glass-audit.mjs` |
| Content | artwork, lists, text, data, palette, type | design-taste-frontend | — | taste lint + inspector |

`references/renderer.md` is the API for both runtimes. `examples/music.html` is the reference: one file that is iPhone
Music on a phone and Mac Music on a desktop (passes 22/22 glass, 27/27 UX). `examples/listen.html` is the glass-only screen.

## The run

1. **Read the app.** Screens, routes, the job of each. List **entities** (things people open: album, product, person,
   file, order) and **tasks** (things people do: create, edit, share, filter). Screenshot before at 390×844 and 1440×900.
2. **Map to idioms** (`ux.md` §1–2). iPhone: floating tab bar with ≤ 5 places, one bottom accessory, large titles.
   Mac: edge-to-edge glass sidebar (sections, coloured icons, search at top) + uniform toolbar (back/forward, title,
   centre item, trailing actions). iPad: tab bar or sidebar by width. Write the map before coding.
3. **Content layer with design-taste-frontend.** Glass is judged by what it floats over; give it colour and shape.
4. **Presenting** (`ux.md` §3): every entity gets `data-entity` and opens with
   `LUX.present({ source, inline, label })` → iPhone: a glass sheet rising from the item (medium → large detents,
   follows the finger, throw to dismiss, scroll handoff); Mac: inline detail in the window, Back / ⌘[ / Esc returns
   with focus and scroll restored. Tasks → sheet (iPhone) / centred card with footer buttons (Mac). Alerts only for
   surprising, irreversible loss; expected loss → do it + Undo toast.
5. **Touch and edges** (`ux.md` §4–5, §7): `LUX.init()` gives every tappable thing a touch-down state that cancels on
   movement; Mac gets hover + darken, never shrink. `LUX.overscroll(scroller, { content, onRefresh })` on every main
   scroller: rubber-band edges, pull to refresh on touch. Rows: `LUX.swipe` + `LUX.context` with the same items, plus a
   ••• button (`LUX.menu`). All motion uses Apple springs (duration + bounce, bounce 0 unless a throw ended it).
6. **Loading** (`ux.md` §6): every async view goes through `LUX.load(el, promise, { skeleton, render })` with a skeleton
   that matches the real layout; it never flashes for cached data; errors replace it in place with Retry.
7. **Per-device details:** idiom tokens (`--lux-body/title/target/row/control`) instead of hard-coded sizes; Mac
   shortcuts via `LUX.shortcuts` (⌘F, ⌘N, ⌘[, Esc, Space, Return…); click selects / double-click opens on Mac.
8. **Glass where it earns its place** (below). Tier: optical (`liquid-glass-gl.js`) when the app draws its backdrop
   (media, artwork, canvas, maps); DOM tier otherwise. In the optical tier, DOM content under a glass sheet must be
   mirrored in `drawBackdrop` or the sheet uses `glass:false`.
9. **Gate** — fix every failure, then look at the phone and Mac screenshots yourself:
   ```bash
   node <skill>/scripts/ux-audit.mjs <page.html | url>      # iPhone + Mac behaviour, 27 checks
   node <skill>/scripts/glass-audit.mjs <page.html | url>   # material, contrast, keyboard, fallbacks
   node <taste>/scripts/inspect.mjs <page> --app --allow glass,pill-nav,shadow,heavy-shadow,button-fx,radius-mix
   ```
10. **Report:** idiom map, entity → presentation table, layer map (what is glass and why), gate results, screenshots
    phone + Mac before/after, and what was not verified (real iPhone/Safari, real trackpad, VoiceOver).

## Glass: the governing rule

Glass must never feel forced. It is the functional layer floating over content — navigation over moving content, a
lens showing the value beneath it, a control growing into what it opens. If removing it loses nothing, remove it.
Cards, rows, tables, forms, panels and page backgrounds are **never** glass.

**Owner's constants:** subtle bend, flatter bevel; no blur on controls/bars (text surfaces only); natural colour; no
shadow; no rim glow or gloss spots; one lit silhouette line (edges facing the light glow, the opposite edge catches the
light through); colour fringe only on the lens; one shared appear transition; the light rests (one sweep on appear).

| Role | For | Dim · frost | Notes |
|---|---|---|---|
| `control` | icon buttons, toggles | .12 · 0 | squash + glow inside itself only |
| `bar` | tab bar | .16 · 0 | compact, centred: `min(100vw−32px, max(33.3vw,340px), 520px)` |
| `toolbar` | Mac toolbar band | .22 · 4 | uniform height, edge to edge |
| `accessory` | now playing, status strip | .28 · 2.5 | same width as the tab bar |
| `sidebar` | Mac/iPad sidebar | .34 · 6 | edge to edge, coloured icons |
| `surface` | sheets, menus, popovers, toasts | .60 · 10 | sheets deepen as they grow |
| `lens` | selection while it moves | 0 · 0 | glass over glass, 1.16× magnifier, only while moving |

Motion: merging is an animation, never a state (`glass.morph(group, on)`); adaptive ink is opt-in (`data-adapt="on"`:
time-averaged, 0.5s hold = 0.5s fade, 1s cool-down); tinted labels on adaptive glass use `data-tint` → `var(--lg-tint)`;
reduced motion = glass simply there; reduced transparency and the 27 transparency slider (`glass.transparency(v)`) are
honoured. Full rules and sources: `references/master.md`.

## Never

- A new page for an entity on iPhone; a bottom sheet or modal for it on Mac.
- Anything tappable without touch-down feedback; a scroll that taps; a hard stop at a scroll edge.
- Blank screens or centred spinners while loading; skeletons flashing on cached data.
- Sheets that don't follow the finger, can't be dismissed, lose focus on close, or let the page behind steal the drag.
- Phone sizes on Mac (17pt body, 44pt buttons) or Mac sizes on a phone.
- Hover-only or long-press-only actions; right-click showing the browser menu on items that have actions.
- "Are you sure?" where Undo would do; asking permissions at launch.
- Glass in the content layer, glass on glass (lens excepted), > 6 glass shapes, merged shapes at rest, idle light
  drift, oscillating colour flips, full-width floating bars on wide screens.

## Files

| File | Use |
|---|---|
| `references/ux.md` | Apple UX 2026: principles, idiom table, navigation, modality tree, touch, scroll, loading, physics, feedback, menus, lists, search, keyboard, gestures, launch, type sizes, accessibility, 26→27 changes, UX tells, procedure. |
| `references/master.md` | Liquid Glass truth file: sources, material, owner decisions, placement, motion, accessibility, test log. |
| `references/renderer.md` | APIs: `LiquidGlass.mount/morph/level/set/transparency…` and `LUX.*`, with recipes. |
| `references/taste-integration.md` | Division of work with design-taste-frontend; overrides; app classes. |
| `assets/ux/` | LUX runtime (idiom, springs, press, overscroll, load/skeleton, sheet, present, swipe, context/menu, toast, shortcuts, haptics). |
| `assets/gl/`, `assets/dom/` | Optical glass renderer; DOM fallback tier. |
| `examples/music.html` | Dual-idiom reference app (iPhone Music ↔ Mac Music). |
| `examples/listen.html` | Glass-only reference screen. |
| `scripts/ux-audit.mjs`, `scripts/glass-audit.mjs` | The gates (exit 1 on failure; each check proven by mutation tests). |
