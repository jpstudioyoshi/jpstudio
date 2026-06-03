# jpStudio — Intelligent Hub Architecture
*Drafted: 2026-06-01 — updated after StudentModel audit and invalidate() wiring*

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
- **Audit complete** — see StudentModel Status below
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

## StudentModel — Current Status (post-audit)

**Verdict: fully inert but well-structured. Good foundation.**

### What it reads
- kvAPI (sync): kana mastery, conjugation SRS, counter SRS + mastery, writing errors,
  speaking sessions, Anki data, listen SRS, lesson notes, drillLastCompleted per strand
- Global state: AppState, AnkiState, GrammarModel, KM, GrammarErrors, ConjSession, CM, goalsLoad()
- DB (async only): lesson_sessions, transcript_turns (100-row sample)
- **Does NOT read:** learning_events, panel_sessions, words, srs_items, error_history, corpus_entries

### Public API
| Method | Type | Purpose |
|---|---|---|
| snapshot() | sync | Cached 60s snapshot, no DB data |
| snapshotAsync() | async | Full snapshot + DB lesson data |
| invalidate() | sync | Clears cache |
| claudeSummary() | async | Formats snapshot as Claude prompt string |

Exported via `window.StudentModel` and `App.StudentModel`.

### Key gaps vs Verteilerstelle role
- **No inbound wiring** — panels don't push facts to it
- **No AppEvents integration** — not subscribed to anything
- **No strand time accumulation** — only last-activity timestamps, not time-on-task
- **No outbound signals** — cannot warn panels or trigger recommendations
- **invalidate() was orphaned** — now fixed (see below)
- **Layer 2 not wired** — claudeSummary() is pull-on-demand, no trigger logic

### What's already good
- Domain coverage complete — all panels represented
- Shape is flat and additive — new domains are top-level keys, nothing breaks
- Defensive throughout — every collector is try/caught
- 60s cache means cheap to call repeatedly once wired
- claudeSummary() already implements Four Strands recency summary

---

## Implementation Progress

### Phase 1 — Foundation ✅ COMPLETE
- `panel_sessions` and `learning_events` tables added to `createSchema()` in main.js

### Phase 2 — Basic instrumentation ✅ COMPLETE
- Panel active time (deducted to last interaction) → `panel_sessions`
- All major drill types → `drill_results` and `learning_events`
- Writing iteration tracking → `writing_sessions` and `learning_events`
- `invalidate()` wired into all 6 drill completion handlers ✅

### Phase 2b — StudentModel connection (in progress)
- **Step 1 done:** `invalidate()` fires after every drill answer (conjugation, kana,
  vocab, times ×2, DrillCard, writing)
- **Step 2 next:** wire `snapshotAsync()` into progress panel refresh — first place
  that actually uses the data
- **Step 3 next:** AppEvents subscription skeleton in StudentModel — receive facts
  without yet acting

### Phase 3 — Data audit (pending)
- Run app through typical session, verify what actually lands in DB
- Corpus tables look promising but reliability across all panels unknown
- Fix gaps before building analysis on top

### Phase 4 — Four strand balance (pending)
- `panel_sessions` populated enough to calculate strand time per week
- Progress panel shows real balance chart
- StudentModel detects drift and flags it

### Phase 5 — Intelligence (pending)
- Gap detection across strands
- LLM-based interpretation triggered by Layer 1 rules
- Nation framework actively driving study recommendations
- Genki taxonomy connected to encountered grammar
- `agent_decisions` table receives LLM decision log

---

## Measurements

### Strand time — primary metric
- Timer runs while panel is active
- On exit: duration recorded as `started_at` → `last_interaction_at` (not clock time)
- Interaction signals: keystrokes, clicks, scroll, audio playback active, microphone active
- No arbitrary timeout — deduct to last interaction, discard remainder
- Sessions < 2s discarded

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
- Already captured in `corpus_lookups` — needs panel context added
- Tracks vocabulary growth over time: same text, fewer lookups months later

### Drill answer latency
- `response_ms` in `drill_results` — slow correct answers = automatisation deficit

### Vocabulary lifecycle
- First encounter (panel + strand), subsequent encounters, first successful production
- Tracked across `corpus_entries`, `corpus_lookups`, `corpus_productions`
- Directly implements Nation's varied meetings principle

### Read-aloud accuracy (pending — listen thread)
- Known target text + TTS + STT diff
- Character/word level divergences = pronunciation error profile

### Read-aloud fluency (pending — listen thread)
- Learner reading time vs TTS time — purely production speed, content controlled
- Gap between accuracy and fluency score = automatisation deficit

### 4/3/2 sessions ✅ live
- Three timed deliveries, delta between 1 and 3 = within-session fluency gain

### Dropped metrics
- **Replay count** — no diagnostic value
- **Reading speed** — reflects content difficulty not learning
- **Whisper confidence** — audio clarity not language accuracy
- **STT conjugation** — too imprecise for single-syllable differences

---

## DB Schema (current)

All tables in `main.js` `createSchema()`:
- `learning_events` ✅ — created_at, panel, event_type, payload
- `panel_sessions` ✅ — panel, strand, started_at, ended_at, duration_s
- `drill_results` ✅ — now receiving writes
- `writing_sessions` ✅ — now receiving writes
- `corpus_lookups`, `corpus_entries`, `corpus_productions` ✅
- `error_history` ✅
- `failure_events` ✅ — PreflightService, diagnostics only
- `agent_decisions` — reserved for Layer 2 LLM decision log
- `srs_items` — schema exists, DrillSRS still on kvAPI (migration pending)

---

## Key Data Flows to Build

### Yoshi session → grammar tagging
- Transcribed sessions get grammar analysis pass
- Sentences/forms tagged against Genki taxonomy
- Yoshi: strand 2 output + strand 1 input — grammar tagging only, no performance metrics

### Gap detection
- StudentModel correlates: grammar encountered in input vs produced accurately in output
- Gap surfaces as deliberate study candidate

### Deliberate study candidates
- Driven by gap detection, not predetermined curriculum
- Genki used as reference resource, not syllabus

---

## Genki Taxonomy
- Already exists in progress panel — extent and wiring unclear
- **Needs audit:** what grammar points are listed, what's wired to real data,
  whether AnalysisService touches it
- Goal: taxonomy becomes a labelling system for encountered grammar, not a to-do list

---

## Remaining Audits Needed

1. **Progress panel / Genki taxonomy** — what's in it, what's wired, what's display-only
2. **AnalysisService** — does it do grammar tagging on transcripts currently
3. **AppEvents usage** — which panels currently emit anything, which listen

---

## Development Coordination

- **Runtime:** panels → AppEvents → StudentModel → panels (described above)
- **Development:** threads coordinate via context files — process problem not architecture
- This thread reserved for architecture discussion only

---

## Open Questions

- Should the intelligent layer push unsolicited recommendations, or only respond
  to explicit user check-ins?
- How does pitch accent fit into the strand model? (maps to strand 3)
- Yoshi split: 50/50 input/output, or user-tagged per session?
- DrillSRS migration from kvAPI to `srs_items` — when and how
