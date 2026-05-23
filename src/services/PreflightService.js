// ═══════════════════════════════════════════════════════
// PREFLIGHT SERVICE
// Pre-session audio diagnostics. Runs before recording starts.
// Checks devices, measures live audio levels, persists results.
//
// No UI access. No DOM calls. No global state mutation.
// Writes to failure_events table for post-session forensics.
//
// Load order: after AudioService.js, before Orchestrator.js
// ═══════════════════════════════════════════════════════

const PreflightService = (() => {

  // How long to sample audio levels during the level check
  const LEVEL_SAMPLE_MS  = 4000;
  // A channel is considered "silent" if its peak is below this threshold (0–255 scale)
  const SILENCE_THRESHOLD = 8;

  // ── Public API ─────────────────────────────────────────

  /**
   * run() — perform all pre-flight checks and return a PreflightReport.
   *
   * Steps:
   *   1. Device enumeration (what is visible)
   *   2. Device access (can we open each stream)
   *   3. Level sampling (is audio actually flowing)
   *
   * Safe to call multiple times. Each call returns a fresh report
   * and writes a row to failure_events if any check failed.
   *
   * @returns {Promise<PreflightReport>}
   */
  async function run() {
    const report = _freshReport();

    // ── Step 1: enumerate ─────────────────────────────────
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs  = devices.filter(d => d.kind === 'audioinput');
      report.devices.all   = inputs.map(d => ({ id: d.deviceId, label: d.label }));
      report.devices.count = inputs.length;

      const loopback = inputs.find(d => /blackhole|loopback|virtual|zoom/i.test(d.label));
      if (loopback) {
        report.devices.loopbackId    = loopback.deviceId;
        report.devices.loopbackLabel = loopback.label;
        report.checks.loopbackVisible = true;
      } else {
        report.checks.loopbackVisible = false;
        report.warnings.push('No loopback device visible. Is BlackHole installed and audio output routed through it?');
      }
    } catch (e) {
      report.checks.loopbackVisible = false;
      report.errors.push('Device enumeration failed: ' + e.message);
    }

    // ── Step 2: access ─────────────────────────────────────
    await _checkMicAccess(report);
    if (report.devices.loopbackId) {
      await _checkLoopbackAccess(report);
    }

    // ── Step 3: level sampling ─────────────────────────────
    // Only sample channels we successfully opened
    if (report.checks.micAccessible) {
      await _sampleLevel(report, 'mic', null);
    }
    if (report.checks.loopbackAccessible && report.devices.loopbackId) {
      await _sampleLevel(report, 'loopback', report.devices.loopbackId);
    }

    // ── Verdict ────────────────────────────────────────────
    report.ready = report.errors.length === 0
      && report.checks.micAccessible
      && report.checks.loopbackAccessible
      && !report.checks.micSilent
      && !report.checks.loopbackSilent;

    report.completedAt = new Date().toISOString();

    // ── Persist ────────────────────────────────────────────
    await _persist(report);

    return report;
  }

  /**
   * checkFileSizes(sessionId, audioPath, teacherPath)
   * Call this immediately after Orchestrator.stopLesson() resolves.
   * Reads file sizes via lessonAPI and appends them to the session's
   * failure_events row so you can distinguish "empty file" from
   * "transcription failed on a good file".
   */
  async function checkFileSizes(sessionId, audioPath, teacherPath) {
    if (!window.lessonAPI?.getFileSizes) return null;
    try {
      const sizes = await window.lessonAPI.getFileSizes([audioPath, teacherPath].filter(Boolean));
      const result = {
        sessionId,
        checkedAt:   new Date().toISOString(),
        student:     sizes[audioPath]   ?? null,
        teacher:     sizes[teacherPath] ?? null,
        studentOk:   (sizes[audioPath]  ?? 0) > 1024,   // >1 KB = not empty
        teacherOk:   !teacherPath || (sizes[teacherPath] ?? 0) > 1024,
      };

      if (!result.studentOk || !result.teacherOk) {
        await _writeFailureEvent('file_size_check', {
          ...result,
          note: !result.studentOk ? 'Student audio file is empty or missing.'
              : 'Teacher/loopback audio file is empty or missing.',
        });
      }

      return result;
    } catch (e) {
      console.warn('[PreflightService] File size check failed:', e.message);
      return null;
    }
  }

  // ── Internal checks ────────────────────────────────────

  async function _checkMicAccess(report) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false }
      });
      const track = stream.getAudioTracks()[0];
      report.devices.micLabel       = track?.label || 'unknown';
      report.checks.micAccessible   = true;
      stream.getTracks().forEach(t => t.stop());
    } catch (e) {
      report.checks.micAccessible = false;
      report.errors.push('Mic access failed: ' + e.message);
    }
  }

  async function _checkLoopbackAccess(report) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: report.devices.loopbackId }, echoCancellation: false }
      });
      report.checks.loopbackAccessible = true;
      stream.getTracks().forEach(t => t.stop());
    } catch (e) {
      report.checks.loopbackAccessible = false;
      report.errors.push('Loopback access failed: ' + e.message);
      report.warnings.push('Is BlackHole selected as the audio output device in Teams/System Preferences?');
    }
  }

  /**
   * Open stream, run an AnalyserNode for LEVEL_SAMPLE_MS, record peak level.
   * Uses the same constraints as AudioService.start() so we're testing the
   * exact same device path.
   */
  async function _sampleLevel(report, channel, deviceId) {
    let stream = null;
    let ctx    = null;
    try {
      const constraints = { audio: deviceId
        ? { deviceId: { exact: deviceId }, echoCancellation: false }
        : { echoCancellation: false, noiseSuppression: false }
      };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      ctx    = new AudioContext();
      const src      = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);

      const buf  = new Uint8Array(analyser.frequencyBinCount);
      let   peak = 0;
      const start = Date.now();

      await new Promise(resolve => {
        const poll = () => {
          analyser.getByteTimeDomainData(buf);
          // Centre is 128; deviation = signal
          const localPeak = Math.max(...buf.map(v => Math.abs(v - 128)));
          if (localPeak > peak) peak = localPeak;
          if (Date.now() - start < LEVEL_SAMPLE_MS) requestAnimationFrame(poll);
          else resolve();
        };
        requestAnimationFrame(poll);
      });

      report.levels[channel] = peak;
      if (channel === 'mic') {
        report.checks.micSilent = peak < SILENCE_THRESHOLD;
        if (report.checks.micSilent) {
          report.warnings.push('Mic appears silent (peak=' + peak + '). Check mic is not muted.');
        }
      } else {
        report.checks.loopbackSilent = peak < SILENCE_THRESHOLD;
        if (report.checks.loopbackSilent) {
          report.warnings.push('Loopback appears silent (peak=' + peak + '). Is Teams/audio playing through BlackHole?');
        }
      }
    } catch (e) {
      report.errors.push('Level sample failed (' + channel + '): ' + e.message);
      report.levels[channel] = null;
    } finally {
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (ctx)    ctx.close();
    }
  }

  // ── Persistence ────────────────────────────────────────

  async function _persist(report) {
    if (!window.db) return;
    // Always write a row so we have a trace even on success.
    // severity: 'ok' | 'warn' | 'error'
    const severity = report.errors.length   ? 'error'
                   : report.warnings.length ? 'warn'
                   :                          'ok';
    await _writeFailureEvent('preflight', {
      severity,
      ready:     report.ready,
      checks:    report.checks,
      levels:    report.levels,
      devices:   {
        micLabel:       report.devices.micLabel,
        loopbackLabel:  report.devices.loopbackLabel,
        count:          report.devices.count,
      },
      warnings:  report.warnings,
      errors:    report.errors,
    });
  }

  async function _writeFailureEvent(eventType, payload) {
    if (!window.db) return;
    try {
      await window.db.run(
        `INSERT INTO failure_events (event_type, context, occurred_at)
         VALUES (?, ?, ?)`,
        [eventType, JSON.stringify(payload), new Date().toISOString()]
      );
    } catch (e) {
      console.warn('[PreflightService] Could not write failure_events row:', e.message);
    }
  }

  // ── Helpers ────────────────────────────────────────────

  function _freshReport() {
    return {
      ready:       false,
      completedAt: null,
      checks: {
        loopbackVisible:    null,
        micAccessible:      null,
        loopbackAccessible: null,
        micSilent:          null,
        loopbackSilent:     null,
      },
      levels:  { mic: null, loopback: null },
      devices: { count: 0, all: [], micLabel: '', loopbackId: null, loopbackLabel: '' },
      warnings: [],
      errors:   [],
    };
  }

  return { run, checkFileSizes };
})();

try { window.PreflightService = PreflightService; } catch(e) {}
// ── App registry ──────────────────────────────────────────────────────────────
try { if (window.App) App.PreflightService = PreflightService; } catch(e) {}
console.log('[PreflightService] loaded');
