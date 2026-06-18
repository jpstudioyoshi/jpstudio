# Japanese Studio — Session Context
Last updated: 2026-06-18 (session 43 — 集中 split-generation, kana focus sync fix,
kanji session cache, spacebar video fix, panel-video2 ref fixes, gramSent hiragana-for-kanji,
gramSent sentence variety seed)

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
  session Claude writes context-session.md directly (see Context File Update Process).
- Some files contain extremely long single lines (giant HTML template-literal strings, e.g.
  features-lesson-notes.js). The `view` tool fails ("Tool result too large") even at 1-3 line
  ranges for these. Use grep (with line-number context) instead of view for anything near such
  functions; hand removals to Claude Code rather than python heredoc when the exact text can't
  be read.

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
Session 40: added `panel-shuchu` + sidebar button between 質問 and 筆順.

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
- **Sole audit candidate: customTranscribe — confirmed NOT dead, close ticket**

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

3. **Kana focus desync fix** (features-kana.js):
   - Focus listener in `kanaToolbar()` now reads active button state as ground truth
   - Uses `btn-active` / `btn-active-gold` classes (from `setButtonGroupActive`)
   - Fixes: clicking into middle of existing text no longer resets mode to romaji
   - Applies globally to all `kanaToolbar()` inputs (quick translate, chat, writing, grammar, etc.)

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

### Vocab pipeline
9. corpus_productions extraction fix (single-kanji in old rows)

### Future / larger features
10. FLUENCY_432 emitter — 4/3/2 speaking session wiring
11. Layer 6 — grammar drill + writing prompt with top-N words
12. Book vocab import (18 pages, OCR artifact, deferred)
13. Sight-reading feature (to be built from scratch)
14. Satellite (jpsat) redesign — warm parchment scheme, rebuilt HTML shell, verify Gist sync
