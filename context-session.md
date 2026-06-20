# Japanese Studio — Session Context
Last updated: 2026-06-20 (session 45, full session — four parts: (1) kana input
root-cause fix, (2) 集中 Focus Sprint UI polish + dead-code cleanup, (3) SQL-aware
Q&A chat in the Home/質問 panel, (4) panel scroll/layout architecture overhaul —
nav, quick-translate bar, and every `.panel-header-lower` bar converted from
position:fixed to real flex-flow siblings of `main`, eliminating every
manually-guessed `padding-top` value app-wide. One open item carried forward:
video panel (`panel-video2`) transcript overflow — handed to Claude Code, see
`video-panel-handoff.md` in repo root.)

## User Preferences
- Paul is learning development workflows as we go — suggest improvements concisely.
- Management window deprioritised — terminal approach preferred for all edits.
- Use jp alias (cd ~/Documents/jpStudio) not full path in commands — ALWAYS prefix with jp &&
- pbcopy for all grep/sed output.
- Always prefix multi-line python3 edits with jp && to avoid directory drift.
- "done" means command ran and printed OK.
- Paul's eyesight is not great — prefer larger text, high contrast, bigger buttons in UI work.
- Give commands one at a time — do not batch unrelated commands.
- Core principle: system should look after itself — Paul learns, doesn't drive the system.
- Claude has read/write filesystem access to ~/Documents/jpStudio (via filesystem MCP) —
  can read source files, run audits, and apply edits directly (filesystem:edit_file /
  write_file), verifying each with check-syntax.js after every change. No grep/search
  across file contents via this route — use check-syntax.js's audit file + targeted reads,
  or hand multi-file investigation to Claude Code (which has bash+grep+live app access).
- Some files contain extremely long single lines (giant HTML template-literal strings, e.g.
  features-lesson-notes.js). The `view` tool fails ("Tool result too large") even at 1-3 line
  ranges for these — and critically, `view_range` does NOT actually restrict what's read for
  some files (returns the full file regardless, then hits a size limit). Use terminal
  `sed -n 'N,Mp' file`/grep for anything where exact line ranges matter; hand removals to
  Claude Code rather than python heredoc when the exact text can't be read this way.
- When a bug is described as recurring/systemic, investigate for duplicate/uncoordinated
  implementations before patching the visible symptom again — see "Kana Input System" below
  for a concrete example of why a third "fix" was needed after two earlier ones, and the
  "Panel Scroll Architecture" section for the same pattern at the layout level.
- **When deep CSS layout debugging stalls (3+ rounds of fix→test→still broken with no new
  insight), stop and hand off to Claude Code with a written diagnostic summary** rather than
  continuing to guess in chat. Code can actually run the app and iterate against live
  DevTools state; chat-based debugging from pasted console output hits a ceiling. See the
  video panel transcript bug below for the concrete example — two structurally different
  CSS fixes attempted in chat produced byte-identical failures, which was itself a clue
  (rules out the layer either fix touched) but needed live inspection to take further.
- **CSS diagnostic discipline**: before changing any CSS for a "this looks wrong" report,
  get `el.scrollHeight` vs `el.clientHeight` (and `getBoundingClientRect()`) for the actual
  element first. Don't assume "user says X looks off" means "suppress overflow" — it can
  mean real content is being clipped instead (happened twice this session: listening/video/
  lessonnotes were briefly given `overflow:hidden` based on assumption, which turned out to
  be hiding real content, not masking empty slack — caught via a screenshot, reverted).

## Environment — Fixed Facts
- index.html is at project root (~/Documents/jpStudio/index.html), NOT in src/renderer/
- DB: ~/Library/Application Support/japanese-studio/jpstudio.db
- App alias: jpstart
- Video panel ID: `panel-video2` (not `panel-video`). The fullscreen-mode CSS block
  (`#panel-video.vt-fullscreen { ... }` and its descendant selectors) still uses the WRONG
  id and currently matches nothing in any mode — confirmed dead CSS, pre-existing, not
  touched this session. Low priority cleanup candidate.

## Chat vs Claude Code — Decision Rule
- **Chat:** single-line fixes, config changes, version bumps, CSS tweaks, grep/sed one-offs,
  small same-file contiguous removals where the exact text is readable (python heredoc or
  filesystem:edit_file with verified old_str).
