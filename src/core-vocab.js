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
let vcDirection = 'jp-en'; // 'jp-en' or 'en-jp'
let vocabSession = [];      // indices in current session
let vocabSessionPos = 0;    // position within session

function toggleVcReading(e) {
  if (e) e.stopPropagation();
  vcReadingVisible = !vcReadingVisible;
  const el = document.getElementById('vcReading');
  const btn = document.getElementById('vcReadingToggle');
  if (el) el.style.display = vcReadingVisible ? 'block' : 'none';
  if (btn) btn.textContent = vcReadingVisible ? 'Hide reading' : 'Show reading';
}

let vcPitchVisible = true;
function vcTogglePitch() {
  vcPitchVisible = !vcPitchVisible;
  const el = document.getElementById('vcPitch');
  const btn = document.getElementById('vcPitchToggle');
  if (el) el.style.display = vcPitchVisible ? 'block' : 'none';
  if (btn) btn.classList.toggle('btn-active', vcPitchVisible);
}
function startNewSession() {
  // Don't run before data is loaded — renderVocab will call us again once ready
  if (!_dataLoaded || !state.vocab.length) return;
  if (!state.vocabKnownSessions) state.vocabKnownSessions = {};
  const sizeEl = document.getElementById('sessionSizeSelect');
  const sizeVal = sizeEl ? sizeEl.value : '20';
  const size    = sizeVal === 'all' ? 9999 : parseInt(sizeVal);

  // Level filter (existing UI checkboxes)
  const levelEls    = document.querySelectorAll('.vocab-level-filter:checked');
  const activeLevels = levelEls.length ? new Set([...levelEls].map(el => el.value)) : null;

  // POS filter (new checkboxes — null means all)
  const posEls    = document.querySelectorAll('.vocab-pos-filter:checked');
  const activePOS = posEls.length ? new Set([...posEls].map(el => el.value)) : null;

  // ── Priority-driven selection ────────────────────────────────────────────
  // Build a priority-sorted list from the live word data, then map back to
  // indices in state.vocab so the rest of the session machinery is unchanged.
  try {
    const now       = Date.now();
    const priorityList = vcBuildPriorityList(); // sorted high→low priority

    // Build a lookup: word → index in state.vocab
    const wordToIdx = {};
    state.vocab.forEach((card, i) => { wordToIdx[card.jp] = i; });

    // Apply filters and collect indices in priority order
    const seen   = new Set();
    const pool   = [];

    // Pass 1: SRS overdue words — always include these first
    for (const entry of priorityList) {
      if (pool.length >= size) break;
      const i = wordToIdx[entry.w];
      if (i === undefined || seen.has(i)) continue;
      if (isWordMastered(i)) continue;
      if (activeLevels && !activeLevels.has(entry.l)) continue;
      if (activePOS && !activePOS.has(entry.pos)) continue;
      if (entry.srsDue && entry.srsDue <= now && entry.srsInterval > 0) {
        pool.push(i);
        seen.add(i);
      }
    }

    // Pass 2: remaining words in priority order (no SRS filter)
    for (const entry of priorityList) {
      if (pool.length >= size) break;
      const i = wordToIdx[entry.w];
      if (i === undefined || seen.has(i)) continue;
      if (isWordMastered(i)) continue;
      if (activeLevels && !activeLevels.has(entry.l)) continue;
      if (activePOS && !activePOS.has(entry.pos)) continue;
      pool.push(i);
      seen.add(i);
    }

    // Pass 3: fallback — any eligible word not yet included (covers words
    // not in JLPT_WORDS, custom-added vocab, etc.)
    if (pool.length < size) {
      state.vocab.forEach((card, i) => {
        if (pool.length >= size || seen.has(i)) return;
        if (isWordMastered(i)) return;
        if (activeLevels && card.l && !activeLevels.has(card.l)) return;
        if (activePOS && card.pos && !activePOS.has(card.pos)) return;
        pool.push(i);
        seen.add(i);
      });
    }

    vocabSession    = pool;
    vocabSessionPos = 0;
    vocabIdx        = vocabSession[0] ?? 0;

    const statusEl = document.getElementById('sessionStatus');
    if (statusEl) statusEl.textContent = pool.length
      ? `Session: ${pool.length} words (priority order)`
      : 'All words mastered!';
    renderVocab();
    return;

  } catch(e) {
    console.warn('[startNewSession] priority selection failed, falling back:', e.message);
  }

  // ── Fallback: original random shuffle ───────────────────────────────────
  const eligible = state.vocab.map((_,i) => i).filter(i => {
    if (isWordMastered(i)) return false;
    if (activeLevels && state.vocab[i].l && !activeLevels.has(state.vocab[i].l)) return false;
    if (activePOS && state.vocab[i].pos && !activePOS.has(state.vocab[i].pos)) return false;
    return true;
  });
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  vocabSession    = sizeVal === 'all' ? eligible : shuffled.slice(0, size);
  vocabSessionPos = 0;
  vocabIdx        = vocabSession[0] ?? 0;
  const statusEl  = document.getElementById('sessionStatus');
  if (statusEl) statusEl.textContent = vocabSession.length
    ? `Session: ${vocabSession.length} words`
    : 'All words mastered!';
  renderVocab();
}

