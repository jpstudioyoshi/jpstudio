// ═══════════════════════════════════════════════════════
// FEATURES-CUSTOM-DRILL
// Document-based sentence drill for the custom tab.
// Three views: list → editor → drill
//
// Storage: kv_store via window.db, keys = 'custom_drill:{timestamp}'
// Load order: after features-voice-drill.js
// ═══════════════════════════════════════════════════════

// ── State ────────────────────────────────────────────────
const CDState = {
  docs:        [],      // all loaded doc metadata
  current:     null,   // doc being edited or drilled
  drillPairs:  [],     // [{jp, en}] for current drill session
  drillPos:    0,
  drillMode:   'en-prompt',  // 'en-prompt' | 'hear-repeat'
  recording:   false,
  _mediaRec:   null,
  _chunks:     [],
  _myBlob:     null,   // recorded audio blob for current card
  _myAudio:    null,   // HTMLAudioElement for playback
  _ttsAudio:   null,   // HTMLAudioElement for TTS playback
};

const CD_KEY_PREFIX = 'custom_drill:';

// ── Storage helpers ───────────────────────────────────────
// All persistence goes through window.kvAPI (IPC → main.js → saveDatabase).
// Never use window.db.run() for kv_store — it writes in-memory only,
// saveDatabase() never fires, nothing survives a restart.

async function cdAllKeys() {
  if (!window.kvAPI) return [];
  try {
    const rows = await window.kvAPI.list(CD_KEY_PREFIX);
    return (rows || []).map(r => r.key).sort();
  } catch(e) { return []; }
}

async function cdLoadDoc(key) {
  if (!window.kvAPI) return null;
  try {
    const val = await window.kvAPI.get(key);
    return val ? JSON.parse(val) : null;
  } catch(e) { return null; }
}

async function cdSave(doc) {
  if (!window.kvAPI) {
    console.error('[cd] kvAPI not available');
    const s = document.getElementById('cd-editor-status');
    if (s) s.textContent = 'Error: cannot save (kvAPI unavailable)';
    return false;
  }
  doc.modified = new Date().toISOString().slice(0,10);
  try {
    const result = await window.kvAPI.set(doc.id, JSON.stringify(doc));
    if (result?.error) throw new Error(result.error);
    return true;
  } catch(e) {
    console.error('[cd] Save failed:', e);
    const s = document.getElementById('cd-editor-status');
    if (s) s.textContent = 'Save error: ' + e.message;
    return false;
  }
}

async function cdDelete(key) {
  if (!window.kvAPI) return;
  try { await window.kvAPI.delete(key); } catch(e) {}
}

// ── View switching ────────────────────────────────────────
function cdShowView(name) {
  ['cd-view-list','cd-view-editor','cd-view-drill'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === 'cd-view-' + name ? '' : 'none';
  });
}

// ── List view ─────────────────────────────────────────────
async function cdInitList() {
  const keys = await cdAllKeys();
  CDState.docs = (await Promise.all(keys.map(k => cdLoadDoc(k)))).filter(Boolean);
  cdRenderList();
}

