// ╔══════════════════════════════════════════════════════════════════════════════
// ║ core-kana.js
// ║ Kana drill session logic — WS (word session), initKanaDrill, kana session
// ║ functions, card timer, answer checking, kana grid.
// ║ Depends on: core-foundation.js (Storage, STORAGE_KEYS, state, HIRAGANA/KATAKANA)
// ║             core-kana-drill.js (KanaDrillState, KM, KANA_WORDS)
// ║             core-srs.js (DrillSRS)
// ║ NOTE: initKanaDrill() is called immediately at INIT parse time —
// ║       this file MUST load before core.js.
// ╚══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// WORD_SRS_KEY kept for Storage reference only — data now managed by DrillSRS
const WORD_SRS_KEY = 'jpStudio_wordSRS';
function wSrsSave(data) { /* no-op — DrillSRS.record() handles saves */ }

// Words mastery: a word is mastered when DrillSRS interval >= 14 days
function wIsMastered(kana) {
  const d = DrillSRS.get(STORAGE_KEYS.DRILL_SRS_WORDS, kana);
  return d && d.interval >= 14;
}

function wMasteryStats() {
  const all = KANA_WORDS.katakana;
  const mastered = all.filter(w => wIsMastered(w.kana)).length;
  return { mastered, total: all.length, pct: Math.round(mastered / all.length * 100) };
}

// Daily session persistence for words drill
const WS = {
  todayStr() { return new Date().toISOString().slice(0, 10); },
  load() {
    try {
      const s = (App.Storage || window.Storage).getJSON(STORAGE_KEYS.WORDS_SESSION, null);
      return (s && s.date === WS.todayStr()) ? s : null;
    } catch(e) { return null; }
  },
  save(s) { s.date = WS.todayStr(); (App.Storage || window.Storage).setJSON(STORAGE_KEYS.WORDS_SESSION, s); },
  isComplete() { const s = WS.load(); return s && s.completed; },
  markComplete() { const s = WS.load() || {}; s.completed = true; WS.save(s); drillLastCompletedWrite('words'); try { agentUpdatePresence(); } catch(e) {} },
  saveProgress(queue, idx, results, correct, wrong) {
    const s = WS.load() || {};
    s.queue = queue.map(k => k.char);
    s.idx = idx; s.results = results;
    s.correct = correct; s.wrong = wrong;
    s.completed = false;
    WS.save(s);
  }
};

// Record result for a word — now uses DrillSRS for SM-2 scheduling
function wSrsRecord(kana, correct) {
  DrillSRS.record(STORAGE_KEYS.DRILL_SRS_WORDS, kana, correct);
  // Keep legacy wSrsSave in sync for wSrsBuildPool (migrated below)
}

// Build a session pool of 20 words:
// - Due (overdue) words get priority
// - New words fill up to ~8 slots (frequency-ordered)
// - Recently mastered words fill remaining slots at reduced rate
// - 2 "stretch" words from further down the list for variety
function wSrsBuildPool() {
  let all = KANA_WORDS.katakana;
  if (KanaDrillState.wordsCategory !== 'all') {
    all = all.filter(w => w.cat === KanaDrillState.wordsCategory);
  }
  const ids  = all.map(w => w.kana);
  const _wDrillSize = goalsLoad().wordsDrillSize;
  const pool = DrillSRS.buildPool(STORAGE_KEYS.DRILL_SRS_WORDS, ids, { maxSize: _wDrillSize, newSlots: Math.round(_wDrillSize * 0.4) });
  // Convert kana IDs back to word objects, deduplicated
  const seen = new Set();
  const words = [];
  for (const kana of pool) {
    if (!seen.has(kana)) {
      seen.add(kana);
      const w = all.find(w => w.kana === kana);
      if (w) words.push(w);
    }
  }
  return words.length ? words : all.slice(0, 20);
}

