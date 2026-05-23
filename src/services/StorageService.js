// ═══════════════════════════════════════════════════════
// STORAGE SERVICE
// Wraps window.lessonAPI (Electron IPC) and localStorage.
// Single place for all lesson session persistence.
// No DOM access. No UI calls.
// ═══════════════════════════════════════════════════════

const StorageService = (() => {

  // ── Lesson sessions (Electron IPC) ─────────────────────

  async function saveSession(session) {
    if (!window.lessonAPI) {
      console.warn('[StorageService] lessonAPI not available — running in browser mode');
      _saveSessionLocal(session);
      return;
    }
    try {
      const storable = session.toStorable();
      await window.lessonAPI.saveTranscript(
        storable.id,
        storable.mergedTranscript
      );
      if (storable.startTime) {
        await window.lessonAPI.saveNotes(
          storable.id,
          JSON.stringify({
            startTime:  storable.startTime,
            transcript: storable.mergedTranscript,
            messages:   storable.messages,
            analysis:   storable.analysis,
          })
        );
      }
    } catch (e) {
      console.error('[StorageService] saveSession failed:', e);
      throw e;
    }
  }

  async function loadSessions() {
    if (!window.lessonAPI) {
      return _loadSessionsLocal();
    }
    try {
      return await window.lessonAPI.list();
    } catch (e) {
      console.error('[StorageService] loadSessions failed:', e);
      return [];
    }
  }

  async function getSession(sessionId) {
    if (!window.lessonAPI) return null;
    try {
      return await window.lessonAPI.get(sessionId);
    } catch (e) {
      console.error('[StorageService] getSession failed:', e);
      return null;
    }
  }

  async function deleteSession(sessionId, audioPaths = []) {
    if (!window.lessonAPI) return;
    try {
      for (const path of audioPaths.filter(Boolean)) {
        await window.lessonAPI.deleteFile(path).catch(() => {});
      }
      await window.lessonAPI.deleteSession(sessionId);
    } catch (e) {
      console.error('[StorageService] deleteSession failed:', e);
      throw e;
    }
  }

  async function saveAudioChunk(path, arrayBuffer) {
    if (!window.lessonAPI) return;
    await window.lessonAPI.saveAudioChunk(path, arrayBuffer);
  }

  async function finaliseRecording(sessionId, audioPath) {
    if (!window.lessonAPI) return;
    await window.lessonAPI.finaliseRecording(sessionId, audioPath);
  }

  async function chunkAudio(audioPath) {
    if (!window.lessonAPI) throw new Error('lessonAPI not available');
    return window.lessonAPI.chunkAudio(audioPath);
  }

  async function startRecording() {
    if (!window.lessonAPI) throw new Error('lessonAPI not available');
    return window.lessonAPI.startRecording();
  }

  // ── WhatsApp notes ─────────────────────────────────────

  async function saveWhatsApp(sessionId, payload) {
    if (!window.lessonAPI) return;
    await window.lessonAPI.saveNotes(sessionId, payload);
  }

  // ── Browser fallback (no Electron) ────────────────────

  const _LOCAL_SESSIONS_KEY = 'jpLessonSessions';

  function _saveSessionLocal(session) {
    try {
      const sessions = _loadSessionsLocal();
      const idx = sessions.findIndex(s => s.id === session.id);
      const storable = session.toStorable();
      if (idx >= 0) sessions[idx] = storable;
      else sessions.push(storable);
      localStorage.setItem(_LOCAL_SESSIONS_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.error('[StorageService] local save failed:', e);
    }
  }

  function _loadSessionsLocal() {
    try {
      return JSON.parse(localStorage.getItem(_LOCAL_SESSIONS_KEY) || '[]');
    } catch {
      return [];
    }
  }

  return {
    saveSession,
    loadSessions,
    getSession,
    deleteSession,
    saveAudioChunk,
    finaliseRecording,
    chunkAudio,
    startRecording,
    saveWhatsApp,
  };
})();

// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, { StorageService });
  window['StorageService'] = StorageService;
} catch(e) { console.error('[StorageService] App registry failed:', e); }
