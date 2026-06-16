# Japanese Studio — Session Context
Last updated: 2026-06-16 (session 42 — major cleanup sprint: 8 items completed,
schema v12+v13, fragment pos, gold dot dismiss, audit-latest.md)

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
`html-map.md` in project Knowledge — updated session 39: removed the stale
#timesDrillOverlay/#compPanel/#listenProgressPanel/#listenModeSelect entries (session 35
leftovers, features-times.js deleted entirely); `progressSidebarControls` and
`srsToggleBtn`/`srsDueBadge` confirmed live and kept. Also confirmed in session 38:
#panel-teform never existed (TE-form drill was already-orphaned JS only); the session-38
35-function duplicate panel had no corresponding HTML container either — purely orphaned
JS, no HTML cleanup needed from that session.

**Session 40 additions (集中 panel):**
- `panel-shuchu` — Focus Sprint panel container
- Sidebar button between 質問 and 筆順

**Session 25-30 additions (still active):**
- vocabWtYoshiPhrases, vocabWtYoshiVocab, vocabWtWriting, vocabWtLookup, vocabWtN5
- vocabWtDirJpEn, vocabWtDirEnJp, vocabWtDirSpeaking
- vocabIntYoshiPhrases/Vocab/Writing/Lookup/N5, vocabThreshLookup/Decay/SessionSize, vocabWeightsMsg
- vcDirectionBtn — JP→EN / EN→JP / Speaking toggle
- vcTypeToggle — Type mode toggle button
- vocabFlipControls — flip card buttons (hidden in type mode)
- vocabTypeControls — text entry area (shown in type mode)
- vocabTypeInput — text input field
- vocabTypeResult — result display (correct answer shown on wrong)
- vocabTypeNextBtn — Next button shown after wrong answer
- .vocab-source-filter checkboxes (Yoshi/Writing/Lookup/N5) — ACTIVE, all checked by default, Reset button
- .vocab-pos-filter checkboxes (Verbs/Nouns/い-adj/な-adj/Adverbs/Phrases) — ACTIVE, all checked by default, Reset button
- conjPoolInfo span — shows "Pool: X known + Y frequency" on drill start

## Sidebar — COMPLETE
- #strandMini (4 live proportional coloured bars, S1 teal / S2 gold / S3 muted blue / S4 green)
  replaces the old 進捗 sidebar button — clicking opens the progress panel
- Settings button (⚙) moved to bottom of sidebar
- Nav restructured: 翻訳 lives in the quick translate bar, ヨシ moved into the sidebar
- renderStrandMini() in features-progress.js, called on app init and on progress panel update

## Terminal Workflow
- python3 - << 'PYEOF' for multi-line edits
- Always jp && prefix
- repr() to inspect match strings before retrying
- Blank lines in match strings cause MATCH FAILED
- pbcopy swallows terminal output
- SQLite DB at ~/Library/Application Support/japanese-studio/jpstudio.db
- window.db.query() requires explicit [] params
- Close Electron before SQLite writes (reads via sqlite3 CLI are fine with app running, but
  sql.js holds the live DB in memory — counts may be slightly stale if app has unsaved
  in-memory changes)
- Long conversations: use Claude Code for multi-line JS string replacements
- DevTools console (Cmd+Option+I) for in-app JS — not terminal
- window.db.run() returns {changes: 0} even on successful batch INSERTs — not an error indicator
- Files with giant single lines break `view` even at 1-3 lines — use grep, hand edits to Code

## Dead-Code Lookup Tooling — added session 37
- check-syntax.js computes per function: `callers` (word-frequency count across all source
  files, minus the definition itself) and `exported` (true if in window[] or App registry
  anywhere). Written to index.json alongside name/file/line/desc.
- Audit file: now writes to `audit-latest.md` (single overwritten file, not dated)
- find.js shows `[callers=N exported=yes/no]` for function-type results.
  Usage: `node find.js <name> function` → instant "is this dead?" answer, no grep needed.
- **Session 38 result: 18 → 0 candidates** (index.json 1294 → 1228 entries, −66).
- Known blind spot: indented/nested function declarations not captured by extractor.
  "exported=true" also doesn't mean "reachable" — an App-registry entry with zero real
  callers is still dead.
