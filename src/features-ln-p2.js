function lnDeleteSentence(idx) {
  if (!LessonNotesState.currentStory) return;
  
  const storyIdx = LessonNotesState.stories.findIndex(s => s.title === LessonNotesState.currentStory.title && s.text === LessonNotesState.currentStory.text);
  if (storyIdx < 0) return;
  
  if (LessonNotesState.stories[storyIdx].sentenceRecordings) {
    LessonNotesState.stories[storyIdx].sentenceRecordings[idx] = null;
    LessonNotesState.currentStory.sentenceRecordings = LessonNotesState.stories[storyIdx].sentenceRecordings;
    
    if (LessonNotesState.currentIdx !== null) {
      const sessions = lessonNotesGetSessions();
      if (sessions[LessonNotesState.currentIdx]) {
        sessions[LessonNotesState.currentIdx].stories = LessonNotesState.stories;
        lessonNotesSaveSessions(sessions);
      }
    }
  }
  
  lessonNotesRender();
  setTimeout(lnParseSentenceFurigana, 50);
}

async function lnPlayAllSentences() {
  const recordings = LessonNotesState.currentStory?.sentenceRecordings;
  if (!recordings) return;
  
  const audio = document.getElementById('lnAudioPlayer');
  if (!audio) return;
  
  // Get indices of recordings that exist
  const validIndices = recordings.map((r, i) => r ? i : -1).filter(i => i >= 0);
  let playIdx = 0;
  
  const playNext = () => {
    if (playIdx < validIndices.length) {
      const sentenceIdx = validIndices[playIdx];
      LessonNotesState.lnCurrentSentence = sentenceIdx;
      lessonNotesRender();
      audio.src = recordings[sentenceIdx];
      audio.play();
      playIdx++;
    }
  };
  
  audio.onended = playNext;
  playNext();
}

async function lnCombineAndSave() {
  const recordings = LessonNotesState.currentStory?.sentenceRecordings;
  // Filter to only existing recordings
  const validRecordings = recordings ? recordings.filter(r => r) : [];
  if (validRecordings.length === 0) return;
  
  const btn = event?.target;
  const originalText = btn?.textContent;
  if (btn) { btn.textContent = '⏳ Processing...'; btn.disabled = true; }
  
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Decode all recordings to AudioBuffers
    const audioBuffers = await Promise.all(validRecordings.map(async (r) => {
      const response = await fetch(r);
      const arrayBuffer = await response.arrayBuffer();
      return audioCtx.decodeAudioData(arrayBuffer);
    }));
    
    // Trim silence from each buffer and calculate total length
    const trimmedBuffers = audioBuffers.map(buf => trimSilence(buf, audioCtx));
    const totalLength = trimmedBuffers.reduce((sum, buf) => sum + buf.length, 0);
    
    // Create combined buffer
    const sampleRate = audioBuffers[0].sampleRate;
    const numChannels = audioBuffers[0].numberOfChannels;
    const combined = audioCtx.createBuffer(numChannels, totalLength, sampleRate);
    
    // Copy trimmed audio into combined buffer
    let offset = 0;
    for (const buf of trimmedBuffers) {
      for (let ch = 0; ch < numChannels; ch++) {
        combined.getChannelData(ch).set(buf.getChannelData(ch), offset);
      }
      offset += buf.length;
    }
    
    // Encode to WAV (webm encoding in browser is tricky)
    const wavBlob = audioBufferToWav(combined);
    
    // Convert to base64
    const reader = new FileReader();
    reader.onloadend = () => {
      lessonNotesSaveRecording(reader.result);
      if (btn) { btn.textContent = originalText || '💾 Combine'; btn.disabled = false; }
      alert(`Combined ${validRecordings.length} recordings and saved!`);
      lessonNotesRender();
    };
    reader.readAsDataURL(wavBlob);
    
    audioCtx.close();
  } catch (e) {
    console.error('Error combining recordings:', e);
    if (btn) { btn.textContent = originalText || '💾 Combine'; btn.disabled = false; }
    alert('Error combining recordings: ' + e.message);
  }
}

// (trimSilence and audioBufferToWav live in features-core.js)


async function lnCombineAndDownload() {
  const recordings = LessonNotesState.currentStory?.sentenceRecordings;
  // Filter to only existing recordings
  const validRecordings = recordings ? recordings.filter(r => r) : [];
  if (validRecordings.length === 0) return;
  
  const btn = event?.target;
  const originalText = btn?.textContent;
  if (btn) { btn.textContent = '⏳ Processing...'; btn.disabled = true; }
  
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Decode all recordings to AudioBuffers
    const audioBuffers = await Promise.all(validRecordings.map(async (r) => {
      const response = await fetch(r);
      const arrayBuffer = await response.arrayBuffer();
      return audioCtx.decodeAudioData(arrayBuffer);
    }));
    
    // Trim silence from each buffer and calculate total length
    const trimmedBuffers = audioBuffers.map(buf => trimSilence(buf, audioCtx));
    const totalLength = trimmedBuffers.reduce((sum, buf) => sum + buf.length, 0);
    
    // Create combined buffer
    const sampleRate = audioBuffers[0].sampleRate;
    const numChannels = audioBuffers[0].numberOfChannels;
    const combined = audioCtx.createBuffer(numChannels, totalLength, sampleRate);
    
    // Copy trimmed audio into combined buffer
    let offset = 0;
    for (const buf of trimmedBuffers) {
      for (let ch = 0; ch < numChannels; ch++) {
        combined.getChannelData(ch).set(buf.getChannelData(ch), offset);
      }
      offset += buf.length;
    }
    
    // Encode to WAV and download
    const wavBlob = audioBufferToWav(combined);
    
    // Create filename from story title
    const title = LessonNotesState.currentStory?.title || 'recording';
    const safeName = title.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_').slice(0, 50);
    const filename = `${safeName}_${new Date().toISOString().slice(0,10)}.wav`;
    
    // Try to use Save As dialog (File System Access API)
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: 'WAV Audio',
            accept: { 'audio/wav': ['.wav'] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(wavBlob);
        await writable.close();
        if (btn) { btn.textContent = originalText || '⬇ Download'; btn.disabled = false; }
        audioCtx.close();
        return;
      } catch (e) {
        // User cancelled or API not supported, fall through to regular download
        if (e.name === 'AbortError') {
          if (btn) { btn.textContent = originalText || '⬇ Download'; btn.disabled = false; }
          audioCtx.close();
          return;
        }
      }
    }
    
    // Fallback: regular download
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    if (btn) { btn.textContent = originalText || '⬇ Download'; btn.disabled = false; }
    audioCtx.close();
  } catch (e) {
    console.error('Error combining recordings:', e);
    if (btn) { btn.textContent = originalText || '⬇ Download'; btn.disabled = false; }
    alert('Error combining recordings: ' + e.message);
  }
}

async function lessonNotesToggleRecording() {
  if (LessonNotesState.lnIsRecording) {
    // Stop recording
    if (LessonNotesState.lnMediaRecorder && LessonNotesState.lnMediaRecorder.state !== 'inactive') {
      LessonNotesState.lnMediaRecorder.stop();
    }
  } else {
    // Start recording
    try {
      LessonNotesState.lnAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      LessonNotesState.lnMediaRecorder = new MediaRecorder(LessonNotesState.lnAudioStream);
      LessonNotesState.lnAudioChunks = [];
      
      LessonNotesState.lnMediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          LessonNotesState.lnAudioChunks.push(e.data);
        }
      };
      
      LessonNotesState.lnMediaRecorder.onstop = async () => {
        // Convert to base64 and save
        const blob = new Blob(LessonNotesState.lnAudioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result;
          lessonNotesSaveRecording(base64);
        };
        reader.readAsDataURL(blob);
        
        // Stop all tracks
        LessonNotesState.lnAudioStream.getTracks().forEach(track => track.stop());
        
        LessonNotesState.lnIsRecording = false;
        lessonNotesRender();
      };
      
      LessonNotesState.lnMediaRecorder.start();
      LessonNotesState.lnIsRecording = true;
      lessonNotesRender();
    } catch (e) {
      console.error('Recording error:', e);
      alert('Could not access microphone. Please allow microphone access.');
    }
  }
}

function lessonNotesSaveRecording(base64Audio) {
  if (!LessonNotesState.currentStory) return;
  
  // Find the story index
  const storyIdx = LessonNotesState.stories.findIndex(s => s.title === LessonNotesState.currentStory.title && s.text === LessonNotesState.currentStory.text);
  if (storyIdx < 0) return;
  
  // Save to story object
  LessonNotesState.stories[storyIdx].recording = base64Audio;
  LessonNotesState.currentStory.recording = base64Audio;
  
  // Save to session in localStorage
  if (LessonNotesState.currentIdx !== null) {
    const sessions = lessonNotesGetSessions();
    if (sessions[LessonNotesState.currentIdx]) {
      sessions[LessonNotesState.currentIdx].stories = LessonNotesState.stories;
      lessonNotesSaveSessions(sessions);
    }
  }
  
  lessonNotesRender();
}

