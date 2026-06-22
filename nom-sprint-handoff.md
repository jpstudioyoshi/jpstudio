# jpStudio: NoM Analysis & Focus Sprint — Handoff Document

## What we're building

After each lesson import, automatically surface 2–3 sprint focus theme suggestions based on where communication broke down in the transcript. These feed the 集中 (Focus Sprint) panel which already exists and accepts a topic string.

---

## What's already built

- `transcript_turns` table: `session_id`, `timestamp_offset`, `speaker`, `content`, `word_count`
- `lesson_sessions.extracted_grammar`: flat JSON array of node_ids — already populated by `lessonNotesExtractGrammarSilent`
- `lesson_sessions.raw_content`: raw WhatsApp notes text — now persisted at import (wired 2026-06-22)
- `lesson_sessions.linked_session_id`: recording row → WhatsApp anchor row (added 2026-06-22)
- `lesson_sessions.source`: `'whatsapp'` or `'recording'` (fixed 2026-06-22)
- Audio seek infrastructure: `lnSeekToTime(ms)` already wired — "Play from here" buttons are essentially free
- 集中 panel accepts a topic string — sprint suggestions just need to call it with a label
- Grammar nodes already linked to Genki points in the Progress panel
- Hallucination scrubber wired into Orchestrator pipeline (added 2026-06-22)

---

## Key data facts

- **Single audio channel** — both Paul and Yoshi on one mic. Whisper outputs everything as `speaker: user`. Diarization not available and not needed.
- **Transcript is fragmented** — Whisper chunks short utterances as single words. Longer utterances appear as full sentences at decimal timestamps.
- **Whisper hallucinates on ambiguous audio** — confirmed: session 80 had `猫はお尻を探しています` repeat for 19 minutes (Whisper mishearing マイクロ at lesson start). Scrubber now handles this automatically.
- **WhatsApp notes are timestamped** — Yoshi's notes interleave with the transcript timeline and contain corrections, vocabulary callouts, and sentence summaries.

---

## DB Schema (relevant tables)

```sql
transcript_turns (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id       INTEGER,
  timestamp_offset TEXT,      -- seconds as float string
  speaker          TEXT,      -- "user" or "teacher"
  content          TEXT,
  word_count       INTEGER
)

lesson_sessions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at        TEXT,
  date              TEXT,
  source            TEXT,      -- 'whatsapp' or 'recording'
  audio_path        TEXT,
  raw_content       TEXT,      -- raw WhatsApp text (now persisted)
  extracted_grammar TEXT,      -- JSON array: ["comparison","te_form",...]
  transcript_json   TEXT,
  processed_at      TEXT,
  linked_session_id INTEGER    -- recording row → whatsapp anchor row
)
```

---

## Architecture — lesson_sessions model

- One lesson = one WhatsApp row (`source='whatsapp'`) as anchor
- Recording row (`source='recording'`) links back via `linked_session_id`
- Auto-linking on WhatsApp import: same-date recordings with `audio_duration_s > 600`, silent if one match, warning if multiple
- Full consolidation to single row deferred — link column unblocks the pipeline

---

## Hallucination scrubber

**Already wired** in `Orchestrator.js` — `_scrubHallucinations(turns)` runs after `merge()` before save.

Rule: keep only the first occurrence of any string appearing 5+ times in the transcript.

---

## NoM detection approach

Forget diarization entirely. Detect from the single mixed-channel transcript:

### Rule-based triggers (cheap, client-side)

1. **Morphological variation** — same stem with changing endings → learner working out a form
   - Session 80: `はなしゃ` → `はなしゃな` → `はなさん` → `はなさなきり` → `ば` → `なりません` (t=1179–1213s)

2. **Dense repetition clusters** — same word 4+ times in short window → searching/hesitating

3. **Particle alternation** — same noun, different particle in adjacent turns → repair signal
   - Session 80: `映画館の中に` → `映画館に` → `映画館で` × 4 → settles on で (t=1585–1591s)

4. **Explicit repair markers** — `なんで`, `ちょっと待ってください`, `すみません`, `何ですか`, `もう一度`

5. **Vocabulary gap** — L1 word followed by Japanese search
   - Session 80: `おしといい` (German) → `おひとよい` → `お人よし` (t=2263–2337s)

### LLM window classification (1 API call per cluster)

Feed 4–6 turn window to Claude:
> "Does this contain a breakdown/repair episode? If yes, what grammar/vocab point was likely the cause? Reply JSON only: `{isNom: bool, topic: string, severity: 1-3}`"

