# Japanese Studio — Session Context
Last updated: 2026-06-06 (session 25 — vocab system Layers 1-5 complete)

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
STABILIZATION complete — Vocab system Layers 1-5 complete.
See ARCHITECTURE_HUB.md for full design. See context-vocab.md for vocab system design.

## Thread Structure
- **Architecture/Vocab thread** — vocab system implementation (this thread, session 24+)
- **StudentModel thread** — StudentModel wiring
- Other threads for their respective panels/features

## HTML Element Map
`html-map.md` in project Knowledge — check before touching any panel element.

**Session 21 additions:**
- `strandBalanceChart` — strand balance chart, above drillRecencyGraphic in progress panel
- `strandWeightsGrid` — strand weights input grid in settings panel
- `strandWeightsMsg` — "Saved" confirmation span in settings panel

**Session 23 additions:**
- `strandYoshiToggle` — Show Yoshi button next to FOUR STRANDS header

**Session 25 additions:**
- `vocabWtYoshiPhrases`, `vocabWtYoshiVocab`, `vocabWtWriting`, `vocabWtLookup`, `vocabWtN5` — source weight inputs in settings
- `vocabIntYoshiPhrases`, `vocabIntYoshiVocab`, `vocabIntWriting`, `vocabIntLookup`, `vocabIntN5` — initial interval inputs in settings
- `vocabThreshLookup`, `vocabThreshDecay`, `vocabSessionSize` — deck behaviour inputs in settings
- `vocabWeightsMsg` — "Saved" confirmation span in vocab settings section

## Terminal Workflow
**Shell aliases:** jp, jpstart

**Standard patterns:**
- python3 - << 'PYEOF' for multi-line edits (note the dash)
- Always prefix with jp &&
- sed -n X,Yp file | pbcopy — read a block
- grep -n "pattern" file | pbcopy — locate lines
- Never paste code blocks directly into terminal — always use python3 heredoc scripts
- For new files: use cat > filename << 'ENDOFFILE' heredoc (/mnt/user-data/outputs/ not accessible from terminal)

**Critical lessons:**
- python3 string matching — use repr() to inspect before retrying
- Blank lines in match strings cause MATCH FAILED — always use repr() to check first
- Cache buster now auto-bumped on every commit via pre-commit hook — no manual bumping needed
- pbcopy swallows terminal output — never use for sed -n reads
- Always jp && prefix
- /mnt/user-data/outputs/ is Claude-side only — not accessible from terminal
- SQLite DB is at ~/Library/Application Support/japanese-studio/jpstudio.db (not jpStudio)
- window.db.query() requires explicit [] params array even for no-param queries — omitting causes silent empty return
- Cache only busts on commit — use jpstart after every commit to reload
- Close Electron app before running SQLite writes directly — "database disk image is malformed" means app has DB open

## Known Issues / Pre-existing
- `yoshiInitUI not defined` — harmless, pre-existing
- PDF print line breaks — pre-existing
- `yoshi.s1` strand weight was corrupt (1000) — fixed directly in DB. If settings reset, re-save strand weights to normalize.

## Session 25 — Completed Work

### Vocab system Layers 1-5 complete ✅

**Commits:** b5d4918, 043250d, c02dbbb, bda0aac, 259ffca, 49fc8f0, 0453597, 15dee0d, 4d660c8, 0453597, 5e3713d, da9d3d6, 729fd10

**Layer 5 — Settings UI ✅ (commit 729fd10)**
- Vocabulary section added to settings panel (stPaneSettings)
- Source weights: yoshi_phrases, yoshi_vocab, writing, lookup, n5
- Initial intervals per source (days)
- Deck behaviour: lookup threshold, production decay, session size
- `vocabSettingsSave()` + `vocabSettingsLoad()` in core-vocab.js
- Load wired into storageReady in core.js
- Save/load persists to VOCAB_WEIGHTS, VOCAB_THRESHOLDS, VOCAB_INTERVALS in kvAPI

