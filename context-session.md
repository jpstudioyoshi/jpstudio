# Japanese Studio — Session Context
Last updated: 2026-05-26 (session 8 — button system)

## User Preferences
- Paul is learning development workflows as we go — suggest improvements concisely.
- Management window deprioritised — terminal approach preferred for all edits.
- All output must use | tee /dev/tty | pbcopy

## Context File Update Process
- context-session.md lives at project root
- At end of session: Claude writes full updated file, Paul runs it, uploads to project Knowledge.

## GitHub Workflow
- Repo: https://github.com/jpstudioyoshi/jpstudio (private)
- Token stored in remote URL — no password prompt needed.
- Standard push: git add -A && git commit -m "message" && git push 2>&1 | tee /dev/tty | pbcopy
- Pre-commit hook runs check-syntax.js automatically

## Current Mode
FEATURE DEVELOPMENT — button system migration in progress.
- Prefer minimal edits over redesigns
- Prefer wrappers over refactors
- Do not introduce new abstractions unless they solve a concrete current problem

## Terminal Workflow
All edits are done via terminal — no file upload/download.

**Shell aliases (in ~/.zshrc):**
- jp — cd ~/Documents/jpStudio
- jpstart — kill app, restart, cd to project
- setopt NO_BANG_HIST — disables zsh ! history expansion

**Standard patterns:**
- Always cd ~/Documents/jpStudio first
- python3 << 'PYEOF' is the most reliable way to run multi-line edits
- sed -n 'X,Yp' file | pbcopy — read a block
- grep -n "pattern" file | pbcopy — locate lines
- Always | tee /dev/tty | pbcopy on push

**Critical lessons:**
- python3 string matching fails on whitespace/encoding differences — when NOT FOUND, use sed -n to read exact lines before retrying
- When a sed -i edit shows no error but git shows nothing to commit — the match failed silently. Always verify with grep after.
- Design overlay shortcut is Cmd+Shift+E (D was reserved by Electron)
- Design overlay opens in paused mode by default — click ▶ to inspect elements

## Button System (session 8)

### Philosophy
Buttons are classified by FUNCTION not appearance.
6 functional classes — everything maps to one of these:

| Class | Function | Appearance |
|-------|----------|------------|
| `.btn-action` | Single action (Submit, Check, Generate, Send) | White border at rest, teal fill on hover |
| `.btn-copy` | Copy to clipboard | Same as btn-action |
| `.btn-toggle` | Binary on/off state (Hint, Loop, Wave) | White border at rest, teal on hover, teal bg when on |
| `.btn-group` | One-of-N selector (mode, direction) | White border at rest, ink on hover, teal active |
| `.btn-nav` | Navigation (Prev, Next, Back) | White border at rest, ink on hover |
| `.btn-destructive` | Irreversible action (Delete, Clear all) | White border at rest, red fill on hover |
| `.btn-rating` + `.btn-rating-red`/`.btn-rating-teal` | SRS rating (Again/OK/Known) | White border at rest, colour fill on hover |

### Migration status
- btn-primary → btn-action: global replace done (51 replacements)
- btn-copy: defined + propagated to all copy buttons
- btn-rating: defined + applied to vocab drill + word drill
- btn-nav: applied to vocab drill + word drill Prev/Next
- btn-destructive: applied to writing panel Clear
- btn-toggle: applied to vocab drill toggles (Hint, Reading, Pitch)
- btn-group: applied to vocab drill direction button

### Panels completed
- Writing panel: Submit → btn-action, Save → btn-action, Clear → btn-destructive, Copy → btn-copy
- Vocab drill: all buttons migrated, layout reorganised (nav/rating above toggles, mastered count in counter)

### Remaining panels (do in order)
Translate, Read, Listen, Video, Voice, Grammar, Kana, Settings, Dashboard
For each panel: identify all buttons, classify by function, replace in one script, verify.

### Rules
- No icons on buttons if text is present
- Strip decorative arrows (→, ✕, ✓, ←, ⬇, 🖨 etc) from button labels
- Sizing: normalise later once all panels are migrated
- When migrating a panel: grep the panel HTML, classify each button, write one Python script for all replacements

## Design Overlay (session 8)
- File: src/design-overlay.js, loaded at bottom of index.html
- Toggle: Cmd+Shift+E (or ⬡ Design button in Settings → tab bar)
- Opens paused by default — click ▶ to enable element inspection
- ◀/▶ button moves panel left/right
- Copy changes button outputs CSS var changes + class changes for manual apply

## Known Issues
- yoshiInitUI is not defined on startup — pre-existing, not blocking
- PDF print line breaks — BrowserWindow PDF ignores display:block on spans
- Writing panel feedback — verbose on ambiguous kana input
- _lastPanel not defined in features-video.js — pre-existing, not blocking
- Print button on vocab panel: fixed (hidden until word list opens)

## Pending Work (non-style)

### Pitch Accent — next after button migration
Data layer complete. Next steps:
1. renderPitchCurve(word, pitchStr) SVG function in core-foundation.js
2. Wire into vocab card render
3. Show curve + VoiceVox speak simultaneously
4. Roll out to quick translate, lesson notes, grammar drill, voice drill

pitchAPI: window.pitchAPI.lookup(kanji, reading) → pitch string or null
Format: "0", "2", "0,2" — 0=heiban, 1+=drops after that mora

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
