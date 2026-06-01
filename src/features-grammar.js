// ═══════════════════════════════════════════════════════
// FEATURES-GRAMMAR
// Grammar Drill · Grammar Sentence Drill · Te-Form Drill
// Requires: core.js, features-core.js, features-kana.js,
//           briefing-prompt.js, GrammarModel.js
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// GRAMMAR DRILL
// ═══════════════════════════════════════════════════════

let gdSentences = [];    // [{jp, en, hint}, ...]
let gdIdx = 0;
let gdResults = [];      // [{correct, userAnswer, feedback}, ...]
let gdOk = 0, gdMiss = 0;
let gdChecked = false;
let gdConfig = {};

const GD_PRESETS = [
  'Past negative い-adj',
  'て-form requests',
  'Conditional ~たら',
  'Potential form',
  'て-form + います',
  'Past tense verbs',
  'な-adjective sentences',
  'Negative present verbs',
  'Direction に + movement',
  'も / も~ない',
];

const GD_SESSIONS_KEY = 'jpStudioGdSessions';

async function gdGenerate() {
  const area = document.getElementById('gdDrillArea');
  try {
    const checked = [...document.querySelectorAll('input[name=gdPreset]:checked')].map(el => el.value);
    const target = checked.join(' + ');
    if (!target) {
      gdEnterDrillMode();
      area.innerHTML = '<div class="gd-idle"><div style="color:var(--red);font-size:1rem;padding:20px">⚠ Please tick at least one grammar target.</div></div>';
      return;
    }
    const apiKey = getApiKey();
    if (!apiKey) {
      gdEnterDrillMode();
      area.innerHTML = '<div class="gd-idle"><div style="color:var(--red);font-size:1rem;padding:20px">⚠ No API key — open ⚙ and save your Anthropic key.</div></div>';
      return;
    }
    gdEnterDrillMode();

    const level = document.getElementById('gdLevel').value;
    const count = document.getElementById('gdCount').value;
    const context = document.getElementById('gdContext').value.trim();
    const direction = document.getElementById('gdDirectionValue')?.value || 'en-jp';
    const register = document.querySelector('input[name=gdRegister]:checked')?.value || 'both';

    gdConfig = { direction };
    const btn = document.getElementById('gdGenerateBtn');
    btn.disabled = true;
    btn.textContent = 'Generating…';

    const registerNote = register === 'both' ? 'Mix polite and plain forms.' :
                         register === 'polite' ? 'Use polite forms only (ます/です).' : 'Use plain forms only.';
    const contextNote = context ? `Set sentences in the context of: ${context}.` : '';
    const prompt = `Generate ${count} Japanese sentences for a ${level} grammar drill targeting: "${target}".
${registerNote}${contextNote ? '\n' + contextNote : ''}
Each sentence must clearly use the target grammar. Include a natural English translation and a brief grammar hint (one sentence explaining the grammar point used).
Reply ONLY with a JSON array, no markdown:
[{"jp":"Japanese sentence","en":"English translation","hint":"grammar hint"}]`;

    area.innerHTML = `<div class="gd-idle"><div class="gd-idle-char" style="animation: pulse-border 1s infinite">…</div><div>Generating ${count} sentences…</div></div>`;

    const data = await claudeAPI({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
    ,
      track: 'grammar'
    });
    const text = data.content?.[0]?.text || '[]';
    const clean = text.replace(/```json|```/g, '').trim();
    gdSentences = JSON.parse(clean);
    if (!gdSentences.length) throw new Error('No sentences returned');


    gdIdx = 0; gdOk = 0; gdMiss = 0;
    gdResults = new Array(gdSentences.length).fill(null);
    gdChecked = false;
    gdRenderCard();

    const btn2 = document.getElementById('gdGenerateBtn');
    if (btn2) { btn2.disabled = false; btn2.textContent = 'Generate Drill →'; }

  } catch(e) {
    area.innerHTML = '<div class="gd-idle"><div style="color:var(--red);font-size:0.9rem;padding:20px">Error: ' + e.message + '</div></div>';
    const btn = document.getElementById('gdGenerateBtn');
    if (btn) { btn.disabled = false; btn.textContent = 'Generate Drill →'; }
  }
}


function gdRenderCard() {
  const area = document.getElementById('gdDrillArea');
  if (gdIdx >= gdSentences.length) { gdRenderComplete(); return; }

  const s = gdSentences[gdIdx];
  const dir = gdConfig.direction || 'jp-en';
  const isJpEn = dir === 'jp-en';
  const dots = gdSentences.map((_, i) => {
    const r = gdResults[i];
    const cls = r === null ? (i === gdIdx ? 'cur' : '') : r.correct ? 'ok' : 'miss';
    return `<div class="gd-dot ${cls}"></div>`;
  }).join('');
  const autoHint = document.getElementById('gdAutoHint')?.checked;

  area.innerHTML = `
    <div class="gd-stats">
      <span>Correct: <strong style="color:var(--teal)">${gdOk}</strong></span>
      <span>Wrong: <strong style="color:var(--red)">${gdMiss}</strong></span>
      <span>Left: <strong>${gdSentences.length - gdIdx}</strong></span>
    </div>
    <div class="gd-progress-row">${dots}</div>
    <div class="gd-card">

      <div class="${isJpEn ? 'gd-source' : 'gd-source-en'}">${isJpEn ? s.jp : s.en}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="gd-hint-toggle" onclick="gdToggleHint(this)">▸ Grammar hint</button>
        <button class="gd-hint-toggle" onclick="gdToggleVocabHint(this)">▸ Vocab hint</button>
      </div>
      <div class="gd-hint${autoHint ? ' show' : ''}" id="gdHint">${s.hint}</div>
      <div class="gd-hint" id="gdVocabHint"></div>
      <input type="text" class="gd-answer-input" id="gdAnswerInput"
        placeholder="${isJpEn ? 'Type English translation…' : 'Type Japanese…'}"
        autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false"
        onkeydown="if(event.key==='Enter'){if(DrillFlow._advancing)return;if(DrillFlow._waitingEnter){DrillFlow.advance();return;}gdCheck();}">
      <div class="gd-feedback" id="gdFeedback"></div>
      <div class="gd-btn-row">
        <button class="btn-action" id="gdCheckBtn" onclick="gdCheck()">Check</button>
        <button class="btn-action" id="gdNextBtn" onclick="gdNext()">Next →</button>
        ${isJpEn ? `<button class="tts-btn" onclick="jpSpeak('${s.jp.replace(/'/g,"\'")}')">🔊</button>` : ''}
      </div>
    </div>
  `;
  const _gdAns = document.getElementById('gdAnswerInput');
  const _isJP = (gdConfig.direction || 'en-jp') === 'en-jp';
  if (_gdAns) {
    kanaToolbar('gdAnswerInput', { defaultMode: _isJP ? 'hiragana' : 'romaji' });
    _gdAns.focus();
  }
  gdChecked = false;
}

function gdSelectAll() {
  const boxes = document.querySelectorAll('input[name=gdPreset]');
  const anyChecked = Array.from(boxes).some(b => b.checked);
  boxes.forEach(b => b.checked = !anyChecked);
  // Update button label
  const btn = event.target;
  btn.textContent = anyChecked ? 'select all' : 'clear all';
}

function gdEnterDrillMode() {
  const layout = document.getElementById('gdLayout');
  const setupPanel = document.getElementById('gdSetupPanel');
  const sidebar = document.getElementById('gdTargetSidebar');
  const drillArea = document.getElementById('gdDrillArea');
  if (!layout) return;

  // Build sidebar list from checked targets
  const checked = Array.from(document.querySelectorAll('input[name=gdPreset]:checked')).map(el => el.value);
  const sidebarList = document.getElementById('gdTargetSidebarList');
  if (sidebarList) {
    sidebarList.innerHTML = checked.map(v => {
      // Shorten label: strip parenthetical explanations
      const label = v.replace(/\s*\([^)]+\)/g, '').replace(/\s*~[^\s]+/, t => ' ' + t.trim());
      return `<div style="font-family:var(--ui);font-size:0.72rem;color:var(--ink);padding:3px 6px;background:rgba(48,213,200,0.08);border:1px solid var(--teal);border-radius:4px">${label}</div>`;
    }).join('');
  }

  layout.classList.add('drill-mode');
  if (setupPanel) setupPanel.style.display = 'none';
  if (sidebar) sidebar.style.display = checked.length ? 'block' : 'none';
  if (drillArea) drillArea.style.display = 'block';
}

function gdExitDrillMode() {
  const layout = document.getElementById('gdLayout');
  const setupPanel = document.getElementById('gdSetupPanel');
  const sidebar = document.getElementById('gdTargetSidebar');
  const drillArea = document.getElementById('gdDrillArea');
  layout.classList.remove('drill-mode');
  if (setupPanel) setupPanel.style.display = '';
  if (sidebar) sidebar.style.display = 'none';
  if (drillArea) { drillArea.style.display = 'none'; drillArea.innerHTML = ''; }
}

function gdToggleDirection() {
  const val = document.getElementById('gdDirectionValue');
  const btn = document.getElementById('gdDirectionToggle');
  if (!val || !btn) return;
  const next = val.value === 'en-jp' ? 'jp-en' : 'en-jp';
  val.value = next;
  btn.textContent = next === 'jp-en' ? 'JP → EN' : 'EN → JP';
}

function gdToggleHint(btn) {
  const hint = document.getElementById('gdHint');
  const open = hint.classList.toggle('show');
  btn.textContent = (open ? '▾' : '▸') + ' Grammar hint';
}

function gdToggleVocabHint(btn) {
  const hint = document.getElementById('gdVocabHint');
  const open = hint.classList.toggle('show');
  btn.textContent = (open ? '▾' : '▸') + ' Vocab hint';
  if (open && !hint.dataset.loaded) {
    const s = gdSentences[gdIdx];
    if (!s) return;
    const apiKey = getApiKey();
    if (!apiKey) { hint.innerHTML = '<em>No API key</em>'; return; }
    hint.innerHTML = '<em style="color:var(--ink-light);font-size:0.8rem">Loading…</em>';
    claudeAPI({
        model: 'claude-sonnet-4-6', max_tokens: 400,
        messages: [{ role: 'user', content: 'List the content words in this Japanese sentence with their dictionary form, reading, and meaning. Show ONLY the dictionary/plain form — not the conjugated form in the sentence.\nSentence: ' + s.jp + '\nFormat: 辞書形（reading）= meaning, one per line. Be concise.' }]
      ,
        track: 'grammar'
      }).then(data => {
      hint.innerHTML = (data.content?.[0]?.text || '').replace(/\n/g, '<br>');
      hint.dataset.loaded = '1';
    }).catch(() => { hint.innerHTML = '<em>Error</em>'; });
  }
}

async function gdCheck() {
  if (gdChecked) { gdNext(); return; }
  const input = document.getElementById('gdAnswerInput');
  const val = input.value.trim();
  if (!val) return;
  const s = gdSentences[gdIdx];
  const dir = gdConfig.direction || 'jp-en';
  const isJpEn = dir === 'jp-en';
  const correctAns = isJpEn ? s.en : s.jp;

  const fb = document.getElementById('gdFeedback');
  const btn = document.getElementById('gdCheckBtn');
  btn.textContent = '…';
  btn.disabled = true;

  const apiKey = getApiKey();
  let correct = false;
  let feedbackHtml = '';

  if (apiKey) {
    try {
      const prompt = isJpEn
        ? `Japanese: "${s.jp}". Correct English translation: "${s.en}". Student answered: "${val}". Grade this translation. Be liberal — accept natural paraphrases and synonyms. Reply ONLY with JSON: {"correct":true/false,"feedback":"one sentence — what was right or wrong","correctAnswer":"${s.en}"}`
        : `English: "${s.en}". Target grammar: "${s.hint}". Correct Japanese: "${s.jp}". Student wrote: "${val}". Grade this. Accept natural variations. IMPORTANT: When mentioning any Japanese words with kanji in your feedback, add hiragana reading in brackets after, e.g. 食べる(たべる). Reply ONLY with JSON: {"correct":true/false,"feedback":"one sentence explaining error or confirming","correctAnswer":"${s.jp}"}`;

      const data = await claudeAPI({ model: 'claude-sonnet-4-6', max_tokens: 150,
          messages: [{ role: 'user', content: prompt }] ,
            track: 'grammar'
          });
      const parsed = JSON.parse((data.content?.[0]?.text || '{}').replace(/```json|```/g,'').trim());
      correct = parsed.correct === true;
      feedbackHtml = `<div>${parsed.feedback || ''}</div><div class="gd-correct-ans">${correct ? '✓' : '→ '} ${parsed.correctAnswer || correctAns}</div>`;
    } catch(e) {
      correct = val.toLowerCase().includes(correctAns.toLowerCase().slice(0,8));
      feedbackHtml = `<div class="gd-correct-ans">→ ${correctAns}</div>`;
    }
  } else {
    // No API key — simple check
    correct = val.toLowerCase().replace(/[.,!?]/g,'').includes(correctAns.toLowerCase().replace(/[.,!?]/g,'').slice(0,10));
    feedbackHtml = `<div class="gd-correct-ans">→ ${correctAns}</div>`;
  }

  input.className = 'gd-answer-input ' + (correct ? 'correct' : 'wrong');
  fb.innerHTML = feedbackHtml;
  fb.className = 'gd-feedback show ' + (correct ? 'ok' : 'bad');

  gdResults[gdIdx] = { correct, userAnswer: val };
  if (correct) gdOk++; else gdMiss++;
  gdChecked = true;
  btn.textContent = 'Next';
  btn.disabled = false;
  btn.onclick = gdNext;

  // Update dot
  const dots = document.querySelectorAll('.gd-dot');
  if (dots[gdIdx]) dots[gdIdx].className = 'gd-dot ' + (correct ? 'ok' : 'miss');

  if (correct) { DrillFlow.correct(() => gdNext(), 1200); }
  else { DrillFlow.wrong(() => gdNext()); }
}

function gdNext() {
  if (DrillFlow._advancing) return;
  DrillFlow.reset();
  if (!gdChecked) { gdResults[gdIdx] = { correct: false, userAnswer: '' }; gdMiss++; }
  gdIdx++;
  gdChecked = false;
  gdRenderCard();
}

function gdRenderComplete() {
  // Save session now that it's completed


  const area = document.getElementById('gdDrillArea');
  const pct = Math.round(gdOk / gdSentences.length * 100);
  const dir = gdConfig.direction || 'jp-en';
  const isJpEn = dir === 'jp-en';

  const summaryItems = gdSentences.map((s, i) => {
    const r = gdResults[i] || { correct: false, userAnswer: '' };
    return `<div class="gd-summary-item ${r.correct ? 'ok' : 'miss'}">
      <div class="gd-summary-jp">${isJpEn ? s.jp : s.en}</div>
      ${r.userAnswer ? `<div class="gd-summary-user">You: ${r.userAnswer}</div>` : '<div class="gd-summary-user" style="color:var(--red)">Skipped</div>'}
      ${!r.correct ? `<div class="gd-summary-correct">→ ${isJpEn ? s.en : s.jp}</div>` : ''}
    </div>`;
  }).join('');

  area.innerHTML = `
    <div class="gd-idle" style="min-height:120px;margin-bottom:20px">
      <div style="font-size:2.5rem">${pct >= 80 ? '🎉' : pct >= 50 ? '📖' : '💪'}</div>
      <strong>${gdOk} / ${gdSentences.length} correct · ${pct}%</strong>
      <button class="gd-generate-btn" onclick="gdGenerate()">Drill Again →</button>
    </div>
    <div class="gd-summary">
      <div class="gd-summary-title">REVIEW</div>
      ${summaryItems}
    </div>
  `;
  }





// ═══════════════════════════════════════════════════════
// GRAMMAR SENTENCE DRILL (grammar2 panel → Sentences tab)
// Parallel to gdGenerate in the lesson study section.
// ═══════════════════════════════════════════════════════

const GRAM_SENT_HISTORY_KEY = 'gramSentHistory';
const GRAM_SENT_MAX_HISTORY = 20;
const GRAM_SENT_TOTAL = 5;

// ── State ──────────────────────────────────────────────
const GramSentState = {
  sentences:   [],   // [{jp, en, hint}]
  idx:         0,
  results:     [],   // [{correct, userAnswer}]
  ok:          0,
  miss:        0,
  checked:     false,
  target:      '',   // grammar point being drilled
  autoMode:    false,
};

// ── History ────────────────────────────────────────────

function gramSentHistoryLoad() {
  try { return Storage.getJSON(GRAM_SENT_HISTORY_KEY, []); }
  catch { return []; }
}

function gramSentHistorySave(target) {
  if (!target) return;
  const hist = gramSentHistoryLoad().filter(h => h !== target);
  hist.unshift(target);
  Storage.setJSON(GRAM_SENT_HISTORY_KEY, hist.slice(0, GRAM_SENT_MAX_HISTORY));
}

function gramSentPopulateHistory() {
  const sel = document.getElementById('gramSentHistory');
  if (!sel) return;
  const hist = gramSentHistoryLoad();
  sel.innerHTML = '<option value="">Select recent grammar point...</option>' +
    hist.map(h => `<option value="${h.replace(/"/g,'&quot;')}">${h}</option>`).join('');
}