function lessonNotesPlayRecording() {
  if (!LessonNotesState.currentStory?.recording) return;
  
  const audio = document.getElementById('lnAudioPlayer');
  if (audio) {
    audio.src = LessonNotesState.currentStory.recording;
    audio.play();
  }
}

function lessonNotesDeleteRecording() {
  if (!LessonNotesState.currentStory) return;
  if (!confirm('Delete this recording?')) return;
  
  // Find the story index
  const storyIdx = LessonNotesState.stories.findIndex(s => s.title === LessonNotesState.currentStory.title && s.text === LessonNotesState.currentStory.text);
  if (storyIdx < 0) return;
  
  // Remove recording
  delete LessonNotesState.stories[storyIdx].recording;
  delete LessonNotesState.currentStory.recording;
  
  // Save to session
  if (LessonNotesState.currentIdx !== null) {
    const sessions = lessonNotesGetSessions();
    if (sessions[LessonNotesState.currentIdx]) {
      sessions[LessonNotesState.currentIdx].stories = LessonNotesState.stories;
      lessonNotesSaveSessions(sessions);
    }
  }
  
  lessonNotesRender();
}

function lessonNotesCopyStory() {
  if (!LessonNotesState.currentStory) return;
  const text = LessonNotesState.currentStory.text;
  navigator.clipboard.writeText(text).then(() => {
    // Brief visual feedback
    const btn = document.querySelector('button[onclick="lessonNotesCopyStory()"]');
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = '✓ Copied';
      btn.style.color = 'var(--teal)';
      setTimeout(() => {
        btn.innerHTML = orig;
        btn.style.color = '';
      }, 1500);
    }
  });
}

function lessonNotesToggleFuri() {
  LessonNotesState.lnFuriOn = !LessonNotesState.lnFuriOn;
  // Update button state
  const btn = document.querySelector('#lessonNotesViewMain .qr-btn-sec');
  if (btn) btn.classList.toggle('active', LessonNotesState.lnFuriOn);
  lessonNotesRenderStoryText();
}

// LessonNotesState.lnIsSpeaking — see declaration above

function lessonNotesToggleSpeak() {
  const btn = document.getElementById('lnSpeakBtn');
  
  if (LessonNotesState.lnIsSpeaking || (window.speechSynthesis && speechSynthesis.speaking)) {
    // Stop speaking
    speechSynthesis.cancel();
    LessonNotesState.lnIsSpeaking = false;
    if (btn) {
      btn.innerHTML = '🔊 Read';
      btn.classList.remove('btn-active-red');
    }
  } else {
    // Start speaking
    if (LessonNotesState.currentStory) {
      LessonNotesState.lnIsSpeaking = true;
      if (btn) {
        btn.innerHTML = '⏹ Stop';
        btn.classList.add('btn-active-red');
      }

      const text = LessonNotesState.currentStory.text;
      const _lnDone = () => {
        LessonNotesState.lnIsSpeaking = false;
        if (btn) { btn.innerHTML = '🔊 Read'; btn.classList.remove('btn-active-red'); }
      };
      TTS.speak(text, 0.85, { onend: _lnDone, onerror: _lnDone });
    }
  }
}

// Keep old function for compatibility
function lessonNotesRenderDrillCard() {
  if (LessonNotesState.vocab.length === 0) return '<div style="text-align:center;color:var(--ink-light);font-family:var(--ui)">No vocab extracted yet</div>';
  
  const v = LessonNotesState.vocab[LessonNotesState.drillIdx];
  const progress = `${LessonNotesState.drillIdx + 1} / ${LessonNotesState.vocab.length}`;
  const meaning = v.meaning || v.en || '';
  const reading = v.reading || '';
  const word = v.word || '';
  
  let prompt = '', hints = '';
  
  // Build the answer display based on reveal state
  // For en2jp: show English, reveal Japanese word then reading
  // For jp modes: show Japanese, reveal reading then meaning
  let answerLine1 = '', answerLine2 = '';
  
  if (LessonNotesState.drillMode === 'en2jp') {
    // EN → JP mode: show meaning, reveal word then reading
    prompt = meaning || '(no meaning)';
    answerLine1 = word || '(no word)';
    answerLine2 = reading || '';
    
    // Show hints if enabled
    if (LessonNotesState.showReading && reading && LessonNotesState.drillRevealed < 1) {
      hints = `<div style="font-family:var(--jp);font-size:0.9rem;color:var(--ink-light);margin-top:4px">${reading}</div>`;
    }
  } else if (LessonNotesState.drillMode === 'jp2reading' || LessonNotesState.drillMode === 'jp2en') {
    prompt = word;
    answerLine1 = reading || '(no reading)';
    answerLine2 = meaning || '(no meaning)';
    
    // Show hints if enabled
    if (LessonNotesState.showMeaning && meaning && LessonNotesState.drillRevealed < 2) {
      hints = `<div style="font-family:var(--ui);font-size:0.85rem;color:var(--ink-light);margin-top:4px">${meaning}</div>`;
    }
    if (LessonNotesState.showReading && reading && LessonNotesState.drillRevealed < 1) {
      hints = `<div style="font-family:var(--jp);font-size:0.9rem;color:var(--ink-light);margin-top:4px">${reading}</div>`;
    }
  } else if (LessonNotesState.drillMode === 'listening') {
    const safeWord = word.replace(/'/g, "\\'");
    prompt = `🔊 <button class="btn-action" onclick="jpSpeak('${safeWord}')">Play</button>`;
    answerLine1 = reading || '(no reading)';
    answerLine2 = meaning || '(no meaning)';
  }
  
  const hiddenCount = LessonNotesState.hiddenWords.size;

  // For en2jp mode, first line is the Japanese word (in serif), second is reading
  const line1Style = LessonNotesState.drillMode === 'en2jp'
    ? "font-family:'Shippori Mincho',serif;font-size:2.8rem;color:var(--teal)"
    : "font-family:var(--jp);font-size:1.8rem;color:var(--teal)";
  const line2Style = LessonNotesState.drillMode === 'en2jp'
    ? "font-family:var(--jp);font-size:1.4rem;color:var(--ink-light);margin-top:10px"
    : "font-family:var(--ui);font-size:1.2rem;color:var(--ink-light);margin-top:10px";

  // For en2jp, prompt is English so use UI font
  const promptStyle = LessonNotesState.drillMode === 'en2jp'
    ? "font-family:var(--ui);font-size:2rem;color:var(--ink);margin-bottom:6px"
    : "font-family:'Shippori Mincho',serif;font-size:3.2rem;color:var(--ink);margin-bottom:6px";

  return `
    <div style="text-align:center;width:100%">
      <div style="${promptStyle}">${prompt}</div>
      ${hints}
      <div id="lessonNotesDrillAnswer" style="min-height:100px;margin:24px 0">
        <div style="${line1Style};${LessonNotesState.drillRevealed >= 1 ? '' : 'visibility:hidden'}">${answerLine1}</div>
        <div style="${line2Style};${LessonNotesState.drillRevealed >= 2 ? '' : 'visibility:hidden'}">${answerLine2}</div>
      </div>
    </div>
  `;
}

// LessonNotesState.hiddenWords — see declaration above

const LEARNED_WORDS_KEY = 'lessonNotesLearnedWords';

function lessonNotesGetLearnedWords() {
  try {
    return new Set(JSON.parse(localStorage.getItem(LEARNED_WORDS_KEY) || '[]'));
  } catch { return new Set(); }
}

function lessonNotesSaveLearnedWords() {
  localStorage.setItem(LEARNED_WORDS_KEY, JSON.stringify([...LessonNotesState.permanentlyLearned]));
}

// LessonNotesState.permanentlyLearned — loaded in init

function lessonNotesSaveHiddenPermanently() {
  // Add all currently hidden words to permanent storage
  LessonNotesState.hiddenWords.forEach(word => LessonNotesState.permanentlyLearned.add(word));
  lessonNotesSaveLearnedWords();
  LessonNotesState.hiddenWords.clear();
  lessonNotesRender();
}

function lessonNotesShowMastered() {
  const area = document.getElementById('lessonNotesBreakdownArea');
  if (!area) return;
  
  const words = [...LessonNotesState.permanentlyLearned];
  area.style.display = 'block';
  area.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span style="font-family:var(--ui);font-size:0.72rem;letter-spacing:0.05em;color:var(--ink-light)">MASTERED WORDS (${words.length})</span>
      <button class="btn-icon" onclick="document.getElementById('lessonNotesBreakdownArea').style.display='none'">✕</button>
    </div>
    <div style="font-family:var(--jp);font-size:0.95rem;line-height:2;color:var(--ink);max-height:200px;overflow-y:auto">
      ${words.length > 0 ? words.map(w => `<span style="display:inline-block;background:var(--paper);border:1px solid var(--border);border-radius:4px;padding:2px 8px;margin:2px">${w}</span>`).join('') : '<span style="color:var(--ink-light)">No mastered words yet</span>'}
    </div>
  `;
}

function lessonNotesClearMastered() {
  if (!confirm('Clear all mastered words? They will appear in drills again.')) return;
  LessonNotesState.permanentlyLearned.clear();
  lessonNotesSaveLearnedWords();
  lessonNotesRender();
}

function lessonNotesBreakdownCurrent() {
  if (LessonNotesState.vocab.length === 0) return;
  const v = LessonNotesState.vocab[LessonNotesState.drillIdx];
  if (v && v.word) lessonNotesBreakdown(v.word);
}

function lessonNotesExamplesCurrent() {
  if (LessonNotesState.vocab.length === 0) return;
  const v = LessonNotesState.vocab[LessonNotesState.drillIdx];
  if (v && v.word) lessonNotesExamples(v.word);
}

// Breakdown cache - separate from translations since it has different content
const BREAKDOWN_CACHE_KEY = 'jpBreakdownCache';
// LessonNotesState.breakdownCache — see declaration above
try { LessonNotesState.breakdownCache = Storage.getJSON(BREAKDOWN_CACHE_KEY, {}); } catch(e) {}

function breakdownCacheSave() {
  const keys = Object.keys(LessonNotesState.breakdownCache);
  if (keys.length > 200) {
    const toRemove = keys.slice(0, keys.length - 200);
    toRemove.forEach(k => delete LessonNotesState.breakdownCache[k]);
  }
  Storage.setJSON(BREAKDOWN_CACHE_KEY, LessonNotesState.breakdownCache);
}

async function lessonNotesBreakdown(word) {
  const area = document.getElementById('lessonNotesBreakdownArea');
  if (!area) return;
  
  area.style.display = 'block';
  
  // Check cache first
  if (LessonNotesState.breakdownCache[word]) {
    area.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-family:var(--ui);font-size:0.72rem;letter-spacing:0.05em;color:var(--ink-light)">BREAKDOWN <span style="font-size:0.65rem">📋</span></span>
        <button class="btn-icon" onclick="document.getElementById('lessonNotesBreakdownArea').style.display='none'">✕</button>
      </div>
      <div style="font-family:var(--jp);font-size:0.9rem;line-height:1.8;color:var(--ink);white-space:pre-wrap">${LessonNotesState.breakdownCache[word]}</div>
    `;
    return;
  }
  
  area.innerHTML = `<div style="text-align:center;color:var(--ink-light);font-family:var(--ui);font-size:0.85rem">Breaking down "${word}"...</div>`;
  
  const apiKey = _fy_getApiKey();
  if (!apiKey) {
    area.innerHTML = `<div style="color:var(--ink-light);font-family:var(--ui)">Set API key in settings first</div>`;
    return;
  }
  
  try {
    const data = await _fy_claudeAPI({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [{ role: 'user', content: `Break down this Japanese word into its components: ${word}

For each kanji/component, give:
- The character
- Its reading (in this word)
- Its individual meaning

Then briefly explain how the parts combine to form the word's meaning.

Keep it concise and formatted clearly.` }]
    ,
      track: 'lesson'
    });
    
    const text = data.content?.[0]?.text || 'Could not break down';
    
    // Save to cache
    LessonNotesState.breakdownCache[word] = text;
    breakdownCacheSave();
    
    area.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-family:var(--ui);font-size:0.72rem;letter-spacing:0.05em;color:var(--ink-light)">BREAKDOWN</span>
        <button class="btn-icon" onclick="document.getElementById('lessonNotesBreakdownArea').style.display='none'">✕</button>
      </div>
      <div style="font-family:var(--jp);font-size:0.9rem;line-height:1.8;color:var(--ink);white-space:pre-wrap">${text}</div>
    `;
  } catch (e) {
    area.innerHTML = `<div style="color:var(--red);font-family:var(--ui)">Error: ${e.message}</div>`;
  }
}

async function lessonNotesExamples(word) {
  const area = document.getElementById('lessonNotesBreakdownArea');
  if (!area) return;
  
  area.style.display = 'block';
  area.innerHTML = `<div style="text-align:center;color:var(--ink-light);font-family:var(--ui);font-size:0.85rem">Finding examples for "${word}"...</div>`;
  
  const apiKey = _fy_getApiKey();
  if (!apiKey) {
    area.innerHTML = `<div style="color:var(--ink-light);font-family:var(--ui)">Set API key in settings first</div>`;
    return;
  }
  
  try {
    const data = await _fy_claudeAPI({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        messages: [{ role: 'user', content: `Give 4 example sentences using the Japanese word: ${word}

For each sentence:
1. Japanese sentence
2. Reading in hiragana (for kanji words)
3. English translation

Make sentences progressively more complex. Keep formatting clean and consistent.` }]
    ,
      track: 'lesson'
    });
    
    const text = data.content?.[0]?.text || 'Could not find examples';
    
    area.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-family:var(--ui);font-size:0.72rem;letter-spacing:0.05em;color:var(--ink-light)">EXAMPLES</span>
        <button class="btn-icon" onclick="document.getElementById('lessonNotesBreakdownArea').style.display='none'">✕</button>
      </div>
      <div style="font-family:var(--jp);font-size:0.9rem;line-height:1.8;color:var(--ink);white-space:pre-wrap">${text}</div>
    `;
  } catch (e) {
    area.innerHTML = `<div style="color:var(--red);font-family:var(--ui)">Error: ${e.message}</div>`;
  }
}

