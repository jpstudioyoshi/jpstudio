# Japanese Studio — Session Context
Last updated: 2026-06-22 (session 47/48 — dead-code cleanup, conjugation SRS toggle,
vocab weight fixes, writing panel improvements, lesson recording mic fix)

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
- Claude has read/write filesystem access to ~/Documents/jpStudio (via filesystem MCP).
- Some files contain extremely long single lines — use terminal sed/grep for exact line ranges;
  hand removals to Claude Code when exact text can't be read.
- When a bug is described as recurring/systemic, investigate for duplicate/uncoordinated
  implementations before patching the visible symptom again.
- When deep CSS layout debugging stalls (3+ rounds), stop and hand off to Claude Code.
- CSS diagnostic discipline: before changing CSS for a layout report, get scrollHeight vs
  clientHeight first. Don't assume — measure.

## Environment — Fixed Facts
- index.html is at project root (~/Documents/jpStudio/index.html), NOT in src/renderer/
- DB: ~/Library/Application Support/japanese-studio/jpstudio.db
- App alias: jpstart
- Video panel ID: `panel-video2` (not `panel-video`).

## Chat vs Claude Code — Decision Rule
- **Chat:** single-line fixes, config changes, CSS tweaks, grep/sed one-offs, small same-file
  contiguous removals where the exact text is readable.
- **Code:** multi-file refactors, cross-file dead-code investigation, multi-line removals in
  files with unreadable giant single lines, OR layout/CSS bugs surviving 2-3 chat attempts.

## Context File Update Process
- context-session.md lives at project root
- At end of session: Claude writes the full updated file directly, Paul reviews with
  `git diff context-session.md`, commits, then uploads to project Knowledge.

## GitHub Workflow
- Repo: https://github.com/jpstudioyoshi/jpstudio (private)
- Standard push: jp && git add -A && git commit -m "message" && git push
- Pre-commit hook runs check-syntax.js + auto-bumps cache buster (YYYYMMDDHHmmss)

## Claude Code
- Launch: jp && claude --model claude-sonnet-4-6
- Start: "Read context-session.md from Knowledge only. Do not read any other files yet."
- **Open handoff**: `video-panel-handoff.md` (repo root) — transcript overflow bug in
  panel-video2, see "Video Panel — Open Issue" section below.

## Current Mode
ACTIVE DEVELOPMENT / ONGOING CLEANUP — dead-code cleanup, bug fixes, and feature work
handled as routine, in whatever order makes sense.

## Session 47/48 Changes (2026-06-22)

### Dead-code cleanup (all committed)
- **`_rtkMnemonicCache` ReferenceError** (`features-stroke.js`) — variable used but never
  declared. Added lazy-init from Storage before `strokeFetchKoohii`. Fixed.
- **Kana debug instrumentation** (`features-kana.js`) — removed `_kanaDebug()`,
  `window._kanaLog`, `window.kanaDebugDump()`, all 9 call sites, `_kanaOnCallCount`.
  Simplified focus/click/keyup listeners to call `_kanaSyncCursor(el)` directly.
- **`rtCompareBtn` dead refs** (`features-voice.js`) — 4 refs removed from
  `voiceTopicChanged`, `fttInit`, `rtCheckProgress`, `rtNewSession`. Button never existed
  in HTML; all refs were null-guarded no-ops.
- **Dead fullscreen CSS** (`style.css`) — removed single line at ~366 and large block
  lines 2427–2604 (`/* Watch panel fullscreen */`). All used wrong id `#panel-video`
  instead of `#panel-video2`, matched nothing.
- **`vtCloseLineTranslate` dead branch** (`features-video.js`) — `isFullscreen` was always
  false (`vt-fullscreen` class never set anywhere). Simplified to
  `if (panel) panel.style.display = 'none'`. Removed unused `const isFullscreen` from
  `vtTranslateLine` too.