function gramSentLoadHistory(val) {
  if (!val) return;
  const inp = document.getElementById('gramSentInput');
  if (inp) inp.value = val;
}

// ── Mode toggle (manual ↔ auto from error patterns) ───

function gramSentToggleMode() {
  GramSentState.autoMode = !GramSentState.autoMode;
  const manPanel  = document.getElementById('gramSentManualPanel');
  const autoPanel = document.getElementById('gramSentAutoPanel');
  const btn       = document.getElementById('gramSentModeToggle');
  if (manPanel)  manPanel.style.display  = GramSentState.autoMode ? 'none' : '';
  if (autoPanel) autoPanel.style.display = GramSentState.autoMode ? '' : 'none';
  if (btn) {
    btn.textContent = GramSentState.autoMode ? '✏ Manual' : '🎯 Auto';
    btn.classList.toggle('toggle-on', GramSentState.autoMode);
  }
  if (GramSentState.autoMode) gramSentPopulateWeakPoints();
}

function gramSentPopulateWeakPoints() {
  const container = document.getElementById('gramSentWeakPoints');
  const empty     = document.getElementById('gramSentAutoEmpty');
  if (!container) return;
  try {
    const errors = JSON.parse(Storage.get(STORAGE_KEYS.WRITING_ERRORS) || '[]');
    const patterns = [...new Set(errors.map(e => e.errorPattern).filter(Boolean))].slice(0, 12);
    if (!patterns.length) {
      container.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';
    container.innerHTML = patterns.map(p =>
      `<button class="btn-action btn-sm" onclick="gramSentSelectWeakPoint(this,'${p.replace(/'/g,"\'")}')">` +
      `${p}</button>`
    ).join('');
  } catch { container.innerHTML = ''; }
}

function gramSentSelectWeakPoint(btn, pattern) {
  const inp = document.getElementById('gramSentInput');
  if (inp) inp.value = pattern;
  // Visual feedback
  document.querySelectorAll('#gramSentWeakPoints button').forEach(b => b.classList.remove('btn-active'));
  btn.classList.add('btn-active');
  // Switch to manual panel so input is visible
  GramSentState.autoMode = false;
  gramSentToggleMode();
  GramSentState.autoMode = false; // toggle flipped it, flip back
}

// ── Generation ─────────────────────────────────────────

// gramSentCreate = entry point from the Create button
async function gramSentCreate() {
  await gramSentGenerate();
}
// Entry point for external callers (e.g. Lesson Notes grammar feed)
async function gramSentPracticePattern(pattern) {
  if (!pattern) return;
  (App.showPanel || window.showPanel)?.('grammar2');
  await new Promise(r => setTimeout(r, 150)); // let panel render
  gram2Switch('sent');
  await new Promise(r => setTimeout(r, 50));
  const inp = document.getElementById('gramSentInput');
  if (inp) { inp.value = pattern; inp.dispatchEvent(new Event('input')); }
  await gramSentGenerate();
  gramSentPopulateHistory();
}

async function _gramSentGenerateOne(target, level, theme, avoidJp) {
  const _vpc = (App.vocabPriorityContext || window.vocabPriorityContext);
  const vocabCtx = _vpc ? _vpc() : '';
  const vocabNote = vocabCtx ? `Where natural, prefer vocabulary from this learner profile — do not force it:\n${vocabCtx}` : '';
  const avoidNote = avoidJp && avoidJp.length ? `Avoid repeating these sentences: ${avoidJp.join(' / ')}` : '';
  const themeNote = theme ? `Set the sentence in the context of: ${theme}.` : '';
  const prompt = `Generate 1 Japanese sentence for a ${level} learner practising: "${target}".\n${themeNote}\n${vocabNote}\n${avoidNote}\nThe sentence must clearly use the target grammar. Provide a natural English translation and a brief grammar hint (one sentence).\nReply ONLY with a JSON object, no markdown:\n{"jp":"Japanese sentence","en":"English translation","hint":"grammar hint"}`;
  const data = await claudeAPI({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
    track: 'grammar',
  });
  const text = data.content?.[0]?.text || '{}';
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

function _gramSentAvoidList() {
  const sessions = (App.Storage || window.Storage).getJSON(STORAGE_KEYS.GRAM_SENT_SESSIONS, []);
  const recent = sessions.filter(s => s.target === GramSentState.target).slice(-3);
  const pastJp = recent.flatMap(s => (s.sentences || []).map(x => x.jp)).filter(Boolean).slice(-10);
  const currentJp = GramSentState.sentences.map(s => s.jp).filter(Boolean);
  return [...pastJp, ...currentJp];
}

async function _gramSentPrefetch() {
  if (GramSentState.generating) return;
  if (GramSentState.sentences.length >= GRAM_SENT_TOTAL) return;
  GramSentState.generating = true;
  try {
    const level = document.getElementById('gramSentLevel')?.value || 'N4';
    const theme = document.getElementById('gramSentTheme')?.value?.trim() || '';
    const s = await _gramSentGenerateOne(GramSentState.target, level, theme, _gramSentAvoidList());
    GramSentState.nextSentence = s;
  } catch(e) {
    console.warn('[gramSent] prefetch failed:', e.message);
    GramSentState.nextSentence = null;
  }
  GramSentState.generating = false;
}

async function gramSentGenerate() {
  const area = document.getElementById('gramSentDrillArea');
  if (!area) return;
  const target = document.getElementById('gramSentInput')?.value?.trim();
  if (!target) {
    area.innerHTML = '<div style="padding:20px;color:var(--red);font-family:var(--ui);font-size:0.85rem">⚠ Enter a grammar point first.</div>';
    return;
  }
  const apiKey = getApiKey();
  if (!apiKey) {
    area.innerHTML = '<div style="padding:20px;color:var(--red);font-family:var(--ui);font-size:0.85rem">⚠ No API key — open ⚙ Settings and save your Anthropic key.</div>';
    return;
  }
  const level = document.getElementById('gramSentLevel')?.value || 'N4';
  const theme = document.getElementById('gramSentTheme')?.value?.trim() || '';
  const btn = document.getElementById('gramSentCreateBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }


  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
  area.innerHTML = '<div style="padding:30px;text-align:center;color:var(--ink-light);font-family:var(--ui);font-size:0.85rem">Generating…</div>';
  try {
    const s1 = await _gramSentGenerateOne(target, level, theme, _gramSentAvoidList());
    if (!s1 || !s1.jp) throw new Error('No sentence returned');
    GramSentState.sentences  = [s1];
    GramSentState.target     = target;
    GramSentState.idx        = 0;
    GramSentState.ok         = 0;
    GramSentState.miss       = 0;
    GramSentState.results    = [null];
    GramSentState.checked    = false;
    GramSentState.nextSentence = null;
    GramSentState.generating = false;
    gramSentHistorySave(target);
    gramSentPopulateHistory();
    gramSentRenderCard();

  } catch (e) {
    area.innerHTML = '<div style="padding:20px;color:var(--red);font-family:var(--ui);font-size:0.85rem">Error: ' + e.message + '</div>';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Create'; }
  }
}

// ── Card rendering ─────────────────────────────────────

function gramSentRenderCard() {
  const area = document.getElementById('gramSentDrillArea');
  if (!area) return;
  if (GramSentState.idx >= GramSentState.sentences.length) {
    gramSentRenderComplete();
    return;
  }
  const s    = GramSentState.sentences[GramSentState.idx];
  const dots = GramSentState.sentences.map((_, i) => {
    const r   = GramSentState.results[i];
    const cls = r === null ? (i === GramSentState.idx ? 'cur' : '') : r.correct ? 'ok' : 'miss';
    return `<div class="gd-dot ${cls}"></div>`;
  }).join('');

  area.innerHTML = `
    <div class="gd-stats">
      <span>Correct: <strong style="color:var(--teal)">${GramSentState.ok}</strong></span>
      <span>Wrong: <strong style="color:var(--red)">${GramSentState.miss}</strong></span>
      <span>Left: <strong>${GramSentState.sentences.length - GramSentState.idx}</strong></span>
    </div>
    <div class="gd-progress-row">${dots}</div>
    <div class="gd-card">
      <div class="gd-source-en">${s.en}</div>
      <button class="gd-hint-toggle" onclick="gramSentToggleHint(this)">▸ Grammar hint</button>
      <div class="gd-hint" id="gramSentCardHint">${s.hint}</div>
      <input type="text" class="gd-answer-input" id="gramSentAnswerInput"
        placeholder="Type Japanese…"
        autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false"
        onkeydown="if(event.key==='Enter'){gramSentCheck();}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;gap:8px">
        <div data-kana-for="gramSentAnswerInput"></div>
        <div class="gd-btn-row" style="margin:0;flex-shrink:0">
          <button class="btn-action" id="gramSentCheckBtn" onclick="gramSentCheck()">Check</button>
          <button class="btn-action" onclick="gramSentSkip()">Skip</button>
          <button class="tts-btn" onclick="jpSpeak('${s.jp.replace(/'/g, "\'")}')">🔊</button>
        </div>
      </div>
      <div class="gd-feedback" id="gramSentCardFeedback"></div>
    </div>`;

  // Attach kana toolbar to answer input
  const ansInp = document.getElementById('gramSentAnswerInput');
  if (ansInp) {
    kanaToolbar('gramSentAnswerInput');
    ansInp.focus();
  }

  GramSentState.checked = false;
  if (GramSentState.sentences.length < GRAM_SENT_TOTAL) _gramSentPrefetch();

  // Update persistent feedback panel
  const fb = document.getElementById('gramSentFeedback');
  if (fb) fb.innerHTML = 'Feedback will appear here after you check your answer.';
}

function gramSentToggleHint(btn) {
  const hint = document.getElementById('gramSentCardHint');
  if (!hint) return;
  const open = hint.classList.toggle('show');
  btn.textContent = (open ? '▾' : '▸') + ' Grammar hint';
}

// ── Checking ───────────────────────────────────────────

async function gramSentCheck() {
  if (GramSentState.checked) { gramSentAdvance(); return; }
  const input = document.getElementById('gramSentAnswerInput');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;

  const s   = GramSentState.sentences[GramSentState.idx];
  const btn = document.getElementById('gramSentCheckBtn');
  if (btn) { btn.textContent = '…'; btn.disabled = true; }

  const apiKey = getApiKey();
  let correct = false;
  let feedbackHtml = '';

  if (apiKey) {
    try {
      const prompt = `English: "${s.en}". Target grammar: "${GramSentState.target}" (hint: ${s.hint}). ` +
        `Correct Japanese: "${s.jp}". Student wrote: "${val}". ` +
        `Grade this. Accept natural variations. When mentioning Japanese words with kanji in feedback, add reading in brackets, e.g. 食べる(たべる). ` +
        `Reply ONLY with JSON: {"correct":true/false,"feedback":"one sentence","correctAnswer":"${s.jp}"}`;

      const data = await claudeAPI({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
        track: 'grammar',
      });
      const parsed = JSON.parse((data.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim());
      correct = parsed.correct === true;
      feedbackHtml = `<div>${parsed.feedback || ''}</div><div class="gd-correct-ans">${correct ? '✓' : '→ '} ${parsed.correctAnswer || s.jp}</div>`;
    } catch {
      correct = val.includes(s.jp.slice(0, 4));
      feedbackHtml = `<div class="gd-correct-ans">→ ${s.jp}</div>`;
    }
  } else {
    correct = val.trim() === s.jp.trim();
    feedbackHtml = `<div class="gd-correct-ans">→ ${s.jp}</div>`;
  }

  input.className = 'gd-answer-input ' + (correct ? 'correct' : 'wrong');

  // Update persistent right-column feedback
  const fbCol = document.getElementById('gramSentFeedback');
  if (fbCol) {
    fbCol.innerHTML = `<div style="margin-bottom:8px;font-weight:500;color:${correct ? 'var(--teal)' : 'var(--red)'}">${correct ? '✓ Correct' : '✗ Incorrect'}</div>` + feedbackHtml;
  }

  // Inline feedback in card — minimal, full detail is in right column
  const cardFb = document.getElementById('gramSentCardFeedback');
  if (cardFb) {
    cardFb.innerHTML = correct ? '<span style="color:var(--teal)">✓</span>' : `<div class="gd-correct-ans">→ ${s.jp}</div>`;
    cardFb.className = 'gd-feedback show ' + (correct ? 'ok' : 'bad');
  }

  // Show hint
  const hintArea = document.getElementById('gramSentHintArea');
  const hintText = document.getElementById('gramSentHintText');
  if (hintArea && hintText) {
    hintText.textContent = s.hint;
    hintArea.style.display = '';
  }

  GramSentState.results[GramSentState.idx] = { correct, userAnswer: val };
  if (correct) GramSentState.ok++; else GramSentState.miss++;
  GramSentState.checked = true;

  if (btn) { btn.textContent = 'Next'; btn.disabled = false; btn.onclick = gramSentAdvance; }

  const dots = document.querySelectorAll('#gramSentDrillArea .gd-dot');
  if (dots[GramSentState.idx]) dots[GramSentState.idx].className = 'gd-dot ' + (correct ? 'ok' : 'miss');
}

async function gramSentAdvance() {
  GramSentState.idx++;
  GramSentState.checked = false;
  const hintArea = document.getElementById('gramSentHintArea');
  if (hintArea) hintArea.style.display = 'none';
  // If we need a new sentence and one is ready, use it
  if (GramSentState.idx >= GramSentState.sentences.length && GramSentState.idx < GRAM_SENT_TOTAL) {
    if (GramSentState.nextSentence) {
      GramSentState.sentences.push(GramSentState.nextSentence);
      GramSentState.results.push(null);
      GramSentState.nextSentence = null;
    } else {
      // Not ready yet — show loading and wait
      const area = document.getElementById('gramSentDrillArea');
      if (area) area.innerHTML = '<div style="padding:30px;text-align:center;color:var(--ink-light);font-family:var(--ui);font-size:0.85rem">Generating next sentence…</div>';
      while (GramSentState.generating) await new Promise(r => setTimeout(r, 200));
      if (GramSentState.nextSentence) {
        GramSentState.sentences.push(GramSentState.nextSentence);
        GramSentState.results.push(null);
        GramSentState.nextSentence = null;
      }
    }
  }
  gramSentRenderCard();
}

function gramSentSkip() {
  if (!GramSentState.checked) {
    GramSentState.results[GramSentState.idx] = { correct: false, userAnswer: '' };
    GramSentState.miss++;
  }
  gramSentAdvance();
}

function gramSentFeedbackClick() {
  // Click on feedback column reveals/hides the hint
  const hintArea = document.getElementById('gramSentHintArea');
  if (hintArea) hintArea.style.display = hintArea.style.display === 'none' ? '' : 'none';
}

// ── Complete screen ────────────────────────────────────

// ── Sentence session error analysis ───────────────────────────────────────
async function gramSentAnalyseErrors() {
  const wrong = GramSentState.sentences
    .map((s, i) => ({ s, r: GramSentState.results[i] }))
    .filter(x => x.r && !x.r.correct && x.r.userAnswer);
  if (!wrong.length) return;
  const apiKey = (App.getApiKey || window.getApiKey)?.();
  if (!apiKey) return;
  const examples = wrong.map(x =>
    `EN: "${x.s.en}" | Correct: "${x.s.jp}" | Student wrote: "${x.r.userAnswer}"`
  ).join('\n');
  try {
    const data = await (App.claudeAPI || window.claudeAPI)({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [{ role: 'user', content:
        `Grammar target: "${GramSentState.target}"\nAnalyse these Japanese learner errors and classify each.\n${examples}\n` +
        `Reply ONLY with a JSON array, no markdown:\n` +
        `[{"errorType":"particle|verb_form|word_order|missing_element|vocabulary|other","pattern":"short label","input":"student answer","corrected":"correct Japanese"}]`
      }],
      track: 'grammar',
    });
    const text = data.content?.[0]?.text || '[]';
    const errors = JSON.parse(text.replace(/\`\`\`json|\`\`\`/g, '').trim());
    // Route particle errors into existing tracker
    const wAdd = App.writingErrorsAdd || window.writingErrorsAdd;
    for (const e of errors) {
      if (e.errorType === 'particle' && wAdd) {
        wAdd(e.input, e.corrected, 'particle', e.pattern);
      }
    }
    // Store full session record
    const sessions = (App.Storage || window.Storage).getJSON(STORAGE_KEYS.GRAM_SENT_SESSIONS, []);
    sessions.push({
      date: new Date().toISOString().slice(0, 10),
      target: GramSentState.target,
      total: GramSentState.sentences.length,
      ok: GramSentState.ok,
      sentences: GramSentState.sentences,
      errors,
    });
    if (sessions.length > 200) sessions.splice(0, sessions.length - 200);
    (App.Storage || window.Storage).setJSON(STORAGE_KEYS.GRAM_SENT_SESSIONS, sessions);
  } catch(e) {
    console.warn('[gramSent] error analysis failed:', e.message);
  }
}

function gramSentRenderComplete() {
  const area = document.getElementById('gramSentDrillArea');
  if (!area) return;
  const attempted = GramSentState.results.filter(r => r !== null).length;
  if (attempted >= 5) {
    gramSentAnalyseErrors();
    (App.drillLastCompletedWrite || window.drillLastCompletedWrite)?.('gramSent', GramSentState.target);
  }
  const pct = Math.round(GramSentState.ok / GramSentState.sentences.length * 100);
  const items = GramSentState.sentences.map((s, i) => {
    const r = GramSentState.results[i] || { correct: false, userAnswer: '' };
    return `<div class="gd-summary-item ${r.correct ? 'ok' : 'miss'}">
      <div class="gd-summary-jp">${s.en}</div>
      ${r.userAnswer ? `<div class="gd-summary-user">You: ${r.userAnswer}</div>` : '<div class="gd-summary-user" style="color:var(--red)">Skipped</div>'}
      ${!r.correct ? `<div class="gd-summary-correct">→ ${s.jp}</div>` : ''}
    </div>`;
  }).join('');

  area.innerHTML = `
    <div class="gd-idle" style="min-height:120px;margin-bottom:20px">
      <div style="font-size:2.5rem">${pct >= 80 ? '🎉' : pct >= 50 ? '📖' : '💪'}</div>
      <strong>${GramSentState.ok} / ${GramSentState.sentences.length} correct · ${pct}%</strong>
      <button class="gd-generate-btn" onclick="gramSentGenerate()">Drill Again →</button>
    </div>
    <div class="gd-summary"><div class="gd-summary-title">REVIEW</div>${items}</div>`;
}

// ── Ask a question about the current sentence ──────────

async function gramSentAskQuestion() {
  const qInp = document.getElementById('gramSentQuestion');
  const qRes = document.getElementById('gramSentQuestionResult');
  if (!qInp || !qRes) return;
  const q = qInp.value.trim();
  if (!q) return;

  const s = GramSentState.sentences[GramSentState.idx];
  if (!s) { qRes.style.display = ''; qRes.textContent = 'No active sentence.'; return; }

  const apiKey = getApiKey();
  if (!apiKey) { qRes.style.display = ''; qRes.textContent = 'No API key.'; return; }

  qRes.style.display = '';
  qRes.textContent = '…';

  try {
    const prompt = `Current sentence: "${s.jp}" (${s.en}). Grammar target: "${GramSentState.target}". Student asks: "${q}". Answer concisely for an N4-N5 learner. Always answer in English.`;
    const data = await claudeAPI({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
      track: 'grammar',
    });
    const answer = data.content?.[0]?.text || '';
    qRes.textContent = answer;
    qInp.value = '';
    // Tag question to grammar node — fire and forget
    questionRecordGrammarEvidence(q, answer);
  } catch (e) {
    qRes.textContent = 'Error: ' + e.message;
  }
}

// ── Init (called when sent tab opens) ─────────────────

function gramSentInit() {
  gramSentPopulateHistory();
}

// ═══════════════════════════════════════════════════════
// QUESTION GRAMMAR NODE TAGGING
// Shared function — called after any Q&A exchange in the app.
// Classifies the question against the 48 grammar nodes and
// records a 'question' evidence nudge if a clear match is found.
// Relevance threshold: only records when Claude is confident
// the question is primarily about one specific node.
// ═══════════════════════════════════════════════════════

async function questionRecordGrammarEvidence(question, answer) {
  try {
    const GM = App.GrammarModel || window.GrammarModel;
    if (!GM || !GM.loaded) return;
    const nodes = GM.getAllNodes();
    if (!nodes.length) return;

    const apiKey = (App.getApiKey || window.getApiKey)?.();
    if (!apiKey) return;

    // Build a compact node list for the classifier prompt
    const nodeList = nodes.map(n => n.id + ' (' + n.label + ')').join(', ');

    const prompt = 'You are classifying a Japanese learner question for a grammar tracking system.\n\n'
      + 'Question: "' + question + '"\n'
      + 'Answer given: "' + answer + '"\n\n'
      + 'Grammar nodes available:\n' + nodeList + '\n\n'
      + 'If this question is clearly and specifically about one of the grammar nodes above, '
      + 'return ONLY the node id (e.g. te_form). '
      + 'If the question is general, off-topic, or could apply to multiple nodes equally, '
      + 'return ONLY the word null. '
      + 'No explanation. One word answer only.';

    const data = await (App.claudeAPI || window.claudeAPI)({
      max_tokens: 20,
      messages: [{ role: 'user', content: prompt }],
      track: 'grammar',
    });

    const raw = (data.content?.[0]?.text || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!raw || raw === 'null') {
      // No node matched — log to unclassified for periodic review
      _unclassifiedAppend(question, answer);
      return;
    }

    // Validate the returned id exists in our node list
    const matched = nodes.find(n => n.id === raw);
    if (!matched) return;

    // Nudge score up slightly — question = engagement, not mastery
    // Cap at 0.45 so questions alone never push past 'partial'
    // Note: overridden nodes still get question evidence recorded (for the outline indicator)
    const current = GM.getScore(matched.id);
    const newScore = GM.isOverridden(matched.id) ? current : Math.min(0.45, current + 0.04);
    GM.recordEvidence(matched.id, 'question', newScore,
      'question: ' + question.slice(0, 60)
    ).then(() => {
      // Refresh grammar coverage grid so the question outline appears immediately
      try { (App.renderGrammarCoverage || window.renderGrammarCoverage)?.(); } catch(e) {}
    }).catch(() => {});
  } catch(e) {
    // Silent — tagging is best-effort
  }
}

// ═══════════════════════════════════════════════════════
// UNCLASSIFIED QUESTION LOG
// Questions where the classifier returned null — no node match.
// Stored as [{t, q, a}], capped at 200. Review tab lets you
// eyeball patterns and decide if new nodes are needed.
// ═══════════════════════════════════════════════════════

const UNCLASSIFIED_KEY = 'gramQuestionUnclassified';

function _unclassifiedAppend(question, answer) {
  try {
    const stored = (App.Storage || window.Storage).getJSON(UNCLASSIFIED_KEY, []);
    stored.push({ t: Date.now(), q: question, a: answer });
    if (stored.length > 200) stored.splice(0, stored.length - 200);
    (App.Storage || window.Storage).setJSON(UNCLASSIFIED_KEY, stored);
  } catch(e) {}
}

function unclassifiedRender() {
  const list = document.getElementById('gnote-unclassified-list');
  if (!list) return;
  const stored = (App.Storage || window.Storage).getJSON(UNCLASSIFIED_KEY, []);
  if (!stored.length) {
    list.innerHTML = '<div style="font-family:var(--ui);font-size:0.8rem;color:var(--ink-light);'
      + 'padding:20px 0;font-style:italic">No unclassified questions yet.</div>';
    return;
  }
  // Most recent first
  const items = [...stored].reverse();
  const fmtDate = t => new Date(t).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  list.innerHTML = items.map(item => {
    const esc = s => (App.escHtml || window.escHtml)?.(s) ?? s;
    return '<div style="padding:10px 0;border-bottom:1px solid var(--border)">'
      + '<div style="font-family:var(--ui);font-size:0.68rem;color:var(--ink-light);margin-bottom:4px">'
      + fmtDate(item.t) + '</div>'
      + '<div style="font-family:var(--ui);font-size:0.82rem;color:var(--teal);margin-bottom:4px">Q: '
      + esc(item.q) + '</div>'
      + '<div style="font-family:var(--ui);font-size:0.78rem;color:var(--ink-light);line-height:1.5">'
      + esc(item.a) + '</div>'
      + '</div>';
  }).join('');
}

function unclassifiedClear() {
  if (!confirm('Clear all unclassified questions?')) return;
  (App.Storage || window.Storage).setJSON(UNCLASSIFIED_KEY, []);
  unclassifiedRender();
}

// ── App registry ───────────────────────────────────────
try {
  Object.assign(App, {
    gramSentCreate, gramSentPracticePattern,
    gramSentGenerate,
    gramSentLoadHistory,
    gramSentToggleMode,
    gramSentCheck,
    gramSentAdvance,
    gramSentSkip,
    gramSentFeedbackClick,
    gramSentAskQuestion,
    gramSentToggleHint,
    gramSentSelectWeakPoint,
    gramSentInit,
    writingErrorsClear,
    questionRecordGrammarEvidence,
    unclassifiedRender,
    unclassifiedClear,
    checkConjG,
    advanceConjG,
    conjNextRun,
    showConjLookupG,
    retreatConjG,
    pdSelectLeft,
    pdSelectRight,
    pdTryMatch,
  });
} catch(e) { console.error('[features-grammar] App registry failed:', e); }

// ── Window exports (index.html onclick handlers) ───────



// ═══════════════════════════════════════════════════════
// TE-FORM DRILL
// ═══════════════════════════════════════════════════════

const TE_VERBS = [
  // っ-て group (う/つ/る ending u-verbs)
  {dict:'買う',read:'かう',te:'買って',en:'to buy',group:'tte',rule:'う → って'},
  {dict:'待つ',read:'まつ',te:'待って',en:'to wait',group:'tte',rule:'つ → って'},
  {dict:'帰る',read:'かえる',te:'帰って',en:'to return',group:'tte',rule:'る(u) → って'},
  {dict:'作る',read:'つくる',te:'作って',en:'to make',group:'tte',rule:'る(u) → って'},
  {dict:'乗る',read:'のる',te:'乗って',en:'to ride',group:'tte',rule:'る(u) → って'},
  {dict:'取る',read:'とる',te:'取って',en:'to take',group:'tte',rule:'る(u) → って'},
  {dict:'使う',read:'つかう',te:'使って',en:'to use',group:'tte',rule:'う → って'},
  {dict:'会う',read:'あう',te:'会って',en:'to meet',group:'tte',rule:'う → って'},
  {dict:'歌う',read:'うたう',te:'歌って',en:'to sing',group:'tte',rule:'う → って'},
  {dict:'持つ',read:'もつ',te:'持って',en:'to hold',group:'tte',rule:'つ → って'},
  {dict:'立つ',read:'たつ',te:'立って',en:'to stand',group:'tte',rule:'つ → って'},
  {dict:'売る',read:'うる',te:'売って',en:'to sell',group:'tte',rule:'る(u) → って'},
  {dict:'走る',read:'はしる',te:'走って',en:'to run',group:'tte',rule:'る(u) → って'},
  {dict:'知る',read:'しる',te:'知って',en:'to know',group:'tte',rule:'る(u) → って'},
  {dict:'切る',read:'きる',te:'切って',en:'to cut',group:'tte',rule:'る(u) → って'},
  // ん-で group (む/ぶ/ぬ)
  {dict:'飲む',read:'のむ',te:'飲んで',en:'to drink',group:'nde',rule:'む → んで'},
  {dict:'読む',read:'よむ',te:'読んで',en:'to read',group:'nde',rule:'む → んで'},
  {dict:'休む',read:'やすむ',te:'休んで',en:'to rest',group:'nde',rule:'む → んで'},
  {dict:'遊ぶ',read:'あそぶ',te:'遊んで',en:'to play',group:'nde',rule:'ぶ → んで'},
  {dict:'呼ぶ',read:'よぶ',te:'呼んで',en:'to call',group:'nde',rule:'ぶ → んで'},
  {dict:'選ぶ',read:'えらぶ',te:'選んで',en:'to choose',group:'nde',rule:'ぶ → んで'},
  {dict:'死ぬ',read:'しぬ',te:'死んで',en:'to die',group:'nde',rule:'ぬ → んで'},
  {dict:'住む',read:'すむ',te:'住んで',en:'to live',group:'nde',rule:'む → んで'},
  {dict:'頼む',read:'たのむ',te:'頼んで',en:'to request',group:'nde',rule:'む → んで'},
  {dict:'積む',read:'つむ',te:'積んで',en:'to pile up',group:'nde',rule:'む → んで'},
  // い-て group (く)
  {dict:'書く',read:'かく',te:'書いて',en:'to write',group:'ite',rule:'く → いて'},
  {dict:'聞く',read:'きく',te:'聞いて',en:'to listen',group:'ite',rule:'く → いて'},
  {dict:'歩く',read:'あるく',te:'歩いて',en:'to walk',group:'ite',rule:'く → いて'},
  {dict:'働く',read:'はたらく',te:'働いて',en:'to work',group:'ite',rule:'く → いて'},
  {dict:'置く',read:'おく',te:'置いて',en:'to put',group:'ite',rule:'く → いて'},
  {dict:'引く',read:'ひく',te:'引いて',en:'to pull',group:'ite',rule:'く → いて'},
  {dict:'焼く',read:'やく',te:'焼いて',en:'to grill',group:'ite',rule:'く → いて'},
  {dict:'続く',read:'つづく',te:'続いて',en:'to continue',group:'ite',rule:'く → いて'},
  // い-で group (ぐ)
  {dict:'泳ぐ',read:'およぐ',te:'泳いで',en:'to swim',group:'ide',rule:'ぐ → いで'},
  {dict:'急ぐ',read:'いそぐ',te:'急いで',en:'to hurry',group:'ide',rule:'ぐ → いで'},
  {dict:'脱ぐ',read:'ぬぐ',te:'脱いで',en:'to undress',group:'ide',rule:'ぐ → いで'},
  {dict:'稼ぐ',read:'かせぐ',te:'稼いで',en:'to earn',group:'ide',rule:'ぐ → いで'},
  {dict:'漕ぐ',read:'こぐ',te:'漕いで',en:'to row',group:'ide',rule:'ぐ → いで'},
  // し-て group (す)
  {dict:'話す',read:'はなす',te:'話して',en:'to speak',group:'shite',rule:'す → して'},
  {dict:'貸す',read:'かす',te:'貸して',en:'to lend',group:'shite',rule:'す → して'},
  {dict:'消す',read:'けす',te:'消して',en:'to erase/turn off',group:'shite',rule:'す → して'},
  {dict:'押す',read:'おす',te:'押して',en:'to push',group:'shite',rule:'す → して'},
  {dict:'出す',read:'だす',te:'出して',en:'to take out',group:'shite',rule:'す → して'},
  {dict:'返す',read:'かえす',te:'返して',en:'to return (sth)',group:'shite',rule:'す → して'},
  {dict:'探す',read:'さがす',te:'探して',en:'to search',group:'shite',rule:'す → して'},
  // る-verb group (ichidan)
  {dict:'食べる',read:'たべる',te:'食べて',en:'to eat',group:'ru',rule:'る-verb → て'},
  {dict:'見る',read:'みる',te:'見て',en:'to see',group:'ru',rule:'る-verb → て'},
  {dict:'起きる',read:'おきる',te:'起きて',en:'to wake up',group:'ru',rule:'る-verb → て'},
  {dict:'寝る',read:'ねる',te:'寝て',en:'to sleep',group:'ru',rule:'る-verb → て'},
  {dict:'教える',read:'おしえる',te:'教えて',en:'to teach',group:'ru',rule:'る-verb → て'},
  {dict:'覚える',read:'おぼえる',te:'覚えて',en:'to remember',group:'ru',rule:'る-verb → て'},
  {dict:'借りる',read:'かりる',te:'借りて',en:'to borrow',group:'ru',rule:'る-verb → て'},
  {dict:'着る',read:'きる',te:'着て',en:'to wear',group:'ru',rule:'る-verb → て'},
  {dict:'出る',read:'でる',te:'出て',en:'to leave',group:'ru',rule:'る-verb → て'},
  {dict:'開ける',read:'あける',te:'開けて',en:'to open',group:'ru',rule:'る-verb → て'},
  {dict:'閉める',read:'しめる',te:'閉めて',en:'to close',group:'ru',rule:'る-verb → て'},
  {dict:'決める',read:'きめる',te:'決めて',en:'to decide',group:'ru',rule:'る-verb → て'},
  {dict:'答える',read:'こたえる',te:'答えて',en:'to answer',group:'ru',rule:'る-verb → て'},
  {dict:'始める',read:'はじめる',te:'始めて',en:'to begin',group:'ru',rule:'る-verb → て'},
  // Irregulars
  {dict:'する',read:'する',te:'して',en:'to do',type:'irr',group:'irr',rule:'irregular'},
  {dict:'くる',read:'くる',te:'きて',en:'to come',type:'irr',group:'irr',rule:'irregular'},
  {dict:'行く',read:'いく',te:'行って',en:'to go',type:'u',group:'irr',rule:'exception: く → って'},
  {dict:'勉強する',read:'べんきょうする',te:'勉強して',en:'to study',type:'irr-suru',group:'irr',rule:'〜する → 〜して'},
  {dict:'運動する',read:'うんどうする',te:'運動して',en:'to exercise',type:'irr-suru',group:'irr',rule:'〜する → 〜して'},
];


function teSetMode(mode) {
  TeFormState.mode = mode;
  document.querySelectorAll('#panel-grammar2 .yoshi-subtab, #panel-teform .yoshi-subtab').forEach(b => {
    if (b.id === 'te-btn-form' || b.id === 'te-btn-context' || b.id === 'te-btn-reverse' || b.id === 'te-btn-speed') b.classList.remove('active');
  });
  const modeBtn = document.getElementById('te-btn-' + mode);
  if (modeBtn) modeBtn.classList.add('active');
  const groupFilter = document.getElementById('te-group-filter');
  const contextControls = document.getElementById('te-context-controls');
  groupFilter.style.display = mode === 'context' ? 'none' : 'block';
  contextControls.style.display = mode === 'context' ? 'block' : 'none';
  TeFormState.correct = 0; TeFormState.wrong = 0;
  document.getElementById('te-correct').textContent = '0';
  document.getElementById('te-wrong').textContent = '0';
  document.getElementById('te-feedback').style.display = 'none';
  const twoCol = document.getElementById('te-two-col');
  if (mode === 'speed') {
    if (twoCol) twoCol.style.display = 'none';
    document.getElementById('te-speed-wrap').style.display = 'block';
  } else {
    if (twoCol) twoCol.style.display = '';
    document.getElementById('te-speed-wrap').style.display = 'none';
    if (mode === 'context') {
      if (TeFormState.contextSentences.length) { TeFormState.contextIdx = 0; teShowContext(); }
      else { teShowContextPrompt(); }
    } else {
      teBuildQueue();
      teNext();
    }
  }
}

function teSetGroup(group) {
  TeFormState.group = group;
  document.querySelectorAll('.te-group-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.te-group-btn[data-group="${group}"]`).classList.add('active');
  teBuildQueue();
  teNext();
}

// ── Conjugation Daily Session ───────────────────────────────────────────────

// ── Grammar Drill Error Store ─────────────────────────────────────────────
const GrammarErrors = {
  _cache: null,
  load() {
    if (!this._cache) {
      try { this._cache = Storage.getJSON(STORAGE_KEYS.GRAMMAR_ERRORS, []); }
      catch(e) { this._cache = []; }
    }
    return this._cache;
  },
  save() { Storage.setJSON(STORAGE_KEYS.GRAMMAR_ERRORS, this._cache); this._cache = null; },
  record(form, pol, reg, verbType, severity) {
    const key = [form, pol, reg, verbType].join('|');
    const today = new Date().toISOString().slice(0, 10);
    const errors = this.load();
    const existing = errors.find(e => e.key === key);
    if (existing) {
      existing.count++;
      existing.slips  = (existing.slips  || 0) + (severity === 'slip'  ? 1 : 0);
      existing.misses = (existing.misses || 0) + (severity === 'miss'  ? 1 : 0);
      existing.date = today;
    } else {
      errors.push({ key, form, pol, reg, verbType, count: 1,
        slips: severity === 'slip' ? 1 : 0, misses: severity === 'miss' ? 1 : 0, date: today });
    }
    this.save();
  },
  weight(form, pol, reg, verbType, decayCutoffDays = 30) {
    const key = [form, pol, reg, verbType].join('|');
    const err = this.load().find(e => e.key === key);
    if (!err) return 0;
    const ageDays = (Date.now() - new Date(err.date || 0).getTime()) / 86400000;
    if (ageDays > decayCutoffDays) return 0;
    const decay = ageDays < 3 ? 1 : ageDays < 7 ? 0.7 : 0.4;
    return Math.round(((err.misses || 0) * 3 + (err.slips || 0)) * decay);
  }
};

let _conjTrackingPaused = false;
let _conjHintUsed = false; // true if kanji stem was pre-filled for current question

const ConjSession = {
  todayStr() { return new Date().toISOString().slice(0, 10); },

  load() {
    try {
      const s = Storage.getJSON(STORAGE_KEYS.CONJ_SESSION, null);
      return (s && s.date === this.todayStr()) ? s : null;
    } catch(e) { return null; }
  },

  save(data) {
    data.date = this.todayStr();
    Storage.setJSON(STORAGE_KEYS.CONJ_SESSION, data);
  },

  isTodayComplete() {
    const s = this.load();
    return s && s.completed === true;
  },

  markComplete() {
    const s = this.load() || { date: this.todayStr() };
    s.completed = true;
    this.save(s);
    drillLastCompletedWrite('conj');
    try { agentUpdatePresence(); } catch(e) {}
  },

  saveProgress(queue, idx, results, ok, miss, run, sessionCorrect, sessionWrong, verbTypes, forms, polarities, registers) {
    const s = this.load() || { date: this.todayStr() };
    // Store only the minimal keys needed to rebuild queue items
    s.queue   = queue.map(item => ({ key: item.key, word: item.word, form: item.form, pol: item.pol, reg: item.reg }));
    s.idx     = idx;
    s.results = results;
    s.ok      = ok;
    s.miss    = miss;
    s.run     = run;
    s.sessionCorrect = sessionCorrect;
    s.sessionWrong   = sessionWrong;
    s.verbTypes  = verbTypes;
    s.forms      = forms;
    s.polarities = polarities;
    s.registers  = registers;
    s.completed  = false;
    this.save(s);
  }
};


// ── High-frequency verb addition ─────────────────────────────────────────────
// Ordered by frequency — each call adds the next 10 not yet in the list
const FREQ_VERBS_ORDERED = [
  {dict:'する',   read:'する',   te:'して',   en:'to do',           type:'irr', group:'irr', rule:'irregular'},
  {dict:'いる',   read:'いる',   te:'いて',   en:'to be (animate)', type:'ru',  group:'ru',  rule:'る-verb'},
  {dict:'ある',   read:'ある',   te:'あって', en:'to be (inanimate)',type:'u',   group:'tte',  rule:'う → って'},
  {dict:'くる',   read:'くる',   te:'きて',   en:'to come',         type:'irr', group:'irr', rule:'irregular'},
  {dict:'行く',   read:'いく',   te:'いって', en:'to go',           type:'u',   group:'irr-k',rule:'く → って'},
  {dict:'見る',   read:'みる',   te:'みて',   en:'to see',          type:'ru',  group:'ru',  rule:'る-verb'},
  {dict:'聞く',   read:'きく',   te:'きいて', en:'to listen/ask',   type:'u',   group:'ite',  rule:'く → いて'},
  {dict:'話す',   read:'はなす', te:'はなして',en:'to speak',        type:'u',   group:'shite',rule:'す → して'},
  {dict:'読む',   read:'よむ',   te:'よんで', en:'to read',         type:'u',   group:'nde',  rule:'む → んで'},
  {dict:'書く',   read:'かく',   te:'かいて', en:'to write',        type:'u',   group:'ite',  rule:'く → いて'},
  {dict:'食べる', read:'たべる', te:'たべて', en:'to eat',          type:'ru',  group:'ru',  rule:'る-verb'},
  {dict:'飲む',   read:'のむ',   te:'のんで', en:'to drink',        type:'u',   group:'nde',  rule:'む → んで'},
  {dict:'買う',   read:'かう',   te:'かって', en:'to buy',          type:'u',   group:'tte',  rule:'う → って'},
  {dict:'待つ',   read:'まつ',   te:'まって', en:'to wait',         type:'u',   group:'tte',  rule:'つ → って'},
  {dict:'乗る',   read:'のる',   te:'のって', en:'to ride',         type:'u',   group:'tte',  rule:'る(godan) → って'},
  {dict:'起きる', read:'おきる', te:'おきて', en:'to wake up',      type:'ru',  group:'ru',  rule:'る-verb'},
  {dict:'寝る',   read:'ねる',   te:'ねて',   en:'to sleep',        type:'ru',  group:'ru',  rule:'る-verb'},
  {dict:'帰る',   read:'かえる', te:'かえって',en:'to return',       type:'u',   group:'tte',  rule:'る(godan) → って'},
  {dict:'会う',   read:'あう',   te:'あって', en:'to meet',         type:'u',   group:'tte',  rule:'う → って'},
  {dict:'働く',   read:'はたらく',te:'はたらいて',en:'to work',     type:'u',   group:'ite',  rule:'く → いて'},
  {dict:'使う',   read:'つかう', te:'つかって',en:'to use',          type:'u',   group:'tte',  rule:'う → って'},
  {dict:'思う',   read:'おもう', te:'おもって',en:'to think',        type:'u',   group:'tte',  rule:'う → って'},
  {dict:'知る',   read:'しる',   te:'しって', en:'to know',         type:'u',   group:'tte',  rule:'る(godan) → って'},
  {dict:'教える', read:'おしえる',te:'おしえて',en:'to teach',      type:'ru',  group:'ru',  rule:'る-verb'},
  {dict:'もらう', read:'もらう', te:'もらって',en:'to receive',      type:'u',   group:'tte',  rule:'う → って'},
  {dict:'あげる', read:'あげる', te:'あげて', en:'to give (up)',     type:'ru',  group:'ru',  rule:'る-verb'},
  {dict:'くれる', read:'くれる', te:'くれて', en:'to give (to me)',  type:'ru',  group:'ru',  rule:'る-verb'},
  {dict:'見せる', read:'みせる', te:'みせて', en:'to show',         type:'ru',  group:'ru',  rule:'る-verb'},
  {dict:'決める', read:'きめる', te:'きめて', en:'to decide',       type:'ru',  group:'ru',  rule:'る-verb'},
  {dict:'始める', read:'はじめる',te:'はじめて',en:'to begin',      type:'ru',  group:'ru',  rule:'る-verb'},
];

// Tracks how many freq verbs have been added this session
let _conjFreqVerbsAdded = 0;

function conjAddFreqVerbs() {
  const batch = FREQ_VERBS_ORDERED.slice(_conjFreqVerbsAdded, _conjFreqVerbsAdded + 10);
  if (!batch.length) {
    alert('All ' + FREQ_VERBS_ORDERED.length + ' frequent verbs already added.');
    return;
  }
  // Merge into the active verb pool — avoid duplicates by dict form
  const existingDicts = new Set((window._conjExtraVerbs || []).map(v => v.dict));
  batch.forEach(v => { if (!existingDicts.has(v.dict)) { (window._conjExtraVerbs = window._conjExtraVerbs || []).push(v); } });
  _conjFreqVerbsAdded += batch.length;
  conjUpdateFreqCount();
}

function conjResetFreqVerbs() {
  window._conjExtraVerbs = [];
  _conjFreqVerbsAdded = 0;
  conjUpdateFreqCount();
}

function conjUpdateFreqCount() {
  const el = document.getElementById('conjFreqVerbCount');
  if (!el) return;
  const extra = (window._conjExtraVerbs || []).length;
  let base = 0;
  if (document.getElementById('optUG')?.checked)    base += VERBS_U.length;
  if (document.getElementById('optRuG')?.checked)   base += VERBS_RU.length;
  if (document.getElementById('optIrrG')?.checked)  base += VERBS_IRR.length;
  if (document.getElementById('optIAdjG')?.checked) base += ADJ_I.length;
  if (document.getElementById('optNaAdjG')?.checked) base += ADJ_NA.length;
  const total = base + extra;
  el.textContent = extra
    ? total + ' verbs (' + extra + ' extra)'
    : total ? total + ' verbs' : '';
}

window['conjAddFreqVerbs']  = conjAddFreqVerbs;
window['conjResetFreqVerbs'] = conjResetFreqVerbs;

function startConjDrillG() {
  // Read options from the G-suffixed elements in panel-grammar2
  const ruEndingOnly  = document.getElementById('optRuEndingG')?.checked;
  const naIEndingOnly = document.getElementById('optNaIEndingG')?.checked;
  let verbTypes = [];

  if (ruEndingOnly) {
    const ruEnding = v => v.dict && v.dict.endsWith('る');
    verbTypes.push(...VERBS_U.filter(ruEnding));
    verbTypes.push(...VERBS_RU.filter(ruEnding));
    verbTypes.push(...(window._conjExtraVerbs || []).filter(ruEnding));
  } else if (naIEndingOnly) {
    // Only な-adjectives whose dict form ends in い
    const naIEnding = v => v.dict && v.dict.endsWith('い') && v.type === 'na-adj';
    verbTypes.push(...ADJ_NA.filter(naIEnding));
    if (!verbTypes.length) {
      verbTypes.push(...ADJ_NA);
      console.warn('[conj] No な-adj ending in い found — showing all な-adj');
    }
  } else {
    if (document.getElementById('optUG')?.checked) verbTypes.push(...VERBS_U);
    if (document.getElementById('optRuG')?.checked) verbTypes.push(...VERBS_RU);
    if (document.getElementById('optIrrG')?.checked) verbTypes.push(...VERBS_IRR);
    if (document.getElementById('optIAdjG')?.checked) verbTypes.push(...ADJ_I);
    if (document.getElementById('optNaAdjG')?.checked) verbTypes.push(...ADJ_NA);
  }
  // Merge extra high-frequency verbs — only include types matching selected checkboxes
  if (window._conjExtraVerbs && window._conjExtraVerbs.length) {
    const allowedTypes = new Set();
    if (document.getElementById('optUG')?.checked)   allowedTypes.add('u');
    if (document.getElementById('optRuG')?.checked)  allowedTypes.add('ru');
    if (document.getElementById('optIrrG')?.checked) allowedTypes.add('irr');
    const existing = new Set(verbTypes.map(v => v.dict));
    window._conjExtraVerbs.forEach(v => {
      if (!existing.has(v.dict) && allowedTypes.has(v.type)) verbTypes.push(v);
    });
  }
  const forms = [];
  if (document.getElementById('optPresentG')?.checked) forms.push('present');
  if (document.getElementById('optPastG')?.checked) forms.push('past');
  if (document.getElementById('optTeG')?.checked) forms.push('te');
  if (document.getElementById('optVolG')?.checked) forms.push('volitional');
  if (document.getElementById('optPassiveG')?.checked) forms.push('passive');
  if (document.getElementById('optPotentialG')?.checked) forms.push('potential');
  if (document.getElementById('optCausativeG')?.checked) forms.push('causative');
  const polarities = [];
  if (document.getElementById('optAffG')?.checked) polarities.push('aff');
  if (document.getElementById('optNegG')?.checked) polarities.push('neg');
  const registers = [];
  if (document.getElementById('optPoliteG')?.checked) registers.push('polite');
  if (document.getElementById('optPlainG')?.checked) registers.push('plain');

  if (!verbTypes.length || !forms.length || !polarities.length || !registers.length) {
    alert('Please select at least one option in each category.'); return;
  }

  // Try to resume today's session
  const saved = ConjSession.load();
  if (saved && saved.queue && saved.queue.length > 0 && !saved.completed) {
    conjResumeSession(saved);
    return;
  }

  // Start fresh session
  conjRun = 1;
  conjSessionWrong = {};
  conjSessionCorrect = {};
  conjBuildRunQueue(verbTypes, forms, polarities, registers);
}

function _conjUpdateSpecialFilterUI() {
  const ruOnly = document.getElementById('optRuEndingG')?.checked;
  const naIOnly = document.getElementById('optNaIEndingG')?.checked;
  const specialActive = ruOnly || naIOnly;
  // Gray out / restore the individual verb-type checkboxes
  ['optUG','optRuG','optIrrG','optIAdjG','optNaAdjG'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = specialActive;
    const label = el.closest('label') || el.parentElement?.querySelector('label') || el.nextElementSibling;
    if (label) label.style.opacity = specialActive ? '0.4' : '';
  });
}

function conjUpdateOptions() {
  conjUpdateFreqCount();
  _conjUpdateSpecialFilterUI();
}

function conjForceNewSession() {
  const ruEndingOnly  = document.getElementById('optRuEndingG')?.checked;
  const naIEndingOnly = document.getElementById('optNaIEndingG')?.checked;
  const verbTypes = [];
  if (ruEndingOnly) {
    const ruEnding = v => v.dict && v.dict.endsWith('る');
    verbTypes.push(...VERBS_U.filter(ruEnding));
    verbTypes.push(...VERBS_RU.filter(ruEnding));
    verbTypes.push(...(window._conjExtraVerbs || []).filter(ruEnding));
  } else if (naIEndingOnly) {
    const naIEnding = v => v.dict && v.dict.endsWith('い') && v.type === 'na-adj';
    const filtered = ADJ_NA.filter(naIEnding);
    verbTypes.push(...(filtered.length ? filtered : ADJ_NA));
  } else {
    if (document.getElementById('optUG')?.checked)    verbTypes.push(...VERBS_U);
    if (document.getElementById('optRuG')?.checked)   verbTypes.push(...VERBS_RU);
    if (document.getElementById('optIrrG')?.checked)  verbTypes.push(...VERBS_IRR);
    if (document.getElementById('optIAdjG')?.checked) verbTypes.push(...ADJ_I);
    if (document.getElementById('optNaAdjG')?.checked) verbTypes.push(...ADJ_NA);
  }
  // Merge extra high-frequency verbs — only types matching selected checkboxes
  if (window._conjExtraVerbs && window._conjExtraVerbs.length) {
    const allowedTypes = new Set();
    if (document.getElementById('optUG')?.checked)   allowedTypes.add('u');
    if (document.getElementById('optRuG')?.checked)  allowedTypes.add('ru');
    if (document.getElementById('optIrrG')?.checked) allowedTypes.add('irr');
    const existing = new Set(verbTypes.map(v => v.dict));
    window._conjExtraVerbs.forEach(v => {
      if (!existing.has(v.dict) && allowedTypes.has(v.type)) verbTypes.push(v);
    });
  }
  const forms = [];
  if (document.getElementById('optPresentG')?.checked) forms.push('present');
  if (document.getElementById('optPastG')?.checked) forms.push('past');
  if (document.getElementById('optTeG')?.checked) forms.push('te');
  if (document.getElementById('optVolG')?.checked) forms.push('volitional');
  if (document.getElementById('optPassiveG')?.checked) forms.push('passive');
  if (document.getElementById('optPotentialG')?.checked) forms.push('potential');
  if (document.getElementById('optCausativeG')?.checked) forms.push('causative');
  const polarities = [];
  if (document.getElementById('optAffG')?.checked) polarities.push('aff');
  if (document.getElementById('optNegG')?.checked) polarities.push('neg');
  const registers = [];
  if (document.getElementById('optPoliteG')?.checked) registers.push('polite');
  if (document.getElementById('optPlainG')?.checked) registers.push('plain');
  if (!verbTypes.length || !forms.length || !polarities.length || !registers.length) return;
  conjRun = 1;
  conjSessionWrong = {};
  conjSessionCorrect = {};
  conjBuildRunQueue(verbTypes, forms, polarities, registers);
}

function conjResumeSession(saved) {
  // Rebuild queue from saved minimal data
  conjQueue = saved.queue.map(item => {
    const result = conjugate(item.word, item.form, item.pol, item.reg);
    return result.answer !== '—' ? { word: item.word, form: item.form, pol: item.pol, reg: item.reg, key: item.key, ...result } : null;
  }).filter(Boolean);

  conjIdx            = saved.idx || 0;
  conjResults        = saved.results || new Array(conjQueue.length).fill('pending');
  conjOk             = saved.ok || 0;
  conjMiss           = saved.miss || 0;
  conjRun            = saved.run || 1;
  conjSessionCorrect = saved.sessionCorrect || {};
  conjSessionWrong   = saved.sessionWrong || {};
  window._conjVerbTypes  = saved.verbTypes;
  window._conjForms      = saved.forms;
  window._conjPolarities = saved.polarities;
  window._conjRegisters  = saved.registers;
  conjTypedAnswers = new Array(conjQueue.length).fill(null);
  conjRevealed = false; conjCurrentAnswer = null;

  // Show resume notice briefly in feedback
  const area = document.getElementById('conjDrillAreaG');
  if (area) {
    const fb = document.getElementById('conjFeedbackG');
    if (fb) fb.innerHTML = '<span style="color:var(--gold);font-family:var(--ui);font-size:0.78rem">↩ Resuming today\'s session (' + conjIdx + '/' + conjQueue.length + ' done)</span>';
  }

  renderConjDrillG();
}

function conjDeConsecutive(queue) {
  // Ensure no two consecutive cards share the same dict form
  // Only applies when queue has more than 5 items
  if (queue.length <= 5) return queue;
  const result = [...queue];
  let attempts = 0;
  let changed = true;
  while (changed && attempts < 100) {
    changed = false;
    attempts++;
    for (let i = 1; i < result.length; i++) {
      if (result[i].word.dict === result[i-1].word.dict) {
        // Find a swap candidate further ahead
        let swapped = false;
        for (let j = i + 1; j < result.length; j++) {
          if (result[j].word.dict !== result[i-1].word.dict &&
              (j + 1 >= result.length || result[j+1].word.dict !== result[i].word.dict)) {
            [result[i], result[j]] = [result[j], result[i]];
            swapped = true;
            changed = true;
            break;
          }
        }
        if (!swapped) break; // can't fix — not enough variety
      }
    }
  }
  return result;
}

function conjBuildRunQueue(verbTypes, forms, polarities, registers) {
  // Store options for later runs
  window._conjVerbTypes = verbTypes;
  window._conjForms = forms;
  window._conjPolarities = polarities;
  window._conjRegisters = registers;

  // ── Build cross-session error weights from GrammarErrors store ───────────
  // Weights are keyed by form|pol|reg|verbType — applies to all words of that type
  const errorWeights = {}; // key: word.dict+'-'+form+'-'+pol+'-'+reg → extra slots

  // ── Build candidate pool ───────────────────────────────────────────────
  const combos = [];
  for (let i = 0; i < 80; i++) {
    const word = verbTypes[Math.floor(Math.random()*verbTypes.length)];
    const form = forms[Math.floor(Math.random()*forms.length)];
    const pol = polarities[Math.floor(Math.random()*polarities.length)];
    const reg = registers[Math.floor(Math.random()*registers.length)];
    if ((form==='te'||form==='volitional') && pol==='neg') continue;
    const result = conjugate(word, form, pol, reg);
    if (result.answer !== '—') {
      const key = word.dict + '-' + form + '-' + pol + '-' + reg;
      combos.push({word, form, pol, reg, key, ...result});
    }
  }

  // ── Weight by session performance + cross-session grammar errors ─────────
  const weighted = [];
  for (const item of combos) {
    const w = conjSessionWrong[item.key] || 0;
    const r = conjSessionCorrect[item.key] || 0;
    // Cross-session: look up form|pol|reg|verbType pattern weight
    const gramW = GrammarErrors.weight(item.form, item.pol, item.reg, item.word.type || 'u');
    if (conjRun >= 3 && r >= 2 && w === 0 && gramW === 0) continue;
    const sessionSlots = w >= 2 ? 4 : w === 1 ? 2 : 1;
    const totalSlots   = sessionSlots + Math.min(gramW, 6); // cap cross-session boost at 6
    for (let s = 0; s < totalSlots; s++) weighted.push(item);
  }

  // Guarantee at least a few grammar-error-boosted items appear
  const boosted = combos.filter(c => GrammarErrors.weight(c.form, c.pol, c.reg, c.word.type || 'u') > 0);
  if (boosted.length > 0) {
    boosted.sort(() => Math.random()-0.5).slice(0, 3).forEach(g => weighted.unshift(g));
  }

  const pool = weighted.length >= 5 ? weighted : combos;
  const recentKeys = new Set(window._conjLastRunKeys || []);
  const deduped = pool.filter(c => !recentKeys.has(c.key));
  const finalPool = deduped.length >= CONJ_QUESTIONS_PER_RUN ? deduped : pool;
  const shuffled = finalPool.sort(() => Math.random() - 0.5).slice(0, CONJ_QUESTIONS_PER_RUN || 15);
  conjQueue = shuffled.length > 5 ? conjDeConsecutive(shuffled) : shuffled;
  window._conjLastRunKeys = conjQueue.map(c => c.key);
  conjTypedAnswers = new Array(conjQueue.length).fill(null);
  conjIdx = 0; conjOk = 0; conjMiss = 0;
  conjResults = new Array(conjQueue.length).fill('pending');
  conjRevealed = false; conjCurrentAnswer = null;
  ConjSession.saveProgress(conjQueue, conjIdx, conjResults, conjOk, conjMiss, conjRun, conjSessionCorrect, conjSessionWrong, verbTypes, forms, polarities, registers);
  renderConjDrillG();
}

function renderConjDrillG() {
  const area = document.getElementById('conjDrillAreaG');
  if (!area) return;

  // No active drill yet (e.g. a display toggle was clicked before Start) —
  // leave the idle state rather than rendering a summary with an unset conjRun.
  if (!conjQueue || !conjQueue.length) return;

  const _fb = document.getElementById('conjFeedbackG'); if (_fb) { _fb.textContent = ''; _fb.className = 'conj-feedback'; }
  // End of run
  if (conjIdx >= conjQueue.length) {
    const pct = Math.round(conjOk/(conjOk+conjMiss||1)*100);
    
    // Collect errors from this run (include slips too)
    const runErrors = [];
    for (let i = 0; i < conjQueue.length; i++) {
      if (conjResults[i] === 'miss' || conjResults[i] === 'slip') {
        runErrors.push({ item: conjQueue[i], typed: conjTypedAnswers[i] });
      }
    }
    
    // Write recency on every run completion (not just session end)
    drillLastCompletedWrite('conj');

    if (conjRun >= CONJ_SESSION_RUNS) {
      // Session complete
      const problems = Object.entries(conjSessionWrong).filter(([k,v]) => v > 0).sort((a,b) => b[1] - a[1]).slice(0, 5);
      let summary = '<div class="conj-idle" style="background:var(--paper-dark);border:1px solid var(--border)"><span class="conj-idle-char">🎌</span><strong>Session complete!</strong> (' + CONJ_SESSION_RUNS + ' runs)<br>';
      if (problems.length === 0) {
        summary += '<span style="color:var(--green)">Perfect session! 🌟</span>';
      } else {
        // Group errors by grammar pattern (form + pol + reg), not by verb
        const patternCounts = {};
        problems.forEach(([k, v]) => {
          const parts = k.split('-');
          const pattern = [parts[1], parts[2], parts[3]].filter(Boolean).join(' ');
          patternCounts[pattern] = (patternCounts[pattern] || 0) + v;
        });
        const topPatterns = Object.entries(patternCounts).sort((a,b) => b[1]-a[1]).slice(0,3).map(([p]) => p);
        summary += '<span style="color:var(--ink-light)">Grammar focus: ' + topPatterns.join(', ') + '</span>';
      }
      summary += '</div>';
      area.innerHTML = summary;
      if (!_conjTrackingPaused) drillLastCompletedWrite('conj');
      ConjSession.markComplete();
      conjRun = 0;
      const sb = document.getElementById('conjStartBtnG'); if (sb) sb.style.display = '';
      const nb = document.getElementById('conjNewDrillBtn'); if (nb) nb.style.display = 'none';
    } else {
      // Run summary with errors
      let html = '<div class="conj-idle" style="background:var(--paper-dark);border:1px solid var(--border)"><span class="conj-idle-char">📊</span>';
      html += '<strong>Run ' + conjRun + '/' + (CONJ_SESSION_RUNS || 3) + '</strong> — ' + conjOk + '/' + conjQueue.length + ' (' + pct + '%)<br>';
      if (runErrors.length > 0) {
        html += '<div style="margin:12px 0;text-align:left">';
        html += '<div style="font-family:var(--ui);font-size:0.7rem;color:var(--ink-light);letter-spacing:0.06em;margin-bottom:8px">ERRORS THIS RUN</div>';
        html += '<table style="width:100%;border-collapse:collapse;font-size:0.82rem">';
        html += '<thead><tr>'
          + '<th style="font-family:var(--ui);font-size:0.68rem;color:var(--ink-light);font-weight:normal;text-align:left;padding:4px 8px 6px">verb</th>'
          + '<th style="font-family:var(--ui);font-size:0.68rem;color:var(--ink-light);font-weight:normal;text-align:left;padding:4px 8px 6px">form</th>'
          + '<th style="font-family:var(--ui);font-size:0.68rem;color:var(--coral);font-weight:normal;text-align:left;padding:4px 8px 6px">typed</th>'
          + '<th style="font-family:var(--ui);font-size:0.68rem;color:var(--teal);font-weight:normal;text-align:left;padding:4px 8px 6px">correct</th>'
          + '</tr></thead><tbody>';
        for (const { item: err, typed } of runErrors) {
          html += '<tr style="border-top:1px solid var(--border)">'
            + '<td style="padding:6px 8px;font-family:var(--jp);font-size:0.9rem">' + err.word.dict + '</td>'
            + '<td style="padding:6px 8px;font-family:var(--ui);font-size:0.72rem;color:var(--ink-light)">' + err.badge + '</td>'
            + '<td style="padding:6px 8px;font-family:var(--jp);font-size:0.9rem;color:var(--coral)">' + (typed?.val || '—') + '</td>'
            + '<td style="padding:6px 8px;font-family:var(--jp);font-size:0.9rem;color:var(--teal)">' + err.answer + '</td>'
            + '</tr>';
        }
        html += '</tbody></table></div>';
      }
      html += '<span style="color:var(--ink-light);font-family:var(--ui);font-size:0.78rem">Next run focuses on problem items</span><br>';
      html += '<button class="btn-action" onclick="conjNextRun()">Run ' + (conjRun+1) + ' →</button></div>';
      area.innerHTML = html;
    }
    return;
  }
  
  const item = conjQueue[conjIdx];
  const showEn = document.getElementById('conjShowEnG')?.checked !== false;
  const showRead = document.getElementById('conjShowReadingG')?.checked !== false;
  const showType = document.getElementById('conjShowTypeG')?.checked === true;
  const ruEndingMode = document.getElementById('optRuEndingG')?.checked === true;

  // Verb type colour — always show in ru-ending mode
  const naIEndingMode = document.getElementById('optNaIEndingG')?.checked === true;
  // typeColor: always respects conjShowTypeG — ru-only mode does not force colour on
  const typeColor = !showType ? 'var(--ink)'
    : item.word.type === 'ru'     ? '#4a9eff'
    : item.word.type === 'na-adj' ? 'var(--gold)'
    : item.word.type === 'irr'    ? '#e6a817'
    : '#00b894';

  const typeLabel = ruEndingMode
    ? (item.word.type === 'ru'
        ? '<div style="font-family:var(--ui);font-size:0.7rem;color:#4a9eff;letter-spacing:0.06em">ICHIDAN (る)</div>'
        : '<div style="font-family:var(--ui);font-size:0.7rem;color:#00b894;letter-spacing:0.06em">GODAN (る)</div>')
    : naIEndingMode
      ? '<div style="font-family:var(--ui);font-size:0.7rem;color:var(--gold);letter-spacing:0.06em">な-ADJ → conjugates with だ/です, not くない</div>'
      : '';
  const listenMode = typeof conjListenMode !== 'undefined' && conjListenMode;
  const dotHtml = conjResults.slice(0, CONJ_QUESTIONS_PER_RUN || 15).map((r,i) =>
    '<div class="conj-dot ' + (r==='ok'?'ok':r==='miss'?'miss':r==='slip'?'slip':i===conjIdx?'cur':'') + '"></div>'
  ).join('');
  // Badge colour: register only — polite=blue, plain=neutral
  const badgeCls = item.reg === 'polite' ? 'polite' : 'plain';
  
  // Hide the static Start button while drill is active
  const startBtn = document.getElementById('conjStartBtnG');
  if (startBtn) startBtn.style.display = 'none';
  const newDrillBtn = document.getElementById('conjNewDrillBtn');
  if (newDrillBtn) newDrillBtn.style.display = '';

  area.innerHTML =
    '<div class="conj-stats-bar"><div>Run ' + conjRun + '/' + (CONJ_SESSION_RUNS || 3) + '</div><div>✓ ' + conjOk + '</div><div>✗ ' + conjMiss + '</div></div>' +
    '<div class="conj-dot-row">' + dotHtml + '</div>' +
    '<div class="conj-card">' +
      (listenMode ? '' : '<div class="conj-word" style="color:' + typeColor + '">' + item.word.dict + '</div>') +
      (showRead && !listenMode ? '<div class="conj-reading">' + item.word.read + '</div>' : '') +
      (showEn && !listenMode ? '<div class="conj-en">' + item.word.en + '</div>' : '') +
      '<div class="conj-task ' + badgeCls + '">' + item.badge + '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:center;gap:8px;margin-top:12px">' +
        '<input class="conj-input" id="conjInputG" placeholder="type in kana…" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" onkeydown="handleConjKeyG(event)" oninput="liveCheckConjG()">' +
        '<div style="display:flex;gap:8px;align-items:center;justify-content:center">' +
          '<button class="btn-action" id="conjCheckBtnG" onclick="checkConjG()">Check</button>' +
          '<button class="btn-action btn-sm" id="conjPrevBtnG" onclick="retreatConjG()" style="display:none">←</button>' +
          '<button class="btn-action btn-sm" id="conjNextBtnG" onclick="advanceConjG()" style="display:none">→</button>' +

        '</div>' +
      '</div>' +
    '</div>';
  const inp = document.getElementById('conjInputG');
  kanaAddToggle(inp, true);
  conjRevealed = false;
  conjCurrentAnswer = item;
  // Pre-fill kanji stem to reduce typos — user types the ending only
  const _t = item.word.type;
  const _stem = _t === 'na-adj' ? item.word.dict : item.word.dict.slice(0, -1);
  _conjHintUsed = !!_stem;
  if (_stem) { inp.value = _stem; }
  inp.focus();
}

function conjNextRun() {
  conjRun++;
  conjBuildRunQueue(window._conjVerbTypes, window._conjForms, window._conjPolarities, window._conjRegisters);
}

function handleConjKeyG(e) { 
  if (e.key === 'Enter') {
    if (conjRevealed) advanceConjG();
    else checkConjG();
  }
  if (e.key === 'Tab') {
    e.preventDefault();
  }
}

// Enter handling is done in handleConjKeyG — no global listener needed
// Allow Enter to advance to next run from the summary screen
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter') return;
  const btn = document.querySelector('#conjDrillAreaG .conj-start-btn');
  if (btn) { e.preventDefault(); conjNextRun(); }
});

function conjAutoConvertG() {
  // Auto-convert hiragana stem to kanji for the current verb
  if (!conjCurrentAnswer) return;
  const input = document.getElementById('conjInputG');
  if (!input) return;
  
  const val = input.value;
  const word = conjCurrentAnswer.word;
  
  // Get the kanji stem and hiragana stem
  const kanjiStem = word.dict.slice(0, -1);
  const readingStem = word.read.slice(0, -1);
  
  // If the input starts with the hiragana stem, replace with kanji stem
  if (readingStem && val.startsWith(readingStem) && !val.startsWith(kanjiStem)) {
    const cursorPos = input.selectionStart;
    const newVal = kanjiStem + val.slice(readingStem.length);
    input.value = newVal;
    const posDiff = kanjiStem.length - readingStem.length;
    input.setSelectionRange(cursorPos + posDiff, cursorPos + posDiff);
  }
}

// ── Conjugation Levenshtein error classification ────────────────────────────
function conjClassifyError(typed, correct, item) {
  const dist = cmLevenshtein(typed, correct);

  // Check register confusion first — typed the right conjugation but wrong politeness level
  const altReg = item.reg === 'polite' ? 'plain' : 'polite';
  const altResult = (typeof conjugate === 'function')
    ? conjugate(item.word, item.form, item.pol, altReg)
    : null;
  const altHira = altResult ? toHiragana(altResult.answer || '') : '';
  if (altHira && typed === altHira) {
    return {
      dist: 0,
      errorType: 'register',
      pattern: 'register-confusion|expected-' + item.reg + '|gave-' + altReg,
      severity: 'slip',
      isRegisterConfusion: true,
    };
  }

  // Stem comparison
  let stemLen = 0;
  const minLen = Math.min(typed.length, correct.length);
  while (stemLen < minLen && typed[stemLen] === correct[stemLen]) stemLen++;
  const sameStem = stemLen >= Math.floor(correct.length * 0.5);

  let errorType, pattern, severity;

  if (dist <= 2 && sameStem) {
    errorType = 'spelling';
    pattern = 'near-miss|' + item.word.dict + '|' + item.form;
    severity = 'slip';
  } else if (sameStem) {
    errorType = 'conjugation';
    pattern = 'wrong-ending|' + item.word.dict + '|' + item.form;
    severity = 'miss';
  } else {
    errorType = 'word-choice';
    pattern = 'unknown-form|' + item.word.dict + '|' + item.form;
    severity = 'miss';
  }

  return { dist, errorType, pattern, severity, isRegisterConfusion: false };
}

function checkConjG() {
  const input = document.getElementById('conjInputG');
  const val = input.value.trim();
  if (!val) return;
  const item = conjCurrentAnswer;
  const ansHira = toHiragana(item.answer);
  const valHira = toHiragana(val);
  const correct = valHira === ansHira;
  let levClass = null;
  if (!conjRevealed) {
    conjRevealed = true;
    if (correct) { 
      conjOk++; 
      conjResults[conjIdx] = 'ok';
      conjTypedAnswers[conjIdx] = { val, hintUsed: _conjHintUsed };
      conjSessionCorrect[item.key] = (conjSessionCorrect[item.key] || 0) + 1;
      // Record to SRS for mastery tracking
      if (!_conjTrackingPaused) {
        try { (App.DrillSRS || window.DrillSRS)?.record(STORAGE_KEYS.DRILL_SRS_CONJ, item.key, true); } catch(e) {}
        if (typeof _conjRecordGrammarEvidence === 'function') {
          _conjRecordGrammarEvidence(item, true, null);
        }
      }
    } else { 
      levClass = conjClassifyError(valHira, ansHira, item);
      if (!_conjTrackingPaused) {
        const verbType = item.word.type || 'u';
        GrammarErrors.record(item.form, item.pol, item.reg, verbType, levClass.severity);
        if (typeof _conjRecordGrammarEvidence === 'function') {
          _conjRecordGrammarEvidence(item, false, levClass);
        }
        // Record to SRS for mastery tracking
        try { (App.DrillSRS || window.DrillSRS)?.record(STORAGE_KEYS.DRILL_SRS_CONJ, item.key, false); } catch(e) {}
      }
      conjMiss++; 
      conjResults[conjIdx] = levClass.severity === 'slip' ? 'slip' : 'miss';
      conjTypedAnswers[conjIdx] = { val, hintUsed: _conjHintUsed };
      conjSessionWrong[item.key] = (conjSessionWrong[item.key] || 0) + 1;
    }
  }
  ConjSession.saveProgress(conjQueue, conjIdx, conjResults, conjOk, conjMiss, conjRun, conjSessionCorrect, conjSessionWrong, window._conjVerbTypes, window._conjForms, window._conjPolarities, window._conjRegisters);

  const isSlip = levClass && levClass.severity === 'slip';
  input.className = 'conj-input ' + (correct ? 'correct' : isSlip ? 'slip' : 'wrong');
  const fb = document.getElementById('conjFeedbackG');
  fb.className = 'conj-feedback show' + (correct ? ' correct-fb' : isSlip ? ' slip-fb' : ' wrong-fb');
  
  let fbHtml = '<div class="conj-answer-reveal">';
  if (correct) {
    fbHtml += item.answer;
  } else if (isSlip) {
    if (levClass.isRegisterConfusion) {
      const expected = item.reg === 'polite' ? '丁寧語 (polite)' : '普通体 (plain)';
      fbHtml += 'register — answer is ' + item.answer + ' <span style="font-family:var(--ui);font-size:0.72rem;color:var(--gold)">(' + expected + ' was asked)</span>';
    } else {
      fbHtml += 'close — ' + item.answer + ' <span style="font-family:var(--ui);font-size:0.72rem;color:var(--gold)">(dist ' + levClass.dist + ')</span>';
    }
  } else {
    fbHtml += item.answer;
    if (levClass) { const pLabel = levClass.pattern.split('|')[0].replace('-',' '); fbHtml += ' <span style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light)">— ' + pLabel + '</span>'; }
  }
  fbHtml += '</div>';
  fb.innerHTML = fbHtml;
  
  // Always show Next/Prev after answering — no auto-advance
  document.getElementById('conjCheckBtnG').style.display = 'none';
  document.getElementById('conjPrevBtnG').style.display = conjIdx > 0 ? '' : 'none';
  document.getElementById('conjNextBtnG').style.display = '';
  const _lb = document.getElementById('conjLookupBtnG'); if (_lb) _lb.style.display = '';
  input.readOnly = true;
}

function liveCheckConjG() {
  // First try auto-convert
  conjAutoConvertG();
  
  if (!conjRevealed || !conjCurrentAnswer) return;
  const input = document.getElementById('conjInputG');
  const val = input.value.trim();
  const correct = toHiragana(val) === toHiragana(conjCurrentAnswer.answer);
  input.className = 'conj-input ' + (correct ? 'correct' : val ? 'wrong' : '');
}

function retreatConjG() {
  if (conjIdx <= 0) return;
  // Undo the current item's result if already recorded
  if (conjResults[conjIdx] === 'ok') { conjOk = Math.max(0, conjOk - 1); conjResults[conjIdx] = 'pending'; }
  else if (conjResults[conjIdx] === 'miss') { conjMiss = Math.max(0, conjMiss - 1); conjResults[conjIdx] = 'pending'; }
  conjIdx--;
  // Undo previous item too so it can be re-answered
  if (conjResults[conjIdx] === 'ok') { conjOk = Math.max(0, conjOk - 1); conjResults[conjIdx] = 'pending'; }
  else if (conjResults[conjIdx] === 'miss') { conjMiss = Math.max(0, conjMiss - 1); conjResults[conjIdx] = 'pending'; }
  conjRevealed = false;
  ConjSession.saveProgress(conjQueue, conjIdx, conjResults, conjOk, conjMiss, conjRun, conjSessionCorrect, conjSessionWrong, window._conjVerbTypes, window._conjForms, window._conjPolarities, window._conjRegisters);
  renderConjDrillG();
}

function advanceConjG() {
  if (!conjRevealed) { conjResults[conjIdx] = 'miss'; conjMiss++; }
  conjIdx++; conjRevealed = false;
  ConjSession.saveProgress(conjQueue, conjIdx, conjResults, conjOk, conjMiss, conjRun, conjSessionCorrect, conjSessionWrong, window._conjVerbTypes, window._conjForms, window._conjPolarities, window._conjRegisters);
  renderConjDrillG();
}


function gram2Switch(name) {
  Grammar2State.lastSubtab = name;
  ['conj','te','sent','particles'].forEach(s => {
    const el = document.getElementById('gram2-sub-' + s);
    const btn = document.getElementById('gram2-btn-' + s);
    if (el) el.style.display = s === name ? 'block' : 'none';
    if (btn) btn.classList.toggle('active', s === name);
  });
  if (name === 'conj') {
    // Don't auto-start — user presses Start explicitly
    setTimeout(() => {
      const inp = document.getElementById('conjInput');
      if (inp) { kanaOff(inp); kanaOn(inp); inp._KanaDrillState.mode = 'hiragana'; inp.style.caretColor = 'var(--teal)'; }
    }, 0);
  }
  if (name === 'sent') {
    setTimeout(() => {
      if (typeof gramSentInit === 'function') gramSentInit();
    }, 0);
  }
}

// ── Particle pair drill ─────────────────────────────────────────────────────

const PARTICLE_PAIR_PROMPTS = {
  'ha-ga': {
    label: 'は vs が',
    nodeIds: ['particle_wa','particle_ga'],
    system: 'You generate Japanese particle matching exercises for は vs が. Each exercise has two Japanese sentences (differing ONLY in は vs が) and two English translations with clearly different nuance. Respond ONLY with valid JSON. IMPORTANT: never use "as for" or "speaking of" in the English translations — these directly reveal は and defeat the purpose of the exercise. Express the topic/contrast meaning through natural English word order and emphasis instead.',
    prompt: 'Generate 5 は vs が exercises as a JSON array. Each item:\n{"jpA":"sentence with は","jpB":"sentence with が","enA":"English for jpA","enB":"English for jpB","rule":"one short sentence explaining why A=enA and B=enB"}\nUse simple N5 vocabulary. Make nuance differences clear through natural English — never use "as for" or "speaking of". Use emphasis, word order, or context to show the difference.'
  },
  'ni-de': {
    label: 'に vs で',
    nodeIds: ['particle_ni_time','particle_de_place'],
    system: 'You generate Japanese particle matching exercises for に vs で. Each exercise has two Japanese sentences (differing ONLY in に vs で) and two English translations. Respond ONLY with valid JSON.',
    prompt: 'Generate 5 に vs で exercises as a JSON array. Each item:\n{"jpA":"sentence with に","jpB":"sentence with で","enA":"English for jpA","enB":"English for jpB","rule":"one short sentence explaining the distinction"}\nUse simple N5 vocabulary.'
  },
  'ha-mo': {
    label: 'は vs も',
    nodeIds: ['particle_wa','particle_mo'],
    system: 'You generate Japanese particle matching exercises for は vs も. Respond ONLY with valid JSON.',
    prompt: 'Generate 5 は vs も exercises as a JSON array. Each item:\n{"jpA":"sentence with は","jpB":"sentence with も","enA":"English for jpA","enB":"English for jpB","rule":"one short sentence explaining the distinction"}\nUse simple N5 vocabulary.'
  }
};

let _pdPair = 'ha-ga';
let _pdExercises = [];   // array of 5 exercises
let _pdResults = [];     // null | 'correct' | 'wrong' per exercise
let _pdMatchMap = [];    // per exercise: {jpK: enK} — what user matched
let _pdLoading = false;
let _pdSelected = { left: null, right: null }; // indices of clicked items
let _pdShuffles = [];

async function particleDrillStart() {
  _pdPair = document.getElementById('particlePairSelect')?.value || 'ha-ga';
  _pdExercises = [];
  _pdResults = [];
  _pdSelected = { left: null, right: null };
  _pdShuffles = [];
  _pdMatchMap = [];
  _pdLoading = true;
  particleDrillRender();

  const apiKey = getApiKey();
  if (!apiKey) { _pdLoading = false; particleDrillRender(); return; }

  const prompt = PARTICLE_PAIR_PROMPTS[_pdPair];
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        system: prompt.system,
        messages: [{ role:'user', content: prompt.prompt }]
      })
    });
    const data = await resp.json();
    const raw = (data.content?.[0]?.text || '');
    console.log('[particleDrill] raw response:', raw.slice(0,200));
    console.warn('[API] Claude call · feature="particle-drill" · in=' + (data.usage?.input_tokens ?? '?') + ' out=' + (data.usage?.output_tokens ?? '?') + ' tokens');
    (App.apiUsageTrack || window.apiUsageTrack)?.('particle-drill', data.usage?.input_tokens ?? 0, data.usage?.output_tokens ?? 0);
    const arrayMatch = raw.match(/\[[\s\S]*\]/);
    if (!arrayMatch) throw new Error('No JSON array in response: ' + raw.slice(0,100));
    _pdExercises = JSON.parse(arrayMatch[0]);
    _pdResults = new Array(_pdExercises.length).fill(null);
  } catch(e) {
    console.error('[particleDrill]', e);
    _pdLoading = false;
    const area = document.getElementById('particleDrillArea');
    if (area) area.innerHTML = '<div style="font-family:var(--ui);font-size:0.82rem;color:#e05050;padding:12px">Generation failed: ' + e.message + '<br><button class="btn-action btn-sm" style="margin-top:8px" onclick="particleDrillStart()">Try again</button></div>';
    return;
  }
  _pdLoading = false;
  particleDrillRender();
}
window['particleDrillStart'] = particleDrillStart;

