// ═══════════════════════════════════════════════════════
// TEXT ENTRY — Standard Japanese text input component
//
// Owns: outer wrapper, textarea (or input), kana strip.
// One call replaces a textarea + manual kana buttons everywhere.
//
// Usage — DOM mode (preferred):
//   const el = TextEntry.create({ id: 'myInput', ... });
//   container.appendChild(el);  // toolbar self-wires immediately
//
// Usage — HTML string mode (for template literals):
//   html += TextEntry.html({ id: 'myInput', ... });
//   // then after setting innerHTML:
//   TextEntry.wire('myInput');
//   // or for all entries in a container:
//   TextEntry.wireAll(containerEl);
//
// Options:
//   id           string  (required) — unique on the page
//   placeholder  string  — input placeholder
//   defaultMode  'hiragana' | 'romaji' | 'katakana'  (default: 'hiragana')
//   type         'textarea' | 'input'  (default: 'textarea')
//   rows         number  — textarea rows hint (default: 3)
//   minHeight    string  — CSS min-height  (default: '60px')
//   resize       'vertical' | 'none' | 'both'  (default: 'vertical')
//   noKanji      bool    — omit 漢字 button  (default: false)
//   onEnter      string  — JS to run on Enter (textarea; shift+Enter = newline)
//   onInput      string  — JS to run on input event
//   width        string  — CSS width  (default: '100%')
//   fontSize     string  — CSS font-size  (default: '1rem')
//   disabled     bool
//   extraStyle   string  — extra CSS on the input element
//   voiceBtn     bool    — show mic button for STT  (default: false)
//   speakBtn     bool    — show speaker button to hear input  (default: false)
//   stripPosition 'below' (default) | 'above' | 'left' | 'right'
//
// Future variables (add as needed):
//   maxLength    number  — char limit with live counter
//   label        string  — label above the input
//   onSubmit     string  — JS for a Submit button on the strip
//   autocomplete array   — suggestions dropdown
//
// ═══════════════════════════════════════════════════════

// ── Add to style.css ────────────────────────────────────────────────────────
// .text-entry-input {
//   width: 100%; box-sizing: border-box; padding: 10px;
//   font-family: var(--jp); background: var(--field);
//   border: 1px solid var(--field-border); border-radius: 6px;
//   color: var(--ink); outline: none;
//   transition: border-color 0.15s;
// }
// .text-entry-input:focus { border-color: var(--teal); }
// .text-entry-textarea { resize: vertical; }
// .text-entry-field { height: 38px; }
// .text-entry-strip { margin-top: 4px; display: flex; align-items: center; gap: 4px; }
// ─────────────────────────────────────────────────────────────────────────────

