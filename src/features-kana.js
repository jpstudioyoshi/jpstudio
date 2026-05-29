// ═══════════════════════════════════════════════════════
// FEATURES-KANA
// Romaji→kana conversion, mode switching, kanji picker,
// kana toolbar. Used by all Japanese text inputs.
// ═══════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════
// KANA INPUT MODULE
// Romaji→kana conversion, mode switching, kanji conversion.
// All Japanese inputs use kanaSetMode() and kanaToolbar().
// ═══════════════════════════════════════════════════════


// _kanaLastMode declared in core.js — shared across all kana inputs
// ── Romaji → Kana converter (zero dependencies, works everywhere) ───────────
const ROMAJI_MAP = (function() {
  const m = {};
  const pairs = [
    // Special — nn or n' for ん; lone n is NEVER converted (type nn)
    ['nn', 'ん'], ["n'", 'ん'],
    // Double consonant → っ + remainder handled in loop
    // Vowels
    ['a','あ'],['i','い'],['u','う'],['e','え'],['o','お'],
    // K
    ['ka','か'],['ki','き'],['ku','く'],['ke','け'],['ko','こ'],
    ['kya','きゃ'],['kyu','きゅ'],['kyo','きょ'],
    // S
    ['sa','さ'],['shi','し'],['si','し'],['su','す'],['se','せ'],['so','そ'],
    ['sha','しゃ'],['shu','しゅ'],['sho','しょ'],
    ['sya','しゃ'],['syu','しゅ'],['syo','しょ'],
    // T
    ['ta','た'],['chi','ち'],['ti','ち'],['tsu','つ'],['tu','つ'],['te','て'],['to','と'],
    ['cha','ちゃ'],['chu','ちゅ'],['cho','ちょ'],
    ['cya','ちゃ'],['cyu','ちゅ'],['cyo','ちょ'],
    ['tya','ちゃ'],['tyu','ちゅ'],['tyo','ちょ'],
    // N row
    ['na','な'],['ni','に'],['nu','ぬ'],['ne','ね'],['no','の'],
    ['nya','にゃ'],['nyu','にゅ'],['nyo','にょ'],
    // H
    ['ha','は'],['hi','ひ'],['fu','ふ'],['hu','ふ'],['he','へ'],['ho','ほ'],
    ['hya','ひゃ'],['hyu','ひゅ'],['hyo','ひょ'],
    // M
    ['ma','ま'],['mi','み'],['mu','む'],['me','め'],['mo','も'],
    ['mya','みゃ'],['myu','みゅ'],['myo','みょ'],
    // Y
    ['ya','や'],['yu','ゆ'],['yo','よ'],
    // R
    ['ra','ら'],['ri','り'],['ru','る'],['re','れ'],['ro','ろ'],
    ['rya','りゃ'],['ryu','りゅ'],['ryo','りょ'],
    // W
    ['wa','わ'],['wi','ゐ'],['we','ゑ'],['wo','を'],
    // G
    ['ga','が'],['gi','ぎ'],['gu','ぐ'],['ge','げ'],['go','ご'],
    ['gya','ぎゃ'],['gyu','ぎゅ'],['gyo','ぎょ'],
    // Z
    ['za','ざ'],['ji','じ'],['zi','じ'],['zu','ず'],['ze','ぜ'],['zo','ぞ'],
    ['ja','じゃ'],['ju','じゅ'],['jo','じょ'],
    ['jya','じゃ'],['jyu','じゅ'],['jyo','じょ'],
    ['zya','じゃ'],['zyu','じゅ'],['zyo','じょ'],
    // D
    ['da','だ'],['di','ぢ'],['du','づ'],['de','で'],['do','ど'],
    ['dya','ぢゃ'],['dyu','ぢゅ'],['dyo','ぢょ'],
    // B
    ['ba','ば'],['bi','び'],['bu','ぶ'],['be','べ'],['bo','ぼ'],
    ['bya','びゃ'],['byu','びゅ'],['byo','びょ'],
    // P
    ['pa','ぱ'],['pi','ぴ'],['pu','ぷ'],['pe','ぺ'],['po','ぽ'],
    ['pya','ぴゃ'],['pyu','ぴゅ'],['pyo','ぴょ'],
    // Punctuation
    ['-','ー'],['.','。'],[',','、'],['?','？'],['!','！'],
  ];
  pairs.forEach(([r,k]) => m[r] = k);
  return m;
})();

function romajiToKatakana(str) {
  // Convert via hiragana then shift codepoints +96 (0x60) to katakana
  const hira = romajiToHiragana(str);
  return hira.split('').map(ch => {
    const code = ch.charCodeAt(0);
    // Hiragana block: 0x3041–0x3096 → Katakana: 0x30A1–0x30F6
    if (code >= 0x3041 && code <= 0x3096) return String.fromCharCode(code + 0x60);
    return ch; // leave ー and anything else unchanged
  }).join('');
}

function vgSetupInput() {
  // Attach correct romaji→kana converter based on current target
  const inp = document.getElementById('vg-input');
  if (!inp) return;
  // Remove previous handler
  inp.removeEventListener('input', inp._vgKanaHandler);
  const target = VehicleGameState.targets[VehicleGameState.current];
  if (!target) return;
  // Check if answer expects katakana (contains katakana chars)
  const needsKatakana = /[゠-ヿ]/.test(target.jp);
  inp._vgKanaHandler = function() {
    const pos = inp.selectionStart;
    const raw = inp.value;
    const converted = needsKatakana ? romajiToKatakana(raw) : romajiToHiragana(raw);
    if (converted !== raw) {
      inp.value = converted;
      const diff = raw.length - converted.length;
      const newPos = Math.max(0, pos - diff);
      inp.setSelectionRange(newPos, newPos);
    }
    // Auto-check after each keystroke
    vgCheckSilent();
  };
  inp.addEventListener('input', inp._vgKanaHandler);
  // Update placeholder to signal mode
  inp.placeholder = needsKatakana ? 'カタカナで…' : 'ひらがなで…';
}

