# Japanese Studio — Session Context
Last updated: 2026-06-25 (session 51 — major feature and bug fix session)

## User Preferences
- Minimal edits over redesigns
- One command at a time; paste output, get next step
- Hypothesis-first debugging; stop when not converging
- Read files before theorising
- Commit per logical unit; `node check-syntax.js` before every commit

---

## Current State

### Architecture
- Electron app, macOS, `~/Documents/jpStudio` (alias `jp`)
- Vanilla JS, sql.js (WebAssembly SQLite), persisted to `~/Library/Application Support/japanese-studio/jpstudio.db`
- MCP filesystem connected to `/Users/paulandres/Documents/jpStudio/`
- GitHub: `github.com/jpstudioyoshi/jpstudio` (private)

### DB
- `panel_sessions` — session time per panel, used by StudentModel for strand balance
- `video2` panel now correctly mapped to strand 1 in both `_STRAND_MAP` (core-foundation.js) and `StudentModel.collectStrandBalance` — was silently dropped before this session

---

## Work Completed This Session

### Video strand tracking fixed
- `showPanel('video')` was being called from `features-progress.js` recency tiles but panel id is `panel-video2` → crash, no session recorded
- Fixed: `panel: 'video2'` in strand items array in `features-progress.js`
- `StudentModel.js` `PANEL_TO_WEIGHT` and `FALLBACK_STRAND` both lacked `video2` key → all video time silently dropped
- Fixed: added `video2: 'video'` and `video2: 1` to both maps
- `vtWatchStop` now calls `drillLastCompletedWrite('video', ...)` when cumulative minutes ≥ 2, so tile updates on pause not just at 80% completion

### TTS — persistent AudioContext
- Was: `new AudioContext()` created and closed on every sentence → boot delay per sentence, `InvalidStateError: Cannot close a closed AudioContext` spam
- Fixed: `TTS._audioCtx` persistent context, reused across sentences, created lazily via `_getAudioCtx()`
- `pause()` no longer calls `audioCtx.close()` — context stays warm

### Reading panel — sentence listening overhaul
- `qrListenPrev` / `qrListenNext` were calling `speechSynthesis.cancel()` directly — bypasses TTS, broken with VoiceVox
- Fixed: both now call `(App.TTS || window.TTS)?.stop()`
- `qrListenPlay` fixed to use `TTS` not `speechSynthesis` directly
- Arrow key navigation added: `→` next+speak, `←` prev+speak, `↓` repeat, `↑` return to sentence 1
- Guard changed from `listenModeOpen` (was always false) to `sentences.length > 0`

### Reading panel — TTS kanji misreading fix
- VoiceVox was misreading 他 as たなか (surname) etc.
- Fix: `qrToggleListenMode` now builds two parallel arrays:
  - `QuickReadState.sentences` — hiragana readings for TTS (accurate pronunciation)
  - `QuickReadState.sentencesKanji` — raw kanji words for DOM highlighting (matches `seg.word`)
- `qrHighlightSentence` uses `sentencesKanji` for the DOM search

### Grammar sentence drill (gramSent) improvements
- **Generation prompt** (`_gramSentGenerateOne`): grammar must be "main structural feature — not incidental"; 8–14 word cap; avoid 私は unless natural; hint must name specific form
- **Check/feedback** (`gramSentCheck`): structured JSON with `error` (typed category) and `diagnosis` (one phrase); `max_tokens` 200→300; 2-column table feedback (your answer vs correct)
- **Stats bar removed**: "Correct: N Wrong: N Left: N" line deleted
- **Dots**: always show all 5 (`GRAM_SENT_TOTAL`) positions upfront; `pending` class for future; `== null` guard for undefined results
- **Theme field removed**: from `index.html` and both `gramSentTheme` DOM reads replaced with `''`
- **Card frame removed**: `gd-card` gets `border:none;background:none;padding:10px 0`
- **Kana toolbar layout**: moved directly below input, separate button row below
- **Create button**: moved into Level/Sentences settings row with `margin-left:auto`
- **Repeat sentence guard**: `gramSentLastSnap` persists current sentences to storage before reset so restart avoid-list works even before session is saved
- **Q&A field**: label "ASK ABOUT THIS SENTENCE", concrete placeholder; answers now append (not replace); Q&A clears on sentence advance; prompt tightened to 1-2 sentences max, `max_tokens` 120, no markdown
- **Right column scroll**: `gramSentFeedbackCol` gets `overflow-y:auto;max-height:80vh`
- **Q&A font**: `gramSentQuestionResult` now `font-size:inherit` (was `0.82rem`)
- **Evaluation loading state**: replaces opacity flash with `🔍 Evaluating your sentence…` text
- **Follow-up field relabelled**: "ASK ABOUT THIS SENTENCE" with border-top separator

### Writing panel
- Evaluation now shows clear `🔍 Evaluating your sentence…` in feedback area while waiting
- Follow-up question field: added `ASK ABOUT THIS SENTENCE` label, concrete placeholder examples

### Counter drill
- 5 new counter classes added to `src/data/counter_data.json` and `countRenderRefGrid2()` in `core-counters.js`:
  - 階 (kai, floors/storeys)
  - 頭 (tou, large animals)
  - 羽 (wa, birds & rabbits)
  - 足 (soku, pairs of footwear)
  - 着 (chaku, clothing items)
