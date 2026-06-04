// ╔══════════════════════════════════════════════════════════════════════════════
// ║ core-writing.js
// ║ Writing Studio panel — composition, AI feedback, error tracking, RTK.
// ║ Depends on: core-foundation.js, core-stt.js (sttStart)
// ║             features-core.js (jpSpeak), features-kana.js (kanaOn)
// ╚══════════════════════════════════════════════════════════════════════════════

// WRITING STUDIO
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// ERROR TRACKING SYSTEM
// ═══════════════════════════════════════════════════════

function writingErrorsLoad() {
  try {
    AppState.writingErrors = JSON.parse((App.Storage || window.Storage).get(STORAGE_KEYS.WRITING_ERRORS_ALT) || '[]');
  } catch { AppState.writingErrors = []; }
}

function writingErrorsSave() {
  (App.Storage || window.Storage).set(STORAGE_KEYS.WRITING_ERRORS_ALT, JSON.stringify(AppState.writingErrors));
}

// ── Particle pattern normaliser ───────────────────────────────────
function normaliseParticlePattern(pattern) {
  const p = pattern.toLowerCase();
  const hasKana = (k) => pattern.includes(k);

  // は vs が
  if ((hasKana('は') && hasKana('が')) ||
      /topic.*subject|subject.*topic|は.*instead|が.*instead|wrong.*topic|wrong.*subject/.test(p))
    return 'は vs が (topic/subject)';

  // に vs で
  if ((hasKana('に') && hasKana('で')) ||
      /に.*instead.*で|で.*instead.*に|location.*action|action.*location/.test(p))
    return 'に vs で (location)';

  // に vs へ
  if ((hasKana('に') && hasKana('へ')) || /direction|movement/.test(p))
    return 'に vs へ (direction)';

  // missing を
  if (/miss|omit|without|dropped/.test(p) && hasKana('を'))
    return 'missing を (object)';

  // missing に
  if (/miss|omit|without|dropped/.test(p) && hasKana('に'))
    return 'missing に (destination)';

  // missing は/が
  if (/miss|omit|without|dropped/.test(p) && (hasKana('は') || hasKana('が')))
    return 'missing は/が (topic/subject)';

  // から・まで・より
  if (hasKana('から') || hasKana('まで') || hasKana('より') || /kara|made|yori|range|comparison/.test(p))
    return 'から・まで・より (range/comparison)';

  // と vs や
  if ((hasKana('と') && hasKana('や')) || /list|enumerat/.test(p))
    return 'と vs や (listing)';

  // で means/method
  if (/means|method|tool|instrument|by.*using/.test(p))
    return 'で (means/method)';

  // generic missing
  if (/miss|omit|without|dropped|no particle/.test(p))
    return 'missing particle (other)';

  // generic wrong
  if (/wrong|incorrect|instead/.test(p))
    return 'wrong particle (other)';

  // fallback — truncate long free-text to prevent proliferation
  return pattern.length > 40 ? pattern.slice(0, 40) + '\u2026' : pattern;
}

function writingErrorsAdd(input, corrected, errorType, pattern) {
  if (!errorType || errorType === 'none' || !pattern) return;

  // Normalise particle patterns to canonical set before storing
  const normPattern = errorType === 'particle'
    ? normaliseParticlePattern(pattern)
    : pattern;

  // Skip if on denylist
  if (errorDenylistLoad().includes(normPattern)) return;

  const today = new Date().toISOString().slice(0, 10);
  const existing = AppState.writingErrors.find(e => e.pattern === normPattern);
  if (existing) {
    existing.count++;
    existing.date = today;
    existing.input = input;
    existing.corrected = corrected;
  } else {
    AppState.writingErrors.push({
      date: today,
      input: input,
      corrected: corrected,
      errorType: errorType,
      pattern: normPattern,
      count: 1
    });
  }
  writingErrorsSave();

  // Unified error history — timestamped row in error_history SQL table
  try { (App.recordError || window.recordError)?.({ source: 'writing', errorType, pattern: normPattern, input, corrected }); } catch(e) {}

  // Grammar evidence hook — errors are negative signals
  _writingErrorRecordGrammarEvidence(errorType, normPattern);
}

