// ╔══════════════════════════════════════════════════════════════════════════════
// ║ core-counters.js
// ║ Counter drill (session-based, 5 runs) + Days of the Month drill.
// ║ Depends on: core-foundation.js (Storage, STORAGE_KEYS, state, escHtml)
// ║             features-core.js (jpSpeak)
// ║             features-kana.js (kanaAddToggle)
// ╚══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// COUNTERS DRILL (Session-based, 5 runs)
// ═══════════════════════════════════════════════════════
const COUNT_SESSION_RUNS = 3;
const COUNT_QUESTIONS_PER_RUN = 15;

// ── Counter drill state ──────────────────────────────────────────────────────
// ── Counter noun pool — loaded from words table (counter_key column) ──────────
// Keyed by counterKey → array of {word, reading, meaning, emoji}
let _counterNounCache = null; // null = not loaded yet

// VG emoji lookup by Japanese word for visual display
function _counterNounEmoji(jp) {
  if (typeof VG_CATEGORIES === 'undefined') return '';
  for (const cat of Object.values(VG_CATEGORIES)) {
    const found = (cat.items || []).find(i => i.jp === jp || i.kanji === jp);
    if (found) return found.emoji;
  }
  return '';
}

async function _loadCounterNouns() {
  if (_counterNounCache) return _counterNounCache;
  _counterNounCache = {};
  try {
    const rows = await window.db.query(
      'SELECT word, reading, meaning, counter_key FROM words WHERE counter_key IS NOT NULL AND counter_key != ""',
      []
    );
    for (const row of (rows || [])) {
      if (!_counterNounCache[row.counter_key]) _counterNounCache[row.counter_key] = [];
      _counterNounCache[row.counter_key].push({
        word:    row.word,
        reading: row.reading,
        meaning: row.meaning,
        emoji:   _counterNounEmoji(row.word),
        counterKey: row.counter_key,
      });
    }
  } catch(e) { console.warn('counter noun load failed:', e); }
  return _counterNounCache;
}

const CounterDrillState = {
  run:            0,      // 0 = no session, 1-5 = current run
  queue:          [],     // current run's questions
  idx:            0,      // position in queue
  results:        [],     // 'correct'|'wrong'|'pending' for each
  correct:        0,
  wrong:          0,
  current:        null,
  waiting:        false,  // waiting for Next button
  activeCounters: ['tsu','nin','hon','mai','hiki','dai','satsu','hai','ko'],
  sessionWrong:   {},     // key → wrong count this session
  sessionCorrect: {},     // key → correct count this session
  runLog:         [],     // [{run, correct, total, errors:[{key,label,reading,cat}]}]
};

// ── Counter Mastery System ───────────────────────────────────────────────────
// Stores per counter+number: { streak, lastSeen, wrongCounter, wrongPhonetic }
// wrongCounter = knew it was wrong counter group
// wrongPhonetic = right counter, wrong reading

// Infer whether a wrong answer was wrong counter group or wrong phonetics
// Uses character-level edit distance (Levenshtein) against all counter readings for that number
function cmLevenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m+1}, (_, i) => Array.from({length: n+1}, (_, j) => i || j));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function cmInferErrorType(input, correctCounterKey, num) {
  if (!input || !COUNTER_DATA) return 'phonetic';
  const correctReading = COUNTER_DATA[correctCounterKey]?.readings[num] || '';
  const distToCorrect = cmLevenshtein(input, correctReading);

  // Check all other counters' readings for this number
  let closestOtherDist = Infinity;
  for (const [key, counter] of Object.entries(COUNTER_DATA)) {
    if (key === correctCounterKey) continue;
    const r = counter.readings?.[num];
    if (!r) continue;
    const d = cmLevenshtein(input, r);
    if (d < closestOtherDist) closestOtherDist = d;
  }

  // If input is closer to another counter's reading than the correct one → wrong group
  // Allow some tolerance: only flag as wrong group if clearly closer (≥2 steps difference)
  return (closestOtherDist < distToCorrect && distToCorrect - closestOtherDist >= 1)
    ? 'counter'
    : 'phonetic';
}

const CM = {
  MASTERY_STREAK_LOW:  3,   // 1-5 need 3 consecutive correct
  MASTERY_STREAK_HIGH: 2,   // 6-10 need 2 consecutive correct
  DECAY_DAYS: 14,           // after 14 days without seeing, streak resets by 1

  load() {
    try { return Storage.getJSON(STORAGE_KEYS.COUNTER_MASTERY, {}); }
    catch(e) { return {}; }
  },

  save(data) {
    Storage.setJSON(STORAGE_KEYS.COUNTER_MASTERY, data);
  },

  key(counterKey, num) { return counterKey + '-' + num; },

  getEntry(data, counterKey, num) {
    const k = CM.key(counterKey, num);
    if (!data[k]) data[k] = { streak: 0, lastSeen: null, wrongCounter: 0, wrongPhonetic: 0, history: [] };
    if (!data[k].history) data[k].history = []; // migrate old entries
    return data[k];
  },

  recordCorrect(counterKey, num) {
    const data = CM.load();
    const e = CM.getEntry(data, counterKey, num);
    if (e.lastSeen) {
      const daysSince = (Date.now() - new Date(e.lastSeen).getTime()) / 86400000;
      if (daysSince > CM.DECAY_DAYS) e.streak = Math.max(0, e.streak - 1);
    }
    e.streak++;
    e.lastSeen = new Date().toISOString();
    e.history.push({ t: Date.now(), correct: true });
    if (e.history.length > 30) e.history = e.history.slice(-30);
    CM.save(data);
  },

  recordWrong(counterKey, num, errorType) {
    const data = CM.load();
    const e = CM.getEntry(data, counterKey, num);
    e.streak = 0;
    e.lastSeen = new Date().toISOString();
    if (errorType === 'counter') e.wrongCounter = (e.wrongCounter || 0) + 1;
    else e.wrongPhonetic = (e.wrongPhonetic || 0) + 1;
    e.history.push({ t: Date.now(), correct: false });
    if (e.history.length > 30) e.history = e.history.slice(-30);
    CM.save(data);
  },

  isMastered(counterKey, num) {
    const data = CM.load();
    const e = CM.getEntry(data, counterKey, num);
    const threshold = num <= 5 ? CM.MASTERY_STREAK_LOW : CM.MASTERY_STREAK_HIGH;
    if (e.streak < threshold) return false;
    // Check decay
    if (e.lastSeen) {
      const daysSince = (Date.now() - new Date(e.lastSeen).getTime()) / 86400000;
      if (daysSince > CM.DECAY_DAYS) return false;
    }
    return true;
  },

  isCounterMastered(counterKey) {
    const counter = COUNTER_DATA[counterKey];
    const nums = counter ? Object.keys(counter.readings).map(Number) : Array.from({length:10},(_,i)=>i+1);
    for (const num of nums) {
      if (!CM.isMastered(counterKey, num)) return false;
    }
    return true;
  },

  getMasteryScore(counterKey) {
    const counter = COUNTER_DATA[counterKey];
    const nums = counter ? Object.keys(counter.readings).map(Number) : Array.from({length:10},(_,i)=>i+1);
    let mastered = 0;
    for (const num of nums) {
      if (CM.isMastered(counterKey, num)) mastered++;
    }
    return nums.length ? mastered / nums.length : 0;
  },

  getAllStatus() {
    const result = {};
    for (const key of Object.keys(COUNTER_DATA)) {
      result[key] = {
        mastered: CM.isCounterMastered(key),
        score: CM.getMasteryScore(key),
        due: CM.isDue(key)
      };
    }
    return result;
  },

  // ── Daily session persistence ─────────────────────────────────
  todayStr() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  },

  loadSession() {
    try {
      const s = Storage.getJSON(STORAGE_KEYS.COUNTER_SESSION, null);
      if (s && s.date === CM.todayStr()) return s;
      return null;
    } catch(e) { return null; }
  },

  saveSession(session) {
    session.date = CM.todayStr();
    Storage.setJSON(STORAGE_KEYS.COUNTER_SESSION, session);
  },

  isTodayComplete() {
    const s = CM.loadSession();
    return s && s.completed === true;
  },

  markTodayComplete() {
    const s = CM.loadSession() || { date: CM.todayStr() };
    s.completed = true;
    CM.saveSession(s);
    drillLastCompletedWrite('counters');
    try { agentUpdatePresence(); } catch(e) {}
  },

  saveProgress(queue, idx, results, correct, wrong, sessionCorrect, sessionWrong) {
    const s = CM.loadSession() || { date: CM.todayStr() };
    s.queue   = queue.map(item => ({ counterKey: item.counterKey, num: item.num, key: item.key }));
    s.idx     = idx;
    s.results = results;
    s.correct = correct;
    s.wrong   = wrong;
    s.sessionCorrect = sessionCorrect;
    s.sessionWrong   = sessionWrong;
    s.completed = false;
    CM.saveSession(s);
  },

  isDue(counterKey) {
    // Mastered counter needs a maintenance check every 14 days
    if (!CM.isCounterMastered(counterKey)) return true;
    const data = CM.load();
    let oldest = null;
    for (let num = 1; num <= 10; num++) {
      const e = CM.getEntry(data, counterKey, num);
      const d = e.lastSeen ? new Date(e.lastSeen).getTime() : 0;
      if (!oldest || d < oldest) oldest = d;
    }
    const daysSince = (Date.now() - oldest) / 86400000;
    return daysSince > CM.DECAY_DAYS;
  }
};


