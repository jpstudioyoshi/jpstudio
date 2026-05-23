// ═══════════════════════════════════════════════════════
// FEATURES-TIMES
// Times & dates drill — question generation, blitz mode,
// TTS playback, scoring. Requires: Storage, DrillFlow.
// ═══════════════════════════════════════════════════════

/* ══════════════════════════════════════════════════════════
   TIMES DRILL
   ══════════════════════════════════════════════════════════ */

// ── Pronunciation helpers ─────────────────────────────────
const HOUR_READ  = ['れいじ','いちじ','にじ','さんじ','よじ','ごじ','ろくじ','しちじ','はちじ','くじ','じゅうじ','じゅういちじ','じゅうにじ'];
const HOUR_KANJI = ['0時','1時','2時','3時','4時','5時','6時','7時','8時','9時','10時','11時','12時'];

function minuteReading(m) {
  const map = {
    0:'',1:'いっぷん',2:'にふん',3:'さんぷん',4:'よんぷん',5:'ごふん',
    6:'ろっぷん',7:'ななふん',8:'はっぷん',9:'きゅうふん',10:'じゅっぷん',
    11:'じゅういっぷん',12:'じゅうにふん',13:'じゅうさんぷん',14:'じゅうよんぷん',
    15:'じゅうごふん',16:'じゅうろっぷん',17:'じゅうななふん',18:'じゅうはっぷん',
    19:'じゅうきゅうふん',20:'にじゅっぷん',21:'にじゅういっぷん',22:'にじゅうにふん',
    23:'にじゅうさんぷん',24:'にじゅうよんぷん',25:'にじゅうごふん',
    26:'にじゅうろっぷん',27:'にじゅうななふん',28:'にじゅうはっぷん',
    29:'にじゅうきゅうふん',30:'はん',31:'さんじゅういっぷん',32:'さんじゅうにふん',
    33:'さんじゅうさんぷん',34:'さんじゅうよんぷん',35:'さんじゅうごふん',
    36:'さんじゅうろっぷん',37:'さんじゅうななふん',38:'さんじゅうはっぷん',
    39:'さんじゅうきゅうふん',40:'よんじゅっぷん',41:'よんじゅういっぷん',
    42:'よんじゅうにふん',43:'よんじゅうさんぷん',44:'よんじゅうよんぷん',
    45:'よんじゅうごふん',46:'よんじゅうろっぷん',47:'よんじゅうななふん',
    48:'よんじゅうはっぷん',49:'よんじゅうきゅうふん',50:'ごじゅっぷん',
    51:'ごじゅういっぷん',52:'ごじゅうにふん',53:'ごじゅうさんぷん',
    54:'ごじゅうよんぷん',55:'ごじゅうごふん',56:'ごじゅうろっぷん',
    57:'ごじゅうななふん',58:'ごじゅうはっぷん',59:'ごじゅうきゅうふん'
  };
  return map[m] || '';
}
function minuteKanji(m) {
  if (m === 0) return '';
  if (m === 30) return '半';
  return m + '分';
}

const MONTH_READ  = ['','いちがつ','にがつ','さんがつ','しがつ','ごがつ','ろくがつ','しちがつ','はちがつ','くがつ','じゅうがつ','じゅういちがつ','じゅうにがつ'];
const MONTH_KANJI = ['','1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const DAY_READ = {
  1:'ついたち',2:'ふつか',3:'みっか',4:'よっか',5:'いつか',
  6:'むいか',7:'なのか',8:'ようか',9:'ここのか',10:'とおか',
  11:'じゅういちにち',12:'じゅうににち',13:'じゅうさんにち',14:'じゅうよっか',
  15:'じゅうごにち',16:'じゅうろくにち',17:'じゅうしちにち',18:'じゅうはちにち',
  19:'じゅうくにち',20:'はつか',21:'にじゅういちにち',22:'にじゅうににち',
  23:'にじゅうさんにち',24:'にじゅうよっか',25:'にじゅうごにち',
  26:'にじゅうろくにち',27:'にじゅうしちにち',28:'にじゅうはちにち',
  29:'にじゅうくにち',30:'さんじゅうにち',31:'さんじゅういちにち'
};

// ── State ─────────────────────────────────────────────────
// ── Times drill state ────────────────────────────────────────────────────────
const TimesState = {
  mode:          'time',
  question:      null,
  correct:       0,
  wrong:         0,
  streak:        0,
  timerInterval: null,
  answered:      false,
  voice:         null,
  blitz:         false,   // blitz mode toggle
  blitzTimer:    null,    // blitz countdown interval
  blitzLeft:     60,      // seconds remaining
  blitzScore:    0,       // correct in current blitz round
  bestScore:     (App.Storage || window.Storage).getTdBestScore(),
};

