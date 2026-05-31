// ── Listen Log (Satellite Sync) ────────────────────────────────────────────
const LISTEN_LOG_GIST_KEY   = 'jpsat_gist_id';
const LISTEN_LOG_TOKEN_KEY  = 'jpsat_gist_token';
const LISTEN_LOG_CACHE_KEY  = 'jpsat_listen_log_cache';

function listenLogGetSettings() {
  return {
    gistId: (App.Storage || window.Storage).get(LISTEN_LOG_GIST_KEY) || '',
    token:  (App.Storage || window.Storage).get(LISTEN_LOG_TOKEN_KEY) || ''
  };
}

function listenLogSaveSettings() {
  const gistId = document.getElementById('listenLogGistId')?.value.trim();
  const token  = document.getElementById('listenLogToken')?.value.trim();
  if (!gistId || !token) return;
  (App.Storage || window.Storage).set(LISTEN_LOG_GIST_KEY, gistId);
  (App.Storage || window.Storage).set(LISTEN_LOG_TOKEN_KEY, token);
  document.getElementById('listenLogSettingsPanel').style.display = 'none';
  listenLogSync();
}

function listenLogToggleSettings() {
  const panel = document.getElementById('listenLogSettingsPanel');
  const visible = panel.style.display !== 'none';
  panel.style.display = visible ? 'none' : 'block';
  if (!visible) {
    const s = listenLogGetSettings();
    document.getElementById('listenLogGistId').value = s.gistId;
    document.getElementById('listenLogToken').value  = s.token;
  }
}

async function listenLogSync() {
  const s = listenLogGetSettings();
  if (!s.gistId || !s.token) {
    document.getElementById('listenLogStatus').textContent = 'Not configured — tap ⚙';
    return;
  }
  const el = document.getElementById('listenLogStatus');
  el.textContent = 'Syncing…';
  try {
    const res = await fetch(`https://api.github.com/gists/${s.gistId}`, {
      headers: { Authorization: `token ${s.token}`, Accept: 'application/vnd.github.v3+json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const raw = data.files?.['listen-log.json']?.content || '[]';
    let log;
    try { log = JSON.parse(raw); } catch { log = []; }
    if (!Array.isArray(log)) log = [];
    (App.Storage || window.Storage).set(LISTEN_LOG_CACHE_KEY, JSON.stringify(log));
    listenLogRender(log);
  } catch(e) {
    el.textContent = 'Sync failed: ' + e.message;
  }
}

function listenLogRender(log) {
  const el = document.getElementById('listenLogDisplay');
  const statusEl = document.getElementById('listenLogStatus');
  if (!log || !log.length) { statusEl.textContent = 'No data yet'; el.innerHTML = ''; return; }
  const byDate = {};
  for (const entry of log) {
    if (!entry.date || !entry.filename || !entry.seconds) continue;
    if (!byDate[entry.date]) byDate[entry.date] = { total: 0, files: {} };
    byDate[entry.date].total += entry.seconds;
    byDate[entry.date].files[entry.filename] = (byDate[entry.date].files[entry.filename] || 0) + entry.seconds;
  }
  const dates = Object.keys(byDate).sort().reverse().slice(0, 14);
  const totalMins = Math.round(log.reduce((s, e) => s + (e.seconds || 0), 0) / 60);
  statusEl.textContent = `${totalMins} min total · ${log.length} sessions · synced ${new Date().toLocaleTimeString()}`;
  let html = '<div style="margin-top:8px">';
  for (const date of dates) {
    const d = byDate[date];
    const mins = Math.round(d.total / 60);
    const files = Object.entries(d.files).sort((a,b) => b[1]-a[1]);
    html += `<div style="margin-bottom:8px">
      <div style="font-family:var(--ui);font-size:0.65rem;color:var(--ink-light);margin-bottom:3px;display:flex;justify-content:space-between">
        <span>${date}</span><span style="color:var(--accent)">${mins} min</span>
      </div><div style="display:flex;flex-wrap:wrap;gap:4px">`;
    for (const [fname, secs] of files) {
      const fmins = Math.round(secs / 60);
      const short = fname.replace(/\.[^.]+$/, '').slice(0, 28);
      html += `<span style="font-family:var(--ui);font-size:0.62rem;background:var(--paper-dark);border:1px solid var(--border);border-radius:3px;padding:2px 6px;color:var(--ink)" title="${fname}">${short} · ${fmins}m</span>`;
    }
    html += '</div></div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

function listenLogInit() {
  try {
    const cached = (App.Storage || window.Storage).get(LISTEN_LOG_CACHE_KEY);
    if (cached) listenLogRender(JSON.parse(cached));
  } catch {}
}

Object.assign(App, { listenLogSync, listenLogToggleSettings, listenLogSaveSettings, listenLogInit });