function getSessionDeck() {
  return vocabSession.filter(i => !_sessionKnown[i]);
}

const _sessionKnown = {};  // tracks which cards were marked known THIS session

function markVocab(v) {
  if (!vocabSession.length) return;
  const card   = state.vocab[vocabIdx];
  const srsKey = card?.jp || card?.kana || String(vocabIdx); // kanji form — fixes homophone bug

  if (v === 'know') {
    _sessionKnown[vocabIdx] = true;

    // Feed SRS — full correct answer, interval grows normally
    // Mastery is now SRS interval >= 14 days (no more 3-session rule)
    try { DrillSRS.record(STORAGE_KEYS.DRILL_SRS_WORDS, srsKey, true); } catch(e) {}

  } else if (v === 'gotit') {
    // Knew it on reveal — remove from this session (no need to show again today)
    // but cap SRS interval at 1 day so it comes back tomorrow
    _sessionKnown[vocabIdx] = true;

    // Feed SRS — record as correct but then cap interval to 1 day
    try {
      DrillSRS.record(STORAGE_KEYS.DRILL_SRS_WORDS, srsKey, true);
      // Override the interval the SM-2 just set — max 1 day for "needed the reveal"
      const all  = DrillSRS.getAll(STORAGE_KEYS.DRILL_SRS_WORDS);
      const item = all[srsKey];
      if (item && item.interval > 1) {
        item.interval = 1;
        item.due      = Date.now() + 86400000;
        DrillSRS.saveAll(STORAGE_KEYS.DRILL_SRS_WORDS, all);
      }
    } catch(e) {}

  } else {
    // 'again' — move card to back of session
    delete _sessionKnown[vocabIdx];
    state.vocabProgress[vocabIdx] = 'again';
    const sessionPos = vocabSession.indexOf(vocabIdx);
    if (sessionPos !== -1) {
      vocabSession.splice(sessionPos, 1);
      vocabSession.push(vocabIdx);
    }

    // Feed SRS — incorrect answer
    try { DrillSRS.record(STORAGE_KEYS.DRILL_SRS_WORDS, srsKey, false); } catch(e) {}
  }

  saveState();

  // Advance to next card in session
  const deck = getSessionDeck();
  if (deck.length === 0) {
    vocabSession = [];
    renderVocab();
    return;
  }
  if (v === 'again') {
    // card moved to back — take next from front
    const pos = deck.indexOf(vocabIdx);
    vocabIdx = deck[pos === -1 ? 0 : (pos + 1 < deck.length ? pos : 0)] ?? deck[0];
  } else {
    // know or gotit — advance normally
    const pos = deck.indexOf(vocabIdx);
    vocabIdx = pos === -1 ? deck[0] : deck[pos % deck.length] ?? deck[0];
  }
  renderVocab();
}


