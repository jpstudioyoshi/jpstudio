# jpStudio: NoM Analysis & Focus Sprint — Handoff Document
Last updated: 2026-06-23 (session 51)

## What's built

The full NoM pipeline is complete and wired end-to-end. After each lesson transcription,
the system automatically detects communication breakdown clusters, classifies them with LLM,
ranks them as sprint suggestions, and surfaces them in the 集中 (Focus Sprint) panel.

---

## Pipeline overview

```
transcript_turns
    ↓ nomDetectClusters()       — rule-based, no API
raw clusters
    ↓ nomClassifyClusters()     — ~14 LLM calls per session
confirmed clusters
    ↓ nomRankSuggestions()      — scoring, dedup by node_id
    ↓ note_confirmed enrichment — one DB query, no API
ranked suggestions
    ↓ nomRunAndCache()          — writes to kv_store
    ↓ nomRenderSuggestions()    — renders cards in 集中
```

---

## Session data (first real run)

- Recording session: `lesson_sessions.id = 80` (`source='recording'`, date 2026-06-22)
- WhatsApp session: `lesson_sessions.id = 82` (`source='whatsapp'`, date 2026-06-22)
- Link: `lesson_sessions SET linked_session_id=82 WHERE id=80`
- Transcript turns: 2658 rows in `transcript_turns WHERE session_id=80`
- Lesson phrases: 65 rows in `lesson_phrases WHERE lesson_id=82`
  - 46 grammar, 16 phrase, 3 word
  - 12/19 phrase rows have `turn_id` populated via DL matching
- Extracted grammar: 22 node IDs in `lesson_sessions.extracted_grammar WHERE id=82`

---

## Detection rules (features-nom.js)

Five rules over `transcript_turns`, all client-side, zero API calls:

1. **Dense repetition** — same surface token 4+ times in 45s window
2. **Morphological variation** — same hiragana stem (≥3 chars), 3+ distinct endings in 60s
3. **Particle alternation** — same noun with 2+ different particles in 30s
4. **Repair markers** — `えーと`, `すみません`, `もう一度`, `ちょっと待って` etc.
5. **Vocab gap** — English word (Latin ≥3 chars) followed by repetitive Japanese search in 90s

Pre-processing:
- `_nomScrub(turns)` — removes hallucination loops + stoplist (`うん`, `はい`, `ええ` etc.)
- `_mergeClusters` — clusters within 20s merged; composite ruleType preserved

Recall: **7/7** on known session 80 episodes.

---

## turn_id population — `lnPopulateTurnIds(waLessonId, recSessionId)`

Added session 51. Populates `lesson_phrases.turn_id` by matching phrase content to
`transcript_turns.content` using Damerau-Levenshtein distance.

### Why Damerau-Levenshtein
Standard Levenshtein counts a transposition (ab→ba) as 2 edits. DL counts it as 1.
This matters because Whisper frequently transposes adjacent morae in phonetic transcription.
Example: `tabemasita` → `taembasita` = 1 DL edit, 2 standard edits.
On short Japanese tokens (5-10 chars), this difference decides match/no-match.

