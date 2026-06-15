// ╔══════════════════════════════════════════════════════════════════════════════
// ║ core-foundation.js
// ║ Foundational layer — loaded first, everything else depends on this.
// ║ Contains: utilities, data loader, corpus/SRS hydration, quick-translate,
// ║           STORAGE_KEYS, Storage, claudeAPI, state, nav, settings.
// ╚══════════════════════════════════════════════════════════════════════════════

// ── Utilities (must be first — used everywhere) ──────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── App registry ──────────────────────────────────────────────────────────────
// Central namespace for all cross-file exports.
// Files register via Object.assign(App, {...}) at their end.
// Replaces scattered window['x'] = x exports progressively.
// Use App.x() for cross-file calls; direct calls within a file stay as-is.
const App = Object.create(null);
window.App = App;

function formatDate(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  } catch(e) { return ts; }
}


// ── Static data loader ───────────────────────────────────────────────────────
// Data files live in the same folder as index.html
let COUNTER_DATA = {};
let RTK_KANJI = [];
let KANJI_JLPT_LEVEL = {};
let KANJI_MEANINGS = {};
let JLPT_WORDS = [];
let HIRAGANA = [];
let KATAKANA = [];
let KATAKANA_DAKUTEN = [];
let KATAKANA_HANDAKUTEN = [];
let KATAKANA_EXTENDED = [];
let GRAMMAR_POINTS = [];
let DEFAULT_VOCAB = [];
let VERBS_U = [];
let VERBS_RU = [];
let VERBS_IRR = [];
let ADJ_I = [];
let ADJ_NA = [];
let _dataLoaded = false;

