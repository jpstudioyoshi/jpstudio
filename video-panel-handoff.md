# Handoff v2: Watch panel (panel-video2) — transcript unbounded, drags video with it

## TL;DR
Loading a video alone works perfectly. Loading a transcript causes the
transcript's container chain (and, mysteriously, the unrelated video
column too) to grow to the transcript's full content height (~13,250px)
instead of staying bounded to the visible panel (~706px). The video element
itself then renders far below the visible viewport because its column
stretched to match.

**This is the second handoff on this bug.** A previous attempt (v1, see
below) tried two different CSS approaches that both failed *identically* —
which is itself an important clue (see "What we've ruled out").

## Confirmed bug reproduction
1. Load a video only → panel displays correctly, video fits, no scroll.
2. Load a transcript (with a video already loaded) → everything breaks:
   the video player visually moves far down the page (often appears below
   the fold entirely), and the transcript has no internal scroll — it just
   grows to its full length.

## What we've measured (DevTools, with video + transcript both loaded)
```js
const ids = ['panel-video2', 'vtVideoCol', 'vtTranscriptCol', 'vtTranscriptWrap', 'vtTranscript'];
ids.forEach(id => {
  const el = document.getElementById(id);
  const r = el.getBoundingClientRect();
  console.log(id, '| scrollH:', el.scrollHeight, '| clientH:', el.clientHeight, '| height:', Math.round(r.height));
});
```
Result (consistent across multiple CSS approaches — see below):
```
panel-video2      | scrollH: 13410 | clientH: 706   | height: 706
vtVideoCol        | scrollH: 13250 | clientH: 13250 | height: 13250
vtTranscriptCol   | scrollH: 13250 | clientH: 13250 | height: 13250
vtTranscriptWrap  | scrollH: 13250 | clientH: 13250 | height: 13250
vtTranscript      | scrollH: 13248 | clientH: 13248 | height: 13250
```
**`panel-video2` is correctly bounded (706px, matches the actual visible
panel space).** Everything inside it — both columns, not just the
transcript one — has ballooned to ~13,250px, matching the transcript's
full content height almost exactly.

We also measured the **unnamed flex-row div directly wrapping
`vtVideoCol`/`vtTranscriptCol`** (no id; selector
`#panel-video2 > div:nth-child(2)`):
```
row | scrollH: 13250 | clientH: 13250 | height: 13250 | computed display: flex | computed height: 13250px
```
So the failure starts at THIS row, the direct child of the
correctly-bounded `panel-video2`. The row has `flex:1; min-height:0` (an
inline style, the same pattern that correctly bounds `panel-video2` itself
one level up) — but it is NOT being constrained by it.

## What we've ruled out
- **Not a CSS Grid–specific issue.** The row was originally
  `display:grid; grid-template-columns:2fr 1fr; grid-template-rows:minmax(0,1fr)`
  with `flex:1;min-height:0` on the grid container itself. We replaced it
  entirely with `display:flex; flex-direction:row` (giving the two columns
  `flex:2 1 0%` / `flex:1 1 0%` instead of grid columns) — **the measured
  numbers came back byte-for-byte identical.** Changing the layout
  mechanism made zero difference, which strongly suggests the actual bug
  is NOT in how the row distributes its children, but in why the row
  itself isn't being bounded by its parent in the first place.
- **No `!important` CSS rule is overriding the inline style.** Searched
  style.css for every `!important` rule near "video"/"height" — the only
  candidates are inside `#panel-video.vt-fullscreen { ... }` blocks, which
  use the WRONG id (`#panel-video`, not the real `#panel-video2`) and so
  cannot match in any mode, fullscreen or not. (This dead-CSS mismatch is
  a separate, pre-existing, lower-priority issue — flagged but not the
  cause here.)
- **No leftover/duplicate old video panel in the DOM.** Searched for
  `id="panel-video"` (without the 2) — zero matches. Searched all `id="vt*"`
  attributes in index.html — every one is unique (count of 1), no
  duplicates/collisions.
