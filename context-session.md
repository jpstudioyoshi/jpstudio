# Japanese Studio — Session Context
Last updated: 2026-06-14 (session 38 — major dead-code purge: 8 commits, net −1768 lines,
18→0 dead candidates, including a 35-function orphaned duplicate lesson-notes panel)

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
`html-map.md` in project Knowledge — may be stale after session 35: #timesDrillOverlay,
#compPanel, #listenProgressPanel, and #listenModeSelect no longer exist; features-times.js
deleted entirely. Also confirmed in session 38: #panel-teform never existed (TE-form drill was
already-orphaned JS only); the session-38 35-function duplicate panel had no corresponding
HTML container either — purely orphaned JS, no HTML cleanup needed from this session.

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
- **Session 38 result: 18 → 0 candidates** (see Session 38 writeup below). index.json:
  1294 → 1228 entries (−66).
- Known blind spot (confirmed again this session): indented/nested function declarations
  (e.g. teBuildQueue/teNext in features-grammar.js, which turned out to not even exist —
  already-deleted functions still being *called* by dead code) aren't captured by the
  extractor. "exported=true" also doesn't mean "reachable" — an App-registry entry with zero
  real callers is still dead (found 5 such functions this session: lessonNotesRenderDrillCard,
  lessonNotesSetMode, lessonNotesDrillReveal/Next/Prev, plus the entire 35-function ln*
  cluster's lnSwitchTab export).
- **Open question carried forward:** the original dead-code-findings.md (2026-06-11, 8
  certain + 14 likely items: isVoiced, lnLoadTimeline, rtStartRound2/rtCompare,
  voiceUploadAudio, _onRecord/_onStop, vcFetch+family, ctrToggle, vgToggleMic,
  customToggleRecord, lnCreateFromPaste, lnDeleteRecording, yoshiSaveWhatsappInline/
  yoshiRetranscribe, voiceSendText, Orchestrator yoshi* shims, TextEntry.val) has ZERO
  overlap with either the original 18 or the final 0 from the automated audit. Either
  these were already removed in sessions 32-36 (before the tooling existed), or they're a
  genuine tool-coverage gap the audit can't see (plausible — this session found the
  extractor misses nested functions and orphaned-but-exported functions both). Worth a
  spot-check next session: `grep -rn "isVoiced\|rtStartRound2\|lnLoadTimeline" src/` — if
  these are truly gone, dead-code-findings.md can be archived/deleted; if they're still
  present, the automated tooling has a real gap to document.

## Session 38 — Major dead-code purge (2026-06-14)
8 commits, net −1768 lines, all syntax-checked clean (40/40), 18→0 dead candidates.

1. **ln-p2 lesson-notes drill cluster** (3 commits, −559 lines, 22 functions): the old
   flashcard-style vocab drill on the lesson-notes panel — superseded by the Overview-tab
   restructure (context-handoff-2026-06-13.md). Removed in cascading passes as each removal
   orphaned its helpers:
   - Pass 1 (17 functions + 4 App-registry entries): lessonNotesSaveHiddenPermanently,
     lessonNotesShowMastered, lessonNotesClearMastered, lessonNotesBreakdownCurrent,
     lessonNotesExamplesCurrent, lessonNotesHideCard, lessonNotesRestoreHidden,
     lessonNotesToggleTable, lessonNotesToggleShowReading/ShowMeaning, lessonNotesToggleShuffle,
     lessonNotesRenderDrillCard, lessonNotesSetMode, lessonNotesDrillReveal/Next/Prev,
     lessonNotesShowEdit (the last 5 were exported-but-unreachable, same pattern as the
     vtFullscreen bug from session 36).
   - Pass 2 (4 functions, cascade): lessonNotesSaveLearnedWords, lessonNotesBreakdown,
     lessonNotesExamples, lessonNotesRenderEditView — confirmed by Paul: the word
     breakdown/examples-via-Claude feature and the raw-notes edit view were both
     intentionally dropped in the June 13 restructure, not regressions.
   - Pass 3 (1 function, cascade): breakdownCacheSave + BREAKDOWN_CACHE_KEY/breakdownCache
     init (only caller was the removed lessonNotesBreakdown).
   - `LessonNotesState.permanentlyLearned` / `lessonNotesGetLearnedWords` kept — still
     load-bearing in lessonNotesLoadSession's vocab filter (reads existing localStorage
     data; just has no remaining UI path to add new entries, which was already true before
     this session).
   - Orphaned state fields (drillIdx, drillMode, drillRevealed, tableHidden, showReading,
     showMeaning, shuffled, vocabOriginal, hiddenWords, breakdownCache) and their resets in
     lessonNotesLoadSession/New/Delete deliberately left alone — harmless, separate tidy-up.