- **Code:** anything touching multiple render paths, multi-line string replacements in JS,
  multi-file refactors, cross-file dead-code investigation (grep-and-decide), removals
  inside files with unreadable giant single lines, OR layout/CSS bugs that have survived
  2-3 fix attempts in chat without new diagnostic insight (see video panel handoff).
  Verified-orphan removals can be large (session 35 removed ~2270 lines in 3 Code passes;
  session 38 removed 35 functions / ~820 lines in one pass) — size isn't the deciding
  factor, "does it need grep across files / live app interaction / can the text be read" is.

## Context File Update Process
- context-session.md lives at project root
- At end of session: Claude writes the full updated file directly (via filesystem write access),
  Paul reviews with `git diff context-session.md`, commits, then uploads to project Knowledge.
- Older "Session N Changes" sections are trimmed/folded into "Current State" sections once their
  content is reflected there, to keep this file from growing indefinitely.

## GitHub Workflow
- Repo: https://github.com/jpstudioyoshi/jpstudio (private)
- Standard push: jp && git add -A && git commit -m "message" && git push
- Pre-commit hook runs check-syntax.js + auto-bumps cache buster (YYYYMMDDHHmmss)

## Claude Code
- Launch: jp && claude --model claude-sonnet-4-6  (claude-fable-5 is no longer available)
- Start: "Read context-session.md from Knowledge only. Do not read any other files yet."
- **Open handoff**: `video-panel-handoff.md` (repo root) — transcript overflow bug in
  panel-video2, see "Video Panel — Open Issue" section below for summary.

## Current Mode
ACTIVE DEVELOPMENT / ONGOING CLEANUP — no separate "stabilization phase". Dead-code cleanup,
bug fixes found along the way, and feature work are all handled as routine, in whatever order
makes sense.

## Panel Scroll/Layout Architecture — Complete State (session 45)
Supersedes the "PRIORITY — Panel scroll/layout consolidation" item from sessions 44 (now
resolved, see below). This was the deepest architectural fix of the session.

### Root cause (confirmed, now fixed)
`nav`, `#globalQuickTranslate`, and all nine `.panel-header-lower` bar variants
(voicePanelHeader, yoshiPanelHeader, progressPanelHeader, listenPanelHeader,
writingPanelHeader, readPanelHeader, kanaPanelHeader, wordsPanelHeader, grammarPanelHeader,
plus dashboardPanelHeader which is nested differently — see below) were all
`position:fixed`. Fixed-position elements reserve zero space in their flex parent, so every
panel had to manually guess a `padding-top` to avoid being hidden under that chrome:
`98px` (nav+QT only), `158px` (nav+QT+header-lower, assuming the header bar is ~60px tall),
`110px` (grammar2 — an unexplained outlier, never matching the documented 158px formula),
`164px` (dashboard). These were hand-maintained magic numbers, never re-verified against
real rendered heights — `readPanelHeader`'s actual height turned out to be ~101px, not the
assumed ~60px, causing a real ~9px content/header overlap that had been silently present
for an unknown number of sessions (only became visible once panels actually started
scrolling — previously `main` wasn't `display:flex` at all, so `.panel.active { flex:1;
min-height:0 }` was a complete no-op and panels just silently clipped content past the
viewport with no scrollbar, so a several-px header overlap was invisible).

### The fix
1. `main` is now `display:flex; flex-direction:column; flex:1; min-height:0;` — was a
   plain block before, meaning `.panel.active`'s flex properties were inert.
2. `.panel.active` gained `overflow-y: auto` — the actual missing piece; previously this
   rule had flex properties but no overflow handling at all.
3. `nav` and `#globalQuickTranslate` converted from `position:fixed` to `flex-shrink:0`
   real flex-flow siblings of `main` within `.main-area` (itself already a proper flex
   column). Visually pixel-identical to before (nav/QT occupy the exact same space) —
   the difference is `main` now genuinely starts where they end, instead of `main`
   starting at y=0 behind them and relying on panel-level padding to compensate.
4. `.panel-header-lower` (the shared class used by all nine bars) converted the same way:
   `position:fixed; top:98px; left:52px; right:0; z-index:48` → `flex-shrink:0`. Since
   only one bar is ever `display:flex` at a time (the rest stay `display:none`, JS-toggled,
   unchanged), this correctly reserves real space for whichever one is active, sized to
   its own true content — no guessing required, ever, regardless of how tall any given
   bar's content is or becomes.
5. Every per-panel `padding-top` value was removed entirely (not just zeroed) — `main`'s
   own children now automatically start exactly where the real chrome stack ends.
