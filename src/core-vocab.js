// ╔══════════════════════════════════════════════════════════════════════════════
// ║ core-vocab.js
// ║ Vocab flashcard drill, grammar points, translation/chat, RTK drill,
// ║ kanji corpus display, vocab corpus display, priority score.
// ║ Depends on: core-foundation.js (Storage, STORAGE_KEYS, state, claudeAPI,
// ║               kanjiCorpusGet, JLPT_WORDS, escHtml)
// ║             core-srs.js (DrillSRS)
// ╚══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// VOCAB
// ═══════════════════════════════════════════════════════
// ── Mastery check — SRS interval >= 14 days ─────────────────────────────────
function isWordMastered(cardIdx) {
  const card = state.vocab[cardIdx];
  if (!card) return false;
  const srsKey = card.jp || card.kana || String(cardIdx);
  try {
    const d = DrillSRS.get(STORAGE_KEYS.DRILL_SRS_WORDS, srsKey);
    return d && d.interval >= 14;
  } catch(e) { return false; }
}

let vocabIdx = 0;
let vocabFlipped = false;
let vcReadingVisible = false;
let vcDirection = 'jp_en'; // 'jp_en', 'en_jp', or 'speaking'
let _vcLastAutoSpoken = null; // dedupe auto-TTS on redundant re-renders
let vocabSession = [];      // indices in current session
let vocabSessionPos = 0;    // position within session
// Per-direction session state cache
const _vcDirState = {};
function _vcSaveDirState(dir) {
  _vcDirState[dir] = { session: [...vocabSession], idx: vocabIdx, pos: vocabSessionPos, items: state.vocabItems ? [...state.vocabItems] : [], known: Object.assign({}, _sessionKnown) };
}
function _vcRestoreDirState(dir) {
  if (_vcDirState[dir] && _vcDirState[dir].items.length) {
    vocabSession = [..._vcDirState[dir].session];
    vocabIdx = _vcDirState[dir].idx;
    vocabSessionPos = _vcDirState[dir].pos;
    state.vocabItems = [..._vcDirState[dir].items];
    Object.keys(_sessionKnown).forEach(k => delete _sessionKnown[k]);
    Object.assign(_sessionKnown, _vcDirState[dir].known || {});
    return true;
  }
  return false;
}
let _vcWeights = {};
let _vcThresholds = { session_size_jp_en: 100, session_size_en_jp: 100, session_size_speaking: 100 };
let _vcIntervals = {};

function toggleVcReading(e) {
  if (e) e.stopPropagation();
  vcReadingVisible = !vcReadingVisible;
  const el = document.getElementById('vcReading');
  const btn = document.getElementById('vcReadingToggle');
  if (el) el.style.display = vcReadingVisible ? 'block' : 'none';
  if (btn) btn.classList.toggle('active', vcReadingVisible);
}

let vcPitchVisible = true;
function vcTogglePitch() {
  vcPitchVisible = !vcPitchVisible;
  const el = document.getElementById('vcPitch');
  const btn = document.getElementById('vcPitchToggle');
  if (el) el.style.display = vcPitchVisible ? 'block' : 'none';
  if (btn) btn.classList.toggle('btn-active', vcPitchVisible);
}
// ── Load due cards from vocab_items into state.vocabItems ───────────────────
function vocabGetActiveSources() {
  const checked = [...document.querySelectorAll('.vocab-source-filter:checked')].map(el => el.value);
  // Default (no filter checked) = the SRS-eligible pool: core_vocab sprint
  // + lookup-promoted words (both already get graded SM-2 scoring per
  // markVocab's _srsAllowed gate, so both belong in the default deck —
  // otherwise lookup-promoted words could sit scored-but-unseen forever).
  // Yoshi/Writing/N5/Sprint checkboxes remain available to opt other
  // sources back in deliberately — see filter-stack UX, to be decided later.
  if (checked.length === 0) return ['core_vocab', 'lookup'];
  // expand 'yoshi' to both yoshi source types
  const sources = [];
  for (const c of checked) {
    if (c === 'yoshi') { sources.push('yoshi_phrases'); sources.push('yoshi_vocab'); }
    else sources.push(c);
  }
  // TEMP (2026-07): Yoshi words hard-excluded from the SRS drill regardless
  // of filter/weight, per explicit request — revert this filter to re-enable.
  return sources.filter(s => s !== 'yoshi_phrases' && s !== 'yoshi_vocab');
}

function vocabSourceFilterChanged() {
  const anyChecked = document.querySelectorAll('.vocab-source-filter:checked').length > 0;
  const banner = document.getElementById('vocabFocusBanner');
  if (banner) banner.style.display = anyChecked ? 'inline' : 'none';
  if (App.loadVocabItemsDeck) App.loadVocabItemsDeck(vcDirection);
}

function vocabFocusModeActive() {
  return document.querySelectorAll('.vocab-source-filter:checked').length > 0;
}

function vocabResetSourceFilters() {
  // Reset = back to the sprint-only baseline (no filters checked), not
  // "check everything". Matches vocabGetActiveSources' default of
  // core_vocab-only when no source filter is active.
  document.querySelectorAll('.vocab-source-filter').forEach(el => el.checked = false);
  const banner = document.getElementById('vocabFocusBanner');
  if (banner) banner.style.display = 'none';
  if (App.loadVocabItemsDeck) App.loadVocabItemsDeck(vcDirection);
}

function vocabResetPosFilters() {
  document.querySelectorAll('.vocab-pos-filter').forEach(el => el.checked = true);
  if (App.loadVocabItemsDeck) App.loadVocabItemsDeck(vcDirection);
}

function vocabGetActivePOS() {
  const all = [...document.querySelectorAll('.vocab-pos-filter')];
  const checked = all.filter(el => el.checked).map(el => el.value);
  // All checked or none checked = no filter
  if (checked.length === 0 || checked.length === all.length) return null;
  return checked;
}

function vocabPosFilterChanged() {
  if (App.loadVocabItemsDeck) App.loadVocabItemsDeck(vcDirection);
}

async function loadVocabItemsDeck(direction = 'jp_en', resetSession = true) {
  if (!window.db) return;
  if (resetSession) vocabSession = [];
  try {
    const sources = vocabGetActiveSources();
    const _localToday = new Date().toLocaleDateString('sv-SE');
    let sql = "SELECT v.*, s.srs_interval, s.srs_ease, s.srs_due, s.srs_graduated, s.last_reviewed FROM vocab_items v LEFT JOIN vocab_srs s ON s.vocab_id = v.id AND s.direction = ? WHERE (s.srs_due <= date('now','localtime') OR s.srs_due IS NULL) AND (s.last_reviewed IS NULL OR s.last_reviewed < ?) AND v.word NOT LIKE '〜%' AND (v.type IS NULL OR (v.type != 'grammar' AND v.type != 'excluded' AND v.type != 'phrase'))";
    const params = [direction, _localToday];
    if (sources && sources.length > 0) {
      sql += ' AND source IN (' + sources.map(() => '?').join(',') + ')';
      params.push(...sources);
    }
    const pos = vocabGetActivePOS();
    if (pos && pos.length > 0) {
      // 'phrase' maps to type='phrase', others map to pos column
      const posFilters = [];
      if (pos.includes('phrase')) posFilters.push("type = 'phrase'");
      const colPos = pos.filter(p => p !== 'phrase');
      if (colPos.length > 0) {
        posFilters.push('pos IN (' + colPos.map(() => '?').join(',') + ')');
        params.push(...colPos);
      }
      // If phrases not selected, exclude NULL pos items (they are untagged phrases)
      if (!pos.includes('phrase')) sql += " AND pos IS NOT NULL";
      if (posFilters.length > 0) sql += ' AND (' + posFilters.join(' OR ') + ')';
    }
    sql += ' ORDER BY entry_weight DESC, encounter_at DESC LIMIT 200';
    const rows = await window.db.query(sql, params);
    // Apply source weights from VOCAB_WEIGHTS settings
    let wt;
    if (_vcWeights && Object.keys(_vcWeights).length > 0) {
      wt = _vcWeights;
    } else {
      const wtRaw = await window.kvAPI.get('VOCAB_WEIGHTS').catch(() => null);
      wt = wtRaw ? JSON.parse(wtRaw) : {};
    }
    const sourceWeights = {
      yoshi_phrases: wt.yoshi_phrases ?? 1.0,
      yoshi_vocab:   wt.yoshi_vocab   ?? 1.0,
      writing:       wt.writing       ?? 0.9,
      lookup:        wt.lookup        ?? 0.6,
      core_vocab:    wt.core_vocab    ?? (wt.n5 ?? 0.3),
    };
    const dirWeights = wt.directions || { jp_en: 1.0, en_jp: 0.8, speaking: 0.9 };
    // Get active writing sittings for prep boost
    let prepWords = new Set();
    try {
      const sittings = await window.db.query(
        "SELECT saved_at FROM writing_sittings WHERE expires_at > datetime('now')",
        []
      );
      if (sittings && sittings.length > 0) {
        for (const s of sittings) {
          const savedAt = s.saved_at;
          const lookups = await window.db.query(
            "SELECT DISTINCT word FROM corpus_lookups WHERE looked_up_at BETWEEN datetime(?, '-2 hours') AND datetime(?, '+2 hours')",
            [savedAt, savedAt]
          );
          (lookups || []).forEach(l => { if (l.word && l.word.length > 1) prepWords.add(l.word); });
        }
      }
    } catch(e) { console.warn('[vocab] prep boost lookup failed:', e); }
    const weighted = (rows || []).map(r => {
      // Once a word has been reviewed (srs_due is set), its source no longer
      // drives priority — SRS due date does. Flatten to 0.35 so Yoshi words
      // don't permanently crowd out everything else after first review.
      const _isNew = r.srs_due == null;
      const _base  = _isNew
        ? (r.entry_weight || 1.0) * (sourceWeights[r.source] || 0.5)
        : 0.35;
      return {
        ...r,
        _isNew,
        _effectiveWeight: _base * (dirWeights[direction] || 1.0) * (prepWords.has(r.word) ? 1.5 : 1.0)
      };
    });
    weighted.sort((a, b) => b._effectiveWeight - a._effectiveWeight);
    state.vocabItems = weighted.slice(0, 200);
    vocabIdx = state.vocabItems[0]?.id ?? (state.vocabItems[0] ? 0 : -1);
    _dataLoaded = true;
    renderVocab();
  } catch (e) {
    console.warn('[vocab] loadVocabItemsDeck error', e);
    state.vocabItems = [];
    _dataLoaded = true;
  }
}

function startNewSession() {
  if (!_dataLoaded || !state.vocabItems || !state.vocabItems.length) return;
  if (!state.vocabKnownSessions) state.vocabKnownSessions = {};
  const _sizeKey = vcDirection === 'en_jp' ? 'session_size_en_jp' : vcDirection === 'speaking' ? 'session_size_speaking' : 'session_size_jp_en';
  const size = _vcThresholds[_sizeKey] || 20;

  // Cap new (never-reviewed) words per session to avoid flooding when a new
  // Yoshi lesson arrives. Reviewed words fill most of the session; new words
  // are capped at MAX_NEW regardless of source weight.
  // core_vocab (the N5/N4 sprint pool) gets its own separate cap so it is
  // additive alongside Yoshi/other new words, not competing with them for
  // the same slots — matches coreVocabDailyIntake's default of 12/day.
  const MAX_NEW_YOSHI = 8;  // cap new yoshi_vocab/yoshi_phrases per session
  const MAX_NEW_OTHER = 7;  // cap new non-Yoshi, non-core-vocab words per session
  const MAX_NEW_CORE  = 12; // cap new core_vocab (sprint pool) words per session
  const newYoshi = [], newOther = [], newCore = [], dueIdx = [];
  state.vocabItems.forEach((r, i) => {
    if (!r._isNew) { dueIdx.push(i); return; }
    if (r.source === 'yoshi_vocab' || r.source === 'yoshi_phrases') newYoshi.push(i);
    else if (r.source === 'core_vocab') newCore.push(i);
    else newOther.push(i);
  });
  const combined = [...dueIdx, ...newYoshi.slice(0, MAX_NEW_YOSHI), ...newOther.slice(0, MAX_NEW_OTHER), ...newCore.slice(0, MAX_NEW_CORE)];
  combined.sort((a, b) => (state.vocabItems[b]._effectiveWeight || 0) - (state.vocabItems[a]._effectiveWeight || 0));
  const pool = combined.slice(0, size);
  vocabSession    = pool;
  vocabSessionPos = 0;
  vocabIdx        = vocabSession[0] ?? 0;

  const statusEl = document.getElementById('sessionStatus');
  if (statusEl) statusEl.textContent = pool.length
    ? `Session: ${pool.length} words`
    : 'No words due — come back tomorrow';
  renderVocab();
}

function getSessionDeck() {
  return vocabSession.filter(i => !_sessionKnown[i]);
}

const _sessionKnown = {};  // tracks which cards were marked known THIS session

