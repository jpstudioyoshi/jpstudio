# Session Context — 2026-07-04 (cont'd, cleanup session)

## Summary
Dead-code sweep + one real bug fix. 8 commits, ~2,825 lines deleted,
~780 inserted (net ~2,000 removed). 0 syntax errors throughout.

## Commits this session
1. `5e4222e` — deleted `features-kana.js` (romaji→kana engine, fully
   dead after IME migration). Kept `kanaToKanji`/漢字 button.
2. `bf07fdb` — deleted `features-pictures.js` (Vehicle/Pictures game,
   script tag already removed from index.html, file left orphaned).
3. `492d66a` — removed dead `_transKanjiKeyHandler` (core-stt.js).
4. `aaf52a1` — removed dead Vehicle Game TTS/STT block left behind in
   `features-reading.js` after the pictures-game split
   (`vgSetTts`/`vgSpeak`/`vgAutoSpeak`/`vgStopMic`/`VehicleGameState`).
5. `05709bb` — removed dead `vocabSourceFilterChanged`/
   `vocabPosFilterChanged` (core-vocab.js) — filter checkboxes no
   longer exist in index.html.
6. `3c9a3c6` — **real bug fix**: conjugation drill's SRS-Due toggle
   (`_conjSrsMode`) gated the *pool filter* but not the *write* — rating
   an item with the toggle OFF (free practice) still wrote to
   `DrillSRS`/`srs_items`, disrupting the real spacing schedule. Now
   both `DrillSRS.record()` calls are gated on `_conjSrsMode`.
7. `ac99f7a` — removed dead `vocabPriorityContext`/`vcBuildPriorityList`/
   `wordEnrichWithSRS`/`wordPriorityScore` (core-vocab.js). Comment
   claimed "used by briefing builder" but zero call sites existed
   anywhere. Also read the old pre-migration `DrillSRS` kvAPI key
   instead of the current `vocab_srs` DB table — moot now, deleted.

## Also resolved this session (not code, prior state)
- 参考 button wrong-panel bug — resolved (per user, no diff captured here)
- Focus Sprint KEY FORMS grid 4th-column wrap bug — resolved (per user)

## Verified clean
- `check-syntax.js`: 38 OK, 0 errors after every single commit
- Dead-candidates count: 5 → 4 → 2 → 0 (fully clean now)
- Kana-selector grep sweep (`kanaOn(\|kanaOff(\|...`) — confirmed empty

## Two SRS engines — clarified, not a bug
- `DrillSRS` (`core-srs.js` → `srs_items` table) — counters, conjugation, times
- Vocab SRS (`core-vocab.js` → `vocab_srs` table) — Words/SRS flashcard drill
- Both live and connected; just never unified. Not touched this session
  beyond the one gating fix above.

## Still open — medium priority
- Focus Sprint TTS/STT (listen_tts/speak_stt activities) — implemented,
  never tested end-to-end. Zero cost when unchecked; one real Whisper
  API call per recording when speak_stt is used.

## Still open — future/dedicated session
- Vocab FK normalization (`word_id` on `vocab_items`) — see
  `vocab-architecture-findings.md`, Option A recommended
- Dual SRS engines — leave separate or design a bridge (not started)
- Two grammar taxonomies (N5_GRAPH 38 nodes vs GrammarModel 107 nodes)
  — coexisting by design, convergence deferred
- `notes_text` blob in `lesson_sessions` — unstructured JSON column,
  medium-term: proper columns
- `mare` (〜まれ) grammar node — still missing, source-site scrape
  mismatch not a scraper bug
- `node_id` column on `lesson_phrases` — still blocks grammar detail
  panel from showing source sentences