// Map writing error types to grammar nodes and nudge scores down
const WRITING_ERROR_TO_NODE = {
  particle: {
    'は':  'particle_wa',
    'が':  'particle_ga',
    'を':  'particle_wo',
    'に':  'particle_ni_time',
    'で':  'particle_de_place',
    'へ':  'particle_he',
    'と':  'particle_to',
    'も':  'particle_mo',
    'の':  'particle_no_possession',
    'は/が': 'particle_ga',
    'に/で': 'particle_de_place',
  },
  conjugation: {
    'masu':     'present_tense_masu',
    'past':     'past_tense_masu',
    'negative': 'short_forms_plain',
    'te-form':  'te_form',
    'te_form':  'te_form',
    'plain':    'short_forms_plain',
  },
};

function _writingErrorRecordGrammarEvidence(errorType, pattern) {
  try {
    if (typeof GrammarModel === 'undefined' || !GrammarModel.loaded) return;
    const typeMap = WRITING_ERROR_TO_NODE[errorType];
    if (!typeMap) return;
    // Try exact match, then partial match
    let nodeId = typeMap[pattern];
    if (!nodeId) {
      for (const [key, id] of Object.entries(typeMap)) {
        if (pattern.includes(key) || key.includes(pattern)) { nodeId = id; break; }
      }
    }
    if (!nodeId) return;
    if (GrammarModel.isOverridden(nodeId)) return;
    const current = GrammarModel.getScore(nodeId);
    const newScore = Math.max(0, current - 0.06);
    GrammarModel.recordEvidence(nodeId, 'writing', newScore, `error: ${pattern}`).catch(() => {});
  } catch(e) {}
}

function writingErrorsGetTopPatterns(n = 5) {
  // Return top N patterns by count
  return [...AppState.writingErrors].sort((a, b) => b.count - a.count).slice(0, n);
}

function writingErrorsClear() {
  if (!confirm('Clear all written error history? This cannot be undone.')) return;
  // Clear from unified SQL table (primary store)
  window.db?.run('DELETE FROM error_history WHERE source=\'writing\'').catch(e => console.error('[writingErrorsClear]', e));
  // Clear legacy localStorage copy
  AppState.writingErrors = [];
  writingErrorsSave();
  progressRenderErrors();
}

// ── Error denylist ────────────────────────────────────────────────
const ERROR_DENYLIST_KEY = 'writingErrorDenylist';

function errorDenylistLoad() {
  try { return JSON.parse((App.Storage || window.Storage).get(ERROR_DENYLIST_KEY) || '[]'); } catch(e) { return []; }
}

function errorDenylistSave(list) {
  (App.Storage || window.Storage).set(ERROR_DENYLIST_KEY, JSON.stringify(list));
}

function errorDenylistAdd(pattern) {
  const list = errorDenylistLoad();
  if (!list.includes(pattern)) {
    list.push(pattern);
    errorDenylistSave(list);
  }
  // Also remove from active errors so it doesn't linger
  AppState.writingErrors = AppState.writingErrors.filter(e => e.pattern !== pattern);
  writingErrorsSave();
  progressRenderErrors();
}

function errorDenylistRemove(pattern) {
  const list = errorDenylistLoad().filter(p => p !== pattern);
  errorDenylistSave(list);
  progressRenderErrors();
}


// Initialize on load
document.addEventListener('storageReady', writingErrorsLoad);

async function wbCallTutor(text, btnEl, btnLabel) {
  // Shared AI call for check and submit
  if (!(App.getApiKey || window.getApiKey)?.()) { alert('Please add your API key using the ⚙ API button at the top.'); return null; }
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = '…'; }
  const input = document.getElementById('writingInput');
  if (input) input.disabled = true;
  let parsed = null;
  try {
    const checkMessages = [...writingChatHistory, {role:'user', content:text}];

    // Inject recent error pattern context into system prompt
    let systemWithContext = WRITING_SYSTEM;
    const topPatterns = writingErrorsGetTopPatterns(3);
    if (topPatterns.length > 0) {
      const patternSummary = topPatterns.map(p => `- ${p.pattern} (${p.errorType}, seen ${p.count}×)`).join('\n');
      systemWithContext += `\n\nSTUDENT PATTERN AWARENESS (recent errors — use to contextualise feedback, not to add extra criticism):\n${patternSummary}\nIf the student gets one of these right, you may note it briefly. If they repeat one, connect it to the pattern in your note.`;
    }

    const data = await (App.claudeAPI || window.claudeAPI)({
      max_tokens: 600,
      system: systemWithContext,
      messages: checkMessages,
      track: 'writing'
    });
    
    const raw = (App.claudeText || window.claudeText)(data) || '{}';
    try { parsed = JSON.parse(raw.replace(/```json|```/g,'')); parsed._raw = raw; }
    catch(e) { parsed = {corrected:text, isCorrect:true, blockSubmit:false, note:'', detail:'', _raw:raw}; }
  } catch(e) { console.error('Writing check error:', e); alert('Error: ' + e.message); }
  if (btnEl) { btnEl.disabled = false; btnEl.textContent = btnLabel; }
  if (input) { input.disabled = false; input.focus(); }
  return parsed;
}

