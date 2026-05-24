// ═══════════════════════════════════════════════════════
// FEATURES-VOICE-DRILL
// Sentence drill subtab for the voice/conversation panel.
// Modes: English → speak Japanese  |  Japanese → repeat
// Uses TTS (jpSpeak) for output, Whisper STT for input.
// ═══════════════════════════════════════════════════════

// ── Data ────────────────────────────────────────────────
// Inline corpus — social + appointment sentences.
// Transcript sentences loaded from Storage if available.
// Structural rating (1-3) left at 0 until Claude pass runs.

const DRILL_SOCIAL = [
  // greetings
  {id:1000,source:"社会基本",jp:"こんにちは。",en:"Hello.",cluster:"greetings",social:3,structural:2,weight:2.15},
  {id:1001,source:"社会基本",jp:"おはようございます。",en:"Good morning.",cluster:"greetings",social:3,structural:2,weight:2.15},
  {id:1002,source:"社会基本",jp:"こんばんは。",en:"Good evening.",cluster:"greetings",social:3,structural:2,weight:2.15},
  {id:1003,source:"社会基本",jp:"おやすみなさい。",en:"Good night.",cluster:"greetings",social:3,structural:2,weight:2.15},
  {id:1004,source:"社会基本",jp:"さようなら。",en:"Goodbye.",cluster:"greetings",social:3,structural:2,weight:2.15},
  {id:1005,source:"社会基本",jp:"またね。",en:"See you.",cluster:"greetings",social:3,structural:2,weight:2.15},
  {id:1006,source:"社会基本",jp:"じゃあね。",en:"Bye then.",cluster:"greetings",social:3,structural:2,weight:2.15},
  {id:1007,source:"社会基本",jp:"またあとで。",en:"See you later.",cluster:"greetings",social:3,structural:2,weight:2.15},
  {id:1008,source:"社会基本",jp:"いってきます。",en:"I'm heading out.",cluster:"greetings",social:3,structural:2,weight:2.15},
  {id:1009,source:"社会基本",jp:"いってらっしゃい。",en:"Take care / off you go.",cluster:"greetings",social:3,structural:2,weight:2.15},
  {id:1010,source:"社会基本",jp:"ただいま。",en:"I'm home.",cluster:"greetings",social:3,structural:2,weight:2.15},
  {id:1011,source:"社会基本",jp:"おかえり。",en:"Welcome back.",cluster:"greetings",social:3,structural:2,weight:2.15},
  {id:1012,source:"社会基本",jp:"お元気ですか？",en:"How are you?",cluster:"greetings",social:3,structural:2,weight:2.15},
  {id:1013,source:"社会基本",jp:"元気です。ありがとうございます。",en:"I'm fine, thank you.",cluster:"greetings",social:3,structural:1,weight:1.9},
  {id:1014,source:"社会基本",jp:"久しぶりですね。",en:"It's been a while.",cluster:"greetings",social:3,structural:2,weight:2.15},
  {id:1015,source:"社会基本",jp:"お疲れ様です。",en:"Good work / thanks for your effort.",cluster:"greetings",social:3,structural:2,weight:2.15},
  {id:1016,source:"社会基本",jp:"よいお年を。",en:"Happy New Year (before).",cluster:"greetings",social:3,structural:2,weight:1.9},
  {id:1017,source:"社会基本",jp:"あけましておめでとうございます。",en:"Happy New Year (after).",cluster:"greetings",social:3,structural:1,weight:1.9},
  // social lubricant
  {id:1018,source:"社会基本",jp:"すみません。",en:"Excuse me / I'm sorry.",cluster:"social_lubricant",social:3,structural:2,weight:2.15},
  {id:1019,source:"社会基本",jp:"ごめんなさい。",en:"I'm sorry.",cluster:"social_lubricant",social:3,structural:2,weight:2.15},
  {id:1020,source:"社会基本",jp:"申し訳ありません。",en:"I sincerely apologize.",cluster:"social_lubricant",social:3,structural:2,weight:1.9},
  {id:1021,source:"社会基本",jp:"大丈夫です。",en:"It's fine / I'm okay.",cluster:"social_lubricant",social:3,structural:2,weight:2.15},
  {id:1022,source:"社会基本",jp:"気にしないでください。",en:"Please don't worry about it.",cluster:"social_lubricant",social:3,structural:2,weight:1.9},
  {id:1023,source:"社会基本",jp:"どういたしまして。",en:"You're welcome.",cluster:"social_lubricant",social:3,structural:2,weight:2.15},
  {id:1024,source:"社会基本",jp:"失礼します。",en:"Excuse me / pardon me.",cluster:"social_lubricant",social:3,structural:2,weight:2.15},
  {id:1025,source:"社会基本",jp:"お邪魔します。",en:"Sorry to intrude.",cluster:"social_lubricant",social:3,structural:2,weight:1.9},
  {id:1026,source:"社会基本",jp:"よろしくお願いします。",en:"Please treat me well / I'm counting on you.",cluster:"social_lubricant",social:3,structural:2,weight:2.15},
  {id:1027,source:"社会基本",jp:"お願いします。",en:"Please.",cluster:"social_lubricant",social:3,structural:2,weight:2.15},
  {id:1028,source:"社会基本",jp:"ちょっと待ってください。",en:"Please wait a moment.",cluster:"social_lubricant",social:3,structural:2,weight:2.15},
  {id:1029,source:"社会基本",jp:"はい、わかりました。",en:"Yes, understood.",cluster:"social_lubricant",social:3,structural:2,weight:2.15},
  {id:1030,source:"社会基本",jp:"そうですね。",en:"That's right / I see.",cluster:"social_lubricant",social:3,structural:2,weight:2.15},
  {id:1031,source:"社会基本",jp:"なるほど。",en:"I see / that makes sense.",cluster:"social_lubricant",social:3,structural:2,weight:2.15},
  // introductions
  {id:1032,source:"社会基本",jp:"はじめまして。",en:"Nice to meet you.",cluster:"introductions",social:3,structural:2,weight:2.15},
  {id:1033,source:"社会基本",jp:"私は〜です。",en:"I am ~.",cluster:"introductions",social:2,structural:3,weight:1.85},
  {id:1034,source:"社会基本",jp:"〜と申します。",en:"My name is ~ (formal).",cluster:"introductions",social:2,structural:3,weight:1.85},
  {id:1035,source:"社会基本",jp:"〜から来ました。",en:"I come from ~.",cluster:"introductions",social:2,structural:3,weight:1.85},
  {id:1036,source:"社会基本",jp:"〜に住んでいます。",en:"I live in ~.",cluster:"introductions",social:2,structural:3,weight:1.85},
  {id:1037,source:"社会基本",jp:"趣味は〜です。",en:"My hobby is ~.",cluster:"introductions",social:2,structural:3,weight:1.85},
  {id:1038,source:"社会基本",jp:"日本語を勉強しています。",en:"I am studying Japanese.",cluster:"introductions",social:2,structural:2,weight:1.7},
  {id:1039,source:"社会基本",jp:"どうぞよろしくお願いします。",en:"I look forward to working with you.",cluster:"introductions",social:3,structural:2,weight:2.0},
  {id:1040,source:"社会基本",jp:"お名前は何ですか？",en:"What is your name?",cluster:"introductions",social:2,structural:2,weight:1.7},
  {id:1041,source:"社会基本",jp:"どちらからいらっしゃいますか？",en:"Where are you from?",cluster:"introductions",social:2,structural:2,weight:1.6},
  {id:1042,source:"社会基本",jp:"仕事は〜です。",en:"My job is ~.",cluster:"introductions",social:2,structural:3,weight:1.85},
  {id:1043,source:"社会基本",jp:"お仕事は何をされていますか？",en:"What do you do for work?",cluster:"introductions",social:2,structural:2,weight:1.6},
  // gratitude
  {id:1044,source:"社会基本",jp:"ありがとうございます。",en:"Thank you.",cluster:"gratitude",social:3,structural:2,weight:2.15},
  {id:1045,source:"社会基本",jp:"ありがとうございました。",en:"Thank you (for what you did).",cluster:"gratitude",social:3,structural:2,weight:2.15},
  {id:1046,source:"社会基本",jp:"どうもありがとうございます。",en:"Thank you very much.",cluster:"gratitude",social:3,structural:2,weight:2.0},
  {id:1047,source:"社会基本",jp:"本当にありがとうございます。",en:"Thank you so much.",cluster:"gratitude",social:3,structural:2,weight:2.0},
  {id:1048,source:"社会基本",jp:"おかげさまで。",en:"Thanks to you.",cluster:"gratitude",social:3,structural:2,weight:1.9},
  {id:1049,source:"社会基本",jp:"助かりました。",en:"You really helped me.",cluster:"gratitude",social:3,structural:2,weight:1.9},
  {id:1050,source:"社会基本",jp:"ご親切にありがとうございます。",en:"Thank you for your kindness.",cluster:"gratitude",social:3,structural:2,weight:1.8},
  {id:1051,source:"社会基本",jp:"わざわざありがとうございます。",en:"Thank you for going out of your way.",cluster:"gratitude",social:3,structural:2,weight:1.8},
  {id:1052,source:"社会基本",jp:"いつもありがとうございます。",en:"Thank you as always.",cluster:"gratitude",social:3,structural:2,weight:1.9},
  {id:1053,source:"社会基本",jp:"先ほどはありがとうございました。",en:"Thank you for earlier.",cluster:"gratitude",social:3,structural:2,weight:1.8},
  // interaction / clarification
  {id:1054,source:"社会基本",jp:"もう一度言ってください。",en:"Please say that again.",cluster:"interaction",social:2,structural:2,weight:1.8},
  {id:1055,source:"社会基本",jp:"ゆっくり話してください。",en:"Please speak slowly.",cluster:"interaction",social:2,structural:2,weight:1.8},
  {id:1056,source:"社会基本",jp:"わかりません。",en:"I don't understand.",cluster:"interaction",social:2,structural:2,weight:1.8},
  {id:1057,source:"社会基本",jp:"わかりました。",en:"I understand.",cluster:"interaction",social:2,structural:2,weight:1.8},
  {id:1058,source:"社会基本",jp:"〜はどういう意味ですか？",en:"What does ~ mean?",cluster:"interaction",social:2,structural:3,weight:1.9},
  {id:1059,source:"社会基本",jp:"日本語で何と言いますか？",en:"How do you say it in Japanese?",cluster:"interaction",social:2,structural:2,weight:1.7},
  {id:1060,source:"社会基本",jp:"書いてもらえますか？",en:"Could you write it down?",cluster:"interaction",social:2,structural:2,weight:1.7},
  {id:1061,source:"社会基本",jp:"日本語が少しわかります。",en:"I understand a little Japanese.",cluster:"interaction",social:2,structural:2,weight:1.6},
  {id:1062,source:"社会基本",jp:"日本語はまだあまり上手じゃないです。",en:"My Japanese isn't very good yet.",cluster:"interaction",social:2,structural:1,weight:1.5},
  {id:1063,source:"社会基本",jp:"ちょっとわかりにくいです。",en:"That's a little hard to understand.",cluster:"interaction",social:2,structural:2,weight:1.6},
  {id:1064,source:"社会基本",jp:"もう少し詳しく教えてもらえますか？",en:"Could you explain in more detail?",cluster:"interaction",social:2,structural:2,weight:1.6},
  {id:1065,source:"社会基本",jp:"〜について教えてください。",en:"Please tell me about ~.",cluster:"interaction",social:2,structural:3,weight:1.85},
  {id:1066,source:"社会基本",jp:"どこですか？",en:"Where is it?",cluster:"interaction",social:2,structural:2,weight:1.7},
  {id:1067,source:"社会基本",jp:"〜はどこにありますか？",en:"Where is ~?",cluster:"interaction",social:2,structural:3,weight:1.85},
  {id:1068,source:"社会基本",jp:"トイレはどこですか？",en:"Where is the toilet?",cluster:"interaction",social:2,structural:1,weight:1.6},
  {id:1069,source:"社会基本",jp:"どうやって行きますか？",en:"How do I get there?",cluster:"interaction",social:2,structural:2,weight:1.7},
  {id:1070,source:"社会基本",jp:"ちょっといいですか？",en:"Do you have a moment?",cluster:"interaction",social:2,structural:2,weight:1.7},
  {id:1071,source:"社会基本",jp:"英語で言うと何ですか？",en:"How do you say it in English?",cluster:"interaction",social:2,structural:2,weight:1.6},
  {id:1072,source:"社会基本",jp:"〜はどう読みますか？",en:"How do you read ~?",cluster:"interaction",social:2,structural:3,weight:1.85},
  {id:1073,source:"社会基本",jp:"いつですか？",en:"When is it?",cluster:"interaction",social:1,structural:2,weight:1.35},
  {id:1074,source:"社会基本",jp:"誰ですか？",en:"Who is it?",cluster:"interaction",social:1,structural:2,weight:1.35},
  // transactional
  {id:1075,source:"社会基本",jp:"いくらですか？",en:"How much is it?",cluster:"transactional",social:1,structural:2,weight:1.25},
  {id:1076,source:"社会基本",jp:"〜をください。",en:"Please give me ~.",cluster:"transactional",social:1,structural:3,weight:1.35},
  {id:1077,source:"社会基本",jp:"〜はありますか？",en:"Do you have ~?",cluster:"transactional",social:1,structural:3,weight:1.35},
  {id:1078,source:"社会基本",jp:"これをひとつください。",en:"One of these please.",cluster:"transactional",social:1,structural:1,weight:1.15},
  {id:1079,source:"社会基本",jp:"メニューをください。",en:"The menu please.",cluster:"transactional",social:1,structural:1,weight:1.15},
  {id:1080,source:"社会基本",jp:"〜をひとつお願いします。",en:"One ~ please.",cluster:"transactional",social:1,structural:3,weight:1.35},
  {id:1081,source:"社会基本",jp:"お会計をお願いします。",en:"The bill please.",cluster:"transactional",social:1,structural:2,weight:1.25},
  {id:1082,source:"社会基本",jp:"カードで払えますか？",en:"Can I pay by card?",cluster:"transactional",social:1,structural:2,weight:1.25},
  {id:1083,source:"社会基本",jp:"現金で払います。",en:"I'll pay cash.",cluster:"transactional",social:1,structural:2,weight:1.15},
  {id:1084,source:"社会基本",jp:"袋はいりません。",en:"I don't need a bag.",cluster:"transactional",social:1,structural:1,weight:1.05},
  {id:1085,source:"社会基本",jp:"〜まで一枚ください。",en:"One ticket to ~ please.",cluster:"transactional",social:1,structural:3,weight:1.35},
  {id:1086,source:"社会基本",jp:"〜行きのバスはありますか？",en:"Is there a bus to ~?",cluster:"transactional",social:1,structural:3,weight:1.35},
  {id:1087,source:"社会基本",jp:"次の電車は何時ですか？",en:"What time is the next train?",cluster:"transactional",social:1,structural:2,weight:1.25},
  {id:1088,source:"社会基本",jp:"〜まで何分かかりますか？",en:"How many minutes to ~?",cluster:"transactional",social:1,structural:3,weight:1.35},
  {id:1089,source:"社会基本",jp:"ここで降ります。",en:"I'll get off here.",cluster:"transactional",social:1,structural:1,weight:1.05},
  {id:1090,source:"社会基本",jp:"予約したいんですが。",en:"I'd like to make a reservation.",cluster:"transactional",social:1,structural:2,weight:1.25},
  {id:1091,source:"社会基本",jp:"〜時に予約をお願いします。",en:"A reservation for ~ o'clock please.",cluster:"transactional",social:1,structural:3,weight:1.35},
  {id:1092,source:"社会基本",jp:"〜人で予約したいです。",en:"I'd like to reserve for ~ people.",cluster:"transactional",social:1,structural:3,weight:1.35},
  {id:1093,source:"社会基本",jp:"これはおすすめですか？",en:"Do you recommend this?",cluster:"transactional",social:1,structural:2,weight:1.2},
  {id:1094,source:"社会基本",jp:"辛いですか？",en:"Is it spicy?",cluster:"transactional",social:1,structural:2,weight:1.15},
  {id:1095,source:"社会基本",jp:"アレルギーがあります。",en:"I have an allergy.",cluster:"transactional",social:1,structural:1,weight:1.05},
  {id:1096,source:"社会基本",jp:"写真を撮ってもいいですか？",en:"May I take a photo?",cluster:"transactional",social:1,structural:2,weight:1.2},
  {id:1097,source:"社会基本",jp:"一緒に写真を撮ってもいいですか？",en:"May I take a photo with you?",cluster:"transactional",social:1,structural:1,weight:1.1},
  // appointment / scheduling — fully formed sentences, no slots
  {id:2000,source:"予約・スケジュール",jp:"次のレッスンはいつにしましょうか？",en:"When shall we schedule the next lesson?",cluster:"appointment",social:2,structural:2,weight:0.75},
  {id:2001,source:"予約・スケジュール",jp:"来週の火曜日はいかがですか？",en:"How about next Tuesday?",cluster:"appointment",social:2,structural:2,weight:0.75},
  {id:2002,source:"予約・スケジュール",jp:"水曜日の三時はいかがですか？",en:"How about three o'clock on Wednesday?",cluster:"appointment",social:2,structural:2,weight:0.75},
  {id:2003,source:"予約・スケジュール",jp:"来週はご都合はいかがですか？",en:"How is your availability next week?",cluster:"appointment",social:2,structural:2,weight:0.75},
  {id:2004,source:"予約・スケジュール",jp:"その日は都合が悪いです。",en:"That day doesn't work for me.",cluster:"appointment",social:2,structural:2,weight:0.75},
  {id:2005,source:"予約・スケジュール",jp:"その時間は大丈夫です。",en:"That time works for me.",cluster:"appointment",social:2,structural:2,weight:0.75},
  {id:2006,source:"予約・スケジュール",jp:"二時から四時の間はいかがですか？",en:"How about sometime between two and four?",cluster:"appointment",social:2,structural:2,weight:0.75},
  {id:2007,source:"予約・スケジュール",jp:"もう少し早い時間はできますか？",en:"Could we do a slightly earlier time?",cluster:"appointment",social:2,structural:2,weight:0.75},
  {id:2008,source:"予約・スケジュール",jp:"もう少し遅い時間はできますか？",en:"Could we do a slightly later time?",cluster:"appointment",social:2,structural:2,weight:0.75},
  {id:2009,source:"予約・スケジュール",jp:"何時がご都合よろしいですか？",en:"What time suits you best?",cluster:"appointment",social:2,structural:2,weight:0.75},
  {id:2010,source:"予約・スケジュール",jp:"では木曜日の午後二時に決めましょう。",en:"Then let's fix it for two o'clock Thursday afternoon.",cluster:"appointment",social:2,structural:2,weight:0.75},
  {id:2011,source:"予約・スケジュール",jp:"金曜日の三時でよろしいですか？",en:"Is three o'clock Friday alright?",cluster:"appointment",social:2,structural:2,weight:0.75},
  {id:2012,source:"予約・スケジュール",jp:"確認をよろしくお願いします。",en:"Please confirm when you can.",cluster:"appointment",social:2,structural:2,weight:0.75},
  {id:2013,source:"予約・スケジュール",jp:"ご確認ありがとうございます。",en:"Thank you for confirming.",cluster:"appointment",social:2,structural:2,weight:0.75},
  {id:2014,source:"予約・スケジュール",jp:"では、その日にお会いしましょう。",en:"Great, let's meet on that day then.",cluster:"appointment",social:2,structural:2,weight:0.75},
  {id:2015,source:"予約・スケジュール",jp:"来週はお休みしたいんですが。",en:"I'd like to take next week off.",cluster:"appointment",social:2,structural:2,weight:0.75},
  {id:2016,source:"予約・スケジュール",jp:"申し訳ありませんが、キャンセルしたいです。",en:"I'm sorry, but I'd like to cancel.",cluster:"appointment",social:2,structural:2,weight:0.75},
  {id:2017,source:"予約・スケジュール",jp:"日程を変更してもいいですか？",en:"Would it be okay to change the date?",cluster:"appointment",social:2,structural:2,weight:0.75},
  {id:2018,source:"予約・スケジュール",jp:"別の日に変更できますか？",en:"Can we change to a different day?",cluster:"appointment",social:2,structural:2,weight:0.75},
  {id:2019,source:"予約・スケジュール",jp:"今日はここまでにしましょう。",en:"Let's leave it here for today.",cluster:"appointment",social:2,structural:2,weight:0.75},
  {id:2020,source:"予約・スケジュール",jp:"今日のレッスンはいかがでしたか？",en:"How was today's lesson?",cluster:"appointment",social:2,structural:2,weight:0.75},
  {id:2021,source:"予約・スケジュール",jp:"次回は発音を練習しましょう。",en:"Next time let's practice pronunciation.",cluster:"appointment",social:2,structural:2,weight:0.75},
  {id:2022,source:"予約・スケジュール",jp:"宿題はありますか？",en:"Is there any homework?",cluster:"appointment",social:2,structural:2,weight:0.75},
  {id:2023,source:"予約・スケジュール",jp:"わからないことがあったら聞いてください。",en:"Please ask if there's anything you don't understand.",cluster:"appointment",social:2,structural:2,weight:0.75},
  {id:2024,source:"予約・スケジュール",jp:"今日もありがとうございました。",en:"Thank you for today as well.",cluster:"appointment",social:2,structural:2,weight:0.75},
];

