// ╔══════════════════════════════════════════════════════════════════════════════
// ║ core-srs.js
// ║ DrillSRS — SM-2 spaced repetition engine used by all drills.
// ║ Pure data structure, no DOM dependencies.
// ║ Depends on: core-foundation.js (Storage, STORAGE_KEYS, window.db)
// ╚══════════════════════════════════════════════════════════════════════════════

function rateListen(rating)          { SRS.rate(rating); }
function toggleSrsTracking()         { SRS.toggleProgress(); }
// Update badge on load
document.addEventListener('DOMContentLoaded', () => setTimeout(() => SRS._updateBadge(), 500));

// ═══════════════════════════════════════════════════════
// DRILL SRS
// Shared SM-2 engine for all drills (counters, conjugation, times).
// Each drill has its own storage key. Items are keyed by a string ID.
// ═══════════════════════════════════════════════════════

const DrillSRS = {

  // ── SM-2 constants ────────────────────────────────────
  EASE_DEFAULT: 2.5,
  EASE_MIN:     1.3,
  EASE_MAX:     3.0,
  MAX_INTERVAL: 90,
  HISTORY_MAX:  20,

  // Intervals for first exposure (days)
  BASE_INTERVAL: { correct: 1, wrong: 0 },

  // ── Storage ───────────────────────────────────────────
  // _cache provides synchronous reads throughout the SM-2 logic.
  // SQL is the persistent backend; localStorage is kept as fallback only.
  // Call DrillSRS.hydrate(storageKey) on startup to populate _cache from SQL.
  _cache: {},

  // Map storageKey → drill_type string used in srs_items table
  _drillType(storageKey) {
    const map = {
      [STORAGE_KEYS.DRILL_SRS_WORDS]:    'words',
      [STORAGE_KEYS.DRILL_SRS_COUNTERS]: 'counters',
      [STORAGE_KEYS.DRILL_SRS_CONJ]:     'conjugation',
      [STORAGE_KEYS.DRILL_SRS_TIMES]:    'times',
    };
    return map[storageKey] || storageKey;
  },

  // Load SQL rows into _cache for a drill type. Call once at startup per drill.
  async hydrate(storageKey) {
    try {
      if (typeof window === 'undefined' || !window.db) throw new Error('no db');
      const drillType = this._drillType(storageKey);
      const rows = await window.db.query(
        'SELECT item_key, interval, ease, due_date, history, seen FROM srs_items WHERE drill_type = ?',
        [drillType]
      );
      if (!rows || rows.error || !rows.length) throw new Error('empty');
      const data = {};
      for (const r of rows) {
        data[r.item_key] = {
          interval: r.interval ?? 0,
          ease:     r.ease    ?? this.EASE_DEFAULT,
          due:      r.due_date ? new Date(r.due_date).getTime() : 0,
          history:  (() => { try { return JSON.parse(r.history || '[]'); } catch(e) { return []; } })(),
          seen:     r.seen    ?? 0,
        };
      }
      this._cache[storageKey] = data;
      console.log(`DrillSRS hydrated [${drillType}]: ${rows.length} items from SQL`);
      return true;
    } catch(e) {
      // Fall back to localStorage
      if (!this._cache[storageKey]) {
        this._cache[storageKey] = (App.Storage || window.Storage).getJSON(storageKey, {});
      }
      console.log(`DrillSRS [${this._drillType(storageKey)}]: using localStorage (${Object.keys(this._cache[storageKey]).length} items)`);
      return false;
    }
  },

  getAll(storageKey) {
    if (!this._cache[storageKey]) {
      // Synchronous fallback — hydrate() should have been called at startup
      this._cache[storageKey] = (App.Storage || window.Storage).getJSON(storageKey, {});
    }
    return this._cache[storageKey];
  },

  saveAll(storageKey, data) {
    this._cache[storageKey] = data;
    // Always write localStorage as fallback
    (App.Storage || window.Storage).setJSON(storageKey, data);
    // Dual-write to SQL — fire-and-forget, one upsert per changed item
    if (typeof window !== 'undefined' && window.db) {
      const drillType = this._drillType(storageKey);
      const now = new Date().toISOString();
      for (const [itemKey, item] of Object.entries(data)) {
        window.db.run(
          `INSERT INTO srs_items (item_key, drill_type, interval, ease, due_date, history, seen, last_reviewed)
           VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(item_key, drill_type) DO UPDATE SET
             interval=excluded.interval, ease=excluded.ease,
             due_date=excluded.due_date, history=excluded.history,
             seen=excluded.seen, last_reviewed=excluded.last_reviewed`,
          [itemKey, drillType,
           item.interval ?? 0, item.ease ?? 2.5,
           item.due ? new Date(item.due).toISOString() : null,
           JSON.stringify(item.history || []),
           item.seen ?? 0, now]
        ).catch(() => {});
      }
    }
  },

  get(storageKey, itemId) {
    return this.getAll(storageKey)[itemId] || null;
  },

  // ── Core scheduling ───────────────────────────────────
  // Call after each answer. correct = bool.
  record(storageKey, itemId, correct) {
    const all  = this.getAll(storageKey);
    const now  = Date.now();
    const item = all[itemId] || {
      interval: 0,
      ease:     this.EASE_DEFAULT,
      history:  [],
      due:      0,
    };

    item.history = item.history || [];
    item.history.push({ t: now, correct });
    if (item.history.length > this.HISTORY_MAX) {
      item.history = item.history.slice(-this.HISTORY_MAX);
    }

    if (!correct) {
      // Wrong: reset to 0, show again in this session (due = now)
      item.interval = 0;
      item.ease     = Math.max(this.EASE_MIN, item.ease - 0.2);
      item.due      = now;
    } else if (item.interval === 0) {
      // First correct: due tomorrow
      item.interval = 1;
      item.due      = now + 86400000;
    } else {
      // Subsequent correct: grow by ease factor
      item.interval = Math.min(
        this.MAX_INTERVAL,
        Math.round(item.interval * item.ease)
      );
      item.ease = Math.min(this.EASE_MAX, item.ease + 0.1);
      item.due  = now + item.interval * 86400000;
    }

    item.lastCorrect = correct;
    item.seen        = (item.seen || 0) + 1;
    all[itemId]      = item;
    this.saveAll(storageKey, all);
    return item;
  },

  // ── Pool building ─────────────────────────────────────
  // Given a list of item IDs, returns them weighted by priority:
  //   1. Due (overdue) items — always included, weighted ×3
  //   2. New items (never seen) — up to newSlots
  //   3. Recently wrong (due = now) — ×2 weight
  //   4. Resting items — occasional
  buildPool(storageKey, allIds, { maxSize = 20, newSlots = 6 } = {}) {
    const data = this.getAll(storageKey);
    const now  = Date.now();

    const due     = []; // overdue
    const fresh   = []; // never seen
    const wrong   = []; // just got wrong (due = now, interval = 0)
    const resting = []; // seen, not due yet

    for (const id of allIds) {
      const d = data[id];
      if (!d || d.seen === 0) {
        fresh.push(id);
      } else if (d.interval === 0) {
        wrong.push(id);    // recently wrong — repeat soon
      } else if (d.due <= now) {
        due.push(id);      // overdue — priority
      } else {
        resting.push(id);
      }
    }

    // Build weighted pool
    const pool = [];
    // Due items ×3 weight
    for (const id of due) { pool.push(id, id, id); }
    // Wrong items ×2 weight
    for (const id of wrong) { pool.push(id, id); }
    // Fresh items up to newSlots
    for (const id of fresh.slice(0, newSlots)) pool.push(id);
    // A few resting items for variety
    const restSlots = Math.max(2, maxSize - pool.length);
    const restSample = resting.sort(() => Math.random() - 0.5).slice(0, restSlots);
    for (const id of restSample) pool.push(id);

    return pool.length ? pool : allIds; // fallback: use everything
  },

  // Pick a random item from the pool (weighted)
  pick(pool) {
    return pool[Math.floor(Math.random() * pool.length)];
  },

  // ── Stats ─────────────────────────────────────────────
  stats(storageKey, allIds) {
    const data     = this.getAll(storageKey);
    const now      = Date.now();
    const seen     = allIds.filter(id => data[id]?.seen > 0).length;
    const due      = allIds.filter(id => {
      const d = data[id];
      return d?.seen > 0 && d.due <= now && d.interval > 0;
    }).length;
    const mastered = allIds.filter(id => (data[id]?.interval || 0) >= 7).length;
    return { total: allIds.length, seen, due, mastered };
  },

  // Clear all data for a drill
  reset(storageKey) {
    this._cache[storageKey] = {};
    (App.Storage || window.Storage).setJSON(storageKey, {});
    if (typeof window !== 'undefined' && window.db) {
      window.db.run('DELETE FROM srs_items WHERE drill_type = ?', [this._drillType(storageKey)]).catch(() => {});
    }
  },
};

// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// COUNTER REFERENCE (Grammar Notes — Counters tab)
// ═══════════════════════════════════════════════════════

const CTR_PROBLEM_NUMS = [1, 6, 8, 10];

function ctrRefInit() {
  ctrRefRenderGrid();
  ctrRefPopulateSelects();
}

function ctrRefRenderGrid() {
  const el = document.getElementById('ctrRefGrid');
  if (!el) return;
  const keys = Object.keys(COUNTER_DATA);

  // Build a map of all readings for problem numbers
  // Colour code: detect contractions (small っ, voiced, p/b/m change)
  function isContracted(reading) {
    return /っ/.test(reading) || /ぽん|ぴき|ぱい|ほ゛/.test(reading);
  }
  function isVoiced(reading, base) {
    // Compare with base (un-contracted) — voiced = ぼ ば び ぶ べ
    return /ぼ|ば|び|ぶ|べ/.test(reading);
  }

  let html = '<table style="border-collapse:collapse;font-size:0.82rem;width:100%">';
  
  // Header row
  html += '<thead><tr>';
  html += '<th style="padding:6px 10px 6px 0;text-align:left;font-family:var(--ui);font-size:0.7rem;color:var(--ink-light);border-bottom:1px solid var(--border)">Counter</th>';
  for (const n of CTR_PROBLEM_NUMS) {
    html += `<th style="padding:6px 8px;text-align:center;font-family:var(--ui);font-size:0.7rem;color:var(--ink-light);border-bottom:1px solid var(--border)">${n}</th>`;
  }
  html += '<th style="padding:6px 0 6px 8px;text-align:left;font-family:var(--ui);font-size:0.7rem;color:var(--ink-light);border-bottom:1px solid var(--border)">Pattern</th>';
  html += '</tr></thead><tbody>';

  for (const key of keys) {
    const c = COUNTER_DATA[key];
    html += '<tr>';
    html += `<td style="padding:7px 10px 7px 0;white-space:nowrap">
      <span style="font-family:var(--jp);font-size:1rem">${c.name}</span>
      <span style="font-family:var(--ui);font-size:0.7rem;color:var(--ink-light);margin-left:4px">${c.desc}</span>
    </td>`;
    
    const readings = [];
    for (const n of CTR_PROBLEM_NUMS) {
      const r = c.readings[n] || '—';
      readings.push(r);
      const contracted = isContracted(r);
      const bg = contracted ? 'rgba(255,200,60,0.15)' : '';
      const color = contracted ? 'var(--gold)' : 'var(--ink)';
      html += `<td style="padding:7px 8px;text-align:center;background:${bg};border-radius:4px">
        <span style="font-family:var(--jp);font-size:0.9rem;color:${color};cursor:pointer"
          onclick="ctrRefSetCompare('${key}')"
          title="Click to compare ${c.name}">${r}</span>
      </td>`;
    }

    // Pattern summary
    const contracted_at = CTR_PROBLEM_NUMS.filter(n => isContracted(c.readings[n] || ''));
    const pattern = contracted_at.length === 0 ? 'no contractions'
      : contracted_at.length === CTR_PROBLEM_NUMS.length ? 'contracts at 1,6,8,10'
      : 'contracts at ' + contracted_at.join(',');
    html += `<td style="padding:7px 0 7px 8px;font-family:var(--ui);font-size:0.7rem;color:var(--ink-light);white-space:nowrap">${pattern}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table>';
  html += '<div style="font-family:var(--ui);font-size:0.7rem;color:var(--ink-light);margin-top:8px">'
        + '<span style="display:inline-block;background:rgba(255,200,60,0.15);border-radius:3px;padding:1px 6px;color:var(--gold);margin-right:6px">amber</span>'
        + 'contraction / sound change &nbsp;·&nbsp; click any reading to compare</div>';
  el.innerHTML = html;
}

// Track which counter was last clicked for quick compare
// KanjiCorpusState — see below
function ctrRefSetCompare(key) {
  const selA = document.getElementById('ctrCompareA');
  const selB = document.getElementById('ctrCompareB');
  if (!selA || !selB) return;
  if (!selA.value || selA.value === key) {
    selA.value = key;
  } else if (!selB.value || selB.value === key) {
    selB.value = key;
  } else {
    // Replace B
    selB.value = key;
  }
  ctrRenderCompare();
}

function ctrRefPopulateSelects() {
  const selA = document.getElementById('ctrCompareA');
  const selB = document.getElementById('ctrCompareB');
  if (!selA || !selB) return;
  const opts = Object.entries(COUNTER_DATA)
    .map(([k, c]) => `<option value="${k}">${c.name} (${c.desc})</option>`)
    .join('');
  selA.innerHTML = '<option value="">Counter A…</option>' + opts;
  selB.innerHTML = '<option value="">Counter B…</option>' + opts;
}

function ctrRenderCompare() {
  const keyA = document.getElementById('ctrCompareA')?.value;
  const keyB = document.getElementById('ctrCompareB')?.value;
  const el   = document.getElementById('ctrCompareResult');
  if (!el) return;
  if (!keyA || !keyB || keyA === keyB) {
    el.innerHTML = keyA === keyB && keyA
      ? '<div style="color:var(--ink-light);font-family:var(--ui);font-size:0.8rem">Pick two different counters.</div>'
      : '';
    return;
  }

  const a = COUNTER_DATA[keyA];
  const b = COUNTER_DATA[keyB];
  const nums = [1,2,3,4,5,6,7,8,9,10];

  let html = '<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%">';
  
  // Emoji strips for each counter (show all 5 examples)
  const emojiA = a.emoji.join(' ');
  const emojiB = b.emoji.join(' ');

  // Header
  html += '<thead>';
  // Emoji row
  html += '<tr style="border-bottom:1px solid var(--border)">';
  html += `<td style="padding:8px 8px 4px;text-align:center;font-size:1.3rem;line-height:1.4">${emojiA}</td>`;
  html += '<td style="padding:4px"></td>';
  html += `<td style="padding:8px 8px 4px;text-align:center;font-size:1.3rem;line-height:1.4">${emojiB}</td>`;
  html += '</tr>';
  // Counter name row
  html += '<tr>';
  html += `<th style="padding:4px 8px 8px;font-family:var(--jp);font-size:1rem;text-align:center;border-bottom:2px solid var(--border)">${a.name} <span style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light);font-weight:400">${a.desc}</span></th>`;
  html += '<th style="padding:4px;font-family:var(--ui);font-size:0.7rem;color:var(--ink-light);text-align:center;border-bottom:2px solid var(--border)">#</th>';
  html += `<th style="padding:4px 8px 8px;font-family:var(--jp);font-size:1rem;text-align:center;border-bottom:2px solid var(--border)">${b.name} <span style="font-family:var(--ui);font-size:0.72rem;color:var(--ink-light);font-weight:400">${b.desc}</span></th>`;
  html += '</tr>';
  html += '</thead><tbody>';

  for (const n of nums) {
    const ra = a.readings[n] || '—';
    const rb = b.readings[n] || '—';
    
    // Compare: identical, same suffix, different
    const identical = ra === rb;
    // Extract suffix (everything after the number-prefix sound)
    const suffixA = ra.replace(/^(いっ|いち|ひと|ふた|に|さん|よ|よん|ご|ろっ|ろく|なな|はっ|はち|きゅう|じゅっ|じゅう|とお|ここの|やっ|むっ)/, '');
    const suffixB = rb.replace(/^(いっ|いち|ひと|ふた|に|さん|よ|よん|ご|ろっ|ろく|なな|はっ|はち|きゅう|じゅっ|じゅう|とお|ここの|やっ|むっ)/, '');
    const sameSuffix = !identical && suffixA === suffixB;
    
    const rowBg = identical ? 'rgba(48,213,200,0.08)' : '';
    const colorA = identical ? 'var(--teal)' : sameSuffix ? 'var(--gold)' : 'var(--ink)';
    const colorB = identical ? 'var(--teal)' : sameSuffix ? 'var(--gold)' : 'var(--ink)';
    const numColor = n === 1 || n === 6 || n === 8 || n === 10 ? 'var(--gold)' : 'var(--ink-light)';

    html += `<tr style="background:${rowBg};border-bottom:1px solid var(--border)">
      <td style="padding:7px 8px;text-align:center;font-family:var(--jp);font-size:0.95rem;color:${colorA}">${ra}</td>
      <td style="padding:7px 4px;text-align:center;font-family:var(--ui);font-size:0.78rem;font-weight:700;color:${numColor}">${n}</td>
      <td style="padding:7px 8px;text-align:center;font-family:var(--jp);font-size:0.95rem;color:${colorB}">${rb}</td>
    </tr>`;
  }

  html += '</tbody></table></div>';
  html += '<div style="font-family:var(--ui);font-size:0.7rem;color:var(--ink-light);margin-top:8px;display:flex;gap:16px">'
        + '<span><span style="color:var(--teal)">■</span> identical</span>'
        + '<span><span style="color:var(--gold)">■</span> same suffix, different prefix</span>'
        + '<span><span style="color:var(--gold);font-weight:700">bold number</span> = problem number</span>'
        + '</div>';
  el.innerHTML = html;
}