function romajiToHiragana(str) {
  // Only convert contiguous ASCII/romaji segments, leave existing kana untouched
  // This prevents issues when editing in the middle of Japanese text
  let out = '';
  let i = 0;
  const VOWELS = 'aeiou';
  
  while (i < str.length) {
    const ch = str[i];
    const code = ch.charCodeAt(0);
    
    // If this is already Japanese (hiragana, katakana, kanji, punctuation), pass through
    if (code >= 0x3000) {
      out += ch;
      i++;
      continue;
    }
    
    // Collect contiguous romaji segment
    let romajiEnd = i;
    while (romajiEnd < str.length && str.charCodeAt(romajiEnd) < 0x3000) {
      romajiEnd++;
    }
    
    // Convert this romaji segment
    const segment = str.slice(i, romajiEnd).toLowerCase();
    let j = 0;
    while (j < segment.length) {
      const sch = segment[j];
      const after = segment[j+1];
      
      // っ: double consonant (not nn)
      if (sch !== 'n' && after && sch === after && 'bcdfghjklmpqrstvwxyz'.includes(sch)) {
        out += 'っ'; j++; continue;
      }
      
      // ん: only when CLEARLY not part of na/ni/nu/ne/no/nya/nyu/nyo
      if (sch === 'n') {
        if (after === 'n') {
          // nn → ん always
          out += 'ん'; j += 2; continue;
        }
        if (after === "'") {
          // n' → ん
          out += 'ん'; j += 2; continue;
        }
        // If n is at end of segment, or followed by vowel/y, leave as 'n' for now
        if (!after || VOWELS.includes(after) || after === 'y') {
          // Don't convert yet - might be na, ni, nu, ne, no, nya, nyu, nyo
          // Fall through to ROMAJI_MAP lookup
        } else {
          // n followed by consonant (not y, not n) → definitely ん
          out += 'ん'; j++; continue;
        }
      }
      
      // Try longest match first (4 chars down to 1)
      let matched = false;
      for (let len = 4; len >= 1; len--) {
        const chunk = segment.slice(j, j+len);
        if (ROMAJI_MAP[chunk]) {
          out += ROMAJI_MAP[chunk]; j += len; matched = true; break;
        }
      }
      if (!matched) { 
        out += segment[j] === ' ' ? '　' : segment[j]; 
        j++; 
      }
    }
    
    i = romajiEnd;
  }
  return out;
}

// ═══════════════════════════════════════════════════════
// BUTTON GROUP MODULE
// ═══════════════════════════════════════════════════════
// Usage: Add data-btn-toggle="groupName" and data-active-color="var(--teal)" to buttons
// Then call: setButtonGroupActive('groupName', 'activeButtonId')