Promise.all([
  fetch('./src/data/counter_data.json').then(r => r.json()),
  fetch('./src/data/rtk_kanji.json').then(r => r.json()),
  fetch('./src/data/kanji_jlpt_level.json').then(r => r.json()),
  fetch('./src/data/kanji_meanings.json').then(r => r.json()),
  fetch('./src/data/kana_data.json').then(r => r.json()),
  fetch('./src/data/grammar_points.json').then(r => r.json()),
  fetch('./src/data/default_vocab.json').then(r => r.json()),
  fetch('./src/data/conjugation_data.json').then(r => r.json()),
]).then(async ([counters, rtk, jlpt, meanings, kana, gramPoints, vocab, conj]) => {
  COUNTER_DATA     = counters;
  RTK_KANJI        = rtk;
  KANJI_JLPT_LEVEL = jlpt;
  KANJI_MEANINGS   = meanings;
  HIRAGANA         = kana.HIRAGANA;
  KATAKANA         = kana.KATAKANA;
  KATAKANA_DAKUTEN = kana.KATAKANA_DAKUTEN;
  KATAKANA_HANDAKUTEN = kana.KATAKANA_HANDAKUTEN;
  KATAKANA_EXTENDED   = [...(kana.KATAKANA_DAKUTEN||[]), ...(kana.KATAKANA_HANDAKUTEN||[])];
  GRAMMAR_POINTS   = gramPoints;
  DEFAULT_VOCAB    = vocab;
  VERBS_U          = conj.VERBS_U;
  VERBS_RU         = conj.VERBS_RU;
  VERBS_IRR        = conj.VERBS_IRR;
  ADJ_I            = conj.ADJ_I;
  ADJ_NA           = conj.ADJ_NA;

  // ── Load JLPT_WORDS from SQL (source of truth). Fall back to JSON fetch
  //    in browser/dev mode where window.db IPC is unavailable.
  try {
    if (typeof window === 'undefined' || !window.db) throw new Error('window.db not available');
    // preload exposes window.db.query(sql, params) → rows[]
    const rows = await window.db.query('SELECT word, reading, meaning, level, pitch, frequency, pos, verb_class, is_auxiliary, list_source FROM words ORDER BY level, frequency');
    if (rows && !rows.error && rows.length) {
      // Normalise SQL rows to the {w,r,m,l,p,f,pos,...} shape the rest of the
      // app expects, so nothing else needs changing yet.
      JLPT_WORDS = rows.map(row => ({
        w:            row.word,
        r:            row.reading,
        m:            row.meaning,
        l:            row.level,
        p:            row.pitch,
        f:            row.frequency,
        pos:          row.pos,
        verb_class:   row.verb_class,
        is_auxiliary: row.is_auxiliary,
        list_source:  row.list_source,
      }));
      console.log(`JLPT_WORDS loaded from SQL: ${JLPT_WORDS.length} words`);
    } else {
      throw new Error('SQL returned no words — falling back to JSON');
    }
  } catch (sqlErr) {
    console.warn('words SQL load fallback to JSON:', sqlErr.message);
    try {
      JLPT_WORDS = await fetch('./src/data/jlpt_words.json').then(r => r.json());
      console.log(`JLPT_WORDS loaded from JSON fallback: ${JLPT_WORDS.length} words`);
    } catch (jsonErr) {
      console.warn('jlpt_words.json not found either:', jsonErr.message);
      JLPT_WORDS = [];
    }
  }

  _dataLoaded = true;
  console.log(`Data loaded: ${Object.keys(counters).length} counters, ${rtk.length} RTK, ${JLPT_WORDS.length} JLPT words, ${vocab.length} vocab`);

  // ── Hydrate in-memory caches from SQL so vcBuildList/renderLookupsTable
  //    work from SQL data rather than stale localStorage blobs.
  //    Falls back silently — localStorage values remain valid if SQL isn't ready.
  if (typeof window !== 'undefined' && window.db) {
    // ── One-time historical backfill ─────────────────────────────────────────
    // Runs only if corpus_entries is still empty (first launch after migration).
    // Reads the full historical localStorage blobs and seeds SQL from them.
    try {
      const existingCount = await window.db.query('SELECT COUNT(*) as n FROM corpus_entries');
      const isEmpty = !existingCount?.length || (existingCount[0]?.n ?? 0) === 0;

      if (isEmpty) {
        // ── Backfill from jpKanjiCorpus ──────────────────────────────────────
        const historicCorpus = Storage.getJSON(STORAGE_KEYS.KANJI_CORPUS, {});
        const corpusEntries  = Object.values(historicCorpus);
        if (corpusEntries.length) {
          for (const r of corpusEntries) {
            const ts = r.firstSeen || new Date().toISOString();
            // corpus_entries row
            await window.db.run(
              `INSERT OR IGNORE INTO corpus_entries
                 (word, first_seen, first_seen_context, first_seen_panel,
                  lookup_count, produced, first_produced, first_produced_context,
                  production_count, chat_production_count, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
              [r.char, ts, r.firstSeenCtx || null, r.firstSeenPanel || 'translate',
               r.lookupCount || 0,
               r.produced ? 1 : 0,
               r.firstProduced || null, r.firstProducedCtx || null,
               r.productionCount || 0, r.chatProductionCount || 0,
               r.firstSeen || ts]
            ).catch(() => {});
            // Reconstruct individual lookup rows from lookupDates[]
            for (const date of (r.lookupDates || [])) {
              await window.db.run(
                'INSERT OR IGNORE INTO corpus_lookups (word, looked_up_at, context) VALUES (?,?,?)',
                [r.char, date, r.firstSeenCtx || null]
              ).catch(() => {});
            }
            // Reconstruct production rows from monthlyProduction breakdown
            for (const [month, count] of Object.entries(r.monthlyProduction || {})) {
              for (let i = 0; i < count; i++) {
                await window.db.run(
                  'INSERT OR IGNORE INTO corpus_productions (word, produced_at, source, context) VALUES (?,?,?,?)',
                  [r.char, month + '-15T00:00:00.000Z', 'writing', r.firstProducedCtx || null]
                ).catch(() => {});
              }
            }
            for (const [month, count] of Object.entries(r.monthlyChat || {})) {
              for (let i = 0; i < count; i++) {
                await window.db.run(
                  'INSERT OR IGNORE INTO corpus_productions (word, produced_at, source, context) VALUES (?,?,?,?)',
                  [r.char, month + '-15T00:00:00.000Z', 'chat', r.firstSeenCtx || null]
                ).catch(() => {});
              }
            }
          }
          console.log(`Backfilled ${corpusEntries.length} kanji corpus entries from localStorage → SQL`);
        }

        // ── Backfill from jpTranslateCache ───────────────────────────────────
        const historicCache  = Storage.getJSON(STORAGE_KEYS.TRANSLATE_CACHE, {});
        const cacheEntries   = Object.entries(historicCache);
        if (cacheEntries.length) {
          for (const [word, entry] of cacheEntries) {
            const hasJp = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(word);
            if (!hasJp) continue; // skip pure-EN keys
            const ts  = entry.firstLookup || entry.lastLookup || new Date().toISOString();
            const ctx = (entry.jp || word).slice(0, 40);
            await window.db.run(
              `INSERT INTO corpus_entries
                 (word, first_seen, first_seen_context, first_seen_panel, lookup_count, updated_at)
               VALUES (?,?,?,'translate',?,?)
               ON CONFLICT(word) DO UPDATE SET
                 lookup_count = MAX(excluded.lookup_count, lookup_count),
                 updated_at   = excluded.updated_at`,
              [word, ts, ctx, entry.count || 1, entry.lastLookup || ts]
            ).catch(() => {});
            // One lookup row per count (capped at 50 to avoid flooding)
            const count = Math.min(entry.count || 1, 50);
            for (let i = 0; i < count; i++) {
              await window.db.run(
                'INSERT OR IGNORE INTO corpus_lookups (word, looked_up_at, context) VALUES (?,?,?)',
                [word, entry.lastLookup || ts, ctx]
              ).catch(() => {});
            }
          }
          console.log(`Backfilled ${cacheEntries.length} translate cache entries from localStorage → SQL`);
        }
      }
    } catch(e) { console.warn('Historical backfill failed:', e.message); }
    try {
      const ceRows = await window.db.query(
        'SELECT word, first_seen, first_seen_panel, lookup_count, produced, first_produced, production_count, chat_production_count, updated_at FROM corpus_entries'
      );
      if (ceRows && !ceRows.error && ceRows.length) {
        // Pull lookup detail from corpus_lookups for last/first timestamps
        const lookupRows = await window.db.query(
          'SELECT word, looked_up_at FROM corpus_lookups ORDER BY looked_up_at ASC'
        );
        const lookupsByWord = {};
        for (const r of (lookupRows || [])) {
          if (!lookupsByWord[r.word]) lookupsByWord[r.word] = [];
          lookupsByWord[r.word].push(r.looked_up_at);
        }
        // Merge into _translateCache — SQL wins over stale localStorage if count differs
        for (const row of ceRows) {
          const existing = _translateCache[row.word];
          const sqlCount = row.lookup_count || 0;
          const dates    = lookupsByWord[row.word] || [];
          if (!existing || sqlCount > (existing.count || 0) || row.first_seen_panel === 'lesson_doc') {
            _translateCache[row.word] = Object.assign(existing || {}, {
              jp:              row.word,
              count:           sqlCount,
              firstLookup:     dates[0] || row.first_seen || null,
              lastLookup:      dates[dates.length - 1] || row.updated_at || null,
              first_seen_panel: row.first_seen_panel || null,
            });
          }
        }
        console.log(`Translate cache hydrated from SQL: ${ceRows.length} entries`);
      }
    } catch(e) { console.warn('Translate cache SQL hydration failed:', e.message); }

    // Kanji corpus: rebuild from corpus_entries + productions
    try {
      const ceRows = await window.db.query(
        'SELECT word, first_seen, first_seen_context, first_seen_panel, lookup_count, produced, first_produced, first_produced_context, production_count, chat_production_count, updated_at FROM corpus_entries'
      );
      if (ceRows && !ceRows.error && ceRows.length) {
        const prodRows = await window.db.query(
          'SELECT word, produced_at, source FROM corpus_productions ORDER BY produced_at ASC'
        );
        // Build monthly breakdown from production rows
        const monthlyByWord   = {};
        const monthlyChatWord = {};
        for (const p of (prodRows || [])) {
          const month = (p.produced_at || '').slice(0, 7);
          if (!month) continue;
          if (p.source === 'chat') {
            if (!monthlyChatWord[p.word]) monthlyChatWord[p.word] = {};
            monthlyChatWord[p.word][month] = (monthlyChatWord[p.word][month] || 0) + 1;
          } else {
            if (!monthlyByWord[p.word]) monthlyByWord[p.word] = {};
            monthlyByWord[p.word][month] = (monthlyByWord[p.word][month] || 0) + 1;
          }
        }
        const sqlCorpus = kanjiCorpusGet(); // start from existing
        for (const row of ceRows) {
          const existing = sqlCorpus[row.word] || {};
          sqlCorpus[row.word] = Object.assign(existing, {
            char:               row.word,
            firstSeen:          row.first_seen          || existing.firstSeen,
            firstSeenCtx:       row.first_seen_context  || existing.firstSeenCtx,
            firstSeenPanel:     row.first_seen_panel    || existing.firstSeenPanel,
            lookupCount:        Math.max(row.lookup_count || 0, existing.lookupCount || 0),
            produced:           !!(row.produced || existing.produced),
            firstProduced:      row.first_produced      || existing.firstProduced,
            firstProducedCtx:   row.first_produced_context || existing.firstProducedCtx,
            productionCount:    Math.max(row.production_count || 0, existing.productionCount || 0),
            chatProductionCount:Math.max(row.chat_production_count || 0, existing.chatProductionCount || 0),
            monthlyProduction:  monthlyByWord[row.word]   || existing.monthlyProduction   || {},
            monthlyChat:        monthlyChatWord[row.word] || existing.monthlyChat          || {},
          });
        }
        kanjiCorpusSave(sqlCorpus);
        console.log(`Kanji corpus hydrated from SQL: ${ceRows.length} entries`);
      }
    } catch(e) { console.warn('Kanji corpus SQL hydration failed:', e.message); }

    // ── Hydrate DrillSRS caches from SQL for all drill types ─────────────────
    const srsKeys = [
      STORAGE_KEYS.DRILL_SRS_WORDS,
      STORAGE_KEYS.DRILL_SRS_COUNTERS,
      STORAGE_KEYS.DRILL_SRS_CONJ,
      STORAGE_KEYS.DRILL_SRS_CONJ_FORMS,
      STORAGE_KEYS.DRILL_SRS_TIMES,
    ];
    for (const key of srsKeys) {
      const fromSQL = await DrillSRS.hydrate(key);
      // One-time migration: if SQL was empty but localStorage has data, seed SQL from localStorage
      if (!fromSQL) {
        const lsData = Storage.getJSON(key, {});
        const count  = Object.keys(lsData).length;
        if (count > 0) {
          const drillType = DrillSRS._drillType(key);
          const now = new Date().toISOString();
          for (const [itemKey, item] of Object.entries(lsData)) {
            window.db.run(
              `INSERT OR IGNORE INTO srs_items (item_key, drill_type, interval, ease, due_date, history, seen, last_reviewed)
               VALUES (?,?,?,?,?,?,?,?)`,
              [itemKey, drillType,
               item.interval ?? 0, item.ease ?? 2.5,
               item.due ? new Date(item.due).toISOString() : null,
               JSON.stringify(item.history || []),
               item.seen ?? 0, now]
            ).catch(() => {});
          }
          console.log(`DrillSRS migrated ${count} items [${drillType}] from localStorage → SQL`);
        }
      }
    }
  }
  // Seed vocab drill from JLPT_WORDS if deck is small (fresh install or default only)
  if (JLPT_WORDS.length && state.vocab.length < 50) {
    const existing = new Set(state.vocab.map(c => c.jp));
    const toAdd = JLPT_WORDS
      .filter(w => !existing.has(w.w))
      .map(w => ({ jp: w.w, kana: w.r, en: w.m, pos: w.l }));
    state.vocab.push(...toAdd);
    saveState();
    console.log(`Seeded vocab drill with ${toAdd.length} JLPT words`);
  }
  // Re-render any open data-dependent panels
  if (document.getElementById('panel-gramnotes')?.classList.contains('panel-active')) {
    const activeTab = document.querySelector('.gramnote-tab.active');
    if (activeTab) activeTab.click();
  }
  if (document.getElementById('panel-vocab-corpus')?.classList.contains('active')) {
    vcRender();
  }
}).catch(e => {
  console.warn('Data files not found, using fallbacks:', e.message);
  _dataLoaded = true; // allow app to run without data files (browser mode)
});


// ═══════════════════════════════════════════════════════
// GLOBAL QUICK TRANSLATE & LOOKUPS CACHE
// ═══════════════════════════════════════════════════════

const TRANSLATE_CACHE_KEY = 'jpTranslateCache';
const QT_HISTORY_KEY = 'jpQTHistory';
let _translateCache = {};
let _qtHistory = [];
try { _translateCache = JSON.parse(localStorage.getItem(TRANSLATE_CACHE_KEY) || '{}'); } catch(e) {}
let _qtLastJapanese = ''; // tracks last Japanese word for QT speak button
try { _qtHistory = JSON.parse(localStorage.getItem(QT_HISTORY_KEY) || '[]'); } catch(e) {}

function translateCacheSave() {
  const keys = Object.keys(_translateCache);
  if (keys.length > 500) {
    const toRemove = keys.slice(0, keys.length - 500);
    toRemove.forEach(k => delete _translateCache[k]);
  }
  localStorage.setItem(TRANSLATE_CACHE_KEY, JSON.stringify(_translateCache));
}

// Write a single translate-cache entry into corpus_entries + corpus_lookups.
// Fire-and-forget — never blocks the UI.
function _corpusWriteLookup(word, entry) {
  if (typeof window === 'undefined' || !window.db) return;
  const ts  = new Date().toISOString();
  const ctx = (entry.jp || word).slice(0, 40);
  // Upsert corpus_entries row
  window.db.run(
    `INSERT INTO corpus_entries (word, first_seen, first_seen_context, first_seen_panel, lookup_count, updated_at)
     VALUES (?, ?, ?, 'translate', ?, ?)
     ON CONFLICT(word) DO UPDATE SET
       lookup_count = MAX(excluded.lookup_count, lookup_count),
       updated_at   = excluded.updated_at`,
    [word, entry.firstLookup || ts, ctx, entry.count || 1, ts]
  ).catch(() => {});
  // Append to corpus_lookups (one row per lookup)
  window.db.run(
    'INSERT INTO corpus_lookups (word, looked_up_at, context) VALUES (?, ?, ?)',
    [word, ts, ctx]
  ).catch(() => {});
  window.db.run(
    'INSERT INTO learning_events (created_at, panel, event_type, payload) VALUES (?,?,?,?)',
    [ts, 'translate', 'vocab:lookup', JSON.stringify({ word, context: ctx })]
  ).catch(() => {});
  try { (App.AppEvents || window.AppEvents)?.emit(AppEvents.VOCAB_LOOKUP, { word, context: ctx, meaning: (entry.en || entry.meaning || entry.text || ''), reading: (entry.reading || ''), dictForm: (entry.dictForm || '') }); } catch(e) {}
}

function qtHistoryAdd(word) {
  // Reject malformed entries (raw API response labels)
  if (!word || /^(KANJI|READING|MEANING|DICT|JAPANESE):/i.test(word)) return;
  // Remove if already in history, then add to front
  _qtHistory = _qtHistory.filter(w => w !== word);
  _qtHistory.unshift(word);
  // Keep only last 5
  if (_qtHistory.length > 5) _qtHistory = _qtHistory.slice(0, 5);
  Storage.set(QT_HISTORY_KEY, JSON.stringify(_qtHistory));
  qtHistoryUpdate();
}

function qtHistoryUpdate() {
  const menu = document.getElementById('globalQTHistoryMenu');
  if (!menu) return;
  if (_qtHistory.length === 0) {
    menu.innerHTML = '<div style="padding:8px 12px;font-family:var(--ui);font-size:0.75rem;color:var(--ink-light)">No recent searches</div>';
    return;
  }
  menu.innerHTML = _qtHistory.map(w => {
    const cached = _translateCache[w];
    let preview = '';
    if (cached) {
      if (cached.meaning) preview = cached.meaning;
      else if (cached.text) preview = cached.text;
    }
    if (preview.length > 30) preview = preview.slice(0, 30) + '…';
    return `<div onclick="selectQTHistory('${w.replace(/'/g, "\\'")}')" style="padding:6px 12px;cursor:pointer;font-family:var(--jp);font-size:inherit;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;gap:8px" onmouseover="this.style.background='var(--field)'" onmouseout="this.style.background='none'">
      <span style="color:var(--teal)">${w}</span>
      <span style="color:var(--ink-light);font-size:0.75rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${preview}</span>
    </div>`;
  }).join('');
}

function toggleQTHistory(e) {
  e.stopPropagation();
  const menu = document.getElementById('globalQTHistoryMenu');
  if (!menu) return;
  qtHistoryUpdate();
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function selectQTHistory(word) {
  const input = document.getElementById('globalQTInput');
  const menu = document.getElementById('globalQTHistoryMenu');
  if (input) input.value = word;
  if (menu) menu.style.display = 'none';
  globalQTSelectHistory(word);
}

// Close menu when clicking outside
document.addEventListener('click', (e) => {
  const menu = document.getElementById('globalQTHistoryMenu');
  const btn = document.getElementById('globalQTHistoryBtn');
  if (menu && !menu.contains(e.target) && e.target !== btn) {
    menu.style.display = 'none';
  }
});

function globalQTSelectHistory(word) {
  if (!word) return;
  const cached = _translateCache[word];
  const result = document.getElementById('globalQTResult');
  const sb = document.getElementById('globalQTSpeakBtn');
  const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(word);

  // Resolve the Japanese form to speak — could be the word itself or cached.jp
  const jpWord = hasJapanese
    ? (cached?.dictForm || cached?.jp || word)
    : (cached?.jp || cached?.kanji || '');

  if (hasJapanese) {
    const meaning = cached?.meaning || cached?.en || '';
    const dictForm = cached?.dictForm || '';
    if (meaning) {
      result.innerHTML = `<strong style="color:var(--teal)">${word}</strong>${dictForm && dictForm !== word ? ` <span style="color:var(--ink-light)">(${dictForm})</span>` : ''} — ${meaning} <span style="color:var(--ink-light);font-size:0.65rem">📋</span>`;
    } else {
      result.innerHTML = `<strong style="color:var(--teal)">${word}</strong> <span style="color:var(--ink-light);font-size:0.65rem">📋</span>`;
    }
  } else {
    const jp = cached?.jp || cached?.kanji || cached?.text?.replace(/ \(.*\)$/, '') || '';
    const reading = cached?.reading || '';
    if (jp) {
      result.innerHTML = `<strong style="color:var(--ink)">${word}</strong> → <span style="color:var(--teal)">${jp}</span>${reading ? ` <span style="color:var(--ink-light)">(${reading})</span>` : ''} <span style="color:var(--ink-light);font-size:0.65rem">📋</span>`;
    }
  }

  if (jpWord) {
    _qtLastJapanese = jpWord;
    if (sb) sb.style.display = '';
  }
}

// Initialize history datalist on load
setTimeout(() => {
  qtHistoryUpdate();
  // Clean malformed cache entries (format labels stored as keys)
  const cache = Storage.getJSON(STORAGE_KEYS.TRANSLATE_CACHE, {});
  let dirty = false;
  for (const key of Object.keys(cache)) {
    if (/^(KANJI|READING|MEANING|DICT|JAPANESE|stroke:)/i.test(key)) {
      delete cache[key]; dirty = true;
    } else {
      // Scrub bad kanji values inside valid entries
      const e = cache[key];
      if (e.kanji && /^(KANJI|READING|MEANING|DICT):/i.test(e.kanji)) {
        e.kanji = ''; dirty = true;
      }
      if (e.dictForm && /^(KANJI|READING|MEANING|DICT):/i.test(e.dictForm)) {
        e.dictForm = ''; dirty = true;
      }
    }
  }
  if (dirty) Storage.setJSON(STORAGE_KEYS.TRANSLATE_CACHE, cache);
}, 100);

async function globalQuickTranslate() {
  const input = document.getElementById('globalQTInput');
  const result = document.getElementById('globalQTResult');
  const word = input.value.trim().replace(/[\t\r\n]+/g, ' ').trim();
  if (!word) return;

  // Detect if input is Japanese or English
  const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(word);
  const hasRomaji   = /[a-zA-Z]/.test(word);

  // Mixed kana+romaji = almost certainly a typo — don't translate
  if (hasJapanese && hasRomaji) {
    result.innerHTML = '<span style="color:var(--ink-light);font-size:0.8rem">Looks like a typo — mix of kana and romaji</span>';
    return;
  }
  // Reject if word looks like a raw API format label
  if (/^(KANJI|READING|MEANING|DICT|JAPANESE):/i.test(word)) {
    result.innerHTML = '';
    return;
  }
  
  // Check cache first — direct key, or find by alias/jp match for EN lookups
  const _cacheKey = (() => {
    if (_translateCache[word]) return word;
    // EN lookup: scan for entry with matching alias or en field
    if (!hasJapanese) {
      const wl = word.toLowerCase();
      for (const [k, v] of Object.entries(_translateCache)) {
        if ((v.en || '').toLowerCase() === wl) return k;
        if ((v.aliases || []).some(a => a.toLowerCase() === wl)) return k;
      }
    }
    return null;
  })();
  if (_cacheKey) {
    const cached = _translateCache[_cacheKey];
    const word_display = word; // keep original for display
    // Increment count on cache hit
    _translateCache[_cacheKey].count = (_translateCache[_cacheKey].count || 1) + 1;
    _translateCache[_cacheKey].lastLookup = new Date().toISOString();
    // Add alias if EN lookup found via JP key
    if (_cacheKey !== word && !hasJapanese) {
      if (!_translateCache[_cacheKey].aliases) _translateCache[_cacheKey].aliases = [];
      if (!_translateCache[_cacheKey].aliases.includes(word)) _translateCache[_cacheKey].aliases.push(word);
    }
    translateCacheSave();
    _corpusWriteLookup(_cacheKey, _translateCache[_cacheKey]);
    const hasJpWord = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(word);
    if (hasJpWord) {
      const en = cached.en || cached.meaning || cached.text || '';
      // Guard: don't show reading if it's same as word, or contains format labels
      const rdRaw = cached.reading || cached.dictForm || cached.kanji || '';
      const rd = /^(KANJI|READING|MEANING|DICT):/i.test(rdRaw) ? '' : rdRaw;
      result.innerHTML = `<strong style="color:var(--teal)">${word}</strong>${rd && rd !== word ? ` <span style="color:var(--ink-light)">(${rd})</span>` : ''} — ${en} <span style="color:var(--ink-light);font-size:0.65rem">📋</span>`;
      _qtLastJapanese = word;
      { const sb = document.getElementById('globalQTSpeakBtn'); if (sb) sb.style.display = ''; }
      kanjiCorpusRecordLookup(word, word);
    } else {
      const jp = cached.jp || cached.kanji || (cached.text ? cached.text.replace(/ \(.*\)$/, '') : '') || '';
      const rd = cached.reading || (cached.text ? (cached.text.match(/\(([^)]+)\)/) || [])[1] || '' : '');
      result.innerHTML = `<strong style="color:var(--ink)">${word}</strong> → <span style="color:var(--teal)">${jp}</span>${rd ? ` <span style="color:var(--ink-light)">(${rd})</span>` : ''} <span style="color:var(--ink-light);font-size:0.65rem">📋</span>`;
      kanjiCorpusRecordLookup(jp, word);
    }
    qtHistoryAdd(word_display);
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    result.innerHTML = '<span style="color:var(--ink-light)">Set API key first</span>';
    return;
  }
  
  result.innerHTML = '<span style="color:var(--ink-light)">…</span>';
  
  try {
    let prompt;
    if (hasJapanese) {
      prompt = `Translate this Japanese word/phrase to English. Reply in this exact format only:\nKANJI: [kanji/dictionary form — leave empty if input is already plain kana]\nREADING: [hiragana or katakana reading]\nMEANING: [brief English meaning, always in English]\n\n${word}`;
    } else {
      prompt = `Translate this English word/phrase to Japanese. If multiple translations exist, prefer the N5-level word where one is appropriate for the meaning. Reply in this exact format only:\nKANJI: [kanji form if applicable, otherwise leave empty]\nREADING: [hiragana or katakana reading, always]\nMEANING: [brief English meaning or gloss]\n\n${word}`;
    }
    
    const data = await claudeAPI({
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
      track: 'translate'
    });
    
    const text = claudeText(data).trim();
    
    if (hasJapanese) {
      // Parse JP→EN response
      const kanjiMatch   = text.match(/KANJI:\s*(.*)$/m);
      const readingMatch = text.match(/READING:\s*(.*)$/m);
      const meaningMatch = text.match(/MEANING:\s*(.*)$/m);
      const kanjiRaw = kanjiMatch   ? kanjiMatch[1].trim()   : '';
      const reading  = readingMatch ? readingMatch[1].trim() : '';
      const meaning  = meaningMatch ? meaningMatch[1].trim() : text;
      // Guard: kanji field must not contain format labels or be the reading itself
      const kanji = /^(KANJI|READING|MEANING|DICT):/i.test(kanjiRaw) ? '' : kanjiRaw;

      if (_translateCache[word]) {
        _translateCache[word].count = (_translateCache[word].count || 1) + 1;
        _translateCache[word].lastLookup = new Date().toISOString();
      } else {
        _translateCache[word] = { jp: word, kanji, reading, en: meaning, count: 1, firstLookup: new Date().toISOString(), lastLookup: new Date().toISOString() };
      }
      translateCacheSave();
      _corpusWriteLookup(word, _translateCache[word]);
      qtHistoryAdd(word);
      kanjiCorpusRecordLookup(word, word);
      const displayKanji = kanji && kanji !== word && !/^(KANJI|READING|MEANING|DICT):/i.test(kanji) ? ` <span style="color:var(--ink-light)">(${kanji})</span>` : '';
      result.innerHTML = `<strong style="color:var(--teal)">${word}</strong>${displayKanji} — ${meaning}`;
      _qtLastJapanese = word;
      { const sb = document.getElementById('globalQTSpeakBtn'); if (sb) sb.style.display = ''; }
    } else {
      // Parse EN→JP response
      const kanjiMatchE   = text.match(/KANJI:\s*(.*)$/m);
      const readMatchE    = text.match(/READING:\s*(.*)$/m);
      const meaningMatchE = text.match(/MEANING:\s*(.*)$/m);
      const kanjiERaw = kanjiMatchE   ? kanjiMatchE[1].trim()   : '';
      const readingE  = readMatchE    ? readMatchE[1].trim()    : '';
      const kanjiE = /^(KANJI|READING|MEANING|DICT):/i.test(kanjiERaw) ? '' : kanjiERaw;

      // Use JP form as canonical key — merge with existing JP entry if present
      const jpKey = kanjiE || readingE;
      const now   = new Date().toISOString();
      if (jpKey && _translateCache[jpKey]) {
        _translateCache[jpKey].count = (_translateCache[jpKey].count || 1) + 1;
        _translateCache[jpKey].lastLookup = now;
        if (!_translateCache[jpKey].aliases) _translateCache[jpKey].aliases = [];
        if (!_translateCache[jpKey].aliases.includes(word)) _translateCache[jpKey].aliases.push(word);
        if (!_translateCache[jpKey].en) _translateCache[jpKey].en = word;
        if (_translateCache[word] && word !== jpKey) delete _translateCache[word];
      } else if (jpKey) {
        if (_translateCache[word] && word !== jpKey) delete _translateCache[word];
        _translateCache[jpKey] = { jp: jpKey, kanji: kanjiE, reading: readingE, en: word, aliases: [word], count: 1, firstLookup: now, lastLookup: now };
      } else {
        if (_translateCache[word]) {
          _translateCache[word].count = (_translateCache[word].count || 1) + 1;
          _translateCache[word].lastLookup = now;
        } else {
          _translateCache[word] = { en: word, kanji: '', reading: '', jp: '', count: 1, firstLookup: now, lastLookup: now };
        }
      }
      translateCacheSave();
      if (jpKey) _corpusWriteLookup(jpKey, _translateCache[jpKey] || _translateCache[word] || {});
      qtHistoryAdd(word);
      kanjiCorpusRecordLookup(jpKey || word, word);

      result.innerHTML = `<strong style="color:var(--ink)">${word}</strong> → <span style="color:var(--teal)">${jpKey}</span>${readingE && kanjiE ? ` <span style="color:var(--ink-light)">(${readingE})</span>` : ''}`;
      _qtLastJapanese = jpKey;
      { const sb = document.getElementById('globalQTSpeakBtn'); if (sb) sb.style.display = ''; }
    }
  } catch(e) {
    result.innerHTML = '<span style="color:var(--red)">Error</span>';
  }
}


function globalQTSpeak() {
  if (!_qtLastJapanese) return;
  if (typeof jpSpeak === 'function') {
    jpSpeak(_qtLastJapanese);
  } else {
    const utt = new SpeechSynthesisUtterance(_qtLastJapanese);
    utt.lang = 'ja-JP';
    const voices = window.speechSynthesis?.getVoices() || [];
    const jpVoice = voices.find(v => v.lang.startsWith('ja'));
    if (jpVoice) utt.voice = jpVoice;
    window.speechSynthesis?.speak(utt);
  }
}

function globalQTClear() {
  _qtLastJapanese = '';
  const speakBtn = document.getElementById('globalQTSpeakBtn');
  if (speakBtn) speakBtn.style.display = 'none';
  document.getElementById('globalQTInput').value = '';
  document.getElementById('globalQTResult').innerHTML = '';
  document.getElementById('globalQTInput').focus();
}

function renderPitchCurve(kana, pitchStr) {
  if (!kana || pitchStr === null || pitchStr === undefined) return '';
  const moras = kana.match(/.[ァィゥェォャュョぁぃぅぇぉゃゅょ]?/g) || [];
  if (!moras.length) return '';
  const drops = String(pitchStr).split(',').map(Number);
  const drop = drops[0];
  const n = moras.length;
  const W = 28 + n * 22;
  const H = 24;
  const high = 4, low = 18;
  const heights = moras.map((_, i) => {
    if (drop === 0) return i === 0 ? low : high;
    if (drop === 1) return i === 0 ? high : low;
    return i === 0 ? low : i < drop ? high : low;
  });
  const cx = function(i) { return 14 + i * 22; };
  const path = heights.map(function(h, i) { return (i === 0 ? 'M' : 'L') + cx(i) + ',' + h; }).join(' ');
  const dots = moras.map(function(m, i) {
    const isDrop = i < n - 1 && heights[i] > heights[i + 1];
    return '<circle cx="' + cx(i) + '" cy="' + heights[i] + '" r="3.5" fill="' + (isDrop ? 'var(--gold)' : 'var(--teal)') + '" />';
  }).join('');
  return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="display:block;margin:6px auto 0"><path d="' + path + '" stroke="var(--teal)" stroke-width="1.5" fill="none" opacity="0.7"/>' + dots + '</svg>';
}
function renderLookupsTable() {
  const tbody    = document.getElementById('lookupsTableBody');
  const countEl  = document.getElementById('lookupsCount');
  const emptyEl  = document.getElementById('lookupsEmpty');
  const tableWrap = document.getElementById('lookupsTableWrap');

  const entries = Object.entries(_translateCache);

  if (entries.length === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    if (tableWrap) tableWrap.style.display = 'none';
    if (countEl) countEl.textContent = '0';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (tableWrap) tableWrap.style.display = 'block';

  entries.sort((a, b) => a[0].localeCompare(b[0], 'ja'));

  // Filter — JP query searches kanji+kana cols, EN query searches English col
  const q = (document.getElementById('lookupsFilter')?.value || '').trim();
  const qLower = q.toLowerCase();
  const qIsJp  = q && /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(q);

  const filtered = q ? entries.filter(([word, data]) => {
    const kanjiVal   = data.kanji   || '';
    const readingVal = data.reading || '';
    const enVal      = (data.en || data.meaning || data.text || '').toLowerCase();
    const jpWord     = word;
    if (qIsJp) return kanjiVal.includes(q) || readingVal.includes(q) || jpWord.includes(q);
    return enVal.includes(qLower) || jpWord.toLowerCase().includes(qLower);
  }) : entries;

  if (countEl) countEl.textContent = q ? `${filtered.length} / ${entries.length}` : entries.length;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--ink-light);font-family:var(--ui);font-size:0.8rem">No matches</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(([word, data]) => {
    const cnt      = data.count || 1;
    const cntColor = cnt >= 5 ? 'var(--gold)' : cnt >= 3 ? 'var(--teal)' : 'var(--ink-light)';

    // Detect entry type and extract fields correctly
    // New format: {jp, kanji, reading, en} or {en, kanji, reading, jp}
    // Old JP→EN format: {dictForm, meaning} or {meaning}
    // Old EN→JP format: {text: "japanese (reading)"}

    let kanjiDisplay = '', kanaDisplay = '', enDisplay = '';

    if (data.en || data.meaning) {
      // JP→EN entry (new or old format)
      const jp = data.jp || word;
      const hasKanji = /[\u4E00-\u9FAF]/.test(jp);
      kanjiDisplay = data.kanji || (hasKanji ? jp : '');
      kanaDisplay  = data.reading || (hasKanji ? '' : jp);
      enDisplay    = escHtml(data.en || data.meaning || '');
    } else if (data.reading || (data.jp && /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(data.jp))) {
      // EN→JP entry (new format)
      const jp = data.jp || data.kanji || data.reading || '';
      const hasKanji = /[\u4E00-\u9FAF]/.test(jp);
      kanjiDisplay = data.kanji || (hasKanji ? jp : '');
      kanaDisplay  = data.reading || '';
      enDisplay    = escHtml(data.en || word);
    } else if (data.text) {
      // Legacy EN→JP: {text: "食べる (たべる)"}
      const textMatch = data.text.match(/^(.+?)(?:\s*\(([^)]+)\))?$/);
      const jpPart = textMatch ? textMatch[1].trim() : data.text;
      const rdPart = textMatch && textMatch[2] ? textMatch[2].trim() : '';
      const hasKanji = /[\u4E00-\u9FAF]/.test(jpPart);
      kanjiDisplay = hasKanji ? jpPart : '';
      kanaDisplay  = rdPart || (hasKanji ? '' : jpPart);
      enDisplay    = escHtml(data.en || word);
    } else {
      // Fallback
      const hasKanji = /[\u4E00-\u9FAF]/.test(word);
      const isPureKana = /^[\u3040-\u309F\u30A0-\u30FF\u30FC]+$/.test(word);
      kanjiDisplay = hasKanji ? word : '';
      kanaDisplay  = isPureKana ? word : '';
      enDisplay    = escHtml(word);
    }

    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:7px 10px;font-family:var(--jp);font-size:1rem;color:var(--teal)">${escHtml(kanjiDisplay)}</td>
      <td style="padding:7px 10px;font-family:var(--jp);font-size:inherit;color:var(--ink-light)">${escHtml(kanaDisplay)}</td>
      <td style="padding:7px 10px;font-size:inherit;color:var(--ink)">${enDisplay}</td>
      <td style="padding:7px 6px;text-align:center;font-family:var(--ui);font-size:0.75rem;color:${cntColor};font-weight:${cnt>=3?700:400}">${cnt > 1 ? cnt : ''}</td>
      <td style="padding:7px 4px;text-align:center">
        <button class="btn-icon" onclick="lookupDelete(this.dataset.word)"
          data-word="${escHtml(word)}"
          title="Delete">✕</button>
      </td>
    </tr>`;
  }).join('');
}


function lookupDelete(word) {
  // word may be html-escaped from data-word attribute — unescape it
  const tmp = document.createElement('div');
  tmp.innerHTML = word;
  const key = tmp.textContent;
  if (!_translateCache[key]) return;
  delete _translateCache[key];
  translateCacheSave();
  renderLookupsTable();
}


function clearLookupCache() {
  if (!confirm('Clear all cached translations?')) return;
  _translateCache = {};
  localStorage.removeItem(TRANSLATE_CACHE_KEY);
  renderLookupsTable();
}

// Enable kana input on global quick translate
document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('globalQTInput');
  if (inp) setGlobalQTMode('hiragana');
});

window['globalQuickTranslate'] = globalQuickTranslate;
window['globalQTClear'] = globalQTClear;
window['toggleQTHistory'] = toggleQTHistory;
window['renderLookupsTable'] = renderLookupsTable;
window['clearLookupCache'] = clearLookupCache;

// ═══════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════

// Dakuten (゛) katakana - voiced consonants
// Handakuten (゜) katakana - p-sounds
// Combined extended katakana
// ═══════════════════════════════════════════════════════
// HEISIG RTK DATA (first 100)
// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
// VERB/ADJECTIVE DATA (Conjugation)
// ═══════════════════════════════════════════════════════
// ── TRANSLATION STATE (declared early to avoid TDZ) ──
let transHistory = [];
let transLastParsed = null;

// ── CHAT STATE (declared early to avoid TDZ) ──
let chatHistory = [];
let lastUserQuestion = '';
const SYSTEM_PROMPT = `You are a Japanese tutor helping a German-speaking beginner (N5-N4 level). Keep explanations clear and concise. Use furigana for kanji. When correcting Japanese, show: 1) the corrected sentence, 2) what was wrong, 3) why. Never end your reply by offering further help, asking follow-up questions, or saying things like "Would you like..." or "Let me know if...". Just answer and stop.`;

// ── WRITING STATE (declared early to avoid TDZ) ──
let writingSentences = [];
let writingChatHistory = [];
// ── App-level singleton state ────────────────────────────────────────────────
const AppState = {
  writingErrors:    [],

  apiUsage:         { inputTokens: 0, outputTokens: 0, calls: 0, byFeature: {} },
  lastPanel:        'dashboard',
  currentPanel:     'dashboard',
  wbDragEl:         null,
  transKanaOn:      false,
};
// AppState.writingErrors — see declaration above
const WRITING_SYSTEM = `You are a Japanese writing tutor for a N5-N4 beginner (German speaker).
The student writes one sentence at a time. Reply ONLY with JSON, no markdown, no extra text:
{"corrected":"corrected Japanese (same as input if correct)","isCorrect":true/false,"blockSubmit":true/false,"note":"one concise sentence, or empty string","detail":"optional deeper grammar explanation or empty string","translation":"natural English translation of the corrected sentence","errorType":"particle|conjugation|word-choice|spelling|word-order|formality|none","errorPattern":"brief pattern description or empty string"}

isCorrect: true if the sentence is grammatically correct Japanese, even if the meaning is unusual, unexpected, or unlikely in real life. Grammar correctness is the ONLY criterion — do not penalise creative, unusual, or improbable sentences like "I make electricity" or "the cat eats the universe". Mark isCorrect:false ONLY for real grammatical errors: wrong particle, wrong verb form, wrong conjugation, wrong word order that breaks the grammar, or sentences that are not valid Japanese.

KANJI RULES (important — three distinct cases):
1. Wrong kanji (e.g. 橋 instead of 箸, 私 read as わたくし when meant わたし) — genuine error, mark isCorrect:false, errorType:"spelling".
2. Hiragana instead of kanji (たべる instead of 食べる, わたし instead of 私) — NOT an error at N5. Do not flag, do not mention, do not add kanji to the corrected field. The corrected field must use the same script the student used.
3. Missing kanji entirely — same as case 2. An N5 student writing entirely in hiragana is correct and natural.
Never suggest the student "should use kanji". Never use kanji in the corrected field where the student used hiragana.

blockSubmit: true ONLY for genuine grammatical errors where the student must fix something before proceeding. Set blockSubmit:false for any of these: missing punctuation (。！？), unusual but grammatically valid sentences, style suggestions, vocabulary alternatives, minor naturalness issues, kanji vs kana choices. If blockSubmit is false the sentence will be accepted as-is regardless of isCorrect.

note: one sentence max. If the sentence is correct say nothing (empty string). If there is a real error state concisely what it is. If blockSubmit is false but worth mentioning (e.g. missing 。), phrase it as an observation not a correction: "Missing 。at the end." Never use praise or encouragement.
detail: only include if there is a genuine grammar rule worth explaining. Otherwise empty string.

errorType: categorize the PRIMARY error if isCorrect is false. Use exactly one of: "particle" (wrong/missing particles like は、が、を、に、で、へ), "conjugation" (wrong verb/adjective form, te-form, past tense, etc), "word-choice" (wrong word for the meaning), "spelling" (typos, wrong kana, wrong kanji used for intended word — NOT hiragana instead of kanji), "word-order" (words in wrong position), "formality" (mixing polite/casual inappropriately). Use "none" if isCorrect is true.
errorPattern: brief reusable description of the error pattern, e.g. "missing に with 行く", "te-form of る-verb", "は vs が for subject". Empty string if no error.

Write all notes in English.`;

// ── RTK STATE (declared early to avoid TDZ) ──
// RTK state removed — drill retired

// ═══════════════════════════════════════════════════════
// API COST TRACKING
// ═══════════════════════════════════════════════════════
// Claude Sonnet 4 pricing: $3/M input, $15/M output tokens
const COST_PER_INPUT_TOKEN = 3 / 1000000;
const COST_PER_OUTPUT_TOKEN = 15 / 1000000;

// AppState.apiUsage — see declaration below

function apiUsageLoad() {
  try {
    const stored = Storage.get(STORAGE_KEYS.API_USAGE);
    if (stored) AppState.apiUsage = JSON.parse(stored);
  } catch { AppState.apiUsage = { inputTokens: 0, outputTokens: 0, calls: 0, byFeature: {} }; }
}

function apiUsageSave() {
  Storage.set(STORAGE_KEYS.API_USAGE, JSON.stringify(AppState.apiUsage));
}

function apiUsageTrack(feature, inputTokens, outputTokens) {
  AppState.apiUsage.inputTokens += inputTokens;
  AppState.apiUsage.outputTokens += outputTokens;
  AppState.apiUsage.calls += 1;
  if (!AppState.apiUsage.byFeature[feature]) {
    AppState.apiUsage.byFeature[feature] = { inputTokens: 0, outputTokens: 0, calls: 0 };
  }
  AppState.apiUsage.byFeature[feature].inputTokens += inputTokens;
  AppState.apiUsage.byFeature[feature].outputTokens += outputTokens;
  AppState.apiUsage.byFeature[feature].calls += 1;
  apiUsageSave();
}

function apiUsageGetCost() {
  return (AppState.apiUsage.inputTokens * COST_PER_INPUT_TOKEN) + (AppState.apiUsage.outputTokens * COST_PER_OUTPUT_TOKEN);
}

function apiUsageReset() {
  if (confirm('Reset API usage tracking? This cannot be undone.')) {
    AppState.apiUsage = { inputTokens: 0, outputTokens: 0, calls: 0, byFeature: {} };
    apiUsageSave();
    if (typeof progressRenderCost === 'function') progressRenderCost();
  }
}

// Load usage on startup
document.addEventListener('storageReady', apiUsageLoad);

// ═══════════════════════════════════════════════════════
// API KEY
// ═══════════════════════════════════════════════════════
// ── Unified error recording ──────────────────────────────────────────────────
// All error sources (writing, spoken, conjugation, grammar sentence) call this.
// Writes one row to error_history with a full timestamp.
// The existing per-source storage remains for backward compat.
function recordError({ source, errorType, pattern, input, corrected }) {
  if (!source || !errorType || errorType === 'none') return;
  const t = Date.now();
  // window.db.run is async IPC — fire and forget
  window.db?.run(
    'INSERT INTO error_history (source, errorType, pattern, input, corrected, t) VALUES (?,?,?,?,?,?)',
    [source, errorType || '', pattern || '', input || '', corrected || '', t]
  )?.catch(e => console.warn('[recordError]', e));
  const ts = new Date(t).toISOString();
  window.db?.run(
    'INSERT INTO learning_events (created_at, panel, event_type, payload) VALUES (?,?,?,?)',
    [ts, source, 'error:recorded', JSON.stringify({ errorType, pattern, input, corrected })]
  )?.catch(() => {});
  try { (App.AppEvents || window.AppEvents)?.emit(AppEvents.ERROR_RECORDED, { panel: source, errorType, pattern, input, corrected }); } catch(e) {}
}

function getApiKey()    { return Storage.getApiKey(); }
function getOpenAIKey() { return Storage.getOpenAIKey(); }

// Centralized Claude API helper
async function claudeAPI(opts) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('No API key configured');
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: opts.model || 'claude-sonnet-4-6',
      max_tokens: opts.max_tokens || 1024,
      system: opts.system,
      messages: opts.messages
    })
  });
  
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  // Track usage if tracker exists
  if (data.usage && typeof apiUsageTrack === 'function' && opts.track) {
    apiUsageTrack(opts.track, data.usage.input_tokens || 0, data.usage.output_tokens || 0);
  }
  
  return data;
}

