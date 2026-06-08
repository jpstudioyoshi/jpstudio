// ═══════════════════════════════════════════════════════
// FEATURES-VOICE
// Agent Briefing · Voice Conversation
// Requires: core.js, briefing-prompt.js, (App.GrammarModel || window.GrammarModel).js,
//           features-core.js, features-kana.js
// ═══════════════════════════════════════════════════════

// ── Phase 3: App-first resolvers ─────────────────────────────────
// All cross-file dependencies resolved via App registry with window
// fallback. Called as functions so they always pick up the latest
// registered value (safe even if load order shifts).

// ══════════════════════════════════════════════════════════════════
// AGENT BRIEFING
// ══════════════════════════════════════════════════════════════════

const AGENT_CACHE_KEY  = 'agentBriefingCache';
const AGENT_CACHE_MINS = 60; // regenerate after 1 hour or on manual refresh

// ── Signal collector ──────────────────────────────────────────────
function agentCollectSignals() {
  const signals = [];
  const now = Date.now();
  const DAY  = 86400000;
  const WEEK = 7 * DAY;

  // 1. Anki reviews due
  try {
    const ankiDue = parseInt(document.getElementById('ankiDueCount')?.textContent) || 0;
    if (ankiDue > 0) {
      signals.push({ type: 'anki_due', priority: 3, count: ankiDue,
        label: ankiDue + ' Anki review' + (ankiDue !== 1 ? 's' : '') + ' due',
        actionPanel: 'words', actionLabel: 'Open Anki' });
    }
  } catch(e) {}

  // 2. Writing error patterns (last 7 days)
  writingErrorsLoad();
  const recentErrors = (AppState.writingErrors || []).filter(e => {
    const last = new Date(e.lastSeen || 0).getTime();
    return (now - last) < WEEK;
  });
  const topError = recentErrors.sort((a,b) => b.count - a.count)[0];
  if (topError && topError.count >= 2) {
    const weTab = topError.errorType === 'particle' ? 'particles' : 'verbs';
    const weNote = topError.pattern;
    signals.push({ type: 'writing_error', priority: 2, pattern: topError.pattern,
      errorType: topError.errorType, count: topError.count,
      label: topError.count + '× ' + topError.pattern + ' (' + topError.errorType + ')',
      actionFn: 'openGramNote(\'' + weTab + '\',\'' + weNote.replace(/'/g,"\\'") + '\')', actionLabel: 'Note' });
  }

  // 3. Spoken error patterns
  try {
    const spokenRaw = (App.Storage || window.Storage).get(STORAGE_KEYS.SPOKEN_ERRORS);
    const spokenErrors = spokenRaw ? JSON.parse(spokenRaw) : [];
    const topSpoken = spokenErrors.sort((a,b) => b.count - a.count)[0];
    if (topSpoken && topSpoken.count >= 2) {
      const seTab = 'verbs';
      const seNote = topSpoken.pattern;
      signals.push({ type: 'spoken_error', priority: 2, pattern: topSpoken.pattern,
        count: topSpoken.count,
        label: topSpoken.count + '× "' + topSpoken.pattern + '" in speaking',
        actionFn: 'openGramNote(\'' + seTab + '\',\'' + seNote.replace(/'/g,"\\'") + '\')', actionLabel: 'Note' });
    }
  } catch(e) {}

  // 4. SST — days since last session
  try {
    const sessions = (App.Storage || window.Storage).getJSON(STORAGE_KEYS.ROUND_TRIPS, []);
    if (sessions.length > 0) {
      const lastSst = new Date(sessions[0].date).getTime();
      const daysSince = Math.floor((now - lastSst) / DAY);
      if (daysSince >= goalsLoad().sstGapDays) {
        signals.push({ type: 'sst_gap', priority: 1, days: daysSince,
          label: daysSince + ' days since last speaking session',
          actionPanel: 'voice', actionLabel: 'Speak' });
      }
    } else {
      signals.push({ type: 'sst_none', priority: 1,
        label: 'No speaking sessions yet',
        actionPanel: 'voice', actionLabel: 'Speak' });
    }
  } catch(e) {}

  // 5. Writing — days since last session
  try {
    const texts = (App.Storage || window.Storage).getJSON(STORAGE_KEYS.STUDIO_TEXTS, []);
    if (texts.length > 0) {
      const lastWrite = new Date(texts[0].date || texts[0].savedAt || 0).getTime();
      const daysSince = Math.floor((now - lastWrite) / DAY);
      if (daysSince >= 3) {
        signals.push({ type: 'writing_gap', priority: 1, days: daysSince,
          label: daysSince + ' days since last writing session',
          actionPanel: 'writing', actionLabel: 'Write' });
      }
    }
  } catch(e) {}

  // 6. Anki Easy×5 words — consolidated but never written
  try {
    const easyCounts = (App.Storage || window.Storage).getJSON(STORAGE_KEYS.ANKI_EASY_COUNTS, {});
    const consolidated = Object.entries(easyCounts)
      .filter(([,c]) => c >= 5).length;
    if (consolidated > 0) {
      signals.push({ type: 'anki_consolidated', priority: 1, count: consolidated,
        label: consolidated + ' Anki word' + (consolidated !== 1 ? 's' : '') + ' consolidated — try using in writing',
        actionPanel: 'writing', actionLabel: 'Write' });
    }
  } catch(e) {}

  // 7. Counter mastery signals
  try {
    if (typeof CM !== 'undefined' && typeof COUNTER_DATA !== 'undefined' && COUNTER_DATA) {
      const counterDone = CM.isTodayComplete();
      const allStatus = CM.getAllStatus();
      const unmastered = Object.entries(allStatus).filter(([,s]) => !s.mastered);
      const due = Object.entries(allStatus).filter(([,s]) => s.due);

      if (!counterDone) {
        if (unmastered.length > 0) {
          const _cnames = unmastered.slice(0, 3).map(([k]) => COUNTER_DATA[k] ? (COUNTER_DATA[k].kanji || k) : k).join('\u3001');
          signals.push({ type: 'counter_drill', priority: 2,
            label: 'Counter drill incomplete — ' + unmastered.length + ' unmastered (' + _cnames + (unmastered.length > 3 ? '\u2026' : '') + ')',
            actionFn: "showPanel('grammar2');gram2Switch('count')", actionLabel: 'Counter drill' });
        } else if (due.length > 0) {
          signals.push({ type: 'counter_review', priority: 1,
            label: due.length + ' counter' + (due.length !== 1 ? 's' : '') + ' due for maintenance review',
            actionFn: "showPanel('grammar2');gram2Switch('count')", actionLabel: 'Counter review' });
        }
      }
    }
  } catch(e) {}

  // 9. Conjugation error patterns
  try {
    if (typeof GrammarErrors !== 'undefined') {
      const errors = GrammarErrors.load();
      const recent = errors
        .filter(e => (Date.now() - new Date(e.date || 0).getTime()) < WEEK)
        .sort((a, b) => (b.misses * 3 + b.slips) - (a.misses * 3 + a.slips));
      const top = recent[0];
      if (top && (top.misses >= 2 || top.slips >= 3)) {
        const label = top.form + ' ' + top.pol + ' ' + top.reg + ' (' + top.verbType + ') — '
          + top.misses + ' miss' + (top.misses !== 1 ? 'es' : '') + ', ' + top.slips + ' slip' + (top.slips !== 1 ? 's' : '');
        signals.push({ type: 'conj_error', priority: 2,
          label: 'Conjugation weak spot: ' + label,
          actionFn: 'openGramNote(\'verbs\',\'' + label.replace(/'/g,"\\'") + '\')', actionLabel: 'Note' });
      }
    }
  } catch(e) {}

  // 10. Conjugation session — not done today
  try {
    if (typeof ConjSession !== 'undefined') {
      const conjDone = ConjSession.isTodayComplete();
      const conjSaved = ConjSession.load();
      if (!conjDone && !conjSaved) {
        signals.push({ type: 'conj_pending', priority: 1,
          label: 'Conjugation drill not started today',
          actionFn: "showPanel('grammar2');gram2Switch('conj')", actionLabel: 'Start drill' });
      } else if (!conjDone && conjSaved) {
        const pct = conjSaved.idx && conjSaved.queue
          ? Math.round(conjSaved.idx / conjSaved.queue.length * 100) : 0;
        signals.push({ type: 'conj_resume', priority: 2,
          label: 'Conjugation drill in progress (' + pct + '%) — resume today',
          actionFn: "showPanel('grammar2');gram2Switch('conj')", actionLabel: 'Resume drill' });
      }
    }
  } catch(e) {}

  // 11. Grammar graph — prerequisite root signal
  try {
    const recentWriting = typeof AppState.writingErrors !== 'undefined'
      ? AppState.writingErrors.filter(e => (now - new Date(e.date||0).getTime()) < WEEK)
      : [];
    const recentGrammar = typeof GrammarErrors !== 'undefined'
      ? GrammarErrors.load().filter(e => (now - new Date(e.date||0).getTime()) < WEEK)
      : [];
    agentGrammarRootSignal(recentWriting, recentGrammar).forEach(s => signals.push(s));
  } catch(e) {}

  // 12. Grammar graph — unlock readiness signal
  try {
    const grammarErrors = typeof GrammarErrors !== 'undefined' ? GrammarErrors.load() : [];
    const conjSaved     = typeof ConjSession   !== 'undefined' ? ConjSession.load()   : null;
    agentGrammarUnlockSignal(grammarErrors, conjSaved).forEach(s => signals.push(s));
  } catch(e) {}

  return signals.sort((a,b) => b.priority - a.priority).slice(0, 6);
}

// ── Smart launch routing ──────────────────────────────────────────
function agentGetLaunchPanel() {
  const signals = agentCollectSignals();
  if (!signals.length) return 'dashboard';
  const top = signals[0];
  if (top.priority >= 3) return 'progress'; // urgent — show briefing
  // Check if we opened progress recently — don't always force it
  const lastProgress = parseInt((App.Storage || window.Storage).get('agentLastProgressView') || '0');
  const hoursSince = (Date.now() - lastProgress) / 3600000;
  if (hoursSince > 12) return 'progress';
  return 'dashboard';
}

// ── Generate briefing cards via Claude ───────────────────────────
async function agentRefresh(force) {
  const btn = document.getElementById('agentRefreshBtn');
  const cards = document.getElementById('agentCards');
  if (!cards) return;

  // Render cached cards only if fresh — stale cache shows loading state to avoid visible swap
  try {
    const cached = (App.Storage || window.Storage).getJSON(AGENT_CACHE_KEY, null);
    if (cached && cached.cards) {
      const fresh = !force && (Date.now() - cached.ts) < AGENT_CACHE_MINS * 60000;
      if (fresh) { agentRenderCards(cached.cards); return; }
    }
  } catch(e) {}

  // Cache stale or forced — show loading state then fetch
  if (cards) cards.innerHTML = '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light);padding:20px;text-align:center;border:1px solid var(--border);border-radius:8px">Loading…</div>';
  if (btn) { btn.textContent = '…'; btn.disabled = true; }

  const signals = agentCollectSignals();

  if (!signals.length) {
    const emptyCards = [{ icon: '✓', text: 'Everything looks good — enjoy your practice today.', action: null }];
    agentRenderCards(emptyCards);
    (App.Storage || window.Storage).setJSON(AGENT_CACHE_KEY, { ts: Date.now(), cards: emptyCards });
    if (btn) { btn.textContent = '↻ Refresh'; btn.disabled = false; }
    return;
  }

  // Render signals directly — no API call needed, labels are already factual
  const agentCards = signals.map(s => ({
    icon: s.type.includes('error') ? '◈' : s.type.includes('gap') ? '○' : s.type.includes('kana') ? '文' : s.type.includes('counter') ? '数' : s.type.includes('conj') ? '動' : s.type.includes('grammar') ? '文' : s.type.includes('anki') ? '牌' : '◆',
    text: s.label,
    actionFn:    s.actionFn    || null,
    actionPanel: s.actionPanel || null,
    actionLabel: s.actionLabel || null
  }));
  agentRenderCards(agentCards);
  (App.Storage || window.Storage).setJSON(AGENT_CACHE_KEY, { ts: Date.now(), cards: agentCards });

  if (btn) { btn.textContent = '↻ Refresh'; btn.disabled = false; }
  agentUpdatePresence();
}

// ── Render cards ──────────────────────────────────────────────────
function agentRenderCards(cards) {
  const container = document.getElementById('agentCards');
  if (!container) return;
  container.innerHTML = cards.map(function(card) {
    let btn = '';
    if (card.actionFn) {
      btn = '<button class="btn-action" onclick="' + card.actionFn + '" style="white-space:nowrap;flex-shrink:0">' + (card.actionLabel || '\u2192') + '</button>';
    } else if (card.actionPanel) {
      btn = '<button class="btn-action" onclick="showPanel(\'' + card.actionPanel + '\')" style="white-space:nowrap;flex-shrink:0">' + (card.actionLabel || '\u2192') + '</button>';
    }
    return '<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--border);border-radius:8px;background:var(--paper-dark)">'
      + '<span style="font-size:1.1rem;flex-shrink:0">' + (card.icon || '\u25c8') + '</span>'
      + '<span style="flex:1;font-family:var(--ui);font-size:inherit;color:var(--ink);line-height:1.5">' + card.text + '</span>'
      + btn
      + '</div>';
  }).join('');
}


// ── Claude AI briefing ─────────────────────────────────────────────
const AGENT_CONTEXT_KEY = 'agentLearnerProfile';
let _agentConversation  = [];  // [{role, content}] — in-memory thread

// Profile is stored as a JSON object with named fields
function agentContextLoad() {
  try {
    const raw = (App.Storage || window.Storage).get(AGENT_CONTEXT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') return { other: parsed };
    return parsed;
  } catch(e) { return {}; }
}

function agentContextSave(profile) {
  try { (App.Storage || window.Storage).set(AGENT_CONTEXT_KEY, JSON.stringify(profile)); } catch(e) {}
}

// Build a prose summary of the profile for Claude
function agentContextToPrompt(profile) {
  if (!profile || typeof profile !== 'object') return '';
  const lines = [];
  // Mastered overrides first — highest priority, must not be contradicted
  if (profile.mastered)     lines.push('ALREADY MASTERED — do not mention or recommend: ' + profile.mastered);
  if (profile.nativeLang)   lines.push('Native language: ' + profile.nativeLang);
  if (profile.otherLangs)   lines.push('Other languages: ' + profile.otherLangs);
  if (profile.currentLevel) lines.push('Current level: ' + profile.currentLevel);
  if (profile.targetLevel)  lines.push('Target level: ' + profile.targetLevel);
  if (profile.aims)         lines.push('Learning aims: ' + profile.aims);
  if (profile.dailyTime)    lines.push('Daily study time: ' + profile.dailyTime);
  if (profile.lessons)      lines.push('Lessons: ' + profile.lessons);
  if (profile.background)   lines.push('Background: ' + profile.background);
  if (profile.other)        lines.push('Other: ' + profile.other);
  if (!lines.length) return '';
  return '\n\n### Learner profile\n' + lines.join('\n');
}

function agentRenderThread() {
  const thread = document.getElementById('agentClaudeThread');
  if (!thread) return;
  if (!_agentConversation.length) { thread.innerHTML = ''; return; }
  thread.innerHTML = _agentConversation.map(m => {
    const isUser = m.role === 'user';
    if (isUser && m._hidden) return '';
    const label = isUser ? 'YOU' : 'CLAUDE';
    const color = isUser ? 'var(--ink-light)' : 'var(--teal)';
    return '<div style="margin-bottom:14px">'
      + '<div style="font-family:var(--ui);font-size:0.65rem;letter-spacing:0.1em;color:' + color + ';margin-bottom:4px">' + label + '</div>'
      + '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink);line-height:1.7">' + renderMarkdown(m.content || '') + '</div>'
      + '</div>';
  }).join('');
  thread.scrollTop = thread.scrollHeight;
}

const BRIEFING_CACHE_KEY = 'agentDailyBriefing';

function briefingTodayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function briefingLoadCache() {
  try {
    const c = (App.Storage || window.Storage).getJSON(BRIEFING_CACHE_KEY, null);
    if (c && c.date === briefingTodayKey()) return c.text;
  } catch(e) {}
  return null;
}

function briefingSaveCache(text) {
  try { (App.Storage || window.Storage).setJSON(BRIEFING_CACHE_KEY, { date: briefingTodayKey(), text }); } catch(e) {}
}

async function agentClaudeBriefing(force) {
  const btn     = document.getElementById('agentClaudeBtn');
  const respDiv = document.getElementById('agentClaudeResponse');
  const thread  = document.getElementById('agentClaudeThread');
  if (!respDiv || !thread) return;

  const apiKey = (App.getApiKey || window.getApiKey)?.();
  if (!apiKey) {
    respDiv.style.display = 'block';
    thread.innerHTML = '<div style="color:var(--ink-light);font-family:var(--ui);font-size:inherit">No API key set — add one in Settings.</div>';
    return;
  }
  if (typeof StudentModel === 'undefined') {
    respDiv.style.display = 'block';
    thread.innerHTML = '<div style="color:var(--ink-light);font-family:var(--ui);font-size:inherit">StudentModel not loaded.</div>';
    return;
  }

  // Show cached briefing if fresh and not forced
  if (!force) {
    const cached = briefingLoadCache();
    if (cached) {
      respDiv.style.display = 'block';
      thread.innerHTML = '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink);line-height:1.7">' + renderMarkdown(cached) + '</div>';
      _agentConversation = [{ role: 'assistant', content: cached }];
      const followUp = document.getElementById('agentFollowUpRow');
      if (followUp) followUp.style.display = 'flex';
      return;
    }
  }

  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  respDiv.style.display = 'block';

  try {
    const summary   = await (App.StudentModel || window.StudentModel).claudeSummary();
    const profile   = agentContextLoad();
    const ctxNote   = agentContextToPrompt(profile);

    // Prompts live in briefing-prompt.js — edit that file to tune without touching the app
    const systemPrompt = window.BRIEFING_SYSTEM_PROMPT ||
      "You are a Japanese language tutor. Be direct, reference actual data, no bullet points, 3-4 sentences.";
    const firstMsg = window.BRIEFING_FIRST_MSG_TEMPLATE
      ? window.BRIEFING_FIRST_MSG_TEMPLATE(summary, ctxNote)
      : `Here is my current learning snapshot:\n\n${summary}${ctxNote}\n\nWhat should I focus on today?`;

    _agentConversation = [{ role: 'user', content: firstMsg, _hidden: true }];

    thread.innerHTML = '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light)">Thinking\u2026</div>';

    const reply = await _agentStream(systemPrompt, _agentConversation, thread, false);
    _agentConversation.push({ role: 'assistant', content: reply });
    agentRenderThread();
    briefingSaveCache(reply);

    const followUp = document.getElementById('agentFollowUpRow');
    if (followUp) followUp.style.display = 'flex';

  } catch(e) {
    thread.innerHTML = '<div style="color:var(--red);font-family:var(--ui);font-size:inherit">Error: ' + e.message + '</div>';
    console.error('[agentClaudeBriefing]', e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↺ Refresh'; }
  }
}

async function agentClaudeFollowUp() {
  const input  = document.getElementById('agentFollowUpInput');
  const btn    = document.getElementById('agentFollowUpBtn');
  const thread = document.getElementById('agentClaudeThread');
  if (!input || !btn || !thread) return;
  const question = input.value.trim();
  if (!question) return;
  const apiKey = (App.getApiKey || window.getApiKey)?.();
  if (!apiKey) return;

  input.value = '';
  btn.disabled = true;
  btn.textContent = '\u2026';

  _agentConversation.push({ role: 'user', content: question });
  agentRenderThread();

  const systemPrompt = "You are a Japanese language tutor. Answer follow-up questions about the student's learning data concisely. Reference specific data where relevant. Always respond in English regardless of the language of the input.";
  try {
    const messages = _agentConversation.map(m => ({ role: m.role, content: m.content }));
    const reply = await _agentStream(systemPrompt, messages, thread, true);
    _agentConversation.push({ role: 'assistant', content: reply });
    agentRenderThread();
    // Tag question to grammar node — fire and forget
    (App.questionRecordGrammarEvidence || window.questionRecordGrammarEvidence)?.(question, reply);
  } catch(e) {
    console.error('[agentClaudeFollowUp]', e);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send';
    input.focus();
  }
}

async function _agentStream(systemPrompt, messages, threadEl, appendOnly) {
  const apiKey = (App.getApiKey || window.getApiKey)?.();
  // Streaming call — bypasses claudeAPI, log manually
  console.warn('[API] Claude stream · feature="agent-stream" · tokens: n/a (streaming)');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 400,
      stream:     true,
      system:     systemPrompt,
      messages:   messages.map(m => ({ role: m.role, content: m.content })),
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || response.statusText);
  }

  const replyId = 'agent-reply-' + Date.now();
  const replyHTML = '<div style="font-family:var(--ui);font-size:0.65rem;letter-spacing:0.1em;color:var(--teal);margin-bottom:4px">CLAUDE</div>'
    + '<div id="' + replyId + '-text" style="font-family:var(--ui);font-size:inherit;color:var(--ink);line-height:1.7"></div>';

  if (appendOnly) {
    const block = document.createElement('div');
    block.style.marginBottom = '14px';
    block.innerHTML = replyHTML;
    threadEl.appendChild(block);
  } else {
    threadEl.innerHTML = replyHTML;
  }

  const textEl  = document.getElementById(replyId + '-text');
  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') break;
      try {
        const delta = JSON.parse(data).delta?.text || '';
        if (delta && textEl) { full += delta; textEl.innerHTML = renderMarkdown(full); threadEl.scrollTop = threadEl.scrollHeight; }
      } catch(e) {}
    }
  }
  if (textEl) textEl.innerHTML = renderMarkdown(full);
  return full;
}


function agentContextUpdateBtn() {
  const btn = document.getElementById('agentContextBtn');
  if (!btn) return;
  const p = agentContextLoad();
  const filled = p && Object.keys(p).some(k => p[k]);
  btn.textContent = filled ? 'About me ✓' : 'About me';
  btn.classList.toggle('result-correct', filled);
}

function agentToggleContext() {
  const panel = document.getElementById('agentContextPanel');
  if (!panel) return;
  const open = panel.style.display !== 'none';
  panel.style.display = open ? 'none' : '';
  if (!open) agentContextPopulateFields();
}

function agentContextPopulateFields() {
  const p = agentContextLoad();
  const fields = ['nativeLang','otherLangs','currentLevel','targetLevel','aims','dailyTime','lessons','mastered','background','other'];
  fields.forEach(f => {
    const el = document.getElementById('agentCtx_' + f);
    if (el) el.value = p[f] || '';
  });
}

function agentContextSaveFromFields() {
  const fields = ['nativeLang','otherLangs','currentLevel','targetLevel','aims','dailyTime','lessons','mastered','background','other'];
  const profile = {};
  fields.forEach(f => {
    const el = document.getElementById('agentCtx_' + f);
    if (el && el.value.trim()) profile[f] = el.value.trim();
  });
  agentContextSave(profile);
  agentContextUpdateBtn();
}

document.addEventListener('storageReady', () => {
  agentContextUpdateBtn();
  // Load grammar model
  if (typeof (App.GrammarModel || window.GrammarModel) !== 'undefined') (App.GrammarModel || window.GrammarModel).load().catch(e => console.warn('[GrammarModel]', e));
  // Populate ヨシ panel if it's the active panel on load
  if (typeof lessonNotesRenderPanel === 'function') lessonNotesRenderPanel();
  // Auto-trigger daily briefing (uses cache if already run today)
  setTimeout(() => agentClaudeBriefing(false), 800);
});

// ── Presence indicator: badge on 進捗 button + strip on 質問 ──────
function agentUpdatePresence() {
  try {
    const signals = agentCollectSignals();
    const topPriority = signals.length ? signals[0].priority : 0;
    const topCard = (() => {
      try {
        const cached = (App.Storage || window.Storage).getJSON(AGENT_CACHE_KEY, null);
        if (cached && cached.cards && cached.cards.length) return cached.cards[0];
      } catch(e) {}
      return null;
    })();

    // ── Badge: show if user hasn't visited 進捗 today ───────────
    const lastVisit = parseInt((App.Storage || window.Storage).get('agentLastProgressView') || '0');
    const visitedToday = lastVisit
      && new Date(lastVisit).toDateString() === new Date().toDateString();
    const hasSomethingToSee = signals.length > 0;
    const showBadge = hasSomethingToSee && !visitedToday;

    const pClass = topPriority >= 3 ? 'priority-high'
                 : topPriority >= 2 ? 'priority-mid'
                 : 'priority-low';

    const navBtn = document.getElementById('progressNavBtn');
    if (navBtn) {
      navBtn.querySelector('.agent-badge')?.remove();
      if (showBadge) {
        const dot = document.createElement('span');
        dot.className = 'agent-badge ' + pClass;
        navBtn.appendChild(dot);
      }
    }

    // ── Dots on drill tabs: only when session started but not finished ──
    const setTabDot = (btnId, show) => {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      btn.querySelector('.drill-incomplete-dot')?.remove();
      if (show) {
        const dot = document.createElement('span');
        dot.className = 'drill-incomplete-dot agent-badge priority-mid';
        btn.appendChild(dot);
      }
    };

    // 文法 tab: show dot if conj OR counters started but not done today
    const conjSession  = (typeof ConjSession !== 'undefined') ? ConjSession.load() : null;
    const countSession = (typeof CM !== 'undefined') ? CM.loadSession() : null;
    const conjStarted  = conjSession  && !conjSession.completed  && conjSession.queue?.length > 0;
    const countStarted = countSession && !countSession.completed && countSession.queue?.length > 0;
    setTabDot('grammar2NavBtn', conjStarted || countStarted);

    // ── Strip on 質問 dashboard ─────────────────────────────────
    if (strip) {
      if (!signals.length) {
        strip.style.display = 'none';
        return;
      }
      const text = topCard ? topCard.text : signals[0].label;
      strip.style.display = '';
      strip.innerHTML =
        '<div class="agent-strip-inner" onclick="showPanel(\'progress\')">'
        + '<span class="agent-strip-dot ' + pClass + '"></span>'
        + '<span class="agent-strip-text">' + text + '</span>'
        + '<span class="agent-strip-cta">進捗 →</span>'
        + '</div>';
    }
  } catch(e) {}
}

// ── Open ノート at a specific tab, optionally pre-filling the textarea ──
function openGramNote(tab, prefill) {
  (App.showPanel || window.showPanel)?.('gramnotes');
  setTimeout(() => {
    // Find and click the right tab button
    const tabBtns = document.querySelectorAll('.gramnote-tab');
    tabBtns.forEach(btn => {
      if (btn.textContent.trim().toLowerCase() === tab.toLowerCase()
          || btn.getAttribute('onclick')?.includes("'" + tab + "'")) {
        gramNotesShowTab(tab, btn);
      }
    });
    if (prefill) {
      const ta = document.getElementById('gnote-input-' + tab);
      if (ta) { ta.value = prefill; ta.focus(); }
    }
  }, 80);
}

// ══════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════
// VOICE CONVERSATION
// ═══════════════════════════════════════════════════════

// Round-trip / comprehension state
// VoiceState.rt* — see declaration above

// Spoken error tracking
const SPOKEN_ERRORS_KEY = 'jpStudioSpokenErrors';
const PAUSE_DATA_KEY = 'jpStudioPauseData';

function pauseDataGet() {
  try { return JSON.parse(localStorage.getItem(PAUSE_DATA_KEY) || '[]'); } catch { return []; }
}

function pauseDataAdd(pauses) {
  // pauses: [{gapMs, before, after, lowConfidence}]
  if (!pauses || !pauses.length) return;
  const stored = pauseDataGet();
  const date = new Date().toISOString();
  pauses.forEach(p => stored.push({ ...p, date }));
  // Keep last 500 pause events
  if (stored.length > 500) stored.splice(0, stored.length - 500);
  localStorage.setItem(PAUSE_DATA_KEY, JSON.stringify(stored));
}

function pauseDataClear() {
  localStorage.removeItem(PAUSE_DATA_KEY);
}

// Extract intra-sentence pauses from Whisper verbose_json segments
// Returns [{gapMs, before, after, lowConfidence}]
function pauseAnalyse(segments) {
  const INTRA_THRESHOLD_MS = 1200; // gaps under this within a sentence are normal
  const LOW_CONF_THRESHOLD = -1.0; // avg_logprob below this = Whisper uncertain
  const pauses = [];

  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const next = segments[i + 1];
    const gapMs = Math.round((next.start - seg.end) * 1000);

    // Only intra-sentence pauses: the current segment doesn't end a sentence
    const text = (seg.text || '').trim();
    const endssentence = /[。！？\.!?]$/.test(text);
    if (endssentence) continue;
    if (gapMs < INTRA_THRESHOLD_MS) continue;

    pauses.push({
      gapMs,
      before: text.slice(-20), // last 20 chars before pause
      after: (next.text || '').trim().slice(0, 20), // first 20 chars after pause
      lowConfidence: (seg.avg_logprob || 0) < LOW_CONF_THRESHOLD
    });
  }
  return pauses;
}

function spokenErrorsGet() {
  try {
    return (App.Storage || window.Storage).getJSON(STORAGE_KEYS.SPOKEN_ERRORS_DATA, []);
  } catch { return []; }
}

function spokenErrorsSave(errors) {
  (App.Storage || window.Storage).setJSON(STORAGE_KEYS.SPOKEN_ERRORS_DATA, errors);
}
function spokenErrorsAdd(correction, userText) {
  if (!correction) return;
  
  const errors = spokenErrorsGet();
  
  // Categorize the error
  let category = 'other';
  const corrLower = correction.toLowerCase();
  
  if (corrLower.includes('particle') || corrLower.includes('は') || corrLower.includes('が') || corrLower.includes('を') || corrLower.includes('に') || corrLower.includes('で')) {
    category = 'particle';
  } else if (corrLower.includes('tense') || corrLower.includes('past') || corrLower.includes('future') || corrLower.includes('ました') || corrLower.includes('ます')) {
    category = 'tense';
  } else if (corrLower.includes('conjugat') || corrLower.includes('form') || corrLower.includes('て') || corrLower.includes('ない')) {
    category = 'conjugation';
  } else if (corrLower.includes('vocab') || corrLower.includes('word') || corrLower.includes('use ') || corrLower.includes('instead of')) {
    category = 'vocabulary';
  } else if (corrLower.includes('polite') || corrLower.includes('casual') || corrLower.includes('formal') || corrLower.includes('です')) {
    category = 'register';
  } else if (corrLower.includes('order') || corrLower.includes('word order') || corrLower.includes('structure')) {
    category = 'word_order';
  } else if (corrLower.includes('pronunc') || corrLower.includes('sound') || corrLower.includes('accent')) {
    category = 'pronunciation';
  }
  
  errors.push({
    correction: correction,
    userText: userText,
    category: category,
    date: new Date().toISOString()
  });
  
  // Keep last 200 errors
  if (errors.length > 200) errors.splice(0, errors.length - 200);
  
  spokenErrorsSave(errors);

  // Grammar evidence hook — speaking errors are negative signals
  _spokenErrorRecordGrammarEvidence(category, correction);
}

// Map spoken error categories to grammar nodes and nudge scores down
const SPOKEN_ERROR_TO_NODE = {
  particle: {
    'は': 'particle_wa', 'が': 'particle_ga', 'を': 'particle_wo',
    'に': 'particle_ni_time', 'で': 'particle_de_place', 'へ': 'particle_he',
    'と': 'particle_to', 'も': 'particle_mo', 'の': 'particle_no_possession',
  },
  tense: {
    'past':     'past_tense_masu',
    'ました':   'past_tense_masu',
    'ます':     'present_tense_masu',
  },
  conjugation: {
    'て':       'te_form',
    'ない':     'short_forms_plain',
    'form':     'short_forms_plain',
  },
};

function _spokenErrorRecordGrammarEvidence(category, correction) {
  try {
    if (typeof (App.GrammarModel || window.GrammarModel) === 'undefined' || !(App.GrammarModel || window.GrammarModel).loaded) return;
    const typeMap = SPOKEN_ERROR_TO_NODE[category];
    if (!typeMap) return;

    // Find matching node — try each key against the correction text
    let nodeId = null;
    for (const [key, id] of Object.entries(typeMap)) {
      if (correction.includes(key)) { nodeId = id; break; }
    }
    if (!nodeId) return;
    if ((App.GrammarModel || window.GrammarModel).isOverridden(nodeId)) return;

    const current = (App.GrammarModel || window.GrammarModel).getScore(nodeId);
    const newScore = Math.max(0, current - 0.06);
    (App.GrammarModel || window.GrammarModel).recordEvidence(nodeId, 'speaking', newScore,
      'spoken error: ' + correction.slice(0, 60)
    ).catch(() => {});
  } catch(e) {}
}

function spokenErrorsClear() {
  if (!confirm('Clear all spoken error data? This cannot be undone.')) return;
  // Clear from unified SQL table (primary store)
  window.db?.run('DELETE FROM error_history WHERE source=\'spoken\'').catch(e => console.error('[spokenErrorsClear]', e));
  // Clear legacy localStorage copy
  (App.Storage || window.Storage).remove(STORAGE_KEYS.SPOKEN_ERRORS_DATA);
  renderSpokenErrorsProgress();
}

function spokenErrorShowPopup(cat) {
  // Delegates to shared errorShowPopup in features-progress.js
  window._errorExamples = window._spokenErrorExamples || {};
  window._errorExampleColors = window._spokenCatColors || {};
  const label = (window._spokenCatLabels || {})[cat] || cat;
  // Show human-readable label in popup title
  const saved = (window._errorExamples[cat] || []).slice();
  if (!window._errorExamples[label]) window._errorExamples[label] = saved;
  (App.errorShowPopup || window.errorShowPopup)?.(label);
}

async function renderSpokenErrorsProgress() {
  const chartEl = document.getElementById('progress-spoken-chart');
  const listEl  = document.getElementById('progress-spoken-list');
  const emptyEl = document.getElementById('progress-spoken-empty');
  if (!chartEl || !listEl || !emptyEl) return;

  const catColors = {
    particle:'var(--red)', tense:'var(--gold)', conjugation:'var(--teal)',
    vocabulary:'#9b59b6', register:'#3498db', word_order:'#e67e22',
    pronunciation:'#1abc9c', other:'var(--ink-light)'
  };
  const catLabels = {
    particle:'Particles', tense:'Tense', conjugation:'Conjugation',
    vocabulary:'Vocabulary', register:'Register', word_order:'Word order',
    pronunciation:'Pronunciation', other:'Other'
  };

  // Read from error_history with time filter
  let errors = [];
  const _mView = (typeof _masteryView !== 'undefined') ? _masteryView : 'all';
  try {
    const bounds = _mView === 'last'     ? (typeof _todayBounds !== 'undefined' ? _todayBounds() : null)
                 : _mView === 'week'     ? (typeof _weekBounds  !== 'undefined' ? _weekBounds(0)  : null)
                 : (_mView === 'lastweek' || _mView === 'prev') ? (typeof _weekBounds !== 'undefined' ? _weekBounds(1) : null)
                 : null;
    const sql = bounds
      ? 'SELECT errorType as category, corrected as correction, input, t FROM error_history WHERE source=\'spoken\' AND t >= ? AND t < ? ORDER BY t DESC LIMIT 500'
      : 'SELECT errorType as category, corrected as correction, input, t FROM error_history WHERE source=\'spoken\' ORDER BY t DESC LIMIT 500';
    const params = bounds ? [bounds.from, bounds.to] : [];
    errors = await window.db?.query(sql, params) || [];
  } catch(e) { console.error('[renderSpokenErrorsProgress]', e); }

  if (errors.length === 0) {
    chartEl.innerHTML = ''; listEl.innerHTML = '';
    emptyEl.style.display = 'block'; return;
  }
  emptyEl.style.display = 'none';

  // Category counts for pie
  const cats = {};
  errors.forEach(e => cats[e.category] = (cats[e.category]||0)+1);
  const sorted = Object.entries(cats).sort((a,b)=>b[1]-a[1]);
  const total = errors.length;

  // Pie in chartEl (left)
  const _rp = App._renderErrorPieRight || window._renderErrorPieRight;
  if (_rp) _rp(chartEl, sorted, total);
  else chartEl.innerHTML = '';

  // Ranked category list in listEl (right)
  const bestCorrection = {};
  errors.forEach(e => {
    const cat = e.category;
    const corr = (e.correction || '').trim();
    if (!bestCorrection[cat]) bestCorrection[cat] = {};
    bestCorrection[cat][corr] = (bestCorrection[cat][corr] || 0) + 1;
  });
  const topCorrection = {};
  for (const [cat, corrs] of Object.entries(bestCorrection)) {
    topCorrection[cat] = Object.entries(corrs).sort((a,b)=>b[1]-a[1])[0]?.[0] || '';
  }
  // Store examples per category for popup
  const catExamples = {};
  errors.forEach(e => {
    if (!catExamples[e.category]) catExamples[e.category] = [];
    if (catExamples[e.category].length < 10) catExamples[e.category].push(e);
  });
  // Store on window for popup access
  window._spokenErrorExamples = catExamples;
  window._spokenCatLabels = catLabels;
  window._spokenCatColors = catColors;

  // Set shared popup data
  window._spokenErrorExamples = catExamples;
  window._spokenCatLabels = catLabels;
  window._spokenCatColors = catColors;

  const _rl = App.renderErrorList || window.renderErrorList;
  if (_rl) _rl(listEl, sorted.slice(0, 8).map(([cat, cnt]) => ({
    key: cat, count: cnt, col: catColors[cat] || 'var(--ink-light)', label: catLabels[cat] || cat
  })));


  // Pause patterns — top 3 most common hesitation positions
  const pauseData = pauseDataGet ? pauseDataGet() : [];
  const recentPauses = pauseData.filter(p => !p.lowConfidence && p.gapMs >= 1200);
  if (recentPauses.length >= 3) {
    // Tally by what follows the pause (after context)
    const afterTally = {};
    recentPauses.forEach(p => {
      const key = (p.after || '').trim().slice(0, 8);
      if (key) afterTally[key] = (afterTally[key] || { key, count: 0, avgGap: 0 });
      if (key) { afterTally[key].count++; afterTally[key].avgGap += p.gapMs; }
    });
    const topAfter = Object.values(afterTally)
      .filter(v => v.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(v => ({ ...v, avgGap: Math.round(v.avgGap / v.count) }));

    if (topAfter.length) {
      listEl.innerHTML += '<div style="font-family:var(--ui);font-size:0.68rem;letter-spacing:0.08em;color:var(--ink-light);margin:10px 0 5px">HESITATIONS</div>'
        + '<div style="display:flex;flex-direction:column;gap:5px">'
        + topAfter.map(v =>
            '<div style="display:flex;align-items:center;gap:6px">'
            + '<span style="display:inline-block;width:6px;height:6px;border-radius:2px;background:var(--gold);flex-shrink:0"></span>'
            + '<span style="font-family:var(--jp);font-size:0.72rem;color:var(--ink-light);flex:1">' + v.key + '…</span>'
            + '<span style="font-family:var(--ui);font-size:0.68rem;color:var(--ink-light)">' + v.count + '× <span style="opacity:0.6">' + (v.avgGap >= 1000 ? (v.avgGap/1000).toFixed(1) + 's' : v.avgGap + 'ms') + '</span></span>'
            + '</div>'
          ).join('')
        + '</div>';
    }
  }
}



// Profile for personalized conversations
const VOICE_PROFILE_KEY = 'jpStudioVoiceProfile';

function voiceGetProfile() {
  try {
    return JSON.parse(localStorage.getItem(VOICE_PROFILE_KEY) || '{}');
  } catch { return {}; }
}

function voiceSaveProfile(profile) {
  localStorage.setItem(VOICE_PROFILE_KEY, JSON.stringify(profile));
}

function voiceOpenProfile() {
  const profile = voiceGetProfile();
  
  const modal = document.createElement('div');
  modal.id = 'voiceProfileModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999';
  modal.innerHTML = `
    <div style="background:var(--paper);border:1px solid var(--border);border-radius:12px;padding:24px;max-width:550px;width:90%;max-height:85vh;overflow-y:auto">
      <div style="font-family:var(--ui);font-size:0.72rem;color:var(--gold);letter-spacing:0.05em;margin-bottom:6px">👤 CONVERSATION PROFILE</div>
      <div style="font-family:var(--ui);font-size:0.8rem;color:var(--ink-light);margin-bottom:20px">Claude will remember these details to make conversations more personal and relevant.</div>
      
      <div style="margin-bottom:14px">
        <label style="display:block;font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-bottom:4px">Your name (optional)</label>
        <input type="text" id="voiceProfileName" value="${(profile.name || '').replace(/"/g, '&quot;')}" placeholder="How should Claude address you?"
          style="width:100%;padding:10px;background:var(--field);border:1px solid var(--field-border);border-radius:6px;font-family:var(--ui);font-size:inherit;color:var(--ink);box-sizing:border-box">
      </div>
      
      <div style="margin-bottom:14px">
        <label style="display:block;font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-bottom:4px">Location / Where you live</label>
        <input type="text" id="voiceProfileLocation" value="${(profile.location || '').replace(/"/g, '&quot;')}" placeholder="e.g., Berlin, Tokyo, California"
          style="width:100%;padding:10px;background:var(--field);border:1px solid var(--field-border);border-radius:6px;font-family:var(--ui);font-size:inherit;color:var(--ink);box-sizing:border-box">
      </div>
      
      <div style="margin-bottom:14px">
        <label style="display:block;font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-bottom:4px">Occupation / What you do</label>
        <input type="text" id="voiceProfileOccupation" value="${(profile.occupation || '').replace(/"/g, '&quot;')}" placeholder="e.g., software engineer, student, teacher"
          style="width:100%;padding:10px;background:var(--field);border:1px solid var(--field-border);border-radius:6px;font-family:var(--ui);font-size:inherit;color:var(--ink);box-sizing:border-box">
      </div>
      
      <div style="margin-bottom:14px">
        <label style="display:block;font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-bottom:4px">Hobbies & Interests</label>
        <input type="text" id="voiceProfileHobbies" value="${(profile.hobbies || '').replace(/"/g, '&quot;')}" placeholder="e.g., hiking, anime, cooking, music"
          style="width:100%;padding:10px;background:var(--field);border:1px solid var(--field-border);border-radius:6px;font-family:var(--ui);font-size:inherit;color:var(--ink);box-sizing:border-box">
      </div>
      
      <div style="margin-bottom:14px">
        <label style="display:block;font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-bottom:4px">Why you're learning Japanese</label>
        <input type="text" id="voiceProfileGoal" value="${(profile.goal || '').replace(/"/g, '&quot;')}" placeholder="e.g., planning to live in Japan, love Japanese media, work"
          style="width:100%;padding:10px;background:var(--field);border:1px solid var(--field-border);border-radius:6px;font-family:var(--ui);font-size:inherit;color:var(--ink);box-sizing:border-box">
      </div>
      
      <div style="margin-bottom:14px">
        <label style="display:block;font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-bottom:4px">Connection to Japan</label>
        <input type="text" id="voiceProfileJapanConnection" value="${(profile.japanConnection || '').replace(/"/g, '&quot;')}" placeholder="e.g., visited Tokyo last year, spouse is Japanese, never been"
          style="width:100%;padding:10px;background:var(--field);border:1px solid var(--field-border);border-radius:6px;font-family:var(--ui);font-size:inherit;color:var(--ink);box-sizing:border-box">
      </div>
      
      <div style="margin-bottom:14px">
        <label style="display:block;font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-bottom:4px">Family / Pets (for conversation topics)</label>
        <input type="text" id="voiceProfileFamily" value="${(profile.family || '').replace(/"/g, '&quot;')}" placeholder="e.g., married with 2 kids, have a cat named Mochi"
          style="width:100%;padding:10px;background:var(--field);border:1px solid var(--field-border);border-radius:6px;font-family:var(--ui);font-size:inherit;color:var(--ink);box-sizing:border-box">
      </div>
      
      <div style="margin-bottom:20px">
        <label style="display:block;font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-bottom:4px">Other details Claude should know</label>
        <textarea id="voiceProfileOther" rows="3" placeholder="Any other details that would help make conversations more personal and interesting..."
          style="width:100%;padding:10px;background:var(--field);border:1px solid var(--field-border);border-radius:6px;font-family:var(--ui);font-size:inherit;color:var(--ink);resize:vertical;box-sizing:border-box">${profile.other || ''}</textarea>
      </div>
      
      <div style="display:flex;gap:10px;justify-content:space-between;flex-wrap:wrap">
        <button class="btn-action" onclick="voiceStartProfileInterview()">🎙️ Interview me in Japanese</button>
        <div style="display:flex;gap:10px">
          <button class="btn-action" onclick="document.getElementById('voiceProfileModal').remove()">Cancel</button>
          <button onclick="voiceSaveProfileFromModal()" 
            style="padding:10px 20px;background:var(--gold);border:none;border-radius:6px;font-family:var(--ui);font-size:inherit;color:#1c1c1e;cursor:pointer">Save Profile</button>
        </div>
      </div>
    </div>
  `;
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  
  document.body.appendChild(modal);
}

function voiceSaveProfileFromModal() {
  const profile = {
    name: document.getElementById('voiceProfileName').value.trim(),
    location: document.getElementById('voiceProfileLocation').value.trim(),
    occupation: document.getElementById('voiceProfileOccupation').value.trim(),
    hobbies: document.getElementById('voiceProfileHobbies').value.trim(),
    goal: document.getElementById('voiceProfileGoal').value.trim(),
    japanConnection: document.getElementById('voiceProfileJapanConnection').value.trim(),
    family: document.getElementById('voiceProfileFamily').value.trim(),
    other: document.getElementById('voiceProfileOther').value.trim()
  };
  
  voiceSaveProfile(profile);
  document.getElementById('voiceProfileModal').remove();
  voiceUpdateStatus('Profile saved!');
  setTimeout(() => voiceUpdateStatus(''), 2000);
}

function voiceGetProfilePrompt() {
  const p = voiceGetProfile();
  const lp = (typeof agentContextLoad === 'function') ? agentContextLoad() : {};
  const parts = [];

  if (p.name) parts.push(`The user's name is ${p.name}.`);
  if (p.location) parts.push(`They live in ${p.location}.`);
  // Pull language background from learner profile if not in voice profile
  const nativeLang = lp.nativeLang || '';
  const otherLangs = lp.otherLangs || '';
  if (nativeLang) parts.push(`Native language: ${nativeLang}.${otherLangs ? ' Also speaks: ' + otherLangs + '.' : ''}`);
  if (lp.currentLevel) parts.push(`Japanese level: ${lp.currentLevel}.`);
  if (p.occupation) parts.push(`They work as/are a ${p.occupation}.`);
  if (p.hobbies) parts.push(`Their hobbies/interests include: ${p.hobbies}.`);
  if (p.goal || lp.aims) parts.push(`They're learning Japanese because: ${p.goal || lp.aims}.`);
  if (p.japanConnection) parts.push(`Their connection to Japan: ${p.japanConnection}.`);
  if (p.family) parts.push(`Family/pets: ${p.family}.`);
  if (lp.lessons) parts.push(`They have regular lessons: ${lp.lessons}.`);
  if (p.other) parts.push(`Other details: ${p.other}`);

  if (parts.length === 0) return '';

  return `\n\nABOUT THE USER (use naturally in conversation, ask follow-up questions about their life):\n${parts.join('\n')}`;
}


// VoiceState.interview* — see declaration above

function voiceStartProfileInterview() {
  // Close the profile modal
  const modal = document.getElementById('voiceProfileModal');
  if (modal) modal.remove();
  
  // Start interview mode
  VoiceState.interviewMode = true;
  VoiceState.interviewData = {};
  VoiceState.messages = [];
  
  voiceUpdateStatus('Interview mode - Claude will ask you questions in Japanese');
  
  // Start the interview with Claude's first question
  voiceInterviewAsk();
}

async function voiceInterviewAsk() {
  const apiKey = (App.getApiKey || window.getApiKey)?.();
  if (!apiKey) {
    voiceUpdateStatus('Please set your Claude API key first');
    VoiceState.interviewMode = false;
    return;
  }
  
  const level = document.getElementById('voiceLevel')?.value || 'N4';
  const currentProfile = voiceGetProfile();
  
  const levelGuide = {
    N5: 'Use only N5 vocabulary and simple です/ます forms. Keep questions very short. Add furigana in parentheses for all kanji.',
    N4: 'Use N5-N4 vocabulary. Keep questions simple and clear. Add furigana for N4+ kanji.',
    N3: 'Use natural conversational Japanese at N3 level. Add furigana for N3+ kanji.'
  };
  
  // Build context of what we already know
  const alreadyKnown = [];
  if (VoiceState.interviewData.name || currentProfile.name) alreadyKnown.push('name');
  if (VoiceState.interviewData.location || currentProfile.location) alreadyKnown.push('location');
  if (VoiceState.interviewData.occupation || currentProfile.occupation) alreadyKnown.push('occupation');
  if (VoiceState.interviewData.hobbies || currentProfile.hobbies) alreadyKnown.push('hobbies');
  if (VoiceState.interviewData.goal || currentProfile.goal) alreadyKnown.push('reason for learning Japanese');
  if (VoiceState.interviewData.japanConnection || currentProfile.japanConnection) alreadyKnown.push('connection to Japan');
  if (VoiceState.interviewData.family || currentProfile.family) alreadyKnown.push('family/pets');
  
  const topicsToAsk = ['name', 'location', 'occupation', 'hobbies', 'reason for learning Japanese', 'connection to Japan', 'family/pets']
    .filter(t => !alreadyKnown.includes(t));
  
  if (topicsToAsk.length === 0) {
    // Interview complete
    VoiceState.interviewMode = false;
    const finalProfile = { ...currentProfile, ...VoiceState.interviewData };
    voiceSaveProfile(finalProfile);
    
    VoiceState.messages.push({ 
      role: 'assistant', 
      content: 'ありがとうございました！プロフィールを保存しました。これからもっと楽しい会話ができますね！' 
    });
    voiceRenderMessages();
    jpSpeak('ありがとうございました！プロフィールを保存しました。これからもっと楽しい会話ができますね！');
    voiceUpdateStatus('Interview complete! Profile saved.');
    return;
  }
  
  const systemPrompt = `You are conducting a friendly get-to-know-you interview in Japanese with a language learner.

Level: ${levelGuide[level] || levelGuide.N5}

Your task: Ask ONE question to learn about the user. Pick from these topics (in order of priority):
${topicsToAsk.map((t, i) => `${i + 1}. ${t}`).join('\n')}

${VoiceState.messages.length === 0 ? 'Start with a warm greeting and introduce yourself, then ask your first question.' : 'Ask about the next topic naturally, building on what they just told you.'}

Conversation so far:
${VoiceState.messages.map(m => `${m.role === 'user' ? 'User' : 'You'}: ${m.content}`).join('\n')}

IMPORTANT: Respond with JSON:
{"reply":"Your question in Japanese","topic":"which topic you're asking about (name/location/occupation/hobbies/goal/japanConnection/family)"}

Be warm, encouraging, and conversational. React to their answers before asking the next question.`;

  voiceUpdateStatus('Thinking...');
  
  try {
    const data = await (App.claudeAPI || window.claudeAPI)({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages: [{ role: 'user', content: systemPrompt }]
    ,
      track: 'speaking'
    });
    
    const rawText = data.content?.[0]?.text?.trim() || '';
    
    let reply = 'すみません、もう一度お願いします。';
    
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        reply = parsed.reply || reply;
      }
    } catch {
      reply = rawText;
    }
    
    VoiceState.messages.push({ role: 'assistant', content: reply });
    rtCheckProgress();
    voiceRenderMessages();
    voiceUpdateStatus('Your turn - speak or type your answer');
    jpSpeak(reply);
    
  } catch (e) {
    console.error('Interview error:', e);
    voiceUpdateStatus('Error - please try again');
    VoiceState.interviewMode = false;
  }
}

async function voiceInterviewProcessAnswer(userText) {
  const apiKey = (App.getApiKey || window.getApiKey)?.();
  if (!apiKey) return;
  
  // Note: user message is already pushed by voiceProcessAudio/voiceSendText before calling voiceSendToClaude
  
  voiceUpdateStatus('Understanding your answer...');
  
  // Extract profile info from the answer
  const systemPrompt = `The user answered an interview question in Japanese. Extract any personal information they shared.

Their answer: "${userText}"

Recent conversation context:
${VoiceState.messages.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n')}

Extract what you learned and return JSON with any of these fields that apply:
{
  "name": "their name if mentioned",
  "location": "where they live if mentioned", 
  "occupation": "their job/what they do if mentioned",
  "hobbies": "hobbies/interests if mentioned",
  "goal": "why they're learning Japanese if mentioned",
  "japanConnection": "their connection to Japan if mentioned",
  "family": "family/pets if mentioned"
}

Only include fields where you learned something. If they gave unclear or off-topic answers, return empty object {}.`;

  try {
    const data = await (App.claudeAPI || window.claudeAPI)({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        messages: [{ role: 'user', content: systemPrompt }]
    ,
      track: 'speaking'
    });
    
    const rawText = data.content?.[0]?.text?.trim() || '';
    
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const extracted = JSON.parse(jsonMatch[0]);
        VoiceState.interviewData = { ...VoiceState.interviewData, ...extracted };
      }
    } catch {}
    
    // Continue with next question
    await voiceInterviewAsk();
    
  } catch (e) {
    console.error('Extract error:', e);
    // Continue anyway
    await voiceInterviewAsk();
  }
}


function voiceCheckKeys() {
  const hasOpenAI = !!getOpenAIKey();
  const hasClaude = !!(App.getApiKey || window.getApiKey)?.();
  const notice = document.getElementById('voiceKeyNotice');
  if (notice) {
    notice.style.display = hasOpenAI ? 'none' : 'block';
  }
  return { hasOpenAI, hasClaude };
}

function voiceUpdateStatus(msg) {
  const el = document.getElementById('voiceStatus');
  if (el) el.textContent = msg;
}

function voiceGetSavedConversations() {
  try {
    return JSON.parse((App.Storage || window.Storage).get(STORAGE_KEYS.VOICE_CONVOS_ALT) || '{}');
  } catch { return {}; }
}

function voiceSaveConversations(convos) {
  (App.Storage || window.Storage).set(STORAGE_KEYS.VOICE_CONVOS_ALT, JSON.stringify(convos));
}

function voiceUpdateConvoDropdown() {
  const select = document.getElementById('voiceConvoSelect');
  if (!select) return;
  
  const convos = voiceGetSavedConversations();
  const names = Object.keys(convos).sort();
  
  select.innerHTML = '<option value="">— New conversation —</option>' +
    names.map(name => `<option value="${name}" ${name === VoiceState.currentConvoName ? 'selected' : ''}>${name}</option>`).join('');
}

function voiceSaveConversation() {
  if (VoiceState.messages.length === 0) {
    voiceUpdateStatus('Nothing to save');
    return;
  }
  
  // If already named, just save
  if (VoiceState.currentConvoName) {
    const convos = voiceGetSavedConversations();
    convos[VoiceState.currentConvoName] = {
      messages: VoiceState.messages,
      level: document.getElementById('voiceLevel')?.value || 'N5',
      topic: document.getElementById('voiceTopic')?.value || 'free',
      updated: Date.now()
    };
    voiceSaveConversations(convos);
    voiceUpdateConvoDropdown();
    voiceUpdateStatus('Saved ✓');
    setTimeout(() => voiceUpdateStatus(''), 2000);
    return;
  }
  
  // Show name input modal
  const modal = document.createElement('div');
  modal.id = 'voiceSaveModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999';
  modal.innerHTML = `
    <div style="background:var(--paper);border:1px solid var(--border);border-radius:12px;padding:24px;width:90%;max-width:320px">
      <div style="font-family:var(--ui);font-size:inherit;color:var(--ink);margin-bottom:12px">Name this conversation:</div>
      <input type="text" id="voiceSaveNameInput" placeholder="e.g., Story about weekend" 
        style="width:100%;padding:10px;background:var(--field);border:1px solid var(--field-border);border-radius:6px;font-family:var(--ui);font-size:inherit;color:var(--ink);box-sizing:border-box;margin-bottom:16px">
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn-action" onclick="document.getElementById('voiceSaveModal').remove()">Cancel</button>
        <button class="btn-action" onclick="voiceDoSave()">Save</button>
      </div>
    </div>
  `;
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  
  document.body.appendChild(modal);
  
  const input = document.getElementById('voiceSaveNameInput');
  input.focus();
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') voiceDoSave();
  });
}

function voiceDoSave() {
  const input = document.getElementById('voiceSaveNameInput');
  const name = input?.value?.trim();
  
  if (!name) {
    input?.focus();
    return;
  }
  
  const convos = voiceGetSavedConversations();
  convos[name] = {
    messages: VoiceState.messages,
    level: document.getElementById('voiceLevel')?.value || 'N5',
    topic: document.getElementById('voiceTopic')?.value || 'free',
    updated: Date.now()
  };
  voiceSaveConversations(convos);
  VoiceState.currentConvoName = name;
  
  document.getElementById('voiceSaveModal')?.remove();
  voiceUpdateConvoDropdown();
  voiceUpdateStatus('Saved ✓');
  setTimeout(() => voiceUpdateStatus(''), 2000);
}


function voiceLoadConversation(name) {
  if (!name) {
    // New conversation
    voiceNewChat();
    return;
  }
  
  const convos = voiceGetSavedConversations();
  const convo = convos[name];
  if (!convo) return;
  
  VoiceState.messages = convo.messages || [];
  VoiceState.currentConvoName = name;
  
  if (convo.level) {
    const levelSelect = document.getElementById('voiceLevel');
    if (levelSelect) levelSelect.value = convo.level;
  }
  if (convo.topic) {
    const topicSelect = document.getElementById('voiceTopic');
    if (topicSelect) topicSelect.value = convo.topic;
  }
  
  voiceRenderMessages();
  voiceUpdateStatus(`Loaded: ${name}`);
  setTimeout(() => voiceUpdateStatus(''), 2000);
}

function voiceDeleteConversation() {
  if (!VoiceState.currentConvoName) {
    voiceUpdateStatus('No saved conversation selected');
    return;
  }
  
  if (!confirm(`Delete "${VoiceState.currentConvoName}"?`)) return;
  
  const convos = voiceGetSavedConversations();
  delete convos[VoiceState.currentConvoName];
  voiceSaveConversations(convos);
  
  VoiceState.currentConvoName = '';
  voiceNewChat();
  voiceUpdateConvoDropdown();
}

function voiceNewChat() {
  VoiceState.messages = [];
  VoiceState.currentConvoName = '';
  voiceUpdateConvoDropdown();
  
  const history = document.getElementById('voiceChatHistory');
  if (history) {
    history.innerHTML = `
      <div style="text-align:center;color:var(--ink-light);font-family:var(--ui);font-size:inherit;padding:40px 20px">
        <div style="font-size:2rem;margin-bottom:12px">🎙️</div>
        <div style="margin-bottom:8px">Press the microphone button and speak in Japanese</div>
        <div style="font-size:0.75rem;color:var(--ink-light)">Claude will respond and you can have a conversation</div>
      </div>
    `;
  }
  voiceUpdateStatus('');
}

function voiceTopicChanged(val) {
  if (val === 'four-three-two') { fttInit(); return; }
  const structured   = val === 'round-trip' || val === 'comprehension';
  const row          = document.getElementById('voiceStructuredRow');
  const label        = document.getElementById('voiceStructuredLabel');
  const topicInput   = document.getElementById('rtTopicInput');
  const transcriptWrap = document.getElementById('rtTranscriptWrap');

  // Reset round-trip state
  VoiceState.rtActive = structured;
  VoiceState.rtMode   = val;
  VoiceState.rtRound  = 0;
  VoiceState.rtTopic  = '';
  VoiceState.rtTranscript = '';
  VoiceState.rtMessages1 = [];
  VoiceState.rtMessages2 = [];
  if (topicInput)   topicInput.value = '';
  if (transcriptWrap) transcriptWrap.style.display = 'none';

  const r2Btn  = document.getElementById('rtRound2Btn');
  const cmpBtn = document.getElementById('rtCompareBtn');
  if (r2Btn)  r2Btn.style.display  = 'none';
  if (cmpBtn) cmpBtn.style.display = 'none';
  rtSetStatus('');

  if (structured) {
    row.style.display = 'flex';
    if (val === 'round-trip') {
      label.textContent = '↺ Topic:';
      topicInput.placeholder = 'What to talk about (optional)…';
      if (transcriptWrap) transcriptWrap.style.display = 'none';
    } else {
      label.textContent = '🎧 Situation:';
      topicInput.placeholder = 'Describe what the audio was about…';
      if (transcriptWrap) transcriptWrap.style.display = 'block';
    }
    voiceNewChat();
    VoiceState.rtRound = 1;
    rtSetStatus(val === 'round-trip' ? 'Round 1 — speak naturally' : 'Discuss in Japanese');
  } else {
    row.style.display = 'none';
  }
}

// Legacy — kept in case anything calls it
// ── 4/3/2 Fluency Drill ──────────────────────────────────────────────────────
function fttInit() {
  VoiceState.ftt_active     = false;
  VoiceState.ftt_round      = 0;
  VoiceState.ftt_transcript = '';
  VoiceState.ftt_minutes    = 4;
  VoiceState.ftt_timer      = null;
  VoiceState.ftt_all        = [];
  VoiceState.ftt_start_ts   = null;
  const row = document.getElementById('voiceStructuredRow');
  const label = document.getElementById('voiceStructuredLabel');
  const topicInput = document.getElementById('rtTopicInput');
  if (row) row.style.display = 'flex';
  if (label) label.textContent = '⏱ Topic:';
  if (topicInput) { topicInput.value = ''; topicInput.placeholder = 'What to talk about…'; }
  const r2Btn = document.getElementById('rtRound2Btn');
  const cmpBtn = document.getElementById('rtCompareBtn');
  if (r2Btn) r2Btn.style.display = 'none';
  if (cmpBtn) cmpBtn.style.display = 'none';
  rtSetStatus('');
  voiceNewChat();
}



function fttStartRound() {
  const topicInput = document.getElementById('rtTopicInput');
  const topic = topicInput?.value.trim() || 'free conversation';
  VoiceState.ftt_round++;
  VoiceState.ftt_transcript = '';
  VoiceState.ftt_active = true;
  VoiceState.ftt_start_ts = Date.now();
  const mins = [4, 3, 2][VoiceState.ftt_round - 1] || 2;
  VoiceState.ftt_minutes = mins;
  voiceUpdateStatus('Round ' + VoiceState.ftt_round + ' — speak freely');
  const timerEl = document.getElementById('ftt432Timer');
  const footerLower = document.getElementById('voiceFooterLower');
  if (footerLower) footerLower.style.display = '';
  if (timerEl) { timerEl.textContent = mins + ':00'; timerEl.style.display = 'block'; }
  // Countdown timer
  let secs = mins * 60;
  VoiceState.ftt_timer = setInterval(() => {
    secs--;
    const m = Math.floor(secs / 60);
    const s = String(secs % 60).padStart(2, '0');
    if (timerEl) timerEl.textContent = m + ':' + s;
    if (secs <= 0) {
      clearInterval(VoiceState.ftt_timer);
      VoiceState.ftt_active = false;
      if (timerEl) timerEl.style.display = 'none';
      voiceUpdateStatus('Round ' + VoiceState.ftt_round + ' complete — analysing…');
      fttAnalyse(topic);
    }
  }, 1000);
}

async function fttAnalyse(topic) {
  const transcript = VoiceState.ftt_transcript.trim();
  if (!transcript) {
    voiceUpdateStatus('No speech detected. Try again.');
    fttShowNextRoundBtn();
    return;
  }
  const ftt_actual_s = VoiceState.ftt_start_ts ? Math.round((Date.now() - VoiceState.ftt_start_ts) / 1000) : (VoiceState.ftt_minutes * 60);
  VoiceState.ftt_all.push({ round: VoiceState.ftt_round, transcript, actual_s: ftt_actual_s });
  const level = document.getElementById('voiceLevel')?.value || 'N5';
  const prompt = `The learner is practising a 4/3/2 fluency drill. They spoke freely on the topic "${topic}" for ${VoiceState.ftt_minutes} minutes. This is Round ${VoiceState.ftt_round} of 3.

Transcript:
${transcript}

Detect the language the learner spoke in and give brief feedback (3-4 sentences) in that same language:
- What they communicated well
- One specific grammar or vocabulary point to notice
- One thing to try in the next round
Do not score. Do not be prescriptive. Be observational.`;
  try {
    const data = await (App.claudeAPI || window.claudeAPI)({
      max_tokens: 300,
      system: 'You are observing a Japanese speaking fluency drill. Detect the language the learner used and respond in that same language. Give brief, practical feedback.',
      messages: [{ role: 'user', content: prompt }],
      track: 'speaking'
    });
    const feedback = (App.claudeText || window.claudeText)(data).trim();
    VoiceState.messages.push({ role: 'assistant', content: '**Round ' + VoiceState.ftt_round + ' feedback:**\n' + feedback });
    voiceRenderMessages();
    if (VoiceState.ftt_round < 3) {
      fttShowNextRoundBtn();
    } else {
      fttShowFinal();
    }
  } catch(e) {
    voiceUpdateStatus('Analysis failed. ' + e.message);
    fttShowNextRoundBtn();
  }
}

function fttShowNextRoundBtn() {
  const mins = [4, 3, 2][VoiceState.ftt_round] || 2;

  voiceUpdateStatus('Ready for Round ' + (VoiceState.ftt_round + 1) + ' — same topic, ' + mins + ' min');
}

function fttShowFinal() {
  voiceUpdateStatus('Drill complete — all 3 rounds done');
  const startBtn = document.getElementById('fttStartBtn');
  if (startBtn) startBtn.style.display = 'none';
  // Instrument completed 4/3/2 drill
  try {
    const topic = document.getElementById('rtTopicInput')?.value.trim() || 'free conversation';
    const rounds = VoiceState.ftt_all;
    const payload = {
      topic,
      input_type: 'spoken',
      delivery_1_s: (rounds[0] || {}).actual_s || null,
      delivery_2_s: (rounds[1] || {}).actual_s || null,
      delivery_3_s: (rounds[2] || {}).actual_s || null,
      target_s: [240, 180, 120]
    };
    if (window.db) {
      const _ts = new Date().toISOString();
      window.db.run(
        'INSERT INTO learning_events (created_at, panel, event_type, payload) VALUES (?,?,?,?)',
        [_ts, 'voice', 'fluency:432', JSON.stringify(payload)]
      ).catch(() => {});
      window.db.run(
        'INSERT INTO drill_results (created_at, drill_type, item_key, correct, response_ms) VALUES (?,?,?,?,?)',
        [_ts, '432', payload.topic, null, null]
      ).catch(() => {});
      const _dur_s = (payload.delivery_1_s || 0) + (payload.delivery_2_s || 0) + (payload.delivery_3_s || 0);
      const _started = new Date(Date.now() - _dur_s * 1000).toISOString();
      window.db.run(
        'INSERT INTO panel_sessions (panel, strand, duration_s, started_at, ended_at) VALUES (?,?,?,?,?)',
        ['fluency432', 4, _dur_s, _started, _ts]
      ).catch(() => {});
    }
  } catch(e) { console.warn('fttShowFinal instrumentation error:', e); }
}

function rtSetStatus(text) {
  const el = document.getElementById('rtStatus');
  if (!el) return;
  el.textContent = text;
  el.style.display = text ? 'inline' : 'none';
}

async function rtStartConversation() {
  const topicInput = document.getElementById('rtTopicInput');
  if (topicInput) VoiceState.rtTopic = topicInput.value.trim();
  const transcriptArea = document.getElementById('rtTranscriptArea');
  if (transcriptArea) VoiceState.rtTranscript = transcriptArea.value.trim();

  if (VoiceState.rtMode === 'round-trip') {
    // Round-trip: just update status, user speaks first
    rtSetStatus('Round 1 — speak naturally');
    voiceNewChat();
    return;
  }

  // Comprehension mode: AI opens in character
  const situation = VoiceState.rtTopic || 'a personal experience';
  const level     = document.getElementById('voiceLevel')?.value || 'N5';
  rtSetStatus('Starting…');

  // Disable start button while loading
  const startBtn = document.getElementById('rtStartBtn');
  if (startBtn) { startBtn.disabled = true; startBtn.textContent = '…'; }

  voiceNewChat();

  // Build opening prompt — ask Claude to introduce itself as the person
  const transcriptNote = VoiceState.rtTranscript
    ? '\nThe following is a transcript of what you said: ' + VoiceState.rtTranscript
    : '';
  const levelMap = {
    N5: 'very simple Japanese, short sentences, basic vocabulary',
    N4: 'simple Japanese, common vocabulary and basic grammar',
    N3: 'intermediate Japanese, mix of simple and complex sentences',
    N2: 'natural Japanese with varied grammar',
    N1: 'natural fluent Japanese'
  };
  const levelGuide = levelMap[level] || levelMap.N5;

  const openingPrompt = [
    'You are playing the role of a person who has just spoken about: ' + situation + transcriptNote,
    '',
    'Start the conversation with a natural opening sentence in first person — introduce yourself briefly and mention something about the topic.',
    'Keep it short (1-2 sentences). Use ' + levelGuide + '.',
    'The student will then ask you questions or discuss with you.',
    'Respond ONLY in Japanese. Do not explain the exercise or break character.',
  ].join('\n');

  try {
    const data = await (App.claudeAPI || window.claudeAPI)({
      max_tokens: 150,
      system: openingPrompt,
      messages: [{ role: 'user', content: 'はじめてください。' }]
    ,
      track: 'speaking'
    });
    const opening = (App.claudeText || window.claudeText)(data).trim();

    // Add the opening as an assistant message
    VoiceState.messages.push({ role: 'assistant', content: opening });
    voiceRenderMessages();
    TTS.speak(opening, 0.85);
    rtSetStatus('Discuss in Japanese');
  } catch (err) {
    rtSetStatus('Discuss in Japanese');
    console.error('rtStartConversation error:', err);
  } finally {
    if (startBtn) { startBtn.disabled = false; startBtn.textContent = '▶ Start'; }
  }
}

function rtCheckProgress() {
  if (!VoiceState.rtActive || VoiceState.rtRound !== 1) return;
  const userTurns = VoiceState.messages.filter(m => m.role === 'user').length;
  if (userTurns >= 3) {
    const btn = document.getElementById('rtRound2Btn');
    // Only show Round 2 for round-trip mode; comprehension just shows Compare
    if (VoiceState.rtMode === 'round-trip') {
      if (btn) btn.style.display = 'inline-block';
    } else {
      // Comprehension: show Compare button after enough exchanges
      const cmpBtn = document.getElementById('rtCompareBtn');
      if (cmpBtn) cmpBtn.style.display = 'inline-block';
    }
  }
}

async function rtStartRound2() {
  if (!VoiceState.rtActive || VoiceState.rtRound !== 1) return;
  VoiceState.rtMessages1 = [...VoiceState.messages];
  VoiceState.rtRound = 2;

  const r2Btn  = document.getElementById('rtRound2Btn');
  const cmpBtn = document.getElementById('rtCompareBtn');
  if (r2Btn)  r2Btn.style.display  = 'none';
  if (cmpBtn) cmpBtn.style.display = 'inline-block';
  rtSetStatus('Analysing Round 1…');

  // Show loading state
  const history = document.getElementById('voiceChatHistory');
  if (history) history.innerHTML = `
    <div style="text-align:center;color:var(--ink-light);font-family:var(--ui);font-size:inherit;padding:40px 20px">
      <div style="font-size:2rem;margin-bottom:12px">⏳</div>
      <div>Reviewing Round 1…</div>
    </div>`;

  // Get brief Round 1 observations from Claude
  let nudge = '';
  try {
    const fmt = msgs => msgs
      .filter(m => m.role !== 'correction')
      .map(m => (m.role === 'user' ? 'Student' : 'AI') + ': ' + m.content)
      .join('\n');
    const t1    = fmt(VoiceState.rtMessages1);
    const level = document.getElementById('voiceLevel')?.value || 'N5';
    const topic = VoiceState.rtTopic || 'Free conversation';
    const data  = await (App.claudeAPI || window.claudeAPI)({
      max_tokens: 300,
      messages: [{ role: 'user', content: [
        'You are reviewing Round 1 of a Japanese conversation practice to give a student a brief nudge before Round 2.',
        'Level: ' + level + '  Topic: ' + topic,
        '',
        'ROUND 1:',
        t1,
        '',
        'Write 2-3 short sentences (English). Note:',
        '- One specific grammar structure or pattern they used well',
        '- One thing they avoided or struggled with that they could try in Round 2',
        '- One concrete suggestion for Round 2',
        '',
        'Be brief and specific. No preamble. Start directly with the observation.',
        'Example: "You used ～てから well to sequence events. You defaulted to plain statements — try asking the AI a question this time. Aim to use ～たら at least once."'
      ].join('\n') }]
    ,
      track: 'speaking'
    });
    nudge = (App.claudeText || window.claudeText)(data).trim();
  } catch (e) {
    nudge = 'Round 1 complete. Start Round 2 fresh — same topic, same role.';
  }

  // Reset for Round 2
  VoiceState.messages = [];
  VoiceState.currentConvoName = '';
  rtSetStatus('Round 2 — same topic, try again');

  // Show Round 2 start screen with the nudge
  if (history) {
    const nudgeEl = document.createElement('div');
    nudgeEl.style.cssText = 'max-width:480px;margin:0 auto;padding:24px 20px';
    nudgeEl.innerHTML =
      '<div style="text-align:center;font-size:2rem;margin-bottom:16px">🔄</div>' +
      '<div style="font-family:var(--ui);font-size:inherit;font-weight:600;color:var(--ink);margin-bottom:10px">Round 2 — ' + (VoiceState.rtTopic || 'same topic') + '</div>' +
      '<div style="font-family:var(--ui);font-size:inherit;line-height:1.65;color:var(--teal);background:rgba(48,213,200,0.07);border:1px solid rgba(48,213,200,0.2);border-radius:8px;padding:12px 14px;margin-bottom:14px">' + nudge + '</div>' +
      '<div style="font-family:var(--ui);font-size:0.75rem;color:var(--ink-light)">Start speaking when ready.</div>';
    history.innerHTML = '';
    history.appendChild(nudgeEl);
  }
  voiceUpdateStatus('');
}

async function rtCompare() {
  VoiceState.rtMessages2 = [...VoiceState.messages];
  if (VoiceState.rtMessages1.length === 0) { voiceUpdateStatus('Complete Round 1 first'); return; }
  const cmpBtn = document.getElementById('rtCompareBtn');
  if (cmpBtn) { cmpBtn.disabled = true; cmpBtn.textContent = '⏳ Analysing…'; }
  const fmt = msgs => msgs
    .filter(m => m.role !== 'correction')
    .map(m => (m.role === 'user' ? 'Student' : 'AI') + ': ' + m.content)
    .join('\n');
  const topic  = VoiceState.rtTopic || 'Free conversation';
  const level  = document.getElementById('voiceLevel')?.value || 'N5';
  const t1     = fmt(VoiceState.rtMessages1);
  const t2     = fmt(VoiceState.rtMessages2);
  const prompt = [
    VoiceState.rtMode === 'comprehension'
      ? 'You are analysing a Japanese learner\u2019s comprehension discussion practice.'
      : 'You are analysing a Japanese learner\u2019s round-trip conversation practice.',
    '',
    'Level: ' + level,
    'Topic: ' + topic,
    '',
    'ROUND 1:',
    t1,
    '',
    'ROUND 2:',
    t2 || '(Round 2 not completed — analyse Round 1 and suggest focus for Round 2)',
    '',
    ...(VoiceState.rtMode === 'comprehension' ? [
      'Write a prose debrief (4-6 paragraphs):',
      '1. How naturally did the student engage with the topic — did they ask good questions?',
      '2. What vocabulary or structures did they use well?',
      '3. What did they struggle to express — where did they fall back on simple patterns?',
      '4. Specific examples from the transcript — quote actual sentences',
      '5. One concrete thing to work on before the next comprehension exercise',
    ] : [
      'Write a prose debrief (4-6 paragraphs):',
      '1. What improved between rounds',
      '2. What stayed the same or was still difficult', 
      '3. Specific examples from the transcripts',
      '4. Structures used in one round but not the other',
      '5. One concrete thing to practise before doing this topic again',
    ]),
    '',
    'Be encouraging but honest. Ignore speech-to-text transcription artifacts.',
    '',
    'IMPORTANT: When you quote a specific sentence the student said, wrap it like this: [Q:the exact sentence]',
    'Example: "You said [Q:ちょっと待ってください] which was natural." Use this format for every direct quote from the transcripts.',
    'Do not wrap your own example sentences or AI responses, only student quotes.',
    '',
    ...(() => {
      const patterns = writingErrorsGetTopPatterns(3);
      if (!patterns.length) return [];
      const summary = patterns.map(p => `- ${p.pattern} (${p.errorType}, seen ${p.count}x in writing)`).join('\n');
      return [
        'STUDENT PATTERN AWARENESS (from recent writing practice — mention only if relevant to what you observe in the speaking):',
        summary,
        'If the student avoided these errors in speech, note it positively. If they repeated them, connect the pattern briefly.'
      ];
    })()
  ].join('\\n');
  try {
    const data   = await (App.claudeAPI || window.claudeAPI)({ max_tokens: 1200, messages: [{ role: 'user', content: prompt }] ,
      track: 'speaking'
    });
    const debrief = (App.claudeText || window.claudeText)(data);
    let sessions = (App.Storage || window.Storage).getJSON(STORAGE_KEYS.ROUND_TRIPS, []);
    const _sstVoiceCount = (VoiceState.messages || []).filter(m => m.fromVoice).length;
    const _sstQualifies = _sstVoiceCount >= goalsLoad().sstMinUtterances;
    // Always save session history; only mark speaking complete if enough utterances
    sessions.unshift({ date: new Date().toISOString(), topic, level, round1: t1, round2: t2, debrief, utterances: _sstVoiceCount, qualified: _sstQualifies });
    (App.Storage || window.Storage).setJSON(STORAGE_KEYS.ROUND_TRIPS, sessions.slice(0, 50));
    if (_sstQualifies) {
      drillLastCompletedWrite('speaking', topic);
    }
    rtShowDebrief(topic, debrief, t1, t2);
  } catch (err) {
    voiceUpdateStatus('Compare failed: ' + err.message);
  } finally {
    if (cmpBtn) { cmpBtn.disabled = false; cmpBtn.textContent = '⚡ Compare'; }
  }
}

function rtShowDebrief(topic, debrief, t1, t2, prevQA) {
  document.getElementById('rtDebriefPanel')?.remove();

  // ── Parse [Q:text] markers into quoted sentence index ──────────
  const quotes = [];
  const parsedDebrief = debrief.replace(/\[Q:([^\]]+)\]/g, (_, text) => {
    quotes.push(text.trim());
    const idx = quotes.length - 1;
    return '__QUOTE__' + idx + '__';
  });

  // ── Find the exchange surrounding a quote in the transcripts ────
  function findContext(quoteText) {
    const allMsgs = [
      ...(t1 || '').split('\n'),
      ...(t2 ? ['--- Round 2 ---', ...(t2 || '').split('\n')] : [])
    ].filter(l => l.trim());
    const lower = quoteText.toLowerCase();
    const matchIdx = allMsgs.findIndex(l => l.toLowerCase().includes(lower));
    if (matchIdx < 0) return null;
    const start = Math.max(0, matchIdx - 1);
    const end   = Math.min(allMsgs.length, matchIdx + 3);
    return allMsgs.slice(start, end).join('\n');
  }

  // ── Show quote context popup ────────────────────────────────────
  function showQuotePopup(quoteText, anchorEl) {
    document.getElementById('rtQuotePopup')?.remove();
    const ctx = findContext(quoteText);
    const popup = document.createElement('div');
    popup.id = 'rtQuotePopup';
    popup.style.cssText = 'position:fixed;z-index:10001;background:var(--paper-dark);border:1px solid var(--teal);border-radius:8px;padding:12px 14px;max-width:340px;font-family:var(--ui);font-size:0.8rem;box-shadow:0 4px 20px rgba(0,0,0,0.4)';
    const rect = anchorEl.getBoundingClientRect();
    popup.style.top  = (rect.bottom + 8) + 'px';
    popup.style.left = Math.min(rect.left, window.innerWidth - 360) + 'px';
    popup.innerHTML =
      '<div style="font-size:0.68rem;letter-spacing:0.08em;color:var(--ink-light);margin-bottom:8px">FROM THE CONVERSATION</div>' +
      '<div style="color:var(--teal);font-family:var(--jp);margin-bottom:8px;font-size:inherit">' + quoteText + '</div>' +
      (ctx
        ? '<div style="color:var(--ink);line-height:1.6;white-space:pre-wrap;font-size:inherit;border-top:1px solid var(--border);padding-top:8px">' + ctx + '</div>'
        : '<div style="color:var(--ink-light);font-size:inherit">Could not locate exact exchange.</div>');
    const dismissBtn = document.createElement('button');
    dismissBtn.textContent = '✕';
    dismissBtn.style.cssText = 'position:absolute;top:6px;right:8px;background:none;border:none;color:var(--ink-light);cursor:pointer;font-size:inherit';
    dismissBtn.onclick = () => popup.remove();
    popup.appendChild(dismissBtn);
    document.body.appendChild(popup);
    // Click outside to dismiss
    setTimeout(() => {
      document.addEventListener('click', function handler(e) {
        if (!popup.contains(e.target) && e.target !== anchorEl) {
          popup.remove();
          document.removeEventListener('click', handler);
        }
      });
    }, 10);
  }

  // ── Build debrief body with linked quotes ───────────────────────
  function renderDebriefBody(container) {
    parsedDebrief.split('\n').filter(p => p.trim()).forEach(p => {
      const para = document.createElement('p');
      para.style.margin = '0 0 14px 0';
      // Render inline with quote links
      const parts = p.split(/(\_\_QUOTE\_\_\d+\_\_)/);
      parts.forEach(part => {
        const m = part.match(/^__QUOTE__(\d+)__$/);
        if (m) {
          const idx  = parseInt(m[1]);
          const text = quotes[idx];
          const link = document.createElement('span');
          link.textContent = '「' + text + '」';
          link.style.cssText = 'color:var(--teal);cursor:pointer;border-bottom:1px dotted var(--teal);font-family:var(--jp)';
          link.title = 'Click to see in context';
          link.onclick = (e) => { e.stopPropagation(); showQuotePopup(text, link); };
          para.appendChild(link);
        } else if (part) {
          para.appendChild(document.createTextNode(part));
        }
      });
      container.appendChild(para);
    });
  }

  // ── Build Q&A area ──────────────────────────────────────────────
  function buildQA(container, box) {
    const qaWrap = document.createElement('div');
    qaWrap.style.cssText = 'border-top:1px solid var(--border);padding:12px 20px;flex-shrink:0';

    const qaLabel = document.createElement('div');
    qaLabel.style.cssText = 'font-family:var(--ui);font-size:0.68rem;letter-spacing:0.08em;color:var(--ink-light);margin-bottom:8px';
    qaLabel.textContent = 'ASK A QUESTION ABOUT THIS DEBRIEF';
    qaWrap.appendChild(qaLabel);

    const qaAnswers = document.createElement('div');
    qaAnswers.style.cssText = 'font-family:var(--ui);font-size:inherit;line-height:1.65;color:var(--ink);margin-bottom:8px;';

    // Restore previous Q&A if reopening
    if (prevQA && prevQA.length) {
      prevQA.forEach(pair => {
        const qEl = document.createElement('div');
        qEl.style.cssText = 'margin-bottom:4px;color:var(--ink-light)';
        qEl.textContent = 'Q: ' + pair.q;
        qaAnswers.appendChild(qEl);
        const aEl = document.createElement('div');
        aEl.style.cssText = 'margin-bottom:10px;color:var(--ink);padding-left:10px;border-left:2px solid var(--teal)';
        aEl.textContent = pair.a;
        qaAnswers.appendChild(aEl);
      });
    }

    const qaRow = document.createElement('div');
    qaRow.style.cssText = 'display:flex;gap:8px';

    const qaInput = document.createElement('input');
    qaInput.type = 'text';
    qaInput.placeholder = 'e.g. How do I use ～たら naturally?';
    qaInput.style.cssText = 'flex:1;padding:7px 10px;background:var(--field);border:1px solid var(--field-border);border-radius:6px;color:var(--ink);font-family:var(--ui);font-size:inherit';

    const qaBtn = document.createElement('button');
    qaBtn.textContent = 'Ask';
    qaBtn.style.cssText = 'padding:7px 14px;background:none;border:1px solid var(--teal);border-radius:6px;color:var(--teal);font-family:var(--ui);font-size:0.8rem;cursor:pointer;white-space:nowrap';

    async function submitQuestion() {
      const q = qaInput.value.trim();
      if (!q) return;
      console.log('before clear - children:', qaAnswers.childNodes.length, 'parent:', qaAnswers.parentNode?.className); qaAnswers.replaceChildren(); console.log('after clear - children:', qaAnswers.childNodes.length);
      if (VoiceState.rtLastDebrief) VoiceState.rtLastDebrief.qa = [];
      qaBtn.disabled = true; qaBtn.textContent = '…';
      qaInput.value = '';

      const qEl = document.createElement('div');
      qEl.style.cssText = 'margin-bottom:4px;color:var(--ink-light)';
      qEl.textContent = 'Q: ' + q;
      qaAnswers.appendChild(qEl);
      qaInput.scrollIntoView({ block: 'nearest' });

      try {
        const level = document.getElementById('voiceLevel')?.value || 'N5';
        const data = await (App.claudeAPI || window.claudeAPI)({
          max_tokens: 400,
          messages: [{ role: 'user', content: [
            'Context: Japanese learner at ' + level + ' just completed a round-trip conversation practice on topic: ' + topic,
            '',
            'Debrief given:',
            debrief,
            '',
            'Student question: ' + q,
            '',
            'Answer concisely (2-4 sentences). If relevant, give a Japanese example with furigana.'
          ].join('\n') }]
        ,
          track: 'speaking'
        });
        const answer = (App.claudeText || window.claudeText)(data).trim();
        const aEl = document.createElement('div');
        aEl.style.cssText = 'margin-bottom:10px;color:var(--ink);padding-left:10px;border-left:2px solid var(--teal)';
        aEl.textContent = answer;
        qaAnswers.appendChild(aEl);
        // Persist Q&A for reopen
        if (VoiceState.rtLastDebrief) VoiceState.rtLastDebrief.qa.push({ q, a: answer });
        // Tag question to grammar node — fire and forget
        (App.questionRecordGrammarEvidence || window.questionRecordGrammarEvidence)?.(q, answer);
      } catch (err) {
        const errEl = document.createElement('div');
        errEl.style.cssText = 'color:var(--red);margin-bottom:8px;font-size:inherit';
        errEl.textContent = 'Error: ' + err.message;
        qaAnswers.appendChild(errEl);
      } finally {
        qaBtn.disabled = false; qaBtn.textContent = 'Ask';
        qaInput.scrollIntoView({ block: 'nearest' });
      }
    }

    qaBtn.onclick = submitQuestion;
    qaInput.onkeydown = e => { if (e.key === 'Enter') submitQuestion(); };
    qaRow.appendChild(qaInput);
    qaRow.appendChild(qaBtn);
    qaWrap.appendChild(qaAnswers);
    qaWrap.appendChild(qaRow);
    container.appendChild(qaWrap);
  }

  // ── Assemble panel ──────────────────────────────────────────────
  // Store for reopening
  VoiceState.rtLastDebrief = { topic, debrief, t1, t2, qa: prevQA || [] };
  // Show reopen button
  const reopenBtn = document.getElementById('rtReopenBtn');
  if (reopenBtn) reopenBtn.style.display = 'inline-block';

  const panel = document.createElement('div');
  panel.id = 'rtDebriefPanel';
  panel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px';

  const dateStr = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });

  const box = document.createElement('div');
  box.style.cssText = 'background:var(--paper);border:1px solid var(--border);border-radius:12px;width:100%;max-width:640px;max-height:90vh;display:flex;flex-direction:column';

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0';
  header.innerHTML = '<div><div style="font-family:var(--ui);font-size:0.7rem;letter-spacing:0.08em;color:var(--ink-light)">ROUND TRIP DEBRIEF</div>' +
    '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink);margin-top:2px">' + topic +
    ' <span style="color:var(--ink-light);font-size:0.75rem">· ' + dateStr + '</span></div></div>';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'background:none;border:none;color:var(--ink-light);cursor:pointer;font-size:1.1rem;padding:4px';
  closeBtn.onclick = () => { document.getElementById('rtQuotePopup')?.remove(); panel.remove(); };
  header.appendChild(closeBtn);

  // Body (debrief text)
  const body = document.createElement('div');
  body.style.cssText = 'padding:20px;overflow-y:auto;flex:1;font-family:var(--ui);font-size:inherit;line-height:1.75;color:var(--ink)';
  renderDebriefBody(body);

  if (quotes.length > 0) {
    const hint = document.createElement('div');
    hint.style.cssText = 'font-family:var(--ui);font-size:0.72rem;color:var(--ink-light);margin-top:4px;padding-top:12px;border-top:1px solid var(--border)';
    hint.textContent = '「」 Quoted sentences are clickable — tap to see them in context.';
    body.appendChild(hint);
  }

  // Footer buttons
  const footer = document.createElement('div');
  footer.style.cssText = 'padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;flex-shrink:0';
  const newBtn = document.createElement('button');
  newBtn.textContent = '↺ New session';
  newBtn.style.cssText = 'padding:7px 16px;background:var(--teal);color:var(--paper);border:none;border-radius:6px;font-family:var(--ui);font-size:0.8rem;cursor:pointer';
  newBtn.onclick = rtNewSession;
  const closeBtn2 = document.createElement('button');
  closeBtn2.textContent = 'Close';
  closeBtn2.style.cssText = 'padding:7px 16px;background:none;border:1px solid var(--border);border-radius:6px;font-family:var(--ui);font-size:0.8rem;cursor:pointer;color:var(--ink-light)';
  closeBtn2.onclick = () => { document.getElementById('rtQuotePopup')?.remove(); panel.remove(); };
  footer.appendChild(newBtn);
  footer.appendChild(closeBtn2);

  box.appendChild(header);
  box.appendChild(body);
  buildQA(box, body);
  box.appendChild(footer);
  panel.appendChild(box);
  document.body.appendChild(panel);
}

