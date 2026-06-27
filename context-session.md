# jpStudio — Session Context
*Updated: 2026-06-26*

---

## Current Focus: Vocab Drill Redesign (completed this session)

Full handoff doc at project root: `vocab-drill-handoff.md`

---

## Vocab Drill — What Changed This Session

### Bug fixes
- **`render-process-gone` auto-reload disabled** (`main.js`) — was causing unrecoverable zombie state requiring full Mac restart. Now just logs. User must quit and relaunch.
- **`again` = tomorrow** — previously requeued same session. Now sets `srs_due = tomorrow`, removes from session entirely.
- **Double-advance bug fixed** — duplicate keydown listener in `core-vocab.js` was firing alongside existing one in `index.html`. Removed the duplicate.
- **Phrases excluded from drill** — added `v.type != 'phrase'` to base SQL query in `loadVocabItemsDeck`.

### Behaviour changes
- **Session size: 100** — was 30. Persisted in kvAPI `VOCAB_THRESHOLDS`.
- **MAX_NEW: 100** — was 5. May need tuning back to 15–20 once review backlog builds.
- **Speaking mode removed** — direction cycle is now `jp_en ↔ en_jp` only.
- **TTS auto-plays on every card** — fires on card show regardless of direction.
- **Source filters off by default** — no filter = full SRS pool (correct default).
- **POS filters off by default** — no filter = all POS included.
- **Focus mode banner** — gold "⚡ Focus mode — SRS paused" when any source filter active.
- **Focus mode skips SRS writes** — `markVocab` does not write `vocab_srs` when source filter active. Pure flashcard drill.
- **Listen panel SRS removed** — Hard/Good/Easy rating system (`const SRS`) fully removed from `core-listen.js` and `index.html`. Was never used.
- **`vocab_srs` reset** — clean slate. Previous data corrupted by old `again` behaviour and shared direction intervals.

### Keyboard shortcuts (already existed in index.html — not added this session)
- Space — flip card
- 1 — Again
- 2 — Got it
- 3 — Know
- ← → — Prev / Next
- Info button (?) added to toolbar showing shortcut popup

---

## Vocab Drill — Current State

### How the pool works
1. `loadVocabItemsDeck(direction)` queries `vocab_items LEFT JOIN vocab_srs` for words where `srs_due <= today OR srs_due IS NULL`, filtered by direction
2. Words weighted by `entry_weight × source_weight × direction_weight`; reviewed words flatten to 0.35
3. `startNewSession()` caps at 100 total, up to 100 new words
4. Ratings write to `vocab_srs(vocab_id, direction, ...)` — direction-aware, separate intervals per direction
5. Focus mode (any source filter checked) = no SRS writes, pure flashcards

### vocab_items — 1545 words, sources
| source | entry_weight |
|--------|-------------|
| yoshi_phrases | 1.0 |
| yoshi_vocab | 1.0 |
| writing | 0.9 |
| lookup | 0.6 |
| n5 | 0.3 |

### vocab_srs — clean slate as of 2026-06-26
Direction-aware: separate `srs_interval`, `srs_ease`, `srs_due` per `(vocab_id, direction)`.

---

## Vocab Drill — Outstanding Work

See `vocab-drill-handoff.md` for full detail. Summary:

**High priority**
- MAX_NEW tuning — bring back to 15–20 once review backlog builds
- New word clustering — max 2 new words from same `lesson_session_id` per session (Nation: avoid thematic clustering). Requires adding `lesson_session_id` to `vocab_items`.
- Exposure count queue ordering — new words ordered by input frequency, not just `entry_weight`. Add `exposure_count` to `vocab_items`.

**Medium priority**
- `wordEnrichWithSRS()` still reads from old `DrillSRS` / `STORAGE_KEYS.DRILL_SRS_WORDS` — should read from `vocab_srs` table
- `isWordMastered()` still uses old SRS key
- `vocabKnownRecent()` uses synchronous `window.db.query()` without await — will silently fail
- Settings UI cleanup: speaking weight/session size inputs still in HTML (`vocabWtDirSpeaking`, `vocabSessionSizeSpeaking`)

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
- 5 sessions of real `extracted_grammar` data available
- Pure query work — no pattern definitions required
- Nodes appearing in `extracted_grammar` repeatedly but with low `grammar_mastery` score = structural blindness
- Surface as sprint card in 集中 panel

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
```

---

## Key Files

| File | Role |
|------|------|
| `src/core-vocab.js` | All drill logic: `loadVocabItemsDeck`, `startNewSession`, `markVocab`, `renderVocab`, focus mode |
| `src/core-srs.js` | `DrillSRS` SM-2 — used by counters, conjugation, times. NOT vocab drill. |
| `src/core-listen.js` | Listen panel (SRS removed this session) |
| `main.js` | `render-process-gone` handler (auto-reload disabled this session) |
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
- `index.html` is a single giant line — use Python index splice (`html.find()` + slicing), not line-based tools
- `assert html.count(old) == 1` before every replace
- `dryRun: True` before every live `filesystem:edit_file`
- `window.db.run()` returns `{changes: 0}` even on successful batch INSERTs — not an error
- Live DB must be queried via `window.db.query()` in DevTools — sqlite3 CLI returns stale results when app is open