// ═══════════════════════════════════════════════════════
// KANJI CORPUS MODULE
// Collects kanji from lookups and writing panel production.
// Storage key: STORAGE_KEYS.KANJI_CORPUS ('jpKanjiCorpus')
// Record: { char, firstSeen, firstSeenCtx, firstSeenPanel,
//           lookupCount, lookupDates[],
//           produced, firstProduced, firstProducedCtx,
//           productionCount, monthlyProduction:{YYYY-MM:count} }
// ═══════════════════════════════════════════════════════

function kanjiCorpusGet() {
  return (App.Storage || window.Storage).getJSON(STORAGE_KEYS.KANJI_CORPUS, {});
}
function kanjiCorpusSave(data) {
  (App.Storage || window.Storage).setJSON(STORAGE_KEYS.KANJI_CORPUS, data);
}

// Fire-and-forget SQL upsert for a single corpus_entries row.
function _corpusEntriesUpsert(word, entry, ts) {
  if (typeof window === 'undefined' || !window.db) return;
  window.db.run(
    `INSERT INTO corpus_entries
       (word, first_seen, first_seen_context, first_seen_panel,
        lookup_count, produced, first_produced, first_produced_context,
        production_count, chat_production_count, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(word) DO UPDATE SET
       lookup_count          = MAX(excluded.lookup_count, lookup_count),
       produced              = MAX(excluded.produced, produced),
       first_produced        = COALESCE(first_produced, excluded.first_produced),
       first_produced_context= COALESCE(first_produced_context, excluded.first_produced_context),
       production_count      = MAX(excluded.production_count, production_count),
       chat_production_count = MAX(excluded.chat_production_count, chat_production_count),
       updated_at            = excluded.updated_at`,
    [word,
     entry.firstSeen || ts, entry.firstSeenCtx || word.slice(0,40), entry.firstSeenPanel || 'translate',
     entry.lookupCount || 0,
     entry.produced ? 1 : 0,
     entry.firstProduced || null, entry.firstProducedCtx || null,
     entry.productionCount || 0, entry.chatProductionCount || 0,
     ts]
  ).catch(() => {});
}

