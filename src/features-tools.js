// ╔══════════════════════════════════════════════════════════════════════════════
// ║ features-tools.js (residual)
// ║ Lesson notes utils, Yoshi panel, recording list, matching pairs,
// ║ Epub reader, Te-form drill, Grammar2 panel, Voice state, LN handlers.
// ╚══════════════════════════════════════════════════════════════════════════════

// ── Render/utility functions (pure DOM or string parsing — not pipeline logic) ─

// lessonNotesUpdateDropdown — was referenced but never defined; stub to prevent errors
function lessonNotesUpdateDropdown() {
  // No-op stub. Dropdown update is handled by lessonNotesRenderPanel.
}

function yoshiRenderRecordingTab(currentSession) {
  const sessions = window._lessonRecordingSessions || [];

  // Extract YYYY-MM-DD from lesson note session.
  // Titles are formatted as "[DD.MM.YY, HH:MM:SS]" — convert to match recording date format.
  function extractLessonDate(session) {
    if (!session) return '';
    if (session.date) return session.date.slice(0, 10);
    const title = session.title || '';
    const m = title.match(/\[?(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/);
    if (!m) return '';
    let [, dd, mm, yy] = m;
    if (yy.length === 2) yy = '20' + yy;
    return yy + '-' + mm.padStart(2, '0') + '-' + dd.padStart(2, '0');
  }

  const lessonDate = extractLessonDate(currentSession);
  const matched = sessions.filter(s => (s.date || '').slice(0,10) === lessonDate);

  let html = '<div style="margin-bottom:14px">';

  if (!matched.length) {
    html += '<div style="font-family:var(--ui);font-size:0.78rem;color:var(--ink-light);margin-bottom:12px">No recording for this lesson yet.</div>';
    if (typeof _lessonProcessing !== 'undefined' && _lessonProcessing) {
      html += '<div style="font-family:var(--ui);font-size:0.78rem;color:var(--gold)">⏳ Transcription in progress…</div>';
    }
  }

  for (const s of matched) {
    const dur = s.audio_duration_s ? Math.floor(s.audio_duration_s/60) + 'm ' + (s.audio_duration_s%60) + 's' : '?';
    const done = s.processed_at;
    html += '<div style="padding:10px;border:1px solid var(--border);border-radius:6px;margin-bottom:10px">';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">';
    html += '<span style="font-family:var(--ui);font-size:0.75rem;color:var(--ink)">' + (s.date || '') + ' · ' + dur + '</span>';
    html += (done ? '<span style="font-family:var(--ui);font-size:0.68rem;color:var(--teal)">✓ transcribed</span>' : '<span style="font-family:var(--ui);font-size:0.68rem;color:var(--gold)">processing…</span>');
    html += '<button class="btn-ghost" style="margin-left:auto;font-size:0.68rem;color:var(--red);border-color:var(--red)" onclick="yoshiDeleteLessonSession(' + s.id + ')">Delete</button>';
    html += '</div>';

    if (s.transcript_json) {
      const turns = (() => { try { return JSON.parse(s.transcript_json); } catch(e) { return []; } })();
      const audioSrc = s.audio_path ? 'file://' + s.audio_path : null;
      const teacherSrc = s.audio_path ? 'file://' + s.audio_path.replace('.webm', '_teacher.webm') : null;

      if (audioSrc) {
        html += '<div style="background:var(--paper);border:1px solid var(--border);border-radius:6px;padding:8px 12px;margin-bottom:10px">';
        html += '<div style="font-family:var(--ui);font-size:0.65rem;color:var(--ink-light);margin-bottom:6px">PLAYBACK</div>';
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">';
        html += '<span style="font-family:var(--ui);font-size:0.68rem;color:var(--teal)">🙋 You</span>';
        html += '<audio id="lessonAudioStudent" src="' + audioSrc + '" controls style="flex:1;height:28px;accent-color:var(--teal)"></audio>';
        html += '</div>';
        html += '<div style="display:flex;align-items:center;gap:8px">';
        html += '<span style="font-family:var(--ui);font-size:0.68rem;color:var(--teal)">🧑‍🏫 Teacher</span>';
        html += '<audio id="lessonAudioTeacher" src="' + teacherSrc + '" controls style="flex:1;height:28px;accent-color:var(--gold)"></audio>';
        html += '</div>';
        html += '</div>';
      }

      html += '<input id="lessonTranscriptSearch" placeholder="Search transcript…" oninput="yoshiFilterTranscript(this.value)" '
        + 'style="width:100%;padding:6px 10px;background:var(--field);border:1px solid var(--field-border);border-radius:5px;font-family:var(--ui);font-size:0.78rem;color:var(--ink);box-sizing:border-box;margin-bottom:8px">';

      html += '<div id="lessonTranscriptList" style="max-height:55vh;overflow-y:auto;font-size:0.85rem">';
      for (const t of turns) {
        const ts = Math.round(t.start);
        const m = Math.floor(ts/60), sec = ts%60;
        const tStr = m + ':' + String(sec).padStart(2,'0');
        const spk = (t.speaker === 'TEACHER' || t.speaker === 'teacher') ? '🧑‍🏫' : '🙋';
        const col = (t.speaker === 'TEACHER' || t.speaker === 'teacher') ? 'var(--teal)' : 'var(--ink)';
        const audioId = (t.speaker === 'TEACHER' || t.speaker === 'teacher') ? 'lessonAudioTeacher' : 'lessonAudioStudent';
        html += '<div class="lesson-transcript-row" data-text="' + t.text.replace(/"/g,'&quot;').toLowerCase() + '" '
          + 'onclick="yoshiSeekTo(' + t.start + ',&quot;' + audioId + '&quot;)"'
          + ' style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);cursor:pointer">'
          + '<span style="font-family:var(--ui);font-size:0.65rem;color:var(--teal);flex-shrink:0;width:32px;padding-top:2px">' + tStr + '</span>'
          + '<span style="flex-shrink:0">' + spk + '</span>'
          + '<span style="font-family:var(--jp);color:' + col + ';flex:1">' + t.text + '</span>'
          + '</div>';
      }
      html += '</div>';

      let waMsgs = [];
      try {
        const notesRaw = s.notes_text || '';
        if (notesRaw.startsWith('{')) {
          const parsed = JSON.parse(notesRaw);
          waMsgs = (parsed.messages || []).filter(m => m.synced && m.timestamp_s !== undefined);
        }
      } catch(e) {}
      if (waMsgs.length) {
        html += '<div style="margin-top:10px;padding:8px;background:rgba(255,214,10,0.05);border:1px solid rgba(255,214,10,0.3);border-radius:6px">';
        html += '<div style="font-family:var(--ui);font-size:0.65rem;letter-spacing:0.08em;color:var(--gold);margin-bottom:6px">WHATSAPP (' + waMsgs.length + ' messages synced)</div>';
        for (const m of waMsgs.slice(0, 10)) {
          const ts = Math.round(m.timestamp_s || 0);
          const min = Math.floor(ts/60), sec2 = ts%60;
          html += '<div style="display:flex;gap:8px;padding:3px 0;font-family:var(--ui);font-size:0.72rem;cursor:pointer" '
            + 'onclick="yoshiSeekTo(' + (m.timestamp_s||0) + ',&quot;lessonAudioTeacher&quot;)">'
            + '<span style="color:var(--gold);flex-shrink:0;width:32px">' + min + ':' + String(sec2).padStart(2,'0') + '</span>'
            + '<span style="color:var(--ink-light);flex-shrink:0;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (m.sender||'') + '</span>'
            + '<span style="color:var(--ink);flex:1">' + (m.text||'') + '</span>'
            + '</div>';
        }
        if (waMsgs.length > 10) html += '<div style="font-family:var(--ui);font-size:0.68rem;color:var(--ink-light);margin-top:4px">+' + (waMsgs.length-10) + ' more</div>';
        html += '</div>';
      }
    }
    html += '</div>';
  }

  const hasTranscript = matched.some(s => s.transcript_json);
  if (hasTranscript) {
    html += '<div style="margin-top:12px;padding:10px;border:1px solid var(--border);border-radius:6px">';
    html += '<div style="font-family:var(--ui);font-size:0.68rem;letter-spacing:0.08em;color:var(--ink-light);margin-bottom:6px">PASTE WHATSAPP THREAD</div>';
    html += '<textarea id="lessonWhatsappPaste" rows="4" placeholder="Paste WhatsApp conversation here…" '
      + 'style="width:100%;padding:8px;background:var(--field);border:1px solid var(--field-border);border-radius:5px;font-family:var(--ui);font-size:0.78rem;color:var(--ink);resize:vertical;box-sizing:border-box"></textarea>';
    const sid = matched[0].id;
    html += '<button class="btn-ghost" style="margin-top:6px" onclick="yoshiSaveWhatsapp(' + sid + ')">Save &amp; sync →</button>';
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function yoshiParseWhatsapp(raw) {
  const lines = raw.split('\n');
  const msgs = [];
  const re  = /^\[?(\d{1,2}:\d{2})(?::\d{2})?,?\s+\d{1,2}[./]\d{1,2}[./]\d{2,4}\]?\s+([^:]+):\s+(.+)$/;
  const re2 = /^\[?\d{1,2}[./]\d{1,2}[./]\d{2,4},\s+(\d{1,2}:\d{2})(?::\d{2})?\]?\s+([^:]+):\s+(.+)$/;
  for (const line of lines) {
    const m = line.match(re) || line.match(re2);
    if (m) msgs.push({ time: m[1], sender: m[2].trim(), text: m[3].trim() });
  }
  return msgs;
}


// ── ヨシ Panel — Unified lesson session system ────────────────────────────────

const IMPORTED_DOC_SESSIONS_PANEL_KEY = 'importedDocSessions';
let _lnCurrentIdx = null;
let _lnExtracting = false;

function lnGetSessions() {
  // Delegate to features-yoshi.js session storage (kvAPI-backed)
  const fn = App.lessonNotesGetSessions || window.lessonNotesGetSessions;
  return fn ? fn() : [];
}
function lnSaveSessions(arr) {
  const fn = App.lessonNotesSaveSessions || window.lessonNotesSaveSessions;
  if (fn) fn(arr);
}
function lnCurrentSession() {
  const sessions = lnGetSessions();
  if (_lnCurrentIdx !== null && sessions[_lnCurrentIdx]) return sessions[_lnCurrentIdx];
  const LNS = window.LessonNotesState || (App && App.LessonNotesState);
  if (LNS && LNS.currentIdx !== null && sessions[LNS.currentIdx]) return sessions[LNS.currentIdx];
  return null;
}


function lnRenderTab(tab, cur) {
  if (!cur) return '';
  if (tab === 'vocab')       return lnRenderVocab(cur);
  if (tab === 'stories')     return lnRenderStories(cur);
  if (tab === 'keyphrases')  return lnRenderKeyPhrases(cur);
  if (tab === 'grammar')     return lnRenderGrammar(cur);
  if (tab === 'corrections') return lnRenderCorrections(cur);
  if (tab === 'fulldoc')     return lnRenderFullDoc(cur);
  if (tab === 'recording')   return lnRenderRecording(cur);
  return '';
}

function lnSwitchTab(tab) {
  document.querySelectorAll('[id^="lnTab-"]').forEach(function(b) {
    b.style.borderColor = ''; b.style.color = '';
  });
  var btn = document.getElementById('lnTab-' + tab);
  if (btn) { btn.style.borderColor = 'var(--teal)'; btn.style.color = 'var(--teal)'; }
  var content = document.getElementById('lnTabContent');
  if (content) content.innerHTML = lnRenderTab(tab, lnCurrentSession());
}

function lnRenderVocab(cur) {
  var vocab = cur.vocab || [];
  if (!vocab.length) return '<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink-light);padding:20px 0">No vocabulary extracted yet.</div>';
  if (!window._lnDrillIdx) window._lnDrillIdx = 0;
  if (!window._lnDrillMode) window._lnDrillMode = 'jp2reading';
  if (!window._lnDrillRevealed) window._lnDrillRevealed = false;
  if (window._lnDrillIdx >= vocab.length) window._lnDrillIdx = 0;
  var v = vocab[window._lnDrillIdx];
  var progress = (window._lnDrillIdx + 1) + ' / ' + vocab.length;
  var h = [];
  // Drill mode buttons
  h.push('<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">');
  [{m:'jp2reading',l:'JP \u2192 Reading'},{m:'jp2en',l:'JP \u2192 Meaning'},{m:'en2jp',l:'EN \u2192 JP'}].forEach(function(o) {
    var active = window._lnDrillMode === o.m ? ';border-color:var(--teal);color:var(--teal)' : '';
    h.push('<button class="btn-ghost" style="font-size:0.75rem;padding:3px 10px' + active + '" onclick="lnSetDrillMode(\'' + o.m + '\')">' + o.l + '</button>');
  });
  h.push('<span style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light);margin-left:auto;padding-top:4px">' + progress + '</span>');
  h.push('</div>');
  h.push('<div style="background:var(--paper-dark);border:1px solid var(--border);border-radius:8px;padding:20px;text-align:center;margin-bottom:10px;min-height:120px">');
  if (window._lnDrillMode === 'en2jp') {
    h.push('<div style="font-family:var(--ui);font-size:1.1rem;color:var(--ink);margin-bottom:8px">' + (v.en||v.meaning||'') + '</div>');
    if (window._lnDrillRevealed) {
      h.push('<div style="font-family:var(--jp);font-size:1.5rem;color:var(--teal);margin-bottom:4px">' + (v.jp||v.word||'') + '</div>');
      h.push('<div style="font-family:var(--ui);font-size:0.88rem;color:var(--ink-light)">' + (v.reading||v.kana||'') + '</div>');
    }
  } else {
    h.push('<div style="font-family:var(--jp);font-size:1.8rem;color:var(--ink);margin-bottom:8px">' + (v.jp||v.word||'') + '</div>');
    if (window._lnDrillRevealed) {
      if (window._lnDrillMode === 'jp2reading') h.push('<div style="font-family:var(--ui);font-size:1.1rem;color:var(--teal)">' + (v.reading||v.kana||'') + '</div>');
      else h.push('<div style="font-family:var(--ui);font-size:1rem;color:var(--teal)">' + (v.en||v.meaning||'') + '</div>');
    }
  }
  h.push('</div>');
  h.push('<div style="display:flex;gap:8px;justify-content:center;margin-bottom:16px">');
  h.push('<button class="btn-ghost" style="font-size:0.75rem" onclick="lnDrillPrev()">&#8592; Prev</button>');
  if (!window._lnDrillRevealed) {
    h.push('<button class="btn-primary" style="font-size:0.82rem" onclick="lnDrillReveal()">Reveal</button>');
  } else {
    var word = (v.jp||v.word||'').replace(/'/g,'&#39;');
    h.push('<button class="btn-ghost" style="font-size:0.75rem" onclick="jpSpeak(\'' + word + '\')">&#128266;</button>');
    h.push('<button class="btn-primary" style="font-size:0.82rem" onclick="lnDrillNext()">Next &#8594;</button>');
  }
  h.push('</div>');
  h.push('<div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px"><table style="width:100%;border-collapse:collapse;font-family:var(--ui);font-size:0.78rem">');
  vocab.forEach(function(w, i) {
    var bg = i === window._lnDrillIdx ? 'background:rgba(48,213,200,0.1);' : '';
    h.push('<tr style="border-bottom:1px solid var(--border);' + bg + 'cursor:pointer" onclick="lnDrillJump(' + i + ')">');
    h.push('<td style="padding:5px 8px;font-family:var(--jp)">' + (w.jp||w.word||'') + '</td>');
    h.push('<td style="padding:5px 8px;color:var(--ink-light)">' + (w.reading||w.kana||'') + '</td>');
    h.push('<td style="padding:5px 8px;color:var(--ink)">' + (w.en||w.meaning||'') + '</td>');
    h.push('</tr>');
  });
  h.push('</table></div>');
  return h.join('');
}

function lnSetDrillMode(mode) { window._lnDrillMode = mode; window._lnDrillRevealed = false; lnRefreshTab('vocab'); }
function lnDrillReveal() { window._lnDrillRevealed = true; lnRefreshTab('vocab'); }
function lnDrillNext() { window._lnDrillIdx = (window._lnDrillIdx||0) + 1; window._lnDrillRevealed = false; lnRefreshTab('vocab'); }
function lnDrillPrev() { window._lnDrillIdx = Math.max(0, (window._lnDrillIdx||0) - 1); window._lnDrillRevealed = false; lnRefreshTab('vocab'); }
function lnDrillJump(i) { window._lnDrillIdx = i; window._lnDrillRevealed = false; lnRefreshTab('vocab'); }
function lnRefreshTab(tab) {
  var btn = document.getElementById('lnTab-' + tab);
  if (btn && btn.style.color === 'var(--teal)') {
    var content = document.getElementById('lnTabContent');
    if (content) content.innerHTML = lnRenderTab(tab, lnCurrentSession());
  }
}

function lnRenderStories(cur) {
  var stories = cur.stories || [];
  if (!stories.length) return '<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink-light);padding:20px 0">No stories or passages extracted.</div>';
  var h = ['<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">'];
  stories.forEach(function(s, i) {
    h.push('<div onclick="lnOpenStory(' + i + ')" style="background:var(--paper-dark);border:1px solid var(--border);border-radius:8px;padding:14px;cursor:pointer">');
    h.push('<div style="font-family:var(--jp);font-size:0.95rem;color:var(--ink);margin-bottom:6px">' + (s.title||'Text '+(i+1)) + '</div>');
    h.push('<div style="font-family:var(--jp);font-size:0.78rem;color:var(--ink-light);line-height:1.4">' + (s.text||'').slice(0,60) + '&#8230;</div>');
    h.push('</div>');
  });
  h.push('</div>');
  return h.join('');
}

function lnOpenStory(i) {
  var cur = lnCurrentSession();
  var s = cur && cur.stories && cur.stories[i];
  if (!s) return;
  var content = document.getElementById('lnTabContent');
  if (!content) return;
  content.innerHTML = '<div>'
    + '<button class="btn-ghost" style="font-size:0.75rem;margin-bottom:12px" onclick="lnSwitchTab(\'stories\')">&#8592; Back</button>'
    + '<div style="font-family:var(--jp);font-size:1.1rem;color:var(--teal);margin-bottom:10px">' + (s.title||'') + '</div>'
    + '<div style="font-family:var(--jp);font-size:0.95rem;color:var(--ink);line-height:1.8;white-space:pre-wrap">' + (s.text||'') + '</div>'
    + '</div>';
}

function lnRenderKeyPhrases(cur) {
  var kp = cur.keyPhrases || [];
  if (!kp.length) return '<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink-light);padding:20px 0">No key phrases extracted.</div>';
  var mode = window._lnPhraseMode || 'browse';
  var btnStyle = function(m) {
    return 'padding:4px 12px;border:1px solid var(--border);border-radius:6px;font-family:var(--ui);font-size:0.78rem;cursor:pointer;background:' + (mode===m ? 'var(--teal)' : 'var(--paper-dark)') + ';color:' + (mode===m ? '#fff' : 'var(--ink)');
  };
  var h = [];
  h.push('<div style="display:flex;gap:6px;margin-bottom:14px">');
  h.push('<button style="' + btnStyle('browse') + '" onclick="window._lnPhraseMode=\'browse\';lnRefreshTab(\'keyphrases\')">Browse</button>');
  h.push('<button style="' + btnStyle('en-jp') + '" onclick="window._lnPhraseMode=\'en-jp\';lnStartPhraseDrill()">EN&rarr;JP</button>');
  h.push('<button style="' + btnStyle('jp-en') + '" onclick="window._lnPhraseMode=\'jp-en\';lnStartPhraseDrill()">JP&rarr;EN</button>');
  h.push('</div>');
  if (mode === 'browse') {
    h.push('<div style="display:flex;flex-direction:column;gap:10px">');
    kp.forEach(function(p) {
      var phrase = (p.phrase||'').replace(/'/g,'&#39;');
      h.push('<div style="background:rgba(212,165,116,0.06);border:1px solid rgba(212,165,116,0.25);border-radius:8px;padding:14px">');
      h.push('<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">');
      h.push('<span style="font-family:var(--jp);font-size:1.1rem;color:var(--ink)">' + (p.phrase||'') + '</span>');
      h.push('<button class="btn-ghost" style="padding:1px 5px;font-size:0.7rem" onclick="jpSpeak(\'' + phrase + '\')">&#128266;</button>');
      h.push('</div>');
      if (p.meaning) h.push('<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink-light)">' + p.meaning + '</div>');
      if (p.example) h.push('<div style="font-family:var(--jp);font-size:0.88rem;color:var(--ink);margin-top:8px;padding:8px;background:var(--paper-dark);border-radius:4px">' + p.example + '</div>');
      h.push('</div>');
    });
    h.push('</div>');
  } else {
    h.push('<div id="ln-phrase-drill-container"></div>');
  }
  return h.join('');
}
function lnStartPhraseDrill() {
  lnRefreshTab('keyphrases');
  var cur = lnCurrentSession();
  var kp = (cur && cur.keyPhrases) || [];
  if (!kp.length) return;
  var mode = window._lnPhraseMode || 'en-jp';
  var DC = App.DrillCard || window.DrillCard;
  if (!DC) { console.warn('[LN] DrillCard not found'); return; }
  DC.run({
    containerId: 'ln-phrase-drill-container',
    allowResume: false,
    getQueue: function() { return kp.slice().sort(function() { return Math.random()-0.5; }); },
    getPrompt: function(item) {
      if (mode === 'en-jp') return '<span style="font-family:var(--ui);font-size:1.3rem;color:var(--ink)">' + (item.meaning||'') + '</span>';
      return '<span style="font-family:var(--jp)">' + (item.phrase||'') + '</span>';
    },
    getAnswer: function(item) {
      return mode === 'en-jp' ? (item.phrase||'') : (item.meaning||'');
    },
    onSpeak: function(item) {
      var speak = App.jpSpeak || window.jpSpeak;
      if (speak && item.phrase) speak(item.phrase);
    },
    inputPlaceholder: mode === 'en-jp' ? 'Type Japanese...' : 'Type English...',
    trackingLabel: 'ln-phrases'
  });
}
function lnRenderCorrections(cur) {
  var corrections = cur.corrections || [];
  if (!corrections.length) return '<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink-light);padding:20px 0">No corrections recorded.</div>';
  var h = ['<div style="display:flex;flex-direction:column;gap:8px">'];
  corrections.forEach(function(c) {
    h.push('<div style="padding:8px;background:var(--paper-dark);border:1px solid var(--border);border-radius:6px;font-family:var(--ui)">');
    h.push('<div style="font-size:0.82rem;margin-bottom:4px"><span style="color:#e05050">' + (c.original || '') + '</span> → <span style="color:var(--teal)">' + (c.corrected || '') + '</span></div>');
    if (c.note) h.push('<div style="font-size:0.72rem;color:var(--ink-light)">' + c.note + '</div>');
    h.push('</div>');
  });
  h.push('</div>');
  return h.join('');
}

function lnRenderGrammar(cur) {
  var grammar = cur.grammar || [];
  if (!grammar.length) return '<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink-light);padding:20px 0">No grammar points extracted.</div>';
  if (!window._lnGrammarHidden) window._lnGrammarHidden = new Set();
  if (!window._lnShowHidden) window._lnShowHidden = false;
  var hidden = window._lnGrammarHidden;
  var showHidden = window._lnShowHidden;
  var hiddenCount = hidden.size;
  var h = [];
  if (hiddenCount > 0) {
    h.push('<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding:6px 10px;background:var(--paper-dark);border-radius:6px">');
    h.push('<span style="font-family:var(--ui);font-size:0.75rem;color:var(--ink-light)">' + hiddenCount + ' hidden</span>');
    h.push('<button class="btn-ghost" style="font-size:0.72rem" onclick="lnToggleShowHidden()">' + (showHidden ? '&#128065; Hide hidden' : '&#128065; Show hidden') + '</button>');
    h.push('</div>');
  }
  h.push('<div style="display:flex;flex-direction:column;gap:10px">');
  grammar.forEach(function(g, i) {
    if (!showHidden && hidden.has(i)) return;
    var isHidden = hidden.has(i);
    var opacity = isHidden ? 'opacity:0.4;' : '';
    h.push('<div style="background:rgba(48,213,200,0.05);border:1px solid rgba(48,213,200,' + (isHidden ? '0.1' : '0.25') + ');border-radius:8px;padding:12px;' + opacity + '">');
    h.push('<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">');
    h.push('<span style="font-family:var(--jp);font-size:1.05rem;color:var(--teal);flex:1">' + (g.pattern||g.point||'') + '</span>');
    h.push('<button class="btn-ghost" style="padding:1px 6px;font-size:0.68rem" onclick="lnToggleGrammarHide(' + i + ')" title="' + (isHidden ? 'Show' : 'Hide') + '">' + (isHidden ? '&#128065;' : '&#128584;') + '</button>');
    h.push('</div>');
    if (g.explanation) h.push('<div style="font-family:var(--ui);font-size:0.80rem;color:var(--ink-light);line-height:1.5">' + g.explanation + '</div>');
    if (g.example) h.push('<div style="font-family:var(--jp);font-size:0.88rem;color:var(--ink);margin-top:8px;padding:8px;background:var(--paper-dark);border-radius:4px;border-left:3px solid var(--teal)">' + g.example + '</div>');
    h.push('</div>');
  });
  h.push('</div>');
  return h.join('');
}

function lnToggleGrammarHide(i) {
  if (!window._lnGrammarHidden) window._lnGrammarHidden = new Set();
  if (window._lnGrammarHidden.has(i)) window._lnGrammarHidden.delete(i);
  else window._lnGrammarHidden.add(i);
  lnRefreshTab('grammar');
}
function lnToggleShowHidden() {
  window._lnShowHidden = !window._lnShowHidden;
  lnRefreshTab('grammar');
}

function lnRenderTopics(cur) {
  var topics = cur.topics || [];
  var summary = cur.summary || '';
  var h = [];
  if (summary) h.push('<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink);margin-bottom:12px;font-style:italic">' + summary + '</div>');
  if (!topics.length) { h.push('<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink-light)">No topics extracted.</div>'); return h.join(''); }
  h.push('<div style="display:flex;flex-wrap:wrap;gap:6px">');
  topics.forEach(function(t) {
    h.push('<span style="font-family:var(--ui);font-size:0.78rem;background:var(--paper);border:1px solid var(--border);border-radius:12px;padding:4px 10px;color:var(--ink)">' + t + '</span>');
  });
  h.push('</div>');
  return h.join('');
}

function lnRenderFullDoc(cur) {
  var raw = cur.rawText || '';
  if (!raw) return '<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink-light);padding:20px 0">No source document.</div>';
  return '<div style="font-family:var(--jp);font-size:0.88rem;color:var(--ink);line-height:1.8;white-space:pre-wrap;max-height:60vh;overflow-y:auto;padding:8px">' + raw.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>';
}

function lnRenderRecording(cur) {
  var recordings = window._lessonRecordingSessions || [];
  // Normalise date — session.date may be 'YYYY-MM-DD', 'DD.MM.YY', or a WhatsApp title prefix.
  // Convert any format to YYYY-MM-DD so it matches the DB recording date field.
  function normDate(d) {
    if (!d) return '';
    // Strip leading [ and trailing punctuation, take first date-like segment
    d = d.replace(/^\[/, '').trim();
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0,10);
    // DD.MM.YY or DD.MM.YYYY — extract from anywhere in string
    var m = d.match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})/);
    if (!m) return '';
    var dd = m[1].padStart(2,'0'), mm = m[2].padStart(2,'0'), yy = m[3].length === 2 ? '20' + m[3] : m[3];
    return yy + '-' + mm + '-' + dd;
  }
  var sessionDate = normDate(cur.date || cur.title || '');
  // Find all recordings for this date (there may be more than one per day)
  var matched = recordings.find(function(s) { return normDate(s.date || (s.created_at||'').slice(0,10)) === sessionDate; });
  var h = [];
  if (!matched) {
    h.push('<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink-light);padding:12px 0">');
    h.push('No recording for ' + sessionDate + '.');
    if (recordings.length) h.push(' Available: ' + recordings.map(function(s){ return s.date || (s.created_at||'').slice(0,10); }).join(', '));
    h.push('</div>');
    return h.join('');
  }
  var done = !!matched.processed_at;
  h.push('<div style="font-family:var(--ui);font-size:0.75rem;color:' + (done ? 'var(--teal)' : 'var(--gold)') + ';margin-bottom:10px">' + (done ? '✓ Transcribed' : '⏳ Processing…') + '</div>');
  if (matched.audio_path) {
    var audioSrc = 'file://' + matched.audio_path;
    var teacherSrc = 'file://' + matched.audio_path.replace('.webm','_teacher.webm');
    h.push('<div style="background:var(--paper);border:1px solid var(--border);border-radius:6px;padding:8px 12px;margin-bottom:10px">');
    h.push('<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px"><span style="font-family:var(--ui);font-size:0.68rem;color:var(--ink-light);width:52px">🙋 You</span><audio src="' + audioSrc + '" controls style="flex:1;height:28px"></audio></div>');
    h.push('<div style="display:flex;align-items:center;gap:8px"><span style="font-family:var(--ui);font-size:0.68rem;color:var(--ink-light);width:52px">🧑‍🏫 Yoshi</span><audio src="' + teacherSrc + '" controls style="flex:1;height:28px"></audio></div>');
    h.push('</div>');
  }
  if (matched.transcript_json) {
    try {
      var turns = JSON.parse(matched.transcript_json);
      if (turns.length) {
        h.push('<input placeholder="Search transcript…" oninput="lnFilterTranscript(this.value)" style="width:100%;padding:6px 10px;background:var(--field);border:1px solid var(--field-border);border-radius:5px;font-family:var(--ui);font-size:0.78rem;color:var(--ink);box-sizing:border-box;margin-bottom:6px">');
        h.push('<div id="lnTranscriptList" style="max-height:50vh;overflow-y:auto">');
        turns.forEach(function(t) {
          var ts = Math.round(t.start || 0);
          var m = Math.floor(ts/60), s = ts%60;
          var isTeacher = t.speaker === 'teacher' || t.speaker === 'TEACHER';
          h.push('<div class="lesson-transcript-row" data-text="' + (t.text||'').replace(/"/g,'&quot;').toLowerCase() + '" style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--border)">');
          h.push('<span style="font-family:var(--ui);font-size:0.65rem;color:var(--teal);flex-shrink:0;width:32px">' + m + ':' + String(s).padStart(2,'0') + '</span>');
          h.push('<span style="flex-shrink:0">' + (isTeacher ? '🧑‍🏫' : '🙋') + '</span>');
          h.push('<span style="font-family:var(--jp);font-size:0.88rem;color:var(--ink);flex:1">' + (t.text||'') + '</span>');
          h.push('</div>');
        });
        h.push('</div>');
      }
    } catch(e) {}
  }
  return h.join('');
}

function lnFilterTranscript(query) {
  document.querySelectorAll('.lesson-transcript-row').forEach(function(r) {
    r.style.display = (!query || (r.dataset.text && r.dataset.text.includes(query.toLowerCase()))) ? '' : 'none';
  });
}

// ── Recording list handlers ──────────────────────────────────────────────────

function lnToggleRecPlayer(id) {
  const el = document.getElementById('lnRecPlayer-' + id);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function lnDeleteRecording(id) {
  const recs = window._lessonRecordingSessions || [];
  const rec  = recs.find(function(s) { return s.id === id; });
  if (!rec) return;
  const msg = rec.audio_path
    ? 'Delete this recording and its audio file?'
    : 'Delete this recording session?';
  if (!confirm(msg)) return;
  try {
    await Orchestrator.deleteSession(
      rec.id,
      rec.audio_path || null,
      rec.audio_path ? rec.audio_path.replace('.webm', '_teacher.webm') : null
    );
  } catch(e) {
    alert('Delete failed: ' + e.message);
  }
}


function lnNewSession() {
  _lnCurrentIdx = null;
  lessonNotesRenderPanel();
}

function lnLoadSession(idx) {
  _lnCurrentIdx = idx >= 0 ? idx : null;
  lessonNotesRenderPanel();
}

function lnDeleteSession() {
  if (!confirm('Delete this lesson session?')) return;
  var sessions = lnGetSessions();
  sessions.splice(_lnCurrentIdx, 1);
  lnSaveSessions(sessions);
  _lnCurrentIdx = sessions.length ? 0 : null;
  lessonNotesRenderPanel();
}

async function lnCreateFromPaste() {
  var raw = (document.getElementById('lnPasteArea') || {}).value || '';
  raw = raw.trim();
  var titleEl = document.getElementById('lnNewTitle');
  var title = (titleEl ? titleEl.value.trim() : '') || new Date().toISOString().slice(0,10);
  if (!raw) return;

  _lnExtracting = true;
  lessonNotesRenderPanel();

  var messages = yoshiParseWhatsapp(raw);
  var isWhatsApp = messages.length > 2;
  var vocab = [], corrections = [], grammar = [], topics = [], summary = '';

  try {
    var apiKey = (App.getApiKey || window.getApiKey)?.();
    if (apiKey) {
      var resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          system: 'Analyse Japanese lesson content. Respond ONLY with valid JSON, no markdown.',
          messages: [{ role: 'user', content:
            'Extract from this ' + (isWhatsApp ? 'WhatsApp lesson chat' : 'lesson document') + ':\n'
            + '1. vocab: [{jp, reading, en}] — vocabulary items with readings\n'
            + '2. stories: [{title, text}] — any continuous Japanese text passages (sentences, paragraphs)\n'
            + '3. keyPhrases: [{phrase, meaning, example}] — useful expressions and sentence patterns\n'
            + '4. grammar: [{pattern, explanation, example}] — grammar points covered\n'
            + '5. corrections: [{original, corrected, note}] — errors that were corrected\n'
            + '6. topics: [string] — topics covered\n'
            + '7. summary: string (one sentence)\n\n'
            + 'Content:\n' + raw.slice(0, 4000)
            + '\n\nJSON only: {"vocab":[],"stories":[],"keyPhrases":[],"grammar":[],"corrections":[],"topics":[],"summary":""}'
          }]
        })
      });
      var data = await resp.json();
      console.warn('[API] Claude call · feature="lesson-paste" · in=' + (data.usage?.input_tokens ?? '?') + ' out=' + (data.usage?.output_tokens ?? '?') + ' tokens');
      (App.apiUsageTrack || window.apiUsageTrack)?.('lesson-paste', data.usage?.input_tokens ?? 0, data.usage?.output_tokens ?? 0);
      var text = (data.content && data.content[0] && data.content[0].text) || '';
      var parsed = JSON.parse(text.replace(/```json|```/g,'').trim());
      vocab = parsed.vocab || [];
      corrections = parsed.corrections || [];
      grammar = parsed.grammar || [];
      topics = parsed.topics || [];
      summary = parsed.summary || '';
    }
  } catch(e) { console.warn('[lnCreateFromPaste]', e.message); }

  var sessions = lnGetSessions();
  var stories = parsed && parsed.stories ? parsed.stories : [];
  var keyPhrases = parsed && parsed.keyPhrases ? parsed.keyPhrases : [];
  sessions.unshift({
    id: Date.now(),
    date: (function() {
      var d = title.replace(/^\[/, '').trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0,10);
      var m = d.match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})/);
      if (m) { var yy = m[3].length===2?'20'+m[3]:m[3]; return yy+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'); }
      return new Date().toISOString().slice(0,10);
    })(),
    title: title,
    rawText: raw,
    vocab: vocab,
    stories: stories,
    keyPhrases: keyPhrases,
    grammar: grammar,
    corrections: corrections,
    topics: topics,
    summary: summary,
    whatsapp: isWhatsApp ? messages : [],
  });
  lnSaveSessions(sessions);
  _lnCurrentIdx = 0;
  _lnExtracting = false;
  lessonNotesRenderPanel();
}