function initKanaDrill() {
  stopCardTimer();

  // Seed hiragana as pre-mastered on first run
  if (KanaDrillState.mode === 'hiragana' || !KM.load()['_hiraganaSeeded']) {
    KM.seedHiragana();
  }

  // Words mode — with daily session persistence
  if (KanaDrillState.mode === 'words') {
    // Check resume
    const savedW = WS.load();
    if (savedW && savedW.queue && !savedW.completed) {
      KanaDrillState.sessionRun = 1;
      KanaDrillState.sessionWrong = {};
      KanaDrillState.sessionCorrect = {};
      const allWords = KANA_WORDS.katakana;
      const wordMap = {};
      allWords.forEach(w => { wordMap[w.kana] = w; });
      KanaDrillState.queue   = savedW.queue.map(k => {
        const w = wordMap[k];
        return w ? { char: w.kana, rom: w.rom, word: w.en } : null;
      }).filter(Boolean);
      KanaDrillState.idx          = savedW.idx || 0;
      KanaDrillState.results      = savedW.results || new Array(KanaDrillState.queue.length).fill('pending');
      KanaDrillState.correctCount = savedW.correct || 0;
      KanaDrillState.wrongCount   = savedW.wrong || 0;
      KanaDrillState.basePool = KanaDrillState.queue;
      renderDrillProgress(); kanaUpdateSessionUI();
      const fb = document.getElementById('drillFeedback');
      if (fb) fb.textContent = '↩ Resuming (' + KanaDrillState.idx + '/' + KanaDrillState.queue.length + ' done)';
      setTimeout(nextKana, 600); renderKanaGrid();
      return;
    }
    if (WS.isComplete()) {
      const stats = wMasteryStats();
      const fb = document.getElementById('drillFeedback');
      if (fb) fb.textContent = 'Today done — ' + stats.mastered + '/' + stats.total + ' mastered (' + stats.pct + '%)';
      return;
    }
    // Fresh session
    KanaDrillState.sessionRun = 1;
    KanaDrillState.sessionWrong = {};
    KanaDrillState.sessionCorrect = {};
    const pool = wSrsBuildPool().map(w => ({ char: w.kana, rom: w.rom, word: w.en }));
    KanaDrillState.basePool = pool;
    KanaDrillState.queue = [...pool];
    KanaDrillState.idx = 0; KanaDrillState.correctCount = 0; KanaDrillState.wrongCount = 0;
    KanaDrillState.results = new Array(KanaDrillState.queue.length).fill('pending');
    state.sessions++; saveState();
    renderDrillProgress(); kanaUpdateSessionUI(); nextKana(); renderKanaGrid();
    return;
  }

  // Kana mode — check for resumable today's session
  const saved = KM.loadSession();
  if (saved && saved.queue && !saved.completed) {
    kanaResumeSession(saved);
    return;
  }
  if (KM.isTodayComplete()) {
    kanaShowMastery();
    return;
  }

  kanaStartFreshSession();
}

function kanaStartFreshSession() {
  stopCardTimer();
  const _freshAnswerArea = document.querySelector('#panel-kana .answer-area');
  if (_freshAnswerArea) _freshAnswerArea.style.display = 'flex';
  KanaDrillState.sessionRun = 1;
  KanaDrillState.sessionWrong = {};
  KanaDrillState.sessionCorrect = {};

  let fullPool;
  if (KanaDrillState.mode === 'katakana') {
    KanaDrillState.dakutenEnabled = document.getElementById('kanaDakutenCheck')?.checked !== false;
    fullPool = [...KATAKANA].filter(k => k !== null);
    if (KanaDrillState.dakutenEnabled) fullPool = [...fullPool, ...KATAKANA_EXTENDED];
  } else {
    fullPool = [...HIRAGANA].filter(k => k !== null);
  }

  // Weight unmastered chars higher
  const weighted = [];
  for (const k of fullPool) {
    const mastered = KM.isMastered(k.char);
    const slots = mastered ? 1 : 3;
    for (let i = 0; i < slots; i++) weighted.push(k);
  }

  // Take 20, shuffle, prioritise unmastered
  const unmastered = fullPool.filter(k => !KM.isMastered(k.char));
  const mastered   = fullPool.filter(k =>  KM.isMastered(k.char));
  const _kDrillSize = goalsLoad().kanaDrillSize;
  const _kUnmastered = Math.round(_kDrillSize * 0.8);
  const _kMastered   = Math.round(_kDrillSize * 0.2);
  const pool = [
    ...unmastered.sort(() => Math.random() - 0.5).slice(0, _kUnmastered),
    ...mastered.sort(() => Math.random() - 0.5).slice(0, _kMastered)
  ].sort(() => Math.random() - 0.5).slice(0, _kDrillSize);

  KanaDrillState.basePool = pool.length ? pool : fullPool.sort(() => Math.random() - 0.5).slice(0, _kDrillSize);
  KanaDrillState.queue = [...KanaDrillState.basePool];
  KanaDrillState.idx = 0; KanaDrillState.correctCount = 0; KanaDrillState.wrongCount = 0;
  KanaDrillState.results = new Array(KanaDrillState.queue.length).fill('pending');
  state.sessions++; saveState();
  renderDrillProgress(); kanaUpdateSessionUI(); nextKana(); renderKanaGrid();
}

