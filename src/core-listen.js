// ╔══════════════════════════════════════════════════════════════════════════════
// ║ core-listen.js
// ║ Listen panel — audio SRS, waveform, dictation, sentence playback.
// ║ Depends on: core-foundation.js, core-stt.js (sttStart)
// ║             features-core.js (audioBufferToWav, trimSilence, jpSpeak)
// ╚══════════════════════════════════════════════════════════════════════════════

// ── Listen panel state ───────────────────────────────────────────────────────
const ListenState = {
  loopPauseTimer:        null,
  sessionLookups:        [],
  transcribePauseTimeout:null,
  shMediaRecorder:       null,
  shAudioChunks:         [],
  shRecordedBlob:        null,
  shPlaybackAudio:       null,
  selectedMicId:         null,
  recMode:               'single',
  segmentRecordings:     [],
  dragIdx:               -1,
};
// ListenState.loopPauseTimer — see declaration above
let listenNotesSave = null;
let listenPlaying = false;
let _listenAccumSecs = 0;
let listenCurrentSpeed = 1.0;

// Waveform state
let listenAudioCtx = null;
let listenWaveData = null;   // Float32Array of normalised amplitudes

// Recent folders (names only, for display — user re-picks via folder input)
// ── FILENAME / ID3 DECODING ───────────────────────────
// The browser gives us f.name as a JS string already decoded by the OS.
// On macOS with Japanese Shift-JIS filenames this is double-mangled and
// unrecoverable from the string alone.
// Instead we read the ID3v2 tag from the file bytes to get the real title.

function readId3Title(file) {
  // Returns a Promise<string> — the ID3 TIT2 title, or '' if not found/not MP3
  return new Promise(resolve => {
    if (!/\.(mp3)$/i.test(file.name)) { resolve(''); return; }
    // Read first 128 KB — enough for any ID3v2 header
    const slice = file.slice(0, 131072);
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const buf = new Uint8Array(e.target.result);
        // Check for ID3v2 magic: "ID3"
        if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) { resolve(''); return; }
        const id3ver = buf[3]; // 3 or 4
        // ID3v2 size is 4 bytes syncsafe integer at offset 6
        const id3size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) |
                        ((buf[8] & 0x7f) << 7)  |  (buf[9] & 0x7f);
        let pos = 10;
        const end = Math.min(10 + id3size, buf.length);
        while (pos + 10 < end) {
          // Frame ID: 4 chars (ID3v2.3/2.4) or 3 chars (ID3v2.2)
          const frameId = id3ver >= 3
            ? String.fromCharCode(buf[pos],buf[pos+1],buf[pos+2],buf[pos+3])
            : String.fromCharCode(buf[pos],buf[pos+1],buf[pos+2]);
          const hdrLen = id3ver >= 3 ? 10 : 6;
          const frameSize = id3ver >= 4
            ? ((buf[pos+4]&0x7f)<<21)|((buf[pos+5]&0x7f)<<14)|((buf[pos+6]&0x7f)<<7)|(buf[pos+7]&0x7f)
            : id3ver === 3
              ? (buf[pos+4]<<24)|(buf[pos+5]<<16)|(buf[pos+6]<<8)|buf[pos+7]
              : (buf[pos+3]<<16)|(buf[pos+4]<<8)|buf[pos+5];
          if (frameSize <= 0 || frameSize > id3size) break;
          const targetFrame = id3ver >= 3 ? 'TIT2' : 'TT2';
          if (frameId === targetFrame) {
            const data = buf.slice(pos + hdrLen, pos + hdrLen + frameSize);
            const enc = data[0]; // 0=Latin-1, 1=UTF-16 BOM, 2=UTF-16BE, 3=UTF-8
            const content = data.slice(1);
            let title = '';
            if (enc === 0) {
              // Latin-1 — may actually be Shift-JIS bytes
              const decoded = tryShiftJIS(content) ||
                              new TextDecoder('latin1').decode(content);
              title = decoded;
            } else if (enc === 1) {
              title = new TextDecoder('utf-16').decode(content);
            } else if (enc === 2) {
              title = new TextDecoder('utf-16be').decode(content);
            } else {
              title = new TextDecoder('utf-8').decode(content);
            }
            resolve(title.replace(/\0/g, '').trim());
            return;
          }
          pos += hdrLen + frameSize;
        }
        resolve('');
      } catch { resolve(''); }
    };
    reader.onerror = () => resolve('');
    reader.readAsArrayBuffer(slice);
  });
}

function tryShiftJIS(bytes) {
  // Returns decoded string if bytes look like valid Shift-JIS with Japanese chars, else null
  try {
    const decoded = new TextDecoder('shift-jis', { fatal: true }).decode(bytes);
    if (/[\u3040-\u30ff\u4e00-\u9fff\uff00-\uffef]/.test(decoded)) return decoded;
    return null;
  } catch { return null; }
}

function tryDecodeFilename(name) {
  // Last-resort attempt to fix a mangled filename string.
  // The JS string chars are in 0x00–0xFF range (Latin-1/Mac Roman),
  // so we reinterpret their char codes as raw bytes and try Shift-JIS.
  if (/[\u3040-\u30ff\u4e00-\u9fff]/.test(name)) return name; // already Japanese
  if (!/[\u0080-\u00ff\uff61-\uffef]/.test(name)) return name; // plain ASCII, fine
  const bytes = new Uint8Array(name.length);
  for (let i = 0; i < name.length; i++) bytes[i] = name.charCodeAt(i) & 0xff;
  return tryShiftJIS(bytes) || name;
}

async function loadListenFiles(files, replacePlaylist) {
  const audioExts = /\.(mp3|m4a|wav|ogg|aac|flac|opus|weba|mp4)$/i;
  const added = Array.from(files).filter(f =>
    f.type.startsWith('audio/') || audioExts.test(f.name)
  );
  if (!added.length) return;

  if (replacePlaylist) {
    listenTracks.forEach(t => URL.revokeObjectURL(t.url));
    listenTracks = [];
    listenCurrentIdx = -1;
    listenQueue = []; listenQueuePos = -1;
  }

  added.sort((a, b) => a.name.localeCompare(b.name));
  added.forEach(f => {
    const rawName = tryDecodeFilename(f.name.replace(/\.[^.]+$/, ''));
    // Use webUtils.getPathForFile via preload (Electron 32+)
    const filePath = window.audioAPI?.getPath ? (window.audioAPI.getPath(f) || '') : '';
    listenTracks.push({ name: rawName, url: URL.createObjectURL(f), file: f, filePath, ghost: false });
  });

  // Remove any ghost tracks when real files are loaded
  listenTracks = listenTracks.filter(t => !t.ghost);
  showListenLayout();
  renderListenPlaylist();
  listenUpdateNavBtns();
  saveListenPrefs();

  // Async: enrich each track name with ID3 title if available
  for (let i = 0; i < listenTracks.length; i++) {
    const track = listenTracks[i];
    if (!track.file) continue;
    const id3title = await readId3Title(track.file);
    if (id3title) {
      listenTracks[i].name = id3title;
      const rows = document.querySelectorAll('.listen-track');
      if (rows[i]) rows[i].querySelector('.listen-track-title').textContent = id3title;
      if (i === listenCurrentIdx)
        document.getElementById('listenTrackName').textContent = id3title;
    }
    delete listenTracks[i].file;
  }
}

function handleListenDrop(e) {
  e.preventDefault();
  document.getElementById('listenDropzone').classList.remove('drag-over');
  const items = e.dataTransfer.items;
  if (items && items.length && items[0].webkitGetAsEntry) {
    // Try to read folder entries (works in Safari, Chrome, Firefox)
    const audioExts = /\.(mp3|m4a|wav|ogg|aac|flac|opus|weba|mp4)$/i;
    const filePromises = [];
    for (const item of items) {
      const entry = item.webkitGetAsEntry();
      if (entry) filePromises.push(readEntry(entry, audioExts));
    }
    Promise.all(filePromises).then(results => {
      const files = results.flat().filter(Boolean);
      if (files.length) loadListenFiles(files, false);
    });
  } else {
    loadListenFiles(e.dataTransfer.files, false);
  }
}

function readEntry(entry, audioExts) {
  return new Promise(resolve => {
    if (entry.isFile) {
      if (audioExts.test(entry.name)) {
        entry.file(f => resolve([f]), () => resolve([]));
      } else resolve([]);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const allEntries = [];
      const read = () => reader.readEntries(batch => {
        if (!batch.length) {
          Promise.all(allEntries.map(e => readEntry(e, audioExts))).then(r => resolve(r.flat()));
        } else {
          allEntries.push(...batch);
          read();
        }
      }, () => resolve([]));
      read();
    } else resolve([]);
  });
}

function showListenLayout() {
  if (!listenTracks.length) return;
  document.getElementById('listenDropzone').style.display = 'none';
  document.getElementById('listenLayout').style.display = 'grid';
}
function _ensureDictPanelState() {
  // Called after any async dictation op to ensure audio-mode div doesn't creep in
  if (document.getElementById('dictationPanel').style.display === 'none') return;
  const noTrack = listenCurrentIdx < 0;
  if (noTrack) {
    document.getElementById('dictAudioMode').style.display = 'none';
    document.getElementById('dictStandaloneMode').style.display = 'block';
  }
}

let listenQueue = [];      // indices of selected tracks in play order
let listenQueuePos = -1;   // current position within listenQueue

function renderListenPlaylist() {
  const el = document.getElementById('listenPlaylist');
  el.innerHTML = listenTracks.filter(t => !t.ghost).map((t, i) => {
    const srs = SRS.get(t.name);
    const due = srs && srs.nextDue && new Date(srs.nextDue) <= new Date();
    const lastRating = srs?.history?.length ? srs.history[srs.history.length-1].rating : 0;
    const heardCount = srs && srs.history ? srs.history.length : 0;
    const dueLabel = due
      ? `<span style="color:var(--gold,#c8a951);font-size:0.6rem;margin-left:auto;font-family:var(--ui)" title="Due for review">↻</span>`
      : heardCount > 0
        ? `<span style="color:var(--teal);font-size:0.6rem;margin-left:auto;font-family:var(--ui)" title="${heardCount}× heard">${heardCount}×</span>`
        : '';
    return `
    <div class="listen-track ${i === listenCurrentIdx ? 'active' : ''}" onclick="loadListenTrack(${i})" ondblclick="loadAndPlayTrack(${i})">
      <input type="checkbox" class="listen-check" data-idx="${i}"
             onclick="event.stopPropagation()" onchange="updateSelectAll()"
             style="margin:0;cursor:pointer;accent-color:var(--teal)">
      <span class="listen-track-num">${i + 1}</span>
      <span class="listen-track-title" title="${t.name}">${t.name}</span>
      ${dueLabel}
      <button class="listen-track-del" onclick="event.stopPropagation();removeListenTrack(${i})" title="Remove from playlist">✕</button>
    </div>`;
  }).join('');
  document.getElementById('listenTrackCount').textContent =
    listenTracks.length + ' track' + (listenTracks.length !== 1 ? 's' : '');
  if (listenTracks.length === 1) {
    const cb = document.querySelector('.listen-check');
    if (cb) cb.checked = true;
    updateSelectAll();
  }
}

