# Japanese Studio — Session Context
Last updated: 2026-06-03 (session 21 — strand balance chart, Yoshi wiring, weights UI, Phase 3 complete)

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
- **Code:** anything touching multiple render paths, tracing logic across functions, multi-file refactors, anything where "trace this call chain" is needed
- Cost: Code uses more input tokens (reads full files). Chat is cheaper for small edits.
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
- Token tip: give tight focused briefs, one panel/file at a time.
- Guide: claude-code-guide.md in project root
- Switch to Opus 4.8 for hard debugging: claude config set model claude-opus-4-8

## Current Mode
ARCHITECTURE — inter-panel communication, intelligent hub, Nation four strands framework.
Phase 3 complete. Moving into Phase 4: Yoshi-driven learning.
See ARCHITECTURE_HUB.md in project Knowledge for full design.

## Thread Structure
- **Architecture thread** — design decisions, cross-cutting concerns, doc updates (this thread)
- **StudentModel thread** — all wiring into and out of StudentModel
- Other threads for their respective panels/features

## HTML Element Map
`html-map.md` in project Knowledge — panel-by-panel ID inventory. Check before touching any panel element.

**Session 21 additions:**
- `strandBalanceChart` — strand balance chart container, above drillRecencyGraphic in progress panel
- `strandWeightsGrid` — strand weights input grid in settings panel
- `strandWeightsMsg` — "Saved" confirmation span in settings panel

## Terminal Workflow
All edits are done via terminal — no file upload/download.

**Shell aliases (in ~/.zshrc):**
- jp — cd ~/Documents/jpStudio
- jpstart — kill app, restart, cd to project
- git ship — git add -A && git commit -m "update" && git push (jpsat repo)

**Standard patterns:**
- python3 - << 'PYEOF' for multi-line edits (most reliable — note the dash)
- Always prefix with jp && to avoid directory drift
- sed -n X,Yp file | pbcopy — read a block
- grep -n "pattern" file | pbcopy — locate lines only
- Update style.css?v= version string after CSS changes to bust Electron cache
- Use date +%s for guaranteed cache bust on JS files