function particleDrillRender() {
  const area = document.getElementById('particleDrillArea');
  if (!area) return;
  const h = [];

  if (_pdLoading) {
    h.push('<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink-light);padding:20px;text-align:center">⏳ Generating exercises…</div>');
    area.innerHTML = h.join('');
    return;
  }

  if (!_pdExercises.length) {
    h.push('<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink-light);padding:20px 0;text-align:center">Select a particle pair and press Start.</div>');
    area.innerHTML = h.join('');
    return;
  }

  // Shuffle English order per exercise so JP and EN aren't aligned
  if (!_pdShuffles || _pdShuffles.length !== _pdExercises.length) _pdShuffles = _pdExercises.map(function() { return Math.random() < 0.5 ? ['A','B'] : ['B','A']; });
  // Render each exercise as a row
  _pdExercises.forEach(function(ex, i) {
    const result = _pdResults[i];
    const rowBg = result === 'correct' ? 'rgba(0,184,148,0.07)' : result === 'wrong' ? 'rgba(224,80,80,0.07)' : 'var(--paper-dark)';
    const rowBorder = result === 'correct' ? 'rgba(0,184,148,0.4)' : result === 'wrong' ? 'rgba(224,80,80,0.4)' : 'var(--border)';

    h.push('<div style="border:1px solid ' + rowBorder + ';border-radius:8px;padding:10px 12px;margin-bottom:8px;background:' + rowBg + '">');

    // Two-column matching row
    h.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px">');

    // Left: JP sentences
    h.push('<div style="display:flex;flex-direction:column;gap:6px">');
    ['A','B'].forEach(function(k) {
      const jp = ex['jp'+k];
      const isSelectedLeft = _pdSelected.left === i + '-' + k;
      const cursor = result !== null ? 'default' : 'pointer';
      const matchedEnK = result !== null && _pdMatchMap[i] ? _pdMatchMap[i][k] : null;
      const wasClickedLeft = matchedEnK !== null && matchedEnK !== undefined;
      const leftCorrect = matchedEnK === k;
      const leftBg = wasClickedLeft ? (leftCorrect ? 'rgba(0,184,148,0.15)' : 'rgba(224,80,80,0.12)') : isSelectedLeft ? 'rgba(74,158,255,0.15)' : 'var(--paper)';
      const leftBorder = wasClickedLeft ? (leftCorrect ? '#00b894' : '#e05050') : isSelectedLeft ? '#4a9eff' : 'var(--border)';
      h.push('<div onclick="pdSelectLeft(' + i + ',\'' + k + '\')" '
        + 'style="padding:8px 10px;background:' + leftBg + ';border:1px solid ' + leftBorder + ';border-radius:6px;cursor:' + cursor + ';font-family:var(--jp);font-size:0.95rem;color:var(--ink)">');
      h.push(jp);
      h.push('</div>');
    });
    h.push('</div>');

    // Right: EN sentences
    h.push('<div style="display:flex;flex-direction:column;gap:6px">');
    var enOrder = (_pdShuffles && _pdShuffles[i]) ? _pdShuffles[i] : ['A','B'];
    enOrder.forEach(function(k) {
      const en = ex['en'+k];
      const isSelectedRight = _pdSelected.right === i + '-' + k;
      const cursor = result !== null ? 'default' : 'pointer';
      // Find if this EN was matched to its correct JP
      const jpMatchedToThis = result !== null && _pdMatchMap[i] ? Object.keys(_pdMatchMap[i]).find(function(jp){ return _pdMatchMap[i][jp] === k; }) : null;
      const wasClickedRight = jpMatchedToThis !== undefined;
      const rightCorrect = jpMatchedToThis === k;
      const rightBg = wasClickedRight ? (rightCorrect ? 'rgba(0,184,148,0.15)' : 'rgba(224,80,80,0.12)') : isSelectedRight ? 'rgba(74,158,255,0.15)' : 'var(--paper)';
      const rightBorder = wasClickedRight ? (rightCorrect ? '#00b894' : '#e05050') : isSelectedRight ? '#4a9eff' : 'var(--border)';
      h.push('<div onclick="pdSelectRight(' + i + ',\'' + k + '\')" '
        + 'style="padding:8px 10px;background:' + rightBg + ';border:1px solid ' + rightBorder + ';border-radius:6px;cursor:' + cursor + ';font-family:var(--ui);font-size:0.80rem;color:var(--ink);line-height:1.4">');
      h.push(en);
      h.push('</div>');
    });
    h.push('</div>');

    h.push('</div>'); // end grid

    // Result feedback
    if (result !== null) {
      const icon = result === 'correct' ? '✓' : '✗';
      const col = result === 'correct' ? 'var(--teal)' : '#e05050';
      h.push('<div style="font-family:var(--ui);font-size:0.75rem;color:' + col + ';margin-bottom:4px">' + icon + ' ' + ex.rule + '</div>');
    }

    h.push('</div>'); // end row
  });

  area.innerHTML = h.join('');
}

