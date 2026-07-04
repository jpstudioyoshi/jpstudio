// ═══════════════════════════════════════════════════════
// FEATURES-READING
// Quick Read (core + history + sentence listening +
// sentence recording) · Epub Reader
// Requires: core.js, features-core.js (trimSilence,
// audioBufferToWav), features-kana.js
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// QUICK READ
// ═══════════════════════════════════════════════════════

// ── Quick Read state ─────────────────────────────────────────────────────────
const QuickReadState = {
  segments:          [],
  popupEl:           null,
  furiOn:            true,
  plainOn:           false,
  separateSentences: false,
  _historyIdx:       -1,   // index of currently loaded history entry; -1 = new/unsaved
  // Sentence listening
  sentences:         [],
  sentenceIdx:       0,
  listenSpeed:       1.0,
  listenModeOpen:    false,
  playAllActive:     false,
  playAllPaused:     false,
  // Recording
  segmentRecordings: [],
  recording:         false,
  mediaRecorder:     null,
  audioChunks:       [],
  combinedBlob:      null,
  replaceIdx:        -1,
  dragIdx:           -1,
};

function qrClose() {
  document.getElementById('qrOverlay').style.display = 'none';
  qrClosePopup();
}

function qrOnInput() {
  const val = document.getElementById('qrInput').value.trim();
  document.getElementById('qrSegmentBtn').disabled = !val;
  const speakBtn = document.getElementById('qrRawSpeakBtn');
  if (speakBtn) speakBtn.disabled = !val;
  const dlBtn = document.getElementById('qrDownloadTTSBtn');
  if (dlBtn) dlBtn.disabled = !val;
}