function kanaResumeSession(saved) {
  stopCardTimer();
  KanaDrillState.sessionRun = 1;
  KanaDrillState.sessionWrong = {};
  KanaDrillState.sessionCorrect = {};

  // Rebuild queue from saved char list
  const allKana = [
    ...HIRAGANA.filter(k => k), ...KATAKANA.filter(k => k), ...KATAKANA_EXTENDED
  ];
  const charMap = {};
  allKana.forEach(k => { charMap[k.char] = k; });

  KanaDrillState.queue   = saved.queue.map(c => charMap[c]).filter(Boolean);
  KanaDrillState.idx     = saved.idx || 0;
  KanaDrillState.results = saved.results || new Array(KanaDrillState.queue.length).fill('pending');
  KanaDrillState.correctCount = saved.correct || 0;
  KanaDrillState.wrongCount   = saved.wrong || 0;
  KanaDrillState.basePool = KanaDrillState.queue;

  renderDrillProgress(); kanaUpdateSessionUI();
  // Brief resume notice
  const fb = document.getElementById('drillFeedback');
  if (fb) fb.textContent = '↩ Resuming (' + KanaDrillState.idx + '/' + KanaDrillState.queue.length + ' done)';
  setTimeout(nextKana, 600);
  renderKanaGrid();
}

function kanaUpdateSessionUI() {
  const el = document.getElementById('kanaSessionInfo');
  if (!el) return;
  if (KanaDrillState.sessionRun === 0) { el.textContent = ''; return; }
  el.textContent = `Run ${KanaDrillState.sessionRun} of ${KANA_SESSION_RUNS}`;
}

function kanaNextRun() {
  // Build next queue weighted toward session mistakes
  KanaDrillState.sessionRun++;
  KanaDrillState.idx = 0; KanaDrillState.correctCount = 0; KanaDrillState.wrongCount = 0;

  if (KanaDrillState.sessionRun > KANA_SESSION_RUNS) {
    kanaShowSessionSummary();
    return;
  }

  // Weight: wrong chars get 3 slots, never-wrong get 1, correct-every-time get 0 (dropped after run 2+)
  const weighted = [];
  const allChars = KanaDrillState.basePool;
  for (const item of allChars) {
    const w = KanaDrillState.sessionWrong[item.char] || 0;
    const right = KanaDrillState.sessionCorrect[item.char] || 0;
    // Drop chars that have been correct ≥2 times and wrong 0 times (mastered this session)
    if (KanaDrillState.sessionRun >= 3 && right >= 2 && w === 0) continue;
    const slots = w >= 2 ? 3 : w === 1 ? 2 : 1;
    for (let s = 0; s < slots; s++) weighted.push(item);
  }

  // If everything mastered, still give some revision
  const pool = weighted.length >= 5 ? weighted : allChars;

  // Shuffle and cap at 20
  KanaDrillState.queue = pool.sort(() => Math.random() - 0.5).slice(0, 20);
  KanaDrillState.results = new Array(KanaDrillState.queue.length).fill('pending');

  renderDrillProgress();
  kanaUpdateSessionUI();
  nextKana();
  renderKanaGrid();
}

function kanaShowSessionSummary() {
  stopCardTimer();
  KanaDrillState.currentKana = null;

  // Build list of problem chars from this session
  const problems = KanaDrillState.basePool
    .map(item => ({ item, w: KanaDrillState.sessionWrong[item.char] || 0, r: KanaDrillState.sessionCorrect[item.char] || 0 }))
    .filter(x => x.w > 0)
    .sort((a, b) => b.w - a.w);

  const charEl = document.getElementById('drillChar');
  const fbEl = document.getElementById('feedbackMsg');
  charEl.textContent = '🎌';
  charEl.style.fontSize = '3rem';

  let summary = `Session complete! (${KANA_SESSION_RUNS} runs)`;
  if (problems.length === 0) {
    summary += ' — Perfect session! 🌟';
  } else {
    summary += ` — Focus on: ${problems.slice(0,5).map(x => x.item.char + '(' + x.item.rom + ')').join('  ')}`;
  }
  fbEl.textContent = summary;
  fbEl.className = problems.length === 0 ? 'feedback-msg correct' : 'feedback-msg wrong';

  const _nkInput = document.getElementById('answerInput');
  _nkInput.value = '';
  _nkInput.disabled = false;
  _nkInput._waitingForNext = false;
  _nkInput.placeholder = '';
  document.getElementById('skipKanaBtn').textContent = 'New Session →';
  KanaDrillState.sessionRun = 0;
  if (KanaDrillState.mode !== 'words') KM.markComplete();
  else WS.markComplete();
  kanaUpdateSessionUI();
  renderKanaGrid();
  setTimeout(() => { charEl.style.fontSize = ''; }, 100);
}

