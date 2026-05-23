// ╔══════════════════════════════════════════════════════════════════════════════
// ║ core.js (final residual)
// ║ Progress panel, grammar notes, listen prefs, INIT block.
// ║ Loaded last among core files — all other core-*.js files must precede this.
// ╚══════════════════════════════════════════════════════════════════════════════

// ╔══════════════════════════════════════════════════════════════════════════════
// ║ core.js (residual — being split progressively)
// ║ Depends on: core-foundation.js, core-anki.js
// ║ Still contains: progress panel, word drill, writing, translation/chat, STT,
// ║                 RTK, corpus, conj drill, listen, dictation,
// ║                 DrillSRS, vocab corpus display, priority score,
// ║                 vocab drill render, init
// ╚══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// DASHBOARD / PROGRESS
// ═══════════════════════════════════════════════════════

function updateProgressPanel() {
  progressRenderCost();
  progressRenderErrors();
  if (typeof renderSpokenErrorsProgress === 'function') {
    renderSpokenErrorsProgress();
  }
  Storage.set('agentLastProgressView', String(Date.now()));
  agentRefresh(false);
  try { agentUpdatePresence(); } catch(e) {}
  try { renderFourStrandRecency(); } catch(e) {}
  try { if (typeof renderGrammarCoverage  === 'function') renderGrammarCoverage();  } catch(e) {}
  try { (App.renderConjMastery    || window.renderConjMastery)?.();    } catch(e) {}
  try { (App.renderAdjMastery     || window.renderAdjMastery)?.();     } catch(e) {}
  try { (App.renderCounterMastery || window.renderCounterMastery)?.(); } catch(e) {}
}