// Track which sentence text has already had its first-check error recorded
// Resets when the user starts a genuinely new sentence (clears input or submits)
let _writingCheckedSentences = new Set();
let _writingFirstAttempt = null;
let _writingCheckCount   = 0;

async function checkWritingSentence() {
  const _fp = document.querySelector('.feedback-panel');
  if (_fp) { _fp.style.background = 'rgba(48,213,200,0.06)'; _fp.style.transition = 'background 0.4s'; }
  const input = document.getElementById('writingInput');
  const text = input.value.trim();
  if (!text) return;
  const btn = document.getElementById('writingCheckBtn');
  const parsed = await wbCallTutor(text, btn, 'Check');
  const _fp2 = document.querySelector('.feedback-panel');
  if (_fp2) { _fp2.style.background = ''; }
  if (!parsed) return;
  
  // Only record error on the FIRST check of this sentence text
  if (parsed.isCorrect === false && parsed.errorType && parsed.errorType !== 'none') {
    if (!_writingCheckedSentences.has(text)) {
      writingErrorsAdd(text, parsed.corrected || text, parsed.errorType, parsed.errorPattern || '');
    }
  }
  // Mark this text as having been checked (regardless of correct/incorrect)
  if (!_writingFirstAttempt) _writingFirstAttempt = text;
  _writingCheckCount++;
  _writingCheckedSentences.add(text);
  // Keep set from growing unbounded
  if (_writingCheckedSentences.size > 50) {
    const first = _writingCheckedSentences.values().next().value;
    _writingCheckedSentences.delete(first);
  }
  
  drillLastCompletedWrite('writing');
  const entry = {original:text, corrected:parsed.corrected||text, isCorrect:parsed.isCorrect!==false, note:parsed.note||'', detail:parsed.detail||'', translation:parsed.translation||''};
  renderFeedback(entry);
}

async function submitWritingSentence() {
  const input = document.getElementById('writingInput');
  const text = input.value.trim();
  if (!text) return;
  // Reset first-check tracking for next sentence
  _writingCheckedSentences.clear();
  const btn = document.getElementById('writingSubmitBtn');
  // Submit without checking if user chooses to skip check
  writingChatHistory.push({role:'user', content:text});
  kanjiCorpusRecordProduction(text, text.slice(0, 40)); // record on submit only
  if (typeof window !== 'undefined' && window.db) {
    const _ts = new Date().toISOString();
    const _first = _writingFirstAttempt || text;
    const _attempts = _writingCheckCount;
    window.db.run(
      'INSERT INTO writing_sessions (created_at, text, is_correct) VALUES (?,?,?)',
      [_ts, text, 1]
    ).catch(() => {});
    window.db.run(
      'INSERT INTO learning_events (created_at, panel, event_type, payload) VALUES (?,?,?,?)',
      [_ts, 'writing', 'writing:submitted', JSON.stringify({ first_attempt: _first.slice(0,80), final_text: text.slice(0,80), check_count: _attempts })]
    ).catch(() => {});
  try { (App.StudentModel || window.StudentModel)?.invalidate(); } catch(e) {}
  try { (App.AppEvents || window.AppEvents)?.emit(AppEvents.WRITING_SUBMITTED, { first_attempt: _first?.slice(0,80), final_text: text?.slice(0,80), check_count: _attempts }); } catch(e) {}
  }
  _writingFirstAttempt = null;
  _writingCheckCount   = 0;
  const entry = {original:text, corrected:text, isCorrect:true, note:'', detail:''};
  writingSentences.push(entry);
  wbAddItem(entry, writingSentences.length - 1);
  wbUpdateCount();
  input.value = '';
  input.focus();
  // Fire-and-forget background check to update feedback only
  (async () => {
    const parsed = await wbCallTutor(text, null, '');
    if (!parsed) return;
    writingChatHistory.push({role:'assistant', content: parsed && parsed.corrected ? JSON.stringify({corrected:parsed.corrected,isCorrect:parsed.isCorrect,note:parsed.note||'',detail:parsed.detail||''}) : '{}'});
    const idx = writingSentences.length - 1;
    writingSentences[idx].note = parsed.note || '';
    writingSentences[idx].detail = parsed.detail || '';
    writingSentences[idx].isCorrect = parsed.isCorrect !== false;
    // Keep DOM element's _wbData in sync
    const domEl = document.querySelector(`#writingBoard .wb-item[data-idx="${idx}"]`);
    if (domEl) domEl._wbData = {...writingSentences[idx]};
    const noteEl = document.getElementById('wb-note-' + idx);
    if (noteEl && parsed.note) noteEl.textContent = parsed.note;
    const entry2 = {...writingSentences[idx]};
    renderFeedback(entry2);
  })();
}

