# Session Context — 2026-07-01 (part 2)

## Summary
Continuation of the same-day session. Focus: mapping how Yoshi lesson data
(WhatsApp notes + audio) flows into grammar nodes, fixing a silent data-loss
bug in that pipeline, removing dead code, and building a working
hide/focus mechanism for the grammar coverage grid's gold dots.

---

## 1. Orphan `lesson_id` bug — fixed

**Root cause:** `lessonNotesAutoExtractAll()` (src/features-lesson-notes.js)
had no guard against running before `LessonNotesState.currentLessonId` was
resolved. When it ran unresolved, all four Claude-write call sites
(vocab/stories/phrases/grammar) wrote with `lesson_id = NULL` — silently.
No warning, no visible failure. Confirmed via DB query: 280 orphaned
`grammar` rows, 172 `phrase`, 24 `word` — all with `lesson_id IS NULL`.

**Fix:** guard added at top of `lessonNotesAutoExtractAll()` — if
`currentLessonId` is null, push a message into the existing
`extractionWarning` array (reuses the current banner + 🔄 Retry button,
no new UI) and return before any writes.

**Decision:** historical orphans (280/172/24 rows) left untouched —
not worth backfilling, only fixing forward.

**Status:** ✅ Fixed, committed.

---

## 2. Particle Pair drill — removed

**Finding:** `PARTICLE_PAIR_PROMPTS` + `_pd*` state + `particleDrillStart/
Render/pdSelectLeft/pdSelectRight/pdTryMatch` (src/features-grammar.js,
~213 lines) had zero references anywhere in `index.html` — no button, no
nav entry, no container div. Fully dead code, confirmed via grep before
removal.

**Also noted (not acted on):** its `GrammarModel.recordEvidence` call used
evidence type `'writing'`, which was a mislabeling (it was a matching
drill, not writing) — moot now that the whole feature is gone.

**Status:** ✅ Removed, committed.

---

## 3. Full Yoshi → grammar-node data flow — mapped

### Two writers into `lesson_sessions.extracted_grammar` / `lesson_phrases.node_id`
Both come from the **same single mechanism**: `features-lesson-notes.js`
parses WhatsApp lesson notes with Claude, which returns `grammarNodeIds`
per pattern. This writes:
- `lesson_phrases` (with `node_id` — only first ID of `grammarNodeIds[]`)
- `lesson_sessions.extracted_grammar` (JSON array, all matched node IDs)

This happens regardless of whether the row's `lesson_sessions.source` is
`'whatsapp'` or `'recording'` — depends on which `lesson_id` the notes
happened to attach to historically, not on audio content.

### Separate, unconnected: audio path
`AnalysisService.analyzeLesson()` → `StudentModel.ANALYSIS_COMPLETE` →
writes `transcript_vocab` + `grammar_mastery` (`encountered`, weight 0.5).
Does **NOT** touch `extracted_grammar` or `lesson_phrases` at all.

### Full current `grammar_mastery` writer map
| Source | Evidence type | File |
|---|---|---|
| Conjugation drill | `conjugation_drill` | core-stt.js:781 |
| Grammar drill (question mode) | `question` | features-grammar.js:939 |
| Writing panel | `writing` | core-writing.js:158 |
| Voice/speaking | `speaking` | features-voice.js:787 |
| Audio Yoshi session | `encountered` (0.5) | StudentModel.js:661 |
| ~~Particle Pair drill~~ | ~~`writing`~~ | removed this session |

**Confirmed zero writers for:**
- `noticing` evidence type (defined in ashiato-plan.md, never implemented)
- Video cue tagging (Stage 3 of video-grammar-node-linking.md — explicitly
  descoped this session, too ambitious for current goal)
