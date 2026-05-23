// ═══════════════════════════════════════════════════════
// FEATURES-YOSHI
// Yoshi writing sessions + Lesson Notes panel.
// Requires: core.js, features-core.js, AppEvents.
// ═══════════════════════════════════════════════════════

// ── Phase 3: App-first resolvers ─────────────────────────────────
function _fy_claudeAPI(...a)  { return (App.claudeAPI  || window.claudeAPI)(...a); }
function _fy_claudeText(...a) { return (App.claudeText || window.claudeText)(...a); }
function _fy_getApiKey()      { return (App.getApiKey  || window.getApiKey)?.(); }

// ═══════════════════════════════════════════════════════
// YOSHI SESSIONS
// ═══════════════════════════════════════════════════════
const YOSHI_KEY = 'jpStudioYoshiSessions';
let yoshiCurrentIdx = null;
let yoshiAudioURL = null;

function yoshiGetSessions() {
  return JSON.parse(localStorage.getItem(YOSHI_KEY) || '[]');
}
function yoshiSaveSessions(arr) {
  localStorage.setItem(YOSHI_KEY, JSON.stringify(arr));
}

function yoshiRender() {
  const sessions = yoshiGetSessions();
  const list = document.getElementById('yoshiSessionList');
  if (!list) return;
  list.innerHTML = sessions.length ? sessions.slice().reverse().map((s, ri) => {
    const i = sessions.length - 1 - ri;
    return `<div class="yoshi-session-item${yoshiCurrentIdx === i ? ' active' : ''}" onclick="yoshiOpenSession(${i})">
      <span class="yoshi-session-date">${s.date}</span>
      <span class="yoshi-session-title">${s.title || 'Untitled'}</span>
      <button class="yoshi-session-del" onclick="event.stopPropagation();yoshiDeleteSession(${i})">✕</button>
    </div>`;
  }).join('') : '<div style="font-family:var(--ui);font-size:0.78rem;color:var(--ink-light);text-align:center;padding:20px">No sessions yet</div>';

  if (yoshiCurrentIdx !== null) yoshiOpenSession(yoshiCurrentIdx);
}

function yoshiDeleteSession(i) {
  if (!confirm('Delete this session?')) return;
  const sessions = yoshiGetSessions();
  sessions.splice(i, 1);
  yoshiSaveSessions(sessions);
  if (yoshiCurrentIdx === i) { yoshiCurrentIdx = null; document.getElementById('yoshiMain').innerHTML = '<div class="yoshi-empty"><div class="yoshi-empty-char">先</div><div>Select a session or create a new one</div></div>'; }
  else if (yoshiCurrentIdx > i) yoshiCurrentIdx--;
  yoshiRender();
}

function yoshiOpenSession(i) {
  yoshiCurrentIdx = i;
  // Update active state
  document.querySelectorAll('.yoshi-session-item').forEach((el, ri) => {
    const sessions = yoshiGetSessions();
    const realI = sessions.length - 1 - ri;
    el.classList.toggle('active', realI === i);
  });
  const s = yoshiGetSessions()[i];
  if (!s) return;
  yoshiShowSession(s);
}

function yoshiLiveTitle(val) {
  if (yoshiCurrentIdx === null) return;
  const sessions = yoshiGetSessions();
  sessions[yoshiCurrentIdx].title = val;
  yoshiSaveSessions(sessions);
  // Update just the title span in the list without full re-render
  const items = document.querySelectorAll('.yoshi-session-item');
  const sessions2 = yoshiGetSessions();
  items.forEach((el, ri) => {
    const i = sessions2.length - 1 - ri;
    if (i === yoshiCurrentIdx) {
      const span = el.querySelector('.yoshi-session-title');
      if (span) span.textContent = val || 'Untitled';
    }
  });
}

