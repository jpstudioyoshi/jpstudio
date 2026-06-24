# Video → Grammar Node Evidence Linking
## Design Spec

---

### Problem
The grammar coverage grid scores nodes from lesson transcripts, writing, and drills. Video transcripts contain dense real input but contribute nothing to node evidence today. A learner watches 16 minutes of Comprehensible Japanese — that exposure is invisible to the model.

### Goal
Tag transcript cues with grammar node IDs at load time. Surface those cues as example evidence in the coverage grid. Let a node with video hits show a ▶ button that jumps to the moment in context.

---

### The Threshold Problem

A naïve scan would tag は on every sentence, te-form on half of them, and ます on everything polite. The coverage grid would show every node as "seen" after one video.

**The signal we want is:** the cue *foregrounds* this grammar point — it's the structural feature, not incidental glue.

Three threshold mechanisms working together:

#### 1. Specificity filter
Some nodes are too broad to tag from surface patterns alone. Classify nodes into:
- **Taggable** — distinctive enough that a pattern match is meaningful: て-form requests (〜てください), conditionals (〜たら/〜ば), passive (〜られる), causative, volitional, potential, negative て-form, comparison (〜より), purpose (〜ために), etc.
- **Excluded** — too ubiquitous to carry signal: は (topic marker), が (subject marker), を, に (location/time), basic ます/です, plain present tense. These would need semantic context to tag reliably and would drown out real signal.

Store the exclusion list in `grammar_nodes.json` as a `"videoTag": false` flag per node.

#### 2. Pattern specificity score
For taggable nodes, patterns are not equal. Rank by how specific the match is:

| Specificity | Example | What it means |
|-------------|---------|---------------|
| High | `〜なければならない` | Near-certain — this construction has one job |
| High | `〜ようにしている` | Effortful habit — distinctive enough |
| Medium | `〜てしまった` | て-form + completion — could be incidental |
| Low | `〜て` alone | Too broad — only tag if it's the *only* predicate connective |

Only tag a cue if the match is medium or higher. Low-specificity patterns require corroboration (e.g. the cue is short enough that the grammar point is structurally central).

#### 3. Structural centrality heuristic
A grammar point is central if removing it would make the sentence ungrammatical or change its core meaning. Proxy: **cue length + match position**.

- Short cue (≤12 words) + match covers the main predicate → high confidence
- Long cue + match appears mid-clause → low confidence, skip
- Match is the final predicate of the sentence → elevated confidence (Japanese end-focus)

---

### Data Model

At transcript load time, run `vtTagCues(cues)`. For each cue, produce:

```js
cue._gramNodes = [
  { nodeId: 'te-request', confidence: 0.9, matchSpan: [8, 14] },
  // ...
]
```

Only store confidence ≥ 0.6.

Persist alongside transcript in `vtVideoHistory`:
```js
{
  name: 'comprehensible-japanese-ep12.mp4',
  transcript: [...cues],   // cues now include _gramNodes
  nodeIndex: {
    'te-request': [{ cueIdx: 4, t: 32.1 }, { cueIdx: 17, t: 95.4 }],
    'conditional-tara': [{ cueIdx: 9, t: 58.0 }],
    // ...
  }
}
```

`nodeIndex` is built as a reverse lookup at save time so the coverage grid doesn't need to scan all cues.

---

### Grammar Coverage Grid Integration

Nodes with video evidence get a ▶ indicator. Click → switch to video panel, load that video (or prompt re-select if blob URL expired), seek to timestamp, briefly highlight the cue line.

```
[ て-request    ←  85%  ▶ ]
```

The ▶ is only shown if:
- The video is in history (name known)
- At least one cue hit has confidence ≥ 0.7

The hit shown is the **most recent**, not the first — you want what you've been watching lately, not something from 3 months ago.

---

### Evidence Weight in GrammarModel

Video cue hits contribute to node score, but at lower weight than lesson or writing evidence:

| Source | Default weight |
|--------|----------------|
| Lesson transcript | 1.0 |
| Writing production | 0.9 |
| Video cue (confidence ≥ 0.8) | 0.3 |
| Video cue (confidence 0.6–0.8) | 0.15 |

Video evidence alone cannot push a node past **partial** (0.55). It's an exposure signal, not a production signal. It can tip an untouched node to weak/partial but mastery still requires production evidence.

---

### Implementation Stages

**Stage 1 — Node tagging (no API)**
- Build `vtTagCues(cues)` using regex patterns per taggable node
- Annotate cues with `_gramNodes` in memory
- Build `nodeIndex` and save alongside transcript history
- No UI changes yet

**Stage 2 — Coverage grid ▶ button**
- Add ▶ to nodes that have `nodeIndex` entries in any saved video
- Click handler: `vtJumpToNodeExample(nodeId)` — finds best hit, switches panel, seeks

**Stage 3 — GrammarModel integration**
- Feed video cue hits as evidence events (low weight)
- Show in node detail panel: "Seen in: comprehensible-japanese-ep12.mp4 at 0:32"

**Stage 4 — Retroactive scan (optional)**
- On progress panel load, rescan any saved transcripts that predate the tagging feature
- Batch job, runs once per transcript

---

### What to Exclude (and Why)

| Node | Why excluded |
|------|-------------|
| Topic は | Every sentence. No signal. |
| Subject が | Near-universal. |
| Object を | Same. |
| Polite ます/です | Registers whether polite speech is used, not that the learner "knows" it |
| Location に | Too many usages (location, time, direction, indirect object) to distinguish by pattern |
| Basic て-form (connective) | Appears in ~40% of sentences. Tag only specific て constructions (〜てください, 〜てしまう, 〜ている) |
| Plain present tense | Would tag everything. |

The exclusion list is the threshold's most important component. Better to miss 10 real hits than to flood every node with noise.

---

### Open Questions

1. **Retroactive scan cost** — scanning all saved transcripts on startup is cheap (pure regex, no API). But if a transcript has 800 cues and we have 20 videos, that's 16,000 pattern matches. Still fast, but should be deferred to idle time.

2. **NoM overlap** — NoM already detects grammar clusters in *lesson* transcripts. The video tagger is the same idea applied to comprehension input. They could share pattern definitions eventually.

3. **Multi-node cues** — a single sentence may legitimately hit 3 nodes (e.g. conditional + passive + te-request). All three get tagged if confidence is sufficient. The coverage grid shows the ▶ for all of them pointing to the same cue.

4. **Blob URL expiry** — video blob URLs don't survive app restart. The jump handler needs a graceful fallback: show the cue text in a popup with timestamp so you know what to look for when you re-load the file.