function lessonNotesHideCard() {
  if (LessonNotesState.vocab.length === 0) return;
  
  const v = LessonNotesState.vocab[LessonNotesState.drillIdx];
  if (v && v.word) {
    LessonNotesState.hiddenWords.add(v.word);
  }
  
  // Remove from current vocab array
  LessonNotesState.vocab.splice(LessonNotesState.drillIdx, 1);
  
  // Also remove from original if it exists there
  const origIdx = LessonNotesState.vocabOriginal.findIndex(w => w.word === v.word);
  if (origIdx >= 0) {
    LessonNotesState.vocabOriginal.splice(origIdx, 1);
  }
  
  // Adjust index if needed
  if (LessonNotesState.drillIdx >= LessonNotesState.vocab.length) {
    LessonNotesState.drillIdx = Math.max(0, LessonNotesState.vocab.length - 1);
  }
  LessonNotesState.drillRevealed = 0;
  lessonNotesRender();
}

function lessonNotesRestoreHidden() {
  // Restore all hidden words from the session (but not permanently learned)
  const sessions = lessonNotesGetSessions();
  if (LessonNotesState.currentIdx !== null && sessions[LessonNotesState.currentIdx]) {
    const allVocab = sessions[LessonNotesState.currentIdx].vocab || [];
    // Filter out permanently learned words
    LessonNotesState.vocab = allVocab.filter(v => !LessonNotesState.permanentlyLearned.has(v.word));
    LessonNotesState.vocabOriginal = [...LessonNotesState.vocab];
    LessonNotesState.hiddenWords.clear();
    LessonNotesState.shuffled = false;
    LessonNotesState.drillIdx = 0;
    LessonNotesState.drillRevealed = 0;
    lessonNotesRender();
  }
}

function lessonNotesToggleTable() {
  LessonNotesState.tableHidden = !LessonNotesState.tableHidden;
  lessonNotesRender();
}

function lessonNotesToggleShowReading() {
  LessonNotesState.showReading = !LessonNotesState.showReading;
  lessonNotesRender();
}

function lessonNotesToggleShowMeaning() {
  LessonNotesState.showMeaning = !LessonNotesState.showMeaning;
  lessonNotesRender();
}

function lessonNotesToggleShuffle() {
  if (LessonNotesState.shuffled) {
    // Restore original order
    LessonNotesState.vocab = [...LessonNotesState.vocabOriginal];
    LessonNotesState.shuffled = false;
  } else {
    // Save original and shuffle
    LessonNotesState.vocabOriginal = [...LessonNotesState.vocab];
    for (let i = LessonNotesState.vocab.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [LessonNotesState.vocab[i], LessonNotesState.vocab[j]] = [LessonNotesState.vocab[j], LessonNotesState.vocab[i]];
    }
    LessonNotesState.shuffled = true;
  }
  LessonNotesState.drillIdx = 0;
  LessonNotesState.drillRevealed = 0;
  lessonNotesRender();
}

// LessonNotesState.rawText/docImages — see declaration above

// LessonNotesState.loadingSession — see declaration above

