# jpStudio — Findings Log

Running record of bugs investigated, root causes found, and fixes applied.
Used as project knowledge so future sessions can find related issues quickly.

---

## 2026-06-01 — Listening strand not updating on progress panel

**Symptom:** Progress panel four-strand graphic never lit up the listening strand, even after extended listening sessions.

**Root cause:** drillLastCompletedWrite('listening') was only called in listenOnEnded() — only when a track played to natural completion. Any pause, A-B loop, or track switch meant it never fired.

**Fix:** Added _listenAccumSecs and _listenTotalMins counters in core-listen.js. listenTimeUpdate() increments _listenAccumSecs while playing. Every 60 seconds of real play time, a { date, filename, seconds: 60, source: 'jpStudio' } entry is appended to jpsat_listen_log_cache (same key and format Satellite uses). Every 10 minutes, drillLastCompletedWrite('listening') is called.

**Files changed:** src/core-listen.js
- Added let _listenAccumSecs = 0 and let _listenTotalMins = 0 at top
- Modified listenTimeUpdate() to accumulate and trigger writes
- Modified loadListenTrack() to reset _listenAccumSecs = 0 on track change

**Related:** jpsat_listen_log_cache is also written by Satellite via Gist sync. Both sources merge in the same kv_store key. listenLogRender() in features-listen-log.js aggregates by date automatically.

**Four-strand write locations:**
- listening: core-listen.js listenTimeUpdate (every 10min) + listenOnEnded
- speaking: features-voice.js lines 1839, 2796
- reading: features-reading.js line 579 + features-video.js line 2700
- writing: core-writing.js line 272
- conj: features-grammar.js lines 1173, 1558, 1579
- kana: core-kana-drill.js line 360
- words: core-kana.js line 40
- anki: core-anki.js line 410
- chat: core-vocab.js line 758
- video: features-video.js line 241
- gramnotes: core-foundation.js line 1642
- counters: core-counters.js line 235
- gramSent: features-grammar.js line 776
