-- ===================================================
-- migration_139: 板橋ページ「台本」— スライド＋台本デッキ
--   ・営業所ページ（/settings/study-sessions）に「台本」タブを新設。
--   ・パワポのようにスライド（見出し＋箇条書き）と台本（ナレーション）を編集し、
--     /daihon/:id/present で全画面プレゼン、/daihon/:id/print で印刷できる。
--   ・既存機能とはテーブル非共有の完全新規（daihon_*）。閲覧/編集の権限は
--     settings.study-sessions（.edit）を流用（permissions.ts のマッピング参照）。
--   ・初期デッキ = 原田班長「乗務を極める マインド講座」。以降はアプリ上で編集可。
--   ※ D1 は compound SELECT の項数上限が小さいため、seed は INSERT を1文ずつに分割する。
-- ===================================================

CREATE TABLE IF NOT EXISTS daihon_decks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  subtitle    TEXT    NOT NULL DEFAULT '',
  speaker     TEXT    NOT NULL DEFAULT '',
  intro       TEXT    NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS daihon_slides (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id     INTEGER NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  layout      TEXT    NOT NULL DEFAULT 'content',   -- cover | section | content | closing
  accent      TEXT    NOT NULL DEFAULT 'blue',      -- blue | green | amber | slate
  title       TEXT    NOT NULL DEFAULT '',
  subtitle    TEXT    NOT NULL DEFAULT '',
  body        TEXT    NOT NULL DEFAULT '',          -- 1行1項目の箇条書き（■始まりは小見出し）
  notes       TEXT    NOT NULL DEFAULT ''           -- 台本（読み上げ用ナレーション）
);

CREATE INDEX IF NOT EXISTS idx_daihon_slides_deck ON daihon_slides(deck_id, sort_order);

