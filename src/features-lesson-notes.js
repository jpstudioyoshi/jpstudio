const LessonNotesState = {
  // Session & vocab
  currentIdx:          null,
  vocab:               [],
  vocabOriginal:       [],
  drillIdx:            0,
  drillMode:           'jp2reading',
  drillRevealed:       0,
  tableHidden:         true,
  showReading:         false,
  showMeaning:         false,
  shuffled:            false,
  standalone:          false,
  // View & content
  viewMode:            'vocab',
  stories:             [],
  keyPhrases:          [],
  grammar:             [],
  grammarHidden:       new Set(),
  currentStory:        null,
  lnFuriOn:            false,
  grammarDetail:       null,
  grammarDrillSentences: [],
  grammarDrillIdx:     0,
  grammarDrillAnswer:  '',
  grammarDrillRevealed:false,
  grammarDrillFeedback:'',
  grammarQA:           [],
  extracting:          false,
  showHiddenGrammar:   false,
  // Recording (ln = lesson notes recorder)
  lnIsRecording:       false,
  lnMediaRecorder:     null,
  lnAudioChunks:       [],
  lnRecordMode:        'full',
  lnCurrentSentence:   0,
  lnAudioStream:       null,
  lnSentenceFuriganaCache: {},
  lnParsingInProgress: false,
  lnIsSpeaking:        false,
  // Words / learned
  hiddenWords:         new Set(),
  permanentlyLearned:  null,   // loaded lazily
  // Breakdown
  breakdownCache:      {},
  // Full doc
  rawText:             '',
  docImages:           [],
  loadingSession:      false,
  editMode:            false,
  errors:              [],
  docContent:          [],
  fullDocSearch:       '',
  // Storage
  sessions:            [],
  _sessionsLoaded:     false,
  transcriptMode:      'timeline',
  _transcriptRecId:    null,
};

function lessonNotesGetSessions() {
  return LessonNotesState.sessions;
}

function lessonNotesSaveSessions(sessions) {
  LessonNotesState.sessions = sessions;
  try {
    window.kvAPI.set('lessonNoteSessions', JSON.stringify(sessions)).catch(function(e) {
      console.error('[lessonNotes] kvAPI save failed:', e);
    });
  } catch(e) { console.error('[lessonNotes] kvAPI unavailable:', e); }
}

async function lessonNotesLoadSessionsFromStorage() {
  try {
    // One-time migration from localStorage
    const legacy = localStorage.getItem('importedDocSessions');
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (parsed && parsed.length) {
        console.log('[lessonNotes] Migrating', parsed.length, 'sessions from localStorage to kvAPI');
        await window.kvAPI.set('lessonNoteSessions', JSON.stringify(parsed));
        LessonNotesState.sessions = Array.isArray(parsed) ? parsed : [];
        localStorage.removeItem('importedDocSessions');
        return;
      }
      localStorage.removeItem('importedDocSessions');
    }
    const result = await window.kvAPI.get('lessonNoteSessions');
    // kvAPI.get may return {key,value}, a raw string, or a parsed object depending on version
    const raw = result && result.value !== undefined ? result.value : result;
    if (raw) {
      LessonNotesState.sessions = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } else {
      LessonNotesState.sessions = [];
    }
  } catch(e) {
    console.error('[lessonNotes] Failed to load sessions:', e);
    LessonNotesState.sessions = [];
  }
  // Auto-select if only one session and none currently selected
  if (LessonNotesState.currentIdx === null && LessonNotesState.sessions.length === 1) {
    // Ensure permanentlyLearned is initialised before loading (lessonNotesLoadSession needs it)
    if (LessonNotesState.permanentlyLearned === null) {
      LessonNotesState.permanentlyLearned = lessonNotesGetLearnedWords();
    }
    lessonNotesLoadSession(0);
  }
}

function lessonNotesOpen() {
  // Open Lesson Notes directly in the main area (standalone mode)
  LessonNotesState.standalone = true;
  yoshiCurrentIdx = null; // Deselect any Yoshi session
  
  // Clear session selection highlight
  document.querySelectorAll('.yoshi-session-item').forEach(el => el.classList.remove('active'));
  
  const main = document.getElementById('yoshiMain');
  main.innerHTML = `
    <div class="yoshi-subtabs">
      <button class="yoshi-subtab active">📝 Lesson Notes</button>
    </div>
    <div id="lessonNotesView"></div>
  `;
  lessonNotesRender();
}

function lessonNotesRenderMain() {
  // Render into the Read panel's lesson notes tab
  const el = document.getElementById('lessonNotesViewMain');
  if (!el) { console.error('lessonNotesViewMain not found'); return; }
  try {
    el.innerHTML = lessonNotesGetHTML();
  } catch(e) {
    console.error('lessonNotesRenderMain error:', e);
    el.innerHTML = '<div style="color:red;padding:20px">Error loading Lesson Notes. Check console.</div>';
  }
}

function lessonNotesRender() {
  // Render into whichever containers exist
  const el1 = document.getElementById('lessonNotesView');
  const el2 = document.getElementById('lessonNotesViewMain');
  const el3 = document.getElementById('lessonNotesPanelContent');
  const html = lessonNotesGetHTML();
  if (el1) el1.innerHTML = html;
  if (el2) el2.innerHTML = html;
  // For the panel, use the full panel HTML which includes session selector
  if (el3) el3.innerHTML = lessonNotesGetFullPanelHTML();
  // Wire all TextEntry components after render
  setTimeout(function() {
    try { (App.TextEntry||window.TextEntry)?.wireAll(document.getElementById('lessonNotesPanelContent')); } catch(e) {}
  }, 0);
}

// LessonNotesState.view* — see declaration above

function lessonNotesRenderPanel() {
  if (LessonNotesState.permanentlyLearned === null) {
    LessonNotesState.permanentlyLearned = lessonNotesGetLearnedWords();
  }
  if (!LessonNotesState._sessionsLoaded) {
    LessonNotesState._sessionsLoaded = true;
    lessonNotesLoadSessionsFromStorage().then(function() {
      const el2 = document.getElementById('lessonNotesPanelContent');
      if (el2) el2.innerHTML = lessonNotesGetFullPanelHTML();
    });
    const elWait = document.getElementById('lessonNotesPanelContent');
    if (elWait) elWait.innerHTML = '<div style="padding:40px;text-align:center;font-family:var(--ui);color:var(--ink-light)">…</div>';
    return;
  }
  const el = document.getElementById('lessonNotesPanelContent');
  if (!el) return;
  el.innerHTML = lessonNotesGetFullPanelHTML();
}

function lessonNotesGetFullPanelHTML() {
  const sessions = lessonNotesGetSessions();
  const currentSession = LessonNotesState.currentIdx !== null ? sessions[LessonNotesState.currentIdx] : null;
  
  // Session selector
  let html = `
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
      <select id="lessonNotesPanelSelect" onchange="lessonNotesLoadSession(parseInt(this.value));lessonNotesRenderPanel()" style="padding:8px 12px;font-family:var(--ui);font-size:0.85rem;background:var(--field);border:1px solid var(--field-border);color:var(--ink);border-radius:6px;min-width:200px">
        <option value="-1">— Select lesson —</option>
        ${sessions.map((s, i) => `<option value="${i}" ${i === LessonNotesState.currentIdx ? 'selected' : ''}>${s.title || 'Untitled ' + (i+1)}</option>`).join('')}
      </select>

      ${currentSession ? `<button class="btn-ghost" onclick="lessonNotesDeleteFromPanel()">🗑 Delete</button>` : ''}
    </div>
  `;
  
  // ── Top bar: status + session controls ───────────────────────────────────────
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">';
  html += '<span id="yoshiRecordStatus" style="font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);flex:1"></span>';
  html += '<span id="yoshiLevelDots" style="font-size:0.65rem;color:var(--red);letter-spacing:-1px;margin-right:4px"></span>';
  if (!currentSession) {
  html += '<button class="btn-ghost" style="font-size:0.72rem" onclick="yoshiTestChannels && yoshiTestChannels()">🎙 Test</button>';
  html += '<button class="btn-ghost" style="font-size:0.72rem" onclick="yoshiOpenOverlay && yoshiOpenOverlay()">🪟 Session</button>';
  html += '<button class="btn-ghost" style="font-size:0.72rem" onclick="showPanel(\'recordings\')">📼 Recordings</button>';
  }
  html += '</div>';
  html += '<div id="yoshiTranscribeBar" style="display:none;align-items:center;gap:8px;margin-bottom:8px"></div>';

  // If extracting, show loading
  if (LessonNotesState.extracting) {
    html += `
      <div style="text-align:center;padding:60px 20px">
        <div style="font-size:2rem;margin-bottom:16px">⏳</div>
        <div style="font-family:var(--ui);font-size:1rem;color:var(--teal);margin-bottom:8px">Extracting content...</div>
        <div style="font-family:var(--ui);font-size:0.85rem;color:var(--ink-light)">Analyzing vocab, stories, phrases, and grammar</div>
      </div>
    `;
    return html;
  }
  
  // If no session selected, show drop zone for new doc
  if (!currentSession) {
    html += `
      <div id="lessonNotesPanelDropZone" 
        tabindex="0"
        ondragover="event.preventDefault();this.style.borderColor='var(--teal)';this.style.background='rgba(48,213,200,0.05)'"
        ondragleave="this.style.borderColor='var(--field-border)';this.style.background='none'"
        ondrop="lessonNotesPanelHandleDrop(event)"
        onpaste="lessonNotesPanelHandlePaste(event)"
        onfocus="this.style.outline='2px solid var(--teal)';this.style.outlineOffset='2px'"
        onblur="this.style.outline='none'"
        style="border:2px dashed var(--field-border);border-radius:12px;padding:60px 20px;text-align:center;cursor:pointer;transition:all 0.2s">
        <div style="font-size:2.5rem;margin-bottom:12px">📄</div>
        <div style="font-family:var(--ui);font-size:1rem;color:var(--ink);margin-bottom:8px">Drop a lesson document here</div>
        <div style="font-family:var(--ui);font-size:0.8rem;color:var(--ink-light);margin-bottom:16px">Supports .docx, .txt, or click here and paste text (⌘V)</div>
        <label style="cursor:pointer">
          <input type="file" accept=".docx,.txt,.md" style="display:none" onchange="lessonNotesPanelHandleFile(this.files)">
          <span style="padding:10px 24px;background:var(--teal);color:#1c1c1e;border-radius:6px;font-family:var(--ui);font-size:0.85rem;display:inline-block">Browse files</span>
        </label>
      </div>
    `;
    return html;
  }
  
  // Show lesson content
  // Persistent tab bar — always visible regardless of view mode
  const _vm = LessonNotesState.viewMode;
  const _cur = LessonNotesState;
  const hasContent = _cur.vocab.length > 0 || _cur.stories.length > 0 || _cur.grammar.length > 0 || _cur.errors.length > 0;
  if (hasContent || LessonNotesState.extracting === false) {
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;flex-wrap:wrap;padding-bottom:10px;border-bottom:1px solid var(--border)">';
    html += '<button class="yoshi-read-btn btn-icon' + (_vm==='vocab'||_vm===''||(!_vm&&hasContent)?' active':'') + '" onclick="lessonNotesSetView(\'vocab\')">📚 Vocab (' + _cur.vocab.length + ')</button>';
    html += '<button class="yoshi-read-btn btn-icon' + (_vm==='stories'?' active':'') + '" onclick="lessonNotesSetView(\'stories\')">📖 Stories (' + _cur.stories.length + ')</button>';
    html += '<button class="yoshi-read-btn btn-icon' + (_vm==='keyphrases'?' active':'') + '" onclick="lessonNotesSetView(\'keyphrases\')">🔑 Phrases (' + _cur.keyPhrases.length + ')</button>';
    html += '<button class="yoshi-read-btn btn-icon' + (_vm==='grammar'||_vm==='grammardetail'?' active':'') + '" onclick="lessonNotesSetView(\'grammar\')">📝 Grammar (' + _cur.grammar.length + ')</button>';
    html += '<button class="yoshi-read-btn btn-icon' + (_vm==='errors'?' active':'') + '" onclick="lessonNotesSetView(\'errors\')">❌ Errors (' + _cur.errors.length + ')</button>';
    html += lnRecordingTabButton(currentSession);
    html += '</div>';
  }
  html += lessonNotesGetHTML();
  return html;
}

async function lessonNotesPanelHandlePaste(event) {
  event.preventDefault();
  const text = event.clipboardData?.getData('text');
  if (!text || !text.trim()) return;
  
  // Create new session from pasted text
  const sessions = lessonNotesGetSessions();
  const firstLine = text.split('\n')[0].slice(0, 30).trim() || 'Pasted notes';
  const title = firstLine + (firstLine.length >= 30 ? '...' : '');
  const newSession = { title, vocab: [], stories: [], keyPhrases: [], grammar: [], errors: [], docContent: [], rawText: '' };
  sessions.unshift(newSession);
  lessonNotesSaveSessions(sessions);
  LessonNotesState.currentIdx = 0;
  
  // Process pasted text
  LessonNotesState.rawText = text;
  LessonNotesState.docContent = lessonNotesParseWithTimestamps(text);
  sessions[0].rawText = text;
  sessions[0].docContent = LessonNotesState.docContent;
  lessonNotesSaveSessions(sessions);
  
  // Auto-extract
  if (LessonNotesState.docContent.length > 0) {
    LessonNotesState.extracting = true;
    lessonNotesRenderPanel();
    await lessonNotesAutoExtractAll();
    LessonNotesState.extracting = false;
  }
  // Re-assert index 0 — extract may have triggered re-renders that reset it
  LessonNotesState.currentIdx = 0;
  lessonNotesRenderPanel();
  lessonNotesUpdateDropdown();
}

async function lessonNotesPanelHandleDrop(event) {
  event.preventDefault();
  event.target.style.borderColor = 'var(--field-border)';
  event.target.style.background = 'none';
  
  const files = event.dataTransfer?.files;
  if (files?.length > 0) {
    await lessonNotesPanelHandleFile(files);
  }
}

async function lessonNotesPanelHandleFile(files) {
  if (!files || files.length === 0) return;
  const file = files[0];
  
  // Create new session
  const sessions = lessonNotesGetSessions();
  const title = file.name.replace(/\.(docx|txt|md)$/i, '');
  const newSession = { title, vocab: [], stories: [], keyPhrases: [], grammar: [], errors: [], docContent: [], rawText: '' };
  sessions.unshift(newSession);
  lessonNotesSaveSessions(sessions);
  LessonNotesState.currentIdx = 0;
  
  // Read file
  if (file.name.endsWith('.docx')) {
    await lessonNotesReadDocxForPanel(file);
  } else {
    const text = await file.text();
    LessonNotesState.rawText = text;
    LessonNotesState.docContent = lessonNotesParseWithTimestamps(text);
    sessions[0].rawText = text;
    sessions[0].docContent = LessonNotesState.docContent;
    lessonNotesSaveSessions(sessions);
  }
  
  // Auto-extract
  if (LessonNotesState.docContent.length > 0) {
    LessonNotesState.extracting = true;
    lessonNotesRenderPanel();
    await lessonNotesAutoExtractAll();
    LessonNotesState.extracting = false;
  }
  
  lessonNotesRenderPanel();
}

async function lessonNotesReadDocxForPanel(file) {
  // This will use the mammoth library if available
  if (typeof mammoth === 'undefined') {
    // Load mammoth
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const html = result.value;
  
  // Parse HTML to extract text and images
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  const content = [];
  doc.body.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) content.push({ type: 'text', value: text });
    } else if (node.tagName === 'P' || node.tagName === 'DIV') {
      const text = node.textContent.trim();
      if (text) content.push({ type: 'text', value: text });
    } else if (node.tagName === 'IMG') {
      content.push({ type: 'image', value: node.src });
    }
  });
  
  LessonNotesState.docContent = content;
  LessonNotesState.rawText = content.filter(c => c.type === 'text').map(c => c.value).join('\n');
  
  // Save to session
  const sessions = lessonNotesGetSessions();
  if (sessions[LessonNotesState.currentIdx]) {
    sessions[LessonNotesState.currentIdx].docContent = content;
    sessions[LessonNotesState.currentIdx].rawText = LessonNotesState.rawText;
    lessonNotesSaveSessions(sessions);
  }
}

function lessonNotesNewFromPanel() {
  const title = prompt('Lesson title:');
  if (!title) return;
  
  const sessions = lessonNotesGetSessions();
  sessions.unshift({ title, vocab: [], stories: [], keyPhrases: [], grammar: [], errors: [], docContent: [], rawText: '' });
  lessonNotesSaveSessions(sessions);
  LessonNotesState.currentIdx = 0;
  LessonNotesState.vocab = [];
  LessonNotesState.stories = [];
  LessonNotesState.keyPhrases = [];
  LessonNotesState.grammar = [];
  LessonNotesState.errors = [];
  LessonNotesState.docContent = [];
  LessonNotesState.viewMode = 'vocab';
  lessonNotesRenderPanel();
}

function lessonNotesDeleteFromPanel() {
  if (LessonNotesState.currentIdx === null) return;
  if (!confirm('Delete this lesson and all its content?')) return;
  
  const sessions = lessonNotesGetSessions();
  sessions.splice(LessonNotesState.currentIdx, 1);
  lessonNotesSaveSessions(sessions);
  
  LessonNotesState.currentIdx = null;
  LessonNotesState.vocab = [];
  LessonNotesState.vocabOriginal = [];
  LessonNotesState.stories = [];
  LessonNotesState.keyPhrases = [];
  LessonNotesState.grammar = [];
  LessonNotesState.errors = [];
  LessonNotesState.docContent = [];
  LessonNotesState.currentStory = null;
  LessonNotesState.grammarDetail = null;
  LessonNotesState.viewMode = 'vocab';
  
  lessonNotesRenderPanel();
}


// ── Recording link helpers ────────────────────────────────────────────────────

function lnRecordingTabButton(session) {
  if (!session) return '';
  const recId = session.linked_recording_id || null;
  if (!recId) {
    return '<button class="yoshi-read-btn btn-icon" onclick="lnShowLinkPicker()">🔗 Link recording</button>';
  }
  const recs = window._lessonRecordingSessions || [];
  const rec = recs.find(function(r) { return r.id === recId; });
  const hasTranscript = rec && rec.processed_at;
  let btns = '<button class="yoshi-read-btn ' + (LessonNotesState.viewMode==="recording"?"active":"") + ' btn-icon" onclick="lessonNotesSetView(\'recording\')">▶ Recording</button>';
  if (!hasTranscript) {
    btns += '<button class="yoshi-read-btn btn-icon" onclick="lnTranscribeLinked()">⚙ Transcribe</button>';
  }
  return btns;
}

function lnShowLinkPicker() {
  const recs = (window._lessonRecordingSessions || []).filter(function(r) { return !!r.audio_path; });
  if (!recs.length) { alert('No recordings available. Record a session first using the Session overlay.'); return; }

  const existing = document.getElementById('lnLinkPickerOverlay');
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement('div');
  overlay.id = 'lnLinkPickerOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';

  const box = document.createElement('div');
  box.style.cssText = 'background:var(--paper);border:1px solid var(--border);border-radius:10px;min-width:360px;max-width:480px;overflow:hidden';

  const header = document.createElement('div');
  header.style.cssText = 'padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center';
  header.innerHTML = '<span style="font-family:var(--ui);font-size:0.82rem;font-weight:600;color:var(--ink)">Link a recording</span>';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'background:none;border:none;color:var(--ink-light);cursor:pointer;font-size:1.1rem';
  closeBtn.onclick = function() { overlay.remove(); };
  header.appendChild(closeBtn);
  box.appendChild(header);

  recs.forEach(function(r) {
    // Use filename timestamp for accurate local time
    const tsMatch = r.audio_path ? r.audio_path.match(/_(\d{13})\.webm/) : null;
    const dt = tsMatch
      ? new Date(parseInt(tsMatch[1])).toLocaleString('en-GB', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})
      : r.created_at ? new Date(r.created_at).toLocaleString('en-GB', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : r.date || '?';
    const dur = (r.audio_duration_s > 0) ? Math.floor(r.audio_duration_s/60) + 'm ' + (r.audio_duration_s%60) + 's' : '';
    const done = r.processed_at ? ' ✓' : '';
    const row = document.createElement('div');
    row.style.cssText = 'padding:8px 14px;border-bottom:1px solid var(--border);font-family:var(--ui);font-size:0.82rem;color:var(--ink);display:flex;align-items:center;gap:8px';
    const info = document.createElement('div');
    info.style.cssText = 'flex:1;cursor:pointer';
    info.innerHTML = '<span style="color:var(--teal)">' + dt + '</span>' + (dur ? ' · ' + dur : '') + done;
    info.onmouseover = function() { row.style.background = 'var(--paper-dark)'; };
    info.onmouseout  = function() { row.style.background = ''; };
    info.onclick = function() { lnLinkRecording(r.id); };
    const delBtn = document.createElement('button');
    delBtn.textContent = '🗑';
    delBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:var(--ink-light);font-size:0.85rem;padding:2px 4px;flex-shrink:0';
    delBtn.title = 'Delete recording and audio files';
    delBtn.onclick = function(e) {
      e.stopPropagation();
      if (!confirm('Delete this recording and its audio files from disk?')) return;
      Orchestrator.deleteSession(r.id, r.audio_path, r.audio_path ? r.audio_path.replace('.webm','_teacher.webm') : null)
        .then(function() { overlay.remove(); })
        .catch(function(e) { alert('Delete failed: ' + e.message); });
    };
    row.appendChild(info);
    row.appendChild(delBtn);
    box.appendChild(row);
  });

  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}

function lnLinkRecording(recId) {
  const overlay = document.getElementById('lnLinkPickerOverlay');
  if (overlay) overlay.remove();
  const sessions = lessonNotesGetSessions();
  if (LessonNotesState.currentIdx === null) return;
  sessions[LessonNotesState.currentIdx].linked_recording_id = recId;
  lessonNotesSaveSessions(sessions);
  LessonNotesState.viewMode = 'recording';
  lessonNotesRenderPanel();
}

async function lnTranscribeLinked() {
  const sessions = lessonNotesGetSessions();
  const session = LessonNotesState.currentIdx !== null ? sessions[LessonNotesState.currentIdx] : null;
  if (!session || !session.linked_recording_id) return;
  try {
    await Orchestrator.transcribeSession(session.linked_recording_id);
  } catch(e) {
    alert('Transcription failed: ' + e.message);
  }
}

