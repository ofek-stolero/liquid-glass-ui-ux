# liquid-glass-ui-ux

**What it is:** a skill that makes any web app feel like one of Apple's own apps on each device, for iOS/iPadOS/macOS 26 and later. An existing app or a new build plan comes out as two apps from one codebase: on a phone it behaves like iPhone Music or Photos, and on a desktop like Mac Music or Photos. Liquid Glass is the material, used only where it earns its place; the main focus is behaviour.

## Structure of SKILL.md
1. **Goal:** nothing in the app should surprise the hands of someone who uses Apple's apps all day.
2. **Three layers:** behaviour, glass material and content, each with its own truth file, runtime and test gate.
3. **The run, 10 steps:**
   - read the app and list the things people open and the things people do
   - map each screen to iPhone and Mac patterns
   - design the content layer with the taste skill
   - decide how each item opens
   - add touch feedback and stretchy edges
   - add skeleton loading
   - apply per-device sizes and keyboard shortcuts
   - add glass where it earns its place
   - run the test gates
   - report
4. **The glass rule:** glass must never feel forced. Locked look settings, plus a table of the 7 glass types and where each is used.
5. **Never list:** the mistakes that give away a website, and glass misuse.
6. **Files:** a map of everything in the skill folder.

## Capabilities
- **Device detection:** phone, tablet or Mac, with the matching sizes (17pt / 44pt touch targets on iPhone, 13pt / 28pt on Mac).
- **Opening items:** on iPhone, a glass sheet rises from the tapped item, follows your finger and dismisses with a throw. On Mac, the item opens inside the window, and Back, ⌘[ or Esc returns.
- **Touch response:** every tappable thing reacts on touch-down, and scrolling cancels it. On Mac: hover, then a slight darken, never a shrink.
- **Motion and edges:** Apple's spring physics, rubber-band edges, pull to refresh, swipe actions, touch-and-hold and right-click menus, Undo toasts, keyboard shortcuts.
- **Loading:** skeletons shaped like the real layout that never flash on cached content.
- **Real optical glass:** refraction, a lit edge, the magnifying lens and morphs, plus colour that adapts to the background, tints that stay readable, and the iOS 27 transparency slider.
- **Two test gates:** a glass test with 22 checks and a UX test with 27 checks that runs the app as both an iPhone and a Mac.
- **Reference app:** Glass Music (`examples/music.html`), one file that is iPhone Music on a phone and Mac Music on a desktop.

## Companion skill

This skill designs the functional layer (glass, behaviour). The content layer underneath is designed by **design-taste-frontend** (taste-skill) by Leonxlnx: https://github.com/Leonxlnx/taste-skill. Install both:

```bash
npx skills add Leonxlnx/taste-skill
git clone https://github.com/ofek-stolero/liquid-glass-ui-ux ~/.claude/skills/liquid-glass-ui-ux
```
