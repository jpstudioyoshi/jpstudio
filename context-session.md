# jpStudio — Session Context
*Updated: 2026-06-28*

---

## Current Focus: Vocab DB Cleanup (completed this session)

---

## What Changed This Session (2026-06-28)

### vocab_items deduplication
- **294 cross-source duplicate rows removed** — same word inserted by different sources (n5, yoshi_vocab, writing, lookup) each created their own row under old `UNIQUE(word, source)` constraint
- **`UNIQUE(word, source)` → `UNIQUE(word)`** — one row per word, enforced at DB level
- **31 kana/kanji variant pairs merged** — e.g. わかる/分かる, まいにち/毎日, 朝ご飯/朝御飯/朝ごはん. Keeper = canonical written form; SRS rows remapped to keeper id
- **vocab_items now 1191 words** (was 1545 with duplicates, 1222 after cross-source dedup, 1191 after kana/kanji merge)
- **SRS rows remapped** — 259 `vocab_srs` rows pointed at duplicate ids; all remapped to keeper ids before deletion

### Insert path upgrades
All insert paths now use `ON CONFLICT(word) DO UPDATE SET entry_weight = MAX(entry_weight, excluded.entry_weight), source = CASE WHEN excluded.entry_weight > entry_weight THEN excluded.source ELSE source END`
- Yoshi seeing an n5 word upgrades it from weight 0.3 → 1.0
- `backfillLessonPhrasesToVocabItems` — upgraded
- `initLessonVocabListener` — upgraded
- `extractWritingVocabToItems` — upgraded
- `initLookupVocabListener` — already had DO UPDATE, now also upgrades weight/source

### `createSchema` in main.js
- `vocab_items` schema definition updated from `UNIQUE(word, source)` to `UNIQUE(word)` — was causing fresh-install conflict
- `INSERT INTO schema_version VALUES (1)` → `INSERT OR IGNORE INTO schema_version VALUES (1)` — fixes startup error log

### Bug fixes
- **`vocabKnownRecent()`** — was synchronous `window.db.query()` (silently returned Promise object, not rows). Now `async`, returns graduated words correctly. Grammar sentence drill callers (`gdGenerate`, `_gramSentGenerateOne`) now `await` it — Claude now gets real vocab context for sentence construction
- **270 graduated words** now passed to Claude for sentence generation

### Cleanup
- **Dead speaking mode UI removed** from `index.html` — `vocabWtDirSpeaking`, `vocabSessionSizeSpeaking` inputs
- **Dead JS references removed** from `vocabSettingsLoad` / `vocabSettingsSave`

---

## Vocab Drill — Current State

### How the pool works
1. `loadVocabItemsDeck(direction)` queries `vocab_items LEFT JOIN vocab_srs` for words where `srs_due <= today OR srs_due IS NULL`, filtered by direction
2. Words weighted by `entry_weight × source_weight × direction_weight`; reviewed words flatten to 0.35
3. `startNewSession()` caps at 100 total, up to 100 new words
4. Ratings write to `vocab_srs(vocab_id, direction, ...)` — direction-aware, separate intervals per direction
5. Focus mode (any source filter checked) = no SRS writes, pure flashcards

### vocab_items — 1191 words, sources
| source | entry_weight |
|--------|-------------|
| yoshi_phrases | 1.0 |
| yoshi_vocab | 1.0 |
| writing | 0.9 |
| lookup | 0.6 |
| n5 | 0.3 |

Source reflects highest-priority source that has seen the word. Insert paths upgrade on conflict.

### vocab_srs — 270 graduated words as of 2026-06-28
Direction-aware: separate `srs_interval`, `srs_ease`, `srs_due` per `(vocab_id, direction)`.

---

## Vocab Drill — Outstanding Work

**High priority**
- MAX_NEW tuning — bring back to 15–20 once review backlog builds
- New word clustering — max 2 new words from same `lesson_session_id` per session (Nation: avoid thematic clustering). Requires adding `lesson_session_id` to `vocab_items`.
- Exposure count queue ordering — new words ordered by input frequency, not just `entry_weight`. Add `exposure_count` to `vocab_items`.

**Medium priority**
- `wordEnrichWithSRS()` still reads from old `DrillSRS` / `STORAGE_KEYS.DRILL_SRS_WORDS` — should read from `vocab_srs` table
- `isWordMastered()` still uses old SRS key — currently always returns false; low impact as mastery display not used