function pdSelectLeft(exIdx, k) {
  if (_pdResults[exIdx] !== null) return; // already answered
  const key = exIdx + '-' + k;
  _pdSelected.left = _pdSelected.left === key ? null : key;
  pdTryMatch(exIdx);
  particleDrillRender();
}

function pdSelectRight(exIdx, k) {
  if (_pdResults[exIdx] !== null) return;
  const key = exIdx + '-' + k;
  _pdSelected.right = _pdSelected.right === key ? null : key;
  pdTryMatch(exIdx);
  particleDrillRender();
}

function pdTryMatch(exIdx) {
  if (!_pdSelected.left || !_pdSelected.right) return;
  const [leftIdx, leftK] = _pdSelected.left.split('-');
  const [rightIdx, rightK] = _pdSelected.right.split('-');
  if (parseInt(leftIdx) !== exIdx || parseInt(rightIdx) !== exIdx) return;

  // Check: jpA should match enA, jpB should match enB
  // User paired leftK (jp) with rightK (en) — correct if leftK === rightK
  const correct = leftK === rightK;
  _pdResults[exIdx] = correct ? 'correct' : 'wrong';
  // Store what the user actually matched for colour feedback
  if (!_pdMatchMap[exIdx]) _pdMatchMap[exIdx] = {};
  _pdMatchMap[exIdx][leftK] = rightK; // jp leftK was matched to en rightK
  _pdSelected = { left: null, right: null };

  // Grammar evidence
  const prompt = PARTICLE_PAIR_PROMPTS[_pdPair];
  if (prompt && typeof GrammarModel !== 'undefined' && GrammarModel.loaded) {
    prompt.nodeIds.forEach(function(nodeId) {
      if (!GrammarModel.isOverridden(nodeId)) {
        const current = GrammarModel.getScore(nodeId);
        const nudge = correct ? 0.04 : -0.05;
        GrammarModel.recordEvidence(nodeId, 'writing',
          Math.max(0, Math.min(0.95, current + nudge)),
          'particle pair drill: ' + _pdPair
        ).catch(function(){});
      }
    });
  }

  // If all done, update button to show Next
  if (_pdResults.every(function(r){ return r !== null; })) {
    var btn = document.getElementById('pdActionBtn');
    if (btn) { btn.textContent = 'Next'; btn.onclick = particleDrillStart; }
  }
}


