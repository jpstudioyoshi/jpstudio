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
  // Sentence listening
  sentences:         [],
  sentenceIdx:       0,
  listenSpeed:       1.0,
  listenModeOpen:    false,
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

function qrShowPaste() {
  const rw = document.getElementById('qrReaderWrap');
  const pa = document.getElementById('readPasteArea');
  if (rw) rw.style.display = 'none';
  if (pa) pa.style.display = 'block';
  const fb = document.getElementById('qrFuriBtn');
  if (fb) fb.style.display = 'none';
  document.getElementById('qrStatus').textContent = '';
  QuickReadState.segments = [];
}

function qrClear() {
  // Clear input
  const inp = document.getElementById('qrInput');
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
  btn.style.color = QuickReadState.plainOn ? 'var(--teal)' : '';
  btn.style.borderColor = QuickReadState.plainOn ? 'var(--teal)' : '';
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
  btn.style.color = QuickReadState.furiOn ? 'var(--teal)' : '';
  btn.style.borderColor = QuickReadState.furiOn ? 'var(--teal)' : '';
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
    if (plainBtn) { plainBtn.classList.remove('active'); plainBtn.style.color=''; plainBtn.style.borderColor=''; }
    const furiBtn = document.getElementById('qrFuriBtn');
    furiBtn.classList.add('active');
    furiBtn.style.color = 'var(--teal)';
    furiBtn.style.borderColor = 'var(--teal)';
    qrRender(QuickReadState.segments);

    const rw = document.getElementById('qrReaderWrap');
    const pa = document.getElementById('readPasteArea');
    if (rw) rw.style.display = 'block';
    if (pa) pa.style.display = 'none';
    document.getElementById('qrFuriBtn').style.display = '';
    document.getElementById('qrStatus').textContent = '';
    
    // Save to history (without recordings initially)
    qrSaveToHistory(rawText, []);
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
  if (sepBtn) {
    sepBtn.classList.toggle('active', sep);
    sepBtn.style.color = sep ? 'var(--teal)' : '';
    sepBtn.style.borderColor = sep ? 'var(--teal)' : '';
  }

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
// ── GAME SPEECH + TTS ────────────────────────────────────────────────────

function vgSetTts(on, btn) {
  VehicleGameState.ttsOn = on;
  btn.closest('.vg-time-btns').querySelectorAll('.vg-time-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function vgSpeak() {
  const target = VehicleGameState.targets && VehicleGameState.targets[VehicleGameState.current];
  if (!target) return;
  jpSpeak(target.jp, 1.0);
}

function vgAutoSpeak() {
  if (VehicleGameState.ttsOn) {
    const target = VehicleGameState.targets && VehicleGameState.targets[VehicleGameState.current];
    if (target) setTimeout(() => jpSpeak(target.jp, 1.0), 300);
  }
}

// Vocab game uses custom stt handling

async function vgToggleMic() {
  if (VehicleGameState.sttRecording) {
    // Stop recording
    if (VehicleGameState.sttRecorder) VehicleGameState.sttRecorder.stop();
    return;
  }
  
  const btn = document.getElementById('vg-mic-btn');
  
  try {
    VehicleGameState.sttStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    VehicleGameState.sttRecorder = new MediaRecorder(VehicleGameState.sttStream);
    VehicleGameState.sttChunks = [];
    
    VehicleGameState.sttRecorder.ondataavailable = e => {
      if (e.data.size > 0) VehicleGameState.sttChunks.push(e.data);
    };
    
    VehicleGameState.sttRecorder.onstop = async () => {
      if (VehicleGameState.sttStream) {
        VehicleGameState.sttStream.getTracks().forEach(t => t.stop());
        VehicleGameState.sttStream = null;
      }
      
      if (VehicleGameState.sttChunks.length === 0) {
        vgStopMic();
        return;
      }
      
      if (btn) btn.textContent = '⏳';
      
      const audioBlob = new Blob(VehicleGameState.sttChunks, { type: 'audio/webm' });
      const transcript = await sttTranscribe(audioBlob, 'ja');
      
      if (transcript) {
        const inp = document.getElementById('vg-input');
        const target = VehicleGameState.targets && VehicleGameState.targets[VehicleGameState.current];
        
        if (inp) inp.value = transcript;
        
        // Auto-check if matches target
        if (target && transcript === target.jp) {
          vgCheck();
        }
      }
      
      vgStopMic();
    };
    
    VehicleGameState.sttRecorder.start(100);
    VehicleGameState.sttRecording = true;
    VehicleGameState.micOn = true;
    if (btn) { btn.textContent = '🔴'; btn.style.borderColor = 'var(--red)'; btn.style.color = 'var(--red)'; }
    
  } catch (e) {
    console.error('Mic error:', e);
    vgStopMic();
  }
}

function vgStopMic() {
  VehicleGameState.micOn = false;
  VehicleGameState.sttRecording = false;
  VehicleGameState.sttRecorder = null;
  const btn = document.getElementById('vg-mic-btn');
  if (btn) { btn.textContent = '🎙'; btn.style.borderColor = ''; btn.style.color = ''; }
}



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

function qrSaveToHistory(text, recordings) {
  if (!text || text.trim().length < 10) return; // Don't save very short texts
  (App.drillLastCompletedWrite || window.drillLastCompletedWrite)?.('reading');
  const history = qrLoadHistoryList();
  
  // Check if same text already exists
  const existingIdx = history.findIndex(h => h.text === text);
  if (existingIdx >= 0) {
    // Update existing entry
    history[existingIdx].timestamp = Date.now();
    history[existingIdx].recordings = recordings || [];
  } else {
    // Add new entry
    history.unshift({
      text: text,
      timestamp: Date.now(),
      recordings: recordings || []
    });
    // Keep only last 3
    while (history.length > QR_HISTORY_MAX) {
      history.pop();
    }
  }
  
  qrSaveHistoryList(history);
  qrUpdateHistoryDropdown();
}

async function qrLoadHistory(indexStr) {
  if (!indexStr && indexStr !== 0) return;
  
  const history = qrLoadHistoryList();
  const idx = parseInt(indexStr);
  if (idx < 0 || idx >= history.length) return;
  
  const item = history[idx];
  
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
  
  // Reset dropdown
  document.getElementById('qrHistorySelect').value = '';
  
  // Trigger analysis
  qrOnInput();
  qrSegment();
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
  
  if (QuickReadState.listenModeOpen) {
    panel.style.display = 'none';
    if (recordSection) recordSection.style.display = 'none';
    btn.style.borderColor = '';
    btn.style.color = '';
    QuickReadState.listenModeOpen = false;
    speechSynthesis.cancel();
    qrClearSentenceHighlight();
  } else {
    // Parse sentences from reader
    const reader = document.getElementById('qrReader');
    if (!reader) return;
    
    const clone = reader.cloneNode(true);
    clone.querySelectorAll('rt, rp').forEach(el => el.remove());
    const fullText = clone.innerText || clone.textContent || '';
    
    // Split on Japanese sentence endings and newlines
    QuickReadState.sentences = fullText.split(/(?<=[。！？\n])/g)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    if (QuickReadState.sentences.length === 0) return;
    
    QuickReadState.sentenceIdx = 0;
    panel.style.display = 'block';
    if (recordSection) recordSection.style.display = 'block';
    btn.style.borderColor = 'var(--teal)';
    btn.style.color = 'var(--teal)';
    QuickReadState.listenModeOpen = true;
    
    qrUpdateSentenceDisplay();
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
  
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
    btn.textContent = '▶';
    qrClearSentenceHighlight();
    return;
  }
  
  const sentence = QuickReadState.sentences[QuickReadState.sentenceIdx];
  if (!sentence) return;
  
  btn.textContent = '⏹';
  
  // Highlight current sentence in the main text
  qrHighlightSentence(QuickReadState.sentenceIdx);
  
  TTS.speak(sentence, QuickReadState.listenSpeed, {
    onend:   () => { btn.textContent = '▶'; qrClearSentenceHighlight(); },
    onerror: () => { btn.textContent = '▶'; qrClearSentenceHighlight(); },
  });
}

function qrHighlightSentence(sentenceIdx) {
  const reader = document.getElementById('qrReader');
  if (!reader) return;

  qrClearSentenceHighlight();

  const sentence = QuickReadState.sentences[sentenceIdx];
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

function qrListenPrev() {
  if (QuickReadState.sentenceIdx > 0) {
    speechSynthesis.cancel();
    QuickReadState.sentenceIdx--;
    qrUpdateSentenceDisplay();
    document.getElementById('qrListenPlayBtn').textContent = '▶';
  }
}

function qrListenNext() {
  if (QuickReadState.sentenceIdx < QuickReadState.sentences.length - 1) {
    speechSynthesis.cancel();
    QuickReadState.sentenceIdx++;
    qrUpdateSentenceDisplay();
    document.getElementById('qrListenPlayBtn').textContent = '▶';
  }
}

function qrSetSpeed(speed) {
  QuickReadState.listenSpeed = speed;
  
  // Update button styles
  document.querySelectorAll('.qr-speed-btn').forEach(btn => {
    const btnSpeed = parseFloat(btn.dataset.speed);
    if (btnSpeed === speed) {
      btn.style.borderColor = 'var(--teal)';
      btn.style.color = 'var(--teal)';
    } else {
      btn.style.borderColor = 'var(--border)';
      btn.style.color = 'var(--ink-light)';
    }
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
          <button class="btn-primary" onclick="event.stopPropagation();qrPlaySegment(${i})" title="Play">▶</button>
          <button onclick="event.stopPropagation();qrStartReplace(${i})" title="Re-record" style="width:28px;height:28px;background:${QuickReadState.replaceIdx === i ? 'var(--gold)' : 'var(--paper-mid)'};border:1px solid ${QuickReadState.replaceIdx === i ? 'var(--gold)' : 'var(--border)'};border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:0.8rem;color:${QuickReadState.replaceIdx === i ? '#1c1c1e' : 'var(--ink-light)'}">⏺</button>
          <button class="btn-ghost" onclick="event.stopPropagation();qrDeleteSegment(${i})" title="Delete">✕</button>
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

  const sep      = QuickReadState.separateSentences;
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

  QuickReadState.segments.forEach(seg => {
    const w = seg.word;
    if (!w) return;
    if (w === '\n' || w === '\r\n' || w === '\r') {
      flushSentence();
      return;
    }
    let token = '';
    if (furiOn && seg.reading && hasKanji(w)) {
      token = `<ruby>${w}<rp>(</rp><rt>${seg.reading}</rt><rp>)</rp></ruby>`;
    } else {
      token = w;
    }
    currentSentence += token;
    if (sep && /[。！？]$/.test(w)) {
      flushSentence();
    }
  });
  flushSentence(); // flush any remaining

  // Always recreate iframe to avoid stale content
  let f = document.getElementById('qrPrintFrame');
  if (f) f.remove();
  f = document.createElement('iframe');
  f.id = 'qrPrintFrame';
  f.style.cssText = 'position:absolute;left:-9999px;width:210mm;height:297mm;border:none';
  document.body.appendChild(f);

  const doc = f.contentDocument || f.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500&display=swap');
  body { font-family:'Noto Sans JP',sans-serif; font-size:14pt; line-height:2.2;
         color:black; background:white; padding:20mm 18mm; margin:0; }
  ruby { ruby-align:center; }
  rt   { font-size:0.55em; color:#444; }
  @media print { body { padding:15mm; } }
</style></head>
<body><div>${html}</div></body></html>`);
  doc.close();

  setTimeout(() => {
    try { f.contentWindow.focus(); f.contentWindow.print(); }
    catch(e) { console.warn('print failed:', e); }
  }, 600);
}

function addMsg(role, text) {
  // Lightweight status message — reuses existing addMessage if available
  try { addMessage(role, text); } catch(e) { console.log(text); }
}

// ── Watch: layout modes ──────────────────────────────────────────────────
// VideoState.layout → VideoState.layout
function vtFullscreen() {
  const panel = document.getElementById('panel-video');
  if (!panel) return;
  // Always enter fullscreen mode (Watch is always fullscreen now)
  if (!panel.classList.contains('vt-fullscreen')) {
    panel.classList.add('vt-fullscreen');
    document.body.style.overflow = 'hidden';
    // Blur any focused element to prevent spacebar triggering buttons
    if (document.activeElement) document.activeElement.blur();
  }
}

function vtExitFullscreen() {
  const panel = document.getElementById('panel-video');
  if (!panel) return;
  panel.classList.remove('vt-fullscreen');
  document.body.style.overflow = '';
}

// Global spacebar and Escape handler for fullscreen video mode
document.addEventListener('keydown', e => {
  const panel = document.getElementById('panel-video');
  if (!panel || !panel.classList.contains('vt-fullscreen')) return;
  
  // Escape goes back to Questions panel
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    vtExitFullscreen();
    (App.showPanel || window.showPanel)?.('questions');
    return;
  }
  
  // Check if typing in an input
  const tag = document.activeElement && document.activeElement.tagName;
  const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  if (isTyping) return;
  
  if (e.code === 'Space') {
    e.preventDefault();
    e.stopPropagation();
    vtTogglePlay();
  }
}, true); // Use capture phase to intercept before other handlers

// Also support native fullscreen API (F key triggers this)
document.addEventListener('fullscreenchange', () => {
  const panel = document.getElementById('panel-video');
  if (!panel) return;
  if (document.fullscreenElement) {
    panel.classList.add('vt-fullscreen');
  } else {
    panel.classList.remove('vt-fullscreen');
    const tc = document.getElementById('vtTranscript');
    if (tc) tc.style.height = '280px';
  }
  // Update button state
  const fsBtn = document.querySelector('#panel-video button[onclick="vtFullscreen()"]');
  if (fsBtn) {
    const isFs = panel.classList.contains('vt-fullscreen');
    fsBtn.style.color = isFs ? 'var(--teal)' : 'var(--ink-light)';
    fsBtn.style.borderColor = isFs ? 'var(--teal)' : 'var(--border)';
  }
});

// ── Watch: markers ───────────────────────────────────────────────────────
// VideoState.markers → VideoState.markers
function vtAddMarker() {
  const v = document.getElementById('vtVideo');
  if (!v) return;
  const t = v.currentTime;
  VideoState.markers.push(t);
  VideoState.markers.sort((a,b) => a - b);
  vtRenderMarkers();
  vtDrawWaveform();
}

function vtClearMarkers() {
  VideoState.markers = [];
  vtRenderMarkers();
  vtDrawWaveform();
}

function vtRenderMarkers() {
  const list = document.getElementById('vtMarkerList');
  if (!list) return;
  list.innerHTML = VideoState.markers.map((t, i) =>
    `<button class="btn-ghost" onclick="vtJumpMarker(${i})" title="Jump to ${vtFmtTime(t)}">
      ◆ ${vtFmtTime(t)}
    </button>`
  ).join('');
}

function vtJumpMarker(i) {
  const v = document.getElementById('vtVideo');
  if (v && VideoState.markers[i] !== undefined) v.currentTime = VideoState.markers[i];
}


const QR_SESSION_KEY = 'qrSession';

function qrSaveSession() {
  if (!QuickReadState.segments.length) return;
  try {
    localStorage.setItem(QR_SESSION_KEY, JSON.stringify({
      segments:   QuickReadState.segments,
      text:       document.getElementById('qrInput')?.value || '',
      furiOn:     QuickReadState.furiOn,
      plainOn:    QuickReadState.plainOn,
    }));
  } catch(e) {}
}

function qrRestoreSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(QR_SESSION_KEY) || 'null');
    if (!saved || !saved.segments?.length) return;

    // Restore input text
    const inp = document.getElementById('qrInput');
    if (inp && saved.text) inp.value = saved.text;

    // Restore state
    QuickReadState.segments = saved.segments;
    QuickReadState.furiOn   = saved.furiOn ?? true;
    QuickReadState.plainOn  = saved.plainOn ?? false;

    // Restore UI
    const rw = document.getElementById('qrReaderWrap');
    const pa = document.getElementById('readPasteArea');
    if (rw) rw.style.display = 'block';
    if (pa) pa.style.display = 'none';

    const furiBtn = document.getElementById('qrFuriBtn');
    if (furiBtn) {
      furiBtn.style.display = '';
      furiBtn.classList.toggle('active', QuickReadState.furiOn);
      furiBtn.style.color = QuickReadState.furiOn ? 'var(--teal)' : '';
    }

    qrRender(QuickReadState.segments);
  } catch(e) {}
}

// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, {
    qrSpeakRaw,
    qrClear,
    qrLoadHistory,
    qrDeleteHistory,
    qrToggleSeparateSentences,
    qrToggleListenMode,
    qrListenPlay,
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
