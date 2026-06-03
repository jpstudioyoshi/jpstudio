// ═══════════════════════════════════════════════════════
// ANALYSIS SERVICE
// Wraps claudeAPI() for lesson-level analysis.
// Input: LessonSession. Output: analysis object.
// No UI access. No global state mutation.
// ═══════════════════════════════════════════════════════

const AnalysisService = (() => {

  // ── Lesson analysis ────────────────────────────────────
  //
  // Takes a populated LessonSession and runs Claude analysis.
  // Returns the analysis object (also written to session.analysis).

  async function analyzeLesson(session) {
    if (!session || !session.isProcessed) {
      throw new Error('Session has no merged transcript to analyse.');
    }

    const transcriptText = _formatTranscriptForClaude(session.mergedTranscript);
    const waText = session.messages.length
      ? _formatWhatsAppForClaude(session.messages)
      : '';

    const prompt = _buildPrompt(transcriptText, waText);

    let rawText;
    try {
      const data = await claudeAPI({
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
        track: 'lesson',
      });
      rawText = claudeText(data);
    } catch (e) {
      throw new Error('Claude analysis failed: ' + e.message);
    }

    // Parse JSON response
    let analysis = {};
    try {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        analysis = JSON.parse(match[0]);
      } else {
        analysis = { summary: rawText };
      }
    } catch {
      analysis = { summary: rawText };
    }

    return analysis;
  }

  // ── WhatsApp alignment ─────────────────────────────────
  //
  // Aligns WhatsApp messages to transcript timestamps using Claude.
  // Simple version: find anchor point for first message, offset the rest.
  //
  // Returns enriched messages with timestamp_s set.

  async function alignWhatsApp(messages, mergedTranscript) {
    if (!messages.length || !mergedTranscript.length) return messages;

    const waContext = messages.slice(0, 5)
      .map(m => m.time + ' ' + m.sender + ': ' + m.text)
      .join('\n');

    const txContext = mergedTranscript.slice(0, 30).map(t => {
      const s = Math.round(t.start);
      const m = Math.floor(s / 60), sec = s % 60;
      return m + ':' + String(sec).padStart(2, '0') + ' [' + t.speaker.toUpperCase() + '] ' + t.text;
    }).join('\n');

    const prompt =
      'You are aligning a WhatsApp lesson thread with an audio transcript.\n\n' +
      'WHATSAPP (first messages, minute-level timestamps):\n' + waContext + '\n\n' +
      'TRANSCRIPT (first segments, precise timestamps):\n' + txContext + '\n\n' +
      'Find the best matching transcript timestamp (in seconds) for the first WhatsApp message.\n' +
      'Reply ONLY with a JSON object: {"offset_s": <number>, "confidence": "high"|"medium"|"low", "reasoning": "<brief>"}\n' +
      'If you cannot find a match, use {"offset_s": 0, "confidence": "low", "reasoning": "no match found"}';

    try {
      const data = await claudeAPI({
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
        track: 'lesson',
      });
      const raw = claudeText(data).replace(/```json|```/g, '').trim();
      const result = JSON.parse(raw);
      const offsetS = result.offset_s || 0;

      const firstMsgMins = _timeStringToMins(messages[0].time);
      return messages.map(msg => {
        const msgMins = _timeStringToMins(msg.time);
        const deltaS  = (msgMins - firstMsgMins) * 60;
        return { ...msg, timestamp_s: Math.max(0, offsetS + deltaS), synced: true };
      });
    } catch (e) {
      console.warn('[AnalysisService] WhatsApp alignment failed:', e.message);
      return messages;   // Return unsynced — not fatal
    }
  }

  // ── Internal helpers ───────────────────────────────────

  function _formatTranscriptForClaude(merged) {
    return merged.map(t => {
      const ts = Math.round(t.start ?? t.timestamp ?? 0);
      const m  = Math.floor(ts / 60), s = ts % 60;
      const label = t.speaker === 'teacher' ? '🧑‍🏫 Teacher' : '🙋 Student';
      return `[${m}:${String(s).padStart(2, '0')}] ${label}: ${t.text}`;
    }).join('\n');
  }

  function _formatWhatsAppForClaude(messages) {
    return messages.map(m => {
      const ts = m.timestamp_s != null
        ? `${Math.floor(m.timestamp_s / 60)}:${String(Math.floor(m.timestamp_s) % 60).padStart(2, '0')}`
        : m.time || '?';
      return `[${ts}] ${m.sender}: ${m.text}`;
    }).join('\n');
  }

  function _timeStringToMins(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  function _buildPrompt(transcriptText, waText) {
    // Build node ID list from GrammarModel if available
    let nodeList = '';
    try {
      const GM = (typeof GrammarModel !== 'undefined') ? GrammarModel : null;
      if (GM) {
        const nodes = GM.getCoverageMap();
        if (nodes && nodes.length) {
          nodeList = nodes.map(n => n.id + ' (' + n.label + ', Genki ch.' + (n.genki || '?') + ')').join(', ');
        }
      }
    } catch(e) {}

    let prompt = 'Analyse this Japanese lesson. The student is a German-speaking beginner (N5-N4 level).\n\n';
    prompt += 'TRANSCRIPT:\n' + transcriptText + '\n\n';
    if (waText) prompt += 'WHATSAPP NOTES:\n' + waText + '\n\n';
    if (nodeList) {
      prompt += 'GRAMMAR NODE IDs (use these exact IDs in grammarNodeIds):\n' + nodeList + '\n\n';
    }
    prompt +=
      'Return ONLY JSON with this structure:\n' +
      '{\n' +
      '  "summary": "2-3 sentence summary of the lesson",\n' +
      '  "topics": ["grammar point 1", "vocabulary topic 2", ...],\n' +
      '  "studentErrors": [{"text": "what student said", "correction": "correct form", "type": "particle|conjugation|vocabulary|other"}],\n' +
      '  "keyVocab": [{"jp": "日本語", "en": "Japanese", "reading": "にほんご"}],\n' +
      '  "grammarPoints": ["point 1", "point 2"],\n' +
      '  "grammarNodeIds": ["node_id_1", "node_id_2"],\n' +
      '  "teacherNotes": "any key points the teacher emphasised"\n' +
      '}\n' +
      'For grammarNodeIds: pick only IDs from the GRAMMAR NODE IDs list above that match grammar covered in this lesson. Empty array if none match.';
    return prompt;
  }

  return {
    analyzeLesson,
    alignWhatsApp,
  };
})();

// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, { AnalysisService });
  window['AnalysisService'] = AnalysisService;
} catch(e) { console.error('[AnalysisService] App registry failed:', e); }