function markVocab(v) {
  if (!vocabSession.length) return;
  window._vocabDrillUsedToday = true;
  try { if (typeof renderFourStrandRecency === 'function') renderFourStrandRecency(); } catch(e) {}
  const card   = state.vocabItems?.[vocabIdx];
  if (!card) return;
  const id     = card.id;
  const word   = card.word || '';
  const srsKey = id != null ? String(id) : word;

  const curInterval  = card.srs_interval || 1;
  const curEase      = card.srs_ease || 2.5;
  const curGraduated = card.srs_graduated || 0;

  const _focusMode = vocabFocusModeActive();
  // SRS scheduling is reserved for the deliberately-curated pool: the core
  // N5/N4 sprint and lookup-promoted words (words that crossed the 3-day/
  // 5-total threshold, so genuinely recurring need). Yoshi and writing
  // vocabulary are exposure material, browsed without graded scheduling —
  // this applies always, not just when a source filter is manually active.
  const _srsAllowed = card.source === 'core_vocab' || card.source === 'lookup';

  if (v === 'know') {
    _sessionKnown[vocabIdx] = true;
    if (!_focusMode && _srsAllowed && window.db && id != null) {
      const newGraduated = 1;
      const newEase      = curGraduated === 0 ? curEase : Math.min(4.0, curEase + 0.1);
      // First-ever successful review stays at exactly 1 day (standard SM-2 —
      // the ease multiplier only applies from the SECOND review onward).
      const newInterval  = curGraduated === 0 ? 1 : Math.max(1, Math.floor(curInterval * curEase));
      window.db.run(
        `INSERT INTO vocab_srs (vocab_id, direction, srs_graduated, srs_ease, srs_interval, srs_due, last_reviewed)
         VALUES (?, ?, ?, ?, ?, date('now', '+' || ? || ' days'), datetime('now'))
         ON CONFLICT(vocab_id, direction) DO UPDATE SET srs_graduated = excluded.srs_graduated, srs_ease = excluded.srs_ease, srs_interval = excluded.srs_interval, srs_due = excluded.srs_due, last_reviewed = excluded.last_reviewed`,
        [id, vcDirection, newGraduated, newEase, newInterval, newInterval]
      ).catch(() => {});
    }

  } else if (v === 'gotit') {
    _sessionKnown[vocabIdx] = true;
    if (!_focusMode && _srsAllowed && window.db && id != null) {
      const newGraduated = Math.max(curGraduated, 1);
      const newEase      = Math.max(1.3, curEase - 0.10);
      const newInterval  = curGraduated === 0 ? 1 : Math.max(1, Math.floor(curInterval * newEase));
      window.db.run(
        `INSERT INTO vocab_srs (vocab_id, direction, srs_graduated, srs_ease, srs_interval, srs_due, last_reviewed)
         VALUES (?, ?, ?, ?, ?, date('now', '+' || ? || ' days'), datetime('now'))
         ON CONFLICT(vocab_id, direction) DO UPDATE SET srs_graduated = excluded.srs_graduated, srs_interval = excluded.srs_interval, srs_due = excluded.srs_due, last_reviewed = excluded.last_reviewed`,
        [id, vcDirection, newGraduated, curEase, newInterval, newInterval]
      ).catch(() => {});
    }

  } else {
    // 'again' — schedule for tomorrow (SRS mode) or just move on (focus mode)
    _sessionKnown[vocabIdx] = true;
    state.vocabProgress[vocabIdx] = 'again';
    if (!_focusMode && _srsAllowed && window.db && id != null) {
      const newEase = Math.max(1.3, curEase - 0.15);
      window.db.run(
        `INSERT INTO vocab_srs (vocab_id, direction, srs_graduated, srs_ease, srs_interval, srs_due, last_reviewed)
         VALUES (?, ?, ?, ?, 1, date('now', '+1 day'), datetime('now'))
         ON CONFLICT(vocab_id, direction) DO UPDATE SET srs_ease = excluded.srs_ease, srs_interval = excluded.srs_interval, srs_due = excluded.srs_due, last_reviewed = excluded.last_reviewed`,
        [id, vcDirection, curGraduated, newEase]
      ).catch(() => {});
    }
  }
  if (typeof window !== 'undefined' && window.db) {
    const _ts = new Date().toISOString();
    const _result = v === 'again' ? 'again' : v === 'gotit' ? 'gotit' : 'know';
    const _responseMs = _vcCardShownAt ? (Date.now() - _vcCardShownAt) : null;
    window.db.run(
      'INSERT INTO drill_results (created_at, drill_type, item_key, correct, response_ms) VALUES (?,?,?,?,?)',
      [_ts, 'words', srsKey, v !== 'again' ? 1 : 0, _responseMs]
    ).catch(() => {});
    window.db.run(
      'INSERT INTO learning_events (created_at, panel, event_type, payload) VALUES (?,?,?,?)',
      [_ts, 'words', 'drill:answer', JSON.stringify({ key: srsKey, word: word, reading: card.reading || '', result: _result })]
    ).catch(() => {});
  try { (App.StudentModel || window.StudentModel)?.invalidate(); } catch(e) {}
  try { (App.AppEvents || window.AppEvents)?.emit(AppEvents.DRILL_ANSWER, { panel: 'words', key: srsKey, word: word, result: _result }); } catch(e) {}
  }

  saveState();

  // Advance to next card in session
  const deck = getSessionDeck();
  if (deck.length === 0) {
    vocabSession = [];
    renderVocab();
    return;
  }
  // advance normally — deck is already rebuilt without current card
  // so deck[pos] is the next card; fall back to deck[0] if at end
  const pos = deck.indexOf(vocabIdx);
  if (pos === -1) {
    // card was just marked known — stay at same position in new deck
    const prevPos = vocabSession.indexOf(vocabIdx);
    const nextInSession = vocabSession.slice(prevPos + 1).find(i => !_sessionKnown[i]);
    vocabIdx = nextInSession ?? deck[0];
  } else {
    vocabIdx = deck[pos] ?? deck[0];
  }
  renderVocab();
}


function renderVocab() {
  _vcCardShownAt = Date.now();
  const vocabCardEl   = document.getElementById('vocabCard');
  const vocabCounterEl= document.getElementById('vocabCounter');
  const deckStatusEl  = document.getElementById('vocabDeckStatus');
  const resetBtnEl    = document.getElementById('vocabResetBtn');
  const statusEl      = document.getElementById('sessionStatus');
  if (!vocabCardEl || !vocabCounterEl || !deckStatusEl || !resetBtnEl) return;

  const cards = state.vocabItems || [];

  if (!cards.length) {
    const vcJp = document.getElementById('vcJp');
    const vcEn = document.getElementById('vcEn');
    const vcPs = document.getElementById('vcPos');
    if (vcJp) vcJp.textContent = _dataLoaded ? 'No words due' : 'Loading…';
    if (vcEn) vcEn.textContent = _dataLoaded ? 'Come back tomorrow' : '';
    if (vcPs) vcPs.textContent = '';
    vocabCounterEl.textContent = _dataLoaded ? 'No words due' : '';
    deckStatusEl.textContent = '';
    ;
    renderVocabList();
    return;
  }

  if (!vocabSession.length) {
    if (!_dataLoaded) return;
    const hasSession = Object.keys(_sessionKnown).length > 0;
    if (hasSession) {
      const vcJp = document.getElementById('vcJp');
      const vcRd = document.getElementById('vcReading');
      const vcEn = document.getElementById('vcEn');
      const vcPs = document.getElementById('vcPos');
      if (vcJp) vcJp.textContent = '🎉';
      if (vcRd) vcRd.style.display = 'none';
      if (vcEn) vcEn.textContent = 'Session complete!';
      if (vcPs) vcPs.textContent = '';
      vocabCardEl.classList.remove('flipped');
      _vcSessionComplete = true;
      vocabCounterEl.textContent = 'All session words known';
      if (statusEl) statusEl.textContent = 'Session done — tap card to restart';
      ;
      deckStatusEl.textContent = '';
      renderVocabList();
      return;
    } else {
      startNewSession();
      return;
    }
  }

  const deck = getSessionDeck();
  if (!deck.length) {
    const vcJp = document.getElementById('vcJp');
    const vcRd = document.getElementById('vcReading');
    const vcEn = document.getElementById('vcEn');
    const vcPs = document.getElementById('vcPos');
    if (vcJp) vcJp.textContent = '🎉';
    if (vcRd) vcRd.style.display = 'none';
    if (vcEn) vcEn.textContent = 'Session complete!';
    if (vcPs) vcPs.textContent = '';
    vocabCardEl.classList.remove('flipped');
    _vcSessionComplete = true;
    vocabCounterEl.textContent = 'All session words known';
    if (statusEl) statusEl.textContent = 'Session done — tap card to restart';
    deckStatusEl.textContent = '';
    ;
    renderVocabList();
    return;
  }

  if (!deck.includes(vocabIdx)) vocabIdx = deck[0];

  vocabFlipped = false;
  const hintEl  = document.getElementById('vcHint');
  const hintBtn = document.getElementById('vcHintToggle');
  if (hintEl) hintEl.style.display = 'none';
  if (hintBtn) hintBtn.textContent = '▸ Reading hint';

  const card     = cards[vocabIdx];
  const vcJp     = document.getElementById('vcJp');
  const readingEl= document.getElementById('vcReading');
  const vcEn     = document.getElementById('vcEn');
  const vcPos    = document.getElementById('vcPos');
  const _vcBR    = document.getElementById('vcBackReading');

  const word    = card.word || '';
  const reading = card.reading || '';
  const meaning = card.meaning || '';
  const example = card.example || '';
  const source  = card.source || '';
  const encDate = (card.encounter_at || '').split('T')[0] || '';
  const _fmtSource = (src, dt) => {
    if (!src) return '';
    const isYoshi = src === 'yoshi_phrases' || src === 'yoshi_vocab';
    if (isYoshi && dt) {
      const d = new Date(dt.replace(' ', 'T'));
      const mon = d.toLocaleString('en-GB', { month: 'long' });
      const yr = d.getFullYear();
      return 'Yoshi · ' + mon + ' ' + yr;
    }
    const labels = { writing: 'Writing', lookup: 'Lookup', n5: 'N5' };
    return labels[src] || src;
  };
  const sourceTag = _fmtSource(source, encDate);

  if (hintEl) hintEl.textContent = reading;
  // Direction-aware card rendering
  const isReverse = (vcDirection === 'en_jp');
  if (vcJp) {
    const frontText = isReverse ? meaning : word;
    vcJp.textContent = frontText;
    vcJp.style.color = isReverse ? 'var(--ink)' : '';
    // Scale font size based on character count to prevent overflow
    const len = frontText.length;
    vcJp.style.fontSize = len <= 6 ? '2.5rem' : len <= 10 ? '2rem' : len <= 16 ? '1.5rem' : '1.1rem';
  }
  if (readingEl) {
    readingEl.textContent = reading;
    readingEl.style.display = (!isReverse && reading && vcReadingVisible) ? 'block' : 'none';
  }
  if (vcEn) {
    if (isReverse) {
      vcEn.innerHTML = escHtml(word) +
        (reading ? '<div style="margin-top:4px;font-family:var(--jp);font-size:1rem;color:var(--teal)">' + escHtml(reading) + '</div>' : '') +
        (example ? '<div style="margin-top:8px;font-family:var(--jp);font-size:0.85rem;color:var(--ink-light);line-height:1.4">' + escHtml(example) + '</div>' : '');
    } else {
      vcEn.style.textAlign = 'center';
      const _meanings = meaning.split('/').map(m => escHtml(m.trim())).join('<br>');
      vcEn.innerHTML = _meanings +
        (example ? '<div style="margin-top:8px;font-family:var(--jp);font-size:0.85rem;color:var(--ink-light);line-height:1.4;text-align:center">' + escHtml(example) + '</div>' : '');
    }
  }
  if (_vcBR) _vcBR.textContent = isReverse ? '' : reading;
  if (vcPos) vcPos.textContent = sourceTag;

  const vcPitchEl = document.getElementById('vcPitch');
  if (vcPitchEl) {
    if (window.pitchAPI && reading) {
      vcPitchEl.innerHTML = '';
      const safeWord = word.replace(/'/g, "\\'");
      window.pitchAPI.lookup(word, reading).then(function(pitchStr) {
        if (pitchStr != null) {
          vcPitchEl.innerHTML =
            '<div title="Hover to hear" style="cursor:pointer;display:block;margin:0 auto" ' +
            'onmouseenter="this._t=setTimeout(()=>jpSpeak(\'' + safeWord + '\',0.85),600)" ' +
            'onmouseleave="clearTimeout(this._t)">' + renderPitchCurve(reading, pitchStr) + '</div>';
        }
      });
    } else {
      vcPitchEl.innerHTML = '';
    }
  }

  vocabCardEl.classList.remove('flipped');
  // Auto-play TTS on every new card (dedupe redundant re-renders of same card)
  if (word && _vcLastAutoSpoken !== word && vcDirection !== 'en_jp') {
    _vcLastAutoSpoken = word;
    setTimeout(() => {
      if (typeof jpSpeak === 'function') jpSpeak(word, 0.85);
    }, 400);
  }

  const pos = deck.indexOf(vocabIdx);
  vocabCounterEl.textContent = `Card ${pos + 1} of ${deck.length} remaining in session`;
  deckStatusEl.textContent = '';
  ;

  if (statusEl) statusEl.textContent = `Session: ${deck.length} left of ${vocabSession.length}`;
  renderVocabList();
  // Reset text entry UI on new card
  const _typeInp = document.getElementById('vocabTypeInput');
  const _typeRes = document.getElementById('vocabTypeResult');
  const _typeNext = document.getElementById('vocabTypeNextBtn');
  if (_typeInp) { _typeInp.value = ''; if (_vcTextEntry) { _typeInp.focus(); kanaSetMode('vocabTypeInput', vcDirection === 'en_jp' ? 'hiragana' : 'romaji'); } }
  if (_typeRes) _typeRes.textContent = '';
  if (_typeNext) _typeNext.style.display = 'none';
}

function prevVocab() {
  const deck = getSessionDeck();
  if (!deck.length) return;
  const pos = deck.indexOf(vocabIdx);
  vocabIdx = deck[(pos - 1 + deck.length) % deck.length];
  renderVocab();
}
function nextVocab() {
  const deck = getSessionDeck();
  if (!deck.length) return;
  const pos = deck.indexOf(vocabIdx);
  vocabIdx = deck[(pos + 1) % deck.length];
  renderVocab();
}

let _vcSessionComplete = false;
function flipVocab() {
  if (_vcSessionComplete) { resetVocabDeck(); return; }
  vocabFlipped = !vocabFlipped;
  document.getElementById('vocabCard').classList.toggle('flipped', vocabFlipped);
  if (vocabFlipped) {
    const card = state.vocabItems?.[vocabIdx];
    if (card?.word && typeof jpSpeak === 'function') {
      const toSpeak = card.reading || card.word;
      jpSpeak(toSpeak, 0.85);
    }
  }
}

function toggleVcDirection() {
  const cycle = { jp_en: 'en_jp', en_jp: 'jp_en' };
  const labels = { jp_en: 'JP → EN', en_jp: 'EN → JP' };
  _vcSaveDirState(vcDirection);
  vcDirection = cycle[vcDirection] || 'jp_en';
  window.kvAPI.set('VOCAB_DIRECTION', vcDirection).catch(() => {});
  const btn = document.getElementById('vcDirectionBtn');
  if (btn) btn.textContent = labels[vcDirection];
  if (_vcRestoreDirState(vcDirection)) {
    renderVocab();
  } else {
    if (App.loadVocabItemsDeck) App.loadVocabItemsDeck(vcDirection, true);
  }
}
// Hide the current word from future sessions — sets type='excluded',
// which loadVocabItemsDeck already filters out (v.type != 'excluded').
// Reversible: no row is deleted, just tagged out of rotation. Useful for
// junk/incidental lookups that crossed the old promotion threshold before
// it was tightened, or anything not worth tracking in SRS.
async function hideVocabWord() {
  const card = state.vocabItems?.[vocabIdx];
  if (!card || card.id == null) return;
  if (!confirm('Hide "' + (card.word || '') + '" from future sessions? You can restore it later by editing its type in the database.')) return;
  try {
    await window.db.run('UPDATE vocab_items SET type = ? WHERE id = ?', ['excluded', card.id]);
    _sessionKnown[vocabIdx] = true;
    const deck = getSessionDeck();
    if (!deck.length) { vocabSession = []; }
    else {
      const pos = deck.indexOf(vocabIdx);
      vocabIdx = deck[pos] ?? deck[0];
    }
    renderVocab();
  } catch(e) { console.warn('[vocab] hideVocabWord error', e); }
}

function resetVocabDeck() {
  _vcSessionComplete = false;
  state.vocabProgress = {};
  state.vocabKnownSessions = {};
  saveState();
  vocabSession = [];
  Object.keys(_sessionKnown).forEach(k => delete _sessionKnown[k]);
  loadVocabItemsDeck(vcDirection, true);
}

// ── Core-vocab triage — one-off bulk pass over untouched core_vocab words ────
// Not a normal drill session: bypasses MAX_NEW_CORE entirely so the whole
// backlog can be sorted in one sitting. "Already know" seeds both directions
// straight to a 14-day interval; "don't know" is a no-op — the word falls
// back into the normal 12/session onboarding flow untouched.
let _triageQueue = [];
let _triageIdx = 0;
let _triageFlipped = false;

function _triageKeyHandler(e) {
  if (!document.getElementById('triageOverlay')) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.code === 'Space') { e.preventDefault(); if (!_triageFlipped) _triageFlip(); }
  else if (e.key === '1' && _triageFlipped) { e.preventDefault(); _triageMark(false); }
  else if (e.key === '2' && _triageFlipped) { e.preventDefault(); _triageMark(true); }
}