**Kana/kanji variants (separate problem, not fully solved)**
- 45 reading-groups with multiple word forms remain (genuine homophones vs same-word variants)
- Genuine homophones (花/鼻, 速い/早い) are correct — keep both
- Occasional new kana variants may slip through at insert time; not worth engineering against
- Writing extraction already normalises pure-hiragana → kanji via `words` table lookup

---

## 足跡 (Ashiato) — Evidence-Driven Grammar Coverage

### What it is
Passive evidence layer tracking exposure, noticing, production, consolidation as qualitatively distinct events. Replaces single mastery score. Full design doc: `ashiato-plan.md`.

### Implementation status
| Stage | Description | Status |
|---|---|---|
| 1 | Fix `extracted_grammar` persistence | ✅ Already working |
| 2 | Video→grammar-node linking (rule-based) | ⬜ Not started — design doc exists |
| 3 | Structural blindness detection | ⬜ Not started — data ready |
| 4 | Coverage grid 2×2 visual states | ⬜ Not started |
| 5 | Briefing integration | ⬜ Not started |

### Recommended next step: Stage 3
- Real session data available
- Pure query work — no pattern definitions required
- Nodes appearing in `extracted_grammar` repeatedly but with low `grammar_mastery` score = structural blindness
- Surface as sprint card in 集中 panel

### Key files
| File | Role |
|------|------|
| `ashiato-plan.md` | Full design document |
| `video-grammar-node-linking.md` | Stage 2 design doc |
| `src/features-progress.js` | `renderGrammarCoverage`, `grammarNodeClick`, `ashiatoFilterPills` |
| `src/features-lesson-notes.js` | `lessonNotesExtractGrammarSilent` |
| `src/GrammarModel.js` | `getCoverageMap`, `recordEvidence`, mastery scoring |
| `src/data/grammar_nodes.json` | 55 node definitions |

---

## Grammar Node System
- 55 nodes in `src/data/grammar_nodes.json`
- Keys are integers (`"0"`, `"1"`) but each node has a string `id` field (`"desu"`, `"te_iru"`)
- `GrammarModel.getCoverageMap()` returns objects using the string `id`
- `grammar_mastery` table uses string node IDs

---

## DB Quick Reference

```sql
-- Sessions with grammar data
SELECT id, date, extracted_grammar FROM lesson_sessions
WHERE extracted_grammar IS NOT NULL AND extracted_grammar != '[]';

-- Grammar mastery by node
SELECT node_id, score, evidence_type FROM grammar_mastery ORDER BY node_id;

-- Vocab SRS state
SELECT v.word, s.direction, s.srs_interval, s.srs_due
FROM vocab_items v JOIN vocab_srs s ON s.vocab_id = v.id
ORDER BY s.srs_due LIMIT 20;

-- Vocab items by source
SELECT source, COUNT(*) as n FROM vocab_items GROUP BY source;

-- Graduated words count
SELECT COUNT(*) FROM vocab_srs WHERE srs_graduated = 1;

-- Duplicate check (should return 0)
SELECT COUNT(*) FROM (SELECT word FROM vocab_items GROUP BY word HAVING COUNT(*) > 1);
```

---

## Key Files

| File | Role |
|------|------|
| `src/core-vocab.js` | All drill logic: `loadVocabItemsDeck`, `startNewSession`, `markVocab`, `renderVocab`, `vocabKnownRecent` (async) |
| `src/core-srs.js` | `DrillSRS` SM-2 — used by counters, conjugation, times. NOT vocab drill. |
| `src/features-grammar.js` | Grammar/sentence drills — awaits `vocabKnownRecent()` for sentence context |
| `main.js` | `createSchema` — `UNIQUE(word)` on vocab_items, `INSERT OR IGNORE` on schema_version |
| `vocab-drill-handoff.md` | Full handoff doc for vocab drill redesign |

---

## Working Rules (Reminders)

- All terminal commands prefixed `cd ~/Documents/jpStudio &&`
- One command at a time — wait for output
- `node check-syntax.js` after every JS edit
- `git add -A && git commit -m "..."` per logical unit
- Read before theorising — always check actual source before proposing fixes
- Hypothesis-first debugging — one command to confirm/deny, stop if not converging
- MCP filesystem available at `/Users/paulandres/Documents/jpStudio/`
- `index.html` is a single giant line — use Python index slice (`html.find()` + slicing), not line-based tools
- `assert html.count(old) == 1` before every replace
- `window.db.run()` returns `{changes: 0}` even on successful batch INSERTs — not an error
- Live DB must be queried via `window.db.query()` in DevTools — sqlite3 CLI returns stale results when app is open
