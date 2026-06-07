# Japanese Studio — Session Context
Last updated: 2026-06-07 (session 27 — vocab system complete, writing sitting boost designed)

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
- **Code:** anything touching multiple render paths, tracing logic across functions, multi-file refactors

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
Vocab system core complete. Next features:
1. Writing sitting boost (designed, ready to build)
2. Text entry drill mode (UI work — needs careful design)
3. Book vocab import
See context-vocab.md for full vocab system design.

## HTML Element Map
`html-map.md` in project Knowledge — check before touching any panel element.

**Session 25-26 additions:**
- vocabWtYoshiPhrases, vocabWtYoshiVocab, vocabWtWriting, vocabWtLookup, vocabWtN5
- vocabWtDirJpEn, vocabWtDirEnJp, vocabWtDirSpeaking
- vocabIntYoshiPhrases, vocabIntYoshiVocab, vocabIntWriting, vocabIntLookup, vocabIntN5
- vocabThreshLookup, vocabThreshDecay, vocabSessionSize, vocabWeightsMsg
- vcDirectionBtn — direction toggle (JP→EN / EN→JP / Speaking)
- .vocab-source-filter checkboxes (Yoshi/Writing/Lookup/N5) — ACTIVE
- .vocab-pos-filter checkboxes (Verbs/Nouns/い-adj/な-adj/Adverbs/Phrases) — ACTIVE

## Terminal Workflow
- python3 - << 'PYEOF' for multi-line edits
- Always jp && prefix
- repr() to inspect match strings before retrying
- Blank lines in match strings cause MATCH FAILED
- pbcopy swallows terminal output — never use for direct data queries
- SQLite DB at ~/Library/Application Support/japanese-studio/jpstudio.db
- window.db.query() requires explicit [] params array
- Close Electron app before SQLite writes

## Vocab System — Complete State

### All pipelines live
| Source | Event/trigger | Destination |
|---|---|---|
| yoshi_phrases | LESSON_EXTRACTED → initLessonVocabListener | vocab_items |
| yoshi_vocab | lessonNotesExtractVocabSilent direct write | vocab_items |
| writing | WRITING_SUBMITTED → extractWritingVocabToItems (Claude) | vocab_items |
| lookup | VOCAB_LOOKUP → initLookupVocabListener (threshold ≥2, len 2-10) | vocab_items |
| n5 | one-time backfill | vocab_items |

### vocab_items schema
id, word, reading, meaning, example, source, source_ref, direction, type, pos, counter_suffix,
encounter_at, entry_weight, srs_interval, srs_ease, srs_due, last_reviewed, created_at
UNIQUE(word, source, direction)

### lesson_phrases schema
id, lesson_id, phrase, reading, meaning, example, type, created_at

### Drill UI
- Direction toggle: JP→EN / EN→JP / Speaking
- Card front/back swaps per direction
- Speaking: Japanese front, auto VoiceVox on card load
- Dynamic font scaling by character count
- Grammar type excluded, 〜 prefix excluded
- Source + POS filters active

### Weighting (loadVocabItemsDeck)
- Fetches 200 rows, sorts by effective_weight = entry_weight × source_weight × direction_weight
- Slices to 50 for session
- Source weights: yoshi_phrases=1.0, yoshi_vocab=1.0, writing=0.9, lookup=0.6, n5=0.3
- Direction weights: jp_en=1.0, en_jp=0.8, speaking=0.9
- Stored in VOCAB_WEIGHTS kvAPI key

### AppEvents — all hooked in
- DRILL_ANSWER → StudentModel ✅
- WRITING_SUBMITTED → vocab pipeline + StudentModel ✅
- LESSON_EXTRACTED → vocab pipeline ✅
- VOCAB_LOOKUP → vocab pipeline + StudentModel ✅
- ANALYSIS_COMPLETE → StudentModel ✅
- FLUENCY_432 → StudentModel listens, nothing emits yet (known gap)

## Writing Sitting Boost — Designed, Ready to Build

### Concept
Any writing session with ≥5 sentence submissions automatically boosts associated lookup words
in the vocab deck for 3 days. Zero user action required — system infers prep context automatically.
If the session precedes a Yoshi lesson, the lesson pipeline picks up the content and it lives on.
If not, the boost expires cleanly after 3 days.

### Implementation plan
**New table: writing_sittings**
```sql
CREATE TABLE writing_sittings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at     TEXT,
  saved_at       TEXT NOT NULL,
  sentence_count INTEGER,
  expires_at     TEXT
);
```

