// ═══════════════════════════════════════════════════════
// FEATURES-NOM  (Noticing-of-Mistakes detection)
// Rule-based cluster detection over transcript_turns.
// No API calls. Pure client-side JS.
//
// Entry point:  nomDetectClusters(sessionId) → Array<Cluster>
// Test harness: nomTestSession80()           → console report
//
// Cluster shape:
//   { startOffset, endOffset, turns, ruleType }
//   startOffset / endOffset: float seconds
//   turns: Array<{id, timestamp_offset, content}>
//   ruleType: one of the RULE_* constants below
//
// Depends on: window.db (Electron IPC db proxy)
// ═══════════════════════════════════════════════════════

// ── Rule type labels ────────────────────────────────────
const NOM_RULE = {
  MORPHOLOGICAL_VARIATION: 'morphological_variation',  // same stem, changing endings
  DENSE_REPETITION:        'dense_repetition',          // same token 4+ times in window
  PARTICLE_ALTERNATION:    'particle_alternation',      // same noun, different particle
  REPAIR_MARKER:           'repair_marker',             // explicit hesitation/repair words
  VOCAB_GAP:               'vocab_gap',                 // L1 word (German/English) before Japanese search
};

// ── Tuneable constants ──────────────────────────────────
const NOM_CFG = {
  // Morphological variation
  MORPH_MIN_VARIANTS:    3,     // minimum distinct endings to fire
  MORPH_WINDOW_S:       60,     // seconds to look back/forward for variants of same stem
  MORPH_MIN_STEM_LEN:    3,     // minimum stem length (chars, hiragana)

  // Dense repetition
  DENSE_MIN_COUNT:       4,     // occurrences of same token
  DENSE_WINDOW_S:       45,     // seconds window

  // Particle alternation
  PARTICLE_MIN_SWITCHES: 2,     // how many different particles on same noun
  PARTICLE_WINDOW_S:    30,

  // Vocab gap — L1 detection
  VOCAB_GAP_WINDOW_S:   90,     // window after L1 word to catch search sequence

  // Cluster merging
  MERGE_GAP_S:          20,     // two clusters within this gap → merged
};

// ── Repair marker list ──────────────────────────────────
// Explicit hesitation / repair words that signal a breakdown.
const NOM_REPAIR_MARKERS = [
  'なんで', 'ちょっと待ってください', 'すみません', '何ですか', 'もう一度',
  'えーと', 'えっと', 'あの', 'うーん', 'もう一回',
  'ごめんなさい', '分かりません', 'どういう意味', 'もう少し', 'ゆっくり',
];

// Japanese particles to track for alternation
const NOM_PARTICLES = ['に', 'で', 'を', 'が', 'は', 'へ', 'と', 'から', 'まで', 'より'];

// L1 word patterns — English words appearing in transcript for clarification.
// Whisper transcribes German phonetically into hiragana, so no German chars here.
const NOM_L1_PATTERN = /[a-zA-Z]{3,}/;

// Stoplist — high-frequency tokens that are normal conversation, not NoM signals.
// These are excluded from dense_repetition and morphological_variation checks.
const NOM_STOPLIST = new Set([
  'うん', 'はい', 'ええ', 'あ', 'え', 'そう', 'そうです', 'そうですね',
  'ね', 'よ', 'か', 'な', 'で', 'は', 'が', 'を', 'に', 'と',
  'OK', 'ok', 'yes', 'no', 'Yes', 'No', 'うんうん', 'ああ', 'あー', 'えー', 'まあ',
]);

// Hallucination scrub threshold — same rule as Orchestrator._scrubHallucinations.
// Any token appearing this many times or more: keep only first occurrence.
const NOM_HALLUCINATION_THRESHOLD = 5;

// ── Main entry point ────────────────────────────────────

/**
 * Detect NoM clusters in a session's transcript_turns.
 * @param {number} sessionId
 * @returns {Promise<Array<{startOffset, endOffset, turns, ruleType}>>}
 */
