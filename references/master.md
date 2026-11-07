# Liquid Glass Redesign: Master Truth File

> Skill copy (liquid-glass-ui-ux v0.7). Operating procedure: `../SKILL.md`. Renderer API: `renderer.md`.

**Purpose.** One source of truth for redesigning an *existing* app into a complete, functional
Liquid Glass UI/UX: material, component placement, movement. It is built from Apple's own
documentation plus the `design-taste-frontend` discipline, then verified by tests (see §15).
When this file and any other guide disagree, this file wins; when this file and Apple's
current docs disagree, Apple wins and this file gets corrected.

**Status:** v0.6 (compact centred bars + accessory role, §3.9; owner feedback round 2, §3.8; interview + Apple light model, §3.7; optical tier §3.6 not yet audited). Base v0.2, test-verified on one reference app (Wayfare) in Chromium: 38 machine checks pass,
9 mutation tests prove the checks can fail, taste gate 0 FAIL / 0 WARN with declared overrides (§15).
**[T]** values that survived testing are marked **[T✓]**; values the tests *corrected* are marked **[T↻]**.
Not yet tested: Safari/Firefox rendering, real touch hardware, performance on low-end GPUs, any human study (§14).

## 0. Provenance legend and authority order

| Tag | Meaning | Trust |
| --- | --- | --- |
| **[A]** | Stated by Apple (HIG, WWDC25 219/356/323, "Adopting Liquid Glass", "Applying Liquid Glass to custom views") | Highest. Never override without a stated reason. |
| **[D]** | Derived: Apple's principle translated to the web (Apple has no web spec) | Follow. Re-derive if Apple changes the principle. |
| **[T]** | Tuned: a number or recipe we chose because Apple publishes none | Provisional until a §15 test passes. |
| **[TS]** | From the taste skill (house style / study of 247 sites and 23 app screens) | Follow unless §2 overrides it. |

Authority order: Apple [A] > this file's [D] > taste [TS] > [T] tuned numbers.

**Honest limit.** Apple publishes no numeric spring constants, blur radii, refractive index,
or tint opacities for Liquid Glass. Every such number in this file is **[T]**. The *behaviours*
(morph, lens-based materialise, gel flex on touch, glow from the fingertip, menus pop from
their source, tab bar minimises on scroll) are **[A]**.

## 1. The mental model (read this before anything else)

1. **Two layers. [A]** A *content layer* (your app: lists, text, artwork, backgrounds) and a
   *functional layer* of controls and navigation that floats above it. Liquid Glass is the
   functional layer's material. It is not a style for "cards".
2. **Glass has no colour of its own. [A]** It shows what is behind it. Colour belongs in the
   content layer; glass takes it on, and may be *tinted* like stained glass for one primary action.
3. **Glass defers to content. [A]** "Liquid Glass seeks to bring attention to the underlying
   content." If the glass is the most interesting thing on the screen, the design has failed.
4. **Quiet at rest, alive on touch. [A]** Elements can lift into glass only when interacted
   with (slider and toggle knobs). Resting state is visually calm.
5. **One plane, morphing. [A]** Controls for each context morph into one another on a single
   floating plane. Nothing fades in from nowhere.
6. **Hierarchy comes from layout and grouping, not from decoration. [A]** Remove custom bar
   backgrounds, borders, and darkening; let the material and the scroll edge effect do it.

The one-sentence test: *content has colour and detail; controls are clear, lensed, and few.*

## 2. Reconciling with the taste skill

Taste bans glass, shadows and gradients. Liquid Glass *is* glass. Resolution: **glass is
permitted only as the functional layer** (§5); everywhere else the taste house style is
unchanged. Passing `--allow` for these rule ids is declared in the project, with this section
as the reason, never silently.

| Taste rule | Status under Liquid Glass |
| --- | --- |
| No glass / no floating pill navigation | **Overridden** for the functional layer only (`--allow glass,pill-nav`). Banned in the content layer. |
| No shadows at rest / no glows | **Overridden on glass elements only**: the soft float shadow and rim light are part of the material [D]. Content stays flat (`--allow shadow,heavy-shadow` scoped; audit G13 enforces scope). |
| No gradients | **Overridden for glass rims/specular only** [D]. Content colour stays flat fields. Text gradients stay banned. |
| No thin rules | **Kept.** Separation is a tone step or the scroll edge effect, never a hairline (Apple: scroll edge effects replace hard dividers [A]). |
| Mixed radii warning | **Overridden**: concentric radii are intentional [A] (`radius-mix`). Radii must follow §6 formulas. |
| Two or three type sizes, headline ≤ 2 lines | **Kept** (Apple also says bolder, left-aligned type [A]). |
| No eyebrows, no mono, no index numbers, no icon-topped cards, no pills above headlines | **Kept.** |
| One ground, one ink, one accent; accent on the action | **Kept and reinforced**: tint only the primary action [A]. |
| Flat content colour fields, real pictures/drawings, full content, no empty sections | **Kept.** Glass needs rich content behind it to read as glass. An empty ground makes glass look like a grey blob. |
| Motion: transform and opacity only | **Extended**: plus lensing parameters (§9.3) on glass. Everything else stays transform/opacity. |
| Reduced-motion fallback required | **Kept**, and aligned with Apple's list (§9.6). |

**Two classes of app (found in testing).** Taste's app-screen rules assume *work tools* (dense dashboards:
titles 18-32px, near-neutral ground, no figure above 40px). A *media/consumer* app (trips, music, TV, photos)
is hero-led and colour-rich, and Liquid Glass wants that: glass has nothing to refract on a neutral ground
and Apple puts colour in the content layer [A]. Classify first:

| Class | Content layer follows | Declared taste overrides (reason) |
| --- | --- | --- |
| **Tool app** (admin, analytics, editor) | taste app-screens rules in full | glass, pill-nav, shadow, heavy-shadow, button-fx (glass layer only) |
| **Media/consumer app** | taste page rules (large type, flat fields) + app data rules | the above, plus `colour-sprawl` (colour belongs in the content layer [A]), `app-title-size` and `below-fold` (hero-led by design), `rainbow-chart` (flat artwork is not a chart), `icon-chips` (round glass controls are not KPI chips), `covered-text` (content scrolls under bars by design; at rest G20 forbids it) |

