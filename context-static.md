# Japanese Studio — Static Context

## Runtime
- Electron 32+, macOS, Apple Silicon
- Launch: `cd ~/Documents/jpStudio && npm start`
- Database: SQLite via sql.js → `~/Library/Application Support/japanese-studio/jpstudio.db`
- Audio recordings: `~/Library/Application Support/japanese-studio/lessons/`
- Dependencies: ffmpeg at `/opt/homebrew/bin/ffmpeg`, BlackHole 2ch for loopback recording
- VoiceVox: runs at `localhost:50021`, set to launch at login. Female: 四国めたん id:2, Male: 青山龍星 id:13

## Project Location
`~/Documents/jpStudio`

## Architecture Rules
- **kv_store:** ALWAYS `window.kvAPI.set/get/list/delete` — NEVER `window.db.run()` directly
- **kvAPI.get return value:** returns raw string | null — NOT `{key,value}`. Use `const v = await window.kvAPI.get(key); if (v) JSON.parse(v)`
- **Cross-file calls:** `(App.x || window.x)?.()` — never bare globals
- **App registry:** Every file registers via `Object.assign(App, {...})`. 367+ exports.
- **window[] exports:** Remaining legitimate ones are HTML onclick handlers only — do not remove those
- **CSS diagnostic:** before writing any CSS fix run `getComputedStyle(el).propertyName` in console
- **@media print block:** index.html has a print block — confirmed print-only, no screen rules present. Do not put screen styles there.
- **Inline styles for JS-controlled elements:** if JavaScript controls visibility/layout, use inline styles — immune to stylesheet scope issues
- **Lesson notes storage:** Single path — kvAPI via `lessonNotesGetSessions` / `lessonNotesSaveSessions`. `lnGetSessions` in features-tools.js delegates through App registry. One-time localStorage migration built in. ✅ Resolved.

## HTML Element Map
`html-map.md` in project Knowledge — panel-by-panel ID inventory. Check before touching any panel element.

## Load Order
```
jszip.min.js, hanzi-writer, chart.js 4.4.0 (CDN)
src/core-foundation.js → core-anki → core-kana-drill → core-kana → core-counters
→ core-srs → core-stt → core-writing → core-listen → core-vocab → core.js
→ features-core → features-kana → features-times → briefing-prompt → GrammarModel
→ AppEvents → features-yoshi → features-grammar → features-reading → features-video
→ features-pictures → features-progress → features-stroke → features-tools
→ features-voice → features-voice-drill → features-corpus-seed → features-custom-drill
→ StudentModel → IssueTracker → services/* → Orchestrator → YoshiUI
```

