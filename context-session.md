# Japanese Studio — Session Context
Last updated: 2026-05-29 (session 13 — bug fixes, button system unified, html-map created)

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
UI DESIGN — button system complete, vocab panel redesign outstanding.

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

**Design system gaps (leave inline):** transient flash, 3-state gold toggles, recording red

## Inline Style Migration — COMPLETE
All JS files migrated. Remaining inline: transient flashes, 3-state gold, recording gradients, layout/margin one-offs.
Video panel deferred until redesign decision.

## Vocab Panel Redesign — IN PROGRESS
**Done:**
- Section title → `語彙 [Words ▾]` dropdown, remembers last subtab via localStorage
- `wordsSubFromSelect()` and `wordsSwitchSubRestore()` in core-foundation.js
- Called on `showPanel('words')`
- Filters moved from top to footer
- Add Words By Category section removed
- Footer structure: upper (controls) + lower (filters) fixed to bottom
- Level filter changed to radio: N5 / N4 / N3 — JS expands to correct set
- Size changed to radio: 20 / All

**Outstanding:**
- Card content vertically centred (currently sits too high in card)
- Card flip animation broken — do NOT add display:flex to vocab-card-inner (breaks 3D flip)
- vocab-front/back need position:absolute + width/height:100% to fill card properly
- Scroll issue resolved (overflow:hidden on panel)
- style.css version currently: ?v=20260528c

## Storage Migration
### Migrated
- gramSentHistory, vocabBookmarks, qrSession, breakdownCache, GRAM_SENT_SESSIONS, YOSHI_KEY, WRITING_ERRORS ✓

### Still on localStorage
- voice profile, voice pause data, video watch time, resources, learned words

## Known Issues
- yoshiInitUI not defined on startup — pre-existing, not blocking
- PDF print line breaks — pre-existing

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