function kanaShowMastery() {
  stopCardTimer();
  const charEl = document.getElementById('drillChar');
  const fbEl   = document.getElementById('feedbackMsg');
  if (charEl) { charEl.textContent = '✓'; charEl.style.fontSize = '3rem'; }

  let fullPool;
  if (KanaDrillState.mode === 'katakana') {
    fullPool = [...KATAKANA.filter(k=>k), ...KATAKANA_EXTENDED];
  } else {
    fullPool = HIRAGANA.filter(k=>k);
  }

  const stats = KM.getMasteryStats(fullPool);
  const allDone = stats.mastered === stats.total;

  let html = (allDone
    ? '<span style="color:var(--teal)">All ' + KanaDrillState.mode + ' mastered! Maintenance only.</span>'
    : '<span style="color:var(--gold)">Today\'s session complete — ' + stats.mastered + '/' + stats.total + ' mastered</span>')
    + '<br><button onclick="kanaStartFreshSession()" style="margin-top:8px;padding:6px 16px;background:none;border:1px solid var(--border);border-radius:6px;font-family:var(--ui);font-size:0.78rem;color:var(--ink-light);cursor:pointer">New session anyway</button>';

  if (fbEl) { fbEl.innerHTML = html; fbEl.className = 'feedback-msg'; }
  document.getElementById('skipKanaBtn').textContent = 'New Session →';
  const _answerArea = document.querySelector('#panel-kana .answer-area');
  if (_answerArea) _answerArea.style.display = 'none';
  setTimeout(() => { if (charEl) charEl.style.fontSize = ''; }, 100);
}

function nextKana() {
  stopCardTimer();
  if (KanaDrillState.idx >= KanaDrillState.queue.length) { showDrillComplete(); return; }
  KanaDrillState.currentKana = KanaDrillState.queue[KanaDrillState.idx];
  kanaCardTimerRevealed = false;
  const _dc = document.getElementById('drillChar');
  const fbEl = document.getElementById('feedbackMsg');
  if (fbEl) { fbEl.textContent = ''; fbEl.className = 'feedback-msg'; }
  
  // Handle different challenge modes for words
  if (KanaDrillState.mode === 'words') {
    const wordHint = document.getElementById('kanaWordHint');
    
    if (KanaDrillState.wordsChallengeMode === 'kana2rom') {
      // Show katakana, type romaji
      _dc.textContent = KanaDrillState.currentKana.char;
      _dc.style.fontSize = 'clamp(2rem, 8vw, 4rem)';
      if (wordHint) {
        const showH = { checked: true };
        wordHint.textContent = KanaDrillState.currentKana.word || '';
        wordHint.style.visibility = (showH && showH.checked) ? 'visible' : 'hidden';
      }
      document.getElementById('answerInput').placeholder = 'type romaji…';
      
    } else if (KanaDrillState.wordsChallengeMode === 'kana2en') {
      // Show katakana, type English
      _dc.textContent = KanaDrillState.currentKana.char;
      _dc.style.fontSize = 'clamp(2rem, 8vw, 4rem)';
      if (wordHint) { wordHint.textContent = ''; wordHint.style.visibility = 'hidden'; }
      document.getElementById('answerInput').placeholder = 'type English meaning…';
      
    } else if (KanaDrillState.wordsChallengeMode === 'en2kana') {
      // Show English, type katakana
      _dc.textContent = KanaDrillState.currentKana.word;
      _dc.style.fontSize = 'clamp(1.5rem, 5vw, 2.5rem)';
      if (wordHint) { wordHint.textContent = ''; wordHint.style.visibility = 'hidden'; }
      document.getElementById('answerInput').placeholder = 'type katakana…';
      
    } else if (KanaDrillState.wordsChallengeMode === 'listen') {
      // Hide word, play audio
      _dc.textContent = '🔊';
      _dc.style.fontSize = 'clamp(3rem, 10vw, 5rem)';
      if (wordHint) { wordHint.textContent = 'Click 🔊 or press Enter to hear again'; wordHint.style.visibility = 'visible'; }
      document.getElementById('answerInput').placeholder = 'type what you hear…';
      setTimeout(() => jpSpeak(KanaDrillState.currentKana.char, 0.8), 300);
      
    } else if (KanaDrillState.wordsChallengeMode === 'multi') {
      // Multiple choice
      _dc.textContent = KanaDrillState.currentKana.char;
      _dc.style.fontSize = 'clamp(2rem, 8vw, 4rem)';
      if (wordHint) { wordHint.textContent = ''; wordHint.style.visibility = 'hidden'; }
      setupMultipleChoice();
    }
    
  } else {
    // Regular kana mode
    _dc.textContent = KanaDrillState.currentKana.char;
    _dc.style.fontSize = '';
    const wordHint = document.getElementById('kanaWordHint');
    if (wordHint) { wordHint.textContent = ''; wordHint.style.visibility = 'hidden'; }
  }
  
  document.getElementById('drillChar').className = 'drill-char';
  // Show TTS button in words mode (except listen mode which already has audio)
  const ttsBtn = document.getElementById('kanaTtsBtn');
  if (ttsBtn) {
    ttsBtn.style.display = (KanaDrillState.mode === 'words' && KanaDrillState.wordsChallengeMode !== 'listen') ? 'block' : 'none';
  }
  KanaDrillState.advancing = false;
  const input = document.getElementById('answerInput');
  input.value = '';
  input.disabled = false;
  input._waitingForNext = false;
  input.placeholder = '';
  if (KanaDrillState.wordsChallengeMode !== 'multi' || KanaDrillState.mode !== 'words') input.focus();
  document.getElementById('feedbackMsg').textContent = '';
  document.getElementById('feedbackMsg').className = 'feedback-msg';
  document.getElementById('skipKanaBtn').textContent = 'Next →';
  updateDrillStats();
  if (kanaTimerSeconds > 0) startCardTimer();
}

