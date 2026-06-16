# Japanese Studio — Session Context
Last updated: 2026-06-16 (session 40 — 集中 focus sprint panel built; conjugation SRS
foundations laid; Settings Context tab removed; optIrrG default-checked;
dead-code-findings.md reconciliation complete; commit bundle pending)

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
- Audit file's "Likely dead candidates" section: functions with `callers=0` and
  `exported=false`, grouped by file. Regenerates every commit (pre-commit hook), no extra
  runs or API cost.
- find.js shows `[callers=N exported=yes/no]` for function-type results.
  Usage: `node find.js <name> function` → instant "is this dead?" answer, no grep needed.
- **Session 38 result: 18 → 0 candidates** (index.json 1294 → 1228 entries, −66).
- Known blind spot: indented/nested function declarations not captured by extractor.
  "exported=true" also doesn't mean "reachable" — an App-registry entry with zero real
  callers is still dead.
- **dead-code-findings.md reconciliation — RESOLVED session 39.** 10 items confirmed already
  gone, 7 removed (+1 cascade) via Claude Code (commit fa97564). `rtCompare` (function) gone;
  `rtCompareBtn` (element, 4 refs) remains — see Pending #17. `dead-code-findings.md` now
  safe to delete. **Sole remaining audit candidate:** `customTranscribe` — see Pending #1.

## Session 38 — Major dead-code purge (2026-06-14)
8 commits, net −1768 lines, all syntax-checked clean (40/40), 18→0 dead candidates.

1. **ln-p2 lesson-notes drill cluster** (3 commits, −559 lines, 22 functions)
2. **TE-form drill** (1 commit, −150 lines)
3. **Error-pie-chart cluster** (1 commit, −136 lines)
4. **Orphaned duplicate lesson-notes panel — "ln* cluster"** (1 commit, −820 lines, 35 functions)
   Kept: yoshiParseWhatsapp (4 live external callers in features-ln-p2.js)
5. **lessonNotesRenderFullDoc + cascade** (2 commits, −103 lines)

## Session 39 — Documentation tidy-up + dead-code-findings.md reconciliation (2026-06-14)

- context-static.md: schema bumped to v11, file-size table corrected, stale entries removed.
- html-map.md: removed dead overlay/panel entries from session 35.
- Stale knowledge files removed from project Knowledge (manual).
- Local audit-*.md pile (21 gitignored daily snapshots) deleted; only 06-14 kept.
- dead-code-findings.md: 10 already gone, 7 removed (+1 cascade), commit fa97564 (8 files,
  net −261 lines). See Dead-Code Lookup Tooling above for full detail.

## Session 40 — Conjugation SRS foundations + 集中 focus sprint panel (2026-06-16)

### Misc fixes (committed)
- `optIrrG` (Irregular verb-type checkbox) now `checked` by default in index.html.
- Settings "Context" tab removed entirely: `stTabContext`/`stPaneContext`/`stContextDisplay`
  in index.html; `stRenderContext`/`stCopyContext` + `context` entries in `stSwitchTab`'s
  panes/tabs maps + App registry export, in core-foundation.js. Was vestigial — read from a
  `#claudeContext` script tag never added to index.html (rendered "undefined · undefined").
  check-syntax.js: 40 OK, 0 errors, index.json 1221→1219 (2 functions removed).

### Conjugation SRS foundations (uncommitted — bundle with next commit)
- **Storage pivot**: `conj_srs` table (schema v12) created then reverted (DROP TABLE,
  schema back to v11) before app reopened. `DrillSRS` (core-srs.js) + `srs_items` table
  already the generic SM-2 engine — no new table needed.
- `STORAGE_KEYS.DRILL_SRS_CONJ_FORMS` added (core-foundation.js ~line 1101)
- `DrillSRS._drillType` map entry: `'conj_forms'` (core-srs.js ~line 42)
- **来る potential-form fix**: こられる/こられます added in core-counters.js
- **CONJ_FORMS (13 items)** written to features-grammar.js: Present Plain, Present Negative
  Plain, Present/Negative Polite, Past Plain/Negative Plain/Polite/Negative Polite, て-form,
  Volitional Plain/Polite, Potential Plain/Polite. Passive/Causative excluded.