async function qrDownloadTTS() {
  const text = (document.getElementById('qrInput')?.value || '').trim();
  if (!text) return;
  const btn = document.getElementById('qrDownloadTTSBtn');
  const _TTS = App.TTS || window.TTS;
  if (!_TTS || !_TTS._vvEnabled) {
    alert('VoiceVox must be running and enabled for audio download.');
    return;
  }
  if (btn) { btn.textContent = '⏳ Generating…'; btn.disabled = true; }
  try {
    const clean = text.replace(/[(（][^)）]*[)）]/g, '').replace(/〜/g, '');
    const qResp = await fetch(
      `${_TTS.VOICEVOX_URL}/audio_query?text=${encodeURIComponent(clean)}&speaker=${_TTS._vvSpeakerId}`,
      { method: 'POST' }
    );
    if (!qResp.ok) throw new Error('Query failed');
    const query = await qResp.json();
    query.speedScale = 0.9;
    const sResp = await fetch(
      `${_TTS.VOICEVOX_URL}/synthesis?speaker=${_TTS._vvSpeakerId}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query) }
    );
    if (!sResp.ok) throw new Error('Synthesis failed');
    const blob = await sResp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tts-' + new Date().toISOString().slice(0,10) + '.wav';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch(e) {
    alert('Download failed: ' + e.message);
  } finally {
    if (btn) { btn.textContent = '⬇ Audio'; btn.disabled = false; }
  }
}
function qrSpeakRaw() {
  const text = (document.getElementById('qrInput')?.value || '').trim();
  if (!text) return;
  const btn = document.getElementById('qrRawSpeakBtn');
  const _TTS = App.TTS || window.TTS;
  // Toggle: if already speaking, stop
  if (window.speechSynthesis?.speaking || _TTS?._vvAudio) {
    _TTS ? _TTS.stop() : window.speechSynthesis?.cancel();
    if (btn) btn.textContent = '🔊 Listen';
    return;
  }
  if (btn) btn.textContent = '⏹ Stop';
  const _jpSpeak = App.jpSpeak || window.jpSpeak;
  if (_jpSpeak) {
    _jpSpeak(text, 0.9, {
      onend:   () => { if (btn) btn.textContent = '🔊 Listen'; },
      onerror: () => { if (btn) btn.textContent = '🔊 Listen'; },
    });
  }
}

// Entry point for external callers — loads text into Quick Read and segments it
async function qrLoadText(text) {
  if (!text) return;
  // Save existing content first
  const existing = document.getElementById('qrInput')?.value?.trim();
  if (existing && existing.length >= 10) {
    (App.qrSaveToHistory || window.qrSaveToHistory)?.(existing, []);
  }
  // Navigate to reading panel
  (App.showPanel || window.showPanel)?.('read');
  await new Promise(r => setTimeout(r, 100));
  // Show paste area and set text
  qrShowPaste();
  const inp = document.getElementById('qrInput');
  if (inp) { inp.value = text; inp.dispatchEvent(new Event('input')); }
  // Auto-segment
  await qrSegment();
}

function qrShowPaste() {
  const rw = document.getElementById('qrReaderWrap');
  const qrf = document.getElementById('qrFooterUpper'); if (qrf) qrf.style.display = 'none';
  const pa = document.getElementById('readPasteArea');
  if (rw) rw.style.display = 'none';
  if (pa) pa.style.display = 'block';
  const fb = document.getElementById('qrFuriBtn');
  if (fb) fb.style.display = 'none';
  document.getElementById('qrStatus').textContent = '';
  QuickReadState.segments = [];
  // Preserve history index so re-analyse overwrites current entry rather than creating a new one
  const sel = document.getElementById('qrHistorySelect');
  const selIdx = sel ? parseInt(sel.value) : NaN;
  if (!isNaN(selIdx) && selIdx >= 0) QuickReadState._historyIdx = selIdx;
}

function qrClear() {
  // Capture current text before clearing (needed for history removal)
  const inp = document.getElementById('qrInput');
  const _textBeforeClear = inp ? inp.value.trim() : '';
  if (inp) inp.value = '';
  // Clear segments and recordings
  QuickReadState.segments = [];
  QuickReadState.segmentRecordings = [];
  QuickReadState.sentences = [];
  QuickReadState.sentenceIdx = 0;
  // Stop any TTS in progress
  try { window.speechSynthesis?.cancel(); } catch(e) {}
  const speakBtn = document.getElementById('qrRawSpeakBtn');
  if (speakBtn) { speakBtn.textContent = '🔊 Listen'; speakBtn.disabled = true; }
  // Stop auto-speak
  if (QuickReadState.autoSpeakTimer) {
    clearTimeout(QuickReadState.autoSpeakTimer);
    QuickReadState.autoSpeakTimer = null;
  }
  // Disable segment button
  const seg = document.getElementById('qrSegmentBtn');
  if (seg) seg.disabled = true;
  // Clear status
  const status = document.getElementById('qrStatus');
  if (status) status.textContent = '';
  // Show paste area
  qrShowPaste();
  // Clear the reader
  const reader = document.getElementById('qrReader');
  if (reader) reader.innerHTML = '';
  // Reset dropdown to default label
  const _sel = document.getElementById('qrHistorySelect');
  if (_sel) _sel.selectedIndex = 0;
}

// QuickReadState.plainOn — see declaration above

function qrSendToWrite() {
  // Get original plain text (no furigana) from the input textarea
  const text = (document.getElementById('qrInput').value || '').trim();
  if (!text) return;
  // Switch to Write panel and paste text into input
  (App.showPanel || window.showPanel)?.('writing');
  const inp = document.getElementById('writingInput');
  if (inp) {
    inp.value = text;
    inp.focus();
    qrOnInput && qrOnInput();
    // Trigger kana input update if active
    if (typeof updateWritingInput === 'function') updateWritingInput();
  }
}
function qrTogglePlain() {
  QuickReadState.plainOn = !QuickReadState.plainOn;
  const btn = document.getElementById('qrPlainBtn');
  btn.classList.toggle('active', QuickReadState.plainOn);
  if (QuickReadState.plainOn) {
    // Show original unsegmented text in a selectable textarea-like div
    const orig = document.getElementById('qrInput').value;
    document.getElementById('qrReader').innerHTML =
      `<div style="font-family:var(--jp);font-size:1.15rem;line-height:2;color:var(--ink);white-space:pre-wrap;user-select:text;cursor:text">${orig}</div>`;
  } else {
    qrRender(QuickReadState.segments);
  }
}

function qrToggleFuri() {
  QuickReadState.furiOn = !QuickReadState.furiOn;
  const btn = document.getElementById('qrFuriBtn');
  btn.classList.toggle('active', QuickReadState.furiOn);
  document.getElementById('qrStatus').textContent = '';
  qrRender(QuickReadState.segments);
}

async function qrSegment() {
  const rawText = document.getElementById('qrInput').value.trim();
  if (!rawText) return;
  if (!(App.getApiKey || window.getApiKey)?.()) { alert('No API key set — open ⚙ settings first.'); return; }

  const btn = document.getElementById('qrSegmentBtn');
  btn.disabled = true;
  btn.textContent = 'Analysing…';
  document.getElementById('qrStatus').textContent = 'Segmenting…';

  // Extract emoji positions so we can reinsert them after segmentation
  const emojiRe = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu;
  // Replace emoji with placeholder before sending to AI
  const placeholders = [];
  const textForAI = rawText.replace(emojiRe, m => {
    const ph = `§${placeholders.length}§`;
    placeholders.push(m);
    return ph;
  });

  try {
    const data = await (App.claudeAPI || window.claudeAPI)({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        messages: [{ role: 'user', content:
          `You are a Japanese text segmenter. Split the text into WORDS (not individual characters). Group kanji+kana that form one word together.

Return ONLY a JSON array, no markdown:
[{"w":"word","r":"reading"},...]

Correct examples:
水曜日 → {"w":"水曜日","r":"すいようび"}
食べる → {"w":"食べる","r":"たべる"}
誕生日 → {"w":"誕生日","r":"たんじょうび"}
泳ぎに行き → {"w":"泳ぎに","r":"およぎに"},{"w":"行き","r":"いき"}
は → {"w":"は","r":""}

Rules:
- Group characters that form one word. NEVER split 水曜日 into 水,曜,日
- "r" = full hiragana reading for words containing any kanji
- "r" = empty string for pure kana, punctuation, numbers
- Punctuation as separate tokens
- §N§ placeholders as own tokens with r=""
- Newlines: {"w":"\n","r":""}

Text: ${textForAI}` }],
        track: 'reading'
    });
    const raw = (data.content?.[0]?.text || '[]').trim();
    let words;
    try {
      words = JSON.parse(raw.replace(/```json|```/g,'').trim());
    } catch(e) {
      // Try to extract JSON array from response
      const match = raw.match(/\[[\s\S]*\]/);
      words = match ? JSON.parse(match[0]) : rawText.split('').map(ch => ({w:ch, r:''}));
    }

    // Reinsert emoji for placeholder tokens
    QuickReadState.segments = words.map(item => {
      let w = typeof item === 'string' ? item : (item.w || '');
      const r = typeof item === 'string' ? '' : (item.r || '');
      // Replace §N§ placeholders back with emoji
      w = w.replace(/§(\d+)§/g, (_, n) => placeholders[+n] || '');
      return { word: w, reading: r, en: null, pos: null };
    });

    QuickReadState.furiOn = true;
    QuickReadState.plainOn = false;
    const plainBtn = document.getElementById('qrPlainBtn');
    if (plainBtn) plainBtn.classList.remove('active');
    const furiBtn = document.getElementById('qrFuriBtn');
    furiBtn.classList.add('active');
    qrRender(QuickReadState.segments);

    const rw = document.getElementById('qrReaderWrap');
  const qrf = document.getElementById('qrFooterUpper'); if (qrf) qrf.style.display = 'flex';
    const pa = document.getElementById('readPasteArea');
    if (rw) rw.style.display = 'flex';
    if (pa) pa.style.display = 'none';
    document.getElementById('qrFuriBtn').style.display = '';
    document.getElementById('qrStatus').textContent = '';
    
    // Save to history with segments so reload is instant (no re-analysis)
    qrSaveToHistory(rawText, [], QuickReadState.segments);
  } catch(e) {
    document.getElementById('qrStatus').textContent = 'Error — check API key';
    console.error(e);
  }
  btn.disabled = false;
  btn.textContent = 'Analyse →';
}

function qrRender(segments) {
  const container = document.getElementById('qrReader');
  const isNewline = w => w === '\n' || w === '\r\n' || w === '\r';
  const isPunct = w => /^[　。、！？…「」『』【】〔〕（）・]+$/.test(w);
  const isSentenceEnd = w => /[。！？]$/.test(w);
  const hasKanji = w => /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/.test(w);
  const isJP = w => /[\u3040-\u9FFF\uF900-\uFAFF]/.test(w);
  const sep = QuickReadState.separateSentences;

  // Sync button state to match current separateSentences flag
  const sepBtn = document.getElementById('qrSeparateBtn');
  if (sepBtn) sepBtn.classList.toggle('active', sep);

  let html = '<div id="qrTextBody" style="font-family:\'Noto Sans JP\',sans-serif;font-size:1.25rem;line-height:2.4;color:var(--ink)">';
  segments.forEach((seg, i) => {
    const w = seg.word;
    if (!w) return;
    if (isNewline(w)) { html += '<br>'; return; }
    if (isPunct(w)) {
      html += `<span style="color:var(--ink-light)">${w}</span>`;
      // In separate-sentences mode, add a line break after sentence-ending punctuation
      if (sep && isSentenceEnd(w)) html += '<br>';
      return;
    }
    if (!isJP(w)) { html += `<span>${w}</span>`; return; }
    if (QuickReadState.furiOn && seg.reading && hasKanji(w)) {
      html += `<ruby class="qr-ruby qr-boundary" data-idx="${i}">${w}<rt style="font-size:0.65em;color:var(--ink-light);pointer-events:none">${seg.reading}</rt></ruby>`;
    } else {
      html += `<span class="qr-word qr-boundary" data-idx="${i}">${w}</span>`;
    }
  });
  html += '</div>';
  container.innerHTML = html;

  // Single delegated click handler — works for both span and ruby
  container.onclick = e => {
    const el = e.target.closest('[data-idx]');
    if (!el) return;
    e.stopPropagation();
    const idx = parseInt(el.dataset.idx);
    qrWordClick(el, idx);
  };
}

async function qrWordClick(el, idx) {
  if (el.classList.contains('qr-active')) { qrClosePopup(); return; }
  document.querySelectorAll('.qr-word.qr-active, .qr-ruby.qr-active').forEach(e => e.classList.remove('qr-active'));
  el.classList.add('qr-active');
  qrClosePopup();

  const seg = QuickReadState.segments[idx];
  // Copy word to clipboard immediately
  navigator.clipboard.writeText(seg.word).catch(() => {});
  const popup = document.createElement('div');
  popup.className = 'yoshi-word-popup';
  QuickReadState.popupEl = popup;

  const rect = el.getBoundingClientRect();
  const left = Math.min(rect.left, window.innerWidth - 290);
  const top = rect.bottom + 6;
  popup.style.cssText = `position:fixed;top:${top}px;left:${left}px;z-index:700`;

  if (seg.en) {
    popup.innerHTML = qrPopupHtml(seg, true);
    document.body.appendChild(popup);
    setTimeout(() => { const d = popup.querySelector('[style*="copied"]'); if(d) d.style.opacity=0; }, 1500);
    return;
  }

  popup.innerHTML = `<div class="yoshi-word-popup-jp">${seg.word}</div><div class="yoshi-word-popup-loading">looking up…</div>`;
  document.body.appendChild(popup);

  if (!(App.getApiKey || window.getApiKey)?.()) { popup.querySelector('.yoshi-word-popup-loading').textContent = 'No API key'; return; }

  try {
    const data = await (App.claudeAPI || window.claudeAPI)({
        model: 'claude-sonnet-4-6',
        max_tokens: 120,
        messages: [{ role: 'user', content:
          `Give the English meaning of this Japanese word. Reply ONLY with JSON: {"en":"brief English meaning","pos":"noun/verb/particle/etc"}. Word: ${seg.word}` }]
    ,
      track: 'reading'
    });
    const raw = (data.content?.[0]?.text || '{}').trim();
    let parsed;
    try { parsed = JSON.parse(raw.replace(/```json|```/g,'').trim()); } catch(e) { parsed = {}; }
    seg.en = parsed.en || '—';
    seg.pos = parsed.pos || '';
    if (QuickReadState.popupEl === popup) { popup.innerHTML = qrPopupHtml(seg, true); setTimeout(() => { const d = popup.querySelector('[style*="copied"]'); if(d) d.style.opacity=0; }, 1500); }
  } catch(e) {
    if (QuickReadState.popupEl === popup) popup.innerHTML = `<div class="yoshi-word-popup-jp">${seg.word}</div><div class="yoshi-word-popup-loading">lookup failed</div>`;
  }
}

function qrPopupHtml(seg, copied) {
  return `
    <div class="yoshi-word-popup-jp">${seg.word}</div>
    ${seg.reading ? `<div class="yoshi-word-popup-kana">${seg.reading}</div>` : ''}
    <div class="yoshi-word-popup-en">${seg.en || '—'}</div>
    ${seg.pos ? `<div style="font-family:var(--ui);font-size:0.7rem;color:var(--ink-light);margin-top:2px">${seg.pos}</div>` : ''}
    <div style="font-family:var(--ui);font-size:0.68rem;color:var(--teal);margin-top:4px;opacity:${copied ? 1 : 0};transition:opacity 0.3s">copied ✓</div>
  `;
}

function qrClosePopup() {
  if (QuickReadState.popupEl) { QuickReadState.popupEl.remove(); QuickReadState.popupEl = null; }
  document.querySelectorAll('.qr-word.qr-active, .qr-ruby.qr-active').forEach(e => e.classList.remove('qr-active'));
}

document.addEventListener('click', e => {
  if (!QuickReadState.popupEl) return;
  if (!QuickReadState.popupEl.contains(e.target) && !e.target.closest('.qr-word') && !e.target.closest('.qr-ruby')) qrClosePopup();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const ov = document.getElementById('qrOverlay');
    if (!ov || ov.style.display === 'none') return;
    if (QuickReadState.popupEl) { qrClosePopup(); return; }
    qrClose();
  }
});



// ═══════════════════════════════════════════════════════
// QUICK READ HISTORY
// ═══════════════════════════════════════════════════════
const QR_HISTORY_KEY = 'qrHistory';
const QR_HISTORY_MAX = 20;

let _qrHistoryCache = null;

function qrLoadHistoryList() {
  if (_qrHistoryCache !== null) return _qrHistoryCache;
  try { return JSON.parse(localStorage.getItem('jpStudioQrHistory') || '[]'); } catch(e) { return []; }
}

function qrSaveHistoryList(list) {
  _qrHistoryCache = list;
  window.kvAPI?.set(QR_HISTORY_KEY, JSON.stringify(list)).catch(function(e) {
    console.error('[qrHistory] kvAPI save failed:', e);
  });
}

async function qrLoadHistoryFromStorage() {
  try {
    const legacy = localStorage.getItem('jpStudioQrHistory');
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (parsed && parsed.length) {
        await window.kvAPI.set(QR_HISTORY_KEY, JSON.stringify(parsed));
        _qrHistoryCache = parsed;
        localStorage.removeItem('jpStudioQrHistory');
        qrUpdateHistoryDropdown();
        return;
      }
      localStorage.removeItem('jpStudioQrHistory');
    }
    const result = await window.kvAPI?.get(QR_HISTORY_KEY);
    const raw = result && result.value !== undefined ? result.value : result;
    _qrHistoryCache = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
  } catch(e) {
    console.error('[qrHistory] load failed:', e);
    _qrHistoryCache = [];
  }
  qrUpdateHistoryDropdown();
}

function qrUpdateHistoryDropdown() {
  const select = document.getElementById('qrHistorySelect');
  if (!select) return;
  
  const history = qrLoadHistoryList();
  select.innerHTML = '<option value="">— Recent texts (' + history.length + ') —</option>';
  
  history.forEach((item, i) => {
    const preview = item.text.slice(0, 40).replace(/\n/g, ' ') + (item.text.length > 40 ? '…' : '');
    const date = new Date(item.timestamp).toLocaleDateString();
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${preview} (${date})`;
    select.appendChild(opt);
  });
}

