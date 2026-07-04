# Session Context — 2026-07-04 (closed out)

Long session, many threads. Git status confirmed clean at end of
session — everything below is pushed to `origin/main` at `5e4222e`
unless marked otherwise.

## Confirmed pushed (seen via terminal output this session)
- `355e5b7..e6e6c2e` — shuchu ruby furigana (real `<ruby>` tags replacing
  the `漢字(かな)` bracket notation), dark cards, larger text on
  intro/reference screens.
- `e6e6c2e..fdd1b8e` — qrPrintPage duplicate-function dedup.
- `fdd1b8e..2e78fe7` — exact `grammar_node_id` lookup for 参考 (fixes
  the fuzzy-label-matching bug that made 参考 silently fail for topics
  like "nai forms"), dark card + larger text carried to 参考 too.
- `2e78fe7..f5e1678` — St. Olaf scraper fix (`indexOf`→`lastIndexOf`,
  stale URL base `ressource-projects`→`grammar-index`) applied to both
  `scrape-grammar.js` and `scrape-grammar-g2.js`; Genki II (ch. 13–23)
  merged into live `grammar_nodes.json` → **107 nodes total** (55 G1 +
  52 G2, excludes `mare` — see below).
- `3c9d3e9..b310f54` — removed 7 dead `data-kana-for="X"` placeholder
  spans (empty containers left over from the OS-IME migration; the 8
  inputs using `_useOsIme=true` never call `kanaToolbar()` so these
  never rendered anything).
- `b310f54..de1946d` — removed 2 more dead placeholders found on a
  wider sweep (`vocabTypeInput`, `ashiatoSearch`).

## Confirmed pushed (later in session, after ground-truth check)
All previously-uncertain items turned out committed already:
- Grammar detail popup contrast fix (`234d436`).
- Writing panel: saved-texts popup, Saved/Clear buttons right-aligned
  (`3c9d3e9`).
- Quick Translate history bumped 5 → 10 (`288d1c0`).
- Title-bar/nav kanji realignment (Write/Listen/See/Talk/Kanji Ref)
  bundled into `29c541c` along with the TTS/STT feature below.

## Focus Sprint optional TTS/STT activities — committed, UNTESTED
Two setup-screen checkboxes ("Add a listening activity" / "Add a
speaking activity"), wired into the sprint-generation prompt
(`listen_tts` type — VoiceVox playback + hidden-until-answered MC;
`speak_stt` type — MediaRecorder → Whisper → same lenient-check path as
`translate_to_jp`). Zero cost when unchecked; TTS is free (local
VoiceVox/Web Speech); STT is one real Whisper API call per recording,
clearly labeled on the checkbox. Pushed in `29c541c`.
**Still never run end-to-end in the app — test this first if picking
Focus Sprint back up.**

## Kana-selector full removal — COMPLETE
User's explicit call: drop the app's own JS romaji→kana converter
everywhere, rely entirely on macOS's native IME (fn-key toggle) instead
— "not worth the hassle of engineering... i can do it all from mac os."
Then, once the last live dependency surfaced: "vehicle game should have
been deleted months ago" — deleted that too.

**All done, pushed at `5e4222e`:**
- Removed every live `kanaOn`/`kanaOff`/`kanaAddToggle`/`kanaSetMode`
  call site across the whole codebase (mapping turned up 8 real sites
  across 8 files, well beyond the 5 first suspected):
  - `core-counters.js`: `countAnswer2`, `daysDrillInput`, `conjInput`
  - `core-writing.js`: inline sentence-board edit input
  - `features-grammar.js`: `conjInputG` (live), **and** the `conjInput`
    reference inside `gram2Switch` — turned out real, not dead:
    `core-counters.js`'s legacy `renderConjDrill()` still creates an
    element with that id, so switching grammar2's conj tab was
    re-toggling kana mode on a *different panel's* field.
  - `features-lesson-notes.js`: `lnGrammarDrillInput` (2 spots)
  - `features-stroke.js`: `strokeSearchInput`
  - `core-stt.js`: deleted `setTransMode()` and **both** definitions of
    `toggleTransKana()` (duplicate-function bug, same pattern as the
    `qrPrintPage` dupe from earlier sessions) — confirmed 100% dead
    first via zero references anywhere in `index.html`.
  - `core-vocab.js`: `vocabTypeInput` (2 sites, genuinely live)
- Deleted the entire dead **Pictures/Vehicle naming game**
  (`features-pictures.js`, ~370 lines) — zero panel markup anywhere in
  `index.html`, confirmed fully orphaned before removal. Also removed
  its `<script>` tag.
- Rewrote `features-kana.js` from ~730 → 346 lines: deleted
  `ROMAJI_MAP`, `romajiToHiragana`, `romajiToKatakana`,
  `hiraganaToKatakana`, `vgSetupInput` (that game's only other
  dependency), `kanaInputHandler`, `_kanaSyncCursor`, `kanaOn`,
  `kanaOff`, `kanaToggle`, `kanaAddToggle`, `kanaSetMode`,
  `kanaToolbar`, all 7 mode-setter shims, and `_initKanaToolbars`'s
  id-list logic. **Kept**: `kanjiPickerShow`, `kajiPickerClose`,
  `_kanaToKanjiLocal`, `kanaToKanji`, `_kanjiSessionCache` — the
  漢字-conversion button, a separate feature untouched by any of this.
- `check-syntax.js` clean (39 files, 0 errors) both after the call-site
  removal and after the final engine deletion.

**Not yet done — final smoke test** (should take 2 minutes, do this
first next session): restart the app, confirm 漢字 button still works
somewhere (stroke search or translate panel), confirm typing in Quick
Translate/Writing/Counters/Conjugation Drill/Grammar Notes/Lesson
Notes/Stroke Search all behave normally with fn-key IME switching.

Low-priority loose end, not touched: `_transKanjiKeyHandler` in
`core-stt.js` is orphaned (nothing attaches it as a listener) — was
already dead before this cleanup, not caused by it. Leave alone unless
asked; it's kanji-conversion-adjacent, not kana-selector code.

## Dropped — no longer pursuing
**Quick Translate hiragana/romaji-mix detection.** Discussed at length
(root cause confirmed: `globalQTInput`'s `_useOsIme=true` means the app
never sees the IME's conversion, only the committed string; a fix was
sketched — reverse-kana table + wordlist check + suggestion-chip UI —
but flagged a real correctness risk from Kotoeri's l/r merging). User
explicitly killed this item. Nothing was ever built, nothing to revert.

## Still open from before this session
- `mare` (〜まれ, passive of birth) grammar node — dropped from the G2
  merge, source page mismatch (St. Olaf's own site serves ～まで content
  under the まれ link — not our scraper's bug). Not rewritten by hand.
- `node_id` column on `lesson_phrases` — long-standing blocker, still
  prevents the grammar detail panel from showing source sentences.

## On the horizon (priority order for next session)
1. Final smoke test for the kana-selector removal (2 min, see above).
2. Test the Focus Sprint TTS/STT feature end-to-end (never verified).
3. `mare` — decide whether to hand-write correct content or leave gone.
4. `node_id` column on `lesson_phrases` — whenever it's next relevant.
