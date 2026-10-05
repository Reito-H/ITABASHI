-- ===================================================
-- migration_172: 台本「年末年始勉強会 レクリエーション30」デッキを追加
--   ・11/7（土）8:00〜15:00 新卒年末年始勉強会のレクリエーション案30個＋進行案（講師3人・休憩計90分）。
--   ・テーブル変更なし。同名デッキがあれば挿入しない。
-- ===================================================

INSERT INTO daihon_decks (title, subtitle, speaker, intro, sort_order)
SELECT '年末年始勉強会 レクリエーション30', '11月7日 新卒 年末年始勉強会', '講師3名', '11/7（土）8:00〜15:00の新卒年末年始勉強会の進行案と、道・渋滞・クレーム・売上・出番数のレクリエーション30案。各案に講師用の進め方と例題（台本欄）つき。', COALESCE((SELECT MAX(sort_order) FROM daihon_decks), -1) + 1
WHERE NOT EXISTS (SELECT 1 FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 0, 'cover', 'blue', '年末年始勉強会 レクリエーション30', '2026年度 新卒イベント 第二弾', '道・渋滞・クレーム・売上・出番数を、遊びながら身につける', '11月7日の年末年始勉強会で使うレクリエーションの案を30個まとめました。座って話を聞く時間を短くして、チーム対抗のゲームで繁忙期の乗務に必要なことを体で覚えてもらいます。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 0);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 1, 'content', 'slate', '勉強会の概要', '11月7日（土）8:00〜15:00', '対象：2026年度入社の新卒 16名（4人×4チーム）' || char(10) || '講師：3名（A・B・C）' || char(10) || '休憩：合計90分（昼60分＋小休憩15分×2）' || char(10) || '進め方：チーム対抗で一日の得点を競う' || char(10) || '■ 終了後、懇親会でタイムトライアル表彰式', '勉強会は8時から15時まで。休憩は昼の60分と、午前・午後の小休憩15分ずつで、合計90分です。新卒16名を4人ずつ4チームに分け、一日を通してチーム対抗で得点を競います。終了後は懇親会で、タイムトライアルの表彰式を行います。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 1);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 2, 'steps', 'blue', '5つのテーマ', 'すべてレクリエーションで学ぶ', '道｜行き先を特定し、地図を頭に' || char(10) || '渋滞｜混む場所・時間を知る' || char(10) || 'クレーム｜受け止めて、こじらせない' || char(10) || '売上｜時間帯ごとの型を持つ' || char(10) || '出番数｜体調を崩さず出番を増やす', '勉強会のテーマは5つです。道、渋滞、クレーム、売上、出番数。どれも講義ではなく、レクリエーションを通して学びます。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 2);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 3, 'content', 'slate', '講師3人の役割', '', '講師A：司会・全体進行／売上（すごろく）' || char(10) || '講師B：道・地理のレクリエーション' || char(10) || '講師C：渋滞・クレームのレクリエーション' || char(10) || '得点係：担当していない講師が交代で記録' || char(10) || '■ ロールプレイとすごろくは、3人で各チームを担当', '講師3人の役割分担の案です。講師Aが司会と全体の進行、売上のすごろくを担当。講師Bが道、講師Cが渋滞とクレームを担当します。担当していない講師は得点の記録やチームのサポートに回ります。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 3);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 4, 'content', 'green', '進行案①　朝（8:00〜10:00）', '30案から選んだ一例（差し替え自由）', '8:00　開会・オリエンテーション（A）' || char(10) || '8:15　No.01 自己紹介／No.03 チーム決め（A）' || char(10) || '8:40　ミニ講義：年末年始の繁忙期とは（A）' || char(10) || '9:00　No.04 行き先当てクイズ（B）' || char(10) || '9:30　No.11 どっちが早い？ルート予想（C）', '朝は8時に開会し、自己紹介とチーム決めで緊張をほぐします。続けて20分だけミニ講義で年末年始の繁忙期の全体像を話し、9時からは道と渋滞のレクリエーションに入ります。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 4);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 5, 'content', 'green', '進行案②　午前（10:00〜12:15）', '30案から選んだ一例（差し替え自由）', '10:00　小休憩（15分）' || char(10) || '10:15　No.06 白地図リレー（B）' || char(10) || '10:45　No.17 NGワード言い換えゲーム（C）' || char(10) || '11:15　昼休憩（60分）', '10時に小休憩をはさみ、白地図リレーとNGワード言い換えゲーム。11時15分から60分の昼休憩です。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 5);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 6, 'content', 'green', '進行案③　午後（12:15〜15:00）', '30案から選んだ一例（差し替え自由）', '12:15　No.16 クレーム対応ロールプレイ（3人）' || char(10) || '13:00　小休憩（15分）' || char(10) || '13:15　No.23 年末乗務すごろく（A・3人で各チーム）' || char(10) || '14:15　No.29 年末シフトパズル（C）' || char(10) || '14:45　No.30 3つ宣言・得点発表・閉会（A）', '午後は講師3人でクレーム対応ロールプレイ。小休憩のあと、メイン企画の年末乗務すごろくを60分。最後にシフトパズルで出番数を考え、3つ宣言とチームの得点発表で15時に閉会します。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 6);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 7, 'content', 'slate', 'レクリエーション30案の見方', '1枚に1案。時間・形式・準備物つき', '見出し：レクリエーション名' || char(10) || 'サブ見出し：番号｜テーマ｜所要時間｜形式' || char(10) || '本文：やり方3ステップ・準備物・ねらい' || char(10) || '台本（ノート）：講師用の進め方と例題' || char(10) || '■ 進行案の枠に、同じ長さの案を入れ替えて使える', 'ここから30案を、テーマごとに1枚ずつ紹介します。サブ見出しにテーマ・時間・形式、本文にやり方と準備物、台本欄に講師用の進め方と例題を書いています。進行案の枠と同じくらいの時間の案と、自由に入れ替えて使ってください。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 7);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 8, 'content', 'slate', 'アイスブレイク・チームづくり', 'No.01〜03　緊張をほぐし、一日を通したチーム対抗の土台をつくる', 'No.01　年末エピソード自己紹介（15分）' || char(10) || 'No.02　乗務あるあるビンゴ（15分）' || char(10) || 'No.03　チーム名とスローガン決め（10分）', 'アイスブレイク・チームづくりのレクリエーションです。ねらいは、緊張をほぐし、一日を通したチーム対抗の土台をつくることです。全部で3案あります。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 8);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 9, 'content', 'slate', '年末エピソード自己紹介', 'No.01｜アイスブレイク｜15分｜全員', '名前と「年末年始の思い出」を一人30秒で話す' || char(10) || '講師が先に手本を見せ、話しやすい空気をつくる' || char(10) || '聞いた人は一言リアクションを返す' || char(10) || '準備：タイマー、話題カード' || char(10) || '■ ねらい：緊張をほぐし、話す・聞くの練習にする', '講師はまず自分の年末の失敗談などを話してハードルを下げます。「去年の大晦日は何をしていた？」「お正月の楽しみは？」などの話題カードを用意しておくと、話が詰まりません。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 9);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 10, 'content', 'slate', '乗務あるあるビンゴ', 'No.02｜アイスブレイク｜15分｜個人', '「道を間違えた」などのマスでビンゴをつくる' || char(10) || '当てはまる人を探して、マスにサインをもらう' || char(10) || '先にビンゴした人から拍手・景品' || char(10) || '準備：ビンゴ用紙（16名分）、ペン' || char(10) || '■ ねらい：同期同士で会話し、悩みを共有する', 'マスの例は「道を間違えたことがある」「お釣りが足りなくなった」「無線の場所が分からなかった」「お客様にほめられた」など。失敗も笑って話せる空気をつくるのがねらいです。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 10);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 11, 'content', 'slate', 'チーム名とスローガン決め', 'No.03｜アイスブレイク｜10分｜チーム', '4人ずつ4チームに分かれる' || char(10) || 'チーム名と「年末に向けたスローガン」を決めて発表' || char(10) || 'このチームで一日の得点を競う' || char(10) || '準備：チーム分け表、ホワイトボード' || char(10) || '■ ねらい：一日を通したチーム対抗の土台をつくる', 'ここで決めたチームで、一日のレクリエーションの得点を合計します。得点はホワイトボードに書き出して、常に見えるようにしておくと盛り上がります。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 11);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 12, 'content', 'blue', '道・地理', 'No.04〜10　曖昧な行き先から目的地を特定し、頭の中に地図をつくる', 'No.04　行き先当てクイズ（30分）' || char(10) || 'No.05　交差点名 早押しクイズ（20分）' || char(10) || 'No.06　白地図リレー（30分）' || char(10) || 'No.07　最短ルート対決（20分）' || char(10) || 'No.08　聞き返しフレーズ大会（20分）' || char(10) || 'No.09　スポット神経衰弱（20分）' || char(10) || 'No.10　ナビなし道案内ゲーム（20分）', '道・地理のレクリエーションです。ねらいは、曖昧な行き先から目的地を特定し、頭の中に地図をつくることです。全部で7案あります。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 12);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 13, 'content', 'blue', '行き先当てクイズ', 'No.04｜道｜30分｜チーム対抗・早押し', '講師がお客様の「曖昧な行き先」を読み上げる' || char(10) || 'チームで相談し、地図で場所を指して回答' || char(10) || '正解後、講師が聞き返し方とルートを解説' || char(10) || '準備：周辺の地図（チーム数分）、問題10問' || char(10) || '■ ねらい：曖昧な行き先から目的地を特定する力', '例題は「池袋の西口の、大きいホテルまで」「区役所の近くの病院まで」など、実際に先輩が言われた行き先を使うと効果的です。答えを当てるだけでなく、どう聞き返せば特定できたかを毎回確認します。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 13);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 14, 'content', 'blue', '交差点名 早押しクイズ', 'No.05｜道｜20分｜チーム対抗', '主要な交差点の写真や地図の一部を映す' || char(10) || '交差点名を早押しで答える' || char(10) || '正解したら、周辺の目印も一言で紹介' || char(10) || '準備：交差点の写真15枚程度、早押しベル' || char(10) || '■ ねらい：指示された地点をすぐ思い浮かべる力', '営業所の周りや、よく呼ばれる駅周辺の交差点から出題します。写真は講師が事前に撮っておくと、実際の見え方で覚えられます。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 14);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 15, 'content', 'blue', '白地図リレー', 'No.06｜道｜30分｜チーム対抗', '主要道路だけ描いた白地図をチームに配る' || char(10) || '一人ずつ交代で、道路名・駅・目印を書き込む' || char(10) || '時間内に正しく書けた数で得点' || char(10) || '準備：白地図（A3）、カラーペン、正解の地図' || char(10) || '■ ねらい：頭の中に地図をつくる（幹線道路の位置関係）', '環七・川越街道・中山道・首都高など、幹線の位置関係を覚えるのが目的です。最後に正解の地図と見比べて、書けなかった所をチームで確認します。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 15);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 16, 'content', 'blue', '最短ルート対決', 'No.07｜道｜20分｜チーム対抗', '出発地と目的地を発表する（例：営業所から羽田空港）' || char(10) || '各チームが地図にルートを引き、理由を説明' || char(10) || '講師がよく使うルートと比べて講評' || char(10) || '準備：地図、ルートのお題5問' || char(10) || '■ ねらい：ルート選びの考え方と、お客様への説明', '「速さ」「料金」「分かりやすさ」のどれを優先したかを説明させると、お客様とのルート相談の練習になります。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 16);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 17, 'content', 'blue', '聞き返しフレーズ大会', 'No.08｜道｜20分｜ペア', '行き先が分からない時の聞き返し方をペアで考える' || char(10) || '感じがよく、確実に特定できるフレーズを発表' || char(10) || '全員で投票し、ベストフレーズを決める' || char(10) || '準備：お題カード（曖昧な行き先）' || char(10) || '■ ねらい：お客様を不安にさせずに確認する言い方', 'よい例：「恐れ入ります、近くに目印になる建物はございますか」。決まったベストフレーズは、勉強会のあとに全員へ配ると現場で使えます。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 17);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 18, 'content', 'blue', 'スポット神経衰弱', 'No.09｜道｜20分｜チーム', '年末年始に呼ばれるスポットのカードを使う' || char(10) || '「スポット名」と「エリア・最寄り駅」を組み合わせる' || char(10) || '当てるごとに、講師が客層と混む時間を解説' || char(10) || '準備：カード（20組程度）' || char(10) || '■ ねらい：季節の需要がある場所を覚える', 'カードは、神社やお寺、大きな商業施設、駅、ホテル、病院などで作ります。当てたあとに「何時ごろ、どんなお客様が多いか」を一言添えるのがポイントです。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 18);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 19, 'content', 'blue', 'ナビなし道案内ゲーム', 'No.10｜道｜20分｜ペア', '一人が口頭だけでルートを説明する' || char(10) || 'もう一人は地図上で、説明どおりに指でなぞる' || char(10) || '目的地に着けたら成功。役を交代する' || char(10) || '準備：地図、お題カード' || char(10) || '■ ねらい：ルートを言葉で説明・確認する力', 'お客様から道順を指示されたときや、こちらからルートを説明するときの練習になります。「2つ目の信号を左」など、聞き間違えにくい言い方を意識させます。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 19);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 20, 'content', 'amber', '渋滞', 'No.11〜15　年末年始の混み方を知り、遅れをクレームにしない', 'No.11　どっちが早い？ルート予想（30分）' || char(10) || 'No.12　渋滞ポイント マップづくり（25分）' || char(10) || 'No.13　遅れを伝える声かけロールプレイ（20分）' || char(10) || 'No.14　混雑カルタ（15分）' || char(10) || 'No.15　首都高 入口・出口クイズ（20分）', '渋滞のレクリエーションです。ねらいは、年末年始の混み方を知り、遅れをクレームにしないことです。全部で5案あります。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 20);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 21, 'content', 'amber', 'どっちが早い？ルート予想', 'No.11｜渋滞｜30分｜チーム投票', '「12月の金曜20時、池袋から羽田」などを出題' || char(10) || '首都高か下道か、チームで予想して投票' || char(10) || '講師が経験と理由を解説し、正解チームに得点' || char(10) || '準備：お題10問（時期・曜日・時間帯つき）' || char(10) || '■ ねらい：年末年始の混み方と、ルート提案の判断', '正解は一つではないこともあります。大事なのは「なぜそう判断したか」です。講師は実際に走った経験をもとに、混む理由（忘年会、買い物、帰省など）をあわせて解説します。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 21);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 22, 'content', 'amber', '渋滞ポイント マップづくり', 'No.12｜渋滞｜25分｜チーム', '年末年始に混む場所を、付箋で地図に貼る' || char(10) || '「いつ・なぜ混むか」を付箋に書き添える' || char(10) || '講師が見落としを足して、完成マップを共有' || char(10) || '準備：大きな地図、付箋、ペン' || char(10) || '■ ねらい：混む場所と時間帯の知識をチームで集める', '完成したマップは写真に撮って、勉強会のあとに共有すると、年末の乗務でそのまま使えます。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 22);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 23, 'content', 'amber', '遅れを伝える声かけロールプレイ', 'No.13｜渋滞｜20分｜ペア', '渋滞で到着が遅れそうな場面を設定する' || char(10) || '運転手役が、状況と見込み時間を先に伝える' || char(10) || '講師が「先に伝える」「選択肢を出す」を講評' || char(10) || '準備：場面カード' || char(10) || '■ ねらい：渋滞をクレームにしない伝え方', 'よい例：「この先が混んでおりまして、10分ほど遅れそうです。高速を使うと早くなりますが、いかがいたしましょう」。黙って走るのが一番クレームになりやすいことを伝えます。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 23);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 24, 'content', 'amber', '混雑カルタ', 'No.14｜渋滞｜15分｜チーム', '講師が「大晦日の23時」などの時刻を読み上げる' || char(10) || '混む場所・お客様が多い場所の札を取る' || char(10) || '取った札の理由を答えられたら得点' || char(10) || '準備：カルタ札（場所の写真や名前）' || char(10) || '■ ねらい：時刻と需要・混雑の結びつきを覚える', '読み札の例：「大晦日の23時」→初詣の神社、「12月の金曜22時」→繁華街、「1月3日の夕方」→駅・空港（Uターン）。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 24);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 25, 'content', 'amber', '首都高 入口・出口クイズ', 'No.15｜渋滞｜20分｜チーム対抗', '目的地を出し、どこから乗りどこで降りるか答える' || char(10) || '料金や所要時間の目安もあわせて確認' || char(10) || '講師が下道との使い分けを解説' || char(10) || '準備：首都高の路線図、お題10問' || char(10) || '■ ねらい：高速の乗り降りを早く判断する', '羽田空港・東京駅・成田方面など、年末年始に多い行き先から出題します。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 25);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 26, 'content', 'green', 'クレーム・接遇', 'No.16〜22　反論から入らず、受け止めて上げる流れを体で覚える', 'No.16　クレーム対応ロールプレイ（45分）' || char(10) || 'No.17　NGワード言い換えゲーム（30分）' || char(10) || 'No.18　第一声コンテスト（15分）' || char(10) || 'No.19　酔客対応シミュレーション（25分）' || char(10) || 'No.20　忘れ物対応リレー（20分）' || char(10) || 'No.21　「こんな時どうする？」カード討論（25分）' || char(10) || 'No.22　クレーム原因探し（20分）', 'クレーム・接遇のレクリエーションです。ねらいは、反論から入らず、受け止めて上げる流れを体で覚えることです。全部で7案あります。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 26);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 27, 'content', 'green', 'クレーム対応ロールプレイ', 'No.16｜クレーム｜45分｜全員・講師3人', '講師がお客様役、新卒が運転手役で演じる' || char(10) || '見ている人が「第一声・落ち着き・解決」を採点' || char(10) || '最後に講師が模範の対応を実演する' || char(10) || '準備：場面カード（遠回り・決済・酔客など）、採点表' || char(10) || '■ ねらい：受け止めて上げる流れを体で覚える', '講師3人がそれぞれ別の場面を担当し、チームを回ります。場面の例は「遠回りしたでしょ」「カードが使えないの？」「到着が遅い」。うまくいかなくても責めず、模範の対応で締めます。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 27);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 28, 'content', 'green', 'NGワード言い換えゲーム', 'No.17｜クレーム｜30分｜チーム対抗', '「知りません」「無理です」などのNGワードを出す' || char(10) || 'チームで丁寧な言い換えを考えて発表' || char(10) || '一番よい言い換えのチームに得点' || char(10) || '準備：NGワードカード20枚' || char(10) || '■ ねらい：とっさの一言でお客様を怒らせない言葉選び', '例：「知りません」→「確認いたします」、「無理です」→「申し訳ございません、こちらでしたら可能です」。答えは一覧にして配ります。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 28);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 29, 'content', 'green', '第一声コンテスト', 'No.18｜クレーム｜15分｜個人', '乗車時の挨拶と行き先確認を一人ずつ実演' || char(10) || '全員で「印象がよかった人」に投票' || char(10) || '上位の人のよかった点を講師がまとめる' || char(10) || '準備：投票用紙' || char(10) || '■ ねらい：第一印象を整え、トラブルの芽を減らす', '声の大きさ、表情、行き先の復唱の3点に注目して見るように伝えます。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 29);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 30, 'content', 'green', '酔客対応シミュレーション', 'No.19｜クレーム｜25分｜グループ', '忘年会帰りの酔ったお客様の場面を講師が演じる' || char(10) || '行き先確認・料金・体調不良時の対応を考える' || char(10) || '危ない時の営業所への連絡手順も確認する' || char(10) || '準備：場面カード、連絡手順の資料' || char(10) || '■ ねらい：年末に増える酔客への安全な対応', '無理をせず、危ないと感じたら営業所に連絡する、を必ず伝えます。車内で体調を崩された場合の対応も確認します。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 30);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 31, 'content', 'green', '忘れ物対応リレー', 'No.20｜クレーム｜20分｜チーム', '「降車後に忘れ物に気づいた」場面を設定する' || char(10) || '発見から営業所連絡・お客様対応までを順番に担当' || char(10) || '手順の抜けがないかを講師がチェック' || char(10) || '準備：手順カード' || char(10) || '■ ねらい：忘れ物を確実に、早くお返しする流れ', '年末は忘れ物が増える時期です。降車時の声かけ（「お忘れ物はございませんか」）もあわせて確認します。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 31);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 32, 'content', 'green', '「こんな時どうする？」カード討論', 'No.21｜クレーム｜25分｜グループ', '迷う場面のカードを引く（例：お釣りが足りない）' || char(10) || 'グループで対応を話し合い、1分で発表' || char(10) || '講師が会社のルールと先輩のコツを補足' || char(10) || '準備：場面カード20枚' || char(10) || '■ ねらい：判断に迷う場面の答えを先に持っておく', 'カードの例：「お釣りが足りない」「行き先が途中で変わった」「車内で吐かれた」「事故を目撃した」。会社のルールがある場面は、必ず正しい手順を確認します。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 32);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 33, 'content', 'green', 'クレーム原因探し', 'No.22｜クレーム｜20分｜グループ', 'よくあるクレームの事例を読み上げる（個人名は伏せる）' || char(10) || '「どこで防げたか」をグループで探す' || char(10) || '防ぐための一言・行動を全員で共有' || char(10) || '準備：事例シート（匿名化したもの）' || char(10) || '■ ねらい：起きる前に防ぐ視点を身につける', '実際の事例を使う場合は、個人や日時が分からないように加工してください。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 33);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 34, 'content', 'blue', '売上向上', 'No.23〜28　時間帯ごとの動き方の「型」を持ち、空車とロスを減らす', 'No.23　年末乗務すごろく（60分）' || char(10) || 'No.24　売上予想クイズ（20分）' || char(10) || 'No.25　1日の売上プランづくり（25分）' || char(10) || 'No.26　「次の一手」即答ゲーム（20分）' || char(10) || 'No.27　付け待ち vs 流し ディベート（25分）' || char(10) || 'No.28　先輩の稼ぎ方インタビュー（25分）', '売上向上のレクリエーションです。ねらいは、時間帯ごとの動き方の「型」を持ち、空車とロスを減らすことです。全部で6案あります。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 34);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 35, 'content', 'blue', '年末乗務すごろく', 'No.23｜売上｜60分｜チーム対抗', 'チームで「年末の1日」を乗務する' || char(10) || '時間帯ごとに動き方を選び、カードで売上が増減' || char(10) || '売上トップのチームを表彰し、勝因を振り返る' || char(10) || '準備：すごろく盤、イベントカード、売上記録表' || char(10) || '■ ねらい：時間帯ごとの「型」と、ロスを減らす動き方', '一日のメイン企画です。カードの例：「忘年会帰りの長距離 +8,000円」「渋滞にはまる 1回休み」「クレーム対応で30分ロス」「降車後すぐ次のお客様 +2,000円」。講師3人がそれぞれチームについて、選んだ理由を聞きながら進めます。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 35);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 36, 'content', 'blue', '売上予想クイズ', 'No.24｜売上｜20分｜チーム対抗', '「年末で一番売れる時間帯は？」などを出題' || char(10) || 'チームで予想して回答' || char(10) || '講師が理由と、その時間帯の動き方を解説' || char(10) || '準備：お題10問' || char(10) || '■ ねらい：需要の波をつかみ、出る時間・場所を決める', '会社の実データを使う場合は、事前に使ってよい範囲を確認してください。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 36);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 37, 'content', 'blue', '1日の売上プランづくり', 'No.25｜売上｜25分｜個人→発表', '年末の出番1日分の目標と、時間帯ごとの動きを書く' || char(10) || '2〜3人が発表し、講師がアドバイス' || char(10) || '自分の勤務に合わせて持ち帰る' || char(10) || '準備：プランシート' || char(10) || '■ ねらい：なりゆきで走らず、1日を組み立てる習慣', '「午前で流れをつくり、夕方から夜で伸ばす」のように、時間帯で分けて考えるよう伝えます。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 37);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 38, 'content', 'blue', '「次の一手」即答ゲーム', 'No.26｜売上｜20分｜チーム対抗', '「22時、住宅地でお客様を降ろした。次は？」と出題' || char(10) || '5秒以内に次の動きを答える' || char(10) || '講師がよい答えと理由を解説' || char(10) || '準備：お題カード15枚' || char(10) || '■ ねらい：降車後に止まらず、空車時間を減らす', '降ろしたあとに止まってしまう時間が一番もったいない、ということを伝えます。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 38);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 39, 'content', 'blue', '付け待ち vs 流し ディベート', 'No.27｜売上｜25分｜2チーム', '「年末の金曜夜は付け待ちと流し、どちらが稼げる？」' || char(10) || '2チームに分かれて理由を出し合う' || char(10) || '講師が場面ごとの使い分けをまとめる' || char(10) || '準備：テーマカード' || char(10) || '■ ねらい：状況に合わせて動き方を切り替える判断', '勝ち負けよりも、「どんな時はどちらが有利か」を整理するのが目的です。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 39);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 40, 'content', 'blue', '先輩の稼ぎ方インタビュー', 'No.28｜売上｜25分｜全員', '講師（先輩）に、年末の稼ぎ方を新卒が質問する' || char(10) || '事前に各チームで質問を3つ考えておく' || char(10) || '印象に残った答えを各自メモする' || char(10) || '準備：質問用紙' || char(10) || '■ ねらい：先輩の実体験から、すぐ使えるコツを得る', '質問の例：「年末で一番稼げた日の動き方は？」「渋滞にはまった時どうする？」「休憩はいつ取る？」'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 40);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 41, 'content', 'slate', '出番数・まとめ', 'No.29〜30　無理なく出番数を増やし、学びを明日からの行動に変える', 'No.29　年末シフトパズル（30分）' || char(10) || 'No.30　明日から使える3つ宣言（15分）', '出番数・まとめのレクリエーションです。ねらいは、無理なく出番数を増やし、学びを明日からの行動に変えることです。全部で2案あります。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 41);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 42, 'content', 'slate', '年末シフトパズル', 'No.29｜出番数・まとめ｜30分｜チーム', '年末の勤務表に、休み・仮眠・出番を組み込む' || char(10) || '体調を崩さずに出番を最大にする組み方を発表' || char(10) || '講師が体調管理のポイントを補足' || char(10) || '準備：勤務表シート、ルール説明' || char(10) || '■ ねらい：無理なく出番数を増やす考え方', '出番数を増やすには、体調を崩さないことが一番です。睡眠・食事・休憩の取り方もあわせて伝えます。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 42);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 43, 'content', 'slate', '明日から使える3つ宣言', 'No.30｜出番数・まとめ｜15分｜個人', '今日学んだことから、明日から使うことを3つ書く' || char(10) || '一人ずつ発表し、全員で拍手' || char(10) || '書いた紙は講師が預かり、年明けに振り返る' || char(10) || '準備：宣言カード' || char(10) || '■ ねらい：学びを行動に変え、続ける約束をする', '最後の締めです。年明けに宣言カードを本人に返して、できたかどうかを一緒に振り返ると定着につながります。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 43);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 44, 'content', 'slate', '準備物チェックリスト', '進行案（一例）で使うもの', 'チーム分け表・得点ボード・タイマー' || char(10) || '周辺の地図（チーム数分）・白地図（A3）・カラーペン' || char(10) || 'ルート予想／NGワード／場面カード' || char(10) || 'すごろく盤・イベントカード・売上記録表' || char(10) || '勤務表シート・宣言カード・採点表', '進行案の一例で使う準備物です。カード類はホシコンや手書きで作れます。地図は営業所周辺のものをチーム数分用意してください。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 44);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 45, 'closing', 'blue', '遊びながら、年末に強くなる。', '2026年度 新卒16名の年末年始勉強会', '', '以上が、年末年始勉強会のレクリエーション案です。当日は楽しみながら、年末の乗務に自信を持って臨めるようにしていきましょう。'
FROM daihon_decks WHERE title = '年末年始勉強会 レクリエーション30' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 45);