// Helper to get text from Claude response
function claudeText(data) {
  return data.content?.[0]?.text || '';
}

function saveApiKey() {
  const val = document.getElementById('apikeyInput').value.trim();
  if (!val.startsWith('sk-')) {
    document.getElementById('apikeyStatus').textContent = 'Key should start with sk-ant-…';
    return;
  }
  Storage.setApiKey(val);
  document.getElementById('apikeyInput').value = '••••' + val.slice(-4);
  document.getElementById('apikeyStatus').textContent = '✓ saved';
  document.getElementById('apikeyStatus').className = 'apikey-status ok';
}

// saveHFToken removed — diarization removed

function saveOpenAIKey() {
  const val = document.getElementById('openaiKeyInput').value.trim();
  if (!val.startsWith('sk-')) {
    document.getElementById('openaiKeyStatus').textContent = 'Key should start with sk-…';
    return;
  }
  Storage.setOpenAIKey(val);
  document.getElementById('openaiKeyInput').value = '••••' + val.slice(-4);
  document.getElementById('openaiKeyStatus').textContent = '✓ saved';
  document.getElementById('openaiKeyStatus').className = 'apikey-status ok';
  // Hide the notice in Voice panel if it exists
  const notice = document.getElementById('voiceKeyNotice');
  if (notice) notice.style.display = 'none';
}

