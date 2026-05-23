// ╔══════════════════════════════════════════════════════════════════════════════
// ║ core-stt.js
// ║ Speech-to-text (Whisper API wrapper), inline STT state.
// ║ Depends on: core-foundation.js (Storage, STORAGE_KEYS, claudeAPI, getApiKey)
// ╚══════════════════════════════════════════════════════════════════════════════

// ── WHISPER-BASED SPEECH TO TEXT ─────────────────────────────────────────────
// ── Speech-to-text (inline STT) state ────────────────────────────────────────
const SttState = {
  recording:     false,
  mediaRecorder: null,
  audioChunks:   [],
  stream:        null,
  targetInputId: null,
  buttonId:      null,
  lang:          'ja',
  // Mic test / settings
  selectedMicId: Storage.get(STORAGE_KEYS.SELECTED_MIC) || '',
  testStream:    null,
  testAnalyser:  null,
  testAnimFrame: null,
};

async function sttStart(targetInputId, buttonId, lang = 'ja') {
  
  const btn = document.getElementById(buttonId);
  const input = document.getElementById(targetInputId);
  if (!btn || !input) {
    console.error('Button or input not found:', buttonId, targetInputId);
    return;
  }
  
  // If already recording, stop
  if (SttState.recording) {
    sttStop();
    return;
  }
  
  // Pause listen audio if playing
  const listenAudio = document.getElementById('listenAudio');
  if (listenAudio && !listenAudio.paused) {
    listenAudio.pause();
    if (typeof listenPlaying !== 'undefined') {
      listenPlaying = false;
      if (typeof updatePlayBtn === 'function') updatePlayBtn();
    }
  }
  
  // Store targets for onstop handler
  SttState.targetInputId = targetInputId;
  SttState.buttonId = buttonId;
  SttState.lang = lang;
  
  try {
    const micId = Storage.get(STORAGE_KEYS.SELECTED_MIC);
    const constraints = { audio: micId ? { deviceId: { exact: micId } } : true };
    SttState.stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    SttState.mediaRecorder = new MediaRecorder(SttState.stream);
    SttState.audioChunks = [];
    
    SttState.mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) SttState.audioChunks.push(e.data);
    };
    
    SttState.mediaRecorder.onstop = async () => {
      
      // Stop the stream
      if (SttState.stream) {
        SttState.stream.getTracks().forEach(t => t.stop());
        SttState.stream = null;
      }
      
      const btn = document.getElementById(SttState.buttonId);
      const input = document.getElementById(SttState.targetInputId);
      
      if (SttState.audioChunks.length === 0) {
        if (btn) { btn.textContent = '🎙'; btn.classList.remove('listening'); }
        SttState.recording = false;
        return;
      }
      
      if (btn) btn.textContent = '⏳';
      
      const audioBlob = new Blob(SttState.audioChunks, { type: 'audio/webm' });
      
      // Transcribe via OpenAI Whisper
      const transcript = await sttTranscribe(audioBlob, SttState.lang);
      
      if (transcript && input) {
        const currentVal = input.value;
        input.value = currentVal + (currentVal ? ' ' : '') + transcript;
        input.focus();
      }
      
      if (btn) { btn.textContent = '🎙'; btn.classList.remove('listening'); }
      SttState.recording = false;
    };
    
    SttState.mediaRecorder.start(100); // Collect data every 100ms
    SttState.recording = true;
    btn.textContent = '🔴';
    btn.classList.add('listening');
    
  } catch (e) {
    console.error('Microphone access error:', e);
    alert('Could not access microphone. Please allow microphone access.');
    btn.textContent = '🎙';
    btn.classList.remove('listening');
    SttState.recording = false;
  }
}

function sttStop() {
  if (SttState.mediaRecorder && SttState.recording) {
    SttState.mediaRecorder.stop();
  }
}