function lessonNotesLoadSession(idx) {
  // Guard against reload loops
  if (LessonNotesState.loadingSession) return;
  if (idx === LessonNotesState.currentIdx) return; // Already on this session
  
  LessonNotesState.loadingSession = true;
  
  if (idx < 0) {
    LessonNotesState.currentIdx = null;
    LessonNotesState.vocab = [];
    LessonNotesState.vocabOriginal = [];
    LessonNotesState.stories = [];
    LessonNotesState.keyPhrases = [];
    LessonNotesState.grammar = [];
    LessonNotesState.errors = [];
    LessonNotesState.rawText = '';
    LessonNotesState.docImages = [];
    LessonNotesState.docContent = [];
  } else {
    const sessions = lessonNotesGetSessions();
    if (sessions[idx]) {
      LessonNotesState.currentIdx = idx;
      try { localStorage.setItem('lnLastSessionId', String(sessions[idx].id)); } catch(e) {}
      // Filter out permanently learned words
      const allVocab = sessions[idx].vocab || [];
      LessonNotesState.vocab = allVocab.filter(v => !LessonNotesState.permanentlyLearned.has(v.word));
      LessonNotesState.vocabOriginal = [...LessonNotesState.vocab];
      LessonNotesState.stories = sessions[idx].stories || [];
      LessonNotesState.keyPhrases = sessions[idx].keyPhrases || [];
      LessonNotesState.grammar = sessions[idx].grammar || [];
      LessonNotesState.errors = sessions[idx].errors || [];
      LessonNotesState.rawText = sessions[idx].rawText || '';
      LessonNotesState.docImages = sessions[idx].images || [];
      LessonNotesState.docContent = sessions[idx].docContent || [];

      // Look up lesson_sessions SQL row by date to set currentLessonId
      LessonNotesState.currentLessonId = null;
      const _lnDate = sessions[idx].date ? sessions[idx].date.slice(0,10) : null;
      if (_lnDate && window.db) {
        (async () => {
          try {
            const _lnRows = await window.db.query('SELECT id FROM lesson_sessions WHERE date = ? LIMIT 1', [_lnDate]);
            const _lnId = _lnRows?.[0]?.id || null;
            LessonNotesState.currentLessonId = _lnId;
            if (_lnId) console.log('[LN] lesson_id linked:', _lnId, 'for date', _lnDate);
          } catch(e) { console.warn('[LN] lesson_id lookup failed:', e.message); }
        })();
      }
      
      // Auto-extract if we have doc content but missing extracted data
      // Only auto-extract for NEW sessions (no vocab yet) - don't re-extract old sessions
      // that are just missing the newer fields (keyPhrases, grammar)
      if (LessonNotesState.docContent.length > 0 && LessonNotesState.vocab.length === 0) {
        setTimeout(() => lessonNotesAutoExtractAll(), 200);
      }
    }
  }
  LessonNotesState.drillIdx = 0;
  LessonNotesState.drillRevealed = 0;
  LessonNotesState.shuffled = false;
  LessonNotesState.hiddenWords.clear();
  LessonNotesState.viewMode = 'vocab';
  LessonNotesState.currentStory = null;
  LessonNotesState.grammarDetail = null;
  
  // Stop any ongoing speech
  if (window.speechSynthesis) speechSynthesis.cancel();
  LessonNotesState.lnIsSpeaking = false;
  
  lessonNotesRender();
  
  // Clear guard after a short delay
  setTimeout(() => { LessonNotesState.loadingSession = false; }, 100);
}

function lessonNotesNew() {
  LessonNotesState.currentIdx = null;
  LessonNotesState.vocab = [];
  LessonNotesState.stories = [];
  LessonNotesState.errors = [];
  LessonNotesState.rawText = '';
  LessonNotesState.docImages = [];
  LessonNotesState.docContent = [];
  LessonNotesState.drillIdx = 0;
  LessonNotesState.viewMode = 'vocab';
  lessonNotesRender();
  document.getElementById('lessonNotesTitle').value = '';
  document.getElementById('lessonNotesInput').value = '';
  document.getElementById('lessonNotesTitle').focus();
}

function lessonNotesDelete() {
  if (LessonNotesState.currentIdx === null) return;
  if (!confirm('Delete this lesson and all its vocab?')) return;
  
  const sessions = lessonNotesGetSessions();
  sessions.splice(LessonNotesState.currentIdx, 1);
  lessonNotesSaveSessions(sessions);
  
  // Clear all state
  LessonNotesState.currentIdx = null;
  LessonNotesState.vocab = [];
  LessonNotesState.vocabOriginal = [];
  LessonNotesState.stories = [];
  LessonNotesState.keyPhrases = [];
  LessonNotesState.grammar = [];
  LessonNotesState.errors = [];
  LessonNotesState.docContent = [];
  LessonNotesState.currentStory = null;
  LessonNotesState.drillIdx = 0;
  LessonNotesState.drillRevealed = 0;
  LessonNotesState.shuffled = false;
  LessonNotesState.viewMode = 'vocab';
  LessonNotesState.fullDocSearch = '';
  
  lessonNotesRender();
}

// LessonNotesState.editMode — see declaration above

function lessonNotesShowEdit() {
  LessonNotesState.editMode = true;
  lessonNotesRenderEditView();
}

