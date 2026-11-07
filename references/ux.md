# Apple UX for web apps — feel native on every Apple device (2026: iOS/iPadOS/macOS 26 → 27)

The goal is not "looks like iOS". The goal is that a person who uses Apple's own apps all day opens yours and **nothing
surprises their hands**: on iPhone it behaves like Music, Photos, Mail; on a Mac it behaves like Music, Photos, Finder on
the Mac. Same product, same data, two different apps. Glass (SKILL.md, master.md) is the material; this file is the
behaviour. Runtime: `assets/ux/liquid-ux.js` + `.css` (LUX). Gate: `scripts/ux-audit.mjs`.

Provenance: [HIG] Human Interface Guidelines pages (2025–26), [WWDC] session named, [obs] observed in Apple's apps on
iOS/macOS 26–27, [owner] this skill owner's decision, [T] verified in this repo's tests.

---------------------------------------------------------------------------------------------------------------------

## 0. The eight principles (Apple reintroduced them in June 2026) and what each means in code

| Principle | In practice | Concrete rule |
|---|---|---|
| Purpose | every screen has one job | one primary action per view; a sheet does one task |
| Agency | the person is in control | every gesture is interruptible; everything closes; nothing auto-advances while a finger is down |
| Responsibility | don't harm, don't nag | undo instead of "are you sure"; permissions asked in context; no dark patterns |
| Familiarity | reuse what people already know | system gestures, standard shortcuts, standard placement (§4, §13) |
| Flexibility | adapts to device, setting, person | idiom switch (§1), Dynamic Type-like scaling, reduced motion/transparency |
| Simplicity | fewer levels, fewer modes | entity opens over the page, not a new page (§3); Mac: fewer nested levels |
| Craft | details are the product | press states on everything, rubber band edges, skeletons that match layout |
| Delight | earned, not sprinkled | motion that explains where things went; one morph, not ten |

## 1. Idioms — one app, three behaviours

`LUX.idiom()` → `phone | tablet | mac`, written to `<html data-idiom>` and re-evaluated on resize (event `lux:idiom`).
Rule: phone = width < 700; mac = fine pointer + hover + width ≥ 900; tablet = otherwise (touch, regular width).
Needs `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` or phones report 980px.

