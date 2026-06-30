# Core Vocabulary SRS Pool — Design

Status: design only, no schema or code changes yet. Written for review before any migration work begins.

## 1. Problem this solves

`vocab_items` currently has no deliberate, ordered path toward broad N5/N4 coverage. The closest thing — `backfillN5ToVocabItems` — ran once, copied the *entire* `words` table (not just N5) into `vocab_items` at a flat low weight (0.3, source `'n5'`), and will never run again (gated by a one-time `kvAPI` flag). Of the 640 `vocab_items` rows it produced, 559 (87%) exist for no reason other than that single copy — no live path would otherwise have added them — and only 3 of 641 have ever graduated. It is not a curriculum mechanism; it is a frozen, mislabeled snapshot.

Meanwhile, Yoshi-derived vocabulary enters `vocab_items` live, at the highest weight (1.0), and competes for the same `MAX_NEW` daily slots as everything else. This creates a structural conflict: lesson vocabulary (high-value, but unpaced and unbounded) crowds out a steady, deliberate sweep through core frequency vocabulary, because both currently share one undifferentiated SRS pool with no separation of *purpose*.

This document specifies a separate, bounded pool — the **core vocabulary pool** — with its own entry rules, ordering, pacing, and completion condition, sitting alongside (not replacing) the existing per-source SRS flow.

## 2. The cohort

- Source: `words WHERE level IN ('N5', 'N4')`.
- Confirmed count (live DB, this install): **N5 = 377, N4 = 401, total = 778**.
- `list_source` is not a reliable filter for this cohort — the column was added in a schema migration after the original seed ran, so all 778 rows have `list_source = NULL`. `level` is reliable; every row carries an accurate per-word level tag despite the source JSON file interleaving N5 and N4 entries in no particular order.
- This is explicitly **not** the same set as the existing `source='n5'` bucket in `vocab_items` (640 rows, N5+N4+custom mixed, frozen, unordered, weight 0.3). That bucket is retired or relabeled separately — see §8.

## 3. Two sprints, not one pool

Rather than treating all 778 words as one frequency-ordered list, the cohort is split into two sequential phases:

1. **Sprint 1 — N5** (377 words), frequency-ordered.
2. **Sprint 2 — N4** (401 words), frequency-ordered.

Each sprint runs to its own completion before the next begins. Within a sprint, words are introduced in ascending `frequency` order (lower number = more common = introduced first), among words not yet introduced.

### Why two sprints rather than one combined frequency-ordered list

A single combined list would occasionally introduce a high-frequency N4 word before a lower-frequency N5 word, which is defensible by raw frequency but loses a clean, externally legible milestone ("I've covered N5") partway through. Two sprints preserve frequency-ordering as the *intra-sprint* rule while giving a real checkpoint at the one-month mark, not just at three months.

### The frequency-purity tradeoff, and why it's acceptable

Splitting by level means a handful of genuinely high-frequency N4 words get deferred a full sprint behind lower-frequency N5 words. This is mitigated by §5: any word — regardless of sprint or level — that accumulates enough real-world lookups is pulled into the pool immediately on its own merit. A word that matters enough to defer poorly is, almost by definition, a word the learner will independently look up before its scheduled slot arrives.

## 4. Daily intake

- **10–15 new words per day**, drawn from the current sprint's frequency-ordered remainder.
- This is words, not direction-rows. Each new word produces **two** `vocab_srs` rows (`jp-en` and `en-jp`), introduced simultaneously, not staggered.
- At 10–15/day: Sprint 1 (377 words) ≈ 3–4 weeks; Sprint 2 (401 words) ≈ another 3–4 weeks. Total ≈ 6–8 weeks for first-exposure completion of both sprints, faster than the original 3-month estimate (which assumed one combined 778-word pool at the same daily rate) — actual pacing depends on session frequency and is not adjusted for missed days.
- This intake is a **separate quota** from the existing `MAX_NEW` source-weighted allocation (currently 8 `yoshi_vocab` + 7 other = 15 total). It does not share or compete for those slots. The core-vocabulary daily intake and the existing per-source daily cap are two independent pacing mechanisms; review sessions draw from both pools but new-word introduction is governed separately for each.

## 5. Direction pairing and alternation

