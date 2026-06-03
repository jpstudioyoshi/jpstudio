// ╔══════════════════════════════════════════════════════════════════════════════
// ║ core-kana-drill.js
// ║ Kana word drill — KANA_WORDS data, KanaDrillState, mastery system,
// ║ katakana SRS wrapper, drill logic.
// ║ Depends on: core-foundation.js (Storage, STORAGE_KEYS, state, HIRAGANA/KATAKANA)
// ╚══════════════════════════════════════════════════════════════════════════════

// ── KANA WORD DRILL DATA ────────────────────────────────
const KANA_WORDS = {
  hiragana: [
    // 3-kana
    {kana:'あめ',rom:'ame',en:'rain / candy'},{kana:'いぬ',rom:'inu',en:'dog'},
    {kana:'うみ',rom:'umi',en:'sea'},{kana:'えき',rom:'eki',en:'station'},
    {kana:'おか',rom:'oka',en:'hill'},{kana:'かさ',rom:'kasa',en:'umbrella'},
    {kana:'きじ',rom:'kiji',en:'pheasant'},{kana:'くも',rom:'kumo',en:'cloud/spider'},
    {kana:'けむし',rom:'kemushi',en:'caterpillar'},{kana:'こえ',rom:'koe',en:'voice'},
    {kana:'さけ',rom:'sake',en:'salmon / sake'},{kana:'しお',rom:'shio',en:'salt'},
    {kana:'すし',rom:'sushi',en:'sushi'},{kana:'せみ',rom:'semi',en:'cicada'},
    {kana:'そら',rom:'sora',en:'sky'},{kana:'たこ',rom:'tako',en:'octopus / kite'},
    {kana:'ちず',rom:'chizu',en:'map'},{kana:'つき',rom:'tsuki',en:'moon'},
    {kana:'てら',rom:'tera',en:'temple'},{kana:'とり',rom:'tori',en:'bird'},
    {kana:'なつ',rom:'natsu',en:'summer'},{kana:'にく',rom:'niku',en:'meat'},
    {kana:'ぬの',rom:'nuno',en:'cloth'},{kana:'ねこ',rom:'neko',en:'cat'},
    {kana:'のり',rom:'nori',en:'seaweed'},{kana:'はな',rom:'hana',en:'flower / nose'},
    {kana:'ひと',rom:'hito',en:'person'},{kana:'ふね',rom:'fune',en:'boat'},
    {kana:'へや',rom:'heya',en:'room'},{kana:'ほし',rom:'hoshi',en:'star'},
    {kana:'まち',rom:'machi',en:'town'},{kana:'みず',rom:'mizu',en:'water'},
    {kana:'むし',rom:'mushi',en:'insect'},{kana:'めだか',rom:'medaka',en:'killifish'},
    {kana:'もり',rom:'mori',en:'forest'},{kana:'やま',rom:'yama',en:'mountain'},
    {kana:'ゆき',rom:'yuki',en:'snow'},{kana:'よる',rom:'yoru',en:'night'},
    {kana:'らく',rom:'raku',en:'easy / comfort'},{kana:'りか',rom:'rika',en:'science'},
    {kana:'るす',rom:'rusu',en:'absence'},{kana:'れんが',rom:'renga',en:'brick'},
    {kana:'ろうか',rom:'rouka',en:'corridor'},{kana:'わに',rom:'wani',en:'crocodile'},
    // 4-kana
    {kana:'あさひ',rom:'asahi',en:'morning sun'},{kana:'いもうと',rom:'imouto',en:'younger sister'},
    {kana:'うさぎ',rom:'usagi',en:'rabbit'},{kana:'えんぴつ',rom:'enpitsu',en:'pencil'},
    {kana:'おかし',rom:'okashi',en:'sweets'},{kana:'かがみ',rom:'kagami',en:'mirror'},
    {kana:'きのう',rom:'kinou',en:'yesterday'},{kana:'くるま',rom:'kuruma',en:'car'},
    {kana:'けしごむ',rom:'keshigomu',en:'eraser'},{kana:'こたつ',rom:'kotatsu',en:'heated table'},
    {kana:'さいふ',rom:'saifu',en:'wallet'},{kana:'しんぶん',rom:'shinbun',en:'newspaper'},
    {kana:'すいか',rom:'suika',en:'watermelon'},{kana:'せかい',rom:'sekai',en:'world'},
    {kana:'そうじ',rom:'souji',en:'cleaning'},{kana:'たまご',rom:'tamago',en:'egg'},
    {kana:'ちかてつ',rom:'chikatetsu',en:'subway'},{kana:'つくえ',rom:'tsukue',en:'desk'},
    {kana:'てがみ',rom:'tegami',en:'letter'},{kana:'とけい',rom:'tokei',en:'clock/watch'},
    {kana:'なまえ',rom:'namae',en:'name'},{kana:'にわとり',rom:'niwatori',en:'chicken'},
    {kana:'ねぼう',rom:'nebou',en:'oversleeping'},{kana:'のはら',rom:'nohara',en:'field'},
    {kana:'はなび',rom:'hanabi',en:'fireworks'},{kana:'ひこうき',rom:'hikouki',en:'airplane'},
    {kana:'ふとん',rom:'futon',en:'futon'},{kana:'へいわ',rom:'heiwa',en:'peace'},
    {kana:'ほんだな',rom:'hondana',en:'bookshelf'},{kana:'まくら',rom:'makura',en:'pillow'},
    {kana:'みかん',rom:'mikan',en:'mandarin orange'},{kana:'むすこ',rom:'musuko',en:'son'},
    {kana:'めがね',rom:'megane',en:'glasses'},{kana:'もみじ',rom:'momiji',en:'maple'},
    {kana:'やさい',rom:'yasai',en:'vegetables'},{kana:'ゆうべ',rom:'yuube',en:'last night'},
    {kana:'よなか',rom:'yonaka',en:'midnight'},{kana:'りんご',rom:'ringo',en:'apple'},
    {kana:'るすばん',rom:'rusuban',en:'house-sitting'},{kana:'わたし',rom:'watashi',en:'I/me'}
  ],
  katakana: [
  // Tier 1 — very high frequency (rank 1-50)
  {kana:'コーヒー',rom:'koohii',en:'coffee',freq:1,cat:'food'},
  {kana:'テレビ',rom:'terebi',en:'television',freq:2,cat:'tech'},
  {kana:'ラジオ',rom:'rajio',en:'radio',freq:3,cat:'tech'},
  {kana:'バス',rom:'basu',en:'bus',freq:4,cat:'travel'},
  {kana:'タクシー',rom:'takushii',en:'taxi',freq:5,cat:'travel'},
  {kana:'ホテル',rom:'hoteru',en:'hotel',freq:6,cat:'travel'},
  {kana:'レストラン',rom:'resutoran',en:'restaurant',freq:7,cat:'food'},
  {kana:'スーパー',rom:'suupaa',en:'supermarket',freq:8,cat:'places'},
  {kana:'パン',rom:'pan',en:'bread',freq:9,cat:'food'},
  {kana:'ビール',rom:'biiru',en:'beer',freq:10,cat:'food'},
  {kana:'ワイン',rom:'wain',en:'wine',freq:11,cat:'food'},
  {kana:'ジュース',rom:'juusu',en:'juice',freq:12,cat:'food'},
  {kana:'ケーキ',rom:'keeki',en:'cake',freq:13,cat:'food'},
  {kana:'アイスクリーム',rom:'aisukuriimu',en:'ice cream',freq:14,cat:'food'},
  {kana:'カレー',rom:'karee',en:'curry',freq:15,cat:'food'},
  {kana:'ラーメン',rom:'raamen',en:'ramen',freq:16,cat:'food'},
  {kana:'ピザ',rom:'piza',en:'pizza',freq:17,cat:'food'},
  {kana:'サラダ',rom:'sarada',en:'salad',freq:18,cat:'food'},
  {kana:'スープ',rom:'suupu',en:'soup',freq:19,cat:'food'},
  {kana:'ノート',rom:'nooto',en:'notebook',freq:20,cat:'tech'},
  {kana:'テスト',rom:'tesuto',en:'test',freq:21,cat:'work'},
  {kana:'コンピュータ',rom:'konpyuuta',en:'computer',freq:22,cat:'tech'},
  {kana:'スマホ',rom:'sumaho',en:'smartphone',freq:23,cat:'tech'},
  {kana:'カメラ',rom:'kamera',en:'camera',freq:24,cat:'tech'},
  {kana:'メール',rom:'meeru',en:'email',freq:25,cat:'tech'},
  {kana:'インターネット',rom:'intaanetto',en:'internet',freq:26,cat:'tech'},
  {kana:'ゲーム',rom:'geemu',en:'game',freq:27,cat:'fun'},
  {kana:'ミュージック',rom:'myuujikku',en:'music',freq:28,cat:'fun'},
  {kana:'スポーツ',rom:'supootsu',en:'sports',freq:29,cat:'fun'},
  {kana:'サッカー',rom:'sakkaa',en:'soccer',freq:30,cat:'fun'},
  {kana:'テニス',rom:'tenisu',en:'tennis',freq:31,cat:'fun'},
  {kana:'プール',rom:'puuru',en:'pool',freq:32,cat:'fun'},
  {kana:'ギター',rom:'gitaa',en:'guitar',freq:33,cat:'fun'},
  {kana:'ピアノ',rom:'piano',en:'piano',freq:34,cat:'fun'},
  {kana:'シャツ',rom:'shatsu',en:'shirt',freq:35,cat:'fashion'},
  {kana:'ジャケット',rom:'jaketto',en:'jacket',freq:36,cat:'fashion'},
  {kana:'コート',rom:'kooto',en:'coat',freq:37,cat:'fashion'},
  {kana:'ズボン',rom:'zubon',en:'trousers',freq:38,cat:'fashion'},
  {kana:'ブーツ',rom:'buutsu',en:'boots',freq:39,cat:'fashion'},
  {kana:'バッグ',rom:'baggu',en:'bag',freq:40,cat:'fashion'},
  {kana:'アパート',rom:'apaato',en:'apartment',freq:41,cat:'places'},
  {kana:'エレベーター',rom:'erebeetaa',en:'elevator',freq:42,cat:'places'},
  {kana:'エスカレーター',rom:'esukareetaa',en:'escalator',freq:43,cat:'places'},
  {kana:'トイレ',rom:'toire',en:'toilet',freq:44,cat:'places'},
  {kana:'バイク',rom:'baiku',en:'motorcycle',freq:45,cat:'travel'},
  {kana:'メモ',rom:'memo',en:'memo',freq:46,cat:'work'},
  {kana:'ニュース',rom:'nyuusu',en:'news',freq:47,cat:'tech'},
  {kana:'ドア',rom:'doa',en:'door',freq:48,cat:'places'},
  {kana:'テーブル',rom:'teeburu',en:'table',freq:49,cat:'places'},
  {kana:'ソファ',rom:'sofa',en:'sofa',freq:50,cat:'places'},
  // Tier 2 — high frequency (rank 51-100)
  {kana:'チョコレート',rom:'chokoreeto',en:'chocolate',freq:51,cat:'food'},
  {kana:'アイスコーヒー',rom:'aisukohii',en:'iced coffee',freq:52,cat:'food'},
  {kana:'バナナ',rom:'banana',en:'banana',freq:53,cat:'food'},
  {kana:'オレンジ',rom:'orenji',en:'orange',freq:54,cat:'food'},
  {kana:'トマト',rom:'tomato',en:'tomato',freq:55,cat:'food'},
  {kana:'チーズ',rom:'chiizu',en:'cheese',freq:56,cat:'food'},
  {kana:'バター',rom:'bataa',en:'butter',freq:57,cat:'food'},
  {kana:'ヨーグルト',rom:'yooguruto',en:'yogurt',freq:58,cat:'food'},
  {kana:'サンドイッチ',rom:'sandoicchi',en:'sandwich',freq:59,cat:'food'},
  {kana:'ハンバーガー',rom:'hanbaagaa',en:'hamburger',freq:60,cat:'food'},
  {kana:'フライドポテト',rom:'furaidopoteto',en:'french fries',freq:61,cat:'food'},
  {kana:'アイスティー',rom:'aisutii',en:'iced tea',freq:62,cat:'food'},
  {kana:'ミルク',rom:'miruku',en:'milk',freq:63,cat:'food'},
  {kana:'シュークリーム',rom:'shuukuriimu',en:'cream puff',freq:64,cat:'food'},
  {kana:'プリン',rom:'purin',en:'pudding',freq:65,cat:'food'},
  {kana:'クッキー',rom:'kukkii',en:'cookie',freq:66,cat:'food'},
  {kana:'スカーフ',rom:'sukaafu',en:'scarf',freq:67,cat:'fashion'},
  {kana:'ネクタイ',rom:'nekutai',en:'necktie',freq:68,cat:'fashion'},
  {kana:'スニーカー',rom:'suniikaa',en:'sneakers',freq:69,cat:'fashion'},
  {kana:'サンダル',rom:'sandaru',en:'sandals',freq:70,cat:'fashion'},
  {kana:'ハンドバッグ',rom:'handobaggu',en:'handbag',freq:71,cat:'fashion'},
  {kana:'スーツ',rom:'suutsu',en:'suit',freq:72,cat:'fashion'},
  {kana:'ワンピース',rom:'wanpiisu',en:'dress',freq:73,cat:'fashion'},
  {kana:'セーター',rom:'seetaa',en:'sweater',freq:74,cat:'fashion'},
  {kana:'パジャマ',rom:'pajama',en:'pyjamas',freq:75,cat:'fashion'},
  {kana:'タオル',rom:'taoru',en:'towel',freq:76,cat:'places'},
  {kana:'シャンプー',rom:'shanpuu',en:'shampoo',freq:77,cat:'places'},
  {kana:'クリーム',rom:'kuriimu',en:'cream',freq:78,cat:'food'},
  {kana:'アルバム',rom:'arubamu',en:'album',freq:79,cat:'fun'},
  {kana:'コンサート',rom:'konsaato',en:'concert',freq:80,cat:'fun'},
  {kana:'ドラマ',rom:'dorama',en:'drama',freq:81,cat:'fun'},
  {kana:'アニメ',rom:'anime',en:'anime',freq:82,cat:'fun'},
  {kana:'マンガ',rom:'manga',en:'manga',freq:83,cat:'fun'},
  {kana:'ドキュメンタリー',rom:'dokyumentarii',en:'documentary',freq:84,cat:'fun'},
  {kana:'スタジアム',rom:'sutajiamu',en:'stadium',freq:85,cat:'places'},
  {kana:'バスケットボール',rom:'basukettoboouru',en:'basketball',freq:86,cat:'fun'},
  {kana:'ベースボール',rom:'beesuboouru',en:'baseball',freq:87,cat:'fun'},
  {kana:'ゴルフ',rom:'gorufu',en:'golf',freq:88,cat:'fun'},
  {kana:'スキー',rom:'sukii',en:'skiing',freq:89,cat:'fun'},
  {kana:'ヨガ',rom:'yoga',en:'yoga',freq:90,cat:'fun'},
  {kana:'マラソン',rom:'marason',en:'marathon',freq:91,cat:'fun'},
  {kana:'ジム',rom:'jimu',en:'gym',freq:92,cat:'fun'},
  {kana:'タクシー乗り場',rom:'takushii noriba',en:'taxi stand',freq:93,cat:'travel'},
  {kana:'バスターミナル',rom:'basu taaminaru',en:'bus terminal',freq:94,cat:'travel'},
  {kana:'エアコン',rom:'eakon',en:'air conditioner',freq:95,cat:'tech'},
  {kana:'リモコン',rom:'rimokon',en:'remote control',freq:96,cat:'tech'},
  {kana:'プリンター',rom:'purintaa',en:'printer',freq:97,cat:'tech'},
  {kana:'キーボード',rom:'kiiboodo',en:'keyboard',freq:98,cat:'tech'},
  {kana:'マウス',rom:'mausu',en:'mouse',freq:99,cat:'tech'},
  {kana:'スクリーン',rom:'sukuriin',en:'screen',freq:100,cat:'tech'},
  // Tier 3 — medium frequency (rank 101-150)
  {kana:'アレルギー',rom:'arerugii',en:'allergy',freq:101,cat:'health'},
  {kana:'ウイルス',rom:'uirusu',en:'virus',freq:102,cat:'health'},
  {kana:'ワクチン',rom:'wakuchin',en:'vaccine',freq:103,cat:'health'},
  {kana:'エネルギー',rom:'enerugii',en:'energy',freq:104,cat:'tech'},
  {kana:'リサイクル',rom:'risaikuru',en:'recycling',freq:105,cat:'tech'},
  {kana:'エコ',rom:'eko',en:'eco',freq:106,cat:'tech'},
  {kana:'グローバル',rom:'gurooabaru',en:'global',freq:107,cat:'work'},
  {kana:'システム',rom:'shisutemu',en:'system',freq:108,cat:'tech'},
  {kana:'プログラム',rom:'puroguramu',en:'program',freq:109,cat:'tech'},
  {kana:'データ',rom:'deeta',en:'data',freq:110,cat:'tech'},
  {kana:'ネットワーク',rom:'nettowaaaku',en:'network',freq:111,cat:'tech'},
  {kana:'アプリ',rom:'apuri',en:'app',freq:112,cat:'tech'},
  {kana:'ダウンロード',rom:'daunroodo',en:'download',freq:113,cat:'tech'},
  {kana:'アップロード',rom:'appuroodo',en:'upload',freq:114,cat:'tech'},
  {kana:'パスワード',rom:'pasuwaado',en:'password',freq:115,cat:'tech'},
  {kana:'サービス',rom:'saabisu',en:'service',freq:116,cat:'work'},
  {kana:'ビジネス',rom:'bijinesu',en:'business',freq:117,cat:'work'},
  {kana:'オフィス',rom:'ofisu',en:'office',freq:118,cat:'work'},
  {kana:'ミーティング',rom:'miitingu',en:'meeting',freq:119,cat:'work'},
  {kana:'プレゼン',rom:'purezen',en:'presentation',freq:120,cat:'work'},
  {kana:'スケジュール',rom:'sukejuuru',en:'schedule',freq:121,cat:'work'},
  {kana:'プロジェクト',rom:'purojekuto',en:'project',freq:122,cat:'work'},
  {kana:'チーム',rom:'chiimu',en:'team',freq:123,cat:'work'},
  {kana:'リーダー',rom:'riidaa',en:'leader',freq:124,cat:'work'},
  {kana:'マネージャー',rom:'maneejaa',en:'manager',freq:125,cat:'work'},
  {kana:'スタッフ',rom:'sutaffu',en:'staff',freq:126,cat:'work'},
  {kana:'ボランティア',rom:'borantia',en:'volunteer',freq:127,cat:'work'},
  {kana:'キャンペーン',rom:'kyanpeen',en:'campaign',freq:128,cat:'work'},
  {kana:'イベント',rom:'ibento',en:'event',freq:129,cat:'fun'},
  {kana:'フェスティバル',rom:'fesutibaru',en:'festival',freq:130,cat:'fun'},
  {kana:'パーティー',rom:'paatii',en:'party',freq:131,cat:'fun'},
  {kana:'デート',rom:'deeto',en:'date',freq:132,cat:'fun'},
  {kana:'アドバイス',rom:'adobaisu',en:'advice',freq:133,cat:'work'},
  {kana:'チャンス',rom:'chansu',en:'chance',freq:134,cat:'work'},
  {kana:'リスク',rom:'risuku',en:'risk',freq:135,cat:'work'},
  {kana:'ストレス',rom:'sutoresu',en:'stress',freq:136,cat:'health'},
  {kana:'ケア',rom:'kea',en:'care',freq:137,cat:'health'},
  {kana:'イメージ',rom:'imeeji',en:'image',freq:138,cat:'work'},
  {kana:'スタイル',rom:'sutairu',en:'style',freq:139,cat:'fashion'},
  {kana:'カラー',rom:'karaa',en:'colour',freq:140,cat:'fashion'},
  {kana:'デザイン',rom:'dezain',en:'design',freq:141,cat:'work'},
  {kana:'ブランド',rom:'burando',en:'brand',freq:142,cat:'fashion'},
  {kana:'ファッション',rom:'fasshon',en:'fashion',freq:143,cat:'fashion'},
  {kana:'モデル',rom:'moderu',en:'model',freq:144,cat:'fashion'},
  {kana:'センス',rom:'sensu',en:'sense / taste',freq:145,cat:'fashion'},
  {kana:'レベル',rom:'reberu',en:'level',freq:146,cat:'work'},
  {kana:'スキル',rom:'sukiru',en:'skill',freq:147,cat:'work'},
  {kana:'コース',rom:'koosu',en:'course',freq:148,cat:'work'},
  {kana:'キャリア',rom:'kyaria',en:'career',freq:149,cat:'work'},
  {kana:'チャレンジ',rom:'charenji',en:'challenge',freq:150,cat:'work'},
  // Tier 4 — moderate frequency (rank 151-200)
  {kana:'ハイキング',rom:'haikingu',en:'hiking',freq:151,cat:'travel'},
  {kana:'キャンプ',rom:'kyanpu',en:'camping',freq:152,cat:'travel'},
  {kana:'ピクニック',rom:'pikunikku',en:'picnic',freq:153,cat:'travel'},
  {kana:'ツアー',rom:'tsuaa',en:'tour',freq:154,cat:'travel'},
  {kana:'リゾート',rom:'rizooto',en:'resort',freq:155,cat:'travel'},
  {kana:'ビーチ',rom:'biichi',en:'beach',freq:156,cat:'travel'},
  {kana:'マップ',rom:'mappu',en:'map',freq:157,cat:'travel'},
  {kana:'ガイド',rom:'gaido',en:'guide',freq:158,cat:'travel'},
  {kana:'チケット',rom:'chiketto',en:'ticket',freq:159,cat:'travel'},
  {kana:'パスポート',rom:'pasupooto',en:'passport',freq:160,cat:'travel'},
  {kana:'スーツケース',rom:'suutsukeesu',en:'suitcase',freq:161,cat:'travel'},
  {kana:'フライト',rom:'furaito',en:'flight',freq:162,cat:'travel'},
  {kana:'ターミナル',rom:'taaminaru',en:'terminal',freq:163,cat:'travel'},
  {kana:'チェックイン',rom:'chekkuin',en:'check-in',freq:164,cat:'travel'},
  {kana:'ロビー',rom:'robii',en:'lobby',freq:165,cat:'travel'},
  {kana:'フロント',rom:'furonto',en:'front desk',freq:166,cat:'travel'},
  {kana:'ルームサービス',rom:'ruumusaabisu',en:'room service',freq:167,cat:'travel'},
  {kana:'クレジットカード',rom:'kurejittokaaado',en:'credit card',freq:168,cat:'work'},
  {kana:'レシート',rom:'reshiito',en:'receipt',freq:169,cat:'work'},
  {kana:'ポイント',rom:'pointo',en:'points / point',freq:170,cat:'work'},
  {kana:'セール',rom:'seeru',en:'sale',freq:171,cat:'places'},
  {kana:'ディスカウント',rom:'disukaunto',en:'discount',freq:172,cat:'places'},
  {kana:'クーポン',rom:'kuupon',en:'coupon',freq:173,cat:'places'},
  {kana:'ショッピング',rom:'shoppingu',en:'shopping',freq:174,cat:'places'},
  {kana:'デパート',rom:'depaato',en:'department store',freq:175,cat:'places'},
  {kana:'コンビニ',rom:'konbini',en:'convenience store',freq:176,cat:'places'},
  {kana:'ドラッグストア',rom:'doraggu sutoa',en:'drugstore',freq:177,cat:'health'},
  {kana:'クリニック',rom:'kurinikku',en:'clinic',freq:178,cat:'health'},
  {kana:'ドクター',rom:'dokutaa',en:'doctor',freq:179,cat:'health'},
  {kana:'ナース',rom:'naaasu',en:'nurse',freq:180,cat:'health'},
  {kana:'アンケート',rom:'ankeeto',en:'questionnaire',freq:181,cat:'work'},
  {kana:'フォーム',rom:'foomu',en:'form',freq:182,cat:'work'},
  {kana:'コピー',rom:'kopii',en:'copy',freq:183,cat:'work'},
  {kana:'ファイル',rom:'fairu',en:'file',freq:184,cat:'tech'},
  {kana:'フォルダ',rom:'foruda',en:'folder',freq:185,cat:'tech'},
  {kana:'バックアップ',rom:'bakkuappu',en:'backup',freq:186,cat:'tech'},
  {kana:'ログイン',rom:'roguin',en:'login',freq:187,cat:'tech'},
  {kana:'アカウント',rom:'akaunto',en:'account',freq:188,cat:'tech'},
  {kana:'プロフィール',rom:'purofiiru',en:'profile',freq:189,cat:'tech'},
  {kana:'コメント',rom:'komento',en:'comment',freq:190,cat:'tech'},
  {kana:'シェア',rom:'shea',en:'share',freq:191,cat:'tech'},
  {kana:'フォロー',rom:'foroo',en:'follow',freq:192,cat:'tech'},
  {kana:'ライブ',rom:'raibu',en:'live',freq:193,cat:'fun'},
  {kana:'チャット',rom:'chatto',en:'chat',freq:194,cat:'tech'},
  {kana:'グループ',rom:'guruupu',en:'group',freq:195,cat:'work'},
  {kana:'メッセージ',rom:'messeeji',en:'message',freq:196,cat:'tech'},
  {kana:'ストーリー',rom:'sutoorii',en:'story',freq:197,cat:'fun'},
  {kana:'フィードバック',rom:'fiiidobakku',en:'feedback',freq:198,cat:'work'},
  {kana:'アップデート',rom:'appudeeto',en:'update',freq:199,cat:'tech'},
  {kana:'バージョン',rom:'baajohn',en:'version',freq:200,cat:'tech'}
]
};

