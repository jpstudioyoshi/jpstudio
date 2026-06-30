# jpStudio — Session Context
*Updated: 2026-06-30 (later session)*

---

## This Session (2026-06-30, continued): FK Migration + Core Vocab Sprint Pool

This picked up directly from the architecture discussion logged below
("Major finding — vocabulary data architecture") and carried it through to
a working implementation, then designed and built a new core-vocabulary
SRS pool on top of it.

### Part 1 — FK migration (Option A from the architecture findings)
- Backed up DB before any schema work.
- Re-confirmed overlap counts matched the original findings (944/1014
  vocab_items matched a words row by text — no drift).
- Added `vocab_items.word_id INTEGER REFERENCES words(id)`, backfilled for
  all 944 matching rows. 70 unmatched rows left `word_id = NULL` (no
  corresponding `words` entry exists for them).
- Fixed the original bug that started the investigation:
  `lessonNotesExtractVocabSilent` (`features-lesson-notes.js`) was writing
  `words` and `vocab_items` as two separate, unlinked INSERTs from the same
  extracted data, AND its `ON CONFLICT` clause on `words` never refreshed
  `reading`/`meaning` (stale data forever once written). Fixed to
  upsert `words` first (now correctly refreshing reading/meaning on
  conflict), then link `vocab_items` to it via `word_id`.
- `buildConjVerbPool` (`features-grammar.js`) updated to join
  `vocab_items`→`words` via `word_id` instead of fragile `v.word = w.word`
  text matching, and to prefer `words`' canonical reading/meaning via
  `COALESCE` when a link exists.
- All three **live** `vocab_items` writers (`extractWritingVocabToItems`,
  `initLessonVocabListener`, `initLookupVocabListener`) now look up and set
  `word_id` on insert. The three legacy one-time backfill functions
  (`migrateLearnedWordsToVocabItems`, `backfillLessonPhrasesToVocabItems`,
  `backfillLookupsToVocabItems`) were left untouched — they're already
  flagged complete via `kvAPI` and will never run again on this install, so
  editing them has no effect.
- **Deliberately not touched**: the dead `source='n5'` bucket (640 rows,
  559 with no independent justification beyond a one-time bulk copy of the
  entire `words` table at low weight). Confirmed as a historical artifact,
  not a foundation to build on. Left alone, not deleted or relabeled.

### Part 2 — Core-vocab N5/N4 sprint pool (new feature, full design doc:
`core-vocab-srs-design.md`, written this session)

**Design** (all decisions confirmed with user during this session):
- Cohort = `words WHERE level IN ('N5','N4')` — confirmed counts: N5=377,
  N4=401, total=778 (matches user's original estimate; `list_source` is
  NOT reliable for this — all 778 rows have `list_source=NULL` because
  that column was added in a schema migration after the original seed ran,
  and `ALTER TABLE ADD COLUMN` doesn't backfill existing rows. `level` is
  reliable per-row despite the seed JSON interleaving N5/N4 with no
  grouping).
- Two sequential sprints: N5 first, then N4. Each frequency-ordered
  (`ORDER BY frequency ASC`, NULLs last) within its sprint.
- Daily intake: 10–15 new words/day (default `batchSize=12`), lazy
  creation — `vocab_items` rows only created when a word's turn comes up,
  not pre-seeded for the whole 778.
- Catch-up logic: compares actual-introduced-so-far against
  expected-so-far (days-elapsed × batchSize); raises today's effective cap
  to close the gap, bounded at `batchSize × maxCatchupMultiple` (default
  2×) so a long gap doesn't dump the whole backlog in one session.
- Lookup-promotion threshold raised from flat `count >= 2` to **3 distinct
  days OR 5 total lookups**, whichever comes first (catches both the
  spaced-need case and the high-volume-burst case).
- SRS scheduling is now reserved for `core_vocab` and `lookup` sources
  only — Yoshi (`yoshi_vocab`/`yoshi_phrases`) and `writing` are exposure
  material, browsed without graded scheduling, **always** (not just under
  the existing filter-triggered "focus mode" — `markVocab()` now gates on
  `card.source`, via new `_srsAllowed` const, regardless of filter state).
