# jpStudio — Session Context
*Updated: 2026-06-30*

---

## This Session (2026-06-30): Data Quality Fixes + Architecture Discovery

### Completed
- **隠す reading fix** + 8 other `vocab_items` rows with kanji but no reading,
  backfilled manually (5 from `words` table match, 4 typed in directly:
  七月/練習/従う/濡れた)
- **Translate cache self-heal bug fixed** — `_translateCache[word]` entries
  that got cached with an empty `en`/`reading` (due to a parse miss on the
  Claude API response) were permanently stuck empty, because the cache-hit
  branch only updated `count`/`lastLookup`, never backfilled missing fields.
  Fixed in `core-foundation.js` JP→EN branch (EN→JP branch already had this
  pattern). Now any word with a gap self-heals on next lookup.
- **6 vocab_items with empty meaning** found and deleted (all `source=lookup`,
  hit the cache bug above) — they'll re-promote correctly once looked up again
- **Conjugation "SRS Due" toggle explained** — `conjToggleSrsMode()` in
  `features-grammar.js` is a pool *filter* only (due items vs all items), not
  a participation gate. Ratings write to SRS regardless of toggle state, so
  rating an item while toggle is OFF still reschedules it early — toggle
  doesn't prevent this, just changes what's offered.

### Major finding — vocabulary data architecture (NOT YET FIXED)
Discovered jpStudio has no unified vocabulary database. `words` (985 rows,
linguistic reference) and `vocab_items` (1014 rows, SRS deck) are separate
tables with **no foreign key** — joined only by loose `word` text match.
944/1014 vocab_items match a words row by text (93%), 70 don't. A third
active source, `default_vocab.json` (273 words), is also loaded into
`state.vocab` at every startup, independent of both DB tables. This explains
the recurring missing-reading/meaning bugs — there's no structural guarantee
an SRS item has a linked canonical record.

**Full writeup + fix plan**: `vocab-architecture-findings.md` (added to
project knowledge this session). Recommended fix is Option A — add
`vocab_items.word_id → words.id` FK, backfill, prefer `words` data via join
instead of duplicating reading/meaning inline. **Deliberately deferred to its
own dedicated session** rather than rushed — use `session-start-prompt.md`
to kick that off.

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

## Vocab Drill — Current State

### How the pool works
1. `loadVocabItemsDeck(direction)` queries `vocab_items LEFT JOIN vocab_srs`
   for words due today or never reviewed
2. Words weighted by `entry_weight × source_weight × direction_weight`;
   reviewed words flatten to 0.35
3. `startNewSession()` caps at 100 total; new words capped 8 (yoshi) + 7
   (other) per session
4. Ratings write to `vocab_srs(vocab_id, direction, ...)` — direction-aware
5. Focus mode (source filter active) = no SRS writes, pure flashcards
6. Filter excludes `type='grammar'`/`'excluded'`/`'phrase'`

Full numeric breakdown: see `srs-overview.md` in project knowledge.

### vocab_items — ~1014 words after cleanup
`yoshi_phrases` source fully purged. See architecture finding above re:
reading/meaning gaps — not fully resolved, root cause identified, structural
fix deferred to dedicated session.

### Outstanding
**High priority**
- Vocabulary architecture fix (see above) — blocks reliable data quality
- MAX_NEW tuning — bring back to 15–20 once review backlog builds
- New word clustering — max 2 new words from same `lesson_session_id` per
  session

**Medium priority**
- `wordEnrichWithSRS()` still reads from old `DrillSRS` — should read from
  `vocab_srs`
- `isWordMastered()` still uses old SRS key

---

## Conjugation Drill — SRS Notes
- Full per-transformation SRS design (`CONJ_SRS_DESIGN.md`) was never built
- What exists: simple SM-2 via `DrillSRS` keyed by `(word, form)` item_key
- "SRS Due" toggle (`conjToggleSrsMode`) filters the pool to due-only items
  when ON; does NOT gate whether ratings get written — rating an item while
  OFF still reschedules it early, disrupting the spacing schedule
- If true no-impact free-practice mode is wanted, needs a code change to
  skip the SRS write when toggle is off (not yet done)

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

-- Vocab/words table overlap (architecture finding)
SELECT
  (SELECT COUNT(*) FROM vocab_items) as total_vocab_items,
  (SELECT COUNT(*) FROM vocab_items v WHERE EXISTS (SELECT 1 FROM words w WHERE w.word = v.word)) as matched_in_words,
  (SELECT COUNT(*) FROM words) as total_words;

-- Find vocab_items with missing reading or meaning
SELECT id, word, reading, meaning, source FROM vocab_items
WHERE (reading IS NULL OR reading = '') OR (meaning IS NULL OR meaning = '');
```

---

## Key Files

| File | Role |
|------|------|
| `src/core-vocab.js` | All drill logic: `loadVocabItemsDeck`, `startNewSession`, `markVocab`, `renderVocab`, focus mode |
| `src/core-srs.js` | `DrillSRS` SM-2 — used by counters, conjugation, times. NOT vocab drill. |
| `src/core-writing.js` | Writing panel — Cmd+Enter=check, Cmd+Shift+Enter=submit |
| `src/core-foundation.js` | App init, `_translateCache`, `JLPT_WORDS` load, vocab lookup self-heal |
| `src/features-kana.js` | Kana system — mostly dead, `_useOsIme` flag is the live mechanism |
| `src/features-core.js` | TTS voice management, API key |
| `main.js` | `render-process-gone` handler (auto-reload disabled) |

---

## Working Rules (Reminders)

- All terminal commands prefixed `cd ~/Documents/jpStudio &&`
- One command at a time — wait for output
- `node check-syntax.js` after every JS edit
- `git add -A && git commit -m "..."` per logical unit
- Read before theorising — always check actual source before proposing fixes
- Hypothesis-first debugging — one command to confirm/deny, stop if not
  converging
- MCP filesystem available at `/Users/paulandres/Documents/jpStudio/`
- `index.html` is a single giant line — use Python `html.find()` + slicing,
  not line-based tools
- `assert html.count(old) == 1` before every replace
- `window.db.run()` returns `{changes: 0}` even on successful batch INSERTs
  — not an error
- Live DB must be queried via `window.db.query()` in DevTools — sqlite3 CLI
  returns stale results when app is open; **close the app before sqlite3 CLI
  writes**, reload after
- Two disconnected vocabulary sources exist (`words` table, `vocab_items`
  table, plus `default_vocab.json`) — be aware when debugging vocab data
  issues; don't assume `words` is complete
