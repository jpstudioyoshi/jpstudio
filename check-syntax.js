#!/usr/bin/env node
// check-syntax.js — Japanese Studio code audit + syntax checker
// Run from project root: node check-syntax.js
// Checks syntax of all JS files and writes audit-YYYY-MM-DD.md
//
// Sections per file:
//   - Line count
//   - Functions with one-line description (first comment or first meaningful statement)
//   - Top-level vars and constants
//   - window[] exports (redundant if also in App registry)
//   - App registry entries (Object.assign(App, {...}))
//   - Claude prompts (strings >60 chars assigned to prompt/system vars or passed to claudeAPI)
//   - Storage writes (kvAPI.set, localStorage.setItem, Storage.set, db.run with key names)
//   - IPC handles/invokes (main.js / preload.js)
//   - IIFEs count
//   - Syntax errors

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;

// Files to audit (relative to ROOT)
const TARGETS = [
  'check-syntax.js',
  'main.js',
  'preload.js',
  'preload-overlay.js',
  'src/core-foundation.js',
  'src/core-anki.js',
  'src/core-kana-drill.js',
  'src/core-kana.js',
  'src/core-counters.js',
  'src/core-srs.js',
  'src/core-stt.js',
  'src/core-writing.js',
  'src/core-listen.js',
  'src/core-vocab.js',
  'src/core.js',
  'src/features-core.js',
  'src/features-kana.js',
  'src/features-times.js',
  'src/briefing-prompt.js',
  'src/GrammarModel.js',
  'src/AppEvents.js',
  'src/features-grammar.js',
  'src/features-reading.js',
  'src/features-video.js',
  'src/features-pictures.js',
  'src/features-progress.js',
  'src/features-stroke.js',
  'src/features-lesson-notes.js',
  'src/features-ln-p2.js',
  'src/features-tools.js',
  'src/features-voice.js',
  'src/features-voice-drill.js',
  'src/features-corpus-seed.js',
  'src/features-custom-drill.js',
  'src/StudentModel.js',
  'src/IssueTracker.js',
  'src/services/LessonSession.js',
  'src/services/AudioService.js',
  'src/services/PreflightService.js',
  'src/services/TranscriptionService.js',
  'src/services/AnalysisService.js',
  'src/services/StorageService.js',
  'src/Orchestrator.js',
  'src/ui/YoshiUI.js',
];

const HTML_TARGETS = [
  'index.html',
  'lesson-overlay.html',
  'management.html',
  'src/index.html',
];

const SKIP = new Set(['node_modules', '.git', 'dist']);

// Functions known to be called via closures/callbacks that the word-frequency
// analyser can't detect. Add names here to suppress false dead-candidate warnings.
const DEAD_IGNORE = new Set([
  'customTranscribe',  // called via MediaRecorder.onstop closure in customStartRecord()
]);

// ── Syntax check ──────────────────────────────────────────────────────────────

function syntaxCheck(filepath) {
  try {
    execSync(`node --check "${filepath}"`, { stdio: 'pipe' });
    return null;
  } catch (e) {
    const msg = (e.stderr || e.stdout || '').toString().trim();
    const match = msg.match(/\n?(SyntaxError[^\n]*)/);
    return match ? match[1] : msg.split('\n').slice(-2).join(' ');
  }
}

// ── Source analysis helpers ───────────────────────────────────────────────────

// Extract all function names and a one-line description for each.
// Description priority:
//   1. JSDoc @description or first @param line preceding the function
//   2. First comment line (// ...) immediately before the function
//   3. First non-trivial statement inside the function body
function extractFunctions(src, lines) {
  const funcs = [];
  // Match: function name(...) or async function name(...)
  // Also: const name = (async )? function / arrow
  const fnRe = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/mg;
  const arrowRe = /^(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/mg;

  const lineIndex = buildLineIndex(src);

  for (const re of [fnRe, arrowRe]) {
    let m;
    while ((m = re.exec(src)) !== null) {
      const name = m[1];
      const pos  = m.index;
      const lineNo = posToLine(lineIndex, pos);

      // Look backwards for a comment block (up to 5 lines)
      const desc = extractDescription(lines, lineNo - 1);

      // If no comment, look at first statement inside the body
      const bodyDesc = desc || extractFirstStatement(src, pos);

      funcs.push({ name, line: lineNo, desc: bodyDesc });
    }
  }

  // Deduplicate by name (keep first occurrence)
  const seen = new Set();
  return funcs.filter(f => {
    if (seen.has(f.name)) return false;
    seen.add(f.name);
    return true;
  }).sort((a, b) => a.line - b.line);
}

function buildLineIndex(src) {
  const idx = [0];
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\n') idx.push(i + 1);
  }
  return idx;
}

