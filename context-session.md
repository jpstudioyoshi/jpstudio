# Japanese Studio — Session Context
Last updated: 2026-06-22 (session 50 — NoM pipeline complete: cluster detection,
LLM classification, ranking, 集中 sprint suggestion cards)

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

#### Test harness — `nomTestSession80()`
- Run in DevTools: queries last recording session, compares against 7 known episodes
- Prints recall score + per-cluster offsets

#### Data fix
- Session 80 `transcript_turns`: 109 hallucination rows deleted directly in SQLite
  (`猫はお尻を探しています` reduced from 110 → 1 occurrence)

### Architecture decisions (session 50)

#### Signal weighting (discussed, not yet built)
- **Yoshi notes (recent)** → primary signal for current sprint suggestions
- **Transcript clusters (historical, multi-session)** → surfaces recurring patterns
  Yoshi didn't write down — potential blind spots
- **Both agree** → highest confidence
- Future: two-tier 集中 surface ("This week" from notes vs "Recurring" from transcript)

#### Levenshtein confirmation (deferred)
- Whisper transcript tokens vs Yoshi note content at same timestamp
- Close orthographic match = note is a correction of exactly what broke down
- Requires `turn_id` population in `lesson_phrases` first (step 6 below)
- Blocks on: WhatsApp notes in DB (none exist yet — `lesson_sessions` has no `whatsapp` rows)

#### WhatsApp notes status
- `lesson_sessions` contains only `source='recording'` rows — no WhatsApp rows exist
- `raw_content` persistence wired (session 49) but no imports have happened since
- `linked_session_id` is null everywhere — auto-link code in place but untested
- Note confirmation signal deferred until a real WhatsApp import occurs

### L1 pattern clarification
- German is transcribed by Whisper as hiragana phonetically — no Latin chars in transcript
- `NOM_L1_PATTERN` is English-only: `/[a-zA-Z]{3,}/`
- Common English words (`OK`, `yes`, `no`) added to `NOM_STOPLIST`

## Session 49 Changes (2026-06-22)

### UI fix
- **`listenTrackCount` span removed** (`index.html`) — was hidden behind the Clear button
  in the listen panel playlist header. Redundant — playlist items are visible.

### NoM pipeline foundations

#### Hallucination scrubber (`src/Orchestrator.js`)
- Added `_scrubHallucinations(turns)` — keeps only the first occurrence of any string
  appearing 5+ times in the transcript. Fires after `_currentSession.merge()` before save.
- Session 80 cleaned manually: 1039 → 429 turns; `transcript_json` rebuilt from clean
  `transcript_turns`; `transcript_turns` deduplicated in DB.

#### `raw_content` persistence (`src/features-lesson-notes.js`)
- WhatsApp notes raw text now written to `lesson_sessions.raw_content` at extraction time.

#### Session linking (Claude Code job — completed)
- Added `linked_session_id INTEGER` column to `lesson_sessions` (schema v14).
- Fixed `source` value: WhatsApp imports now use `source='whatsapp'`.
- Auto-link on import: same-date recordings with `audio_duration_s > 600`.

## Session 47/48 Changes (2026-06-22)

### Dead-code cleanup (all committed)
- **`_rtkMnemonicCache` ReferenceError** (`features-stroke.js`) — fixed.
- **Kana debug instrumentation** (`features-kana.js`) — removed.
- **`rtCompareBtn` dead refs** (`features-voice.js`) — 4 refs removed.
- **Dead fullscreen CSS** (`style.css`) — removed (~180 lines, wrong panel id).
- **`vtCloseLineTranslate` dead branch** (`features-video.js`) — simplified.

### Conjugation SRS-due toggle (features-grammar.js, index.html)
- `conjSrsModeBtn` — filters queue to only SRS-due form keys; "Nothing due" if empty.

### Vocab drill: Yoshi word flooding fix (core-vocab.js)
- Reviewed words get flat `_base = 0.35` regardless of source.
- New words capped at `MAX_NEW = 5` per session.

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
Debug instrumentation removed (session 47/48).

## Conjugation Drill — Complete State
- `CONJ_FORMS` — 13 fixed transformation types
- `buildConjVerbPool()` — vocab_items SRS-ranked (up to 60) topped up by frequency (100)
- `DrillSRS.record()` — called on each answer, writes to srs_items drill_type='conj_forms'
- Weighted random queue (GrammarErrors.weight) biases toward error-prone forms
- **SRS-due toggle**: `conjSrsModeBtn` — filters queue to only due form keys

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

## NoM Pipeline — Complete State (`src/features-nom.js`)

### Functions
- `nomDetectClusters(sessionId)` → raw clusters (no API)
- `nomClassifyClusters(clusters)` → confirmed clusters with topic/severity/node_id
- `nomRankSuggestions(classified, topN=3)` → scored, deduplicated suggestions
- `nomRunAndCache(sessionId)` → runs pipeline, writes to kv_store `nom_suggestions`
- `nomRenderSuggestions()` → reads cache, renders cards in 集中 setup (no API)
- `nomTestSession80()` → DevTools test harness, 7/7 recall on session 80

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

### Card UI
- "Analyse last lesson" button injected into `shuchu-setup` on panel open
- Cards show topic, episode count, severity dots (●●● colour-coded)
- Click → fills `shuchuTopicInput`, focuses Start button

## Lesson Recording — Complete State
- `AudioService.js` handles mic recording
- `Orchestrator.startLesson()` / `stopLesson()` coordinate lifecycle
- Audio saved as WebM chunks to iCloud with ffmpeg reindex + ffprobe duration on stop
- Single-channel recording (mic only)
- **Mic device priority**: USB/external wired → built-in Mac mic → any non-virtual

## Grammar Node Mapping Pipeline — COMPLETE
- Gold dot indicators on Genki node pills (per-session)
- lesson_phrases has node_id + turn_id columns
- Remaining: detail panel (source sentences); turn_id population; "Play from here"

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

DB path: ~/Library/Application Support/japanese-studio/jpstudio.db

## Pending — Priority Order

### Bugs / cleanup open
1. Video panel transcript overflow — open, with Claude Code (`video-panel-handoff.md`)
2. `shuchuActivityBtns` / `shuchuR2Btns` — always empty (low priority)

### NoM pipeline — next steps
3. `turn_id` population — match phrases to transcript_turns at extraction time
4. Levenshtein confirmation — Whisper token vs Yoshi note content at same timestamp;
   requires turn_id + WhatsApp rows in DB (none exist yet)
5. Note confirmation signal — `note_confirmed: true` on suggestions where node_id
   matches `extracted_grammar` of linked WhatsApp session
6. Multi-session aggregation — cluster node_ids across last N sessions to surface
   recurring patterns Yoshi hasn't written down (historical blind spots)
7. Two-tier 集中 surface — "This week" (from notes) vs "Recurring" (from transcript)
8. Theme segmentation — one API call per session, section markers for timeline navigation

### Grammar coverage (all blocked on data/infra)
9. Gold dot detail panel — needs node_id query on lesson_phrases → source sentences
10. "Play from here" button — turn_id → audio seek (session linking unblocks this)
11. Genki II node integration

### Vocab pipeline
12. corpus_productions extraction fix — single-kanji in old rows

### Future / larger features
13. FLUENCY_432 emitter — 4/3/2 speaking session wiring
14. Layer 6 — grammar drill + writing prompt with top-N words
15. Book vocab import (18 pages, OCR artifact, deferred)
16. Sight-reading feature (from scratch)
17. Satellite (jpsat) redesign
18. `lesson_sessions` full consolidation — single row per lesson (Claude Code, larger job)

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
