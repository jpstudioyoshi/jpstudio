// ── Diff parsing and file apply ──────────────────────────────────────────────
// Uses the `diff` library (node_modules/diff/dist/diff.js) for reliable patching.
// The Diff global is loaded before this file.

// ── Activity log ─────────────────────────────────────────────────────────────
const mgmtLog = [];
function logActivity(entry) {
  const record = Object.assign({ t: new Date().toISOString() }, entry);
  mgmtLog.push(record);
  try { window.files?.write('management-log.json', JSON.stringify(mgmtLog, null, 2)); } catch(e) {}
}

// ── Backups for undo ──────────────────────────────────────────────────────────
const mgmtBackups = {}; // filePath → original content before last write

async function writeFile(filePath, content) {
  try {
    // 1. Read current content for backup
    const current = loadedFiles[filePath] || (await window.files?.read(filePath))?.content || '';

    // 2. Size sanity check — warn if result is >20% smaller
    if (current.length > 100 && content.length < current.length * 0.8) {
      const ok = confirm('⚠ ' + filePath + '\nResult is ' + Math.round((1 - content.length/current.length)*100) + '% smaller than original (' + current.length + ' → ' + content.length + ' chars).\n\nApply anyway?');
      if (!ok) { logActivity({ action: 'write_rejected', filePath, reason: 'size_sanity' }); return false; }
    }

    // 3. Syntax check for JS files
    if (filePath.endsWith('.js')) {
      const check = await window.mgmt?.checkSyntax?.(content);
      if (check && !check.ok) {
        addMessage('system', '✗ Syntax error in ' + filePath + ' — not written.\n' + check.error);
        logActivity({ action: 'write_rejected', filePath, reason: 'syntax_error', error: check.error });
        return false;
      }
    }

    // 4. Save backup for undo
    mgmtBackups[filePath] = current;

    // 5. Write
    const result = await window.files?.write(filePath, content);
    const ok = result?.ok !== false;
    logActivity({ action: ok ? 'write_ok' : 'write_failed', filePath, fromLen: current.length, toLen: content.length });
    if (ok) renderUndoButton();
    return ok;
  } catch(e) {
    console.error('[apply] writeFile failed:', e);
    logActivity({ action: 'write_error', filePath, error: e.message });
    return false;
  }
}

async function undoLastWrite() {
  const files = Object.keys(mgmtBackups);
  if (!files.length) { alert('Nothing to undo'); return; }
  if (!confirm('Undo changes to:\n' + files.join('\n') + '\n\nThis restores the pre-apply versions.')) return;
  for (const fp of files) {
    await window.files?.write(fp, mgmtBackups[fp]);
    loadedFiles[fp] = mgmtBackups[fp];
    logActivity({ action: 'undo', filePath: fp });
  }
  delete mgmtBackups[fp];
  addMessage('system', '↩ Undone — ' + files.length + ' file(s) restored');
  renderUndoButton();
}

function renderUndoButton() {
  const bar = document.getElementById('apply-all-bar');
  if (!bar) return;
  const hasBackups = Object.keys(mgmtBackups).length > 0;
  const undoEl = document.getElementById('undo-btn');
  if (hasBackups && !undoEl) {
    const btn = document.createElement('button');
    btn.id = 'undo-btn';
    btn.textContent = '↩ Undo';
    btn.style.cssText = 'padding:6px 14px;background:none;border:1px solid var(--red);border-radius:5px;color:var(--red);font-family:var(--ui);font-size:0.82rem;cursor:pointer';
    btn.onclick = undoLastWrite;
    bar.appendChild(btn);
  } else if (!hasBackups && undoEl) {
    undoEl.remove();
  }
}