-- ---------- 初期デッキ：乗務を極める マインド講座 ----------
INSERT INTO daihon_decks (title, subtitle, speaker, intro, sort_order) VALUES (
  '乗務を極める マインド講座',
  '負担なく売上アップの極意',
  '原田 班長',
  'トラブルシューティング・走り方のコツ・マインドの3つの視点から、無理なく売上を伸ばすコツをお伝えします。',
  0
);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座'), 0, 'cover', 'blue',
  '乗務を極める マインド講座',
  '負担なく売上アップの極意',
  '講師：原田 班長',
  'みなさんお疲れさまです。今日は「乗務を極めるマインド講座」ということで、少しの工夫で、体に無理をさせずに売上を伸ばすコツをお話しします。むずかしい話はしません。今日の乗務からすぐ試せることだけを持ち帰ってください。');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座'), 1, 'content', 'blue',
  'この講座のねらい',
  '3つの視点で「負担なく」売上を上げる',
  '■ 今日おさえる3つの視点' || char(10) ||
  'トラブルシューティング … つまずきを減らす、こじらせない' || char(10) ||
  '走り方のコツ … 空車の時間を減らす、動きにパターンを持つ' || char(10) ||
  'マインド … 1日を組み立てる、比べない、続ける' || char(10) ||
  '■ ゴール' || char(10) ||
  '「がんばって稼ぐ」ではなく「仕組みで稼ぐ」に変える',
  '売上を上げようとすると、つい「もっと長く走る」「もっと件数を」と考えがちです。でも今日の狙いはその逆で、いかに無駄と消耗を減らすか、です。トラブル、走り方、マインドの3つに分けて見ていきます。');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座'), 2, 'section', 'amber',
  'トラブルシューティング',
  'つまずきを減らす。起きても、こじらせない。',
  '',
  'まずはトラブルシューティングです。売上を落とす一番の原因は、実は大きなミスではなく、小さなトラブルの積み重ねと、その後始末に時間を取られることです。');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座'), 3, 'content', 'amber',
  'お客様とのやりとりは「先回り」で',
  '乗せた直後の一言で、後のトラブルが半分になる',
  '行き先は必ず復唱する（聞き間違いの事故を防ぐ）' || char(10) ||
  'ルートに選択肢があるときは先に伝える（高速を使うか、下道か）' || char(10) ||
  '時間がかかりそうなときは「10分ほど見てください」と先に言う' || char(10) ||
  'お釣り・カード・電子マネーは走り出す前に確認',
  '「今の道でよかったの？」と後から言われると、こちらも気持ちよく走れません。乗せた直後に、行き先の復唱と、ルートの選択肢、だいたいの所要時間を伝えておく。これだけで降車時のもめごとがぐっと減ります。');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座'), 4, 'content', 'amber',
  'クレームを大きくしないコツ',
  '「勝とう」としない。記録して、上げる。',
  'まず「ご不便をおかけしました」と受け止める（反論から入らない）' || char(10) ||
  'その場で結論を出そうとしない。日時・車号・状況をメモ' || char(10) ||
  '料金の話は、メーターと実費の根拠を落ち着いて説明' || char(10) ||
  '危険を感じたら無理をせず、営業所に連絡して指示を仰ぐ',
  'クレーム対応で一番まずいのは、その場で言い返して勝とうとすることです。ほとんどの苦情は、いったん受け止めて記録すれば大きくなりません。自分ひとりで抱えず、営業所に上げてください。それが結果的に一番早く終わります。');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座'), 5, 'content', 'amber',
  '道間違い・機器不調のとき',
  '止まる勇気が、売上とお客様を守る',
  '道を間違えたら、正直に伝えてメーターの調整を申し出る' || char(10) ||
  'ナビ・無線・決済端末の不調は、始業点検で気づく' || char(10) ||
  '体調が悪いとき、車に不安があるときは無理に出ない・戻る' || char(10) ||
  '「今日は取り返す」で走ると、事故で全部なくなる',
  '道を間違えたときにごまかすと、まず信用を失います。素直に伝えてメーターを戻す。機器の不調は朝の点検でほぼ防げます。体調と車の不安は、売上より優先。1件の事故は1か月分の売上を消します。');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座'), 6, 'section', 'blue',
  '走り方のコツ',
  '空車の時間を減らす。動きに「型」を持つ。',
  '',
  '次は走り方です。売上は「乗せている時間 ÷ 乗務時間」で決まります。つまり、空車でうろうろする時間をどれだけ削れるかが勝負です。');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座'), 7, 'content', 'blue',
  '時間帯で「型」を決めておく',
  '考えながら走らない。パターンで走る。',
  '朝（〜9時台）… 住宅地から駅・病院へ。通院と出勤の足' || char(10) ||
  '日中… 病院・商業施設・役所まわりを小さく循環' || char(10) ||
  '夕方〜夜… 繁華街・駅前で付け待ちと流しを切り替え' || char(10) ||
  '雨の日… いつもの型を「1段早く」動かす（需要が前倒しになる）',
  '毎回その場で「どこ行こうかな」と考えていると、それだけで消耗します。時間帯ごとに行く場所を先に決めておく。そのパターンを自分の中に3つか4つ持っておけば、迷いが減って空車時間が短くなります。');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座'), 8, 'content', 'blue',
  '降ろした「次の一手」を先に決める',
  '降車の30秒前に、次の動きを考える',
  'お客様が降りる前に、次に流す方向をイメージしておく' || char(10) ||
  '降車地点の周辺で需要が見込めるか（病院前、駅、商業施設）' || char(10) ||
  '見込みが薄い場所なら、最短で「型」のルートに戻る' || char(10) ||
  '付け待ちは「列の長さ」と「回転」で入るか決める',
  '一番もったいないのが、降ろした後に「さあどうしよう」と止まってしまう時間です。降りる少し前に、次にどっちへ向かうかを決めておく。これを習慣にするだけで、1日の実車率がはっきり変わります。');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座'), 9, 'content', 'blue',
  '体と燃費にやさしい走り',
  '疲れない走りが、結局いちばん長く稼げる',
  '急発進・急ブレーキを減らす（燃費と乗り心地とクレーム対策）' || char(10) ||
  '車間をとって、先読みで速度を調整する' || char(10) ||
  '休憩は「疲れる前」に短く取る。眠気は迷わず仮眠' || char(10) ||
  '無理な連続乗務より、集中できる時間を長く保つ',
  '荒い運転は燃費も乗り心地も悪くして、いいことがありません。先読みでやんわり走る。休憩は疲れきる前に取る。トータルで見れば、そのほうが1日を通して稼げます。');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座'), 10, 'section', 'green',
  'マインド',
  '1日を組み立てる。比べない。続ける。',
  '',
  '最後はマインドの話です。技術が同じでも、考え方ひとつで売上も、続けやすさも変わります。');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座'), 11, 'content', 'green',
  '売上は「狙って作る」もの',
  'なりゆきで走らない。1日を設計する。',
  '出庫前に「今日の目標」と「どの時間帯で作るか」を決める' || char(10) ||
  '午前で流れを作り、夕方〜夜で伸ばす、と時間を分けて考える' || char(10) ||
  'うまくいった日の動きをメモして、次に再現する' || char(10) ||
  '目標は少し高めに。ただし未達でも自分を責めない',
  '売上がいい人は、運がいいのではなく、1日をあらかじめ組み立てています。今日はどの時間帯で稼ぐか、朝のうちに決めておく。うまくいった日のパターンを覚えて、それを繰り返す。これだけです。');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座'), 12, 'content', 'green',
  '焦らない・比べない',
  '他人の売上ではなく、昨日の自分と比べる',
  '他の乗務員の数字は気にしない。条件も引きも違う' || char(10) ||
  '悪い日は誰にでもある。1日で取り返そうとしない' || char(10) ||
  '見るのは「1週間・1か月の平均」。波は必ずならされる' || char(10) ||
  'イライラは運転を荒くする。深呼吸して仕切り直す',
  '同僚の売上と比べても、いいことは何もありません。日によって引きは違います。比べるなら昨日の自分。1日単位ではなく、週や月の平均で見れば、波は必ずならされていきます。');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座'), 13, 'content', 'green',
  'お客様に「選ばれる」所作',
  'あたりまえを、ていねいに',
  '乗車時・降車時の挨拶とお礼をはっきり言う' || char(10) ||
  '車内はにおい・ゴミ・温度に気を配る（次のお客様のため）' || char(10) ||
  '静かに乗りたい人、話したい人を見極める' || char(10) ||
  '「またこの人に」と思われると、指名や無線に強くなる',
  '特別なことは要りません。挨拶とお礼、きれいな車内、お客様の様子を見て話すか静かにするか。この積み重ねが評判になって、無線や指名につながっていきます。');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座'), 14, 'content', 'green',
  '記録をつけると、見えてくる',
  '「なんとなく」を「データ」に変える',
  '曜日・時間帯・エリアごとの売上を軽くメモするだけでいい' || char(10) ||
  '2週間続けると、自分の「勝ちパターン」が見えてくる' || char(10) ||
  '悪かった時間帯は、型を差し替えて実験する' || char(10) ||
  'アプリの日報・売上画面も活用する',
  '記憶だけだと「先週は良かった気がする」で終わってしまいます。簡単でいいので記録をつける。2週間分たまると、自分がどこで稼げていて、どこで無駄にしているかがはっきり見えます。');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座'), 15, 'content', 'slate',
  '今日のまとめ',
  '3つの視点から、1つずつ',
  'トラブル … 乗せた直後の「先回りの一言」を習慣にする' || char(10) ||
  '走り方 … 時間帯の「型」を3つ用意し、次の一手を先に決める' || char(10) ||
  'マインド … 出庫前に1日を組み立て、週平均で振り返る' || char(10) ||
  '■ 全部やらなくていい。まず1つ、次の乗務で試す',
  '今日の話を全部やろうとすると続きません。3つの視点から、自分に一番刺さったものを1つだけ選んで、次の乗務で試してください。それが回り出したら、次を足す。その繰り返しです。');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座'), 16, 'closing', 'blue',
  '負担なく、確実に。',
  '次の乗務で、1つ実践してみてください',
  '',
  '売上は、気合ではなく仕組みで作れます。無理をせず、今日の中から1つだけ持ち帰ってください。おつかれさまでした。質問があればこの後うかがいます。');
