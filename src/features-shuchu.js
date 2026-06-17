// features-shuchu.js — 集中 Focus Sprint panel
// Two API calls per session: (1) generate sprint JSON on start, (2) feedback on free write

(function() {

  // ── State ──────────────────────────────────────────────────────────────────
  let _sprint = null;       // full generated sprint object
  let _actIdx = 0;          // current activity index (round 1)
  let _wrong  = [];         // items answered incorrectly → round 2 pool
  let _r2Idx  = 0;          // round 2 index
  let _phase  = 'setup';    // setup | intro | activity | round2 | write | results

  // ── Helpers ────────────────────────────────────────────────────────────────
  function show(id) {
    ['shuchu-setup','shuchu-sprint','shuchu-intro','shuchu-activity',
     'shuchu-round2','shuchu-write','shuchu-results'].forEach(s => {
      const el = document.getElementById(s);
      if (el) el.style.display = (s === id) ? '' : 'none';
    });
    if (id !== 'shuchu-setup') {
      document.getElementById('shuchu-sprint').style.display = '';
    }
    const beginBtn = document.getElementById('shuchuBeginBtn');
    if (beginBtn) beginBtn.style.display = (id === 'shuchu-intro') ? '' : 'none';
    const refBtn = document.getElementById('shuchuRefBtn');
    if (refBtn) refBtn.style.display = (id === 'shuchu-setup') ? 'none' : (_sprint ? '' : 'none');
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

  // ── Start: generate sprint via Claude API ───────────────────────────────────
  window.shuchuStart = async function() {
    const topic = document.getElementById('shuchuTopicInput').value.trim();
    if (!topic) return;
    const status = document.getElementById('shuchuSetupStatus');
    const btn    = document.getElementById('shuchuStartBtn');
    status.textContent = 'Generating sprint…';
    btn.disabled = true;

    const key = apiKey();
    if (!key) { status.textContent = 'No API key found — add it in Settings.'; btn.disabled = false; return; }

    const prompt = `You are a Japanese language tutor creating a focused study sprint for an adult learner at JLPT N5/N4 level.

Topic: "${topic}"

Generate a JSON object with this exact structure (no markdown, no backticks, raw JSON only):
{
  "topic": "string — topic name in English",
  "topic_jp": "string — topic name in Japanese with furigana in brackets e.g. 見(み)る",
  "type": "semantic" or "grammar",
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
  ],
  "round2_pool": [
    (same structure as activities, 8 items — varied versions of the same concepts)
  ]
}

Requirements:
- 10 activities total, mix of all 4 types
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
          max_tokens: 6000,
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
      Storage.setJSON('shuchu_last_sprint', _sprint);
      shuchuShowIntro();
    } catch(e) {
      status.textContent = 'Error: ' + e.message;
      btn.disabled = false;
    }
  };

  // ── Intro card ──────────────────────────────────────────────────────────────
  function shuchuShowIntro() {
    const intro = _sprint.intro;
    const box = document.getElementById('shuchuIntroContent');
    box.innerHTML = '';

    const title = jpEl('div', {fontFamily:'var(--jp)',fontSize:'1.8rem',color:'var(--ink)',marginBottom:'8px'});
    title.innerHTML = _sprint.topic_jp + ' <span style="font-family:var(--ui);font-size:0.9rem;color:var(--ink-light)">(' + _sprint.topic + ')</span>';
    box.appendChild(title);

    const summary = jpEl('p', {fontFamily:'var(--ui)',fontSize:'1rem',lineHeight:'1.8',color:'var(--ink)',marginBottom:'20px'}, intro.summary);
    box.appendChild(summary);

    // Key forms table
    if (intro.key_forms && intro.key_forms.length) {
      const label = jpEl('div', {fontFamily:'var(--ui)',fontSize:'0.82rem',letterSpacing:'0.08em',color:'var(--ink-light)',marginBottom:'8px'}, 'KEY FORMS');
      box.appendChild(label);
      const grid = jpEl('div', {display:'grid',gridTemplateColumns:'auto auto 1fr auto',gap:'6px 16px',alignItems:'baseline',marginBottom:'20px'});
      intro.key_forms.forEach(f => {
        grid.appendChild(jpEl('span', {fontFamily:'var(--jp)',fontSize:'1.2rem',color:'var(--ink)'}, f.jp));
        grid.appendChild(jpEl('span', {fontFamily:'var(--jp)',fontSize:'0.95rem',color:'var(--teal)'}, f.reading));
        grid.appendChild(jpEl('span', {fontFamily:'var(--ui)',fontSize:'1rem',color:'var(--ink)'}, f.en));
        grid.appendChild(jpEl('span', {fontFamily:'var(--ui)',fontSize:'0.85rem',color:'var(--ink-light)'}, f.note || ''));
      });
      box.appendChild(grid);
    }

    // Examples
    if (intro.examples && intro.examples.length) {
      const label = jpEl('div', {fontFamily:'var(--ui)',fontSize:'0.82rem',letterSpacing:'0.08em',color:'var(--ink-light)',marginBottom:'8px'}, 'EXAMPLES');
      box.appendChild(label);
      intro.examples.forEach(ex => {
        const row = jpEl('div', {marginBottom:'10px',paddingLeft:'12px',borderLeft:'2px solid var(--border)'});
        row.appendChild(jpEl('div', {fontFamily:'var(--jp)',fontSize:'1.15rem',color:'var(--ink)'}, ex.jp));
        row.appendChild(jpEl('div', {fontFamily:'var(--jp)',fontSize:'0.95rem',color:'var(--teal)',margin:'2px 0'}, ex.reading));
        row.appendChild(jpEl('div', {fontFamily:'var(--ui)',fontSize:'1rem',color:'var(--ink-light)'}, ex.en));
        box.appendChild(row);
      });
    }

    show('shuchu-intro');
  }

  // ── Begin activities ────────────────────────────────────────────────────────
  window.shuchuBeginActivities = function() {
    _actIdx = 0;
    shuchuRenderActivity();
  };

  function shuchuRenderActivity() {
    const acts = _sprint.activities;
    if (_actIdx >= acts.length) {
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
    q.innerHTML = '<span style="font-family:var(--ui);font-size:1rem;color:var(--ink-light);display:block;margin-bottom:6px">' + act.prompt + '</span>' + act.question;
    card.appendChild(q);

    if (act.type === 'multiple_choice' && act.options) {
      act.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.style.cssText = 'display:block;width:100%;text-align:left;margin-bottom:8px;font-family:var(--jp);font-size:1.1rem;padding:12px 16px;background:#1a1a1a;border:1px solid var(--border);color:var(--ink);border-radius:8px;cursor:pointer';
        btn.textContent = ['A','B','C','D'][i] + '.  ' + opt;
        btn.onclick = () => checkAnswer(act, opt, isR2);
        card.appendChild(btn);
      });
    } else {
      // Text input for gap_fill, translate_to_jp, error_correct
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.id = 'shuchuAnswerInput';
      inp.style.cssText = 'width:100%;max-width:480px;padding:10px 14px;font-family:var(--jp);font-size:1.1rem;background:var(--field);border:1px solid var(--field-border);border-radius:8px;color:var(--ink);outline:none;box-sizing:border-box;margin-bottom:12px';
      inp.onkeydown = e => { if (e.key === 'Enter') checkAnswer(act, inp.value.trim(), isR2); };
      const kanaSpan = document.createElement('div');
      kanaSpan.setAttribute('data-kana-for', 'shuchuAnswerInput');
      kanaSpan.style.marginBottom = '10px';
      card.appendChild(inp);
      card.appendChild(kanaSpan);
      setTimeout(() => { if (typeof kanaToolbar === 'function') kanaToolbar('shuchuAnswerInput'); }, 50);
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
    const kanaSpan = document.createElement('div');
    const kanaId = 'shuchuFQInput_' + Date.now();
    inp.id = kanaId;
    kanaSpan.setAttribute('data-kana-for', kanaId);
    kanaSpan.style.marginBottom = '8px';
    const replyEl = document.createElement('div');
    replyEl.style.cssText = 'font-family:var(--ui);font-size:1rem;color:var(--ink);line-height:1.7;margin-top:8px;min-height:1em';
    inputWrap.appendChild(inp);
    inputWrap.appendChild(kanaSpan);
    inputWrap.appendChild(replyEl);
    wrap.appendChild(inputWrap);
    feedback.appendChild(wrap);

    btn.onclick = () => {
      inputWrap.style.display = inputWrap.style.display === 'none' ? '' : 'none';
      if (inputWrap.style.display !== 'none') {
        setTimeout(() => { if (typeof kanaToolbar === 'function') kanaToolbar(kanaId); inp.focus(); }, 50);
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
        replyEl.textContent = (data.content && data.content[0] && data.content[0].text) || '';
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
    const next = document.createElement('button');
    next.className = 'btn-action';
    next.textContent = 'Next →';
    next.onclick = () => { if (isR2) { _r2Idx++; shuchuRenderR2(); } else { _actIdx++; shuchuRenderActivity(); } };
    btns.appendChild(next);
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
      result.innerHTML = '<div style="font-family:var(--jp);font-size:1.1rem;color:var(--ink);margin-bottom:6px">Model answer: ' + act.answer + '</div>'
        + '<div style="font-family:var(--ui);font-size:1rem;color:var(--ink-light);margin-top:4px;line-height:1.6">' + act.explanation + '</div>';
      feedback.appendChild(result);
      const analysisEl = jpEl('div', {fontFamily:'var(--ui)',fontSize:'1rem',color:'var(--ink)',marginTop:'12px',lineHeight:'1.7',borderLeft:'2px solid var(--teal)',paddingLeft:'10px'}, 'Analysing…');
      feedback.appendChild(analysisEl);
      addNextBtn(btns, isR2);
      fetchAnalysis(act, given).then(result => { analysisEl.textContent = (result && result.text) || ''; addFurtherQuestion(feedback, act); });
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
        : '<span style="color:var(--red,#e05);font-size:1.1rem">✗  Answer: <span style="font-family:var(--jp)">' + act.answer + '</span></span>'
      ) + '<div style="font-family:var(--ui);font-size:1rem;color:var(--ink-light);margin-top:6px;line-height:1.6">' + act.explanation + '</div>';
      if (result.text) {
        const analysisEl = jpEl('div', {fontFamily:'var(--ui)',fontSize:'1rem',color:'var(--ink)',marginTop:'12px',lineHeight:'1.7',borderLeft:'2px solid var(--teal)',paddingLeft:'10px'}, result.text);
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
      if (typeof kanaToolbar === 'function') kanaToolbar('shuchuWriteCompose');
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
      fb.innerHTML = reply ? reply.replace(/\n/g, '<br>') : 'No response.';
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
        row.innerHTML = w.question + ' <span style="color:var(--teal)">→ ' + w.answer + '</span>';
        box.appendChild(row);
      });
    }
    // scroll write feedback into view then show results below it
    show('shuchu-results');
  }

  // ── Reset ────────────────────────────────────────────────────────────────────
  window.shuchuToggleRef = function() {
    const overlay = document.getElementById('shuchuRefOverlay');
    if (!overlay) return;
    if (overlay.style.display !== 'none') {
      overlay.style.display = 'none';
      return;
    }
    if (!_sprint) return;
    // Copy intro content into overlay
    const refContent = document.getElementById('shuchuRefContent');
    const introContent = document.getElementById('shuchuIntroContent');
    if (introContent) refContent.innerHTML = introContent.innerHTML;
    overlay.style.display = '';
    overlay.scrollTop = 0;
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
    _sprint = null; _actIdx = 0; _wrong = []; _r2Idx = 0;
    Storage.set('shuchu_last_sprint', null);
    document.getElementById('shuchuTopicInput').value = '';
    document.getElementById('shuchuSetupStatus').textContent = '';
    document.getElementById('shuchuStartBtn').disabled = false;
    show('shuchu-setup');
  };

  // ── Panel open hook (for future use) ────────────────────────────────────────
  window.shuchuOnOpen = function() {
    if (!_sprint) {
      const saved = Storage.getJSON('shuchu_last_sprint', null);
      if (saved) {
        _sprint = saved;
        shuchuShowIntro();
      }
    }
  };

})();
