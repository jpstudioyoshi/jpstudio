# Japanese Studio — Session Context
Last updated: 2026-05-23 (session 2)

## User Preferences
- Paul is learning development workflows as we go — suggest improvements to workflow, terminal usage, or API cost savings where appropriate, but keep suggestions concise and actionable.
- Management window is deprioritised — was too buggy and expensive to debug via Claude. Terminal approach is preferred for all edits.

## Current Mode
STABILIZATION — not feature expansion.
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
- `jp` — jump to project (always required first)
- `grep -n "pattern" src/file.js` — locate lines
- `sed -n 'X,Yp' src/file.js | pbcopy` — read a block, pipe to clipboard, paste here
- Edits: write a `/tmp/fix-xxx.js` node script using `fs.readFileSync/writeFileSync` with exact string matching, run with `node /tmp/fix-xxx.js`
- Always run `node check-syntax.js` after every edit
- Bump version after every index.html or JS change: `sed -i '' 's/?v=CURRENT/?v=NEW/g' index.html`
- Restart app: `jpstart`
- Hard reload after restart: Cmd+Shift+R in app window

**Git workflow (initialised 2026-05-23, commit 840b90e):**
- Before every dev session: `git add -A && git commit -m "before session YYYY-MM-DD"`
- Emergency rollback: `git checkout -- .`
- Pre-commit hook installed: runs `check-syntax.js` automatically, blocks commit on error
- `.gitignore` covers `node_modules/`
- Files to consider adding to .gitignore: `.DS_Store`, `*.bak`, `management-log.json`, `index.json`, `audit-*.md`

**Critical lessons learned:**
- When using `node -e "..."` in zsh, `!` causes "event not found". Use `/tmp/fix-xxx.js` files instead.
- `\n` in backtick strings inside `node -e` is NOT interpreted as newline. Use file-based scripts.
- After patching, verify with `JSON.stringify(src.slice(idx, idx+120))` to see exact bytes including whitespace.
- IIFE pattern: `window['X'] = X` must be OUTSIDE the IIFE, after `const X = (() => { ... return {...}; })();`
- Cache busting: bump `?v=` string in index.html after every change, then Cmd+Shift+R.
- Always `cd ~/Documents/jpStudio` before any command — terminal does not persist directory.
- Use `| pbcopy` to copy output to clipboard instead of flipping terminal windows.
- When `NOT FOUND` in patch script — check exact whitespace with `JSON.stringify`. Extra blank lines are common culprit.
- Slice-based patching (`src.slice(0,start) + neu + src.slice(end)`) is more reliable than string matching for large blocks.

## Stabilization Status
All immediate stabilization tasks complete. DrillCard migration in progress.

### Completed (2026-05-23 session 2)
- `features-kana.js` — double-click on A/ひ/カ toolbar buttons saves that mode as default for that input location via `kvAPI` (`kana_default:{inputId}`). Loaded async on `kanaToolbar()` init.
- `features-yoshi.js` — Lesson Notes grammar drill JSON shape normalised: `{english,japanese}` → `{en,jp}` matching grammar panel. Prerequisite for shared renderer.
- `features-yoshi.js` — `[LN]` logging added to all 4 silent extraction functions: vocab, stories, key phrases, grammar. Filter console by `[LN]` during Lesson Notes analysis to see counts and samples.
- `features-grammar.js` — conjugation drill `_conjTrackingPaused` flag. "pause tracking" checkbox in stats bar suppresses SRS, GrammarErrors, grammarEvidence, drillLastCompletedWrite when checked. Resets on new session.
- `src/ui/TextEntry.js` — was missing from index.html load order. Added before YoshiUI.js. Fixes missing input in Yoshi grammar drill.
- `features-grammar.js` — `ConjSession` removed from App registry (referenced before its `const` declaration, causing registry failure).
- `features-kana.js` — `shuffle` removed from App registry and window exports (defined in features-times.js which loads later).
- `index.html` — `features-corpus-seed.js` removed from load order (file does not exist).
- `src/ui/DrillCard.js` — created, added to index.html before TextEntry.js. Shared drill loop: config-driven with getQueue, getPrompt, getAnswer, onCorrect, onWrong, onComplete, runsPerSession, trackingLabel, inputPlaceholder.
- `core-counters.js` — `daysOfMonthDrill` migrated to DrillCard. `daysNext/daysCheck` replaced with no-ops.

### Completed (2026-05-23 session 1)
- API call logging, double-transcription guard, Whisper logging, Four Strands coverage
- Conjugation drill kanji stem pre-fill, API key status fix
- renderAdjMastery implemented and wired

### Completed (2026-05-18 and 2026-05-17)
- See previous context for full list

## Pending Work (priority order)

### Short-term
- **Listening → Four Strands** — ALREADY WIRED at core-listen.js line ~496. No action needed.
- **DrillCard → counters migration** — add `srsKey` config option + session save/resume to DrillCard first, then migrate counters.
- **ADJ_I / ADJ_NA word list** — only 8 i-adj / 6 na-adj. Deferred.

### DrillCard migration roadmap
1. ✅ Dates — done
2. Counters — needs srsKey + session save in DrillCard first
3. Times — needs text input replacing multiple-choice first
4. Conjugation — complex state, last
5. Grammar sentences — complex state, last

### Medium-term cleanup
- App registry cleanup — redundant window[] in core-anki, core-counters, core-kana, features-kana, features-times, features-video, features-voice-drill, services/*
- Storage rationalisation — localStorage / Storage / kvAPI coexist
- Yoshi → app data flow — extracted vocab/grammar not fed back into vocab drill or GrammarModel
- lnCreateFromPaste — logged but not apiUsageTrack'd

### Future features (frozen)
- DrillRecord unified history, TextEntry migration, AudioStrip, Phone PWA
- Voice drill → DB, SRS for custom drill, Progress charts
- overlay:transcribe IPC, BlackHole pre-session check, Management serial success check

### Dedicated tasks (next session start)
- **STYLE_GUIDE.md** — scan style.css for all variables and class names, document full design system: colors, typography, buttons, inputs, cards, feedback patterns, progress indicators, layout patterns, component inventory. Living document — all new UI references it before writing CSS or inline styles. Build semi-automatically then annotate.

### Housekeeping
- src/features.js — delete if still present (19,035 lines, confirmed dead)
- features-pictures.js vg* dead code — safe to remove functions
- window[] export cleanup — ongoing

## Console Filter Reference
- `[LN]` — Lesson Notes extractions (vocab, stories, key phrases, grammar — fire on analysis trigger)
- `[API]` — all Claude API calls
- `[STT]` — Whisper transcription
- `[AppEvents]` — recording pipeline events

## Yoshi Pipeline Summary
Two separate systems:
- **Recording pipeline** (teal): User → Orchestrator → AudioService → AppEvents → YoshiUI. Clean event-driven, traceable via [AppEvents].
- **Lesson Notes** (coral): Paste/import → features-yoshi.js → Claude API calls (4 silent extractions) → lessonNotesRender() directly. No events. Traceable via [LN] logs.

## Next Recommended Action
1. Self-study session with app
2. Next lesson: Lesson Notes analysis → filter [LN] → bring back 4 log lines
3. Next dev session: add srsKey + session save to DrillCard → migrate counters