// Extract kanji characters from a string
function kanjiExtract(str) {
  return [...(str || '')].filter(ch => {
    const cp = ch.codePointAt(0);
    return (cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF);
  });
}

// Record a lookup (from quick translate)
function kanjiCorpusRecordLookup(word, context) {
  const kanji = kanjiExtract(word);
  if (!kanji.length) return;
  const corpus = kanjiCorpusGet();
  const now    = new Date();
  const ts     = now.toISOString();
  const ctx    = (context || word).slice(0, 40);

  for (const ch of kanji) {
    if (!corpus[ch]) {
      corpus[ch] = {
        char: ch, firstSeen: ts, firstSeenCtx: ctx, firstSeenPanel: 'translate',
        lookupCount: 0, lookupDates: [],
        produced: false, firstProduced: null, firstProducedCtx: null,
        productionCount: 0, monthlyProduction: {}
      };
    }
    if (word.length > 1 && !corpus[ch].translateMeaning) corpus[ch].translateMeaning = word;
    corpus[ch].lookupCount++;
    (corpus[ch].lookupDates ??= []).push(ts);
    if (corpus[ch].lookupDates.length > 100) corpus[ch].lookupDates = corpus[ch].lookupDates.slice(-100);
    // SQL dual-write
    _corpusEntriesUpsert(ch, corpus[ch], ts);
    if (typeof window !== 'undefined' && window.db) {
      window.db.run('INSERT INTO corpus_lookups (word, looked_up_at, context) VALUES (?,?,?)', [ch, ts, ctx]).catch(() => {});
    }
  }
  kanjiCorpusSave(corpus);
}

