# jpStudio — Intelligent Hub Architecture
*Drafted: 2026-06-01 — updated 2026-06-03 after session 21 completion*

---

## Guiding Principle

The system is built around Paul Nation's Four Strands framework. The central question
the app should always be able to answer is:

**Is the learner's time balanced across the four strands?**

The four strands, each requiring roughly equal time:
1. **Meaning-focused input** — listening, reading (listen panel, read panel, video)
2. **Meaning-focused output** — speaking, writing (voice/Yoshi sessions, writing panel)
3. **Language-focused learning** — deliberate study (conjugation drill, kana, words, Genki reference)
4. **Fluency development** — easy familiar material with speed pressure (Yoshi conversation, 4/3/2, repeated listening)

Learners naturally drift toward what they're comfortable with. Detecting and correcting
that drift is the hub's most valuable job.

---

## Runtime Architecture

### AppEvents — the bus
- `src/AppEvents.js`, 59 lines + new learning event constants
- Event constants: `DRILL_ANSWER`, `VOCAB_LOOKUP`, `VOCAB_PRODUCED`, `ERROR_RECORDED`,
  `WRITING_SUBMITTED`, `FLUENCY_432`, `SESSION_TIME`
- All panels emit to AppEvents at the same points where `learning_events` DB writes fire

### StudentModel — the Verteilerstelle
- `src/StudentModel.js`, ~580 lines
- **Now wired:** subscribes to 7 AppEvents on startup, invalidates cache on each
- **Now wired:** `snapshotAsync()` fires on every progress panel open
- **Now wired:** `SESSION_SAVED` → writes Yoshi sessions to `panel_sessions`
- **Now wired:** `RECORDING_STARTED`/`RECORDING_STOPPED` → writes voice recording time
- `collectStrandBalance()` — queries `panel_sessions`, applies `STRAND_WEIGHTS`, returns per-strand minutes + Yoshi breakdown
- `claudeSummary()` — formats full snapshot as Claude prompt string (pull-on-demand)
- Still needs: outbound signals, gap detection, LLM trigger layer

### Panels — emitters and subscribers
- Each panel emits facts to AppEvents at drill completion points
- Panels do not talk to each other directly
- `invalidate()` fires after every drill answer across all 6 drill files

### Progress panel
- `renderStrandBalance()` — live strand balance chart with stacked bars (Yoshi in teal)
- `strandWeightsRender/Save/Load()` — settings UI for per-activity strand weights
- Calls `snapshotAsync()` on open

---

## Two Parallel Streams

- **`learning_events`** — persistent DB record, always written, historical record
- **`AppEvents`** — live bus, in-memory, real-time reactions

Both stay. Different purposes. `learning_events` is the audit trail. `AppEvents` drives
live StudentModel reactions.

---

## Strand Balance Chart

Live in progress panel. Four horizontal bars, last 7 days.
- Bar length = weighted time contribution (not raw minutes — multiple strands can share time)
- Yoshi portion shown in teal within the bar
- Amber < 20% of total, red at zero
- `STRAND_WEIGHTS` stored in kvAPI — 14 activities, S1-S4 independent (0-100)
- Weights applied in `collectStrandBalance()` — one activity can contribute to multiple strands

### Strand classification
| Panel/Activity | S1 | S2 | S3 | S4 |
|---|---|---|---|---|
| Listen | 100 | 0 | 0 | 0 |
| Read | 100 | 20 | 0 | 20 |
| Video | 100 | 0 | 0 | 0 |
| Yoshi session | 50 | 50 | 0 | 100* |
| Writing | 0 | 100 | 0 | 50 |
| Sentence building | 0 | 100 | 50 | 0 |
| Conjugation drill | 0 | 0 | 100 | 0 |
| Kana drill | 0 | 0 | 100 | 0 |
| Words / SRS | 0 | 0 | 100 | 0 |
| Times drill | 0 | 0 | 100 | 0 |
| Counters / DrillCard | 0 | 0 | 100 | 0 |
| 4/3/2 | 0 | 0 | 0 | 100 |
| Read-aloud | 0 | 50 | 0 | 50 |

*Yoshi S4 weight set by user in settings — conversation as fluency activity

### Voice panel note
- Voice panel timer removed from `_STRAND_MAP` — too noisy (includes development discussion)
- Voice time now recorded only from actual recording events (`RECORDING_STARTED`/`STOPPED`)
- Yoshi full sessions recorded from `SESSION_SAVED` event with `audio_duration_s`

---

## Measurements

### Strand time — primary metric ✅ LIVE
- `panel_sessions` table — panel, strand, started_at, ended_at, duration_s
- Timer deducts to last interaction (click, keydown, audio active, mic active)
- Voice: recording events only; Yoshi: SESSION_SAVED; Sentences: completion hook
- Weighted by `STRAND_WEIGHTS` in balance calculation

### Dictionary lookup density ✅ COLLECTING
- `corpus_lookups` table — word, timestamp, panel context
- ≤2/100 words = correctly levelled content

### Drill answer quality ✅ COLLECTING
- `drill_results` table — drill_type, item_key, correct, response_ms
- `learning_events` — full payload including form, result, typed answer

### Vocabulary lifecycle ✅ COLLECTING
- `corpus_entries`, `corpus_lookups`, `corpus_productions`
- First encounter panel, lookup count, production count

### Writing iteration ✅ COLLECTING
- `writing_sessions` — first_attempt, final_text, check_count