// ── Sentence board ────────────────────────────────────────────────────────
// AppState.wbDragEl — see declaration below

function wbAddItem(entry, idx) {
  const empty = document.getElementById('writingBoardEmpty');
  if (empty) empty.style.display = 'none';
  const board = document.getElementById('writingBoard');
  const div = document.createElement('div');
  div.className = 'wb-item';
  div.dataset.idx = idx;
  div.draggable = true;
  div.innerHTML = `
    <span class="wb-grip">⠿</span>
    <span class="wb-num">${idx + 1}.</span>
    <span class="wb-text" id="wb-text-${idx}">${entry.original}</span>
    <span style="display:flex;flex-direction:column;gap:2px;flex-shrink:0">
      <button class="wb-edit btn-icon-teal" title="Edit">✎</button>
      <button class="wb-del" title="Delete">✕</button>
    </span>
  `;
  div.querySelector('.wb-del').addEventListener('click', function(e) { e.stopPropagation(); wbDelete(div); });
  div.querySelector('.wb-edit').addEventListener('click', function(e) {
    e.stopPropagation();
    const textSpan = div.querySelector('.wb-text');
    const current = textSpan.textContent;
    const inp = document.createElement('input');
    inp.value = current;
    inp.style.background = 'var(--paper-dark)'; inp.style.border = '1px solid var(--teal)'; inp.style.color = 'var(--ink)'; inp.style.fontFamily = "'Noto Sans JP',sans-serif"; inp.style.fontSize = '1rem'; inp.style.padding = '2px 6px'; inp.style.borderRadius = '4px'; inp.style.width = '100%';
    textSpan.replaceWith(inp);
    kanaOn(inp);
    inp.focus();
    const save = () => {
      const newText = inp.value.trim() || current;
      kanaOff(inp);
      const span = document.createElement('span');
      span.className = 'wb-text';
      span.id = 'wb-text-' + idx;
      span.textContent = newText;
      inp.replaceWith(span);
      div._wbData.original = newText;
      div._wbData.corrected = newText;
    };
    inp.addEventListener('blur', save);
    inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); } if (ev.key === 'Escape') { inp.value = current; inp.blur(); } });
  });
  div._wbData = entry;
  div.addEventListener('dragstart', wbDragStart);
  div.addEventListener('dragover',  wbDragOver);
  div.addEventListener('dragleave', wbDragLeave);
  div.addEventListener('drop',      wbDrop);
  div.addEventListener('dragend',   wbDragEnd);
  board.appendChild(div);
}

function wbDelete(item) {
  item.remove();
  // Rebuild writingSentences strictly from surviving DOM elements' stored data
  writingSentences = [...document.querySelectorAll('#writingBoard .wb-item')]
    .map(el => el._wbData || {});
  wbRenumber();
  wbUpdateCount();
  const board = document.getElementById('writingBoard');
  const empty = document.getElementById('writingBoardEmpty');
  if (board && empty) empty.style.display = board.children.length === 0 ? 'block' : 'none';
}