async function lnHandleFile(files) {
  if (!files || !files[0]) return;
  var file = files[0];
  var text = '';
  try {
    text = await file.text();
  } catch(e) { alert('Could not read file: ' + e.message); return; }
  var titleEl = document.getElementById('lnNewTitle');
  if (titleEl && !titleEl.value) titleEl.value = file.name.replace(/\.(docx|txt|md)$/i,'');
  var pasteEl = document.getElementById('lnPasteArea');
  if (pasteEl) pasteEl.value = text;
}

function lnHandleDrop(event) {
  event.preventDefault();
  lnHandleFile(event.dataTransfer && event.dataTransfer.files);
}

// Inline WhatsApp save — reads from per-session textarea
async function yoshiSaveWhatsappInline(sessionId) {
  const el = document.getElementById('waInput_' + sessionId);
  if (!el || !el.value.trim()) return;
  const btn = el.nextElementSibling;
  if (btn) { btn.textContent = 'Syncing…'; btn.disabled = true; }
  try {
    await Orchestrator.attachWhatsApp(sessionId, el.value);
    if (btn) { btn.textContent = 'Saved ✓'; setTimeout(() => { btn.textContent = 'Save & sync →'; btn.disabled = false; }, 1500); }
  } catch(e) {
    if (btn) { btn.textContent = 'Error'; setTimeout(() => { btn.textContent = 'Save & sync →'; btn.disabled = false; }, 2000); }
  }
}