- Both directions (`jp-en`, `en-jp`) for a new word are introduced **simultaneously** — same day, same `vocab_srs` insert batch — not staggered across separate days.
- The **leading direction alternates by calendar day**: on even days, that day's new-word batch presents `jp-en` first within each card; on odd days, `en-jp` leads. This is a session-construction property (which direction is shown first when a new word is introduced that day), not a scheduling property — once both `vocab_srs` rows exist, they behave identically and are scheduled independently by the existing SM-2 logic regardless of which led on introduction day.
- Rationale: prevents a systematic bias where recognition (`jp-en`) always precedes and implicitly scaffolds production (`en-jp`) for every single word in the cohort.

## 6. Secondary entry path — lookup promotion

- Any word reaching **3–5+ lookups** in `corpus_lookups` (threshold to be fixed at implementation time; current live threshold for the existing `backfillLookupsToVocabItems` mechanism is 2) is promoted into the same pool immediately, regardless of:
  - its sprint phase (even if Sprint 2/N4 hasn't started yet),
  - its frequency rank,
  - whether it's N5, N4, or outside the JLPT seed entirely (e.g. a word encountered only through Yoshi or general lookup).
- This is the existing `backfillLookupsToVocabItems` mechanism, with the threshold raised and the resulting `vocab_items` row tagged so it's part of the same pool/cohort tracking as the sprint-driven entries — not a parallel, separate system requiring reconciliation. A word entering via lookup-promotion and a word entering via scheduled sprint intake are, from the moment both exist, indistinguishable in how they're scheduled and reviewed.

## 7. What stays out of this pool

Yoshi lesson vocabulary, one-off translate-bar lookups below the promotion threshold, and writing-extracted vocabulary continue to be collected (in `words`, `vocab_items` under their existing source tags, `corpus_entries`) but are **not** auto-entered into the core-vocabulary SRS pool. They remain available as raw material for:

- a separate, non-SRS weekly Yoshi review surface (browse/speak, no spaced-repetition scheduling),
- manual promotion into the core pool, at the learner's discretion,
- seeding sentence-construction / non-SRS drill activities for repetition exposure without graded scheduling.

This separation is the actual fix for the original problem (Yoshi vocabulary crowding out core-frequency coverage): two pools with two purposes, rather than one pool with conflicting weights trying to serve both.

## 8. Completion flag

- One flag per sprint, not one overall flag.
- A sprint is complete when **every word in that sprint has both `vocab_srs` direction-rows with `last_reviewed IS NOT NULL`** — first-exposure completion, not mastery or graduation. This matches the stated purpose of this phase: "present them all to get a true weighting from my feedback," i.e. data collection on existing knowledge, not enforced mastery.
- On Sprint 1 (N5) completion: flag fires, Sprint 2 (N4) begins.
- On Sprint 2 (N4) completion: flag fires, both sprints done. This is a deliberate decision point — not an auto-expansion — for what (if anything) enters the SRS pool next. Candidates at that point likely include: promoting high-value Yoshi vocabulary accumulated during the sprints, reconsidering the dead `source='n5'` bucket's 559 orphan words, or defining a new cohort (N3+, or a frequency list beyond N4).

## 9. Relationship to the existing `source='n5'` bucket and the FK migration

This design is independent of, but compatible with, the Option A FK migration (`vocab_items.word_id → words.id`) discussed earlier in this conversation. Specifically:

- The FK migration fixes how `vocab_items` rows reference `words` rows (no more duplicated/stale reading-meaning copies). The core-vocabulary pool design determines *which* `words` rows get a `vocab_items` row, *when*, and *why*. These are orthogonal — the FK should land regardless of whether this pool design is implemented, and this pool design will produce cleaner data if the FK lands first (new entries reference `words` by ID rather than re-copying fields).
- The existing `source='n5'` bucket (640 rows, frozen) is **not** reused as a starting point for this design. It predates frequency-ordering, mixes levels indiscriminately, and 87% of it has no independent justification beyond the original bulk copy. Whether those rows are deleted, relabeled, or left alone as a historical artifact is a separate decision, deferred to implementation time — this design does not depend on resolving it first.

## 10. Open implementation questions (not yet decided)

- Exact lookup-promotion threshold: 3 or 5.
- Whether `MAX_NEW` total session size needs adjusting now that a third, independent quota (core-vocab daily intake) exists alongside the existing source-weighted allocation.
- Exact tag/column scheme for distinguishing pool membership and sprint phase on `vocab_items` rows (e.g. a `pool` or `cohort` column, vs. inferring from `source` + a join back to `words.level`).
- Whether to delete, relabel, or leave untouched the 640 dead `source='n5'` rows and their orphaned 559.
- Whether the weekly non-SRS Yoshi review surface needs new tracking (its own seen/due state) or is a stateless filtered view, as raised earlier and left open.
