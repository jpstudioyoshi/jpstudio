# Event System Audit — AppEvents Sweep
Generated: 2026-06-11 (session 32) · Analysis only, no edits

Scope: every `AppEvents.emit()` and every `AppEvents.on()` / `AE.on()` call in
`src/**/*.js` and `main.js`. main.js uses IPC only — no AppEvents.
Paired events (emit + listener match, payload consistent) are omitted per brief.

---

## Summary
- Orphaned listeners (no emitter): **2** — VOCAB_PRODUCED, FLUENCY_432
- Orphaned emitters (no listener): **0**
- Payload mismatches: **4** event names with stale/inconsistent shapes (all currently latent — no live consumer reads the divergent field)
- Structural bug (out-of-band but in scope): **1 HIGH** — StudentModel registers 3 listeners inside a `forEach`, causing 7× duplicate DB writes per recording

---

## MISMATCHES BY EVENT

### VOCAB_PRODUCED  (`vocab:produced`)
- **Emitter:** NONE
- **Listener:** `src/StudentModel.js:563` (generic invalidate loop)
- **Issue:** orphaned listener. The string `'vocab:produced'` is written **directly to the `learning_events` table** (`src/core-srs.js:534`, `src/core-srs.js:568`) — never routed through `AppEvents.emit()`. StudentModel's cache-invalidation on production therefore never fires.
- **Severity:** low — production data still persists to DB; only the StudentModel snapshot cache goes stale.

### FLUENCY_432  (`fluency:432`)
- **Emitter:** NONE
- **Listener:** `src/StudentModel.js:564` (generic invalidate loop)
- **Issue:** orphaned listener. `'fluency:432'` is written **directly to `learning_events`** (`src/features-voice.js:1590`), not emitted. Matches known pending item #9 ("FLUENCY_432 emitter — wiring → conversation_sessions").
- **Severity:** low — known gap; data persists, only cache invalidation missed.

### WRITING_SUBMITTED  (`writing:submitted`)
- **Emitter:** `src/core-writing.js:306` → `{ first_attempt, final_text, check_count, full_text }`
- **Listeners:** `src/StudentModel.js:563` (invalidate only); `src/core-vocab.js:1676` `initWritingVocabListener` reads `payload.full_text`
- **Issue:** payload-doc mismatch. AppEvents.js declares `// { checkCount, firstAttempt }` (camelCase) but the emit uses snake_case and a different field set. The live consumer reads `full_text`, which **is** emitted, so functionally OK — the bus comment is stale and misleading.
- **Severity:** low (documentation only).

### SESSION_TIME  (`session:time`)
- **Emitter:** `src/features-grammar.js:778` → `{ panel:'sentences', strand:2, duration_s }`
- **Listener:** `src/StudentModel.js:563` (invalidate only — reads no fields)
- **Issue:** payload-doc mismatch. AppEvents.js declares `// { panel, seconds }`; emit sends `duration_s` (+`strand`), not `seconds`. No consumer reads the field today, so latent.
- **Severity:** low — latent; will bite if a future consumer reads `seconds`.

### DRILL_ANSWER  (`drill:answer`)
- **Emitters (5, inconsistent shapes):**
  - `src/core-vocab.js:286` → `{ panel:'words', key, word, result }`
  - `src/features-grammar.js:1967` → `{ panel:'conjugation', key, word, form, pol, reg, result }`
  - `src/features-times.js:305` → `{ panel:'times', key, label, result:'correct' }`
  - `src/features-times.js:360` → `{ panel:'times', key, label, result:'wrong' }`
  - `src/ui/DrillCard.js:146` → `{ panel:'words', drill_type, answer, typed, correct }`
