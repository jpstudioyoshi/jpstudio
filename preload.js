const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  openLessonOverlay: () => ipcRenderer.invoke('overlay:open'),
  ipcSend: (channel, data) => ipcRenderer.send(channel, data),
});

// ── Audio API exposed to renderer ────────────────────────────────────────────
contextBridge.exposeInMainWorld('audioAPI', {
  // Get real filesystem path for a File object (Electron 32+)
  getPath: (file) => {
    try { return webUtils.getPathForFile(file); } catch(e) { return ''; }
  },
  // Decode audio file to waveform buckets via ffmpeg in main process
  waveform: (filePath, buckets) => ipcRenderer.invoke('audio:waveform', filePath, buckets),
});

// ── Database API exposed to renderer ─────────────────────────────────────────
contextBridge.exposeInMainWorld('db', {
  // Returns array of rows
  query: (sql, params) => ipcRenderer.invoke('db:query', sql, params),
  // Returns single row or undefined
  get:   (sql, params) => ipcRenderer.invoke('db:get',   sql, params),
  // Returns { lastInsertRowid, changes } or { error }
  run:   (sql, params) => ipcRenderer.invoke('db:run',   sql, params),
  // Returns true if database is available
  isAvailable: () => ipcRenderer.invoke('db:isAvailable'),
});

// ── Pitch accent API ────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('pitchAPI', {
  import: () => ipcRenderer.invoke('pitch:import'),
  lookup: (kanji, reading) => ipcRenderer.invoke('pitch:lookup', kanji, reading),
});

// ── Lesson recording API ─────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('lessonAPI', {
  startRecording:    ()                       => ipcRenderer.invoke('lesson:startRecording'),
  saveAudioChunk:    (audioPath, buffer)       => ipcRenderer.invoke('lesson:saveAudioChunk', audioPath, buffer),
  finaliseRecording: (sessionId, audioPath)    => ipcRenderer.invoke('lesson:finaliseRecording', sessionId, audioPath),
  chunkAudio:        (audioPath, chunkMb)      => ipcRenderer.invoke('lesson:chunkAudio', audioPath, chunkMb),
  diarize:           (audioPath, hfToken)      => ipcRenderer.invoke('lesson:diarize', audioPath, hfToken),
  saveTranscript:    (sessionId, transcript)   => ipcRenderer.invoke('lesson:saveTranscript', sessionId, transcript),
  saveNotes:         (sessionId, notesText)    => ipcRenderer.invoke('lesson:saveNotes', sessionId, notesText),
  get:               (sessionId)               => ipcRenderer.invoke('lesson:get', sessionId),
  list:              ()                        => ipcRenderer.invoke('lesson:list'),
  deleteFile:        (filePath)               => ipcRenderer.invoke('lesson:deleteFile', filePath),
  deleteSession:     (sessionId)              => ipcRenderer.invoke('lesson:deleteSession', sessionId),
  getFileSizes:      (paths)                  => ipcRenderer.invoke('lesson:getFileSizes', paths),
});

// ── Key-value store API ──────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('kvAPI', {
  get:    (key)        => ipcRenderer.invoke('kv:get',    key),
  set:    (key, value) => ipcRenderer.invoke('kv:set',    key, value),
  delete: (key)        => ipcRenderer.invoke('kv:delete', key),
  list:   (prefix)     => ipcRenderer.invoke('kv:list',   prefix),
});

console.log('Japanese Studio running in Electron — database bridge ready');

// ── Management / Dev window API ──────────────────────────────────────────────
contextBridge.exposeInMainWorld('mgmt', {
  openWindow:      () => ipcRenderer.invoke('mgmt:openWindow'),
  reloadMain:      () => ipcRenderer.invoke('mgmt:reloadMain'),
  runCheckSyntax:  () => ipcRenderer.invoke('mgmt:runCheckSyntax'),
  checkSyntax: (content) => ipcRenderer.invoke('mgmt:checkSyntax', content),
});

// ── File access API (restricted to project directory) ────────────────────────
contextBridge.exposeInMainWorld('files', {
  list:  ()                => ipcRenderer.invoke('files:list'),
  read:  (path)            => ipcRenderer.invoke('files:read',  path),
  write: (path, content)   => ipcRenderer.invoke('files:write', path, content),
});

// ── Print API ─────────────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('printAPI', {
  toPDF: (options) => ipcRenderer.invoke('print:toPDF', options),
  htmlToPDF: (html) => ipcRenderer.invoke('print:htmlToPDF', html),
  htmlToPDF: (html) => ipcRenderer.invoke('print:htmlToPDF', html),
  htmlToPDF: (html) => ipcRenderer.invoke('print:htmlToPDF', html),
});
