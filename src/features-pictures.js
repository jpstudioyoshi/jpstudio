// ╔══════════════════════════════════════════════════════════════════════════════
// ║ features-pictures.js
// ║ Pictures naming game (was Vehicle Game). VG_CATEGORIES, VehicleGameState,
// ║ vg* functions. Renamed from "Vehicles" to "Pictures" — nav button: 🖼 Pictures
// ║ Depends on: core-foundation.js (state, escHtml)
// ╚══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// FEATURES-TOOLS
// Vehicle Naming Game · Progress Export/Import ·
// Error Dashboard · N5 Grammar Graph · Drill Recency ·
// Stroke Order · Matching Pairs · Global window exports
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// VEHICLE NAMING GAME
// ═══════════════════════════════════════════════════════
const VG_CATEGORIES = {
  vehicles: {
    label: 'Vehicles', emoji: '🚗',
    items: [
      { emoji:'🚗', en:'car',         jp:'くるま',    kanji:'車' },
      { emoji:'🚕', en:'taxi',        jp:'タクシー',  kanji:'タクシー' },
      { emoji:'🚌', en:'bus',         jp:'バス',      kanji:'バス' },
      { emoji:'🏎️', en:'racing car',  jp:'レーシングカー', kanji:'レーシングカー' },
      { emoji:'🚓', en:'police car',  jp:'パトカー',  kanji:'パトカー' },
      { emoji:'🚑', en:'ambulance',   jp:'きゅうきゅうしゃ', kanji:'救急車' },
      { emoji:'🚒', en:'fire truck',  jp:'しょうぼうしゃ',   kanji:'消防車' },
      { emoji:'🚚', en:'truck',       jp:'トラック',  kanji:'トラック' },
      { emoji:'🚜', en:'tractor',     jp:'トラクター',kanji:'トラクター' },
      { emoji:'🛵', en:'scooter',     jp:'スクーター',kanji:'スクーター' },
      { emoji:'🏍️', en:'motorcycle',  jp:'オートバイ',kanji:'オートバイ' },
      { emoji:'🚲', en:'bicycle',     jp:'じてんしゃ',kanji:'自転車' },
      { emoji:'✈️', en:'airplane',    jp:'ひこうき',  kanji:'飛行機' },
      { emoji:'🚀', en:'rocket',      jp:'ロケット',  kanji:'ロケット' },
      { emoji:'🚁', en:'helicopter',  jp:'ヘリコプター',kanji:'ヘリコプター' },
      { emoji:'🚢', en:'ship',        jp:'ふね',      kanji:'船' },
      { emoji:'🚂', en:'train',       jp:'きしゃ',    kanji:'汽車' },
      { emoji:'🚇', en:'subway',      jp:'ちかてつ',  kanji:'地下鉄' },
    ]
  },
  animals: {
    label: 'Animals', emoji: '🐶',
    items: [
      { emoji:'🐶', en:'dog',      jp:'いぬ',      kanji:'犬' },
      { emoji:'🐱', en:'cat',      jp:'ねこ',      kanji:'猫' },
      { emoji:'🐭', en:'mouse',    jp:'ねずみ',    kanji:'鼠' },
      { emoji:'🐹', en:'hamster',  jp:'ハムスター',kanji:'ハムスター' },
      { emoji:'🐰', en:'rabbit',   jp:'うさぎ',    kanji:'兎' },
      { emoji:'🦊', en:'fox',      jp:'きつね',    kanji:'狐' },
      { emoji:'🐻', en:'bear',     jp:'くま',      kanji:'熊' },
      { emoji:'🐼', en:'panda',    jp:'パンダ',    kanji:'パンダ' },
      { emoji:'🐨', en:'koala',    jp:'コアラ',    kanji:'コアラ' },
      { emoji:'🐯', en:'tiger',    jp:'とら',      kanji:'虎' },
      { emoji:'🦁', en:'lion',     jp:'ライオン',  kanji:'ライオン' },
      { emoji:'🐮', en:'cow',      jp:'うし',      kanji:'牛' },
      { emoji:'🐷', en:'pig',      jp:'ぶた',      kanji:'豚' },
      { emoji:'🐸', en:'frog',     jp:'かえる',    kanji:'蛙' },
      { emoji:'🐧', en:'penguin',  jp:'ペンギン',  kanji:'ペンギン' },
      { emoji:'🐦', en:'bird',     jp:'とり',      kanji:'鳥' },
      { emoji:'🐙', en:'octopus',  jp:'たこ',      kanji:'蛸' },
      { emoji:'🦋', en:'butterfly',jp:'ちょうちょ',kanji:'蝶' },
    ]
  },
  food: {
    label: 'Food', emoji: '🍣',
    items: [
      { emoji:'🍣', en:'sushi',      jp:'すし',      kanji:'寿司' },
      { emoji:'🍜', en:'ramen',      jp:'ラーメン',  kanji:'ラーメン' },
      { emoji:'🍱', en:'bento',      jp:'べんとう',  kanji:'弁当' },
      { emoji:'🍙', en:'rice ball',  jp:'おにぎり',  kanji:'おにぎり' },
      { emoji:'🍛', en:'curry',      jp:'カレー',    kanji:'カレー' },
      { emoji:'🍚', en:'rice',       jp:'ごはん',    kanji:'ご飯' },
      { emoji:'🥟', en:'dumpling',   jp:'ギョーザ',  kanji:'餃子' },
      { emoji:'🍤', en:'shrimp',     jp:'えび',      kanji:'海老' },
      { emoji:'🍡', en:'dango',      jp:'だんご',    kanji:'団子' },
      { emoji:'🍰', en:'cake',       jp:'ケーキ',    kanji:'ケーキ' },
      { emoji:'🍎', en:'apple',      jp:'りんご',    kanji:'林檎' },
      { emoji:'🍌', en:'banana',     jp:'バナナ',    kanji:'バナナ' },
      { emoji:'🍊', en:'orange',     jp:'オレンジ',  kanji:'オレンジ' },
      { emoji:'🍇', en:'grapes',     jp:'ぶどう',    kanji:'葡萄' },
      { emoji:'🍓', en:'strawberry', jp:'いちご',    kanji:'苺' },
      { emoji:'🥦', en:'broccoli',   jp:'ブロッコリー',kanji:'ブロッコリー' },
      { emoji:'🧅', en:'onion',      jp:'たまねぎ',  kanji:'玉葱' },
      { emoji:'🥕', en:'carrot',     jp:'にんじん',  kanji:'人参' },
    ]
  },
  buildings: {
    label: 'Buildings', emoji: '🏯',
    items: [
      { emoji:'🏯', en:'castle',      jp:'しろ',        kanji:'城' },
      { emoji:'⛩️', en:'shrine',      jp:'じんじゃ',    kanji:'神社' },
      { emoji:'🏠', en:'house',       jp:'いえ',        kanji:'家' },
      { emoji:'🏢', en:'office',      jp:'かいしゃ',    kanji:'会社' },
      { emoji:'🏥', en:'hospital',    jp:'びょういん',  kanji:'病院' },
      { emoji:'🏫', en:'school',      jp:'がっこう',    kanji:'学校' },
      { emoji:'🏦', en:'bank',        jp:'ぎんこう',    kanji:'銀行' },
      { emoji:'🏨', en:'hotel',       jp:'ホテル',      kanji:'ホテル' },
      { emoji:'🏪', en:'store',       jp:'みせ',        kanji:'店' },
      { emoji:'🏬', en:'department store', jp:'デパート',kanji:'デパート' },
      { emoji:'🏛️', en:'museum',      jp:'はくぶつかん',kanji:'博物館' },
      { emoji:'⛪', en:'church',      jp:'きょうかい',  kanji:'教会' },
      { emoji:'🕌', en:'mosque',      jp:'モスク',      kanji:'モスク' },
      { emoji:'🏗️', en:'construction',jp:'こうじ',      kanji:'工事' },
      { emoji:'🏟️', en:'stadium',     jp:'スタジアム',  kanji:'スタジアム' },
      { emoji:'🚉', en:'station',     jp:'えき',        kanji:'駅' },
      { emoji:'🏖️', en:'beach',       jp:'うみべ',      kanji:'海辺' },
      { emoji:'⛺', en:'tent',        jp:'テント',      kanji:'テント' },
    ]
  },
  jobs: {
    label: 'Jobs', emoji: '👨‍⚕️',
    items: [
      { emoji:'👨‍⚕️', en:'doctor',    jp:'いしゃ',          kanji:'医者' },
      { emoji:'👩‍🏫', en:'teacher',   jp:'せんせい',        kanji:'先生' },
      { emoji:'👨‍🍳', en:'chef',      jp:'コック',          kanji:'コック' },
      { emoji:'👮', en:'police',      jp:'けいさつ',        kanji:'警察' },
      { emoji:'👨‍🚒', en:'firefighter',jp:'しょうぼうし',   kanji:'消防士' },
      { emoji:'💂', en:'guard',       jp:'えいへい',        kanji:'衛兵' },
      { emoji:'👨‍✈️', en:'pilot',     jp:'パイロット',      kanji:'パイロット' },
      { emoji:'👩‍💻', en:'programmer', jp:'プログラマー',   kanji:'プログラマー' },
      { emoji:'👨‍🔧', en:'mechanic',  jp:'せいびし',        kanji:'整備士' },
      { emoji:'👩‍🎨', en:'artist',    jp:'げいじゅつか',    kanji:'芸術家' },
      { emoji:'👨‍🌾', en:'farmer',    jp:'のうか',          kanji:'農家' },
      { emoji:'👩‍⚖️', en:'judge',    jp:'さいばんかん',    kanji:'裁判官' },
      { emoji:'🧑‍🚀', en:'astronaut', jp:'うちゅうひこうし',kanji:'宇宙飛行士' },
      { emoji:'👩‍🔬', en:'scientist', jp:'かがくしゃ',      kanji:'科学者' },
      { emoji:'🧑‍🎤', en:'singer',    jp:'かしゅ',          kanji:'歌手' },
      { emoji:'💆', en:'masseur',     jp:'あんまし',        kanji:'按摩師' },
      { emoji:'🧑‍🍼', en:'babysitter',jp:'こもりのひと',    kanji:'子守の人' },
      { emoji:'🧑‍🏭', en:'factory worker',jp:'こうじょうろうどうしゃ',kanji:'工場労働者' },
    ]
  },
  tools: {
    label: 'Tools', emoji: '🔨',
    items: [
      { emoji:'🔨', en:'hammer',     jp:'かなづち',        kanji:'金槌' },
      { emoji:'🪛', en:'screwdriver',jp:'ドライバー',      kanji:'ドライバー' },
      { emoji:'🔧', en:'wrench',     jp:'スパナ',          kanji:'スパナ' },
      { emoji:'✂️', en:'scissors',   jp:'はさみ',          kanji:'鋏' },
      { emoji:'🪚', en:'saw',        jp:'のこぎり',        kanji:'鋸' },
      { emoji:'🧲', en:'magnet',     jp:'じしゃく',        kanji:'磁石' },
      { emoji:'🔦', en:'torch',      jp:'かいちゅうでんとう',kanji:'懐中電灯' },
      { emoji:'🕯️', en:'candle',     jp:'ろうそく',        kanji:'蝋燭' },
      { emoji:'🧯', en:'extinguisher',jp:'しょうかき',     kanji:'消火器' },
      { emoji:'🪝', en:'hook',       jp:'フック',          kanji:'フック' },
      { emoji:'🪜', en:'ladder',     jp:'はしご',          kanji:'梯子' },
      { emoji:'🧰', en:'toolbox',    jp:'どうぐばこ',      kanji:'道具箱' },
      { emoji:'🔩', en:'bolt',       jp:'ボルト',          kanji:'ボルト' },
      { emoji:'📏', en:'ruler',      jp:'ものさし',        kanji:'物差し' },
      { emoji:'🖊️', en:'pen',        jp:'ペン',            kanji:'ペン' },
      { emoji:'📌', en:'pin',        jp:'ピン',            kanji:'ピン' },
      { emoji:'🗑️', en:'bin',        jp:'ごみばこ',        kanji:'ゴミ箱' },
      { emoji:'💡', en:'lightbulb',  jp:'でんきゅう',      kanji:'電球' },
    ]
  },
  sports: {
    label: 'Sports', emoji: '⚽',
    items: [
      { emoji:'⚽', en:'football',   jp:'サッカー',        kanji:'サッカー' },
      { emoji:'🏀', en:'basketball', jp:'バスケットボール',kanji:'バスケットボール' },
      { emoji:'🏈', en:'american football', jp:'アメフト',kanji:'アメフト' },
      { emoji:'⚾', en:'baseball',   jp:'やきゅう',        kanji:'野球' },
      { emoji:'🎾', en:'tennis',     jp:'テニス',          kanji:'テニス' },
      { emoji:'🏐', en:'volleyball', jp:'バレーボール',    kanji:'バレーボール' },
      { emoji:'🏉', en:'rugby',      jp:'ラグビー',        kanji:'ラグビー' },
      { emoji:'🎱', en:'billiards',  jp:'ビリヤード',      kanji:'ビリヤード' },
      { emoji:'🏓', en:'ping pong',  jp:'たっきゅう',      kanji:'卓球' },
      { emoji:'🏸', en:'badminton',  jp:'バドミントン',    kanji:'バドミントン' },
      { emoji:'🥊', en:'boxing',     jp:'ボクシング',      kanji:'ボクシング' },
      { emoji:'🥋', en:'martial arts',jp:'かくとうぎ',     kanji:'格闘技' },
      { emoji:'🎿', en:'skiing',     jp:'スキー',          kanji:'スキー' },
      { emoji:'🛷', en:'sledding',   jp:'そり',            kanji:'橇' },
      { emoji:'🏊', en:'swimming',   jp:'すいえい',        kanji:'水泳' },
      { emoji:'🚴', en:'cycling',    jp:'じてんしゃきょうぎ',kanji:'自転車競技' },
      { emoji:'🏇', en:'horse racing',jp:'けいば',         kanji:'競馬' },
      { emoji:'🥅', en:'goal',       jp:'ゴール',          kanji:'ゴール' },
    ]
  },
  nature: {
    label: 'Nature', emoji: '🌸',
    items: [
      { emoji:'🌸', en:'cherry blossom', jp:'さくら',      kanji:'桜' },
      { emoji:'🌺', en:'flower',     jp:'はな',            kanji:'花' },
      { emoji:'🌻', en:'sunflower',  jp:'ひまわり',        kanji:'向日葵' },
      { emoji:'🍀', en:'clover',     jp:'クローバー',      kanji:'クローバー' },
      { emoji:'🍁', en:'maple leaf', jp:'もみじ',          kanji:'紅葉' },
      { emoji:'🌊', en:'wave',       jp:'なみ',            kanji:'波' },
      { emoji:'🏔️', en:'mountain',   jp:'やま',            kanji:'山' },
      { emoji:'🌋', en:'volcano',    jp:'かざん',          kanji:'火山' },
      { emoji:'🌙', en:'moon',       jp:'つき',            kanji:'月' },
      { emoji:'⭐', en:'star',       jp:'ほし',            kanji:'星' },
      { emoji:'☀️', en:'sun',        jp:'たいよう',        kanji:'太陽' },
      { emoji:'🌈', en:'rainbow',    jp:'にじ',            kanji:'虹' },
      { emoji:'❄️', en:'snow',       jp:'ゆき',            kanji:'雪' },
      { emoji:'⚡', en:'lightning',  jp:'かみなり',        kanji:'雷' },
      { emoji:'🌊', en:'ocean',      jp:'うみ',            kanji:'海' },
      { emoji:'🪨', en:'rock',       jp:'いわ',            kanji:'岩' },
      { emoji:'🌿', en:'grass',      jp:'くさ',            kanji:'草' },
      { emoji:'🌲', en:'tree',       jp:'き',              kanji:'木' },
    ]
  },
  verbs: {
    label: 'Verbs', emoji: '🏃',
    items: [
      { emoji:'🏃', en:'to run',      jp:'はしる',         kanji:'走る' },
      { emoji:'🚶', en:'to walk',     jp:'あるく',         kanji:'歩く' },
      { emoji:'😴', en:'to sleep',    jp:'ねる',           kanji:'寝る' },
      { emoji:'🍽️', en:'to eat',      jp:'たべる',         kanji:'食べる' },
      { emoji:'🥤', en:'to drink',    jp:'のむ',           kanji:'飲む' },
      { emoji:'📖', en:'to read',     jp:'よむ',           kanji:'読む' },
      { emoji:'✍️', en:'to write',    jp:'かく',           kanji:'書く' },
      { emoji:'👂', en:'to listen',   jp:'きく',           kanji:'聞く' },
      { emoji:'👀', en:'to look',     jp:'みる',           kanji:'見る' },
      { emoji:'🗣️', en:'to speak',    jp:'はなす',         kanji:'話す' },
      { emoji:'🤔', en:'to think',    jp:'かんがえる',     kanji:'考える' },
      { emoji:'😊', en:'to laugh',    jp:'わらう',         kanji:'笑う' },
      { emoji:'😭', en:'to cry',      jp:'なく',           kanji:'泣く' },
      { emoji:'🛒', en:'to buy',      jp:'かう',           kanji:'買う' },
      { emoji:'💰', en:'to sell',     jp:'うる',           kanji:'売る' },
      { emoji:'🚗💨', en:'to drive',  jp:'うんてんする',   kanji:'運転する' },
      { emoji:'🏊', en:'to swim',     jp:'およぐ',         kanji:'泳ぐ' },
      { emoji:'💃', en:'to dance',    jp:'おどる',         kanji:'踊る' },
      { emoji:'🎵', en:'to sing',     jp:'うたう',         kanji:'歌う' },
      { emoji:'📸', en:'to take a photo', jp:'しゃしんをとる',kanji:'写真を撮る' },
    ]
  },
  adjectives: {
    label: 'Adjectives', emoji: '🌡️',
    items: [
      { emoji:'🌡️🔥', en:'hot',       jp:'あつい',         kanji:'暑い' },
      { emoji:'🌡️❄️', en:'cold',      jp:'さむい',         kanji:'寒い' },
      { emoji:'😄',    en:'happy',     jp:'うれしい',       kanji:'嬉しい' },
      { emoji:'😢',    en:'sad',       jp:'かなしい',       kanji:'悲しい' },
      { emoji:'😡',    en:'angry',     jp:'おこる',         kanji:'怒る' },
      { emoji:'😨',    en:'scary',     jp:'こわい',         kanji:'怖い' },
      { emoji:'😋',    en:'delicious', jp:'おいしい',       kanji:'美味しい' },
      { emoji:'🤢',    en:'disgusting',jp:'まずい',         kanji:'まずい' },
      { emoji:'📏⬆️', en:'tall/big',  jp:'おおきい',       kanji:'大きい' },
      { emoji:'📏⬇️', en:'small',     jp:'ちいさい',       kanji:'小さい' },
      { emoji:'⚡fast', en:'fast',     jp:'はやい',         kanji:'速い' },
      { emoji:'🐢',    en:'slow',      jp:'おそい',         kanji:'遅い' },
      { emoji:'🆕',    en:'new',       jp:'あたらしい',     kanji:'新しい' },
      { emoji:'🗿',    en:'old',       jp:'ふるい',         kanji:'古い' },
      { emoji:'💰💰',  en:'expensive', jp:'たかい',         kanji:'高い' },
      { emoji:'🏷️',    en:'cheap',     jp:'やすい',         kanji:'安い' },
      { emoji:'💪',    en:'strong',    jp:'つよい',         kanji:'強い' },
      { emoji:'🪶',    en:'weak',      jp:'よわい',         kanji:'弱い' },
      { emoji:'🌟',    en:'beautiful', jp:'うつくしい',     kanji:'美しい' },
      { emoji:'⚫',    en:'dark',      jp:'くらい',         kanji:'暗い' },
    ]
  },
};
// ── Vehicle game state ───────────────────────────────────────────────────────
const VehicleGameState = {
  // Speech / TTS
  speechRec:    null,
  micOn:        false,
  ttsOn:        false,
  // STT recording
  sttRecording: false,
  sttRecorder:  null,
  sttChunks:    [],
  sttStream:    null,
  // Game
  category:     'vehicles',
  time:         20,
  count:        5,          // how many to test
  textMode:     'on',
  labelTimer:   null,
  targets:      [],         // shuffled items to name
  grid:         [],         // items displayed on grid
  current:      0,          // index into targets
  correct:      0,
  skipped:      0,
  timerInt:     null,
  secsLeft:     0,
  running:      false,
  results:      [],         // {vehicle, correct, time}
};
let VG_VEHICLES = VG_CATEGORIES.vehicles.items; // alias for compat