### Conjugation SRS-due toggle (features-grammar.js, index.html)
- Added `let _conjSrsMode = false` state variable
- Added `async function _conjGetDueKeys()` — queries `srs_items WHERE drill_type =
  STORAGE_KEYS.DRILL_SRS_CONJ AND srs_due <= date('now','localtime')`
- Added `function conjToggleSrsMode()` — toggles mode, updates button class
- Modified `conjBuildRunQueue(verbTypes, forms, polarities, registers, dueKeys = null)` —
  filters combos to dueKeys when set; shows "Nothing due" message if empty
- Made `startConjDrillG` and `conjNextRun` (now async) fetch due keys when in SRS mode
- Added `<button class="btn-toggle" id="conjSrsModeBtn" onclick="conjToggleSrsMode()">SRS
  Due</button>` next to New button in index.html

### Vocab drill: Yoshi word flooding fix (core-vocab.js)
- **Problem 1**: Reviewed words (any source) kept full source weight permanently → crowded
  out other sources. **Fix**: In `loadVocabItemsDeck`, mark each row `_isNew = (srs_due ==
  null)`. Reviewed words get flat `_base = 0.35` regardless of source; new words keep full
  `entry_weight × source_weight`. This means once you review a Yoshi word once, it
  competes on equal footing with all other reviewed words — source no longer matters.
- **Problem 2**: New Yoshi words from each lesson flooded all session slots. **Fix**: In
  `startNewSession`, separate `newIdx`/`dueIdx`, cap new words at `MAX_NEW = 5` per
  session, combine+sort+slice.

### Writing extraction: hiragana→kanji normalization (core-vocab.js)
- Claude sometimes returns pure-hiragana words (e.g. まいにち instead of 毎日) from writing
  extraction.
- After parsing the Claude response in `extractWritingVocabToItems`, added normalization
  loop: for each word matching `/^[ぁ-ん]+$/`, looks up `words` table by reading. If match
  found, substitutes the kanji form. No API cost.
- Also deleted existing bad rows from DB: `まいにち`, `おもしろい`, `たいくつ`, `まわり`
  from source='writing'.
- Katakana loanwords (ショップ, ドーナツ etc.) and legitimately-hiragana words (する, ある,
  どう) are left alone.

### Writing panel improvements (core-writing.js, features-tools.js, index.html)
- **Enter key bug**: `wbCallTutor` was disabling `writingInput` during API call, making
  plain Enter silently fail mid-flight. Fixed by removing `input.disabled = true/false` —
  only the button is now disabled; input stays live.
- **Detail hidden behind "more ↓"**: removed `toggleDetail` mechanism entirely from
  `renderFeedback`. Detail now shown inline, no click required.
- **Font sizes**: corrected from `1.05rem`→`1.15rem`, note/translation from
  `inherit`→`0.95rem`, detail at `0.9rem`.
- **Follow-up question**: added `<input id="writingFollowUpInput">` + Ask button at bottom
  of each feedback entry. `writingFollowUp()` appends question to `writingChatHistory` and
  calls Claude with max_tokens=400. Exported to `window[]` in features-tools.js.
- **Saved texts width**: narrowed to `max-width:60%` so feedback panel is less cramped.
- **Feedback panel `onclick`**: removed `onclick="checkWritingSentence()"` from the
  feedback-panel div — clicking feedback area no longer triggers an API call.

### Lesson recording mic fix (services/AudioService.js, lesson-overlay.html)
- **Root cause**: `getUserMedia({ audio: true })` and `getUserMedia({ audio: {
  echoCancellation:false... } })` both grab the system default audio device. On Paul's
  Mac, this is BlackHole 2ch (set as default for routing). Recording was capturing
  BlackHole (silent), not the mic.
- **AudioService.js fix**: added `findMicDevice()` — priority: USB/external wired mic
  first, then built-in Mac mic, then any non-virtual device. Excludes BlackHole, loopback,
  virtual, Zoom, iPhone (continuity mic), Bluetooth. Used in `start()` before
  `getUserMedia`.
