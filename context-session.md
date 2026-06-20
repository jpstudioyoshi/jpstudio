# Japanese Studio — Session Context
Last updated: 2026-06-20 (session 45 — kana input root-cause fix: single cursor-sync mechanism
across focus/click/arrow-keys, replacing the two uncoordinated/partial fixes from sessions 43-44;
dead code removed; 集中 Focus Sprint UI polish: Next button moved to panel header, MC option
label de-duplication, wider sentence-entry inputs)

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
- Claude has read-only filesystem access to ~/Documents/jpStudio (via filesystem MCP) — can read
  source files, run audits, and cross-reference directly without terminal round-trips. No grep/
  search across file contents via this route — use check-syntax.js's audit file + targeted reads,
  or hand multi-file investigation to Claude Code (which has bash+grep). Exception: at end of
  session Claude writes context-session.md directly (see Context File Update Process). Session 45:
  Claude also had write access (filesystem:edit_file/write_file) and applied edits directly,
  verified each with check-syntax.js after every change.
- Some files contain extremely long single lines (giant HTML template-literal strings, e.g.
  features-lesson-notes.js). The `view` tool fails ("Tool result too large") even at 1-3 line
  ranges for these. Use grep (with line-number context) instead of view for anything near such
  functions; hand removals to Claude Code rather than python heredoc when the exact text can't
  be read.
- When a bug is described as recurring/systemic, investigate for duplicate/uncoordinated
  implementations before patching the visible symptom again — see session 45 kana fix below
  for a concrete example of why a third "fix" was needed after two earlier ones.

## Environment — Fixed Facts
- index.html is at project root (~/Documents/jpStudio/index.html), NOT in src/renderer/
- DB: ~/Library/Application Support/japanese-studio/jpstudio.db
- App alias: jpstart
- Video panel ID: `panel-video2` (not `panel-video`)

## Chat vs Claude Code — Decision Rule
- **Chat:** single-line fixes, config changes, version bumps, CSS tweaks, grep/sed one-offs,
  small same-file contiguous removals where the exact text is readable (python heredoc).
- **Code:** anything touching multiple render paths, multi-line string replacements in JS,
  multi-file refactors, cross-file dead-code investigation (grep-and-decide), or removals
  inside files with unreadable giant single lines. Verified-orphan removals can be large
  (session 35 removed ~2270 lines in 3 Code passes; session 38 removed 35 functions / ~820
  lines in one pass) — size isn't the deciding factor, "does it need grep across files /
  can the text be read" is.

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

## Current Mode
ACTIVE DEVELOPMENT / ONGOING CLEANUP — no separate "stabilization phase". Dead-code cleanup,
bug fixes found along the way, and feature work are all handled as routine, in whatever order
makes sense.

## HTML Element Map
`html-map.md` in project Knowledge — updated session 39: removed stale overlay/panel entries.
Session 40: added `panel-shuchu` + sidebar button between 質問 and 筆順. Session 45: added
`shuchuHeaderNextBtn` to panel-shuchu's `.panel-header-lower` row (see 集中 section below).

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
- Files with giant single lines break `view` even at 1-3 lines — use grep, hand edits to Code

## Dead-Code Lookup Tooling
- check-syntax.js: callers + exported per function, written to index.json
- Audit file: `audit-latest.md` (single overwritten file)
- find.js: `node find.js <name> function` → instant dead? answer
- Session 38: 18 → 0 candidates (−66 functions)
- Known blind spot: closure-based calls not captured (e.g. customTranscribe — confirmed live)
- **Sole audit candidate, unchanged through session 45: customTranscribe — confirmed NOT dead,
  ticket closed**

## Kana Input System — Complete State (session 45)
Authoritative description of the kana/romaji input engine in `features-kana.js`. Supersedes
the session 43 "Kana focus desync fix" and session 44 "Kana focus/snapshot timing fix" notes
below, both of which were genuine but incomplete fixes to the same underlying bug class — see
"Session 45" writeup for why two prior attempts didn't fully resolve it.

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

## Session 45 — Kana input root-cause fix + 集中 UI polish (2026-06-20)