function kanaSpeakCurrent() {
  if (KanaDrillState.currentKana && KanaDrillState.currentKana.char) {
    jpSpeak(KanaDrillState.currentKana.char, 0.8);
  }
}
window['kanaSpeakCurrent'] = kanaSpeakCurrent;

function setupMultipleChoice() {
  const btns = document.querySelectorAll('.multi-choice-btn');
  const allWords = KANA_WORDS.katakana;
  
  // Get 3 wrong answers (different from correct)
  const wrongAnswers = allWords
    .filter(w => w.kana !== KanaDrillState.currentKana.char)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map(w => w.word);
  
  // Insert correct answer at random position
  const options = [...wrongAnswers];
  KanaDrillState.multiChoiceCorrectIdx = Math.floor(Math.random() * 4);
  options.splice(KanaDrillState.multiChoiceCorrectIdx, 0, KanaDrillState.currentKana.word);
  
  btns.forEach((btn, i) => {
    btn.textContent = options[i];
    btn.style.borderColor = 'var(--border)';
    btn.style.background = 'none';
    btn.disabled = false;
  });
}

function startCardTimer() {
  let timeLeft = kanaTimerSeconds;
  const bar = document.getElementById('timerBarWrap');
  const barFill = document.getElementById('timerBar');
  const display = document.getElementById('timerDisplay');
  const val = document.getElementById('timerVal');
  if (bar) bar.style.display = 'block';
  if (display) display.style.display = 'flex';
  if (val) { val.textContent = timeLeft; val.style.color = 'var(--ink)'; }
  if (barFill) { barFill.style.transition = 'none'; barFill.style.width = '100%'; barFill.style.background = 'var(--teal)'; }
  setTimeout(() => {
    if (barFill) { barFill.style.transition = `width ${kanaTimerSeconds}s linear`; barFill.style.width = '0%'; }
  }, 30);
  kanaCardTimer = setInterval(() => {
    timeLeft--;
    if (val) { val.textContent = timeLeft; val.style.color = timeLeft <= 1 ? 'var(--red)' : 'var(--gold)'; }
    if (timeLeft <= 0) { stopCardTimer(); cardTimerExpired(); }
  }, 1000);
}

function stopCardTimer() {
  if (kanaCardTimer) { clearInterval(kanaCardTimer); kanaCardTimer = null; }
  const bar = document.getElementById('timerBarWrap');
  const display = document.getElementById('timerDisplay');
  if (bar) bar.style.display = 'none';
  if (display) display.style.display = 'none';
}