// ── State ────────────────────────────────────────────────
const VoiceDrill = {
  deck:        [],
  pos:         0,
  scores:      {},   // id → 'again'|'ok'|'known'
  mode:        'en-to-jp',   // or 'jp-repeat'
  cluster:     '',
  recording:   false,
  _mediaRec:   null,
  _chunks:     [],
  // custom tab
  customDeck:  [],
  customPos:   0,
  customRec:   false,
  _customRec:  null,
  _customChunks: [],
};

// ── Subtab switching ─────────────────────────────────────
function voiceSubSwitch(tab) {
  // Fix 2: stop drill recording if leaving drill tab
  if (tab !== 'drill' && VoiceDrill.recording) drillStopRecord();
  if (tab !== 'custom' && VoiceDrill.customRec) customStopRecord();

  ['conv','drill','custom'].forEach(t => {
    document.getElementById('voice-sub-' + t).style.display = t === tab ? '' : 'none';
    document.getElementById('voice-sub-btn-' + t).classList.toggle('active', t === tab);
  });
  if (tab === 'drill')  drillInit();
  if (tab === 'custom') (App.cdTabInit || window.cdTabInit)?.();
}

// ── Drill initialisation ─────────────────────────────────
function drillInit() {
  drillApplyFilter();
}

function drillApplyFilter() {
  const cluster = document.getElementById('drillClusterSel').value;
  VoiceDrill.mode    = document.getElementById('drillModeSel').value;
  VoiceDrill.cluster = cluster;

  VoiceDrill.deck = DRILL_SOCIAL.filter(s => !cluster || s.cluster === cluster)
    .sort((a, b) => b.weight - a.weight);

  VoiceDrill.pos = 0;
  drillShowCard();
}