// ═══════════════════════════════════════════════════════
// ── Kana Mastery System ──────────────────────────────────────────────────────
const KM = {
  STREAK_NEEDED: 3,
  DECAY_DAYS: 30,

  load() {
    try { return (App.Storage || window.Storage).getJSON(STORAGE_KEYS.KANA_MASTERY, {}); }
    catch(e) { return {}; }
  },

  save(data) { (App.Storage || window.Storage).setJSON(STORAGE_KEYS.KANA_MASTERY, data); },

  getEntry(data, char) {
    if (!data[char]) data[char] = { streak: 0, lastSeen: null };
    return data[char];
  },

  recordCorrect(char) {
    const data = KM.load();
    const e = KM.getEntry(data, char);
    if (e.lastSeen) {
      const days = (Date.now() - new Date(e.lastSeen).getTime()) / 86400000;
      if (days > KM.DECAY_DAYS) e.streak = Math.max(0, e.streak - 1);
    }
    e.streak = Math.min(e.streak + 1, KM.STREAK_NEEDED + 2); // cap to avoid inflation
    e.lastSeen = new Date().toISOString();
    KM.save(data);
  },

  recordWrong(char) {
    const data = KM.load();
    const e = KM.getEntry(data, char);
    e.streak = 0;
    e.lastSeen = new Date().toISOString();
    KM.save(data);
  },

  isMastered(char) {
    const data = KM.load();
    const e = data[char];
    if (!e || e.streak < KM.STREAK_NEEDED) return false;
    if (e.lastSeen) {
      const days = (Date.now() - new Date(e.lastSeen).getTime()) / 86400000;
      if (days > KM.DECAY_DAYS) return false;
    }
    return true;
  },

  // Seed all hiragana as pre-mastered (student already knows them)
  seedHiragana() {
    const data = KM.load();
    let seeded = false;
    if (!data['_hiraganaSeeded']) {
      const now = new Date().toISOString();
      (HIRAGANA || []).filter(k => k).forEach(k => {
        if (!data[k.char]) {
          data[k.char] = { streak: KM.STREAK_NEEDED, lastSeen: now, seeded: true };
          seeded = true;
        }
      });
      data['_hiraganaSeeded'] = true;
      KM.save(data);
    }
    return seeded;
  },

  getMasteryStats(pool) {
    const mastered = pool.filter(k => KM.isMastered(k.char)).length;
    return { mastered, total: pool.length, pct: Math.round(mastered / pool.length * 100) };
  },

  // Daily session
  todayStr() { return new Date().toISOString().slice(0, 10); },

  loadSession() {
    try {
      const s = (App.Storage || window.Storage).getJSON(STORAGE_KEYS.KANA_SESSION, null);
      return (s && s.date === KM.todayStr()) ? s : null;
    } catch(e) { return null; }
  },

  saveSession(s) {
    s.date = KM.todayStr();
    (App.Storage || window.Storage).setJSON(STORAGE_KEYS.KANA_SESSION, s);
  },

  isTodayComplete() {
    const s = KM.loadSession();
    return s && s.completed === true;
  },

  markComplete() {
    const s = KM.loadSession() || {};
    s.completed = true;
    KM.saveSession(s);
    drillLastCompletedWrite('kana');
    try { agentUpdatePresence(); } catch(e) {}
  },

  saveProgress(queue, idx, results, correct, wrong) {
    const s = KM.loadSession() || {};
    s.queue   = queue.map(k => k.char);
    s.idx     = idx;
    s.results = results;
    s.correct = correct;
    s.wrong   = wrong;
    s.completed = false;
    KM.saveSession(s);
  }
};