function kanaInputHandler(e) {
  const el = e.target;
  if (!el._kanaOn) return;
  if (el._skipKanaHandler) return; // Skip when setting value from kanji picker
  if (e.isComposing || el._isComposing) return;
  if (el._isPasting) return; // paste bypass — accept as-is
  
  // If mode is explicitly romaji/null, don't convert
  if (el._kanaMode === null || el._kanaMode === 'romaji') return;
  
  if (el.value.endsWith('+')) {
    el.value = el.value.slice(0, -1);
    const btn = el.parentNode?.querySelector('.kanji-btn[data-el-id="'+el.id+'"]');
    if (btn) kanaToKanji(el, btn);
    return;
  }
  const pos = el.selectionStart;
  const raw = el.value;
  
  // Determine where to start converting - respect mode snapshot
  const snapshotLen = el._modeSnapshot || 0;
  
  // Keep everything before the snapshot as-is
  const preserved = raw.slice(0, snapshotLen);
  const toProcess = raw.slice(snapshotLen);
  
  // Only convert romaji portions in the new text, preserve all existing Japanese characters
  let result = '';
  let i = 0;
  
  while (i < toProcess.length) {
    const ch = toProcess[i];
    const cp = ch.charCodeAt(0);
    
    // If it's already Japanese (hiragana, katakana, kanji, punctuation), keep as-is
    if (cp >= 0x3000) {
      result += ch;
      i++;
      continue;
    }
    
    // Find the extent of the romaji segment
    let romajiEnd = i;
    while (romajiEnd < toProcess.length && toProcess.charCodeAt(romajiEnd) < 0x3000) {
      romajiEnd++;
    }
    
    // Convert this romaji segment
    const romajiSegment = toProcess.slice(i, romajiEnd);
    let converted = romajiToHiragana(romajiSegment);
    
    // If in katakana mode, convert the newly generated kana to katakana
    if (el._kanaMode === 'katakana') {
      converted = hiraganaToKatakana(converted);
    }

    // If converted still ends with unconverted ASCII (partial romaji like 'h', 'sh' etc.)
    // and there's a Japanese character following this segment, update the snapshot
    // so the trailing ASCII gets re-processed with the next keystroke.
    const trailingAscii = converted.match(/[a-z']+$/i);
    if (trailingAscii && romajiEnd < toProcess.length) {
      // Move snapshot forward to just before the trailing ascii so it stays editable
      el._modeSnapshot = (snapshotLen + i + (romajiSegment.length - trailingAscii[0].length));
    }
    
    result += converted;
    i = romajiEnd;
  }
  
  // Combine preserved + converted
  let finalResult = preserved + result;
  
  // Convert quotation marks to Japanese brackets in the new portion only
  let quoteOpen = false;
  // Count existing open quotes in preserved portion + already-converted quotes in result
  const scanBase = preserved + result;
  for (const c of scanBase) {
    if (c === '「') quoteOpen = true;
    if (c === '」') quoteOpen = false;
  }
  result = result.split('').map(c => {
    if (c === '"' || c === '"' || c === '"') {
      quoteOpen = !quoteOpen;
      return quoteOpen ? '「' : '」';
    }
    return c;
  }).join('');
  
  finalResult = preserved + result;
  
  if (finalResult !== raw) {
    el.value = finalResult;
    const diff = raw.length - finalResult.length;
    const newPos = Math.max(0, pos - diff);
    el.setSelectionRange(newPos, newPos);
  }
}

// Helper function to convert hiragana to katakana
function hiraganaToKatakana(str) {
  return str.split('').map(c => {
    const code = c.charCodeAt(0);
    // Only convert hiragana (3041-3096) to katakana
    if (code >= 0x3041 && code <= 0x3096) {
      return String.fromCharCode(code + 0x60);
    }
    return c;
  }).join('');
}

function kanaOn(el) {
  if (!el || el._kanaOn) return;
  el._kanaOn = true;
  // Restore last known mode for this input if available
  if (!el._kanaMode) el._kanaMode = 'hiragana';
  el.addEventListener('input', kanaInputHandler);
  // Note: mode is persisted in _kanaLastMode[el.id] for re-init after DOM recreation
  // Track IME composition to prevent doubling on non-Latin keyboards
  el.addEventListener('compositionstart', () => { 
    el._isComposing = true; 
    el._compositionStart = el.selectionStart;
    el._valueBeforeCompose = el.value;
  });
  el.addEventListener('compositionend', (e) => {
    el._isComposing = false;
    // Only remove the newly composed IME text (between compositionstart position and now)
    // This prevents the romaji converter from double-converting IME input
    // But we DON'T want to clear existing Japanese text that was already in the field
    if (el._compositionStart !== undefined && e.data) {
      // The composed text is in e.data - we need to remove it since our romaji converter handles input
      const start = el._compositionStart;
      const composedLen = e.data.length;
      const before = el.value.slice(0, start);
      const after = el.value.slice(start + composedLen);
      // Only remove if it looks like IME composed Japanese (not our converted kana)
      const composed = el.value.slice(start, start + composedLen);
      // Check if this was actual IME input (contains kanji or mixed) vs our romaji conversion
      const hasKanji = /[一-鿿]/.test(composed);
      if (hasKanji) {
        // Real IME input with kanji - remove it, user should use romaji
        el.value = before + after;
        el.setSelectionRange(start, start);
      }
      // If it's just hiragana/katakana, leave it - could be from our converter or valid paste
    }
    el._compositionStart = undefined;
    el._valueBeforeCompose = undefined;
  });
  // Paste: accept text as-is, never convert
  if (!el._pasteKanaListener) {
    el._pasteKanaListener = true;
    el.addEventListener('paste', function(e) {
      if (!el._kanaOn) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const text = (e.clipboardData || window.clipboardData).getData('text');
      const start = el.selectionStart, end = el.selectionEnd;
      el.value = el.value.slice(0, start) + text + el.value.slice(end);
      const newPos = start + text.length;
      el.setSelectionRange(newPos, newPos);
      // Trigger input event for tile builders etc. but mark as paste so handlers skip conversion
      el._isPasting = true;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el._isPasting = false;
    });
  }
  el.placeholder = el.dataset.placeholderJp || el.placeholder;

  // Focus restoration: when user clicks back into the field, re-apply the current
  // mode and reset _modeSnapshot to cursor position so conversion starts correctly.
  // Guard against re-entry from programmatic focus calls.
  if (!el._kanaFocusListener) {
    el._kanaFocusListener = true;
    el.addEventListener('focus', () => {
      if (!el._kanaOn) return;
      // If a mode switch just set _modeSnapshot, don't reset it.
      // _modeSwitchPending is set by kanaSetMode and cleared after one focus.
      if (el._modeSwitchPending) {
        el._modeSwitchPending = false;
        // Restore caret colour only
        if (el._kanaMode === 'hiragana') el.style.caretColor = 'var(--teal)';
        else if (el._kanaMode === 'katakana') el.style.caretColor = 'var(--gold)';
        return;
      }
      // Normal focus (user clicked in) — reset snapshot to 0 so conversion
      // applies from cursor. Existing Japanese chars are protected by character-type check.
      el._modeSnapshot = 0;
      // Re-apply kana handler in case it was lost
      el.removeEventListener('input', kanaInputHandler);
      el.addEventListener('input', kanaInputHandler);
      // Restore caret colour
      if (el._kanaMode === 'hiragana') el.style.caretColor = 'var(--teal)';
      else if (el._kanaMode === 'katakana') el.style.caretColor = 'var(--gold)';
    });
  }
}

function kanaOff(el) {
  if (!el) return;
  el._kanaOn = false;
  el._kanaMode = null;
  el._isComposing = false;
  el.removeEventListener('input', kanaInputHandler);
  el.style.caretColor = '';
}

function kanaToggle(btn, el) {
  // Cycle: off → hiragana → katakana → off
  if (!el._kanaOn) {
    // Was off → turn on hiragana
    kanaOn(el);
    el._kanaMode = 'hiragana';
    el.style.caretColor = 'var(--teal)';
    btn.classList.add('on');
    btn.innerHTML = 'あ';
    btn.title = 'Hiragana mode (click for katakana)';
    // Move cursor to end of text
    el.setSelectionRange(el.value.length, el.value.length);
  } else if (el._kanaMode === 'hiragana') {
    // Was hiragana → switch to katakana
    el._kanaMode = 'katakana';
    el.style.caretColor = 'var(--gold)';
    btn.classList.add('on');
    btn.style.borderColor = 'var(--gold)';
    btn.style.color = 'var(--gold)';
    btn.innerHTML = 'ア';
    btn.title = 'Katakana mode (click for romaji)';
  } else {
    // Was katakana → turn off
    kanaOff(el);
    btn.classList.remove('on');
    btn.style.borderColor = '';
    btn.style.color = '';
    btn.innerHTML = 'A';
    btn.title = 'Romaji mode (click for hiragana)';
  }
  el.focus();
}

function kanaAddToggle(el, startOn) {
  if (!el) return;
  // Remove existing toggles for this element
  el.parentNode?.querySelectorAll('[data-el-id="'+el.id+'"]').forEach(b => b.remove());

  // For inputs that are always hiragana — enable kana mode without adding toggle buttons
  if (el.id === 'conjInputG' || el.id === 'countAnswer2') {
    if (startOn) kanaOn(el);
    return;
  }

  // A (romaji) button
  const romajiBtn = document.createElement('button');
  romajiBtn.type = 'button';
  romajiBtn.className = 'kana-toggle';
  romajiBtn.dataset.elId = el.id;
  romajiBtn.dataset.mode = 'romaji';
  romajiBtn.title = 'Romaji mode (no conversion)';
  romajiBtn.innerHTML = 'A';
  if (!startOn) romajiBtn.classList.add('on');
  romajiBtn.onclick = () => {
    kanaOff(el);
    romajiBtn.classList.add('on');
    kanaBtn.style.borderColor = '';
    kanaBtn.style.color = '';
    kanaBtn.innerHTML = 'あ';
    el.focus();
  };
  el.parentNode.insertBefore(romajiBtn, el);

  // ひ/ア (kana) toggle button
  const kanaBtn = document.createElement('button');
  kanaBtn.type = 'button';
  kanaBtn.className = 'kana-toggle';
  kanaBtn.dataset.elId = el.id;
  kanaBtn.dataset.mode = 'kana';
  kanaBtn.title = startOn ? 'Hiragana mode (click for katakana)' : 'Click for hiragana mode';
  kanaBtn.innerHTML = startOn ? 'ひ' : 'あ';
  kanaBtn.style.cssText = startOn ? 'border-color:var(--teal);color:var(--teal)' : '';
  kanaBtn.onclick = () => {
    // Deactivate romaji button
    romajiBtn.classList.remove('on');

    // Toggle between hiragana and katakana
    if (!el._kanaOn || el._kanaMode === 'katakana') {
      kanaOn(el);
      el._kanaMode = 'hiragana';
      kanaBtn.innerHTML = 'ひ';
      kanaBtn.style.borderColor = 'var(--teal)';
      kanaBtn.style.color = 'var(--teal)';
      kanaBtn.title = 'Hiragana mode (click for katakana)';
      el.style.caretColor = 'var(--teal)';
    } else {
      el._kanaMode = 'katakana';
      kanaBtn.innerHTML = 'ア';
      kanaBtn.style.borderColor = 'var(--gold)';
      kanaBtn.style.color = 'var(--gold)';
      kanaBtn.title = 'Katakana mode (click for hiragana)';
      el.style.caretColor = 'var(--gold)';
    }
    // Use setTimeout to ensure focus is set after click event completes
    setTimeout(() => {
      el.focus();
      // Move cursor to end of text
      el.setSelectionRange(el.value.length, el.value.length);
    }, 0);
  };
  el.parentNode.insertBefore(kanaBtn, el);

  // 漢字 button
  const kanjiBtn = document.createElement('button');
  kanjiBtn.type = 'button';
  kanjiBtn.className = 'kanji-btn';
  kanjiBtn.dataset.elId = el.id;
  kanjiBtn.title = 'Convert kana to kanji';
  kanjiBtn.innerHTML = '漢字';
  kanjiBtn.onclick = () => kanaToKanji(el, kanjiBtn);
  el.parentNode.insertBefore(kanjiBtn, el);

  if (startOn) {
    kanaOn(el);
    el._kanaMode = 'hiragana';
    el.style.caretColor = 'var(--teal)';
  }
}

function kanjiPickerShow(candidates, el, btn) {
  kajiPickerClose();
  const picker = document.createElement('div');
  picker.className = 'kanji-picker';
  const rect = btn.getBoundingClientRect();
  picker.style.cssText = `position:fixed;top:${rect.bottom+4}px;left:${rect.left}px;outline:none`;

  let focusedIdx = -1;
  const items = [];

  function setFocus(idx) {
    focusedIdx = (idx + items.length) % items.length;
    items.forEach((it, i) => it.classList.toggle('focused', i === focusedIdx));
    items[focusedIdx].scrollIntoView({ block: 'nearest' });
  }

  candidates.forEach(text => {
    const item = document.createElement('div');
    item.className = 'kanji-picker-item';
    item.innerHTML = text;
    item.onmouseenter = () => setFocus(items.indexOf(item));
    item.onclick = () => selectItem(text);
    picker.appendChild(item);
    items.push(item);
  });

  function selectItem(text) {
    el._skipKanaHandler = true; // Skip kana conversion for this update
    const cleanText = text.replace(/<[^>]+>/g,'');
    
    // Replace only the portion that was converted (selection or all)
    // Use !== undefined to handle 0 positions correctly
    const convertStart = el._kanjiConvertStart !== undefined ? el._kanjiConvertStart : 0;
    const convertEnd = el._kanjiConvertEnd !== undefined ? el._kanjiConvertEnd : el.value.length;
    const before = el.value.slice(0, convertStart);
    const after = el.value.slice(convertEnd);
    
    el.value = before + cleanText + after;
    
    // Set cursor after inserted text
    const newPos = before.length + cleanText.length;
    el.setSelectionRange(newPos, newPos);
    
    // Clean up
    delete el._kanjiConvertStart;
    delete el._kanjiConvertEnd;
    delete el._kanjiConvertHasSelection;
    
    kajiPickerClose();
    el.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(() => { el._skipKanaHandler = false; }, 50);
    // If in stroke mode, collapse the input now that a kanji has been chosen
    if (el.id === 'strokeSearchInput') {
      setTimeout(() => strokeCollapseInput(), 60);
    } else {
      setTimeout(() => el.focus(), 10);
    }
  }

  document.body.appendChild(picker);
  picker._elId = el.id;

  // Highlight first item
  setTimeout(() => setFocus(0), 0);

  // Global capture handler — intercepts BEFORE browser native behaviour (Mac ArrowDown)
  function docGuard(e) {
    const p = document.querySelector('.kanji-picker');
    if (!p) { document.removeEventListener('keydown', docGuard, true); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault(); e.stopImmediatePropagation();
      setFocus(focusedIdx < 0 ? 0 : focusedIdx + 1);
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault(); e.stopImmediatePropagation();
      setFocus(focusedIdx <= 0 ? items.length - 1 : focusedIdx - 1);
    }
    if (e.key === 'Enter') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (focusedIdx >= 0) selectItem(candidates[focusedIdx]);
    }
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation();
      kajiPickerClose(); el.focus();
    }
  }
  document.addEventListener('keydown', docGuard, true);
  picker._docGuard = docGuard;

  // Close on outside click
  setTimeout(() => document.addEventListener('click', function h(e) {
    if (!picker.contains(e.target) && e.target !== btn) {
      kajiPickerClose();
      document.removeEventListener('click', h);
    }
  }), 0);
}

