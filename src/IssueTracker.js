// ═══════════════════════════════════════════════════════
// ISSUE TRACKER
// Logs bugs, feature requests, and improvements.
// Stored in localStorage. Generates prompts for fixing.
// ═══════════════════════════════════════════════════════

const IssueTracker = (() => {

  const STORAGE_KEY = 'jpStudioIssues';
  const TYPES = {
    bug:         { emoji: '🐛', label: 'Bug',         color: 'var(--red)' },
    feature:     { emoji: '✨', label: 'Feature',     color: 'var(--teal)' },
    improvement: { emoji: '🔧', label: 'Improvement', color: 'var(--gold)' },
    unclear:     { emoji: '❓', label: 'Unclear',     color: 'var(--ink-light)' },
  };
  const PRIORITIES = {
    high:   { label: 'High',   color: 'var(--red)' },
    medium: { label: 'Medium', color: 'var(--gold)' },
    low:    { label: 'Low',    color: 'var(--ink-light)' },
  };
  const STATUS = {
    open:       { label: 'Open',       color: 'var(--teal)' },
    inprogress: { label: 'In Progress',color: 'var(--gold)' },
    done:       { label: 'Done',       color: 'var(--ink-light)' },
    wontfix:    { label: "Won't Fix",  color: 'var(--ink-light)' },
  };

  // ── Storage ────────────────────────────────────────────
  // Uses Storage module (SQLite via kvAPI) — survives app reinstalls

  function load() {
    try {
      // Migrate from localStorage if present
      const legacy = localStorage.getItem(STORAGE_KEY);
      if (legacy) {
        const issues = JSON.parse(legacy);
        if (issues.length) {
          Storage.set(STORAGE_KEY, legacy);
          localStorage.removeItem(STORAGE_KEY);
          return issues;
        }
        localStorage.removeItem(STORAGE_KEY);
      }
      const raw = Storage.get(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    }
    catch { return []; }
  }

  function save(issues) {
    Storage.set(STORAGE_KEY, JSON.stringify(issues));
  }

  function getAll() { return load(); }

  function add(title, description, type = 'bug', priority = 'medium', panel = '') {
    const issues = load();
    const issue = {
      id:          Date.now(),
      title:       title.trim(),
      description: description.trim(),
      type,
      priority,
      status:      'open',
      panel:       panel.trim(),
      createdAt:   new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
      resolution:  '',
    };
    issues.unshift(issue);
    save(issues);
    return issue;
  }

  function update(id, fields) {
    const issues = load();
    const idx = issues.findIndex(i => i.id === id);
    if (idx < 0) return null;
    issues[idx] = { ...issues[idx], ...fields, updatedAt: new Date().toISOString() };
    save(issues);
    return issues[idx];
  }

  function remove(id) {
    const issues = load();
    save(issues.filter(i => i.id !== id));
  }

  // ── Prompt generation ──────────────────────────────────

  function generatePrompt(issue) {
    const t = TYPES[issue.type] || TYPES.bug;
    const arch = `The app is a Japanese learning tool built in Electron.
Architecture: index.html + src/core.js + src/features-*.js (9 feature files)
State: named state objects per file (AnkiState, VoiceState, LessonNotesState, VocabCorpusState, etc.)
Vocab: words table (SQLite, 778 N5/N4 words), corpus_entries/lookups/productions, srs_items, priority score
Service layer: src/services/ (AudioService, TranscriptionService, AnalysisService, StorageService)
Orchestrator: src/Orchestrator.js`;

    if (issue.type === 'bug') {
      return `${arch}

ISSUE #${issue.id} — ${t.emoji} Bug Report
Panel/Feature: ${issue.panel || 'not specified'}
Priority: ${issue.priority}

Title: ${issue.title}

Description:
${issue.description}

Please:
1. Identify the most likely cause based on the architecture above
2. Show the minimal code change needed to fix it
3. Note any related state objects or service layer components involved
4. Flag any other places in the codebase that may have the same issue`;
    }

    if (issue.type === 'feature') {
      return `${arch}

ISSUE #${issue.id} — ${t.emoji} Feature Request
Panel/Feature: ${issue.panel || 'not specified'}
Priority: ${issue.priority}

Title: ${issue.title}

Description:
${issue.description}

Please:
1. Identify which file(s) this belongs in based on the architecture
2. Define the state changes needed (which state object, what new fields)
3. Outline the implementation — UI changes, logic, any new service calls
4. Keep it minimal — no new dependencies, consistent with existing patterns`;
    }

    if (issue.type === 'improvement') {
      return `${arch}

ISSUE #${issue.id} — ${t.emoji} Improvement
Panel/Feature: ${issue.panel || 'not specified'}
Priority: ${issue.priority}

Title: ${issue.title}

Description:
${issue.description}

Please:
1. Show the current implementation and its shortcoming
2. Propose the improved version
3. Confirm it doesn't break existing behaviour`;
    }

    // unclear
    return `${arch}

ISSUE #${issue.id} — ${t.emoji} Issue (type unclear)
Panel/Feature: ${issue.panel || 'not specified'}

Title: ${issue.title}

Description:
${issue.description}

Please clarify whether this is a bug, feature request, or improvement, then suggest the best approach.`;
  }

  function generateGroupPrompt(issues) {
    const arch = `The app is a Japanese learning tool built in Electron.
Architecture: index.html + src/core.js + src/features-*.js (9 feature files)
State: named state objects per file (AnkiState, VoiceState, LessonNotesState, VocabCorpusState, etc.)
Vocab: words table (SQLite, 778 N5/N4 words), corpus_entries/lookups/productions, srs_items, priority score
Service layer: src/services/ (AudioService, TranscriptionService, AnalysisService, StorageService)
Orchestrator: src/Orchestrator.js`;

    const lines = [`${arch}

The following ${issues.length} issues have been grouped for review. Please:
1. Identify which can be fixed in the same file or same code area
2. For each issue, show the minimal fix
3. Where fixes overlap or conflict, note that explicitly
4. Produce one combined set of changes if possible — fewer files is better

─────────────────────────────────────────`];

    issues.forEach((issue, i) => {
      const t = TYPES[issue.type] || TYPES.bug;
      lines.push(`
ISSUE ${i + 1} of ${issues.length} — #${issue.id} ${t.emoji} ${t.label.toUpperCase()}
Panel: ${issue.panel || 'not specified'}
Priority: ${(PRIORITIES[issue.priority] || PRIORITIES.medium).label}
Title: ${issue.title}
${issue.description ? 'Description:\n' + issue.description : '(no description)'}
─────────────────────────────────────────`);
    });

    return lines.join('\n');
  }

  return { getAll, add, update, remove, generatePrompt, generateGroupPrompt, TYPES, PRIORITIES, STATUS };
})();

// ── Render the issue tracker panel ────────────────────────────────────────────

let _itSelected = new Set(); // ids of checked issues

function issueTrackerRender() {
  const el = document.getElementById('issueTrackerPanel');
  if (!el) return;

  const issues       = IssueTracker.getAll();
  const filterStatus = document.getElementById('itFilterStatus')?.value || 'all';
  const filterType   = document.getElementById('itFilterType')?.value   || 'all';

  const filtered = issues.filter(i =>
    (filterStatus === 'all' || i.status === filterStatus) &&
    (filterType   === 'all' || i.type   === filterType)
  );

  if (!filtered.length) {
    el.innerHTML = `<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink-light);padding:20px 0;text-align:center">
      ${issues.length ? 'No issues match the current filter.' : 'No issues logged yet. Add one above.'}
    </div>`;
    _itRenderGroupBar();
    return;
  }

  el.innerHTML = filtered.map(issue => {
    const t = IssueTracker.TYPES[issue.type]             || IssueTracker.TYPES.bug;
    const p = IssueTracker.PRIORITIES[issue.priority]    || IssueTracker.PRIORITIES.medium;
    const s = IssueTracker.STATUS[issue.status]          || IssueTracker.STATUS.open;
    const date    = new Date(issue.createdAt).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' });
    const checked = _itSelected.has(issue.id) ? 'checked' : '';

    return `<div class="it-issue" id="it-issue-${issue.id}" style="border:1px solid var(--border);border-radius:6px;margin-bottom:10px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--paper-dark)">
        <input type="checkbox" ${checked} onchange="itToggleSelect(${issue.id}, this.checked)"
          style="flex-shrink:0;width:15px;height:15px;cursor:pointer;accent-color:var(--teal)">
        <span style="flex-shrink:0;font-size:1rem;cursor:pointer" onclick="itToggleExpand(${issue.id})">${t.emoji}</span>
        <span style="flex:1;font-family:var(--ui);font-size:0.82rem;color:var(--ink);font-weight:500;cursor:pointer" onclick="itToggleExpand(${issue.id})">${_itEsc(issue.title)}</span>
        <span style="font-family:var(--ui);font-size:0.68rem;color:${p.color};flex-shrink:0">${p.label}</span>
        <span style="font-family:var(--ui);font-size:0.68rem;color:${s.color};flex-shrink:0;min-width:64px;text-align:right">${s.label}</span>
        <span style="font-family:var(--ui);font-size:0.65rem;color:var(--ink-light);flex-shrink:0">${date}</span>
      </div>
      <div id="it-expand-${issue.id}" style="display:none;padding:12px;border-top:1px solid var(--border)">
        ${issue.panel ? `<div style="font-family:var(--ui);font-size:0.7rem;color:var(--ink-light);margin-bottom:8px">Panel: ${_itEsc(issue.panel)}</div>` : ''}
        ${issue.description ? `<div style="font-family:var(--ui);font-size:0.8rem;color:var(--ink);margin-bottom:12px;white-space:pre-wrap;line-height:1.6">${_itEsc(issue.description)}</div>` : ''}
        ${issue.resolution ? `<div style="font-family:var(--ui);font-size:0.75rem;color:var(--teal);margin-bottom:12px;padding:8px;background:rgba(0,180,160,0.07);border-radius:4px;white-space:pre-wrap">✓ ${_itEsc(issue.resolution)}</div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <select onchange="itUpdateField(${issue.id},'type',this.value)" style="padding:4px 8px;font-family:var(--ui);font-size:0.75rem;background:var(--field);border:1px solid var(--field-border);color:var(--ink);border-radius:4px">
            ${Object.entries(IssueTracker.TYPES).map(([k,v]) => `<option value="${k}"${issue.type===k?' selected':''}>${v.emoji} ${v.label}</option>`).join('')}
          </select>
          <select onchange="itUpdateField(${issue.id},'priority',this.value)" style="padding:4px 8px;font-family:var(--ui);font-size:0.75rem;background:var(--field);border:1px solid var(--field-border);color:var(--ink);border-radius:4px">
            ${Object.entries(IssueTracker.PRIORITIES).map(([k,v]) => `<option value="${k}"${issue.priority===k?' selected':''}>${v.label}</option>`).join('')}
          </select>
          <select onchange="itUpdateField(${issue.id},'status',this.value)" style="padding:4px 8px;font-family:var(--ui);font-size:0.75rem;background:var(--field);border:1px solid var(--field-border);color:var(--ink);border-radius:4px">
            ${Object.entries(IssueTracker.STATUS).map(([k,v]) => `<option value="${k}"${issue.status===k?' selected':''}>${v.label}</option>`).join('')}
          </select>
          <button class="btn-action" style="font-size:0.75rem" onclick="itCopyPrompt(${issue.id})">Copy prompt</button>
          <button class="btn-ghost" style="font-size:0.75rem" onclick="itEditResolution(${issue.id})">✏ Resolution</button>
          <button class="btn-ghost" style="font-size:0.75rem;color:var(--red);border-color:var(--red)" onclick="itDelete(${issue.id})">Delete</button>
        </div>
      </div>
    </div>`;
  }).join('');

  _itRenderGroupBar();
}

function _itRenderGroupBar() {
  const bar = document.getElementById('itGroupBar');
  if (!bar) return;
  const n = _itSelected.size;
  if (n < 2) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  bar.innerHTML = `<span style="font-family:var(--ui);font-size:0.78rem;color:var(--ink)">${n} issues selected</span>
    <button class="btn-action" style="font-size:0.75rem;margin-left:auto" onclick="itCopyGroupPrompt()">Copy group prompt</button>
    <button class="btn-ghost" style="font-size:0.75rem;color:var(--ink-light)" onclick="itClearSelection()">✕ Clear</button>`;
}

function issueTrackerRenderFull() {
  const container = document.getElementById('issueTrackerFull');
  if (!container) return;

  const open  = IssueTracker.getAll().filter(i => i.status === 'open').length;
  const total = IssueTracker.getAll().length;

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <div style="font-family:var(--ui);font-size:0.78rem;color:var(--ink-light)">${open} open · ${total} total</div>
      <div style="display:flex;gap:8px;align-items:center">
        <select id="itFilterType" onchange="issueTrackerRender()" style="padding:4px 8px;font-family:var(--ui);font-size:0.75rem;background:var(--field);border:1px solid var(--field-border);color:var(--ink);border-radius:4px">
          <option value="all">All types</option>
          ${Object.entries(IssueTracker.TYPES).map(([k,v]) => `<option value="${k}">${v.emoji} ${v.label}</option>`).join('')}
        </select>
        <select id="itFilterStatus" onchange="issueTrackerRender()" style="padding:4px 8px;font-family:var(--ui);font-size:0.75rem;background:var(--field);border:1px solid var(--field-border);color:var(--ink);border-radius:4px">
          <option value="all">All status</option>
          ${Object.entries(IssueTracker.STATUS).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('')}
          <option value="open">Open only</option>
        </select>
      </div>
    </div>

    <!-- Group action bar — hidden until 2+ issues are checked -->
    <div id="itGroupBar" style="display:none;align-items:center;gap:8px;padding:8px 12px;background:rgba(74,158,255,0.08);border:1px solid rgba(74,158,255,0.3);border-radius:6px;margin-bottom:12px"></div>

    <!-- Add new issue form -->
    <div style="background:var(--paper-dark);border:1px solid var(--border);border-radius:6px;padding:16px;margin-bottom:16px">
      <div style="font-family:var(--ui);font-size:0.72rem;letter-spacing:0.08em;color:var(--ink-light);margin-bottom:12px">NEW ISSUE</div>
      <input id="itNewTitle" type="text" placeholder="Title — one clear sentence"
        style="width:100%;padding:8px 10px;background:var(--field);border:1px solid var(--field-border);border-radius:5px;font-family:var(--ui);font-size:0.82rem;color:var(--ink);box-sizing:border-box;margin-bottom:8px;outline:none">
      <textarea id="itNewDesc" rows="3" placeholder="Steps to reproduce / what you expected / what happened instead"
        style="width:100%;padding:8px 10px;background:var(--field);border:1px solid var(--field-border);border-radius:5px;font-family:var(--ui);font-size:0.82rem;color:var(--ink);box-sizing:border-box;resize:vertical;margin-bottom:8px;outline:none"></textarea>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <select id="itNewType" style="padding:6px 10px;font-family:var(--ui);font-size:0.78rem;background:var(--field);border:1px solid var(--field-border);color:var(--ink);border-radius:5px">
          ${Object.entries(IssueTracker.TYPES).map(([k,v]) => `<option value="${k}">${v.emoji} ${v.label}</option>`).join('')}
        </select>
        <select id="itNewPriority" style="padding:6px 10px;font-family:var(--ui);font-size:0.78rem;background:var(--field);border:1px solid var(--field-border);color:var(--ink);border-radius:5px">
          ${Object.entries(IssueTracker.PRIORITIES).map(([k,v]) => `<option value="${k}"${k==='medium'?' selected':''}>${v.label}</option>`).join('')}
        </select>
        <input id="itNewPanel" type="text" placeholder="Panel (optional: e.g. voice, anki)"
          style="flex:1;min-width:120px;padding:6px 10px;background:var(--field);border:1px solid var(--field-border);border-radius:5px;font-family:var(--ui);font-size:0.78rem;color:var(--ink);outline:none">
        <button class="btn-action" onclick="itAdd()">+ Add</button>
      </div>
    </div>

    <div id="issueTrackerPanel"></div>`;

  issueTrackerRender();
}

// ── Action handlers ────────────────────────────────────

function itAdd() {
  const title    = document.getElementById('itNewTitle')?.value?.trim();
  const desc     = document.getElementById('itNewDesc')?.value?.trim();
  const type     = document.getElementById('itNewType')?.value     || 'bug';
  const priority = document.getElementById('itNewPriority')?.value || 'medium';
  const panel    = document.getElementById('itNewPanel')?.value?.trim() || '';

  if (!title) {
    document.getElementById('itNewTitle').style.borderColor = 'var(--red)';
    setTimeout(() => { document.getElementById('itNewTitle').style.borderColor = ''; }, 1500);
    return;
  }

  IssueTracker.add(title, desc, type, priority, panel);

  document.getElementById('itNewTitle').value = '';
  document.getElementById('itNewDesc').value  = '';
  document.getElementById('itNewPanel').value = '';

  issueTrackerRender();
}

function itToggleExpand(id) {
  const el = document.getElementById(`it-expand-${id}`);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function itToggleSelect(id, checked) {
  if (checked) _itSelected.add(id);
  else         _itSelected.delete(id);
  _itRenderGroupBar();
}

function itClearSelection() {
  _itSelected.clear();
  issueTrackerRender();
}

function itCopyGroupPrompt() {
  if (_itSelected.size < 2) return;
  const all     = IssueTracker.getAll();
  const issues  = [..._itSelected].map(id => all.find(i => i.id === id)).filter(Boolean);
  const text    = IssueTracker.generateGroupPrompt(issues);
  const btn     = document.querySelector('#itGroupBar button[onclick*="itCopyGroupPrompt"]');
  navigator.clipboard.writeText(text).then(() => {
    if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => { btn.textContent = 'Copy group prompt'; }, 1500); }
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => { btn.textContent = 'Copy group prompt'; }, 1500); }
  });
}

