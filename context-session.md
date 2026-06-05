# Japanese Studio — Session Context
Last updated: 2026-06-05 (session 23 — stabilization sprint complete)

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
- Pre-commit hook runs check-syntax.js automatically — always check output
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
STABILIZATION — architectural debt reduction before Phase 5.
Criteria for selection: "would not exist if planned from scratch."
See ARCHITECTURE_HUB.md for full design and stabilization task list.

## Thread Structure
- **Architecture thread** — design decisions, audits, doc updates only (this thread)
- **StudentModel thread** — StudentModel wiring
- **Delegate implementation** to feature threads once decisions are made here
- Other threads for their respective panels/features

## HTML Element Map
`html-map.md` in project Knowledge — check before touching any panel element.

**Session 21 additions:**
- `strandBalanceChart` — strand balance chart, above drillRecencyGraphic in progress panel
- `strandWeightsGrid` — strand weights input grid in settings panel
- `strandWeightsMsg` — "Saved" confirmation span in settings panel

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
- Blank lines in match strings cause MATCH FAILED
- Cache buster regex fixed: \?v=[^"]+ catches letter suffixes
- pbcopy swallows terminal output — never for sed -n reads
- Always jp && prefix
- /mnt/user-data/outputs/ is Claude-side only — not accessible from terminal

## Known Issues / Pre-existing
- `yoshiInitUI not defined` on startup — pre-existing, not blocking
- PDF print line breaks — pre-existing

## Session 23 — Completed Work (stabilization sprint)

### GrammarPrereqModel extraction ✅ (commit 2807d1d)
- `src/GrammarPrereqModel.js` created — N5_GRAPH + agentGrammarRootSignal + agentGrammarUnlockSignal
- Removed from `features-progress.js` (~196 lines)
- Loaded in index.html after GrammarModel.js

### Dead code removed ✅
- `countShowMastery` button removed from counters panel (commit)
- `countShowMastery` dead export removed from core-counters.js
- `lessonNotesClozeRevealAll` dead registry entry removed from features-ln-p2.js (commit 469c801)
- Stale root `core-foundation.js` deleted — 1919 lines gone (commit 268448e)

### `_conjRecordGrammarEvidence` — audited ✅
- Not broken — writes to grammar_mastery via GrammarModel.recordEvidence()
- Maps conjugation drill answers to GrammarModel node IDs
- Nudges mastery score ±0.05/0.08 per answer
- Lives in core-stt.js, called from features-grammar.js

### Two grammar models — clarified ✅
- **GrammarPrereqModel** (38 nodes) — prerequisite/unlock signals, feeds briefing
- **GrammarModel** (55 nodes) — Genki mastery tracking, UI grid, teal dots
- Different purposes, no convergence needed

## Session 21/22 — Completed Work
- Phase 3 complete — strand balance chart, strand weights UI, AppEvents wired
- Phase 4 complete — AnalysisService wired, transcript_vocab, grammar_mastery, DrillSRS migrated

## Pending Work — Priority Order

### Stabilization (remaining)
- `yoshiInitUI not defined` — pre-existing, investigate when touching voice panel

### Phase 3 remaining
- Strand imbalance notification — outbound StudentModel signal when strand < 20%

### Phase 4 remaining
- 4/3/2 separate panel_sessions entry — currently inside voice panel time
- Lesson notes grammar Part 2 — requires LLM call to return grammarNodeIds

### Medium term
- `notes_text` blob in lesson_sessions — rationalize later
- `LessonNotesState.grammar` — in memory only, never persists
- Progress panel header — briefing refresh + About me controls

### Future
- Thread coordination system + site manager pattern
- Dropbox recordings redirect
- Video → Audio pipeline (ffmpeg)
- Pitch accent wiring
- Lesson Mode Architecture
- Counters to add: 階(kai), 回(kai/do), 番(ban), 足(soku), 着(chaku/ki)

## SQLite Schema (current)
Tables: kv_store, frames, transcript_sentences, corpus_entries, corpus_lookups, corpus_productions, srs_items, error_history, lesson_sessions, words, lesson_phrases, pitch_data, writing_sessions, drill_results, conversation_sessions, transcript_turns, failure_events, agent_decisions, panel_sessions, learning_events, grammar_mastery, transcript_vocab
pitch_data: 124,137 entries

## kvAPI — rationalized usage
**Keep in kvAPI:** STRAND_WEIGHTS, goals, UI state, API keys, qrSession, YOSHI_KEY, breakdownCache, gramSentHistory, GRAM_SENT_SESSIONS, WRITING_ERRORS, vocabBookmarks
**Migrated to DB:** DrillSRS (all drill types now in srs_items)
**Still on localStorage:** voice profile, voice pause data, video watch time, resources, learned words

## Storage rationalization principle
- kvAPI: config, preferences, small UI state that doesn't need querying
- DB: anything that grows over time, needs querying, or joins with other data
