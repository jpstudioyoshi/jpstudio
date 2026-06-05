# Japanese Studio — Vocab System Context
Last updated: 2026-06-05 (session 24 — vocab rationalization planning)

## Design Rationale (Paul Nation framework)

Vocabulary learning in jpStudio follows Nation's four-strand model:
- Words worth drilling (S3 deliberate study) are words already encountered in meaning-focused input (S1/S2) or produced in output (S2)
- Frequency lists alone are arbitrary — context of encounter is the primary signal
- Repetition across varied contexts (flashcard → sentence drill → free production) maximises retention

## Open vs Closed Class — Kept Separate by Design

Counters, dates, conjugation patterns are **rule-generative**, not semantic items.
- You learn the pattern once; it generates infinite instances
- These stay in their own drills (words-sub-counters, words-sub-days, grammar2 panel)
- They are NOT part of the semantic SRS pool

## Three Vocab Sources

| Source | Table | Entry condition | Trust |
|---|---|---|---|
| Yoshi/WhatsApp phrases | `lesson_phrases` | All items added per session | Highest — real communication |
| Free writing | `corpus_productions` + `corpus_lookups` | Weight formula (see below) | High — active output |
| Dictionary lookups | `corpus_lookups` | Threshold: N lookups before promotion | Medium — curiosity signal |
| N5 frequency | `words` | Background fill only | Lowest — horizon-widening |

**Excluded sources:**
- Transcription (`transcript_vocab`) — Whisper errors too noisy
- Reading panel — dropped
- Anki — leave as-is, no further investment

## Writing Source — Weight Formula

Words from free writing are evaluated on two signals:

```
entry_weight = (lookup_count × lookup_weight) - (production_count × decay_factor)
```

- **Produced N times without lookup** → demonstrated knowledge → weight goes negative → deprioritize or remove from deck
- **Produced but also looked up** → unknown word in active use → high priority, enter deck
- **Looked up but not produced** → passive encounter → enter at medium priority once threshold crossed

This operationalizes Nation S2: output fluency evidence reduces deliberate study burden.

## Lookup Promotion Threshold

- Default: 2 lookups before a word is promoted to the SRS deck
- Configurable in settings
- Prevents accidental taps from polluting the deck

## SRS Pool — vocab_items Table

Single unified table, source-tagged. All sources feed into it.

```sql
CREATE TABLE vocab_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  word          TEXT NOT NULL,
  reading       TEXT,
  meaning       TEXT,
  source        TEXT NOT NULL,  -- 'yoshi', 'writing', 'lookup', 'n5'
  source_ref    TEXT,           -- lesson_phrases.id, writing_session date, etc.
  encounter_at  TEXT,           -- most recent encounter date
  entry_weight  REAL DEFAULT 1.0,
  srs_interval  INTEGER DEFAULT 1,
  srs_ease      REAL DEFAULT 2.5,
  srs_due       TEXT,
  last_reviewed TEXT,
  created_at    TEXT NOT NULL
);
```

**Due queue:** `WHERE srs_due <= today ORDER BY entry_weight DESC, encounter_at DESC`

Upsert logic: if word exists from any source, update `encounter_at` and bump weight. Never reset SRS interval on re-encounter — preserve learning history.

## Settings Levers

Stored in kvAPI:

**VOCAB_WEIGHTS** — per-source weight multipliers
- `yoshi`: 1.0 (default)
- `writing`: 0.9
- `lookup`: 0.6
- `n5`: 0.3

**VOCAB_THRESHOLDS**
- `lookup_promote`: 2 (lookups before promotion)
- `production_decay`: 5 (productions before word considered known)

**VOCAB_RECENCY** — recency decay factor on encounter_at (TBD — tune after launch)

## N5 Relationship

N5 is not replaced by Yoshi — it widens the horizon. Overlap will be large and that reinforcement is welcome. N5 words not yet encountered in sessions sit at the bottom of the queue by weight. If a word appears in both N5 and a Yoshi session, the Yoshi encounter upgrades its weight automatically via upsert.

## Downstream Consumers

The `vocab_items` weight stack is the **difficulty controller** for generated content across the app:

**SRS flashcard review** (direct)
- Card shows: word, reading, meaning, source tag, weight indicator
- SM-2 updates interval/ease/due on review

**Grammar drill sentence generation**
- Known words (weight near zero) = free scaffolding
- One SRS-due medium-weight word per sentence = lexical target
- Grammar form + vocabulary target in one sentence — two learning objectives
- Claude API call passes vocab weight profile at generation time
- Tag: `source: 'vocab_drill'` for cost tracking

**Sentence construction activity**
- Same budget logic as grammar drill

## API Cost

Not a constraint (confirmed). Optimise for learning quality, not API calls.
Flag vocab-related Claude calls with `source: 'vocab_drill'` or `source: 'vocab_sentence_gen'` for visibility in settings cost display.

## Panel Changes

**words-sub-vocab** — replace N5 flashcard logic with vocab_items query
**words-sub-game** — DELETE (matching game, never developed beyond experiment)
**words-sub-anki** — leave as-is, no further investment
**words-sub-counters / days** — unchanged, separate system

## Todo List

### Layer 1 — Data audit (before any code)
- [ ] DB count: lesson_phrases, transcript_vocab, words, srs_items, corpus_productions, corpus_lookups
- [ ] Inspect lesson_phrases structure — word/phrase split, fields
- [ ] Confirm corpus_productions is writing to DB consistently
- [ ] Confirm corpus_lookups is capturing quick-translate lookups

### Layer 2 — Schema
- [ ] Add vocab_items table (migration in main.js)
- [ ] Add VOCAB_WEIGHTS to kvAPI defaults
- [ ] Add VOCAB_THRESHOLDS to kvAPI defaults

### Layer 3 — Source pipelines
- [ ] Yoshi pipeline: lesson notes save → extract from lesson_phrases → upsert vocab_items
- [ ] Writing pipeline: writing session complete → corpus_productions × corpus_lookups → weight formula → upsert
- [ ] Lookup pipeline: hook _corpusWriteLookup() → increment count → promote at threshold
- [ ] N5 migration: one-time load of words table → vocab_items at weight 0.3

### Layer 4 — SRS review UI
- [ ] Rewrite words-sub-vocab to pull from vocab_items
- [ ] Card UI: word, reading, meaning, source tag, weight
- [ ] SM-2 review writes back to vocab_items
- [ ] Delete words-sub-game (HTML, JS, subtab entry)

### Layer 5 — Settings levers
- [ ] Vocab weights section in settings panel
- [ ] Lookup threshold input
- [ ] Production decay threshold input

### Layer 6 — Downstream (after Layer 4 stable)
- [ ] Grammar drill sentence generation uses vocab_items weight profile
- [ ] Sentence construction activity same
- [ ] Cost tagging on vocab API calls

### Deferred
- Phrase vs word distinction in drill card UI
- Recency decay curve tuning
- Per-word encounter history log
