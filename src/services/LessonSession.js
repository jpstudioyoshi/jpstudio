// ═══════════════════════════════════════════════════════
// LESSON SESSION — central data model
// All features read/write through this structure.
// No DOM access. No API calls.
// ═══════════════════════════════════════════════════════

class LessonSession {
  constructor() {
    this.id          = null;
    this.startTime   = null;   // Date — wall-clock when recording began
    this.endTime     = null;   // Date — when recording stopped

    // Raw audio blobs (set after recording stops)
    this.audio = {
      mic:    null,   // Blob — student microphone
      system: null,   // Blob — teacher loopback (BlackHole)
    };

    // Per-channel transcripts from Whisper
    // Each entry: { text: string, timestamp: number, start: number, end: number }
    this.transcripts = {
      user:    [],
      teacher: [],
    };

    // Merged and sorted by timestamp
    // Each entry: { speaker: 'user'|'teacher', text, timestamp, start, end }
    this.mergedTranscript = [];

    // WhatsApp messages attached to session
    // Each entry: { source: 'whatsapp', text, timestamp, sender, synced, timestamp_s }
    this.messages = [];

    // Claude analysis result (free-form object)
    this.analysis = {};

    // Pipeline status
    // 'idle' | 'recording' | 'stopping' | 'transcribing' | 'analysing' | 'done' | 'error'
    this.status = 'idle';

    // Error details if status === 'error'
    this.error = null;
  }

  // ── Computed properties ────────────────────────────────

  get durationSeconds() {
    if (!this.startTime || !this.endTime) return 0;
    return Math.round((this.endTime - this.startTime) / 1000);
  }

  get hasAudio() {
    return !!(this.audio.mic || this.audio.system);
  }

  get hasTranscript() {
    return this.transcripts.user.length > 0 || this.transcripts.teacher.length > 0;
  }

  get isProcessed() {
    return this.mergedTranscript.length > 0;
  }

  // ── Merge transcripts ──────────────────────────────────

  merge() {
    const userSegs    = this.transcripts.user.map(t => ({ ...t, speaker: 'user' }));
    const teacherSegs = this.transcripts.teacher.map(t => ({ ...t, speaker: 'teacher' }));
    const all = [...userSegs, ...teacherSegs];

    // Sort by start time (timestamp field is the primary key)
    all.sort((a, b) => {
      const aTime = a.start ?? a.timestamp ?? 0;
      const bTime = b.start ?? b.timestamp ?? 0;
      return aTime - bTime;
    });

    this.mergedTranscript = all;
    return this.mergedTranscript;
  }

  // ── Serialise for storage ──────────────────────────────

  toStorable() {
    // Blobs cannot be JSON-serialised; audio is stored separately as files.
    return {
      id:              this.id,
      startTime:       this.startTime ? this.startTime.toISOString() : null,
      endTime:         this.endTime   ? this.endTime.toISOString()   : null,
      transcripts:     this.transcripts,
      mergedTranscript: this.mergedTranscript,
      messages:        this.messages,
      analysis:        this.analysis,
      status:          this.status,
    };
  }

  // ── Restore from storage ───────────────────────────────

  static fromStorable(data) {
    const s = new LessonSession();
    s.id               = data.id          ?? null;
    s.startTime        = data.startTime   ? new Date(data.startTime) : null;
    s.endTime          = data.endTime     ? new Date(data.endTime)   : null;
    s.transcripts      = data.transcripts ?? { user: [], teacher: [] };
    s.mergedTranscript = data.mergedTranscript ?? [];
    s.messages         = data.messages    ?? [];
    s.analysis         = data.analysis    ?? {};
    s.status           = data.status      ?? 'done';
    return s;
  }
}
