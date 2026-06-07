# Japanese Studio — Session Context
Last updated: 2026-06-06 (session 25 — vocab system substantial progress)

## User Preferences
- Paul is learning development workflows as we go — suggest improvements concisely.
- Management window deprioritised — terminal approach preferred for all edits.
- Use jp alias (cd ~/Documents/jpStudio) not full path in commands — ALWAYS prefix with jp &&
- pbcopy for all grep/sed output.
- Always prefix multi-line python3 edits with jp && to avoid directory drift.
- "done" means command ran and printed OK.
- Paul's eyesight is not great — prefer larger text, high contrast, bigger buttons in UI work.
- Give commands one at a time — do not batch unrelated commands.

## Chat vs Claude Code — Decision Rule
- **Chat:** single-line fixes, config changes, version bumps, CSS tweaks, grep/sed one-offs
- **Code:** anything touching multiple render paths, tracing logic across functions, multi-file refactors
- Code saves ~45-60 min vs chat for complex render path fixes.
- Code tends to over-reach — give tight focused briefs, verify diff before committing.

## Context File Update Process
- context-session.md lives at project root
- At end of session: Claude writes full updated file, Paul runs it, uploads to project Knowledge.

## GitHub Workflow
- Repo: https://github.com/jpstudioyoshi/jpstudio (private)
- Token stored in remote URL — no password prompt needed.
- Standard push: jp && git add -A && git commit -m "message" && git push
- Pre-commit hook runs check-syntax.js + auto-bumps cache buster (YYYYMMDDHHmmss)
- **Token scope for jpStudio:** `repo` scope
- **Token scope for Satellite Gist sync:** `gist` scope only — stored in phone localStorage, never in source

## Claude Code
- Installed: @anthropic-ai/claude-code (sudo npm install -g @anthropic-ai/claude-code)
- Auth: ANTHROPIC_API_KEY set permanently in ~/.zshrc
- Launch: jp && claude --model claude-opus-4-8
- Start each session: "Read context-static.md and context-session.md only. Do not read any other files yet."
- Cost: uses Anthropic API credits. Best for multi-file tasks. Single-file edits cheaper in chat.
- Guide: claude-code-guide.md in project root

## Current Mode
STABILIZATION complete — Vocab system active development.
See ARCHITECTURE_HUB.md for full design. See context-vocab.md for vocab system design.

## Thread Structure
- **Architecture/Vocab thread** — vocab system implementation (this thread, session 24+)
- **StudentModel thread** — StudentModel wiring
- Other threads for their respective panels/features

## HTML Element Map
`html-map.md` in project Knowledge — check before touching any panel element.

**Session 21 additions:**
- `strandBalanceChart`, `strandWeightsGrid`, `strandWeightsMsg`

**Session 23 additions:**
- `strandYoshiToggle`

**Session 25 additions:**
- `vocabWtYoshiPhrases`, `vocabWtYoshiVocab`, `vocabWtWriting`, `vocabWtLookup`, `vocabWtN5`
- `vocabIntYoshiPhrases`, `vocabIntYoshiVocab`, `vocabIntWriting`, `vocabIntLookup`, `vocabIntN5`
- `vocabThreshLookup`, `vocabThreshDecay`, `vocabSessionSize`
- `vocabWeightsMsg`
- `vocabDirJpEn`, `vocabDirEnJp`, `vocabDirSpeaking` — direction toggle buttons (now single `vcDirectionBtn`)
- Source filter row (greyed): `vocab-source-filter` checkboxes (Yoshi/Writing/Lookup/N5)
- POS filter row (greyed): `vocab-pos-filter` checkboxes

## Terminal Workflow
**Shell aliases:** jp, jpstart

**Standard patterns:**
- python3 - << 'PYEOF' for multi-line edits (note the dash)
- Always prefix with jp &&
- sed -n X,Yp file | pbcopy — read a block
- grep -n "pattern" file | pbcopy — locate lines
- Never paste code blocks directly into terminal — always use python3 heredoc scripts

