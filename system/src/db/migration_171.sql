-- ===================================================
-- migration_171: 台本に「写真」レイアウト＋「ビラ」機能を追加し、車椅子デッキを所長案の構成に組み替え
--   ・daihon_slides.images：写真スライド用の画像（R2 DOCUMENTS_BUCKET の daihon/ 配下のキーをJSON配列で）
--   ・daihon_flyers：A4縦1枚の告知ビラ（data にJSONで文言を保存）
--   ・デッキ「車椅子乗車 タイムトライアル」（migration_170）を
--     「全体のスロープ研修（点呼後・半地下）→ 昨年の様子（写真）→ 新卒タイムトライアル（離職防止）」の構成に作り直し、
--     デッキ名を「車椅子乗車 対応力アップ」に変更。本番で削除された「UDタクシー乗車運動とは」は入れない。
--   ・新卒向けビラ「車椅子乗車タイムトライアル 新卒向けビラ」を1件追加。
--   ※ ALTER を含むため再実行不可。
-- ===================================================

ALTER TABLE daihon_slides ADD COLUMN images TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS daihon_flyers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  data        TEXT    NOT NULL DEFAULT '{}',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

DELETE FROM daihon_slides WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 0, 'cover', 'blue',
  '車椅子乗車 対応力アップ',
  '2026年度 スロープ研修・新卒タイムトライアル',
  '10月23日に向けて、全員で備える',
  'これから、車椅子のお客様への対応力を上げるための、今年の取り組みについてご説明します。全体のスロープ研修と、新卒向けのタイムトライアルの2本立てです。'
FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル';

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 1, 'content', 'amber',
  '課題：手順が難しい',
  '対応できなければ「乗車拒否」として扱われる',
  'UDタクシーのスロープは手順が多く、難しい' || char(10) || '手順に迷えば、お待たせ・お断りにつながる' || char(10) || '対応できないと、クレームとして会社に届く' || char(10) || '■ スロープに自信がないと、現場で対応できない',
  '今のUDタクシーは、スロープを出して車椅子をお乗せするまでの手順がとても多く、慣れていないとその場では対応できません。対応できなければ、お客様から見れば乗車拒否と同じです。'
FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル';

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 2, 'steps', 'blue',
  '今年の取り組みは2本立て',
  '10月23日に向けて',
  'スロープ研修｜スロープ設置に自信のない乗務社員が対象。点呼後に毎日実施' || char(10) || '新卒タイムトライアル｜新卒16名が対象。離職防止の一環として実施',
  '今年の取り組みは2本立てです。1つ目は、昨年と同じく、スロープ設置に自信のない乗務社員を対象にした毎日の研修。2つ目は、今年は新卒が多いため、新卒を対象にしたタイムトライアルです。'
FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル';

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 3, 'content', 'green',
  '取り組み1　スロープ研修',
  '昨年に続き、10月23日に向けて実施',
  '対象：スロープ設置に自信のない乗務社員' || char(10) || '時間：毎日、点呼後' || char(10) || '場所：半地下' || char(10) || '内容：スロープ設置から乗車・固定までを実車で練習' || char(10) || '■ 10月23日までに、全員が自信を持てる状態へ',
  '1つ目はスロープ研修です。昨年と同じように、スロープ設置に自信のない乗務社員を対象に、点呼後に毎日、半地下で研修を行います。10月23日までに、全員が自信を持って対応できる状態を目指します。'
FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル';

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 4, 'photo', 'green',
  '昨年の研修の様子',
  '2025年の実施記録',
  '実施期間：（あとで記入）' || char(10) || '参加人数：（あとで記入）' || char(10) || '実施回数：（あとで記入）' || char(10) || '■ 成果：（あとで記入）',
  '昨年の研修の様子です。（写真と記録をもとに、実施期間・参加人数・成果を紹介してください。）'
FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル';

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 5, 'content', 'blue',
  '取り組み2　新卒タイムトライアル',
  '今年は新卒が多いため、離職防止の一環として',
  '今年度の新卒乗務社員は16名と多い' || char(10) || '全体の研修とは別に、新卒は個別に練習・計測' || char(10) || 'タイムで上達を見える化し、楽しみながら身につける' || char(10) || '表彰・懇親会で、同期のつながりをつくる',
  '2つ目は新卒タイムトライアルです。今年は新卒が16名と多いので、全体の研修とは別に、新卒には個別に声をかけて練習とタイム計測を行います。楽しみながら身につけてもらい、表彰や懇親会を通じて同期のつながりをつくることで、離職防止につなげます。'
FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル';

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 6, 'stat', 'blue',
  '新卒タイムトライアルの概要',
  '',
  '16名｜2026年度入社の新卒乗務社員' || char(10) || '個別｜一人ずつ声がけして練習・計測' || char(10) || '11/7｜勉強会・表彰式',
  '対象は2026年度に入社した新卒16名です。練習とタイムトライアルは一人ずつ個別に行い、11月7日の年末年始勉強会のあと、懇親会の場で表彰します。'
FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル';

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 7, 'content', 'blue',
  '目的',
  '全員が、一人で、確実に、速く',
  '車椅子のお客様を一人で最後までご案内できる' || char(10) || '手順を体で覚え、現場で迷わず動ける' || char(10) || 'タイムで上達を見える化し、意欲につなげる' || char(10) || '表彰と同期の一体感で、離職防止につなげる',
  'ねらいは4つです。一人で最後までご案内できること。手順を体で覚えること。タイムを計ることで上達が目に見えるようにすること。そして、表彰と同期の一体感を通じて、離職防止につなげることです。'
FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル';

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 8, 'steps', 'blue',
  '新卒タイムトライアルの流れ',
  '4つのステップで進めます',
  'スロープ練習｜個別に声がけし、実車で手順を覚える' || char(10) || 'タイム計測｜一人ずつタイムトライアル' || char(10) || '勉強会｜11月7日の年末年始勉強会（レクリエーションつき）' || char(10) || '表彰・懇親会｜勉強会のあとに表彰と打ち上げ',
  '新卒タイムトライアルは4つのステップで進めます。個別にスロープの練習をして、手順を覚えたらタイムトライアル。11月7日に年末年始勉強会を行い、そのあとの懇親会で表彰式を兼ねた打ち上げを行います。'
FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル';

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 9, 'content', 'green',
  'STEP 1　スロープ練習',
  '個別に声がけし、実車で手順を覚える',
  '全体研修とは別に、一人ひとりに声がけ' || char(10) || '日程・場所は個別に調整（場所は調整中）' || char(10) || '先輩・管理者が横について、通しで練習' || char(10) || '目安：**10月23日**までに、全員1回以上' || char(10) || '■ 一人でできるようになったら、タイムトライアルへ',
  'まずはスロープの練習です。新卒は全体の研修とは別に、一人ひとりの勤務に合わせて声をかけます。場所は現在調整中です。先輩や管理者が横について、最初から最後まで通しで練習します。目安として、10月23日までに全員が一度は練習を終えている状態を目指します。'
FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル';

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 10, 'steps', 'green',
  'STEP 2　タイムトライアル',
  '計測のルール',
  'スタート｜運転席から、スライドドアを開け始めた時' || char(10) || '乗車・固定｜スロープを出し、お客様を乗せて固定' || char(10) || 'ゴール｜乗務員が運転席に座った時' || char(10) || '■ 速さだけでなく、確実な固定と声かけも確認',
  'タイムトライアルの計測範囲です。運転席からスライドドアを開け始めた瞬間がスタート。スロープを出して車椅子のお客様をお乗せし、固定して、乗務員が運転席に座った時点でゴールです。ただし速さだけを競うのではなく、固定が確実か、お客様への声かけができているかも合わせて確認します。'
FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル';

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 11, 'content', 'amber',
  'STEP 3　年末年始勉強会',
  '11月7日開催・繁忙期に向けた3つのテーマ',
  '**売上を伸ばす** … 繁忙期の需要をつかむ動き方' || char(10) || '**出番数を増やす** … 体調を整えて乗務に出る' || char(10) || '**トラブルを防ぐ** … 事故・クレームを起こさない' || char(10) || '■ レクリエーションをはさみ、楽しく学ぶ',
  '11月7日は、新卒イベントの第二弾として年末年始勉強会を行います。テーマは、売上を伸ばすこと、出番数を増やすこと、トラブルなく乗務すること、の3つです。堅苦しくならないよう、レクリエーションをはさみながら進めます。'
FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル';

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 12, 'content', 'blue',
  'STEP 4　表彰式・懇親会',
  '勉強会のあと、表彰と打ち上げ',
  'タイムトライアルの結果を発表し、表彰する' || char(10) || '表彰の内容は現在検討中' || char(10) || '同期・先輩・管理者で、ここまでの頑張りをねぎらう' || char(10) || '繁忙期を前に、チームとしての一体感をつくる',
  '勉強会のあとは懇親会です。ここでタイムトライアルの結果を発表し、表彰します。表彰の内容は現在検討中です。同期や先輩、管理者が集まって、ここまでの頑張りをねぎらい、繁忙期に向けて気持ちを一つにする場にします。'
FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル';

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 13, 'content', 'slate',
  '期待される効果',
  '',
  '乗務社員全体の車椅子対応力が上がる' || char(10) || '車椅子のお客様を確実にご案内し、クレームを防ぐ' || char(10) || '新卒が自信を持ち、離職防止・定着につながる' || char(10) || '繁忙期の売上・出番数アップとトラブル防止',
  'この取り組みで期待される効果です。乗務社員全体の車椅子対応力が上がり、車椅子のお客様を確実にご案内できるようになります。新卒は自信を持って乗務できるようになり、同期や先輩とのつながりが離職防止にもつながります。'
FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル';

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 14, 'closing', 'blue',
  'どんなお客様にも、選ばれる乗務員へ。',
  'スロープ研修と新卒タイムトライアルで',
  '',
  '以上が、今年の車椅子対応の取り組みです。どんなお客様にも選ばれる乗務員を目指して、全員で備えていきます。ご清聴ありがとうございました。'
FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル';

UPDATE daihon_decks SET title = '車椅子乗車 対応力アップ', subtitle = '2026年度 スロープ研修・新卒タイムトライアル',
  intro = '10月23日に向けた車椅子対応の取り組み。スロープ設置に自信のない乗務社員向けの毎日の研修（点呼後・半地下）と、新卒16名向けのタイムトライアル（離職防止の一環。11月7日の年末年始勉強会後の懇親会で表彰）の説明資料です。',
  updated_at = datetime('now','localtime')
WHERE title = '車椅子乗車 タイムトライアル';

INSERT INTO daihon_flyers (title, data, sort_order) VALUES (
  '車椅子乗車タイムトライアル 新卒向けビラ',
  '{"accent": "blue", "kicker": "2026年度 新卒のみなさんへ", "headline": "車椅子乗車\nタイムトライアル開催！", "lead": "UDタクシーのスロープ、一人で使えますか？\n練習して、タイムに挑戦しよう。", "steps_title": "参加の流れ", "steps": "練習｜個別に声をかけます。先輩・管理者と一緒に練習\n計測｜一人ずつタイムを計ります\n表彰｜11月7日の懇親会で表彰式", "rule_title": "計測のルール", "rule_start": "運転席からドアを開け始めた時", "rule_goal": "車椅子の方が乗車し、運転席に座った時", "date_big": "11.7", "date_small": "土", "date_title": "年末年始勉強会のあと、懇親会で表彰式！", "date_note": "表彰の内容はお楽しみに", "points": "日程・場所は一人ずつ調整します\n目安：10月23日までに1回は練習しよう\n速さだけでなく、確実な固定と声かけも大切", "footer": "お問い合わせ：板橋営業所 管理者まで"}',
  0
);