// Manually retranscribe a saved session
async function yoshiRetranscribe(sessionId) {
  try {
    await Orchestrator.transcribeSession(sessionId);
  } catch(e) {
    console.error('[yoshiRetranscribe]', e);
    alert('Retranscription failed: ' + e.message);
  }
}

// ── Manual lesson notes (unrecorded sessions — WhatsApp threads) ──────────────

// Wire recording buttons via YoshiUI without triggering full panel re-render
const _origYoshiInitUI = window['yoshiInitUI'];
window['yoshiInitUI'] = function() {
  // Only wire buttons - don't call loadSessions which triggers SESSIONS_LOADED → re-render
  if (window.YoshiUI && typeof window.YoshiUI.wireButtons === 'function') {
    window.YoshiUI.wireButtons();
  }
};

function yoshiOpenOverlay() {
  if (window.electronAPI?.openLessonOverlay) {
    window.electronAPI.openLessonOverlay();
  }
}

// ── Forward recording AppEvents to the overlay window ─────────────────────────
// The overlay has no access to AppEvents directly (separate renderer process).
// We relay the events it needs via ipcRenderer → main → overlayWindow.webContents.

if (window.electronAPI?.ipcSend) {
  const _fwdEvents = [
    AppEvents.RECORDING_STARTED,
    AppEvents.RECORDING_TICK,
    AppEvents.RECORDING_STOPPED,
    AppEvents.TRANSCRIPTION_STARTED,
    AppEvents.TRANSCRIPTION_COMPLETE,
    AppEvents.RECORDING_ERROR,
    AppEvents.PIPELINE_ERROR,
  ];
  _fwdEvents.forEach(name => {
    AppEvents.on(name, data => {
      try { window.electronAPI.ipcSend('overlay:event', { name, data }); } catch(e) {}
    });
  });
}

