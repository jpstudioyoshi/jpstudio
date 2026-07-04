// ═══════════════════════════════════════════════════════
// features-db-qa.js — Ask questions directly of the SQLite DB
// Read-only natural-language Q&A over jpstudio.db, for the Progress panel.
// ═══════════════════════════════════════════════════════

const DbQaState = {
  busy: false,
  history: [] // [{question, sql, answer}]
};

async function dbqaGetSchema() {
  const rows = await window.db.query(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  );
  return rows.map(r => r.sql).filter(Boolean).join('\n\n');
}

function dbqaIsSafeSelect(sql) {
  const trimmed = sql.trim().replace(/;+\s*$/, '');
  if (!/^(SELECT|WITH)\b/i.test(trimmed)) return null;
  // Reject any statement-separating semicolon (no multi-statement) or write keywords
  if (/;/.test(trimmed)) return null;
  if (/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|REPLACE|PRAGMA|VACUUM)\b/i.test(trimmed)) return null;
  return trimmed;
}

async function dbqaQuery(question, historyContext) {
  const schema = await dbqaGetSchema();

  const historyBlock = (historyContext && historyContext.length)
    ? '\n\nPrevious questions in this session (for context, most recent last):\n' +
      historyContext.slice(-3).map(h => `Q: ${h.question}\nSQL: ${h.sql}\nA: ${h.answer}`).join('\n\n')
    : '';

  // Step 1 — ask Claude to write a read-only SQL query
  const sqlPrompt = `You have access to a SQLite database for a Japanese learning app. Here is the schema:\n\n${schema}${historyBlock}\n\nWrite ONE read-only SQL query (SELECT or WITH only, no semicolons, single statement) to answer this question:\n\n"${question}"\n\nIf the question refers back to a previous question (e.g. "following on from that"), use the previous context to understand what is being asked.\n\nRespond with ONLY the SQL query, no explanation, no markdown formatting, no code fences.`;

  const sqlData = await (App.claudeAPI || window.claudeAPI)({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{ role: 'user', content: sqlPrompt }],
    track: 'db-qa'
  });

  let sql = (sqlData.content?.[0]?.text || '').trim();
  sql = sql.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();

  const safeSql = dbqaIsSafeSelect(sql);
  if (!safeSql) {
    return { sql, answer: null, error: 'Could not form a safe query for that question.' };
  }

  // Step 2 — run the query
  let rows;
  try {
    rows = await window.db.query(safeSql);
  } catch (e) {
    return { sql: safeSql, answer: null, error: 'Query error: ' + e.message };
  }

  // Step 3 — summarize the result in plain English
  const rowsArr = Array.isArray(rows) ? rows : Array.from(rows || []);
  const rowsJson = JSON.stringify(rowsArr.slice(0, 200));
  const summaryPrompt = `Question: "${question}"\n\nSQL query used: ${safeSql}\n\nResult rows (JSON, possibly truncated to 200):\n${rowsJson}\n\nAnswer the question in 1-3 sentences, in plain English. If the result rows are empty or not relevant to the question, ignore them and answer using your own general knowledge of Japan and the Japanese language instead — do not mention the database, the query, or that no data was found. Always write hiragana readings in parentheses after any Japanese words you mention.`;

  const summaryData = await (App.claudeAPI || window.claudeAPI)({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{ role: 'user', content: summaryPrompt }],
    track: 'db-qa'
  });

  const summary = (summaryData.content?.[0]?.text || '').trim();
  return { sql: safeSql, answer: summary, error: null };
}

async function dbqaAsk() {
  const input  = document.getElementById('dbqaInput');
  const answer = document.getElementById('dbqaAnswer');
  const sqlEl  = document.getElementById('dbqaSql');
  const btn    = document.getElementById('dbqaAskBtn');
  if (!input || !answer) return;

  const question = input.value.trim();
  if (!question) return;

  const apiKey = (App.getApiKey || window.getApiKey)?.();
  if (!apiKey) {
    answer.innerHTML = '<span style="color:var(--red)">Set your Claude API key in Settings first.</span>';
    return;
  }

  if (DbQaState.busy) return;
  DbQaState.busy = true;
  if (btn) { btn.disabled = true; btn.textContent = '\u2026'; }
  input.value = '';
  dbqaRenderThread('<span style="color:var(--ink-light)">Thinking\u2026</span>');
  if (sqlEl) sqlEl.textContent = '';

  try {
    const result = await dbqaQuery(question, DbQaState.history);
    if (sqlEl) sqlEl.textContent = result.sql || '';
    if (result.error) {
      answer.innerHTML = '<span style="color:var(--red)">' + result.error + '</span>';
      return;
    }
    DbQaState.history.push({ question, sql: result.sql, answer: result.answer });
    dbqaRenderThread();

  } catch (e) {
    console.error('[dbqaAsk]', e);
    answer.innerHTML = '<span style="color:var(--red)">Error: ' + e.message + '</span>';
  } finally {
    DbQaState.busy = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Ask'; }
  }
}

function dbqaToggleSql() {
  const el = document.getElementById('dbqaSqlWrap');
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function dbqaRenderThread(overrideHtml) {
  const answer = document.getElementById('dbqaAnswer');
  if (!answer) return;
  if (overrideHtml !== undefined && DbQaState.history.length === 0) {
    answer.innerHTML = overrideHtml;
    return;
  }
  let html = DbQaState.history.map(h =>
    '<div style="margin-bottom:10px">' +
      '<div style="color:var(--ink-light);font-size:0.75rem;margin-bottom:2px">Q: ' + h.question.replace(/</g,'&lt;') + '</div>' +
      '<div>' + h.answer.replace(/\n/g, '<br>') + '</div>' +
    '</div>'
  ).join('');
  if (overrideHtml !== undefined) html += overrideHtml;
  answer.innerHTML = html;
}

function dbqaClear() {
  DbQaState.history = [];
  const answer = document.getElementById('dbqaAnswer');
  if (answer) answer.innerHTML = '';
  const sqlEl = document.getElementById('dbqaSql');
  if (sqlEl) sqlEl.textContent = '';
}

// Export
(function() {
  const fns = { dbqaAsk, dbqaQuery, dbqaToggleSql, dbqaClear };
  Object.assign((window.App = window.App || {}), fns);
  Object.keys(fns).forEach(k => { window[k] = fns[k]; });
})();
