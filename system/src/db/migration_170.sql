-- ===================================================
-- migration_170: 台本「車椅子乗車 タイムトライアル」デッキを追加
--   ・2026年度新卒16名向け：スロープ練習 → タイムトライアル → 11/7 繁忙期勉強会 → 表彰式兼懇親会。
--   ・台本機能（migration_139 の daihon_*）にデータを入れるだけ。テーブル変更なし。
--   ・同時に台本へ「流れ」「数字」レイアウト・PDF出力・PowerPoint書き出しを追加（コード側）。
--   ・再実行しても重複しないよう、同名デッキがあれば挿入しない。
-- ===================================================

INSERT INTO daihon_decks (title, subtitle, speaker, intro, sort_order)
SELECT '車椅子乗車 タイムトライアル', '2026年度 新卒 繁忙期対策プロジェクト', '', '新卒16名を対象に、車椅子スロープの個別練習とタイムトライアルを行い、11月7日の新卒繁忙期勉強会・懇親会で表彰する取り組みの説明資料です。', COALESCE((SELECT MAX(sort_order) FROM daihon_decks), -1) + 1
WHERE NOT EXISTS (SELECT 1 FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル'), 0, 'cover', 'blue',
  '車椅子乗車 タイムトライアル',
  '2026年度 新卒 特別企画',
  'スロープ練習 → タイムトライアル → 繁忙期勉強会 → 表彰式',
  'これから、2026年度の新卒乗務員を対象にした「車椅子乗車 タイムトライアル」についてご説明します。車椅子のお客様を、新卒の誰もが一人で、確実にご案内できるようにするための取り組みです。'
WHERE NOT EXISTS (SELECT 1 FROM daihon_slides WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル') AND sort_order = 0);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル'), 1, 'content', 'slate',
  'UDタクシー乗車運動とは',
  '車椅子のお客様による、全国一斉の乗車調査',
  '主催：NPO法人DPI日本会議（毎年実施）' || char(10) || '2026年は **10月23日（金）** が一斉行動日' || char(10) || '流し・乗り場・アプリ・電話、すべてが対象' || char(10) || '乗車拒否・所要時間・対応が記録され、公表される',
  '車椅子を利用されている方々が、実際にUDタクシーに乗車して、その対応を記録する全国一斉の調査が毎年行われています。今年は10月23日が一斉行動日です。流しでも、乗り場でも、アプリでも、電話でも、どの場面でも車椅子のお客様が手を挙げる可能性があります。'
WHERE NOT EXISTS (SELECT 1 FROM daihon_slides WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル') AND sort_order = 1);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル'), 2, 'content', 'amber',
  '課題：手順が難しい',
  '対応できなければ「乗車拒否」として扱われる',
  'UDタクシーのスロープは手順が多く、難しい' || char(10) || '手順に迷えば、お待たせ・お断りにつながる' || char(10) || '対応できないと、クレームとして会社に届く' || char(10) || '■ 経験の少ない新卒ほど、現場で困りやすい',
  '今のUDタクシーは、スロープを出して車椅子をお乗せするまでの手順がとても多く、一度もやったことがないと、その場ではまず対応できません。対応できなければ、お客様から見れば乗車拒否と同じです。特に経験の少ない新卒が、一人で困ってしまうケースが心配されます。'
WHERE NOT EXISTS (SELECT 1 FROM daihon_slides WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル') AND sort_order = 2);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル'), 3, 'stat', 'blue',
  '今回の取り組みの概要',
  '',
  '16名｜2026年度入社の新卒乗務員' || char(10) || '個別｜一人ずつ声がけして練習・計測' || char(10) || '11/7｜繁忙期勉強会・表彰式',
  '対象は、2026年度に入社した新卒16名です。練習とタイムトライアルは、日程を決めて一斉に行うのではなく、一人ずつ声をかけて個別に行います。そして11月7日の新卒繁忙期勉強会のあと、懇親会の場で表彰します。'
WHERE NOT EXISTS (SELECT 1 FROM daihon_slides WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル') AND sort_order = 3);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル'), 4, 'content', 'blue',
  '目的',
  '全員が、一人で、確実に、速く',
  '車椅子のお客様を一人で最後までご案内できる' || char(10) || '手順を体で覚え、現場で迷わず動ける' || char(10) || 'タイムで上達を見える化し、意欲につなげる' || char(10) || '頑張りを表彰し、同期の一体感を高める',
  'ねらいは4つです。一人で最後までご案内できること。手順を体で覚えること。タイムを計ることで上達が目に見えるようにすること。そして、頑張った人をきちんと表彰して、同期の一体感につなげることです。'
WHERE NOT EXISTS (SELECT 1 FROM daihon_slides WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル') AND sort_order = 4);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル'), 5, 'steps', 'blue',
  '全体の流れ',
  '4つのステップで進めます',
  'スロープ練習｜個別に声がけし、実車で手順を覚える' || char(10) || 'タイム計測｜一人ずつタイムトライアル' || char(10) || '繁忙期勉強会｜11月7日、レクリエーションを交えて' || char(10) || '表彰・懇親会｜勉強会のあとに表彰と打ち上げ',
  '全体の流れは4つのステップです。まず個別にスロープの練習をして、手順を覚えたらタイムトライアル。11月7日に繁忙期の勉強会を行い、そのあとの懇親会で表彰式を兼ねた打ち上げを行います。'
WHERE NOT EXISTS (SELECT 1 FROM daihon_slides WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル') AND sort_order = 5);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル'), 6, 'content', 'green',
  'STEP 1　スロープ練習',
  '個別に声がけし、実車で手順を覚える',
  '日程は固定せず、一人ひとりの勤務に合わせて声がけ' || char(10) || '先輩・管理者が横について、手順を一つずつ確認' || char(10) || '乗車から運転席に戻るまで、通しで練習' || char(10) || '目安：**10月23日**の一斉行動日までに、全員1回以上' || char(10) || '■ 一人でできるようになったら、タイムトライアルへ',
  'まずはスロープの練習です。全員が同じ日に集まるのは難しいので、一人ひとりの勤務に合わせて声をかけていきます。先輩や管理者が横について、手順を一つずつ確認しながら、最初から最後まで通しで練習します。目安として、10月23日の一斉行動日までに、全員が一度は練習を終えている状態を目指します。'
WHERE NOT EXISTS (SELECT 1 FROM daihon_slides WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル') AND sort_order = 6);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル'), 7, 'steps', 'green',
  'STEP 2　タイムトライアル',
  '計測のルール',
  'スタート｜運転席から、スライドドアを開け始めた時' || char(10) || '乗車・固定｜スロープを出し、お客様を乗せて固定' || char(10) || 'ゴール｜乗務員が運転席に座った時' || char(10) || '■ 速さだけでなく、確実な固定と声かけも確認',
  'タイムトライアルの計測範囲です。運転席からスライドドアを開け始めた瞬間がスタート。スロープを出して車椅子のお客様をお乗せし、固定して、乗務員が運転席に座った時点でゴールです。ただし速さだけを競うのではなく、固定が確実か、お客様への声かけができているかも合わせて確認します。'
WHERE NOT EXISTS (SELECT 1 FROM daihon_slides WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル') AND sort_order = 7);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル'), 8, 'content', 'amber',
  'STEP 3　新卒 繁忙期勉強会',
  '11月7日開催・繁忙期に向けた3つのテーマ',
  '**売上を伸ばす** … 繁忙期の需要をつかむ動き方' || char(10) || '**出番数を増やす** … 体調を整えて乗務に出る' || char(10) || '**トラブルを防ぐ** … 事故・クレームを起こさない' || char(10) || '■ レクリエーションをはさみ、楽しく学ぶ',
  '11月7日は、新卒イベントの第二弾として繁忙期対策の勉強会を行います。テーマは、売上を伸ばすこと、出番数を増やすこと、トラブルなく乗務すること、の3つです。堅苦しくならないよう、レクリエーションをはさみながら進めます。'
WHERE NOT EXISTS (SELECT 1 FROM daihon_slides WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル') AND sort_order = 8);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル'), 9, 'content', 'blue',
  'STEP 4　表彰式・懇親会',
  '勉強会のあと、表彰と打ち上げ',
  'タイムトライアルの結果を発表し、表彰する' || char(10) || '表彰の内容は現在検討中' || char(10) || '同期・先輩・管理者で、ここまでの頑張りをねぎらう' || char(10) || '繁忙期を前に、チームとしての一体感をつくる',
  '勉強会のあとは懇親会です。ここでタイムトライアルの結果を発表し、表彰します。表彰の内容は現在検討中です。同期や先輩、管理者が集まって、ここまでの頑張りをねぎらい、繁忙期に向けて気持ちを一つにする場にします。'
WHERE NOT EXISTS (SELECT 1 FROM daihon_slides WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル') AND sort_order = 9);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル'), 10, 'content', 'slate',
  '期待される効果',
  '',
  '車椅子のお客様を確実にご案内し、クレームを防ぐ' || char(10) || '新卒が自信を持ち、どんなお客様にも対応できる' || char(10) || '繁忙期の売上・出番数アップとトラブル防止' || char(10) || '同期・先輩とのつながりが深まり、定着につながる',
  'この取り組みで期待される効果です。まず、車椅子のお客様を確実にご案内できるようになり、乗車拒否やクレームを防げます。新卒が自信を持って乗務できるようになり、繁忙期の売上や出番数にもつながります。そして、同期や先輩とのつながりが深まることで、長く働いてもらえる環境づくりにもつながると考えています。'
WHERE NOT EXISTS (SELECT 1 FROM daihon_slides WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル') AND sort_order = 10);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル'), 11, 'closing', 'blue',
  'どんなお客様にも、選ばれる乗務員へ。',
  '2026年度 新卒16名の挑戦',
  '',
  '以上が、車椅子乗車タイムトライアルの計画です。どんなお客様にも選ばれる乗務員を目指して、新卒16名の挑戦を応援していただければと思います。ご清聴ありがとうございました。'
WHERE NOT EXISTS (SELECT 1 FROM daihon_slides WHERE deck_id = (SELECT id FROM daihon_decks WHERE title = '車椅子乗車 タイムトライアル') AND sort_order = 11);
