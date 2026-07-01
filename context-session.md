# Session Context — 2026-07-01

## Summary
Three areas touched: counters reference table (restored), a DB corruption
incident (fixed), and a cluster of `vocab_items`/`core_vocab` bugs found
and fixed while setting up an N5 triage workflow. All committed
incrementally; see git log for individual commit messages.

---

## 1. Counters reference table (Words → Counters)

**Problem:** a full reference table (all counter categories × readings
1–10) used to exist but had been silently repurposed into a checkbox
selector; the container div was force-hidden.

**Fix:** `countToggleRefTable()` in `core-counters.js` now builds and
shows an overlay modal (same pattern as the existing `countShowLookup2`
popup) with all `COUNTER_DATA` categories, tap-to-hear on each reading.
Wired to a "Show table" button in the Words → Counters footer.

**Status:** ✅ Working, committed.

---

## 2. Database corruption incident

**Symptom:** `sql.js init failed: UNIQUE constraint failed:
schema_version.version` on every launch, even from a clean single
process.

**Cause:** `schema_version` table had 3 rows (11, 12, 13) instead of 1.
Likely caused by two Electron processes (a stale `.command` shortcut in
`.Trash`, still pointing at the correct source dir, plus a fresh `npm
start`) briefly writing to the same db file concurrently.

**Fix:** one-time SQL cleanup —
```sql
DELETE FROM schema_version; INSERT INTO schema_version VALUES (13);
```
No code change needed; `PRAGMA integrity_check` confirmed the db file
itself was not corrupted, only this one table's row count.

**Status:** ✅ Resolved.

---

## 3. `vocab_items` / `core_vocab` cluster (main work of the session)

### Root problem discovered
An old one-time backfill (`backfillN5ToVocabItems`) tagged all N5/N4
words as `source='n5'` *before* the current `core_vocab` pool concept
existed. Because `vocab_items.word` has a UNIQUE constraint, ~640 words
that had already entered the system another way (Yoshi lessons, writing,
lookups) never got claimed by later `core_vocab`-only logic — they stayed
under their original source, invisible to anything filtering on
`source='core_vocab'`.

### Fixes applied, in order
1. **Excluded Yoshi from the SRS drill entirely** (temporary, explicit
   request) — `vocabGetActiveSources()` now strips `yoshi_phrases`/
   `yoshi_vocab` from its return value regardless of filter state. Marked
   with a `TEMP (2026-07)` comment for easy reversal later.
2. **Relabeled the stuck words**: `UPDATE vocab_items SET
   source='core_vocab' WHERE source='n5'` — recovered 660 words (349 N4 +
   248 N5 + 63 custom-level).
3. **Repointed the dead "N5" filter checkbox and weight slider** in Words
   → Vocab (previously filtered/weighted on `source='n5'`, which no
   longer matches anything post-relabel) to use `core_vocab` instead.
4. **Built a triage tool** (`triageStart()` / `_triageMark()` /
   `_triageRenderOverlay()` in `core-vocab.js`) for fast first-pass
   sorting of the N5 backlog:
   - Filters by `words.level`, not `vocab_items.source` (level is the
     stable fact; source is just provenance — this was the actual
     lesson from the relabel bug).
   - Flip-card UI: front shows word+reading (JP→EN) or meaning (EN→JP)
     per current direction toggle; "Show answer" reveals the other side.
   - Keyboard: Space = flip, 1 = don't know, 2 = already know.
   - **Per-direction tracking**: marking "know" only writes the
     `vocab_srs` row for the direction currently being triaged, not both
     — so JP→EN and EN→JP triage progress independently, since a full
     pass in one direction in one sitting isn't realistic.
   - "Already know" seeds a 14-day interval; "don't know" is a no-op,
     word falls back into normal 12/session onboarding.
   - "Triage N5" button added next to the direction toggle in Words →
     Vocab — no console needed.
5. **Fixed a recurring reading/meaning bug** — the lookup-promotion
   listener (and, preventively, the writing-extraction and
   lesson-phrase listeners) fetched a word's `id` from `words` but
   ignored the `reading`/`meaning` sitting in the same row, so words
   with no reading supplied elsewhere landed blank in `vocab_items`.
   Fixed at all three insert sites, **then fixed again at the root**:
   `loadVocabItemsDeck()`'s and `triageStart()`'s SQL now `COALESCE`
   `vocab_items.reading/meaning` with `words.reading/meaning` at read
   time, so this class of bug can't recur even from an insert path not
   yet written.
6. **Fixed N5/N4 mixing in the live drill** — once the relabel completed,
   N5 and N4 words competed equally for the same 12-new-per-session slot,
   ordered by recency rather than level (N4, being newer, could actually
   edge out remaining N5 unknowns). Fixed: `startNewSession()` now sorts
   the new-core pool by level (N5 before N4) before applying the
   `MAX_NEW_CORE=12` cap. Requires `w.level` now included in
   `loadVocabItemsDeck`'s SELECT (added via the same LEFT JOIN used for
   the COALESCE fix above).

