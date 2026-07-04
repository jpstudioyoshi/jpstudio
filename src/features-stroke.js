// ╔══════════════════════════════════════════════════════════════════════════════
// ║ features-stroke.js
// ║ Stroke order drill — HanziWriter integration, stroke state, stroke UI.
// ║ Depends on: core-foundation.js (Storage, STORAGE_KEYS, state, claudeAPI)
// ╚══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════

// ── Stroke order state ───────────────────────────────────────────────────────
const StrokeState = {
  writers:         [],
  chars:           [],
  speed:           1,
  active:          -1,
  translateTimer:  null,
};

function strokeOnInput(inp) {
  strokeBuildTiles(inp.value);
  if (StrokeState.chars.length) {
    strokeFetchReadings(StrokeState.chars, inp.value.trim());
    // Auto-collapse if input contains kanji (direct paste scenario)
    if (/[一-鿿]/.test(inp.value)) setTimeout(() => strokeCollapseInput(), 80);
  }
  strokeTranslateWord(inp.value.trim());
}

// StrokeState.translateTimer — see declaration above
async function strokeTranslateWord(word) {
  const el = document.getElementById('strokeWordMeaning');
  if (!el) return;
  if (!word || word.length < 1) { el.textContent = ''; return; }

  // Single kanji — RTK keyword is enough, already shown
  if ([...word].length === 1) { el.textContent = ''; return; }

  // Check translate cache first
  const cached = Storage.getJSON(STORAGE_KEYS.TRANSLATE_CACHE, {});
  const cacheKey = 'stroke:' + word;
  if (cached[cacheKey]) { el.textContent = cached[cacheKey]; return; }

  // Debounce — wait 600ms after typing stops
  clearTimeout(StrokeState.translateTimer);
  el.textContent = '…';
  StrokeState.translateTimer = setTimeout(async () => {
    try {
      const data = await claudeAPI({
        max_tokens: 40,
        messages: [{ role: 'user', content: 'Translate this Japanese word/phrase to English in 1-5 words only, no explanation: ' + word }]
      ,
        track: 'writing'
      });
      const translation = claudeText(data).trim().replace(/^["']|["']$/g, '');
      el.textContent = translation;
      // Cache it
      cached[cacheKey] = translation;
      Storage.setJSON(STORAGE_KEYS.TRANSLATE_CACHE, cached);
    } catch (e) {
      el.textContent = '';
    }
  }, 600);
}

function strokeCollapseInput() {
  const iw = document.getElementById('strokeInputWrap');
  const ew = document.getElementById('strokeEditWrap');
  if (iw) iw.style.display = 'none';
  if (ew) ew.style.display = 'flex';
}

function strokeShowInput() {
  const iw = document.getElementById('strokeInputWrap');
  const ew = document.getElementById('strokeEditWrap');
  if (iw) iw.style.display = 'flex';
  if (ew) ew.style.display = 'none';
  const inp = document.getElementById('strokeSearchInput');
  if (inp) { inp.focus(); inp.select(); }
}

function strokePanelInit() {
  const inp = document.getElementById('strokeSearchInput');
  if (!inp) return;
  if (!inp._strokeListening) {
    inp._strokeListening = true;
    inp.addEventListener('input', () => {
      strokeBuildTiles(inp.value);
    });
  }
  if (inp.value.trim()) strokeBuildTiles(inp.value);
  inp.focus();
}

function handleStrokeKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const inp = document.getElementById('strokeSearchInput');
    if (!inp || !inp.value.trim()) return;
    // Use the input itself as the anchor for picker positioning
    kanaToKanji(inp, inp);
  }
}

function strokeSetSpeed(v) { StrokeState.speed = parseFloat(v); }
function strokeShowChars(val) {}
function strokeAnimate() { strokeBuildTiles(document.getElementById('strokeSearchInput').value); }