// ═══════════════════════════════════════════════════════
// STORAGE MODULE
// Central access layer for all localStorage. 
// One place to see every key the app uses.
// Future: swap localStorage for electron-store by changing only this section.
// ═══════════════════════════════════════════════════════

const STORAGE_KEYS = {
  // Core state
  STATE:              'jpStudio',
  // API
  API_KEY:            'jpStudioApiKey',
  OPENAI_KEY:         'jpStudioOpenAIKey',
  HF_TOKEN:           'jpStudioHFToken',
  API_USAGE:          'jpStudioApiUsage',
  API_COSTS:          'jpApiUsage',
  // Chat & translation
  CHAT_HISTORY:       'jpChatHistory',
  TRANSLATE_CACHE:    'jpTranslateCache',
  LOOKUP_HISTORY:     'jpLookupHistory',
  // Errors & writing
  WRITING_ERRORS:     'jpWritingErrors',
  WRITING_ERRORS_ALT: 'writingErrors',
  SPOKEN_ERRORS:      'jpSpokenErrors',
  // Content
  SAVED_TEXTS:        'jpSavedTexts',
  STUDIO_TEXTS:       'jpStudioTexts',
  LESSON_NOTES:       'jpLessonNotes',
  GRAMMAR_POINTS:     'jpGrammarPoints',
  GRAM_SENT_HISTORY:  'gramSentHistory',
  GRAM_SENT_SESSIONS: 'gramSentSessions',
  VOICE_CONVOS:       'jpVoiceConversations',
  VOICE_CONVOS_ALT:   'jpStudioVoiceConvos',
  // Progress
  STREAK:             'jpStreak',
  RTK_MNEMONICS:      'rtkMnemonics',
  TD_BEST_SCORE:      'tdBestScore',
  // Listen / video
  LISTEN_NOTES:       'listenNotes',
  LISTEN_SRS:         'listenSrs',
  LISTEN_TRACK_NAMES: 'listenTrackNames',
  LISTEN_MIC:         'listenSelectedMic',
  VT_MIC:             'vtSelectedMic',
  VT_VIDEO_HISTORY:   'vtVideoHistory',
  SELECTED_MIC:       'selectedMicId',
  // Drill SRS
  DRILL_SRS_COUNTERS:   'drillSrs_counters',
  COUNTER_MASTERY:      'counterMastery',
  COUNTER_SESSION:      'counterDailySession',
  KANA_MASTERY:         'kanaMastery',
  KANA_SESSION:         'kanaDailySession',
  WORDS_SESSION:        'wordsDailySession',
  DRILL_SRS_CONJ:     'drillSrs_conjugation',
  DRILL_SRS_CONJ_FORMS: 'drillSrs_conjForms',
  CONJ_SESSION:        'conjDailySession',
  GRAMMAR_ERRORS:      'grammarDrillErrors',
  DRILL_SRS_TIMES:    'drillSrs_times',
  DRILL_SRS_WORDS:    'jpStudio_wordSRS',
  // Feature data
  TRANSLATE_CACHE:    'jpTranslateCache',
  QT_HISTORY:         'jpQTHistory',
  VOCAB_BOOKMARKS:    'jpVocabBookmarks',
  GRAM_NOTES:         'jpGramNotes',
  LISTEN_PREFS:       'jpListenPrefs',
  YOSHI_SESSIONS:     'jpStudioYoshiSessions',
  LESSON_NOTES_DATA:  'jpLessonNotesSessions',
  LEARNED_WORDS:      'jpLearnedWords',
  BREAKDOWN_CACHE:    'jpBreakdownCache',
  VT_WATCH:           'vtWatchTime',
  QR_HISTORY:         'jpQRHistory',
  RESOURCES:          'jpResources',
  SPOKEN_ERRORS_DATA: 'jpStudioSpokenErrors',
  VOICE_PROFILE:      'jpVoiceProfile',
  ROUND_TRIPS:        'jpStudioRoundTrips',
  KANJI_CORPUS:       'jpKanjiCorpus',
  // Anki
  ANKI_LAST_DECK:     'ankiLastDeck',
  ANKI_EASY_COUNTS:   'ankiEasyCounts',
  ANKI_SESSION:       'ankiDailySession',
  // Settings
  TTS_VOICE:          'ttsVoiceURI',
  SHOW_FURIGANA:      'showFurigana',
  DEFAULT_LEVEL:      'defaultLevel',
  PRINT_FONT_SIZE:    'printFontSize',
  PRINT_LINE_HEIGHT:  'printLineHeight',
  GOALS:              'jpStudioGoals',
  LESSON_NOTES_SESSIONS: 'lessonNotesSessions',
  // Additional keys found in localStorage
  RESOURCES:          'japaneseStudioResources',
  LISTEN_VOCAB_BOOKMARKS: 'listenVocabBookmarks',
  PAUSE_DATA:         'jpStudioPauseData',
  WRITING_DENYLIST:   'writingErrorDenylist',
  VOICE_PROFILE:      'jpStudioVoiceProfile',
  LISTEN_TRACK_NAMES: 'listenTrackNames',
  DRILL_LAST_COMPLETED: 'drillLastCompleted',
  LISTEN_PREFS:       'listenPrefs',
  AGENT_PROGRESS_VIEW: 'agentLastProgressView',
  QR_HISTORY:         'jpStudioQrHistory',
  AGENT_BRIEFING_CACHE: 'agentBriefingCache',
};