function rtNewSession() {
  document.getElementById('rtDebriefPanel')?.remove();
  VoiceState.rtRound = 1; VoiceState.rtMessages1 = []; VoiceState.rtMessages2 = []; VoiceState.messages = [];
  const r2 = document.getElementById('rtRound2Btn');
  const rc = document.getElementById('rtCompareBtn');
  if (r2) r2.style.display = 'none';
  if (rc) rc.style.display = 'none';
  rtSetStatus('Round 1 — speak naturally');
  voiceNewChat();
}

function rtShowHistory() {
  document.getElementById('rtHistoryPanel')?.remove();

  const sessions = (App.Storage || window.Storage).getJSON(STORAGE_KEYS.ROUND_TRIPS, []);

  const panel = document.createElement('div');
  panel.id = 'rtHistoryPanel';
  panel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px';

  const box = document.createElement('div');
  box.style.cssText = 'background:var(--paper);border:1px solid var(--border);border-radius:12px;width:100%;max-width:640px;max-height:88vh;display:flex;flex-direction:column';

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0';
  header.innerHTML = '<div style="font-family:var(--ui);font-size:0.7rem;letter-spacing:0.08em;color:var(--ink-light)">SESSION REPORTS</div>';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'background:none;border:none;color:var(--ink-light);cursor:pointer;font-size:1rem';
  closeBtn.onclick = () => panel.remove();
  header.appendChild(closeBtn);

  // Session list
  const list = document.createElement('div');
  list.style.cssText = 'overflow-y:auto;flex:1;padding:8px 0';

  if (!sessions.length) {
    list.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--ink-light);font-family:var(--ui);font-size:inherit">No session reports yet.<br><span style="font-size:0.75rem">Complete a round-trip conversation and click ⚡ Compare to generate one.</span></div>';
  } else {
    sessions.forEach((s, idx) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;padding:10px 20px;border-bottom:1px solid var(--border);cursor:pointer;gap:12px';
      row.classList.add('row-hover');

      const date = new Date(s.date).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'});
      const hasR2 = s.round2 && s.round2.trim().length > 10;

      row.innerHTML =
        '<div style="flex:1;min-width:0">' +
          '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (s.topic || 'Free conversation') + '</div>' +
          '<div style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light);margin-top:2px">' + date + ' · ' + (s.level||'N5') + (hasR2 ? ' · 2 rounds' : ' · 1 round') + '</div>' +
        '</div>' +
        '<div style="font-family:var(--ui);font-size:0.72rem;color:var(--teal);flex-shrink:0">Open →</div>';

      row.onclick = () => {
        panel.remove();
        rtShowDebrief(s.topic || 'Free conversation', s.debrief, s.round1, s.round2, s.qa || []);
      };
      list.appendChild(row);
    });
  }

  box.appendChild(header);
  box.appendChild(list);
  panel.appendChild(box);
  document.body.appendChild(panel);
}