function lnRenderLinkedRecording(session) {
  if (!session) return '<div style="font-family:var(--ui);font-size:0.78rem;color:var(--ink-light);padding:20px">No lesson selected.</div>';
  const recId = session.linked_recording_id;
  if (!recId) {
    return '<div style="padding:20px;text-align:center">' +
      '<div style="font-family:var(--ui);font-size:0.88rem;color:var(--ink);margin-bottom:12px">No recording linked to this lesson yet.</div>' +
      '<button class="btn-ghost" onclick="lnShowLinkPicker()">\u{1F517} Link a recording</button>' +
    '</div>';
  }

  const recs = window._lessonRecordingSessions || [];
  const rec = recs.find(function(r) { return r.id === recId; });
  if (!rec) {
    return '<div style="font-family:var(--ui);font-size:0.78rem;color:var(--ink-light);padding:20px">Linked recording not found.</div>';
  }

  const startMatch2 = rec.audio_path ? rec.audio_path.match(/_(\d{13})\.webm/) : null;
  const dt = startMatch2
    ? new Date(parseInt(startMatch2[1])).toLocaleString('en-GB', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})
    : rec.created_at ? new Date(rec.created_at).toLocaleString('en-GB', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : rec.date || '';
  const apath = rec.audio_path;
  const tpath = apath.replace('.webm', '_teacher.webm');

  let html = '<div>';
  html += '<div style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light);margin-bottom:8px">' + dt + '</div>';

  // Audio players
  html += '<div style="background:var(--paper-dark);border:1px solid var(--border);border-radius:6px;padding:8px 12px;margin-bottom:10px">';
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">';
  html += '<span style="font-family:var(--ui);font-size:0.68rem;color:var(--ink-light);width:52px">\u{1F64B} You</span>';
  html += '<audio id="lnAudioStudent" src="file://' + apath + '" controls style="flex:1;height:26px;accent-color:var(--teal)"></audio>';
  html += '</div>';
  html += '<div style="display:flex;align-items:center;gap:8px">';
  html += '<span style="font-family:var(--ui);font-size:0.68rem;color:var(--ink-light);width:52px">\u{1F9D1}\u{200D}\u{1F3EB} Yoshi</span>';
  html += '<audio id="lnAudioTeacher" src="file://' + tpath + '" controls style="flex:1;height:26px;accent-color:var(--gold)"></audio>';
  html += '</div></div>';

  if (!rec.processed_at) {
    html += '<div style="font-family:var(--ui);font-size:0.78rem;color:var(--ink-light);padding:8px 0">Not yet transcribed. Click \u2699 Transcribe in the tab bar.</div>';
  } else {
    // Transcript toggle bar
    const _tm = LessonNotesState.transcriptMode || 'timeline';
    const _hasAlign = session.waAlignments && Object.keys(session.waAlignments).length > 0;
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border)">';
    html += '<span style="font-family:var(--ui);font-size:0.68rem;letter-spacing:0.08em;color:var(--ink-light)">TRANSCRIPT</span>';
    html += '<button class="yoshi-read-btn btn-icon' + (_tm==='audio'?' active':'') + '" onclick="lnSetTranscriptMode(\'audio\')" style="font-size:0.72rem;padding:3px 10px">\u{1F399} Audio</button>';
    html += '<button class="yoshi-read-btn btn-icon' + (_tm==='timeline'?' active':'') + '" onclick="lnSetTranscriptMode(\'timeline\')" style="font-size:0.72rem;padding:3px 10px">\u{1F500} Timeline</button>';
    html += '<button id="lnAlignBtn" class="yoshi-read-btn btn-icon" onclick="lnAlignTimeline()" style="font-size:0.72rem;padding:3px 10px">' + (_hasAlign ? '\u2713 Re-align' : '\u26A1 Align') + '</button>';
    html += '</div>';

    // Transcript area — preserve content across re-renders
    const _existingTA = document.getElementById('lnTranscriptArea');
    const _sameRec = LessonNotesState._transcriptRecId === recId;
    const _taContent = (_sameRec && _existingTA && _existingTA.children.length > 2) ? _existingTA.innerHTML : null;
    html += '<div id="lnTranscriptArea" style="max-height:calc(100vh - 360px);overflow-y:auto;margin-bottom:16px">';
    html += _taContent || '';
    html += '</div>';

    // Load transcript if not preserved
    if (!_taContent) {
      LessonNotesState._transcriptRecId = recId;
      setTimeout(function() { lnLoadTranscript(recId, LessonNotesState.transcriptMode || 'timeline'); }, 50);
    }
  }

  // Source notes with search
  const _lnEsc = App.escHtml || window.escHtml || function(s){return s;};
  const _lnParseWA = App.yoshiParseWhatsapp || window.yoshiParseWhatsapp;
  const _lnRaw = LessonNotesState.rawText || '';
  let _lnDocHtml = '';
  if (_lnRaw && _lnParseWA) {
    const _lnMsgs = _lnParseWA(_lnRaw);
    _lnDocHtml = _lnMsgs.length ? _lnSourceNotesHtml(_lnMsgs)
      : '<div style="font-family:var(--ui);font-size:0.78rem;color:var(--ink-light)">No messages found</div>';
  } else {
    _lnDocHtml = '<pre style="font-family:var(--jp);font-size:0.88rem;line-height:1.7;white-space:pre-wrap">' + _lnEsc(_lnRaw) + '</pre>';
  }
  html += '<div style="padding-top:12px;border-top:1px solid var(--border)">';
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">';
  html += '<span style="font-family:var(--ui);font-size:0.68rem;letter-spacing:0.08em;color:var(--ink-light)">SOURCE NOTES</span>';
  html += '<input type="text" id="lnFullDocSearch" placeholder="Search\u2026" oninput="lnFullDocDoSearch(this.value)" '
    + 'style="flex:1;padding:4px 8px;background:var(--field);border:1px solid var(--field-border);'
    + 'border-radius:4px;font-family:var(--ui);font-size:0.78rem;color:var(--ink);max-width:200px">';
  html += '</div>';
  html += '<div id="lnFullDocContent" style="max-height:250px;overflow-y:auto">' + _lnDocHtml + '</div>';
  html += '</div>';

  html += '</div>';
  return html;
}

function _lnSourceNotesHtml(messages) {
  const esc = App.escHtml || window.escHtml || function(s){return s;};
  return messages.map(function(m) {
    const isYoshi = !(/paulandres|paul/i.test(m.sender));
    return '<div style="display:flex;gap:10px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04)">'
      + '<span style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light);flex-shrink:0;min-width:44px;padding-top:3px">' + esc(m.time) + '</span>'
      + '<span style="font-family:var(--jp);font-size:0.88rem;line-height:1.7;color:' + (isYoshi ? 'var(--teal)' : 'var(--ink)') + '">' + esc(m.text) + '</span>'
      + '</div>';
  }).join('');
}

function lnFullDocDoSearch(term) {
  const el = document.getElementById('lnFullDocContent');
  if (!el) return;
  const _parseWA = App.yoshiParseWhatsapp || window.yoshiParseWhatsapp;
  const msgs = _parseWA ? _parseWA(LessonNotesState.rawText || '') : [];
  if (!term) {
    el.innerHTML = msgs.length ? _lnSourceNotesHtml(msgs) : '';
    return;
  }
  const esc = App.escHtml || window.escHtml || function(s){return s;};
  const regex = new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')','gi');
  const filtered = msgs.filter(function(m){ return m.text.toLowerCase().includes(term.toLowerCase()); });
  el.innerHTML = filtered.map(function(m) {
    const isYoshi = !(/paulandres|paul/i.test(m.sender));
    const highlighted = esc(m.text).replace(regex,'<mark style="background:var(--gold);color:#1c1c1e;padding:0 2px">$1</mark>');
    return '<div style="display:flex;gap:10px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04)">'
      + '<span style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light);flex-shrink:0;min-width:44px;padding-top:3px">' + esc(m.time) + '</span>'
      + '<span style="font-family:var(--jp);font-size:0.88rem;line-height:1.7;color:' + (isYoshi ? 'var(--teal)' : 'var(--ink)') + '">' + highlighted + '</span>'
      + '</div>';
  }).join('') || '<span style="color:var(--ink-light)">No matches</span>';
}

async function lnLoadTranscript(recId, mode) {
  const el = document.getElementById('lnTranscriptArea');
  if (!el) return;
  try {
    const rows = await window.db.query(
      'SELECT transcript_json FROM lesson_sessions WHERE id=?', [recId]
    );
    if (!rows || !rows[0] || !rows[0].transcript_json) {
      el.innerHTML = '<span style="color:var(--ink-light)">No transcript data found.</span>';
      return;
    }
    const turns = JSON.parse(rows[0].transcript_json);
    if (!turns.length) { el.innerHTML = '<span style="color:var(--ink-light)">Empty transcript.</span>'; return; }

    // Re-fetch el in case DOM rebuilt during DB query
    const elFresh = document.getElementById('lnTranscriptArea');
    if (!elFresh) return;
    elFresh.innerHTML = '';
    // Extract recording start time from audio path filename: lesson_YYYY-MM-DD_TIMESTAMP.webm
    const rec2 = (window._lessonRecordingSessions||[]).find(function(r){return r.id===recId;});
    const startMatch = rec2 && rec2.audio_path ? rec2.audio_path.match(/_(\d{13})\.webm/) : null;
    const startMs = startMatch ? parseInt(startMatch[1]) : null;

    // Route to timeline mode if requested — use two-column aligned renderer
    if (mode === 'timeline') { lnLoadTwoColumnTimeline(recId, el, turns, startMs); return; }

    turns.forEach(function(t) {
      const ts = Math.round(t.start != null ? t.start : (t.timestamp != null ? t.timestamp : 0));
      const m = Math.floor(ts/60), s = ts%60;
      const offsetStr = m + ':' + String(s).padStart(2,'0');
      let timeStr = offsetStr;
      let titleStr = offsetStr + ' from start';
      if (startMs) {
        const wallDate = new Date(startMs + ts * 1000);
        timeStr = wallDate.toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
        titleStr = timeStr + ' (' + offsetStr + ' from start)';
      }
      const label = t.speaker === 'teacher' ? '🧑‍🏫' : '🙋';
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:10px;padding:5px 6px;border-radius:4px;cursor:pointer';
      row.onmouseover = function() { row.style.background = 'var(--paper-dark)'; };
      row.onmouseout  = function() { row.style.background = ''; };
      row.onclick = (function(sec) { return function() { lnSeekToTime(sec); }; })(ts);
      row.innerHTML =
        '<span title="' + titleStr + '" style="color:var(--teal);flex-shrink:0;font-variant-numeric:tabular-nums;min-width:44px;font-size:0.75rem">' + timeStr + '</span>' +
        '<span style="flex-shrink:0">' + label + '</span>' +
        '<span style="color:var(--ink);line-height:1.6;font-size:1rem">' + (t.text||'') + '</span>';
      elFresh.appendChild(row);
    });
  } catch(e) {
    const elErr = document.getElementById('lnTranscriptArea');
    if (elErr) elErr.innerHTML = '<span style="color:var(--red)">Error loading transcript: ' + e.message + '</span>';
  }
}


function lnShowTranscriptContainer(recId) {
  // Deprecated — transcript now renders inline in lnRenderLinkedRecording
  // Keep stub so existing calls don't error
  LessonNotesState._transcriptRecId = recId;
}

function lnSetTranscriptMode(mode) {
  LessonNotesState.transcriptMode = mode;
  const ta = document.getElementById('lnTranscriptArea');
  if (ta) ta.innerHTML = '';
  const recId = LessonNotesState._transcriptRecId;
  if (recId) lnLoadTranscript(recId, mode);
  const audioBtn = document.querySelector('.yoshi-read-btn[onclick*="audio"]');
  const timelineBtn = document.querySelector('.yoshi-read-btn[onclick*="timeline"]');
  if (audioBtn) audioBtn.classList.toggle('active', mode === 'audio');
  if (timelineBtn) timelineBtn.classList.toggle('active', mode === 'timeline');
}

async function lnLoadTimeline(recId, _elParam, turns, startMs) {
  // Parse WhatsApp messages from session rawText
  const sessions = lessonNotesGetSessions();
  const session = LessonNotesState.currentIdx !== null ? sessions[LessonNotesState.currentIdx] : null;
  const rawText = session && session.rawText ? session.rawText : '';
  const _parseWA = App.yoshiParseWhatsapp || window.yoshiParseWhatsapp;
  const waMsgs = rawText && _parseWA ? _parseWA(rawText) : [];

  // Convert WhatsApp HH:MM(:SS) time strings to seconds from recording start
  // We have startMs (unix ms) for the recording. WA times are wall clock HH:MM.
  // Build a Date from the recording date + WA time to get a comparable wall time.
  function waTimeToSeconds(timeStr) {
    if (!startMs) return null;
    const startDate = new Date(startMs);
    const parts = timeStr.split(':');
    const h = parseInt(parts[0]), m = parseInt(parts[1]), s = parseInt(parts[2] || 0);
    // Construct a date with the same Y/M/D as the recording but WA time
    const wDate = new Date(startDate);
    wDate.setHours(h, m, s, 0);
    return (wDate.getTime() - startMs) / 1000;
  }

  // Build merged entries — audio segments + Yoshi's WA messages only
  const merged = [];

  for (const t of turns) {
    const ts = Math.round(t.start != null ? t.start : (t.timestamp != null ? t.timestamp : 0));
    merged.push({ type: 'audio', ts, text: t.text || '', speaker: t.speaker });
  }

  for (const msg of waMsgs) {
    // Only include Yoshi's messages — skip messages from the student
    if (!msg.sender || /paulandres|paul/i.test(msg.sender)) continue;
    // Skip any message where text looks like an unparsed header
    if (!msg.text || msg.text.startsWith('[')) continue;
    const secs = waTimeToSeconds(msg.time);
    if (secs === null || secs < -120) continue; // allow up to 2 min before recording
    merged.push({ type: 'whatsapp', ts: secs, text: msg.text, sender: msg.sender, waTime: msg.time });
  }

  // Sort by timestamp
  merged.sort(function(a, b) { return a.ts - b.ts; });

  // Look up element fresh in case DOM was rebuilt during async work
  const el = document.getElementById('lnTranscriptArea') || _elParam;
  if (!el) return;
  el.innerHTML = '';

  if (!merged.length) {
    el.innerHTML = '<span style="color:var(--ink-light)">No content to display.</span>';
    return;
  }

  for (const entry of merged) {
    const row = document.createElement('div');

    if (entry.type === 'audio') {
      // Audio transcript row — seekable, teal time
      const m = Math.floor(entry.ts / 60), s = entry.ts % 60;
      const offsetStr = m + ':' + String(s).padStart(2, '0');
      let timeStr = offsetStr;
      if (startMs) {
        const wallDate = new Date(startMs + entry.ts * 1000);
        timeStr = wallDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
      row.style.cssText = 'display:flex;gap:8px;padding:4px 6px;border-radius:4px;cursor:pointer;align-items:baseline';
      row.onmouseover = function() { row.style.background = 'var(--paper-dark)'; };
      row.onmouseout  = function() { row.style.background = ''; };
      row.onclick = (function(sec) { return function() { lnSeekToTime(sec); }; })(entry.ts);
      row.innerHTML =
        '<span style="color:var(--teal);flex-shrink:0;font-size:0.72rem;min-width:44px;font-variant-numeric:tabular-nums" title="' + offsetStr + ' from start">' + timeStr + '</span>' +
        '<span style="flex-shrink:0;font-size:0.8rem">🙋</span>' +
        '<span style="color:var(--ink);line-height:1.6;font-size:1rem">' + (App.escHtml || window.escHtml || function(s){return s;})(entry.text) + '</span>';
    } else {
      // WhatsApp message row — gold, not seekable
      row.style.cssText = 'display:flex;gap:8px;padding:6px 6px 6px 10px;border-radius:4px;align-items:baseline;border-left:2px solid var(--gold);margin:4px 0';
      row.innerHTML =
        '<span style="color:var(--gold);flex-shrink:0;font-size:0.72rem;min-width:44px;font-variant-numeric:tabular-nums">' + entry.waTime + '</span>' +
        '<span style="flex-shrink:0;font-size:0.8rem">🧑‍🏫</span>' +
        '<span style="color:var(--ink);line-height:1.6;font-size:0.88rem">' + (App.escHtml || window.escHtml || function(s){return s;})(entry.text) + '</span>';
    }
    el.appendChild(row);
  }
}

function lnSeekToTime(secs) {
  const student = document.getElementById('lnAudioStudent');
  const teacher = document.getElementById('lnAudioTeacher');
  if (student) { student.currentTime = secs; student.play().catch(function(){}); }
  if (teacher) { teacher.currentTime = secs; }
}



function lessonNotesGetHTML() {
  const sessions = lessonNotesGetSessions();
  const currentSession = LessonNotesState.currentIdx !== null ? sessions[LessonNotesState.currentIdx] : null;
  const hasVocab = LessonNotesState.vocab.length > 0;
  const hasStories = LessonNotesState.stories.length > 0;
  
  // Update tab bar controls
  lessonNotesUpdateTabControls(sessions, hasVocab || hasStories);
  
  // Reading mode - show story with Quick Read style
  if (LessonNotesState.viewMode === 'reading' && LessonNotesState.currentStory) {
    return lessonNotesRenderReading();
  }
  
  // Stories mode - show story tiles
  if (LessonNotesState.viewMode === 'stories') {
    return lessonNotesRenderStories();
  }
  
  // Key phrases mode
  if (LessonNotesState.viewMode === 'keyphrases') {
    return lessonNotesRenderKeyPhrases();
  }
  
  // Grammar mode
  if (LessonNotesState.viewMode === 'grammar') {
    return lessonNotesRenderGrammar();
  }
  
  // Grammar detail mode
  if (LessonNotesState.viewMode === 'grammardetail') {
    return lessonNotesRenderGrammarDetail();
  }
  
  // Errors mode
  if (LessonNotesState.viewMode === 'errors') {
    return lessonNotesRenderErrors();
  }
  
  // Recording tab — linked recording player + transcript
  if (LessonNotesState.viewMode === 'recording') {
    return lnRenderLinkedRecording(currentSession);
  }
  
  // If we have vocab, show compact drill view
  if (hasVocab || hasStories || LessonNotesState.errors.length > 0) {
    return `
    <!-- Drill controls -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
      <button class="yoshi-read-btn ${LessonNotesState.drillMode==='jp2reading'?'active':''} btn-icon" onclick="lessonNotesSetMode('jp2reading')">JP → Reading</button>
      <button class="yoshi-read-btn ${LessonNotesState.drillMode==='jp2en'?'active':''} btn-icon" onclick="lessonNotesSetMode('jp2en')">JP → Meaning</button>
      <button class="yoshi-read-btn ${LessonNotesState.drillMode==='en2jp'?'active':''} btn-icon" onclick="lessonNotesSetMode('en2jp')">EN → JP</button>
      <button class="yoshi-read-btn ${LessonNotesState.drillMode==='listening'?'active':''} btn-icon" onclick="lessonNotesSetMode('listening')">🔊 Listen</button>
      <button class="yoshi-read-btn ${LessonNotesState.shuffled?'active':''} btn-icon" onclick="lessonNotesToggleShuffle()">🔀 ${LessonNotesState.shuffled?'Ordered':'Shuffle'}</button>
      <button class="yoshi-read-btn btn-icon" onclick="lessonNotesDrillAll()">📚 Drill All</button>
    </div>
    
    <!-- Drill card -->
    <div id="lessonNotesDrillArea" style="background:var(--paper-dark);border:1px solid var(--border);border-radius:8px;padding:20px;margin-bottom:12px">
      ${lessonNotesRenderDrillCard()}
    </div>
    
    <!-- All controls in one line -->
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">
      <span style="font-family:var(--ui);font-size:0.68rem;color:var(--ink-light)">Show:</span>
      <button class="yoshi-read-btn ${LessonNotesState.showReading?'active':''} btn-icon" onclick="lessonNotesToggleShowReading()">+Reading</button>
      <button class="yoshi-read-btn ${LessonNotesState.showMeaning?'active':''} btn-icon" onclick="lessonNotesToggleShowMeaning()">+Meaning</button>
      <span style="color:var(--border)">│</span>
      <button class="yoshi-read-btn btn-icon" onclick="lessonNotesToggleTable()">${LessonNotesState.tableHidden ? '👁' : '🙈'} Word List</button>
      <button class="yoshi-read-btn btn-icon" onclick="lessonNotesBreakdownCurrent()">🔍 Break down</button>
      <button class="yoshi-read-btn btn-icon" onclick="lessonNotesExamplesCurrent()">📝 Examples</button>
      ${LessonNotesState.hiddenWords.size > 0 ? `
        <span style="color:var(--border)">│</span>
        <button class="yoshi-read-btn btn-icon" onclick="lessonNotesSaveHiddenPermanently()">💾 Save ${LessonNotesState.hiddenWords.size} learned</button>
        <button class="yoshi-read-btn btn-icon" onclick="lessonNotesRestoreHidden()">↩ Restore</button>
      ` : ''}
      ${LessonNotesState.permanentlyLearned.size > 0 ? `
        <span style="color:var(--border);margin-left:auto">│</span>
        <span style="font-family:var(--ui);font-size:0.62rem;color:var(--ink-light)">📚 ${LessonNotesState.permanentlyLearned.size} mastered</span>
        <button class="yoshi-read-btn btn-icon" onclick="lessonNotesShowMastered()">View</button>
        <button class="yoshi-read-btn btn-icon" onclick="lessonNotesClearMastered()">Clear</button>
      ` : ''}
    </div>
    
    <!-- Breakdown/Examples area (shown when requested) -->
    <div id="lessonNotesBreakdownArea" style="display:none;background:var(--paper-dark);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px">
    </div>
    
    <!-- Vocab table (hideable) -->
    <div style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;${LessonNotesState.tableHidden?'display:none':''}">
      <table style="width:100%;border-collapse:collapse;font-family:var(--jp);font-size:0.88rem">
        <thead style="position:sticky;top:0;background:var(--paper-dark)">
          <tr style="border-bottom:1px solid var(--border)">
            <th style="text-align:left;padding:8px 10px;font-family:var(--ui);font-size:0.7rem;letter-spacing:0.06em;color:var(--ink-light);font-weight:500">WORD</th>
            <th style="text-align:left;padding:8px 10px;font-family:var(--ui);font-size:0.7rem;letter-spacing:0.06em;color:var(--ink-light);font-weight:500">READING</th>
            <th style="text-align:left;padding:8px 10px;font-family:var(--ui);font-size:0.7rem;letter-spacing:0.06em;color:var(--ink-light);font-weight:500">MEANING</th>
            <th style="width:40px"></th>
          </tr>
        </thead>
        <tbody>
          ${LessonNotesState.vocab.map((v,i) => `
            <tr style="border-bottom:1px solid var(--border);${i===LessonNotesState.drillIdx?'background:rgba(48,213,200,0.1)':''}">
              <td style="padding:6px 10px;color:var(--ink)">${v.word || ''}</td>
              <td style="padding:6px 10px;color:var(--ink-light)">${v.reading || '—'}</td>
              <td style="padding:6px 10px;color:var(--ink-light);font-size:0.82rem">${v.meaning || v.en || '—'}</td>
              <td style="padding:6px 4px"><button class="btn-icon" onclick="jpSpeak('${(v.word||'').replace(/'/g,"\\'")}')">🔊</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    `;
  }
  
  // No vocab - show full import view
  return `
    <!-- Drop zone / Input area -->
    <div id="lessonNotesDropZone" 
      ondragover="event.preventDefault();this.style.borderColor='var(--teal)';this.style.background='rgba(48,213,200,0.05)'"
      ondragleave="this.style.borderColor='var(--field-border)';this.style.background='none'"
      ondrop="lessonNotesHandleDrop(event)"
      style="border:2px dashed var(--field-border);border-radius:8px;padding:16px;margin-bottom:16px;transition:all 0.2s">
      
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <input type="text" id="lessonNotesTitle" placeholder="Lesson title (e.g., 2024-03-22 Yoshi-sensei)" 
          value="${currentSession?.title || ''}"
          style="flex:1;padding:8px 12px;background:var(--field);border:1px solid var(--field-border);color:var(--ink);font-family:var(--ui);font-size:0.9rem;border-radius:6px;outline:none">
        <label style="padding:6px 12px;background:none;border:1px solid var(--border);border-radius:6px;font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);cursor:pointer">
          📄 Browse
          <input type="file" accept=".docx,.txt" onchange="lessonNotesHandleFile(this.files[0])" style="display:none">
        </label>
        <button class="yoshi-read-btn btn-icon" onclick="lessonNotesExtract()">✨ Extract & Save</button>
      </div>
      
      <textarea id="lessonNotesInput" placeholder="Drop a .docx file here, or paste your teacher's notes…

Examples of what it extracts:
• 病気　びょうき (word + reading)
• 歴史　れきし　history (word + reading + meaning)
• Sentences with （readings） or 【brackets】"
        style="width:100%;min-height:100px;padding:12px;background:var(--field);border:1px solid var(--field-border);color:var(--ink);font-family:var(--jp);font-size:0.9rem;line-height:1.7;border-radius:6px;outline:none;resize:vertical">${currentSession?.rawText || ''}</textarea>
      
      <div style="text-align:center;padding:8px 0 0;font-family:var(--ui);font-size:0.72rem;color:var(--ink-light)">
        Drop .docx file here or paste text above
      </div>
    </div>
    
    <div style="text-align:center;padding:30px;color:var(--ink-light);font-family:var(--ui);font-size:0.85rem">
      ${sessions.length > 0 ? 'Select a lesson from the dropdown or import new notes above' : 'Import lesson notes above and click "Extract & Save" to get started'}
    </div>
  `;
}

function lessonNotesUpdateTabControls(sessions, hasContent) {
  const el = document.getElementById('lessonNotesTabControls');
  if (!el) return;
  
  el.style.display = 'flex';
  el.innerHTML = `
    <select id="lessonNotesSessionSelect" onchange="lessonNotesLoadSession(parseInt(this.value))"
      style="padding:4px 8px;background:var(--field);border:1px solid var(--field-border);color:var(--ink);font-family:var(--ui);font-size:0.75rem;border-radius:4px;max-width:180px">
      <option value="-1">— New lesson —</option>
      ${sessions.map((s, i) => `<option value="${i}" ${i === LessonNotesState.currentIdx ? 'selected' : ''}>${s.title || 'Untitled'} (${s.vocab?.length || 0})</option>`).join('')}
    </select>
    <button class="yoshi-read-btn btn-icon" onclick="lessonNotesNew()" title="New lesson">+</button>
    ${hasContent ? `<button class="yoshi-read-btn btn-icon" onclick="lessonNotesShowEdit()" title="Edit notes">✏️</button>` : ''}
    ${LessonNotesState.currentIdx !== null ? `<button class="yoshi-read-btn btn-icon" onclick="lessonNotesDelete()" title="Delete">🗑</button>` : ''}
  `;
}

function lessonNotesSetView(mode) {
  LessonNotesState.viewMode = mode;
  LessonNotesState.currentStory = null;
  // Hide persistent transcript container when leaving recording view
  const tc = document.getElementById('lnTranscriptContainer');
  if (tc && mode !== 'recording') tc.style.display = 'none';
  lessonNotesRender();
}

function lessonNotesRenderStories() {
  return `
    <!-- Story tiles -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
      ${LessonNotesState.stories.map((s, i) => `
        <div onclick="lessonNotesOpenStory(${i})" 
          style="background:var(--paper-dark);border:1px solid var(--border);border-radius:8px;padding:16px;cursor:pointer;transition:all 0.15s"
          onmouseover="this.style.borderColor='var(--teal)'"
          onmouseout="this.style.borderColor='var(--border)'">
          <div style="font-family:var(--jp);font-size:1.1rem;color:var(--ink);margin-bottom:8px;line-height:1.4">${s.title}</div>
          <div style="font-family:var(--jp);font-size:0.8rem;color:var(--ink-light);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${s.text.substring(0, 60)}…</div>
        </div>
      `).join('')}
    </div>
  `;
}