function lessonNotesRenderEditView() {
  const el1 = document.getElementById('lessonNotesView');
  const el2 = document.getElementById('lessonNotesViewMain');
  const sessions = lessonNotesGetSessions();
  const currentSession = LessonNotesState.currentIdx !== null ? sessions[LessonNotesState.currentIdx] : null;
  
  const html = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <button class="yoshi-read-btn" onclick="LessonNotesState.editMode=false;lessonNotesRender()">← Back to Drill</button>
      <span style="font-family:var(--ui);font-size:0.85rem;color:var(--ink)">${currentSession?.title || 'Untitled'}</span>
    </div>
    
    <div id="lessonNotesDropZone" 
      ondragover="event.preventDefault();this.style.borderColor='var(--teal)';this.style.background='rgba(48,213,200,0.05)'"
      ondragleave="this.style.borderColor='var(--field-border)';this.style.background='none'"
      ondrop="lessonNotesHandleDrop(event)"
      style="border:2px dashed var(--field-border);border-radius:8px;padding:16px;transition:all 0.2s">
      
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <input type="text" id="lessonNotesTitle" placeholder="Lesson title" 
          value="${currentSession?.title || ''}"
          style="flex:1;padding:8px 12px;background:var(--field);border:1px solid var(--field-border);color:var(--ink);font-family:var(--ui);font-size:0.9rem;border-radius:6px;outline:none">
        <label style="padding:6px 12px;background:none;border:1px solid var(--border);border-radius:6px;font-family:var(--ui);font-size:0.75rem;color:var(--ink-light);cursor:pointer">
          📄 Browse
          <input type="file" accept=".docx,.txt" onchange="lessonNotesHandleFile(this.files[0])" style="display:none">
        </label>
        <button class="yoshi-read-btn" onclick="lessonNotesExtract()">✨ Re-extract</button>
      </div>
      
      <textarea id="lessonNotesInput" style="width:100%;min-height:200px;padding:12px;background:var(--field);border:1px solid var(--field-border);color:var(--ink);font-family:var(--jp);font-size:0.9rem;line-height:1.7;border-radius:6px;outline:none;resize:vertical">${currentSession?.rawText || ''}</textarea>
    </div>
  `;
  
  if (el1) el1.innerHTML = html;
  if (el2) el2.innerHTML = html;
}

function lessonNotesSetMode(mode) {
  LessonNotesState.drillMode = mode;
  LessonNotesState.drillRevealed = 0;
  lessonNotesRender();
}

function lessonNotesDrillReveal() {
  // Cycle: 0 (hidden) -> 1 (reading) -> 2 (meaning) -> 0 (hidden)
  LessonNotesState.drillRevealed = (LessonNotesState.drillRevealed + 1) % 3;
  const area = document.getElementById('lessonNotesDrillArea');
  if (area) area.innerHTML = lessonNotesRenderDrillCard();
}

function lessonNotesDrillNext() {
  LessonNotesState.drillIdx = (LessonNotesState.drillIdx + 1) % LessonNotesState.vocab.length;
  LessonNotesState.drillRevealed = 0;
  lessonNotesRender();
}

function lessonNotesDrillPrev() {
  LessonNotesState.drillIdx = (LessonNotesState.drillIdx - 1 + LessonNotesState.vocab.length) % LessonNotesState.vocab.length;
  LessonNotesState.drillRevealed = 0;
  lessonNotesRender();
}


async function lessonNotesExtract() {
  const titleEl = document.getElementById('lessonNotesTitle');
  const inputEl = document.getElementById('lessonNotesInput');
  const title = titleEl?.value?.trim() || 'Lesson ' + new Date().toLocaleDateString();
  const text = inputEl?.value?.trim();
  
  if (!text) { alert('Paste some lesson notes first'); return; }
  
  const apiKey = _fy_getApiKey();
  if (!apiKey) { alert('Set API key in settings first'); return; }
  
  // Extract vocab using Claude
  const btn = document.querySelector('#lessonNotesView .yoshi-read-btn');
  const originalText = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Extracting…'; }
  
  try {
    const data = await _fy_claudeAPI({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: `Extract vocabulary from these Japanese lesson notes and provide English translations.

Look for:
1. Words with readings in parentheses: 病気（びょうき）
2. Words followed by hiragana reading: 桜　さくら  
3. Kanji compound words
4. Words marked in brackets【】

For EACH word, provide:
- word: the Japanese word (kanji if available)
- reading: hiragana reading
- meaning: English translation (YOU must provide this even if not in the notes)

Return ONLY a JSON array, no explanation:
[{"word":"病気","reading":"びょうき","meaning":"illness, sickness"},{"word":"桜","reading":"さくら","meaning":"cherry blossom"}]

Skip particles (は、が、を), grammar patterns, and full sentences - extract only vocabulary words.

Notes:
${text}` }]
    ,
      track: 'lesson'
    });
    
    const raw = (data.content?.[0]?.text || '').trim();
    
    try {
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const vocab = JSON.parse(cleaned);
      
      // Save session (include images from docx extraction)
      const sessions = lessonNotesGetSessions();
      const session = { 
        id: Date.now(),
        title, 
        rawText: text, 
        vocab, 
        stories: [], 
        errors: [],
        images: LessonNotesState.docImages || [],
        date: new Date().toISOString().slice(0,10) 
      };
      
      if (LessonNotesState.currentIdx !== null) {
        // Update existing
        sessions[LessonNotesState.currentIdx] = session;
      } else {
        // Add new at beginning
        sessions.unshift(session);
        LessonNotesState.currentIdx = 0;
      }
      
      lessonNotesSaveSessions(sessions);
      LessonNotesState.vocab = vocab;
      LessonNotesState.rawText = text;
      LessonNotesState.drillIdx = 0;
      LessonNotesState.drillRevealed = 0;
      
      // Now extract stories in a second call
      lessonNotesExtractStories(text, LessonNotesState.currentIdx);
      
    } catch (e) {
      console.error('Parse error:', e, raw);
      alert('Could not parse vocab. Check console.');
    }
  } catch (e) {
    console.error('API error:', e);
    alert('Error extracting vocab');
  }
  
  if (btn) { btn.disabled = false; btn.textContent = originalText; }
  lessonNotesRender();
}

async function lessonNotesExtractStories(text, sessionIdx) {
  const apiKey = _fy_getApiKey();
  if (!apiKey) return;
  
  try {
    const data = await _fy_claudeAPI({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        messages: [{ role: 'user', content: `Extract continuous Japanese text passages, stories, or anecdotes from these lesson notes.

Look for:
- Short stories or narratives
- Example sentences grouped together
- Continuous passages of Japanese text (not just word lists)
- Dialogues or conversations

For each passage found, provide:
- title: A short Japanese title (create one if not present, based on content)
- text: The full Japanese text of the passage

Return ONLY a JSON array:
[{"title":"朝ごはんの話","text":"今日、私は朝ごはんを食べました。..."},{"title":"電車で","text":"昨日、電車に乗りました。..."}]

If no continuous passages are found, return empty array: []

Notes:
${text}` }]
    ,
      track: 'lesson'
    });
    
    const raw = (data.content?.[0]?.text || '').trim();
    const cleaned = raw.replace(/```json|```/g, '').trim();
    let stories = JSON.parse(cleaned);
    
    // Remove bracketed readings from story text (e.g. 食べる（たべる） -> 食べる)
    stories = stories.map(s => ({
      ...s,
      text: lessonNotesRemoveBracketedReadings(s.text)
    }));
    
    // Save stories to session
    const sessions = lessonNotesGetSessions();
    if (sessions[sessionIdx]) {
      sessions[sessionIdx].stories = stories;
      lessonNotesSaveSessions(sessions);
      LessonNotesState.stories = stories;
      lessonNotesRender();
    }
    
    // Now extract errors
    lessonNotesExtractErrors(text, sessionIdx);
  } catch (e) {
    console.error('Story extraction error:', e);
  }
}

// Remove bracketed hiragana/katakana readings that follow kanji
// e.g. "食べる（たべる）" -> "食べる", "漢字(かんじ)" -> "漢字"
function lessonNotesRemoveBracketedReadings(text) {
  // Match kanji followed by bracketed hiragana/katakana
  // Supports both （） and () brackets
  return text
    .replace(/([一-龯々]+)（[ぁ-んァ-ン]+）/g, '$1')
    .replace(/([一-龯々]+)\([ぁ-んァ-ン]+\)/g, '$1');
}

// LessonNotesState.errors — see declaration above

async function lessonNotesExtractErrors(text, sessionIdx) {
  const apiKey = _fy_getApiKey();
  if (!apiKey) return;
  
  try {
    const data = await _fy_claudeAPI({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: `Extract error corrections from these Japanese lesson notes.

Look for:
- Crossed out text with corrections
- Text marked with ✗, ×, X or similar
- Corrections shown as "wrong → right" or "wrong ⇒ right"
- Teacher notes explaining mistakes
- Any indication of incorrect usage with the correct form

For each error found, provide:
- wrong: The incorrect text/usage
- correct: The correct text/usage  
- note: Teacher's explanation or note about the error (if any, otherwise brief explanation of why it's wrong)

Return ONLY a JSON array:
[{"wrong":"食べるました","correct":"食べました","note":"る is not needed with ました"},{"wrong":"私は本が読む","correct":"私は本を読む","note":"Use を for direct objects, not が"}]

If no errors/corrections found, return empty array: []

