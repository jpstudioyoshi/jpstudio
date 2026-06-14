# Japanese Studio — Session Context
Last updated: 2026-06-14 (session 37 — dead-code lookup tooling, 6 function removals, context file trim)

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
  or hand multi-file investigation to Claude Code (which has bash+grep).

## Chat vs Claude Code — Decision Rule
- **Chat:** single-line fixes, config changes, version bumps, CSS tweaks, grep/sed one-offs
- **Code:** anything touching multiple render paths, multi-line string replacements in JS,
  multi-file refactors, or cross-file dead-code investigation (grep-and-decide). Verified-orphan
  removals can be large (session 35 removed ~2270 lines in 3 Code passes) — size isn't the
  deciding factor, "does it need grep across files" is.

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
makes sense. (Stale "STABILIZATION" Project instruction removed session 37 — was also the
root cause of the Dashboard Q&A German-response bug via a cached briefing system prompt.)

## HTML Element Map
`html-map.md` in project Knowledge — may be stale after session 35: #timesDrillOverlay,
#compPanel, #listenProgressPanel, and #listenModeSelect no longer exist; features-times.js
deleted entirely.

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
- Close Electron before SQLite writes
- Long conversations: use Claude Code for multi-line JS string replacements
- DevTools console (Cmd+Option+I) for in-app JS — not terminal
- window.db.run() returns {changes: 0} even on successful batch INSERTs — not an error indicator

## Dead-Code Lookup Tooling — added session 37
- check-syntax.js now computes per function: `callers` (word-frequency count across all
  source files, minus the definition itself) and `exported` (true if in window[] or App
  registry anywhere). Written to index.json alongside name/file/line/desc.
- Audit file gains a "Likely dead candidates" section: functions with `callers=0` and
  `exported=false`, grouped by file. Regenerates every commit (pre-commit hook), no extra
  runs or API cost.