- **No JS setting inline `style.height`, `style.flex`, or `style.cssText`**
  on any of `vtVideoCol`/`vtTranscriptCol`/the row/`vtTranscriptWrap`/
  `vtTranscript`. Searched `features-video.js` specifically for
  `cssText|.style.flex|ResizeObserver|MutationObserver` — only matches are
  unrelated popups/lightbox code elsewhere in the file. The only places
  `vtTranscriptWrap.style.display` gets set are three call sites — two set
  `'flex'`, one (line ~140) sets `'block'`. **Not yet confirmed which of
  these actually fires on a normal transcript-load** — worth checking,
  since if the `'block'` path is the one taken, `vtTranscriptWrap` would
  not be a flex container at all, breaking `#vtTranscript`'s `flex:1` —
  but this wouldn't explain `vtVideoCol` *also* growing to match, so it's
  probably not the whole story even if real.
- **No other JS file touches these elements** besides `features-video.js`
  itself (checked `core-foundation.js`/`features-progress.js` — only
  reference is an unrelated localStorage key name, `vtVideoHistory`, for
  watch-time stats — not a layout concern).

## Current actual file state
- `index.html` (~line 1943): the row is now
  `<div style="display:flex;flex-direction:row;gap:16px;align-items:stretch;flex:1;min-height:0;margin-bottom:16px">`
  containing `vtVideoCol` (`...flex:2 1 0%`) and `vtTranscriptCol`
  (`...flex:1 1 0%`).
- `vtTranscriptWrap`: `style="display:none;flex-direction:column;flex:1;min-height:0;overflow:hidden"`
- `#vtTranscript`: `style="flex:1;min-height:0;box-sizing:border-box;overflow-y:auto;..."`
- `style.css`: `.panel.active { ... overflow-y: auto }` is the default;
  `#panel-shuchu.active, #panel-listening.active { overflow: hidden }` is
  the current exception list — **`#panel-video2.active` is NOT currently
  in it** (was added and reverted twice during investigation; leave it out
  for now, add back once the root cause is actually fixed, not before).

## Hypothesis for Code to investigate
Since two structurally different CSS approaches at the row level produced
byte-identical failures, and `panel-video2` itself IS correctly bounded one
level up using the exact same `flex:1;min-height:0` pattern, something
about the row's specific situation is different from `panel-video2`'s. Two
candidate angles:
1. **Chrome DevTools "Computed" panel inspection of the row element
   directly** (not just `getBoundingClientRect`/`scrollHeight` from the
   console) — check what `flex-basis` actually resolves to, and whether
   `min-height: 0` is genuinely being applied or overridden/recalculated
   by something. Static grep can't see this; needs live inspection.
2. **`align-items: stretch` cascading through THREE levels of nested
   flex/grid containers with one branch holding extremely tall content
   (~13,000px)** may be hitting a real browser layout engine edge case in
   this specific Electron/Chromium build — i.e., not a logic bug in our
   CSS at all, but an intrinsic-sizing resolution quirk under extreme
   content-height differentials between sibling flex items. Worth testing:
   does the bug reproduce with a SHORT transcript (5-10 lines) instead of
   a full-length one? If short transcripts stay bounded and only very long
   ones break, that points strongly at this rather than a structural CSS
   mistake — and the fix would likely be an explicit `max-height` clamp
   somewhere in the chain rather than relying purely on flex distribution.
3. Check the three `vtTranscriptWrap.style.display` call sites in
   `features-video.js` (lines ~140, ~1083, ~1166) — confirm which one
   actually fires when a user loads a transcript normally, and whether
   the `'block'` one (line 140) is reachable in that flow.

## Diagnostic to run first
```js
const row = document.querySelector('#panel-video2 > div:nth-child(2)');
console.log(getComputedStyle(row).flexBasis, getComputedStyle(row).minHeight, getComputedStyle(row).height);
// Then inspect `row` in the Elements panel → Computed tab, expand "flex"
// section, see what's actually being applied vs overridden.
```
