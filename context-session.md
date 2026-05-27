# Japanese Studio — Session Context
Last updated: 2026-05-27 (session 10 — lesson notes refactor, session restore, storage migration)

## User Preferences
- Paul is learning development workflows as we go — suggest improvements concisely.
- Management window deprioritised — terminal approach preferred for all edits.
- Use jp alias (cd ~/Documents/jpStudio) not full path in commands.
- pbcopy for all grep/sed output.

## Context File Update Process
- context-session.md lives at project root
- At end of session: Claude writes full updated file, Paul runs it, uploads to project Knowledge.

## GitHub Workflow
- Repo: https://github.com/jpstudioyoshi/jpstudio (private)
- Token stored in remote URL — no password prompt needed.
- Standard push: jp && git add -A && git commit -m "message" && git push
- Pre-commit hook runs check-syntax.js automatically — always check output

## Current Mode
REFACTOR — cleaning up problem areas. New features welcome alongside cleanup work.

## Terminal Workflow
All edits are done via terminal — no file upload/download.

**Shell aliases (in ~/.zshrc):**
- jp — cd ~/Documents/jpStudio
- jpstart — kill app, restart, cd to project

**Standard patterns:**
- python3 << 'PYEOF' for multi-line edits (most reliable)
- sed -n X,Yp file | pbcopy — read a block
- grep -n "pattern" file | pbcopy — locate lines
- Never paste grep output back into terminal

