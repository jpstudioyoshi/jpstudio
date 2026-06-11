# Japanese Studio — Session Context
Last updated: 2026-06-10 (session 32 — grammar coverage panel, nav/sidebar rework)

## User Preferences
- Paul is learning development workflows as we go — suggest improvements concisely.
- Management window deprioritised — terminal approach preferred for all edits.
- Use jp alias (cd ~/Documents/jpStudio) not full path in commands — ALWAYS prefix with jp &&
- pbcopy for all grep/sed output.
- Always prefix multi-line python3 edits with jp && to avoid directory drift.
- "done" means command ran and printed OK.
- Paul's eyesight is not great — prefer larger text, high contrast, bigger buttons in UI work.
- Give commands one at a time — do not batch unrelated commands.
- Core principle: system should look after itself — Paul learns, doesn't drive the system.

## Chat vs Claude Code — Decision Rule
- **Chat:** single-line fixes, config changes, version bumps, CSS tweaks, grep/sed one-offs
- **Code:** anything touching multiple render paths, multi-line string replacements in JS, multi-file refactors

## Context File Update Process
- context-session.md lives at project root
- At end of session: Claude writes full updated file, Paul runs it, uploads to project Knowledge.

## GitHub Workflow
- Repo: https://github.com/jpstudioyoshi/jpstudio (private)
- Standard push: jp && git add -A && git commit -m "message" && git push
- Pre-commit hook runs check-syntax.js + auto-bumps cache buster (YYYYMMDDHHmmss)

## Claude Code
- Launch: jp && claude --model claude-opus-4-8
- Start: "Read context-session.md and context-vocab.md from Knowledge only. Do not read any other files yet."

## Current Mode
STABILIZATION — nav/UI polish, grammar panel refinement.

## HTML Element Map
`html-map.md` in project Knowledge.

**Session 25-30 additions:**
- vocabWtYoshiPhrases, vocabWtYoshiVocab, vocabWtWriting, vocabWtLookup, vocabWtN5
- vocabWtDirJpEn, vocabWtDirEnJp, vocabWtDirSpeaking
- vocabIntYoshiPhrases/Vocab/Writing/Lookup/N5, vocabThreshLookup/Decay/SessionSize, vocabWeightsMsg
- vcDirectionBtn — JP→EN / EN→JP / Speaking toggle
- vcTypeToggle — Type mode toggle button
- vocabFlipControls — flip card buttons (hidden in type mode)
- vocabTypeControls — text entry area (shown in type mode)
- vocabTypeInput — text input field
- vocabTypeResult — result display (correct answer shown on wrong)
- vocabTypeNextBtn — Next button shown after wrong answer
- .vocab-source-filter checkboxes (Yoshi/Writing/Lookup/N5) — ACTIVE, all checked by default, Reset button
- .vocab-pos-filter checkboxes (Verbs/Nouns/い-adj/な-adj/Adverbs/Phrases) — ACTIVE, all checked by default, Reset button
- conjPoolInfo span — shows "Pool: X known + Y frequency" on drill start

**Session 31-32 additions:**
- #strandMini — live 4-bar strand display in sidebar, replaces 進捗 button, clicks → progress panel
- #grammarCoverageGrid / #grammarDetailPanel — flex row, 68%/29% split
- scrape-grammar.js / scrape-grammar-g2.js — dev tools in project root

## Terminal Workflow
- python3 - << 'PYEOF' for multi-line edits
- Always jp && prefix
- repr() to inspect match strings before retrying
- Blank lines in match strings cause MATCH FAILED
- pbcopy swallows terminal output
- SQLite DB at ~/Library/Application Support/japanese-studio/jpstudio.db
- window.db.query() requires explicit [] params
- Close Electron before SQLite writes
- Long conversations: use Claude Code for multi-line JS string replacements
- DevTools console (Cmd+Option+I) for in-app JS — not terminal
- window.db.run() returns {changes: 0} even on successful batch INSERTs — not an error indicator

## Current Nav / Sidebar Layout

### Sidebar (left, fixed)
Top to bottom:
1. #strandMini — live strand bars, clicks → progress panel
2. ヨシ — lessonnotes panel
3. 質問 — dashboard
4. 筆順 — kana/stroke order
5. 資料 — resources (contains ノート + 語彙録 buttons in header)
6. [flex spacer]
7. ⚙ (large) — settings, bottom

### Nav (top bar)
文法 | 語彙 | 読む | 書く | 聞く | 見る | 話す

### Quick Translate Bar
翻訳 button | input | ▼ history | kana buttons | × clear | result | 🔊 speak