- check-syntax.js: 40 OK, 0 errors, dead-candidate count unchanged.
- **Next steps**: 50-verb pool query → code; drill UI toggle; wire DrillSRS.record()

### 集中 Focus Sprint panel (committed)
- Files: `src/features-shuchu.js` + panel HTML in `index.html` (id: `panel-shuchu`)
- Sidebar button added between 質問 and 筆順
- Self-contained, designed to be removable with minimal effort

**Flow:**
1. Topic string → Start
2. API call 1: generate sprint JSON (intro card, 10 activities, 8-item round 2 pool; max_tokens: 6000)
3. Intro card (key forms + examples with furigana)
4. 10 activities: `multiple_choice`, `gap_fill`, `translate_to_jp`, `error_correct`
5. Wrong answers / `translate_to_jp` → per-item analysis call (max_tokens: 300)
6. Round 2: up to 6 items from pre-generated pool targeting weak points
7. Free write: kana-enabled compose input → API feedback (max_tokens: 800)
8. Results summary with score and review list

**Key decisions:**
- `translate_to_jp` / `error_correct` always go to round 2 pool — no self-assess buttons
- "Further question" widget on every feedback item (one Q, one A, inline; max_tokens: 300)
- Sprint JSON persisted via `Storage.setJSON('shuchu_last_sprint')` — survives restart
- 参考 button: shows intro card overlay without losing place
- New Sprint button with confirm dialog

**Transcript → sprint suggestion pipeline (designed, not yet built):**
- Use `yoshiByOffset` + `audioByOffset` from `lnLoadTwoColumnTimeline` (features-ln-p2.js)
  to build `[teacher note + surrounding transcript]` blocks → Claude → 4 topic suggestions