- Default vocab deck (no source filter checked) now shows **core_vocab
  sprint only**, not all sources — `vocabGetActiveSources()` returns
  `['core_vocab']` instead of `null` when nothing's checked.
  `vocabResetSourceFilters()` ("Reset" button) changed to *uncheck*
  everything (back to sprint-only baseline) instead of *checking*
  everything (which used to mean "show all sources").
- `core_vocab` gets its own session-display cap (`MAX_NEW_CORE = 12`) in
  `startNewSession()`, additive alongside the pre-existing
  `MAX_NEW_YOSHI=8`/`MAX_NEW_OTHER=7` — confirmed this is NOT double load
  in practice, since the two directions diverge in scheduling after first
  review rather than staying paired.
- Direction alternation (originally discussed: alternate which direction
  "leads" by calendar day) — **dropped**. The vocab drill UI is
  single-direction-per-session (`vcDirection` toggle), not interleaved, so
  there was no actual point in a session where "which leads" would be
  visible. User confirmed manual toggle is sufficient.
- New "Hide" button (`hideVocabWord()`) — sets `vocab_items.type='excluded'`
  for the current card (already filtered out by `loadVocabItemsDeck`'s
  existing `type != 'excluded'` clause). Reversible, no deletion. Added
  for junk lookup-promoted words that crossed the old (lower) threshold
  before it was tightened.

### Bugs found and fixed during build/test (real, not hypothetical —
caught by actually using the feature after building it)
1. **`coreVocabDailyIntake` pre-created `vocab_srs` rows with
   `srs_due = today`** — this broke the session-loader's new-word
   detection (`_isNew = srs_due == null`), making sprint words look
   already-reviewed/due instead of new. They got the flat 0.35 due-weight
   instead of full new-word weight, and skipped the `MAX_NEW_CORE` cap
   entirely — Yoshi/lookup words outranked them in the first real session.
   **Fixed**: stopped pre-creating `vocab_srs` rows; they now form
   naturally on first review, matching the convention every other source
   already follows. (9 already-created sprint words from the affected
   period had their premature `vocab_srs` rows manually deleted via a
   one-off query, checked against `drill_results` so nothing already
   reviewed was touched.)
2. **SM-2 first-review interval bug**: `newInterval = Math.floor(curInterval
   * curEase)` was applied even on a word's very first successful review,
   jumping straight to ~2 days instead of standard SM-2's exactly-1-day
   first interval. Fixed in both `know` and `gotit` branches — first
   review (`curGraduated === 0`) now always schedules 1 day; the
   ease-multiplied growth only kicks in from the second review onward.
3. **The SRS-source-gating edit (`_srsAllowed`) silently failed to land**
   on an earlier attempt despite an apparent success confirmation —
   discovered only by re-reading the live file directly before a
   follow-up edit. Re-applied successfully on the next attempt, bundled
   with the interval fix. **Lesson**: don't trust a printed "OK" as proof
   a multi-script edit landed if there's any gap before the next syntax
   check / git diff — verify against the actual file when something
   downstream doesn't match expectations.
4. **Quick-translate sentence guard** (`doTranslate` in `core-stt.js`):
   pasting whole sentences was calling `kanjiCorpusRecordLookup` on the
   full text — not collecting the sentence as a vocab unit, but bumping
   the lookup count of every individual kanji *character* in the sentence
   (the function is character-level despite the `corpus_lookups.word`
   column name implying word-level). This fed the lookup-promotion
   threshold with noise from incidental sentence-pasting. Fixed: skip
   recording when input contains `。！？` or exceeds 8 characters.

### Outstanding from this session
- The 70 `vocab_items` rows with no matching `words` row (`word_id IS
  NULL`) — not yet addressed, not urgent.