function qrSaveToHistory(text, recordings, segments) {
  if (!text || text.trim().length < 10) return; // Don't save very short texts
  (App.drillLastCompletedWrite || window.drillLastCompletedWrite)?.('reading');
  const history = qrLoadHistoryList();
  
  // If we have a known history index (edit of existing item), overwrite it in-place
  const _knownIdx = QuickReadState._historyIdx;
  if (_knownIdx >= 0 && _knownIdx < history.length) {
    history[_knownIdx].text = text;
    history[_knownIdx].timestamp = Date.now();
    history[_knownIdx].recordings = recordings || [];
    if (segments && segments.length) history[_knownIdx].segments = segments;
  } else {
    // Check if same text already exists (dedup for new items)
    const existingIdx = history.findIndex(h => h.text === text);
    if (existingIdx >= 0) {
      history[existingIdx].timestamp = Date.now();
      history[existingIdx].recordings = recordings || [];
      if (segments && segments.length) history[existingIdx].segments = segments;
      QuickReadState._historyIdx = existingIdx;
    } else {
      // Add new entry
      history.unshift({
        text: text,
        segments: segments || [],
        timestamp: Date.now(),
        recordings: recordings || []
      });
      QuickReadState._historyIdx = 0;
      // Keep only last N
      while (history.length > QR_HISTORY_MAX) {
        history.pop();
      }
    }
  }
  
  qrSaveHistoryList(history);
  qrUpdateHistoryDropdown();
}