function posToLine(idx, pos) {
  let lo = 0, hi = idx.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (idx[mid] <= pos) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
}

function extractDescription(lines, lineNo) {
  // lineNo is 1-based; lines array is 0-based
  const idx = lineNo - 1; // line containing the function keyword
  // Scan backwards up to 6 lines
  for (let i = idx - 1; i >= Math.max(0, idx - 6); i--) {
    const l = lines[i].trim();
    if (!l) continue;
    // JSDoc line
    if (l.startsWith('* ') || l.startsWith('// ')) {
      const text = l.replace(/^[/*\s]+/, '').trim();
      if (text.length > 4 && !/^[{}()[\]]+$/.test(text)) return text.slice(0, 120);
    }
    // Stop if we hit code
    if (!/^[/*]/.test(l) && l !== '') break;
  }
  return null;
}

function extractFirstStatement(src, fnPos) {
  // Find the opening brace of the function body
  const braceIdx = src.indexOf('{', fnPos);
  if (braceIdx === -1) return null;
  // Take a slice and find the first meaningful line
  const body = src.slice(braceIdx + 1, braceIdx + 400);
  const bodyLines = body.split('\n').map(l => l.trim()).filter(l =>
    l && !l.startsWith('//') && l !== '{' && l !== '}'
  );
  if (!bodyLines.length) return null;
  const first = bodyLines[0].slice(0, 100);
  // Skip trivial lines
  if (/^(if|for|while|try|return;?$|\{|\})/.test(first) && first.length < 8) return null;
  return first;
}

// Top-level vars: const/let/var at column 0
function extractTopLevelVars(src) {
  const vars = [];
  const re = /^(?:const|let|var)\s+(\w+)/mg;
  let m;
  while ((m = re.exec(src)) !== null) {
    vars.push(m[1]);
  }
  return [...new Set(vars)];
}

// window['x'] = x style exports
function extractWindowExports(src) {
  const exports = [];
  const re = /window\[['"](\w+)['"]\]\s*=/g;
  let m;
  while ((m = re.exec(src)) !== null) exports.push(m[1]);
  return exports;
}

// App registry entries: Object.assign(App, { ... })
function extractAppRegistry(src) {
  const entries = [];
  const re = /Object\.assign\s*\(\s*App\s*,\s*\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const block = m[1];
    // Extract identifiers (names, possibly with trailing comma)
    const idRe = /\b(\w+)\s*[,\n}]/g;
    let im;
    while ((im = idRe.exec(block)) !== null) {
      if (im[1] !== 'App') entries.push(im[1]);
    }
  }
  return [...new Set(entries)];
}

// Claude prompts: strings >60 chars in prompt/system context
// Looks for: const prompt = `...`, prompt = '...', system: '...', content: '...'
// Also claudeAPI({ ... messages: [{content: '...'}] })
function extractClaudePrompts(src, lines) {
  const prompts = [];
  const lineIndex = buildLineIndex(src);

  // Pattern 1: variable named prompt/systemPrompt/PROMPT/system_prompt assigned a string
  const varRe = /(?:const|let|var)\s+((?:\w*[Pp]rompt\w*|\w*[Ss]ystem\w*))\s*=\s*[`'"]/g;
  let m;
  while ((m = varRe.exec(src)) !== null) {
    const lineNo = posToLine(lineIndex, m.index);
    const snip = extractStringSnippet(src, m.index + m[0].length - 1, 200);
    if (snip && snip.length > 60) {
      prompts.push({ line: lineNo, var: m[1], text: snip.slice(0, 160) + (snip.length > 160 ? '…' : '') });
    }
  }

  // Pattern 2: prompt reassignment (prompt = `...` without const/let)
  const assignRe = /\b(prompt)\s*=\s*[`'"]/g;
  while ((m = assignRe.exec(src)) !== null) {
    const lineNo = posToLine(lineIndex, m.index);
    const snip = extractStringSnippet(src, m.index + m[0].length - 1, 200);
    if (snip && snip.length > 60) {
      // Avoid duplicates from varRe
      if (!prompts.some(p => p.line === lineNo)) {
        prompts.push({ line: lineNo, var: 'prompt', text: snip.slice(0, 160) + (snip.length > 160 ? '…' : '') });
      }
    }
  }

  return prompts;
}

function extractStringSnippet(src, startPos, maxLen) {
  const quote = src[startPos];
  if (quote !== '`' && quote !== '"' && quote !== "'") return null;
  let end = startPos + 1;
  let escaped = false;
  let depth = 0; // for template literal ${}
  while (end < src.length && end - startPos < maxLen + 2) {
    const c = src[end];
    if (escaped) { escaped = false; end++; continue; }
    if (c === '\\') { escaped = true; end++; continue; }
    if (quote === '`') {
      if (c === '$' && src[end+1] === '{') { depth++; end += 2; continue; }
      if (c === '}' && depth > 0) { depth--; end++; continue; }
      if (depth > 0) { end++; continue; }
    }
    if (c === quote) break;
    end++;
  }
  const raw = src.slice(startPos + 1, end)
    .replace(/\$\{[^}]+\}/g, '${…}')
    .replace(/\s+/g, ' ')
    .trim();
  return raw;
}

// Storage writes: kvAPI.set, localStorage.setItem, Storage.set/setJSON, db.run INSERT/UPDATE
function extractStorageWrites(src) {
  const writes = [];
  const lineIndex = buildLineIndex(src);

  const patterns = [
    // kvAPI.set('key', ...)
    { re: /kvAPI\.set\s*\(\s*['"`]([^'"`]+)['"`]/g, label: 'kvAPI.set' },
    // localStorage.setItem('key', ...)
    { re: /localStorage\.setItem\s*\(\s*['"`]([^'"`]+)['"`]/g, label: 'localStorage' },
    // Storage.set(STORAGE_KEYS.FOO, ...) or Storage.set('key', ...)
    { re: /Storage\.set(?:JSON)?\s*\(\s*(?:STORAGE_KEYS\.(\w+)|['"`]([^'"`]+)['"`])/g, label: 'Storage.set' },
    // db.run('INSERT/UPDATE INTO tablename')
    { re: /db\.run\s*\(\s*['"`]\s*(INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?(\w+)/gi, label: 'db.run' },
  ];

  for (const { re, label } of patterns) {
    let m;
    while ((m = re.exec(src)) !== null) {
      const lineNo = posToLine(lineIndex, m.index);
      const key = m[1] || m[2] || '?';
      writes.push({ line: lineNo, label, key });
    }
  }

  return writes;
}

// IPC handles (main.js): ipcMain.handle('channel', ...)
function extractIpcHandles(src) {
  const handles = [];
  const re = /ipcMain\.handle\s*\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) handles.push(m[1]);
  return handles;
}

// IPC invokes (preload.js): ipcRenderer.invoke('channel', ...)
function extractIpcInvokes(src) {
  const invokes = [];
  const re = /ipcRenderer\.invoke\s*\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) invokes.push(m[1]);
  return invokes;
}

// Count IIFEs: (() => { or (function() {
function countIifes(src) {
  return (src.match(/\(\s*(?:async\s+)?\s*(?:function\s*\w*\s*)?\([^)]*\)\s*(?:=>\s*)?\{/g) || []).length;
}

// ── HTML analysis ─────────────────────────────────────────────────────────────

function analyseHtml(src) {
  const scriptBlocks = [];
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    scriptBlocks.push(m[1]);
  }
  const combined = scriptBlocks.join('\n');

  const functions = [];
  const fnRe = /function\s+(\w+)\s*\(/g;
  while ((m = fnRe.exec(combined)) !== null) functions.push(m[1]);

  const windowExports = extractWindowExports(combined);
  const iifes = countIifes(combined);
  const ipcInvokes = extractIpcInvokes(combined);

  return { functions: [...new Set(functions)], windowExports, iifes, ipcInvokes };
}

// ── Redundancy check ──────────────────────────────────────────────────────────
// Flag window[] exports that are also in App registry — these are redundant

function flagRedundant(windowExports, appRegistry) {
  const registrySet = new Set(appRegistry);
  return windowExports.filter(e => registrySet.has(e));
}

// ── Report generation ─────────────────────────────────────────────────────────

function formatFunctions(funcs, maxShow = 40) {
  if (!funcs.length) return '';
  const shown = funcs.slice(0, maxShow);
  const rest  = funcs.length - shown.length;

  // Two modes: if any have descriptions, use detailed list; otherwise compact comma list
  const hasDescs = shown.some(f => f.desc);

  if (hasDescs) {
    const lines = shown.map(f => {
      const desc = f.desc ? ` — ${f.desc}` : '';
      return `    ${f.name}()${desc}`;
    });
    if (rest > 0) lines.push(`    … +${rest} more`);
    return '  Functions:\n' + lines.join('\n');
  } else {
    const names = shown.map(f => f.name).join(', ') + (rest > 0 ? ` +${rest} more` : '');
    return `  Functions: ${names}`;
  }
}

function formatPrompts(prompts) {
  if (!prompts.length) return '';
  const lines = prompts.map(p =>
    `    L${p.line} ${p.var}: "${p.text}"`
  );
  return '  Claude prompts:\n' + lines.join('\n');
}

function formatStorageWrites(writes) {
  if (!writes.length) return '';
  // Deduplicate by label+key
  const seen = new Set();
  const deduped = writes.filter(w => {
    const k = `${w.label}:${w.key}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const lines = deduped.map(w => `    L${w.line} ${w.label}('${w.key}')`);
  return '  Storage writes:\n' + lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

const date = new Date().toLocaleDateString('en-GB', {
  day: '2-digit', month: '2-digit', year: 'numeric'
}).split('/').reverse().join('-');

const outFile = path.join(ROOT, "audit-latest.md");
const out = [];
let errors = 0;
let ok = 0;

out.push(`# Japanese Studio — Project Audit`);
out.push(`Generated: ${new Date().toLocaleString('en-GB')}`);
out.push(`Total JS files: ${TARGETS.length} | HTML files: ${HTML_TARGETS.length}`);
out.push('');

// ── Load order ────────────────────────────────────────────────────────────────
out.push('## Load order (from index.html)');
const indexHtmlPath = path.join(ROOT, 'index.html');
if (fs.existsSync(indexHtmlPath)) {
  const indexSrc = fs.readFileSync(indexHtmlPath, 'utf8');
  const scriptRe = /<script\s+src="([^"]+)"/g;
  let sm;
  while ((sm = scriptRe.exec(indexSrc)) !== null) out.push(`  ${sm[1]}`);
}
out.push('');

// ── JS file analysis ──────────────────────────────────────────────────────────
out.push('## File analysis');

for (const rel of TARGETS) {
  const filepath = path.join(ROOT, rel);
  if (!fs.existsSync(filepath)) {
    out.push(`### ${rel} (NOT FOUND)`);
    out.push('');
    continue;
  }

  const src   = fs.readFileSync(filepath, 'utf8');
  const lines = src.split('\n');
  const lineCount = lines.length;

  out.push(`### ${rel} (${lineCount} lines)`);

  // Syntax check
  const syntaxErr = syntaxCheck(filepath);
  if (syntaxErr) {
    out.push(`  ⚠ SYNTAX ERROR: ${syntaxErr}`);
    errors++;
  } else {
    ok++;
  }

  // Functions
  const funcs = extractFunctions(src, lines);
  if (funcs.length) out.push(formatFunctions(funcs));

  // Top-level vars
  const vars = extractTopLevelVars(src);
  if (vars.length) out.push(`  Top-level vars: ${vars.join(', ')}`);

  // Skip pattern-matching extractors on this file to avoid regex self-matches
  const isSelf = rel === 'check-syntax.js';

  // Window exports
  const windowExports = isSelf ? [] : extractWindowExports(src);
  if (windowExports.length) out.push(`  window[] exports: ${windowExports.join(', ')}`);

  // App registry
  const appRegistry = isSelf ? [] : extractAppRegistry(src);
  if (appRegistry.length) out.push(`  App registry: ${appRegistry.join(', ')}`);

  // Redundant exports (in both window[] and App registry)
  if (windowExports.length && appRegistry.length) {
    const redundant = flagRedundant(windowExports, appRegistry);
    if (redundant.length) {
      out.push(`  ⚠ Redundant window[] exports (also in App registry): ${redundant.join(', ')}`);
    }
  }

  // Claude prompts
  const prompts = isSelf ? [] : extractClaudePrompts(src, lines);
  if (prompts.length) out.push(formatPrompts(prompts));

  // Storage writes
  const storageWrites = isSelf ? [] : extractStorageWrites(src);
  if (storageWrites.length) out.push(formatStorageWrites(storageWrites));

  // IPC (main.js)
  const ipcHandles = isSelf ? [] : extractIpcHandles(src);
  if (ipcHandles.length) out.push(`  IPC handles: ${ipcHandles.join(', ')}`);

  // IPC (preload.js)
  const ipcInvokes = isSelf ? [] : extractIpcInvokes(src);
  if (ipcInvokes.length) out.push(`  IPC invokes: ${ipcInvokes.join(', ')}`);

  // IIFEs
  const iifes = countIifes(src);
  if (iifes > 0) out.push(`  IIFEs: ${iifes}`);

  out.push('');
}

// ── HTML analysis ─────────────────────────────────────────────────────────────
for (const rel of HTML_TARGETS) {
  const filepath = path.join(ROOT, rel);
  if (!fs.existsSync(filepath)) continue;
  const src = fs.readFileSync(filepath, 'utf8');
  const lineCount = src.split('\n').length;
  out.push(`### ${rel} (${lineCount} lines)`);
  const info = analyseHtml(src);
  if (info.functions.length) out.push(`  Functions: ${info.functions.join(', ')}`);
  if (info.windowExports.length) out.push(`  window[] exports: ${info.windowExports.join(', ')}`);
  if (info.iifes > 0) out.push(`  IIFEs: ${info.iifes}`);
  if (info.ipcInvokes.length) out.push(`  IPC invokes: ${info.ipcInvokes.join(', ')}`);
  out.push('');
}

// ── Summary ───────────────────────────────────────────────────────────────────
out.push('## Summary');
out.push(`  Syntax OK: ${ok}`);
out.push(`  Syntax errors: ${errors}`);

// Count total remaining window exports vs App registry entries across all files
let totalWindowExports = 0;
let totalRedundant = 0;
let totalAppRegistry = 0;
for (const rel of TARGETS) {
  if (rel === 'check-syntax.js') continue;
  const filepath = path.join(ROOT, rel);
  if (!fs.existsSync(filepath)) continue;
  const src = fs.readFileSync(filepath, 'utf8');
  const we = extractWindowExports(src);
  const ar = extractAppRegistry(src);
  totalWindowExports += we.length;
  totalRedundant += flagRedundant(we, ar).length;
  totalAppRegistry += ar.length;
}
out.push(`  Total window[] exports: ${totalWindowExports} (${totalRedundant} redundant — also in App registry)`);
out.push(`  Total App registry entries: ${totalAppRegistry}`);

// Total functions
let totalFuncs = 0;
for (const rel of TARGETS) {
  if (rel === 'check-syntax.js') continue;
  const filepath = path.join(ROOT, rel);
  if (!fs.existsSync(filepath)) continue;
  const src = fs.readFileSync(filepath, 'utf8');
  totalFuncs += extractFunctions(src, src.split('\n')).length;
}
out.push(`  Total functions defined: ${totalFuncs}`);
out.push('');

// ── Write audit ───────────────────────────────────────────────────────────────
const report = out.join('\n');
fs.writeFileSync(outFile, report, 'utf8');
console.log(`\nAudit written to: ${outFile}`);
console.log(`Syntax: ${ok} OK, ${errors} error(s)`);

// ── Write index.json ──────────────────────────────────────────────────────────
// Flat list of every function + storage write + Claude prompt across all files.
// Used by find.js: node find.js <keyword>

const index = [];
const allSrc = [];
const globalWindowExports = new Set();
const globalAppRegistry = new Set();

for (const rel of [...TARGETS, ...HTML_TARGETS]) {
  if (rel === 'check-syntax.js') continue;
  const filepath = path.join(ROOT, rel);
  if (!fs.existsSync(filepath)) continue;
  const src   = fs.readFileSync(filepath, 'utf8');
  const lines = src.split('\n');
  const isHtml = rel.endsWith('.html');

  allSrc.push(src);
  if (isHtml) {
    analyseHtml(src).windowExports.forEach(e => globalWindowExports.add(e));
  } else {
    extractWindowExports(src).forEach(e => globalWindowExports.add(e));
    extractAppRegistry(src).forEach(e => globalAppRegistry.add(e));
  }

  // Functions
  const funcs = isHtml ? analyseHtml(src).functions.map(name => ({ name, line: 0, desc: null }))
                       : extractFunctions(src, lines);
  for (const f of funcs) {
    index.push({
      type: 'function',
      name: f.name,
      file: rel,
      line: f.line || 0,
      desc: f.desc || '',
    });
  }

  if (!isHtml) {
    // Storage writes
    const writes = extractStorageWrites(src);
    for (const w of writes) {
      index.push({
        type:  'storage',
        name:  w.key,
        file:  rel,
        line:  w.line,
        desc:  w.label,
      });
    }

    // Claude prompts
    const prompts = extractClaudePrompts(src, lines);
    for (const p of prompts) {
      index.push({
        type: 'prompt',
        name: p.var,
        file: rel,
        line: p.line,
        desc: p.text.slice(0, 80),
      });
    }

    // IPC handles
    const handles = extractIpcHandles(src);
    for (const h of handles) {
      index.push({ type: 'ipc-handle', name: h, file: rel, line: 0, desc: '' });
    }

    // IPC invokes
    const invokes = extractIpcInvokes(src);
    for (const iv of invokes) {
      index.push({ type: 'ipc-invoke', name: iv, file: rel, line: 0, desc: '' });
    }
  }
}

// Caller counts: single pass over combined source, word-frequency map
const combinedSrc = allSrc.join('\n');
const wordCounts = new Map();
{
  const wordRe = /[A-Za-z_$][A-Za-z0-9_$]*/g;
  let wm;
  while ((wm = wordRe.exec(combinedSrc)) !== null) {
    wordCounts.set(wm[0], (wordCounts.get(wm[0]) || 0) + 1);
  }
}
for (const entry of index) {
  if (entry.type !== 'function') continue;
  const total = wordCounts.get(entry.name) || 0;
  entry.callers = Math.max(0, total - 1);
  entry.exported = globalWindowExports.has(entry.name) || globalAppRegistry.has(entry.name);
}

const indexFile = path.join(ROOT, 'index.json');
fs.writeFileSync(indexFile, JSON.stringify(index, null, 2), 'utf8');
console.log(`Index written to: ${indexFile} (${index.length} entries)`);

// Append "Likely dead candidates" to the audit file
const deadCandidates = index.filter(e => e.type === 'function' && e.callers === 0 && !e.exported && !DEAD_IGNORE.has(e.name));
if (deadCandidates.length) {
  const dcLines = [`\n## Likely dead candidates (${deadCandidates.length})`,
    'Zero references found anywhere, no window[]/App registry export. Verify before removing.', ''];
  const byFile = {};
  for (const e of deadCandidates) (byFile[e.file] ||= []).push(e);
  for (const [file, entries] of Object.entries(byFile)) {
    dcLines.push(`### ${file}`);
    for (const e of entries) dcLines.push(`  ${e.name}() L${e.line}${e.desc ? ` — ${e.desc}` : ''}`);
  }
  fs.appendFileSync(outFile, dcLines.join('\n') + '\n', 'utf8');
}
console.log(`Likely dead candidates: ${deadCandidates.length}`);

// ── Cache buster — update ?v= query strings in index.html ─────────────────────
// Prevents Electron from serving stale cached JS after a deploy.
// Updates all <script src="...js"> and <link href="...css"> tags.
const ver = new Date().toISOString().slice(0, 10).replace(/-/g, '');  // e.g. 20260518
const idxHtmlPath = path.join(ROOT, 'index.html');
if (fs.existsSync(idxHtmlPath)) {
  let html = fs.readFileSync(idxHtmlPath, 'utf8');
  // Replace existing ?v=XXXXXXXX or add fresh one
  const updated = html
    .replace(/(<script[^>]+src="[^"]+\.js)(?:\?v=[^"]+)?(")/g,   `$1?v=${ver}$2`)
    .replace(/(<link[^>]+href="[^"]+\.css)(?:\?v=[^"]+)?(")/g,   `$1?v=${ver}$2`);
  if (updated !== html) {
    fs.writeFileSync(idxHtmlPath, updated, 'utf8');
    console.log(`Cache busters updated in index.html (v=${ver})`);
  }
}

if (errors > 0) {
  console.error('\n⚠ Fix syntax errors before deploying.\n');
  process.exit(1);
}