function drillShowCard() {
  const deck = VoiceDrill.deck;
  const pos  = VoiceDrill.pos;

  document.getElementById('drillCounter').textContent =
    deck.length ? `${pos + 1} / ${deck.length}` : '—';

  const bar = document.getElementById('drillProgBar');
  bar.style.width = deck.length ? Math.round(((pos + 1) / deck.length) * 100) + '%' : '0%';

  if (!deck.length) {
    document.getElementById('drillPrompt').textContent = 'No sentences match.';
    document.getElementById('drillJp').style.display = 'none';
    document.getElementById('drillHearBtn').style.display = 'none';
    document.getElementById('drillResult').style.display = 'none';
    return;
  }

  const s = deck[pos];
  const isEnMode = VoiceDrill.mode === 'en-to-jp';

  const prompt = document.getElementById('drillPrompt');
  const jpEl   = document.getElementById('drillJp');
  const hearBtn = document.getElementById('drillHearBtn');
  const result  = document.getElementById('drillResult');

  result.style.display = 'none';
  document.getElementById('drillStatus').textContent = '';

  if (isEnMode) {
    // Show English, hide Japanese until spoken
    prompt.textContent = s.en;
    jpEl.textContent   = s.jp;
    jpEl.style.display = 'none';
    hearBtn.style.display = 'none';
  } else {
    // Show Japanese, speak it automatically
    prompt.textContent = '';
    jpEl.textContent   = s.jp;
    jpEl.style.display = '';
    hearBtn.style.display = '';
    setTimeout(() => drillSpeak(), 400);
  }

  // Cluster badge
  const src = document.getElementById('drillPrompt');
  src.setAttribute('title', s.source + ' · ' + s.cluster);
}

