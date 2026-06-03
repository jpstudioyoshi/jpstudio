// DrillCard — shared drill loop for fixed-vocabulary drills
// Usage: DrillCard.run(config) — see config shape below
//
// config = {
//   containerId:    string         — element to render into
//   getQueue:       () => item[]   — returns shuffled queue
//   getPrompt:      (item) => str  — HTML string for prompt
//   getAnswer:      (item) => str  — correct answer string
//   onCorrect:      (item) => void — optional: SRS, speak, etc
//   onWrong:        (item, typed) => void — optional
//   onComplete:     (score) => void — optional: called at end
//   runsPerSession: number         — default 1
//   trackingLabel:  string         — for drillLastCompletedWrite
//   inputPlaceholder: string       — default 'Type reading…'
// }

const DrillCard = (() => {

  let _cfg = null;
  let _queue = [];
  let _idx = 0;
  let _run = 1;
  let _correct = 0;
  let _wrong = 0;
  let _checked = false;
  let _results = [];

  function _el(id) { return document.getElementById('dc-' + id); }

  function _render(html) {
    const c = document.getElementById(_cfg.containerId);
    if (c) c.innerHTML = html;
  }

  function _showQuestion() {
    if (_idx >= _queue.length) { _endRun(); return; }
    _checked = false;
    const item = _queue[_idx];

    const dots = _results.map((r, i) =>
      `<div style="width:8px;height:8px;border-radius:50%;background:${
        r === 'ok' ? 'var(--teal)' : r === 'miss' ? 'var(--red)' : i === _idx ? 'var(--ink)' : 'var(--border)'
      }"></div>`
    ).join('');

    _render(`
      <div style="padding:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;font-family:var(--ui);font-size:0.78rem;color:var(--ink-light)">
          <span>Run ${_run}/${_cfg.runsPerSession || 1}</span>
          <div style="display:flex;gap:4px;align-items:center">${dots}</div>
          <span>✓ ${_correct} &nbsp; ✗ ${_wrong}</span>
        </div>
        <div style="text-align:center;margin-bottom:16px;font-family:var(--jp);font-size:2.2rem;color:var(--teal)">
          ${_cfg.getPrompt(item)}
          ${_cfg.onSpeak ? '<button onclick="DrillCard._speak()" style=\"margin-left:8px;background:none;border:none;font-size:1.4rem;cursor:pointer;vertical-align:middle\">🔊</button>' : ''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:10px">
          <input id="dc-input" type="text"
            style="width:100%;max-width:280px;padding:10px 14px;font-family:var(--jp);font-size:1.1rem;background:var(--paper-dark);border:1px solid var(--border);border-radius:8px;color:var(--ink);outline:none;text-align:center"
            placeholder="${_cfg.inputPlaceholder || 'Type reading…'}"
            autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">
          <div style="display:flex;gap:8px">
            <button id="dc-check" class="btn-action">Check</button>
            <button id="dc-next"
              style="display:none;padding:7px 16px;background:var(--gold);border:none;border-radius:6px;color:#1c1c1e;font-family:var(--ui);font-size:0.8rem;font-weight:500;cursor:pointer"
              >Next →</button>
          </div>
          <div id="dc-feedback"
            style="font-family:var(--jp);font-size:1.1rem;min-height:1.5em;text-align:center">
          </div>
        </div>
      </div>
    `);

    // Wire buttons and Enter key
    const inp = document.getElementById('dc-input');
    const checkBtn = document.getElementById('dc-check');
    const nextBtn  = document.getElementById('dc-next');

    if (checkBtn) checkBtn.onclick = _check;
    if (nextBtn)  nextBtn.onclick  = _advance;
    if (inp) {
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); _checked ? _advance() : _check(); }
      });
      // Attach kana toolbar
      if (typeof kanaToolbar === 'function') {
        kanaToolbar('dc-input');
      }
      inp.focus();
    }
  }

  function _sessionSave() {
    if (!_cfg || !_cfg.sessionKey) return;
    const today = new Date().toISOString().slice(0, 10);
    const data = JSON.stringify({ date: today, idx: _idx, run: _run, correct: _correct, wrong: _wrong, results: _results });
    try { Storage.set(_cfg.sessionKey, data); } catch(e) {}
  }

  function _sessionLoad() {
    if (!_cfg || !_cfg.sessionKey || _cfg.allowResume === false) return false;
    try {
      const raw = Storage.get(_cfg.sessionKey, null);
      if (!raw) return false;
      const s = JSON.parse(raw);
      const today = new Date().toISOString().slice(0, 10);
      if (s.date !== today) return false;
      const freshQueue = _cfg.getQueue();
      if (s.idx >= freshQueue.length || s.run > (_cfg.runsPerSession || 1)) return false;
      _queue   = freshQueue;
      _idx     = s.idx;
      _run     = s.run;
      _correct = s.correct;
      _wrong   = s.wrong;
      _results = s.results || new Array(_queue.length).fill(null);
      return true;
    } catch(e) { return false; }
  }

  function _check() {
    if (_checked) { _advance(); return; }
    const inp  = document.getElementById('dc-input');
    const fb   = document.getElementById('dc-feedback');
    if (!inp || !fb) return;
    const typed  = inp.value.trim();
    if (!typed) return;

    const item   = _queue[_idx];
    const answer = _cfg.getAnswer(item);
    const correct = typed === answer;
    _checked = true;
    _results[_idx] = correct ? 'ok' : 'miss';
    if (typeof window !== 'undefined' && window.db) {
      const _ts = new Date().toISOString();
      const _dtype = _cfg.trackingLabel || 'drillcard';
      window.db.run(
        'INSERT INTO drill_results (created_at, drill_type, item_key, correct, response_ms) VALUES (?,?,?,?,?)',
        [_ts, _dtype, answer, correct ? 1 : 0, null]
      ).catch(() => {});
      window.db.run(
        'INSERT INTO learning_events (created_at, panel, event_type, payload) VALUES (?,?,?,?)',
        [_ts, 'words', 'drill:answer', JSON.stringify({ drill_type: _dtype, answer, typed, correct })]
      ).catch(() => {});
    try { (App.StudentModel || window.StudentModel)?.invalidate(); } catch(e) {}
    try { (App.AppEvents || window.AppEvents)?.emit(AppEvents.DRILL_ANSWER, { panel: 'words', drill_type: _dtype, answer, typed, correct }); } catch(e) {}
    }

    if (correct) {
      _correct++;
      fb.textContent = '✓ ' + answer;
      fb.classList.add('result-correct'); fb.classList.remove('result-wrong');
      inp.classList.add('input-correct'); inp.classList.remove('input-error');
      if (_cfg.onCorrect) _cfg.onCorrect(item);
      if (_cfg.onSpeak) _cfg.onSpeak(item);
      // auto-advance after 800ms
      setTimeout(_advance, 800);
    } else {
      _wrong++;
      fb.innerHTML = '✗ &nbsp;<span style="color:var(--teal)">' + answer + '</span>';
      fb.classList.add('result-wrong'); fb.classList.remove('result-correct');
      inp.classList.add('input-error'); inp.classList.remove('input-correct');
      if (_cfg.onWrong) _cfg.onWrong(item, typed);
      // show Next button
      const nextBtn = document.getElementById('dc-next');
      const checkBtn = document.getElementById('dc-check');
      if (nextBtn)  nextBtn.style.display  = '';
      if (checkBtn) checkBtn.style.display = 'none';
    }
  }

  function _advance() {
    _idx++;
    _sessionSave();
    _showQuestion();
  }

  function _endRun() {
    const runs = _cfg.runsPerSession || 1;
    const total = _queue.length;
    const pct = total ? Math.round(_correct / (_correct + _wrong) * 100) : 0;

    if (_run < runs) {
      // reshuffle and go again
      _run++;
      _idx = 0;
      _results = new Array(_queue.length).fill(null);
      _queue.sort(() => Math.random() - 0.5);
      _showQuestion();
      return;
    }

    // Session complete
    if (_cfg.trackingLabel && typeof drillLastCompletedWrite === 'function') {
      drillLastCompletedWrite(_cfg.trackingLabel);
    }
    if (_cfg.onComplete) _cfg.onComplete({ correct: _correct, wrong: _wrong, total: _correct + _wrong });

    _render(`
      <div style="padding:24px;text-align:center;font-family:var(--ui)">
        <div style="font-size:2rem;margin-bottom:8px">🎌</div>
        <div style="font-size:1rem;font-weight:500;color:var(--ink);margin-bottom:6px">Complete!</div>
        <div style="font-size:0.85rem;color:var(--ink-light)">${_correct}/${_correct+_wrong} correct (${pct}%)</div>
        <button onclick="DrillCard.restart()"
          style="margin-top:16px;padding:8px 20px;background:var(--teal);border:none;border-radius:8px;color:#fff;font-family:var(--ui);font-size:0.85rem;cursor:pointer">
          Go again
        </button>
      </div>
    `);
  }

  function _speak() {
    if (_cfg && _cfg.onSpeak && _queue[_idx]) _cfg.onSpeak(_queue[_idx]);
  }
  function run(cfg) {
    _cfg     = cfg;
    _checked = false;
    if (_sessionLoad()) { _showQuestion(); return; }
    _queue   = cfg.getQueue();
    _idx     = 0;
    _run     = 1;
    _correct = 0;
    _wrong   = 0;
    _results = new Array(_queue.length).fill(null);
    _showQuestion();
  }

  function restart() {
    if (!_cfg) return;
    run(_cfg);
  }

  return { run, restart, _speak };
})();
try { Object.assign(App, { DrillCard }); } catch(e) {}
window["DrillCard"] = DrillCard;