function loadAndPlayTrack(idx) {
  loadListenTrack(idx, false);
}

function removeListenTrack(idx) {
  if (idx < 0 || idx >= listenTracks.length) return;
  
  // Revoke the blob URL to free memory
  if (listenTracks[idx].url) {
    URL.revokeObjectURL(listenTracks[idx].url);
  }
  
  // Remove from array
  listenTracks.splice(idx, 1);
  
  // Adjust current index if needed
  if (listenTracks.length === 0) {
    listenCurrentIdx = -1;
    // Reset player UI
    document.getElementById('listenAudio').src = '';
    document.getElementById('listenTrackName').textContent = '—';
    document.getElementById('listenTrackMeta').textContent = '';
    document.getElementById('listenTimeCur').textContent = '0:00';
    document.getElementById('listenTimeDur').textContent = '0:00';
    // Clear waveform
    const canvas = document.getElementById('listenWaveform');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('listenWaveMsg').style.display = 'block';
    document.getElementById('listenWaveMsg').textContent = 'No tracks loaded';
  } else if (idx < listenCurrentIdx) {
    listenCurrentIdx--;
  } else if (idx === listenCurrentIdx) {
    // Load next track or previous if at end
    if (listenCurrentIdx >= listenTracks.length) {
      listenCurrentIdx = listenTracks.length - 1;
    }
    loadListenTrack(listenCurrentIdx);
  }
  
  renderListenPlaylist();
}

function toggleSelectAll(checked) {
  document.querySelectorAll('.listen-check').forEach(cb => cb.checked = checked);
}

function updateSelectAll() {
  const all = document.querySelectorAll('.listen-check');
  const checked = document.querySelectorAll('.listen-check:checked');
  const sa = document.getElementById('listenSelectAll');
  if (sa) sa.checked = all.length > 0 && checked.length === all.length;
}

function getCheckedIndices() {
  return Array.from(document.querySelectorAll('.listen-check:checked'))
    .map(cb => parseInt(cb.dataset.idx));
}

function playSelected() {
  // If selected track is a ghost (from previous session), prompt to reload
  const sel = listenTracks[listenCurrentIdx >= 0 ? listenCurrentIdx : 0];
  if (sel && sel.ghost) {
    alert('This playlist is from a previous session. Please use + Add to reload your audio files.');
    return;
  }
  const indices = getCheckedIndices();
  if (!indices.length) { alert('Please tick at least one track first.'); return; }
  listenQueue = indices;
  listenQueuePos = 0;
  loadListenTrack(listenQueue[0], false);
}

function loadListenTrack(idx, autoplay) {
  autoplay = false; // Manual play only
  _listenAccumSecs = 0;
  if (idx < 0 || idx >= listenTracks.length) return;
  const track = listenTracks[idx];
  
  // If track is a ghost (from previous session), prompt to reload
  if (track.ghost || !track.url) {
    alert('This track is from a previous session. Please use + Add to reload your audio files.');
    return;
  }
  
  listenCurrentIdx = idx;
  listenUpdateNavBtns();
  const audio = document.getElementById('listenAudio');
  audio.src = track.url;
  audio.playbackRate = listenCurrentSpeed;
  if (autoplay) {
    audio.play().then(() => { listenPlaying = true; updatePlayBtn(); }).catch(() => {});
    // Focus waveform so space bar works
    document.getElementById('listenWaveform')?.focus();
  } else {
    listenPlaying = false; updatePlayBtn();
  }
  document.getElementById('listenTrackName').textContent = track.name;
  document.getElementById('listenTrackMeta').textContent =
    'Track ' + (idx + 1) + ' of ' + listenTracks.length;
  const saved = JSON.parse((App.Storage || window.Storage).get(STORAGE_KEYS.LISTEN_NOTES) || '{}');
  document.getElementById('listenNotes').value = saved[track.name] || '';
  clearAbLoop();
  listenWaveData = null;
  listenAudioBufRef = null;
  document.getElementById('listenWaveMsg').style.display = 'flex';
  decodeWaveform(track.url);
  renderListenPlaylist();
  renderVocabBookmarks();
  SRS.resetPanel();
}

function listenQueueNext() {
  if (listenQueue.length && listenQueuePos >= 0) {
    listenQueuePos++;
    if (listenQueuePos < listenQueue.length) {
      loadListenTrack(listenQueue[listenQueuePos], false);
    } else {
      listenPlaying = false; updatePlayBtn();
    }} else if (listenCurrentIdx < listenTracks.length - 1) {
    loadListenTrack(listenCurrentIdx + 1, false);
  } else {
    listenPlaying = false; updatePlayBtn();
  }
}

function listenUpdateNavBtns() {
  const prevBtn = document.querySelector('.btn-action[title="Previous"]');
  const nextBtn = document.querySelector('.btn-action[title="Next"]');
  const hasPrev = listenCurrentIdx > 0 || (listenQueue.length && listenQueuePos > 0);
  const hasNext = listenCurrentIdx < listenTracks.length - 1 || (listenQueue.length && listenQueuePos < listenQueue.length - 1);
  if (prevBtn) { prevBtn.style.opacity = hasPrev ? '1' : '0.3'; prevBtn.style.cursor = hasPrev ? 'pointer' : 'default'; }
  if (nextBtn) { nextBtn.style.opacity = hasNext ? '1' : '0.3'; nextBtn.style.cursor = hasNext ? 'pointer' : 'default'; }
}

function listenQueuePrev() {
  if (listenQueue.length && listenQueuePos > 0) {
    listenQueuePos--;
    loadListenTrack(listenQueue[listenQueuePos], false);
  } else if (listenCurrentIdx > 0) {
    loadListenTrack(listenCurrentIdx - 1, false);
  }
}

function toggleListenPlay() {
  const audio = document.getElementById('listenAudio');
  if (!audio.src) return;
  
  // Cancel any pending loop pause timer
  if (ListenState.loopPauseTimer) {
    clearTimeout(ListenState.loopPauseTimer);
    ListenState.loopPauseTimer = null;
  }
  
  if (listenPlaying) {
    audio.pause(); listenPlaying = false;
    if (dictationActive) setDictStatus('paused');
  } else {
    // If in dictation mode and user manually hits play, cancel any pending resume
    cancelDictResume();
    dictTyping = false;
    audio.play(); listenPlaying = true;
    if (dictationActive) setDictStatus('playing');
  }
  updatePlayBtn();
  // Focus waveform so space bar works
  document.getElementById('listenWaveform')?.focus();
}

// Listen session lookups
// ListenState.sessionLookups — see declaration above

// Translation cache is defined earlier in the file (GLOBAL QUICK TRANSLATE section)

// Transcription panel functions
function listenTransToggleKana() {
  listenTransSetMode('hiragana');
}

function listenTransClear() {
  const inp = document.getElementById('listenTranscribeText');
  if (inp) inp.value = '';
}

// Initialize transcription input with hiragana on load
// ListenState.transcribePauseTimeout = null; // kept for compatibility

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('listenWaveform');
  if (canvas) {
    canvas.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); toggleListenPlay(); }
    });
  }
  const inp = document.getElementById('listenTranscribeText');
  if (inp) {
    listenTransSetMode('hiragana');

    // Pause audio when typing starts — resume is manual only
    inp.addEventListener('input', () => {
      const audio = document.getElementById('listenAudio');
      if (audio && !audio.paused) {
        audio.pause();
        document.getElementById('listenPlayBtn').textContent = '▶';
      }
    });
  }
});

function renderListenSession() {
  const list = document.getElementById('listenSessionList');
  const empty = document.getElementById('listenSessionEmpty');
  const countEl = document.getElementById('listenSessionCount');
  
  if (countEl) countEl.textContent = ListenState.sessionLookups.length;
  if (empty) empty.style.display = ListenState.sessionLookups.length === 0 ? 'block' : 'none';
  
  if (!list) return;
  
  list.innerHTML = ListenState.sessionLookups.map((item, i) => `
    <div style="display:flex;gap:8px;align-items:center;padding:6px 8px;background:var(--paper);border:1px solid var(--border);border-radius:4px;margin-bottom:4px;font-size:0.82rem">
      <span style="font-family:var(--jp);color:var(--ink);min-width:60px">${escBdHtml(item.word)}</span>
      ${item.dictForm ? `<span style="font-family:var(--jp);color:var(--teal);font-size:0.78rem">(${escBdHtml(item.dictForm)})</span>` : ''}
      <span style="flex:1;color:var(--ink-light);font-family:var(--ui);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escBdHtml(item.translation)}</span>
      <button class="btn-icon" onclick="listenSessionDelete(${i})">✕</button>
      <button class="btn-icon" onclick="jpSpeak('${item.word.replace(/'/g,"\\'")}',0.85)">🔊</button>
    </div>
  `).join('');
}

function listenSessionDelete(i) {
  if (i >= 0 && i < ListenState.sessionLookups.length) {
    ListenState.sessionLookups.splice(i, 1);
    renderListenSession();
  }
}

function updatePlayBtn() {
  const btn = document.getElementById('listenPlayBtn');
  if (btn) btn.textContent = listenPlaying ? '⏸' : '▶';
}

function listenOnEnded() {
  listenPlaying = false; updatePlayBtn();
  if (shadowingActive) { shadowOnEnded(); return; }
  drillLastCompletedWrite('listening');
  // No auto-advance - stay on current track
}