function drillSpeak() {
  const s = VoiceDrill.deck[VoiceDrill.pos];
  if (!s) return;
  // Strip slot markers for TTS
  const clean = s.jp.replace(/〜/g, '');
  const _jpSpeak = App.jpSpeak || window.jpSpeak;
  if (_jpSpeak) _jpSpeak(clean, 0.85);
}

function drillNext() {
  if (VoiceDrill.pos < VoiceDrill.deck.length - 1) VoiceDrill.pos++;
  else VoiceDrill.pos = 0;
  drillShowCard();
}

function drillPrev() {
  if (VoiceDrill.pos > 0) VoiceDrill.pos--;
  else VoiceDrill.pos = VoiceDrill.deck.length - 1;
  drillShowCard();
}

function drillMark(score) {
  const s = VoiceDrill.deck[VoiceDrill.pos];
  if (!s) return;
  VoiceDrill.scores[s.id] = score;
  // Reveal Japanese on mark (en-to-jp mode)
  if (VoiceDrill.mode === 'en-to-jp') {
    document.getElementById('drillJp').style.display = '';
    document.getElementById('drillHearBtn').style.display = '';
  }
  setTimeout(() => drillNext(), score === 'again' ? 1200 : 600);
}

// ── STT recording ────────────────────────────────────────
async function drillToggleRecord() {
  if (VoiceDrill.recording) {
    drillStopRecord();
  } else {
    await drillStartRecord();
  }
}