async function qrLoadHistory(indexStr) {
  if (!indexStr && indexStr !== 0) return;
  // Stop any active listen mode or TTS
  if (QuickReadState.listenModeOpen) {
    const lBtn = document.getElementById('qrListenModeBtn');
    if (lBtn) lBtn.click();
  }
  try { (App.TTS || window.TTS)?.stop(); } catch(e) {}
  try { window.speechSynthesis?.cancel(); } catch(e) {}
  
  const history = qrLoadHistoryList();
  const idx = parseInt(indexStr);
  if (idx < 0 || idx >= history.length) return;
  
  const item = history[idx];
  QuickReadState._historyIdx = idx;
  
  // Load text
  const inp = document.getElementById('qrInput');
  if (inp) inp.value = item.text;
  
  // Load recordings if any
  QuickReadState.segmentRecordings = [];
  if (item.recordings && item.recordings.length > 0) {
    for (const rec of item.recordings) {
      try {
        // Convert base64 back to blob
        const binary = atob(rec.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: rec.type || 'audio/webm' });
        QuickReadState.segmentRecordings.push({ blob, timestamp: rec.timestamp });
      } catch (e) {
        console.error('Failed to restore recording:', e);
      }
    }
  }
  
  qrUpdateSegmentUI();
  
  
  // Restore segments if cached — avoids re-analysis API call
  if (item.segments && item.segments.length) {
    QuickReadState.segments = item.segments;
    qrOnInput();
    qrRender(QuickReadState.segments);
    const rw = document.getElementById('qrReaderWrap');
  const qrf = document.getElementById('qrFooterUpper'); if (qrf) qrf.style.display = 'flex';
    const pa = document.getElementById('readPasteArea');
    if (rw) rw.style.display = 'flex';
    if (pa) pa.style.display = 'none';
    document.getElementById('qrStatus').textContent = '';
  } else {
    // No cached segments — fall back to re-analysis
    qrOnInput();
    qrSegment();
  }
}

function qrDeleteHistory() {
  const select = document.getElementById('qrHistorySelect');
  const idx = parseInt(select.value);
  if (isNaN(idx) || idx < 0) {
    alert('Select a text from the dropdown first, then click 🗑');
    return;
  }
  const history = qrLoadHistoryList();
  if (idx >= history.length) return;
  const item = history[idx];
  const preview = item.text.slice(0, 60).replace(/\n/g, ' ') + (item.text.length > 60 ? '…' : '');
  if (!confirm('Delete: "' + preview + '"?')) return;
  // If this text is currently loaded in the textarea, clear it
  const inp = document.getElementById('qrInput');
  if (inp && inp.value.trim() === item.text.trim()) {
    inp.value = '';
    qrOnInput();
  }
  history.splice(idx, 1);
  qrSaveHistoryList(history);
  qrUpdateHistoryDropdown();
}

// Convert recordings to base64 for storage
function qrGetRecordingsForStorage() {
  return Promise.all(QuickReadState.segmentRecordings.map(async (rec) => {
    const arrayBuffer = await rec.blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return {
      data: btoa(binary),
      type: rec.blob.type,
      timestamp: rec.timestamp
    };
  }));
}

// Initialize history dropdown on load
document.addEventListener('storageReady', () => {
  qrLoadHistoryFromStorage();
  // Load separate sentences preference from kvAPI
  window.kvAPI?.get('qrSeparateSentences').then(function(r) {
    if (r && r.value !== undefined) {
      QuickReadState.separateSentences = r.value === '1';
      const cb = document.getElementById('qrSeparateSentencesToggle');
      if (cb) cb.checked = QuickReadState.separateSentences;
    }
  }).catch(function(){});
});

// ── Separate sentences function ──
function qrToggleSeparateSentences() {
  QuickReadState.separateSentences = !QuickReadState.separateSentences;
  window.kvAPI?.set('qrSeparateSentences', QuickReadState.separateSentences ? '1' : '0').catch(()=>{});
  if (QuickReadState.segments.length > 0) {
    qrRender(QuickReadState.segments);
  }
}


// Restore separateSentences preference from localStorage
// qrSeparateSentences loaded from kvAPI on storageReady

// ═══════════════════════════════════════════════════════
// QUICK READ SENTENCE LISTENING
// ═══════════════════════════════════════════════════════
// QuickReadState.sentences* — see declaration above