- Filter-stack UX for Yoshi/Writing/Lookup/N5 (beyond the new sprint-only
  default) — user explicitly deferred this ("I will decide how filtered
  stacks work later").
- `vocabGetActiveSources()`'s tag/column scheme question from the original
  design doc (pool vs source-based filtering) — resolved in practice via
  the `pool` column (`core_n5`/`core_n4`) added this session, used by
  `coreVocabDailyIntake` internally; not yet exposed in any UI filter.
- Per-sprint completion flag (fires when every word in a sprint has been
  shown at least once in both directions) — designed in
  `core-vocab-srs-design.md` but not yet implemented as code.

---

## Major finding — vocabulary data architecture (RESOLVED this session)
~~Discovered jpStudio has no unified vocabulary database...~~ — see Part 1
above. FK added, backfilled, both root-cause bugs fixed, live writers
updated. `default_vocab.json`/`state.vocab` (273 words, separate from both
DB tables) was NOT addressed this session — still a third disconnected
source, out of scope for this pass.

**Full writeup**: `vocab-architecture-findings.md`. **New design doc this
session**: `core-vocab-srs-design.md`.

---

## Previous Session (2026-06-29): Kana Overhaul + Dead Code Cleanup

### Kana Input — Key Decision
The JS romaji→kana converter was overengineered. The macOS Japanese IME
(Kotoeri) handles romaji→kana, kana→kanji picker, katakana (via shift), and
per-field memory — all better than the custom implementation. jpStudio is
macOS-only (single user), so OS coupling is fine. Input source is a simple
two-way toggle: German ↔ Japanese Kana (fn key).

### Completed
**Kana overhaul**
- `el._useOsIme = true` set on all inputs in `_initKanaToolbars()` — JS
  converter bypassed everywhere
- `kanaToolbar()` no longer called for any input — A/ひ/カ mode buttons gone
  from all panels
- `compositionend` kanji deletion fixed — guarded with `!el._useOsIme`
- `_snapshotPos` stale boundary fix — clamped to `insertStart` in
  `kanaInputHandler`
- Writing panel Enter freed for IME picker — Cmd+Enter = check,
  Cmd+Shift+Enter = submit

**Dead code removed**
- `kanaToolbar` calls removed from 6 files; `kanaSetMode`/`listenTransSetMode`/
  `setGlobalQTMode`/`setWritingMode`/`wireWritingBtn` calls removed across
  `core-stt.js`, `core-vocab.js`, `core.js`, `core-listen.js`,
  `core-foundation.js`
- `lnSearchKanaMode` function deleted from `features-lesson-notes.js`
- Duplicate voice/API settings panel removed from Resources panel
  (`ttsVoiceSelect2`/`ttsVoiceHint2`, `toggleResourcesSettings`)

**DB cleanup**
- 199 `yoshi_phrases` entries deleted from `vocab_items` (lesson note
  artifacts, not real vocab) + 17 associated `vocab_srs` rows
- Entry path still exists but `loadVocabItemsDeck` filters
  `type='phrase'`/`type='grammar'` — only `type='word'` enters SRS

### Dead Code Still Remaining (deferred)
- `src/features-kana.js` — bulk of file now dead: `ROMAJI_MAP`,
  `romajiToHiragana`, `romajiToKatakana`, `kanaInputHandler`,
  `_kanaSyncCursor`, `kanaOn`, `kanaOff`, `kanaToggle`, `kanaAddToggle`,
  `kanaSetMode`, `kanaToolbar`. Keep `kanaToKanji`, minimal
  `_initKanaToolbars`
- Scattered `kanaOn`/`kanaOff`/`kanaAddToggle` calls remain in
  `core-writing.js`, `features-lesson-notes.js`, `features-grammar.js`,
  `features-stroke.js`, `core-counters.js`, `core-stt.js`
- `src/ui/TextEntry.js` — kanaToolbar wrapper infrastructure

---

## Vocab Drill — Current State (UPDATED this session)

### How the pool works now
1. `loadVocabItemsDeck(direction)` queries `vocab_items LEFT JOIN vocab_srs`
   for words due today or never reviewed. Default source filter (none
   checked) = `core_vocab` only, not all sources.
2. Words weighted by `entry_weight × source_weight × direction_weight`;
   reviewed words flatten to 0.35.
3. `startNewSession()` caps at 100 total; new words capped 8 (yoshi) + 7
   (other) + **12 (core_vocab, new this session)** per session, additive.
4. Ratings write to `vocab_srs(vocab_id, direction, ...)` — direction-aware
   — **but only for `core_vocab`/`lookup` sources now** (`_srsAllowed`
   gate in `markVocab`, new this session). Yoshi/writing words never get
   graded scheduling, even outside focus mode.
5. Focus mode (source filter active) still also disables SRS writes,
   redundantly with #4 for Yoshi/writing, but matters if you filter to
   `core_vocab`/`lookup` and want a no-score browse session.
6. Filter excludes `type='grammar'`/`'excluded'`/`'phrase'`. New "Hide"
   button sets `type='excluded'` on demand for any card.
7. First SM-2 review now correctly schedules exactly 1 day out (was ~2
   days due to applying the ease multiplier on review #1 — fixed this
   session).

### vocab_items — ~1014+ words (growing via daily core_vocab intake)
FK to `words` now in place (`word_id`) for all rows with a matching
dictionary entry. See architecture finding above — root cause resolved.

### Outstanding
**High priority**
- Per-sprint completion flag — designed, not yet coded
- Decide what to do with the 70 `word_id IS NULL` vocab_items rows
- Filter-stack UX (Yoshi/Writing/Lookup/N5 alongside the new Sprint
  filter) — explicitly deferred by user

**Medium priority**
- `wordEnrichWithSRS()` still reads from old `DrillSRS` — should read from
  `vocab_srs`
- `isWordMastered()` still uses old SRS key
- `default_vocab.json`/`state.vocab` — third disconnected vocab source,
  never addressed

---

## Conjugation Drill — SRS Notes
- Full per-transformation SRS design (`CONJ_SRS_DESIGN.md`) was never built
- What exists: simple SM-2 via `DrillSRS` keyed by `(word, form)` item_key
- "SRS Due" toggle (`conjToggleSrsMode`) filters the pool to due-only items
  when ON; does NOT gate whether ratings get written — rating an item while
  OFF still reschedules it early, disrupting the spacing schedule
- If true no-impact free-practice mode is wanted, needs a code change to
  skip the SRS write when toggle is off (not yet done) — note: this is the
  SAME bug pattern just fixed for the vocab drill this session
  (`_srsAllowed` gating). Worth applying the same fix here if conjugation
  free-practice becomes a priority.

---

## 足跡 (Ashiato) — Evidence-Driven Grammar Coverage

### Implementation status
| Stage | Description | Status |
|---|---|---|
| 1 | Fix `extracted_grammar` persistence | ✅ Working |
| 2 | Video→grammar-node linking | ⬜ Not started |
| 3 | Structural blindness detection | ⬜ Not started — data ready |
| 4 | Coverage grid 2×2 visual states | ⬜ Not started |
| 5 | Briefing integration | ⬜ Not started |

### Recommended next step: Stage 3
5+ sessions of real `extracted_grammar` data available. Pure query work — no
pattern definitions required. Nodes appearing repeatedly with low
`grammar_mastery` = structural blindness. Surface as sprint card in 集中 panel.

### Key files
| File | Role |
|------|------|
| `ashiato-plan.md` | Full design document |
| `video-grammar-node-linking.md` | Stage 2 design doc |
| `src/features-progress.js` | `renderGrammarCoverage`, `grammarNodeClick` |
| `src/features-lesson-notes.js` | `lessonNotesExtractGrammarSilent` |
| `src/GrammarModel.js` | `getCoverageMap`, `recordEvidence`, mastery scoring |
| `src/data/grammar_nodes.json` | 55 node definitions |

---

## Focus Sprint — Known Issue (deferred)
KEY FORMS grid fourth column (note text) wraps too early. Fix:
- `width:100%` on `shuchuIntroContent` div in `index.html`
- `width:100%` on grid in `features-shuchu.js` (currently `width:max-content`
  — revert this)

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

-- Vocab items by pool (sprint tracking, new this session)
SELECT pool, COUNT(*) as n FROM vocab_items WHERE pool IS NOT NULL GROUP BY pool;

-- words/vocab_items FK link status (new this session)
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN word_id IS NOT NULL THEN 1 ELSE 0 END) as linked,
  SUM(CASE WHEN word_id IS NULL THEN 1 ELSE 0 END) as unlinked