function listenTimeUpdate() {
  const audio = document.getElementById('listenAudio');
  document.getElementById('listenTimeCur').textContent = fmtTime(audio.currentTime);
  document.getElementById('listenTimeDur').textContent = fmtTime(audio.duration);
  if (listenPlaying) {
    _listenAccumSecs += 0.25;
    if (_listenAccumSecs >= 600) {
      _listenAccumSecs = 0;
      if (typeof drillLastCompletedWrite === 'function') drillLastCompletedWrite('listening');
    }
  }
  if (shadowingActive) {
    shadowCheckTime();
  } else if (listenAbLooping && listenAbA !== null && listenAbB !== null) {
    if (audio.currentTime >= listenAbB && !ListenState.loopPauseTimer) {
      if (listenLoopPauseSecs > 0) {
        audio.pause();
        ListenState.loopPauseTimer = setTimeout(() => {
          ListenState.loopPauseTimer = null;
          audio.currentTime = listenAbA;
          audio.play();
        }, listenLoopPauseSecs * 1000);
      } else {
        audio.currentTime = listenAbA;
      }
    }
  }
  drawWaveform();
}

function setListenLoopPause(secs) {
  listenLoopPauseSecs = secs;
  saveListenPrefs();
}

function setListenSpeed(rate) {
  listenCurrentSpeed = rate;
  const sel = document.getElementById('listenSpeedSel');
  if (sel) sel.value = String(rate);
  document.getElementById('listenAudio').playbackRate = rate;
  document.querySelectorAll('.listen-speed-btn').forEach(b => {
    b.classList.toggle('active', parseFloat(b.textContent) === rate);
  });
  saveListenPrefs();
}

function listenSkip(secs) {
  const audio = document.getElementById('listenAudio');
  audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + secs));
}

function fmtTime(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return m + ':' + String(sec).padStart(2, '0');
}

// Loop setting state: null = idle, 'a' = waiting for A click, 'b' = waiting for B click
let loopSetState = null;

// Loop toggle cycles: idle → set-A → set-B → looping → idle (new loop)
function cycleLoop() {
  if (listenAbLooping || loopSetState === 'a' || loopSetState === 'b') {
    // Any active state → clear everything back to idle
    listenAbA = null; listenAbB = null; listenAbLooping = false; loopSetState = null;
  } else {
    // Idle → arm: next two waveform clicks set A then B
    loopSetState = 'a';
  }
  updateLoopSetUI();
  drawWaveform();
}
 // kept as alias for safety

function updateLoopSetUI() {
  const btn = document.getElementById('setLoopBtn');
  const canvas = document.getElementById('listenWaveform');
  const overlay = document.getElementById('loopHintOverlay');
  const bar = document.getElementById('loopStatusBar');
  if (!btn) return;

  btn.textContent = 'Loop';
  const active = loopSetState === 'a' || loopSetState === 'b' || listenAbLooping;
  btn.classList.toggle('toggle-on', active);

  if (loopSetState === 'a') {
    btn.title = 'Click waveform to set A (start) — click Loop to cancel';
    canvas.style.cursor = 'crosshair';
    if (overlay) overlay.style.display = 'block';
    if (bar) { bar.style.display = 'block'; bar.textContent = '◫ Click waveform to set loop start (A)…'; }
  } else if (loopSetState === 'b') {
    btn.title = 'Click waveform to set B (end) — click Loop to cancel';
    canvas.style.cursor = 'crosshair';
    if (overlay) overlay.style.display = 'block';
    if (bar) { bar.style.display = 'block'; bar.textContent = '▶ Now playing from A — click waveform to set loop end (B)…'; }
  } else if (listenAbLooping) {
    btn.title = 'Click to clear A/B loop';
    canvas.style.cursor = 'pointer';
    if (overlay) overlay.style.display = 'none';
    if (bar) { bar.style.display = 'block'; bar.textContent = '◫ Looping: ' + fmtTime(listenAbA) + ' → ' + fmtTime(listenAbB); }
  } else {
    btn.title = 'Click to set an A/B loop region';
    canvas.style.cursor = 'pointer';
    if (overlay) overlay.style.display = 'none';
    if (bar) { bar.style.display = 'none'; bar.textContent = ''; }
  }
}


function clearAbLoop() {
  listenAbA = null; listenAbB = null; listenAbLooping = false; loopSetState = null;
  updateLoopSetUI();
  drawWaveform();
}

function waveformClick(e) {
  const canvas = document.getElementById('listenWaveform');
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const audio = document.getElementById('listenAudio');
  
  // Visual feedback - flash border
  canvas.style.borderColor = 'var(--teal)';
  setTimeout(() => { canvas.style.borderColor = ''; }, 150);
  
  // If no audio loaded yet, ignore
  if (!audio || !audio.src) return;
  
  // If duration not available yet, try to load it
  if (!audio.duration || isNaN(audio.duration)) {
    audio.load();
    audio.addEventListener('loadedmetadata', function seekOnce() {
      audio.removeEventListener('loadedmetadata', seekOnce);
      const clickedTime = ratio * audio.duration;
      audio.currentTime = clickedTime;
      updateListenTimeDisplay();
      drawWaveform();
    }, { once: true });
    return;
  }

  const clickedTime = ratio * audio.duration;

  if (loopSetState === 'a') {
    listenAbA = clickedTime;
    listenAbB = null;
    listenAbLooping = false;
    loopSetState = 'b';
    audio.currentTime = clickedTime;
    updateLoopSetUI();
    updateListenTimeDisplay();
    drawWaveform();
    audio.play().then(() => { listenPlaying = true; updatePlayBtn(); }).catch(() => {});
  } else if (loopSetState === 'b') {
    const bTime = clickedTime;
    if (bTime <= listenAbA) {
      listenAbB = listenAbA;
      listenAbA = bTime;
    } else {
      listenAbB = bTime;
    }
    listenAbLooping = true;
    loopSetState = null;
    audio.currentTime = listenAbA;
    updateLoopSetUI();
    updateListenTimeDisplay();
    drawWaveform();
  } else {
    // Normal seek
    audio.currentTime = clickedTime;
    updateListenTimeDisplay();
    drawWaveform();
  }
}

// Helper to update the time display
function updateListenTimeDisplay() {
  const audio = document.getElementById('listenAudio');
  if (!audio) return;
  const cur = audio.currentTime || 0;
  const dur = audio.duration || 0;
  document.getElementById('listenTimeCur').textContent = fmtTime(cur);
  document.getElementById('listenTimeDur').textContent = fmtTime(dur);
}

function saveListenNote() {
  clearTimeout(listenNotesSave);
  listenNotesSave = setTimeout(() => {
    if (listenCurrentIdx < 0) return;
    const key = listenTracks[listenCurrentIdx].name;
    const val = document.getElementById('listenNotes').value;
    const saved = JSON.parse((App.Storage || window.Storage).get(STORAGE_KEYS.LISTEN_NOTES) || '{}');
    saved[key] = val;
    (App.Storage || window.Storage).set(STORAGE_KEYS.LISTEN_NOTES, JSON.stringify(saved));
  }, 600);
}

function clearListenPlaylist() {
  listenTracks.forEach(t => URL.revokeObjectURL(t.url));
  listenTracks = []; listenCurrentIdx = -1; listenQueue = []; listenQueuePos = -1;
  const audio = document.getElementById('listenAudio');
  audio.pause(); audio.src = '';
  listenPlaying = false; updatePlayBtn();
  listenWaveData = null;
  document.getElementById('listenTrackName').textContent = '—';
  document.getElementById('listenTrackMeta').textContent = '';
  document.getElementById('listenNotes').value = '';
  document.getElementById('listenTimeCur').textContent = '0:00';
  document.getElementById('listenTimeDur').textContent = '0:00';
  clearAbLoop();
  // Clear canvas
  const canvas = document.getElementById('listenWaveform');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  document.getElementById('listenWaveMsg').style.display = 'flex';
  document.getElementById('listenLayout').style.display = 'none';
  document.getElementById('listenDropzone').style.display = '';
  renderListenPlaylist();
}

// ── WAVEFORM ──────────────────────────────────────────
let listenAudioBufRef = null;  // Full decoded AudioBuffer for silence detection

async function decodeWaveform(url) {
  const waveMsg = document.getElementById('listenWaveMsg');
  try {
    const track = listenTracks[listenCurrentIdx];

    // Electron path: ffmpeg decodes in main process, returns waveform array
    console.log('[wave] audioAPI:', !!window.audioAPI?.waveform, 'filePath:', track?.filePath);
    if (window.audioAPI?.waveform && track && track.filePath) {
      const data = await window.audioAPI.waveform(track.filePath, 800);
      console.log('[wave] data returned:', data ? data.length : 'null');
      if (data && data.length) {
        listenWaveData = new Float32Array(data);
        if (waveMsg) waveMsg.style.display = 'none';
        drawWaveform();
        return;
      }
    }

    // No path available — skip waveform, don't crash
    if (waveMsg) waveMsg.style.display = 'none';
    drawWaveform();
  } catch(e) {
    if (waveMsg) waveMsg.style.display = 'none';
    drawWaveform();
  }
}


// Find the nearest silence boundary to targetTime, searching within searchWindow seconds.
// direction: 'before' scans leftward, 'after' scans rightward.
// A silence is a run of samples all below silenceThreshold for at least minSilenceSecs.
function findSilenceBoundary(targetTime, direction, searchWindow) {
  if (!listenAudioBufRef) return targetTime;
  const sr = listenAudioBufRef.sampleRate;
  const raw = listenAudioBufRef.getChannelData(0);
  const total = raw.length;
  const duration = listenAudioBufRef.duration;

  // Adaptive threshold: 2% of overall RMS, floor at 0.01
  let sumSq = 0, count = 0;
  const checkFrom = Math.max(0, Math.floor((targetTime - 10) * sr));
  const checkTo   = Math.min(total, Math.floor((targetTime + 10) * sr));
  for (let i = checkFrom; i < checkTo; i++) { sumSq += raw[i] * raw[i]; count++; }
  const rms = count > 0 ? Math.sqrt(sumSq / count) : 0.05;
  const threshold = Math.max(0.01, rms * 0.25);

  const minSilenceSamples = Math.floor(0.08 * sr);  // 80ms minimum silence
  const windowSamples = Math.floor(searchWindow * sr);
  const targetSample = Math.round(targetTime * sr);

  if (direction === 'before') {
    // Scan leftward from targetSample, look for a silence run
    const scanFrom = Math.max(0, targetSample - windowSamples);
    // Walk right-to-left collecting silence runs
    let silenceEnd = -1, silenceLen = 0;
    for (let i = targetSample; i >= scanFrom; i--) {
      if (Math.abs(raw[i]) < threshold) {
        if (silenceEnd < 0) silenceEnd = i;
        silenceLen++;
        if (silenceLen >= minSilenceSamples) {
          // Use the midpoint of this silence run
          return Math.max(0, (silenceEnd - silenceLen / 2) / sr);
        }
      } else {
        silenceEnd = -1; silenceLen = 0;
      }
    }
  } else {
    // Scan rightward from targetSample
    const scanTo = Math.min(total, targetSample + windowSamples);
    let silenceStart = -1, silenceLen = 0;
    for (let i = targetSample; i < scanTo; i++) {
      if (Math.abs(raw[i]) < threshold) {
        if (silenceStart < 0) silenceStart = i;
        silenceLen++;
        if (silenceLen >= minSilenceSamples) {
          return Math.min(duration, (silenceStart + silenceLen / 2) / sr);
        }
      } else {
        silenceStart = -1; silenceLen = 0;
      }
    }
  }
  return targetTime;  // no silence found — keep original
}

