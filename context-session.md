# Japanese Studio — Session Context
Last updated: 2026-05-24 (session 4 — end)

## User Preferences
- Paul is learning development workflows as we go — suggest improvements to workflow, terminal usage, or API cost savings where appropriate, but keep suggestions concise and actionable.
- Management window is deprioritised — was too buggy and expensive to debug via Claude. Terminal approach is preferred for all edits.

## Context File Update Process
- `context-session.md` lives at project root (`~/Documents/jpStudio/context-session.md`)
- At end of session: ask Claude to write the full updated file as a terminal `cat >` command. Run it, then upload the updated file to Claude project Knowledge to replace the old one.

## Current Mode
MAINTENANCE — stabilization complete. Ongoing: context files updated at session end as needed.
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
- `jp` — jump to project (always required first — grep/sed from wrong directory returns nothing silently)
- `grep -n "pattern" src/file.js` — locate lines
- `sed -n 'X,Yp' src/file.js | pbcopy` — read a block, pipe to clipboard, paste here
- Edits: write a `/tmp/fix-xxx.js` node script using `fs.readFileSync/writeFileSync` with exact string matching, run with `node /tmp/fix-xxx.js`
- Always run `node check-syntax.js` after every edit
- Bump version after every index.html or JS change: `sed -i '' 's/?v=CURRENT/?v=NEW/g' index.html`
- Restart app: `jpstart`
- Hard reload after restart: Cmd+Shift+R in app window
- Always use `| tee /dev/tty | pbcopy` not just `| pbcopy` — prevents empty clipboard on errors
- Always use `{ cmd; echo "---done---"; } | tee /dev/tty | pbcopy` pattern

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
- Use `| tee /dev/tty | pbcopy` to see output AND copy it.
- When `NOT FOUND` in patch script — check exact whitespace with `JSON.stringify`. Extra blank lines are common culprit.
- Slice-based patching (`src.slice(0,start) + neu + src.slice(end)`) is more reliable than string matching for large blocks.
- String-replace anchors often fail due to whitespace/newline mismatch — when in doubt use line-index splice instead.
- Always indicate whether a command runs in terminal or console (dev tools).
- Username is `paulandres` — path is `/Users/paulandres/Documents/jpStudio/`
- `window.db` in renderer only exposes `query` (async, returns row objects) — no `exec`. Use `await window.db.query(sql, params)`.
- Always `jp` first — grep/sed from wrong directory returns nothing silently.

## Stabilization Status

### Completed (2026-05-24 session 4)
- Cloze functions (yoshiRenderCloze, yoshiCheckCloze, yoshiRevealAll, yoshiResetCloze, yoshiConfirmCloze) moved from `features-lesson-notes.js` → `features-yoshi.js`
- `features-lesson-notes.js` split into two files at line 2554 (clean function boundary)
- `features-ln-p2.js` created, added to load order in index.html immediately after `features-lesson-notes.js`
- Further 3-way split deferred — files now at acceptable size, further splitting not worth the risk given interleaving
- Stabilization declared complete — moving to maintenance mode

### Completed (2026-05-24 session 3)
- `features-lesson-notes.js` — date field added to all 4 session creation paths (`YYYY-MM-DD` format)
- `features-lesson-notes.js` — `lessonNotesLoadSession` now does async SQL lookup by date to set `LessonNotesState.currentLessonId`
- `core.js` — `window._lessonWordSet` loaded from SQL on `storageReady` (words where `source='lesson'`)
- `core-vocab.js` — `lessonDoc` flag in `vcMergeEntry` now checks `_lessonWordSet` — lesson words get +15 priority bonus
- `features-lesson-notes.js` — `extractionWarning` state added, banner shown after failed extractions with retry button
- Confirmed: Orchestrator recording pipeline already has solid error handling — no fixes needed

### Completed (2026-05-24 session 2)
- `features-yoshi.js` — removed orphaned `yoshiAudioURL` var, `yoshiAttachAudio` function, trailing comment stub
- `features-tools.js` — removed dead `yoshiRenderRecordingTab` function (120 lines)
- `features-tools.js` — removed `_origYoshiInitUI` monkey-patch block
- `core-writing.js` — replaced hardcoded `#1c1c1e` with `var(--paper-dark)`
- `features-times.js` — removed `#c8a951` fallback → `var(--gold)`
- Confirmed: model strings already on `claude-sonnet-4-6`
- Confirmed: v8 `lesson_phrases` table already done

