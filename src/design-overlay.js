/**
 * design-overlay.js — Japanese Studio Dev Tool
 * Toggle: Cmd+Shift+D
 * Click any element → shows classes + class picker + CSS var editor
 * "Copy changes" → clipboard summary for manual HTML apply
 * Self-contained. No external deps. Never distributed.
 */
(function () {
  'use strict';

  const CSS_VARS = [
    { name: '--ink',         default: '#f5f5f7', desc: 'Primary text',                    type: 'color' },
    { name: '--ink-light',   default: '#c0c0c5', desc: 'Secondary text / disabled',       type: 'color' },
    { name: '--teal',        default: '#30d5c8', desc: 'Primary accent — correct/active', type: 'color' },
    { name: '--teal-light',  default: '#5ee7d0', desc: 'Teal highlights',                 type: 'color' },
    { name: '--gold',        default: '#ffd60a', desc: 'Secondary accent — partial/kata', type: 'color' },
    { name: '--gold-light',  default: '#ffe545', desc: 'Gold highlights',                 type: 'color' },
    { name: '--red',         default: '#ff6b6b', desc: 'Error / wrong / danger',          type: 'color' },
    { name: '--red-light',   default: '#ff8585', desc: 'Red highlights',                  type: 'color' },
    { name: '--sage',        default: '#7ed886', desc: 'Positive / bonus indicators',     type: 'color' },
    { name: '--paper',       default: '#1c1c1e', desc: 'Base background',                 type: 'color' },
    { name: '--paper-dark',  default: '#3d3d40', desc: 'Elevated surface / selected',     type: 'color' },
    { name: '--paper-mid',   default: '#4e4e52', desc: 'Hover bg / subtle surface',       type: 'color' },
    { name: '--panel',       default: '#2c2c2e', desc: 'Panel background',                type: 'color' },
    { name: '--field',       default: '#111113', desc: 'Input background',                type: 'color' },
    { name: '--field-focus', default: '#30d5c8', desc: 'Input focus border',              type: 'color' },
  ];

  const UTILITY_CLASSES = [
    { cls: 'btn-primary',      group: 'Button',  desc: 'Solid teal — main action' },
    { cls: 'btn-ghost',        group: 'Button',  desc: 'Bordered transparent — default' },
    { cls: 'btn-ghost-teal',   group: 'Button',  desc: 'Add to btn-ghost for teal hover' },
    { cls: 'btn-danger',       group: 'Button',  desc: 'Red border — destructive action' },
    { cls: 'btn-subtle',       group: 'Button',  desc: 'No border, ink-light — low priority' },
    { cls: 'btn-icon',         group: 'Button',  desc: 'Circular icon, 0.5 opacity at rest' },
    { cls: 'btn-icon-teal',    group: 'Button',  desc: 'Add to btn-icon — teal on hover' },
    { cls: 'btn-icon-del',     group: 'Button',  desc: 'Add to btn-icon — red on hover' },
    { cls: 'btn-kana',         group: 'Button',  desc: 'Kana mode selector base' },
    { cls: 'btn-active',       group: 'State',   desc: 'Selected in group — teal' },
    { cls: 'btn-active-gold',  group: 'State',   desc: 'Selected — gold (kata mode)' },
    { cls: 'btn-active-red',   group: 'State',   desc: 'Wrong answer button state' },
    { cls: 'toggle-on',        group: 'State',   desc: 'Toggle ON — teal' },
    { cls: 'result-correct',   group: 'State',   desc: 'Correct answer text — teal' },
    { cls: 'result-wrong',     group: 'State',   desc: 'Wrong answer text — red' },
    { cls: 'result-partial',   group: 'State',   desc: 'Partial/hint text — gold' },
    { cls: 'input-correct',    group: 'State',   desc: 'Input correct — teal border' },
    { cls: 'input-error',      group: 'State',   desc: 'Input error — red border' },
    { cls: 'row-hover',        group: 'Row',     desc: 'Paper-dark bg on hover' },
    { cls: 'row-hover-teal',   group: 'Row',     desc: 'Teal-tinted bg on hover' },
    { cls: 'row-hover-gold',   group: 'Row',     desc: 'Gold-tinted bg on hover' },
    { cls: 'row-hover-border', group: 'Row',     desc: 'Teal border on hover' },
    { cls: 'error-row',        group: 'Row',     desc: 'Subtle white bg on hover — errors' },
    { cls: 'voice-upload-btn', group: 'Special', desc: 'Voice panel upload — gold hover' },
    { cls: 'fe-del',           group: 'Special', desc: 'Inline delete — red on hover' },
  ];

  let active = false;
  let targetEl = null;
  const varChanges = {};
  const classChanges = {};
  let overlay, panel, classesSection, pickerSection, varsSection;

  function init() {
    buildPanel();
    document.addEventListener('keydown', onKeydown);
  }

  function toggle() {
    active = !active;
    overlay.style.display = active ? 'block' : 'none';
    panel.style.display   = active ? 'flex'  : 'none';
    document.body.style.cursor = active ? 'crosshair' : '';
    if (active) {
      document.addEventListener('click', onDocClick, true);
    } else {
      document.removeEventListener('click', onDocClick, true);
      clearHighlight();
      targetEl = null;
      renderClassesSection(null);
    }
  }

  function onKeydown(e) {
    if (e.metaKey && e.shiftKey && e.key === 'E') {
      e.preventDefault();
      toggle();
    }
    if (e.key === 'Escape' && active) toggle();
  }

  function onDocClick(e) {
    if (panel.contains(e.target)) return;
    e.stopPropagation();
    e.preventDefault();
    clearHighlight();
    targetEl = e.target;
    highlight(targetEl);
    renderClassesSection(targetEl);
  }

  function highlight(el) { el.setAttribute('data-do-hl', '1'); }
  function clearHighlight() {
    document.querySelectorAll('[data-do-hl]').forEach(el => el.removeAttribute('data-do-hl'));
  }

  function buildPanel() {
    overlay = document.createElement('div');
    overlay.id = 'do-overlay';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;z-index:99998;pointer-events:none;';
    document.body.appendChild(overlay);

    panel = document.createElement('div');
    panel.id = 'do-panel';
    panel.style.cssText = 'display:none;position:fixed;top:0;right:0;width:320px;height:100vh;background:#1c1c1e;border-left:1px solid rgba(255,255,255,0.18);flex-direction:column;z-index:99999;font-family:-apple-system,sans-serif;font-size:12px;color:#f5f5f7;pointer-events:all;overflow:hidden;';

    const header = el('div', 'display:flex;align-items:center;justify-content:space-between;padding:10px 12px 8px;border-bottom:1px solid rgba(255,255,255,0.12);flex-shrink:0;');
    header.innerHTML = '<span style="font-size:11px;font-weight:700;letter-spacing:.08em;color:#30d5c8;text-transform:uppercase;">⬡ Design Overlay</span><span style="font-size:10px;color:#c0c0c5;">Cmd+Shift+D · Esc</span>';

    const body = el('div', 'flex:1;overflow-y:auto;padding:10px 12px;');

    classesSection = el('div', '');
    pickerSection  = buildPickerSection();
    varsSection    = buildVarsSection();

    body.appendChild(classesSection);
    body.appendChild(hr());
    body.appendChild(pickerSection);
    body.appendChild(hr());
    body.appendChild(varsSection);

    const footer = el('div', 'padding:8px 12px;border-top:1px solid rgba(255,255,255,0.12);flex-shrink:0;display:flex;gap:6px;');
    const copyBtn = mkBtn('Copy changes', '#30d5c8', () => copyChanges());
    const resetBtn = mkBtn('Reset vars', '#c0c0c5', () => resetVars());
    footer.appendChild(copyBtn);
    footer.appendChild(resetBtn);

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(footer);
    document.body.appendChild(panel);

    renderClassesSection(null);
  }

  function renderClassesSection(el_) {
    classesSection.innerHTML = '';
    classesSection.appendChild(labelEl('Selected element'));
    if (!el_) { classesSection.appendChild(dimText('Click any element to inspect.')); return; }

    const tag = document.createElement('div');
    tag.style.cssText = 'font-size:11px;color:#ffd60a;margin-bottom:6px;word-break:break-all;';
    tag.textContent = '<' + el_.tagName.toLowerCase() + (el_.id ? '#' + el_.id : '') + '>';
    classesSection.appendChild(tag);

    const chipWrap = el('div', 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;');
    const classes = Array.from(el_.classList);
    if (classes.length === 0) {
      chipWrap.appendChild(dimText('(no classes)'));
    } else {
      classes.forEach(c => {
        const chip = el('span', 'display:inline-flex;align-items:center;gap:3px;padding:2px 6px;background:#2c2c2e;border:1px solid rgba(255,255,255,0.18);border-radius:4px;font-size:11px;cursor:default;');
        chip.textContent = c;
        const x = document.createElement('span');
        x.textContent = '×';
        x.style.cssText = 'cursor:pointer;color:#ff6b6b;margin-left:2px;';
        x.onclick = () => { el_.classList.remove(c); recordClassChange(el_, c, 'removed'); renderClassesSection(el_); };
        chip.appendChild(x);
        chipWrap.appendChild(chip);
      });
    }
    classesSection.appendChild(chipWrap);
  }

  function buildPickerSection() {
    const wrap = el('div', '');
    wrap.appendChild(labelEl('Add utility class'));

    const filterInput = document.createElement('input');
    filterInput.placeholder = 'Filter…';
    filterInput.style.cssText = 'width:100%;box-sizing:border-box;background:#111113;border:1px solid rgba(255,255,255,0.18);border-radius:4px;color:#f5f5f7;padding:4px 8px;font-size:11px;margin-bottom:6px;outline:none;';

    const list = el('div', 'display:flex;flex-direction:column;gap:2px;max-height:180px;overflow-y:auto;');

    function renderList(filter) {
      list.innerHTML = '';
      const groups = {};
      UTILITY_CLASSES.forEach(item => {
        if (filter && !item.cls.includes(filter) && !item.desc.toLowerCase().includes(filter)) return;
        if (!groups[item.group]) groups[item.group] = [];
        groups[item.group].push(item);
      });
      Object.entries(groups).forEach(([group, items]) => {
        const gLabel = document.createElement('div');
        gLabel.style.cssText = 'font-size:10px;color:#c0c0c5;text-transform:uppercase;letter-spacing:.06em;margin-top:4px;margin-bottom:2px;';
        gLabel.textContent = group;
        list.appendChild(gLabel);
        items.forEach(item => {
          const row = el('div', 'display:flex;align-items:center;justify-content:space-between;padding:3px 6px;border-radius:3px;cursor:pointer;border:1px solid transparent;');
          row.onmouseenter = () => row.style.background = '#2c2c2e';
          row.onmouseleave = () => row.style.background = '';
          const nameSpan = document.createElement('span');
          nameSpan.style.cssText = 'font-size:11px;color:#30d5c8;font-family:monospace;';
          nameSpan.textContent = '.' + item.cls;
          const descSpan = document.createElement('span');
          descSpan.style.cssText = 'font-size:10px;color:#c0c0c5;margin-left:6px;flex:1;text-align:right;';
          descSpan.textContent = item.desc;
          const addBtn = document.createElement('span');
          addBtn.textContent = '+';
          addBtn.style.cssText = 'color:#30d5c8;cursor:pointer;font-weight:700;margin-left:6px;font-size:13px;flex-shrink:0;';
          addBtn.onclick = (e) => {
            e.stopPropagation();
            if (!targetEl) return;
            targetEl.classList.add(item.cls);
            recordClassChange(targetEl, item.cls, 'added');
            renderClassesSection(targetEl);
            addBtn.style.color = '#7ed886';
            setTimeout(() => { addBtn.style.color = '#30d5c8'; }, 600);
          };
          row.appendChild(nameSpan);
          row.appendChild(descSpan);
          row.appendChild(addBtn);
          list.appendChild(row);
        });
      });
      if (list.childElementCount === 0) list.appendChild(dimText('No matches.'));
    }

    filterInput.oninput = () => renderList(filterInput.value.trim().toLowerCase());
    renderList('');
    wrap.appendChild(filterInput);
    wrap.appendChild(list);
    return wrap;
  }

  function buildVarsSection() {
    const wrap = el('div', '');
    wrap.appendChild(labelEl('CSS variables'));
    const grid = el('div', 'display:flex;flex-direction:column;gap:6px;');

    CSS_VARS.forEach(v => {
      const row = el('div', 'display:flex;align-items:center;gap:6px;');
      const picker = document.createElement('input');
      picker.type = 'color';
      picker.value = v.default;
      picker.style.cssText = 'width:28px;height:20px;padding:0;border:none;cursor:pointer;background:none;border-radius:3px;flex-shrink:0;';
      const live = getComputedStyle(document.documentElement).getPropertyValue(v.name).trim();
      if (live && /^#[0-9a-fA-F]{3,8}$/.test(live)) picker.value = live;

      const hexLabel = document.createElement('span');
      hexLabel.style.cssText = 'font-size:10px;color:#c0c0c5;width:54px;text-align:right;flex-shrink:0;';
      hexLabel.textContent = picker.value;

      picker.oninput = () => {
        document.documentElement.style.setProperty(v.name, picker.value);
        varChanges[v.name] = picker.value;
        hexLabel.textContent = picker.value;
      };

      const nameSpan = document.createElement('span');
      nameSpan.style.cssText = 'font-size:10px;color:#30d5c8;font-family:monospace;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      nameSpan.title = v.name;
      nameSpan.textContent = v.name;

      const resetX = document.createElement('span');
      resetX.textContent = '↺';
      resetX.title = 'Reset to default (' + v.default + ')';
      resetX.style.cssText = 'cursor:pointer;color:#c0c0c5;font-size:13px;flex-shrink:0;';
      resetX.onclick = () => {
        document.documentElement.style.setProperty(v.name, v.default);
        picker.value = v.default;
        hexLabel.textContent = v.default;
        delete varChanges[v.name];
      };

      row.appendChild(picker);
      row.appendChild(nameSpan);
      row.appendChild(hexLabel);
      row.appendChild(resetX);
      grid.appendChild(row);
    });

    wrap.appendChild(grid);
    return wrap;
  }

  function copyChanges() {
    const lines = [];
    if (Object.keys(varChanges).length > 0) {
      lines.push('/* CSS variable changes — apply to :root in style.css */');
      Object.entries(varChanges).forEach(([k, v]) => lines.push('  ' + k + ': ' + v + ';'));
      lines.push('');
    }
    if (Object.keys(classChanges).length > 0) {
      lines.push('/* Class changes — apply to HTML elements */');
      Object.entries(classChanges).forEach(([path, diff]) => {
        if (diff.added.length)   lines.push(path + '  →  ADD: ' + diff.added.join(' '));
        if (diff.removed.length) lines.push(path + '  →  REMOVE: ' + diff.removed.join(' '));
      });
      lines.push('');
    }
    if (lines.length === 0) lines.push('// No changes recorded.');
    const text = lines.join('\n');
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
    const b = panel.querySelector('[data-do-copybtn="1"]');
    if (b) { b.textContent = 'Copied!'; b.style.color = '#7ed886'; setTimeout(() => { b.textContent = 'Copy changes'; b.style.color = '#30d5c8'; }, 1500); }
  }

  function resetVars() {
    CSS_VARS.forEach(v => { document.documentElement.style.removeProperty(v.name); delete varChanges[v.name]; });
    const body = panel.querySelector('div[style*="overflow-y:auto"]');
    if (body) {
      body.removeChild(body.lastChild);
      body.removeChild(body.lastChild);
      varsSection = buildVarsSection();
      body.appendChild(hr());
      body.appendChild(varsSection);
    }
  }

  function recordClassChange(el_, cls, type) {
    const path = elPath(el_);
    if (!classChanges[path]) classChanges[path] = { added: [], removed: [] };
    const opp = type === 'added' ? 'removed' : 'added';
    const idx = classChanges[path][opp].indexOf(cls);
    if (idx !== -1) classChanges[path][opp].splice(idx, 1);
    else classChanges[path][type].push(cls);
  }

  function elPath(el_) {
    const parts = [];
    let node = el_;
    while (node && node !== document.body) {
      let sel = node.tagName.toLowerCase();
      if (node.id) sel += '#' + node.id;
      else if (node.className && typeof node.className === 'string') sel += '.' + node.className.trim().split(/\s+/)[0];
      parts.unshift(sel);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function injectStyles() {
    const s = document.createElement('style');
    s.id = 'do-styles';
    s.textContent = '[data-do-hl]{outline:2px solid #30d5c8!important;outline-offset:2px!important;box-shadow:0 0 0 4px rgba(48,213,200,0.15)!important;}#do-panel ::-webkit-scrollbar{width:4px;}#do-panel ::-webkit-scrollbar-track{background:transparent;}#do-panel ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.2);border-radius:2px;}';
    document.head.appendChild(s);
  }

  function el(tag, css) { const d = document.createElement(tag); if (css) d.style.cssText = css; return d; }
  function labelEl(text) { const d = document.createElement('div'); d.style.cssText = 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#c0c0c5;margin-bottom:5px;margin-top:2px;'; d.textContent = text; return d; }
  function dimText(text) { const d = document.createElement('div'); d.style.cssText = 'font-size:11px;color:#c0c0c5;'; d.textContent = text; return d; }
  function hr() { const d = document.createElement('div'); d.style.cssText = 'border-top:1px solid rgba(255,255,255,0.1);margin:10px 0;'; return d; }
  function mkBtn(text, color, onclick) {
    const b = document.createElement('button');
    b.textContent = text;
    if (text === 'Copy changes') b.setAttribute('data-do-copybtn', '1');
    b.style.cssText = 'background:none;border:1px solid ' + color + ';color:' + color + ';padding:4px 10px;border-radius:4px;font-size:11px;cursor:pointer;font-family:inherit;flex:1;';
    b.onmouseenter = () => b.style.opacity = '0.7';
    b.onmouseleave = () => b.style.opacity = '1';
    b.onclick = onclick;
    return b;
  }

  window.designOverlayToggle = toggle;
  injectStyles();
  init();
  console.log('%c⬡ Design Overlay loaded — Cmd+Shift+D to toggle', 'color:#30d5c8;font-weight:bold;');
})();