Everything else taste measures still passes in both classes (`palette-claude`, `contrast`, `kpi-size`,
`ease-in` were *real* defects the gate found in our reference app and we fixed, not overrode).

**What taste adds that Apple does not give you:** a measured content layer (fullness, frame,
copy discipline, real data), the look-and-fix loop on screenshots, and machine checks. Use
`inspect.mjs --app` on the content layer of every screen.

## 3. The material

### 3.1 Anatomy (what a glass surface is made of)

From outermost to innermost [D, from A: "layers that adapt", lensing, specular, shadows]:

1. **Shadow.** Soft, wider over text/busy content and weaker over solid light ground [A].
   Grows with element size [A]. Never on resting content.
2. **Lens (refraction).** The signature [A]. Content behind bends at the rim; the middle is
   near-neutral. This is what separates Liquid Glass from "frosted blur".
3. **Frost.** Blur plus luminosity adjustment to protect legibility [A: regular variant].
4. **Tint.** Optional; maps one colour to brightness-dependent tones [A].
5. **Specular rim.** Light caught at the edge; reacts to touch/pointer and environment [A].
6. **Content.** Labels/symbols in *vibrant* ink that flips light/dark with the glass [A].

### 3.2 Variants [A]

| Variant | Use when | Rules |
| --- | --- | --- |
| **Regular** (default) | Almost always. Any size, any background, text-heavy (alerts, sidebars, popovers). | Fully adaptive. Default for everything. |
| **Clear** | **All three**: (1) over media-rich content, (2) the content layer is not harmed by dimming, (3) the content above the glass is bold and bright. | Permanently more transparent. Add a dimming layer: **~35% black** under it if the media is bright; none if dark. **Never mix** with regular in one view. |

### 3.3 Adaptivity [A]

- Small glass (toolbar buttons, tab bar) **flips light/dark** with the content beneath.
- Large glass (sidebar, menu, sheet) adapts but **does not flip**, and is more opaque.
- Expanded glass (a menu out of a button) reads as thicker: deeper shadow, stronger lensing.
- Window/pane loses focus → its glass recedes.
- Symbols and labels flip to maximise contrast with the glass.
- **Web tone model [T↻].** Choose the ink by *computed contrast against the tinted backdrop*, with 15%
  hysteresis, never by a luminance guess. Measured: the flip point is about **0.10** relative backdrop
  luminance. Saturated mid-luminance colours (pure red ≈ 0.20) need **dark** ink; our first guess (flip
  band 0.18-0.34) put white ink on red at 3.9:1 and failed G5.

### 3.4 Tint [A]

Tint only primary elements and actions; tinting everything makes nothing stand out.
Colour the *background* of the primary control, not the symbols. One tinted control per bar.
Colourful content layer → monochrome bars, or an accent with clear differentiation.

### 3.5 States [A]

Rest (calm) → hover (pointer: subdued effect) → press (touch: flex + light up from the
touch point, spreads to nearby glass) → focus (visible ring) → disabled (dimmed, still
openable if it is a menu) → selected (fill/tint, same signal across tab bar, segmented
control, sidebar).


### 3.6 Optical glass (tier T3, WebGL): what "really Liquid Glass" needs  [T, user-validated look]

Feedback on v0.2 ("not enough glass, it is frosted"): correct. The T1/T2 DOM tiers are a blur plus a displacement
map. They cannot compute light, so there are no specular curves, and T2 is Chromium-only (iOS Safari showed plain
frost). **Real optical glass is rendered, not styled.** Reference implementation: `gl/index.html`.

Model (per glass shape, in one fragment shader; background is a texture the app controls):

1. **Shape field.** Rounded-rect signed distance per object. Nearby objects **smooth-union** (`smin`, k≈20px), which gives
   Apple's container behaviour: shapes fuse with a liquid neck and detach again as they separate.
2. **Bevel height.** Convex circular profile over a bezel (≈40px max). Normal = `normalize(vec3(outward*slope, 1))`,
   slope = thickness/bezel × f′(t). Interior is flat, the rim is steep (this is where light and refraction live).
3. **Refraction.** `refract()` per colour channel with slightly different indices (1.45/1.50/1.56) → real rim dispersion
   with no hacks. Sample the background at `p + R.xy/-R.z × reach`.
4. **Light.** Two fixed lights (top-left key, bottom-right return) plus **a light that follows the pointer**; specular on
   the bevel only; Fresnel rim; an edge hairline that brightens toward the light. Highlights travel as the light moves.
5. **Body.** Small frost (1-1.6px), colour boost ×1.22, a light dim (0.10-0.20) so text stays readable (Apple's own
   clear-variant dim [A]), contact shadow that darkens whatever is beneath.