function countInit2() {
  countRenderRefGrid2();
  countUpdateOptions2();
  countUpdateUI2();
  // Input is always hiragana — attach kana toggle directly
  setTimeout(() => {
    const inp = document.getElementById('countAnswer2');
    if (inp) kanaAddToggle(inp, true);
  }, 50);
}

function countRenderRefGrid2() {
  const grid = document.getElementById('countRefGrid2');
  const row  = document.getElementById('countCheckboxRow');

  const counters = [
    { key: 'tsu',   name: 'つ', desc: 'general',       on: true  },
    { key: 'nin',   name: '人', desc: 'people',        on: true  },
    { key: 'hon',   name: '本', desc: 'long things',   on: true  },
    { key: 'mai',   name: '枚', desc: 'flat things',   on: true  },
    { key: 'hiki',  name: '匹', desc: 'small animals', on: true  },
    { key: 'dai',   name: '台', desc: 'machines',      on: true  },
    { key: 'satsu', name: '冊', desc: 'books',         on: true  },
    { key: 'hai',   name: '杯', desc: 'cups',          on: true  },
    { key: 'ko',    name: '個', desc: 'small round',   on: true  },
  ];
  window._counterDrillList = counters;

  const footerHtml = counters.map(c => `
    <label class="btn-toggle" style="gap:4px">
      <input type="checkbox" id="countOpt2-${c.key}" ${c.on ? 'checked' : ''}
        onchange="countUpdateOptions2()"
        style="width:12px;height:12px;accent-color:var(--teal);cursor:pointer;margin:0">
      <span style="font-family:var(--jp);font-size:0.9rem;color:var(--teal)">${c.name}</span>
      <span style="font-family:var(--ui);font-size:0.65rem;color:var(--ink-light)">${c.desc}</span>
    </label>
  `).join('');
  if (row) row.innerHTML = footerHtml;
  if (grid) grid.innerHTML = footerHtml;
}