function rtReopenDebrief() {
  if (!VoiceState.rtLastDebrief) return;
  rtShowDebrief(
    VoiceState.rtLastDebrief.topic,
    VoiceState.rtLastDebrief.debrief,
    VoiceState.rtLastDebrief.t1,
    VoiceState.rtLastDebrief.t2,
    VoiceState.rtLastDebrief.qa
  );
}


async function voiceReviewErrors() {
  // Get user messages from conversation
  const userMessages = VoiceState.messages.filter(m => m.role === 'user').map(m => m.content);
  
  if (userMessages.length === 0) {
    voiceUpdateStatus('No messages to review yet');
    return;
  }
  
  voiceUpdateStatus('Analyzing errors...');
  
  const prompt = `Review my Japanese from this conversation. Here are my messages:

${userMessages.map((m, i) => `${i + 1}. ${m}`).join('\n')}

Analyze my errors and give actionable feedback.

IMPORTANT:
- Some errors might be Whisper transcription mistakes (homophones, particle mishearing) — flag these as "possibly transcription"
- Focus on patterns, not every small mistake
- Be encouraging but honest

Respond with JSON in this exact format:
{
  "summary": "One sentence overview of how they did",
  "issues": [
    {"point": "Issue title", "explanation": "Brief explanation", "example": "Japanese example → correction"},
    {"point": "Issue title", "explanation": "Brief explanation", "example": "Japanese example → correction"}
  ],
  "actions": [
    "Specific practice action 1",
    "Specific practice action 2"
  ],
  "praise": "One thing they did well (optional, null if nothing stands out)"
}

Keep issues to 2-3 max. Keep actions to 2-3 max. Be concise.`;

  try {
    const key = (App.getApiKey || window.getApiKey)?.();
    if (!key) {
      voiceUpdateStatus('API key required');
      return;
    }
    
    const response = await (App.claudeAPI || window.claudeAPI)({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
    ,
      track: 'speaking'
    });
    
    const rawText = response.content[0].text;
    
    // Parse JSON response
    let review;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      review = JSON.parse(jsonMatch[0]);
    } catch {
      voiceUpdateStatus('Could not parse review');
      return;
    }
    
    // Build modal HTML
    const issuesHtml = (review.issues || []).map(issue => `
      <div style="margin-bottom:12px;padding:10px;background:rgba(255,100,100,0.1);border-left:3px solid var(--coral);border-radius:0 6px 6px 0">
        <div style="font-weight:600;color:var(--ink);margin-bottom:4px">${issue.point}</div>
        <div style="font-size:inherit;color:var(--ink-light);margin-bottom:6px">${issue.explanation}</div>
        <div style="font-family:var(--jp);font-size:inherit;color:var(--teal)">${issue.example || ''}</div>
      </div>
    `).join('');
    
    const actionsHtml = (review.actions || []).map((action, i) => `
      <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px">
        <span style="background:var(--teal);color:#1c1c1e;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:600;flex-shrink:0">${i + 1}</span>
        <span style="font-size:inherit;color:var(--ink)">${action}</span>
      </div>
    `).join('');
    
    const praiseHtml = review.praise ? `
      <div style="margin-top:16px;padding:10px;background:rgba(52,199,89,0.1);border-left:3px solid var(--green);border-radius:0 6px 6px 0">
        <div style="font-size:inherit;color:var(--green)">✓ ${review.praise}</div>
      </div>
    ` : '';
    
    const modalHtml = `
      <div id="voiceErrorModal" style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px" onclick="if(event.target===this)this.remove()">
        <div style="background:var(--paper);border:1px solid var(--border);border-radius:12px;max-width:500px;width:100%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.4)">
          <div style="padding:20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
            <h3 style="margin:0;font-family:var(--ui);font-size:1rem;color:var(--ink)">📝 Error Review</h3>
            <button class="btn-icon" onclick="this.closest('#voiceErrorModal').remove()">✕</button>
          </div>
          
          <div style="padding:20px">
            <div style="font-size:inherit;color:var(--ink);margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border)">${review.summary || ''}</div>
            
            ${issuesHtml ? `
              <div style="margin-bottom:20px">
                <div style="font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em">Key Issues</div>
                ${issuesHtml}
              </div>
            ` : ''}
            
            ${actionsHtml ? `
              <div style="margin-bottom:12px">
                <div style="font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em">Practice This Week</div>
                ${actionsHtml}
              </div>
            ` : ''}
            
            ${praiseHtml}
          </div>
        </div>
      </div>
    `;
    
    // Remove any existing modal
    document.getElementById('voiceErrorModal')?.remove();
    
    // Insert modal
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    voiceUpdateStatus('');
    
  } catch (err) {
    console.error('Error review failed:', err);
    voiceUpdateStatus('Review failed — try again');
  }
}

