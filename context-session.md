# Japanese Studio — Session Context
Last updated: 2026-05-26 (session 8 — pitch curve + style completion)

## User Preferences
- Paul is learning development workflows as we go — suggest improvements to workflow, terminal usage, or API cost savings where appropriate, but keep suggestions concise and actionable.
- Management window is deprioritised — was too buggy and expensive to debug via Claude. Terminal approach is preferred for all edits.

## Context File Update Process
- context-session.md lives at project root
- At end of session: ask Claude to write the full updated file, run it, then upload to Claude project Knowledge.

## GitHub Workflow
- Repo: https://github.com/jpstudioyoshi/jpstudio (private)
- Token stored in remote URL: git remote set-url origin https://jpstudioyoshi:TOKEN@github.com/jpstudioyoshi/jpstudio.git
- Claude uses: curl -s -H "Authorization: token TOKEN" "https://raw.githubusercontent.com/jpstudioyoshi/jpstudio/main/FILE"
- Standard push: git add -A && git commit -m "message" && git push 2>&1 | tee /dev/tty | pbcopy
- Pre-commit hook runs check-syntax.js automatically

## Current Mode
FEATURE DEVELOPMENT — stabilization complete, style complete.
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
- Edits: use python3 << 'PYEOF' ... PYEOF for multi-line scripts
- Always use | tee /dev/tty | pbcopy — prevents empty clipboard on errors

**Critical lessons learned:**
- When using node -e "..." in zsh, ! causes "event not found". Use file-based scripts.
- Always cd ~/Documents/jpStudio before any command.
- Username is paulandres — path is /Users/paulandres/Documents/jpStudio/
- python3 << 'PYEOF' is the most reliable way to run multi-line Python edits.
- GitHub token is in remote URL — no password prompt needed.
- For JS with template literals: write to /tmp/patch.js with cat > /tmp/patch.js << 'JSEOF', then apply with Python — avoids all escaping issues.

## Style Project — COMPLETE (session 8)

### CSS utility classes in style.css
- .result-correct / .result-wrong / .result-partial — drill feedback text colours
- .btn-active / .btn-active-gold / .btn-active-red — button selected states
- .toggle-on — toggle button ON state (teal)
- .input-error / .input-correct — input border states
- .btn-subtle — borderless low-priority button
- .btn-icon-teal / .btn-icon-del — icon button hover variants
- .btn-ghost-teal — ghost button with teal hover
- .row-hover / .row-hover-teal / .row-hover-gold — list row hover backgrounds
- .row-hover-border — teal border on hover (story cards)
- .error-row — subtle hover for error list items
- .voice-upload-btn — voice panel upload button
- .fe-del — inline delete button (red on hover)

### Documentation
- STYLE_GUIDE.md — complete, covers all tokens, button classes, state classes, row classes, rules for new features, do-not-touch list

## Pitch Accent — COMPLETE (session 8)
- renderPitchCurve(kana, pitchStr) in core-foundation.js — SVG curve, no kana labels, centred
- Vocab card wired — async pitchAPI.lookup().then() pattern
- vcPitch div in index.html (vocab card front)
- Toggle button: Hint / Reading / Pitch / JP→EN
- vcTogglePitch() + vcPitchVisible state in core-vocab.js
- pitchAPI.lookup() returns a Promise — always use .then()

## Known Issues
- PDF print line breaks — BrowserWindow PDF ignores display:block on spans
- Writing panel feedback — verbose on ambiguous kana input

## Pending Work

### Design Overlay (next — session 9)
- Cmd+Shift+D toggle
- Click any element → shows current classes + utility class picker
- Live CSS variable editor (colour pickers for all tokens)
- "Copy changes" outputs what changed for manual HTML apply
- Always-on dev tool (not conditional — app is local only)
- Prerequisite: STYLE_GUIDE.md ✅

### Pitch Accent — rollout to other panels (after overlay)
- Quick translate, lesson notes, grammar drill, voice drill
- Same async .then() pattern as vocab card
- pitchAPI.lookup(kanji, kana) → Promise<string|null>

### Phone Audio Export (planned)
- ffmpeg converts lesson WebM → M4A
- Saves to ~/Dropbox/jpStudio-audio/YYYY-MM-DD-lesson.m4a
- Decision pending: export button location

### Button/style audit (use overlay when ready)
- Settings tabs (lines 90-93) — inline styles, should be .tab-underline class
- Anki answer buttons — hand-rolled, should be .btn-anki-red/gold/teal
- Video panel action buttons — all hand-rolled inline styles
- Recording buttons — duplicated circular gradient, should be .btn-record

### Future (frozen)
- DrillRecord unified history, TextEntry migration, AudioStrip
- Voice drill → DB, SRS for custom drill, Progress charts
- iPhone PWA

## Recommended Session Sequence
1. Design overlay (Cmd+Shift+D)
2. Pitch rollout to other panels
3. Button audit using overlay
4. Phone audio export
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
words: pitch TEXT column added
Access: window.pitchAPI.lookup(kanji, reading) → Promise<string|null>
Format: "0", "2", "0,2" — 0=heiban, 1+=drops after that mora

## Lesson Notes Architecture
- Vocab → SQL words, source=lesson, lesson_id by date match
- Phrases → SQL lesson_phrases, lesson_id by date match
- Grammar → gramSentPracticePattern()
- lessonDoc bonus → _lessonWordSet loaded at startup
- Stories, WhatsApp → kvAPI blob
- Recording + transcript → lesson_sessions SQL