function vgSelectTime(t, btn) {
  VehicleGameState.time = t;
  btn.closest('.vg-time-btns').querySelectorAll('.vg-time-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function vgSelectText(mode, btn) {
  VehicleGameState.textMode = mode;
  btn.closest('.vg-time-btns').querySelectorAll('.vg-time-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function vgSelectCount(n, btn) {
  VehicleGameState.count = n;
  btn.closest('.vg-time-btns').querySelectorAll('.vg-time-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function vgSelectCat(cat, btn) {
  VehicleGameState.category = cat;
  VG_VEHICLES = VG_CATEGORIES[cat].items;
  document.querySelectorAll('.vg-cat-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const info = VG_CATEGORIES[cat];
  const title = document.getElementById('vg-setup-title');
  if (title) title.textContent = info.emoji + ' ' + info.label;
}

function vgShowSetup() {
  document.getElementById('vg-setup').style.display = 'flex';
  document.getElementById('vg-result').style.display = 'none';
  document.getElementById('vg-wrap').style.display = 'none';
}

function vgStart() {
  // Pick 12 random vehicles for grid, first 5 are targets
  VG_VEHICLES = VG_CATEGORIES[VehicleGameState.category].items;
  const shuffled = [...VG_VEHICLES].sort(() => Math.random() - 0.5);
  const gridSize = Math.max(12, VehicleGameState.count);
  VehicleGameState.grid = shuffled.slice(0, Math.min(gridSize, VG_VEHICLES.length));
  VehicleGameState.targets = [...VehicleGameState.grid].sort(() => Math.random() - 0.5).slice(0, VehicleGameState.count);
  VehicleGameState.current = 0;
  VehicleGameState.correct = 0;
  VehicleGameState.skipped = 0;
  VehicleGameState.results = [];
  VehicleGameState.running = true;

  document.getElementById('vg-setup').style.display = 'none';
  document.getElementById('vg-result').style.display = 'none';
  document.getElementById('vg-wrap').style.display = 'grid';

  vgRenderGrid();
  vgNextTarget();
}

function vgRenderGrid() {
  const grid = document.getElementById('vg-grid');
  grid.innerHTML = VehicleGameState.grid.map((v, i) => `
    <div class="vg-card" id="vg-card-${i}" data-idx="${i}">
      <span>${v.emoji}</span>
      <span class="vg-label vg-jp">${v.jp}</span>
    </div>
  `).join('');
}

function vgNextTarget() {
  clearInterval(VehicleGameState.timerInt);
  if (VehicleGameState.current >= VehicleGameState.targets.length) { vgEnd(); return; }

  const target = VehicleGameState.targets[VehicleGameState.current];
  document.getElementById('vg-target-emoji').textContent = target.emoji;
  document.getElementById('vg-hint').textContent = '';
  document.getElementById('vg-input').value = '';
  document.getElementById('vg-input').className = '';
  vgSetupInput();
  document.getElementById('vg-input').focus();
  vgAutoSpeak();
  vgStopMic();
  document.getElementById('vg-correct').textContent = VehicleGameState.correct;
  document.getElementById('vg-skipped').textContent = VehicleGameState.skipped;
  document.getElementById('vg-left').textContent = VehicleGameState.targets.length - VehicleGameState.current;

  // Highlight card — manage label visibility by mode
  clearTimeout(VehicleGameState.labelTimer);
  document.querySelectorAll('.vg-card').forEach(el => {
    el.classList.remove('active','correct','skipped');
    const lbl = el.querySelector('.vg-label');
    if (lbl) lbl.classList.remove('vg-label-hidden');
  });
  const cardIdx = VehicleGameState.grid.findIndex(v => v === target);
  if (cardIdx !== -1) {
    const card = document.getElementById('vg-card-' + cardIdx);
    card.classList.add('active');
    const lbl = card.querySelector('.vg-label');
    if (VehicleGameState.textMode === 'off') {
      if (lbl) lbl.classList.add('vg-label-hidden');
    } else if (VehicleGameState.textMode === 'hide') {
      // Show for 5s then fade out
      VehicleGameState.labelTimer = setTimeout(() => {
        if (lbl) lbl.classList.add('vg-label-hidden');
      }, 5000);
    }
    // 'on' = leave visible
  }

  // Start timer
  VehicleGameState.secsLeft = VehicleGameState.time;
  vgUpdateTimer(VehicleGameState.secsLeft, VehicleGameState.time);
  const startTime = Date.now();
  VehicleGameState.timerInt = setInterval(() => {
    VehicleGameState.secsLeft--;
    vgUpdateTimer(VehicleGameState.secsLeft, VehicleGameState.time);
    if (VehicleGameState.secsLeft <= 0) { vgTimeout(); }
  }, 1000);
}

function vgUpdateTimer(left, total) {
  const bar = document.getElementById('vg-timer-bar');
  const txt = document.getElementById('vg-timer-text');
  const circumference = 270;
  const pct = left / total;
  const offset = circumference * (1 - pct);
  bar.style.strokeDashoffset = offset;
  // Colour shift: green → gold → red
  bar.style.stroke = left > total * 0.5 ? 'var(--teal)' : left > total * 0.25 ? 'var(--gold)' : 'var(--red)';
  txt.textContent = left;
}

function vgCheckSilent() {
  if (!VehicleGameState.running) return;
  const inp = document.getElementById('vg-input');
  const answer = inp.value.trim();
  if (!answer) return;
  const target = VehicleGameState.targets[VehicleGameState.current];
  if (!target) return;
  if (answer === target.jp) vgCheck();
}

function vgCheck() {
  if (!VehicleGameState.running) return;
  const inp = document.getElementById('vg-input');
  const answer = inp.value.trim();
  const target = VehicleGameState.targets[VehicleGameState.current];
  // Accept if any accepted reading matches
  const accepted = [target.jp];
  const correct = accepted.some(a => answer === a);

  if (correct) {
    clearInterval(VehicleGameState.timerInt);
    inp.className = 'correct';
    VehicleGameState.correct++;
    VehicleGameState.results.push({ vehicle: target, correct: true });

    // Mark card correct
    const cardIdx = VehicleGameState.grid.findIndex(v => v === target);
    if (cardIdx !== -1) {
      const card = document.getElementById('vg-card-' + cardIdx);
      card.classList.remove('active');
      card.classList.add('correct');
    }
    document.getElementById('vg-hint').textContent = '✓ ' + target.jp;
    VehicleGameState.current++;
    setTimeout(vgNextTarget, 900);
  } else {
    inp.className = 'wrong';
    setTimeout(() => { inp.className = ''; }, 400);
  }
}

function vgNext() {
  if (!VehicleGameState.running) return;
  // If current question still active (not yet answered/timed out), skip it
  if (VehicleGameState.current < VehicleGameState.targets.length) {
    const alreadyAdvanced = VehicleGameState.results.length >= VehicleGameState.current + 1;
    if (!alreadyAdvanced) {
      // Not yet recorded — treat as skip
      clearInterval(VehicleGameState.timerInt);
      const target = VehicleGameState.targets[VehicleGameState.current];
      VehicleGameState.skipped++;
      VehicleGameState.results.push({ vehicle: target, correct: false });
      const cardIdx = VehicleGameState.grid.findIndex(v => v === target);
      if (cardIdx !== -1) {
        const card = document.getElementById('vg-card-' + cardIdx);
        card.classList.remove('active');
        card.classList.add('skipped');
      }
      VehicleGameState.current++;
    }
  }
  vgNextTarget();
}

function vgTimeout(manual) {
  clearInterval(VehicleGameState.timerInt);
  const target = VehicleGameState.targets[VehicleGameState.current];
  VehicleGameState.skipped++;
  VehicleGameState.results.push({ vehicle: target, correct: false });

  const cardIdx = VehicleGameState.grid.findIndex(v => v === target);
  if (cardIdx !== -1) {
    const card = document.getElementById('vg-card-' + cardIdx);
    card.classList.remove('active');
    card.classList.add('skipped');
  }

  document.getElementById('vg-hint').textContent = 'Answer: ' + target.jp + ' (' + target.en + ')';
  document.getElementById('vg-input').value = '';
  document.getElementById('vg-timer-text').textContent = '0';
  VehicleGameState.current++;
  setTimeout(vgNextTarget, 1400);
}

function vgEnd() {
  VehicleGameState.running = false;
  clearInterval(VehicleGameState.timerInt);
  document.getElementById('vg-wrap').style.display = 'none';
  document.getElementById('vg-result').style.display = 'flex';

  const total = VehicleGameState.targets.length;
  const score = VehicleGameState.correct;
  const emojis = ['😢','😅','🙂','😊','🎉','🌟'];
  document.getElementById('vg-result-emoji').textContent = emojis[Math.min(score, 5)];
  document.getElementById('vg-result-msg').textContent =
    score + ' / ' + total + ' correct';

  const detail = VehicleGameState.results.map(r =>
    (r.correct ? '✓ ' : '✗ ') + r.vehicle.emoji + ' ' + r.vehicle.jp + ' (' + r.vehicle.en + ')'
  ).join('<br>');
  document.getElementById('vg-result-detail').innerHTML = detail;
}



