// ═══════════════════════════════════════════════════════
// FEATURES-VIDEO
// Video + Transcript Player · Watch Timer ·
// Comprehension Drill · Dictation · Breakdown · Shadowing
// Requires: core.js, features-core.js, features-kana.js
// ═══════════════════════════════════════════════════════

// ── Phase 3: App-first resolvers ─────────────────────────────────
function _fvid_claudeAPI(...a) { return (App.claudeAPI  || window.claudeAPI)(...a); }
function _fvid_getApiKey()     { return (App.getApiKey  || window.getApiKey)?.(); }
function _fvid_showPanel(id)   { return (App.showPanel  || window.showPanel)?.(id); }
function _fvid_Storage()       { return App.Storage     || window.Storage; }


// ═══════════════════════════════════════════════════════
// VIDEO + TRANSCRIPT PLAYER
// ═══════════════════════════════════════════════════════
// ── Video / transcript player state ─────────────────────────────────────────
const VideoState = {
  // Playback
  cues:             [],
  activeIdx:        -1,
  loopA:            null,
  loopB:            null,
  loopState:        'idle',   // idle | settingA | settingB | active
  loopPauseSecs:    0,
  loopPauseTimer:   null,
  audioCtx:         null,
  waveData:         null,
  rafId:            null,
  isVideo:          false,
  watchedThreshold: false,    // true once 80% of current video reached
  waveMode:         false,    // false = timeline, true = waveform
  // Watch timing
  watchStartTime:   null,
  // Layout & UI
  layout:           'half',   // 'half' | 'wide'
  markers:          [],
  savedFiles:       [],       // {name, type, url, transcript?, transcriptName?}
  pendingHistoryName: null,
  pendingHistoryEntry: null,   // stored while waiting for file re-select
  vocabListCache:   {},       // keyed by video filename
  currentVocab:     [],
  // Dictation
  dictationActive:  false,
  dictationCorrect: 0,
  dictationTotal:   0,
  dictationRevealed:false,
  // Shadow mode
  shadowActive:     false,
  shTargetCue:      null,
  shTargetAudioCtx: null,
  shTargetBuffer:   null,
  shTargetSource:   null,
  shTargetPlaying:  false,
  shRecorder:       null,
  shRecording:      false,
  shBlob:           null,
  shPlaybackAudio:  null,
  shAnimRaf:        null,
  shLiveAnalyser:   null,
  shLiveRaf:        null,
  selectedMicId:    null,
};

function vtToggleWaveMode() {
  VideoState.waveMode = !VideoState.waveMode;
  const btn = document.getElementById('vtWaveToggleBtn');
  const canvas = document.getElementById('vtWaveform');
  btn.style.borderColor = VideoState.waveMode ? 'var(--teal)' : '';
  btn.style.color = VideoState.waveMode ? 'var(--teal)' : '';
  canvas.style.height = VideoState.waveMode ? '80px' : '44px';
  vtDrawWaveform();
}

function vtCollapseLoadBar() {
  document.getElementById('vtDropZone').style.display = 'none';
  document.getElementById('vtLoadedBar').style.display = 'flex';
  document.getElementById('vtMainLayout').style.display = 'grid';
  document.getElementById('vtTranscriptWrap').style.display = 'block';
  document.getElementById('vtControls').style.display = 'block';
}

function vtDropZoneClick(e) {
  // Don't trigger if clicking the hidden file inputs
  document.getElementById('vtVideoInput').click();
}

function vtHandleDrop(e) {
  e.preventDefault();
  document.getElementById('vtDropZone').classList.remove('vt-drag-over');
  const files = [...e.dataTransfer.files];
  const videoFile = files.find(f => f.type.startsWith('video/') || f.type.startsWith('audio/'));
  const transFile = files.find(f => /\.(srt|vtt|txt)$/i.test(f.name));
  if (videoFile) vtLoadFile(videoFile);
  if (transFile) {
    vtLoadTransFile(transFile);
  } else if (videoFile) {
    // Try to find a transcript with the same base name among dropped files
    const base = videoFile.name.replace(/\.[^.]+$/, '').toLowerCase();
    const matchTrans = ext => files.find(f => f.name.toLowerCase() === base + ext);
    const autoTrans = matchTrans('.vtt') || matchTrans('.srt') || matchTrans('.txt');
    if (autoTrans) vtLoadTransFile(autoTrans);
  }
}

function vtLoadVideo(input) {
  const file = input.files[0];
  if (!file) return;
  vtLoadFile(file);
  input.value = '';
}

function vtLoadFile(file) {
  const video = document.getElementById('vtVideo');
  const url = URL.createObjectURL(file);
  video.src = url;
  const waveMsg = document.getElementById('vtWaveMsg');
  if (waveMsg) {
    waveMsg.style.display = 'block';
    waveMsg.textContent = 'Decoding…';
  }
  vtDecodeWaveform(url);
  vtCollapseLoadBar();
  vtAddSavedLink(file.name, 'video', url);
}

function vtLoadTranscript(input) {
  const file = input.files[0];
  if (!file) return;
  vtLoadTransFile(file);
  input.value = '';
}

function vtLoadTransFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    if (file.name.endsWith('.srt') || file.name.endsWith('.vtt')) {
      VideoState.cues = vtParseSrt(text);
    } else {
      // Plain text: each line becomes a cue (no timestamps)
      VideoState.cues = text.split('\n').filter(l => l.trim()).map((l, i) => ({
        start: null, end: null, text: l.trim()
      }));
    }
    vtRenderTranscript();
    // Auto-import transcript sentences into corpus DB if not previously seen
    (App.corpusCheckAndImport || window.corpusCheckAndImport)?.(file.name, VideoState.cues);
    document.getElementById('vtTranscriptWrap').style.display = 'block';
    const noTrans = document.getElementById('vtNoTranscript');
    if (noTrans) noTrans.style.display = 'none';
    vtCollapseLoadBar();
    
    // Save transcript with current video in history and persist
    if (VideoState.savedFiles.length > 0) {
      VideoState.savedFiles[0].transcript = VideoState.cues;
      VideoState.savedFiles[0].transcriptName = file.name;
      vtSaveHistory();
    }
  };
  reader.readAsText(file);
}

function vtParseSrt(text) {
  // Handle both SRT and basic VTT
  const cues = [];
  const blocks = text.replace(/\r\n/g, '\n').split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;
    // Find timestamp line
    let tsLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/\d{1,2}[:.]/.test(lines[i]) && lines[i].includes('-->')) { tsLine = i; break; }
    }
    if (tsLine === -1) continue;
    const ts = lines[tsLine].match(/(\d{1,2}):(\d{2})[:.:](\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2})[:.:](\d{2})[,.](\d{3})/);
    if (!ts) continue;
    const toSec = (h,m,s,ms) => parseInt(h)*3600 + parseInt(m)*60 + parseInt(s) + parseInt(ms)/1000;
    const start = toSec(ts[1],ts[2],ts[3],ts[4]);
    const end   = toSec(ts[5],ts[6],ts[7],ts[8]);
    const text = lines.slice(tsLine+1).join(' ').replace(/<[^>]+>/g,'').trim();
    if (text) cues.push({ start, end, text });
  }
  return cues;
}

function vtRenderTranscript() {
  const container = document.getElementById('vtTranscript');
  container.innerHTML = VideoState.cues.map((cue, i) => {
    const ts = cue.start !== null ? vtFmtTime(cue.start) : '';
    const hasJP = /[぀-鿿一-鿿]/.test(cue.text);
    const displayText = cue._furi || cue.text;
    const lineStyle = cue._furi ? 'flex:1;line-height:2.2' : 'flex:1';
    const furiBtn = hasJP
      ? cue._furi
        ? `<button class="vt-furi-btn done" id="vt-furi-btn-${i}" onclick="event.stopPropagation();vtFuriLine(${i})" title="Furigana applied">ふ✓</button>`
        : `<button class="vt-furi-btn" id="vt-furi-btn-${i}" onclick="event.stopPropagation();vtFuriLine(${i})" title="Add furigana">ふ</button>`
      : '';
    return `<div class="vt-cue" id="vt-cue-${i}">
      ${ts ? `<span class="vt-cue-time" onclick="vtCueClick(${i})" title="Jump to ${ts}" style="cursor:pointer">${ts}</span>` : ''}
      <span class="vt-cue-text" id="vt-cue-text-${i}" style="${lineStyle}"
        onclick="vtCueClick(${i})"
        ondblclick="vtCueClick(${i});vtTranslateLine()"
        onmouseup="vtWordSelect(${i},event)">${displayText}</span>
      ${furiBtn}
      ${cue.start !== null ? `<button class="vt-furi-btn btn-icon" onclick="event.stopPropagation();vtSendToShadow(${i})" title="Send to shadow tool">🎙</button>` : ''}
    </div>`;
  }).join('');
}