function kajiPickerClose() {
  document.querySelectorAll('.kanji-picker').forEach(p => {
    if (p._docGuard) document.removeEventListener('keydown', p._docGuard, true);
    p.remove();
  });
}

// Common kana-to-kanji conversions (instant, no API needed)
const _kanaToKanjiLocal = {
  // Pronouns
  'わたし': ['私', 'わたし'], 'わたくし': ['私', 'わたくし'], 'ぼく': ['僕', 'ボク'], 'おれ': ['俺'],
  'あなた': ['あなた', '貴方'], 'かれ': ['彼'], 'かのじょ': ['彼女'], 'かれら': ['彼ら'],
  'わたしたち': ['私たち', '私達'], 'ぼくたち': ['僕たち', '僕達'], 'みんな': ['皆', 'みんな'],
  
  // Common verbs (dictionary form)
  'たべる': ['食べる'], 'のむ': ['飲む'], 'みる': ['見る', '観る'], 'きく': ['聞く', '聴く'],
  'いく': ['行く'], 'くる': ['来る'], 'かえる': ['帰る', '返る', '変える'], 'する': ['する'],
  'ある': ['ある', '有る'], 'いる': ['いる', '居る'], 'なる': ['なる', '成る'],
  'いう': ['言う'], 'おもう': ['思う'], 'かく': ['書く', '描く'], 'よむ': ['読む'],
  'はなす': ['話す', '離す'], 'きる': ['切る', '着る'], 'あう': ['会う', '合う'],
  'まつ': ['待つ'], 'もつ': ['持つ'], 'わかる': ['分かる', '判る'], 'しる': ['知る'],
  'かう': ['買う'], 'うる': ['売る'], 'つくる': ['作る', '造る'], 'あそぶ': ['遊ぶ'],
  'やすむ': ['休む'], 'ねる': ['寝る'], 'おきる': ['起きる'], 'あるく': ['歩く'],
  'はしる': ['走る'], 'およぐ': ['泳ぐ'], 'とぶ': ['飛ぶ', '跳ぶ'], 'のる': ['乗る'],
  'おりる': ['降りる', '下りる'], 'はいる': ['入る'], 'でる': ['出る'],
  'あける': ['開ける', '空ける'], 'しめる': ['閉める', '締める'], 'つける': ['付ける', '着ける'],
  'けす': ['消す'], 'おしえる': ['教える'], 'ならう': ['習う'], 'べんきょうする': ['勉強する'],
  
  // Common verbs (masu form)
  'たべます': ['食べます'], 'のみます': ['飲みます'], 'みます': ['見ます', '観ます'],
  'ききます': ['聞きます', '聴きます'], 'いきます': ['行きます'], 'きます': ['来ます', '着ます'],
  'かえります': ['帰ります'], 'します': ['します'], 'あります': ['あります'],
  'います': ['います'], 'いいます': ['言います'], 'おもいます': ['思います'],
  'かきます': ['書きます'], 'よみます': ['読みます'], 'はなします': ['話します'],
  'あいます': ['会います'], 'まちます': ['待ちます'], 'もちます': ['持ちます'],
  'わかります': ['分かります'], 'しります': ['知ります'], 'かいます': ['買います'],
  
  // Te-form
  'たべて': ['食べて'], 'のんで': ['飲んで'], 'みて': ['見て', '観て'], 'きいて': ['聞いて', '聴いて'],
  'いって': ['行って', '言って'], 'きて': ['来て', '着て'], 'かえって': ['帰って'],
  'して': ['して'], 'あって': ['あって', '会って'], 'かいて': ['書いて', '買いて'],
  'よんで': ['読んで'], 'はなして': ['話して'], 'まって': ['待って'], 'もって': ['持って'],
  
  // Ta-form (past)
  'たべた': ['食べた'], 'のんだ': ['飲んだ'], 'みた': ['見た', '観た'], 'きいた': ['聞いた'],
  'いった': ['行った', '言った'], 'きた': ['来た', '着た'], 'かえった': ['帰った'],
  'した': ['した'], 'あった': ['あった', '会った'], 'かいた': ['書いた'],
  'よんだ': ['読んだ'], 'はなした': ['話した'], 'まった': ['待った'], 'もった': ['持った'],
  
  // Negative
  'たべない': ['食べない'], 'のまない': ['飲まない'], 'みない': ['見ない'],
  'いかない': ['行かない'], 'こない': ['来ない'], 'しない': ['しない'],
  
  // Common adjectives
  'おおきい': ['大きい'], 'ちいさい': ['小さい'], 'たかい': ['高い'], 'やすい': ['安い', '易い'],
  'ながい': ['長い'], 'みじかい': ['短い'], 'あたらしい': ['新しい'], 'ふるい': ['古い'],
  'いい': ['いい', '良い'], 'わるい': ['悪い'], 'おいしい': ['美味しい'],
  'たのしい': ['楽しい'], 'うれしい': ['嬉しい'], 'かなしい': ['悲しい'],
  'あつい': ['暑い', '熱い', '厚い'], 'さむい': ['寒い'], 'あたたかい': ['暖かい', '温かい'],
  'すずしい': ['涼しい'], 'むずかしい': ['難しい'], 'やさしい': ['優しい', '易しい'],
  'つよい': ['強い'], 'よわい': ['弱い'], 'はやい': ['早い', '速い'], 'おそい': ['遅い', '遅い'],
  'ひろい': ['広い'], 'せまい': ['狭い'], 'おもい': ['重い'], 'かるい': ['軽い'],
  'あかるい': ['明るい'], 'くらい': ['暗い'], 'しろい': ['白い'], 'くろい': ['黒い'],
  'あかい': ['赤い'], 'あおい': ['青い'], 'きいろい': ['黄色い'],
  
  // Na-adjectives
  'げんき': ['元気'], 'しずか': ['静か'], 'にぎやか': ['賑やか'], 'きれい': ['綺麗', 'きれい'],
  'ゆうめい': ['有名'], 'べんり': ['便利'], 'ふべん': ['不便'], 'たいへん': ['大変'],
  'だいじょうぶ': ['大丈夫'], 'すき': ['好き'], 'きらい': ['嫌い'], 'じょうず': ['上手'],
  'へた': ['下手'], 'ひま': ['暇'], 'いそがしい': ['忙しい'],
  
  // Time words
  'いま': ['今'], 'きょう': ['今日'], 'あした': ['明日'], 'きのう': ['昨日'],
  'あさって': ['明後日'], 'おととい': ['一昨日'], 'まいにち': ['毎日'], 'まいあさ': ['毎朝'],
  'まいばん': ['毎晩'], 'まいしゅう': ['毎週'], 'まいつき': ['毎月'], 'まいとし': ['毎年'],
  'こんしゅう': ['今週'], 'らいしゅう': ['来週'], 'せんしゅう': ['先週'],
  'こんげつ': ['今月'], 'らいげつ': ['来月'], 'せんげつ': ['先月'],
  'ことし': ['今年'], 'らいねん': ['来年'], 'きょねん': ['去年'],
  'あさ': ['朝'], 'ひる': ['昼'], 'よる': ['夜'], 'ばん': ['晩'], 'ゆうがた': ['夕方'],
  'ごぜん': ['午前'], 'ごご': ['午後'],
  
  // Numbers
  'いち': ['一'], 'に': ['二'], 'さん': ['三'], 'よん': ['四'], 'し': ['四'], 'ご': ['五'],
  'ろく': ['六'], 'なな': ['七'], 'しち': ['七'], 'はち': ['八'], 'きゅう': ['九'], 'く': ['九'],
  'じゅう': ['十'], 'ひゃく': ['百'], 'せん': ['千'], 'まん': ['万'],
  
  // Common nouns
  'ひと': ['人'], 'こども': ['子供', '子ども'], 'おとな': ['大人'], 'おとこ': ['男'],
  'おんな': ['女'], 'ともだち': ['友達', '友だち'], 'かぞく': ['家族'], 'りょうしん': ['両親'],
  'ちち': ['父'], 'はは': ['母'], 'あに': ['兄'], 'あね': ['姉'], 'おとうと': ['弟'], 'いもうと': ['妹'],
  'おとうさん': ['お父さん'], 'おかあさん': ['お母さん'], 'おにいさん': ['お兄さん'], 'おねえさん': ['お姉さん'],
  'せんせい': ['先生'], 'がくせい': ['学生'], 'しごと': ['仕事'], 'かいしゃ': ['会社'],
  'がっこう': ['学校'], 'だいがく': ['大学'], 'びょういん': ['病院'], 'えき': ['駅'],
  'みせ': ['店'], 'うち': ['家', 'うち'], 'いえ': ['家'], 'へや': ['部屋'], 'まち': ['町', '街'],
  'くに': ['国'], 'にほん': ['日本'], 'にほんご': ['日本語'], 'えいご': ['英語'],
  'ごはん': ['ご飯'], 'みず': ['水'], 'おちゃ': ['お茶'], 'さけ': ['酒'], 'にく': ['肉'],
  'さかな': ['魚'], 'やさい': ['野菜'], 'くだもの': ['果物'],
  'でんしゃ': ['電車'], 'くるま': ['車'], 'ひこうき': ['飛行機'], 'ふね': ['船'],
  'ほん': ['本'], 'しんぶん': ['新聞'], 'ざっし': ['雑誌'], 'てがみ': ['手紙'],
  'でんわ': ['電話'], 'おかね': ['お金'], 'じかん': ['時間'],
  'てんき': ['天気'], 'あめ': ['雨'], 'ゆき': ['雪'], 'かぜ': ['風'],
  'やま': ['山'], 'かわ': ['川'], 'うみ': ['海'], 'そら': ['空'],
  'め': ['目'], 'みみ': ['耳'], 'くち': ['口'], 'はな': ['花', '鼻'], 'て': ['手'], 'あし': ['足'],
  'あたま': ['頭'], 'かお': ['顔'], 'からだ': ['体'],
  
  // Common expressions
  'ください': ['下さい', 'ください'], 'おねがいします': ['お願いします'],
  'ありがとう': ['ありがとう', '有難う'], 'すみません': ['すみません'],
  'おはよう': ['おはよう'], 'こんにちは': ['こんにちは'], 'こんばんは': ['こんばんは'],
  'さようなら': ['さようなら'], 'いただきます': ['いただきます', '頂きます'],
  'ごちそうさま': ['ご馳走様', 'ごちそうさま'],
  
  // Question words
  'なに': ['何'], 'なん': ['何'], 'だれ': ['誰'], 'どこ': ['どこ', '何処'],
  'いつ': ['いつ', '何時'], 'どう': ['どう'], 'なぜ': ['なぜ', '何故'], 'どうして': ['どうして'],
  'いくつ': ['いくつ', '幾つ'], 'いくら': ['いくら', '幾ら'],
  
  // Particles and common words often typed
  'です': ['です'], 'ます': ['ます'], 'ません': ['ません'], 'でした': ['でした'],
  'ました': ['ました'], 'ている': ['ている', 'て居る'], 'てる': ['てる'],
  'ことができる': ['ことができる', '事ができる'], 'ようにする': ['ようにする'],
  'たい': ['たい'], 'ほしい': ['欲しい'], 'ために': ['ために', '為に'],
};