**Direction tracks ✅ (commit 5e3713d)**
- `direction` column added to vocab_items
- UNIQUE(word, source, direction) — three rows per word
- Directions: jp_en, en_jp, speaking
- loadVocabItemsDeck(direction='jp_en') — parameterised, defaults to jp_en
- 1260 rows total (420 per direction)

**Source split ✅ (commit da9d3d6)**
- `yoshi` split into `yoshi_phrases` (lesson_phrases backfill) and `yoshi_vocab` (lessonNotesLearnedWords migration)
- All backfill functions updated to use correct source tags

**Current vocab_items population:**
- yoshi_phrases: 261 (87 words × 3 directions)
- lookup: 156 (52 words × 3 directions)
- n5: 2622 (874 words × 3 directions)
- yoshi_vocab: from localStorage migration (if any learned words existed)
- Total: ~3039+ rows

**Drill confirmed working ✅** — jp_en direction, cards showing word, meaning, example, source tag

## Pending — Vocab system

### Short term
- Direction mode selector UI — buttons above card to switch jp_en / en_jp / speaking
- Wire VOCAB_INTERVALS into backfill functions (Yoshi phrases/vocab start at +3 days not today)
- corpus_productions extraction fix — currently single-kanji only, needs word-level extraction
- Delete words-sub-game (matching game, never used)

### Layer 6 — Downstream consumers
- Grammar drill sentence generation uses vocab_items weight profile
- Sentence construction activity same budget logic
- Cost tag: source='vocab_drill' / 'vocab_sentence_gen'

## Pending — Other

### Phase 5 — next frontier
- Step 1: rule-based monitor — fire on session end, check strand balance thresholds
- Step 2: LLM recommendation via claudeSummary() → agent_decisions table
- Step 3: drill suggestion with action link in UI

### Phase 4 remaining
- 4/3/2 separate panel_sessions entry
- Lesson notes grammar Part 2

### Medium term
- notes_text blob in lesson_sessions — rationalize
- LessonNotesState.grammar — in memory only, never persists
- Progress panel header — briefing refresh + About me controls
- jpSat Clear button bug — investigation interrupted

### Future
- Thread coordination system + site manager pattern
- Dropbox recordings redirect
- Video → Audio pipeline (ffmpeg)
- Pitch accent wiring
- Lesson Mode Architecture
- Counters to add: 階(kai), 回(kai/do), 番(ban), 足(soku), 着(chaku/ki)

## SQLite Schema (current)
Tables: kv_store, frames, transcript_sentences, corpus_entries, corpus_lookups, corpus_productions, srs_items, error_history, lesson_sessions, words, lesson_phrases, pitch_data, writing_sessions, drill_results, conversation_sessions, transcript_turns, failure_events, agent_decisions, panel_sessions, learning_events, grammar_mastery, transcript_vocab, vocab_items
pitch_data: 124,137 entries
vocab_items: ~3039 rows (jp_en/en_jp/speaking × sources)
DB path: ~/Library/Application Support/japanese-studio/jpstudio.db

## vocab_items schema
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

## kvAPI — rationalized usage
**Keep in kvAPI:** STRAND_WEIGHTS, VOCAB_WEIGHTS, VOCAB_THRESHOLDS, VOCAB_INTERVALS, VOCAB_MIGRATION_V1, VOCAB_LESSON_BACKFILL_V1, VOCAB_LOOKUPS_BACKFILL_V1, VOCAB_N5_BACKFILL_V1, goals, UI state, API keys, qrSession, YOSHI_KEY, breakdownCache, gramSentHistory, GRAM_SENT_SESSIONS, WRITING_ERRORS, vocabBookmarks
**Migrated to DB:** DrillSRS (all drill types now in srs_items)
**Still on localStorage:** voice profile, voice pause data, video watch time, resources, lessonNotesLearnedWords (migrated to vocab_items on first launch)

## Storage rationalization principle
- kvAPI: config, preferences, small UI state that doesn't need querying
- DB: anything that grows over time, needs querying, or joins with other data