function voiceClearChat() {
  voiceNewChat();
}

function voiceRenderMessages() {
  const history = document.getElementById('voiceChatHistory');
  if (!history) return;
  
  if (VoiceState.messages.length === 0) {
    voiceNewChat();
    return;
  }
  
  // Find the last voice message index for showing "play recording" button
  let lastVoiceMsgIdx = -1;
  for (let i = VoiceState.messages.length - 1; i >= 0; i--) {
    if (VoiceState.messages[i].role === 'user' && VoiceState.messages[i].fromVoice) {
      lastVoiceMsgIdx = i;
      break;
    }
  }
  
  history.innerHTML = VoiceState.messages.map((msg, idx) => {
    if (msg.role === 'correction') {
      // Error correction note - same font size as conversation
      return `
        <div style="display:flex;justify-content:flex-end;margin-bottom:8px;margin-top:-8px">
          <div style="max-width:85%;padding:10px 14px;border-radius:8px;background:rgba(255,107,107,0.15);border:1px solid rgba(255,107,107,0.3)">
            <div style="font-family:var(--ui);font-size:inherit;color:#ffb3b3;line-height:1.6">${msg.content}</div>
          </div>
        </div>
      `;
    }
    
    const isUser = msg.role === 'user';
    const isAudioUpload = isUser && msg.content.startsWith('🔊');
    const textForTTS = msg.content.replace(/^🔊\s*/, ''); // Remove audio icon for TTS
    const isLastVoiceMsg = idx === lastVoiceMsgIdx && VoiceState.lastRecordingUrl;
    
    // Build buttons
    let buttons = '';
    if (isUser) {
      // TTS button for all user messages (hear what AI understood)
      buttons += `<button class="btn-icon" onclick="jpSpeak(\`${textForTTS.replace(/`/g, "'").replace(/\\/g, "\\\\")}\`)" title="Hear what was understood">🔊</button>`;
      // Play recording button for the last voice input
      if (isLastVoiceMsg) {
        buttons += `<button class="btn-icon" onclick="voicePlayLastRecording()" title="Play your recording">🎤</button>`;
      }
    } else {
      // Assistant message - sentence by sentence and repeat
      buttons += `<button class="btn-icon" onclick="voicePlaySentenceBySentence(\`${textForTTS.replace(/`/g, "'").replace(/\\/g, "\\\\")}\`)" title="Play sentence by sentence">📝</button>`;
      buttons += `<button class="btn-icon" onclick="jpSpeak(\`${textForTTS.replace(/`/g, "'").replace(/\\/g, "\\\\")}\`)" title="Repeat all">🔁</button>`;
    }
    
    return `
      <div style="display:flex;justify-content:${isUser ? 'flex-end' : 'flex-start'};margin-bottom:12px">
        <div style="max-width:85%;padding:12px 16px;border-radius:${isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};background:${isUser ? (isAudioUpload ? 'var(--gold)' : 'var(--teal)') : 'var(--paper-mid)'};color:${isUser ? '#1c1c1e' : 'var(--ink)'}">
          <div style="font-family:'Noto Sans JP',var(--ui);font-size:1rem;line-height:1.6">${msg.content}</div>
          <div style="margin-top:6px;display:flex;gap:4px;justify-content:${isUser ? 'flex-end' : 'flex-start'}">${buttons}</div>
        </div>
      </div>
    `;
  }).join('');
  
  // Scroll to bottom
  history.scrollTop = history.scrollHeight;
}