async function kanaToKanji(el, btn) {
  // If picker already open, close it
  if (document.querySelector('.kanji-picker')) { kajiPickerClose(); return; }
  
  // Get selection or text to the LEFT of cursor
  const start = el.selectionStart || 0;
  const end = el.selectionEnd || 0;
  const hasSelection = start !== end;
  
  let kana, convertStart, convertEnd;
  if (hasSelection) {
    // Convert selected text
    kana = el.value.slice(start, end).trim();
    convertStart = start;
    convertEnd = end;
  } else {
    // Convert text to the LEFT of cursor (or all if cursor at end)
    // Find the start of convertible text (skip any existing kanji/punctuation at start)
    const leftText = el.value.slice(0, start);
    // Find last chunk of kana/romaji (stop at kanji or major punctuation)
    const match = leftText.match(/[ぁ-んァ-ヶa-zA-Zー]+$/);
    if (match) {
      kana = match[0];
      convertStart = start - match[0].length;
      convertEnd = start;
    } else {
      // No convertible text to the left, convert everything left of cursor
      kana = leftText.trim();
      convertStart = 0;
      convertEnd = start;
    }
  }
  
  if (!kana) return;
  
  // Store selection info for the picker
  el._kanjiConvertStart = convertStart;
  el._kanjiConvertEnd = convertEnd;
  el._kanjiConvertHasSelection = hasSelection;
  
  // Check local cache first (instant, no API needed)
  const localResult = _kanaToKanjiLocal[kana];
  if (localResult && localResult.length) {
    kanjiPickerShow(localResult, el, btn);
    return;
  }
  
  // Fall back to API for unknown words
  const apiKey = (App.getApiKey || window.getApiKey)?.();
  if (!apiKey) { alert('No API key set — open ⚙ settings first.'); return; }
  btn.classList.add('loading');
  btn.innerHTML = '…';
  
  try {
    const data = await (App.claudeAPI || window.claudeAPI)({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        messages: [{ role: 'user', content: `Convert this Japanese text to use appropriate kanji. Give 3-4 different conversion options.

CRITICAL RULES:
1. NEVER convert particles to kanji: は、が、を、に、で、と、の、へ、も、か、や、から、まで、より、ね、よ、わ、けど、けれど、し、て、で、ば
2. NEVER convert grammatical endings: ます、です、ない、たい、ている、ました、ません、だった、った、って、ちゃう、ちゃった
3. NEVER convert auxiliary verbs: いる、ある、くる、いく、みる、おく、しまう
4. ONLY convert content words: nouns, verb STEMS, i-adjectives, na-adjectives
5. Keep word boundaries clear — don't merge a particle into the preceding word's kanji

Example: たべにいきます → 食べに行きます (に stays hiragana, not 食べ似)
Example: わたしはにほんごをべんきょうします → 私は日本語を勉強します

Return ONLY a JSON array of strings: ["option1","option2","option3"]

Text: ${kana}` }]
    ,
      track: 'writing'
    });
    const raw = (data.content?.[0]?.text || '').trim();
    let candidates;
    try {
      candidates = JSON.parse(raw.replace(/```json|```/g,'').trim());
    } catch(e) {
      // Try extracting array from anywhere in the response
      const m = raw.match(/\[.*?\]/s);
      try { candidates = m ? JSON.parse(m[0]) : []; } catch(e2) { candidates = []; }
    }
    if (candidates && candidates.length) {
      kanjiPickerShow(candidates, el, btn);
    }
  } catch(e) {
    console.error('Kanji conversion error:', e);
  } finally {
    btn.classList.remove('loading');
    btn.innerHTML = '漢字';
  }
}

