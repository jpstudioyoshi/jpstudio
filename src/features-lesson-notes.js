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
  summary:             '',
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
      <span style="font-family:var(--ui);font-size:inherit;color:var(--gold)">⚠ Extraction incomplete: ${LessonNotesState.extractionWarning.join(', ')} came back empty. Check your API key or retry.</span>
      <button class="btn-action btn-xs" style="flex-shrink:0" onclick="LessonNotesState.extractionWarning=null;lessonNotesAutoExtractAll()">🔄 Retry</button>
    </div>`;
  }

  // If extracting, show loading
  if (LessonNotesState.extracting) {
    html += `
      <div style="text-align:center;padding:60px 20px">
        <div style="font-size:2rem;margin-bottom:16px">⏳</div>
        <div style="font-family:var(--ui);font-size:1rem;color:var(--teal);margin-bottom:8px">Extracting content...</div>
        <div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light)">Analyzing vocab, stories, phrases, and grammar</div>
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
          <span style="padding:10px 24px;background:var(--teal);color:#1c1c1e;border-radius:6px;font-family:var(--ui);font-size:inherit;display:inline-block">Browse files</span>
        </label>
      </div>
    `;
    return html;
  }
  
  html += lessonNotesGetHTML();
  return html;
}

// Ensure a lesson_sessions DB row exists for a freshly created notes session,
// linking it so lesson_phrases / extracted_grammar writes have a real lesson_id.
async function lessonNotesEnsureDbRow(session, sessions) {
  if (!window.db || !session) return;
  try {
    const _date = session.date;
    const _existing = await window.db.get('SELECT id FROM lesson_sessions WHERE date=? AND source=\'whatsapp\' LIMIT 1', [_date]);
    let _dbId = _existing?.id;
    if (!_dbId) {
      await window.db.run('INSERT INTO lesson_sessions (date, created_at, source) VALUES (?,?,?)', [_date, new Date().toISOString(), 'whatsapp']);
      const _rows = await window.db.query('SELECT last_insert_rowid() AS id');
      _dbId = _rows?.[0]?.id;
    }
    session.lessonSessionDbId = _dbId;
    LessonNotesState.currentLessonId = _dbId;
    lessonNotesSaveSessions(sessions);
    console.log('[LN] lesson_sessions row:', _dbId, 'for date', _date);
    // Auto-link to same-date recording if exactly one match > 10 min
    try {
      const _recs = await window.db.query(
        `SELECT id FROM lesson_sessions
         WHERE date=? AND source='recording'
         AND (audio_duration_s > 600 OR audio_duration_s IS NULL)
         AND linked_session_id IS NULL
         ORDER BY id DESC`,
        [_date]
      );
      if (_recs && _recs.length === 1) {
        await window.db.run(
          'UPDATE lesson_sessions SET linked_session_id=? WHERE id=?',
          [_dbId, _recs[0].id]
        );
        console.log('[LN] Auto-linked recording', _recs[0].id, '→ notes session', _dbId);
      } else if (_recs && _recs.length > 1) {
        console.log('[LN] Multiple recordings found for', _date, '— manual link needed');
      }
    } catch(e) { console.warn('[LN] Auto-link failed:', e.message); }
  } catch(e) { console.warn('[LN] lesson_sessions link failed:', e.message); }
}

async function lessonNotesPanelHandlePaste(event) {
  event.preventDefault();
  const text = event.clipboardData?.getData('text');
  if (!text || !text.trim()) return;
  
  // Create new session from pasted text
  const sessions = lessonNotesGetSessions();
  const _docContent = lessonNotesParseWithTimestamps(text);
  const _firstDated = _docContent.find(item => item.date);
  const firstLine = text.split('\n')[0].slice(0, 30).trim() || 'Pasted notes';
  const title = _firstDated ? (lnFormatWaDate(_firstDated.date) || 'Lesson') : (firstLine + (firstLine.length >= 30 ? '...' : ''));
  const _isoDate = (() => {
    if (!_firstDated) return new Date().toISOString().slice(0,10);
    const p = _firstDated.date.split(/[\.\/-]/);
    if (p.length !== 3) return new Date().toISOString().slice(0,10);
    let [d, m, y] = p;
    if (y.length === 2) y = '20' + y;
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  })();
  const newSession = { id: Date.now(), title, date: _isoDate, vocab: [], stories: [], keyPhrases: [], grammar: [], errors: [], docContent: [], rawText: '', summary: '', lessonSessionDbId: null };
  sessions.unshift(newSession);
  lessonNotesSaveSessions(sessions);
  LessonNotesState.currentIdx = 0;
  await lessonNotesEnsureDbRow(newSession, sessions);

  // Process pasted text
  LessonNotesState.rawText = text;
  LessonNotesState.docContent = _docContent;
  LessonNotesState.viewMode = 'overview';
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
  const newSession = { id: Date.now(), title, date: new Date().toISOString().slice(0,10), vocab: [], stories: [], keyPhrases: [], grammar: [], errors: [], docContent: [], rawText: '', summary: '', lessonSessionDbId: null };
  sessions.unshift(newSession);
  lessonNotesSaveSessions(sessions);
  LessonNotesState.currentIdx = 0;
  await lessonNotesEnsureDbRow(newSession, sessions);

  // Read file
  LessonNotesState.viewMode = 'overview';
  if (file.name.endsWith('.docx')) {
    await lessonNotesReadDocxForPanel(file);
  } else {
    const text = await file.text();
    LessonNotesState.rawText = text;
    LessonNotesState.docContent = lessonNotesParseWithTimestamps(text);
    LessonNotesState.viewMode = 'overview';
    const _firstDated = LessonNotesState.docContent.find(item => item.date);
    if (_firstDated) {
      const _t = lnFormatWaDate(_firstDated.date);
      if (_t) sessions[0].title = _t;
    }
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

async function lessonNotesNewFromPanel() {
  const title = prompt('Lesson title:');
  if (!title) return;

  const sessions = lessonNotesGetSessions();
  const newSession = { id: Date.now(), title, date: new Date().toISOString().slice(0,10), vocab: [], stories: [], keyPhrases: [], grammar: [], errors: [], docContent: [], rawText: '', summary: '', lessonSessionDbId: null };
  sessions.unshift(newSession);
  lessonNotesSaveSessions(sessions);
  LessonNotesState.currentIdx = 0;
  await lessonNotesEnsureDbRow(newSession, sessions);
  LessonNotesState.vocab = [];
  LessonNotesState.stories = [];
  LessonNotesState.keyPhrases = [];
  LessonNotesState.grammar = [];
  LessonNotesState.errors = [];
  LessonNotesState.docContent = [];
  LessonNotesState.summary = '';
  LessonNotesState.viewMode = 'overview';
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
  header.innerHTML = '<span style="font-family:var(--ui);font-size:inherit;font-weight:600;color:var(--ink)">Link a recording</span>';
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
    row.style.cssText = 'padding:8px 14px;border-bottom:1px solid var(--border);font-family:var(--ui);font-size:inherit;color:var(--ink);display:flex;align-items:center;gap:8px';
    const info = document.createElement('div');
    info.style.cssText = 'flex:1;cursor:pointer';
    info.innerHTML = '<span style="color:var(--teal)">' + dt + '</span>' + (dur ? ' · ' + dur : '') + done;
    row.classList.add('row-hover');
    info.onclick = function() { lnLinkRecording(r.id); };
    const delBtn = document.createElement('button');
    delBtn.textContent = '🗑';
    delBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:var(--ink-light);font-size:inherit;padding:2px 4px;flex-shrink:0';
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

  // One-click: kick off transcription immediately on linking
  lnTranscribeLinked().then(function() { lessonNotesRenderPanel(); });
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
  if (!session) return '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light);padding:20px">No lesson selected.</div>';
  const recId = session.linked_recording_id;
  if (!recId) {
    return '<div style="padding:20px;text-align:center">' +
      '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink);margin-bottom:12px">No recording linked to this lesson yet.</div>' +
      '<button class="btn-action" onclick="lnShowLinkPicker()">\u{1F517} Link a recording</button>' +
    '</div>';
  }

  const recs = window._lessonRecordingSessions || [];
  const rec = recs.find(function(r) { return r.id === recId; });
  if (!rec) {
    return '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light);padding:20px">Linked recording not found.</div>';
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

  // Source notes with search
  const _lnEsc = App.escHtml || window.escHtml || function(s){return s;};
  const _lnParseWA = App.yoshiParseWhatsapp || window.yoshiParseWhatsapp;
  const _lnRaw = LessonNotesState.rawText || '';
  let _lnDocHtml = '';
  if (_lnRaw && _lnParseWA) {
    const _lnMsgs = _lnParseWA(_lnRaw);
    _lnDocHtml = _lnMsgs.length ? _lnSourceNotesHtml(_lnMsgs)
      : '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light)">No messages found</div>';
  } else {
    _lnDocHtml = '<pre style="font-family:var(--jp);font-size:inherit;line-height:1.7;white-space:pre-wrap">' + _lnEsc(_lnRaw) + '</pre>';
  }
  const _snCollapsed = !!LessonNotesState.sourceNotesCollapsed;
  html += '<div style="padding-top:12px;border-top:1px solid var(--border)">';
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">';
  html += '<span style="font-family:var(--ui);font-size:0.68rem;letter-spacing:0.08em;color:var(--ink-light);cursor:pointer" onclick="lnToggleSourceNotes()">'
    + (_snCollapsed ? '\u25B6' : '\u25BC') + ' SOURCE NOTES</span>';
  html += '<input type="text" id="lnFullDocSearch" placeholder="Search\u2026" oninput="lnFullDocDoSearch(this.value)" '
    + 'style="flex:1;padding:4px 8px;background:var(--field);border:1px solid var(--field-border);'
    + 'border-radius:4px;font-family:var(--ui);font-size:inherit;color:var(--ink);max-width:200px;'
    + (_snCollapsed ? 'display:none' : '') + '">';
  html += '</div>';
  html += '<div id="lnFullDocContent" style="max-height:250px;overflow-y:auto;' + (_snCollapsed ? 'display:none' : '') + '">' + _lnDocHtml + '</div>';
  html += '</div>';

  if (!rec.processed_at) {
    html += '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light);padding:8px 0">Not yet transcribed. Click \u2699 Transcribe in the tab bar.</div>';
  } else {
    // Transcript toggle bar
    const _tm = LessonNotesState.transcriptMode || 'timeline';
    const _hasAlign = session.waAlignments && Object.keys(session.waAlignments).length > 0;
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border)">';
    html += '<span style="font-family:var(--ui);font-size:0.68rem;letter-spacing:0.08em;color:var(--ink-light)">TRANSCRIPT</span>';
    html += '<button class="yoshi-read-btn' + (_tm==='audio'?' active':'') + '" onclick="lnSetTranscriptMode(\'audio\')" style="font-size:0.72rem;padding:3px 10px">\u{1F399} Audio</button>';
    html += '<button class="yoshi-read-btn' + (_tm==='timeline'?' active':'') + '" onclick="lnSetTranscriptMode(\'timeline\')" style="font-size:0.72rem;padding:3px 10px">\u{1F500} Timeline</button>';
    html += '<button id="lnAlignBtn" class="yoshi-read-btn" onclick="lnAlignTimeline()" style="font-size:0.72rem;padding:3px 10px">' + (_hasAlign ? '\u2713 Re-align' : '\u26A1 Align') + '</button>';
    html += '<button id="lnDataCopyBtn" class="yoshi-read-btn" onclick="recBrowserCopyData(LessonNotesState._transcriptRecId)" style="font-size:0.72rem;padding:3px 10px;opacity:0.7">\uD83D\uDCCB Data</button>';
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

  html += '</div>';
  return html;
}

function lessonNotesRenderSourceNotes(session) {
  const _lnEsc = App.escHtml || window.escHtml || function(s){return s;};
  const _lnParseWA = App.yoshiParseWhatsapp || window.yoshiParseWhatsapp;
  const _lnRaw = LessonNotesState.rawText || '';
  let _lnDocHtml = '';
  if (_lnRaw && _lnParseWA) {
    const _lnMsgs = _lnParseWA(_lnRaw);
    _lnDocHtml = _lnMsgs.length ? _lnSourceNotesHtml(_lnMsgs)
      : '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light)">No messages found</div>';
  } else {
    _lnDocHtml = '<pre style="font-family:var(--jp);font-size:inherit;line-height:1.7;white-space:pre-wrap">' + _lnEsc(_lnRaw) + '</pre>';
  }
  let html = '<div>';
  html += '<div id="lnFullDocContent" style="max-height:calc(100vh - 180px);overflow-y:auto">' + _lnDocHtml + '</div>';
  html += '</div>';
  return html;
}

function _lnSourceNotesHtml(messages) {
  const esc = App.escHtml || window.escHtml || function(s){return s;};
  return messages.map(function(m) {
    const isYoshi = !(/paulandres|paul/i.test(m.sender));
    return '<div style="display:flex;gap:10px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04)">'
      + '<span style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light);flex-shrink:0;min-width:44px;padding-top:3px">' + esc(m.time) + '</span>'
      + '<span style="font-family:var(--jp);font-size:inherit;line-height:1.7;color:' + (isYoshi ? 'var(--teal)' : 'var(--ink)') + '">' + esc(m.text) + '</span>'
      + '</div>';
  }).join('');
}

function lnToggleSourceNotes() {
  LessonNotesState.sourceNotesCollapsed = !LessonNotesState.sourceNotesCollapsed;
  const content = document.getElementById('lnFullDocContent');
  const search = document.getElementById('lnFullDocSearch');
  const label = event && event.target;
  if (content) content.style.display = LessonNotesState.sourceNotesCollapsed ? 'none' : '';
  if (search) search.style.display = LessonNotesState.sourceNotesCollapsed ? 'none' : '';
  if (label) label.textContent = (LessonNotesState.sourceNotesCollapsed ? '\u25B6' : '\u25BC') + ' SOURCE NOTES';
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
      + '<span style="font-family:var(--jp);font-size:inherit;line-height:1.7;color:' + (isYoshi ? 'var(--teal)' : 'var(--ink)') + '">' + highlighted + '</span>'
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

  // Overview tab — session summary + links to words/grammar/phrases/recording
  if (LessonNotesState.viewMode === 'overview') {
    return lessonNotesRenderOverview(currentSession);
  }

  // Source notes tab — full WhatsApp lesson notes
  if (LessonNotesState.viewMode === 'sourcenotes') {
    return lessonNotesRenderSourceNotes(currentSession);
  }

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
  if (LessonNotesState.viewMode === 'allwords' || LessonNotesState.viewMode === 'vocab' || LessonNotesState.viewMode === '') {
    const _vocabAll = LessonNotesState.vocab;
    const _hiddenCount = _vocabAll.filter(function(v) { return LessonNotesState.hiddenWords.has(v.word); }).length;
    const _vocab = LessonNotesState.showHidden ? _vocabAll : _vocabAll.filter(function(v) { return !LessonNotesState.hiddenWords.has(v.word); });
    const _half = Math.ceil(_vocab.length / 2);
    function _makeTable(items) {
      const _rows = items.map(function(v) {
        const _w = (v.word||'').replace(/'/g,"\\'");
        const _isHidden = LessonNotesState.hiddenWords.has(v.word);
        return '<tr style="border-bottom:1px solid var(--border);' + (_isHidden ? 'opacity:0.45' : '') + '">'
          + '<td style="padding:6px 10px;color:var(--ink);font-family:var(--jp)">' + (v.word||'') + '</td>'
          + '<td style="padding:6px 10px;color:var(--ink-light);font-family:var(--jp)">' + (v.reading||'—') + '</td>'
          + '<td style="padding:6px 10px;color:var(--ink-light);font-size:inherit;font-family:var(--ui)">' + (v.meaning||v.en||'—') + '</td>'
          + '<td style="padding:6px 4px;white-space:nowrap"><button class="btn-icon" onclick="jpSpeak(\'' + _w + '\')">🔊</button>' + (_isHidden ? '<button class="btn-icon" onclick="lnUnhideWord(\'' + _w + '\')" title="Unhide word">↩️</button>' : '<button class="btn-icon" onclick="lnHideWord(\'' + _w + '\')" title="Hide word">🚫</button>') + '</td>'
          + '</tr>';
      }).join('');
      const _hdr = '<thead style="position:sticky;top:0;background:var(--paper-dark)"><tr style="border-bottom:1px solid var(--border)">'
        + '<th style="text-align:left;padding:8px 10px;font-family:var(--ui);font-size:0.7rem;letter-spacing:0.06em;color:var(--ink-light);font-weight:500">WORD</th>'
        + '<th style="text-align:left;padding:8px 10px;font-family:var(--ui);font-size:0.7rem;letter-spacing:0.06em;color:var(--ink-light);font-weight:500">READING</th>'
        + '<th style="text-align:left;padding:8px 10px;font-family:var(--ui);font-size:0.7rem;letter-spacing:0.06em;color:var(--ink-light);font-weight:500">MEANING</th>'
        + '<th style="width:40px"></th></tr></thead>';
      return '<table style="width:100%;border-collapse:collapse;font-size:inherit">' + _hdr + '<tbody>' + _rows + '</tbody></table>';
    }
    return '<div style="margin-bottom:8px"><button class="btn-icon" style="padding:4px 10px;border:1px solid var(--border);border-radius:6px;font-family:var(--ui);font-size:0.72rem" onclick="lnToggleShowHidden()">' + (LessonNotesState.showHidden ? '🙈 Hide hidden words' : '👁 Show hidden words (' + _hiddenCount + ')') + '</button></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">'
      + '<div style="overflow-y:auto;border:1px solid var(--border);border-radius:6px">' + _makeTable(_vocab.slice(0, _half)) + '</div>'
      + '<div style="overflow-y:auto;border:1px solid var(--border);border-radius:6px">' + _makeTable(_vocab.slice(_half)) + '</div>'
      + '</div>';
  }
  // Recording tab — linked recording player + transcript
  if (LessonNotesState.viewMode === 'recording') {
    return lnRenderLinkedRecording(currentSession);
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
          style="flex:1;padding:8px 12px;background:var(--field);border:1px solid var(--field-border);color:var(--ink);font-family:var(--ui);font-size:inherit;border-radius:6px;outline:none">
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
        style="width:100%;min-height:100px;padding:12px;background:var(--field);border:1px solid var(--field-border);color:var(--ink);font-family:var(--jp);font-size:inherit;line-height:1.7;border-radius:6px;outline:none;resize:vertical">${currentSession?.rawText || ''}</textarea>
      
      <div style="text-align:center;padding:8px 0 0;font-family:var(--ui);font-size:0.72rem;color:var(--ink-light)">
        Drop .docx file here or paste text above
      </div>
    </div>
    
    <div style="text-align:center;padding:30px;color:var(--ink-light);font-family:var(--ui);font-size:inherit">
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
    <div class="panel-section-title" style="flex:1;gap:8px;flex-wrap:wrap;align-items:center">
      <span class="panel-section-title-jp">ヨシ</span>
      <select id="yoshiSessionSelect" onchange="lessonNotesLoadSession(parseInt(this.value));lessonNotesRenderPanel();(App.renderGrammarCoverage||window.renderGrammarCoverage)?.()"
        style="padding:4px 8px;background:var(--field);border:1px solid var(--field-border);color:var(--ink);font-family:var(--ui);font-size:0.75rem;border-radius:4px;max-width:180px">
        <option value="-1">— Select lesson —</option>
        ${sessions.map((s, i) => `<option value="${i}" ${i === _cur.currentIdx ? 'selected' : ''}>${lnSessionDateLabel(s)}</option>`).join('')}
      </select>
      ${currentSession ? `<span style="font-family:var(--ui);font-size:1.15rem;color:var(--ink)">${lnFirstMessageDate(currentSession)}</span>` : ''}
      ${currentSession ? `<button class="btn-icon btn-icon-del" onclick="lessonNotesDeleteFromPanel()">🗑</button>` : ''}
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
      ${hasContent ? `
        <div style="display:flex;gap:4px">

        </div>
        <input type="text" id="lnHeaderSearch" placeholder="Search lesson\u2026" oninput="lnHeaderSearch(this.value)"
          style="padding:6px 10px;background:var(--field);border:1px solid var(--field-border);color:var(--ink);font-family:var(--ui);font-size:0.95rem;border-radius:4px;width:320px">
      ` : ''}
      ${hasContent && _vm !== 'overview' ? `<button class="btn-nav btn-sm" onclick="lessonNotesSetView('overview')">\u2190 Overview</button>` : ''}
    </div>
  `;
}