function vtSendToShadow(idx) {
  const cue = VideoState.cues[idx];
  if (!cue || cue.start === null) return;
  
  // Show shadow panel if hidden
  const shadowPanel = document.getElementById('vtShadowPanel');
  if (shadowPanel.style.display === 'none') {
    shadowPanel.style.display = 'flex';
    VideoState.shadowActive = true;
  }
  
  // Set this cue as the shadow target
  vtShSetTarget(cue);
  
  // Scroll shadow panel into view
  shadowPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


function vtCueClick(i) {
  const cue = VideoState.cues[i];
  if (cue.start !== null) {
    const video = document.getElementById('vtVideo');
    video.currentTime = cue.start;
    video.play();
  }
}

function vtOnTimeUpdate() {
  const video = document.getElementById('vtVideo');
  const t = video.currentTime;

  // 80% watched → record video activity (once per load)
  if (!VideoState.watchedThreshold && video.duration > 0 && t / video.duration >= 0.8) {
    VideoState.watchedThreshold = true;
    const _vidLabel = (VideoState.savedFiles && VideoState.savedFiles[0]) ? VideoState.savedFiles[0].name.replace(/\.[^.]+$/, '') : null;
    drillLastCompletedWrite('video', _vidLabel);
  }

  // A–B loop enforcement
  if (VideoState.loopState === 'active' && VideoState.loopA !== null && VideoState.loopB !== null) {
    if (t >= VideoState.loopB && !VideoState.loopPauseTimer) {
      if (VideoState.loopPauseSecs > 0) {
        video.pause();
        VideoState.loopPauseTimer = setTimeout(() => {
          VideoState.loopPauseTimer = null;
          video.currentTime = VideoState.loopA;
          video.play();
        }, VideoState.loopPauseSecs * 1000);
      } else {
        video.currentTime = VideoState.loopA;
      }
    }
  }

  // Highlight active cue
  let activeIdx = -1;
  for (let i = 0; i < VideoState.cues.length; i++) {
    const c = VideoState.cues[i];
    if (c.start !== null && t >= c.start && t < (c.end || c.start + 999)) {
      activeIdx = i;
    }
  }
  VideoState.activeIdx = activeIdx;
  document.querySelectorAll('.vt-cue').forEach((el, i) => {
    const wasActive = el.classList.contains('active');
    el.classList.toggle('active', i === activeIdx);
    if (i === activeIdx && !wasActive) {
      {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  });

  vtUpdateDisplay();
  vtDrawWaveform();
}

// ═══════════════════════════════════════════════════════
// VIDEO WATCH TIMER
// ═══════════════════════════════════════════════════════
const VT_WATCH_KEY = 'vtWatchTime';
// VideoState.watchStartTime → VideoState.watchStartTime

function vtWatchLoad() {
  const stored = localStorage.getItem(VT_WATCH_KEY);
  if (stored) {
    try {
      const data = JSON.parse(stored);
      const today = new Date().toDateString();
      if (data.date === today) {
        return data.minutes || 0;
      }
    } catch(e) {}
  }
  return 0;
}

function vtWatchSave(minutes) {
  const today = new Date().toDateString();
  localStorage.setItem(VT_WATCH_KEY, JSON.stringify({ date: today, minutes }));
}

function vtWatchUpdate() {
  const el = document.getElementById('vtWatchMinutes');
  if (el) el.textContent = vtWatchLoad();
}

function vtWatchStart() {
  VideoState.watchStartTime = Date.now();
}

function vtWatchStop() {
  if (VideoState.watchStartTime) {
    const elapsed = (Date.now() - VideoState.watchStartTime) / 60000; // convert to minutes
    const current = vtWatchLoad();
    vtWatchSave(Math.round(current + elapsed));
    vtWatchUpdate();
    VideoState.watchStartTime = null;
  }
}

// Initialize on load
setTimeout(vtWatchUpdate, 100);

function vtOnPlay() {
  document.getElementById('vtPlayBtn').textContent = '⏸ Pause';
  vtAnimLoop();
  vtWatchStart();
}

function vtOnPause() {
  document.getElementById('vtPlayBtn').textContent = '▶ Play';
  cancelAnimationFrame(VideoState.rafId);
  vtDrawWaveform();
  vtWatchStop();
}

function vtOnLoaded() {
  VideoState.watchedThreshold = false;
  const v = document.getElementById('vtVideo');
  const hasVideo = v.videoWidth > 0 || v.videoHeight > 0;
  v.style.display = hasVideo ? 'block' : 'none';
  const noVid = document.getElementById('vtNoVideo');
  if (noVid) {
    if (hasVideo) {
      noVid.style.display = 'none';
    } else {
      // Audio only - show play/pause UI
      noVid.style.display = 'flex';
      noVid.innerHTML = '<span style="font-size:2rem">🎧</span><span>Audio only — click to play/pause</span>';
      noVid.onclick = vtTogglePlay;
    }
  }
  const waveMsg = document.getElementById('vtWaveMsg');
  if (waveMsg) waveMsg.style.display = 'none';
  vtUpdateDisplay();
  vtDrawWaveform();
}

function vtAnimLoop() {
  vtDrawWaveform();
  VideoState.rafId = requestAnimationFrame(vtAnimLoop);
}

function vtTogglePlay() {
  const v = document.getElementById('vtVideo');
  
  // Cancel any pending loop pause timer
  if (VideoState.loopPauseTimer) {
    clearTimeout(VideoState.loopPauseTimer);
    VideoState.loopPauseTimer = null;
  }
  
  if (v.paused) {
    v.play();
    vtCloseLineTranslate();
  } else {
    v.pause();
  }
}

function vtSetSpeed() {
  document.getElementById('vtVideo').playbackRate = parseFloat(document.getElementById('vtSpeed').value);
}

function vtUpdateDisplay() {
  const v = document.getElementById('vtVideo');
  const cur = vtFmtTime(v.currentTime || 0);
  const dur = vtFmtTime(v.duration || 0);
  document.getElementById('vtTime').textContent = cur + ' / ' + dur;
}

function vtFmtTime(s) {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return m + ':' + String(sec).padStart(2,'0');
}

// ── A–B Loop ──────────────────────────────────────────
function vtSetLoopA() {
  const v = document.getElementById('vtVideo');
  const btn = document.getElementById('vtLoopBtn');
  const info = document.getElementById('vtLoopInfo');
  if (VideoState.loopState === 'idle' || VideoState.loopState === 'active') {
    VideoState.loopA = v.currentTime;
    VideoState.loopB = null;
    VideoState.loopState = 'settingB';
    btn.textContent = '◫ Set B end';
    btn.style.borderColor = 'var(--gold)';
    btn.style.color = 'var(--gold)';
    info.textContent = 'A: ' + vtFmtTime(VideoState.loopA) + ' — now seek to end point and click';
    vtDrawWaveform();
  } else if (VideoState.loopState === 'settingB') {
    VideoState.loopB = v.currentTime;
    if (VideoState.loopB <= VideoState.loopA) { VideoState.loopB = VideoState.loopA + 1; }
    VideoState.loopState = 'active';
    v.currentTime = VideoState.loopA;
    v.play();
    btn.textContent = '◫ Reset A';
    btn.style.borderColor = 'var(--teal)';
    btn.style.color = 'var(--teal)';
    info.textContent = 'Loop: ' + vtFmtTime(VideoState.loopA) + ' → ' + vtFmtTime(VideoState.loopB);
    vtDrawWaveform();
  }
}

function vtClearLoop() {
  VideoState.loopA = null; VideoState.loopB = null; VideoState.loopState = 'idle';
  clearTimeout(VideoState.loopPauseTimer);
  VideoState.loopPauseTimer = null;
  const btn = document.getElementById('vtLoopBtn');
  btn.textContent = '◫ A–B Loop';
  btn.style.borderColor = '';
  btn.style.color = '';
  document.getElementById('vtLoopInfo').textContent = '';
  vtDrawWaveform();
}

function vtSetLoopPause(secs) {
  VideoState.loopPauseSecs = secs;
}

// ── Waveform ──────────────────────────────────────────
async function vtDecodeWaveform(url) {
  // Build waveform from the <video> element via Web Audio MediaElementSource.
  // This avoids fetching the entire file into memory (which crashes Electron
  // on large video files — the "DevTools disconnected" error).
  const waveMsg = document.getElementById('vtWaveMsg');
  try {
    if (!VideoState.audioCtx) VideoState.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const video = document.getElementById('vtVideo');

    // Wait until we have enough metadata to know duration
    await new Promise((resolve, reject) => {
      if (video.readyState >= 1) { resolve(); return; }
      video.addEventListener('loadedmetadata', resolve, { once: true });
      video.addEventListener('error', reject, { once: true });
      setTimeout(reject, 8000);
    });

    // Use OfflineAudioContext to sample the media at low quality — fast & low-memory
    const duration = video.duration;
    if (!isFinite(duration) || duration <= 0) throw new Error('no duration');

    // Sample at most 60 seconds at 4000 Hz mono — enough for a visual waveform
    const sampleRate  = 4000;
    const maxDuration = Math.min(duration, 60);
    const frameCount  = Math.floor(maxDuration * sampleRate);
    const offline     = new OfflineAudioContext(1, frameCount, sampleRate);

    // Fetch only a small range of the file for the sample
    const resp = await fetch(url, { headers: { Range: 'bytes=0-2097151' } }); // first 2 MB
    const buf  = await resp.arrayBuffer();
    const audioBuf = await offline.decodeAudioData(buf).catch(() => null);

    if (!audioBuf) throw new Error('decode failed');

    const raw     = audioBuf.getChannelData(0);
    const buckets = 800;
    const step    = Math.max(1, Math.floor(raw.length / buckets));
    const data    = new Float32Array(buckets);
    for (let i = 0; i < buckets; i++) {
      let max = 0;
      const end = Math.min(raw.length, i * step + step);
      for (let j = i * step; j < end; j++) { const v = Math.abs(raw[j]||0); if (v > max) max = v; }
      data[i] = max;
    }
    const peak = Math.max(...data, 0.001);
    for (let i = 0; i < buckets; i++) data[i] /= peak;
    VideoState.waveData = data;
    if (waveMsg) waveMsg.style.display = 'none';
    vtDrawWaveform();
  } catch(e) {
    // Waveform is optional — silently hide the loading message
    if (waveMsg) waveMsg.style.display = 'none';
  }
}

function vtWaveClick(e) {
  const canvas = document.getElementById('vtWaveform');
  const rect = canvas.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  const v = document.getElementById('vtVideo');
  if (v.duration) v.currentTime = pct * v.duration;
}

function vtDrawWaveform() {
  const canvas = document.getElementById('vtWaveform');
  if (!canvas) return;
  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight || (VideoState.waveMode ? 80 : 44);
  if (!W) return;
  if (canvas.width !== W) canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const cs = getComputedStyle(document.documentElement);
  const teal = cs.getPropertyValue('--teal').trim() || '#30d5c8';
  const gold = '#d4a017';
  const ink  = cs.getPropertyValue('--ink').trim()  || '#f0ede6';
  const red  = cs.getPropertyValue('--red').trim()  || '#ff5a5a';

  const v = document.getElementById('vtVideo');
  const progress = (v && v.duration) ? v.currentTime / v.duration : 0;
  const playedW = Math.floor(progress * W);

  // Background
  ctx.fillStyle = '#1a1a1e';
  ctx.fillRect(0, 0, W, H);

  if (VideoState.waveMode && VideoState.waveData) {
    // ── WAVEFORM mode ──────────────────────────────────────
    const mid = H / 2;
    // A–B region
    if (VideoState.loopA !== null && v.duration) {
      const ax = (VideoState.loopA / v.duration) * W;
      const bx = VideoState.loopB !== null ? (VideoState.loopB / v.duration) * W : playedW;
      if (bx > ax) { ctx.fillStyle = gold; ctx.globalAlpha = 0.1; ctx.fillRect(ax,0,bx-ax,H); ctx.globalAlpha=1; }
    }
    const buckets = VideoState.waveData.length, bw = W / buckets;
    for (let i = 0; i < buckets; i++) {
      const x = i * bw, amp = VideoState.waveData[i] * (mid - 2);
      ctx.fillStyle = x < playedW ? teal : ink;
      ctx.globalAlpha = x < playedW ? 0.9 : 0.25;
      ctx.fillRect(Math.floor(x), mid-amp, Math.max(1,bw-0.5), amp*2);
    }
    ctx.globalAlpha = 1;
    if (VideoState.loopA !== null && v.duration) {
      const ax = Math.floor((VideoState.loopA/v.duration)*W);
      ctx.strokeStyle=gold; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(ax,0); ctx.lineTo(ax,H); ctx.stroke();
      ctx.fillStyle=gold; ctx.font='bold 10px monospace'; ctx.fillText('A',ax+3,11);
    }
    if (VideoState.loopB !== null && v.duration) {
      const bx = Math.floor((VideoState.loopB/v.duration)*W);
      ctx.strokeStyle=gold; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(bx,0); ctx.lineTo(bx,H); ctx.stroke();
      ctx.fillStyle=gold; ctx.font='bold 10px monospace'; ctx.fillText('B',Math.max(0,bx-13),11);
    }
  } else {
    // ── SIMPLE TIMELINE mode ───────────────────────────────
    const trackH = 6, trackY = (H - trackH) / 2, r = 3;
    // Track background
    ctx.fillStyle = ink; ctx.globalAlpha = 0.15;
    ctx.beginPath(); ctx.roundRect(0, trackY, W, trackH, r); ctx.fill(); ctx.globalAlpha = 1;
    // A–B region highlight
    if (VideoState.loopA !== null && v.duration) {
      const ax = (VideoState.loopA / v.duration) * W;
      const bx = VideoState.loopB !== null ? (VideoState.loopB / v.duration) * W : playedW;
      if (bx > ax) {
        ctx.fillStyle = gold; ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.roundRect(ax, trackY, bx-ax, trackH, 0); ctx.fill(); ctx.globalAlpha = 1;
      }
    }
    // Played portion
    if (playedW > 0) {
      ctx.fillStyle = teal; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.roundRect(0, trackY, playedW, trackH, [r,0,0,r]); ctx.fill(); ctx.globalAlpha = 1;
    }
    // A/B tick marks
    if (VideoState.loopA !== null && v.duration) {
      const ax = Math.floor((VideoState.loopA/v.duration)*W);
      ctx.fillStyle = gold; ctx.fillRect(ax-1, trackY-4, 2, trackH+8);
      ctx.font = 'bold 9px monospace'; ctx.fillStyle = gold; ctx.fillText('A', ax+3, trackY-2);
    }
    if (VideoState.loopB !== null && v.duration) {
      const bx = Math.floor((VideoState.loopB/v.duration)*W);
      ctx.fillStyle = gold; ctx.fillRect(bx-1, trackY-4, 2, trackH+8);
      ctx.font = 'bold 9px monospace'; ctx.fillStyle = gold; ctx.fillText('B', Math.max(0,bx-13), trackY-2);
    }
    // Playhead dot
    ctx.fillStyle = red; ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(playedW, H/2, 6, 0, Math.PI*2); ctx.fill();
  }

  // Always draw playhead line in waveform mode
  if (VideoState.waveMode) {
    ctx.strokeStyle = red; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(playedW,0); ctx.lineTo(playedW,H); ctx.stroke();
  }
}

// ── WATCH PANEL FURIGANA ─────────────────────────────────────────────────
async function vtFuriLine(idx) {
  if (!_fvid_getApiKey()) return;
  const cue = VideoState.cues[idx];
  if (!cue || cue._furi) return; // already done
  const btn = document.getElementById('vt-furi-btn-' + idx);
  const textEl = document.getElementById('vt-cue-text-' + idx);
  if (btn) btn.classList.add('loading');

  try {
    const data = await _fvid_claudeAPI({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `Add furigana to ALL kanji in this Japanese text using HTML ruby tags.

CRITICAL: Every single kanji character MUST have a reading. Do not skip any kanji.

Rules:
- EVERY kanji needs <ruby>kanji<rt>reading</rt></ruby>
- Use context-appropriate readings (例えば→たとえば, 今日→きょう, 片付ける→かたづける)
- For verbs like 片付けます: <ruby>片<rt>かた</rt></ruby><ruby>付<rt>づ</rt></ruby>けます
- Leave hiragana, katakana, punctuation unchanged
- Return ONLY the HTML, no explanation

Text: ${cue.text}`
        }]
    ,
      track: 'video'
    });
    const html = (data.content?.[0]?.text || '').trim();
    if (html && textEl) {
      textEl.innerHTML = html;
      textEl.style.lineHeight = '2.2';
      cue._furi = html;
      if (btn) { btn.classList.remove('loading'); btn.classList.add('done'); btn.textContent = 'ふ✓'; }
    }
  } catch(e) {
    if (btn) { btn.classList.remove('loading'); }
  }
}

async function vtFuriAll() {
  if (!_fvid_getApiKey()) return;
  const btn = document.getElementById('vtFuriAllBtn');
  const pending = VideoState.cues.map((c,i) => ({c,i}))
    .filter(({c}) => !c._furi && /[\u3040-\u9FFF\u4E00-\u9FFF]/.test(c.text));
  if (!pending.length) return;
  if (btn) { btn.textContent = `ふ 0/${pending.length}`; btn.style.color = 'var(--gold)'; btn.style.borderColor = 'var(--gold)'; btn.disabled = true; }
  let done = 0;
  // Process in batches of 3 to avoid hammering the API
  for (let i = 0; i < pending.length; i += 3) {
    const batch = pending.slice(i, i + 3);
    await Promise.all(batch.map(({i: idx}) => vtFuriLine(idx)));
    done += batch.length;
    if (btn) btn.textContent = `ふ ${done}/${pending.length}`;
  }
  if (btn) { btn.textContent = 'ふ ✓'; btn.style.color = 'var(--teal)'; btn.style.borderColor = 'var(--teal)'; btn.disabled = false; }
}

// ═══════════════════════════════════════════════════════
// COMPREHENSION DRILL
// ═══════════════════════════════════════════════════════
// ── Comprehension drill state ─────────────────────────────────────────────────
const ComprehensionState = {
  data:    null,
  playing: false,
  voices:  [],
};

function toggleComprehension() {
  const panel = document.getElementById('compPanel');
  const btn = document.getElementById('compToggleBtn');
  const visible = panel.style.display !== 'none';
  panel.style.display = visible ? 'none' : 'block';
  btn.style.background = visible ? '' : 'rgba(48,213,200,0.12)';
  btn.style.color = visible ? 'var(--teal)' : 'var(--teal)';
}

function compPopulateVoices() {
  const all = speechSynthesis.getVoices();
  const jp = all.filter(v => v.lang.startsWith('ja'));
  if (!jp.length) return;
  const selA = document.getElementById('compVoiceA');
  const selB = document.getElementById('compVoiceB');
  if (!selA || !selB) return;
  const opts = jp.map((v,i) => `<option value="${i}">${v.name}</option>`).join('');
  selA.innerHTML = opts;
  selB.innerHTML = opts;
  // Default: pick two different voices if possible
  const enhanced = jp.filter(v => v.localService);
  const pool = enhanced.length >= 2 ? enhanced : jp;
  const idxA = jp.indexOf(pool[0]);
  const idxB = jp.indexOf(pool.find(v => v !== pool[0]) || pool[0]);
  selA.value = idxA;
  selB.value = idxB;
}

function compGetVoices() {
  const all = speechSynthesis.getVoices();
  const jp = all.filter(v => v.lang.startsWith('ja'));
  const selA = document.getElementById('compVoiceA');
  const selB = document.getElementById('compVoiceB');
  const idxA = selA ? parseInt(selA.value) : 0;
  const idxB = selB ? parseInt(selB.value) : 0;
  return [jp[idxA] || jp[0] || null, jp[idxB] || jp[0] || null];
}

async function compGenerate() {
  const topic = document.getElementById('compTopic').value.trim() || 'daily life';
  const level = document.getElementById('compLevel').value;
  const btn = document.getElementById('compGenerateBtn');
  const status = document.getElementById('compGenStatus');
  if (!_fvid_getApiKey()) { status.textContent = 'No API key'; return; }
  btn.disabled = true;
  status.textContent = 'Generating…';
  document.getElementById('compPlayer').style.display = 'none';
  document.getElementById('compAnswerArea').style.display = 'none';
  compStop();

  const prompt = `Create a short Japanese listening comprehension exercise for ${level} learners on the topic: ${topic}.

Respond ONLY with valid JSON in this exact format:
{
  "speakerA": "Name or role for speaker A (e.g. 田中さん)",
  "speakerB": "Name or role for speaker B (e.g. 店員)",
  "lines": [
    {"speaker": "A", "text": "Japanese line here"},
    {"speaker": "B", "text": "Japanese line here"}
  ],
  "question": "Simple comprehension question in English",
  "choices": ["Option 1", "Option 2", "Option 3", "Option 4"],
  "answer": 0,
  "explanation": "Brief explanation of the correct answer in English"
}

Rules:
- 6-10 dialogue lines total
- ${level} vocabulary and grammar only
- question tests genuine comprehension (not just a word lookup)
- choices[answer] is the index of the correct answer (0-based)
- keep lines short and natural`;

  try {
    const data = await _fvid_claudeAPI({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 900,
        messages: [{ role: 'user', content: prompt }]
    ,
      track: 'writing'
    });
    const raw = (data.content?.[0]?.text || '').replace(/```json|```/g,'').trim();
    ComprehensionState.data = JSON.parse(raw);
    ComprehensionState.voices = compGetVoices();
    compRender();
    status.textContent = '';
  } catch(e) {
    status.textContent = 'Error: ' + e.message;
  }
  btn.disabled = false;
}

function compRender() {
  if (!ComprehensionState.data) return;
  const d = ComprehensionState.data;

  // Speaker labels
  document.getElementById('compSpeakerALabel').textContent =
    d.speakerA + (ComprehensionState.voices[0] ? ' — ' + ComprehensionState.voices[0].name.split(' ')[0] : '');
  document.getElementById('compSpeakerBLabel').textContent =
    d.speakerB + (ComprehensionState.voices[1] ? ' — ' + ComprehensionState.voices[1].name.split(' ')[0] : '');

  // Dialogue lines
  const showScript = document.getElementById('compShowScript').checked;
  const dl = document.getElementById('compDialogue');
  dl.innerHTML = d.lines.map((line, i) => {
    const isA = line.speaker === 'A';
    return `<div class="comp-line" id="comp-line-${i}">
      <div class="comp-dot ${isA ? 'comp-dot-a' : 'comp-dot-b'}"></div>
      <div class="comp-text${showScript ? ' shown' : ''}" id="comp-text-${i}">${line.text}</div>
      <button class="comp-line-play" id="comp-line-btn-${i}" onclick="compPlayLine(${i})" title="Play this line">▶</button>
    </div>`;
  }).join('');

  // Question & choices
  document.getElementById('compQuestion').textContent = d.question;
  document.getElementById('compChoices').innerHTML = d.choices.map((ch, i) =>
    `<button class="comp-choice" onclick="compAnswer(${i})">${ch}</button>`
  ).join('');

  document.getElementById('compAnswerArea').style.display = 'none';
  document.getElementById('compPlayer').style.display = 'block';
  document.getElementById('compPlayBtn').textContent = '▶ Play';
}

function compToggleScript() {
  const show = document.getElementById('compShowScript').checked;
  document.querySelectorAll('.comp-text').forEach(el => el.classList.toggle('shown', show));
}

async function compPlay() {
  if (!ComprehensionState.data) return;
  if (ComprehensionState.playing) { compStop(); return; }
  ComprehensionState.playing = true;
  document.getElementById('compPlayBtn').textContent = '⏸ Pause';
  const speed = parseFloat(document.getElementById('compSpeed').value);
  const lines = ComprehensionState.data.lines;

  for (let i = 0; i < lines.length; i++) {
    if (!ComprehensionState.playing) break;
    document.querySelectorAll('.comp-line').forEach((el,j) => {
      el.classList.toggle('active', j === i);
      el.classList.toggle('revealed', j < i);
    });
    document.querySelectorAll('.comp-line-play').forEach((btn,j) => btn.classList.toggle('speaking', j === i));
    await compSpeakLine(lines[i], speed);
    document.querySelectorAll('.comp-line-play').forEach(btn => btn.classList.remove('speaking'));
    if (!ComprehensionState.playing) break;
    await new Promise(r => setTimeout(r, 350));
  }

  document.querySelectorAll('.comp-line').forEach(el => {
    el.classList.remove('active');
    el.classList.add('revealed');
  });
  ComprehensionState.playing = false;
  document.getElementById('compPlayBtn').textContent = '▶ Play';
}

async function compPlayLine(idx) {
  if (!ComprehensionState.data) return;
  compStop();
  await new Promise(r => setTimeout(r, 80));
  const line = ComprehensionState.data.lines[idx];
  const btn = document.getElementById('comp-line-btn-' + idx);
  document.querySelectorAll('.comp-line').forEach((el,j) => {
    el.classList.toggle('active', j === idx);
    el.classList.remove('revealed');
  });
  if (btn) btn.classList.add('speaking');
  const speed = parseFloat(document.getElementById('compSpeed').value);
  await compSpeakLine(line, speed);
  if (btn) btn.classList.remove('speaking');
  document.querySelectorAll('.comp-line').forEach(el => el.classList.remove('active'));
}

function compSpeakLine(line, speed) {
  return new Promise(resolve => {
    speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(line.text);
    utt.lang = 'ja-JP';
    utt.rate = speed;
    const voice = line.speaker === 'A' ? ComprehensionState.voices[0] : ComprehensionState.voices[1];
    if (voice) utt.voice = voice;
    utt.onend = resolve;
    utt.onerror = resolve;
    speechSynthesis.speak(utt);
  });
}

function compStop() {
  ComprehensionState.playing = false;
  speechSynthesis.cancel();
  document.querySelectorAll('.comp-line-play').forEach(btn => btn.classList.remove('speaking'));
  if (document.getElementById('compPlayBtn'))
    document.getElementById('compPlayBtn').textContent = '▶ Play';
}

function compReplay() {
  compStop();
  // Reset line states
  document.querySelectorAll('.comp-line').forEach(el => {
    el.classList.remove('active','revealed');
  });
  setTimeout(compPlay, 200);
}

function compAnswer(idx) {
  if (!ComprehensionState.data) return;
  const correct = ComprehensionState.data.answer;
  const choices = document.querySelectorAll('.comp-choice');
  choices.forEach((btn, i) => {
    btn.disabled = true;
    if (i === correct) btn.classList.add('correct');
    else if (i === idx) btn.classList.add('wrong');
  });
  document.getElementById('compAnswer').textContent =
    (idx === correct ? '✓ Correct! ' : '✗ Wrong. ') + ComprehensionState.data.explanation;
  document.getElementById('compAnswerArea').style.display = 'block';
  document.getElementById('compAnswerArea').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  // Reveal full script
  document.getElementById('compShowScript').checked = true;
  compToggleScript();
}

// Populate comp voices when ready
if (window.speechSynthesis) {
  speechSynthesis.onvoiceschanged = compPopulateVoices;
  if (speechSynthesis.getVoices().length) compPopulateVoices();
}


// ═══════════════════════════════════════════════════════
// DICTATION MODE
// ═══════════════════════════════════════════════════════
// VideoState.dictationActive → VideoState.dictationActive
// VideoState.dictationCorrect → VideoState.dictationCorrect
// VideoState.dictationTotal → VideoState.dictationTotal
// VideoState.dictationRevealed → VideoState.dictationRevealed

function vtToggleDictation() {
  VideoState.dictationActive = !VideoState.dictationActive;
  const btn = document.getElementById('vtDictateBtn');
  const panel = document.getElementById('vtDictatePanel');
  const videoPanel = document.getElementById('panel-video');
  const video = document.getElementById('vtVideo');
  const inp = document.getElementById('vtDictateInput');
  
  if (VideoState.dictationActive) {
    // Activate dictation mode
    btn.style.background = 'rgba(48,213,200,0.15)';
    btn.style.borderColor = 'var(--teal)';
    btn.style.color = 'var(--teal)';
    panel.style.display = 'block';
    videoPanel.classList.add('vt-dictation-active');
    
    // Enable kana input on the dictation field
    kanaOff(inp); kanaOn(inp);
    
    // Reset stats
    VideoState.dictationCorrect = 0;
    VideoState.dictationTotal = 0;
    VideoState.dictationRevealed = false;
    vtDictateUpdateStats();
    
    // Clear input and feedback
    inp.value = '';
    document.getElementById('vtDictateFeedback').innerHTML = '<span style="color:var(--ink-light);font-size:0.8rem">Listen to the line and type what you hear</span>';
    
    // Pause and prepare current line
    if (video && !video.paused) video.pause();
    
    // Focus the input
    setTimeout(() => inp.focus(), 100);
  } else {
    // Deactivate dictation mode
    btn.style.background = '';
    btn.style.borderColor = 'var(--border)';
    btn.style.color = 'var(--ink-light)';
    panel.style.display = 'none';
    videoPanel.classList.remove('vt-dictation-active');
  }
}

// Toggle hiragana/katakana for dictation input

function vtDictateUpdateStats() {
  const el = document.getElementById('vtDictateStats');
  if (VideoState.dictationTotal === 0) {
    el.textContent = '';
  } else {
    const pct = Math.round((VideoState.dictationCorrect / VideoState.dictationTotal) * 100);
    el.innerHTML = `<span style="color:var(--teal)">${VideoState.dictationCorrect}</span>/<span>${VideoState.dictationTotal}</span> (${pct}%)`;
  }
}

function vtDictateReplay() {
  if (VideoState.activeIdx < 0 || !VideoState.cues[VideoState.activeIdx]) return;
  const video = document.getElementById('vtVideo');
  const cue = VideoState.cues[VideoState.activeIdx];
  video.currentTime = cue.start;
  video.play();
  // Pause at end of cue
  const checkEnd = () => {
    if (video.currentTime >= cue.end - 0.05) {
      video.pause();
      video.removeEventListener('timeupdate', checkEnd);
      document.getElementById('vtDictateInput').focus();
    }
  };
  video.addEventListener('timeupdate', checkEnd);
}

function vtDictateCheck() {
  if (VideoState.dictationRevealed) return; // Already checked/revealed
  
  const input = document.getElementById('vtDictateInput').value.trim();
  const feedback = document.getElementById('vtDictateFeedback');
  
  if (!input) {
    feedback.innerHTML = '<span style="color:var(--gold)">Type something first!</span>';
    return;
  }
  
  if (VideoState.activeIdx < 0 || !VideoState.cues[VideoState.activeIdx]) {
    feedback.innerHTML = '<span style="color:var(--ink-light)">No active line</span>';
    return;
  }
  
  const correct = VideoState.cues[VideoState.activeIdx].text.trim();
  VideoState.dictationTotal++;
  VideoState.dictationRevealed = true;
  
  // Normalize for comparison (remove spaces, convert to hiragana for lenient matching)
  const normalize = s => s.replace(/\s+/g, '').replace(/[。、！？]/g, '');
  const inputNorm = normalize(input);
  const correctNorm = normalize(correct);
  
  if (inputNorm === correctNorm) {
    // Perfect match
    VideoState.dictationCorrect++;
    feedback.innerHTML = `<span style="color:var(--teal)">✓ Perfect!</span> <span style="color:var(--ink)">${correct}</span>`;
  } else {
    // Show diff
    feedback.innerHTML = vtDictateDiff(input, correct);
  }
  
  vtDictateUpdateStats();
}

function vtDictateDiff(input, correct) {
  // Simple character-by-character diff visualization
  let html = '<span style="color:var(--red)">✗</span> ';
  
  // Show what user typed with errors highlighted
  html += '<div style="margin:4px 0"><span style="color:var(--ink-light);font-size:0.72rem">You typed:</span> ';
  const inputChars = [...input];
  const correctChars = [...correct.replace(/\s+/g, '')];
  
  for (let i = 0; i < inputChars.length; i++) {
    const c = inputChars[i];
    if (c === ' ') continue;
    // Check if this char exists at roughly this position
    const isCorrect = correctChars[i] === c;
    if (isCorrect) {
      html += `<span style="color:var(--teal)">${c}</span>`;
    } else {
      html += `<span style="color:var(--red);text-decoration:underline">${c}</span>`;
    }
  }
  html += '</div>';
  
  // Show correct answer
  html += `<div><span style="color:var(--ink-light);font-size:0.72rem">Correct:</span> <span style="color:var(--ink)">${correct}</span></div>`;
  
  return html;
}

function vtDictateReveal() {
  const feedback = document.getElementById('vtDictateFeedback');
  
  if (VideoState.activeIdx < 0 || !VideoState.cues[VideoState.activeIdx]) {
    feedback.innerHTML = '<span style="color:var(--ink-light)">No active line</span>';
    return;
  }
  
  const correct = VideoState.cues[VideoState.activeIdx].text.trim();
  
  if (!VideoState.dictationRevealed) {
    // Count as attempt if not already checked
    VideoState.dictationTotal++;
    VideoState.dictationRevealed = true;
    vtDictateUpdateStats();
  }
  
  feedback.innerHTML = `<span style="color:var(--gold)">Answer:</span> <span style="color:var(--ink)">${correct}</span>`;
}

function vtDictateNext() {
  // Move to next cue
  if (VideoState.activeIdx < VideoState.cues.length - 1) {
    VideoState.activeIdx++;
    const cue = VideoState.cues[VideoState.activeIdx];
    const video = document.getElementById('vtVideo');
    video.currentTime = cue.start;
    
    // Update transcript highlight
    document.querySelectorAll('.vt-cue').forEach((el, i) => {
      el.classList.toggle('active', i === VideoState.activeIdx);
    });
    
    // Scroll to cue
    const cueEl = document.querySelectorAll('.vt-cue')[VideoState.activeIdx];
    if (cueEl) cueEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Reset for new line
    VideoState.dictationRevealed = false;
    document.getElementById('vtDictateInput').value = '';
    document.getElementById('vtDictateFeedback').innerHTML = '<span style="color:var(--ink-light);font-size:0.8rem">Listen and type…</span>';
    
    // Auto-play the new line
    setTimeout(vtDictateReplay, 200);
  }
}

function vtDictateKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (VideoState.dictationRevealed) {
      vtDictateNext();
    } else {
      vtDictateCheck();
    }
  } else if (e.key === 'r' && e.ctrlKey) {
    e.preventDefault();
    vtDictateReplay();
  }
}