async function drillStartRecord() {
  // Fix 1: if voice conversation is recording, stop it cleanly first
  // Use App-first pattern per Phase 3 architecture
  const _VoiceState = App.VoiceState || window.VoiceState;
  const _voiceToggleRecord = App.voiceToggleRecord || window.voiceToggleRecord;
  if (_VoiceState && _VoiceState.recording && _voiceToggleRecord) {
    await _voiceToggleRecord();
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    VoiceDrill._chunks = [];
    VoiceDrill._mediaRec = new MediaRecorder(stream);
    VoiceDrill._mediaRec.ondataavailable = e => VoiceDrill._chunks.push(e.data);
    VoiceDrill._mediaRec.onstop = () => drillTranscribe(stream);
    VoiceDrill._mediaRec.start();
    VoiceDrill.recording = true;

    const btn = document.getElementById('drillRecordBtn');
    btn.style.background = 'linear-gradient(135deg,var(--red),#c0392b)';
    btn.style.animation  = 'pulse 1s infinite';
    document.getElementById('drillStatus').textContent = 'Recording… tap again to stop';
  } catch(e) {
    document.getElementById('drillStatus').textContent = 'Mic access denied.';
  }
}

function drillStopRecord() {
  if (VoiceDrill._mediaRec && VoiceDrill.recording) {
    VoiceDrill._mediaRec.stop();
    VoiceDrill.recording = false;
    const btn = document.getElementById('drillRecordBtn');
    btn.style.background = 'linear-gradient(135deg,var(--teal),#28b8ad)';
    btn.style.animation  = '';
    document.getElementById('drillStatus').textContent = 'Processing…';
  }
}

