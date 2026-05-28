# Japanese Studio — Session Context
Last updated: 2026-05-28 (session 12 — inline style → classList migration via Claude Code)

## User Preferences
- Paul is learning development workflows as we go — suggest improvements concisely.
- Management window deprioritised — terminal approach preferred for all edits.
- Use jp alias (cd ~/Documents/jpStudio) not full path in commands.
- pbcopy for all grep/sed output.
- Always prefix multi-line python3 edits with jp && to avoid directory drift.

## Context File Update Process
- context-session.md lives at project root
- At end of session: Claude writes full updated file, Paul runs it, uploads to project Knowledge.

## GitHub Workflow
- Repo: https://github.com/jpstudioyoshi/jpstudio (private)
- Token stored in remote URL — no password prompt needed.
- Standard push: jp && git add -A && git commit -m "message" && git push
- Pre-commit hook runs check-syntax.js automatically — always check output

## Claude Code
- Installed: @anthropic-ai/claude-code (sudo npm install -g)
- Auth: ANTHROPIC_API_KEY set permanently in ~/.zshrc
- Launch: jp && claude
- Start each session: "Read context-static.md and context-session.md only. Do not read any other files yet."
- Cost: uses Anthropic API credits. Best for multi-file tasks. Single-file edits cheaper in chat.
- Token tip: give tight focused briefs, one panel/file at a time.

## Current Mode
STABILIZATION — cleanup complete. Ready for UI design and new features.

## Terminal Workflow
All edits are done via terminal — no file upload/download.

**Shell aliases (in ~/.zshrc):**
- jp — cd ~/Documents/jpStudio
- jpstart — kill app, restart, cd to project

**Standard patterns:**
- python3 << 'PYEOF' for multi-line edits (most reliable)
- Always prefix with jp && to avoid directory drift
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
- sed replacing function names as well as call sites — always check for broken function definitions after sed runs

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

### Migration status — COMPLETE ✓
All panels migrated. btn-ghost, btn-danger, btn-kana all removed from codebase.

### Panels completed
- Writing, Vocab drill, Word drill, Lesson notes drill, Grammar sentences ✓
- Translate, Read, Listen, Voice, Grammar, Kana, Settings, Dashboard ✓
- Kanji corpus filter/sort, SRS rate buttons, Dashboard agent buttons ✓

### Inline style.color/borderColor cleanup (session 12)
JS-side inline style assignments replaced with classList calls:
- core-stt.js ✓ — btn-active-red on mic test, dangling toggleTransKana code removed
- core-listen.js ✓ — toggle-on for dictation/shadow/SRS toggles, btn-active for rec mode group, loop button moved off gold to toggle-on
- core-vocab.js ✓ — kanji corpus filter/sort/view buttons → btn-active
- features-reading.js ✓ — `.active` class for qr toggles, btn-active-red for vg-mic-btn
- features-voice.js ✓ — confirmed already clean (zero matches)
- index.html video panel (lines 2187-2465) ✓ — 21 of 24 buttons → btn-action/btn-toggle/btn-nav/btn-destructive

Other JS files in src/ not yet audited for inline button styles.

### Design system gaps (surfaced session 12)
Three video panel buttons left inline because no class matches:
- vtShRecordBtn — red-filled record button (no "red action" class exists)
- vtVocabListBtn — gold-outline (intentional accent, no gold-outline class)
- vtBreakdownArea close — borderless icon X (no borderless close class)
Consider when extending the button system.

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
- YOSHI_KEY (jpStudioYoshiSessions) → Storage as YOSHI_SESSIONS ✅

### Still on localStorage (migrate when touching those files)
- voice profile (features-voice.js) — VOICE_PROFILE_KEY
- voice pause data (features-voice.js) — PAUSE_DATA_KEY
- video watch time (features-video.js) — VT_WATCH_KEY
- resources (features-video.js) — RESOURCES_KEY
- learned words (features-ln-p2.js) — LEARNED_WORDS_KEY

### Intentionally localStorage (do not migrate)
- API keys, TTS voice, furigana setting, default level, print settings
- lnLastSessionId (device preference — intentionally localStorage)

## Known Issues
- yoshiInitUI is not defined on startup — pre-existing, not blocking (nothing calls it — stale error)
- PDF print line breaks — BrowserWindow PDF ignores display:block on spans
- _lastPanel not defined in features-video.js — pre-existing, not blocking
- Duplicate id `vtBreakdownBtn` in index.html (lines 2377 and 2410) — pre-existing, surfaced session 12
- `sttTranscribe()` in core-stt.js — undefined `data` variable on success path, transcript always null — pre-existing bug, surfaced session 12

## Pending Refactors (low priority — codebase is clean enough to build on)
1. **75 redundant window[] exports** — functions exported to both window and App registry; window[] ones can be removed.
2. **Storage migration** — voice profile, pause data, watch time, resources, learned words.
3. **features-tools.js cleanup** — still contains some lesson notes functions. Self-described as residual.

## Video Panel — Design Note
Button-level migration done in session 12 (21 of 24 buttons on btn-* classes). Wider layout/structure still flagged for redesign per design-rules.md ("Do not redesign the video panel until a separate decision is made"). The 3 inline holdouts are noted under "Design system gaps" in the Button System section.

## Pending Work (non-style)

### Pitch Accent — unblocked, highest value next feature
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

## Design System Gaps (extend when needed)
Three patterns consistently left inline during migration — address when building new UI:
1. Transient flash feedback (copy success "✓ Copied") — needs .btn-flash class with auto-reset
2. 3-state toggles with gold variant — design system handles 2-state only; gold third state left inline
3. Recording state red — btn-active-red exists but not formally documented as the recording pattern