// ── Unified mode setter ─────────────────────────────────────────────────────
function kanaSetMode(inputId, mode, btnGroupId, btnIds) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  // Use cursor position as snapshot — preserves text before cursor, converts after
  inp._modeSnapshot = (inp.selectionStart != null) ? inp.selectionStart : inp.value.length;
  inp._modeSwitchPending = true; // prevents focus listener from resetting _modeSnapshot
  if (inputId) _kanaLastMode[inputId] = mode;
  if (btnGroupId) {
    const ids    = btnIds || {};
    const active = mode === 'romaji' ? ids.romaji : mode === 'hiragana' ? ids.hira : ids.kata;
    if (active) setButtonGroupActive(btnGroupId, active);
  }
  if (mode === 'romaji') {
    kanaOff(inp); inp._kanaMode = 'romaji'; inp.style.caretColor = '';
  } else if (mode === 'hiragana') {
    kanaOff(inp); kanaOn(inp); inp._kanaMode = 'hiragana'; inp.style.caretColor = 'var(--teal)';
  } else if (mode === 'katakana') {
    kanaOff(inp); kanaOn(inp); inp._kanaMode = 'katakana'; inp.style.caretColor = 'var(--gold)';
  }
  // NOTE: no inp.focus() here — callers focus the input themselves if needed.
  // Calling focus() here triggers the focus listener which calls kanaSetMode again → loop.
}

