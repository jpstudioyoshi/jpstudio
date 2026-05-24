# Japanese Studio — Session Context
Last updated: 2026-05-24 (session 1)

## User Preferences
- Paul is learning development workflows as we go — suggest improvements to workflow, terminal usage, or API cost savings where appropriate, but keep suggestions concise and actionable.
- Management window is deprioritised — was too buggy and expensive to debug via Claude. Terminal approach is preferred for all edits.

## Context File Update Process
- `context-session.md` lives at project root (`~/Documents/jpStudio/context-session.md`)
- At end of session: ask Claude to write the full updated file as a terminal `cat >` command. Run it, then upload the updated file to Claude project Knowledge to replace the old one.

## Current Mode
STABILIZATION — not feature expansion.
- Prefer minimal edits over redesigns
- Prefer wrappers over refactors
- Do not introduce new abstractions unless they solve a concrete current problem
- Do not expand scope

## Terminal Workflow
All edits are done via terminal — no file upload/download. ~90% token saving.

**Shell aliases (in ~/.zshrc — permanent):**
- `jp` — `cd ~/Documents/jpStudio`
- `jpstart` — kill app, restart, cd to project
- `setopt NO_BANG_HIST` — disables zsh `!` history expansion so `node -e` works freely

**Standard patterns:**
- `jp` — jump to project (always required first)
- `grep -n "pattern" src/file.js` — locate lines
- `sed -n 'X,Yp' src/file.js | pbcopy` — read a block, pipe to clipboard, paste here
- Edits: write a `/tmp/fix-xxx.js` node script using `fs.readFileSync/writeFileSync` with exact string matching, run with `node /tmp/fix-xxx.js`
- Always run `node check-syntax.js` after every edit
- Bump version after every index.html or JS change: `sed -i '' 's/?v=CURRENT/?v=NEW/g' index.html`
- Restart app: `jpstart`
- Hard reload after restart: Cmd+Shift+R in app window

**Git workflow (initialised 2026-05-23, commit 840b90e):**
- Before every dev session: `git add -A && git commit -m "before session YYYY-MM-DD"`
- Emergency rollback: `git checkout -- .`
- Pre-commit hook installed: runs `check-syntax.js` automatically, blocks commit on error
- `.gitignore` covers `node_modules/`, `.DS_Store`, `*.bak`, `management-log.json`, `index.json`, `audit-*.md`

**Critical lessons learned:**
- When using `node -e "..."` in zsh, `!` causes "event not found". Use `/tmp/fix-xxx.js` files instead.
- `\n` in backtick strings inside `node -e` is NOT interpreted as newline. Use file-based scripts.
- After patching, verify with `JSON.stringify(src.slice(idx, idx+120))` to see exact bytes including whitespace.
- IIFE pattern: `window['X'] = X` must be OUTSIDE the IIFE, after `const X = (() => { ... return {...}; })();`
- Cache busting: bump `?v=` string in index.html after every change, then Cmd+Shift+R.
- Always `cd ~/Documents/jpStudio` before any command — terminal does not persist directory.
- Use `| pbcopy` to copy output to clipboard instead of flipping terminal windows.
- When `NOT FOUND` in patch script — check exact whitespace with `JSON.stringify`. Extra blank lines are common culprit.
- Slice-based patching (`src.slice(0,start) + neu + src.slice(end)`) is more reliable than string matching for large blocks.
- String-replace anchors often fail due to whitespace/newline mismatch — when in doubt use line-index splice instead.
- Always indicate whether a command runs in terminal or console (dev tools).

## Stabilization Status
Lesson Notes reconstruction in progress.

### Completed (2026-05-24 session 1)
- `main.js` — v7 schema migration: added `lesson_id` (INTEGER, FK to lesson_sessions) and `source` (TEXT) columns to `words` table
- `main.js` — `words:upsert` IPC handler updated to accept and persist `lesson_id` and `source`
- `features-lesson-notes.js` — after vocab extraction, writes all extracted words into `words` SQL table with `source='lesson'`. Uses `ON CONFLICT DO UPDATE` so existing JLPT words are not duplicated. Verified: 23 words written in test session, confirmed in DB.
- `LessonNotesState.currentLessonId` is currently always `null` — lesson_id linkage pending

