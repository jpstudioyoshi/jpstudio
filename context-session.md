# Japanese Studio — Session Context
Last updated: 2026-06-23 (session 52 — vocab pruning, conjugation drill TTS, shuchu ref overlay, VoiceVox clipping fix)

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
- Token stored in remote URL: `git remote set-url origin https://TOKEN@github.com/...`

## Claude Code
- Launch: jp && claude --model claude-sonnet-4-6
- Start: "Read context-session.md from Knowledge only. Do not read any other files yet."
- **Open handoff**: `video-panel-handoff.md` (repo root) — transcript overflow bug in
  panel-video2, see "Video Panel — Open Issue" section below.

## Current Mode
ACTIVE DEVELOPMENT / ONGOING CLEANUP — dead-code cleanup, bug fixes, and feature work
handled as routine, in whatever order makes sense.

## Session 52 Changes (2026-06-23)

### Vocab SRS pool pruning
- 28 n5 words with interval ≥ 14 deleted from srs_items (demonstrably known)
- Pool reduced from 183 → 135 words; healthier source balance
- n5 words re-enter via lookup pipeline if Paul genuinely doesn't know them
- Remaining n5: 83 words (avg interval 2.5 — genuinely unproven, correct to keep)
- Source weights active: yoshi=1.0, writing=0.9, lookup=0.6, n5=0.3
- Reviewed words: flat 0.35 base regardless of source (SRS handles priority from there)

### Conjugation drill TTS toggle
- `_conjTtsMode` + `conjToggleTts()` added to `features-grammar.js`
- `_conjTtsSpeaking` flag blocks `advanceConjG()` while audio is playing
- On card render: speaks `item.word.dict` via `jpSpeak(..., { onend: cb })`
- On any check (correct or wrong): speaks `item.answer`
- 🔊 TTS button added to conjugation controls row in `index.html`
- 🔊 repeat button rendered in card button row when TTS mode active
- `conjToggleTts` exported on `App`

### VoiceVox first-syllable clipping fix
- Root cause: HTMLAudio element fade-in on cold Electron audio session
- Fix: switched to `AudioContext.decodeAudioData` + `BufferSource.start(0)` — no fade-in
- `prePhonemeLength` set to min 0.15 in query object (leading silence in synthesis)
- `audio.load()` + 120ms delay removed (no longer needed with AudioContext approach)
- `_vvAudio` now stores a shim `{ pause: () => source.stop() }` for stop compatibility

### Focus sprint reference overlay
- `shuchuRefOverlay` was never created — `shuchuToggleRef` silently returned
- Now created lazily on first call to `shuchuToggleRef()`
- Overlay: fixed, centred, 640px wide, 75vh max-height, scrollable
- Back button: positioned above the overlay top edge, centred, outside the popup
- Both overlay and back button hidden together on close

### Shuchu answer inputs
- All text answer fields in focus sprint now default to hiragana, no romaji option
- `kanaToolbar('shuchuAnswerInput', { noRomaji: true })` on main answer input
- Same fix applied to further-question inputs (`shuchuFQInput_*`)

### Conjugation drill header cleanup
- `conj-stats-bar` (Run N/3 · ✓ · ✗) removed from card area
- Run N/3 counter moved into dots row, appended after dot elements
- Eliminates layout collision with answer box when answer is revealed

### lessonNotesUpdateDropdown dead call removed
- `lessonNotesUpdateDropdown()` at end of `lessonNotesPanelHandlePaste` — function never existed

## Session 51 Changes (2026-06-23)

### turn_id population — `lnPopulateTurnIds(waLessonId, recSessionId)`
- Added to `src/features-lesson-notes.js`
- Damerau-Levenshtein (`_dlDistance`) — handles transpositions (Whisper phonetic swaps)
- Matches `lesson_phrases` (type != grammar) to `transcript_turns` by content similarity
- Needle: first 20 chars of phrase; haystack window: needle.length + 4 chars
- Threshold: distance ≤ max(3, floor(needle.length × 0.3))
- Hit rate on session 80/82: 12/19 (7 misses genuinely absent from transcript)
- Auto-wired in `Orchestrator.js` after `SESSION_SAVED` — fires non-blocking post-transcription
- Also registered on `App` for manual DevTools calls: `await lnPopulateTurnIds(waId, recId)`

### note_confirmed signal — `nomRunAndCache()`
- After ranking, queries `extracted_grammar` of linked WhatsApp session via JOIN
- Sets `note_confirmed: true` on suggestions where `node_id` appears in Yoshi's grammar list
- Rendered as `· ✓ Yoshi` badge on 集中 sprint suggestion cards

### WhatsApp paste date fix — `lessonNotesPanelHandlePaste()`
- Session date now parsed from first dated WhatsApp message (`DD.MM.YY` format)
- Falls back to today only if no dated messages found

### lessonNotesEnsureDbRow fixes
- `SELECT` now filters `AND source='whatsapp'` — was accidentally matching recording rows
- `last_insert_rowid()` now fetched via `window.db.query` not `window.db.get` (was returning 0)
- Auto-link guard relaxed: `AND (audio_duration_s > 600 OR audio_duration_s IS NULL)`

### audio_duration_s backfill
- All existing recording sessions backfilled via `window.lessonAPI.finaliseRecording()`
- Sessions 59/66/67/69/70/71/72/80 all written

### First real WhatsApp import
- Session 82 (whatsapp, date 2026-06-22) linked to session 80 (recording, 2658 turns)
- lesson_phrases: 46 grammar + 16 phrase + 3 word with lesson_id=82
- turn_id populated on 12/19 phrase rows
- extracted_grammar: 22 node IDs