6. `dashboardPanelHeader` is structurally different from the other eight (nested *inside*
   `panel-dashboard` rather than a `main`-level sibling) — this needed no special handling,
   since `panel-dashboard` is itself a flex column (`.panel.active`) and the header bar
   becomes a real flex child of it under the same CSS class change.

### Per-panel overflow exceptions (panels that manage their own internal scroll region
and should NOT also scroll at the panel level)
```css
#panel-words.active { ... overflow: hidden; }      /* fixed-viewport flashcard layout,
                                                        pre-existing, untouched */
#panel-shuchu.active,
#panel-listening.active { overflow: hidden; }
```
**`#panel-video2.active` is deliberately NOT in this list** — see "Video Panel — Open
Issue" below; adding it back now would mask the real bug rather than fix it.

**Lesson learned mid-session**: don't add a panel to this exception list based on "user
says there's a pointless-looking scrollbar" alone — verify with `el.scrollHeight` vs
`el.clientHeight` first. `panel-listening`/`panel-video2`/`panel-lessonnotes` were briefly
added based on assumption, which turned out to be wrong for two of the three (real content
was being clipped, confirmed via a screenshot showing cut-off tiles in lesson notes) —
reverted, then `panel-listening` alone was re-confirmed correct via direct testing.
`panel-shuchu` was correctly identified via measurement showing genuinely zero overflow
(`scrollHeight === clientHeight`) before being added.

### Inner-content magic numbers also found and fixed (same root-cause category)
- Video panel's video/transcript grid had `height: calc(100vh - 240px)` — a separate stale
  magic number, unrelated to the panel-padding numbers but the same underlying mistake
  (guessed pixel value assuming old layout proportions). Changed to `flex:1; min-height:0`
  since the grid's parent (`panel-video2`) is now properly bounded. This part of the fix
  is confirmed correct (video-only loading works perfectly) — but exposed a *separate*,
  still-unresolved bug when a transcript is also loaded. See next section.

## Video Panel — Open Issue (handed to Claude Code)
**File**: `video-panel-handoff.md` (repo root) — read this for full diagnostic history
before touching this again, in chat or in Code.

**Symptom**: loading a video alone works perfectly (correctly sized, no scroll). Loading a
transcript (with video already loaded) breaks everything: the transcript's container chain
grows to its full content height (~13,250px measured) instead of staying bounded with
internal scroll, and the unrelated video column grows to match it too (via
`align-items:stretch`), so the actual `<video>` element ends up rendered ~6600px down the
page — invisible, off-screen.

**What's confirmed**: `panel-video2` itself IS correctly bounded (`clientHeight: 706`,
matches the real visible panel). The failure starts at the very next level down — an
unnamed flex-row div directly wrapping `vtVideoCol`/`vtTranscriptCol` — despite that div
having the identical `flex:1; min-height:0` pattern that correctly bounds `panel-video2`
one level up. Two structurally different fixes were tried (CSS Grid with
`grid-template-rows:minmax(0,1fr)`, then a full rewrite to `display:flex;
flex-direction:row`) — **both produced byte-identical failure numbers**, which rules out
the specific layout mechanism as the cause and points at something else (possibly a real
Electron/Chromium layout-engine edge case with extreme content-height differentials
between flex siblings — untested hypothesis: does a short transcript stay bounded while
only long ones break?).