function cardTimerExpired() {
  if (!KanaDrillState.currentKana || kanaCardTimerRevealed) return;
  kanaCardTimerRevealed = true;
  if (!state.kanaScores[KanaDrillState.currentKana.char]) state.kanaScores[KanaDrillState.currentKana.char] = {correct:0, wrong:0};
  state.kanaScores[KanaDrillState.currentKana.char].wrong++;
  if (KanaDrillState.sessionRun > 0) KanaDrillState.sessionWrong[KanaDrillState.currentKana.char] = (KanaDrillState.sessionWrong[KanaDrillState.currentKana.char] || 0) + 1;
  KanaDrillState.wrongCount++;
  KanaDrillState.results[KanaDrillState.idx] = 'wrong';
  KanaDrillState.queue.push(KanaDrillState.currentKana);
  KanaDrillState.results.push('pending');
  document.getElementById('drillChar').classList.add('wrong');
  const fbEl = document.getElementById('feedbackMsg');
  fbEl.textContent = '⏱ ' + KanaDrillState.currentKana.char + ' = ' + KanaDrillState.currentKana.rom;
  fbEl.className = 'feedback-msg wrong';
  const _timerInput = document.getElementById('answerInput');
  _timerInput.value = '';
  _timerInput.placeholder = 'Press Enter to continue…';
  _timerInput._waitingForNext = true;
  document.getElementById('skipKanaBtn').textContent = 'Next →';
  saveState(); updateDrillStats(); renderDrillProgress();
}

function checkAnswer() {
  const _inp = document.getElementById('answerInput');
  // _waitingForNext is set on wrong answers; handleKanaKey handles Enter.
  // checkAnswer should not fire when waiting (kanaCardTimerRevealed blocks it).
  if (!KanaDrillState.currentKana || kanaCardTimerRevealed) return;
  const ans = _inp.value.trim().toLowerCase();
  if (!ans) {
    // In listen mode, empty Enter replays audio
    if (KanaDrillState.mode === 'words' && KanaDrillState.wordsChallengeMode === 'listen') {
      jpSpeak(KanaDrillState.currentKana.char, 0.8);
      return;
    }
    return;
  }
  stopCardTimer();

  let correct;
  if (KanaDrillState.mode === 'words') {
    if (KanaDrillState.wordsChallengeMode === 'kana2rom') {
      // Match romaji
      correct = ans === KanaDrillState.currentKana.rom.toLowerCase().replace(/\s/g, '');
    } else if (KanaDrillState.wordsChallengeMode === 'kana2en') {
      // Match English word — allow partial / slash-separated variants
      const targets = (KanaDrillState.currentKana.word || '').toLowerCase().split('/').map(s => s.trim());
      correct = targets.some(t => ans === t || (t.includes(ans) && ans.length >= 3));
    } else if (KanaDrillState.wordsChallengeMode === 'en2kana') {
      // Match katakana
      correct = ans === KanaDrillState.currentKana.char;
    } else if (KanaDrillState.wordsChallengeMode === 'listen') {
      // Match katakana or romaji
      correct = ans === KanaDrillState.currentKana.char || ans === KanaDrillState.currentKana.rom.toLowerCase().replace(/\s/g, '');
    } else {
      // Default: match English
      const targets = (KanaDrillState.currentKana.word || '').toLowerCase().split('/').map(s => s.trim());
      correct = targets.some(t => ans === t || (t.includes(ans) && ans.length >= 3));
    }
  } else {
    correct = ans === KanaDrillState.currentKana.rom ||
      (KanaDrillState.currentKana.rom === 'shi' && ans === 'si') ||
      (KanaDrillState.currentKana.rom === 'chi' && ans === 'ti') ||
      (KanaDrillState.currentKana.rom === 'tsu' && ans === 'tu') ||
      (KanaDrillState.currentKana.rom === 'fu'  && ans === 'hu') ||
      (KanaDrillState.currentKana.rom === 'n'   && ans === 'nn');
  }
  if (!state.kanaScores[KanaDrillState.currentKana.char]) state.kanaScores[KanaDrillState.currentKana.char] = {correct:0, wrong:0};
  const charEl = document.getElementById('drillChar');
  const fbEl = document.getElementById('feedbackMsg');
  
  // Build answer label based on mode
  let answerLabel;
  if (KanaDrillState.mode === 'words') {
    if (KanaDrillState.wordsChallengeMode === 'kana2rom') {
      answerLabel = KanaDrillState.currentKana.char + ' = ' + KanaDrillState.currentKana.rom;
    } else if (KanaDrillState.wordsChallengeMode === 'en2kana') {
      answerLabel = KanaDrillState.currentKana.word + ' = ' + KanaDrillState.currentKana.char;
    } else {
      answerLabel = KanaDrillState.currentKana.char + ' = ' + KanaDrillState.currentKana.word;
    }
  } else {
    answerLabel = KanaDrillState.currentKana.rom;
  }
  
  if (correct) {
    KanaDrillState.advancing = true; // block extra input during 700ms window
    state.kanaScores[KanaDrillState.currentKana.char].correct++;
    if (KanaDrillState.sessionRun > 0) KanaDrillState.sessionCorrect[KanaDrillState.currentKana.char] = (KanaDrillState.sessionCorrect[KanaDrillState.currentKana.char] || 0) + 1;
    KanaDrillState.correctCount++;
    KanaDrillState.results[KanaDrillState.idx] = 'correct';
    charEl.classList.add('correct');
    fbEl.textContent = '✓ ' + answerLabel;
    fbEl.className = 'feedback-msg correct';
    if (KanaDrillState.mode === 'words') wSrsRecord(KanaDrillState.currentKana.char, true);
    saveState(); updateDrillStats(); renderDrillProgress();
    // Auto-advance after showing correct colour
    setTimeout(() => { KanaDrillState.advancing = false; KanaDrillState.idx++; nextKana(); }, 700);
  } else {
    kanaCardTimerRevealed = true;
    state.kanaScores[KanaDrillState.currentKana.char].wrong++;
    if (KanaDrillState.sessionRun > 0) KanaDrillState.sessionWrong[KanaDrillState.currentKana.char] = (KanaDrillState.sessionWrong[KanaDrillState.currentKana.char] || 0) + 1;
    KanaDrillState.wrongCount++;
    KanaDrillState.results[KanaDrillState.idx] = 'wrong';
    charEl.classList.add('wrong');
    fbEl.textContent = '✗ ' + answerLabel;
    fbEl.className = 'feedback-msg wrong';
    KanaDrillState.queue.push(KanaDrillState.currentKana);
    KanaDrillState.results.push('pending');
    if (KanaDrillState.mode === 'words') wSrsRecord(KanaDrillState.currentKana.char, false);
    const _ansInput = document.getElementById('answerInput');
    _ansInput.value = '';
    _ansInput.placeholder = 'Press Enter to continue…';
    _ansInput._waitingForNext = true;
    document.getElementById('skipKanaBtn').textContent = 'Next →';
    saveState(); updateDrillStats(); renderDrillProgress();
  }
}