// ── Parse diff blocks from Claude response ────────────────────────────────────
function parseDiffs(text) {
  const diffs = {};
  // Match ```diff:path/to/file.js blocks containing ORIGINAL/MODIFIED
  const fenceRe = /```diff:([^\n]+)\n([\s\S]*?)```/g;
  let m;
  while ((m = fenceRe.exec(text)) !== null) {
    const filePath = m[1].trim();
    const body = m[2];
    const inner = body.match(/<<<<<<+\s*ORIGINAL\s*\n([\s\S]*?)={6,}\s*\n([\s\S]*?)>{6,}\s*MODIFIED/);
    if (!inner) continue;
    const id = 'diff_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    diffs[id] = { filePath, original: inner[1], modified: inner[2], diffBody: body };
  }
  // Fallback: bare ORIGINAL/MODIFIED blocks with File: hint
  if (!Object.keys(diffs).length) {
    const blockRe = /(?:(?:File|PATH|file|path):\s*([^\n]+)\n)?<<<<<<+\s*ORIGINAL\s*\n([\s\S]*?)={6,}\s*\n([\s\S]*?)>{6,}\s*MODIFIED/g;
    let lastFilePath = null;
    const fileHints = [...text.matchAll(/(?:in|to|update|edit|modify|change)\s+[`']?([\w./\-]+\.(?:js|html|css|json))[`']?/gi)];
    if (fileHints.length) lastFilePath = fileHints[0][1];
    while ((m = blockRe.exec(text)) !== null) {
      const filePath = (m[1] || lastFilePath || '').trim();
      if (!filePath) continue;
      const id = 'diff_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      diffs[id] = { filePath, original: m[2], modified: m[3], diffBody: m[0] };
    }
  }
  return diffs;
}

// ── Apply a single diff ───────────────────────────────────────────────────────
async function applyDiffById(diffId, filePath, diffBody) {
  const statusEl = document.getElementById('status_' + diffId);
  const applyBtn = document.getElementById('apply_' + diffId);

  const m = diffBody.match(/<<<<<<+\s*ORIGINAL\s*\n([\s\S]*?)={6,}\s*\n([\s\S]*?)>{6,}\s*MODIFIED/);
  if (!m) {
    if (statusEl) { statusEl.textContent = '✗ parse error'; statusEl.style.color = 'var(--red)'; }
    return false;
  }
  const original = m[1];
  const modified = m[2];

  let current = loadedFiles[filePath];
  if (!current) {
    try {
      const result = await window.files?.read(filePath);
      if (!result?.content) {
        if (statusEl) { statusEl.textContent = '✗ not found'; statusEl.style.color = 'var(--red)'; }
        return false;
      }
      current = result.content;
      loadedFiles[filePath] = current;
    } catch(e) {
      if (statusEl) { statusEl.textContent = '✗ read failed'; statusEl.style.color = 'var(--red)'; }
      return false;
    }
  }

  let updated = false;

  // 1. Exact match
  if (current.includes(original)) {
    updated = current.replace(original, modified);
  }

  // 2. jsdiff patch with fuzz factor
  if (!updated && typeof Diff !== 'undefined') {
    try {
      const patch = Diff.createPatch(filePath, original, modified, '', '');
      const result = Diff.applyPatch(current, patch, { fuzzFactor: 4 });
      if (result !== false) updated = result;
    } catch(e) { console.warn('[apply] jsdiff failed:', e.message); }
  }

  // 3. Normalised whitespace match
  if (!updated) {
    const origLines = original.split('\n');
    const curLines  = current.split('\n');
    const normO = origLines.map(l => l.trim());
    for (let i = 0; i <= curLines.length - origLines.length; i++) {
      let ok = true;
      for (let j = 0; j < normO.length; j++) {
        if ((curLines[i+j] || '').trim() !== normO[j]) { ok = false; break; }
      }
      if (ok) {
        const matched = curLines.slice(i, i + origLines.length).join('\n');
        updated = current.replace(matched, modified);
        break;
      }
    }
  }

  // 4. Fuzzy line match — 75% similarity
  if (!updated) {
    const origLines = original.split('\n');
    const curLines  = current.split('\n');
    const norm = l => l.trim().replace(/ {2,}/g, ' ');
    let bestScore = 0, bestStart = -1;
    for (let i = 0; i <= curLines.length - origLines.length; i++) {
      let score = 0;
      for (let j = 0; j < origLines.length; j++) {
        if (norm(curLines[i+j] || '') === norm(origLines[j])) score++;
      }
      const pct = score / origLines.length;
      if (pct > bestScore) { bestScore = pct; bestStart = i; }
    }
    if (bestScore >= 0.75 && bestStart >= 0) {
      const matched = curLines.slice(bestStart, bestStart + origLines.length).join('\n');
      updated = current.replace(matched, modified);
    }
  }

  if (!updated) {
    if (statusEl) { statusEl.textContent = '✗ no match'; statusEl.style.color = 'var(--red)'; }
    if (applyBtn) { applyBtn.textContent = '✗ No match'; applyBtn.style.color = 'var(--red)'; applyBtn.title = 'Apply manually.'; }
    return false;
  }

  const ok = await writeFile(filePath, updated);
  if (ok) {
    loadedFiles[filePath] = updated;
    if (applyBtn) { applyBtn.textContent = '✓ Applied'; applyBtn.classList.add('applied'); }
    if (statusEl) { statusEl.textContent = '✓'; statusEl.style.color = 'var(--teal)'; }
  } else {
    if (statusEl) { statusEl.textContent = '✗ write failed'; statusEl.style.color = 'var(--red)'; }
  }
  return ok;
}

// ── Apply all pending diffs ───────────────────────────────────────────────────
async function applyAllDiffs() {
  const bar = document.getElementById('apply-all-bar');
  const results = [];
  const entries = Object.entries(pendingDiffs);
  let idx = 0;
  for (const [diffId, {filePath, diffBody}] of entries) {
    idx++;
    if (bar) bar.innerHTML = `<span style="font-size:0.82rem;color:var(--ink-light)">Applying ${idx}/${entries.length}: ${filePath}…</span>`;
    const ok = await applyDiffById(diffId, filePath, diffBody);
    results.push({ filePath, ok });
    await new Promise(r => setTimeout(r, 50));
  }
  const failed = results.filter(r => !r.ok);
  if (bar) bar.innerHTML = failed.length
    ? `<span style="color:var(--red);font-size:0.82rem">✗ ${failed.length} failed: ${[...new Set(failed.map(r => r.filePath))].join(', ')}</span>`
    : `<span style="color:var(--teal);font-size:0.82rem">✓ All ${results.length} applied</span>`;
  // Ask Claude what to test after successful apply
  if (!failed.length && typeof streamReply === 'function') {
    const applied = [...new Set(results.map(r => r.filePath))];
    if (typeof conversation !== 'undefined') conversation.push({ role: 'user', content: 'Changes applied to: ' + applied.join(', ') + '. What should I test to verify this works?' });
    await streamReply();
  }
  pendingDiffs = {};
}

// ── Render diff blocks in chat ────────────────────────────────────────────────
function renderTextWithFallbackBlocks(text) {
  // Render diff:filename blocks specially
  text = text.replace(/```diff:([^\n]+)\n([\s\S]*?)```/g, function(_, path, body) {
    const lines = body.split('\n').map(function(l) {
      if (l.startsWith('+')) return '<span style="color:var(--teal)">' + esc(l) + '</span>';
      if (l.startsWith('-') || l.startsWith('<')) return '<span style="color:var(--red)">' + esc(l) + '</span>';
      return esc(l);
    }).join('\n');
    return '<div style="background:var(--paper-dark);border:1px solid var(--border);border-radius:6px;margin:8px 0;padding:10px 12px">'
      + '<div style="font-family:var(--ui);font-size:0.68rem;color:var(--teal);margin-bottom:6px">' + esc(path) + '</div>'
      + '<pre style="margin:0;font-size:0.78rem;overflow-x:auto;white-space:pre-wrap">' + lines + '</pre>'
      + '</div>';
  });
  const codeRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let result = '';
  let lastIdx = 0;
  let m;
  while ((m = codeRegex.exec(text)) !== null) {
    result += esc(text.slice(lastIdx, m.index));
    const lang = m[1] || '';
    const code = m[2];
    const id = 'fb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    result += '<div style="background:var(--paper-dark);border:1px solid var(--border);border-radius:6px;margin:8px 0;padding:10px 12px">'
      + '<div style="font-family:var(--ui);font-size:0.68rem;color:var(--ink-light);margin-bottom:6px">' + esc(lang.toUpperCase()) + '</div>'
      + '<pre style="margin:0;font-size:0.78rem;overflow-x:auto;white-space:pre-wrap">' + esc(code) + '</pre>'
      + '</div>';
    lastIdx = m.index + m[0].length;
  }
  result += esc(text.slice(lastIdx));
  return result;
}

async function applyFallbackBlock(pathInputId, btn) {
  const pathInput = document.getElementById(pathInputId);
  const filePath = pathInput?.value?.trim();
  if (!filePath) { alert('Enter a file path first'); return; }
  const pre = btn.closest('div').querySelector('pre');
  const code = pre ? pre.textContent : '';
  btn.disabled = true; btn.textContent = '…';
  const ok = await writeFile(filePath, code);
  btn.disabled = false;
  btn.textContent = ok ? '✓ Applied' : '✗ Failed';
  btn.style.color = ok ? 'var(--teal)' : 'var(--red)';
  if (ok) loadedFiles[filePath] = code;
}

async function previewAllDiffs() {
  const bar = document.getElementById('apply-all-bar');
  if (bar) bar.innerHTML = '<span style="font-family:var(--ui);font-size:0.82rem;color:var(--ink-light)">Previewing…</span>';
  const results = [];
  for (const [diffId, {filePath, original, modified}] of Object.entries(pendingDiffs)) {
    let current = loadedFiles[filePath];
    if (!current) { try { current = (await window.files?.read(filePath))?.content || ''; loadedFiles[filePath] = current; } catch(e) {} }
    let matched = false; let matchLine = -1;
    if (current.includes(original)) { matched = true; matchLine = current.slice(0, current.indexOf(original)).split('\n').length; }
    if (!matched && typeof Diff !== 'undefined') {
      try { const r = Diff.applyPatch(current, Diff.createPatch(filePath, original, modified, '', ''), {fuzzFactor:4}); if (r !== false) matched = true; } catch(e) {}
    }
    if (!matched) {
      const oL = original.split('\n'), cL = current.split('\n'), norm = l => l.trim().replace(/ {2,}/g,' ');
      let best = 0, bs = -1;
      for (let i = 0; i <= cL.length - oL.length; i++) {
        let s = 0; for (let j = 0; j < oL.length; j++) if (norm(cL[i+j]||'') === norm(oL[j])) s++;
        if (s/oL.length > best) { best = s/oL.length; bs = i; }
      }
      if (best >= 0.75) { matched = true; matchLine = bs + 1; }
    }
    results.push({diffId, filePath, matched, matchLine});
    const statusEl = document.getElementById('status_' + diffId);
    if (statusEl) { statusEl.textContent = matched ? ('\u2713 ~line ' + matchLine) : '\u2717 no match'; statusEl.style.color = matched ? 'var(--teal)' : 'var(--red)'; }
  }
  const failed = results.filter(r => !r.matched);
  addMessage('system', failed.length ? '\u26a0 Preview: ' + failed.length + ' diff(s) will not match' : '\u2713 Preview: all ' + results.length + ' diffs matched');
  renderApplyAll();
}

function renderApplyAll() {
  const bar = document.getElementById('apply-all-bar');
  if (!bar) return;
  const count = Object.keys(pendingDiffs).length;
  if (!count) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
  const files = [...new Set(Object.values(pendingDiffs).map(d => d.filePath))];
  bar.style.display = 'flex';
  bar.innerHTML =
    '<span style="font-family:var(--ui);font-size:0.78rem;color:var(--ink-light)">' + count + ' change(s) across ' + files.length + ' file(s)</span>'
    + '<button onclick="previewAllDiffs()" style="padding:6px 14px;background:none;border:1px solid var(--gold);border-radius:5px;color:var(--gold);font-family:var(--ui);font-size:0.82rem;cursor:pointer">Preview</button>'
    + '<button onclick="applyAllDiffs()" style="padding:6px 18px;background:var(--teal);border:none;border-radius:5px;color:var(--paper);font-family:var(--ui);font-size:0.82rem;font-weight:600;cursor:pointer">Apply all</button>';
}
