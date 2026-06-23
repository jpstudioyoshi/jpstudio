// ═══════════════════════════════════════════════════════
// FEATURES-CORE
// DrillFlow · Counters · TTS · Audio utilities
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// DRILL FLOW MODULE
// Shared correct/wrong advance logic for all drills.
// DrillFlow.correct(nextFn)  — auto-advance after 700ms
// DrillFlow.wrong(advanceFn) — lock until Enter/advanceFn
// DrillFlow.bindEnter(el)    — binds Enter key to advance
// ═══════════════════════════════════════════════════════

const DrillFlow = {
  _advancing: false,
  _waitingEnter: false,
  _answered: false,    // true once an answer has been submitted this card
  _advanceFn: null,

  // Call on correct answer. nextFn fires after delay ms.
  correct(nextFn, delay = 700) {
    this._advancing = true;
    this._waitingEnter = false;
    this._answered = true;
    setTimeout(() => {
      this._advancing = false;
      if (nextFn) nextFn();
    }, delay);
  },

  // Call on wrong answer. User must press Enter or Next button to advance.
  // Enter without having submitted an answer is ignored.
  wrong(advanceFn) {
    this._advancing = false;
    this._waitingEnter = true;
    this._answered = true;
    this._advanceFn = advanceFn;
  },

  // Advance manually (Enter key or Next button).
  // Returns true if advanced, false if ignored.
  advance() {
    if (this._advancing) return false;     // auto-advance in progress
    if (this._waitingEnter) {
      this._waitingEnter = false;
      this._answered = false;
      if (this._advanceFn) this._advanceFn();
      return true;
    }
    return false;
  },

  // Bind Enter key on an input element.
  // submitFn is called when Enter is pressed with no pending advance.
  bindEnter(el, submitFn) {
    if (!el || el._drillFlowBound) return;
    el._drillFlowBound = true;
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (this._advancing) return;
      if (this._waitingEnter) { this.advance(); return; }
      if (submitFn) submitFn();
    });
  },

  reset() {
    this._advancing = false;
    this._waitingEnter = false;
    this._answered = false;
    this._advanceFn = null;
  },
};

// ═══════════════════════════════════════════════════════
// COUNTERS
// ═══════════════════════════════════════════════════════