function lessonNotesRenderErrors() {
  return `
    ${LessonNotesState.errors.length === 0 ? `
      <div style="text-align:center;padding:40px;color:var(--ink-light);font-family:var(--ui)">
        No errors found in this lesson
      </div>
    ` : `
      <div style="display:flex;flex-direction:column;gap:12px">
        ${LessonNotesState.errors.map((err, i) => `
          <div style="background:var(--paper-dark);border:1px solid var(--border);border-radius:8px;padding:16px">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap">
              <span style="font-family:var(--jp);font-size:1.1rem;color:var(--red);text-decoration:line-through">${err.wrong}</span>
              <span style="color:var(--ink-light)">→</span>
              <span style="font-family:var(--jp);font-size:1.1rem;color:var(--teal)">${err.correct}</span>
              <button class="btn-icon" onclick="jpSpeak('${(err.correct||'').replace(/'/g,"\\'")}')">🔊</button>
            </div>
            <div style="font-family:var(--ui);font-size:0.85rem;color:var(--ink-light);line-height:1.5;padding-left:4px;border-left:2px solid var(--border)">${err.note || ''}</div>
          </div>
        `).join('')}
      </div>
    `}
  `;
}

function lessonNotesRenderKeyPhrases() {
  return `
    ${LessonNotesState.keyPhrases.length === 0 ? `
      <div style="text-align:center;padding:40px;color:var(--ink-light);font-family:var(--ui)">
        <div style="margin-bottom:12px">No key phrases extracted yet</div>
        <button onclick="lessonNotesExtractKeyPhrases()" class="yoshi-read-btn btn-icon">🔑 Extract Key Phrases</button>
      </div>
    ` : `
      <div style="display:flex;flex-direction:column;gap:10px">
        ${LessonNotesState.keyPhrases.map((kp, i) => `
          <div style="background:linear-gradient(135deg, rgba(212,165,116,0.08), rgba(212,165,116,0.02));border:1px solid rgba(212,165,116,0.3);border-radius:8px;padding:14px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
              <span style="font-family:var(--jp);font-size:1.15rem;color:var(--ink)">${kp.phrase}</span>
              <button class="btn-icon" onclick="jpSpeak('${(kp.phrase||'').replace(/'/g,"\\'")}')">🔊</button>
            </div>
            <div style="font-family:var(--ui);font-size:0.88rem;color:var(--ink-light)">${kp.meaning || ''}</div>
            ${kp.example ? `<div style="font-family:var(--jp);font-size:0.9rem;color:var(--ink);margin-top:8px;padding:8px;background:var(--paper-dark);border-radius:4px">${kp.example}</div>` : ''}
          </div>
        `).join('')}
      </div>
      <div style="margin-top:12px;text-align:center">
        <button onclick="lessonNotesExtractKeyPhrases()" class="yoshi-read-btn btn-icon">🔄 Re-extract</button>
      </div>
    `}
  `;
}

function lessonNotesRenderGrammar() {
  const visibleGrammar = LessonNotesState.grammar.map((g, i) => ({...g, _idx: i})).filter((g, i) => LessonNotesState.showHiddenGrammar || !LessonNotesState.grammarHidden.has(i));
  const hiddenCount = LessonNotesState.grammarHidden.size;
  
  return `
    ${LessonNotesState.grammar.length === 0 ? `
      <div style="text-align:center;padding:40px;color:var(--ink-light);font-family:var(--ui)">
        <div style="margin-bottom:12px">No grammar points extracted yet</div>
        <button onclick="lessonNotesExtractGrammar()" class="yoshi-read-btn btn-icon">📝 Extract Grammar</button>
      </div>
    ` : `
      ${hiddenCount > 0 ? `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:8px 12px;background:var(--paper-dark);border-radius:6px">
          <span style="font-family:var(--ui);font-size:0.78rem;color:var(--ink-light)">${hiddenCount} hidden</span>
          <button onclick="lessonNotesToggleShowHidden()" class="yoshi-read-btn btn-icon">${LessonNotesState.showHiddenGrammar ? '👁 Hide' : '👁 Show'} hidden</button>
        </div>
      ` : ''}
      <div style="display:flex;flex-direction:column;gap:10px;overflow-y:visible">
        ${visibleGrammar.map(g => `
          <div style="background:linear-gradient(135deg, rgba(48,213,200,0.08), rgba(48,213,200,0.02));border:1px solid ${LessonNotesState.grammarHidden.has(g._idx) ? 'var(--ink-light)' : 'rgba(48,213,200,0.3)'};border-radius:8px;padding:14px;transition:all 0.15s;${LessonNotesState.grammarHidden.has(g._idx) ? 'opacity:0.5' : ''}">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <span onclick="lessonNotesOpenGrammarDetail(${g._idx})" style="font-family:var(--jp);font-size:1.15rem;color:var(--teal);font-weight:500;cursor:pointer;flex:1">${g.pattern}</span>
              <button class="btn-ghost" onclick="event.stopPropagation();lessonNotesEditGrammar(${g._idx})" title="Edit">✏️</button>
              <button class="btn-ghost" onclick="event.stopPropagation();lessonNotesToggleGrammarHide(${g._idx})" title="${LessonNotesState.grammarHidden.has(g._idx) ? 'Show' : 'Hide'}">${LessonNotesState.grammarHidden.has(g._idx) ? '👁' : '🙈'}</button>
              <button class="btn-ghost" onclick="event.stopPropagation();lessonNotesDeleteGrammar(${g._idx})" title="Delete">✕</button>
              <span onclick="lessonNotesOpenGrammarDetail(${g._idx})" style="font-family:var(--ui);font-size:0.7rem;color:var(--ink-light);cursor:pointer">Study →</span>
            </div>
            <div onclick="lessonNotesOpenGrammarDetail(${g._idx})" style="font-family:var(--ui);font-size:0.88rem;color:var(--ink);line-height:1.5;cursor:pointer">${g.explanation || ''}</div>
            ${g.example ? `
              <div onclick="lessonNotesOpenGrammarDetail(${g._idx})" style="margin-top:10px;padding:10px;background:var(--paper-dark);border-radius:4px;border-left:3px solid var(--teal);cursor:pointer">
                <div style="font-family:var(--jp);font-size:0.95rem;color:var(--ink)">${g.example}</div>
                ${g.exampleMeaning ? `<div style="font-family:var(--ui);font-size:0.8rem;color:var(--ink-light);margin-top:4px">${g.exampleMeaning}</div>` : ''}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
      <div style="margin-top:12px;text-align:center">
        <button onclick="lessonNotesExtractGrammar()" class="yoshi-read-btn btn-icon">🔄 Re-extract</button>
      </div>
    `}
  `;
}

function lessonNotesToggleGrammarHide(idx) {
  if (LessonNotesState.grammarHidden.has(idx)) {
    LessonNotesState.grammarHidden.delete(idx);
  } else {
    LessonNotesState.grammarHidden.add(idx);
  }
  lessonNotesRender();
  lessonNotesRenderPanel();
}

function lessonNotesToggleShowHidden() {
  LessonNotesState.showHiddenGrammar = !LessonNotesState.showHiddenGrammar;
  lessonNotesRender();
  lessonNotesRenderPanel();
}


function lessonNotesEditGrammar(idx) {
  const g = LessonNotesState.grammar[idx];
  if (!g) return;
  
  // Create edit modal
  const modal = document.createElement('div');
  modal.id = 'grammarEditModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999';
  modal.innerHTML = `
    <div style="background:var(--paper);border:1px solid var(--border);border-radius:12px;padding:24px;max-width:500px;width:90%;max-height:80vh;overflow-y:auto">
      <div style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light);letter-spacing:0.05em;margin-bottom:16px">EDIT GRAMMAR POINT</div>
      
      <div style="margin-bottom:14px">
        <label style="display:block;font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-bottom:4px">Pattern</label>
        <input type="text" id="grammarEditPattern" value="${g.pattern.replace(/"/g, '&quot;')}" 
          style="width:100%;padding:10px;background:var(--field);border:1px solid var(--field-border);border-radius:6px;font-family:'Noto Sans JP',var(--ui);font-size:1rem;color:var(--ink);box-sizing:border-box">
      </div>
      
      <div style="margin-bottom:14px">
        <label style="display:block;font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-bottom:4px">Explanation</label>
        <textarea id="grammarEditExplanation" rows="3"
          style="width:100%;padding:10px;background:var(--field);border:1px solid var(--field-border);border-radius:6px;font-family:var(--ui);font-size:0.9rem;color:var(--ink);resize:vertical;box-sizing:border-box">${g.explanation || ''}</textarea>
      </div>
      
      <div style="margin-bottom:14px">
        <label style="display:block;font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-bottom:4px">Example</label>
        <input type="text" id="grammarEditExample" value="${(g.example || '').replace(/"/g, '&quot;')}" 
          style="width:100%;padding:10px;background:var(--field);border:1px solid var(--field-border);border-radius:6px;font-family:'Noto Sans JP',var(--ui);font-size:0.95rem;color:var(--ink);box-sizing:border-box">
      </div>
      
      <div style="margin-bottom:20px">
        <label style="display:block;font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-bottom:4px">Example Meaning</label>
        <input type="text" id="grammarEditExampleMeaning" value="${(g.exampleMeaning || '').replace(/"/g, '&quot;')}" 
          style="width:100%;padding:10px;background:var(--field);border:1px solid var(--field-border);border-radius:6px;font-family:var(--ui);font-size:0.9rem;color:var(--ink);box-sizing:border-box">
      </div>
      
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn-ghost" onclick="document.getElementById('grammarEditModal').remove()">Cancel</button>
        <button class="btn-primary" onclick="lessonNotesSaveGrammarEdit(${idx})">Save</button>
      </div>
    </div>
  `;
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  
  document.body.appendChild(modal);
  document.getElementById('grammarEditPattern').focus();
}

function lessonNotesSaveGrammarEdit(idx) {
  const pattern = document.getElementById('grammarEditPattern').value.trim();
  const explanation = document.getElementById('grammarEditExplanation').value.trim();
  const example = document.getElementById('grammarEditExample').value.trim();
  const exampleMeaning = document.getElementById('grammarEditExampleMeaning').value.trim();
  
  if (!pattern) {
    alert('Pattern is required');
    return;
  }
  
  LessonNotesState.grammar[idx] = {
    ...LessonNotesState.grammar[idx],
    pattern,
    explanation,
    example: example || null,
    exampleMeaning: exampleMeaning || null
  };
  
  document.getElementById('grammarEditModal').remove();
  lessonNotesRender();
  lessonNotesRenderPanel();
}

function lessonNotesDeleteGrammar(idx) {
  const g = LessonNotesState.grammar[idx];
  if (!g) return;
  
  if (!confirm(`Delete grammar point "${g.pattern}"?`)) return;
  
  LessonNotesState.grammar.splice(idx, 1);
  
  // Update hidden set indices
  const newHidden = new Set();
  LessonNotesState.grammarHidden.forEach(i => {
    if (i < idx) newHidden.add(i);
    else if (i > idx) newHidden.add(i - 1);
  });
  LessonNotesState.grammarHidden = newHidden;
  
  lessonNotesRender();
  lessonNotesRenderPanel();
}


async function lessonNotesExtractKeyPhrases() {
  const apiKey = _fy_getApiKey();
  if (!apiKey) { alert('Please set an API key first'); return; }
  
  // Get lesson content
  const docContent = lessonNotesCleanText(LessonNotesState.docContent);
  if (!docContent) { alert('No document content to analyze'); return; }
  
  const area = document.querySelector('#lessonNotesView, #lessonNotesViewMain');
  if (area) area.innerHTML = '<div style="text-align:center;padding:40px;color:var(--ink-light)">Extracting key phrases...</div>';
  
  try {
    const data = await _fy_claudeAPI({
      max_tokens: 2000,
      messages: [{ role: 'user', content: `Extract key phrases from these Japanese lesson notes. Focus on:
- Important expressions and set phrases
- Useful collocations
- Conversational patterns
- Cultural expressions

Return JSON array only:
[{"phrase":"Japanese phrase","meaning":"English meaning","example":"optional example sentence"}]

Lesson content:
${docContent.slice(0, 8000)}` }]
    ,
      track: 'lesson'
    });
    
    const text = _fy_claudeText(data) || '[]';
    LessonNotesState.keyPhrases = _lnParseJsonArray(text);
  } catch (e) {
    console.error('Key phrase extraction error:', e);
  }
  
  lessonNotesRender();
}

async function lessonNotesExtractGrammar() {
  const apiKey = _fy_getApiKey();
  if (!apiKey) { alert('Please set an API key first'); return; }
  
  // Get lesson content
  const docContent = LessonNotesState.docContent.filter(item => item.type === 'text').map(item => item.value).join('\n');
  if (!docContent) { alert('No document content to analyze'); return; }
  
  const area = document.querySelector('#lessonNotesView, #lessonNotesViewMain');
  if (area) area.innerHTML = '<div style="text-align:center;padding:40px;color:var(--ink-light)">Extracting grammar points...</div>';
  
  try {
    const data = await _fy_claudeAPI({
      max_tokens: 2500,
      messages: [{ role: 'user', content: `Analyze these Japanese lesson notes and identify grammatical patterns that a learner should understand. Don't just look for explicitly labeled grammar — analyze the Japanese sentences themselves to find:

- Verb forms used (て-form, ～ました, ～ている, ～たい, potential ～られる, volitional ～ましょう, etc.)
- Particle usage patterns (に vs へ vs で, は vs が, etc.)
- Sentence patterns (～のが好き, ～てください, ～かったです, ～みたい, etc.)
- Nominalization patterns (Verb+の)
- Giving/receiving constructions (あげる/もらう/くれる)
- Time and duration expressions (とき, ～間, かかる)
- Counting and counter patterns
- Adjective conjugations (い-adj past, な-adj usage)
- Any other N5-N3 grammar points appearing in the examples

For each pattern found, provide a clear explanation suitable for a learner.

Return JSON array only:
[{"pattern":"grammar pattern name","explanation":"clear explanation in English of how it works","example":"actual example from the lesson text","exampleMeaning":"English translation","sourceText":"the exact sentence from the notes containing this pattern"}]

Find at least 5-8 grammar points. Look at EVERY Japanese sentence for grammar worth highlighting.

Lesson content:
${docContent.slice(0, 10000)}` }]
    ,
      track: 'lesson'
    });
    
    const text = _fy_claudeText(data) || '[]';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      LessonNotesState.grammar = JSON.parse(jsonMatch[0]);
      lessonNotesPushToGramNotes(LessonNotesState.grammar); // → Grammar Notes panel
    }
  } catch (e) {
    console.error('Grammar extraction error:', e);
  }
  
  lessonNotesRender();
  lessonNotesSaveCurrentSession(); // Save extracted grammar
}


// ── Push extracted grammar points to Grammar Notes panel ─────────────────────
function lessonNotesPushToGramNotes(grammarItems) {
  if (!grammarItems || !grammarItems.length) return;
  const data = getGramData();
  const date = new Date().toLocaleDateString('de-DE', {day:'2-digit',month:'2-digit',year:'numeric'});
  let added = 0;

  for (const item of grammarItems) {
    const tab = lessonNotesClassifyGramTab(item);
    if (!Array.isArray(data[tab])) data[tab] = [];

    // Skip if same pattern already exists in this tab
    const exists = data[tab].some(e => e.text && e.text.startsWith(item.pattern));
    if (exists) continue;

    const text = [
      item.pattern,
      item.explanation,
      item.example ? '例: ' + item.example + (item.exampleMeaning ? '  (' + item.exampleMeaning + ')' : '') : ''
    ].filter(Boolean).join('\n');

    data[tab].unshift({ id: Date.now() + Math.random(), date, text });
    added++;
  }

  if (added > 0) {
    saveGramData(data);
    // Refresh if notes panel is open
    if (document.getElementById('panel-gramnotes')?.classList.contains('panel-active') ||
        document.getElementById('panel-gramnotes')?.style.display !== 'none') {
      GRAM_TABS.forEach(t => renderGramEntries(t));
    }
    console.log('Grammar Notes: added ' + added + ' new entries');
  }
}

function lessonNotesClassifyGramTab(item) {
  const text = ((item.pattern || '') + ' ' + (item.explanation || '')).toLowerCase();
  if (/verb|する|て-form|た形|ます|ている|てから|たら|れる|られ|させ|passive|causative|potential|volitional|ましょう|imperative/.test(text)) return 'verbs';
  if (/adjective|い-adj|な-adj|かった|くない|そう|そうな|adjekt/.test(text)) return 'adjectives';
  if (/particle|\bは\b|\bが\b|\bを\b|\bに\b|\bで\b|\bへ\b|\bと\b|\bから\b|\bまで\b|\bより\b|\bか\b/.test(text)) return 'particles';
  if (/counter|本|枚|匹|冊|台|個|杯|人|名|つ|counting/.test(text)) return 'counters';
  if (/expression|phrase|idiom|keigo|honorific|polite|humble|てください|てもいい|なければ|といい/.test(text)) return 'expressions';
  if (/sentence|pattern|structure|clause|nominali|のは|のが|こと|という|ように|ための|conditional|たら|ば|なら/.test(text)) return 'syntax';
  return 'misc';
}
// Auto-extract all content from lesson notes

// ── WhatsApp lesson note parser ───────────────────────────────────────────────
// Parses lines like: [DD/MM/YYYY, HH:MM:SS] Name: message
// or: DD/MM/YYYY, HH:MM - Name: message
function lessonNotesParseWithTimestamps(text) {
  // WhatsApp timestamp patterns — handles DD.MM.YY, DD/MM/YYYY etc.
  const patterns = [
    // [DD.MM.YY, HH:MM:SS] Name: message  (your format)
    /^\[(\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^:]+):\s*(.*)$/,
    // [HH:MM:SS, DD.MM.YY] Name: message
    /^\[(\d{1,2}:\d{2}(?::\d{2})?),\s*(\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4})\]\s*([^:]+):\s*(.*)$/,
    // DD/MM/YYYY, HH:MM - Name: message
    /^(\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4}),\s*(\d{1,2}:\d{2})\s*-\s*([^:]+):\s*(.*)$/,
  ];
  
  return text.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return { type: 'text', value: '', timestamp: null, sender: null };
    
    for (const pat of patterns) {
      const m = trimmed.match(pat);
      if (m) {
        // Pattern 3 has time first, date second
        const isTimeFirst = pat.source.startsWith('^\\[(\\d{1,2}:\\d{2}');
        const date    = isTimeFirst ? m[2] : m[1];
        const time    = isTimeFirst ? m[1] : m[2];
        const sender  = m[3].trim();
        const message = m[4].trim();
        return { type: 'text', value: message, timestamp: time, date, sender };
      }
    }
    return { type: 'text', value: trimmed, timestamp: null, sender: null };
  }).filter(item => item.value || item.timestamp); // keep non-empty
}

// Get clean text for Claude (strips timestamps)
function lessonNotesCleanText(docContent) {
  return docContent
    .filter(item => item.value && item.value.trim())
    .map(item => item.timestamp ? `[${item.timestamp}] ${item.value}` : item.value)
    .join('\n');
}

async function lessonNotesAutoExtractAll() {
  const apiKey = _fy_getApiKey();
  if (!apiKey) return;
  
  const docContent = lessonNotesCleanText(LessonNotesState.docContent);
  if (!docContent) { console.warn('[lessonNotes] No docContent to extract from'); return; }
  
  LessonNotesState.extracting = true;
  
  // Update all views
  const area = document.querySelector('#lessonNotesView, #lessonNotesViewMain');
  if (area) area.innerHTML = '<div style="text-align:center;padding:40px;color:var(--ink-light)"><div style="font-size:1.5rem;margin-bottom:8px">⏳</div>Extracting content...<br><span style="font-size:0.85rem">(vocab, stories, phrases, grammar)</span></div>';
  
  const panelContent = document.getElementById('lessonNotesPanelContent');
  if (panelContent) panelContent.innerHTML = '<div style="text-align:center;padding:60px 20px"><div style="font-size:2rem;margin-bottom:16px">⏳</div><div style="font-family:var(--ui);font-size:1rem;color:var(--teal);margin-bottom:8px">Extracting content...</div><div style="font-family:var(--ui);font-size:0.85rem;color:var(--ink-light)">Analyzing vocab, stories, phrases, and grammar</div></div>';
  
  // Extract all in parallel
  const promises = [];
  
  // Vocab
  if (LessonNotesState.vocab.length === 0) {
    promises.push(lessonNotesExtractVocabSilent(docContent, apiKey));
  }
  
  // Stories
  if (LessonNotesState.stories.length === 0) {
    promises.push(lessonNotesExtractStoriesSilent(docContent, apiKey));
  }
  
  // Key phrases
  if (LessonNotesState.keyPhrases.length === 0) {
    promises.push(lessonNotesExtractKeyPhrasesSilent(docContent, apiKey));
  }
  
  // Grammar
  if (LessonNotesState.grammar.length === 0) {
    promises.push(lessonNotesExtractGrammarSilent(docContent, apiKey));
  }
  
  await Promise.all(promises);
  
  LessonNotesState.extracting = false;
  lessonNotesSaveCurrentSession();
  lessonNotesRender();
  lessonNotesRenderPanel();
}

// Parse a JSON array from Claude response, salvaging partial arrays if truncated
function _lnParseJsonArray(text) {
  const raw = text || '[]';
  const match = raw.match(/\[([\s\S]*)/); // find opening bracket
  if (!match) return [];
  let str = match[0];
  // Try clean parse first
  try { return JSON.parse(str); } catch(e) {}
  // Try to salvage by finding last complete object
  const lastClose = str.lastIndexOf('}');
  if (lastClose > 0) {
    try { return JSON.parse(str.slice(0, lastClose + 1) + ']'); } catch(e) {}
  }
  return [];
}

async function lessonNotesExtractVocabSilent(docContent, apiKey) {
  try {
    const data = await _fy_claudeAPI({
      max_tokens: 3000,
      messages: [{ role: 'user', content: `Extract vocabulary from these Japanese lesson notes and provide English translations.

Look for:
1. Words with readings in parentheses: 病気（びょうき）
2. Words followed by hiragana reading: 桜　さくら  
3. Kanji compound words
4. Words marked in brackets【】
5. Any Japanese words that appear to be vocabulary items
6. Nouns, verbs, adjectives, adverbs

For EACH word, provide:
- word: the Japanese word (kanji if available)
- reading: hiragana reading
- meaning: English translation (YOU must provide this even if not in the notes)

Return ONLY a JSON array, no explanation:
[{"word":"病気","reading":"びょうき","meaning":"illness, sickness","sourceText":"病気（びょうき）です"},{"word":"桜","reading":"さくら","meaning":"cherry blossom","sourceText":"桜がきれいです"}]

Include "sourceText": the exact phrase or sentence from the notes where this word appeared.

Skip particles (は、が、を、に、で、と、も、から、まで), basic pronouns (私、あなた), numbers alone, and incomplete fragments. Extract vocabulary words, not full sentences.

Be thorough - extract 15-30 words if available.

Notes:
${docContent.slice(0, 10000)}` }]
    ,
      track: 'lesson'
    });
    const text = _fy_claudeText(data) || '[]';
    LessonNotesState.vocab = _lnParseJsonArray(text);
    LessonNotesState.vocabOriginal = [...LessonNotesState.vocab];
    console.log('[LN] vocab extracted:', LessonNotesState.vocab.length, 'items', LessonNotesState.vocab.slice(0,3).map(v=>v.word||v.phrase||v.jp||'?'));
    // Write extracted vocab into words SQL table
    try {
      const _lessonId = LessonNotesState.currentLessonId || null;
      for (const v of LessonNotesState.vocab) {
        if (!v.word || !v.reading || !v.meaning) continue;
        await window.db.run(
          `INSERT INTO words (word, reading, meaning, level, list_source, lesson_id, source, example)
           VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(word) DO UPDATE SET
             lesson_id = COALESCE(excluded.lesson_id, lesson_id),
             source    = COALESCE(excluded.source, source)`,
          [v.word, v.reading, v.meaning, 'custom', 'lesson', _lessonId, 'lesson', v.sourceText || null]
        );
      }
      console.log('[LN] vocab written to SQL:', LessonNotesState.vocab.length, 'words');
    } catch(e) { console.warn('[LN] vocab SQL write failed:', e.message); }
  } catch (e) { console.error('[vocab extraction] failed:', e.message, e); }
}

async function lessonNotesExtractStoriesSilent(docContent, apiKey) {
  try {
    const data = await _fy_claudeAPI({
      max_tokens: 3000,
      messages: [{ role: 'user', content: `Extract continuous Japanese text passages, stories, or anecdotes from these lesson notes.

Look for:
- Short stories or narratives (even just 2-3 sentences)
- Example sentences grouped together
- Continuous passages of Japanese text (not just word lists)
- Dialogues or conversations
- Any connected Japanese sentences that form a mini-story or scenario

For each passage found, provide:
- title: A short Japanese title (create one if not present, based on content)
- text: The full Japanese text of the passage

Return ONLY a JSON array:
[{"title":"朝ごはんの話","text":"今日、私は朝ごはんを食べました。..."}]

Be generous - even small connected passages of 2-3 sentences count as a "story" worth extracting.
If no continuous passages are found, return empty array: []

Notes:
${docContent.slice(0, 8000)}` }]
    ,
      track: 'lesson'
    });
    const text = _fy_claudeText(data) || '[]';
    const _stories = _lnParseJsonArray(text);
    if (_stories.length) {
      let stories = _stories;
      // Remove bracketed readings from story text
      stories = stories.map(s => ({
        ...s,
        text: lessonNotesRemoveBracketedReadings(s.text)
      }));
      LessonNotesState.stories = stories;
      console.log('[LN] stories extracted:', stories.length, 'passages');
    }
  } catch (e) { console.error('Stories extraction error:', e); }
}

async function lessonNotesExtractKeyPhrasesSilent(docContent, apiKey) {
  try {
    const data = await _fy_claudeAPI({
      max_tokens: 4000,
      messages: [{ role: 'user', content: `Extract key phrases and expressions from these Japanese lesson notes. Focus on useful conversational phrases, set expressions, and idiomatic patterns.
Return JSON array: [{"phrase":"Japanese phrase","meaning":"English meaning","example":"optional example sentence","sourceText":"the exact line from the notes where this phrase appeared"}]
Content: ${docContent.slice(0, 8000)}` }]
    ,
      track: 'lesson'
    });
    const text = _fy_claudeText(data) || '[]';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      LessonNotesState.keyPhrases = JSON.parse(jsonMatch[0]);
      console.log('[LN] key phrases extracted:', LessonNotesState.keyPhrases.length, 'phrases');
      // Write to lesson_phrases SQL table
      try {
        const _lessonId = LessonNotesState.currentLessonId || null;
        for (const p of LessonNotesState.keyPhrases) {
          if (!p.phrase || !p.meaning) continue;
          await window.db.run(
            'INSERT INTO lesson_phrases (lesson_id, phrase, meaning, example) VALUES (?,?,?,?)',
            [_lessonId, p.phrase, p.meaning, p.example || null]
          );
        }
        console.log('[LN] phrases written to SQL:', LessonNotesState.keyPhrases.length);
      } catch(e) { console.warn('[LN] phrases SQL write failed:', e.message); }
    }
  } catch (e) { console.error('Key phrases extraction error:', e); }
}

