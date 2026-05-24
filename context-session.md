# Japanese Studio — Session Context
Last updated: 2026-05-24 (session 2)

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

## Stabilization Status

### Completed (2026-05-24 session 2)
- `features-yoshi.js` — removed orphaned `yoshiAudioURL` var, `yoshiAttachAudio` function, trailing `// LESSON NOTES` comment stub
- `features-tools.js` — removed dead `yoshiRenderRecordingTab` function (120 lines) — superseded by `lnRenderRecording`
- `features-tools.js` — removed `_origYoshiInitUI` monkey-patch block (was suppressing `Orchestrator.loadSessions()` but `yoshiInitUI` is never called anyway)
- `features-tools.js` — removed `yoshiRenderRecordingTab` from App registry export list
- `core-writing.js` — replaced hardcoded `#1c1c1e` with `var(--paper-dark)`
- `features-times.js` — removed `#c8a951` fallback from `var(--gold,#c8a951)` → `var(--gold)`
- `core-vocab.js` — 2 hardcoded colors are in print-only stylesheet, intentionally light/neutral, left alone
- Confirmed: redundant window[] exports are mostly intentional (HTML onchange handlers, monkey-patches, dynamic HTML) — not safe to bulk-remove
- Confirmed: grammar → Grammar Sentences wiring already done (missing session)
- Confirmed: model strings already on `claude-sonnet-4-6` (missing session)
- Confirmed: v8 `lesson_phrases` table already done (missing session)

### Completed (2026-05-24 session 1 — missing session, reconstructed)
- `main.js` — v7 schema migration: added `lesson_id` (INTEGER, FK) and `source` (TEXT) to `words` table
- `main.js` — v8 schema migration: new `lesson_phrases` table (id, lesson_id, phrase, meaning, example, created_at)
- `main.js` — `words:upsert` IPC handler updated to accept `lesson_id` and `source`
- `features-lesson-notes.js` — vocab extraction writes to `words` SQL table with `source='lesson'` and `lesson_id` (currently always null)
- `features-lesson-notes.js` — phrases extraction writes to `lesson_phrases` SQL table with `lesson_id` (currently always null)
- `features-lesson-notes.js` — grammar extraction wired to Grammar Sentences via `gramSentPracticePattern()`
- Model strings — all call sites upgraded to `claude-sonnet-4-6`
- `LessonNotesState.currentLessonId` — referenced at write sites but never set. Always null. Wiring blocked: lesson notes session blobs have no reliable date field to match against `lesson_sessions.date`.

### Completed (2026-05-23 session 3)
- `.gitignore` — added .DS_Store, *.bak, management-log.json, index.json, audit-*.md
- `lnCreateFromPaste` — apiUsageTrack added
- `features-grammar.js` particle drill — undocumented raw fetch found and tracked
- `DrillCard` — session save/resume added via `sessionKey` config option
- `style.css` — `--jp` and `--panel` defined
- `STYLE_GUIDE.md` — created at project root
- `DrillCard` — removed `var(--red,#e05050)` fallbacks

### Completed (2026-05-23 session 2)
- `features-kana.js` — double-click on A/ひ/カ toolbar buttons saves default mode via kvAPI
- `features-yoshi.js` — Lesson Notes grammar drill JSON shape normalised
- `features-grammar.js` — conjugation drill `_conjTrackingPaused` flag added
- `src/ui/TextEntry.js` — added to index.html load order
- `src/ui/DrillCard.js` — created, added to index.html
- `core-counters.js` — `daysOfMonthDrill` migrated to DrillCard

### Completed (2026-05-23 session 1)
- API call logging, double-transcription guard, Whisper logging, Four Strands coverage
- Conjugation drill kanji stem pre-fill, API key status fix
- renderAdjMastery implemented and wired