**Ruled out**: no duplicate/leftover old video panel in the DOM (no `id="panel-video"`,
all `vt*` ids unique), no `!important` CSS override reaching the row (the only candidates
target the dead `#panel-video.vt-fullscreen` selector, which can't match), no JS setting
inline `style.height`/`style.flex`/`cssText` on any element in the chain, no
ResizeObserver/MutationObserver involved.

**Do not** re-add `#panel-video2.active { overflow: hidden }` until the actual row-sizing
bug is fixed — it would hide the symptom (header stays put) while leaving the real problem
(video rendered off-screen) merely invisible instead of visibly broken.

## HTML Element Map
`html-map.md` in project Knowledge — updated session 39: removed stale overlay/panel entries.
Session 40: added `panel-shuchu` + sidebar button between 質問 and 筆順. Session 45: added
`shuchuHeaderNextBtn` to panel-shuchu's `.panel-header-lower` row. Session 45 (panel scroll
work): all nine `.panel-header-lower` divs and `nav`/`#globalQuickTranslate` changed from
position:fixed to flex-flow — same elements/ids, different CSS positioning strategy, no
HTML structural changes needed except the video panel's internal grid (see above).
**Not yet updated for session 45's panel-scroll work or SQL Q&A feature** — do this next
session if html-map.md needs to stay current for documentation purposes (low priority,
nothing here changed actual element ids/structure outside what's noted above).

**Session 25-30 additions (still active):**
- vocabWtYoshiPhrases, vocabWtYoshiVocab, vocabWtWriting, vocabWtLookup, vocabWtN5
- vocabWtDirJpEn, vocabWtDirEnJp, vocabWtDirSpeaking
- vocabIntYoshiPhrases/Vocab/Writing/Lookup/N5, vocabThreshLookup/Decay/SessionSize, vocabWeightsMsg
- vcDirectionBtn, vcTypeToggle, vocabFlipControls, vocabTypeControls, vocabTypeInput,
  vocabTypeResult, vocabTypeNextBtn
- .vocab-source-filter checkboxes, .vocab-pos-filter checkboxes
- conjPoolInfo span

## Sidebar — COMPLETE
- #strandMini (4 live proportional coloured bars, S1 teal / S2 gold / S3 muted blue / S4 green)
- Settings button (⚙) at bottom of sidebar
- renderStrandMini() in features-progress.js

## Terminal Workflow
- python3 - << 'PYEOF' for multi-line edits
- Always jp && prefix
- repr() to inspect match strings before retrying
- Blank lines in match strings cause MATCH FAILED
- pbcopy swallows terminal output
- SQLite DB at ~/Library/Application Support/japanese-studio/jpstudio.db
- window.db.query() requires explicit [] params
- Close Electron before SQLite writes
- window.db.run() returns {changes: 0} even on successful batch INSERTs — not an error indicator
- Files with giant single lines break `view` even at 1-3 lines — use grep/sed, hand edits to Code

## Dead-Code Lookup Tooling
- check-syntax.js: callers + exported per function, written to index.json
- Audit file: `audit-latest.md` (single overwritten file)
- find.js: `node find.js <name> function` → instant dead? answer
- Session 38: 18 → 0 candidates (−66 functions)
- Known blind spot: closure-based calls not captured (e.g. customTranscribe — confirmed live)
- **Sole audit candidate, unchanged through session 45: customTranscribe — confirmed NOT dead,
  ticket closed**

## SQL-aware Q&A Chat — Complete State (session 45)
The Home/質問 panel's chat (`sendChat()` in `core-vocab.js`) can now answer questions that
require the learner's own study data (lesson counts, scores, dates, progress, error
patterns — anything from personal usage history rather than general Japanese knowledge),
by reusing the same NL→SQL→answer pipeline the Progress panel's "Ask your data" feature
already had.

### How it works
- `dbqaQuery(question, historyContext)` — extracted from `dbqaAsk()` in
  `features-db-qa.js` as a reusable, DOM-free function. Does schema lookup → Claude writes
  a read-only SQL query → query runs against the local SQLite DB → Claude summarizes the
  result rows in plain English. Returns `{ sql, answer, error }`.