const COUNTERS = [
  // People
  { kanji:'人', reading:'にん／り', what:'people', cat:'people', example:'三人 (さんにん) · three people',
    nums:[
      {n:1,r:'ひとり',irreg:true},{n:2,r:'ふたり',irreg:true},{n:3,r:'さんにん'},{n:4,r:'よにん'},{n:5,r:'ごにん'},
      {n:6,r:'ろくにん'},{n:7,r:'しちにん'},{n:8,r:'はちにん'},{n:9,r:'きゅうにん'},{n:10,r:'じゅうにん'},
    ]
  },
  { kanji:'名', reading:'めい', what:'people (formal)', cat:'people', example:'二名様 (ふためいさま) · two guests',
    nums:[
      {n:1,r:'いちめい'},{n:2,r:'にめい'},{n:3,r:'さんめい'},{n:4,r:'よんめい'},{n:5,r:'ごめい'},
      {n:6,r:'ろくめい'},{n:7,r:'しちめい'},{n:8,r:'はちめい'},{n:9,r:'きゅうめい'},{n:10,r:'じゅうめい'},
    ]
  },
  // Objects
  { kanji:'枚', reading:'まい', what:'thin flat things', cat:'objects', example:'切手一枚 (いちまい) · one stamp',
    nums:[
      {n:1,r:'いちまい'},{n:2,r:'にまい'},{n:3,r:'さんまい'},{n:4,r:'よんまい'},{n:5,r:'ごまい'},
      {n:6,r:'ろくまい'},{n:7,r:'ななまい'},{n:8,r:'はちまい'},{n:9,r:'きゅうまい'},{n:10,r:'じゅうまい'},
    ]
  },
  { kanji:'本', reading:'ほん', what:'long thin things', cat:'objects', example:'ペン三本 (さんぼん) · three pens',
    nums:[
      {n:1,r:'いっぽん',irreg:true},{n:2,r:'にほん'},{n:3,r:'さんぼん',irreg:true},{n:4,r:'よんほん'},{n:5,r:'ごほん'},
      {n:6,r:'ろっぽん',irreg:true},{n:7,r:'ななほん'},{n:8,r:'はっぽん',irreg:true},{n:9,r:'きゅうほん'},{n:10,r:'じゅっぽん',irreg:true},
    ]
  },
  { kanji:'個', reading:'こ', what:'small objects (generic)', cat:'objects', example:'りんご二個 (にこ) · two apples',
    nums:[
      {n:1,r:'いっこ',irreg:true},{n:2,r:'にこ'},{n:3,r:'さんこ'},{n:4,r:'よんこ'},{n:5,r:'ごこ'},
      {n:6,r:'ろっこ',irreg:true},{n:7,r:'ななこ'},{n:8,r:'はっこ',irreg:true},{n:9,r:'きゅうこ'},{n:10,r:'じゅっこ',irreg:true},
    ]
  },
  { kanji:'冊', reading:'さつ', what:'bound items (books)', cat:'objects', example:'本一冊 (いっさつ) · one book',
    nums:[
      {n:1,r:'いっさつ',irreg:true},{n:2,r:'にさつ'},{n:3,r:'さんさつ'},{n:4,r:'よんさつ'},{n:5,r:'ごさつ'},
      {n:6,r:'ろくさつ'},{n:7,r:'ななさつ'},{n:8,r:'はっさつ',irreg:true},{n:9,r:'きゅうさつ'},{n:10,r:'じゅっさつ',irreg:true},
    ]
  },
  { kanji:'台', reading:'だい', what:'machines, vehicles', cat:'objects', example:'車一台 (いちだい) · one car',
    nums:[
      {n:1,r:'いちだい'},{n:2,r:'にだい'},{n:3,r:'さんだい'},{n:4,r:'よんだい'},{n:5,r:'ごだい'},
      {n:6,r:'ろくだい'},{n:7,r:'ななだい'},{n:8,r:'はちだい'},{n:9,r:'きゅうだい'},{n:10,r:'じゅうだい'},
    ]
  },
  { kanji:'杯', reading:'はい', what:'cups, glasses, bowls', cat:'objects', example:'コーヒー一杯 (いっぱい) · one cup of coffee',
    nums:[
      {n:1,r:'いっぱい',irreg:true},{n:2,r:'にはい'},{n:3,r:'さんばい',irreg:true},{n:4,r:'よんはい'},{n:5,r:'ごはい'},
      {n:6,r:'ろっぱい',irreg:true},{n:7,r:'ななはい'},{n:8,r:'はっぱい',irreg:true},{n:9,r:'きゅうはい'},{n:10,r:'じゅっぱい',irreg:true},
    ]
  },
  { kanji:'枚', reading:'まい', what:'slices, sheets', cat:'objects', skip:true,
    nums:[] // already listed above
  },
  { kanji:'着', reading:'ちゃく', what:'clothing items', cat:'objects', example:'シャツ二着 (にちゃく) · two shirts',
    nums:[
      {n:1,r:'いっちゃく',irreg:true},{n:2,r:'にちゃく'},{n:3,r:'さんちゃく'},{n:4,r:'よんちゃく'},{n:5,r:'ごちゃく'},
      {n:6,r:'ろくちゃく'},{n:7,r:'ななちゃく'},{n:8,r:'はっちゃく',irreg:true},{n:9,r:'きゅうちゃく'},{n:10,r:'じゅっちゃく',irreg:true},
    ]
  },
  // Animals
  { kanji:'匹', reading:'ひき', what:'small animals', cat:'animals', example:'猫二匹 (にひき) · two cats',
    nums:[
      {n:1,r:'いっぴき',irreg:true},{n:2,r:'にひき'},{n:3,r:'さんびき',irreg:true},{n:4,r:'よんひき'},{n:5,r:'ごひき'},
      {n:6,r:'ろっぴき',irreg:true},{n:7,r:'ななひき'},{n:8,r:'はっぴき',irreg:true},{n:9,r:'きゅうひき'},{n:10,r:'じゅっぴき',irreg:true},
    ]
  },
  { kanji:'頭', reading:'とう', what:'large animals', cat:'animals', example:'牛一頭 (いっとう) · one cow',
    nums:[
      {n:1,r:'いっとう',irreg:true},{n:2,r:'にとう'},{n:3,r:'さんとう'},{n:4,r:'よんとう'},{n:5,r:'ごとう'},
      {n:6,r:'ろくとう'},{n:7,r:'ななとう'},{n:8,r:'はっとう',irreg:true},{n:9,r:'きゅうとう'},{n:10,r:'じゅっとう',irreg:true},
    ]
  },
  { kanji:'羽', reading:'わ', what:'birds, rabbits', cat:'animals', example:'鳥三羽 (さんわ) · three birds',
    nums:[
      {n:1,r:'いちわ'},{n:2,r:'にわ'},{n:3,r:'さんわ'},{n:4,r:'よんわ'},{n:5,r:'ごわ'},
      {n:6,r:'ろくわ'},{n:7,r:'ななわ'},{n:8,r:'はちわ'},{n:9,r:'きゅうわ'},{n:10,r:'じゅうわ'},
    ]
  },
  // Time
  { kanji:'日', reading:'か／にち', what:'days of month', cat:'time', example:'三日 (みっか) · 3rd / three days',
    nums:[
      {n:1,r:'ついたち',irreg:true},{n:2,r:'ふつか',irreg:true},{n:3,r:'みっか',irreg:true},{n:4,r:'よっか',irreg:true},{n:5,r:'いつか',irreg:true},
      {n:6,r:'むいか',irreg:true},{n:7,r:'なのか',irreg:true},{n:8,r:'ようか',irreg:true},{n:9,r:'ここのか',irreg:true},{n:10,r:'とおか',irreg:true},
    ]
  },
  { kanji:'週間', reading:'しゅうかん', what:'weeks', cat:'time', example:'二週間 (にしゅうかん) · two weeks',
    nums:[
      {n:1,r:'いっしゅうかん',irreg:true},{n:2,r:'にしゅうかん'},{n:3,r:'さんしゅうかん'},{n:4,r:'よんしゅうかん'},{n:5,r:'ごしゅうかん'},
      {n:6,r:'ろくしゅうかん'},{n:7,r:'ななしゅうかん'},{n:8,r:'はっしゅうかん',irreg:true},{n:9,r:'きゅうしゅうかん'},{n:10,r:'じゅっしゅうかん',irreg:true},
    ]
  },
  { kanji:'ヶ月', reading:'かげつ', what:'months (duration)', cat:'time', example:'三ヶ月 (さんかげつ) · three months',
    nums:[
      {n:1,r:'いっかげつ',irreg:true},{n:2,r:'にかげつ'},{n:3,r:'さんかげつ'},{n:4,r:'よんかげつ'},{n:5,r:'ごかげつ'},
      {n:6,r:'ろっかげつ',irreg:true},{n:7,r:'ななかげつ'},{n:8,r:'はっかげつ',irreg:true},{n:9,r:'きゅうかげつ'},{n:10,r:'じゅっかげつ',irreg:true},
    ]
  },
  { kanji:'時間', reading:'じかん', what:'hours (duration)', cat:'time', example:'一時間 (いちじかん) · one hour',
    nums:[
      {n:1,r:'いちじかん'},{n:2,r:'にじかん'},{n:3,r:'さんじかん'},{n:4,r:'よじかん',irreg:true},{n:5,r:'ごじかん'},
      {n:6,r:'ろくじかん'},{n:7,r:'しちじかん'},{n:8,r:'はちじかん'},{n:9,r:'くじかん',irreg:true},{n:10,r:'じゅうじかん'},
    ]
  },
  { kanji:'分', reading:'ふん／ぷん', what:'minutes', cat:'time', example:'三分 (さんぷん) · three minutes',
    nums:[
      {n:1,r:'いっぷん',irreg:true},{n:2,r:'にふん'},{n:3,r:'さんぷん',irreg:true},{n:4,r:'よんふん'},{n:5,r:'ごふん'},
      {n:6,r:'ろっぷん',irreg:true},{n:7,r:'ななふん'},{n:8,r:'はっぷん',irreg:true},{n:9,r:'きゅうふん'},{n:10,r:'じゅっぷん',irreg:true},
    ]
  },
  { kanji:'歳', reading:'さい', what:'age', cat:'time', example:'二十歳 (はたち) · twenty years old',
    nums:[
      {n:1,r:'いっさい',irreg:true},{n:2,r:'にさい'},{n:3,r:'さんさい'},{n:4,r:'よんさい'},{n:5,r:'ごさい'},
      {n:6,r:'ろくさい'},{n:7,r:'ななさい'},{n:8,r:'はっさい',irreg:true},{n:9,r:'きゅうさい'},{n:10,r:'じゅっさい',irreg:true},
    ]
  },
  // Other
  { kanji:'回', reading:'かい', what:'times, occurrences', cat:'other', example:'三回 (さんかい) · three times',
    nums:[
      {n:1,r:'いっかい',irreg:true},{n:2,r:'にかい'},{n:3,r:'さんかい'},{n:4,r:'よんかい'},{n:5,r:'ごかい'},
      {n:6,r:'ろっかい',irreg:true},{n:7,r:'ななかい'},{n:8,r:'はっかい',irreg:true},{n:9,r:'きゅうかい'},{n:10,r:'じゅっかい',irreg:true},
    ]
  },
  { kanji:'階', reading:'かい', what:'floors (building)', cat:'other', example:'三階 (さんがい) · third floor',
    nums:[
      {n:1,r:'いっかい',irreg:true},{n:2,r:'にかい'},{n:3,r:'さんがい',irreg:true},{n:4,r:'よんかい'},{n:5,r:'ごかい'},
      {n:6,r:'ろっかい',irreg:true},{n:7,r:'ななかい'},{n:8,r:'はっかい',irreg:true},{n:9,r:'きゅうかい'},{n:10,r:'じゅっかい',irreg:true},
    ]
  },
  { kanji:'番', reading:'ばん', what:'number in a sequence', cat:'other', example:'一番 (いちばん) · number one / most',
    nums:[
      {n:1,r:'いちばん'},{n:2,r:'にばん'},{n:3,r:'さんばん'},{n:4,r:'よんばん'},{n:5,r:'ごばん'},
      {n:6,r:'ろくばん'},{n:7,r:'ななばん'},{n:8,r:'はちばん'},{n:9,r:'きゅうばん'},{n:10,r:'じゅうばん'},
    ]
  },
  { kanji:'つ', reading:'つ (native)', what:'generic objects (native)', cat:'other', example:'ひとつ ふたつ みっつ…',
    nums:[
      {n:1,r:'ひとつ',irreg:true},{n:2,r:'ふたつ',irreg:true},{n:3,r:'みっつ',irreg:true},{n:4,r:'よっつ',irreg:true},{n:5,r:'いつつ',irreg:true},
      {n:6,r:'むっつ',irreg:true},{n:7,r:'ななつ',irreg:true},{n:8,r:'やっつ',irreg:true},{n:9,r:'ここのつ',irreg:true},{n:10,r:'とお',irreg:true},
    ]
  },
];