### Why a third kana fix was needed
Reported symptom: in a field already set to hiragana, clicking into the **middle** of existing
text and typing romaji would render literal romaji for a few characters, then "snap" to
hiragana. Sessions 43 and 44 each fixed a real bug in this area but both were partial:
- Session 43 made `kanaToolbar`'s own focus listener read button-highlight state as ground
  truth, but still read `selectionStart` synchronously.
- Session 44 deferred that read with `setTimeout(...,0)` — correct, but **only fixed
  `kanaToolbar`'s separate listener**. `kanaOn()` had its *own*, older, internal focus
  listener (not deferred) that every kana-enabled input goes through regardless of whether
  it also has a toolbar. Two independent listeners were firing on focus for toolbar-managed
  inputs (mostly masked by timing luck — the deferred one usually won before a human could
  type), and Path-B inputs (raw `kanaOn()` callers, including `core-writing.js` — the
  writing panel) had **only** the unfixed listener.
- Root cause investigation (this session) found the actual remaining bug: `focus` only fires
  when a field *gains* focus. Clicking to a new position **inside a field that's already
  focused** fires no `focus` event at all, so `_modeSnapshot` was never re-anchored for that
  click — it stayed at its previous (larger) value. New romaji typed at the new, earlier
  cursor position fell inside the stale "preserved" zone and was left unconverted until
  enough characters were typed to catch up to the stale snapshot index — exactly the
  reported "romaji for a few characters, then snaps to hiragana."

### Clean fix (not a third patch — consolidation)
Extracted `_kanaSyncCursor(el)` as the single shared cursor/mode-resync function, wired to
`focus` + `click` + arrow/Home/End `keyup`, replacing both the duplicate listener in
`kanaToolbar()` and the unfixed internal listener in `kanaOn()`. See "Kana Input System —
Complete State" above for full architecture. Verified fixed in the writing panel
(`core-writing.js`'s raw `kanaOn()` path, the clearest unfixed case).

### Dead code removed (same investigation, see "Kana Input System" section for details)
- Duplicate/shadowed `kanaAddToggle()` definition
- Orphaned `+`-to-kanji-picker block in `kanaInputHandler` (was silently eating `+`)
- Dead `.kana-toggle` and `.kanji-btn` CSS rules in style.css

### 集中 Focus Sprint — UI fixes (features-shuchu.js, index.html)
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

3. **Kana focus desync fix** — superseded by session 45, see "Kana Input System — Complete
   State" above. (Original note: focus listener in `kanaToolbar()` made to read active
   button state as ground truth. Real fix, but incomplete — see session 45.)

4. **Video spacebar play/pause** (features-video.js):
   - Spacebar handler added to existing keydown listener
   - Guards: `panel-video2` must have `active` class; focus not in INPUT/TEXTAREA/SELECT
   - Also fixed 2 stale `panel-video` refs → `panel-video2` in fullscreen checks

5. **gramSent: hiragana-for-kanji accepted as correct** (features-grammar.js):
   - Grading prompt now explicitly instructs Claude to count kana-only as correct
   - e.g. たべる accepted same as 食べる

6. **gramSent: sentence variety seed** (features-grammar.js):
   - Random 4-digit seed injected into `_gramSentGenerateOne` prompt
   - Reduces repetition of "canonical" example sentences on reset

## Session 44 — Writing panel bug fixes (2026-06-19)

1. **Kana focus/snapshot timing fix** — superseded by session 45, see "Kana Input System —
   Complete State" above. (Original note: deferred `kanaToolbar`'s focus-listener read of
   `selectionStart` with `setTimeout(...,0)`. Real fix, but only covered `kanaToolbar`'s own
   listener, not `kanaOn`'s separate internal one — see session 45 for the full fix.)