// Add R key for replay in dictation mode (when not in input)
document.addEventListener('keydown', e => {
  if (!VideoState.dictationActive) return;
  const panel = document.getElementById('panel-video');
  if (!panel || !panel.classList.contains('vt-fullscreen')) return;
  
  // Don't intercept if typing in input
  if (document.activeElement?.id === 'vtDictateInput') return;
  
  if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    vtDictateReplay();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    vtDictateNext();
  }
});

// ═══════════════════════════════════════════════════════
// BREAKDOWN POPUP
// ═══════════════════════════════════════════════════════
async function vtShowBreakdown() {
  if (VideoState.activeIdx < 0 || !VideoState.cues[VideoState.activeIdx]) {
    alert('No active line to break down');
    return;
  }
  
  const apiKey = _fvid_getApiKey();
  if (!apiKey) return;
  
  const cue = VideoState.cues[VideoState.activeIdx];
  const text = cue.text;
  
  // Show popup
  const popup = document.getElementById('vtBreakdownPopup');
  const lineEl = document.getElementById('vtBreakdownLine');
  const contentEl = document.getElementById('vtBreakdownContent');
  
  popup.style.display = 'block';
  lineEl.innerHTML = text;
  contentEl.innerHTML = '<span style="color:var(--ink-light);font-size:0.85rem">Loading breakdown…</span>';
  
  // Pause video
  const video = document.getElementById('vtVideo');
  if (video && !video.paused) video.pause();
  
  // Style the button as active
  const btn = document.getElementById('vtBreakdownBtn');
  if (btn) {
    btn.style.background = 'rgba(255,184,0,0.15)';
    btn.style.borderColor = 'var(--gold)';
    btn.style.color = 'var(--gold)';
  }
  
  try {
    const data = await _fvid_claudeAPI({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        messages: [{
          role: 'user',
          content: `Break down this Japanese sentence for a German-speaking beginner (N5-N4 level). 

For each word/phrase:
1. Show the word with furigana using <ruby>kanji<rt>reading</rt></ruby>
2. Give the meaning
3. Explain grammar points (particles, verb forms, etc.)

Keep explanations clear and concise. Use HTML formatting. Do NOT use markdown.

Sentence: ${text}`
        }]
    ,
      track: 'video'
    });
    
    const html = (data.content?.[0]?.text || 'No breakdown available').trim();
    
    // Convert any remaining markdown-style formatting to HTML
    let formatted = html
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');
    
    if (!formatted.startsWith('<')) {
      formatted = '<p>' + formatted + '</p>';
    }
    
    contentEl.innerHTML = formatted;
    
  } catch (e) {
    contentEl.innerHTML = '<span style="color:var(--red)">Error loading breakdown</span>';
  }
}

function vtCloseBreakdown() {
  const popup = document.getElementById('vtBreakdownPopup');
  popup.style.display = 'none';
  
  // Reset button style
  const btn = document.getElementById('vtBreakdownBtn');
  if (btn) {
    btn.style.background = '';
    btn.style.borderColor = '';
    btn.style.color = 'var(--ink-light)';
  }
}

// Close breakdown popup on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const popup = document.getElementById('vtBreakdownPopup');
    if (popup && popup.style.display !== 'none') {
      e.stopPropagation();
      vtCloseBreakdown();
    }
  }
}, true);

// Alt+` keyboard shortcut to toggle panels (vars defined earlier at line ~6083)
document.addEventListener('keydown', e => {
  if (e.altKey && (e.key === '`' || e.key === 'Dead' || e.code === 'Backquote')) {
    e.preventDefault();
    if (_lastPanel && _lastPanel !== _currentPanel) {
      const temp = _currentPanel;
      _currentPanel = _lastPanel;
      _lastPanel = temp;
      _fvid_showPanel(_currentPanel);
    }
  }
}, true);


function kanaToggleGrid() {
  const kg = document.getElementById('kanaGrid');
  const btn = document.getElementById('kanaGridToggleBtn');
  if (!kg || !btn) return;
  const hidden = kg.style.display === 'none';
  kg.style.display = hidden ? '' : 'none';
  if (hidden) {
    // Always re-render to ensure correct kana set
    const allKana = (KanaDrillState.mode === 'katakana' || KanaDrillState.mode === 'words') ? KATAKANA : HIRAGANA;
    const el = document.getElementById('kanaGrid');
    el.innerHTML = allKana.map(k => {
      if (!k) return '<div class="kana-cell" style="opacity:0;pointer-events:none"></div>';
      const sw = KanaDrillState.sessionWrong[k.char] || 0;
      const sc = KanaDrillState.sessionCorrect[k.char] || 0;
      const total = sw + sc;
      const ratio = total > 0 ? sc / total : -1;
      const cls = ratio >= 0.8 ? 'mastered' : (total >= 2 && ratio < 0.8 ? 'struggling' : '');
      return `<div class="kana-cell ${cls}"><span class="kana-char">${k.char}</span><span class="kana-rom">${k.rom}</span></div>`;
    }).join('');
  }
  btn.textContent = hidden ? 'Hide grid' : 'Show grid';
}


// ── Watch: Media library ──────────────────────────────────────────────────



// ═══════════════════════════════════════════════════════
// SHADOWING
// ═══════════════════════════════════════════════════════
// VideoState.shadowActive → VideoState.shadowActive
// VideoState.shTargetCue → VideoState.shTargetCue
// VideoState.shTargetAudioCtx → VideoState.shTargetAudioCtx
// VideoState.shTargetBuffer → VideoState.shTargetBuffer
// VideoState.shTargetSource → VideoState.shTargetSource
// VideoState.shTargetPlaying → VideoState.shTargetPlaying
// VideoState.shRecorder → VideoState.shRecorder
// VideoState.shRecording → VideoState.shRecording
// VideoState.shBlob → VideoState.shBlob
// VideoState.shPlaybackAudio → VideoState.shPlaybackAudio
// VideoState.shAnimRaf → VideoState.shAnimRaf
// VideoState.shLiveAnalyser → VideoState.shLiveAnalyser
// VideoState.shLiveRaf → VideoState.shLiveRaf
// VideoState.selectedMicId → VideoState.selectedMicId