- `dbqaAsk()` (Progress panel's "Ask your data" UI) now just calls `dbqaQuery()` and
  handles its own DOM updates — no behavior change there.
- `SYSTEM_PROMPT` (core-foundation.js) gained one instruction: if a question needs the
  learner's own data, reply with ONLY `NEED_SQL: <plain-English restatement>` instead of
  guessing from memory.
- `sendChat()` checks the reply for that `NEED_SQL:` marker. If present, it calls
  `dbqaQuery()` with the extracted sub-question and swaps in the real, data-backed answer
  before displaying or saving to chat history (the literal marker is never shown to the
  user or persisted in history).

### Cost note
Ordinary questions still cost 1 Claude API call (unchanged). Questions needing personal
data go from 1 call to 3 (routing call + SQL generation + summary) — same per-question
cost the "Ask your data" feature already had on its own, just now reachable from the main
chat too.

## Kana Input System — Complete State (session 45)
Authoritative description of the kana/romaji input engine in `features-kana.js`. Supersedes
the session 43 "Kana focus desync fix" and session 44 "Kana focus/snapshot timing fix" notes
below, both of which were genuine but incomplete fixes to the same underlying bug class — see
"Why a third kana fix was needed" below for why two prior attempts didn't fully resolve it.

### Architecture — single source of truth
- **`kanaOn(el)`** is the one place that wires up input handling for a kana-enabled element:
  romaji→kana `input` listener, IME composition guard, paste-bypass, and cursor sync.
- **`_kanaSyncCursor(el)`** is the one function that re-anchors `el._modeSnapshot` (the
  boundary `kanaInputHandler` treats as "settled" vs. "fresh text to convert") to the real
  cursor position. It is attached to three events, all of which can move the cursor without
  the others firing:
  - `focus` — gaining focus from elsewhere
  - `click` — repositioning the cursor **inside an already-focused field** (does NOT fire
    `focus` — this was the actual unfixed case through session 44)
  - `keyup` on `_KANA_NAV_KEYS` (`ArrowLeft/Right/Up/Down`, `Home`, `End`) — keyboard
    navigation, which also moves the cursor without focus or click firing
  - All three defer via `setTimeout(...,0)` since the triggering event fires *before* the
    browser finishes repositioning the caret.
- **`kanaToolbar(inputId, opts)`** generates the A/ひ/カ/漢字 buttons for an input and stores
  `inp._kanaBtnIds = { romaji, hira, kata }` on the element. `_kanaSyncCursor` reads this to
  determine ground-truth mode from button highlight state when present; inputs with no
  toolbar (raw `kanaOn()` callers) simply keep whatever `_kanaMode` was already set.
  `kanaToolbar` does **not** attach its own focus listener — that would duplicate
  `_kanaSyncCursor`, which is shared.
- **`kanaSetMode(inputId, mode, btnGroupId, btnIds)`** is called by button clicks (and the
  mode-setter shims below) to explicitly switch mode. Sets `_modeSwitchPending = true` so
  the next `_kanaSyncCursor` call (triggered by the subsequent `inp.focus()`) skips its own
  resync and just restores caret colour — avoiding a redundant/conflicting overwrite.
- **`kanaAddToggle(el, startOn)`** — silent `kanaOn()` only, no buttons. For inputs that are
  always hiragana with no mode choice: `conjInputG`, `countAnswer2`, `daysDrillInput`, plus a
  few call sites in `features-grammar.js` and `core-counters.js`. (An earlier, duplicate
  definition of this function that built A/ひ/カ/漢字 toggle buttons existed above this one in
  the file; it was dead — shadowed by JS function-declaration hoisting — and was removed in
  session 45. If any call site ever needs visible toggle buttons instead of silent hiragana,
  use `kanaToolbar()` instead; do not resurrect the old `kanaAddToggle` button-building code.)

### Call-site map (confirmed session 45, before fix)
- **Via `kanaToolbar()`**: shuchu inputs (`shuchuAnswerInput`, further-question inputs,
  `shuchuWriteCompose`), `dc-input` (DrillCard.js), `gdAnswerInput`/`gramSentAnswerInput`
  (features-grammar.js), `cd-jp-*` (features-custom-drill.js, via a local const alias
  `_kanaToolbar = App.kanaToolbar || window.kanaToolbar` — not a separate implementation).
- **Via raw `kanaOn()`**, no toolbar: `core-writing.js:364` (**writingInput** — this is also
  separately wrapped by `kanaToolbar()` via `_initKanaToolbars()`, so it gets both; harmless
  now that both paths share `_kanaSyncCursor`), `features-grammar.js:1950`,
  `features-stroke.js:83`, `features-lesson-notes.js:916/1934/1953`.
- **Via `kanaAddToggle()`** (silent-only, matches its documented intent): `core-counters.js`
  (×3), `features-grammar.js:1709`.

### Removed as part of session 45 (confirmed dead, not just unused)
- Duplicate `kanaAddToggle()` definition (button-building version, shadowed/dead).
- `+`-suffix shortcut in `kanaInputHandler` — looked up `.kanji-btn[data-el-id="..."]`, which
  only ever matched buttons from the now-removed duplicate `kanaAddToggle`. Had been silently
  eating the `+` character with no effect for some time before session 45 (the lookup always
  failed, but the character was still stripped). Typing `+` now just types `+` normally.
- `.kana-toggle` / `.kana-toggle.on` and `.kanji-btn` / `.kanji-btn:hover` / `.kanji-btn.loading`
  CSS in style.css — nothing creates elements with these classes anymore.
  (`.kanji-picker` / `.kanji-picker-item` are still live — used by `kanjiPickerShow()`.)

### Why a third kana fix was needed
Reported symptom: in a field already set to hiragana, clicking into the **middle** of existing
text and typing romaji would render literal romaji for a few characters, then "snap" to
hiragana. Sessions 43 and 44 each fixed a real bug in this area but both were partial:
- Session 43 made `kanaToolbar`'s own focus listener read button-highlight state as ground
  truth, but still read `selectionStart` synchronously.
- Session 44 deferred that read with `setTimeout(...,0)` — correct, but **only fixed
  `kanaToolbar`'s separate listener**. `kanaOn()` had its *own*, older, internal focus
  listener (not deferred) that every kana-enabled input goes through regardless of whether
  it also has a toolbar.
- Root cause investigation (session 45) found the actual remaining bug: `focus` only fires
  when a field *gains* focus. Clicking to a new position **inside a field that's already
  focused** fires no `focus` event at all, so `_modeSnapshot` was never re-anchored for that
  click. Fixed by extracting `_kanaSyncCursor` as a single function wired to `focus` +
  `click` + arrow/Home/End `keyup` — see "Architecture" above.

## 集中 Focus Sprint — UI fixes (session 45, features-shuchu.js, index.html)
1. **Next button moved to panel header**: added `#shuchuHeaderNextBtn` (hidden by default)
   to panel-shuchu's `.panel-header-lower` row, next to New Sprint / 参考 / Activities.
   `addNextBtn()` now shows/wires this header button instead of creating one in the
   per-activity `shuchuActivityBtns`/`shuchuR2Btns` divs (which are now always empty —
   harmless, candidate for later removal if nothing else ever fills them). `show()` hides
   the header Next button on every phase transition so it resets per-question.
2. **Multiple-choice ABCD label duplication fix**: `renderActivityItem` now strips any
   leading `A.`/`A)`/`A:` (incl. fullwidth punctuation) the API may have already embedded in
   an option string before prefixing its own `A.`/`B.`/etc. label.
3. **Wider sentence-entry inputs**: `translate_to_jp` and `error_correct` activity types now
   get `max-width:960px` on the answer input (double the previous 480px); `gap_fill` keeps
   480px, since it expects a short answer, not a full sentence.

## Session 43 — Bug fixes + 集中 UX improvements (2026-06-18)

1. **集中 split-generation** (features-shuchu.js, via Claude Code):
   - Call 1 (fast, max_tokens 1000→1500): generates intro + activity 1 only; shows intro card immediately
   - Call 2 (background, max_tokens 5000): generates activities 2-10 + round2_pool; merges into _sprint
   - `_sprintReady` Promise holds call 2; `shuchuRenderActivity` waits on it if needed
   - `shuchuFetchRemainder` is the new call 2 function; `shuchuReset` nulls _sprintReady
   - Net result: intro card appears without waiting for all 10 activities

2. **Kanji session cache** (features-kana.js):
   - `_kanjiSessionCache` map stores API conversion results during app session
   - Check order: local table → session cache → API call
   - Subsequent 漢字 conversions of the same kana are instant

3. **Video spacebar play/pause** (features-video.js):
   - Spacebar handler added to existing keydown listener
   - Guards: `panel-video2` must have `active` class; focus not in INPUT/TEXTAREA/SELECT
   - Also fixed 2 stale `panel-video` refs → `panel-video2` in fullscreen checks

4. **gramSent: hiragana-for-kanji accepted as correct** (features-grammar.js):
   - Grading prompt now explicitly instructs Claude to count kana-only as correct
   - e.g. たべる accepted same as 食べる

5. **gramSent: sentence variety seed** (features-grammar.js):
   - Random 4-digit seed injected into `_gramSentGenerateOne` prompt
   - Reduces repetition of "canonical" example sentences on reset

## Session 44 — Writing panel bug fixes (2026-06-19)

1. **Writing panel saved-texts scroll bug** (style.css) — superseded by session 45's full
   panel scroll architecture fix, see above. (Original interim patch: explicit
   `height: calc(100vh - 32px)` + `overflow-y:auto` on `#panel-writing`, matching
   `#panel-progress`'s pattern. This interim fix is now redundant/removed — the real fix
   applies uniformly to every panel.)

## 集中 Focus Sprint Panel — Complete
Panel ID: `panel-shuchu`. Full flow:
1. Topic input → Call 1: intro + activity 1 (fast); Call 2: activities 2-10 + pool (background)
2. Intro card with reference content (参考 overlay available)
3. Activities: multiple_choice, gap_fill, translate_to_jp, error_correct
4. translate_to_jp / error_correct always go to round 2 pool
5. Further question widget on every feedback item
6. Round 2: up to 6 items from pre-generated pool targeting weak points
7. Free write: kana-enabled compose input → API feedback (max_tokens: 800)
8. Results summary with score and review list
9. New Sprint button with confirm dialog
10. Sprint JSON persisted via Storage.setJSON('shuchu_last_sprint')

UI details (session 45):
- Next button lives in the panel header (`#shuchuHeaderNextBtn`), not per-activity
- Multiple-choice labels are de-duplicated against API-supplied option text
- translate_to_jp / error_correct answer inputs are 960px max-width; gap_fill stays 480px
- Panel scroll managed via `#panel-shuchu.active { overflow: hidden }` — confirmed correct,
  the panel's own content never overflows; the internal `#shuchu-sprint` element handles
  its own scroll via inline `max-height:calc(100vh - 200px)` (pre-existing, untouched)

API calls per session:
- Call 1: max_tokens 1500 (intro + act 1)
- Call 2: max_tokens 5000 (acts 2-10 + round2_pool, background)
- Per wrong/translate answer: max_tokens 300
- Per further question: max_tokens 300
- Free write feedback: max_tokens 800

Transcript → sprint suggestion pipeline (designed, not built):
- Prerequisite: grammar node timestamps (add timestamp to extracted grammar nodes)
- Pipeline: yoshiByOffset + audioByOffset → [teacher note + transcript] blocks → Claude → 4 suggestions

## Vocab pipeline status check (session 42)
- **Lookup-source meaning backfill: 0 missing** — fully done.
- **Reading backfill: 181 missing** — pre-fix legacy, harmless.
- **fragment pos: 110 rows backfilled** — pipeline fixed for new extractions.
- **null pos: ~210 remaining** — untagged phrases, excluded from drill unless Phrases checked.
- **counter_suffix: unused column** — no code reads it. Deprioritised.

## Vocab System — Complete State

### All pipelines live
| Source | Trigger | Destination |
|---|---|---|
| yoshi_phrases | LESSON_EXTRACTED → initLessonVocabListener | vocab_items |
| yoshi_vocab | lessonNotesExtractVocabSilent direct write | vocab_items |
| writing | WRITING_SUBMITTED → extractWritingVocabToItems (Claude) | vocab_items |
| lookup | VOCAB_LOOKUP → initLookupVocabListener (≥2, len 2-10) | vocab_items |
| n5 | one-time backfill | vocab_items |

### vocab_items schema (v11)
id, word, reading, meaning, example, source, source_ref, type, pos, counter_suffix,
encounter_at, entry_weight, created_at — UNIQUE(word, source)
pos values: verb, noun, i-adj, na-adj, adverb, pronoun, number, expression,
            conjunction, counter, phrase, fragment (〜 patterns)

### vocab_srs schema (v11)
id, vocab_id (FK → vocab_items.id), direction, srs_interval, srs_ease, srs_due,
srs_graduated, last_reviewed — UNIQUE(vocab_id, direction)

### lesson_phrases schema (v12)
id, lesson_id, phrase, reading, meaning, example, type, created_at, node_id, turn_id

### Drill UI — working
- Direction toggle: JP→EN / EN→JP / Speaking; Type toggle: flip card / text entry
- Source + POS filters: active, all checked by default, Reset button
- Writing sitting boost; strand tile updates immediately

### SRS — SM-2
- Known: interval = floor(interval × ease), ease +0.1
- Got it: interval = floor(interval × max(1.3, ease − 0.10))
- Again: interval = 1, due tomorrow, ease −0.15 (min 1.3)

### Weighting
- effective_weight = entry_weight × source_weight × direction_weight × prep_boost(1.5×)
- Fetches 200, sorts, slices to 50
- Source: yoshi_phrases=1.0, yoshi_vocab=1.0, writing=0.9, lookup=0.6, n5=0.3
- Direction: jp_en=1.0, en_jp=0.8, speaking=0.9

## Conjugation Drill — Complete State
- `CONJ_FORMS` — 13 fixed transformation types in features-grammar.js
- `buildConjVerbPool()` — async, two-step: vocab_items SRS-ranked (up to 60) topped up
  by words frequency (to 100 total)
- `DrillSRS.record()` — called in checkConjG on each answer
- Weighted random queue (GrammarErrors.weight) biases toward error-prone forms
- ConjSession: daily session persistence, resume on restart

### Conjugation SRS — srs_items drill_type='conj_forms'
- 13 CONJ_FORMS items as item_keys
- Form selection: weighted random (not hard SRS-due toggle) — sufficient for now

## Grammar Node Mapping Pipeline — COMPLETE
- `lessonNotesExtractGrammarSilent` injects node list, returns grammarNodeIds,
  batch-INSERTs to lesson_phrases with node_id, writes to lesson_sessions.extracted_grammar
- Gold dot indicators on Genki node pills (per-session, not cumulative)
- Gold dot dismiss: click to hide until next lesson (GRAMMAR_GOLD_DISMISSED in Storage)
- Remaining: detail panel (source sentences); turn_id population; "Play from here" button

## Gold Dot → Transcript Chain (designed, partial)
Full chain: gold dot → node_id → lesson_phrases → lesson_id → lesson_sessions → turn_id
→ transcript_turns → audio seek
- lesson_phrases has node_id + turn_id columns (v12)
- turn_id population pending
- Gold dot detail panel UI pending
- "Play from here" button pending

## Writing Sitting Boost — Complete
- On save with ≥5 sentences → INSERT writing_sittings with expires_at = +3 days
- loadVocabItemsDeck boosts lookup words ±2 hours from sitting by 1.5×

## SQLite Schema — v13
kv_store, corpus_entries, corpus_lookups, corpus_productions, counters,
drill_results, error_history, failure_events, grammar_mastery, kanji_ref,
learning_events, lesson_phrases, lesson_sessions, panel_sessions,
pitch_data, schema_version, srs_items, transcript_turns, transcript_vocab,
vocab_items, vocab_items_backup, vocab_srs, words, writing_sessions, writing_sittings

Dropped in v13: transcript_sentences, agent_decisions, conversation_sessions, frames
DB path: ~/Library/Application Support/japanese-studio/jpstudio.db

## kvAPI keys
STRAND_WEIGHTS, VOCAB_WEIGHTS, VOCAB_THRESHOLDS, VOCAB_INTERVALS,
VOCAB_MIGRATION_V1, VOCAB_LESSON_BACKFILL_V1, VOCAB_LOOKUPS_BACKFILL_V1, VOCAB_N5_BACKFILL_V1,
GRAMMAR_GOLD_DISMISSED (cleared on new lesson import)

## Vocabulary Model — Canonical Definition
- **Horizon** — in `words` table (N5 reference), not yet in `vocab_items`
- **Target** — in `vocab_items`, not yet graduated in both jp_en AND en_jp
- **Active** — graduated in both jp_en AND en_jp (`srs_graduated=1` in vocab_srs for both)

## Pending — Priority Order

### PRIORITY — Video panel transcript overflow (open, handed to Code)
See "Video Panel — Open Issue" section above and `video-panel-handoff.md` in repo root.
Loading a transcript breaks the panel's layout (video renders off-screen, transcript
unbounded). Video-only viewing is unaffected. Multiple chat-based fix attempts converged
on identical failures — needs live DevTools investigation, handed to Claude Code.

