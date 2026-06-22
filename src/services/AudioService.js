// ═══════════════════════════════════════════════════════
// AUDIO SERVICE
// Dual-channel recording: mic (user) + loopback (teacher).
// No UI access. No API calls. Emits AppEvents.
//
// Preserves existing yoshiStartRecording / yoshiStopRecording
// behaviour exactly — logic extracted, DOM calls removed.
// ═══════════════════════════════════════════════════════

const AudioService = (() => {

  // ── Private state ──────────────────────────────────────
  let _micRecorder      = null;
  let _loopbackRecorder = null;
  let _micChunks        = [];
  let _loopbackChunks   = [];
  let _audioPath        = null;   // set by Electron lessonAPI.startRecording()
  let _teacherPath      = null;
  let _sessionId        = null;
  let _timerInterval    = null;
  let _secs             = 0;
  let _isRecording      = false;
  let _startTime        = null;

  // ── Device discovery ───────────────────────────────────

  // Find built-in or first non-virtual mic — avoids grabbing BlackHole as default
  async function findMicDevice() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs  = devices.filter(d => d.kind === 'audioinput');
      return inputs.find(d => !/blackhole|loopback|virtual|zoom|iphone|bluetooth|built.?in|macbook|internal/i.test(d.label)) ||
             inputs.find(d => /built.?in|macbook|internal/i.test(d.label)) ||
             inputs.find(d => !/blackhole|loopback|virtual|zoom|iphone|bluetooth/i.test(d.label)) ||
             null;
    } catch(e) {
      console.warn('[AudioService] Could not enumerate mic devices:', e.message);
      return null;
    }
  }

  // Find BlackHole or similar loopback virtual device
  async function findLoopbackDevice() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const loopback = devices.find(
        d => d.kind === 'audioinput' && /blackhole|loopback|virtual/i.test(d.label)
      );
      return loopback ? loopback.deviceId : null;
    } catch (e) {
      console.warn('[AudioService] Could not enumerate devices:', e.message);
      return null;
    }
  }

  // ── Recording lifecycle ────────────────────────────────

  async function start() {
    if (_isRecording) {
      console.warn('[AudioService] Already recording');
      return;
    }
    if (!window.lessonAPI) {
      throw new Error('Lesson recording requires the Electron app.');
    }

    // Init DB session
    const result = await window.lessonAPI.startRecording();
    if (result.error) throw new Error('Could not start session: ' + result.error);

    _sessionId    = result.sessionId;
    _audioPath    = result.audioPath;
    _teacherPath  = result.audioPath.replace('.webm', '_teacher.webm');
    _startTime    = new Date();
    _micChunks    = [];
    _loopbackChunks = [];

    try {
      // Mic stream — prefer built-in mic, avoid BlackHole as system default
      const micDev = await findMicDevice();
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: micDev ? { exact: micDev.deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false
        }
      });
      console.log('[AudioService] Mic device:', micDev?.label || 'default');

      // Loopback stream (BlackHole)
      const _recordTeacher = (App.Storage || window.Storage)?.get('recordTeacherTrack');
      if (_recordTeacher === false || _recordTeacher === 'false') { _teacherPath = null; }
      const loopbackDeviceId = _teacherPath ? await findLoopbackDevice() : null;
      let loopbackStream = null;
      if (loopbackDeviceId) {
        try {
          loopbackStream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: loopbackDeviceId }, echoCancellation: false }
          });
        } catch (e) {
          console.warn('[AudioService] Could not open loopback device:', e.message);
        }
      }

      // Mic recorder — flush chunks to disk every ~30s (6 × 5s intervals)
      _micRecorder = new MediaRecorder(micStream, { mimeType: 'audio/webm;codecs=opus' });
      _micRecorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          _micChunks.push(e.data);
          if (_micChunks.length >= 6) {
            const blob = new Blob(_micChunks.splice(0), { type: 'audio/webm' });
            await window.lessonAPI.saveAudioChunk(_audioPath, await blob.arrayBuffer());
          }
        }
      };
      _micRecorder.start(5000);

      // Loopback recorder
      if (loopbackStream) {
        _loopbackRecorder = new MediaRecorder(loopbackStream, { mimeType: 'audio/webm;codecs=opus' });
        _loopbackRecorder.ondataavailable = async (e) => {
          if (e.data.size > 0) {
            _loopbackChunks.push(e.data);
            if (_loopbackChunks.length >= 6) {
              const blob = new Blob(_loopbackChunks.splice(0), { type: 'audio/webm' });
              await window.lessonAPI.saveAudioChunk(_teacherPath, await blob.arrayBuffer());
            }
          }
        };
        _loopbackRecorder.start(5000);
      } else {
        _teacherPath = null;  // no loopback available
      }

    } catch (e) {
      // Clean up partial state
      _sessionId = null;
      _audioPath = null;
      throw e;
    }

    // Tick timer — UI subscribes to RECORDING_TICK
    _secs = 0;
    _isRecording = true;
    _timerInterval = setInterval(() => {
      _secs++;
      AppEvents.emit(AppEvents.RECORDING_TICK, { secs: _secs });
    }, 1000);

    AppEvents.emit(AppEvents.RECORDING_STARTED, {
      sessionId: _sessionId,
      startTime: _startTime,
      hasLoopback: !!_teacherPath,
    });
  }

  async function stop() {
    if (!_isRecording || !_micRecorder) {
      console.warn('[AudioService] Not recording');
      return null;
    }

    clearInterval(_timerInterval);
    _isRecording = false;

    // Stop both recorders, wait for final ondataavailable
    const stopRecorder = (rec) => new Promise(resolve => {
      if (!rec) { resolve(); return; }
      rec.onstop = resolve;
      rec.stop();
      rec.stream.getTracks().forEach(t => t.stop());
    });

    await Promise.all([
      stopRecorder(_micRecorder),
      stopRecorder(_loopbackRecorder)
    ]);

    // Small buffer to ensure final chunks arrive
    await new Promise(r => setTimeout(r, 300));

    // Flush remaining in-memory chunks to disk
    if (_micChunks.length) {
      const blob = new Blob(_micChunks, { type: 'audio/webm' });
      await window.lessonAPI.saveAudioChunk(_audioPath, await blob.arrayBuffer());
      _micChunks = [];
    }
    if (_loopbackChunks.length && _teacherPath) {
      const blob = new Blob(_loopbackChunks, { type: 'audio/webm' });
      await window.lessonAPI.saveAudioChunk(_teacherPath, await blob.arrayBuffer());
      _loopbackChunks = [];
    }

    await window.lessonAPI.finaliseRecording(_sessionId, _audioPath);

    const result = {
      sessionId:   _sessionId,
      audioPath:   _audioPath,
      teacherPath: _teacherPath,
      startTime:   _startTime,
      endTime:     new Date(),
      durationSecs: _secs,
    };

    // Reset state
    _micRecorder      = null;
    _loopbackRecorder = null;
    _sessionId        = null;
    _audioPath        = null;
    _teacherPath      = null;

    AppEvents.emit(AppEvents.RECORDING_STOPPED, result);
    return result;
  }

  // ── Accessors ──────────────────────────────────────────

  function isRecording() { return _isRecording; }
  function getSessionId() { return _sessionId; }

  return {
    start,
    stop,
    isRecording,
    getSessionId,
    findLoopbackDevice,
  };
})();

// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, { AudioService });
  window['AudioService'] = AudioService;
} catch(e) { console.error('[AudioService] App registry failed:', e); }