function voicePlayLastRecording() {
  if (!VoiceState.lastRecordingUrl) {
    voiceUpdateStatus('No recording available');
    return;
  }
  const audio = new Audio(VoiceState.lastRecordingUrl);
  audio.play();
}

// VoiceState.sentence* — see declaration above

function voicePlaySentenceBySentence(text) {
  // If already playing this text, treat as a tap to continue
  if (VoiceState.sentencePlaying && VoiceState.sentenceText === text) {
    voiceSentenceTap();
    return;
  }
  
  // Split by Japanese sentence endings and common punctuation
  const sentences = text.split(/(?<=[。！？\n])/g).map(s => s.trim()).filter(s => s.length > 0);
  
  if (sentences.length === 0) return;
  
  VoiceState.sentenceText = text;
  VoiceState.sentenceQueue = sentences;
  VoiceState.sentenceIdx = 0;
  VoiceState.sentencePlaying = true;
  VoiceState.sentenceWaiting = false;
  voicePlayCurrentSentence();
}

function voicePlayCurrentSentence() {
  if (!VoiceState.sentencePlaying || VoiceState.sentenceIdx >= VoiceState.sentenceQueue.length) {
    VoiceState.sentencePlaying = false;
    VoiceState.sentenceWaiting = false;
    VoiceState.sentenceText = '';
    voiceUpdateStatus('');
    return;
  }
  
  const sentence = VoiceState.sentenceQueue[VoiceState.sentenceIdx];
  const current = VoiceState.sentenceIdx + 1;
  const total = VoiceState.sentenceQueue.length;
  
  voiceUpdateStatus(`▶ ${current}/${total}: Playing...`);
  VoiceState.sentenceWaiting = false;
  
  if (!window.speechSynthesis) return;
  TTS.speak(sentence, 0.85, { onend: () => {
    if (VoiceState.sentencePlaying) {
      // Wait for tap to continue
      VoiceState.sentenceWaiting = true;
      if (VoiceState.sentenceIdx < VoiceState.sentenceQueue.length - 1) {
        voiceUpdateStatus(`⏸ ${current}/${total}: Tap status or 📝 for next`);
      } else {
        voiceUpdateStatus(`✓ Done (${total} sentences). Tap to restart`);
      }
    }
  },
  onerror: () => {
    VoiceState.sentencePlaying = false;
    VoiceState.sentenceWaiting = false;
    VoiceState.sentenceText = '';
    voiceUpdateStatus('');
  },
  });
}

