-- ===================================================
-- migration_173: 台本「年末年始勉強会 教材集」デッキを追加（管理者向け）
--   ・レクリエーション30案（migration_172）で使う問題・カード・ルールの中身。全リストは各スライドの台本欄。
--   ・テーブル変更なし。同名デッキがあれば挿入しない。
-- ===================================================

INSERT INTO daihon_decks (title, subtitle, speaker, intro, sort_order)
SELECT '年末年始勉強会 教材集', '管理者向け資料', '講師3名', '11/7 新卒年末年始勉強会のレクリエーション30案で使う問題・カード・ルールの中身。スライドは抜粋、全リストは台本欄（印刷「台本つき」で確認可）。', COALESCE((SELECT MAX(sort_order) FROM daihon_decks), -1) + 1
WHERE NOT EXISTS (SELECT 1 FROM daihon_decks WHERE title = '年末年始勉強会 教材集');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 0, 'cover', 'blue', '年末年始勉強会 教材集', '管理者向け資料', 'レクリエーション30案の中身（問題・カード・ルール）', '11月7日の新卒年末年始勉強会で使う教材の中身をまとめた資料です。レクリエーション30案それぞれについて、実際に使う問題・カード・ルールを載せています。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 0);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 1, 'content', 'slate', 'この資料について', 'ご確認・ご意見をお願いします', '11/7 新卒 年末年始勉強会（8:00〜15:00）の教材' || char(10) || '30案ごとに、問題・カード・ルールを掲載' || char(10) || 'スライドは抜粋。全リストは台本欄に記載' || char(10) || '地域の正解は、講師が当日までに確認・記入' || char(10) || '■ 追加の問題・事例があれば、ぜひお寄せください', 'この資料は、勉強会で使う教材の中身を管理者の皆さんに見ていただくためのものです。スライドには抜粋を載せ、問題やカードの全リストは各スライドの台本欄に書いています。「印刷（台本つき）」で全リストまで確認できます。地域の道や渋滞の正解は、講師が当日までに現地の実情に合わせて確認します。実際にあった行き先・クレーム・事例など、使えそうなものがあれば教えてください。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 1);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 2, 'stat', 'blue', '勉強会の全体像', '', '30案｜道・渋滞・クレーム・売上・出番数' || char(10) || '16名｜新卒を4人×4チームに' || char(10) || '3名｜講師（A・B・C）で進行', 'レクリエーションは全部で30案。新卒16名を4チームに分け、講師3名で進めます。当日はこの中から時間に合わせて10案ほどを選んで実施します。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 2);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 3, 'content', 'slate', 'チーム対抗の得点ルール', 'すべてのレクリエーションで共通', '1位 10点／2位 7点／3位 5点／4位 3点' || char(10) || '個人戦は、上位者のチームに加点' || char(10) || 'よい発言・よい対応には講師がボーナス5点' || char(10) || '得点はホワイトボードで常に表示' || char(10) || '■ 閉会時に最多得点チームを表彰', '一日を通してチーム対抗で得点を競います。各レクリエーションの順位で点数をつけ、よい発言や対応には講師がボーナス点を出します。得点は常に見えるようにしておくと盛り上がります。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 3);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 4, 'content', 'slate', 'アイスブレイク', 'No.01〜03　教材の中身', 'No.01　年末エピソード自己紹介' || char(10) || 'No.02　乗務あるあるビンゴ' || char(10) || 'No.03　チーム名とスローガン決め', 'アイスブレイクのレクリエーションで使う教材です。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 4);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 5, 'content', 'slate', '年末エピソード自己紹介', 'No.01｜教材：話題カード（12枚）', '去年の大晦日、何をしていた？' || char(10) || 'お正月に必ず食べるものは？' || char(10) || '年末年始の一番の思い出は？' || char(10) || '今年がんばったことを一つ' || char(10) || '最近うれしかったお客様の一言' || char(10) || '■ 一人30秒。講師が最初に手本を話す', '【話題カード 全12枚】' || char(10) || '1. 去年の大晦日、何をしていた？' || char(10) || '2. お正月に必ず食べるものは？' || char(10) || '3. 年末年始の一番の思い出は？' || char(10) || '4. 今年がんばったことを一つ' || char(10) || '5. 来年やってみたいことは？' || char(10) || '6. 最近うれしかったお客様の一言' || char(10) || '7. 子どもの頃のお年玉の使い道' || char(10) || '8. 冬になると食べたくなるもの' || char(10) || '9. 初詣はどこへ行く派？' || char(10) || '10. 年末の大掃除、得意？苦手？' || char(10) || '11. 休みの日の過ごし方' || char(10) || '12. 乗務でちょっと自慢できること' || char(10) || '' || char(10) || '【講師の手本例】「去年の大晦日は乗務していました。初詣のお客様が多くて、神社の近くは大渋滞。抜け道を知らずに苦労したので、今日はその話もします。」'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 5);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 6, 'content', 'slate', '乗務あるあるビンゴ', 'No.02｜教材：ビンゴのマス（5×5・中央FREE）', '道を間違えたことがある' || char(10) || 'お釣りが足りなくなった' || char(10) || 'お客様にほめられた' || char(10) || '酔ったお客様を乗せた' || char(10) || '渋滞で焦った' || char(10) || '■ 当てはまる人を探し、マスにサインをもらう', '【マス 全24個（中央はFREE）】' || char(10) || '1. 道を間違えたことがある' || char(10) || '2. お釣りが足りなくなった' || char(10) || '3. 無線の場所が分からなかった' || char(10) || '4. お客様にほめられた' || char(10) || '5. 長距離のお客様を乗せた' || char(10) || '6. 雨の日に忙しかった' || char(10) || '7. 酔ったお客様を乗せた' || char(10) || '8. 忘れ物を見つけた' || char(10) || '9. 空港へ行ったことがある' || char(10) || '10. 高速道路を使った' || char(10) || '11. 行き先を聞き返した' || char(10) || '12. 渋滞で焦った' || char(10) || '13. 外国のお客様を乗せた' || char(10) || '14. お客様と話が盛り上がった' || char(10) || '15. カード決済で戸惑った' || char(10) || '16. 深夜に乗務した' || char(10) || '17. タクシー乗り場で待った' || char(10) || '18. 知らない道を走った' || char(10) || '19. お客様に道を教わった' || char(10) || '20. 休憩を取りそびれた' || char(10) || '21. ナビと違う道を指示された' || char(10) || '22. 1日で20組以上乗せた' || char(10) || '23. 車内の温度で気をつかった' || char(10) || '24. 先輩に助けてもらった' || char(10) || '' || char(10) || '【進め方】用紙を配り、5分間で会場を歩いて当てはまる人からサインをもらいます。同じ人のサインは1枚に2つまで。先にビンゴした人から順位をつけます。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 6);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 7, 'content', 'slate', 'チーム名とスローガン決め', 'No.03｜教材：チーム分け・スローガン例', '4人×4チーム（入社時期・営業所が偏らないように）' || char(10) || 'チーム名は自由（例：環七ライダーズ）' || char(10) || 'スローガン例：迷わず・焦らず・事故ゼロ' || char(10) || 'スローガン例：年末は笑顔で稼ぐ' || char(10) || 'スローガン例：聞き返しは恥じゃない' || char(10) || '■ 1チーム1分で発表、講師がボーナス点', 'チーム分けは、仲のよい人同士が固まらないよう講師側で事前に決めておきます。スローガンは「年末に向けて大事にしたいこと」を一言で。発表がよかったチームにボーナス点を出して、最初から得点を動かします。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 7);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 8, 'content', 'blue', '道・地理', 'No.04〜10　教材の中身', 'No.04　行き先当てクイズ' || char(10) || 'No.05　交差点名 早押しクイズ' || char(10) || 'No.06　白地図リレー' || char(10) || 'No.07　最短ルート対決' || char(10) || 'No.08　聞き返しフレーズ大会' || char(10) || 'No.09　スポット神経衰弱' || char(10) || 'No.10　ナビなし道案内ゲーム', '道・地理のレクリエーションで使う教材です。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 8);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 9, 'content', 'blue', '行き先当てクイズ', 'No.04｜教材：曖昧な行き先のお題（10問）', '「池袋の西口の、大きいホテルまで」' || char(10) || '「駅の向こうの大きいスーパー」' || char(10) || '「区役所の近くの病院まで」' || char(10) || '「いつもの所まで（常連風）」' || char(10) || '「大山の商店街を抜けた先」' || char(10) || '■ 答えより「どう聞き返せば特定できるか」が得点', '【お題 全10問と聞き返しのポイント】' || char(10) || '1. 「池袋の西口の、大きいホテルまで」→ どのホテルか名前を確認。「〇〇ホテルでよろしいですか」' || char(10) || '2. 「駅の向こうの大きいスーパー」→ どの出口側か、店名を確認' || char(10) || '3. 「区役所の近くの病院まで」→ 病院名と、入口（正面・救急）を確認' || char(10) || '4. 「いつもの所まで（常連風）」→ 「恐れ入ります、念のため住所か目印を」' || char(10) || '5. 「大山の商店街を抜けた先」→ 商店街のどちら側か、近くの目印を確認' || char(10) || '6. 「高速の入口の近くのマンション」→ どの入口か、マンション名を確認' || char(10) || '7. 「国道沿いのファミレス」→ 国道名と店の名前、上り下りどちら側か' || char(10) || '8. 「お寺の隣の公園」→ お寺の名前、公園の名前を確認' || char(10) || '9. 「成増駅の、バスが出てる方」→ 北口・南口を確認' || char(10) || '10. 「新しくできた大きいビル」→ ビル名、近くの駅を確認' || char(10) || '' || char(10) || '※実際の答えは、講師が営業所周辺の実情に合わせて当日までに決めておきます。先輩が実際に言われた行き先に差し替えるとさらに効果的です。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 9);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 10, 'content', 'blue', '交差点名 早押しクイズ', 'No.05｜教材：出題リスト（写真15枚）', '営業所周辺の交差点：5枚' || char(10) || 'よく呼ばれる駅前の交差点：5枚' || char(10) || '幹線道路の主要交差点：5枚' || char(10) || '例：大和町（環七×中山道）' || char(10) || '例：熊野町（山手通り×川越街道）' || char(10) || '■ 写真は講師が事前に撮影。正解後に周辺の目印を紹介', '写真は、実際に運転席から見える角度で撮るのがポイントです。正解したら「この交差点の近くには何がある？」と一言聞き、目印とセットで覚えてもらいます。交差点の例は、講師が現地で名前を確認してから使ってください。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 10);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 11, 'content', 'blue', '白地図リレー', 'No.06｜教材：書き込む項目と採点', '道路：環七・環八・中山道・川越街道・山手通り' || char(10) || '高速：首都高5号池袋線（入口・出口）' || char(10) || '駅：池袋・板橋・大山・成増・高島平 ほか' || char(10) || '目印：区役所・主要な病院・大きな商業施設' || char(10) || '採点：正しい位置1項目＝1点（制限時間10分）' || char(10) || '■ 最後に正解の地図と見比べ、書けなかった所を確認', '白地図は主要道路の線だけを描いたA3用紙を用意します。一人30秒ずつ交代で書き込み、チームで合計点を競います。正解の地図は講師が用意してください。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 11);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 12, 'content', 'blue', '最短ルート対決', 'No.07｜教材：ルートのお題（5問）', '営業所 → 羽田空港' || char(10) || '営業所 → 東京駅' || char(10) || '池袋駅 → 成田空港' || char(10) || '大山 → 新宿駅' || char(10) || '成増 → 浅草（初詣）' || char(10) || '■ 評価：速さ・料金・お客様への説明のしやすさ', '各チームが地図にルートを引き、なぜそのルートかを1分で説明します。講師は、実際によく使うルートと、時間帯によって変わる点（年末の渋滞など）を解説します。正解は一つではないので、説明の筋道を評価してください。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 12);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 13, 'content', 'blue', '聞き返しフレーズ大会', 'No.08｜教材：ベストフレーズ例とNG例', 'よい例：「近くに目印になる建物はございますか」' || char(10) || 'よい例：「念のため、ご住所を伺えますか」' || char(10) || 'よい例：「〇〇の前でよろしいでしょうか」' || char(10) || 'NG例：「え、どこですか？」' || char(10) || 'NG例：「分かんないです」' || char(10) || '■ 決まったベストフレーズは全員に配布', 'ペアでフレーズを考え、感じのよさと確実さの両方で投票します。NG例はあえて講師が演じて見せると、違いが分かりやすくなります。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 13);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 14, 'content', 'blue', 'スポット神経衰弱', 'No.09｜教材：カード（スポット×エリア）', '明治神宮 ⇔ 原宿・代々木（初詣）' || char(10) || '浅草寺 ⇔ 浅草（初詣）' || char(10) || '羽田空港 ⇔ 帰省・旅行' || char(10) || '東京駅 ⇔ 帰省・新幹線' || char(10) || 'アメ横 ⇔ 上野（年末の買い物）' || char(10) || '池袋の百貨店 ⇔ 池袋（年末の買い物）' || char(10) || '■ 当てたら講師が「何時ごろ、どんなお客様が多いか」を解説', '【カード 例10組】' || char(10) || '1. 明治神宮 ⇔ 原宿・代々木（初詣）' || char(10) || '2. 浅草寺 ⇔ 浅草（初詣）' || char(10) || '3. 羽田空港 ⇔ 帰省・旅行' || char(10) || '4. 東京駅 ⇔ 帰省・新幹線' || char(10) || '5. アメ横 ⇔ 上野（年末の買い物）' || char(10) || '6. 池袋の百貨店 ⇔ 池袋（年末の買い物）' || char(10) || '7. 繁華街の飲食店街 ⇔ 忘年会・新年会' || char(10) || '8. 成田空港 ⇔ 年末年始の海外旅行' || char(10) || '9. 大きなホテル ⇔ 忘年会・年越しイベント' || char(10) || '10. 病院の救急入口 ⇔ 年末年始の急病' || char(10) || '' || char(10) || '※残りの10組は、営業所周辺の神社・商店街・駅などで講師が作ります。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 14);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 15, 'content', 'blue', 'ナビなし道案内ゲーム', 'No.10｜教材：お題と伝え方のコツ', 'お題：営業所から最寄り駅まで' || char(10) || 'お題：駅から区役所まで' || char(10) || 'コツ：「2つ目の信号を左」と数で伝える' || char(10) || 'コツ：目印（コンビニ・ガソリンスタンド）を入れる' || char(10) || 'コツ：曲がる前に一度、確認の言葉を挟む' || char(10) || '■ 地図上を正しくなぞれたら成功', 'お客様から道順を指示されるときや、こちらからルートを相談するときの練習です。聞く側は分からなければ必ず聞き返すルールにすると、確認の練習にもなります。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 15);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 16, 'content', 'amber', '渋滞', 'No.11〜15　教材の中身', 'No.11　どっちが早い？ルート予想' || char(10) || 'No.12　渋滞ポイント マップづくり' || char(10) || 'No.13　遅れを伝える声かけロールプレイ' || char(10) || 'No.14　混雑カルタ' || char(10) || 'No.15　首都高 入口・出口クイズ', '渋滞のレクリエーションで使う教材です。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 16);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 17, 'content', 'amber', 'どっちが早い？ルート予想', 'No.11｜教材：お題（10問）', '12月の金曜20時　池袋 → 羽田空港' || char(10) || '12月30日 朝7時　営業所 → 東京駅' || char(10) || '大晦日 23時　営業所 → 浅草' || char(10) || '1月3日 夕方　羽田空港 → 板橋' || char(10) || '12月の土曜15時　営業所 → 池袋の百貨店' || char(10) || '■ 正解より「なぜそう判断したか」を重視', '【お題 全10問（判断のポイント）】' || char(10) || '1. 12月の金曜20時　池袋 → 羽田空港：首都高か下道か' || char(10) || '2. 12月30日 朝7時　営業所 → 東京駅：首都高か下道か' || char(10) || '3. 大晦日 23時　営業所 → 浅草：どこで降ろすのが早いか（交通規制）' || char(10) || '4. 1月3日 夕方　羽田空港 → 板橋：首都高の上りは混むか' || char(10) || '5. 12月の土曜15時　営業所 → 池袋の百貨店：どの入口に着けるか' || char(10) || '6. 雨の平日 18時　大山 → 新宿：山手通りか、別ルートか' || char(10) || '7. 忘年会シーズン 23時　新宿 → 成増：高速を使う価値はあるか' || char(10) || '8. 12月29日 昼　営業所 → 成田空港：出発の何時間前に着けばよいか' || char(10) || '9. 元日 0時　営業所周辺の神社へ：近くまで行けるか' || char(10) || '10. 仕事納めの夜　池袋 → 板橋：どの道が混むか' || char(10) || '' || char(10) || '※答えは講師の実際の経験で解説します。混む理由（忘年会・買い物・帰省・初詣・交通規制）をあわせて伝えてください。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 17);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 18, 'content', 'amber', '渋滞ポイント マップづくり', 'No.12｜教材：付箋に書く観点', '百貨店・商店街：12月の週末の午後' || char(10) || '繁華街：金曜・忘年会シーズンの夜' || char(10) || '神社・お寺：大晦日の夜〜三が日' || char(10) || '空港・駅：年末の前半と1月2〜3日' || char(10) || '首都高：帰省とUターンの時間帯' || char(10) || '■ 付箋は「場所・いつ・なぜ」の3点を書く', '大きな地図に、チームで付箋を貼っていきます。講師は見落としを足し、最後に完成マップを写真で共有します。年末の乗務でそのまま使える資料になります。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 18);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 19, 'content', 'amber', '遅れを伝える声かけロールプレイ', 'No.13｜教材：場面カードと模範トーク', '場面：空港行き、首都高が事故で渋滞' || char(10) || '場面：新幹線の時間が迫っている' || char(10) || '場面：初詣の交通規制で近くまで行けない' || char(10) || '模範：「10分ほど遅れそうです」と先に伝える' || char(10) || '模範：「高速を使いますか」と選択肢を出す' || char(10) || '■ 黙って走るのが一番クレームになりやすい', '声かけのポイントは3つ。①先に伝える、②見込み時間を伝える、③選択肢を出す。お客様に選んでもらうと、遅れてもクレームになりにくくなります。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 19);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 20, 'content', 'amber', '混雑カルタ', 'No.14｜教材：読み札と取り札（10組）', '大晦日の23時 → 初詣の神社・お寺' || char(10) || '12月の金曜22時 → 繁華街・飲食店街' || char(10) || '1月3日の夕方 → 駅・空港（Uターン）' || char(10) || '12月29日の朝 → 空港・東京駅（帰省）' || char(10) || '12月の土曜15時 → 百貨店・商店街' || char(10) || '仕事納めの夜 → オフィス街・繁華街' || char(10) || '■ 札を取ったら理由を答えて得点', '【読み札 → 取り札 全10組】' || char(10) || '1. 大晦日の23時 → 初詣の神社・お寺' || char(10) || '2. 12月の金曜22時 → 繁華街・飲食店街' || char(10) || '3. 1月3日の夕方 → 駅・空港（Uターン）' || char(10) || '4. 12月29日の朝 → 空港・東京駅（帰省）' || char(10) || '5. 12月の土曜15時 → 百貨店・商店街' || char(10) || '6. 仕事納めの夜 → オフィス街・繁華街' || char(10) || '7. 元日の昼 → 神社・親戚の家への移動' || char(10) || '8. 年末の深夜2時 → 繁華街（終電後）' || char(10) || '9. 雪の朝 → 駅・病院' || char(10) || '10. 12月24日の夜 → レストラン・ホテル'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 20);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 21, 'content', 'amber', '首都高 入口・出口クイズ', 'No.15｜教材：お題と確認すること', 'お題：営業所から羽田空港' || char(10) || 'お題：営業所から東京駅' || char(10) || 'お題：営業所から成田空港' || char(10) || '確認：どこから乗り、どこで降りるか' || char(10) || '確認：料金と所要時間の目安、下道との差' || char(10) || '■ 正解は講師が路線図で確認してから出題', '首都高の路線図を配り、チームで乗り口と降り口を答えます。料金の目安や、時間帯によって下道の方が早い場合があることもあわせて解説してください。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 21);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 22, 'content', 'green', 'クレーム・接遇', 'No.16〜22　教材の中身', 'No.16　クレーム対応ロールプレイ' || char(10) || 'No.17　NGワード言い換えゲーム' || char(10) || 'No.18　第一声コンテスト' || char(10) || 'No.19　酔客対応シミュレーション' || char(10) || 'No.20　忘れ物対応リレー' || char(10) || 'No.21　「こんな時どうする？」カード討論' || char(10) || 'No.22　クレーム原因探し', 'クレーム・接遇のレクリエーションで使う教材です。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 22);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 23, 'content', 'green', 'クレーム対応ロールプレイ（場面）', 'No.16｜教材：場面カード（8枚）', '「遠回りしたでしょ」と言われた' || char(10) || '「カードが使えないの？」と怒られた' || char(10) || '「到着が遅い」と言われた（迎車）' || char(10) || '「運転が荒い」と言われた' || char(10) || '「たばこ臭い」と言われた' || char(10) || '「さっきの道でよかったの？」と聞かれた', '【場面カード 全8枚】' || char(10) || '1. 「遠回りしたでしょ」と言われた' || char(10) || '2. 「カードが使えないの？」と怒られた' || char(10) || '3. 「到着が遅い」と言われた（迎車）' || char(10) || '4. 「運転が荒い」と言われた' || char(10) || '5. 「たばこ臭い」と言われた' || char(10) || '6. 「さっきの道でよかったの？」と聞かれた' || char(10) || '7. お釣りが足りないと言われた' || char(10) || '8. 「無愛想だ」と言われた' || char(10) || '' || char(10) || '講師3人がお客様役となり、それぞれ別の場面でチームを回ります。新卒は運転手役として対応し、見ている人が採点します。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 23);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 24, 'content', 'green', 'クレーム対応ロールプレイ（採点）', 'No.16｜教材：採点表と模範の流れ', '採点①：第一声（受け止めの言葉が出たか）5点' || char(10) || '採点②：落ち着き（声・表情・言い返さない）5点' || char(10) || '採点③：解決（提案・記録・報告）5点' || char(10) || '模範の流れ：受け止める → 事実確認 → 提案' || char(10) || 'その場で結論が出なければ、記録して営業所へ' || char(10) || '■ 最後に講師が模範の対応を実演', '模範の流れは「受け止める→事実を確認する→提案する→記録して営業所へ上げる」。うまくいかなかった新卒を責めず、模範の対応で締めることが大切です。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 24);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 25, 'content', 'green', 'NGワード言い換えゲーム', 'No.17｜教材：NGワードと言い換え例', '「知りません」→「確認いたします」' || char(10) || '「分かりません」→「もう一度伺えますか」' || char(10) || '「ちょっと待って」→「少々お待ちください」' || char(10) || '「ナビ通りです」→「このルートでよろしいですか」' || char(10) || '■ チームで言い換えを考え、よい言い換えに得点', '【NGワード → 言い換え例 全12組】' || char(10) || '1. 「知りません」→「確認いたします」' || char(10) || '2. 「無理です」→「申し訳ございません、こちらでしたら可能です」' || char(10) || '3. 「分かりません」→「恐れ入ります、もう一度伺えますか」' || char(10) || '4. 「ちょっと待って」→「少々お待ちいただけますか」' || char(10) || '5. 「それはできません」→「申し訳ございません。代わりに〇〇はいかがでしょう」' || char(10) || '6. 「ナビ通りです」→「こちらのルートでよろしいでしょうか」' || char(10) || '7. 「混んでるんで」→「この先が混雑しておりまして」' || char(10) || '8. 「え？」→「恐れ入ります」' || char(10) || '9. 「いいですよ」→「かしこまりました」' || char(10) || '10. 「すみません（軽く）」→「大変申し訳ございません」' || char(10) || '11. 「カードは無理」→「申し訳ございません、こちらのお支払い方法でしたら可能です」' || char(10) || '12. 「そこは行けません」→「申し訳ございません、手前でよろしいでしょうか」' || char(10) || '' || char(10) || '※残りは講師が現場でよく聞く言葉で追加してください。答えの一覧は勉強会のあとに配ります。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 25);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 26, 'content', 'green', '第一声コンテスト', 'No.18｜教材：模範フレーズと採点', '乗車時：「ご乗車ありがとうございます」' || char(10) || '行き先：「〇〇まででございますね」（復唱）' || char(10) || 'ルート：「〇〇通りでよろしいでしょうか」' || char(10) || '採点：声の大きさ・表情・復唱 各5点' || char(10) || '■ 上位の人のよかった点を講師がまとめる', '一人ずつ前に出て、乗車時の挨拶から行き先の復唱、ルートの確認までを実演します。全員で投票し、上位の人のよかった点を講師が言葉にして共有します。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 26);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 27, 'content', 'green', '酔客対応シミュレーション', 'No.19｜教材：場面と対応のポイント', '場面：行き先をはっきり言えない' || char(10) || '場面：車内で気分が悪くなった' || char(10) || '場面：大声を出す・からんでくる' || char(10) || 'ポイント：安全第一。無理をしない' || char(10) || 'ポイント：危ないと感じたら営業所に連絡' || char(10) || '■ 会社のルールに沿った手順を必ず確認', '年末は酔ったお客様が増えます。行き先の確認、体調が悪くなったときの対応、危険を感じたときの連絡手順を、会社のルールに沿って確認してください。新卒が一人で抱え込まないことを強調します。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 27);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 28, 'content', 'green', '忘れ物対応リレー', 'No.20｜教材：手順カード（5枚）', '① 降車時に「お忘れ物はございませんか」' || char(10) || '② お客様が降りたら車内（座席・足元）を確認' || char(10) || '③ 見つけたら営業所に連絡' || char(10) || '④ LINEの報告（忘れ物報告）で記録' || char(10) || '⑤ 営業所の指示でお客様へお返しする' || char(10) || '■ チームで順番に担当し、抜けがないか確認', '年末は忘れ物が増える時期です。降車時の声かけと車内確認、見つけたときの連絡と記録（LINEの忘れ物報告）までを、チームでリレー形式で確認します。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 28);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 29, 'content', 'green', '「こんな時どうする？」カード討論', 'No.21｜教材：場面カード（20枚）', 'お釣りが足りない' || char(10) || '行き先が途中で変わった' || char(10) || '車内で吐かれてしまった' || char(10) || '事故を目撃した' || char(10) || 'お客様が料金を払えないと言う' || char(10) || '車内に財布が落ちていた' || char(10) || '■ 1分で発表。講師が会社のルールを補足', '【場面カード 全20枚】' || char(10) || '1. お釣りが足りない' || char(10) || '2. 行き先が途中で変わった' || char(10) || '3. 車内で吐かれてしまった' || char(10) || '4. 事故を目撃した' || char(10) || '5. お客様が料金を払えないと言う' || char(10) || '6. 車内に財布が落ちていた' || char(10) || '7. お客様が体調を崩した' || char(10) || '8. ナビと違う道を指示された' || char(10) || '9. 子ども連れでチャイルドシートの相談' || char(10) || '10. ペット連れのお客様' || char(10) || '11. 大きな荷物がトランクに入らない' || char(10) || '12. 乗車中にお客様が寝てしまった' || char(10) || '13. 外国のお客様で言葉が通じない' || char(10) || '14. 迎車先にお客様がいない' || char(10) || '15. 渋滞で予約時間に間に合わない' || char(10) || '16. 車椅子のお客様から手が挙がった' || char(10) || '17. 領収書を何枚もほしいと言われた' || char(10) || '18. お客様同士がけんかを始めた' || char(10) || '19. 車が故障した' || char(10) || '20. 自分の体調が悪くなった' || char(10) || '' || char(10) || '※会社のルールがある場面（事故・故障・料金・車椅子など）は、必ず正しい手順を講師が確認してください。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 29);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 30, 'content', 'green', 'クレーム原因探し', 'No.22｜教材：事例（架空・4件）', '遠回りの苦情 → 乗車直後にルート確認' || char(10) || '遅いという苦情 → 遅れを先に伝える' || char(10) || '態度の苦情 → 挨拶と行き先の復唱' || char(10) || '忘れ物の連絡遅れ → 降車ごとに車内確認' || char(10) || '■ 実例は個人や日時が分からないよう加工', '【事例 → 原因 → 防ぐ一言・行動】' || char(10) || '1. 「遠回りされた」と苦情／原因：乗車直後にルートを確認していなかった／防ぐには：「〇〇通りでよろしいですか」の一言' || char(10) || '2. 「到着が遅い」と苦情／原因：渋滞の連絡をしなかった／防ぐには：遅れそうな時点で先に伝える' || char(10) || '3. 「態度が悪い」と苦情／原因：行き先を復唱せず無言で発車／防ぐには：挨拶と復唱' || char(10) || '4. 忘れ物の連絡が遅れた／原因：降車後に車内を確認しなかった／防ぐには：降車ごとの車内確認' || char(10) || '' || char(10) || 'グループで「どこで防げたか」を探し、防ぐための一言・行動を全員で共有します。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 30);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 31, 'content', 'blue', '売上向上', 'No.23〜28　教材の中身', 'No.23　年末乗務すごろく' || char(10) || 'No.24　売上予想クイズ' || char(10) || 'No.25　1日の売上プランづくり' || char(10) || 'No.26　「次の一手」即答ゲーム' || char(10) || 'No.27　付け待ち vs 流し ディベート' || char(10) || 'No.28　先輩の稼ぎ方インタビュー', '売上向上のレクリエーションで使う教材です。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 31);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 32, 'content', 'blue', '年末乗務すごろく（ルール）', 'No.23｜教材：ルール', 'チームで「年末の1日」（8:00〜翌2:00）を乗務' || char(10) || '時間帯ごとに動き方を3択で選ぶ' || char(10) || 'サイコロとイベントカードで売上が増減' || char(10) || '途中で休憩マスに止まると体力回復（取らないと減点）' || char(10) || '■ 売上が一番多いチームの勝ち。勝因を発表', '一日のメイン企画です。チームで相談して時間帯ごとに動き方を選び、サイコロとカードで売上が増えたり減ったりします。休憩を取らずに走り続けると減点になるルールで、体調管理の大切さも伝えます。講師3人がそれぞれチームについて、選んだ理由を聞きながら進めます。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 32);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 33, 'content', 'blue', '年末乗務すごろく（盤）', 'No.23｜教材：盤の流れ（時間帯マス）', '朝｜8〜11時。通院・駅・帰省客' || char(10) || '昼｜11〜16時。買い物・空港' || char(10) || '夕方｜16〜19時。帰宅・雨で需要増' || char(10) || '夜｜19〜24時。忘年会・繁華街' || char(10) || '深夜｜0〜2時。終電後・長距離', '盤は5つの時間帯に分かれ、それぞれに「駅で待つ」「繁華街を流す」「住宅地へ向かう」の3つのマスがあります。選んだマスで引くカードの種類が変わります。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 33);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 34, 'content', 'blue', '年末乗務すごろく（カード）', 'No.23｜教材：イベントカード（抜粋）', '忘年会帰りの長距離　+8,000円' || char(10) || '降車後すぐ次のお客様　+2,000円' || char(10) || '渋滞にはまる　1回休み' || char(10) || 'クレーム対応で30分ロス　1回休み' || char(10) || '■ 良いカード＝学んだ行動、悪いカード＝ロスの原因', '【イベントカード 全16枚（さらに増やして可）】' || char(10) || '1. 忘年会帰りの長距離　+8,000円' || char(10) || '2. 空港まで送迎　+6,000円' || char(10) || '3. 降車後すぐ次のお客様　+2,000円' || char(10) || '4. 雨で駅に行列　+3,000円' || char(10) || '5. 常連さんから指名　+2,500円' || char(10) || '6. 初詣のお客様が続く　+3,000円' || char(10) || '7. 渋滞にはまる　1回休み' || char(10) || '8. 道を間違えた　−1,500円' || char(10) || '9. クレーム対応で30分ロス　1回休み' || char(10) || '10. 忘れ物を届ける　±0円・ボーナス点' || char(10) || '11. 休憩を取らず眠気　−2,000円' || char(10) || '12. 車内清掃が必要　1回休み' || char(10) || '13. 行き先を聞き返して正確に到着　+1,000円' || char(10) || '14. 遅れを先に伝えて感謝された　+1,000円' || char(10) || '15. 付け待ちが長引く　−1,000円' || char(10) || '16. ルートを提案して喜ばれた　+1,500円' || char(10) || '' || char(10) || 'カードの内容は、午前のレクリエーション（道・渋滞・クレーム）で学んだことと結びつけています。カードを引くたびに「なぜ増えた／減ったか」を一言確認すると、振り返りになります。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 34);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 35, 'content', 'blue', '売上予想クイズ', 'No.24｜教材：お題（10問）', '年末で一番売上が高い曜日は？' || char(10) || '12月で長距離が一番多い時間帯は？' || char(10) || '雨の日、売上はどのくらい増える？' || char(10) || '1月1日、お客様が一番多い時間帯は？' || char(10) || '年末、空港へのお客様が一番多い日は？' || char(10) || '■ 答えは講師が昨年の実績・経験から確認', '【お題 全10問】' || char(10) || '1. 年末で一番売上が高い曜日は？' || char(10) || '2. 12月で長距離が一番多い時間帯は？' || char(10) || '3. 雨の日、売上はどのくらい増える？' || char(10) || '4. 1月1日、お客様が一番多い時間帯は？' || char(10) || '5. 年末、空港へのお客様が一番多い日は？' || char(10) || '6. 忘年会シーズン、繁華街が一番混む時間は？' || char(10) || '7. 12月と1月、売上が高いのはどっち？' || char(10) || '8. 年末、駅の付け待ちが一番短い時間帯は？' || char(10) || '9. 三が日で一番忙しいのは何日？' || char(10) || '10. 年末の深夜、長距離の行き先で多い方面は？' || char(10) || '' || char(10) || '※答えは、会社の売上データを使う場合は使ってよい範囲を確認したうえで、講師が事前に用意します。データを使わない場合は、先輩の経験で解説します。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 35);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 36, 'content', 'blue', '1日の売上プランづくり', 'No.25｜教材：プランシートの項目', '今日の売上目標：　　　円' || char(10) || '朝（〜11時）：どこで、何をする' || char(10) || '昼〜夕方：どこで、何をする' || char(10) || '夜〜深夜：どこで、何をする' || char(10) || '休憩：いつ、どこで取る' || char(10) || '■ 2〜3人が発表し、講師がアドバイス', 'プランシートは、目標と時間帯ごとの動き、休憩の予定を書く1枚もの。書いたシートは持ち帰り、年末の乗務で実際に試してもらいます。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 36);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 37, 'content', 'blue', '「次の一手」即答ゲーム', 'No.26｜教材：お題と考え方の例', '22時、住宅地で降車 → 駅か繁華街へ' || char(10) || '8時、駅前で降車 → 乗り場の列を見る' || char(10) || '23時、繁華街で降車 → そのまま流す' || char(10) || '1時、郊外で降車 → 流しながら戻る' || char(10) || '■ 5秒以内に答える。講師が理由を解説', '【お題 → 考え方の例】' || char(10) || '1. 22時、住宅地で降車 → 最寄り駅か繁華街方面へ戻る' || char(10) || '2. 8時、駅前で降車 → 駅の乗り場の列を見て判断' || char(10) || '3. 14時、病院で降車 → 病院の乗り場か、近くの商業施設へ' || char(10) || '4. 23時、繁華街で降車 → そのまま繁華街で流す' || char(10) || '5. 1時、郊外で降車 → 帰庫か、幹線沿いで流しながら戻る' || char(10) || '6. 雨の17時、オフィス街で降車 → 駅方面・オフィス街で流す' || char(10) || '7. 元日の10時、神社近くで降車 → 初詣のお客様が多い出入口付近へ' || char(10) || '8. 12月29日の朝、空港で降車 → 空港の乗り場の状況を見て判断' || char(10) || '' || char(10) || '※考え方の例は一つの目安です。営業所周辺の実情に合わせて、講師が解説してください。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 37);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 38, 'content', 'blue', '付け待ち vs 流し ディベート', 'No.27｜教材：テーマ（5つ）', '年末の金曜夜は、付け待ちと流しどちらが稼げる？' || char(10) || '雨の日は、駅で待つか住宅地を流すか？' || char(10) || '元日は、初詣の神社に行くべきか？' || char(10) || '深夜の長距離は、受けた方がよいか？' || char(10) || '忙しい日ほど、休憩は取るべきか？' || char(10) || '■ 勝ち負けより「どんな時はどちらが有利か」を整理', '【ディベートのテーマ】' || char(10) || '1. 年末の金曜夜は、付け待ちと流しどちらが稼げる？' || char(10) || '2. 雨の日は、駅で待つか住宅地を流すか？' || char(10) || '3. 元日は、初詣の神社に行くべきか？' || char(10) || '4. 深夜の長距離は、受けた方がよいか？' || char(10) || '5. 忙しい日ほど、休憩は取るべきか？' || char(10) || '' || char(10) || '2チームに分かれて5分ずつ理由を出し合い、講師が場面ごとの使い分けをまとめます。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 38);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 39, 'content', 'blue', '先輩の稼ぎ方インタビュー', 'No.28｜教材：質問例（10問）', '年末で一番稼げた日の動き方は？' || char(10) || '渋滞にはまった時、どうしている？' || char(10) || '休憩はいつ、どこで取っている？' || char(10) || '新人の頃に一番困ったことは？' || char(10) || 'クレームを受けた時、どう乗り切った？' || char(10) || '雨の日に必ずやることは？', '【質問例 全10問】' || char(10) || '1. 年末で一番稼げた日の動き方は？' || char(10) || '2. 渋滞にはまった時、どうしている？' || char(10) || '3. 休憩はいつ、どこで取っている？' || char(10) || '4. 新人の頃に一番困ったことは？' || char(10) || '5. クレームを受けた時、どう乗り切った？' || char(10) || '6. 雨の日に必ずやることは？' || char(10) || '7. 年末に気をつけている体調管理は？' || char(10) || '8. お客様に喜ばれた一言は？' || char(10) || '9. 道を覚えたコツは？' || char(10) || '10. 「これだけはやめておけ」ということは？' || char(10) || '' || char(10) || '事前に各チームで質問を3つ考えておき、講師（先輩）に質問します。印象に残った答えは各自メモします。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 39);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 40, 'content', 'slate', '出番数・まとめ', 'No.29〜30　教材の中身', 'No.29　年末シフトパズル' || char(10) || 'No.30　明日から使える3つ宣言', '出番数・まとめのレクリエーションで使う教材です。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 40);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 41, 'content', 'slate', '年末シフトパズル', 'No.29｜教材：ルールと評価', '期間：12月20日〜1月5日の勤務表' || char(10) || '条件：会社の勤務ルールの範囲で組む' || char(10) || '休み・仮眠・出番をチームで組み込む' || char(10) || '評価：出番数と、しっかり休めているか' || char(10) || '■ 講師が体調管理（睡眠・食事・休憩）を補足', '勤務表のシートに、休み・仮眠・出番を組み込んでいきます。出番を増やしすぎて休めていない組み方は減点です。出番数を増やすには体調を崩さないことが一番、ということを伝えます。勤務のルールは会社の規定に合わせて講師が説明してください。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 41);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 42, 'content', 'slate', '明日から使える3つ宣言', 'No.30｜教材：宣言カード', '宣言カード：名前・チーム名' || char(10) || '明日から使うこと ①' || char(10) || '明日から使うこと ②' || char(10) || '明日から使うこと ③' || char(10) || '■ 一人ずつ発表。カードは講師が預かり、年明けに振り返る', '最後の締めです。今日学んだことから明日から使うことを3つ書いて発表します。カードは講師が預かり、年明けに本人に返して、できたかどうかを一緒に振り返ります。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 42);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 43, 'content', 'slate', '準備スケジュール（案）', '11月7日に向けて', '10月中旬：講師3人で採用する案を決定' || char(10) || '10月下旬：問題・カードの地域の正解を確認' || char(10) || '11月初旬：カード・用紙・地図を印刷' || char(10) || '11月6日：会場準備・進行の最終確認' || char(10) || '■ 追加の問題・事例は10月中にお寄せください', '準備のスケジュール案です。問題やカードのうち、地域の正解が必要なもの（行き先・交差点・ルート・首都高）は、講師が10月中に確認します。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 43);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 44, 'closing', 'blue', '遊びながら、年末に強くなる。', 'ご意見・追加のアイデアをお待ちしています', '', '以上が、年末年始勉強会の教材集です。ご意見や、実際にあった事例・行き先など追加のアイデアがあれば、ぜひお寄せください。'
FROM daihon_decks WHERE title = '年末年始勉強会 教材集' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 44);