// All keys that belong in a full backup (excludes device prefs like mic selection)
const STORAGE_BACKUP_KEYS = [
  'STATE', 'CHAT_HISTORY', 'TRANSLATE_CACHE', 'LOOKUP_HISTORY',
  'WRITING_ERRORS', 'SPOKEN_ERRORS', 'SAVED_TEXTS', 'STUDIO_TEXTS',
  'LESSON_NOTES', 'GRAMMAR_POINTS', 'GRAM_SENT_HISTORY', 'GRAM_SENT_SESSIONS',
  'VOICE_CONVOS', 'STREAK', 'RTK_MNEMONICS', 'LISTEN_NOTES',
  'LISTEN_SRS', 'LISTEN_TRACK_NAMES', 'VT_VIDEO_HISTORY',
  'TD_BEST_SCORE', 'TE_SPEED_BEST', 'ANKI_LAST_DECK',
  'API_COSTS', 'SHOW_FURIGANA', 'DEFAULT_LEVEL',
  'PRINT_FONT_SIZE', 'PRINT_LINE_HEIGHT',
  'QT_HISTORY', 'VOCAB_BOOKMARKS', 'GRAM_NOTES',
  'YOSHI_SESSIONS', 'LESSON_NOTES_DATA', 'LEARNED_WORDS',
  'QR_HISTORY', 'RESOURCES', 'SPOKEN_ERRORS_DATA',
  'VOICE_PROFILE', 'ROUND_TRIPS', 'KANJI_CORPUS',
];

// ── Keys that stay in localStorage (device-specific, not backed up) ──────────
const LOCAL_ONLY_KEYS = new Set([
  // API keys — intentionally local only for security
  'jpStudioApiKey', 'jpStudioOpenAIKey', 'jpStudioHFToken',
  // Device preferences — machine-specific
  'selectedMicId', 'listenSelectedMic', 'vtSelectedMic',
  'ttsVoiceURI', 'showFurigana', 'defaultLevel',
  'printFontSize', 'printLineHeight',
  // Caches — rebuilds naturally, no value persisting
  'jpTranslateCache',
  'jpBreakdownCache',
  // Written before Storage.init() — must stay local
  'jpQTHistory',
  'listenTrackNames',
  // UI session state — panel restore
  'lnLastSessionId',
  // Legacy — none
]);

// ── Keys to purge from localStorage on migration (dead/test keys only) ──────
const PURGE_KEYS = new Set([
  'test',  // test key
  // NOTE: never add lessonNotesSessions here — it holds dropped document sessions
  // which are separate from lesson_sessions (recordings) in the DB
]);

// ── Key prefixes to migrate dynamically (e.g. vt_vocab_*) ────────────────────
const MIGRATE_PREFIXES = ['vt_vocab_'];

// ── In-memory sync cache — avoids async round-trips for frequent reads ────────
const _kvCache = {};
let _kvReady = false; // true once initial sync from SQLite is done