// Open Teams meeting
function yoshiOpenTeams() {
  const url = 'https://teams.live.com/meet/9387084365462?p=cBmSFutAH5IRELtQxD';
  window.open(url, '_blank');
}

// ── Quick channel test (🎙 Test button) ───────────────────────────────────────
// Delegates to PreflightService for device access + live level sampling.
// Result is persisted to failure_events for post-session forensics.

async function yoshiTestChannels() {
  const resultEl = document.getElementById('yoshiRecordStatus');
  if (!resultEl) return;

  resultEl.style.color = 'var(--ink-light)';
  resultEl.textContent = 'Testing… (4s)';

  const _pf = App.PreflightService || window.PreflightService;
  if (!_pf) {
    resultEl.textContent = 'PreflightService not available — check load order.';
    return;
  }

  try {
    const report = await _pf.run();
    _renderPreflightBadge(resultEl, report);

    // Also render full panel if the div exists
    const panelEl = document.getElementById('yoshiPreflightPanel');
    if (panelEl) panelEl.innerHTML = _preflightReportHtml(report);
  } catch (e) {
    resultEl.style.color = 'var(--red, #e05050)';
    resultEl.textContent = 'Test error: ' + e.message;
  }
}

// ── Full preflight (optional yoshiRunPreflight() call) ────────────────────────

