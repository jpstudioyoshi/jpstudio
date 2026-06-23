# Japanese Studio — Session Context
Last updated: 2026-06-23 (session 51 — turn_id population, DL matching, note_confirmed, auto-link fixes)

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

## Session 51 Changes (2026-06-23)

### turn_id population — `lnPopulateTurnIds(waLessonId, recSessionId)`
- Added to `src/features-lesson-notes.js`
- Damerau-Levenshtein (`_dlDistance`) — handles transpositions (Whisper phonetic swaps)
- Matches `lesson_phrases` (type != grammar) to `transcript_turns` by content similarity
- Needle: first 20 chars of phrase; haystack window: needle.length + 4 chars
- Threshold: distance ≤ max(3, floor(needle.length × 0.3))
- Hit rate on session 80/82: 12/19 (7 misses are genuinely absent from transcript)
- Auto-wired in `Orchestrator.js` after `SESSION_SAVED` — fires non-blocking post-transcription
- Also registered on `App` for manual DevTools calls: `await lnPopulateTurnIds(waId, recId)`

### note_confirmed signal — `nomRunAndCache()`
- After ranking, queries `extracted_grammar` of linked WhatsApp session
- Sets `note_confirmed: true` on suggestions where `node_id` appears in Yoshi's grammar list
- Rendered as `· ✓ Yoshi` badge on 集中 sprint suggestion cards
- No API calls — one DB join query

### WhatsApp paste date fix — `lessonNotesPanelHandlePaste()`
- Session date now parsed from first dated WhatsApp message (`DD.MM.YY` format)
- Falls back to today only if no dated messages found
- Fixes auto-link failing due to date mismatch between notes and recording

### lessonNotesEnsureDbRow fixes
- `SELECT` now filters `AND source='whatsapp'` — was accidentally matching recording rows
- `last_insert_rowid()` now fetched via `window.db.query` not `window.db.get` (was returning 0)
- Auto-link guard relaxed: `AND (audio_duration_s > 600 OR audio_duration_s IS NULL)`

### audio_duration_s backfill
- All existing recording sessions backfilled via `window.lessonAPI.finaliseRecording()`
- ffprobe works correctly — was never being called for historical sessions
- Durations confirmed: sessions 59/66/67/69/70/71/72 all written

### Dead call removed
- `lessonNotesUpdateDropdown()` — called at end of paste handler, function never existed

### First real WhatsApp import
- Session 82 (whatsapp, date 2026-06-22) linked to session 80 (recording, 2658 turns)
- lesson_phrases populated: 46 grammar + 16 phrase + 3 word with lesson_id=82
- turn_id populated on 12/19 phrase rows
- extracted_grammar: 22 node IDs written to lesson_sessions

## Session 50 Changes (2026-06-22)

### NoM pipeline — complete (`src/features-nom.js`)

New file. Zero API calls in detection phase. ~14 LLM calls per session in classification.

#### Rule-based cluster detection — `nomDetectClusters(sessionId)`
Five rules over `transcript_turns`:
1. **Dense repetition** — same surface token 4+ times in 45s window
2. **Morphological variation** — same hiragana stem (≥3 chars) with 3+ distinct endings in 60s
3. **Particle alternation** — same noun with 2+ different particles in 30s
4. **Repair markers** — explicit hesitation words (`えーと`, `すみません`, `もう一度`, etc.)
5. **Vocab gap** — English word (Latin ≥3 chars) followed by repetitive Japanese search in 90s

Pre-processing:
- `_nomScrub(turns)` — in-memory hallucination filter (same threshold as Orchestrator:
  tokens appearing ≥5 times, keep only first) + stoplist (`うん`, `はい`, `ええ`, etc.)
- `_mergeClusters` — clusters within 20s merged; composite `ruleType` string preserved

Tested against session 80 (7 known episodes from handoff doc): **7/7 recall**.

#### LLM classification — `nomClassifyClusters(clusters)`
- One call per cluster, 12 turns max context, ~120 tokens output
- Returns `{isNom, topic, severity 1-3, node_id}` per cluster
- Validates `node_id` against `NOM_NODE_IDS` list (Genki I/II nodes)
- False positives (lone `すみません`, `use` L1 trigger) correctly rejected
- Session 80: 12/14 confirmed, 2 rejected

#### Ranking — `nomRankSuggestions(classified, topN=3)`
- Groups by `node_id`; null node_ids get individual buckets
- Score: `severity × 3 + episode_count × 2`
- Returns top N with `{topic, node_id, severity, episode_count, example_offset_ms, score}`

#### Cache + UI — `nomRunAndCache(sessionId)` / `nomRenderSuggestions()`
- `nomRunAndCache` runs full pipeline, persists to `kv_store` key `nom_suggestions`
- `nomRenderSuggestions` reads cache, renders cards in 集中 setup panel (no API calls)
- "Analyse last lesson" button injected into `shuchu-setup` by `shuchuOnOpen`
- Card click fills `shuchuTopicInput` → user presses Start
- Status messages via `#nomAnalyseStatus` span
- Cards show `· ✓ Yoshi` badge when `note_confirmed: true`

#### Test harness — `nomTestSession80()`
- Run in DevTools: queries last recording session, compares against 7 known episodes
- Prints recall score + per-cluster offsets

## NoM Pipeline — Complete State (`src/features-nom.js`)

### Functions
- `nomDetectClusters(sessionId)` → raw clusters (no API)
- `nomClassifyClusters(clusters)` → confirmed clusters with topic/severity/node_id
- `nomRankSuggestions(classified, topN=3)` → scored, deduplicated suggestions
- `nomRunAndCache(sessionId)` → full pipeline + note_confirmed + cache write
- `nomRenderSuggestions()` → reads cache, renders cards in 集中 setup (no API)
- `nomTestSession80()` → DevTools test harness, 7/7 recall on session 80

