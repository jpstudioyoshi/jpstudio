// ── Shared state for management window ───────────────────────────────────────
const STORAGE_KEY = 'jpStudioIssues';
const TYPES = {
  bug:         { emoji: '🐛', label: 'Bug',         color: 'var(--red)' },
  feature:     { emoji: '✨', label: 'Feature',     color: 'var(--teal)' },
  improvement: { emoji: '🔧', label: 'Improvement', color: 'var(--gold)' },
};
const PRIORITIES = {
  high:   { label: 'High',   color: 'var(--red)' },
  medium: { label: 'Medium', color: 'var(--gold)' },
  low:    { label: 'Low',    color: 'var(--ink-light)' },
};

let issues        = [];
let pendingDiffs  = {};
let selected      = new Set();
let activeIssue   = null;
let conversation  = [];
let loadedFiles   = {};
let allFiles      = [];
let mode          = 'fix';
let apiKey        = '';

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function saveIssues() {
  const json = JSON.stringify(issues);
  try { window.db.run("INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)", [STORAGE_KEY, json]); } catch(e) {}
  localStorage.setItem(STORAGE_KEY, json);
}