function qrToggleListenMode() {
  const panel = document.getElementById('qrListenPanel');
  const recordSection = document.getElementById('qrRecordSection');
  const btn = document.getElementById('qrListenModeBtn');
  
  const container = document.getElementById('qrListenContainer');
  if (QuickReadState.listenModeOpen) {
    if (container) container.style.display = 'none';
    btn.classList.remove('active');
    QuickReadState.listenModeOpen = false;
    speechSynthesis.cancel();
    qrClearSentenceHighlight();
  } else {
    // Parse sentences from reader
    const reader = document.getElementById('qrReader');
    if (!reader) return;
    
    // Build two parallel sentence lists — tts uses readings (avoids kanji misreading),
    // kanjiSentences used for DOM highlighting (matches seg.word values in the reader)
    const hasKanji = w => /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/.test(w);
    const ttsFullText   = QuickReadState.segments.map(s => { const w = s.word || ''; return (s.reading && hasKanji(w)) ? s.reading : w; }).join('');
    const kanjiFullText = QuickReadState.segments.map(s => s.word || '').join('');
    const splitSentences = t => t.split(/(?<=[\u3002\uff01\uff1f\n])(?!\u300d)/g).map(s => s.trim()).filter(s => s.length > 0);
    QuickReadState.sentences      = splitSentences(ttsFullText);
    QuickReadState.sentencesKanji = splitSentences(kanjiFullText);
    const fullText = ttsFullText; // keep for compat
    
    if (QuickReadState.sentences.length === 0) return;
    
    QuickReadState.sentenceIdx = 0;
    if (container) container.style.display = 'block';
    btn.classList.add('active');
    QuickReadState.listenModeOpen = true;
    
    qrUpdateSentenceDisplay();
    qrHighlightSentence(0);
  }
}

function qrUpdateSentenceDisplay() {
  const counter = document.getElementById('qrSentenceCounter');
  const progress = document.getElementById('qrSentenceProgress');
  const display = document.getElementById('qrCurrentSentence');
  const prevBtn = document.getElementById('qrListenPrevBtn');
  const nextBtn = document.getElementById('qrListenNextBtn');
  
  if (counter) counter.textContent = `${QuickReadState.sentenceIdx + 1} / ${QuickReadState.sentences.length}`;
  if (progress) progress.style.width = `${((QuickReadState.sentenceIdx + 1) / QuickReadState.sentences.length) * 100}%`;
  if (display) display.textContent = QuickReadState.sentences[QuickReadState.sentenceIdx] || '';
  if (prevBtn) prevBtn.disabled = QuickReadState.sentenceIdx <= 0;
  if (nextBtn) nextBtn.disabled = QuickReadState.sentenceIdx >= QuickReadState.sentences.length - 1;
}

function qrListenPlay() {
  const btn = document.getElementById('qrListenPlayBtn');
  const _TTS = App.TTS || window.TTS;
  if (_TTS?._vvAudio || window.speechSynthesis?.speaking) {
    _TTS ? _TTS.stop() : window.speechSynthesis?.cancel();
    if (btn) btn.textContent = '▶';
    qrClearSentenceHighlight();
    return;
  }
  const sentence = QuickReadState.sentences[QuickReadState.sentenceIdx];
  if (!sentence) return;
  if (btn) btn.textContent = '⏹';
  qrHighlightSentence(QuickReadState.sentenceIdx);
  _TTS.speak(sentence, QuickReadState.listenSpeed, {
    onend:   () => { if (btn) btn.textContent = '▶'; },
    onerror: () => { if (btn) btn.textContent = '▶'; },
  });
}

function qrHighlightSentence(sentenceIdx) {
  const reader = document.getElementById('qrReader');
  if (!reader) return;

  qrClearSentenceHighlight();

  const sentence = (QuickReadState.sentencesKanji || QuickReadState.sentences)[sentenceIdx];
  if (!sentence) return;

  // Build full text from segments and find sentence position
  const segments = QuickReadState.segments;
  const fullText  = segments.map(s => s.word || '').join('');
  const sentenceClean = sentence.replace(/\s+/g, '');
  const startPos = fullText.indexOf(sentenceClean);
  if (startPos === -1) return;
  const endPos = startPos + sentenceClean.length;

  // Mark segments that fall within the sentence character range
  let charPos = 0;
  const inSentence = new Set();
  for (let i = 0; i < segments.length; i++) {
    const w = segments[i].word || '';
    const segStart = charPos;
    const segEnd   = charPos + w.length;
    if (segEnd > startPos && segStart < endPos) inSentence.add(i);
    charPos = segEnd;
  }

  // Apply highlight class to matching DOM elements
  let firstEl = null;
  reader.querySelectorAll('[data-idx]').forEach(el => {
    const idx = parseInt(el.dataset.idx);
    if (inSentence.has(idx)) {
      el.classList.add('qr-sentence-active');
      if (!firstEl) firstEl = el;
    }
  });

  // Scroll within qrReader (the constrained text container)
  if (firstEl) {
    const elRect     = firstEl.getBoundingClientRect();
    const readerRect = reader.getBoundingClientRect();
    const relTop     = elRect.top - readerRect.top + reader.scrollTop;
    reader.scrollTo({
      top: Math.max(0, relTop - reader.clientHeight / 2 + elRect.height / 2),
      behavior: 'smooth',
    });
  }
}

function qrClearSentenceHighlight() {
  document.querySelectorAll('.qr-sentence-active').forEach(el => {
    el.classList.remove('qr-sentence-active');
  });
}

function qrPauseAll() {
  const btn = document.getElementById('qrPauseAllBtn');
  if (!QuickReadState.playAllActive) return;
  if (QuickReadState.playAllPaused) {
    QuickReadState.playAllPaused = false;
    if (btn) btn.textContent = 'Pause';
    // Resume from next sentence
    QuickReadState.sentenceIdx++;
    qrPlayAllNext();
  } else {
    QuickReadState.playAllPaused = true;
    if (btn) btn.textContent = 'Resume';
    (App.TTS || window.TTS)?.stop();
    try { window.speechSynthesis?.cancel(); } catch(e) {}
  }
}

function qrPlayAll() {
  const btn = document.getElementById('qrPlayAllBtn2');
  if (QuickReadState.playAllActive) {
    QuickReadState.playAllActive = false;
    if (btn) btn.textContent = 'Play All';
    (App.TTS || window.TTS)?.stop();
    try { window.speechSynthesis?.cancel(); } catch(e) {}
    return;
  }
  if (!QuickReadState.listenModeOpen) {
    const lBtn = document.getElementById('qrListenModeBtn');
    if (lBtn) lBtn.click();
  }
  QuickReadState.playAllActive = true;
  QuickReadState.playAllPaused = false;
  if (btn) btn.textContent = '⏹ Stop';
  const pauseBtn = document.getElementById('qrPauseAllBtn');
  if (pauseBtn) { pauseBtn.style.display = ''; pauseBtn.textContent = 'Pause'; }
  QuickReadState.sentenceIdx = 0;
  qrUpdateSentenceDisplay();
  qrHighlightSentence(0);
  qrPlayAllNext();
}