// ── Unified kana toolbar ─────────────────────────────────────────────────────
// Single entry point for any Japanese text input.
// Generates: [A] [ひ] [カ] [漢字] buttons, consistently named and styled.
//
// Usage:
//   kanaToolbar('myInputId')
//   kanaToolbar('myInputId', { defaultMode: 'romaji', noKanji: true })
//
// opts:
//   defaultMode  'hiragana' (default) | 'romaji' | 'katakana'
//   noKanji      true → omit 漢字 button
//   btnClass     CSS class for buttons (default: 'btn-kana')
//
// Button IDs follow the convention: inputId + 'RomajiBtn' / 'HiraBtn' /
// 'KataBtn' / 'KanjiBtn' — so all existing kanaSetMode shims keep working.
//
// Placement: inserts into [data-kana-for="inputId"] if present in the DOM,
// otherwise inserts immediately before the input element.
//
// Guards against double-init: safe to call on every panel render.

function kanaToolbar(inputId, opts = {}) {
  const inp = document.getElementById(inputId);
  if (!inp) return;

  // Remove any existing toolbar for this input before rebuilding
  const existing = document.querySelector(`[data-kana-toolbar="${inputId}"]`);
  if (existing) existing.remove();
  delete inp._kanaToolbar;

  const mode    = opts.defaultMode || 'hiragana';
  const cls     = opts.btnClass    || 'btn-kana';
  const grp     = inputId + 'Kana';
  const btnIds  = { romaji: inputId+'RomajiBtn', hira: inputId+'HiraBtn', kata: inputId+'KataBtn' };

  const wrap = document.createElement('span');
  wrap.dataset.kanaToolbar = inputId;
  wrap.style.cssText = 'display:inline-flex;gap:4px;align-items:center';

  function mkBtn(id, label, title, activeColor) {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = id;
    b.className = cls;
    b.title = title;
    b.textContent = label;
    b.setAttribute('data-btn-toggle', grp);
    if (activeColor) b.dataset.activeColor = activeColor;
    b.onclick = () => {
      kanaSetMode(inputId, _modeForId(id, inputId), grp, btnIds);
      inp.focus();
    };
    b.ondblclick = (e) => {
      e.preventDefault();
      const m = _modeForId(id, inputId);
      kanaSetMode(inputId, m, grp, btnIds);
      inp.focus();
      const key = 'kana_default:' + inputId;
      if (window.kvAPI) window.kvAPI.set(key, m);
      // brief visual flash to confirm
      b.style.outline = '2px solid var(--teal)';
      setTimeout(() => b.style.outline = '', 600);
    };
    return b;
  }

  function _modeForId(id, inputId) {
    if (id === inputId+'RomajiBtn') return 'romaji';
    if (id === inputId+'HiraBtn')   return 'hiragana';
    if (id === inputId+'KataBtn')   return 'katakana';
    return 'romaji';
  }

  wrap.appendChild(mkBtn(inputId+'RomajiBtn', 'A',  'Romaji mode'));
  wrap.appendChild(mkBtn(inputId+'HiraBtn',  'ひ',  'Hiragana mode'));
  wrap.appendChild(mkBtn(inputId+'KataBtn',  'カ',  'Katakana mode', 'var(--gold)'));

  if (!opts.noKanji) {
    const kb = document.createElement('button');
    kb.type = 'button';
    kb.id = inputId + 'KanjiBtn';
    kb.className = cls;
    kb.title = 'Convert to kanji';
    kb.textContent = '漢字';
    kb.onclick = () => { kanaToKanji(inp, kb); inp.focus(); };
    wrap.appendChild(kb);
  }

  // Insert into placeholder if provided, otherwise before the input
  const placeholder = document.querySelector(`[data-kana-for="${inputId}"]`);
  if (placeholder) {
    placeholder.innerHTML = '';
    placeholder.appendChild(wrap);
  } else {
    inp.parentNode.insertBefore(wrap, inp);
  }

  inp._kanaToolbar = true;
  // Load saved default for this location; fall back to opts.defaultMode
  (async () => {
    const key = 'kana_default:' + inputId;
    try {
      const saved = window.kvAPI ? await window.kvAPI.get(key) : null;
      kanaSetMode(inputId, saved || mode, grp, btnIds);
    } catch(e) {
      kanaSetMode(inputId, mode, grp, btnIds);
    }
  })();

  // On focus: sync button highlight to current mode.
  // kanaOn() already handles snapshot reset and handler re-attachment.
  inp.addEventListener('focus', () => {
    const currentMode = inp._kanaMode || (_kanaLastMode && _kanaLastMode[inputId]) || mode;
    const activeBtn = currentMode === 'romaji' ? btnIds.romaji
                    : currentMode === 'hiragana' ? btnIds.hira
                    : btnIds.kata;
    setButtonGroupActive(grp, activeBtn);
    // Re-apply kana engine if it got switched off (e.g. after kanaOff from mode switch)
    if (currentMode !== 'romaji' && !inp._kanaOn) {
      inp._modeSwitchPending = true;
      kanaSetMode(inputId, currentMode, grp, btnIds);
    }
  });

  return wrap;
}