// Populate Watch mic selector dropdown
async function vtPopulateMics() {
  const select = document.getElementById('vtMicSelect');
  if (!select) return;
  
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === 'audioinput');
    
    select.innerHTML = '';
    mics.forEach((mic, i) => {
      const label = mic.label || `Microphone ${i + 1}`;
      const isDefault = mic.deviceId === 'default' || label.toLowerCase().includes('default') || i === 0;
      select.innerHTML += `<option value="${mic.deviceId}"${isDefault && !VideoState.selectedMicId ? ' selected' : ''}>${label}</option>`;
    });
    
    const saved = _fvid_Storage().get(STORAGE_KEYS.VT_MIC);
    if (saved && mics.some(m => m.deviceId === saved)) {
      select.value = saved;
      VideoState.selectedMicId = saved;
    } else if (mics.length > 0 && !VideoState.selectedMicId) {
      VideoState.selectedMicId = mics[0].deviceId;
      select.value = VideoState.selectedMicId;
    }
  } catch (e) {
    select.innerHTML = '<option value="">Click to enable mic</option>';
  }
}

function vtSetMic(deviceId) {
  VideoState.selectedMicId = deviceId || null;
  if (deviceId) {
    _fvid_Storage().set(STORAGE_KEYS.VT_MIC, deviceId);
  } else {
    _fvid_Storage().remove(STORAGE_KEYS.VT_MIC);
  }
}

async function vtRequestMicAccess() {
  const select = document.getElementById('vtMicSelect');
  if (select && select.options.length <= 1) {
    await vtPopulateMics();
  }
}

function vtToggleShadow() {
  VideoState.shadowActive = !VideoState.shadowActive;
  const shadowPanel = document.getElementById('vtShadowPanel');
  const shadowHeader = document.getElementById('vtShadowHeader');
  const videoPanel = document.getElementById('panel-video');
  const isFullscreen = videoPanel.classList.contains('vt-fullscreen');
  
  if (VideoState.shadowActive) {
    // In fullscreen, panel is always visible - just toggle active state
    if (!isFullscreen) {
      shadowPanel.style.display = 'flex';
    }
    if (shadowHeader) {
      shadowHeader.style.borderColor = 'var(--red)';
      shadowHeader.style.background = 'rgba(255,107,107,0.08)';
    }
    videoPanel.classList.add('vt-shadow-active');
    if (VideoState.activeIdx >= 0 && VideoState.cues[VideoState.activeIdx]) vtShSetTarget(VideoState.cues[VideoState.activeIdx]);
    // Populate mic selector
    vtPopulateMics();
  } else {
    // In fullscreen, keep panel visible but collapse recording section
    if (!isFullscreen) {
      shadowPanel.style.display = 'none';
    }
    if (shadowHeader) {
      shadowHeader.style.borderColor = '';
      shadowHeader.style.background = '';
    }
    videoPanel.classList.remove('vt-shadow-active');
    vtShStopAll();
  }
}

// Auto-load cue when video pauses in shadow mode
document.getElementById('vtVideo').addEventListener('pause', () => {
  if (VideoState.shadowActive && VideoState.activeIdx >= 0 && VideoState.cues[VideoState.activeIdx]) vtShSetTarget(VideoState.cues[VideoState.activeIdx]);
});

function vtShSetTarget(cue) {
  VideoState.shTargetCue = cue;
  vtShStopAll();
  document.getElementById('vtShadowTarget').textContent = cue.text || '—';
  document.getElementById('vtShStatus').textContent = 'Extracting audio…';
  document.getElementById('vtShTargetTime').textContent = '0:00';
  vtShClearWave('vtShTargetWave');
  vtShClearWave('vtShShadowWave');
  vtShExtractTargetAudio(cue);
}

async function vtShExtractTargetAudio(cue) {
  const video = document.getElementById('vtVideo');
  if (!video.src || cue.start === null) {
    document.getElementById('vtShStatus').textContent = 'No video loaded';
    return;
  }
  try {
    if (!VideoState.shTargetAudioCtx) VideoState.shTargetAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const resp = await fetch(video.src);
    const arrayBuf = await resp.arrayBuffer();
    const fullBuf = await VideoState.shTargetAudioCtx.decodeAudioData(arrayBuf);
    const sr = fullBuf.sampleRate;
    const startSample = Math.floor(cue.start * sr);
    const dur = (cue.end && cue.end > cue.start) ? (cue.end - cue.start) : 4;
    const endSample = Math.min(Math.floor((cue.start + dur) * sr), fullBuf.length);
    const len = endSample - startSample;
    if (len <= 0) { document.getElementById('vtShStatus').textContent = 'Could not extract clip'; return; }
    const clip = VideoState.shTargetAudioCtx.createBuffer(fullBuf.numberOfChannels, len, sr);
    for (let ch = 0; ch < fullBuf.numberOfChannels; ch++)
      clip.getChannelData(ch).set(fullBuf.getChannelData(ch).subarray(startSample, endSample));
    VideoState.shTargetBuffer = clip;
    vtShDrawStaticWave('vtShTargetWave', clip);
    document.getElementById('vtShStatus').textContent = 'Ready — press ▶ Target or ⏺ Record';
  } catch(e) {
    document.getElementById('vtShStatus').textContent = 'Audio extract error: ' + e.message;
  }
}

function vtShPlayTarget() {
  if (!VideoState.shTargetBuffer) return;
  if (VideoState.shTargetPlaying) { vtShStopTarget(); return; }
  if (VideoState.shTargetAudioCtx.state === 'suspended') VideoState.shTargetAudioCtx.resume();
  const src = VideoState.shTargetAudioCtx.createBufferSource();
  src.buffer = VideoState.shTargetBuffer;
  src.connect(VideoState.shTargetAudioCtx.destination);
  src.start();
  VideoState.shTargetSource = src; VideoState.shTargetPlaying = true;
  document.getElementById('vtShTargetPlayBtn').textContent = '⏹ Stop';
  const startT = performance.now(), dur = VideoState.shTargetBuffer.duration * 1000;
  function frame() {
    if (!VideoState.shTargetPlaying) return;
    const pct = Math.min((performance.now() - startT) / dur, 1);
    vtShDrawStaticWave('vtShTargetWave', VideoState.shTargetBuffer, pct);
    const s = Math.floor(pct * VideoState.shTargetBuffer.duration);
    document.getElementById('vtShTargetTime').textContent = Math.floor(s/60) + ':' + String(s%60).padStart(2,'0');
    VideoState.shAnimRaf = requestAnimationFrame(frame);
  }
  frame();
  src.onended = () => {
    VideoState.shTargetPlaying = false; VideoState.shTargetSource = null;
    cancelAnimationFrame(VideoState.shAnimRaf);
    document.getElementById('vtShTargetPlayBtn').textContent = '▶ Target';
    vtShDrawStaticWave('vtShTargetWave', VideoState.shTargetBuffer);
    if (document.getElementById('vtShRepeat').checked && VideoState.shadowActive) setTimeout(vtShRecord, 400);
  };
}

function vtShStopTarget() {
  if (VideoState.shTargetSource) { try { VideoState.shTargetSource.stop(); } catch(e) {} VideoState.shTargetSource = null; }
  VideoState.shTargetPlaying = false;
  cancelAnimationFrame(VideoState.shAnimRaf);
  document.getElementById('vtShTargetPlayBtn').textContent = '▶ Target';
}

function vtShSeekTarget(e) {
  if (!VideoState.shTargetBuffer) return;
  const canvas = document.getElementById('vtShTargetWave');
  const pct = (e.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth;
  vtShStopTarget();
  if (VideoState.shTargetAudioCtx.state === 'suspended') VideoState.shTargetAudioCtx.resume();
  const src = VideoState.shTargetAudioCtx.createBufferSource();
  src.buffer = VideoState.shTargetBuffer;
  src.connect(VideoState.shTargetAudioCtx.destination);
  const sk = pct * VideoState.shTargetBuffer.duration;
  src.start(0, sk);
  VideoState.shTargetSource = src; VideoState.shTargetPlaying = true;
  document.getElementById('vtShTargetPlayBtn').textContent = '⏹ Stop';
  const startT = performance.now() - sk * 1000, dur = VideoState.shTargetBuffer.duration * 1000;
  function frame() {
    if (!VideoState.shTargetPlaying) return;
    vtShDrawStaticWave('vtShTargetWave', VideoState.shTargetBuffer, Math.min((performance.now()-startT)/dur,1));
    VideoState.shAnimRaf = requestAnimationFrame(frame);
  }
  frame();
  src.onended = () => {
    VideoState.shTargetPlaying = false; VideoState.shTargetSource = null;
    cancelAnimationFrame(VideoState.shAnimRaf);
    document.getElementById('vtShTargetPlayBtn').textContent = '▶ Target';
    if (document.getElementById('vtShRepeat').checked && VideoState.shadowActive) setTimeout(vtShRecord, 400);
  };
}

async function vtShRecord() {
  if (VideoState.shRecording) { vtShStopRecord(); return; }
  vtShStopTarget();
  try {
    const constraints = { audio: VideoState.selectedMicId ? { deviceId: { exact: VideoState.selectedMicId } } : true };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (!VideoState.shTargetAudioCtx) VideoState.shTargetAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    VideoState.shLiveAnalyser = VideoState.shTargetAudioCtx.createAnalyser();
    VideoState.shLiveAnalyser.fftSize = 512;
    const micSrc = VideoState.shTargetAudioCtx.createMediaStreamSource(stream);
    micSrc.connect(VideoState.shLiveAnalyser);
    vtShDrawLiveWave();
    const chunks = [];
    VideoState.shRecorder = new MediaRecorder(stream);
    VideoState.shRecorder.ondataavailable = e => chunks.push(e.data);
    VideoState.shRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      cancelAnimationFrame(VideoState.shLiveRaf);
      VideoState.shBlob = new Blob(chunks, { type: 'audio/webm' });
      vtShDrawBlobWave(VideoState.shBlob);
      document.getElementById('vtShPlaybackBtn').disabled = false;
      document.getElementById('vtShPlaybackBtn').style.opacity = '1';
      document.getElementById('vtShStatus').textContent = '✓ Recorded — press ▶ Playback';
      VideoState.shRecording = false;
      document.getElementById('vtShRecordBtn').textContent = '⏺ Record';
      document.getElementById('vtShRecordBtn').style.background = 'var(--red)';
      if (document.getElementById('vtShRepeat').checked && VideoState.shadowActive) setTimeout(vtShPlayTarget, 600);
    };
    VideoState.shRecorder.start(); VideoState.shRecording = true;
    document.getElementById('vtShRecordBtn').textContent = '⏹ Stop';
    document.getElementById('vtShRecordBtn').style.background = '#a00';
    document.getElementById('vtShStatus').textContent = '🔴 Recording…';
  } catch(e) {
    document.getElementById('vtShStatus').textContent = 'Microphone access denied';
  }
}

function vtShStopRecord() {
  if (VideoState.shRecorder && VideoState.shRecording) VideoState.shRecorder.stop();
}

function vtShPlayback() {
  if (!VideoState.shBlob) return;
  if (VideoState.shPlaybackAudio) { VideoState.shPlaybackAudio.pause(); VideoState.shPlaybackAudio = null; }
  const url = URL.createObjectURL(VideoState.shBlob);
  VideoState.shPlaybackAudio = new Audio(url);
  VideoState.shPlaybackAudio.play();
  document.getElementById('vtShStatus').textContent = '▶ Playing back…';
  VideoState.shPlaybackAudio.onended = () => {
    document.getElementById('vtShStatus').textContent = '';
    URL.revokeObjectURL(url);
  };
}

function vtShStopAll() {
  vtShStopTarget();
  if (VideoState.shRecorder && VideoState.shRecording) { try { VideoState.shRecorder.stop(); } catch(e) {} }
  if (VideoState.shPlaybackAudio) { VideoState.shPlaybackAudio.pause(); VideoState.shPlaybackAudio = null; }
  cancelAnimationFrame(VideoState.shLiveRaf);
  VideoState.shRecording = false;
}

function vtShDrawStaticWave(id, buffer, progress) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const W = canvas.offsetWidth || 300, H = 48;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const raw = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(raw.length / W));
  const mid = H / 2;
  ctx.fillStyle = '#0a0a0c'; ctx.fillRect(0, 0, W, H);
  const pw = progress != null ? Math.floor(progress * W) : W;
  for (let i = 0; i < W; i++) {
    let mx = 0;
    for (let j = 0; j < step; j++) mx = Math.max(mx, Math.abs(raw[i*step+j] || 0));
    const amp = Math.max(1, mx * (mid - 2));
    ctx.fillStyle = i < pw ? '#30d5c8' : 'rgba(48,213,200,0.22)';
    ctx.fillRect(i, mid - amp, 1, amp * 2);
  }
}

function vtShClearWave(id) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  canvas.width = canvas.offsetWidth || 300; canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0a0c'; ctx.fillRect(0, 0, canvas.width, 48);
}

function vtShDrawLiveWave() {
  const canvas = document.getElementById('vtShShadowWave');
  if (!canvas || !VideoState.shLiveAnalyser) return;
  canvas.width = canvas.offsetWidth || 300; canvas.height = 48;
  const ctx = canvas.getContext('2d');
  const data = new Uint8Array(VideoState.shLiveAnalyser.frequencyBinCount);
  const W = canvas.width, H = 48;
  function frame() {
    if (!VideoState.shRecording) return;
    VideoState.shLiveAnalyser.getByteTimeDomainData(data);
    ctx.fillStyle = '#0a0a0c'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 1.5; ctx.beginPath();
    const sw = W / data.length;
    for (let i = 0; i < data.length; i++) {
      const y = (data[i] / 128) * H / 2;
      i === 0 ? ctx.moveTo(0, y) : ctx.lineTo(i * sw, y);
    }
    ctx.stroke();
    VideoState.shLiveRaf = requestAnimationFrame(frame);
  }
  frame();
}

async function vtShDrawBlobWave(blob) {
  try {
    const ab = await blob.arrayBuffer();
    const buf = await VideoState.shTargetAudioCtx.decodeAudioData(ab);
    vtShDrawStaticWave('vtShShadowWave', buf);
  } catch(e) {}
}

window['vtToggleShadow'] = vtToggleShadow;
window['vtShPlayTarget'] = vtShPlayTarget;
window['vtShRecord'] = vtShRecord;
window['vtShPlayback'] = vtShPlayback;
window['vtShSeekTarget'] = vtShSeekTarget;

// ── RESOURCES MANAGEMENT ─────────────────────────────────────────────────────
const RESOURCES_KEY = 'japaneseStudioResources';

const DEFAULT_RESOURCES = [
  { name: 'Yoshida to Nihongo', url: 'https://yoshidatonihongo.com/', icon: '🎙', desc: 'Pocket Lessons podcast series (N5–N4) with transcripts — perfect for listening focus.', tags: 'listening · reading · podcast' },
  { name: 'jconj (original)', url: 'https://baileysnyder.com/jconj/', icon: '🔀', desc: 'The original conjugation practice tool by Bailey Snyder.', tags: 'conjugation · drills' },
  { name: 'Anki', url: 'https://ankiweb.net', icon: '🃏', desc: 'SRS flashcard tool. Use AnkiWeb to review on any device.', tags: 'flashcards · srs · core tool' },
  { name: 'Comprehensible Japanese', url: 'https://cijapanese.com/landing', icon: '🎧', desc: 'Immersion-based videos for true beginners through upper levels.', tags: 'listening · immersion' },
  { name: 'Jisho.org', url: 'https://jisho.org', icon: '🔍', desc: 'The best free Japanese dictionary. Search kanji by stroke, meaning, or reading.', tags: 'dictionary' },
  { name: 'CJ YouTube Channel', url: 'https://www.youtube.com/@cijapanese', icon: '▶️', desc: 'Free beginner listening. Start with "Absolute Beginner" playlist.', tags: 'youtube · free' },
  { name: 'NHK World Lessons', url: 'https://www.nhk.or.jp/lesson/', icon: '📡', desc: 'Free structured Japanese lessons from Japan\'s national broadcaster.', tags: 'free · structured' },
  { name: 'Renshuu.org', url: 'https://www.renshuu.org', icon: '📝', desc: 'Free drills for kana, vocab, kanji, and grammar.', tags: 'drills · free' },
  { name: 'Heisig RTK Index', url: 'https://hochanh.github.io/rtk/', icon: '漢', desc: 'Remembering the Kanji — searchable online index of all Heisig keywords and primitives.', tags: 'kanji · heisig · reference' },
  { name: 'Kanji Koohii', url: 'https://kanji.koohii.com', icon: '📚', desc: 'Community site for Heisig\'s method. Share and browse mnemonics for each kanji.', tags: 'kanji · heisig · srs · community' },
  { name: 'WaniKani', url: 'https://www.wanikani.com', icon: '🦀', desc: 'SRS-based kanji learning with mnemonics and radicals.', tags: 'kanji · srs' },
  { name: 'Bunpro', url: 'https://bunpro.jp', icon: '🏯', desc: 'SRS for Japanese grammar. Learn and review grammar points systematically.', tags: 'grammar · srs' }
];

