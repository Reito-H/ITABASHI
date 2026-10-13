-- ===================================================
-- migration_193: 台本「繁忙期対策勉強会 2026」デッキを追加
--   ・10/15 全乗務員対象（新卒以外も）の繁忙期対策勉強会、約90分、32枚。
--   ・年末年始の人の動き→繁忙期の街とお客様（酔っぱらい対応）→流しvsつけ待ち→恵比寿・東京駅周辺・渋谷→銀座乗禁・給料明細。
--   ・テーブル変更なし。同名デッキがあれば挿入しない。
-- ===================================================

INSERT INTO daihon_decks (title, subtitle, speaker, intro, sort_order)
SELECT '繁忙期対策勉強会 2026', '10月15日 全乗務員対象（新卒以外も）', 'カネフジ班長 ほか', '10/15開催、約90分。年末年始に日本人がどう動くか→繁忙期の街とお客様（酔っぱらい対応）→流しとつけ待ち→恵比寿・東京駅周辺・渋谷のエリア攻略→銀座乗禁と年末ルール→給料明細、の流れ。ディスカッションを多めに入れた台本つき。', COALESCE((SELECT MAX(sort_order) FROM daihon_decks), -1) + 1
WHERE NOT EXISTS (SELECT 1 FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 0, 'cover', 'blue', '繁忙期対策勉強会', '年末年始を稼ぎきる 2026', '10月15日（水）　全乗務員対象' || char(10) || '講師：カネフジ班長 ほか' || char(10) || '約90分・ディスカッション多め', 'お疲れさまです。今日は年末年始の繁忙期に向けた勉強会です。11月7日に新卒向けの勉強会がありますが、今日は新卒以外の皆さんも対象です。講義だけでなく、皆さんの経験を出し合う時間を多めにとっていますので、気楽に参加してください。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 0);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 1, 'content', 'slate', '今日のゴール', '90分で「繁忙期の動き方」が自分の言葉で言えるようになる', '年末年始に日本人がどう動くかを知る' || char(10) || '繁忙期の街とお客様の特徴（いいことも、こわいことも）' || char(10) || '流しとつけ待ち、どっちがいいのか' || char(10) || '恵比寿・東京駅周辺・渋谷の具体的な流し方' || char(10) || '■ 銀座乗禁などのルールも最後におさらい', '今日のゴールは5つです。年末年始の人の動き、繁忙期の街とお客様の特徴、流しとつけ待ちの考え方、3つのエリアの具体的な流し方、そして銀座乗禁などのルール。終わったときに、この5つが自分の言葉で言えるようになっていれば成功です。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 1);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 2, 'content', 'blue', 'タイムテーブル', '約90分', '0:00｜導入（10分）' || char(10) || '0:10｜年末年始、日本人は何をしている？（15分）' || char(10) || '0:25｜繁忙期の街とお客様・酔っぱらい対応（20分）' || char(10) || '0:45｜流しとつけ待ち、どっちがいい？（10分）' || char(10) || '0:55｜エリア攻略 恵比寿・東京駅・渋谷（25分）' || char(10) || '1:20｜銀座乗禁・給料明細・まとめ（10分）', '流れはこの6つです。前半は年末年始の全体像、中盤はお客様の対応、後半が今日のメインのエリア攻略です。途中で何度か皆さんに聞きますので、答えを考えながら聞いてください。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 2);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 3, 'section', 'blue', '第1章　年末年始、日本人は何をしている？', 'お客様の動きが分かれば、こちらの動き方も決まる', '', '第1章です。タクシーのお客様は「普段と違う行動をしている人」です。年末年始の日本人が何をしているかを押さえると、いつ・どこに人が集まるかが見えてきます。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 3);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 4, 'question', 'blue', '皆さんは去年の年末年始、何をしていましたか？', '周りの人と1分ずつ話してみましょう（ディスカッション）', '大晦日は家でテレビ・年越しそば' || char(10) || 'カウントダウンや初詣に出かけた' || char(10) || '帰省・旅行に行った' || char(10) || 'ずっと乗務していた', 'まずはディスカッションです。去年の年末年始、自分は何をしていたか。隣の人と1分ずつ話してみてください。乗務していた人は、どんなお客様が多かったかも教えてください。何人かに発表してもらいます。この「自分がやっていたこと」が、そのままお客様の動きです。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 4);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 5, 'content', 'green', '年末の動き（12月中旬〜30日）', '財布の紐がゆるむ時期', '仕事納め・納会・忘年会が集中（夜の需要が一気に増える）' || char(10) || '年末最後のセール・買い出し（昼の需要も増える）' || char(10) || '帰省の移動：駅・空港・バスターミナル' || char(10) || '大掃除・正月準備で、家からの迎車も増える' || char(10) || '■ 日本人の多くが「今日くらいいいか」とタクシーに乗る', '12月中旬から30日までは、忘年会と仕事納めで夜の需要が一気に増えます。昼も年末のセールや買い出し、帰省の移動があるので、一日中お客様がいる状態です。普段は電車の人も「今日くらいいいか」とタクシーに乗る。これが年末です。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 5);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 6, 'content', 'green', '大晦日〜元日', '夜中に人が動く、特別な2日間', '夕方〜夜：家族で過ごす人が多く、一度は静かになる' || char(10) || '23時〜：カウントダウン（渋谷・東京タワー・寺社）で人が集まる' || char(10) || '0時すぎ：初詣（明治神宮・浅草など）→帰りの足がない' || char(10) || '4〜6時：初日の出を見に出かける人、帰る人' || char(10) || '■ 終夜運転の電車があっても、タクシー需要は深夜・早朝に残る', '大晦日は夕方から夜にかけて一度静かになりますが、23時ごろからカウントダウンや初詣で人が動き出します。0時を過ぎると初詣の帰りで足がない人が出てきて、明け方は初日の出を見に行く人、帰る人。電車が終夜運転でも、深夜から早朝のタクシー需要は残ります。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 6);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 7, 'content', 'green', '年明け（1月1日〜5日ごろ）', '個人タクシーが休むぶん、法人の出番', '初売り・福袋：百貨店・大型商業施設に朝から行列' || char(10) || '新年会・新年の挨拶まわり（1月4日〜の仕事始め）' || char(10) || 'Uターン：駅・空港から住宅地へ、荷物が多い' || char(10) || '個人タクシーの稼働が減る→台数が足りない時間帯ができる' || char(10) || '■ 「正月だから暇」ではなく「正月だから乗れる」', '年が明けると、初売りや福袋で百貨店に朝から行列ができ、仕事始めの4日ごろからは新年会と挨拶まわり。帰省からのUターンは荷物が多いのでタクシーが選ばれます。そして年明けは個人タクシーの稼働が減ります。台数が足りない時間帯ができるので、法人の出番です。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 7);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 8, 'steps', 'green', '需要の波をつかむ', '時期ごとの「人の動き」', '12月中旬〜｜忘年会・仕事納め・買い出し' || char(10) || '12/31 夜｜カウントダウン・初詣の集まり' || char(10) || '1/1 早朝｜初詣の帰り・初日の出' || char(10) || '1/2〜3｜初売り・福袋・Uターン' || char(10) || '1/4〜｜仕事始め・新年会', '時期ごとにまとめるとこうなります。忘年会と仕事納め、カウントダウンと初詣、初日の出、初売りとUターン、仕事始めと新年会。この波に合わせて、自分の出番と走るエリアを決めていきます。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 8);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 9, 'section', 'amber', '第2章　繁忙期の街とお客様', 'お祭りモードの裏側にあるもの', '', '第2章は繁忙期の街とお客様です。いいことが多いのですが、裏側にクレームと忘れ物という落とし穴があります。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 9);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 10, 'content', 'amber', '繁忙期の街はこうなる', 'どのエリアにも共通する特徴', 'お金に余裕のある人が、いつも以上に多い' || char(10) || '人の数そのものが増える（出張・帰省・観光・忘年会）' || char(10) || '家の中で宴会をする人も多い→マンションへの迎車が増える' || char(10) || '街全体が「お祭りモード」で、財布の紐がゆるい' || char(10) || '■ 普段なら電車で帰る距離でも、タクシーで帰る', '繁忙期の街の特徴です。お金に余裕のある人が多く、人の数自体も増える。家で宴会をする人も多いので、マンションへの迎車も増えます。街全体がお祭りモードで、普段なら電車で帰る距離でもタクシーに乗ってくれます。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 10);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 11, 'content', 'amber', '裏返しのリスク', '楽しんでいる・酔っているからこそ', 'ちょっとした不機嫌が、大きなクレームにつながる' || char(10) || '気の緩みで忘れ物が増える（スマホ・財布・お土産・傘）' || char(10) || '支払いのトラブル（お釣り、カードが使えない、寝て起きない）' || char(10) || '道の指示があいまい、途中で行き先が変わる' || char(10) || '■ 対策は「先に確認」と「降りる前の一声」', 'ただし、楽しんでいて酔っているからこそ、ちょっとした不機嫌が大きなクレームにつながります。忘れ物もいつもより増える。だから対策は2つ。乗る前・走り出す前に確認すること、降りる前に忘れ物の一声をかけること。この2つで大半は防げます。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 11);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 12, 'content', 'amber', '年末年始の酔っぱらい あるある', 'カネフジ班長の体験談とともに', '乗った瞬間に寝る→目的地が分からない' || char(10) || '「とりあえず○○方面」で、途中から指示が変わる' || char(10) || '料金で急にもめる（高いと言い出す、お釣りが合わない）' || char(10) || '気分が悪くなる→車内で吐きそうになる' || char(10) || '連れが先に降りて、残った人が支払えない' || char(10) || '■ ここで班長に、実際にあった話と「どう対応したか」を聞きます', 'ここはカネフジ班長の時間です。年末年始の酔っぱらいあるあるを、実際にあった話を交えて話してもらいます。乗った瞬間に寝る、途中で行き先が変わる、料金でもめる、気分が悪くなる、連れが先に降りて払えない。それぞれ、班長がどう対応して切り抜けたかを聞いてください。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 12);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 13, 'content', 'amber', '対応の型（こじらせないために）', '酔っているお客様ほど「先に」「短く」「はっきり」', '乗ったら最初に：行き先・ルート・支払い方法を確認してから発進' || char(10) || '寝そうなお客様：行き先の建物名や目印まで聞いておく' || char(10) || 'もめそうなとき：言い返さない。無線・営業所に相談する' || char(10) || '吐きそうなとき：すぐ安全な場所に停めて外へ。袋は常備' || char(10) || '降りる前：「お忘れ物ないですか」と座席を一緒に確認' || char(10) || '■ 無理に乗せない・無理に続けない判断も大事', '対応の型です。酔っているお客様ほど、先に、短く、はっきり確認します。発進前に行き先とルートと支払い方法。寝そうなら目印まで聞く。もめそうなら言い返さず営業所に相談。吐きそうならすぐ停めて外へ。降りる前に忘れ物の確認。そして、無理に乗せない、無理に続けない判断も大事です。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 13);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 14, 'question', 'amber', 'こんなとき、どうしますか？', '目的地に着いたのに、お客様が寝ていて起きません', '肩をたたいて大きな声で起こす' || char(10) || '起きるまで待つ（メーターは止める）' || char(10) || '営業所・無線に連絡して指示をあおぐ' || char(10) || '近くの交番に相談する', 'ディスカッションです。目的地に着いたのにお客様が寝ていて起きない。皆さんならどうしますか。周りと話して、どれを選ぶか、理由も考えてください。正解は一つではありません。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 14);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 15, 'answer', 'amber', '基本は「無理に触らない・営業所へ連絡」', '声かけで起きなければ、一人で抱えこまない', '声かけは大きな声で、体には極力触れない（トラブル防止）' || char(10) || 'メーターは止めて、営業所・無線に状況を伝える' || char(10) || 'それでも起きないときは警察（交番・110番）に相談するのが一般的' || char(10) || '■ 詳しい手順は会社のルールに従う。班長から補足', '基本は、無理に触らず、営業所に連絡です。体を揺すって起こすと、あとで「触られた」とトラブルになることがあります。大きな声で声をかけ、起きなければメーターを止めて営業所へ。それでも起きないときは警察に相談するのが一般的です。会社のルールと、班長の経験から補足してもらいます。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 15);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 16, 'section', 'blue', '第3章　流しとつけ待ち、どっちがいいの？', '繁忙期の正解は「繋がる方」', '', '第3章は永遠のテーマ、流しかつけ待ちか。繁忙期に限って言えば、答えはわりとはっきりしています。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 16);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 17, 'question', 'blue', '流しとつけ待ち、どっちがいい？', 'ふだんの自分のやり方と、その理由を話してください', '基本は流し' || char(10) || '基本はつけ待ち' || char(10) || '時間帯で使い分ける' || char(10) || 'エリアで使い分ける', 'まず皆さんに聞きます。ふだんは流し派かつけ待ち派か。時間帯やエリアで使い分けている人もいると思います。理由も含めて何人かに話してもらいます。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 17);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 18, 'answer', 'blue', '繁忙期は「繋がる」流しが強い', '乗り場が枯渇し、路上にお客様があふれる時期だから', '駅やホテルの乗り場は、夕方には長蛇の列＝車が足りない状態' || char(10) || '乗り場に並ぶより、路上で手を挙げている人を拾う方が早い' || char(10) || '降ろした先でも次のお客様がいる→「ずっと繋がる」のが繁忙期' || char(10) || 'つけ待ちが強い場面：終電後の駅、ホテルの早朝、大雨' || char(10) || '■ 答えは「その場所・その時間で、次に繋がる方」', '繁忙期は乗り場が枯渇して、路上にお客様があふれます。だから基本は流し。降ろした先でも次のお客様がいるので、繋がり続けます。ただし終電後の駅やホテルの早朝、大雨のときはつけ待ちが強い。結論は、その場所その時間で、次に繋がる方を選ぶ、です。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 18);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 19, 'section', 'green', '第4章　エリア攻略', '恵比寿・東京駅周辺・渋谷　＋御徒町・五反田', '', '第4章、今日のメインです。恵比寿、東京駅周辺、渋谷の3つを具体的に。御徒町と五反田は補足で触れます。3つのエリアはそれぞれ特色があります。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 19);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 20, 'question', 'green', '恵比寿って、どういう街？', 'イメージを自由に出してください（ディスカッション）', 'おしゃれな飲食店が多い街' || char(10) || 'ビジネスの街' || char(10) || 'ショッピングの街' || char(10) || '住宅街に近い街', '最初は恵比寿。皆さんのイメージを自由に出してください。実はこの4つ、全部正解です。恵比寿は一つの顔ではなく、時間帯で顔が変わる街です。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 20);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 21, 'content', 'green', '恵比寿の答え：昼も夜も顔がある街', '代官山・中目黒が隣にある', '昼：ショッピングからビジネスまで（例：スターバックス リザーブ ロースタリー、ガーデンプレイス）' || char(10) || '夜：飲食店が多く、忘年会・新年会の帰りが多い' || char(10) || '隣の代官山は「ザ・成金」。お金に余裕のある人が住み、遊ぶ' || char(10) || '中目黒も近く、3つの街を行き来する人が多い' || char(10) || '■ お客様の層が良く、距離もそこそこ出る', '恵比寿は昼はショッピングからビジネスまで、夜は飲食。隣の代官山はザ・成金、お金に余裕のある人が住んで遊ぶ街。中目黒も近いので、3つの街を行き来する人が多い。お客様の層が良く、距離もそこそこ出ます。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 21);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 22, 'content', 'green', '恵比寿の流し方', '乗り場は夕方まで枯渇。だから路上で拾って、繋げる', '恵比寿駅のタクシー乗り場は夕方まで枯渇状態＝並ぶ意味がない' || char(10) || '駅周辺・駒沢通り・明治通りを流す。手を挙げる人が多い' || char(10) || '駒沢通りから世田谷方面へ連れて行かれることが多い' || char(10) || '世田谷からは都心へ戻る引力が発生→帰りも空車にならない' || char(10) || '■ 行って、戻って、また恵比寿。ずっと繋がるのが恵比寿の強み', '恵比寿の流し方です。駅の乗り場は夕方まで枯渇状態なので、並ぶ意味がありません。駅周辺と駒沢通り、明治通りを流します。駒沢通りから世田谷方面へ連れて行かれることが多いですが、世田谷からは都心へ戻る引力があるので、帰りも空車になりません。行って、戻って、また恵比寿。ずっと繋がるのが恵比寿の強みです。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 22);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 23, 'content', 'green', '東京駅周辺', '帰省・仕事納め・新年会が全部集まる', '丸の内・大手町：仕事納め・新年会のビジネス客（夜）' || char(10) || '八重洲・日本橋：新幹線の帰省客、荷物が多い（昼〜夜）' || char(10) || '年末は深夜まで、年始は早朝から、駅発の需要がある' || char(10) || '乗り場は長蛇の列→丸の内仲通り・八重洲通りの路上で拾う' || char(10) || '■ 駅周辺の乗り場ルール・停車禁止場所は必ず守る', '東京駅周辺は、帰省と仕事納めと新年会が全部集まる場所です。丸の内・大手町はビジネス客、八重洲・日本橋は新幹線の帰省客で荷物が多い。乗り場は長蛇の列なので、丸の内仲通りや八重洲通りの路上で拾います。ただし駅周辺の乗り場ルールと停車禁止の場所は必ず守ってください。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 23);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 24, 'content', 'green', '渋谷', 'カウントダウンと若者の街。人は多いが、注意も多い', '忘年会・新年会：道玄坂・センター街・宮益坂に人があふれる' || char(10) || '大晦日：カウントダウンで交通規制。周辺道路は動かない' || char(10) || '若い人が多く、短距離が多め。ただし数で稼げる' || char(10) || '代官山・恵比寿・中目黒と地続き→恵比寿の流しとセットで' || char(10) || '■ 人混みでの乗降は危険。少し離れた場所で拾う', '渋谷は忘年会・新年会で道玄坂やセンター街に人があふれます。大晦日はカウントダウンの交通規制で周辺道路が動かないので、近づきすぎないこと。若い人が多く短距離が多めですが、数で稼げます。代官山・恵比寿・中目黒と地続きなので、恵比寿の流しとセットで考えると繋がります。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 24);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 25, 'content', 'green', '補足：御徒町・五反田', '時間帯を選べば強いエリア', '御徒町：アメ横の年末買い出し（12/28〜31は昼から人の波）、荷物が多くタクシー向き' || char(10) || '五反田：飲み屋街の帰り、目黒・大崎と地続きで住宅地へ' || char(10) || 'どちらも「昼の御徒町、夜の五反田」のように時間帯で選ぶ' || char(10) || '■ 3つのメインエリアと組み合わせて、空車時間を減らす', '補足で御徒町と五反田。御徒町はアメ横の年末買い出しで、28日から31日は昼から人の波。荷物が多いのでタクシー向きです。五反田は飲み屋街の帰りで、目黒・大崎と地続きで住宅地へ行けます。昼の御徒町、夜の五反田のように時間帯で選んで、メインエリアと組み合わせます。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 25);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 26, 'steps', 'green', '3エリアの使い分け', '共通点は「余裕のある人＋いつも以上の人出」', '恵比寿｜夕方〜深夜。世田谷との往復で繋げる' || char(10) || '東京駅｜昼は帰省、夜は仕事納め。駅発を路上で拾う' || char(10) || '渋谷｜夜。人混みを避けて少し離れて拾う' || char(10) || '御徒町｜年末の昼。買い出しの荷物客' || char(10) || '五反田｜夜。飲み屋街の帰り', 'まとめるとこうです。恵比寿は夕方から深夜、世田谷との往復で繋げる。東京駅は昼は帰省、夜は仕事納め。渋谷は夜、人混みを避けて少し離れて拾う。御徒町は年末の昼、五反田は夜。どのエリアも共通して、余裕のある人といつも以上の人出があります。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 26);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 27, 'section', 'slate', '第5章　ルールと、稼いだ先にあるもの', '銀座乗禁・給料明細', '', '最後の章です。稼ぐ前に守るルール、銀座乗禁。そして稼いだ先に何があるか、給料明細を見てもらいます。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 27);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 28, 'content', 'slate', '銀座 乗車禁止地区（乗禁）', '知らなかったでは済まない', '銀座の指定区域では、夜の指定時間帯に路上での乗車が禁止（指定の乗り場のみ）' || char(10) || '時間帯・区域・年末の特別な扱いは、最新の案内を講師が説明' || char(10) || '違反すると会社と本人の両方に影響する' || char(10) || 'お客様に手を挙げられても、区域内では乗せられないと説明する' || char(10) || '■ 年末は取り締まりも強化される。必ず最新ルールを確認', '銀座の乗車禁止地区です。指定区域では夜の指定時間帯に路上での乗車ができず、指定の乗り場からだけになります。時間帯や区域、年末の特別な扱いは変わることがあるので、ここは講師から最新の案内を説明します。年末は取り締まりも強化されます。お客様に手を挙げられても、区域内では乗せられないことをきちんと説明してください。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 28);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 29, 'content', 'slate', '給料明細を見てみよう', '繁忙期を走りきった人の、実際の数字', '当日、繁忙期の給料明細（実例）をスクリーンに映します' || char(10) || '見てほしいのは「出番数」「営収」「手取り」の関係' || char(10) || '同じ出番数でも、走り方で差が出る' || char(10) || '■ 数字は個人情報なので、撮影・持ち出しはしない', 'ここで実際の給料明細を見てもらいます。繁忙期を走りきった人の数字です。見てほしいのは出番数と営収と手取りの関係。同じ出番数でも、今日話した走り方で差が出ます。数字は個人情報なので、撮影や持ち出しはしないでください。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 29);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 30, 'content', 'blue', '今日のまとめ', 'この3つだけ持って帰ってください', '年末年始の「人の動き」に合わせて、出番と走るエリアを決める' || char(10) || '繁忙期は「繋がる」流し。乗り場に並ばない' || char(10) || '先に確認・降りる前の一声で、クレームと忘れ物を防ぐ' || char(10) || '■ 恵比寿は世田谷と往復、東京駅は路上で拾う、渋谷は少し離れて', 'まとめです。人の動きに合わせて出番とエリアを決める。繁忙期は繋がる流し。先に確認と降りる前の一声でクレームと忘れ物を防ぐ。この3つだけ持って帰ってください。質問があればこの場でどうぞ。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 30);

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
SELECT id, 31, 'closing', 'blue', '年末年始、繋げて稼いで、無事に帰ろう', 'お疲れさまでした', '', '以上で繁忙期対策勉強会を終わります。繋げて、稼いで、そして無事に帰ってくる。それが一番です。お疲れさまでした。'
FROM daihon_decks WHERE title = '繁忙期対策勉強会 2026' AND NOT EXISTS (SELECT 1 FROM daihon_slides s WHERE s.deck_id = daihon_decks.id AND s.sort_order = 31);
