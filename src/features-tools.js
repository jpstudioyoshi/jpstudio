// ╔══════════════════════════════════════════════════════════════════════════════
// ║ features-tools.js (residual)
// ║ Lesson notes utils, Yoshi panel, recording list, matching pairs,
// ║ Epub reader, Te-form drill, Grammar2 panel, Voice state, LN handlers.
// ╚══════════════════════════════════════════════════════════════════════════════

// ── Render/utility functions (pure DOM or string parsing — not pipeline logic) ─

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

  if (panelEl)  panelEl.innerHTML  = '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light);padding:12px 0">⏳ Sampling audio (4 seconds)…</div>';
  if (statusEl) statusEl.textContent = 'Running preflight…';

  let report;
  try {
    const _pf2 = App.PreflightService || window.PreflightService;
    if (!_pf2) throw new Error('PreflightService not available');
    report = await _pf2.run();
  } catch (e) {
    const msg = 'Preflight error: ' + e.message;
    if (panelEl)  panelEl.innerHTML  = '<div style="font-family:var(--ui);font-size:inherit;color:var(--red,#e05050);padding:12px 0">✗ ' + msg + '</div>';
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
         + '<span style="font-family:var(--ui);font-size:inherit;color:' + color + ';flex-shrink:0;width:16px">' + icon + '</span>'
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

  html += '<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);font-family:var(--ui);font-size:inherit;color:' + statusColor + '">' + statusText + '</div>';
  html += '</div>';
  return html;
}

function _pfShortLabel(label) {
  if (!label) return '—';
  return label.length > 22 ? label.slice(0, 20) + '…' : label;
}

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
  window["setRtkDirection"] = setRtkDirection;
  window["setRtkMode"] = setRtkMode;
  window["setTimesMode"] = setTimesMode;
  window["showBdTab"] = showBdTab;
  window["showGramTab"] = showGramTab;
  window["showGramTabAndHighlight"] = showGramTabAndHighlight;
  window["showPanel"] = showPanel;
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
  window["vcToggleHint"] = vcToggleHint;
  window["vgEnd"] = vgEnd;
  window["vgNext"] = vgNext;
  window["vgSelectCat"] = vgSelectCat;
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
  window["vtCloseVocabList"] = vtCloseVocabList;
  window["vtCueClick"] = vtCueClick;
  window["vtDeleteVocabWord"] = vtDeleteVocabWord;
  window["vtDropZoneClick"] = vtDropZoneClick;
  window["vtFullscreen"] = vtFullscreen;
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


} catch(e) {}



function toggleChatHistory() {
  const drawer = document.getElementById('chatHistoryDrawer');
  const btn    = document.getElementById('chatHistoryToggle');
  if (!drawer) return;
  const open = drawer.style.display === 'none';
  drawer.style.display = open ? 'block' : 'none';
  btn.classList.toggle('toggle-on', open);
  if (open) buildChatHistoryList();
}

function buildChatHistoryList() {
  const list = document.getElementById('chatHistoryList');
  if (!list) return;
  const msgs = document.querySelectorAll('#chatMessages .chat-msg.user');
  if (!msgs.length) { list.innerHTML = '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light);padding:8px">No questions yet.</div>'; return; }
  list.innerHTML = '';
  msgs.forEach((msg, i) => {
    const text = msg.textContent.trim().slice(0, 80) + (msg.textContent.length > 80 ? '…' : '');
    const row = document.createElement('div');
    row.style.cssText = 'padding:6px 8px;font-family:var(--ui);font-size:inherit;color:var(--ink-light);cursor:pointer;border-radius:4px;transition:background 0.1s';
    row.textContent = (i + 1) + '. ' + text;
    row.classList.add('row-hover');
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
  yoshiSaveWhatsappInline, yoshiRetranscribe, yoshiOpenOverlay, yoshiOpenTeams,
  yoshiTestChannels, yoshiRunPreflight,
});