function wbRenumber() {
  document.querySelectorAll('#writingBoard .wb-item').forEach((el, i) => {
    el.dataset.idx = i;
    el.querySelector('.wb-num').textContent = (i + 1) + '.';
    const noteEl = el.querySelector('.wb-note');
    if (noteEl) noteEl.id = 'wb-note-' + i;
    // Re-bind delete (clone to remove old listeners)
    const oldDel = el.querySelector('.wb-del');
    const newDel = oldDel.cloneNode(true);
    oldDel.parentNode.replaceChild(newDel, oldDel);
    newDel.addEventListener('click', function(e) { e.stopPropagation(); wbDelete(el); });
  });
}

function wbUpdateCount() {
  const n = writingSentences.length;
  const el = document.getElementById('sentenceCount');
  if (el) el.textContent = n + ' sentence' + (n !== 1 ? 's' : '');
}

function wbDragStart(e) {
  AppState.wbDragEl = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  // Firefox requires dataTransfer data to be set
  e.dataTransfer.setData('text/plain', '');
}
function wbDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (this !== AppState.wbDragEl) this.classList.add('drag-over');
}
function wbDragLeave(e) {
  this.classList.remove('drag-over');
}
function wbDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  this.classList.remove('drag-over');
  if (!AppState.wbDragEl || AppState.wbDragEl === this) return;
  const board = document.getElementById('writingBoard');
  const items = [...board.querySelectorAll('.wb-item')];
  const fromPos = items.indexOf(AppState.wbDragEl);
  const toPos   = items.indexOf(this);
  if (fromPos === -1 || toPos === -1) return;
  // Move DOM element
  if (fromPos < toPos) board.insertBefore(AppState.wbDragEl, this.nextSibling);
  else board.insertBefore(AppState.wbDragEl, this);
  // Rebuild writingSentences from new DOM order
  writingSentences = [...board.querySelectorAll('.wb-item')].map(el => el._wbData || {});
  wbRenumber();
}
function wbDragEnd() {
  if (AppState.wbDragEl) AppState.wbDragEl.classList.remove('dragging');
  document.querySelectorAll('.wb-item').forEach(el => el.classList.remove('drag-over'));
  AppState.wbDragEl = null;
}

function renderTextSoFar() { wbUpdateCount(); } // legacy stub

function wbCopyInput() {
  const inp = document.getElementById('writingInput');
  if (!inp || !inp.value.trim()) return;
  navigator.clipboard.writeText(inp.value.trim()).then(() => {
    const btn = document.querySelector('.writing-util-btn');
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1500);
  });
}
function renderFeedback(entry) {
  const container = document.getElementById('feedbackEntries');
  container.querySelectorAll('.feedback-empty').forEach(e => e.remove());

  // Collapse all existing entries
  container.querySelectorAll('.feedback-entry').forEach(el => {
    el.classList.add('fe-collapsed');
    const body = el.querySelector('.fe-body');
    if (body) body.style.display = 'none';
    const tog = el.querySelector('.fe-toggle');
    if (tog) tog.textContent = '▸';
  });

  const idx = writingSentences.length - 1;
  const div = document.createElement('div');
  div.className = 'feedback-entry fe-current';
  div.dataset.idx = idx;
  const isOk = entry.isCorrect;
  const note = entry.note || entry.notes?.[0] || '';
  const detail = entry.detail || '';
  const translation = entry.translation || '';
  const detailId = `fe-detail-${idx}`;

  div.innerHTML = `
    <div class="fe-header" onclick="feToggle(this.parentElement)">
      <span class="fe-toggle">▾</span>
      <button onclick="event.stopPropagation();deleteWritingEntry(${idx})"
        class="fe-del">✕</button>
    </div>
    <div class="fe-body">
      ${!isOk ? `<div class="fe-row"><span class="fe-label">Corrected</span>
        <span style="font-family:var(--jp);font-size:1.05rem;color:var(--ink);line-height:1.7">${highlightCorrectedParticles(entry.original||'', entry.corrected||'')}</span></div>` : ''}
      ${translation ? `<div class="fe-row"><span class="fe-label">Meaning</span>
        <span style="font-family:var(--ui);font-size:inherit;color:var(--ink);font-style:italic">${translation}</span></div>` : ''}
      ${note ? `<div class="fe-row"><span class="fe-label">Note</span>
        <span style="font-family:var(--ui);font-size:inherit;color:var(--ink);line-height:1.6">${note}</span></div>` : ''}
      ${detail ? `<div class="fe-row" style="cursor:pointer" onclick="toggleDetail('${detailId}',this.querySelector('.fe-more-btn'))" >
        <span class="fe-label">Detail</span>
        <div style="flex:1">
          <button class="fe-more-btn">more ↓</button>
          <div id="${detailId}" style="display:none;margin-top:6px;font-family:var(--ui);font-size:inherit;color:var(--ink);line-height:1.7">${detail}</div>
        </div></div>` : ''}
    </div>
  `;
  container.innerHTML = '';
  container.appendChild(div);
}

