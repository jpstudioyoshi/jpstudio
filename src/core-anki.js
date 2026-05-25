// ╔══════════════════════════════════════════════════════════════════════════════
// ║ core-anki.js
// ║ Anki integration — AnkiConnect bridge, deck loading, card review.
// ║ Depends on: core-foundation.js (Storage, STORAGE_KEYS, claudeAPI, escHtml)
// ╚══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// ANKICONNECT INTEGRATION
// ═══════════════════════════════════════════════════════

// ── Anki state ──────────────────────────────────────────────────────────────
const AnkiState = {
  connected:     false,
  decks:         [],
  currentDeck:   '',
  dueCards:      [],
  currentCard:   null,
  reviewedCount: 0,
  totalCards:    0,
  direction:     'jp-en',   // 'jp-en' | 'en-jp'
  cardFrontText: '',
  cardBackText:  '',
  audioFiles:    [],
};

async function ankiInvoke(action, params = {}) {
  try {
    const resp = await fetch('http://localhost:8765', {
      method: 'POST',
      body: JSON.stringify({ action, version: 6, params })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    return data.result;
  } catch (e) {
    console.error('AnkiConnect error:', e);
    throw e;
  }
}

async function ankiConnect() {
  const dot = document.getElementById('ankiStatusDot');
  const text = document.getElementById('ankiStatusText');
  const setup = document.getElementById('ankiSetup');
  const selector = document.getElementById('ankiDeckSelector');
  
  dot.style.background = 'var(--gold)';
  text.textContent = 'Connecting...';
  text.style.color = 'var(--gold)';
  
  try {
    const version = await ankiInvoke('version');
    AnkiState.connected = true;
    dot.style.background = 'var(--teal)';
    text.textContent = `Connected (v${version})`;
    text.style.color = 'var(--teal)';
    setup.style.display = 'none';
    selector.style.display = 'block';
    
    // Load decks
    await ankiLoadDecks();
  } catch (e) {
    AnkiState.connected = false;
    dot.style.background = 'var(--red)';
    text.textContent = 'Not connected — is Anki running?';
    text.style.color = 'var(--red)';
    setup.style.display = 'block';
    selector.style.display = 'none';
    document.getElementById('ankiReviewCard').style.display = 'none';
  }
}

async function ankiLoadDecks() {
  if (!AnkiState.connected) return;
  
  try {
    AnkiState.decks = await ankiInvoke('deckNames');
    const select = document.getElementById('ankiDeckSelect');
    select.innerHTML = AnkiState.decks.map(d => `<option value="${d}">${d}</option>`).join('');
    
    // Try to restore last used deck
    const lastDeck = (App.Storage || window.Storage).get(STORAGE_KEYS.ANKI_LAST_DECK, '');
    if (lastDeck && AnkiState.decks.includes(lastDeck)) {
      select.value = lastDeck;
    }
    
    await ankiLoadDeck();
  } catch (e) {
    console.error('Failed to load decks:', e);
  }
}

function ankiTodayKey(deckName) {
  const d = new Date(); 
  return deckName + '|' + d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
}
function ankiSaveSession() {
  const key = ankiTodayKey(AnkiState.currentDeck);
  (App.Storage || window.Storage).setJSON(STORAGE_KEYS.ANKI_SESSION, {
    key, queue: AnkiState.dueCards, total: AnkiState.totalCards, reviewed: AnkiState.reviewedCount
  });
}
function ankiLoadSession(deckName) {
  try {
    const s = (App.Storage || window.Storage).getJSON(STORAGE_KEYS.ANKI_SESSION, null);
    if (!s || s.key !== ankiTodayKey(deckName)) return null;
    return s;
  } catch(e) { return null; }
}

async function ankiLoadDeck() {
  if (!AnkiState.connected) return;
  
  const deckName = document.getElementById('ankiDeckSelect').value;
  AnkiState.currentDeck = deckName;
  (App.Storage || window.Storage).set(STORAGE_KEYS.ANKI_LAST_DECK, deckName);
  
  try {
    // Resume today's session if one exists for this deck
    const existingSession = ankiLoadSession(deckName);
    if (existingSession && existingSession.queue.length > 0) {
      AnkiState.dueCards = existingSession.queue;
      AnkiState.totalCards = existingSession.total;
      AnkiState.reviewedCount = existingSession.reviewed;
      document.getElementById('ankiDueCount').textContent = existingSession.total + ' card' + (existingSession.total !== 1 ? 's' : '') + ' (resumed)';
      document.getElementById('ankiReviewedCount').textContent = existingSession.reviewed;
      document.getElementById('ankiRemainingCount').textContent = Math.max(0, existingSession.total - existingSession.reviewed);
      document.getElementById('ankiReviewCard').style.display = 'block';
      document.getElementById('ankiEmpty').style.display = 'none';
      await ankiShowNextCard();
      return;
    }

    // No session for today — fetch fresh from Anki
    const dueCards = await ankiInvoke('findCards', { query: `deck:"${deckName}" is:due` });

    // Get deck config to respect the deck's own new-cards-per-day limit
    let newLimit = 20; // fallback
    try {
      const deckConfig = await ankiInvoke('getDeckConfig', { deck: deckName });
      if (deckConfig?.new?.perDay !== undefined) newLimit = deckConfig.new.perDay;
    } catch(e) { /* use fallback */ }

    // Count new cards already seen today by Anki (learned today = introduced today)
    let newSeenToday = 0;
    try {
      const learnedToday = await ankiInvoke('findCards', { query: `deck:"${deckName}" is:new rated:1` });
      newSeenToday = learnedToday.length;
    } catch(e) { /* ignore */ }

    const remaining = Math.max(0, newLimit - newSeenToday);
    let limitedNew = [];
    if (remaining > 0) {
      const newCards = await ankiInvoke('findCards', { query: `deck:"${deckName}" is:new` });
      limitedNew = newCards.slice(0, remaining);
    }

    const cardIds = [...dueCards, ...limitedNew];
    AnkiState.dueCards = cardIds;
    AnkiState.totalCards = cardIds.length;
    AnkiState.reviewedCount = 0;
    ankiSaveSession();

    const newCount = limitedNew.length;
    const reviewCount = dueCards.length;
    const limitNote = newCount > 0 ? ` + ${newCount} new (${newSeenToday}/${newLimit} today)` : '';
    document.getElementById('ankiDueCount').textContent = `${reviewCount} review${limitNote}`;
    document.getElementById('ankiReviewedCount').textContent = '0';
    document.getElementById('ankiRemainingCount').textContent = cardIds.length;
    
    if (cardIds.length > 0) {
      document.getElementById('ankiReviewCard').style.display = 'block';
      document.getElementById('ankiEmpty').style.display = 'none';
      await ankiShowNextCard();
    } else {
      document.getElementById('ankiReviewCard').style.display = 'none';
      document.getElementById('ankiEmpty').style.display = 'block';
    }
  } catch (e) {
    console.error('Failed to load deck:', e);
  }
}

async function ankiShowNextCard() {
  if (AnkiState.dueCards.length === 0) {
    document.getElementById('ankiReviewCard').style.display = 'none';
    document.getElementById('ankiEmpty').style.display = 'block';
    return;
  }
  
  const cardId = AnkiState.dueCards[0];
  
  try {
    const cardInfo = await ankiInvoke('cardsInfo', { cards: [cardId] });
    if (!cardInfo || cardInfo.length === 0) {
      AnkiState.dueCards.shift();
      return ankiShowNextCard();
    }
    
    AnkiState.currentCard = cardInfo[0];
    
    // Parse card fields - try common field names
    const fields = AnkiState.currentCard.fields;
    let front = '', back = '';
    
    // Try to find front/back from common field names
    // Covers: Basic, Core, Kaishi, Jalup, RTK, custom decks
    const frontFields = [
      'Front', 'Expression', 'Vocabulary-Kanji', 'Question', 'Word', 'Japanese', 'Kanji',
      'VocabKanji', 'Vocab', 'Target', 'JP', 'Term'
    ];
    const backFields = [
      'Back', 'Meaning', 'Vocabulary-English', 'Answer', 'English', 'Reading', 'Definition',
      'VocabEnglish', 'Gloss', 'Translation', 'EN', 'Explanation'
    ];

    for (const f of frontFields) {
      if (fields[f]?.value) { front = fields[f].value; break; }
    }

    // For the back: Kaishi-style decks have 'Word Meaning' + 'Sentence' + 'Sentence Meaning'
    // Build a richer back from whatever meaning/reading/sentence fields exist
    const backParts = [];

    // Primary meaning
    for (const f of backFields) {
      if (fields[f]?.value) { backParts.push(fields[f].value); break; }
    }
    // Word reading (e.g. 'Word Reading', 'Reading', 'Kana')
    const readingField = ['Word Reading', 'Kana', 'Hiragana', 'Reading'].find(f => fields[f]?.value);
    if (readingField && fields[readingField].value !== front) backParts.push(fields[readingField].value);
    // Example sentence
    const sentField = ['Sentence', 'Example', 'Example Sentence', 'SentenceJapanese'].find(f => fields[f]?.value);
    if (sentField) backParts.push(fields[sentField].value);
    // Sentence meaning
    const sentMeanField = ['Sentence Meaning', 'SentenceEnglish', 'Example Translation'].find(f => fields[f]?.value);
    if (sentMeanField) backParts.push(fields[sentMeanField].value);
    // Notes
    const notesField = ['Notes', 'Note', 'Comment'].find(f => fields[f]?.value);
    if (notesField) backParts.push(fields[notesField].value);

    if (backParts.length > 0) {
      back = backParts.join('\n');
    }

    // Fallback: use first two fields if still empty
    if (!front || !back) {
      const fieldNames = Object.keys(fields);
      if (!front && fieldNames.length > 0) front = fields[fieldNames[0]].value;
      if (!back  && fieldNames.length > 1) back  = fields[fieldNames[1]].value;
    }
    
    // Extract audio filenames from ALL fields before stripping HTML
    // Anki stores audio as [sound:filename.mp3] in field values
    const allFieldValues = Object.values(fields).map(f => f.value).join(' ');
    const audioMatches = [...allFieldValues.matchAll(/\[sound:([^\]]+)\]/g)];
    AnkiState.audioFiles = audioMatches.map(m => m[1]);

    // Helper: strip HTML and [sound:...] markers cleanly
    function ankiStripField(html) {
      return html
        .replace(/\[sound:[^\]]+\]/g, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<div>/gi, '\n').replace(/<\/div>/gi, '')
        .replace(/<p>/gi, '\n').replace(/<\/p>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    front = ankiStripField(front);
    back  = ankiStripField(back);

    // Store both sides
    AnkiState.cardFrontText = front;
    AnkiState.cardBackText = back;
    
    // Display based on direction
    ankiRenderCard();
    
    document.getElementById('ankiCardBack').style.display = 'none';
    document.getElementById('ankiShowBtn').style.display = 'block';
    document.getElementById('ankiRatingBtns').style.display = 'none';
    
    document.getElementById('ankiRemainingCount').textContent = Math.max(0, AnkiState.totalCards - AnkiState.reviewedCount);
  } catch (e) {
    console.error('Failed to load card:', e);
  }
}

function ankiRenderCard() {
  const frontEl = document.getElementById('ankiCardFront');
  const backEl = document.getElementById('ankiCardBack');
  const audioEl = document.getElementById('ankiAudioBar');

  if (AnkiState.direction === 'jp-en') {
    frontEl.innerHTML = AnkiState.cardFrontText.replace(/\n/g, '<br>');
    backEl.innerHTML = AnkiState.cardBackText.replace(/\n/g, '<br>');
  } else {
    frontEl.innerHTML = AnkiState.cardBackText.replace(/\n/g, '<br>');
    backEl.innerHTML = AnkiState.cardFrontText.replace(/\n/g, '<br>');
  }

  // Render audio bar if there are sound files
  if (audioEl) {
    if (AnkiState.audioFiles.length > 0) {
      audioEl.innerHTML = AnkiState.audioFiles.map((f, i) =>
        `<button class="btn-ghost" onclick="ankiPlayAudio(${i})">🔊 ${AnkiState.audioFiles.length > 1 ? i+1 : ''}</button>`
      ).join('');
      audioEl.style.display = 'flex';
    } else {
      audioEl.style.display = 'none';
    }
  }
}

async function ankiPlayAudio(idx) {
  const filename = AnkiState.audioFiles[idx];
  if (!filename) return;
  try {
    // AnkiConnect retrieveMediaFile returns base64-encoded file content
    const b64 = await ankiInvoke('retrieveMediaFile', { filename });
    if (!b64) throw new Error('empty');
    // Detect format from extension, default to mp3
    const ext = filename.split('.').pop().toLowerCase();
    const mime = ext === 'ogg' ? 'audio/ogg' : ext === 'wav' ? 'audio/wav' : 'audio/mpeg';
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play();
  } catch (e) {
    // Fallback to TTS on the Japanese side
    const jpText = AnkiState.direction === 'jp-en' ? AnkiState.cardFrontText : AnkiState.cardBackText;
    jpSpeak(jpText);
  }
}

function ankiToggleDirection() {
  AnkiState.direction = AnkiState.direction === 'jp-en' ? 'en-jp' : 'jp-en';
  const btn = document.getElementById('ankiDirBtn');
  btn.textContent = AnkiState.direction === 'jp-en' ? 'JP → EN' : 'EN → JP';
  btn.classList.toggle('toggle-on', AnkiState.direction !== 'jp-en');
  
  // Re-render current card if one is showing
  if (AnkiState.currentCard) {
    ankiRenderCard();
    // Hide back again
    document.getElementById('ankiCardBack').style.display = 'none';
    document.getElementById('ankiShowBtn').style.display = 'block';
    document.getElementById('ankiRatingBtns').style.display = 'none';
  }
}

function ankiSpeakFront() {
  // Speak the Japanese side (which depends on direction)
  const jpText = AnkiState.direction === 'jp-en' ? AnkiState.cardFrontText : AnkiState.cardBackText;
  jpSpeak(jpText);
}

function ankiShowAnswer() {
  document.getElementById('ankiCardBack').style.display = 'block';
  document.getElementById('ankiShowBtn').style.display = 'none';
  document.getElementById('ankiRatingBtns').style.display = 'flex';
}

async function ankiAnswer(ease) {
  // ease: 1=Again, 2=Hard, 3=Good, 4=Easy
  if (!AnkiState.currentCard) return;

  try {
    await ankiInvoke('answerCards', {
      answers: [{
        cardId: AnkiState.currentCard.cardId,
        ease: ease
      }]
    });

    // Consolidation tracking: count Easy (4) ratings per card
    if (ease === 4) {
      const cardId = String(AnkiState.currentCard.cardId);
      const easyCounts = (App.Storage || window.Storage).getJSON(STORAGE_KEYS.ANKI_EASY_COUNTS, {});
      easyCounts[cardId] = (easyCounts[cardId] || 0) + 1;
      (App.Storage || window.Storage).setJSON(STORAGE_KEYS.ANKI_EASY_COUNTS, easyCounts);

      // At 5× Easy: record the Japanese word in corpus as anki-consolidated
      if (easyCounts[cardId] === 5) {
        const jpWord = AnkiState.cardFrontText.split('\n')[0].trim();
        if (jpWord) {
          kanjiCorpusRecordLookup(jpWord, 'anki-easy×5');
          // Show a brief consolidation badge on the card area
          const badge = document.createElement('div');
          badge.textContent = '⭐ Consolidated!';
          badge.style.cssText = 'text-align:center;font-family:var(--ui);font-size:0.82rem;color:var(--teal);margin-bottom:8px;animation:fadeIn 0.4s';
          const cardArea = document.getElementById('ankiReviewCard');
          if (cardArea) { cardArea.prepend(badge); setTimeout(() => badge.remove(), 2000); }
        }
      }
    }

    const answeredId = AnkiState.dueCards.shift();
    // If rated Again, Anki re-queues the card — mirror that locally
    if (ease === 1 && answeredId !== undefined) {
      AnkiState.dueCards.push(answeredId);
    } else {
      AnkiState.reviewedCount++;
      drillLastCompletedWrite('anki');
      document.getElementById('ankiReviewedCount').textContent = AnkiState.reviewedCount;
    }
    document.getElementById('ankiRemainingCount').textContent = Math.max(0, AnkiState.totalCards - AnkiState.reviewedCount);
    ankiSaveSession();

    await ankiShowNextCard();
  } catch (e) {
    console.error('Failed to answer card:', e);
    alert('Failed to sync with Anki: ' + e.message);
  }
}

window['ankiConnect'] = ankiConnect;
window['ankiLoadDeck'] = ankiLoadDeck;
window['ankiShowAnswer'] = ankiShowAnswer;
window['ankiAnswer'] = ankiAnswer;
window['ankiToggleDirection'] = ankiToggleDirection;


// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, {
    AnkiState,
    ankiTodayKey,
    ankiSaveSession,
    ankiLoadSession,
    ankiRenderCard,
    ankiToggleDirection,
    ankiSpeakFront,
    ankiShowAnswer,
  });
  window['ankiConnect']        = ankiConnect;
  window['ankiPlayAudio']      = ankiPlayAudio;
  window['ankiLoadDeck']       = ankiLoadDeck;
  window['ankiShowAnswer']     = ankiShowAnswer;
  window['ankiAnswer']         = ankiAnswer;
  window['ankiToggleDirection']= ankiToggleDirection;
  window['ankiSpeakFront']     = ankiSpeakFront;
} catch(e) { console.error('[core-anki] App registry failed:', e); }