// ── kanaAddToggle — silent kanaOn only (no toolbar) ─────────────────────────
// Use for inputs that are always hiragana with no mode choice.
// conjInputG, countAnswer2, daysDrillInput: kanaOn directly, no buttons.
function kanaAddToggle(el, startOn) {
  if (!el) return;
  if (startOn) {
    kanaOn(el);
    el._kanaMode = 'hiragana';
    el.style.caretColor = 'var(--teal)';
  }
}

// ── Initialise all static toolbars on load ───────────────────────────────────
function _initKanaToolbars() {
  console.log('[kana] _initKanaToolbars running, readyState=', document.readyState);
  const ids = ['globalQTInput','chatInput','transInput','lookupsFilter','listenTranscribeText','vtDictateInput','gramSentQuestion','writingInput'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    const ph = document.querySelector('[data-kana-for="'+id+'"]');
    console.log('[kana]', id, '→ el:', !!el, 'placeholder:', !!ph);
    kanaToolbar(id);
  });
}

// Run immediately if DOM is ready, otherwise wait
if (document.readyState === 'loading') {
  console.log('[kana] DOM still loading — deferring to DOMContentLoaded');
  document.addEventListener('DOMContentLoaded', _initKanaToolbars);
} else {
  console.log('[kana] DOM ready — running immediately');
  _initKanaToolbars();
}

// ── Mode-setter shims (kept for programmatic callers) ────────────────────────
// All now reference IDs generated by kanaToolbar's naming convention.
function setGlobalQTMode(mode)    { kanaSetMode('globalQTInput',        mode, 'globalQTInputKana',        { romaji:'globalQTInputRomajiBtn',        hira:'globalQTInputHiraBtn',        kata:'globalQTInputKataBtn' }); }
function setChatInputMode(mode)   { kanaSetMode('chatInput',            mode, 'chatInputKana',            { romaji:'chatInputRomajiBtn',            hira:'chatInputHiraBtn',            kata:'chatInputKataBtn' }); }
function listenTransSetMode(mode) { kanaSetMode('listenTranscribeText', mode, 'listenTranscribeTextKana',  { romaji:'listenTranscribeTextRomajiBtn',  hira:'listenTranscribeTextHiraBtn',  kata:'listenTranscribeTextKataBtn' }); }
function setVtDictateMode(mode)   { kanaSetMode('vtDictateInput',       mode, 'vtDictateInputKana',       { romaji:'vtDictateInputRomajiBtn',       hira:'vtDictateInputHiraBtn',       kata:'vtDictateInputKataBtn' }); }
function setGramSentQMode(mode)   { kanaSetMode('gramSentQuestion',     mode, 'gramSentQuestionKana',     { romaji:'gramSentQuestionRomajiBtn',     hira:'gramSentQuestionHiraBtn',     kata:'gramSentQuestionKataBtn' }); }
function setWritingMode(mode)     { kanaSetMode('writingInput',         mode, 'writingInputKana',         { romaji:'writingInputRomajiBtn',         hira:'writingInputHiraBtn',         kata:'writingInputKataBtn' }); }
function transDoKanjiConvert()    { const i=document.getElementById('transInput'); if(i) kanaToKanji(i,document.getElementById('transInputKanjiBtn')); }



// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, {
    // Core kana input engine
    romajiToHiragana,
    romajiToKatakana,
    hiraganaToKatakana,
    kanaInputHandler,
    kanaOn,
    kanaOff,
    kanaToggle,
    kanaAddToggle,
    kanaSetMode,
    kanaToolbar,
    kanjiPickerShow,
    kajiPickerClose,
    // Mode-setter shims
    setGlobalQTMode,
    setChatInputMode,
    listenTransSetMode,
    setVtDictateMode,
    setGramSentQMode,
    setWritingMode,
    transDoKanjiConvert,
    // Vehicle game setup (legacy)
    vgSetupInput,
  });
  window['romajiToHiragana']   = romajiToHiragana;
  window['romajiToKatakana']   = romajiToKatakana;
  window['hiraganaToKatakana'] = hiraganaToKatakana;
  window['kanaOn']             = kanaOn;
  window['kanaOff']            = kanaOff;
  window['kanaToggle']         = kanaToggle;
  window['kanaAddToggle']      = kanaAddToggle;
  window['kanaSetMode']        = kanaSetMode;
  window['kanaToolbar']        = kanaToolbar;
} catch(e) { console.error('[features-kana] App registry failed:', e); }
