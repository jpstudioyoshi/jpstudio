# Japanese Studio — Session Context
Last updated: 2026-05-30 (session 14 — WhatsApp import fix, Yoshi panel redesign, hallucination filter)

## User Preferences
- Paul is learning development workflows as we go — suggest improvements concisely.
- Management window deprioritised — terminal approach preferred for all edits.
- Use jp alias (cd ~/Documents/jpStudio) not full path in commands.
- pbcopy for all grep/sed output.
- Always prefix multi-line python3 edits with jp && to avoid directory drift.
- "done" means command ran and printed OK.

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

**Critical lessons:**
- python3 string matching fails silently on whitespace/encoding differences
- sed replacing function names as well as call sites — always check after
- Line numbers shift after edits — re-grep before editing again
- Duplicate CSS rules accumulate — grep for class name before adding new rules
- Electron caches CSS — always bump style.css?v= version string after changes
- position:fixed can be overridden by earlier duplicate rules — grep for all instances first
- When line-number deletion leaves orphan braces — always run node check-syntax.js after edits
- Use /tmp/ temp files for complex JS replacements to avoid Python escaping issues

## Design Language

### Layout Structure
- **Top bar (nav):** primary panel switching — JP kanji + English label tabs
- **Sidebar:** context-sensitive subtabs top, reference panels bottom
- **Section title:** `語彙 [Words ▾]` — kanji + dropdown for subtab switching, remembers last used
- **Content area:** drill/content fills available space
- **Upper footer:** intra-session controls (Reading/Pitch/Direction/Reset) — fixed to bottom
- **Lower footer:** session setup filters (Level/Type/Size) — fixed to very bottom

### Footer implementation
- Both footers use `position: fixed !important`
- upper footer: `bottom: 10vh; left: 52px; right: 0`
- lower footer: `bottom: 0; left: 52px; right: 0`
- Each 10vh tall
- CSS classes: `.footer-upper`, `.footer-lower`, `.footer-lower-row`

### Panel Headers
All panels use `panel-header-lower` + `panel-section-title` pattern.
Header divs declared in index.html, shown/hidden in `showPanel()` in core-foundation.js.
Pattern:
```html
<div id="xyzPanelHeader" class="panel-header-lower" style="display:none">
  <div class="panel-section-title">
    <span class="panel-section-title-jp">JP</span>
    <select class="btn-nav btn-sm" onchange="...">...</select>
  </div>
  <!-- right side controls -->
</div>
```
showPanel() wires: voice, listen, writing, read, words, grammar, yoshi (lessonnotes), progress.
`yoshiPanelHeader` and `progressPanelHeader` added this session.
`panel-header-lower` now uses `min-height:56px; height:auto; flex-wrap:wrap` to accommodate wider content.
Panel padding-top: `#panel-lessonnotes { padding-top: 75px }`, `#panel-progress { padding-top: 75px }`.

### Filter chips
- Blue chips (`filter-chip-blue`): level and size filters (word content)
- Purple chips (`filter-chip-purple`): POS/type filters (grammar content)
- Native checkbox/radio inputs hidden, `:has(input:checked)` controls active state
- Level: radio buttons N5 / N4 (=N5+N4) / N3 (=all) — JS expands via `_expandLevel()`
- Size: radio buttons 20 / All

### Accent colour
- Blue/slate: #5b9bd5 (replacing teal #30d5c8)
- Design rules: design-rules.md in project root

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
- `btn-icon-teal` — teal on hover (edit buttons)
- `btn-icon-del` — red on hover (delete buttons)
- `btn-rating-red` — red rating (Again)
- `btn-rating-teal` — teal rating (Got it / Known)

**Design system gaps (leave inline):** transient flash, 3-state gold toggles, recording red

## Inline Style Migration — COMPLETE
All JS files migrated. Remaining inline: transient flashes, 3-state gold, recording gradients, layout/margin one-offs.
Video panel deferred until redesign decision.

## Vocab Panel Redesign — COMPLETE
- Section title → `語彙 [Words ▾]` dropdown, remembers last subtab via localStorage
- Filters in footer (upper + lower), fixed to bottom
- Level filter: radio N5 / N4 / N3
- Size filter: radio 20 / All
- Card content vertically centred
- style.css version: ?v=20260530e

## Yoshi (Lesson Notes) Panel — REDESIGNED THIS SESSION
**Panel header:** `yoshiPanelHeader` now renders dynamically via `lessonNotesUpdatePanelHeader()`:
- Left: ヨシ title + view dropdown (Vocab Drill / All Words / Stories / Phrases / Grammar / Errors / Recording)
- Right: session selector + New (+) + Delete (🗑)

**View dropdown options:**
- Vocab Drill — card drill with click-to-reveal
- All Words — 2-column word table (no toggle button)
- Stories — grid of story tiles
- Phrases — 3-column grouped layout (groups: Greetings & Openers, Classroom Language, Time & Sequence, Describing & Explaining, Expressing Feelings & Opinions, Questions & Requests, Grammar Connectors, Other)
- Grammar — 2-column grouped layout (groups: Particles, Verb Forms, Adjectives, Connectors & Conjunctions, Expressions & Set Phrases, Sentence Endings, Other)
- Errors — error list
- Recording — linked recording player

