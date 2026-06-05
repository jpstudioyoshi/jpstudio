# Vocab System Data Audit
Date: 2026-06-05

## Table Row Counts

| Table | Rows | Notes |
|---|---|---|
| `lesson_phrases` | 93 | Real curated data, high trust |
| `words` | 874 | N5 frequency list |
| `srs_items` (drill_type='words') | 198 | Only 23% of N5 list ever drilled |
| `corpus_productions` | 1392 | Active, writing + chat sources |
| `corpus_lookups` | 1180 | Active, quick-translate source |
| `transcript_vocab` | 0 | Pipeline never wired (known) |
| `vocabBookmarks` (kvAPI) | 0 | Empty, nothing to migrate |

---

## lesson_phrases

**Schema:** id, lesson_id, phrase, reading, meaning, example, created_at

**Data quality:**
- `reading` — empty on all 93 rows (will need generating or left blank)
- `meaning` — populated on all 93 rows ✅
- `example` — populated on all 93 rows ✅ (usage sentence for every item)
- `lesson_id` — nullable, some early rows not linked to a session

**Content shape — mixed, four types:**
- Single words: `はじめて`, `うるさい`
- Particles: `〜で`
- Full phrases: `わかったことを覚えています`
- Grammar patterns: `〜たことを覚えています`

**Drill card shape is clear:**
- Front: `phrase`
- Back: `meaning` + `example` sentence
- Reading: defer — not a blocker

**Phrase vs word distinction** is real and present in this data. Handling it is a later task — not needed for initial SRS wiring.

---

## corpus_productions

**Schema:** id, word, produced_at, source, context

**Sources observed:** `writing`, `chat`

**Issue — kanji-level extraction:**
Words are extracted at individual kanji level, not word level.
Example: looking up `実話` produces three rows: `実話`, `実`, `話`.
The compound word is present but so is noise.

**Implication for vocab pipeline:**
Filter needed — when building vocab_items from corpus_productions, prefer compound words over single kanji from the same context/timestamp. Single kanji (1 character) should be excluded or down-weighted unless they are standalone words (e.g. 目, 木 as vocabulary items).

**Context column** contains the full sentence — useful for provenance display on drill card.

---

## corpus_lookups

**Schema:** id, word, looked_up_at, context

**Same kanji-level extraction issue** as corpus_productions.
Same filter needed at pipeline time.

**No source column** — all lookups assumed to be from quick-translate.

---

## localStorage — Learned Words

Two separate stores, both in localStorage:

**1. `lessonNotesLearnedWords` (features-ln-p2.js)**
- Key: `lessonNotesLearnedWords`
- Content: Set of words manually marked as mastered in lesson notes word drill
- Mechanism: "hide permanently" button in lesson notes drill card
- Real user data — represents words the user has explicitly declared known
- **Must migrate** into vocab_items at low entry_weight on first launch

**2. `jpLearnedWords` (core-foundation.js)**
- Key: `jpLearnedWords`
- Defined in STORAGE_KEYS and listed in purge keys
- Never read or written anywhere in codebase
- **Dead key** — ignore, do not migrate

---

## Lesson Notes Word Drill — Half-Built Feature

`features-ln-p2.js` contains a word drill attached to lesson notes:
- Words from lesson phrases shown as drill cards
- User can mark words as permanently learned (`lessonNotesSaveHiddenPermanently`)
- Learned words stored as `LessonNotesState.permanentlyLearned` Set in memory, persisted to localStorage
- `lessonNotesShowMastered()` renders a mastered words list

**Implication:** This is the closest thing to a working vocab drill currently in the app. It uses `lesson_phrases` as its source — exactly the right source. But it is isolated from the SRS system and stores state in localStorage.

**Decision:** This feature is the seed of the new vocab drill. Rather than replacing it wholesale, the new `vocab_items` SRS system should absorb it — migrating `permanentlyLearned` words in as known items on first launch.

---

## Decisions from Audit

**corpus_productions and corpus_lookups single-kanji noise:**
Filter at pipeline entry. Rule: exclude single-character entries where a multi-character compound from the same timestamp exists. Single character entries only admitted if no compound present.

**lesson_phrases reading column empty:**
Not a blocker. Drill card works without reading for now. Reading can be generated via Claude API in a later pass if needed.

**lessonNotesLearnedWords migration:**
On first launch after vocab_items table is created, read localStorage key, insert each word into vocab_items with source='yoshi', entry_weight=0.1 (known), srs_interval=30.

**jpLearnedWords:**
Dead key. Leave in STORAGE_KEYS, do not migrate.

**transcript_vocab:**
Still zero rows. AnalysisService pipeline still not wired. Not part of this feature — remains a Phase 4 item in ARCHITECTURE_HUB.

---

## Ready to Build

Layer 1 audit complete. Proceed to Layer 2 — schema migration.

Next action: add `vocab_items` table to `main.js` schema block.