### Data fixes applied directly via sqlite3 CLI
- `schema_version` row cleanup (see section 2)
- `source='n5'` → `source='core_vocab'` relabel (660 rows)
- 5 specific `vocab_items` rows with missing readings repaired
  (ids 4859, 4871, 4888, 4935, 5357 — all `source='lookup'`)

**Status:** ✅ All fixed and committed. Confirmed via diagnostic queries
that the reading/meaning bug's damage was fully limited to those 5 rows
(writing/yoshi_phrases paths were dormant risk, not live damage).

---

## Architecture note — the three-bucket model (confirmed still valid)

1. **`words`** — dictionary. Fixed linguistic facts (reading, meaning,
   level, frequency). Doesn't change based on app usage.
2. **Historical event log** — `corpus_entries`/`corpus_lookups`/
   `corpus_productions` + derived views. What has happened, audit trail.
3. **`vocab_items` + `vocab_srs`** — forward-looking drill queue. Which
   words are eligible to drill (`vocab_items`) and when they're next due
   per direction (`vocab_srs`).

This split is sound. The leak was never the three-way separation itself —
it was `vocab_items` storing its own copies of `reading`/`meaning`
instead of always deferring to `words`, which is now closed at read time
(section 3.5 above).

**Known, accepted exception:** ~70 `vocab_items` rows have no `word_id`
link — genuine custom/Yoshi vocabulary not in the `words` dictionary.
`COALESCE` naturally falls through to their local values for these; no
regression.

**Separate system, not touched:** the AI briefing feature
(`vocabPriorityContext`/`vcBuildPriorityList`/`vcBuildList`) builds its
own priority list from `JLPT_WORDS` + kanji corpus, entirely independent
of `vocab_items`. Not currently broken, but it means the briefing's sense
of "what's worth reviewing" and the drill's actual SRS state can diverge.
Flagged for awareness only.

### Dormant backfill functions (not a problem, just naming)
`migrateLearnedWordsToVocabItems`, `backfillLessonPhrasesToVocabItems`,
`backfillLookupsToVocabItems`, `backfillN5ToVocabItems` — all one-time
migrations, flag-gated, already run, will never run again. Retained as
historical record of how `vocab_items` was originally populated before
the live event-listeners existed. "Forward-looking" describes the
bucket's ongoing job (drill queue), not a claim that nothing in it was
ever backfilled from history.

---

## Key files touched this session
| File | Role |
|------|------|
| `src/core-counters.js` | Counter reference table overlay |
| `src/core-vocab.js` | Yoshi exclusion, triage tool, reading/meaning fixes, N5/N4 ordering |
| `index.html` | Counters "Show table" button, Vocab "Triage N5" button, N5 filter checkbox relabel |
| `main.js` | (not edited — schema_version issue was pure data, no code bug found) |

## DB Quick Reference (new queries from this session)
```sql
-- Check for the reading/meaning bug recurring
SELECT v.source, COUNT(*) as n
FROM vocab_items v JOIN words w ON w.id = v.word_id
WHERE (v.reading IS NULL OR v.reading='') AND w.reading IS NOT NULL AND w.reading != ''
GROUP BY v.source;
-- Should always return empty now (COALESCE fix makes this cosmetic anyway,
-- but empty = no insert path is silently writing bad data either)

-- Triage progress by direction
SELECT 'jp_en known' as what, COUNT(*) as n
FROM vocab_items v JOIN words w ON w.id=v.word_id
JOIN vocab_srs s ON s.vocab_id=v.id AND s.direction='jp_en'
WHERE w.level='N5'
UNION ALL
SELECT 'en_jp known', COUNT(*)
FROM vocab_items v JOIN words w ON w.id=v.word_id
JOIN vocab_srs s ON s.vocab_id=v.id AND s.direction='en_jp'
WHERE w.level='N5';

-- Sprint gate status (has coreVocabDailyIntake switched N5→N4 yet?)
SELECT COUNT(*) as n5_remaining_unlinked FROM words w
WHERE w.level='N5' AND NOT EXISTS (SELECT 1 FROM vocab_items v WHERE v.word_id = w.id);
```

## On the horizon (from this session, not yet done)
- Revert the temporary Yoshi exclusion in `vocabGetActiveSources()` once
  a real decision is made about how Yoshi words should weight against
  the core sprint (currently just hard-blocked, marked `TEMP (2026-07)`).
- N4 triage — `triageStart('N4')` works today (level param already
  supported) but hasn't been run/tested yet.
- Consider whether `vocabPriorityContext` (briefing) should eventually
  read from `vocab_items`/`vocab_srs` instead of its independent
  `JLPT_WORDS`-based list — not urgent, flagged only.
