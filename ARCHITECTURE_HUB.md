# jpStudio — Intelligent Hub Architecture
*Drafted: 2026-06-01 — basis for ongoing architecture discussion*

---

## Guiding Principle

The system is built around Paul Nation's Four Strands framework. The central question
the app should always be able to answer is:

**Is the learner's time balanced across the four strands?**

The four strands, each requiring roughly equal time:
1. **Meaning-focused input** — listening, reading (listen panel, read panel, video)
2. **Meaning-focused output** — speaking, writing (voice/Yoshi sessions, writing panel)
3. **Language-focused learning** — deliberate study (conjugation drill, kana, words, Genki reference)
4. **Fluency development** — easy familiar material with speed pressure (repeated listening/reading, 4/3/2)

Learners naturally drift toward what they're comfortable with. Detecting and correcting
that drift is the hub's most valuable job.

---

## Runtime Architecture

### AppEvents — the bus
- Already exists: `src/AppEvents.js`, 59 lines
- Currently scoped to lesson recording pipeline only
- Pattern is sound: `on/off/emit`, error handling, unsubscribe functions
- **Needs:** new event constants for cross-panel signals (drill errors, vocab encounters,
  strand time, session end)

### StudentModel — the Verteilerstelle
- Already exists: `src/StudentModel.js`, 533 lines
- Current role unclear — needs audit
- **Should become:** the central hub between the bus and the DB
- Owns learner state, interprets incoming facts, decides what to broadcast back

### Panels — emitters and subscribers
- Each panel emits facts to AppEvents (mechanical, no judgement)
- Each panel subscribes to relevant StudentModel broadcasts
- Panels do not talk to each other directly

### Progress panel
- Just another subscriber — not special, not a hub
- Displays what StudentModel knows

---

## Two Layers in StudentModel

### Layer 1 — Mechanical
- Aggregate raw events from all panels
- Persist to DB
- Rule-based triggers: 3 errors on same form, SRS item overdue, session end, strand
  time threshold crossed

### Layer 2 — Intelligent (LLM)
- Fires on triggers from Layer 1, not on every event
- Interprets aggregated state through the lens of Nation's framework
- Produces recommendations back to panels: study targets, strand balance warnings,
  fluency vs accuracy guidance
- **Cost-conscious:** batch or trigger-based, never per-keystroke

---

## Measurements

### Strand time — primary metric
- Timer runs while panel is active
- On exit: duration recorded as `started_at` → `last_interaction_at` (not clock time)
- Interaction signals: keystrokes, clicks, scroll, audio playback active, microphone active
- Microphone and audio playback active count as interaction — covers Yoshi sessions correctly
- No arbitrary timeout — deduct to last interaction, discard remainder

### Strand classification per panel
| Panel              | Strand                          |
|--------------------|---------------------------------|
| Listen             | 1 — input                       |
| Read               | 1 — input                       |
| Video              | 1 — input                       |
| Voice / Yoshi      | 2 — output (+ 1 input, split)   |
| Writing            | 2 — output                      |
| Conjugation drill  | 3 — deliberate                  |
| Kana drill         | 3 — deliberate                  |
| Words / SRS        | 3 — deliberate                  |
| Read-aloud         | 3 — deliberate (accuracy focus) |
| 4/3/2              | 4 — fluency                     |
| Repeated listening | 4 — fluency                     |

### Dictionary lookup density
- Lookups per 100 words — direct measure of content levelling
- ≤2/100: correctly levelled | 3-5/100: borderline | >5/100: too hard
- Already partially captured in `corpus_lookups` — needs panel context added
- Tracks vocabulary growth over time: same text, fewer lookups months later

### Drill answer latency
- `response_ms` already in `drill_results` table
- Slow correct answers indicate uncertainty — form known but not automatised
- Points to specific items needing fluency work not more accuracy drilling

### Error patterns
- Already in `drill_results` — needs analysis layer
- Repeated same error vs scattered errors have different implications

### Hint/reveal usage
- How often learner gives up on retrieval — not yet captured

### Vocabulary lifecycle
- First encounter (panel + strand), subsequent encounters, first successful production
- Already partially tracked across `corpus_entries`, `corpus_lookups`, `corpus_productions`
- Directly implements Nation's varied meetings principle

### Read-aloud accuracy
- Read panel: known target text + TTS + STT
- Whisper transcription diffed against source text
- Character/word level divergences = pronunciation error profile
- Feeds strand 3 deliberate study targets for specific sounds/patterns