function feToggle(el) {
  const collapsed = el.classList.toggle('fe-collapsed');
  const body = el.querySelector('.fe-body');
  if (body) body.style.display = collapsed ? 'none' : 'block';
  const tog = el.querySelector('.fe-toggle');
  if (tog) tog.textContent = collapsed ? '▸' : '▾';
  if (!collapsed) el.classList.remove('fe-current');
}

function toggleDetail(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  const open = el.style.display === 'none';
  el.style.display = open ? 'block' : 'none';
  btn.textContent = open ? 'less ↑' : 'more ↓';
}


function deleteWritingEntry(idx) {
  // Remove from writingSentences
  writingSentences.splice(idx, 1);
  // Re-render text so far
  renderTextSoFar();
  // Feedback entries are kept — deleting a sentence from the built text
  // does not remove its associated correction notes
}

function handleWritingKey(e) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitWritingSentence(); }
  else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); checkWritingSentence(); }
}

function clearWritingFeedback() {
  document.getElementById('feedbackEntries').innerHTML = '<div class="feedback-empty">Type a sentence and click here to check it.</div>';
  document.getElementById('feedbackCount').textContent = '—';
  const inp = document.getElementById('writingInput');
  if (inp) { inp.value = ''; inp.focus(); }
  const _fp = document.querySelector('.feedback-panel');
  if (_fp) { _fp.style.background = ''; }
}

function saveWritingText() {
  if (writingSentences.length === 0) { alert('Nothing to save yet!'); return; }
  const text = writingSentences.map(s => s.corrected).join('　');
  const saved = (App.Storage || window.Storage).getStudioTexts();
  const _now = new Date(); const _time = _now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); saved.unshift({date: _now.toLocaleDateString() + ' ' + _time, text, count: writingSentences.length});
  (App.Storage || window.Storage).setStudioTexts(saved.slice(0, 20));
  renderSavedTexts();
  alert('Saved!');
}

function renderSavedTexts() {
  const saved = (App.Storage || window.Storage).getStudioTexts();
  const area = document.getElementById('savedTextsArea');
  const list = document.getElementById('savedTextsList');
  if (!saved.length) { if (area) area.style.display = 'none'; return; }
  if (area) area.style.display = 'block';
  list.innerHTML = saved.map((t,i) => `
    <div class="saved-text-item">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">
        <div class="sti-date">${t.date} · ${t.count} sentences</div>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="btn-action" onclick="copySavedText(${i})" id="sti-copy-${i}" title="Copy full text">Copy</button>
          <button class="btn-icon btn-icon-del" onclick="deleteSavedText(${i})" title="Delete">✕</button>
        </div>
      </div>
      <div class="sti-preview" style="font-family:var(--jp);font-size:inherit;line-height:1.8;color:var(--ink);white-space:pre-wrap;user-select:text;cursor:text">${t.text}</div>
    </div>
  `).join('');
}

function copySavedText(i) {
  const saved = (App.Storage || window.Storage).getStudioTexts();
  if (!saved[i]) return;
  navigator.clipboard.writeText(saved[i].text).then(() => {
    const btn = document.getElementById('sti-copy-' + i);
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = '✓ Copied';
    btn.style.color = 'var(--teal)';
    btn.style.borderColor = 'var(--teal)';
    setTimeout(() => {
      btn.textContent = orig;
      btn.style.color = 'var(--ink-light)';
      btn.style.borderColor = 'var(--border)';
    }, 1800);
  });
}
function deleteSavedText(i) {
  const saved = (App.Storage || window.Storage).getStudioTexts();
  saved.splice(i, 1);
  (App.Storage || window.Storage).setStudioTexts(saved);
  renderSavedTexts();
}