async function lessonNotesExtractGrammarSilent(docContent, apiKey) {
  try {
    const data = await _fy_claudeAPI({
      max_tokens: 4000,
      messages: [{ role: 'user', content: `Analyze these Japanese lesson notes and identify grammatical patterns that a learner should understand. Don't just look for explicitly labeled grammar — analyze the Japanese sentences themselves to find:

- Verb forms used (て-form, ～ました, ～ている, ～たい, potential ～られる, volitional ～ましょう, etc.)
- Particle usage patterns (に vs へ vs で, は vs が, etc.)
- Sentence patterns (～のが好き, ～てください, ～かったです, ～みたい, etc.)
- Nominalization patterns (Verb+の)
- Giving/receiving constructions (あげる/もらう/くれる)
- Time and duration expressions (とき, ～間, かかる)
- Counting and counter patterns
- Adjective conjugations (い-adj past, な-adj usage)
- Any other N5-N3 grammar points appearing in the examples

For each pattern found, provide a clear explanation suitable for a learner.

Return JSON array only:
[{"pattern":"grammar pattern name","explanation":"clear explanation in English of how it works","example":"actual example from the lesson text","exampleMeaning":"English translation"}]

Find at least 5-8 grammar points. Look at EVERY Japanese sentence for grammar worth highlighting.

Lesson content:
${docContent.slice(0, 10000)}` }]
    ,
      track: 'lesson'
    });
    const text = _fy_claudeText(data) || '[]';
    LessonNotesState.grammar = _lnParseJsonArray(text);
    console.log('[LN] grammar extracted:', LessonNotesState.grammar.length, 'patterns', LessonNotesState.grammar.slice(0,3).map(g=>g.pattern||'?'));
  } catch (e) { console.error('Grammar extraction error:', e); }
}

function lessonNotesSaveCurrentSession() {
  if (LessonNotesState.currentIdx === null) return;
  const sessions = lessonNotesGetSessions();
  if (!sessions[LessonNotesState.currentIdx]) return;
  
  sessions[LessonNotesState.currentIdx].vocab = LessonNotesState.vocabOriginal;
  sessions[LessonNotesState.currentIdx].stories = LessonNotesState.stories;
  sessions[LessonNotesState.currentIdx].keyPhrases = LessonNotesState.keyPhrases;
  sessions[LessonNotesState.currentIdx].grammar = LessonNotesState.grammar;
  sessions[LessonNotesState.currentIdx].errors = LessonNotesState.errors;
  
  lessonNotesSaveSessions(sessions);
}

// Grammar detail view
function lessonNotesOpenGrammarDetail(idx) {
  if (idx < 0 || idx >= LessonNotesState.grammar.length) return;
  LessonNotesState.grammarDetail = idx;
  LessonNotesState.grammarDrillSentences = [];
  LessonNotesState.grammarDrillIdx = 0;
  LessonNotesState.grammarDrillRevealed = false;
  LessonNotesState.grammarQA = [];
  LessonNotesState.viewMode = 'grammardetail';
  lessonNotesRender();
}

function lessonNotesCloseGrammarDetail() {
  LessonNotesState.grammarDetail = null;
  LessonNotesState.viewMode = 'grammar';
  lessonNotesRender();
}

async function lessonNotesGrammarGenerateDrill() {
  if (LessonNotesState.grammarDetail === null) return;
  const grammar = LessonNotesState.grammar[LessonNotesState.grammarDetail];
  if (!grammar) return;
  
  const apiKey = _fy_getApiKey();
  if (!apiKey) { alert('Please set an API key'); return; }
  
  const btn = document.getElementById('lnGrammarGenDrillBtn');
  if (btn) { 
    if (btn.disabled) return; // Prevent double-click
    btn.disabled = true; 
    btn.textContent = 'Generating...'; 
  }
  
  try {
    const data = await _fy_claudeAPI({
      max_tokens: 1500,
      messages: [{ role: 'user', content: `Generate 5 translation drill sentences for this Japanese grammar pattern:

Pattern: ${grammar.pattern}
Explanation: ${grammar.explanation}

Create 5 English sentences that a learner should translate into Japanese using this grammar pattern. The sentences should:
- Be practical, everyday situations
- Clearly require using the target grammar
- Progress from easier to slightly harder
- Be suitable for N5-N4 learners

Return ONLY a JSON array, no other text:
[{"jp":"correct Japanese translation","en":"English sentence to translate","hint":"optional short hint"}]` }]
    ,
      track: 'grammar'
    });
    
    const text = _fy_claudeText(data) || '';
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          LessonNotesState.grammarDrillSentences = parsed;
          LessonNotesState.grammarDrillIdx = 0;
          LessonNotesState.grammarDrillRevealed = false;
        }
      } catch (parseErr) {
        console.error('JSON parse error:', parseErr, jsonMatch[0]);
      }
    }
  } catch (e) {
    console.error('Drill generation error:', e);
  }
  
  // Re-render
  lessonNotesRender();
  const panelEl = document.getElementById('lessonNotesPanelContent');
  if (panelEl) lessonNotesRenderPanel();
  
  // Re-enable button and setup kana input
  setTimeout(() => {
    const newBtn = document.getElementById('lnGrammarGenDrillBtn');
    if (newBtn) { newBtn.disabled = false; newBtn.textContent = '🔄 New sentences'; }
    
    setTimeout(() => {
    }, 0);
  }, 100);
}

async function lessonNotesGrammarCheckDrill() {
  const inp = document.getElementById('lnGrammarDrillInput');
  const userAnswer = inp?.value?.trim();
  
  if (!userAnswer) {
    // No answer, just reveal
    LessonNotesState.grammarDrillRevealed = true;
    LessonNotesState.grammarDrillFeedback = '';
    lessonNotesRender();
    lessonNotesRenderPanel();
    return;
  }
  
  const current = LessonNotesState.grammarDrillSentences[LessonNotesState.grammarDrillIdx];
  const grammar = LessonNotesState.grammar[LessonNotesState.grammarDetail];
  
  const apiKey = _fy_getApiKey();
  if (!apiKey) {
    LessonNotesState.grammarDrillRevealed = true;
    LessonNotesState.grammarDrillFeedback = '';
    lessonNotesRender();
    lessonNotesRenderPanel();
    return;
  }
  
  // Show loading state
  LessonNotesState.grammarDrillFeedback = '⏳ Checking...';
  LessonNotesState.grammarDrillRevealed = true;
  lessonNotesRender();
  lessonNotesRenderPanel();
  
  try {
    const data = await _fy_claudeAPI({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        messages: [{ role: 'user', content: `A Japanese learner is practicing the grammar pattern "${grammar.pattern}".

English prompt: ${current.en}
Model answer: ${current.jp}
Student's answer: ${userAnswer}

Give brief feedback (2-3 sentences max):
- Is their answer correct or acceptable? (There may be multiple valid translations)
- If wrong, what's the specific issue?
- If close but not perfect, what small adjustment would improve it?

IMPORTANT: When mentioning any Japanese words with kanji, always add the hiragana reading in brackets immediately after. Example: 食べる(たべる), 行きました(いきました), 難しい(むずかしい).

Be encouraging but direct. Reply in English.` }]
    ,
      track: 'grammar'
    });
    
    LessonNotesState.grammarDrillFeedback = data.content?.[0]?.text || 'Could not get feedback';
  } catch (e) {
    LessonNotesState.grammarDrillFeedback = 'Error getting feedback';
  }
  
  lessonNotesRender();
  lessonNotesRenderPanel();
}

// toggleLnGrammarKana replaced by kanaSetMode


// toggleLnGrammarKanaType replaced by kanaSetMode



function lessonNotesGrammarNextDrill() {
  if (LessonNotesState.grammarDrillIdx < LessonNotesState.grammarDrillSentences.length - 1) {
    LessonNotesState.grammarDrillIdx++;
    LessonNotesState.grammarDrillRevealed = false;
    LessonNotesState.grammarDrillFeedback = '';
    const inp = document.getElementById('lnGrammarDrillInput');
    if (inp) inp.value = '';
    lessonNotesRender();
    lessonNotesRenderPanel();
    setTimeout(() => {
      const inp = document.getElementById('lnGrammarDrillInput');
      if (inp && !inp._kanaOn) {
        kanaOff(inp); kanaOn(inp); inp._kanaMode = 'hiragana';
      }
      inp?.focus();
    }, 100);
  }
}

function lessonNotesGrammarPrevDrill() {
  if (LessonNotesState.grammarDrillIdx > 0) {
    LessonNotesState.grammarDrillIdx--;
    LessonNotesState.grammarDrillRevealed = false;
    LessonNotesState.grammarDrillFeedback = '';
    const inp = document.getElementById('lnGrammarDrillInput');
    if (inp) inp.value = '';
    lessonNotesRender();
    lessonNotesRenderPanel();
    setTimeout(() => {
      const inp = document.getElementById('lnGrammarDrillInput');
      if (inp && !inp._kanaOn) {
        kanaOff(inp); kanaOn(inp); inp._kanaMode = 'hiragana';
      }
      inp?.focus();
    }, 100);
  }
}

async function lessonNotesGrammarAsk() {
  if (LessonNotesState.grammarDetail === null) return;
  const grammar = LessonNotesState.grammar[LessonNotesState.grammarDetail];
  if (!grammar) return;
  
  const input = document.getElementById('lnGrammarAskInput');
  const question = input?.value?.trim();
  if (!question) return;
  
  const apiKey = _fy_getApiKey();
  if (!apiKey) { alert('Please set an API key'); return; }
  
  input.value = '';
  LessonNotesState.grammarQA.push({ role: 'user', content: question });
  lessonNotesRender();
  
  try {
    const data = await _fy_claudeAPI({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [
          { role: 'user', content: `You are helping a Japanese learner understand this grammar point:

Pattern: ${grammar.pattern}
Explanation: ${grammar.explanation}
Example: ${grammar.example} (${grammar.exampleMeaning})

The learner asks: ${question}

Give a helpful, clear answer. Use examples where helpful. Keep it concise but thorough.` }
        ]
    ,
      track: 'grammar'
    });
    
    const answer = data.content?.[0]?.text || 'Sorry, I could not generate an answer.';
    LessonNotesState.grammarQA.push({ role: 'assistant', content: answer });
  } catch (e) {
    LessonNotesState.grammarQA.push({ role: 'assistant', content: 'Error: Could not get answer.' });
  }
  
  lessonNotesRender();
}

function lessonNotesRenderGrammarDetail() {
  if (LessonNotesState.grammarDetail === null) return '';
  const grammar = LessonNotesState.grammar[LessonNotesState.grammarDetail];
  if (!grammar) return '';
  
  const hasDrill = LessonNotesState.grammarDrillSentences.length > 0;
  
  // Build drill section
  let drillHtml = '';
  if (hasDrill) {
    const current = LessonNotesState.grammarDrillSentences[LessonNotesState.grammarDrillIdx];
    drillHtml = `
      <div style="margin-top:16px;padding:16px;background:var(--paper-dark);border-radius:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <span style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light)">${LessonNotesState.grammarDrillIdx + 1} / ${LessonNotesState.grammarDrillSentences.length}</span>
          <button id="lnGrammarGenDrillBtn" onclick="lessonNotesGrammarGenerateDrill()" class="yoshi-read-btn btn-icon">🔄 New sentences</button>
        </div>
        <div style="font-family:var(--jp);font-size:1.1rem;color:var(--ink);margin-bottom:12px">${current.en}</div>
        ${current.hint ? `<div style="font-family:var(--ui);font-size:0.8rem;color:var(--gold);margin-bottom:8px">💡 ${current.hint}</div>` : ''}
        ${(App.TextEntry||window.TextEntry)?.html({
          id: 'lnGrammarDrillInput',
          placeholder: '日本語で書いてください...',
          defaultMode: 'hiragana',
          minHeight: '60px',
          onEnter: 'lessonNotesGrammarCheckDrill()',
        }) || ''}
        ${LessonNotesState.grammarDrillFeedback ? `
          <div style="margin-top:10px;padding:12px;background:rgba(255,193,59,0.1);border:1px solid var(--gold);border-radius:6px">
            <div style="font-family:var(--ui);font-size:0.72rem;color:var(--gold);margin-bottom:6px">💬 FEEDBACK</div>
            <div style="font-family:var(--ui);font-size:0.9rem;color:var(--ink);line-height:1.5;white-space:pre-wrap">${LessonNotesState.grammarDrillFeedback}</div>
          </div>
        ` : ''}
        ${LessonNotesState.grammarDrillRevealed ? `
          <div style="margin-top:10px;padding:10px;background:rgba(48,213,200,0.1);border:1px solid var(--teal);border-radius:6px">
            <div style="font-family:var(--ui);font-size:0.72rem;color:var(--teal);margin-bottom:4px">ANSWER</div>
            <div style="font-family:var(--jp);font-size:1.1rem;color:var(--ink)">${current.jp}</div>
            <button class="btn-ghost" onclick="jpSpeak('${current.jp.replace(/'/g, "\\'")}', 0.9)">🔊 Listen</button>
          </div>
        ` : ''}
        <div style="display:flex;gap:8px;margin-top:12px">
          <button onclick="lessonNotesGrammarPrevDrill()" class="yoshi-read-btn btn-icon" ${LessonNotesState.grammarDrillIdx === 0 ? 'disabled' : ''}>← Prev</button>
          <button onclick="lessonNotesGrammarCheckDrill()" class="yoshi-read-btn btn-primary">Check</button>
          <button onclick="lessonNotesGrammarNextDrill()" class="yoshi-read-btn btn-icon" ${LessonNotesState.grammarDrillIdx >= LessonNotesState.grammarDrillSentences.length - 1 ? 'disabled' : ''}>Next →</button>
        </div>
      </div>
    `;
  } else {
    drillHtml = `
      <div style="margin-top:16px;padding:20px;background:var(--paper-dark);border-radius:8px;text-align:center">
        <button id="lnGrammarGenDrillBtn" onclick="lessonNotesGrammarGenerateDrill()" class="yoshi-read-btn btn-icon">📝 Generate Translation Drill</button>
      </div>
    `;
  }
  
  // Build Q&A section
  let qaHtml = LessonNotesState.grammarQA.map(msg => `
    <div style="margin-bottom:10px;padding:10px;background:${msg.role === 'user' ? 'rgba(48,213,200,0.1)' : 'var(--paper-dark)'};border-radius:8px;${msg.role === 'user' ? 'margin-left:20px' : 'margin-right:20px'}">
      <div style="font-family:var(--ui);font-size:0.68rem;color:var(--ink-light);margin-bottom:4px">${msg.role === 'user' ? 'You' : 'Answer'}</div>
      <div style="font-family:var(--ui);font-size:0.9rem;color:var(--ink);white-space:pre-wrap">${msg.content}</div>
    </div>
  `).join('');
  
  return `
    <!-- Back button -->
    <div style="margin-bottom:16px">
      <button onclick="lessonNotesCloseGrammarDetail()" class="yoshi-read-btn btn-icon">← Back to Grammar List</button>
    </div>
    
    <!-- Header - compact when drilling -->
    <div style="padding:${hasDrill ? '12px 16px' : '20px'};background:linear-gradient(135deg, rgba(48,213,200,0.15), rgba(48,213,200,0.05));border:1px solid var(--teal);border-radius:10px;margin-bottom:16px">
      <div style="font-family:var(--jp);font-size:${hasDrill ? '1.2rem' : '1.6rem'};font-weight:600;color:var(--teal);${hasDrill ? '' : 'margin-bottom:8px'}">${grammar.pattern}</div>
      ${hasDrill ? '' : `<div style="font-family:var(--ui);font-size:1rem;color:var(--ink);line-height:1.6">${grammar.explanation}</div>`}
      ${!hasDrill && grammar.example ? `
        <div style="margin-top:12px;padding:12px;background:var(--paper);border-radius:6px">
          <div style="font-family:var(--jp);font-size:1.1rem;color:var(--ink)">${grammar.example}</div>
          ${grammar.exampleMeaning ? `<div style="font-family:var(--ui);font-size:0.85rem;color:var(--ink-light);margin-top:4px">→ ${grammar.exampleMeaning}</div>` : ''}
          <button class="btn-ghost" onclick="jpSpeak('${grammar.example.replace(/'/g, "\\'")}', 0.9)">🔊 Listen</button>
        </div>
      ` : ''}
    </div>
    
    <!-- Translation Drill -->
    <div style="margin-bottom:16px">
      <div style="font-family:var(--ui);font-size:0.72rem;letter-spacing:0.1em;color:var(--ink-light);margin-bottom:8px">📝 TRANSLATION DRILL</div>
      ${drillHtml}
    </div>
    
    <!-- Ask Questions -->
    <div>
      <div style="font-family:var(--ui);font-size:0.72rem;letter-spacing:0.1em;color:var(--ink-light);margin-bottom:8px">❓ ASK QUESTIONS</div>
      <div style="max-height:250px;overflow-y:auto;margin-bottom:10px">${qaHtml}</div>
      <div style="display:flex;gap:8px;align-items:flex-end">
        ${(App.TextEntry||window.TextEntry)?.html({
          id: 'lnGrammarAskInput',
          type: 'input',
          placeholder: 'Ask about this grammar point...',
          defaultMode: 'hiragana',
          fontSize: '0.9rem',
          onEnter: 'lessonNotesGrammarAsk()',
          extraStyle: 'flex:1',
        }) || ''}
        <button onclick="lessonNotesGrammarAsk()" class="yoshi-read-btn btn-icon" style="flex-shrink:0">Ask</button>
      </div>
    </div>
  `;
}


function lessonNotesRenderFullDoc() {
  // Build interleaved content display
  let contentHtml = '';
  const searchTerm = LessonNotesState.fullDocSearch || '';
  
  if (LessonNotesState.docContent && LessonNotesState.docContent.length > 0) {
    // Use interleaved content
    contentHtml = LessonNotesState.docContent.map(item => {
      if (item.type === 'image') {
        return `<img src="${item.value}" style="max-width:150px;max-height:150px;border-radius:4px;margin:8px 0;display:block;cursor:pointer;border:1px solid var(--border)" onclick="window.open(this.src,'_blank')" title="Click to view full size">`;
      } else {
        let text = item.value;
        // Highlight search term if present
        if (searchTerm && text.toLowerCase().includes(searchTerm.toLowerCase())) {
          const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
          text = text.replace(regex, '<mark style="background:var(--gold);color:#1c1c1e;padding:0 2px;border-radius:2px">$1</mark>');
        }
        // Hide non-matching lines if search is active
        if (searchTerm && !item.value.toLowerCase().includes(searchTerm.toLowerCase())) {
          return '';
        }
        return `<div style="font-family:var(--jp);font-size:1.1rem;line-height:2;color:var(--ink);white-space:pre-wrap;margin:8px 0">${text}</div>`;
      }
    }).join('');
  } else if (LessonNotesState.docImages.length > 0 || LessonNotesState.rawText) {
    // Fallback: show images at top, then text
    if (LessonNotesState.docImages.length > 0 && !searchTerm) {
      contentHtml += `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">`;
      contentHtml += LessonNotesState.docImages.map(img => 
        `<img src="${img}" style="max-width:120px;max-height:120px;border-radius:4px;cursor:pointer;border:1px solid var(--border)" onclick="window.open(this.src,'_blank')" title="Click to view full size">`
      ).join('');
      contentHtml += `</div>`;
    }
    let text = LessonNotesState.rawText || 'No document text available';
    if (searchTerm) {
      const lines = text.split('\n').filter(line => line.toLowerCase().includes(searchTerm.toLowerCase()));
      const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      text = lines.map(line => line.replace(regex, '<mark style="background:var(--gold);color:#1c1c1e;padding:0 2px;border-radius:2px">$1</mark>')).join('\n');
    }
    contentHtml += `<div style="font-family:var(--jp);font-size:1.1rem;line-height:2;color:var(--ink);white-space:pre-wrap">${text}</div>`;
  } else {
    contentHtml = `<div style="color:var(--ink-light);font-family:var(--ui)">No document content available</div>`;
  }
  
  const matchCount = searchTerm ? (contentHtml.match(/<mark/g) || []).length : 0;
  
  return `
    <!-- Search bar -->
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
      <input type="text" id="lessonNotesFullDocSearchInput" placeholder="Search document..." 
        value="${searchTerm}" 
        style="flex:1;padding:8px 12px;background:var(--field);border:1px solid var(--field-border);border-radius:5px;font-family:var(--ui);font-size:0.85rem;color:var(--ink);outline:none"
        onkeydown="if(event.key==='Enter')lessonNotesFullDocDoSearch()"
        oninput="if(!this.value)lessonNotesFullDocClearSearch()">
      <button class="btn-primary" onclick="lessonNotesFullDocDoSearch()">Search</button>
      ${searchTerm ? `<button class="btn-ghost" onclick="lessonNotesFullDocClearSearch()">✕</button>
      <span style="font-family:var(--ui);font-size:0.75rem;color:var(--gold)">${matchCount} found</span>` : ''}
    </div>
    
    <div class="qr-reader-box" style="max-height:500px;overflow-y:auto">
      ${contentHtml || '<div style="color:var(--ink-light);font-family:var(--ui);text-align:center;padding:20px">No matches found</div>'}
    </div>
  `;
}

function lessonNotesOpenStory(idx) {
  LessonNotesState.currentStory = LessonNotesState.stories[idx];
  LessonNotesState.viewMode = 'reading';
  // Use Quick Read's segment array
  _qrSegments = [];
  lessonNotesRender();
  // Parse the story text using same method as Quick Read
  lessonNotesParseStory(LessonNotesState.currentStory.text);
}

async function lessonNotesParseStory(text) {
  const apiKey = _fy_getApiKey();
  if (!apiKey) {
    _qrSegments = [{ word: text, reading: '', en: null, pos: null }];
    lessonNotesRenderStoryText();
    return;
  }
  
  try {
    const data = await _fy_claudeAPI({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        messages: [{ role: 'user', content:
          `Segment this Japanese text into words and give the hiragana reading for each word that contains kanji. Return ONLY a valid JSON array, nothing else:
[{"w":"word","r":"hiragana only if word contains kanji, else empty string"},...]
Rules:
- Every token needs both "w" and "r" fields
- "r" must be hiragana for kanji-containing words, empty string otherwise
- Preserve punctuation as separate tokens
- For newlines insert {"w":"\\n","r":""}
Text: ${text}` }]
    ,
      track: 'lesson'
    });
    
    const raw = (data.content?.[0]?.text || '[]').trim();
    let words;
    try {
      words = JSON.parse(raw.replace(/```json|```/g,'').trim());
    } catch(e) {
      const match = raw.match(/\[[\s\S]*\]/);
      words = match ? JSON.parse(match[0]) : text.split('').map(ch => ({w:ch, r:''}));
    }
    
    _qrSegments = words.map(item => {
      const w = typeof item === 'string' ? item : (item.w || '');
      const r = typeof item === 'string' ? '' : (item.r || '');
      return { word: w, reading: r, en: null, pos: null };
    });
  } catch (e) {
    console.error('Parse error:', e);
    _qrSegments = [{ word: text, reading: '', en: null, pos: null }];
  }
  
  lessonNotesRenderStoryText();
}