function drawWaveform() {
  const canvas = document.getElementById('listenWaveform');
  if (!canvas) return;
  const W = canvas.offsetWidth, H = 80;
  if (canvas.width !== W) canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const audio = document.getElementById('listenAudio');
  const progress = audio.duration ? audio.currentTime / audio.duration : 0;
  const playedW = Math.floor(progress * W);

  const cs = getComputedStyle(document.documentElement);
  const paperDark = cs.getPropertyValue('--paper-dark').trim() || '#ede6d6';
  const ink  = cs.getPropertyValue('--ink').trim()  || '#1a1410';
  const teal = cs.getPropertyValue('--teal').trim() || '#2d6a6a';
  const gold = '#d4a017';
  const mid  = H / 2;

  // Background
  ctx.fillStyle = paperDark;
  ctx.fillRect(0, 0, W, H);

  // A–B shaded region (drawn under waveform)
  if (listenAbA !== null && audio.duration) {
    const ax = (listenAbA / audio.duration) * W;
    const bx = listenAbB !== null ? (listenAbB / audio.duration) * W : playedW;
    if (bx > ax) {
      ctx.fillStyle = gold;
      ctx.globalAlpha = 0.08;
      ctx.fillRect(ax, 0, bx - ax, H);
      ctx.globalAlpha = 1;
    }
  }

  // Waveform bars
  if (listenWaveData) {
    const buckets = listenWaveData.length;
    const bw = W / buckets;
    for (let i = 0; i < buckets; i++) {
      const x = i * bw;
      const amp = listenWaveData[i] * (mid - 2);
      ctx.fillStyle = x < playedW ? teal : ink;
      ctx.globalAlpha = x < playedW ? 0.9 : 0.25;
      ctx.fillRect(Math.floor(x), mid - amp, Math.max(1, bw - 0.5), amp * 2);
    }
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = ink; ctx.globalAlpha = 0.1;
    ctx.fillRect(0, mid - 1, W, 2);
    ctx.globalAlpha = 1;
  }

  // A marker
  if (listenAbA !== null && audio.duration) {
    const ax = Math.floor((listenAbA / audio.duration) * W);
    ctx.strokeStyle = gold; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax, H); ctx.stroke();
    ctx.fillStyle = gold; ctx.font = 'bold 10px monospace';
    ctx.fillText('A', ax + 3, 11);
  }
  // B marker
  if (listenAbB !== null && audio.duration) {
    const bx = Math.floor((listenAbB / audio.duration) * W);
    ctx.strokeStyle = gold; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, H); ctx.stroke();
    ctx.fillStyle = gold; ctx.font = 'bold 10px monospace';
    ctx.fillText('B', Math.max(0, bx - 13), 11);
  }

  // Playhead
  const px = Math.floor(progress * W);
  ctx.strokeStyle = cs.getPropertyValue('--red').trim() || '#c0392b';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();

  // Vocab bookmark pins — red diamonds at the bottom edge
  if (audio.duration && listenCurrentIdx >= 0) {
    const trackName = listenTracks[listenCurrentIdx].name;
    const bms = getVocabBookmarks(trackName);
    const red = cs.getPropertyValue('--red').trim() || '#c0392b';
    bms.forEach((bm, i) => {
      const bx = Math.floor((bm.time / audio.duration) * W);
      const label = bm.word ? bm.word.charAt(0) : '◆';
      // Thin vertical line
      ctx.strokeStyle = red; ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.moveTo(bx, H * 0.6); ctx.lineTo(bx, H); ctx.stroke();
      ctx.globalAlpha = 1;
      // Diamond pin
      const s = 5;
      ctx.fillStyle = red;
      ctx.beginPath();
      ctx.moveTo(bx, H - s * 2);
      ctx.lineTo(bx + s, H - s);
      ctx.lineTo(bx, H);
      ctx.lineTo(bx - s, H - s);
      ctx.closePath();
      ctx.fill();
      // Number label above pin
      ctx.fillStyle = red;
      ctx.font = 'bold 9px monospace';
      ctx.fillText(i + 1, bx - 3, H - s * 2 - 3);
    });
  }

  // Crosshair hint when in loop-set mode
  if (loopSetState) {
    ctx.strokeStyle = gold; ctx.lineWidth = 1; ctx.setLineDash([3,3]);
    ctx.strokeRect(1, 1, W-2, H-2);
    ctx.setLineDash([]);
  }
}


// ═══════════════════════════════════════════════════════
// DICTATION MODE
// ═══════════════════════════════════════════════════════

// ── N5 sentence bank ─────────────────────────────────────
const N5_SENTENCES = [
  {jp:'今日は天気がいいです。',read:'きょうはてんきがいいです。'},
  {jp:'私は毎朝コーヒーを飲みます。',read:'わたしはまいあさコーヒーをのみます。'},
  {jp:'駅はどこですか。',read:'えきはどこですか。'},
  {jp:'あの映画はとても面白かったです。',read:'あのえいがはとてもおもしろかったです。'},
  {jp:'明日は何時に起きますか。',read:'あしたはなんじにおきますか。'},
  {jp:'このレストランの料理はおいしいです。',read:'このレストランのりょうりはおいしいです。'},
  {jp:'私の趣味は音楽を聴くことです。',read:'わたしのしゅみはおんがくをきくことです。'},
  {jp:'バスで学校に行きます。',read:'バスでがっこうにいきます。'},
  {jp:'昨日友達と公園で遊びました。',read:'きのうともだちとこうえんであそびました。'},
  {jp:'この本は難しくないです。',read:'このほんはむずかしくないです。'},
  {jp:'日本語を勉強しています。',read:'にほんごをべんきょうしています。'},
  {jp:'水をください。',read:'みずをください。'},
  {jp:'図書館で本を読みます。',read:'としょかんでほんをよみます。'},
  {jp:'今夜は何を食べますか。',read:'こんやはなにをたべますか。'},
  {jp:'先生は親切です。',read:'せんせいはしんせつです。'},
  {jp:'電車は八時に来ます。',read:'でんしゃははちじにきます。'},
  {jp:'部屋に猫が三匹います。',read:'へやにねこがさんびきいます。'},
  {jp:'母はスーパーで買い物をします。',read:'はははスーパーでかいものをします。'},
  {jp:'この道をまっすぐ行ってください。',read:'このみちをまっすぐいってください。'},
  {jp:'週末に映画を見に行きませんか。',read:'しゅうまつにえいがをみにいきませんか。'},
  {jp:'今日は仕事が多いです。',read:'きょうはしごとがおおいです。'},
  {jp:'お名前は何ですか。',read:'おなまえはなんですか。'},
  {jp:'新しいかばんを買いました。',read:'あたらしいかばんをかいました。'},
  {jp:'冬は寒くて夏は暑いです。',read:'ふゆはさむくてなつはあついです。'},
  {jp:'もう少し待ってください。',read:'もうすこしまってください。'},
  {jp:'コンビニはあの角を曲がったところにあります。',read:'コンビニはあのかどをまがったところにあります。'},
  {jp:'旅行のために日本語を練習しています。',read:'りょこうのためににほんごをれんしゅうしています。'},
  {jp:'昨日は早く寝たので元気です。',read:'きのうははやくねたのでげんきです。'},
  {jp:'このシャツは大きすぎます。',read:'このシャツはおおきすぎます。'},
  {jp:'何か飲み物はいりますか。',read:'なにかのみものはいりますか。'},
];

let dictSentence = null;  // current standalone sentence

let dictationActive = false;
let dictTimeoutSecs = 2.0;
let dictResumeTimer = null;
let dictCountdownTimer = null;
let dictCountdownVal = 0;
let dictTyping = false;

// ── Toggle dictation mode ─────────────────────────────────

// ── Listen mode dropdown dispatcher ──────────────────────────────────────
function toggleDictationMode() {
  dictationActive = !dictationActive;
  const btn   = document.getElementById('dictModeBtn');
  const panel = document.getElementById('dictationPanel');

  if (dictationActive) {
    btn.classList.add('toggle-on');
    panel.style.display   = 'block';

    // Decide mode: standalone (no track) vs audio-file mode
    const noTrack = listenCurrentIdx < 0;
    document.getElementById('dictStandaloneMode').style.display = noTrack ? 'block' : 'none';
    document.getElementById('dictAudioMode').style.display      = noTrack ? 'none'  : 'block';

    if (noTrack) {
      document.getElementById('listenDropzone').style.display = 'none';
      panel.style.paddingLeft = '0';
      newDictSentence();
    } else {
      // Align panel left with the player column (playlist=260px + gap=20px)
      panel.style.paddingLeft = '280px';
      setDictStatus('playing');
      setTimeout(() => document.getElementById('dictationTextAudio').focus(), 50);
    }
  } else {
    btn.classList.remove('toggle-on');
    panel.style.display   = 'none';
    panel.style.paddingLeft = '0';
    cancelDictResume();
    dictTyping = false;
    window.speechSynthesis && speechSynthesis.cancel();
    if (!listenTracks.length) {
      document.getElementById('listenDropzone').style.display = '';
    }
  }
}

// ── Standalone dictation ──────────────────────────────────
function newDictSentence() {
  dictSentence = N5_SENTENCES[Math.floor(Math.random() * N5_SENTENCES.length)];
  document.getElementById('dictationText').value = '';
  document.getElementById('dictFeedback').style.display = 'none';
  document.getElementById('dictReveal').style.display   = 'none';
  document.getElementById('dictSaHint').textContent = 'Press Check when done — AI will give feedback';
  // auto-play
  setTimeout(() => playDictSentence(), 400);
}