async function nomDetectClusters(sessionId) {
  const raw = await _nomLoadTurns(sessionId);
  if (!raw.length) {
    console.log('[NoM] No turns found for session', sessionId);
    return [];
  }
  const turns = _nomScrub(raw);
  console.log(`[NoM] Loaded ${raw.length} turns for session ${sessionId} (${raw.length - turns.length} scrubbed)`);

  const rawClusters = [
    ..._detectDenseRepetition(turns),
    ..._detectMorphologicalVariation(turns),
    ..._detectParticleAlternation(turns),
    ..._detectRepairMarkers(turns),
    ..._detectVocabGap(turns),
  ];

  const merged = _mergeClusters(rawClusters);
  console.log(`[NoM] ${rawClusters.length} raw clusters → ${merged.length} after merge`);
  return merged;
}

// ── In-memory hallucination scrubber ──────────────────
// Mirrors Orchestrator._scrubHallucinations but works on transcript_turns rows.
// Also strips stoplist tokens so they don't pollute dense_repetition.
function _nomScrub(turns) {
  const counts = {};
  for (const t of turns) counts[t.content] = (counts[t.content] || 0) + 1;
  const seen = new Set();
  const result = [];
  for (const t of turns) {
    if (NOM_STOPLIST.has(t.content)) continue;
    if (counts[t.content] >= NOM_HALLUCINATION_THRESHOLD) {
      if (seen.has(t.content)) continue;
      seen.add(t.content);
    }
    result.push(t);
  }
  return result;
}

// ── DB loader ───────────────────────────────────────────

async function _nomLoadTurns(sessionId) {
  try {
    const rows = await window.db.query(
      `SELECT id, CAST(timestamp_offset AS REAL) AS ts, content
       FROM transcript_turns
       WHERE session_id = ${Number(sessionId)}
       ORDER BY ts ASC`
    );
    return rows.map(r => ({
      id:      r.id,
      ts:      r.ts,         // float seconds
      content: (r.content || '').trim(),
    })).filter(r => r.content.length > 0);
  } catch (e) {
    console.error('[NoM] Failed to load turns:', e);
    return [];
  }
}

// ── Rule 1: Dense repetition ────────────────────────────
// Same surface token appears 4+ times within a sliding window.
// Tokenise by splitting on whitespace; normalise full-width chars.

function _detectDenseRepetition(turns) {
  const clusters = [];
  const W = NOM_CFG.DENSE_WINDOW_S;
  const MIN = NOM_CFG.DENSE_MIN_COUNT;

  // Collect all tokens with their turn index
  const tokens = []; // [{token, turnIdx, ts}]
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    for (const tok of _tokenise(t.content)) {
      if (tok.length >= 2) tokens.push({ token: tok, turnIdx: i, ts: t.ts });
    }
  }

  // For each unique token, find windows where it appears MIN+ times
  const byToken = {};
  for (const entry of tokens) {
    if (!byToken[entry.token]) byToken[entry.token] = [];
    byToken[entry.token].push(entry);
  }

  for (const [token, occurrences] of Object.entries(byToken)) {
    if (occurrences.length < MIN) continue;

    // Sliding window scan
    let i = 0;
    while (i < occurrences.length) {
      const windowStart = occurrences[i].ts;
      const windowEnd   = windowStart + W;
      const inWindow    = occurrences.filter(o => o.ts >= windowStart && o.ts <= windowEnd);
      if (inWindow.length >= MIN) {
        const turnIdxSet = new Set(inWindow.map(o => o.turnIdx));
        const clusterTurns = [...turnIdxSet].map(idx => turns[idx]);
        clusters.push(_makeCluster(clusterTurns, NOM_RULE.DENSE_REPETITION));
        // Advance past this window
        i = occurrences.findIndex(o => o.ts > windowEnd);
        if (i < 0) break;
      } else {
        i++;
      }
    }
  }

  return clusters;
}

// ── Rule 2: Morphological variation ─────────────────────
// Same stem with 3+ distinct endings within a time window.
// Approach: extract hiragana stems (longest common prefix of token pairs),
// group tokens sharing a stem, check variant count.