function lessonNotesRenderStoryText() {
  const container = document.getElementById('lnStoryReader');
  if (!container) return;
  
  // Reuse Quick Read's rendering logic
  const isNewline = w => w === '\n' || w === '\r\n' || w === '\r';
  const isPunct = w => /^[　。、！？…「」『』【】〔〕（）・]+$/.test(w);
  const hasKanji = w => /[\u4E00-\u9FFF]/.test(w);
  const isJP = w => /[\u3040-\u9FFF\uF900-\uFAFF]/.test(w);

  let html = '<div style="font-family:\'Noto Sans JP\',sans-serif;font-size:1.25rem;line-height:2.4;color:var(--ink)">';
  _qrSegments.forEach((seg, i) => {
    const w = seg.word;
    if (!w) return;
    if (isNewline(w)) { html += '<br>'; return; }
    if (isPunct(w)) { html += `<span style="color:var(--ink-light)">${w}</span>`; return; }
    if (!isJP(w)) { html += `<span>${w}</span>`; return; }
    if (LessonNotesState.lnFuriOn && seg.reading && hasKanji(w)) {
      html += `<ruby class="qr-ruby qr-boundary" data-idx="${i}">${w}<rt style="font-size:0.65em;color:var(--ink-light);pointer-events:none">${seg.reading}</rt></ruby>`;
    } else {
      html += `<span class="qr-word qr-boundary" data-idx="${i}">${w}</span>`;
    }
  });
  html += '</div>';
  container.innerHTML = html;

  // Click handler for word lookup
  container.onclick = e => {
    const el = e.target.closest('[data-idx]');
    if (!el) return;
    e.stopPropagation();
    const idx = parseInt(el.dataset.idx);
    qrWordClick(el, idx);
  };
}

function lessonNotesRenderReading() {
  const story = LessonNotesState.currentStory;
  if (!story) return '';
  
  // Check if this story has a saved recording
  const hasRecording = story.recording ? true : false;
  
  // Split story into sentences for sentence mode
  const sentences = lessonNotesSplitSentences(story.text);
  const sentenceRecordings = story.sentenceRecordings || [];
  const allSentencesRecorded = sentences.length > 0 && sentenceRecordings.length === sentences.length && sentenceRecordings.every(r => r);
  const hasAnyRecordings = sentenceRecordings.some(r => r);
  const recordedCount = sentenceRecordings.filter(r => r).length;
  
  return `
    <div class="qr-reader-box">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
        <button class="qr-btn-sec ${LessonNotesState.lnFuriOn?'active':''}" onclick="lessonNotesToggleFuri()" style="padding:5px 12px;font-size:0.78rem;${LessonNotesState.lnFuriOn?'color:var(--teal);border-color:var(--teal)':''}">ふり仮名</button>
        <button id="lnSpeakBtn" class="qr-btn-sec" onclick="lessonNotesToggleSpeak()" title="Read aloud / Stop">🔊 Read</button>
        <button class="qr-btn-sec" onclick="lessonNotesCopyStory()" title="Copy text without furigana">📋 Copy</button>
        <button class="qr-btn-sec" onclick="lessonNotesSetView('stories')">← Stories</button>
        <span style="margin-left:auto;font-family:'Shippori Mincho',serif;font-size:1rem;color:var(--ink)">${story.title}</span>
      </div>
      ${LessonNotesState.lnRecordMode === 'sentence' ? '' : `
      <div id="lnStoryReader">
        <span style="color:var(--ink-light);font-family:var(--ui);font-size:0.85rem">Parsing...</span>
      </div>
      `}
      
      <!-- Recording section -->
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
        <!-- Mode toggle -->
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
          <span style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light)">Record:</span>
          <button class="qr-btn-sec ${LessonNotesState.lnRecordMode==='full'?'active':''}" onclick="lnSetRecordMode('full')" style="padding:4px 10px;font-size:0.72rem;${LessonNotesState.lnRecordMode==='full'?'color:var(--teal);border-color:var(--teal)':''}">Full</button>
          <button class="qr-btn-sec ${LessonNotesState.lnRecordMode==='sentence'?'active':''}" onclick="lnSetRecordMode('sentence')" style="padding:4px 10px;font-size:0.72rem;${LessonNotesState.lnRecordMode==='sentence'?'color:var(--teal);border-color:var(--teal)':''}">Per Sentence</button>
        </div>
        
        ${LessonNotesState.lnRecordMode === 'full' ? `
          <!-- Full story mode -->
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <button id="lnRecordBtn" class="qr-btn-sec" onclick="lessonNotesToggleRecording()" style="padding:5px 12px;font-size:0.78rem;${LessonNotesState.lnIsRecording?'background:var(--red);color:white;border-color:var(--red)':''}">
              ${LessonNotesState.lnIsRecording ? '⏹ Stop' : '🎤 Record'}
            </button>
            ${hasRecording ? `
              <button class="qr-btn-sec btn-icon" onclick="lessonNotesPlayRecording()">▶️ Play</button>
              <button class="qr-btn-sec btn-icon" onclick="lessonNotesDeleteRecording()">🗑</button>
              <span style="font-family:var(--ui);font-size:0.7rem;color:var(--teal)">✓ Saved</span>
            ` : ''}
            ${LessonNotesState.lnIsRecording ? `<span style="font-family:var(--ui);font-size:0.7rem;color:var(--red)">● Recording...</span>` : ''}
          </div>
        ` : `
          <!-- Sentence by sentence mode -->
          <div id="lnSentenceRecorder">
            <div style="font-family:var(--ui);font-size:0.7rem;color:var(--ink-light);margin-bottom:8px">
              Sentence ${LessonNotesState.lnCurrentSentence + 1} of ${sentences.length}
              ${allSentencesRecorded ? ' — All recorded!' : ''}
            </div>
            
            <!-- Current sentence display with furigana -->
            <div style="background:var(--paper);border:1px solid var(--border);border-radius:6px;padding:12px;margin-bottom:12px">
              <div id="lnSentenceDisplay" style="font-family:var(--jp);font-size:1.2rem;line-height:2.2;color:var(--ink)">
                <span style="color:var(--ink-light);font-size:0.85rem">Loading...</span>
              </div>
            </div>
            
            <!-- Sentence controls -->
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
              <button class="qr-btn-sec btn-icon" onclick="lnPrevSentence()" ${LessonNotesState.lnCurrentSentence === 0 ? 'disabled' : ''}>← Prev</button>
              <button class="qr-btn-sec" onclick="lnRecordSentence()" style="padding:5px 12px;font-size:0.78rem;${LessonNotesState.lnIsRecording?'background:var(--red);color:white;border-color:var(--red)':''}">
                ${LessonNotesState.lnIsRecording ? '⏹ Stop' : '🎤 Record'}
              </button>
              ${sentenceRecordings[LessonNotesState.lnCurrentSentence] ? `
                <button class="qr-btn-sec btn-icon" onclick="lnPlaySentence(${LessonNotesState.lnCurrentSentence})">▶️</button>
                <button class="qr-btn-sec btn-icon" onclick="lnDeleteSentence(${LessonNotesState.lnCurrentSentence})">🗑</button>
                <span style="color:var(--teal);font-size:0.7rem">✓</span>
              ` : ''}
              <button class="qr-btn-sec btn-icon" onclick="lnNextSentence()" ${LessonNotesState.lnCurrentSentence >= sentences.length - 1 ? 'disabled style="opacity:0.5"' : ''}>Next →</button>
            </div>
            
            <!-- Sentence progress bar -->
            <div style="display:flex;gap:4px;margin-bottom:12px">
              ${sentences.map((s, i) => `
                <div onclick="lnGoToSentence(${i})" style="flex:1;height:6px;border-radius:3px;cursor:pointer;background:${sentenceRecordings[i] ? 'var(--teal)' : (i === LessonNotesState.lnCurrentSentence ? 'var(--gold)' : 'var(--border)')}"></div>
              `).join('')}
            </div>
            
            <!-- Combine and play all -->
            ${hasAnyRecordings ? `
              <div style="display:flex;gap:8px;align-items:center;border-top:1px solid var(--border);padding-top:12px;flex-wrap:wrap">
                <button class="qr-btn-sec btn-icon" onclick="lnPlayAllSentences()">▶️ Play ${recordedCount}</button>
                <button class="qr-btn-sec btn-icon" onclick="lnCombineAndSave()">💾 Combine ${recordedCount}</button>
                <button class="qr-btn-sec btn-icon" onclick="lnCombineAndDownload()">⬇ Download ${recordedCount}</button>
                ${allSentencesRecorded ? `<span style="font-family:var(--ui);font-size:0.7rem;color:var(--teal)">✓ All done</span>` : `<span style="font-family:var(--ui);font-size:0.7rem;color:var(--ink-light)">${recordedCount}/${sentences.length}</span>`}
              </div>
            ` : ''}
          </div>
        `}
        
        <audio id="lnAudioPlayer" style="display:none"></audio>
      </div>
    </div>
  `;
}

// Recording state
// LessonNotesState.ln* — see declaration above

function lnSetRecordMode(mode) {
  LessonNotesState.lnRecordMode = mode;
  LessonNotesState.lnCurrentSentence = 0;
  lessonNotesRender();
  if (mode === 'sentence') {
    // Show plain text first, then parse furigana
    lnShowCurrentSentence();
    setTimeout(lnParseSentenceFurigana, 100);
  }
}

// Show the current sentence immediately (plain text, no furigana)
function lnShowCurrentSentence() {
  const display = document.getElementById('lnSentenceDisplay');
  if (!display) return;
  
  const sentences = lessonNotesSplitSentences(LessonNotesState.currentStory?.text || '');
  const sentence = sentences[LessonNotesState.lnCurrentSentence] || '';
  
  // Check cache first for instant display
  if (LessonNotesState.lnSentenceFuriganaCache[sentence]) {
    lnRenderSentenceFurigana(LessonNotesState.lnSentenceFuriganaCache[sentence]);
  } else {
    // Show plain text immediately
    display.innerHTML = `<span style="color:var(--ink)">${sentence}</span>`;
  }
}

// Split text into sentences (Japanese sentence endings)
function lessonNotesSplitSentences(text) {
  if (!text) return [];
  // Split on Japanese sentence endings: 。！？, or newlines
  const parts = text.split(/(?<=[。！？\n])/g).map(s => s.trim()).filter(s => s.length > 0);
  // Remove bracketed readings from each sentence
  return parts.map(s => lessonNotesRemoveBracketedReadings(s));
}

function lnPrevSentence() {
  if (LessonNotesState.lnCurrentSentence > 0) {
    LessonNotesState.lnCurrentSentence--;
    lessonNotesRender();
    lnShowCurrentSentence();
    setTimeout(lnParseSentenceFurigana, 50);
  }
}

function lnNextSentence() {
  const sentences = lessonNotesSplitSentences(LessonNotesState.currentStory?.text || '');
  if (LessonNotesState.lnCurrentSentence < sentences.length - 1) {
    LessonNotesState.lnCurrentSentence++;
    lessonNotesRender();
    lnShowCurrentSentence();
    setTimeout(lnParseSentenceFurigana, 50);
  }
}

function lnGoToSentence(idx) {
  LessonNotesState.lnCurrentSentence = idx;
  lessonNotesRender();
  lnShowCurrentSentence();
  setTimeout(lnParseSentenceFurigana, 50);
}

// Cache for sentence furigana
// LessonNotesState.lnSentenceFuriganaCache — see declaration above

async function lnParseSentenceFurigana() {
  if (LessonNotesState.lnRecordMode !== 'sentence') return;
  if (LessonNotesState.lnParsingInProgress) return; // prevent concurrent calls
  
  const sentences = lessonNotesSplitSentences(LessonNotesState.currentStory?.text || '');
  const sentence = sentences[LessonNotesState.lnCurrentSentence];
  if (!sentence) return;
  
  const display = document.getElementById('lnSentenceDisplay');
  if (!display) return;
  
  // Check cache first - if cached, render and done
  if (LessonNotesState.lnSentenceFuriganaCache[sentence]) {
    lnRenderSentenceFurigana(LessonNotesState.lnSentenceFuriganaCache[sentence]);
    return;
  }
  
  const apiKey = _fy_getApiKey();
  if (!apiKey) {
    // No API key - just show plain text (already shown by lnShowCurrentSentence)
    return;
  }
  
  LessonNotesState.lnParsingInProgress = true;
  // Don't overwrite - the plain text is already showing
  
  try {
    const data = await _fy_claudeAPI({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: `Segment this Japanese sentence and provide readings for each segment.

Sentence: ${sentence}

Return JSON array only: [{"word":"漢字","reading":"かんじ"},{"word":"です","reading":"です"}]

CRITICAL: EVERY kanji must have a reading. Do not skip any kanji character.
- For verbs like 片付ける, split as: {"word":"片","reading":"かた"},{"word":"付","reading":"づ"},{"word":"ける","reading":"ける"}
- Use context-appropriate readings (例えば→たとえば, 今日→きょう)
- Include ALL characters (kanji, hiragana, katakana, punctuation)
- For hiragana/katakana/punctuation, reading equals the word
- Return ONLY the JSON array` }]
    ,
      track: 'lesson'
    });
    
    const raw = (data.content?.[0]?.text || '').trim();
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const segments = JSON.parse(cleaned);
    
    // Cache and render (only if still on same sentence)
    LessonNotesState.lnSentenceFuriganaCache[sentence] = segments;
    
    // Check we're still on the same sentence before rendering
    const currentSentences = lessonNotesSplitSentences(LessonNotesState.currentStory?.text || '');
    if (currentSentences[LessonNotesState.lnCurrentSentence] === sentence) {
      lnRenderSentenceFurigana(segments);
    }
    LessonNotesState.lnParsingInProgress = false;
  } catch (e) {
    console.error('Sentence parse error:', e);
    // Plain text is already showing, so just log the error
    LessonNotesState.lnParsingInProgress = false;
  }
}

function lnRenderSentenceFurigana(segments) {
  const display = document.getElementById('lnSentenceDisplay');
  if (!display) return;
  
  const html = segments.map(seg => {
    const needsRuby = seg.word !== seg.reading && /[一-龯々]/.test(seg.word);
    if (needsRuby) {
      return `<ruby>${seg.word}<rt>${seg.reading}</rt></ruby>`;
    }
    return seg.word;
  }).join('');
  
  display.innerHTML = html;
}

async function lnRecordSentence() {
  if (LessonNotesState.lnIsRecording) {
    // Stop recording
    if (LessonNotesState.lnMediaRecorder && LessonNotesState.lnMediaRecorder.state !== 'inactive') {
      LessonNotesState.lnMediaRecorder.stop();
    }
  } else {
    // Start recording
    try {
      LessonNotesState.lnAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      LessonNotesState.lnMediaRecorder = new MediaRecorder(LessonNotesState.lnAudioStream);
      LessonNotesState.lnAudioChunks = [];
      
      const sentenceIdx = LessonNotesState.lnCurrentSentence; // capture current sentence index
      
      LessonNotesState.lnMediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          LessonNotesState.lnAudioChunks.push(e.data);
        }
      };
      
      LessonNotesState.lnMediaRecorder.onstop = async () => {
        const blob = new Blob(LessonNotesState.lnAudioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          lnSaveSentenceRecording(sentenceIdx, reader.result);
        };
        reader.readAsDataURL(blob);
        
        LessonNotesState.lnAudioStream.getTracks().forEach(track => track.stop());
        LessonNotesState.lnIsRecording = false;
        // Don't render here - lnSaveSentenceRecording will handle it
      };
      
      LessonNotesState.lnMediaRecorder.start();
      LessonNotesState.lnIsRecording = true;
      // Just update the button, don't full re-render
      const btn = document.querySelector('#lnSentenceRecorder button[onclick="lnRecordSentence()"]');
      if (btn) {
        btn.innerHTML = '⏹ Stop';
        btn.style.background = 'var(--red)';
        btn.style.color = 'white';
        btn.style.borderColor = 'var(--red)';
      }
    } catch (e) {
      console.error('Recording error:', e);
      alert('Could not access microphone.');
    }
  }
}

function lnSaveSentenceRecording(idx, base64Audio) {
  if (!LessonNotesState.currentStory) return;
  
  const storyIdx = LessonNotesState.stories.findIndex(s => s.title === LessonNotesState.currentStory.title && s.text === LessonNotesState.currentStory.text);
  if (storyIdx < 0) return;
  
  // Initialize array if needed
  if (!LessonNotesState.stories[storyIdx].sentenceRecordings) {
    const sentences = lessonNotesSplitSentences(LessonNotesState.currentStory.text);
    LessonNotesState.stories[storyIdx].sentenceRecordings = new Array(sentences.length).fill(null);
  }
  
  LessonNotesState.stories[storyIdx].sentenceRecordings[idx] = base64Audio;
  LessonNotesState.currentStory.sentenceRecordings = LessonNotesState.stories[storyIdx].sentenceRecordings;
  
  // Save to localStorage
  if (LessonNotesState.currentIdx !== null) {
    const sessions = lessonNotesGetSessions();
    if (sessions[LessonNotesState.currentIdx]) {
      sessions[LessonNotesState.currentIdx].stories = LessonNotesState.stories;
      lessonNotesSaveSessions(sessions);
    }
  }
  
  // Don't auto-advance - let user check the recording first
  lessonNotesRender();
  setTimeout(lnParseSentenceFurigana, 50);
}

function lnPlaySentence(idx) {
  const recordings = LessonNotesState.currentStory?.sentenceRecordings;
  if (!recordings || !recordings[idx]) return;
  
  const audio = document.getElementById('lnAudioPlayer');
  if (audio) {
    audio.src = recordings[idx];
    audio.play();
  }
}

function lnDeleteSentence(idx) {
  if (!LessonNotesState.currentStory) return;
  
  const storyIdx = LessonNotesState.stories.findIndex(s => s.title === LessonNotesState.currentStory.title && s.text === LessonNotesState.currentStory.text);
  if (storyIdx < 0) return;
  
  if (LessonNotesState.stories[storyIdx].sentenceRecordings) {
    LessonNotesState.stories[storyIdx].sentenceRecordings[idx] = null;
    LessonNotesState.currentStory.sentenceRecordings = LessonNotesState.stories[storyIdx].sentenceRecordings;
    
    if (LessonNotesState.currentIdx !== null) {
      const sessions = lessonNotesGetSessions();
      if (sessions[LessonNotesState.currentIdx]) {
        sessions[LessonNotesState.currentIdx].stories = LessonNotesState.stories;
        lessonNotesSaveSessions(sessions);
      }
    }
  }
  
  lessonNotesRender();
  setTimeout(lnParseSentenceFurigana, 50);
}

async function lnPlayAllSentences() {
  const recordings = LessonNotesState.currentStory?.sentenceRecordings;
  if (!recordings) return;
  
  const audio = document.getElementById('lnAudioPlayer');
  if (!audio) return;
  
  // Get indices of recordings that exist
  const validIndices = recordings.map((r, i) => r ? i : -1).filter(i => i >= 0);
  let playIdx = 0;
  
  const playNext = () => {
    if (playIdx < validIndices.length) {
      const sentenceIdx = validIndices[playIdx];
      LessonNotesState.lnCurrentSentence = sentenceIdx;
      lessonNotesRender();
      audio.src = recordings[sentenceIdx];
      audio.play();
      playIdx++;
    }
  };
  
  audio.onended = playNext;
  playNext();
}

async function lnCombineAndSave() {
  const recordings = LessonNotesState.currentStory?.sentenceRecordings;
  // Filter to only existing recordings
  const validRecordings = recordings ? recordings.filter(r => r) : [];
  if (validRecordings.length === 0) return;
  
  const btn = event?.target;
  const originalText = btn?.textContent;
  if (btn) { btn.textContent = '⏳ Processing...'; btn.disabled = true; }
  
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Decode all recordings to AudioBuffers
    const audioBuffers = await Promise.all(validRecordings.map(async (r) => {
      const response = await fetch(r);
      const arrayBuffer = await response.arrayBuffer();
      return audioCtx.decodeAudioData(arrayBuffer);
    }));
    
    // Trim silence from each buffer and calculate total length
    const trimmedBuffers = audioBuffers.map(buf => trimSilence(buf, audioCtx));
    const totalLength = trimmedBuffers.reduce((sum, buf) => sum + buf.length, 0);
    
    // Create combined buffer
    const sampleRate = audioBuffers[0].sampleRate;
    const numChannels = audioBuffers[0].numberOfChannels;
    const combined = audioCtx.createBuffer(numChannels, totalLength, sampleRate);
    
    // Copy trimmed audio into combined buffer
    let offset = 0;
    for (const buf of trimmedBuffers) {
      for (let ch = 0; ch < numChannels; ch++) {
        combined.getChannelData(ch).set(buf.getChannelData(ch), offset);
      }
      offset += buf.length;
    }
    
    // Encode to WAV (webm encoding in browser is tricky)
    const wavBlob = audioBufferToWav(combined);
    
    // Convert to base64
    const reader = new FileReader();
    reader.onloadend = () => {
      lessonNotesSaveRecording(reader.result);
      if (btn) { btn.textContent = originalText || '💾 Combine'; btn.disabled = false; }
      alert(`Combined ${validRecordings.length} recordings and saved!`);
      lessonNotesRender();
    };
    reader.readAsDataURL(wavBlob);
    
    audioCtx.close();
  } catch (e) {
    console.error('Error combining recordings:', e);
    if (btn) { btn.textContent = originalText || '💾 Combine'; btn.disabled = false; }
    alert('Error combining recordings: ' + e.message);
  }
}

// (trimSilence and audioBufferToWav live in features-core.js)


async function lnCombineAndDownload() {
  const recordings = LessonNotesState.currentStory?.sentenceRecordings;
  // Filter to only existing recordings
  const validRecordings = recordings ? recordings.filter(r => r) : [];
  if (validRecordings.length === 0) return;
  
  const btn = event?.target;
  const originalText = btn?.textContent;
  if (btn) { btn.textContent = '⏳ Processing...'; btn.disabled = true; }
  
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Decode all recordings to AudioBuffers
    const audioBuffers = await Promise.all(validRecordings.map(async (r) => {
      const response = await fetch(r);
      const arrayBuffer = await response.arrayBuffer();
      return audioCtx.decodeAudioData(arrayBuffer);
    }));
    
    // Trim silence from each buffer and calculate total length
    const trimmedBuffers = audioBuffers.map(buf => trimSilence(buf, audioCtx));
    const totalLength = trimmedBuffers.reduce((sum, buf) => sum + buf.length, 0);
    
    // Create combined buffer
    const sampleRate = audioBuffers[0].sampleRate;
    const numChannels = audioBuffers[0].numberOfChannels;
    const combined = audioCtx.createBuffer(numChannels, totalLength, sampleRate);
    
    // Copy trimmed audio into combined buffer
    let offset = 0;
    for (const buf of trimmedBuffers) {
      for (let ch = 0; ch < numChannels; ch++) {
        combined.getChannelData(ch).set(buf.getChannelData(ch), offset);
      }
      offset += buf.length;
    }
    
    // Encode to WAV and download
    const wavBlob = audioBufferToWav(combined);
    
    // Create filename from story title
    const title = LessonNotesState.currentStory?.title || 'recording';
    const safeName = title.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_').slice(0, 50);
    const filename = `${safeName}_${new Date().toISOString().slice(0,10)}.wav`;
    
    // Try to use Save As dialog (File System Access API)
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: 'WAV Audio',
            accept: { 'audio/wav': ['.wav'] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(wavBlob);
        await writable.close();
        if (btn) { btn.textContent = originalText || '⬇ Download'; btn.disabled = false; }
        audioCtx.close();
        return;
      } catch (e) {
        // User cancelled or API not supported, fall through to regular download
        if (e.name === 'AbortError') {
          if (btn) { btn.textContent = originalText || '⬇ Download'; btn.disabled = false; }
          audioCtx.close();
          return;
        }
      }
    }
    
    // Fallback: regular download
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    if (btn) { btn.textContent = originalText || '⬇ Download'; btn.disabled = false; }
    audioCtx.close();
  } catch (e) {
    console.error('Error combining recordings:', e);
    if (btn) { btn.textContent = originalText || '⬇ Download'; btn.disabled = false; }
    alert('Error combining recordings: ' + e.message);
  }
}

