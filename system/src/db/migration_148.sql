-- ===================================================
-- migration_148: 台本デッキ追加「乗務を極める マインド講座（営業所研修版）」
--   ・既存の台本機能（daihon_decks / daihon_slides、migration_139）に
--     新しいデッキを1つ追加するだけ。テーブル構造・API・編集画面は変更なし。
--   ・元データ = 提供PDF「乗務を極める マインド講座（営業所研修版）.pdf」（全20ページ）を
--     台本のスライド形式（cover/section/content/closing）に書き起こし。
--   ・PDF内 7ページ目（第2章「朝・昼・夕・夜」の内容カード）と、
--     第5章「営業ルールと銀座の規制」の本文ページは、PDF側の描画データが失われており
--     読み取れなかったため、章タイトルのみ収録（本文は空欄。アプリ上で追記可能）。
--   ・以降の内容編集・スライド追加/削除・並べ替えはすべて /daihon/:id の編集画面で自由に行える。
-- ===================================================

INSERT INTO daihon_decks (title, subtitle, speaker, intro, sort_order)
SELECT
  '乗務を極める マインド講座（営業所研修版）',
  '「運まかせの営業」から卒業しよう。',
  '',
  '東京の人の動きを読めば、安全も売上もついてくる。営業所研修用に、営業の考え方・東京の人の波の読み方・JPN TAXIでの安全運転・トラブル防止と接客・営業ルールの5章立てでまとめた研修資料。',
  COALESCE((SELECT MAX(sort_order) FROM daihon_decks), -1) + 1;

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座（営業所研修版）'), 0, 'cover', 'blue',
  '乗務を極める マインド講座',
  'タクシー乗務員 研修講座',
  '■ 「運まかせの営業」から卒業しよう。' || char(10) ||
  '東京の人の動きを読めば、安全も売上もついてくる！',
  '');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座（営業所研修版）'), 1, 'section', 'blue',
  '営業の考え方を変える',
  '「ただ走る」のと「考えて走る」のでは、結果がまるで違う',
  '',
  '');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座（営業所研修版）'), 2, 'content', 'blue',
  '【比較】売上を追うか、人の動きを見るか',
  '',
  '■ 目先の数字だけ追う人' || char(10) ||
  '「近距離ばかりで儲からない」と愚痴る' || char(10) ||
  '焦って無理な車線変更やスピード違反' || char(10) ||
  '事故や苦情を起こして大損してしまう' || char(10) ||
  char(10) ||
  '■ 人の動きを考える人' || char(10) ||
  '天気や電車の乱れを見て走る場所を変える' || char(10) ||
  '「今、街で何が起きているか」を考える' || char(10) ||
  '無理をしないから、安定して長く稼げる',
  '');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座（営業所研修版）'), 3, 'content', 'blue',
  '【心得】「運」に対するプロの考え方',
  '',
  '■ タクシーは「運だけの仕事」じゃない。' || char(10) ||
  '運が転がっている場所へ、自分で動けるかが腕の見せどころ。' || char(10) ||
  '（漫然と待たず、確率の高い場所へ自分から行く）',
  '');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座（営業所研修版）'), 4, 'content', 'blue',
  '【転換】「客を待つ」から「動線を読む」へ',
  '',
  '■ ぼーっと待たない' || char(10) ||
  '大通りを何となく流すだけの受動的な走りをやめる。' || char(10) ||
  char(10) ||
  '■ 動く理由を考える' || char(10) ||
  '「人がいる場所」ではなく「人が移動したい理由」に先回り。' || char(10) ||
  char(10) ||
  '■ 確率を高める' || char(10) ||
  '時間帯・天気・電車の状況を見て、自分の位置を修正する。',
  '');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座（営業所研修版）'), 5, 'section', 'green',
  '東京の「人の波」を読む',
  '朝・昼・夕・夜で、東京はまったく別の街になる',
  '',
  '');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座（営業所研修版）'), 6, 'content', 'green',
  '【変化】雨と電車のトラブルを見逃すな',
  '',
  '■ 雨・猛暑のとき' || char(10) ||
  '普段歩く人や自転車の人が一気に乗ってくる' || char(10) ||
  '住宅街や裏通りでもどんどん手が挙がる' || char(10) ||
  '「いつも通り」を捨てて臨機応変に動く！' || char(10) ||
  char(10) ||
  '■ 電車の運転見合わせ' || char(10) ||
  '東上線・埼京線・総武線などが止まった時' || char(10) ||
  'ターミナル駅に乗客が一気に押し寄せる' || char(10) ||
  '無線や運行情報を素早くキャッチする！',
  '');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座（営業所研修版）'), 7, 'content', 'green',
  '【効率】空車で走るムダを削る',
  '1日のムダな空車時間：30分',
  '■ 「あと5分、ここにいて意味があるか？」' || char(10) ||
  '10分、20分の空車が重なると大赤字になる' || char(10) ||
  '見込みが薄いなら、理由を持ってすぐ動く！' || char(10) ||
  '降ろした場所から「次の一手」をすぐ考える' || char(10) ||
  '「元の場所に戻ること」自体を目的にしない',
  '');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座（営業所研修版）'), 8, 'section', 'amber',
  'JPN TAXIと安全運転の鉄則',
  'いま主流のJPN TAXIを正しく扱い、事故をゼロにする',
  '',
  '');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座（営業所研修版）'), 9, 'content', 'amber',
  '「流し」と「客待ち」は違う！',
  '',
  '■ 交差点やバス停で止まらない！' || char(10) ||
  '交差点の中、横断歩道の上、バス停付近での客待ちは道路交通法違反です。東京タクシーセンターや警察からも厳しく見られています。' || char(10) ||
  '現代の流し営業とは、安全に走りながら「次に出てくるお客様」に目を配ることです。',
  '');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座（営業所研修版）'), 10, 'content', 'amber',
  '【安全第一】急加速・急ブレーキを徹底的に減らす',
  '',
  '原則第1車線（左車線）をキープレフトで走る：お客様の合図にすぐ気づける＆無理な車線変更を防ぐ。' || char(10) ||
  '急制動の多い人は事故率が高い：営業所のデータでも「急ブレーキ・急発進」が多い人は確実に事故を起こしています。' || char(10) ||
  '事故を起こしたら今日の売上は一瞬でパァ：無理に1回乗せるより、無事故で基地に帰ることが一番儲かる！',
  '');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座（営業所研修版）'), 11, 'section', 'blue',
  'トラブル防止と接客のキホン',
  '「自分が正しいか」で争うな。「安心感」を渡そう',
  '',
  '');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座（営業所研修版）'), 12, 'content', 'blue',
  '【確認】知ったかぶり発進を絶対にしない',
  '',
  '■ 聞き間違いに注意' || char(10) ||
  '「錦糸町」と「警視庁」など。あやふやなら発進前に必ず聞き直す！' || char(10) ||
  char(10) ||
  '■ 目印（ランドマーク）' || char(10) ||
  '「美術館の手前」「駐車場の広いコンビニ」など具体的に確認する。' || char(10) ||
  char(10) ||
  '■ ナビを素直に使う' || char(10) ||
  '「確実にお届けしたいのでナビに入れますね」と率直に伝える。',
  '');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座（営業所研修版）'), 13, 'content', 'blue',
  '【ルール】勝手な「乗車拒否」は絶対にダメ！',
  '',
  '■ こんな理由で断るのは違反！' || char(10) ||
  '「ワンメーターの近距離だから嫌だ」' || char(10) ||
  '「行きたい方向と逆だから嫌だ」' || char(10) ||
  '「高速に乗ってくれないと儲からない」' || char(10) ||
  '※ ドライバー都合の選別は厳罰対象です！' || char(10) ||
  char(10) ||
  '■ 乗れない時も代案を出す！' || char(10) ||
  '定員オーバーや大きな荷物で乗れない時' || char(10) ||
  '「無理！」と突っぱねず、理由を丁寧に話す' || char(10) ||
  '「2台に分かれて乗りましょうか」と提案する' || char(10) ||
  '※ 困っているお客様を助ける姿勢がプロ！',
  '');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座（営業所研修版）'), 14, 'content', 'blue',
  '【接客】「何も起こさない」が一番のサービス',
  '事故・苦情・不安 → ゼロ',
  '■ 派手な挨拶より「任せて安心できる静けさ」' || char(10) ||
  '行き先を復唱し、「かしこまりました」と受ける' || char(10) ||
  'ルートの希望（高速・一般道）をしっかり確認' || char(10) ||
  '降りるときは水たまりや段差のない場所を選ぶ' || char(10) ||
  '最初から最後まで、お客様にハラハラさせない！',
  '');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座（営業所研修版）'), 15, 'section', 'slate',
  '営業ルールと銀座の規制',
  '「道を知っている」だけでなく「ルールを守れる」のがプロ',
  '',
  '');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座（営業所研修版）'), 16, 'content', 'slate',
  '【成長】1乗務ごとの振り返りが腕を上げる',
  '',
  '「なぜ乗ったか」「なぜ乗らなかったか」を考える：たまたまではなく、理由を考えるクセをつける。' || char(10) ||
  '天気や電車の遅れをメモしておく：「雨の日はここ」「総武線が止まったらここ」と自分の引き出しが増える。' || char(10) ||
  '昨日の自分より1歩だけ上手くなればいい：地理・安全・接客を少しずつ磨いて、長く元気に稼ごう！',
  '');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座（営業所研修版）'), 17, 'content', 'slate',
  '【まとめ】明日からのハンドルで自問する3つのこと',
  '',
  '■ 問い1：何となく走ってないか？' || char(10) ||
  '惰性で走らず、常に目的を持って車を走らせよう。' || char(10) ||
  char(10) ||
  '■ 問い2：ここにいる理由は何か？' || char(10) ||
  '時間・天気・曜日から見て、本当にここがベストか？' || char(10) ||
  char(10) ||
  '■ 問い3：次はどこで客が生まれる？' || char(10) ||
  '「人がいる場所」ではなく「移動したい理由」を先読み！',
  '');

INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes)
VALUES ((SELECT id FROM daihon_decks WHERE title = '乗務を極める マインド講座（営業所研修版）'), 18, 'closing', 'blue',
  '本日もご安全に！',
  '安全第一で、今日より良い乗務を積み重ねていきましょう。',
  '■ 質問・現場の体験談など自由にどうぞ！',
  '');