// ── Open / close ──────────────────────────────────────────
function openTimesDrill() {
  document.getElementById('timesDrillOverlay').style.display = 'flex';
  loadTdVoice();
  TimesState.correct = 0; TimesState.wrong = 0; TimesState.streak = 0;
  updateTdScore();
  nextTimesQuestion();
}
function closeTimesDrill() {
  document.getElementById('timesDrillOverlay').style.display = 'none';
  clearTdTimer();
  stopBlitzTimer();
  window.speechSynthesis && speechSynthesis.cancel();
}

// ── Blitz mode ────────────────────────────────────────────
function toggleBlitzMode() {
  TimesState.blitz = !TimesState.blitz;
  const btn = document.getElementById('TimesState.blitzToggle');
  btn.style.borderColor    = TimesState.blitz ? 'var(--gold)' : 'var(--border)';
  btn.style.color          = TimesState.blitz ? 'var(--gold)'  : 'var(--ink-light)';
  btn.style.background     = TimesState.blitz ? 'rgba(200,169,81,0.10)' : 'none';

  document.getElementById('TimesState.modeRow').style.display    = TimesState.blitz ? 'none' : 'flex';
  document.getElementById('tdScoreRow').style.display   = TimesState.blitz ? 'none' : 'flex';
  document.getElementById('TimesState.blitzSection').style.display = TimesState.blitz ? 'block' : 'none';
  document.getElementById('tdControls').style.display   = TimesState.blitz ? 'none' : 'flex';
  document.getElementById('tdChoiceLabel').textContent  = TimesState.blitz ? 'Select the correct answer' : 'What did you hear?';

  if (TimesState.blitz) {
    startBlitz();
  } else {
    stopBlitzTimer();
    document.getElementById('TimesState.blitzResult').style.display = 'none';
    document.getElementById('tdControls').style.display = 'flex';
    TimesState.correct = 0; TimesState.wrong = 0; TimesState.streak = 0;
    updateTdScore();
    nextTimesQuestion();
  }
}

function startBlitz() {
  stopBlitzTimer();
  TimesState.blitzScore = 0;
  TimesState.blitzLeft  = 60;
  document.getElementById('TimesState.blitzResult').style.display = 'none';
  document.getElementById('TimesState.blitzCount').textContent = '0';
  document.getElementById('TimesState.blitzTime').textContent  = '60';
  document.getElementById('TimesState.blitzBar').style.width   = '100%';
  document.getElementById('TimesState.blitzBar').style.background = 'var(--teal)';
  nextTimesQuestion();

  TimesState.blitzTimer = setInterval(() => {
    TimesState.blitzLeft--;
    const pct = (TimesState.blitzLeft / 60) * 100;
    const bar = document.getElementById('TimesState.blitzBar');
    bar.style.width = pct + '%';
    if (TimesState.blitzLeft <= 10) bar.style.background = 'var(--red)';
    else if (TimesState.blitzLeft <= 20) bar.style.background = 'var(--gold)';
    document.getElementById('TimesState.blitzTime').textContent = TimesState.blitzLeft;
    if (TimesState.blitzLeft <= 0) blitzTimeUp();
  }, 1000);
}

function stopBlitzTimer() {
  if (TimesState.blitzTimer) { clearInterval(TimesState.blitzTimer); TimesState.blitzTimer = null; }
}

function blitzTimeUp() {
  stopBlitzTimer();
  speechSynthesis.cancel();
  // Disable all choices
  document.querySelectorAll('.td-choice').forEach(b => b.disabled = true);
  // Show result
  if (TimesState.blitzScore > TimesState.bestScore) {
    TimesState.bestScore = TimesState.blitzScore;
    (App.Storage || window.Storage).setTdBestScore( TimesState.bestScore);
  }
  const res = document.getElementById('TimesState.blitzResult');
  document.getElementById('TimesState.blitzFinal').textContent = TimesState.blitzScore;
  document.getElementById('TimesState.blitzSub').textContent =
    (TimesState.blitzScore > 0 && TimesState.blitzScore === TimesState.bestScore ? '🏆 New best! ' : '') +
    'Best: ' + TimesState.bestScore;
  res.style.display = 'block';
}

// ── Mode ──────────────────────────────────────────────────
function setTimesMode(mode, ev) {
  TimesState.mode = mode;
  document.querySelectorAll('.td-mode-btn').forEach(b => b.classList.remove('td-mode-active'));
  if (ev) ev.currentTarget.classList.add('td-mode-active');
  nextTimesQuestion();
}

