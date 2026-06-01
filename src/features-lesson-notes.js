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
  storyTab:            'read',
  lnFuriOn:            false,
  grammarDetail:       null,
  grammarDrillSentences: [],
  grammarDrillIdx:     0,
  grammarDrillAnswer:  '',
  grammarDrillRevealed:false,
  grammarDrillFeedback:'',
  grammarQA:           [],
  extracting:          false,
  extractionWarning:   null,
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

const _fy_getApiKey  = () => (App.getApiKey  || window.getApiKey)?.();
const _fy_claudeAPI  = (...a) => (App.claudeAPI || window.claudeAPI)?.(...a);
const _fy_claudeText = (d) => (App.claudeText || window.claudeText)?.(d);
window.LessonNotesState = LessonNotesState;

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
    // Backfill ids on sessions that were created without one
    let _needsSave = false;
    LessonNotesState.sessions.forEach(s => { if (!s.id) { s.id = Date.now() + Math.random(); _needsSave = true; } });
    if (_needsSave) window.kvAPI.set('lessonNoteSessions', JSON.stringify(LessonNotesState.sessions));
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

function lessonNotesRender() {
  const el3 = document.getElementById('lessonNotesPanelContent');
  if (el3) el3.innerHTML = lessonNotesGetFullPanelHTML();
  if (el3) lessonNotesUpdatePanelHeader();
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
      lessonNotesUpdatePanelHeader();
    });
    const elWait = document.getElementById('lessonNotesPanelContent');
    if (elWait) elWait.innerHTML = '<div style="padding:40px;text-align:center;font-family:var(--ui);color:var(--ink-light)">…</div>';
    return;
  }
  const el = document.getElementById('lessonNotesPanelContent');
  if (!el) return;
  el.innerHTML = lessonNotesGetFullPanelHTML();
  lessonNotesUpdatePanelHeader();
}