function skipKana() {
  // If we're in between runs (Next Run → button state), advance to next run
  if (!KanaDrillState.currentKana) {
    document.getElementById('skipKanaBtn').textContent = 'Next →';
    kanaNextRun();
    return;
  }
  if (kanaCardTimerRevealed) {
    document.getElementById('skipKanaBtn').textContent = 'Next →';
    KanaDrillState.idx++; nextKana(); renderDrillProgress(); return;
  }
  stopCardTimer();
  KanaDrillState.results[KanaDrillState.idx] = 'wrong';
  KanaDrillState.idx++;
  renderDrillProgress();
  nextKana();
}

function handleKanaKey(e) {
  if (e.key !== 'Enter') return;
  if (KanaDrillState.advancing) return; // correct answer auto-advancing — ignore Enter
  if (kanaCardTimerRevealed) {
    // Wrong answer — Enter advances to next card
    e.stopPropagation();
    KanaDrillState.idx++; nextKana(); renderDrillProgress();
  } else if (document.getElementById('answerInput').value.trim()) {
    e.stopPropagation();
    checkAnswer();
  }
}

// Catch Enter at document level when input is disabled (post-answer state) or at session end
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  
  // Check if we're at end of session (no current kana, but answerInput exists)
  const inp = document.getElementById('answerInput');
  if (!inp) return;
  
  // At session end: KanaDrillState.currentKana is null, skipBtn says "New Session →" or "Next Run →"
  if (!KanaDrillState.currentKana) {
    const skipBtn = document.getElementById('skipKanaBtn');
    if (skipBtn && (skipBtn.textContent.includes('New Session') || skipBtn.textContent.includes('Next Run'))) {
      e.preventDefault();
      e.stopPropagation();
      skipKana();
      return;
    }
    return;
  }
  
  // Normal post-answer state (wrong answer waiting for Enter)
  if (!kanaCardTimerRevealed) return;
  if (KanaDrillState.advancing) return; // correct is auto-advancing, ignore
  e.preventDefault();
  e.stopPropagation();
  if (KanaDrillState.mode === 'words') { skipKana(); }
  else { KanaDrillState.idx++; nextKana(); renderDrillProgress(); }
});

// Auto-submit after 2 chars (single kana mode only — not words mode)
function handleKanaInput(input) {
  if (kanaCardTimerRevealed) return; // wrong answer pending Enter
  if (KanaDrillState.advancing) return;        // correct answer auto-advancing
  if (KanaDrillState.mode === 'words') return; // words mode: manual Enter only
  const val = input.value.toLowerCase();
  const len = val.length;
  if (len === 0) return;
  // Vowels are complete on first character
  const singleVowels = ['a','i','u','e','o'];
  if (len === 1 && singleVowels.includes(val)) { checkAnswer(); return; }
  // ん: submit on single 'n' if that's the expected answer
  if (len === 1 && val === 'n' && KanaDrillState.currentKana && KanaDrillState.currentKana.rom === 'n') { checkAnswer(); return; }
  if (len === 2) {
    // Could still be extended: sh→shi, ch→chi, ts→tsu
    const couldExtend = val === 'sh' || val === 'ch' || val === 'ts';
    if (!couldExtend) { checkAnswer(); }
  }
  if (len >= 3) { checkAnswer(); }
}