**Vocab Drill layout:**
- Counter (x / total) above card — `.vocab-counter` class
- Card uses `.ln-drill-card` / `.ln-drill-card-area` classes
- Click card to reveal
- Under card: Prev / Again (red) / Got it (teal) / Learned (teal) / Next
- Upper footer: JP→Reading / JP→Meaning / EN→JP / Listen / Shuffle (btn-toggle btn-sm)
- Lower footer: +Reading / +Meaning toggles

**Extraction prompts updated:**
- Phrases: now includes `group` field, 15-30 items
- Grammar: now includes `group` field, 10-15 items max, max_tokens: 5000
- Both silent extractors updated to match

**_fy_ wrappers added** to features-lesson-notes.js (were missing, caused import hang):
```js
const _fy_getApiKey  = () => (App.getApiKey  || window.getApiKey)?.();
const _fy_claudeAPI  = (...a) => (App.claudeAPI || window.claudeAPI)?.(...a);
const _fy_claudeText = (d) => (App.claudeText || window.claudeText)?.(d);
```

**lessonNotesDrillAll() removed** — was causing "new lesson" page to open.

**lessonNotesUpdatePanelHeader()** added — called from lessonNotesRender() (option A) and lessonNotesRenderPanel(). Keeps header in sync on all render paths.

## Progress Panel Header
`progressPanelHeader` added — static ヨシ title only for now. Controls remain inline.

## TranscriptionService — Hallucination Filter
`_filterHallucinations(segments)` added to `src/services/TranscriptionService.js`.
Applied in both `transcribe()` and `transcribeFile()` return paths.
Known hallucinations: ご視聴ありがとうございました, チャンネル登録よろしくお願いします, ありがとうございました, お疲れ様でした, Thank you for watching, Please subscribe, Like and subscribe.

## Settings — Teacher Track Checkbox
Added to Microphone section in index.html:
- Checkbox: "Record teacher track (loopback)"
- Saves to `Storage.set('recordTeacherTrack', this.checked)`
- AudioService.js needs to be wired to read this setting (not yet done — noted)

## CSS — ln-drill-card classes
```css
.ln-drill-card-area { display: flex; justify-content: center; margin: 20px 0; }
.ln-drill-card { width: 380px; height: clamp(200px, calc(100vh - 440px), 280px); background: var(--paper-dark); border: 1px solid var(--border); border-radius: 8px; display: flex; align-items: center; justify-content: center; padding: 24px; }
```

## Storage Migration
### Migrated
- gramSentHistory, vocabBookmarks, qrSession, breakdownCache, GRAM_SENT_SESSIONS, YOSHI_KEY, WRITING_ERRORS ✓

### Still on localStorage
- voice profile, voice pause data, video watch time, resources, learned words

## Known Issues
- yoshiInitUI not defined on startup — pre-existing, not blocking
- PDF print line breaks — pre-existing
- Teacher track checkbox in settings not yet wired to AudioService.js

## Token Optimisation — Future Work
1. Voice conversation history — summarise after 10 exchanges
2. Grammar sentence generation — cache by grammar_point+level in SQLite
3. Translation breakdown — cache word lookups in SQLite
4. Lesson mode — pre-load context once at entry

## Design System Gaps
1. Transient flash feedback — needs .btn-flash class
2. 3-state gold toggles — left inline
3. Recording state red — btn-active-red exists but undocumented

## Video Panel — Design Note
Flagged for proper UI integration when redesign decision is made.

## Pending Work
### Dropbox recordings redirect — pending decision
- Move `getLessonsDir()` target in main.js to Dropbox folder
- Migrate `audio_path` in `lesson_sessions` table (absolute paths will break)
- Depends on: Dropbox path, mobile app scope (iOS? read-only or record?)
- Do not touch until Paul confirms details

### Video → Audio pipeline
- Screen record Teams call, extract audio with ffmpeg, send to Whisper
- Already have ffmpeg + transcribeFile() — just needs file picker + ffmpeg extract step
- One-off: ffmpeg -i input.mp4 -vn -c:a libopus output.webm

### Teacher track checkbox wiring
- `Storage.get('recordTeacherTrack')` needs to be read in AudioService.js before loopback setup
- If false, skip BlackHole discovery entirely

### Pitch Accent — unblocked, highest value next feature
- renderPitchCurve() SVG function in core-foundation.js
- Wire into vocab card render (already showing in current layout)
- pitchAPI: window.pitchAPI.lookup(kanji, reading) → pitch string or null

### Lesson Mode Architecture
- Global App.lessonMode = { id, label } state
- Each panel pre-filters by lesson_id when set
- Topbar indicator showing current lesson
- Yoshi panel becomes lesson manager/selector in sidebar

### Grammar Sentences Phase 3, Phone Audio Export — frozen

## SQLite Schema (v9)
Tables: kv_store, frames, transcript_sentences, corpus_entries, corpus_lookups, corpus_productions, srs_items, error_history, lesson_sessions, words, lesson_phrases, pitch_data
pitch_data: 124,137 entries
Access: window.pitchAPI.lookup(kanji, reading)
