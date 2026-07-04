# Session Context — 2026-07-04

Long session, many threads. **Git status is uncertain in places — run
`git status` and `git log --oneline -15` first thing next session**
before trusting any of the "committed" claims below; several items
were given commit commands but never confirmed run in this transcript.

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

## NOT confirmed committed — verify before trusting
The following were implemented and given commit commands, but no push
output for them appears in this transcript. Could be committed under a
hash not shown, or could still be sitting uncommitted:
- Grammar detail popup contrast fix (`features-progress.js` —
  `statusCol === 'var(--paper-dark)'` should've been `'var(--paper)'`,
  causing black-on-dark unreadable titles for untouched nodes).
- Writing panel: saved-texts moved into a toggleable popup
  (`index.html` + `core-writing.js`, new `toggleSavedTextsPopup()`),
  Saved/Clear buttons pushed to right edge of button row.
- Quick Translate history bumped 5 → 10 items (`core-foundation.js`).
- Title-bar kanji realigned to match nav buttons: Write 作文→書く,
  Listen 聴解→聞く, See 動画→見る, Talk 会話→話す; Kanji Reference
  sidebar button 筆順→文字 (title bar was already correct).

**Run `git status` — if these show as uncommitted diffs, commit them
before doing anything else.**

## NOT verified working, NOT committed — test first
- **Focus Sprint optional TTS/STT activities.** Two setup-screen
  checkboxes ("Add a listening activity" / "Add a speaking activity"),
  wired into the sprint-generation prompt (`listen_tts` type — VoiceVox
  playback + hidden-until-answered MC; `speak_stt` type — MediaRecorder
  → Whisper → same lenient-check path as `translate_to_jp`). Zero cost
  when unchecked; TTS is free (local VoiceVox/Web Speech); STT is one
  real Whisper API call per recording, clearly labeled on the checkbox.
  **`node check-syntax.js` was never run after this edit. Untested
  end-to-end. Do this first if picking Focus Sprint back up.**

## Kana-selector full removal — IN PROGRESS, not finished
User's explicit call: drop the app's own JS romaji→kana converter
everywhere, rely entirely on macOS's native IME (fn-key toggle) instead
— "not worth the hassle of engineering... i can do it all from mac os."

**Done:**
- Mapped every live `kanaOn`/`kanaOff`/`kanaAddToggle`/`kanaSetMode`
  call site across the whole codebase (not just the 5 files first
  suspected — a broader grep turned up 3 more real sites).
- Removed all of them:
  - `core-counters.js`: `countAnswer2`, `daysDrillInput`, `conjInput`
    (legacy conjugation drill)
  - `core-writing.js`: inline sentence-board edit input
  - `features-grammar.js`: `conjInputG` (live), **and** the `conjInput`
    reference inside `gram2Switch` — this one turned out to be real,
    not dead: `core-counters.js`'s legacy `renderConjDrill()` still
    creates an element with that id, so switching grammar2's conj tab
    was re-toggling kana mode on a *different panel's* field. Removed.
  - `features-lesson-notes.js`: `lnGrammarDrillInput` (2 render points)
  - `features-stroke.js`: `strokeSearchInput`
  - `core-stt.js`: deleted `setTransMode()` and **both** definitions of
    `toggleTransKana()` (duplicate-function bug, same pattern as the
    `qrPrintPage`/kana-shortcut dupes from earlier sessions) — confirmed
    100% dead first: zero references to the functions or their button
    ids (`transInputRomajiBtn` etc.) anywhere in `index.html`.
  - `core-vocab.js`: `vocabTypeInput` (2 sites, genuinely live —
    vocab typing-drill input)

**Last command given, not yet confirmed run:**
```bash
cd ~/Documents/jpStudio && grep -rn "kanaOn(\|kanaOff(\|kanaAddToggle(\|kanaToggle(\|kanaSetMode(\|kanaToolbar(" src/*.js | grep -v "^src/features-kana.js"
cd ~/Documents/jpStudio && node check-syntax.js
```
Should both come back clean (empty grep, 0 syntax errors). **Run these
first** before touching `features-kana.js`.

**Not started — the actual engine deletion:**
Once the grep above is confirmed empty, delete from `features-kana.js`:
`ROMAJI_MAP`, `romajiToHiragana`, `romajiToKatakana`, `hiraganaToKatakana`,
`kanaInputHandler`, `kanaOn`, `kanaOff`, `kanaToggle`, `kanaAddToggle`,
`kanaSetMode`, `kanaToolbar`, the mode-setter shims (`setGlobalQTMode`,
`setChatInputMode`, `listenTransSetMode`, `setVtDictateMode`,
`setGramSentQMode`, `setWritingMode`), and `_initKanaToolbars`'s id-list
logic. **Keep** `kanaToKanji`/`kanjiPickerShow`/`_kanaToKanjiLocal` —
that's the 漢字-conversion button, a separate feature, unrelated to
romaji→kana input.

Also un-actioned, low priority: `_transKanjiKeyHandler` in `core-stt.js`
is now orphaned too (nothing ever attaches it as a listener anymore,
same as before my edit) — the `+`-key kanji-shortcut for `transInput`
was already dead before today, not caused by this cleanup. Leave alone
unless asked; it's kanji-conversion-adjacent, not kana-selector code.

## Discussed, not implemented
**Quick Translate hiragana/romaji-mix detection.** User's actual
problem: toggles DE/JP with fn key, sometimes types an English word
while still in Hiragana mode, gets a garbled mix (e.g. "hello" → `へllo`
since Kotoeri converts what it can and leaves the rest as raw ASCII).
Confirmed technical root cause: `globalQTInput` has `_useOsIme=true`,
so the app has zero visibility into the IME's conversion — only sees
the committed string.

Feasible fix (not built): reverse-kana table (mirror of the old
`ROMAJI_MAP`, now being deleted — would need re-deriving or building
fresh) + trigger only when a string mixes hiragana AND leftover ASCII
letters (rare, strong signal) + check reconstructed romaji against a
bundled English wordlist (local, zero API cost). **Real correctness
risk flagged and not resolved:** Kotoeri treats `l`/`r` as the same
kana row, so reversal is lossy — "hello" reconstructs to "hero" (a
real but wrong word). Recommended a suggestion-chip UI ("→ hello? Tab
to accept") over silent auto-replace for this reason. **User has not
picked an approach yet — needs a decision before building anything.**

## Still open from before this session
- `mare` (〜まれ, passive of birth) grammar node — dropped from the G2
  merge, source page mismatch (St. Olaf's own site serves ～まで content
  under the まれ link — not our scraper's bug). Not rewritten by hand.
- `node_id` column on `lesson_phrases` — long-standing blocker, still
  prevents the grammar detail panel from showing source sentences.

## On the horizon (priority order for next session)
1. `git status` — establish real commit state before anything else.
2. Run the pending grep + `check-syntax.js` for the kana-selector work;
   commit that phase if clean.
3. Delete the dead converter engine from `features-kana.js`.
4. Test the Focus Sprint TTS/STT feature end-to-end (never verified).
5. Commit anything from the "not confirmed committed" list above that
   `git status` shows as still dirty.
6. Quick Translate mix-detection — pending user's UX decision.