async function lessonNotesToggleRecording() {
  if (LessonNotesState.lnIsRecording) {
    // Stop recording
    if (LessonNotesState.lnMediaRecorder && LessonNotesState.lnMediaRecorder.state !== 'inactive') {
      LessonNotesState.lnMediaRecorder.stop();
    }
  } else {
    // Start recording
    try {
      LessonNotesState.lnAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      LessonNotesState.lnMediaRecorder = new MediaRecorder(LessonNotesState.lnAudioStream);
      LessonNotesState.lnAudioChunks = [];
      
      LessonNotesState.lnMediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          LessonNotesState.lnAudioChunks.push(e.data);
        }
      };
      
      LessonNotesState.lnMediaRecorder.onstop = async () => {
        // Convert to base64 and save
        const blob = new Blob(LessonNotesState.lnAudioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result;
          lessonNotesSaveRecording(base64);
        };
        reader.readAsDataURL(blob);
        
        // Stop all tracks
        LessonNotesState.lnAudioStream.getTracks().forEach(track => track.stop());
        
        LessonNotesState.lnIsRecording = false;
        lessonNotesRender();
      };
      
      LessonNotesState.lnMediaRecorder.start();
      LessonNotesState.lnIsRecording = true;
      lessonNotesRender();
    } catch (e) {
      console.error('Recording error:', e);
      alert('Could not access microphone. Please allow microphone access.');
    }
  }
}

function lessonNotesSaveRecording(base64Audio) {
  if (!LessonNotesState.currentStory) return;
  
  // Find the story index
  const storyIdx = LessonNotesState.stories.findIndex(s => s.title === LessonNotesState.currentStory.title && s.text === LessonNotesState.currentStory.text);
  if (storyIdx < 0) return;
  
  // Save to story object
  LessonNotesState.stories[storyIdx].recording = base64Audio;
  LessonNotesState.currentStory.recording = base64Audio;
  
  // Save to session in localStorage
  if (LessonNotesState.currentIdx !== null) {
    const sessions = lessonNotesGetSessions();
    if (sessions[LessonNotesState.currentIdx]) {
      sessions[LessonNotesState.currentIdx].stories = LessonNotesState.stories;
      lessonNotesSaveSessions(sessions);
    }
  }
  
  lessonNotesRender();
}

function lessonNotesPlayRecording() {
  if (!LessonNotesState.currentStory?.recording) return;
  
  const audio = document.getElementById('lnAudioPlayer');
  if (audio) {
    audio.src = LessonNotesState.currentStory.recording;
    audio.play();
  }
}

function lessonNotesDeleteRecording() {
  if (!LessonNotesState.currentStory) return;
  if (!confirm('Delete this recording?')) return;
  
  // Find the story index
  const storyIdx = LessonNotesState.stories.findIndex(s => s.title === LessonNotesState.currentStory.title && s.text === LessonNotesState.currentStory.text);
  if (storyIdx < 0) return;
  
  // Remove recording
  delete LessonNotesState.stories[storyIdx].recording;
  delete LessonNotesState.currentStory.recording;
  
  // Save to session
  if (LessonNotesState.currentIdx !== null) {
    const sessions = lessonNotesGetSessions();
    if (sessions[LessonNotesState.currentIdx]) {
      sessions[LessonNotesState.currentIdx].stories = LessonNotesState.stories;
      lessonNotesSaveSessions(sessions);
    }
  }
  
  lessonNotesRender();
}

function lessonNotesCopyStory() {
  if (!LessonNotesState.currentStory) return;
  const text = LessonNotesState.currentStory.text;
  navigator.clipboard.writeText(text).then(() => {
    // Brief visual feedback
    const btn = document.querySelector('button[onclick="lessonNotesCopyStory()"]');
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = '✓ Copied';
      btn.style.color = 'var(--teal)';
      setTimeout(() => {
        btn.innerHTML = orig;
        btn.style.color = '';
      }, 1500);
    }
  });
}

function lessonNotesToggleFuri() {
  LessonNotesState.lnFuriOn = !LessonNotesState.lnFuriOn;
  // Update button state
  const btn = document.querySelector('#lessonNotesViewMain .qr-btn-sec');
  if (btn) {
    if (LessonNotesState.lnFuriOn) {
      btn.style.color = 'var(--teal)';
      btn.style.borderColor = 'var(--teal)';
      btn.classList.add('active');
    } else {
      btn.style.color = '';
      btn.style.borderColor = '';
      btn.classList.remove('active');
    }
  }
  lessonNotesRenderStoryText();
}

// LessonNotesState.lnIsSpeaking — see declaration above

function lessonNotesToggleSpeak() {
  const btn = document.getElementById('lnSpeakBtn');
  
  if (LessonNotesState.lnIsSpeaking || (window.speechSynthesis && speechSynthesis.speaking)) {
    // Stop speaking
    speechSynthesis.cancel();
    LessonNotesState.lnIsSpeaking = false;
    if (btn) {
      btn.innerHTML = '🔊 Read';
      btn.style.color = '';
      btn.style.borderColor = '';
    }
  } else {
    // Start speaking
    if (LessonNotesState.currentStory) {
      LessonNotesState.lnIsSpeaking = true;
      if (btn) {
        btn.innerHTML = '⏹ Stop';
        btn.style.color = 'var(--red)';
        btn.style.borderColor = 'var(--red)';
      }
      
      const text = LessonNotesState.currentStory.text;
      const _lnDone = () => {
        LessonNotesState.lnIsSpeaking = false;
        if (btn) { btn.innerHTML = '🔊 Read'; btn.style.color = ''; btn.style.borderColor = ''; }
      };
      TTS.speak(text, 0.85, { onend: _lnDone, onerror: _lnDone });
    }
  }
}

// Keep old function for compatibility
function lessonNotesRenderDrillCard() {
  if (LessonNotesState.vocab.length === 0) return '<div style="text-align:center;color:var(--ink-light);font-family:var(--ui)">No vocab extracted yet</div>';
  
  const v = LessonNotesState.vocab[LessonNotesState.drillIdx];
  const progress = `${LessonNotesState.drillIdx + 1} / ${LessonNotesState.vocab.length}`;
  const meaning = v.meaning || v.en || '';
  const reading = v.reading || '';
  const word = v.word || '';
  
  let prompt = '', hints = '';
  
  // Build the answer display based on reveal state
  // For en2jp: show English, reveal Japanese word then reading
  // For jp modes: show Japanese, reveal reading then meaning
  let answerLine1 = '', answerLine2 = '';
  
  if (LessonNotesState.drillMode === 'en2jp') {
    // EN → JP mode: show meaning, reveal word then reading
    prompt = meaning || '(no meaning)';
    answerLine1 = word || '(no word)';
    answerLine2 = reading || '';
    
    // Show hints if enabled
    if (LessonNotesState.showReading && reading && LessonNotesState.drillRevealed < 1) {
      hints = `<div style="font-family:var(--jp);font-size:0.9rem;color:var(--ink-light);margin-top:4px">${reading}</div>`;
    }
  } else if (LessonNotesState.drillMode === 'jp2reading' || LessonNotesState.drillMode === 'jp2en') {
    prompt = word;
    answerLine1 = reading || '(no reading)';
    answerLine2 = meaning || '(no meaning)';
    
    // Show hints if enabled
    if (LessonNotesState.showMeaning && meaning && LessonNotesState.drillRevealed < 2) {
      hints = `<div style="font-family:var(--ui);font-size:0.85rem;color:var(--ink-light);margin-top:4px">${meaning}</div>`;
    }
    if (LessonNotesState.showReading && reading && LessonNotesState.drillRevealed < 1) {
      hints = `<div style="font-family:var(--jp);font-size:0.9rem;color:var(--ink-light);margin-top:4px">${reading}</div>`;
    }
  } else if (LessonNotesState.drillMode === 'listening') {
    const safeWord = word.replace(/'/g, "\\'");
    prompt = `🔊 <button class="btn-primary" onclick="jpSpeak('${safeWord}')">Play</button>`;
    answerLine1 = reading || '(no reading)';
    answerLine2 = meaning || '(no meaning)';
  }
  
  const hiddenCount = LessonNotesState.hiddenWords.size;
  
  // Determine button label
  let btnLabel = 'Reveal';
  let btnActive = false;
  if (LessonNotesState.drillRevealed === 1) {
    btnLabel = LessonNotesState.drillMode === 'en2jp' ? 'Reading' : 'Meaning';
    btnActive = false;
  } else if (LessonNotesState.drillRevealed === 2) {
    btnLabel = 'Hide';
    btnActive = true;
  }
  
  // For en2jp mode, first line is the Japanese word (in serif), second is reading
  const line1Style = LessonNotesState.drillMode === 'en2jp' 
    ? "font-family:'Shippori Mincho',serif;font-size:1.8rem;color:var(--teal)"
    : "font-family:var(--jp);font-size:1.2rem;color:var(--teal)";
  const line2Style = LessonNotesState.drillMode === 'en2jp'
    ? "font-family:var(--jp);font-size:1rem;color:var(--ink-light);margin-top:6px"
    : "font-family:var(--ui);font-size:0.95rem;color:var(--ink-light);margin-top:6px";
  
  // For en2jp, prompt is English so use UI font
  const promptStyle = LessonNotesState.drillMode === 'en2jp'
    ? "font-family:var(--ui);font-size:1.4rem;color:var(--ink);margin-bottom:4px"
    : "font-family:'Shippori Mincho',serif;font-size:2rem;color:var(--ink);margin-bottom:4px";
  
  return `
    <div style="text-align:center">
      <div style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light);margin-bottom:12px">${progress}${hiddenCount > 0 ? ` <span style="color:var(--teal)">(${hiddenCount} learned)</span>` : ''}</div>
      <div style="${promptStyle}">${prompt}</div>
      ${hints}
      <div id="lessonNotesDrillAnswer" style="min-height:60px;margin:16px 0">
        <div style="${line1Style};${LessonNotesState.drillRevealed >= 1 ? '' : 'visibility:hidden'}">${answerLine1}</div>
        <div style="${line2Style};${LessonNotesState.drillRevealed >= 2 ? '' : 'visibility:hidden'}">${answerLine2}</div>
      </div>
      <div id="lessonNotesDrillBackground" style="display:none;text-align:left;margin:12px 0;padding:12px;background:rgba(48,213,200,0.06);border:1px solid rgba(48,213,200,0.15);border-radius:6px;font-family:var(--ui);font-size:0.82rem;color:var(--ink);line-height:1.6"></div>
      <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap">
        <button class="btn-ghost" onclick="lessonNotesDrillPrev()">← Prev</button>
        <button onclick="lessonNotesDrillReveal()" style="padding:8px 20px;background:${btnActive?'none':'var(--gold)'};border:1px solid ${btnActive?'var(--border)':'var(--gold)'};border-radius:6px;font-family:var(--ui);font-size:0.85rem;color:${btnActive?'var(--ink-light)':'#1c1c1e'};cursor:pointer">${btnLabel}</button>
        <button class="btn-ghost" onclick="lessonNotesDrillNext()">Next →</button>
        <button class="btn-ghost" onclick="lessonNotesHideCard()" title="Mark as learned and hide from drill">✓ Learned</button>
        <button class="btn-ghost" onclick="lessonNotesDrillBackground()" title="Show context and background">📖 Background</button>
      </div>
    </div>
  `;
}

// LessonNotesState.hiddenWords — see declaration above

async function lessonNotesDrillBackground() {
  const bgEl = document.getElementById('lessonNotesDrillBackground');
  if (!bgEl) return;
  
  const v = LessonNotesState.vocab[LessonNotesState.drillIdx];
  if (!v) return;
  
  const word = v.word || '';
  const reading = v.reading || '';
  const meaning = v.meaning || v.en || '';
  
  // Find sentences containing this word from the lesson content
  const docContent = LessonNotesState.docContent || [];
  const matchingSentences = docContent.filter(line => 
    line && typeof line === 'string' && line.includes(word)
  ).slice(0, 3); // Max 3 sentences
  
  bgEl.style.display = 'block';
  bgEl.innerHTML = '<span style="color:var(--ink-light)">Loading background...</span>';
  
  const apiKey = _fy_getApiKey();
  if (!apiKey) {
    bgEl.innerHTML = '<span style="color:var(--red)">No API key set</span>';
    return;
  }
  
  try {
    const contextInfo = matchingSentences.length > 0 
      ? `\n\nSentences from lesson where this word appears:\n${matchingSentences.map(s => `• ${s}`).join('\n')}`
      : '';
    
    const data = await _fy_claudeAPI({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        messages: [{ role: 'user', content: `Give brief background on this Japanese word for a learner:

Word: ${word}
Reading: ${reading}
Meaning: ${meaning}${contextInfo}

Provide:
1. Any kanji breakdown (if applicable) - what each kanji means
2. Common usage notes or nuances
3. Related words or expressions (1-2)
${matchingSentences.length > 0 ? '4. Brief comment on how it\'s used in the example sentences' : ''}

Keep it concise and helpful. Use simple formatting.` }]
    ,
      track: 'lesson'
    });
    
    const text = (data.content?.[0]?.text || 'No response').trim();
    
    let html = '';
    if (matchingSentences.length > 0) {
      html += `<div style="margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border)"><strong style="color:var(--gold)">From lesson:</strong><br>${matchingSentences.map(s => `<span style="color:var(--ink-light)">「${s}」</span>`).join('<br>')}</div>`;
    }
    html += text.replace(/\n/g, '<br>');
    bgEl.innerHTML = html;
  } catch (e) {
    bgEl.innerHTML = '<span style="color:var(--red)">Error loading background</span>';
  }
}

const LEARNED_WORDS_KEY = 'lessonNotesLearnedWords';

function lessonNotesGetLearnedWords() {
  try {
    return new Set(JSON.parse(localStorage.getItem(LEARNED_WORDS_KEY) || '[]'));
  } catch { return new Set(); }
}

function lessonNotesSaveLearnedWords() {
  localStorage.setItem(LEARNED_WORDS_KEY, JSON.stringify([...LessonNotesState.permanentlyLearned]));
}

// LessonNotesState.permanentlyLearned — loaded in init

function lessonNotesSaveHiddenPermanently() {
  // Add all currently hidden words to permanent storage
  LessonNotesState.hiddenWords.forEach(word => LessonNotesState.permanentlyLearned.add(word));
  lessonNotesSaveLearnedWords();
  LessonNotesState.hiddenWords.clear();
  lessonNotesRender();
}

function lessonNotesShowMastered() {
  const area = document.getElementById('lessonNotesBreakdownArea');
  if (!area) return;
  
  const words = [...LessonNotesState.permanentlyLearned];
  area.style.display = 'block';
  area.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span style="font-family:var(--ui);font-size:0.72rem;letter-spacing:0.05em;color:var(--ink-light)">MASTERED WORDS (${words.length})</span>
      <button class="btn-icon" onclick="document.getElementById('lessonNotesBreakdownArea').style.display='none'">✕</button>
    </div>
    <div style="font-family:var(--jp);font-size:0.95rem;line-height:2;color:var(--ink);max-height:200px;overflow-y:auto">
      ${words.length > 0 ? words.map(w => `<span style="display:inline-block;background:var(--paper);border:1px solid var(--border);border-radius:4px;padding:2px 8px;margin:2px">${w}</span>`).join('') : '<span style="color:var(--ink-light)">No mastered words yet</span>'}
    </div>
  `;
}

function lessonNotesClearMastered() {
  if (!confirm('Clear all mastered words? They will appear in drills again.')) return;
  LessonNotesState.permanentlyLearned.clear();
  lessonNotesSaveLearnedWords();
  lessonNotesRender();
}

function lessonNotesBreakdownCurrent() {
  if (LessonNotesState.vocab.length === 0) return;
  const v = LessonNotesState.vocab[LessonNotesState.drillIdx];
  if (v && v.word) lessonNotesBreakdown(v.word);
}

function lessonNotesExamplesCurrent() {
  if (LessonNotesState.vocab.length === 0) return;
  const v = LessonNotesState.vocab[LessonNotesState.drillIdx];
  if (v && v.word) lessonNotesExamples(v.word);
}

// Breakdown cache - separate from translations since it has different content
const BREAKDOWN_CACHE_KEY = 'jpBreakdownCache';
// LessonNotesState.breakdownCache — see declaration above
try { LessonNotesState.breakdownCache = JSON.parse(localStorage.getItem(BREAKDOWN_CACHE_KEY) || '{}'); } catch(e) {}

function breakdownCacheSave() {
  const keys = Object.keys(LessonNotesState.breakdownCache);
  if (keys.length > 200) {
    const toRemove = keys.slice(0, keys.length - 200);
    toRemove.forEach(k => delete LessonNotesState.breakdownCache[k]);
  }
  localStorage.setItem(BREAKDOWN_CACHE_KEY, JSON.stringify(LessonNotesState.breakdownCache));
}

async function lessonNotesBreakdown(word) {
  const area = document.getElementById('lessonNotesBreakdownArea');
  if (!area) return;
  
  area.style.display = 'block';
  
  // Check cache first
  if (LessonNotesState.breakdownCache[word]) {
    area.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-family:var(--ui);font-size:0.72rem;letter-spacing:0.05em;color:var(--ink-light)">BREAKDOWN <span style="font-size:0.65rem">📋</span></span>
        <button class="btn-icon" onclick="document.getElementById('lessonNotesBreakdownArea').style.display='none'">✕</button>
      </div>
      <div style="font-family:var(--jp);font-size:0.9rem;line-height:1.8;color:var(--ink);white-space:pre-wrap">${LessonNotesState.breakdownCache[word]}</div>
    `;
    return;
  }
  
  area.innerHTML = `<div style="text-align:center;color:var(--ink-light);font-family:var(--ui);font-size:0.85rem">Breaking down "${word}"...</div>`;
  
  const apiKey = _fy_getApiKey();
  if (!apiKey) {
    area.innerHTML = `<div style="color:var(--ink-light);font-family:var(--ui)">Set API key in settings first</div>`;
    return;
  }
  
  try {
    const data = await _fy_claudeAPI({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [{ role: 'user', content: `Break down this Japanese word into its components: ${word}

For each kanji/component, give:
- The character
- Its reading (in this word)
- Its individual meaning

Then briefly explain how the parts combine to form the word's meaning.

Keep it concise and formatted clearly.` }]
    ,
      track: 'lesson'
    });
    
    const text = data.content?.[0]?.text || 'Could not break down';
    
    // Save to cache
    LessonNotesState.breakdownCache[word] = text;
    breakdownCacheSave();
    
    area.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-family:var(--ui);font-size:0.72rem;letter-spacing:0.05em;color:var(--ink-light)">BREAKDOWN</span>
        <button class="btn-icon" onclick="document.getElementById('lessonNotesBreakdownArea').style.display='none'">✕</button>
      </div>
      <div style="font-family:var(--jp);font-size:0.9rem;line-height:1.8;color:var(--ink);white-space:pre-wrap">${text}</div>
    `;
  } catch (e) {
    area.innerHTML = `<div style="color:var(--red);font-family:var(--ui)">Error: ${e.message}</div>`;
  }
}

async function lessonNotesExamples(word) {
  const area = document.getElementById('lessonNotesBreakdownArea');
  if (!area) return;
  
  area.style.display = 'block';
  area.innerHTML = `<div style="text-align:center;color:var(--ink-light);font-family:var(--ui);font-size:0.85rem">Finding examples for "${word}"...</div>`;
  
  const apiKey = _fy_getApiKey();
  if (!apiKey) {
    area.innerHTML = `<div style="color:var(--ink-light);font-family:var(--ui)">Set API key in settings first</div>`;
    return;
  }
  
  try {
    const data = await _fy_claudeAPI({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        messages: [{ role: 'user', content: `Give 4 example sentences using the Japanese word: ${word}

For each sentence:
1. Japanese sentence
2. Reading in hiragana (for kanji words)
3. English translation

Make sentences progressively more complex. Keep formatting clean and consistent.` }]
    ,
      track: 'lesson'
    });
    
    const text = data.content?.[0]?.text || 'Could not find examples';
    
    area.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-family:var(--ui);font-size:0.72rem;letter-spacing:0.05em;color:var(--ink-light)">EXAMPLES</span>
        <button class="btn-icon" onclick="document.getElementById('lessonNotesBreakdownArea').style.display='none'">✕</button>
      </div>
      <div style="font-family:var(--jp);font-size:0.9rem;line-height:1.8;color:var(--ink);white-space:pre-wrap">${text}</div>
    `;
  } catch (e) {
    area.innerHTML = `<div style="color:var(--red);font-family:var(--ui)">Error: ${e.message}</div>`;
  }
}

function lessonNotesHideCard() {
  if (LessonNotesState.vocab.length === 0) return;
  
  const v = LessonNotesState.vocab[LessonNotesState.drillIdx];
  if (v && v.word) {
    LessonNotesState.hiddenWords.add(v.word);
  }
  
  // Remove from current vocab array
  LessonNotesState.vocab.splice(LessonNotesState.drillIdx, 1);
  
  // Also remove from original if it exists there
  const origIdx = LessonNotesState.vocabOriginal.findIndex(w => w.word === v.word);
  if (origIdx >= 0) {
    LessonNotesState.vocabOriginal.splice(origIdx, 1);
  }
  
  // Adjust index if needed
  if (LessonNotesState.drillIdx >= LessonNotesState.vocab.length) {
    LessonNotesState.drillIdx = Math.max(0, LessonNotesState.vocab.length - 1);
  }
  LessonNotesState.drillRevealed = 0;
  lessonNotesRender();
}

function lessonNotesRestoreHidden() {
  // Restore all hidden words from the session (but not permanently learned)
  const sessions = lessonNotesGetSessions();
  if (LessonNotesState.currentIdx !== null && sessions[LessonNotesState.currentIdx]) {
    const allVocab = sessions[LessonNotesState.currentIdx].vocab || [];
    // Filter out permanently learned words
    LessonNotesState.vocab = allVocab.filter(v => !LessonNotesState.permanentlyLearned.has(v.word));
    LessonNotesState.vocabOriginal = [...LessonNotesState.vocab];
    LessonNotesState.hiddenWords.clear();
    LessonNotesState.shuffled = false;
    LessonNotesState.drillIdx = 0;
    LessonNotesState.drillRevealed = 0;
    lessonNotesRender();
  }
}

function lessonNotesToggleTable() {
  LessonNotesState.tableHidden = !LessonNotesState.tableHidden;
  lessonNotesRender();
}

function lessonNotesToggleShowReading() {
  LessonNotesState.showReading = !LessonNotesState.showReading;
  lessonNotesRender();
}

function lessonNotesToggleShowMeaning() {
  LessonNotesState.showMeaning = !LessonNotesState.showMeaning;
  lessonNotesRender();
}

function lessonNotesToggleShuffle() {
  if (LessonNotesState.shuffled) {
    // Restore original order
    LessonNotesState.vocab = [...LessonNotesState.vocabOriginal];
    LessonNotesState.shuffled = false;
  } else {
    // Save original and shuffle
    LessonNotesState.vocabOriginal = [...LessonNotesState.vocab];
    for (let i = LessonNotesState.vocab.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [LessonNotesState.vocab[i], LessonNotesState.vocab[j]] = [LessonNotesState.vocab[j], LessonNotesState.vocab[i]];
    }
    LessonNotesState.shuffled = true;
  }
  LessonNotesState.drillIdx = 0;
  LessonNotesState.drillRevealed = 0;
  lessonNotesRender();
}

// LessonNotesState.rawText/docImages — see declaration above

// LessonNotesState.loadingSession — see declaration above

function lessonNotesLoadSession(idx) {
  // Guard against reload loops
  if (LessonNotesState.loadingSession) return;
  if (idx === LessonNotesState.currentIdx) return; // Already on this session
  
  LessonNotesState.loadingSession = true;
  
  if (idx < 0) {
    LessonNotesState.currentIdx = null;
    LessonNotesState.vocab = [];
    LessonNotesState.vocabOriginal = [];
    LessonNotesState.stories = [];
    LessonNotesState.keyPhrases = [];
    LessonNotesState.grammar = [];
    LessonNotesState.errors = [];
    LessonNotesState.rawText = '';
    LessonNotesState.docImages = [];
    LessonNotesState.docContent = [];
  } else {
    const sessions = lessonNotesGetSessions();
    if (sessions[idx]) {
      LessonNotesState.currentIdx = idx;
      // Filter out permanently learned words
      const allVocab = sessions[idx].vocab || [];
      LessonNotesState.vocab = allVocab.filter(v => !LessonNotesState.permanentlyLearned.has(v.word));
      LessonNotesState.vocabOriginal = [...LessonNotesState.vocab];
      LessonNotesState.stories = sessions[idx].stories || [];
      LessonNotesState.keyPhrases = sessions[idx].keyPhrases || [];
      LessonNotesState.grammar = sessions[idx].grammar || [];
      LessonNotesState.errors = sessions[idx].errors || [];
      LessonNotesState.rawText = sessions[idx].rawText || '';
      LessonNotesState.docImages = sessions[idx].images || [];
      LessonNotesState.docContent = sessions[idx].docContent || [];
      
      // Auto-extract if we have doc content but missing extracted data
      // Only auto-extract for NEW sessions (no vocab yet) - don't re-extract old sessions
      // that are just missing the newer fields (keyPhrases, grammar)
      if (LessonNotesState.docContent.length > 0 && LessonNotesState.vocab.length === 0) {
        setTimeout(() => lessonNotesAutoExtractAll(), 200);
      }
    }
  }
  LessonNotesState.drillIdx = 0;
  LessonNotesState.drillRevealed = 0;
  LessonNotesState.shuffled = false;
  LessonNotesState.hiddenWords.clear();
  LessonNotesState.viewMode = 'vocab';
  LessonNotesState.currentStory = null;
  LessonNotesState.grammarDetail = null;
  
  // Stop any ongoing speech
  if (window.speechSynthesis) speechSynthesis.cancel();
  LessonNotesState.lnIsSpeaking = false;
  
  lessonNotesRender();
  
  // Clear guard after a short delay
  setTimeout(() => { LessonNotesState.loadingSession = false; }, 100);
}

