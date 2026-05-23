// ── UI, issues, file management, chat display ────────────────────────────────

async function init() {
  // Load API key from main app storage
  try {
    const raw = await window.db.query("SELECT value FROM kv_store WHERE key = 'jpStudioApiKey'");
    apiKey = raw?.[0]?.value || localStorage.getItem('jpStudioApiKey') || '';
  } catch(e) {}

  // Load issues from storage
  try {
    const raw = await window.db.query("SELECT value FROM kv_store WHERE key = ?", [STORAGE_KEY]);
    if (raw?.[0]?.value) issues = JSON.parse(raw[0].value);
  } catch(e) {}
  if (!issues.length) {
    try { issues = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch(e) {}
  }

  // Load file tree
  try { allFiles = await window.files?.list() || []; } catch(e) {}
  // Fallback: use known project files
  if (!allFiles.length) {
    allFiles = [
      {type:'file', path:'src/core.js', name:'core.js'},
      {type:'file', path:'src/features-voice.js', name:'features-voice.js'},
      {type:'file', path:'src/features-grammar.js', name:'features-grammar.js'},
      {type:'file', path:'src/IssueTracker.js', name:'IssueTracker.js'},
      {type:'file', path:'index.html', name:'index.html'},
      {type:'file', path:'main.js', name:'main.js'},
      {type:'file', path:'context.md', name:'context.md'},
    ];
  }

  // Auto-load context.md
  await loadFile('context.md');

  renderIssueList();
}

function quickAdd() {
  const input = document.getElementById('quickInput');
  const title = input.value.trim();
  if (!title) return;
  const type     = document.getElementById('quickType').value;
  const priority = document.getElementById('quickPriority').value;
  issues.unshift({
    id: Date.now(), title, description: '', type, priority,
    status: 'open', createdAt: new Date().toISOString()
  });
  saveIssues();
  input.value = '';
  renderIssueList();
}

function deleteIssue(id) {
  issues = issues.filter(i => i.id !== id);
  selected.delete(id);
  saveIssues();
  if (activeIssue?.id === id) { activeIssue = null; resetChat(); }
  renderIssueList();
  updateGroupBar();
}

function toggleSelect(id, checked) {
  if (checked) selected.add(id); else selected.delete(id);
  updateGroupBar();
}

function clearSelection() {
  selected.clear();
  renderIssueList();
  updateGroupBar();
}

function updateGroupBar() {
  const bar = document.getElementById('group-bar');
  const n = selected.size;
  bar.style.display = n >= 2 ? 'flex' : 'none';
  document.getElementById('group-count').textContent = `${n} selected`;
}

function renderIssueList() {
  const el = document.getElementById('issue-list');
  if (!issues.length) {
    el.innerHTML = '<div style="padding:20px;text-align:center;font-size:0.78rem;color:var(--ink-light)">No issues yet</div>';
    return;
  }
  el.innerHTML = issues.filter(i => i.status === 'open' || i.status === 'inprogress').map(issue => {
    const t = TYPES[issue.type] || TYPES.bug;
    const p = PRIORITIES[issue.priority] || PRIORITIES.medium;
    const isActive = activeIssue?.id === issue.id;
    const isSelected = selected.has(issue.id);
    return `<div class="issue-item${isActive ? ' selected' : ''}" onclick="activateIssue(${issue.id})">
      <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation();toggleSelect(${issue.id},this.checked)">
      <div style="flex:1;min-width:0;cursor:pointer">
        <div class="issue-title">${esc(issue.title)}</div>
        ${issue.description ? `<div style="font-size:0.72rem;color:var(--ink-light);margin-top:3px;line-height:1.4;white-space:pre-wrap">${esc(issue.description.slice(0,120))}${issue.description.length>120?'…':''}</div>` : ''}
        <div class="issue-meta">
          <span class="issue-tag" style="color:${t.color}">${t.emoji} ${t.label}</span>
          <span class="issue-tag" style="color:${p.color}">${p.label}</span>
          ${issue.panel ? `<span class="issue-tag" style="color:var(--ink-light)">${esc(issue.panel)}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;flex-shrink:0">
        <button onclick="event.stopPropagation();editIssue(${issue.id})" style="background:none;border:1px solid var(--border);border-radius:3px;color:var(--ink-light);cursor:pointer;font-size:0.65rem;padding:2px 5px" title="Edit">✎</button>
        <button onclick="event.stopPropagation();deleteIssue(${issue.id})" style="background:none;border:none;color:var(--ink-light);cursor:pointer;font-size:0.75rem;padding:2px 4px" title="Delete">✕</button>
      </div>
    </div>`;
  }).join('');
}

async function loadFile(filePath) {
  if (loadedFiles[filePath]) return true; // already loaded
  try {
    const result = await window.files?.read(filePath);
    if (result?.content) {
      loadedFiles[filePath] = result.content;
      renderLoadedFiles();
      return true;
    }
  } catch(e) {}
  return false;
}

function removeFile(filePath) {
  delete loadedFiles[filePath];
  renderLoadedFiles();
}

function renderLoadedFiles() {
  const el = document.getElementById('files-loaded');
  el.innerHTML = Object.keys(loadedFiles).map(f =>
    `<span class="file-chip" onclick="removeFile('${f}')" title="Click to remove">${f.split('/').pop()}</span>`
  ).join('');
}

function openFilePicker() {
  renderFileTree('');
  document.getElementById('file-modal').classList.add('open');
  document.getElementById('file-search').value = '';
  document.getElementById('file-search').focus();
}

function closeFilePicker() {
  document.getElementById('file-modal').classList.remove('open');
}

function renderFileTree(filter = '') {
  const el = document.getElementById('file-tree');
  const f  = filter.toLowerCase();
  const files = allFiles.filter(e => e.type === 'file' && (!f || e.path.toLowerCase().includes(f)));
  el.innerHTML = files.map(e => {
    const loaded = !!loadedFiles[e.path];
    return `<div class="file-entry${loaded ? '" style="color:var(--teal)' : ''}" onclick="toggleFileLoad('${e.path}')">
      ${loaded ? '✓' : '○'} ${e.path}
    </div>`;
  }).join('');
}

async function toggleFileLoad(filePath) {
  if (loadedFiles[filePath]) { removeFile(filePath); }
  else { await loadFile(filePath); }
  renderFileTree(document.getElementById('file-search').value);
}

function resetChat() {
  conversation = [];
  document.getElementById('thread').innerHTML = `
    <div id="empty-state">
      <p>Pick an issue from the left to start a fix session, or add a new one above.</p>
    </div>`;
  document.getElementById('chat-title').textContent = 'Select an issue to start';
}

async function activateIssue(id) {
  activeIssue = issues.find(i => i.id === id);
  if (!activeIssue) return;
  renderIssueList();

  const t = TYPES[activeIssue.type] || TYPES.bug;
  document.getElementById('chat-title').textContent = `${t.emoji} ${activeIssue.title}`;

  // Load relevant files silently
  const autoFiles = guessRelevantFiles(activeIssue);
  for (const f of autoFiles) await loadFile(f);

  // Show preview — don't start Claude yet
  conversation = [];
  const thread = document.getElementById('thread');
  thread.innerHTML = '';

  const fileList = Object.keys(loadedFiles).map(f => f.split('/').pop()).join(', ');
  thread.innerHTML = `
    <div class="msg system" style="max-width:100%;text-align:left;padding:16px">
      <div style="font-size:0.88rem;color:var(--ink);margin-bottom:8px"><strong>${esc(t.emoji + ' ' + activeIssue.title)}</strong></div>
      ${activeIssue.description ? `<div style="font-size:0.82rem;color:var(--ink-light);margin-bottom:10px;line-height:1.5">${esc(activeIssue.description)}</div>` : ''}
      <div style="font-size:0.75rem;color:var(--ink-light);margin-bottom:14px">Files loaded: ${esc(fileList)}</div>
      <div style="display:flex;gap:8px">
        <button onclick="startSession()" style="padding:7px 18px;background:var(--teal);border:none;border-radius:5px;color:var(--paper);font-size:0.82rem;font-weight:600;cursor:pointer">▶ Start session</button>
        <button onclick="document.getElementById('thread').innerHTML='';activeIssue=null;renderIssueList()" style="padding:7px 14px;background:none;border:1px solid var(--border);border-radius:5px;color:var(--ink-light);font-size:0.82rem;cursor:pointer">Cancel</button>
      </div>
    </div>`;
}

async function startSession() {
  if (!activeIssue) return;
  const thread = document.getElementById('thread');
  thread.innerHTML = '<div style="padding:12px;font-family:var(--ui);font-size:0.78rem;color:var(--ink-light)">Loading files…</div>';
  pendingDiffs = {};

  // Re-load all relevant files fresh so diffs match actual content
  const autoFiles = guessRelevantFiles(activeIssue);
  for (const f of autoFiles) { try { await loadFile(f); } catch(e) {} }
  thread.innerHTML = '';

  const firstMsg = buildFirstMessage(activeIssue);
  addMessage('user', firstMsg, true);
  conversation.push({ role: 'user', content: firstMsg });
  await streamReply();
}

function editIssue(id) {
  const issue = issues.find(i => i.id === id);
  if (!issue) return;
  // Show inline editor in the thread panel
  activeIssue = issue;
  renderIssueList();
  document.getElementById('chat-title').textContent = `✎ Editing: ${issue.title}`;
  const thread = document.getElementById('thread');
  const t = TYPES[issue.type] || TYPES.bug;
  thread.innerHTML = `
    <div style="padding:16px;display:flex;flex-direction:column;gap:10px">
      <input id="edit-title" value="${esc(issue.title)}"
        style="padding:7px 10px;background:var(--field);border:1px solid var(--field-border);border-radius:5px;color:var(--ink);font-family:var(--ui);font-size:0.84rem;width:100%">
      <textarea id="edit-desc" rows="4" style="padding:7px 10px;background:var(--field);border:1px solid var(--field-border);border-radius:5px;color:var(--ink);font-family:var(--ui);font-size:0.82rem;resize:vertical;width:100%">${esc(issue.description || '')}</textarea>
      <div style="display:flex;gap:8px">
        <select id="edit-type" style="padding:5px 8px;background:var(--field);border:1px solid var(--field-border);border-radius:4px;color:var(--ink);font-family:var(--ui);font-size:0.78rem">
          ${Object.entries(TYPES).map(([k,v]) => `<option value="${k}" ${issue.type===k?'selected':''}>${v.emoji} ${v.label}</option>`).join('')}
        </select>
        <select id="edit-priority" style="padding:5px 8px;background:var(--field);border:1px solid var(--field-border);border-radius:4px;color:var(--ink);font-family:var(--ui);font-size:0.78rem">
          ${Object.entries(PRIORITIES).map(([k,v]) => `<option value="${k}" ${issue.priority===k?'selected':''}>${v.label}</option>`).join('')}
        </select>
        <button onclick="saveEditIssue(${id})" style="padding:5px 16px;background:var(--teal);border:none;border-radius:4px;color:var(--paper);font-size:0.78rem;font-weight:600;cursor:pointer">Save</button>
        <button onclick="activateIssue(${id})" style="padding:5px 12px;background:none;border:1px solid var(--border);border-radius:4px;color:var(--ink-light);font-size:0.78rem;cursor:pointer">Cancel</button>
      </div>
    </div>`;
  document.getElementById('edit-title').focus();
}

function saveEditIssue(id) {
  const issue = issues.find(i => i.id === id);
  if (!issue) return;
  issue.title       = document.getElementById('edit-title').value.trim() || issue.title;
  issue.description = document.getElementById('edit-desc').value.trim();
  issue.type        = document.getElementById('edit-type').value;
  issue.priority    = document.getElementById('edit-priority').value;
  saveIssues();
  activateIssue(id);
}

function setMode(m) {
  mode = m;
  document.getElementById('tabFix').classList.toggle('active', m === 'fix');
  document.getElementById('tabTriage').classList.toggle('active', m === 'triage');
  document.getElementById('tabAudit').classList.toggle('active', m === 'audit');
}

function addMessage(role, content, hidden = false) {
  if (hidden) return;
  const thread = document.getElementById('thread');
  const el = document.createElement('div');
  el.className = `msg ${role}`;

  // Parse diff blocks in assistant messages
  if (role === 'assistant') {
    el.innerHTML = parseDiffs(content);
  } else {
    el.textContent = content;
  }

  thread.appendChild(el);
  thread.scrollTop = thread.scrollHeight;
}

async function reloadMain() {
  try { await window.mgmt?.reloadMain(); } catch(e) {}
  const btn = document.getElementById('reloadBtn');
  btn.textContent = '✓ Reloading…';
  setTimeout(() => { btn.textContent = '↺ Reload app'; }, 2000);
}

async function runAudit() {
  setMode('audit');
  document.getElementById('chat-title').textContent = '🔍 Project Audit';
  const thread = document.getElementById('thread');
  thread.innerHTML = '<div class="msg system">Reading project files…</div>';

  const report = [];
  const errors = [];

  // 1. File inventory
  let fileList = [];
  try { fileList = await window.files?.list() || []; } catch(e) {}
  const jsFiles  = fileList.filter(f => f.type === 'file' && f.name.endsWith('.js') && !f.path.includes('node_modules'));
  const htmlFiles = fileList.filter(f => f.type === 'file' && f.name.endsWith('.html'));
  const allSrc   = [...jsFiles, ...htmlFiles];

  report.push('# Japanese Studio — Project Audit');
  report.push(`Generated: ${new Date().toLocaleString()}`);
  report.push(`Total JS files: ${jsFiles.length} | HTML files: ${htmlFiles.length}`);
  report.push('');

  // 2. Load order from index.html
  report.push('## Load order (from index.html)');
  try {
    const idx = await window.files?.read('index.html');
    if (idx?.content) {
      const scripts = [...idx.content.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);
      scripts.forEach(s => report.push(`  ${s}`));
    }
  } catch(e) { errors.push('index.html read failed: ' + e.message); }
  report.push('');

  // 3. Per-file analysis
  report.push('## File analysis');
  const fileData = {};
  for (const f of allSrc) {
    try {
      const result = await window.files?.read(f.path);
      if (!result?.content) continue;
      const src = result.content;
      fileData[f.path] = src;

      const functions  = [...src.matchAll(/^(?:async )?function (\w+)/gm)].map(m => m[1]);
      const windowExps = [...src.matchAll(/window\['(\w+)'\]\s*=/g)].map(m => m[1]);
      const windowDot  = [...src.matchAll(/window\.(\w+)\s*=/g)].map(m => m[1]);
      const ipcHandles = [...src.matchAll(/ipcMain\.handle\('([^']+)'/g)].map(m => m[1]);
      const ipcInvokes = [...src.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map(m => m[1]);
      const globals    = [...src.matchAll(/^(?:let|var|const) (\w+)/gm)].map(m => m[1]);
      const iifes      = (src.match(/\(\s*function\s*\(/g) || []).length +
                         (src.match(/\(\s*\(\s*\)\s*=>/g) || []).length;
      const lines      = src.split('\n').length;

      report.push(`### ${f.path} (${lines} lines)`);
      if (functions.length)  report.push(`  Functions: ${functions.slice(0,30).join(', ')}${functions.length > 30 ? ` +${functions.length-30} more` : ''}`);
      if (globals.length)    report.push(`  Top-level vars: ${globals.slice(0,20).join(', ')}${globals.length > 20 ? ` +${globals.length-20} more` : ''}`);
      if (windowExps.length || windowDot.length) report.push(`  window[] exports: ${[...windowExps,...windowDot].join(', ')}`);
      if (ipcHandles.length) report.push(`  IPC handles: ${ipcHandles.join(', ')}`);
      if (ipcInvokes.length) report.push(`  IPC invokes: ${ipcInvokes.join(', ')}`);
      if (iifes > 0)         report.push(`  IIFEs: ${iifes}`);
      report.push('');
    } catch(e) {
      errors.push(`${f.path}: ${e.message}`);
    }
  }

  // 4. Cross-file dependency check — functions called but not defined locally
  report.push('## Cross-file calls (sample)');
  const allFunctions = new Set();
  for (const src of Object.values(fileData)) {
    [...src.matchAll(/^(?:async )?function (\w+)/gm)].forEach(m => allFunctions.add(m[1]));
  }
  report.push(`  Total functions defined: ${allFunctions.size}`);
  report.push('');

  if (errors.length) {
    report.push('## Errors during audit');
    errors.forEach(e => report.push(`  - ${e}`));
  }

  const markdown = report.join('\n');

  // Show in thread with copy button
  thread.innerHTML = `
    <div style="padding:16px;display:flex;flex-direction:column;gap:10px;height:100%">
      <div style="display:flex;gap:8px;align-items:center">
        <span style="font-size:0.82rem;color:var(--ink-light)">Audit complete — ${allSrc.length} files analysed</span>
        <button onclick="navigator.clipboard.writeText(document.getElementById('auditOutput').value)"
          style="padding:4px 12px;background:none;border:1px solid var(--teal);border-radius:4px;color:var(--teal);font-size:0.75rem;cursor:pointer">
          Copy markdown
        </button>
        <button onclick="saveAudit(document.getElementById('auditOutput').value)"
          style="padding:4px 12px;background:none;border:1px solid var(--border);border-radius:4px;color:var(--ink-light);font-size:0.75rem;cursor:pointer">
          Save to disk
        </button>
      </div>
      <textarea id="auditOutput" readonly
        style="flex:1;padding:12px;background:var(--paper-dark);border:1px solid var(--border);border-radius:6px;color:var(--ink);font-family:monospace;font-size:0.72rem;line-height:1.5;resize:none;white-space:pre"
      >${esc(markdown)}</textarea>
    </div>`;
}

async function saveAudit(content) {
  const ts = new Date().toISOString().slice(0,10);
  const ok = await window.files?.write(`audit-${ts}.md`, content);
  if (ok?.ok) addMessage('system', `✓ Saved to audit-${ts}.md in project root`);
}

async function openDebug() {
  setMode('debug');
  document.getElementById('chat-title').textContent = '🐛 Debug';
  const thread = document.getElementById('thread');

  // Capture app state from main window via mgmt bridge
  let appState = {};
  try {
    const stateJs = `(function() {
      const s = window.LessonNotesState || {};
      return {
        currentPanel: document.querySelector('.panel.active')?.id || '',
        lessonNotes: { currentIdx: s.currentIdx, vocabLen: (s.vocab||[]).length, grammarLen: (s.grammar||[]).length, viewMode: s.viewMode, transcriptMode: s.transcriptMode },
        kvCacheKeys: Object.keys(window._kvCache || {}).slice(0, 20),
        consoleErrors: window._lastErrors || [],
        sessionCount: (window._lessonRecordingSessions||[]).length,
        openAIKey: !!(window.Storage?.getOpenAIKey?.()),
        apiKey: !!(window.Storage?.getApiKey?.()),
      };
    })()`;
    appState = await window.mgmt?.evalInMain?.(stateJs) || {};
  } catch(e) { appState = { error: e.message }; }

  thread.innerHTML = `
    <div style="padding:16px;display:flex;flex-direction:column;gap:12px">
      <div style="font-family:var(--ui);font-size:0.78rem;color:var(--ink-light)">Current app state:</div>
      <pre style="background:var(--paper-dark);border:1px solid var(--border);border-radius:6px;padding:12px;font-size:0.72rem;color:var(--ink);overflow:auto;max-height:200px">${esc(JSON.stringify(appState, null, 2))}</pre>
      <div style="font-size:0.78rem;color:var(--ink-light)">Describe what's broken or what you want to build:</div>
    </div>`;

  // Auto-inject state into conversation
  conversation = [];
  const stateMsg = `Current app state at time of debug:\n${JSON.stringify(appState, null, 2)}`;
  conversation.push({ role: 'user', content: stateMsg });
  conversation.push({ role: 'assistant', content: 'I can see the current app state. What\'s the issue you want to debug or feature you want to build?' });

  addMessage('system', `App state captured — ${Object.keys(appState).length} fields. Describe the problem below.`);
}

async function runCheckSyntax() {
  const btn = document.getElementById('checkBtn');
  if (btn) { btn.textContent = '⏳ Running…'; btn.disabled = true; }
  try {
    const result = await window.mgmt?.runCheckSyntax?.();
    if (!result) throw new Error('mgmt.runCheckSyntax not available — update main.js');
    const lines = (result.output || '').trim().split('\n');
    const summary = lines.filter(l => l.includes('Audit') || l.includes('Index') || l.includes('Cache') || l.includes('Syntax') || l.includes('error')).join('\n') || lines.slice(-3).join('\n');
    const thread = document.getElementById('thread');
    const el = document.createElement('div');
    el.className = 'msg system';
    el.style.cssText = 'max-width:100%;text-align:left;padding:10px 14px;font-family:monospace;font-size:0.72rem;white-space:pre-wrap;color:' + (result.ok ? 'var(--teal)' : 'var(--red)');
    el.textContent = (result.ok ? '✓ ' : '✗ ') + summary;
    thread.appendChild(el);
    thread.scrollTop = thread.scrollHeight;
    if (btn) { btn.textContent = result.ok ? '✓ Done' : '✗ Errors'; btn.disabled = false; setTimeout(() => { btn.textContent = '⚙ check-syntax'; }, 3000); }
  } catch(e) {
    if (btn) { btn.textContent = '✗ Failed'; btn.disabled = false; setTimeout(() => { btn.textContent = '⚙ check-syntax'; }, 3000); }
    addMessage('system', 'check-syntax failed: ' + e.message);
  }
}

function searchIndex(query) {
  if (!loadedFiles['index.json']) return [];
  try {
    const index = JSON.parse(loadedFiles['index.json']);
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    return index.filter(e => {
      const hay = (e.name + ' ' + e.desc + ' ' + e.file).toLowerCase();
      return terms.every(t => hay.includes(t));
    }).slice(0, 20);
  } catch(e) { return []; }
}
// ── Boot ────────────────────────────────────────────────────────────────────
init();