function itUpdateField(id, field, value) {
  IssueTracker.update(id, { [field]: value });
  issueTrackerRender();
}

function itCopyPrompt(id) {
  const issues = IssueTracker.getAll();
  const issue  = issues.find(i => i.id === id);
  if (!issue) return;

  const prompt = IssueTracker.generatePrompt(issue);
  navigator.clipboard.writeText(prompt).then(() => {
    const btn = document.querySelector(`#it-issue-${id} button[onclick*="itCopyPrompt"]`);
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✓ Copied!';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = prompt;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}

function itEditResolution(id) {
  const issues  = IssueTracker.getAll();
  const issue   = issues.find(i => i.id === id);
  if (!issue) return;

  const current = issue.resolution || '';
  const text    = prompt('Resolution / notes:', current);
  if (text === null) return;

  IssueTracker.update(id, {
    resolution: text,
    status: text.trim() ? 'done' : issue.status,
  });
  issueTrackerRender();
}

function itDelete(id) {
  if (!confirm('Delete this issue?')) return;
  IssueTracker.remove(id);
  _itSelected.delete(id);
  issueTrackerRender();
}

function _itEsc(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Export to window

// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, {
    IssueTracker,
    issueTrackerRender,
    issueTrackerRenderFull,
    itAdd,
    itToggleExpand,
    itToggleSelect,
    itClearSelection,
    itCopyGroupPrompt,
    itUpdateField,
    itCopyPrompt,
    itEditResolution,
    itDelete,
  });
} catch(e) { console.error('[IssueTracker] App registry failed:', e); }
