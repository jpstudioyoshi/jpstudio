// features-shuchu.js — 集中 Focus Sprint panel
// API calls per session: (1) fast — intro + activity 1, (2) background — activities 2-10 + round2_pool, (3) feedback on free write

(function() {

  // ── State ──────────────────────────────────────────────────────────────────
  let _sprint      = null;  // full generated sprint object
  let _actIdx      = 0;     // current activity index (round 1)
  let _wrong       = [];    // items answered incorrectly → round 2 pool
  let _r2Idx       = 0;     // round 2 index
  let _phase       = 'setup'; // setup | intro | activity | round2 | write | results
  let _sprintReady = null;  // Promise for background call 2 (activities 2-10 + round2_pool)
  let _refPrevId   = null;  // phase id to return to when 参考 is toggled off

  // ── Helpers ────────────────────────────────────────────────────────────────
  function show(id) {
    ['shuchu-setup','shuchu-sprint','shuchu-ref','shuchu-intro','shuchu-activity',
     'shuchu-round2','shuchu-write','shuchu-results'].forEach(s => {
      const el = document.getElementById(s);
      if (el) el.style.display = (s === id) ? '' : 'none';
    });
    if (id !== 'shuchu-setup') {
      document.getElementById('shuchu-sprint').style.display = '';
    }
    const beginBtn = document.getElementById('shuchuBeginBtn');
    if (beginBtn) beginBtn.style.display = (id === 'shuchu-intro') ? '' : 'none';
    const headerNextBtn = document.getElementById('shuchuHeaderNextBtn');
    if (headerNextBtn) headerNextBtn.style.display = 'none';
    const refBtn = document.getElementById('shuchuRefBtn');
    if (refBtn) refBtn.style.display = (id === 'shuchu-setup') ? 'none' : (_sprint ? '' : 'none');
    const analyseSel = document.getElementById('shuchuAnalyseSelect');
    const analyseStatus = document.getElementById('nomAnalyseStatus');
    if (analyseSel) analyseSel.style.display = (id === 'shuchu-setup') ? '' : 'none';
    if (analyseStatus) analyseStatus.style.display = (id === 'shuchu-setup') ? '' : 'none';
  }

  function apiKey() {
    return typeof getApiKey === 'function' ? getApiKey() : '';
  }

  function jpEl(tag, styles, text) {
    const el = document.createElement(tag);
    if (styles) Object.assign(el.style, styles);
    if (text !== undefined) el.textContent = text;
    return el;
  }

  // Converts inline "漢字(かな)" notation to real <ruby> markup for display.
  function furiToRuby(str) {
    if (!str) return '';
    const esc = (App.escHtml || window.escHtml) ? (App.escHtml || window.escHtml)(str) : str;
    return esc.replace(/([\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\u3005]+)\(([^)]+)\)/g,
      '<ruby>$1<rt style="font-size:0.7em;color:var(--ink-light)">$2</rt></ruby>');
  }

  // ── Start: call 1 (fast) — intro + activity 1 ──────────────────────────────
  window.shuchuStart = async function() {
    const topic = document.getElementById('shuchuTopicInput').value.trim();
    if (!topic) return;
    const status = document.getElementById('shuchuSetupStatus');
    const btn    = document.getElementById('shuchuStartBtn');
    status.textContent = 'Generating sprint…';
    btn.disabled = true;

    const key = apiKey();
    if (!key) { status.textContent = 'No API key found — add it in Settings.'; btn.disabled = false; return; }

    // Ensure the grammar node catalog is loaded so the model can link this sprint
    // to a specific curated reference node (used by 参考). Local JSON load, no API call.
    const GM = App.GrammarModel || window.GrammarModel;
    if (GM && !GM.loaded) { try { await GM.load(); } catch(e) {} }
    const nodeCatalog = (GM && GM.loaded) ? GM.getAllNodes().map(n => n.id + ' — ' + n.label).join('\n') : '';

    const prompt = `You are a Japanese language tutor creating a focused study sprint for an adult learner at JLPT N5/N4 level.

Topic: "${topic}"

Generate a JSON object with this exact structure (no markdown, no backticks, raw JSON only):
{
  "topic": "string — topic name in English",
  "topic_jp": "string — topic name in Japanese with furigana in brackets e.g. 見(み)る",
  "type": "semantic" or "grammar",
  "grammar_node_id": "string — the id (before the —) from the GRAMMAR NODES list below that best matches this topic, or null if none apply",
  "intro": {
    "summary": "string — 2-3 sentence explanation of the topic",
    "key_forms": [{"jp": "...", "reading": "...", "en": "...", "note": "..."}],
    "examples": [{"jp": "...", "reading": "...", "en": "..."}]
  },
  "activities": [
    {
      "id": 1,
      "type": "multiple_choice" | "gap_fill" | "translate_to_jp" | "error_correct",
      "prompt": "string — instruction in English",
      "question": "string — the question or sentence (use ___ for gaps)",
      "options": ["A", "B", "C", "D"] or null,
      "answer": "string — correct answer",
      "explanation": "string — brief explanation of why"
    }
  ]
}

GRAMMAR NODES (pick grammar_node_id from this list — use the id before the —, or null):
${nodeCatalog}

Requirements:
- 1 activity only (id: 1)
- Vocabulary at N5/N4 level, kanji with furigana in brackets
- multiple_choice must have exactly 4 options
- gap_fill uses ___ in the question
- All Japanese text must include reading in brackets e.g. 食(た)べる
- Keep it practical and contextual — real situations, not abstract drills`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await res.json();
      const text = data.content && data.content[0] && data.content[0].text;
      if (!text) throw new Error('Empty response');
      _sprint = JSON.parse(text.replace(/^```json\s*/,'').replace(/```\s*$/,'').trim());
      _actIdx = 0;
      _wrong  = [];
      _r2Idx  = 0;
      shuchuShowIntro();
      _sprintReady = shuchuFetchRemainder(topic, _sprint.intro, _sprint.activities[0]);
    } catch(e) {
      status.textContent = 'Error: ' + e.message;
      btn.disabled = false;
    }
  };

  // ── Background call 2 — activities 2-10 + round2_pool ──────────────────────
  async function shuchuFetchRemainder(topic, intro, act1) {
    const key = apiKey();
    if (!key) { _sprintReady = null; return; }

    const prompt = `You are a Japanese language tutor continuing a focused study sprint for an adult learner at JLPT N5/N4 level.

Topic: "${topic}"

The sprint already has this intro and first activity:
${JSON.stringify({ intro, activities: [act1] }, null, 2)}

Now generate the remaining content as a JSON object (no markdown, no backticks, raw JSON only):
{
  "activities": [
    {
      "id": 2,
      "type": "multiple_choice" | "gap_fill" | "translate_to_jp" | "error_correct",
      "prompt": "string — instruction in English",
      "question": "string — the question or sentence (use ___ for gaps)",
      "options": ["A", "B", "C", "D"] or null,
      "answer": "string — correct answer",
      "explanation": "string — brief explanation of why"
    }
  ],
  "round2_pool": [
    (same structure as activities, 8 items — varied versions of the same concepts)
  ]
}

Requirements:
- 9 activities (ids 2-10), mix of all 4 types, building naturally on activity 1
- Vocabulary at N5/N4 level, kanji with furigana in brackets
- multiple_choice must have exactly 4 options
- gap_fill uses ___ in the question
- All Japanese text must include reading in brackets e.g. 食(た)べる
- round2_pool: 8 items covering the same concepts but with different sentences
- Keep it practical and contextual — real situations, not abstract drills`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 5000,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await res.json();
      const text = data.content && data.content[0] && data.content[0].text;
      if (text) {
        const remainder = JSON.parse(text.replace(/^```json\s*/,'').replace(/```\s*$/,'').trim());
        if (remainder.activities) _sprint.activities = _sprint.activities.concat(remainder.activities);
        if (remainder.round2_pool) _sprint.round2_pool = remainder.round2_pool;
        Storage.setJSON('shuchu_last_sprint', _sprint);
      }
    } catch(e) {
      // silent fail — user proceeds with activity 1 only
    } finally {
      _sprintReady = null;
    }
  }

  function shuchuUpdateHeaderSubject() {
    const el = document.getElementById('shuchuHeaderSubject');
    if (!el) return;
    if (_sprint && _sprint.topic_jp) {
      el.innerHTML = furiToRuby(_sprint.topic_jp) + ' <span style="font-family:var(--ui);font-size:0.85rem;color:var(--ink-light)">(' + _sprint.topic + ')</span>';
    } else {
      el.innerHTML = '';
    }
  }

  // ── Intro card ──────────────────────────────────────────────────────────────
  function shuchuShowIntro() {
    const intro = _sprint.intro;
    const box = document.getElementById('shuchuIntroContent');
    box.innerHTML = '';

    shuchuUpdateHeaderSubject();

    const summaryCard = jpEl('div', {background:'#1a1a1a',border:'1px solid var(--border)',borderRadius:'10px',padding:'16px 18px',marginBottom:'24px'});
    const summary = jpEl('p', {fontFamily:'var(--ui)',fontSize:'1.05rem',lineHeight:'1.8',color:'var(--ink)',margin:'0'});
    summary.innerHTML = furiToRuby(intro.summary);
    summaryCard.appendChild(summary);
    box.appendChild(summaryCard);

    // Key forms table
    if (intro.key_forms && intro.key_forms.length) {
      const label = jpEl('div', {fontFamily:'var(--ui)',fontSize:'0.82rem',letterSpacing:'0.08em',color:'var(--ink-light)',marginBottom:'8px'}, 'KEY FORMS');
      box.appendChild(label);
      const card = jpEl('div', {background:'#1a1a1a',border:'1px solid var(--border)',borderRadius:'10px',padding:'16px 18px',marginBottom:'24px'});
      const grid = jpEl('div', {display:'grid',gridTemplateColumns:'auto auto 1fr',gap:'10px 16px',alignItems:'start',width:'100%'});
      intro.key_forms.forEach(f => {
        const jpCell = jpEl('span', {fontFamily:'var(--jp)',fontSize:'1.5rem',color:'var(--ink)'});
        jpCell.innerHTML = furiToRuby(f.jp);
        grid.appendChild(jpCell);
        grid.appendChild(jpEl('span', {fontFamily:'var(--ui)',fontSize:'1.05rem',color:'var(--ink)',display:'-webkit-box',WebkitLineClamp:'2',WebkitBoxOrient:'vertical',overflow:'hidden'}, f.en));
        const noteCell = jpEl('span', {fontFamily:'var(--ui)',fontSize:'0.95rem',color:'var(--ink-light)',lineHeight:'1.6'});
        noteCell.innerHTML = furiToRuby(f.note || '');
        grid.appendChild(noteCell);
      });
      card.appendChild(grid);
      box.appendChild(card);
    }

    // Examples
    if (intro.examples && intro.examples.length) {
      const label = jpEl('div', {fontFamily:'var(--ui)',fontSize:'0.82rem',letterSpacing:'0.08em',color:'var(--ink-light)',marginBottom:'8px'}, 'EXAMPLES');
      box.appendChild(label);
      const card = jpEl('div', {background:'#1a1a1a',border:'1px solid var(--border)',borderRadius:'10px',padding:'16px 18px',marginBottom:'24px'});
      intro.examples.forEach((ex, i) => {
        const row = jpEl('div', {display:'flex',alignItems:'baseline',gap:'12px',flexWrap:'wrap',paddingLeft:'12px',borderLeft:'2px solid var(--border)',marginBottom: i < intro.examples.length - 1 ? '10px' : '0'});
        const jpLine = jpEl('div', {fontFamily:'var(--jp)',fontSize:'1.25rem',color:'var(--ink)'});
        jpLine.innerHTML = furiToRuby(ex.jp);
        row.appendChild(jpLine);
        row.appendChild(jpEl('div', {fontFamily:'var(--ui)',fontSize:'1.05rem',color:'var(--ink-light)'}, ex.en));
        card.appendChild(row);
      });
      box.appendChild(card);
    }

    show('shuchu-intro');
  }

  // ── Begin activities ────────────────────────────────────────────────────────
  window.shuchuBeginActivities = function() {
    _actIdx = 0;
    shuchuUpdateHeaderSubject();
    shuchuRenderActivity();
  };

  function shuchuRenderActivity() {
    const acts = _sprint.activities;
    if (_actIdx >= acts.length) {
      if (_sprintReady) {
        // Call 2 still in flight — show loading and retry when it resolves
        document.getElementById('shuchuActivityHeader').textContent = '';
        const card = document.getElementById('shuchuActivityCard');
        card.innerHTML = '';
        document.getElementById('shuchuActivityFeedback').innerHTML = '';
        document.getElementById('shuchuActivityBtns').innerHTML = '';
        card.appendChild(jpEl('div', {fontFamily:'var(--ui)',fontSize:'1rem',color:'var(--ink-light)',padding:'24px 0'}, 'Loading next activities…'));
        show('shuchu-activity');
        _sprintReady.then(() => shuchuRenderActivity());
        return;
      }
      // Round 1 done — go to round 2 if there are wrong items
      if (_wrong.length > 0) {
        shuchuBeginRound2();
      } else {
        shuchuBeginWrite();
      }
      return;
    }
    const act = acts[_actIdx];
    const header = document.getElementById('shuchuActivityHeader');
    header.textContent = 'Activity ' + (_actIdx + 1) + ' of ' + acts.length + '  ·  ' + act.type.replace(/_/g,' ');

    const card = document.getElementById('shuchuActivityCard');
    const feedback = document.getElementById('shuchuActivityFeedback');
    const btns = document.getElementById('shuchuActivityBtns');
    card.innerHTML = '';
    feedback.innerHTML = '';
    btns.innerHTML = '';

    renderActivityItem(act, card, feedback, btns, false);
    show('shuchu-activity');
  }

  function renderActivityItem(act, card, feedback, btns, isR2) {
    // Question
    const q = jpEl('div', {fontFamily:'var(--jp)',fontSize:'1.2rem',color:'var(--ink)',marginBottom:'16px',lineHeight:'1.7'});
    q.innerHTML = '<span style="font-family:var(--ui);font-size:1rem;color:var(--ink-light);display:block;margin-bottom:6px">' + act.prompt + '</span>' + furiToRuby(act.question);
    card.appendChild(q);

    if (act.type === 'multiple_choice' && act.options) {
      act.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.style.cssText = 'display:block;width:100%;text-align:left;margin-bottom:8px;font-family:var(--jp);font-size:1.1rem;padding:12px 16px;background:#1a1a1a;border:1px solid var(--border);color:var(--ink);border-radius:8px;cursor:pointer';
        const cleanOpt = String(opt).replace(/^[A-D][\.\)\uff0e\uff09:\uff1a]\s*/, '');
        btn.innerHTML = ['A','B','C','D'][i] + '.  ' + furiToRuby(cleanOpt);
        btn.onclick = () => checkAnswer(act, opt, isR2);
        card.appendChild(btn);
      });
    } else {
      // Text input for gap_fill, translate_to_jp, error_correct
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.id = 'shuchuAnswerInput';
      const _wideEntry = (act.type === 'translate_to_jp' || act.type === 'error_correct');
      inp.style.cssText = 'width:100%;max-width:' + (_wideEntry ? '960px' : '480px') + ';padding:10px 14px;font-family:var(--jp);font-size:1.1rem;background:var(--field);border:1px solid var(--field-border);border-radius:8px;color:var(--ink);outline:none;box-sizing:border-box;margin-bottom:12px';
      inp.onkeydown = e => { if (e.key === 'Enter') checkAnswer(act, inp.value.trim(), isR2); };
      card.appendChild(inp);
      const sub = document.createElement('button');
      sub.className = 'btn-action';
      sub.textContent = 'Check';
      sub.onclick = () => checkAnswer(act, inp.value.trim(), isR2);
      card.appendChild(sub);
    }
  }

  function addFurtherQuestion(feedback, act) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top:16px;border-top:1px solid var(--border);padding-top:12px';
    const btn = document.createElement('button');
    btn.className = 'btn-action';
    btn.textContent = 'Further question';
    btn.style.cssText = 'font-size:0.85rem;padding:6px 14px';
    wrap.appendChild(btn);
    const inputWrap = document.createElement('div');
    inputWrap.style.cssText = 'display:none;margin-top:10px';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = 'Ask a question about this…';
    inp.style.cssText = 'width:100%;max-width:500px;padding:8px 12px;font-family:var(--jp);font-size:1rem;background:var(--field);border:1px solid var(--field-border);border-radius:8px;color:var(--ink);outline:none;box-sizing:border-box;margin-bottom:8px';
    const kanaId = 'shuchuFQInput_' + Date.now();
    inp.id = kanaId;
    const replyEl = document.createElement('div');
    replyEl.style.cssText = 'font-family:var(--ui);font-size:1rem;color:var(--ink);line-height:1.7;margin-top:8px;min-height:1em';
    inputWrap.appendChild(inp);
    inputWrap.appendChild(replyEl);
    wrap.appendChild(inputWrap);
    feedback.appendChild(wrap);

    btn.onclick = () => {
      inputWrap.style.display = inputWrap.style.display === 'none' ? '' : 'none';
      if (inputWrap.style.display !== 'none') {
        setTimeout(() => { inp.focus(); }, 50);
      }
    };

    async function submitFQ() {
      const q = inp.value.trim();
      if (!q) return;
      replyEl.textContent = 'Thinking…';
      inp.value = '';
      const key = typeof getApiKey === 'function' ? getApiKey() : '';
      if (!key) { replyEl.textContent = 'No API key.'; return; }
      const prompt = 'Japanese tutor. Topic: "' + (_sprint ? _sprint.topic : '') + '". Activity: ' + act.question + '. Answer: ' + act.answer + '. Student asks: ' + q + '. Answer in 2-3 sentences max. Direct and clear. Use Japanese examples inline if helpful.';
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
          body: JSON.stringify({model:'claude-sonnet-4-6',max_tokens:300,messages:[{role:'user',content:prompt}]})
        });
        const data = await res.json();
        replyEl.innerHTML = furiToRuby((data.content && data.content[0] && data.content[0].text) || '');
      } catch(e) { replyEl.textContent = 'Error: ' + e.message; }
    }

    inp.onkeydown = e => { if (e.key === 'Enter') submitFQ(); };
  }

  async function fetchAnalysis(act, given) {
    const key = typeof getApiKey === 'function' ? getApiKey() : '';
    if (!key) return null;
    const prompt = 'Reply with CORRECT or INCORRECT on the first line, then a blank line, then your 2-3 sentence explanation. Judge leniently — accept reasonable kana variations, minor punctuation differences, and semantically equivalent answers.\n\nYou are a Japanese tutor. Topic: "' + (_sprint ? _sprint.topic : '') + '".\nQuestion: ' + act.question + '\nCorrect answer: ' + act.answer + '\nLearner wrote: ' + given;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
        body: JSON.stringify({model:'claude-sonnet-4-6',max_tokens:300,messages:[{role:'user',content:prompt}]})
      });
      const data = await res.json();
      const raw = data.content && data.content[0] && data.content[0].text;
      if (!raw) return null;
      const lines = raw.split('\n');
      const correct = lines[0].trim().toUpperCase() === 'CORRECT';
      const text = lines.slice(2).join('\n').trim();
      return { correct, text };
    } catch(e) { return null; }
  }

  function addNextBtn(btns, isR2) {
    btns.innerHTML = '';
    const next = document.getElementById('shuchuHeaderNextBtn');
    if (next) {
      next.style.display = '';
      next.onclick = () => { if (isR2) { _r2Idx++; shuchuRenderR2(); } else { _actIdx++; shuchuRenderActivity(); } };
    }
  }

  function checkAnswer(act, given, isR2) {
    const feedback = document.getElementById(isR2 ? 'shuchuR2Feedback' : 'shuchuActivityFeedback');
    const btns     = document.getElementById(isR2 ? 'shuchuR2Btns'     : 'shuchuActivityBtns');
    feedback.innerHTML = '';
    btns.innerHTML = '';

    // translate_to_jp and error_correct: always show model answer + analysis, always add to round 2
    if (act.type === 'translate_to_jp' || act.type === 'error_correct') {
      if (!isR2) _wrong.push(act);
      const result = jpEl('div', {marginBottom:'10px'});
      result.innerHTML = '<div style="font-family:var(--jp);font-size:1.1rem;color:var(--ink);margin-bottom:6px">Model answer: ' + furiToRuby(act.answer) + '</div>'
        + '<div style="font-family:var(--ui);font-size:1rem;color:var(--ink-light);margin-top:4px;line-height:1.6">' + furiToRuby(act.explanation) + '</div>';
      feedback.appendChild(result);
      const analysisEl = jpEl('div', {fontFamily:'var(--ui)',fontSize:'1rem',color:'var(--ink)',marginTop:'12px',lineHeight:'1.7',borderLeft:'2px solid var(--teal)',paddingLeft:'10px'}, 'Analysing…');
      feedback.appendChild(analysisEl);
      addNextBtn(btns, isR2);
      fetchAnalysis(act, given).then(result => { analysisEl.innerHTML = furiToRuby((result && result.text) || ''); addFurtherQuestion(feedback, act); });
      return;
    }

    // multiple_choice and gap_fill: API-based lenient match
    const checkingEl = jpEl('div', {fontFamily:'var(--ui)',fontSize:'1rem',color:'var(--ink-light)'}, 'Checking…');
    feedback.appendChild(checkingEl);
    addNextBtn(btns, isR2);
    fetchAnalysis(act, given).then(result => {
      if (!result) { checkingEl.textContent = ''; return; }
      if (!result.correct && !isR2) _wrong.push(act);
      checkingEl.innerHTML = (result.correct
        ? '<span style="color:var(--teal);font-size:1.1rem">✓ Correct</span>'
        : '<span style="color:var(--red,#e05);font-size:1.1rem">✗  Answer: <span style="font-family:var(--jp)">' + furiToRuby(act.answer) + '</span></span>'
      ) + '<div style="font-family:var(--ui);font-size:1rem;color:var(--ink-light);margin-top:6px;line-height:1.6">' + furiToRuby(act.explanation) + '</div>';
      if (result.text) {
        const analysisEl = jpEl('div', {fontFamily:'var(--ui)',fontSize:'1rem',color:'var(--ink)',marginTop:'12px',lineHeight:'1.7',borderLeft:'2px solid var(--teal)',paddingLeft:'10px'});
        analysisEl.innerHTML = furiToRuby(result.text);
        feedback.appendChild(analysisEl);
      }
      addFurtherQuestion(feedback, act);
    });
  }

    // ── Round 2 ─────────────────────────────────────────────────────────────────
  function shuchuBeginRound2() {
    // Pick from round2_pool based on wrong items (match by index, cycle if needed)
    const pool = _sprint.round2_pool || [];
    // Use up to 6 items, drawn from pool in order
    const count = Math.min(6, pool.length, _wrong.length * 2 || pool.length);
    _sprint._r2items = pool.slice(0, count);
    _r2Idx = 0;
    shuchuRenderR2();
  }

  function shuchuRenderR2() {
    const items = _sprint._r2items;
    if (_r2Idx >= items.length) { shuchuBeginWrite(); return; }
    const act = items[_r2Idx];

    const card     = document.getElementById('shuchuR2Card');
    const feedback = document.getElementById('shuchuR2Feedback');
    const btns     = document.getElementById('shuchuR2Btns');
    card.innerHTML = '';
    feedback.innerHTML = '';
    btns.innerHTML = '';

    const header = jpEl('div', {fontFamily:'var(--ui)',fontSize:'0.72rem',color:'var(--gold)',marginBottom:'12px'},
      'Round 2  ·  ' + (_r2Idx + 1) + ' of ' + items.length);
    card.appendChild(header);

    renderActivityItem(act, card, feedback, btns, true);
    show('shuchu-round2');
  }

  // ── Free write ───────────────────────────────────────────────────────────────
  function shuchuBeginWrite() {
    document.getElementById('shuchuWriteInput').value = '';
    document.getElementById('shuchuWriteFeedback').innerHTML = '';
    show('shuchu-write');
    setTimeout(() => {
      const compose = document.getElementById('shuchuWriteCompose');
      const area = document.getElementById('shuchuWriteInput');
      compose.onkeydown = e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = compose.value.trim();
          if (val) {
            area.value = (area.value + (area.value ? '\n' : '') + val);
            compose.value = '';
          }
        }
      };
    }, 50);
  }

  window.shuchuSubmitWrite = async function() {
    const text = document.getElementById('shuchuWriteInput').value.trim();
    if (!text) return;
    const fb = document.getElementById('shuchuWriteFeedback');
    fb.textContent = 'Getting feedback…';

    const key = apiKey();
    if (!key) { fb.textContent = 'No API key.'; return; }

    const prompt = `You are a Japanese language tutor. The student just completed a focus sprint on the topic: "${_sprint.topic}".

They wrote the following in Japanese:
---
${text}
---

Give brief, encouraging feedback in this format:
1. What they did well (1-2 sentences)
2. Specific corrections if any (list each error with: ✗ what they wrote → ✓ correct form, brief reason)
3. One tip for using the topic vocabulary more naturally

Keep it concise. Use Japanese examples where helpful. Do not rewrite their whole text.`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 800,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await res.json();
      const reply = data.content && data.content[0] && data.content[0].text;
      fb.innerHTML = reply ? furiToRuby(reply).replace(/\n/g, '<br>') : 'No response.';
      // Show results summary after a moment
      setTimeout(shuchuShowResults, 400);
    } catch(e) {
      fb.textContent = 'Error: ' + e.message;
    }
  };

  // ── Results ──────────────────────────────────────────────────────────────────
  function shuchuShowResults() {
    const total   = (_sprint.activities || []).length;
    const correct = total - _wrong.length;
    const pct     = Math.round((correct / total) * 100);
    const box = document.getElementById('shuchuResultsSummary');
    box.innerHTML = '';
    box.appendChild(jpEl('div', {fontFamily:'var(--jp)',fontSize:'1.4rem',color:'var(--ink)',marginBottom:'8px'}, '完了 — Sprint complete'));
    box.appendChild(jpEl('div', {fontFamily:'var(--ui)',fontSize:'0.9rem',color:'var(--ink-light)',marginBottom:'4px'}, 'Topic: ' + _sprint.topic));
    box.appendChild(jpEl('div', {fontFamily:'var(--ui)',fontSize:'0.9rem',color:'var(--teal)',marginBottom:'16px'}, 'Round 1 score: ' + correct + '/' + total + ' (' + pct + '%)'));
    if (_wrong.length === 0) {
      box.appendChild(jpEl('div', {fontFamily:'var(--ui)',fontSize:'0.85rem',color:'var(--ink-light)'}, 'No weak points — excellent work!'));
    } else {
      const label = jpEl('div', {fontFamily:'var(--ui)',fontSize:'0.82rem',letterSpacing:'0.08em',color:'var(--ink-light)',marginBottom:'8px'}, 'REVIEW THESE');
      box.appendChild(label);
      _wrong.forEach(w => {
        const row = jpEl('div', {fontFamily:'var(--jp)',fontSize:'0.9rem',color:'var(--ink)',marginBottom:'4px'});
        row.innerHTML = furiToRuby(w.question) + ' <span style="color:var(--teal)">→ ' + furiToRuby(w.answer) + '</span>';
        box.appendChild(row);
      });
    }
    // scroll write feedback into view then show results below it
    show('shuchu-results');
  }

  // ── Reset ────────────────────────────────────────────────────────────────────
  window.shuchuToggleRef = function() {
    if (!_sprint) return;
    const refEl = document.getElementById('shuchu-ref');
    const refBtn = document.getElementById('shuchuRefBtn');
    const isShowingRef = refEl && refEl.style.display !== 'none';
    if (isShowingRef) {
      show(_refPrevId || 'shuchu-intro');
      if (refBtn) refBtn.classList.remove('toggle-on');
    } else {
      // Remember current phase so toggling off returns here
      _refPrevId = ['shuchu-intro','shuchu-activity','shuchu-round2','shuchu-write','shuchu-results']
        .find(s => { const el = document.getElementById(s); return el && el.style.display !== 'none'; }) || 'shuchu-intro';
      const refContent = document.getElementById('shuchuRefContent');
      const introContent = document.getElementById('shuchuIntroContent');
      let html = introContent ? introContent.innerHTML : '';
      // Exact grammar-node lookup by id (set at sprint-generation time) — no fuzzy matching.
      const GM = App.GrammarModel || window.GrammarModel;
      if (GM && GM.loaded && _sprint.grammar_node_id) {
        const node = GM.getNode(_sprint.grammar_node_id);
        if (node && node.notes) {
          html = '<div style="background:#1a1a1a;border:1px solid var(--border);border-radius:10px;padding:16px 18px;margin-bottom:24px">'
            + '<div style="font-family:var(--ui);font-size:0.82rem;letter-spacing:0.08em;color:var(--ink-light);margin-bottom:10px">GRAMMAR REFERENCE — ' + node.label + '</div>'
            + '<div style="font-family:var(--ui);font-size:1rem;color:var(--ink);line-height:1.8">' + furiToRuby(node.notes).replace(/\n/g,'<br>') + '</div>'
            + '</div>'
            + '<div style="border-top:1px solid var(--border);margin-bottom:16px"></div>'
            + html;
        }
      }
      if (refContent) refContent.innerHTML = html;
      show('shuchu-ref');
      if (refBtn) { refBtn.style.display = ''; refBtn.classList.add('toggle-on'); }
    }
  };

  window.shuchuConfirmReset = function() {
    if (_sprint && confirm('Start a new sprint? Your current sprint will be lost.')) {
      shuchuReset();
    } else if (!_sprint) {
      shuchuReset();
    }
  };

  window.shuchuReset = function() {
    Storage.set('shuchu_sprint', null);
    _sprint = null; _actIdx = 0; _wrong = []; _r2Idx = 0; _sprintReady = null;
    shuchuUpdateHeaderSubject();
    Storage.set('shuchu_last_sprint', null);
    document.getElementById('shuchuTopicInput').value = '';
    document.getElementById('shuchuSetupStatus').textContent = '';
    document.getElementById('shuchuStartBtn').disabled = false;
    show('shuchu-setup');
  };

  // ── Panel open hook (for future use) ────────────────────────────────────────
  window.shuchuOnOpen = function() {
    // Kick off GrammarModel load early (non-blocking) so it's ready by the time 参考 is clicked.
    const GM = App.GrammarModel || window.GrammarModel;
    if (GM && !GM.loaded) GM.load();
    if (!_sprint) {
      const saved = Storage.getJSON('shuchu_last_sprint', null);
      if (saved) {
        _sprint = saved;
        shuchuShowIntro();
        return;
      }
    }
    // Inject NoM suggestion container if not already present
    const setupEl = document.getElementById('shuchu-setup');
    if (setupEl && !document.getElementById('nomSuggestionsWrap')) {
      const wrap = document.createElement('div');
      wrap.id = 'nomSuggestionsWrap';
      wrap.style.display = 'none';
      setupEl.insertBefore(wrap, setupEl.firstChild);
    }
    if (typeof nomRenderSuggestions === 'function') nomRenderSuggestions();
    shuchuPopulateAnalyseSelect();
  };

  // ── Header "Analyse lesson" dropdown ────────────────────────────────────
  async function shuchuPopulateAnalyseSelect() {
    const sel = document.getElementById('shuchuAnalyseSelect');
    if (!sel || !window.db) return;
    try {
      const rows = await window.db.query(
        "SELECT id, date, created_at, audio_path FROM lesson_sessions WHERE source='recording' ORDER BY id DESC LIMIT 20"
      );
      const opts = (rows || []).map(r => {
        const tsMatch = r.audio_path ? r.audio_path.match(/_(\d{13})\.webm/) : null;
        const label = tsMatch
          ? new Date(parseInt(tsMatch[1])).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'})
          : (r.date || (r.created_at ? r.created_at.slice(0,10) : ('session ' + r.id)));
        return '<option value="' + r.id + '">' + label + '</option>';
      }).join('');
      sel.innerHTML = '<option value="">Analyse lesson…</option>' + opts;
    } catch(e) { console.warn('[shuchu] Failed to populate analyse select:', e.message); }
  }

  window.shuchuAnalyseSelected = function(id) {
    if (!id) return;
    nomRunAndCache(Number(id));
    document.getElementById('shuchuAnalyseSelect').value = '';
  };

})();