function voiceSentenceTap() {
  if (!VoiceState.sentencePlaying) return;
  
  if (VoiceState.sentenceWaiting) {
    // Move to next sentence
    VoiceState.sentenceIdx++;
    if (VoiceState.sentenceIdx >= VoiceState.sentenceQueue.length) {
      // Restart from beginning
      VoiceState.sentenceIdx = 0;
    }
    voicePlayCurrentSentence();
  } else {
    // Currently playing - stop
    speechSynthesis.cancel();
    VoiceState.sentenceWaiting = true;
    const current = VoiceState.sentenceIdx + 1;
    const total = VoiceState.sentenceQueue.length;
    voiceUpdateStatus(`⏸ ${current}/${total}: Paused. Tap to continue`);
  }
}

function voiceStopSentences() {
  if (VoiceState.sentencePlaying && (VoiceState.sentenceWaiting || speechSynthesis.speaking)) {
    // If in sentence mode, use tap handler
    voiceSentenceTap();
  } else {
    // Full stop
    VoiceState.sentencePlaying = false;
    VoiceState.sentenceWaiting = false;
    VoiceState.sentenceQueue = [];
    VoiceState.sentenceIdx = 0;
    VoiceState.sentenceText = '';
    speechSynthesis.cancel();
    voiceUpdateStatus('');
  }
}