function lessonNotesGetFullPanelHTML() {
  const sessions = lessonNotesGetSessions();
  const currentSession = LessonNotesState.currentIdx !== null ? sessions[LessonNotesState.currentIdx] : null;
  
  let html = ``;
  
  // ── Top bar: status + session controls ───────────────────────────────────────
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">';
  html += '<span id="yoshiRecordStatus" style="font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);flex:1"></span>';
  html += '<span id="yoshiLevelDots" style="font-size:0.65rem;color:var(--red);letter-spacing:-1px;margin-right:4px"></span>';
  if (!currentSession) {
  html += '<button class="btn-action btn-xs" onclick="yoshiTestChannels && yoshiTestChannels()">🎙 Test</button>';
  html += '<button class="btn-action btn-xs" onclick="yoshiOpenOverlay && yoshiOpenOverlay()">🪟 Session</button>';
  html += '<button class="btn-action btn-xs" onclick="showPanel(\'recordings\')">📼 Recordings</button>';
  }
  html += '</div>';
  html += '<div id="yoshiTranscribeBar" style="display:none;align-items:center;gap:8px;margin-bottom:8px"></div>';

  // Extraction warning banner
  if (LessonNotesState.extractionWarning && LessonNotesState.extractionWarning.length) {
    html += `<div style="background:rgba(255,149,0,0.1);border:1px solid rgba(255,149,0,0.4);border-radius:6px;padding:8px 12px;margin-bottom:12px;display:flex;align-items:center;gap:10px">
      <span style="font-family:var(--ui);font-size:0.78rem;color:var(--gold)">⚠ Extraction incomplete: ${LessonNotesState.extractionWarning.join(', ')} came back empty. Check your API key or retry.</span>
      <button class="btn-action btn-xs" style="flex-shrink:0" onclick="LessonNotesState.extractionWarning=null;lessonNotesAutoExtractAll()">🔄 Retry</button>
    </div>`;
  }

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
  const newSession = { id: Date.now(), title, date: new Date().toISOString().slice(0,10), vocab: [], stories: [], keyPhrases: [], grammar: [], errors: [], docContent: [], rawText: '' };
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
  const newSession = { id: Date.now(), title, date: new Date().toISOString().slice(0,10), vocab: [], stories: [], keyPhrases: [], grammar: [], errors: [], docContent: [], rawText: '' };
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
  sessions.unshift({ id: Date.now(), title, date: new Date().toISOString().slice(0,10), vocab: [], stories: [], keyPhrases: [], grammar: [], errors: [], docContent: [], rawText: '' });
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
    return '<button class="yoshi-read-btn" onclick="lnShowLinkPicker()">🔗 Link recording</button>';
  }
  const recs = window._lessonRecordingSessions || [];
  const rec = recs.find(function(r) { return r.id === recId; });
  const hasTranscript = rec && rec.processed_at;
  let btns = '<button class="yoshi-read-btn ' + (LessonNotesState.viewMode==="recording"?"active":"") + '" onclick="lessonNotesSetView(\'recording\')">▶ Recording</button>';
  if (!hasTranscript) {
    btns += '<button class="yoshi-read-btn" onclick="lnTranscribeLinked()">⚙ Transcribe</button>';
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
    row.classList.add('row-hover');
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
      '<button class="btn-action" onclick="lnShowLinkPicker()">\u{1F517} Link a recording</button>' +
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
    html += '<button class="yoshi-read-btn' + (_tm==='audio'?' active':'') + '" onclick="lnSetTranscriptMode(\'audio\')" style="font-size:0.72rem;padding:3px 10px">\u{1F399} Audio</button>';
    html += '<button class="yoshi-read-btn' + (_tm==='timeline'?' active':'') + '" onclick="lnSetTranscriptMode(\'timeline\')" style="font-size:0.72rem;padding:3px 10px">\u{1F500} Timeline</button>';
    html += '<button id="lnAlignBtn" class="yoshi-read-btn" onclick="lnAlignTimeline()" style="font-size:0.72rem;padding:3px 10px">' + (_hasAlign ? '\u2713 Re-align' : '\u26A1 Align') + '</button>';
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
      row.classList.add('row-hover');
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
      row.classList.add('row-hover');
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
  if (LessonNotesState.viewMode === 'allwords') {
    const _vocab = LessonNotesState.vocab;
    const _half = Math.ceil(_vocab.length / 2);
    function _makeTable(items) {
      const _rows = items.map(function(v) {
        const _w = (v.word||'').replace(/'/g,"\\'");
        return '<tr style="border-bottom:1px solid var(--border)">'
          + '<td style="padding:6px 10px;color:var(--ink);font-family:var(--jp)">' + (v.word||'') + '</td>'
          + '<td style="padding:6px 10px;color:var(--ink-light);font-family:var(--jp)">' + (v.reading||'—') + '</td>'
          + '<td style="padding:6px 10px;color:var(--ink-light);font-size:0.82rem;font-family:var(--ui)">' + (v.meaning||v.en||'—') + '</td>'
          + '<td style="padding:6px 4px"><button class="btn-icon" onclick="jpSpeak(\'' + _w + '\')">🔊</button></td>'
          + '</tr>';
      }).join('');
      const _hdr = '<thead style="position:sticky;top:0;background:var(--paper-dark)"><tr style="border-bottom:1px solid var(--border)">'
        + '<th style="text-align:left;padding:8px 10px;font-family:var(--ui);font-size:0.7rem;letter-spacing:0.06em;color:var(--ink-light);font-weight:500">WORD</th>'
        + '<th style="text-align:left;padding:8px 10px;font-family:var(--ui);font-size:0.7rem;letter-spacing:0.06em;color:var(--ink-light);font-weight:500">READING</th>'
        + '<th style="text-align:left;padding:8px 10px;font-family:var(--ui);font-size:0.7rem;letter-spacing:0.06em;color:var(--ink-light);font-weight:500">MEANING</th>'
        + '<th style="width:40px"></th></tr></thead>';
      return '<table style="width:100%;border-collapse:collapse;font-size:0.88rem">' + _hdr + '<tbody>' + _rows + '</tbody></table>';
    }
    return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">'
      + '<div style="overflow-y:auto;border:1px solid var(--border);border-radius:6px">' + _makeTable(_vocab.slice(0, _half)) + '</div>'
      + '<div style="overflow-y:auto;border:1px solid var(--border);border-radius:6px">' + _makeTable(_vocab.slice(_half)) + '</div>'
      + '</div>';
  }
  if (LessonNotesState.viewMode === 'errors') {
    return lessonNotesRenderErrors();
  }
  
  // Recording tab — linked recording player + transcript
  if (LessonNotesState.viewMode === 'recording') {
    return lnRenderLinkedRecording(currentSession);
  }
  
  // If we have vocab, show drill view (card-centred, fixed footers)
  if (hasVocab || hasStories || LessonNotesState.errors.length > 0) {
    let revealLabel = 'Reveal';
    let revealActive = false;
    if (LessonNotesState.drillRevealed === 1) {
      revealLabel = LessonNotesState.drillMode === 'en2jp' ? 'Reading' : 'Meaning';
    } else if (LessonNotesState.drillRevealed === 2) {
      revealLabel = 'Hide';
      revealActive = true;
    }
    return `
    <!-- Drill card (fills available space, centred) -->
    <div class="vocab-counter">${LessonNotesState.vocab.length > 0 ? (LessonNotesState.drillIdx + 1) + ' / ' + LessonNotesState.vocab.length : ''}</div>
    <div class="ln-drill-card-area">
      <div class="ln-drill-card" id="lessonNotesDrillArea" onclick="lessonNotesDrillReveal()" style="cursor:pointer">
        ${lessonNotesRenderDrillCard()}
      </div>
    </div>


    <!-- Breakdown/Examples area (shown when requested) -->
    <div id="lessonNotesBreakdownArea" style="display:none;background:var(--paper-dark);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px">
    </div>

    <!-- Vocab table (hideable) -->
    <div style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-bottom:22vh;${LessonNotesState.tableHidden?'display:none':''}">
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

    <!-- Upper footer: card actions -->
    <!-- Card controls inline -->
    <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:12px">
      <button class="btn-nav" onclick="lessonNotesDrillPrev()">Prev</button>
      <button class="btn-rating btn-rating-red" onclick="lessonNotesDrillNext()">Again</button>
      <button class="btn-rating btn-rating-teal" onclick="lessonNotesDrillReveal()">Got it</button>
      <button class="btn-rating btn-rating-teal" onclick="lessonNotesHideCard()">Learned</button>
      <button class="btn-nav" onclick="lessonNotesDrillNext()">Next</button>
    </div>
    <!-- Upper footer: mode toggles -->
    <div class="footer-upper">
      <button class="btn-toggle btn-sm ${LessonNotesState.drillMode==='jp2reading'?'active':''}" onclick="lessonNotesSetMode('jp2reading')">JP → Reading</button>
      <button class="btn-toggle btn-sm ${LessonNotesState.drillMode==='jp2en'?'active':''}" onclick="lessonNotesSetMode('jp2en')">JP → Meaning</button>
      <button class="btn-toggle btn-sm ${LessonNotesState.drillMode==='en2jp'?'active':''}" onclick="lessonNotesSetMode('en2jp')">EN → JP</button>
      <button class="btn-toggle btn-sm ${LessonNotesState.drillMode==='listening'?'active':''}" onclick="lessonNotesSetMode('listening')">Listen</button>
      <button class="btn-toggle btn-sm ${LessonNotesState.shuffled?'active':''}" onclick="lessonNotesToggleShuffle()">Shuffle</button>
    </div>
    <!-- Lower footer: show/word list controls -->
    <div class="footer-lower">
      <div class="footer-lower-row">
        <button class="btn-toggle btn-sm ${LessonNotesState.showReading?'active':''}" onclick="lessonNotesToggleShowReading()">+Reading</button>
        <button class="btn-toggle btn-sm ${LessonNotesState.showMeaning?'active':''}" onclick="lessonNotesToggleShowMeaning()">+Meaning</button>
      </div>
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
        <button class="yoshi-read-btn" onclick="lessonNotesExtract()">✨ Extract & Save</button>
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

function lessonNotesUpdatePanelHeader() {
  const hdr = document.getElementById('yoshiPanelHeader');
  if (!hdr) return;
  const sessions = lessonNotesGetSessions();
  const _cur = LessonNotesState;
  const _vm = _cur.viewMode;
  const hasContent = _cur.vocab.length > 0 || _cur.stories.length > 0 || _cur.grammar.length > 0 || _cur.errors.length > 0;
  const currentSession = _cur.currentIdx !== null ? sessions[_cur.currentIdx] : null;

  hdr.innerHTML = `
    <div class="panel-section-title" style="flex:1;gap:8px;flex-wrap:wrap">
      <span class="panel-section-title-jp">ヨシ</span>
      ${hasContent ? `
        <select class="btn-nav btn-sm" onchange="lessonNotesSetView(this.value)">
          <option value="vocab" ${_vm==='vocab'||_vm===''?'selected':''}>📚 Vocab Drill (${_cur.vocab.length})</option>
          <option value="allwords" ${_vm==='allwords'?'selected':''}>📋 All Words (${_cur.vocab.length})</option>
          <option value="stories" ${_vm==='stories'||_vm==='reading'?'selected':''}>📖 Stories (${_cur.stories.length})</option>
          <option value="keyphrases" ${_vm==='keyphrases'?'selected':''}>🔑 Phrases (${_cur.keyPhrases.length})</option>
          <option value="grammar" ${_vm==='grammar'||_vm==='grammardetail'?'selected':''}>📝 Grammar (${_cur.grammar.length})</option>
          <option value="errors" ${_vm==='errors'?'selected':''}>❌ Errors (${_cur.errors.length})</option>
          ${currentSession ? `<option value="recording" ${_vm==='recording'?'selected':''}>▶ Recording</option>` : ''}
        </select>
      ` : ''}
    </div>
    <div style="display:flex;gap:6px;align-items:center">
      <select id="yoshiSessionSelect" onchange="lessonNotesLoadSession(parseInt(this.value));lessonNotesRenderPanel()"
        style="padding:4px 8px;background:var(--field);border:1px solid var(--field-border);color:var(--ink);font-family:var(--ui);font-size:0.75rem;border-radius:4px;max-width:180px">
        <option value="-1">— Select lesson —</option>
        ${sessions.map((s, i) => `<option value="${i}" ${i === _cur.currentIdx ? 'selected' : ''}>${s.title || 'Untitled ' + (i+1)}</option>`).join('')}
      </select>
      <button class="btn-nav btn-sm" onclick="lessonNotesNewFromPanel()">+</button>
      ${currentSession ? `<button class="btn-icon btn-icon-del" onclick="lessonNotesDeleteFromPanel()">🗑</button>` : ''}
    </div>
  `;
}

function lessonNotesSetView(mode) {
  LessonNotesState.viewMode = mode;
  LessonNotesState.currentStory = null;
  // Hide persistent transcript container when leaving recording view
  const tc = document.getElementById('lnTranscriptContainer');
  if (tc && mode !== 'recording') tc.style.display = 'none';
  lessonNotesRender();
  if (mode === 'keyphrases' && window._lnPhraseMode && window._lnPhraseMode !== 'browse') {
    setTimeout(function() {
      var DC = (typeof App !== 'undefined' && App.DrillCard) || window.DrillCard;
      var kp = LessonNotesState.keyPhrases || [];
      if (!DC || !kp.length) return;
      var m = window._lnPhraseMode;
      DC.run({
        containerId: 'ln-phrase-drill-container',
        allowResume: false,
        getQueue: function() { return kp.slice().sort(function() { return Math.random()-0.5; }); },
        getPrompt: function(item) {
          if (m === 'en-jp') return '<span style="font-family:var(--ui);font-size:1.3rem;color:var(--ink)">' + (item.meaning||'') + '</span>';
          return '<span style="font-family:var(--jp)">' + (item.phrase||'') + '</span>';
        },
        getAnswer: function(item) { return m === 'en-jp' ? (item.phrase||'') : (item.meaning||''); },
        onSpeak: function(item) {
          var speak = (typeof App !== 'undefined' && App.jpSpeak) || window.jpSpeak;
          if (speak && item.phrase) speak(item.phrase);
        },
        inputPlaceholder: m === 'en-jp' ? 'Type Japanese...' : 'Type English...',
        trackingLabel: 'ln-phrases'
      });
    }, 50);
  }
}

function lessonNotesRenderStories() {
  return `
    <!-- Story tiles -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
      ${LessonNotesState.stories.map((s, i) => `
        <div onclick="lessonNotesOpenStory(${i})" 
          style="background:var(--paper-dark);border:1px solid var(--border);border-radius:8px;padding:16px;cursor:pointer;transition:all 0.15s"
          class="row-hover-border">
          <div style="font-family:var(--jp);font-size:1.1rem;color:var(--ink);margin-bottom:8px;line-height:1.4">${s.title}</div>
          <button class="btn-action" style="margin-bottom:6px" class="btn-action btn-xs" onclick="event.stopPropagation();(App.qrLoadText||window.qrLoadText)?.(LessonNotesState.stories[${i}]?.text)">Read →</button>
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
        <button onclick="lessonNotesExtractKeyPhrases()" class="yoshi-read-btn">🔑 Extract Key Phrases</button>
      </div>
    ` : `
      <div style="display:flex;f      <div style="display:flex;gap:6px;margin-bottom:14px">
        <button class="btn-toggle btn-sm${!window._lnPhraseMode||window._lnPhraseMode==='browse'?' active':''}" onclick="window._lnPhraseMode='browse';lessonNotesSetView('keyphrases')">Browse</button>
        <button class="btn-toggle btn-sm${window._lnPhraseMode==='en-jp'?' active':''}" onclick="window._lnPhraseMode='en-jp';lessonNotesSetView('keyphrases')">EN→JP</button>
        <button class="btn-toggle btn-sm${window._lnPhraseMode==='jp-en'?' active':''}" onclick="window._lnPhraseMode='jp-en';lessonNotesSetView('keyphrases')">JP→EN</button>
      </div>
      ${!window._lnPhraseMode || window._lnPhraseMode === 'browse' ? `
      ${(() => {
        const GROUP_ORDER = ['Greetings & Openers','Classroom Language','Time & Sequence','Describing & Explaining','Expressing Feelings & Opinions','Questions & Requests','Grammar Connectors','Other'];
        const grouped = {};
        LessonNotesState.keyPhrases.forEach((kp, i) => {
          const g = kp.group || 'Other';
          if (!grouped[g]) grouped[g] = [];
          grouped[g].push({...kp, _i: i});
        });
        const keys = [...GROUP_ORDER.filter(g => grouped[g]), ...Object.keys(grouped).filter(g => !GROUP_ORDER.includes(g))];
        return keys.map(g => `
          <div style="margin-bottom:20px">
            <div style="font-family:var(--ui);font-size:0.7rem;letter-spacing:0.1em;color:var(--ink-light);margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border)">${g.toUpperCase()}</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
              ${grouped[g].map(kp => `
                <div style="background:linear-gradient(135deg,rgba(212,165,116,0.08),rgba(212,165,116,0.02));border:1px solid rgba(212,165,116,0.3);border-radius:8px;padding:14px">
                  <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
                    <span style="font-family:var(--jp);font-size:1.15rem;color:var(--ink)">${kp.phrase}</span>
                    <button class="btn-icon" onclick="jpSpeak('${(kp.phrase||'').replace(/'/g,"\'")}')">🔊</button>
                  </div>
                  <div style="font-family:var(--ui);font-size:0.88rem;color:var(--ink-light)">${kp.meaning||''}</div>
                  ${kp.example ? `<div style="font-family:var(--jp);font-size:0.9rem;color:var(--ink);margin-top:8px;padding:8px;background:var(--paper-dark);border-radius:4px">${kp.example}</div>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        `).join('');
      })()}
      <div style="margin-top:12px;text-align:center">
        <button onclick="lessonNotesExtractKeyPhrases()" class="btn-action btn-sm">🔄 Re-extract</button>
      </div>
      ` : `<div id="ln-phrase-drill-container" style="margin-top:8px"></div>`}
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
        <button onclick="lessonNotesExtractGrammar()" class="yoshi-read-btn">📝 Extract Grammar</button>
      </div>
    ` : `
      ${hiddenCount > 0 ? `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:8px 12px;background:var(--paper-dark);border-radius:6px">
          <span style="font-family:var(--ui);font-size:0.78rem;color:var(--ink-light)">${hiddenCount} hidden</span>
          <button onclick="lessonNotesToggleShowHidden()" class="yoshi-read-btn">${LessonNotesState.showHiddenGrammar ? '👁 Hide' : '👁 Show'} hidden</button>
        </div>
      ` : ''}
      ${(() => {
        const GROUP_ORDER = ['Particles','Verb Forms','Adjectives','Connectors & Conjunctions','Expressions & Set Phrases','Sentence Endings','Other'];
        const grouped = {};
        visibleGrammar.forEach(g => {
          const grp = g.group || 'Other';
          if (!grouped[grp]) grouped[grp] = [];
          grouped[grp].push(g);
        });
        const keys = [...GROUP_ORDER.filter(g => grouped[g]), ...Object.keys(grouped).filter(g => !GROUP_ORDER.includes(g))];
        return keys.map(grp => `
          <div style="margin-bottom:20px">
            <div style="font-family:var(--ui);font-size:0.7rem;letter-spacing:0.1em;color:var(--ink-light);margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border)">${grp.toUpperCase()}</div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">
              ${grouped[grp].map(g => `
          <div style="background:linear-gradient(135deg, rgba(48,213,200,0.08), rgba(48,213,200,0.02));border:1px solid ${LessonNotesState.grammarHidden.has(g._idx) ? 'var(--ink-light)' : 'rgba(48,213,200,0.3)'};border-radius:8px;padding:14px;transition:all 0.15s;${LessonNotesState.grammarHidden.has(g._idx) ? 'opacity:0.5' : ''}">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <span onclick="lessonNotesOpenGrammarDetail(${g._idx})" style="font-family:var(--jp);font-size:1.15rem;color:var(--teal);font-weight:500;cursor:pointer;flex:1">${g.pattern}</span>
              <button class="btn-action" onclick="event.stopPropagation();lessonNotesEditGrammar(${g._idx})" title="Edit">✏️</button>
              <button class="btn-action" onclick="event.stopPropagation();lessonNotesToggleGrammarHide(${g._idx})" title="${LessonNotesState.grammarHidden.has(g._idx) ? 'Show' : 'Hide'}">${LessonNotesState.grammarHidden.has(g._idx) ? '👁' : '🙈'}</button>
              <button class="btn-action" onclick="event.stopPropagation();lessonNotesDeleteGrammar(${g._idx})" title="Delete">✕</button>
              <button class="btn-action" class="btn-action btn-xs" onclick="event.stopPropagation();(App.gramSentPracticePattern||window.gramSentPracticePattern)?.(LessonNotesState.grammar[${g._idx}]?.pattern)" title="Practice in Grammar Drill">Practice →</button>

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
          </div>
        `).join('');
      })()}
      <div style="margin-top:12px;text-align:center">
        <button onclick="lessonNotesExtractGrammar()" class="btn-action btn-sm">🔄 Re-extract</button>
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
        <button class="btn-action" onclick="document.getElementById('grammarEditModal').remove()">Cancel</button>
        <button class="btn-action" onclick="lessonNotesSaveGrammarEdit(${idx})">Save</button>
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
      max_tokens: 6000,
      messages: [{ role: 'user', content: `Extract key phrases from these Japanese lesson notes. Focus on:
- Important expressions and set phrases
- Useful collocations
- Conversational patterns
- Cultural expressions

Assign each phrase a group from: Greetings & Openers, Classroom Language, Time & Sequence, Describing & Explaining, Expressing Feelings & Opinions, Questions & Requests, Grammar Connectors, Other
Return JSON array only:
[{"phrase":"Japanese phrase","meaning":"English meaning","example":"optional example sentence","group":"group name"}]

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
      max_tokens: 5000,
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
Assign each point a group from: Particles, Verb Forms, Adjectives, Connectors & Conjunctions, Expressions & Set Phrases, Sentence Endings, Other
[{"pattern":"grammar pattern name","explanation":"clear explanation in English of how it works","example":"actual example from the lesson text","exampleMeaning":"English translation","sourceText":"the exact sentence from the notes containing this pattern","group":"group name"}]

Find the 10-15 most important grammar points only. Prioritise variety across groups over completeness.

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

  // Warn if any extraction came back empty
  const _lnFailed = [];
  if (LessonNotesState.vocab.length === 0)       _lnFailed.push('vocab');
  if (LessonNotesState.stories.length === 0)      _lnFailed.push('stories');
  if (LessonNotesState.keyPhrases.length === 0)   _lnFailed.push('key phrases');
  if (LessonNotesState.grammar.length === 0)      _lnFailed.push('grammar');
  if (_lnFailed.length) {
    console.warn('[LN] extraction returned empty for:', _lnFailed.join(', '));
    LessonNotesState.extractionWarning = _lnFailed;
  } else {
    LessonNotesState.extractionWarning = null;
  }

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
      max_tokens: 6000,
      messages: [{ role: 'user', content: `Extract key phrases and expressions from these Japanese lesson notes. Focus on useful conversational phrases, set expressions, and idiomatic patterns.
Assign each phrase a group from: Greetings & Openers, Classroom Language, Time & Sequence, Describing & Explaining, Expressing Feelings & Opinions, Questions & Requests, Grammar Connectors, Other
Return JSON array: [{"phrase":"Japanese phrase","meaning":"English meaning","example":"optional example sentence","sourceText":"the exact line from the notes where this phrase appeared","group":"group name"}]
Content: ${docContent.slice(0, 6000)}` }]
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
Assign each point a group from: Particles, Verb Forms, Adjectives, Connectors & Conjunctions, Expressions & Set Phrases, Sentence Endings, Other
[{"pattern":"grammar pattern name","explanation":"clear explanation in English of how it works","example":"actual example from the lesson text","exampleMeaning":"English translation","group":"group name"}]

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
          <button id="lnGrammarGenDrillBtn" onclick="lessonNotesGrammarGenerateDrill()" class="yoshi-read-btn">🔄 New sentences</button>
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
            <button class="btn-action" onclick="jpSpeak('${current.jp.replace(/'/g, "\\'")}', 0.9)">🔊 Listen</button>
          </div>
        ` : ''}
        <div style="display:flex;gap:8px;margin-top:12px">
          <button onclick="lessonNotesGrammarPrevDrill()" class="yoshi-read-btn" ${LessonNotesState.grammarDrillIdx === 0 ? 'disabled' : ''}>← Prev</button>
          <button onclick="lessonNotesGrammarCheckDrill()" class="yoshi-read-btn btn-action">Check</button>
          <button onclick="lessonNotesGrammarNextDrill()" class="yoshi-read-btn" ${LessonNotesState.grammarDrillIdx >= LessonNotesState.grammarDrillSentences.length - 1 ? 'disabled' : ''}>Next →</button>
        </div>
      </div>
    `;
  } else {
    drillHtml = `
      <div style="margin-top:16px;padding:20px;background:var(--paper-dark);border-radius:8px;text-align:center">
        <button id="lnGrammarGenDrillBtn" onclick="lessonNotesGrammarGenerateDrill()" class="yoshi-read-btn">📝 Generate Translation Drill</button>
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
      <button onclick="lessonNotesCloseGrammarDetail()" class="yoshi-read-btn">← Back to Grammar List</button>
    </div>
    
    <!-- Header - compact when drilling -->
    <div style="padding:${hasDrill ? '12px 16px' : '20px'};background:linear-gradient(135deg, rgba(48,213,200,0.15), rgba(48,213,200,0.05));border:1px solid var(--teal);border-radius:10px;margin-bottom:16px">
      <div style="font-family:var(--jp);font-size:${hasDrill ? '1.2rem' : '1.6rem'};font-weight:600;color:var(--teal);${hasDrill ? '' : 'margin-bottom:8px'}">${grammar.pattern}</div>
      ${hasDrill ? '' : `<div style="font-family:var(--ui);font-size:1rem;color:var(--ink);line-height:1.6">${grammar.explanation}</div>`}
      ${!hasDrill && grammar.example ? `
        <div style="margin-top:12px;padding:12px;background:var(--paper);border-radius:6px">
          <div style="font-family:var(--jp);font-size:1.1rem;color:var(--ink)">${grammar.example}</div>
          ${grammar.exampleMeaning ? `<div style="font-family:var(--ui);font-size:0.85rem;color:var(--ink-light);margin-top:4px">→ ${grammar.exampleMeaning}</div>` : ''}
          <button class="btn-action" onclick="jpSpeak('${grammar.example.replace(/'/g, "\\'")}', 0.9)">🔊 Listen</button>
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
        <button onclick="lessonNotesGrammarAsk()" class="yoshi-read-btn" style="flex-shrink:0">Ask</button>
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
      <button class="btn-action" onclick="lessonNotesFullDocDoSearch()">Search</button>
      ${searchTerm ? `<button class="btn-action" onclick="lessonNotesFullDocClearSearch()">✕</button>
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
  LessonNotesState.storyTab = 'read';
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

function lessonNotesSetStoryTab(tab) {
  LessonNotesState.storyTab = tab;
  lessonNotesRender();
  if (tab === 'read') {
    if (_qrSegments && _qrSegments.length) {
      setTimeout(lessonNotesRenderStoryText, 0);
    } else if (LessonNotesState.currentStory) {
      lessonNotesParseStory(LessonNotesState.currentStory.text);
    }
  }
}

function lessonNotesRenderStoryVocab(story) {
  const all = LessonNotesState.vocab || [];
  const text = story.text || '';
  const matched = all.filter(v => v.word && text.includes(v.word));
  if (!matched.length) {
    return `<div class="qr-reader-box"><div style="font-family:var(--ui);font-size:0.85rem;color:var(--ink-light);padding:20px 0">No session vocab found in this story.</div></div>`;
  }
  const rows = matched.map(v => {
    const word = (v.word || '').replace(/'/g, "\\'");
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:6px 10px;color:var(--ink);font-family:var(--jp)">${v.word || ''}</td>
      <td style="padding:6px 10px;color:var(--ink-light);font-family:var(--jp)">${v.reading || '\u2014'}</td>
      <td style="padding:6px 10px;color:var(--ink-light);font-size:0.82rem;font-family:var(--ui)">${v.meaning || v.en || '\u2014'}</td>
      <td style="padding:6px 4px"><button class="btn-icon" onclick="jpSpeak('${word}')">\uD83D\uDD0A</button></td>
    </tr>`;
  }).join('');
  return `
    <div class="qr-reader-box">
      <div style="border:1px solid var(--border);border-radius:6px;overflow-y:auto;max-height:60vh">
        <table style="width:100%;border-collapse:collapse;font-size:0.88rem">
          <thead style="position:sticky;top:0;background:var(--paper-dark)">
            <tr style="border-bottom:1px solid var(--border)">
              <th style="text-align:left;padding:8px 10px;font-family:var(--ui);font-size:0.7rem;letter-spacing:0.06em;color:var(--ink-light);font-weight:500">WORD</th>
              <th style="text-align:left;padding:8px 10px;font-family:var(--ui);font-size:0.7rem;letter-spacing:0.06em;color:var(--ink-light);font-weight:500">READING</th>
              <th style="text-align:left;padding:8px 10px;font-family:var(--ui);font-size:0.7rem;letter-spacing:0.06em;color:var(--ink-light);font-weight:500">MEANING</th>
              <th style="width:40px"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="font-family:var(--ui);font-size:0.7rem;color:var(--ink-light);margin-top:8px">${matched.length} of ${all.length} session words appear in this story</div>
    </div>
  `;
}

function lessonNotesRenderStoryNotes(story) {
  const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `
    <div class="qr-reader-box">
      <textarea id="lnStoryNotes" placeholder="Notes for this story\u2026"
        onblur="lessonNotesSaveStoryNotes(this.value)"
        style="width:100%;min-height:300px;padding:12px;background:var(--field);border:1px solid var(--field-border);color:var(--ink);font-family:var(--ui);font-size:0.9rem;line-height:1.6;border-radius:6px;outline:none;resize:vertical">${esc(story.notes)}</textarea>
      <div style="font-family:var(--ui);font-size:0.7rem;color:var(--ink-light);margin-top:6px">Saved automatically when you click away</div>
    </div>
  `;
}

function lessonNotesSaveStoryNotes(val) {
  const story = LessonNotesState.currentStory;
  if (!story) return;
  story.notes = val;
  const sessions = lessonNotesGetSessions();
  const cur = sessions[LessonNotesState.currentIdx];
  if (!cur || !cur.stories) return;
  const idx = cur.stories.findIndex(s => s.title === story.title && s.text === story.text);
  if (idx >= 0) {
    cur.stories[idx].notes = val;
    lessonNotesSaveSessions(sessions);
  }
}

function lessonNotesRenderStoryEdit(story) {
  const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `
    <div class="qr-reader-box">
      <label style="display:block;font-family:var(--ui);font-size:0.72rem;color:var(--ink-light);margin-bottom:4px">Title</label>
      <input id="lnStoryEditTitle" type="text" value="${esc(story.title)}"
        style="width:100%;padding:8px 12px;background:var(--field);border:1px solid var(--field-border);color:var(--ink);font-family:var(--ui);font-size:0.9rem;border-radius:6px;outline:none;margin-bottom:12px">
      <label style="display:block;font-family:var(--ui);font-size:0.72rem;color:var(--ink-light);margin-bottom:4px">Text</label>
      <textarea id="lnStoryEditText"
        style="width:100%;min-height:260px;padding:12px;background:var(--field);border:1px solid var(--field-border);color:var(--ink);font-family:var(--jp);font-size:0.95rem;line-height:1.8;border-radius:6px;outline:none;resize:vertical">${esc(story.text)}</textarea>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn-action btn-sm" onclick="lessonNotesSaveStoryEdit()">Save</button>
        <button class="btn-nav btn-sm" onclick="lessonNotesSetStoryTab('read')">Cancel</button>
      </div>
    </div>
  `;
}

function lessonNotesSaveStoryEdit() {
  const titleEl = document.getElementById('lnStoryEditTitle');
  const textEl  = document.getElementById('lnStoryEditText');
  if (!titleEl || !textEl) return;
  const story = LessonNotesState.currentStory;
  if (!story) return;
  const oldTitle = story.title;
  const oldText  = story.text;
  story.title = titleEl.value;
  story.text  = textEl.value;
  const sessions = lessonNotesGetSessions();
  const cur = sessions[LessonNotesState.currentIdx];
  if (cur && cur.stories) {
    const idx = cur.stories.findIndex(s => s.title === oldTitle && s.text === oldText);
    if (idx >= 0) {
      cur.stories[idx].title = story.title;
      cur.stories[idx].text  = story.text;
      lessonNotesSaveSessions(sessions);
    }
  }
  _qrSegments = [];
  LessonNotesState.storyTab = 'read';
  lessonNotesRender();
  lessonNotesParseStory(story.text);
}

function lessonNotesRenderReading() {
  const story = LessonNotesState.currentStory;
  if (!story) return '';

  const tab = LessonNotesState.storyTab || 'read';
  const tabBar = `
    <div class="yoshi-subtabs">
      <button class="yoshi-subtab ${tab==='read'?'active':''}" onclick="lessonNotesSetStoryTab('read')">📖 Read</button>
      <button class="yoshi-subtab ${tab==='cloze'?'active':''}" onclick="lessonNotesSetStoryTab('cloze')">✏️ Cloze</button>
      <button class="yoshi-subtab ${tab==='vocab'?'active':''}" onclick="lessonNotesSetStoryTab('vocab')">📚 Vocab</button>
      <button class="yoshi-subtab ${tab==='notes'?'active':''}" onclick="lessonNotesSetStoryTab('notes')">📝 Notes</button>
      <button class="yoshi-subtab ${tab==='edit'?'active':''}" onclick="lessonNotesSetStoryTab('edit')">⚙ Edit</button>
    </div>
    <div style="display:flex;gap:8px;align-items:center;margin:12px 0">
      <button class="qr-btn-sec" onclick="lessonNotesSetView('stories')">← Stories</button>
      <span style="margin-left:auto;font-family:'Shippori Mincho',serif;font-size:1rem;color:var(--ink)">${story.title}</span>
    </div>
  `;

  if (tab === 'cloze') return tabBar + lessonNotesRenderStoryCloze();
  if (tab === 'vocab') return tabBar + lessonNotesRenderStoryVocab(story);
  if (tab === 'notes') return tabBar + lessonNotesRenderStoryNotes(story);
  if (tab === 'edit')  return tabBar + lessonNotesRenderStoryEdit(story);

  // 'read' (default) — existing reading view
  const hasRecording = story.recording ? true : false;
  const sentences = lessonNotesSplitSentences(story.text);
  const sentenceRecordings = story.sentenceRecordings || [];
  const allSentencesRecorded = sentences.length > 0 && sentenceRecordings.length === sentences.length && sentenceRecordings.every(r => r);
  const hasAnyRecordings = sentenceRecordings.some(r => r);
  const recordedCount = sentenceRecordings.filter(r => r).length;

  return tabBar + `
    <div class="qr-reader-box">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
        <button class="qr-btn-sec ${LessonNotesState.lnFuriOn?'active':''}" onclick="lessonNotesToggleFuri()" style="padding:5px 12px;font-size:0.78rem;${LessonNotesState.lnFuriOn?'color:var(--teal);border-color:var(--teal)':''}">ふり仮名</button>
        <button id="lnSpeakBtn" class="qr-btn-sec" onclick="lessonNotesToggleSpeak()" title="Read aloud / Stop">🔊 Read</button>
        <button class="qr-btn-sec btn-copy" onclick="lessonNotesCopyStory()" title="Copy text without furigana">Copy</button>
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
              <button class="qr-btn-sec" onclick="lessonNotesPlayRecording()">▶️ Play</button>
              <button class="qr-btn-sec" onclick="lessonNotesDeleteRecording()">🗑</button>
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
              <button class="qr-btn-sec" onclick="lnPrevSentence()" ${LessonNotesState.lnCurrentSentence === 0 ? 'disabled' : ''}>← Prev</button>
              <button class="qr-btn-sec" onclick="lnRecordSentence()" style="padding:5px 12px;font-size:0.78rem;${LessonNotesState.lnIsRecording?'background:var(--red);color:white;border-color:var(--red)':''}">
                ${LessonNotesState.lnIsRecording ? '⏹ Stop' : '🎤 Record'}
              </button>
              ${sentenceRecordings[LessonNotesState.lnCurrentSentence] ? `
                <button class="qr-btn-sec" onclick="lnPlaySentence(${LessonNotesState.lnCurrentSentence})">▶️</button>
                <button class="qr-btn-sec" onclick="lnDeleteSentence(${LessonNotesState.lnCurrentSentence})">🗑</button>
                <span style="color:var(--teal);font-size:0.7rem">✓</span>
              ` : ''}
              <button class="qr-btn-sec" onclick="lnNextSentence()" ${LessonNotesState.lnCurrentSentence >= sentences.length - 1 ? 'disabled style="opacity:0.5"' : ''}>Next →</button>
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
                <button class="qr-btn-sec" onclick="lnPlayAllSentences()">▶️ Play ${recordedCount}</button>
                <button class="qr-btn-sec" onclick="lnCombineAndSave()">💾 Combine ${recordedCount}</button>
                <button class="qr-btn-sec" onclick="lnCombineAndDownload()">⬇ Download ${recordedCount}</button>
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

async function lnCreateFromPaste() {
  var raw = (document.getElementById('lnPasteArea') || {}).value || '';
  raw = raw.trim();
  var titleEl = document.getElementById('lnNewTitle');
  var title = (titleEl ? titleEl.value.trim() : '') || new Date().toISOString().slice(0,10);
  if (!raw) return;

  lessonNotesRenderPanel();

  var messages = (App.yoshiParseWhatsapp || window.yoshiParseWhatsapp)(raw);
  var isWhatsApp = messages.length > 2;
  var vocab = [], corrections = [], grammar = [], topics = [], summary = '', parsed = null;

  try {
    var apiKey = (App.getApiKey || window.getApiKey)?.();
    if (apiKey) {
      var resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          system: 'Analyse Japanese lesson content. Respond ONLY with valid JSON, no markdown.',
          messages: [{ role: 'user', content:
            'Extract from this ' + (isWhatsApp ? 'WhatsApp lesson chat' : 'lesson document') + ':\n'
            + '1. vocab: [{jp, reading, en}] — vocabulary items with readings\n'
            + '2. stories: [{title, text}] — any continuous Japanese text passages (sentences, paragraphs)\n'
            + '3. keyPhrases: [{phrase, meaning, example}] — useful expressions and sentence patterns\n'
            + '4. grammar: [{pattern, explanation, example}] — grammar points covered\n'
            + '5. corrections: [{original, corrected, note}] — errors that were corrected\n'
            + '6. topics: [string] — topics covered\n'
            + '7. summary: string (one sentence)\n\n'
            + 'Content:\n' + raw.slice(0, 4000)
            + '\n\nJSON only: {"vocab":[],"stories":[],"keyPhrases":[],"grammar":[],"corrections":[],"topics":[],"summary":""}'
          }]
        })
      });
      var data = await resp.json();
      console.warn('[API] Claude call · feature="lesson-paste" · in=' + (data.usage?.input_tokens ?? '?') + ' out=' + (data.usage?.output_tokens ?? '?') + ' tokens');
      (App.apiUsageTrack || window.apiUsageTrack)?.('lesson-paste', data.usage?.input_tokens ?? 0, data.usage?.output_tokens ?? 0);
      var text = (data.content && data.content[0] && data.content[0].text) || '';
      parsed = JSON.parse(text.replace(/```json|```/g,'').trim());
      vocab = parsed.vocab || [];
      corrections = parsed.corrections || [];
      grammar = parsed.grammar || [];
      topics = parsed.topics || [];
      summary = parsed.summary || '';
    }
  } catch(e) { console.warn('[lnCreateFromPaste]', e.message); }

  var sessions = lessonNotesGetSessions();
  var stories = parsed && parsed.stories ? parsed.stories : [];
  var keyPhrases = parsed && parsed.keyPhrases ? parsed.keyPhrases : [];
  sessions.unshift({
    id: Date.now(),
    date: (function() {
      var d = title.replace(/^\[/, '').trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0,10);
      var m = d.match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})/);
      if (m) { var yy = m[3].length===2?'20'+m[3]:m[3]; return yy+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'); }
      return new Date().toISOString().slice(0,10);
    })(),
    title: title,
    rawText: raw,
    vocab: vocab,
    stories: stories,
    keyPhrases: keyPhrases,
    grammar: grammar,
    corrections: corrections,
    topics: topics,
    summary: summary,
    whatsapp: isWhatsApp ? messages : [],
  });
  lessonNotesSaveSessions(sessions);
  LessonNotesState.currentIdx = 0;
  lessonNotesRenderPanel();
}

Object.assign(App, { lnCreateFromPaste });

// ── Moved from features-tools.js ────────────────────────────────────────────
function lessonNotesUpdateDropdown() {
  // No-op stub. Dropdown update is handled by lessonNotesRenderPanel.
}

function yoshiParseWhatsapp(raw) {
  const lines = raw.split('\n');
  const msgs = [];
  const re  = /^\[?(\d{1,2}:\d{2})(?::\d{2})?,?\s+\d{1,2}[./]\d{1,2}[./]\d{2,4}\]?\s+([^:]+):\s+(.+)$/;
  const re2 = /^\[?\d{1,2}[./]\d{1,2}[./]\d{2,4},\s+(\d{1,2}:\d{2})(?::\d{2})?\]?\s+([^:]+):\s+(.+)$/;
  for (const line of lines) {
    const m = line.match(re) || line.match(re2);
    if (m) msgs.push({ time: m[1], sender: m[2].trim(), text: m[3].trim() });
  }
  return msgs;
}


// ── ヨシ Panel — Unified lesson session system ────────────────────────────────

const IMPORTED_DOC_SESSIONS_PANEL_KEY = 'importedDocSessions';

function lnGetSessions() {
  // Delegate to features-yoshi.js session storage (kvAPI-backed)
  const fn = App.lessonNotesGetSessions || window.lessonNotesGetSessions;
  return fn ? fn() : [];
}
function lnSaveSessions(arr) {
  const fn = App.lessonNotesSaveSessions || window.lessonNotesSaveSessions;
  if (fn) fn(arr);
}
function lnCurrentSession() {
  const sessions = lnGetSessions();
  const idx = LessonNotesState.currentIdx;
  return (idx !== null && sessions[idx]) ? sessions[idx] : null;
}


function lnRenderTab(tab, cur) {
  if (!cur) return '';
  if (tab === 'vocab')       return lnRenderVocab(cur);
  if (tab === 'stories')     return lnRenderStories(cur);
  if (tab === 'keyphrases')  return lnRenderKeyPhrases(cur);
  if (tab === 'grammar')     return lnRenderGrammar(cur);
  if (tab === 'corrections') return lnRenderCorrections(cur);
  if (tab === 'fulldoc')     return lnRenderFullDoc(cur);
  if (tab === 'recording')   return lnRenderRecording(cur);
  return '';
}

function lnSwitchTab(tab) {
  document.querySelectorAll('[id^="lnTab-"]').forEach(function(b) { b.classList.remove('btn-active'); });
  var btn = document.getElementById('lnTab-' + tab);
  if (btn) { btn.classList.add('btn-active'); }
  var content = document.getElementById('lnTabContent');
  if (content) content.innerHTML = lnRenderTab(tab, lnCurrentSession());
}

function lnRenderVocab(cur) {
  var vocab = cur.vocab || [];
  if (!vocab.length) return '<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink-light);padding:20px 0">No vocabulary extracted yet.</div>';
  if (!window._lnDrillIdx) window._lnDrillIdx = 0;
  if (!window._lnDrillMode) window._lnDrillMode = 'jp2reading';
  if (!window._lnDrillRevealed) window._lnDrillRevealed = false;
  if (window._lnDrillIdx >= vocab.length) window._lnDrillIdx = 0;
  var v = vocab[window._lnDrillIdx];
  var progress = (window._lnDrillIdx + 1) + ' / ' + vocab.length;
  var h = [];
  // Drill mode buttons
  h.push('<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">');
  [{m:'jp2reading',l:'JP \u2192 Reading'},{m:'jp2en',l:'JP \u2192 Meaning'},{m:'en2jp',l:'EN \u2192 JP'}].forEach(function(o) {
    var active = window._lnDrillMode === o.m ? ';border-color:var(--teal);color:var(--teal)' : '';
    h.push('<button class="btn-action btn-sm" style="padding:3px 10px' + active + '" onclick="lnSetDrillMode(\'' + o.m + '\')">' + o.l + '</button>');
  });
  h.push('<span style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light);margin-left:auto;padding-top:4px">' + progress + '</span>');
  h.push('</div>');
  h.push('<div style="background:var(--paper-dark);border:1px solid var(--border);border-radius:8px;padding:20px;text-align:center;margin-bottom:10px;min-height:120px">');
  if (window._lnDrillMode === 'en2jp') {
    h.push('<div style="font-family:var(--ui);font-size:1.1rem;color:var(--ink);margin-bottom:8px">' + (v.en||v.meaning||'') + '</div>');
    if (window._lnDrillRevealed) {
      h.push('<div style="font-family:var(--jp);font-size:1.5rem;color:var(--teal);margin-bottom:4px">' + (v.jp||v.word||'') + '</div>');
      h.push('<div style="font-family:var(--ui);font-size:0.88rem;color:var(--ink-light)">' + (v.reading||v.kana||'') + '</div>');
    }
  } else {
    h.push('<div style="font-family:var(--jp);font-size:1.8rem;color:var(--ink);margin-bottom:8px">' + (v.jp||v.word||'') + '</div>');
    if (window._lnDrillRevealed) {
      if (window._lnDrillMode === 'jp2reading') h.push('<div style="font-family:var(--ui);font-size:1.1rem;color:var(--teal)">' + (v.reading||v.kana||'') + '</div>');
      else h.push('<div style="font-family:var(--ui);font-size:1rem;color:var(--teal)">' + (v.en||v.meaning||'') + '</div>');
    }
  }
  h.push('</div>');
  h.push('<div style="display:flex;gap:8px;justify-content:center;margin-bottom:16px">');
  h.push('<button class="btn-action btn-sm" onclick="lnDrillPrev()">&#8592; Prev</button>');
  if (!window._lnDrillRevealed) {
    h.push('<button class="btn-action" onclick="lnDrillReveal()">Reveal</button>');
  } else {
    var word = (v.jp||v.word||'').replace(/'/g,'&#39;');
    h.push('<button class="btn-action btn-sm" onclick="jpSpeak(\'' + word + '\')">&#128266;</button>');
    h.push('<button class="btn-action" onclick="lnDrillNext()">Next &#8594;</button>');
  }
  h.push('</div>');
  h.push('<div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px"><table style="width:100%;border-collapse:collapse;font-family:var(--ui);font-size:0.78rem">');
  vocab.forEach(function(w, i) {
    var bg = i === window._lnDrillIdx ? 'background:rgba(48,213,200,0.1);' : '';
    h.push('<tr style="border-bottom:1px solid var(--border);' + bg + 'cursor:pointer" onclick="lnDrillJump(' + i + ')">');
    h.push('<td style="padding:5px 8px;font-family:var(--jp)">' + (w.jp||w.word||'') + '</td>');
    h.push('<td style="padding:5px 8px;color:var(--ink-light)">' + (w.reading||w.kana||'') + '</td>');
    h.push('<td style="padding:5px 8px;color:var(--ink)">' + (w.en||w.meaning||'') + '</td>');
    h.push('</tr>');
  });
  h.push('</table></div>');
  return h.join('');
}

function lnSetDrillMode(mode) { window._lnDrillMode = mode; window._lnDrillRevealed = false; lnRefreshTab('vocab'); }
function lnDrillReveal() { window._lnDrillRevealed = true; lnRefreshTab('vocab'); }
function lnDrillNext() { window._lnDrillIdx = (window._lnDrillIdx||0) + 1; window._lnDrillRevealed = false; lnRefreshTab('vocab'); }
function lnDrillPrev() { window._lnDrillIdx = Math.max(0, (window._lnDrillIdx||0) - 1); window._lnDrillRevealed = false; lnRefreshTab('vocab'); }
function lnDrillJump(i) { window._lnDrillIdx = i; window._lnDrillRevealed = false; lnRefreshTab('vocab'); }
function lnRefreshTab(tab) {
  var btn = document.getElementById('lnTab-' + tab);
  if (btn && btn.classList.contains('btn-active')) {
    var content = document.getElementById('lnTabContent');
    if (content) content.innerHTML = lnRenderTab(tab, lnCurrentSession());
  }
}

function lnRenderStories(cur) {
  var stories = cur.stories || [];
  if (!stories.length) return '<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink-light);padding:20px 0">No stories or passages extracted.</div>';
  var h = ['<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">'];
  stories.forEach(function(s, i) {
    h.push('<div onclick="lnOpenStory(' + i + ')" style="background:var(--paper-dark);border:1px solid var(--border);border-radius:8px;padding:14px;cursor:pointer">');
    h.push('<div style="font-family:var(--jp);font-size:0.95rem;color:var(--ink);margin-bottom:6px">' + (s.title||'Text '+(i+1)) + '</div>');
    h.push('<div style="font-family:var(--jp);font-size:0.78rem;color:var(--ink-light);line-height:1.4">' + (s.text||'').slice(0,60) + '&#8230;</div>');
    h.push('</div>');
  });
  h.push('</div>');
  return h.join('');
}

function lnOpenStory(i) {
  var cur = lnCurrentSession();
  var s = cur && cur.stories && cur.stories[i];
  if (!s) return;
  var content = document.getElementById('lnTabContent');
  if (!content) return;
  content.innerHTML = '<div>'
    + '<button class="btn-action btn-sm" style="margin-bottom:12px" onclick="lnSwitchTab(\'stories\')">&#8592; Back</button>'
    + '<div style="font-family:var(--jp);font-size:1.1rem;color:var(--teal);margin-bottom:10px">' + (s.title||'') + '</div>'
    + '<div style="font-family:var(--jp);font-size:0.95rem;color:var(--ink);line-height:1.8;white-space:pre-wrap">' + (s.text||'') + '</div>'
    + '</div>';
}

function lnRenderKeyPhrases(cur) {
  var kp = cur.keyPhrases || [];
  if (!kp.length) return '<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink-light);padding:20px 0">No key phrases extracted.</div>';
  var mode = window._lnPhraseMode || 'browse';
  var btnStyle = function(m) {
    return 'padding:4px 12px;border:1px solid var(--border);border-radius:6px;font-family:var(--ui);font-size:0.78rem;cursor:pointer;background:' + (mode===m ? 'var(--teal)' : 'var(--paper-dark)') + ';color:' + (mode===m ? '#fff' : 'var(--ink)');
  };
  var h = [];
  h.push('<div style="display:flex;gap:6px;margin-bottom:14px">');
  h.push('<button style="' + btnStyle('browse') + '" onclick="window._lnPhraseMode=\'browse\';lnRefreshTab(\'keyphrases\')">Browse</button>');
  h.push('<button style="' + btnStyle('en-jp') + '" onclick="window._lnPhraseMode=\'en-jp\';lnStartPhraseDrill()">EN&rarr;JP</button>');
  h.push('<button style="' + btnStyle('jp-en') + '" onclick="window._lnPhraseMode=\'jp-en\';lnStartPhraseDrill()">JP&rarr;EN</button>');
  h.push('</div>');
  if (mode === 'browse') {
    h.push('<div style="display:flex;flex-direction:column;gap:10px">');
    kp.forEach(function(p) {
      var phrase = (p.phrase||'').replace(/'/g,'&#39;');
      h.push('<div style="background:rgba(212,165,116,0.06);border:1px solid rgba(212,165,116,0.25);border-radius:8px;padding:14px">');
      h.push('<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">');
      h.push('<span style="font-family:var(--jp);font-size:1.1rem;color:var(--ink)">' + (p.phrase||'') + '</span>');
      h.push('<button class="btn-action btn-xs" onclick="jpSpeak(\'' + phrase + '\')">&#128266;</button>');
      h.push('</div>');
      if (p.meaning) h.push('<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink-light)">' + p.meaning + '</div>');
      if (p.example) h.push('<div style="font-family:var(--jp);font-size:0.88rem;color:var(--ink);margin-top:8px;padding:8px;background:var(--paper-dark);border-radius:4px">' + p.example + '</div>');
      h.push('</div>');
    });
    h.push('</div>');
  } else {
    h.push('<div id="ln-phrase-drill-container"></div>');
  }
  return h.join('');
}
function lnStartPhraseDrill() {
  lnRefreshTab('keyphrases');
  var cur = lnCurrentSession();
  var kp = (cur && cur.keyPhrases) || [];
  if (!kp.length) return;
  var mode = window._lnPhraseMode || 'en-jp';
  var DC = App.DrillCard || window.DrillCard;
  if (!DC) { console.warn('[LN] DrillCard not found'); return; }
  DC.run({
    containerId: 'ln-phrase-drill-container',
    allowResume: false,
    getQueue: function() { return kp.slice().sort(function() { return Math.random()-0.5; }); },
    getPrompt: function(item) {
      if (mode === 'en-jp') return '<span style="font-family:var(--ui);font-size:1.3rem;color:var(--ink)">' + (item.meaning||'') + '</span>';
      return '<span style="font-family:var(--jp)">' + (item.phrase||'') + '</span>';
    },
    getAnswer: function(item) {
      return mode === 'en-jp' ? (item.phrase||'') : (item.meaning||'');
    },
    onSpeak: function(item) {
      var speak = App.jpSpeak || window.jpSpeak;
      if (speak && item.phrase) speak(item.phrase);
    },
    inputPlaceholder: mode === 'en-jp' ? 'Type Japanese...' : 'Type English...',
    trackingLabel: 'ln-phrases'
  });
}
function lnRenderCorrections(cur) {
  var corrections = cur.corrections || [];
  if (!corrections.length) return '<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink-light);padding:20px 0">No corrections recorded.</div>';
  var h = ['<div style="display:flex;flex-direction:column;gap:8px">'];
  corrections.forEach(function(c) {
    h.push('<div style="padding:8px;background:var(--paper-dark);border:1px solid var(--border);border-radius:6px;font-family:var(--ui)">');
    h.push('<div style="font-size:0.82rem;margin-bottom:4px"><span style="color:#e05050">' + (c.original || '') + '</span> → <span style="color:var(--teal)">' + (c.corrected || '') + '</span></div>');
    if (c.note) h.push('<div style="font-size:0.72rem;color:var(--ink-light)">' + c.note + '</div>');
    h.push('</div>');
  });
  h.push('</div>');
  return h.join('');
}

function lnRenderGrammar(cur) {
  var grammar = cur.grammar || [];
  if (!grammar.length) return '<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink-light);padding:20px 0">No grammar points extracted.</div>';
  if (!window._lnGrammarHidden) window._lnGrammarHidden = new Set();
  if (!window._lnShowHidden) window._lnShowHidden = false;
  var hidden = window._lnGrammarHidden;
  var showHidden = window._lnShowHidden;
  var hiddenCount = hidden.size;
  var h = [];
  if (hiddenCount > 0) {
    h.push('<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding:6px 10px;background:var(--paper-dark);border-radius:6px">');
    h.push('<span style="font-family:var(--ui);font-size:0.75rem;color:var(--ink-light)">' + hiddenCount + ' hidden</span>');
    h.push('<button class="btn-action btn-xs" onclick="lnToggleShowHidden()">' + (showHidden ? '&#128065; Hide hidden' : '&#128065; Show hidden') + '</button>');
    h.push('</div>');
  }
  h.push('<div style="display:flex;flex-direction:column;gap:10px">');
  grammar.forEach(function(g, i) {
    if (!showHidden && hidden.has(i)) return;
    var isHidden = hidden.has(i);
    var opacity = isHidden ? 'opacity:0.4;' : '';
    h.push('<div style="background:rgba(48,213,200,0.05);border:1px solid rgba(48,213,200,' + (isHidden ? '0.1' : '0.25') + ');border-radius:8px;padding:12px;' + opacity + '">');
    h.push('<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">');
    h.push('<span style="font-family:var(--jp);font-size:1.05rem;color:var(--teal);flex:1">' + (g.pattern||g.point||'') + '</span>');
    h.push('<button class="btn-action" class="btn-action btn-xs" onclick="lnToggleGrammarHide(' + i + ')" title="' + (isHidden ? 'Show' : 'Hide') + '">' + (isHidden ? '&#128065;' : '&#128584;') + '</button>');
    h.push('</div>');
    if (g.explanation) h.push('<div style="font-family:var(--ui);font-size:0.80rem;color:var(--ink-light);line-height:1.5">' + g.explanation + '</div>');
    if (g.example) h.push('<div style="font-family:var(--jp);font-size:0.88rem;color:var(--ink);margin-top:8px;padding:8px;background:var(--paper-dark);border-radius:4px;border-left:3px solid var(--teal)">' + g.example + '</div>');
    h.push('</div>');
  });
  h.push('</div>');
  return h.join('');
}

function lnToggleGrammarHide(i) {
  if (!window._lnGrammarHidden) window._lnGrammarHidden = new Set();
  if (window._lnGrammarHidden.has(i)) window._lnGrammarHidden.delete(i);
  else window._lnGrammarHidden.add(i);
  lnRefreshTab('grammar');
}
function lnToggleShowHidden() {
  window._lnShowHidden = !window._lnShowHidden;
  lnRefreshTab('grammar');
}

function lnRenderTopics(cur) {
  var topics = cur.topics || [];
  var summary = cur.summary || '';
  var h = [];
  if (summary) h.push('<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink);margin-bottom:12px;font-style:italic">' + summary + '</div>');
  if (!topics.length) { h.push('<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink-light)">No topics extracted.</div>'); return h.join(''); }
  h.push('<div style="display:flex;flex-wrap:wrap;gap:6px">');
  topics.forEach(function(t) {
    h.push('<span style="font-family:var(--ui);font-size:0.78rem;background:var(--paper);border:1px solid var(--border);border-radius:12px;padding:4px 10px;color:var(--ink)">' + t + '</span>');
  });
  h.push('</div>');
  return h.join('');
}

function lnRenderFullDoc(cur) {
  var raw = cur.rawText || '';
  if (!raw) return '<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink-light);padding:20px 0">No source document.</div>';
  return '<div style="font-family:var(--jp);font-size:0.88rem;color:var(--ink);line-height:1.8;white-space:pre-wrap;max-height:60vh;overflow-y:auto;padding:8px">' + raw.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>';
}

function lnRenderRecording(cur) {
  var recordings = window._lessonRecordingSessions || [];
  // Normalise date — session.date may be 'YYYY-MM-DD', 'DD.MM.YY', or a WhatsApp title prefix.
  // Convert any format to YYYY-MM-DD so it matches the DB recording date field.
  function normDate(d) {
    if (!d) return '';
    // Strip leading [ and trailing punctuation, take first date-like segment
    d = d.replace(/^\[/, '').trim();
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0,10);
    // DD.MM.YY or DD.MM.YYYY — extract from anywhere in string
    var m = d.match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})/);
    if (!m) return '';
    var dd = m[1].padStart(2,'0'), mm = m[2].padStart(2,'0'), yy = m[3].length === 2 ? '20' + m[3] : m[3];
    return yy + '-' + mm + '-' + dd;
  }
  var sessionDate = normDate(cur.date || cur.title || '');
  // Find all recordings for this date (there may be more than one per day)
  var matched = recordings.find(function(s) { return normDate(s.date || (s.created_at||'').slice(0,10)) === sessionDate; });
  var h = [];
  if (!matched) {
    h.push('<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink-light);padding:12px 0">');
    h.push('No recording for ' + sessionDate + '.');
    if (recordings.length) h.push(' Available: ' + recordings.map(function(s){ return s.date || (s.created_at||'').slice(0,10); }).join(', '));
    h.push('</div>');
    return h.join('');
  }
  var done = !!matched.processed_at;
  h.push('<div style="font-family:var(--ui);font-size:0.75rem;color:' + (done ? 'var(--teal)' : 'var(--gold)') + ';margin-bottom:10px">' + (done ? '✓ Transcribed' : '⏳ Processing…') + '</div>');
  if (matched.audio_path) {
    var audioSrc = 'file://' + matched.audio_path;
    var teacherSrc = 'file://' + matched.audio_path.replace('.webm','_teacher.webm');
    h.push('<div style="background:var(--paper);border:1px solid var(--border);border-radius:6px;padding:8px 12px;margin-bottom:10px">');
    h.push('<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px"><span style="font-family:var(--ui);font-size:0.68rem;color:var(--ink-light);width:52px">🙋 You</span><audio src="' + audioSrc + '" controls style="flex:1;height:28px"></audio></div>');
    h.push('<div style="display:flex;align-items:center;gap:8px"><span style="font-family:var(--ui);font-size:0.68rem;color:var(--ink-light);width:52px">🧑‍🏫 Yoshi</span><audio src="' + teacherSrc + '" controls style="flex:1;height:28px"></audio></div>');
    h.push('</div>');
  }
  if (matched.transcript_json) {
    try {
      var turns = JSON.parse(matched.transcript_json);
      if (turns.length) {
        h.push('<input placeholder="Search transcript…" oninput="lnFilterTranscript(this.value)" style="width:100%;padding:6px 10px;background:var(--field);border:1px solid var(--field-border);border-radius:5px;font-family:var(--ui);font-size:0.78rem;color:var(--ink);box-sizing:border-box;margin-bottom:6px">');
        h.push('<div id="lnTranscriptList" style="max-height:50vh;overflow-y:auto">');
        turns.forEach(function(t) {
          var ts = Math.round(t.start || 0);
          var m = Math.floor(ts/60), s = ts%60;
          var isTeacher = t.speaker === 'teacher' || t.speaker === 'TEACHER';
          h.push('<div class="lesson-transcript-row" data-text="' + (t.text||'').replace(/"/g,'&quot;').toLowerCase() + '" style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--border)">');
          h.push('<span style="font-family:var(--ui);font-size:0.65rem;color:var(--teal);flex-shrink:0;width:32px">' + m + ':' + String(s).padStart(2,'0') + '</span>');
          h.push('<span style="flex-shrink:0">' + (isTeacher ? '🧑‍🏫' : '🙋') + '</span>');
          h.push('<span style="font-family:var(--jp);font-size:0.88rem;color:var(--ink);flex:1">' + (t.text||'') + '</span>');
          h.push('</div>');
        });
        h.push('</div>');
      }
    } catch(e) {}
  }
  return h.join('');
}

function lnFilterTranscript(query) {
  document.querySelectorAll('.lesson-transcript-row').forEach(function(r) {
    r.style.display = (!query || (r.dataset.text && r.dataset.text.includes(query.toLowerCase()))) ? '' : 'none';
  });
}

// ── Recording list handlers ──────────────────────────────────────────────────

function lnToggleRecPlayer(id) {
  const el = document.getElementById('lnRecPlayer-' + id);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function lnDeleteRecording(id) {
  const recs = window._lessonRecordingSessions || [];
  const rec  = recs.find(function(s) { return s.id === id; });
  if (!rec) return;
  const msg = rec.audio_path
    ? 'Delete this recording and its audio file?'
    : 'Delete this recording session?';
  if (!confirm(msg)) return;
  try {
    await Orchestrator.deleteSession(
      rec.id,
      rec.audio_path || null,
      rec.audio_path ? rec.audio_path.replace('.webm', '_teacher.webm') : null
    );
  } catch(e) {
    alert('Delete failed: ' + e.message);
  }
}


function lnNewSession() {
  lessonNotesLoadSession(-1);
}

function lnLoadSession(idx) {
  lessonNotesLoadSession(idx >= 0 ? idx : -1);
}

function lnDeleteSession() {
  if (!confirm('Delete this lesson session?')) return;
  const sessions = lnGetSessions();
  const idx = LessonNotesState.currentIdx;
  if (idx === null) return;
  sessions.splice(idx, 1);
  lnSaveSessions(sessions);
  lessonNotesLoadSession(sessions.length ? 0 : -1);
}

// lnCreateFromPaste moved to features-lesson-notes.js

async function lnHandleFile(files) {
  if (!files || !files[0]) return;
  var file = files[0];
  var text = '';
  try {
    text = await file.text();
  } catch(e) { alert('Could not read file: ' + e.message); return; }
  var titleEl = document.getElementById('lnNewTitle');
  if (titleEl && !titleEl.value) titleEl.value = file.name.replace(/\.(docx|txt|md)$/i,'');
  var pasteEl = document.getElementById('lnPasteArea');
  if (pasteEl) pasteEl.value = text;
}

function lnHandleDrop(event) {
  event.preventDefault();
  lnHandleFile(event.dataTransfer && event.dataTransfer.files);
}

Object.assign(App, {
  lessonNotesUpdateDropdown, yoshiParseWhatsapp,
  lnGetSessions, lnSwitchTab,
  lnSetDrillMode, lnDrillReveal, lnDrillNext, lnDrillPrev, lnDrillJump, lnRefreshTab,
  lnOpenStory, lnToggleGrammarHide, lnToggleShowHidden,
  lnFilterTranscript, lnToggleRecPlayer, lnDeleteRecording,
  lnNewSession, lnLoadSession, lnDeleteSession,
  lnHandleFile, lnHandleDrop,
});
