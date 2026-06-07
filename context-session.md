# Japanese Studio — Session Context
Last updated: 2026-06-07 (session 28 — vocab filters, text entry, POS tagging in progress)

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

## Chat vs Claude Code — Decision Rule
- **Chat:** single-line fixes, config changes, version bumps, CSS tweaks, grep/sed one-offs
- **Code:** anything touching multiple render paths, multi-line string replacements in JS, multi-file refactors

## Context File Update Process
- context-session.md lives at project root
- At end of session: Claude writes full updated file, Paul runs it, uploads to project Knowledge.

## GitHub Workflow
- Repo: https://github.com/jpstudioyoshi/jpstudio (private)
- Standard push: jp && git add -A && git commit -m "message" && git push
- Pre-commit hook runs check-syntax.js + auto-bumps cache buster (YYYYMMDDHHmmss)

## Claude Code
- Launch: jp && claude --model claude-opus-4-8
- Start: "Read context-static.md and context-session.md only. Do not read any other files yet."

## Current Mode
Vocab system — POS tagging pipeline next. Then POS filters back online. Text entry working but needs POS data.

## HTML Element Map
`html-map.md` in project Knowledge.

**Session 25-28 additions:**
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
- .vocab-source-filter checkboxes (Yoshi/Writing/Lookup/N5) — ACTIVE, all checked by default
- .vocab-pos-filter checkboxes (Verbs/Nouns/い-adj/な-adj/Adverbs/Phrases) — GREYED (awaiting POS data)
- Reset buttons on both filter rows

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

## Vocab System — Current State

### All pipelines live
| Source | Trigger | Destination |
|---|---|---|
| yoshi_phrases | LESSON_EXTRACTED → initLessonVocabListener | vocab_items |
| yoshi_vocab | lessonNotesExtractVocabSilent direct write | vocab_items |
| writing | WRITING_SUBMITTED → extractWritingVocabToItems (Claude) | vocab_items |
| lookup | VOCAB_LOOKUP → initLookupVocabListener (≥2, len 2-10) | vocab_items |
| n5 | one-time backfill | vocab_items |

### vocab_items schema
id, word, reading, meaning, example, source, source_ref, direction, type, pos, counter_suffix,
encounter_at, entry_weight, srs_interval, srs_ease, srs_due, last_reviewed, created_at
UNIQUE(word, source, direction)

### Drill UI — working
- Direction toggle: JP→EN / EN→JP / Speaking
- Type toggle: switches between flip card and text entry
- Text entry: correct → auto-advance after 800ms, wrong → show answer, wait for Next tap
- Source filters: active, all checked by default, Reset button
- POS filters: GREYED — awaiting POS data
- Dynamic font scaling on card
- Writing sitting boost: 5+ sentences → 3 day weight boost on lookup words

### Weighting
- effective_weight = entry_weight × source_weight × direction_weight × prep_boost(1.5×)
- Fetches 200, sorts, slices to 50

## POS Tagging — In Progress (next task)

### Problem
- N5 words have POS from `words` table ✅
- yoshi_vocab words stored as conjugated forms (食べました) not dictionary forms ❌
- yoshi_vocab has no POS ❌
- writing words have no POS ❌
- lookup words have no POS ❌

### Plan
**Step 1 — Update extraction prompt (Claude Code)**
In `src/features-lesson-notes.js`, function `lessonNotesExtractVocabSilent`:
- Change prompt to request DICTIONARY form (plain form, not conjugated)
- Add `pos` field to JSON return: noun, verb, i-adj, na-adj, adverb, expression
- Update vocab_items insert to write `v.pos || null` to pos column
- Update words table insert similarly

**Step 2 — Update writing extraction prompt**
In `src/core-vocab.js`, function `extractWritingVocabToItems`:
- Same changes: dictionary form + pos field
- Update vocab_items insert to write pos

**Step 3 — Clean and re-extract existing yoshi_vocab**
```sql
DELETE FROM vocab_items WHERE source='yoshi_vocab';
DELETE FROM kv_store WHERE key='VOCAB_MIGRATION_V1';
```
Then re-extract from a lesson session to populate with correct dictionary forms + POS.

**Step 4 — Lookup words POS**
- Match against `words` table where word exists → inherit POS
- Remaining → Claude batch tag (small set)

**Step 5 — Re-enable POS filters**
Remove opacity/pointer-events from POS filter row in index.html.

### Claude Code brief (ready to use)
"Read context-session.md only. Then read src/features-lesson-notes.js and src/core-vocab.js.

Task 1: In `lessonNotesExtractVocabSilent` in features-lesson-notes.js, update the extraction prompt to:
- Request DICTIONARY form (plain form — 食べる not 食べました)
- Add pos field to JSON: one of noun, verb, i-adj, na-adj, adverb, expression
- Update the vocab_items INSERT to include pos column: use v.pos || null
- Update the words table INSERT similarly

Task 2: In `extractWritingVocabToItems` in core-vocab.js, update the Claude prompt to:
- Request dictionary form
- Add pos field
- Update vocab_items INSERT to include pos column

Run node check-syntax.js. Do not commit."

## Writing Sitting Boost — Complete
- `writing_sittings` table created
- On save with ≥5 sentences → INSERT with expires_at = +3 days
- loadVocabItemsDeck checks active sittings → boosts lookup words ±2 hours by 1.5×
- Fully automatic, zero user action

## Text Entry Mode — Working, needs tuning
- Type toggle switches flip↔entry mode
- Wrong answer: shows correct word/reading, waits for Next tap
- Needs POS data before verb/counter specific modes can work
- Input field resets and refocuses on each new card

## Pending — Priority Order

1. **POS tagging** — Claude Code brief above, then clean yoshi_vocab, re-extract
2. **POS filters back online** — after data exists
3. **Writing words POS** — same prompt update already in brief
4. **Lookup words POS** — match words table, Claude for remainder
5. **Book vocab import** — 18 pages, OCR artifact ready to build
6. **Layer 6 downstream** — grammar drill + writing prompt with top-N words
7. **Counter suffix population** — counter_suffix column exists, needs tagging
8. **FLUENCY_432 emitter** — 4/3/2 speaking session wiring

## SQLite Schema (current tables)
kv_store, frames, transcript_sentences, corpus_entries, corpus_lookups, corpus_productions,
srs_items, error_history, lesson_sessions, words, lesson_phrases, pitch_data, writing_sessions,
writing_sittings, drill_results, conversation_sessions, transcript_turns, failure_events,
agent_decisions, panel_sessions, learning_events, grammar_mastery, transcript_vocab, vocab_items

DB path: ~/Library/Application Support/japanese-studio/jpstudio.db

## kvAPI keys
STRAND_WEIGHTS, VOCAB_WEIGHTS, VOCAB_THRESHOLDS, VOCAB_INTERVALS,
VOCAB_MIGRATION_V1, VOCAB_LESSON_BACKFILL_V1, VOCAB_LOOKUPS_BACKFILL_V1, VOCAB_N5_BACKFILL_V1
