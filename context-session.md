# Japanese Studio — Session Context
Last updated: 2026-05-30 (session 14 — WhatsApp import fix, Yoshi panel redesign, hallucination filter, story reader)

## User Preferences
- Paul is learning development workflows as we go — suggest improvements concisely.
- Management window deprioritised — terminal approach preferred for all edits.
- Use jp alias (cd ~/Documents/jpStudio) not full path in commands.
- pbcopy for all grep/sed output.
- Always prefix multi-line python3 edits with jp && to avoid directory drift.
- "done" means command ran and printed OK.

## Chat vs Claude Code — Decision Rule
- **Chat:** single-line fixes, config changes, version bumps, CSS tweaks, grep/sed one-offs
- **Code:** anything touching multiple render paths, tracing logic across functions, multi-file refactors, anything where "trace this call chain" is needed
- Cost: Code uses more input tokens (reads full files). Chat is cheaper for small edits.
- Code saves ~45-60 min vs chat for complex render path fixes.

## Context File Update Process
- context-session.md lives at project root
- At end of session: Claude writes full updated file, Paul runs it, uploads to project Knowledge.

## GitHub Workflow
- Repo: https://github.com/jpstudioyoshi/jpstudio (private)
- Token stored in remote URL — no password prompt needed.
- Standard push: jp && git add -A && git commit -m "message" && git push
- Pre-commit hook runs check-syntax.js automatically — always check output

## Claude Code
- Installed: @anthropic-ai/claude-code (sudo npm install -g @anthropic-ai/claude-code)
- Auth: ANTHROPIC_API_KEY set permanently in ~/.zshrc
- Launch: jp && claude
- Start each session: "Read context-static.md and context-session.md only. Do not read any other files yet."
- Cost: uses Anthropic API credits. Best for multi-file tasks. Single-file edits cheaper in chat.
- Token tip: give tight focused briefs, one panel/file at a time.
- Guide: claude-code-guide.md in project root

## Current Mode
STABILIZATION — bug fixes and UI polish. No feature expansion.

## HTML Element Map
`html-map.md` in project Knowledge — panel-by-panel ID inventory. Check before touching any panel element.

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
- Update style.css?v= version string after CSS changes to bust Electron cache
- Use /tmp/ temp files for complex JS replacements to avoid Python escaping issues

**Critical lessons:**
- python3 string matching fails silently on whitespace/encoding differences
- sed replacing function names as well as call sites — always check after
- Line numbers shift after edits — re-grep before editing again
- Duplicate CSS rules accumulate — grep for class name before adding new rules
- Electron caches CSS — always bump style.css?v= version string after changes
- position:fixed can be overridden by earlier duplicate rules — grep for all instances first
- When line-number deletion leaves orphan braces — always run node check-syntax.js after edits

## Design Language

### Layout Structure
- **Top bar (nav):** primary panel switching — JP kanji + English label tabs
- **Sidebar:** context-sensitive subtabs top, reference panels bottom
- **Section title:** `語彙 [Words ▾]` — kanji + dropdown for subtab switching, remembers last used
- **Content area:** drill/content fills available space
- **Upper footer:** intra-session controls (Prev/Again/Got it/Learned/Next, mode toggles) — fixed to bottom
- **Lower footer:** session setup filters (Level/Type/Size, show toggles) — fixed to very bottom

### Footer implementation
- Both footers use `position: fixed !important`
- upper footer: `bottom: 10vh; left: 52px; right: 0`
- lower footer: `bottom: 0; left: 52px; right: 0`
- Each 10vh tall
- CSS classes: `.footer-upper`, `.footer-lower`, `.footer-lower-row`

### Panel Headers
All panels use `panel-header-lower` + `panel-section-title` pattern.
Header divs declared in index.html, shown/hidden in `showPanel()` in core-foundation.js.
`panel-header-lower` uses `min-height:56px; height:auto; flex-wrap:wrap`.
Panel padding-top: `#panel-lessonnotes { padding-top: 75px }`, `#panel-progress { padding-top: 75px }`.

Panels with headers: voice, listen, writing, read, words, grammar, yoshi (lessonnotes), progress.

`yoshiPanelHeader` renders dynamically via `lessonNotesUpdatePanelHeader()`:
- Left: ヨシ title + view dropdown
- Right: session selector + New (+) + Delete (🗑)

## Button System — COMPLETE
All legacy classes removed. No btn-ghost, btn-danger, btn-subtle, btn-kana, btn-primary in live code.

**Base classes:**
- `btn-action` — primary action (teal hover)
- `btn-nav` — navigation / secondary (ink hover)
- `btn-toggle` — toggle state (teal when on)
- `btn-group` — mutually exclusive group
- `btn-destructive` — destructive actions (red hover)
- `btn-rating` — SRS ratings
- `btn-copy` — copy to clipboard
- `btn-icon` — small icon-only buttons (🔊 ✕ ✎), low opacity at rest

**Modifiers:**
- `btn-sm` — 0.75rem, 3px 8px padding
- `btn-xs` — 0.65rem, 1px 6px padding
- `btn-icon-teal` — teal on hover
- `btn-icon-del` — red on hover
- `btn-rating-red` — red rating (Again)
- `btn-rating-teal` — teal rating (Got it / Known)

## Yoshi (Lesson Notes) Panel — THIS SESSION

### Panel Header
`yoshiPanelHeader` renders dynamically via `lessonNotesUpdatePanelHeader()`.
Called from both `lessonNotesRender()` and `lessonNotesRenderPanel()`.