### Read-aloud accuracy/fluency 🔲 PENDING (listen thread)
### 4/3/2 sessions ✅ COLLECTING (features-voice.js)

### Dropped metrics
- Replay count, reading speed, STT conjugation, Whisper confidence

---

## Implementation Progress

### Phase 1 — Foundation ✅
- `panel_sessions` and `learning_events` tables in schema

### Phase 2 — Instrumentation ✅
- All major drill types → `drill_results` + `learning_events`
- Panel session timer → `panel_sessions`
- AppEvents.emit() at all drill completion points

### Phase 2b — StudentModel connection ✅
- `invalidate()` wired into all 7 drill completion points
- `snapshotAsync()` fires on progress panel open
- AppEvents subscription skeleton live

### Phase 3 — StudentModel intelligence (in progress)
- Step 1 ✅ — AppEvents.emit() wired into all panels
- Step 2 ✅ — Strand balance chart live with weighted calculation
- Step 3 🔲 — Strand imbalance outbound signal (toast/indicator when strand < 20%)

### Phase 4 — Yoshi-driven learning (new)
See below.

### Phase 5 — Full intelligence (future)
- Gap detection across strands
- LLM-based interpretation on triggers
- `agent_decisions` table for LLM decision log

---

## Yoshi-Driven Learning (Phase 4)

### Audits complete
- **AnalysisService** ✅ — fully built, extracts keyVocab + grammarPoints, but orphaned (never called)
- **Orchestrator** ✅ — analyzeLesson() never wired into pipeline; ANALYSIS_COMPLETE never emitted

### Two vocabulary sources — kept separate by design
| Source | Table | Path | Trust level |
|---|---|---|---|
| WhatsApp / doc-paste | `lesson_phrases` | lessonNotesExtract*Silent | High — curated, confirmed communication |
| Audio transcript analysis | `transcript_vocab` (new) | AnalysisService.analyzeLesson() | Softer — Claude's interpretation |

WhatsApp vocab is the truth. Audio-derived vocab refers to it. Never mix into the same table.
Grammar from doc-paste stays in `LessonNotesState.grammar` (memory only for now).
`extracted_grammar` column on `lesson_sessions` — exists, dead, available for audio grammar tags.

### Pipeline gap to fill
`_runProcessingPipeline` in Orchestrator.js currently:
1. Transcribes → merges → saves → emits SESSION_SAVED
2. **Never calls analyzeLesson()**
3. `analysis: {}` is persisted into notes_text on every save

Fix: after `_currentSession.merge()`, before `saveSession()`:
- Call `AnalysisService.analyzeLesson(session)`
- Persist `keyVocab` → new `transcript_vocab` table
- Persist `grammarPoints` → `lesson_sessions.extracted_grammar`
- Emit `ANALYSIS_COMPLETE` with analysis object
- StudentModel listens → feeds vocab to SRS, flags grammar against GrammarModel

### 4a — Vocabulary: less arbitrary, more contextual
**Current state:** Words deck is frequency-based N5 list, arbitrary.
**Target:** SRS deck includes words from real Yoshi conversations + N5 core.
**Nation rationale:** Words encountered in meaningful context are worth drilling.
**New table needed:**
```sql
CREATE TABLE IF NOT EXISTS transcript_vocab (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  word        TEXT NOT NULL,
  reading     TEXT,
  meaning     TEXT,
  created_at  TEXT NOT NULL
);
```
**Pipeline:** SESSION_SAVED → analyzeLesson() → transcript_vocab → SRS deck on next open

### 4b — Grammar points → Genki display integration
**Current state:** Genki taxonomy in progress panel is static, no connection to activity.
**Target:** Grammar forms from Yoshi sessions light up relevant Genki sections.
**Initial behaviour:** "You used passive form — here's the Genki chapter" prompt.
**Later behaviour:** Auto-generate sentence drill sentences targeting that form.
**Nation rationale:** Gap detection — form encountered in input, not yet studied deliberately.
**Grammar mapping challenge:** `grammarPoints` from AnalysisService is free text (e.g. "て-form").
**Options:**
- (a) Post-processing pass maps free text → GrammarModel node IDs
- (b) Extend AnalysisService prompt to request Genki chapter numbers directly ← preferred
**Prerequisite:** Genki taxonomy audit (what grammar points, how structured)

### Build sequence for Phase 4
1. Add `transcript_vocab` table to schema
2. Wire `analyzeLesson()` into Orchestrator pipeline
3. Emit `ANALYSIS_COMPLETE`
4. StudentModel subscribes → writes transcript_vocab, flags extracted_grammar
5. Genki taxonomy audit → map grammar tags
6. Wire grammar highlights to progress panel Genki display

---

## Pending Audits

1. **Genki taxonomy** ← next — what grammar points, structure, wired to anything?
2. **AppEvents usage** — which panels emit/listen beyond what we wired
3. **Data audit** — run typical session, verify DB writes vs expectations

---

## Development Coordination

- **Architecture thread** — design decisions, cross-cutting, doc updates
- **StudentModel thread** — all StudentModel wiring
- Other threads for their respective panels/features
- This thread reserved for architecture discussion

---

## Open Questions

- 4/3/2 separation from voice panel — needs its own `panel_sessions` entry (currently inside voice)
- Yoshi S4 weight — set at 100 by user, meaning Yoshi counts fully as fluency
- Should strand imbalance warning be a toast, a persistent indicator, or both?
- Pitch accent — fits strand 3 (deliberate study), not yet instrumented
- DrillSRS migration — still on kvAPI, not in `srs_items` DB table