// ── Question generation ───────────────────────────────────
function generateTimeQuestion(numWrong) {
  numWrong = numWrong || 3;
  const useExact = Math.random() < 0.3;
  const hour     = 1 + Math.floor(Math.random() * 12);
  const minute   = useExact
    ? Math.floor(Math.random() * 60)
    : [0,5,10,15,20,25,30,35,40,45,50,55][Math.floor(Math.random() * 12)];
  const ampm  = Math.random() < 0.5 ? 'ごぜん' : 'ごご';
  const ampmK = ampm === 'ごぜん' ? '午前' : '午後';
  const display = ampmK + '\u00a0' + HOUR_KANJI[hour] + (minute > 0 ? minuteKanji(minute) : '');
  const speech  = ampm + ' ' + HOUR_READ[hour] + (minute > 0 ? minuteReading(minute) : '');
  const label   = display;

  const wrongs = new Set();
  while (wrongs.size < numWrong) {
    const wh  = 1 + Math.floor(Math.random() * 12);
    const wm  = [0,5,10,15,20,25,30,35,40,45,50,55][Math.floor(Math.random() * 12)];
    const wap = Math.random() < 0.5 ? '午前' : '午後';
    const wl  = wap + '\u00a0' + HOUR_KANJI[wh] + (wm > 0 ? minuteKanji(wm) : '');
    if (wl !== label) wrongs.add(wl);
  }
  return { type: 'time', display, speech, label, wrongs: [...wrongs] };
}

function generateDateQuestion(numWrong) {
  numWrong = numWrong || 3;
  const month  = 1 + Math.floor(Math.random() * 12);
  const maxDay = [0,31,28,31,30,31,30,31,31,30,31,30,31][month];
  const day    = 1 + Math.floor(Math.random() * maxDay);
  const display = MONTH_KANJI[month] + day + '日';
  const speech  = MONTH_READ[month] + ' ' + DAY_READ[day];
  const label   = display;

  const wrongs = new Set();
  while (wrongs.size < numWrong) {
    const wm = 1 + Math.floor(Math.random() * 12);
    const wd = 1 + Math.floor(Math.random() * [0,31,28,31,30,31,30,31,31,30,31,30,31][wm]);
    const wl = MONTH_KANJI[wm] + wd + '日';
    if (wl !== label) wrongs.add(wl);
  }
  return { type: 'date', display, speech, label, wrongs: [...wrongs] };
}

function generateQuestion(numWrong) {
  if (TimesState.mode === 'time') return generateTimeQuestion(numWrong);
  if (TimesState.mode === 'date') return generateDateQuestion(numWrong);
  return Math.random() < 0.5 ? generateTimeQuestion(numWrong) : generateDateQuestion(numWrong);
}

// ── Render question ───────────────────────────────────────
function nextTimesQuestion() {
  if (DrillFlow._advancing) return;
  DrillFlow.reset();
  clearTdTimer();
  speechSynthesis.cancel();
  TimesState.answered = false;

  const numWrong = TimesState.blitz ? 7 : 3;
  TimesState.question = generateQuestion(numWrong);

  // In both modes: show ？ until answered
  const displayEl = document.getElementById('tdDisplay');
  displayEl.textContent = '？';
  displayEl.style.color = 'var(--ink-light)';
  displayEl.style.fontSize = '3rem';

  const subEl = document.getElementById('tdSubDisplay');
  subEl.textContent = TimesState.question.type === 'time' ? 'なんじですか？' : 'なんがつなんにちですか？';

  document.getElementById('tdReveal').style.display = 'none';
  document.getElementById('tdTimerBar').style.width = '100%';
  document.getElementById('tdTimerBar').style.background = 'var(--teal)';

  if (!TimesState.blitz) {
    document.getElementById('tdNextBtn').style.display = 'none';
    document.getElementById('tdPlayBtn').style.display = 'inline-block';
  }

  // Build shuffled choices — 2 columns for 4, 2 columns for 8
  const choices = shuffle([TimesState.question.label, ...TimesState.question.wrongs]);
  const cols = TimesState.blitz ? 2 : 2; // always 2 cols; rows scale
  const choicesEl = document.getElementById('tdChoices');
  choicesEl.style.gridTemplateColumns = '1fr 1fr';
  choicesEl.innerHTML = '';
  choices.forEach(ch => {
    const btn = document.createElement('button');
    btn.className = 'td-choice';
    btn.textContent = ch;
    btn.onclick = () => answerTd(ch, btn);
    choicesEl.appendChild(btn);
  });

  // Auto-play
  if (document.getElementById('tdAutoPlay').checked) {
    setTimeout(() => playTimesAudio(), TimesState.blitz ? 200 : 400);
  }
}