### Removed from sidebar
- 翻訳 (moved to quick translate bar)
- ノート / 語彙録 (moved under 資料 header buttons)
- 進捗 (replaced by #strandMini)

### progressSidebarControls
Still in sidebar HTML (today/week/last week/all radios) — cosmetically untidy, low priority.

## Grammar Coverage Panel — Complete (session 31-32)

### Key files
| File | Location |
|---|---|
| renderGrammarCoverage() | src/features-progress.js ~line 891 |
| grammarNodeClick() | src/features-progress.js ~line 1009 |
| grammarOverridePopup() | src/features-progress.js ~line 1076 |
| renderStrandMini() | src/features-progress.js ~line 361 |
| Grammar panel HTML | index.html ~line 2390–2410 |
| grammar_nodes.json | src/data/grammar_nodes.json — 55 Genki I nodes, includes notes + url fields |
| grammar_nodes_g2.json | src/data/grammar_nodes_g2.json — 53 Genki II nodes, not yet integrated |

### What was built
- Gold dots (corner badge, #ffe600) on pills for nodes in active/recent lesson session
- Two-column layout: grid 68% / detail panel 29% (permanent, sticky)
- Chapter labels inline left of pill rows
- Pills full width, no truncation, data-nodeid attribute for highlight
- Detail panel: pill-coloured title (clickable → override popup), prerequisites one line, St. Olaf notes with formatting, scrollable, pill highlight on click
- Override popup: 4 coloured buttons (weak/partial/confident/mastered) → stGrammarSetOverride()
- Legend: mastered, confident, partial, weak, untouched
- scrape-grammar.js fetches all 55 Genki I node explanations → notes field in grammar_nodes.json
- scrape-grammar-g2.js ready for Genki II when nodes are added

### Gold dot source sentence — PENDING
- Gold dots show nodes from lesson_sessions.extracted_grammar
- Would like to show source sentence from lesson_phrases in the detail panel
- Blocked: lesson_phrases has no node_id column — phrase label ≠ node ID
- Fix: add node_id column to lesson_phrases schema + update extraction to write it
- Workaround: fuzzy match on phrase label (deferred)

### Gold dot dismiss — PENDING
- Button in detail panel to dismiss gold dot for a node until next lesson loads
- Not yet built

## Four Strands Display

### Defaults (session 32)
- Range default: week (was "all")
- Yoshi toggle default: ON (_strandShowYoshi = true)
- "today" range: midnight local time (not rolling 24h)
- "last 7 days" label removed from chart

### renderStrandMini
- Queries last 7 days always (independent of progressRange)
- Respects _strandShowYoshi
- Called on init (1500ms delay for StudentModel), on strandToggleYoshi, on progRangeSet
- Colors: same dynamic logic as renderStrandBalance (red=0, orange<20%, green otherwise)

## Vocab System — Complete State

### All pipelines live
| Source | Trigger | Destination |
|---|---|---|
| yoshi_phrases | LESSON_EXTRACTED → initLessonVocabListener | vocab_items |
| yoshi_vocab | lessonNotesExtractVocabSilent direct write | vocab_items |
| writing | WRITING_SUBMITTED → extractWritingVocabToItems (Claude) | vocab_items |
| lookup | VOCAB_LOOKUP → initLookupVocabListener (≥2, len 2-10) | vocab_items |
| n5 | one-time backfill | vocab_items |

### vocab_items schema
id, word, reading, meaning, example, source, source_ref, direction, type, pos, counter_suffix,
encounter_at, entry_weight, srs_interval, srs_ease, srs_due, srs_graduated, last_reviewed, created_at
UNIQUE(word, source, direction)

### lesson_phrases schema
id, lesson_id, phrase, reading, meaning, example, type, created_at
— NOTE: no node_id column (see Gold dot source sentence above)

### Drill UI — working
- Direction toggle: JP→EN / EN→JP / Speaking
- Type toggle: switches between flip card and text entry
- Text entry: correct → auto-advance after 800ms, wrong → show answer, wait for Next tap
- Source filters: active, all checked by default, Reset button
- POS filters: ACTIVE, all checked by default, Reset button
- Dynamic font scaling on card
- Writing sitting boost: 5+ sentences → 3 day weight boost on lookup words
- Strand tile: updates immediately on markVocab (window._vocabDrillUsedToday flag)

### SRS — SM-2 (corrected session 30)
- Known: srs_interval = floor(interval × ease), ease +0.1 (if graduated), due pushed out
- Got it: srs_interval = floor(interval × max(1.3, ease - 0.10)), ease unchanged
- Again: srs_interval = 1, due tomorrow, ease -0.15 (if graduated, min 1.3)
- srs_ease starts 2.5, srs_graduated column added (schema v10)

### Weighting
- effective_weight = entry_weight × source_weight × direction_weight × prep_boost(1.5×)
- Fetches 200, sorts by effective_weight, slices to 50
- Source weights: yoshi_phrases=1.0, yoshi_vocab=1.0, writing=0.9, lookup=0.6, n5=0.3
- Direction weights: jp_en=1.0, en_jp=0.8, speaking=0.9
- Stored in VOCAB_WEIGHTS kvAPI key

### Filter logic
- Source: all checked = no filter; partial = filter to checked sources; none = empty deck
- POS: all checked or none = no filter; partial = filter to pos column + type='phrase' for Phrases
- NULL pos items excluded when POS filter active and Phrases not checked

### POS Tagging — COMPLETE
- yoshi_vocab: dictionary form + POS extracted via Claude at lesson notes extraction time ✅
- writing words: dictionary form + POS extracted via Claude at writing submission time ✅
- N5 words: POS inherited from words table ✅
- lookup words: inherited from words table where match exists; remainder batch-tagged ✅
- POS enum: noun, verb, i-adj, na-adj, adverb, expression

## Conjugation Drill — DB-driven pool (session 30)

### Pool logic
- Step 1: vocab_items WHERE pos IN (verb/i-adj/na-adj), joined to words for verb_class, ORDER BY srs_ease DESC, srs_graduated DESC — up to 60
- Step 2: top up to 100 from words table ORDER BY frequency DESC, excluding step 1 words
- verb_class mapping: godan→u, ichidan→ru, irregular/suru→irr
- Pool info shown in conjPoolInfo span: "Pool: X known + Y frequency"
- Null verb_class words skipped (not guessed)

### Conjugation SRS — future build
Design note at CONJ_SRS_DESIGN.md in project root.

## Writing Sitting Boost — Complete
- writing_sittings table: id, started_at, saved_at, sentence_count, expires_at
- On save with ≥5 sentences → INSERT with expires_at = +3 days
- loadVocabItemsDeck boosts lookup words ±2 hours from sitting by 1.5×

## Pending — Priority Order

1. **vocab_items schema refactor** — one row per word + separate vocab_srs table; use Claude Fable 5 in Claude Code, dedicated session
2. **Gold dot: source sentence** — add node_id to lesson_phrases schema; show source sentence in detail panel
2. **Gold dot: dismiss button** — hide dot for node until next lesson loads
3. **progressSidebarControls tidy** — radio buttons visible below ⚙, cosmetic issue
4. **Genki II nodes** — grammar_nodes_g2.json exists, not yet integrated
5. **Book vocab import** — 18 pages, OCR artifact (deferred)
6. **Layer 6 downstream** — grammar drill + writing prompt with top-N words
7. **Counter suffix population** — counter_suffix column exists, needs tagging
8. **FLUENCY_432 emitter** — 4/3/2 speaking session wiring
9. **corpus_productions extraction fix** — currently single-kanji, needs word-level
10. **Conjugation SRS deck** — see CONJ_SRS_DESIGN.md

## SQLite Schema (current tables)
kv_store, frames, transcript_sentences, corpus_entries, corpus_lookups, corpus_productions,
srs_items, error_history, lesson_sessions, words, lesson_phrases, pitch_data, writing_sessions,
writing_sittings, drill_results, conversation_sessions, transcript_turns, failure_events,
agent_decisions, panel_sessions, learning_events, grammar_mastery, transcript_vocab, vocab_items

Schema version: 10
DB path: ~/Library/Application Support/japanese-studio/jpstudio.db

## kvAPI keys
STRAND_WEIGHTS, VOCAB_WEIGHTS, VOCAB_THRESHOLDS, VOCAB_INTERVALS,
VOCAB_MIGRATION_V1, VOCAB_LESSON_BACKFILL_V1, VOCAB_LOOKUPS_BACKFILL_V1, VOCAB_N5_BACKFILL_V1

## Vocabulary Model — Canonical Definition (session 31)

### Three tiers
- **Horizon** — in `words` table (N5 reference), not yet in `vocab_items`
- **Target** — in `vocab_items`, not yet graduated in both jp_en AND en_jp
- **Active** — graduated in both jp_en AND en_jp (`srs_graduated=1` in both directions)

All learning activities exist to move words from target → active.
Speaking direction graduation is tracked separately — it can lag behind recognition.

### vocab_items data state (after session 31 cleanup)
- 867 unique words (`type='word'`)
- 59 unique phrases (`type='phrase'`) — chunk-learned, no POS needed
- 46 grammar patterns (`type='grammar'`) — excluded from vocab drill
- POS propagated from `words` table and `pitch_data` covers most words
- `vocab_status` VIEW created — one row per word, `status='active'|'target'`

### Planned schema refactor (next dedicated thread)
Current: one row per word+source+direction (up to 15 rows per word)
Target: one row per word in `vocab_items` + separate `vocab_srs` table (one row per word+direction)
Reason: word properties (POS, reading, meaning) are duplicated across rows; directions are isolated from each other; no single word-level status without a view

### vocab_status VIEW
- Collapses 3 direction rows into one word record
- `status='active'` = graduated_jp_en AND graduated_en_jp both = 1
- Use this view for briefing, sentence generation, and any word-level reporting