function strokeBuildTiles(val) {
  val = (val || '').trim();
  const chars = [...val].filter(ch => {
    const cp = ch.codePointAt(0);
    return (cp >= 0x3040 && cp <= 0x30FF) ||
           (cp >= 0x4E00 && cp <= 0x9FFF) ||
           (cp >= 0x3400 && cp <= 0x4DBF) ||
           (cp >= 0xF900 && cp <= 0xFAFF);
  });
  if (!chars.length) {
    const t = document.getElementById('strokeTilesInline') || document.getElementById('strokeTiles');
    const d = document.getElementById('strokeDisplay');
    if (t) t.innerHTML = '';
    if (d) d.innerHTML = '';
    StrokeState.chars = []; StrokeState.writers = []; StrokeState.active = -1;
    return;
  }
  if (chars.join('') === StrokeState.chars.join('')) return;
  StrokeState.chars = chars;
  StrokeState.writers = new Array(chars.length).fill(null);
  StrokeState.active = -1;
  const tilesEl = document.getElementById('strokeTilesInline') || document.getElementById('strokeTiles');
  tilesEl.innerHTML = '';
  chars.forEach((ch, i) => {
    const tileWrap = document.createElement('div');
    tileWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px';
    const tile = document.createElement('button');
    tile.id = 'stroke-tile-' + i;
    tile.style.cssText = 'width:52px;height:52px;background:#111;border:2px solid var(--border);' +
      'border-radius:4px;color:var(--ink);font-family:"Noto Sans JP",sans-serif;font-size:1.6rem;' +
      'cursor:pointer;transition:border-color 0.15s,background 0.15s;flex-shrink:0;display:flex;' +
      'align-items:center;justify-content:center';
    tile.textContent = ch;
    tile.onclick = () => strokeSelectChar(i);
    const reading = document.createElement('div');
    reading.id = 'stroke-reading-' + i;
    reading.style.cssText = 'font-family:var(--ui);font-size:0.6rem;color:var(--ink-light);' +
      'text-align:center;max-width:52px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    reading.textContent = strokeGetReading(ch);
    // Add meaning keyword under tile
    const meaning = document.createElement('div');
    meaning.style.cssText = 'font-family:var(--ui);font-size:0.55rem;color:var(--ink-light);' +
      'text-align:center;max-width:52px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    const rtkE = RTK_KANJI.find(e => e.k === ch);
    meaning.textContent = rtkE ? rtkE.kw : '';
    tileWrap.appendChild(tile);
    tileWrap.appendChild(reading);
    tileWrap.appendChild(meaning);
    tilesEl.appendChild(tileWrap);
  });
  strokeSelectChar(0);
}