- Prerequisite: add timestamps to grammar node extraction (unlocks this pipeline + "why is
  this in my grammar list?" feature)

## Vocab pipeline status check (session 38)
- **Lookup-source meaning backfill: 0 missing** — fully done.
- **Reading backfill: 181 missing** — pre-fix legacy (pipeline fixed 06-13/14), harmless.
- **counter_suffix: 639 missing** — open (Pending #10).
- **corpus_productions: single-kanji** in old rows — open (Pending #11).

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

### vocab_srs schema (v11)
id, vocab_id (FK → vocab_items.id), direction, srs_interval, srs_ease, srs_due,
srs_graduated, last_reviewed — UNIQUE(vocab_id, direction)
SRS rows created lazily on first review via INSERT ... ON CONFLICT DO UPDATE

### lesson_phrases schema
id, lesson_id, phrase, reading, meaning, example, type, created_at

### Drill UI — working
- Direction toggle: JP→EN / EN→JP / Speaking; Type toggle: flip card / text entry
- Text entry: correct → auto-advance 800ms, wrong → show answer, wait for Next
- Source + POS filters: active, all checked by default, Reset button
- Dynamic font scaling; writing sitting boost; strand tile updates immediately

### SRS — SM-2
- Known: interval = floor(interval × ease), ease +0.1
- Got it: interval = floor(interval × max(1.3, ease − 0.10))
- Again: interval = 1, due tomorrow, ease −0.15 (min 1.3)
- ease starts 2.5, graduated per direction in vocab_srs

### Weighting
- effective_weight = entry_weight × source_weight × direction_weight × prep_boost(1.5×)
- Fetches 200, sorts, slices to 50
- Source weights: yoshi_phrases=1.0, yoshi_vocab=1.0, writing=0.9, lookup=0.6, n5=0.3
- Direction weights: jp_en=1.0, en_jp=0.8, speaking=0.9

## Conjugation Drill — DB-driven pool (session 30)
- Step 1: vocab_items pos IN (verb/i-adj/na-adj), joined to words for verb_class, ORDER BY
  MAX(srs_ease)/MAX(srs_graduated) DESC — up to 60
- Step 2: top up to 100 from words ORDER BY frequency DESC, excluding step 1 words
- verb_class mapping: godan→u, ichidan→ru, irregular/suru→irr

### Conjugation SRS — in progress (session 40)
- 13 fixed CONJ_FORMS items as srs_items item_keys under drill_type='conj_forms'
- Verbs drawn randomly from 50-verb frequency pool at drill time
- 50-verb query: `SELECT word, reading, meaning, verb_class, frequency FROM words
  WHERE pos='verb' AND frequency IS NOT NULL ORDER BY frequency ASC LIMIT 50`
- See CONJ_SRS_DESIGN.md for original design reference (superseded by above architecture)

## Writing Sitting Boost — Complete
- On save with ≥5 sentences → INSERT writing_sittings with expires_at = +3 days
- loadVocabItemsDeck boosts lookup words ±2 hours from sitting by 1.5×

## Grammar Node Mapping Pipeline — COMPLETE (extraction + display)
- `lessonNotesExtractGrammarSilent` injects node list into Claude prompt, returns
  `grammarNodeIds`, batch-INSERTs to `lesson_phrases`, writes to `lesson_sessions.extracted_grammar`
- Gold dot indicators on Genki node pills in progress panel (per-session, not cumulative)
- Remaining: `node_id` column on `lesson_phrases` (unblocks detail panel); dismiss button;
  grammar node timestamps (prerequisite for sprint suggestion pipeline)

## Pending — Priority Order

### Dead code / cleanup
1. **customTranscribe** (features-voice-drill.js) — sole audit candidate; investigate:
   deprecated (remove) or missing wire-up (restore)?
2. **vtWatch* localStorage isolation** — consider unifying with panel_sessions/learning_events
3. **Drop 4 dead DB tables**: transcript_sentences, agent_decisions, conversation_sessions,
   frames + dead StudentModel.js transcript→srs_items block (~30 lines)
4. **check-syntax.js audit filename** — consider `audit-latest.md` (single overwritten file)
5. **dead-code-findings.md** — safe to delete from repo

### Grammar coverage
6. `node_id` column on `lesson_phrases` — unblocks gold-dot detail panel
7. Dismiss button for gold dots (hide until next lesson)
8. Genki II node integration
9. Grammar node timestamps → transcript → sprint suggestion pipeline

### Conjugation SRS
10. **Commit pending**: 来る fix + CONJ_FORMS + STORAGE_KEYS + DrillSRS entry
11. 50-verb pool query → write into features-grammar.js
12. Drill UI toggle (random-dict-item vs SRS-due-form) + wire DrillSRS.record()

### Vocab pipeline
13. counter_suffix population (639 missing)
14. corpus_productions extraction fix (single-kanji in old rows)

### Future / larger features
15. `rtCompareBtn` (4 refs in features-voice.js) — tie into FLUENCY_432 or remove
16. Layer 6 — grammar drill + writing prompt with top-N words
17. FLUENCY_432 emitter — 4/3/2 speaking session wiring
18. Book vocab import (18 pages, OCR artifact, deferred)
19. Transcript statistics — word count from transcript_turns at zero API cost
20. Sight-reading feature (to be built from scratch)

## SQLite Schema (current tables)
kv_store, frames, transcript_sentences, corpus_entries, corpus_lookups, corpus_productions,
srs_items, error_history, lesson_sessions, words, lesson_phrases, pitch_data, writing_sessions,
writing_sittings, drill_results, conversation_sessions, transcript_turns, failure_events,
agent_decisions, panel_sessions, learning_events, grammar_mastery, transcript_vocab, vocab_items,
vocab_srs, vocab_items_backup, kanji_ref, schema_version

Schema version: 11
DB path: ~/Library/Application Support/japanese-studio/jpstudio.db

## kvAPI keys
STRAND_WEIGHTS, VOCAB_WEIGHTS, VOCAB_THRESHOLDS, VOCAB_INTERVALS,
VOCAB_MIGRATION_V1, VOCAB_LESSON_BACKFILL_V1, VOCAB_LOOKUPS_BACKFILL_V1, VOCAB_N5_BACKFILL_V1

## Vocabulary Model — Canonical Definition
- **Horizon** — in `words` table (N5 reference), not yet in `vocab_items`
- **Target** — in `vocab_items`, not yet graduated in both jp_en AND en_jp
- **Active** — graduated in both jp_en AND en_jp (`srs_graduated=1` in vocab_srs for both)

Speaking direction graduation tracked separately — can lag behind recognition.