function renderVocab() {
  // Grab all elements up front — bail if the panel isn't in the DOM yet
  const vocabCardEl   = document.getElementById('vocabCard');
  const vocabCounterEl= document.getElementById('vocabCounter');
  const deckStatusEl  = document.getElementById('vocabDeckStatus');
  const resetBtnEl    = document.getElementById('vocabResetBtn');
  const statusEl      = document.getElementById('sessionStatus');
  if (!vocabCardEl || !vocabCounterEl || !deckStatusEl || !resetBtnEl) return;

  const cards = state.vocab;

  if (!cards.length) {
    const vcJp = document.getElementById('vcJp');
    const vcEn = document.getElementById('vcEn');
    if (vcJp) vcJp.textContent = 'No cards yet';
    if (vcEn) vcEn.textContent = 'Add some below';
    vocabCounterEl.textContent = 'No cards yet — add some below!';
    deckStatusEl.textContent = '';
    resetBtnEl.style.display = 'none';
    renderVocabList();
    return;
  }

  // Auto-start session if none active
  if (!vocabSession.length) {
    if (!_dataLoaded) return; // data not ready yet — will be called again after load
    const hasSession = Object.keys(_sessionKnown).length > 0;
    if (hasSession) {
      // Session complete
      const vcJp = document.getElementById('vcJp');
      const vcRd = document.getElementById('vcReading');
      const vcEn = document.getElementById('vcEn');
      const vcPs = document.getElementById('vcPos');
      if (vcJp) vcJp.textContent = '🎉';
      if (vcRd) vcRd.style.display = 'none';
      if (vcEn) vcEn.textContent = 'Session complete!';
      if (vcPs) vcPs.textContent = '';
      vocabCardEl.classList.remove('flipped');
      vocabCounterEl.textContent = 'All session words known';
      if (statusEl) statusEl.textContent = 'Session done — start a new one';
      resetBtnEl.style.display = 'inline-block';
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
    vocabCounterEl.textContent = 'All session words known';
    if (statusEl) statusEl.textContent = 'Session done — start a new one';
    deckStatusEl.textContent = '';
    resetBtnEl.style.display = 'none';
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

  const enJp = vcDirection === 'en-jp';
  if (hintEl)    hintEl.textContent = enJp ? (card.kana || card.reading || '') : (card.kana || card.reading || '');
  if (vcJp)    { vcJp.textContent   = enJp ? card.en : card.jp;
                 vcJp.style.color   = enJp ? 'var(--ink)' : ''; }
  if (readingEl) {
    readingEl.textContent  = enJp ? '' : (card.kana || card.reading || '');
    readingEl.style.display = (!enJp && vcReadingVisible) ? 'block' : 'none';
  }
  if (vcEn)  vcEn.textContent  = enJp ? (card.jp + (card.kana && card.kana !== card.jp ? '　' + card.kana : '')) : card.en;
  if (_vcBR) _vcBR.textContent = enJp ? '' : (card.kana || card.reading || '');
  if (vcPos) vcPos.textContent = card.pos || '';
  const vcPitchEl = document.getElementById('vcPitch');
  if (vcPitchEl) {
    const kana = card.kana || card.reading || '';
    const _pitchWord = card.jp || kana;
    function _wrapPitch(svg) {
      if (!svg) return '';
      const word = _pitchWord.replace(/'/g, "\\'");
      return '<div title="Hover to hear" style="cursor:pointer;display:block;margin:0 auto" onmouseenter="this._t=setTimeout(()=>jpSpeak(\'' + word + '\',0.85),600)" onmouseleave="clearTimeout(this._t)">' + svg + '</div>';
    }
    if (card.pitch != null) {
      vcPitchEl.innerHTML = _wrapPitch(renderPitchCurve(kana, card.pitch));
    } else if (window.pitchAPI && kana) {
      vcPitchEl.innerHTML = '';
      window.pitchAPI.lookup(card.jp, kana).then(function(pitchStr) {
        if (pitchStr != null) vcPitchEl.innerHTML = _wrapPitch(renderPitchCurve(kana, pitchStr));
      });
    } else {
      vcPitchEl.innerHTML = '';
    }
  }

  vocabCardEl.classList.remove('flipped');

  const pos = deck.indexOf(vocabIdx);
  const masterCount = state.vocab.filter((_,i) => isWordMastered(i)).length;
  const masteredStr = masterCount > 0 ? ` · ${masterCount} mastered` : '';
  const sessions = (state.vocabKnownSessions || {})[vocabIdx] || [];
  const sessionStr = sessions.length > 0 ? ` · ✓×${sessions.length}/3` : '';
  vocabCounterEl.textContent = `Card ${pos + 1} of ${deck.length} remaining in session${masteredStr}${sessionStr}`;
  deckStatusEl.textContent = '';
  resetBtnEl.style.display = masterCount > 0 ? 'inline-block' : 'none';

  if (statusEl) statusEl.textContent = `Session: ${deck.length} left of ${vocabSession.length}`;
  renderVocabList();
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

function flipVocab() {
  vocabFlipped = !vocabFlipped;
  document.getElementById('vocabCard').classList.toggle('flipped', vocabFlipped);
}

function toggleVcDirection() {
  vcDirection = vcDirection === 'jp-en' ? 'en-jp' : 'jp-en';
  const btn = document.getElementById('vcDirectionBtn');
  if (btn) btn.textContent = vcDirection === 'jp-en' ? 'JP → EN' : 'EN → JP';
  renderVocab();
}
function resetVocabDeck() {
  state.vocabProgress = {};
  state.vocabKnownSessions = {};
  saveState();
  vocabSession = [];
  Object.keys(_sessionKnown).forEach(k => delete _sessionKnown[k]);
  startNewSession();
}

function toggleVocabList() {
  const list = document.getElementById('vocabList');
  const btn = document.getElementById('vocabListToggleBtn');
  const printBtn = document.getElementById('vocabListPrintBtn');
  const hidden = list.style.display === 'none';
  list.style.display = hidden ? 'block' : 'none';
  btn.textContent = hidden ? '▼ Hide word list' : '▶ Show word list';
  if (printBtn) printBtn.style.display = hidden ? 'inline-block' : 'none';
  if (hidden) renderVocabList();
}

function renderVocabList() {
  const container = document.getElementById('vocabList');
  if (!container || container.style.display === 'none') return;
  const cards = state.vocab;
  if (!cards.length) {
    container.innerHTML = '<div style="padding:12px 14px;font-family:-apple-system,BlinkMacSystemFont,\'Helvetica Neue\',sans-serif;font-size:0.75rem;color:var(--ink-light);font-style:italic">No words yet.</div>';
    return;
  }
  const knownSessions = state.vocabKnownSessions || {};
  container.innerHTML = cards.map((c, i) => {
    const perm = isWordMastered(i);
    const sessions = knownSessions[i] || [];
    const inSession = vocabSession.includes(i);
    const sessionKnown = !!_sessionKnown[i];
    let dot, dotColor;
    if (perm) { dot = '★'; dotColor = 'var(--teal)'; }
    else if (sessions.length >= 2) { dot = `✓×${sessions.length}`; dotColor = 'var(--gold)'; }
    else if (sessions.length === 1) { dot = '✓×1'; dotColor = 'var(--ink-light)'; }
    else if (sessionKnown) { dot = '✓'; dotColor = 'var(--teal)'; }
    else if (inSession) { dot = '·'; dotColor = 'var(--ink)'; }
    else { dot = ''; dotColor = 'var(--border)'; }
    return `<div style="display:grid;grid-template-columns:32px 1fr 1fr 1fr auto;gap:4px 10px;
      padding:6px 10px;border-bottom:1px solid var(--border);align-items:center;
      cursor:pointer;transition:background 0.1s${inSession && !sessionKnown ? ';background:var(--paper-dark)' : ''}"
      onclick="vocabIdx=${i};if(!vocabSession.includes(${i}))vocabSession.push(${i});renderVocab()"
      class="row-hover">
      <span style="font-family:var(--ui);font-size:0.72rem;color:${dotColor};text-align:center">${dot}</span>
      <span style="font-family:var(--jp);font-size:0.95rem">${escHtml(c.jp)}</span>
      <span style="font-family:var(--jp);font-size:0.82rem;color:var(--ink-light)">${escHtml(c.kana||c.reading||'')}</span>
      <span style="font-family:var(--ui);font-size:0.75rem">${escHtml(c.en)}</span>
      <button class="btn-ghost" onclick="event.stopPropagation();deleteVocabCard(${i})" title="Delete">✕</button>
    </div>`;
  }).join('');
}

function deleteVocabCard(idx) {
  state.vocab.splice(idx, 1);
  delete state.vocabProgress[idx];
  // Rebuild progress keys
  const newProg = {};
  Object.keys(state.vocabProgress).forEach(k => {
    const n = parseInt(k);
    if (n < idx) newProg[n] = state.vocabProgress[n];
    else if (n > idx) newProg[n-1] = state.vocabProgress[n];
  });
  state.vocabProgress = newProg;
  if (vocabIdx >= state.vocab.length) vocabIdx = Math.max(0, state.vocab.length - 1);
  saveState();
  renderVocab();
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

async function vcFetch() {
  const category = document.getElementById('vcFetchCategory').value.trim();
  if (!category) { document.getElementById('vcFetchStatus').textContent = 'Enter a category first.'; return; }
  const count = document.getElementById('sessionSizeSelect')?.value || '10';
  const apiKey = (App.getApiKey || window.getApiKey)?.();
  if (!apiKey) { document.getElementById('vcFetchStatus').textContent = 'No API key — set it in the ⚙ bar.'; return; }

  const btn = document.getElementById('vcFetchBtn');
  const status = document.getElementById('vcFetchStatus');
  const preview = document.getElementById('vcFetchPreview');
  btn.disabled = true; btn.textContent = '…';
  status.textContent = 'Fetching…';
  preview.style.display = 'none';

  const prompt = `Give me ${count} Japanese vocabulary words in the category: "${category}".
Level: N5-N4 beginner. Include common, practical words.
Reply ONLY with a JSON array, no markdown:
[{"jp":"漢字","kana":"かな","en":"English meaning","pos":"noun/verb/adj/etc"}]`;

  try {
    const data = await (App.claudeAPI || window.claudeAPI)({
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }]
    ,
      track: 'vocab'
    });
    const text = (App.claudeText || window.claudeText)(data) || '[]';
    const words = JSON.parse(text.replace(/```json|```/g, '').trim());
    if (!words.length) throw new Error('empty');

    preview.style.display = 'block';
    preview.innerHTML =
      '<div style="background:var(--paper-dark);padding:10px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border)">' +
        '<span style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light)">' + words.length + ' words — tick to add</span>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn-ghost" onclick="vcFetchSelectAll(true)">All</button>' +
          '<button class="btn-ghost" onclick="vcFetchSelectAll(false)">None</button>' +
          '<button class="btn-action" onclick="vcFetchAdd()">Add selected →</button>' +
        '</div>' +
      '</div>' +
      '<div style="max-height:280px;overflow-y:auto">' +
      words.map((w, i) =>
        '<label style="display:flex;align-items:center;gap:12px;padding:8px 14px;border-bottom:1px solid var(--border);cursor:pointer">' +
          '<input type="checkbox" class="vc-fetch-check" data-idx="' + i + '" style="accent-color:var(--teal);flex-shrink:0" checked>' +
          '<span style="font-family:var(--jp);font-size:1.1rem;min-width:60px">' + w.jp + '</span>' +
          '<span style="font-family:var(--ui);font-size:0.78rem;color:var(--ink-light);min-width:80px">' + w.kana + '</span>' +
          '<span style="font-family:var(--ui);font-size:0.85rem;flex:1">' + w.en + '</span>' +
          '<span style="font-family:var(--ui);font-size:0.68rem;color:var(--teal)">' + (w.pos || '') + '</span>' +
        '</label>'
      ).join('') +
      '</div>';
    window._vcFetchWords = words;
    status.textContent = '';
  } catch(e) {
    status.textContent = 'Error fetching words. Try again.';
    preview.style.display = 'none';
  }
  btn.disabled = false; btn.textContent = 'Fetch →';
}

function vcFetchSelectAll(checked) {
  document.querySelectorAll('.vc-fetch-check').forEach(el => el.checked = checked);
}

function vcFetchAdd() {
  const words = window._vcFetchWords || [];
  const checks = document.querySelectorAll('.vc-fetch-check');
  let added = 0;
  checks.forEach(cb => {
    if (!cb.checked) return;
    const w = words[parseInt(cb.dataset.idx)];
    if (!w) return;
    if (state.vocab.some(v => v.jp === w.jp)) return;
    state.vocab.push({ jp: w.jp, kana: w.kana || '', reading: w.kana || '', en: w.en, pos: w.pos || '' });
    added++;
  });
  saveState();
  renderVocabList();
  // Drill exclusively these new words — find their indices in state.vocab
  const newIndices = [];
  checks.forEach(cb => {
    if (!cb.checked) return;
    const w = words[parseInt(cb.dataset.idx)];
    if (!w) return;
    const idx = state.vocab.findIndex(v => v.jp === w.jp);
    if (idx !== -1) newIndices.push(idx);
  });
  if (newIndices.length) {
    vocabSession = newIndices;
    vocabSessionPos = 0;
    vocabIdx = newIndices[0];
    const statusEl = document.getElementById('sessionStatus');
    if (statusEl) statusEl.textContent = 'Session: ' + newIndices.length + ' new words';
    renderVocab();
  }
  document.getElementById('vcFetchPreview').style.display = 'none';
  document.getElementById('vcFetchStatus').textContent = '✓ ' + added + ' word' + (added !== 1 ? 's' : '') + ' added — drilling them now.';
  window._vcFetchWords = [];
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
        <button class="tts-btn btn-icon" onclick="event.stopPropagation();jpSpeak('${g.pattern.replace(/'/g,"\\'")}')" title="Speak pattern">🔊</button>
      </div>
      <div class="grammar-en">${g.en}</div>
      <div class="grammar-example" id="ge${i}" style="display:none">
        ${g.example.replace(/\n/g,'<br>')}
        <button class="tts-btn btn-icon" onclick="event.stopPropagation();jpSpeak('${g.example.split('\n')[0].replace(/'/g,"\\'")}')" title="Speak example">🔊 Speak example</button>
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
      
      let html = '<table style="border-collapse:collapse;margin:12px 0;font-size:0.9rem;width:100%">';
      
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
    
    const reply = (App.claudeText || window.claudeText)(data) || 'Sorry, I had trouble responding.';
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
    grid.innerHTML = '<div style="color:var(--ink-light);font-family:var(--ui);font-size:0.83rem;padding:20px 0">'
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
        <td style="padding:7px 8px;font-family:var(--ui);font-size:0.78rem;color:var(--ink)">${meaning}</td>
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
        <div style="font-family:var(--ui);font-size:0.85rem;color:var(--ink);margin-bottom:4px">
          ${meaning} <span style="color:${levelColor};margin-left:8px">${level}</span>
        </div>
        ${e.translateMeaning && e.translateMeaning !== char
          ? `<div style="font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-bottom:6px">
               From word: <span style="font-family:var(--jp);font-size:0.95rem;color:var(--teal)">${escHtml(e.translateMeaning)}</span>
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
      <td style="padding:6px 8px;font-family:var(--jp);font-size:0.85rem;color:var(--ink-light)">${escHtml(e.r)}</td>
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
        <div style="font-family:var(--ui);font-size:0.85rem;color:var(--ink);margin-bottom:6px">
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

// ── App registry — core-vocab.js exports ───────────────────────────
Object.assign(App, {
  toggleVcDirection, vcRenderTargetsInline, vcDrillWord, vcRenderTargets, wordPriorityScore, wordEnrichWithSRS, vcBuildPriorityList, vocabPriorityContext, startNewSession, renderVocab, markVocab, isWordMastered, renderGrammar,
});
