// ═══════════════════════════════════════════════════════
// ORCHESTRATOR
// Application layer. Coordinates all lesson pipeline stages.
// No direct DOM manipulation. No inline event handlers.
// Emits AppEvents at each stage boundary.
// UI listens to AppEvents and renders accordingly.
//
// Recording and transcription are now SEPARATE steps.
// stopLesson() ends the recording and saves the raw session.
// transcribeSession(sessionId) runs the processing pipeline
// on demand — called manually via the UI Transcribe button.
// ═══════════════════════════════════════════════════════

const Orchestrator = (() => {

  let _currentSession = null;

  // ── Recording phase ────────────────────────────────────

  async function startLesson() {
    if (AudioService.isRecording()) {
      console.warn('[Orchestrator] Already recording');
      return;
    }

    _currentSession = new LessonSession();

    try {
      await AudioService.start();
      _currentSession.id        = AudioService.getSessionId();
      _currentSession.startTime = new Date();
      _currentSession.status    = 'recording';
    } catch (e) {
      _currentSession.status = 'error';
      _currentSession.error  = e.message;
      AppEvents.emit(AppEvents.RECORDING_ERROR, { message: e.message });
      throw e;
    }
  }

  async function stopLesson() {
    if (!AudioService.isRecording()) {
      console.warn('[Orchestrator] Not recording');
      return;
    }

    _currentSession.status = 'stopping';

    let recordingResult;
    try {
      recordingResult = await AudioService.stop();
      // AudioService emits RECORDING_STOPPED
    } catch (e) {
      _currentSession.status = 'error';
      _currentSession.error  = e.message;
      AppEvents.emit(AppEvents.PIPELINE_ERROR, { stage: 'recording', message: e.message });
      return;
    }

    _currentSession.id      = recordingResult.sessionId;
    _currentSession.endTime = recordingResult.endTime;
    _currentSession.status  = 'recorded';

    // File size diagnostic (non-blocking)
    const _PreflightService = App.PreflightService || window.PreflightService;
    if (_PreflightService) {
      _PreflightService.checkFileSizes(
        recordingResult.sessionId,
        recordingResult.audioPath,
        recordingResult.teacherPath
      ).catch(e => console.warn('[Orchestrator] File size check failed silently:', e.message));
    }

    // Reload so the UI shows the new raw session entry immediately
    await _refreshSessions();

    // Signal that recording is ready to transcribe — UI can show transcribe button
    AppEvents.emit('RECORDING_READY', {
      sessionId: _currentSession.id,
      audioPath: recordingResult.audioPath,
    });
  }

  let _transcribing = false;

  // ── Transcription pipeline (on demand) ────────────────
  // Runs against an already-recorded session by sessionId.
  // Can be called on the current session or any saved session
  // (e.g. retranscribe after a failed run).

  async function transcribeSession(sessionId) {
    if (_transcribing) {
      console.warn('[Orchestrator] Transcription already in progress — ignoring duplicate call');
      return;
    }
    // Resolve audio paths — from current session or from DB
    let audioPath, teacherPath;

    if (_currentSession && _currentSession.id === sessionId) {
      audioPath   = _currentSession.audioPath;
      teacherPath = _currentSession.teacherPath;
    }

    // Fall back to StorageService if paths aren't in memory
    if (!audioPath) {
      try {
        const saved = await StorageService.getSession(sessionId);
        if (!saved) throw new Error('Session ' + sessionId + ' not found');
        audioPath   = saved.audio_path;
        teacherPath = saved.audio_path ? saved.audio_path.replace('.webm', '_teacher.webm') : null;
      } catch (e) {
        AppEvents.emit(AppEvents.PIPELINE_ERROR, { stage: 'transcription', message: e.message });
        return;
      }
    }

    const recordingResult = { sessionId, audioPath, teacherPath };
    _transcribing = true;
    try {
      await _runProcessingPipeline(recordingResult);
    } finally {
      _transcribing = false;
    }
  }

  // ── Processing pipeline ────────────────────────────────

  async function _runProcessingPipeline(recordingResult) {
    const { sessionId, audioPath, teacherPath } = recordingResult;

    // Re-use or create a session object
    if (!_currentSession || _currentSession.id !== sessionId) {
      _currentSession = new LessonSession();
      _currentSession.id     = sessionId;
      _currentSession.status = 'transcribing';
    } else {
      _currentSession.status = 'transcribing';
    }

    AppEvents.emit(AppEvents.TRANSCRIPTION_STARTED, {
      session:    _currentSession,
      audioPath,
      teacherPath,
    });

    const [userResult, teacherResult] = await Promise.allSettled([
      _transcribeTrack(audioPath, 'user'),
      _transcribeTrack(teacherPath, 'teacher'),
    ]);

    if (userResult.status === 'fulfilled' && userResult.value.length) {
      _currentSession.transcripts.user = userResult.value;
    } else if (userResult.status === 'rejected') {
      console.error('[Orchestrator] User track transcription failed:', userResult.reason);
      AppEvents.emit(AppEvents.TRANSCRIPTION_ERROR, { track: 'user', message: userResult.reason?.message });
    }

    if (teacherResult.status === 'fulfilled' && teacherResult.value.length) {
      _currentSession.transcripts.teacher = teacherResult.value;
    } else if (teacherResult.status === 'rejected') {
      console.error('[Orchestrator] Teacher track transcription failed:', teacherResult.reason);
      AppEvents.emit(AppEvents.TRANSCRIPTION_ERROR, { track: 'teacher', message: teacherResult.reason?.message });
    }

    _currentSession.merge();
    _currentSession.status = 'done';

    AppEvents.emit(AppEvents.TRANSCRIPTION_COMPLETE, { session: _currentSession });

    try {
      await StorageService.saveSession(_currentSession);
      AppEvents.emit(AppEvents.SESSION_SAVED, { session: _currentSession });
    } catch (e) {
      console.error('[Orchestrator] Save failed:', e);
      AppEvents.emit(AppEvents.PIPELINE_ERROR, { stage: 'storage', message: e.message });
    }

    await _refreshSessions();
  }

  async function _transcribeTrack(audioPath, speaker) {
    if (!audioPath) return [];
    return TranscriptionService.transcribeFile(audioPath, {
      speaker,
      onProgress: ({ done, total }) => {
        AppEvents.emit(AppEvents.TRANSCRIPTION_PROGRESS, { track: speaker, done, total });
      },
    });
  }

  // ── WhatsApp attachment ────────────────────────────────

  async function attachWhatsApp(sessionId, rawText) {
    const msgs = yoshiParseWhatsapp(rawText);
    if (!msgs.length) return { synced: false, count: 0 };

    let transcript = [];
    try {
      const session = await StorageService.getSession(sessionId);
      if (session?.transcript_json) transcript = JSON.parse(session.transcript_json);
    } catch (e) {}

    const synced = transcript.length
      ? await AnalysisService.alignWhatsApp(msgs, transcript)
      : msgs;

    if (_currentSession?.id === sessionId) {
      _currentSession.messages = synced;
    }

    const payload = JSON.stringify({ raw: rawText, messages: synced });
    await StorageService.saveWhatsApp(sessionId, payload);

    await _refreshSessions();
    return { synced: true, count: synced.length };
  }

  // ── Session management ─────────────────────────────────

  async function loadSessions() {
    const sessions = await StorageService.loadSessions();
    window._lessonRecordingSessions = sessions;
    AppEvents.emit(AppEvents.SESSIONS_LOADED, { sessions });
    return sessions;
  }

  async function deleteSession(sessionId, audioPath, teacherPath) {
    const audioPaths = [audioPath, teacherPath].filter(Boolean);
    await StorageService.deleteSession(sessionId, audioPaths);
    await _refreshSessions();
  }

  async function _refreshSessions() {
    const sessions = await StorageService.loadSessions();
    window._lessonRecordingSessions = sessions;
    AppEvents.emit(AppEvents.SESSIONS_LOADED, { sessions });
  }

  // ── Accessors ──────────────────────────────────────────

  function getCurrentSession()  { return _currentSession; }
  function isRecording()        { return AudioService.isRecording(); }

  async function transcribeCurrentSession() {
    if (!_currentSession?.id) {
      console.warn('[Orchestrator] No current session to transcribe');
      return;
    }
    return transcribeSession(_currentSession.id);
  }

  return {
    startLesson,
    stopLesson,
    transcribeSession,
    transcribeCurrentSession,
    attachWhatsApp,
    loadSessions,
    deleteSession,
    getCurrentSession,
    isRecording,
  };
})();