**Critical lessons:**
- python3 string matching fails silently on whitespace/encoding differences — when FAIL, use sed -n to read exact lines before retrying
- When sed -i shows no error but git shows nothing to commit — match failed silently. Always verify with grep after.
- Em dashes (—) and other multi-byte chars cause python3 string match failures — use regex or line-number approach instead
- Never use comment lines (#) in multi-command terminal pastes — zsh parse error
- git revert requires cd to project dir first
- Don't paste grep output into terminal — it causes parse errors

## Button System

### Philosophy
Buttons classified by FUNCTION not appearance. 7 functional classes:

| Class | Function | Appearance |
|-------|----------|------------|
| .btn-action | Single action (Submit, Check, Generate, Send) | White border at rest, teal fill on hover |
| .btn-copy | Copy to clipboard | Same as btn-action |
| .btn-toggle | Binary on/off state (Hint, Loop, Wave) | White border at rest, teal border+fill when on |
| .btn-group | One-of-N selector (mode, direction) | White border at rest, ink on hover, teal when active |
| .btn-nav | Navigation (Prev, Next, Back) | White border at rest, ink on hover |
| .btn-destructive | Irreversible action (Delete, Clear all) | White border at rest, red fill on hover |
| .btn-rating + .btn-rating-red/.btn-rating-teal | SRS rating | Colour border at rest, colour fill on hover |

### Reference: vocab drill is the visual standard for all drills
- Prev / Next → btn-nav
- Again → btn-rating btn-rating-red
- Got it / Known / Learned → btn-rating btn-rating-teal
- Reveal → btn-rating (plain at rest, btn-rating-teal when active via JS)
- Single actions (Reset deck, New session) → btn-action
- Toggles (Reading, Pitch) → btn-toggle
- Selectors (JP→EN) → btn-group

### Rules
- No icons on buttons if text is present
- Strip decorative arrows, checkmarks, symbols from button labels
- Sizing: normalise later once all panels are migrated

### Migration status
- btn-primary → btn-action: global replace done
- Grammar sentences panel: Create, Ask, Check/Next, Skip → all btn-action ✓
- Check/Skip/🔊 moved to same row as kana strip ✓

### Panels completed
- Writing panel: Submit, Save → btn-action; Clear → btn-destructive; Copy → btn-copy
- Vocab drill: all buttons migrated
- Word drill (grammar): Prev/Next → btn-nav; Again/OK/Known → btn-rating
- Lesson notes drill: Prev/Next → btn-nav; Reveal → btn-rating; Learned → btn-rating-teal
- Grammar sentences: all 4 buttons → btn-action; layout fix ✓

### Remaining panels (do in order)
Translate, Read, Listen, Video, Voice, Grammar, Kana, Settings, Dashboard

## Storage Migration

### Philosophy
Two backends exist: Storage (SQLite-backed) and localStorage (legacy).
Goal: all app data in Storage. localStorage only for device-specific settings (API keys, TTS voice etc).

### Migrated
- gramSentHistory → Storage
- vocabBookmarks → Storage
- qrSession → Storage
- breakdownCache → Storage
- GRAM_SENT_SESSIONS → Storage
- YOSHI_KEY (jpStudioYoshiSessions) → Storage as YOSHI_SESSIONS ✅ (this session)

### Still on localStorage (migrate next)
- voice profile (features-voice.js) — VOICE_PROFILE_KEY
- voice pause data (features-voice.js) — PAUSE_DATA_KEY
- video watch time (features-video.js) — VT_WATCH_KEY
- resources (features-video.js) — RESOURCES_KEY
- learned words (features-ln-p2.js) — LEARNED_WORDS_KEY

### Intentionally localStorage (do not migrate)
- API keys, TTS voice, furigana setting, default level, print settings
- lnLastSessionId (device preference — intentionally localStorage)

## Lesson Notes / Yoshi — This Session's Changes

### Completed Refactors
1. **Dual session system eliminated** — `_lnCurrentIdx` removed from features-tools.js. Single state via `LessonNotesState.currentIdx`.
   - `lnNewSession` → delegates to `lessonNotesLoadSession(-1)`
   - `lnLoadSession` → delegates to `lessonNotesLoadSession(idx)`
   - `lnDeleteSession` → uses `LessonNotesState.currentIdx`, delegates to `lessonNotesLoadSession`
   - `lnCurrentSession` → reads only from `LessonNotesState.currentIdx`

2. **Session restore working** — last open session reloads on panel open.
   - Save: `lnLastSessionId` in localStorage (intentional — device preference)
   - Restore: finds session by id in `lessonNotesGetSessions()`, calls `lessonNotesLoadSession(idx)`
   - Sessions now always have real `id` (Date.now()) assigned at creation
   - One-time backfill assigns ids to existing sessions that lacked them
   - Save in `lessonNotesLoadSession` no longer has `|| idx` fallback (id always exists)

3. **`lnCreateFromPaste` moved** — from features-tools.js to features-lesson-notes.js where it belongs.
   - `_lnExtracting` state var removed (was set but never read — dead state)
   - Now uses `lessonNotesGetSessions`/`lessonNotesSaveSessions` directly
   - Registered in features-lesson-notes.js App registry

4. **`_fy_*` wrappers removed** from features-yoshi.js — inline `(App.x || window.x)` pattern used directly.

5. **YOSHI_KEY → Storage** — `yoshiGetSessions`/`yoshiSaveSessions` now use `Storage.getJSON`/`setJSON`. One-time migration from localStorage on first panel open.

### Lesson Notes Architecture (confirmed)
- "Yoshi" = internal code name for Lesson Notes panel. Same panel, same data.
- Panel is a session dashboard + data entry hub. Tabs: Words, Stories, Phrases, Grammar, Recording.
- Stories → links to Read panel ✅
- Grammar → links to Sentence Builder ✅
- Words drill → future: move to Vocab panel as lesson session filter
- Phrases drill → future: move to Vocab panel
- Recording/transcript → stays in Lesson Notes (session-specific)

## Known Issues
- yoshiInitUI is not defined on startup — pre-existing, not blocking (nothing calls it — stale error)
- PDF print line breaks — BrowserWindow PDF ignores display:block on spans
- _lastPanel not defined in features-video.js — pre-existing, not blocking

## Pending Refactors (next session priority order)
1. **features-tools.js cleanup** — still contains `yoshiParseWhatsapp`, `lnSwitchTab`, `lnSetDrillMode`, `lnDrillReveal/Next/Prev/Jump`, `lnRefreshTab`, `lnOpenStory` etc. These belong in features-lesson-notes.js. File is self-described as "residual".
2. **`_fvid_*` wrappers** in features-video.js — same pattern as `_fy_*`, now fixed.
3. **Storage migration** — voice profile, pause data, watch time, resources, learned words.
4. **75 redundant `window[]` exports** — functions exported to both window and App registry; window[] ones can be removed.
5. **features-yoshi.js → merge into features-lesson-notes.js** — same panel, 651 lines, no reason to be separate.

## Pending Work (non-style)

### Pitch Accent — unblocked
Data layer complete. Next steps:
1. renderPitchCurve(word, pitchStr) SVG function in core-foundation.js
2. Wire into vocab card render
3. Show curve + VoiceVox speak simultaneously
4. Roll out to quick translate, lesson notes, grammar drill, voice drill

pitchAPI: window.pitchAPI.lookup(kanji, reading) → pitch string or null
Format: "0", "2", "0,2" — 0=heiban, 1+=drops after that mora

### Grammar Sentences — Phase 3 (frozen)
- Progress chart for gramSent accuracy over time
- Grammar node signals from sentence errors

### Phone Audio Export (planned)
- ffmpeg converts lesson WebM → M4A
- Saves to ~/Dropbox/jpStudio-audio/YYYY-MM-DD-lesson.m4a

### Future (frozen)
- DrillRecord unified history, TextEntry migration, AudioStrip
- Voice drill → DB, SRS for custom drill, Progress charts
- iPhone PWA

## SQLite Schema (v9)
Tables: kv_store, frames, transcript_sentences, corpus_entries, corpus_lookups, corpus_productions, srs_items, error_history, lesson_sessions, words, lesson_phrases, pitch_data
pitch_data: id, kanji, reading, pitch — 124,137 entries
words: added pitch TEXT column
Access: window.pitchAPI.lookup(kanji, reading)

## Lesson Notes Architecture
- Vocab → SQL words, source=lesson, lesson_id by date match
- Phrases → SQL lesson_phrases, lesson_id by date match
- Grammar → gramSentPracticePattern()
- lessonDoc bonus → _lessonWordSet loaded at startup
- Stories, WhatsApp → kvAPI blob
- Recording + transcript → lesson_sessions SQL

## Console Filter Reference
- [pitch] — pitch accent import/load
- [LN] — Lesson Notes extractions + lesson_id
- [API] — Claude API calls
- [STT] — Whisper transcription
- [AppEvents] — recording pipeline
- [yoshi] — yoshi session storage migration
