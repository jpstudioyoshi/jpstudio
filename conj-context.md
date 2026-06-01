# jpStudio — Conjugation Drill Reference
*Thread context doc — session 20+*

---

## Files Involved

| File | Role |
|------|------|
| `src/features-grammar.js` | All conjugation drill logic (~2,100 lines) |
| `src/core-counters.js` | `CONJ_QUESTIONS_PER_RUN`, `CONJ_SESSION_RUNS`, `GOALS_DEFAULTS`, `goalsLoad()`, `goalsSave()`, `conjugate()` |
| `index.html` | HTML elements — all suffixed `G` (e.g. `conjDrillAreaG`, `conjInputG`) |
| `style.css` | `.conj-*` classes |

---

## Key Globals (core-counters.js)

```js
var CONJ_QUESTIONS_PER_RUN = goalsLoad().conjQuestionsPerRun;  // default 15
var CONJ_SESSION_RUNS      = goalsLoad().conjSessionRuns;       // default 3
```

**Risk:** both declared at parse time. If DB startup aborts `core-counters.js` before these lines, they are `undefined` for the whole session.

**Workaround in place:** all critical uses now have `|| 15` or `|| 3` fallbacks.

```js
const GOALS_DEFAULTS = {
  conjQuestionsPerRun: 15,
  conjSessionRuns:      3,
  // ...
};
```

`GOALS_DEFAULTS` must be declared **before** the `var` block — TDZ bug was fixed in session 19.

---

## Key Functions (features-grammar.js)

| Function | What it does |
|----------|-------------|
| `startConjDrillG()` | Reads options, tries `ConjSession.load()` to resume, else starts fresh: sets `conjRun = 1`, calls `conjBuildRunQueue()` |
| `conjResumeSession(saved)` | Restores state from saved session, initialises `conjTypedAnswers` |
| `conjBuildRunQueue(vt, forms, pol, reg)` | Builds `conjQueue`, slices to `CONJ_QUESTIONS_PER_RUN \|\| 15`, shuffles, saves progress, calls `renderConjDrillG()` |
| `renderConjDrillG()` | Main render — guard: returns early if `conjQueue` empty. Handles: active question, run-end summary, session-complete summary |
| `conjNextRun()` | Increments `conjRun`, calls `conjBuildRunQueue()` |
| `checkConjG()` | Checks answer, records result, advances |
| `advanceConjG()` | Moves to next question |
| `retreatConjG()` | Steps back one question |

---

## State Variables

```js
conjQueue          // array of question items for current run
conjIdx            // current position in queue
conjRun            // current run number (1-based)
conjResults        // array: 'pending' | 'ok' | 'miss' | 'slip'
conjTypedAnswers   // array of { val: string } — what user typed
conjOk             // correct count this run
conjMiss           // miss count this run
conjSessionCorrect // map: key → count (whole session)
conjSessionWrong   // map: key → count (whole session)
conjRevealed       // boolean — answer shown
conjCurrentAnswer  // current item ref
```

---

## Session Persistence

`ConjSession` object handles save/load via `kvAPI` (key: `STORAGE_KEYS.CONJ_SESSION`).

- `ConjSession.load()` → returns saved object or null
- `ConjSession.saveProgress(...)` → called after every answer and run build
- `ConjSession.markComplete()` → sets `completed: true`

**Corrupt session workaround:** if session is stuck (e.g. 0/300+ items), clear manually:
```js
kvAPI.set('CONJ_SESSION', null)
```
A proper auto-detection fix is pending.

---

## Dot Row

```js
const dotHtml = conjResults.slice(0, CONJ_QUESTIONS_PER_RUN || 15).map((r,i) =>
  '<div class="conj-dot ' + (r==='ok'?'ok':r==='miss'?'miss':r==='slip'?'slip':i===conjIdx?'cur':'') + '"></div>'
).join('');
```

- Capped at `CONJ_QUESTIONS_PER_RUN || 15` — fixed session 18 (`|| 10`) → session 20 (`|| 15`)
- Dot states: `ok` (teal), `miss` (red), `slip` (gold), `cur` (active), blank (pending)

---

## Run Flow

```
startConjDrillG()
  └─ conjRun = 1
  └─ conjBuildRunQueue()        ← slices to CONJ_QUESTIONS_PER_RUN || 15
       └─ renderConjDrillG()    ← shows question
            └─ checkConjG()     ← on answer
                 └─ advanceConjG()
                      └─ renderConjDrillG()
                           └─ [conjIdx >= conjQueue.length] → run-end summary
                                └─ conjNextRun() button
                                     └─ conjRun++
                                     └─ conjBuildRunQueue()  ← repeat
                                          └─ [conjRun >= CONJ_SESSION_RUNS] → session complete
```

---

## Known Issues / Workarounds

| Issue | Status | Workaround |
|-------|--------|------------|
| `CONJ_QUESTIONS_PER_RUN` undefined on cold start | Active | `\|\| 15` fallback in slice + dot row |
| `CONJ_SESSION_RUNS` undefined on cold start | Active | `\|\| 3` fallback in stats bar + summary |
| Corrupt saved session (0/300+ items) | Pending fix | Manual `kvAPI.set('CONJ_SESSION', null)` |
| DB startup `rows is not iterable` cascade | Pending root fix | Fallbacks absorb symptoms |

---

## Terminal Patterns

```bash
# Locate lines
jp && grep -n "pattern" src/features-grammar.js | pbcopy

# Read a block (no pbcopy on sed reads — swallows output)
jp && sed -n '1536,1600p' src/features-grammar.js

# Single-line sed fix
jp && sed -i '' 'NUMs/old/new/' src/features-grammar.js

# Verify
jp && sed -n 'NUMp' src/features-grammar.js

# Commit
jp && git add -A && git commit -m "fix: description" && git push
```

---

## Settings Panel Elements (goals)

| Element ID | Variable |
|------------|----------|
| `goalConjQuestionsPerRun` | `CONJ_QUESTIONS_PER_RUN` |
| `goalConjSessionRuns` | `CONJ_SESSION_RUNS` |

Values read by `goalsLoad()`, written by `goalsSave()`, stored in `kvAPI` key `GOALS`.