- **Listener:** `src/StudentModel.js:563` (invalidate only — reads no fields)
- **Issue:** payload inconsistency across emitters. Declared shape is `// { panel, key, form, result }`. The four drill emitters roughly agree (`key`/`result`), but **DrillCard.js:146 diverges hard** — no `key`, no `result`; uses a boolean `correct` and `drill_type`/`answer`/`typed` instead. Two different `panel:'words'` emitters (core-vocab vs DrillCard) emit incompatible shapes for the same panel. Latent because the only listener just invalidates.
- **Severity:** low — latent; any future field-reading consumer would break on DrillCard's payload.

---

## NON-FINDINGS (verified paired — listed for completeness)
- VOCAB_LOOKUP, ERROR_RECORDED, LESSON_EXTRACTED, RECORDING_TICK, RECORDING_STARTED, RECORDING_STOPPED, RECORDING_READY, TRANSCRIPTION_STARTED, TRANSCRIPTION_COMPLETE, TRANSCRIPTION_PROGRESS, TRANSCRIPTION_ERROR, ANALYSIS_COMPLETE, SESSION_SAVED, SESSIONS_LOADED, RECORDING_ERROR, PIPELINE_ERROR — emitter + at least one listener present, consumed fields all emitted.
- `initWritingVocabListener` / `initLessonVocabListener` / `initLookupVocabListener` are registered via `src/core.js:532/534/536` — confirmed active, not dead.

---

## STRUCTURAL / BUS-HYGIENE FINDINGS (in scope, not name/payload)

### HIGH — StudentModel listeners nested inside `forEach`
- **Location:** `src/StudentModel.js:567–617`
- **Issue:** The `events.forEach(evt => { AE.on(evt, …); ` block's closing `});` is at **line 617**, not 571. As a result the three subscriptions inside it —
  - `RECORDING_STARTED` (`:575`)
  - `SESSION_SAVED` (`:578`)
  - `RECORDING_STOPPED` (`:598`)
  — are registered **once per iteration of the 7-element `events` array = 7 duplicate listeners each.**
- **Impact:** every recording fires `SESSION_SAVED` → **7 duplicate `panel_sessions` + 7 `learning_events` rows**; `RECORDING_STOPPED` → **7 duplicate voice `panel_sessions` rows**. This silently inflates `panel_sessions` (1095 rows of behavioural analytics noted in the DB audit may be contaminated).
- **Severity:** HIGH — data duplication in an active analytics table. Worth verifying against `panel_sessions` row multiplicity before the "How you're learning" panel (pending item #5) reads from it.

### LOW — duplicate `ANALYSIS_COMPLETE` key in bus definition
- **Location:** `src/AppEvents.js:43` and `src/AppEvents.js:57`
- **Issue:** `ANALYSIS_COMPLETE` is declared twice in the returned object (comments `// { session }` vs `// { session, analysis }`). Same value, second wins — harmless, but the conflicting payload comments are a stale-doc hazard. Actual emit (`Orchestrator.js:174`) and listener (`StudentModel.js:620`) both use `{ session, analysis }`.
- **Severity:** low (cleanup).

### LOW — `RECORDING_READY` is not a declared bus constant
- **Emitter:** `src/Orchestrator.js:78` — string literal `'RECORDING_READY'`
- **Listener:** `src/features-ln-p2.js:1293` — string literal `'RECORDING_READY'`
- **Issue:** Properly paired (both use the literal), so it works — but it is the only event **not** declared in AppEvents.js's constant list, and it is omitted from the overlay-forwarding list in `src/features-tools.js:46–63`. Inconsistent with the rest of the bus; easy to typo-break since there's no constant.
- **Severity:** low (consistency).

---

## METHOD NOTE
Listeners are registered three syntactic ways — `AppEvents.on(...)` (YoshiUI, features-tools, ln-p2), `AE.on(...)` (StudentModel, via a local alias), and `(App.AppEvents || window.AppEvents)?.on(...)` (core-vocab pipelines). A naive `grep AppEvents.on` misses the latter two; this audit grepped all three forms plus `\.on(`.