### Bugs found, not yet fixed
1. `ReferenceError: _rtkMnemonicCache is not defined` at `features-stroke.js:405`, in
   `strokeFetchKoohii()`, triggered from `showBtn.onclick` (`features-stroke.js:323`).
   Found during session 45 unrelated testing. Likely an undeclared/out-of-scope variable.

### Grammar coverage
2. Gold dot detail panel — query `lesson_phrases WHERE node_id = ?` to show source sentences
3. turn_id population — match phrases to transcript_turns at extraction time
4. "Play from here" button — turn_id → audio seek
5. Genki II node integration
6. Grammar node timestamps → transcript → sprint suggestion pipeline

### Dead code / cleanup
7. `rtCompareBtn` (4 refs in features-voice.js) — tie into FLUENCY_432 or remove
8. `vtWatch*` localStorage — low priority, working fine
9. `customTranscribe` — confirmed NOT dead, ticket closed
10. `shuchuActivityBtns` / `shuchuR2Btns` divs (index.html, panel-shuchu) — now always empty
    since session 45 moved the Next button to the panel header. Low priority; only worth
    removing if nothing else ever gets added to them.
11. Dead fullscreen-video CSS block (`#panel-video.vt-fullscreen` and descendants in
    style.css) — uses the wrong id (`#panel-video` not `#panel-video2`), matches nothing
    in any mode. Pre-existing, found during session 45's video panel investigation.
    Low priority — fullscreen mode presumably hasn't worked via this CSS for a while;
    confirm with Paul whether fullscreen video is actually used before deciding to fix
    vs. remove the dead block entirely.

### Vocab pipeline
12. corpus_productions extraction fix (single-kanji in old rows)

### Future / larger features
13. FLUENCY_432 emitter — 4/3/2 speaking session wiring
14. Layer 6 — grammar drill + writing prompt with top-N words
15. Book vocab import (18 pages, OCR artifact, deferred)
16. Sight-reading feature (to be built from scratch)
17. Satellite (jpsat) redesign — warm parchment scheme, rebuilt HTML shell, verify Gist sync
