// ═══════════════════════════════════════════════════════
// APP EVENTS — Central event bus
// Application layer emits events; UI layer listens.
// No DOM access. No business logic.
// ═══════════════════════════════════════════════════════

const AppEvents = (() => {
  const _listeners = {};

  function on(event, fn) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
    // Return unsubscribe function
    return () => {
      _listeners[event] = _listeners[event].filter(f => f !== fn);
    };
  }

  function off(event, fn) {
    if (!_listeners[event]) return;
    _listeners[event] = _listeners[event].filter(f => f !== fn);
  }

  function emit(event, data) {
    console.debug('[AppEvents]', event, data);
    (_listeners[event] || []).forEach(fn => {
      try { fn(data); }
      catch (e) { console.error('[AppEvents] Handler error for', event, e); }
    });
  }

  // ── Event name constants ──────────────────────────────
  return {
    on, off, emit,

    // Lesson recording pipeline
    RECORDING_STARTED:      'RECORDING_STARTED',
    RECORDING_STOPPED:      'RECORDING_STOPPED',
    RECORDING_TICK:         'RECORDING_TICK',       // { secs }
    TRANSCRIPTION_STARTED:  'TRANSCRIPTION_STARTED',
    TRANSCRIPTION_PROGRESS: 'TRANSCRIPTION_PROGRESS', // { track, done, total }
    TRANSCRIPTION_COMPLETE: 'TRANSCRIPTION_COMPLETE', // { session }
    ANALYSIS_COMPLETE:      'ANALYSIS_COMPLETE',    // { session }
    SESSION_SAVED:          'SESSION_SAVED',        // { session }
    SESSIONS_LOADED:        'SESSIONS_LOADED',      // { sessions[] }

    // Drill / learning events (StudentModel layer)
    DRILL_ANSWER:   'drill:answer',      // { panel, key, form, result }
    VOCAB_LOOKUP:   'vocab:lookup',      // { word, reading }
    VOCAB_PRODUCED: 'vocab:produced',    // { word, context }
    ERROR_RECORDED: 'error:recorded',    // { panel, pattern, errorType }
    WRITING_SUBMITTED: 'writing:submitted', // { checkCount, firstAttempt }
    LESSON_EXTRACTED: 'lesson:extracted',   // { lessonId, phraseCount }
    FLUENCY_432:    'fluency:432',       // { activity, durationSeconds }
    SESSION_TIME:   'session:time',      // { panel, seconds }

    ANALYSIS_COMPLETE:     'ANALYSIS_COMPLETE',    // { session, analysis }

    // Errors
    RECORDING_ERROR:        'RECORDING_ERROR',      // { message }
    TRANSCRIPTION_ERROR:    'TRANSCRIPTION_ERROR',  // { track, message }
    PIPELINE_ERROR:         'PIPELINE_ERROR',       // { stage, message }
  };
})();

// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, { AppEvents });
  window['AppEvents'] = AppEvents;
} catch(e) { console.error('[AppEvents] App registry failed:', e); }