function playDictSentence() {
  if (!dictSentence) return;
  TTS.speak(dictSentence.jp, 0.9);
}

async function checkDictation() {
  if (!dictSentence) return;
  const attempt = document.getElementById('dictationText').value.trim();
  if (!attempt) { document.getElementById('dictSaHint').textContent = 'Write something first!'; return; }
  if (!(App.getApiKey || window.getApiKey)?.()) {
    document.getElementById('dictSaHint').textContent = 'Add your API key in Settings to get feedback.';
    showDictReveal();
    _ensureDictPanelState();
    return;
  }

  const fbEl   = document.getElementById('dictFeedback');
  const hintEl = document.getElementById('dictSaHint');
  hintEl.textContent = 'Checking…';
  fbEl.style.display   = 'block';
  fbEl.style.borderColor = 'var(--border)';
  fbEl.style.color       = 'var(--ink)';
  fbEl.textContent       = '…';

  const correct = dictSentence.jp;
  const prompt  = `The student is practising Japanese dictation at N5 level.

The sentence that was played: 「${correct}」
The student wrote: 「${attempt}」

Give brief, direct feedback in English:
1. State whether it is correct or not.
2. If wrong: identify exactly which character(s) or word(s) differ, explain the correct reading, and note any grammar or spelling pattern worth remembering.
3. If correct: one short note about the sentence if interesting, otherwise just confirm.
No praise, no encouragement — just clear correction.`;

  try {
    const data = await (App.claudeAPI || window.claudeAPI)({
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }]
    ,
      track: 'writing'
    });
    const msg = (App.claudeText || window.claudeText)(data) || 'No response.';
    const isCorrect = attempt === correct ||
      attempt.replace(/\s/g,'') === correct.replace(/\s/g,'');
    fbEl.style.borderColor = isCorrect ? 'var(--teal)' : 'var(--gold)';
    fbEl.style.color       = 'var(--ink)';
    fbEl.textContent       = msg;
    hintEl.textContent = 'Play again or press New for another sentence';
  } catch(e) {
    fbEl.textContent = 'Error: ' + e.message;
  }
  showDictReveal();
  _ensureDictPanelState();
}

function showDictReveal() {
  if (!dictSentence) return;
  const rev = document.getElementById('dictReveal');
  rev.style.display = 'block';
  rev.innerHTML = '<span style="color:var(--ink-light);font-size:0.65rem;font-family:monospace;letter-spacing:0.08em;text-transform:uppercase">Correct answer</span><br>' +
    dictSentence.jp + '<br><span style="font-size:0.78rem;color:var(--ink-light)">' + dictSentence.read + '</span>';
}

// ── Audio-file dictation (original behaviour) ─────────────
function onDictationInput() {
  if (!dictationActive) return;
  const audio    = document.getElementById('listenAudio');
  const textarea = document.getElementById('dictationTextAudio');

  if (!dictTyping) {
    dictTyping = true;
    if (!audio.paused) {
      audio.pause();
      listenPlaying = false;
      updatePlayBtn();
    }
  }

  textarea.classList.add('dict-active-typing');
  textarea.classList.remove('dict-active-playing');
  setDictStatus('paused');
  cancelDictResume();

  dictCountdownVal = dictTimeoutSecs;
  updateDictCountdown();

  dictCountdownTimer = setInterval(() => {
    dictCountdownVal -= 0.1;
    updateDictCountdown();
    if (dictCountdownVal <= 0) { clearInterval(dictCountdownTimer); dictCountdownTimer = null; }
  }, 100);

  dictResumeTimer = setTimeout(() => {
    dictTyping = false;
    const cd = document.getElementById('dictCountdown');
    if (cd) { cd.textContent = ''; cd.style.display = 'none'; }
    if (!dictationActive || !audio.src) return;
    audio.play().then(() => {
      listenPlaying = true;
      updatePlayBtn();
      textarea.classList.remove('dict-active-typing');
      textarea.classList.add('dict-active-playing');
      setDictStatus('playing');
    }).catch(() => {});
  }, dictTimeoutSecs * 1000);
}

// alias for standalone textarea (no auto-resume needed)
function onDictationInputAudio() { onDictationInput(); }

function cancelDictResume() {
  if (dictResumeTimer)    { clearTimeout(dictResumeTimer);    dictResumeTimer = null; }
  if (dictCountdownTimer) { clearInterval(dictCountdownTimer); dictCountdownTimer = null; }
  const cd = document.getElementById('dictCountdown');
  if (cd) { cd.textContent = ''; cd.style.display = 'none'; }
}

function updateDictCountdown() {
  const cd = document.getElementById('dictCountdown');
  if (!cd) return;
  if (dictCountdownVal > 0) {
    cd.style.display = 'inline';
    cd.textContent = '↺ ' + Math.max(0, dictCountdownVal).toFixed(1) + 's';
  }
}

function setDictStatus(state) {
  const el = document.getElementById('dictStatus');
  if (!el) return;
  el.className = 'dict-status';
  if (state === 'playing') {
    el.classList.add('dict-playing');
    el.textContent = '▶ Playing';
    const ta = document.getElementById('dictationTextAudio');
    if (ta) { ta.classList.remove('dict-active-typing'); ta.classList.add('dict-active-playing'); }
  } else if (state === 'paused') {
    el.classList.add('dict-paused');
    el.textContent = '⏸ Paused — typing';
  }
}

function clearDictation() {
  const ta = document.getElementById('dictationText') || document.getElementById('dictationTextAudio');
  if (ta) ta.value = '';
  document.getElementById('dictFeedback') && (document.getElementById('dictFeedback').style.display = 'none');
  document.getElementById('dictReveal')   && (document.getElementById('dictReveal').style.display   = 'none');
}

function copyDictation() {
  const ta  = document.getElementById('dictationTextAudio') || document.getElementById('dictationText');
  const text = ta ? ta.value : '';
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const btn = event.target;
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = orig, 1200);
  }).catch(() => { if (ta) { ta.select(); document.execCommand('copy'); } });
}

// ═══════════════════════════════════════════════════════
// SHADOWING MODE
// ═══════════════════════════════════════════════════════
let shadowingActive = false;
let shadowSegSecs = 5;
let shadowRepCount = 3;
let shadowRepsDone = 0;
let shadowSegStart = 0;
let shadowPauseSecs = 0;
let shadowPauseTimer = null;

function toggleShadowing() {
  try {
    shadowingActive = !shadowingActive;
    const btn = document.getElementById('shadowBtn');
    const panel = document.getElementById('shadowPanel');
    if (!panel) { console.error('shadowPanel not found!'); return; }
    if (shadowingActive) {
      btn.classList.add('toggle-on');
      panel.style.display = 'flex';
      const audio = document.getElementById('listenAudio');
      if (!audio) { console.error('listenAudio not found!'); }
      // Snap the start to nearest silence before current time
      const rawStart = audio ? audio.currentTime : 0;
      shadowSegStart = findSilenceBoundary(rawStart, 'before', 2);
      const rawEnd = shadowSegStart + shadowSegSecs;
      const snappedEnd = findSilenceBoundary(rawEnd, 'after', 3);
      listenAbA = shadowSegStart;
      listenAbB = snappedEnd;
      listenAbLooping = true;
      shadowRepsDone = 0;
      if (audio) audio.currentTime = listenAbA;
      updateShadowStatus();
      updateLoopSetUI();
      drawWaveform();
      // Update segment text
      const segText = document.getElementById('shadowSegmentText');
      if (segText) segText.textContent = `${fmtTime(listenAbA)} → ${fmtTime(listenAbB)}`;
      // Populate mic selector
      listenPopulateMics();
    } else {
      btn.classList.remove('toggle-on');
      panel.style.display = 'none';
      clearTimeout(shadowPauseTimer);
      clearAbLoop();
      updateShadowStatus();
    }
  } catch (e) {
    console.error('toggleShadowing error:', e);
  }
}

function shadowOnEnded() {
  // Called when audio ends while shadowing — treat as segment end
  shadowAdvanceOrRepeat();
}

function shadowCheckTime() {
  // Called from listenTimeUpdate when shadowing is active
  if (!shadowingActive || listenAbB === null) return;
  const audio = document.getElementById('listenAudio');
  if (audio.currentTime >= listenAbB) {
    audio.currentTime = listenAbA; // always snap back first
    shadowAdvanceOrRepeat();
  }
}

function shadowAdvanceOrRepeat() {
  shadowRepsDone++;
  const audio = document.getElementById('listenAudio');
  const then = document.getElementById('shadowThen') ? document.getElementById('shadowThen').value : 'advance';

  // If there's a pause gap configured, pause now and resume after delay
  if (shadowPauseSecs > 0) {
    audio.pause(); listenPlaying = false; updatePlayBtn();
    let remaining = shadowPauseSecs;
    updateShadowStatus(`Shadow now — resuming in ${remaining}s`);
    clearTimeout(shadowPauseTimer);
    const tick = () => {
      remaining -= 1;
      if (remaining > 0) {
        updateShadowStatus(`Shadow now — resuming in ${remaining}s`);
        shadowPauseTimer = setTimeout(tick, 1000);
      } else {
        shadowContinue(audio, then);
      }
    };
    shadowPauseTimer = setTimeout(tick, 1000);
    return;
  }
  shadowContinue(audio, then);
}

function shadowContinue(audio, then) {
  updateShadowStatus();
  if (shadowRepsDone >= shadowRepCount) {
    shadowRepsDone = 0;
    if (then === 'advance') {
      const snappedStart = findSilenceBoundary(listenAbB, 'after', 1);
      shadowSegStart = snappedStart;
      listenAbA = shadowSegStart;
      listenAbB = findSilenceBoundary(shadowSegStart + shadowSegSecs, 'after', 3);
      audio.currentTime = listenAbA;
      updateLoopSetUI(); drawWaveform();
    } else {
      audio.pause(); listenPlaying = false; updatePlayBtn();
      updateShadowStatus('▶ Press play for next segment');
      return;
    }
  } else {
    audio.currentTime = listenAbA;
  }
  audio.play().then(() => { listenPlaying = true; updatePlayBtn(); }).catch(() => {});
  updateShadowStatus();
}