const TextEntry = (() => {

  // ── Defaults ──────────────────────────────────────────────────────────────────

  function _defaults(opts) {
    return Object.assign({
      placeholder: '',
      defaultMode: 'hiragana',
      type:        'textarea',
      rows:        3,
      minHeight:   '60px',
      resize:      'vertical',
      noKanji:     false,
      onEnter:     null,
      onInput:     null,
      width:       '100%',
      fontSize:    '1rem',
      disabled:    false,
      extraStyle:  '',
      voiceBtn:      false,
      speakBtn:      false,
      stripPosition: 'below',
    }, opts);
  }

  // ── HTML string mode ──────────────────────────────────────────────────────────
  // Returns an HTML string for embedding in template literals.
  // After setting innerHTML, call TextEntry.wire(id) or TextEntry.wireAll(el).

  function html(opts) {
    const o = _defaults(opts);
    if (!o.id) { console.error('[TextEntry] id is required'); return ''; }

    const inputStyle = [
      'width:100%', 'box-sizing:border-box', 'padding:10px',
      'font-family:var(--jp)', `font-size:${o.fontSize}`,
      'background:var(--field)', 'border:1px solid var(--field-border)',
      'border-radius:6px', 'color:var(--ink)',
      o.type === 'textarea'
        ? `min-height:${o.minHeight};resize:${o.resize}`
        : 'height:38px',
      o.disabled ? 'opacity:0.5;cursor:not-allowed' : '',
      o.extraStyle,
    ].filter(Boolean).join(';');

    // Class allows global styling from style.css
    const inputClass = 'text-entry-input' + (o.type === 'textarea' ? ' text-entry-textarea' : ' text-entry-field');

    let enterHandler = '';
    if (o.onEnter) {
      enterHandler = o.type === 'textarea'
        ? ` onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();${o.onEnter}}"`
        : ` onkeydown="if(event.key==='Enter'){${o.onEnter}}"`;
    }

    const attrs = [
      `id="${o.id}"`,
      `class="text-entry-input${o.type === 'textarea' ? ' text-entry-textarea' : ' text-entry-field'}"`,
      `placeholder="${o.placeholder.replace(/"/g, '&quot;')}"`,
      `style="${inputStyle}"`,
      o.disabled ? 'disabled' : '',
      o.onInput  ? `oninput="${o.onInput}"` : '',
      enterHandler,
    ].filter(Boolean).join(' ');

    const inputEl = o.type === 'textarea'
      ? `<textarea ${attrs}></textarea>`
      : `<input type="text" ${attrs}>`;

    const extras = [
      o.speakBtn ? `<button type="button" class="btn-kana" title="Speak input" onclick="(App.jpSpeak||window.jpSpeak)?.(document.getElementById('${o.id}').value)">🔊</button>` : '',
      o.voiceBtn ? `<button type="button" class="btn-kana" id="${o.id}VoiceBtn" title="Voice input" onclick="(App.TextEntry||window.TextEntry).startVoice('${o.id}')">🎤</button>` : '',
    ].filter(Boolean).join('');

    const strip = `<div class="text-entry-strip" style="margin-top:4px;display:flex;align-items:center;gap:4px"><span data-kana-for="${o.id}"></span>${extras}</div>`;
    const above = o.stripPosition === 'above';
    return (
      `<div class="text-entry" data-entry-id="${o.id}" ` +
      `data-default-mode="${o.defaultMode}" data-no-kanji="${o.noKanji}" ` +
      `data-strip-position="${o.stripPosition}" ` +
      `style="width:${o.width}">` +
      (above ? strip : '') +
      inputEl +
      (above ? '' : strip) +
      `</div>`
    );
  }

  // ── Wire ─────────────────────────────────────────────────────────────────────
  // Call after innerHTML is set to attach the kana toolbar.

  function wire(id) {
    const wrapper = document.querySelector(`[data-entry-id="${id}"]`);
    if (!wrapper) return;
    const mode    = wrapper.dataset.defaultMode || 'hiragana';
    const noKanji = wrapper.dataset.noKanji === 'true';
    const _kt = App.kanaToolbar || window.kanaToolbar;
    if (!_kt) { console.warn('[TextEntry] kanaToolbar not available'); return; }

    _kt(id, { defaultMode: mode, noKanji });

    // Move toolbar into the strip div (kanaToolbar inserts into data-kana-for)
    const tb    = document.querySelector(`[data-kana-toolbar="${id}"]`);
    const strip = wrapper.querySelector('.text-entry-strip');
    if (tb && strip && tb.parentNode !== strip) {
      strip.insertBefore(tb, strip.firstChild);
    }
  }

  // ── wireAll ───────────────────────────────────────────────────────────────────
  // Wire every TextEntry component inside a container element.
  // Useful after any bulk innerHTML update.

  function wireAll(container) {
    const root = container || document;
    root.querySelectorAll('[data-entry-id]').forEach(el => wire(el.dataset.entryId));
  }

  // ── DOM mode ──────────────────────────────────────────────────────────────────
  // Returns a fully-wired DOM element. Use when building UI in JS rather than
  // template literals. Toolbar attaches on the next animation frame.

  function create(opts) {
    const o = _defaults(opts);
    const wrap = document.createElement('div');
    wrap.innerHTML = html(o);
    const el = wrap.firstElementChild;
    requestAnimationFrame(() => wire(o.id));
    return el;
  }

  // ── Voice input ───────────────────────────────────────────────────────────────
  // Integrates with existing STT when voiceBtn: true.

  function startVoice(id) {
    const inp = document.getElementById(id);
    const btn = document.getElementById(id + 'VoiceBtn');
    const _stt = App.sttTranscribe || window.sttTranscribe;
    if (!inp || !_stt) { console.warn('[TextEntry] STT not available'); return; }
    if (btn) btn.textContent = '⏺';
    _stt({ onResult: (text) => {
      inp.value = (inp.value ? inp.value + ' ' : '') + text;
      inp.dispatchEvent(new Event('input'));
      if (btn) btn.textContent = '🎤';
    }});
  }

  // ── Utilities ─────────────────────────────────────────────────────────────────

  function clear(id) {
    const inp = document.getElementById(id);
    if (inp) { inp.value = ''; inp.dispatchEvent(new Event('input')); }
  }

  function val(id) {
    return document.getElementById(id)?.value || '';
  }

  return { html, wire, wireAll, create, startVoice, clear, val };

})();

// ── App registry ─────────────────────────────────────────────────────────────
try {
  Object.assign(App, { TextEntry });
} catch(e) { console.error('[TextEntry] App registry failed:', e); }