function qrPlayAllNext() {
  if (!QuickReadState.playAllActive || QuickReadState.playAllPaused) return;
  if (QuickReadState.sentenceIdx >= QuickReadState.sentences.length) {
    QuickReadState.playAllActive = false;
    const btn = document.getElementById('qrPlayAllBtn2');
    const pauseBtn = document.getElementById('qrPauseAllBtn');
    if (btn) btn.textContent = 'Play All';
    if (pauseBtn) pauseBtn.style.display = 'none';
    return;
  }
  const sentence = QuickReadState.sentences[QuickReadState.sentenceIdx];
  if (!sentence) return;
  qrHighlightSentence(QuickReadState.sentenceIdx);
  qrUpdateSentenceDisplay();
  const _TTS = App.TTS || window.TTS;
  _TTS.speak(sentence, QuickReadState.listenSpeed, {
    onend: () => {
      if (!QuickReadState.playAllActive || QuickReadState.playAllPaused) return;
      QuickReadState.sentenceIdx++;
      qrPlayAllNext();
    },
    onerror: () => {
      QuickReadState.playAllActive = false;
      const btn = document.getElementById('qrPlayAllBtn2');
      if (btn) btn.textContent = 'Play All';
    }
  });
}

function qrListenPrev() {
  if (QuickReadState.sentenceIdx > 0) {
    (App.TTS || window.TTS)?.stop();
    QuickReadState.sentenceIdx--;
    qrUpdateSentenceDisplay();
    qrHighlightSentence(QuickReadState.sentenceIdx);
    document.getElementById('qrListenPlayBtn').textContent = '▶';
  }
}

function qrListenNext() {
  if (QuickReadState.sentenceIdx < QuickReadState.sentences.length - 1) {
    (App.TTS || window.TTS)?.stop();
    QuickReadState.sentenceIdx++;
    qrUpdateSentenceDisplay();
    qrHighlightSentence(QuickReadState.sentenceIdx);
    document.getElementById('qrListenPlayBtn').textContent = '▶';
  }
}

// Speak the current sentence and update play button
function _qrSpeakCurrent() {
  const _TTS = App.TTS || window.TTS;
  _TTS?.stop();
  const sentence = QuickReadState.sentences[QuickReadState.sentenceIdx];
  if (!sentence) return;
  const btn = document.getElementById('qrListenPlayBtn');
  if (btn) btn.textContent = '⏹';
  qrHighlightSentence(QuickReadState.sentenceIdx);
  qrUpdateSentenceDisplay();
  _TTS.speak(sentence, QuickReadState.listenSpeed, {
    onend:   () => { if (btn) btn.textContent = '▶'; },
    onerror: () => { if (btn) btn.textContent = '▶'; },
  });
}

// Arrow key navigation for listen mode
document.addEventListener('keydown', e => {
  if (!QuickReadState.sentences.length) return;
  // Ignore if focus is on an input/textarea
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (QuickReadState.sentenceIdx < QuickReadState.sentences.length - 1) {
      QuickReadState.sentenceIdx++;
      _qrSpeakCurrent();
    }
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (QuickReadState.sentenceIdx > 0) {
      QuickReadState.sentenceIdx--;
      _qrSpeakCurrent();
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    _qrSpeakCurrent();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    (App.TTS || window.TTS)?.stop();
    QuickReadState.sentenceIdx = 0;
    qrUpdateSentenceDisplay();
    qrHighlightSentence(0);
    const btn = document.getElementById('qrListenPlayBtn');
    if (btn) btn.textContent = '▶';
  }
});

function qrSetSpeed(speed) {
  QuickReadState.listenSpeed = speed;
  document.querySelectorAll('.qr-speed-btn').forEach(btn => {
    btn.classList.toggle('active', parseFloat(btn.dataset.speed) === speed);
  });
}


// ═══════════════════════════════════════════════════════
// QUICK READ SENTENCE RECORDING
// ═══════════════════════════════════════════════════════
// QuickReadState.recording* — see declaration above

function qrUpdateSegmentUI() {
  const countEl = document.getElementById('qrSegmentCount');
  const playBtn = document.getElementById('qrPlayAllBtn');
  const combineBtn = document.getElementById('qrCombineBtn');
  const downloadBtn = document.getElementById('qrDownloadBtn');
  const bar = document.getElementById('qrSegmentBar');
  
  const count = QuickReadState.segmentRecordings.length;
  
  if (countEl) countEl.textContent = `${count} segment${count !== 1 ? 's' : ''} recorded`;
  if (playBtn) playBtn.disabled = count === 0;
  if (combineBtn) combineBtn.disabled = count === 0;
  if (downloadBtn) downloadBtn.disabled = !QuickReadState.combinedBlob;
  
  if (bar) {
    bar.innerHTML = QuickReadState.segmentRecordings.map((rec, i) => `
      <div class="qr-seg-card" draggable="true" data-seg-idx="${i}" 
        style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 8px;background:var(--paper-dark);border-radius:6px;border:1px solid ${QuickReadState.replaceIdx === i ? 'var(--gold)' : 'var(--border)'}; cursor:grab"
        ondragstart="qrSegDragStart(event,${i})" ondragover="qrSegDragOver(event)" ondrop="qrSegDrop(event,${i})" ondragend="qrSegDragEnd(event)">
        <div style="display:flex;align-items:center;gap:6px;width:100%">
          <span style="font-size:0.65rem;color:var(--ink-light);cursor:grab" title="Drag to reorder">⋮⋮</span>
          <span style="font-family:var(--ui);font-size:0.7rem;font-weight:600;color:var(--ink-light)">${i + 1}</span>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn-action" onclick="event.stopPropagation();qrPlaySegment(${i})" title="Play">▶</button>
          <button onclick="event.stopPropagation();qrStartReplace(${i})" title="Re-record" style="width:28px;height:28px;background:${QuickReadState.replaceIdx === i ? 'var(--gold)' : 'var(--paper-mid)'};border:1px solid ${QuickReadState.replaceIdx === i ? 'var(--gold)' : 'var(--border)'};border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:0.8rem;color:${QuickReadState.replaceIdx === i ? '#1c1c1e' : 'var(--ink-light)'}">⏺</button>
          <button class="btn-action" onclick="event.stopPropagation();qrDeleteSegment(${i})" title="Delete">✕</button>
        </div>
      </div>
    `).join('');
  }
}

// QuickReadState.dragIdx — see declaration above

function qrSegDragStart(e, idx) {
  QuickReadState.dragIdx = idx;
  e.target.style.opacity = '0.5';
  e.dataTransfer.effectAllowed = 'move';
}

function qrSegDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function qrSegDrop(e, targetIdx) {
  e.preventDefault();
  if (QuickReadState.dragIdx === -1 || QuickReadState.dragIdx === targetIdx) return;
  
  // Reorder the recordings array
  const [moved] = QuickReadState.segmentRecordings.splice(QuickReadState.dragIdx, 1);
  QuickReadState.segmentRecordings.splice(targetIdx, 0, moved);
  
  // Clear combined since order changed
  QuickReadState.combinedBlob = null;
  document.getElementById('qrDownloadBtn').disabled = true;
  const waveform = document.getElementById('qrWaveform');
  if (waveform) waveform.style.display = 'none';
  
  QuickReadState.dragIdx = -1;
  qrUpdateSegmentUI();
}

function qrSegDragEnd(e) {
  e.target.style.opacity = '1';
  QuickReadState.dragIdx = -1;
}

function qrStartReplace(idx) {
  if (QuickReadState.replaceIdx === idx) {
    // Cancel replace mode
    QuickReadState.replaceIdx = -1;
    document.getElementById('qrRecordStatus').textContent = '';
  } else {
    QuickReadState.replaceIdx = idx;
    document.getElementById('qrRecordStatus').textContent = `Ready to replace segment ${idx + 1} — click Record`;
  }
  qrUpdateSegmentUI();
}

async function qrRecordToggle() {
  const btn = document.getElementById('qrRecordBtn');
  const statusEl = document.getElementById('qrRecordStatus');
  
  if (QuickReadState.recording) {
    // Stop recording
    if (QuickReadState.mediaRecorder && QuickReadState.mediaRecorder.state === 'recording') {
      QuickReadState.mediaRecorder.stop();
    }
    btn.textContent = '⏺ Record';
    btn.style.background = 'var(--red)';
    QuickReadState.recording = false;
    return;
  }
  
  // Start recording
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    QuickReadState.audioChunks = [];
    QuickReadState.mediaRecorder = new MediaRecorder(stream);
    
    QuickReadState.mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) QuickReadState.audioChunks.push(e.data);
    };
    
    QuickReadState.mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(QuickReadState.audioChunks, { type: 'audio/webm' });
      
      if (QuickReadState.replaceIdx >= 0 && QuickReadState.replaceIdx < QuickReadState.segmentRecordings.length) {
        // Replace existing segment
        QuickReadState.segmentRecordings[QuickReadState.replaceIdx] = { blob, timestamp: Date.now() };
        statusEl.textContent = `Segment ${QuickReadState.replaceIdx + 1} replaced`;
        QuickReadState.replaceIdx = -1;
      } else {
        // Add new segment
        QuickReadState.segmentRecordings.push({ blob, timestamp: Date.now() });
        statusEl.textContent = `Segment ${QuickReadState.segmentRecordings.length} saved`;
      }
      
      QuickReadState.combinedBlob = null; // Invalidate combined audio
      qrUpdateSegmentUI();
      setTimeout(() => { if (statusEl.textContent.includes('saved') || statusEl.textContent.includes('replaced')) statusEl.textContent = ''; }, 2000);
    };
    
    QuickReadState.mediaRecorder.start();
    QuickReadState.recording = true;
    btn.textContent = '⏹ Stop';
    btn.style.background = 'var(--teal)';
    
    if (QuickReadState.replaceIdx >= 0) {
      statusEl.textContent = `Recording replacement for segment ${QuickReadState.replaceIdx + 1}…`;
    } else {
      statusEl.textContent = `Recording segment ${QuickReadState.segmentRecordings.length + 1}…`;
    }
    
  } catch (e) {
    statusEl.textContent = 'Mic access denied';
  }
}

function qrPlaySegment(idx) {
  if (idx < 0 || idx >= QuickReadState.segmentRecordings.length) return;
  const audio = new Audio(URL.createObjectURL(QuickReadState.segmentRecordings[idx].blob));
  audio.play();
}

function qrDeleteSegment(idx) {
  if (idx < 0 || idx >= QuickReadState.segmentRecordings.length) return;
  QuickReadState.segmentRecordings.splice(idx, 1);
  QuickReadState.combinedBlob = null;
  QuickReadState.replaceIdx = -1;
  qrUpdateSegmentUI();
}

function qrClearSegments() {
  if (QuickReadState.segmentRecordings.length === 0) return;
  if (!confirm('Clear all recordings?')) return;
  QuickReadState.segmentRecordings = [];
  QuickReadState.combinedBlob = null;
  qrUpdateSegmentUI();
  document.getElementById('qrRecordStatus').textContent = 'Cleared';
  document.getElementById('qrWaveform').style.display = 'none';
}

async function qrPlayAllSegments() {
  if (QuickReadState.segmentRecordings.length === 0) return;
  
  let idx = 0;
  const statusEl = document.getElementById('qrRecordStatus');
  
  const playNext = () => {
    if (idx >= QuickReadState.segmentRecordings.length) {
      statusEl.textContent = 'Done';
      return;
    }
    statusEl.textContent = `Playing ${idx + 1}/${QuickReadState.segmentRecordings.length}`;
    const audio = new Audio(URL.createObjectURL(QuickReadState.segmentRecordings[idx].blob));
    audio.onended = () => { idx++; playNext(); };
    audio.play();
  };
  
  playNext();
}

async function qrCombineSegments() {
  if (QuickReadState.segmentRecordings.length === 0) return;
  
  const statusEl = document.getElementById('qrRecordStatus');
  statusEl.textContent = 'Combining...';
  
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Decode all recordings
    const audioBuffers = await Promise.all(QuickReadState.segmentRecordings.map(async (rec) => {
      const arrayBuffer = await rec.blob.arrayBuffer();
      return audioCtx.decodeAudioData(arrayBuffer);
    }));
    
    // Trim silence and combine
    const trimmedBuffers = audioBuffers.map(buf => trimSilence(buf, audioCtx));
    const totalLength = trimmedBuffers.reduce((sum, buf) => sum + buf.length, 0);
    
    const sampleRate = audioBuffers[0].sampleRate;
    const numChannels = audioBuffers[0].numberOfChannels;
    const combined = audioCtx.createBuffer(numChannels, totalLength, sampleRate);
    
    let offset = 0;
    for (const buf of trimmedBuffers) {
      for (let ch = 0; ch < numChannels; ch++) {
        combined.getChannelData(ch).set(buf.getChannelData(ch), offset);
      }
      offset += buf.length;
    }
    
    // Convert to WAV
    QuickReadState.combinedBlob = audioBufferToWav(combined);
    
    // Draw waveform
    qrDrawWaveform(QuickReadState.combinedBlob);
    
    statusEl.textContent = `Combined ${QuickReadState.segmentRecordings.length} segments`;
    document.getElementById('qrDownloadBtn').disabled = false;
    
    // Save recordings to history
    const inp = document.getElementById('qrInput');
    const text = inp ? inp.value.trim() : '';
    if (text) {
      const recordings = await qrGetRecordingsForStorage();
      qrSaveToHistory(text, recordings);
    }
    
    audioCtx.close();
  } catch (e) {
    console.error('Combine error:', e);
    statusEl.textContent = 'Combine failed';
  }
}

