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
    RECORDING_READY:        'RECORDING_READY',      // { sessionId, audioPath }
    TRANSCRIPTION_STARTED:  'TRANSCRIPTION_STARTED',
    TRANSCRIPTION_PROGRESS: 'TRANSCRIPTION_PROGRESS', // { track, done, total }
    TRANSCRIPTION_COMPLETE: 'TRANSCRIPTION_COMPLETE', // { session }
    ANALYSIS_COMPLETE:      'ANALYSIS_COMPLETE',    // { session, analysis }
    SESSION_SAVED:          'SESSION_SAVED',        // { session }
    SESSIONS_LOADED:        'SESSIONS_LOADED',      // { sessions[] }

    // Drill / learning events (StudentModel layer)
    // NOTE: comments below are the *intended* payload. Some live emitters diverge — see inline notes.
    DRILL_ANSWER:   'drill:answer',      // intended { panel, key, form, result }; emitters vary — core-vocab.js:286 omits `form`; features-times.js uses `label`; ui/DrillCard.js:146 emits { panel, drill_type, answer, typed, correct } (no key/result). Only consumer (StudentModel) invalidates without reading fields.
    VOCAB_LOOKUP:   'vocab:lookup',      // { word, reading } — emitter also sends { context, meaning }
    VOCAB_PRODUCED: 'vocab:produced',    // { word, context } — NO emitter yet (pending); 'vocab:produced' is written direct to learning_events in core-srs.js
    ERROR_RECORDED: 'error:recorded',    // { panel, pattern, errorType }
    WRITING_SUBMITTED: 'writing:submitted', // STALE comment was { checkCount, firstAttempt }; actual emit (core-writing.js:306) is { first_attempt, final_text, check_count, full_text }
    LESSON_EXTRACTED: 'lesson:extracted',   // { lessonId, phraseCount }
    FLUENCY_432:    'fluency:432',       // { activity, durationSeconds } — NO emitter yet (pending); 'fluency:432' is written direct to learning_events in features-voice.js
    SESSION_TIME:   'session:time',      // STALE comment was { panel, seconds }; actual emit (features-grammar.js:778) is { panel, strand, duration_s }

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