function cdRenderList() {
  const el = document.getElementById('cd-doc-list');
  if (!el) return;
  if (!CDState.docs.length) {
    el.innerHTML = '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light);padding:20px 0;text-align:center">No drill sets yet — tap + New to create one</div>';
    return;
  }
  el.innerHTML = CDState.docs.map(doc => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;cursor:pointer;background:var(--paper)"
         onclick="cdOpenDoc('${doc.id}')">
      <div style="flex:1">
        <div style="font-family:var(--ui);font-size:inherit;color:var(--ink);margin-bottom:2px">${doc.name || 'Untitled'}</div>
        <div style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light)">${doc.pairs?.length || 0} sentences · ${doc.mode === 'hear-repeat' ? 'Hear then repeat' : 'English to speak'} · ${doc.modified || ''}</div>
      </div>
      <button class="btn-action btn-xs" style="background:var(--gold);border-color:var(--gold);color:#000"
        onclick="event.stopPropagation();cdOpenAndDrill('${doc.id}')">Drill</button>
    </div>`).join('');
}

function cdOpenDoc(id) {
  const doc = CDState.docs.find(d => d.id === id) || cdLoad(id);
  if (!doc) return;
  CDState.current = doc;
  cdRenderEditor();
  cdShowView('editor');
}

function cdOpenAndDrill(id) {
  const doc = CDState.docs.find(d => d.id === id) || cdLoad(id);
  if (!doc) return;
  CDState.current = doc;
  cdStartDrill();
}

// ── Editor view ───────────────────────────────────────────
function cdNewDoc() {
  CDState.current = {
    id:      CD_KEY_PREFIX + Date.now(),
    name:    'Untitled',
    mode:    'en-prompt',
    created: new Date().toISOString().slice(0,10),
    modified: new Date().toISOString().slice(0,10),
    pairs:   [{jp:'', en:''}],
  };
  // Save immediately so the doc exists in DB from the start
  cdSave(CDState.current); // async — fires and we continue
  cdRenderEditor();
  cdShowView('editor');
}

function cdRenderEditor() {
  const doc = CDState.current;
  if (!doc) return;
  const nameEl = document.getElementById('cd-doc-name');
  const modeEl = document.getElementById('cd-doc-mode');
  if (nameEl) nameEl.value = doc.name || '';
  if (modeEl) modeEl.value = doc.mode || 'en-prompt';
  cdRenderTable();
}

function cdRenderTable() {
  const doc = CDState.current;
  const tbody = document.getElementById('cd-table-body');
  if (!tbody || !doc) return;

  tbody.innerHTML = (doc.pairs || []).map((pair, i) => `
    <div style="border-bottom:1px solid var(--border);padding:4px 6px;background:var(--paper-dark)">
      <span data-kana-for="cd-jp-${i}" style="display:inline-flex;gap:3px"></span>
    </div>
    <div style="border-bottom:1px solid var(--border);border-left:1px solid var(--border);background:var(--paper-dark)"></div>
    <input id="cd-jp-${i}" type="text" value="${_cdEsc(pair.jp)}" placeholder="Japanese..."
      style="padding:8px 10px;border:none;border-bottom:1px solid var(--border);background:var(--field);color:var(--ink);font-family:'Noto Sans JP',var(--ui);font-size:inherit;outline:none;width:100%"
      onblur="cdJpBlur(${i}, this.value)"
      oninput="cdJpInput(${i}, this.value)"/>
    <input id="cd-en-${i}" type="text" value="${_cdEsc(pair.en)}" placeholder="English..."
      style="padding:8px 10px;border:none;border-bottom:1px solid var(--border);border-left:1px solid var(--border);background:var(--field);color:var(--ink);font-family:var(--ui);font-size:inherit;outline:none;width:100%"
      oninput="cdEnInput(${i}, this.value)"/>
  `).join('');

  // Attach kana toolbar to each Japanese input
  setTimeout(() => {
    (doc.pairs || []).forEach((_, i) => {
    });
  }, 30);
}

function _cdEsc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

function cdJpInput(i, val) {
  if (CDState.current?.pairs[i]) CDState.current.pairs[i].jp = val;
}

function cdEnInput(i, val) {
  if (CDState.current?.pairs[i]) CDState.current.pairs[i].en = val;
}

async function cdJpBlur(i, jpVal) {
  if (!CDState.current) return;
  CDState.current.pairs[i].jp = jpVal;
  const pair = CDState.current.pairs[i];

  // Auto-save on every blur so nothing is ever lost
  await _cdAutoSave();

  // Update sentence count display
  _cdUpdateCount();

  if (!jpVal.trim() || pair.en.trim()) return;

  // Show spinner immediately in the EN cell so user knows work is happening
  const enInput = document.getElementById(`cd-en-${i}`);
  if (enInput) { enInput.value = '…'; enInput.disabled = true; }
  const status = document.getElementById('cd-editor-status');
  if (status) status.textContent = 'Translating...';

  try {
    const _claudeAPI  = App.claudeAPI  || window.claudeAPI;
    const _claudeText = App.claudeText || window.claudeText;
    const data = await _claudeAPI({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [{ role: 'user', content:
        `Translate this Japanese sentence to natural English in 10 words or fewer. Reply with only the translation, nothing else.\n\n${jpVal}` }],
      track: 'custom_drill_translate',
    });
    const translation = (_claudeText(data) || '').trim();
    pair.en = translation;
    if (enInput) { enInput.value = translation; enInput.disabled = false; }
    if (status) status.textContent = '';
    await _cdAutoSave();
  } catch(e) {
    if (enInput) { enInput.value = ''; enInput.disabled = false; }
    if (status) status.textContent = 'Translation failed — type it manually';
    setTimeout(() => { if (status) status.textContent = ''; }, 3000);
  }
}

async function _cdAutoSave() {
  if (!CDState.current) return;
  // Capture current field values before saving
  const nameEl = document.getElementById('cd-doc-name');
  const modeEl = document.getElementById('cd-doc-mode');
  if (nameEl) CDState.current.name = nameEl.value.trim() || 'Untitled';
  if (modeEl) CDState.current.mode = modeEl.value || 'en-prompt';
  await cdSave(CDState.current);
}

function _cdUpdateCount() {
  const doc = CDState.current;
  if (!doc) return;
  const valid = (doc.pairs || []).filter(p => p.jp.trim()).length;
  const status = document.getElementById('cd-editor-status');
  // Only show count if not showing another message
  if (status && !status.textContent.includes('ranslat')) {
    status.textContent = valid ? `${valid} sentence${valid === 1 ? '' : 's'} ready to drill` : '';
  }
}

function cdAddRow() {
  if (!CDState.current) return;
  const i = CDState.current.pairs.length;
  CDState.current.pairs.push({jp:'', en:''});
  cdRenderTable();
  setTimeout(() => {
    const el = document.getElementById(`cd-jp-${i}`);
    if (el) el.focus();
  }, 80);
}

function cdSaveDoc() {
  if (!CDState.current) return;
  CDState.current.name = document.getElementById('cd-doc-name')?.value?.trim() || 'Untitled';
  CDState.current.mode = document.getElementById('cd-doc-mode')?.value || 'en-prompt';
  // Strip empty rows
  CDState.current.pairs = CDState.current.pairs.filter(p => p.jp.trim());
  cdSave(CDState.current);
  cdInitList();
  const status = document.getElementById('cd-editor-status');
  if (status) { status.textContent = 'Saved'; setTimeout(() => { status.textContent = ''; }, 1500); }
}

async function cdDeleteDoc() {
  if (!CDState.current) return;
  if (!confirm(`Delete "${CDState.current.name || 'this drill set'}"?`)) return;
  await cdDelete(CDState.current.id);
  CDState.current = null;
  await cdInitList();
  cdShowView('list');
}

async function cdBackToList() {
  await cdInitList();
  cdShowView('list');
}

// ── Drill view ────────────────────────────────────────────
async function cdStartDrill() {
  const doc = CDState.current;
  if (!doc) return;

  // Always read mode from selector at the moment drilling starts
  const modeEl = document.getElementById('cd-doc-mode');
  const mode = modeEl?.value || doc.mode || 'en-prompt';

  // Filter empties without mutating the stored document
  const pairs = (doc.pairs || []).filter(p => p.jp.trim());
  if (!pairs.length) { alert('No sentences to drill — add some first.'); return; }

  CDState.drillPairs = pairs;
  CDState.drillPos   = 0;
  CDState.drillMode  = mode;

  // Persist the mode choice
  doc.mode = mode;
  await _cdAutoSave();

  document.getElementById('cd-drill-name').textContent = doc.name || '';
  cdShowCard();
  cdShowView('drill');
}

function cdShowCard() {
  const pairs = CDState.drillPairs;
  const pos   = CDState.drillPos;
  const pair  = pairs[pos];
  if (!pair) return;

  // Reset card state
  CDState._myBlob  = null;
  CDState._myAudio = null;
  CDState._ttsAudio = null;
  if (CDState.recording) cdStopRecord();

  // Progress
  const prog = document.getElementById('cd-drill-prog');
  const ctr  = document.getElementById('cd-drill-counter');
  if (prog) prog.style.width = Math.round(((pos+1)/pairs.length)*100) + '%';
  if (ctr)  ctr.textContent  = `${pos+1} / ${pairs.length}`;

  // Prompt
  const promptEl = document.getElementById('cd-drill-prompt');
  if (CDState.drillMode === 'en-prompt') {
    if (promptEl) promptEl.textContent = pair.en || '';
  } else {
    if (promptEl) promptEl.textContent = 'Listen then repeat';
    // Auto-speak in hear-repeat mode
    setTimeout(() => cdPlayTTS(), 400);
  }

  // Hide answer side until recording done
  const answerEl = document.getElementById('cd-drill-answer');
  if (answerEl) answerEl.style.display = 'none';

  // Pre-populate answer fields (hidden)
  const jpEl = document.getElementById('cd-drill-jp');
  const enEl = document.getElementById('cd-drill-en');
  if (jpEl) jpEl.textContent = pair.jp;
  if (enEl) enEl.textContent = pair.en || '';

  // Reset playback buttons
  const playbackBtn = document.getElementById('cd-btn-playback');
  if (playbackBtn) playbackBtn.disabled = true;

  // Score
  const scoreEl = document.getElementById('cd-drill-score');
  if (scoreEl) scoreEl.textContent = '';

  // Status
  const statusEl = document.getElementById('cd-rec-status');
  if (statusEl) statusEl.textContent = CDState.drillMode === 'en-prompt'
    ? 'Read the English, then tap mic to speak Japanese'
    : 'Listen, then tap mic to repeat';
}

function cdNextCard() {
  // Stop any playing audio
  if (CDState._myAudio)  { CDState._myAudio.pause();  CDState._myAudio  = null; }
  if (CDState._ttsAudio) { CDState._ttsAudio.pause(); CDState._ttsAudio = null; }
  if (CDState.recording) cdStopRecord();

  if (CDState.drillPos < CDState.drillPairs.length - 1) {
    CDState.drillPos++;
    cdShowCard();
  } else {
    // End of deck
    document.getElementById('cd-drill-prompt').textContent = 'Drill complete!';
    document.getElementById('cd-drill-answer').style.display = 'none';
    document.getElementById('cd-rec-status').textContent = 'Tap Back to return or drill again.';
  }
}

function cdEndDrill() {
  if (CDState._myAudio)  { CDState._myAudio.pause(); }
  if (CDState._ttsAudio) { CDState._ttsAudio.pause(); }
  if (CDState.recording) cdStopRecord();
  cdShowView('editor');
}

// ── TTS playback ──────────────────────────────────────────
async function cdPlayTTS() {
  const pair = CDState.drillPairs[CDState.drillPos];
  if (!pair) return;
  if (CDState._ttsAudio) { CDState._ttsAudio.pause(); CDState._ttsAudio = null; }

  const tts = App.TTS || window.TTS;
  if (!tts) return;

  if (tts._vvEnabled) {
    // VoiceVox path — get blob and play via Audio element so we can buffer it
    try {
      const q = await fetch(`${tts.VOICEVOX_URL}/audio_query?text=${encodeURIComponent(pair.jp)}&speaker=${tts._vvSpeakerId}`, {method:'POST'});
      const query = await q.json();
      query.speedScale = 0.9;
      const s = await fetch(`${tts.VOICEVOX_URL}/synthesis?speaker=${tts._vvSpeakerId}`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(query)
      });
      const blob = await s.blob();
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      CDState._ttsAudio = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      audio.play();
    } catch(e) { tts._wsSpeakDirect(pair.jp, 0.9); }
  } else {
    tts._wsSpeakDirect(pair.jp, 0.9);
  }
}

// ── Recording ─────────────────────────────────────────────
async function cdToggleRecord() {
  if (CDState.recording) cdStopRecord();
  else await cdStartRecord();
}

async function cdStartRecord() {
  // Guard against other active recordings
  const _VoiceState = App.VoiceState || window.VoiceState;
  const _vToggle    = App.voiceToggleRecord || window.voiceToggleRecord;
  if (_VoiceState?.recording && _vToggle) await _vToggle();
  if (VoiceDrill?.recording) {
    const _drillStop = App.drillStopRecord || window.drillStopRecord;
    if (_drillStop) _drillStop();
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    CDState._chunks  = [];
    CDState._mediaRec = new MediaRecorder(stream);
    CDState._mediaRec.ondataavailable = e => CDState._chunks.push(e.data);
    CDState._mediaRec.onstop = () => cdOnRecordStop(stream);
    CDState._mediaRec.start();
    CDState.recording = true;

    const btn = document.getElementById('cd-rec-btn');
    if (btn) { btn.style.background = 'linear-gradient(135deg,var(--red),#c0392b)'; btn.innerHTML = '&#9210;'; }
    const status = document.getElementById('cd-rec-status');
    if (status) status.textContent = 'Recording... tap again to stop';
  } catch(e) {
    document.getElementById('cd-rec-status').textContent = 'Mic access denied.';
  }
}

function cdStopRecord() {
  if (!CDState._mediaRec || !CDState.recording) return;
  CDState._mediaRec.stop();
  CDState.recording = false;
  const btn = document.getElementById('cd-rec-btn');
  if (btn) { btn.style.background = 'linear-gradient(135deg,var(--teal),#28b8ad)'; btn.innerHTML = '&#127908;'; }
  document.getElementById('cd-rec-status').textContent = 'Processing...';
}

async function cdOnRecordStop(stream) {
  stream.getTracks().forEach(t => t.stop());
  CDState._myBlob = new Blob(CDState._chunks, { type: 'audio/webm' });

  // Enable playback button
  const playBtn = document.getElementById('cd-btn-playback');
  if (playBtn) playBtn.disabled = false;

  // Reveal answer side
  const answerEl = document.getElementById('cd-drill-answer');
  if (answerEl) answerEl.style.display = '';

  // Run STT scoring
  await cdScoreRecording();
}

async function cdScoreRecording() {
  const pair = CDState.drillPairs[CDState.drillPos];
  if (!pair || !CDState._myBlob) return;

  const _getApiKey = App.getApiKey || window.getApiKey;
  const key = _getApiKey?.();
  if (!key) {
    document.getElementById('cd-rec-status').textContent = 'No OpenAI key — set in Settings';
    return;
  }

  try {
    const fd = new FormData();
    fd.append('file', CDState._myBlob, 'attempt.webm');
    fd.append('model', 'whisper-1');
    fd.append('language', 'ja');
    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: fd,
    });
    const data = await resp.json();
    const transcript = (data.text || '').trim();

    // Kana comparison
    const _toHira = App.toHira || window.toHira || (s => s);
    const target  = _toHira(pair.jp);
    const spoken  = _toHira(transcript);
    const tChars  = [...target];
    const sChars  = [...spoken];
    let matches = 0;
    const used = new Array(sChars.length).fill(false);
    for (const tc of tChars) {
      const i = sChars.findIndex((sc, idx) => !used[idx] && sc === tc);
      if (i !== -1) { matches++; used[i] = true; }
    }
    const score = tChars.length ? matches / tChars.length : 0;
    const pct   = Math.round(score * 100);

    const scoreEl = document.getElementById('cd-drill-score');
    if (scoreEl) {
      scoreEl.style.color = score >= 0.85 ? 'var(--teal)' : score >= 0.55 ? 'var(--gold)' : 'var(--red)';
      scoreEl.textContent = `${score >= 0.85 ? '✓' : score >= 0.55 ? '~' : '✕'} ${transcript} (${pct}%)`;
    }

    const status = document.getElementById('cd-rec-status');
    if (status) status.textContent = 'Tap "Mine" to hear your attempt, "Model" to hear the target, then Next when ready.';
  } catch(e) {
    document.getElementById('cd-rec-status').textContent = 'STT error: ' + e.message;
  }
}

// ── Audio playback ────────────────────────────────────────
function cdPlayMyRecording() {
  if (!CDState._myBlob) return;
  if (CDState._myAudio) { CDState._myAudio.pause(); CDState._myAudio = null; }
  const url = URL.createObjectURL(CDState._myBlob);
  const audio = new Audio(url);
  CDState._myAudio = audio;
  audio.onended = () => URL.revokeObjectURL(url);
  audio.play();
}

// ── Tab init ──────────────────────────────────────────────
async function cdTabInit() {
  await cdInitList();
  cdShowView('list');
}

// ── App registry ──────────────────────────────────────────
try {
  Object.assign(App, {
    CDState,
    cdTabInit,
    cdNewDoc, cdOpenDoc, cdOpenAndDrill,
    cdRenderList, cdRenderEditor, cdRenderTable,
    cdAddRow, cdSaveDoc, cdDeleteDoc, cdBackToList,
    cdJpBlur, cdJpInput, cdEnInput,
    _cdAutoSave, _cdUpdateCount,
    cdStartDrill, cdShowCard, cdNextCard, cdEndDrill,
    cdPlayTTS, cdPlayMyRecording,
    cdToggleRecord,
  });
  window['cdNewDoc']          = cdNewDoc;
  window['_cdAutoSave']       = _cdAutoSave;
  window['cdOpenDoc']         = cdOpenDoc;
  window['cdOpenAndDrill']    = cdOpenAndDrill;
  window['cdAddRow']          = cdAddRow;
  window['cdSaveDoc']         = cdSaveDoc;
  window['cdDeleteDoc']       = cdDeleteDoc;
  window['cdBackToList']      = cdBackToList;
  window['cdJpBlur']          = cdJpBlur;
  window['cdJpInput']         = cdJpInput;
  window['cdEnInput']         = cdEnInput;
  window['cdStartDrill']      = cdStartDrill;
  window['cdNextCard']        = cdNextCard;
  window['cdEndDrill']        = cdEndDrill;
  window['cdPlayTTS']         = cdPlayTTS;
  window['cdPlayMyRecording'] = cdPlayMyRecording;
  window['cdToggleRecord']    = cdToggleRecord;
} catch(e) { console.error('[custom-drill] App registry failed:', e); }