// KANA DRILL
// ═══════════════════════════════════════════════════════
// ── Kana drill state ─────────────────────────────────────────────────────────
const KanaDrillState = {
  queue:              [],
  idx:                0,
  correctCount:       0,
  wrongCount:         0,
  results:            [],
  currentKana:        null,
  mode:               'katakana',   // 'hiragana' | 'katakana' | 'words'
  advancing:          false,        // true during 700ms auto-advance window
  sessionRun:         0,            // 0 = no session started
  sessionWrong:       {},           // char → wrong count this session
  sessionCorrect:     {},           // char → correct count this session
  basePool:           [],           // original pool for this session
  dakutenEnabled:     true,         // default on
  // Words drill
  wordsChallengeMode: 'kana2en',    // kana2rom | kana2en | en2kana | listen | multi
  wordsCategory:      'all',
  multiChoiceCorrectIdx: 0,
};
let kanaTimerSeconds = 0;
let kanaCardTimer = null;
let kanaCardTimerRevealed = false;


// Session tracking (5 runs)
const KANA_SESSION_RUNS = 5;


// Words drill challenge modes

const WORDS_CATEGORIES = {
  food: '🍜 Food & Drink',
  tech: '💻 Tech',
  travel: '✈️ Travel',
  fashion: '👔 Fashion',
  fun: '🎮 Fun & Sports',
  work: '💼 Work',
  places: '🏠 Places',
  health: '🏥 Health'
};