- **lesson-overlay.html fix**: same priority logic applied to the audio level monitor's
  mic device selection (visual feedback, not recording itself).
- **Recording is single-channel** (mic only). `_teacherPath` / loopback recorder already
  skipped when `recordTeacherTrack` is unset (which it is).
- Console log added: `[AudioService] Mic device: <label>` on every recording start for
  verification.

## Audit Status
- Likely dead candidates: 1 (customTranscribe in features-voice-drill.js — confirmed NOT
  dead, closure-based call, ticket permanently closed)

## Panel Scroll/Layout Architecture — Complete State (session 45)
nav, #globalQuickTranslate, and all .panel-header-lower bars are flex-shrink:0 real flex
siblings — not position:fixed. main is display:flex;flex-direction:column;flex:1;
min-height:0. .panel.active has overflow-y:auto. Per-panel padding-top hacks removed.

Per-panel overflow exceptions (panels with internal scroll management):
- #panel-words.active: overflow:hidden (fixed-viewport flashcard)
- #panel-shuchu.active, #panel-listening.active: overflow:hidden

## Video Panel — Open Issue (handed to Claude Code)
File: `video-panel-handoff.md` (repo root). Loading transcript with video breaks layout —
transcript grows to full content height, video column stretches to match. Video-only works.
Do NOT add #panel-video2.active { overflow:hidden } until the row-sizing bug is fixed.

## Writing Panel — Complete State
- Input textarea + kana toolbar + buttons in frozen `writingPanelHeader`
- `writing-layout` grid: `3fr 2fr` (sentence board left, feedback panel right)
- Feedback panel: no onclick, no "more ↓" toggle, detail shown inline
- Follow-up question input at bottom of each feedback entry
- Saved texts: `max-width:60%` below the grid
- Enter key: check (plain) / Ctrl+Cmd+Enter: submit to board

## Q&A / Dashboard Panel — Complete State
Input, kana toolbar, Send, and History controls frozen in `dashboardPanelHeader`.
SQL-aware Q&A via `dbqaQuery()` — NEED_SQL: marker routes to NL→SQL pipeline.
3 API calls for data questions (routing + SQL gen + summary), 1 for general questions.

## Kana Input System — Complete State (session 46)
Whole-field reconversion on every keystroke (safe — `romajiToHiragana` skips non-ASCII).
`_kataFrom` is the only cursor-position state — set once on カ button click.
`_kanaSyncCursor(el)` wired to focus + click + arrow keyup.
Debug instrumentation removed this session (session 47/48).

## Conjugation Drill — Complete State
- `CONJ_FORMS` — 13 fixed transformation types
- `buildConjVerbPool()` — vocab_items SRS-ranked (up to 60) topped up by frequency (100)
- `DrillSRS.record()` — called on each answer, writes to srs_items drill_type='conj_forms'
- Weighted random queue (GrammarErrors.weight) biases toward error-prone forms
- **SRS-due toggle** (new): `conjSrsModeBtn` — filters queue to only due form keys;
  "Nothing due" message if queue is empty; plain Random mode unchanged

## Vocab System — Complete State

### All pipelines live
| Source | Trigger | Destination |
|---|---|---|
| yoshi_phrases | LESSON_EXTRACTED → initLessonVocabListener | vocab_items |
| yoshi_vocab | lessonNotesExtractVocabSilent direct write | vocab_items |
| writing | WRITING_SUBMITTED → extractWritingVocabToItems (Claude) | vocab_items |
| lookup | VOCAB_LOOKUP → initLookupVocabListener (≥2, len 2-10) | vocab_items |
| n5 | one-time backfill | vocab_items |

### Weighting (updated session 47/48)
- New words (_isNew = srs_due IS NULL): `_base = entry_weight × source_weight`
- Reviewed words (_isNew = false): `_base = 0.35` FLAT (source no longer matters)
- Direction weight and prep_boost (1.5×) still applied to both
- Session pool: all reviewed due words + max 5 new words, sorted by effective weight
- Source weights for new words: yoshi=1.0, writing=0.9, lookup=0.6, n5=0.3

