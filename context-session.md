# Japanese Studio — Session Context
Last updated: 2026-06-01 (session 20 — learning_events instrumentation, architecture planning)

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
Legacy architectural rendering conflicts resolved. Feature development open.
See ARCHITECTURE_HUB.md in project Knowledge for full design.

## HTML Element Map
`html-map.md` in project Knowledge — panel-by-panel ID inventory. Check before touching any panel element.

**html-map.md additions from session 17 (counter drill):**
- `countStartBtn2` — Start button in footer-upper (new)
- `countDrillActions2` — inline action buttons div (new, hidden until start)
- `countNewBtn2` — New session button in footer-upper (new, hidden until start)
- `counterMasteryPanel` — still in progress panel at line ~2523

**html-map.md additions from session 18 (read panel):**
- `qrListenContainer` — fixed div wrapping qrListenPanel, top:154px below lower header
- `qrFooterBtns` — wrapper div for read panel footer buttons (shown when listen mode off)
- `qrRecordSection` — moved into qrFooterUpper, shown when listen mode on (replaces buttons)

## Terminal Workflow
All edits are done via terminal — no file upload/download.

**Shell aliases (in ~/.zshrc):**
- jp — cd ~/Documents/jpStudio
- jpstart — kill app, restart, cd to project
- git ship — git add -A && git commit -m "update" && git push (jpsat repo)

**Standard patterns:**
- python3 << 'PYEOF' for multi-line edits (most reliable)
- Always prefix with jp && to avoid directory drift
- sed -n X,Yp file — read a block (no pbcopy — it swallows output)
- grep -n "pattern" file | pbcopy — locate lines only
- Never paste grep output back into terminal
- Update style.css?v= version string after CSS changes to bust Electron cache
- Use date +%s for guaranteed cache bust on JS files

**Critical lessons:**
- python3 string matching fails silently on whitespace/encoding differences — use repr() to inspect before retrying
- sed replacing function names as well as call sites — always check after
- Line numbers shift after edits — re-grep before editing again
- Duplicate CSS rules accumulate — grep for class name before adding new rules
- Electron caches CSS AND JS — always bump version strings after changes; use date +%s for guaranteed cache bust
- position:fixed can be overridden by earlier duplicate rules — grep for all instances first
- When line-number deletion leaves orphan braces — always run node check-syntax.js after edits
- GitHub push protection auto-revokes tokens found in committed files or chat — never put tokens in source or chat
- Always use jp && prefix — never assume current directory
- const/let TDZ bugs in Electron: if a script aborts mid-load, later const/let declarations stay in TDZ
- pbcopy swallows terminal output — never use it for sed -n reads, only for grep locating
- git stash pop restores Code session changes if accidentally stashed
- Blank lines in python3 heredoc match strings cause MATCH FAILED — always use repr() to inspect first

## Known Issues / Pre-existing
- **DB startup errors** — `rows is not iterable` in features-progress.js, GrammarModel mastery load failing. Causes CONJ_SESSION_RUNS and CONJ_QUESTIONS_PER_RUN to be undefined on load (worked around with `|| 3` fallback). Root cause: sql.js or IPC handler issue on startup. Needs dedicated investigation.
- `yoshiInitUI not defined` on startup — pre-existing, not blocking
- PDF print line breaks — pre-existing
- App opens on Questions (dashboard) panel instead of Progress — regression from session 17 nav fix
- Stale root-level core-foundation.js (May 23) — never loaded, cleanup later
- Whisper/OpenAI key — needs new key from OpenAI, then test save/restart cycle
- Read panel listen layout — still buggy

## Session 20 — Completed Work

### Architecture Planning (this thread — reserved for architecture discussion)
- Agreed Paul Nation Four Strands as the organising framework for the whole system
- Designed runtime architecture: AppEvents (bus) → StudentModel (Verteilerstelle) → panels
- StudentModel has two layers: mechanical (rule-based) and intelligent (trigger-based LLM)
- Measurement set agreed — see ARCHITECTURE_HUB.md
- Implementation phases agreed: Foundation → Instrumentation → Audit → Strand balance → Intelligence
- ARCHITECTURE_HUB.md written and uploaded to project Knowledge

### learning_events Infrastructure
- Added `panel_sessions` and `learning_events` tables to `createSchema()` in main.js
- `panel_sessions`: panel, strand, started_at, ended_at, duration_s
- `learning_events`: created_at, panel, event_type, payload (JSON)

