-- ===================================================
-- migration_189: タクシー街頭営業ハンドブック 解説デッキ（台本）＋ 板橋バトルに「プレゼン」ラウンド
--   ・daihon_slides に hidden（非表示）/ ref_page（右上の「P 12」）/ quiz（問題スライドの出題設定）を追加
--   ・台本デッキ「タクシー街頭営業ハンドブック 解説」（94枚）を作成。図は R2 の daihon/hb/*.jpg（ハンドブックから切り出し）
--   ・板橋バトルの有効なゲームのメニュー3番目（講座 第1部の次）に kind='deck' のラウンドを挿入
-- ===================================================
ALTER TABLE daihon_slides ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daihon_slides ADD COLUMN ref_page TEXT NOT NULL DEFAULT '';
ALTER TABLE daihon_slides ADD COLUMN quiz TEXT NOT NULL DEFAULT '';
INSERT INTO daihon_decks (title, subtitle, speaker, intro, sort_order, created_by) SELECT 'タクシー街頭営業ハンドブック 解説', '東京タクシーセンター「タクシー街頭営業ハンドブック」（令和7年8月）', '', '新卒 繁忙期対策勉強会用。ハンドブックを開きながら進める解説。右上の「P 番号」がハンドブックのページ。問題スライドのうち印の付いたものは板橋バトルでスマホ出題できる。', COALESCE(MAX(sort_order), -1) + 1, 'system' FROM daihon_decks;
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 0, 'cover', 'blue', 'タクシー街頭営業ハンドブック 解説', '公益財団法人 東京タクシーセンター 発行（令和7年8月）', '新卒 繁忙期対策勉強会
手元のハンドブックを開きながら進めます', '今日はこのハンドブックを使います。全部を暗記する必要はありません。「困ったときにどこを開けばいいか」が分かることが今日のゴールです。スライドの右上に、ハンドブックのページ番号を出しています。', '[]', '', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 1, 'content', 'blue', 'このハンドブックは何の本？', 'はじめに', '東京タクシーセンターが作った、街で営業するときのルールブック
対象は 東京23区・武蔵野市・三鷹市 で営業する運転者
■ 中身は4つ
実際にあった苦情の事例と、その対処方法
乗り場の規制・業界の自主ルール
関係する法令と、その解釈
**迷ったらこの本を開く**、が今日の合言葉', '東京タクシーセンターは、乗車拒否などの指導や苦情処理をしている団体です。つまりこの本は「指導する側」が作った本なので、ここに書いてあることがそのまま判断の基準になります。', '[]', '', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 2, 'steps', 'blue', '今日の流れ', '目次', '乗車拒否｜断れる？断れない？の判断
運賃・料金｜メーターと定額運賃
接客｜実際の苦情事例10件
乗り場のルール｜銀座・羽田・駅の図
関係法令｜根拠になる条文', '目次のページを開いてください。前半は「Q&A」と「苦情事例」、後半は乗り場の図、最後が法令です。ところどころで「ここで問題です」を出します。', '[]', '', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 3, 'section', 'blue', '運送の引受けの拒絶（乗車拒否）', 'お客様を断ってもいいのはどんなとき？', '', '', '[]', '3', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 4, 'content', 'blue', '「運送引受義務」とは', '道路運送法 第13条', '空車で乗車を申し込まれたら、**必ず引き受ける**（＝100％）
乗車拒否は違法行為で、処罰の対象になる
申し込みの内容は、理解できるまで聞く義務がある
断る正当な理由があるときも、**説明する義務**がある
■ 例：定員5人の車に6人から申し込まれた
まず「引き受ける」と考える → 乗れない理由を説明 → 2台に分ける・ワゴン車を呼ぶ等の解決策を出す', '「断れるかどうか」から考えるのではなく、「引き受ける」がスタートです。乗れない場合も「乗れません」で終わらせず、なぜ乗れないか、どうすれば乗れるかまでセットで伝えます。', '[]', '3〜4', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 5, 'steps', 'blue', '断る前の3ステップ', 'どんな場合でも必ずやること', '引き受ける｜まず乗せていく意思をはっきり示す
説明する｜なぜ乗せられないのかを丁寧に伝える
解決策を出す｜別の車を呼ぶ・乗れる場所へ誘導する等
■ 法令で断れる場合でも「引き受ける → 説明する」は省略できません', 'この3ステップが今日いちばん大事なところです。この後のQ&Aは、全部この考え方で答えが出ます。', '[]', '3〜4', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 6, 'question', 'amber', '車いすのお客様。JPNタクシーへの乗せ方が分からない。断ってもいい？', '', '断ってもいい
断れない', 'スマホで答えてもらいます。乗せ方が分からないとき、どうしますか？', '[]', '4', '{"answer": 1, "points": 10, "time": 20, "phone": true}');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 7, 'answer', 'amber', '断れません', '道路運送法 第13条 違反になる', '乗せ方が分からないなら「マニュアルを確認する」
または「会社の管理者に電話して教えてもらう」
乗せる努力をせずに断るのはNG
**日頃から操作手順を覚えておく**（ハンドブック P107 参照）', '方法はいくらでもあります。分からないことは断る理由になりません。車椅子の練習会もあるので、新卒のうちに一度は必ずやっておきましょう。', '[]', '4', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 8, 'question', 'amber', '盲導犬を連れたお客様。大型犬だから断ってもいい？', '', '断ってもいい
断れない', '手を挙げてもらいましょう。断ってもいいと思う人？', '[]', '5', '{"answer": 1, "points": 10, "time": 20, "phone": false}');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 9, 'answer', 'amber', '断れません', '運輸規則 第52条・身体障害者補助犬法 第8条', '盲導犬などの補助犬は、車内への持ち込み制限の対象外
大型犬でも、同伴を断ることはできない
■ 動物アレルギーで運転に支障が出る場合
なぜ乗せられないかを丁寧に説明する
「代わりの車をすぐ呼びます」と他の車を手配する（合理的配慮）', 'アレルギーの場合も「断って終わり」ではなく、説明と代わりの車の手配までがセットです。', '[]', '5', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 10, 'question', 'amber', '羽田空港で「反対側のターミナルまで」。無料バスを案内してもいい？', '', '無料バスを案内する
そのまま目的地へ送る', '親切のつもりで案内してしまう人が多い問題です。', '[]', '6', '{"answer": 1, "points": 10, "time": 20, "phone": false}');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 11, 'answer', 'amber', '案内できません', '道路運送法 第13条 違反になるおそれ', '「親切心で」「トラブル回避のため」「2時間も待ったのに」
これらは全部、自分本位の理由
余計なことは言わず、速やかに目的地までお送りする', '近距離でも、長く並んだ後でも同じです。気持ちは分かりますが、ここで断ると乗車拒否になります。', '[]', '6', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 12, 'content', 'blue', '信号待ち・Uターン禁止の場所で申し込まれたら', '断れない。でも、その場では乗せられない', '■ 信号待ちで停車中に申し込まれた
交差点内では乗せられない（道路交通法 第44条）
手を横に振る・バツ印 → 「乗車拒否された」と思われる
窓を開けて大きな声で「渡った先でお待ちしています」
渡った先の安全な場所に停めて、ハザードを点けて待つ
■ 反対方向へ、でもUターン禁止の道
まず座ってもらいドアを閉める → 迂回することを説明して了解をもらう
「違反してでも曲がれ」という申し込みだけは断れる', 'ポイントは「乗せていく意思」を先に見せることです。断っているように見える動作をしないこと。', '[]', '6〜7', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 13, 'question', 'amber', '嘔吐の跡がある泥酔したお客様。車内を汚されそう。断ってもいい？', '', '断ることもできる
断れない', 'ここは引っかけです。スマホで答えてください。', '[]', '8', '{"answer": 0, "points": 10, "time": 20, "phone": true}');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 14, 'answer', 'amber', '断ることもできます', '運輸規則 第13条（他の旅客の迷惑となるおそれ）', 'ただし、なぜ乗せられないかを説明する義務はある
泥酔者＝行き先が言えない・立てない・まっすぐ歩けない人
説明しても聞かず、怒鳴り続ける人もいる
**そのときは警察などに協力を頼む**', '断れるケースもちゃんとあります。ただし、ただ酔っているだけでは泥酔者になりません。「行き先を言える」「歩ける」お客様は断れないので注意しましょう。', '[]', '8', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 15, 'question', 'amber', '「早く行け」と言われた。カスハラだから断ってもいい？', '', 'カスハラなので断れる
断れない', 'カスハラという言葉はよく聞くと思いますが、どこからがカスハラでしょうか。', '[]', '9', '{"answer": 1, "points": 10, "time": 20, "phone": false}');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 16, 'answer', 'amber', '断れません', '「早く行け」はカスハラにあたらない', 'カスハラ＝事実無根・法的根拠のない要求、暴力的・侮辱的な要求
例：何も不手際がないのに「料金を無料にしろ」
カスハラを受けても、まずは**やめてもらうようお願いする**
それでも続くときに、初めて断れる
「信号無視しろ」「スピードを出せ」が付いたら断れる（法令違反の要求）', 'ハラスメントを理由に断れるのは、約款にハラスメント条項を入れて国の認可を受けた会社だけです。うちの会社のルールは管理者に確認しましょう。', '[]', '9〜10', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 17, 'content', 'blue', '法令で断れるのはこんなとき', '道路運送法 第13条・運輸規則 第13条など', '定員オーバー・荷物がトランクに入らない
高速料金を払わないと言われた・現金や使えるチケット以外での支払い
営業区域の境界から約50km以上離れた場所（高速道路を使う場合は除く）
道路交通法違反の要求・暴行や脅し・賭博場などへの案内
泥酔・不潔な服装などで他のお客様の迷惑になる
危険物を持っている・付添人のいない重病の方
回送板を出しているとき（食事・休憩・帰庫）
■ どの場合も「説明」は必ず必要', '細かい条文は後ろの法令ページにあります。覚えるより「ここに載っている」と分かっていれば大丈夫です。', '[]', '80〜83', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 18, 'section', 'green', '運賃・料金', 'メーターと定額運賃のルール', '', '', '[]', '11', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 19, 'content', 'green', '運賃の基本', '道路運送法 第9条の3・運送約款 第5条・第6条', '運賃は国の認可を受けたもの
金額は**メーターの表示額**で決まる
運賃は「乗った時に始まり、降りた時に終わる」
運転者の判断でメーターを空車にしたり、金額を変えたりできない', '「サービスで少し安く」もできません。メーターの金額が正しい運賃です。', '[]', '11', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 20, 'question', 'green', '羽田空港の定額運賃。お客様は事前に予約が必要？', '', '予約が必要
予約はいらない', '羽田の定額は勘違いが多いところです。スマホで答えてください。', '[]', '11', '{"answer": 1, "points": 10, "time": 20, "phone": true}');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 21, 'answer', 'green', '予約はいりません', '羽田空港のタクシー乗り場は、すべて定額運賃乗り場', '定額ゾーン内への申し込みは自動で定額が成立（お客様が断った場合を除く）
■ 逆方向は予約が必要
ゾーン内 → 羽田空港（例：江戸川区の自宅から）は**1時間前までの予約**が必要', '羽田「から」は予約不要、羽田「へ」は予約が必要。方向で違うと覚えましょう。', '[]', '11', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 22, 'question', 'green', '定額運賃で、お客様がカード払い。メーター運賃をもらってもいい？', '', 'カードならメーター運賃
支払い方法に関係なく定額', 'これも勘違いが多いところです。', '[]', '12', '{"answer": 1, "points": 10, "time": 20, "phone": false}');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 23, 'answer', 'green', '支払い方法の制限はありません', 'メーター運賃をもらうと「不当運賃請求」', 'カード・電子マネー・ネット決済でも定額運賃
自分の会社で使える支払い方法を把握しておく', '「現金じゃないと定額にならない」という噂は間違いです。', '[]', '12', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 24, 'question', 'green', '道を間違えた。途中でメーターを切ってもいい？', '', '切ってもいい
切れない', '気まずい場面ですが、どうするのが正解でしょう。', '[]', '12', '{"answer": 1, "points": 10, "time": 20, "phone": false}');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 25, 'answer', 'green', '途中で切れません', 'メーターは目的地まで正しく使う', '間違えた時点で、すぐに謝る
会社の指示どおりに説明する（例：メーター運賃をいただき、後日管理者から連絡。お名前と連絡先を伺う）
メーターを使わずに走るのは法令違反
**指摘やトラブルは、帰庫後に必ず管理者へ報告**', '良かれと思ってメーターを切ると、それ自体が違反になります。必ず報告して、会社に対応してもらいましょう。', '[]', '12', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 26, 'stat', 'green', 'ちょっとした使い忘れも違反', 'メーター不使用', '1回転｜タイヤがひと転がりしただけでも、メーターを使っていなければ違反
故意も過失も｜わざとでも、うっかりでも、使っていない事実があれば違反
損｜をするのは自分', 'メーターは乗った瞬間に入れる。これを体に覚えさせてください。', '[]', '13', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 27, 'section', 'amber', '接客', '実際にあった苦情 10件', '', '', '[]', '14', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 28, 'steps', 'amber', '法令が求める接客は3つ', '運輸規則 第2条・第2条の2', '安全・確実｜目的地と経路をよく確認し、安全運転で送る。回り道や途中で降ろすことをしない
迅速｜適切な経路（最短コース）で送る
公平かつ懇切｜申し込み順に引き受け、丁寧に。身なりや服装で差別しない
■ 守らないと「乱暴運転」「迂回走行」「接客不良」の苦情になる', 'この後の10件の苦情は、全部この3つのどれかに当てはまります。', '[]', '14', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 29, 'content', 'amber', '「ETCレーンで急ブレーキ！」', '乱暴運転 事例1', '■ 何があった
ETCカードを挿し忘れ、バーが開かず急ブレーキ。親子が足元に落ちた
■ 原因
いつもと違う車で、いつもの確認の流れが抜けた
■ こうする
担当車でなくても、出庫前の確認を省かない
まず謝罪 → **お客様のケガの有無をすぐ確認**', '慌てると対応が後回しになりがちです。謝罪とケガの確認、この順番を必ず。', '[]', '15', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 30, 'content', 'amber', '「法定速度以上の速度で！」', '乱暴運転 事例2', '■ 何があった
60km制限の一般道を約85kmで走行。注意されても「ガラガラだとスピード出したくなるじゃん」
■ 原因
流れに乗ったつもりの速度超過と、盛り上がってのタメ口
■ こうする
空いていても法定速度を守る
**盛り上がったと思った時こそ接客言葉**', '「盛り上がっているのは自分だけだと思え」とハンドブックに書いてあります。名言です。', '[]', '16', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 31, 'content', 'amber', '「ドアを閉めずに発進！」', '乱暴運転 事例3', '■ 何があった
ドアが開いたまま発進。指摘されても走りながら閉めた
■ 原因
閉めたつもりで、目で見て確認していなかった
■ こうする
「ドアを閉めてよろしいですか」「お足元はよろしいですか」と声掛け
声掛け → **目視で確認** → 開け閉め', '自動ドアで足をはさむ事故もあります。声掛けと目視はセットです。', '[]', '17', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 32, 'question', 'amber', 'アプリ配車で目的地は入力済み。カーナビのとおりに走れば、コース確認はいらない？', '', '確認はいらない
確認は必要', '新卒の皆さんが一番やりがちなパターンです。', '[]', '18', '{"answer": 1, "points": 10, "time": 20, "phone": false}');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 33, 'answer', 'amber', 'コース確認は必要です', '迂回走行 事例1「カーナビのコースは最短ではない！」', 'いつも1,100円の道で1,700円 → 「遠回りで悪質」と苦情
カーナビのコースが最短・最良とは限らない
お客様には「いつもの道」がある
**行き先とコースの確認は基本動作**', '「一本道だから」「ナビに入れたから」で確認を省いた苦情がたくさん報告されています。', '[]', '18', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 34, 'question', 'amber', '酔ったお客様に「真っ直ぐですか？」と何度も確認した。何がまずかった？', '', '声を掛けたこと
「はい」だけで答えられる聞き方
国道6号を使ったこと', '松戸までのはずが我孫子まで行ってしまった事例です。スマホで答えてください。', '[]', '19', '{"answer": 1, "points": 10, "time": 20, "phone": true}');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 35, 'answer', 'amber', '「はい」で答えられる聞き方', '迂回走行 事例2「松戸までと申し込んだのに！」', '寝ているお客様は「真っ直ぐですか？」に「はい」と答えてしまう
「うん、真っ直ぐ」と答えた例まである
乗った時に**詳しい行き先とコース**を確認しておく
基本動作が、自分の身を守る', '松戸のどこまでか、どの道で行くかを乗った時に確認していれば防げました。', '[]', '19', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 36, 'content', 'amber', '「実車中に動画を見ている！」', '接客不良 事例1', '■ 何があった
スマホをメーターの前に置き、動画を流したまま走行
■ 原因
迎車の待ち時間に見ていて、止めるタイミングを逃した
■ こうする
走行中に画面を見るのは道路交通法違反（第71条）
待ち時間に動画を見ていると、お客様が来てもすぐ対応できない', '本人は「見ていない」と言っても、お客様からは見ているようにしか見えません。', '[]', '20', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 37, 'content', 'amber', '「返答された言葉に驚いた！」', '接客不良 事例2', '■ 何があった
右折の指示で左折。指摘されて「たまにあるんです」
■ 原因
照れ隠しの冗談のつもりの一言
■ こうする
**余計な言葉は言わない**
間違えたら、すぐに謝る', '間違えたこと以上に、ひと言で苦情になります。', '[]', '21', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 38, 'content', 'amber', '「侮辱されました！」', '接客不良 事例3', '■ 何があった
小銭の支払いに時間がかかった外国人のお客様に「だから外国人は嫌いなんだよ」
■ 原因
後ろからクラクションを鳴らされ、イライラしていた
■ こうする
「公平かつ懇切」には、差別しないことも含まれる
外国人のお客様にも丁寧に', 'お客様は「日本の恥」とまで書いています。会社だけでなく、タクシー全体の評判に関わります。', '[]', '22', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 39, 'content', 'amber', '「ベビーカーを積んでくれないなんて！」', '接客不良 事例4', '■ 何があった
ベビーカーを積んでほしいと頼まれ、大きなため息。お客様は乗らずに去った
■ 原因
雨で濡れるのが嫌だった
■ こうする
乗車拒否にもなりうる重大な内容
トランクサービスは**快く、積極的に**', '気づいて声を掛けた時には「時すでに遅し」でした。', '[]', '23', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 40, 'question', 'amber', '1万円札で払うと言われたが、お釣りがない。正しいのは？', '', 'お客様に両替してきてもらう
カードで払ってほしいとお願いする
自分が両替に行く努力をする', '最後の苦情事例です。スマホで答えてください。', '[]', '24', '{"answer": 2, "points": 10, "time": 20, "phone": true}');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 41, 'answer', 'amber', '自分が両替に行く', '接客不良 事例5「自分で両替に行ってこい！」', 'お釣りは**必ず準備しておく**もの
コンビニで「お釣りがないので細かいのありますか？」と言われたことがある？
タイミングで用意できなくても、お客様を両替に行かせない', '高額紙幣が続いた日もあります。休憩のたびに両替しておく習慣をつけましょう。', '[]', '24', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 42, 'section', 'slate', '乗車禁止地区（銀座）', '乗り場以外では乗せられない場所', '', '', '[]', '25', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 43, 'content', 'slate', '乗車禁止地区とは', 'タクシー業務適正化特別措置法 第43条', 'お客様が集中して、乗車拒否などが起きやすい地区と時間帯を国が指定
その間は、**指定されたタクシー乗り場以外で乗せられない**
「タクシー乗り場」「タクシー乗車禁止」の標識が立っている', '東京で指定されているのは銀座です。普段の「必ず引き受ける」と逆になるので、混乱しやすいところです。', '[]', '25', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 44, 'figure', 'slate', '乗車禁止地区の標識', '', '', 'この標識が出ている場所が乗車禁止地区です。', '["daihon/hb/sign.jpg"]', '25', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 45, 'stat', 'slate', '規制の日と時間', '', '平日｜土日・祝日・休日を除く
22時〜翌1時｜この時間は乗り場以外で乗せられない
9割｜違反者は、普段銀座で営業しない運転者
■ お客様を銀座で降ろした直後に申し込まれ、規制の中にいる自覚がないまま乗せてしまう', 'まさに皆さんのような新人が一番やってしまうパターンです。銀座で降ろしたら「今は規制時間か？」を思い出してください。', '[]', '26', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 46, 'question', 'slate', 'お盆休み（8月13日〜16日）の平日の夜11時。銀座の規制は？', '', 'お休みなので規制なし
カレンダー通りなので規制あり', 'スマホで答えてください。', '[]', '26', '{"answer": 1, "points": 10, "time": 20, "phone": true}');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 47, 'answer', 'slate', '規制あり（カレンダー通り）', 'お盆も年末も、平日は規制日', '世の中が休みでも、休日・祝日ではない
年末（12月29日〜）も同じ
「休日だから大丈夫」と乗せて指導されるケースが多い', 'ちなみに銀座1号乗り場の入路指定だけは12月29日〜1月3日がお休みです。紛らわしいので、迷ったら規制ありと考えましょう。', '[]', '26', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 48, 'figure', 'slate', '銀座の乗車禁止地区と乗り場', '赤い点線の内側が乗車禁止地区。乗り場は1〜11号', '', 'ハンドブックの28〜29ページの見開きです。赤丸の番号がタクシー乗り場、青が無線タクシー、黄色がハイヤーの乗り場です。優良マークの付いた乗り場もあります。', '["daihon/hb/ginza_map.jpg"]', '28〜29', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 49, 'figure', 'slate', '銀座タクシー乗り場リーフレット', '日本語版・英語版', '乗り場以外で申し込まれたら、これを見せて乗り場を案内する
説明が伝わりやすく、トラブル防止になる
**車内に携行して活用する**', '外国人のお客様には英語版を見せれば伝わります。', '["daihon/hb/ginza_leaflet_ja.jpg", "daihon/hb/ginza_leaflet_en.jpg"]', '30〜31', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 50, 'question', 'slate', '規制時間中、お客様を降ろしたら次のお客様が乗り込んできた。乗せてもいい？', '', '乗り込まれたなら仕方ない
乗せられない', 'スマホで答えてください。', '[]', '32', '{"answer": 1, "points": 10, "time": 20, "phone": true}');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 51, 'answer', 'slate', '乗せられません', '特措法 第43条 違反', '乗り込まれても違反になる
丁寧に説明し、リーフレットで乗り場を案内して降りてもらう
説明するときは**客席ドアではなく助手席の窓を少しだけ**開ける
（声が聞こえて、手を入れてロックを外せないくらい）
お客様にとって「客席ドアが開く＝どうぞお乗りください」', '説明しようとドアを開けたら乗り込まれた、というのも違反になります。窓で話す、が正解です。', '[]', '32', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 52, 'content', 'slate', '規制時間中、こんな場合も乗せられない', '特措法 第43条', '■ チケットのお客様なら、列の途中から乗せていい？
乗せられない。「乗り場」とは先頭の車のこと
■ 個人的に予約をもらったお客様を、無線乗り場で乗せていい？
乗せられない。待機もできない。待ち合わせは規制地区の外で
■ 「急に具合が悪くなった。迎えに来て」と言われたら？
乗せられない。「急病人は除く」とはどこにも書いていない', '最後の急病人のケースは意外ですが、ルールはルールです。', '[]', '33〜34', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 53, 'section', 'blue', 'タクシー乗り場等 適正運営推進制度', '駅・繁華街の乗り場のルール', '', '', '[]', '35', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 54, 'content', 'blue', '指導の対象になる7つの行為', '東京タクシーセンターが規制・指導', '入路指定無視：決められた入り方を守らない
進入禁止無視：入ってはいけない道に入る
待機禁止無視：客待ち・待機してはいけない場所で待つ
乗り場無視：乗り場の周りで客待ちする
回遊車両：乗り場の周りをぐるぐる回る
指導無視：指導員の指導に従わない
優良乗り場への不正入構：資格がないのに優良乗り場に入る', '乗り場は「どこから入るか」まで決まっています。この後の図で確認していきます。', '[]', '37', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 55, 'figure', 'blue', '東京駅八重洲口前タクシー乗り場', '終日　入路指定・待機禁止', '鍛冶橋交差点を有楽橋方向から直進して入る
旧東京高速道路下から先は待機禁止
待機所に空きがあっても、入り方の指定は解除されない', '図の矢印の向きで入ります。', '["daihon/hb/yaesu_rule.jpg"]', '40', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 56, 'figure', 'blue', '銀座 1号タクシー乗り場', '平日 22時〜翌1時（12月29日〜1月3日を除く）　入路指定', '築地川第一駐車場（タクシープール）に入る
汐先橋 → 蓬莱橋 → 銀座8丁目交差点を直進して入る
プールから乗り場へは「空車」表示で移動
移動中、乗禁地区の外で申し込まれたら、すぐに応じる', 'タクシープールから一筆書きのように入ります。', '["daihon/hb/ginza1.jpg"]', '41', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 57, 'figure', 'blue', '銀座の各タクシー乗り場', '平日 22時〜翌1時　入路指定', '2・6〜10号：それぞれ決まった一方向から
3号：日比谷通り → みゆき通り → 外堀通りを左折
4号：晴海通りを勝鬨橋方向から → 三原橋を直進
5号：国会通り → 銀座コリドー通りを左折
11号：4号の空車列と一列で → 数寄屋橋を左折
**割り込み（かまし）は離脱扱いで指導対象**', '2号と9号、4号と11号は一列で並んで、空いている方に進みます。', '["daihon/hb/ginza_stands.jpg"]', '42〜43', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 58, 'question', 'amber', '規制時間中の花椿通り。お客様を乗せて入り、降ろした。次はどうする？', '', 'そのまま直進して抜ける
一番近い一方通行路に進む', '図を見ながら考えてください。', '[]', '44', '{"answer": 1, "points": 10, "time": 20, "phone": false}');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 59, 'figure', 'blue', '銀座・花椿通り（中央通り〜昭和通り）', '平日 22時〜翌1時　空車の進入禁止・客待ち禁止', '空車（回送表示も含む）は進入禁止
迎車・実車は通り抜けOK
実車で入って降ろした後は、**直近の一方通行路へ**。直進すると違反
客待ち禁止は迎車・回送も含む', 'さっきの問題の答えは「一方通行路に進む」です。', '["daihon/hb/hanatsubaki.jpg"]', '44', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 60, 'figure', 'blue', '銀座・新幸橋・内幸町・国会通り', '平日 22時〜翌1時　客待ち禁止・入構規制', '新幸橋ガード下は客待ち禁止（迎車・回送も含む）
コリドー通りから空車の左折禁止（迎車・実車はOK）
第一ホテル東京方向から空車の右折禁止（迎車・回送も含む）
新幸橋交差点〜内幸町ホール前は客待ち禁止', '', '["daihon/hb/shinsaiwai.jpg"]', '45', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 61, 'figure', 'blue', 'みゆき通り（山下橋ガード下〜帝国ホテル前）', '平日 22時〜翌1時　客待ち禁止', '山下橋ガード下から帝国ホテル駐車場出入口前交差点まで客待ち禁止
迎車・回送も含む', '', '["daihon/hb/miyuki.jpg"]', '46', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 62, 'figure', 'blue', '六本木交差点周辺', '終日　客待ち禁止・入路指定', '交差点とギラギラ舗装の場所は客待ち禁止
アルカトーレ前・六本木ビル前の乗り場へは、首都高高架下のタクシープールを経由して入る
**監視カメラの映像でも指導対象**', 'カメラで見られていると思ってください。', '["daihon/hb/roppongi.jpg"]', '47', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 63, 'figure', 'blue', '優良タクシー乗り場に入れる車', '安全・サービスで一定の評価を受けた運転者・事業者だけ', '① 優良運転者章を表示した車
② 優良事業者の運転者で、優良表示を出した車
③ 個人タクシーの「マスター（三つ星）」
**さらに「WELCOME ABOARD！」ステッカーが必要**
（指差し外国語シートを持ち、接遇の講習を受けた運転者）', '資格がないのに入ると「不正入構」で指導されます。会社の評価にも響く加重措置があります。', '["daihon/hb/yuryo_req.jpg"]', '48', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 64, 'figure', 'blue', '優良タクシー乗り場は13地区26か所', '新橋・東京駅・秋葉原・上野・池袋・新宿・渋谷・品川・青山・羽田・銀座・日本橋・浅草', '資格のない車が入ると「不正入構」で指導
お客様が多く空車が足りないときだけ、一般の車も入れる
**お客様の列がなくなったら乗り場から離れる**', '品川駅西口は令和6年2月から休止中です。', '["daihon/hb/yuryo_map.jpg"]', '49〜50', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 65, 'figure', 'blue', '違反点数の付き方と消え方', '1件につき1点', '1年間違反がなければ消える
適正化研修を受けると、その件の点数が消える（発生後1か月以内・1年に1回まで）
2点以上：運転者記録証明書の対象
3点以上：優良運転者表彰の対象外
5点以上：会社の評価の対象', '自分の点数が、会社の評価にもつながります。', '["daihon/hb/points.jpg"]', '51', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 66, 'section', 'green', '自主規制と空車の進入禁止', '駅・空港ごとのローカルルール', '', '', '[]', '53', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 67, 'content', 'green', '自主規制とは', 'タクシー業界で決めた乗り場のルール', '乗り場の入り方・守ることを、業界の委員会で決めたもの
■ 対象：渋谷駅西口・羽田空港・東京駅八重洲口・吉祥寺駅北口・池袋駅東口・池袋駅西口
■ 空車の進入禁止：新橋駅周辺・赤坂3丁目周辺・幸橋ガード下', 'この後、図を1つずつ見ていきます。全部覚えなくていいので、「行く前にこのページを見る」と覚えてください。', '[]', '55〜56', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 68, 'figure', 'green', '渋谷駅西口前タクシー乗り場', '終日　入路指定', '乗り場へは必ず待機所を経由
玉川通りの南平台交差点方向から → 渋谷駅西口交差点を左折 → 渋谷フクラス地下駐車場入口から入る
交差点の手前約80mの満空表示が「満車」なら、待機所に入らない・路上で待たない
地下2階に喫煙所・トイレはない', '', '["daihon/hb/shibuya.jpg"]', '57〜58', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 69, 'content', 'green', '羽田空港のルール', '空港の乗り場はすべて定額運賃乗り場', 'ナンバーの末尾番号で入れる日が決まる（奇数日＝奇数、偶数日＝偶数）
第5優良乗り場（国際線）は末尾規制の対象外。ただし優良の資格が必要
年末年始・GW・夏の繁忙期・シルバーウィークは末尾規制を解除
定額運賃表を後部座席から見える場所に出す
ETC装着車・「WELCOME ABOARD！」ステッカー貼付車
世田谷区の一部は一般道の方が安いことがある → 首都高か一般道かをお客様に確認', '羽田は運用が変わることがあるので、行く前に東京タクシーセンターのホームページも確認しましょう。', '[]', '59〜60', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 70, 'question', 'green', '今日は偶数日。ナンバーの末尾が奇数のタクシーは、羽田空港の乗り場に入れる？', '', '入れる
入れない', 'スマホで答えてください。', '[]', '59', '{"answer": 1, "points": 10, "time": 20, "phone": true}');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 71, 'answer', 'green', '入れません', '車両の末尾番号による入構規制', '奇数日は末尾が奇数、偶数日は末尾が偶数の車だけ
年末年始・GW・夏季繁忙期・シルバーウィークは規制解除
第5優良乗り場（国際線）は除く', '羽田に向かう前に、今日の日付と自分の車のナンバーを確認する習慣をつけましょう。', '[]', '59', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 72, 'figure', 'green', '羽田空港 第1タクシー待機所', 'おもてなしレーン（外国人旅客接遇研修の修了者専用）', '各乗り場の待機レーンの一部が修了者専用
第1：4レーン　第2：3レーン　第3：4レーン　第4：4レーン
入るときは修了証を持ち、入構表示板を出す
末尾番号の規制はそのまま適用', '', '["daihon/hb/haneda1.jpg"]', '61〜62', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 73, 'figure', 'green', '入構表示板と掲出位置', 'Hospitality Taxi', 'おもてなしレーン・第3/第4待機所に入るときに出す
入ってから実車になるまで、正しく表示する', '', '["daihon/hb/hospitality.jpg"]', '63', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 74, 'figure', 'green', '第3・第4タクシー乗り場への入り方', '第2ターミナル', '', '赤い矢印のルートで入ります。', '["daihon/hb/haneda_t3_route.jpg", "daihon/hb/haneda_t4_route.jpg"]', '64〜65', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 75, 'figure', 'green', '羽田空港 第3タクシー待機所', '19列×9レーン　合計171台', '第1：神奈川レーン（休止中）
第2〜4：一般・UDレーン
第5〜6：ワゴンレーン
第7〜8：英語検定合格者レーン（ECD認定章が必要）
第9：ハイヤー
**直接は入れない。必ず第4待機所を経由**（環八を大鳥居方向から左折）
周回路での待機は禁止', '', '["daihon/hb/haneda_pool3.jpg"]', '66〜67', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 76, 'figure', 'green', '羽田空港 第4タクシー待機所', '第3待機所へ入る前に必ず経由', 'ワゴン・ECD車両はモニターで空きを見て、その都度移動
一般（おもてなし）車両は列ごとに移動', '', '["daihon/hb/haneda_pool4.jpg"]', '68', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 77, 'figure', 'green', '東京駅八重洲口前タクシー乗り場', '待機所のレーン', '第1〜5レーン：一般・UD（31台）
第6レーン：検定合格者・ワゴン（7台）
優良乗り場の資格が必要
検定合格者・ワゴンレーンは英語検定合格証とECD認定章（ワゴン車を除く）', '', '["daihon/hb/yaesu_pool.jpg"]', '69', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 78, 'figure', 'green', '吉祥寺駅北口ロータリー内タクシー乗り場', '21時30分〜翌6時　入路指定', '井の頭通り方向から左折して平和通りへ入る（五日市街道方向からの右折は禁止）
ロータリー内が13台でいっぱいなら、止まらずに離れる
吉祥寺大通りのセンターライン側には止めない
地元の「吉祥寺ルール」にも従う', '', '["daihon/hb/kichijoji.jpg"]', '70', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 79, 'figure', 'green', '池袋駅東口前タクシー乗り場', '終日　入路指定', '乗り場へはタクシープールを経由
グリーン大通りを護国寺方向から直進して入る
満空表示板が「満」なら、すぐ他へ移動
プール入口・ロータリー付近・グリーン大通りで入構待ちをしない
プール内でタバコの吸殻・空き缶を捨てない', '', '["daihon/hb/ikebukuro_e.jpg"]', '71', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 80, 'figure', 'green', '池袋駅西口前タクシー乗り場', '終日　入路指定', '第2プール → 第1プールの順に経由して乗り場へ
第2プールへは劇場通りを池袋警察署方向から右折して入る（西口五差路方向からは入らない）
第2プール先頭のモニターで第1プールの空きを確認
満車のとき、右折ラインや劇場通りで待たない
プール内は左から横に3台ずつ', '', '["daihon/hb/ikebukuro_w.jpg"]', '72', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 81, 'figure', 'green', '新橋駅周辺', '平日 21時〜翌1時　車両進入禁止・空車進入禁止', '新橋駅銀座口など4か所で進入禁止
ニュー新橋ビル前の乗り場へは日比谷通りから直進して入る', '', '["daihon/hb/shinbashi.jpg"]', '73', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 82, 'figure', 'green', '赤坂3丁目周辺', '平日 19時〜翌1時　空車タクシー通行禁止', '赤く塗られた道は空車で通れない
迎車は通れる', '', '["daihon/hb/akasaka.jpg"]', '74', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 83, 'figure', 'green', '幸橋ガード下', '21時〜翌2時　タクシー通行止め', '実車以外のタクシーは通れない', '', '["daihon/hb/saiwaibashi.jpg"]', '75', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 84, 'figure', 'green', '調整待機所（休憩・時間調整に使える場所）', '駐車禁止が解除されている場所', '青山公園（港区六本木7-23）65台・終日
台東体育館前（台東区今戸1-1先）2台・11時〜14時
芝公園（港区芝公園1-4-3）4台・終日
**正しく使う**（ルールを守らないと使えなくなる）', '休憩場所に困ったら、ここを覚えておくと便利です。', '["daihon/hb/chosei_photos.jpg"]', '76', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 85, 'section', 'slate', '関係法令（抜粋）', 'これまでの答えの根拠', '', '', '[]', '77', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 86, 'content', 'slate', '道路運送法', 'タクシー事業の基本の法律', '第9条の3：運賃・料金は国の認可が必要
第10条：運賃の割戻し（値引き・キックバック）禁止
第13条：運送引受義務（乗車拒否の禁止）
第14条：申し込みを受けた順に運ぶ
第20条：出発地も到着地も営業区域外の運送は禁止
第30条：特定のお客様への不当な差別的取扱いの禁止', '', '[]', '79〜84', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 87, 'content', 'slate', '旅客自動車運送事業運輸規則', '運転者が守る細かいルール', '第2条：安全・確実・迅速、公平かつ懇切
第10条：領収証の発行
第13条：引受けを断れる場合（泥酔・危険物・重病者など）
第18〜19条：事故のときの処置
第50条：運転者の守ること（体調不良の申し出・回送板など）
第52条：車内に持ち込めない物（火薬・灯油・ガスなど）', '', '[]', '85〜95', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 88, 'question', 'slate', '隔日勤務の1乗務で、走ってよい距離の上限は？', '', '270km
365km
500km', '最後の問題です。スマホで答えてください。', '[]', '88', '{"answer": 1, "points": 10, "time": 20, "phone": true}');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 89, 'stat', 'slate', '乗務距離の最高限度', '運輸規則 第22条（関東運輸局長公示）', '365km｜隔日勤務の1乗務（出庫から帰庫まで）
270km｜日勤勤務の1乗務
■ 高速道路・自動車専用道路の距離は差し引ける（首都高は除く）
■ 差し引くときは、路線名・区間・距離・時刻・料金を乗務記録に書く', '高速を使った長距離のときは、乗務記録の書き方に注意しましょう。', '[]', '88', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 90, 'content', 'slate', 'タクシー業務適正化特別措置法', '東京など指定地域だけの法律', '第3条：登録を受けた運転者でなければ乗務できない
第12条（施行規則）：運転者証は前面ガラスの内側に、表を外に向けて表示
第34条：東京タクシーセンター（適正化事業実施機関）の指導・研修・苦情処理
第43条：タクシー乗り場と乗車禁止地区の指定', '', '[]', '96〜98', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 91, 'content', 'slate', '標準運送約款・道路交通法', 'お客様との約束と、道路のルール', '■ 一般乗用旅客自動車運送事業標準運送約款
第5条：運賃はメーターの表示額
第6条：運賃は降りるときにいただく
第7条：会社の責任は乗ってから降りるまで
■ 道路交通法
第44条：停車・駐車禁止の場所（交差点など）
第57条：乗車定員を超えて乗せない
第71条：運転中にスマホ・画面を注視しない', '', '[]', '99〜104', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 92, 'content', 'slate', '障害者差別解消法・身体障害者補助犬法', '', '障害を理由とした不当な差別的取扱いをしない
求められたら、負担が重すぎない範囲で**合理的配慮**をする
盲導犬・介助犬・聴導犬の同伴を拒んではいけない', '車椅子・盲導犬の問題の根拠がこの2つです。', '[]', '105', '');
INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes, images, ref_page, quiz) VALUES ((SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1), 93, 'closing', 'blue', 'まず引き受ける。断るなら説明する。', '今日のまとめ', '乗車拒否：引き受ける → 説明する → 解決策
メーター：乗った瞬間に入れて、途中で切らない
接客：コース確認・声掛け・余計なひと言を言わない
乗り場：行く前に図のページを開く
**迷ったらハンドブックを開く**', 'お疲れさまでした。このハンドブックは車に積んでおいて、迷ったときにすぐ開けるようにしておいてください。', '[]', '', '');
UPDATE ib2_steps SET sort_order = sort_order + 1 WHERE game_id = (SELECT id FROM ib2_games WHERE is_active = 1 ORDER BY id DESC LIMIT 1) AND sort_order >= 2;
INSERT INTO ib2_steps (game_id, sort_order, kind, title, config) SELECT id, 2, 'deck', '講座 タクシー街頭営業ハンドブック', '{"deck_id":' || (SELECT id FROM daihon_decks WHERE title = 'タクシー街頭営業ハンドブック 解説' ORDER BY id DESC LIMIT 1) || '}' FROM ib2_games WHERE is_active = 1 ORDER BY id DESC LIMIT 1;