function updateShadowStatus(msg) {
  const el = document.getElementById('shadowStatus');
  if (!el) return;
  if (!shadowingActive) { el.textContent = ''; return; }
  el.textContent = msg !== undefined ? msg : `Rep ${Math.min(shadowRepsDone, shadowRepCount)} of ${shadowRepCount}`;
}

// Replay current shadow segment
// ═══════════════════════════════════════════════════════
// LISTEN SHADOW RECORDING
// ═══════════════════════════════════════════════════════
// ListenState.sh* — see declaration below

// Populate mic selector dropdown
async function listenPopulateMics() {
  const select = document.getElementById('listenMicSelect');
  if (!select) return;
  
  try {
    // Request permission first to get device labels
    await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === 'audioinput');
    
    select.innerHTML = '';
    mics.forEach((mic, i) => {
      const label = mic.label || `Microphone ${i + 1}`;
      const isDefault = mic.deviceId === 'default' || label.toLowerCase().includes('default') || i === 0;
      select.innerHTML += `<option value="${mic.deviceId}"${isDefault && !ListenState.selectedMicId ? ' selected' : ''}>${label}</option>`;
    });
    
    // Restore saved selection if exists
    const saved = (App.Storage || window.Storage).get(STORAGE_KEYS.LISTEN_MIC);
    if (saved && mics.some(m => m.deviceId === saved)) {
      select.value = saved;
      ListenState.selectedMicId = saved;
    } else if (mics.length > 0 && !ListenState.selectedMicId) {
      // Set default to first mic (usually the built-in)
      ListenState.selectedMicId = mics[0].deviceId;
      select.value = ListenState.selectedMicId;
    }
  } catch (e) {
    select.innerHTML = '<option value="">Click to enable mic</option>';
  }
}

function listenSetMic(deviceId) {
  ListenState.selectedMicId = deviceId || null;
  if (deviceId) {
    (App.Storage || window.Storage).set(STORAGE_KEYS.LISTEN_MIC, deviceId);
  } else {
    (App.Storage || window.Storage).remove(STORAGE_KEYS.LISTEN_MIC);
  }
}

// Request mic permission when clicking the dropdown (before recording)
async function listenRequestMicAccess() {
  const select = document.getElementById('listenMicSelect');
  if (select && select.options.length <= 1) {
    await listenPopulateMics();
  }
}

function listenShPlayback() {
  if (!ListenState.shRecordedBlob) return;
  
  const statusEl = document.getElementById('listenShStatus');
  
  if (ListenState.shPlaybackAudio) {
    ListenState.shPlaybackAudio.pause();
    ListenState.shPlaybackAudio = null;
    statusEl.textContent = 'Stopped';
    return;
  }
  
  ListenState.shPlaybackAudio = new Audio(URL.createObjectURL(ListenState.shRecordedBlob));
  ListenState.shPlaybackAudio.onended = () => {
    ListenState.shPlaybackAudio = null;
    statusEl.textContent = 'Done';
  };
  ListenState.shPlaybackAudio.play();
  statusEl.textContent = 'Playing…';
}

function listenShDrawWaveform(blob) {
  const canvas = document.getElementById('listenShWaveform');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  // Set canvas size
  canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
  canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1);
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  
  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;
  
  // Decode and draw
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const buffer = await audioCtx.decodeAudioData(reader.result);
      const data = buffer.getChannelData(0);
      
      // Downsample to bars
      const bars = Math.min(100, w / 3);
      const step = Math.floor(data.length / bars);
      
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,107,107,0.6)';
      
      for (let i = 0; i < bars; i++) {
        let max = 0;
        for (let j = 0; j < step; j++) {
          const v = Math.abs(data[i * step + j] || 0);
          if (v > max) max = v;
        }
        const barH = max * h * 0.9;
        const x = (i / bars) * w;
        const barW = (w / bars) - 1;
        ctx.fillRect(x, (h - barH) / 2, barW, barH);
      }
    } catch (e) {
      ctx.fillStyle = 'var(--ink-light)';
      ctx.font = '11px var(--ui)';
      ctx.fillText('Could not render waveform', 10, h/2 + 4);
    }
  };
  reader.readAsArrayBuffer(blob);
}

// ═══════════════════════════════════════════════════════
// SEGMENT-BY-SEGMENT RECORDING
// ═══════════════════════════════════════════════════════
// ListenState.recMode — see declaration below

function setListenRecMode(mode) {
  ListenState.recMode = mode;
  
  const singleBtn = document.getElementById('listenRecModeSingle');
  const segBtn = document.getElementById('listenRecModeSegment');
  const segPanel = document.getElementById('listenSegmentPanel');
  
  if (singleBtn && segBtn) {
    singleBtn.classList.toggle('btn-active', mode === 'single');
    segBtn.classList.toggle('btn-active', mode === 'segment');
  }
  
  if (segPanel) {
    segPanel.style.display = mode === 'segment' ? 'block' : 'none';
  }
  
  updateListenSegmentUI();
}

function updateListenSegmentUI() {
  const countEl = document.getElementById('listenSegmentCount');
  const playBtn = document.getElementById('listenPlayAllBtn');
  const combineBtn = document.getElementById('listenCombineBtn');
  const downloadBtn = document.getElementById('listenDownloadBtn');
  const bar = document.getElementById('listenSegmentBar');
  
  const count = ListenState.segmentRecordings.length;
  
  if (countEl) countEl.textContent = `${count} segment${count !== 1 ? 's' : ''} recorded`;
  if (playBtn) playBtn.disabled = count === 0;
  if (combineBtn) combineBtn.disabled = count === 0;
  if (downloadBtn) downloadBtn.disabled = count === 0;
  
  // Update segment bar with larger buttons and drag handles
  if (bar) {
    bar.innerHTML = ListenState.segmentRecordings.map((rec, i) => `
      <div class="listen-segment-item" draggable="true" data-idx="${i}" 
           ondragstart="listenSegDragStart(event)" ondragover="listenSegDragOver(event)" ondrop="listenSegDrop(event)" ondragend="listenSegDragEnd(event)"
           style="display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px;background:var(--paper);border:1px solid var(--border);border-radius:6px;cursor:grab">
        <div onclick="listenPlaySegment(${i})" style="width:28px;height:28px;background:var(--teal);border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:var(--ui);font-size:0.75rem;font-weight:600;color:#1c1c1e">${i + 1}</div>
        <button class="btn-icon" onclick="event.stopPropagation();listenDeleteSegment(${i})">✕</button>
      </div>
    `).join('');
  }
}

// Drag and drop reordering
// ListenState.dragIdx — see declaration below

function listenSegDragStart(e) {
  ListenState.dragIdx = parseInt(e.target.closest('[data-idx]').dataset.idx);
  e.target.closest('[data-idx]').style.opacity = '0.5';
  e.dataTransfer.effectAllowed = 'move';
}

function listenSegDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const target = e.target.closest('[data-idx]');
  if (target) target.style.borderColor = 'var(--teal)';
}

function listenSegDrop(e) {
  e.preventDefault();
  const target = e.target.closest('[data-idx]');
  if (!target) return;
  const dropIdx = parseInt(target.dataset.idx);
  if (ListenState.dragIdx === dropIdx || ListenState.dragIdx < 0) return;
  
  // Reorder array
  const [moved] = ListenState.segmentRecordings.splice(ListenState.dragIdx, 1);
  ListenState.segmentRecordings.splice(dropIdx, 0, moved);
  
  updateListenSegmentUI();
}

function listenSegDragEnd(e) {
  ListenState.dragIdx = -1;
  document.querySelectorAll('.listen-segment-item').forEach(el => {
    el.style.opacity = '1';
    el.style.borderColor = 'var(--border)';
  });
}

async function listenShRecord() {
  const btn = document.getElementById('listenShRecordBtn');
  const statusEl = document.getElementById('listenShStatus');
  
  // Stop if already recording
  if (ListenState.shMediaRecorder && ListenState.shMediaRecorder.state === 'recording') {
    ListenState.shMediaRecorder.stop();
    btn.textContent = '⏺';
    btn.style.background = 'var(--red)';
    return;
  }
  
  try {
    const constraints = { audio: ListenState.selectedMicId ? { deviceId: { exact: ListenState.selectedMicId } } : true };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    ListenState.shAudioChunks = [];
    ListenState.shMediaRecorder = new MediaRecorder(stream);
    
    ListenState.shMediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) ListenState.shAudioChunks.push(e.data);
    };
    
    ListenState.shMediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(ListenState.shAudioChunks, { type: 'audio/webm' });
      
      if (ListenState.recMode === 'segment') {
        // Add to segment recordings
        ListenState.segmentRecordings.push({ blob, timestamp: Date.now() });
        updateListenSegmentUI();
        statusEl.textContent = `Segment ${ListenState.segmentRecordings.length} saved`;
      } else {
        // Single mode - save to main blob
        ListenState.shRecordedBlob = blob;
        const playBtn = document.getElementById('listenShPlaybackBtn');
        if (playBtn) {
          playBtn.disabled = false;
          playBtn.style.opacity = '1';
        }
        statusEl.textContent = 'Ready to play';
      }
      
      // Draw waveform for the recording
      listenShDrawWaveform(blob);
    };
    
    ListenState.shMediaRecorder.start();
    btn.textContent = '⏹';
    btn.style.background = 'var(--red)';
    statusEl.textContent = ListenState.recMode === 'segment' 
      ? `Recording segment ${ListenState.segmentRecordings.length + 1}…` 
      : 'Recording…';
    
  } catch (e) {
    console.error('Recording error:', e);
    statusEl.textContent = 'Mic access denied';
  }
}

function listenPlaySegment(idx) {
  if (idx < 0 || idx >= ListenState.segmentRecordings.length) return;
  const audio = new Audio(URL.createObjectURL(ListenState.segmentRecordings[idx].blob));
  audio.play();
}

function listenDeleteSegment(idx) {
  if (idx < 0 || idx >= ListenState.segmentRecordings.length) return;
  ListenState.segmentRecordings.splice(idx, 1);
  updateListenSegmentUI();
}

function listenClearSegments() {
  if (ListenState.segmentRecordings.length === 0) return;
  if (!confirm('Clear all segment recordings?')) return;
  ListenState.segmentRecordings = [];
  updateListenSegmentUI();
  document.getElementById('listenShStatus').textContent = 'Cleared';
}

