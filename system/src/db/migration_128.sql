-- ===================================================
-- migration_128: ヒヤリハット収集（Web集計）
--
--   紙の「ヒヤリハット報告シート（ハインリッヒの法則）」をWeb化する。
--   - 乗務員は専用の公開URL（HIYARI_PATH）から社員番号を入れて投稿する。
--     社員番号は employees と照合し、課・班をサーバー側で自動的に控える
--     （氏名は保存しない／集計・管理画面にも氏名は出さない）。
--   - 設定「板橋（営業所ページ）」に「ヒヤリハット」タブを追加し、
--     公開URL・QRの掲示と投稿の一覧管理（状況/対応メモ/削除）を行う。
--   - 集計・分析は課長ミッション「ヒヤリハット」ページ（/kacho-mission/hiyari）が
--     この1テーブルを読んで表示する。
--   - PDF由来の初期31件（2026年8月20日 集約分）を source='sheet' として投入し、
--     Web投稿分と一体で集計する。
--
--   公開ページ : {HIYARI_PATH}                （config.ts）
--   公開API    : /api/public/hiyari            （認証なし・社員番号照合のみ）
--   管理API    : /{SECRET}/admin/api/hiyari-reports/*  （権限: settings.study-sessions）
--
--   study_sessions / office_opinions / chosei 系テーブルとは一切共有しない完全新規。
-- ===================================================

CREATE TABLE IF NOT EXISTS hiyari_reports (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id      INTEGER NOT NULL DEFAULT 1,
  source         TEXT NOT NULL DEFAULT 'web',    -- 'web' = フォーム投稿 / 'sheet' = 紙シート由来の初期データ
  emp_no         TEXT NOT NULL DEFAULT '',       -- Web投稿は必須（employees照合済み）/ sheet分は空
  division       INTEGER,                        -- 社員番号照合で自動セット / sheet分は転記値
  team           INTEGER,
  occurred_at    TEXT NOT NULL DEFAULT '',       -- 発生日時（自由記述）
  weather        TEXT NOT NULL DEFAULT '',       -- 天候（選択）
  place_area     TEXT NOT NULL DEFAULT '',       -- 発生エリア（選択）
  place_detail   TEXT NOT NULL DEFAULT '',       -- 発生場所（自由記述）
  counterpart    TEXT NOT NULL DEFAULT '',       -- 相手（選択）
  situation      TEXT NOT NULL DEFAULT '',       -- 場面（選択）
  situation_text TEXT NOT NULL DEFAULT '',       -- 状況（自由記述・必須）
  cause          TEXT NOT NULL DEFAULT '',       -- ヒヤリの理由 分類（選択）
  cause_text     TEXT NOT NULL DEFAULT '',       -- ヒヤリ・ハッとした理由（自由記述）
  measure_text   TEXT NOT NULL DEFAULT '',       -- 回避できた行動・今後気をつけること（自由記述）
  severe         INTEGER NOT NULL DEFAULT 0,     -- 1 = 衝突寸前・急制動やクラクションを伴った
  status         TEXT NOT NULL DEFAULT 'open',   -- open = 未確認 / reviewed = 確認済
  admin_note     TEXT NOT NULL DEFAULT '',       -- 管理側メモ（乗務員には出さない）
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_hiyari_reports_office ON hiyari_reports(office_id, status, created_at);

-- 初期データ: 紙シート31枚（2026年8月20日 集約分）の文字起こし・分類。氏名は保持しない。
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', NULL, NULL, '', '', 'その他', 'プリンス通り', '四輪車', '飛び出し', 'わき道から車が飛び出してきた', '相手の予測外行動', '相手が車を確認せずに出てきて、ぶつかりそうになった', '速度をあまり出していなかったため回避できた', 0, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 2, 4, '8/31 7:20 朝', '晴（猛暑）', '羽田空港', '羽田空港 第1〜第3ターミナル／国道357号線の分岐部', '四輪車', '割り込み・幅寄せ', '分岐直前で並走車が割り込もうとし、クラクションを鳴らし急ブレーキとなった', '相手の予測外行動', '分岐直前での並走車の急な動作', '（記入なし）', 1, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 2, 4, '8/31 9:15 朝', '曇', '営業所周辺', '営業所へ帰庫する際、営業所近くのトヨタの交差点', '自転車', '飛び出し', '一方通行路を逆走＋猛スピードの自転車が飛び出してきた', '相手の交通違反', '逆走路には一時停止標識等がなく、自転車側も認識しづらい構造', 'かもしれない運転を心掛ける', 0, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 4, 8, '', '', '池袋エリア', '池袋 六ツ又 交番前 横断歩道', '歩行者', '右左折時', '右折時、横断中の歩行者が死角に入りヒヤリとした', '自分の確認不足', '死角・判断の遅れ', '目視で確認して安全確保', 1, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', NULL, NULL, '夕方〜深夜（16:20〜23:47 に複数件）', '', '外苑・六本木エリア', '明治神宮前付近／東大赤門付近／渋谷二丁目 首都高出口付近／西麻布交差点／六本木交差点〜東京ミッドタウン前', '複合', '複合', '1名が同日に複数件を報告：歩道からの自転車の車道進入／右折時の交錯／路地から出たタクシーの幅寄せ／路地からの車の飛び出し／対向車の突然の右折', '相手の予測外行動', 'いずれも相手の予想外行動', '', 0, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 4, 8, '', '', '新宿エリア', '西新宿交差点', '二輪車', '進路変更・車線変更時', '右へ車線変更しようとした際、右後方から来たバイクと接触しそうになった', '自分の確認不足', '後方確認の徹底不足。後続のバイクが急に右へ移動した', '後方確認を必ず数回行う', 1, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 4, 8, '', '', 'その他', '市谷柳町を大久保通り上り方面に1つ進んだ交差点', '四輪車', '進路変更・車線変更時', '左折しようとして一方通行と気づき、直進へ戻ろうとして後続車と衝突しかけた', '判断ミス・焦り', '道を間違えた時に焦って確認をしなかった', '間違えたと思ったら一時停止をして数秒考える', 1, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 4, 7, '昼', '晴', '池袋エリア', '東池袋交差点（池袋駅方面・直進）', '四輪車', '前車の急な動作', '前車トラックに車間を詰めて続き、交差点の先が詰まっていて急ブレーキになった', '車間距離不足', '交差点の先の状況確認不足・車間不足', '車間を広く取り、信号で無理に進入しない', 0, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 8, 7, '7/9(木) 6:15 朝', '', '新宿エリア', '新宿区改代町', '四輪車', '右左折時', '右折時、左からの対向車が直進すると思ったら右折してきた', '判断ミス・焦り', '対向車の動きを直進と誤認', '様子を見てから左右を確認して右左折する', 0, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 4, 8, '', '', '恵比寿エリア', '恵比寿南〜恵比寿南二丁目の信号間', '信号・自車判断', '信号・交差点内滞留', '信号間隔が長く車が詰まり、無理に進入すると交差点内で他車の通行を妨げ狭くなる', '判断ミス・焦り', '判断ミス', '信号を進むときは信号の先を見る', 0, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 4, 8, '', '', '新宿エリア', '新宿大ガード東 交差点', '信号・自車判断', '信号・交差点内滞留', '黄で交差点に進入したら、交差点の先の横断歩道信号が渡りきる前に変わった', '判断ミス・焦り', '判断の遅れ。「行ける」と思ってしまった', '余裕をもって判断する・信号を守る', 0, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 4, 8, '', '', 'その他', '国立能楽堂前の道／余丁町通りの脇道', '四輪車', '狭路・待機トラブル', '迎車地点がすれ違い不能の狭路で、対向車が来て、さらに後続車にも挟まれた', '判断ミス・焦り', '待機場所の判断ミス', '交通事情で待機できない旨を客に伝え、別の場所で待機すべきだった', 0, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 1, 1, '昼', '曇', 'その他', '大塚駅付近', '自転車', '飛び出し', '見えない所からかなりの勢いで自転車が飛び出してきた', '相手の予測外行動', '死角・相手の速度', '30km/h前後で走行していたためぶつからなかった', 0, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 2, 4, '深夜 0:00頃', '', 'その他', '木場の交差点', '四輪車', '割り込み・幅寄せ', '対向のタクシーがイエローカットして左車線に寄り、ぶつかる寸前だった', '自分の確認不足', '確認不足・見落とし', '', 1, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 2, 3, '朝方（暗い時間帯）', '', 'その他', '世田谷区 八幡山 の狭路', '路上横臥者', 'その他', '狭く暗い道で、人が車道にはみ出して寝ており、轢く可能性があった', '環境要因（暗さ・狭さ）', '暗さ・狭さ・視認性の低さ', '発見後すぐ警察へ通報。ライトを活用し見落とさないよう運転する', 1, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 2, 3, '8/30 20:00 夜', '', '羽田空港', '羽田空港', '四輪車', '割り込み・幅寄せ', '高速入口での割り込み', '相手の予測外行動', '予測外行動', '車間を空ける', 0, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 4, 2, '8/21 1:10 深夜', '晴', '外苑・六本木エリア', '外苑西通り（プラチナ通り付近）', '自転車', '逆走', '第2車線を、対向からフラつく自転車が逆走してきた。後続車がいないのを確認しその場で停車して回避', '相手の予測外行動', '酔っていたとみられ、相手の行動が予測できなかった', '後続車がいないことを確認し、その場で車を止めた', 1, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 3, 5, '8/26 9:40 朝', '晴', 'その他', '白山通りを神保町方面へ', '四輪車', '進路変更・車線変更時', '左の車線へ移ろうと後方確認をしていたら、前方の車がすでに停止していた', '自分の確認不足', '後方確認に気を取られていた', '', 0, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 3, 5, '8/25', '晴', '新宿エリア', '新宿', '四輪車', '進路変更・車線変更時', '車線変更時', '自分の確認不足', '確認不足', '確認すること', 0, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 3, 5, '8/25 昼', '晴', '外苑・六本木エリア', '外苑西通り', '四輪車', '割り込み・幅寄せ', '空車走行中、隣接車線の車が急に車線変更してきて急ブレーキになった', '相手の予測外行動', '相手の予測外行動', '道路状況に合った速度で走行。相手が出てくるかもと考え、両隣の車線に注意する', 0, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 2, 3, '8/19 19:40 夜', '', 'その他', '蛎殻町付近の一方通行', '四輪車', '逆走', 'カーブの先から逆走車が向かってきた', '相手の交通違反', '相手の交通違反', 'かもしれない運転に努める', 1, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 4, 8, '', '', '外苑・六本木エリア', '六本木通り', '自転車', '飛び出し', '青信号で直進中、左から信号無視の自転車が横断してきた。あと2秒ブレーキが遅ければ事故だった', '相手の交通違反', '相手（自転車）の信号無視', '青信号でも左右を確認する', 1, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 4, 8, '', '', '恵比寿エリア', '恵比寿駅', '歩行者', '右左折時', '左折時、右側から歩行者が急に横断してきた', '自分の確認不足', '右側の確認不足', '右左折する方向だけでなく、反対側にも注意・確認する', 0, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 4, 8, '', '', '新宿エリア', '西新宿', '四輪車', '前車の急な動作', '赤信号で停止していたら、前車が急にバックしてきた', '相手の予測外行動', '前車の予想外の行動', '停止時も車間距離を十分に取る', 0, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 3, 6, '8/26 11:30 昼', '晴', '新宿エリア', '新宿警察署前 交差点', '自転車', '右左折時', '左折時、歩行者・自転車の通過を確認した直後、まさに曲がろうとしたところで自転車が飛び出してきた', '自分の確認不足', '一度確認した後の再確認不足', '操作の最中も横断歩道の状況に気を配る', 1, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', NULL, NULL, '', '', 'その他', '片側一車線の道路', '四輪車', '前車の急な動作', '前方車が急ブレーキ。車間が十分でなく、こちらも急ブレーキをかけて衝突を回避した', '相手の交通違反', 'セパレート信号にもかかわらず、イエローカットして飛び出す車があった', '付近の車の一歩先の動きを予測する', 1, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 4, 7, '', '', '営業所周辺', '板橋中央陸橋 交差点', '四輪車', '右左折時', '交差点の右折時、先の路上から車両が飛び出してきた', '自分の確認不足', '見落とし', '視野を広く取る', 0, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 4, 7, '', '', '外苑・六本木エリア', '国会議事堂前 銀杏並木付近', '四輪車', '割り込み・幅寄せ', '右折レーンに急に割り込まれ、急減速した', '相手の予測外行動', '急な割り込み', '左折路の構造上、急な割り込みが多くなることは予知できた', 0, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', NULL, NULL, '', '', 'その他', '交差点', '歩行者', '右左折時', '車・歩行者とも青信号で左折時、スマホを見て2回とも動かなかった歩行者が、動き出した直後に突然横断を始めた', '自分の確認不足', '立ち止まっているから「渡らない」と決めつけた', 'スマホに集中して立ち止まっていても「渡らない」と決めつけず注意する', 0, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', 4, 8, '', '', 'その他', '片側一車線', '四輪車', '前車の急な動作', '前方の車が突然急ブレーキ、その後ウインカーを出さずに左折した', '相手の予測外行動', '信号もない交差点での急ブレーキで驚いた', '車間距離をもう少しあける', 0, 'reviewed');
INSERT INTO hiyari_reports (office_id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail, counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status) VALUES (1, 'sheet', '', NULL, NULL, '日時不明', '晴', 'その他', '高速道路', '四輪車', '割り込み・幅寄せ', 'ノーウインカーで一般車が車線変更して前に入ってきた', '相手の予測外行動', '車間距離が十分でないのに無理矢理入ってきた', 'ミラーで危険な運転を事前に把握していたので、無理に入ってくるかもと予測できた', 0, 'reviewed');