function setWordsChallengeMode(mode) {
  KanaDrillState.wordsChallengeMode = mode;
  const inputArea = document.querySelector('#panel-kana .answer-area');
  const multiArea = document.getElementById('wordsMultiChoice');
  const hintLabel = null; // audio mode checkbox is always visible
  if (mode === 'multi') {
    if (inputArea) inputArea.style.display = 'none';
    if (multiArea) multiArea.style.display = 'block';
    if (hintLabel) hintLabel.style.display = 'none';
  } else {
    if (inputArea) inputArea.style.display = 'flex';
    if (multiArea) multiArea.style.display = 'none';
    if (hintLabel) hintLabel.style.display = mode === 'listen' ? 'none' : '';
  }
  // Update placeholder based on mode
  const inp = document.getElementById('answerInput');
  if (inp) {
    if (mode === 'kana2rom') inp.placeholder = 'type romaji…';
    else if (mode === 'kana2en') inp.placeholder = 'type English meaning…';
    else if (mode === 'en2kana') inp.placeholder = 'type katakana…';
    else if (mode === 'listen') inp.placeholder = 'type what you hear…';
  }
  if (KanaDrillState.currentKana) nextKana(); // refresh current card
}

function setWordsCategory(cat) {
  KanaDrillState.wordsCategory = cat;
  const label = document.getElementById('wordsCategoryLabel');
  if (cat === 'all') {
    if (label) label.style.display = 'none';
  } else {
    if (label) {
      label.textContent = `Category: ${WORDS_CATEGORIES[cat] || cat}`;
      label.style.display = 'block';
    }
  }
  initKanaDrill(); // restart with new category
}