### Completed (2026-05-24 session 1 — reconstructed)
- `main.js` — v7/v8 schema migrations: `lesson_id`, `source` on `words`; new `lesson_phrases` table
- `features-lesson-notes.js` — vocab/phrases/grammar extraction wired to SQL and Grammar Sentences
- Model strings upgraded to `claude-sonnet-4-6`

### Completed (2026-05-23 sessions 1-3)
- API call logging, double-transcription guard, Whisper logging, Four Strands coverage
- Conjugation drill kanji stem pre-fill, API key status fix, renderAdjMastery
- `features-kana.js` — double-click toolbar buttons saves default mode
- DrillCard created, daysOfMonthDrill migrated
- `.gitignore`, `STYLE_GUIDE.md`, CSS var definitions

### Confirmed done (undocumented sessions)
- ADJ_I / ADJ_NA word list expanded
- `src/features.js` deleted (was 19,035 lines, dead code)
- overlay:transcribe IPC — working well enough, single track only (teacher not using headset — acceptable)

## File Structure (updated)
| File | Lines | Contents |
|------|-------|----------|
| `src/features-yoshi.js` | ~651 | Yoshi session CRUD, UI shell, AI helpers, cloze import, cloze rendering |
| `src/features-lesson-notes.js` | ~2553 | LN state, session CRUD, WhatsApp parser, recording helpers, story/reading render, sentence furigana |
| `src/features-ln-p2.js` | ~1959 | Sentence recording, drill, extraction, session load/new/delete, docx parser, timeline, recordings browser |
| `src/features-tools.js` | ~1280 | LN utils, WhatsApp parse, recording helpers, matching pairs, shared state |

Note: context-static.md file table is out of date for these files — use above.

## Pending Work

### CSS Variable Retrofit (ongoing, low priority)
Remaining hardcoded color counts (approximate):
- index.html(35), features-progress.js(33), features-stroke.js(17), features-video.js(17)
- features-tools.js(16), features-voice.js(9), core-listen.js(9), features-grammar.js(9)
- features-progress.js last — chart colors may need new variables

### Phone Companion — Audio Player (next feature, planned)
**Goal:** Play lesson audio while walking. Sync via Dropbox.

**Dropbox path:** `~/Dropbox/` (main account, personal files)
**Export target:** `~/Dropbox/jpStudio-audio/`

**Plan:**
- Export button in lesson notes/recording panel
- Runs ffmpeg to convert lesson WebM → M4A
- Saves as `YYYY-MM-DD-lesson.m4a` to `~/Dropbox/jpStudio-audio/`
- Dropbox auto-syncs to phone — play via Dropbox app (no PWA needed yet)
- PWA with drills/progress sync comes later (will need a small backend e.g. Supabase/PocketBase)

**Decision pending:** Where to put the export button — lesson notes panel when recording is linked, or recording browser?

### Future (frozen)
- DrillRecord unified history, TextEntry migration, AudioStrip
- Voice drill → DB, SRS for custom drill, Progress charts
- iPhone PWA with drills and progress sync (backend TBD)

## Console Filter Reference
- `[LN]` — Lesson Notes extractions + lesson_id linkage + word set load
- `[API]` — all Claude API calls
- `[STT]` — Whisper transcription
- `[AppEvents]` — recording pipeline events

## Lesson Notes — Architecture Status
- **Vocab** → ✅ writes to `words` SQL, `source='lesson'`, `lesson_id` set when recording matched by date
- **Phrases** → ✅ writes to `lesson_phrases` SQL, `lesson_id` set when recording matched
- **Grammar** → ✅ wired to Grammar Sentences via `gramSentPracticePattern()`
- **lessonDoc bonus** → ✅ `_lessonWordSet` loaded at startup, checked in `vcMergeEntry`
- **Stories** → stays in kvAPI blob
- **WhatsApp notes** → stays in kvAPI blob
- **Recording + transcript** → stays in `lesson_sessions` SQL table

## Vocab Priority Engine
Both integration gaps resolved:
1. `lessonDoc` (+15 bonus) — fires for SQL-sourced lesson words via `_lessonWordSet`
2. `currentLessonId` — set async on session load when date matches a `lesson_sessions` row

## Conjugation Hint Tracking
`_conjHintUsed` and `conjTypedAnswers` collect `{val, hintUsed}` per-run but NOT persisted to DrillSRS. Foundation in place.

## Progress Mastery View
`_filterHistory` view values: 'last' (today), 'week', 'prev'. Returns null when view='last' and period empty — cells show grey correctly.
