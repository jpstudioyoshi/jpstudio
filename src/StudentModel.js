// ═══════════════════════════════════════════════════════════════════════════════
// StudentModel.js
// Read-only service that synthesises student state from all panels.
// Consumed by the agent layer (dashboard, Claude briefings, future tools).
//
// Design principles:
//   - Flat, additive shape — new domains are top-level keys, nothing breaks
//   - AI-first — raw data is preserved so Claude can interpret it
//   - Never writes to Storage, never touches the DOM
//   - Defensive — every read is try/caught with a safe fallback
//   - Works in both browser (no kvAPI/db) and Electron modes
//   - Internal 60s cache — cheap to call repeatedly
//
// Load order in index.html:
//   core.js → StudentModel.js → features-1.js → features-2.js
// ═══════════════════════════════════════════════════════════════════════════════

const StudentModel = (() => {

  // ── Cache ──────────────────────────────────────────────────────────────────
  const CACHE_MS = 60_000;
  let _cache     = null;
  let _cacheTime = 0;

  // ── Helpers ────────────────────────────────────────────────────────────────
  const DAY  = 86_400_000;
  const WEEK = 7 * DAY;

  function daysSince(dateStr) {
    if (!dateStr) return null;
    const ms = Date.now() - new Date(dateStr).getTime();
    return ms < 0 ? 0 : Math.floor(ms / DAY);
  }

  function safeJSON(key, fallback) {
    try { return Storage.getJSON(key, fallback); }
    catch(e) { return fallback; }
  }

  function safeGet(key, fallback = '') {
    try { return Storage.get(key, fallback); }
    catch(e) { return fallback; }
  }

  // ── Domain collectors ──────────────────────────────────────────────────────
  // Each returns a plain object. Failures return a minimal safe shape.

  function collectGrammar() {
    try {
      if (typeof GrammarModel === 'undefined' || !GrammarModel.loaded) {
        return { loaded: false, summary: null, coverage: [] };
      }
      return {
        loaded:   true,
        summary:  GrammarModel.getSummaryForClaude(),
        coverage: GrammarModel.getCoverageMap(),
        ready:    GrammarModel.getReadyToLearn().slice(0, 5),
        untouched: GrammarModel.getUntouched().length,
      };
    } catch(e) { return { loaded: false, summary: null, coverage: [] }; }
  }

  function collectCore() {
    try {
      return {
        streak:        state.streak        ?? 0,
        lastDate:      state.lastDate      ?? null,
        totalSessions: state.sessions      ?? 0,
        lastAccuracy:  state.lastAccuracy  ?? null,
      };
    } catch(e) { return { streak: 0, lastDate: null, totalSessions: 0, lastAccuracy: null }; }
  }

  function collectVocab() {
    try {
      const vocab    = state.vocab        || [];
      const progress = state.vocabProgress || {};
      const known    = Object.values(progress).filter(v => v === 'know').length;
      const difficult = Object.values(progress).filter(v => v === 'again').length;
      // Words known at first attempt in ≥3 sessions = effectively mastered
      const sessions = state.vocabKnownSessions || {};
      const mastered = Object.values(sessions).filter(arr => Array.isArray(arr) && arr.length >= 3).length;
      return {
        deckSize:      vocab.length,
        knownCount:    known,
        difficultCount: difficult,
        masteredCount: mastered,
        // Raw progress map for Claude
        rawProgress:   progress,
      };
    } catch(e) { return { deckSize: 0, knownCount: 0, difficultCount: 0, masteredCount: 0, rawProgress: {} }; }
  }

  function collectConjugation() {
    try {
      const errors  = (typeof GrammarErrors !== 'undefined') ? GrammarErrors.load() : [];
      const now     = Date.now();
      const recent  = errors.filter(e => (now - new Date(e.date || 0).getTime()) < WEEK * 4);
      const weakSpots = recent
        .sort((a, b) => (b.misses * 3 + b.slips) - (a.misses * 3 + a.slips))
        .slice(0, 5)
        .map(({ form, pol, reg, verbType, misses, slips, count, date }) =>
          ({ form, pol, reg, verbType, misses, slips, count, date }));

      const session   = (typeof ConjSession !== 'undefined') ? ConjSession.load() : null;
      const doneToday = (typeof ConjSession !== 'undefined') ? ConjSession.isTodayComplete() : false;

      // Raw SRS data — interval/ease/history per pattern
      const rawSRS = safeJSON(STORAGE_KEYS.DRILL_SRS_CONJ, {});

      return {
        doneToday,
        weakSpots,
        sessionProgress: session ? {
          run:      session.run  ?? 0,
          ok:       session.ok   ?? 0,
          miss:     session.miss ?? 0,
          completed: session.completed ?? false,
        } : null,
        rawSRS,
        rawErrors: errors,   // full error log for Claude
      };
    } catch(e) { return { doneToday: false, weakSpots: [], sessionProgress: null, rawSRS: {}, rawErrors: [] }; }
  }

  function collectCounters() {
    try {
      const available = (typeof CM !== 'undefined' && typeof COUNTER_DATA !== 'undefined' && COUNTER_DATA);
      if (!available) return { doneToday: false, unmastered: null, due: null, rawStatus: null };

      const allStatus  = CM.getAllStatus();
      const unmastered = Object.entries(allStatus).filter(([, s]) => !s.mastered);
      const due        = Object.entries(allStatus).filter(([, s]) => s.due);

      return {
        doneToday:    CM.isTodayComplete(),
        unmasteredCount: unmastered.length,
        dueCount:     due.length,
        // Names of unmastered counters for Claude context
        unmasteredNames: unmastered.map(([k]) => ({
          key:    k,
          kanji:  COUNTER_DATA[k]?.kanji  ?? k,
          label:  COUNTER_DATA[k]?.what   ?? '',
        })),
        rawStatus:    allStatus,
        rawSRS:       safeJSON(STORAGE_KEYS.DRILL_SRS_COUNTERS, {}),
        rawMastery:   safeJSON(STORAGE_KEYS.COUNTER_MASTERY, {}),
      };
    } catch(e) { return { doneToday: false, unmasteredCount: null, dueCount: null, rawStatus: null }; }
  }

  function collectWriting() {
    try {
      const errors = (() => {
        try {
          const raw = Storage.get(STORAGE_KEYS.WRITING_ERRORS_ALT);
          return raw ? JSON.parse(raw) : [];
        } catch(e) { return []; }
      })();

      const now    = Date.now();
      const recent = errors.filter(e => (now - new Date(e.lastSeen || 0).getTime()) < WEEK);

      const texts      = safeJSON(STORAGE_KEYS.STUDIO_TEXTS, []);
      // Use drillLastCompleted for writing date — consistent with strand grid
      const drillRec   = safeJSON('drillLastCompleted', {});
      const lastWrite  = drillRec.writing || texts[0]?.date || texts[0]?.savedAt || null;
      // Count texts written in last 7 days
      const recentTexts = texts.filter(t => {
        const d = t.date || t.savedAt;
        return d && (Date.now() - new Date(d).getTime()) < WEEK;
      });

      return {
        daysSinceLastSession: daysSince(lastWrite),
        textsLast7Days: recentTexts.length,
        totalTexts:  texts.length,
        topErrors:   recent
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
          .map(({ pattern, errorType, count, lastSeen }) => ({ pattern, errorType, count, lastSeen })),
        rawErrors:   errors,   // full log for Claude
      };
    } catch(e) { return { daysSinceLastSession: null, totalTexts: 0, topErrors: [], rawErrors: [] }; }
  }

  function collectSpeaking() {
    try {
      const roundTrips   = safeJSON(STORAGE_KEYS.ROUND_TRIPS, []);
      const drillRec2    = safeJSON('drillLastCompleted', {});
      const lastSessionRT = roundTrips[0]?.date ?? null;
      const lastSessionDrill = drillRec2.speaking ? drillRec2.speaking + 'T00:00:00' : null;
      const lastSession  = [lastSessionRT, lastSessionDrill].filter(Boolean).sort().pop() || null;
      const sessionsLast7Days = roundTrips.filter(r => {
        const d = r.date;
        return d && (Date.now() - new Date(d).getTime()) < WEEK;
      }).length;
      const spokenRaw    = safeGet(STORAGE_KEYS.SPOKEN_ERRORS, '');
      const spokenErrors = spokenRaw ? JSON.parse(spokenRaw) : [];

      return {
        totalSessions:        roundTrips.length,
        daysSinceLastSession: daysSince(lastSession),
        lastSessionDate:      lastSession,
        topErrors: spokenErrors
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
          .map(({ pattern, count }) => ({ pattern, count })),
        rawRoundTrips:  roundTrips,   // full session log for Claude
        rawSpokenErrors: spokenErrors,
      };
    } catch(e) { return { totalSessions: 0, daysSinceLastSession: null, topErrors: [], rawRoundTrips: [], rawSpokenErrors: [] }; }
  }

  function collectAnki() {
    try {
      const easyCounts    = safeJSON(STORAGE_KEYS.ANKI_EASY_COUNTS, {});
      const consolidated  = Object.entries(easyCounts).filter(([, c]) => c >= 5).length;
      const session       = safeJSON(STORAGE_KEYS.ANKI_SESSION, null);
      const lastDeck      = safeGet(STORAGE_KEYS.ANKI_LAST_DECK);
      // Live due count — only available if AnkiState is populated
      const dueCount = (typeof AnkiState !== 'undefined') ? AnkiState.dueCards.length : 0;

      return {
        connected:        (typeof AnkiState !== 'undefined') ? AnkiState.connected : false,
        dueCount,
        consolidatedCount: consolidated,  // easy×5 — suggest using in writing
        lastDeck,
        todaySession: session ? {
          deck:       session.deck       ?? '',
          reviewed:   session.reviewed   ?? 0,
          date:       session.date       ?? null,
        } : null,
        rawEasyCounts: easyCounts,
      };
    } catch(e) { return { connected: false, dueCount: 0, consolidatedCount: 0, lastDeck: '', todaySession: null }; }
  }

  function collectListening() {
    try {
      const listenSRS = safeJSON(STORAGE_KEYS.LISTEN_SRS, {});
      const tracks    = Object.entries(listenSRS);
      const due       = tracks.filter(([, t]) => t.nextDue && new Date(t.nextDue).getTime() <= Date.now());
      return {
        tracksReviewed: tracks.length,
        tracksDueCount: due.length,
        rawSRS:         listenSRS,
      };
    } catch(e) { return { tracksReviewed: 0, tracksDueCount: 0, rawSRS: {} }; }
  }

  function collectLessonNotes() {
    try {
      // Try importedDocSessions first (current key), fall back to legacy key
      let sessions = safeJSON('importedDocSessions', []);
      if (!sessions.length) sessions = safeJSON(STORAGE_KEYS.LESSON_NOTES_DATA, []);
      return {
        count: sessions.length,
        recent: sessions.slice(0, 6).map(s => ({
          title:        s.title       ?? '',
          date:         s.date        ?? s.savedAt ?? null,
          vocabCount:   (s.vocab      || []).length,
          grammarCount: (s.grammar    || []).length,
          topVocab:     (s.vocab      || []).slice(0, 5).map(v => v.word || v.jp || '').filter(Boolean),
          topGrammar:   (s.grammar    || []).slice(0, 3).map(g => g.pattern || '').filter(Boolean),
        })),
      };
    } catch(e) { return { count: 0, recent: [] }; }
  }

  function collectGoals() {
    try {
      const g = goalsLoad();
      return {
        kanaDrillSize:       g.kanaDrillSize       ?? 20,
        conjQuestionsPerRun: g.conjQuestionsPerRun ?? 10,
        conjSessionRuns:     g.conjSessionRuns     ?? 3,
        sstGapDays:          g.sstGapDays          ?? 3,
        sstMinUtterances:    g.sstMinUtterances    ?? 3,
      };
    } catch(e) { return {}; }
  }

  function collectApiUsage() {
    try {
      return {
        totalCalls:    AppState.apiUsage.calls         ?? 0,
        inputTokens:   AppState.apiUsage.inputTokens   ?? 0,
        outputTokens:  AppState.apiUsage.outputTokens  ?? 0,
        byFeature:     AppState.apiUsage.byFeature      ?? {},
      };
    } catch(e) { return { totalCalls: 0, inputTokens: 0, outputTokens: 0, byFeature: {} }; }
  }

  // ── Async collectors (need DB / lessonAPI) ─────────────────────────────────

  async function collectLessonSessions() {
    // lesson_sessions = audio recordings with transcripts (not dropped documents)
    try {
      if (!window.lessonAPI) return { count: 0, recent: [] };
      const list = await window.lessonAPI.list();
      if (!list || !list.length) return { count: 0, recent: [] };

      const recent = list.slice(0, 10).map(s => ({
        id:              s.id,
        date:            s.date             ?? s.created_at ?? null,
        durationSeconds: s.audio_duration_s ?? null,
        hasTranscript:   !!s.processed_at,
        source:          s.source           ?? '',
      }));

      return {
        count:  list.length,
        recent,
        // Raw list available for Claude to inspect dates/gaps
        rawList: list.map(s => ({
          id: s.id, date: s.date ?? s.created_at, durationSeconds: s.audio_duration_s,
          hasTranscript: !!s.processed_at, source: s.source,
        })),
      };
    } catch(e) { return { count: 0, recent: [], rawList: [] }; }
  }

  async function collectRecentTranscriptSample() {
    // Pull a sample of recent transcript turns for Claude context.
    // We don't try to interpret them — Claude does that.
    try {
      if (!window.db) return { turns: [] };
      const rows = await window.db.query(
        `SELECT tt.session_id, tt.speaker, tt.content, tt.timestamp_offset, tt.word_count,
                ls.date
         FROM transcript_turns tt
         JOIN lesson_sessions ls ON ls.id = tt.session_id
         ORDER BY ls.created_at DESC, tt.id ASC
         LIMIT 100`,
        []
      );
      return {
        turns: (rows || []).map(r => ({
          sessionId:  r.session_id,
          date:       r.date,
          speaker:    r.speaker,
          content:    r.content,
          offset:     r.timestamp_offset,
          wordCount:  r.word_count,
        })),
      };
    } catch(e) { return { turns: [] }; }
  }

  async function collectStrandBalance(since) {
    try {
      if (!window.db) return { strands: {}, totalMins: 0, hasData: false };
      if (!since) since = new Date(Date.now() - 7 * 86400000).toISOString();
      const rows = await window.db.query(
        'SELECT panel, duration_s FROM panel_sessions WHERE started_at >= ?',
        [since]
      );
      // Load saved weights or fall back to defaults
      const PANEL_TO_WEIGHT = {
        grammar2: 'conjugation', fluency432: 'fluency432', voice: 'voice', lessonnotes: 'yoshi',
        writing: 'writing', read: 'read', listen: 'listen', video: 'video',
        words: 'words', kana: 'kana', sentences: 'sentences'
      };
      const FALLBACK_STRAND = { listen:1, read:1, video:1, voice:2, lessonnotes:2, writing:2, grammar2:3, words:3, kana:3, sentences:2, fluency432:4 };
      let weights = null;
      try {
        const w = (typeof Storage !== 'undefined' ? Storage : window.Storage)?.getJSON('STRAND_WEIGHTS', null);
        if (w && typeof w === 'object') weights = w;
      } catch(e) {}
      const strands = { 1: 0, 2: 0, 3: 0, 4: 0 };
      const sessions = { 1: 0, 2: 0, 3: 0, 4: 0 };
      const yoshiMins = { 1: 0, 2: 0, 3: 0, 4: 0 };
      for (const r of (rows || [])) {
        const dur = r.duration_s || 0;
        const wKey = PANEL_TO_WEIGHT[r.panel];
        const w = weights && wKey ? weights[wKey] : null;
        const isYoshi = r.panel === 'yoshi' || r.panel === 'lessonnotes';
        if (w) {
          if (w.s1 > 0) { strands[1] += dur * (w.s1 / 100); sessions[1]++; if (isYoshi) yoshiMins[1] += dur * (w.s1 / 100); }
          if (w.s2 > 0) { strands[2] += dur * (w.s2 / 100); sessions[2]++; if (isYoshi) yoshiMins[2] += dur * (w.s2 / 100); }
          if (w.s3 > 0) { strands[3] += dur * (w.s3 / 100); sessions[3]++; if (isYoshi) yoshiMins[3] += dur * (w.s3 / 100); }
          if (w.s4 > 0) { strands[4] += dur * (w.s4 / 100); sessions[4]++; if (isYoshi) yoshiMins[4] += dur * (w.s4 / 100); }
        } else {
          const s = FALLBACK_STRAND[r.panel];
          if (s) { strands[s] += dur; sessions[s]++; if (isYoshi) yoshiMins[s] += dur; }
        }
      }
      // Convert to minutes
      for (const k of [1,2,3,4]) { strands[k] = Math.round(strands[k] / 60); yoshiMins[k] = Math.round(yoshiMins[k] / 60); }
      const totalMins = Object.values(strands).reduce((a, b) => a + b, 0);
      return { strands, sessions, yoshiMins, totalMins, hasData: totalMins > 0 };
    } catch(e) { return { strands: { 1: 0, 2: 0, 3: 0, 4: 0 }, totalMins: 0, hasData: false }; }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * snapshot() — synchronous, uses cache.
   * Safe to call from dashboard signal code or anywhere performance matters.
   * Does NOT include lesson session DB data (use snapshotAsync for that).
   */
  function snapshot() {
    const now = Date.now();
    if (_cache && (now - _cacheTime) < CACHE_MS) return _cache;

    _cache = {
      grammar:     collectGrammar(),
      // ── Core ──────────────────────────────────────────
      core:        collectCore(),
      vocab:       collectVocab(),
      conjugation: collectConjugation(),
      counters:    collectCounters(),
      writing:     collectWriting(),
      speaking:    collectSpeaking(),
      anki:        collectAnki(),
      listening:   collectListening(),
      lessonNotes: collectLessonNotes(),
      goals:       collectGoals(),
      apiUsage:    collectApiUsage(),
      // ── Meta ──────────────────────────────────────────
      generatedAt: now,
      isPartial:   true,   // lesson session DB data not yet loaded
    };

    _cacheTime = now;
    return _cache;
  }

  /**
   * snapshotAsync() — full snapshot including SQLite lesson data.
   * Use for Claude briefings where completeness matters more than speed.
   */
  async function snapshotAsync(since) {
    const base = snapshot();
    try {
      const [lessonSessions, transcriptSample, strandBalance] = await Promise.all([
        collectLessonSessions(),
        collectRecentTranscriptSample(),
        collectStrandBalance(since),
      ]);
      const full = {
        ...base,
        lessonSessions,
        transcriptSample,
        strandBalance,
        generatedAt: Date.now(),
        isPartial:   false,
      };
      // Update cache with full version
      _cache     = full;
      _cacheTime = Date.now();
      return full;
    } catch(e) {
      console.warn('[StudentModel] snapshotAsync partial failure:', e.message);
      return { ...base, isPartial: true };
    }
  }

  /**
   * invalidate() — force cache refresh on next call.
   * Call after any significant state change (e.g. drill completion, lesson save).
   */
  function invalidate() {
    _cache     = null;
    _cacheTime = 0;
  }

  /**
   * claudeSummary() — formats the full snapshot as a compact string
   * suitable for including in a Claude prompt.
   * Strips raw/verbose fields to keep token count manageable.
   */
  async function claudeSummary() {
    const s = await snapshotAsync();
    const g = s.goals || {};

    const lines = [
      `## Student Snapshot — ${new Date(s.generatedAt).toISOString().slice(0,10)}`,
      '',
      `**Streak:** ${s.core.streak} days | Sessions: ${s.core.totalSessions}`,
      '',
      '### Conjugation',
      `Done today: ${s.conjugation.doneToday ? 'yes' : 'no'}`,
      s.conjugation.weakSpots.length
        ? `Weak spots (last 4 weeks): ${s.conjugation.weakSpots.map(w =>
            `${w.form}/${w.pol}/${w.reg} ${w.verbType} — ${w.misses} miss, ${w.slips} slip`).join('; ')}`
        : 'No recent conjugation errors',
      '',
      '### Counters',
      `Done today: ${s.counters.doneToday ? 'yes' : 'no'} | Unmastered: ${s.counters.unmasteredCount ?? 'n/a'} | Due: ${s.counters.dueCount ?? 'n/a'}`,
      '',
      '### Writing',
      `Last session: ${s.writing.daysSinceLastSession != null ? s.writing.daysSinceLastSession + ' days ago' : 'unknown'} | Texts last 7 days: ${s.writing.textsLast7Days ?? 0} | Total: ${s.writing.totalTexts}`,
      s.writing.topErrors.length
        ? `Top errors (last 7d): ${s.writing.topErrors.map(e => `${e.pattern} (${e.errorType}) ×${e.count}`).join('; ')}`
        : 'No recent writing errors',
      '',
      '### Speaking',
      `Last session: ${s.speaking.daysSinceLastSession != null ? s.speaking.daysSinceLastSession + ' days ago' : 'never'} | Sessions last 7 days: ${s.speaking.sessionsLast7Days ?? 0} | Total: ${s.speaking.totalSessions}`,
      s.speaking.topErrors.length
        ? `Top spoken errors: ${s.speaking.topErrors.map(e => `${e.pattern} ×${e.count}`).join('; ')}`
        : 'No spoken errors recorded',
      '',
      '### Vocab',
      `Deck: ${s.vocab.deckSize} words | Known: ${s.vocab.knownCount} | Difficult: ${s.vocab.difficultCount} | Mastered: ${s.vocab.masteredCount}`,
      '',
      '### Anki',
      `Connected: ${s.anki.connected} | Due: ${s.anki.dueCount} | Consolidated (easy×5): ${s.anki.consolidatedCount}`,
      '',
      '### Lesson recordings',
      `Total: ${s.lessonSessions?.count ?? 0}`,
      (s.lessonSessions?.recent || []).length
        ? `Recent: ${s.lessonSessions.recent.map(r =>
            `${r.date ?? 'unknown date'} ${r.durationSeconds ? Math.round(r.durationSeconds/60)+'min' : ''} [${r.hasTranscript ? 'transcribed' : 'no transcript'}]`
          ).join(', ')}`
        : '',
      '',
      '### Grammar coverage (Genki I)',
      s.grammar?.loaded ? s.grammar.summary : 'Grammar model not loaded',
      '',
      '### Lesson notes (dropped WhatsApp/docs)',
      `Sessions: ${s.lessonNotes.count}`,
      ...(s.lessonNotes.recent || []).map(r =>
        `${r.title?.slice(0,30) ?? 'untitled'} — ${r.vocabCount} vocab, ${r.grammarCount} grammar points${r.topVocab?.length ? '; vocab: ' + r.topVocab.join(', ') : ''}${r.topGrammar?.length ? '; grammar: ' + r.topGrammar.join(', ') : ''}`
      ),
      '',
    ];

    // Four Strands recency summary
    (() => {
      try {
        const dr = safeJSON('drillLastCompleted', {});
        const ds = k => { const v = dr[k]; if (!v) return 'never'; const d = Math.round((Date.now() - new Date(v).getTime()) / 86400000); return d === 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'; };
        lines.push('### Four Strands — last activity');
        lines.push(`Input: reading ${ds('reading')}, listening ${ds('listening')}, video ${ds('video')}`);
        lines.push(`Output: writing ${ds('writing')}, speaking ${ds('speaking')}`);
        lines.push(`Study: vocabulary ${ds('words')}, grammar ${ds('gramSent')}, conjugation ${ds('conj')}, kana ${ds('kana')}`);
        lines.push(`Fluency: speaking ${ds('speaking')}, conjugation ${ds('conj')}`);
        lines.push('');
      } catch(e) {}
    })();
    // Append transcript sample if available
    if (s.transcriptSample?.turns?.length) {
      lines.push('### Recent transcript sample (last 100 turns)');
      lines.push('Format: [date] speaker: content');
      s.transcriptSample.turns.forEach(t => {
        lines.push(`[${t.date ?? '?'}] ${t.speaker ?? '?'}: ${t.content ?? ''}`);
      });
      lines.push('');
    }

    lines.push('### Language instruction\nRespond in English only. Do not use German or any other language.');
    return lines.filter(l => l !== null).join('\n');
  }

  // ── AppEvents subscriptions ───────────────────────────────────────────────
  function init() {
    const AE = (typeof AppEvents !== 'undefined') ? AppEvents : null;
    if (!AE) { console.warn('[StudentModel] AppEvents not available — skipping subscriptions'); return; }

    // NOTE: VOCAB_PRODUCED and FLUENCY_432 have no emitter yet (pending items) — these
    // event strings are currently written direct to learning_events (core-srs.js / features-voice.js),
    // so these listeners never fire until the emitters are built.
    const events = [
      AE.DRILL_ANSWER, AE.VOCAB_LOOKUP, AE.VOCAB_PRODUCED,
      AE.ERROR_RECORDED, AE.WRITING_SUBMITTED, AE.FLUENCY_432, AE.SESSION_TIME,
    ];

    events.forEach(evt => {
      AE.on(evt, (payload) => {
        console.log('[StudentModel] received:', evt, payload);
        invalidate();
      });
    });

    // Recording session — write voice panel time based on actual mic usage
    let _recStartTime = null;
    AE.on(AE.RECORDING_STARTED, (payload) => {
      _recStartTime = payload?.startTime ? new Date(payload.startTime).getTime() : Date.now();
    });
    AE.on(AE.SESSION_SAVED, (payload) => {
      const session = payload?.session;
      if (!session) return;
      const dur = session.durationSeconds || 0;
      if (dur < 30) return;
      const startedAt = session.startTime ? new Date(session.startTime).toISOString() : new Date(Date.now() - dur * 1000).toISOString();
      const endedAt = session.endTime ? new Date(session.endTime).toISOString() : new Date().toISOString();
      if (typeof window !== 'undefined' && window.db) {
        window.db.run(
          'INSERT INTO panel_sessions (panel, strand, started_at, ended_at, duration_s) VALUES (?,?,?,?,?)',
          ['yoshi', 2, startedAt, endedAt, dur]
        ).catch(() => {});
        window.db.run(
          'INSERT INTO learning_events (created_at, panel, event_type, payload) VALUES (?,?,?,?)',
          [endedAt, 'yoshi', 'session:time', JSON.stringify({ strand: 2, duration_s: dur, source: 'yoshi' })]
        ).catch(() => {});
      }
      invalidate();
    });

    AE.on(AE.RECORDING_STOPPED, (payload) => {
      if (!_recStartTime) return;
      const dur = payload?.durationSecs || Math.round((Date.now() - _recStartTime) / 1000);
      const startedAt = new Date(_recStartTime).toISOString();
      const endedAt = new Date().toISOString();
      if (dur < 5) { _recStartTime = null; return; }
      if (typeof window !== 'undefined' && window.db) {
        window.db.run(
          'INSERT INTO panel_sessions (panel, strand, started_at, ended_at, duration_s) VALUES (?,?,?,?,?)',
          ['voice', 2, startedAt, endedAt, dur]
        ).catch(() => {});
        window.db.run(
          'INSERT INTO learning_events (created_at, panel, event_type, payload) VALUES (?,?,?,?)',
          [endedAt, 'voice', 'session:time', JSON.stringify({ strand: 2, duration_s: dur, source: 'recording' })]
        ).catch(() => {});
      }
      _recStartTime = null;
      invalidate();
    });

    // Analysis complete — persist vocab and grammar evidence
    AE.on(AE.ANALYSIS_COMPLETE, async (payload) => {
      const { session, analysis } = payload || {};
      if (!analysis || !session?.id) return;
      const ts = new Date().toISOString();
      // Persist keyVocab → transcript_vocab
      if (Array.isArray(analysis.keyVocab) && window.db) {
        for (const v of analysis.keyVocab) {
          if (!v.jp) continue;
          window.db.run(
            'INSERT OR IGNORE INTO transcript_vocab (session_id, word, reading, meaning, created_at) VALUES (?,?,?,?,?)',
            [session.id, v.jp, v.reading || '', v.en || '', ts]
          ).catch(() => {});
        }
      }
      // Persist grammarPoints → grammar_mastery as 'encountered' evidence
      const GM = (typeof GrammarModel !== 'undefined') ? GrammarModel : null;
      if (GM && window.db) {
        // Prefer explicit node IDs returned by Claude; fall back to fuzzy match
        const nodeIds = Array.isArray(analysis.grammarNodeIds) && analysis.grammarNodeIds.length
          ? analysis.grammarNodeIds
          : [];
        const useFuzzy = nodeIds.length === 0 && Array.isArray(analysis.grammarPoints);
        const idsToRecord = nodeIds.length ? nodeIds : [];
        if (useFuzzy) {
          await GM.reload();
          const coverageMap = GM.getCoverageMap();
          for (const point of analysis.grammarPoints) {
            const needle = point.toLowerCase().replace(/[〜～]/g, '').trim();
            const match = coverageMap.find(n =>
              n.label.toLowerCase().includes(needle) ||
              needle.includes(n.label.toLowerCase()) ||
              n.id.replace(/_/g,' ').includes(needle)
            );
            if (match) idsToRecord.push(match.id);
          }
        }
        for (const nodeId of idsToRecord) {
          try {
            await GM.recordEvidence(nodeId, 'encountered', 0.5,
              JSON.stringify({ count: 1, last_session: ts }));
          } catch(e) {}
        }
      }
      invalidate();
    });

    console.log('[StudentModel] subscribed to', events.length, 'AppEvents');
  }

  return { snapshot, snapshotAsync, invalidate, claudeSummary, init };

})();

// Expose to window for Electron and agent layer
try { window.StudentModel = StudentModel; } catch(e) {}

console.log('[StudentModel] loaded');

// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, { StudentModel });
  // window.StudentModel already set above — no duplicate needed
} catch(e) { console.error('[StudentModel] App registry failed:', e); }