async function yoshiRunPreflight() {
  const panelEl  = document.getElementById('yoshiPreflightPanel');
  const statusEl = document.getElementById('yoshiRecordStatus');

  if (panelEl)  panelEl.innerHTML  = '<div style="font-family:var(--ui);font-size:0.78rem;color:var(--ink-light);padding:12px 0">⏳ Sampling audio (4 seconds)…</div>';
  if (statusEl) statusEl.textContent = 'Running preflight…';

  let report;
  try {
    const _pf2 = App.PreflightService || window.PreflightService;
    if (!_pf2) throw new Error('PreflightService not available');
    report = await _pf2.run();
  } catch (e) {
    const msg = 'Preflight error: ' + e.message;
    if (panelEl)  panelEl.innerHTML  = '<div style="font-family:var(--ui);font-size:0.78rem;color:var(--red,#e05050);padding:12px 0">✗ ' + msg + '</div>';
    if (statusEl) statusEl.textContent = msg;
    return;
  }

  if (panelEl)  panelEl.innerHTML = _preflightReportHtml(report);
  if (statusEl) _renderPreflightBadge(statusEl, report);
}

// ── Preflight rendering helpers ───────────────────────────────────────────────

function _renderPreflightBadge(el, report) {
  if (report.ready) {
    el.style.color = 'var(--teal)';
    el.textContent = '✓ Ready — mic: ' + _pfShortLabel(report.devices.micLabel)
                   + ' · loopback: '   + _pfShortLabel(report.devices.loopbackLabel)
                   + ' (mic peak '     + (report.levels.mic      ?? '?')
                   + ', loop peak '    + (report.levels.loopback ?? '?') + ')';
  } else {
    const first = report.errors[0] || report.warnings[0] || 'Check failed';
    el.style.color = report.errors.length ? 'var(--red, #e05050)' : 'var(--gold)';
    el.textContent = (report.errors.length ? '✗ ' : '⚠ ') + first;
  }
}

function _preflightReportHtml(report) {
  const pfRow = (label, ok, detail, isWarn) => {
    const icon  = ok === null ? '–' : ok ? '✓' : (isWarn ? '⚠' : '✗');
    const color = ok === null ? 'var(--ink-light)'
                : ok         ? 'var(--teal)'
                : isWarn     ? 'var(--gold)'
                :              'var(--red,#e05050)';
    return '<div style="display:flex;gap:10px;align-items:baseline;padding:3px 0">'
         + '<span style="font-family:var(--ui);font-size:0.78rem;color:' + color + ';flex-shrink:0;width:16px">' + icon + '</span>'
         + '<span style="font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);flex-shrink:0;width:120px">' + label + '</span>'
         + '<span style="font-family:var(--ui);font-size:0.75rem;color:var(--ink)">' + (detail || '') + '</span>'
         + '</div>';
  };

  const c = report.checks, l = report.levels, d = report.devices;
  const rows = [
    pfRow('Loopback visible',    c.loopbackVisible,    d.loopbackLabel || 'not found'),
    pfRow('Mic access',          c.micAccessible,      d.micLabel || '—'),
    pfRow('Loopback access',     c.loopbackAccessible, c.loopbackAccessible ? 'ok' : 'failed'),
    pfRow('Mic level',           l.mic !== null && !c.micSilent,      l.mic      !== null ? 'peak ' + l.mic      + '/127' : 'not sampled', c.micSilent),
    pfRow('Loopback level',      l.loopback !== null && !c.loopbackSilent, l.loopback !== null ? 'peak ' + l.loopback + '/127' : 'not sampled', c.loopbackSilent),
  ];

  const statusColor = report.ready           ? 'var(--teal)'
                    : report.errors.length   ? 'var(--red,#e05050)'
                    :                          'var(--gold)';
  const statusText  = report.ready           ? '✓ Ready to record'
                    : report.errors.length   ? '✗ Not ready — fix errors before recording'
                    :                          '⚠ Warnings — check loopback routing';

  let html = '<div style="border:1px solid var(--border);border-radius:6px;padding:12px;margin-top:8px">';
  html += '<div style="font-family:var(--ui);font-size:0.65rem;letter-spacing:0.08em;color:var(--ink-light);margin-bottom:8px">PREFLIGHT CHECK</div>';
  html += rows.join('');

  if (report.warnings.length || report.errors.length) {
    html += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">';
    for (const w of report.warnings) html += '<div style="font-family:var(--ui);font-size:0.72rem;color:var(--gold);margin-bottom:3px">⚠ ' + w + '</div>';
    for (const e of report.errors)   html += '<div style="font-family:var(--ui);font-size:0.72rem;color:var(--red,#e05050);margin-bottom:3px">✗ ' + e + '</div>';
    html += '</div>';
  }

  html += '<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);font-family:var(--ui);font-size:0.78rem;color:' + statusColor + '">' + statusText + '</div>';
  html += '</div>';
  return html;
}