// ── Backward-compatibility shims ──────────────────────────────────────────────

async function yoshiStartRecording() {
  try {
    await Orchestrator.startLesson();
  } catch (e) {
    alert('Recording error: ' + e.message);
  }
}

async function yoshiStopRecording() {
  await Orchestrator.stopLesson();
}

async function yoshiLoadLessonSessions() {
  return Orchestrator.loadSessions();
}

async function yoshiDeleteLessonSession(sessionId, audioPath, teacherPath) {
  const msg = (audioPath || teacherPath)
    ? 'Delete this recording session? This will also delete the audio files.'
    : 'Delete this recording session?';
  if (!confirm(msg)) return;
  await Orchestrator.deleteSession(sessionId, audioPath, teacherPath);
  (App.lessonNotesRenderPanel || window.lessonNotesRenderPanel)?.();
}

async function yoshiTranscribeCurrent() {
  const btn = document.getElementById('overlayTranscribeBtn');
  if (btn) { btn.textContent = '⏳ Transcribing…'; btn.disabled = true; }
  try {
    await Orchestrator.transcribeCurrentSession();
    if (btn) { btn.textContent = '✓ Done'; }
  } catch(e) {
    if (btn) { btn.textContent = '✗ Failed'; btn.disabled = false; }
    console.error('[yoshiTranscribeCurrent]', e);
  }
}

