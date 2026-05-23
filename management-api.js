// ── Claude API, streaming, context building ──────────────────────────────────

function guessRelevantFiles(issue) {
  const text  = (issue.title + ' ' + (issue.description || '')).toLowerCase();
  const files = ['context.md', 'style.css'];
  if (text.includes('vocab') || text.includes('word') || text.includes('drill') || text.includes('srs')) files.push('src/core.js');
  if (text.includes('grammar') || text.includes('conj')) files.push('src/features-grammar.js');
  if (text.includes('voice') || text.includes('brief') || text.includes('agent')) files.push('src/features-voice.js');
  if (text.includes('video') || text.includes('transcript')) files.push('src/features-video.js');
  if (text.includes('reading') || text.includes('epub')) files.push('src/features-reading.js');
  if (text.includes('kana')) files.push('src/features-kana.js');
  if (text.includes('index') || text.includes('html') || text.includes('button') || text.includes('layout') || text.includes('style') || text.includes('colour') || text.includes('color') || text.includes('css') || text.includes('design') || text.includes('font') || text.includes('padding') || text.includes('margin')) files.push('index.html');
  if (text.includes('style') || text.includes('colour') || text.includes('color') || text.includes('css') || text.includes('design') || text.includes('font') || text.includes('padding') || text.includes('margin') || text.includes('layout')) files.push('style.css');
  if (text.includes('main') || text.includes('ipc') || text.includes('electron')) files.push('main.js');
  return [...new Set(files)];
}

function buildSystemContext() {
  const hasIndex = !!loadedFiles['index.json'];
  return `You are a coding assistant for Japanese Studio, an Electron-based Japanese learning app.

You have direct access to the project files and can propose file changes. When you want to modify a file, you MUST use this EXACT format — no exceptions:

\`\`\`diff:path/to/file.js
<<<<<<< ORIGINAL
[copy the exact original lines from the file]
=======
[the replacement lines]
>>>>>>> MODIFIED
\`\`\`

The path after "diff:" must be the actual file path (e.g. diff:style.css or diff:src/core.js).
Do NOT use \`\`\`javascript, \`\`\`html, or \`\`\`css — always use \`\`\`diff:filename.
Do NOT show the full file — only the specific section being changed.

Rules:
- NEVER apply or write any file automatically. ALWAYS show a diff block and wait for the user to click Apply.
- Before writing any code, explain what you plan to change and why. Get confirmation if the scope is large.
- Make minimal changes — don't restructure or reformat unrelated code.
- One diff block per file. Multiple files = multiple blocks.
- CRITICAL: You MUST request and read every file before writing any diff for it. Never write a diff block for a file you haven't seen in this conversation.
- To load a file, output this tag on its own line — the app loads it automatically and sends you the content:
  FILE_REQUEST: path/to/file.js
  You can request multiple files at once. WAIT for the file contents to appear before writing any diffs.
- After the user applies changes, ask them to reload and test, then report back.
- style.css contains all visual styles. index.html contains HTML structure. Both live in the project root.
- lesson-overlay.html is the always-on-top session overlay. Other feature files are in src/.${hasIndex ? '\n- index.json is loaded in loadedFiles. Reference it to find function locations.' : ''}`;
}

function buildFirstMessage(issue) {
  const t = TYPES[issue.type] || TYPES.bug;

  // Only send context.md and index hits — NOT file contents.
  // Claude requests files via FILE_REQUEST: so it always gets the full untruncated content.
  const ctx = loadedFiles['context.md']
    ? '\n\nProject context:\n' + loadedFiles['context.md'].slice(0, 3000)
    : '';

  const searchTerms = issue.title + ' ' + (issue.description || '');
  const indexHits = typeof searchIndex === 'function' ? searchIndex(searchTerms) : [];
  const indexContext = indexHits.length
    ? '\n\nRelevant functions from index:\n' + indexHits.map(e => '  ' + e.name + ' — ' + e.file + ':' + e.line + (e.desc ? ' — ' + e.desc : '')).join('\n')
    : '';

  // List which files are available (already loaded or on disk)
  const availableFiles = [...new Set([
    ...Object.keys(loadedFiles).filter(k => k !== 'context.md' && k !== 'index.json'),
    ...guessRelevantFiles(issue).filter(f => f !== 'context.md'),
  ])];
  const fileList = availableFiles.length
    ? '\n\nAvailable files (request with FILE_REQUEST: path):\n' + availableFiles.map(f => '  ' + f).join('\n')
    : '';

  return t.emoji + ' ' + t.label.toUpperCase() + ': ' + issue.title
    + (issue.description ? '\n\n' + issue.description : '')
    + ctx + indexContext + fileList
    + '\n\nPlease request the files you need with FILE_REQUEST: then analyse and propose a fix.';
}