async function sttTranscribe(audioBlob, lang = 'ja') {
  // Use OpenAI Whisper API for transcription
  const openaiKey = getOpenAIKey();
  
  if (!openaiKey) {
    console.error('No OpenAI API key found');
    // Show in-place message instead of alert
    const btn = document.getElementById(SttState.buttonId);
    if (btn) {
      btn.textContent = '❌';
      btn.title = 'OpenAI API key required for speech input. Add it in Settings.';
      setTimeout(() => { btn.textContent = '🎙'; btn.title = 'Speech input'; }, 2000);
    }
    return null;
  }
  
  try {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', lang);
    
    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`
      },
      body: formData
    });
    
    if (!resp.ok) {
      const err = await resp.text();
      console.error('Whisper error:', err);
      const btn = document.getElementById(SttState.buttonId);
      if (btn) {
        btn.textContent = '❌';
        setTimeout(() => { btn.textContent = '🎙'; }, 2000);
      }
      return null;
    }
    
    return data.text?.trim() || null;
    
  } catch (e) {
    console.error('STT error:', e);
    const btn = document.getElementById(SttState.buttonId);
    if (btn) {
      btn.textContent = '❌';
      setTimeout(() => { btn.textContent = '🎙'; }, 2000);
    }
    return null;
  }
}


// ═══════════════════════════════════════════════════════
// MICROPHONE SETTINGS
// ═══════════════════════════════════════════════════════


async function refreshMicrophones() {
  const select = document.getElementById('micSelect');
  const status = document.getElementById('micStatus');
  if (!select) return;
  
  try {
    // Request permission first (needed to get device labels)
    await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === 'audioinput');
    
    select.innerHTML = '<option value="">Default microphone</option>';
    mics.forEach(mic => {
      const opt = document.createElement('option');
      opt.value = mic.deviceId;
      opt.textContent = mic.label || `Microphone ${mic.deviceId.slice(0, 8)}...`;
      if (mic.deviceId === SttState.selectedMicId) opt.selected = true;
      select.appendChild(opt);
    });
    
    if (status) status.textContent = `${mics.length} microphone${mics.length !== 1 ? 's' : ''} found`;
  } catch (e) {
    console.error('Mic enumeration error:', e);
    if (status) status.textContent = 'Could not access microphones. Check permissions.';
  }
}

function setMicrophone(deviceId) {
  SttState.selectedMicId = deviceId;
  Storage.set(STORAGE_KEYS.SELECTED_MIC, deviceId);
  const status = document.getElementById('micStatus');
  if (status) status.textContent = deviceId ? 'Microphone selected' : 'Using default microphone';
}

async function testMicrophone() {
  const btn = document.getElementById('micTestBtn');
  const levelWrap = document.getElementById('micLevel');
  const levelBar = document.getElementById('micLevelBar');
  const status = document.getElementById('micStatus');
  
  // If already testing, stop
  if (SttState.testStream) {
    stopMicTest();
    return;
  }
  
  try {
    const constraints = { audio: SttState.selectedMicId ? { deviceId: { exact: SttState.selectedMicId } } : true };
    SttState.testStream = await navigator.mediaDevices.getUserMedia(constraints);
    
    // Set up analyser for level meter
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(SttState.testStream);
    SttState.testAnalyser = audioCtx.createAnalyser();
    SttState.testAnalyser.fftSize = 256;
    source.connect(SttState.testAnalyser);
    
    if (btn) { btn.textContent = '🔴 Stop'; btn.style.borderColor = 'var(--red)'; btn.style.color = 'var(--red)'; }
    if (levelWrap) levelWrap.style.display = 'block';
    if (status) status.textContent = 'Speak to test your microphone...';
    
    // Animate level meter
    const dataArray = new Uint8Array(SttState.testAnalyser.frequencyBinCount);
    function updateLevel() {
      if (!SttState.testAnalyser) return;
      SttState.testAnalyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      const level = Math.min(100, (avg / 128) * 100);
      if (levelBar) levelBar.style.width = level + '%';
      SttState.testAnimFrame = requestAnimationFrame(updateLevel);
    }
    updateLevel();
    
    // Auto-stop after 10 seconds
    setTimeout(() => {
      if (SttState.testStream) stopMicTest();
    }, 10000);
    
  } catch (e) {
    console.error('Mic test error:', e);
    if (status) status.textContent = 'Could not access microphone: ' + e.message;
  }
}

function stopMicTest() {
  if (SttState.testStream) {
    SttState.testStream.getTracks().forEach(t => t.stop());
    SttState.testStream = null;
  }
  if (SttState.testAnimFrame) {
    cancelAnimationFrame(SttState.testAnimFrame);
    SttState.testAnimFrame = null;
  }
  SttState.testAnalyser = null;
  
  const btn = document.getElementById('micTestBtn');
  const levelWrap = document.getElementById('micLevel');
  const status = document.getElementById('micStatus');
  
  if (btn) { btn.textContent = '🎙 Test'; btn.style.borderColor = ''; btn.style.color = ''; }
  if (levelWrap) levelWrap.style.display = 'none';
  if (status) status.textContent = 'Test complete';
}

// Wrapper for writing panel
function startWritingSpeech() {
  sttStart('writingInput', 'writingSpeechBtn', 'ja');
}

// ═══════════════════════════════════════════════════════
// TRANSLATE
// ═══════════════════════════════════════════════════════

function detectJapanese(text) {
  return /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\uff00-\uffef]/.test(text);
}

function handleTransKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doTranslate(); }
}

function clearTranslate() {
  const sp = document.getElementById('transSpellingInline');
  if (sp) sp.style.display = 'none';
  document.getElementById('transInput').value = '';
  const out = document.getElementById('transOutput');
  out.className = 'trans-output empty';
  out.textContent = 'Click here to translate…';
  const addVocabBtn = document.getElementById('transAddVocabBtn');
  const outputBtnRow = document.getElementById('transOutputBtnRow');
  if (addVocabBtn) addVocabBtn.style.display = 'none';
  if (outputBtnRow) outputBtnRow.style.display = 'none';
  ['transBdReading','transBdBreakdown','transBdGrammar','transBdLevel','transBdAlt'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'trans-breakdown-body empty';
    el.textContent = 'Translate something to see this';
    el.style.display = i === 0 ? 'block' : 'none';
  });
  document.querySelectorAll('.trans-breakdown-tab').forEach((b, i) => b.classList.toggle('active', i === 0));
}

// AppState.transKanaOn — see declaration below

function setTransMode(mode) {
  kanaSetMode('transInput', mode, 'transInputKana', {romaji:'transInputRomajiBtn', hira:'transInputHiraBtn', kata:'transInputKataBtn'});
  // Kanji key handler only needed in hiragana mode
  const inp = document.getElementById('transInput');
  if (inp) {
    inp.removeEventListener('keydown', _transKanjiKeyHandler);
    if (mode === 'hiragana') inp.addEventListener('keydown', _transKanjiKeyHandler);
  }
}

// Legacy toggle kept for any remaining onclick refs
function toggleTransKana() {
  const inp = document.getElementById('transInput');
  const mode = inp?._kanaOn ? 'romaji' : 'hiragana';
  setTransMode(mode);
}

function toggleTransKana() {
  const inp = document.getElementById('transInput');
  const romajiBtn = document.getElementById('transModeBtnRomaji');
  const kanaBtn = document.getElementById('transModeBtnKana');
  if (!inp) return;

  // Deactivate romaji button
  romajiBtn.style.color = '';
  romajiBtn.style.borderColor = '';
  
  // Toggle between hiragana and katakana
  const nextMode = (!inp._kanaOn || inp._KanaDrillState.mode === 'katakana') ? 'hiragana' : 'katakana';
  kanaSetMode('transInput', nextMode, 'transInputKana', {romaji:'transInputRomajiBtn', hira:'transInputHiraBtn', kata:'transInputKataBtn'});
  if (nextMode === 'hiragana') inp.addEventListener('keydown', _transKanjiKeyHandler);
  inp.focus();
}

function _transKanjiKeyHandler(e) {
  if (e.key === '+') {
    e.preventDefault();
    transDoKanjiConvert();
  }
}

async function doTranslate() {
  const text = document.getElementById('transInput').value.trim();
  if (!text) return;
  if (!getApiKey()) {
    document.getElementById('transOutput').textContent = 'Please enter your Anthropic API key using the ⚙ API button.';
    document.getElementById('transOutput').className = 'trans-output';
    return;
  }
  const isJapanese = detectJapanese(text);
  const outEl = document.getElementById('transOutput');
  outEl.textContent = 'Translating…';
  outEl.className = 'trans-output loading-pulse';
  const _tsb = document.getElementById('transSubmitBtn'); if(_tsb) _tsb.disabled = true;

  const prompt = isJapanese
    ? `Translate this Japanese text to English. Respond ONLY in JSON (no markdown):
{"translation":"English translation","kanji_info":"For each kanji in the input list it with: kanji — reading — meaning. If no kanji exist write 'No kanji in this text.'","reading":"Full hiragana reading of the Japanese (with spaces between words)","breakdown":"Word-by-word breakdown, one entry per line in format: word — reading — meaning — part of speech","grammar_notes":["Explain each grammar point used, e.g. particle usage, verb form, sentence pattern"],"level_note":"JLPT level estimate (N5/N4/N3/etc) with brief explanation of what makes it that level, and what a learner should study to understand it fully","spelling_suggestions":"If any words appear misspelled or non-standard, list them as: incorrect → correct — explanation. If everything looks correct write 'No issues found.'","alternatives":["2-3 alternative English translations that capture different nuances or registers of the Japanese original. Each as a plain string."]}
Japanese text: "${text}"`
    : `Translate this English text to natural Japanese suitable for N5-N4 learner. Respond ONLY in JSON (no markdown):
{"translation":"Japanese translation","kanji_info":"For each kanji used in the Japanese translation list: kanji — reading — meaning. If no kanji used write 'No kanji used.'","reading":"Full hiragana reading of the Japanese translation (with spaces between words)","breakdown":"Word-by-word breakdown of the Japanese, one entry per line: word — reading — meaning — part of speech","grammar_notes":["Explain each grammar point used in the Japanese translation, e.g. particle choices, verb form, politeness level"],"level_note":"JLPT level estimate of the Japanese output (N5/N4/N3/etc) with brief explanation and study suggestions","spelling_suggestions":"If any words in the input appear misspelled or non-standard, list them as: incorrect → correct — explanation. If everything looks correct write 'No issues found.'","alternatives":["2-3 alternative Japanese translations with different nuance, formality, or vocabulary. Each as a plain string with brief note in parentheses e.g. (more formal) (casual) (literary)."]}
English text: "${text}"`;

  try {
    const data = await claudeAPI({
      max_tokens: 1200,
      messages: [{role: 'user', content: prompt}],
      track: 'translate'
    });
    
    if (data.error) {
      console.error('API error:', data.error);
      outEl.textContent = 'API Error: ' + (data.error.message || 'Unknown error');
      outEl.className = 'trans-output';
      const _tsb = document.getElementById('transSubmitBtn'); if(_tsb) _tsb.disabled = false;
      return;
    }
    
    const raw = data.content?.[0]?.text || '{}';
    
    let parsed;
    try { 
      parsed = JSON.parse(raw.replace(/```json|```/g,'').trim()); 
    }
    catch(e) { 
      console.error('JSON parse error:', e, 'Raw:', raw);
      parsed = {translation: 'Parse error — please try again. Check console for details.'}; 
    }

    transLastParsed = parsed;
    outEl.classList.remove('loading-pulse');
    outEl.textContent = parsed.translation || '—';
    outEl.className = 'trans-output';
    const addVocabBtn = document.getElementById('transAddVocabBtn');
    const outputBtnRow = document.getElementById('transOutputBtnRow');
    if (addVocabBtn) addVocabBtn.style.display = 'inline-block';
    if (outputBtnRow) outputBtnRow.style.display = 'flex';
    // Record kanji from the input text for the corpus
    kanjiCorpusRecordLookup(text, text.slice(0, 40));

    const fillTab = (id, val, formatter) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (!val || (Array.isArray(val) && !val.length)) {
        el.textContent = '—'; el.className = 'trans-breakdown-body empty'; return;
      }
      el.className = 'trans-breakdown-body';
      el.innerHTML = formatter ? formatter(val) : escBdHtml(String(val));
    };

    fillTab('transBdReading', parsed.reading, v =>
      `<div style="font-family:var(--jp);font-size:1rem;line-height:2;letter-spacing:0.05em">${escBdHtml(v)}</div>`
    );
    fillTab('transBdBreakdown', parsed.breakdown, v =>
      v.split('\n').filter(l=>l.trim()).map(line => {
        const parts = line.split('—').map(p=>p.trim());
        const word = parts[0]||'';
        return `<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 16px;padding:5px 0;border-bottom:1px solid var(--border);align-items:center">
          <span style="font-family:var(--jp);font-size:1rem;min-width:60px;cursor:pointer;display:flex;align-items:center;gap:5px" onclick="jpSpeak('${word.replace(/'/g,"\'")}',0.85)" title="Hear pronunciation">${escBdHtml(word)}<span style="font-size:0.6rem;color:var(--ink-light)">🔊</span></span>
          <span style="font-family:var(--ui);font-size:0.9rem;color:var(--ink-light)">${escBdHtml(parts.slice(1).join(' — '))}</span>
        </div>`;
      }).join('')
    );
    fillTab('transBdGrammar', parsed.grammar_notes, v => {
      const notes = Array.isArray(v) ? v : [v];
      return notes.map(n => `<div style="padding:6px 0 6px 12px;border-left:2px solid var(--teal);margin-bottom:8px;font-family:var(--ui);font-size:0.9rem;line-height:1.6">${escBdHtml(n)}</div>`).join('');
    });
    // Auto-show spelling tab if issues found, otherwise keep current tab
    const spellingHasIssues = parsed.spelling_suggestions && !parsed.spelling_suggestions.includes('No issues');
    if (spellingHasIssues) {
      // Show spelling inline below the translation output, always visible
      const spellingInline = document.getElementById('transSpellingInline');
      if (spellingInline) {
        spellingInline.style.display = 'block';
        document.getElementById('transSpellingInlineBody').innerHTML = (() => {
          const v = parsed.spelling_suggestions;
          return v.split('\n').filter(l=>l.trim()).map(line => {
            const parts = line.split('→').map(p=>p.trim());
            if (parts.length < 2) return `<div style="font-family:var(--ui);font-size:0.83rem;padding:4px 0">${escBdHtml(line)}</div>`;
            const [wrong, rest] = parts;
            const [correct, ...expl] = (rest||'').split('—').map(p=>p.trim());
            return `<div style="font-family:var(--ui);font-size:0.83rem;padding:4px 0"><span style="color:var(--red);text-decoration:line-through">${escBdHtml(wrong)}</span> → <span style="color:var(--sage)">${escBdHtml(correct)}</span>${expl.length ? `<span style="color:var(--ink-light);margin-left:6px">${escBdHtml(expl.join(' '))}</span>` : ''}</div>`;
          }).join('');
        })();
      }
    } else {
      const spellingInline = document.getElementById('transSpellingInline');
      if (spellingInline) spellingInline.style.display = 'none';
    }

    fillTab('transBdSpelling', parsed.spelling_suggestions, v => {
      if (v.includes('No issues')) return `<div style="font-family:var(--ui);font-size:0.85rem;color:var(--sage);padding:8px 0">✓ ${escBdHtml(v)}</div>`;
      return v.split('\n').filter(l=>l.trim()).map(line => {
        const parts = line.split('→').map(p=>p.trim());
        if (parts.length < 2) return `<div style="font-family:var(--ui);font-size:0.85rem;padding:6px 0">${escBdHtml(line)}</div>`;
        const [wrong, rest] = parts;
        const [correct, ...expl] = (rest||'').split('—').map(p=>p.trim());
        return `<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:4px 10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)">
          <span style="font-family:var(--jp);color:var(--red);text-decoration:line-through">${escBdHtml(wrong)}</span>
          <span style="color:var(--ink-light)">→</span>
          <span style="font-family:var(--jp);color:var(--sage)">${escBdHtml(correct)}<span style="font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-left:8px">${escBdHtml(expl.join(' '))}</span></span>
        </div>`;
      }).join('');
    });
    fillTab('transBdLevel', parsed.level_note, v =>
      `<div style="font-family:var(--ui);font-size:0.87rem;line-height:1.7">${escBdHtml(v)}</div>`
    );
    fillTab('transBdAlt', parsed.alternatives, v => {
      const alts = Array.isArray(v) ? v : (typeof v === 'string' ? v.split('\n').filter(l=>l.trim()) : []);
      return alts.map((a, i) => `<div style="display:flex;gap:12px;align-items:baseline;padding:8px 0;border-bottom:1px solid var(--border)">
        <span style="font-family:var(--ui);font-size:0.68rem;color:var(--ink-light);min-width:1.2rem">${i+1}</span>
        <span style="font-family:var(--jp);font-size:0.97rem;line-height:1.7">${escBdHtml(a)}</span>
      </div>`).join('');
    });

    transHistory.unshift({
      src: text, 
      tgt: parsed.translation || '—', 
      isJp: isJapanese,
      time: new Date().toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'}),
      reading: parsed.reading || '',
      breakdown: parsed.breakdown || '',
      grammar: parsed.grammar_notes || [],
      level: parsed.level_note || '',
      starred: false
    });
    renderTransHistory();
  } catch(e) {
    console.error('Translation error:', e);
    outEl.classList.remove('loading-pulse');
    outEl.textContent = 'Error: ' + e.message;
    outEl.className = 'trans-output';
  }
  const _tsb2 = document.getElementById('transSubmitBtn'); if(_tsb2) _tsb2.disabled = false;
}

function escBdHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

function showBdTab(btn, tabId) {
  document.querySelectorAll('.trans-breakdown-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.trans-breakdown-body').forEach(b => b.style.display = 'none');
  btn.classList.add('active');
  const el = document.getElementById(tabId);
  if (el) el.style.display = 'block';
}

function transShowHistory() {
  // Click the session tab to show it
  const sessionTab = document.getElementById('transSessionTab');
  if (sessionTab) {
    showBdTab(sessionTab, 'transBdSession');
    sessionTab.classList.add('active');
  }
  // Scroll to the breakdown area
  const breakdown = document.querySelector('.trans-breakdown');
  if (breakdown) breakdown.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

window['transShowHistory'] = transShowHistory;

function renderTransHistory() {
  const el = document.getElementById('transSessionList');
  const countEl = document.getElementById('transSessionCount');
  const emptyEl = document.getElementById('transSessionEmpty');
  const actionsEl = document.getElementById('transSessionActions');
  const tabEl = document.getElementById('transSessionTab');
  
  if (!el) return;
  
  const count = transHistory.length;
  if (countEl) countEl.textContent = count > 0 ? `(${count})` : '';
  if (emptyEl) emptyEl.style.display = count === 0 ? 'block' : 'none';
  if (actionsEl) actionsEl.style.display = count > 0 ? 'flex' : 'none';
  
  // Highlight tab if there are items
  if (tabEl && count > 0) {
    tabEl.style.borderColor = 'var(--gold)';
    tabEl.style.color = 'var(--gold)';
  }
  
  el.innerHTML = transHistory.map((h, i) => `
    <div class="trans-session-item" style="padding:10px 12px;background:var(--paper);border:1px solid ${h.starred ? 'var(--gold)' : 'var(--border)'};border-radius:6px;margin-bottom:8px">
      <div style="display:flex;gap:10px;align-items:flex-start">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
            <span class="trans-session-jp" style="font-family:var(--jp);font-size:0.95rem;color:var(--ink);cursor:pointer" onclick="loadTransHistory(${i})" title="Click to reload">${escBdHtml(h.src)}</span>
            ${h.reading ? `<span style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light)">${escBdHtml(h.reading)}</span>` : ''}
          </div>
          <div style="font-family:var(--ui);font-size:0.85rem;color:var(--ink-light);margin-bottom:4px">${escBdHtml(h.tgt)}</div>
          ${h.notes ? `<div style="font-family:var(--ui);font-size:0.78rem;color:var(--teal);font-style:italic;margin-top:4px">📝 ${escBdHtml(h.notes)}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0">
          <span style="font-family:var(--ui);font-size:0.65rem;color:var(--ink-light)">${h.time || ''}</span>
          <button class="btn-icon" onclick="transToggleStar(${i})" title="${h.starred ? 'Unmark' : 'Mark for review'}">${h.starred ? '⭐' : '☆'}</button>
          <button class="btn-icon" onclick="transSpeakHistoryItem(${i})" title="Speak">🔊</button>
          <button class="btn-icon" onclick="transEditHistoryItem(${i})" title="Add note">✏️</button>
          <button class="btn-icon" onclick="transDeleteHistoryItem(${i})" title="Remove">✕</button>
        </div>
      </div>
    </div>
  `).join('');
}