function _triageClose() {
  document.removeEventListener('keydown', _triageKeyHandler);
  const el = document.getElementById('triageOverlay');
  if (el) el.remove();
}

async function triageStart(level = 'N5') {
  if (!window.db) return;
  const rows = await window.db.query(
    `SELECT v.id, v.word, v.reading, v.meaning, w.frequency
     FROM vocab_items v JOIN words w ON w.id = v.word_id
     WHERE w.level = ?
       AND v.id NOT IN (SELECT vocab_id FROM vocab_srs WHERE direction = ?)
     ORDER BY w.frequency IS NULL, w.frequency ASC, v.id ASC`,
    [level, vcDirection]
  );
  _triageQueue = rows || [];
  _triageIdx = 0;
  if (!_triageQueue.length) { alert('No untriaged ' + level + ' words.'); return; }
  document.addEventListener('keydown', _triageKeyHandler);
  _triageRenderOverlay();
}

function _triageRenderOverlay() {
  let overlay = document.getElementById('triageOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'triageOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999';
    document.body.appendChild(overlay);
  }
  if (_triageIdx >= _triageQueue.length) {
    overlay.innerHTML = '<div style="background:var(--paper);border-radius:12px;padding:32px;text-align:center;font-family:var(--ui)">'
      + '<div style="font-size:1.5rem;margin-bottom:8px">\u2713 Triage complete</div>'
      + '<button class="btn-action" onclick="_triageClose()">Close</button></div>';
    return;
  }
  const w = _triageQueue[_triageIdx];
  const isReverse = vcDirection === 'en_jp';
  const dirLabel = isReverse ? 'EN \u2192 JP' : 'JP \u2192 EN';

  let body = '<div style="font-family:var(--ui);font-size:0.7rem;color:var(--ink-light);margin-bottom:4px">' + (_triageIdx+1) + ' / ' + _triageQueue.length + ' \u2014 core vocab triage \u00b7 ' + dirLabel + '</div>';

  if (isReverse) {
    // EN->JP: question = meaning only, answer = word+reading
    body += '<div style="font-family:var(--ui);font-size:1.6rem;color:var(--ink);margin:20px 0 24px;min-height:2.4rem">' + (w.meaning||'') + '</div>';
  } else {
    // JP->EN (vocab-knowledge triage): question = word+reading together, answer = meaning only
    body += '<div style="font-family:var(--jp);font-size:2rem;color:var(--ink);margin:20px 0 4px">' + (w.word||'') + '</div>'
      + '<div style="font-family:var(--jp);font-size:1.1rem;color:var(--teal);margin-bottom:24px">' + (w.reading||'') + '</div>';
  }

  if (!_triageFlipped) {
    body += '<button class="btn-action" style="padding:12px 32px" onclick="_triageFlip()">Show answer</button>'
      + '<div style="margin-top:14px"><button class="btn-icon" onclick="_triageClose()" style="font-size:0.7rem;color:var(--ink-light)">Stop for now</button></div>';
  } else {
    const backHtml = isReverse
      ? '<div style="font-family:var(--jp);font-size:1.4rem;color:var(--ink);margin-bottom:4px">' + (w.word||'') + '</div>'
        + '<div style="font-family:var(--jp);font-size:1.1rem;color:var(--teal);margin-bottom:24px">' + (w.reading||'') + '</div>'
      : '<div style="font-family:var(--ui);font-size:1rem;color:var(--ink-light);margin-bottom:24px">' + (w.meaning||'') + '</div>';
    body += backHtml
      + '<div style="display:flex;gap:10px;justify-content:center">'
      + '<button class="btn-action" style="flex:1;padding:12px" onclick="_triageMark(false)">\u2717 Don\'t know yet</button>'
      + '<button class="btn-action" style="flex:1;padding:12px;background:var(--teal);color:#1c1c1e" onclick="_triageMark(true)">\u2713 Already know it</button>'
      + '</div>'
      + '<div style="margin-top:14px"><button class="btn-icon" onclick="_triageClose()" style="font-size:0.7rem;color:var(--ink-light)">Stop for now</button></div>';
  }

  overlay.innerHTML = '<div style="background:var(--paper);border-radius:12px;padding:28px;width:420px;max-width:92%;text-align:center">' + body + '</div>';
  if (_triageFlipped && typeof jpSpeak === 'function' && w.word) jpSpeak(w.word, 0.85);
}

function _triageFlip() {
  _triageFlipped = true;
  _triageRenderOverlay();
}

async function _triageMark(know) {
  const w = _triageQueue[_triageIdx];
  _triageFlipped = false;
  if (know && window.db) {
    const now = new Date().toISOString();
    await window.db.run(
      `INSERT INTO vocab_srs (vocab_id, direction, srs_graduated, srs_ease, srs_interval, srs_due, last_reviewed)
       VALUES (?, ?, 1, 2.5, 14, date('now','+14 days'), ?)
       ON CONFLICT(vocab_id, direction) DO NOTHING`,
      [w.id, vcDirection, now]
    ).catch(() => {});
  }
  _triageIdx++;
  _triageRenderOverlay();
}

function vocabListCheckChanged() {
  const anyChecked = document.querySelectorAll('.vocab-del-cb:checked').length > 0;
  const btn = document.getElementById('vocabListDeleteBtn');
  if (btn) btn.style.display = anyChecked ? 'inline-block' : 'none';
}
async function vocabListDeleteSelected() {
  const checked = document.querySelectorAll('.vocab-del-cb:checked');
  if (!checked.length) return;
  const words = [...new Set([...checked].map(cb => cb.dataset.word))];
  if (!confirm(`Delete ${words.length} word(s) from all directions? This cannot be undone.`)) return;
  for (const word of words) {
    await window.db.run('DELETE FROM vocab_srs WHERE vocab_id IN (SELECT id FROM vocab_items WHERE word = ?)', [word]).catch(() => {});
    await window.db.run('DELETE FROM vocab_items WHERE word = ?', [word]).catch(() => {});
  }
  await loadVocabItemsDeck(vcDirection, false);
  renderVocabList();
}
function toggleVocabList() {
  const list = document.getElementById('vocabList');
  const btn = document.getElementById('vocabListToggleBtn');
  const printBtn = document.getElementById('vocabListPrintBtn');
  const hidden = list.style.display === 'none';
  list.style.display = hidden ? 'block' : 'none';
  btn.textContent = 'List';
  btn.classList.toggle('active', hidden);
  if (printBtn) printBtn.style.display = hidden ? 'inline-block' : 'none';
  if (hidden) renderVocabList();
}

