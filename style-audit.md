# Japanese Studio — Style Audit Reference
Generated: 2026-05-25

## Purpose
Reference for a future thread to standardise all interactive state styles.
Goal: replace ad-hoc inline style manipulation and inconsistent .active classes
with a unified set of CSS utility classes (btn-active, btn-active-gold, etc.)

## Completed
- btn-active / btn-active-gold utility classes added to style.css
- setButtonGroupActive() unified — all button groups now class-based

## Existing CSS state classes (style.css)
81:  nav button.active {
129:  .sidebar button.active {
261:  nav button.active {
324:  .panel.active { display: block; }
427:  .mode-btn.active { background: none; color: var(--teal); border-color: var(--teal); }
650:  .yoshi-session-item.active { border-color:var(--teal);background:rgba(48,213,200,0.07); }
661:  .yoshi-subtab.active { border-color: var(--teal); color: var(--teal); background: rgba(48,213,200,0.07); }
663:  .yoshi-subpanel.active { display: block; }
705:  .vt-cue.active { background:rgba(48,213,200,0.12);border-left:2px solid var(--teal);padding-left:8px; }
713:  .vt-furi-btn.loading { opacity:1;color:var(--gold);border-color:var(--gold);animation:pulse-border 1s infinite; }
718:  .comp-line.active { opacity:1; }
747:  .yoshi-read-btn.active { border-color:var(--teal);color:var(--teal);background:rgba(48,213,200,0.08); }
781:  .yoshi-loop-btn.active { color:var(--teal); border-color:var(--teal); }
834:  .kanji-btn.loading { opacity:0.5;pointer-events:none; }
1206:  .topic-chip.active { background: none; color: var(--teal); border-color: var(--teal); }
1253:  .gramnote-tab.active { color: var(--paper); background: var(--ink); border-bottom-color: transparent; }
1263:  .vc-filter-btn.active { color: var(--paper); background: var(--ink); border-radius: 4px; }
1271:  .vc-sort-btn.active { color: var(--paper); background: var(--ink); border-color: var(--ink); }
1278:  .gramnote-section.active { display: block; }
1386:  .trans-dir-btn.active { color: var(--ink); border-bottom-color: var(--red); }
1418:  .trans-output.loading-pulse { animation: textpulse 1.2s ease-in-out infinite; }
1471:  .trans-breakdown-tab.active { color: var(--ink); border-bottom-color: var(--teal); }
1703:  .listen-track.active { background: var(--paper-mid); color: var(--ink); }
1749:  .listen-speed-btn.active { background: none; color: var(--teal); border-color: var(--teal); font-weight: 600; }
1828:  #dictModeBtn.active {
1871:  .loading { opacity: 0.6; pointer-events: none; }
1916:  .ctr-tab.active { border-color: var(--teal); color: var(--teal); }
1923:  .ctr-group-btn.active { border-color: var(--teal); color: var(--teal); background: rgba(48,213,200,0.08); font-weight: 500; }
2016:  .listen-mode-toggle.active { border-color: var(--teal); color: var(--teal); background: rgba(48,213,200,0.08); }
2214:  .vg-cat-btn.selected { border-color: var(--gold); background: rgba(212,160,23,.13); }
2222:  .vg-time-btn:hover, .vg-time-btn.selected { border-color: var(--gold); background: rgba(212,160,23,.1); }
2252:  .vg-card.active {
2396:  .te-group-btn.active { border-color: var(--teal); color: var(--teal); background: rgba(48,213,200,0.08); }
2426:  body:has(#panel-video.vt-fullscreen) .sidebar button.active {
2449:  body:has(#panel-video.vt-fullscreen) nav button.active {
2625:  #panel-video.vt-fullscreen.vt-dictation-active .vt-cue.active .vt-cue-text {
2646:.btn-kana.active-hira, .btn-active { border-color: var(--teal); color: var(--teal); background: rgba(48,213,200,0.12); font-weight: 600; }
2647:.btn-kana.active-kata, .btn-active-gold { border-color: var(--gold); color: var(--gold); background: rgba(255,193,7,0.12); font-weight: 600; }


## All JS state style manipulations (451 instances)
Categorised work needed:
- Lines with style.color / style.borderColor → migrate to btn-active classes
- Lines with classList.add/remove('active') → ensure .active CSS rule is consistent

index.html:1310:            <button class="btn-ghost" onclick="transSpeakOutput()" onmouseover="this.style.borderColor='var(--teal)';this.style.color='var(--teal)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--ink-light)'">🔊 Hear</button>
index.html:1311:            <button class="btn-ghost" id="transAddVocabBtn" onclick="transAddToVocab()" onmouseover="this.style.borderColor='var(--teal)';this.style.color='var(--teal)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--ink-light)'">+ vocab</button>
index.html:1457:        ondragover="event.preventDefault();this.style.borderColor='var(--teal)'"
index.html:1458:        ondragleave="this.style.borderColor='var(--border)'"
index.html:1732:         ondragover="event.preventDefault();this.classList.add('drag-over')"
index.html:1733:         ondragleave="this.classList.remove('drag-over')"
index.html:2045:            onmouseover="this.style.borderColor='var(--gold)'"
index.html:2046:            onmouseout="this.style.borderColor='var(--border)'"
index.html:2220:      ondragover="event.preventDefault();this.classList.add('vt-drag-over')"
index.html:2221:      ondragleave="this.classList.remove('vt-drag-over')"
index.html:2222:      ondrop="event.preventDefault();this.classList.remove('vt-drag-over');vtHandleDrop(event)"
index.html:2256:          ondragover="event.preventDefault();this.style.borderColor='var(--teal)'"
index.html:2257:          ondragleave="this.style.borderColor=''"
index.html:2258:          ondrop="this.style.borderColor='';vtHandleDrop(event)">
index.html:2293:          ondragover="event.preventDefault();this.style.borderColor='var(--teal)'"
index.html:2294:          ondragleave="this.style.borderColor=''"
index.html:2295:          ondrop="this.style.borderColor='';vtHandleDrop(event)"
index.html:357:        onmouseover="this.style.borderColor='var(--teal)';this.style.color='var(--teal)'"
index.html:358:        onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--ink-light)'">
src/core-anki.js:346:  btn.style.color = AnkiState.direction === 'jp-en' ? 'var(--ink-light)' : 'var(--teal)';
src/core-anki.js:347:  btn.style.borderColor = AnkiState.direction === 'jp-en' ? 'var(--border)' : 'var(--teal)';
src/core-anki.js:47:  dot.style.background = 'var(--gold)';
src/core-anki.js:54:    dot.style.background = 'var(--teal)';
src/core-anki.js:64:    dot.style.background = 'var(--red)';
src/core-counters.js:506:    btn.style.color = 'var(--teal)';
src/core-counters.js:510:    btn.style.color = 'var(--gold)';
src/core-counters.js:514:    btn.style.color = '';
src/core-foundation.js:1541:    if (btn) btn.classList.toggle('active', s === name);
src/core-foundation.js:1560:    videoPanel.classList.remove('vt-fullscreen');
src/core-foundation.js:1565:  document.querySelectorAll('nav button, .sidebar button').forEach(b => b.classList.remove('active'));
src/core-foundation.js:1568:  panel.classList.add('active');
src/core-foundation.js:1571:  if (btn) btn.classList.add('active');
src/core-foundation.js:1667:    el.style.color = key === tab ? 'var(--ink)' : 'var(--ink-light)';
src/core-foundation.js:1839:      btn.classList.remove('active-hira', 'active-kata');
src/core-foundation.js:1840:      btn.style.color = '';
src/core-foundation.js:1841:      btn.style.borderColor = '';
src/core-foundation.js:1844:        if (activeCol.includes('gold')) btn.classList.add('active-kata');
src/core-foundation.js:1845:        else btn.classList.add('active-hira');
src/core-foundation.js:1849:      btn.classList.remove('btn-active', 'btn-active-gold');
src/core-foundation.js:1850:      btn.style.color = '';
src/core-foundation.js:1851:      btn.style.borderColor = '';
src/core-foundation.js:1854:        if (activeCol.includes('gold')) btn.classList.add('btn-active-gold');
src/core-foundation.js:1855:        else btn.classList.add('btn-active');
src/core-foundation.js:330:  if (document.getElementById('panel-gramnotes')?.classList.contains('panel-active')) {
src/core-foundation.js:334:  if (document.getElementById('panel-vocab-corpus')?.classList.contains('active')) {
src/core-kana-drill.js:468:      btn.style.borderColor = 'var(--teal)';
src/core-kana-drill.js:469:      btn.style.background = 'rgba(48,213,200,0.15)';
src/core-kana-drill.js:471:      btn.style.borderColor = 'var(--red)';
src/core-kana-drill.js:472:      btn.style.background = 'rgba(255,107,107,0.15)';
src/core-kana-drill.js:487:    charEl.classList.add('correct');
src/core-kana-drill.js:497:    charEl.classList.add('wrong');
src/core-kana-drill.js:544:    document.querySelectorAll('#panel-kana .mode-btn').forEach(b => b.classList.toggle('active', b.getAttribute('onclick').includes("'strokes'")));
src/core-kana-drill.js:581:    b.classList.toggle('active', b.getAttribute('onclick').includes("'" + mode + "'"));
src/core-kana.js:437:    btn.style.borderColor = 'var(--border)';
src/core-kana.js:438:    btn.style.background = 'none';
src/core-kana.js:481:  document.getElementById('drillChar').classList.add('wrong');
src/core-kana.js:561:    charEl.classList.add('correct');
src/core-kana.js:574:    charEl.classList.add('wrong');
src/core-listen.js:1016:    btn.style.background  = '';
src/core-listen.js:1017:    btn.style.color       = 'var(--teal)';
src/core-listen.js:1018:    btn.style.borderColor = 'var(--teal)';
src/core-listen.js:1061:  fbEl.style.borderColor = 'var(--border)';
src/core-listen.js:1062:  fbEl.style.color       = 'var(--ink)';
src/core-listen.js:1087:    fbEl.style.borderColor = isCorrect ? 'var(--teal)' : 'var(--gold)';
src/core-listen.js:1088:    fbEl.style.color       = 'var(--ink)';
src/core-listen.js:1174:    el.classList.add('dict-playing');
src/core-listen.js:1177:    if (ta) { ta.classList.remove('dict-active-typing'); ta.classList.add('dict-active-playing'); }
src/core-listen.js:1179:    el.classList.add('dict-paused');
src/core-listen.js:1221:      btn.style.background = 'var(--teal)';
src/core-listen.js:1222:      btn.style.color = 'var(--paper)';
src/core-listen.js:1223:      btn.style.borderColor = 'var(--teal)';
src/core-listen.js:1246:      btn.style.background = '';
src/core-listen.js:1247:      btn.style.color = 'var(--teal)';
src/core-listen.js:1248:      btn.style.borderColor = 'var(--teal)';
src/core-listen.js:1470:      singleBtn.style.borderColor = 'var(--teal)';
src/core-listen.js:1471:      singleBtn.style.color = 'var(--teal)';
src/core-listen.js:1472:      segBtn.style.borderColor = 'var(--border)';
src/core-listen.js:1473:      segBtn.style.color = 'var(--ink-light)';
src/core-listen.js:1475:      segBtn.style.borderColor = 'var(--teal)';
src/core-listen.js:1476:      segBtn.style.color = 'var(--teal)';
src/core-listen.js:1477:      singleBtn.style.borderColor = 'var(--border)';
src/core-listen.js:1478:      singleBtn.style.color = 'var(--ink-light)';
src/core-listen.js:1529:  if (target) target.style.borderColor = 'var(--teal)';
src/core-listen.js:1550:    el.style.borderColor = 'var(--border)';
src/core-listen.js:1562:    btn.style.background = 'var(--red)';
src/core-listen.js:1602:    btn.style.background = 'var(--red)';
src/core-listen.js:166:  document.getElementById('listenDropzone').classList.remove('drag-over');
src/core-listen.js:1821:  btn.style.background = 'var(--red)'; btn.style.color = 'var(--paper)';
src/core-listen.js:1822:  setTimeout(() => { btn.style.background = ''; btn.style.color = 'var(--red)'; }, 400);
src/core-listen.js:2020:      if (btn) { btn.style.background = ''; btn.style.color = 'var(--teal)'; }
src/core-listen.js:2057:    if (btn) { btn.style.background = 'var(--teal)'; btn.style.color = 'var(--paper)'; }
src/core-listen.js:2178:    if (btn)   { btn.style.background = ''; btn.style.color = 'var(--teal)'; }
src/core-listen.js:580:  btn.style.background = '';
src/core-listen.js:581:  btn.style.color = 'var(--gold)';
src/core-listen.js:582:  btn.style.borderColor = 'var(--gold)';
src/core-listen.js:586:    btn.style.background = 'rgba(212,160,23,0.15)';
src/core-listen.js:587:    btn.style.color = 'var(--gold)';
src/core-listen.js:588:    btn.style.borderColor = 'var(--gold)';
src/core-listen.js:595:    btn.style.background = 'rgba(212,160,23,0.15)';
src/core-listen.js:596:    btn.style.color = 'var(--gold)';
src/core-listen.js:597:    btn.style.borderColor = 'var(--gold)';
src/core-listen.js:604:    btn.style.background = 'var(--gold)';
src/core-listen.js:605:    btn.style.color = 'var(--paper)';
src/core-listen.js:606:    btn.style.borderColor = 'var(--gold)';
src/core-listen.js:613:    btn.style.background = '';
src/core-listen.js:614:    btn.style.color = 'var(--gold)';
src/core-listen.js:615:    btn.style.borderColor = 'var(--gold)';
src/core-listen.js:637:  canvas.style.borderColor = 'var(--teal)';
src/core-listen.js:638:  setTimeout(() => { canvas.style.borderColor = ''; }, 150);
src/core-listen.js:995:    btn.style.background  = 'var(--teal)';
src/core-listen.js:996:    btn.style.color       = 'var(--paper)';
src/core-listen.js:997:    btn.style.borderColor = 'var(--teal)';
src/core-stt.js:103:    btn.classList.add('listening');
src/core-stt.js:109:    btn.classList.remove('listening');
src/core-stt.js:320:  document.querySelectorAll('.trans-breakdown-tab').forEach((b, i) => b.classList.toggle('active', i === 0));
src/core-stt.js:349:  romajiBtn.style.color = '';
src/core-stt.js:350:  romajiBtn.style.borderColor = '';
src/core-stt.js:415:    outEl.classList.remove('loading-pulse');
src/core-stt.js:514:    outEl.classList.remove('loading-pulse');
src/core-stt.js:526:  document.querySelectorAll('.trans-breakdown-tab').forEach(b => b.classList.remove('active'));
src/core-stt.js:528:  btn.classList.add('active');
src/core-stt.js:538:    sessionTab.classList.add('active');
src/core-stt.js:563:    tabEl.style.borderColor = 'var(--gold)';
src/core-stt.js:564:    tabEl.style.color = 'var(--gold)';
src/core-vocab.js:252:      vocabCardEl.classList.remove('flipped');
src/core-vocab.js:275:    vocabCardEl.classList.remove('flipped');
src/core-vocab.js:302:                 vcJp.style.color   = enJp ? 'var(--ink)' : ''; }
src/core-vocab.js:310:  vocabCardEl.classList.remove('flipped');
src/core-vocab.js:343:  document.getElementById('vocabCard').classList.toggle('flipped', vocabFlipped);
src/core-vocab.js:397:      onmouseover="this.style.background='var(--paper-mid)'" onmouseout="this.style.background='${inSession && !sessionKnown ? 'var(--paper-dark)' : ''}'">
src/core-vocab.js:619:    delBtn.style.color = 'var(--ink-light)';
src/core-vocab.js:625:      if (aiIdx > 0 && allMsgs[aiIdx-1].classList.contains('user')) allMsgs[aiIdx-1].remove();
src/core-vocab.js:768:    b.style.background = ''; b.style.color = ''; b.style.border = '1px solid var(--border)';
src/core-vocab.js:770:  if (btn) { btn.style.background = 'var(--teal)'; btn.style.color = 'var(--paper)'; btn.style.border = 'none'; }
src/core-vocab.js:777:    b.style.background = ''; b.style.color = 'var(--ink-light)'; b.style.border = '1px solid var(--border)';
src/core-vocab.js:779:  if (btn) { btn.style.background = 'var(--teal)'; btn.style.color = 'var(--paper)'; btn.style.border = 'none'; }
src/core-vocab.js:787:  document.getElementById('kanjiViewList').style.background  = v === 'list' ? 'var(--teal)' : 'none';
src/core-vocab.js:788:  document.getElementById('kanjiViewList').style.color       = v === 'list' ? 'var(--paper)' : 'var(--ink-light)';
src/core-vocab.js:989:  document.querySelectorAll('.vc-filter-btn').forEach(b => b.classList.remove('active'));
src/core-vocab.js:990:  if (btn) btn.classList.add('active');
src/core-vocab.js:996:  document.querySelectorAll('.vc-sort-btn').forEach(b => b.classList.remove('active'));
src/core-vocab.js:997:  if (btn) btn.classList.add('active');
src/core-writing.js:250:  if (_hdr) { _hdr.classList.add('checking'); setTimeout(() => _hdr.classList.remove('checking'), 2000); }
src/core-writing.js:400:  this.classList.add('dragging');
src/core-writing.js:408:  if (this !== AppState.wbDragEl) this.classList.add('drag-over');
src/core-writing.js:411:  this.classList.remove('drag-over');
src/core-writing.js:416:  this.classList.remove('drag-over');
src/core-writing.js:431:  if (AppState.wbDragEl) AppState.wbDragEl.classList.remove('dragging');
src/core-writing.js:432:  document.querySelectorAll('.wb-item').forEach(el => el.classList.remove('drag-over'));
src/core-writing.js:446:    btn.classList.add('copied');
src/core-writing.js:456:    el.classList.add('fe-collapsed');
src/core-writing.js:477:        class="fe-del" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--ink-light)'">✕</button>
src/core-writing.js:500:  const collapsed = el.classList.toggle('fe-collapsed');
src/core-writing.js:505:  if (!collapsed) el.classList.remove('fe-current');
src/core-writing.js:558:            onmouseover="this.style.borderColor='var(--teal)';this.style.color='var(--teal)'"
src/core-writing.js:559:            onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--ink-light)'">⎘ Copy</button>
src/core-writing.js:561:            onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--ink-light)'">✕</button>
src/core-writing.js:577:    btn.style.color = 'var(--teal)';
src/core-writing.js:578:    btn.style.borderColor = 'var(--teal)';
src/core-writing.js:581:      btn.style.color = 'var(--ink-light)';
src/core-writing.js:582:      btn.style.borderColor = 'var(--border)';
src/core.js:143:  document.querySelectorAll('.gramnote-tab').forEach(b => b.classList.remove('active'));
src/core.js:144:  if (btn) btn.classList.add('active');
src/core.js:207:  if (toBtn) { toBtn.style.background='var(--teal)'; setTimeout(()=>{toBtn.style.background='';},600); }
src/core.js:214:  entryEl.classList.add('editing');
src/core.js:310:  document.querySelectorAll('.gramnote-tab').forEach(b => b.classList.remove('active'));
src/core.js:311:  document.querySelectorAll('.gramnote-section').forEach(s => s.classList.remove('active'));
src/core.js:312:  if (btn) btn.classList.add('active');
src/core.js:314:  if (section) section.classList.add('active');
src/core.js:404:    b.style.borderColor = 'var(--teal)';
src/core.js:405:    b.style.color = 'var(--teal)';
src/features-core.js:532:    btn.style.borderColor = isHidden ? 'var(--teal)' : '';
src/features-core.js:533:    btn.style.color       = isHidden ? 'var(--teal)' : 'var(--ink-light)';
src/features-core.js:539:    status.style.color = _getApiKey?.() ? 'var(--teal)' : 'var(--red)';
src/features-core.js:555:  if (btn) btn.classList.add('speaking');
src/features-core.js:587:  if (toggle) toggle.classList.toggle('active', conjListenMode);
src/features-custom-drill.js:519:      scoreEl.style.color = score >= 0.85 ? 'var(--teal)' : score >= 0.55 ? 'var(--gold)' : 'var(--red)';
src/features-grammar.js:1003:  document.querySelectorAll('.te-group-btn').forEach(b => b.classList.remove('active'));
src/features-grammar.js:1004:  document.querySelector(`.te-group-btn[data-group="${group}"]`).classList.add('active');
src/features-grammar.js:1774:    if (btn) btn.classList.toggle('active', s === name);
src/features-grammar.js:181:  layout.classList.add('drill-mode');
src/features-grammar.js:192:  layout.classList.remove('drill-mode');
src/features-grammar.js:209:  const open = hint.classList.toggle('show');
src/features-grammar.js:215:  const open = hint.classList.toggle('show');
src/features-grammar.js:399:    btn.style.color = GramSentState.autoMode ? 'var(--teal)' : '';
src/features-grammar.js:428:  document.querySelectorAll('#gramSentWeakPoints button').forEach(b => b.style.borderColor = '');
src/features-grammar.js:429:  btn.style.borderColor = 'var(--teal)';
src/features-grammar.js:574:  const open = hint.classList.toggle('show');
src/features-grammar.js:975:  if (modeBtn) modeBtn.classList.add('active');
src/features-kana.js:411:    btn.classList.add('on');
src/features-kana.js:420:    btn.classList.add('on');
src/features-kana.js:421:    btn.style.borderColor = 'var(--gold)';
src/features-kana.js:422:    btn.style.color = 'var(--gold)';
src/features-kana.js:428:    btn.classList.remove('on');
src/features-kana.js:429:    btn.style.borderColor = '';
src/features-kana.js:430:    btn.style.color = '';
src/features-kana.js:459:    romajiBtn.style.borderColor = 'var(--teal)';
src/features-kana.js:460:    romajiBtn.style.color = 'var(--teal)';
src/features-kana.js:461:    kanaBtn.style.borderColor = '';
src/features-kana.js:462:    kanaBtn.style.color = '';
src/features-kana.js:479:    romajiBtn.style.borderColor = '';
src/features-kana.js:480:    romajiBtn.style.color = '';
src/features-kana.js:487:      kanaBtn.style.borderColor = 'var(--teal)';
src/features-kana.js:488:      kanaBtn.style.color = 'var(--teal)';
src/features-kana.js:494:      kanaBtn.style.borderColor = 'var(--gold)';
src/features-kana.js:495:      kanaBtn.style.color = 'var(--gold)';
src/features-kana.js:537:    items.forEach((it, i) => it.classList.toggle('focused', i === focusedIdx));
src/features-kana.js:797:  btn.classList.add('loading');
src/features-kana.js:836:    btn.classList.remove('loading');
src/features-lesson-notes.js:1042:          onmouseover="this.style.borderColor='var(--teal)'"
src/features-lesson-notes.js:1043:          onmouseout="this.style.borderColor='var(--border)'">
src/features-lesson-notes.js:119:  document.querySelectorAll('.yoshi-session-item').forEach(el => el.classList.remove('active'));
src/features-lesson-notes.js:1389:    if (document.getElementById('panel-gramnotes')?.classList.contains('panel-active') ||
src/features-lesson-notes.js:233:        ondragover="event.preventDefault();this.style.borderColor='var(--teal)';this.style.background='rgba(48,213,200,0.05)'"
src/features-lesson-notes.js:234:        ondragleave="this.style.borderColor='var(--field-border)';this.style.background='none'"
src/features-lesson-notes.js:2504:        btn.style.background = 'var(--red)';
src/features-lesson-notes.js:2506:        btn.style.borderColor = 'var(--red)';
src/features-lesson-notes.js:307:  event.target.style.borderColor = 'var(--field-border)';
src/features-lesson-notes.js:308:  event.target.style.background = 'none';
src/features-lesson-notes.js:494:    info.onmouseover = function() { row.style.background = 'var(--paper-dark)'; };
src/features-lesson-notes.js:495:    info.onmouseout  = function() { row.style.background = ''; };
src/features-lesson-notes.js:704:      row.onmouseover = function() { row.style.background = 'var(--paper-dark)'; };
src/features-lesson-notes.js:705:      row.onmouseout  = function() { row.style.background = ''; };
src/features-lesson-notes.js:734:  if (audioBtn) audioBtn.classList.toggle('active', mode === 'audio');
src/features-lesson-notes.js:804:      row.onmouseover = function() { row.style.background = 'var(--paper-dark)'; };
src/features-lesson-notes.js:805:      row.onmouseout  = function() { row.style.background = ''; };
src/features-lesson-notes.js:950:      ondragover="event.preventDefault();this.style.borderColor='var(--teal)';this.style.background='rgba(48,213,200,0.05)'"
src/features-lesson-notes.js:951:      ondragleave="this.style.borderColor='var(--field-border)';this.style.background='none'"
src/features-ln-p2.js:1220:    dropZone.style.borderColor = 'var(--field-border)';
src/features-ln-p2.js:1221:    dropZone.style.background = 'none';
src/features-ln-p2.js:1490:        el.classList.add('active');
src/features-ln-p2.js:1845:      row.style.background = 'rgba(255,214,10,0.03)';
src/features-ln-p2.js:315:      btn.style.color = 'var(--teal)';
src/features-ln-p2.js:318:        btn.style.color = '';
src/features-ln-p2.js:330:      btn.style.color = 'var(--teal)';
src/features-ln-p2.js:331:      btn.style.borderColor = 'var(--teal)';
src/features-ln-p2.js:332:      btn.classList.add('active');
src/features-ln-p2.js:334:      btn.style.color = '';
src/features-ln-p2.js:335:      btn.style.borderColor = '';
src/features-ln-p2.js:336:      btn.classList.remove('active');
src/features-ln-p2.js:353:      btn.style.color = '';
src/features-ln-p2.js:354:      btn.style.borderColor = '';
src/features-ln-p2.js:362:        btn.style.color = 'var(--red)';
src/features-ln-p2.js:363:        btn.style.borderColor = 'var(--red)';
src/features-ln-p2.js:369:        if (btn) { btn.innerHTML = '🔊 Read'; btn.style.color = ''; btn.style.borderColor = ''; }
src/features-ln-p2.js:928:      ondragover="event.preventDefault();this.style.borderColor='var(--teal)';this.style.background='rgba(48,213,200,0.05)'"
src/features-ln-p2.js:929:      ondragleave="this.style.borderColor='var(--field-border)';this.style.background='none'"
src/features-pictures.js:285:  btn.closest('.vg-time-btns').querySelectorAll('.vg-time-btn').forEach(b => b.classList.remove('selected'));
src/features-pictures.js:286:  btn.classList.add('selected');
src/features-pictures.js:291:  btn.closest('.vg-time-btns').querySelectorAll('.vg-time-btn').forEach(b => b.classList.remove('selected'));
src/features-pictures.js:292:  btn.classList.add('selected');
src/features-pictures.js:297:  btn.closest('.vg-time-btns').querySelectorAll('.vg-time-btn').forEach(b => b.classList.remove('selected'));
src/features-pictures.js:298:  btn.classList.add('selected');
src/features-pictures.js:304:  document.querySelectorAll('.vg-cat-btn').forEach(b => b.classList.remove('selected'));
src/features-pictures.js:305:  btn.classList.add('selected');
src/features-pictures.js:368:    el.classList.remove('active','correct','skipped');
src/features-pictures.js:370:    if (lbl) lbl.classList.remove('vg-label-hidden');
src/features-pictures.js:375:    card.classList.add('active');
src/features-pictures.js:378:      if (lbl) lbl.classList.add('vg-label-hidden');
src/features-pictures.js:382:        if (lbl) lbl.classList.add('vg-label-hidden');
src/features-pictures.js:445:      card.classList.remove('active');
src/features-pictures.js:446:      card.classList.add('correct');
src/features-pictures.js:471:        card.classList.remove('active');
src/features-pictures.js:472:        card.classList.add('skipped');
src/features-pictures.js:489:    card.classList.remove('active');
src/features-pictures.js:490:    card.classList.add('skipped');
src/features-progress.js:1238:        + 'onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" '
src/features-progress.js:1239:        + 'onmouseout="this.style.background=\'none\'">'
src/features-progress.js:1481:    wtBtn.style.color = tab === 'weights' ? 'var(--ink)' : 'var(--ink-light)';
src/features-progress.js:89:  el.style.color = msg.startsWith('✓') ? 'var(--teal)' : 'var(--red)';
src/features-reading.js:1231:    panel.classList.add('vt-fullscreen');
src/features-reading.js:1241:  panel.classList.remove('vt-fullscreen');
src/features-reading.js:1276:    panel.classList.add('vt-fullscreen');
src/features-reading.js:1278:    panel.classList.remove('vt-fullscreen');
src/features-reading.js:1286:    fsBtn.style.color = isFs ? 'var(--teal)' : 'var(--ink-light)';
src/features-reading.js:1287:    fsBtn.style.borderColor = isFs ? 'var(--teal)' : 'var(--border)';
src/features-reading.js:1362:      furiBtn.classList.toggle('active', QuickReadState.furiOn);
src/features-reading.js:1363:      furiBtn.style.color = QuickReadState.furiOn ? 'var(--teal)' : '';
src/features-reading.js:149:  btn.classList.toggle('active', QuickReadState.plainOn);
src/features-reading.js:150:  btn.style.color = QuickReadState.plainOn ? 'var(--teal)' : '';
src/features-reading.js:151:  btn.style.borderColor = QuickReadState.plainOn ? 'var(--teal)' : '';
src/features-reading.js:165:  btn.classList.toggle('active', QuickReadState.furiOn);
src/features-reading.js:166:  btn.style.color = QuickReadState.furiOn ? 'var(--teal)' : '';
src/features-reading.js:167:  btn.style.borderColor = QuickReadState.furiOn ? 'var(--teal)' : '';
src/features-reading.js:242:    if (plainBtn) { plainBtn.classList.remove('active'); plainBtn.style.color=''; plainBtn.style.borderColor=''; }
src/features-reading.js:244:    furiBtn.classList.add('active');
src/features-reading.js:245:    furiBtn.style.color = 'var(--teal)';
src/features-reading.js:246:    furiBtn.style.borderColor = 'var(--teal)';
src/features-reading.js:278:    sepBtn.classList.toggle('active', sep);
src/features-reading.js:279:    sepBtn.style.color = sep ? 'var(--teal)' : '';
src/features-reading.js:280:    sepBtn.style.borderColor = sep ? 'var(--teal)' : '';
src/features-reading.js:315:  if (el.classList.contains('qr-active')) { qrClosePopup(); return; }
src/features-reading.js:317:  el.classList.add('qr-active');
src/features-reading.js:396:  btn.closest('.vg-time-btns').querySelectorAll('.vg-time-btn').forEach(b => b.classList.remove('selected'));
src/features-reading.js:397:  btn.classList.add('selected');
src/features-reading.js:695:    btn.style.borderColor = '';
src/features-reading.js:696:    btn.style.color = '';
src/features-reading.js:719:    btn.style.borderColor = 'var(--teal)';
src/features-reading.js:720:    btn.style.color = 'var(--teal)';
src/features-reading.js:798:      el.classList.add('qr-sentence-active');
src/features-reading.js:817:    el.classList.remove('qr-sentence-active');
src/features-reading.js:846:      btn.style.borderColor = 'var(--teal)';
src/features-reading.js:847:      btn.style.color = 'var(--teal)';
src/features-reading.js:849:      btn.style.borderColor = 'var(--border)';
src/features-reading.js:850:      btn.style.color = 'var(--ink-light)';
src/features-reading.js:952:    btn.style.background = 'var(--red)';
src/features-reading.js:990:    btn.style.background = 'var(--teal)';
src/features-stroke.js:176:    t.style.borderColor = i === idx ? 'var(--teal)' : 'var(--border)';
src/features-stroke.js:177:    t.style.background  = '#111';
src/features-stroke.js:232:    animModeLbl.style.color  = 'var(--teal)';
src/features-stroke.js:233:    clickModeLbl.style.color = 'var(--ink-light)';
src/features-stroke.js:237:    clickModeLbl.style.color = 'var(--teal)';
src/features-stroke.js:238:    animModeLbl.style.color  = 'var(--ink-light)';
src/features-stroke.js:319:        showBtn.style.background = 'var(--gold)';
src/features-stroke.js:320:        showBtn.style.color = '#1c1c1e';
src/features-stroke.js:328:        showBtn.style.background = 'none';
src/features-stroke.js:329:        showBtn.style.color = 'var(--gold)';
src/features-times.js:123:  document.getElementById('TimesState.blitzBar').style.background = 'var(--teal)';
src/features-times.js:131:    if (TimesState.blitzLeft <= 10) bar.style.background = 'var(--red)';
src/features-times.js:132:    else if (TimesState.blitzLeft <= 20) bar.style.background = 'var(--gold)';
src/features-times.js:163:  document.querySelectorAll('.td-mode-btn').forEach(b => b.classList.remove('td-mode-active'));
src/features-times.js:164:  if (ev) ev.currentTarget.classList.add('td-mode-active');
src/features-times.js:240:  document.getElementById('tdTimerBar').style.background = 'var(--teal)';
src/features-times.js:321:      rev.style.borderColor = 'var(--teal)';
src/features-times.js:322:      rev.style.color = 'var(--teal)';
src/features-times.js:323:      rev.style.background = 'rgba(74,149,149,0.08)';
src/features-times.js:331:    btn.classList.add('wrong');
src/features-times.js:363:  bar.style.background = 'var(--teal)';
src/features-times.js:373:    if (pct < 30) bar.style.background = 'var(--red)';
src/features-times.js:374:    else if (pct < 60) bar.style.background = 'var(--gold)';
src/features-times.js:400:  rev.style.borderColor = 'var(--red)';
src/features-times.js:401:  rev.style.color = 'var(--red)';
src/features-times.js:402:  rev.style.background = 'rgba(180,60,60,0.07)';
src/features-times.js:93:  btn.style.borderColor    = TimesState.blitz ? 'var(--gold)' : 'var(--border)';
src/features-times.js:94:  btn.style.color          = TimesState.blitz ? 'var(--gold)'  : 'var(--ink-light)';
src/features-times.js:95:  btn.style.background     = TimesState.blitz ? 'rgba(200,169,81,0.10)' : 'none';
src/features-tools.js:1002:  el.style.color = MatchingPairsState.secsLeft <= 10 ? 'var(--red)' : MatchingPairsState.secsLeft <= 30 ? 'var(--gold)' : 'var(--ink-light)';
src/features-tools.js:1008:  document.querySelectorAll('.mg-kanji-tile.mg-selected').forEach(el => el.classList.remove('mg-selected'));
src/features-tools.js:1010:  document.querySelector('.mg-kanji-tile[data-id="' + id + '"]')?.classList.add('mg-selected');
src/features-tools.js:1016:  document.querySelectorAll('.mg-emoji-tile.mg-selected').forEach(el => el.classList.remove('mg-selected'));
src/features-tools.js:1018:  document.querySelector('.mg-emoji-tile[data-id="' + id + '"]')?.classList.add('mg-selected');
src/features-tools.js:1033:    if (kEl) { kEl.classList.remove('mg-selected'); kEl.classList.add('mg-matched'); }
src/features-tools.js:1034:    if (eEl) { eEl.classList.remove('mg-selected'); eEl.classList.add('mg-matched'); }
src/features-tools.js:1042:    [kEl, eEl].forEach(el => { if (el) { el.classList.add('mg-wrong'); setTimeout(() => { el.classList.remove('mg-wrong', 'mg-selected'); }, 600); } });
src/features-tools.js:1164:  btn.style.color       = open ? 'var(--teal)' : 'var(--ink-light)';
src/features-tools.js:1165:  btn.style.borderColor = open ? 'var(--teal)' : 'var(--border)';
src/features-tools.js:1180:    row.onmouseover = () => row.style.background = 'var(--paper)';
src/features-tools.js:1181:    row.onmouseout  = () => row.style.background = 'transparent';
src/features-tools.js:136:  if (btn && btn.style.color === 'var(--teal)') {
src/features-tools.js:590:  resultEl.style.color = 'var(--ink-light)';
src/features-tools.js:607:    resultEl.style.color = 'var(--red, #e05050)';
src/features-tools.js:641:    el.style.color = 'var(--teal)';
src/features-tools.js:648:    el.style.color = report.errors.length ? 'var(--red, #e05050)' : 'var(--gold)';
src/features-tools.js:65:    b.style.borderColor = ''; b.style.color = '';
src/features-tools.js:68:  if (btn) { btn.style.borderColor = 'var(--teal)'; btn.style.color = 'var(--teal)'; }
src/features-tools.js:912:  btn.classList.add('selected');
src/features-tools.js:916:  btn.closest('.vg-time-btns').querySelectorAll('.vg-time-btn').forEach(b => b.classList.remove('selected'));
src/features-tools.js:917:  btn.classList.add('selected');
src/features-tools.js:921:  btn.closest('.vg-time-btns').querySelectorAll('.vg-time-btn').forEach(b => b.classList.remove('selected'));
src/features-tools.js:922:  btn.classList.add('selected');
src/features-tools.js:926:  btn.closest('.vg-time-btns').querySelectorAll('.vg-time-btn').forEach(b => b.classList.remove('selected'));
src/features-tools.js:927:  btn.classList.add('selected');
src/features-video.js:1094:      el.classList.toggle('active', i === VideoState.activeIdx);
src/features-video.js:1174:    btn.style.background = 'rgba(255,184,0,0.15)';
src/features-video.js:1175:    btn.style.borderColor = 'var(--gold)';
src/features-video.js:1176:    btn.style.color = 'var(--gold)';
src/features-video.js:1226:    btn.style.background = '';
src/features-video.js:1227:    btn.style.borderColor = '';
src/features-video.js:1228:    btn.style.color = 'var(--ink-light)';
src/features-video.js:1363:      shadowHeader.style.borderColor = 'var(--red)';
src/features-video.js:1364:      shadowHeader.style.background = 'rgba(255,107,107,0.08)';
src/features-video.js:1366:    videoPanel.classList.add('vt-shadow-active');
src/features-video.js:1376:      shadowHeader.style.borderColor = '';
src/features-video.js:1377:      shadowHeader.style.background = '';
src/features-video.js:1379:    videoPanel.classList.remove('vt-shadow-active');
src/features-video.js:1517:      document.getElementById('vtShRecordBtn').style.background = 'var(--red)';
src/features-video.js:1522:    document.getElementById('vtShRecordBtn').style.background = '#a00';
src/features-video.js:2584:      t.style.color = 'var(--ink-light)';
src/features-video.js:2591:    if (te) { te.style.borderBottomColor = 'var(--teal)'; te.style.color = 'var(--ink)'; }
src/features-video.js:2594:    if (tq) { tq.style.borderBottomColor = 'var(--teal)'; tq.style.color = 'var(--ink)'; }
src/features-video.js:2614:  document.getElementById('epubDropZone').style.borderColor = 'var(--border)';
src/features-video.js:2621:  dz.style.borderColor = 'var(--teal)';
src/features-video.js:2641:    dz.style.borderColor = 'var(--border)';
src/features-video.js:278:    const wasActive = el.classList.contains('active');
src/features-video.js:279:    el.classList.toggle('active', i === activeIdx);
src/features-video.js:2801:  if (btn) { btn.style.borderColor = EpubState.furi ? 'var(--teal)' : ''; btn.style.color = EpubState.furi ? 'var(--teal)' : ''; }
src/features-video.js:2931:  document.getElementById('epubDropZone').style.borderColor = 'var(--border)';
src/features-video.js:2947:  if (compBtn) { compBtn.style.background = ''; }
src/features-video.js:2948:  if (dictBtn) { dictBtn.style.background = ''; }
src/features-video.js:3012:  if (btn) { btn.style.borderColor = 'var(--teal)'; btn.style.color = 'var(--teal)'; }
src/features-video.js:3037:    if (btn) { btn.style.borderColor = 'var(--border)'; btn.style.color = 'var(--ink-light)'; }
src/features-video.js:422:    btn.style.borderColor = 'var(--gold)';
src/features-video.js:423:    btn.style.color = 'var(--gold)';
src/features-video.js:433:    btn.style.borderColor = 'var(--teal)';
src/features-video.js:434:    btn.style.color = 'var(--teal)';
src/features-video.js:446:  btn.style.borderColor = '';
src/features-video.js:447:  btn.style.color = '';
src/features-video.js:622:  if (btn) btn.classList.add('loading');
src/features-video.js:654:    if (btn) { btn.classList.remove('loading'); }
src/features-video.js:691:  btn.style.background = visible ? '' : 'rgba(48,213,200,0.12)';
src/features-video.js:692:  btn.style.color = visible ? 'var(--teal)' : 'var(--teal)';
src/features-video.js:70:  btn.style.borderColor = VideoState.waveMode ? 'var(--teal)' : '';
src/features-video.js:71:  btn.style.color = VideoState.waveMode ? 'var(--teal)' : '';
src/features-video.js:827:      el.classList.toggle('active', j === i);
src/features-video.js:828:      el.classList.toggle('revealed', j < i);
src/features-video.js:838:    el.classList.remove('active');
src/features-video.js:839:    el.classList.add('revealed');
src/features-video.js:852:    el.classList.toggle('active', j === idx);
src/features-video.js:853:    el.classList.remove('revealed');
src/features-video.js:855:  if (btn) btn.classList.add('speaking');
src/features-video.js:858:  if (btn) btn.classList.remove('speaking');
src/features-video.js:888:    el.classList.remove('active','revealed');
src/features-video.js:899:    if (i === correct) btn.classList.add('correct');
src/features-video.js:900:    else if (i === idx) btn.classList.add('wrong');
src/features-video.js:91:  document.getElementById('vtDropZone').classList.remove('vt-drag-over');
src/features-video.js:936:    btn.style.background = 'rgba(48,213,200,0.15)';
src/features-video.js:937:    btn.style.borderColor = 'var(--teal)';
src/features-video.js:938:    btn.style.color = 'var(--teal)';
src/features-video.js:940:    videoPanel.classList.add('vt-dictation-active');
src/features-video.js:962:    btn.style.background = '';
src/features-video.js:963:    btn.style.borderColor = 'var(--border)';
src/features-video.js:964:    btn.style.color = 'var(--ink-light)';
src/features-video.js:966:    videoPanel.classList.remove('vt-dictation-active');
src/features-voice-drill.js:172:    document.getElementById('voice-sub-btn-' + t).classList.toggle('active', t === tab);
src/features-voice-drill.js:395:    result.style.color = 'var(--teal)';
src/features-voice-drill.js:399:    result.style.color = 'var(--gold)';
src/features-voice-drill.js:403:    result.style.color = 'var(--red)';
src/features-voice-drill.js:558:      result.style.color = 'var(--teal)';
src/features-voice-drill.js:562:      result.style.color = 'var(--gold)';
src/features-voice-drill.js:566:      result.style.color = 'var(--red)';
src/features-voice.js:2039:      row.onmouseover = () => row.style.background = 'var(--paper-dark)';
src/features-voice.js:2040:      row.onmouseout  = () => row.style.background = '';
src/features-voice.js:2389:    document.getElementById('apikeyBar').classList.add('open');
src/features-voice.js:2748:    document.getElementById('apikeyBar').classList.add('open');
src/features-voice.js:544:  btn.style.color = filled ? 'var(--teal)' : '';
src/features-yoshi.js:446:  document.querySelectorAll('.yoshi-subtab').forEach(b => b.classList.remove('active'));
src/features-yoshi.js:447:  document.querySelectorAll('.yoshi-subpanel').forEach(p => p.classList.remove('active'));
src/features-yoshi.js:448:  btn.classList.add('active');
src/features-yoshi.js:449:  document.getElementById('yoshi-sub-' + name).classList.add('active');
src/features-yoshi.js:57:    el.classList.toggle('active', realI === i);
src/features-yoshi.js:639:    document.querySelectorAll('.yoshi-subtab').forEach(b => b.classList.remove('active'));
src/features-yoshi.js:640:    document.querySelectorAll('.yoshi-subpanel').forEach(p => p.classList.remove('active'));
src/features-yoshi.js:641:    readBtn.classList.add('active');
src/features-yoshi.js:642:    document.getElementById('yoshi-sub-read').classList.add('active');
src/IssueTracker.js:347:    document.getElementById('itNewTitle').style.borderColor = 'var(--red)';
src/IssueTracker.js:348:    setTimeout(() => { document.getElementById('itNewTitle').style.borderColor = ''; }, 1500);
src/ui/DrillCard.js:138:      fb.style.color = 'var(--teal)';
src/ui/DrillCard.js:139:      inp.style.borderColor = 'var(--teal)';
src/ui/DrillCard.js:147:      fb.style.color = 'var(--red)';
src/ui/DrillCard.js:148:      inp.style.borderColor = 'var(--red)';
src/ui/YoshiUI.js:156:    if (color) el.style.color = color;


## Scope of standardisation — all categories

### 1. Button active/selected states (in progress)
- Kana mode buttons (A / ひ / カ) — done via btn-active/btn-active-gold
- All other setButtonGroupActive callers — done
- Remaining inline color/border in core-anki, core-stt, core-writing — TODO

### 2. Tab active states
- Grammar notes tabs (.gramnote-tab.active)
- Translation breakdown tabs (.trans-breakdown-tab.active)
- Voice subtabs (voice-sub-btn-*)
- Yoshi subtabs
- Settings tabs (stTabSettings etc — currently inline border-bottom)

### 3. Toggle buttons (on/off)
- Loop mode, shadowing, dictation mode, listen mode
- SRS tracking toggle
- Kana/romaji toggles where not already covered
- VoiceVox enable/disable

### 4. List selected items
- Playlist items (listen panel)
- Vocab list items
- Lesson session list items
- Kanji corpus grid items
- Anki card queue

### 5. Input field states
- Focus border (teal)
- Error border (red flash on wrong answer)
- Active/typing indicator
- Disabled state
- Kana caret color (already done — teal/gold)

### 6. Feedback / drill result colors
- Correct answer (teal)
- Wrong answer (red)
- Partial/hint used (gold)
- DrillCard correct/wrong border+color
- Voice drill score result colors
- Conjugation drill result

### 7. Status indicators
- Recording state (red pulse)
- API call in progress (Check Input header — partially done)
- Loading states
- Connection status dots (Anki, VoiceVox)
- Preflight pass/fail

### 8. Panel and section headers
- Collapsible section headers (open/closed chevron)
- Sticky action headers like Check Input
- Active panel in navigation

### 9. Typography states
- Correct/wrong answer text
- Hint text
- Mastered item
- Lesson word bonus indicator
- JLPT level badges

### 10. One-offs to leave alone
- IssueTracker title border flash (validation)
- Progress cost display color
- Any canvas/waveform drawing colors