// ── Storage — unified interface over SQLite (primary) + localStorage ──────────
const Storage = {

  // ── Core primitives ──────────────────────────────────────────────────────────

  // Synchronous get — returns from cache or localStorage fallback
  // For SQLite-backed keys, value is pre-loaded into _kvCache on startup
  get(key, fallback = null) {
    if (LOCAL_ONLY_KEYS.has(key)) {
      const v = localStorage.getItem(key);
      return v !== null ? v : fallback;
    }
    if (key in _kvCache) return _kvCache[key] !== null ? _kvCache[key] : fallback;
    // Fallback: check localStorage during migration window
    const v = localStorage.getItem(key);
    return v !== null ? v : fallback;
  },

  // Synchronous set — writes to cache immediately, async to SQLite
  set(key, value) {
    if (LOCAL_ONLY_KEYS.has(key)) {
      localStorage.setItem(key, value);
      return;
    }
    _kvCache[key] = value;
    if (window.kvAPI) {
      window.kvAPI.set(key, value).catch(e => console.warn('[Storage.set]', key, e));
    } else {
      localStorage.setItem(key, value); // browser fallback
    }
  },

  remove(key) {
    delete _kvCache[key];
    if (LOCAL_ONLY_KEYS.has(key)) {
      localStorage.removeItem(key);
      return;
    }
    if (window.kvAPI) {
      window.kvAPI.delete(key).catch(() => {});
    }
    localStorage.removeItem(key);
  },

  // ── JSON helpers ─────────────────────────────────────────────────────────────

  getJSON(key, fallback = null) {
    try {
      const raw = this.get(key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },

  setJSON(key, value) {
    this.set(key, JSON.stringify(value));
  },

  // ── Async variants — use these when you need guaranteed SQLite consistency ───

  async getAsync(key, fallback = null) {
    if (LOCAL_ONLY_KEYS.has(key)) return this.get(key, fallback);
    if (window.kvAPI) {
      const v = await window.kvAPI.get(key);
      if (v !== null) { _kvCache[key] = v; return v; }
    }
    return this.get(key, fallback);
  },

  async setAsync(key, value) {
    _kvCache[key] = value;
    if (LOCAL_ONLY_KEYS.has(key)) { localStorage.setItem(key, value); return; }
    if (window.kvAPI) await window.kvAPI.set(key, value);
    else localStorage.setItem(key, value);
  },

  // ── Startup: load all SQLite kv_store into cache + migrate localStorage ──────

  async init() {
    if (!window.kvAPI) {
      // Browser mode — stay on localStorage
      _kvReady = true;
      return;
    }

    // Load all existing SQLite kv_store entries into cache
    const rows = await window.kvAPI.list('').catch(() => []);
    for (const { key, value } of rows) {
      _kvCache[key] = value;
    }

    // Migrate any localStorage keys not yet in SQLite
    const migratedCount = await this._migrateLocalStorage();
    if (migratedCount > 0) console.log(`[Storage] Migrated ${migratedCount} keys to SQLite`);

    _kvReady = true;
    console.log('[Storage] Ready —', Object.keys(_kvCache).length, 'keys in SQLite cache');
  },

  async _migrateLocalStorage() {
    let count = 0;

    // Explicit migration for keys previously in LOCAL_ONLY_KEYS now moving to SQLite
    const EXPLICIT_MIGRATE = [
      'jpStudioIssues', 'agentLearnerProfile', 'agentDailyBriefing',
      'drillLastCompleted', 'writingErrors', 'jpStudioSpokenErrors',
      'jpStudioApiKey', 'jpStudioOpenAIKey', 'jpStudioHFToken',
    ];
    for (const key of EXPLICIT_MIGRATE) {
      if (_kvCache[key] !== undefined) continue;
      const localVal = localStorage.getItem(key);
      if (localVal === null) continue;
      await window.kvAPI.set(key, localVal).catch(() => {});
      _kvCache[key] = localVal;
      localStorage.removeItem(key);
      count++;
    }

    // 1. Migrate all known STORAGE_KEYS
    const allKeys = Object.values(STORAGE_KEYS);
    for (const key of allKeys) {
      if (LOCAL_ONLY_KEYS.has(key)) continue;
      if (_kvCache[key] !== undefined) continue;
      const localVal = localStorage.getItem(key);
      if (localVal === null) continue;
      await window.kvAPI.set(key, localVal).catch(() => {});
      _kvCache[key] = localVal;
      localStorage.removeItem(key);
      count++;
    }

    // 2. Migrate dynamic prefix keys (e.g. vt_vocab_*)
    for (const prefix of MIGRATE_PREFIXES) {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        if (_kvCache[key] !== undefined) continue;
        const val = localStorage.getItem(key);
        if (val === null) continue;
        await window.kvAPI.set(key, val).catch(() => {});
        _kvCache[key] = val;
        localStorage.removeItem(key);
        count++;
        i--; // adjust index after removal
      }
    }

    // 3. Migrate any remaining unknown keys not in LOCAL_ONLY_KEYS
    const remaining = [];
    for (let i = 0; i < localStorage.length; i++) {
      remaining.push(localStorage.key(i));
    }
    for (const key of remaining) {
      if (!key) continue;
      if (LOCAL_ONLY_KEYS.has(key)) continue;
      if (PURGE_KEYS.has(key)) { localStorage.removeItem(key); continue; }
      if (_kvCache[key] !== undefined) continue;
      // Unknown key — migrate it
      const val = localStorage.getItem(key);
      if (val === null) continue;
      await window.kvAPI.set(key, val).catch(() => {});
      _kvCache[key] = val;
      localStorage.removeItem(key);
      count++;
    }

    return count;
  },

  // ── Typed accessors ──────────────────────────────────────────────────────────

  // API keys — always localStorage (sensitive, device-specific)
  // API keys — write to both localStorage (synchronous fallback) and kvAPI (persistent)
  getApiKey()       { return _kvCache[STORAGE_KEYS.API_KEY]    || localStorage.getItem(STORAGE_KEYS.API_KEY)    || ''; },
  setApiKey(v)      { _kvCache[STORAGE_KEYS.API_KEY] = v;    window.kvAPI?.set(STORAGE_KEYS.API_KEY, v).catch(()=>{}); },
  getOpenAIKey()    { return _kvCache[STORAGE_KEYS.OPENAI_KEY] || localStorage.getItem(STORAGE_KEYS.OPENAI_KEY) || ''; },
  setOpenAIKey(v)   { _kvCache[STORAGE_KEYS.OPENAI_KEY] = v; window.kvAPI?.set(STORAGE_KEYS.OPENAI_KEY, v).catch(()=>{}); },
  getHFToken()      { return _kvCache[STORAGE_KEYS.HF_TOKEN]   || localStorage.getItem(STORAGE_KEYS.HF_TOKEN)   || ''; },
  setHFToken(v)     { _kvCache[STORAGE_KEYS.HF_TOKEN] = v;   window.kvAPI?.set(STORAGE_KEYS.HF_TOKEN, v).catch(()=>{}); },

  // Main app state
  getState()        { return this.getJSON(STORAGE_KEYS.STATE); },
  setState(v)       { this.setJSON(STORAGE_KEYS.STATE, v); },

  // Studio texts
  getStudioTexts()  { return this.getJSON(STORAGE_KEYS.STUDIO_TEXTS, []); },
  setStudioTexts(v) { this.setJSON(STORAGE_KEYS.STUDIO_TEXTS, v); },

  // Settings — localStorage (device-specific)
  getTTSVoice()       { return localStorage.getItem(STORAGE_KEYS.TTS_VOICE) || ''; },
  setTTSVoice(v)      { localStorage.setItem(STORAGE_KEYS.TTS_VOICE, v); },
  getShowFurigana()   { return localStorage.getItem(STORAGE_KEYS.SHOW_FURIGANA) !== 'false'; },
  setShowFurigana(v)  { localStorage.setItem(STORAGE_KEYS.SHOW_FURIGANA, v); },
  getDefaultLevel()   { return localStorage.getItem(STORAGE_KEYS.DEFAULT_LEVEL) || 'N3'; },
  setDefaultLevel(v)  { localStorage.setItem(STORAGE_KEYS.DEFAULT_LEVEL, v); },
  getPrintFontSize()  { return localStorage.getItem(STORAGE_KEYS.PRINT_FONT_SIZE) || '18'; },
  getPrintLineHeight(){ return localStorage.getItem(STORAGE_KEYS.PRINT_LINE_HEIGHT) || '2.2'; },

  // Scores
  getTdBestScore()  { return parseInt(this.get(STORAGE_KEYS.TD_BEST_SCORE, '0')); },
  setTdBestScore(v) { this.set(STORAGE_KEYS.TD_BEST_SCORE, String(v)); },
  getTeSpeedBest()  { return parseFloat(this.get(STORAGE_KEYS.TE_SPEED_BEST, '0')); },
  setTeSpeedBest(v) { this.set(STORAGE_KEYS.TE_SPEED_BEST, String(v)); },

  // ── Export / Import / Clear ──────────────────────────────────────────────────

  async exportAll() {
    const data = { exportDate: new Date().toISOString(), version: '3.0' };
    // Export from SQLite cache
    for (const k of STORAGE_BACKUP_KEYS) {
      const key = STORAGE_KEYS[k];
      if (!key) continue;
      const val = _kvCache[key] ?? localStorage.getItem(key);
      if (val !== null) data[k] = val;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `japanese-studio-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  async importAll(data) {
    for (const k of STORAGE_BACKUP_KEYS) {
      if (data[k] === undefined) continue;
      const key = STORAGE_KEYS[k];
      if (!key) continue;
      await this.setAsync(key, data[k]);
    }
    // Legacy v1.0/v2.0 support
    const legacy = {
      state: 'STATE', translateCache: 'TRANSLATE_CACHE', lookups: 'LOOKUP_HISTORY',
      chatHistory: 'CHAT_HISTORY', writingErrors: 'WRITING_ERRORS',
      spokenErrors: 'SPOKEN_ERRORS', voiceConversations: 'VOICE_CONVOS',
      lessonNotes: 'LESSON_NOTES', grammarPoints: 'GRAMMAR_POINTS',
      savedTexts: 'SAVED_TEXTS', streak: 'STREAK', apiCosts: 'API_COSTS',
    };
    for (const [old, newKey] of Object.entries(legacy)) {
      if (data[old] !== undefined) await this.setAsync(STORAGE_KEYS[newKey], data[old]);
    }
  },

  async clearAll() {
    // Clear SQLite kv_store
    if (window.kvAPI) {
      const rows = await window.kvAPI.list('').catch(() => []);
      for (const { key } of rows) await window.kvAPI.delete(key).catch(() => {});
    }
    // Clear localStorage (non-device keys)
    Object.values(STORAGE_KEYS).forEach(k => {
      if (!LOCAL_ONLY_KEYS.has(k)) localStorage.removeItem(k);
    });
    Object.keys(_kvCache).forEach(k => delete _kvCache[k]);
  },
};

// ── Storage initialisation ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  Storage.init().then(() => {
    // Re-load qt history from SQLite now that cache is populated
    try { _qtHistory = JSON.parse(Storage.get(QT_HISTORY_KEY, '[]')); } catch(e) {}
    // Signal that storage is ready — deferred startup calls listen for this
    document.dispatchEvent(new Event('storageReady'));
    try { (App.StudentModel || window.StudentModel)?.init(); } catch(e) { console.warn('[StudentModel.init]', e); }
  }).catch(e => {
    console.error('[Storage.init] failed:', e);
    document.dispatchEvent(new Event('storageReady')); // still unblock on failure
  });
});

// localStorage interceptor removed — localStorage.setItem is not patchable in Electron renderer

// ── Public functions (called from HTML onclick) ──────────────
function exportAllData() { Storage.exportAll(); }

function importDataPrompt() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      Storage.importAll(data);
      alert('Data imported successfully. Refreshing page...');
      location.reload();
    } catch (err) {
      alert('Error importing data: ' + err.message);
    }
  };
  input.click();
}

function clearAllData() {
  Storage.clearAll();
  alert('All data cleared. Refreshing page...');
  location.reload();
}


// ═══════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════
function loadState() {
  const d = Storage.getState();
  let s;
  if (d) {
    s = d;
  } else {
    s = {
      streak: 0, lastDate: null, sessions: 0,
      kanaScores: {}, kanjiScores: {},
      vocab: [...DEFAULT_VOCAB], vocabProgress: {},
      vocabKnownSessions: {},
      lastAccuracy: null
    };
  }
  if (!s.vocab) {
    s.vocab = [...DEFAULT_VOCAB];
    s.vocabProgress = {};
    s.vocabKnownSessions = {};
  }
  if (!s.vocabKnownSessions) s.vocabKnownSessions = {};
  return s;
}
function saveState() { Storage.setState(state); }
let state = loadState();

function updateStreak() {
  const today = new Date().toDateString();
  if (state.lastDate !== today) {
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (state.lastDate === yesterday) state.streak++;
    else state.streak = 1;
    state.lastDate = today;
    saveState();
  }
  const el = document.getElementById('streakCount');
  if (el) el.textContent = state.streak;
}
document.addEventListener('storageReady', updateStreak);

// ═══════════════════════════════════════════════════════
// API KEY BAR
// ═══════════════════════════════════════════════════════
function initApiKeyBar() {
  const stored = Storage.getApiKey();
  const openaiStored = Storage.getOpenAIKey();
  const keyInput     = document.getElementById('apikeyInput');
  const keyStatus    = document.getElementById('apikeyStatus');
  const openaiInput  = document.getElementById('openaiKeyInput');
  const openaiStatus = document.getElementById('openaiKeyStatus');
  if (stored) {
    if (keyInput)  keyInput.value = '••••' + stored.slice(-4);
    if (keyStatus) { keyStatus.textContent = '✓ saved'; keyStatus.className = 'apikey-status ok'; }
  }
  if (openaiStored) {
    if (openaiInput)  openaiInput.value = '••••' + openaiStored.slice(-4);
    if (openaiStatus) { openaiStatus.textContent = '✓ saved'; openaiStatus.className = 'apikey-status ok'; }
  }
  // hfStored / hfToken init removed (diarization removed)
  const furiganaCheck = document.getElementById('showFuriganaCheck');
  if (furiganaCheck) furiganaCheck.checked = Storage.getShowFurigana();
  const levelSel = document.getElementById('defaultLevelSelect');
  if (levelSel) levelSel.value = Storage.getDefaultLevel();
  const fontSizeInput = document.getElementById('printFontSizeInput');
  if (fontSizeInput) fontSizeInput.value = Storage.getPrintFontSize();
  const lineHeightInput = document.getElementById('printLineHeightInput');
  if (lineHeightInput) lineHeightInput.value = Storage.getPrintLineHeight();
}

// ═══════════════════════════════════════════════════════
// NAV
// ═══════════════════════════════════════════════════════
function wordsSubFromSelect(val) {
  localStorage.setItem('wordsLastSub', val);
  wordsSwitchSub(val);
}

function wordsSwitchSubRestore() {
  const last = localStorage.getItem('wordsLastSub') || 'vocab';
  const sel = document.getElementById('wordsSubSelect');
  if (sel) sel.value = last;
  wordsSwitchSub(last);
}

function wordsSwitchSub(name) {
  ['vocab','anki','game','counters','days'].forEach(s => {
    const el = document.getElementById('words-sub-' + s);
    const btn = document.getElementById('words-sub-btn-' + s);
    if (el) el.style.display = s === name ? 'block' : 'none';
    if (btn) btn.classList.toggle('active', s === name);
  });
  if (name === 'vocab') { renderVocab(); }
  if (name === 'anki') ankiConnect();
  if (name === 'counters') countInit2();
  if (name === 'days') daysOfMonthInit();
  if (name === 'game') { /* game initialises on click */ }
}

// ── Panel session timer ──────────────────────────────────────────────────────
const _STRAND_MAP = {
  listen: 1, read: 1, video: 1, video2: 1,
  lessonnotes: 2, writing: 2,
  grammar2: 3, words: 3, kana: 3,
  progress: null, settings: null, dashboard: null
};
let _panelSessionStart = null;
let _panelSessionId    = null;
let _panelLastInteract = null;

function _panelInteractPing() { _panelLastInteract = Date.now(); }
['click','keydown','mousedown'].forEach(ev =>
  document.addEventListener(ev, _panelInteractPing, { passive: true })
);

function _panelSessionClose(leavingId) {
  if (!_panelSessionStart || !_panelSessionId || !_panelLastInteract) return;
  const strand = _STRAND_MAP[_panelSessionId];
  if (strand == null) { _panelSessionStart = null; _panelSessionId = null; return; }
  const endTime   = Math.min(_panelLastInteract, Date.now());
  const duration  = Math.max(0, Math.round((endTime - _panelSessionStart) / 1000));
  if (duration < 2) { _panelSessionStart = null; _panelSessionId = null; return; }
  const startedAt = new Date(_panelSessionStart).toISOString();
  const endedAt   = new Date(endTime).toISOString();
  if (typeof window !== 'undefined' && window.db) {
    window.db.run(
      'INSERT INTO panel_sessions (panel, strand, started_at, ended_at, duration_s) VALUES (?,?,?,?,?)',
      [_panelSessionId, strand, startedAt, endedAt, duration]
    ).catch(() => {});
    window.db.run(
      'INSERT INTO learning_events (created_at, panel, event_type, payload) VALUES (?,?,?,?)',
      [endedAt, _panelSessionId, 'session:time', JSON.stringify({ strand, duration_s: duration })]
    ).catch(() => {});
  }
  _panelSessionStart = null;
  _panelSessionId    = null;
}

function showPanel(id) {
  // Save Quick Read session when leaving the read panel
  const currentPanel = document.querySelector('.panel.active');
  if (currentPanel && currentPanel.id === 'panel-read' && id !== 'read') {
    (App.qrSaveSession || window.qrSaveSession)?.();
  }

    document.querySelectorAll('.panel').forEach(p => { p.classList.remove('active'); p.style.display = ''; });
  // Lock body scroll for dashboard (Q&A panel), allow for others
  document.body.style.overflow = (id === 'dashboard') ? 'hidden' : '';
  document.querySelectorAll('nav button, .sidebar button').forEach(b => b.classList.remove('active'));
  const panelId = id === 'words' ? 'panel-words' : 'panel-' + id;
  const panel = document.getElementById(panelId);
  panel.classList.add('active');
  panel.style.display = 'block';
  const btn = document.querySelector('nav button[data-panel="' + id + '"], .sidebar button[data-panel="' + id + '"]');
  if (btn) btn.classList.add('active');
  if (id === 'kana') { if (typeof strokePanelInit === 'function') setTimeout(strokePanelInit, 50); }
  const _psc = document.getElementById('progressSidebarControls');
  if (_psc) _psc.style.display = id === 'progress' ? 'flex' : 'none';
  const _gph = document.getElementById('grammarPanelHeader'); if (_gph) _gph.style.display = id === 'grammar2' ? 'flex' : 'none';
  const _kph = document.getElementById('kanaPanelHeader'); if (_kph) _kph.style.display = id === 'kana' ? 'flex' : 'none';
  const _wph = document.getElementById('wordsPanelHeader'); if (_wph) _wph.style.display = id === 'words' ? 'flex' : 'none';
  const _rph = document.getElementById('readPanelHeader'); if (_rph) _rph.style.display = id === 'read' ? 'flex' : 'none';
  const _wrph = document.getElementById('writingPanelHeader'); if (_wrph) _wrph.style.display = id === 'writing' ? 'flex' : 'none';
  const _lph = document.getElementById('listenPanelHeader'); if (_lph) _lph.style.display = id === 'listening' ? 'flex' : 'none';
  const _vph = document.getElementById('voicePanelHeader'); if (_vph) _vph.style.display = id === 'voice' ? 'flex' : 'none';
  const _yph = document.getElementById('yoshiPanelHeader'); if (_yph) _yph.style.display = id === 'lessonnotes' ? 'flex' : 'none';
  const _pph = document.getElementById('progressPanelHeader'); if (_pph) _pph.style.display = id === 'progress' ? 'flex' : 'none';
  const _vfu = document.getElementById('voiceFooterUpper'); if (_vfu) _vfu.style.display = id === 'voice' ? 'flex' : 'none';
  const _vfl = document.getElementById('voiceFooterLower'); if (_vfl) _vfl.style.display = id === 'voice' ? 'flex' : 'none';
  if (id === 'settings') { goalsRestoreUI(); progressRenderCost(); stSwitchTab('settings'); try { (App.strandWeightsRender || window.strandWeightsRender)?.(); } catch(e) {} }
  if (id === 'read') { (App.qrRestoreSession || window.qrRestoreSession)?.(); }
  if (id === 'words') { wordsSwitchSubRestore(); }
  if (id === 'vocab') { showPanel('words'); return; }
  if (id === 'words') renderVocab();
  if (id === 'grammar2') { gram2Switch((typeof Grammar2State !== 'undefined' ? Grammar2State.lastSubtab : null) || 'conj'); }
  if (id === 'vocab-corpus') { vcRender(); }
  if (id === 'recordings') { (App.renderRecordingsBrowser || window.renderRecordingsBrowser)?.(); }
  if (id === 'gramnotes') {
    try { drillLastCompletedWrite('gramnotes'); } catch(e) {}
    // Migrate from old key 'gramNotes' if data exists there
    const _oldGram = localStorage.getItem('gramNotes');
    if (_oldGram && !localStorage.getItem('jpGramNotes')) {
      Storage.setJSON(STORAGE_KEYS.GRAM_NOTES, JSON.parse(_oldGram));
      localStorage.removeItem('gramNotes');
      console.log('Migrated grammar notes from gramNotes → jpGramNotes');
    }
    // Seed with GRAMMAR_POINTS on first ever open
    const _gnData = getGramData();
    const _syntaxEmpty = !_gnData.syntax || _gnData.syntax.length === 0;
    if (_syntaxEmpty && typeof GRAMMAR_POINTS !== 'undefined' && GRAMMAR_POINTS.length) {
      const date = new Date().toLocaleDateString('de-DE', {day:'2-digit',month:'2-digit',year:'numeric'});
      _gnData.syntax = GRAMMAR_POINTS.map(p => ({
        id: Date.now() + Math.random(),
        date,
        text: p.pattern + '\n' + p.en + (p.example ? '\n\n例: ' + p.example : '')
      }));

      // Seed other tabs with N5 starter notes if empty
      if (!_gnData.verbs || !_gnData.verbs.length) {
        _gnData.verbs = [
          { id: Date.now()+1, date, text: 'Verb groups\nGroup 1 (〜u verbs): dict form ends in u-row kana\nGroup 2 (〜ru verbs): dict form ends in る, stem ends in e or i\nIrregular: する (to do), くる (to come)' },
          { id: Date.now()+2, date, text: 'Polite present: verb stem + ます\nPolite negative: verb stem + ません\nPolite past: verb stem + ました\nPolite past neg: verb stem + ませんでした' },
          { id: Date.now()+3, date, text: 'て-form uses:\n〜ています — ongoing action (I am doing)\n〜てください — please do\n〜てもいいですか — may I...?\n〜てから — after doing' },
        ];
      }
      if (!_gnData.particles || !_gnData.particles.length) {
        _gnData.particles = [
          { id: Date.now()+4, date, text: 'は (wa) — topic marker\nが (ga) — subject marker (emphasis, existence)\nを (wo) — direct object\nに (ni) — direction, location of existence, time\nで (de) — location of action, means/method\nへ (e) — direction (movement)\nと (to) — with, and (exhaustive)\nや (ya) — and (partial list)\nも (mo) — also, too\nから (kara) — from, because\nまで (made) — until, as far as\nより (yori) — than (comparison)' },
        ];
      }
      if (!_gnData.adjectives || !_gnData.adjectives.length) {
        _gnData.adjectives = [
          { id: Date.now()+5, date, text: 'い-adjectives\nPresent: 〜い\nNegative: 〜くない\nPast: 〜かった\nPast neg: 〜くなかった\nAdverb: 〜く + verb (e.g. はやく はしる)' },
          { id: Date.now()+6, date, text: 'な-adjectives\nPresent: 〜な + noun / 〜です\nNegative: 〜じゃない / ではない\nPast: 〜でした\nAdverb: 〜に + verb (e.g. しずかに はなす)' },
        ];
      }
      saveGramData(_gnData);
    }
    GRAM_TABS.forEach(t => renderGramEntries(t));
  }
  if (id === 'kanji') { showPanel('words'); wordsSwitchSub('kanji'); return; }
  if (id === 'writing') { renderSavedTexts(); setTimeout(() => { setWritingMode('hiragana'); }, 0); }
  if (id === 'progress') {
    updateProgressPanel();
    const _yBtn = document.getElementById('strandYoshiToggle');
    if (_yBtn && (typeof _strandShowYoshi !== 'undefined' ? _strandShowYoshi : true)) { _yBtn.style.borderColor = 'var(--teal)'; _yBtn.style.color = 'var(--teal)'; }
    if (typeof renderConjMastery === 'function') renderConjMastery();
    if (typeof renderCounterMastery === 'function') renderCounterMastery();
    if (typeof renderGramSentHeatmap === 'function') renderGramSentHeatmap();
  }
  if (id === 'resources') { try { resourcesRender(); } catch(e) {} }
  if (id === 'counters') { showPanel('words'); wordsSwitchSub('counters'); return; }
  if (id === 'words' && document.getElementById('words-sub-vocab').style.display !== 'none') renderVocab();
  if (id === 'lessonnotes') {
    const _lnRestore = () => {
      const _savedId = localStorage.getItem('lnLastSessionId');
      if (_savedId && window.LessonNotesState) {
        const _fn = App.lessonNotesGetSessions || window.lessonNotesGetSessions;
        const _sessions = _fn ? _fn() : (window.LessonNotesState.sessions || []);
        const _idx = _sessions.findIndex(s => String(s.id) === _savedId);
        if (_idx >= 0) {
          (App.lessonNotesLoadSession || window.lessonNotesLoadSession)?.(_idx);
          return;
        }
      }
      lessonNotesRenderPanel();
    };
    // Load sessions first, then restore and render
    if (typeof Orchestrator !== 'undefined') {
      Orchestrator.loadSessions().then(_lnRestore);
    } else {
      _lnRestore();
    }
  }
  // Start panel session timer
  _panelSessionClose(id);
  if (_STRAND_MAP[id] != null) {
    _panelSessionStart  = Date.now();
    _panelSessionId     = id;
    _panelLastInteract  = Date.now();
  }
}

// ── Simple markdown renderer for Claude responses ──────────────────────────
function renderMarkdown(text) {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Headers
    .replace(/^### (.+)$/gm, '<h3 style="font-size:inherit;font-weight:600;margin:12px 0 4px;color:var(--ink)">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:1.1em;font-weight:600;margin:14px 0 6px;color:var(--ink)">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:1.2em;font-weight:700;margin:16px 0 8px;color:var(--ink)">$1</h1>')
    // Dividers
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:12px 0">')
    // Bold and italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Blockquotes
    .replace(/^&gt; (.+)$/gm, '<div style="border-left:3px solid var(--teal);padding-left:10px;color:var(--ink-light);margin:6px 0">$1</div>')
    // Line breaks
    .replace(/\n\n/g, '</p><p style="margin-top:10px">')
    .replace(/\n/g, '<br>');
  return '<p style="margin:0">' + html + '</p>';
}
window.renderMarkdown = renderMarkdown;

window.showPanel = showPanel;

// ── Settings tab switcher ─────────────────────────────────────────────────────
function stSwitchTab(tab) {
  const panes = { settings: 'stPaneSettings', grammar: 'stPaneGrammar' };
  const tabs  = { settings: 'stTabSettings',  grammar: 'stTabGrammar' };

  Object.entries(panes).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = key === tab ? '' : 'none';
  });
  Object.entries(tabs).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.borderBottomColor = key === tab ? 'var(--teal)' : 'transparent';
    el.style.color = key === tab ? 'var(--ink)' : 'var(--ink-light)';
  });

  if (tab === 'issues') {
    if (typeof issueTrackerRenderFull === 'function') issueTrackerRenderFull();
  }
  if (tab === 'grammar') stRenderGrammarOverride();
}
window['stSwitchTab'] = stSwitchTab;

function openDevWindow() {
  if (window.mgmt?.openWindow) {
    window.mgmt.openWindow().catch(e => console.warn('openDevWindow:', e));
  } else {
    console.warn('[openDevWindow] window.mgmt not available — check preload.js');
  }
}
window['openDevWindow'] = openDevWindow;

// ── Grammar mastery override UI ───────────────────────────────────────────────

async function stRenderGrammarOverride() {
  const el = document.getElementById('stGrammarOverrideGrid');
  if (!el) return;

  if (typeof GrammarModel === 'undefined') {
    el.innerHTML = '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light)">GrammarModel not loaded.</div>';
    return;
  }

  if (!GrammarModel.loaded) {
    el.innerHTML = '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink-light)">Loading…</div>';
    await GrammarModel.load();
  }

  const nodes = GrammarModel.getAllNodes();
  const coverage = GrammarModel.getCoverageMap();
  const scoreMap = {};
  coverage.forEach(n => { scoreMap[n.id] = { score: n.score, rawScore: n.rawScore, override: n.override }; });

  // Group by chapter
  const byChapter = {};
  nodes.forEach(n => {
    if (!byChapter[n.genki]) byChapter[n.genki] = [];
    byChapter[n.genki].push(n);
  });

  let html = '<div style="display:flex;flex-direction:column;gap:20px">';



  const scoreToVal = s => (s === null || s === undefined || s < 0) ? 'none'
    : s >= 0.95 ? 'mastered'
    : s >= 0.75 ? 'confident'
    : s >= 0.55 ? 'familiar'
    : 'seen';

  const opts = [
    { v: 'mastered',  label: 'Mastered',  score: 1.0,  color: '#00b894' },
    { v: 'confident', label: 'Confident', score: 0.8,  color: '#4a9eff' },
    { v: 'familiar',  label: 'Familiar',  score: 0.6,  color: '#e6a817' },
    { v: 'seen',      label: 'Seen',      score: 0.35, color: '#c0784a' },
    { v: 'none',      label: '—',         score: -1,   color: 'var(--border)' },
  ];

  for (const ch of Object.keys(byChapter).sort((a,b) => a-b)) {
    html += '<div>';
    html += '<div style="font-family:var(--ui);font-size:0.68rem;letter-spacing:0.1em;color:var(--ink-light);margin-bottom:8px">CHAPTER ' + ch + '</div>';
    html += '<div style="display:flex;flex-direction:column;gap:5px">';

    for (const node of byChapter[ch]) {
      const current = scoreMap[node.id];
      const rawScore = (current && current.override) ? current.rawScore : null;
      const val = scoreToVal(rawScore);

      html += '<div style="display:flex;align-items:center;gap:10px">';
      html += '<div style="display:flex;gap:3px;flex-shrink:0">';
      for (const opt of opts) {
        const active = val === opt.v;
        const scoreArg = opt.score < 0 ? -1 : opt.score;
        html += '<button '
          + 'onclick="stGrammarSetOverride(\'' + node.id + '\',' + scoreArg + ')" '
          + 'title="' + opt.label + '" '
          + 'style="padding:3px 8px;font-family:var(--ui);font-size:0.7rem;border-radius:4px;cursor:pointer;'
          + 'background:' + (active ? opt.color : 'var(--paper-dark)') + ';'
          + 'color:' + (active ? '#fff' : 'var(--ink-light)') + ';'
          + 'border:1px solid ' + (active ? opt.color : 'var(--border)') + '">'
          + opt.label + '</button>';
      }
      html += '</div>';
      html += '<div style="font-family:var(--ui);font-size:inherit;color:var(--ink)">' + node.label + '</div>';
      html += '</div>';
    }

    html += '</div></div>';
  }

  el.innerHTML = html;
}

async function stGrammarSetOverride(nodeId, score) {
  if (typeof GrammarModel === 'undefined') return;
  if (score < 0) {
    await GrammarModel.clearOverride(nodeId);
  } else {
    await GrammarModel.setOverride(nodeId, score);
  }
  await stRenderGrammarOverride();
  if (typeof renderGrammarCoverage === 'function') {
    await GrammarModel.reload();
    renderGrammarCoverage();
  }
}


// Panel toggle state for Alt+` shortcut
// AppState.lastPanel — see declaration below


// Persists kana mode per input ID — survives DOM recreation
const _kanaLastMode = {};

function setButtonGroupActive(group, activeId, activeColor = 'var(--teal)') {
  const btns = document.querySelectorAll(`[data-btn-toggle="${group}"]`);
  btns.forEach(btn => {
    const isActive = btn.id === activeId;
    if (btn.classList.contains('btn-kana')) {
      // CSS class-based kana buttons — use classes, not inline styles
      btn.classList.remove('active-hira', 'active-kata');
      if (isActive) {
        const activeCol = btn.dataset.activeColor || activeColor;
        if (activeCol.includes('gold')) btn.classList.add('active-kata');
        else btn.classList.add('active-hira');
      }
    } else {
      // Class-based active state for all non-btn-kana buttons
      btn.classList.remove('btn-active', 'btn-active-gold');
      if (isActive) {
        const activeCol = btn.dataset.activeColor || activeColor;
        if (activeCol.includes('gold')) btn.classList.add('btn-active-gold');
        else btn.classList.add('btn-active');
      }
    }
  });
}


// Wire up nav buttons via event listeners (for Electron CSP compatibility)
// Nav exists above this script, so we can attach immediately
(function() {
  const navBtns = document.querySelectorAll('nav button[data-panel], .sidebar button[data-panel]');
  navBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      const panel = this.getAttribute('data-panel');
      if (panel) {
        if (panel !== AppState.currentPanel) {
          AppState.lastPanel = AppState.currentPanel;
          AppState.currentPanel = panel;
        }
        showPanel(panel);
      }
    });
  });
})();