function renderVocabList() {
  const _fmtSourceList = (src, dt) => {
    if (!src) return '';
    const isYoshi = src === 'yoshi_phrases' || src === 'yoshi_vocab';
    if (isYoshi && dt) {
      const d = new Date(dt + 'T00:00:00');
      return 'Yoshi · ' + d.toLocaleString('en-GB', { month: 'short' }) + ' ' + d.getFullYear();
    }
    const labels = { writing: 'Writing', lookup: 'Lookup', n5: 'N5' };
    return labels[src] || src;
  };
  const container = document.getElementById('vocabList');
  if (!container || container.style.display === 'none') return;
  const items = (state.vocabItems || [])
    .map((c, i) => ({ c, i }));
  if (!items.length) {
    container.innerHTML = '<div style="padding:12px 14px;font-family:-apple-system,BlinkMacSystemFont,\'Helvetica Neue\',sans-serif;font-size:0.75rem;color:var(--ink-light);font-style:italic">No words yet.</div>';
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const header = `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-bottom:2px solid var(--border);position:sticky;top:0;background:var(--panel);z-index:1">
    <span style="font-family:var(--ui);font-size:0.7rem;color:var(--ink-light)">${items.length} words</span>
    <button id="vocabListDeleteBtn" onclick="vocabListDeleteSelected()" style="display:none;font-family:var(--ui);font-size:0.7rem;padding:3px 10px;border-radius:4px;border:1px solid var(--red);color:var(--red);background:transparent;cursor:pointer">Delete selected</button>
  </div>`;
  const rows = items.map(({ c, i }) => {
    const due = (c.srs_due || '').slice(0, 10);
    let dueColor, dueLabel;
    if (!due) { dueColor = 'var(--ink-light)'; dueLabel = 'new'; }
    else if (due < today) { dueColor = 'var(--red)'; dueLabel = due; }
    else if (due === today) { dueColor = 'var(--teal)'; dueLabel = 'today'; }
    else { dueColor = 'var(--ink-light)'; dueLabel = due; }
    return `<div style="display:grid;grid-template-columns:0.9fr 0.7fr 1fr auto 20px;gap:4px 10px;
      padding:6px 10px;border-bottom:1px solid var(--border);align-items:center;"
      class="row-hover">
      <span style="font-family:var(--jp);font-size:inherit;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" onclick="vocabIdx=${i};if(!vocabSession.includes(${i}))vocabSession.push(${i});renderVocab()">${escHtml(c.word || '')}</span>
      <span style="font-family:var(--jp);font-size:0.8rem;color:var(--ink-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(c.reading || '')}</span>
      <span style="font-family:var(--ui);font-size:0.75rem;overflow:hidden;text-overflow:ellipsis">${escHtml(c.meaning || '')}</span>
      <span style="font-family:var(--ui);font-size:0.62rem;color:var(--ink-light);padding:2px 6px;border:1px solid var(--border);border-radius:3px;white-space:nowrap">${escHtml(_fmtSourceList(c.source, (c.encounter_at||'').slice(0,10)))}</span>
      <input type="checkbox" class="vocab-del-cb" data-word="${escHtml(c.word||'')}" onclick="event.stopPropagation();vocabListCheckChanged()" style="cursor:pointer;accent-color:var(--teal)">
    </div>`;
  }).join('');
  container.innerHTML = header + rows;
}

function printVocabList() {
  const cards = state.vocab;
  if (!cards.length) { alert('No vocab cards to print.'); return; }
  const rows = cards.map((c,i) => {
    const prog = isWordMastered(i) ? '★' : '';
    return `<tr><td style="font-size:1.1rem">${c.jp}</td><td style="font-family:sans-serif">${c.kana||c.reading||''}</td><td>${c.en}</td><td>${prog}</td></tr>`;
  }).join('');
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>Vocabulary List</title>
  <style>body{font-family:sans-serif;padding:20px}h1{font-size:1.2rem;margin-bottom:16px}
  table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}
  th{background:#f0f0f0}@media print{button{display:none}}</style>
  </head>
  <body><h1>ポールの単語リスト</h1>
  <button class="btn-icon" onclick="window.print()">Print</button>
  <table><tr><th>Japanese</th><th>Reading</th><th>English</th><th>Status</th></tr>${rows}</table>
  </body></html>`);
  win.document.close();
}

function vcToggleHint() {
  const hint = document.getElementById('vcHint');
  const btn = document.getElementById('vcHintToggle');
  if (!hint || !btn) return;
  const open = hint.style.display === 'none';
  hint.style.display = open ? 'block' : 'none';
  btn.textContent = (open ? '▾' : '▸') + ' Reading hint';
}

function transAddToVocab() {
  const src = document.getElementById('transInput').value.trim();
  const tgt = document.getElementById('transOutput').textContent.trim();
  const parsed = transLastParsed;
  const isJp = detectJapanese(src);

  const jp      = isJp ? src : tgt;
  const en      = isJp ? tgt : src;
  const reading = (parsed && parsed.reading) ? parsed.reading : '';

  if (!jp || !en) return;
  state.vocab.push({jp: jp.trim(), kana: reading.trim(), reading: reading.trim(), en: en.trim(), pos: ''});
  saveState();
  const btn = document.getElementById('transAddVocabBtn');
  if (btn) { btn.textContent = '✓ Added'; btn.disabled = true;
    setTimeout(() => { btn.textContent = '+ Add to vocab'; btn.disabled = false; }, 2000); }
}


// ═══════════════════════════════════════════════════════
// GRAMMAR
// ═══════════════════════════════════════════════════════
function renderGrammar() {
  const el = document.getElementById('grammarList');
  if (!el) return;
  el.innerHTML = GRAMMAR_POINTS.map((g, i) => `
    <div class="grammar-item" onclick="toggleGrammar(${i})">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div class="grammar-pattern">${g.pattern}</div>
        <button class="tts-btn" onclick="event.stopPropagation();jpSpeak('${g.pattern.replace(/'/g,"\\'")}')" title="Speak pattern">🔊</button>
      </div>
      <div class="grammar-en">${g.en}</div>
      <div class="grammar-example" id="ge${i}" style="display:none">
        ${g.example.replace(/\n/g,'<br>')}
        <button class="tts-btn" onclick="event.stopPropagation();jpSpeak('${g.example.split('\n')[0].replace(/'/g,"\\'")}')" title="Speak example">🔊 Speak example</button>
      </div>
    </div>
  `).join('');
}
function toggleGrammar(i) {
  const el = document.getElementById('ge' + i);
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// ═══════════════════════════════════════════════════════
// QUESTIONS (AI Chat on Home panel)
// ═══════════════════════════════════════════════════════

function appendChatMsg(role, html) {
  const container = document.getElementById('chatMessages');
  const id = 'msg' + Date.now();
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.id = id;
  div.innerHTML = html;
  if (role === 'ai') {
    const btn = document.createElement('button');
    btn.className = 'send-to-gram';
    btn.textContent = '→ Grammar Notes';
    btn.title = 'Send this Q&A to a Grammar Notes tab';
    btn.dataset.question = lastUserQuestion;
    btn.onclick = () => openGramSendDialog(id);
    div.appendChild(btn);
    const delBtn = document.createElement('button');
    delBtn.className = 'send-to-gram';
    delBtn.textContent = '✕ Delete';
    delBtn.title = 'Delete this Q&A';
    delBtn.style.color = 'var(--ink-light)';
    delBtn.onclick = () => {
      // Remove AI message and preceding user message
      const aiEl = document.getElementById(id);
      const allMsgs = [...document.querySelectorAll('#chatMessages .chat-msg')];
      const aiIdx = allMsgs.indexOf(aiEl);
      if (aiIdx > 0 && allMsgs[aiIdx-1].classList.contains('user')) allMsgs[aiIdx-1].remove();
      aiEl.remove();
    };
    div.appendChild(delBtn);
  }
  container.appendChild(div);
  if (role !== 'ai') {
    container.scrollTop = container.scrollHeight;
  }
  return id;
}

function updateChatMsg(id, text) {
  const el = document.getElementById(id);
  if (el) {
    // Update innerHTML but preserve the send button if present
    const btn = el.querySelector('.send-to-gram');
    
    // Convert markdown tables to HTML tables
    let processed = text;
    const tableRegex = /(\|.+\|[\r\n]+\|[-:| ]+\|[\r\n]+(?:\|.+\|[\r\n]*)+)/g;
    processed = processed.replace(tableRegex, (match) => {
      const rows = match.trim().split('\n').filter(r => r.trim());
      if (rows.length < 2) return match;
      
      let html = '<table style="border-collapse:collapse;margin:12px 0;font-size:inherit;width:100%">';
      
      // Header row
      const headerCells = rows[0].split('|').filter(c => c.trim());
      html += '<tr>';
      headerCells.forEach(cell => {
        html += `<th style="border:1px solid var(--border);padding:8px 12px;background:var(--paper-dark);color:var(--ink);text-align:left;font-weight:600">${cell.trim()}</th>`;
      });
      html += '</tr>';
      
      // Data rows (skip separator row at index 1)
      for (let i = 2; i < rows.length; i++) {
        const cells = rows[i].split('|').filter(c => c.trim());
        html += '<tr>';
        cells.forEach(cell => {
          html += `<td style="border:1px solid var(--border);padding:8px 12px;color:var(--ink)">${cell.trim()}</td>`;
        });
        html += '</tr>';
      }
      
      html += '</table>';
      return html;
    });
    
    // Convert URLs to clickable links
    const linked = processed.replace(/\n/g, '<br>').replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener" style="color:var(--teal);text-decoration:underline;word-break:break-all">$1</a>'
    );
    el.innerHTML = linked;
    if (btn) el.appendChild(btn);
  }
  document.getElementById('chatMessages').scrollTop = 99999;
}

// Re-display a past Q&A from chatHistory (no API call). Used by the
// History drawer — see toggleChatHistory()/buildChatHistoryList() in
// features-tools.js, which now reads chatHistory directly instead of
// scraping #chatMessages (that DOM gets wiped by sendChat() on every
// new question, so it could never show real history).
function showChatHistoryEntry(i) {
  const userTurns = chatHistory.filter(m => m.role === 'user');
  const target = userTurns[i];
  if (!target) return;
  const idx = chatHistory.indexOf(target);
  const reply = chatHistory[idx + 1];
  const _chatContainer = document.getElementById('chatMessages');
  if (_chatContainer) _chatContainer.innerHTML = '';
  lastUserQuestion = target.content;
  appendChatMsg('user', target.content);
  const aiId = appendChatMsg('ai', '');
  if (reply) updateChatMsg(aiId, reply.content);
}

function transSpeakOutput() {
  // Speak JP text — either the input (if JP→EN) or the output (if EN→JP)
  const inp = document.getElementById('transInput').value.trim();
  const out = document.getElementById('transOutput').textContent.trim();
  // Detect JP by presence of kana/kanji
  const isJP = t => /[぀-鿿一-鿿]/.test(t);
  const textToSpeak = isJP(inp) ? inp : isJP(out) ? out : out;
  if (textToSpeak) jpSpeak(textToSpeak, 0.85);
}

function chatQuick(text) {
  const input = document.getElementById('chatInput');
  const existing = input.value.trim();
  input.value = existing ? existing + ' — ' + text : text;
  sendChat();
}
async function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  if (!(App.getApiKey || window.getApiKey)?.()) {
    appendChatMsg('ai', 'Please enter your Anthropic API key using the ⚙ API button at the top of the page.');
    return;
  }
  input.value = '';
  input.style.height = 'auto';
  // Clear previous exchange — history is preserved in chatHistory
  const _chatContainer = document.getElementById('chatMessages');
  if (_chatContainer) _chatContainer.innerHTML = '';
  lastUserQuestion = text;
  chatHistory.push({role: 'user', content: text});
  kanjiCorpusRecordChatProduction(text);
  appendChatMsg('user', text);
  const thinkingId = appendChatMsg('ai', '<span class="thinking-dots">Thinking</span>');
  try {
    const data = await (App.claudeAPI || window.claudeAPI)({
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      messages: chatHistory,
      track: 'chat'
    });
    
    let reply = (App.claudeText || window.claudeText)(data) || 'Sorry, I had trouble responding.';

    // If the question needs the learner's own study data, run it through the
    // same NL→SQL→answer pipeline the Progress panel's "Ask your data" uses.
    const needSqlMatch = reply.match(/^NEED_SQL:\s*(.+)$/is);
    if (needSqlMatch) {
      const dbQuestion = needSqlMatch[1].trim();
      updateChatMsg(thinkingId, '<span class="thinking-dots">Checking your data</span>');
      const dbqaQueryFn = App.dbqaQuery || window.dbqaQuery;
      const result = dbqaQueryFn ? await dbqaQueryFn(dbQuestion).catch(e => ({ error: e.message })) : { error: 'Database lookup unavailable.' };
      reply = result.error ? "I couldn't look that up: " + result.error : result.answer;
    }

    chatHistory.push({role: 'assistant', content: reply});
    updateChatMsg(thinkingId, reply);
    if (typeof drillLastCompletedWrite === 'function') drillLastCompletedWrite('chat');
    // Scroll to the question so it appears above the answer
    setTimeout(() => {
      const allMsgs = [...document.querySelectorAll('#chatMessages .chat-msg')];
      const aiEl = document.getElementById(thinkingId);
      const aiIdx = allMsgs.indexOf(aiEl);
      const target = aiIdx > 0 ? allMsgs[aiIdx - 1] : aiEl;
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  } catch(e) {
    console.error('Chat error:', e);
    updateChatMsg(thinkingId, 'Error: ' + e.message);
  }
}

let chatRecognition = null;
function startChatSpeech() {
  sttStart('chatInput', 'chatSpeechBtn', 'ja');
}

// ═══════════════════════════════════════════════════════
// HEISIG RTK DRILL
// RTK drill retired — see context.md
// ═══════════════════════════════════════════════════════
// ── Legacy shims ─────────────────────────────────────────
// ── Corpus panel state ───────────────────────────────────────────────────────
const KanjiCorpusState = {
  filter:           'all',
  sort:             'lookups',
  view:             'list',
  compareLastClicked: null,
};
const VocabCorpusState = {
  filter: 'encountered',
  sort:   'recent',
};
// KanjiCorpusState — see above

function kanjiCorpusFilter(filter, btn) {
  KanjiCorpusState.filter = filter;
  document.querySelectorAll('.kanji-filter-btn').forEach(b => b.classList.remove('btn-active'));
  if (btn) btn.classList.add('btn-active');
  kanjiCorpusRender();
}

function kanjiCorpusSort(sort, btn) {
  KanjiCorpusState.sort = sort;
  document.querySelectorAll('.kanji-sort-btn').forEach(b => b.classList.remove('btn-active'));
  if (btn) btn.classList.add('btn-active');
  kanjiCorpusRender();
}

// KanjiCorpusState — see below

function kanjiSetView(v) {
  KanjiCorpusState.view = v;
  document.getElementById('kanjiViewList').classList.toggle('btn-active', v === 'list');
  document.getElementById('kanjiViewGrid').classList.toggle('btn-active', v === 'grid');
  kanjiCorpusRender();
}

function kanjiCorpusRender() {
  const grid   = document.getElementById('kanjiCorpusGrid');
  const count  = document.getElementById('kanjiCorpusCount');
  const detail = document.getElementById('kanjiCorpusDetail');
  if (!grid) return;

  const corpus = kanjiCorpusGet();

  // One-time backfill: entries from the translate panel recorded before
  // translateMeaning existed have firstSeenCtx = the source word (e.g. '水曜日'
  // for 水). Chat/writing entries have a sentence fragment there — skip those.
  let backfillDirty = false;
  for (const ch of Object.keys(corpus)) {
    const e = corpus[ch];
    if (!e.translateMeaning
        && e.firstSeenPanel === 'translate'
        && e.firstSeenCtx
        && e.firstSeenCtx !== ch
        && e.firstSeenCtx.length > 1) {
      e.translateMeaning = e.firstSeenCtx;
      backfillDirty = true;
    }
  }
  if (backfillDirty) kanjiCorpusSave(corpus);

  let entries  = Object.values(corpus);

  if (KanjiCorpusState.filter === 'N5')             entries = entries.filter(e => KANJI_JLPT_LEVEL[e.char] === 'N5');
  else if (KanjiCorpusState.filter === 'N4')        entries = entries.filter(e => KANJI_JLPT_LEVEL[e.char] === 'N4');
  else if (KanjiCorpusState.filter === 'unproduced') entries = entries.filter(e => !e.produced);
  else if (KanjiCorpusState.filter === 'unknown')   entries = entries.filter(e => !KANJI_JLPT_LEVEL[e.char]);

  // Apply filter
  if (KanjiCorpusState.filter === 'lookedup')    entries = entries.filter(e => e.lookupCount > 0);
  else if (KanjiCorpusState.filter === 'produced')   entries = entries.filter(e => e.produced);

  // Apply sort
  if (KanjiCorpusState.sort === 'lookups')  entries.sort((a,b) => b.lookupCount - a.lookupCount);
  else if (KanjiCorpusState.sort === 'recent')   entries.sort((a,b) => (b.firstSeen||'').localeCompare(a.firstSeen||''));
  else if (KanjiCorpusState.sort === 'produced') entries.sort((a,b) => (b.productionCount||0)+(b.chatProductionCount||0) - ((a.productionCount||0)+(a.chatProductionCount||0)));
  else if (KanjiCorpusState.sort === 'level')    entries.sort((a,b) => { const order={'N5':0,'N4':1}; return (order[KANJI_JLPT_LEVEL[a.char]]??2) - (order[KANJI_JLPT_LEVEL[b.char]]??2); });
  else if (KanjiCorpusState.sort === 'alpha')    entries.sort((a,b) => a.char.localeCompare(b.char));
  if (count) count.textContent = entries.length + ' kanji';

  if (!entries.length) {
    grid.innerHTML = '<div style="color:var(--ink-light);font-family:var(--ui);font-size:inherit;padding:20px 0">'
      + (KanjiCorpusState.filter === 'all' ? 'No kanji recorded yet. Use the 訳 bar to translate Japanese words.' : 'No kanji match this filter.')
      + '</div>';
    if (detail) detail.style.display = 'none';
    return;
  }

  if (KanjiCorpusState.view === 'list') {
    // List view — table rows
    const rows = entries.map(e => {
      const level = KANJI_JLPT_LEVEL[e.char] || '?';
      const levelColor = level === 'N5' ? 'var(--teal)' : level === 'N4' ? 'var(--gold)' : 'var(--ink-light)';
      const rtk = RTK_KANJI.find(r => r.k === e.char);
      const meaning = KANJI_MEANINGS[e.char] || (rtk ? rtk.kw : e.translateMeaning || '—');
      const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '';
      const producedStr = e.produced
        ? '<span style="color:var(--teal)">✓ ' + fmtDate(e.firstProduced) + '</span>'
        : '<span style="color:var(--ink-light)">not yet</span>';
      const writingCount = e.productionCount || 0;
      const chatCount    = e.chatProductionCount || 0;
      // Show the source word this kanji came from (e.g. 水 → 水曜日)
      const srcWord = e.translateMeaning && e.translateMeaning !== e.char
        ? `<span style="font-family:var(--jp);color:var(--ink-light);margin-left:4px">← ${escHtml(e.translateMeaning)}</span>`
        : '';
      return `<tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="kanjiCorpusShowDetail('${e.char}')">
        <td style="padding:7px 8px;font-family:var(--jp);font-size:1.2rem;width:36px">${e.char}</td>
        <td style="padding:7px 8px;font-family:var(--ui);font-size:inherit;color:var(--ink)">${meaning}</td>
        <td style="padding:7px 8px;font-family:var(--ui);font-size:0.72rem;color:${levelColor};width:30px">${level}</td>
        <td style="padding:7px 8px;font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);white-space:nowrap">${e.lookupCount}✕ looked up${srcWord}</td>
        <td style="padding:7px 4px;font-family:var(--ui);font-size:0.75rem">${producedStr}</td>
        ${writingCount||chatCount ? `<td style="padding:7px 4px 7px 8px;font-family:var(--ui);font-size:0.68rem;color:var(--ink-light);white-space:nowrap">${writingCount ? writingCount+'✍' : ''}${chatCount ? ' '+chatCount+'💬' : ''}</td>` : '<td></td>'}
      </tr>`;
    }).join('');
    grid.style.display = 'block';
    grid.innerHTML = '<table style="width:100%;border-collapse:collapse"><thead><tr style="border-bottom:2px solid var(--border)">'
      + '<th style="padding:4px 8px;font-family:var(--ui);font-size:0.65rem;color:var(--ink-light);text-align:left">漢字</th>'
      + '<th style="padding:4px 8px;font-family:var(--ui);font-size:0.65rem;color:var(--ink-light);text-align:left">Meaning</th>'
      + '<th style="padding:4px 8px;font-family:var(--ui);font-size:0.65rem;color:var(--ink-light)">Lvl</th>'
      + '<th style="padding:4px 8px;font-family:var(--ui);font-size:0.65rem;color:var(--ink-light);text-align:left">Lookups</th>'
      + '<th style="padding:4px 8px;font-family:var(--ui);font-size:0.65rem;color:var(--ink-light);text-align:left">Produced</th>'
      + '<th style="padding:4px 8px;font-family:var(--ui);font-size:0.65rem;color:var(--ink-light)">Count</th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table>';
  } else {
    // Grid view
    grid.style.display = 'flex';
    grid.style.flexWrap = 'wrap';
    grid.style.gap = '8px';
    grid.innerHTML = entries.map(e => {
      const level = KANJI_JLPT_LEVEL[e.char] || '?';
      const levelColor = level === 'N5' ? 'var(--teal)' : level === 'N4' ? 'var(--gold)' : 'var(--ink-light)';
      const rtk = RTK_KANJI.find(r => r.k === e.char);
      const meaning = rtk ? rtk.kw : '';
      const srcWord = e.translateMeaning && e.translateMeaning !== e.char
        ? `<div style="font-family:var(--jp);font-size:0.6rem;color:var(--teal);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(e.translateMeaning)}">${escHtml(e.translateMeaning)}</div>`
        : `<div style="font-family:var(--ui);font-size:0.55rem;color:var(--ink-light);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${meaning}</div>`;
      return `<div onclick="kanjiCorpusShowDetail('${e.char}')"
        style="width:64px;padding:8px 4px;background:var(--paper-dark);border:1px solid var(--border);
               border-radius:6px;cursor:pointer;text-align:center">
        <div style="font-family:var(--jp);font-size:1.6rem;line-height:1.2">${e.char}</div>
        ${srcWord}
        <div style="display:flex;justify-content:space-between;margin-top:4px">
          <span style="font-family:var(--ui);font-size:0.58rem;color:${levelColor}">${level}</span>
          <span style="font-family:var(--ui);font-size:0.58rem;color:var(--ink-light)">${e.lookupCount}✕</span>
          <span style="font-family:var(--ui);font-size:0.65rem;color:${e.produced?'var(--teal)':'transparent'}">${e.produced?'✓':''}</span>
        </div>
      </div>`;
    }).join('');
  }
}


