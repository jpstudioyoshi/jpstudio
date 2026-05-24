# Japanese Studio — Session Context
Last updated: 2026-05-24 (session 5 — end)

## User Preferences
- Paul is learning development workflows as we go — suggest improvements to workflow, terminal usage, or API cost savings where appropriate, but keep suggestions concise and actionable.
- Management window is deprioritised — was too buggy and expensive to debug via Claude. Terminal approach is preferred for all edits.

## Context File Update Process
- `context-session.md` lives at project root (`~/Documents/jpStudio/context-session.md`)
- At end of session: ask Claude to write the full updated file as a terminal `cat >` command. Run it, then upload the updated file to Claude project Knowledge to replace the old one.

## Current Mode
MAINTENANCE — stabilization complete. New features added incrementally.
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
- Schema migrations: all version checks in same function scope — use inline expression not `const vN =` (causes duplicate declaration errors).

## Stabilization Status

### Completed (2026-05-24 session 5)
- v9 schema migration: `pitch_data` table (kanji, reading, pitch) + `pitch` column on `words`
- Kanjium accent data (124,137 entries) imported into SQLite on first startup, skipped thereafter
- `window.pitchAPI.import()` and `window.pitchAPI.lookup(kanji, reading)` exposed via preload.js
- `data/kanjium-accents.txt` committed to project (3.1MB)
- Confirmed working: `[pitch] Pitch data already loaded: 124137 entries` on second startup

### Completed (2026-05-24 session 4)
- Cloze functions moved from `features-lesson-notes.js` → `features-yoshi.js`
- `features-lesson-notes.js` split at line 2554 → `features-lesson-notes.js` + `features-ln-p2.js`
- `features-ln-p2.js` added to load order in index.html
- Stabilization declared complete — moving to maintenance + feature mode
- Confirmed: lessonNotes storage split already resolved in earlier session — single kvAPI path

### Completed (2026-05-24 session 3)
- `features-lesson-notes.js` — date field added to all 4 session creation paths
- `lessonNotesLoadSession` — async SQL lookup by date sets `LessonNotesState.currentLessonId`
- `core.js` — `window._lessonWordSet` loaded from SQL on `storageReady`
- `core-vocab.js` — `lessonDoc` flag checks `_lessonWordSet` — lesson words get +15 priority bonus
- `features-lesson-notes.js` — `extractionWarning` state + retry banner added

### Completed (2026-05-24 sessions 1-2)
- Dead code removed from features-yoshi.js, features-tools.js
- CSS hardcoded colors replaced in core-writing.js, features-times.js
- Model strings upgraded to `claude-sonnet-4-6`
- v7/v8 schema migrations: lesson_id, source on words; lesson_phrases table

### Confirmed done (undocumented sessions)
- ADJ_I / ADJ_NA word list expanded
- `src/features.js` deleted (19,035 lines, dead code)
- overlay:transcribe IPC — single track, working well enough
- lessonNotes storage — already on single kvAPI path before session 4

## File Structure (updated)
| File | Lines | Contents |
|------|-------|----------|
| `src/features-yoshi.js` | ~651 | Yoshi session CRUD, UI shell, AI helpers, cloze rendering |
| `src/features-lesson-notes.js` | ~2553 | LN state, session CRUD, WhatsApp parser, recording helpers, story/reading render, sentence furigana |
| `src/features-ln-p2.js` | ~1959 | Sentence recording, drill, extraction, session load/new/delete, docx parser, timeline, recordings browser |
| `src/features-tools.js` | ~1280 | LN utils, recording helpers, matching pairs, shared state |
| `data/kanjium-accents.txt` | 124,137 lines | Kanjium pitch accent source data (imported to SQLite on first run) |

Note: context-static.md file table is out of date for these files — use above.

## Pending Work

### Pitch Accent — next session
Data layer complete. Next steps:
1. Write `renderPitchCurve(word, pitchStr)` SVG function in `core-foundation.js`
2. Wire into vocab card render as proof of concept
3. Show curve + speak via VoiceVox simultaneously (lookup → render → jpSpeak)
4. Roll out to: quick translate, lesson notes vocab, grammar sentence drill, voice drill

**Architecture note:** VoiceVox already produces correct pitch in audio. The SVG curve gives the visual association. Best learning outcome: show curve at the same moment jpSpeak() fires.

**pitch_data table:** kanji | reading | pitch (string, may contain multiple values e.g. "0,2")
**pitchAPI:** `window.pitchAPI.lookup(kanji, reading)` → pitch string or null

### Phone Companion — Audio Player (planned)
**Goal:** Play lesson audio while walking. Sync via Dropbox.

**Dropbox path:** `~/Dropbox/` (main personal account confirmed)
**Export target:** `~/Dropbox/jpStudio-audio/`

**Plan:**
- Export button in lesson notes/recording panel
- Runs ffmpeg to convert lesson WebM → M4A
- Saves as `YYYY-MM-DD-lesson.m4a` to `~/Dropbox/jpStudio-audio/`
- Play via Dropbox app on phone (no PWA needed yet)
- PWA with drills/progress sync comes later

**Decision pending:** Export button location — lesson notes panel when recording is linked, or recording browser?

### CSS Variable Retrofit (low priority, ongoing)
Remaining hardcoded color counts (approximate):
- index.html(35), features-progress.js(33), features-stroke.js(17), features-video.js(17)
- features-tools.js(16), features-voice.js(9), core-listen.js(9), features-grammar.js(9)

### Known issue
- `yoshiInitUI is not defined` error in features-tools.js on startup — pre-existing, not blocking anything

### Future (frozen)
- DrillRecord unified history, TextEntry migration, AudioStrip
- Voice drill → DB, SRS for custom drill, Progress charts
- iPhone PWA with drills and progress sync (backend TBD)

## Console Filter Reference
- `[pitch]` — pitch accent import/load status
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

## SQLite Schema (v9)
Tables: kv_store, frames, transcript_sentences, corpus_entries, corpus_lookups, corpus_productions, srs_items, error_history, lesson_sessions, words, lesson_phrases, pitch_data

### pitch_data
```sql
id, kanji, reading, pitch
```
- Indexed on kanji and reading
- 124,137 entries from Kanjium
- Access via `window.pitchAPI.lookup(kanji, reading)` — returns pitch string or null
- Pitch string format: single number or comma-separated e.g. "0", "2", "0,2"
- 0 = heiban (flat), 1+ = drops after that mora

### words (updated)
Added: `pitch TEXT` — populated from pitch_data on word add/backfill (not yet implemented)

## Vocab Priority Engine
1. `lessonDoc` (+15 bonus) — fires for SQL-sourced lesson words via `_lessonWordSet`
2. `currentLessonId` — set async on session load when date matches a `lesson_sessions` row

## Conjugation Hint Tracking
`_conjHintUsed` and `conjTypedAnswers` collect `{val, hintUsed}` per-run but NOT persisted to DrillSRS. Foundation in place.