let writingSpeechRec = null;



// ── Particle/verb highlighting ────────────────────────────────
function _tokenExistsInOriginal(original, corrected, i, token) {
  const tLen = token.length;
  let pos = original.indexOf(token);
  while (pos !== -1) {
    const oBefore = pos > 0 ? original[pos - 1] : '';
    const oAfter  = pos + tLen < original.length ? original[pos + tLen] : '';
    const cBefore = i > 0 ? corrected[i - 1] : '';
    const cAfter  = i + tLen < corrected.length ? corrected[i + tLen] : '';
    if (oBefore === cBefore && oAfter === cAfter) return true;
    pos = original.indexOf(token, pos + 1);
  }
  return false;
}

function highlightCorrectedParticles(original, corrected) {
  if (!original || !corrected || original === corrected) return escHtml(corrected);
  const particles = ['について','に対して','に関して','からの','までの','という',
    'では','には','での','への','との','から','まで','より','です','ます','である',
    'は','が','を','に','で','へ','と','も','の','や','か','ね','よ','て','ば','な'];
  const verbEndings = ['ました','ません','ませんでした','られる','られた','させる','させた',
    'たい','たかった','ながら','てしまう','てしまった','ている','ていた','ておく','てある',
    'なかった','なければ','なくて','ないで','べき','はず','かもしれない',
    'だった','でした','じゃない','ではない','った','んだ','のだ','のです','んです',
    'る','た','ず','ない'];
  verbEndings.sort((a,b) => b.length - a.length);
  particles.sort((a,b) => b.length - a.length);

  // A verb ending match is only valid at a token boundary — the character
  // immediately after must not be a kana that continues a content word.
  // Particles, punctuation, spaces, and end-of-string are valid boundaries.
  function isTokenBoundary(pos) {
    if (pos >= corrected.length) return true;
    const ch = corrected[pos];
    // Allow if next char starts a known particle
    if (particles.some(p => corrected.slice(pos).startsWith(p))) return true;
    // Allow punctuation / whitespace / ASCII
    if (/[\s\u3002\u3001\uff01\uff1f\uff0e\u300c\u300d\uff08\uff09\u30fb\u2026]/.test(ch)) return true;
    if (/[a-zA-Z0-9\s.,!?]/.test(ch)) return true;
    // Reject if it's a hiragana/katakana content character (would mean mid-word)
    if (/[\u3041-\u3096\u30A1-\u30FA]/.test(ch)) return false;
    return true;
  }

  const corrArr = Array.from(corrected);
  let result = ''; let i = 0;
  while (i < corrArr.length) {
    let found = false;
    // Only try verb endings when we're at a token boundary on the *right* side
    for (const ve of verbEndings) {
      if (corrected.slice(i, i + ve.length) === ve && isTokenBoundary(i + ve.length)) {
        const isCorr = !_tokenExistsInOriginal(original, corrected, i, ve);
        result += isCorr ? '<span class="corrected-verb">' + escHtml(ve) + '</span>' : escHtml(ve);
        i += ve.length; found = true; break;
      }
    }
    if (found) continue;
    for (const p of particles) {
      if (corrected.slice(i, i + p.length) === p) {
        const isCorr = !_tokenExistsInOriginal(original, corrected, i, p);
        result += isCorr ? '<span class="corrected-particle">' + escHtml(p) + '</span>' : escHtml(p);
        i += p.length; found = true; break;
      }
    }
    if (!found) { result += escHtml(corrArr[i]); i++; }
  }
  return result;
}

// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, {
    writingErrorsLoad,
    writingErrorsSave,
    writingErrorsAdd,
    writingErrorsGetTopPatterns,
    writingErrorsClear,
    errorDenylistLoad,
    errorDenylistSave,
    errorDenylistAdd,
    errorDenylistRemove,
    normaliseParticlePattern,
    wbAddItem,
    wbDelete,
    wbRenumber,
    wbUpdateCount,
    highlightCorrectedParticles,
  });
} catch(e) { console.error('[core-writing] App registry failed:', e); }