### note_confirmed logic
- After ranking, queries `extracted_grammar` of linked WhatsApp session via JOIN
- `note_confirmed: true` when suggestion `node_id` ∈ Yoshi's `extracted_grammar`
- Rendered as `· ✓ Yoshi` on card subtitle

### Constants
- `NOM_RULE` — rule type labels
- `NOM_CFG` — tuneable thresholds (window sizes, min counts)
- `NOM_STOPLIST` — filler words excluded from detection
- `NOM_REPAIR_MARKERS` — explicit hesitation/repair words
- `NOM_PARTICLES` — particles tracked for alternation rule
- `NOM_L1_PATTERN` — English-only `/[a-zA-Z]{3,}/`
- `NOM_HALLUCINATION_THRESHOLD = 5`
- `NOM_NODE_IDS` — valid Genki I/II node ids for classification prompt
- `NOM_CACHE_KEY = 'nom_suggestions'`

## Lesson Recording — Complete State
- `AudioService.js` handles mic recording
- `Orchestrator.startLesson()` / `stopLesson()` coordinate lifecycle
- Audio saved as WebM chunks to iCloud with ffmpeg reindex + ffprobe duration on stop
- `audio_duration_s` written by `lesson:finaliseRecording` IPC handler in main.js
- Single-channel recording (mic only)
- **Mic device priority**: USB/external wired → built-in Mac mic → any non-virtual
- Post-transcription hook: `lnPopulateTurnIds` fires automatically via Orchestrator

## lesson_sessions — Link Architecture
- One lesson = one WhatsApp row (`source='whatsapp'`) as anchor
- Recording row (`source='recording'`) has `linked_session_id` → WhatsApp row id
- Auto-link on paste: same-date recordings where `audio_duration_s > 600 OR IS NULL`
- `lessonNotesEnsureDbRow` creates whatsapp row, sets `LessonNotesState.currentLessonId`
- Date parsed from first WhatsApp message timestamp (DD.MM.YY format)

## Grammar Node Mapping Pipeline — COMPLETE
- Gold dot indicators on Genki node pills (per-session)
- `lesson_phrases` has `node_id` + `turn_id` columns
- `turn_id` now auto-populated via DL matching post-transcription
- Remaining: detail panel (source sentences); "Play from here" button

## SQLite Schema — v14
kv_store, corpus_entries, corpus_lookups, corpus_productions, counters,
drill_results, error_history, failure_events, grammar_mastery, kanji_ref,
learning_events, lesson_phrases, lesson_sessions, panel_sessions,
pitch_data, schema_version, srs_items, transcript_turns, transcript_vocab,
vocab_items, vocab_items_backup, vocab_srs, words, writing_sessions, writing_sittings

`lesson_sessions` key columns:
- `source` — `'whatsapp'` (notes import) or `'recording'` (audio session)
- `raw_content` — raw WhatsApp text (persisted at import)
- `extracted_grammar` — JSON array of node_ids
- `linked_session_id` — recording row points to its WhatsApp anchor row (v14)
- `audio_duration_s` — set by ffprobe in `lesson:finaliseRecording` IPC handler

`lesson_phrases` key columns:
- `lesson_id` — FK to whatsapp lesson_sessions row
- `node_id` — Genki grammar node (grammar type rows only)
- `turn_id` — FK to transcript_turns row (populated by lnPopulateTurnIds via DL)
- `type` — `'phrase'` | `'word'` | `'grammar'`

DB path: ~/Library/Application Support/japanese-studio/jpstudio.db

## Pending — Priority Order

### Bugs / cleanup open
1. Video panel transcript overflow — open, with Claude Code (`video-panel-handoff.md`)
2. `shuchuActivityBtns` / `shuchuR2Btns` — always empty (low priority)

### NoM pipeline — next steps
3. Multi-session aggregation — cluster node_ids across last N sessions to surface
   recurring patterns Yoshi hasn't written down (historical blind spots)
4. Two-tier 集中 surface — "This week" (from notes) vs "Recurring" (from transcript)
5. Levenshtein confirmation layer — DL match Whisper tokens to Yoshi note content at
   same timestamp; `turn_id` is now populated so prerequisite is met;
   still needs multiple sessions with real WhatsApp data
6. Theme segmentation — one API call per session, section markers for timeline navigation

### Grammar coverage
7. Gold dot detail panel — needs node_id query on lesson_phrases → source sentences
8. "Play from here" button — turn_id → audio seek (infrastructure now in place)
9. Genki II node integration

### Vocab pipeline
10. corpus_productions extraction fix — single-kanji in old rows
11. Reading backfill — ~567 words still missing readings

### Future / larger features
12. FLUENCY_432 emitter — 4/3/2 speaking session wiring
13. Layer 6 — grammar drill + writing prompt with top-N words
14. Book vocab import (18 pages, OCR artifact, deferred)
15. Sight-reading feature (from scratch)
16. Satellite (jpsat) redesign
17. `lesson_sessions` full consolidation — single row per lesson (Claude Code, larger job)
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
- New words (_isNew = srs_due IS NULL): `_base = entry_weight × source_weight`
- Reviewed words (_isNew = false): `_base = 0.35` FLAT (source no longer matters)
- Direction weight and prep_boost (1.5×) still applied to both
- Session pool: all reviewed due words + max 5 new words, sorted by effective weight
- Source weights for new words: yoshi=1.0, writing=0.9, lookup=0.6, n5=0.3

### SRS — SM-2
- Known: interval = floor(interval × ease), ease +0.1
- Got it: interval = floor(interval × max(1.3, ease − 0.10))
- Again: interval = 1, due tomorrow, ease −0.15 (min 1.3)

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
