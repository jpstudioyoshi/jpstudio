// assign-counters.js v2
// Dry run by default. Run with --apply to write (app must be CLOSED).
//
// Usage:
//   cd ~/Documents/jpStudio && node assign-counters.js
//   node assign-counters.js --apply

const { execSync } = require('child_process');
const os   = require('os');
const path = require('path');

const DB    = path.join(os.homedir(), 'Library/Application Support/japanese-studio/jpstudio.db');
const apply = process.argv.includes('--apply');

function sqlRows(query) {
  try {
    const raw = execSync(`sqlite3 -json "${DB}" "${query.replace(/"/g, '\\"')}"`, { encoding: 'utf8' });
    return JSON.parse(raw || '[]');
  } catch(e) {
    console.error('SQL error:', e.message);
    process.exit(1);
  }
}

// ── Counter map ───────────────────────────────────────────────────────────────
// null = explicitly uncountable — leave counter_key as NULL, no change needed
const EXPLICIT = {

  // ── People → nin ─────────────────────────────────────────────────────────
  '人':       'nin',
  '男の人':   'nin',
  '女の人':   'nin',
  '方':       'nin',
  '子供':     'nin',
  '友達':     'nin',
  '先生':     'nin',
  '学生':     'nin',
  '大学生':   'nin',
  '会社員':   'nin',
  '医者':     'nin',
  'お医者さん':'nin',
  '看護師':   'nin',
  '店員':     'nin',
  '社員':     'nin',
  '上司':     'nin',
  '部下':     'nin',
  '同僚':     'nin',
  '客':       'nin',
  '大人':     'nin',
  '若者':     'nin',
  'お年寄り': 'nin',
  '先輩':     'nin',
  '後輩':     'nin',
  '相手':     'nin',
  '外国人':   'nin',
  '生徒':     'nin',
  'お人好し': 'nin',
  '父':       'nin',
  '母':       'nin',
  'お父さん': 'nin',
  'お母さん': 'nin',
  '兄':       'nin',
  '姉':       'nin',
  '弟':       'nin',
  '妹':       'nin',
  '家族':     'nin',
  '甥':       'nin',
  '通訳':     'nin',

  // ── Animals → hiki / wa / tou ─────────────────────────────────────────────
  '猫':       'hiki',
  '犬':       'hiki',
  '魚':       'hiki',
  'ペット':   'hiki',
  'うさぎ':   'wa',
  '鳥':       'wa',
  '牛':       'tou',

  // ── Books / bound volumes → satsu ─────────────────────────────────────────
  '本':       'satsu',
  '雑誌':     'satsu',

  // ── Flat things → mai ─────────────────────────────────────────────────────
  '新聞':     'mai',
  '写真':     'mai',
  '手紙':     'mai',
  '切符':     'mai',
  '絵':       'mai',
  '紙':       'mai',
  'はがき':   'mai',
  'カーテン': 'mai',

  // ── Machines / vehicles → dai ─────────────────────────────────────────────
  'テレビ':         'dai',
  'ラジオ':         'dai',
  'カメラ':         'dai',
  'コンピューター': 'dai',
  '電車':           'dai',
  'バス':           'dai',
  'タクシー':       'dai',
  '自転車':         'dai',
  '飛行機':         'dai',
  '船':             'dai',
  '電話':           'dai',
  '時計':           'dai',
  '洗濯機':         'dai',
  '掃除機':         'dai',
  '電子レンジ':     'dai',
  'エアコン':       'dai',
  '新幹線':         'dai',
  '地下鉄':         'dai',

  // ── Footwear pairs → soku ─────────────────────────────────────────────────
  '靴':       'soku',
  '靴下':     'soku',
  '手袋':     'soku',

  // ── Clothing → chaku ──────────────────────────────────────────────────────
  '服':       'chaku',
  '洋服':     'chaku',
  '着物':     'chaku',
  'ズボン':   'chaku',
  '帽子':     'chaku',

  // ── Drinks (as served) → hai ──────────────────────────────────────────────
  'お茶':     'hai',
  'コーヒー': 'hai',
  'ジュース': 'hai',
  'お酒':     'hai',
  'ビール':   'hai',
  '牛乳':     'hai',

  // ── Small / round / discrete → ko ────────────────────────────────────────
  '卵':         'ko',
  'りんご':     'ko',
  'いちご':     'ko',
  'さくらんぼ': 'ko',
  '眼鏡':       'ko',
  'メガネ':     'ko',
  '鞄':         'ko',
  '財布':       'ko',
  '薬':         'ko',
  'バケツ':     'ko',
  '桶':         'ko',

  // ── Long / cylindrical → hon ──────────────────────────────────────────────
  '花':       'hon',
  '木':       'hon',
  '傘':       'hon',
  'ボールペン':'hon',
  'レーザー': 'hon',
  'レンズ':   'hon',

  // ── Explicitly NULL — uncountable ─────────────────────────────────────────
  '晩':       null,
  '月曜日':   null,  '火曜日':   null,  '水曜日':   null,  '木曜日':   null,
  '金曜日':   null,  '土曜日':   null,  '日曜日':   null,
  '春':       null,  '夏':       null,  '秋':       null,  '冬':       null,
  '今':       null,  '今日':     null,  '明日':     null,  '昨日':     null,
  '毎日':     null,  '毎朝':     null,  '毎晩':     null,  '毎週':     null,
  '毎月':     null,  '毎年':     null,
  '今年':     null,  '来年':     null,  '去年':     null,  '再来年':   null,
  '今週':     null,  '来週':     null,  '先週':     null,
  '今月':     null,  '来月':     null,  '先月':     null,
  '午前':     null,  '午後':     null,  '朝':       null,  '昼':       null,
  '夜':       null,  '時間':     null,  '週間':     null,  '週間後':   null,
  '平日':     null,  '長年':     null,
  '天気':     null,  '天気予報': null,  '雨':       null,  '雪':       null,
  '風':       null,  '晴れ':     null,  '曇り':     null,
  '空':       null,  '月':       null,  '星':       null,
  '海':       null,  '山':       null,  '川':       null,  '道':       null,
  '橋':       null,  '角':       null,
  '体':       null,  '頭':       null,  '顔':       null,  '目':       null,
  '耳':       null,  '鼻':       null,  '口':       null,  '手':       null,
  '足':       null,  '声':       null,  'お腹':     null,
  '白':       null,  '黒':       null,  '赤':       null,  '青':       null,
  '黄色':     null,  '緑':       null,
  'お金':     null,  '水':       null,  '肉':       null,  '野菜':     null,
  '砂糖':     null,  '塩':       null,  '料理':     null,  '食べ物':   null,
  '飲み物':   null,  '朝ご飯':   null,  '昼ご飯':   null,  '晩ご飯':   null,
  'ご飯':     null,  'パン':     null,  '果物':     null,
  '言葉':     null,  '言語':     null,  '意味':     null,  '気持ち':   null,
  '名前':     null,  '事':       null,  '物':       null,  '所':       null,
  '時':       null,  '前':       null,  '後':       null,  '中':       null,
  '外':       null,  '上':       null,  '下':       null,  '右':       null,
  '左':       null,  '隣':       null,  '後ろ':     null,  '向こう':   null,
  '間':       null,  '周り':     null,  '横':       null,
  '問題':     null,  '答え':     null,  '宿題':     null,  'テスト':   null,
  'クラス':   null,  '年生':     null,  '授業':     null,  '試験':     null,
  '成績':     null,  '合格':     null,  '失敗':     null,  '成功':     null,
  '日本語':   null,  '英語':     null,  'ドイツ語': null,  '漢字':     null,
  '文字':     null,  '文章':     null,  '俳句':     null,
  '電気':     null,  'お菓子':   null,
  '家':       null,  '学校':     null,  '会社':     null,  '銀行':     null,
  '病院':     null,  '駅':       null,  '店':       null,  '公園':     null,
  '図書館':   null,  '郵便局':   null,  'レストラン':null, 'トイレ':   null,
  '玄関':     null,  '台所':     null,  '風呂':     null,  '洗面所':   null,
  '押し入れ': null,  '窓':       null,  '壁':       null,  '床':       null,
  '天井':     null,  '屋根':     null,  '階段':     null,  'ドア':     null,
  '黒板':     null,  '大学':     null,  '高校':     null,  '中学校':   null,
  '小学校':   null,  '教室':     null,  '空港':     null,  'バス停':   null,
  '薬局':     null,  '交番':     null,  '映画館':   null,  '居酒屋':   null,
  '大使館':   null,  '外国':     null,
  '仕事':     null,  '勉強':     null,  '音楽':     null,  '映画':     null,
  '趣味':     null,  '病気':     null,  '怪我':     null,  '熱':       null,
  '咳':       null,  '健康':     null,  '手術':     null,  '白内障':   null,
  '呼吸':     null,
  '計画':     null,  '予定':     null,  '準備':     null,  '注意':     null,
  '説明':     null,  '意見':     null,  '考え':     null,  '様子':     null,
  '関係':     null,  '連絡':     null,  '相談':     null,  '紹介':     null,
  '約束':     null,  '予約':     null,  '申し込み': null,  '確認':     null,
  '記録':     null,  '報告':     null,  '資料':     null,  '情報':     null,
  'ニュース': null,  '番組':     null,  '広告':     null,  '料金':     null,
  '割引':     null,  '税金':     null,  '給料':     null,  '費用':     null,
  '質問':     null,  '間違い':   null,  '場所':     null,  '住所':     null,
  '地図':     null,  '世界':     null,  '社会':     null,  '文化':     null,
  '歴史':     null,  '経済':     null,  '政治':     null,  '生活':     null,
  '生活費':   null,  '習慣':     null,  '経験':     null,  '機会':     null,
  '目的':     null,  '理由':     null,  '方法':     null,  '結果':     null,
  '原因':     null,  '影響':     null,  '変化':     null,  '発展':     null,
  '解決':     null,  '産業':     null,  '将来':     null,  '地球':     null,
  '試合':     null,  '会議':     null,  '注文':     null,  '都合':     null,
  '内容':     null,  '日記':     null,  '人気':     null,  '値段':     null,
  '場合':     null,  '番号':     null,  '方向':     null,  '本物':     null,
  '窓口':     null,  '見物':     null,  '留学':     null,  '話題':     null,
  '話':       null,  '町':       null,  '乗り換え': null,  '時刻表':   null,
  '新幹線':   null,
  '思い出':   null,  'お土産':   null,  '記念':     null,  '楽しみ':   null,
  '試み':     null,  '努力':     null,  '人生':     null,  '昔':       null,
  '気分':     null,  '空気':     null,  '景色':     null,  '好奇心':   null,
  '半額':     null,  '半分':     null,  '規則':     null,  '視点':     null,
  '構造':     null,  'ネタバレ': null,  '食事':     null,  '仕事':     null,
  'Wi-Fi':   null,  '他':       null,  '昔':       null,
  'パスポート':null,  '鍵':       null,  'プレゼント':null,
  'はさみ':   null,
  '電池':     null,  '電報':     null,  '道具':     null,
  '信号':     null,
  '再来週':   null,  'アパート': null,
  '休み':     null,  '昼休み':   null,  '朝ご飯':   null,
  '短大':     null,
};

