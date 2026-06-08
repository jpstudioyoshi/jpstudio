# Japanese Studio — Session Context
Last updated: 2026-06-08 (session 30 — SM-2 fixes, POS tagging complete)

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
- Start: "Read context-session.md and context-vocab.md from Knowledge only. Do not read any other files yet."

## Current Mode
VOCAB SYSTEM BUILD-OUT — data quality and UI completion. Core pipeline complete.

## HTML Element Map
`html-map.md` in project Knowledge.

**Session 25-30 additions:**
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

## Vocab System — Complete State

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

### SRS — SM-2 (corrected session 30)
- Known: srs_interval = floor(interval × ease), ease +0.1 (if graduated), due pushed out
- Got it: srs_interval = floor(interval × max(1.3, ease - 0.10)), ease unchanged
- Again: srs_interval = 1, due tomorrow, ease -0.15 (if graduated, min 1.3)
- srs_ease starts 2.5

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
- lookup words: POS inheritance from words table pending (see below)
- Extraction prompts request dictionary form (食べる not 食べました, おいしい not おいしかった)
- POS enum: noun, verb, i-adj, na-adj, adverb, expression

### Lookup words POS (next after book import)
- Match against words table where word exists → inherit POS
- Remainder → Claude batch tag

## Writing Sitting Boost — Complete
- writing_sittings table: id, started_at, saved_at, sentence_count, expires_at
- On save with ≥5 sentences → INSERT with expires_at = +3 days
- loadVocabItemsDeck boosts lookup words ±2 hours from sitting by 1.5×
- Fully automatic

## Session 30 Changes
- **SM-2 gotit fix** — now uses `floor(interval × max(1.3, ease - 0.10))` instead of fixed ×1.2
- **SM-2 again fix** — resets to interval=1 always (was `×0.2` for graduated cards)
- **POS tagging** — both extraction prompts updated with adjective example; already had dictionary form + pos field
- **yoshi_vocab reset + re-extracted** — old conjugated-form data deleted, re-extracted with correct POS

## Pending — Priority Order

1. **Book vocab import** — 18 pages, OCR artifact
2. **Lookup words POS** — inherit from words table, batch-tag remainder
3. **Layer 6 downstream** — grammar drill + writing prompt with top-N words
4. **Counter suffix population** — counter_suffix column exists, needs tagging
5. **FLUENCY_432 emitter** — 4/3/2 speaking session wiring
6. **corpus_productions extraction fix** — currently single-kanji, needs word-level

## SQLite Schema (current tables)
kv_store, frames, transcript_sentences, corpus_entries, corpus_lookups, corpus_productions,
srs_items, error_history, lesson_sessions, words, lesson_phrases, pitch_data, writing_sessions,
writing_sittings, drill_results, conversation_sessions, transcript_turns, failure_events,
agent_decisions, panel_sessions, learning_events, grammar_mastery, transcript_vocab, vocab_items

DB path: ~/Library/Application Support/japanese-studio/jpstudio.db

## kvAPI keys
STRAND_WEIGHTS, VOCAB_WEIGHTS, VOCAB_THRESHOLDS, VOCAB_INTERVALS,
VOCAB_MIGRATION_V1, VOCAB_LESSON_BACKFILL_V1, VOCAB_LOOKUPS_BACKFILL_V1, VOCAB_N5_BACKFILL_V1