function _pfShortLabel(label) {
  if (!label) return '—';
  return label.length > 22 ? label.slice(0, 20) + '…' : label;
}

// ── Matching pairs game state ────────────────────────────────────────────────
const MatchingPairsState = {
  cat:      'vehicles',
  pairs:    16,
  timer:    120,
  reading:  true,
  items:    [],     // [{kanji, jp, emoji, en, id}]
  kanjiSel: null,
  emojiSel: null,
  matched:  0,
  timerInt: null,
  secsLeft: 0,
  start:    0,
};

// ── Epub reader state ────────────────────────────────────────────────────────
const EpubState = {
  zip:         null,
  spine:       [],
  chapterIdx:  0,
  furi:        false,
  ttsSpeaking: false,
  fontSize:    1.35,
};

// ── Te-form drill state ──────────────────────────────────────────────────────
const TeFormState = {
  mode:             'form',
  group:            'all',
  current:          null,
  queue:            [],
  correct:          0,
  wrong:            0,
  answered:         false,
  contextSentences: [],
  contextIdx:       0,
};

// ── Grammar2 panel state ─────────────────────────────────────────────────────
const Grammar2State = {
  lastSubtab: 'conj',
};

// ── Voice conversation state ─────────────────────────────────────────────────
const VoiceState = {
  messages:          [],
  recording:         false,
  mediaRecorder:     null,
  audioChunks:       [],
  stream:            null,
  currentConvoName:  '',
  // Round-trip
  rtActive:          false,
  rtMode:            'round-trip',
  rtRound:           0,
  rtTopic:           '',
  rtTranscript:      '',
  rtMessages1:       [],
  rtMessages2:       [],
  rtLastDebrief:     null,
  // Playback
  lastRecordingBlob: null,
  lastRecordingUrl:  null,
  // Interview
  interviewMode:     false,
  interviewData:     {},
  // Sentence playback
  sentenceQueue:     [],
  sentenceIdx:       0,
  sentencePlaying:   false,
  sentenceWaiting:   false,
  sentenceText:      '',
};