async function yoshiSaveWhatsapp(sessionId) {
  const el  = document.getElementById('lessonWhatsappPaste');
  const text = el?.value || '';
  if (!text.trim()) return;

  const btn = document.querySelector(`button[onclick*="yoshiSaveWhatsapp(${sessionId})"]`);
  if (btn) { btn.textContent = 'Syncing…'; btn.disabled = true; }

  try {
    const _yoshiParseWhatsapp = App.yoshiParseWhatsapp || window.yoshiParseWhatsapp;
    if (!_yoshiParseWhatsapp) throw new Error('yoshiParseWhatsapp not available');
    await Orchestrator.attachWhatsApp(sessionId, text);
    if (btn) {
      btn.textContent = 'Saved ✓';
      setTimeout(() => { btn.textContent = 'Save & sync →'; btn.disabled = false; }, 1500);
    }
  } catch (e) {
    console.error('WhatsApp save failed:', e);
    if (btn) { btn.textContent = 'Error'; setTimeout(() => { btn.textContent = 'Save & sync →'; btn.disabled = false; }, 2000); }
  }

  (App.lessonNotesRenderPanel || window.lessonNotesRenderPanel)?.();
}


// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, {
    Orchestrator,
    // Backward-compat shims also registered so callers can use App.yoshiXxx
    yoshiStartRecording,
    yoshiStopRecording,
    yoshiLoadLessonSessions,
    yoshiDeleteLessonSession,
    yoshiSaveWhatsapp,
    yoshiTranscribeCurrent,
  });
} catch(e) { console.error('[Orchestrator] App registry failed:', e); }