async function qrDrawWaveform(blob) {
  const canvas = document.getElementById('qrWaveform');
  if (!canvas) return;
  
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const data = audioBuffer.getChannelData(0);
    
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = 100;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const step = Math.ceil(data.length / canvas.width);
    const amp = canvas.height / 2;
    
    ctx.fillStyle = 'rgba(48, 213, 200, 0.6)';
    for (let i = 0; i < canvas.width; i++) {
      let min = 1.0, max = -1.0;
      for (let j = 0; j < step; j++) {
        const val = data[i * step + j] || 0;
        if (val < min) min = val;
        if (val > max) max = val;
      }
      ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
    }
    
    audioCtx.close();
  } catch (e) {
    console.error('Waveform error:', e);
  }
}

function qrDownloadCombined() {
  if (!QuickReadState.combinedBlob) return;
  
  const url = URL.createObjectURL(QuickReadState.combinedBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reading_${new Date().toISOString().slice(0,10)}.wav`;
  a.click();
  URL.revokeObjectURL(url);
}


// ── Print ─────────────────────────────────────────────────────────────────────
function qrPrintPage() {
  if (!QuickReadState.segments.length) return;

  const sep      = true; // always separate sentences for print
  const furiOn   = QuickReadState.furiOn;
  const hasKanji = w => /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/.test(w);

  // Build HTML from segments — respects current display settings
  // Each sentence goes in a <span style="display:block"> so line breaks survive printing
  let html = '';
  let currentSentence = '';

  const flushSentence = () => {
    if (currentSentence) {
      html += `<span style="display:block;margin-bottom:0.8em">${currentSentence}</span>`;
      currentSentence = '';
    }
  };

  const isCloser = w => /^[」』）】〕]+$/.test(w);
  for (let i = 0; i < QuickReadState.segments.length; i++) {
    const seg = QuickReadState.segments[i];
    const w = seg.word;
    if (!w) continue;
    if (w === '\n' || w === '\r\n' || w === '\r') {
      flushSentence();
      continue;
    }
    let token = '';
    if (furiOn && seg.reading && hasKanji(w)) {
      token = `<ruby>${w}<rp>(</rp><rt>${seg.reading}</rt><rp>)</rp></ruby>`;
    } else {
      token = w;
    }
    currentSentence += token;
    if (sep && /[。！？]$/.test(w)) {
      // Absorb any immediately-following closing bracket/quote so it stays
      // on the same line instead of starting the next one alone.
      while (i + 1 < QuickReadState.segments.length && isCloser(QuickReadState.segments[i + 1].word)) {
        i++;
        currentSentence += QuickReadState.segments[i].word;
      }
      flushSentence();
    }
  }
  flushSentence(); // flush any remaining

  if (window.printAPI && window.printAPI.htmlToPDF) {
    var style = '@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500&display=swap");'
      + 'body{font-family:"Noto Sans JP",sans-serif;font-size:14pt;line-height:2.2;color:black;background:white;padding:20mm 18mm;margin:0}'
      + 'ruby{ruby-align:center}rt{font-size:0.55em;color:#444}';
    var fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' + style + '</style></head><body><div>' + html + '</div></body></html>';
    window.printAPI.htmlToPDF(fullHtml).then(function(r) {
      if (r && r.error) alert('PDF failed: ' + r.error);
    });
  } else {
    var f = document.getElementById('qrPrintFrame');
    if (f) f.remove();
    f = document.createElement('iframe');
    f.id = 'qrPrintFrame';
    f.style.cssText = 'position:absolute;left:-9999px;width:210mm;height:297mm;border:none';
    document.body.appendChild(f);
    var doc2 = f.contentDocument || f.contentWindow.document;
    doc2.open(); doc2.write('<html><body>' + html + '</body></html>'); doc2.close();
    setTimeout(function() { try { f.contentWindow.focus(); f.contentWindow.print(); } catch(e) {} }, 600);
  }

}

const QR_SESSION_KEY = 'qrSession';

function qrSaveSession() {
  if (!QuickReadState.segments.length) return;
  try {
    Storage.setJSON(QR_SESSION_KEY, {
      segments:   QuickReadState.segments,
      text:       document.getElementById('qrInput')?.value || '',
      furiOn:     QuickReadState.furiOn,
      plainOn:    QuickReadState.plainOn,
    });
  } catch(e) {}
}

function qrRestoreSession() {
  try {
    // Don't restore session on restart — start clean
    Storage.setJSON(QR_SESSION_KEY, null);
    return;

    // Restore input text
    const inp = document.getElementById('qrInput');
    if (inp && saved.text) inp.value = saved.text;

    // Restore state
    QuickReadState.segments = saved.segments;
    QuickReadState.furiOn   = saved.furiOn ?? true;
    QuickReadState.plainOn  = saved.plainOn ?? false;

    // Restore UI
    const rw = document.getElementById('qrReaderWrap');
  const qrf = document.getElementById('qrFooterUpper'); if (qrf) qrf.style.display = 'flex';
    const pa = document.getElementById('readPasteArea');
    if (rw) rw.style.display = 'flex';
    if (pa) pa.style.display = 'none';

    const furiBtn = document.getElementById('qrFuriBtn');
    if (furiBtn) {
      furiBtn.style.display = '';
      furiBtn.classList.toggle('active', QuickReadState.furiOn);
    }

    qrRender(QuickReadState.segments);
  } catch(e) {}
}

// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, {
    qrDownloadTTS, qrSpeakRaw, qrLoadText,
    qrClear,
    qrLoadHistory,
    qrDeleteHistory,
    qrToggleSeparateSentences,
    qrToggleListenMode,
    qrListenPlay,
    qrPlayAll,
    qrPauseAll,
    qrPlayAllNext,
    qrListenPrev,
    qrListenNext,
    qrSetSpeed,
    qrRecordToggle,
    qrPlaySegment,
    qrDeleteSegment,
    qrClearSegments,
    qrPlayAllSegments,
    qrCombineSegments,
    qrDownloadCombined,
    qrPrintPage,
    qrSaveSession,
    qrRestoreSession,
  });
} catch(e) { console.error('[features-reading] App registry failed:', e); }