### Writing extraction normalization (new session 47/48)
- Pure-hiragana extracted words looked up in `words` table by reading
- If kanji form found, substituted before INSERT
- Katakana loanwords and legitimately-hiragana words left alone

### SRS — SM-2
- Known: interval = floor(interval × ease), ease +0.1
- Got it: interval = floor(interval × max(1.3, ease − 0.10))
- Again: interval = 1, due tomorrow, ease −0.15 (min 1.3)

## Lesson Recording — Complete State
- `AudioService.js` (`src/services/AudioService.js`) handles mic recording
- `Orchestrator.startLesson()` / `stopLesson()` coordinate the session lifecycle
- Audio saved as WebM chunks to iCloud (`~/Library/Mobile Documents/...
  /JPstudiorecordings/`) with ffmpeg reindex + ffprobe duration on stop
- Single-channel recording (mic only) — loopback recorder skipped when
  `recordTeacherTrack` unset
- **Mic device priority** (new): USB/external wired → built-in Mac mic → any non-virtual
  Excludes: BlackHole, loopback, virtual, Zoom, iPhone continuity mic, Bluetooth
- Overlay window (`lesson-overlay.html`) shows live mic/loop level meters with same
  device priority for the mic channel visual

## Grammar Node Mapping Pipeline — COMPLETE
- Gold dot indicators on Genki node pills (per-session)
- lesson_phrases has node_id + turn_id columns
- Remaining: detail panel (source sentences); turn_id population; "Play from here"

## SQLite Schema — v13
kv_store, corpus_entries, corpus_lookups, corpus_productions, counters,
drill_results, error_history, failure_events, grammar_mastery, kanji_ref,
learning_events, lesson_phrases, lesson_sessions, panel_sessions,
pitch_data, schema_version, srs_items, transcript_turns, transcript_vocab,
vocab_items, vocab_items_backup, vocab_srs, words, writing_sessions, writing_sittings

DB path: ~/Library/Application Support/japanese-studio/jpstudio.db

## Pending — Priority Order

### Bugs / cleanup open
1. Video panel transcript overflow — open, with Claude Code (`video-panel-handoff.md`)
2. `shuchuActivityBtns` / `shuchuR2Btns` — always empty (Next button moved to header
   session 45). Low priority; only remove if nothing else ever fills them. Needs JS
   refactor to null-safe the refs before removing the HTML elements.

### Grammar coverage (all blocked on data/infra)
3. Gold dot detail panel — needs node_id query on lesson_phrases → source sentences
4. turn_id population — match phrases to transcript_turns at extraction time
5. "Play from here" button — turn_id → audio seek
6. Genki II node integration
7. Grammar node timestamps → transcript → sprint suggestion pipeline

### Vocab pipeline
8. corpus_productions extraction fix — single-kanji in old rows

### Future / larger features
9. FLUENCY_432 emitter — 4/3/2 speaking session wiring
10. Layer 6 — grammar drill + writing prompt with top-N words
11. Book vocab import (18 pages, OCR artifact, deferred)
12. Sight-reading feature (from scratch)
13. Satellite (jpsat) redesign

## Dead-Code Lookup Tooling
- check-syntax.js: callers + exported per function → audit-latest.md + index.json
- find.js: `node find.js <name> function` → instant dead? answer
- Known blind spot: closure-based calls not captured
- Sole audit candidate: customTranscribe — confirmed NOT dead, ticket permanently closed

## Terminal Workflow
- python3 - << 'PYEOF' for multi-line edits
- Always jp && prefix
- SQLite DB: ~/Library/Application Support/japanese-studio/jpstudio.db
- Close Electron before SQLite writes
- window.db.run() returns {changes: 0} even on successful batch INSERTs — not an error
- Files with giant single lines break view — use grep/sed, hand edits to Code