async function drillTranscribe(stream) {
  stream.getTracks().forEach(t => t.stop());
  const blob = new Blob(VoiceDrill._chunks, { type: 'audio/webm' });
  const _getApiKey = App.getApiKey || window.getApiKey;
  const key = _getApiKey ? _getApiKey() : '';

  if (!key) {
    document.getElementById('drillStatus').textContent = 'No OpenAI key — set in Resources → Settings.';
    return;
  }

  try {
    const fd = new FormData();
    fd.append('file', blob, 'drill.webm');
    fd.append('model', 'whisper-1');
    fd.append('language', 'ja');

    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key },
      body: fd,
    });
    const data = await resp.json();
    const transcript = (data.text || '').trim();

    drillScore(transcript);
  } catch(e) {
    document.getElementById('drillStatus').textContent = 'STT error: ' + e.message;
  }
}

// ── Scoring ──────────────────────────────────────────────
// Kana-normalise both strings then compare character overlap.
// Katakana → hiragana, strip punctuation and slot markers.

function toHira(str) {
  return str
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/〜|[。、！？「」『』\s]/g, '');
}

function drillScore(transcript) {
  const s = VoiceDrill.deck[VoiceDrill.pos];
  if (!s) return;

  const target = toHira(s.jp);
  const spoken = toHira(transcript);

  if (!spoken) {
    document.getElementById('drillStatus').textContent = 'Nothing heard — try again.';
    return;
  }

  // Reveal Japanese
  document.getElementById('drillJp').style.display = '';
  document.getElementById('drillHearBtn').style.display = '';

  // Character overlap score
  const targetChars = [...target];
  const spokenChars = [...spoken];
  let matches = 0;
  const used = new Array(spokenChars.length).fill(false);
  for (const tc of targetChars) {
    const i = spokenChars.findIndex((sc, idx) => !used[idx] && sc === tc);
    if (i !== -1) { matches++; used[i] = true; }
  }
  const score = targetChars.length ? matches / targetChars.length : 0;

  const result = document.getElementById('drillResult');
  result.style.display = '';

  if (score >= 0.85) {
    result.style.color = 'var(--teal)';
    result.textContent = '✓ ' + transcript;
    drillMark('ok');
  } else if (score >= 0.55) {
    result.style.color = 'var(--gold)';
    result.textContent = '〜 ' + transcript + '  (heard: ' + Math.round(score * 100) + '%)';
    document.getElementById('drillStatus').textContent = 'Close — try again or tap Again.';
  } else {
    result.style.color = 'var(--red)';
    result.textContent = '✕ ' + transcript + '  (heard: ' + Math.round(score * 100) + '%)';
    document.getElementById('drillStatus').textContent = 'Target shown above — tap Again to retry.';
    drillMark('again');
  }
}