## NoM Pipeline — Complete State (`src/features-nom.js`)

### Functions
- `nomDetectClusters(sessionId)` → raw clusters (no API)
- `nomClassifyClusters(clusters)` → confirmed clusters with topic/severity/node_id
- `nomRankSuggestions(classified, topN=3)` → scored, deduplicated suggestions
- `nomRunAndCache(sessionId)` → full pipeline + note_confirmed + cache write
- `nomRenderSuggestions()` → reads cache, renders cards in 集中 setup (no API)
- `nomTestSession80()` → DevTools test harness, 7/7 recall on session 80

### Detection rules (five, client-side, no API)
1. Dense repetition — same token 4+ times in 45s
2. Morphological variation — same stem 3+ endings in 60s
3. Particle alternation — same noun 2+ particles in 30s
4. Repair markers — えーと, すみません, もう一度 etc.
5. Vocab gap — English word (Latin ≥3 chars) + repetitive Japanese search in 90s

### note_confirmed logic
- After ranking, queries `extracted_grammar` of linked WhatsApp session
- `note_confirmed: true` when suggestion `node_id` ∈ Yoshi's `extracted_grammar`
- Rendered as `· ✓ Yoshi` on card subtitle

### Deferred: Levenshtein confirmation layer (full)
- Temporal + content match: NoM cluster offset X → lesson_phrases turn_id within ±30s → DL match
- Prerequisites met (turn_id populated, WA data in DB)
- Needs multiple sessions to tune and validate

## lesson_sessions — Link Architecture
- One lesson = one WhatsApp row (`source='whatsapp'`) as anchor
- Recording row (`source='recording'`) has `linked_session_id` → WhatsApp row id
- Auto-link on paste: same-date recordings where `audio_duration_s > 600 OR IS NULL`
- Date parsed from first WhatsApp message timestamp (DD.MM.YY format)
- `lessonNotesEnsureDbRow` creates whatsapp row, sets `LessonNotesState.currentLessonId`

## SQLite Schema — v14
kv_store, corpus_entries, corpus_lookups, corpus_productions, counters,
drill_results, error_history, failure_events, grammar_mastery, kanji_ref,
learning_events, lesson_phrases, lesson_sessions, panel_sessions,
pitch_data, schema_version, srs_items, transcript_turns, transcript_vocab,
vocab_items, vocab_items_backup, vocab_srs, words, writing_sessions, writing_sittings

`lesson_sessions` key columns:
- `source` — `'whatsapp'` | `'recording'`
- `raw_content` — raw WhatsApp text
- `extracted_grammar` — JSON array of node_ids
- `linked_session_id` — recording → whatsapp anchor
- `audio_duration_s` — set by ffprobe in `lesson:finaliseRecording`

`lesson_phrases` key columns:
- `lesson_id` — FK to whatsapp lesson_sessions row
- `node_id` — Genki grammar node (grammar rows only)
- `turn_id` — FK to transcript_turns (populated by lnPopulateTurnIds via DL)
- `type` — `'phrase'` | `'word'` | `'grammar'`

DB path: ~/Library/Application Support/japanese-studio/jpstudio.db

## Pending — Priority Order

### Bugs / cleanup open
1. Video panel transcript overflow — open, with Claude Code (`video-panel-handoff.md`)
2. `shuchuActivityBtns` / `shuchuR2Btns` — always empty (low priority)

### NoM pipeline — next steps
3. Multi-session aggregation — cluster node_ids across last N sessions
4. Two-tier 集中 surface — "This week" vs "Recurring"
5. Full Levenshtein confirmation layer — temporal + content match (needs more WA data)

### Grammar coverage
6. Gold dot detail panel — node_id → lesson_phrases → source sentences
7. "Play from here" button — turn_id → audio seek (infrastructure in place)
8. Genki II node integration

### Vocab pipeline
9. corpus_productions extraction fix — single-kanji in old rows
10. Reading backfill — ~567 words still missing readings
11. Yoshi word boost — 2-day surface window after lesson import (deferred pending filter btn review)

### Future / larger features
12. FLUENCY_432 emitter — 4/3/2 speaking session wiring
13. Layer 6 — grammar drill + writing prompt with top-N words
14. Book vocab import (18 pages, OCR artifact, deferred)
15. Sight-reading feature (from scratch)
16. Satellite (jpsat) redesign
17. `lesson_sessions` full consolidation — single row per lesson (Claude Code)
18. Stale docs cleanup — `context-static.md`, `html-map.md`

## Vocab System — Complete State

### All pipelines live
| Source | Trigger | Destination |
|---|---|---|
| yoshi_phrases | LESSON_EXTRACTED → initLessonVocabListener | vocab_items |
| yoshi_vocab | lessonNotesExtractVocabSilent direct write | vocab_items |
| writing | WRITING_SUBMITTED → extractWritingVocabToItems (Claude) | vocab_items |
| lookup | VOCAB_LOOKUP → initLookupVocabListener (≥2, len 2-10) | vocab_items |
| n5 | one-time backfill | vocab_items |

### Weighting
- New words: `_base = entry_weight × source_weight`
- Reviewed words: `_base = 0.35` FLAT
- Direction weight and prep_boost (1.5×) applied to both
- Session pool: all reviewed due words + max 5 new words, sorted by effective weight
- Source weights: yoshi=1.0, writing=0.9, lookup=0.6, n5=0.3

### SRS — SM-2
- Known: interval = floor(interval × ease), ease +0.1
- Got it: interval = floor(interval × max(1.3, ease − 0.10))
- Again: interval = 1, ease −0.15 (min 1.3)

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