// Record production (from chat/voice)
function kanjiCorpusRecordChatProduction(text) {
  const kanji = kanjiExtract(text);
  if (!kanji.length) return;
  const corpus = kanjiCorpusGet();
  const now    = new Date();
  const ts     = now.toISOString();
  const month  = ts.slice(0, 7);
  for (const ch of kanji) {
    if (!corpus[ch]) {
      corpus[ch] = {
        char: ch, firstSeen: ts, firstSeenCtx: text.slice(0,40), firstSeenPanel: 'chat',
        lookupCount: 0, lookupDates: [],
        produced: false, firstProduced: null, firstProducedCtx: null,
        productionCount: 0, monthlyProduction: {},
        chatProductionCount: 0, monthlyChat: {}
      };
    }
    const r = corpus[ch];
    if (!r.produced) { r.produced = true; r.firstProduced = ts; r.firstProducedCtx = text.slice(0,40); }
    r.chatProductionCount = (r.chatProductionCount || 0) + 1;
    r.monthlyChat = r.monthlyChat || {};
    r.monthlyChat[month] = (r.monthlyChat[month] || 0) + 1;
    // SQL dual-write
    _corpusEntriesUpsert(ch, r, ts);
    if (typeof window !== 'undefined' && window.db) {
      window.db.run('INSERT INTO corpus_productions (word, produced_at, source, context) VALUES (?,?,?,?)',
        [ch, ts, 'chat', text.slice(0,40)]).catch(() => {});
    }
  }
  kanjiCorpusSave(corpus);
}