function updateDrillStats() {
  document.getElementById('drillCorrect').textContent = KanaDrillState.correctCount;
  document.getElementById('drillWrong').textContent = KanaDrillState.wrongCount;
  const origRemaining = KanaDrillState.queue.slice(KanaDrillState.idx).filter((k,i) => !KanaDrillState.queue.slice(0,KanaDrillState.idx).some(p => p.char===k.char)).length;
  document.getElementById('drillRemaining').textContent = origRemaining;
}

function renderDrillProgress() {
  const el = document.getElementById('drillProgress');
  el.innerHTML = KanaDrillState.results.slice(0, KanaDrillState.queue.length).map((r, i) =>
    `<div class="progress-dot ${r==='correct'?'done':r==='wrong'?'wrong-dot':i===KanaDrillState.idx?'current':''}"></div>`
  ).join('');
}

function showDrillComplete() {
  stopCardTimer();
  const total = KanaDrillState.correctCount + KanaDrillState.wrongCount;
  const pct = total > 0 ? Math.round(KanaDrillState.correctCount / total * 100) : 0;
  state.lastAccuracy = pct;
  saveState();
  KanaDrillState.currentKana = null;

  if (KanaDrillState.sessionRun > 0 && KanaDrillState.sessionRun < KANA_SESSION_RUNS) {
    // Mid-session — show brief result then auto-advance
    document.getElementById('drillChar').textContent = '✓';
    document.getElementById('drillChar').style.fontSize = '4rem';
    document.getElementById('feedbackMsg').textContent =
      `Run ${KanaDrillState.sessionRun}/${KANA_SESSION_RUNS} — ${KanaDrillState.correctCount}/${total} correct (${pct}%). Next run focuses on problem ones…`;
    document.getElementById('feedbackMsg').className = 'feedback-msg correct';
    document.getElementById('answerInput').value = '';
    document.getElementById('answerInput').disabled = false;
    document.getElementById('skipKanaBtn').textContent = 'Next Run →';
    renderKanaGrid();
    setTimeout(() => { document.getElementById('drillChar').style.fontSize = ''; }, 100);
  } else {
    kanaNextRun(); // will show summary if run 5 done
  }
}

function renderKanaGrid() {
  const allKana = (KanaDrillState.mode === 'katakana' || KanaDrillState.mode === 'words') ? KATAKANA : HIRAGANA;
  const el = document.getElementById('kanaGrid');
  el.innerHTML = allKana.map(k => {
    if (!k) return '<div class="kana-cell" style="opacity:0;pointer-events:none"></div>';
    const sw = KanaDrillState.sessionWrong[k.char] || 0;
    const sc = KanaDrillState.sessionCorrect[k.char] || 0;
    const total = sw + sc;
    const ratio = total > 0 ? sc / total : -1;
    const cls = ratio >= 0.8 ? 'mastered' : (total >= 2 && ratio < 0.8 ? 'struggling' : '');
    return `<div class="kana-cell ${cls}"><span class="kana-char">${k.char}</span><span class="kana-rom">${k.rom}</span></div>`;
  }).join('');
}


// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, {
    WS,
    wSrsSave, wIsMastered, wMasteryStats,
    wSrsRecord, wSrsBuildPool,
    initKanaDrill,
    kanaStartFreshSession, kanaResumeSession,
    kanaUpdateSessionUI, kanaNextRun,
    kanaShowSessionSummary, kanaShowMastery,
    nextKana, kanaSpeakCurrent,
    setupMultipleChoice,
    startCardTimer, stopCardTimer, cardTimerExpired,
    checkAnswer, skipKana,
    handleKanaKey, handleKanaInput,
    updateDrillStats, renderDrillProgress,
  });
  window['WS']                 = WS;
  window['kanaShowMastery']    = kanaShowMastery;
  window['kanaStartFreshSession'] = kanaStartFreshSession;
  window['kanaSpeakCurrent']   = kanaSpeakCurrent;
  window['initKanaDrill']      = initKanaDrill;
} catch(e) { console.error('[core-kana] App registry failed:', e); }
