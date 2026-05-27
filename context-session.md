# Japanese Studio — Session Context
Last updated: 2026-05-27 (session 9 — grammar sentences, progress panel, session restore)

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
- GRAM_SENT_SESSIONS → Storage (new, this session)

### Still on localStorage (migrate next)
- voice profile (features-voice.js) — VOICE_PROFILE_KEY
- voice pause data (features-voice.js) — PAUSE_DATA_KEY
- video watch time (features-video.js) — VT_WATCH_KEY
- resources (features-video.js) — RESOURCES_KEY
- learned words (features-ln-p2.js) — LEARNED_WORDS_KEY
- features-yoshi.js — YOSHI_KEY

### Intentionally localStorage (do not migrate)
- API keys, TTS voice, furigana setting, default level, print settings
- lnLastSessionId (device preference — intentionally localStorage)

## Progress Page — This Session's Changes
- Four Strands: Grammar tile → Sentence Building (key: gramSent, panel: grammar2) in STUDY + FLUENCY
- Sentence Building tile triggers on ≥5 sentences completed
- Counter Mastery + Sentence Building heatmap: now side by side (half width each)
- Four Strands: capped at 40% width
- Sidebar: progress range filters (today/week/last week/all time) appear vertically when progress panel open, hidden otherwise
- One unified filter set drives both strandRange and masteryView via progRangeSet()
- Sentence Building heatmap: rows=targets, cols=weeks, colour=error rate, hover=error breakdown
- Today filter: fixed to show grey cells when no data (not stale fallback data)

## Grammar Sentences — This Session's Changes
- Rolling generation: generates 1 sentence at a time, prefetches next in background
- Always 5 sentences per session (GRAM_SENT_TOTAL = 5)
- Vocab priority context injected into prompt (vocabPriorityContext())
- Variety nudge: avoids repeating sentences from last 3 sessions on same target
- Error analysis on completion: wrong answers sent to Claude for categorisation
- Particle errors routed to writingErrorsAdd()
- Full session record saved to GRAM_SENT_SESSIONS (target, score, sentences, errors)
- History dropdown populates after push from lesson notes (timing fix)
- Inline card feedback: minimal (✓ or → correct answer only); full detail in right column

## Lesson Notes / Yoshi — This Session's Changes
- Session restore attempted (lnLastSessionId in localStorage) — NOT FULLY WORKING (see refactor below)
- Save happens in lessonNotesLoadSession (features-ln-p2.js line ~747)
- Restore attempted in showPanel('lessonnotes') in core-foundation.js

## PRIORITY NEXT SESSION: Lesson Notes Session Refactor

### The Problem
There are two parallel session systems that conflict:

**System A — features-lesson-notes.js + features-ln-p2.js (CORRECT one):**
- State: `LessonNotesState.currentIdx`
- Load: `lessonNotesLoadSession(idx)` in features-ln-p2.js line 726
- Get sessions: `lessonNotesGetSessions()` in features-lesson-notes.js (NOT exported to App or window)
- Dropdown: `onchange="lessonNotesLoadSession(parseInt(this.value));lessonNotesRenderPanel()"`
- This is what the UI actually uses

**System B — features-tools.js (LEGACY, should be deleted):**
- State: `_lnCurrentIdx`
- Load: `lnLoadSession(idx)`
- Get sessions: `lnGetSessions()`
- Used only by tools tab rendering (lnRenderTab, lnCurrentSession)

### The Cleanup Plan
1. **Export from System A to App:**
   - `lessonNotesGetSessions` → App registry
   - `lessonNotesLoadSession` → App registry (already on window via features-ln-p2.js?)
   - `LessonNotesState` → window (check if already there)

2. **Remove from System B (features-tools.js):**
   - Delete `_lnCurrentIdx`
   - Delete `lnLoadSession`, `lnNewSession`, `lnDeleteSession`
   - Replace all `_lnCurrentIdx` refs with `LessonNotesState.currentIdx`
   - Replace `lnGetSessions()` calls with `lessonNotesGetSessions()`
   - Replace `lnCurrentSession()` with direct `LessonNotesState` access

3. **Session restore (trivial after cleanup):**
   - Save: `localStorage.setItem('lnLastSessionId', String(sessions[idx].id))` in `lessonNotesLoadSession`
   - Restore: after `Orchestrator.loadSessions()`, find session by id, call `lessonNotesLoadSession(idx)`

4. **Verify:** all session CRUD (new, load, delete, save) goes through one path

### Files to touch
- features-ln-p2.js — add export, add localStorage save
- features-lesson-notes.js — export lessonNotesGetSessions to App
- features-tools.js — remove System B functions, update lnCurrentSession/lnRenderTab
- core-foundation.js — simplify restore block

### Do NOT touch
- Session data format (kvAPI blob)
- lessonNotesRenderPanel logic
- Orchestrator integration

## Known Issues
- yoshiInitUI is not defined on startup — pre-existing, not blocking
- PDF print line breaks — BrowserWindow PDF ignores display:block on spans
- _lastPanel not defined in features-video.js — pre-existing, not blocking
- Kanji conversion: verbose fallback fixed (discard non-Japanese responses)
- Writing chat history: now pushes clean JSON not raw response

## Pending Work (non-style)

### Pitch Accent — after lesson notes refactor
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