function lnHeaderSearch(term) {
  if (LessonNotesState.viewMode !== 'sourcenotes') {
    LessonNotesState.viewMode = 'sourcenotes';
    lessonNotesRender();
    setTimeout(function() { lnFullDocDoSearch(term); }, 60);
  } else {
    lnFullDocDoSearch(term);
  }
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

function lnFormatWaDate(raw) {
  if (!raw) return null;
  const parts = raw.split(/[.\/]/).map(p => p.trim());
  if (parts.length === 3) {
    let [d, m, y] = parts;
    if (y.length === 2) y = '20' + y;
    const dt = new Date(+y, +m - 1, +d);
    if (!isNaN(dt.getTime())) return dt.toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'});
  }
  return null;
}

function lnSessionDateLabel(session) {
  const dc = session.docContent || [];
  const first = dc.find(item => item.date);
  if (!first) return session.date || session.title || 'Untitled';
  return lnFormatWaDate(first.date) || first.date;
}

function lnFirstMessageDate(session) {
  const dc = LessonNotesState.docContent || [];
  const first = dc.find(item => item.date);
  if (!first) return (session && session.date) || '';
  return lnFormatWaDate(first.date) || first.date;
}

function lessonNotesRenderOverview(session) {
  if (!session) return '';
  const _vocabCount   = LessonNotesState.vocab.length;
  const _grammarCount = LessonNotesState.grammar.length;
  const _phraseCount  = LessonNotesState.keyPhrases.length;
  const _hasRecording = !!session.linked_recording_id;
  const _summary = LessonNotesState.summary;

  let html = '<div style="max-width:760px;margin:0 auto">';

  if (_summary) {
    html += '<div style="background:var(--paper-dark);border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin-bottom:20px;font-family:var(--ui);font-size:inherit;color:var(--ink);line-height:1.6">' + _summary + '</div>';
  } else {
    html += '<div style="text-align:center;padding:16px;margin-bottom:20px">'
      + '<button class="yoshi-read-btn" onclick="lessonNotesGenerateSummary()">\u2728 Generate summary</button>'
      + '</div>';
  }

  const _storyCount = LessonNotesState.stories.length;

  html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">';
  html += lnOverviewCard('\u{1F4DA}', 'Words', _vocabCount, "lessonNotesSetView('allwords')");
  html += lnOverviewCard('\u{1F4DD}', 'Grammar', _grammarCount, "lessonNotesSetView('grammar')");
  html += lnOverviewCard('\u{1F511}', 'Phrases', _phraseCount, "lessonNotesSetView('keyphrases')");
  html += lnOverviewCard('\u{1F4D6}', 'Stories', _storyCount, "lessonNotesSetView('stories')");
  html += lnOverviewCard('\u{1F4DC}', 'Notes', null, "lessonNotesSetView('sourcenotes')");
  html += lnOverviewCard('\u25B6', _hasRecording ? 'Recording' : 'Link Recording', _hasRecording ? '' : null, _hasRecording ? "lessonNotesSetView('recording')" : "lnShowLinkPicker()");
  html += '</div>';
  html += '</div>';
  return html;
}

function lnHideWord(word) {
  LessonNotesState.hiddenWords.add(word);
  const sessions = lessonNotesGetSessions();
  if (LessonNotesState.currentIdx !== null && sessions[LessonNotesState.currentIdx]) {
    sessions[LessonNotesState.currentIdx].hiddenWords = [...LessonNotesState.hiddenWords];
    lessonNotesSaveSessions(sessions);
  }
  lessonNotesRender();
}

function lnUnhideWord(word) {
  LessonNotesState.hiddenWords.delete(word);
  const sessions = lessonNotesGetSessions();
  if (LessonNotesState.currentIdx !== null && sessions[LessonNotesState.currentIdx]) {
    sessions[LessonNotesState.currentIdx].hiddenWords = [...LessonNotesState.hiddenWords];
    lessonNotesSaveSessions(sessions);
  }
  lessonNotesRender();
}

function lnToggleShowHidden() {
  LessonNotesState.showHidden = !LessonNotesState.showHidden;
  lessonNotesRender();
}

function lnOverviewCard(icon, label, count, onclick) {
  return '<div onclick="' + onclick + '" class="row-hover-border" style="background:var(--paper-dark);border:1px solid var(--border);border-radius:8px;padding:18px;cursor:pointer;text-align:center">'
    + '<div style="font-size:1.6rem;margin-bottom:6px">' + icon + '</div>'
    + '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink)">' + label + (count !== null ? ' (' + count + ')' : '') + '</div>'
    + '</div>';
}

function lessonNotesGenerateSummary() {
  const apiKey = _fy_getApiKey();
  if (!apiKey) { alert('Please set an API key first'); return; }
  const docContent = lessonNotesCleanText(LessonNotesState.docContent);
  if (!docContent) return;
  lessonNotesExtractSummarySilent(docContent, apiKey).then(function() {
    lessonNotesSaveCurrentSession();
    lessonNotesRender();
  });
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
                  <div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light)">${kp.meaning||''}</div>
                  ${kp.example ? `<div style="font-family:var(--jp);font-size:inherit;color:var(--ink);margin-top:8px;padding:8px;background:var(--paper-dark);border-radius:4px">${kp.example}</div>` : ''}
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
          <span style="font-family:var(--ui);font-size:inherit;color:var(--ink-light)">${hiddenCount} hidden</span>
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
            <div onclick="lessonNotesOpenGrammarDetail(${g._idx})" style="font-family:var(--ui);font-size:inherit;color:var(--ink);line-height:1.5;cursor:pointer">${g.explanation || ''}</div>
            ${g.example ? `
              <div onclick="lessonNotesOpenGrammarDetail(${g._idx})" style="margin-top:10px;padding:10px;background:var(--paper-dark);border-radius:4px;border-left:3px solid var(--teal);cursor:pointer">
                <div style="font-family:var(--jp);font-size:inherit;color:var(--ink)">${g.example}</div>
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
  const _sessions = lessonNotesGetSessions();
  if (LessonNotesState.currentIdx !== null && _sessions[LessonNotesState.currentIdx]) {
    _sessions[LessonNotesState.currentIdx].grammarHiddenNodeIds = [...LessonNotesState.grammarHidden]
      .map(i => LessonNotesState.grammar[i]?.grammarNodeIds?.[0])
      .filter(Boolean);
    lessonNotesSaveSessions(_sessions);
  }
  lessonNotesRender();
  lessonNotesRenderPanel();
  (App.renderGrammarCoverage || window.renderGrammarCoverage)?.();
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
          style="width:100%;padding:10px;background:var(--field);border:1px solid var(--field-border);border-radius:6px;font-family:var(--ui);font-size:inherit;color:var(--ink);resize:vertical;box-sizing:border-box">${g.explanation || ''}</textarea>
      </div>
      
      <div style="margin-bottom:14px">
        <label style="display:block;font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-bottom:4px">Example</label>
        <input type="text" id="grammarEditExample" value="${(g.example || '').replace(/"/g, '&quot;')}" 
          style="width:100%;padding:10px;background:var(--field);border:1px solid var(--field-border);border-radius:6px;font-family:'Noto Sans JP',var(--ui);font-size:inherit;color:var(--ink);box-sizing:border-box">
      </div>
      
      <div style="margin-bottom:20px">
        <label style="display:block;font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-bottom:4px">Example Meaning</label>
        <input type="text" id="grammarEditExampleMeaning" value="${(g.exampleMeaning || '').replace(/"/g, '&quot;')}" 
          style="width:100%;padding:10px;background:var(--field);border:1px solid var(--field-border);border-radius:6px;font-family:var(--ui);font-size:inherit;color:var(--ink);box-sizing:border-box">
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
  if (area) area.innerHTML = '<div style="text-align:center;padding:40px;color:var(--ink-light)"><div style="font-size:2em;margin-bottom:12px">⏳</div>Extracting key phrases…</div>';
  
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
${docContent.slice(0, 6000)}` }],
      track: 'lesson'
    });
    
    const text = _fy_claudeText(data) || '[]';
    LessonNotesState.keyPhrases = _lnParseJsonArray(text);
    if (LessonNotesState.currentIdx !== null) {
      const sessions = lessonNotesGetSessions();
      sessions[LessonNotesState.currentIdx].keyPhrases = LessonNotesState.keyPhrases;
      lessonNotesSaveSessions(sessions);
    }
  } catch (e) {
    console.error('[KP] extraction error:', e);
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

  await lessonNotesExtractGrammarSilent(docContent, apiKey);
  lessonNotesPushToGramNotes(LessonNotesState.grammar); // → Grammar Notes panel

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
  
  if (!LessonNotesState.currentLessonId) {
    LessonNotesState.extractionWarning = ['lesson not linked — try again in a moment'];
    console.warn('[lessonNotes] Extraction blocked: currentLessonId not resolved');
    return;
  }
  
  LessonNotesState.extracting = true;
  
  // Update all views
  const area = document.querySelector('#lessonNotesView, #lessonNotesViewMain');
  if (area) area.innerHTML = '<div style="text-align:center;padding:40px;color:var(--ink-light)"><div style="font-size:1.5rem;margin-bottom:8px">⏳</div>Extracting content...<br><span style="font-size:inherit">(vocab, stories, phrases, grammar)</span></div>';
  
  const panelContent = document.getElementById('lessonNotesPanelContent');
  if (panelContent) panelContent.innerHTML = '<div style="text-align:center;padding:60px 20px"><div style="font-size:2rem;margin-bottom:16px">⏳</div><div style="font-family:var(--ui);font-size:1rem;color:var(--teal);margin-bottom:8px">Extracting content...</div><div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light)">Analyzing vocab, stories, phrases, and grammar</div></div>';
  
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

  // Summary
  if (!LessonNotesState.summary) {
    promises.push(lessonNotesExtractSummarySilent(docContent, apiKey));
  }
  
  await Promise.all(promises);
  
  LessonNotesState.extracting = false;
  lessonNotesSaveCurrentSession();
  // Emit LESSON_EXTRACTED so vocab pipeline can pick up new phrases
  try {
    const _phraseCount = (LessonNotesState.keyPhrases || []).length + (LessonNotesState.grammar || []).length;
    (App.AppEvents || window.AppEvents)?.emit(AppEvents.LESSON_EXTRACTED, {
      lessonId: LessonNotesState.currentLessonId || null,
      phraseCount: _phraseCount
    });
  } catch(e) { console.warn('[LN] LESSON_EXTRACTED emit failed:', e); }

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

async function lessonNotesExtractSummarySilent(docContent, apiKey) {
  try {
    const data = await _fy_claudeAPI({
      max_tokens: 200,
      messages: [{ role: 'user', content: `Write a brief 2-3 sentence summary in English of what was covered in this Japanese lesson, based on the notes below. Focus on topics discussed, vocabulary themes, and any grammar points practiced. Plain prose, no headers or lists, no preamble.

Notes:
${docContent.slice(0, 8000)}` }],
      track: 'lesson'
    });
    LessonNotesState.summary = (_fy_claudeText(data) || '').trim();
    console.log('[LN] summary extracted:', LessonNotesState.summary.slice(0, 60) + '...');
  } catch (e) { console.error('Summary extraction error:', e); }
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
- word: the Japanese word in DICTIONARY form (plain form — e.g. 食べる not 食べました, おいしい not おいしかった, kanji if available)
- reading: hiragana reading
- meaning: English translation (YOU must provide this even if not in the notes)
- pos: part of speech, one of: noun, verb, i-adj, na-adj, adverb, expression

Return ONLY a JSON array, no explanation:
[{"word":"病気","reading":"びょうき","meaning":"illness, sickness","pos":"noun","sourceText":"病気（びょうき）です"},{"word":"桜","reading":"さくら","meaning":"cherry blossom","pos":"noun","sourceText":"桜がきれいです"}]

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
    // Write extracted vocab: upsert into words (canonical dictionary, now
    // correctly refreshing reading/meaning on conflict instead of leaving
    // stale values forever), then link vocab_items to it via word_id rather
    // than duplicating reading/meaning as a second, unlinked copy.
    try {
      const _lessonId = LessonNotesState.currentLessonId || null;
      const now = new Date().toISOString();
      for (const v of LessonNotesState.vocab) {
        if (!v.word || !v.meaning) continue;
        let _wordId = null;
        if (v.reading) {
          await window.db.run(
            `INSERT INTO words (word, reading, meaning, level, list_source, lesson_id, source, example, pos)
             VALUES (?,?,?,?,?,?,?,?,?)
             ON CONFLICT(word) DO UPDATE SET
               reading   = excluded.reading,
               meaning   = excluded.meaning,
               lesson_id = COALESCE(excluded.lesson_id, lesson_id),
               source    = COALESCE(excluded.source, source)`,
            [v.word, v.reading, v.meaning, 'custom', 'lesson', _lessonId, 'lesson', v.sourceText || null, v.pos || null]
          );
          const _wordRow = await window.db.get('SELECT id FROM words WHERE word = ?', [v.word]);
          _wordId = _wordRow?.id || null;
        }
        await window.db.run(
          `INSERT OR IGNORE INTO vocab_items (word, reading, meaning, source, source_ref, type, pos, encounter_at, entry_weight, created_at, word_id)
           VALUES (?, ?, ?, 'yoshi_vocab', ?, 'word', ?, ?, 1.0, ?, ?)`,
          [v.word, v.reading || null, v.meaning, _lessonId ? String(_lessonId) : null, (v.word.includes('〜') || v.word.includes('~')) ? 'fragment' : (v.pos || null), now, now, _wordId]
        );
      }
      console.log('[LN] vocab written to words + vocab_items:', LessonNotesState.vocab.length, 'words');
    } catch(e) { console.warn('[LN] vocab write failed:', e.message); }
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
Return JSON array: [{"phrase":"Japanese phrase","meaning":"English meaning","example":"optional example sentence","sourceText":"the exact line from the notes where this phrase appeared","group":"group name","type":"phrase"}]
type must be one of: "word" (single vocabulary item), "phrase" (conversational expression or set phrase), "grammar" (grammatical pattern, often contains 〜 or describes a verb/sentence structure)
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
            'INSERT INTO lesson_phrases (lesson_id, phrase, meaning, example, type) VALUES (?,?,?,?,?)',
            [_lessonId, p.phrase, p.meaning, p.example || null, p.type || 'phrase']
          );
        }
        console.log('[LN] phrases written to SQL:', LessonNotesState.keyPhrases.length);
      } catch(e) { console.warn('[LN] phrases SQL write failed:', e.message); }
    }
  } catch (e) { console.error('Key phrases extraction error:', e); }
}