- find.js shows `[callers=N exported=yes/no]` for function-type results.
- Usage: `node find.js <name> function` → instant "is this dead?" answer, no grep needed.
- As of session 37: 18 candidates remain (down from 24) — see latest audit-YYYY-MM-DD.md.
  Note: indented/nested function declarations (e.g. teBuildQueue/teNext in
  features-grammar.js) aren't captured by the extractor — a known blind spot, not worth
  fixing (Claude Code's grep handles those natively when needed).

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
- conjAddFreqVerbs / conjResetFreqVerbs left in code, unused — folded into dead-code-findings pass

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

## Old panel-video remnants cleanup — session 36 (2026-06-14)
5 commits, all syntax-checked clean, continuing session 35's panel-video2 rebuild cleanup.

- Removed all dead `#panel-video`/`vt-fullscreen` code from core.js, core-foundation.js,
  features-reading.js. `vtFullscreen`/`vtExitFullscreen` deleted entirely — zero live callers,
  `panel-video` doesn't exist, only `panel-video2` does.
- **Bug fix:** features-tools.js had an unguarded `window["vtFullscreen"] = vtFullscreen;`
  export referencing the now-deleted function — threw ReferenceError on every app launch,
  silently caught by `catch(e){}`, which skipped every `window[...]` export alphabetically
  after it (vtLoadVideo, vtOnPlay, vtOnPause, vtTogglePlay, vtSetSpeed, vtWaveClick, etc.).
  Removed the line; app-tested afterward, video controls confirmed working.
- **Bug fix:** `vtAddSavedLink` (features-video.js) had a leftover `#vtLoadedBar` reference —
  same pattern as session 35's `vtCollapseLoadBar`/`vtHandleDrop` fix, one instance missed.
  Threw on every video load (after load completed, so playback unaffected). Removed.
- Removed dead Watch markers cluster: `vtAddMarker`/`vtClearMarkers`/`vtRenderMarkers`/
  `vtJumpMarker` + `VideoState.markers` state + all `window[...]`/App-registry exports.
  `#vtMarkerList` never existed in panel-video2, so `vtRenderMarkers` was always a no-op and
  the other 3 functions had zero callers.

## Tooling + Cleanup — session 37 (2026-06-14)
- Dead-code lookup tooling built (see "Dead-Code Lookup Tooling" above).
- Removed 6 verified-dead functions (callers=0, not exported, app-tested clean):
  `kanjiRefToggle` (core-foundation.js), `countStart2` (core-counters.js), `addMsg`
  (features-reading.js), `vgOnInput` (features-pictures.js), `pauseDataClear`
  (features-voice.js), `_devUpdatePanelBadge` (index.html). index.json: 1300→1294 entries.
- 3 function pairs from the 18 remaining candidates look like parts of larger superseded
  features — flagged for a Claude Code session alongside the ln-p2 cluster (Pending #5):
  `teSetMode`/`teSetGroup` (features-grammar.js, TE-form drill), `_renderErrorPie`/
  `_renderSubPie` (features-progress.js, old pie-chart panel), `lessonNotesRenderFullDoc`/
  `lnRenderTopics` (features-lesson-notes.js, duplicate doc renderer).
- Trimmed session 34/35 writeups from this file (~4500 chars) — carry-forwards already in
  Pending #1/#13/#14.
- Fixed stale "STABILIZATION" Project instruction directly in Project settings (was also
  causing the Dashboard Q&A German-response bug — see Current Mode note above).

## Pending — Priority Order

### Dead code / cleanup
1. ~~Old panel-video refs~~ — **DONE session 36 (2026-06-14)**: removed all dead
   `#panel-video`/`vt-fullscreen` code from core.js, core-foundation.js, features-reading.js
   (3 commits, ~115 lines net). `vtFullscreen`/`vtExitFullscreen` deleted entirely (zero live
   callers — `panel-video` doesn't exist, only `panel-video2`). Remaining: revisit
   `toggleProgress`/`#listenProgressPanel` null-getElementById (session 35 commit 3 note) if
   `toggleSrsTracking` turns out to be reachable — not addressed here.
2. **vtWatch* localStorage isolation** — `vtWatchTime` stored in localStorage only
   (`VT_WATCH_KEY`), separate from `panel_sessions`/`learning_events`; consider unifying
3. **dead-code-findings.md actions** — 8 certain + 14 likely, across ~8 files. UPDATE
   session 37: the "certain" category is superseded by the automated "Likely dead
   candidates" audit section (18 remaining, regenerated every commit — see Dead-Code
   Lookup Tooling above); use `node find.js <name> function` to check any item below.
   - certain: `isVoiced` (core-srs.js), `lnLoadTimeline` (features-lesson-notes.js),
     `rtStartRound2`/`rtCompare` (features-voice.js, orphaned buttons),
     `voiceUploadAudio` (features-voice.js), `_onRecord`/`_onStop` (ui/YoshiUI.js)
   - likely (App/window registry only): `vcFetch`+`vcFetchSelectAll`+`vcFetchAdd` (core-vocab.js),
     `ctrToggle` (features-core.js), `vgToggleMic` (features-reading.js), `customToggleRecord`
     (features-voice-drill.js), `lnCreateFromPaste`+`lnDeleteRecording` (features-lesson-notes.js),
     `yoshiSaveWhatsappInline`+`yoshiRetranscribe` (features-tools.js), `voiceSendText`
     (features-voice.js), `getCurrentSession`+`yoshiStartRecording`+`yoshiStopRecording`+
     `yoshiLoadLessonSessions`+`yoshiDeleteLessonSession`+`yoshiTranscribeCurrent`
     (Orchestrator.js), `TextEntry.val` (ui/TextEntry.js)
   - newly orphaned (session 36): `setVtDictateMode` (features-kana.js:1029, export at
     1056) — only caller was the dead `showPanel('video')` block just removed, status unknown
     (may already be dead from session 35's dictation cluster removal)
   - newly found (session 36, NOT addressed — safe/non-urgent): `vtCloseLineTranslate`
     (features-video.js) checks `document.getElementById('panel-video')?.classList
     .contains('vt-fullscreen')` — `#panel-video` doesn't exist, optional chaining makes
     this always `undefined`/falsy, so the `isFullscreen` branch is dead. No error, just
     simplify to `if (panel) panel.style.display = 'none';` when convenient
   - note: `rtStartRound2`/`rtCompare` may relate to FLUENCY_432 (Pending #18) — deliberate
     keep/delete decision, not an automatic sweep
4. **Drop 4 dead DB tables** (`transcript_sentences`, `agent_decisions`, `conversation_sessions`,
   `frames`) + dead StudentModel.js transcript→srs_items block (~30 lines)
5. **Lesson-notes drill dead code** (session 34 handoff): `lessonNotesRenderDrillCard`,
   `lessonNotesDrillPrev/Next/Reveal`, `lessonNotesSetMode`, `lessonNotesToggleShuffle`,
   `lessonNotesToggleShowReading/Meaning`, `lessonNotesHideCard`, `lessonNotesToggleTable`,
   `lessonNotesRestoreHidden` + state fields (`drillIdx`, `drillMode`, `drillRevealed`,
   `tableHidden`, `showReading`, `showMeaning`, `shuffled`, `vocabOriginal`, `hiddenWords`).
   Caution: `lessonNotesHideCard` touches `permanentlyLearned`, used by
   `lessonNotesLoadSession`'s vocab filter — check before removing.

### Grammar coverage
6. `node_id` column on `lesson_phrases` — unblocks gold-dot detail panel (source sentence display)
7. Dismiss button for gold dots (hide until next lesson)
8. Genki II node integration into grammar coverage grid

### Vocab pipeline
9. Yoshi extraction pipeline → populate `reading` at insert time
10. Counter suffix population (`counter_suffix` column exists, needs tagging)
11. `corpus_productions` extraction fix — currently single-kanji, needs word-level

### UI bugs
12. Direction toggle — returning to a previously visited direction loads a fresh deck rather
    than restoring position (session/idx/sessionPos)
13. Header search focus-drop on first keystroke (lesson notes, session 34)
14. `lnHeaderSearch` scope — notes-only vs whole-lesson search (session 34)

### Future / larger features
15. Conjugation SRS deck — see CONJ_SRS_DESIGN.md, after basic forms scoring well
16. "How you're learning" panel + strand imbalance notification (designed, not built)
17. Layer 6 — grammar drill + writing prompt with top-N words
18. FLUENCY_432 emitter — 4/3/2 speaking session wiring → populates conversation_sessions
    (see Pending #3 note re: rt* cluster)
19. Book vocab import — 18 pages, OCR artifact (deferred)
20. Transcript statistics — word count per session derivable from transcript_turns at zero
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