### Completed (2026-05-23 session 3)
- `.gitignore` — added .DS_Store, *.bak, management-log.json, index.json, audit-*.md
- `lnCreateFromPaste` — apiUsageTrack added (was logged but not tracked in cost dashboard)
- `features-grammar.js` particle drill — undocumented raw fetch found and tracked with [API] log + apiUsageTrack
- `DrillCard` — session save/resume added via `sessionKey` config option. Uses Storage (SQL-backed). `allowResume: false` to skip.
- `style.css` — `--jp` defined: Hiragana Sans stack. `--panel` defined: #2c2c2e.
- `STYLE_GUIDE.md` — created at project root. Full variable reference, color semantics, button/input/feedback patterns, typography scale, component inventory.
- `DrillCard` — removed `var(--red,#e05050)` fallbacks, `--red` is defined.
- Model audit — all calls use `claude-sonnet-4-20250514` (Sonnet 4.5) or `claude-haiku-4-5-20251001`. Haiku usage in lnCreateFromPaste and particle drill is intentional. Upgrade to `claude-sonnet-4-6` noted for next session.

### Completed (2026-05-23 session 2)
- `features-kana.js` — double-click on A/ひ/カ toolbar buttons saves that mode as default for that input location via `kvAPI` (`kana_default:{inputId}`). Loaded async on `kanaToolbar()` init.
- `features-yoshi.js` — Lesson Notes grammar drill JSON shape normalised: `{english,japanese}` → `{en,jp}` matching grammar panel.
- `features-yoshi.js` — `[LN]` logging added to all 4 silent extraction functions.
- `features-grammar.js` — conjugation drill `_conjTrackingPaused` flag added.
- `src/ui/TextEntry.js` — added to index.html load order. Fixes missing input in Yoshi grammar drill.
- `features-grammar.js` — `ConjSession` removed from App registry (referenced before its `const` declaration).
- `features-kana.js` — `shuffle` removed from App registry and window exports.
- `index.html` — `features-corpus-seed.js` removed from load order (file does not exist).
- `src/ui/DrillCard.js` — created, added to index.html. Shared drill loop, config-driven.
- `core-counters.js` — `daysOfMonthDrill` migrated to DrillCard.

### Completed (2026-05-23 session 1)
- API call logging, double-transcription guard, Whisper logging, Four Strands coverage
- Conjugation drill kanji stem pre-fill, API key status fix
- renderAdjMastery implemented and wired

### Completed (2026-05-18 and 2026-05-17)
- See previous context for full list

## Pending Work (priority order)

### Short-term
- **lesson_id linkage** — `LessonNotesState.currentLessonId` is never set. Find where `lessonNotesLoadSession` runs and wire in the SQL `lesson_sessions.id`.
- **Lesson Notes reconstruction: Phrases** — new `lesson_phrases` SQL table (id, lesson_id, phrase, reading, meaning, example, created_at). v8 migration block in main.js. Wire extraction to write there.
- **Lesson Notes reconstruction: Grammar** — push extracted grammar into Grammar Sentences feature. Add "Send to Grammar" button. No new table.
- **Model string upgrade** — swap `claude-sonnet-4-20250514` → `claude-sonnet-4-6` across all 30+ call sites.
- **DrillCard → counters migration** — still pending.
- **ADJ_I / ADJ_NA word list** — only 8 i-adj / 6 na-adj. Deferred.

### DrillCard migration roadmap
1. ✅ Dates — done
2. Counters — needs srsKey + session save in DrillCard first
3. Times — needs text input replacing multiple-choice first
4. Conjugation — complex state, last
5. Grammar sentences — complex state, last