### Read-aloud fluency
- Learner reading time vs TTS time for same text
- Content difficulty controlled — purely a production speed measure
- Gap between accuracy score and fluency score = automatisation deficit
- Strand 4 signal: form is known but not fluent

### 4/3/2 sessions
- Three timed deliveries of same content
- Delta between delivery 1 and delivery 3 = within-session fluency gain
- Across sessions on same material = consolidation over time

### Dropped metrics (noise not signal)
- **Replay count** — no diagnostic value, could mean many things
- **Reading speed** — if content is correctly levelled, speed should be consistently slow;
  change reflects content difficulty not learning progress
- **Whisper confidence** — measures audio clarity not language accuracy; limited value

---

## Existing DB Schema (relevant tables)

Already exists in `main.js` `createSchema()`:
- `drill_results` — drill type, item key, correct, response_ms ✓
- `corpus_lookups` — word, timestamp, context ✓
- `corpus_entries` — first_seen_panel, lookup_count, production_count ✓
- `corpus_productions` — word, source, context ✓
- `writing_sessions` — error_type, error_pattern ✓
- `srs_items` — interval, ease, due_date, history ✓

**Missing — to add:**
```sql
CREATE TABLE IF NOT EXISTS panel_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  panel      TEXT NOT NULL,
  strand     INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  ended_at   TEXT NOT NULL,
  duration_s INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS learning_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  panel      TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload    TEXT
);
```

`learning_events` accepts any new event type without schema changes — payload is JSON.

---

## Key Data Flows to Build

### Yoshi session → grammar tagging
- Transcribed sessions get a grammar analysis pass
- Sentences/forms tagged against Genki taxonomy
- Tags stored in DB against transcript sentences
- Yoshi: strand 2 output + strand 1 input — no performance metrics extracted,
  grammar tagging only

### Gap detection
- StudentModel correlates: grammar encountered in input vs produced accurately in output
- Gap = "you're seeing this in real conversation but can't produce it reliably"
- Gap surfaces as deliberate study candidate

### Deliberate study candidates
- Driven by gap detection, not predetermined curriculum
- Genki used as **reference resource**, not syllabus
- "You encountered passive form 12 times this week — here's the Genki entry"

---

## Genki Taxonomy
- Already exists in progress panel — extent and wiring unclear
- **Needs audit:** what grammar points are listed, what's wired to real data,
  whether AnalysisService touches it
- Goal: taxonomy becomes a labelling system for encountered grammar,
  not a to-do list

---

## Implementation Phases

### Phase 1 — Foundation
- Agree and create unified data collection schema
- Add `panel_sessions` and `learning_events` tables to `createSchema()`
- Nothing writes to them yet

### Phase 2 — Basic instrumentation
- Wire panel active time (deducted to last interaction) to `panel_sessions`
- Audit existing data writes — dictionary lookups, drill results, SRS reviews
- Ensure consistent routing through unified tables from all panels

### Phase 3 — Data audit
- Run app through typical session, check what actually lands in DB
- Identify gaps between assumed and actual instrumentation
- Corpus tables look promising but reliability across all panels unknown
- Fix gaps before building analysis on top

### Phase 4 — Four strand balance
- `panel_sessions` populated enough to calculate strand time per week
- Progress panel shows real balance chart
- StudentModel detects drift and flags it

### Phase 5 — Intelligence
- Gap detection across strands
- LLM-based interpretation triggered by Layer 1 rules
- Nation framework actively driving study recommendations
- Genki taxonomy connected to encountered grammar

---

## What Needs Auditing Before Building

1. **StudentModel** — what does it currently own, what is it called for
2. **Progress panel / Genki taxonomy** — what's in it, what's wired, what's display-only
3. **AnalysisService** — does it do any grammar tagging on transcripts currently
4. **AppEvents usage** — which panels currently emit anything, which listen

All four are Claude Code audit sessions, one file/area at a time.

---

## Development Coordination (separate concern)

The "agents talking to each other" question has two meanings:

- **Runtime:** panels → AppEvents → StudentModel → panels (described above)
- **Development:** Claude chat threads coordinating work across panels

The development problem is a process problem, not an architecture problem.
Solution is disciplined context file updates so each thread has current state.
This thread is reserved for architecture discussion only.

---

## Open Questions

- How granular should strand time tracking be — per session or per activity within session?
- Should the intelligent layer ever push unsolicited recommendations, or only respond
  to explicit user check-ins?
- How does pitch accent fit into the strand model? (Nation doesn't cover it explicitly
  but it maps to strand 3)
- Yoshi split: 50/50 input/output, or user-tagged per session?
