// ═══════════════════════════════════════════════════════
// GRAMMAR MODEL
// Reads grammar_nodes.json and grammar_mastery SQLite table.
// Computes mastery scores, walks dependency tree.
// No DOM access. No UI calls. Read/write to grammar_mastery only.
//
// Load order: after core.js, before StudentModel.js
// ═══════════════════════════════════════════════════════

const GrammarModel = (() => {

  // ── State ──────────────────────────────────────────────
  let _nodes    = [];      // grammar_nodes.json contents
  let _mastery  = {};      // { node_id: { score, evidence, override, last_seen } }
  let _loaded   = false;
  let _loading  = null;    // promise guard against concurrent loads

  // ── Evidence source weights ────────────────────────────
  // How much each evidence type contributes to a mastery score.
  // Lesson evidence (from Yoshi) counts most — it's production under real conditions.
  const WEIGHTS = {
    lesson:           1.0,   // transcript / Yoshi session
    speaking:         0.8,   // app speaking sessions
    writing:          0.7,   // writing panel errors (inverse — errors reduce score)
    conjugation_drill:0.6,   // conjugation drill results
    counter_drill:    0.5,   // counter drill
    question:         0.3,   // question asked about this node — engagement signal, not mastery
    encountered:      0.2,   // heard/used in Yoshi session — recency signal, not mastery
    override:         1.0,   // manual override always wins
  };

  // Mastery threshold — score at or above this = mastered
  const MASTERY_THRESHOLD = 0.75;

  // ── Load ───────────────────────────────────────────────

  async function load() {
    if (_loading) return _loading;
    _loading = _doLoad();
    await _loading;
    _loading = null;
  }

  // Force reload of mastery data from DB (call after writes)
  async function reload() {
    await _loadMastery();
  }

  async function _doLoad() {
    // Load node definitions from JSON
    try {
      const resp = await fetch('./src/data/grammar_nodes.json');
      _nodes = await resp.json();
    } catch(e) {
      console.error('[GrammarModel] Could not load grammar_nodes.json:', e.message);
      _nodes = [];
    }

    // Load mastery from SQLite
    await _loadMastery();
    // Apply any user weight overrides from kvAPI
    await _loadWeightOverrides();
    _loaded = true;
    console.log(`[GrammarModel] Loaded ${_nodes.length} nodes`);
  }

  async function _loadMastery() {
    _mastery = {};
    if (!window.db) return;
    try {
      const rows = await window.db.query(
        'SELECT node_id, score, evidence_type, override, last_seen, notes FROM grammar_mastery',
        []
      );
      for (const row of (rows || [])) {
        if (!_mastery[row.node_id]) {
          _mastery[row.node_id] = { score: 0, evidence: [], override: false, last_seen: null };
        }
        const m = _mastery[row.node_id];
        if (row.override) {
          // Manual override takes precedence
          m.score    = row.score;
          m.override = true;
        } else {
          m.evidence.push({ type: row.evidence_type, score: row.score, last_seen: row.last_seen, notes: row.notes || '' });
        }
        if (!m.last_seen || row.last_seen > m.last_seen) m.last_seen = row.last_seen;
      }

      // Compute blended score for non-overridden nodes
      for (const id of Object.keys(_mastery)) {
        const m = _mastery[id];
        if (m.override) continue;
        if (!m.evidence.length) { m.score = 0; continue; }
        let totalWeight = 0, weightedSum = 0;
        for (const ev of m.evidence) {
          const w = WEIGHTS[ev.type] || 0.5;
          weightedSum += ev.score * w;
          totalWeight += w;
        }
        m.score = totalWeight > 0 ? weightedSum / totalWeight : 0;
      }
    } catch(e) {
      console.warn('[GrammarModel] Could not load mastery from DB:', e.message);
    }
  }

  // ── Weight overrides ────────────────────────────────────
  // User-adjustable weights stored in kvAPI key 'gramWeightsOverride'.
  // Only keys present in the override object are applied; others use defaults.
  const WEIGHTS_KEY = 'gramWeightsOverride';

  async function _loadWeightOverrides() {
    try {
      if (!window.kvAPI) return;
      const result = await window.kvAPI.get(WEIGHTS_KEY);
      if (!result) return;
      const overrides = JSON.parse(result);
      for (const [key, val] of Object.entries(overrides)) {
        if (key in WEIGHTS && typeof val === 'number' && val >= 0 && val <= 2) {
          WEIGHTS[key] = val;
        }
      }
    } catch(e) {}
  }

  async function saveWeightOverrides(overrides) {
    if (!window.kvAPI) return;
    // Validate and clamp
    const clean = {};
    for (const [key, val] of Object.entries(overrides)) {
      if (key in WEIGHTS) clean[key] = Math.max(0, Math.min(2, parseFloat(val) || 0));
    }
    await window.kvAPI.set(WEIGHTS_KEY, JSON.stringify(clean));
    // Apply immediately
    for (const [key, val] of Object.entries(clean)) WEIGHTS[key] = val;
    // Recompute blended scores with new weights
    await _loadMastery();
  }

  function getWeights() { return { ...WEIGHTS }; }

  // ── Write mastery evidence ─────────────────────────────

  async function recordEvidence(nodeId, evidenceType, score, notes = '') {
    if (!window.db) return;
    const now = new Date().toISOString();
    try {
      if (evidenceType === 'question') {
        // Questions use a count+timestamp stored in notes JSON.
        // Increment count on each call — the unique constraint means one row per node,
        // so we read the existing count before upserting.
        let count = 1;
        try {
          const existing = await window.db.query(
            "SELECT notes FROM grammar_mastery WHERE node_id=? AND evidence_type='question'",
            [nodeId]
          );
          if (existing?.length) {
            const prev = JSON.parse(existing[0].notes || '{}');
            count = (prev.count || 0) + 1;
          }
        } catch(e) {}
        const qNotes = JSON.stringify({ count, last_asked: now, text: notes.slice(0, 80) });
        await window.db.run(
          `INSERT INTO grammar_mastery (node_id, evidence_type, score, override, last_seen, notes)
           VALUES (?, 'question', ?, 0, ?, ?)
           ON CONFLICT(node_id, evidence_type) DO UPDATE SET
             score = excluded.score, last_seen = excluded.last_seen, notes = excluded.notes`,
          [nodeId, score, now, qNotes]
        );
      } else {
        await window.db.run(
          `INSERT INTO grammar_mastery (node_id, evidence_type, score, override, last_seen, notes)
           VALUES (?, ?, ?, 0, ?, ?)
           ON CONFLICT(node_id, evidence_type) DO UPDATE SET
             score = excluded.score, last_seen = excluded.last_seen, notes = excluded.notes`,
          [nodeId, evidenceType, score, now, notes]
        );
      }
      // Refresh mastery cache for this node
      await _loadMastery();
    } catch(e) {
      console.error('[GrammarModel] recordEvidence failed:', e.message);
    }
  }

  async function setOverride(nodeId, score, notes = 'manual') {
    if (!window.db) return;
    const now = new Date().toISOString();
    try {
      await window.db.run(
        `INSERT INTO grammar_mastery (node_id, evidence_type, score, override, last_seen, notes)
         VALUES (?, 'override', ?, 1, ?, ?)
         ON CONFLICT(node_id, evidence_type) DO UPDATE SET
           score = excluded.score, last_seen = excluded.last_seen, notes = excluded.notes`,
        [nodeId, score, now, notes]
      );
      await _loadMastery();
    } catch(e) {
      console.error('[GrammarModel] setOverride failed:', e.message);
    }
  }

  async function clearOverride(nodeId) {
    if (!window.db) return;
    try {
      await window.db.run(
        "DELETE FROM grammar_mastery WHERE node_id = ? AND evidence_type = 'override'",
        [nodeId]
      );
      await _loadMastery();
    } catch(e) {
      console.error('[GrammarModel] clearOverride failed:', e.message);
    }
  }

  // ── Query API ──────────────────────────────────────────

  function getScore(nodeId) {
    return _mastery[nodeId]?.score ?? 0;
  }

  function isMastered(nodeId) {
    // Manually overridden nodes are always considered mastered
    if (_mastery[nodeId]?.override) return true;
    return getScore(nodeId) >= MASTERY_THRESHOLD;
  }

  function isOverridden(nodeId) {
    return _mastery[nodeId]?.override ?? false;
  }

  function getNode(nodeId) {
    return _nodes.find(n => n.id === nodeId) ?? null;
  }

  function getAllNodes() {
    return _nodes;
  }

  // Prerequisites that aren't yet mastered
  function getWeakPrerequisites(nodeId) {
    const node = getNode(nodeId);
    if (!node) return [];
    return node.prerequisites.filter(prereqId => !isMastered(prereqId));
  }

  // Deepest unmastered prerequisite — where to actually focus
  function getDeepestGap(nodeId) {
    const weakPrereqs = getWeakPrerequisites(nodeId);
    if (!weakPrereqs.length) return null;
    // Recurse into each weak prereq to find the deepest
    let deepest = null;
    let deepestChapter = Infinity;
    for (const prereqId of weakPrereqs) {
      const deeper = getDeepestGap(prereqId);
      const candidate = deeper || getNode(prereqId);
      if (candidate && (candidate.genki ?? 99) < deepestChapter) {
        deepest = candidate;
        deepestChapter = candidate.genki ?? 99;
      }
    }
    return deepest || getNode(weakPrereqs[0]);
  }

  // Nodes whose prerequisites are all mastered but which aren't mastered themselves
  // = what the student is ready to learn next
  function getReadyToLearn() {
    return _nodes.filter(n =>
      !isMastered(n.id) &&
      n.prerequisites.every(p => isMastered(p))
    ).sort((a, b) => (a.genki ?? 99) - (b.genki ?? 99));
  }

  // Nodes with no mastery evidence at all — untouched
  function getUntouched() {
    return _nodes.filter(n => !_mastery[n.id] || _mastery[n.id].score === 0);
  }

  // Full status for every node — for the coverage view
  function getCoverageMap() {
    return _nodes.map(n => {
      const m = _mastery[n.id];
      const score = m?.score ?? 0;
      const status = m?.override        ? 'override'
                   : score === 0        ? 'untouched'
                   : score < 0.4        ? 'weak'
                   : score < MASTERY_THRESHOLD ? 'partial'
                   :                      'mastered';
      // Question count and last_asked are stored as JSON in the evidence notes field
      const qEv = m?.evidence?.find(e => e.type === 'question');
      let questionCount = 0, lastAsked = null;
      if (qEv) {
        try {
          const qData = JSON.parse(qEv.notes || '{}');
          questionCount = qData.count || 1;
          lastAsked     = qData.last_asked || qEv.last_seen || null;
        } catch(e) {
          questionCount = 1;
          lastAsked = qEv.last_seen || null;
        }
      }
      return {
        id:           n.id,
        label:        n.label,
        genki:        n.genki,
        group:        n.group,
        prerequisites: n.prerequisites,
        score:        Math.round(score * 100),
        rawScore:     score,
        status,
        last_seen:    m?.last_seen ?? null,
        override:     m?.override ?? false,
        weakPrereqs:  getWeakPrerequisites(n.id),
        questionCount,
        lastAsked,
      };
    });
  }

  // Compact summary for claudeSummary() in StudentModel
  function getSummaryForClaude() {
    if (!_loaded) return 'Grammar model not yet loaded.';
    const coverage = getCoverageMap();
    const mastered  = coverage.filter(n => n.status === 'mastered' || n.status === 'override');
    const partial   = coverage.filter(n => n.status === 'partial');
    const weak      = coverage.filter(n => n.status === 'weak');
    const untouched = coverage.filter(n => n.status === 'untouched');
    const ready     = getReadyToLearn();

    const lines = [
      `Mastered: ${mastered.map(n => n.label).join(', ') || 'none'}`,
      `Partial: ${partial.map(n => n.label).join(', ') || 'none'}`,
      `Weak (errors present): ${weak.map(n => n.label).join(', ') || 'none'}`,
      `Untouched (no evidence): ${untouched.slice(0,8).map(n => `${n.label} (Ch${n.genki})`).join(', ')}${untouched.length > 8 ? '…' : ''}`,
      `Ready to learn next: ${ready.slice(0,5).map(n => `${n.label} (Ch${n.genki})`).join(', ') || 'none'}`,
    ];

    // Surface deepest gap for nodes with errors
    const gapAlerts = weak.slice(0, 3).map(n => {
      const gap = getDeepestGap(n.id);
      return gap ? `${n.label} — prerequisite gap: ${gap.label} (Ch${gap.genki})` : null;
    }).filter(Boolean);

    if (gapAlerts.length) {
      lines.push('');
      lines.push('Prerequisite gaps (fix these first):');
      lines.push(...gapAlerts.map(g => '  ' + g));
    }

    return lines.join('\n');
  }

  // ── Public ─────────────────────────────────────────────

  return {
    load,
    reload,
    getAllNodes,
    getNode,
    getScore,
    isMastered,
    isOverridden,
    getWeakPrerequisites,
    getDeepestGap,
    getReadyToLearn,
    getUntouched,
    getCoverageMap,
    getSummaryForClaude,
    recordEvidence,
    setOverride,
    clearOverride,
    getWeights,
    saveWeightOverrides,
    get loaded() { return _loaded; },
    MASTERY_THRESHOLD,
  };

})();

console.log('[GrammarModel] loaded');

// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, { GrammarModel });
} catch(e) { console.error('[GrammarModel] App registry failed:', e); }