async function triageSelected() {
  if (selected.size < 2) return;
  const batch = [...selected].map(id => issues.find(i => i.id === id)).filter(Boolean);
  setMode('triage');

  const thread = document.getElementById('thread');
  thread.innerHTML = '';
  conversation = [];

  document.getElementById('chat-title').textContent = `Triaging ${batch.length} issues`;

  const ctx = loadedFiles['context.md']
    ? `Project context:\n${loadedFiles['context.md'].slice(0, 2000)}\n\n`
    : '';

  const list = batch.map((issue, i) => {
    const t = TYPES[issue.type] || TYPES.bug;
    return `${i+1}. [${t.label}] ${issue.title}${issue.description ? '\n   ' + issue.description : ''}`;
  }).join('\n');

  const msg = `${ctx}I have ${batch.length} open issues. Please:
1. Group any that touch the same code area
2. Identify dependencies (fix A before B)
3. Recommend whether to tackle as one session or separate
4. Priority order within each group

Issues:
${list}`;

  addMessage('user', `Triaging ${batch.length} issues`, false);
  conversation.push({ role: 'user', content: msg });
  await streamReply();
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';

  addMessage('user', text);
  conversation.push({ role: 'user', content: text });
  await streamReply();
}

async function streamReply() {
  if (!apiKey) {
    addMessage('assistant', 'No API key found. Set it in the main app Settings.');
    return;
  }

  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled = true;

  // Create streaming message element
  const thread = document.getElementById('thread');
  const el = document.createElement('div');
  el.className = 'msg assistant';
  thread.appendChild(el);
  thread.scrollTop = thread.scrollHeight;

  const systemPrompt = buildSystemContext();
  const messages = conversation.map(m => ({ role: m.role, content: m.content }));

  let fullText = '';
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        stream: true,
        system: systemPrompt,
        messages,
      })
    });

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') break;
        try {
          const json = JSON.parse(data);
          if (json.type === 'content_block_delta' && json.delta?.text) {
            fullText += json.delta.text;
            el.innerHTML = renderTextWithFallbackBlocks(fullText);
            thread.scrollTop = thread.scrollHeight;
          }
        } catch(e) {}
      }
    }
  } catch(e) {
    el.innerHTML = `<span style="color:var(--red)">Error: ${esc(e.message)}</span>`;
  }

  if (fullText) {
    // Parse diff blocks into pendingDiffs
    const newDiffs = parseDiffs(fullText);
    Object.assign(pendingDiffs, newDiffs);
    el.innerHTML = renderTextWithFallbackBlocks(fullText);
    if (typeof logActivity === 'function') logActivity({ action: 'claude_response', diffs: Object.keys(newDiffs).length, chars: fullText.length });
    renderApplyAll();
    // Check for FILE_REQUEST tags and auto-load them
    const fileRequests = [...fullText.matchAll(/FILE_REQUEST:\s*([^\n]+)/g)].map(m => m[1].trim());
    if (fileRequests.length && (streamReply._depth || 0) < 3) {
      conversation.push({ role: 'assistant', content: fullText });
      addMessage('system', `Loading ${fileRequests.length} file(s): ${fileRequests.join(', ')}`);
      const loaded = [];
      for (const fp of fileRequests) {
        const ok = await loadFile(fp);
        if (ok) loaded.push(fp);
      }
      if (loaded.length) {
        const inject = loaded.map(function(fp) {
          const fc = loadedFiles[fp] || '';
          return 'Here is ' + fp + ' (' + fc.length + ' chars):\n\n```\n' + fc + '\n```';
        }).join('\n\n');
        conversation.push({ role: 'user', content: inject });
        sendBtn.disabled = false;
        streamReply._depth = (streamReply._depth || 0) + 1;
        await streamReply();
        streamReply._depth = Math.max(0, (streamReply._depth || 1) - 1);
        return;
      }
    } else {
      conversation.push({ role: 'assistant', content: fullText });
    }
  }
  sendBtn.disabled = false;
}