function _detectMorphologicalVariation(turns) {
  const clusters = [];
  const W   = NOM_CFG.MORPH_WINDOW_S;
  const MIN = NOM_CFG.MORPH_MIN_VARIANTS;
  const STEM_LEN = NOM_CFG.MORPH_MIN_STEM_LEN;

  // Collect all hiragana-dominant tokens with turn info
  const hiraganaTokens = [];
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    for (const tok of _tokenise(t.content)) {
      if (_isHiraganaDominant(tok) && tok.length > STEM_LEN) {
        hiraganaTokens.push({ token: tok, turnIdx: i, ts: t.ts });
      }
    }
  }

  // For each token, look for tokens within W seconds sharing a stem of length STEM_LEN
  // To avoid O(n²) explosion, bucket by first STEM_LEN chars
  const byStem = {};
  for (const entry of hiraganaTokens) {
    const stem = entry.token.slice(0, STEM_LEN);
    if (!byStem[stem]) byStem[stem] = [];
    byStem[stem].push(entry);
  }

  for (const [stem, group] of Object.entries(byStem)) {
    if (group.length < MIN) continue;

    // Sliding window: find time windows with MIN+ distinct endings
    for (let i = 0; i < group.length; i++) {
      const windowStart = group[i].ts;
      const windowEnd   = windowStart + W;
      const inWindow    = group.filter(e => e.ts >= windowStart && e.ts <= windowEnd);
      const distinct    = new Set(inWindow.map(e => e.token));
      if (distinct.size >= MIN) {
        const turnIdxSet = new Set(inWindow.map(e => e.turnIdx));
        const clusterTurns = [...turnIdxSet].map(idx => turns[idx]);
        clusters.push(_makeCluster(clusterTurns, NOM_RULE.MORPHOLOGICAL_VARIATION));
        // Skip past window
        i = group.findIndex(e => e.ts > windowEnd);
        if (i < 0) break;
        i--; // for-loop will increment
      }
    }
  }

  return clusters;
}

// ── Rule 3: Particle alternation ────────────────────────
// Same noun appearing with 2+ different particles within a window.
// Pattern: look for sequences [noun + particle] in turns.

function _detectParticleAlternation(turns) {
  const clusters = [];
  const W   = NOM_CFG.PARTICLE_WINDOW_S;
  const MIN = NOM_CFG.PARTICLE_MIN_SWITCHES;

  // Extract (noun, particle) pairs from each turn.
  // Simple heuristic: look for tokens followed immediately (in content) by a particle char.
  // Content like "映画館で" or "映画館 で" → noun=映画館, particle=で
  const nounParticlePairs = []; // [{noun, particle, turnIdx, ts}]

  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    const extracted = _extractNounParticlePairs(t.content);
    for (const pair of extracted) {
      nounParticlePairs.push({ ...pair, turnIdx: i, ts: t.ts });
    }
  }

  // Group by noun
  const byNoun = {};
  for (const p of nounParticlePairs) {
    if (!byNoun[p.noun]) byNoun[p.noun] = [];
    byNoun[p.noun].push(p);
  }

  for (const [noun, occurrences] of Object.entries(byNoun)) {
    if (occurrences.length < MIN) continue;

    // Sliding window
    for (let i = 0; i < occurrences.length; i++) {
      const windowStart = occurrences[i].ts;
      const windowEnd   = windowStart + W;
      const inWindow    = occurrences.filter(o => o.ts >= windowStart && o.ts <= windowEnd);
      const distinctParticles = new Set(inWindow.map(o => o.particle));
      if (distinctParticles.size >= MIN) {
        const turnIdxSet = new Set(inWindow.map(o => o.turnIdx));
        const clusterTurns = [...turnIdxSet].map(idx => turns[idx]);
        clusters.push(_makeCluster(clusterTurns, NOM_RULE.PARTICLE_ALTERNATION));
        i = occurrences.findIndex(o => o.ts > windowEnd);
        if (i < 0) break;
        i--;
      }
    }
  }

  return clusters;
}

// ── Rule 4: Repair markers ──────────────────────────────
// Turn containing any explicit repair/hesitation word.
// Each turn with a marker becomes its own single-turn cluster.
// Adjacent marker clusters within MERGE_GAP_S will be merged later.