### Yoshi notes as confirmation signal

Rule-detected repair overlapping a Yoshi note correction = high-confidence episode. No ML needed.

---

## Real lesson analysis — session 80 (2026-06-22)

### NoM episodes identified

**Episode 1 — `話さなければなりません` (t=1179–1213s)**
`はなしゃ` × 3 → `はなさん` × 2 → `はなさなきり` → `ば` → `なりません`
Yoshi note confirms at 14:20. Node: `nakucha_ikemasen`. Severity: 3.

**Episode 2 — `やることをしなければなりません` (t=1733–1815s)**
`やること` × 4 → `しな` → `しなけれ` × 3 → `しなければ` → `なりません`
Yoshi note confirms at 14:30. Node: `nakucha_ikemasen`. Severity: 3.

**Episode 3 — `部屋で遊ばなければなりませんでした` (t=1887–1899s)**
`あそば` × 3 → `あそばなかれ` → `あそばなかれば` → `なりません` → `でした` × 2
Node: `nakucha_ikemasen` + `past_tense_masu`. Severity: 2.

**Episode 4 — `映画館で/に` particle alternation (t=1585–1599s)**
`映画館の中に` → `映画館に` → `映画館で` × 4 → `見ました`
Node: `particle_de_place`. Severity: 2.

**Episode 5 — `水は来なければなりません` (t=1999–2007s)**
`こうなければ` → `来なければ` → `なりません` × 2
Node: `nakucha_ikemasen`. Severity: 2.

**Episode 6 — `食べ物を買わなければなりませんでした` (t=2753–2820s)**
`かなかれ` → `かねかればなりませんでした` → `かわ` × 4 → `かれば` → `なりませんでした`
Yoshi comment: `ちょっと変ですね`. Node: `nakucha_ikemasen` + `past_tense_masu`. Severity: 3.

**Episode 7 — `お人よし` vocabulary gap (t=2263–2337s)**
`おしといい` (German) → `おひとよい` × 5 → `おひとよしい` → `お人よし`
Node: new vocab. Severity: 1.

### Sprint suggestions this lesson would generate

| Rank | Topic | Node | Episodes | Severity | Note confirmed |
|------|-------|------|----------|----------|----------------|
| 1 | `なければなりません — obligation forms` | `nakucha_ikemasen` | 4 | 3 | ✅ ×3 |
| 2 | `買わなければなりませんでした — past obligation` | `nakucha_ikemasen` + `past_tense_masu` | 2 | 3 | ✅ |
| 3 | `映画館で vs に — place particles` | `particle_de_place` | 1 | 2 | ❌ |

Deduplication: topics 1 and 2 share a node — surface the most complex variant (past obligation) as primary.

### Key architectural finding

`nakucha_ikemasen` dominates this session (4+ episodes) AND appears in `extracted_grammar` for the linked WhatsApp session. Grammar extraction and NoM detection converge on the same node independently — when both agree, confidence is high.

---

## Proposed sprint suggestion output format

```json
{
  "topic": "なければなりません — obligation forms",
  "node_id": "nakucha_ikemasen",
  "episode_count": 4,
  "severity": 3,
  "example_offset_ms": 1179000,
  "note_confirmed": true
}
```

Rendered as a card in 集中 panel:
- Topic label
- "Session 80, 19:39"
- ▶ Play (seeks audio to episode)
- Start Sprint button

---

## Future: theme segmentation

One API call per session could return section markers (topic + offset) for timeline navigation. Combined with Yoshi notes (green) and NoM cluster markers (red) on the same timeline, makes the recording genuinely navigable.

---

## Build sequence

1. ✅ Fix duplicate transcript rows — done 2026-06-22
2. ✅ Wire `raw_content` persistence — done 2026-06-22
3. ✅ Wire hallucination scrubber into Orchestrator — done 2026-06-22
4. ✅ Add `linked_session_id` + fix `source` values — done 2026-06-22 (Claude Code)
5. Fix 📋 Data button clipboard confirmation
6. Wire `turn_id` population in `lesson_phrases`
7. **Build `nomDetectClusters(sessionId)` — rule-based, client-side JS, no API calls** ← next
8. Add LLM window classification per cluster (1 call per cluster)
9. Score + rank; deduplicate by node
10. Surface top 2–3 as sprint suggestion cards in 集中 panel
11. Theme segmentation — one API call per session, section markers for timeline