## File Structure (updated)
| File | Lines | Contents |
|------|-------|----------|
| `src/features-yoshi.js` | ~500 | Yoshi session CRUD, UI shell, AI helpers (kana/complete/vocab), cloze import |
| `src/features-lesson-notes.js` | ~4,629 | All Lesson Notes extraction, vocab/phrases/grammar pipeline, cloze render/check |
| `src/features-tools.js` | ~1,281 | LN utils, WhatsApp parse, recording helpers, matching pairs, shared state objects |

Note: context-static.md file table is out of date for these three files — use above.

## Pending Work (priority order)

### Short-term
- **lesson_id linkage** — `LessonNotesState.currentLessonId` never set. Two options:
  1. Store `date: new Date().toISOString().slice(0,10)` on session blob at all creation paths, then look up `lesson_sessions` by date in `lessonNotesLoadSession`
  2. Accept null for now — words/phrases still write to SQL, just without the FK link
  Option 2 is current state. Option 1 requires auditing all session creation paths.
- **lessonDoc flag wire-up** — words written to SQL with `source='lesson'` don't get +15 priority bonus. `lessonDoc` flag in `vcBuildList` reads from translate cache `first_seen_panel`, not SQL. Fix requires async SQL read in `vcBuildList` — medium complexity, do after lesson_id wiring.
- **ADJ_I / ADJ_NA word list** — only 8 i-adj / 6 na-adj. Deferred.

### CSS Variable Retrofit (multi-session track)
Remaining hardcoded color counts (approximate):
- index.html(35), features-progress.js(33), features-stroke.js(17), features-video.js(17)
- features-tools.js(16), features-voice.js(9), core-listen.js(9), features-grammar.js(9)
- core-writing.js ✅, features-times.js ✅, core-vocab.js ✅ (print-only, leave)
- features-progress.js last — chart colors may need new variables

### DrillCard migration — CLOSED
Complete at Dates only. Counters, conjugation, grammar sentences deferred — too complex.

### Future features (frozen)
- DrillRecord unified history, TextEntry migration, AudioStrip
- Voice drill → DB, SRS for custom drill, Progress charts
- overlay:transcribe IPC, BlackHole pre-session check
- iPhone companion app (PWA)

### Housekeeping
- src/features.js — delete if still present (19,035 lines, confirmed dead)
- context-static.md file table — needs update for yoshi/lesson-notes/tools line counts

## Console Filter Reference
- `[LN]` — Lesson Notes extractions
- `[API]` — all Claude API calls
- `[STT]` — Whisper transcription
- `[AppEvents]` — recording pipeline events

## Yoshi Pipeline Summary
- **Recording pipeline** (teal): User → Orchestrator → AudioService → AppEvents → YoshiUI
- **Lesson Notes** (coral): Paste/import → features-lesson-notes.js → Claude API → lessonNotesRender()

## Lesson Notes — Architecture Status
- **Vocab** → ✅ writes to `words` SQL, `source='lesson'`, `lesson_id` always null
- **Phrases** → ✅ writes to `lesson_phrases` SQL, `lesson_id` always null
- **Grammar** → ✅ wired to Grammar Sentences via `gramSentPracticePattern()`
- **Stories** → stays in kvAPI blob
- **WhatsApp notes** → stays in kvAPI blob
- **Recording + transcript** → stays in `lesson_sessions` SQL table

## Vocab Priority Engine — Integration Gaps
1. `lessonDoc` (+15 bonus) — not firing for SQL-sourced lesson words. `vcBuildList` reads translate cache only. Fix after lesson_id wiring.
2. `currentLessonId` — always null. Fix together with lessonDoc gap.

## Conjugation Hint Tracking
`_conjHintUsed` and `conjTypedAnswers` collect `{val, hintUsed}` per-run but NOT persisted to DrillSRS. Foundation in place.

## Progress Mastery View
`_filterHistory` view values: 'last' (today), 'week', 'prev'. Returns null when view='last' and period empty — cells show grey correctly.