// Electron: expose all onclick functions to window
try {
  window["addGramEntry"] = addGramEntry;
  window["advanceConj"] = advanceConj;
  window["cancelGramEntryEdit"] = cancelGramEntryEdit;
  window["chatQuick"] = chatQuick;
  window["checkConj"] = checkConj;
  window["checkDictation"] = checkDictation;
  window["checkWritingSentence"] = checkWritingSentence;
  window["clearDictation"] = clearDictation;
  window["clearListenPlaylist"] = clearListenPlaylist;
  window["clearTranslate"] = clearTranslate;
  window["clearVocabBookmarks"] = clearVocabBookmarks;
  window["setChatInputMode"] = setChatInputMode;
  window["clearWritingFeedback"] = clearWritingFeedback;
  window["closeTimesDrill"] = closeTimesDrill;
  window["compAnswer"] = compAnswer;
  window["compGenerate"] = compGenerate;
  window["compPlay"] = compPlay;
  window["compPlayLine"] = compPlayLine;
  window["compReplay"] = compReplay;
  window["compStop"] = compStop;
  window["conjSpeak"] = conjSpeak;
  window["copyDictation"] = copyDictation;
  window["copySavedText"] = copySavedText;
          window["ctrToggle"] = ctrToggle;
  window["cycleLoop"] = cycleLoop;
  window["deleteGramEntry"] = deleteGramEntry;
  window["deleteSavedText"] = deleteSavedText;
  window["deleteVocabBookmark"] = deleteVocabBookmark;
  window["doTranslate"] = doTranslate;
  window["dropVocabBookmark"] = dropVocabBookmark;
  window["editGramEntry"] = editGramEntry;
  window["exportAnki"] = exportAnki;
  window["feToggle"] = feToggle;
  window["flipVocab"] = flipVocab;
  window["gdCheck"] = gdCheck;
  window["gdExitDrillMode"] = gdExitDrillMode;
  window["gdGenerate"] = gdGenerate;
  window["gdNext"] = gdNext;
  window["gdSelectAll"] = gdSelectAll;
  window["gdToggleDirection"] = gdToggleDirection;
  window["gdToggleHint"] = gdToggleHint;
  window["gdToggleVocabHint"] = gdToggleVocabHint;
  window["gramSearch"] = gramSearch;
  window["jishoLookup"] = jishoLookup;
  window["jpSpeak"] = jpSpeak;
  window["kanaToKanji"] = kanaToKanji;
  window["kanaToggle"] = kanaToggle;
  window["listenQueueNext"] = listenQueueNext;
  window["listenQueuePrev"] = listenQueuePrev;
  window["listenSkip"] = listenSkip;
  window["loadListenTrack"] = loadListenTrack;
  window["loadTransHistory"] = loadTransHistory;
  window["markVocab"] = markVocab;
  window["newDictSentence"] = newDictSentence;
  window["nextTimesQuestion"] = nextTimesQuestion;
  window["nextVocab"] = nextVocab;
  window["openTimesDrill"] = openTimesDrill;
  window["openTimesSettings"] = openTimesSettings;
  window["playDictSentence"] = playDictSentence;
  window["playSelected"] = playSelected;
  window["playTimesAudio"] = playTimesAudio;
  window["prevVocab"] = prevVocab;
  window["printVocabList"] = printVocabList;
  window["progressExport"] = progressExport;
  window["qrPrintPage"] = qrPrintPage;
  window["qrSegment"] = qrSegment;
  window["qrSendToWrite"] = qrSendToWrite;
  window["qrShowPaste"] = qrShowPaste;
  window["qrToggleFuri"] = qrToggleFuri;
  window["qrTogglePlain"] = qrTogglePlain;
  window["rateListen"] = rateListen;
  window["resetVocabDeck"] = resetVocabDeck;
  window["revealKanji"] = revealKanji;
  window["rtkSkip"] = rtkSkip;
  window["saveApiKey"] = saveApiKey;
  window["saveGramEntryEdit"] = saveGramEntryEdit;
  window["saveWritingText"] = saveWritingText;
  window["scoreRtk"] = scoreRtk;
  window["seekToBookmark"] = seekToBookmark;
  window["sendChat"] = sendChat;
  window["setKanaMode"] = setKanaMode;
  window["setRtkDirection"] = setRtkDirection;
  window["setRtkMode"] = setRtkMode;
  window["setTimesMode"] = setTimesMode;
  window["showBdTab"] = showBdTab;
  window["showGramTab"] = showGramTab;
  window["showGramTabAndHighlight"] = showGramTabAndHighlight;
  window["showPanel"] = showPanel;
  window["skipKana"] = skipKana;
  window["startBlitz"] = startBlitz;
  window["startChatSpeech"] = startChatSpeech;
  window["startConjDrill"] = startConjDrill;
  window["refreshMicrophones"] = refreshMicrophones;
  window["setMicrophone"] = setMicrophone;
  window["startNewSession"] = startNewSession;
  window["startTransSpeech"] = startTransSpeech;
  window["startWritingSpeech"] = startWritingSpeech;
  window["sttStart"] = sttStart;
  window["submitWritingSentence"] = submitWritingSentence;
  window["testMicrophone"] = testMicrophone;
  window["toggleBlitzMode"] = toggleBlitzMode;
  window["toggleComprehension"] = toggleComprehension;
  window["toggleConjListenMode"] = toggleConjListenMode;
  window["toggleDetail"] = toggleDetail;
  window["toggleDictationMode"] = toggleDictationMode;
  window["toggleGrammar"] = toggleGrammar;
  window["toggleListenPlay"] = toggleListenPlay;
  window["toggleShadowing"] = toggleShadowing;
  window["toggleSrsTracking"] = toggleSrsTracking;
  window["toggleTransKana"] = toggleTransKana;
  window["toggleVcReading"] = toggleVcReading;
  window["toggleVocabList"] = toggleVocabList;
  window["transAddToVocab"] = transAddToVocab;
  window["transDoKanjiConvert"] = transDoKanjiConvert;
  window["transSpeakOutput"] = transSpeakOutput;
  window["listenTransToggleKana"] = listenTransToggleKana;
  window["listenTransSetMode"] = listenTransSetMode;
  window["listenTransClear"] = listenTransClear;
  window["vcFetch"] = vcFetch;
  window["vcFetchAdd"] = vcFetchAdd;
  window["vcFetchSelectAll"] = vcFetchSelectAll;
  window["vcToggleHint"] = vcToggleHint;
  window["vgEnd"] = vgEnd;
  window["vgNext"] = vgNext;
  window["vgSelectCat"] = vgSelectCat;
// ═══════════════════════════════════════════════════════
// MATCHING PAIRS GAME
// ═══════════════════════════════════════════════════════

function mgSelectCat(cat, btn) {
  MatchingPairsState.cat = cat;
  document.querySelectorAll('#mg-cat-grid .vg-cat-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}
function mgSetPairs(n, btn) {
  MatchingPairsState.pairs = n;
  btn.closest('.vg-time-btns').querySelectorAll('.vg-time-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}
function mgSetTimer(n, btn) {
  MatchingPairsState.timer = n;
  btn.closest('.vg-time-btns').querySelectorAll('.vg-time-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}
function mgSetReading(v, btn) {
  MatchingPairsState.reading = v;
  btn.closest('.vg-time-btns').querySelectorAll('.vg-time-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function mgShowSetup() {
  document.getElementById('mg-setup').style.display = '';
  document.getElementById('mg-game').style.display  = 'none';
  document.getElementById('mg-result').style.display = 'none';
  clearInterval(MatchingPairsState.timerInt);
}

function mgStart() {
  const cat = VG_CATEGORIES[MatchingPairsState.cat];
  const pool = [...cat.items].sort(() => Math.random() - 0.5).slice(0, Math.min(MatchingPairsState.pairs, 20));
  MatchingPairsState.items = pool.map((it, i) => ({ ...it, id: i }));
  MatchingPairsState.kanjiSel = null;
  MatchingPairsState.emojiSel = null;
  MatchingPairsState.matched  = 0;
  MatchingPairsState.start    = Date.now();

  document.getElementById('mg-setup').style.display  = 'none';
  document.getElementById('mg-game').style.display   = '';
  document.getElementById('mg-result').style.display = 'none';
  document.getElementById('mg-total').textContent    = MatchingPairsState.items.length;
  document.getElementById('mg-matched').textContent  = '0';

  // Shuffle each column independently
  const kanjiOrder = [...MatchingPairsState.items].sort(() => Math.random() - 0.5);
  const emojiOrder = [...MatchingPairsState.items].sort(() => Math.random() - 0.5);

  const kCol = document.getElementById('mg-kanji-col');
  const eCol = document.getElementById('mg-emoji-col');
  kCol.innerHTML = '';
  eCol.innerHTML = '';

  for (const item of kanjiOrder) {
    const el = document.createElement('div');
    el.className = 'mg-tile mg-kanji-tile';
    el.dataset.id = item.id;
    const _kanjiClass = item.kanji.length > 3 ? 'mg-kanji-long' : 'mg-kanji';
    el.innerHTML = '<span class="' + _kanjiClass + '">' + item.kanji + '</span>'
      + (MatchingPairsState.reading ? '<span class="mg-reading">' + item.jp + '</span>' : '');
    el.onclick = () => mgClickKanji(item.id);
    kCol.appendChild(el);
  }
  for (const item of emojiOrder) {
    const el = document.createElement('div');
    el.className = 'mg-tile mg-emoji-tile';
    el.dataset.id = item.id;
    el.innerHTML = '<span class="mg-emoji-big">' + item.emoji + '</span>';
    el.title = item.en;
    el.onclick = () => mgClickEmoji(item.id);
    eCol.appendChild(el);
  }

  // Timer
  clearInterval(MatchingPairsState.timerInt);
  if (MatchingPairsState.timer > 0) {
    MatchingPairsState.secsLeft = MatchingPairsState.timer;
    mgUpdateTimer();
    MatchingPairsState.timerInt = setInterval(() => {
      MatchingPairsState.secsLeft--;
      mgUpdateTimer();
      if (MatchingPairsState.secsLeft <= 0) { clearInterval(MatchingPairsState.timerInt); mgFinish(false); }
    }, 1000);
  } else {
    document.getElementById('mg-timer').textContent = '';
  }
}

function mgUpdateTimer() {
  const el = document.getElementById('mg-timer');
  if (!el) return;
  const m = Math.floor(MatchingPairsState.secsLeft / 60);
  const s = MatchingPairsState.secsLeft % 60;
  el.textContent = m + ':' + String(s).padStart(2, '0');
  el.style.color = MatchingPairsState.secsLeft <= 10 ? 'var(--red)' : MatchingPairsState.secsLeft <= 30 ? 'var(--gold)' : 'var(--ink-light)';
}

function mgClickKanji(id) {
  if (document.querySelector('.mg-kanji-tile[data-id="' + id + '"]')?.classList.contains('mg-matched')) return;
  // Deselect previous
  document.querySelectorAll('.mg-kanji-tile.mg-selected').forEach(el => el.classList.remove('mg-selected'));
  MatchingPairsState.kanjiSel = id;
  document.querySelector('.mg-kanji-tile[data-id="' + id + '"]')?.classList.add('mg-selected');
  mgCheckMatch();
}

function mgClickEmoji(id) {
  if (document.querySelector('.mg-emoji-tile[data-id="' + id + '"]')?.classList.contains('mg-matched')) return;
  document.querySelectorAll('.mg-emoji-tile.mg-selected').forEach(el => el.classList.remove('mg-selected'));
  MatchingPairsState.emojiSel = id;
  document.querySelector('.mg-emoji-tile[data-id="' + id + '"]')?.classList.add('mg-selected');
  mgCheckMatch();
}

function mgCheckMatch() {
  if (MatchingPairsState.kanjiSel === null || MatchingPairsState.emojiSel === null) return;
  const kId = MatchingPairsState.kanjiSel;
  const eId = MatchingPairsState.emojiSel;
  MatchingPairsState.kanjiSel = null;
  MatchingPairsState.emojiSel = null;

  if (kId === eId) {
    // Match
    const kEl = document.querySelector('.mg-kanji-tile[data-id="' + kId + '"]');
    const eEl = document.querySelector('.mg-emoji-tile[data-id="' + eId + '"]');
    if (kEl) { kEl.classList.remove('mg-selected'); kEl.classList.add('mg-matched'); }
    if (eEl) { eEl.classList.remove('mg-selected'); eEl.classList.add('mg-matched'); }
    MatchingPairsState.matched++;
    document.getElementById('mg-matched').textContent = MatchingPairsState.matched;
    if (MatchingPairsState.matched >= MatchingPairsState.items.length) mgFinish(true);
  } else {
    // No match — flash red briefly
    const kEl = document.querySelector('.mg-kanji-tile[data-id="' + kId + '"]');
    const eEl = document.querySelector('.mg-emoji-tile[data-id="' + eId + '"]');
    [kEl, eEl].forEach(el => { if (el) { el.classList.add('mg-wrong'); setTimeout(() => { el.classList.remove('mg-wrong', 'mg-selected'); }, 600); } });
  }
}

function mgFinish(complete) {
  clearInterval(MatchingPairsState.timerInt);
  const secs = Math.round((Date.now() - MatchingPairsState.start) / 1000);
  const m = Math.floor(secs / 60), s = secs % 60;
  document.getElementById('mg-game').style.display   = 'none';
  document.getElementById('mg-result').style.display = '';
  const pct = Math.round(MatchingPairsState.matched / MatchingPairsState.items.length * 100);
  document.getElementById('mg-result-emoji').textContent = complete ? '🎌' : '⏱️';
  document.getElementById('mg-result-msg').textContent   = complete
    ? 'All matched!'
    : MatchingPairsState.matched + ' of ' + MatchingPairsState.items.length + ' matched';
  document.getElementById('mg-result-detail').textContent = m + ':' + String(s).padStart(2,'0') + ' · ' + pct + '%';
}

function mgEnd() { mgFinish(false); }

window['mgSelectCat']  = mgSelectCat;
window['mgSetPairs']   = mgSetPairs;
window['mgSetTimer']   = mgSetTimer;
window['mgSetReading'] = mgSetReading;
window['mgStart']      = mgStart;
window['mgEnd']        = mgEnd;
window['mgShowSetup']  = mgShowSetup;
// ═══════════════════════════════════════════════════════

  window["vgSelectCount"] = vgSelectCount;
  window["vgSelectText"] = vgSelectText;
  window["vgSelectTime"] = vgSelectTime;
  window["vgSetTts"] = vgSetTts;
  window["vgShowSetup"] = vgShowSetup;
  window["vgSpeak"] = vgSpeak;
  window["vgStart"] = vgStart;
  window["vgToggleMic"] = vgToggleMic;
  window["vtAddMarker"] = vtAddMarker;
  window["vtBreakdownLine"] = vtBreakdownLine;
  window["vtClearLoop"] = vtClearLoop;
  window["vtClearMarkers"] = vtClearMarkers;
  window["vtClearTranslation"] = vtClearTranslation;
  window["vtCloseBreakdown"] = vtCloseBreakdown;
  window["vtCloseVocabList"] = vtCloseVocabList;
  window["vtCueClick"] = vtCueClick;
  window["vtDeleteVocabWord"] = vtDeleteVocabWord;
  window["vtDropZoneClick"] = vtDropZoneClick;
  window["vtFullscreen"] = vtFullscreen;
  window["vtFuriAll"] = vtFuriAll;
  window["vtFuriLine"] = vtFuriLine;
  window["vtJumpMarker"] = vtJumpMarker;
  window["vtJumpToTime"] = vtJumpToTime;
  window["vtLoadTranscript"] = vtLoadTranscript;
  window["vtLoadVideo"] = vtLoadVideo;
  window["vtOnPause"] = vtOnPause;
  window["vtOnPlay"] = vtOnPlay;
  window["vtOpenSaved"] = vtOpenSaved;
  window["vtRegenerateVocabList"] = vtRegenerateVocabList;
  window["vtSetLoopA"] = vtSetLoopA;
  window["vtSetSpeed"] = vtSetSpeed;
  window["vtShowVocabList"] = vtShowVocabList;
  window["vtTogglePlay"] = vtTogglePlay;
  window["vtToggleWaveMode"] = vtToggleWaveMode;
  window["vtTranslateLine"] = vtTranslateLine;
  window["vtWatchUpdate"] = vtWatchUpdate;
  window["vtWaveClick"] = vtWaveClick;
  window["vtWordSelect"] = vtWordSelect;
  window["wbCopyInput"] = wbCopyInput;
  window["wordsSwitchSub"] = wordsSwitchSub;
  window["yoshiAIComplete"] = yoshiAIComplete;
  window["yoshiAIVocab"] = yoshiAIVocab;
  window["yoshiAddVocab"] = yoshiAddVocab;
  window["yoshiAttachAudio"] = yoshiAttachAudio;
  window["yoshiCheckCloze"] = yoshiCheckCloze;
  window["yoshiConfirmCloze"] = yoshiConfirmCloze;
  window["yoshiImport"] = yoshiImport;
  window["yoshiMiniCycleLoop"] = yoshiMiniCycleLoop;
  window["yoshiMiniCycleLoopEl"] = yoshiMiniCycleLoopEl;
  window["yoshiMiniSkip"] = yoshiMiniSkip;
  window["yoshiMiniSkipEl"] = yoshiMiniSkipEl;
  window["yoshiMiniToggle"] = yoshiMiniToggle;
  window["yoshiMiniToggleEl"] = yoshiMiniToggleEl;
  window["yoshiOpenSession"] = yoshiOpenSession;
  window["yoshiParseDocx"] = yoshiParseDocx;

// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// LESSON RECORDING — replaced by service layer
// Logic now lives in:
//   src/services/LessonSession.js
//   src/services/AudioService.js
//   src/services/TranscriptionService.js
//   src/services/StorageService.js
//   src/services/AnalysisService.js
//   src/Orchestrator.js        (pipeline coordinator)
//   src/ui/YoshiUI.js          (UI event listeners)
// Backward-compat shims (yoshiStartRecording etc.) are in Orchestrator.js
// ═══════════════════════════════════════════════════════


  window["yoshiReadTTSAll"] = yoshiReadTTSAll;
  window["yoshiReadTTSStop"] = yoshiReadTTSStop;
  window["yoshiReadToggleAll"] = yoshiReadToggleAll;
  window["yoshiResetCloze"] = yoshiResetCloze;
  window["yoshiRevealAll"] = yoshiRevealAll;
  window["yoshiSwitchTab"] = yoshiSwitchTab;
  window["yoshiToggleFurigana"] = yoshiToggleFurigana;
  window["yoshiToggleParaEn"] = yoshiToggleParaEn;
  window["yoshiVocabPopupAddRow"] = yoshiVocabPopupAddRow;
  window["yoshiVocabPopupSave"] = yoshiVocabPopupSave;
  window["yoshiWordClick"] = yoshiWordClick;
  window["yoshiWordPopupClose"] = yoshiWordPopupClose;
} catch(e) {}



function toggleChatHistory() {
  const drawer = document.getElementById('chatHistoryDrawer');
  const btn    = document.getElementById('chatHistoryToggle');
  if (!drawer) return;
  const open = drawer.style.display === 'none';
  drawer.style.display = open ? 'block' : 'none';
  btn.style.color       = open ? 'var(--teal)' : 'var(--ink-light)';
  btn.style.borderColor = open ? 'var(--teal)' : 'var(--border)';
  if (open) buildChatHistoryList();
}

function buildChatHistoryList() {
  const list = document.getElementById('chatHistoryList');
  if (!list) return;
  const msgs = document.querySelectorAll('#chatMessages .chat-msg.user');
  if (!msgs.length) { list.innerHTML = '<div style="font-family:var(--ui);font-size:0.78rem;color:var(--ink-light);padding:8px">No questions yet.</div>'; return; }
  list.innerHTML = '';
  msgs.forEach((msg, i) => {
    const text = msg.textContent.trim().slice(0, 80) + (msg.textContent.length > 80 ? '…' : '');
    const row = document.createElement('div');
    row.style.cssText = 'padding:6px 8px;font-family:var(--ui);font-size:0.82rem;color:var(--ink-light);cursor:pointer;border-radius:4px;transition:background 0.1s';
    row.textContent = (i + 1) + '. ' + text;
    row.onmouseover = () => row.style.background = 'var(--paper)';
    row.onmouseout  = () => row.style.background = 'transparent';
    row.onclick = () => {
      // Find the AI reply after this user message and scroll to top of it
      const allMsgs = [...document.querySelectorAll('#chatMessages .chat-msg')];
      const idx = allMsgs.indexOf(msg);
      const target = allMsgs[idx + 1] || msg;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toggleChatHistory();
    };
    list.appendChild(row);
  });
}


function qrClear() {
  const inp = document.getElementById('qrInput');
  if (inp) inp.value = '';
  qrShowPaste();
  const seg = document.getElementById('qrSegmentBtn');
  if (seg) seg.disabled = true;
  const status = document.getElementById('qrStatus');
  if (status) status.textContent = '';
  const reader = document.getElementById('qrReader');
  if (reader) reader.innerHTML = '';
}

function qrPrintPage() {
  const reader = document.getElementById('qrReader');
  if (!reader || !QuickReadState.segments.length) return;
  
  // Build HTML with ruby text for furigana
  let html = '';
  QuickReadState.segments.forEach(seg => {
    if (seg.reading && seg.reading !== seg.word) {
      html += `<ruby>${seg.word}<rp>(</rp><rt>${seg.reading}</rt><rp>)</rp></ruby>`;
    } else {
      html += seg.word;
    }
  });
  
  // Get print settings
  const fontSize = (App.Storage || window.Storage).getPrintFontSize();
  const lineHeight = (App.Storage || window.Storage).getPrintLineHeight();
  
  // Create or reuse print iframe
  let printFrame = document.getElementById('printFrame');
  if (!printFrame) {
    printFrame = document.createElement('iframe');
    printFrame.id = 'printFrame';
    printFrame.style.cssText = 'position:absolute;left:-9999px;width:800px;height:600px;';
    document.body.appendChild(printFrame);
  }
  
  const doc = printFrame.contentDocument || printFrame.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Japanese Reading</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500&display=swap');
    body {
      font-family: 'Noto Sans JP', sans-serif;
      font-size: ${fontSize}pt;
      line-height: ${lineHeight};
      color: black;
      background: white;
      padding: 40px 60px;
      max-width: 800px;
      margin: 0 auto;
    }
    ruby {
      ruby-align: center;
    }
    rt {
      font-size: 0.5em;
      color: #444;
    }
    @media print {
      body { padding: 20px; }
    }
  </style>
</head>
<body>
  ${html}
</body>
</html>`);
  doc.close();
  
  // Wait for fonts to load then print
  setTimeout(() => {
    printFrame.contentWindow.focus();
    printFrame.contentWindow.print();
  }, 500);
}


// ── App registry — features-tools.js exports ───────────────────────────
Object.assign(App, {
  lessonNotesUpdateDropdown, yoshiRenderRecordingTab, yoshiParseWhatsapp, lnSwitchTab, lnSetDrillMode, lnDrillReveal, lnDrillNext, lnDrillPrev, lnDrillJump, lnRefreshTab, lnOpenStory, lnToggleGrammarHide, lnToggleShowHidden, lnFilterTranscript, lnToggleRecPlayer, lnDeleteRecording, lnNewSession, lnLoadSession, lnDeleteSession, lnCreateFromPaste, lnHandleFile, lnHandleDrop, yoshiSaveWhatsappInline, yoshiRetranscribe, yoshiInitUI, yoshiOpenOverlay, yoshiOpenTeams, yoshiTestChannels, yoshiRunPreflight, mgSelectCat, mgSetPairs, mgSetTimer, mgSetReading, mgStart, mgEnd, mgShowSetup, mgClickKanji, mgClickEmoji,
});