// Wire writing panel kana buttons via addEventListener (CSP-safe)
(function() {
  function wireWritingBtn(id, fn) {
    const btn = document.getElementById(id);
    if (!btn) return;
    // preventDefault on mousedown stops the button stealing focus from writingInput
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', fn);
  }
  wireWritingBtn('writingRomajiBtn', () => setWritingMode('romaji'));
  // hfBtn removed (diarization removed)
  wireWritingBtn('writingHiraBtn',   () => setWritingMode('hiragana'));
  wireWritingBtn('writingKataBtn',   () => setWritingMode('katakana'));
  wireWritingBtn('writingKanjiBtn',  () => kanaToKanji(document.getElementById('writingInput'), document.getElementById('writingKanjiBtn')));
  wireWritingBtn('writingSpeechBtn', () => sttStart('writingInput', 'writingSpeechBtn', 'ja'));
})();

// ── App registry — core-foundation exports ────────────────────────────────────
Object.assign(App, {
  // Quick translate
  globalQuickTranslate, globalQTClear, globalQTSelectHistory,
  qtHistoryUpdate, toggleQTHistory, selectQTHistory,
  renderLookupsTable, clearLookupCache,
  // Data management
  exportAllData, importDataPrompt, clearAllData,
  // Settings
  stSwitchTab, openDevWindow,
  stRenderGrammarOverride, stGrammarSetOverride,
  setButtonGroupActive,
  // Navigation
  showPanel,
  // Core utilities
  escHtml, formatDate, claudeAPI, claudeText,
  getApiKey, getOpenAIKey, saveApiKey, saveOpenAIKey, recordError,
  Storage, STORAGE_KEYS, state, saveState,
  // API usage
  apiUsageLoad, apiUsageSave, apiUsageTrack, apiUsageGetCost, apiUsageReset,
  // Init
  initApiKeyBar,
});