### View Dropdown Options
- Vocab Drill — card drill, click to reveal
- All Words — 2-column word table
- Stories — grid of story tiles
- Phrases — 3-column grouped layout
- Grammar — 2-column grouped layout
- Errors — error list
- Recording — linked recording player

### Vocab Drill Layout
- `.vocab-counter` above card (x / total)
- Card: `.ln-drill-card` / `.ln-drill-card-area`
- Click card to reveal
- Under card: Prev / Again (red) / Got it (teal) / Learned (teal) / Next
- Upper footer: JP→Reading / JP→Meaning / EN→JP / Listen / Shuffle
- Lower footer: +Reading / +Meaning toggles

### Story Reader
Opened via `lessonNotesOpenStory(idx)`.
Subtabs: Read / Vocab / Notes / Edit (Cloze removed — dead feature).
Dropdown stays on "Stories" when viewMode === 'reading' (fixed this session).

### Extraction
- Phrases: `group` field, 15-30 items, groups: Greetings & Openers / Classroom Language / Time & Sequence / Describing & Explaining / Expressing Feelings & Opinions / Questions & Requests / Grammar Connectors / Other
- Grammar: `group` field, 10-15 items max, max_tokens:5000, groups: Particles / Verb Forms / Adjectives / Connectors & Conjunctions / Expressions & Set Phrases / Sentence Endings / Other

### _fy_ wrappers (added this session)
```js
const _fy_getApiKey  = () => (App.getApiKey  || window.getApiKey)?.();
const _fy_claudeAPI  = (...a) => (App.claudeAPI || window.claudeAPI)?.(...a);
const _fy_claudeText = (d) => (App.claudeText || window.claudeText)?.(d);
```

## TranscriptionService — Hallucination Filter
`_filterHallucinations(segments)` in `src/services/TranscriptionService.js`.
Applied in both `transcribe()` and `transcribeFile()`.
Known hallucinations: ご視聴ありがとうございました, チャンネル登録よろしくお願いします, ありがとうございました, お疲れ様でした, Thank you for watching, Please subscribe, Like and subscribe.

## Settings — Teacher Track
Checkbox added to Microphone section: "Record teacher track (loopback)".
Saves to `Storage.set('recordTeacherTrack', this.checked)`.
Wired in `AudioService.js` — reads setting before BlackHole discovery, skips loopback if false.

## CSS — ln-drill-card classes
```css
.ln-drill-card-area { display: flex; justify-content: center; margin: 20px 0; }
.ln-drill-card { width: 380px; height: clamp(200px, calc(100vh - 440px), 280px); background: var(--paper-dark); border: 1px solid var(--border); border-radius: 8px; display: flex; align-items: center; justify-content: center; padding: 24px; }
```

## Known Issues
- yoshiInitUI not defined on startup — pre-existing, not blocking
- PDF print line breaks — pre-existing
- Two parallel Yoshi render paths still exist (consolidation pending)

## Pending Work — Priority Order

### Next Session
1. **Yoshi render path consolidation** — merge `lessonNotesRender()` (writes to #lessonNotesView / #lessonNotesViewMain) into `lessonNotesRenderPanel()` (writes to #lessonNotesPanelContent). Use Code. Check if #lessonNotesView and #lessonNotesViewMain still exist in index.html first.
2. **Progress panel header** — add briefing refresh + About me controls into header
3. **Dead code cleanup** — `lessonNotesUpdateTabControls()`, old `lessonNotesPanelSelect`

### TextInputDrill Component — Planned
All text-input drills share the same structure but are independently built:
1. Kana drill (core-kana.js) — auto-check on input
2. Kana word drill (core-kana-drill.js)
3. Grammar conjugation drill (features-grammar.js)
4. Grammar sentence drill (features-grammar.js)
5. Grammar pattern drill (features-grammar.js)
6. Counter drill (core-counters.js)
7. Yoshi story cloze — removed

Plan: Build `src/ui/TextInputDrill.js` component. Migrate conjugation first (most complex = best test), then counters, then kana. Kana auto-check logic may need to stay separate.
**Do after render consolidation.**

### Dropbox Recordings Redirect — Pending Decision
- Move `getLessonsDir()` in main.js to Dropbox folder
- Migrate `audio_path` in `lesson_sessions` (absolute paths will break)
- Depends on: Dropbox path, mobile app scope (iOS? read-only or record?)

### Video → Audio Pipeline
- Screen record Teams call, extract audio with ffmpeg, send to Whisper
- ffmpeg -i input.mp4 -vn -c:a libopus output.webm
- Needs file picker + ffmpeg extract step in app

### Pitch Accent — Unblocked, High Value
- renderPitchCurve() SVG in core-foundation.js
- Wire into vocab card render
- pitchAPI: window.pitchAPI.lookup(kanji, reading) → pitch string or null

### Lesson Mode Architecture — Future
- Global App.lessonMode = { id, label }
- Each panel pre-filters by lesson_id when set
- Topbar indicator showing current lesson

## SQLite Schema (v9)
Tables: kv_store, frames, transcript_sentences, corpus_entries, corpus_lookups, corpus_productions, srs_items, error_history, lesson_sessions, words, lesson_phrases, pitch_data
pitch_data: 124,137 entries
Access: window.pitchAPI.lookup(kanji, reading)

## Storage Migration Status
### Migrated to kvAPI
gramSentHistory, vocabBookmarks, qrSession, breakdownCache, GRAM_SENT_SESSIONS, YOSHI_KEY, WRITING_ERRORS ✓

### Still on localStorage
voice profile, voice pause data, video watch time, resources, learned words