async function voiceToggleRecord() {
  const btn = document.getElementById('voiceRecordBtn');
  const { hasOpenAI } = voiceCheckKeys();
  
  if (!hasOpenAI) {
    voiceUpdateStatus('Please add your OpenAI API key in the ⚙ API bar above');
    (App.showPanel || window.showPanel)?.('settings');
    return;
  }
  
  if (VoiceState.recording) {
    // Stop recording
    VoiceState.recording = false;
    btn.innerHTML = '🎙️';
    btn.style.background = 'linear-gradient(135deg, var(--teal), #28b8ad)';
    
    if (VoiceState.mediaRecorder && VoiceState.mediaRecorder.state !== 'inactive') {
      VoiceState.mediaRecorder.stop();
    }
    voiceUpdateStatus('Processing...');
  } else {
    // Start recording
    if (VoiceState.ftt_round >= 0 && !VoiceState.ftt_active && document.getElementById('vt-four-three-two')?.classList.contains('active')) {
      fttStartRound();
    }
    try {
      VoiceState.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      VoiceState.mediaRecorder = new MediaRecorder(VoiceState.stream);
      VoiceState.audioChunks = [];
      
      VoiceState.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) VoiceState.audioChunks.push(e.data);
      };
      
      VoiceState.mediaRecorder.onstop = async () => {
        // Stop all tracks
        if (VoiceState.stream) {
          VoiceState.stream.getTracks().forEach(t => t.stop());
        }
        
        // Process the audio
        const audioBlob = new Blob(VoiceState.audioChunks, { type: 'audio/webm' });
        await voiceProcessAudio(audioBlob);
      };
      
      VoiceState.mediaRecorder.start();
      VoiceState.recording = true;
      btn.innerHTML = '⏹️';
      btn.style.background = 'linear-gradient(135deg, var(--red), #e55555)';
      voiceUpdateStatus('Listening... (click to stop)');
      
    } catch (err) {
      console.error('Microphone error:', err);
      voiceUpdateStatus('Could not access microphone');
    }
  }
}