function showConjLookupG() {
  if (!conjCurrentAnswer) { conjCurrentAnswer = { word: { dict: "", read: "", en: "", type: "u" }, form: "present", pol: "aff", reg: "polite" }; }
  const word = conjCurrentAnswer.word;
  const currentForm = conjCurrentAnswer.form;
  const currentPol  = conjCurrentAnswer.pol;
  const currentReg  = conjCurrentAnswer.reg;

  // ── Left: This verb full conjugation table ──────────────
  const allForms = ['present','past','te','volitional','passive','potential','causative'];
  const verbRows = [];
  for (const form of allForms) {
    for (const pol of ['aff','neg']) {
      if ((form==='te'||form==='volitional') && pol==='neg') continue;
      for (const reg of ['polite','plain']) {
        const result = conjugate(word, form, pol, reg);
        if (result.answer !== '—') {
          const hi = form===currentForm && pol===currentPol && reg===currentReg;
          verbRows.push({ badge: result.badge, answer: result.answer, hi });
        }
      }
    }
  }
  const verbTableHTML = verbRows.map(r =>
    `<tr style="${r.hi?'background:rgba(48,213,200,0.14)':''}">
      <td style="padding:5px 8px;border-bottom:1px solid rgba(255,255,255,0.06);font-family:var(--ui);font-size:0.7rem;color:var(--ink-light);white-space:nowrap">${r.badge}</td>
      <td style="padding:5px 8px;border-bottom:1px solid rgba(255,255,255,0.06);font-family:var(--jp);font-size:0.95rem">${r.answer}</td>
      <td style="padding:5px 6px;border-bottom:1px solid rgba(255,255,255,0.06)"><button class="btn-action btn-xs" onclick="jpSpeak('${r.answer}')">🔊</button></td>
    </tr>`
  ).join('');

  // ── Right: Godan / Ichidan paradigm — te-table style ────
  // Representative verbs
  const godanEx   = { dict:'書く',  read:'かく',   en:'write', type:'u',  end:'く' };
  const ichidanEx = { dict:'食べる', read:'たべる', en:'eat',   type:'ru', end:'る' };
  const suruEx    = { dict:'する',  read:'する',   en:'do',    type:'irr', end:'る' };
  const kuruEx    = { dict:'くる',  read:'くる',   en:'come',  type:'irr', end:'る' };

  // Build a te-table-style section: FORM → godan / ichidan rows
  // Rows grouped by form for clarity
  const formLabels = {
    present: 'Present', past: 'Past', te: 'て-form',
    volitional: 'Volitional', passive: 'Passive', potential: 'Potential', causative: 'Causative'
  };

  function cellFor(exWord, form, pol, reg) {
    const res = conjugate(exWord, form, pol, reg);
    return res.answer !== '—' ? res.answer : '—';
  }

  let gramRows = '';
  for (const form of allForms) {
    for (const pol of ['aff','neg']) {
      if ((form==='te'||form==='volitional') && pol==='neg') continue;
      for (const reg of ['polite','plain']) {
        const badge = conjugate(godanEx, form, pol, reg).badge || '';
        if (!badge || badge === '—') continue;
        const gAns  = cellFor(godanEx, form, pol, reg);
        const iAns  = cellFor(ichidanEx, form, pol, reg);
        const hi = form===currentForm && pol===currentPol && reg===currentReg;
        gramRows += `<tr style="${hi?'background:rgba(48,213,200,0.14)':''}">
          <td style="padding:5px 8px;border-bottom:1px solid rgba(255,255,255,0.06);font-family:var(--ui);font-size:0.68rem;color:var(--ink-light);white-space:nowrap">${badge}</td>
          <td style="padding:5px 8px;border-bottom:1px solid rgba(255,255,255,0.06);font-family:var(--jp);font-size:0.9rem;color:var(--teal)">${gAns}</td>
          <td style="padding:5px 8px;border-bottom:1px solid rgba(255,255,255,0.06);font-family:var(--jp);font-size:0.9rem;color:var(--gold)">${iAns}</td>
        </tr>`;
      }
    }
  }

  // ── Overlay ──────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'conj-lookup-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:flex-start;justify-content:center;padding-top:40px;z-index:9999;overflow-y:auto';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  const escHandler = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);

  overlay.innerHTML = `
    <div style="background:var(--paper);border-radius:12px;padding:20px;width:min(820px,96vw);max-height:90vh;overflow-y:auto;position:relative">
      <button class="btn-icon" style="position:absolute;top:12px;right:12px" onclick="this.closest('.conj-lookup-overlay').remove()">✕</button>

      <div style="margin-bottom:14px">
        <span style="font-family:var(--jp);font-size:1.5rem;color:var(--teal)">${word.dict}</span>
        <span style="font-family:var(--jp);font-size:0.85rem;color:var(--ink-light);margin-left:10px">${word.read} · ${word.en}</span>
      </div>

      <!-- Two columns side by side -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">

        <!-- Left: this verb -->
        <div>
          <div style="font-family:var(--ui);font-size:0.65rem;letter-spacing:0.08em;color:var(--ink-light);margin-bottom:8px">THIS VERB</div>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="border-bottom:2px solid var(--border)">
              <th style="text-align:left;padding:5px 8px;font-family:var(--ui);font-size:0.65rem;letter-spacing:0.08em;color:var(--ink-light);font-weight:500">FORM</th>
              <th style="text-align:left;padding:5px 8px;font-family:var(--ui);font-size:0.65rem;letter-spacing:0.08em;color:var(--ink-light);font-weight:500">ANSWER</th>
              <th></th>
            </tr></thead>
            <tbody>${verbTableHTML}</tbody>
          </table>
        </div>

        <!-- Right: godan / ichidan paradigm -->
        <div>
          <div style="font-family:var(--ui);font-size:0.65rem;letter-spacing:0.08em;color:var(--ink-light);margin-bottom:8px">PARADIGM</div>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="border-bottom:2px solid var(--border)">
              <th style="text-align:left;padding:5px 8px;font-family:var(--ui);font-size:0.65rem;letter-spacing:0.08em;color:var(--ink-light);font-weight:500">FORM</th>
              <th style="text-align:left;padding:5px 8px;font-family:var(--ui);font-size:0.65rem;letter-spacing:0.08em;color:var(--teal);font-weight:500">GODAN 書く</th>
              <th style="text-align:left;padding:5px 8px;font-family:var(--ui);font-size:0.65rem;letter-spacing:0.08em;color:var(--gold);font-weight:500">ICHIDAN 食べる</th>
            </tr></thead>
            <tbody>${gramRows}</tbody>
          </table>
        </div>

      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}


window['startConjDrillG'] = startConjDrillG;