// ── Counter tile drill state (features-1) ────────────────────────────────────
const CtrDrillState = {
  ok:       0,
  miss:     0,
  current:  null,
  activeGroups:  new Set(['people','objects','animals','time']),
  selected:      new Set(),
};

// Active groups (max 4) — controls what's shown in reference AND available in drill

const ctrDrillCat = 'all'; // which of the active groups to drill, or 'all'





// Selected counter indices for drill — default: all people + objects + time counters


function ctrDrillPool() {
  return [...CtrDrillState.selected]
    .map(i => COUNTERS[i])
    .filter(c => c && !c.skip && c.nums.length && (ctrDrillCat === 'all' || c.cat === ctrDrillCat));
}

function ctrToggleDrill(idx, cb) {
  if (cb.checked) CtrDrillState.selected.add(idx);
  else CtrDrillState.selected.delete(idx);
  ctrUpdateDrillCount();
}
function toHiraganaSimple(s) {
  return s.replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

const CTR_SYNONYMS = [
  ['people','persons','person','human','humans','folk','folks','individual','individuals','men','women','man','woman','body','bodies','head','heads'],
  ['small animals','small animal','animal','animals','pet','pets','creature','creatures','bug','bugs','insect','insects','fish','cat','cats','dog','dogs'],
  ['large animals','large animal','big animal','big animals','livestock','cattle','horse','horses','cow','cows'],
  ['birds','bird','rabbit','rabbits','fowl','poultry','winged'],
  ['thin flat things','thin flat thing','flat things','flat thing','flat item','flat items','flat object','flat objects','sheet','sheets','paper','papers','slice','slices','ticket','tickets','plate','plates','card','cards'],
  ['long thin things','long thin thing','long thing','long things','stick','sticks','rod','rods','bottle','bottles','pen','pens','pencil','pencils','tube','tubes','rope','ropes','bar','bars','cylinder','cylinders'],
  ['small objects','small object','small thing','small things','thing','things','item','items','object','objects','piece','pieces'],
  ['bound items','bound item','book','books','magazine','magazines','notebook','notebooks','volume','volumes'],
  ['machines','machine','vehicle','vehicles','car','cars','bike','bikes','computer','computers','device','devices','appliance','appliances','equipment'],
  ['cups','cup','glass','glasses','bowl','bowls','drink','drinks','mug','mugs','serving','servings'],
  ['clothing','clothes','garment','garments','outfit','outfits','wear','attire','shirt','shirts'],
  ['days','day','date','dates'],
  ['weeks','week'],
  ['months','month','duration','period'],
  ['hours','hour'],
  ['minutes','minute'],
  ['age','years old','year old','years','year'],
  ['times','time','occasion','occasions','instance','instances','occurrence','occurrences','round','rounds'],
  ['floors','floor','storey','story','storeys','stories','level','levels'],
  ['number','sequence','rank','order','position'],
  ['generic','anything','general','misc','miscellaneous','generic objects'],
  ['formal people','formal persons','guest','guests','customer','customers'],
];

function ctrMeaningMatch(userVal, ctWhat) {
  const norm = s => s.toLowerCase().replace(/[^a-z ]/g, '').trim();
  const stem = s => s.replace(/s$/, '').replace(/ing$/, '').replace(/er$/, '');
  const u = norm(userVal);
  const w = norm(ctWhat);
  if (!u) return false;
  if (u === w || w.includes(u) || u.includes(w)) return true;
  if (stem(u) === stem(w)) return true;
  for (const group of CTR_SYNONYMS) {
    const ng = group.map(norm);
    const hit = g => ng.some(x => x === g || x.includes(g) || g.includes(x) || stem(x) === stem(g));
    if (hit(u) && hit(w)) return true;
  }
  const stop = new Set(['a','an','the','of','for','and','or','to','in','at','on','by','with']);
  const uW = u.split(/\s+/).filter(x => x.length > 2 && !stop.has(x));
  const wW = w.split(/\s+/).filter(x => x.length > 2 && !stop.has(x));
  if (uW.length && wW.length && uW.some(a => wW.some(b => stem(a) === stem(b) || a.includes(b) || b.includes(a)))) return true;
  return false;
}
// ═══════════════════════════════════════════════════════
// TTS ENGINE
// All speech synthesis goes through TTS.speak().
// To swap the engine, change only this section.
// ═══════════════════════════════════════════════════════

const TTS = {
  _voice: null,
  _ready: false,

  // ── VoiceVox backend ──────────────────────────────────
  // Two fixed voices: Metan (female, id:2) and Ryusei (male, id:13)
  VOICEVOX_URL:     'http://localhost:50021',
  VOICEVOX_FEMALE:  2,   // 四国めたん ノーマル
  VOICEVOX_MALE:    13,  // 青山龍星 ノーマル
  _vvSpeakerId:     2,   // default female
  _vvParams:        { speedScale:1.0, pitchScale:0.0, intonationScale:1.0, volumeScale:1.0, pauseLengthScale:1.0 },
  _vvEnabled:       false,
  _vvAudio:         null, // current HTMLAudioElement

  async _vvSpeak(text, rate = 0.9, opts = {}) {
    const clean = text.replace(/[(（][^)）]*[)）]/g, '').replace(/〜/g, '');
    if (!clean.trim()) return;
    // Prepend a short pause mora for short words — VoiceVox clips the first
    // syllable on single-word inputs because audio starts before buffer fills.
    const vvText = clean.length <= 6 ? '、' + clean : clean;
    try {
      // Stop any current playback
      if (this._vvAudio) { this._vvAudio.pause(); this._vvAudio = null; }

      // Step 1: audio_query
      const qResp = await fetch(
        `${this.VOICEVOX_URL}/audio_query?text=${encodeURIComponent(vvText)}&speaker=${this._vvSpeakerId}`,
        { method: 'POST' }
      );
      if (!qResp.ok) throw new Error('VoiceVox query failed: ' + qResp.status);
      const query = await qResp.json();

      // Apply speed and voice params
      query.speedScale      = this._vvParams.speedScale;
      query.pitchScale      = this._vvParams.pitchScale;
      query.intonationScale = this._vvParams.intonationScale;
      query.volumeScale     = this._vvParams.volumeScale;
      if (this._vvParams.pauseLengthScale !== 1.0) query.pauseLengthScale = this._vvParams.pauseLengthScale;

      // Step 2: synthesis
      const sResp = await fetch(
        `${this.VOICEVOX_URL}/synthesis?speaker=${this._vvSpeakerId}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query) }
      );
      if (!sResp.ok) throw new Error('VoiceVox synthesis failed: ' + sResp.status);
      const audioBlob = await sResp.blob();
      const audioUrl  = URL.createObjectURL(audioBlob);

      const audio = new Audio(audioUrl);
      this._vvAudio = audio;
      if (opts.onend) audio.onended = () => { URL.revokeObjectURL(audioUrl); opts.onend(); };
      else audio.onended = () => URL.revokeObjectURL(audioUrl);
      if (opts.onerror) audio.onerror = opts.onerror;
      audio.play();
    } catch(e) {
      console.warn('[TTS] VoiceVox error:', e.message, '— falling back to Web Speech');
      this._vvEnabled = false;
      this._wsSpeakDirect(text, rate, opts);
    }
  },

  _wsSpeakDirect(text, rate = 0.9, opts = {}) {
    if (!window.speechSynthesis) return null;
    if (opts.cancel !== false) speechSynthesis.cancel();
    const clean = text.replace(/[(（][^)）]*[)）]/g, '');
    const utt = new SpeechSynthesisUtterance(clean);
    utt.lang = 'ja-JP';
    utt.rate = rate;
    if (this._voice) utt.voice = this._voice;
    if (opts.onend)   utt.onend   = opts.onend;
    if (opts.onerror) utt.onerror = opts.onerror;
    speechSynthesis.speak(utt);
    return utt;
  },

  // Check if VoiceVox is running
  async vvCheck() {
    try {
      const r = await fetch(`${this.VOICEVOX_URL}/version`, { method: 'GET' });
      return r.ok;
    } catch { return false; }
  },

  // Enable/disable VoiceVox and persist preference
  vvSetEnabled(on) {
    this._vvEnabled = !!on;
    (App.Storage || window.Storage).setJSON('tts_voicevox_enabled', on);
    this._updateVvUI();
  },

  vvSetSpeaker(id) {
    this._vvSpeakerId = parseInt(id);
    (App.Storage || window.Storage).setJSON('tts_voicevox_speaker', this._vvSpeakerId);
    this._updateVvUI();
  },
  vvSetParam(key, value) {
    this._vvParams[key] = value;
  },
  vvSaveParams() {
    (App.Storage || window.Storage).setJSON('tts_vv_params', this._vvParams);
    const s = document.getElementById('vvSaveStatus');
    if (s) { s.textContent = '✓ Saved'; setTimeout(() => s.textContent = '', 2000); }
  },

  _updateVvUI() {
    const toggle = document.getElementById('vvToggle');
    const sel    = document.getElementById('vvSpeakerSel');
    if (toggle) toggle.checked = this._vvEnabled;
    if (sel)    sel.value      = String(this._vvSpeakerId);
    // Restore slider values
    const p = this._vvParams;
    const setSlider = (id, valId, v) => {
      const el = document.getElementById(id); if (el) el.value = v;
      const vl = document.getElementById(valId); if (vl) vl.textContent = parseFloat(v).toFixed(2);
    };
    setSlider('vvSpeed',      'vvSpeedVal',      p.speedScale);
    setSlider('vvPitch',      'vvPitchVal',      p.pitchScale);
    setSlider('vvIntonation', 'vvIntonationVal', p.intonationScale);
    setSlider('vvPause',      'vvPauseVal',      p.pauseLengthScale);
  },

  // ── Web Speech API ────────────────────────────────────
  loadVoice() {
    if (!window.speechSynthesis) return;
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return;
    const ja   = voices.filter(v => v.lang && (v.lang === 'ja-JP' || v.lang.startsWith('ja')));
    const pool = ja.length ? ja : voices;
    const savedURI = (App.Storage || window.Storage).getTTSVoice();
    if (savedURI) this._voice = pool.find(v => v.voiceURI === savedURI) || null;
    if (!this._voice) {
      this._voice = pool.find(v => v.localService && /kyoko|otoya/i.test(v.name))
                 || pool.find(v => v.localService)
                 || pool[0] || null;
    }
    this._ready = true;
    const currentURI = this._voice ? this._voice.voiceURI : '';
    const optionsHtml = pool.map(v =>
      `<option value="${v.voiceURI}" ${v.voiceURI === currentURI ? 'selected' : ''}>${v.name}${v.localService ? '' : ' ☁'}</option>`
    ).join('');
    ['ttsVoiceSelect', 'ttsVoiceSelect2'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = optionsHtml;
    });
    const hint = `${pool.length} voice${pool.length === 1 ? '' : 's'} available`;
    const h1 = document.getElementById('ttsVoiceHint');
    const h2 = document.getElementById('ttsVoiceHint2');
    if (h1) h1.textContent = hint;
    if (h2) h2.textContent = hint + ' · ';
  },

  setVoice(uri) {
    const found = speechSynthesis.getVoices().find(v => v.voiceURI === uri);
    if (!found) return;
    this._voice = found;
    (App.Storage || window.Storage).setTTSVoice(uri);
    ['ttsVoiceSelect', 'ttsVoiceSelect2'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = uri;
    });
  },

  // ── Main speak entry point ────────────────────────────
  speak(text, rate = 0.9, opts = {}) {
    if (this._vvEnabled) {
      this._vvSpeak(text, rate, opts);
      return null; // async, no utterance object
    }
    return this._wsSpeakDirect(text, rate, opts);
  },

  stop() {
    if (this._vvAudio) { this._vvAudio.pause(); this._vvAudio = null; }
    if (window.speechSynthesis) speechSynthesis.cancel();
  },

  test() { this.speak('こんにちは、日本語の音声テストです。', 0.9); },

  init() {
    // Restore VoiceVox preferences
    const _Storage = App.Storage || window.Storage;
    if (_Storage) {
      this._vvEnabled   = !!_Storage.getJSON('tts_voicevox_enabled');
      this._vvSpeakerId = _Storage.getJSON('tts_voicevox_speaker') || this.VOICEVOX_MALE;
      const _savedParams = _Storage.getJSON('tts_vv_params');
      if (_savedParams) Object.assign(this._vvParams, _savedParams);
    }
    // Auto-enable VoiceVox on first run if it is available
    if (_Storage && _Storage.getJSON('tts_voicevox_enabled') === null) {
      this.vvCheck().then(ok => { if (ok) { this.vvSetEnabled(true); } });
    }
    if (!window.speechSynthesis) return;
    speechSynthesis.onvoiceschanged = () => this.loadVoice();
    this.loadVoice();
    let polls = 0;
    const poll = setInterval(() => {
      if (speechSynthesis.getVoices().length) { this.loadVoice(); clearInterval(poll); }
      if (++polls > 20) clearInterval(poll);
    }, 500);
    // Update VoiceVox UI once DOM is ready
    setTimeout(() => {
      const _St = App.Storage || window.Storage;
      if (_St) {
        const _p = _St.getJSON('tts_vv_params');
        if (_p) Object.assign(this._vvParams, _p);
      }
      this._updateVvUI();
    }, 800);
  },
};

TTS.init();

setTimeout(() => { if (typeof refreshMicrophones === 'function') refreshMicrophones(); }, 1000);

// ── Legacy shims ─────────────────────────────────────────
function jpSpeak(text, rate, opts) { return TTS.speak(text, rate || 0.9, opts || {}); }
function setTtsVoice(uri)          { TTS.setVoice(uri); }
function testVoice()               { TTS.test(); }
function vvToggle(on)              { TTS.vvSetEnabled(on); }
function vvSetSpeaker(id)          { TTS.vvSetSpeaker(id); }

function toggleResourcesSettings() {
  const panel = document.getElementById('resourcesSettingsPanel');
  const btn   = document.getElementById('resSettingsBtn');
  if (!panel) return;
  const isHidden = panel.style.display === 'none';
  panel.style.display = isHidden ? 'block' : 'none';
  if (btn) {
    btn.style.borderColor = isHidden ? 'var(--teal)' : '';
    btn.style.color       = isHidden ? 'var(--teal)' : 'var(--ink-light)';
  }
  const status = document.getElementById('resApiStatus');
  if (status) {
    const _getApiKey = App.getApiKey || window.getApiKey;
    status.textContent = _getApiKey?.() ? '✓ Set' : '✗ Not set';
    status.style.color = _getApiKey?.() ? 'var(--teal)' : 'var(--red)';
  }
  TTS.loadVoice();
}

// ── VOCAB TTS ─────────────────────────────────────────────
let vocabListenMode = false;

function vocabSpeak() {
  const _state    = App.state    || window.state;
  const _vocabIdx = App.vocabIdx || window.vocabIdx;
  const card = _state?.vocab?.[_vocabIdx];
  if (!card) return;
  const text = card.jp || card.kana || '';
  if (!text) return;
  const btn = document.getElementById('vocabTtsBtn');
  if (btn) btn.classList.add('speaking');
  TTS.speak(text, 0.9, { onend: () => { if (btn) btn.classList.remove('speaking'); } });
}

const _origRenderVocab = renderVocab;
renderVocab = function() {
  _origRenderVocab();
  if (vocabListenMode) {
    setTimeout(() => {
      const jpEl   = document.getElementById('vcJp');
      const readEl = document.getElementById('vcReading');
      if (jpEl)   jpEl.style.visibility   = 'hidden';
      if (readEl) readEl.style.visibility  = 'hidden';
      vocabSpeak();
    }, 100);
  }
};

// ── CONJUGATION TTS ───────────────────────────────────────
let conjListenMode = false;

function conjSpeak() {
  const _conjCurrentAnswer = App.conjCurrentAnswer || window.conjCurrentAnswer;
  if (!_conjCurrentAnswer) return;
  TTS.speak(_conjCurrentAnswer.word.dict);
}

function toggleConjListenMode() {
  conjListenMode = !conjListenMode;
  // G-suffix IDs match the HTML (conjListenToggleG, conjListenBadgeG)
  const toggle = document.getElementById('conjListenToggleG') || document.getElementById('conjListenToggle');
  const badge  = document.getElementById('conjListenBadgeG')  || document.getElementById('conjListenBadge');
  if (toggle) toggle.classList.toggle('active', conjListenMode);
  if (badge)  badge.style.display = conjListenMode ? 'inline-block' : 'none';
  // renderConjDrillG is the current name after G-suffix migration
  const _renderConj = App.renderConjDrillG || window.renderConjDrillG
                   || App.renderConjDrill  || window.renderConjDrill;
  if (_renderConj) _renderConj();
}



// ═══════════════════════════════════════════════════════
// AUDIO UTILITIES
// Shared by LessonNotes and QuickRead recording
// ═══════════════════════════════════════════════════════


// Trim silence from beginning and end of an AudioBuffer
function trimSilence(buffer, audioCtx) {
  const threshold = 0.01; // Silence threshold
  const sampleRate = buffer.sampleRate;
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;
  
  // Get max amplitude across all channels at each sample
  const samples = new Float32Array(length);
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      samples[i] = Math.max(samples[i], Math.abs(channelData[i]));
    }
  }
  
  // Find start (first sample above threshold)
  let start = 0;
  for (let i = 0; i < length; i++) {
    if (samples[i] > threshold) {
      // Go back a tiny bit for natural attack
      start = Math.max(0, i - Math.floor(sampleRate * 0.02));
      break;
    }
  }
  
  // Find end (last sample above threshold)
  let end = length;
  for (let i = length - 1; i >= 0; i--) {
    if (samples[i] > threshold) {
      // Add tiny tail for natural release
      end = Math.min(length, i + Math.floor(sampleRate * 0.05));
      break;
    }
  }
  
  // If all silence, return tiny buffer
  if (start >= end) {
    return audioCtx.createBuffer(numChannels, 1, sampleRate);
  }
  
  // Create trimmed buffer
  const trimmedLength = end - start;
  const trimmed = audioCtx.createBuffer(numChannels, trimmedLength, sampleRate);
  for (let ch = 0; ch < numChannels; ch++) {
    const sourceData = buffer.getChannelData(ch);
    const destData = trimmed.getChannelData(ch);
    for (let i = 0; i < trimmedLength; i++) {
      destData[i] = sourceData[start + i];
    }
  }
  
  return trimmed;
}

// Convert AudioBuffer to WAV Blob
function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  const samples = buffer.length;
  const dataSize = samples * blockAlign;
  const bufferSize = 44 + dataSize;
  
  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);
  
  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, bufferSize - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  
  // Interleave channels and write samples
  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
  
  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}

// ── App registry ─────────────────────────────────────────
// Note: renderVocab override (line ~458) captures the core-vocab.js
// reference at parse time — load order dependency is real but safe
// since core-vocab.js precedes features-core.js in index.html.
// conjCurrentAnswer and renderConjDrill are bare globals from
// features-grammar.js — update to App-first in Phase 3.
try {
  Object.assign(App, {
    // TTS
    TTS,
    jpSpeak,
    setTtsVoice,
    testVoice,
    vvToggle,
    vvSetSpeaker,
    // Vocab / conj TTS helpers
    vocabSpeak,
    conjSpeak,
    toggleConjListenMode,
    // Settings panel
    toggleResourcesSettings,
    // Audio utilities
    trimSilence,
    audioBufferToWav,
    // DrillFlow
    DrillFlow,
    // Counter drill (features-core portion)
    ctrDrillPool,
    ctrToggleDrill,
    ctrMeaningMatch,
    toHiraganaSimple,
  });
  // window[] exports for Electron inline onclick handlers
  window['jpSpeak']                = jpSpeak;
  window['setTtsVoice']            = setTtsVoice;
  window['testVoice']              = testVoice;
  window['vvToggle']               = vvToggle;
  window['vvSetSpeaker']           = vvSetSpeaker;
  window['toggleConjListenMode']   = toggleConjListenMode;
  window['toggleResourcesSettings']= toggleResourcesSettings;
} catch(e) { console.error('[features-core] App registry failed:', e); }