**Hook point: `saveWritingText()` in `src/core-writing.js` (line 562)**
- Already knows `writingSentences.length`
- If length >= 5 → INSERT into writing_sittings with expires_at = datetime('now', '+3 days')
- One record per save event that meets threshold

**Lookup association:**
- Time window: ±2 hours of saved_at timestamp
- Query: SELECT DISTINCT word FROM corpus_lookups WHERE looked_up_at BETWEEN (saved_at - 2h) AND (saved_at + 2h)
- One bump per word per sitting (DISTINCT handles deduplication)

**In loadVocabItemsDeck:**
- Check: any writing_sittings WHERE expires_at > datetime('now')?
- If yes: fetch their lookup words from corpus_lookups within time windows
- Boost _effectiveWeight by 1.5× for matching words in vocab_items

**No UI needed** — fully automatic. Optional: small indicator in vocab panel showing "📚 Prep active"

### saveWritingText current location
src/core-writing.js line 562 — already has writingSentences.length available

## Text Entry Drill Mode — Designed, Not Built

### Two drill mechanics
- **Card flip** (current) — self-assess
- **Text entry** — type answer, app checks

### Text entry content types
| Content | Prompt | Answer check |
|---|---|---|
| Vocab EN→JP | Show English meaning | Match against word or reading in vocab_items |
| Verb conjugation | Show dict form + target form | Rule-based JS check |
| Counter drill | Show English quantity + noun | Rule-based JS (needs counter_suffix populated) |

**No Claude API needed** — exact/reading match for vocab, rule-based for conjugation/counters.

**counter_suffix column** added to vocab_items DB but not yet populated.
Counter nouns need tagging with their suffix (冊, 本, 匹, 台 etc.).

**UI note:** text entry needs careful design — do not start until UI checks done.
Toggle between flip and entry mode visible in drill footer.

## Book Vocab — Identified, Not Built

Paul works from a textbook with Yoshi. Each chapter has:
- A theme (e.g. "my favourite place")
- 4-6 audio chunks (~30-45 seconds each) — currently in Listen panel
- A vocabulary page of new chapter words — currently stays in the book

**Planned:**
- Import chapter vocab → vocab_items as source='book'
- Chapter theme tag → future "next lesson" filter
- Audio chunks already transcribed via Whisper — could feed vocab pipeline (noisy, lower trust)

**Book not yet identified** — need to know if it's Genki, Minna no Nihongo, or Yoshi-specific.

## Pending — Priority Order

1. **Writing sitting boost** — ready to build, clean design
2. **Text entry drill mode** — UI work needed first
3. **Book vocab import** — identify book first
4. **POS on yoshi_vocab** — Claude tagging at extraction time or defer
5. **counter_suffix population** — needed for counter drill
6. **Layer 6 downstream** — grammar drill + writing prompt with top-N words
7. **FLUENCY_432 emitter** — 4/3/2 speaking session wiring

## Drill Type Taxonomy (confirmed)
- Open semantic vocab → card flip or text entry → vocab_items
- Closed class (days, months) → simple recognition, retire quickly
- Rule-generative (counters, conjugation) → text entry, rule-checked
- Grammar patterns (〜てもいいですか) → sentence construction panel

## SQLite Schema (current tables)
kv_store, frames, transcript_sentences, corpus_entries, corpus_lookups, corpus_productions,
srs_items, error_history, lesson_sessions, words, lesson_phrases, pitch_data, writing_sessions,
drill_results, conversation_sessions, transcript_turns, failure_events, agent_decisions,
panel_sessions, learning_events, grammar_mastery, transcript_vocab, vocab_items

DB path: ~/Library/Application Support/japanese-studio/jpstudio.db

## kvAPI keys
STRAND_WEIGHTS, VOCAB_WEIGHTS, VOCAB_THRESHOLDS, VOCAB_INTERVALS,
VOCAB_MIGRATION_V1, VOCAB_LESSON_BACKFILL_V1, VOCAB_LOOKUPS_BACKFILL_V1, VOCAB_N5_BACKFILL_V1

## Architectural notes
- Yoshi tab → source manager only (no drills) — future work
- Frequency weighting (N4+) — frequency column already in words table, usable later
- Direction weights are difficulty calibration, not sequential learning stages
- One active writing sitting at a time is sufficient — stack won't fill up due to 3-day expiry