2. **TE-form drill** (1 commit, −150 lines): confirmed by Paul as dead for months,
   superseded by the conjugation drill's `optTeG` option. Removed TE_VERBS (~76-entry data
   array), teSetMode/teSetGroup (features-grammar.js), and TeFormState (features-tools.js —
   a different file, only ever referenced from the two removed functions). teSetMode/
   teSetGroup called teBuildQueue/teNext/teShowContext/teShowContextPrompt, which had NO
   definitions anywhere — already-deleted in an earlier cleanup, doubly dead.

3. **Error-pie-chart cluster** (1 commit, −136 lines): _renderErrorPie/_renderSubPie were
   an old pie-chart renderer superseded by _renderErrorPieRight (live, called from
   progressRenderErrors). _pieSliceColors cascaded in too (only caller was _renderSubPie).

4. **Orphaned duplicate lesson-notes panel — "ln* cluster"** (1 commit, −820 lines, 35
   functions — the big one): an entire parallel implementation of the lesson-notes panel
   (own tabs, own vocab drill, own session CRUD, own file handling) under the `ln*` prefix,
   lines ~2658-3170 of features-lesson-notes.js. Per Paul: a duplicate created when the
   panel was moved, whose entry point (lnSwitchTab/lnRenderTab) got cut and never removed.
   Internally self-consistent (functions called each other fine) but zero external callers
   except one dead registry export — same "orphaned but exported" pattern as #1 above, at
   30x the scale. Removed: lnRecordSentence, lnSaveSentenceRecording, lnPlaySentence,
   lessonNotesUpdateDropdown, lnGetSessions/SaveSessions/CurrentSession, lnRenderTab,
   lnSwitchTab, lnRenderVocab + drill subs (lnSetDrillMode/DrillReveal/DrillNext/DrillPrev/
   DrillJump/RefreshTab), lnRenderStories/OpenStory, lnRenderKeyPhrases/StartPhraseDrill,
   lnRenderCorrections, lnRenderGrammar + ToggleGrammarHide/ToggleShowHidden, lnRenderTopics,
   lnRenderFullDoc/RenderRecording/FilterTranscript, lnToggleRecPlayer/DeleteRecording,
   lnNewSession/LoadSession/DeleteSession/HandleFile/HandleDrop, IMPORTED_DOC_SESSIONS_PANEL_KEY.
   **Kept: yoshiParseWhatsapp** (physically inside this line range but has 4 live external
   callers — lnAlignTimeline/lnLoadTwoColumnTimeline in features-ln-p2.js).