// ── Fetch unlinked nouns ──────────────────────────────────────────────────────
const rows = sqlRows(
  `SELECT id, word, reading, meaning FROM words WHERE pos = 'noun' AND (counter_key IS NULL OR counter_key = '')`
);

console.log(`\nNouns without counter_key: ${rows.length}\n`);

const updates = [];
const nulled  = [];
const skipped = [];

for (const row of rows) {
  if (row.word in EXPLICIT) {
    const ck = EXPLICIT[row.word];
    if (ck !== null) {
      updates.push({ id: row.id, word: row.word, meaning: row.meaning, counter_key: ck });
    } else {
      nulled.push(row.word);
    }
  } else {
    skipped.push({ word: row.word, meaning: row.meaning });
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
console.log('═══ PROPOSED UPDATES ═══');
for (const u of updates) {
  console.log(`  ${u.word.padEnd(12)} (${u.meaning.padEnd(25)}) → ${u.counter_key}`);
}

console.log(`\n═══ NOT IN MAP — needs manual decision ═══`);
for (const s of skipped) {
  console.log(`  ${s.word.padEnd(12)} ${s.meaning}`);
}

console.log(`\n─────────────────────────────────────────`);
console.log(`  To assign:      ${updates.length}`);
console.log(`  Confirmed NULL: ${nulled.length}`);
console.log(`  Unmapped:       ${skipped.length}`);
console.log(`─────────────────────────────────────────`);

if (!apply) {
  console.log('\nDRY RUN — no changes made.');
  console.log('Run with --apply to write (close the app first).');
} else {
  console.log('\nApplying...');
  for (const u of updates) {
    execSync(`sqlite3 "${DB}" "UPDATE words SET counter_key = '${u.counter_key}' WHERE id = ${u.id}"`, { encoding: 'utf8' });
  }
  console.log(`✓ Applied ${updates.length} updates.`);
}
