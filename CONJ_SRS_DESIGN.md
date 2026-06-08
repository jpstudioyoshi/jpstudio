# Conjugation SRS — Design Note
*Drafted: 2026-06-08 session 30*

---

## Status
**Not yet built.** This document captures the agreed design for a future build phase.
Prerequisite: basic dictionary→all-forms drilling scoring well consistently.

---

## Problem

The current conjugation drill uses a static verb pool (hardcoded lists + DB top-up).
It drills dictionary form → target conjugation only.

Missing:
- No SRS tracking per transformation — all verbs get equal exposure regardless of performance
- No reverse direction — conjugated form → dictionary form
- No rule-level mastery model — getting て-form right on 10 verbs doesn't reduce て-form exposure on the others

---

## Proposed Architecture

### SRS unit
`(word, source_form, target_form)` — not the word alone, not the form alone, but the transformation.

Example items:
- (働く, dict, て-form) — dictionary → て-form
- (食べる, て-form, dict) — reverse: て-form → dictionary
- (帰る, dict, negative-plain) — dictionary → negative plain

Each item gets its own `srs_interval`, `srs_ease`, `srs_due`.

### Why this works at intermediate level
Paul's vocabulary pool is a closed class (~40-60 active verbs). The combinatorial
explosion (20 forms × 20 forms × verb classes) doesn't happen in practice.
Filtered to form-pairs seen in Yoshi data, the deck stays small and manageable.
As vocab_items grows, the deck grows naturally.

### Direction toggle
- **Forward** — dictionary form → target conjugation (production)
- **Reverse** — conjugated form → dictionary form (recognition of base)

The reverse direction is not "unnatural" at intermediate level — it surfaces the
same mapping the learner makes when listening (食べました → 食べる). Worth testing.

### Rule-level mastery
`grammar_mastery` table already exists in the schema.
When a transformation rule (e.g. godan て-form) is consistently correct across
multiple verbs, the rule confidence rises and remaining items for that rule
can be deprioritised.

This is a layer on top of item-level SM-2, not a replacement.

### Form pairs to include
Start with form-pairs that have appeared in Yoshi session data (both sides).
Avoids drilling forms the learner has never encountered in real communication.
Expand as Yoshi data accumulates.

### Adjectives
Same architecture applies to い-adj and な-adj.
Transformations: dict → past, dict → negative, dict → adverbial (〜く/〜に), etc.

---

## Implementation Phases

### Phase 1 (prerequisite — current build)
- ✅ DB-driven verb pool from vocab_items + words table
- ✅ Pool ordered by srs_ease (known words first)
- ⬜ Basic dictionary→all-forms scoring working well

### Phase 2 (build when Phase 1 stable)
- Add `conj_srs` table: id, word, source_form, target_form, srs_interval, srs_ease, srs_due, srs_graduated
- Populate from vocab_items verbs × Yoshi-attested form pairs
- SM-2 scoring per transformation item
- Direction toggle in drill UI

### Phase 3 (future)
- Rule-level mastery layer using grammar_mastery table
- Auto-deprioritise transformation rules that are consistently correct
- Expand form pairs beyond Yoshi-attested as mastery grows

---

## Research References

- **Suzuki & DeKeyser (2017)** — "Effects of distributed practice on the proceduralization of morphology" — spaced practice helps L2 morphology; effect stronger for simpler structures
- **Kim (2022)** — "The Effects of Spaced Practice on Second Language Learning: A Meta-Analysis" (Language Learning) — 48 experiments; cites Kasprowicz et al. (2019) on verb morphology distribution of practice
- **Nation (2014)** — does not address morphological paradigm drilling directly; treats grammar as acquired through meaning-focused input/output; recommends deliberate study for irregular/low-frequency forms only

Nation's position supports deferring this until basic forms are solid, then targeting gaps.

---

## Design Principles

- Item = transformation, not word
- Pool bounded by active vocabulary — stays small and personal
- Reverse direction worth testing despite "unnatural path" concern
- Rule mastery sits above item SRS, not below
- Start with Yoshi-attested form pairs only
- Hardcoded verb lists retire naturally as vocab_items grows