function countShowRefPopup2(counterKey) {
  const counter = COUNTER_DATA[counterKey];
  if (!counter) return;
  
  const rows = Object.entries(counter.readings).map(([num, reading]) => {
    const isIrregular = [1,2,3,6,8,10].includes(parseInt(num));
    return `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid var(--border);color:var(--ink-light);text-align:center">${num}</td>
      <td style="padding:6px 10px;border-bottom:1px solid var(--border);font-family:var(--jp);font-size:1rem">${reading}</td>
      <td style="padding:6px 10px;border-bottom:1px solid var(--border);text-align:center">${isIrregular ? '⚡' : ''}</td>
      <td style="padding:6px 10px;border-bottom:1px solid var(--border)"><button class="btn-action" onclick="jpSpeak('${reading}')">🔊</button></td>
    </tr>`;
  }).join('');
  
  const overlay = document.createElement('div');
  overlay.className = 'count-ref-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  
  // ESC to close
  const escHandler = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);

  overlay.innerHTML = `
    <div style="background:var(--paper);border-radius:12px;padding:20px;max-width:320px;width:90%;position:relative">
      <button class="btn-icon" onclick="this.closest('.count-ref-overlay').remove()" style="position:absolute;top:10px;right:10px">✕</button>
      <div style="text-align:center;margin-bottom:12px">
        <div style="font-family:var(--jp);font-size:2rem;color:var(--teal)">${counter.name}</div>
        <div style="font-family:var(--ui);font-size:0.8rem;color:var(--ink-light)">${counter.desc}</div>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  
  document.body.appendChild(overlay);
}


function countUpdateOptions2() {
  CounterDrillState.activeCounters = [];
  const list = window._counterDrillList || [];
  list.forEach(c => {
    const cb = document.getElementById('countOpt2-' + c.key);
    if (cb && cb.checked) CounterDrillState.activeCounters.push(c.key);
  });
}

function countBuildPool2() {
  const pool = [];

  for (const counterKey of CounterDrillState.activeCounters) {
    const counter = COUNTER_DATA[counterKey];
    if (!counter) continue;
    const nums = Object.keys(counter.readings).map(Number).filter(n => n >= 1);
    for (const num of nums) {
      const key = counterKey + '-' + num;
      const mastered = CM.isMastered(counterKey, num);
      if (mastered && !CM.isDue(counterKey)) continue;
      const weight = mastered ? 1 : 2;
      for (let w = 0; w < weight; w++) {
        pool.push({ counterKey, counter, num, key, answer: counter.readings[num] });
      }
    }
  }
  // If everything mastered, return full pool for maintenance
  if (pool.length < 5) {
    for (const counterKey of CounterDrillState.activeCounters) {
      const counter = COUNTER_DATA[counterKey];
      if (!counter) continue;
      const nums = Object.keys(counter.readings).map(Number).filter(n => n >= 1);
      for (const num of nums) {
        pool.push({ counterKey, counter, num, key: counterKey + '-' + num, answer: counter.readings[num] });
      }
    }
  }
  return pool;
}

function countStartSession2() {
  if (CounterDrillState.activeCounters.length === 0) {
    document.getElementById('countFeedbackText2').innerHTML = '<span style="color:var(--coral)">Select at least one counter</span>';
    return;
  }

  // Try to resume today's session
  const saved = CM.loadSession();
  if (saved && saved.queue && saved.queue.length > 0 && !saved.completed) {
    countResumeSession2(saved);
    return;
  }

  countForceNewSession2();
}

function countForceNewSession2() {
  CounterDrillState.run = 1;
  CounterDrillState.sessionWrong = {};
  CounterDrillState.sessionCorrect = {};
  CounterDrillState.runLog = [];
  CounterDrillState.correct = 0;
  CounterDrillState.wrong = 0;
  countBuildRunQueue2();
  countUpdateUI2();
  countShowQuestion2();
}

function countResumeSession2(saved) {
  // Rebuild queue items from saved keys
  CounterDrillState.queue = saved.queue.map(item => {
    const counter = COUNTER_DATA[item.counterKey];
    return counter ? { counterKey: item.counterKey, counter, num: item.num,
      key: item.key, answer: counter.readings[item.num] } : null;
  }).filter(Boolean);

  CounterDrillState.idx          = saved.idx || 0;
  CounterDrillState.results      = saved.results || new Array(CounterDrillState.queue.length).fill('pending');
  CounterDrillState.correct      = saved.correct || 0;
  CounterDrillState.wrong        = saved.wrong || 0;
  CounterDrillState.sessionCorrect = saved.sessionCorrect || {};
  CounterDrillState.sessionWrong   = saved.sessionWrong || {};
  CounterDrillState.run          = 1;

  document.getElementById('countCorrect2').textContent = CounterDrillState.correct;
  document.getElementById('countWrong2').textContent   = CounterDrillState.wrong;

  // Show resume notice briefly
  document.getElementById('countFeedbackText2').innerHTML =
    '<span style="color:var(--gold);font-family:var(--ui);font-size:0.78rem">↩ Resuming today\'s session (' + CounterDrillState.idx + '/' + CounterDrillState.queue.length + ' done)</span>';

  countUpdateUI2();
  setTimeout(countShowQuestion2, 800);
}

function countBuildRunQueue2() {
  const pool = countBuildPool2();

  // ── Guaranteed slots ────────────────────────────────────────────────────────
  // At least 2 exception numbers (14, 20, 24) per run
  // At least 6 questions with number ≤ 10 per run
  const exceptions  = pool.filter(i => [14, 20, 24].includes(i.num));
  const underTen    = pool.filter(i => i.num <= 10);
  const rest        = pool.filter(i => !([14,20,24].includes(i.num)) && i.num > 10);

  const queue = [];

  // Guaranteed exceptions (up to 2, shuffled)
  const exSlots = exceptions.sort(() => Math.random() - 0.5).slice(0, 2);
  queue.push(...exSlots);

  // Guaranteed under-10 (up to 6)
  const under10Pool = underTen.sort(() => Math.random() - 0.5);
  let under10Added = 0;
  for (const item of under10Pool) {
    if (under10Added >= 6) break;
    queue.push(item);
    under10Added++;
  }

  // Fill remaining slots with weighted rest
  const weighted = [];
  const allRest = [...rest, ...underTen.filter(i => !queue.includes(i)), ...exceptions.filter(i => !queue.includes(i))];
  for (const item of allRest) {
    const w = CounterDrillState.sessionWrong[item.key] || 0;
    const slots = w >= 2 ? 3 : w === 1 ? 2 : 1;
    for (let s = 0; s < slots; s++) weighted.push(item);
  }

  const remaining = COUNT_QUESTIONS_PER_RUN - queue.length;
  const shuffledRest = weighted.sort(() => Math.random() - 0.5).slice(0, remaining);
  queue.push(...shuffledRest);

  // Shuffle the whole queue so guaranteed items aren't always first
  CounterDrillState.queue = queue.sort(() => Math.random() - 0.5).slice(0, COUNT_QUESTIONS_PER_RUN);
  CounterDrillState.results = new Array(CounterDrillState.queue.length).fill('pending');
  CounterDrillState.idx = 0;
}

function _countShowStandard(item, cpe2El) {
  const idx = Math.floor(Math.random() * item.counter.emoji.length);
  const emoji = item.counter.emoji[idx];
  const word = item.counter.words[idx];
  cpe2El.textContent = emoji.repeat(Math.min(item.num, 5)) + (item.num > 5 ? '...' : '');
  const plurals = {
    'person':'people','mouse':'mice','fish':'fish','dictionary':'dictionaries',
    'family':'families','library':'libraries','leaf':'leaves','knife':'knives'
  };
  const plural = item.num > 1 ? (plurals[word] || (
    word.match(/[^aeiou]y$/) ? word.slice(0,-1)+'ies' :
    word.match(/(s|sh|ch|x|z)$/) ? word+'es' : word+'s'
  )) : word;
  document.getElementById('countPromptText2').textContent = item.num + ' ' + plural;
}


function countToggleObjectMode() {
  const btn = document.getElementById('countObjectModeBtn');
  if (!btn) return;
  // Three states: off → objects (full reading) → category (counter word only) → off
  const cur = btn.dataset.mode || 'off';
  if (cur === 'off') {
    btn.dataset.mode = 'objects';
    btn.textContent = '🖼 Objects';
    btn.style.color = 'var(--teal)';
  } else if (cur === 'objects') {
    btn.dataset.mode = 'category';
    btn.textContent = '〜? Category';
    btn.style.color = 'var(--gold)';
  } else {
    btn.dataset.mode = 'off';
    btn.textContent = '🖼 Objects';
    btn.style.color = '';
  }
}


function countShowQuestion2() {
  if (CounterDrillState.idx >= CounterDrillState.queue.length) {
    countEndRun2();
    return;
  }
  
  const item = CounterDrillState.queue[CounterDrillState.idx];
  CounterDrillState.current = item;
  CounterDrillState.waiting = false;
  
  const _cpe2 = document.getElementById('countPromptEmoji2');
  _cpe2.style.fontFamily = ''; _cpe2.style.color = ''; _cpe2.style.fontSize = '3rem';

  // ── Object mode: show a DB noun with this counter ────────────────────────────
  const _omBtn = document.getElementById('countObjectModeBtn');
  const objectMode = _omBtn && (_omBtn.dataset.mode === 'objects' || _omBtn.dataset.mode === 'category');
  if (objectMode) {
    // Reset UI first
    document.getElementById('countAnswer2').value = '';
    document.getElementById('countFeedbackText2').innerHTML = '';
    document.getElementById('countAnswer2').disabled = false;
    const chkBtnO = document.getElementById('countCheckBtn2');
    chkBtnO.style.display = ''; chkBtnO.textContent = 'Check';
    document.getElementById('countNextBtn2').style.display = 'none';
    document.getElementById('countLookupBtn2').style.display = 'none';
    document.getElementById('countAnswer2').focus();
    countRenderProgress2();

    _loadCounterNouns().then(pool => {
      const matching = (pool[item.counterKey] || []);
      const allNouns = Object.values(pool).flat();
      const candidates = matching.length ? matching : allNouns;
      if (!candidates.length) {
        // No DB nouns yet — fall back to standard
        _countShowStandard(item, _cpe2);
        return;
      }
      const obj = candidates[Math.floor(Math.random() * candidates.length)];
      const emojiStr = obj.emoji ? obj.emoji.repeat(Math.min(item.num, 5)) + (item.num > 5 ? '…' : '') : '';
      _cpe2.textContent = emojiStr || '？';

      const categoryMode = document.getElementById('countObjectModeBtn')?.dataset.mode === 'category';
      const promptQ = categoryMode
        ? 'Which counter word does this take?'
        : 'How do you say ' + item.num + ' of these?';

      document.getElementById('countPromptText2').innerHTML =
        '<span style="font-family:var(--jp);font-size:1.3rem">' + obj.word + '</span>'
        + ' <span style="font-family:var(--jp);font-size:0.9rem;color:var(--ink-light)">（' + obj.reading + '）</span>'
        + '<br><span style="font-family:var(--ui);font-size:0.78rem;color:var(--ink-light)">' + obj.meaning + '</span>'
        + '<br><span style="font-family:var(--ui);font-size:0.72rem;color:var(--gold);margin-top:4px;display:block">' + promptQ + '</span>';

      CounterDrillState._categoryMode = categoryMode;
      CounterDrillState._currentNoun  = obj;
    });
    return;
  }

  // ── Standard mode ─────────────────────────────────────────────────────────
  _countShowStandard(item, _cpe2);
  document.getElementById('countAnswer2').value = '';
  document.getElementById('countFeedbackText2').innerHTML = '';
  document.getElementById('countAnswer2').disabled = false;
  const chkBtn = document.getElementById('countCheckBtn2');
  chkBtn.style.display = '';
  chkBtn.textContent = 'Check';
  document.getElementById('countNextBtn2').style.display = 'none';
  document.getElementById('countLookupBtn2').style.display = 'none';
  document.getElementById('countAnswer2').focus();
  countRenderProgress2();
}

function countCheck2() {
  // Auto-start session if none active
  if (CounterDrillState.run === 0) { countStartSession2(); return; }
  if (!CounterDrillState.current || CounterDrillState.waiting) return;
  
  const input = document.getElementById('countAnswer2').value.trim();
  if (!input) return;
  
  const item2c = CounterDrillState.current;
  // Category mode: accept the counter word (kanji or kana) instead of full reading
  let correct = item2c.answer;
  if (CounterDrillState._categoryMode && item2c.counter) {
    correct = item2c.counter.name || item2c.counterKey; // e.g. '匹' or 'hiki'
  }
  const isCorrect = input === correct || input === item2c.answer;
  const feedbackEl = document.getElementById('countFeedbackText2');
  
  if (isCorrect) {
    CounterDrillState.correct++;
    CounterDrillState.results[CounterDrillState.idx] = 'correct';
    CounterDrillState.sessionCorrect[CounterDrillState.current.key] = (CounterDrillState.sessionCorrect[CounterDrillState.current.key] || 0) + 1;
    document.getElementById('countCorrect2').textContent = CounterDrillState.correct;
    const kanjiForm = CounterDrillState.current.num + (CounterDrillState.current.counter.name || CounterDrillState.current.counterKey);
    feedbackEl.innerHTML = '<span style="color:var(--green)">✓ ' + correct + '</span>'
      + ' <span style="color:var(--ink-light);font-size:0.85rem">(' + kanjiForm + ')</span>';
    jpSpeak(correct, 0.9);
    CM.recordCorrect(CounterDrillState.current.counterKey, CounterDrillState.current.num);
    document.getElementById('countLookupBtn2').style.display = 'none';
    DrillFlow.correct(() => { CounterDrillState.idx++; countShowQuestion2(); }, 1000);
  } else {
    CounterDrillState.wrong++;
    CounterDrillState.results[CounterDrillState.idx] = 'wrong';
    CounterDrillState.sessionWrong[CounterDrillState.current.key] = (CounterDrillState.sessionWrong[CounterDrillState.current.key] || 0) + 1;
    document.getElementById('countWrong2').textContent = CounterDrillState.wrong;

    // Infer error type from answer vs all counter readings for this number
    const item2 = CounterDrillState.current;
    const errorType2 = cmInferErrorType(input, item2.counterKey, item2.num);
    CM.recordWrong(item2.counterKey, item2.num, errorType2);

    feedbackEl.innerHTML = '<span style="color:var(--coral)">✗ ' + input + '</span>'
      + '<br><span style="color:var(--teal);font-size:1.3rem">' + correct + '</span>';

    jpSpeak(correct, 0.85);
    CounterDrillState.waiting = true;
    document.getElementById('countCheckBtn2').style.display = 'none';
    document.getElementById('countNextBtn2').style.display = '';
    document.getElementById('countLookupBtn2').style.display = '';
    DrillFlow.wrong(() => countAdvance2());
  }
  
  // Save progress after every answer so close/reopen resumes correctly
  CM.saveProgress(CounterDrillState.queue, CounterDrillState.idx, CounterDrillState.results,
    CounterDrillState.correct, CounterDrillState.wrong, CounterDrillState.sessionCorrect, CounterDrillState.sessionWrong);

  countRenderProgress2();
}

function countAdvance2() {
  if (DrillFlow._advancing) return;
  DrillFlow.reset();
  CounterDrillState.waiting = false;
  document.getElementById('countCheckBtn2').style.display = '';
  document.getElementById('countNextBtn2').style.display = 'none';
  const inp2 = document.getElementById('countAnswer2');
  if (inp2) { inp2.disabled = false; inp2.value = ''; inp2.focus(); }
  CounterDrillState.idx++;
  countShowQuestion2();
}

function countEndRun2() {
  const pct = Math.round((CounterDrillState.correct / CounterDrillState.queue.length) * 100);
  const feedbackEl = document.getElementById('countFeedbackText2');

  // Build error list for this run
  const runErrors = [];
  for (let i = 0; i < CounterDrillState.queue.length; i++) {
    if (CounterDrillState.results[i] === 'wrong') {
      const item = CounterDrillState.queue[i];
      runErrors.push({
        key: item.key,
        label: item.num + (item.counter.kanji || item.counterKey),
        reading: item.answer,
        cat: item.counter.cat || 'other'
      });
    }
  }

  // Log this run
  CounterDrillState.runLog.push({ run: CounterDrillState.run, correct: CounterDrillState.correct, total: CounterDrillState.queue.length, errors: runErrors });

  if (CounterDrillState.run >= COUNT_SESSION_RUNS) {
    countShowSummary2();
  } else {
    // ── Section 1: run score ─────────────────────────────────────
    let html = '<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink);margin-bottom:10px">'
      + 'Run ' + CounterDrillState.run + '/' + COUNT_SESSION_RUNS + ' &nbsp;·&nbsp; '
      + CounterDrillState.correct + '/' + CounterDrillState.queue.length
      + (runErrors.length === 0 ? ' &nbsp;·&nbsp; <span style="color:var(--teal)">clean</span>' : '')
      + '</div>';

    // ── Section 2: errors by group ───────────────────────────────
    if (runErrors.length > 0) {
      const byGroup = {};
      for (const e of runErrors) {
        if (!byGroup[e.cat]) byGroup[e.cat] = [];
        byGroup[e.cat].push(e);
      }
      html += '<div style="margin-bottom:10px">';
      for (const [grp, items] of Object.entries(byGroup)) {
        html += '<div style="font-family:var(--ui);font-size:0.7rem;color:var(--ink-light);letter-spacing:0.06em;margin-bottom:4px">'
          + grp.toUpperCase() + '</div>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px">';
        for (const e of items) {
          html += '<span style="font-family:var(--jp);font-size:0.88rem;color:var(--ink);border:1px solid var(--border);border-radius:4px;padding:3px 9px">'
            + e.label + ' = ' + e.reading + '</span>';
        }
        html += '</div>';
      }
      html += '</div>';
    }

    // ── Section 3: top 3 mistakes so far this session ────────────
    const allErrors = CounterDrillState.runLog.flatMap(r => r.errors);
    if (allErrors.length > 0) {
      const tally = {};
      for (const e of allErrors) tally[e.key] = (tally[e.key] || { ...e, count: 0 });
      for (const e of allErrors) tally[e.key].count++;
      const top3 = Object.values(tally).sort((a, b) => b.count - a.count).slice(0, 3).filter(e => e.count > 1);
      if (top3.length > 0) {
        html += '<div style="font-family:var(--ui);font-size:0.7rem;color:var(--ink-light);letter-spacing:0.06em;margin-bottom:4px">RECURRING</div>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:5px">';
        for (const e of top3) {
          html += '<span style="font-family:var(--jp);font-size:0.88rem;color:var(--coral);border:1px solid var(--coral);border-radius:4px;padding:3px 9px">'
            + e.label + ' = ' + e.reading + ' <span style="font-family:var(--ui);font-size:0.7rem;opacity:0.7">×' + e.count + '</span></span>';
        }
        html += '</div>';
      }
    }

    feedbackEl.innerHTML = html;
    document.getElementById('countPromptEmoji2').textContent = '📊';
    document.getElementById('countPromptText2').textContent = '';
    document.getElementById('countCheckBtn2').style.display = 'none';
    document.getElementById('countNextBtn2').style.display = '';
    document.getElementById('countNextBtn2').textContent = `Run ${CounterDrillState.run + 1} →`;
    document.getElementById('countNextBtn2').onclick = () => {
      CounterDrillState.run++;
      CounterDrillState.correct = 0;
      CounterDrillState.wrong = 0;
      document.getElementById('countCorrect2').textContent = '0';
      document.getElementById('countWrong2').textContent = '0';
      document.getElementById('countNextBtn2').textContent = 'Next →';
      document.getElementById('countNextBtn2').onclick = countAdvance2;
      countBuildRunQueue2();
      countUpdateUI2();
      countShowQuestion2();
    };
  }
}

function countShowSummary2() {
  // Find problem items
  const problems = Object.entries(CounterDrillState.sessionWrong)
    .filter(([k, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  document.getElementById('countPromptEmoji2').textContent = '🎌';
  document.getElementById('countPromptText2').textContent = '';
  
  let summary = `<span style="color:var(--ink)">Session complete! (${COUNT_SESSION_RUNS} runs)</span><br>`;
  if (problems.length === 0) {
    summary += '<span style="color:var(--teal)">Perfect session! 🌟</span>';
  } else {
    summary += `<div style="margin-top:8px;font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-bottom:6px">Focus on:</div>`;
    summary += '<div style="display:flex;flex-wrap:wrap;gap:6px">';
    for (const [key, wrongCount] of problems) {
      const [counterKey, num] = key.split('-');
      const reading = COUNTER_DATA[counterKey]?.readings[parseInt(num)] || key;
      const kanji   = COUNTER_DATA[counterKey]?.kanji || counterKey;
      const isRed   = wrongCount >= 3;
      const color   = isRed ? 'var(--red)' : 'var(--gold)';
      const bg      = isRed ? 'rgba(255,107,107,0.12)' : 'rgba(255,200,60,0.1)';
      summary += `<span style="background:${bg};border:1px solid ${color};padding:4px 10px;border-radius:4px;font-family:var(--jp);font-size:0.88rem;color:${color}">${num}${kanji} = ${reading}</span>`;
    }
    summary += '</div>';
  }
  
  document.getElementById('countFeedbackText2').innerHTML = summary;
  document.getElementById('countCheckBtn2').style.display = 'none';
  document.getElementById('countNextBtn2').style.display = '';
  document.getElementById('countNextBtn2').textContent = 'New Session →';
  document.getElementById('countNextBtn2').onclick = countStartSession2;
  document.getElementById('countAnswer2').disabled = true;
  
  CM.markTodayComplete();
  CounterDrillState.run = 0;
  countUpdateUI2();
}

function countRenderProgress2() {
  const el = document.getElementById('countProgress2');
  const qEl = document.getElementById('countQIndicator2');
  
  if (!el) return;
  
  if (CounterDrillState.queue.length === 0 || CounterDrillState.run === 0) { 
    el.innerHTML = ''; 
    if (qEl) qEl.textContent = '';
    return; 
  }
  
  // Question counter
  if (qEl) qEl.textContent = `${CounterDrillState.idx + 1} / ${CounterDrillState.queue.length}`;
  
  // Progress dots - all visible from start, fill in as we go
  let html = '';
  for (let i = 0; i < CounterDrillState.queue.length; i++) {
    const r = CounterDrillState.results[i];
    const isCurrent = i === CounterDrillState.idx;
    
    let bg, border;
    if (r === 'correct') {
      bg = '#34c759'; border = '#34c759'; // green filled
    } else if (r === 'wrong') {
      bg = '#ff6b6b'; border = '#ff6b6b'; // red filled  
    } else if (isCurrent) {
      bg = 'transparent'; border = '#30d5c8'; // teal outline
    } else {
      bg = 'transparent'; border = '#555'; // gray outline
    }
    
    const size = isCurrent ? '14px' : '10px';
    const borderWidth = isCurrent ? '3px' : '2px';
    
    html += `<span style="display:inline-block;width:${size};height:${size};border-radius:50%;background:${bg};border:${borderWidth} solid ${border};box-sizing:border-box"></span>`;
  }
  el.innerHTML = html;
}

function countUpdateUI2() {
  const runEl = document.getElementById('countRunIndicator2');
  if (CounterDrillState.run > 0) {
    runEl.textContent = 'Run ' + CounterDrillState.run + ' of ' + COUNT_SESSION_RUNS;
  } else {
    runEl.textContent = '';
  }
  // Label the primary action button based on session state
  const checkBtn = document.getElementById('countCheckBtn2');
  if (checkBtn) {
    checkBtn.textContent = CounterDrillState.run === 0 ? 'Start →' : 'Check';
  }
  countRenderProgress2();
}

function countHear2() {
  if (CounterDrillState.current) {
    jpSpeak(CounterDrillState.current.answer, 0.85);
  }
}

function countShowLookup2() {
  // Add ESC handler when lookup opens
  const _escLookup = (e) => {
    if (e.key === 'Escape') {
      const ov = document.querySelector('.count-lookup-overlay');
      if (ov) { ov.remove(); document.removeEventListener('keydown', _escLookup); }
    }
  };
  document.addEventListener('keydown', _escLookup);
  if (!CounterDrillState.current) return;
  
  const counterKey = CounterDrillState.current.counterKey;
  const counter = COUNTER_DATA[counterKey];
  if (!counter) return;
  
  // Build table rows
  const rows = Object.entries(counter.readings).map(([num, reading]) => {
    const isIrregular = [1,2,3,6,8,10].includes(parseInt(num));
    const isCurrent = parseInt(num) === CounterDrillState.current.num;
    return `<tr style="${isCurrent ? 'background:rgba(48,213,200,0.15)' : ''}">
      <td style="padding:8px 12px;border-bottom:1px solid var(--border);color:var(--ink-light)">${num}</td>
      <td style="padding:8px 12px;border-bottom:1px solid var(--border);font-family:var(--jp);font-size:1.1rem">${reading}</td>
      <td style="padding:8px 12px;border-bottom:1px solid var(--border);text-align:center">${isIrregular ? '⚡' : ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid var(--border)"><button class="btn-action" onclick="jpSpeak('${reading}')">🔊</button></td>
    </tr>`;
  }).join('');
  
  // Create popup overlay
  const overlay = document.createElement('div');
  overlay.className = 'count-lookup-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  
  overlay.innerHTML = `
    <div style="background:var(--paper);border-radius:12px;padding:24px;max-width:400px;width:90%;max-height:80vh;overflow-y:auto;position:relative">
      <button class="btn-icon" onclick="this.closest('.count-lookup-overlay').remove()" style="position:absolute;top:10px;right:10px">✕</button>
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-family:var(--jp);font-size:2rem;color:var(--teal)">${counter.name}</div>
        <div style="font-family:var(--ui);font-size:0.85rem;color:var(--ink-light)">${counter.desc}</div>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--paper-dark)">
            <th style="padding:8px 12px;text-align:left;font-family:var(--ui);font-size:0.75rem;color:var(--ink-light)">#</th>
            <th style="padding:8px 12px;text-align:left;font-family:var(--ui);font-size:0.75rem;color:var(--ink-light)">Reading</th>
            <th style="padding:8px 12px;text-align:center;font-family:var(--ui);font-size:0.75rem;color:var(--ink-light)">Irreg</th>
            <th style="padding:8px 12px"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  
  document.body.appendChild(overlay);
}