### Panel Session Timer
- Added `_STRAND_MAP`, `_panelSessionStart`, `_panelLastInteract` to core-foundation.js
- Timer deducts to last interaction timestamp on panel switch (not clock time)
- Interaction signals: click, keydown, mousedown, audio playback, microphone active
- Sessions < 2 seconds discarded
- Panels with null strand (progress, settings, dashboard) not recorded
- Writes to both `panel_sessions` and `learning_events` (event_type: `session:time`)

### learning_events Wiring — Completed
| Event | Source | File |
|---|---|---|
| `vocab:lookup` | quick translate | core-foundation.js |
| `vocab:lookup` | SRS/kanji drill | core-srs.js |
| `vocab:produced` | chat production | core-srs.js |
| `vocab:produced` | writing production | core-srs.js |
| `error:recorded` | all error sources | core-foundation.js |
| `drill:answer` | conjugation drill | features-grammar.js |
| `drill:answer` | kana drill | core-kana-drill.js |
| `drill:answer` | words SRS | core-vocab.js |
| `drill:answer` | times drill | features-times.js |
| `drill:answer` | DrillCard (counters, days, all DrillCard drills) | src/ui/DrillCard.js |
| `writing:submitted` | writing panel | core-writing.js |
| `session:time` | all panels via showPanel() | core-foundation.js |

### Writing iteration tracking
- `_writingFirstAttempt` — captures text on first check, cleared on submit
- `_writingCheckCount` — counts check attempts per sentence, reset on submit
- `writing:submitted` payload includes: first_attempt, final_text, check_count

### DB Schema additions
- `drill_results` now receiving writes for first time (conjugation, kana, words, times, DrillCard)
- `writing_sessions` now receiving writes for first time

## Pending Work — Priority Order

### Immediate
1. **Read panel listen layout** — still buggy, needs follow-up
2. **DB startup failure** — `rows is not iterable`, still present
3. **App startup panel** — opens on Questions instead of Progress

### Architecture / Instrumentation (next sessions)
1. **Remaining learning_events wiring:**
   - Voice drill answers (needs thought — uses scoring not typed input)
   - Anki reviews (needs thought)
   - STT-scored conjugation (core-stt.js lines 795, 821)
   - Lesson session saves (Yoshi)
   - `_conjRecordGrammarEvidence` — unclear where it writes
2. **Data audit (Phase 3)** — run app through typical session, verify what actually lands in DB vs what should
3. **StudentModel audit** — what does it currently own, what is it called for
4. **Progress panel / Genki taxonomy audit** — what's wired vs display-only
5. **AnalysisService audit** — does it do grammar tagging on transcripts
6. **AppEvents usage audit** — which panels currently emit/listen

### Medium term
1. **REVIEW.md** — add to jpStudio repo root, DOM-write conflict prevention
2. **DOM-write audit** — extend check-syntax.js to flag multiple writers to same element
3. **Progress panel header** — add briefing refresh + About me controls into header
4. **Stale root core-foundation.js** — delete safely

### Dropbox Recordings Redirect — Pending Decision
- Move `getLessonsDir()` in main.js to Dropbox folder
- Migrate `audio_path` in `lesson_sessions` (absolute paths will break)

### Video → Audio Pipeline
- ffmpeg -i input.mp4 -vn -c:a libopus output.webm
- Needs file picker + ffmpeg extract step in app

### Pitch Accent — Unblocked, High Value
- renderPitchCurve() SVG in core-foundation.js
- Wire into vocab card render
- pitchAPI: window.pitchAPI.lookup(kanji, reading) → pitch string or null

### Lesson Mode Architecture — Future
- Global App.lessonMode = { id, label }
- Each panel pre-filters by lesson_id when set
- Topbar indicator showing current lesson

## SQLite Schema (current)
Tables: kv_store, frames, transcript_sentences, corpus_entries, corpus_lookups, corpus_productions, srs_items, error_history, lesson_sessions, words, lesson_phrases, pitch_data, writing_sessions, drill_results, conversation_sessions, transcript_turns, failure_events, agent_decisions, panel_sessions, learning_events
pitch_data: 124,137 entries
Access: window.pitchAPI.lookup(kanji, reading)

## Storage Migration Status
### Migrated to kvAPI
gramSentHistory, vocabBookmarks, qrSession, breakdownCache, GRAM_SENT_SESSIONS, YOSHI_KEY, WRITING_ERRORS ✓

### Still on localStorage
voice profile, voice pause data, video watch time, resources, learned words

## Session 20 Addendum
- STT conjugation instrumentation dropped — STT too imprecise for single-syllable conjugation differences
- Read-aloud and 4/3/2 instrumentation delegated to listen thread
- Current mode note: listen thread handling all spoken performance instrumentation