### Algorithm
- Needle: first 20 chars of `lesson_phrases.phrase`
- Haystack window: `transcript_turns.content.slice(0, needle.length + 4)`
- Threshold: `distance ≤ max(3, floor(needle.length × 0.3))`
- Only matches `type != 'grammar'` rows (grammar patterns aren't spoken verbatim)

### Hit rate
12/19 phrases matched (63%). The 7 misses are genuinely absent from transcript —
phrases Yoshi wrote in WhatsApp that Paul never said aloud during the lesson.

### Wiring
- Auto-fires in `Orchestrator.js` after `SESSION_SAVED`
- Looks up `linked_session_id` from recording row → finds whatsapp lesson_id → calls match
- Non-blocking (`.catch` logged, never throws)
- Also available manually: `await lnPopulateTurnIds(82, 80)`

---

## note_confirmed signal

After `nomRankSuggestions()`, `nomRunAndCache()` runs one DB query:

```sql
SELECT ls_wa.extracted_grammar FROM lesson_sessions ls_rec
JOIN lesson_sessions ls_wa ON ls_rec.linked_session_id = ls_wa.id
WHERE ls_rec.id = ? AND ls_wa.extracted_grammar IS NOT NULL LIMIT 1
```

If the suggestion's `node_id` appears in the whatsapp session's `extracted_grammar` JSON array,
`note_confirmed: true` is set on the suggestion object before caching.

Rendered as `· ✓ Yoshi` on the 集中 sprint card subtitle.

**What this means:** both the transcript cluster detection AND Yoshi's own grammar extraction
independently identified the same node. High-confidence signal.

---

## Deferred: Levenshtein confirmation layer (full)

The full confirmation layer matches Whisper tokens to Yoshi note *content* (not just node_id)
at the same timestamp. This would give the strongest possible `note_confirmed` signal:
temporal + content agreement, not just topic overlap.

**Prerequisites now met:**
- `turn_id` is populated ✓
- WhatsApp data is in DB ✓
- `linked_session_id` is set ✓

**Still needed:**
- Multiple sessions with real WhatsApp data to tune and validate

Design: for each NoM cluster at offset X, find `lesson_phrases` rows whose `turn_id`
falls within ±30s of X. Run DL between cluster's representative turn content and phrase text.
If distance ≤ threshold → strongest `note_confirmed`.

---

## lesson_sessions link architecture

```
lesson_sessions (source='whatsapp', id=82)
    ↑ linked_session_id
lesson_sessions (source='recording', id=80)
    ↓ session_id
transcript_turns (2658 rows)

lesson_phrases (lesson_id=82)
    → turn_id → transcript_turns.id
    → node_id → grammar_mastery / GrammarModel nodes
```

Auto-link fires in `lessonNotesEnsureDbRow()` on paste:
- Finds same-date recording where `audio_duration_s > 600 OR IS NULL`
- Silent if exactly one match; warns if multiple

---

## Pending next steps (priority order)

1. **Multi-session aggregation** — query `lesson_phrases.node_id` across last N sessions,
   surface nodes appearing in 2+ sessions as recurring blind spots
2. **Two-tier 集中 surface** — "This week" (from notes/recent) vs "Recurring" (historical)
3. **Full Levenshtein confirmation** — temporal + content match (needs more WA data)
4. **"Play from here" button** — `turn_id` → `lnSeekToTime(ms)` (infrastructure in place)
5. **Theme segmentation** — one API call per session, section markers for audio timeline

---

## Key data facts

- Single audio channel — Whisper outputs everything as `speaker: user`
- Transcript is fragmented — Whisper chunks short utterances as single words
- Whisper hallucinates on ambiguous audio — scrubber removes loops (≥5 repeats)
- WhatsApp notes format: `[DD.MM.YY, HH:MM:SS] Sender: message`
- German transcribed as hiragana by Whisper — `NOM_L1_PATTERN` is English-only `/[a-zA-Z]{3,}/`
- Common English words (`OK`, `yes`, `no`) in `NOM_STOPLIST`

---

## Build sequence — completed steps

1. ✅ Fix duplicate transcript rows
2. ✅ Wire `raw_content` persistence
3. ✅ Wire hallucination scrubber into Orchestrator
4. ✅ Add `linked_session_id` + fix `source` values
5. ✅ Build `nomDetectClusters()` — rule-based, client-side
6. ✅ LLM window classification per cluster
7. ✅ Score + rank; deduplicate by node
8. ✅ Surface top 2–3 as sprint suggestion cards in 集中
9. ✅ `lnPopulateTurnIds()` — DL matching, auto-wired post-transcription
10. ✅ `note_confirmed` signal — node_id cross-check with extracted_grammar
11. 🔲 Multi-session aggregation
12. 🔲 Two-tier 集中 surface
13. 🔲 Full Levenshtein confirmation layer
14. 🔲 Theme segmentation