**Critical lessons:**
- python3 string matching fails silently on whitespace/encoding — use repr() to inspect before retrying
- Template literal backticks in heredocs need careful escaping — use python3 - << 'PYEOF' with raw strings
- Blank lines in match strings cause MATCH FAILED — always use repr() to inspect first
- Cache buster regex was \?v=\d+ — now fixed to \?v=[^"]+ to catch letter suffixes
- pbcopy swallows terminal output — never use it for sed -n reads, only for grep locating
- Always use jp && prefix — never assume current directory
- Never paste code blocks directly into terminal — always use python3 heredoc scripts
- git stash pop restores Code session changes if accidentally stashed

## Known Issues / Pre-existing
- **DB startup errors** — `rows is not iterable` in features-progress.js. Root cause: sql.js or IPC handler. Needs investigation.
- `yoshiInitUI not defined` on startup — pre-existing, not blocking
- PDF print line breaks — pre-existing
- Stale root-level core-foundation.js (May 23) — never loaded, cleanup later
- Whisper/OpenAI key — needs new key from OpenAI, then test save/restart cycle
- Read panel listen layout — still buggy
- `countShowMastery is not defined` — core-counters.js line 926
- `lessonNotesClozeRevealAll is not defined` — features-ln-p2.js line 1344, remove it

## Session 21 — Completed Work

### Cache buster fix
- `check-syntax.js` regex fixed: `\?v=\d+` → `\?v=[^"]+`
- Was silently skipping files with letter suffixes — likely cause of weeks of stale cache issues

### StudentModel fully wired
- `invalidate()` → all 7 drill completion points
- `snapshotAsync()` → progress panel open
- AppEvents subscription → 7 event types
- `AppEvents.emit()` → all 8 panel emission points
- `SESSION_SAVED` → writes Yoshi sessions to `panel_sessions` with `panel='yoshi'`
- `RECORDING_STARTED`/`STOPPED` → writes voice recording time to `panel_sessions`
- Voice panel removed from `_STRAND_MAP` — timer was counting dev discussion time

### Strand balance chart
- Live in progress panel, stacked bars
- Yoshi portion shown in teal, other activity in strand colour
- Bar length = weighted contribution (not raw minutes)
- Amber < 20%, red at zero
- Re-renders on weight save (with cache invalidation)
- Tile snippet text removed — was noise

### Strand weights UI
- 14 activities in settings, S1-S4 inputs, auto-saves to `STRAND_WEIGHTS` kvAPI key
- `sentences` (Sentence Building) added: S1:0, S2:100, S3:50, S4:0
- Fluency tiles fixed: removed conjugation and vocab, added writing

### Sentence building instrumentation
- `GramSentState.startedAt` added at session init
- Completion hook writes to `panel_sessions` (`panel='sentences'`) and `learning_events`

### FLUENCY tiles corrected
- Removed: Conjugation, Vocabulary
- Added: Writing

## Pending Work — Priority Order

### Phase 4 — Yoshi-driven learning (next major work)
Both features require **AnalysisService audit first** (Claude Code session):
1. **Vocabulary: less arbitrary** — SRS deck driven by Yoshi session vocab + N5 core
   - AnalysisService currently extracts vocab — need to know format and reliability
   - Connect: Yoshi transcript vocab → SRS deck on SESSION_SAVED
2. **Grammar → Genki integration** — grammar forms from Yoshi sessions light up Genki sections
   - Initially: prompt to read the relevant chapter
   - Later: auto-generate sentence drill sentences targeting that form
   - Requires: AnalysisService grammar tagging audit + Genki taxonomy audit

### Phase 3 remaining
1. **Strand imbalance notification** — outbound StudentModel signal when strand < 20%
2. **4/3/2 separation** — currently inside voice panel time, needs own `panel_sessions` entry for separate bar colour

### Pending audits
1. **AnalysisService** — what does it extract, how reliable, what format
2. **Genki taxonomy** — what grammar points, structure, currently wired to anything
3. **Data audit** — run typical session, verify DB writes

### Known instrumentation gaps
- Voice drill answers (needs thought)
- Anki reviews (needs thought)
- Lesson session saves (Yoshi grammar tags)
- `_conjRecordGrammarEvidence` — unclear where it writes
- Read-aloud — listen thread
- Round trip — session duration only when built

### Medium term
- DrillSRS migration from kvAPI to `srs_items` DB table
- REVIEW.md at project root
- Progress panel header — briefing refresh + About me controls
- Stale root core-foundation.js — delete safely

### Future
- Dropbox recordings redirect
- Video → Audio pipeline (ffmpeg)
- Pitch accent wiring
- Lesson Mode Architecture
- Counters to add: 階(kai), 回(kai/do), 番(ban), 足(soku), 着(chaku/ki)

## SQLite Schema (current)
Tables: kv_store, frames, transcript_sentences, corpus_entries, corpus_lookups, corpus_productions, srs_items, error_history, lesson_sessions, words, lesson_phrases, pitch_data, writing_sessions, drill_results, conversation_sessions, transcript_turns, failure_events, agent_decisions, panel_sessions, learning_events
pitch_data: 124,137 entries

## kvAPI keys (session 21 additions)
- `STRAND_WEIGHTS` — strand weight settings, 14 activity keys, s1/s2/s3/s4 per key

## Storage Migration Status
### Migrated to kvAPI
gramSentHistory, vocabBookmarks, qrSession, breakdownCache, GRAM_SENT_SESSIONS, YOSHI_KEY, WRITING_ERRORS, STRAND_WEIGHTS ✓

### Still on localStorage
voice profile, voice pause data, video watch time, resources, learned words
