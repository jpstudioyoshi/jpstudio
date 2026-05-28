# Using Claude Code Cheaply — Inline Style Migration

## The Job
Migrate 451 inline style.color/style.borderColor manipulations in JS files
to classList.add/remove using the CSS classes already defined in style.css.

## Golden Rules for Cheap Sessions
1. Always start with: "Read context-static.md and context-session.md only."
2. One file at a time — never let it roam freely
3. Ask for a diff before any changes
4. Say "go ahead" only after checking the diff
5. Commit after each file — stops runaway sessions
6. If it starts reading files you didnt ask for, say "stop, stay focused on X only"

## Session 1 — core-stt.js

Launch: jp && claude

First message:
Read context-static.md and context-session.md only. Do not read any other files yet. Confirm when done.

Second message:
In src/core-stt.js there are inline style.color and style.borderColor
manipulations that should use CSS classes instead. The classes are already
defined in style.css: btn-active, btn-active-gold, btn-active-red,
btn-toggle.toggle-on, btn-group.btn-active.
Read src/core-stt.js only. Find all style.color and style.borderColor
manipulations. Show me a list of each one and what CSS class should
replace it. Do not make any changes yet.

After reviewing list say: Go ahead and make those changes. Show me a unified diff first.

After diff looks good say: Apply the changes.

After changes — in terminal:
jp && node check-syntax.js && git add -A && git commit -m "refactor: core-stt.js inline style to CSS classes" && git push

## Session 2 — core-listen.js
Same flow as Session 1, replace core-stt.js with core-listen.js.

## Session 3 — core-vocab.js
Same flow. Add this to your second message:
"It is a large file. Focus only on style.color and style.borderColor manipulations."

## Session 4 — features-reading.js
Same flow as Session 1.

## Session 5 — features-voice.js
Same flow as Session 1.

## Session 6 — Video panel (index.html lines 2187-2465)
Second message:
Read context-static.md only. The video panel in index.html (lines 2187-2465)
uses inline styles for its controls instead of the design system button classes.
Migrate the button elements only to use btn-* classes per the button system
in context-static.md. Do not touch any JS files. Show diff first.

## Session 7 — index.html cleanup

Part A: Settings tab bar
Read context-static.md and context-session.md only. Then read
index.html lines 91-105. The Settings tab buttons use inline
border-bottom styles to show active state instead of CSS classes.
Create a CSS class in style.css for the settings tab active state,
then replace the inline styles on lines 96-99 with that class.
Show diff before making any changes.

Part B: Video panel buttons (after Part A committed)
Read context-static.md only. The video panel in index.html
(lines 2187-2465) uses inline styles for its controls instead
of the design system. Migrate button elements to btn-* classes only.
Do not touch JS files. Do not redesign layout. Show diff first.

Part C: Remaining scattered inline styles (after Part B committed)
Read context-static.md only. Grep index.html for remaining
inline style= attributes on button elements only. List them.
For each one that should use a btn-* class, show the replacement.
Ignore inline styles on divs, spans, inputs. Buttons only.
Show the full list before making any changes.

## Cost Control Tips
- Each session should cost $0.50-1.50 if focused
- If token counter climbs fast — you left it reading too many files
- Ctrl+C stops a runaway session — nothing is changed until it writes files
- Always commit after each session so you have a rollback point
- If a session hits $2 without finishing — stop, come back fresh

## Verify After Each Session
jp && grep -n "style\.color\|style\.borderColor" src/FILENAME.js | wc -l
Should be lower than before. Zero is the goal but some are legitimately
JS-controlled (waveform colours, dynamic feedback) and can stay.

## Final Check After All 7 Sessions
jp && grep -rn "btn-ghost\|btn-danger\|btn-kana" index.html src/*.js
Should return nothing.

jp && grep -rn "style\.color\|style\.borderColor" src/*.js | wc -l
Target: under 20 (legitimate dynamic cases only).