window['countCheck2'] = countCheck2;



function countShowMastery() {
  const status = CM.getAllStatus();
  const keys = Object.keys(COUNTER_DATA);
  const mastered = keys.filter(k => status[k]?.mastered);
  const inProgress = keys.filter(k => !status[k]?.mastered);
  const allDone = mastered.length === keys.length;

  let html = '<div style="margin-bottom:16px">';
  html += '<div style="font-family:var(--ui);font-size:0.72rem;letter-spacing:0.08em;color:var(--ink-light);margin-bottom:10px">COUNTER MASTERY</div>';

  if (allDone) {
    html += '<div style="color:var(--teal);font-family:var(--ui);font-size:0.88rem;margin-bottom:12px">✓ All counters mastered — maintenance mode only</div>';
  }

  html += '<div style="display:flex;flex-direction:column;gap:6px">';
  for (const key of keys) {
    const c = COUNTER_DATA[key];
    const score = CM.getMasteryScore(key);
    const pct = Math.round(score * 100);
    const isMastered = status[key]?.mastered;
    const color = isMastered ? 'var(--teal)' : score > 0 ? 'var(--gold)' : 'var(--border)';

    // Per-number detail
    let numPips = '';
    for (let n = 1; n <= 10; n++) {
      const m = CM.isMastered(key, n);
      numPips += '<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:'
        + (m ? 'var(--teal)' : 'var(--paper-mid)')
        + ';border:1px solid var(--border);margin:1px;font-size:0.55rem;line-height:14px;text-align:center;color:var(--ink-light)">'
        + n + '</span>';
    }

    html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--paper-dark)">'
      + '<span style="font-family:var(--jp);font-size:1.1rem;color:' + color + ';min-width:28px">' + (c ? c.name : key) + '</span>'
      + '<span style="font-family:var(--ui);font-size:0.7rem;color:var(--ink-light);min-width:70px">' + (c ? c.desc : key) + '</span>'
      + '<div style="flex:1">' + numPips + '</div>'
      + '<span style="font-family:var(--ui);font-size:0.72rem;color:' + color + ';min-width:32px;text-align:right">' + pct + '%</span>'
      + (isMastered ? '<span style="font-family:var(--ui);font-size:0.7rem;color:var(--teal)">✓</span>' : '')
      + '</div>';
  }

  html += '</div></div>';

  const feedbackEl = document.getElementById('countFeedbackText2');
  if (feedbackEl) feedbackEl.innerHTML = html;
}
window['countShowMastery'] = countShowMastery;
// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, {
    CM,
    countShowRefPopup2,
    countInit2,
    countStartSession2,
    countUpdateOptions2,
    daysOfMonthInit,
  });
} catch(e) { console.error('[core-counters] App registry failed:', e); }