**Critical lessons:**
- python3 string matching — use repr() to inspect before retrying
- Blank lines in match strings cause MATCH FAILED — always use repr() to check first
- Cache buster now auto-bumped on every commit via pre-commit hook — no manual bumping needed
- pbcopy swallows terminal output — never use for direct data queries
- Always jp && prefix
- SQLite DB is at ~/Library/Application Support/japanese-studio/jpstudio.db
- window.db.query() requires explicit [] params array even for no-param queries
- Cache only busts on commit — jpstart after every commit to reload
- Close Electron app before running SQLite writes directly

## Known Issues / Pre-existing
- `yoshiInitUI not defined` — harmless, pre-existing
- PDF print line breaks — pre-existing

## Session 25 — Completed Work

### Vocab system — major progress ✅

**Commits:** b5d4918 through a112af2

**Schema:**
- `vocab_items` — direction, type columns added
- `lesson_phrases` — type column added
- Three SRS tracks per word: jp_en, en_jp, speaking — UNIQUE(word, source, direction)

**Pipelines — backfills (one-time, all wired to storageReady):**
- `lesson_phrases` → `vocab_items` source='yoshi_phrases' ✅
- `corpus_lookups` → `vocab_items` source='lookup' (multi-char, threshold≥2) ✅
- N5 `words` → `vocab_items` source='n5' weight=0.3 ✅
- `lessonNotesLearnedWords` localStorage → `vocab_items` source='yoshi_vocab' ✅

**Pipelines — live:**
- Writing → Claude extraction → `vocab_items` source='writing' on WRITING_SUBMITTED ✅
- Lesson notes → `vocab_items` ❌ NOT WIRED — see gap below

**Type tagging:**
- 93 existing `lesson_phrases` rows retagged: 46 grammar, 41 phrases + 6 words
- Grammar extraction (`lessonNotesExtractGrammarSilent`) now writes to `lesson_phrases` with type='grammar'
- Key phrases extraction writes `type` from LLM response
- Backfill propagates type to `vocab_items`
- Grammar type excluded from vocab drill: `AND type != 'grammar'`
- Items starting with `〜` excluded: `AND word NOT LIKE '〜%'`

**UI — vocab drill:**
- Direction toggle: JP→EN / EN→JP / Speaking (cycles via `vcDirectionBtn`)
- Card front/back swaps correctly per direction
- Speaking mode auto-plays VoiceVox on card load
- Dynamic font scaling by character count (no line breaks)
- Source tag on card back (source · YYYY-MM-DD)
- `renderVocabList` rewritten for `vocab_items` — SRS status indicator
- Level filters (N5/N4/N3) removed
- Source filter row added (greyed, not wired)
- POS filter row kept (greyed, not wired)
- Matching game deleted (HTML + JS)

**Settings:**
- Vocabulary section in settings panel
- Source weights, initial intervals, deck behaviour inputs
- `vocabSettingsSave()` + `vocabSettingsLoad()` wired

**Current vocab_items:**
- lookup|phrase: 156
- n5|phrase: 2622
- yoshi_phrases|grammar: 138
- yoshi_phrases|phrase: 123
- Total: ~3039 rows

## Pending — Immediate Priority

### 1. Lesson notes live pipeline (most important gap)
- `features-lesson-notes.js` has NO AppEvents emits
- `LESSON_EXTRACTED` event doesn't exist in AppEvents.js
- After `lessonNotesAutoExtractAll` completes → emit `LESSON_EXTRACTED`
- Listener in `core-vocab.js` → upsert new `lesson_phrases` rows into `vocab_items`
- Same pattern as `WRITING_SUBMITTED` → `extractWritingVocabToItems`

### 2. Live lookup promotion
- `_corpusWriteLookup` fires on every quick-translate
- Currently only historical backfill, no live upsert to `vocab_items`
- Need: on lookup, check count threshold, upsert if met