function _detectRepairMarkers(turns) {
  const clusters = [];
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    const lower = t.content;
    if (NOM_REPAIR_MARKERS.some(m => lower.includes(m))) {
      // Include 1 turn before and after for context
      const contextTurns = turns.slice(Math.max(0, i - 1), Math.min(turns.length, i + 2));
      clusters.push(_makeCluster(contextTurns, NOM_RULE.REPAIR_MARKER));
    }
  }
  return clusters;
}

// ── Rule 5: Vocab gap (L1 intrusion) ───────────────────
// A token matching L1 pattern (latin chars ≥3) followed by
// Japanese search activity (repeated near-similar tokens) within window.

function _detectVocabGap(turns) {
  const clusters = [];
  const W = NOM_CFG.VOCAB_GAP_WINDOW_S;

  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    // Check if this turn contains an L1 (non-Japanese) word
    const words = t.content.split(/\s+/);
    const hasL1 = words.some(w => NOM_L1_PATTERN.test(w) && !_isRomajiNumber(w));
    if (!hasL1) continue;

    // Look forward for a cluster of Japanese search activity
    const windowEnd = t.ts + W;
    const forward = turns.slice(i + 1).filter(ft => ft.ts <= windowEnd);
    if (forward.length < 2) continue;

    // Check if forward turns show search activity: multiple turns with overlapping hiragana content
    const forwardTokens = forward.flatMap(ft => _tokenise(ft.content).filter(_isHiraganaDominant));
    const uniqueForward = new Set(forwardTokens);

    // If there are fewer unique tokens than total (repetition) → likely searching
    if (forwardTokens.length >= 3 && uniqueForward.size < forwardTokens.length) {
      const clusterTurns = [t, ...forward];
      clusters.push(_makeCluster(clusterTurns, NOM_RULE.VOCAB_GAP));
    }
  }

  return clusters;
}

// ── Cluster helpers ─────────────────────────────────────

function _makeCluster(turns, ruleType) {
  const sorted = [...turns].sort((a, b) => a.ts - b.ts);
  return {
    startOffset: sorted[0].ts,
    endOffset:   sorted[sorted.length - 1].ts,
    turns:       sorted.map(t => ({ id: t.id, timestamp_offset: t.ts, content: t.content })),
    ruleType,
  };
}

/**
 * Merge clusters that overlap or are within MERGE_GAP_S of each other.
 * Preserves all ruleTypes as an array on merged clusters.
 */
function _mergeClusters(clusters) {
  if (!clusters.length) return [];
  const GAP = NOM_CFG.MERGE_GAP_S;

  // Sort by start
  const sorted = [...clusters].sort((a, b) => a.startOffset - b.startOffset);

  const merged = [];
  let current = { ...sorted[0], ruleTypes: [sorted[0].ruleType] };

  for (let i = 1; i < sorted.length; i++) {
    const c = sorted[i];
    if (c.startOffset <= current.endOffset + GAP) {
      // Merge
      current.endOffset = Math.max(current.endOffset, c.endOffset);
      current.ruleTypes = [...new Set([...current.ruleTypes, c.ruleType])];
      // Union turns by id
      const seenIds = new Set(current.turns.map(t => t.id));
      for (const t of c.turns) {
        if (!seenIds.has(t.id)) { current.turns.push(t); seenIds.add(t.id); }
      }
      current.turns.sort((a, b) => a.timestamp_offset - b.timestamp_offset);
    } else {
      // Finalise current and start new
      current.ruleType = current.ruleTypes.length === 1
        ? current.ruleTypes[0]
        : current.ruleTypes.join('+');
      merged.push(current);
      current = { ...c, ruleTypes: [c.ruleType] };
    }
  }
  current.ruleType = current.ruleTypes.length === 1
    ? current.ruleTypes[0]
    : current.ruleTypes.join('+');
  merged.push(current);

  return merged;
}

// ── Tokeniser ───────────────────────────────────────────

function _tokenise(text) {
  // Split on whitespace and punctuation; return non-empty tokens
  return text
    .split(/[\s、。！？「」『』（）・…\-\/]+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2);
}

function _isHiraganaDominant(token) {
  const hiragana = (token.match(/[\u3041-\u3096]/g) || []).length;
  return hiragana / token.length > 0.5;
}

