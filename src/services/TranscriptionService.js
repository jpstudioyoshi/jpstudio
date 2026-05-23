// ═══════════════════════════════════════════════════════
// TRANSCRIPTION SERVICE
// Single Whisper wrapper used by:
//   1. Yoshi dual-channel lesson pipeline  (via Orchestrator)
//   2. LessonNotes single-mic recorder     (lnTranscribe)
//   3. Voice/SST chat panel                (sttTranscribe — preserved as-is,
//                                           can delegate here in future)
//
// No UI access. Returns structured segments, not HTML.
// Speaker assignment is by channel only — no diarization.
// ═══════════════════════════════════════════════════════

const TranscriptionService = (() => {

  // ── Core Whisper call ──────────────────────────────────
  //
  // audioBlob  — Blob (audio/webm)
  // lang       — ISO 639-1 language code, default 'ja'
  // speaker    — 'user' | 'teacher' | null (channel assignment, not inference)
  //
  // Returns: [{ text, timestamp, start, end, speaker }]
  //   timestamp = start (kept for LessonSession merging)

  async function transcribe(audioBlob, { lang = 'ja', speaker = null } = {}) {
    const openaiKey = _getOpenAIKey();
    if (!openaiKey) {
      throw new Error('OpenAI API key required for transcription. Add it in Settings.');
    }

    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', lang);
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'segment');

    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + openaiKey },
      body: formData,
    });
    console.warn(`[STT] Whisper call · speaker="${speaker ?? 'n/a'}" · lang=${lang}`);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => resp.statusText);
      console.error('[TranscriptionService] Whisper error:', errText);
      throw new Error('Whisper transcription failed: ' + errText);
    }

    const data = await resp.json();

    if (!data.segments || !data.segments.length) {
      // Some valid audio returns text-only (no segments)
      if (data.text?.trim()) {
        return [{ text: data.text.trim(), timestamp: 0, start: 0, end: 0, speaker }];
      }
      return [];
    }

    return data.segments.map(seg => ({
      text:      seg.text.trim(),
      timestamp: seg.start,          // canonical key used for merging
      start:     seg.start,
      end:       seg.end,
      speaker,                        // assigned by caller, never inferred
    }));
  }

  // ── Chunked transcription for long lesson recordings ──
  //
  // audioPath   — file path; Electron's lessonAPI.chunkAudio() splits it
  // speaker     — 'user' | 'teacher'
  // onProgress  — optional callback ({ done, total })
  //
  // Returns: [{ text, timestamp, start, end, speaker }]
  //   timestamps are absolute (chunk offset applied)

  async function transcribeFile(audioPath, { speaker, onProgress } = {}) {
    if (!window.lessonAPI) {
      throw new Error('Transcription from file requires the Electron app.');
    }

    const chunks = await window.lessonAPI.chunkAudio(audioPath);
    if (chunks.error) {
      throw new Error('Could not chunk audio: ' + chunks.error);
    }
    if (!chunks.chunks || !chunks.chunks.length) return [];

    const segments = [];
    const total = chunks.chunks.length;

    for (let i = 0; i < total; i++) {
      const chunk = chunks.chunks[i];
      const chunkPath   = typeof chunk === 'string' ? chunk : chunk.path;
      const startOffset = typeof chunk === 'object'  ? (chunk.startS || 0) : 0;

      try {
        const fileUrl  = 'file://' + chunkPath;
        const arrayBuf = await (await fetch(fileUrl)).arrayBuffer();
        const blob     = new Blob([arrayBuf], { type: 'audio/webm' });

        const chunkSegs = await transcribe(blob, { speaker });

        // Apply chunk offset to all timestamps
        for (const seg of chunkSegs) {
          segments.push({
            ...seg,
            timestamp: startOffset + seg.start,
            start:     startOffset + seg.start,
            end:       startOffset + seg.end,
          });
        }
      } catch (e) {
        console.error(`[TranscriptionService] Chunk ${i + 1}/${total} failed:`, e.message);
        // Continue with remaining chunks — partial transcript is better than none
      }

      if (onProgress) onProgress({ done: i + 1, total });
    }

    return segments;
  }

  // ── Internal helpers ───────────────────────────────────

  function _getOpenAIKey() {
    // Reads from the same Storage module used by the rest of the app
    return Storage.getOpenAIKey?.() || localStorage.getItem('jpStudioOpenAIKey') || '';
  }

  return {
    transcribe,
    transcribeFile,
  };
})();

// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, { TranscriptionService });
  window['TranscriptionService'] = TranscriptionService;
} catch(e) { console.error('[TranscriptionService] App registry failed:', e); }
