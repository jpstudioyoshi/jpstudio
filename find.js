#!/usr/bin/env node
// find.js — search the Japanese Studio function index
// Run: node find.js <keyword> [type]
//
// Examples:
//   node find.js whatsapp              — all functions/storage/prompts matching "whatsapp"
//   node find.js "session load"        — phrase search
//   node find.js kvAPI storage         — storage writes involving kvAPI
//   node find.js transcribe ipc        — IPC channels for transcription
//   node find.js "lesson notes"        — anything related to lesson notes
//
// Types: function, storage, prompt, ipc-handle, ipc-invoke
// If no type given, searches all.

'use strict';

const fs   = require('fs');
const path = require('path');

const indexFile = path.join(__dirname, 'index.json');
if (!fs.existsSync(indexFile)) {
  console.error('index.json not found — run: node check-syntax.js');
  process.exit(1);
}

const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));

const args    = process.argv.slice(2);
const query   = (args[0] || '').toLowerCase();
const typeFilter = args[1]?.toLowerCase() || null;

if (!query) {
  console.log('Usage: node find.js <keyword> [type]');
  console.log('Types: function, storage, prompt, ipc-handle, ipc-invoke');
  process.exit(0);
}

const terms = query.split(/\s+/);

const results = index.filter(entry => {
  if (typeFilter && entry.type !== typeFilter) return false;
  const haystack = [entry.name, entry.desc, entry.file].join(' ').toLowerCase();
  return terms.every(t => haystack.includes(t));
});

if (!results.length) {
  console.log(`No results for "${query}"${typeFilter ? ` [${typeFilter}]` : ''}`);
  process.exit(0);
}

// Group by type for readability
const byType = {};
for (const r of results) {
  if (!byType[r.type]) byType[r.type] = [];
  byType[r.type].push(r);
}

const TYPE_LABELS = {
  'function':   '⚡ Functions',
  'storage':    '💾 Storage writes',
  'prompt':     '🤖 Claude prompts',
  'ipc-handle': '📡 IPC handles',
  'ipc-invoke': '📡 IPC invokes',
};

for (const [type, entries] of Object.entries(byType)) {
  console.log(`\n${TYPE_LABELS[type] || type} (${entries.length})`);
  for (const e of entries) {
    const loc  = e.line ? `${e.file}:${e.line}` : e.file;
    const desc = e.desc ? `  — ${e.desc}` : '';
    const meta = (e.type === 'function' && e.callers !== undefined)
      ? `  [callers=${e.callers}${e.exported ? ' exported' : ''}]` : '';
    console.log(`  ${e.name.padEnd(36)} ${loc}${meta}${desc}`);
  }
}

console.log(`\n${results.length} result(s) for "${query}"`);