| | iPhone (phone) | iPad (tablet) | Mac (mac) |
|---|---|---|---|
| Top-level navigation | floating glass tab bar, bottom, compact & centred (≤ 520, ≥ ⅓ width) | tab bar at top or sidebar (adaptable) | edge-to-edge glass **sidebar** + uniform **toolbar** |
| Search | tab-bar search button/tab, field rises above keyboard | top trailing / sidebar | field at the top of the sidebar (or toolbar trailing); ⌘F |
| Open an item | **sheet rising from the item** (medium → large detents) | form sheet (centred card) or push in split view | **inline detail in the same window**; Back / ⌘[ / Esc returns |
| Secondary actions | swipe actions, touch-and-hold menu, ••• button | same + pointer hover | right-click menu at pointer, ••• menu, menu bar/shortcuts |
| Body text | 17pt / 22 | 17pt | 13pt / 16 |
| Large title | 34pt bold | 34pt | 26pt bold (window title in toolbar 13pt bold) |
| Hit target | ≥ 44×44pt | ≥ 44pt | controls 28pt (min 20), rows 24–32pt |
| Press feedback | highlight + slight shrink (0.96) on touch-down, spring back | same | **no shrink**: darken ~30%, hover highlight first |
| Haptics | yes (sparing, by meaning) | limited | none |
| Modality | sheets are the norm for focused tasks | form sheets, popovers | avoid; inline first, centred card for real tasks, footer buttons bottom-trailing |
| Selection | tap = open/act | tap = open | **click selects, double-click / Return opens or plays** |
| Density | one column, generous | 2–3 columns | many columns, auto-fit grid (min ~180), lists dense |

Tablet note: iPadOS 26+ windows resize freely; treat a narrow iPad window as phone and a wide one as tablet (width
rule already does). A tablet with a trackpad still gets touch idiom unless width ≥ 900 and the pointer is fine.

## 2. Navigation & information architecture

- **Flat beats deep.** Tabs/sidebar sections are siblings; inside a section, at most two levels before a sheet or inline
  detail. Mac: fewer nested levels than iPhone [HIG Designing for macOS].
- **Tab bar (iPhone):** 3–5 tabs, each a top-level place (never an action). Re-tapping the current tab scrolls to top
  (and pops to root). The selected tab is tinted; a glass lens magnifies while dragging across tabs [obs]. The tab bar
  minimises on scroll down in Apple's apps (optional; LUX leaves it to the app).
- **Bottom accessory (iPhone):** one persistent mini-player / status above the tab bar, same width, tap → full screen.
- **Sidebar (Mac/iPad):** sections with small headings (11pt semibold, secondary), rows 28pt with coloured symbols
  (macOS 27 keeps icon colour in edge-to-edge sidebars [obs]). Current row = subtle fill, not accent fill.
- **Toolbar (Mac):** back/forward at leading edge, window/section title, then centre item (e.g. Now Playing), then
  actions trailing. Uniform height (macOS 27). Buttons are borderless 28pt icons that highlight on hover.
- **Back:** iPhone — swipe from the left edge or the back button; sheets — swipe down. Mac — ⌘[ , Back button, Esc
  closes inline detail. Browser Back must also work (use `history.pushState` for inline detail if the app has URLs;
  the Glass Music example keeps one URL because it is a demo).
- **State restoration:** come back to the same tab, scroll position and open item after reload. Never reset on resize.

## 3. Presenting things — the modality decision tree

Ask, in order:
1. **Is it the next level of the same content** (album → tracks, mail → message)?
   iPhone: **sheet over the page** rising from the tapped item (`LUX.present`). Mac: **inline** in the window.
2. **Is it a short, self-contained task** (new playlist, edit details, share options, filters)?
   iPhone: sheet (medium or large). iPad: form sheet. Mac: centred card sheet with footer buttons (Cancel, primary).
3. **Is it a small set of choices tied to a control**? A menu (`LUX.menu`) or popover (popover only in regular width;
   on iPhone it becomes a sheet).
4. **Is it immersive** (photo viewer, now playing, camera)? Full-screen cover that zooms from its source.
5. **Is it a warning about something the person did not expect**? An alert — two buttons max, destructive last, rare.
   If the loss is the *expected* result of the action (delete a song), do it and offer **Undo** (toast) instead.

`LUX.present({ source, inline, label, detents, onClose })` encodes 1: Mac → `inline()`, else `LUX.sheet()`.
Rules that hold for every modal surface [HIG Modality, Sheets]:
- one at a time (LUX closes the previous); always dismissible (X, swipe down, Esc, backdrop); focus moves in and
  returns to the source on close [T]; `role=dialog aria-modal=true` with a name.
- sheet detents: medium (½ height, page stays visible, light dim) and large (near full, page recedes). Grabber shown when
  there is more than one detent; tap grabber cycles detents.
- the sheet **follows the finger 1:1**, rubber-bands past the top detent, and on release projects the throw
  (`v/1000 · r/(1−r)`, r = .99) to choose the nearest detent or dismissal; a fast throw earns ≤ .15 bounce.
- scroll handoff: dragging down inside the sheet's content at scrollTop 0 drags the sheet; otherwise it scrolls.
- **gestures that start on a sheet belong to the sheet** — the page behind must not pull-to-refresh or scroll [T: this
  was a real bug the gate caught].
- unsaved edits: `confirmClose` → ask once (Discard / Keep editing). Otherwise never block dismissal.
- Mac sheet: no drag, no grabber; title top, buttons bottom trailing, Return = primary, Esc = cancel.
- Optical glass tier: the glass canvas sits under the DOM, so DOM chrome the sheet covers is hidden while covered
  (`data-lux-covered`; mark extra chrome with `data-lux-chrome`). DOM *content* under a glass sheet must be mirrored in
  `drawBackdrop` or the sheet should use `glass:false`.

**Entity rule:** anything that represents a thing (album, product, person, file, order) gets `data-entity` and opens via
`present()`. Navigating to a new page for it is a defect on iPhone unless the thing is a whole app section.

## 4. Touch: everything responds

- **Touch-down feedback within one frame** on every tappable thing [obs]. LUX sets `[data-pressed]` on any button, link,
  role=button/tab/menuitem/switch, label, or `[data-press]` (rows: `data-press="row"` → background highlight, no shrink).
  Opt out with `data-press="off"`.
- The highlight **cancels when the finger moves past 1.5 × slop (15pt)** or the page scrolls — a scroll never taps [T].
- Release: spring back (≈ .45s, slight overshoot only on the scale, ≤ 1.18 control point).
- Disabled things still answer: a small horizontal nudge, no action (`LUX.nudge`).
- Touch slop: 10pt before a drag starts [WWDC Design for spatial input / UIKit default]. Velocity from the last ~80ms.
- **1:1 tracking**: anything dragged stays under the finger; no easing while the finger is down.
- **Interruptible**: touching something mid-animation stops it where it is and hands it to the finger (springs keep
  velocity; never restart from the beginning).
- **Spatial consistency**: things leave the way they came (sheet down to its source, menu back into its button).
- Long-press (touch-and-hold, 450ms): context menu with the item lifted (scale 1.03) and the page dimmed; the hold must
  not also fire a tap [T].
- Swipe actions on list rows: leading/trailing, axis-locked after slop, rubber band past the actions, full swipe runs
  the first action; destructive red, last-to-first from the edge. Mirror them in the context menu.
- Mac: hover is the first feedback (subtle fill), press darkens, nothing shrinks, nothing waits 450ms (right-click is
  instant at the pointer, no dim, rows 24pt).

## 5. Scroll, edges, overscroll

- **Elastic edges everywhere**: past the top or bottom, content follows the finger with resistance and springs back on
  release — never a hard stop [obs]. `LUX.overscroll(window, { content })`. Rubber band (UIScrollView constant):
  `f(x, d) = (1 − 1 / (x·0.55/d + 1)) · d`. A 260pt pull reads ≈ 110pt [T].
- iOS Safari already bounces the document; LUX detects it and only adds the effect where it is missing (desktop
  browsers, Android, nested scrollers). Trackpad wheel at an edge: stretch, spring back when the gesture pauses (140ms).
- **Pull to refresh** (touch idioms only): spinner appears with the pull, arms at 70pt (haptic), holds at 56pt while
  loading, then returns. Prefer automatic refresh; pull is the manual fallback [HIG Refresh content controls].
- Momentum scrolling is the browser's; never re-implement page scrolling. Never nest two scrollers on the same axis.
- **Scroll edge effect** under floating glass: content fades softly under bars (glass renderer `scrollEdge`).
- Large title collapses into the bar title on scroll (iPhone); on Mac the title lives in the toolbar.
- Scroll position is preserved when going back (Mac inline detail restores `scrollY`).

## 6. Loading, skeletons, progress

- **Show something immediately** [HIG Loading]. Layout first, data second.
- **Skeleton only when it will be seen**: show after 120ms (fast loads never flash), and once shown keep it ≥ 350ms,
  then crossfade 180ms. Cached content renders instantly with no skeleton [T: `no-flash`]. `LUX.load(el, promise, {...})`.
- Skeleton shapes match the real layout (art square, two text lines of real widths, rows of the real height). Tone pulse
  between two greys, **no shimmer gradient** [obs: Apple uses redacted placeholders, not shimmer].
- Determinate progress whenever the amount is known; indeterminate spinner only for short unknown waits.
- Errors replace the skeleton in place with a short message and a Retry — never a blank screen or a toast-only error.
- Optimistic UI for the person's own actions (like, add, delete): apply now, reconcile later, Undo on failure.

## 7. Physics — Apple's springs

From WWDC23 "Animate with springs": describe a spring by **duration** and **bounce**.
- stiffness `k = (2π / duration)²`, damping `c = 2 · ζ · (2π / duration)`, ζ = 1 − bounce (mass 1).
- default bounce **0** (critically damped) — calm, no overshoot. Use bounce ≤ .3 **only** when a gesture with momentum
  ends the motion (a throw), and keep the gesture's velocity as the spring's initial velocity.
- durations: press .1 in / .45 out; menus .3; sheets .5; page-level .5–.6; nothing over .7.
- integrate in sub-steps (≥ 240Hz) so slow frames do not explode (LUX does).
- **Reduced motion**: no travel, no scale, no parallax; cross-fades ≤ .15s; springs jump to the end [T].
- Momentum projection (`LUX.project`): where a throw would come to rest, `x + v/1000 · r/(1−r)`; r = .998 for scrolling,
  .99 for sheets/cards. Decide the destination from the projection, not the release point.

## 8. Feedback: haptics, toasts, undo, sounds

- Haptics by meaning, sparingly: selection (tab change, detent snap), light (open), medium (menu), success/warning/error
  (results). Never on scroll ticks, never on Mac. Web: `navigator.vibrate` where it exists; iOS Safari has no web
  haptics — the visual feedback must stand alone.
- Toast (`LUX.toast`) for completed actions and **Undo** (5s). Never for errors that need action.
- Destructive + expected → act + Undo. Destructive + surprising/irreversible → confirm (alert/action sheet) with the
  destructive button named by its verb ("Delete Playlist"), styled red, not the default.
- Live state changes in place (play state everywhere it is shown: mini player, toolbar pill, row).

## 9. Menus & context menus

[HIG Menus, Context menus]
- Small: ≤ ~8 items, grouped by separators; most-used first; **destructive last** and red.
- Hide unavailable items in context menus (disable them in app menus/toolbars).
- Everything in a context menu must also be reachable elsewhere (••• button, toolbar, swipe, keyboard).
- iPhone: touch-and-hold, lifted preview, dimmed page, menu near the item. Mac: right-click at the pointer, no dim,
  24pt rows, hover = accent fill, arrow keys + Return, Esc; Shift+F10 / ContextMenu key on keyboards.
- Pull-down menu from a control: `LUX.menu(button, items)`; grows out of the button (glass morph on iPhone).

## 10. Lists, grids, cards

- Rows: iPhone 44–52pt, Mac 24–32pt; separators inset to the text; chevrons only when the row navigates.
- Selected/now-playing row shows state (accent text + `aria-current`) everywhere at once.
- Grids: iPhone 2 columns (3 for small items), Mac auto-fit (min 160–200pt). Titles under art, 2 lines max.
- Mac: click selects (accent fill), double-click/Return opens, ⌘A selects all, arrow keys move selection, Space
  previews/plays, Delete removes (with Undo).
- Empty states: one sentence + one action, not an illustration wall.

## 11. Search

- iOS 26/27: search lives in the tab bar (its own trailing circle or a tab, "standard tab vs button" appearance refined
  in 27); the field rises above the keyboard; results update as you type; recent searches; Cancel returns.
- Mac: field at top of the sidebar or toolbar trailing; ⌘F focuses it; results filter live in the content area;
  Esc clears then leaves.
- Never navigate to a separate "search page" on Mac; never cover the whole screen without a way back on iPhone.

## 12. Keyboard & pointer (Mac, iPad with keyboard)

Standard shortcuts people expect [HIG Keyboards]; implement the ones your app has the actions for (`LUX.shortcuts`):

| Keys | Action | Keys | Action |
|---|---|---|---|
| ⌘N | new item | ⌘F | find / focus search |
| ⌘W | close window/detail | ⌘, | settings |
| ⌘Z / ⇧⌘Z | undo / redo | ⌘A | select all |
| ⌘[ / ⌘] | back / forward | Esc | cancel, close sheet/menu, leave detail |
| Return | default button / open selection | Space | play/pause, Quick Look |
| ⌘⌫ / Delete | delete selection | ⌘1…9 | switch sidebar section/tab |
| Tab / ⇧Tab | move focus | ↑↓←→ | move selection |

`mod` = ⌘ on Apple platforms, Ctrl elsewhere (`LUX.modLabel`). Never override system shortcuts (⌘Q, ⌘H, ⌘Tab, ⌘Space).
Pointer: hover states on every clickable thing on Mac; cursor stays the arrow for app controls (pointer hand only for
links); tooltips (title) on icon-only toolbar buttons naming the action and its shortcut.

## 13. Gestures (iPhone/iPad)

- Never override system edges: left-edge swipe (back), bottom home indicator, top-right/left pull-downs (Control/
  Notification Center). Keep custom horizontal swipes away from the left 20pt.
- Every gesture has a visible alternative (button/menu) [HIG Gestures].
- Standard meanings only: tap, touch-and-hold (menu), swipe row (actions), swipe down (dismiss), pinch (zoom),
  drag (move). Don't invent multi-finger gestures.

## 14. Launch, onboarding, permissions, settings

- Launch is instant: render the shell and the last state immediately; no splash animation, no logo screen.
- Onboarding is optional and skippable, ≤ 3 cards, only for genuinely new concepts; teach in context instead.
- Ask for a permission **when the person reaches the feature that needs it**, with a sentence of why, never at launch.
- Settings: Mac — ⌘, opens a separate window/sheet with tabs; iPhone — a section in the app or the Settings tab.
- Remember choices (view mode, sort, last tab) without asking.

## 15. Typography & sizes (2026)

iOS (default Large size): Large Title 34 bold · Title1 28 · Title2 22 · Title3 20 · Headline 17 semibold · Body 17 ·
Callout 16 · Subheadline 15 · Footnote 13 · Caption1 12 · Caption2 11. Minimum 11 (tab labels 10 medium) [HIG Typography].
macOS: Large Title 26 · Title1 22 · Title2 17 · Title3 15 · Headline 13 bold · Body 13 · Callout 12 · Subheadline 11 ·
Footnote 10 · Caption 10. Minimum 10.
Web stack: `-apple-system, "SF Pro Text", system-ui` — on Apple devices this *is* SF. Tight tracking on large titles
(−0.02em), default on body. LUX tokens: `--lux-body --lux-lh --lux-title --lux-headline --lux-foot --lux-target
--lux-row --lux-control` switch per idiom.
Support text scaling: sizes in px from tokens, layouts that reflow at 200% (no fixed heights on text containers).

## 16. Accessibility (non-negotiable, also tested)

- Contrast 4.5:1 for text on glass measured against the real backdrop (glass-audit), 3:1 for large text and icons.
  Tinted labels on adaptive glass use `data-tint` → `var(--lg-tint)` so the accent stays legible on light and dark glass.
- Every control has a name; icon buttons get `aria-label` + tooltip on Mac.
- Focus: visible ring (3px), logical order, trapped in modals, returned on close.
- Reduced motion, reduced transparency (glass → solid), increased contrast (thicker separators, solid fills).
- Never rely on gesture alone, colour alone, or hover alone.

## 17. 2026 platform notes (iOS/iPadOS/macOS 26 → 27)

- Liquid Glass is the system material (26). 27 ("Golden Gate" polish) adds: a **transparency slider** (clear ↔ tinted)
  replacing the Clear/Tinted switch; darker glass edges with brighter highlights; blur retuned over busy content;
  Mac edge-to-edge sidebars that keep coloured icons; changed window corner radii; uniform toolbars; refined search tab.
  → The renderer exposes `glass.transparency(v)` (0 clear … 1 tinted) for the slider, defaulting to the owner's
  clear look.
- Tab bars float and can minimise; accessories sit above them; sheets are glass at medium detent and become more
  opaque as they grow (LUX `onProgress.full` → raise `dim`).
- Controls are capsules; concentric corners (inner radius = outer − padding).

## 18. UX tells — instant "this is a website, not an app"

1. Tapping an item loads a new page (iPhone) or opens a modal (Mac).
2. No press state, or press fires on touch-up only; scrolling over a button highlights/taps it.
3. Hard stop at the page edge; no pull-to-refresh where content refreshes.
4. Blank screen or a centred spinner while loading; skeleton flashes on cached content.
5. Sheets that can't be dragged, don't follow the finger, or snap with a CSS ease.
6. Animations that restart when interrupted; things that leave in a different direction than they came.
7. 17pt body text and 44pt buttons on a Mac; 13pt text and 24pt rows on a phone.
8. Hover-only affordances on touch; long-press-only actions with no alternative.
9. Right-click shows the browser menu on items that have actions.
10. ⌘F opens the browser find bar in an app that has its own search.
11. "Are you sure?" for every delete; no Undo.
12. Focus lost (to the top of the page) after closing a sheet.

## 19. Procedure — making an existing app feel native

1. Inventory screens; mark each **entity** (things people open) and each **task** (things people do).
2. Map navigation to idioms (§1): iPhone tab bar ≤ 5 places, Mac sidebar sections + toolbar.
3. Replace entity page-navigations with `present()` (sheet on iPhone, inline on Mac). Keep URLs with pushState.
4. Add LUX: `LUX.init()`; overscroll on the main scroller; `LUX.load` with layout-matched skeletons on every async view;
   swipe + context menus on list rows with the same items; shortcuts for the actions that exist; toasts with Undo.
5. Apply idiom tokens (type, targets, density) — no hard-coded 16px/40px anywhere.
6. Glass only where it earns its place (SKILL.md): bars, sidebar, toolbar, floating controls, sheets, menus.
7. Run `glass-audit.mjs` and `ux-audit.mjs`; fix until both pass; look at phone and Mac screenshots yourself.
