# Japanese Studio — Session Context
Last updated: 2026-06-05 (session 24 — vocab system planning + Layer 2 complete)

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
STABILIZATION complete — Vocab system Layer 2 complete, Layer 3 next.
See ARCHITECTURE_HUB.md for full design. See context-vocab.md for vocab system design.

## Thread Structure
- **Architecture thread** — design decisions, audits, doc updates only (this thread)
- **Vocab thread** — vocab system implementation (this thread, session 24+)
- **StudentModel thread** — StudentModel wiring
- **Delegate implementation** to feature threads once decisions are made here
- Other threads for their respective panels/features

## HTML Element Map
`html-map.md` in project Knowledge — check before touching any panel element.

**Session 21 additions:**
- `strandBalanceChart` — strand balance chart, above drillRecencyGraphic in progress panel
- `strandWeightsGrid` — strand weights input grid in settings panel
- `strandWeightsMsg` — "Saved" confirmation span in settings panel

**Session 23 additions:**
- `strandYoshiToggle` — Show Yoshi button next to FOUR STRANDS header

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

## Known Issues / Pre-existing
- `yoshiInitUI not defined` — harmless, pre-existing
- PDF print line breaks — pre-existing
- `yoshi.s1` strand weight was corrupt (1000) — fixed directly in DB. If settings reset, re-save strand weights to normalize.

## Session 24 — Completed Work

### Vocab system — design + Layer 2 ✅ (commit b5d4918)

**Design decisions (see context-vocab.md for full rationale):**
- Three vocab sources: Yoshi/lesson_phrases (highest), free writing/corpus_productions, dictionary lookups/corpus_lookups
- N5 as background horizon fill only (lowest weight)
- Transcription excluded (noise), reading excluded, Anki no further investment
- Open/closed class distinction maintained — counters/dates/conjugation stay in own drills
- Writing signal: produced N times without lookup = known = fast weight decay
- Lookup threshold: N lookups before word promoted to deck (default 2, configurable)
- Unified SRS pool in vocab_items, source-tagged
- Weight stack is difficulty controller for grammar drill sentence generation
- API cost not a constraint — optimise for learning quality

**Data audit findings (see vocab-audit-2026-06-05.md):**
- lesson_phrases: 93 rows, example sentence on every row, reading column empty (not a blocker)
- corpus_productions: 1392 tokens, 265 types — ALL single kanji, no compounds (extraction broken)
- corpus_lookups: 1180 tokens, 579 types — 277 multi-char types usable, rest single-kanji noise
- transcript_vocab: 0 rows (pipeline still not wired — Phase 4 item, not part of vocab system)
- lessonNotesLearnedWords: real user data in localStorage, migrated to vocab_items on first launch
- jpLearnedWords (jpLearnedWords key): dead key, never read/written, ignore
- vocabBookmarks: empty

**Layer 2 complete:**
- `vocab_items` table added to main.js schema
- `migrateLearnedWordsToVocabItems()` written in core-vocab.js — reads lessonNotesLearnedWords localStorage, inserts as source='yoshi', entry_weight=0.1, srs_interval=30
- Migration wired into storageReady block in core.js
- Guarded by VOCAB_MIGRATION_V1 kvAPI flag — runs once only
- Added to App registry

## Session 23 — Completed Work

### Stabilization sprint ✅
- `src/GrammarPrereqModel.js` created — N5_GRAPH + agentGrammarRootSignal + agentGrammarUnlockSignal extracted from features-progress.js
- `countShowMastery` — dead button + export removed
- `lessonNotesClozeRevealAll` — dead registry entry removed
- Stale root `core-foundation.js` deleted (1919 lines)
- `_conjRecordGrammarEvidence` — audited, working, writes to grammar_mastery via GrammarModel.recordEvidence()
- Auto cache-buster added to pre-commit hook (timestamp format)

### Two grammar models — clarified ✅
- **GrammarPrereqModel** (38 nodes) — prerequisite/unlock signals, feeds briefing
- **GrammarModel** (55 nodes) — Genki mastery tracking, UI grid, teal dots
- Different purposes, no convergence needed