function _isRomajiNumber(w) {
  // Ignore things like "N5", "JLPT", pure numbers
  return /^[A-Z]{1,5}\d+$|^\d+$/.test(w);
}

// Extract (noun, particle) pairs from a content string.
// Strategy: find any NOM_PARTICLES that appear directly after a CJK/hiragana sequence.
function _extractNounParticlePairs(content) {
  const pairs = [];
  // Match: CJK or hiragana sequence immediately followed by a particle
  const particleGroup = NOM_PARTICLES.join('|');
  const re = new RegExp(`([\\u3040-\\u9FFF\\u30A0-\\u30FF]{2,})(${particleGroup})(?=[^\\u3040-\\u9FFF\\u30A0-\\u30FF]|$)`, 'g');
  let m;
  while ((m = re.exec(content)) !== null) {
    pairs.push({ noun: m[1], particle: m[2] });
  }
  return pairs;
}

// ── Test harness ─────────────────────────────────────────
// Run in DevTools: nomTestSession80()
// Compares detected clusters against the 7 known episodes from the handoff doc.

async function nomTestSession80() {
  // Find session 80 (the one cleaned manually — 429 turns after scrub)
  let sessionId;
  try {
    const rows = await window.db.query(
      `SELECT id, date, source FROM lesson_sessions ORDER BY id DESC LIMIT 20`
    );
    console.table(rows);
    // Session 80 is the largest cleaned recording session
    const rec = rows.find(r => r.source === 'recording');
    if (!rec) { console.warn('[NoM test] No recording sessions found'); return; }
    sessionId = rec.id;
    console.log('[NoM test] Using session id', sessionId, '— date', rec.date);
  } catch (e) {
    console.error('[NoM test] Could not query lesson_sessions:', e);
    return;
  }

  const clusters = await nomDetectClusters(sessionId);

  // Known episodes from handoff doc (seconds)
  const KNOWN = [
    { label: 'E1 話さなければなりません',   startS: 1179, endS: 1213, rule: NOM_RULE.MORPHOLOGICAL_VARIATION },
    { label: 'E2 やることをしなければ',     startS: 1733, endS: 1815, rule: NOM_RULE.MORPHOLOGICAL_VARIATION },
    { label: 'E3 部屋で遊ばなければ',        startS: 1887, endS: 1899, rule: NOM_RULE.MORPHOLOGICAL_VARIATION },
    { label: 'E4 映画館で/に particle',      startS: 1585, endS: 1599, rule: NOM_RULE.PARTICLE_ALTERNATION   },
    { label: 'E5 水は来なければなりません',  startS: 1999, endS: 2007, rule: NOM_RULE.MORPHOLOGICAL_VARIATION },
    { label: 'E6 食べ物を買わなければ',      startS: 2753, endS: 2820, rule: NOM_RULE.MORPHOLOGICAL_VARIATION },
    { label: 'E7 お人よし vocab gap',        startS: 2263, endS: 2337, rule: NOM_RULE.VOCAB_GAP              },
  ];

  console.log('\n=== NoM Test: Session 80 ===');
  console.log(`Total clusters detected: ${clusters.length}\n`);

  let hits = 0;
  for (const ep of KNOWN) {
    const match = clusters.find(c =>
      c.startOffset <= ep.endS + 30 && c.endOffset >= ep.startS - 30
    );
    if (match) {
      hits++;
      console.log(`✅  ${ep.label}`);
      console.log(`    Expected: ${ep.startS}–${ep.endS}s  |  Got: ${match.startOffset.toFixed(1)}–${match.endOffset.toFixed(1)}s  |  Rule: ${match.ruleType}`);
    } else {
      console.log(`❌  ${ep.label}`);
      console.log(`    Expected: ${ep.startS}–${ep.endS}s  |  No cluster found nearby`);
    }
  }

  console.log(`\nRecall: ${hits}/${KNOWN.length} known episodes covered`);
  console.log('\nAll clusters:');
  for (const c of clusters) {
    console.log(`  [${c.startOffset.toFixed(0)}–${c.endOffset.toFixed(0)}s] ${c.ruleType} (${c.turns.length} turns)`);
    // Show first 2 turns for context
    for (const t of c.turns.slice(0, 2)) {
      console.log(`    ${t.timestamp_offset.toFixed(1)}s: ${t.content.slice(0, 60)}`);
    }
  }

  return clusters;
}