function strokeSelectChar(idx) {
  StrokeState.active = idx;
  const ch = StrokeState.chars[idx];

  // Update readings + meaning display in top row
  const readingsDisplay = document.getElementById('strokeReadingsDisplay');
  const meaningDisplay  = document.getElementById('strokeMeaningDisplay');
  const rtkEntry = RTK_KANJI.find(e => e.k === ch);
  if (readingsDisplay) readingsDisplay.textContent = rtkEntry ? rtkEntry.r : '';
  if (meaningDisplay)  meaningDisplay.textContent  = rtkEntry ? rtkEntry.kw : '';

  // Highlight selected character tile — teal border, black background
  StrokeState.chars.forEach((_, i) => {
    const t = document.getElementById('stroke-tile-' + i);
    if (!t) return;
    t.style.borderColor = i === idx ? 'var(--teal)' : 'var(--border)';
    t.style.background  = '#111';
  });

  const display = document.getElementById('strokeDisplay');
  display.innerHTML = '';
  const LBL = 'font-family:var(--ui);font-size:0.62rem;letter-spacing:0.1em;' +
    'color:var(--ink-light);margin-bottom:8px';
  const SZ = 220;
  const SQ = 'background:#111;display:inline-block;width:' + SZ + 'px;height:' + SZ + 'px';
  // ── Row: STROKE ORDER left, ANIMATE center, KOOHII right ───────
  const mainRow = document.createElement('div');
  mainRow.style.cssText = 'display:flex;align-items:flex-start;flex-wrap:nowrap;margin-bottom:24px;gap:24px';

  // STROKE ORDER (Kan-G numbered)
  const staticWrap   = document.createElement('div');
  const staticLblRow = document.createElement('div');
  staticLblRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px';
  const staticLbl    = document.createElement('div');
  staticLbl.style.cssText = 'font-family:var(--ui);font-size:0.62rem;letter-spacing:0.1em;color:var(--ink-light)';
  staticLbl.textContent = 'STROKE ORDER';
  const magnifyBtn = document.createElement('button');
  magnifyBtn.textContent = '⤢';
  magnifyBtn.title = 'Magnify';
  magnifyBtn.style.cssText = 'background:none;border:none;color:var(--ink-light);cursor:pointer;font-size:inherit;padding:0 2px;line-height:1;opacity:0.6;transition:opacity 0.15s';
  magnifyBtn.onmouseover = () => magnifyBtn.style.opacity = '1';
  magnifyBtn.onmouseout  = () => magnifyBtn.style.opacity = '0.6';
  magnifyBtn.onclick = () => strokeMagnify(ch);
  staticLblRow.appendChild(staticLbl);
  staticLblRow.appendChild(magnifyBtn);
  const staticTarget = document.createElement('div');
  staticTarget.style.cssText = 'background:#111;display:inline-block;width:' + SZ + 'px;height:' + SZ + 'px';
  staticWrap.appendChild(staticLblRow);
  staticWrap.appendChild(staticTarget);

    // ANIMATE — two mode labels: ANIMATE / CLICK, toggle teal on click
  const animWrap   = document.createElement('div');

  const modeLblRow = document.createElement('div');
  modeLblRow.style.cssText = 'display:flex;align-items:center;gap:24px;margin-bottom:8px';

  const LBL_BASE = 'font-family:var(--ui);font-size:0.62rem;letter-spacing:0.1em;' +
    'cursor:pointer;transition:color 0.15s;user-select:none';

  const animModeLbl = document.createElement('span');
  animModeLbl.textContent = 'ANIMATE';
  animModeLbl.style.cssText = LBL_BASE + ';color:var(--teal)'; // default selected

  const clickModeLbl = document.createElement('span');
  clickModeLbl.textContent = 'CLICK';
  clickModeLbl.style.cssText = LBL_BASE + ';color:var(--ink-light)';

  let _animMode = 'play'; // 'play' or 'step'

  animModeLbl.onclick = () => {
    _animMode = 'play';
    animModeLbl.style.color  = 'var(--teal)';
    clickModeLbl.style.color = 'var(--ink-light)';
  };
  clickModeLbl.onclick = () => {
    _animMode = 'step';
    clickModeLbl.style.color = 'var(--teal)';
    animModeLbl.style.color  = 'var(--ink-light)';
  };

  modeLblRow.appendChild(animModeLbl);
  modeLblRow.appendChild(clickModeLbl);

  const animTarget = document.createElement('div');
  animTarget.id = 'sa-' + ch.codePointAt(0) + '-' + idx;
  animTarget.style.cssText = 'width:' + SZ + 'px;height:' + SZ + 'px;background:#111;cursor:pointer';

  let _strokeStep  = 0;
  let _strokeTotal = 0;

  animTarget.onclick = () => {
    const w = StrokeState.writers[idx];
    if (!w) return;
    if (_animMode === 'play') {
      _strokeStep = 0;
      w.animateCharacter();
    } else {
      if (_strokeStep >= _strokeTotal) { _strokeStep = 0; w.showCharacter(); return; }
      if (_strokeStep === 0) w.hideCharacter();
      w.animateStroke(_strokeStep);
      _strokeStep++;
    }
  };

  animWrap.appendChild(modeLblRow);
  animWrap.appendChild(animTarget);

  mainRow.appendChild(staticWrap);
  mainRow.appendChild(animWrap);
  
  // KOOHII STORIES (for kanji only) - with Show button
  if (ch.charCodeAt(0) > 0x4E00) {
    const koohiiWrap = document.createElement('div');
    koohiiWrap.style.cssText = 'flex:1;min-width:280px;max-width:400px';
    
    const koohiiLblRow = document.createElement('div');
    koohiiLblRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px';
    
    const koohiiLbl = document.createElement('div');
    koohiiLbl.style.cssText = 'font-family:var(--ui);font-size:0.62rem;letter-spacing:0.1em;color:var(--ink-light)';
    koohiiLbl.textContent = 'KOOHII STORIES';
    
    const showBtn = document.createElement('button');
    showBtn.textContent = 'Show';
    showBtn.style.cssText = 'padding:2px 10px;background:none;border:1px solid var(--gold);border-radius:4px;font-family:var(--ui);font-size:0.65rem;color:var(--gold);cursor:pointer;transition:all 0.15s';
    
    // RTK keyword display
    const rtkKeywordEl = document.createElement('span');
    rtkKeywordEl.style.cssText = 'font-family:var(--ui);font-size:inherit;color:var(--ink);font-style:italic;margin-left:auto';
    
    // Look up keyword from RTK_KANJI array
    const rtkEntry = RTK_KANJI.find(e => e.k === ch);
    if (rtkEntry) {
      rtkKeywordEl.textContent = rtkEntry.kw;
    } else {
      // Fetch from API if not in local data
      rtkKeywordEl.textContent = '';
      fetch(`https://hochanh.github.io/rtk/${encodeURIComponent(ch)}/index.html`)
        .then(r => r.text())
        .then(html => {
          const match = html.match(/<h2><code[^>]*>([^<]+)<\/code><\/h2>/);
          if (match) rtkKeywordEl.textContent = match[1];
        })
        .catch(() => {});
    }
    
    koohiiLblRow.appendChild(koohiiLbl);
    koohiiLblRow.appendChild(showBtn);
    koohiiLblRow.appendChild(rtkKeywordEl);
    
    const koohiiContent = document.createElement('div');
    koohiiContent.style.cssText = 'background:#111;padding:14px;border:1px solid var(--border);border-radius:6px;font-size:inherit;line-height:1.7;min-height:' + SZ + 'px;max-height:' + SZ + 'px;overflow-y:auto;display:none;word-wrap:break-word';
    koohiiContent.innerHTML = '<span style="color:var(--ink-light)">Loading...</span>';
    
    showBtn.onclick = () => {
      if (koohiiContent.style.display === 'none') {
        koohiiContent.style.display = 'block';
        showBtn.textContent = 'Hide';
        showBtn.style.background = 'var(--gold)';
        showBtn.style.color = '#1c1c1e';
        // Fetch if not already loaded
        if (koohiiContent.innerHTML.includes('Loading')) {
          strokeFetchKoohii(ch, koohiiContent);
        }
      } else {
        koohiiContent.style.display = 'none';
        showBtn.textContent = 'Show';
        showBtn.style.background = 'none';
        showBtn.style.color = 'var(--gold)';
      }
    };
    
    koohiiWrap.appendChild(koohiiLblRow);
    koohiiWrap.appendChild(koohiiContent);
    mainRow.appendChild(koohiiWrap);
  }
  
  display.appendChild(mainRow);

  // STEP BY STEP
  const stepsWrap  = document.createElement('div');
  const stepsLbl   = document.createElement('div');
  stepsLbl.style.cssText = LBL; stepsLbl.textContent = 'STEP BY STEP';
  const stepsTarget = document.createElement('div');
  stepsWrap.appendChild(stepsLbl);
  stepsWrap.appendChild(stepsTarget);
  display.appendChild(stepsWrap);

  // Load Kan-G static numbered diagram
  strokeLoadKanG(ch, staticTarget, SZ);
  // Load step-by-step tiles
  strokeLoadSteps(ch, stepsTarget);

  // Load HanziWriter — starts showing full character, click to animate
  if (typeof HanziWriter !== 'undefined') {
    try {
      animTarget.innerHTML = '';
      const w = HanziWriter.create(animTarget.id, ch, {
        width: SZ, height: SZ, padding: 12,
        strokeColor: '#e8e8ed',
        radicalColor: '#30d5c8',
        outlineColor: '#333',
        showCharacter: true,
        showOutline: true,
        showCharacterAfterStroke: true,
        strokeWidth: 6,
        strokeAnimationSpeed: 1,
        delayBetweenStrokes: 300,
        charDataLoader: (character, onLoad, onError) => {
          fetch('https://cdn.jsdelivr.net/npm/hanzi-writer-data-jp@0/' + character + '.json')
            .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
            .then(d => { _strokeTotal = (d.strokes || []).length; onLoad(d); })
            .catch(onError);
        }
      });
      StrokeState.writers[idx] = w;
    } catch(e) {
      animTarget.textContent = 'No data';
    }
  }
}