- NoM sprint-card engagement → mastery (exists as `note_confirmed` badge
  only, doesn't write scores)

### Key decision — Yoshi notes stay informational-only
User explicitly decided Yoshi's WhatsApp-derived grammar tags should
**never** write to `grammar_mastery`. Rationale: AI-driven grammar
extraction from limited/noisy lesson notes is too blunt a signal to
auto-adjust mastery scores. This was already the de facto behavior
(no writer existed) — decision formalizes it as intentional, not a gap
to fill later.

---

## 4. Gold dots on grammar coverage grid — now fully wired

Pre-existing feature (`features-progress.js`, `activeGrammarIds` /
`goldDot` rendering) already showed which grammar nodes were touched in
the currently-open Yoshi lesson. Three gaps found and fixed:

### Gap 1 — no reactivity on lesson switch
`yoshiSessionSelect`'s onchange only called `lessonNotesRenderPanel()` —
never refreshed the grammar coverage grid. Switching lessons in Yoshi did
not update the gold dots; they reflected whichever lesson was active last
time the progress panel itself rendered.

**Fix:** onchange now also calls `renderGrammarCoverage()`.

### Gap 2 — Yoshi's existing per-item hide feature didn't persist
`LessonNotesState.grammarHidden` was a plain in-memory `Set()`, keyed by
array index — lost on restart, and unsafe across re-extraction (index
could shift and mis-hide the wrong item).

**Fix:** re-keyed by `grammarNodeIds[0]` (matches the same node_id already
used elsewhere). Persists to `sessions[idx].grammarHiddenNodeIds` via the
same Set↔Array serialization pattern as the existing `hiddenWords`
vocab-hide feature. Reconstructed on session load by matching loaded
`grammar[i].grammarNodeIds[0]` against the persisted node_id list.

### Gap 3 — hiding an item didn't affect gold dots at all
`activeGrammarIds` (the gold-dot source in `features-progress.js`) only
subtracted an older, separate dismiss mechanism
(`GRAMMAR_GOLD_DISMISSED`, a kvAPI-stored list). It never read
`LessonNotesState.grammarHidden`.

**Fix:** added an in-memory subtraction — when `_lessonId` matches
`LessonNotesState.currentLessonId`, translate `grammarHidden` indices to
node_ids and exclude them from `activeGrammarIds`. No new DB query.

### Gap 4 (found after initial "done") — hide toggle itself didn't refresh grid
`lessonNotesToggleGrammarHide()` called `lessonNotesRender()` +
`lessonNotesRenderPanel()` but never `renderGrammarCoverage()` — so
toggling hide within the *same* lesson required switching sessions and
back to see the grid update.

**Fix:** added `renderGrammarCoverage()` call directly in the toggle
function.

**Status:** ✅ All four gaps fixed and committed. End result: hiding a
grammar point in Yoshi's lesson view immediately removes its gold dot
from the coverage grid, persists across restart, and updates live when
switching between lessons.

---

## 5. Node_id backfill for sessions 69–71 — abandoned

**Attempted:** fuzzy-match `lesson_phrases` rows (missing `node_id`) against
each session's `extracted_grammar` candidate list, using first-token
label matching (same style as `StudentModel.js`'s existing fuzzy fallback).

**Result:** poor quality. Dry run showed clear mismatches (e.g. しか〜ない
matched to `verbs_as_nouns`; で place particle matched to `particle_ni_time`
instead of the correct `particle_de_place`). One or two node labels acted
as false-positive magnets, winning "first match" for unrelated rows.

**Decision:** abandoned. Only 3 old sessions, informational-only data,
not worth the review time to hand-verify ~65 rows. `node_id` stays NULL
for these — consistent with the "leave historical orphans alone" decision
in section 1.

---

## 6. Housekeeping — `.command` launcher relocated

Found during troubleshooting (unrelated to code): the `japanese` Dock
launcher was pointing at `~/Library/Mobile Documents/.Trash/japanese.command`
— a stale shortcut sitting in Trash. This is the exact class of setup that
caused the `schema_version` DB corruption earlier in the day (two
Electron processes able to write the same DB file concurrently if a
Trash-based launcher and a fresh `npm start` both fired).

**Fix:** moved to `~/Documents/jpStudio/japanese.command`, made
executable. Dock icon needed re-linking after the move (cosmetic, handled
via Get Info copy/paste of the original icon).

**Status:** ✅ Resolved. No further DB corruption risk from this vector.

---

## Key files touched this session (part 2)
| File | Role |
|------|------|
| `src/features-lesson-notes.js` | Orphan-write guard, grammarHidden persistence, hide-toggle grid reactivity |
| `src/features-ln-p2.js` | grammarHidden reconstruction on session load, lesson-switch grid reactivity |
| `src/features-progress.js` | Gold dots now subtract Yoshi-hidden node_ids |
| `src/features-grammar.js` | Particle Pair drill removed (~213 lines) |
| `~/Documents/jpStudio/japanese.command` | Relocated from `.Trash`, made executable |

## On the horizon (from this session, not yet done)
- No writer exists for `noticing` evidence type anywhere in the system.
  Two candidates discussed, neither built: Yoshi notes (explicitly
  rejected — informational only, per section 3) and NoM sprint-card
  engagement (still just a `note_confirmed` badge, no score write).
- Video cue tagging (Stage 3, video-grammar-node-linking.md) — explicitly
  descoped this session as too ambitious / not directly related to the
  Yoshi-lesson-notes goal. Still on the roadmap for later, separately.
- Confirm remaining `writing`-type `grammar_mastery` writers
  (core-writing.js:158) are correctly scoped now that Particle Pair's
  mislabeled writer is gone — no other known duplicates, not verified
  exhaustively.
- Sessions 69–71 `lesson_phrases.node_id` — permanently NULL, accepted.