// ── Grammar node id list (Genki I/II) ──────────────────
// Used in classification prompt so Claude picks a valid id.
// Keep in sync with grammar_nodes.json.
const NOM_NODE_IDS = [
  'desu','question_ka','particle_no_possession','word_order','kore_sore_are',
  'koko_soko_asoko','particle_mo','numbers','time_expressions','particle_wa',
  'particle_o','particle_ni_direction','particle_de_place','particle_de_means',
  'particle_ni_time','adjective_i','adjective_na','adverbs','te_form',
  'te_form_request','te_imasu','negative_te','motion_verbs','existence_aru_iru',
  'frequency_adverbs','counting','past_tense_masu','past_negative_masu',
  'short_forms_plain','short_form_past','short_form_negative','nominalization',
  'adjective_past','suki_kirai','want_to','potential_form','volitional_form',
  'conditional_tara','conditional_ba','giving_receiving','passive_form',
  'causative_form','causative_passive','honorific_language','humble_language',
  'kara_reason','node_because','temo_even_if','tari_tari','koto_ga_aru',
  'n_desu','ho_ga_ii','nakucha_ikemasen','desho','mae_ni','toki',
  'comparison','superlative','relative_clause','transitive_intransitive',
  'particle_de_place','particle_ga_subject',
];

// ── LLM cluster classification ───────────────────────────

/**
 * Classify raw clusters via LLM. Filters false positives, names grammar point.
 * @param {Array} clusters — output of nomDetectClusters()
 * @returns {Promise<Array>} — clusters with isNom, topic, severity, node_id added;
 *                             clusters where isNom=false are excluded
 */
async function nomClassifyClusters(clusters) {
  if (!clusters.length) return [];

  const nodeList = NOM_NODE_IDS.join(', ');
  const results = [];

  for (const cluster of clusters) {
    const turnLines = cluster.turns
      .slice(0, 12)  // cap at 12 turns per cluster — enough context, small prompt
      .map(t => `${Math.round(t.timestamp_offset)}s: ${t.content}`)
      .join('\n');

    const prompt =
`You are analysing a Japanese lesson transcript (single mixed-channel recording — both student and teacher on one mic, all turns labelled as one speaker). Identify whether this excerpt shows a genuine communication breakdown or repair episode where the student struggled.

Transcript excerpt (rule trigger: ${cluster.ruleType}):
${turnLines}

Available grammar node ids: ${nodeList}

Reply with JSON only, no explanation, no markdown:
{"isNom": boolean, "topic": "short English label for the sprint card", "severity": 1|2|3, "node_id": "best matching id from the list above or null if vocab/unknown"}

severity: 1=minor hesitation, 2=clear struggle, 3=repeated breakdown
If isNom is false, set topic to null, severity to 0, node_id to null.`;

    try {
      const data = await (App.claudeAPI || window.claudeAPI)({
        model: 'claude-sonnet-4-6',
        max_tokens: 120,
        messages: [{ role: 'user', content: prompt }],
        track: 'nom-classify',
      });

      const raw = (data.content?.[0]?.text || '').trim()
        .replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();

      let parsed;
      try { parsed = JSON.parse(raw); }
      catch(e) {
        console.warn('[NoM] JSON parse failed for cluster', cluster.startOffset, raw);
        continue;
      }

      if (!parsed.isNom) {
        console.log(`[NoM] ${cluster.startOffset.toFixed(0)}s — rejected by LLM`);
        continue;
      }

      // Validate node_id against known list
      if (parsed.node_id && !NOM_NODE_IDS.includes(parsed.node_id)) {
        console.warn(`[NoM] Unknown node_id "${parsed.node_id}" — clearing`);
        parsed.node_id = null;
      }

      results.push({
        ...cluster,
        isNom:    true,
        topic:    parsed.topic    || null,
        severity: parsed.severity || 1,
        node_id:  parsed.node_id  || null,
      });

      console.log(`[NoM] ${cluster.startOffset.toFixed(0)}s ✅ ${parsed.topic} (severity ${parsed.severity}, node: ${parsed.node_id})`);

    } catch(e) {
      console.error('[NoM] Classification call failed:', e.message);
    }
  }

  console.log(`[NoM] Classification: ${results.length}/${clusters.length} clusters confirmed as NoM`);
  return results;
}

