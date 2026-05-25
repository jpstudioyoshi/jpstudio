const { app, BrowserWindow, session, shell, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');

let mainWindow;
let mgmtWindow = null;

// ── Management window ─────────────────────────────────────────────────────────
function openMgmtWindow() {
  if (mgmtWindow && !mgmtWindow.isDestroyed()) {
    mgmtWindow.focus();
    return;
  }
  mgmtWindow = new BrowserWindow({
    width: 1100, height: 800, minWidth: 700, minHeight: 500,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'Japanese Studio — Dev',
    titleBarStyle: 'default',
  });
  // Disable cache for management window — always load fresh files
  mgmtWindow.webContents.session.clearCache();
  mgmtWindow.loadURL('file://' + path.join(__dirname, 'management.html') + '?v=' + Date.now());
  mgmtWindow.on('closed', () => { mgmtWindow = null; });
}

ipcMain.handle('mgmt:openWindow', () => { openMgmtWindow(); return true; });
ipcMain.handle('mgmt:reloadMain', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload();
  return true;
});

// ── Print to PDF ──────────────────────────────────────────────────────────────
ipcMain.handle('print:htmlToPDF', async (event, html) => {
  const { BrowserWindow, dialog } = require('electron');
  try {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save PDF',
      defaultPath: 'reading-' + new Date().toISOString().slice(0,10) + '.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { canceled: true };
    const win = new BrowserWindow({ show: false, webPreferences: { javascript: true } });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise(r => setTimeout(r, 800));
    const data = await win.webContents.printToPDF({ printBackground: false, pageSize: 'A4' });
    win.destroy();
    fs.writeFileSync(filePath, data);
    return { ok: true, filePath };
  } catch(e) { return { error: e.message }; }
});
ipcMain.handle('print:toPDF', async (event, options = {}) => {
  if (!mainWindow) return { error: 'No main window' };
  try {
    const { dialog } = require('electron');
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save PDF',
      defaultPath: `reading-${Date.now()}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { canceled: true };
    const data = await mainWindow.webContents.printToPDF({
      printBackground: false,
      pageSize: 'A4',
      margins: { top: 1, bottom: 1, left: 1, right: 1 },
      ...options,
    });
    fs.writeFileSync(filePath, data);
    return { ok: true, filePath };
  } catch(e) { return { error: e.message }; }
});

// ── File access (restricted to jpStudio project directory) ───────────────────
const PROJECT_DIR = __dirname; // app lives at ~/Documents/jpStudio

ipcMain.handle('files:list', async () => {
  const ignored = new Set(['node_modules', '.git', '.DS_Store', 'dist', 'build']);
  function walk(dir, base = '') {
    const entries = [];
    try {
      for (const name of fs.readdirSync(dir)) {
        if (ignored.has(name) || name.startsWith('.')) continue;
        const full = path.join(dir, name);
        const rel  = base ? base + '/' + name : name;
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          entries.push({ type: 'dir', path: rel, name });
          entries.push(...walk(full, rel));
        } else {
          entries.push({ type: 'file', path: rel, name, size: stat.size });
        }
      }
    } catch(e) {}
    return entries;
  }
  return walk(PROJECT_DIR);
});

ipcMain.handle('files:read', async (event, filePath) => {
  try {
    const full = path.resolve(PROJECT_DIR, filePath);
    if (!full.startsWith(PROJECT_DIR)) return { error: 'Path outside project' };
    return { content: fs.readFileSync(full, 'utf8') };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('files:write', async (event, filePath, content) => {
  try {
    const full = path.resolve(PROJECT_DIR, filePath);
    if (!full.startsWith(PROJECT_DIR)) return { error: 'Path outside project' };
    fs.writeFileSync(full, content, 'utf8');
    return { ok: true };
  } catch(e) { return { error: e.message }; }
});
let youtubeWindow = null;
let overlayWindow = null;
let db = null;
let SQL = null;

// ── Database setup ────────────────────────────────────────────────────────────
function getDbPath() {
  return path.join(app.getPath('userData'), 'jpstudio.db');
}

function initDatabase() {
  try {
    const initSqlJs = require('sql.js');
    initSqlJs().then(SqlJs => {
      SQL = SqlJs;
      const dbPath = getDbPath();
      // Load existing database or create new one
      if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(fileBuffer);
        console.log('Database loaded:', dbPath);
      } else {
        db = new SQL.Database();
        console.log('Database created:', dbPath);
      }
      createSchema();
      seedStaticData();
      // Save immediately after seeding
      saveDatabase();
    }).catch(err => {
      console.error('sql.js init failed:', err.message);
    });
  } catch (err) {
    console.error('Database init failed:', err.message);
  }
}

function saveDatabase() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(getDbPath(), buffer);
  } catch (err) {
    console.error('Database save failed:', err.message);
  }
}

function createSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS words (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      word         TEXT NOT NULL UNIQUE,
      reading      TEXT NOT NULL,
      meaning      TEXT NOT NULL,
      level        TEXT NOT NULL,
      pitch        INTEGER,
      frequency    INTEGER,
      pos          TEXT,
      verb_class   TEXT,
      is_auxiliary INTEGER DEFAULT 0,
      list_source  TEXT,
      example      TEXT,
      counter_key  TEXT
    );
    CREATE TABLE IF NOT EXISTS kanji_ref (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      kanji   TEXT NOT NULL UNIQUE,
      keyword TEXT,
      reading TEXT,
      level   TEXT,
      meaning TEXT,
      rtk_num INTEGER
    );
    CREATE TABLE IF NOT EXISTS counters (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      key      TEXT NOT NULL UNIQUE,
      name     TEXT NOT NULL,
      desc     TEXT,
      readings TEXT NOT NULL,
      emoji    TEXT,
      words    TEXT
    );
    CREATE TABLE IF NOT EXISTS corpus_entries (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      word                  TEXT NOT NULL UNIQUE,
      first_seen            TEXT,
      first_seen_context    TEXT,
      first_seen_panel      TEXT,
      lookup_count          INTEGER DEFAULT 0,
      produced              INTEGER DEFAULT 0,
      first_produced        TEXT,
      first_produced_context TEXT,
      production_count      INTEGER DEFAULT 0,
      chat_production_count INTEGER DEFAULT 0,
      updated_at            TEXT
    );
    CREATE TABLE IF NOT EXISTS corpus_lookups (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      word         TEXT NOT NULL,
      looked_up_at TEXT NOT NULL,
      context      TEXT
    );
    CREATE TABLE IF NOT EXISTS corpus_productions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      word        TEXT NOT NULL,
      produced_at TEXT NOT NULL,
      source      TEXT NOT NULL,
      context     TEXT
    );
    CREATE TABLE IF NOT EXISTS writing_sessions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at    TEXT NOT NULL,
      text          TEXT NOT NULL,
      corrected     TEXT,
      is_correct    INTEGER,
      error_type    TEXT,
      error_pattern TEXT,
      block_submit  INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS drill_results (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at  TEXT NOT NULL,
      drill_type  TEXT NOT NULL,
      item_key    TEXT NOT NULL,
      correct     INTEGER NOT NULL,
      response_ms INTEGER
    );
    CREATE TABLE IF NOT EXISTS srs_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      item_key   TEXT NOT NULL,
      drill_type TEXT NOT NULL,
      interval   INTEGER DEFAULT 1,
      ease       REAL DEFAULT 2.5,
      due_date   TEXT,
      history    TEXT,
      UNIQUE(item_key, drill_type)
    );
    CREATE TABLE IF NOT EXISTS conversation_sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      topic      TEXT,
      level      TEXT,
      round1     TEXT,
      round2     TEXT,
      debrief    TEXT
    );
    CREATE TABLE IF NOT EXISTS lesson_sessions (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at        TEXT NOT NULL,
      date              TEXT,
      source            TEXT,
      raw_content       TEXT,
      extracted_grammar TEXT,
      audio_path        TEXT,
      audio_duration_s  INTEGER,
      diarization       TEXT,
      transcript_json   TEXT,
      notes_text        TEXT,
      processed_at      TEXT
    );
    CREATE TABLE IF NOT EXISTS transcript_turns (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id       INTEGER,
      timestamp_offset TEXT,
      speaker          TEXT,
      content          TEXT,
      word_count       INTEGER
    );
    CREATE TABLE IF NOT EXISTS failure_events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at   TEXT NOT NULL,
      failure_code TEXT NOT NULL,
      severity     INTEGER DEFAULT 1,
      source       TEXT,
      detail       TEXT,
      resolved     INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS agent_decisions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at      TEXT NOT NULL,
      failure_codes   TEXT,
      recommendation  TEXT,
      accepted        INTEGER
    );
    CREATE TABLE IF NOT EXISTS kv_store (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS error_history (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      source    TEXT NOT NULL,
      errorType TEXT,
      pattern   TEXT,
      input     TEXT,
      corrected TEXT,
      t         INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS error_history_t ON error_history(t);
  `);

  // Set schema version if not set
  const v = db.exec('SELECT version FROM schema_version');
  if (!v.length || !v[0].values.length) {
    db.run('INSERT INTO schema_version VALUES (1)');
  }

  // ── Migrations ──────────────────────────────────────────────────────────────
  const vRow = db.exec('SELECT version FROM schema_version');
  const currentVersion = vRow[0]?.values[0]?.[0] || 1;

  if (currentVersion < 2) {
    // v2: add verb_class, is_auxiliary, list_source to words
    const wordCols = (db.exec("PRAGMA table_info(words)")[0]?.values || []).map(r => r[1]);
    if (!wordCols.includes('verb_class'))   db.run('ALTER TABLE words ADD COLUMN verb_class TEXT');
    if (!wordCols.includes('is_auxiliary')) db.run('ALTER TABLE words ADD COLUMN is_auxiliary INTEGER DEFAULT 0');
    if (!wordCols.includes('list_source'))  db.run('ALTER TABLE words ADD COLUMN list_source TEXT');
    db.run('UPDATE schema_version SET version = 2');
    console.log('Migrated schema to v2 (verb_class, is_auxiliary, list_source)');
  }

  if (currentVersion < 3) {
    // v3: add seen + last_reviewed to srs_items
    const srsCols = (db.exec("PRAGMA table_info(srs_items)")[0]?.values || []).map(r => r[1]);
    if (!srsCols.includes('seen'))          db.run('ALTER TABLE srs_items ADD COLUMN seen INTEGER DEFAULT 0');
    if (!srsCols.includes('last_reviewed')) db.run('ALTER TABLE srs_items ADD COLUMN last_reviewed TEXT');
    db.run('UPDATE schema_version SET version = 3');
    console.log('Migrated schema to v3 (srs_items: seen, last_reviewed)');
  }

  if (currentVersion < 4) {
    // v4: add counter_key to words table
    const wordCols4 = (db.exec("PRAGMA table_info(words)")[0]?.values || []).map(r => r[1]);
    if (!wordCols4.includes('counter_key')) db.run('ALTER TABLE words ADD COLUMN counter_key TEXT');

    // Populate counter_key for countable N5/N4 nouns
    // counter keys match COUNTER_DATA keys: hiki, mai, hon, dai, satsu, nin, tsu, ko, hai
    const counterWords = [
      // 〜匹 (hiki) — small animals
      ['犬',   'hiki'], ['猫',   'hiki'], ['魚',  'hiki'], ['虫',  'hiki'],
      ['鳥',   'hiki'], ['馬',   'hiki'], ['牛',  'hiki'], ['豚',  'hiki'],
      // 〜頭 (tou) — large animals (use hiki as fallback since tou not in active counters)
      // 〜枚 (mai) — flat/thin things
      ['紙',   'mai'],  ['切手', 'mai'],  ['シャツ','mai'], ['皿', 'mai'],
      ['写真', 'mai'],  ['チケット','mai'],['カード','mai'], ['葉', 'mai'],
      // 〜本 (hon) — long thin things
      ['鉛筆', 'hon'],  ['ペン',  'hon'],  ['傘',  'hon'],  ['木',  'hon'],
      ['指',   'hon'],  ['川',   'hon'],  ['道',  'hon'],  ['瓶',  'hon'],
      ['ビール','hon'], ['電話', 'hon'],
      // 〜台 (dai) — machines/vehicles
      ['車',   'dai'],  ['自転車','dai'], ['バス', 'dai'],  ['電車', 'dai'],
      ['テレビ','dai'], ['パソコン','dai'],['カメラ','dai'], ['冷蔵庫','dai'],
      ['飛行機','dai'], ['船',   'dai'],  ['バイク','dai'],
      // 〜冊 (satsu) — bound things
      ['本',   'satsu'],['雑誌', 'satsu'],['ノート','satsu'],['辞書','satsu'],
      ['教科書','satsu'],
      // 〜人 (nin) — people
      ['人',   'nin'],  ['学生', 'nin'],  ['先生', 'nin'],  ['友達', 'nin'],
      ['子供', 'nin'],  ['男',   'nin'],  ['女',   'nin'],
      // 〜個 (ko) — small round objects
      ['りんご','ko'],  ['みかん','ko'],  ['卵',  'ko'],   ['石',  'ko'],
      ['ボール','ko'],
      // 〜杯 (hai) — cups/glasses/bowls
      ['コーヒー','hai'],['お茶','hai'],  ['水',  'hai'],   ['ビール','hai'],
      ['ご飯',  'hai'],  ['スープ','hai'],
      // 〜つ (tsu) — generic Japanese counter (small objects)
      ['机',   'tsu'],  ['椅子', 'tsu'],  ['箱',  'tsu'],  ['袋',  'tsu'],
      ['荷物', 'tsu'],  ['部屋', 'tsu'],
    ];

    const updateStmt = db.prepare('UPDATE words SET counter_key = ? WHERE word = ?');
    let updated = 0;
    for (const [word, key] of counterWords) {
      updateStmt.run([key, word]);
      updated++;
    }
    updateStmt.free();
    db.run('UPDATE schema_version SET version = 4');
    console.log(`Migrated schema to v4 (counter_key on words, ${updated} nouns tagged)`);
  }

  if (currentVersion < 5) {
    // v5: sentence corpus — frames and transcript_sentences tables

    // frames: extracted grammatical frames independent of any sentence
    // weight = how generative/useful this frame is (0-1)
    // social/presenter/structural/content = tagging dimensions (0-3)
    db.run(`CREATE TABLE IF NOT EXISTS frames (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      frame_jp    TEXT,
      frame_kana  TEXT,
      frame_en    TEXT,
      weight      REAL DEFAULT 0,
      social      INTEGER DEFAULT 0,
      presenter   INTEGER DEFAULT 0,
      structural  INTEGER DEFAULT 0,
      content     INTEGER DEFAULT 0
    )`);

    // transcript_sentences: individual sentences from CJ transcripts and curated sets
    // source: e.g. '草津温泉', '社会基本', '予約・スケジュール'
    // cluster: e.g. 'greetings', 'appointment', 'transcript'
    // level: 'beginner' | 'lower-intermediate' | 'intermediate'
    // kana: full kana reading (for STT normalisation)
    // en: English gloss
    // frame_id: FK to frames table (nullable — not all sentences have a rated frame yet)
    // sentence_weight: weight of THIS sentence (vs frame_weight for the extracted frame)
    // structural_rating: 1-3 Claude-assigned generativity score (0 = not yet rated)
    // srs_interval: days (SM-2, 0 = not started)
    // srs_ease: SM-2 ease factor (default 2.5)
    // srs_due: ISO date string for next review
    // last_score: 'again' | 'ok' | 'known' | null
    db.run(`CREATE TABLE IF NOT EXISTS transcript_sentences (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      source           TEXT,
      cluster          TEXT,
      jp               TEXT NOT NULL,
      kana             TEXT,
      en               TEXT,
      level            TEXT DEFAULT 'beginner',
      frame_id         INTEGER REFERENCES frames(id),
      sentence_weight  REAL DEFAULT 0,
      structural_rating INTEGER DEFAULT 0,
      srs_interval     INTEGER DEFAULT 0,
      srs_ease         REAL DEFAULT 2.5,
      srs_due          TEXT,
      last_score       TEXT,
      created_at       TEXT DEFAULT (datetime('now'))
    )`);

    db.run('UPDATE schema_version SET version = 5');
    console.log('Migrated schema to v5 (frames, transcript_sentences)');
  }

  if (currentVersion < 6) {
    // v6: add error_history table for unified error tracking
    db.run(`CREATE TABLE IF NOT EXISTS error_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      errorType TEXT,
      pattern TEXT,
      input TEXT,
      corrected TEXT,
      t INTEGER NOT NULL
    )`);
    db.run('CREATE INDEX IF NOT EXISTS error_history_t ON error_history(t)');
    db.run('UPDATE schema_version SET version = 6');
    console.log('Migrated schema to v6 (error_history table)');
  }

  if (currentVersion < 7) {
    // v7: add lesson_id and source to words for lesson-extracted vocab
    const wc7 = (db.exec("PRAGMA table_info(words)")[0]?.values || []).map(r => r[1]);
    if (!wc7.includes('lesson_id')) db.run('ALTER TABLE words ADD COLUMN lesson_id INTEGER REFERENCES lesson_sessions(id)');
    if (!wc7.includes('source'))    db.run('ALTER TABLE words ADD COLUMN source TEXT');
    db.run('UPDATE schema_version SET version = 7');
    console.log('Migrated schema to v7 (lesson_id, source on words)');
  }

  // v8: add lesson_phrases table
  const vRow8 = db.exec('SELECT version FROM schema_version');
  const v8 = vRow8[0]?.values[0]?.[0] || 0;
  if (v8 < 8) {
    db.run(`CREATE TABLE IF NOT EXISTS lesson_phrases (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id  INTEGER REFERENCES lesson_sessions(id),
      phrase     TEXT NOT NULL,
      reading    TEXT,
      meaning    TEXT NOT NULL,
      example    TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.run('UPDATE schema_version SET version = 8');
    console.log('Migrated schema to v8 (lesson_phrases table)');
  }
  // v9: pitch_data lookup table + pitch column on words
  if ((db.exec('SELECT version FROM schema_version')[0]?.values[0]?.[0] || 0) < 9) {
    db.run(`CREATE TABLE IF NOT EXISTS pitch_data (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      kanji    TEXT NOT NULL,
      reading  TEXT NOT NULL,
      pitch    TEXT NOT NULL
    )`);
    db.run('CREATE INDEX IF NOT EXISTS idx_pitch_kanji ON pitch_data(kanji)');
    db.run('CREATE INDEX IF NOT EXISTS idx_pitch_reading ON pitch_data(reading)');
    db.run(`ALTER TABLE words ADD COLUMN pitch TEXT`);
    db.run('UPDATE schema_version SET version = 9');
    console.log('Migrated schema to v9 (pitch_data table, pitch on words)');
  }
  // v9: pitch_data lookup table + pitch column on words
  const vRow9 = db.exec('SELECT version FROM schema_version');
  const v9 = vRow9[0]?.values[0]?.[0] || 0;
  if (v9 < 9) {
    db.run(`CREATE TABLE IF NOT EXISTS pitch_data (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      kanji    TEXT NOT NULL,
      reading  TEXT NOT NULL,
      pitch    TEXT NOT NULL
    )`);
    db.run('CREATE INDEX IF NOT EXISTS idx_pitch_kanji ON pitch_data(kanji)');
    db.run('CREATE INDEX IF NOT EXISTS idx_pitch_reading ON pitch_data(reading)');
    db.run(`ALTER TABLE words ADD COLUMN pitch TEXT`);
    db.run('UPDATE schema_version SET version = 9');
    console.log('Migrated schema to v9 (pitch_data table, pitch on words)');
  }
  console.log('Schema created/verified');
}

function seedStaticData() {
  // Only seed if words table is empty
  const result = db.exec('SELECT COUNT(*) as n FROM words');
  const count = result[0]?.values[0]?.[0] || 0;
  if (count > 0) { console.log('Static data already loaded:', count, 'words'); return; }

  const appDir = __dirname;

  // Load jlpt_words.json
  try {
    const words = JSON.parse(fs.readFileSync(path.join(appDir, 'src/data/jlpt_words.json'), 'utf8'));
    const stmt = db.prepare('INSERT OR IGNORE INTO words (word, reading, meaning, level, pitch, frequency, pos, list_source) VALUES (?,?,?,?,?,?,?,?)');
    for (const w of words) stmt.run([w.w, w.r, w.m, w.l, w.p ?? null, w.f ?? null, w.pos ?? null, 'jlpt']);
    stmt.free();
    console.log(`Seeded ${words.length} JLPT words`);
  } catch(e) { console.warn('jlpt_words.json not found:', e.message); }

  // Load kanji reference
  try {
    const levels   = JSON.parse(fs.readFileSync(path.join(appDir, 'src/data/kanji_jlpt_level.json'), 'utf8'));
    const meanings = JSON.parse(fs.readFileSync(path.join(appDir, 'src/data/kanji_meanings.json'), 'utf8'));
    const rtk      = JSON.parse(fs.readFileSync(path.join(appDir, 'src/data/rtk_kanji.json'), 'utf8'));
    const rtkMap   = {};
    for (const e of rtk) rtkMap[e.k] = e;
    const allKanji = new Set([...Object.keys(levels), ...Object.keys(meanings)]);
    const stmt = db.prepare('INSERT OR IGNORE INTO kanji_ref (kanji, keyword, reading, level, meaning, rtk_num) VALUES (?,?,?,?,?,?)');
    for (const k of allKanji) {
      const r = rtkMap[k];
      stmt.run([k, r?.kw ?? null, r?.r ?? null, levels[k] ?? null, meanings[k] ?? null, r?.n ?? null]);
    }
    stmt.free();
    console.log(`Seeded ${allKanji.size} kanji`);
  } catch(e) { console.warn('Kanji files not found:', e.message); }

  // Load counters
  try {
    const counters = JSON.parse(fs.readFileSync(path.join(appDir, 'src/data/counter_data.json'), 'utf8'));
    const stmt = db.prepare('INSERT OR IGNORE INTO counters (key, name, desc, readings, emoji, words) VALUES (?,?,?,?,?,?)');
    for (const [key, c] of Object.entries(counters)) {
      stmt.run([key, c.name, c.desc, JSON.stringify(c.readings), JSON.stringify(c.emoji), JSON.stringify(c.words)]);
    }
    stmt.free();
    console.log(`Seeded ${Object.keys(counters).length} counters`);
  } catch(e) { console.warn('counter_data.json not found:', e.message); }
}

// ── IPC handlers ──────────────────────────────────────────────────────────────
ipcMain.handle('db:query', (event, sql, params = []) => {
  if (!db) return { error: 'Database not available' };
  try {
    const result = db.exec(sql, params);
    if (!result.length) return [];
    const { columns, values } = result[0];
    return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('db:get', (event, sql, params = []) => {
  if (!db) return { error: 'Database not available' };
  try {
    const result = db.exec(sql, params);
    if (!result.length || !result[0].values.length) return null;
    const { columns, values } = result[0];
    return Object.fromEntries(columns.map((c, i) => [c, values[0][i]]));
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('pitch:import', async (event) => {
  if (!db) return { error: 'Database not available' };
  try {
    const count = db.exec('SELECT COUNT(*) as n FROM pitch_data')[0]?.values[0]?.[0] || 0;
    if (count > 0) return { skipped: true, count };
    const tsvPath = path.join(__dirname, 'data', 'kanjium-accents.txt');
    const text = fs.readFileSync(tsvPath, 'utf8');
    const lines = text.split('\n').filter(l => l.trim());
    db.run('BEGIN TRANSACTION');
    let inserted = 0;
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length < 3) continue;
      const [kanji, reading, pitch] = parts;
      db.run('INSERT INTO pitch_data (kanji, reading, pitch) VALUES (?, ?, ?)', [kanji.trim(), reading.trim(), pitch.trim()]);
      inserted++;
    }
    db.run('COMMIT');
    console.log('[pitch] Imported', inserted, 'entries');
    return { inserted };
  } catch(e) {
    try { db.run('ROLLBACK'); } catch(_) {}
    return { error: e.message };
  }
});

ipcMain.handle('pitch:lookup', (event, kanji, reading) => {
  if (!db) return null;
  try {
    const res = db.exec('SELECT pitch FROM pitch_data WHERE kanji = ? LIMIT 1', [kanji]);
    if (res[0]?.values[0]) return res[0].values[0][0];
    if (reading) {
      const res2 = db.exec('SELECT pitch FROM pitch_data WHERE reading = ? LIMIT 1', [reading]);
      if (res2[0]?.values[0]) return res2[0].values[0][0];
    }
    return null;
  } catch(e) { return null; }
});

ipcMain.handle('db:run', (event, sql, params = []) => {
  if (!db) return { error: 'Database not available' };
  try {
    db.run(sql, params);
    saveDatabase();
    return { changes: db.getRowsModified() };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('db:isAvailable', () => db !== null);

// ── Word list — renderer reads words from SQL, not JSON ───────────────────────
ipcMain.handle('words:getAll', () => {
  if (!db) return [];
  try {
    const result = db.exec('SELECT word, reading, meaning, level, pitch, frequency, pos, verb_class, is_auxiliary, list_source FROM words ORDER BY level, frequency');
    if (!result.length) return [];
    const { columns, values } = result[0];
    return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
  } catch(e) { console.error('words:getAll failed:', e.message); return []; }
});

// Add or update a word (upsert). Caller supplies a word object.
ipcMain.handle('words:upsert', (event, w) => {
  if (!db) return { error: 'Database not available' };
  try {
    db.run(
      `INSERT INTO words (word, reading, meaning, level, pitch, frequency, pos, verb_class, is_auxiliary, list_source, lesson_id, source)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(word) DO UPDATE SET
         reading      = excluded.reading,
         meaning      = excluded.meaning,
         level        = excluded.level,
         pitch        = COALESCE(excluded.pitch, pitch),
         frequency    = COALESCE(excluded.frequency, frequency),
         pos          = COALESCE(excluded.pos, pos),
         verb_class   = COALESCE(excluded.verb_class, verb_class),
         is_auxiliary = COALESCE(excluded.is_auxiliary, is_auxiliary),
         list_source  = COALESCE(excluded.list_source, list_source),
         lesson_id    = COALESCE(excluded.lesson_id, lesson_id),
         source       = COALESCE(excluded.source, source)`,
      [w.word, w.reading, w.meaning, w.level ?? 'custom', w.pitch ?? null,
       w.frequency ?? null, w.pos ?? null, w.verb_class ?? null,
       w.is_auxiliary ?? 0, w.list_source ?? 'custom',
       w.lesson_id ?? null, w.source ?? null]
    );
    saveDatabase();
    return { ok: true };
  } catch(e) { return { error: e.message }; }
});

// Bulk insert a new word list (e.g. N3, days of week, custom set).
// listSource tags every row so you can filter/weight by origin later.
ipcMain.handle('words:insertList', (event, words, listSource) => {
  if (!db) return { error: 'Database not available' };
  try {
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO words (word, reading, meaning, level, pitch, frequency, pos, verb_class, is_auxiliary, list_source)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    );
    let inserted = 0;
    for (const w of words) {
      stmt.run([w.word ?? w.w, w.reading ?? w.r, w.meaning ?? w.m,
                w.level ?? w.l ?? 'custom', w.pitch ?? w.p ?? null,
                w.frequency ?? w.f ?? null, w.pos ?? null,
                w.verb_class ?? null, w.is_auxiliary ?? 0,
                listSource ?? w.list_source ?? 'custom']);
      inserted++;
    }
    stmt.free();
    saveDatabase();
    return { inserted };
  } catch(e) { return { error: e.message }; }
});

// ── SRS — DrillSRS backend ────────────────────────────────────────────────────
// Load all SRS items for a given drill_type. Returns array of row objects.
ipcMain.handle('srs:getAll', (event, drillType) => {
  if (!db) return [];
  try {
    const result = db.exec(
      'SELECT item_key, drill_type, interval, ease, due_date, history, seen, last_reviewed FROM srs_items WHERE drill_type = ?',
      [drillType]
    );
    if (!result.length) return [];
    const { columns, values } = result[0];
    return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
  } catch(e) { console.error('srs:getAll failed:', e.message); return []; }
});

// Upsert a single SRS item.
ipcMain.handle('srs:set', (event, drillType, itemKey, item) => {
  if (!db) return { error: 'db unavailable' };
  try {
    db.run(
      `INSERT INTO srs_items (item_key, drill_type, interval, ease, due_date, history, seen, last_reviewed)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(item_key, drill_type) DO UPDATE SET
         interval      = excluded.interval,
         ease          = excluded.ease,
         due_date      = excluded.due_date,
         history       = excluded.history,
         seen          = excluded.seen,
         last_reviewed = excluded.last_reviewed`,
      [itemKey, drillType,
       item.interval ?? 0, item.ease ?? 2.5,
       item.due ? new Date(item.due).toISOString() : null,
       JSON.stringify(item.history || []),
       item.seen ?? 0,
       new Date().toISOString()]
    );
    saveDatabase();
    return { ok: true };
  } catch(e) { return { error: e.message }; }
});

// Bulk upsert — used for migration and full saves.
ipcMain.handle('srs:setAll', (event, drillType, items) => {
  if (!db) return { error: 'db unavailable' };
  try {
    const stmt = db.prepare(
      `INSERT INTO srs_items (item_key, drill_type, interval, ease, due_date, history, seen, last_reviewed)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(item_key, drill_type) DO UPDATE SET
         interval      = excluded.interval,
         ease          = excluded.ease,
         due_date      = excluded.due_date,
         history       = excluded.history,
         seen          = excluded.seen,
         last_reviewed = excluded.last_reviewed`
    );
    const now = new Date().toISOString();
    for (const [itemKey, item] of Object.entries(items)) {
      stmt.run([
        itemKey, drillType,
        item.interval ?? 0, item.ease ?? 2.5,
        item.due ? new Date(item.due).toISOString() : null,
        JSON.stringify(item.history || []),
        item.seen ?? 0, now
      ]);
    }
    stmt.free();
    saveDatabase();
    return { ok: true };
  } catch(e) { return { error: e.message }; }
});

// Reset all SRS data for a drill type.
ipcMain.handle('srs:reset', (event, drillType) => {
  if (!db) return { error: 'db unavailable' };
  try {
    db.run('DELETE FROM srs_items WHERE drill_type = ?', [drillType]);
    saveDatabase();
    return { ok: true };
  } catch(e) { return { error: e.message }; }
});
ipcMain.handle('kv:get', (event, key) => {
  if (!db) return null;
  try {
    const result = db.exec('SELECT value FROM kv_store WHERE key = ?', [key]);
    if (!result.length || !result[0].values.length) return null;
    return result[0].values[0][0];
  } catch(e) { return null; }
});

ipcMain.handle('kv:set', (event, key, value) => {
  if (!db) return { error: 'Database not available' };
  try {
    db.run('INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))', [key, value]);
    saveDatabase();
    return { ok: true };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('kv:delete', (event, key) => {
  if (!db) return;
  try { db.run('DELETE FROM kv_store WHERE key = ?', [key]); saveDatabase(); } catch(e) {}
});

ipcMain.handle('kv:list', (event, prefix) => {
  if (!db) return [];
  try {
    const sql = prefix
      ? 'SELECT key, value FROM kv_store WHERE key LIKE ?'
      : 'SELECT key, value FROM kv_store';
    const params = prefix ? [prefix + '%'] : [];
    const result = db.exec(sql, params);
    if (!result.length) return [];
    return result[0].values.map(([k, v]) => ({ key: k, value: v }));
  } catch(e) { return []; }
});

// ── Audio waveform via ffmpeg (avoids OOM in renderer) ───────────────────────
ipcMain.handle('audio:waveform', async (event, filePath, buckets) => {
  const { execFile } = require('child_process');
  // Find ffmpeg — check common Mac locations as Electron doesn't inherit shell PATH
  const { execSync } = require('child_process');
  let ffmpegPath = 'ffmpeg';
  try {
    ffmpegPath = execSync('which ffmpeg', { encoding: 'utf8' }).trim();
  } catch(e) {
    // Try common install locations
    const candidates = [
      '/usr/local/bin/ffmpeg',
      '/opt/homebrew/bin/ffmpeg',
      '/opt/homebrew/opt/ffmpeg/bin/ffmpeg',
      '/usr/bin/ffmpeg',
      '/opt/local/bin/ffmpeg',  // MacPorts
      path.join(process.env.HOME || '', '.local/bin/ffmpeg'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) { ffmpegPath = c; break; }
    }
  }
  console.log('audio:waveform using ffmpeg:', ffmpegPath, 'file:', filePath);
  buckets = buckets || 800;
  return new Promise((resolve) => {
    // Use ffmpeg to decode audio to raw 8-bit unsigned PCM at 4000Hz mono
    // This runs in the main process — renderer never touches the audio buffer
    const args = [
      '-i', filePath,       // execFile passes args as array — no shell quoting needed
      '-ac', '1',           // mono
      '-ar', '4000',        // 4kHz — enough for waveform shape
      '-f', 'u8',           // unsigned 8-bit PCM
      '-t', '600',          // max 10 minutes
      '-vn',                // no video
      'pipe:1'              // output to stdout
    ];
    const proc = execFile(ffmpegPath, args, { maxBuffer: 50 * 1024 * 1024, encoding: 'buffer' },
      (err, stdout) => {
        if (err || !stdout || !stdout.length) {
          console.error('audio:waveform ffmpeg error:', err?.message, err?.code, err?.killed);
          resolve(null);
          return;
        }
        // Downsample to buckets
        const raw = new Uint8Array(stdout.buffer, stdout.byteOffset, stdout.byteLength);
        const step = Math.max(1, Math.floor(raw.length / buckets));
        const data = new Float32Array(buckets);
        for (let i = 0; i < buckets; i++) {
          let max = 0;
          const end = Math.min(raw.length, i * step + step);
          for (let j = i * step; j < end; j++) {
            const v = Math.abs((raw[j] || 128) - 128) / 128;
            if (v > max) max = v;
          }
          data[i] = max;
        }
        // Normalise
        let peak = 0.001;
        for (let i = 0; i < buckets; i++) if (data[i] > peak) peak = data[i];
        for (let i = 0; i < buckets; i++) data[i] /= peak;
        resolve(Array.from(data));
      }
    );
  });
});

// ── Lesson recording ─────────────────────────────────────────────────────────
const { execFile, execSync, spawn } = require('child_process');

function getLessonsDir() {
  const dir = path.join(app.getPath('userData'), 'lessons');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function findFfmpeg() {
  try { return execSync('which ffmpeg', { encoding: 'utf8' }).trim(); } catch(e) {}
  const candidates = [
    '/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg',
    '/opt/homebrew/opt/ffmpeg/bin/ffmpeg', '/usr/bin/ffmpeg',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return 'ffmpeg';
}

function findPython() {
  const candidates = ['python3.12', 'python3', 'python'];
  for (const c of candidates) {
    try { execSync(`which ${c}`, { encoding: 'utf8' }); return c; } catch(e) {}
  }
  return 'python3';
}

// Start a new lesson recording session — returns {sessionId, audioPath}
ipcMain.handle('lesson:startRecording', async (event) => {
  const date = new Date().toISOString().slice(0, 10);
  const ts   = Date.now();
  const audioPath = path.join(getLessonsDir(), `lesson_${date}_${ts}.webm`);
  // Insert session row
  if (db) {
    db.run(
      'INSERT INTO lesson_sessions (created_at, date, source, audio_path) VALUES (?, ?, ?, ?)',
      [new Date().toISOString(), date, 'recording', audioPath]
    );
    saveDatabase();
    const row = db.exec('SELECT last_insert_rowid() as id');
    const sessionId = row[0]?.values[0]?.[0];
    return { sessionId, audioPath };
  }
  return { error: 'Database not available' };
});

// Save audio blob written by renderer to the audio path
ipcMain.handle('lesson:saveAudioChunk', async (event, audioPath, buffer) => {
  try {
    const buf = Buffer.from(buffer);
    if (fs.existsSync(audioPath)) {
      fs.appendFileSync(audioPath, buf);
    } else {
      fs.writeFileSync(audioPath, buf);
    }
    return { ok: true };
  } catch(e) {
    return { error: e.message };
  }
});

// Finalise recording — get duration via ffprobe
ipcMain.handle('lesson:finaliseRecording', async (event, sessionId, audioPath) => {
  try {
    const ffmpeg = findFfmpeg();
    const ffprobe = ffmpeg.replace('ffmpeg', 'ffprobe');

    // Chrome MediaRecorder produces WebM with no duration index — fix it with -c copy
    // so ffmpeg can seek and chunk the file for transcription.
    const fixedPath = audioPath.replace('.webm', '_r.webm');
    let workingPath = audioPath;
    try {
      execSync(`"${ffmpeg}" -y -i "${audioPath}" -c copy "${fixedPath}"`,
        { encoding: 'utf8', timeout: 60000, stdio: 'pipe' });
      // Replace original with fixed version
      fs.renameSync(fixedPath, audioPath);
    } catch(e) {
      console.warn('[finaliseRecording] ffmpeg reindex failed — proceeding with original:', e.message);
      try { if (fs.existsSync(fixedPath)) fs.unlinkSync(fixedPath); } catch(e2) {}
    }

    // Get duration via ffprobe
    let duration = 0;
    try {
      const out = execSync(
        `"${ffprobe}" -v quiet -print_format json -show_format "${audioPath}"`,
        { encoding: 'utf8', timeout: 8000 }
      );
      duration = Math.round(parseFloat(JSON.parse(out).format?.duration || 0));
    } catch(e) {
      // ffprobe unavailable — estimate from file size (webm/opus ~128kbps)
      try {
        const stat = fs.statSync(audioPath);
        duration = Math.max(1, Math.round(stat.size / 16000));
      } catch(e2) {}
    }

    if (db) {
      db.run('UPDATE lesson_sessions SET audio_duration_s=? WHERE id=?', [duration, sessionId]);
      saveDatabase();
    }
    return { ok: true, duration, audioPath };
  } catch(e) {
    return { error: e.message };
  }
});

// Chunk audio into ≤20MB pieces with 2s overlap, return array of temp file paths
ipcMain.handle('lesson:chunkAudio', async (event, audioPath, chunkMb) => {
  const ffmpeg = findFfmpeg();
  const chunkSize = (chunkMb || 18) * 1024 * 1024;
  const size = fs.statSync(audioPath).size;
  if (size <= chunkSize) return { chunks: [audioPath] };

  // Get duration
  const ffprobe = ffmpeg.replace('ffmpeg', 'ffprobe');
  let duration = 0;
  try {
    const out = execSync(`"${ffprobe}" -v quiet -print_format json -show_format "${audioPath}"`, { encoding: 'utf8' });
    duration = parseFloat(JSON.parse(out).format?.duration || 0);
  } catch(e) { return { error: 'Could not probe audio: ' + e.message }; }

  const chunkDuration = (duration / size) * chunkSize;
  const overlap = 2;
  const chunks = [];
  const tmpDir = getLessonsDir();

  let start = 0;
  let idx = 0;
  while (start < duration) {
    const outPath = path.join(tmpDir, `chunk_${Date.now()}_${idx}.webm`);
    const end = Math.min(start + chunkDuration + overlap, duration);
    await new Promise((resolve, reject) => {
      execFile(ffmpeg, [
        '-ss', String(start), '-t', String(end - start),
        '-i', audioPath, '-c', 'copy', '-y', outPath
      ], (err) => err ? reject(err) : resolve());
    });
    chunks.push({ path: outPath, startS: start });
    start += chunkDuration;
    idx++;
  }
  return { chunks };
});

// Run pyannote diarization — returns [{start, end, speaker}]
ipcMain.handle('lesson:diarize', async (event, audioPath, hfToken) => {
  const python = findPython();
  const scriptPath = path.join(__dirname, 'diarize.py');

  // Write diarize.py if it doesn't exist
  const script = `
import sys, json
try:
    from pyannote.audio import Pipeline
    import torch
    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        use_auth_token=sys.argv[2] if len(sys.argv) > 2 else None
    )
    diarization = pipeline(sys.argv[1])
    segments = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        segments.append({"start": round(turn.start, 2), "end": round(turn.end, 2), "speaker": speaker})
    print(json.dumps({"ok": True, "segments": segments}))
except ImportError as e:
    print(json.dumps({"error": "pyannote not installed: " + str(e)}))
except Exception as e:
    print(json.dumps({"error": str(e)}))
`;
  if (!fs.existsSync(scriptPath)) fs.writeFileSync(scriptPath, script);

  return new Promise((resolve) => {
    const args = [scriptPath, audioPath];
    if (hfToken) args.push(hfToken);
    execFile(python, args, { timeout: 300000 }, (err, stdout, stderr) => {
      try {
        const result = JSON.parse(stdout.trim());
        if (db && result.ok) {
          db.run('UPDATE lesson_sessions SET diarization=? WHERE audio_path=?',
            [JSON.stringify(result.segments), audioPath]);
          saveDatabase();
        }
        resolve(result);
      } catch(e) {
        resolve({ error: 'Diarize failed: ' + (stderr || e.message) });
      }
    });
  });
});

// Save assembled transcript to session
ipcMain.handle('lesson:saveTranscript', async (event, sessionId, transcriptJson) => {
  if (!db) return { error: 'Database not available' };
  try {
    db.run('UPDATE lesson_sessions SET transcript_json=?, processed_at=? WHERE id=?',
      [JSON.stringify(transcriptJson), new Date().toISOString(), sessionId]);
    // Also write individual turns
    for (const turn of transcriptJson) {
      db.run(
        'INSERT INTO transcript_turns (session_id, timestamp_offset, speaker, content, word_count) VALUES (?,?,?,?,?)',
        [sessionId, String(turn.start), turn.speaker, turn.text, (turn.text || '').split(/\s+/).length]
      );
    }
    saveDatabase();
    return { ok: true };
  } catch(e) { return { error: e.message }; }
});

// Save WhatsApp/lesson notes text to session
ipcMain.handle('lesson:saveNotes', async (event, sessionId, notesText) => {
  if (!db) return { error: 'Database not available' };
  try {
    db.run('UPDATE lesson_sessions SET notes_text=? WHERE id=?', [notesText, sessionId]);
    saveDatabase();
    return { ok: true };
  } catch(e) { return { error: e.message }; }
});

// Load a lesson session
ipcMain.handle('lesson:get', async (event, sessionId) => {
  if (!db) return null;
  try {
    const result = db.exec('SELECT * FROM lesson_sessions WHERE id=?', [sessionId]);
    if (!result.length || !result[0].values.length) return null;
    const { columns, values } = result[0];
    return Object.fromEntries(columns.map((c, i) => [c, values[0][i]]));
  } catch(e) { return null; }
});

// List all lesson sessions
ipcMain.handle('lesson:list', async () => {
  if (!db) return [];
  try {
    const result = db.exec('SELECT id, created_at, date, audio_path, audio_duration_s, processed_at, transcript_json FROM lesson_sessions ORDER BY created_at DESC');
    if (!result.length) return [];
    const { columns, values } = result[0];
    return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
  } catch(e) { return []; }
});

// Delete a file from disk
ipcMain.handle('lesson:deleteFile', async (event, filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { ok: true };
  } catch(e) { return { error: e.message }; }
});

// Delete a lesson session row
ipcMain.handle('lesson:deleteSession', async (event, sessionId) => {
  if (!db) return { error: 'Database not available' };
  try {
    db.run('DELETE FROM lesson_sessions WHERE id=?', [sessionId]);
    db.run('DELETE FROM transcript_turns WHERE session_id=?', [sessionId]);
    saveDatabase();
    return { ok: true };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('lesson:getFileSizes', async (_, paths) => {
  const result = {};
  for (const p of (paths || [])) {
    try { result[p] = fs.statSync(p).size; }
    catch { result[p] = 0; }
  }
  return result;
});

// ── Window creation ───────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 800, minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'default',
    title: 'Japanese Studio'
  });

  // Disable caching entirely for this session — dev mode, always load from disk.
  // clearCache() alone isn't enough; setting cache-control via ses.webRequest
  // ensures every script tag gets a fresh response for the lifetime of the session.
  const ses = mainWindow.webContents.session;
  ses.clearCache().catch(() => {});
  ses.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Cache-Control': ['no-store, no-cache, must-revalidate'],
        'Pragma':        ['no-cache'],
        'Expires':       ['0'],
      }
    });
  });
  mainWindow.loadURL('file://' + path.join(__dirname, 'index.html') + '?v=' + Date.now());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      openYouTubeWindow(url); return { action: 'deny' };
    }
    shell.openExternal(url); return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      event.preventDefault(); openYouTubeWindow(url);
    } else if (!url.startsWith('file://')) {
      event.preventDefault(); shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (youtubeWindow) youtubeWindow.close();
    if (overlayWindow) overlayWindow.close();
  });
}

function openLessonOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.focus(); return;
  }
  overlayWindow = new BrowserWindow({
    width: 320, height: 480,
    minWidth: 260, minHeight: 320,
    alwaysOnTop: true,
    transparent: false,
    frame: false,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-overlay.js'),
    },
    title: 'Lesson Overlay',
  });
  overlayWindow.loadFile('lesson-overlay.html');
  overlayWindow.on('closed', () => { overlayWindow = null; });
}

ipcMain.handle('overlay:open',        () => openLessonOverlay());
ipcMain.handle('overlay:toggleOnTop', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    const cur = overlayWindow.isAlwaysOnTop();
    overlayWindow.setAlwaysOnTop(!cur);
  }
});
ipcMain.handle('overlay:addMarker',   (event, marker) => {
  // Forward marker to main window for inclusion in session
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('lesson:marker', marker);
  }
});
ipcMain.handle('overlay:getApiKey', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  try {
    const key = await mainWindow.webContents.executeJavaScript(
      "(App.getApiKey || window.getApiKey)?.() || localStorage.getItem('jpStudioApiKey') || ''"
    );
    return key || null;
  } catch(e) { return null; }
});

// ── Overlay recording controls ────────────────────────────────────────────────
// The overlay proxies start/stop through main so AudioService in the main
// renderer window does the actual recording. Events are forwarded back to
// the overlay via webContents.send so it can show timer and status.

ipcMain.handle('overlay:checkTodaySession', async () => {
  const date = new Date().toISOString().slice(0, 10);
  if (!db) return null;
  const r = db.exec(`SELECT id, audio_duration_s FROM lesson_sessions WHERE date='${date}' AND source='recording' ORDER BY created_at DESC LIMIT 1`);
  if (!r[0]?.values?.length) return null;
  const [id, dur] = r[0].values[0];
  return { id, dur };
});

ipcMain.handle('overlay:startRecording', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { error: 'Main window not available' };
  try {
    await mainWindow.webContents.executeJavaScript('Orchestrator.startLesson()');
    return { ok: true };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('overlay:stopRecording', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { error: 'Main window not available' };
  try {
    await mainWindow.webContents.executeJavaScript('Orchestrator.stopLesson()');
    return { ok: true };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('overlay:openTeams', async () => {
  const url = 'https://teams.live.com/meet/9387084365462?p=cBmSFutAH5IRELtQxD';
  shell.openExternal(url);
});

// Forward AppEvents from main renderer to overlay so the timer stays in sync
// Called by main renderer via ipcRenderer.send (fire-and-forget, no handle needed)
ipcMain.on('overlay:event', (event, { name, data }) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('overlay:event', { name, data });
  }
});

function openYouTubeWindow(url) {
  if (youtubeWindow && !youtubeWindow.isDestroyed()) {
    youtubeWindow.loadURL(url); youtubeWindow.focus(); return;
  }
  youtubeWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 640, minHeight: 480,
    webPreferences: { nodeIntegration: false, contextIsolation: true, partition: 'persist:youtube' },
    title: 'YouTube - Japanese Studio'
  });
  youtubeWindow.loadURL(url);
  youtubeWindow.webContents.on('did-finish-load', () => {
    youtubeWindow.webContents.insertCSS(`
      #secondary, #related, ytd-watch-next-secondary-results-renderer { display: none !important; }
      #primary.ytd-watch-flexy { max-width: 100% !important; }
      .ytp-ce-element { display: none !important; }
      ytd-rich-shelf-renderer[is-shorts], ytd-reel-shelf-renderer { display: none !important; }
    `);
  });
  youtubeWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('google.com'))
      youtubeWindow.loadURL(url);
    return { action: 'deny' };
  });
  youtubeWindow.webContents.on('will-navigate', (event, navUrl) => {
    if (!navUrl.includes('youtube.com') && !navUrl.includes('youtu.be') &&
        !navUrl.includes('google.com') && !navUrl.includes('accounts.google')) {
      event.preventDefault(); shell.openExternal(navUrl);
    }
  });
  youtubeWindow.on('closed', () => { youtubeWindow = null; });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  initDatabase();
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true);
  });
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (db) { saveDatabase(); db.close(); }
  if (process.platform !== 'darwin') app.quit();
});