function kanjiCorpusShowDetail(char) {
  const detail = document.getElementById('kanjiCorpusDetail');
  if (!detail) return;

  const corpus = kanjiCorpusGet();
  const e = corpus[char];
  if (!e) return;

  // Close if same char clicked again
  if (detail.dataset.char === char && detail.style.display !== 'none') {
    detail.style.display = 'none';
    detail.dataset.char = '';
    return;
  }
  detail.dataset.char = char;

  const level  = KANJI_JLPT_LEVEL[char] || '—';
  const rtk    = RTK_KANJI.find(r => r.k === char);
  const meaning = KANJI_MEANINGS[char] || (rtk ? rtk.kw : e.translateMeaning || '—');
  const levelColor = level === 'N5' ? 'var(--teal)' : level === 'N4' ? 'var(--gold)' : 'var(--ink-light)';

  const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'}) : '—';

  // Sparkline
  const months = Object.keys(e.monthlyProduction || {}).sort();
  const maxVal = Math.max(...months.map(m => e.monthlyProduction[m]), 1);
  const sparkline = months.length
    ? '<div style="display:flex;gap:2px;align-items:flex-end;height:24px;margin-top:4px">'
      + months.map(m => {
          const h = Math.max(2, Math.round((e.monthlyProduction[m] / maxVal) * 24));
          return `<div title="${m}: ${e.monthlyProduction[m]}" style="width:8px;height:${h}px;background:var(--teal);border-radius:1px 1px 0 0;flex-shrink:0"></div>`;
        }).join('')
      + '</div>'
    : '<span style="color:var(--ink-light);font-size:0.75rem">not produced yet</span>';

  detail.innerHTML = `
    <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
      <div style="font-family:var(--jp);font-size:3rem;line-height:1">${char}</div>
      <div style="flex:1;min-width:180px">
        <div style="font-family:var(--ui);font-size:inherit;color:var(--ink);margin-bottom:4px">
          ${meaning} <span style="color:${levelColor};margin-left:8px">${level}</span>
        </div>
        ${e.translateMeaning && e.translateMeaning !== char
          ? `<div style="font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-bottom:6px">
               From word: <span style="font-family:var(--jp);font-size:inherit;color:var(--teal)">${escHtml(e.translateMeaning)}</span>
             </div>`
          : ''}
        <div style="font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-bottom:2px">
          First seen: ${fmtDate(e.firstSeen)} via ${e.firstSeenPanel}
          ${e.firstSeenCtx ? '<span style="color:var(--ink)"> — ' + escHtml(e.firstSeenCtx) + '</span>' : ''}
        </div>
        <div style="font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-bottom:8px">
          Looked up ${e.lookupCount} time${e.lookupCount !== 1 ? 's' : ''} · Writing: ${e.productionCount||0}✍ Chat: ${e.chatProductionCount||0}💬
          ${e.produced
            ? ' · First produced: ' + fmtDate(e.firstProduced) + (e.firstProducedCtx ? ' <span style="color:var(--ink)">— ' + escHtml(e.firstProducedCtx) + '</span>' : '')
            : ' · <span style="color:var(--gold)">not yet produced</span>'}
        </div>
        <div style="font-family:var(--ui);font-size:0.68rem;color:var(--ink-light);margin-bottom:4px">MONTHLY PRODUCTION</div>
        ${sparkline}
      </div>
    </div>`;
  detail.style.display = 'block';

  // Scroll into view
  detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


// ═══════════════════════════════════════════════════════
// 語彙 VOCABULARY CORPUS MODULE
// Unified view: JLPT_WORDS base list + personal encounter data
// ═══════════════════════════════════════════════════════

// VocabCorpusState — see below

function vcFilter(f, btn) {
  VocabCorpusState.filter = f;
  document.querySelectorAll('.vc-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  vcRender();
}

function vcSort(s, btn) {
  VocabCorpusState.sort = s;
  document.querySelectorAll('.vc-sort-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  vcRender();
}

function vcLevels() {
  // Returns active level set from checkboxes
  const levels = new Set();
  if (document.getElementById('vcN5')?.checked)      levels.add('N5');
  if (document.getElementById('vcN4')?.checked)      levels.add('N4');
  if (document.getElementById('vcUnknown')?.checked) levels.add('?');
  return levels.size ? levels : new Set(['N5','N4','?']); // default all
}

// Build the merged word list: JLPT base + personal corpus data
// vcRenderTargets, vcRenderTargetsInline, vcDrillWord — retired.
// Target words are now surfaced via the priority score in the Words drill.
// Stubs kept so any remaining index.html references don't crash.
function vcRenderTargets() {
  const section = document.getElementById('vcTargetsSection');
  if (section) section.style.display = 'none';
}
function vcRenderTargetsInline() {
  const list = document.getElementById('vcTargetsList2');
  const emptyEl = document.getElementById('vcTargetsEmpty2');
  if (list) list.innerHTML = '';
  if (emptyEl) emptyEl.style.display = 'none';
}
function vcDrillWord(word, meaning) {
  // Redirect to sentence drill
  try { gramSentPracticeError(word + ' (' + meaning + ')'); } catch(e) {}
}

// Export priority functions for use by briefing and voice features

// ── Vocab context for briefing ────────────────────────────────────────────────
// Returns a compact text block summarising vocabulary state for Claude.
// Called by the briefing builder in features.js.
function vocabPriorityContext() {
  try {
    const all      = vcBuildPriorityList();
    const now      = Date.now();
    const DAY      = 86400000;
    const WEEK     = 7 * DAY;

    // Words encountered in last 7 days
    const recentlyLooked = all.filter(e =>
      e.lastLookup && (now - new Date(e.lastLookup).getTime()) < WEEK
    );

    // Top priority encountered words (review candidates)
    const reviewCandidates = all
      .filter(e => e.encountered && !e.produced)
      .slice(0, 8);

    // Production gaps — looked up 2+ times, never produced
    const gaps = all
      .filter(e => e.lookupCount >= 2 && !e.produced)
      .slice(0, 5);

    // High-frequency N5 words never encountered at all
    const unencountered = all
      .filter(e => !e.encountered && e.l === 'N5' && e.f && e.f <= 400)
      .sort((a, b) => (a.f ?? 9999) - (b.f ?? 9999))
      .slice(0, 5);

    // Words produced (confirmed active vocabulary)
    const produced = all.filter(e => e.produced);

    // SRS stats
    const srsAll   = all.filter(e => e.srsInterval > 0);
    const srsDue   = srsAll.filter(e => e.srsDue && e.srsDue <= now);

    let lines = ['### Vocabulary (priority model)'];

    // Summary line
    lines.push(`Encountered: ${all.filter(e=>e.encountered).length} of ${all.length} words | Produced: ${produced.length} | Looked up this week: ${recentlyLooked.length}`);

    // SRS line
    if (srsAll.length) {
      lines.push(`SRS: ${srsAll.length} words tracked | Due now: ${srsDue.length}`);
    }

    // Lesson doc words — teacher introduced, highest provenance
    const lessonDocWords = all.filter(e => e.lessonDoc).slice(0, 10);
    if (lessonDocWords.length) {
      const fmt = lessonDocWords.map(e => `${e.w}(${e.r})`).join(', ');
      lines.push(`Teacher-introduced vocabulary (${lessonDocWords.length} words from lesson notes): ${fmt}`);
    }

    // Review candidates
    if (reviewCandidates.length) {
      const fmt = reviewCandidates.map(e =>
        `${e.w}(${e.r}) lkp:${e.lookupCount} score:${e.priority}`
      ).join(', ');
      lines.push(`Top review candidates: ${fmt}`);
    }

    // Production gaps
    if (gaps.length) {
      const fmt = gaps.map(e => `${e.w}(${e.r}) ×${e.lookupCount}`).join(', ');
      lines.push(`Looked up repeatedly, never produced: ${fmt}`);
    }

    // High-frequency N5 gaps
    if (unencountered.length) {
      const fmt = unencountered.map(e => `${e.w}(${e.r}) f#${e.f}`).join(', ');
      lines.push(`High-frequency N5 words not yet encountered: ${fmt}`);
    }

    // Recently looked up
    if (recentlyLooked.length) {
      const fmt = recentlyLooked
        .slice(0, 6)
        .map(e => `${e.w}(${e.r})`)
        .join(', ');
      lines.push(`Looked up this week: ${fmt}${recentlyLooked.length > 6 ? ` +${recentlyLooked.length - 6} more` : ''}`);
    }

    return lines.join('\n');
  } catch(e) {
    console.warn('[vocabPriorityContext]', e.message);
    return '';
  }
}

// Returns 0–100. Higher = review sooner / include in drill / surface to Claude.
//
// Input: a vcMergeEntry-shaped object (or any object with the fields below).
// Fields used:
//   l            — JLPT level string ('N5', 'N4', ...)
//   f            — frequency rank (integer, lower = more common; null = unknown)
//   lookupCount  — times looked up via quick translate
//   lastLookup   — ISO timestamp of most recent lookup (or null)
//   writeCount   — times produced in writing panel
//   chatCount    — times produced in voice/chat
//   produced     — boolean: ever produced
//   srsInterval  — current SRS interval in days (0 = unseen/failed)
//   srsDue       — SRS due timestamp (ms). Pass Date.now() if unknown.
// ═══════════════════════════════════════════════════════════════════════════
function wordPriorityScore(entry) {
  const now = Date.now();
  let score = 0;

  // ── 1. JLPT level (0–15) ────────────────────────────────────────────────
  // N5 is foundational — highest priority. N4 slightly lower. Unknown = low.
  const levelBonus = { N5: 15, N4: 10 };
  score += levelBonus[entry.l] ?? 3;

  // ── 2. Frequency rank (0–20) ────────────────────────────────────────────
  // Rank 1 = most common. Scale smoothly: top-10 = 20pts, rank 500 = 4pts,
  // rank 1000+ = 1pt, null = 0. Log scale so common words stand out but
  // even rank-400 N5 words still get meaningful points.
  if (entry.f != null && entry.f > 0) {
    score += Math.max(1, Math.round(20 - Math.log(entry.f) * 2.5));
  }

  // ── 3. Lookup count (0–20) ──────────────────────────────────────────────
  // Looked up = encountered but not yet internalized. Diminishing returns.
  // 0 lookups = 0, 1 = 8, 2 = 12, 3 = 15, 5+ = 20
  const lc = entry.lookupCount || 0;
  if (lc > 0) score += Math.min(20, Math.round(20 * (1 - 1 / Math.sqrt(lc + 0.5))));

  // ── 4. Production gap (0–25) ────────────────────────────────────────────
  // Looked up repeatedly but never produced = highest-signal gap.
  // Produced at least once = smaller bonus (confirms active knowledge).
  const produced = entry.produced || (entry.writeCount > 0) || (entry.chatCount > 0);
  if (lc >= 2 && !produced) {
    // Gap: looked up but never produced — maximally important
    score += Math.min(25, 10 + lc * 3);
  } else if (produced) {
    // Produced — slight reduction (don't over-prioritise known words)
    score -= 8;
  }

  // ── 5. Recency (0–15) ───────────────────────────────────────────────────
  // Looked up recently = actively in your working vocabulary right now.
  // Decay: full points within 3 days, half at 14 days, zero at 60+ days.
  if (entry.lastLookup) {
    const daysSince = (now - new Date(entry.lastLookup).getTime()) / 86400000;
    if (daysSince <= 3)        score += 15;
    else if (daysSince <= 14)  score += Math.round(15 * (1 - (daysSince - 3) / 11));
    else if (daysSince <= 60)  score += Math.round(7  * (1 - (daysSince - 14) / 46));
  }

  // ── 6. SRS overdue bonus (0–20) ─────────────────────────────────────────
  // If this word is in the SRS and overdue, push it up.
  const srsDue      = entry.srsDue      || 0;
  const srsInterval = entry.srsInterval || 0;
  if (srsInterval > 0 && srsDue > 0 && srsDue <= now) {
    const daysOverdue = (now - srsDue) / 86400000;
    score += Math.min(20, Math.round(10 + daysOverdue * 2));
  }

  // ── 7. Lesson doc provenance (+15) ──────────────────────────────────────
  // Teacher-introduced vocabulary is the highest-confidence signal.
  if (entry.lessonDoc) score += 15;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// Enrich a vcMergeEntry with its SRS data and priority score.
// Returns the entry with added: srsInterval, srsDue, priority fields.
function wordEnrichWithSRS(entry) {
  const srsData = DrillSRS.get(STORAGE_KEYS.DRILL_SRS_WORDS, entry.r || entry.w);
  return Object.assign({}, entry, {
    srsInterval: srsData?.interval ?? 0,
    srsDue:      srsData?.due      ?? 0,
    priority:    wordPriorityScore(Object.assign({}, entry, {
      srsInterval: srsData?.interval ?? 0,
      srsDue:      srsData?.due      ?? 0,
    })),
  });
}

// Build a priority-sorted word list. Thin wrapper over vcBuildList that adds
// SRS data and score to every entry. Used by briefing and future drill queries.
function vcBuildPriorityList() {
  return vcBuildList()
    .map(wordEnrichWithSRS)
    .sort((a, b) => b.priority - a.priority);
}

function vcBuildList() {
  const corpus = kanjiCorpusGet(); // personal encounter data keyed by word
  const cache  = (App.Storage || window.Storage).getJSON(STORAGE_KEYS.TRANSLATE_CACHE, {});
  const result = [];

  // Start with JLPT base list
  const seen = new Set();
  for (const word of (JLPT_WORDS || [])) {
    seen.add(word.w);
    // Find personal data — check corpus (kanji-level) and translate cache (word-level)
    const cached = cache[word.w] || cache[word.r] || null;
    const corpusEntry = corpus[word.w] || null;
    result.push(vcMergeEntry(word, cached, corpusEntry));
  }

  // Add personal lookups not in JLPT list
  for (const [key, cached] of Object.entries(cache)) {
    const jp = cached.jp || (cached.kanji ? cached.kanji : null) || key;
    if (!seen.has(key) && !seen.has(jp)) {
      seen.add(key);
      result.push(vcMergeEntry(
        { w: jp || key, r: cached.reading || '', m: cached.en || cached.meaning || '', l: '?' },
        cached, corpus[jp] || corpus[key] || null
      ));
    }
  }

  return result;
}

function vcMergeEntry(word, cached, corpusEntry) {
  // Lookup data from translate cache
  const lookupCount   = cached?.count || 0;
  const lastLookup    = cached?.lastLookup || null;
  const firstLookup   = cached?.firstLookup || null;

  // Production data from kanji corpus (per-character) — aggregate for multi-char words
  // Also check translate cache for word-level production
  let writeCount = 0, lastWrite = null, firstWrite = null;
  let chatCount  = 0, lastChat  = null, firstChat  = null;

  if (corpusEntry) {
    writeCount = corpusEntry.productionCount || 0;
    chatCount  = corpusEntry.chatProductionCount || 0;
    firstWrite = corpusEntry.firstProduced || null;
    // Approximate last write from monthly data
    const months = Object.keys(corpusEntry.monthlyProduction || {}).sort();
    lastWrite = months.length ? months[months.length-1] : null;
    const chatMonths = Object.keys(corpusEntry.monthlyChat || {}).sort();
    lastChat = chatMonths.length ? chatMonths[chatMonths.length-1] : null;
    firstChat = corpusEntry.firstSeen && corpusEntry.firstSeenPanel === 'chat' ? corpusEntry.firstSeen : null;
  }

  const produced = writeCount > 0 || chatCount > 0;

  return {
    w: word.w, r: word.r, m: word.m, l: word.l, f: word.f ?? null, pos: word.pos ?? null,
    lookupCount, lastLookup, firstLookup,
    writeCount, lastWrite, firstWrite,
    chatCount, lastChat, firstChat,
    produced,
    encountered:   lookupCount > 0 || produced,
    lessonDoc:     cached?.first_seen_panel === 'lesson_doc' || !!(window._lessonWordSet?.has(word.w)),
  };
}

function vcRender() {
  const tbody  = document.getElementById('vcTableBody');
  const countEl = document.getElementById('vcCount');
  const detail = document.getElementById('vcDetail');
  if (!tbody) return;

  vcRenderTargets(); // no-op — targets retired, stub kept for safety

  if (!_dataLoaded || !JLPT_WORDS.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="padding:20px;text-align:center;color:var(--ink-light);font-family:var(--ui);font-size:0.8rem">Loading word list…</td></tr>';
    return;
  }

  let entries = vcBuildList();

  // Apply filter
  // Apply state filter
  if (VocabCorpusState.filter === 'encountered')   entries = entries.filter(e => e.encountered);
  else if (VocabCorpusState.filter === 'gaps')     entries = entries.filter(e => !e.encountered);
  else if (VocabCorpusState.filter === 'produced') entries = entries.filter(e => e.produced);
  else if (VocabCorpusState.filter === 'unproduced') entries = entries.filter(e => !e.produced); // all words never produced
  // Apply level checkboxes (combinable with any state filter)
  const activeLevels = vcLevels();
  entries = entries.filter(e => activeLevels.has(e.l));

  // Apply sort
  if (VocabCorpusState.sort === 'recent')  entries.sort((a,b) => (b.lastLookup||'').localeCompare(a.lastLookup||''));
  else if (VocabCorpusState.sort === 'level') entries.sort((a,b) => {
    const o = {'N5':0,'N4':1,'?':2};
    return (o[a.l]??2) - (o[b.l]??2);
  });
  else if (VocabCorpusState.sort === 'alpha')    entries.sort((a,b) => a.w.localeCompare(b.w, 'ja'));
  else if (VocabCorpusState.sort === 'alpha-en') entries.sort((a,b) => a.m.localeCompare(b.m));
  else if (VocabCorpusState.sort === 'freq')     entries.sort((a,b) => (a.f ?? 9999) - (b.f ?? 9999));

  if (countEl) countEl.textContent = entries.length + ' words';

  const fmtDate = iso => {
    if (!iso) return '';
    // Handle YYYY-MM (monthly) or full ISO
    if (iso.length === 7) {
      const [y, m] = iso.split('-');
      return m + '/' + y.slice(2);
    }
    const d = new Date(iso);
    return d.getDate() + '/' + (d.getMonth()+1) + '/' + String(d.getFullYear()).slice(2);
  };

  const levelColor = l => l === 'N5' ? 'var(--teal)' : l === 'N4' ? 'var(--gold)' : 'var(--ink-light)';
  const cntCell = (n, color) => n > 0
    ? `<span style="color:${color};font-weight:${n>=3?700:400}">${n}</span>`
    : '<span style="color:var(--border)">—</span>';

  if (entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="padding:20px;text-align:center;color:var(--ink-light);font-family:var(--ui);font-size:0.8rem">
      ${VocabCorpusState.filter === 'encountered' ? 'No words encountered yet. Use the 訳 bar to start.' : 'No words match this filter.'}
    </td></tr>`;
    return;
  }

  tbody.innerHTML = entries.map(e => `
    <tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="vcShowDetail('${e.w.replace(/'/g,"\'")}')">
      <td style="padding:6px 10px;font-family:var(--jp);font-size:1rem;color:var(--teal)">${escHtml(e.w)}</td>
      <td style="padding:6px 8px;font-family:var(--jp);font-size:inherit;color:var(--ink-light)">${escHtml(e.r)}</td>
      <td style="padding:6px 8px;font-size:0.8rem;color:var(--ink)">${escHtml(e.m)}</td>
      <td style="padding:6px 6px;text-align:center;font-family:var(--ui);font-size:0.7rem;color:${levelColor(e.l)}">${e.l}</td>
      <td style="padding:6px 6px;text-align:center;font-family:var(--ui);font-size:0.75rem">${cntCell(e.lookupCount,'var(--ink)')}</td>
      <td style="padding:6px 6px;text-align:center;font-family:var(--ui);font-size:0.7rem;color:var(--ink-light)">${fmtDate(e.lastLookup)}</td>
      <td style="padding:6px 6px;text-align:center;font-family:var(--ui);font-size:0.75rem">${cntCell(e.writeCount,'var(--teal)')}</td>
      <td style="padding:6px 6px;text-align:center;font-family:var(--ui);font-size:0.7rem;color:var(--ink-light)">${fmtDate(e.lastWrite)}</td>
      <td style="padding:6px 6px;text-align:center;font-family:var(--ui);font-size:0.75rem">${cntCell(e.chatCount,'var(--gold)')}</td>
      <td style="padding:6px 6px;text-align:center;font-family:var(--ui);font-size:0.7rem;color:var(--ink-light)">${fmtDate(e.lastChat)}</td>
    </tr>`).join('');
}

function vcShowDetail(word) {
  const detail = document.getElementById('vcDetail');
  if (!detail) return;

  // Toggle off if same word
  if (detail.dataset.word === word && detail.style.display !== 'none') {
    detail.style.display = 'none'; detail.dataset.word = ''; return;
  }
  detail.dataset.word = word;

  const entries = vcBuildList();
  const e = entries.find(x => x.w === word);
  if (!e) return;

  const fmtDate = iso => {
    if (!iso) return '—';
    if (iso.length === 7) {
      const [y, m] = iso.split('-');
      return m + '/' + y.slice(2);
    }
    return new Date(iso).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'});
  };
  const levelColor = e.l === 'N5' ? 'var(--teal)' : e.l === 'N4' ? 'var(--gold)' : 'var(--ink-light)';

  // Sparkline from monthly production
  const corpus = kanjiCorpusGet();
  const ce = corpus[word] || {};
  const months = Object.keys(ce.monthlyProduction || {}).sort();
  const maxV = Math.max(...months.map(m => ce.monthlyProduction[m]), 1);
  const sparkline = months.length
    ? '<div style="display:flex;gap:2px;align-items:flex-end;height:20px;margin-top:4px">'
      + months.map(m => {
          const h = Math.max(2, Math.round((ce.monthlyProduction[m]/maxV)*20));
          return `<div title="${m}" style="width:6px;height:${h}px;background:var(--teal);border-radius:1px 1px 0 0"></div>`;
        }).join('') + '</div>'
    : '<span style="color:var(--ink-light);font-size:0.75rem">—</span>';

  detail.innerHTML = `
    <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
      <div>
        <div style="font-family:var(--jp);font-size:2.5rem;line-height:1;color:var(--teal)">${escHtml(e.w)}</div>
        <div style="font-family:var(--jp);font-size:1rem;color:var(--ink-light);margin-top:2px">${escHtml(e.r)}</div>
      </div>
      <div style="flex:1;min-width:200px">
        <div style="font-family:var(--ui);font-size:inherit;color:var(--ink);margin-bottom:6px">
          ${escHtml(e.m)} <span style="color:${levelColor};margin-left:8px">${e.l}</span>${e.f ? ` <span style="color:var(--ink-light);font-size:0.75rem;margin-left:8px">freq #${e.f}</span>` : ''}
        </div>
        <table style="border-collapse:collapse;font-family:var(--ui);font-size:0.75rem;width:100%">
          <tr>
            <td style="padding:3px 12px 3px 0;color:var(--ink-light)">First looked up</td>
            <td style="color:var(--ink)">${fmtDate(e.firstLookup)}</td>
            <td style="padding:3px 0 3px 16px;color:var(--ink-light)">Last looked up</td>
            <td style="color:var(--ink)">${fmtDate(e.lastLookup)}</td>
            <td style="padding:3px 0 3px 16px;color:var(--ink-light)">Count</td>
            <td style="color:var(--ink)">${e.lookupCount || '—'}</td>
          </tr>
          <tr>
            <td style="padding:3px 12px 3px 0;color:var(--ink-light)">First written</td>
            <td style="color:var(--teal)">${fmtDate(e.firstWrite)}</td>
            <td style="padding:3px 0 3px 16px;color:var(--ink-light)">Last written</td>
            <td style="color:var(--teal)">${fmtDate(e.lastWrite)}</td>
            <td style="padding:3px 0 3px 16px;color:var(--ink-light)">Count</td>
            <td style="color:var(--teal)">${e.writeCount || '—'}</td>
          </tr>
          <tr>
            <td style="padding:3px 12px 3px 0;color:var(--ink-light)">First chat</td>
            <td style="color:var(--gold)">${fmtDate(e.firstChat)}</td>
            <td style="padding:3px 0 3px 16px;color:var(--ink-light)">Last chat</td>
            <td style="color:var(--gold)">${fmtDate(e.lastChat)}</td>
            <td style="padding:3px 0 3px 16px;color:var(--ink-light)">Count</td>
            <td style="color:var(--gold)">${e.chatCount || '—'}</td>
          </tr>
        </table>
        ${e.firstLookup && e.firstWrite ? `
        <div style="margin-top:8px;font-family:var(--ui);font-size:0.72rem;color:var(--ink-light)">
          Acquisition lag: <span style="color:var(--ink)">${Math.round((new Date(e.firstWrite)-new Date(e.firstLookup))/(1000*60*60*24))} days</span> from first lookup to first production
        </div>` : ''}
        <div style="margin-top:8px;font-family:var(--ui);font-size:0.68rem;color:var(--ink-light);margin-bottom:4px">WRITING PRODUCTION</div>
        ${sparkline}
      </div>
    </div>`;
  detail.style.display = 'block';
  detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// GRAMMAR NOTES

// ── localStorage → vocab_items one-time migration ───────────────────
async function migrateLearnedWordsToVocabItems() {
  try {
    const flag = await window.kvAPI.get('VOCAB_MIGRATION_V1');
    if (flag) return; // already done
    const raw = localStorage.getItem('lessonNotesLearnedWords');
    if (!raw) { await window.kvAPI.set('VOCAB_MIGRATION_V1', '1'); return; }
    const words = JSON.parse(raw);
    if (!Array.isArray(words) || words.length === 0) {
      await window.kvAPI.set('VOCAB_MIGRATION_V1', '1');
      return;
    }
    const now = new Date().toISOString();
    const due = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    for (const word of words) {
      if (!word || typeof word !== 'string') continue;
      await window.db.run(
        `INSERT OR IGNORE INTO vocab_items (word, source, source_ref, encounter_at, entry_weight, created_at)
         VALUES (?, 'yoshi_vocab', 'lessonNotesLearnedWords', ?, 0.1, ?)`,
        [word, now, now]
      );
      for (const dir of ['jp_en', 'en_jp', 'speaking']) {
        await window.db.run(
          `INSERT OR IGNORE INTO vocab_srs (vocab_id, direction, srs_interval, srs_ease, srs_due)
           SELECT id, ?, 30, 2.5, ? FROM vocab_items WHERE word = ? AND source = 'yoshi_vocab'`,
          [dir, due, word]
        );
      }
    }
    await window.kvAPI.set('VOCAB_MIGRATION_V1', '1');
    console.log('[vocab] migrated ' + words.length + ' learned words to vocab_items');
  } catch (e) {
    console.warn('[vocab] migration error', e);
  }
}

// ── lesson_phrases backfill → vocab_items (one-time) ────────────────
async function backfillLessonPhrasesToVocabItems() {
  try {
    const flag = await window.kvAPI.get('VOCAB_LESSON_BACKFILL_V1');
    if (flag) return;
    const rows = await window.db.query('SELECT id, phrase, reading, meaning, example, type, created_at FROM lesson_phrases', []);
    if (!rows || rows.length === 0) { await window.kvAPI.set('VOCAB_LESSON_BACKFILL_V1', '1'); return; }
    const now = new Date().toISOString();
    for (const row of rows) {
      await window.db.run(
        `INSERT INTO vocab_items (word, reading, meaning, example, source, source_ref, type, encounter_at, entry_weight, created_at)
         VALUES (?, ?, ?, ?, 'yoshi_phrases', ?, ?, ?, 1.0, ?)
         ON CONFLICT(word) DO UPDATE SET
           entry_weight = MAX(entry_weight, excluded.entry_weight),
           source = CASE WHEN excluded.entry_weight > entry_weight THEN excluded.source ELSE source END`,
        [row.phrase, row.reading || null, row.meaning || null, row.example || null, String(row.id), row.type || 'phrase', row.created_at || now, now]
      );
    }
    await window.kvAPI.set('VOCAB_LESSON_BACKFILL_V1', '1');
    console.log('[vocab] backfilled ' + rows.length + ' lesson_phrases into vocab_items');
  } catch (e) {
    console.warn('[vocab] lesson backfill error', e);
  }
}

// ── corpus_lookups backfill → vocab_items (one-time) ────────────────
async function backfillLookupsToVocabItems() {
  try {
    const flag = await window.kvAPI.get('VOCAB_LOOKUPS_BACKFILL_V1');
    if (flag) return;
    const rows = await window.db.query(
      `SELECT word, MIN(looked_up_at) as first_seen, COUNT(*) as lookup_count
       FROM corpus_lookups
       WHERE LENGTH(word) > 1
       GROUP BY word
       HAVING lookup_count >= 2`, []
    );
    if (!rows || rows.length === 0) { await window.kvAPI.set('VOCAB_LOOKUPS_BACKFILL_V1', '1'); return; }
    const now = new Date().toISOString();
    for (const row of rows) {
      const weight = Math.min(0.6 + (row.lookup_count - 2) * 0.05, 1.0);
      await window.db.run(
        `INSERT OR IGNORE INTO vocab_items (word, source, source_ref, encounter_at, entry_weight, created_at)
         VALUES (?, 'lookup', ?, ?, ?, ?)`,
        [row.word, 'corpus_lookups', row.first_seen || now, weight, now]
      );
    }
    await window.kvAPI.set('VOCAB_LOOKUPS_BACKFILL_V1', '1');
    console.log('[vocab] backfilled ' + rows.length + ' lookup words into vocab_items');
  } catch (e) {
    console.warn('[vocab] lookups backfill error', e);
  }
}

// ── N5 words backfill → vocab_items (one-time, background fill) ─────
async function backfillN5ToVocabItems() {
  try {
    const flag = await window.kvAPI.get('VOCAB_N5_BACKFILL_V1');
    if (flag) return;
    const rows = await window.db.query('SELECT word, reading, meaning FROM words', []);
    if (!rows || rows.length === 0) { await window.kvAPI.set('VOCAB_N5_BACKFILL_V1', '1'); return; }
    const now = new Date().toISOString();
    let inserted = 0;
    for (const row of rows) {
      const result = await window.db.run(
        `INSERT OR IGNORE INTO vocab_items (word, reading, meaning, source, source_ref, encounter_at, entry_weight, created_at)
         VALUES (?, ?, ?, 'n5', 'words', ?, 0.3, ?)`,
        [row.word, row.reading || null, row.meaning || null, now, now]
      );
      if (result && result.changes) inserted++;
    }
    await window.kvAPI.set('VOCAB_N5_BACKFILL_V1', '1');
    console.log('[vocab] N5 backfill: ' + inserted + ' new words added (of ' + rows.length + ' total)');
  } catch (e) {
    console.warn('[vocab] N5 backfill error', e);
  }
}

// ── Writing vocab extraction → vocab_items (live, per submission) ───
async function extractWritingVocabToItems(text) {
  if (!text || text.length < 2) return;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': (App.getApiKey || window.getApiKey)?.(), 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: 'You are a Japanese vocabulary extractor. Return ONLY a JSON array, no markdown, no preamble. Each item: {"word":"","reading":"","meaning":"","pos":""}. Give "word" in DICTIONARY form (plain form — e.g. 食べる not 食べました, おいしい not おいしかった). "pos" is one of: noun, verb, i-adj, na-adj, adverb, expression. Extract only content words (nouns, verbs, adjectives, adverbs). Exclude particles, conjunctions, auxiliary verbs.',
        messages: [{ role: 'user', content: 'Extract vocabulary from this Japanese text: ' + text }]
      })
    });
    const data = await response.json();
    const raw = (data.content || []).map(b => b.text || '').join('');
    let words;
    try { words = JSON.parse(raw.replace(/```json|```/g, '').trim()); } catch(e) {
      console.warn('[vocab] writing extraction parse error', e); return;
    }
    if (!Array.isArray(words) || words.length === 0) return;
    // Normalize pure-hiragana words to kanji form using the words table.
    // Claude sometimes returns e.g. まいにち instead of 毎日 — look it up.
    for (const w of words) {
      if (!w.word || !/^[ぁ-ん]+$/.test(w.word)) continue;
      try {
        const match = await window.db.query('SELECT word FROM words WHERE reading = ? LIMIT 1', [w.word]);
        if (match && match.length > 0) w.word = match[0].word;
      } catch(e) {}
    }
    const now = new Date().toISOString();
    for (const w of words) {
      if (!w.word || typeof w.word !== 'string') continue;
      let _wordId = null;
      try {
        const _wr = await window.db.get('SELECT id FROM words WHERE word = ?', [w.word]);
        _wordId = _wr?.id || null;
      } catch(e) {}
      await window.db.run(
        `INSERT INTO vocab_items (word, reading, meaning, source, source_ref, pos, encounter_at, entry_weight, created_at, word_id)
         VALUES (?, ?, ?, 'writing', 'writing_session', ?, ?, 0.9, ?, ?)
         ON CONFLICT(word) DO UPDATE SET
           entry_weight = MAX(entry_weight, excluded.entry_weight),
           source = CASE WHEN excluded.entry_weight > entry_weight THEN excluded.source ELSE source END,
           word_id = COALESCE(excluded.word_id, word_id)`,
        [w.word, w.reading || null, w.meaning || null, w.pos || null, now, now, _wordId]
      );
    }
    console.log('[vocab] writing extraction: ' + words.length + ' words from submission');
  } catch (e) {
    console.warn('[vocab] writing extraction error', e);
  }
}

function initWritingVocabListener() {
  try {
    (App.AppEvents || window.AppEvents)?.on(AppEvents.WRITING_SUBMITTED, (payload) => {
      const text = payload?.full_text;
      if (text) extractWritingVocabToItems(text);
    });
  } catch(e) {
    console.warn('[vocab] writing listener init error', e);
  }
}

function initLessonVocabListener() {
  try {
    (App.AppEvents || window.AppEvents)?.on(AppEvents.LESSON_EXTRACTED, async (payload) => {
      const lessonId = payload?.lessonId || null;
      try {
        const rows = await window.db.query(
          'SELECT id, phrase, reading, meaning, example, type, created_at FROM lesson_phrases WHERE lesson_id = ?',
          [lessonId]
        );
        if (!rows || rows.length === 0) return;
        const now = new Date().toISOString();
        for (const row of rows) {
          if (row.type === 'grammar') continue;
          let _wordId = null;
          try {
            const _wr = await window.db.get('SELECT id FROM words WHERE word = ?', [row.phrase]);
            _wordId = _wr?.id || null;
          } catch(e) {}
          await window.db.run(
            `INSERT INTO vocab_items (word, reading, meaning, example, source, source_ref, type, encounter_at, entry_weight, created_at, word_id)
             VALUES (?, ?, ?, ?, 'yoshi_phrases', ?, ?, ?, 1.0, ?, ?)
             ON CONFLICT(word) DO UPDATE SET
               entry_weight = MAX(entry_weight, excluded.entry_weight),
               source = CASE WHEN excluded.entry_weight > entry_weight THEN excluded.source ELSE source END,
               word_id = COALESCE(excluded.word_id, word_id)`,
            [row.phrase, row.reading || null, row.meaning || null, row.example || null, String(row.id), row.type || 'phrase', row.created_at || now, now, _wordId]
          );
        }
        console.log('[vocab] lesson extracted — upserted ' + rows.length + ' phrases into vocab_items');
        if (App.loadVocabItemsDeck) App.loadVocabItemsDeck(vcDirection);
      } catch(e) {
        console.warn('[vocab] lesson vocab listener error', e);
      }
    });
  } catch(e) {
    console.warn('[vocab] lesson listener init error', e);
  }
}

function initLookupVocabListener() {
  try {
    (App.AppEvents || window.AppEvents)?.on(AppEvents.VOCAB_LOOKUP, async (payload) => {
      const word = payload?.word;
      if (!word || word.length < 2 || word.length > 10) return;
      try {
        // Promote on 3 separate days looked up, OR 5 total lookups —
        // whichever comes first. Catches both the spaced-need case (genuinely
        // recurring across different days) and the high-volume-burst case
        // (heavy use within one dense reading/translate session) without
        // requiring both conditions at once.
        const rows = await window.db.query(
          `SELECT COUNT(*) as total, COUNT(DISTINCT substr(looked_up_at,1,10)) as days
           FROM corpus_lookups WHERE word = ?`,
          [word]
        );
        const count = rows?.[0]?.total || 0;
        const days  = rows?.[0]?.days  || 0;
        if (days < 3 && count < 5) return;
        const now = new Date().toISOString();
        const weight = Math.min(0.6 + Math.max(0, count - 2) * 0.05, 1.0);
        let _meaning = payload.meaning || '';
        let _reading = payload.reading || '';
        // Use dictionary form if available (e.g. conjugated lookup → plain form)
        const _vocabWord = (payload.dictForm && payload.dictForm !== word) ? payload.dictForm : word;
        let _wordId = null;
        try {
          const _wr = await window.db.get('SELECT id, reading, meaning FROM words WHERE word = ?', [_vocabWord]);
          if (_wr) {
            _wordId = _wr.id;
            if (!_reading && _wr.reading) _reading = _wr.reading;
            if (!_meaning && _wr.meaning) _meaning = _wr.meaning;
          }
        } catch(e) {}
        await window.db.run(
          `INSERT INTO vocab_items (word, reading, meaning, source, source_ref, type, encounter_at, entry_weight, created_at, word_id)
           VALUES (?, ?, ?, 'lookup', 'corpus_lookups', 'word', ?, ?, ?, ?)
           ON CONFLICT(word) DO UPDATE SET
             meaning = CASE WHEN excluded.meaning != '' THEN excluded.meaning ELSE meaning END,
             reading = CASE WHEN excluded.reading != '' THEN excluded.reading ELSE reading END,
             encounter_at = excluded.encounter_at,
             entry_weight = MAX(entry_weight, excluded.entry_weight),
             source = CASE WHEN excluded.entry_weight > entry_weight THEN excluded.source ELSE source END,
             word_id = COALESCE(excluded.word_id, word_id)`,
          [_vocabWord, _reading, _meaning, now, weight, now, _wordId]
        );
        console.log('[vocab] lookup promoted:', _vocabWord, '(' + count + ' lookups, looked up as ' + word + ')');
      } catch(e) {
        console.warn('[vocab] lookup promotion error', e);
      }
    });
  } catch(e) {
    console.warn('[vocab] lookup listener init error', e);
  }
}

// ── Core-vocab pool — daily intake ───────────────────────────────────
// Lazily creates vocab_items + vocab_srs rows for the next batch of N5/N4
// words, frequency-ordered, in two sequential sprints (N5 first, then N4).
// Only touches words with no existing vocab_items row at all — words
// already entered via another source (yoshi_vocab, writing, lookup) are
// left untagged for now; retroactive pool-tagging of those is a separate,
// not-yet-decided step.
async function coreVocabDailyIntake(batchSize = 12, maxCatchupMultiple = 2) {
  if (!window.db) return { added: 0 };
  try {
    const n5Remaining = await window.db.query(
      `SELECT COUNT(*) as n FROM words w WHERE w.level='N5'
       AND NOT EXISTS (SELECT 1 FROM vocab_items v WHERE v.word_id = w.id)`, []
    );
    const sprintLevel = (n5Remaining?.[0]?.n || 0) > 0 ? 'N5' : 'N4';
    const poolTag = sprintLevel === 'N5' ? 'core_n5' : 'core_n4';

    const today = new Date().toISOString().slice(0, 10);
    const todayCount = await window.db.query(
      `SELECT COUNT(*) as n FROM vocab_items WHERE pool = ? AND substr(created_at,1,10) = ?`,
      [poolTag, today]
    );
    const already = todayCount?.[0]?.n || 0;

    // Catch-up: compare actual introduced-so-far in this sprint against the
    // expected count given elapsed calendar days since the sprint's first
    // intake, at batchSize/day. A gap (missed days, or partial days) raises
    // today's effective cap — bounded by maxCatchupMultiple so a long gap
    // doesn't dump the whole backlog into a single session.
    const sprintStartRow = await window.db.query(
      `SELECT MIN(substr(created_at,1,10)) as d FROM vocab_items WHERE pool = ?`, [poolTag]
    );
    const sprintStart = sprintStartRow?.[0]?.d || today;
    const daysElapsed = Math.max(1, Math.floor((new Date(today) - new Date(sprintStart)) / 86400000) + 1);
    const totalIntroduced = await window.db.query(
      `SELECT COUNT(*) as n FROM vocab_items WHERE pool = ?`, [poolTag]
    );
    const actualSoFar = totalIntroduced?.[0]?.n || 0;
    const expectedSoFar = daysElapsed * batchSize;
    const deficit = Math.max(0, expectedSoFar - actualSoFar);
    const effectiveCap = Math.min(batchSize + deficit, batchSize * maxCatchupMultiple);

    if (already >= effectiveCap) {
      return { added: 0, reason: 'already introduced today', sprint: sprintLevel, todayCount: already, effectiveCap, deficit };
    }
    const remaining = effectiveCap - already;

    const candidates = await window.db.query(
      `SELECT w.id, w.word, w.reading, w.meaning
         FROM words w
        WHERE w.level = ?
          AND NOT EXISTS (SELECT 1 FROM vocab_items v WHERE v.word_id = w.id)
        ORDER BY w.frequency IS NULL, w.frequency ASC
        LIMIT ?`,
      [sprintLevel, remaining]
    );
    if (!candidates || !candidates.length) {
      return { added: 0, reason: 'sprint complete — no remaining ' + sprintLevel + ' words', sprint: sprintLevel };
    }

    const now = new Date().toISOString();
    let added = 0;
    for (const w of candidates) {
      if (!w.reading || !w.meaning) continue; // skip incomplete dictionary rows
      await window.db.run(
        `INSERT INTO vocab_items (word, reading, meaning, source, source_ref, type, encounter_at, entry_weight, created_at, word_id, pool)
         VALUES (?, ?, ?, 'core_vocab', 'sprint', 'word', ?, 1.0, ?, ?, ?)`,
        [w.word, w.reading, w.meaning, now, now, w.id, poolTag]
      );
      // Deliberately do NOT pre-create vocab_srs rows here. The session
      // loader's new-word detection (_isNew = srs_due == null) relies on no
      // vocab_srs row existing yet — that's the convention every other
      // source already follows (e.g. lookup-promoted words). Pre-setting
      // srs_due to today made these words look already-reviewed/due
      // instead of new, dropping them to the flat 0.35 due-weight and
      // skipping the MAX_NEW_CORE session cap entirely. vocab_srs rows now
      // get created naturally on first review via markVocab(), same as
      // every other source.
      added++;
    }
    console.log('[core-vocab] daily intake:', added, 'words added to', poolTag);
    return { added, sprint: sprintLevel };
  } catch (e) {
    console.warn('[core-vocab] daily intake error', e);
    return { added: 0, error: e.message };
  }
}

// ── Vocab settings save/load ─────────────────────────────────────────
async function vocabSettingsLoad() {
  try {
    const w = await window.kvAPI.get('VOCAB_WEIGHTS');
    const t = await window.kvAPI.get('VOCAB_THRESHOLDS');
    const i = await window.kvAPI.get('VOCAB_INTERVALS');
    if (w) {
      const wt = JSON.parse(w);
      _vcWeights = wt;
      if (document.getElementById('vocabWtYoshiPhrases')) document.getElementById('vocabWtYoshiPhrases').value = wt.yoshi_phrases ?? 1.0;
      if (document.getElementById('vocabWtYoshiVocab')) document.getElementById('vocabWtYoshiVocab').value = wt.yoshi_vocab ?? 1.0;
      if (document.getElementById('vocabWtWriting')) document.getElementById('vocabWtWriting').value = wt.writing ?? 0.9;
      if (document.getElementById('vocabWtLookup')) document.getElementById('vocabWtLookup').value = wt.lookup ?? 0.6;
      if (document.getElementById('vocabWtN5')) document.getElementById('vocabWtN5').value = wt.n5 ?? 0.3;
      if (document.getElementById('vocabWtDirJpEn')) document.getElementById('vocabWtDirJpEn').value = (wt.directions?.jp_en) ?? 1.0;
      if (document.getElementById('vocabWtDirEnJp')) document.getElementById('vocabWtDirEnJp').value = (wt.directions?.en_jp) ?? 0.8;
    }
    if (t) {
      const th = JSON.parse(t);
      _vcThresholds = th;
      if (document.getElementById('vocabThreshLookup')) document.getElementById('vocabThreshLookup').value = th.lookup_promote ?? 2;
      if (document.getElementById('vocabThreshDecay')) document.getElementById('vocabThreshDecay').value = th.production_decay ?? 5;
      if (document.getElementById('vocabSessionSizeJpEn')) document.getElementById('vocabSessionSizeJpEn').value = th.session_size_jp_en ?? 30;
      if (document.getElementById('vocabSessionSizeEnJp')) document.getElementById('vocabSessionSizeEnJp').value = th.session_size_en_jp ?? 25;
    }
    if (i) {
      const iv = JSON.parse(i);
      _vcIntervals = iv;
      if (document.getElementById('vocabIntYoshiPhrases')) document.getElementById('vocabIntYoshiPhrases').value = iv.yoshi_phrases ?? 3;
      if (document.getElementById('vocabIntYoshiVocab')) document.getElementById('vocabIntYoshiVocab').value = iv.yoshi_vocab ?? 3;
      if (document.getElementById('vocabIntWriting')) document.getElementById('vocabIntWriting').value = iv.writing ?? 1;
      if (document.getElementById('vocabIntLookup')) document.getElementById('vocabIntLookup').value = iv.lookup ?? 1;
      if (document.getElementById('vocabIntN5')) document.getElementById('vocabIntN5').value = iv.n5 ?? 0;
    }
    const _savedDir = await window.kvAPI.get('VOCAB_DIRECTION').catch(() => null);
    if (_savedDir && ['jp_en','en_jp'].includes(_savedDir)) {
      vcDirection = _savedDir;
      const _dirBtn = document.getElementById('vcDirectionBtn');
      const _dirLabels = { jp_en: 'JP → EN', en_jp: 'EN → JP' };
      if (_dirBtn) _dirBtn.textContent = _dirLabels[vcDirection];
    }
  } catch(e) { console.warn('[vocab] settings load error', e); }
}

async function vocabSettingsSave() {
  try {
    const weights = {
      yoshi_phrases: parseFloat(document.getElementById('vocabWtYoshiPhrases').value),
      yoshi_vocab:   parseFloat(document.getElementById('vocabWtYoshiVocab').value),
      writing:       parseFloat(document.getElementById('vocabWtWriting').value),
      lookup:        parseFloat(document.getElementById('vocabWtLookup').value),
      core_vocab:    parseFloat(document.getElementById('vocabWtN5').value),
      directions: {
        jp_en:    parseFloat(document.getElementById('vocabWtDirJpEn').value),
        en_jp:    parseFloat(document.getElementById('vocabWtDirEnJp').value),
      },
    };
    const thresholds = {
      lookup_promote:   parseInt(document.getElementById('vocabThreshLookup').value),
      production_decay: parseInt(document.getElementById('vocabThreshDecay').value),
      session_size_jp_en:     parseInt(document.getElementById('vocabSessionSizeJpEn').value),
      session_size_en_jp:     parseInt(document.getElementById('vocabSessionSizeEnJp').value),
    };
    const intervals = {
      yoshi_phrases: parseInt(document.getElementById('vocabIntYoshiPhrases').value),
      yoshi_vocab:   parseInt(document.getElementById('vocabIntYoshiVocab').value),
      writing:       parseInt(document.getElementById('vocabIntWriting').value),
      lookup:        parseInt(document.getElementById('vocabIntLookup').value),
      n5:            parseInt(document.getElementById('vocabIntN5').value),
    };
    _vcWeights = weights;
    _vcThresholds = thresholds;
    _vcIntervals = intervals;
    await window.kvAPI.set('VOCAB_WEIGHTS', JSON.stringify(weights));
    await window.kvAPI.set('VOCAB_THRESHOLDS', JSON.stringify(thresholds));
    await window.kvAPI.set('VOCAB_INTERVALS', JSON.stringify(intervals));
    const msg = document.getElementById('vocabWeightsMsg');
    if (msg) { msg.style.display = 'inline'; setTimeout(() => msg.style.display = 'none', 2000); }
    console.log('[vocab] settings saved');
    await loadVocabItemsDeck(vcDirection);
  } catch(e) { console.warn('[vocab] settings save error', e); }
}

// ── Text entry drill mode ────────────────────────────────────────────
let _vcTextEntry = false;
let _vcCardShownAt = null; // timestamp when current card was rendered

function toggleVcTextEntry() {
  _vcTextEntry = !_vcTextEntry;
  const btn = document.getElementById('vcTypeToggle');
  const flipControls = document.getElementById('vocabFlipControls');
  const typeControls = document.getElementById('vocabTypeControls');
  if (btn) btn.style.borderBottom = _vcTextEntry ? '2px solid var(--teal)' : '2px solid transparent';
  if (flipControls) flipControls.style.display = _vcTextEntry ? 'none' : '';
  if (typeControls) typeControls.style.display = _vcTextEntry ? 'block' : 'none';
  if (_vcTextEntry) {
    const inp = document.getElementById('vocabTypeInput');
    if (inp) { inp.value = ''; inp.focus(); kanaSetMode('vocabTypeInput', vcDirection === 'en_jp' ? 'hiragana' : 'romaji'); }
    const res = document.getElementById('vocabTypeResult');
    if (res) res.textContent = '';
  }
}

function submitVocabTypeAnswer() {
  const inp = document.getElementById('vocabTypeInput');
  const res = document.getElementById('vocabTypeResult');
  if (!inp || !res) return;
  const typed = inp.value.trim();
  if (!typed) return;
  const card = state.vocabItems[vocabIdx];
  if (!card) return;
  // Check against word (kanji) and reading (hiragana)
  const correct = typed === card.word || typed === (card.reading || '');
  if (correct) {
    inp.value = '';
    res.textContent = '';
    setTimeout(() => { markVocab('know'); }, 400);
  } else {
    res.style.color = 'var(--red)';
    res.style.fontSize = '1.4rem';
    const _wrongAns = vcDirection === 'jp_en' ? escHtml(card.meaning || card.word) : escHtml(card.word) + (card.reading ? '　' + escHtml(card.reading) : '');
    res.innerHTML = _wrongAns;
    inp.value = '';
    inp.onkeydown = function(e) {
      if (e.key === 'Enter') {
        res.textContent = '';
        res.style.fontSize = '';
        inp.onkeydown = function(e2) { if(e2.key==='Enter') submitVocabTypeAnswer(); };
        markVocab('again');
      }
    };
  }
}

function vocabTypeMarkWrong() {
  const res = document.getElementById('vocabTypeResult');
  const nextBtn = document.getElementById('vocabTypeNextBtn');
  if (res) res.textContent = '';
  if (nextBtn) nextBtn.style.display = 'none';
  markVocab('again');
}

function skipVocabTypeAnswer() {
  const inp = document.getElementById('vocabTypeInput');
  const res = document.getElementById('vocabTypeResult');
  if (inp) inp.value = '';
  if (res) res.textContent = '';
  nextVocab();
}

// Returns recently graduated vocab_items words for use as sentence scaffolding
// Async version — callers should await. Sync callers get cached value from last call.
let _vocabKnownRecentCache = '';
async function vocabKnownRecent(limit = 20) {
  try {
    const rows = await window.db.query(
      `SELECT v.word, v.meaning FROM vocab_items v
       JOIN vocab_srs s ON s.vocab_id = v.id
       WHERE s.srs_graduated = 1
       GROUP BY v.id
       ORDER BY MAX(s.last_reviewed) DESC
       LIMIT ?`, [limit]
    );
    _vocabKnownRecentCache = (rows || []).map(r => r.word + '（' + r.meaning + '）').join(', ');
    return _vocabKnownRecentCache;
  } catch(e) {
    console.warn('[vocabKnownRecent]', e.message);
    return _vocabKnownRecentCache;
  }
}

// ── App registry — core-vocab.js exports ───────────────────────────────────
Object.assign(App, {
  triageStart, _triageFlip, _triageClose, coreVocabDailyIntake, hideVocabWord, flipVocab, toggleVcDirection, vcRenderTargetsInline, vcDrillWord, vcRenderTargets, wordPriorityScore, wordEnrichWithSRS, vcBuildPriorityList, vocabPriorityContext, vocabKnownRecent, startNewSession, renderVocab, markVocab, isWordMastered, renderGrammar, toggleVcTextEntry, submitVocabTypeAnswer, skipVocabTypeAnswer, vocabTypeMarkWrong, vocabResetSourceFilters, vocabResetPosFilters, migrateLearnedWordsToVocabItems, backfillLessonPhrasesToVocabItems, backfillLookupsToVocabItems, backfillN5ToVocabItems, extractWritingVocabToItems, initWritingVocabListener, initLessonVocabListener, initLookupVocabListener, loadVocabItemsDeck, vocabSettingsSave, vocabSettingsLoad, showChatHistoryEntry,
});