window['countAdvance2'] = countAdvance2;
window['countHear2'] = countHear2;
window['countShowLookup2'] = countShowLookup2;

// ── Days of the Month drill ───────────────────────────────────────────────────
let _daysQueue = [], _daysCurrent = null, _daysScore = { correct: 0, total: 0 };

const DAYS_OF_MONTH = {
  1:'ついたち', 2:'ふつか', 3:'みっか', 4:'よっか', 5:'いつか',
  6:'むいか', 7:'なのか', 8:'ようか', 9:'ここのか', 10:'とおか',
  11:'じゅういちにち', 12:'じゅうににち', 13:'じゅうさんにち', 14:'じゅうよっか', 15:'じゅうごにち',
  16:'じゅうろくにち', 17:'じゅうしちにち', 18:'じゅうはちにち', 19:'じゅうくにち', 20:'はつか',
  21:'にじゅういちにち', 22:'にじゅうににち', 23:'にじゅうさんにち', 24:'にじゅうよっか', 25:'にじゅうごにち',
  26:'にじゅうろくにち', 27:'にじゅうしちにち', 28:'にじゅうはちにち', 29:'にじゅうくにち', 30:'さんじゅうにち',
  31:'さんじゅういちにち'
};

function daysToggleTable() {
  const tableEl = document.getElementById('daysOfMonthTable');
  const btn = document.getElementById('daysTableToggle');
  if (!tableEl) return;
  const hidden = tableEl.style.display === 'none';
  tableEl.style.display = hidden ? 'grid' : 'none';
  if (btn) btn.textContent = hidden ? 'Hide' : 'Show';
}