6. **Motion that is physical.** Appear = lens strength 0→1 with a spring (Apple's "materialise" [A]); press deepens
   thickness +35% and scales 0.955 with glow from the touch point; drag translates the shape, so the *background bends
   live behind it*; layout animations (the Focus buttons flying out and fusing) run in CSS and the renderer mirrors
   each element's rect every frame.
7. **Architecture rule (new, L7).** DOM text/icons stay in the DOM above the canvas (accessible, selectable); the canvas
   only draws glass. Each glass shape is a real element (`[data-gl]`) so layout, focus and a11y are unchanged.

Constraints learned: (a) the refracted background must be something the app renders (canvas, image, video, a WebGL
scene); arbitrary DOM behind cannot be refracted cross-browser, so use T1/T2 there; (b) soft-GL headless runs ≈1fps, so
test visuals with long waits and use **adaptive resolution** on real devices; (c) never write `style.transform` from the
render loop for drag/press (it clobbers layout animations): use the independent `translate`/`scale` properties;
(d) fallback when WebGL is missing: T1 frost, still fully usable.

Open: legibility is by dim, not by blur, so G5-style contrast must still be measured on this tier; it has not been
audited yet (v0.2's 38 checks cover T1/T2 only).

### 3.7 Decisions from the owner's interview + Apple's lighting model (v0.4)  **[owner] = the owner's explicit choice**

**The governing rule [owner]: glass must never feel forced. Every glass element must earn its place by doing a job
the content layer cannot do** (floating navigation over content, showing a value through a lens, morphing a control
into what it opens, giving touch feedback). If removing the glass loses nothing, remove it.

**The value test (run per element, before styling):**
1. Is it in the functional layer (navigation, control, transient)? If not, no glass. [A]
2. Does content pass behind it (scrolls, plays, or is rich and varied)? If the backdrop is always one flat colour,
   glass adds nothing; use a plain fill. [owner: varied colours and shapes behind glass make it read best]
3. Which role is it? Apply only that role's effects (table below). Effects are opt-in by role, never global.
4. Is the effect consistent with every other element of the same role on this platform? [owner + A: "use
   matchedGeometry and materialize transitions across your apps" for a consistent experience]

**Global constants (same for all glass) [owner]:**

| Ingredient | Decision | Note |
| --- | --- | --- |
| Bend at the edge | **subtle** (≈0.45 of v0.3) | |
| Curve | **flatter** bevel (≈0.55): thin plate, not a thick lens | |
| Blur inside | **none** (crystal clear) | Legibility comes from darkening per role, not from blur. Deviation from Apple's regular variant; G5 contrast must still pass. |
| Colour richness | **natural** (no boost) | |
| Shadow underneath | **none** | |
| Rim glow (Fresnel halo) | **none** | |
| Glossy shine spots | **removed** | Apple's highlights are a *lit silhouette*, not hotspots (below). |
| Appear | **one transition for the whole platform** | lens strength 0→1 on a single shared spring; every element uses it. |

**Apple's light model (researched).** Apple, WWDC25 *Meet Liquid Glass*: "Light sources inside of this environment
shine on the material producing highlights that respond to geometry. On interactions, such as locking and unlocking
your phone, these lights move in space, causing light to travel around the material, defining its silhouette." and
"in some cases, the lighting responds to device motion". Newsroom: it "dynamically reacts to movement with specular
highlights". Press reports (secondary): the edge facing the light glows and the **opposite edge also catches the light
passing through**; tilting moves it. Therefore:
- One environment light for the whole screen. The highlight is a **thin line on the silhouette whose brightness
  follows the edge's angle to the light**: light from above lights top and bottom edges (key + through-light), light
  from the side lights the sides. This is the "dynamic edge line" the owner likes; it replaces the uniform hairline.
- **The light rests.** It moves only on events: once around the silhouette when glass appears; toward the finger on
  press; with device motion where the platform allows it (not in a browser sandbox). No idle drifting.

**Role profiles (effects are opt-in by role) [owner + A]:**

| Role | Examples | Darkening | Press squash + finger glow | Fringe / magnify | Merge |
| --- | --- | --- | --- | --- | --- |
| `control` | icon buttons, toggles, steppers | ~none (clearest) | **yes** (Apple: `.interactive()`) | no | within its toolbar group |
| `bar` | tab bar, toolbar container | light | light glow, small squash | no | no |
| `surface` | text containers: mini player, menu, popover, alert | **more** (≈0.38) | no squash | no | no |
| `lens` | tab selection bubble, slider/segmented thumb while dragging, glass over glass | none | no | **strong fringe + ~1.3× magnifier**, *only while moving* | n/a (sits on top) |

- **Strong colour fringe exists only in the lens role** [owner: "only when there is a zoom-in effect"]. Apple: the
  long-pressed tab highlight becomes a "selection bubble" with lensing and chromatic aberration (MacStories review,
  secondary); "the transparent liquid lens can be seen through to precisely observe the value underneath it" [A].
- **Squash and finger glow only on things people touch directly** [owner; A: interaction glow "starting right under
  your fingertips, the glow spreads throughout the element and onto any Liquid Glass elements nearby"].
- **Merging only between related controls in one group** (a toolbar group, a control expanding into its menu)
  [owner: specific cases]. Shapes in different groups never melt, even when close (tab bar vs mini player).
- **Seamless merge [owner: v0.3 showed two textures].** Fixes: (1) parameters are *blended* across melted shapes, so
  the merged body has one thickness, darkening and light; (2) highlights are computed on the union silhouette, not
  per shape; (3) a control that opens into something (the + becoming its menu) is **one shape changing geometry**,
  not two shapes merging, so there is no seam by construction.
- **Roundness [owner]: lean round where it fits.** Capsule for single-icon buttons, nav bars, accessories; concentric
  radius for nested containers; cards keep a large fixed radius. Use-case dependent, never square-ish by default.
- **Darkening by content [owner]:** text-bearing surfaces get more; text-free controls stay clear.
- Background movement is **not a glass property** (the interview question was unclear and is dropped). Background
  choice is a content-layer design decision: prefer varied colour and shape behind glass.

Reference implementation of this section: `gl/v2.html` (music-app screen).

### 3.8 Owner feedback round 2: motion-only merging, local glow, stable colour shift, glass-over-glass lens (v0.5)

1. **Merging is an animation, never a state [owner].** Two glass shapes that sit close together at rest stay two
   separate shapes. Melting is allowed only *while a morph runs* (a control growing into its menu, a group
   splitting or joining): the merge factor ramps 0→1 over ~120ms when the transition starts and back to 0 when it
   settles. Implementation: per-object `mergeFactor`; union uses `min` (hard edge) when it is 0 and `smin` only above it;
   parameter blending across shapes is likewise off at rest. Verified: factor 0 for neighbours at rest.
2. **Touch feedback stays inside the touched element [owner].** The finger glow is evaluated for the pressed shape
   only, and the environment light no longer swings on press (it moves once around the silhouette on appear, and with
   device motion where available). This deliberately narrows Apple's "glow spreads onto nearby Liquid Glass elements".
3. **Adaptive colour (light/dark ink) is opt-in per element, smooth, delayed and stable [owner].**
   - Opt-in: `data-adapt="on"`. Some UIs should never shift colour even where it would make sense; that is the
     designer's call per element, not a global default.
   - Decide on a **time-averaged** backdrop brightness over the whole element (4×3 samples, ~0.35s average), so
     flicker and brief passes cannot trigger it.
   - Switch only after the new state has held for **DWELL = the transition time (0.5s)**; then **cross-fade ink and
     glass tone over 0.5s** (smoothstep); then a **1s cool-down** before any further switch.
   - Verified: 0 switches during 5.4s of rapid light/dark alternation; on a sustained change the switch starts at
     0.6s and fades 0 → 0.35 → 0.96 → 1 with no jump.
   - When a control morphs into a text surface (+ into menu), its ink follows the morph progress, not the timer.
4. **The selection lens is glass over glass [owner, matches Apple's selection bubble].** Two render passes: base glass
   first, then the lens samples the *finished* frame, so it bends the bar itself (the bar's edge appears displaced
   inside the bubble) and the content above it. It overflows the bar (≈1.4× bar height), magnifies ≈1.16×, has a
   thin dark rim and a colour fringe **capped to a thin line at the rim** (refraction reach ≤9px), and exists only
   while the selection moves.
5. **Text-bearing glass needs real smoothing.** Ring blurs leave ghost copies of text behind; use a 16-sample spiral
   blur. Tab bars carry labels, so they get a light version of the text treatment; text-free controls stay clear.
   Lightening (dark-ink state) is ~half as strong as darkening so dark-ink glass does not turn milky.

### 3.9 Floating bars hug the centre; the now-playing bar is an accessory (v0.6) [owner]

- **Compact, centred floating bars.** Tab bars, accessories (now playing) and similar bottom bars do not span the
  window. Width = `min(viewport − 2×margin, max(⅓ of viewport, content minimum), cap)`; in CSS
  `min(calc(100vw - 32px), max(33.333vw, 340px), 520px)`, centred with `left:0; right:0; margin:0 auto`. A phone gets
  the comfortable minimum (340px at 390px wide), a wide window gets the centre third (480px at 1440px). Stacked bars
  share one width so their edges align. Matches Apple's floating, inset tab bar and keeps the thumb zone central.
- **New role `accessory`** (now-playing bar and similar persistent strips): lighter and clearer than a `surface`
  (darkening ≈0.28, blur ≈2.5px vs 0.6 / 10px for menus). It carries one or two lines of short, bold text that the
  bottom scroll-edge fade already supports, so it needs far less help than a menu of items.
- Tab bar darkening lowered to ≈0.16, no blur. The bottom scroll-edge fade is gentler (peak ≈0.86) so the bars read
  lighter; the remaining faint content behind tab labels is accepted, as on Apple's own bars.

## 4. Web implementation (three tiers) [D]

Apple's renderer has no web equivalent. We approximate with three tiers selected at runtime.
Every glass surface must work at **T0**; T1/T2 are enhancement.

| Tier | When | Technique |
| --- | --- | --- |
| **T0 Solid** | `prefers-reduced-transparency`, `prefers-contrast: more`, forced colours, no `backdrop-filter`, or a user "Reduce transparency" toggle | Opaque (frosted-solid) fill in the content's surface colour, strong 1px edge, higher-contrast ink. Apple: reduced transparency = frostier, increased contrast = black/white + border [A]. |
| **T1 Frost** | All modern browsers | `backdrop-filter: blur() saturate()` + translucent tint + rim (inset shadows) + float shadow. |
| **T2 Lens** | Chromium only (feature-detected) | T1 plus `backdrop-filter: url(#lens)` using an SVG `feDisplacementMap` fed by a generated bezel map, with channel offsets for rim dispersion. |

### 4.1 Tokens [T]

```css
:root{
  --lg-blur: 14px;           /* frost radius; large surfaces +6 */
  --lg-sat: 1.7;             /* backdrop saturate */
  --lg-tint-light: rgb(255 255 255 / .30);
  --lg-tint-dark:  rgb(24 24 28 / .38);
  --lg-rim-hi: rgb(255 255 255 / .70);   /* top-left specular */
  --lg-rim-lo: rgb(255 255 255 / .18);   /* bottom-right return light */
  --lg-shadow: 0 10px 30px rgb(0 0 0 / .14), 0 2px 6px rgb(0 0 0 / .08);
  --lg-ink: rgb(14 14 18);               /* flips via data-tone */
  --lg-ink-2: rgb(14 14 18 / .78);       /* [T↻] secondary/placeholder. .66 failed 4.5:1; dark scheme needs .88 */
  --lg-accent: <brand>;                  /* the ONE tint. [T↻] must give ≥4.5:1 with white ink: #ff5a3c gave 3.2 → use ≤0.18 luminance */
  --lg-dim-clear: rgb(0 0 0 / .35);      /* [A] 35% for clear over bright media */
}
```

Large glass is more opaque [A], so give it its own tint [T↻]: **sidebar** 0.56 white (light) / 0.74 ink (dark);
**sheet** 0.60 (light) / 0.74 (dark), 0.90 at the full detent. Selected-item fill on dark sidebar: 0.12 (0.16
dropped label contrast to 4.0:1). Lens interior blur **σ≈7** [T↻]: σ 2.2 left hard patterns crisp under text and
failed G5; the cost is softer, more "pooled" colour than Apple's crisp rim (§14). Dispersion 0.07 [T↻] (0.12
read as rainbow smear).

### 4.2 Hard constraints (from the web-port research)

- `backdrop-filter: url(#id)` works in **Chromium only**; Safari/Firefox fall back to blur.
  Detect by capability + UA, never assume.
- The SVG filter must be in the same document (not Shadow DOM) and not `display:none`
  (use zero size). One unique filter id per distinct size/shape.
- The default filter region is ~10% past the box; large displacement needs a bigger region
  or edge samples go transparent.
- Refraction stays inside the element's own box on the web (no bending of content beyond its
  edge). Design so that is not noticeable.
- Large surfaces (>~800px wide) at high displacement scale cause GPU jank → T1 for large
  glass, T2 for controls (small, interactive) only. Matches Apple's own size behaviour [A].
- A parent with `opacity < 1`, `filter`, or `will-change` creates a stacking context that can
  break the backdrop sampling. Keep glass parents plain.
- Glass cannot sample glass [A: containers share a sampling region]. On the web, glass over
  glass blurs a blur: forbidden (G2). Group neighbours in one container element.
- **Library rules learned the hard way** [T↻]: (1) style `::placeholder` on glass with the ink-2 token (the
  browser default grey failed contrast); (2) read geometry for shared-element morphs from **offset
  geometry**, never `getBoundingClientRect`, which is scaled by any in-flight transform (our segmented
  indicator collapsed to a dot while the sheet was mid-animation); (3) start every animation from the
  *current* computed state and do **not** `commitStyles` (stale inline opacity/transform snapped menus to 0
  on interrupt); (4) never hardcode the colour scheme; follow the OS and expose a toggle.
- Perf [A]: limit simultaneous glass; combine neighbours into one container. Budget [T]:
  ≤ 6 glass surfaces on screen, ≤ 2 using T2 lens at once.

## 5. Screen architecture

```
z 40  transient: menus, popovers, toasts (glass, regular, thicker)
z 30  sheets (glass; opaque at full height) over a dim layer when modal
z 20  FUNCTIONAL LAYER: toolbar, tab bar / sidebar, search, floating controls  (glass)
z 10  scroll-edge effect (blur+fade under bars; not a divider)
z  0  CONTENT LAYER: backgrounds, artwork, lists, text, cards   (flat, coloured, NO glass)
```

Rules:
- **L1 [A]** Glass only in the functional layer (and transient controls on interaction).
- **L2 [A]** Content extends *beneath* bars and sidebars to the screen edge; never a solid
  strip behind a bar. Use background extension (mirror + blur) where an image would otherwise
  stop at a sidebar.
- **L3 [A]** Content at rest should not collide with glass: at launch/scroll-top, position so
  the first screenful sits clear of bars.
- **L4 [A]** Never put glass on both a control and the element on top of it.
- **L5 [A]** Never stack glass on glass. Never mix regular and clear.
- **L6 [A]** Use fills/transparency/vibrancy for things on glass; **no opaque solid fills** on glass.

## 6. Shape and concentricity [A]

Three shape kinds:

| Kind | Radius | Use |
| --- | --- | --- |
| Fixed | constant | Standalone cards in the content layer |
| Capsule | `height / 2` | Buttons, bars, sliders, switches, segmented controls, search |
| Concentric | `parentRadius − padding` | Anything nested in a rounded container |

- Compute inner radius with `max(0, outer − inset)`. Pinched or flared corners signal a bug.
- Near a device/window edge: phone → capsule with extra margin; wide → concentric to the window.
- Large controls → capsule; small/dense desktop controls may stay rounded rectangles.
- Sections/cards get a larger radius than before (Apple raised list section and sheet radii [A]).
- [T] starting radii: window/sheet 34, card/section 24, sidebar 28, menu 22, control = capsule.

## 7. Component placement spec

Format: **Rule [source] → web translation**.

### 7.1 Navigation

| Context | Placement |
| --- | --- |
| Phone / compact | **Floating tab bar at bottom**, inset from edges, glass, 3–5 tabs, icon over label [A]. Selected = filled symbol + accent text; a sliding glass indicator lenses between tabs [D]. Minimise on scroll-down, restore on scroll-up [A]; tap a tab or scroll to top exits minimised. |
| Regular / wide | **Floating inset sidebar, leading**, glass-large (more opaque, no flip), content scrolls/extends beneath [A]. ≤ 2 hierarchy levels; ≥ 5 destinations or deep hierarchy → sidebar; else tab bar [A]. |
| Adapt | Tab bar ↔ sidebar from available **width**, not device type [A: size classes]. Same destinations, same order [A: anatomy once]. |
| Tab rules | No actions in a tab bar (those are toolbar) [A]. Never hide/disable a tab [A]. Labels single words [A]. Badges only for critical info [A]. Avoid overflow "More" [A]. |
| Search | Phone: a **dedicated search tab at the trailing end** or search at bottom [A]. Wide: top-trailing in the toolbar, may minimise to an icon [A]. Focus slides field up with keyboard [A]. |
| Accessory | Persistent features only (e.g. now-playing) above the tab bar; collapses inline when minimised. Never screen-specific actions (checkout belongs with content) [A]. |

### 7.2 Toolbar (top bar)

- Three zones: **leading** (back/close, sidebar toggle, then title), **center** (common
  controls, collapse to overflow first), **trailing** (important/always-visible, search, More,
  and the **one primary action**, tinted) [A].
- **Max 3 groups** [A]. Group by function and frequency [A].
- **Never group a text button with an icon button** (they read as one control) [A]. Text
  buttons get their own container; separate with fixed space.
- Icons over text for familiar actions; every icon has an accessible name [A].
- No custom bar background, border, or darkening [A]; large title collapses to inline on scroll [A].
- Title < 15 characters, not the app name [A].
- Primary action: prominent (tinted) style, trailing, **one only** [A].
- Standard Back/Close are icon-only [A].

### 7.3 Buttons [A]

- Min hit region **44×44**; recommended padding ~12 around bezelled, ~24 around unbezelled.
- Styles: *glass* (secondary), *glass-prominent* (tinted, the most likely action). **1–2
  prominent per view.** Distinguish by style, not size.
- Capsule by default; roles: normal, primary, cancel, destructive. A destructive action is
  never the primary role. Always a pressed state. Loading → inline activity indicator + verb
  change ("Checkout" → "Checking out…").
- Colour on the *background* for emphasis, not on symbols/labels.

### 7.4 Controls

- Segmented control, slider, toggle: knob/thumb **becomes glass during interaction** and
  returns to quiet at rest [A]. Sliders show ticks when stepped [A]. Selected segment lenses
  across [A].
- Control sizes: Mini/Small/Medium (dense) → Large → X-Large for hero actions [A].

### 7.5 Menus and popovers [A]

- Open **from the source control** (pop out, anchored), never from a screen edge.
- Icons: all items in a group have one, or none do; no decorative icons; use standard icons.
  Top actions match swipe actions.
- Important first; related grouped; separators = a gap or line; **≤ ~5 items per submenu,
  one level deep**; toggle items show state by label or check; unavailable = dimmed, still reachable.
- Regular variant (text-heavy).

### 7.6 Sheets [A]

- Partial sheets are **inset** from the edge so content peeks around them; at full height the
  glass becomes **more opaque** and docks to the edge [A].
- Detents: medium (~half) and large; custom heights allowed; **grabber** on resizable sheets;
  swipe down dismisses; confirm if unsaved.
- **Cancel leading, Done trailing**; Done always paired with Cancel/Back; never all three [A].
- One sheet at a time. Long/complex flow → full-screen or its own page, not a sheet.
- Sheets morph out of their source button (zoom) [A].
- Modal → dim layer; parallel task → glass separation only.

### 7.7 Lists, forms, cards (content layer; **not glass**)

- Larger row height and padding; section radius up (§6) [A]. Section headers in title-style
  capitalisation, not forced uppercase [A].
- Cards are content: flat colour field, real data, no shadow, no glass.

### 7.8 Hero / media

- Full-bleed artwork runs under the toolbar and beside the sidebar; mirrored + blurred
  extension fills the gap under glass [A].
- Text and controls sit *on top of* extended backgrounds, never inside the mirrored part.

### 7.9 Alerts, toasts, badges

- Alert: regular glass, centered, ≤ 3 buttons, primary tinted non-destructive [A].
- Toast: transient glass at the safe edge; no timer-only dismissal for critical info [A cognitive].
- Badge: red capsule on tab/icon for critical items only [A].

## 8. Layout metrics

| Item | Value | Source |
| --- | --- | --- |
| Min touch target | 44×44 (macOS 28, min 20) | [A] |
| Padding around controls | 12 (bezelled), 24 (unbezelled) | [A] |
| Min text size | 11 (iOS), 17 default; support 200% enlargement | [A] |
| Body contrast | 4.5:1 ≤17pt; 3:1 at 18pt+ or bold | [A] WCAG AA |
| Outer margin | 16–32, equal both sides | [TS] |
| Bar inset from edge | 12–16 phone, 16–20 wide | [T] |
| Gap between glass siblings in one group | 8, merging if ≤ container spacing | [D] from `GlassEffectContainer(spacing:)` |
| Layout switch basis | container width, not device | [A] |
| Type | bolder, left-aligned, 2 sizes carry the page | [A],[TS] |

## 9. Movement

### 9.1 Principles [A]

Purposeful, brief, precise, follows the gesture, **cancellable**, optional, and never gratuitous.
Avoid motion on high-frequency interactions. Motion is never the *only* signal. Touch gets a
stronger response than pointer.

### 9.2 The named behaviours [A]

| Behaviour | What happens |
| --- | --- |
| **Materialise** | Glass appears/disappears by modulating lensing and blur, not by a plain opacity fade. |
| **Morph** | Neighbouring glass elements merge and split like liquid (shared geometry); one plane. |
| **Flex & glow** | On touch the glass flexes, scales slightly, and lights from the touch point outward, spreading to adjacent glass. |
| **Lift** | Slider/toggle knob lifts into glass during drag; settles quiet after. |
| **Pop** | Menus and action sheets grow out of their trigger; content stays anchored where tapped. |
| **Minimise** | Tab bar recedes on scroll down, returns on scroll up. |
| **Deepen** | Dragging a sheet up: more opaque, slightly larger. |
| **Scroll edge** | Soft (default) blur/fade under floating bars; hard for pinned headers on dense UIs. One style per view. |

### 9.3 Web motion tokens [T]

| Token | Value | Use |
| --- | --- | --- |
| `--lg-spring-press` | stiffness-ish: 180ms, `cubic-bezier(.2,.9,.3,1.4)` | press flex (scale .96 → 1.0 w/ slight overshoot) |
| `--lg-spring-morph` | 520ms, spring (ζ≈.7) via `linear()` | glass indicator / merge |
| `--lg-spring-pop` | 360ms, `linear()` spring ζ≈.75 | menu/popover growth from source |
| `--lg-spring-sheet` | 480ms, spring ζ≈.85 | sheet in/out |
| `--lg-ease-fade` | 160ms ease-out | reduced-motion substitute |
| Materialise | animate `--lens` 0→1 and blur 0→`--lg-blur` over 280ms, plus scale .94→1 | appear |
| Glow | radial highlight at pointer, 240ms in / 400ms out | touch/pointer |

All animation **starts from current state** so it can be interrupted (FLIP/WAAPI with
`commitStyles`, or springs integrated on `requestAnimationFrame`). [A: cancellable]

Allowed animated properties: `transform`, `opacity`, and on glass only the lens/blur custom
properties. Never animate layout properties or large blur radii on big surfaces.

### 9.4 Interaction recipes [D]

- **Press:** `pointerdown` → scale .97 + glow origin at pointer; `pointerup` → spring back.
- **Tab change:** one glass indicator element translates/resizes between tab rects (shared
  geometry), icon fill swaps; never cross-fade two highlights.
- **Menu:** `transform-origin` = trigger centre; scale .6→1 + materialise; 360ms.
- **Sheet:** from source: scale/translate FLIP from the trigger rect; detents snap with spring.
- **Bar minimise:** on scroll delta > 24px down, collapse labels + shrink to a capsule; up > 12px restores.
- **Scroll edge:** a gradient-mask backdrop blur strip under the bar whose height = bar height + 8.
- **List item arrival:** none (high-frequency). Frequent interactions stay still.

### 9.5 Budget [T]

≤ 2 concurrent glass animations; none over 600ms except sheets; no looping glass motion;
no parallax in the content layer behind glass (it fights the lens).

### 9.6 Reduced motion [A]

Tighten springs (less bounce); track gestures directly; no depth/z animation; replace x/y/z
transitions with fades; **do not animate into and out of blurs**; drop elastic properties and
scale pulses. Result: same states, instant or fade-only.

## 10. Accessibility [A]

- Honour **Reduce Transparency** (T0 solid frosted), **Increase Contrast** (black/white ink,
  1px border, darker accent variant), **Reduce Motion** (§9.6), forced colours.
- Provide light, dark, **and** increased-contrast variants of every colour.
- Never rely on colour alone; icons get accessible names; text-size to 200%.
- Visible keyboard focus on every glass control; full keyboard use; swipe has a button alternative.
- Contrast is measured **against the composited backdrop**, worst case, not against the token (G5).
- No auto-dismiss timers for essential info; confirm destructive actions.

## 11. The redesign procedure (for an existing app)

1. **Record the before** (screenshots at 1440/768/390; list of routes, forms, behaviours that
   must survive). Taste: `inspect.mjs --app --out .taste-skill/before`.
2. **Classify every element** with the decision table (§11.1). Output: a layer map.
3. **Strip chrome** from the functional layer: custom bar backgrounds, borders, dividers,
   coloured sidebar fills, shadows on content cards.
4. **Make the content layer rich and flat**: full-bleed colour fields, real artwork/data,
   larger rows/sections, bolder left-aligned type. Content runs under bars.
5. **Rebuild the functional layer** with the §7 placements; group by §7.2; tint one primary.
6. **Assign shapes** by §6; compute nested radii from the container.
7. **Wire morphs**: for each control that becomes another (button→menu, button→sheet,
   tab→tab, toolbar state A→B), name the shared element and the transition.
8. **Motion pass** by §9, then the reduced-motion pass.
9. **Accessibility pass** by §10 (T0 fallback, increased contrast, reduced motion).
10. **Verify** with the audit (§12) and screenshots at 3 widths × light/dark × 3 stress
    backgrounds; fix; repeat (max 3 rounds). Compare to the before.

### 11.1 Glass or not?

| Element | Decision |
| --- | --- |
| Top bar, tab bar, sidebar, floating action cluster | **Glass** (functional layer) |
| Search field in a toolbar | Glass |
| Menu, popover, alert, action sheet, toast | Glass (regular, thicker) |
| Sheet | Glass; opaque at full height |
| Slider/toggle knob, selected-segment thumb | Glass **while interacting/selected** |
| Cards, list rows, tables, forms, panels, tiles | **No glass**: flat content |
| Page/section backgrounds, hero | **No glass**: flat colour / artwork |
| Inline text buttons inside content | No glass (text/tint only) unless it is the primary action |
| Decorative panel "to look modern" | **No** |

## 12. Machine-checkable rules (the audit)

Implemented in `tests/glass-audit.mjs`. IDs are stable; reports cite them.

| ID | Rule | Method |
| --- | --- | --- |
| G1 | Glass only in the functional layer (`data-layer="controls"` ancestors); none on cards/rows/sections | DOM walk of computed `backdrop-filter` |
| G2 | No glass inside glass (no glass ancestor/descendant pairs) | DOM walk |
| G3 | Never mix regular and clear in one view | `data-variant` |
| G4 | ≤ 6 glass surfaces and ≤ 2 T2 lens surfaces per view | count |
| G5 | Every text/placeholder ≥ 4.5:1, icons ≥ 3:1, each measured on **its own rectangle** against the composited backdrop (text hidden, interior only: the 1.5px rim is not behind text), worst of p5/p95 luminance, over white/black/red/checker, light and dark, rest/menu/sheet; occluded surfaces skipped | pixel sampling |
| G6 | Hit targets ≥ 44×44 on touch widths; 8px min gap | geometry |
| G7 | Capsule radius = h/2 (±1); nested radius = parent − inset (±1.5) | computed style vs geometry |
| G8 | ≤ 1 tinted (prominent) control per bar; ≤ 3 groups per bar | `data-prominent`, `data-group` |
| G9 | No text button adjacent in a group with an icon button | DOM walk |
| G10 | T0 fallback: with reduce-transparency/contrast emulation, no `backdrop-filter` remains and contrast ≥ 7:1 | emulation |
| G11 | Reduced motion: no transform travel > 2px, no overshoot, no blur animation; fades ≤ 200ms | frame sampling |
| G12 | Press response: transform changes within 1 frame, returns, interruptible; menus/sheets originate within the trigger rect | frame sampling |
| G13 | Content layer has no shadow, gradient, text-shadow or backdrop-filter, **in every view** (Home alone hid a knob shadow) | computed style × 5 views |
| G14 | Content reaches under the bars (bar overlaps content, no solid strip) | geometry |
| G15 | Keyboard: every glass control reachable and has a visible focus ring and accessible name | Playwright |
| G16 | Layout switches by width: tab bar < 700px, sidebar ≥ 900px; same destinations | DOM at widths |
| G17 | Scroll-edge effect exists under each bar that content scrolls beneath | DOM + scrolled sampling |
| G18 | Bar minimise on scroll works and restores; hit targets stay ≥44 while minimised | scripted scroll |
| G19 | The T2 lens measurably changes the render vs T1 frost (refraction is real, not decorative CSS) | pixel diff |
| G20 | At rest, no first-screen text sits under a glass surface (L3 [A]) | geometry |

Plus the taste gate on the content layer (`lint.mjs`, `inspect.mjs --app --allow …`).

## 13. Tells of fake glass (reject on sight)

- Blur with no rim light, no lens: "frosted card" (Windows 11 acrylic look).
- Glass cards/rows/panels in the content layer.
- Glass on a flat white or empty page (nothing to refract).
- Hairline outlines on everything instead of a rim that varies by angle.
- Coloured glass on every button; rainbow tints.
- Opaque white buttons on glass; text in `#999` on glass.
- Glass inside glass; a bar with a blur *and* a solid background *and* a border.
- Animated blur radius on big surfaces; looping shimmer; parallax behind glass.
- Fade-in/out of glass instead of materialise; menus appearing in screen centre.
- Bars that hide behind their own content; a solid strip between the bar and the content.

## 14. Known limits and open questions

- **Tested only in Chromium** (the sandbox has no Safari/Firefox). T1 frost is the *designed* fallback there but is **unverified by pixels**. Test it before shipping.
- **One reference app, one author.** Passing G1-G20 proves the rules are satisfiable and checkable, not that they are sufficient for every app. No human usability or preference study was run.
- **Lens trade-off is unresolved.** Legible interior blur (σ≈7) costs the crisp edge refraction Apple shows. Revisit with a two-layer approach (crisp lens only in the rim, blurred frost in the interior).
- **Timing checks are load-sensitive** (G12:press flaked under 4× parallel load at a 60ms bound; now 100ms). Run the audit sequentially in CI.
- No GPU/perf profiling; budgets (≤6 glass, ≤2 lens) are Apple-aligned guesses [T].
- No real touch hardware: touch is emulated (`hasTouch`).

- Cannot refract content outside an element's box on the web.
- T2 lens is Chromium-only; Safari/Firefox are T1. This is designed for, not hidden.
- Apple publishes no numeric constants: §3/§4/§9 numbers are **[T]**, to be calibrated by §15.
- Adaptive light/dark flipping on the web needs luminance data of what is behind the glass;
  we use authored `data-luma` or sampled image luminance (§15 T7).
- Sizes like extra-large controls and exact iOS 26 corner radii are not specified by Apple in
  the fetched pages; treat our values as tuned.

## 15. Verification log

Reference app: *Wayfare* (trip planner), same content before/after (`app/before`, `app/after`). Harness: `tests/glass-audit.mjs`
(38 checks, real Chromium, pixel sampling), `tests/mutate.sh` (9 deliberate breakages), taste `lint.mjs` + `inspect.mjs --app`.

| # | Test | Result | What it taught / corrected |
| --- | --- | --- | --- |
| T1 | SVG lens prototype on a test pattern | works; `url()` composes with `saturate()` | T2 viable in Chromium; needs added blur |
| T2 | First audit run | 29/36 | 7 findings, below |
| T3 | G5 contrast vs composited backdrop (4 stress backdrops × light/dark × 4 states) | 110 → 66 → 19 → 1 → 0 violations over 5 fix rounds | tone model (flip ≈0.10), lens σ 2.2→7, ink-2 alphas, accent AA, large-glass tints, placeholder style, measuring per-text rect |
| T4 | G6/G15 | input hit area 26px and no focus ring | made the input fill its capsule; ring on the input |
| T5 | G12 interrupt | reopen mid-close snapped opacity 1→0 | animate from current state; drop commitStyles |
| T6 | G12 menu origin | origin read from a scaled rect | offset geometry |
| T7 | Visual review | segmented indicator collapsed; hero text unreadable on light art; dark scheme not applied | offset geometry; flat darkest-palette plate under hero copy; follow OS scheme |
| T8 | Taste gate | palette-claude, 3.5:1 card text, 64px figure, knob shadow, ease-in exits | all fixed; declared overrides in §2; G13 widened to all views |
| T9 | Review gap → new check | text under glass at rest was unchecked | added G20 (L3) |
| T10 | Mutation tests (9) | 9/9 caught; m4/m5/m6 tripped only their own rule | checks discriminate; not vacuous |
| T11 | Final | **38/38 audit, 9/9 mutations caught, taste inspector 0 FAIL / 0 WARN (declared overrides), lint 0 FAIL** | v0.2 |

| T12 | Skill build: library (`assets/gl/liquid-glass-gl.js`) reproduces the approved screen (`examples/listen.html`) | identical renders of lens, menu, accessory; merge 0 at rest, 0.8 mid-morph, 0 after | library extracted from the tested renderer, app-specific code moved to the example |
| T13 | Skill audit (`scripts/glass-audit.mjs`) on the example | first run 22/23: reduced-motion springs blew up (appear −2.57) at low frame rates | springs now sub-stepped; under reduced motion glass appears instantly; rerun **23/23** |
| T14 | Skill mutations (6 deliberate breakages: static merge, full-width bars, nested glass, missing role, small square control, jumpy colour timing) | **6/6 caught**, each by its intended check | the gate discriminates |

Evidence files: `out/audit.json`, `out/audit.txt`, `out/g5-detail.json`, `out/mutation.txt`, `out/inspect-after/`, `out/shots/`.

## 16. Sources

Apple HIG: Materials; Color (Liquid Glass color); Toolbars; Tab bars; Sidebars; Sheets;
Buttons; Menus; Layout; Accessibility; Motion. WWDC25 219 *Meet Liquid Glass*, 356 *Get to
know the new design system*, 323 *Build a SwiftUI app with the new design*. Apple docs:
*Adopting Liquid Glass*, *Applying Liquid Glass to custom views*. Web-port notes: community
SVG displacement-map implementations (Chromium-only `backdrop-filter:url()`; displacement
approach credited to Jhey Tompkins). Taste: `design-taste-frontend` (house rules, app-screens
chapter, critique loop).

## 17. v0.7 — UX layer and dual idiom (2026)

Behaviour now lives in `ux.md` (Apple UX per device, iOS/iPadOS/macOS 26–27) with the LUX runtime and `ux-audit.mjs`.
Glass additions: roles `sidebar`, `toolbar`; `data-tint` → `--lg-tint`; `glass.transparency(v)` (27 slider); CSS opacity
fades glass. Verification:
- T15 `examples/music.html` (iPhone Music ↔ Mac Music from one file): glass-audit 22/22, ux-audit 27/27 (twice).
- T16 defects the new gate found in our own code before shipping: sheet drag listeners commented out (sheets could not
  be dragged); `lift` used before declaration (touch-and-hold menu threw); dragging a sheet also pulled the page to
  refresh and lost focus; LUX tokens followed OS light scheme in a dark app (invisible rows); DOM chrome showing through
  the optical sheet; Mac now-playing pill was glass nested in the glass toolbar; selected tab label 2.4:1 → `data-tint`.
- T17 mutation run of ux-audit: see `scripts/ux-audit.mjs` header; each injected regression must turn its check red.