5. **lessonNotesRenderFullDoc + cascade** (2 commits, −103 lines): a third, separate
   "full doc" renderer (yet another one — distinct from both the live lnFullDocDoSearch/
   #lnFullDocContent system at L661 and the ln* cluster's lnRenderFullDoc above), zero
   external references. Cascaded into lessonNotesFullDocDoSearch/ClearSearch
   (features-ln-p2.js), whose only callers were inside lessonNotesRenderFullDoc's own
   generated HTML.

**New tooling learning:** features-lesson-notes.js contains at least one line so long
(a giant HTML template literal inside lessonNotesRenderFullDoc) that the `view` tool fails
even at 1-3 line ranges. Scoped via grep (function-definition line numbers) instead, then
handed to Claude Code for the actual removal.

## Vocab pipeline status check (session 38)
Ran direct SQLite queries (read-only, app running):
- **Lookup-source meaning backfill: 0 missing** — fully done.
- **Reading backfill: 181 missing** (down from 567). Checked recency: the 3 most recent
  lookup-source entries (all from 2026-06-14) all have readings populated; the latest
  *missing*-reading entry is from 2026-06-13 18:18. So the lookup/translate pipeline now
  correctly populates `reading` at insert (fixed sometime 06-13/06-14) — the 181-item
  backlog (06-06 to 06-13) is pre-fix legacy, harmless: will self-populate if those words
  are re-encountered, no problem if not. **Pending #9 (lookup portion) resolved.**
- **counter_suffix: 639 missing** — no recency check done yet, total noun/verb population
  not checked. Still open (#10 below).
- **corpus_productions: still single-kanji** in the sample checked (5 rows, all from
  2026-05-15) — but these are old rows; didn't check whether recent rows are word-level.
  Still open (#11 below).

## Vocab System — Complete State

### All pipelines live
| Source | Trigger | Destination |
|---|---|---|
| yoshi_phrases | LESSON_EXTRACTED → initLessonVocabListener | vocab_items |
| yoshi_vocab | lessonNotesExtractVocabSilent direct write | vocab_items |
| writing | WRITING_SUBMITTED → extractWritingVocabToItems (Claude) | vocab_items |
| lookup | VOCAB_LOOKUP → initLookupVocabListener (≥2, len 2-10) | vocab_items |
| n5 | one-time backfill | vocab_items |

### vocab_items schema (v11 — session 32)
id, word, reading, meaning, example, source, source_ref, type, pos, counter_suffix,
encounter_at, entry_weight, created_at
UNIQUE(word, source)
— direction and SRS columns removed; now in vocab_srs

### vocab_srs schema (session 32)
id, vocab_id (FK → vocab_items.id), direction, srs_interval, srs_ease, srs_due,
srs_graduated, last_reviewed
UNIQUE(vocab_id, direction)
— SRS rows created lazily on first review via INSERT ... ON CONFLICT DO UPDATE

### lesson_phrases schema
id, lesson_id, phrase, reading, meaning, example, type, created_at

### Drill UI — working
- Direction toggle: JP→EN / EN→JP / Speaking
- Type toggle: switches between flip card and text entry
- Text entry: correct → auto-advance after 800ms, wrong → show answer, wait for Next tap
- Source filters: active, all checked by default, Reset button
- POS filters: ACTIVE, all checked by default, Reset button
- Dynamic font scaling on card
- Writing sitting boost: 5+ sentences → 3 day weight boost on lookup words
- Strand tile: updates immediately on markVocab (window._vocabDrillUsedToday flag)
- List view works in all directions (EN→JP, Speaking)

### SRS — SM-2 (corrected session 30)
- Known: srs_interval = floor(interval × ease), ease +0.1 (if graduated), due pushed out
- Got it: srs_interval = floor(interval × max(1.3, ease - 0.10)), ease unchanged
- Again: srs_interval = 1, due tomorrow, ease -0.15 (if graduated, min 1.3)
- srs_ease starts 2.5, srs_graduated per direction in vocab_srs

### Weighting
- effective_weight = entry_weight × source_weight × direction_weight × prep_boost(1.5×)
- Fetches 200, sorts by effective_weight, slices to 50
- Source weights: yoshi_phrases=1.0, yoshi_vocab=1.0, writing=0.9, lookup=0.6, n5=0.3
- Direction weights: jp_en=1.0, en_jp=0.8, speaking=0.9
- Stored in VOCAB_WEIGHTS kvAPI key

### Filter logic
- Source: all checked = no filter; partial = filter to checked sources; none = empty deck
- POS: all checked or none = no filter; partial = filter to pos column + type='phrase' for Phrases
- NULL pos items excluded when POS filter active and Phrases not checked

### POS Tagging — COMPLETE
- yoshi_vocab: dictionary form + POS extracted via Claude at lesson notes extraction time ✅
- writing words: dictionary form + POS extracted via Claude at writing submission time ✅
- N5 words: POS inherited from words table ✅
- lookup words: inherited from words table where match exists; remainder batch-tagged ✅
- POS enum: noun, verb, i-adj, na-adj, adverb, expression

## Conjugation Drill — DB-driven pool (session 30)

### Pool logic
- Step 1: vocab_items WHERE pos IN (verb/i-adj/na-adj), joined to words for verb_class, ORDER BY MAX(srs_ease) DESC, MAX(srs_graduated) DESC across directions — up to 60
- Step 2: top up to 100 from words table ORDER BY frequency DESC, excluding step 1 words
- verb_class mapping: godan→u, ichidan→ru, irregular/suru→irr
- Pool info shown in conjPoolInfo span: "Pool: X known + Y frequency"
- Null verb_class words skipped (not guessed)

### Conjugation SRS — future build
Design note at CONJ_SRS_DESIGN.md in project root.
- SRS unit = (word, source_form, target_form)
- Direction toggle: forward (dict→form) and reverse (conjugated→dict)
- Rule-level mastery via grammar_mastery table
- Prerequisite: basic dict→all-forms scoring well first

## Writing Sitting Boost — Complete
- writing_sittings table: id, started_at, saved_at, sentence_count, expires_at
- On save with ≥5 sentences → INSERT with expires_at = +3 days
- loadVocabItemsDeck boosts lookup words ±2 hours from sitting by 1.5×
- Fully automatic

## Grammar Node Mapping Pipeline — COMPLETE (extraction + display)

### Extraction (session 31)
- Lesson notes grammar extraction (`lessonNotesExtractGrammar`) calls `lessonNotesExtractGrammarSilent`
- Silent function awaits `GrammarModel.load()`, builds node list from all 55 nodes
- Node list injected into Claude prompt BEFORE lesson content
- Claude returns `grammarNodeIds` array per grammar point (exact node IDs only)
- Batch INSERT to `lesson_phrases` (type='grammar', lesson_id set)
- Unique node IDs collected → `UPDATE lesson_sessions SET extracted_grammar=?`
- Example: session 69 → 19 node IDs, 24 grammar patterns

### Display (built, session unknown — confirmed live via memory)
- Gold dot indicators on Genki grammar node pills in progress panel show
  session-contextual coverage (renderGrammarCoverage / grammarNodeClick in features-progress.js)
- Annotation layer only — no mastery colour change
- Per-session, not cumulative

### Remaining work
- Gold dot detail panel (source sentence display) blocked — `lesson_phrases` has no `node_id`
  column linking a phrase back to the grammar node it was tagged with
- Dismiss button for gold dots (hide until next lesson) not yet built
- Lesson session DB linking: `lessonSessionDbId` stored on kvAPI session object;
  `lessonNotesEnsureDbRow()` finds-or-creates `lesson_sessions` row (session 31)

## Pending — Priority Order

### Documentation tidy-up (discrete project — run at start of next session)
- **context-static.md**: file-size table stale (features-lesson-notes.js/features-ln-p2.js
  line counts predate session 38's removals); "SQLite Schema (v9)" is 2 versions behind
  current (v11); "Dead Files" entry for src/features.js — confirmed gone session 38, remove
  the line; features-pictures.js "leave in place" note partially stale (vgOnInput removed
  session 37).
- **html-map.md**: stale since session 35 (#timesDrillOverlay/#compPanel/
  #listenProgressPanel/#listenModeSelect don't exist, features-times.js deleted).
- **context-handoff-2026-06-13.md**: open items now resolved/absorbed into this file
  (session 38) — archive/remove from project Knowledge.
- **audit-2026-05-30.md / vocab-audit-2026-06-05.md**: point-in-time snapshots, superseded
  by session 38's changes — archive or regenerate.

### Dead code / cleanup
1. **dead-code-findings.md (2026-06-11) reconciliation** — spot-check whether the 8
   certain + 14 likely items (isVoiced, lnLoadTimeline, rtStartRound2/rtCompare,
   voiceUploadAudio, _onRecord/_onStop, vcFetch+family, ctrToggle, vgToggleMic,
   customToggleRecord, lnCreateFromPaste, lnDeleteRecording, yoshiSaveWhatsappInline/
   yoshiRetranscribe, voiceSendText, Orchestrator yoshi* shims, TextEntry.val) still exist.
   Zero overlap with the automated audit (now at 0 candidates) — either already gone, or a
   tool-coverage gap. `grep -rn "isVoiced\|rtStartRound2\|lnLoadTimeline" src/` as a start.
   Note: `rtStartRound2`/`rtCompare` may relate to FLUENCY_432 (Pending #16) — deliberate
   keep/delete decision if still present, not an automatic sweep.
2. **vtWatch* localStorage isolation** — `vtWatchTime` stored in localStorage only
   (`VT_WATCH_KEY`), separate from `panel_sessions`/`learning_events`; consider unifying
3. **Drop 4 dead DB tables** (`transcript_sentences`, `agent_decisions`, `conversation_sessions`,
   `frames`) + dead StudentModel.js transcript→srs_items block (~30 lines)

### Grammar coverage
4. `node_id` column on `lesson_phrases` — unblocks gold-dot detail panel (source sentence display)
5. Dismiss button for gold dots (hide until next lesson)
6. Genki II node integration into grammar coverage grid

### Vocab pipeline
7. ~~Yoshi extraction pipeline → populate `reading` at insert time~~ — **lookup portion
   confirmed working session 38** (see "Vocab pipeline status check" above). 181-item
   legacy backlog is harmless. If yoshi_phrases/yoshi_vocab sources show a similar
   pattern, this can be closed entirely — not checked yet.
8. Counter suffix population (`counter_suffix` column exists, 639 missing as of session 38,
   needs total-count context to assess)
9. `corpus_productions` extraction fix — currently single-kanji in older rows, needs
   word-level; recency not checked

### Future / larger features
10. Conjugation SRS deck — see CONJ_SRS_DESIGN.md, after basic forms scoring well
11. "How you're learning" panel + strand imbalance notification (designed, not built)
12. Layer 6 — grammar drill + writing prompt with top-N words
13. FLUENCY_432 emitter — 4/3/2 speaking session wiring → populates conversation_sessions
    (see Pending #1 note re: rt* cluster)
14. Book vocab import — 18 pages, OCR artifact (deferred)
15. Transcript statistics — word count per session derivable from transcript_turns at zero
    API cost; query only, no new tables

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

### Three tiers
- **Horizon** — in `words` table (N5 reference), not yet in `vocab_items`
- **Target** — in `vocab_items`, not yet graduated in both jp_en AND en_jp
- **Active** — graduated in both jp_en AND en_jp (`srs_graduated=1` in vocab_srs for both directions)

Speaking direction graduation tracked separately — can lag behind recognition.