function resourcesGet() {
  try {
    const stored = localStorage.getItem(RESOURCES_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {}
  return [...DEFAULT_RESOURCES];
}

function resourcesSave(resources) {
  try {
    localStorage.setItem(RESOURCES_KEY, JSON.stringify(resources));
  } catch (e) {}
}

function resourcesRender() {
  const grid = document.getElementById('resourcesGrid');
  if (!grid) return;
  
  const resources = resourcesGet();
  
  if (resources.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--ink-light);font-family:var(--ui)">No resources yet. Add some above!</div>';
    return;
  }
  
  // Separate YouTube and other resources, keeping original indices
  const youtubeResources = [];
  const otherResources = [];
  resources.forEach((r, i) => {
    if (r.url && (r.url.includes('youtube.com') || r.url.includes('youtu.be'))) {
      youtubeResources.push({ ...r, originalIndex: i });
    } else {
      otherResources.push({ ...r, originalIndex: i });
    }
  });
  
  const renderCard = (r) => `
    <div class="res-card" style="position:relative" id="res-card-${r.originalIndex}">
      <div style="position:absolute;top:8px;right:8px;display:flex;gap:4px">
        <button class="btn-icon" onclick="event.preventDefault();event.stopPropagation();resourcesEdit(${r.originalIndex})"
          onmouseover="this.style.opacity='1';this.style.color='var(--teal)'" 
          onmouseout="this.style.opacity='0.5';this.style.color='var(--ink-light)'"
          title="Edit">✎</button>
        <button class="btn-icon" onclick="event.preventDefault();event.stopPropagation();resourcesDelete(${r.originalIndex})"
          onmouseover="this.style.opacity='1';this.style.color='var(--red)'" 
          onmouseout="this.style.opacity='0.5';this.style.color='var(--ink-light)'"
          title="Delete">✕</button>
      </div>
      <a href="${r.url}" target="_blank" style="text-decoration:none;color:inherit;display:block">
        <div class="res-icon">${r.icon || '🔗'}</div>
        <div class="res-name">${r.name}</div>
        ${r.desc ? `<div class="res-desc">${r.desc}</div>` : ''}
        ${r.tags ? `<div class="res-tag">${r.tags}</div>` : ''}
      </a>
    </div>
  `;
  
  let html = '';
  
  // YouTube section
  if (youtubeResources.length > 0) {
    html += `
      <div style="grid-column:1/-1;margin-bottom:8px;margin-top:4px">
        <div style="font-family:var(--ui);font-size:0.7rem;letter-spacing:0.08em;color:var(--red);display:flex;align-items:center;gap:8px">
          <span>▶️ YOUTUBE</span>
          <div style="flex:1;height:1px;background:var(--border)"></div>
        </div>
      </div>
    `;
    html += youtubeResources.map(renderCard).join('');
  }
  
  // Other resources section
  if (otherResources.length > 0) {
    if (youtubeResources.length > 0) {
      html += `
        <div style="grid-column:1/-1;margin-bottom:8px;margin-top:16px">
          <div style="font-family:var(--ui);font-size:0.7rem;letter-spacing:0.08em;color:var(--ink-light);display:flex;align-items:center;gap:8px">
            <span>🔗 OTHER RESOURCES</span>
            <div style="flex:1;height:1px;background:var(--border)"></div>
          </div>
        </div>
      `;
    }
    html += otherResources.map(renderCard).join('');
  }
  
  grid.innerHTML = html;
}

async function resourcesAdd() {
  const urlEl = document.getElementById('resNewUrl');
  const btn = document.getElementById('resAddBtn');
  
  const url = urlEl?.value?.trim();
  
  if (!url) {
    alert('Please enter a URL');
    return;
  }
  
  // Validate URL
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    alert('URL must start with http:// or https://');
    return;
  }
  
  // Check for API key
  const apiKey = _fvid_getApiKey();
  if (!apiKey) {
    // Fallback: add with basic info extracted from URL
    const resources = resourcesGet();
    const domain = new URL(url).hostname.replace('www.', '');
    resources.push({ 
      name: domain, 
      url, 
      icon: resourcesPickIcon(url), 
      desc: '', 
      tags: '' 
    });
    resourcesSave(resources);
    if (urlEl) urlEl.value = '';
    resourcesRender();
    return;
  }
  
  // Show loading
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Adding...';
  }
  
  try {
    const data = await _fvid_claudeAPI({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{ role: 'user', content: `Generate metadata for this Japanese learning resource URL: ${url}

Return ONLY a JSON object with:
- "name": short name for the site (2-4 words)
- "desc": brief description for a Japanese learner (15-25 words)
- "tags": relevant tags separated by · (e.g. "grammar · srs · free")
- "icon": single emoji that fits the resource type

Example: {"name":"Jisho.org","desc":"Comprehensive Japanese dictionary with kanji lookup by radical, drawing, or reading.","tags":"dictionary · free","icon":"🔍"}

Return ONLY valid JSON, no explanation.` }]
    ,
      track: 'lesson'
    });
    
    const raw = (data.content?.[0]?.text || '').trim();
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const meta = JSON.parse(cleaned);
    
    const resources = resourcesGet();
    resources.push({
      name: meta.name || new URL(url).hostname,
      url,
      icon: meta.icon || resourcesPickIcon(url),
      desc: meta.desc || '',
      tags: meta.tags || ''
    });
    resourcesSave(resources);
    
    if (urlEl) urlEl.value = '';
    resourcesRender();
    
  } catch (e) {
    console.error('Resource add error:', e);
    // Fallback on error
    const resources = resourcesGet();
    const domain = new URL(url).hostname.replace('www.', '');
    resources.push({ name: domain, url, icon: resourcesPickIcon(url), desc: '', tags: '' });
    resourcesSave(resources);
    if (urlEl) urlEl.value = '';
    resourcesRender();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '+ Add';
    }
  }
}

function resourcesPickIcon(url) {
  if (url.includes('youtube')) return '▶️';
  if (url.includes('podcast') || url.includes('audio')) return '🎧';
  if (url.includes('anki') || url.includes('srs')) return '🃏';
  if (url.includes('kanji')) return '漢';
  if (url.includes('grammar') || url.includes('bunpro')) return '📖';
  if (url.includes('dict') || url.includes('jisho')) return '🔍';
  if (url.includes('nhk')) return '📡';
  return '🔗';
}