// ── Custom sentence tab ───────────────────────────────────
// User pastes sentences (one per line, Japanese).
// They become a drillable deck in jp-repeat mode.
// Persisted to localStorage so they survive page reload.

const CUSTOM_STORAGE_KEY = 'voiceDrill_customSentences';

function customInit() {
  const stored = localStorage.getItem(CUSTOM_STORAGE_KEY);
  if (stored) {
    const el = document.getElementById('customTextarea');
    if (el && !el.value.trim()) el.value = stored;
  }
  customBuildDeck();
}

function customBuildDeck() {
  const el = document.getElementById('customTextarea');
  if (!el) return;
  const lines = el.value.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 1);
  VoiceDrill.customDeck = lines.map((jp, i) => ({ id: 9000 + i, jp }));
  VoiceDrill.customPos  = 0;
  localStorage.setItem(CUSTOM_STORAGE_KEY, el.value);
  customShowCard();
}

function customShowCard() {
  const deck = VoiceDrill.customDeck;
  const pos  = VoiceDrill.customPos;
  const counter = document.getElementById('customCounter');
  const bar     = document.getElementById('customProgBar');
  const jp      = document.getElementById('customJp');
  const result  = document.getElementById('customResult');
  const status  = document.getElementById('customStatus');

  if (counter) counter.textContent = deck.length ? `${pos + 1} / ${deck.length}` : '—';
  if (bar) bar.style.width = deck.length ? Math.round(((pos+1)/deck.length)*100)+'%' : '0%';
  if (result) { result.style.display = 'none'; result.textContent = ''; }
  if (status) status.textContent = deck.length ? 'Tap mic to speak' : 'Paste sentences above then tap Load';
  if (jp) {
    jp.textContent = deck.length ? deck[pos].jp : '';
    // auto-speak in repeat mode
    if (deck.length) {
      const _jpSpeak = App.jpSpeak || window.jpSpeak;
      if (_jpSpeak) setTimeout(() => _jpSpeak(deck[pos].jp, 0.85), 350);
    }
  }
}

function customNext() {
  if (!VoiceDrill.customDeck.length) return;
  VoiceDrill.customPos = (VoiceDrill.customPos + 1) % VoiceDrill.customDeck.length;
  customShowCard();
}

function customPrev() {
  if (!VoiceDrill.customDeck.length) return;
  VoiceDrill.customPos = (VoiceDrill.customPos - 1 + VoiceDrill.customDeck.length) % VoiceDrill.customDeck.length;
  customShowCard();
}