- **Sole remaining audit candidate:** `customTranscribe` — INVESTIGATED session 42: NOT dead.
  Called as closure in onstop handler, auditor misses it. Keep.

## Session 38 — Major dead-code purge (2026-06-14)
8 commits, net −1768 lines, all syntax-checked clean (40/40), 18→0 dead candidates.

## Session 42 — Cleanup sprint (2026-06-16)
Commits: 885c5b7 → efaa25b, 8 commits.

1. **集中 shuchu** — further-question widget, ref overlay, confirm-reset, kana compose,
   translate/error-correct always-to-round-2, kanji-strip fix (committed, was pending)
2. **dead-code-findings.md** deleted from repo
3. **Schema v12** — `node_id TEXT` + `turn_id INTEGER` on `lesson_phrases`; grammar
   extraction pipeline (`lessonNotesExtractGrammarSilent`) now writes `node_id` per phrase
4. **Schema v13** — dropped 4 dead tables: transcript_sentences, agent_decisions,
   conversation_sessions, frames; removed dead transcript_vocab→srs_items block from StudentModel
5. **audit-latest.md** — check-syntax.js now writes single overwritten file instead of dated
6. **fragment pos** — 110 vocab_items with 〜 in word backfilled to pos='fragment';
   yoshi_vocab extraction pipeline now tags 〜 patterns as fragment at insert time
7. **Gold dot dismiss** — click gold dot to hide until next lesson; persisted via
   GRAMMAR_GOLD_DISMISSED in Storage; cleared when lessonNotesExtractGrammarSilent runs
8. **CONJ_FORMS / buildConjVerbPool / DrillSRS.record** — confirmed already done (c4c2c17)
9. **customTranscribe** — confirmed not dead, closed ticket

## 集中 Focus Sprint Panel — Complete
Panel ID: `panel-shuchu`. Full flow:
1. Topic input → Claude generates sprint JSON (topic, intro, 6 activities, round2_pool)
2. Intro card with reference content
3. Activities: multiple_choice, gap_fill, translate_to_jp, error_correct, self_assess
4. translate_to_jp / error_correct always go to round 2 pool
5. Further question widget on every feedback item
6. Round 2: up to 6 items from pre-generated pool targeting weak points
7. Free write: kana-enabled compose input → API feedback (max_tokens: 800)
8. Results summary with score and review list
9. 参考 button: shows intro card overlay without losing place
10. New Sprint button with confirm dialog
11. Sprint JSON persisted via Storage.setJSON('shuchu_last_sprint')

## Vocab pipeline status check (session 42)
- **Lookup-source meaning backfill: 0 missing** — fully done.
- **Reading backfill: 181 missing** — pre-fix legacy, harmless.
- **fragment pos: 110 rows backfilled** — pipeline fixed for new extractions.
- **null pos: ~210 remaining** — phrases/sentences without 〜, treated as untagged phrases,
  excluded from vocab drill unless Phrases filter checked. Working as designed.
- **counter_suffix: unused column** — no code reads it, no feature consumes it. Deprioritised.

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
            conjunction, counter, phrase, fragment (new: 〜 patterns)

### vocab_srs schema (v11)
id, vocab_id (FK → vocab_items.id), direction, srs_interval, srs_ease, srs_due,
srs_graduated, last_reviewed — UNIQUE(vocab_id, direction)
SRS rows created lazily on first review via INSERT ... ON CONFLICT DO UPDATE

### lesson_phrases schema (v12)
id, lesson_id, phrase, reading, meaning, example, type, created_at, node_id, turn_id
- node_id: populated by grammar extraction pipeline (first grammarNodeId per pattern)
- turn_id: NULL for now — reserved for transcript→audio seek chain

## Grammar Node Mapping Pipeline — COMPLETE
- `lessonNotesExtractGrammarSilent` injects node list into Claude prompt, returns
  `grammarNodeIds`, batch-INSERTs to `lesson_phrases` with node_id, writes to
  `lesson_sessions.extracted_grammar`
- Gold dot indicators on Genki node pills in progress panel (per-session, not cumulative)
- Gold dot dismiss: click to hide until next lesson (GRAMMAR_GOLD_DISMISSED in Storage)
- Remaining: detail panel showing source sentences; turn_id population; dismiss button UI