function yoshiAttachAudio() {
  const fileEl = document.getElementById('yoshiAudioFile');
  if (!fileEl || !fileEl.files[0]) { alert('Select an audio file first.'); return; }
  if (yoshiCurrentIdx === null) { alert('Open a session first.'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const sessions = yoshiGetSessions();
    sessions[yoshiCurrentIdx].audio = e.target.result;
    yoshiSaveSessions(sessions);
    yoshiShowSession(sessions[yoshiCurrentIdx]);
  };
  reader.readAsDataURL(fileEl.files[0]);
}

// ── Yoshi read state ─────────────────────────────────────────────────────────
const YoshiReadState = {
  kanaTimer:    null,
  readEnShown:  false,
  furiganaOn:   false,
  paraFurigana: {},
  ttsTimer:     null,
  ttsStopped:   false,
};
// YoshiReadState — see above
function yoshiKanaDebounce() {
  clearTimeout(YoshiReadState.kanaTimer);
  YoshiReadState.kanaTimer = setTimeout(yoshiGenKana, 1200);
}

async function yoshiGenKana() {
  const completeEl = document.getElementById('yoshiComplete');
  const status = document.getElementById('yoshiImportStatus');
  const text = completeEl ? completeEl.value.trim() : '';
  if (!text) { if (status) status.textContent = 'Add complete text first.'; return; }
  const apiKey = _fy_getApiKey();
  if (!apiKey) { if (status) status.textContent = 'No API key.'; return; }
  if (status) status.textContent = 'Generating reading…';
  try {
    const data = await _fy_claudeAPI({
      max_tokens: 600,
      messages: [{ role: 'user', content: 'Convert this Japanese text to full hiragana reading (yomigana). Keep the same paragraph structure and line breaks. Return ONLY the hiragana reading, nothing else.\n\n' + text }]
    ,
      track: 'yoshi'
    });
    const kana = _fy_claudeText(data).trim();
    // Show in a small panel below the complete textarea
    let kanaPanel = document.getElementById('yoshiKanaPanel');
    if (!kanaPanel) {
      kanaPanel = document.createElement('div');
      kanaPanel.id = 'yoshiKanaPanel';
      kanaPanel.style.cssText = 'margin-top:6px;padding:10px 12px;background:var(--paper-dark);border:1px solid var(--border);border-radius:6px;font-family:"Noto Sans JP",sans-serif;font-size:0.9rem;line-height:2;color:var(--ink-light);white-space:pre-wrap';
      completeEl.parentElement.after(kanaPanel);
    }
    kanaPanel.textContent = kana;
    if (status) status.textContent = '✓ Reading generated';
  } catch(e) {
    if (status) status.textContent = 'Error: ' + e.message;
  }
}

async function yoshiAIComplete() {
  const clozeEl = document.getElementById('yoshiCloze');
  const completeEl = document.getElementById('yoshiComplete');
  const status = document.getElementById('yoshiImportStatus');
  const cloze = clozeEl ? clozeEl.value.trim() : '';
  if (!cloze) { if (status) status.textContent = 'Parse the docx file first to get the cloze text.'; return; }
  const apiKey = _fy_getApiKey();
  if (!apiKey) { if (status) status.textContent = 'No API key — open ⚙ and save your key first.'; return; }
  if (status) status.textContent = '✨ Generating complete text…';
  try {
    const data = await _fy_claudeAPI({
      max_tokens: 1500,
      messages: [{ role: 'user', content: 'This is a Japanese cloze text where ＿＿ marks missing kanji. The surrounding kana fragments are reading hints for the missing kanji. Please reconstruct the complete text by filling in ALL the ＿＿ blanks with the correct kanji that fit the context and kana hints.\n\nFor example: ＿＿りました with hint かえ before it → 帰りました\n\nReturn ONLY the complete Japanese text with all blanks filled, keeping the same paragraph structure. No explanations.\n\nCloze text:\n' + cloze }]
    ,
      track: 'yoshi'
    });
    const text = _fy_claudeText(data).trim();
    if (completeEl) completeEl.value = text;
    if (status) status.textContent = '✓ Complete text generated — check it and save.';
  } catch(e) {
    if (status) status.textContent = 'Error: ' + e.message;
  }
}

async function yoshiAIVocab() {
  const completeEl = document.getElementById('yoshiComplete');
  const status = document.getElementById('yoshiImportStatus');
  const complete = completeEl ? completeEl.value.trim() : '';
  const clozeEl2 = document.getElementById('yoshiCloze');
  const sourceText = complete || (clozeEl2 ? clozeEl2.value.trim() : '');
  if (!sourceText) { if (status) status.textContent = 'Add some text first.'; return; }
  const apiKey = _fy_getApiKey();
  if (!apiKey) { if (status) status.textContent = 'No API key.'; return; }
  if (status) status.textContent = '✨ Extracting vocabulary…';

  // Show loading popup immediately
  yoshiShowVocabPopup([]);

  try {
    const data = await _fy_claudeAPI({
      max_tokens: 800,
      messages: [{ role: 'user', content: 'Extract the key N5-N4 vocabulary from this Japanese text. For each word give: kanji　reading　English meaning. One per line. No blank lines between entries. Focus on verbs, nouns, and adjectives. About 10-15 words.\n\nText:\n' + sourceText }]
    ,
      track: 'yoshi'
    });
    const text = _fy_claudeText(data).trim();
    // Parse into rows, strip blank lines
    const rows = text.split('\n').filter(l => l.trim()).map(l => {
      const parts = l.split(/[\t　]/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 3) return { jp: parts[0], kana: parts[1], en: parts[2] };
      if (parts.length === 2) return { jp: parts[0], kana: '', en: parts[1] };
      return { jp: parts[0], kana: '', en: '' };
    });
    yoshiShowVocabPopup(rows);
    if (status) status.textContent = '';
  } catch(e) {
    const overlay = document.getElementById('yoshiVocabPopup');
    if (overlay) overlay.remove();
    if (status) status.textContent = 'Error: ' + e.message;
  }
}

function yoshiShowVocabPopup(rows) {
  // Remove any existing popup
  const existing = document.getElementById('yoshiVocabPopup');
  if (existing) existing.remove();

  const loading = !rows.length;
  const overlay = document.createElement('div');
  overlay.className = 'yoshi-popup-overlay';
  overlay.id = 'yoshiVocabPopup';
  overlay.innerHTML = `
    <div class="yoshi-popup">
      <div class="yoshi-popup-header">
        <span class="yoshi-popup-title">VOCABULARY EXTRACT</span>
        <button class="yoshi-popup-close" onclick="document.getElementById('yoshiVocabPopup').remove()">✕</button>
      </div>
      <div class="yoshi-popup-body" id="yoshiVocabPopupBody">
        ${loading ? '<div style="text-align:center;padding:30px;font-family:var(--ui);color:var(--ink-light)">Extracting…</div>' : rows.map((r,i) => `
          <div class="yoshi-vocab-row" id="vprow${i}">
            <input class="vi-jp" value="${r.jp.replace(/"/g,'&quot;')}" placeholder="word">
            <input class="vi-kana" value="${r.kana.replace(/"/g,'&quot;')}" placeholder="reading">
            <input class="vi-en" value="${r.en.replace(/"/g,'&quot;')}" placeholder="meaning">
            <button class="vi-del" onclick="document.getElementById('vprow${i}').remove()">✕</button>
          </div>`).join('')}
      </div>
      <div class="yoshi-popup-foot">
        <button class="yoshi-import-btn btn-ghost" onclick="yoshiVocabPopupAddRow()">＋ Add row</button>
        <button class="yoshi-import-btn" onclick="yoshiVocabPopupSave()">Add to session →</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  // Close on overlay click
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function yoshiVocabPopupAddRow() {
  const body = document.getElementById('yoshiVocabPopupBody');
  if (!body) return;
  const i = Date.now();
  const row = document.createElement('div');
  row.className = 'yoshi-vocab-row';
  row.id = 'vprow' + i;
  row.innerHTML = `<input class="vi-jp" placeholder="word"><input class="vi-kana" placeholder="reading"><input class="vi-en" placeholder="meaning"><button class="vi-del" onclick="this.closest('.yoshi-vocab-row').remove()">✕</button>`;
  body.appendChild(row);
  row.querySelector('.vi-jp').focus();
}

function yoshiVocabPopupSave() {
  const body = document.getElementById('yoshiVocabPopupBody');
  if (!body) return;
  const newVocab = Array.from(body.querySelectorAll('.yoshi-vocab-row')).map(row => ({
    jp: row.querySelector('.vi-jp').value.trim(),
    kana: row.querySelector('.vi-kana').value.trim(),
    en: row.querySelector('.vi-en').value.trim()
  })).filter(v => v.jp);

  // Merge into current session vocab (avoid duplicates)
  if (yoshiCurrentIdx === null) return;
  const sessions = yoshiGetSessions();
  const existing = sessions[yoshiCurrentIdx].vocab || [];
  const existingJp = new Set(existing.map(v => v.jp));
  const merged = [...existing, ...newVocab.filter(v => !existingJp.has(v.jp))];
  sessions[yoshiCurrentIdx].vocab = merged;
  yoshiSaveSessions(sessions);

  // Also update the textarea if visible
  const vocabEl = document.getElementById('yoshiVocabNotes');
  if (vocabEl) vocabEl.value = merged.map(v => v.jp + '　' + v.kana + '　' + v.en).join('\n');

  document.getElementById('yoshiVocabPopup').remove();
  const status = document.getElementById('yoshiImportStatus');
  if (status) status.textContent = `✓ ${newVocab.length} words added to session.`;
}

function yoshiImport() {
  const title = document.getElementById('yoshiTitle').value.trim();
  const complete = document.getElementById('yoshiComplete').value.trim();
  const clozeRaw = document.getElementById('yoshiCloze').value.trim();
  const vocabRaw = document.getElementById('yoshiVocabNotes').value.trim();
  const audioFile = document.getElementById('yoshiAudioFile') ? document.getElementById('yoshiAudioFile').files[0] : null;
  const status = document.getElementById('yoshiImportStatus');

  status.textContent = 'Processing…';

  // Parse vocab
  const vocab = vocabRaw ? vocabRaw.split('\n').filter(l => l.trim()).map(l => {
    // Support: word　reading　meaning  OR  word = meaning  OR  word　meaning
    const parts = l.split(/[\t　]|(?:\s*=\s*)/).map(p => p.trim()).filter(Boolean);
    if (parts.length >= 3) return { jp: parts[0], kana: parts[1], en: parts[2] };
    if (parts.length === 2) return { jp: parts[0], kana: '', en: parts[1] };
    return { jp: parts[0], kana: '', en: '' };
  }) : [];

  // Compute blanks by diffing complete vs cloze
  const blanks = clozeRaw ? yoshiComputeBlanks(complete || clozeRaw, clozeRaw) : [];

  // Handle audio
  const finalize = (audioData) => {
    const sessions = yoshiGetSessions();
    sessions[yoshiCurrentIdx] = {
      date: sessions[yoshiCurrentIdx]?.date || new Date().toLocaleDateString('de-DE'),
      title: title || (complete || clozeRaw).split(/[。\n＿]/)[0].replace(/[＿_]+/g,'').trim().slice(0, 20) || 'Untitled',
      complete, cloze: clozeRaw, vocab, blanks,
      audio: audioData || sessions[yoshiCurrentIdx]?.audio || null
    };
    yoshiSaveSessions(sessions);
    status.textContent = '✓ Saved';
    setTimeout(() => { const s2 = document.getElementById('yoshiImportStatus'); if(s2) s2.textContent=''; }, 2000);
    yoshiRender();
  };

  if (audioFile) {
    const reader = new FileReader();
    reader.onload = e => finalize(e.target.result);
    reader.readAsDataURL(audioFile);
  } else {
    finalize(null);
  }
}

function yoshiComputeBlanks(complete, cloze) {
  // If cloze uses explicit ＿ markers, use those
  if (cloze.includes('＿') || cloze.includes('_')) {
    const blanks = [];
    let idx = 0;
    const clozeChars = [...cloze];
    const completeWords = complete.match(/[\u3000-\u9fff\uff00-\uffef\u4e00-\u9fff]+|[^\s]/g) || [];
    // Simple explicit blank: replace ＿+ or __+ with blank entries
    const parts = cloze.split(/(＿+|_{2,})/);
    let pos = 0;
    parts.forEach(part => {
      if (/^[＿_]+$/.test(part)) blanks.push({ pos, answer: '' });
      pos += part.length;
    });
    return blanks;
  }

  // Diff-based: align sentences then find missing tokens
  const blanks = [];
  const cSents = complete.split(/(?<=[。！？\n])/).filter(s => s.trim());
  const zSents = cloze.split(/(?<=[。！？\n])/).filter(s => s.trim());

  cSents.forEach((cs, si) => {
    const zs = zSents[si] || '';
    // Tokenise by character (Japanese is character-level)
    const cToks = [...cs.replace(/\s+/g,'')];
    const zToks = [...zs.replace(/\s+/g,'')];
    // LCS diff to find deletions
    const matrix = Array(cToks.length + 1).fill(null).map(() => Array(zToks.length + 1).fill(0));
    for (let i = 1; i <= cToks.length; i++)
      for (let j = 1; j <= zToks.length; j++)
        matrix[i][j] = cToks[i-1] === zToks[j-1] ? matrix[i-1][j-1] + 1 : Math.max(matrix[i-1][j], matrix[i][j-1]);

    // Trace back to find deleted sequences
    let i = cToks.length, j = zToks.length;
    const ops = [];
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && cToks[i-1] === zToks[j-1]) { ops.unshift({type:'eq',ch:cToks[i-1]}); i--; j--; }
      else if (j > 0 && (i === 0 || matrix[i][j-1] >= matrix[i-1][j])) { ops.unshift({type:'ins',ch:zToks[j-1]}); j--; }
      else { ops.unshift({type:'del',ch:cToks[i-1]}); i--; }
    }

    // Collect consecutive deletions as blanks
    let run = '';
    ops.forEach(op => {
      if (op.type === 'del') { run += op.ch; }
      else {
        if (run) { blanks.push({ answer: run }); run = ''; }
      }
    });
    if (run) blanks.push({ answer: run });
  });

  return blanks;
}

function yoshiShowSession(s) {
  const main = document.getElementById('yoshiMain');
  main.innerHTML = `
    <div class="yoshi-subtabs">
      <button class="yoshi-subtab active" onclick="yoshiSwitchTab('read',this)">📖 Read</button>
      <button class="yoshi-subtab" onclick="yoshiSwitchTab('cloze',this)">✏️ Cloze</button>
      <button class="yoshi-subtab" onclick="yoshiSwitchTab('vocab',this)">📚 Vocab</button>
      <button class="yoshi-subtab" onclick="yoshiSwitchTab('notes',this)">📝 Notes</button>
      <button class="yoshi-subtab" onclick="yoshiSwitchTab('import',this)">⚙ Edit</button>
    </div>

    <!-- READ -->
    <div class="yoshi-subpanel active" id="yoshi-sub-read">
      <div id="yoshiReadView"></div>
    </div>

    <!-- CLOZE -->
    <div class="yoshi-subpanel" id="yoshi-sub-cloze">
      ${s.audio ? `<div class="yoshi-player" id="yoshiMiniPlayerCloze">
        <canvas class="yoshi-wave-canvas" id="yoshiWaveCanvasCloze"></canvas>
        <audio id="yoshiMiniAudioCloze" src="${s.audio}" preload="metadata"></audio>
        <div class="yoshi-transport">
          <button class="yoshi-tbtn" onclick="yoshiMiniSkipEl('yoshiMiniAudioCloze','yoshiWaveCanvasCloze',-999999)" title="Restart">⏮</button>
          <button class="yoshi-tbtn yoshi-play-btn" id="yoshiPlayBtnCloze" onclick="yoshiMiniToggleEl('yoshiMiniAudioCloze','yoshiPlayBtnCloze')">▶</button>
          <button class="yoshi-tbtn" onclick="yoshiMiniSkipEl('yoshiMiniAudioCloze','yoshiWaveCanvasCloze',999999)" title="End">⏭</button>
          <button class="yoshi-tbtn" onclick="yoshiMiniSkipEl('yoshiMiniAudioCloze','yoshiWaveCanvasCloze',-5)">«5</button>
          <button class="yoshi-tbtn" onclick="yoshiMiniSkipEl('yoshiMiniAudioCloze','yoshiWaveCanvasCloze',-10)">«10</button>
          <button class="yoshi-tbtn" onclick="yoshiMiniSkipEl('yoshiMiniAudioCloze','yoshiWaveCanvasCloze',10)">10»</button>
          <button class="yoshi-tbtn" onclick="yoshiMiniSkipEl('yoshiMiniAudioCloze','yoshiWaveCanvasCloze',5)">5»</button>
          <button class="yoshi-tbtn yoshi-loop-btn" id="yoshiLoopBtnCloze" onclick="yoshiMiniCycleLoopEl('yoshiMiniAudioCloze','yoshiWaveCanvasCloze','yoshiLoopBtnCloze')">Loop</button>
          <select class="yoshi-speed-sel" onchange="document.getElementById('yoshiMiniAudioCloze').playbackRate=parseFloat(this.value)">
            <option value="0.75">0.75×</option>
            <option value="0.9">0.9×</option>
            <option value="1" selected>1×</option>
            <option value="1.25">1.25×</option>
            <option value="1.5">1.5×</option>
          </select>
        </div>
      </div>` : ''}
      <div class="yoshi-read-toolbar" style="margin-bottom:16px">
        <button class="yoshi-read-btn" onclick="yoshiCheckCloze()">Check ✓</button>
        <button class="yoshi-read-btn" onclick="yoshiRevealAll()">Reveal all</button>
        <button class="yoshi-read-btn" onclick="yoshiResetCloze()">Reset</button>
        <button class="yoshi-read-btn" onclick="yoshiConfirmCloze()" title="Save filled answers as confirmed text">Confirm →</button>
      </div>
      <div class="yoshi-cloze-score" id="yoshiClozeScore"></div>
      <div class="yoshi-cloze" id="yoshiClozeBody"></div>
    </div>

    <!-- VOCAB -->
    <div class="yoshi-subpanel" id="yoshi-sub-vocab">
      ${s.vocab.length ? `
        <div class="yoshi-vocab-list" id="yoshiVocabList">
          ${s.vocab.map((v,i) => `
            <div class="yoshi-vocab-item" id="yoshiVocabItem${i}">
              <button class="yoshi-vocab-speak" onclick="jpSpeak('${(v.jp||'').replace(/'/g,"\\'")}')">🔊</button>
              <span class="yoshi-vocab-jp">${v.jp}</span>
              <span class="yoshi-vocab-kana">${v.kana}</span>
              <span class="yoshi-vocab-en">${v.en}</span>
              <button class="yoshi-vocab-add" id="yoshiVocabAdd${i}" onclick="yoshiAddVocab(${i})">+ Deck</button>
            </div>`).join('')}
        </div>` : '<div style="font-family:var(--ui);font-size:0.85rem;color:var(--ink-light);padding:20px">No vocab notes for this session.</div>'}
    </div>

    <!-- NOTES (Lesson Notes) -->
    <div class="yoshi-subpanel" id="yoshi-sub-notes">
      <div id="lessonNotesView"></div>
    </div>

    <!-- EDIT/IMPORT -->
    <div class="yoshi-subpanel" id="yoshi-sub-import"></div>
  `;

  // Render cloze
  yoshiRenderCloze(s);
  setTimeout(() => yoshiMiniInitEl('yoshiMiniAudioCloze', 'yoshiWaveCanvasCloze', 'yoshiPlayBtnCloze', 'yoshiLoopBtnCloze'), 0);
  YoshiReadState.paraFurigana = {};
  yoshiRenderRead();
}

function yoshiSwitchTab(name, btn) {
  document.querySelectorAll('.yoshi-subtab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.yoshi-subpanel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('yoshi-sub-' + name).classList.add('active');
  if (name === 'import') {
    document.getElementById('yoshi-sub-import').innerHTML = '';
    yoshiShowImportInline();
  }
  if (name === 'read') {
    yoshiRenderRead();
  }
  if (name === 'notes') {
    lessonNotesRender();
  }
}

function yoshiShowImportInline() {
  const s = yoshiGetSessions()[yoshiCurrentIdx] || {};
  const el = document.getElementById('yoshi-sub-import');
  el.innerHTML = `<div class="yoshi-import">
    <div>
      <span class="yoshi-import-label">Session title</span>
      <input id="yoshiTitle" type="text" value="${(s.title||'').replace(/"/g,'&quot;')}"
        oninput="yoshiLiveTitle(this.value)"
        style="width:100%;padding:8px 12px;background:var(--field);border:1px solid var(--field-border);color:var(--ink);font-family:var(--ui);font-size:0.9rem;border-radius:6px;outline:none">
    </div>
    <div>
      <span class="yoshi-import-label">Cloze text</span>
      <textarea class="yoshi-import-textarea" id="yoshiCloze" style="min-height:140px">${s.cloze||''}</textarea>
    </div>
    <div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <span class="yoshi-import-label" style="margin-bottom:0">Complete text</span>
        <button class="yoshi-import-btn btn-icon" onclick="yoshiAIComplete()">✨ Generate</button>
      </div>
      <textarea class="yoshi-import-textarea" id="yoshiComplete" style="min-height:140px" oninput="yoshiKanaDebounce()">${s.complete||''}</textarea>
    </div>
    <div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <span class="yoshi-import-label" style="margin-bottom:0">Vocabulary</span>
        <button class="yoshi-import-btn btn-icon" onclick="yoshiAIVocab()">✨ Extract</button>
      </div>
      <textarea class="yoshi-import-textarea" id="yoshiVocabNotes" style="min-height:100px">${(s.vocab||[]).map(v=>v.jp+'　'+v.kana+'　'+v.en).join('\n')}</textarea>
    </div>
    <div class="yoshi-import-row">
      <button class="yoshi-import-btn" onclick="yoshiImport()">Save →</button>
      <span class="yoshi-import-status" id="yoshiImportStatus"></span>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════
// LESSON NOTES - Extract vocab from teacher's notes
// ═══════════════════════════════════════════════════════
// ── Lesson notes state ───────────────────────────────────────────────────────