function lessonNotesNew() {
  LessonNotesState.currentIdx = null;
  LessonNotesState.vocab = [];
  LessonNotesState.stories = [];
  LessonNotesState.errors = [];
  LessonNotesState.rawText = '';
  LessonNotesState.docImages = [];
  LessonNotesState.docContent = [];
  LessonNotesState.drillIdx = 0;
  LessonNotesState.viewMode = 'vocab';
  lessonNotesRender();
  document.getElementById('lessonNotesTitle').value = '';
  document.getElementById('lessonNotesInput').value = '';
  document.getElementById('lessonNotesTitle').focus();
}

function lessonNotesDelete() {
  if (LessonNotesState.currentIdx === null) return;
  if (!confirm('Delete this lesson and all its vocab?')) return;
  
  const sessions = lessonNotesGetSessions();
  sessions.splice(LessonNotesState.currentIdx, 1);
  lessonNotesSaveSessions(sessions);
  
  // Clear all state
  LessonNotesState.currentIdx = null;
  LessonNotesState.vocab = [];
  LessonNotesState.vocabOriginal = [];
  LessonNotesState.stories = [];
  LessonNotesState.keyPhrases = [];
  LessonNotesState.grammar = [];
  LessonNotesState.errors = [];
  LessonNotesState.docContent = [];
  LessonNotesState.currentStory = null;
  LessonNotesState.drillIdx = 0;
  LessonNotesState.drillRevealed = 0;
  LessonNotesState.shuffled = false;
  LessonNotesState.viewMode = 'vocab';
  LessonNotesState.fullDocSearch = '';
  
  lessonNotesRender();
}

// LessonNotesState.editMode — see declaration above

function lessonNotesShowEdit() {
  LessonNotesState.editMode = true;
  lessonNotesRenderEditView();
}

function lessonNotesRenderEditView() {
  const el1 = document.getElementById('lessonNotesView');
  const el2 = document.getElementById('lessonNotesViewMain');
  const sessions = lessonNotesGetSessions();
  const currentSession = LessonNotesState.currentIdx !== null ? sessions[LessonNotesState.currentIdx] : null;
  
  const html = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <button class="yoshi-read-btn btn-icon" onclick="LessonNotesState.editMode=false;lessonNotesRender()">← Back to Drill</button>
      <span style="font-family:var(--ui);font-size:0.85rem;color:var(--ink)">${currentSession?.title || 'Untitled'}</span>
    </div>
    
    <div id="lessonNotesDropZone" 
      ondragover="event.preventDefault();this.style.borderColor='var(--teal)';this.style.background='rgba(48,213,200,0.05)'"
      ondragleave="this.style.borderColor='var(--field-border)';this.style.background='none'"
      ondrop="lessonNotesHandleDrop(event)"
      style="border:2px dashed var(--field-border);border-radius:8px;padding:16px;transition:all 0.2s">
      
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <input type="text" id="lessonNotesTitle" placeholder="Lesson title" 
          value="${currentSession?.title || ''}"
          style="flex:1;padding:8px 12px;background:var(--field);border:1px solid var(--field-border);color:var(--ink);font-family:var(--ui);font-size:0.9rem;border-radius:6px;outline:none">
        <label style="padding:6px 12px;background:none;border:1px solid var(--border);border-radius:6px;font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);cursor:pointer">
          📄 Browse
          <input type="file" accept=".docx,.txt" onchange="lessonNotesHandleFile(this.files[0])" style="display:none">
        </label>
        <button class="yoshi-read-btn btn-icon" onclick="lessonNotesExtract()">✨ Re-extract</button>
      </div>
      
      <textarea id="lessonNotesInput" style="width:100%;min-height:200px;padding:12px;background:var(--field);border:1px solid var(--field-border);color:var(--ink);font-family:var(--jp);font-size:0.9rem;line-height:1.7;border-radius:6px;outline:none;resize:vertical">${currentSession?.rawText || ''}</textarea>
    </div>
  `;
  
  if (el1) el1.innerHTML = html;
  if (el2) el2.innerHTML = html;
}

function lessonNotesSetMode(mode) {
  LessonNotesState.drillMode = mode;
  LessonNotesState.drillRevealed = 0;
  lessonNotesRender();
}

function lessonNotesDrillReveal() {
  // Cycle: 0 (hidden) -> 1 (reading) -> 2 (meaning) -> 0 (hidden)
  LessonNotesState.drillRevealed = (LessonNotesState.drillRevealed + 1) % 3;
  const area = document.getElementById('lessonNotesDrillArea');
  if (area) area.innerHTML = lessonNotesRenderDrillCard();
}

function lessonNotesDrillNext() {
  LessonNotesState.drillIdx = (LessonNotesState.drillIdx + 1) % LessonNotesState.vocab.length;
  LessonNotesState.drillRevealed = 0;
  lessonNotesRender();
}

function lessonNotesDrillPrev() {
  LessonNotesState.drillIdx = (LessonNotesState.drillIdx - 1 + LessonNotesState.vocab.length) % LessonNotesState.vocab.length;
  LessonNotesState.drillRevealed = 0;
  lessonNotesRender();
}

function lessonNotesDrillAll() {
  // Combine vocab from all sessions, excluding permanently learned
  const sessions = lessonNotesGetSessions();
  LessonNotesState.vocab = [];
  sessions.forEach(s => {
    if (s.vocab && s.vocab.length) {
      s.vocab.forEach(v => {
        if (!LessonNotesState.permanentlyLearned.has(v.word)) {
          LessonNotesState.vocab.push(v);
        }
      });
    }
  });
  LessonNotesState.vocabOriginal = [...LessonNotesState.vocab];
  // Shuffle
  for (let i = LessonNotesState.vocab.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [LessonNotesState.vocab[i], LessonNotesState.vocab[j]] = [LessonNotesState.vocab[j], LessonNotesState.vocab[i]];
  }
  LessonNotesState.shuffled = true;
  LessonNotesState.drillIdx = 0;
  LessonNotesState.drillRevealed = 0;
  LessonNotesState.hiddenWords.clear();
  LessonNotesState.currentIdx = null; // Clear current selection since we're drilling all
  lessonNotesRender();
}

async function lessonNotesExtract() {
  const titleEl = document.getElementById('lessonNotesTitle');
  const inputEl = document.getElementById('lessonNotesInput');
  const title = titleEl?.value?.trim() || 'Lesson ' + new Date().toLocaleDateString();
  const text = inputEl?.value?.trim();
  
  if (!text) { alert('Paste some lesson notes first'); return; }
  
  const apiKey = _fy_getApiKey();
  if (!apiKey) { alert('Set API key in settings first'); return; }
  
  // Extract vocab using Claude
  const btn = document.querySelector('#lessonNotesView .yoshi-read-btn');
  const originalText = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Extracting…'; }
  
  try {
    const data = await _fy_claudeAPI({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: `Extract vocabulary from these Japanese lesson notes and provide English translations.

Look for:
1. Words with readings in parentheses: 病気（びょうき）
2. Words followed by hiragana reading: 桜　さくら  
3. Kanji compound words
4. Words marked in brackets【】

For EACH word, provide:
- word: the Japanese word (kanji if available)
- reading: hiragana reading
- meaning: English translation (YOU must provide this even if not in the notes)

Return ONLY a JSON array, no explanation:
[{"word":"病気","reading":"びょうき","meaning":"illness, sickness"},{"word":"桜","reading":"さくら","meaning":"cherry blossom"}]

Skip particles (は、が、を), grammar patterns, and full sentences - extract only vocabulary words.

Notes:
${text}` }]
    ,
      track: 'lesson'
    });
    
    const raw = (data.content?.[0]?.text || '').trim();
    
    try {
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const vocab = JSON.parse(cleaned);
      
      // Save session (include images from docx extraction)
      const sessions = lessonNotesGetSessions();
      const session = { 
        title, 
        rawText: text, 
        vocab, 
        stories: [], 
        errors: [],
        images: LessonNotesState.docImages || [],
        date: new Date().toISOString() 
      };
      
      if (LessonNotesState.currentIdx !== null) {
        // Update existing
        sessions[LessonNotesState.currentIdx] = session;
      } else {
        // Add new at beginning
        sessions.unshift(session);
        LessonNotesState.currentIdx = 0;
      }
      
      lessonNotesSaveSessions(sessions);
      LessonNotesState.vocab = vocab;
      LessonNotesState.rawText = text;
      LessonNotesState.drillIdx = 0;
      LessonNotesState.drillRevealed = 0;
      
      // Now extract stories in a second call
      lessonNotesExtractStories(text, LessonNotesState.currentIdx);
      
    } catch (e) {
      console.error('Parse error:', e, raw);
      alert('Could not parse vocab. Check console.');
    }
  } catch (e) {
    console.error('API error:', e);
    alert('Error extracting vocab');
  }
  
  if (btn) { btn.disabled = false; btn.textContent = originalText; }
  lessonNotesRender();
}

async function lessonNotesExtractStories(text, sessionIdx) {
  const apiKey = _fy_getApiKey();
  if (!apiKey) return;
  
  try {
    const data = await _fy_claudeAPI({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        messages: [{ role: 'user', content: `Extract continuous Japanese text passages, stories, or anecdotes from these lesson notes.

Look for:
- Short stories or narratives
- Example sentences grouped together
- Continuous passages of Japanese text (not just word lists)
- Dialogues or conversations

For each passage found, provide:
- title: A short Japanese title (create one if not present, based on content)
- text: The full Japanese text of the passage

Return ONLY a JSON array:
[{"title":"朝ごはんの話","text":"今日、私は朝ごはんを食べました。..."},{"title":"電車で","text":"昨日、電車に乗りました。..."}]

If no continuous passages are found, return empty array: []

Notes:
${text}` }]
    ,
      track: 'lesson'
    });
    
    const raw = (data.content?.[0]?.text || '').trim();
    const cleaned = raw.replace(/```json|```/g, '').trim();
    let stories = JSON.parse(cleaned);
    
    // Remove bracketed readings from story text (e.g. 食べる（たべる） -> 食べる)
    stories = stories.map(s => ({
      ...s,
      text: lessonNotesRemoveBracketedReadings(s.text)
    }));
    
    // Save stories to session
    const sessions = lessonNotesGetSessions();
    if (sessions[sessionIdx]) {
      sessions[sessionIdx].stories = stories;
      lessonNotesSaveSessions(sessions);
      LessonNotesState.stories = stories;
      lessonNotesRender();
    }
    
    // Now extract errors
    lessonNotesExtractErrors(text, sessionIdx);
  } catch (e) {
    console.error('Story extraction error:', e);
  }
}

// Remove bracketed hiragana/katakana readings that follow kanji
// e.g. "食べる（たべる）" -> "食べる", "漢字(かんじ)" -> "漢字"
function lessonNotesRemoveBracketedReadings(text) {
  // Match kanji followed by bracketed hiragana/katakana
  // Supports both （） and () brackets
  return text
    .replace(/([一-龯々]+)（[ぁ-んァ-ン]+）/g, '$1')
    .replace(/([一-龯々]+)\([ぁ-んァ-ン]+\)/g, '$1');
}

// LessonNotesState.errors — see declaration above

async function lessonNotesExtractErrors(text, sessionIdx) {
  const apiKey = _fy_getApiKey();
  if (!apiKey) return;
  
  try {
    const data = await _fy_claudeAPI({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: `Extract error corrections from these Japanese lesson notes.

Look for:
- Crossed out text with corrections
- Text marked with ✗, ×, X or similar
- Corrections shown as "wrong → right" or "wrong ⇒ right"
- Teacher notes explaining mistakes
- Any indication of incorrect usage with the correct form

For each error found, provide:
- wrong: The incorrect text/usage
- correct: The correct text/usage  
- note: Teacher's explanation or note about the error (if any, otherwise brief explanation of why it's wrong)

Return ONLY a JSON array:
[{"wrong":"食べるました","correct":"食べました","note":"る is not needed with ました"},{"wrong":"私は本が読む","correct":"私は本を読む","note":"Use を for direct objects, not が"}]

If no errors/corrections found, return empty array: []