## Gold Dot → Transcript Chain (designed, partial)
Full chain: gold dot → node_id → lesson_phrases → lesson_id → lesson_sessions → turn_id
→ transcript_turns → audio seek
- lesson_phrases now has node_id + turn_id columns (v12)
- turn_id population pending (needs matching at extraction time)
- Gold dot detail panel UI pending (query lesson_phrases WHERE node_id = ?)
- "Play from here" button pending (turn_id → audio seek)
- This same chain feeds the 集中 sprint suggestion pipeline

## Conjugation Drill — Complete State
- `CONJ_FORMS` — 13 fixed transformation types in features-grammar.js
- `buildConjVerbPool()` — async, two-step: vocab_items SRS-ranked (up to 60) topped up
  by words frequency (to 100 total); exported to window
- `startConjDrillG()` — calls buildConjVerbPool, merges into _conjExtraVerbs
- `DrillSRS.record()` — called in checkConjG on correct and incorrect answers
- Weighted random queue (GrammarErrors.weight) biases toward error-prone forms
- ConjSession: daily session persistence, resume on restart

### Conjugation SRS — srs_items drill_type='conj_forms'
- 13 CONJ_FORMS items as item_keys
- DrillSRS.record(STORAGE_KEYS.DRILL_SRS_CONJ, item.key, correct) called each answer
- Form selection: weighted random (not hard SRS-due toggle) — sufficient for now

## Writing Sitting Boost — Complete
- On save with ≥5 sentences → INSERT writing_sittings with expires_at = +3 days
- loadVocabItemsDeck boosts lookup words ±2 hours from sitting by 1.5×

## SQLite Schema (current tables) — v13
kv_store, corpus_entries, corpus_lookups, corpus_productions, counters,
drill_results, error_history, failure_events, grammar_mastery, kanji_ref,
kv_store, learning_events, lesson_phrases, lesson_sessions, panel_sessions,
pitch_data, schema_version, srs_items, transcript_turns, transcript_vocab,
vocab_items, vocab_items_backup, vocab_srs, vocab_srs, words, writing_sessions,
writing_sittings

Schema version: 13
DB path: ~/Library/Application Support/japanese-studio/jpstudio.db

Dropped in v13: transcript_sentences, agent_decisions, conversation_sessions, frames

## kvAPI keys
STRAND_WEIGHTS, VOCAB_WEIGHTS, VOCAB_THRESHOLDS, VOCAB_INTERVALS,
VOCAB_MIGRATION_V1, VOCAB_LESSON_BACKFILL_V1, VOCAB_LOOKUPS_BACKFILL_V1, VOCAB_N5_BACKFILL_V1,
GRAMMAR_GOLD_DISMISSED (new: gold dot dismiss, cleared on new lesson import)

## Vocabulary Model — Canonical Definition
- **Horizon** — in `words` table (N5 reference), not yet in `vocab_items`
- **Target** — in `vocab_items`, not yet graduated in both jp_en AND en_jp
- **Active** — graduated in both jp_en AND en_jp (`srs_graduated=1` in vocab_srs for both)

Speaking direction graduation tracked separately — can lag behind recognition.

## Pending — Priority Order

### Grammar coverage
1. Gold dot detail panel — query `lesson_phrases WHERE node_id = ?` to show source sentences
2. turn_id population — match phrases to transcript_turns at extraction time
3. "Play from here" button — turn_id → audio seek (lnLoadTwoColumnTimeline pattern)
4. Genki II node integration
5. Grammar node timestamps → transcript → sprint suggestion pipeline

### Dead code / cleanup
6. `rtCompareBtn` (4 refs in features-voice.js) — tie into FLUENCY_432 or remove
7. `vtWatch*` localStorage — low priority, working fine, consider DB unification later
8. `customTranscribe` — confirmed NOT dead, close ticket

### Vocab pipeline
9. corpus_productions extraction fix (single-kanji in old rows)

### Future / larger features
10. FLUENCY_432 emitter — 4/3/2 speaking session wiring
11. Layer 6 — grammar drill + writing prompt with top-N words
12. Book vocab import (18 pages, OCR artifact, deferred)
13. Sight-reading feature (to be built from scratch)
14. Satellite (jpsat) redesign — warm parchment scheme, rebuilt HTML shell, verify Gist sync