// ── Audio ─────────────────────────────────────────────────
function playTimesAudio() {
  if (!TimesState.question) return;
  const rate = parseFloat(document.getElementById('tdSpeedSetting').value) || 1;
  TTS.speak(TimesState.question.speech, rate, { onend: () => { if (!TimesState.blitz) startTdTimer(); } });
}

// ── Answer ────────────────────────────────────────────────
function answerTd(chosen, btn) {
  if (TimesState.blitz && TimesState.blitzLeft <= 0) return;
  if (!TimesState.blitz && TimesState.answered) return;

  const correct = chosen === TimesState.question.label;

  if (correct) {
    // ── CORRECT ──
    if (!TimesState.answered) {
      // only count once (in normal mode TimesState.answered prevents double-count;
      // in blitz mode we let re-attempts happen so we must track separately)
    }
    TimesState.answered = true;
    clearTdTimer();
    DrillFlow.correct(() => nextTimesQuestion());
    // Record to DrillSRS by question sub-type
    if (TimesState.question) {
      const _tdIds = TimesState.question.type === 'time'
        ? ['time_hour', ...(TimesState.question.speech.includes('ふん') || TimesState.question.speech.includes('pun') ? ['time_minute'] : [])]
        : ['date_month', 'date_day'];
      _tdIds.forEach(id => DrillSRS.record(STORAGE_KEYS.DRILL_SRS_TIMES, id, true));
    }

    // Mark all buttons
    document.querySelectorAll('.td-choice').forEach(b => {
      b.disabled = true;
      if (b.textContent === TimesState.question.label) b.classList.add('correct');
    });

    // Reveal the answer text
    const displayEl = document.getElementById('tdDisplay');
    displayEl.textContent = TimesState.question.display;
    displayEl.style.color = 'var(--teal)';
    displayEl.style.fontSize = '2.6rem';

    if (TimesState.blitz) {
      TimesState.blitzScore++;
      document.getElementById('TimesState.blitzCount').textContent = TimesState.blitzScore;
      // Auto-advance quickly
      setTimeout(() => nextTimesQuestion(), 600);
    } else {
      TimesState.correct++; TimesState.streak++;
      updateTdScore();
      // Show reading in reveal panel
      const rev = document.getElementById('tdReveal');
      rev.textContent = '✓ ' + TimesState.question.label + ' — ' + TimesState.question.speech;
      rev.style.borderColor = 'var(--teal)';
      rev.style.color = 'var(--teal)';
      rev.style.background = 'rgba(74,149,149,0.08)';
      rev.style.display = 'block';
      document.getElementById('tdNextBtn').style.display = 'inline-block';
      document.getElementById('tdPlayBtn').style.display = 'none';
    }

  } else {
    // ── WRONG ── turn red, do NOT disable, must keep trying
    btn.classList.add('wrong');
    btn.disabled = true; // disable this specific wrong button only

    if (!TimesState.blitz) {
      // Only count wrong once per question in normal mode
      if (!btn.dataset.counted) {
        btn.dataset.counted = '1';
        TimesState.wrong++; TimesState.streak = 0;
        updateTdScore();
        if (TimesState.question) {
          const _tdIds = TimesState.question.type === 'time' ? ['time_hour', 'time_minute'] : ['date_month', 'date_day'];
          _tdIds.forEach(id => DrillSRS.record(STORAGE_KEYS.DRILL_SRS_TIMES, id, false));
        }
        DrillFlow.wrong(() => nextTimesQuestion());
      }
    }

    // Replay audio as a hint
    setTimeout(() => playTimesAudio(), 300);
  }
}

// ── Normal-mode per-question timer ───────────────────────
function startTdTimer() {
  if (TimesState.blitz) return;
  clearTdTimer();
  const secs = parseInt(document.getElementById('tdTimerSetting').value) || 0;
  if (secs === 0 || TimesState.answered) return;

  const bar = document.getElementById('tdTimerBar');
  bar.style.transition = 'none';
  bar.style.width = '100%';
  bar.style.background = 'var(--teal)';

  let elapsed = 0;
  const total = secs * 1000;

  TimesState.timerInterval = setInterval(() => {
    elapsed += 100;
    const pct = Math.max(0, 100 - (elapsed / total * 100));
    bar.style.transition = 'width 0.1s linear';
    bar.style.width = pct + '%';
    if (pct < 30) bar.style.background = 'var(--red)';
    else if (pct < 60) bar.style.background = 'var(--gold,#c8a951)';
    if (elapsed >= total) {
      clearTdTimer();
      if (!TimesState.answered) timeOut();
    }
  }, 100);
}