async function voiceProcessAudio(audioBlob) {
  const openaiKey = getOpenAIKey();
  if (!openaiKey) {
    voiceUpdateStatus('No OpenAI key');
    return;
  }
  
  // Store the recording for playback comparison
  if (VoiceState.lastRecordingUrl) URL.revokeObjectURL(VoiceState.lastRecordingUrl);
  VoiceState.lastRecordingBlob = audioBlob;
  VoiceState.lastRecordingUrl = URL.createObjectURL(audioBlob);
  
  voiceUpdateStatus('Transcribing...');
  
  try {
    // Send to Whisper — verbose_json for segment timestamps
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', 'ja');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'segment');
    
    const whisperResp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`
      },
      body: formData
    });
    
    if (!whisperResp.ok) {
      const err = await whisperResp.text();
      console.error('Whisper error:', err);
      voiceUpdateStatus('Transcription failed');
      return;
    }
    
    const whisperData = await whisperResp.json();
    const userText = whisperData.text?.trim();
    
    if (!userText) {
      voiceUpdateStatus('No speech detected');
      return;
    }

    // Analyse intra-sentence pauses from segment timestamps
    if (whisperData.segments && whisperData.segments.length > 1) {
      const pauses = pauseAnalyse(whisperData.segments);
      if (pauses.length) pauseDataAdd(pauses);
    }
    
    // Add user message with flag that it was from voice
    VoiceState.messages.push({ role: 'user', content: userText, fromVoice: true });
    if (VoiceState.rtRound >= 2) kanjiCorpusRecordChatProduction(userText); // round-trip R2 production
    voiceRenderMessages();
    
    // 4/3/2 mode — accumulate only, no AI turn
    if (VoiceState.ftt_active) {
      VoiceState.ftt_transcript += (VoiceState.ftt_transcript ? '\n' : '') + userText;
      return;
    }
    // Send to Claude
    await voiceSendToClaude(userText);
    
  } catch (e) {
    console.error('Voice processing error:', e);
    voiceUpdateStatus('Error processing audio');
  }
}

async function voiceSendToClaude(userText) {
  // If in interview mode, route to interview handler
  if (VoiceState.interviewMode) {
    await voiceInterviewProcessAnswer(userText);
    return;
  }
  
  const apiKey = (App.getApiKey || window.getApiKey)?.();
  if (!apiKey) {
    voiceUpdateStatus('No Claude API key');
    return;
  }
  
  voiceUpdateStatus('Thinking...');
  
  const level = document.getElementById('voiceLevel')?.value || 'N5';
  const topic = document.getElementById('voiceTopic')?.value || 'free';
  
  const levelGuide = {
    N5: 'Use only N5 vocabulary and simple です/ます forms. Keep sentences very short (5-8 words). Add furigana in parentheses for ALL kanji.',
    N4: 'Use N5-N4 vocabulary. Keep sentences short. Include て-form, past tense, basic conditionals. Add furigana for N4+ kanji.',
    N3: 'Use natural conversational Japanese at N3 level. Mix polite and casual forms as appropriate. Include passive, causative, various conditionals. Add furigana for N3+ kanji (not basic ones like 私, 何, 今日, 食べる).'
  };
  
  // Build structured mode context for system prompt
  let rtTopicDesc = '';
  let rtRoundNote = '';
  if (VoiceState.rtActive) {
    if (VoiceState.rtMode === 'comprehension') {
      // Comprehension mode: AI is the person from the audio
      const situation = VoiceState.rtTopic || 'a personal experience';
      const transcriptNote = VoiceState.rtTranscript
        ? '\n\nTRANSCRIPT OF WHAT THEY SAID:\n' + VoiceState.rtTranscript + '\n\nUse this transcript as the basis for your character. Stay true to what was said.'
        : '';
      rtTopicDesc = [
        '',
        'COMPREHENSION MODE: You ARE the person from the audio.',
        'The student has just listened to you speaking Japanese about: ' + situation,
        transcriptNote,
        '',
        'Speak in first person. Answer questions about your experience naturally.',
        'Invent plausible details if no transcript is provided.',
        'Stay in character. Respond ONLY in Japanese at the student level.'
      ].join('\n');
    } else {
      // Round-trip mode
      rtTopicDesc = VoiceState.rtTopic ? '\n\nSPECIFIC TOPIC: ' + VoiceState.rtTopic + '. Keep the conversation focused on this topic.' : '';
      rtRoundNote = VoiceState.rtRound === 2 ? '\n\nThis is ROUND 2 of a round-trip practice. The student already had this conversation once. Be the same conversation partner — same role, same approach. Do not reference Round 1.' : '';
    }
  }

  const topicGuide = {
    free: 'Have a natural conversation about anything.',
    listen: 'LISTEN MODE: The user wants to practice speaking at length (telling a story, describing something, explaining). Your job is to LISTEN and ENCOURAGE. Give brief supportive responses like そうですか、なるほど、それで？、すごいですね、続けてください. Do NOT change the subject or ask unrelated questions. Let them lead. Only ask clarifying questions about what they are already talking about.',
    daily: 'Focus on daily life topics: weather, food, routines, family.',
    travel: 'Discuss travel: directions, transportation, sightseeing, hotels.',
    shopping: 'Practice shopping scenarios: prices, sizes, preferences.',
    restaurant: 'Practice ordering food, asking about menu, paying.',
    work: 'Discuss work topics: meetings, projects, colleagues.',
    hobbies: 'Talk about hobbies, interests, weekend activities.',
    'rp-yoshi': `ROLE PLAY: You are Yoshi先生 (よし先生), a friendly Japanese teacher having a lesson with the student. 
- Be warm, encouraging, patient
- Mix Japanese and occasional English explanations when needed
- Ask about their week, what they studied, any questions
- Gently correct mistakes and explain grammar points
- Use です/ます form but be natural and conversational
- React to what they say with interest
- Start by greeting them and asking how they are or what they want to practice today`,
    'rp-konbini': `ROLE PLAY: You are a convenience store (コンビニ) clerk in Japan.
- Be polite and efficient (いらっしゃいませ！)
- The customer might buy items, ask for services (ATM, toilet, printing)
- Use standard konbini phrases: 温めますか？、袋はいりますか？、〇〇円になります
- If they ask something unusual, try to help or explain you don't have it
- End with ありがとうございました！
- Start with the greeting when they "enter" the store`,
    'rp-restaurant': `ROLE PLAY: You are a waiter/waitress at a casual Japanese restaurant (居酒屋 or family restaurant).
- Greet them: いらっしゃいませ！何名様ですか？
- Offer menu, take orders, confirm: ご注文は〇〇でよろしいですか？
- Handle requests: water, recommendations, allergies, bill
- Use polite restaurant Japanese: 少々お待ちください、お待たせしました
- If they order something you don't have, suggest alternatives
- Start by greeting them as they arrive`,
    'rp-station': `ROLE PLAY: You are a helpful station staff member (駅員) at a JR station in Japan.
- Help with directions, tickets, platform numbers, train times
- Be polite and clear: 〇〇線は３番ホームです
- Handle problems: missed trains, lost items, IC card issues
- Explain ticket machines if asked
- Use clear, simple Japanese appropriate to the learner's level
- Start by asking how you can help: はい、どうされましたか？ or いらっしゃいませ`
  };
  
  // For role play, modify the system prompt intro
  const isRolePlay = topic.startsWith('rp-');
  
  const systemPrompt = isRolePlay 
    ? `${topicGuide[topic]}

Level: ${levelGuide[level] || levelGuide.N5}
${voiceGetProfilePrompt()}

IMPORTANT: Stay in character throughout. Respond naturally as this person would.

Respond with a JSON object:
1. "reply" - your in-character response in Japanese (1-3 sentences). Add hiragana readings in parentheses for kanji based on the level.
2. "correction" - if the user made grammar/vocabulary errors, provide a BRIEF note in English. If no errors, use null.

CRITICAL: The user's input comes from speech-to-text. Do NOT mark kanji/kana spelling choices or transcription artifacts as errors. Only correct errors in the user's MOST RECENT message — do not repeat previous corrections.

Example: {"reply":"いらっしゃいませ！何名(なんめい)様(さま)ですか？","correction":null}`
    : `You are a friendly Japanese conversation partner. 

Level: ${levelGuide[level] || levelGuide.N5}

Topic: ${topicGuide[topic] || topicGuide.free}${rtTopicDesc}${rtRoundNote}
${voiceGetProfilePrompt()}

IMPORTANT: You must respond with a JSON object containing two fields:
1. "reply" - your conversational response in Japanese (1-3 sentences, natural and friendly). Add hiragana readings in parentheses for kanji based on the level setting above.
2. "correction" - if the user made any grammar, vocabulary, or phrasing errors, provide a BRIEF note in English. When mentioning Japanese words in corrections, always include hiragana readings, e.g. "Use 行く(いく) not 来る(くる) for going away from here". If no errors, use null.

CRITICAL: The user's input comes from speech-to-text transcription. Do NOT mark these as errors:
- Kanji vs kana spelling choices (始めまして vs はじめまして - both are fine)
- Kanji variants or readings chosen by the transcription
- Minor punctuation differences
- These are transcription artifacts, NOT learner mistakes

Only flag actual spoken errors: wrong particles, incorrect verb conjugations, unnatural phrasing, vocabulary misuse, or grammar mistakes that would affect meaning or sound wrong to a native speaker.

CRITICAL for corrections: Only correct errors in the user's MOST RECENT message. Do not repeat or reference corrections from earlier in the conversation. Each correction field should be independent and address only what was just said.

When you know things about the user, naturally weave them into conversation - ask about their job, hobbies, family, experiences in Japan, etc. Make it feel like talking to a friend who remembers you.

Example response format:
{"reply":"そうですか！どんな映画(えいが)が好(す)きですか？","correction":"行(い)きました is past tense - use 行(い)きます for future plans"}

Or if no errors:
{"reply":"いい天気(てんき)ですね。今日(きょう)は何(なに)をしますか？","correction":null}`;

  // Build messages for API, filtering out correction messages
  const messages = VoiceState.messages
    .filter(m => m.role !== 'correction')
    .map(m => ({ role: m.role, content: m.content }));
  
  try {
    const data = await (App.claudeAPI || window.claudeAPI)({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: systemPrompt,
        messages: messages
    ,
      track: 'speaking'
    });
    
    const rawText = data.content?.[0]?.text?.trim() || '';
    
    let reply = 'すみません、ちょっと分かりませんでした。';
    let correction = null;
    
    // Try to parse JSON response
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        reply = parsed.reply || reply;
        correction = parsed.correction || null;
      } else {
        // Fallback: use raw text as reply
        reply = rawText;
      }
    } catch {
      // If JSON parse fails, use raw text
      reply = rawText;
    }
    
    // Add correction note if present (before assistant message so it appears after user)
    if (correction) {
      VoiceState.messages.push({ role: 'correction', content: correction });
      // Track the error for progress analysis
      spokenErrorsAdd(correction, userText);
    }
    
    // Add assistant message
    VoiceState.messages.push({ role: 'assistant', content: reply });
    rtCheckProgress();
    voiceRenderMessages();
    voiceUpdateStatus('');
    // Register speaking activity — any voice exchange counts
    try { drillLastCompletedWrite('speaking'); } catch(e) {}
    
    // Speak the response
    jpSpeak(reply);
    
  } catch (e) {
    console.error('Claude error:', e);
    voiceUpdateStatus('Error getting response');
  }
}

async function voiceSendText() {
  const input = document.getElementById('voiceTextInput');
  const text = input?.value?.trim();
  if (!text) return;
  
  const apiKey = (App.getApiKey || window.getApiKey)?.();
  if (!apiKey) {
    voiceUpdateStatus('Please set your Claude API key');
    return;
  }
  
  // Add user message
  VoiceState.messages.push({ role: 'user', content: text });
  if (VoiceState.rtRound >= 2) kanjiCorpusRecordChatProduction(text); // round-trip R2 production
  voiceRenderMessages();
  input.value = '';
  
  // Send to Claude
  await voiceSendToClaude(text);
}

// Initialize voice panel when shown
const _origShowPanelVoice = window.showPanel || function(){};
window.showPanel = function(id) {
  _origShowPanelVoice(id);
  if (id === 'voice') {
    voiceCheckKeys();
    voiceUpdateConvoDropdown();
  }
};

// Export functions

async function voiceUploadAudio(files) {
  if (!files || !files.length) return;
  
  const file = files[0];
  
  // Reset the file input so the same file can be selected again
  const fileInput = document.querySelector('#panel-voice input[type="file"]');
  if (fileInput) fileInput.value = '';
  
  const { hasOpenAI } = voiceCheckKeys();
  
  if (!hasOpenAI) {
    voiceUpdateStatus('Please add your OpenAI API key in the ⚙ API bar above');
    (App.showPanel || window.showPanel)?.('settings');
    return;
  }
  
  voiceUpdateStatus(`Transcribing ${file.name}...`);
  
  try {
    const openaiKey = getOpenAIKey();
    
    // Send to Whisper
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', 'whisper-1');
    formData.append('language', 'ja');
    
    const whisperResp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}` },
      body: formData
    });
    
    if (!whisperResp.ok) {
      const err = await whisperResp.text();
      console.error('Whisper error:', err);
      voiceUpdateStatus('Transcription failed');
      return;
    }
    
    const whisperData = await whisperResp.json();
    const transcribedText = whisperData.text?.trim();
    
    if (!transcribedText) {
      voiceUpdateStatus('No speech detected in audio');
      return;
    }
    
    // Add transcribed text as user message with audio icon (gold background)
    VoiceState.messages.push({ role: 'user', content: `🔊 ${transcribedText}` });
    if (VoiceState.rtRound >= 2) kanjiCorpusRecordChatProduction(transcribedText); // round-trip R2 production
    voiceRenderMessages();
    voiceUpdateStatus('Audio transcribed. Click Play to hear it, or type/speak to discuss.');
    
    // Auto-play the transcription so user can hear it
    jpSpeak(transcribedText);
    
  } catch (e) {
    console.error('Audio upload error:', e);
    voiceUpdateStatus('Error processing audio file');
  }
}



// ── Conjugation drill badge CSS injection ─────────────────────────────────────
(function injectConjBadgeCSS() {
  if (document.getElementById('conjBadgeStyles')) return;
  const style = document.createElement('style');
  style.id = 'conjBadgeStyles';
  style.textContent = `
    .conj-task {
      display: inline-block;
      padding: 4px 14px;
      border-radius: 20px;
      font-family: var(--ui);
      font-size: 0.82rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      margin: 8px 0;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .conj-task.polite { background: #4a9eff; color: #000; }
    .conj-task.plain  { background: rgba(255,255,255,0.08); color: var(--ink); border-color: var(--border); }
  `;
  document.head.appendChild(style);
})();

// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, {
    // Agent / briefing
    agentRefresh,
    agentRenderCards,
    agentClaudeBriefing,
    agentClaudeFollowUp,
    agentContextSave,
    agentToggleContext,
    agentContextSaveFromFields,
    agentUpdatePresence,
    agentGetLaunchPanel: typeof agentGetLaunchPanel !== 'undefined' ? agentGetLaunchPanel : undefined,
    openGramNote,
    // Spoken errors
    spokenErrorsClear,
    renderSpokenErrorsProgress,
    spokenErrorShowPopup,
    // Voice profile
    voiceOpenProfile,
    voiceSaveProfileFromModal,
    voiceStartProfileInterview,
    // Voice conversation
    voiceDoSave,
    voicePlayLastRecording,
    voicePlaySentenceBySentence,
    voiceSentenceTap,
    voiceStopSentences,
    voiceToggleRecord,
    voiceSendText,
    voiceReviewErrors,
    voiceClearChat,
    voiceNewChat,
    voiceCheckKeys,
    voiceSaveConversation,
    voiceLoadConversation,
    voiceDeleteConversation,
    // Keys
    saveOpenAIKey,
    getOpenAIKey,
    // VoiceState — needed by features-voice-drill.js
    VoiceState: typeof VoiceState !== 'undefined' ? VoiceState : undefined,
  });
} catch(e) { console.error('[features-voice] App registry failed:', e); }