function checkMultiChoice(idx) {
  if (kanaCardTimerRevealed) return;
  kanaCardTimerRevealed = true;
  const btns = document.querySelectorAll('.multi-choice-btn');
  const correct = idx === KanaDrillState.multiChoiceCorrectIdx;
  
  btns.forEach((btn, i) => {
    if (i === KanaDrillState.multiChoiceCorrectIdx) {
      btn.style.borderColor = 'var(--teal)';
      btn.style.background = 'rgba(48,213,200,0.15)';
    } else if (i === idx && !correct) {
      btn.style.borderColor = 'var(--red)';
      btn.style.background = 'rgba(255,107,107,0.15)';
    }
    btn.disabled = true;
  });
  
  const charEl = document.getElementById('drillChar');
  const fbEl = document.getElementById('feedbackMsg');
  
  if (!state.kanaScores[KanaDrillState.currentKana.char]) state.kanaScores[KanaDrillState.currentKana.char] = {correct:0, wrong:0};
  
  if (correct) {
    state.kanaScores[KanaDrillState.currentKana.char].correct++;
    if (KanaDrillState.sessionRun > 0) KanaDrillState.sessionCorrect[KanaDrillState.currentKana.char] = (KanaDrillState.sessionCorrect[KanaDrillState.currentKana.char] || 0) + 1;
    KanaDrillState.correctCount++;
    KanaDrillState.results[KanaDrillState.idx] = 'correct';
    charEl.classList.add('correct');
    fbEl.textContent = '✓ Correct!';
    fbEl.className = 'feedback-msg correct';
    wSrsRecord(KanaDrillState.currentKana.char, true);
    if (KanaDrillState.mode !== 'words') KM.recordCorrect(KanaDrillState.currentKana.char);
  } else {
    state.kanaScores[KanaDrillState.currentKana.char].wrong++;
    if (KanaDrillState.sessionRun > 0) KanaDrillState.sessionWrong[KanaDrillState.currentKana.char] = (KanaDrillState.sessionWrong[KanaDrillState.currentKana.char] || 0) + 1;
    KanaDrillState.wrongCount++;
    KanaDrillState.results[KanaDrillState.idx] = 'wrong';
    charEl.classList.add('wrong');
    fbEl.textContent = '✗ ' + KanaDrillState.currentKana.char + ' = ' + KanaDrillState.currentKana.word;
    fbEl.className = 'feedback-msg wrong';
    KanaDrillState.queue.push(KanaDrillState.currentKana);
    KanaDrillState.results.push('pending');
    wSrsRecord(KanaDrillState.currentKana.char, false);
    if (KanaDrillState.mode !== 'words') KM.recordWrong(KanaDrillState.currentKana.char);
  }

  // Save daily session progress
  if (KanaDrillState.mode !== 'words') {
    KM.saveProgress(KanaDrillState.queue, KanaDrillState.idx, KanaDrillState.results, KanaDrillState.correctCount, KanaDrillState.wrongCount);
  } else {
    WS.saveProgress(KanaDrillState.queue, KanaDrillState.idx, KanaDrillState.results, KanaDrillState.correctCount, KanaDrillState.wrongCount);
  }

  if (typeof window !== 'undefined' && window.db) {
    const _ts = new Date().toISOString();
    const _char = KanaDrillState.currentKana.char;
    const _mode = KanaDrillState.mode || 'kana';
    window.db.run(
      'INSERT INTO drill_results (created_at, drill_type, item_key, correct, response_ms) VALUES (?,?,?,?,?)',
      [_ts, 'kana', _char, correct ? 1 : 0, null]
    ).catch(() => {});
    window.db.run(
      'INSERT INTO learning_events (created_at, panel, event_type, payload) VALUES (?,?,?,?)',
      [_ts, 'kana', 'drill:answer', JSON.stringify({ char: _char, reading: KanaDrillState.currentKana.word, mode: _mode, correct })]
    ).catch(() => {});
  try { (App.StudentModel || window.StudentModel)?.invalidate(); } catch(e) {}
  }
  saveState(); updateDrillStats(); renderDrillProgress();
  document.getElementById('skipKanaBtn').textContent = 'Next →';
}

