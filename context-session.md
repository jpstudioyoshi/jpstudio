# Japanese Studio — Session Context
Last updated: 2026-05-25 (session 7 — style retrofit)

## User Preferences
- Paul is learning development workflows as we go — suggest improvements to workflow, terminal usage, or API cost savings where appropriate, but keep suggestions concise and actionable.
- Management window is deprioritised — was too buggy and expensive to debug via Claude. Terminal approach is preferred for all edits.

## Context File Update Process
- context-session.md lives at project root
- At end of session: ask Claude to write the full updated file, run it, then upload to Claude project Knowledge.

## GitHub Workflow (new — session 7)
- Repo: https://github.com/jpstudioyoshi/jpstudio (private)
- Claude reads files directly via GitHub raw API with token auth — no pbcopy needed
- Token stored in remote URL: git remote set-url origin https://jpstudioyoshi:TOKEN@github.com/jpstudioyoshi/jpstudio.git
- Claude uses: curl -s -H "Authorization: token TOKEN" "https://raw.githubusercontent.com/jpstudioyoshi/jpstudio/main/FILE"
- Standard push: git add -A && git commit -m "message" && git push 2>&1 | tee /dev/tty | pbcopy
- Pre-commit hook runs check-syntax.js automatically

## Current Mode
MAINTENANCE — stabilization complete. Style retrofit in progress.
- Prefer minimal edits over redesigns
- Prefer wrappers over refactors
- Do not introduce new abstractions unless they solve a concrete current problem
- Do not expand scope

## Terminal Workflow
All edits are done via terminal — no file upload/download.

**Shell aliases (in ~/.zshrc — permanent):**
- jp — cd ~/Documents/jpStudio
- jpstart — kill app, restart, cd to project
- setopt NO_BANG_HIST — disables zsh ! history expansion

**Standard patterns:**
- Always cd ~/Documents/jpStudio first — terminal does not persist directory
- grep -n "pattern" src/file.js — locate lines
- sed -n 'X,Yp' src/file.js | pbcopy — read a block
- Edits: use python3 << 'PYEOF' ... PYEOF for multi-line scripts (safer than heredoc or -c for complex strings)
- Always use | tee /dev/tty | pbcopy — prevents empty clipboard on errors

**Critical lessons learned:**
- When using node -e "..." in zsh, ! causes "event not found". Use file-based scripts.
- Always cd ~/Documents/jpStudio before any command.
- Username is paulandres — path is /Users/paulandres/Documents/jpStudio/
- python3 << 'PYEOF' is the most reliable way to run multi-line Python edits.
- GitHub token is in remote URL — no password prompt needed.

## Style Retrofit — Session 7 Status

### CSS utility classes added to style.css
- .result-correct — teal text for correct drill answers
- .result-wrong — red text for wrong answers
- .result-partial — gold text for partial/close answers
- .btn-active-red — red border+bg for wrong button states
- .toggle-on — teal border+bg for toggle buttons (on state)
- .input-error — red border for input validation
- .input-correct — teal border for correct input
- .btn-subtle — borderless small ink-light button, goes ink on hover
- .row-hover — paper-dark bg on hover for list rows
- .row-hover-teal — teal-tinted bg on hover
- .row-hover-gold — gold-tinted bg on hover
- .voice-upload-btn — voice panel upload label with gold hover
- .fe-del:hover — red color on hover for delete buttons
- #voiceRecordBtn:hover — scale(1.05) on hover

### JS files migrated
- src/features-voice-drill.js — 6 result color lines
- src/ui/DrillCard.js — 4 feedback color lines
- src/features-times.js — 8 drill result/toggle lines
- src/core-anki.js — direction toggle
- src/features-grammar.js — auto mode toggle + weak point selection
- src/features-video.js — wave, dictation, epub furi toggles
- src/features-voice.js — context filled indicator + row hover
- src/features-tools.js — lnTab group + chatHistory toggle
- src/features-lesson-notes.js — 3 row hover handlers
- src/features-ln-p2.js — 2 conversation row hover handlers

### HTML cleanup
- index.html — removed redundant btn-ghost hover handlers
- index.html — 3 orphan inline-styled buttons replaced with .btn-subtle
- index.html — voice upload label → .voice-upload-btn
- index.html — voiceRecordBtn scale hover → CSS rule

### Intentionally left alone
- Status indicator dots — color IS their content
- Recording button gradients — animation states
- Progress bar backgrounds — dynamic values
- Transient flash states — self-clearing
- Template literal hover handlers (~12 remaining)
- features-stroke.js — cssText elements
- core-listen.js — solid-fill active states

### Readiness for design review
~80% ready. Missing: STYLE_GUIDE.md documenting all tokens and utility classes.
Once written, Claude can do a full design audit.

## Stabilization Status

### Completed (session 7 — 2026-05-25)
- Style retrofit complete (see above)
- GitHub remote set up — Claude reads files via API
- python3 heredoc pattern established for reliable edits

### Completed (session 6 — 2026-05-25)
- Space bar play/pause wired to waveform canvas
- Kana engine re-applied on focus fix
- btn-active / btn-active-gold utility classes
- setButtonGroupActive() unified
- Check Input header .checking class
- style-audit.md created
- Read panel: furigana cache, PDF export, TTS download
- Overlay API key fix
- Grammar Q&A: English only

### Completed (session 5 — 2026-05-25)
- v9 schema: pitch_data table + pitch column on words
- Kanjium accent data (124,137 entries) imported to SQLite

### Completed (sessions 1-4 — 2026-05-24)
- features-lesson-notes.js split → features-ln-p2.js
- Cloze functions → features-yoshi.js
- Date field on all session creation paths
- lessonDoc bonus via _lessonWordSet
- Dead code removal, model string upgrades
- v7/v8 schema migrations

## Pending Work

### Pitch Accent — next priority
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
- Decision pending: export button location

### STYLE_GUIDE.md (next style session)
- Document all CSS variables (tokens)
- Document all utility classes with usage examples
- Enables: design review, theme switcher

### Known Issues
- yoshiInitUI is not defined on startup — pre-existing, not blocking
- PDF print line breaks — BrowserWindow PDF ignores display:block on spans
- Writing panel feedback — verbose on ambiguous kana input

### Future (frozen)
- DrillRecord unified history, TextEntry migration, AudioStrip
- Voice drill → DB, SRS for custom drill, Progress charts
- iPhone PWA

## Recommended Session Sequence
1. Pitch curve SVG (renderPitchCurve + vocab card wiring)
2. Dropbox audio export button
3. STYLE_GUIDE.md → design review
4. Theme switcher
5. Feature development

## Console Filter Reference
- [pitch] — pitch accent import/load
- [LN] — Lesson Notes extractions + lesson_id
- [API] — Claude API calls
- [STT] — Whisper transcription
- [AppEvents] — recording pipeline

## SQLite Schema (v9)
Tables: kv_store, frames, transcript_sentences, corpus_entries, corpus_lookups, corpus_productions, srs_items, error_history, lesson_sessions, words, lesson_phrases, pitch_data

pitch_data: id, kanji, reading, pitch — 124,137 entries
words: added pitch TEXT column (not yet backfilled)
Access: window.pitchAPI.lookup(kanji, reading)

## Lesson Notes Architecture
- Vocab → SQL words, source=lesson, lesson_id by date match
- Phrases → SQL lesson_phrases, lesson_id by date match
- Grammar → gramSentPracticePattern()
- lessonDoc bonus → _lessonWordSet loaded at startup
- Stories, WhatsApp → kvAPI blob
- Recording + transcript → lesson_sessions SQL
