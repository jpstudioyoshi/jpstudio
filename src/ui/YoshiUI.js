// ═══════════════════════════════════════════════════════
// YOSHI UI — Lesson recording panel UI layer
// DOM reads and writes ONLY. No business logic.
// All user actions route through Orchestrator.
// All state changes arrive via AppEvents.
// ═══════════════════════════════════════════════════════

const YoshiUI = (() => {

  // ── Private state ──────────────────────────────────────
  let _hasLoopback      = false;
  let _lastAudioPath    = null;
  let _lastSessionId    = null;
  let _levelInterval    = null;

  // ── DOM references ─────────────────────────────────────
  function _el(id) { return document.getElementById(id); }

  // ── AppEvent listeners ─────────────────────────────────

  AppEvents.on(AppEvents.RECORDING_STARTED, ({ sessionId, hasLoopback }) => {
    _hasLoopback   = !!hasLoopback;
    _lastSessionId = sessionId;
    _setStatus(
      '🔴 0:00' + (_hasLoopback ? '' : ' ⚠ no loopback'),
      'var(--red)'
    );
    _startLevelDots();
  });

  AppEvents.on(AppEvents.RECORDING_TICK, ({ secs }) => {
    const m = Math.floor(secs / 60), s = secs % 60;
    _setStatus(
      '🔴 ' + m + ':' + String(s).padStart(2, '0') + (_hasLoopback ? '' : ' ⚠ no loopback'),
      'var(--red)'
    );
  });

  AppEvents.on(AppEvents.RECORDING_STOPPED, ({ sessionId, audioPath, durationSecs }) => {
    _stopLevelDots();
    _lastAudioPath = audioPath || null;
    _lastSessionId = sessionId || _lastSessionId;
    const fileName = audioPath ? audioPath.split('/').pop() : '';
    const dur = durationSecs
      ? Math.floor(durationSecs / 60) + 'm ' + (durationSecs % 60) + 's'
      : '';
    _setStatus(
      '✓ Recorded ' + (dur ? dur + ' ' : '') + (fileName ? '— ' + fileName : ''),
      'var(--teal)'
    );
    _showTranscribeButton(_lastSessionId);
  });

  AppEvents.on(AppEvents.TRANSCRIPTION_STARTED, ({ audioPath }) => {
    _hideTranscribeButton();
    const fileName = (audioPath || _lastAudioPath || '').split('/').pop();
    _setStatus('Transcribing… ' + (fileName ? '(' + fileName + ')' : ''), 'var(--gold)');
  });

  AppEvents.on(AppEvents.TRANSCRIPTION_PROGRESS, ({ track, done, total }) => {
    _setStatus(
      'Transcribing ' + (track === 'teacher' ? '🧑‍🏫' : '🙋') + ' ' + done + '/' + total + '…',
      'var(--gold)'
    );
  });

  AppEvents.on(AppEvents.TRANSCRIPTION_COMPLETE, ({ session }) => {
    _hideTranscribeButton();
    const path = (session && session.audioPath) ? session.audioPath : (_lastAudioPath || '');
    const fileName = path ? path.split('/').pop() : '';
    _setStatus(
      '✓ Transcribed' + (fileName ? ' — ' + fileName : '') + ' — paste WhatsApp notes if needed',
      'var(--teal)'
    );
    const _lnRender = App.lessonNotesRenderPanel || window.lessonNotesRenderPanel;
    if (_lnRender) _lnRender();
  });

  AppEvents.on(AppEvents.SESSIONS_LOADED, () => {
    // Never touch the panel while recording
    const _Orchestrator = App.Orchestrator || window.Orchestrator;
    if (_Orchestrator && _Orchestrator.isRecording()) return;
    const _lnRender = App.lessonNotesRenderPanel || window.lessonNotesRenderPanel;
    if (_lnRender) _lnRender();
    wireButtons();
  });

  AppEvents.on(AppEvents.RECORDING_ERROR, ({ message }) => {
    _stopLevelDots();
    _setStatus('Error: ' + message, 'var(--red)');
  });

  AppEvents.on(AppEvents.TRANSCRIPTION_ERROR, ({ track, message }) => {
    console.warn('[YoshiUI] Transcription error on', track, ':', message);
  });

  AppEvents.on(AppEvents.PIPELINE_ERROR, ({ stage, message }) => {
    _setStatus('Error (' + stage + '): ' + message, 'var(--red)');
    if (stage === 'transcription' && _lastSessionId) _showTranscribeButton(_lastSessionId);
  });

  // ── Button wiring ──────────────────────────────────────

  function wireButtons() {
    // No-op: record/stop buttons removed from main panel.
    // Kept for backward compat — overlay wires its own buttons.
  }

  // ── Transcribe button ──────────────────────────────────

  function _showTranscribeButton(sessionId) {
    const bar = _el('yoshiTranscribeBar');
    if (!bar) return;
    bar.style.display = 'flex';
    bar.innerHTML =
      '<button id="yoshiTranscribeBtn" style="padding:5px 14px;font-family:var(--ui);font-size:0.78rem;background:var(--teal);color:#000;border:none;border-radius:5px;cursor:pointer;font-weight:600">▶ Transcribe</button>'
      + '<span style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light);margin-left:8px">Click to start transcription when ready</span>';
    const btn = _el('yoshiTranscribeBtn');
    if (btn) {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Starting…';
        const _Orchestrator = App.Orchestrator || window.Orchestrator;
        try { await _Orchestrator.transcribeSession(sessionId); }
        catch (e) {
          _setStatus('Transcription failed: ' + e.message, 'var(--red)');
          btn.disabled = false;
          btn.textContent = '▶ Transcribe';
        }
      });
    }
  }

  function _hideTranscribeButton() {
    const bar = _el('yoshiTranscribeBar');
    if (bar) { bar.style.display = 'none'; bar.innerHTML = ''; }
  }

  // ── DOM helpers ────────────────────────────────────────

  function _setStatus(msg, color) {
    const el = _el('yoshiRecordStatus');
    if (!el) return;
    el.textContent = msg;
    if (color) el.style.color = color;
  }

  // ── Level indicator ────────────────────────────────────

  function _startLevelDots() {
    _stopLevelDots();
    const frames = ['▁','▂','▃','▄','▅','▆','▇','█','▇','▆','▅','▄','▃','▂'];
    let tick = 0;
    _levelInterval = setInterval(() => {
      const el = _el('yoshiLevelDots');
      if (el) el.textContent = frames[tick % frames.length];
      tick++;
    }, 100);
  }

  function _stopLevelDots() {
    if (_levelInterval) { clearInterval(_levelInterval); _levelInterval = null; }
    const el = _el('yoshiLevelDots');
    if (el) el.textContent = '';
  }

  // ── Transcript search ──────────────────────────────────

  function filterTranscript(query) {
    const q = query.toLowerCase();
    document.querySelectorAll('.lesson-transcript-row').forEach(row => {
      row.style.display = (!q || row.dataset.text.includes(q)) ? '' : 'none';
    });
  }

  function seekTo(seconds, audioId) {
    const audio = _el(audioId);
    if (!audio) return;
    audio.currentTime = seconds;
    audio.play().catch(() => {});
  }

  return { wireButtons, filterTranscript, seekTo, _stopLevelDots };
})();

// ── Backward-compat exports ────────────────────────────────────────────────────

function yoshiFilterTranscript(q) { YoshiUI.filterTranscript(q); }
function yoshiSeekTo(s, id)        { YoshiUI.seekTo(s, id); }


function yoshiInitUI() {
  YoshiUI.wireButtons();
  (App.Orchestrator || window.Orchestrator)?.loadSessions();
}

// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, {
    YoshiUI,
    yoshiFilterTranscript,
    yoshiSeekTo,
    yoshiInitUI,
  });
} catch(e) { console.error('[YoshiUI] App registry failed:', e); }