function resourcesEdit(idx) {
  const resources = resourcesGet();
  const r = resources[idx];
  if (!r) return;
  
  const card = document.getElementById('res-card-' + idx);
  if (!card) return;
  
  card.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;gap:8px;align-items:center">
        <input type="text" id="res-edit-icon-${idx}" value="${r.icon || '🔗'}" style="width:40px;padding:6px;text-align:center;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--ink);font-size:1.1rem">
        <input type="text" id="res-edit-name-${idx}" value="${r.name}" placeholder="Name" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--ink);font-family:var(--ui);font-size:0.85rem">
      </div>
      <input type="text" id="res-edit-url-${idx}" value="${r.url}" placeholder="URL" style="padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--ink);font-family:var(--ui);font-size:0.8rem">
      <textarea id="res-edit-desc-${idx}" placeholder="Description" style="padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--ink);font-family:var(--ui);font-size:0.8rem;resize:vertical;min-height:50px">${r.desc || ''}</textarea>
      <input type="text" id="res-edit-tags-${idx}" value="${r.tags || ''}" placeholder="Tags: grammar · srs · free" style="padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--ink);font-family:var(--ui);font-size:0.8rem">
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-ghost" onclick="resourcesRender()">Cancel</button>
        <button class="btn-primary" onclick="resourcesSaveEdit(${idx})">Save</button>
      </div>
    </div>
  `;
}

function resourcesSaveEdit(idx) {
  const resources = resourcesGet();
  
  const icon = document.getElementById('res-edit-icon-' + idx)?.value?.trim() || '🔗';
  const name = document.getElementById('res-edit-name-' + idx)?.value?.trim();
  const url = document.getElementById('res-edit-url-' + idx)?.value?.trim();
  const desc = document.getElementById('res-edit-desc-' + idx)?.value?.trim();
  const tags = document.getElementById('res-edit-tags-' + idx)?.value?.trim();
  
  if (!name || !url) {
    alert('Name and URL are required');
    return;
  }
  
  resources[idx] = { icon, name, url, desc, tags };
  resourcesSave(resources);
  resourcesRender();
}

function resourcesDelete(idx) {
  if (!confirm('Delete this resource?')) return;
  
  const resources = resourcesGet();
  resources.splice(idx, 1);
  resourcesSave(resources);
  resourcesRender();
}

function resourcesReset() {
  if (!confirm('Reset to default resources? This will remove all your custom links.')) return;
  localStorage.removeItem(RESOURCES_KEY);
  resourcesRender();
}

// Initialize resources on page load
document.addEventListener('storageReady', resourcesRender);

window['resourcesAdd'] = resourcesAdd;



// ── Watch: saved file links + history + file input wiring ──────────────────
// ── Watch: saved file links ───────────────────────────────────────────────
// VideoState.savedFiles → VideoState.savedFiles

function vtAddSavedLink(name, type, url) {
  if (type !== 'video') return;
  // Move to top if already exists (preserve transcript), else add
  const existing = VideoState.savedFiles.find(f => f.name === name);
  VideoState.savedFiles = VideoState.savedFiles.filter(f => f.name !== name);
  VideoState.savedFiles.unshift(existing || { name, type, url });
  VideoState.savedFiles[0].url = url; // Update URL (new blob)
  if (VideoState.savedFiles.length > 10) VideoState.savedFiles = VideoState.savedFiles.slice(0, 10);
  vtSaveHistory();
  vtUpdateHistoryDropdown();
  // Set name label to current video
  const nameEl = document.getElementById('vtLoadedName');
  if (nameEl) nameEl.textContent = name;
  // Show the loaded bar
  document.getElementById('vtLoadedBar').style.display = 'flex';
}

function vtSaveHistory() {
  try {
    // Save name, type, transcript (but not blob URL - those don't persist)
    const toSave = VideoState.savedFiles.map(f => ({
      name: f.name,
      type: f.type,
      transcript: f.transcript || null,
      transcriptName: f.transcriptName || null
    }));
    _fvid_Storage().set(STORAGE_KEYS.VT_VIDEO_HISTORY, JSON.stringify(toSave));
  } catch(e) { console.warn('Could not save video history', e); }
}

function vtLoadHistory() {
  try {
    const saved = JSON.parse(_fvid_Storage().get(STORAGE_KEYS.VT_VIDEO_HISTORY) || '[]');
    VideoState.savedFiles = saved.map(f => ({ ...f, url: null })); // URLs don't persist
  } catch(e) { VideoState.savedFiles = []; }
}

// Load history on startup
vtLoadHistory();

function vtUpdateHistoryDropdown() {
  const select = document.getElementById('vtHistorySelect');
  if (!select) return;
  
  // Get current video (one with active URL)
  const current = VideoState.savedFiles.find(f => f.url);
  const currentName = current ? current.name : '';
  
  // Build options - current video first, then history
  let html = '';
  if (currentName) {
    html += `<option value="" selected>🎬 ${currentName}</option>`;
  } else {
    html += '<option value="">— Recent videos —</option>';
  }
  
  // Add recent videos (all except current)
  const history = VideoState.savedFiles.filter(f => f.name !== currentName).slice(0, 8);
  if (history.length > 0) {
    html += '<option disabled>───────────</option>';
    history.forEach((f, i) => {
      const idx = VideoState.savedFiles.findIndex(sf => sf.name === f.name);
      const hasTranscript = f.transcript && f.transcript.length > 0;
      const icon = f.url ? '🎬' : (hasTranscript ? '📄' : '○');
      html += `<option value="${idx}">${icon} ${f.name}</option>`;
    });
  }
  
  select.innerHTML = html;
}

function vtLoadFromHistory(indexStr) {
  if (!indexStr) return;
  const index = parseInt(indexStr);
  const f = VideoState.savedFiles[index];
  if (!f) return;
  
  // Reset dropdown to show loading state
  const select = document.getElementById('vtHistorySelect');
  if (select) select.value = '';
  
  if (f.url) {
    // We have the blob URL still
    const v = document.getElementById('vtVideo');
    v.src = f.url;
    v.load();
    // Move to top of list
    VideoState.savedFiles.splice(index, 1);
    VideoState.savedFiles.unshift(f);
    vtUpdateHistoryDropdown();
    // Try to load matching transcript
    vtTryLoadMatchingTranscript(f.name);
  } else {
    // Need to re-select the file - store the name so we can load transcript after
    VideoState.pendingHistoryName = f.name;
    VideoState.pendingHistoryEntry = f;
    
    const hasTranscript = f.transcript && f.transcript.length > 0;
    const msg = hasTranscript 
      ? `Re-select video file "${f.name}"\n\nTranscript will auto-load (${f.transcript.length} lines saved)`
      : `Re-select video file "${f.name}"`;
    alert(msg);
    document.getElementById('vtVideoInput').click();
  }
}

function vtTryLoadMatchingTranscript(videoName) {
  // Look for a saved transcript that matches the video name
  // Strip extension from video name
  const baseName = videoName.replace(/\.[^.]+$/, '');
  
  // Check if we have transcript data saved
  const savedTrans = VideoState.savedFiles.find(f => 
    f.transcript && 
    (f.name === videoName || f.name.replace(/\.[^.]+$/, '') === baseName)
  );
  
  if (savedTrans && savedTrans.transcript) {
    VideoState.cues = savedTrans.transcript;
    vtRenderTranscript();
    document.getElementById('vtTranscriptWrap').style.display = 'flex';
    document.getElementById('vtNoTranscript').style.display = 'none';
  }
}

function vtRenderSavedLinks() {
  vtUpdateHistoryDropdown();
}





// VideoState.pendingHistoryName → VideoState.pendingHistoryName

// ── Watch: word translate on mouse-up ────────────────────────────────────
function vtWordSelect(cueIdx, event) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) {
    vtCueClick(cueIdx);
    return;
  }
  const word = sel.toString().trim();
  if (!word) { vtCueClick(cueIdx); return; }
  event.stopPropagation();
  sel.removeAllRanges();
  vtTranslateWord(word, event);
}

function vtTranslateWord(word, event) {
  if (!_fvid_getApiKey()) return;
  // Reuse qrOverlay popup pattern
  const existing = document.getElementById('vtWordPopup');
  if (existing) existing.remove();
  const popup = document.createElement('div');
  popup.id = 'vtWordPopup';
  popup.style.cssText = 'position:fixed;z-index:9999;background:#1c1c1e;border:1px solid var(--border);border-radius:8px;padding:12px 16px;min-width:180px;max-width:280px;box-shadow:0 4px 20px rgba(0,0,0,0.4);font-family:var(--ui)';
  const x = Math.min(event.clientX, window.innerWidth - 300);
  const y = Math.min(event.clientY + 12, window.innerHeight - 160);
  popup.style.left = x + 'px';
  popup.style.top  = y + 'px';
  popup.innerHTML = `<div style="font-size:1.1rem;color:var(--ink);margin-bottom:6px">${word}</div>
    <div id="vtWordResult" style="font-size:0.82rem;color:var(--ink-light)">Translating…</div>
    <button class="btn-icon" onclick="document.getElementById('vtWordPopup').remove()">✕</button>`;
  document.body.appendChild(popup);
  document.addEventListener('click', function dismiss(e) {
    if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', dismiss); }
  });
  _fvid_claudeAPI({ model:'claude-sonnet-4-20250514', max_tokens:120,
      messages:[{role:'user',content:`Translate the Japanese word/phrase "${word}" to English. Reply with: reading in hiragana, then a dash, then the English meaning. One line only.`}],
        track: 'video'
      }).then(d=>{
    const res = document.getElementById('vtWordResult');
    if (res) res.textContent = d.content?.[0]?.text || '—';
  }).catch(()=>{
    const res = document.getElementById('vtWordResult');
    if (res) res.textContent = 'Error translating.';
  });
}


// Wire up file inputs with addEventListener (more reliable in Safari)
(function() {
  function wireVtInputs() {
    const vi = document.getElementById('vtVideoInput');
    const ti = document.getElementById('vtTransInput');
    const dz = document.getElementById('vtDropZone');
    if (vi) vi.addEventListener('change', function() {
      const files = [...this.files];
      const videoFile = files.find(f => f.type.startsWith('video/') || f.type.startsWith('audio/'));
      const transFile = files.find(f => /\.(srt|vtt|txt)$/i.test(f.name));
      if (videoFile) {
        // If this was triggered by a history reload, update the stored URL and load saved transcript
        if (VideoState.pendingHistoryName) {
          const hf = VideoState.savedFiles.find(f => f.name === VideoState.pendingHistoryName);
          if (hf) { 
            hf.url = URL.createObjectURL(videoFile); 
            vtRenderSavedLinks();
            // Load saved transcript after video loads
            if (hf.transcript && hf.transcript.length > 0 && !transFile) {
              setTimeout(() => {
                VideoState.cues = hf.transcript;
                vtRenderTranscript();
                document.getElementById('vtTranscriptWrap').style.display = 'flex';
                document.getElementById('vtNoTranscript').style.display = 'none';
              }, 100);
            }
          }
          VideoState.pendingHistoryName = null;
        }
        vtLoadFile(videoFile);
      }
      if (transFile) {
        vtLoadTransFile(transFile);
      } else if (videoFile) {
        const base = videoFile.name.replace(/\.[^.]+$/, '').toLowerCase();
        const matchTrans = ext => files.find(f => f.name.toLowerCase() === base + ext);
        const autoTrans = matchTrans('.vtt') || matchTrans('.srt') || matchTrans('.txt');
        if (autoTrans) vtLoadTransFile(autoTrans);
      }
      this.value='';
    });
    if (ti) ti.addEventListener('change', function() { if (this.files[0]) { vtLoadTransFile(this.files[0]); this.value=''; } });
    const fi = document.getElementById('vtFolderInput');
    if (fi) fi.addEventListener('change', function() {
      const files = [...this.files];
      const videoFile = files.find(f => f.type.startsWith('video/') || f.type.startsWith('audio/'));
      if (!videoFile) return;
      vtLoadFile(videoFile);
      const base = videoFile.name.replace(/\.[^.]+$/, '').toLowerCase();
      const matchTrans = ext => files.find(f => f.name.toLowerCase() === base + ext);
      const autoTrans = matchTrans('.vtt') || matchTrans('.srt') || matchTrans('.txt');
      if (autoTrans) vtLoadTransFile(autoTrans);
      this.value = '';
    });

  }
  if (document.readyState === 'loading') {
   document.addEventListener('DOMContentLoaded', wireVtInputs);
  } else {
    wireVtInputs();
  }
})();



// Auto-load transcript with same base name (works when both files selected together)
// In browser we can't access filesystem — hint is shown instead
// ── Moji: magnify stroke order overlay ───────────────────────────────────
function strokeMagnify(ch) {
  const existing = document.getElementById('strokeMagnifyOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'strokeMagnifyOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer';
  overlay.onclick = () => overlay.remove();

  const box = document.createElement('div');
  box.style.cssText = 'background:#111;border-radius:12px;padding:24px;position:relative;cursor:default';
  box.onclick = e => e.stopPropagation();

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'position:absolute;top:10px;right:12px;background:none;border:none;color:var(--ink-light);font-size:1rem;cursor:pointer';
  closeBtn.onclick = () => overlay.remove();

  const lbl = document.createElement('div');
  lbl.textContent = ch;
  lbl.style.cssText = 'font-family:"Noto Sans JP",sans-serif;font-size:1.2rem;color:var(--ink-light);text-align:center;margin-bottom:12px;letter-spacing:0.1em';

  const target = document.createElement('div');
  const MSZ = Math.min(window.innerWidth, window.innerHeight) * 0.6;
  target.style.cssText = 'width:' + MSZ + 'px;height:' + MSZ + 'px;background:#111';

  box.appendChild(closeBtn);
  box.appendChild(lbl);
  box.appendChild(target);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Always use Kan-G numbered SVG for the magnify view
  const hex = ch.codePointAt(0).toString(16).padStart(5, '0');
  const img = document.createElement('img');
  img.src = 'https://kan-g.vnaka.dev/k/' + hex + '.svg';
  img.style.cssText = 'width:100%;height:100%;object-fit:contain';
  target.appendChild(img);
}


// ── Moji: get reading for a character ────────────────────────────────────
function strokeGetReading(ch) {
  // Sync: kana returns immediately
  const cp = ch.codePointAt(0);
  if (cp >= 0x3041 && cp <= 0x3096) return ch; // hiragana
  if (cp >= 0x30A1 && cp <= 0x30F6) return String.fromCharCode(cp - 0x60); // katakana→hiragana
  return ''; // kanji: filled async by strokeFetchReadings
}

// Fetch readings for all kanji tiles in one AI call
async function strokeFetchReadings(chars, word) {
  const kanji = chars.filter(ch => {
    const cp = ch.codePointAt(0);
    return cp >= 0x4E00 && cp <= 0x9FFF || cp >= 0x3400 && cp <= 0x4DBF;
  });
  if (!kanji.length) return;
  const apiKey = _fvid_getApiKey();
  if (!apiKey) return;
  try {
    const data = await _fvid_claudeAPI({
        model: 'claude-sonnet-4-20250514', max_tokens: 200,
        messages: [{ role: 'user', content:
          `For the Japanese word "${word}", give the reading of each character as it is read IN CONTEXT of that word. Reply ONLY with a JSON object mapping each character to its reading, e.g. {"東":"とう","京":"きょう"}. Characters: ${JSON.stringify(kanji)}` }]
    ,
      track: 'writing'
    });
    const raw = (data.content?.[0]?.text || '').trim().replace(/```json|```/g,'');
    const map = JSON.parse(raw);
    // Update reading divs
    chars.forEach((ch, i) => {
      if (map[ch]) {
        const rdiv = document.getElementById('stroke-reading-' + i);
        if (rdiv) rdiv.textContent = map[ch];
      }
    });
  } catch(e) { /* silently fail */ }
}



// ── Watch: saved file links ───────────────────────────────────────────────
// VideoState.savedFiles → VideoState.savedFiles

function vtAddSavedLink(name, type, url) {
  if (type !== 'video') return;
  // Move to top if already exists (preserve transcript), else add
  const existing = VideoState.savedFiles.find(f => f.name === name);
  VideoState.savedFiles = VideoState.savedFiles.filter(f => f.name !== name);
  VideoState.savedFiles.unshift(existing || { name, type, url });
  VideoState.savedFiles[0].url = url; // Update URL (new blob)
  if (VideoState.savedFiles.length > 10) VideoState.savedFiles = VideoState.savedFiles.slice(0, 10);
  vtSaveHistory();
  vtUpdateHistoryDropdown();
  // Set name label to current video
  const nameEl = document.getElementById('vtLoadedName');
  if (nameEl) nameEl.textContent = name;
  // Show the loaded bar
  document.getElementById('vtLoadedBar').style.display = 'flex';
}

function vtSaveHistory() {
  try {
    // Save name, type, transcript (but not blob URL - those don't persist)
    const toSave = VideoState.savedFiles.map(f => ({
      name: f.name,
      type: f.type,
      transcript: f.transcript || null,
      transcriptName: f.transcriptName || null
    }));
    _fvid_Storage().set(STORAGE_KEYS.VT_VIDEO_HISTORY, JSON.stringify(toSave));
  } catch(e) { console.warn('Could not save video history', e); }
}

function vtLoadHistory() {
  try {
    const saved = JSON.parse(_fvid_Storage().get(STORAGE_KEYS.VT_VIDEO_HISTORY) || '[]');
    VideoState.savedFiles = saved.map(f => ({ ...f, url: null })); // URLs don't persist
  } catch(e) { VideoState.savedFiles = []; }
}

// Load history on startup
vtLoadHistory();

function vtUpdateHistoryDropdown() {
  const select = document.getElementById('vtHistorySelect');
  if (!select) return;
  
  // Get current video (one with active URL)
  const current = VideoState.savedFiles.find(f => f.url);
  const currentName = current ? current.name : '';
  
  // Build options - current video first, then history
  let html = '';
  if (currentName) {
    html += `<option value="" selected>🎬 ${currentName}</option>`;
  } else {
    html += '<option value="">— Recent videos —</option>';
  }
  
  // Add recent videos (all except current)
  const history = VideoState.savedFiles.filter(f => f.name !== currentName).slice(0, 8);
  if (history.length > 0) {
    html += '<option disabled>───────────</option>';
    history.forEach((f, i) => {
      const idx = VideoState.savedFiles.findIndex(sf => sf.name === f.name);
      const hasTranscript = f.transcript && f.transcript.length > 0;
      const icon = f.url ? '🎬' : (hasTranscript ? '📄' : '○');
      html += `<option value="${idx}">${icon} ${f.name}</option>`;
    });
  }
  
  select.innerHTML = html;
}

function vtLoadFromHistory(indexStr) {
  if (!indexStr) return;
  const index = parseInt(indexStr);
  const f = VideoState.savedFiles[index];
  if (!f) return;
  
  // Reset dropdown to show loading state
  const select = document.getElementById('vtHistorySelect');
  if (select) select.value = '';
  
  if (f.url) {
    // We have the blob URL still
    const v = document.getElementById('vtVideo');
    v.src = f.url;
    v.load();
    // Move to top of list
    VideoState.savedFiles.splice(index, 1);
    VideoState.savedFiles.unshift(f);
    vtUpdateHistoryDropdown();
    // Try to load matching transcript
    vtTryLoadMatchingTranscript(f.name);
  } else {
    // Need to re-select the file - store the name so we can load transcript after
    VideoState.pendingHistoryName = f.name;
    VideoState.pendingHistoryEntry = f;
    
    const hasTranscript = f.transcript && f.transcript.length > 0;
    const msg = hasTranscript 
      ? `Re-select video file "${f.name}"\n\nTranscript will auto-load (${f.transcript.length} lines saved)`
      : `Re-select video file "${f.name}"`;
    alert(msg);
    document.getElementById('vtVideoInput').click();
  }
}

function vtTryLoadMatchingTranscript(videoName) {
  // Look for a saved transcript that matches the video name
  // Strip extension from video name
  const baseName = videoName.replace(/\.[^.]+$/, '');
  
  // Check if we have transcript data saved
  const savedTrans = VideoState.savedFiles.find(f => 
    f.transcript && 
    (f.name === videoName || f.name.replace(/\.[^.]+$/, '') === baseName)
  );
  
  if (savedTrans && savedTrans.transcript) {
    VideoState.cues = savedTrans.transcript;
    vtRenderTranscript();
    document.getElementById('vtTranscriptWrap').style.display = 'flex';
    document.getElementById('vtNoTranscript').style.display = 'none';
  }
}

function vtRenderSavedLinks() {
  vtUpdateHistoryDropdown();
}





// VideoState.pendingHistoryName → VideoState.pendingHistoryName

// ── Watch: word translate on mouse-up ────────────────────────────────────
function vtWordSelect(cueIdx, event) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) {
    vtCueClick(cueIdx);
    return;
  }
  const word = sel.toString().trim();
  if (!word) { vtCueClick(cueIdx); return; }
  event.stopPropagation();
  sel.removeAllRanges();
  vtTranslateWord(word, event);
}

function vtTranslateWord(word, event) {
  if (!_fvid_getApiKey()) return;
  // Reuse qrOverlay popup pattern
  const existing = document.getElementById('vtWordPopup');
  if (existing) existing.remove();
  const popup = document.createElement('div');
  popup.id = 'vtWordPopup';
  popup.style.cssText = 'position:fixed;z-index:9999;background:#1c1c1e;border:1px solid var(--border);border-radius:8px;padding:12px 16px;min-width:180px;max-width:280px;box-shadow:0 4px 20px rgba(0,0,0,0.4);font-family:var(--ui)';
  const x = Math.min(event.clientX, window.innerWidth - 300);
  const y = Math.min(event.clientY + 12, window.innerHeight - 160);
  popup.style.left = x + 'px';
  popup.style.top  = y + 'px';
  popup.innerHTML = `<div style="font-size:1.1rem;color:var(--ink);margin-bottom:6px">${word}</div>
    <div id="vtWordResult" style="font-size:0.82rem;color:var(--ink-light)">Translating…</div>
    <button class="btn-icon" onclick="document.getElementById('vtWordPopup').remove()">✕</button>`;
  document.body.appendChild(popup);
  document.addEventListener('click', function dismiss(e) {
    if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', dismiss); }
  });
  _fvid_claudeAPI({ model:'claude-sonnet-4-20250514', max_tokens:120,
      messages:[{role:'user',content:`Translate the Japanese word/phrase "${word}" to English. Reply with: reading in hiragana, then a dash, then the English meaning. One line only.`}],
        track: 'video'
      }).then(d=>{
    const res = document.getElementById('vtWordResult');
    if (res) res.textContent = d.content?.[0]?.text || '—';
  }).catch(()=>{
    const res = document.getElementById('vtWordResult');
    if (res) res.textContent = 'Error translating.';
  });
}


// Wire up file inputs with addEventListener (more reliable in Safari)
(function() {
  function wireVtInputs() {
    const vi = document.getElementById('vtVideoInput');
    const ti = document.getElementById('vtTransInput');
    const dz = document.getElementById('vtDropZone');
    if (vi) vi.addEventListener('change', function() {
      const files = [...this.files];
      const videoFile = files.find(f => f.type.startsWith('video/') || f.type.startsWith('audio/'));
      const transFile = files.find(f => /\.(srt|vtt|txt)$/i.test(f.name));
      if (videoFile) {
        // If this was triggered by a history reload, update the stored URL and load saved transcript
        if (VideoState.pendingHistoryName) {
          const hf = VideoState.savedFiles.find(f => f.name === VideoState.pendingHistoryName);
          if (hf) { 
            hf.url = URL.createObjectURL(videoFile); 
            vtRenderSavedLinks();
            // Load saved transcript after video loads
            if (hf.transcript && hf.transcript.length > 0 && !transFile) {
              setTimeout(() => {
                VideoState.cues = hf.transcript;
                vtRenderTranscript();
                document.getElementById('vtTranscriptWrap').style.display = 'flex';
                document.getElementById('vtNoTranscript').style.display = 'none';
              }, 100);
            }
          }
          VideoState.pendingHistoryName = null;
        }
        vtLoadFile(videoFile);
      }
      if (transFile) {
        vtLoadTransFile(transFile);
      } else if (videoFile) {
        const base = videoFile.name.replace(/\.[^.]+$/, '').toLowerCase();
        const matchTrans = ext => files.find(f => f.name.toLowerCase() === base + ext);
        const autoTrans = matchTrans('.vtt') || matchTrans('.srt') || matchTrans('.txt');
        if (autoTrans) vtLoadTransFile(autoTrans);
      }
      this.value='';
    });
    if (ti) ti.addEventListener('change', function() { if (this.files[0]) { vtLoadTransFile(this.files[0]); this.value=''; } });
    const fi = document.getElementById('vtFolderInput');
    if (fi) fi.addEventListener('change', function() {
      const files = [...this.files];
      const videoFile = files.find(f => f.type.startsWith('video/') || f.type.startsWith('audio/'));
      if (!videoFile) return;
      vtLoadFile(videoFile);
      const base = videoFile.name.replace(/\.[^.]+$/, '').toLowerCase();
      const matchTrans = ext => files.find(f => f.name.toLowerCase() === base + ext);
      const autoTrans = matchTrans('.vtt') || matchTrans('.srt') || matchTrans('.txt');
      if (autoTrans) vtLoadTransFile(autoTrans);
      this.value = '';
    });

  }
  if (document.readyState === 'loading') {
   document.addEventListener('DOMContentLoaded', wireVtInputs);
  } else {
    wireVtInputs();
  }
})();



// Auto-load transcript with same base name (works when both files selected together)
// In browser we can't access filesystem — hint is shown instead
// ── Moji: magnify stroke order overlay ───────────────────────────────────
function strokeMagnify(ch) {
  const existing = document.getElementById('strokeMagnifyOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'strokeMagnifyOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer';
  overlay.onclick = () => overlay.remove();

  const box = document.createElement('div');
  box.style.cssText = 'background:#111;border-radius:12px;padding:24px;position:relative;cursor:default';
  box.onclick = e => e.stopPropagation();

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'position:absolute;top:10px;right:12px;background:none;border:none;color:var(--ink-light);font-size:1rem;cursor:pointer';
  closeBtn.onclick = () => overlay.remove();

  const lbl = document.createElement('div');
  lbl.textContent = ch;
  lbl.style.cssText = 'font-family:"Noto Sans JP",sans-serif;font-size:1.2rem;color:var(--ink-light);text-align:center;margin-bottom:12px;letter-spacing:0.1em';

  const target = document.createElement('div');
  const MSZ = Math.min(window.innerWidth, window.innerHeight) * 0.6;
  target.style.cssText = 'width:' + MSZ + 'px;height:' + MSZ + 'px;background:#111';

  box.appendChild(closeBtn);
  box.appendChild(lbl);
  box.appendChild(target);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Always use Kan-G numbered SVG for the magnify view
  const hex = ch.codePointAt(0).toString(16).padStart(5, '0');
  const img = document.createElement('img');
  img.src = 'https://kan-g.vnaka.dev/k/' + hex + '.svg';
  img.style.cssText = 'width:100%;height:100%;object-fit:contain';
  target.appendChild(img);
}


// ── Moji: get reading for a character ────────────────────────────────────
function strokeGetReading(ch) {
  // Sync: kana returns immediately
  const cp = ch.codePointAt(0);
  if (cp >= 0x3041 && cp <= 0x3096) return ch; // hiragana
  if (cp >= 0x30A1 && cp <= 0x30F6) return String.fromCharCode(cp - 0x60); // katakana→hiragana
  return ''; // kanji: filled async by strokeFetchReadings
}

// Fetch readings for all kanji tiles in one AI call
async function strokeFetchReadings(chars, word) {
  const kanji = chars.filter(ch => {
    const cp = ch.codePointAt(0);
    return cp >= 0x4E00 && cp <= 0x9FFF || cp >= 0x3400 && cp <= 0x4DBF;
  });
  if (!kanji.length) return;
  const apiKey = _fvid_getApiKey();
  if (!apiKey) return;
  try {
    const data = await _fvid_claudeAPI({
        model: 'claude-sonnet-4-20250514', max_tokens: 200,
        messages: [{ role: 'user', content:
          `For the Japanese word "${word}", give the reading of each character as it is read IN CONTEXT of that word. Reply ONLY with a JSON object mapping each character to its reading, e.g. {"東":"とう","京":"きょう"}. Characters: ${JSON.stringify(kanji)}` }]
    ,
      track: 'writing'
    });
    const raw = (data.content?.[0]?.text || '').trim().replace(/```json|```/g,'');
    const map = JSON.parse(raw);
    // Update reading divs
    chars.forEach((ch, i) => {
      if (map[ch]) {
        const rdiv = document.getElementById('stroke-reading-' + i);
        if (rdiv) rdiv.textContent = map[ch];
      }
    });
  } catch(e) { /* silently fail */ }
}


// ═══════════════════════════════════════════════════════════════════════════
// EPUB READER
// ═══════════════════════════════════════════════════════════════════════════

// ── Tab switching ─────────────────────────────────────────────────────────
function readSwitchTab(tab) {
  const qp = document.getElementById('readQuickPane');
  const ep = document.getElementById('readEpubPane');
  const tq = document.getElementById('readTabQuick');
  const te = document.getElementById('readTabEpub');
  
  // Hide all panes
  qp.style.display = 'none';
  ep.style.display = 'none';
  
  // Reset all tabs
  [tq, te].forEach(t => {
    if (t) {
      t.style.borderBottomColor = 'transparent';
      t.style.color = 'var(--ink-light)';
    }
  });
  
  // Show selected
  if (tab === 'epub') {
    ep.style.display = 'block';
    if (te) { te.style.borderBottomColor = 'var(--teal)'; te.style.color = 'var(--ink)'; }
  } else {
    qp.style.display = 'block';
    if (tq) { tq.style.borderBottomColor = 'var(--teal)'; tq.style.color = 'var(--ink)'; }
  }
}

// ── State ─────────────────────────────────────────────────────────────────

// ── File loading ──────────────────────────────────────────────────────────
(function wireEpubInputs() {
  document.addEventListener('DOMContentLoaded', () => {
    const fi = document.getElementById('epubFileInput');
    if (fi) fi.addEventListener('change', e => {
      if (e.target.files[0]) epubLoadFile(e.target.files[0]);
    });
    const dz = document.getElementById('epubDropZone');
    if (dz) dz.addEventListener('click', () => document.getElementById('epubFileInput').click());
  });
})();

function epubHandleDrop(e) {
  e.preventDefault();
  document.getElementById('epubDropZone').style.borderColor = 'var(--border)';
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.epub')) epubLoadFile(file);
}

async function epubLoadFile(file) {
  const dz = document.getElementById('epubDropZone');
  dz.style.borderColor = 'var(--teal)';
  try {
    // Load JSZip dynamically if not present
    if (typeof JSZip === 'undefined') {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    const buf = await file.arrayBuffer();
    EpubState.zip = await JSZip.loadAsync(buf);
    await epubParseOPF();
    document.getElementById('epubTitle').textContent = file.name.replace('.epub','');
    dz.style.display = 'none';
    const wrap = document.getElementById('epubReaderWrap');
    wrap.style.display = 'flex';
    epubLoadChapter(0);
  } catch(e) {
    dz.style.borderColor = 'var(--border)';
    console.error('EPUB load error', e);
    alert('Could not open EPUB: ' + e.message);
  }
}

// ── OPF / spine parsing ───────────────────────────────────────────────────
async function epubParseOPF() {
  // Find container.xml to locate OPF
  const containerXml = await EpubState.zip.file('META-INF/container.xml').async('string');
  const containerDoc = new DOMParser().parseFromString(containerXml, 'application/xml');
  const opfPath = containerDoc.querySelector('rootfile').getAttribute('full-path');
  const opfDir  = opfPath.includes('/') ? opfPath.split('/').slice(0,-1).join('/') + '/' : '';

  const opfXml = await EpubState.zip.file(opfPath).async('string');
  const opfDoc = new DOMParser().parseFromString(opfXml, 'application/xml');

  // Book title
  const titleEl = opfDoc.querySelector('title');
  if (titleEl) document.getElementById('epubTitle').textContent = titleEl.textContent;

  // Manifest: id → href map
  const manifest = {};
  opfDoc.querySelectorAll('manifest item').forEach(item => {
    manifest[item.getAttribute('id')] = opfDir + item.getAttribute('href');
  });

  // NCX / nav for chapter labels
  const labels = {};
  const ncxId = opfDoc.querySelector('spine')?.getAttribute('toc');
  if (ncxId && manifest[ncxId]) {
    try {
      const ncxXml = await EpubState.zip.file(manifest[ncxId]).async('string');
      const ncxDoc = new DOMParser().parseFromString(ncxXml, 'application/xml');
      ncxDoc.querySelectorAll('navPoint').forEach(np => {
        const src  = np.querySelector('content')?.getAttribute('src')?.split('#')[0];
        const lbl  = np.querySelector('navLabel text')?.textContent?.trim();
        if (src && lbl) labels[opfDir + src] = lbl;
      });
    } catch(e) { /* no NCX */ }
  }
  // EPUB3 nav
  const navId = [...opfDoc.querySelectorAll('manifest item')].find(i => i.getAttribute('properties')?.includes('nav'))?.getAttribute('id');
  if (navId && manifest[navId]) {
    try {
      const navHtml = await EpubState.zip.file(manifest[navId]).async('string');
      const navDoc  = new DOMParser().parseFromString(navHtml, 'text/html');
      navDoc.querySelectorAll('nav[epub\:type="toc"] a, nav a').forEach(a => {
        const href = a.getAttribute('href')?.split('#')[0];
        if (href) labels[opfDir + href] = a.textContent.trim();
      });
    } catch(e) { /* no nav */ }
  }

  // Spine: ordered chapter list
  EpubState.spine = [];
  opfDoc.querySelectorAll('spine itemref').forEach((ref, i) => {
    const id   = ref.getAttribute('idref');
    const href = manifest[id];
    if (!href) return;
    EpubState.spine.push({ id, href, label: labels[href] || `Chapter ${i+1}` });
  });

  // Populate chapter selector
  const sel = document.getElementById('epubChapterSel');
  sel.innerHTML = EpubState.spine.map((ch, i) =>
    `<option value="${i}">${ch.label}</option>`
  ).join('');
}

// ── Load & render a chapter ───────────────────────────────────────────────
async function epubLoadChapter(idx) {
  idx = parseInt(idx);
  if (idx < 0 || idx >= EpubState.spine.length) return;
  EpubState.chapterIdx = idx;
  const _epubTitleEl = document.getElementById('epubTitle');
  const _epubLabel = _epubTitleEl ? _epubTitleEl.textContent : null;
  drillLastCompletedWrite('reading', _epubLabel);

  const sel = document.getElementById('epubChapterSel');
  if (sel) sel.value = idx;

  const info = document.getElementById('epubChapterInfo');
  if (info) info.textContent = `${idx+1} / ${EpubState.spine.length}`;

  const content = document.getElementById('epubContent');
  content.innerHTML = '<div style="color:var(--ink-light);font-family:var(--ui);font-size:0.85rem;padding:20px">Loading…</div>';

  try {
    const chap = EpubState.spine[idx];
    const raw  = await EpubState.zip.file(chap.href).async('string');
    const doc  = new DOMParser().parseFromString(raw, 'text/html');

    // Remove scripts / styles that would conflict
    doc.querySelectorAll('script,style,link').forEach(el => el.remove());

    // Resolve inline images
    const imgs = doc.querySelectorAll('img');
    for (const img of imgs) {
      const src = img.getAttribute('src');
      if (!src || src.startsWith('data:') || src.startsWith('http')) continue;
      const dir = chap.href.includes('/') ? chap.href.split('/').slice(0,-1).join('/') + '/' : '';
      const imgPath = (dir + src).replace(/[^/]+\/\.\.\//g,'');
      try {
        const imgFile = EpubState.zip.file(imgPath);
        if (imgFile) {
          const b64 = await imgFile.async('base64');
          const ext = imgPath.split('.').pop().toLowerCase();
          const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
          img.src = `data:${mime};base64,${b64}`;
        }
      } catch(e) { img.remove(); }
    }

    // Extract body text
    const body = doc.body || doc.documentElement;

    // Convert to clean HTML, keeping structure
    let html = body.innerHTML;

    // Apply font size
    content.style.fontSize = EpubState.fontSize + 'rem';
    content.innerHTML = `<div class="epub-chapter">${html}</div>`;

    // Apply furigana if on
    if (EpubState.furi) epubApplyFuri();

    // Wire word-tap
    epubWireWordTap();

    // Scroll to top
    content.scrollTop = 0;

  } catch(e) {
    content.innerHTML = `<div style="color:var(--ink-light);font-family:var(--ui);font-size:0.85rem">Error loading chapter: ${e.message}</div>`;
  }
}

// ── Keyboard navigation ───────────────────────────────────────────────────
document.addEventListener('keydown', function(e) {
  const epubPane = document.getElementById('readEpubPane');
  if (!epubPane || epubPane.style.display === 'none') return;
  if (!EpubState.spine.length) return;
  // Don't fire if focus is in a select/input
  if (['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); epubNextChapter(); }
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); epubPrevChapter(); }
});

// ── Font size ─────────────────────────────────────────────────────────────
function epubSetFontSize(val) {
  EpubState.fontSize = parseFloat(val);
  const content = document.getElementById('epubContent');
  if (content) content.style.fontSize = EpubState.fontSize + 'rem';
}

// ── Furigana toggle ───────────────────────────────────────────────────────
function epubToggleFuri() {
  EpubState.furi = !EpubState.furi;
  const btn = document.getElementById('epubFuriBtn');
  if (btn) { btn.style.borderColor = EpubState.furi ? 'var(--teal)' : ''; btn.style.color = EpubState.furi ? 'var(--teal)' : ''; }
  if (EpubState.furi) epubApplyFuri(); else epubRemoveFuri();
}

async function epubApplyFuri() {
  const content = document.getElementById('epubContent');
  if (!content) return;
  // Extract plain text, send to AI for furigana, re-render
  // For performance: only annotate text nodes containing kanji
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (/[一-鿿]/.test(node.textContent)) nodes.push(node);
  }
  for (const tn of nodes) {
    if (tn.EpubState.furiDone) continue;
    tn.EpubState.furiDone = true;
    const text = tn.textContent;
    try {
      const furiHtml = await epubGetFurigana(text);
      const span = document.createElement('span');
      span.innerHTML = furiHtml;
      tn.parentNode.replaceChild(span, tn);
    } catch(e) { /* leave as-is */ }
  }
}

function epubRemoveFuri() {
  // Re-render current chapter without furigana
  const sel = document.getElementById('epubChapterSel');
  EpubState.furi = false;
  epubLoadChapter(EpubState.chapterIdx);
}

async function epubGetFurigana(text) {
  const apiKey = _fvid_getApiKey();
  if (!apiKey) return text;
  const data = await _fvid_claudeAPI({
      model: 'claude-sonnet-4-20250514', max_tokens: 800,
      messages: [{ role:'user', content:
        `Add furigana to ALL kanji using HTML ruby tags. EVERY kanji must have a reading - do not skip any. Use context-appropriate readings (例えば→たとえば, 今日→きょう, 片付ける→かたづける). For verbs with multiple kanji, tag each separately. Return ONLY the HTML.