### 3. Wire source filters
- Source filter row exists in HTML but greyed out
- Remove pointer-events:none, add onchange → loadVocabItemsDeck(vcDirection)
- Update loadVocabItemsDeck to filter by active sources

### 4. POS column on vocab_items
- N5 words have pos in `words` table — propagate on backfill
- Yoshi items need Claude extraction for POS
- Required before POS filters can work
- Verbs/adjectives → also feed conjugation drill

### 5. Wire VOCAB_WEIGHTS into deck query
- Settings UI exists, saves to kvAPI
- Not yet applied to entry_weight or query ORDER

### 6. Wire VOCAB_INTERVALS into backfills
- Yoshi phrases/vocab should start at +3 days not today

### 7. Single words from vocab extraction
- `lessonNotesExtractVocabSilent` writes to `words` table, not `lesson_phrases`
- Should feed `vocab_items` as source='yoshi_vocab' type='word'
- Separate pipeline needed

## Pending — Medium Term

### Layer 6 — Downstream consumers
- Grammar drill sentence generation uses vocab_items weight profile
- Writing prompt: "write using these 10 words" — top weighted due words
- Cost tag: source='vocab_drill' / 'vocab_sentence_gen'

### Structural
- Yoshi tab → source manager only (no drills)
- Source filter as cross-panel concept (Yoshi filter in each activity panel)
- `pos` column on vocab_items — POS routing (verbs/adj → conjugation drill)
- Two drill types: card flip vs text entry — future unified engine

### Phase 5
- Rule-based strand balance monitor
- LLM recommendation → agent_decisions
- Drill suggestion with action link

## SQLite Schema (current)
Tables: kv_store, frames, transcript_sentences, corpus_entries, corpus_lookups, corpus_productions, srs_items, error_history, lesson_sessions, words, lesson_phrases, pitch_data, writing_sessions, drill_results, conversation_sessions, transcript_turns, failure_events, agent_decisions, panel_sessions, learning_events, grammar_mastery, transcript_vocab, vocab_items

**vocab_items schema:**
```sql
CREATE TABLE vocab_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  word          TEXT NOT NULL,
  reading       TEXT,
  meaning       TEXT,
  example       TEXT,
  source        TEXT NOT NULL,  -- yoshi_phrases, yoshi_vocab, writing, lookup, n5
  source_ref    TEXT,
  direction     TEXT NOT NULL DEFAULT 'jp_en',  -- jp_en, en_jp, speaking
  type          TEXT DEFAULT 'phrase',  -- word, phrase, grammar
  encounter_at  TEXT,
  entry_weight  REAL DEFAULT 1.0,
  srs_interval  INTEGER DEFAULT 1,
  srs_ease      REAL DEFAULT 2.5,
  srs_due       TEXT,
  last_reviewed TEXT,
  created_at    TEXT NOT NULL,
  UNIQUE(word, source, direction)
);
```

**lesson_phrases schema:**
```sql
CREATE TABLE lesson_phrases (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id  INTEGER REFERENCES lesson_sessions(id),
  phrase     TEXT NOT NULL,
  reading    TEXT,
  meaning    TEXT NOT NULL,
  example    TEXT,
  type       TEXT DEFAULT 'phrase',  -- word, phrase, grammar
  created_at TEXT DEFAULT (datetime('now'))
);
```

DB path: ~/Library/Application Support/japanese-studio/jpstudio.db

## kvAPI keys
STRAND_WEIGHTS, VOCAB_WEIGHTS, VOCAB_THRESHOLDS, VOCAB_INTERVALS,
VOCAB_MIGRATION_V1, VOCAB_LESSON_BACKFILL_V1, VOCAB_LOOKUPS_BACKFILL_V1, VOCAB_N5_BACKFILL_V1,
goals, UI state, API keys, qrSession, YOSHI_KEY, breakdownCache,
gramSentHistory, GRAM_SENT_SESSIONS, WRITING_ERRORS, vocabBookmarks

## Storage principle
- kvAPI: config, preferences, small UI state
- DB: anything that grows, needs querying, or joins other data