async function lessonNotesExtractGrammarSilent(docContent, apiKey) {
  (App.Storage || window.Storage).setJSON(STORAGE_KEYS.GRAMMAR_GOLD_DISMISSED, []);
  try {
    let nodeList = '';
    try {
      if (typeof GrammarModel !== 'undefined') {
        if (!GrammarModel.loaded) await GrammarModel.load();
        nodeList = GrammarModel.getCoverageMap()
          .map(n => `${n.id} (${n.label}, Genki ch.${n.genki})`)
          .join(', ');
      }
    } catch (e) { nodeList = ''; }
    let prompt = `Analyze these Japanese lesson notes and identify grammatical patterns that a learner should understand. Don't just look for explicitly labeled grammar — analyze the Japanese sentences themselves to find:

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
[{"pattern":"grammar pattern name","explanation":"clear explanation in English of how it works","example":"actual example from the lesson text","exampleMeaning":"English translation","group":"group name","grammarNodeIds":["node_id"]}]

Find at least 5-8 grammar points. Look at EVERY Japanese sentence for grammar worth highlighting.

${nodeList ? "GRAMMAR NODE IDs — use ONLY these exact IDs:\n" + nodeList + "\n\nFor each grammar point, grammarNodeIds must contain matching IDs from this list only. Empty array if none match.\n\n" : ""}Lesson content:
${docContent.slice(0, 10000)}`;
    console.log('[LN] prompt node list length:', nodeList.length);
    const data = await _fy_claudeAPI({
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    ,
      track: 'lesson'
    });
    const text = _fy_claudeText(data) || '[]';
    LessonNotesState.grammar = _lnParseJsonArray(text);
    console.log('[LN] grammar extracted:', LessonNotesState.grammar.length, 'patterns', LessonNotesState.grammar.slice(0,3).map(g=>g.pattern||'?'));
    // Write grammar patterns to lesson_phrases with type='grammar'
    try {
      const _lessonId = LessonNotesState.currentLessonId || null;
      const _rows = LessonNotesState.grammar.filter(g => g.pattern && g.explanation).slice(0, 50);
      if (_rows.length) {
        const _params = _rows.flatMap(g => [(g.grammarNodeIds && g.grammarNodeIds[0]) || null, _lessonId, g.pattern, g.explanation, g.example || null, 'grammar']);
        const _values = _rows.map(() => '(?,?,?,?,?,?)').join(',');
        await window.db.run(
          'INSERT INTO lesson_phrases (node_id, lesson_id, phrase, meaning, example, type) VALUES ' + _values,
          _params
        );
      }
      console.log('[LN] grammar patterns written to lesson_phrases:', _rows.length);
      const nodeIds = [...new Set(LessonNotesState.grammar.flatMap(g => g.grammarNodeIds || []))];
      await window.db.run(
        'UPDATE lesson_sessions SET extracted_grammar=?, raw_content=? WHERE id=?',
        [JSON.stringify(nodeIds), LessonNotesState.rawText || docContent, _lessonId]
      );
      console.log('[LN] extracted_grammar written:', nodeIds.length, 'node IDs');
    } catch(e) { console.warn('[LN] grammar SQL write failed:', e.message); }
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
  sessions[LessonNotesState.currentIdx].summary = LessonNotesState.summary;
  
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
            <div style="font-family:var(--ui);font-size:inherit;color:var(--ink);line-height:1.5;white-space:pre-wrap">${LessonNotesState.grammarDrillFeedback}</div>
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
      <div style="font-family:var(--ui);font-size:inherit;color:var(--ink);white-space:pre-wrap">${msg.content}</div>
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
          ${grammar.exampleMeaning ? `<div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light);margin-top:4px">→ ${grammar.exampleMeaning}</div>` : ''}
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
    if (LessonNotesState.lnFuriOn && seg.reading && hasKanji(w) && !(App.furiganaIsExcluded || window.furiganaIsExcluded || (()=>false))(w)) {
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
    return `<div class="qr-reader-box"><div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light);padding:20px 0">No session vocab found in this story.</div></div>`;
  }
  const rows = matched.map(v => {
    const word = (v.word || '').replace(/'/g, "\\'");
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:6px 10px;color:var(--ink);font-family:var(--jp)">${v.word || ''}</td>
      <td style="padding:6px 10px;color:var(--ink-light);font-family:var(--jp)">${v.reading || '\u2014'}</td>
      <td style="padding:6px 10px;color:var(--ink-light);font-size:inherit;font-family:var(--ui)">${v.meaning || v.en || '\u2014'}</td>
      <td style="padding:6px 4px"><button class="btn-icon" onclick="jpSpeak('${word}')">\uD83D\uDD0A</button></td>
    </tr>`;
  }).join('');
  return `
    <div class="qr-reader-box">
      <div style="border:1px solid var(--border);border-radius:6px;overflow-y:auto;max-height:60vh">
        <table style="width:100%;border-collapse:collapse;font-size:inherit">
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
        style="width:100%;min-height:300px;padding:12px;background:var(--field);border:1px solid var(--field-border);color:var(--ink);font-family:var(--ui);font-size:inherit;line-height:1.6;border-radius:6px;outline:none;resize:vertical">${esc(story.notes)}</textarea>
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
        style="width:100%;padding:8px 12px;background:var(--field);border:1px solid var(--field-border);color:var(--ink);font-family:var(--ui);font-size:inherit;border-radius:6px;outline:none;margin-bottom:12px">
      <label style="display:block;font-family:var(--ui);font-size:0.72rem;color:var(--ink-light);margin-bottom:4px">Text</label>
      <textarea id="lnStoryEditText"
        style="width:100%;min-height:260px;padding:12px;background:var(--field);border:1px solid var(--field-border);color:var(--ink);font-family:var(--jp);font-size:inherit;line-height:1.8;border-radius:6px;outline:none;resize:vertical">${esc(story.text)}</textarea>
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
        <button class="qr-btn-sec ${LessonNotesState.lnFuriOn?'active':''}" onclick="lessonNotesToggleFuri()" style="padding:5px 12px;font-size:inherit;${LessonNotesState.lnFuriOn?'color:var(--teal);border-color:var(--teal)':''}">ふり仮名</button>
        <button id="lnSpeakBtn" class="qr-btn-sec" onclick="lessonNotesToggleSpeak()" title="Read aloud / Stop">🔊 Read</button>
        <button class="qr-btn-sec btn-copy" onclick="lessonNotesCopyStory()" title="Copy text without furigana">Copy</button>
      </div>
      ${LessonNotesState.lnRecordMode === 'sentence' ? '' : `
      <div id="lnStoryReader">
        <span style="color:var(--ink-light);font-family:var(--ui);font-size:inherit">Parsing...</span>
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
            <button id="lnRecordBtn" class="qr-btn-sec" onclick="lessonNotesToggleRecording()" style="padding:5px 12px;font-size:inherit;${LessonNotesState.lnIsRecording?'background:var(--red);color:white;border-color:var(--red)':''}">
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
                <span style="color:var(--ink-light);font-size:inherit">Loading...</span>
              </div>
            </div>
            
            <!-- Sentence controls -->
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
              <button class="qr-btn-sec" onclick="lnPrevSentence()" ${LessonNotesState.lnCurrentSentence === 0 ? 'disabled' : ''}>← Prev</button>
              <button class="qr-btn-sec" onclick="lnRecordSentence()" style="padding:5px 12px;font-size:inherit;${LessonNotesState.lnIsRecording?'background:var(--red);color:white;border-color:var(--red)':''}">
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
    const EXCLUDED = (App.furiganaIsExcluded || window.furiganaIsExcluded || (()=>false))(seg.word);
    if (needsRuby && !EXCLUDED) {
      return `<ruby>${seg.word}<rt>${seg.reading}</rt></ruby>`;
    }
    return seg.word;
  }).join('');
  
  display.innerHTML = html;
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


Object.assign(App, {
  yoshiParseWhatsapp,
});

// ── turn_id population via Damerau-Levenshtein ───────────────────────────────
// Matches lesson_phrases to transcript_turns for a linked session pair.
// Only updates rows where a confident match is found (distance ≤ threshold).

function _dlDistance(a, b) {
  const la = a.length, lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  const d = Array.from({length: la + 1}, (_, i) => Array.from({length: lb + 1}, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + cost);
      if (i > 1 && j > 1 && a[i-1] === b[j-2] && a[i-2] === b[j-1]) {
        d[i][j] = Math.min(d[i][j], d[i-2][j-2] + cost);
      }
    }
  }
  return d[la][lb];
}

async function lnPopulateTurnIds(waLessonId, recSessionId) {
  if (!window.db) return;
  try {
    const phrases = await window.db.query(
      `SELECT id, phrase FROM lesson_phrases WHERE lesson_id=? AND turn_id IS NULL AND type != 'grammar'`,
      [waLessonId]
    );
    if (!phrases.length) { console.log('[lnTurnIds] no phrases to match'); return; }

    const turns = await window.db.query(
      `SELECT id, content FROM transcript_turns WHERE session_id=? AND content IS NOT NULL`,
      [recSessionId]
    );
    if (!turns.length) { console.log('[lnTurnIds] no turns found'); return; }

    let matched = 0;
    for (const p of phrases) {
      const needle = (p.phrase || '').slice(0, 20); // compare on first 20 chars
      if (!needle) continue;
      let bestId = null, bestDist = Infinity;
      for (const t of turns) {
        const hay = (t.content || '').slice(0, 40);
        const dist = _dlDistance(needle, hay.slice(0, needle.length + 4));
        if (dist < bestDist) { bestDist = dist; bestId = t.id; }
      }
      // Threshold: distance ≤ 3 or ≤ 30% of phrase length
      const threshold = Math.max(3, Math.floor(needle.length * 0.3));
      if (bestId && bestDist <= threshold) {
        await window.db.run('UPDATE lesson_phrases SET turn_id=? WHERE id=?', [bestId, p.id]);
        matched++;
      }
    }
    console.log(`[lnTurnIds] matched ${matched}/${phrases.length} phrases to turns`);
  } catch(e) { console.error('[lnTurnIds]', e.message); }
}

Object.assign(App, { lnPopulateTurnIds });