Text: ${text}` }]
  ,
    track: 'reading'
  });
  return (data.content?.[0]?.text || text).trim();
}

// ── Word tap for translation ──────────────────────────────────────────────
function epubWireWordTap() {
  const content = document.getElementById('epubContent');
  if (!content) return;
  content.addEventListener('mouseup', epubOnWordSelect);
}

async function epubOnWordSelect(e) {
  const sel = window.getSelection();
  const word = sel?.toString().trim();
  if (!word || word.length > 20) { epubHidePopup(); return; }
  if (!/[ぁ-んァ-ン一-鿿]/.test(word)) { epubHidePopup(); return; }

  const popup = document.getElementById('epubWordPopup');
  popup.style.display = 'block';
  document.getElementById('epubPopupWord').textContent = word;
  document.getElementById('epubPopupReading').textContent = '…';
  document.getElementById('epubPopupMeaning').textContent = '';

  // Position near cursor
  popup.style.left = Math.min(e.clientX, window.innerWidth - 300) + 'px';
  popup.style.top  = (e.clientY + 14) + 'px';

  try {
    const apiKey = _fvid_getApiKey();
    if (!apiKey) { document.getElementById('epubPopupMeaning').textContent = 'No API key'; return; }
    const data = await _fvid_claudeAPI({
        model:'claude-sonnet-4-20250514', max_tokens:150,
        messages:[{role:'user',content:
          `For the Japanese word "${word}", reply ONLY with a JSON object: {"reading":"hiragana reading","meaning":"short English meaning","pos":"part of speech"}. No explanation.`}]
    ,
      track: 'reading'
    });
    const raw = (data.content?.[0]?.text||'').trim().replace(/```json|```/g,'');
    const obj = JSON.parse(raw);
    document.getElementById('epubPopupReading').textContent = obj.reading || '';
    document.getElementById('epubPopupMeaning').textContent = (obj.meaning||'') + (obj.pos ? '  ·  ' + obj.pos : '');
  } catch(err) {
    document.getElementById('epubPopupReading').textContent = '';
    document.getElementById('epubPopupMeaning').textContent = 'Could not look up word';
  }

  // Dismiss on outside click
  setTimeout(() => document.addEventListener('click', epubHidePopup, { once: true }), 100);
}

function epubHidePopup() {
  const p = document.getElementById('epubWordPopup');
  if (p) p.style.display = 'none';
}

// ── TTS ───────────────────────────────────────────────────────────────────
function epubSpeak() {
  const btn = document.getElementById('epubTtsBtn');
  if (EpubState.ttsSpeaking) {
    window.speechSynthesis.cancel();
    EpubState.ttsSpeaking = false;
    if (btn) btn.textContent = '🔊 Read';
    return;
  }
  const content = document.getElementById('epubContent');
  if (!content) return;
  // Strip ruby annotations for TTS
  const clone = content.cloneNode(true);
  clone.querySelectorAll('rt,rp').forEach(el => el.remove());
  const text = clone.textContent.trim();
  if (!text) return;
  EpubState.ttsSpeaking = true;
  if (btn) btn.textContent = '⏹ Stop';
  const _epubDone = () => { EpubState.ttsSpeaking = false; if (btn) btn.textContent = '🔊 Read'; };
  TTS.speak(text, 0.9, { onend: _epubDone, onerror: _epubDone });
}

// ── Close book ────────────────────────────────────────────────────────────
function epubClose() {
  EpubState.zip = null; EpubState.spine = []; EpubState.chapterIdx = 0;
  document.getElementById('epubContent').innerHTML = '';
  document.getElementById('epubChapterSel').innerHTML = '';
  document.getElementById('epubReaderWrap').style.display = 'none';
  document.getElementById('epubDropZone').style.display = 'block';
  document.getElementById('epubDropZone').style.borderColor = 'var(--border)';
  if (EpubState.ttsSpeaking) { window.speechSynthesis.cancel(); EpubState.ttsSpeaking = false; }
}


// ── Listen mode selector ─────────────────────────────────────────────────
function listenModeChanged(val) {
  // Hide all mode panels first
  const comp = document.getElementById('compPanel');
  const dict = document.getElementById('dictPanel') || document.getElementById('dictationPanel');
  if (comp) comp.style.display = 'none';
  if (dict) dict.style.display = 'none';

  // Reset button states that used to be toggled
  const compBtn = document.getElementById('compToggleBtn');
  const dictBtn = document.getElementById('dictModeBtn');
  if (compBtn) { compBtn.style.background = ''; }
  if (dictBtn) { dictBtn.style.background = ''; }

  if (val === 'dictation')     { toggleDictationMode(); }
  else if (val === 'comprehension') { 
    if (comp) { comp.style.display = 'block'; if(compBtn){compBtn.style.background='rgba(48,213,200,0.12)';} }
  }
  else if (val === 'times')    { openTimesDrill(); }
  else if (val === 'progress') { SRS.toggleProgress(); }

  // Reset dropdown back to placeholder after triggering
  setTimeout(() => {
    const sel = document.getElementById('listenModeSelect');
    if (sel) sel.value = '';
  }, 100);
}


// ── Watch: clear translation panel ────────────────────────────────────────
function vtClearTranslation() {
  const jpEl = document.getElementById('vtLineJp');
  const enEl = document.getElementById('vtLineEn');
  const breakdownArea = document.getElementById('vtBreakdownArea');
  if (jpEl) jpEl.textContent = '';
  if (enEl) enEl.innerHTML = '<span style="color:var(--ink-light);font-size:0.78rem">Click Translate to translate current line</span>';
  if (breakdownArea) breakdownArea.style.display = 'none';
}

// ── Watch: translate current line ────────────────────────────────────────
async function vtTranslateLine() {
  const panel = document.getElementById('vtLineTranslate');
  const video = document.getElementById('vtVideo');
  const isFullscreen = document.getElementById('panel-video')?.classList.contains('vt-fullscreen');
  
  if (video && !video.paused) video.pause();

  // Get current line text
  let lineText = '';
  if (VideoState.activeIdx >= 0 && VideoState.cues[VideoState.activeIdx]) {
    lineText = VideoState.cues[VideoState.activeIdx].text;
  } else {
    // Fallback: last highlighted cue
    const active = document.querySelector('.vt-cue.active');
    if (active) lineText = active.querySelector('.vt-cue-text')?.textContent || '';
  }

  const jpEl  = document.getElementById('vtLineJp');
  const enEl  = document.getElementById('vtLineEn');
  const breakdownArea = document.getElementById('vtBreakdownArea');

  // Hide breakdown when starting new translation
  if (breakdownArea) breakdownArea.style.display = 'none';

  if (!lineText.trim()) {
    jpEl.textContent = '(no active line)';
    enEl.textContent = '';
    panel.style.display = 'block';
    return;
  }

  jpEl.textContent = lineText;
  enEl.textContent = '…';
  panel.style.display = 'block';

  const btn = document.getElementById('vtTranslateBtn');
  if (btn) { btn.style.borderColor = 'var(--teal)'; btn.style.color = 'var(--teal)'; }

  try {
    const apiKey = _fvid_getApiKey();
    if (!apiKey) { enEl.textContent = 'No API key set'; return; }
    const data = await _fvid_claudeAPI({
        model: 'claude-sonnet-4-20250514', max_tokens: 200,
        messages: [{ role: 'user', content:
          `Translate this Japanese line into natural English. Reply with ONLY the translation, nothing else.