async function listenPlayAllSegments() {
  if (ListenState.segmentRecordings.length === 0) return;
  
  let idx = 0;
  const statusEl = document.getElementById('listenShStatus');
  
  const playNext = () => {
    if (idx >= ListenState.segmentRecordings.length) {
      statusEl.textContent = 'Done';
      return;
    }
    statusEl.textContent = `Playing ${idx + 1}/${ListenState.segmentRecordings.length}`;
    const audio = new Audio(URL.createObjectURL(ListenState.segmentRecordings[idx].blob));
    audio.onended = () => { idx++; playNext(); };
    audio.play();
  };
  
  playNext();
}

async function listenCombineSegments() {
  if (ListenState.segmentRecordings.length === 0) return;
  
  const statusEl = document.getElementById('listenShStatus');
  statusEl.textContent = 'Combining...';
  
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Decode all recordings
    const audioBuffers = await Promise.all(ListenState.segmentRecordings.map(async (rec) => {
      const arrayBuffer = await rec.blob.arrayBuffer();
      return audioCtx.decodeAudioData(arrayBuffer);
    }));
    
    // Trim silence from each and combine
    const trimmedBuffers = audioBuffers.map(buf => trimSilence(buf, audioCtx));
    const totalLength = trimmedBuffers.reduce((sum, buf) => sum + buf.length, 0);
    
    const sampleRate = audioBuffers[0].sampleRate;
    const numChannels = audioBuffers[0].numberOfChannels;
    const combined = audioCtx.createBuffer(numChannels, totalLength, sampleRate);
    
    let offset = 0;
    for (const buf of trimmedBuffers) {
      for (let ch = 0; ch < numChannels; ch++) {
        combined.getChannelData(ch).set(buf.getChannelData(ch), offset);
      }
      offset += buf.length;
    }
    
    // Convert to blob and save as single recording
    const wavBlob = audioBufferToWav(combined);
    ListenState.shRecordedBlob = wavBlob;
    
    // Enable playback
    const playBtn = document.getElementById('listenShPlaybackBtn');
    playBtn.disabled = false;
    playBtn.style.opacity = '1';
    
    listenShDrawWaveform(wavBlob);
    statusEl.textContent = `Combined ${ListenState.segmentRecordings.length} segments`;
    
    audioCtx.close();
  } catch (e) {
    console.error('Combine error:', e);
    statusEl.textContent = 'Combine failed';
  }
}

async function listenDownloadSegments() {
  if (ListenState.segmentRecordings.length === 0) return;
  
  const statusEl = document.getElementById('listenShStatus');
  statusEl.textContent = 'Processing...';
  
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Decode all recordings
    const audioBuffers = await Promise.all(ListenState.segmentRecordings.map(async (rec) => {
      const arrayBuffer = await rec.blob.arrayBuffer();
      return audioCtx.decodeAudioData(arrayBuffer);
    }));
    
    // Trim and combine
    const trimmedBuffers = audioBuffers.map(buf => trimSilence(buf, audioCtx));
    const totalLength = trimmedBuffers.reduce((sum, buf) => sum + buf.length, 0);
    
    const sampleRate = audioBuffers[0].sampleRate;
    const numChannels = audioBuffers[0].numberOfChannels;
    const combined = audioCtx.createBuffer(numChannels, totalLength, sampleRate);
    
    let offset = 0;
    for (const buf of trimmedBuffers) {
      for (let ch = 0; ch < numChannels; ch++) {
        combined.getChannelData(ch).set(buf.getChannelData(ch), offset);
      }
      offset += buf.length;
    }
    
    const wavBlob = audioBufferToWav(combined);
    
    // Get track name for filename
    const trackName = listenTracks[listenCurrentIdx]?.name || 'recording';
    const safeName = trackName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_').slice(0, 50);
    const filename = `${safeName}_shadow_${new Date().toISOString().slice(0,10)}.wav`;
    
    // Try Save As dialog
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'WAV Audio', accept: { 'audio/wav': ['.wav'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(wavBlob);
        await writable.close();
        statusEl.textContent = 'Downloaded!';
        audioCtx.close();
        return;
      } catch (e) {
        if (e.name === 'AbortError') {
          statusEl.textContent = 'Cancelled';
          audioCtx.close();
          return;
        }
      }
    }
    
    // Fallback download
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    statusEl.textContent = 'Downloaded!';
    audioCtx.close();
  } catch (e) {
    console.error('Download error:', e);
    statusEl.textContent = 'Download failed';
  }
}

// Window exports for segment functions
window['listenClearSegments'] = listenClearSegments;
window['listenPlayAllSegments'] = listenPlayAllSegments;
window['listenCombineSegments'] = listenCombineSegments;
window['listenDownloadSegments'] = listenDownloadSegments;
window['setListenRecMode'] = setListenRecMode;

// ═══════════════════════════════════════════════════════
// VOCAB BOOKMARKS
// ═══════════════════════════════════════════════════════
const VOCAB_BM_KEY = 'listenVocabBookmarks';

function getVocabBookmarks(trackName) {
  try {
    const all = Storage.getJSON(VOCAB_BM_KEY, {});
    return all[trackName] || [];
  } catch { return []; }
}

function saveVocabBookmarks(trackName, bms) {
  try {
    const all = Storage.getJSON(VOCAB_BM_KEY, {});
    all[trackName] = bms;
    Storage.setJSON(VOCAB_BM_KEY, all);
  } catch {}
}


const vocabDefaultOffset = 0.50;