Notes:
${text}` }]
    ,
      track: 'lesson'
    });
    
    const raw = (data.content?.[0]?.text || '').trim();
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const errors = JSON.parse(cleaned);
    
    // Save errors to session
    const sessions = lessonNotesGetSessions();
    if (sessions[sessionIdx]) {
      sessions[sessionIdx].errors = errors;
      lessonNotesSaveSessions(sessions);
      LessonNotesState.errors = errors;
      lessonNotesRender();
    }
  } catch (e) {
    console.error('Error extraction error:', e);
  }
}

function lessonNotesHandleDrop(event) {
  event.preventDefault();
  const dropZone = document.getElementById('lessonNotesDropZone');
  if (dropZone) {
    dropZone.style.borderColor = 'var(--field-border)';
    dropZone.style.background = 'none';
  }
  
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    lessonNotesHandleFile(file);
  }
}

async function lessonNotesHandleFile(file) {
  if (!file) return;
  
  const titleInput = document.getElementById('lessonNotesTitle');
  const textInput = document.getElementById('lessonNotesInput');
  
  // Use filename (without extension) as default title if empty
  if (titleInput && !titleInput.value.trim()) {
    const nameWithoutExt = file.name.replace(/\.[^.]+$/, '');
    titleInput.value = nameWithoutExt;
  }
  
  // Clear previous images
  LessonNotesState.docImages = [];
  
  if (file.name.endsWith('.txt')) {
    // Plain text file
    const text = await file.text();
    if (textInput) textInput.value = text;
  } else if (file.name.endsWith('.docx')) {
    // Word document - parse with JSZip
    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      const docXml = await zip.file('word/document.xml')?.async('string');
      const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
      
      if (!docXml) {
        alert('Could not read document.xml from .docx file');
        return;
      }
      
      // Build image map from relationships
      const imageMap = {};
      if (relsXml) {
        const relsParser = new DOMParser();
        const relsDoc = relsParser.parseFromString(relsXml, 'application/xml');
        const rels = relsDoc.getElementsByTagName('Relationship');
        for (const rel of rels) {
          const id = rel.getAttribute('Id');
          const target = rel.getAttribute('Target');
          if (target && /media\/(image\d+)\.(png|jpg|jpeg|gif|bmp)/i.test(target)) {
            imageMap[id] = target.replace(/^.*\//, 'word/media/');
          }
        }
      }
      
      // Load all images into a lookup by filename
      const imageData = {};
      const mediaFolder = zip.folder('word/media');
      if (mediaFolder) {
        const imagePromises = [];
        mediaFolder.forEach((relativePath, zipEntry) => {
          if (/\.(png|jpg|jpeg|gif|bmp)$/i.test(relativePath)) {
            imagePromises.push(
              zipEntry.async('base64').then(base64 => {
                const ext = relativePath.split('.').pop().toLowerCase();
                const mimeType = ext === 'jpg' ? 'jpeg' : ext;
                imageData['word/media/' + relativePath] = `data:image/${mimeType};base64,${base64}`;
              })
            );
          }
        });
        await Promise.all(imagePromises);
      }
      
      // Parse XML and extract text with image placeholders
      const result = lessonNotesParseDocxXmlWithImages(docXml, imageMap, imageData);
      LessonNotesState.rawText = result.text;
      LessonNotesState.docImages = result.images; // array of {position, src}
      LessonNotesState.docContent = result.content; // interleaved array [{type:'text'|'image', value}]
      
      if (textInput) textInput.value = result.text;
      
    } catch (e) {
      console.error('Error parsing .docx:', e);
      alert('Error parsing .docx file: ' + e.message);
    }
  } else {
    alert('Please drop a .docx or .txt file');
  }
}

// LessonNotesState.docContent/fullDocSearch — see declaration above

function lessonNotesFullDocDoSearch() {
  const input = document.getElementById('lessonNotesFullDocSearchInput');
  LessonNotesState.fullDocSearch = input?.value?.trim() || '';
  lessonNotesRender();
}

function lessonNotesFullDocClearSearch() {
  LessonNotesState.fullDocSearch = '';
  lessonNotesRender();
}

function lessonNotesParseDocxXmlWithImages(xml, imageMap, imageData) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  
  const content = []; // [{type:'text'|'image', value}]
  const images = [];
  let currentText = '';
  
  const paragraphs = doc.getElementsByTagName('w:p');
  
  for (const p of paragraphs) {
    let line = '';
    const runs = p.getElementsByTagName('w:r');
    
    for (const r of runs) {
      // Check for images (drawings)
      const drawings = r.getElementsByTagName('w:drawing');
      for (const drawing of drawings) {
        // Look for blip element with embed attribute
        const blips = drawing.getElementsByTagName('a:blip');
        for (const blip of blips) {
          const embedId = blip.getAttribute('r:embed');
          if (embedId && imageMap[embedId]) {
            const imgSrc = imageData[imageMap[embedId]];
            if (imgSrc) {
              // Save current text block if any
              if (currentText.trim()) {
                content.push({type: 'text', value: currentText.trim()});
                currentText = '';
              }
              content.push({type: 'image', value: imgSrc});
              images.push({position: content.length - 1, src: imgSrc});
            }
          }
        }
      }
      
      // Get text
      const texts = r.getElementsByTagName('w:t');
      for (const t of texts) {
        line += t.textContent || '';
      }
    }
    
    if (line) {
      currentText += line + '\n';
    }
  }
  
  // Add remaining text
  if (currentText.trim()) {
    content.push({type: 'text', value: currentText.trim()});
  }
  
  // Also return plain text version
  const plainText = content
    .filter(c => c.type === 'text')
    .map(c => c.value)
    .join('\n\n');
  
  return { text: plainText, images, content };
}

// Export all lessonNotes functions to window for onclick handlers

// ── Docx parser ───────────────────────────────────────────────────────────
async function yoshiParseDocx() {
  const file = document.getElementById('yoshiDocxFile')?.files[0];
  if (!file) { alert('Select a .docx file first.'); return; }
  const status = document.getElementById('yoshiImportStatus');
  if (status) status.textContent = 'Parsing…';

  // Use the file's last-modified date as the session date
  const fileDate = new Date(file.lastModified).toLocaleDateString('de-DE');

  // Auto-create a session if none is open
  if (yoshiCurrentIdx === null) {
    const sessions = yoshiGetSessions();
    sessions.push({ date: fileDate, title: '', complete: '', cloze: '', vocab: [], blanks: [] });
    yoshiSaveSessions(sessions);
    yoshiCurrentIdx = sessions.length - 1;
    yoshiRender();
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const xmlStr = await zip.file('word/document.xml').async('string');

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const paras = xmlDoc.getElementsByTagNameNS(ns, 'p');

    // Parse each paragraph into { text, blanks }
    const parsed = [];
    let totalBlanks = 0;

    Array.from(paras).forEach(para => {
      // Only direct w:r children of paragraph (not nested inside ruby etc)
      const runs = Array.from(para.childNodes).filter(n =>
        n.nodeType === 1 && n.localName === 'r'
      );
      let lineText = '';
      let paraBlankCount = 0;

      Array.from(runs).forEach(run => {
        // Only direct w:t children, not nested (avoids picking up ruby sub-elements)
        const tEls = Array.from(run.childNodes).filter(n => 
          n.nodeType === 1 && n.localName === 't'
        );
        if (tEls.length === 0) {
          // Empty run = blank slot
          lineText += '＿＿';
          paraBlankCount++;
          totalBlanks++;
        } else {
          const text = tEls.map(t => t.textContent).join('');
          if (text === ' ' || text === '\u3000') {
            // skip spacing/indent tokens
          } else if (text) {
            lineText += text;
          }
        }
      });

      const cleaned = lineText.trim();
      if (cleaned) parsed.push({ text: cleaned, blanks: paraBlankCount });
    });

    if (!parsed.length) throw new Error('No text found in document');

    // First paragraph = title (no blanks, short)
    const title = parsed[0].text;
    const bodyParas = parsed.slice(1);
    const clozeText = bodyParas.map(p => '　' + p.text).join('\n');

    // Save everything to session first, then render
    if (yoshiCurrentIdx !== null) {
      const sessions = yoshiGetSessions();
      sessions[yoshiCurrentIdx].date = fileDate;
      sessions[yoshiCurrentIdx].title = title;
      sessions[yoshiCurrentIdx].cloze = clozeText;
      delete sessions[yoshiCurrentIdx].furigana; // text changed — stale furigana discarded
      yoshiSaveSessions(sessions);
    }

    // Show session with Cloze tab active
    const s2 = yoshiGetSessions()[yoshiCurrentIdx];
    yoshiShowSession(s2);
    // Switch to Cloze tab
    const clozeBtn = Array.from(document.querySelectorAll('.yoshi-subtab')).find(b => b.textContent.includes('Cloze'));
    if (clozeBtn) clozeBtn.click();

    // Update sidebar list title
    const listItems = document.querySelectorAll('.yoshi-session-item');
    const allSess = yoshiGetSessions();
    listItems.forEach((el, ri) => {
      const i = allSess.length - 1 - ri;
      if (i === yoshiCurrentIdx) {
        const span = el.querySelector('.yoshi-session-title');
        if (span) span.textContent = title;
        const dateSpan = el.querySelector('.yoshi-session-date');
        if (dateSpan) dateSpan.textContent = fileDate;
        el.classList.add('active');
      }
    });

    const status2 = document.getElementById('yoshiImportStatus');
    if (status2) status2.textContent = `✓ ${totalBlanks} blanks found — cloze ready. Add vocab or paste the complete text if you have it, then Save.`;
  } catch(e) {
    alert('Parse error: ' + e.message);
    console.error('yoshiParseDocx:', e);
  }
}

// ── Cloze rendering ───────────────────────────────────────────────────────
function yoshiAddVocab(i) {
  const s = yoshiGetSessions()[yoshiCurrentIdx];
  if (!s) return;
  const v = s.vocab[i];
  if (!v) return;
  if (state.vocab.some(w => w.jp === v.jp)) {
    const btn = document.getElementById('yoshiVocabAdd' + i);
    if (btn) { btn.textContent = 'Already in deck'; btn.className = 'yoshi-vocab-add added'; }
    return;
  }
  state.vocab.push({ jp: v.jp, kana: v.kana || '', reading: v.kana || '', en: v.en, pos: '' });
  saveState();
  const btn = document.getElementById('yoshiVocabAdd' + i);
  if (btn) { btn.textContent = '✓ Added'; btn.className = 'yoshi-vocab-add added'; }
}


// ── AppEvents listener: RECORDING_READY ─────────────────────────────────────
// When a recording finishes, show a prominent transcribe button in the lesson
// notes panel so the user knows to transcribe before leaving the main app.
try {
  AppEvents.on('RECORDING_READY', function(data) {
    const bar = document.getElementById('yoshiTranscribeBar');
    if (!bar) return;
    bar.style.display = 'flex';
    bar.innerHTML =
      '<span style="font-family:var(--ui);font-size:0.78rem;color:var(--gold);flex:1">'
      + '⏺ Recording saved — ready to transcribe</span>'
      + '<button class="btn-action" id="yoshiTranscribeNowBtn" onclick="yoshiTranscribeNow()" '
      + 'style="font-size:0.75rem;padding:4px 14px">⚙ Transcribe now</button>';
    window._pendingTranscribeSessionId = data.sessionId;
  });
} catch(e) {}

async function yoshiTranscribeNow() {
  const btn = document.getElementById('yoshiTranscribeNowBtn');
  if (btn) { btn.textContent = '⏳ Transcribing…'; btn.disabled = true; }
  try {
    const sessionId = window._pendingTranscribeSessionId;
    if (!sessionId) throw new Error('No pending session');
    await Orchestrator.transcribeSession(sessionId);
    const bar = document.getElementById('yoshiTranscribeBar');
    if (bar) bar.innerHTML = '<span style="font-family:var(--ui);font-size:0.78rem;color:var(--teal)">✓ Transcription complete</span>';
    await Orchestrator.loadSessions();
    lessonNotesRenderPanel();
  } catch(e) {
    if (btn) { btn.textContent = '✗ Failed — retry'; btn.disabled = false; }
  }
}

// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, {
    // Lesson Notes panel
    lessonNotesRenderPanel,
    lessonNotesPanelHandleDrop,
    lessonNotesPanelHandleFile,
    lessonNotesPanelHandlePaste,
    lessonNotesNewFromPanel,
    lessonNotesDeleteFromPanel,
    lnRecordingTabButton,
    lnShowLinkPicker,
    lnLinkRecording,
    lnTranscribeLinked,
    lnRenderLinkedRecording,
    lnLoadTranscript,
    lnSeekToTime,
    lessonNotesSetView,
    lessonNotesToggleGrammarHide,
    lessonNotesToggleShowHidden,
    lessonNotesEditGrammar,
    lessonNotesSaveGrammarEdit,
    lessonNotesDeleteGrammar,
    lessonNotesOpenGrammarDetail,
    lessonNotesCloseGrammarDetail,
    lessonNotesGrammarGenerateDrill,
    lessonNotesGrammarCheckDrill,
    lessonNotesGrammarNextDrill,
    lessonNotesGrammarPrevDrill,
    lessonNotesGrammarAsk,
    lessonNotesOpen,
    lessonNotesNew,
    lessonNotesDelete,
    lessonNotesLoadSession,
    lessonNotesExtract,
    lessonNotesExtractGrammar,
    lessonNotesExtractKeyPhrases,
    lessonNotesOpenStory,
    lessonNotesSetStoryTab,
    lessonNotesClozeRevealAll,
    lessonNotesSaveStoryNotes,
    lessonNotesSaveStoryEdit,
    lessonNotesSetMode,
    lessonNotesDrillReveal,
    lessonNotesDrillNext,
    lessonNotesDrillPrev,
    renderRecordingsBrowser,
    recBrowserTranscribe,
    recBrowserDelete,
  });
} catch(e) { console.error('[features-yoshi] App registry failed:', e); }

// ═══════════════════════════════════════════════════════
// TIMELINE ALIGNMENT — Claude assigns each Yoshi message
// to the most likely audio segment it responds to.
// One call per session, result stored on session object.
// ═══════════════════════════════════════════════════════

async function lnAlignTimeline() {
  const btn = document.getElementById('lnAlignBtn');
  if (btn) { btn.textContent = '⏳ Aligning…'; btn.disabled = true; }

  try {
    const recId = LessonNotesState._transcriptRecId;
    if (!recId) throw new Error('No recording linked');

    // Load transcript from DB
    const rows = await window.db.query(
      'SELECT transcript_json FROM lesson_sessions WHERE id=?', [recId]
    );
    if (!rows || !rows[0] || !rows[0].transcript_json) throw new Error('No transcript');
    const turns = JSON.parse(rows[0].transcript_json);

    // Get recording start time
    const rec = (window._lessonRecordingSessions||[]).find(function(r){return r.id===recId;});
    const startMatch = rec && rec.audio_path ? rec.audio_path.match(/_(\d{13})\.webm/) : null;
    const startMs = startMatch ? parseInt(startMatch[1]) : null;

    // Get Yoshi's messages
    const _parseWA = App.yoshiParseWhatsapp || window.yoshiParseWhatsapp;
    const rawText = (function(){
      const sessions = lessonNotesGetSessions();
      const s = LessonNotesState.currentIdx !== null ? sessions[LessonNotesState.currentIdx] : null;
      return s ? s.rawText || '' : '';
    })();
    const allMsgs = _parseWA ? _parseWA(rawText) : [];
    const yoshiMsgs = allMsgs.filter(function(m){ return !(/paulandres|paul/i.test(m.sender)); });

    if (!yoshiMsgs.length) throw new Error('No Yoshi messages found');

    // Build compact transcript for Claude — just time + text, capped at 8000 chars
    function secToWall(ts) {
      if (!startMs) return ts + 's';
      return new Date(startMs + ts*1000).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    }
    const transcriptLines = turns.map(function(t){
      const ts = Math.round(t.start != null ? t.start : (t.timestamp||0));
      return secToWall(ts) + ' ' + (t.text||'');
    }).join('\n').slice(0, 8000);

    const yoshiLines = yoshiMsgs.map(function(m){
      return m.time + ' ' + m.text;
    }).join('\n');

    const prompt =
      'You are aligning Yoshi\'s WhatsApp messages to a Japanese lesson audio transcript.\n\n' +
      'AUDIO TRANSCRIPT (time + student speech):\n' + transcriptLines + '\n\n' +
      'YOSHI\'S MESSAGES (time + her comment/correction):\n' + yoshiLines + '\n\n' +
      'For each of Yoshi\'s messages, find the audio transcript entry the message is most likely ' +
      'responding to. Yoshi sends messages shortly AFTER the relevant moment — look 10-60 seconds ' +
      'before her message time for the matching audio segment.\n\n' +
      'Return ONLY a JSON array:\n' +
      '[{"waTime":"13:32:16","audioTime":"13:31:58","audioOffset":108}]\n\n' +
      'waTime: Yoshi\'s message time exactly as given\n' +
      'audioTime: the matched audio segment time\n' +
      'audioOffset: matched segment start in seconds from recording start\n' +
      'If no good match exists for a message, omit it from the array.';

    const data = await _fy_claudeAPI({
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
      track: 'lesson'
    });

    const responseText = _fy_claudeText(data) || '[]';
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON in response');
    const alignments = JSON.parse(jsonMatch[0]);

    // Store as {waTime: audioOffset} map on session
    const waAlignments = {};
    alignments.forEach(function(a){ waAlignments[a.waTime] = a.audioOffset; });

    const sessions = lessonNotesGetSessions();
    const saveIdx = LessonNotesState.currentIdx !== null ? LessonNotesState.currentIdx : (sessions.length === 1 ? 0 : null);
    const sess = saveIdx !== null ? sessions[saveIdx] : null;
    if (sess) {
      sess.waAlignments = waAlignments;
      if (LessonNotesState.currentIdx === null) LessonNotesState.currentIdx = saveIdx;
      lessonNotesSaveSessions(sessions);
    }

    if (btn) { btn.textContent = '✓ Aligned'; btn.disabled = false; }

    // Reload in timeline mode with new alignments
    LessonNotesState.transcriptMode = 'timeline';
    const ta = document.getElementById('lnTranscriptArea');
    if (ta) ta.innerHTML = '';
    lnLoadTranscript(recId, 'timeline');

    // Update toggle bar to show Re-align
    lnShowTranscriptContainer(recId);

  } catch(e) {
    console.error('[lnAlignTimeline]', e);
    if (btn) { btn.textContent = '⚡ Align'; btn.disabled = false; }
  }
}

// ── Two-column timeline renderer ───────────────────────
// Called from lnLoadTranscript when mode === 'timeline'.
// Uses waAlignments from session if available, falls back
// to wall-clock positioning.

async function lnLoadTwoColumnTimeline(recId, el, turns, startMs) {
  const esc = App.escHtml || window.escHtml || function(s){return s;};

  // Get Yoshi's messages and alignment data
  const _parseWA = App.yoshiParseWhatsapp || window.yoshiParseWhatsapp;
  const sessions = lessonNotesGetSessions();
  const sess = LessonNotesState.currentIdx !== null ? sessions[LessonNotesState.currentIdx] : null;
  const rawText = sess ? sess.rawText || '' : '';
  const waAlignments = sess ? sess.waAlignments || {} : {};
  const allMsgs = _parseWA ? _parseWA(rawText) : [];
  const yoshiMsgs = allMsgs.filter(function(m){ return !(/paulandres|paul/i.test(m.sender)); });

  function waTimeToSeconds(timeStr) {
    if (!startMs) return null;
    const startDate = new Date(startMs);
    const parts = timeStr.split(':');
    const h = parseInt(parts[0]), m = parseInt(parts[1]), s = parseInt(parts[2]||0);
    const wDate = new Date(startDate);
    wDate.setHours(h, m, s, 0);
    return (wDate.getTime() - startMs) / 1000;
  }

  function secToTimeStr(ts) {
    if (startMs) {
      return new Date(startMs + ts*1000).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    }
    const m = Math.floor(ts/60), s = ts%60;
    return m + ':' + String(s).padStart(2,'0');
  }

  // Build audio map: offset → turn
  const audioByOffset = {};
  turns.forEach(function(t){
    const ts = Math.round(t.start != null ? t.start : (t.timestamp||0));
    audioByOffset[ts] = t;
  });

  // Build Yoshi message map: audioOffset → [msgs]
  // If aligned, use alignment. Otherwise use wall-clock.
  const yoshiByOffset = {};
  yoshiMsgs.forEach(function(msg) {
    let offset;
    if (waAlignments[msg.time] !== undefined) {
      offset = waAlignments[msg.time];
    } else {
      const wc = waTimeToSeconds(msg.time);
      offset = wc !== null ? Math.round(wc) : null;
    }
    if (offset === null) return;
    // Find nearest audio segment
    const nearest = turns.reduce(function(best, t){
      const ts = Math.round(t.start != null ? t.start : (t.timestamp||0));
      return Math.abs(ts - offset) < Math.abs(best - offset) ? ts : best;
    }, Infinity);
    if (!yoshiByOffset[nearest]) yoshiByOffset[nearest] = [];
    yoshiByOffset[nearest].push(msg);
  });

  // Track assigned messages and find unassigned ones
  const assignedMsgTimes = new Set();
  Object.values(yoshiByOffset).forEach(function(msgs) {
    msgs.forEach(function(m) { assignedMsgTimes.add(m.time); });
  });
  const unassigned = yoshiMsgs.filter(function(m) { return !assignedMsgTimes.has(m.time); });

  // Re-fetch el fresh
  const elFresh = document.getElementById('lnTranscriptArea') || el;
  if (!elFresh) return;
  elFresh.innerHTML = '';

  if (!turns.length) {
    elFresh.innerHTML = '<span style="color:var(--ink-light)">Empty transcript.</span>';
    return;
  }

  const unassignedSorted = unassigned.slice().sort(function(a,b){ return (waTimeToSeconds(a.time)||0)-(waTimeToSeconds(b.time)||0); });
  let uIdx = 0;

  function renderUnassignedMsg(msg) {
    const uRow = document.createElement('div');
    uRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid rgba(255,255,255,0.02)';
    const uLeft = document.createElement('div');
    uLeft.style.cssText = 'border-right:1px solid rgba(255,255,255,0.06)';
    const uRight = document.createElement('div');
    uRight.style.cssText = 'display:flex;gap:6px;align-items:flex-start;padding:4px 4px 4px 10px;opacity:0.45';
    const safeText = msg.text.replace(/'/g, "\\'");
    uRight.innerHTML =
      '<span style="color:var(--ink-light);flex-shrink:0;font-size:0.68rem;min-width:44px;padding-top:2px">' + esc(msg.time) + '</span>' +
      '<span style="color:var(--ink-light);line-height:1.6;font-size:0.92rem;flex:1;font-style:italic">' + esc(msg.text) + '</span>' +
      '<button onclick="event.stopPropagation();lnTtsAndPause(\'' + safeText + '\')" style="background:none;border:none;cursor:pointer;font-size:0.85rem;flex-shrink:0;padding:0 2px">🔊</button>';
    uRow.appendChild(uLeft);
    uRow.appendChild(uRight);
    elFresh.appendChild(uRow);
  }

  turns.forEach(function(t) {
    const ts = Math.round(t.start != null ? t.start : (t.timestamp||0));
    while (uIdx < unassignedSorted.length) {
      const uSecs = waTimeToSeconds(unassignedSorted[uIdx].time);
      if (uSecs !== null && uSecs < ts) { renderUnassignedMsg(unassignedSorted[uIdx++]); } else break;
    }
    const timeStr = secToTimeStr(ts);
    const offsetStr = Math.floor(ts/60) + ':' + String(ts%60).padStart(2,'0');
    const yoshiForRow = yoshiByOffset[ts] || [];
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid rgba(255,255,255,0.04);min-height:28px';
    const left = document.createElement('div');
    left.style.cssText = 'display:flex;gap:8px;padding:5px 10px 5px 4px;cursor:pointer;align-items:flex-start;border-right:1px solid rgba(255,255,255,0.06)';
    left.classList.add('row-hover-teal');
    left.onclick = (function(sec){ return function(){ lnSeekToTime(sec); }; })(ts);
    left.innerHTML =
      '<span title="' + offsetStr + '" style="color:var(--teal);flex-shrink:0;font-size:0.68rem;font-variant-numeric:tabular-nums;min-width:44px;padding-top:2px;opacity:0.7">' + timeStr + '</span>' +
      '<span style="color:var(--ink);line-height:1.6;font-size:0.92rem">' + esc(t.text||'') + '</span>';
    const right = document.createElement('div');
    right.style.cssText = 'display:flex;flex-direction:column;padding:5px 4px 5px 10px';
    if (yoshiForRow.length) {
      yoshiForRow.forEach(function(msg){
        const msgEl = document.createElement('div');
        msgEl.style.cssText = 'display:flex;gap:6px;align-items:flex-start;cursor:pointer;padding:1px 0';
        msgEl.onclick = (function(sec){ return function(){ lnSeekToTime(sec); }; })(ts);
        msgEl.classList.add('row-hover-gold');
        const safeText = msg.text.replace(/'/g, "\\'");
        msgEl.innerHTML =
          '<span style="color:var(--gold);flex-shrink:0;font-size:0.68rem;min-width:44px;padding-top:2px;font-variant-numeric:tabular-nums;opacity:0.7">' + esc(msg.time) + '</span>' +
          '<span style="color:var(--ink);line-height:1.6;font-size:0.92rem;flex:1">' + esc(msg.text) + '</span>' +
          '<button onclick="event.stopPropagation();lnTtsAndPause(\'' + safeText + '\')" style="background:none;border:none;cursor:pointer;color:var(--gold);font-size:0.85rem;flex-shrink:0;padding:0 2px;opacity:0.6">🔊</button>';
        right.appendChild(msgEl);
      });
      row.style.background = 'rgba(255,214,10,0.03)';
    }
    row.appendChild(left);
    row.appendChild(right);
    elFresh.appendChild(row);
  });
  while (uIdx < unassignedSorted.length) { renderUnassignedMsg(unassignedSorted[uIdx++]); }
}

function lnTtsAndPause(text) {
  const student = document.getElementById('lnAudioStudent');
  const teacher = document.getElementById('lnAudioTeacher');
  if (student && !student.paused) student.pause();
  if (teacher && !teacher.paused) teacher.pause();
  (App.jpSpeak || window.jpSpeak)?.(text);
}



// ═══════════════════════════════════════════════════════
// RECORDINGS BROWSER
// Simple list of all recordings — play, transcribe, delete.
// No lesson linking required. Used for auditioning and cleanup.
// ═══════════════════════════════════════════════════════

async function renderRecordingsBrowser() {
  const el = document.getElementById('recordingsBrowserContent');
  if (!el) return;

  // Refresh session list from DB
  await (App.Orchestrator || window.Orchestrator).loadSessions();
  const recs = (window._lessonRecordingSessions || []).slice(); // newest first

  if (!recs.length) {
    el.innerHTML = '<div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink-light);padding:20px">No recordings yet.</div>';
    return;
  }

  const esc = App.escHtml || window.escHtml || function(s){return s;};

  let html = '<div style="display:flex;flex-direction:column;gap:0">';

  for (const rec of recs) {
    // Local time from filename timestamp
    const tsMatch = rec.audio_path ? rec.audio_path.match(/_(\d{13})\.webm/) : null;
    const dt = tsMatch
      ? new Date(parseInt(tsMatch[1])).toLocaleString('en-GB', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})
      : rec.created_at ? new Date(rec.created_at).toLocaleString('en-GB', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : rec.date || '?';

    const dur = rec.audio_duration_s > 0
      ? Math.floor(rec.audio_duration_s/60) + 'm ' + (rec.audio_duration_s%60) + 's'
      : '?';

    const transcribed = rec.processed_at ? '✓ Transcribed' : '○ Not transcribed';
    const transcribedColor = rec.processed_at ? 'var(--teal)' : 'var(--ink-light)';

    const apath = rec.audio_path || '';
    const tpath = apath.replace('.webm', '_teacher.webm');
    const safeId = 'rec_' + rec.id;

    html += `<div style="border-bottom:1px solid var(--border);padding:12px 4px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div style="flex:1">
          <div style="font-family:var(--ui);font-size:0.82rem;color:var(--ink);font-weight:600">${esc(dt)}</div>
          <div style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light);margin-top:2px">
            ${dur} &nbsp;·&nbsp; <span style="color:${transcribedColor}">${transcribed}</span>
          </div>
        </div>
        <button class="btn-action btn-sm" onclick="recBrowserTranscribe(${rec.id})"
          ${rec.processed_at ? 'title="Re-transcribe"' : 'title="Transcribe"'}>
          ${rec.processed_at ? '↺ Re-transcribe' : '⚙ Transcribe'}
        </button>
        <button class="btn-action btn-sm" style="color:var(--red);border-color:var(--red)"
          onclick="recBrowserDelete(${rec.id}, '${esc(apath)}', '${esc(tpath)}')">🗑 Delete</button>
      </div>
      <div id="${safeId}_players">
        ${apath ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="font-family:var(--ui);font-size:0.68rem;color:var(--ink-light);width:52px">🙋 You</span>
          <audio src="file://${esc(apath)}" controls style="flex:1;height:24px;accent-color:var(--teal)"></audio>
        </div>` : ''}
        ${tpath ? `<div style="display:flex;align-items:center;gap:8px">
          <span style="font-family:var(--ui);font-size:0.68rem;color:var(--ink-light);width:52px">🧑‍🏫 Yoshi</span>
          <audio src="file://${esc(tpath)}" controls style="flex:1;height:24px;accent-color:var(--gold)"></audio>
        </div>` : ''}
      </div>
    </div>`;
  }

  html += '</div>';
  el.innerHTML = html;
}

async function recBrowserTranscribe(sessionId) {
  const btn = event.target;
  btn.textContent = '⏳…'; btn.disabled = true;
  try {
    await (App.Orchestrator || window.Orchestrator).transcribeSession(sessionId);
    btn.textContent = '✓ Done';
    setTimeout(() => renderRecordingsBrowser(), 1000);
  } catch(e) {
    btn.textContent = '✗ Failed'; btn.disabled = false;
    console.error('[recBrowser] transcribe failed:', e);
  }
}

async function recBrowserDelete(sessionId, audioPath, teacherPath) {
  if (!confirm('Delete this recording and audio files from disk?')) return;
  try {
    await (App.Orchestrator || window.Orchestrator).deleteSession(sessionId, audioPath, teacherPath);
    renderRecordingsBrowser();
  } catch(e) {
    alert('Delete failed: ' + e.message);
  }
}