function daysStop() {
  const drillEl = document.getElementById('daysDrillArea');
  const stopBtn = document.getElementById('daysStopBtn');
  if (drillEl) drillEl.style.display = 'none';
  if (stopBtn) stopBtn.style.display = 'none';
  _daysQueue = []; _daysCurrent = null;
}

function daysOfMonthInit() {
  const tableEl = document.getElementById('daysOfMonthTable');
  const drillEl = document.getElementById('daysDrillArea');
  const stopBtn = document.getElementById('daysStopBtn');
  if (drillEl) drillEl.style.display = 'none';
  if (stopBtn) stopBtn.style.display = 'none';
  if (!tableEl) return;
  // Attach hiragana input to drill field
  setTimeout(() => {
    const inp = document.getElementById('daysDrillInput');
    if (inp) kanaAddToggle(inp, true);
  }, 50);

  const readings = DAYS_OF_MONTH;
  const IREG = new Set([1,2,3,4,5,6,7,8,9,10,14,20,24]);

  // Two columns: 1-16 left, 17-31 right
  const col1 = Array.from({length:16}, (_,i) => i+1);
  const col2 = Array.from({length:16}, (_,i) => i+17);

  let html = '';

  for (let i = 0; i < 16; i++) {
    const d1 = col1[i];
    const d2 = col2[i];
    const r1 = readings[d1];
    const cell = (d, r) => {
      if (!r) return '<div style="background:var(--paper);padding:5px 8px"></div><div style="background:var(--paper);padding:5px 8px"></div><div style="background:var(--paper);padding:5px 8px"></div>';
      const irr = IREG.has(d);
      return `<div style="background:var(--paper);padding:5px 8px;font-family:var(--ui);font-size:0.82rem;color:${irr ? 'var(--gold)' : 'var(--ink-light)'}">${d}</div>`
        + `<div style="background:var(--paper);padding:5px 8px;font-family:var(--jp);font-size:0.88rem;color:var(--ink)">${r}</div>`
        + `<div style="background:var(--paper);padding:4px 6px"><button class="btn-action btn-xs" onclick="jpSpeak('${r}')">🔊</button></div>`;
    };
    html += cell(d1, r1) + cell(d2, readings[d2]);
  }
  tableEl.innerHTML = html;
}

function daysOfMonthDrill() {
  const drillEl = document.getElementById('daysDrillArea');
  const stopBtn = document.getElementById('daysStopBtn');
  if (drillEl) drillEl.style.display = 'block';
  if (stopBtn) stopBtn.style.display = 'inline-block';
  (App.DrillCard || window.DrillCard).run({
    containerId:      'daysDrillArea',
    getQueue:         () => Object.entries(DAYS_OF_MONTH)
                        .map(([d, r]) => ({ day: parseInt(d), reading: r }))
                        .sort(() => Math.random() - 0.5),
    getPrompt:        (item) => item.day + '日',
    getAnswer:        (item) => item.reading,
    onWrong:          (item) => { if (typeof jpSpeak === 'function') jpSpeak(item.reading); },
    trackingLabel:    'dates',
    runsPerSession:   1,
    inputPlaceholder: 'Type reading…',
  });
}
function daysNext()  {}
function daysCheck() {}
let _daysChecked = false;

window['daysToggleTable'] = daysToggleTable;
window['daysStop'] = daysStop;
window['daysOfMonthDrill'] = daysOfMonthDrill;
window['daysNext'] = daysNext;
window['daysCheck'] = daysCheck;

// ═══════════════════════════════════════════════════════
// CONJUGATION DRILL
// ═══════════════════════════════════════════════════════
const teMap = {く:'いて',ぐ:'いで',す:'して',つ:'って',ぬ:'んで',む:'んで',ぶ:'んで',う:'って',る:'って'};
const masuMap = {く:'き',ぐ:'ぎ',す:'し',つ:'ち',ぬ:'に',む:'み',ぶ:'び',う:'い',る:'り'};
const naiMap = {く:'か',ぐ:'が',す:'さ',つ:'た',ぬ:'な',む:'ま',ぶ:'ば',う:'わ',る:'ら'};
const taMap = {く:'いた',ぐ:'いだ',す:'した',つ:'った',ぬ:'んだ',む:'んだ',ぶ:'んだ',う:'った',る:'った'};
const volMap = {く:'こう',ぐ:'ごう',す:'そう',つ:'とう',ぬ:'のう',む:'もう',ぶ:'ぼう',う:'おう',る:'ろう'};