function dropVocabBookmark() {
  if (listenCurrentIdx < 0) return;
  const audio = document.getElementById('listenAudio');
  const t = Math.max(0, audio.currentTime - vocabDefaultOffset);
  const trackName = listenTracks[listenCurrentIdx].name;
  const bms = getVocabBookmarks(trackName);
  bms.push({ time: t, word: '', id: Date.now() });
  saveVocabBookmarks(trackName, bms);
  renderVocabBookmarks();
  const btn = document.getElementById('vocabBtn');
  btn.style.background = 'var(--red)'; btn.style.color = 'var(--paper)';
  setTimeout(() => { btn.style.background = ''; btn.style.color = 'var(--red)'; }, 400);
  setTimeout(() => {
    const inputs = document.querySelectorAll('.vocab-bookmark-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }, 50);
}

function renderVocabBookmarks() {
  if (listenCurrentIdx < 0) return;
  const trackName = listenTracks[listenCurrentIdx].name;
  const bms = getVocabBookmarks(trackName);
  const panel = document.getElementById('vocabBookmarkPanel');
  const list = document.getElementById('vocabBookmarkList');
  panel.style.display = bms.length > 0 ? 'block' : 'none';
  list.innerHTML = bms.map((bm, i) => `
    <div class="vocab-bookmark">
      <button class="vocab-bookmark-jump" onclick="seekToBookmark(${bm.time})" title="Jump to this position">▶</button>
      <input class="vocab-bookmark-time" value="${fmtTime(bm.time)}"
             placeholder="press V"
             title="Edit timestamp (m:ss)"
             onblur="updateVocabTime('${trackName}',${i},this.value,this)"
             onkeydown="if(event.key==='Enter')this.blur()">
      <input class="vocab-bookmark-input" value="${bm.word.replace(/"/g,'&quot;')}"
             placeholder="word or phrase…"
             onchange="updateVocabBookmark('${trackName}',${i},this.value)"
             oninput="updateVocabBookmark('${trackName}',${i},this.value)">
      <div class="vocab-bookmark-actions">
        <button class="vocab-bookmark-jisho" onclick="jishoLookup(document.querySelectorAll('.vocab-bookmark-input')[${i}].value)">Jisho</button>
        <button class="vocab-bookmark-del" onclick="deleteVocabBookmark('${trackName}',${i})">✕</button>
      </div>
    </div>`).join('');
  drawWaveform();
}

function updateVocabBookmark(trackName, idx, value) {
  const bms = getVocabBookmarks(trackName);
  if (bms[idx]) { bms[idx].word = value; saveVocabBookmarks(trackName, bms); }
}

function parseTimeStr(str) {
  // Accepts m:ss, mm:ss, or plain seconds
  str = str.trim();
  if (/^\d+(\.\d+)?$/.test(str)) return parseFloat(str);
  const parts = str.split(':');
  if (parts.length === 2) {
    const m = parseInt(parts[0]) || 0;
    const s = parseFloat(parts[1]) || 0;
    return m * 60 + s;
  }
  return null;
}

function updateVocabTime(trackName, idx, value, inputEl) {
  const secs = parseTimeStr(value);
  const bms = getVocabBookmarks(trackName);
  if (secs !== null && !isNaN(secs) && bms[idx]) {
    bms[idx].time = secs;
    saveVocabBookmarks(trackName, bms);
    inputEl.value = fmtTime(secs); // normalise display
    drawWaveform(); // refresh waveform pin
  } else {
    inputEl.value = fmtTime(bms[idx] ? bms[idx].time : 0); // revert bad input
  }
}

function deleteVocabBookmark(trackName, idx) {
  const bms = getVocabBookmarks(trackName);
  bms.splice(idx, 1);
  saveVocabBookmarks(trackName, bms);
  renderVocabBookmarks();
}

function clearVocabBookmarks() {
  if (listenCurrentIdx < 0) return;
  const trackName = listenTracks[listenCurrentIdx].name;
  saveVocabBookmarks(trackName, []);
  renderVocabBookmarks();
}

function seekToBookmark(time) {
  const audio = document.getElementById('listenAudio');
  audio.currentTime = time;
  drawWaveform();
}

function jishoLookup(word) {
  const q = (word || '').trim();
  if (!q) return;
  window.open('https://jisho.org/search/' + encodeURIComponent(q), '_blank');
}

// ═══════════════════════════════════════════════════════
// SPACED REPETITION MODULE
// SM-2 algorithm with ease factor per track.
// All SRS logic lives here — Storage is the only external dep.
// ═══════════════════════════════════════════════════════

const SRS = {

  // ── SM-2 constants ───────────────────────────────────
  // Base intervals (days) for first rating
  BASE:    { 1: 1, 2: 2, 3: 4, 4: 7 },
  // Ease factor bounds
  EASE_MIN: 1.3,
  EASE_MAX: 3.0,
  EASE_DEFAULT: 2.5,
  // Ease adjustments per rating
  EASE_DELTA: { 1: -0.3, 2: -0.15, 3: 0, 4: +0.15 },
  // Max interval cap (days)
  MAX_INTERVAL: 180,
  // Keep only last N ratings in history
  HISTORY_MAX: 20,

  // ── Data access ──────────────────────────────────────
  _getAll() {
    return (App.Storage || window.Storage).getJSON(STORAGE_KEYS.LISTEN_SRS, {});
  },
  _saveAll(all) {
    (App.Storage || window.Storage).setJSON(STORAGE_KEYS.LISTEN_SRS, all);
  },
  get(trackName) {
    return this._getAll()[trackName] || null;
  },
  save(trackName, data) {
    const all = this._getAll();
    all[trackName] = data;
    this._saveAll(all);
  },

  // ── Scheduling ───────────────────────────────────────
  // Returns next interval in days given current data and rating (1–4)
  nextInterval(data, rating) {
    const ease = data.ease || this.EASE_DEFAULT;
    const prev = data.interval || 0;

    if (prev === 0) {
      // First review — use base intervals
      return this.BASE[rating] || 4;
    }
    if (rating === 1) {
      // Again: drop to 50% of current interval, min 1 day
      return Math.max(1, Math.round(prev * 0.5));
    }
    // Good or Easy: multiply by ease factor with rating bonus
    const multiplier = ease * (rating === 4 ? 1.3 : rating === 3 ? 1.0 : 0.8);
    return Math.min(this.MAX_INTERVAL, Math.max(1, Math.round(prev * multiplier)));
  },

  nextEase(data, rating) {
    const ease = data.ease || this.EASE_DEFAULT;
    const delta = this.EASE_DELTA[rating] || 0;
    return Math.max(this.EASE_MIN, Math.min(this.EASE_MAX, ease + delta));
  },

  // ── Rate current track ───────────────────────────────
  rate(rating) {
    if (typeof listenCurrentIdx === 'undefined' || listenCurrentIdx < 0) return;
    const trackName = listenTracks[listenCurrentIdx].name;
    const existing  = this.get(trackName) || { history: [], interval: 0, ease: this.EASE_DEFAULT };

    existing.history = existing.history || [];
    const now      = new Date();
    const interval = this.nextInterval(existing, rating);
    const ease     = this.nextEase(existing, rating);
    const nextDue  = new Date(now);
    nextDue.setDate(nextDue.getDate() + interval);

    existing.interval = interval;
    existing.ease     = ease;
    existing.nextDue  = nextDue.toISOString();
    existing.history.push({ date: now.toISOString(), rating, interval });
    // Cap history
    if (existing.history.length > this.HISTORY_MAX) {
      existing.history = existing.history.slice(-this.HISTORY_MAX);
    }

    this.save(trackName, existing);

    // Update UI
    const labels = { 1: 'tomorrow', 2: `${interval}d`, 3: `${interval}d`, 4: `${interval}d` };
    const dueEl  = document.getElementById('srsNextDue');
    if (dueEl) dueEl.textContent = '✓ ' + (rating === 1 ? 'See you tomorrow' : `Next in ${interval} day${interval === 1 ? '' : 's'}`);

    // Hide buttons, show result
    document.querySelectorAll('.srs-rate-btn').forEach(b => b.style.opacity = '0.4');

    renderListenPlaylist();
    this._updateBadge();
  },

  // ── Toggle the rate panel ────────────────────────────
  togglePanel() {
    const panel = document.getElementById('srsRatePanel');
    const btn   = document.getElementById('srsToggleBtn');
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    if (isOpen) {
      panel.style.display = 'none';
      if (btn) btn.classList.remove('toggle-on');
    } else {
      this._showPanel();
    }
  },

  _showPanel() {
    const panel = document.getElementById('srsRatePanel');
    const btn   = document.getElementById('srsToggleBtn');
    if (!panel) return;

    // Reset buttons
    document.querySelectorAll('.srs-rate-btn').forEach(b => b.style.opacity = '1');
    const dueEl = document.getElementById('srsNextDue');
    if (dueEl) dueEl.textContent = '';

    // Show predicted intervals
    if (typeof listenCurrentIdx !== 'undefined' && listenCurrentIdx >= 0) {
      const trackName = listenTracks[listenCurrentIdx].name;
      const data = this.get(trackName) || { interval: 0, ease: this.EASE_DEFAULT };
      const labels = ['srsHardDays', 'srsGoodDays', 'srsEasyDays'];
      [2, 3, 4].forEach((r, i) => {
        const el = document.getElementById(labels[i]);
        if (el) {
          const d = this.nextInterval(data, r);
          el.textContent = d === 1 ? 'tomorrow' : `${d} days`;
        }
      });
      // Show due count
      const dueCount = document.getElementById('srsDueCount');
      if (dueCount) {
        const n = this._countDue();
        dueCount.textContent = n > 0 ? `${n} track${n > 1 ? 's' : ''} due` : '';
      }
    }

    panel.style.display = 'block';
    if (btn) btn.classList.add('toggle-on');
  },

  // ── Toggle the progress table ────────────────────────
  toggleProgress() {
    const panel = document.getElementById('listenProgressPanel');
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    if (isOpen) {
      panel.style.display = 'none';
    } else {
      panel.style.display = 'block';
      this.renderProgress();
    }
  },

  // ── Progress table ───────────────────────────────────
  renderProgress() {
    const el = document.getElementById('listenProgressPanel');
    if (!el) return;
    const all    = this._getAll();
    const tracks = typeof listenTracks !== 'undefined' ? listenTracks : [];
    if (!tracks.length) {
      el.innerHTML = '<div style="color:var(--ink-light);font-size:0.82rem;padding:8px 0">Load audio tracks to see progress.</div>';
      return;
    }
    const now  = new Date();
    const ratingLabels = ['', 'Again', 'Hard', 'Good', 'Easy'];
    const ratingColors = ['', 'var(--red)', 'var(--gold)', 'var(--teal)', '#7c9'];

    // Sort: due first, then by next due date
    const sorted = [...tracks].sort((a, b) => {
      const da = all[a.name], db = all[b.name];
      const dueA = da?.nextDue ? new Date(da.nextDue) : null;
      const dueB = db?.nextDue ? new Date(db.nextDue) : null;
      const overdueA = dueA && dueA <= now;
      const overdueB = dueB && dueB <= now;
      if (overdueA && !overdueB) return -1;
      if (!overdueA && overdueB) return 1;
      if (dueA && dueB) return dueA - dueB;
      if (dueA) return -1;
      if (dueB) return 1;
      return 0;
    });

    const rows = sorted.map(t => {
      const d         = all[t.name];
      const sessions  = d?.history?.length || 0;
      const last      = d?.history?.length ? d.history[d.history.length - 1] : null;
      const lastR     = last?.rating || null;
      const due       = d?.nextDue ? new Date(d.nextDue) : null;
      const overdue   = due && due <= now;
      const dueStr    = !due ? '—'
                      : overdue ? '<span style="color:var(--gold)">Due now ↻</span>'
                      : due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const ease      = d?.ease ? d.ease.toFixed(1) : '—';
      const rColor    = lastR ? ratingColors[lastR] : 'var(--ink-light)';
      const rLabel    = lastR ? ratingLabels[lastR]  : '—';
      return `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:7px 10px 7px 0"><div style="font-family:var(--jp);font-size:0.85rem;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.name}</div></td>
        <td style="padding:7px 8px;font-size:0.78rem;color:var(--ink-light);text-align:center">${sessions}</td>
        <td style="padding:7px 8px;font-size:0.78rem;color:${rColor};text-align:center">${rLabel}</td>
        <td style="padding:7px 8px;font-size:0.78rem;color:var(--ink-light);text-align:center">${ease}</td>
        <td style="padding:7px 0 7px 8px;font-size:0.78rem;text-align:right">${dueStr}</td>
      </tr>`;
    }).join('');

    const total  = tracks.length;
    const heard  = tracks.filter(t => all[t.name]?.history?.length).length;
    const due    = this._countDue();

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <span style="font-size:0.78rem;color:var(--ink-light)">${heard}/${total} rated${due > 0 ? ` · <span style="color:var(--gold)">${due} due</span>` : ''}</span>
        <button class="btn-icon" onclick="SRS.toggleProgress()">Close ✕</button>
      </div>
      <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;table-layout:fixed">
        <colgroup>
          <col style="width:42%"><col style="width:11%"><col style="width:15%"><col style="width:10%"><col style="width:22%">
        </colgroup>
        <thead><tr style="border-bottom:1px solid var(--border)">
          <th style="padding:0 10px 8px 0;font-size:0.7rem;color:var(--ink-light);text-align:left;font-weight:500">Track</th>
          <th style="padding:0 8px 8px;font-size:0.7rem;color:var(--ink-light);text-align:center;font-weight:500">Sessions</th>
          <th style="padding:0 8px 8px;font-size:0.7rem;color:var(--ink-light);text-align:center;font-weight:500">Last</th>
          <th style="padding:0 8px 8px;font-size:0.7rem;color:var(--ink-light);text-align:center;font-weight:500">Ease</th>
          <th style="padding:0 0 8px 8px;font-size:0.7rem;color:var(--ink-light);text-align:right;font-weight:500">Due</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      </div>`;
  },

  // ── Due badge on toolbar button ──────────────────────
  _countDue() {
    const all   = this._getAll();
    const now   = new Date();
    const tracks = typeof listenTracks !== 'undefined' ? listenTracks : [];
    return tracks.filter(t => {
      const d = all[t.name];
      return d?.nextDue && new Date(d.nextDue) <= now;
    }).length;
  },

  _updateBadge() {
    const badge = document.getElementById('srsDueBadge');
    if (!badge) return;
    const n = this._countDue();
    if (n > 0) {
      badge.textContent = n;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  },

  // Reset panel when new track loads
  resetPanel() {
    const panel = document.getElementById('srsRatePanel');
    const btn   = document.getElementById('srsToggleBtn');
    if (panel) panel.style.display = 'none';
    if (btn) btn.classList.remove('toggle-on');
    this._updateBadge();
  },
};


// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, {
    ListenState,
    readId3Title,
    tryShiftJIS,
    tryDecodeFilename,
    handleListenDrop,
    showListenLayout,
    renderListenPlaylist,
    loadAndPlayTrack,
    removeListenTrack,
    toggleSelectAll,
    updateSelectAll,
    toggleListenPlay,
    dropVocabBookmark,
  });
} catch(e) { console.error('[core-listen] App registry failed:', e); }