- `CounterDrillState.activeCounters` default updated to include all 14
- Checkbox row split into two rows of 7 (`Math.ceil(14/2)`)

### Kana selector
- `_lastCursorPos` now tracked on every `click` and `keyup` on the input
- `kanaSetMode` uses `_lastCursorPos ?? selectionStart` for `_kataFrom` anchor
- `_kanaSyncCursor` also uses `_lastCursorPos`
- **Known remaining bug**: mid-sentence katakana conversion still unreliable; deferred pending DevTools investigation with per-keystroke button-state-reading approach identified as correct architecture

### StudentModel / progress
- `video2` panel correctly attributed to strand 1 in both `PANEL_TO_WEIGHT` and `FALLBACK_STRAND`
- `features-progress.js` recency tile `panel: 'video'` → `panel: 'video2'`

### Video grammar-node linking design doc
- Written and saved as `video-grammar-node-linking.md` in project knowledge
- Key design: exclusion list (は, が, を, ます/です excluded), specificity tiers, structural centrality heuristic, video evidence capped at "partial" score, 4 implementation stages

---

## Known Open Issues

### Kana selector mid-sentence katakana
- Switching to カ then clicking into middle of existing text, or clicking into field first then switching: `_kataFrom` anchor unreliable
- Architecture identified: read active button per keystroke, no zone anchor
- Needs DevTools inspection to validate before implementation
- **Do not attempt without DevTools confirmation**

### `InvalidStateError: Cannot close a closed AudioContext` (features-core.js:363)
- Resolved for the VoiceVox TTS path (persistent AudioContext)
- May still appear from `qrCombineSegments` or `qrDrawWaveform` which create their own AudioContexts — these are short-lived and close correctly, so likely no longer an issue

### Electron renderer crashes
- Two occurrences this week: whole nav bar dead on fresh load, required Mac restart
- Suspected GPU process crash or memory pressure
- `render-process-gone` event handler not yet added to `main.js`
- Recommended: add crash logging to `main.js`

---

## File Locations — Changed This Session

| File | What changed |
|------|-------------|
| `src/features-grammar.js` | gramSent: prompt, feedback table, dots, Q&A, theme removal, create button |
| `src/features-reading.js` | Arrow keys, TTS fix, parallel sentence arrays, qrListenPlay/Prev/Next |
| `src/features-core.js` | Persistent AudioContext, `_getAudioCtx()` |
| `src/features-video.js` | `vtWatchStop` → `drillLastCompletedWrite` on pause |
| `src/features-progress.js` | `panel: 'video2'` in strand tile |
| `src/StudentModel.js` | `video2` added to `PANEL_TO_WEIGHT` and `FALLBACK_STRAND` |
| `src/core-counters.js` | 5 new counters, two-row checkbox layout, activeCounters default |
| `src/data/counter_data.json` | 5 new counter entries (階 頭 羽 足 着) |
| `src/core-writing.js` | Evaluation loading state, follow-up field label |
| `src/features-kana.js` | `_lastCursorPos` tracking |
| `index.html` | Theme field removed, Create button moved, gramSentFeedbackCol scroll, Q&A font |

---

## Next Session Priorities

### Immediate
1. Add `render-process-gone` crash handler to `main.js`
2. Kana selector DevTools inspection — validate per-keystroke architecture before coding

### Medium-term
3. Video grammar-node linking — Stage 1 (pure regex tagging, no API, no UI)
4. Four Strands coverage gaps: fluency row sparsest, no decay on grammar mastery
5. NoM multi-session aggregation (two-tier sprint suggestions)

### Future
6. `gramSentLastSnap` cleanup strategy (currently grows unbounded per target)
7. Reading panel: `listenModeOpen` flag not being set correctly — currently guarded by `sentences.length` workaround; should fix the toggle

---

## Commit Log This Session (approximate)
- `fix(StudentModel): map video2 panel to strand 1 in collectStrandBalance`
- `fix(video): mark strand chart on pause after ≥2min cumulative watch time`
- `fix(gramSent): null-check dots for undefined results beyond current sentence`
- `fix(gramSent): remove stats bar, expand dots to full 5 with pending state`
- `fix(gramSent): use _lastCursorPos for _kataFrom — survives focus loss to mode button`
- `fix(kana): anchor always tracks cursor position on move and mode switch` (reverted)
- `feat(counters): add 5 new counter classes — 階 頭 羽 足 着`
- `fix(counters): split checkbox row into two equal rows`
- `fix(gramSent): guard against repeated sentences on restart via lastSnap`
- `fix(writing): clear loading state for evaluation; relabel follow-up field`
- `fix(reading/tts): persistent AudioContext, fix prev/next tracking, fix AudioContext close error`
- `feat(reading): arrow key navigation in listen mode`
- `fix(reading): use segment readings for TTS to prevent kanji misreading`
- `fix(reading): parallel tts/kanji sentence arrays — fix highlighting after TTS reading fix`
- `fix(gramSent): tighten Q&A prompt, fix missing try/catch closure`
- `session: reading TTS fixes, gramSent UX, video strand tracking, counter drill, arrow key nav`