async function customToggleRecord() {
  if (VoiceDrill.customRec) customStopRecord();
  else await customStartRecord();
}

async function customStartRecord() {
  const _VoiceState = App.VoiceState || window.VoiceState;
  const _voiceToggleRecord = App.voiceToggleRecord || window.voiceToggleRecord;
  if (_VoiceState && _VoiceState.recording && _voiceToggleRecord) await _voiceToggleRecord();
  if (VoiceDrill.recording) drillStopRecord();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    VoiceDrill._customChunks = [];
    VoiceDrill._customRec = new MediaRecorder(stream);
    VoiceDrill._customRec.ondataavailable = e => VoiceDrill._customChunks.push(e.data);
    VoiceDrill._customRec.onstop = () => customTranscribe(stream);
    VoiceDrill._customRec.start();
    VoiceDrill.customRec = true;

    const btn = document.getElementById('customRecordBtn');
    if (btn) { btn.style.background='linear-gradient(135deg,var(--red),#c0392b)'; btn.style.animation='pulse 1s infinite'; }
    const status = document.getElementById('customStatus');
    if (status) status.textContent = 'Recording… tap again to stop';
  } catch(e) {
    const status = document.getElementById('customStatus');
    if (status) status.textContent = 'Mic access denied.';
  }
}

function customStopRecord() {
  if (VoiceDrill._customRec && VoiceDrill.customRec) {
    VoiceDrill._customRec.stop();
    VoiceDrill.customRec = false;
    const btn = document.getElementById('customRecordBtn');
    if (btn) { btn.style.background='linear-gradient(135deg,var(--teal),#28b8ad)'; btn.style.animation=''; }
    const status = document.getElementById('customStatus');
    if (status) status.textContent = 'Processing…';
  }
}

async function customTranscribe(stream) {
  stream.getTracks().forEach(t => t.stop());
  const blob = new Blob(VoiceDrill._customChunks, { type: 'audio/webm' });
  const _getApiKey = App.getApiKey || window.getApiKey;
  const key = _getApiKey ? _getApiKey() : '';
  if (!key) { document.getElementById('customStatus').textContent = 'No OpenAI key — set in Resources → Settings.'; return; }

  try {
    const fd = new FormData();
    fd.append('file', blob, 'custom.webm');
    fd.append('model', 'whisper-1');
    fd.append('language', 'ja');
    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: fd,
    });
    const data = await resp.json();
    customScore((data.text || '').trim());
  } catch(e) {
    document.getElementById('customStatus').textContent = 'STT error: ' + e.message;
  }
}

function customScore(transcript) {
  const deck = VoiceDrill.customDeck;
  const pos  = VoiceDrill.customPos;
  if (!deck.length || !transcript) return;

  const target = toHira(deck[pos].jp);
  const spoken = toHira(transcript);
  const targetChars = [...target];
  const spokenChars = [...spoken];
  let matches = 0;
  const used = new Array(spokenChars.length).fill(false);
  for (const tc of targetChars) {
    const i = spokenChars.findIndex((sc, idx) => !used[idx] && sc === tc);
    if (i !== -1) { matches++; used[i] = true; }
  }
  const score = targetChars.length ? matches / targetChars.length : 0;

  const result = document.getElementById('customResult');
  const status = document.getElementById('customStatus');
  if (result) {
    result.style.display = '';
    if (score >= 0.85) {
      result.style.color = 'var(--teal)';
      result.textContent = '✓ ' + transcript;
      setTimeout(() => customNext(), 800);
    } else if (score >= 0.55) {
      result.style.color = 'var(--gold)';
      result.textContent = '〜 ' + transcript + '  (' + Math.round(score*100) + '%)';
      if (status) status.textContent = 'Close — try again.';
    } else {
      result.style.color = 'var(--red)';
      result.textContent = '✕ ' + transcript + '  (' + Math.round(score*100) + '%)';
      if (status) status.textContent = 'Try again.';
    }
  }
}

// ── App registry ─────────────────────────────────────────
Object.assign(App, {
  VoiceDrill,
  voiceSubSwitch,
  drillInit,
  drillApplyFilter,
  drillShowCard,
  drillSpeak,
  drillNext,
  drillPrev,
  drillMark,
  drillToggleRecord,
  drillScore,
  customInit,
  customBuildDeck,
  customShowCard,
  customNext,
  customPrev,
  customToggleRecord,
  customStopRecord,
  customScore,
});

// ── Electron window exports ───────────────────────────────
try {
  window['voiceSubSwitch']    = voiceSubSwitch;
  window['drillApplyFilter']  = drillApplyFilter;
  window['drillSpeak']        = drillSpeak;
  window['drillNext']         = drillNext;
  window['drillPrev']         = drillPrev;
  window['drillMark']         = drillMark;
  window['drillToggleRecord'] = drillToggleRecord;
} catch(e) {}