// ── Score, rank, deduplicate ──────────────────────────────

/**
 * Score and rank classified clusters. Deduplicates by node_id.
 * Returns top N sprint suggestions.
 * @param {Array}  classified — output of nomClassifyClusters()
 * @param {number} topN       — how many to return (default 3)
 * @returns {Array<{topic, node_id, severity, episode_count, example_offset_ms, score}>}
 */
function nomRankSuggestions(classified, topN = 3) {
  if (!classified.length) return [];

  // Group by node_id (null node_ids each get their own bucket keyed by startOffset)
  const byNode = {};
  for (const c of classified) {
    const key = c.node_id || `_vocab_${c.startOffset}`;
    if (!byNode[key]) {
      byNode[key] = {
        node_id:           c.node_id,
        topic:             c.topic,
        severity:          c.severity,
        episode_count:     0,
        example_offset_ms: Math.round(c.startOffset * 1000),
        clusters:          [],
      };
    }
    const bucket = byNode[key];
    bucket.episode_count++;
    bucket.clusters.push(c);
    // Keep highest severity across episodes
    if (c.severity > bucket.severity) bucket.severity = c.severity;
    // Keep earliest offset as the example
    if (c.startOffset < bucket.example_offset_ms / 1000) {
      bucket.example_offset_ms = Math.round(c.startOffset * 1000);
    }
    // Keep the topic from the highest-severity cluster
    if (c.severity >= bucket.severity) bucket.topic = c.topic;
  }

  // Score: severity × 3 + episode_count × 2
  // Weighting: severity matters more than count, but count breaks ties
  const scored = Object.values(byNode).map(b => ({
    ...b,
    score: b.severity * 3 + b.episode_count * 2,
  }));

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  // Return top N, dropping internal clusters array
  return scored.slice(0, topN).map(({ clusters: _c, ...rest }) => rest);
}

// ── Cache writer ─────────────────────────────────────────

const NOM_CACHE_KEY = 'nom_suggestions';

/**
 * Run full NoM pipeline for a session and cache the ranked suggestions.
 * Triggered on demand ("Analyse last lesson" button in 集中 panel).
 * @param {number} sessionId
 */
async function nomRunAndCache(sessionId) {
  const statusEl = document.getElementById('nomAnalyseStatus');
  function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }

  try {
    setStatus('Detecting clusters…');
    const clusters = await nomDetectClusters(sessionId);
    if (!clusters.length) {
      setStatus('No breakdown clusters found in this session.');
      return [];
    }

    setStatus(`Classifying ${clusters.length} clusters…`);
    const classified = await nomClassifyClusters(clusters);
    if (!classified.length) {
      setStatus('No confirmed NoM episodes after classification.');
      return [];
    }

    const suggestions = nomRankSuggestions(classified);

    // note_confirmed: check if node_id appears in extracted_grammar of linked whatsapp session
    try {
      const _linked = await window.db.query(
        `SELECT ls_wa.extracted_grammar FROM lesson_sessions ls_rec
         JOIN lesson_sessions ls_wa ON ls_rec.linked_session_id = ls_wa.id
         WHERE ls_rec.id = ? AND ls_wa.extracted_grammar IS NOT NULL LIMIT 1`,
        [sessionId]
      );
      if (_linked && _linked[0]) {
        const _waNodes = new Set(JSON.parse(_linked[0].extracted_grammar || '[]'));
        for (const s of suggestions) {
          s.note_confirmed = !!(s.node_id && _waNodes.has(s.node_id));
        }
      }
    } catch(e) { console.warn('[NoM] note_confirmed lookup failed:', e.message); }

    // Persist to kv_store
    await window.kvAPI.set(NOM_CACHE_KEY, JSON.stringify({
      sessionId,
      date: new Date().toISOString().slice(0, 10),
      suggestions,
    }));

    setStatus('');
    nomRenderSuggestions();
    return suggestions;
  } catch(e) {
    console.error('[NoM] nomRunAndCache failed:', e);
    setStatus('Analysis failed: ' + e.message);
    return [];
  }
}