function loadTransHistory(i) {
  const h = transHistory[i];
  if (!h) return;
  document.getElementById('transInput').value = h.src;
  document.getElementById('transOutput').textContent = h.tgt;
  document.getElementById('transOutput').className = 'trans-output';
  
  // Also populate breakdown tabs if we have the data
  if (h.reading) {
    const readEl = document.getElementById('transBdReading');
    if (readEl) {
      readEl.innerHTML = `<div style="font-family:var(--jp);font-size:1rem;line-height:2;letter-spacing:0.05em">${escBdHtml(h.reading)}</div>`;
      readEl.className = 'trans-breakdown-body';
    }
  }
  if (h.breakdown) {
    const bdEl = document.getElementById('transBdBreakdown');
    if (bdEl) {
      bdEl.innerHTML = h.breakdown.split('\n').filter(l=>l.trim()).map(line => {
        const parts = line.split('—').map(p=>p.trim());
        const word = parts[0]||'';
        return `<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 16px;padding:5px 0;border-bottom:1px solid var(--border);align-items:center">
          <span style="font-family:var(--jp);font-size:1rem;min-width:60px;cursor:pointer;display:flex;align-items:center;gap:5px" onclick="jpSpeak('${word.replace(/'/g,"\\'")}',0.85)" title="Hear pronunciation">${escBdHtml(word)}<span style="font-size:0.6rem;color:var(--ink-light)">🔊</span></span>
          <span style="font-family:var(--ui);font-size:0.9rem;color:var(--ink-light)">${escBdHtml(parts.slice(1).join(' — '))}</span>
        </div>`;
      }).join('');
      bdEl.className = 'trans-breakdown-body';
    }
  }
  if (h.grammar && h.grammar.length) {
    const gramEl = document.getElementById('transBdGrammar');
    if (gramEl) {
      const notes = Array.isArray(h.grammar) ? h.grammar : [h.grammar];
      gramEl.innerHTML = notes.map(n => `<div style="padding:6px 0 6px 12px;border-left:2px solid var(--teal);margin-bottom:8px;font-family:var(--ui);font-size:0.9rem;line-height:1.6">${escBdHtml(n)}</div>`).join('');
      gramEl.className = 'trans-breakdown-body';
    }
  }
  if (h.level) {
    const lvlEl = document.getElementById('transBdLevel');
    if (lvlEl) {
      lvlEl.textContent = h.level;
      lvlEl.className = 'trans-breakdown-body';
    }
  }
  
  // Show output buttons
  const outputBtnRow = document.getElementById('transOutputBtnRow');
  if (outputBtnRow) outputBtnRow.style.display = 'flex';
}