FROM vocab_items;

-- Core-vocab sprint progress (N5/N4 words not yet in vocab_items)
SELECT level, COUNT(*) as remaining FROM words w
WHERE level IN ('N5','N4')
  AND NOT EXISTS (SELECT 1 FROM vocab_items v WHERE v.word_id = w.id)
GROUP BY level;

-- Find vocab_items with missing reading or meaning
SELECT id, word, reading, meaning, source FROM vocab_items
WHERE (reading IS NULL OR reading = '') OR (meaning IS NULL OR meaning = '');
```

---

## Key Files

| File | Role |
|------|------|
| `src/core-vocab.js` | All drill logic: `loadVocabItemsDeck`, `startNewSession`, `markVocab`, `renderVocab`, focus mode, `coreVocabDailyIntake` (new), `hideVocabWord` (new) |
| `src/core-srs.js` | `DrillSRS` SM-2 — used by counters, conjugation, times. NOT vocab drill. |
| `src/core-writing.js` | Writing panel — Cmd+Enter=check, Cmd+Shift+Enter=submit |
| `src/core-foundation.js` | App init, `_translateCache`, `JLPT_WORDS` load, vocab lookup self-heal |
| `src/core-stt.js` | `doTranslate` — now skips kanji-corpus recording for sentence-length input (new this session) |
| `src/features-grammar.js` | `buildConjVerbPool` — now FK-joined to `words` (updated this session) |
| `src/features-lesson-notes.js` | `lessonNotesExtractVocabSilent` — double-write bug fixed this session |
| `src/features-kana.js` | Kana system — mostly dead, `_useOsIme` flag is the live mechanism |
| `src/features-core.js` | TTS voice management, API key |
| `main.js` | `render-process-gone` handler (auto-reload disabled) |

---

## Working Rules (Reminders)

- All terminal commands prefixed `cd ~/Documents/jpStudio &&` (the `jp &&`
  alias) — **every fresh terminal window needs this prefix again**, it does
  not persist across windows
- One command at a time — wait for output
- `node check-syntax.js` after every JS edit
- `git add -A && git commit -m "..."` per logical unit
- Read before theorising — always check actual source before proposing fixes
- Hypothesis-first debugging — one command to confirm/deny, stop if not
  converging
- **If a printed "OK" success message isn't followed promptly by a syntax
  check/commit, don't assume the edit landed — re-view the actual file
  before building on top of it.** (This bit us this session — an edit
  silently failed to persist despite an apparent success message.)
- MCP filesystem available at `/Users/paulandres/Documents/jpStudio/`
  (read-only)
- `index.html` is a single giant line — use Python `find()` + slicing,
  not line-based tools
- `assert content.count(old) == 1` before every replace — if it fails,
  nothing is written (safe), but check whether the failure is because the
  text already changed (re-run of an already-applied script — harmless)
  or because your assumed text was wrong (re-view the file)
- `window.db.run()` returns `{changes: 0}` even on successful batch INSERTs
  — not an error
- Live DB must be queried via `window.db.query()` in DevTools — sqlite3 CLI
  / direct file access returns stale results when app is open; **close the
  app before any direct/sql.js write to the .db file**, reopen after
- DevTools console does not support `copy()` (Chrome-only) or
  `navigator.clipboard.writeText()` (needs document focus) — use
  `console.log()` and manual copy for DevTools output; `pbcopy` works fine
  for terminal output
- `words`/`vocab_items` FK now exists (`word_id`) — see this session's
  work. `default_vocab.json`/`state.vocab` remains a third, still
  disconnected vocabulary source — not addressed.