Notes:
${text}` }]
    ,
      track: 'lesson'
    });
    
    const raw = (data.content?.[0]?.text || '').trim();
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const errors = JSON.parse(cleaned);
    
    // Save errors to session
    const sessions = lessonNotesGetSessions();
    if (sessions[sessionIdx]) {
      sessions[sessionIdx].errors = errors;
      lessonNotesSaveSessions(sessions);
      LessonNotesState.errors = errors;
      lessonNotesRender();
    }
  } catch (e) {
    console.error('Error extraction error:', e);
  }
}

function lessonNotesHandleDrop(event) {
  event.preventDefault();
  const dropZone = document.getElementById('lessonNotesDropZone');
  if (dropZone) {
    dropZone.style.borderColor = 'var(--field-border)';
    dropZone.style.background = 'none';
  }
  
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    lessonNotesHandleFile(file);
  }
}

async function lessonNotesHandleFile(file) {
  if (!file) return;
  
  const titleInput = document.getElementById('lessonNotesTitle');
  const textInput = document.getElementById('lessonNotesInput');
  
  // Use filename (without extension) as default title if empty
  if (titleInput && !titleInput.value.trim()) {
    const nameWithoutExt = file.name.replace(/\.[^.]+$/, '');
    titleInput.value = nameWithoutExt;
  }
  
  // Clear previous images
  LessonNotesState.docImages = [];
  
  if (file.name.endsWith('.txt')) {
    // Plain text file
    const text = await file.text();
    if (textInput) textInput.value = text;
  } else if (file.name.endsWith('.docx')) {
    // Word document - parse with JSZip
    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      const docXml = await zip.file('word/document.xml')?.async('string');
      const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
      
      if (!docXml) {
        alert('Could not read document.xml from .docx file');
        return;
      }
      
      // Build image map from relationships
      const imageMap = {};
      if (relsXml) {
        const relsParser = new DOMParser();
        const relsDoc = relsParser.parseFromString(relsXml, 'application/xml');
        const rels = relsDoc.getElementsByTagName('Relationship');
        for (const rel of rels) {
          const id = rel.getAttribute('Id');
          const target = rel.getAttribute('Target');
          if (target && /media\/(image\d+)\.(png|jpg|jpeg|gif|bmp)/i.test(target)) {
            imageMap[id] = target.replace(/^.*\//, 'word/media/');
          }
        }
      }
      
      // Load all images into a lookup by filename
      const imageData = {};
      const mediaFolder = zip.folder('word/media');
      if (mediaFolder) {
        const imagePromises = [];
        mediaFolder.forEach((relativePath, zipEntry) => {
          if (/\.(png|jpg|jpeg|gif|bmp)$/i.test(relativePath)) {
            imagePromises.push(
              zipEntry.async('base64').then(base64 => {
                const ext = relativePath.split('.').pop().toLowerCase();
                const mimeType = ext === 'jpg' ? 'jpeg' : ext;
                imageData['word/media/' + relativePath] = `data:image/${mimeType};base64,${base64}`;
              })
            );
          }
        });
        await Promise.all(imagePromises);
      }
      
      // Parse XML and extract text with image placeholders
      const result = lessonNotesParseDocxXmlWithImages(docXml, imageMap, imageData);
      LessonNotesState.rawText = result.text;
      LessonNotesState.docImages = result.images; // array of {position, src}
      LessonNotesState.docContent = result.content; // interleaved array [{type:'text'|'image', value}]
      
      if (textInput) textInput.value = result.text;
      
    } catch (e) {
      console.error('Error parsing .docx:', e);
      alert('Error parsing .docx file: ' + e.message);
    }
  } else {
    alert('Please drop a .docx or .txt file');
  }
}

// LessonNotesState.docContent/fullDocSearch — see declaration above

function lessonNotesFullDocDoSearch() {
  const input = document.getElementById('lessonNotesFullDocSearchInput');
  LessonNotesState.fullDocSearch = input?.value?.trim() || '';
  lessonNotesRender();
}

function lessonNotesFullDocClearSearch() {
  LessonNotesState.fullDocSearch = '';
  lessonNotesRender();
}

function lessonNotesParseDocxXmlWithImages(xml, imageMap, imageData) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  
  const content = []; // [{type:'text'|'image', value}]
  const images = [];
  let currentText = '';
  
  const paragraphs = doc.getElementsByTagName('w:p');
  
  for (const p of paragraphs) {
    let line = '';
    const runs = p.getElementsByTagName('w:r');
    
    for (const r of runs) {
      // Check for images (drawings)
      const drawings = r.getElementsByTagName('w:drawing');
      for (const drawing of drawings) {
        // Look for blip element with embed attribute
        const blips = drawing.getElementsByTagName('a:blip');
        for (const blip of blips) {
          const embedId = blip.getAttribute('r:embed');
          if (embedId && imageMap[embedId]) {
            const imgSrc = imageData[imageMap[embedId]];
            if (imgSrc) {
              // Save current text block if any
              if (currentText.trim()) {
                content.push({type: 'text', value: currentText.trim()});
                currentText = '';
              }
              content.push({type: 'image', value: imgSrc});
              images.push({position: content.length - 1, src: imgSrc});
            }
          }
        }
      }
      
      // Get text
      const texts = r.getElementsByTagName('w:t');
      for (const t of texts) {
        line += t.textContent || '';
      }
    }
    
    if (line) {
      currentText += line + '\n';
    }
  }
  
  // Add remaining text
  if (currentText.trim()) {
    content.push({type: 'text', value: currentText.trim()});
  }
  
  // Also return plain text version
  const plainText = content
    .filter(c => c.type === 'text')
    .map(c => c.value)
    .join('\n\n');
  
  return { text: plainText, images, content };
}

// Export all lessonNotes functions to window for onclick handlers

// ── Docx parser ───────────────────────────────────────────────────────────
async function yoshiParseDocx() {
  const file = document.getElementById('yoshiDocxFile')?.files[0];
  if (!file) { alert('Select a .docx file first.'); return; }
  const status = document.getElementById('yoshiImportStatus');
  if (status) status.textContent = 'Parsing…';

  // Use the file's last-modified date as the session date
  const fileDate = new Date(file.lastModified).toLocaleDateString('de-DE');

  // Auto-create a session if none is open
  if (yoshiCurrentIdx === null) {
    const sessions = yoshiGetSessions();
    sessions.push({ date: fileDate, title: '', complete: '', cloze: '', vocab: [], blanks: [] });
    yoshiSaveSessions(sessions);
    yoshiCurrentIdx = sessions.length - 1;
    yoshiRender();
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const xmlStr = await zip.file('word/document.xml').async('string');

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const paras = xmlDoc.getElementsByTagNameNS(ns, 'p');

    // Parse each paragraph into { text, blanks }
    const parsed = [];
    let totalBlanks = 0;

    Array.from(paras).forEach(para => {
      // Only direct w:r children of paragraph (not nested inside ruby etc)
      const runs = Array.from(para.childNodes).filter(n =>
        n.nodeType === 1 && n.localName === 'r'
      );
      let lineText = '';
      let paraBlankCount = 0;

      Array.from(runs).forEach(run => {
        // Only direct w:t children, not nested (avoids picking up ruby sub-elements)
        const tEls = Array.from(run.childNodes).filter(n => 
          n.nodeType === 1 && n.localName === 't'
        );
        if (tEls.length === 0) {
          // Empty run = blank slot
          lineText += '＿＿';
          paraBlankCount++;
          totalBlanks++;
        } else {
          const text = tEls.map(t => t.textContent).join('');
          if (text === ' ' || text === '\u3000') {
            // skip spacing/indent tokens
          } else if (text) {
            lineText += text;
          }
        }
      });

      const cleaned = lineText.trim();
      if (cleaned) parsed.push({ text: cleaned, blanks: paraBlankCount });
    });

    if (!parsed.length) throw new Error('No text found in document');

    // First paragraph = title (no blanks, short)
    const title = parsed[0].text;
    const bodyParas = parsed.slice(1);
    const clozeText = bodyParas.map(p => '　' + p.text).join('\n');

    // Save everything to session first, then render
    if (yoshiCurrentIdx !== null) {
      const sessions = yoshiGetSessions();
      sessions[yoshiCurrentIdx].date = fileDate;
      sessions[yoshiCurrentIdx].title = title;
      sessions[yoshiCurrentIdx].cloze = clozeText;
      delete sessions[yoshiCurrentIdx].furigana; // text changed — stale furigana discarded
      yoshiSaveSessions(sessions);
    }

    // Show session with Cloze tab active
    const s2 = yoshiGetSessions()[yoshiCurrentIdx];
    yoshiShowSession(s2);
    // Switch to Cloze tab
    const clozeBtn = Array.from(document.querySelectorAll('.yoshi-subtab')).find(b => b.textContent.includes('Cloze'));
    if (clozeBtn) clozeBtn.click();

    // Update sidebar list title
    const listItems = document.querySelectorAll('.yoshi-session-item');
    const allSess = yoshiGetSessions();
    listItems.forEach((el, ri) => {
      const i = allSess.length - 1 - ri;
      if (i === yoshiCurrentIdx) {
        const span = el.querySelector('.yoshi-session-title');
        if (span) span.textContent = title;
        const dateSpan = el.querySelector('.yoshi-session-date');
        if (dateSpan) dateSpan.textContent = fileDate;
        el.classList.add('active');
      }
    });

    const status2 = document.getElementById('yoshiImportStatus');
    if (status2) status2.textContent = `✓ ${totalBlanks} blanks found — cloze ready. Add vocab or paste the complete text if you have it, then Save.`;
  } catch(e) {
    alert('Parse error: ' + e.message);
    console.error('yoshiParseDocx:', e);
  }
}

// ── Cloze rendering ───────────────────────────────────────────────────────
function yoshiRenderCloze(s) {
  const body = document.getElementById('yoshiClozeBody');
  if (!body) return;
  if (!s.cloze && !s.blanks.length) {
    body.innerHTML = '<div style="color:var(--ink-light);font-family:var(--ui);font-size:0.85rem">No cloze text for this session.</div>';
    return;
  }

  // If explicit blanks (＿), render those directly
  if (s.cloze && (s.cloze.includes('＿') || s.cloze.includes('__'))) {
    let idx = 0;
    const html = s.cloze.split('\n').filter(l=>l.trim()).map(line => {
      const parts = line.split(/(＿+|_{2,})/);
      const rendered = parts.map(part => {
        if (/^[＿_]+$/.test(part)) {
          const answer = (s.blanks[idx] || {}).answer || '';
          const bi = idx++;
          return `<span class="yoshi-blank" id="yblank${bi}"><input type="text" data-answer="${answer}" data-idx="${bi}" style="width:${Math.max(50,answer.length*18)}px" placeholder="　"></span>`;
        }
        return part;
      }).join('');
      return `<p>${rendered}</p>`;
    }).join('');
    body.innerHTML = html;
    setTimeout(() => {
      body.querySelectorAll('input[type=text]').forEach(inp => kanaOn(inp));
      body.querySelectorAll('.yoshi-blank').forEach(span => {
        span.addEventListener('click', () => span.querySelector('input')?.focus());
      });
    }, 0);
    return;
  }

  // Diff-based: show cloze text with blank slots where words were removed
  if (s.blanks.length) {
    let blankIdx = 0;
    // Show cloze paragraphs with inline blank inputs inserted at gap positions
    const html = (s.cloze || s.complete).split('\n').filter(l=>l.trim()).map(line => {
      // Insert blanks where answers were found missing (use blanks array sequentially)
      let out = line;
      // Replace sequences of spaces (the gap left by missing kanji) with inputs
      out = out.replace(/\s{2,}|(?<=[\u3000-\u9fff])\s+(?=[\u3000-\u9fff])/g, () => {
        if (blankIdx >= s.blanks.length) return ' ';
        const answer = s.blanks[blankIdx].answer;
        const bi = blankIdx++;
        return `<span class="yoshi-blank" id="yblank${bi}"><input type="text" data-answer="${answer}" data-idx="${bi}" style="width:${Math.max(50,answer.length*18)}px" placeholder="　"></span>`;
      });
      return `<p>${out}</p>`;
    }).join('');
    body.innerHTML = html || '<p>' + (s.cloze || '') + '</p>';
    setTimeout(() => {
      body.querySelectorAll('input[type=text]').forEach(inp => kanaOn(inp));
      body.querySelectorAll('.yoshi-blank').forEach(span => {
        span.addEventListener('click', () => span.querySelector('input')?.focus());
      });
    }, 0);
  } else {
    // No blanks computed — just show cloze text as-is
    body.innerHTML = s.cloze.split('\n').filter(l=>l.trim()).map(l=>`<p>${l}</p>`).join('');
  }
}

function yoshiCheckCloze() {
  const inputs = document.querySelectorAll('#yoshiClozeBody .yoshi-blank input');
  let correct = 0;
  inputs.forEach(inp => {
    const answer = inp.dataset.answer;
    const blank = document.getElementById('yblank' + inp.dataset.idx);
    if (!answer) return;
    if (inp.value.trim() === answer.trim()) {
      blank.className = 'yoshi-blank correct'; correct++;
    } else {
      blank.className = 'yoshi-blank wrong';
    }
  });
  const total = [...inputs].filter(i => i.dataset.answer).length;
  document.getElementById('yoshiClozeScore').textContent = total ? `${correct} / ${total} correct` : '';
}

function yoshiRevealAll() {
  document.querySelectorAll('#yoshiClozeBody .yoshi-blank input').forEach(inp => {
    inp.value = inp.dataset.answer || '';
    const blank = document.getElementById('yblank' + inp.dataset.idx);
    if (blank) blank.className = 'yoshi-blank revealed';
  });
}

function yoshiResetCloze() {
  document.querySelectorAll('#yoshiClozeBody .yoshi-blank input').forEach(inp => {
    inp.value = '';
    const blank = document.getElementById('yblank' + inp.dataset.idx);
    if (blank) blank.className = 'yoshi-blank';
  });
  document.getElementById('yoshiClozeScore').textContent = '';
}


function yoshiConfirmCloze() {
  if (yoshiCurrentIdx === null) return;
  const body = document.getElementById('yoshiClozeBody');
  if (!body) return;

  // Build confirmed text: only promote paragraphs where ALL blanks are filled
  const paras = body.querySelectorAll('p');
  const lines = [];
  let skipped = 0;
  paras.forEach(p => {
    const inputs = p.querySelectorAll('.yoshi-blank input');
    // Check all blanks in this paragraph are filled
    const allFilled = Array.from(inputs).every(inp => inp.value.trim().length > 0);
    if (inputs.length > 0 && !allFilled) { skipped++; return; }
    // Clone and replace blanks with their values
    const clone = p.cloneNode(true);
    clone.querySelectorAll('.yoshi-blank input').forEach(inp => {
      const val = inp.value.trim() || inp.dataset.answer || '';
      inp.closest('.yoshi-blank').replaceWith(document.createTextNode(val));
    });
    const line = clone.textContent.trim();
    if (line) lines.push(line);
  });

  if (!lines.length) return;

  // Merge with any previously confirmed text
  const sessions = yoshiGetSessions();
  const s = sessions[yoshiCurrentIdx];
  const existing = (s.complete || '').trim();
  // Add only new lines not already confirmed
  const existingLines = existing ? existing.split('\n').map(l=>l.trim()) : [];
  const newLines = lines.filter(l => !existingLines.includes(l));
  const merged = [...existingLines, ...newLines].filter(Boolean).join('\n');
  s.complete = merged;
  delete s.furigana; // text changed — stale furigana discarded
  yoshiSaveSessions(sessions);

  // Switch to Read tab
  YoshiReadState.paraFurigana = {};
  yoshiRenderRead();
  const readBtn = Array.from(document.querySelectorAll('.yoshi-subtab')).find(b => b.textContent.includes('Read'));
  if (readBtn) {
    document.querySelectorAll('.yoshi-subtab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.yoshi-subpanel').forEach(p => p.classList.remove('active'));
    readBtn.classList.add('active');
    document.getElementById('yoshi-sub-read').classList.add('active');
  }

  const score = document.getElementById('yoshiClozeScore');
  if (score) score.textContent = skipped > 0
    ? `✓ ${lines.length} confirmed → Read (${skipped} paragraph${skipped>1?'s':''} with unfilled blanks skipped)`
    : `✓ ${lines.length} paragraph${lines.length>1?'s':''} confirmed → Read`;
}

// ── Vocab ─────────────────────────────────────────────────────────────────
function yoshiAddVocab(i) {
  const s = yoshiGetSessions()[yoshiCurrentIdx];
  if (!s) return;
  const v = s.vocab[i];
  if (!v) return;
  if (state.vocab.some(w => w.jp === v.jp)) {
    const btn = document.getElementById('yoshiVocabAdd' + i);
    if (btn) { btn.textContent = 'Already in deck'; btn.className = 'yoshi-vocab-add added'; }
    return;
  }
  state.vocab.push({ jp: v.jp, kana: v.kana || '', reading: v.kana || '', en: v.en, pos: '' });
  saveState();
  const btn = document.getElementById('yoshiVocabAdd' + i);
  if (btn) { btn.textContent = '✓ Added'; btn.className = 'yoshi-vocab-add added'; }
}


// ── AppEvents listener: RECORDING_READY ─────────────────────────────────────
// When a recording finishes, show a prominent transcribe button in the lesson
// notes panel so the user knows to transcribe before leaving the main app.
try {
  AppEvents.on('RECORDING_READY', function(data) {
    const bar = document.getElementById('yoshiTranscribeBar');
    if (!bar) return;
    bar.style.display = 'flex';
    bar.innerHTML =
      '<span style="font-family:var(--ui);font-size:0.78rem;color:var(--gold);flex:1">'
      + '⏺ Recording saved — ready to transcribe</span>'
      + '<button class="btn-primary" id="yoshiTranscribeNowBtn" onclick="yoshiTranscribeNow()" '
      + 'style="font-size:0.75rem;padding:4px 14px">⚙ Transcribe now</button>';
    window._pendingTranscribeSessionId = data.sessionId;
  });
} catch(e) {}

async function yoshiTranscribeNow() {
  const btn = document.getElementById('yoshiTranscribeNowBtn');
  if (btn) { btn.textContent = '⏳ Transcribing…'; btn.disabled = true; }
  try {
    const sessionId = window._pendingTranscribeSessionId;
    if (!sessionId) throw new Error('No pending session');
    await Orchestrator.transcribeSession(sessionId);
    const bar = document.getElementById('yoshiTranscribeBar');
    if (bar) bar.innerHTML = '<span style="font-family:var(--ui);font-size:0.78rem;color:var(--teal)">✓ Transcription complete</span>';
    await Orchestrator.loadSessions();
    lessonNotesRenderPanel();
  } catch(e) {
    if (btn) { btn.textContent = '✗ Failed — retry'; btn.disabled = false; }
  }
}

// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, {
    // Lesson Notes panel
    lessonNotesRenderPanel,
    lessonNotesPanelHandleDrop,
    lessonNotesPanelHandleFile,
    lessonNotesPanelHandlePaste,
    lessonNotesNewFromPanel,
    lessonNotesDeleteFromPanel,
    lnRecordingTabButton,
    lnShowLinkPicker,
    lnLinkRecording,
    lnTranscribeLinked,
    lnRenderLinkedRecording,
    lnLoadTranscript,
    lnSeekToTime,
    lessonNotesSetView,
    lessonNotesToggleGrammarHide,
    lessonNotesToggleShowHidden,
    lessonNotesEditGrammar,
    lessonNotesSaveGrammarEdit,
    lessonNotesDeleteGrammar,
    lessonNotesOpenGrammarDetail,
    lessonNotesCloseGrammarDetail,
    lessonNotesGrammarGenerateDrill,
    lessonNotesGrammarCheckDrill,
    lessonNotesGrammarNextDrill,
    lessonNotesGrammarPrevDrill,
    lessonNotesGrammarAsk,
    lessonNotesOpen,
    lessonNotesNew,
    lessonNotesDelete,
    lessonNotesLoadSession,
    lessonNotesExtract,
    lessonNotesExtractGrammar,
    lessonNotesExtractKeyPhrases,
    lessonNotesOpenStory,
    lessonNotesSetMode,
    lessonNotesDrillReveal,
    lessonNotesDrillNext,
    lessonNotesDrillPrev,
    lessonNotesDrillAll,
    lessonNotesDrillBackground,
    renderRecordingsBrowser,
    recBrowserTranscribe,
    recBrowserDelete,
  });
} catch(e) { console.error('[features-yoshi] App registry failed:', e); }

// ═══════════════════════════════════════════════════════
// TIMELINE ALIGNMENT — Claude assigns each Yoshi message
// to the most likely audio segment it responds to.
// One call per session, result stored on session object.
// ═══════════════════════════════════════════════════════

async function lnAlignTimeline() {
  const btn = document.getElementById('lnAlignBtn');
  if (btn) { btn.textContent = '⏳ Aligning…'; btn.disabled = true; }

  try {
    const recId = LessonNotesState._transcriptRecId;
    if (!recId) throw new Error('No recording linked');

    // Load transcript from DB
    const rows = await window.db.query(
      'SELECT transcript_json FROM lesson_sessions WHERE id=?', [recId]
    );
    if (!rows || !rows[0] || !rows[0].transcript_json) throw new Error('No transcript');
    const turns = JSON.parse(rows[0].transcript_json);

    // Get recording start time
    const rec = (window._lessonRecordingSessions||[]).find(function(r){return r.id===recId;});
    const startMatch = rec && rec.audio_path ? rec.audio_path.match(/_(\d{13})\.webm/) : null;
    const startMs = startMatch ? parseInt(startMatch[1]) : null;

    // Get Yoshi's messages
    const _parseWA = App.yoshiParseWhatsapp || window.yoshiParseWhatsapp;
    const rawText = (function(){
      const sessions = lessonNotesGetSessions();
      const s = LessonNotesState.currentIdx !== null ? sessions[LessonNotesState.currentIdx] : null;
      return s ? s.rawText || '' : '';
    })();
    const allMsgs = _parseWA ? _parseWA(rawText) : [];
    const yoshiMsgs = allMsgs.filter(function(m){ return !(/paulandres|paul/i.test(m.sender)); });

    if (!yoshiMsgs.length) throw new Error('No Yoshi messages found');

    // Build compact transcript for Claude — just time + text, capped at 8000 chars
    function secToWall(ts) {
      if (!startMs) return ts + 's';
      return new Date(startMs + ts*1000).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    }
    const transcriptLines = turns.map(function(t){
      const ts = Math.round(t.start != null ? t.start : (t.timestamp||0));
      return secToWall(ts) + ' ' + (t.text||'');
    }).join('\n').slice(0, 8000);

    const yoshiLines = yoshiMsgs.map(function(m){
      return m.time + ' ' + m.text;
    }).join('\n');

    const prompt =
      'You are aligning Yoshi\'s WhatsApp messages to a Japanese lesson audio transcript.\n\n' +
      'AUDIO TRANSCRIPT (time + student speech):\n' + transcriptLines + '\n\n' +
      'YOSHI\'S MESSAGES (time + her comment/correction):\n' + yoshiLines + '\n\n' +
      'For each of Yoshi\'s messages, find the audio transcript entry the message is most likely ' +
      'responding to. Yoshi sends messages shortly AFTER the relevant moment — look 10-60 seconds ' +
      'before her message time for the matching audio segment.\n\n' +
      'Return ONLY a JSON array:\n' +
      '[{"waTime":"13:32:16","audioTime":"13:31:58","audioOffset":108}]\n\n' +
      'waTime: Yoshi\'s message time exactly as given\n' +
      'audioTime: the matched audio segment time\n' +
      'audioOffset: matched segment start in seconds from recording start\n' +
      'If no good match exists for a message, omit it from the array.';

    const data = await _fy_claudeAPI({
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
      track: 'lesson'
    });

    const responseText = _fy_claudeText(data) || '[]';
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON in response');
    const alignments = JSON.parse(jsonMatch[0]);

    // Store as {waTime: audioOffset} map on session
    const waAlignments = {};
    alignments.forEach(function(a){ waAlignments[a.waTime] = a.audioOffset; });

    const sessions = lessonNotesGetSessions();
    const saveIdx = LessonNotesState.currentIdx !== null ? LessonNotesState.currentIdx : (sessions.length === 1 ? 0 : null);
    const sess = saveIdx !== null ? sessions[saveIdx] : null;
    if (sess) {
      sess.waAlignments = waAlignments;
      if (LessonNotesState.currentIdx === null) LessonNotesState.currentIdx = saveIdx;
      lessonNotesSaveSessions(sessions);
    }

    if (btn) { btn.textContent = '✓ Aligned'; btn.disabled = false; }

    // Reload in timeline mode with new alignments
    LessonNotesState.transcriptMode = 'timeline';
    const ta = document.getElementById('lnTranscriptArea');
    if (ta) ta.innerHTML = '';
    lnLoadTranscript(recId, 'timeline');

    // Update toggle bar to show Re-align
    lnShowTranscriptContainer(recId);

  } catch(e) {
    console.error('[lnAlignTimeline]', e);
    if (btn) { btn.textContent = '⚡ Align'; btn.disabled = false; }
  }
}

// ── Two-column timeline renderer ───────────────────────
// Called from lnLoadTranscript when mode === 'timeline'.
// Uses waAlignments from session if available, falls back
// to wall-clock positioning.

async function lnLoadTwoColumnTimeline(recId, el, turns, startMs) {
  const esc = App.escHtml || window.escHtml || function(s){return s;};

  // Get Yoshi's messages and alignment data
  const _parseWA = App.yoshiParseWhatsapp || window.yoshiParseWhatsapp;
  const sessions = lessonNotesGetSessions();
  const sess = LessonNotesState.currentIdx !== null ? sessions[LessonNotesState.currentIdx] : null;
  const rawText = sess ? sess.rawText || '' : '';
  const waAlignments = sess ? sess.waAlignments || {} : {};
  const allMsgs = _parseWA ? _parseWA(rawText) : [];
  const yoshiMsgs = allMsgs.filter(function(m){ return !(/paulandres|paul/i.test(m.sender)); });

  function waTimeToSeconds(timeStr) {
    if (!startMs) return null;
    const startDate = new Date(startMs);
    const parts = timeStr.split(':');
    const h = parseInt(parts[0]), m = parseInt(parts[1]), s = parseInt(parts[2]||0);
    const wDate = new Date(startDate);
    wDate.setHours(h, m, s, 0);
    return (wDate.getTime() - startMs) / 1000;
  }

  function secToTimeStr(ts) {
    if (startMs) {
      return new Date(startMs + ts*1000).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    }
    const m = Math.floor(ts/60), s = ts%60;
    return m + ':' + String(s).padStart(2,'0');
  }

  // Build audio map: offset → turn
  const audioByOffset = {};
  turns.forEach(function(t){
    const ts = Math.round(t.start != null ? t.start : (t.timestamp||0));
    audioByOffset[ts] = t;
  });

  // Build Yoshi message map: audioOffset → [msgs]
  // If aligned, use alignment. Otherwise use wall-clock.
  const yoshiByOffset = {};
  yoshiMsgs.forEach(function(msg) {
    let offset;
    if (waAlignments[msg.time] !== undefined) {
      offset = waAlignments[msg.time];
    } else {
      const wc = waTimeToSeconds(msg.time);
      offset = wc !== null ? Math.round(wc) : null;
    }
    if (offset === null) return;
    // Find nearest audio segment
    const nearest = turns.reduce(function(best, t){
      const ts = Math.round(t.start != null ? t.start : (t.timestamp||0));
      return Math.abs(ts - offset) < Math.abs(best - offset) ? ts : best;
    }, Infinity);
    if (!yoshiByOffset[nearest]) yoshiByOffset[nearest] = [];
    yoshiByOffset[nearest].push(msg);
  });

  // Track assigned messages and find unassigned ones
  const assignedMsgTimes = new Set();
  Object.values(yoshiByOffset).forEach(function(msgs) {
    msgs.forEach(function(m) { assignedMsgTimes.add(m.time); });
  });
  const unassigned = yoshiMsgs.filter(function(m) { return !assignedMsgTimes.has(m.time); });

  // Re-fetch el fresh
  const elFresh = document.getElementById('lnTranscriptArea') || el;
  if (!elFresh) return;
  elFresh.innerHTML = '';

  if (!turns.length) {
    elFresh.innerHTML = '<span style="color:var(--ink-light)">Empty transcript.</span>';
    return;
  }

  const unassignedSorted = unassigned.slice().sort(function(a,b){ return (waTimeToSeconds(a.time)||0)-(waTimeToSeconds(b.time)||0); });
  let uIdx = 0;

  function renderUnassignedMsg(msg) {
    const uRow = document.createElement('div');
    uRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid rgba(255,255,255,0.02)';
    const uLeft = document.createElement('div');
    uLeft.style.cssText = 'border-right:1px solid rgba(255,255,255,0.06)';
    const uRight = document.createElement('div');
    uRight.style.cssText = 'display:flex;gap:6px;align-items:flex-start;padding:4px 4px 4px 10px;opacity:0.45';
    const safeText = msg.text.replace(/'/g, "\\'");
    uRight.innerHTML =
      '<span style="color:var(--ink-light);flex-shrink:0;font-size:0.68rem;min-width:44px;padding-top:2px">' + esc(msg.time) + '</span>' +
      '<span style="color:var(--ink-light);line-height:1.6;font-size:0.92rem;flex:1;font-style:italic">' + esc(msg.text) + '</span>' +
      '<button onclick="event.stopPropagation();lnTtsAndPause(\'' + safeText + '\')" style="background:none;border:none;cursor:pointer;font-size:0.85rem;flex-shrink:0;padding:0 2px">🔊</button>';
    uRow.appendChild(uLeft);
    uRow.appendChild(uRight);
    elFresh.appendChild(uRow);
  }

  turns.forEach(function(t) {
    const ts = Math.round(t.start != null ? t.start : (t.timestamp||0));
    while (uIdx < unassignedSorted.length) {
      const uSecs = waTimeToSeconds(unassignedSorted[uIdx].time);
      if (uSecs !== null && uSecs < ts) { renderUnassignedMsg(unassignedSorted[uIdx++]); } else break;
    }
    const timeStr = secToTimeStr(ts);
    const offsetStr = Math.floor(ts/60) + ':' + String(ts%60).padStart(2,'0');
    const yoshiForRow = yoshiByOffset[ts] || [];
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid rgba(255,255,255,0.04);min-height:28px';
    const left = document.createElement('div');
    left.style.cssText = 'display:flex;gap:8px;padding:5px 10px 5px 4px;cursor:pointer;align-items:flex-start;border-right:1px solid rgba(255,255,255,0.06)';
    left.onmouseover = function(){ left.style.background = 'rgba(48,213,200,0.05)'; };
    left.onmouseout  = function(){ left.style.background = ''; };
    left.onclick = (function(sec){ return function(){ lnSeekToTime(sec); }; })(ts);
    left.innerHTML =
      '<span title="' + offsetStr + '" style="color:var(--teal);flex-shrink:0;font-size:0.68rem;font-variant-numeric:tabular-nums;min-width:44px;padding-top:2px;opacity:0.7">' + timeStr + '</span>' +
      '<span style="color:var(--ink);line-height:1.6;font-size:0.92rem">' + esc(t.text||'') + '</span>';
    const right = document.createElement('div');
    right.style.cssText = 'display:flex;flex-direction:column;padding:5px 4px 5px 10px';
    if (yoshiForRow.length) {
      yoshiForRow.forEach(function(msg){
        const msgEl = document.createElement('div');
        msgEl.style.cssText = 'display:flex;gap:6px;align-items:flex-start;cursor:pointer;padding:1px 0';
        msgEl.onclick = (function(sec){ return function(){ lnSeekToTime(sec); }; })(ts);
        msgEl.onmouseover = function(){ right.style.background = 'rgba(255,214,10,0.05)'; };
        msgEl.onmouseout  = function(){ right.style.background = ''; };
        const safeText = msg.text.replace(/'/g, "\\'");
        msgEl.innerHTML =
          '<span style="color:var(--gold);flex-shrink:0;font-size:0.68rem;min-width:44px;padding-top:2px;font-variant-numeric:tabular-nums;opacity:0.7">' + esc(msg.time) + '</span>' +
          '<span style="color:var(--ink);line-height:1.6;font-size:0.92rem;flex:1">' + esc(msg.text) + '</span>' +
          '<button onclick="event.stopPropagation();lnTtsAndPause(\'' + safeText + '\')" style="background:none;border:none;cursor:pointer;color:var(--gold);font-size:0.85rem;flex-shrink:0;padding:0 2px;opacity:0.6">🔊</button>';
        right.appendChild(msgEl);
      });
      row.style.background = 'rgba(255,214,10,0.03)';
    }
    row.appendChild(left);
    row.appendChild(right);
    elFresh.appendChild(row);
  });
  while (uIdx < unassignedSorted.length) { renderUnassignedMsg(unassignedSorted[uIdx++]); }
}

function lnTtsAndPause(text) {
  const student = document.getElementById('lnAudioStudent');
  const teacher = document.getElementById('lnAudioTeacher');
  if (student && !student.paused) student.pause();
  if (teacher && !teacher.paused) teacher.pause();
  (App.jpSpeak || window.jpSpeak)?.(text);
}



// ═══════════════════════════════════════════════════════
// RECORDINGS BROWSER
// Simple list of all recordings — play, transcribe, delete.
// No lesson linking required. Used for auditioning and cleanup.
// ═══════════════════════════════════════════════════════

async function renderRecordingsBrowser() {
  const el = document.getElementById('recordingsBrowserContent');
  if (!el) return;

  // Refresh session list from DB
  await (App.Orchestrator || window.Orchestrator).loadSessions();
  const recs = (window._lessonRecordingSessions || []).slice(); // newest first

  if (!recs.length) {
    el.innerHTML = '<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink-light);padding:20px">No recordings yet.</div>';
    return;
  }

  const esc = App.escHtml || window.escHtml || function(s){return s;};

  let html = '<div style="display:flex;flex-direction:column;gap:0">';

  for (const rec of recs) {
    // Local time from filename timestamp
    const tsMatch = rec.audio_path ? rec.audio_path.match(/_(\d{13})\.webm/) : null;
    const dt = tsMatch
      ? new Date(parseInt(tsMatch[1])).toLocaleString('en-GB', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})
      : rec.created_at ? new Date(rec.created_at).toLocaleString('en-GB', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : rec.date || '?';

    const dur = rec.audio_duration_s > 0
      ? Math.floor(rec.audio_duration_s/60) + 'm ' + (rec.audio_duration_s%60) + 's'
      : '?';

    const transcribed = rec.processed_at ? '✓ Transcribed' : '○ Not transcribed';
    const transcribedColor = rec.processed_at ? 'var(--teal)' : 'var(--ink-light)';

    const apath = rec.audio_path || '';
    const tpath = apath.replace('.webm', '_teacher.webm');
    const safeId = 'rec_' + rec.id;

    html += `<div style="border-bottom:1px solid var(--border);padding:12px 4px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div style="flex:1">
          <div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink);font-weight:600">${esc(dt)}</div>
          <div style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light);margin-top:2px">
            ${dur} &nbsp;·&nbsp; <span style="color:${transcribedColor}">${transcribed}</span>
          </div>
        </div>
        <button class="btn-ghost" style="font-size:0.75rem" onclick="recBrowserTranscribe(${rec.id})"
          ${rec.processed_at ? 'title="Re-transcribe"' : 'title="Transcribe"'}>
          ${rec.processed_at ? '↺ Re-transcribe' : '⚙ Transcribe'}
        </button>
        <button class="btn-ghost" style="font-size:0.75rem;color:var(--red);border-color:var(--red)"
          onclick="recBrowserDelete(${rec.id}, '${esc(apath)}', '${esc(tpath)}')">🗑 Delete</button>
      </div>
      <div id="${safeId}_players">
        ${apath ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="font-family:var(--ui);font-size:0.68rem;color:var(--ink-light);width:52px">🙋 You</span>
          <audio src="file://${esc(apath)}" controls style="flex:1;height:24px;accent-color:var(--teal)"></audio>
        </div>` : ''}
        ${tpath ? `<div style="display:flex;align-items:center;gap:8px">
          <span style="font-family:var(--ui);font-size:0.68rem;color:var(--ink-light);width:52px">🧑‍🏫 Yoshi</span>
          <audio src="file://${esc(tpath)}" controls style="flex:1;height:24px;accent-color:var(--gold)"></audio>
        </div>` : ''}
      </div>
    </div>`;
  }

  html += '</div>';
  el.innerHTML = html;
}

async function recBrowserTranscribe(sessionId) {
  const btn = event.target;
  btn.textContent = '⏳…'; btn.disabled = true;
  try {
    await (App.Orchestrator || window.Orchestrator).transcribeSession(sessionId);
    btn.textContent = '✓ Done';
    setTimeout(() => renderRecordingsBrowser(), 1000);
  } catch(e) {
    btn.textContent = '✗ Failed'; btn.disabled = false;
    console.error('[recBrowser] transcribe failed:', e);
  }
}

async function recBrowserDelete(sessionId, audioPath, teacherPath) {
  if (!confirm('Delete this recording and audio files from disk?')) return;
  try {
    await (App.Orchestrator || window.Orchestrator).deleteSession(sessionId, audioPath, teacherPath);
    renderRecordingsBrowser();
  } catch(e) {
    alert('Delete failed: ' + e.message);
  }
}

