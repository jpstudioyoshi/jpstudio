# Japanese Studio — Session Context
Last updated: 2026-06-07 (session 29 — POS tagging complete, drill UI improvements)

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
Vocab system — POS tagging complete. Drill UI stable. Next: re-extract previous lessons, book vocab import.

## HTML Element Map
`html-map.md` in project Knowledge.

**Session 25-29 additions:**
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
- .vocab-pos-filter checkboxes (Verbs/Nouns/い-adj/な-adj/Adverbs/Phrases) — ACTIVE
- Reset buttons on both filter rows
- vocabList — word list panel, fixed position right, toggled by "Word list" / "Hide list" button

## Terminal Workflow
- python3 - << 'PYEOF' for multi-line edits
- Always jp && prefix
- repr() to inspect match strings before retrying
- Blank lines in match strings cause MATCH FAILED
- pbcopy swallows terminal output
- TWO databases exist — app uses: ~/Library/Application Support/japanese-studio/jpstudio.db
- ~/Library/Application Support/jpstudio/jpstudio.db is empty/unused — ignore it
- window.db.query() requires explicit [] params
- Close Electron before SQLite writes
- Long conversations: use Claude Code for multi-line JS string replacements

## Vocab System — Current State

### All pipelines live
| Source | Trigger | Destination | POS |
|---|---|---|---|
| yoshi_phrases | LESSON_EXTRACTED → initLessonVocabListener | vocab_items | from words table |
| yoshi_vocab | lessonNotesExtractVocabSilent direct write | vocab_items | ✅ Claude extraction |
| writing | WRITING_SUBMITTED → extractWritingVocabToItems (Claude) | vocab_items | ✅ Claude extraction |
| lookup | VOCAB_LOOKUP → initLookupVocabListener (≥2, len 2-10) | vocab_items | ✅ matched from words table |
| n5 | one-time backfill | vocab_items | ✅ from words table |

### vocab_items schema
id, word, reading, meaning, example, source, source_ref, direction, type, pos, counter_suffix,
encounter_at, entry_weight, srs_interval, srs_ease, srs_due, last_reviewed, created_at
UNIQUE(word, source, direction)

### type values
- `word` — standard vocab item
- `phrase` — multi-word phrase
- `grammar` — grammar pattern (excluded from drill)
- `excluded` — undrillable items (conjugated forms, sentences, untaggable lookups)

### Drill UI — working
- Direction toggle: JP→EN / EN→JP / Speaking
- Type toggle: switches between flip card and text entry
- Text entry: correct → silent auto-advance (400ms), wrong → show answer in TARGET language, Enter to continue
- Kana mode auto-switches: EN→JP = hiragana, JP→EN = romaji
- Source filters: active, all checked by default, Reset button
- POS filters: active (data now exists for yoshi_vocab, writing, n5, lookup)
- Dynamic font scaling on card
- Writing sitting boost: 5+ sentences → 3 day weight boost on lookup words
- Word list: fixed position right of card, scrollable, shows source + due date, today highlighted

### Weighting
- effective_weight = entry_weight × source_weight × direction_weight × prep_boost(1.5×)
- Fetches up to session_size×3 rows, sorts, slices to session_size
- Settings save triggers immediate deck reload (no restart needed)
- Module-level _vcWeights, _vcThresholds, _vcIntervals populated at load and on save

### Session size
- Controlled by vocabSessionSize element in settings panel
- Read by startNewSession() from _vcThresholds.session_size
- vocabSettingsLoad() runs before loadVocabItemsDeck() on startup (order matters)

## POS Tagging — Complete

### Status
- `pos` column added to vocab_items (ALTER TABLE applied to correct DB)
- yoshi_vocab: Claude extraction returns dictionary form + pos ✅
- writing: Claude extraction returns dictionary form + pos ✅
- lookup: 42 words matched from words table ✅; 114 untaggable rows marked type='excluded' ✅
- n5: already had POS from words table ✅
- POS filters active in drill UI ✅

### Known data gaps
- Previous lesson sessions not yet re-extracted (yoshi_vocab rows only exist for May 22)
- To re-extract a lesson: DELETE FROM kv_store WHERE key='lessonDoc_XXXX'; then reload that lesson
- All lessonDoc_ keys except May 22 were deleted in session 29 — re-extraction happens on next lesson open

## Writing Sitting Boost — Complete
- `writing_sittings` table created
- On save with ≥5 sentences → INSERT with expires_at = +3 days
- loadVocabItemsDeck checks active sittings → boosts lookup words by 1.5×
- Fully automatic, zero user action

## Text Entry Mode — Working
- Type toggle switches flip↔entry mode
- Correct: silent auto-advance after 400ms
- Wrong: shows answer in target language (EN→JP shows JP word+reading, JP→EN shows English meaning)
- Enter key advances after wrong answer
- Input field resets and refocuses on each new card
- Kana mode set via kanaSetMode() — no toolbar rendered (intentional)

## Word List Panel — Working
- Toggle: "Word list" / "Hide list" button in footer
- Fixed position: top:120px, right:16px, width:380px
- Shows jp_en direction only; columns: word, reading, meaning, source (cleaned), due date
- Today's words highlighted in teal; overdue in red
- Clicking a row jumps to that card

## Pending — Priority Order

1. **Re-extract previous lessons** — Paul's task (open each lesson in Lesson Notes panel; lessonDoc_ keys already cleared)
2. **Book vocab import** — 18 pages, OCR artifact ready to build
3. **Layer 6 downstream** — grammar drill + writing prompt with top-N words
4. **Counter suffix population** — counter_suffix column exists, needs tagging
5. **FLUENCY_432 emitter** — 4/3/2 speaking session wiring
6. **Strand imbalance notification** — designed, not built
7. **Satellite app** — verify Gist sync after button text changes

## SQLite Schema (current tables)
kv_store, frames, transcript_sentences, corpus_entries, corpus_lookups, corpus_productions,
srs_items, error_history, lesson_sessions, words, lesson_phrases, pitch_data, writing_sessions,
writing_sittings, drill_results, conversation_sessions, transcript_turns, failure_events,
agent_decisions, panel_sessions, learning_events, grammar_mastery, transcript_vocab, vocab_items

DB path: ~/Library/Application Support/japanese-studio/jpstudio.db

## kvAPI keys
STRAND_WEIGHTS, VOCAB_WEIGHTS, VOCAB_THRESHOLDS, VOCAB_INTERVALS,
VOCAB_MIGRATION_V1, VOCAB_LESSON_BACKFILL_V1, VOCAB_LOOKUPS_BACKFILL_V1, VOCAB_N5_BACKFILL_V1