${lineText}` }]
    ,
      track: 'video'
    });
    const translation = (data.content?.[0]?.text || '').trim();
    enEl.textContent = translation;
    // Also show in the inline quick result bar above the transcript
    const quickResult = document.getElementById('vtQuickTransResult');
    if (quickResult) {
      quickResult.textContent = translation;
      quickResult.style.display = 'block';
    }
  } catch(e) {
    enEl.textContent = 'Translation error';
  } finally {
    if (btn) { btn.style.borderColor = 'var(--border)'; btn.style.color = 'var(--ink-light)'; }
  }
}

async function vtBreakdownLine() {
  const jpEl = document.getElementById('vtLineJp');
  const breakdownArea = document.getElementById('vtBreakdownArea');
  const breakdownContent = document.getElementById('vtBreakdownContent');
  const video = document.getElementById('vtVideo');
  
  // Pause video when opening breakdown
  if (video && !video.paused) video.pause();
  
  if (!jpEl || !breakdownArea || !breakdownContent) return;
  
  const lineText = jpEl.textContent;
  if (!lineText || lineText === '(no active line)') return;
  
  breakdownArea.style.display = 'block';
  breakdownContent.textContent = 'Analyzing...';
  
  try {
    const apiKey = _fvid_getApiKey();
    if (!apiKey) {
      breakdownContent.textContent = 'No API key set';
      return;
    }
    
    const data = await _fvid_claudeAPI({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        messages: [{ role: 'user', content: `Break down this Japanese sentence for a learner:

${lineText}

Provide:
1. Each word/phrase with its reading (if kanji) and meaning
2. Key grammar points used
3. Any nuances or context

Keep it concise and clear. Format nicely.` }]
    ,
      track: 'video'
    });
    
    breakdownContent.textContent = (data.content?.[0]?.text || 'Could not analyze').trim();
  } catch (e) {
    breakdownContent.textContent = 'Error: ' + e.message;
  }
}

// ── Vocab List for video transcript ────────────────────────────────────────
// VideoState.vocabListCache → VideoState.vocabListCache

function vtGetVocabCacheKey() {
  // Use video filename or transcript content hash as key
  const video = document.getElementById('vtVideo');
  const src = video?.src || '';
  const filename = src.split('/').pop()?.split('?')[0] || '';
  if (filename) return 'vt_vocab_' + filename;
  // Fallback: use first 100 chars of transcript
  const text = VideoState.cues.map(c => c.text).join('').substring(0, 100);
  return 'vt_vocab_' + btoa(encodeURIComponent(text)).substring(0, 20);
}

function vtShowVocabList() {
  const overlay = document.getElementById('vtVocabListOverlay');
  const content = document.getElementById('vtVocabListContent');
  if (!overlay) return;
  
  overlay.style.display = 'block';
  
  // Check if already cached locally
  const cacheKey = vtGetVocabCacheKey();
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const data = JSON.parse(cached);
      vtRenderVocabList(data);
      return;
    } catch(e) {}
  }
  
  // Generate new list
  content.innerHTML = '<span style="color:var(--ink-light)">Generating vocabulary list...</span>';
  vtGenerateVocabList();
}

function vtCloseVocabList() {
  const overlay = document.getElementById('vtVocabListOverlay');
  if (overlay) overlay.style.display = 'none';
}

function vtRegenerateVocabList() {
  const cacheKey = vtGetVocabCacheKey();
  localStorage.removeItem(cacheKey);
  const content = document.getElementById('vtVocabListContent');
  content.innerHTML = '<span style="color:var(--ink-light)">Regenerating vocabulary list...</span>';
  vtGenerateVocabList();
}

// Current vocab list for deletion
// VideoState.currentVocab → VideoState.currentVocab

async function vtGenerateVocabList() {
  const content = document.getElementById('vtVocabListContent');
  
  if (!VideoState.cues || VideoState.cues.length === 0) {
    content.innerHTML = '<span style="color:var(--red)">No transcript loaded</span>';
    return;
  }
  
  const apiKey = _fvid_getApiKey();
  if (!apiKey) {
    content.innerHTML = '<span style="color:var(--red)">No API key set</span>';
    return;
  }
  
  // Build transcript with timestamps
  const transcriptWithTimes = VideoState.cues.map(c => {
    const mins = Math.floor(c.start / 60);
    const secs = Math.floor(c.start % 60);
    return `[${mins}:${secs.toString().padStart(2,'0')}] ${c.text}`;
  }).join('\n');
  
  try {
    const data = await _fvid_claudeAPI({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2500,
        messages: [{ role: 'user', content: `Extract CONTENT words from this Japanese transcript. Content words are nouns, verbs, adjectives, and adverbs that carry meaning (not particles, copulas, or grammatical words).

For each unique content word, give:
- The word in dictionary form (kanji if applicable)
- Hiragana reading
- English meaning
- The timestamp of its FIRST occurrence

Return as JSON array only, no other text:
[{"word":"食べる","reading":"たべる","meaning":"to eat","time":"0:15"},{"word":"美味しい","reading":"おいしい","meaning":"delicious","time":"0:23"}]

Transcript:
${transcriptWithTimes}` }]
    ,
      track: 'video'
    });
    
    const raw = (data.content?.[0]?.text || '').trim();
    
    let vocab;
    try {
      vocab = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch(e) {
      content.innerHTML = '<span style="color:var(--red)">Failed to parse vocabulary</span>';
      return;
    }
    
    // Cache it
    const cacheKey = vtGetVocabCacheKey();
    localStorage.setItem(cacheKey, JSON.stringify(vocab));
    
    VideoState.currentVocab = vocab;
    vtRenderVocabList(vocab);
  } catch(e) {
    content.innerHTML = '<span style="color:var(--red)">Error: ' + e.message + '</span>';
  }
}

function vtRenderVocabList(vocab) {
  const content = document.getElementById('vtVocabListContent');
  VideoState.currentVocab = vocab;
  
  if (!vocab || vocab.length === 0) {
    content.innerHTML = '<span style="color:var(--ink-light)">No content words found</span>';
    return;
  }
  
  const html = `
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="border-bottom:1px solid var(--border)">
          <th style="text-align:left;padding:6px 8px;font-family:var(--ui);font-size:0.62rem;color:var(--ink-light);font-weight:normal">WORD</th>
          <th style="text-align:left;padding:6px 8px;font-family:var(--ui);font-size:0.62rem;color:var(--ink-light);font-weight:normal">READING</th>
          <th style="text-align:left;padding:6px 8px;font-family:var(--ui);font-size:0.62rem;color:var(--ink-light);font-weight:normal">MEANING</th>
          <th style="text-align:right;padding:6px 8px;font-family:var(--ui);font-size:0.62rem;color:var(--ink-light);font-weight:normal">TIME</th>
          <th style="width:24px"></th>
        </tr>
      </thead>
      <tbody>
        ${vocab.map((v, i) => `
          <tr style="border-bottom:1px solid var(--border)" data-idx="${i}">
            <td style="padding:5px 8px;font-family:var(--jp);font-size:0.88rem;color:var(--ink);cursor:pointer" onclick="vtJumpToTime('${v.time}')" title="Jump to ${v.time}">${v.word}</td>
            <td style="padding:5px 8px;font-family:var(--jp);font-size:0.78rem;color:var(--ink-light)">${v.reading || ''}</td>
            <td style="padding:5px 8px;font-family:var(--ui);font-size:0.78rem;color:var(--ink-light)">${v.meaning}</td>
            <td style="padding:5px 8px;text-align:right;font-family:var(--ui);font-size:0.72rem;color:var(--teal);cursor:pointer" onclick="vtJumpToTime('${v.time}')">${v.time}</td>
            <td style="padding:5px 4px;text-align:center"><button class="btn-icon" onclick="vtDeleteVocabWord(${i})" title="Remove from list">✕</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div style="margin-top:10px;font-family:var(--ui);font-size:0.68rem;color:var(--ink-light)">${vocab.length} words. Click word/time to jump. Delete known words to keep new ones.</div>
  `;
  content.innerHTML = html;
}

function vtDeleteVocabWord(idx) {
  if (!VideoState.currentVocab || idx < 0 || idx >= VideoState.currentVocab.length) return;
  VideoState.currentVocab.splice(idx, 1);
  // Update cache
  const cacheKey = vtGetVocabCacheKey();
  localStorage.setItem(cacheKey, JSON.stringify(VideoState.currentVocab));
  vtRenderVocabList(VideoState.currentVocab);
}

function vtJumpToTime(timeStr) {
  const video = document.getElementById('vtVideo');
  if (!video) return;
  const parts = timeStr.split(':');
  let secs = 0;
  if (parts.length === 2) {
    secs = parseInt(parts[0]) * 60 + parseInt(parts[1]);
  } else if (parts.length === 3) {
    secs = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
  }
  video.currentTime = secs;
  video.play();
  vtCloseVocabList();
}

function vtCloseLineTranslate() {
  const panel = document.getElementById('vtLineTranslate');
  const isFullscreen = document.getElementById('panel-video')?.classList.contains('vt-fullscreen');
  if (panel) {
    if (isFullscreen) {
      // In fullscreen, just clear the content
      document.getElementById('vtLineJp').textContent = '';
      document.getElementById('vtLineEn').textContent = '';
    } else {
      panel.style.display = 'none';
    }
  }
}


// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, {
    VideoState,
    // Video core
    vtTogglePlay, vtToggleWaveMode, vtCollapseLoadBar,
    vtDropZoneClick, vtHandleDrop, vtLoadVideo, vtLoadFile,
    vtLoadTranscript, vtLoadTransFile, vtParseSrt,
    vtRenderTranscript, vtSendToShadow, vtCueClick,
    vtOnTimeUpdate, vtWatchLoad, vtWatchSave, vtWatchUpdate,
    vtWatchStart, vtWatchStop, vtOnPlay, vtOnPause, vtOnLoaded,
    vtAnimLoop, vtSetSpeed, vtUpdateDisplay, vtFmtTime,
    vtSetLoopA, vtClearLoop, vtSetLoopPause, vtWaveClick,
    vtDrawWaveform, vtFullscreen: typeof vtFullscreen !== 'undefined' ? vtFullscreen : undefined,
    vtAddMarker: typeof vtAddMarker !== 'undefined' ? vtAddMarker : undefined,
    // Comprehension
    ComprehensionState, toggleComprehension, compPopulateVoices,
    compGetVoices, compRender, compToggleScript, compSpeakLine,
    // Shadowing
    vtToggleShadow, vtShPlayTarget, vtShRecord, vtShPlayback,
    vtShSeekTarget, setVtDictateMode,
    // History / vocab / epub / resources
    vtSaveHistory, vtLoadHistory, vtUpdateHistoryDropdown,
    vtLoadFromHistory, vtTryLoadMatchingTranscript, vtRenderSavedLinks,
    vtWordSelect, vtTranslateWord, strokeMagnify, strokeGetReading,
    vtAddSavedLink, vtShowVocabList, vtCloseVocabList,
    vtRegenerateVocabList, vtRenderVocabList, vtDeleteVocabWord,
    vtJumpToTime, vtClearTranslation, vtCloseLineTranslate,
    readSwitchTab, epubHandleDrop, epubSetFontSize, epubToggleFuri,
    epubRemoveFuri, epubWireWordTap, epubHidePopup, epubSpeak, epubClose,
    listenModeChanged,
    // Resources panel
    resourcesAdd, resourcesDelete, resourcesReset,
    resourcesEdit, resourcesSaveEdit,
  });
} catch(e) { console.error('[features-video] App registry failed:', e); }