### Strand balance chart — complete ✅
- Time range buttons (today/week/last week/all) now wire to strand balance bars
- `collectStrandBalance(since)` accepts date parameter, passed through `snapshotAsync(since)`
- Show Yoshi toggle — blue (#4a9eff) Yoshi portion, recalculates pct without lessons when off
- `isYoshi` fix — `lessonnotes` correctly identified as Yoshi panel (was checking for `'yoshi'`)
- `DRILL_LAST_COMPLETED_KEY` restored after accidental removal during N5_GRAPH extraction

## Earlier Session 23 work (separate thread)

### VoiceVox — default enabled + settings panel ✅ (commits a9e68be, 6bb44d2)
- VoiceVox auto-enables on first run with male default speaker
- Settings panel added with sliders: Speed, Pitch, Intonation, Pause
- Params persist across sessions
- Play All with pause/stop controls
- Teal underline highlight on active word
- Clear resets dropdown; restart comes up clean
- New element IDs: vvSpeed, vvSpeedVal, vvPitch, vvPitchVal, vvIntonation, vvIntonationVal, vvPause, vvPauseVal, vvSaveStatus, qrPlayAllBtn2, qrPauseAllBtn

## Session 21/22 — Completed Work
- Phase 3 complete — strand balance chart, strand weights UI, AppEvents wired
- Phase 4 complete — AnalysisService wired, transcript_vocab, grammar_mastery, DrillSRS migrated

## Pending Work — Priority Order

### Vocab system — Layer 3 (pipelines) — next
1. lesson_phrases → vocab_items pipeline (clean, ready now)
2. corpus_lookups → vocab_items pipeline (multi-char filter: LENGTH(word) > 1)
3. N5 background load — one-time, lowest priority
4. corpus_productions — fix extraction first (currently single-kanji only), then wire

### Vocab system — Layer 4 (SRS UI)
- Rewrite words-sub-vocab to pull from vocab_items
- Card: word, reading, meaning, source tag, weight indicator
- SM-2 review writes back to vocab_items
- Delete words-sub-game (HTML, JS, subtab entry)

### Vocab system — Layer 5 (settings levers)
- Per-source weight inputs (VOCAB_WEIGHTS in kvAPI)
- Lookup threshold input (VOCAB_THRESHOLDS in kvAPI)
- Production decay threshold input

### Vocab system — Layer 6 (downstream)
- Grammar drill sentence generation uses vocab_items weight profile
- Sentence construction activity same budget logic
- Cost tag: source='vocab_drill' / 'vocab_sentence_gen'

### Phase 5 — next frontier
- Step 1: rule-based monitor — fire on session end, check strand balance thresholds
- Step 2: LLM recommendation via claudeSummary() → agent_decisions table
- Step 3: drill suggestion with action link in UI

### Phase 4 remaining
- 4/3/2 separate panel_sessions entry — currently inside voice panel time
- Lesson notes grammar Part 2 — requires LLM call to return grammarNodeIds

### Medium term
- `notes_text` blob in lesson_sessions — rationalize later
- `LessonNotesState.grammar` — in memory only, never persists
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
DB path: ~/Library/Application Support/japanese-studio/jpstudio.db

## kvAPI — rationalized usage
**Keep in kvAPI:** STRAND_WEIGHTS, VOCAB_WEIGHTS, VOCAB_THRESHOLDS, VOCAB_MIGRATION_V1, goals, UI state, API keys, qrSession, YOSHI_KEY, breakdownCache, gramSentHistory, GRAM_SENT_SESSIONS, WRITING_ERRORS, vocabBookmarks
**Migrated to DB:** DrillSRS (all drill types now in srs_items)
**Still on localStorage:** voice profile, voice pause data, video watch time, resources, learned words (lessonNotesLearnedWords — migrated to vocab_items on first launch)

## Storage rationalization principle
- kvAPI: config, preferences, small UI state that doesn't need querying
- DB: anything that grows over time, needs querying, or joins with other data