function kanjiCorpusRecordProduction(text, context) {
  const kanji = kanjiExtract(text);
  if (!kanji.length) return;
  const corpus = kanjiCorpusGet();
  const now    = new Date();
  const ts     = now.toISOString();
  const month  = ts.slice(0, 7);
  const ctx    = (context || text).slice(0, 40);

  for (const ch of kanji) {
    if (!corpus[ch]) {
      corpus[ch] = {
        char: ch, firstSeen: ts, firstSeenCtx: ctx, firstSeenPanel: 'writing',
        lookupCount: 0, lookupDates: [],
        produced: false, firstProduced: null, firstProducedCtx: null,
        productionCount: 0, monthlyProduction: {}
      };
    }
    const r = corpus[ch];
    if (!r.produced) { r.produced = true; r.firstProduced = ts; r.firstProducedCtx = ctx; }
    r.productionCount++;
    r.monthlyProduction[month] = (r.monthlyProduction[month] || 0) + 1;
    // SQL dual-write
    _corpusEntriesUpsert(ch, r, ts);
    if (typeof window !== 'undefined' && window.db) {
      window.db.run('INSERT INTO corpus_productions (word, produced_at, source, context) VALUES (?,?,?,?)',
        [ch, ts, 'writing', ctx]).catch(() => {});
    }
  }
  kanjiCorpusSave(corpus);
}

// ── Display ──────────────────────────────────────────────

// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, {
    DrillSRS,
    rateListen,
    toggleSrsTracking,
    ctrRefInit,
    ctrRefRenderGrid,
    ctrRefSetCompare,
    ctrRefPopulateSelects,
    ctrRenderCompare,
    kanjiCorpusGet,
    kanjiCorpusSave,
    kanjiExtract,
    kanjiCorpusRecordLookup,
    kanjiCorpusRecordChatProduction,
    kanjiCorpusRecordProduction,
  });
} catch(e) { console.error('[core-srs] App registry failed:', e); }