## File Structure
| File | Lines | Contents |
|------|-------|----------|
| `index.html` | ~3,050 | HTML + styles |
| `style.css` | — | All styles |
| `main.js` | ~1,227 | Electron main, SQLite v5, IPC handlers |
| `preload.js` | 77 | window.db, window.lessonAPI, window.electronAPI, window.audioAPI, window.kvAPI, window.mgmt, window.files, window.printAPI |
| `preload-overlay.js` | — | overlayAPI for lesson-overlay.html |
| `lesson-overlay.html` | 771 | Floating session window |
| `check-syntax.js` | 660 | Run `node check-syntax.js` from project root before every deploy |
| `src/core-foundation.js` | ~1,920 | escHtml, App registry, data loader, STORAGE_KEYS, Storage, claudeAPI, globalQuickTranslate, state, nav, settings, API cost tracking |
| `src/core-anki.js` | 432 | Anki integration |
| `src/core-kana-drill.js` | 616 | KANA_WORDS, KM, KanaDrillState |
| `src/core-kana.js` | ~750 | WS, initKanaDrill, kana drill session logic |
| `src/core-counters.js` | ~1,340 | Counter drill, Days drill, conjugate(), CM with history |
| `src/core-srs.js` | 558 | DrillSRS SM-2, kanjiCorpusGet/Save |
| `src/core-stt.js` | 842 | Whisper STT, translation panel |
| `src/core-writing.js` | 596 | Writing Studio panel |
| `src/core-listen.js` | 2,183 | Listen panel, waveform, dictation |
| `src/core-vocab.js` | ~1,430 | Vocab flashcard drill, isWordMastered, grammar points, kanji corpus display |
| `src/core.js` | ~600 | Progress panel, grammar notes, listen prefs, INIT block |
| `src/features-core.js` | ~700 | DrillFlow, TTS engine + VoiceVox backend, jpSpeak |
| `src/features-kana.js` | 1,060 | Romaji→kana, kana toolbar, kanaSetMode |
| `src/features-times.js` | 505 | Times & dates drill |
| `src/features-yoshi.js` | ~651 | Yoshi session CRUD, UI shell, AI helpers, cloze rendering |
| `src/features-grammar.js` | ~2,100 | Grammar Drill, Conjugation Drill, Particle Drill |
| `src/features-reading.js` | ~1,376 | Quick Read, furigana, listen mode, Epub |
| `src/features-video.js` | 3,316 | Video + Transcript, Watch Timer, Comprehension, Shadowing |
| `src/features-pictures.js` | 521 | Pictures naming game (vg* dead code, harmless) |
| `src/features-progress.js` | ~1,550 | Progress panel — Four Strands, Mastery, Grammar Coverage, Weights |
| `src/features-stroke.js` | 507 | Stroke order drill |
| `src/features-tools.js` | ~1,280 | Lesson notes utils, recording link picker, Matching Pairs |
| `src/features-lesson-notes.js` | ~2,553 | LN state, session CRUD, WhatsApp parser, recording helpers, story/reading render, sentence furigana |
| `src/features-ln-p2.js` | ~1,959 | Sentence recording, drill, extraction, session load/new/delete, docx parser, timeline, recordings browser |
| `src/features-voice.js` | ~2,866 | Agent Briefing, Voice Conversation |
| `src/features-voice-drill.js` | 610 | Sentence drill subtab (練習) |
| `src/features-corpus-seed.js` | ~380 | Transcript import pipeline |
| `src/features-custom-drill.js` | ~590 | Custom drill document system |
| `src/briefing-prompt.js` | 26 | Daily briefing system prompt |
| `src/AppEvents.js` | 59 | Central event bus |
| `src/Orchestrator.js` | 331 | Lesson recording pipeline |
| `src/IssueTracker.js` | 471 | Bug/feature tracker |
| `src/GrammarModel.js` | 387 | Grammar node mastery, weight overrides |
| `src/StudentModel.js` | 533 | Learner profile |
| `src/services/LessonSession.js` | 113 | LessonSession class |
| `src/services/AudioService.js` | 212 | Dual-channel recording |
| `src/services/PreflightService.js` | 275 | Pre-session audio health check |
| `src/services/TranscriptionService.js` | 141 | Whisper API wrapper |
| `src/services/AnalysisService.js` | 159 | Claude lesson analysis |
| `src/services/StorageService.js` | 146 | lessonAPI + localStorage wrapper |
| `src/ui/YoshiUI.js` | 217 | AppEvents listener for recording panel |

## Dead Files — DO NOT EDIT
- `src/features.js` — 19,035 lines, NOT in load order. Delete if still present.
- `src/features-pictures.js` — vg* dead code, harmless, leave in place.

## SQLite Schema (v9)
Tables: kv_store, frames, transcript_sentences, corpus_entries, corpus_lookups, corpus_productions, srs_items, error_history, lesson_sessions, words, lesson_phrases, pitch_data
pitch_data: 124,137 entries

### lesson_sessions
```sql
id, created_at, date, source, audio_path, audio_duration_s,
transcript_json, processed_at, diarization, notes_text
```
- `audio_path` — absolute path to main WebM. Teacher = audio_path.replace('.webm', '_teacher.webm')
- `date` — always YYYY-MM-DD (UTC)
- `processed_at` — NULL = not yet transcribed

### kv_store — access via window.kvAPI only
Used for: SRS state, settings, custom drill documents, VoiceVox prefs, grammar weight overrides, unclassified question log.

### transcript_sentences (v5)
```sql
id, source, cluster, jp, kana, en, level, frame_id,
sentence_weight, structural_rating DEFAULT 0,
srs_interval, srs_ease, srs_due, last_score, created_at
```

## API Architecture
- **Central wrapper:** `claudeAPI(opts)` in `core-foundation.js` — all calls route through this
- **Local wrappers:** `_fy_claudeAPI`, `_fv_claudeAPI`, `_fvid_claudeAPI` — thin pass-throughs to `App.claudeAPI`, legitimate, do not remove
- **Streaming exception:** `_agentStream()` in `features-voice.js` uses raw fetch (required for streaming) — logged manually
- **Raw fetch exception:** `lnCreateFromPaste()` in `features-tools.js` uses raw fetch — logged manually
- **All calls tracked:** `opts.track` present on all call sites across all three feature files
- **Whisper:** via `TranscriptionService.transcribe()` and `transcribeFile()` — all calls logged

## Management Window
Files at project root:
- `management.html` — structure and CSS only
- `management-state.js` — shared state
- `management-ui.js` — issue list, file picker, chat, audit, debug
- `management-api.js` — Claude API, streaming, context building
- `management-apply.js` — diff parsing, backup, undo, preview, write

## Syntax Check
Run before every deploy:
```bash
cd ~/Documents/jpStudio && node check-syntax.js
```
Generates `audit-YYYY-MM-DD.md` at project root.