function setKanaTimer(s) { kanaTimerSeconds = parseInt(s); }
function kanaToggleHint() {
  const show = true; // hint always shown
  const hint = document.getElementById('kanaWordHint');
  if (hint) hint.style.visibility = show ? 'visible' : 'hidden';
}

function setKanaMode(mode) {
  const _timerRow    = document.getElementById('kanaTimerRow');
  const _strokeInRow = document.getElementById('kanaStrokeInputRow');
  const _dc  = document.querySelector('#panel-kana .drill-container');
  const _hr  = document.querySelector('#panel-kana hr');
  const _kg  = document.getElementById('kanaGrid');
  const _sp  = document.getElementById('kanaStrokesPanel');
  const _pl  = document.getElementById('kanaProgressLabel');
  const _wo  = document.getElementById('wordsDrillOptions');
  if (mode === 'strokes') {
    if (_dc)  _dc.style.display  = 'none';
    if (_hr)  _hr.style.display  = 'none';
    if (_kg)  _kg.style.display  = 'none';
    if (_pl)  _pl.style.display  = 'none';
    if (_sp)  _sp.style.display  = 'block';
    if (_wo)  _wo.style.display  = 'none';
    if (_timerRow)    _timerRow.style.display    = 'none';
    if (_strokeInRow) { _strokeInRow.style.display = 'flex'; }
    const slot = document.getElementById('kanaRightSlot');
    if (slot) slot.style.height = 'auto';
    document.querySelectorAll('#panel-kana .mode-btn').forEach(b => b.classList.toggle('active', b.getAttribute('onclick').includes("'strokes'")));
    setTimeout(strokePanelInit, 50);
    return;
  }
  // Hide strokes panel, restore drill UI
  if (_sp)  _sp.style.display  = 'none';
  if (_dc)  _dc.style.display  = '';
  if (_hr)  _hr.style.display  = '';
  if (_kg)  _kg.style.display  = (mode === 'words') ? 'none' : '';
  if (_pl)  _pl.style.display  = '';
  if (_wo)  _wo.style.display  = (mode === 'words') ? 'block' : 'none';
  if (_timerRow)    _timerRow.style.display    = '';
  if (_strokeInRow) _strokeInRow.style.display = 'none';
  const slot = document.getElementById('kanaRightSlot');
  if (slot) slot.style.height = '36px';

  // Reset challenge mode UI when entering words mode
  if (mode === 'words') {
    const inputArea = document.querySelector('#panel-kana .answer-area');
    const multiArea = document.getElementById('wordsMultiChoice');
    if (KanaDrillState.wordsChallengeMode === 'multi') {
      if (inputArea) inputArea.style.display = 'none';
      if (multiArea) multiArea.style.display = 'block';
    } else {
      if (inputArea) inputArea.style.display = 'flex';
      if (multiArea) multiArea.style.display = 'none';
    }
  } else {
    // Not words mode - ensure normal input area visible
    const inputArea = document.querySelector('#panel-kana .answer-area');
    const multiArea = document.getElementById('wordsMultiChoice');
    if (inputArea) inputArea.style.display = 'flex';
    if (multiArea) multiArea.style.display = 'none';
  }

  KanaDrillState.mode = mode;
  document.querySelectorAll('#panel-kana .mode-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('onclick').includes("'" + mode + "'"));
  });
  // Clear stale char immediately so old mode char doesn't show on first card
  const _modeCharEl = document.getElementById('drillChar');
  if (_modeCharEl) { _modeCharEl.textContent = '…'; _modeCharEl.className = 'drill-char'; }
  // Show dakuten checkbox only in katakana mode
  const dakutenLabel = document.getElementById('kanaDakutenLabel');
  if (dakutenLabel) {
    dakutenLabel.style.display = (mode === 'katakana') ? 'flex' : 'none';
  }
  // Timer always visible except strokes (handled above)
  // Show grid toggle button only in words mode
  const _gtBtn = document.getElementById('kanaGridToggleBtn');
  if (_gtBtn) {
    _gtBtn.style.display = (mode === 'words') ? '' : 'none';
    _gtBtn.textContent = 'Show grid';
  }
  // Hide grid by default in words mode
  const _kg2 = document.getElementById('kanaGrid');
  if (_kg2 && mode === 'words') _kg2.style.display = 'none';
  initKanaDrill();
}



function toggleKanaDakuten() {
  KanaDrillState.dakutenEnabled = document.getElementById('kanaDakutenCheck')?.checked || false;
  initKanaDrill(); // restart with new pool
}



// ═══════════════════════════════════════════════════════════════════════════

// ── App registry ─────────────────────────────────────────
try {
  Object.assign(App, {
    KANA_WORDS,
    KM,
    KanaDrillState,
    setWordsChallengeMode,
    setWordsCategory,
    checkMultiChoice,
    setKanaTimer,
    kanaToggleHint,
    setKanaMode,
    toggleKanaDakuten,
  });
  window['toggleKanaDakuten']= toggleKanaDakuten;
} catch(e) { console.error('[core-kana-drill] App registry failed:', e); }
