# Session Context — 2026-07-05

**Status: session interrupted mid-work by an app crash. Git state NOT
verified — run `git status` and `git log --oneline -10` first thing next
session before touching anything.**

## 🔴 Unresolved — app wouldn't open, Mac was restarted

**Symptom:** after a `main.js` edit (see below), first launch produced a
dead/unresponsive window. Closed it; relaunch attempts then produced
nothing — no window, terminal became unresponsive. Mac was restarted to
clear state. Not yet confirmed whether the app opens cleanly post-restart.

**Leading hypothesis:** stuck Electron process holding the single-instance
lock — this exact failure mode is already documented in `main.js`'s own
top-of-file comment from a past session ("launching while another instance
is running spawns a second, competing instance... stuck native file
dialogs"). A syntax error in the new `main.js` code is a secondary
possibility but less likely — reviewed the diff again this session, brace
structure looks clean.

**First 3 commands next session, in order — do not skip ahead:**
```bash
ps aux | grep -i "jpStudio\|Electron" | grep -v grep
node -c /Users/paulandres/Documents/jpStudio/main.js
jp && npm start
```

**If it still won't open after a clean restart + clean syntax check:**
revert the `will-download` block added to `main.js` (see below) to isolate
it as the cause.

---

## Completed this session

### Focus Sprint (集中) — bug fixes
- **`features-shuchu.js`** — truncation bug: `shuchuStart()` call 1
  `max_tokens` 1900 → conditional 3000 when TTS/STT included;
  `shuchuFetchRemainder()` call 2 `max_tokens` 5000 → 7000. Root cause:
  JSON responses were being cut off mid-string (`Unterminated string`
  errors on sprint creation).
- **`features-shuchu.js`** — scoring bug: `translate_to_jp`/`error_correct`/
  `speak_stt` answers were pushed to `_wrong` unconditionally before
  grading ran, deflating the score regardless of actual correctness. Now
  only pushed if the model marks it wrong.
- **`index.html`** — Focus Sprint checkbox labels simplified (dropped
  cost/token text): "Add a listening activity (free)" → "Listening
  activity", same for speaking.
- **`index.html` + `features-shuchu.js`** — furigana toggle added
  (`#shuchuFuriToggle`, default OFF), pure CSS via `.shuchu-hide-furi`
  class — no re-render needed on toggle.
- **`index.html`** — scoped `--ink-light` override inside `#shuchu-sprint`
  only (`#c0c0c5` → `#d8d8dc`) for contrast, global variable untouched.

### Startup console error cleanup
- **`index.html`** — removed orphaned `<script src="features-kana.js">` tag
  (file was deleted in a prior cleanup session, tag survived) → fixed
  `ERR_FILE_NOT_FOUND`.
- **`features-core.js`** — removed dead `toggleResourcesSettings` reference
  in the `Object.assign(App, {...})` registry call. This was throwing
  `ReferenceError` inside the file's registry `try` block, meaning **the
  entire App registry for this file (TTS, DrillFlow, counter-drill
  helpers) was silently failing to register** the whole time — real fix,
  not cosmetic.
- **`features-grammar.js`** — same pattern: removed dead `pdSelectLeft`/
  `pdSelectRight`/`pdTryMatch` (orphaned matching-pairs feature, itself
  already deleted per `features-tools.js`) — same silent registry failure
  for `gramSentCreate`, `checkConjG`, etc.

### Furigana exclusion list — new feature (built in 2 passes)
- **`core-foundation.js`** — `FURIGANA_EXCLUDE` (exact-match `Set`) +
  `FURIGANA_EXCLUDE_STEMS` (prefix-match `Set`, added in pass 2 to cover
  conjugated verb/adjective forms) + `furiganaIsExcluded(word)` (single
  source of truth, checks both) + `furiganaStripExcluded(html)` (for
  panels that get raw ruby HTML back from Claude instead of building it
  client-side).
- Persisted via `Storage` (key `furiganaExcludeList`, format
  `[{word, stem}, ...]`), loaded on `storageReady`. Backward-compatible
  with the pass-1 flat-string-array format.
- **Settings UI** (`index.html`) — new "Furigana Exclusions" section:
  text input + "conjugations" checkbox (default **unchecked**, user's
  explicit call) + "+ Add" + table with ✕ delete and a "+conjugations"
  badge on stem entries.
- **Wired into all 4 reading surfaces:**
  - `features-shuchu.js` `furiToRuby()` (Focus Sprint)
  - `features-reading.js` `qrRender()` + `qrPrintPage()` (Quick Read)
  - `features-lesson-notes.js` `lessonNotesRenderStoryText()` +
    `lnRenderSentenceFurigana()` (Yoshi read view)
  - `features-video.js` `vtFuriLine()` + `epubGetFurigana()` (Video/Epub
    — via `furiganaStripExcluded()`, these get raw HTML from Claude)
- Seeded with `私` (exact match, no stem).
- Known architecture note (flagged to user, not fixed): furigana
  generation itself is 4 separate implementations across these panels —
  2 build ruby client-side from word+reading JSON, 2 get full ruby HTML
  back from Claude directly. The exclusion list bridges this via a shared
  check rather than unifying the underlying generation — unifying was
  explicitly out of scope for this request.

### Download save-dialog fix — ⚠️ this is what preceded the crash
- **`main.js`** — added `dialog` to the electron import; added
  `session.on('will-download', ...)` in `createMainWindow()` so every
  download (Quick Read TTS audio via `qrDownloadTTS`, combined
  recordings via `qrDownloadCombined`) prompts with a native Save dialog.
  Previously these used a bare `<a download>` link with **no**
  `will-download` handler registered anywhere, so Electron saved silently
  to `~/Downloads` — inconsistent with the PDF export path
  (`print:htmlToPDF`/`print:toPDF`), which already used
  `dialog.showSaveDialog` and prompted correctly.
- Implementation: `dialog.showSaveDialogSync(mainWindow, {...})` inside the
  `will-download` handler, `item.setSavePath(chosen)` on confirm,
  `item.cancel()` if the user dismisses the dialog.
- **This is a main-process change — requires a full app restart (not a
  page reload) to take effect.** This is the change in flight when the
  app died. **Not yet confirmed working post-restart.**

---

## Commits made this session (order, needs re-verification)
1. `ae8dac0` — shuchu scoring bug, furigana toggle, contrast
2. `899ee7b` / `0857319` — Furigana Exclusions settings UI (double-commit,
   harmless — second `check-syntax.js` run re-touched `index.html`'s
   cache-buster)
3. Likely uncommitted — stem/conjugation matching for furigana exclusions
   (pass 2)
4. Likely uncommitted — startup console error cleanup (`features-kana.js`
   tag, `toggleResourcesSettings`, `pdSelect*`)
5. Uncommitted, do not commit until confirmed working — the `main.js`
   `will-download` change

**Run `git status` + `git log --oneline -10` first thing next session.**

---

## Pending next steps (priority order)
1. Confirm app opens cleanly post-restart (see commands above)
2. If clean: `git status` to see what's actually dirty vs. committed,
   commit remaining work in logical chunks
3. If `main.js` change is confirmed the cause: revert just that block,
   re-test, then re-add more carefully (possibly test `will-download` in
   isolation before wiring back in)
4. Once stable: test Focus Sprint end-to-end with TTS/STT checkboxes
   (truncation fix from this session, never run live)
5. Test furigana exclusion list live — add `食` with "conjugations"
   checked, confirm 食べる/食べた/食べます skip furigana in Quick Read +
   Yoshi read view (previously only worked in Focus Sprint/Video by
   accident of per-kanji tagging)
6. Test download save-dialog — click "⬇ Audio" in Quick Read, confirm
   native Save dialog appears defaulting to `~/Downloads/tts-YYYY-MM-DD.wav`

## Unrelated pending items (carried from earlier sessions, untouched)
- `mare` grammar node manual entry
- `node_id` column on `lesson_phrases` (architectural debt, deferred)
- 38-node N5_GRAPH vs 107-node GrammarModel discrepancy (deferred)