// ── UI renderer ─────────────────────────────────────────

/**
 * Render NoM suggestion cards in the 集中 setup panel.
 * Reads from kv_store cache — no API calls.
 * Called from shuchuOnOpen and after nomRunAndCache completes.
 */
async function nomRenderSuggestions() {
  const container = document.getElementById('nomSuggestionsWrap');
  if (!container) return;

  // Load from cache
  let cached;
  try {
    const raw = await window.kvAPI.get(NOM_CACHE_KEY);
    cached = raw ? JSON.parse(raw) : null;
  } catch(e) {
    console.warn('[NoM] Could not load suggestions cache:', e);
    return;
  }

  if (!cached || !cached.suggestions || !cached.suggestions.length) {
    container.style.display = 'none';
    return;
  }

  const { suggestions, date, sessionId } = cached;
  container.style.display = '';
  container.innerHTML = '';

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px';
  header.innerHTML =
    `<span style="font-family:var(--ui);font-size:0.68rem;letter-spacing:0.1em;color:var(--ink-light)">${date}</span>`;
  container.appendChild(header);

  // Cards
  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-bottom:8px';

  for (const s of suggestions) {
    const card = document.createElement('div');
    card.style.cssText = [
      'padding:8px 14px',
      'background:var(--paper-dark)',
      'border:1px solid var(--border)',
      'border-left:3px solid var(--teal)',
      'border-radius:6px',
      'cursor:pointer',
      'display:flex',
      'align-items:center',
      'justify-content:space-between',
      'gap:12px',
      'transition:border-color 0.15s',
    ].join(';');

    card.onmouseenter = () => { card.style.borderLeftColor = 'var(--gold)'; };
    card.onmouseleave = () => { card.style.borderLeftColor = 'var(--teal)'; };

    // Severity dots
    const dots = '●'.repeat(s.severity) + '○'.repeat(3 - s.severity);
    const dotsColor = s.severity === 3 ? 'var(--red,#e05)' : s.severity === 2 ? 'var(--gold)' : 'var(--teal)';

    card.innerHTML =
      `<div style="flex:1;min-width:0">` +
        `<div style="font-family:var(--ui);font-size:0.9rem;color:var(--ink);margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.topic}</div>` +
        `<div style="font-family:var(--ui);font-size:0.68rem;color:var(--ink-light)">${s.episode_count} episode${s.episode_count !== 1 ? 's' : ''}${s.note_confirmed ? ' · <span style="color:var(--teal)">✓ Yoshi</span>' : ''}</div>` +
      `</div>` +
      `<div style="display:flex;align-items:center;gap:10px;flex-shrink:0">` +
        `<span style="font-family:monospace;font-size:0.82rem;color:${dotsColor};letter-spacing:1px">${dots}</span>` +
        `<button class="btn-action" style="font-size:0.78rem;padding:5px 10px;white-space:nowrap">Sprint →</button>` +
      `</div>`;

    // Click fills topic input and focuses Start button
    card.addEventListener('click', () => {
      const topicInput = document.getElementById('shuchuTopicInput');
      if (topicInput) {
        topicInput.value = s.topic;
        topicInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      const startBtn = document.getElementById('shuchuStartBtn');
      if (startBtn) startBtn.focus();
    });

    grid.appendChild(card);
  }

  container.appendChild(grid);

  // Divider
  const divider = document.createElement('div');
  divider.style.cssText = 'border-top:1px solid var(--border);margin-bottom:8px';
  container.appendChild(divider);
}

// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, { nomDetectClusters, nomClassifyClusters, nomRankSuggestions, nomRunAndCache, nomRenderSuggestions, nomTestSession80 });
} catch(e) { console.error('[NoM] App registry failed:', e); }