function clearTdTimer() {
  if (TimesState.timerInterval) { clearInterval(TimesState.timerInterval); TimesState.timerInterval = null; }
}

function timeOut() {
  TimesState.answered = true;
  TimesState.wrong++; TimesState.streak = 0;
  updateTdScore();
  // Reveal correct answer
  const displayEl = document.getElementById('tdDisplay');
  displayEl.textContent = TimesState.question.display;
  displayEl.style.color = 'var(--red)';
  document.querySelectorAll('.td-choice').forEach(btn => {
    btn.disabled = true;
    if (btn.textContent === TimesState.question.label) btn.classList.add('correct');
  });
  const rev = document.getElementById('tdReveal');
  rev.textContent = '⏱ Time up — ' + TimesState.question.label + ' · ' + TimesState.question.speech;
  rev.style.borderColor = 'var(--red)';
  rev.style.color = 'var(--red)';
  rev.style.background = 'rgba(180,60,60,0.07)';
  rev.style.display = 'block';
  document.getElementById('tdNextBtn').style.display = 'inline-block';
  document.getElementById('tdPlayBtn').style.display = 'none';
  // Replay so they hear it
  setTimeout(() => playTimesAudio(), 300);
  DrillFlow.wrong(() => nextTimesQuestion());
}

// ── Score display ─────────────────────────────────────────
function updateTdScore() {
  const el = (id) => document.getElementById(id);
  el('TimesState.correct').textContent = TimesState.correct;
  el('TimesState.wrong').textContent   = TimesState.wrong;
  el('TimesState.streak').textContent  = TimesState.streak >= 3 ? '🔥 ' + TimesState.streak + ' in a row' : '';
}

// ── Settings ──────────────────────────────────────────────
function openTimesSettings() {
  const s = document.getElementById('tdSettings');
  const opening = s.style.display === 'none';
  s.style.display = opening ? 'block' : 'none';
  if (opening) {
    loadTdVoice();
    setTimeout(loadTdVoice, 200);
    setTimeout(loadTdVoice, 1000);
  }
}

// ── Voice loading ──────────────────────────────────────────
function loadTdVoice() {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return;
  const jaVoices  = voices.filter(v => v.lang === 'ja-JP' || v.lang.startsWith('ja'));
  const available = jaVoices.length ? jaVoices : voices;
  if (!TimesState.voice) {
    TimesState.voice = available.find(v => v.localService) || available[0] || null;
  }
  const sel = document.getElementById('TimesState.voiceSetting');
  if (!sel) return;
  const currentURI = TimesState.voice ? TimesState.voice.voiceURI : '';
  sel.innerHTML = available.map(v =>
    `<option value="${v.voiceURI}" ${v.voiceURI === currentURI ? 'selected' : ''}>${v.name} (${v.lang})${v.localService ? '' : ' ☁'}</option>`
  ).join('');
  const hint = document.getElementById('TimesState.voiceHint');
  if (hint) hint.textContent = available.length === 1
    ? 'Only 1 voice found — install more Japanese voices in macOS VoiceOver settings'
    : available.length + ' voices available';
}

function setTdVoice(uri) {
  const voices = speechSynthesis.getVoices();
  const found = voices.find(v => v.voiceURI === uri);
  if (found) { TimesState.voice = found; }
  if (TimesState.question) playTimesAudio();
}

if (window.speechSynthesis) {
  speechSynthesis.onvoiceschanged = loadTdVoice;
  loadTdVoice();
}

// ── Utility ───────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Close overlay on backdrop click
document.getElementById('timesDrillOverlay').addEventListener('click', function(e) {
  if (e.target === this) closeTimesDrill();
});

// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, {
    TimesState,
    openTimesDrill,
    closeTimesDrill,
    toggleBlitzMode,
    startBlitz,
    stopBlitzTimer,
    blitzTimeUp,
    setTimesMode,
    generateTimeQuestion,
    generateDateQuestion,
    generateQuestion,
    nextTimesQuestion,
    playTimesAudio,
    minuteReading,
    minuteKanji,
  });
  window['openTimesDrill']       = openTimesDrill;
  window['closeTimesDrill']      = closeTimesDrill;
  window['toggleBlitzMode']      = toggleBlitzMode;
  window['setTimesMode']         = setTimesMode;
  window['nextTimesQuestion']    = nextTimesQuestion;
  window['playTimesAudio']       = playTimesAudio;
} catch(e) { console.error('[features-times] App registry failed:', e); }
