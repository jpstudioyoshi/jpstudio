// ╔══════════════════════════════════════════════════════════════════════════════
// ║ features-progress.js
// ║ Progress dashboard: export/import, error dashboard, grammar graph,
// ║ four-strand recency, conjugation mastery, counter mastery,
// ║ grammar coverage grid, particle breakdown, cost display.
// ║ Depends on: core-foundation.js, core-srs.js (DrillSRS),
// ║             GrammarModel, Storage, STORAGE_KEYS
// ╚══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// PROGRESS EXPORT / IMPORT
// ═══════════════════════════════════════════════════════

const PROGRESS_KEYS = [
  'jpStudio',
  'jpStudioTexts',
  'listenNotes',
  'listenVocabBookmarks',
  'listenSrs',
  'gramNotes',
  'listenPrefs',
  'jpStudioGdSessions',
  'jpStudioYoshiSessions',
  'importedDocSessions',
  'vtVideoHistory',
  'tdBestScore',
  'ttsVoiceURI',
  'writingErrors',
  'jpStudioSpokenErrors',
  'jpStudioVoiceProfile',
  'jpStudioVoiceConvos',
];

function progressExport() {
  const data = { _version: 1, _exported: new Date().toISOString(), _app: 'jpStudio' };
  PROGRESS_KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null) data[k] = v;  // store raw strings to avoid double-serialisation
  });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href     = url;
  a.download = `jpStudio-progress-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
  progBackupMsg('✓ Exported', 3000);
}

function progressImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data._app !== 'jpStudio') {
        progBackupMsg('✗ Not a jpStudio backup file', 4000);
        return;
      }
      let count = 0;
      PROGRESS_KEYS.forEach(k => {
        if (data[k] !== undefined) {
          localStorage.setItem(k, data[k]);
          count++;
        }
      });
      progBackupMsg(`✓ Imported ${count} data sets — reload to apply`, 6000);
      // Offer a reload
      setTimeout(() => {
        if (confirm('Progress imported. Reload the page to apply all changes?')) {
          location.reload();
        }
      }, 500);
    } catch(err) {
      progBackupMsg('✗ Could not read file: ' + err.message, 5000);
    }
  };
  reader.readAsText(file);
  event.target.value = '';  // reset so same file can be re-imported
}

function progBackupMsg(msg, duration) {
  const el = document.getElementById('prog-backup-msg');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'inline';
  el.style.color = msg.startsWith('✓') ? 'var(--teal)' : 'var(--red)';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.display = 'none'; }, duration);
}

// ═══════════════════════════════════════════════════════
// ERROR DASHBOARD RENDERING
// ═══════════════════════════════════════════════════════
const ERROR_TYPE_COLORS = {
  particle: '#ff6b6b',
  conjugation: '#ffd60a', 
  'word-choice': '#30d5c8',
  spelling: '#ff8585',
  'word-order': '#7ed886',
  formality: '#c0c0c5'
};

const ERROR_TYPE_LABELS = {
  particle: '助詞 Particles',
  conjugation: '活用 Conjugation',
  'word-choice': '語彙 Word Choice',
  spelling: '綴り Spelling',
  'word-order': '語順 Word Order',
  formality: '敬語 Formality'
};

const DRILL_LAST_COMPLETED_KEY = 'drillLastCompleted';
function drillLastCompletedWrite(drillKey, label) {
  try {
    const rec = Storage.getJSON(DRILL_LAST_COMPLETED_KEY, {});
    rec[drillKey] = new Date().toISOString().slice(0, 10);
    if (label) {
      if (!rec._labels) rec._labels = {};
      rec._labels[drillKey] = label;
    }
    Storage.setJSON(DRILL_LAST_COMPLETED_KEY, rec);
  } catch(e) {}
}

function renderFourStrandRecency() {
  const el = document.getElementById('drillRecencyGraphic');
  if (!el) return;

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const DAY = 86400000;

  const rec = Storage.getJSON(DRILL_LAST_COMPLETED_KEY, {});
  // Mark words complete if vocab_items drill was used today
  if (!rec.words && window._vocabDrillUsedToday) rec.words = todayStr;
  if ((typeof CM !== 'undefined') && CM.isTodayComplete()         && !rec.counters)  rec.counters = todayStr;
  if ((typeof ConjSession !== 'undefined') && ConjSession.isTodayComplete() && !rec.conj) rec.conj = todayStr;
  if (!rec.writing) {
    try { const t = Storage.getJSON(STORAGE_KEYS.STUDIO_TEXTS,[]); if(t.length) rec.writing=(t[0].date||t[0].savedAt||'').slice(0,10)||null; } catch(e){}
  }
  try {
    const s = Storage.getJSON(STORAGE_KEYS.ROUND_TRIPS, []);
    if (s.length) {
      const rtDate = (s[0].date || '').slice(0, 10);
      if (rtDate && (!rec.speaking || rtDate > rec.speaking)) rec.speaking = rtDate;
    }
  } catch(e) {}

  function daysSince(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d)) return null;
    return Math.floor((today - d) / DAY);
  }

  // Read time-range filter
  const _rangeEl = document.querySelector('input[name="strandRange"]:checked');
  const _range = _rangeEl ? _rangeEl.value : 'all';
  const _rangeCutoff = _range === 'week' ? 7 : _range === 'month' ? 30 : 99999;

  function cellColor(days) {
    if (days === null || days > _rangeCutoff) return 'transparent';
    if (days === 0)    return '#30d5c8';
    if (days <= 2)     return '#30d5c8';
    if (days <= 6)     return '#ffd60a';
    return '#e05050';
  }

  function cellTextColor(days) {
    if (days === null) return 'var(--ink-light)';
    if (days <= 6)     return '#000';   // black on teal or gold
    return '#fff';                       // white on red
  }

  function cellOpacity(days) {
    if (days === null) return '0.35';
    if (days === 0)    return '1';
    if (days <= 2)     return '0.9';
    if (days <= 6)     return '0.85';
    return '0.8';
  }

  function daysLabel(days) {
    if (days === null) return '';
    if (days === 0)    return 'today';
    if (days === 1)    return '1d';
    return days + 'd';
  }

  // Vocabulary tile uses most recent of anki, words, counters keys
  const _vocabDate = [rec.anki, rec.words, rec.counters].filter(Boolean).sort().pop() || null;

  const strands = [
    { label: 'INPUT', sub: 'listening & reading', items: [
      { label: 'Reading',    key: 'reading',   panel: 'read'      },
      { label: 'Listening',  key: 'listening', panel: 'listening' },
      { label: 'Video',      key: 'video',     panel: 'video'     },
    ]},
    { label: 'OUTPUT', sub: 'speaking & writing', items: [
      { label: 'Writing',    key: 'writing',   panel: 'writing'   },
      { label: 'Speaking',   key: 'speaking',  panel: 'voice'     },
    ]},
    { label: 'STUDY', sub: 'deliberate learning', items: [
      { label: 'Vocabulary',   key: '_vocab',    panel: 'words'     },
      { label: 'Sentence Building', key: 'gramSent', panel: 'grammar2'  },
      { label: 'Conjugation',  key: 'conj',      panel: 'grammar2'  },
      { label: 'Kana',         key: 'kana',      panel: 'kana'      },
      { label: 'Questions',    key: 'chat',      panel: 'dashboard' },
    ]},
    { label: 'FLUENCY', sub: 'using what you know', items: [
      { label: 'Speaking',     key: 'speaking',  panel: 'voice'     },
      { label: 'Writing',      key: 'writing',   panel: 'writing'   },
      { label: 'Sentence Building', key: 'gramSent', panel: 'grammar2'  },
    ]},
  ];
  // Inject computed vocab date into rec for tile lookup
  rec['_vocab'] = _vocabDate;

  // Build labels map — merge stored labels with live-derived ones
  const labels = Object.assign({}, (rec._labels || {}));
  if (!labels.writing) {
    try {
      const t = Storage.getJSON(STORAGE_KEYS.STUDIO_TEXTS, []);
      if (t.length && t[0].text) labels.writing = t[0].text.trim().slice(0, 40).replace(/\s+/g, ' ') + (t[0].text.length > 40 ? '…' : '');
    } catch(e) {}
  }
  if (!labels.speaking) {
    try {
      const s = Storage.getJSON(STORAGE_KEYS.ROUND_TRIPS, []);
      if (s.length && s[0].topic) labels.speaking = s[0].topic;
    } catch(e) {}
  }
  labels['_vocab'] = labels.anki || labels.words || labels.counters || null;

  // Build grid — one section per strand
  let html = '<div style="display:flex;flex-direction:column;gap:72px">';

  for (const strand of strands) {
    // Find the most recently done item in this strand (for summary line)
    let bestDays = null, bestItem = null;
    for (const item of strand.items) {
      const d = daysSince(rec[item.key]);
      if (d !== null && (bestDays === null || d < bestDays)) { bestDays = d; bestItem = item; }
    }
    let summaryText = '';
    if (bestItem !== null) {
      const whenStr = bestDays === 0 ? 'today' : bestDays === 1 ? 'yesterday' : bestDays + ' days ago';
      summaryText = bestItem.label + ' · ' + whenStr;
    }

    html += '<div>'
      + '<div style="font-family:var(--ui);font-size:0.62rem;letter-spacing:0.12em;color:var(--ink-light);opacity:0.75;margin-bottom:5px">' + strand.label + (strand.sub ? '<span style="letter-spacing:0;opacity:0.6;margin-left:6px;font-size:0.58rem">' + strand.sub + '</span>' : '') + '</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:5px">';

    for (const item of strand.items) {
      const days = daysSince(rec[item.key]);
      const col = cellColor(days);
      const op = cellOpacity(days);
      const sub = daysLabel(days);
      const clickFn = item.panelFn ? item.panelFn : "showPanel('" + item.panel + "')";
      html += '<div onclick="' + clickFn + '" title="' + item.label + (days !== null ? ': ' + (days === 0 ? 'today' : days + ' days ago') : ': never') + '" '
        + 'style="cursor:pointer;width:76px;height:58px;border-radius:5px;background:' + col + ';opacity:' + op + ';'
        + 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:1px solid ' + (days === null ? 'var(--border)' : 'rgba(255,255,255,0.08)') + '">'
        + '<span style="font-family:var(--ui);font-size:0.62rem;color:' + cellTextColor(days) + ';font-weight:700;text-align:center;line-height:1.2;padding:0 3px;word-break:break-word;hyphens:auto">' + item.label + '</span>'
        + (sub ? '<span style="font-family:var(--ui);font-size:0.62rem;color:' + cellTextColor(days) + ';opacity:0.75">' + sub + '</span>' : '')
        + '</div>';
    }

    html += '</div>'; // end tiles row
    // Summary line — most recent activity in this strand
    if (summaryText) {
      html += '<div style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light);margin-top:4px;padding-left:2px;line-height:1.4">' + summaryText + '</div>';
    }
    html += '</div>'; // end strand block
  }

  // Legend
  html += '<div style="display:flex;gap:10px;margin-top:8px;font-family:var(--ui);font-size:0.6rem;color:var(--ink-light)">'
    + '<span><span style="display:inline-block;width:6px;height:6px;border-radius:2px;background:var(--teal);margin-right:3px;vertical-align:middle"></span>≤2d</span>'
    + '<span><span style="display:inline-block;width:6px;height:6px;border-radius:2px;background:var(--gold,#c8a84b);margin-right:3px;vertical-align:middle"></span>3–6d</span>'
    + '<span><span style="display:inline-block;width:6px;height:6px;border-radius:2px;background:#e05050;margin-right:3px;vertical-align:middle"></span>7d+</span>'
    + '<span><span style="display:inline-block;width:6px;height:6px;border-radius:2px;background:var(--paper-mid,#1a1a1a);border:1px solid var(--border);margin-right:3px;vertical-align:middle"></span>never</span>'
    + '</div>';

  el.innerHTML = html;
}

window['renderFourStrandRecency'] = renderFourStrandRecency;
window['drillLastCompletedWrite'] = drillLastCompletedWrite;

// ── Conjugation mastery display ───────────────────────────────────────────────
// Shows SRS-based mastery for each grammar pattern (form|pol|reg).
// Uses ease factor and recent history to show trajectory (improving/stable/slipping).
// ── Mastery view state ────────────────────────────────────────────────────────
let _masteryView = 'all';

// ── Time window helpers ───────────────────────────────────────────────────────
function _weekBounds(weeksAgo = 0) {
  const now  = new Date();
  const day  = now.getDay();
  const mon  = new Date(now);
  mon.setHours(0, 0, 0, 0);
  mon.setDate(now.getDate() - ((day + 6) % 7) - weeksAgo * 7);
  const sun  = new Date(mon);
  sun.setDate(mon.getDate() + 7);
  return { from: mon.getTime(), to: sun.getTime() };
}

function _todayBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return { from: start, to: start + 86400000 };
}

function _filterHistory(history, view) {
  if (!history || !history.length) return [];
  if (view === 'all') return history;
  const bounds = view === 'last' ? _todayBounds()
               : view === 'week' ? _weekBounds(0)
               :                   _weekBounds(1);
  return history.filter(h => h.t >= bounds.from && h.t < bounds.to);
}

// Returns {pct, fallback} or null if truly no data.
// Falls back to all-time history when period is empty.
// Falls back to running totals when history is empty (pre-history data).
function _accuracyFromHistory(history, view, entry) {
  const hist = history || [];

  // Try period-filtered history first
  if (hist.length) {
    let entries = _filterHistory(hist, view);
    const periodEmpty = view !== 'all' && !entries.length;
    if (periodEmpty && view === 'last') return null; // no data today — show grey, not stale
    if (periodEmpty) entries = hist; // fallback to all-time for week/month views
    if (entries.length) {
      const correct = entries.filter(h => h.correct).length;
      return { pct: Math.round((correct / entries.length) * 100), fallback: periodEmpty };
    }
  }

  // No history at all — fall back to running totals if entry provided (not for today view)
  if (entry && view !== 'last') {
    const wrong = (entry.wrongCounter || 0) + (entry.wrongPhonetic || 0);
    const streak = entry.streak || 0;
    // Estimate: streak correct answers + wrong answers = total attempts
    const total = streak + wrong;
    if (total === 0) return null;
    const pct = Math.round((streak / total) * 100);
    return { pct, fallback: true };
  }

  return null;
}


// ── Strand Balance Chart ──────────────────────────────────────────────────────
async function renderStrandMini() {
  const el = document.getElementById('strandMini');
  if (!el) return;
  try {
    const SM = App.StudentModel || window.StudentModel;
    if (!SM) return;
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const snap = await SM.snapshotAsync(since);
    const sb = snap.strandBalance;
    if (!sb || !sb.hasData) {
      el.innerHTML = '<div style="width:36px;height:4px;background:var(--border);border-radius:2px"></div>'.repeat(4);
      return;
    }
    const total = sb.totalMins || 1;
    const _yoshiMins = sb.yoshiMins || {};
    const _totalNoYoshi = Math.max(1, total - Object.values(_yoshiMins).reduce((a,b)=>a+b,0));
    el.innerHTML = [1,2,3,4].map(n => {
      const mins = sb.strands[n] || 0;
      const yMins = _yoshiMins[n] || 0;
      const dispMins = _strandShowYoshi ? mins : Math.max(0, mins - yMins);
      const dispPct  = _strandShowYoshi ? Math.round(mins/total*100) : Math.round(dispMins/_totalNoYoshi*100);
      const pct = dispPct;
      const color = dispMins === 0 ? 'var(--border)' : pct < 20 ? '#e87e00' : 'var(--accent, #5b8)';
      return '<div style="width:36px;height:5px;background:var(--border);border-radius:2px;overflow:hidden">'
        + '<div style="width:' + pct + '%;height:100%;background:' + color + ';border-radius:2px;transition:width 0.4s"></div>'
        + '</div>';
    }).join('');
  } catch(e) { el.innerHTML = ''; }
}

async function renderStrandBalance() {
  const el = document.getElementById('strandBalanceChart');
  if (!el) return;
  try {
    const SM = App.StudentModel || window.StudentModel;
    if (!SM) { el.innerHTML = ''; return; }
    const rangeEl = document.querySelector('input[name="progressRange"]:checked');
    const range = rangeEl ? rangeEl.value : 'week';
    const DAY = 86400000;
    let since;
    if (range === 'today')     since = new Date(new Date().toDateString()).toISOString();
    else if (range === 'week') since = new Date(Date.now() - 7 * DAY).toISOString();
    else if (range === 'prev') since = new Date(Date.now() - 14 * DAY).toISOString();
    else                       since = new Date(Date.now() - 365 * DAY).toISOString();
    const s = await SM.snapshotAsync(since);
    const sb = s.strandBalance;
    if (!sb || !sb.hasData) {
      el.innerHTML = '<div style="font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);opacity:0.6;padding:6px 0">No session data yet — spend time in panels to see balance.</div>';
      return;
    }
    const LABELS = { 1: 'Input', 2: 'Output', 3: 'Deliberate', 4: 'Fluency' };
    const total = sb.totalMins || 1;
    const sessions = sb.sessions || {};
    const rows = [1, 2, 3, 4].map(n => {
      const mins = sb.strands[n] || 0;
      const pct  = total > 0 ? Math.round(mins / total * 100) : 0;
      const yMins = (sb.yoshiMins || {})[n] || 0;
      const yPct  = total > 0 ? Math.round(yMins / total * 100) : 0;
      const oPct  = Math.max(0, pct - yPct);
      const totalNoYoshi = Math.max(1, total - Object.values(sb.yoshiMins || {}).reduce((a,b) => a+b, 0));
      const dispMins = _strandShowYoshi ? mins : Math.max(0, mins - yMins);
      const dispPct  = _strandShowYoshi ? pct : Math.round(dispMins / totalNoYoshi * 100);
      const color = dispMins === 0 ? 'var(--error, #e05)' : dispPct < 20 ? '#e87e00' : 'var(--accent, #5b8)';
      const yoshiColor = '#4a9eff';
      const barHtml = (_strandShowYoshi && yPct > 0)
        ? `<div style="width:${yPct}%;height:100%;background:${yoshiColor};border-radius:3px 0 0 3px;display:inline-block;vertical-align:top"></div><div style="width:${oPct}%;height:100%;background:${color};display:inline-block;vertical-align:top"></div>`
        : `<div style="width:${dispPct}%;height:100%;background:${color};border-radius:3px;transition:width 0.3s"></div>`;
      return `<div style="margin-bottom:7px">
        <div style="font-family:var(--ui);font-size:0.72rem;margin-bottom:2px;color:var(--ink)">${n} — ${LABELS[n]}</div>
        <div style="background:var(--border);border-radius:3px;height:7px;overflow:hidden">${barHtml}</div>
      </div>`;
    }).join('');
    el.innerHTML = rows;
  } catch(e) { console.warn('[renderStrandBalance]', e); el.innerHTML = ''; }
}


// ── Strand Yoshi Toggle ──────────────────────────────────────────────────────
let _strandShowYoshi = true;
function strandToggleYoshi() {
  _strandShowYoshi = !_strandShowYoshi;
  const btn = document.getElementById('strandYoshiToggle');
  if (btn) {
    btn.style.borderColor = _strandShowYoshi ? 'var(--teal)' : '';
    btn.style.color = _strandShowYoshi ? 'var(--teal)' : '';
  }
  renderStrandBalance();
  try { (App.renderStrandMini || window.renderStrandMini)?.(); } catch(e) {}
}

// ── Strand Weights ────────────────────────────────────────────────────────────
const STRAND_WEIGHTS_KEY = 'STRAND_WEIGHTS';
const STRAND_WEIGHTS_DEFAULTS = {
  sentences:   { label: 'Sentence Building',  s1:0,   s2:100, s3:50,  s4:0  },
  voice:       { label: 'Voice (general)',        s1:50,  s2:50,  s3:0,   s4:0  },
  yoshi:       { label: 'Yoshi / lesson session', s1:50,  s2:50,  s3:0,   s4:0  },
  fluency432:  { label: '4/3/2',                  s1:0,   s2:0,   s3:0,   s4:100},
  readaloud:   { label: 'Read-aloud',             s1:0,   s2:50,  s3:0,   s4:50 },
  conjugation: { label: 'Conjugation drill',      s1:0,   s2:0,   s3:100, s4:0  },
  kana:        { label: 'Kana drill',             s1:0,   s2:0,   s3:100, s4:0  },
  words:       { label: 'Words / SRS',            s1:0,   s2:0,   s3:100, s4:0  },
  times:       { label: 'Times drill',            s1:0,   s2:0,   s3:100, s4:0  },
  counters:    { label: 'Counters / DrillCard',   s1:0,   s2:0,   s3:100, s4:0  },
  writing:     { label: 'Writing',                s1:0,   s2:100, s3:0,   s4:0  },
  read:        { label: 'Read panel',             s1:100, s2:0,   s3:0,   s4:0  },
  listen:      { label: 'Listen panel',           s1:100, s2:0,   s3:0,   s4:0  },
  video:       { label: 'Video',                  s1:100, s2:0,   s3:0,   s4:0  },
};

function strandWeightsLoad() {
  try {
    const saved = (App.Storage || window.Storage).getJSON(STRAND_WEIGHTS_KEY, null);
    if (saved) return saved;
  } catch(e) {}
  // Return defaults (not saved)
  const out = {};
  for (const [k, v] of Object.entries(STRAND_WEIGHTS_DEFAULTS)) {
    out[k] = { s1: v.s1, s2: v.s2, s3: v.s3, s4: v.s4 };
  }
  return out;
}

function strandWeightsRender() {
  const el = document.getElementById('strandWeightsGrid');
  if (!el) return;
  const current = strandWeightsLoad();
  const inputStyle = 'width:52px;padding:3px 4px;font-family:var(--ui);font-size:inherit;background:var(--paper-dark);border:1px solid var(--border);border-radius:3px;color:var(--ink);text-align:center';
  const rows = Object.entries(STRAND_WEIGHTS_DEFAULTS).map(([key, def]) => {
    const val = current[key] || def;
    return `<div style="display:grid;grid-template-columns:1fr 60px 60px 60px 60px;gap:6px;align-items:center;margin-bottom:5px">
      <div style="font-family:var(--ui);font-size:inherit;color:var(--ink)">${def.label}</div>
      <input type="number" id="sw_${key}_s1" min="0" max="100" value="${val.s1}" oninput="strandWeightsSave()" style="${inputStyle}">
      <input type="number" id="sw_${key}_s2" min="0" max="100" value="${val.s2}" oninput="strandWeightsSave()" style="${inputStyle}">
      <input type="number" id="sw_${key}_s3" min="0" max="100" value="${val.s3}" oninput="strandWeightsSave()" style="${inputStyle}">
      <input type="number" id="sw_${key}_s4" min="0" max="100" value="${val.s4}" oninput="strandWeightsSave()" style="${inputStyle}">
    </div>`;
  }).join('');
  el.innerHTML = rows;
}

function strandWeightsSave() {
  const out = {};
  for (const key of Object.keys(STRAND_WEIGHTS_DEFAULTS)) {
    out[key] = {
      s1: parseInt(document.getElementById(`sw_${key}_s1`)?.value || 0),
      s2: parseInt(document.getElementById(`sw_${key}_s2`)?.value || 0),
      s3: parseInt(document.getElementById(`sw_${key}_s3`)?.value || 0),
      s4: parseInt(document.getElementById(`sw_${key}_s4`)?.value || 0),
    };
  }
  try {
    (App.Storage || window.Storage).setJSON(STRAND_WEIGHTS_KEY, out);
    const msg = document.getElementById('strandWeightsMsg');
    if (msg) { msg.style.display = 'inline'; setTimeout(() => msg.style.display = 'none', 2000); }
    try { (App.StudentModel || window.StudentModel)?.invalidate(); } catch(e) {}
    try { (App.renderStrandBalance || window.renderStrandBalance)?.(); } catch(e) {}
  } catch(e) { console.warn('[strandWeightsSave]', e); }
}

// ── Radio button controls ─────────────────────────────────────────────────────
function masteryViewSet(view) {
  _masteryView = view;
  renderConjMastery();
  renderAdjMastery();
  renderCounterMastery();
  progressRenderErrors();
  try { (App.renderSpokenErrorsProgress || window.renderSpokenErrorsProgress)?.(); } catch(e) {}
}

// ── Conjugation Mastery ────────────────────────────────────────────────────────
function renderConjMastery() {
  const el = document.getElementById('conjMasteryPanel');
  if (!el) return;

  const FORM_LABELS = {
    present:            'Present',
    past:               'Past',
    te:                 'Te-form',
    volitional:         'Volitional',
    passive:            'Passive',
    potential:          'Potential',
    causative:          'Causative',
    'causative-passive':'Caus-Passive',
    conditional:        'Conditional',
    imperative:         'Imperative',
    desire:             'Want (~たい)',
  };
  const REG_LABELS = { polite: 'Polite', plain: 'Plain' };
  const POL_LABELS = { aff: '', neg: 'Neg ' };

  let allSrs = {};
  try { allSrs = DrillSRS.getAll(STORAGE_KEYS.DRILL_SRS_CONJ); } catch(e) {}

  // Per-verb keys are 'verb-form-pol-reg'; aggregate by 'form|pol|reg' for the chart
  const aggregated = {}; // 'form|pol|reg' → [{t, correct}]
  for (const [key, srs] of Object.entries(allSrs)) {
    if (!srs || !srs.history || !srs.history.length) continue;
    // Try per-verb format: verb-form-pol-reg
    const parts = key.split('-');
    if (parts.length >= 4) {
      const reg  = parts[parts.length - 1];
      const pol  = parts[parts.length - 2];
      const form = parts[parts.length - 3];
      const agg  = form + '|' + pol + '|' + reg;
      if (!aggregated[agg]) aggregated[agg] = [];
      aggregated[agg].push(...srs.history);
    } else {
      // Legacy aggregated format: form|pol|reg
      const [form, pol, reg] = key.split('|');
      if (form && pol && reg && srs.seen > 0) {
        const agg = key;
        if (!aggregated[agg]) aggregated[agg] = [];
        aggregated[agg].push(...srs.history);
      }
    }
  }

  if (!Object.keys(aggregated).length) {
    el.innerHTML = '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light);opacity:0.6;padding:8px 0">No conjugation data yet.</div>';
    return;
  }

  const byForm = {};
  for (const [key, hist] of Object.entries(aggregated)) {
    const [form, pol, reg] = key.split('|');
    if (!form || !pol || !reg) continue;
    if (!byForm[form]) byForm[form] = [];

    let mastery, label2, barColor;
    const accResult = _accuracyFromHistory(hist, _masteryView);
    if (accResult === null) continue; // no data at all

    const acc      = accResult.pct;
    const fallback = accResult.fallback;
    mastery   = acc;
    barColor  = acc >= 80 ? 'var(--teal)' : acc >= 50 ? 'var(--gold)' : 'var(--red)';
    label2    = acc + '%' + (fallback ? '*' : '');

    // Trajectory from last 3 overall history entries (sorted by time)
    const recent = hist.slice().sort((a,b)=>a.t-b.t).slice(-3);
    const recentCorrect = recent.filter(h => h.correct).length;
    const trajectory = recent.length < 2 ? 'new'
                     : recentCorrect === recent.length ? 'up'
                     : recentCorrect === 0             ? 'down'
                     : 'stable';

    byForm[form].push({ form, pol, reg, mastery, barColor, label2, trajectory });
  }

  if (!Object.keys(byForm).length) {
    const periodLabel = _masteryView === 'last' ? 'today' : _masteryView === 'week' ? 'this week' : 'last week';
    el.innerHTML = `<div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light);opacity:0.6;padding:8px 0">No conjugation drilled ${periodLabel}.</div>`;
    return;
  }

  let html = '';
  // ── Verb class breakdown ──────────────────────────────────────────────────
  // Build verb→class lookup from global arrays
  const verbClassMap = {};
  const CLASS_LABELS = { u: 'Godan', ru: 'Ichidan', irr: 'Irregular', 'i-adj': 'い-adj', 'na-adj': 'な-adj' };
  const CLASS_ORDER  = ['u', 'ru', 'irr', 'i-adj', 'na-adj'];
  try {
    const allVerbs = [
      ...(typeof VERBS_U  !== 'undefined' ? VERBS_U  : []),
      ...(typeof VERBS_RU !== 'undefined' ? VERBS_RU : []),
      ...(typeof VERBS_IRR!== 'undefined' ? VERBS_IRR: []),
      ...(typeof ADJ_I    !== 'undefined' ? ADJ_I    : []),
      ...(typeof ADJ_NA   !== 'undefined' ? ADJ_NA   : []),
    ];
    allVerbs.forEach(function(v) { if (v.dict) verbClassMap[v.dict] = v.type || 'u'; });
  } catch(e) {}

  // Aggregate history by verb class + form
  const byClass = {}; // class → form → [{t, correct}]
  for (const [key, srs] of Object.entries(allSrs)) {
    if (!srs || !srs.history || !srs.history.length) continue;
    const parts = key.split('-');
    if (parts.length < 4) continue;
    const verbDict = parts.slice(0, parts.length - 3).join('-');
    const form     = parts[parts.length - 3];
    const cls      = verbClassMap[verbDict] || null;
    if (!cls || !form) continue;
    if (!byClass[cls]) byClass[cls] = {};
    if (!byClass[cls][form]) byClass[cls][form] = [];
    byClass[cls][form].push(...srs.history);
  }

  // Render class breakdown section
  const classKeys = CLASS_ORDER.filter(c => byClass[c]);
  if (classKeys.length) {
    html += '<div style="margin-bottom:14px">';
    html += '<div style="font-family:var(--ui);font-size:0.68rem;letter-spacing:0.08em;color:var(--ink-light);margin-bottom:8px">BY VERB CLASS</div>';
    for (const cls of classKeys) {
      const formData = byClass[cls];
      // Aggregate all forms for this class into one bar
      const allHist = Object.values(formData).flat();
      const accResult = _accuracyFromHistory(allHist, _masteryView);
      if (!accResult) continue;
      const acc      = accResult.pct;
      const fallback = accResult.fallback;
      // Fixed identity colours per verb class — distinct from the accuracy colours used in form bars
      const CLASS_COLORS = { u: '#a78bfa', ru: '#fb923c', irr: '#60a5fa', 'i-adj': '#f472b6', 'na-adj': '#34d399' };
      const barColor = CLASS_COLORS[cls] || 'var(--ink-light)';
      // Also show per-form mini bars for this class
      const formBars = Object.entries(formData)
        .map(([f, hist]) => {
          const ar = _accuracyFromHistory(hist, _masteryView);
          if (!ar) return '';
          return `<span style="font-family:var(--ui);font-size:0.65rem;color:var(--ink-light);margin-right:8px">${FORM_LABELS[f] || f} ${ar.pct}%${ar.fallback?'*':''}</span>`;
        }).join('');
      html += `<div style="margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
          <div style="font-family:var(--ui);font-size:inherit;color:var(--ink);min-width:80px">${CLASS_LABELS[cls]}</div>
          <div style="flex:1;height:8px;background:var(--paper);border-radius:4px;overflow:hidden">
            <div style="width:${acc}%;height:100%;background:${barColor};border-radius:4px;transition:width 0.4s"></div>
          </div>
          <div style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light);min-width:36px;text-align:right">${acc}%${fallback?'*':''}</div>
        </div>
        <div style="padding-left:88px">${formBars}</div>
      </div>`;
    }
    html += '</div>';
    html += '<div style="border-top:1px solid var(--border);margin-bottom:12px"></div>';
  }

  // ── Form / polarity breakdown ─────────────────────────────────────────────
  // Show all forms found in data, not just the hardcoded 7
  const knownForms = ['present','past','te','volitional','passive','potential','causative',
                      'causative-passive','conditional','imperative','desire'];
  const allForms = [...new Set([...knownForms, ...Object.keys(byForm)])];

  for (const form of allForms) {
    const patterns = byForm[form];
    if (!patterns) continue;

    html += `<div style="margin-bottom:10px">
      <div style="font-family:var(--ui);font-size:0.68rem;letter-spacing:0.08em;color:var(--ink-light);margin-bottom:6px">${(FORM_LABELS[form] || form).toUpperCase()}</div>
      <div style="display:flex;flex-direction:column;gap:4px">`;

    patterns.sort((a, b) => {
      const aRank = (a.pol === 'neg' ? 0 : 2) + (a.reg === 'polite' ? 0 : 1);
      const bRank = (b.pol === 'neg' ? 0 : 2) + (b.reg === 'polite' ? 0 : 1);
      return aRank - bRank;
    });

    for (const p of patterns) {
      const label = POL_LABELS[p.pol] + REG_LABELS[p.reg];
      const arrow = p.trajectory === 'up'     ? '<span style="color:var(--teal)">↑</span>'
                  : p.trajectory === 'down'   ? '<span style="color:var(--red)">↓</span>'
                  : p.trajectory === 'stable' ? '<span style="color:var(--ink-light)">→</span>'
                  : '<span style="color:var(--ink-light)">·</span>';

      html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <div style="font-family:var(--ui);font-size:0.72rem;color:var(--ink);min-width:90px">${label}</div>
        <div style="flex:1;height:6px;background:var(--paper);border-radius:3px;overflow:hidden">
          <div style="width:${p.mastery}%;height:100%;background:${p.barColor};border-radius:3px;transition:width 0.4s"></div>
        </div>
        <div style="font-family:var(--ui);font-size:0.68rem;color:var(--ink-light);min-width:32px;text-align:right">${p.label2}</div>
        <div style="width:14px;text-align:center;font-size:0.75rem">${arrow}</div>
      </div>`;
    }
    html += '</div></div><div style="border-bottom:1px solid var(--border);margin-top:12px"></div>';
  }

  el.innerHTML = html;
}
window['masteryViewSet']        = masteryViewSet;

// ── Adjective Mastery ─────────────────────────────────────────────────────────
function renderAdjMastery() {
  const el = document.getElementById('adjMasteryPanel');
  if (!el) return;

  const FORM_LABELS = { present:'Present', past:'Past', te:'Te-form' };
  const POL_LABELS  = { aff: '', neg: 'Neg ' };
  const REG_LABELS  = { polite: 'Polite', plain: 'Plain' };
  const CLASS_COLORS = { 'i-adj': '#f472b6', 'na-adj': '#34d399' };
  const CLASS_LABELS = { 'i-adj': 'い-adj', 'na-adj': 'な-adj' };

  let allSrs = {};
  try { allSrs = DrillSRS.getAll(STORAGE_KEYS.DRILL_SRS_CONJ); } catch(e) {}

  // Build verbClassMap for adj types only
  const verbClassMap = {};
  try {
    [...(typeof ADJ_I  !== 'undefined' ? ADJ_I  : []),
     ...(typeof ADJ_NA !== 'undefined' ? ADJ_NA : [])
    ].forEach(v => { if (v.dict) verbClassMap[v.dict] = v.type; });
  } catch(e) {}

  // Aggregate by adj class → form|pol|reg
  const byClass = {};
  for (const [key, srs] of Object.entries(allSrs)) {
    if (!srs || !srs.history || !srs.history.length) continue;
    const parts = key.split('-');
    if (parts.length < 4) continue;
    const verbDict = parts.slice(0, parts.length - 3).join('-');
    const form = parts[parts.length - 3];
    const pol  = parts[parts.length - 2];
    const reg  = parts[parts.length - 1];
    const cls  = verbClassMap[verbDict];
    if (cls !== 'i-adj' && cls !== 'na-adj') continue;
    if (!byClass[cls]) byClass[cls] = {};
    const agg = form + '|' + pol + '|' + reg;
    if (!byClass[cls][agg]) byClass[cls][agg] = [];
    byClass[cls][agg].push(...srs.history);
  }

  if (!Object.keys(byClass).length) {
    el.innerHTML = '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light);opacity:0.6;padding:8px 0">No adjective drill data yet.</div>';
    return;
  }

  let html = '';
  for (const cls of ['i-adj', 'na-adj']) {
    const forms = byClass[cls];
    if (!forms) continue;
    html += '<div style="font-family:var(--ui);font-size:0.68rem;letter-spacing:0.08em;color:var(--ink-light);margin-bottom:8px;margin-top:10px">' + CLASS_LABELS[cls].toUpperCase() + '</div>';
    const knownForms = ['present','past','te'];
    const allFormKeys = [...new Set([...knownForms, ...Object.keys(forms).map(k => k.split('|')[0])])];
    for (const form of allFormKeys) {
      const patterns = Object.entries(forms)
        .filter(([k]) => k.startsWith(form + '|'))
        .map(([k, hist]) => {
          const [,pol,reg] = k.split('|');
          const accResult = _accuracyFromHistory(hist, _masteryView);
          if (!accResult) return null;
          return { pol, reg, acc: accResult.pct, fallback: accResult.fallback };
        }).filter(Boolean);
      if (!patterns.length) continue;
      html += '<div style="margin-bottom:10px">';
      html += '<div style="font-family:var(--ui);font-size:0.68rem;letter-spacing:0.08em;color:var(--ink-light);margin-bottom:6px">' + (FORM_LABELS[form] || form).toUpperCase() + '</div>';
      patterns.sort((a,b) => ((a.pol==='neg'?0:2)+(a.reg==='polite'?0:1)) - ((b.pol==='neg'?0:2)+(b.reg==='polite'?0:1)));
      for (const p of patterns) {
        const label = POL_LABELS[p.pol] + REG_LABELS[p.reg];
        const color = p.acc >= 80 ? 'var(--teal)' : p.acc >= 50 ? 'var(--gold)' : 'var(--red)';
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">' +
          '<div style="font-family:var(--ui);font-size:0.72rem;color:var(--ink);min-width:90px">' + label + '</div>' +
          '<div style="flex:1;height:6px;background:var(--paper);border-radius:3px;overflow:hidden">' +
            '<div style="width:' + p.acc + '%;height:100%;background:' + color + ';border-radius:3px;transition:width 0.4s"></div>' +
          '</div>' +
          '<div style="font-family:var(--ui);font-size:0.68rem;color:var(--ink-light);min-width:32px;text-align:right">' + p.acc + '%' + (p.fallback?'*':'') + '</div>' +
        '</div>';
      }
      html += '</div>';
    }
    html += '<div style="border-top:1px solid var(--border);margin-top:4px;margin-bottom:8px"></div>';
  }

  el.innerHTML = html;
}

// ── Counter Mastery ────────────────────────────────────────────────────────────
function renderCounterMastery() {
  const el = document.getElementById('counterMasteryPanel');
  if (!el) return;

  const _Storage      = App.Storage || window.Storage;
  const _COUNTER_DATA = (typeof COUNTER_DATA !== 'undefined' && Object.keys(COUNTER_DATA).length)
    ? COUNTER_DATA : null;

  if (!_COUNTER_DATA) {
    el.innerHTML = '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light);opacity:0.6">No counter data loaded.</div>';
    return;
  }

  let cmData = {};
  try { cmData = _Storage?.getJSON(STORAGE_KEYS.COUNTER_MASTERY, {}) ?? {}; } catch(e) {}

  const NUMS = [1,2,3,4,5,6,7,8,9,10];
  const counterKeys = Object.keys(_COUNTER_DATA).sort();

  // Show counters that have any data at all — period filtering happens per-cell
  const attempted = counterKeys.filter(key =>
    NUMS.some(n => cmData[`${key}-${n}`])
  );

  if (!attempted.length) {
    el.innerHTML = '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light);opacity:0.6;padding:8px 0">No counter drill data yet — complete a session to see mastery.</div>';
    return;
  }

  let html = `<div style="overflow-x:auto">
    <table style="border-collapse:collapse;font-family:var(--ui);font-size:0.7rem">
      <thead><tr>
        <th style="text-align:left;padding:4px 8px 4px 0;color:var(--ink-light);font-weight:500;min-width:52px"></th>
        ${NUMS.map(n => `<th style="text-align:center;padding:2px 2px;color:var(--ink-light);font-weight:400;min-width:28px">${n}</th>`).join('')}
        <th style="text-align:right;padding:4px 0 4px 8px;color:var(--ink-light);font-weight:400;min-width:36px">score</th>
      </tr></thead>
      <tbody>`;

  for (const key of attempted) {
    const counter = _COUNTER_DATA[key];
    const label   = counter?.name || key;
    const emoji   = counter?.emoji?.[0] || '';

    let totalPts = 0, totalPoss = 0;

    const cells = NUMS.map(n => {
      const entry = cmData[`${key}-${n}`];

      if (!entry) return `<td style="text-align:center;padding:2px 3px"><div style="width:39px;height:26px;border-radius:3px;background:var(--paper-dark);margin:0 auto;opacity:0.3"></div></td>`;

      const hist      = entry.history || [];
      const accResult = _accuracyFromHistory(hist, _masteryView, entry);

      if (accResult === null) {
        return `<td style="text-align:center;padding:2px 3px"><div style="width:39px;height:26px;border-radius:3px;background:var(--paper-dark);margin:0 auto;opacity:0.4" title="${key}-${n}: no data"></div></td>`;
      }

      const acc      = accResult.pct;
      const fallback = accResult.fallback;

      totalPts  += acc;
      totalPoss += 100;

      const color = acc >= 85 ? 'var(--teal)'
                  : acc >= 65 ? '#28a87a'
                  : acc >= 40 ? 'var(--gold)'
                  : 'var(--red)';

      const usedEntries = fallback ? hist : _filterHistory(hist, _masteryView);
      const title = `${key}-${n}: ${acc}%${fallback ? ' (all time)' : ''} (${usedEntries.filter(h=>h.correct).length}/${usedEntries.length})`;

      return `<td style="text-align:center;padding:2px 3px" title="${title}">
        <div style="width:39px;height:26px;border-radius:3px;background:${color};margin:0 auto;display:flex;align-items:center;justify-content:center;font-size:0.7rem;color:#000;font-weight:600;opacity:${fallback ? '0.6' : '1'}">${acc}%</div>
      </td>`;
    });

    const rowPct   = totalPoss > 0 ? Math.round((totalPts / totalPoss) * 100) : 0;
    const rowColor = rowPct >= 80 ? 'var(--teal)' : rowPct >= 50 ? 'var(--gold)' : 'var(--red)';

    html += `<tr>
      <td style="padding:3px 8px 3px 0;white-space:nowrap">
        <span style="font-size:inherit;margin-right:3px">${emoji}</span>
        <span style="color:var(--ink)" title="${Object.values(counter?.readings || {}).slice(0,3).join(' · ')}...">〜${label}</span>
      </td>
      ${cells.join('')}
      <td style="text-align:right;padding:3px 0 3px 8px;color:${rowColor};font-weight:600">${rowPct > 0 ? rowPct + '%' : '—'}</td>
    </tr>`;
  }

  html += '</tbody></table></div>';

  // Legend
  html += `<div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap">
    ${[['≥85%','var(--teal)'],['65-84%','#28a87a'],['40-64%','var(--gold)'],['<40%','var(--red)'],['not drilled','var(--paper-dark)']].map(([lbl,col]) =>
      `<div style="display:flex;align-items:center;gap:4px;font-family:var(--ui);font-size:0.68rem;color:var(--ink-light)">
        <div style="width:12px;height:12px;border-radius:2px;background:${col}"></div>${lbl}
      </div>`
    ).join('')}
  </div>`;

  el.innerHTML = html;
}




// ── Grammar Coverage Grid ─────────────────────────────────────────────────────

async function renderGrammarCoverage() {
  const el = document.getElementById('grammarCoverageGrid');
  if (!el) return;

  if (typeof GrammarModel === 'undefined' || !GrammarModel.loaded) {
    el.innerHTML = '<div style="font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);opacity:0.5">Grammar model loading…</div>';
    if (typeof GrammarModel !== 'undefined') {
      GrammarModel.load().then(() => renderGrammarCoverage());
    }
    return;
  }

  // Always reload mastery from DB before rendering so overrides show immediately
  await GrammarModel.reload();

  const coverage = GrammarModel.getCoverageMap();

  // Gold dot: node IDs touched in the currently active Yoshi lesson (fallback: most recent)
  const activeGrammarIds = new Set();
  try {
    const _lessonId = (typeof LessonNotesState !== 'undefined' && LessonNotesState.currentLessonId)
      ? LessonNotesState.currentLessonId
      : null;
    const _egRows = _lessonId
      ? await window.db.query('SELECT extracted_grammar FROM lesson_sessions WHERE id = ?', [_lessonId])
      : await window.db.query('SELECT extracted_grammar FROM lesson_sessions WHERE extracted_grammar IS NOT NULL AND extracted_grammar != ? ORDER BY id DESC LIMIT 1', ['[]']);
    if (_egRows.length && _egRows[0].extracted_grammar) {
      JSON.parse(_egRows[0].extracted_grammar).forEach(id => activeGrammarIds.add(id));
    }
  } catch(e) {}

  // Group by Genki chapter
  const byChapter = {};
  for (const node of coverage) {
    const ch = node.genki ?? 0;
    if (!byChapter[ch]) byChapter[ch] = [];
    byChapter[ch].push(node);
  }

  const statusStyle = {
    mastered:  { bg: '#00b894', text: '#000', border: '#00b894' },
    confident: { bg: '#4a9eff', text: '#000', border: '#4a9eff' },
    partial:   { bg: '#e6a817', text: '#000', border: '#e6a817' },
    weak:      { bg: '#e05050', text: '#000', border: '#e05050' },
    untouched: { bg: 'var(--paper)', text: 'var(--ink)', border: 'var(--border)' },
  };

  // Map raw score to visual status (used for both override and evidence-based nodes)
  function scoreToStyle(rawScore, isOverride) {
    if (!isOverride && rawScore === 0) return statusStyle.untouched;
    if (rawScore >= 0.95) return statusStyle.mastered;
    if (rawScore >= 0.75) return statusStyle.confident;
    if (rawScore >= 0.55) return statusStyle.partial;
    if (rawScore > 0)     return statusStyle.weak;
    return statusStyle.untouched;
  }

  let html = '<div style="display:flex;flex-direction:column;gap:16px">';

  for (const ch of Object.keys(byChapter).sort((a,b) => a-b)) {
    const nodes = byChapter[ch];
    const allMastered = nodes.every(n => n.status === 'mastered' || n.status === 'override');
    const chColor = allMastered ? 'var(--teal)' : 'var(--ink-light)';

    html += '<div style="display:flex;align-items:flex-start;gap:8px">';
    html += '<div style="font-family:var(--ui);font-size:0.62rem;letter-spacing:0.1em;color:' + chColor + ';opacity:1;font-weight:600;min-width:32px;padding-top:7px;flex-shrink:0">Ch ' + ch + '</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:5px;flex:1">';

    for (const node of nodes) {
      const st = scoreToStyle(node.rawScore, node.override);

      let tip = node.label + ' · ' + node.score + '%';
      if (node.weakPrereqs.length) tip += ' · needs: ' + node.weakPrereqs.join(', ');
      if (node.override) tip += ' · manually set';
      if (node.questionCount > 0) tip += ' · ' + node.questionCount + ' question' + (node.questionCount > 1 ? 's' : '') + ' asked';

      // Question outline — fuchsia border, solid <7 days, dashed 7-30 days, none after 30
      let qBorder = '1px solid ' + st.border;
      if (node.questionCount > 0 && node.lastAsked) {
        const daysSince = (Date.now() - new Date(node.lastAsked).getTime()) / 86400000;
        if (daysSince < 7)       qBorder = '2px solid #e879f9';
        else if (daysSince < 30) qBorder = '2px dashed #e879f9';
      }

      // Encountered dot — teal dot if seen in Yoshi session within 30 days
      let encDot = '';
      if (node.encounterCount > 0 && node.lastEncountered) {
        const daysSinceEnc = (Date.now() - new Date(node.lastEncountered).getTime()) / 86400000;
        if (daysSinceEnc < 30) {
          encDot = '<span onclick="event.stopPropagation();grammarDismissEncounter(\'' + node.id + '\')" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--teal);margin-left:5px;flex-shrink:0;cursor:pointer" title="seen in Yoshi session — click to dismiss"></span>';
          if (node.lastEncountered) tip += ' · seen in session ' + Math.round(daysSinceEnc) + 'd ago';
        }
      }
      // Gold dot — node touched in active Yoshi session
      let goldDot = '';
      if (activeGrammarIds.has(node.id)) {
        goldDot = '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#ffe600;margin-left:6px;box-shadow:0 0 4px #ffe600;flex-shrink:0" title="covered in this lesson"></span>';
      }
      const _badge = goldDot ? '<span style="position:absolute;top:-4px;right:-4px;width:9px;height:9px;border-radius:50%;background:#ffe600;box-shadow:0 0 4px #ffe600;pointer-events:none"></span>' : '';
      html += '<div style="position:relative;display:inline-flex">'
        + '<div title="' + tip + '" '
        + 'data-nodeid="' + node.id + '" onclick="grammarNodeClick(\'' + node.id + '\')" '
        + 'style="cursor:pointer;padding:5px 10px;border-radius:5px;display:flex;align-items:center;'
        + 'background:' + st.bg + ';border:' + qBorder + ';'
        + 'font-family:var(--ui);font-size:0.76rem;color:' + st.text + ';'
        + 'white-space:nowrap">'
        + node.label + encDot
        + '</div>' + _badge + '</div>';

    }

    html += '</div></div>';
  }

  html += '</div>';
  el.innerHTML = html;
}

function grammarNodeClick(nodeId) {
  const node = GrammarModel.getNode(nodeId);
  if (!node) return;
  const coverage = GrammarModel.getCoverageMap();
  const m = coverage.find(n => n.id === nodeId);
  if (!m) return;

  const panel = document.getElementById('grammarDetailPanel');
  if (!panel) return;

  // Toggle off if same node clicked again
  if (panel.dataset.node === nodeId && panel.style.display !== 'none') {
    panel.style.display = 'none';
    panel.dataset.node = '';
    return;
  }
  panel.dataset.node = nodeId;

  const prereqs = node.prerequisites.map(p => {
    const pm = coverage.find(n => n.id === p);
    const isMet = pm && (pm.status === 'mastered' || pm.status === 'override');
    const col = isMet ? 'var(--teal)' : 'var(--red)';
    const label = pm?.label || p;
    return `<span style="color:${col};margin-right:8px">${isMet ? '✓' : '✗'} ${label}</span>`;
  }).join('') || '<span style="color:var(--ink-light)">none</span>';

  const _pill = document.querySelector('#grammarCoverageGrid [data-nodeid="' + nodeId + '"]');
  const statusCol = _pill ? _pill.style.background : 'var(--paper-dark)';
  const statusText = (statusCol === 'var(--paper-dark)' || !statusCol) ? 'var(--ink)' : '#000';

  const qSection = m.questionCount > 0
    ? `<div style="margin-top:8px;font-size:0.75rem;color:var(--ink-light)">
        Asked about <strong style="color:#e879f9">${m.questionCount}</strong> time${m.questionCount > 1 ? 's' : ''}
        ${m.lastAsked ? '· last ' + new Date(m.lastAsked).toLocaleDateString() : ''}
       </div>`
    : '';

  const weakSection = m.weakPrereqs.length
    ? `<div style="margin-top:8px;font-size:0.75rem;color:var(--red)">
        Unmet prerequisites: ${m.weakPrereqs.join(', ')}
       </div>`
    : '';

  // Highlight selected pill
  document.querySelectorAll('#grammarCoverageGrid [data-nodeid]').forEach(el => el.style.outline = '');
  const selectedPill = document.querySelector('#grammarCoverageGrid [data-nodeid="' + nodeId + '"]');
  if (selectedPill) selectedPill.style.outline = '2px solid var(--ink)';

  panel.style.display = 'block';
  panel.style.maxHeight = (document.getElementById('grammarCoverageGrid').offsetHeight || 600) + 'px';
  panel.style.overflowY = 'auto';
  panel.innerHTML = `
    <div onclick="grammarOverridePopup('${nodeId}')" title="Click to set override"
      style="display:inline-block;padding:5px 10px;border-radius:5px;background:${statusCol};color:${statusText};font-family:var(--ui);font-size:0.76rem;font-weight:600;cursor:pointer;margin-bottom:8px">${node.label}</div>
    ${node.prerequisites.length ? `<div style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light);margin-bottom:8px"><span style="opacity:0.6">Prerequisites: </span>${prereqs.replace(/✓\s*/g,"").replace(/✗\s*/g,"✗ ")}</div>` : ''}
    ${weakSection}
    ${qSection}
    ${node.notes ? `<div style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light);line-height:1.6;border-top:1px solid var(--border);padding-top:10px">${node.notes.replace(/\n/g,'<br>')}</div>` : ''}
    <div style="margin-top:14px">
      <button onclick="const p=document.getElementById('grammarDetailPanel');p.innerHTML='';p.dataset.node='';document.querySelectorAll('#grammarCoverageGrid [data-nodeid]').forEach(el=>el.style.outline='')"
        class="btn-action btn-xs">Clear</button>
    </div>
  `;
}

function grammarOverridePopup(nodeId) {
  const existing = document.getElementById('grammarOverrideModal');
  if (existing) existing.remove();
  const node = GrammarModel.getNode(nodeId);
  const label = node ? node.label : nodeId;
  const coverage = GrammarModel.getCoverageMap ? GrammarModel.getCoverageMap() : [];
  const cm = coverage.find(n => n.id === nodeId);
  const statusBg = cm ? (
    cm.status === 'mastered' || cm.status === 'override' ? '#00b894' :
    cm.status === 'confident' ? '#4a9eff' :
    cm.status === 'partial'   ? '#e6a817' :
    cm.status === 'weak'      ? '#e05050' : 'var(--paper-dark)'
  ) : 'var(--paper-dark)';
  const statusText = (cm && cm.status !== 'untouched') ? '#000' : 'var(--ink)';
  const options = [
    { label: 'weak',      score: 0.30, bg: '#e05050', text: '#fff' },
    { label: 'partial',   score: 0.60, bg: '#e6a817', text: '#000' },
    { label: 'confident', score: 0.80, bg: '#4a9eff', text: '#000' },
    { label: 'mastered',  score: 1.00, bg: '#00b894', text: '#000' },
  ];
  const modal = document.createElement('div');
  modal.id = 'grammarOverrideModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  modal.innerHTML = `
    <div style="background:var(--paper);border:1px solid var(--border);border-radius:10px;padding:20px 24px;min-width:260px;font-family:var(--ui)">
      <div style="font-size:0.78rem;color:var(--ink-light);margin-bottom:6px">Set override</div>
      <div style="display:inline-block;padding:5px 10px;border-radius:5px;background:${statusBg};color:${statusText};font-family:var(--ui);font-size:0.76rem;font-weight:600;margin-bottom:16px">${label}</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${options.map(o => `<button onclick="stGrammarSetOverride('${nodeId}',${o.score});document.getElementById('grammarOverrideModal').remove();renderGrammarCoverage()"
          style="padding:8px 14px;border-radius:6px;border:none;background:${o.bg};color:${o.text};font-family:var(--ui);font-size:0.82rem;cursor:pointer;text-align:left">${o.label}</button>`).join('')}
        <button onclick="document.getElementById('grammarOverrideModal').remove()"
          style="padding:8px 14px;border-radius:6px;border:1px solid var(--border);background:none;color:var(--ink-light);font-family:var(--ui);font-size:0.78rem;cursor:pointer;margin-top:4px">Cancel</button>
      </div>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

async function grammarDismissEncounter(nodeId) {
  const GM = (typeof GrammarModel !== 'undefined') ? GrammarModel : null;
  if (!GM) return;
  try {
    await GM.setOverride(nodeId, 1, 'dismissed');
    (App.renderGrammarCoverage || window.renderGrammarCoverage)();
  } catch(e) {}
}




// Generate N visually distinct colours by rotating hue around a base colour
function _pieSliceColors(baseHex, n) {
  // Parse hex to hsl, then rotate hue in steps
  const r = parseInt(baseHex.slice(1,3),16)/255;
  const g = parseInt(baseHex.slice(3,5),16)/255;
  const b = parseInt(baseHex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
  let h = 0;
  if (d) {
    if (max===r) h = ((g-b)/d + 6) % 6;
    else if (max===g) h = (b-r)/d + 2;
    else h = (r-g)/d + 4;
    h *= 60;
  }
  const l = (max+min)/2;
  const s = d ? d / (1 - Math.abs(2*l - 1)) : 0;
  const cols = [];
  for (let i = 0; i < n; i++) {
    const hue = Math.round((h + i * (300/Math.max(n,1))) % 360);
    const sat = Math.round(Math.max(40, s*100 - i*5));
    const lit = Math.round(Math.min(72, Math.max(38, l*100 + (i % 2 === 0 ? 0 : 12))));
    cols.push('hsl(' + hue + ',' + sat + '%,' + lit + '%)');
  }
  return cols;
}

function _renderErrorPie(chartEl, listEl, sorted, total, colors, labels) {
  const SIZE = 100, CX = 50, CY = 50, R = 46;
  let angle = -Math.PI / 2;
  let slices = '';
  for (const [key, count] of sorted) {
    const sweep = (count / total) * 2 * Math.PI;
    const x1 = CX + R * Math.cos(angle);
    const y1 = CY + R * Math.sin(angle);
    const x2 = CX + R * Math.cos(angle + sweep);
    const y2 = CY + R * Math.sin(angle + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    const col = colors[key] || '#888';
    const lbl = labels[key] || key;
    const pct = Math.round(count / total * 100);
    slices += '<path d="M' + CX + ',' + CY
      + ' L' + x1.toFixed(2) + ',' + y1.toFixed(2)
      + ' A' + R + ',' + R + ' 0 ' + large + ',1 '
      + x2.toFixed(2) + ',' + y2.toFixed(2) + ' Z"'
      + ' fill="' + col + '" opacity="0.9">'
      + '<title>' + lbl + ': ' + count + ' (' + pct + '%)</title></path>';
    angle += sweep;
  }
  const legendRows = sorted.slice(0, 5).map(([key, count]) => {
    const col = colors[key] || '#888';
    const lbl = labels[key] || key;
    const pct = Math.round(count / total * 100);
    return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">'
      + '<span style="font-family:var(--ui);font-size:inherit;color:var(--teal);font-weight:700;flex-shrink:0;min-width:32px;text-align:right">' + pct + '%</span>'
      + '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + col + ';flex-shrink:0"></span>'
      + '<span style="font-family:var(--ui);font-size:inherit;color:var(--ink);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + lbl + '">' + lbl + '</span>'
      + '</div>';
  }).join('');
  // Pie centred on top, legend below
  chartEl.innerHTML =
    '<div style="display:flex;flex-direction:column;align-items:center;gap:8px">'
    + '<svg viewBox="0 0 ' + SIZE + ' ' + SIZE + '" style="width:100px;height:100px">' + slices + '</svg>'
    + '<div style="width:100%">' + legendRows + '</div>'
    + '</div>';
  if (listEl) listEl.innerHTML = '';
}

// Render a sub-pie from a sorted [label,count] array with distinct colours
function _renderSubPie(container, title, subSorted, baseHex) {
  if (!subSorted.length) return;
  const total = subSorted.reduce((s,[,c])=>s+c,0);
  const cols = _pieSliceColors(baseHex, subSorted.length);
  const SIZE = 64, CX = 32, CY = 32, R = 28;
  let angle = -Math.PI / 2;
  let slices = '';
  for (let i = 0; i < subSorted.length; i++) {
    const [key, count] = subSorted[i];
    const sweep = (count / total) * 2 * Math.PI;
    const x1 = CX + R * Math.cos(angle);
    const y1 = CY + R * Math.sin(angle);
    const x2 = CX + R * Math.cos(angle + sweep);
    const y2 = CY + R * Math.sin(angle + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    const pct = Math.round(count / total * 100);
    slices += '<path d="M' + CX + ',' + CY
      + ' L' + x1.toFixed(2) + ',' + y1.toFixed(2)
      + ' A' + R + ',' + R + ' 0 ' + large + ',1 '
      + x2.toFixed(2) + ',' + y2.toFixed(2) + ' Z"'
      + ' fill="' + cols[i] + '" opacity="0.9">'
      + '<title>' + key + ': ' + pct + '%</title></path>';
    angle += sweep;
  }
  const legendRows = subSorted.map(([k,c],i) => {
    const pct = Math.round(c/total*100);
    return '<div style="display:flex;align-items:center;gap:5px;margin-bottom:3px">'
      + '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + cols[i] + ';flex-shrink:0"></span>'
      + '<span style="font-family:var(--ui);font-size:0.72rem;color:var(--ink);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + k + '">' + k + '</span>'
      + '<span style="font-family:var(--ui);font-size:0.7rem;color:var(--ink);opacity:0.6;flex-shrink:0">' + pct + '%</span>'
      + '</div>';
  }).join('');
  container.innerHTML +=
    '<div style="margin-top:10px">'
    + '<div style="font-family:var(--ui);font-size:0.68rem;letter-spacing:0.06em;color:var(--ink);opacity:0.75;margin-bottom:4px">' + title.toUpperCase() + '</div>'
    + '<div style="display:flex;align-items:center;gap:8px">'
    + '<svg width="' + SIZE + '" height="' + SIZE + '" viewBox="0 0 ' + SIZE + ' ' + SIZE + '" style="flex-shrink:0">' + slices + '</svg>'
    + '<div style="flex:1;min-width:0">' + legendRows + '</div>'
    + '</div></div>';
}

// ── Shared error display components ─────────────────────────────────────────
// Used by both written and spoken error panels.
// Changes here apply to both.

function renderErrorList(listEl, items) {
  // items: [{key, count, col, label?}]
  listEl.innerHTML = '<div style="display:flex;flex-direction:column;gap:6px">' +
    items.map(({key, count, col, label}) => {
      const safePat = (key || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
      const display = label || key;
      return '<button onclick="errorShowPopup(\'' + safePat + '\')" '
        + 'style="display:flex;align-items:center;gap:6px;background:none;border:none;cursor:pointer;'
        + 'padding:4px 6px;border-radius:4px;width:100%;text-align:left" '
        + 'onmouseout="this.style.background=\'none\'">'
        + '<span style="font-size:inherit;font-weight:700;color:' + col + ';flex-shrink:0;min-width:20px;text-align:right">' + count + '</span>'
        + '<span style="font-size:inherit;color:var(--ink);font-weight:600;flex:1;text-align:left;word-break:break-word">' + display + '</span>'
        + '<span style="font-size:0.65rem;color:var(--ink-light)">›</span>'
        + '</button>';
    }).join('') + '</div>';
}

function errorShowPopup(key) {
  const examples = (window._errorExamples || {})[key] || [];
  const col = (window._errorExampleColors || {})[key] || 'var(--teal)';

  document.getElementById('errorPopup')?.remove();

  const popup = document.createElement('div');
  popup.id = 'errorPopup';
  popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);'
    + 'background:var(--paper-dark);border:1px solid var(--border);border-radius:10px;'
    + 'padding:16px;min-width:280px;max-width:420px;max-height:70vh;overflow-y:auto;'
    + 'z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.5)';

  const rows = examples.map(e => {
    const input = e.input || e.userText || '';
    const corr  = e.corrected || e.correction || '';
    return '<div style="padding:10px 0;border-bottom:2px solid var(--border);margin-bottom:2px">'
      + (input && corr && input !== corr
          ? '<div style="font-family:var(--jp);font-size:1rem;color:#ff3333;margin-bottom:6px;line-height:1.4">' + input + '</div>'
            + '<div style="font-family:var(--jp);font-size:1rem;color:#5ddb8f;line-height:1.4">' + corr + '</div>'
          : '<div style="font-family:var(--jp);font-size:1rem;color:#5ddb8f;line-height:1.4">' + (corr || input) + '</div>')
      + '</div>';
  }).join('');

  popup.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'
    + '<span style="font-family:var(--ui);font-size:inherit;font-weight:700;color:' + col + '">' + key + '</span>'
    + '<button onclick="document.getElementById(\'errorPopup\').remove()" '
    + 'style="background:none;border:none;cursor:pointer;color:var(--ink-light);font-size:1.1rem;padding:0 4px">✕</button>'
    + '</div>'
    + (rows || '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light)">No examples yet</div>');

  document.body.appendChild(popup);
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', handler); }
    });
  }, 100);
}

function writtenErrorShowPopup(pat) {
  // Delegates to shared errorShowPopup
  window._errorExamples = window._writtenErrorExamples || {};
  window._errorExampleColors = {};
  Object.keys(window._errorExamples).forEach(k => window._errorExampleColors[k] = 'var(--teal)');
  errorShowPopup(pat);
}

async function progressRenderErrors() {
  const chartEl = document.getElementById('progress-error-chart');
  const listEl  = document.getElementById('progress-error-list');
  const emptyEl = document.getElementById('progress-error-empty');
  if (!chartEl || !listEl || !emptyEl) return;

  // Read from unified error_history table — all sources, timestamped
  let activeErrors = [];
  try {
    const bounds = _masteryView === 'last'     ? _todayBounds()
                 : _masteryView === 'week'     ? _weekBounds(0)
                 : (_masteryView === 'lastweek' || _masteryView === 'prev') ? _weekBounds(1)
                 : null;
    const sql = bounds
      ? 'SELECT source, errorType, pattern, input, corrected, t FROM error_history WHERE t >= ? AND t < ? ORDER BY t DESC LIMIT 500'
      : 'SELECT source, errorType, pattern, input, corrected, t FROM error_history ORDER BY t DESC LIMIT 500';
    const params = bounds ? [bounds.from, bounds.to] : [];
    const rows = await window.db?.query(sql, params) || [];
    // Aggregate by pattern for display
    const seen = {};
    for (const row of rows) {
      const key = row.pattern || row.errorType || '?';
      if (!seen[key]) seen[key] = { pattern: key, errorType: row.errorType, count: 0, input: row.input, corrected: row.corrected };
      seen[key].count++;
    }
    activeErrors = Object.values(seen);
  } catch(e) { console.error('[progressRenderErrors]', e); }

  if (activeErrors.length === 0) {
    chartEl.innerHTML = ''; listEl.innerHTML = '';
    emptyEl.style.display = 'block'; return;
  }
  emptyEl.style.display = 'none';

  // Build pattern list for left column
  const patDetails = {};
  for (const e of activeErrors) {
    const key = (e.pattern || e.errorType || '?').slice(0, 40);
    if (!patDetails[key]) patDetails[key] = { count: 0, type: e.errorType || '', input: e.input, corrected: e.corrected };
    patDetails[key].count += e.count;
  }
  const patSorted = Object.entries(patDetails).sort((a,b) => b[1].count - a[1].count).slice(0, 8);

  // Collect last 10 examples per pattern for popup
  const patExamples = {};
  for (const row of (await window.db?.query('SELECT errorType, pattern, input, corrected FROM error_history WHERE source=\'writing\' ORDER BY t DESC LIMIT 200') || [])) {
    const key = (row.pattern || row.errorType || '?').slice(0, 40);
    if (!patExamples[key]) patExamples[key] = [];
    if (patExamples[key].length < 10) patExamples[key].push(row);
  }
  window._writtenErrorExamples = patExamples;

  // Set shared popup data
  window._writtenErrorExamples = patExamples;
  window._errorExamples = patExamples;
  window._errorExampleColors = {};
  patSorted.forEach(([pat, d]) => window._errorExampleColors[pat] = ERROR_TYPE_COLORS[d.type] || 'var(--teal)');

  renderErrorList(listEl, patSorted.map(([pat, d]) => ({
    key: pat, count: d.count, col: ERROR_TYPE_COLORS[d.type] || 'var(--ink-light)'
  })));

  // Pie chart in right column — type breakdown
  const typeCounts = {};
  for (const e of activeErrors) typeCounts[e.errorType] = (typeCounts[e.errorType] || 0) + e.count;
  const sorted = Object.entries(typeCounts).sort((a,b) => b[1]-a[1]);
  const total = sorted.reduce((s,[,c]) => s+c, 0);
  if (total > 0) _renderErrorPieRight(chartEl, sorted, total);
  else chartEl.innerHTML = '';
}

function _renderErrorPieRight(el, sorted, total) {
  const SIZE = 120, CX = 60, CY = 60, R = 54;
  let angle = -Math.PI / 2;
  let slices = '';
  for (const [key, count] of sorted) {
    const sweep = (count / total) * 2 * Math.PI;
    const x1 = CX + R * Math.cos(angle);
    const y1 = CY + R * Math.sin(angle);
    const x2 = CX + R * Math.cos(angle + sweep);
    const y2 = CY + R * Math.sin(angle + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    const col = ERROR_TYPE_COLORS[key] || '#888';
    const lbl = ERROR_TYPE_LABELS[key] || key;
    const pct = Math.round(count / total * 100);
    // Single slice — draw full circle instead
    if (sorted.length === 1) {
      slices = '<circle cx="' + CX + '" cy="' + CY + '" r="' + R + '" fill="' + col + '" opacity="0.85">'
        + '<title>' + lbl + ': 100%</title></circle>';
    } else {
      slices += '<path d="M' + CX + ',' + CY
        + ' L' + x1.toFixed(2) + ',' + y1.toFixed(2)
        + ' A' + R + ',' + R + ' 0 ' + large + ',1 '
        + x2.toFixed(2) + ',' + y2.toFixed(2) + ' Z"'
        + ' fill="' + col + '" opacity="0.85">'
        + '<title>' + lbl + ': ' + count + ' (' + pct + '%)</title></path>';
    }
    angle += sweep;
  }
  // Legend below pie
  const legend = sorted.map(([key, count]) => {
    const col = ERROR_TYPE_COLORS[key] || '#888';
    const lbl = ERROR_TYPE_LABELS[key] || key;
    const pct = Math.round(count / total * 100);
    return '<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px">'
      + '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + col + ';flex-shrink:0"></span>'
      + '<span style="font-family:var(--ui);font-size:0.72rem;color:var(--ink)">' + lbl + ' ' + pct + '%</span>'
      + '</div>';
  }).join('');
  el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;gap:6px">'
    + '<svg viewBox="0 0 ' + SIZE + ' ' + SIZE + '" style="width:' + SIZE + 'px;height:' + SIZE + 'px">' + slices + '</svg>'
    + '<div style="width:100%">' + legend + '</div>'
    + '</div>';
}

function particleBreakdownToggle() {
  const chart  = document.getElementById('particleBreakdownChart');
  const btn    = document.getElementById('particleBreakdownBtn');
  if (!chart) return;
  const open = chart.style.display === 'none';
  chart.style.display = open ? 'block' : 'none';
  btn.textContent = open ? 'Hide' : 'Breakdown';
  if (open) particleBreakdownRender();
}

function particleBreakdownRender() {
  const chart = document.getElementById('particleBreakdownChart');
  if (!chart) return;
  const errors = window._particleErrors || [];
  if (!errors.length) { chart.innerHTML = '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light)">No particle errors recorded.</div>'; return; }

  // Sort by count desc
  const sorted = [...errors].sort((a, b) => b.count - a.count);
  const maxCount = sorted[0].count;
  const particleColor = ERROR_TYPE_COLORS['particle'] || '#ff6b6b';

  let html = '<div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">';
  for (const err of sorted) {
    const w = Math.round((err.count / maxCount) * 100);
    const safePattern = err.pattern.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    html +=
      '<div style="display:flex;align-items:center;gap:8px">'
      + '<div style="font-family:var(--ui);font-size:0.72rem;color:var(--ink);width:160px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + err.pattern + '">' + err.pattern + '</div>'
      + '<div style="flex:1;height:12px;background:var(--paper-mid,#1a1a1a);border-radius:2px;overflow:hidden">'
      + '<div style="width:' + w + '%;height:100%;background:' + particleColor + ';opacity:0.7;border-radius:2px"></div></div>'
      + '<div style="font-family:var(--ui);font-size:0.7rem;color:var(--ink-light);width:24px;flex-shrink:0;text-align:right">' + err.count + '</div>'
      + '<button class="btn-action btn-xs" style="flex-shrink:0" onclick="errorDenylistAdd(\'' + safePattern + '\')" title="Ignore">\u229b</button>'
      + '</div>';
  }
  html += '</div>';
  chart.innerHTML = html;
}


function gramSentPracticeError(pattern) {
  // Switch to grammar panel, sentences tab, and populate with the error pattern
  showPanel('grammar2');
  setTimeout(() => {
    gram2Switch('sent');
    setTimeout(() => {
      const input = document.getElementById('gramSentInput');
      if (input) {
        input.value = pattern;
        input.focus();
      }
    }, 100);
  }, 50);
}




// STROKE ORDER


// ═══════════════════════════════════════════════════════
// WEIGHTS SETTINGS TAB
// ═══════════════════════════════════════════════════════

const _origStSwitchTab = window.stSwitchTab || function(){};
window.stSwitchTab = function(tab) {
  const wp = document.getElementById('stPaneWeights');
  if (wp) wp.style.display = tab === 'weights' ? '' : 'none';
  const wtBtn = document.getElementById('stTabWeights');
  if (wtBtn) {
    wtBtn.style.borderBottomColor = tab === 'weights' ? 'var(--teal)' : 'transparent';
    wtBtn.style.color = tab === 'weights' ? 'var(--ink)' : 'var(--ink-light)';
  }
  _origStSwitchTab(tab);
  if (tab === 'weights') weightsRender();
};

const GRAMMAR_WEIGHT_LABELS = {
  lesson:           { label: 'Lesson / Yoshi session',      desc: 'Evidence from teacher transcripts and Yoshi writing sessions. Highest-confidence signal — real production under lesson conditions.' },
  speaking:         { label: 'Speaking practice',           desc: 'Voice conversation and round-trip sessions. Also used (negatively) for spoken errors — errors nudge the score down.' },
  writing:          { label: 'Writing panel',               desc: 'Writing studio production and error patterns. Errors are recorded as inverse evidence — they reduce the node score.' },
  conjugation_drill:{ label: 'Conjugation drill',           desc: 'Results from the conjugation drill. Correct answers raise the score for the relevant morphology nodes.' },
  counter_drill:    { label: 'Counter drill',               desc: 'Counter drill accuracy. Feeds the counting node.' },
  question:         { label: 'Question asked',              desc: 'A question was asked about this grammar point. Engagement signal only — questions alone cannot push a node past partial mastery.' },
};

const VOCAB_WEIGHT_INFO = [
  { label: 'JLPT level',           max: 15,  desc: 'N5 = 15pts, N4 = 10pts, unknown = 3pts. Foundation words get highest priority.' },
  { label: 'Frequency rank',        max: 20,  desc: 'Log-scaled. Rank 1 = 20pts, rank 500 ≈ 4pts, rank 1000+ ≈ 1pt. Common words prioritised over rare ones.' },
  { label: 'Lookup count',          max: 20,  desc: 'Looked up but not yet internalised. Diminishing returns: 1 lookup = 8pts, 3 = 15pts, 5+ = 20pts.' },
  { label: 'Production gap',        max: 25,  desc: 'Looked up 2+ times but never produced = highest signal. Produced at least once = −8pts (no need to over-drill known words).' },
  { label: 'Recency',               max: 15,  desc: 'Looked up in last 3 days = full 15pts. Decays to zero at 60+ days. Active working vocab gets priority.' },
  { label: 'SRS overdue bonus',     max: 20,  desc: 'Word is in SRS and overdue. Grows with days overdue: base 10pts + 2pts/day, capped at 20pts.' },
  { label: 'Lesson doc provenance', max: 15,  desc: 'Teacher-introduced vocabulary from lesson notes. Highest-confidence signal — always include in drill.' },
];

async function weightsRender() {
  const el = document.getElementById('stPaneWeights');
  if (!el) return;
  const GM = App.GrammarModel || window.GrammarModel;
  const currentWeights = GM && GM.getWeights ? GM.getWeights() : {};

  let html = '<div style="max-width:600px">';

  // ── Grammar mastery weights ──
  html += '<div style="font-family:var(--ui);font-size:0.72rem;letter-spacing:0.08em;color:var(--ink-light);margin-bottom:12px">GRAMMAR MASTERY WEIGHTS</div>';
  html += '<div style="font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-bottom:16px;line-height:1.6">Each evidence type contributes to a grammar node score based on its weight. Higher weight = more influence on whether a node shows as mastered. Changes apply immediately and persist across sessions.</div>';

  for (const [key, info] of Object.entries(GRAMMAR_WEIGHT_LABELS)) {
    const val = currentWeights[key] !== undefined ? currentWeights[key] : 0.5;
    html += '<div style="margin-bottom:16px;padding:14px;background:var(--paper-dark);border:1px solid var(--border);border-radius:8px">';
    html += '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">';
    html += '<span style="font-family:var(--ui);font-size:inherit;color:var(--ink);font-weight:600">' + info.label + '</span>';
    html += '<span id="wt-val-' + key + '" style="font-family:var(--ui);font-size:inherit;color:var(--teal);min-width:36px;text-align:right">' + val.toFixed(2) + '</span>';
    html += '</div>';
    html += '<input type="range" id="wt-' + key + '" min="0" max="2" step="0.05" value="' + val + '"';
    html += ' oninput="document.getElementById(&quot;wt-val-' + key + '&quot;).textContent=parseFloat(this.value).toFixed(2)"';
    html += ' style="width:100%;accent-color:var(--teal);margin-bottom:6px">';
    html += '<div style="display:flex;justify-content:space-between;font-family:var(--ui);font-size:0.65rem;color:var(--ink-light);margin-bottom:8px"><span>0</span><span>1.0 default</span><span>2.0</span></div>';
    html += '<div style="font-family:var(--ui);font-size:0.73rem;color:var(--ink-light);line-height:1.5">' + info.desc + '</div>';
    html += '</div>';
  }

  html += '<div style="display:flex;gap:10px;margin-bottom:32px">';
  html += '<button class="btn-action" onclick="(App.weightsSave||window.weightsSave)()">Save weights</button>';
  html += '<button class="btn-action" onclick="(App.weightsReset||window.weightsReset)()">Reset to defaults</button>';
  html += '<span id="wt-status" style="font-family:var(--ui);font-size:0.75rem;color:var(--teal);align-self:center"></span>';
  html += '</div>';

  // ── Vocab priority factors ──
  html += '<div style="font-family:var(--ui);font-size:0.72rem;letter-spacing:0.08em;color:var(--ink-light);margin-bottom:12px">VOCABULARY PRIORITY SCORE FACTORS</div>';
  html += '<div style="font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-bottom:16px;line-height:1.6">Each factor contributes up to its maximum to a 0–100 priority score. Higher score = appears earlier in the Words drill.</div>';
  html += '<div style="display:flex;flex-direction:column;gap:8px">';
  const totalMax = VOCAB_WEIGHT_INFO.reduce(function(s,f){ return s+f.max; }, 0);
  for (const factor of VOCAB_WEIGHT_INFO) {
    const barPct = Math.round((factor.max / totalMax) * 100);
    html += '<div style="padding:12px 14px;background:var(--paper-dark);border:1px solid var(--border);border-radius:8px">';
    html += '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">';
    html += '<span style="font-family:var(--ui);font-size:inherit;color:var(--ink);font-weight:600">' + factor.label + '</span>';
    html += '<span style="font-family:var(--ui);font-size:inherit;color:var(--ink-light)">max ' + factor.max + 'pts</span>';
    html += '</div>';
    html += '<div style="height:4px;background:var(--border);border-radius:2px;margin-bottom:8px">';
    html += '<div style="height:100%;width:' + barPct + '%;background:var(--gold);border-radius:2px"></div></div>';
    html += '<div style="font-family:var(--ui);font-size:0.73rem;color:var(--ink-light);line-height:1.5">' + factor.desc + '</div>';
    html += '</div>';
  }
  html += '</div></div>';

  el.innerHTML = html;
}

async function weightsSave() {
  const GM = App.GrammarModel || window.GrammarModel;
  if (!GM || !GM.saveWeightOverrides) return;
  const overrides = {};
  for (const key of Object.keys(GRAMMAR_WEIGHT_LABELS)) {
    const el = document.getElementById('wt-' + key);
    if (el) overrides[key] = parseFloat(el.value);
  }
  await GM.saveWeightOverrides(overrides);
  const status = document.getElementById('wt-status');
  if (status) { status.textContent = 'Saved ✓'; setTimeout(function(){ status.textContent = ''; }, 2000); }
  try { (App.renderGrammarCoverage || window.renderGrammarCoverage)(); } catch(e) {}
}

async function weightsReset() {
  if (!confirm('Reset all grammar weights to defaults?')) return;
  const GM = App.GrammarModel || window.GrammarModel;
  if (!GM || !GM.saveWeightOverrides) return;
  await GM.saveWeightOverrides({});
  await GM.load();
  weightsRender();
  const status = document.getElementById('wt-status');
  if (status) { status.textContent = 'Reset to defaults ✓'; setTimeout(function(){ status.textContent = ''; }, 2000); }
}

// ── Unified progress range selector ───────────────────────────────────────
function progRangeSet(val) {
  // Map to strandRange
  const strandMap = { today: 'week', week: 'week', prev: 'month', all: 'all' };
  // Map to masteryView
  const masteryMap = { today: 'last', week: 'week', prev: 'prev', all: 'all' };
  // Update hidden strandRange radios
  const sr = document.querySelector('input[name="strandRange"][value="' + strandMap[val] + '"]');
  if (sr) { sr.checked = true; }
  // Update mastery view
  (App.masteryViewSet || window.masteryViewSet)?.(masteryMap[val]);
  renderFourStrandRecency();
  (App.renderStrandBalance || window.renderStrandBalance)?.();
  try { (App.renderStrandMini || window.renderStrandMini)?.(); } catch(e) {}
}

// ── Sentence Building heatmap ─────────────────────────────────────────────
function renderGramSentHeatmap() {
  const wrap = document.getElementById('gramSentHeatmapWrap');
  const el   = document.getElementById('gramSentHeatmap');
  if (!el) return;
  const sessions = (App.Storage || window.Storage).getJSON(STORAGE_KEYS.GRAM_SENT_SESSIONS, []);
  if (!sessions.length) { if (el) el.innerHTML = '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light);opacity:0.6">No data yet — complete a sentence building session to see your heatmap.</div>'; return; }
  if (wrap) wrap.style.display = '';

  // Build week buckets — last 8 weeks
  const now = new Date();
  const weeks = [];
  for (let w = 7; w >= 0; w--) {
    const d = new Date(now);
    d.setDate(d.getDate() - w * 7);
    weeks.push(d.toISOString().slice(0, 10));
  }
  function weekIdx(dateStr) {
    for (let i = weeks.length - 1; i >= 0; i--) {
      if (dateStr >= weeks[i]) return i;
    }
    return -1;
  }

  // Group sessions by target + week
  const targets = [...new Set(sessions.map(s => s.target))];
  const grid = {}; // grid[target][weekIdx] = {ok, total, errors:[]}
  for (const s of sessions) {
    const wi = weekIdx(s.date);
    if (wi < 0) continue;
    if (!grid[s.target]) grid[s.target] = {};
    if (!grid[s.target][wi]) grid[s.target][wi] = { ok: 0, total: 0, errors: [] };
    grid[s.target][wi].ok    += s.ok || 0;
    grid[s.target][wi].total += s.total || 0;
    if (s.errors) grid[s.target][wi].errors.push(...s.errors);
  }

  // Week labels
  const weekLabels = weeks.map((w, i) => {
    const d = new Date(w);
    return i === weeks.length - 1 ? 'this wk' : 'W-' + (weeks.length - 1 - i);
  });

  // Render
  let html = '<div style="overflow-x:auto"><table style="border-collapse:collapse;font-family:var(--ui);font-size:0.65rem;width:100%">';
  html += '<tr><th style="text-align:left;padding:2px 6px;color:var(--ink-light);font-weight:400">Pattern</th>';
  for (const lbl of weekLabels) {
    html += '<th style="padding:2px 4px;color:var(--ink-light);font-weight:400;text-align:center">' + lbl + '</th>';
  }
  html += '</tr>';

  for (const target of targets) {
    html += '<tr><td style="padding:3px 6px;color:var(--ink);white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis" title="' + target + '">' + target + '</td>';
    for (let wi = 0; wi < weeks.length; wi++) {
      const cell = grid[target]?.[wi];
      if (!cell || !cell.total) {
        html += '<td style="padding:3px 4px;text-align:center"><div style="width:28px;height:18px;border-radius:3px;background:var(--paper-mid,#1a1a1a);margin:auto"></div></td>';
      } else {
        const pct = cell.ok / cell.total;
        const r = Math.round(224 * (1 - pct));
        const g = Math.round(180 * pct);
        const bg = 'rgb(' + r + ',' + g + ',80)';
        const errTypes = cell.errors.reduce((a, e) => { a[e.errorType] = (a[e.errorType]||0)+1; return a; }, {});
        const tooltip = 'Score: ' + cell.ok + '/' + cell.total + (Object.keys(errTypes).length ? ' | ' + Object.entries(errTypes).map(([k,v]) => k+':'+v).join(', ') : '');
        html += '<td style="padding:3px 4px;text-align:center"><div style="width:28px;height:18px;border-radius:3px;background:' + bg + ';margin:auto;cursor:default" title="' + tooltip + '"></div></td>';
      }
    }
    html += '</tr>';
  }
  html += '</table></div>';
  el.innerHTML = html;
}

// ── App registry — features-progress.js exports ───────────────────────────
Object.assign(App, {
  renderStrandMini, renderStrandBalance, strandToggleYoshi, strandWeightsRender, strandWeightsSave, strandWeightsLoad, renderFourStrandRecency, renderGramSentHeatmap, progRangeSet, renderConjMastery, renderAdjMastery, renderCounterMastery, renderGrammarCoverage, grammarNodeClick, drillLastCompletedWrite, particleBreakdownToggle, particleBreakdownRender, progressRenderErrors, progressRenderCost, apiUsageReset, apiUsageTrack, gramSentPracticeError, progressExport, progressImport,
  weightsRender, weightsSave, weightsReset,
  renderConjMastery, renderAdjMastery, renderCounterMastery, renderGrammarCoverage,
  grammarNodeClick, drillLastCompletedWrite,
  particleBreakdownToggle, particleBreakdownRender,
  progressRenderErrors, progressRenderCost, _renderErrorPieRight, writtenErrorShowPopup,
  renderErrorList, errorShowPopup,
  apiUsageReset, apiUsageTrack, gramSentPracticeError,
});