async function strokeLoadKanG(ch, container, size) {
  size = size || 220;
  const hex = ch.codePointAt(0).toString(16).padStart(5, '0');
  try {
    const res = await fetch('https://kan-g.vnaka.dev/k/' + hex + '.svg');
    if (!res.ok) throw new Error('not found');
    let svg = await res.text();
    svg = svg.replace('<svg', '<svg width="' + size + '" height="' + size + '"');
    svg = svg.replace(/currentcolor/gi, '#e8e8ed');
    container.innerHTML = svg;
    const svgEl = container.querySelector('svg');
    if (svgEl) svgEl.style.cssText = 'display:block;background:#111';
  } catch(e) {
    container.innerHTML = '<div style="width:' + size + 'px;height:' + size + 'px;' +
      'display:flex;align-items:center;justify-content:center;background:#111;' +
      'font-size:0.7rem;color:var(--ink-light)">No data</div>';
  }
}

// Koohii stories cache (shared with RTK drill)
let _rtkMnemonicCache = (() => { try { return JSON.parse(Storage.get(STORAGE_KEYS.RTK_MNEMONICS) || '{}'); } catch(e) { return {}; } })();
async function strokeFetchKoohii(ch, container) {
  // Check cache first
  if (_rtkMnemonicCache[ch]) {
    container.innerHTML = _rtkMnemonicCache[ch];
    return;
  }
  
  try {
    const url = `https://hochanh.github.io/rtk/${encodeURIComponent(ch)}/index.html`;
    const resp = await fetch(url);
    const htmlText = await resp.text();
    
    // Parse stories from the HTML
    // Format: <p>1) [<a href="...">author</a>] date(votes): story text</p>
    const stories = [];
    
    // Match: <p>number) [<a href="...">author</a>] date(votes): text</p>
    const storyPattern = /<p>(\d+)\)\s*\[<a[^>]*>([^<]+)<\/a>\]\s*[\d\-]+\((\d+)\):\s*([\s\S]*?)<\/p>/g;
    let match;
    while ((match = storyPattern.exec(htmlText)) !== null && stories.length < 3) {
      // Clean up the story text - remove HTML tags but keep content
      let text = match[4]
        .replace(/<strong>([^<]*)<\/strong>/g, '<b>$1</b>')  // Convert strong to b
        .replace(/<em>([^<]*)<\/em>/g, '<i>$1</i>')          // Convert em to i
        .replace(/<a[^>]*>([^<]*)<\/a>/g, '$1')              // Remove links, keep text
        .replace(/<[^>]+>/g, '')                              // Remove other tags
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length > 0) {
        stories.push({
          author: match[2].replace(/_/g, '_'),
          votes: parseInt(match[3]),
          text: text
        });
      }
    }
    
    if (stories.length === 0) {
      container.innerHTML = '<span style="color:var(--ink-light)">No community stories found.</span>';
    } else {
      const storiesHtml = stories.map((s, i) => `
        <div style="margin-bottom:${i < stories.length - 1 ? '12px' : '0'};padding-bottom:${i < stories.length - 1 ? '12px' : '0'};border-bottom:${i < stories.length - 1 ? '1px solid var(--border)' : 'none'}">
          <div style="font-size:inherit;line-height:1.6">${s.text}</div>
          <div style="font-size:0.68rem;color:var(--ink-light);margin-top:6px">— ${s.author} (${s.votes} votes)</div>
        </div>
      `).join('');
      container.innerHTML = storiesHtml;
      
      // Cache it
      _rtkMnemonicCache[ch] = storiesHtml;
      Storage.set(STORAGE_KEYS.RTK_MNEMONICS, JSON.stringify(_rtkMnemonicCache));
    }
  } catch (e) {
    container.innerHTML = '<span style="color:var(--ink-light)">Could not fetch stories.</span>';
  }
}