function conjugate(word, form, pol, reg) {
  const t = word.type;
  const stem = word.dict.slice(0, -1); // remove last char
  const end = word.end || word.dict.slice(-1);

  // い-adjectives
  if (t === 'i-adj') {
    const base = word.dict.slice(0,-1); // remove い
    if (form === 'present') {
      if (pol === 'aff') return reg === 'polite' ? {answer: word.dict+'です', badge:'Present Polite'} : {answer: word.dict, badge:'Present Plain'};
      else return reg === 'polite' ? {answer: base+'くないです', badge:'Present Negative Polite'} : {answer: base+'くない', badge: reg === 'polite' ? 'Present Negative Polite' : 'Present Negative Plain'};
    }
    if (form === 'past') {
      if (pol === 'aff') return reg === 'polite' ? {answer: base+'かったです', badge:'Past Polite'} : {answer: base+'かった', badge:'Past Plain'};
      else return reg === 'polite' ? {answer: base+'くなかったです', badge:'Past Negative Polite'} : {answer: base+'くなかった', badge: reg === 'polite' ? 'Past Negative Polite' : 'Past Negative Plain'};
    }
    if (form === 'te') return {answer: base+'くて', badge:'て-form'};
    return {answer: '—', badge: form};
  }

  // な-adjectives
  if (t === 'na-adj') {
    if (form === 'present') {
      if (pol === 'aff') return reg === 'polite' ? {answer: word.dict+'です', badge:'Present Polite'} : {answer: word.dict+'だ', badge:'Present Plain'};
      else return reg === 'polite' ? {answer: word.dict+'じゃないです', badge:'Present Negative Polite'} : {answer: word.dict+'じゃない', badge: reg === 'polite' ? 'Present Negative Polite' : 'Present Negative Plain'};
    }
    if (form === 'past') {
      if (pol === 'aff') return reg === 'polite' ? {answer: word.dict+'でした', badge:'Past Polite'} : {answer: word.dict+'だった', badge:'Past Plain'};
      else return reg === 'polite' ? {answer: word.dict+'じゃなかったです', badge:'Past Negative Polite'} : {answer: word.dict+'じゃなかった', badge: reg === 'polite' ? 'Past Negative Polite' : 'Past Negative Plain'};
    }
    if (form === 'te') return {answer: word.dict+'で', badge:'て-form'};
    return {answer: '—', badge: form};
  }

  // Irregular する
  if (t === 'irr' && word.dict === 'する') {
    const map = {
      'present-aff-polite':'します','present-aff-plain':'する',
      'present-neg-polite':'しません','present-neg-plain':'しない',
      'past-aff-polite':'しました','past-aff-plain':'した',
      'past-neg-polite':'しませんでした','past-neg-plain':'しなかった',
      'te-aff-polite':'して','te-aff-plain':'して',
      'volitional-aff-polite':'しましょう','volitional-aff-plain':'しよう',
      'passive-aff-polite':'されます','passive-aff-plain':'される',
      'potential-aff-polite':'できます','potential-aff-plain':'できる',
      'causative-aff-polite':'させます','causative-aff-plain':'させる',
    };
    const key = `${form}-${pol}-${reg}`;
    const answer = map[key] || '—';
    return {answer, badge: form};
  }

  // Irregular くる
  if (t === 'irr' && word.dict === '来る') {
    const map = {
      'present-aff-polite':'きます','present-aff-plain':'くる',
      'present-neg-polite':'きません','present-neg-plain':'こない',
      'past-aff-polite':'きました','past-aff-plain':'きた',
      'past-neg-polite':'きませんでした','past-neg-plain':'こなかった',
      'te-aff-polite':'きて','te-aff-plain':'きて',
      'volitional-aff-polite':'きましょう','volitional-aff-plain':'こよう',
    };
    const key = `${form}-${pol}-${reg}`;
    return {answer: map[key] || '—', badge: form};
  }

  // Compound する verbs (勉強する etc)
  if (t === 'irr-suru') {
    const prefix = word.dict.slice(0,-2); // remove する
    const suruResult = conjugate({dict:'する',read:'する',en:'',type:'irr'}, form, pol, reg);
    if (suruResult.answer === '—') return suruResult;
    return {answer: prefix + suruResult.answer, badge: suruResult.badge};
  }

  // る-verbs
  if (t === 'ru') {
    const vstm = word.dict.slice(0,-1); // drop る
    if (form === 'present') {
      if (pol === 'aff') return {answer: reg === 'polite' ? vstm+'ます' : word.dict, badge: reg === 'polite' ? 'Present Polite' : 'Present Plain'};
      else return {answer: reg === 'polite' ? vstm+'ません' : vstm+'ない', badge: reg === 'polite' ? 'Present Negative Polite' : 'Present Negative Plain'};
    }
    if (form === 'past') {
      if (pol === 'aff') return {answer: reg === 'polite' ? vstm+'ました' : vstm+'た', badge: reg === 'polite' ? 'Past Polite' : 'Past Plain'};
      else return {answer: reg === 'polite' ? vstm+'ませんでした' : vstm+'なかった', badge: reg === 'polite' ? 'Past Negative Polite' : 'Past Negative Plain'};
    }
    if (form === 'te') return {answer: vstm+'て', badge:'て-form'};
    if (form === 'volitional') return {answer: reg === 'polite' ? vstm+'ましょう' : vstm+'よう', badge: reg === 'polite' ? 'Volitional Polite' : 'Volitional Plain'};
    if (form === 'passive') return {answer: reg === 'polite' ? vstm+'られます' : vstm+'られる', badge:'Passive'};
    if (form === 'potential') return {answer: reg === 'polite' ? vstm+'られます' : vstm+'られる', badge: reg === 'polite' ? 'Potential Polite' : 'Potential Plain'};
    if (form === 'causative') return {answer: reg === 'polite' ? vstm+'させます' : vstm+'させる', badge:'Causative'};
  }

  // う-verbs
  if (t === 'u') {
    const vstm = word.dict.slice(0,-1); // drop ending kana
    const mstem = vstm + (masuMap[end] || '');
    const nstem = vstm + (naiMap[end] || '');
    if (form === 'present') {
      if (pol === 'aff') return {answer: reg === 'polite' ? mstem+'ます' : word.dict, badge: reg === 'polite' ? 'Present Polite' : 'Present Plain'};
      else return {answer: reg === 'polite' ? mstem+'ません' : nstem+'ない', badge: reg === 'polite' ? 'Present Negative Polite' : 'Present Negative Plain'};
    }
    if (form === 'past') {
      if (pol === 'aff') return {answer: reg === 'polite' ? mstem+'ました' : vstm+(taMap[end]||''), badge: reg === 'polite' ? 'Past Polite' : 'Past Plain'};
      else return {answer: reg === 'polite' ? mstem+'ませんでした' : nstem+'なかった', badge: reg === 'polite' ? 'Past Negative Polite' : 'Past Negative Plain'};
    }
    if (form === 'te') return {answer: vstm+(teMap[end]||''), badge:'て-form'};
    if (form === 'volitional') return {answer: reg === 'polite' ? mstem+'ましょう' : vstm+(volMap[end]||''), badge: reg === 'polite' ? 'Volitional Polite' : 'Volitional Plain'};
    if (form === 'passive') return {answer: reg === 'polite' ? nstem+'れます' : nstem+'れる', badge:'Passive'};
    if (form === 'potential') return {answer: reg === 'polite' ? nstem+'れます' : nstem+'れる', badge: reg === 'polite' ? 'Potential Polite' : 'Potential Plain'};
    if (form === 'causative') return {answer: reg === 'polite' ? nstem+'せます' : nstem+'せる', badge:'Causative'};
  }

  return {answer: '—', badge: form};
}

const GOALS_DEFAULTS = {
  kanaDrillSize:        20,
  wordsDrillSize:       20,
  conjQuestionsPerRun:  10,
  conjSessionRuns:       3,
  sstGapDays:            3,
  sstMinUtterances:     3,
};

function goalsLoad() {
  try {
    const saved = Storage.getJSON(STORAGE_KEYS.GOALS, {});
    return Object.assign({}, GOALS_DEFAULTS, saved);
  } catch(e) { return { ...GOALS_DEFAULTS }; }
}

function goalsSave() {
  const g = {
    kanaDrillSize:       parseInt(document.getElementById('goalKanaDrillSize')?.value)       || GOALS_DEFAULTS.kanaDrillSize,
    wordsDrillSize:      parseInt(document.getElementById('goalWordsDrillSize')?.value)      || GOALS_DEFAULTS.wordsDrillSize,
    conjQuestionsPerRun: parseInt(document.getElementById('goalConjQuestionsPerRun')?.value) || GOALS_DEFAULTS.conjQuestionsPerRun,
    conjSessionRuns:     parseInt(document.getElementById('goalConjSessionRuns')?.value)     || GOALS_DEFAULTS.conjSessionRuns,
    sstGapDays:          parseInt(document.getElementById('goalSstGapDays')?.value)          || GOALS_DEFAULTS.sstGapDays,
    sstMinUtterances:    parseInt(document.getElementById('goalSstMinUtterances')?.value)    || GOALS_DEFAULTS.sstMinUtterances,
  };
  Storage.setJSON(STORAGE_KEYS.GOALS, g);
  // Update live constants
  CONJ_QUESTIONS_PER_RUN = g.conjQuestionsPerRun;
  CONJ_SESSION_RUNS      = g.conjSessionRuns;
}