function transToggleStar(i) {
  if (transHistory[i]) {
    transHistory[i].starred = !transHistory[i].starred;
    renderTransHistory();
  }
}

function transSpeakHistoryItem(i) {
  const h = transHistory[i];
  if (!h) return;
  // Speak the Japanese side
  const textToSpeak = h.isJp ? h.src : h.tgt;
  jpSpeak(textToSpeak, 0.85);
}

function transDeleteHistoryItem(i) {
  if (i >= 0 && i < transHistory.length) {
    transHistory.splice(i, 1);
    renderTransHistory();
  }
}

function transEditHistoryItem(i) {
  const h = transHistory[i];
  if (!h) return;
  
  const currentNote = h.notes || '';
  const note = prompt('Add a note for this item:', currentNote);
  
  if (note !== null) {
    transHistory[i].notes = note.trim();
    renderTransHistory();
  }
}

function transClearHistory() {
  if (transHistory.length === 0) return;
  if (!confirm('Clear all session lookups?')) return;
  transHistory = [];
  renderTransHistory();
}

function transExportHistory() {
  if (transHistory.length === 0) {
    alert('No lookups to export');
    return;
  }
  
  // Build export text
  let text = `# Translation Session - ${new Date().toLocaleDateString()}\n\n`;
  
  // Starred items first
  const starred = transHistory.filter(h => h.starred);
  const unstarred = transHistory.filter(h => !h.starred);
  
  if (starred.length > 0) {
    text += `## ⭐ Marked for Review (${starred.length})\n\n`;
    starred.forEach(h => {
      text += `### ${h.src}\n`;
      text += `**Translation:** ${h.tgt}\n`;
      if (h.reading) text += `**Reading:** ${h.reading}\n`;
      if (h.notes) text += `**Note:** ${h.notes}\n`;
      if (h.level) text += `**Level:** ${h.level}\n`;
      if (h.breakdown) text += `**Breakdown:**\n${h.breakdown}\n`;
      if (h.grammar && h.grammar.length) text += `**Grammar:**\n${h.grammar.join('\n')}\n`;
      text += '\n---\n\n';
    });
  }
  
  if (unstarred.length > 0) {
    text += `## Other Lookups (${unstarred.length})\n\n`;
    unstarred.forEach(h => {
      text += `- **${h.src}** → ${h.tgt}`;
      if (h.reading) text += ` (${h.reading})`;
      if (h.notes) text += ` — _${h.notes}_`;
      text += '\n';
    });
  }
  
  // Copy to clipboard
  navigator.clipboard.writeText(text).then(() => {
    alert('Session notes copied to clipboard!');
  }).catch(() => {
    // Fallback: download as file
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `translate_session_${new Date().toISOString().slice(0,10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

let transSpeechRec = null;
function startTransSpeech() {
  // Detect language from existing input
  const currentText = document.getElementById('transInput')?.value || '';
  const lang = detectJapanese(currentText) ? 'ja' : 'en';
  sttStart('transInput', 'transSpeechBtn', lang);
}

// ═══════════════════════════════════════════════════════
// COUNTERS DRILL
// ═══════════════════════════════════════════════════════

// Maps drill form/polarity/register combos to grammar node ids

const CONJ_TO_GRAMMAR_NODE = {
  // Polite present (ます)
  'present_pos_polite':   'present_tense_masu',
  'present_neg_polite':   'present_tense_masu',
  // Polite past (ました)
  'past_pos_polite':      'past_tense_masu',
  'past_neg_polite':      'past_tense_masu',
  // Plain present (dictionary / ない)
  'present_pos_plain':    'short_forms_plain',
  'present_neg_plain':    'short_forms_plain',
  // Plain past
  'past_pos_plain':       'short_form_past',
  'past_neg_plain':       'short_form_past',
  // て-form
  'te_pos_plain':         'te_form',
  'te_pos_polite':        'te_form',
  // Volitional (ましょう)
  'volitional_pos_polite':'masho',
  'volitional_pos_plain': 'short_forms_plain',
};

function _conjRecordGrammarEvidence(item, correct, levClass) {
  try {
    if (typeof GrammarModel === 'undefined' || !GrammarModel.loaded) return;
    const key = `${item.form}_${item.pol}_${item.reg}`;
    const nodeId = CONJ_TO_GRAMMAR_NODE[key];
    if (!nodeId) return;
    if (GrammarModel.isOverridden(nodeId)) return;
    // Register confusion is a reading slip — do not penalise the grammar node
    if (levClass && levClass.isRegisterConfusion) return;
    const current = GrammarModel.getScore(nodeId);
    const nudge = correct ? 0.05 : -0.08;
    const newScore = Math.max(0, Math.min(0.95, current + nudge));
    GrammarModel.recordEvidence(nodeId, 'conjugation_drill', newScore,
      `${item.form}/${item.pol}/${item.reg} ${correct ? '✓' : '✗'}`
    ).catch(() => {});
  } catch(e) {}
}

function toHiragana(str) {
  // Convert romaji-entered katakana or katakana to hiragana for comparison
  return str.replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}
function checkConj() {
  const input = document.getElementById('conjInput');
  const val = input.value.trim();
  if (!val) return;
  const item = conjCurrentAnswer;
  const ansHira = toHiragana(item.answer);
  const valHira = toHiragana(val);
  const correct = valHira === ansHira;
  if (!conjRevealed) {
    conjRevealed = true;
    const _conjId = `${item.word.dict}_${item.form}_${item.pol}_${item.reg}`;
    DrillSRS.record(STORAGE_KEYS.DRILL_SRS_CONJ, _conjId, correct);
    if (correct) { conjOk++; conjResults[conjIdx] = 'ok'; }
    else { conjMiss++; conjResults[conjIdx] = 'miss'; }
    // Grammar evidence hook
    _conjRecordGrammarEvidence(item, correct, null);
  }
  input.className = 'conj-input ' + (correct ? 'correct' : 'wrong');
  const fb = document.getElementById('conjFeedback');
  fb.className = 'conj-feedback show' + (correct ? '' : ' wrong-fb');
  fb.innerHTML = `<div class="conj-answer-reveal">${correct ? '✓ ' : '✕ correct: '} ${item.answer}</div>`;
  if (correct) {
    DrillFlow.correct(() => advanceConj());
  } else {
    DrillFlow.wrong(() => advanceConj());
  }
  if (correct) setTimeout(() => advanceConj(), 700);
}

function advanceConj() {
  if (DrillFlow._advancing) return;
  DrillFlow.reset();
  if (!conjRevealed) {
    conjResults[conjIdx] = 'miss';
    conjMiss++;
    if (conjCurrentAnswer) {
      const _conjId = `${conjCurrentAnswer.word.dict}_${conjCurrentAnswer.form}_${conjCurrentAnswer.pol}_${conjCurrentAnswer.reg}`;
      DrillSRS.record(STORAGE_KEYS.DRILL_SRS_CONJ, _conjId, false);
    }
  }
  DrillFlow.reset();
  conjIdx++; conjRevealed = false; renderConjDrill();
}

// ═══════════════════════════════════════════════════════
// LISTENING
// ═══════════════════════════════════════════════════════
let listenTracks = [];
let listenCurrentIdx = -1;
let listenAbA = null, listenAbB = null, listenAbLooping = false;
let listenLoopPauseSecs = 0;