2. **Writing panel saved-texts scroll bug** (style.css):
   - `#savedTextsList` had no `overflow-y`/`max-height` of its own; relied on `#panel-writing`
     to scroll, but `#panel-writing` never had a scroll mechanism in its history (confirmed
     via `git log -S` — original omission, not a regression)
   - Underlying cause: `.panel.active { flex:1; min-height:0 }` is currently INERT for every
     panel — `main` has no `display:flex`, so flex properties on its children do nothing.
     `#panel-progress` is the only panel that actually scrolls, via an unrelated explicit-height
     special case (`height: calc(100vh - 32px)` + `overflow-y:auto`)
   - Fix applied: `#panel-writing { overflow-y: auto; }` +
     `#panel-writing.active { height: calc(100vh - 32px); }` (matches panel-progress's pattern)
   - **Flagged priority by Paul for next session** — see "PRIORITY — Panel scroll/layout
     consolidation" in Pending list below. Same dead-flex problem will silently affect any
     future panel whose content grows past viewport height.

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

### PRIORITY — Panel scroll/layout consolidation
0. **Root cause (confirmed session 44):** `main` has no `display:flex` — it's a plain block
   (`main { padding: 32px 44px; }`). `.panel.active { flex:1; min-height:0 }` therefore does
   NOTHING (flex properties are inert unless the parent is a flex container) even though it
   reads like the standard scrollable-flex-column pattern. Each panel that actually scrolls
   does so via its own unrelated, duplicated mechanism instead:
   - `#panel-progress.active { height: calc(100vh - 32px); }` + `overflow-y:auto` (explicit height)
   - `#panel-words.active { max-height: calc(100vh - 98px); overflow:hidden }` (different pattern again)
   - some panels rely on an inner section having its own `flex:1;overflow-y:auto`
     (e.g. `.feedback-entries`)
   - `#panel-writing` had NONE of these until the session-43 bug fix (added explicit
     `height: calc(100vh - 32px)` + `overflow-y:auto`, matching panel-progress's pattern)
   This is why the writing-panel saved-texts scroll bug happened and was non-obvious to
   fix: `html`/`body` have `overflow:hidden` (intentional, keeps sidebar/nav fixed), so a
   panel that loses its height rule doesn't error or look broken — it just clips silently.
   Flagged by Paul as a priority: "these kind of issues make for repeated roadblocks and
   probably several idiosyncratic solutions." Still open as of session 45 — not touched
   this session (kana input system took priority once investigation revealed it was the
   deeper, actively-reproducing bug; same "duplicate/uncoordinated mechanism" failure
   pattern as this scroll issue, worth keeping in mind when this is tackled).
   **Fix plan (consolidate to ONE mechanism):**
   a. Make `main` `display:flex; flex-direction:column;` with a definite height context
      (isolated CSS commit — touches a shared base selector, so check every panel visually
      after, not just panel-writing/progress/words).
   b. Once `main` is flex, `.panel.active { flex:1; min-height:0 }` becomes live and is the
      one working scroll mechanism for all panels.
   c. Remove the now-redundant per-panel special cases: `#panel-progress.active { height:... }`,
      `#panel-words.active { max-height:...; overflow:hidden }`, `#panel-writing.active { height:... }`.
   d. Re-verify each of those three panels scrolls correctly, plus spot-check a few others
      (kana, voice, listening) for regressions.
   Do step (a) alone first as its own commit before touching (c) — confirm nothing regresses
   before removing the old special cases.

### Grammar coverage
1. Gold dot detail panel — query `lesson_phrases WHERE node_id = ?` to show source sentences
2. turn_id population — match phrases to transcript_turns at extraction time
3. "Play from here" button — turn_id → audio seek
4. Genki II node integration
5. Grammar node timestamps → transcript → sprint suggestion pipeline

### Dead code / cleanup
6. `rtCompareBtn` (4 refs in features-voice.js) — tie into FLUENCY_432 or remove
7. `vtWatch*` localStorage — low priority, working fine
8. `customTranscribe` — confirmed NOT dead, ticket closed
9. `shuchuActivityBtns` / `shuchuR2Btns` divs (index.html, panel-shuchu) — now always empty
   since session 45 moved the Next button to the panel header. Low priority; only worth
   removing if nothing else ever gets added to them.

### Vocab pipeline
10. corpus_productions extraction fix (single-kanji in old rows)

### Future / larger features
11. FLUENCY_432 emitter — 4/3/2 speaking session wiring
12. Layer 6 — grammar drill + writing prompt with top-N words
13. Book vocab import (18 pages, OCR artifact, deferred)
14. Sight-reading feature (to be built from scratch)
15. Satellite (jpsat) redesign — warm parchment scheme, rebuilt HTML shell, verify Gist sync