function goalsRestoreUI() {
  const g = goalsLoad();
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = String(val); };
  setVal('goalKanaDrillSize',       g.kanaDrillSize);
  setVal('goalWordsDrillSize',      g.wordsDrillSize);
  setVal('goalConjQuestionsPerRun', g.conjQuestionsPerRun);
  setVal('goalConjSessionRuns',     g.conjSessionRuns);
  setVal('goalSstGapDays',          g.sstGapDays);
  setVal('goalSstMinUtterances',    g.sstMinUtterances);
}

// Make conj constants mutable (they were const — redeclare as let)
let CONJ_QUESTIONS_PER_RUN = goalsLoad().conjQuestionsPerRun;
let CONJ_SESSION_RUNS      = goalsLoad().conjSessionRuns;
let conjQueue = [], conjIdx = 0, conjOk = 0, conjMiss = 0;
let conjResults = [], conjRevealed = false, conjCurrentAnswer = null;
let conjTypedAnswers = []; // stores what user typed for each item (for end-of-run review)

function getConjOptions() {
  const verbTypes = [];
  if (document.getElementById('optU')?.checked)    verbTypes.push(...VERBS_U);
  if (document.getElementById('optRu')?.checked)   verbTypes.push(...VERBS_RU);
  if (document.getElementById('optIrr')?.checked)  verbTypes.push(...VERBS_IRR);
  if (document.getElementById('optIAdj')?.checked) verbTypes.push(...ADJ_I);
  if (document.getElementById('optNaAdj')?.checked) verbTypes.push(...ADJ_NA);
  const forms = [];
  if (document.getElementById('optPresent')?.checked) forms.push('present');
  if (document.getElementById('optPast')?.checked) forms.push('past');
  if (document.getElementById('optTe')?.checked) forms.push('te');
  if (document.getElementById('optVol')?.checked) forms.push('volitional');
  if (document.getElementById('optPassive')?.checked) forms.push('passive');
  if (document.getElementById('optPotential')?.checked) forms.push('potential');
  if (document.getElementById('optCausative')?.checked) forms.push('causative');
  const polarities = [];
  if (document.getElementById('optAff')?.checked) polarities.push('aff');
  if (document.getElementById('optNeg')?.checked) polarities.push('neg');
  const registers = [];
  if (document.getElementById('optPolite')?.checked) registers.push('polite');
  if (document.getElementById('optPlain')?.checked) registers.push('plain');
  return {verbTypes, forms, polarities, registers};
}

function startConjDrill(fromUser) {
  const {verbTypes, forms, polarities, registers} = getConjOptions();
  if (!verbTypes.length || !forms.length || !polarities.length || !registers.length) {
    if (fromUser) alert('Please select at least one option in each category.');
    return;
  }
  const combos = [];
  for (let i = 0; i < 60; i++) {
    const word = verbTypes[Math.floor(Math.random()*verbTypes.length)];
    const form = forms[Math.floor(Math.random()*forms.length)];
    const pol = polarities[Math.floor(Math.random()*polarities.length)];
    const reg = registers[Math.floor(Math.random()*registers.length)];
    if ((form==='te'||form==='volitional') && pol==='neg') continue;
    const result = conjugate(word, form, pol, reg);
    if (result.answer !== '—') combos.push({word, form, pol, reg, ...result});
  }
  conjQueue = combos.slice(0, 15);
  conjIdx = 0; conjOk = 0; conjMiss = 0;
  conjResults = new Array(conjQueue.length).fill('pending');
  conjRevealed = false;
  renderConjDrill();
}

function renderConjDrill() {
  const area = document.getElementById('conjDrillArea');
  if (conjIdx >= conjQueue.length) {
    const pct = Math.round(conjOk/(conjOk+conjMiss||1)*100);
    area.innerHTML = `<div class="conj-idle" style="background:var(--paper-dark);border:1px solid var(--border)">
      <span class="conj-idle-char">完</span>
      <strong>Session complete!</strong><br>${conjOk} correct · ${conjMiss} wrong · ${pct}%<br><br>
      <button class="btn-action" onclick="startConjDrill()">Drill again →</button>
    </div>`;
    return;
  }
  const item = conjQueue[conjIdx];
  const dotHtml = conjResults.map((r,i) =>
    `<div class="conj-dot ${r==='ok'?'ok':r==='miss'?'miss':i===conjIdx?'cur':''}"></div>`
  ).join('');
  const badgeCls = item.form==='te'?'te':item.pol==='neg'?'negative':item.reg==='polite'?'polite':item.form==='past'?'past':item.form==='volitional'?'volitional':'';
  const taskLabel = `${item.badge}`;
  area.innerHTML = `
    <div class="conj-stats-bar">
      <div>Correct: <strong>${conjOk}</strong></div>
      <div>Wrong: <strong>${conjMiss}</strong></div>
      <div>Left: <strong>${conjQueue.length-conjIdx}</strong></div>
    </div>
    <div class="conj-dot-row">${dotHtml}</div>
    <div class="conj-card">
      <div style="display:flex;align-items:center;gap:10px;justify-content:center">
        ${conjListenMode ? '' : `<div class="conj-word">${item.word.dict}</div>`}
        <button class="tts-btn" onclick="conjSpeak()" title="Speak verb">🔊</button>
      </div>
      ${!conjListenMode && document.getElementById("conjShowReading")?.checked !== false ? `<div class="conj-reading">${item.word.read}</div>` : ""}
      ${!conjListenMode && document.getElementById("conjShowEn")?.checked !== false ? `<div class="conj-en">${item.word.en}</div>` : ""}
      <div class="conj-task ${badgeCls}">${taskLabel}</div>
      <div class="conj-answer-row">
        <input class="conj-input" id="conjInput" placeholder="type in kana or romaji…" data-placeholder-jp="type in kana…"
          autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false"
          onkeydown="handleConjKey(event)" oninput="liveCheckConj()">
        <button class="btn-action" onclick="checkConj()" tabindex="-1">Check</button>
        <button class="btn-action" onclick="advanceConj()" tabindex="-1">Next →</button>
      </div>
    </div>
    <div class="conj-feedback" id="conjFeedback"></div>
  `;
  const _conjEl = document.getElementById('conjInput');
  kanaAddToggle(_conjEl, true);
  _conjEl.focus();
  conjRevealed = false;
  conjCurrentAnswer = item;
}

function handleConjKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (DrillFlow._advancing) return;          // correct, auto-advancing — ignore
    if (DrillFlow._waitingEnter) { DrillFlow.advance(); return; } // wrong shown — advance
    checkConj();                               // otherwise submit answer
  }
  if (e.key === 'Tab') e.preventDefault();
}

function conjAutoConvert() {
  // Auto-convert hiragana stem to kanji for the current verb
  if (!conjCurrentAnswer) return;
  const input = document.getElementById('conjInput');
  if (!input) return;
  
  const val = input.value;
  const word = conjCurrentAnswer.word;
  
  // Get the kanji stem and hiragana stem
  const kanjiStem = word.dict.slice(0, -1); // e.g., 聞 from 聞く
  const readingStem = word.read.slice(0, -1); // e.g., き from きく
  
  // If the input starts with the hiragana stem, replace with kanji stem
  if (readingStem && val.startsWith(readingStem) && !val.startsWith(kanjiStem)) {
    const cursorPos = input.selectionStart;
    const newVal = kanjiStem + val.slice(readingStem.length);
    input.value = newVal;
    // Adjust cursor position
    const posDiff = kanjiStem.length - readingStem.length;
    input.setSelectionRange(cursorPos + posDiff, cursorPos + posDiff);
  }
}

function liveCheckConj() {
  // First try auto-convert
  conjAutoConvert();
  
  if (!conjRevealed) return;
  const input = document.getElementById('conjInput');
  const val = input.value.trim();
  const correct = toHiragana(val) === toHiragana(conjCurrentAnswer.answer);
  input.className = 'conj-input ' + (correct ? 'correct' : val ? 'wrong' : '');
  const fb = document.getElementById('conjFeedback');
  if (fb) {
    fb.className = 'conj-feedback show' + (correct ? '' : ' wrong-fb');
    fb.innerHTML = `<div class="conj-answer-reveal">${correct ? '✓ ' : '✕ correct: '} ${conjCurrentAnswer.answer}</div>`;
  }
}