async function strokeLoadSteps(ch, container) {
  const hex = ch.codePointAt(0).toString(16).padStart(5, '0');
  try {
    const res = await fetch('https://kan-g.vnaka.dev/k/' + hex + '.svg');
    if (!res.ok) throw new Error('not found');
    const svgText = await res.text();
    const parser  = new DOMParser();
    const doc     = parser.parseFromString(svgText, 'image/svg+xml');
    const svgEl   = doc.querySelector('svg');
    const allPaths = [...svgEl.querySelectorAll('g:not(.kgNumbers) path')];
    const n = allPaths.length;
    if (n === 0) throw new Error('no strokes');
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:flex-end';
    for (let i = 1; i <= n; i++) {
      const clone = svgEl.cloneNode(true);
      clone.setAttribute('width', '72'); clone.setAttribute('height', '72');
      clone.style.cssText = 'display:block;background:#111';
      [...clone.querySelectorAll('g:not(.kgNumbers) path')].forEach((p, idx) => {
        if (idx < i-1)       { p.setAttribute('stroke','#555'); p.setAttribute('stroke-width','3'); }
        else if (idx === i-1){ p.setAttribute('stroke','#30d5c8'); p.setAttribute('stroke-width','4'); }
        else                 { p.style.display = 'none'; }
      });
      const cloneNums = clone.querySelector('.kgNumbers');
      if (cloneNums) {
        [...cloneNums.querySelectorAll('text')].forEach((t, idx) => {
          if (idx === i-1) { t.setAttribute('fill','#30d5c8'); t.setAttribute('font-size','10'); t.style.display=''; }
          else { t.style.display = 'none'; }
        });
      }
      wrap.appendChild(clone);
    }
    container.appendChild(wrap);
  } catch(e) {
    container.innerHTML = '<span style="font-size:0.7rem;color:var(--ink-light)">No step data</span>';
  }
}

// New stroke functions
try {
  window["strokeAnimate"] = strokeAnimate;
  window["strokeReplay"] = strokeReplay;
  window["strokeShowChars"] = strokeShowChars;
  window["strokeSetSpeed"] = strokeSetSpeed;
  window["strokeToggleNums"] = strokeToggleNums;
} catch(e) {}