function progressRenderCost() {
  const container = document.getElementById('progress-cost-display');
  if (!container) return;

  apiUsageLoad();

  const totalCost = apiUsageGetCost();
  const fmt  = (c) => c < 0.01 ? '<$0.01' : '$' + c.toFixed(2);
  const fmtk = (n) => n >= 1000 ? (n/1000).toFixed(1) + 'K' : String(n);

  // Feature labels and colours
  const FEATURE_META = {
    translate: { label: '翻訳 Translate',  color: 'var(--teal)' },
    chat:      { label: '質問 Chat',        color: 'var(--teal)' },
    writing:   { label: '書く Writing',     color: 'var(--gold)' },
    grammar:   { label: '文法 Grammar',     color: 'var(--gold)' },
    lesson:    { label: 'ヨシ Lesson',      color: '#a78bfa' },
    yoshi:     { label: 'ヨシ Reader',      color: '#a78bfa' },
    vocab:     { label: '単語 Vocab',       color: 'var(--ink-light)' },
    reading:   { label: '読む Reading',     color: 'var(--ink-light)' },
    video:     { label: '見る Video',       color: 'var(--ink-light)' },
    speaking:  { label: '話す Speaking',    color: 'var(--red)' },
  };

  const byFeature = AppState.apiUsage.byFeature || {};
  const featureCost = (f) =>
    (f.inputTokens || 0) * COST_PER_INPUT_TOKEN +
    (f.outputTokens || 0) * COST_PER_OUTPUT_TOKEN;

  // Sort features by cost descending, only show ones with usage
  const features = Object.entries(byFeature)
    .map(([key, f]) => ({ key, f, cost: featureCost(f) }))
    .filter(x => x.cost > 0 || x.f.calls > 0)
    .sort((a, b) => b.cost - a.cost);

  // Max cost for bar scaling
  const maxCost = features.length ? features[0].cost : 1;

  const featureRows = features.map(({ key, f, cost }) => {
    const meta = FEATURE_META[key] || { label: key, color: 'var(--ink-light)' };
    const pct = maxCost > 0 ? Math.max(4, (cost / maxCost) * 100) : 4;
    return `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light);width:110px;flex-shrink:0">${meta.label}</span>
        <div style="flex:1;height:6px;background:var(--paper-dark);border-radius:3px;overflow:hidden">
          <div style="width:${pct.toFixed(0)}%;height:100%;background:${meta.color};border-radius:3px;opacity:0.7"></div>
        </div>
        <span style="font-family:var(--ui);font-size:0.7rem;color:var(--ink-light);width:44px;text-align:right">${fmt(cost)}</span>
        <span style="font-family:var(--ui);font-size:0.68rem;color:var(--ink-light);opacity:0.6;width:36px;text-align:right">${f.calls}×</span>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span style="font-family:var(--ui);font-size:0.72rem;letter-spacing:0.05em;color:var(--ink-light)">API COST</span>
      <span style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light)">
        <span style="color:var(--ink);font-weight:600">${fmt(totalCost)}</span>
        &nbsp;·&nbsp;${AppState.apiUsage.calls || 0} calls
        &nbsp;·&nbsp;${fmtk(AppState.apiUsage.inputTokens || 0)} in / ${fmtk(AppState.apiUsage.outputTokens || 0)} out
        &nbsp;<button class="btn-ghost" onclick="apiUsageReset()">Reset</button>
      </span>
    </div>
    ${features.length ? featureRows : '<div style="font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);opacity:0.5">No API usage recorded yet.</div>'}
  `;
}

// KATAKANA WORD SRS — persisted separately so it survives app updates
// ═══════════════════════════════════════════════════════
const GRAM_TABS = ['verbs','adjectives','particles','syntax','expressions','counters','misc','lookups','kanji','unclassified'];
const GRAM_NOTES_KEY = 'jpGramNotes'; // aligned with STORAGE_KEYS.GRAM_NOTES
const GRAM_TAB_LABELS = {
  verbs:'Verbs', adjectives:'Adjectives', particles:'Particles',
  syntax:'Syntax', expressions:'Expressions', counters:'Counters', misc:'Misc'
};

function getGramData() {
  return Storage.getJSON(STORAGE_KEYS.GRAM_NOTES, {});
}
function saveGramData(data) {
  Storage.setJSON(STORAGE_KEYS.GRAM_NOTES, data);
}
function migrateTextToEntries(text) {
  return text.split(/\n---\n/).map(chunk => {
    chunk = chunk.trim();
    const dm = chunk.match(/^\[(\d{2}\.\d{2}\.\d{4})\]\n?/);
    const date = dm ? dm[1] : new Date().toLocaleDateString('de-DE');
    const body = dm ? chunk.slice(dm[0].length).trim() : chunk;
    return { id: Date.now() + Math.random(), date, text: body };
  }).filter(e => e.text);
}
function getGramEntries(tab) {
  const data = getGramData();
  if (typeof data[tab] === 'string' && data[tab].trim()) {
    const migrated = migrateTextToEntries(data[tab]);
    data[tab] = migrated; saveGramData(data);
  }
  return Array.isArray(data[tab]) ? data[tab] : [];
}
// escHtml moved to core-foundation.js

function loadGramNotes() { GRAM_TABS.forEach(tab => renderGramEntries(tab)); }

function gramNotesShowTab(tab, btn) {
  GRAM_TABS.forEach(t => {
    const el = document.getElementById('gnote-tab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.gramnote-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (tab === 'lookups') {
    renderLookupsTable();
    kanaSetMode('lookupsFilter','romaji','lookupsKana',{romaji:'lookupsRomajiBtn',hira:'lookupsHiraBtn',kata:'lookupsKataBtn'});
    return;
  }
  if (tab === 'counters') { ctrRefInit(); }
  if (tab === 'kanji') { kanjiCorpusRender(); return; }
  if (tab === 'unclassified') { (App.unclassifiedRender || window.unclassifiedRender)?.(); return; }
  renderGramEntries(tab);
} // kept for compat

function renderGramEntries(tab) {
  const container = document.getElementById('gnote-entries-' + tab);
  if (!container) return;
  const entries = getGramEntries(tab);
  if (!entries.length) {
    container.innerHTML = '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Helvetica Neue\',sans-serif;font-size:0.78rem;color:var(--ink-light);padding:16px 0;font-style:italic">No entries yet.</div>';
    return;
  }
  container.innerHTML = entries.map((entry, i) => `
    <div class="gramnote-entry" id="gentry-${tab}-${i}">
      <div class="gramnote-entry-meta">
        <span class="gramnote-entry-date">${entry.date}</span>
        <div class="gramnote-entry-actions">
          <button class="gramnote-action-btn" onclick="editGramEntry('${tab}',${i})">Edit</button>
          <select class="gramnote-move-select" title="Move to tab" onchange="moveGramEntry('${tab}',${i},this.value);this.value=''">
            <option value="">Move →</option>
            ${GRAM_TABS.filter(t=>t!==tab).map(t=>`<option value="${t}">${GRAM_TAB_LABELS[t]}</option>`).join('')}
          </select>
          <button class="gramnote-action-btn del" onclick="deleteGramEntry('${tab}',${i})">✕</button>
        </div>
      </div>
      <div class="gramnote-entry-text" id="gentry-text-${tab}-${i}">${escHtml(entry.text)}</div>
    </div>
  `).join('');
}

function addGramEntry(tab) {
  const input = document.getElementById('gnote-input-' + tab);
  if (!input || !input.value.trim()) return;
  const data = getGramData();
  if (!Array.isArray(data[tab])) data[tab] = getGramEntries(tab);
  const date = new Date().toLocaleDateString('de-DE', {day:'2-digit',month:'2-digit',year:'numeric'});
  data[tab].unshift({ id: Date.now(), date, text: input.value.trim() });
  saveGramData(data); input.value = ''; renderGramEntries(tab);
}

function deleteGramEntry(tab, idx) {
  const data = getGramData();
  if (!Array.isArray(data[tab])) data[tab] = getGramEntries(tab);
  data[tab].splice(idx, 1); saveGramData(data); renderGramEntries(tab);
}

function moveGramEntry(fromTab, idx, toTab) {
  if (!toTab || toTab === fromTab) return;
  const data = getGramData();
  if (!Array.isArray(data[fromTab])) data[fromTab] = getGramEntries(fromTab);
  if (!Array.isArray(data[toTab])) data[toTab] = getGramEntries(toTab);
  const [entry] = data[fromTab].splice(idx, 1);
  data[toTab].unshift(entry); saveGramData(data);
  renderGramEntries(fromTab); renderGramEntries(toTab);
  const toBtn = document.querySelectorAll('.gramnote-tab')[GRAM_TABS.indexOf(toTab)];
  if (toBtn) { toBtn.style.background='var(--teal)'; setTimeout(()=>{toBtn.style.background='';},600); }
}

function editGramEntry(tab, idx) {
  const entryEl = document.getElementById('gentry-' + tab + '-' + idx);
  const textEl  = document.getElementById('gentry-text-' + tab + '-' + idx);
  if (!entryEl || entryEl.classList.contains('editing')) return;
  entryEl.classList.add('editing');
  const data = getGramData();
  if (!Array.isArray(data[tab])) data[tab] = getGramEntries(tab);
  textEl.style.display = 'none';
  const ta = document.createElement('textarea');
  ta.className = 'gramnote-entry-edit';
  ta.value = data[tab][idx].text;
  ta.rows = Math.max(3, data[tab][idx].text.split('\n').length + 1);
  entryEl.appendChild(ta);
  entryEl.querySelector('.gramnote-entry-actions').innerHTML = `
    <button class="gramnote-action-btn btn-icon" onclick="saveGramEntryEdit('${tab}',${idx})">Save</button>
    <button class="gramnote-action-btn" onclick="cancelGramEntryEdit('${tab}',${idx})">Cancel</button>
  `;
  ta.focus();
}

function saveGramEntryEdit(tab, idx) {
  const entryEl = document.getElementById('gentry-' + tab + '-' + idx);
  const ta = entryEl ? entryEl.querySelector('.gramnote-entry-edit') : null;
  if (!ta) return;
  const data = getGramData();
  if (!Array.isArray(data[tab])) data[tab] = getGramEntries(tab);
  data[tab][idx].text = ta.value.trim(); saveGramData(data); renderGramEntries(tab);
}

function cancelGramEntryEdit(tab, idx) { renderGramEntries(tab); }

function gramSearch(query) {
  const resultsEl = document.getElementById('gramSearchResults');
  const tabsEl = document.getElementById('gramnoteTabs');
  const paneEl = document.getElementById('gramnote-pane');
  const clearBtn = document.getElementById('gramSearchClear');
  const q = query.trim();

  if (!q) {
    resultsEl.style.display = 'none';
    resultsEl.innerHTML = '';
    tabsEl.style.display = '';
    paneEl.style.display = '';
    clearBtn.style.display = 'none';
    return;
  }

  clearBtn.style.display = '';
  tabsEl.style.display = 'none';
  paneEl.style.display = 'none';
  resultsEl.style.display = 'block';

  const lq = q.toLowerCase();
  let html = '';
  let total = 0;

  GRAM_TABS.forEach(tab => {
    const entries = getGramEntries(tab);
    entries.forEach((entry, entryIdx) => {
      const text = entry.text || '';
      if (!text.toLowerCase().includes(lq)) return;

      const lines = text.split('\n');
      const matchLines = [];
      lines.forEach((line, i) => {
        if (line.toLowerCase().includes(lq)) {
          const start = Math.max(0, i - 1);
          const end = Math.min(lines.length - 1, i + 1);
          matchLines.push(lines.slice(start, end + 1).join('\n'));
        }
      });

      if (!matchLines.length) return;
      total += matchLines.length;

      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(${escaped})`, 'gi');

      matchLines.forEach(snippet => {
        const highlighted = snippet
          .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(re, '<mark>$1</mark>');
        html += `<div class="gramnote-search-result" onclick="showGramTabAndHighlight('${tab}',${entryIdx})">
          <div class="gsr-tab">${GRAM_TAB_LABELS[tab]} · ${entry.date}</div>
          <div class="gsr-snippet">${highlighted}</div>
        </div>`;
      });
    });
  });

  if (!total) {
    html = `<div class="gramnote-search-empty">No results for "${q}" across any tab.</div>`;
  } else {
    html = `<div style="font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-bottom:8px">${total} match${total!==1?'es':''} — click to jump to tab</div>` + html;
  }

  resultsEl.innerHTML = html;
}

function showGramTab(tab, btn) {
  document.querySelectorAll('.gramnote-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.gramnote-section').forEach(s => s.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const section = document.getElementById('gramnote-' + tab);
  if (section) section.classList.add('active');
}

function showGramTabAndHighlight(tab, entryIdx) {
  document.getElementById('gramSearchInput').value = '';
  gramSearch('');
  const tabBtn = document.querySelectorAll('.gramnote-tab')[GRAM_TABS.indexOf(tab)];
  showGramTab(tab, tabBtn);
  setTimeout(() => {
    const el = document.getElementById('gentry-' + tab + '-' + entryIdx);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.style.borderLeftColor = 'var(--teal)';
      setTimeout(() => { el.style.borderLeftColor = ''; }, 1500);
    }
  }, 50);
}




// Convert chat HTML to readable plain text — preserves tables, bold, lists
function htmlToPlainMarkdown(el) {
  function nodeToText(node, inTable) {
    if (node.nodeType === 3) return node.textContent; // text node
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();

    // Skip style/script
    if (tag === 'style' || tag === 'script') return '';

    // Table → tab-separated rows
    if (tag === 'table') {
      const rows = [];
      node.querySelectorAll('tr').forEach(tr => {
        const cells = [...tr.querySelectorAll('th,td')].map(td => td.innerText.trim());
        rows.push(cells.join('\t'));
      });
      return '\n' + rows.join('\n') + '\n';
    }
    // Skip these since table handles them
    if (tag === 'tr' || tag === 'td' || tag === 'th' || tag === 'thead' || tag === 'tbody') return '';

    // Block-level elements
    const block = ['p','div','blockquote','pre','section','article','li'];
    const heading = ['h1','h2','h3','h4','h5','h6'];
    const isBlock = block.includes(tag) || heading.includes(tag);

    let inner = [...node.childNodes].map(c => nodeToText(c, inTable)).join('');

    if (heading.includes(tag)) return '\n' + inner.trim() + '\n';
    if (tag === 'br') return '\n';
    if (tag === 'li') return '\n• ' + inner.trim();
    if (tag === 'ul' || tag === 'ol') return inner + '\n';
    if (tag === 'strong' || tag === 'b') return inner; // keep text, skip ** noise
    if (isBlock) {
      inner = inner.trim();
      return inner ? '\n' + inner + '\n' : '';
    }
    return inner;
  }

  const raw = nodeToText(el, false);
  // Collapse 3+ newlines to 2, trim
  return raw.replace(/\n{3,}/g, '\n\n').trim();
}

function openGramSendDialog(msgId) {
  const msgEl = document.getElementById(msgId);
  if (!msgEl) return;

  const btn = msgEl.querySelector('.send-to-gram');
  const question = btn ? btn.dataset.question : '';

  // Get AI reply — convert HTML formatting to readable text
  const clone = msgEl.cloneNode(true);
  clone.querySelectorAll('.send-to-gram, #gramSendPicker, button').forEach(b => b.remove());
  const answer = htmlToPlainMarkdown(clone).trim();

  const existing = document.getElementById('gramSendPicker');
  if (existing) existing.remove();

  const picker = document.createElement('div');
  picker.id = 'gramSendPicker';
  picker.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;align-items:center';
  picker.innerHTML = '<span style="font-family:var(--ui);font-size:0.65rem;color:var(--ink-light);letter-spacing:0.06em;margin-right:4px">Send to:</span>';
  GRAM_TABS.forEach(tab => {
    const b = document.createElement('button');
    b.className = 'send-to-gram';
    b.textContent = GRAM_TAB_LABELS[tab];
    b.style.borderColor = 'var(--teal)';
    b.style.color = 'var(--teal)';
    b.onclick = () => {
      sendToGramNote(tab, question, answer);
      picker.remove();
    };
    picker.appendChild(b);
  });
  msgEl.appendChild(picker);
}

function sendToGramNote(tab, question, answer) {
  try {
    const data = getGramData();
    if (!Array.isArray(data[tab])) data[tab] = getGramEntries(tab);
    const date = new Date().toLocaleDateString('de-DE', {day:'2-digit',month:'2-digit',year:'numeric'});
    const text = question ? `Q: ${question}\n\n${answer.trim()}` : answer.trim();
    data[tab].unshift({ id: Date.now(), date, text });
    saveGramData(data);
    showPanel('gramnotes');
    // Switch to the right tab and render
    const tabBtn = document.querySelectorAll('.gramnote-tab')[GRAM_TABS.indexOf(tab)];
    gramNotesShowTab(tab, tabBtn);
  } catch(e) { console.error(e); }
}


// ═══════════════════════════════════════════════════════
const LISTEN_PREFS_KEY = 'listenPrefs';

function saveListenPrefs() {
  try {
    // Save track names for display across sessions (URLs are session-only)
    Storage.set(STORAGE_KEYS.LISTEN_TRACK_NAMES, JSON.stringify(listenTracks.map(t => t.name)));
    Storage.set(LISTEN_PREFS_KEY, JSON.stringify({
      speed:       listenCurrentSpeed,
      shadowSeg:   shadowSegSecs,
      shadowReps:  shadowRepCount,
      shadowPause: shadowPauseSecs,
      dictTimeout: dictTimeoutSecs,
      srsEnabled:  srsEnabled
    }));
  } catch {}
}

function restoreListenPrefs() {
  try {
    // Restore track names from last session (as placeholder entries)
    const savedNames = JSON.parse(Storage.get(STORAGE_KEYS.LISTEN_TRACK_NAMES) || '[]');
    if (savedNames.length && !listenTracks.length) {
      listenTracks = savedNames.map(name => ({ name, url: null, file: null, ghost: true }));
      showListenLayout();
      renderListenPlaylist();
    }
    const p = JSON.parse(localStorage.getItem(LISTEN_PREFS_KEY) || 'null');
    if (!p) return;

    // Speed
    if (p.speed) setListenSpeed(p.speed);

    // Shadow segment length
    if (p.shadowSeg) {
      shadowSegSecs = p.shadowSeg;
      const sel = document.getElementById('shadowSegLen');
      if (sel) sel.value = p.shadowSeg;
    }
    // Shadow repeats
    if (p.shadowReps) {
      shadowRepCount = p.shadowReps;
      const sel = document.getElementById('shadowReps');
      if (sel) sel.value = p.shadowReps;
    }
    // Shadow pause
    if (p.shadowPause !== undefined) {
      shadowPauseSecs = p.shadowPause;
      const sel = document.getElementById('shadowPause');
      if (sel) sel.value = p.shadowPause;
    }
    // Dictation timeout
    if (p.dictTimeout) {
      dictTimeoutSecs = p.dictTimeout;
      const sel = document.getElementById('dictTimeout');
      if (sel) sel.value = p.dictTimeout;
    }
    // SRS toggle
    if (p.srsEnabled === false) {
      srsEnabled = true; // toggleSrsTracking flips it, so prime as true first
      toggleSrsTracking();
    }
  } catch {}
}

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════

// Storage-independent inits run immediately
initApiKeyBar();
initKanaDrill();

// Data-dependent inits deferred until SQLite cache is populated
document.addEventListener('storageReady', function() {
  initApiKeyBar();
  renderVocab();
  startConjDrill();
  renderGrammar();
  restoreListenPrefs();
  loadGramNotes();

  // Smart launch routing — open at the most relevant panel
  (function() {
    try {
      const launchPanel = agentGetLaunchPanel();
      if (launchPanel && launchPanel !== 'dashboard') {
        showPanel(launchPanel);
      }
    } catch(e) {}
  })();

  // Agent presence indicator — badge + dashboard strip
  setTimeout(function() { try { agentUpdatePresence(); } catch(e) {} }, 200);

  // Render data-dependent dashboard graphics
  setTimeout(function() {
    try { renderFourStrandRecency(); } catch(e) {}
    try { writingErrorsLoad(); progressRenderErrors(); } catch(e) {}
  }, 300);
});

// waveformClick is wired via onclick in index.html — no addEventListener needed

// Capture-phase space interceptor — fires before any focused element can act
document.addEventListener('keydown', function(e) {
  if (e.code !== 'Space') return;
  const active = document.querySelector('.panel.active');
  if (!active || active.id !== 'panel-video') return;
  const tag = document.activeElement && document.activeElement.tagName;
  // Only allow space in text inputs/textareas - everywhere else intercept it
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  // Blur any focused element (buttons, selects, etc)
  if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
  vtTogglePlay();
}, true); // capture phase // true = capture phase

// Blur buttons after click so spacebar doesn't re-trigger them
document.addEventListener('click', function(e) {
  if (e.target && e.target.tagName === 'BUTTON') {
    e.target.blur();
  }
});

// Global keyboard shortcuts on Listening + Watch tabs
document.addEventListener('keydown', function(e) {
  const active = document.querySelector('.panel.active');
  if (!active) return;
  const tag = document.activeElement && document.activeElement.tagName;
  const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

  if (active.id === 'panel-video') {
    if (e.code === 'Space' && !isTyping) { e.preventDefault(); e.stopPropagation(); vtTogglePlay(); return; }
    if ((e.key === 'm' || e.key === 'M') && !isTyping) { e.preventDefault(); vtAddMarker(); return; }
    if (e.key === 'f' || e.key === 'F') { e.preventDefault(); vtFullscreen(); return; }
    if (e.key === 'Escape') {
      const panel = document.getElementById('panel-video');
      if (panel && panel.classList.contains('vt-fullscreen')) {
        e.preventDefault();
        vtFullscreen(); // Toggle off
        return;
      }
    }
    return;
  }
  if (!active || active.id !== 'panel-listening') return;
  if (e.code === 'Space' && !isTyping) {
    e.preventDefault();
    toggleListenPlay();
  }
  if ((e.key === 'v' || e.key === 'V') && !isTyping) {
    e.preventDefault();
    dropVocabBookmark();
  }
});