### Medium-term cleanup
- App registry cleanup — redundant window[] in core-anki, core-counters, core-kana, features-kana, features-times, features-video, features-voice-drill, services/*
- Storage rationalisation — ✅ mostly done.
- Yoshi → app data flow — ✅ vocab now writing to SQL. Phrases and grammar still pending.

### Future features (frozen)
- DrillRecord unified history, TextEntry migration, AudioStrip
- Voice drill → DB, SRS for custom drill, Progress charts
- overlay:transcribe IPC, BlackHole pre-session check
- iPhone companion app (PWA served from Mac over WiFi) — audio player + SRS vocab recall + sentence drill + POST results back to SQLite. Discussed, not started.

### CSS Variable Retrofit (multi-session track)
**Goal: replace all hardcoded hex colors with CSS variables before handing UI to a designer.**
- Hardcoded color counts: index.html(35), features-progress.js(33), features-stroke.js(17), features-video.js(17), features-tools.js(16), features-voice.js(9), core-listen.js(9), features-grammar.js(9) — ~181 total
- Start with low-count files: core-writing.js(1), features-times.js(1), core-vocab.js(2)
- features-progress.js last — chart colors may need new variables

### Housekeeping
- src/features.js — delete if still present (19,035 lines, confirmed dead)
- features-pictures.js vg* dead code — safe to remove
- window[] export cleanup — ongoing

## Console Filter Reference
- `[LN]` — Lesson Notes extractions
- `[API]` — all Claude API calls
- `[STT]` — Whisper transcription
- `[AppEvents]` — recording pipeline events

## Yoshi Pipeline Summary
Two separate systems:
- **Recording pipeline** (teal): User → Orchestrator → AudioService → AppEvents → YoshiUI. Clean event-driven, traceable via [AppEvents].
- **Lesson Notes** (coral): Paste/import → features-lesson-notes.js → Claude API calls (4 silent extractions) → lessonNotesRender() directly. No events. Traceable via [LN] logs.

## Next Recommended Action
1. Wire `LessonNotesState.currentLessonId` — assign SQL lesson_sessions.id when session loads
2. Lesson Notes reconstruction: Phrases → lesson_phrases SQL table (v8 migration)
3. Model string upgrade (claude-sonnet-4-20250514 → claude-sonnet-4-6)
4. CSS variable retrofit — start with small files (core-writing.js, features-times.js, core-vocab.js)

## Lesson Notes — Architectural Reconstruction Plan
Status: IN PROGRESS

### Target architecture
- **Vocab** → ✅ DONE. Writes to `words` SQL table with source='lesson' and lesson_id FK.
- **Phrases** → new `lesson_phrases` SQL table. v8 migration pending.
- **Grammar** → feeds into Grammar Sentences feature. "Send to Grammar" button pending.
- **Stories** → thin wrapper around existing reading panel. setText() entry point pending.
- **WhatsApp notes + alignment** → stays in kvAPI blob.
- **Recording + transcript** → stays in lesson_sessions SQL table.

### Migration strategy
- Existing kvAPI blobs remain readable (no data loss)
- New extractions write to SQL going forward
- Reconstruct one at a time: ✅ Vocab → Phrases → Grammar → Stories

### SQL additions
- ✅ v7: `lesson_id` and `source` on `words` table
- Next: v8 — new `lesson_phrases` table
- Grammar: no new table needed

### Future housekeeping
- App registry cross-reference: document which functions are HTML-only (need `window[]`), JS-only (App registry), or both. Would make redundant export cleanup faster. check-syntax.js audit already lists all exports — just needs a one-time classification pass.

### DrillCard migration — status update
Counters migration postponed indefinitely. Counter drill has complex state (session resume, SRS via CM, object mode, audio, lookup popup) that doesn't fit DrillCard's simple model without either hacking DrillCard or stripping counter features. Working code — leave alone.
Conjugation and Grammar sentences also deferred (marked complex, last).
DrillCard migration effectively complete at Dates. Roadmap closed.

### Vocab/Conjugation drill word sourcing — future feature
Currently vocab drill and conjugation drill draw from static word lists. Goal: feed both from a dynamic weighted list (priority score, SRS state, lesson-extracted words). This should happen AFTER Lesson Notes reconstruction is stable and lesson-extracted vocab is flowing into the words SQL table reliably. Prerequisite: confirm lesson_id FK is being set (currentLessonId is currently always null).

### Vocab priority engine — integration gaps
The priority system in `wordPriorityScore` (core-vocab.js) is sophisticated but has two integration gaps:
1. `entry.lessonDoc` (+15 bonus) — flag for lesson-extracted words. Currently `source='lesson'` is written to SQL but `lessonDoc` is a corpus field not read from SQL. Lesson-extracted words are NOT getting their +15 bonus. Needs wire-up in `vcBuildPriorityList` / `vcBuildList` to set `lessonDoc=true` when `source='lesson'`.
2. `currentLessonId` — always null in Lesson Notes extraction, so lesson FK on words/phrases rows is unset. Needs wiring to the recording pipeline session id.
Both gaps should be fixed together once lesson recording → Lesson Notes flow is stable.

### Conjugation hint tracking — future feature
`_conjHintUsed` flag and `conjTypedAnswers` now store `{val, hintUsed}` objects (added 2026-05-24). Data is collected per-run in memory but NOT yet persisted to DrillSRS history. To enable mastery filtering by hint usage:
1. Extend `DrillSRS.record()` to accept optional metadata `{hintUsed}`
2. Store `hintUsed` in SRS history entries
3. Modify `_accuracyFromHistory` to accept a filter param
4. Add checkbox UI to conjugation/adjective mastery panels in progress page
Foundation is in place — collection is happening.

### Progress mastery view fix (2026-05-24)
`_filterHistory` view values are 'last' (today), 'week' (this week), 'prev' (last week) — NOT 'today'. Fixed `_accuracyFromHistory` to return null when view='last' and period is empty, so cells correctly show grey instead of falling back to all-time data when "Today" is selected and nothing has been drilled.
