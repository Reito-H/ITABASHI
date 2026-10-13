-- ===================================================
-- migration_195: バジル&ドラゴンズ 必殺技＋キャラ30体・敵30体の追加
--   ・puzzle_allies に必殺技（skill_name / skill_type attack|heal / skill_power）を追加。既存キャラにも技名を設定
--   ・オリジナルキャラ30体（★5×6・★4×10・★3×14）、敵30体（通常27＋ボス3）を初期投入
--   ・画像は管理画面「AIで作る」または scratchpad の一括生成で後から入れる（無い間は仮絵）
-- ===================================================
ALTER TABLE puzzle_allies ADD COLUMN skill_name TEXT NOT NULL DEFAULT '';
ALTER TABLE puzzle_allies ADD COLUMN skill_type TEXT NOT NULL DEFAULT 'attack';   -- attack=大ダメージ / heal=回復
ALTER TABLE puzzle_allies ADD COLUMN skill_power INTEGER NOT NULL DEFAULT 100;   -- attack: 攻撃×(power/10) / heal: 最大HPの power%

UPDATE puzzle_allies SET skill_name='黄金のロングラン', skill_type='attack', skill_power=130 WHERE name='黄金の運転手 ゴルドハンドル' AND skill_name='';
UPDATE puzzle_allies SET skill_name='深夜料金の裁き', skill_type='attack', skill_power=130 WHERE name='深夜の帝王 ナイトロード' AND skill_name='';
UPDATE puzzle_allies SET skill_name='爆速配車インフェルノ', skill_type='attack', skill_power=140 WHERE name='炎の配車オペレーター ヒノ' AND skill_name='';
UPDATE puzzle_allies SET skill_name='豪雨の送迎', skill_type='heal', skill_power=35 WHERE name='蒼海の送迎師 ミナト' AND skill_name='';
UPDATE puzzle_allies SET skill_name='全信号グリーンウェーブ', skill_type='attack', skill_power=120 WHERE name='森の交通整理人 グリーンマン' AND skill_name='';
UPDATE puzzle_allies SET skill_name='定額の盾', skill_type='heal', skill_power=25 WHERE name='空港定額の守護者' AND skill_name='';
UPDATE puzzle_allies SET skill_name='ETCスラッシュ', skill_type='attack', skill_power=100 WHERE name='高速料金の精霊' AND skill_name='';
UPDATE puzzle_allies SET skill_name='泡の洗礼', skill_type='heal', skill_power=30 WHERE name='洗車の達人 アワモリ' AND skill_name='';
UPDATE puzzle_allies SET skill_name='アルコールチェック・バースト', skill_type='attack', skill_power=100 WHERE name='点呼の番人' AND skill_name='';
UPDATE puzzle_allies SET skill_name='オイル交換ブレス', skill_type='attack', skill_power=110 WHERE name='整備士ドラゴン' AND skill_name='';
UPDATE puzzle_allies SET skill_name='了解の呪文', skill_type='attack', skill_power=100 WHERE name='無線の魔術師' AND skill_name='';
UPDATE puzzle_allies SET skill_name='小銭の雨', skill_type='attack', skill_power=90 WHERE name='釣り銭の魔法使い' AND skill_name='';
UPDATE puzzle_allies SET skill_name='やる気の急発進', skill_type='attack', skill_power=70 WHERE name='新人ドライバー' AND skill_name='';
UPDATE puzzle_allies SET skill_name='班長の一喝（代理）', skill_type='attack', skill_power=70 WHERE name='班長の犬' AND skill_name='';
UPDATE puzzle_allies SET skill_name='昼寝からの猫パンチ', skill_type='attack', skill_power=75 WHERE name='営業所の猫' AND skill_name='';
UPDATE puzzle_allies SET skill_name='当たりの一本', skill_type='heal', skill_power=20 WHERE name='自販機の精' AND skill_name='';
UPDATE puzzle_allies SET skill_name='300m先右方向', skill_type='attack', skill_power=70 WHERE name='カーナビ君' AND skill_name='';
UPDATE puzzle_allies SET skill_name='長話の無限ループ', skill_type='attack', skill_power=60 WHERE name='休憩所のおじさん' AND skill_name='';
-- 社員（写真）キャラの初期技名
UPDATE puzzle_allies SET skill_name='ガチ流し', skill_type='attack', skill_power=100 WHERE kind='photo' AND skill_name='';
INSERT INTO puzzle_allies (name, kind, rarity, in_gacha, element, hp, atk, sort_order, description, art_prompt, skill_name, skill_type, skill_power) VALUES
('首都高の覇者 ハイウェイ・キング', 'art', 5, 1, 'fire', 250, 37, 131, '首都高の全ルートを頭に入れた男。渋滞を見たことがない。', 'photorealistic portrait of a confident Japanese taxi driver standing on an elevated highway at sunset, flames reflecting, cinematic, 8k', '首都高フルスロットル', 'attack', 140),
('羽田の女神 エアポート・マリア', 'art', 5, 1, 'light', 270, 33, 132, '羽田の待機所に住むと噂される。定額の女王。', 'photorealistic portrait of an elegant Japanese woman in a white uniform at an airport taxi stand at dawn, soft golden light, cinematic, 8k', '定額の聖光', 'heal', 40),
('無線の神 ディスパッチャー・ゼロ', 'art', 5, 1, 'dark', 240, 38, 133, '無線に声が乗った瞬間、配車が完了している。', 'photorealistic portrait of a mysterious dispatcher in a dark control room surrounded by glowing radio waves, purple light, cinematic, 8k', 'ゼロ秒配車', 'attack', 140),
('雨の日の救世主 レインマスター', 'art', 5, 1, 'water', 280, 32, 134, '雨が降ると現れ、傘のない人を全員救う。', 'photorealistic portrait of a heroic taxi driver standing in heavy rain at night holding a glowing umbrella, blue tones, cinematic, 8k', 'ゲリラ豪雨リターンズ', 'attack', 130),
('銀座の守護竜 ギンザドラゴン', 'art', 5, 1, 'wood', 290, 31, 135, '22時になると銀座の乗り場を守る竜。乗禁は絶対。', 'photorealistic dragon with green scales coiled around a Ginza street lamp at night, neon lights, cinematic, 8k', '乗禁ブレス', 'attack', 130),
('終電の魔術師 ラストトレイン', 'art', 5, 1, 'dark', 245, 36, 136, '終電が消えた瞬間、駅前に現れる。', 'photorealistic portrait of a magician-like Japanese taxi driver in front of a closed train station gate at midnight, purple smoke, cinematic, 8k', '終電消失マジック', 'attack', 135),
('代官山のセレブ案内人', 'art', 4, 1, 'light', 195, 24, 137, '成金の街を知り尽くした案内人。チップは受け取らない。', 'photorealistic portrait of a stylish Japanese taxi driver in a tailored suit in front of a luxury boutique in Daikanyama, golden hour, 8k', 'セレブ送迎', 'attack', 100),
('新宿の夜警', 'art', 4, 1, 'dark', 200, 25, 138, '歌舞伎町の裏道をすべて知る。', 'photorealistic portrait of a vigilant taxi driver in neon-lit Kabukicho at night, rain reflections, cinematic, 8k', '裏道ナイトラン', 'attack', 100),
('池袋の路地マスター', 'art', 4, 1, 'wood', 205, 23, 139, 'サンシャイン通りの裏も表も。', 'photorealistic portrait of a cheerful taxi driver in a narrow Ikebukuro alley with lanterns, warm light, 8k', '路地裏ショートカット', 'attack', 100),
('品川の新幹線ハンター', 'art', 4, 1, 'water', 190, 26, 140, '新幹線の到着時刻を全部覚えている。', 'photorealistic portrait of a sharp-eyed Japanese taxi driver at Shinagawa station with a bullet train in the background, 8k', '到着ホーム待ち伏せ', 'attack', 105),
('六本木のナイトガイド', 'art', 4, 1, 'fire', 185, 27, 141, '六本木交差点の客待ち禁止を守りながら稼ぐ。', 'photorealistic portrait of a charismatic taxi driver at Roppongi crossing at night, red neon, cinematic, 8k', '六本木クロッシング', 'attack', 105),
('浅草の観光名人', 'art', 4, 1, 'light', 210, 22, 142, '雷門から東京タワーまで、観光案内が止まらない。', 'photorealistic portrait of a friendly older Japanese taxi driver in front of Kaminarimon gate in Asakusa, daylight, 8k', '雷門ガイドツアー', 'heal', 28),
('築地の早起きドライバー', 'art', 4, 1, 'water', 200, 24, 143, '朝4時の築地に立つ。マグロと一緒に起きる。', 'photorealistic portrait of a Japanese taxi driver at Tsukiji market at dawn with fish stalls behind, cold blue morning light, 8k', '早朝ダッシュ', 'attack', 100),
('上野の荷物運び', 'art', 4, 1, 'wood', 215, 22, 144, 'どんな大荷物もトランクに収める達人。', 'photorealistic portrait of a strong Japanese taxi driver loading huge suitcases into a taxi trunk at Ueno station, 8k', 'トランク収納術', 'heal', 28),
('丸の内のビジネス送迎', 'art', 4, 1, 'light', 190, 25, 145, '仕事納めの夜、丸の内仲通りに現れる。', 'photorealistic portrait of a polite taxi driver opening the door for a businessman on Marunouchi Naka-dori at night, illuminations, 8k', '仕事納めエスコート', 'attack', 100),
('渋谷スクランブルの達人', 'art', 4, 1, 'fire', 185, 27, 146, '人混みの中で乗せる場所を一瞬で見つける。', 'photorealistic portrait of a cool taxi driver at Shibuya scramble crossing with crowds blurred in motion, night, cinematic, 8k', 'スクランブル回避', 'attack', 105),
('新人オペレーター', 'art', 3, 1, 'water', 130, 15, 147, '無線の「了解」がまだ小さい。', 'photorealistic portrait of a nervous young Japanese female dispatcher with a headset in an office, 8k', '初めての配車', 'attack', 70),
('洗車場のアルバイト', 'art', 3, 1, 'water', 145, 13, 148, '泡だらけで走り回る。', 'photorealistic portrait of a young Japanese part-timer washing a taxi with lots of foam, bright daylight, 8k', '高圧洗浄', 'attack', 70),
('営業所の受付さん', 'art', 3, 1, 'light', 140, 14, 149, '笑顔で全員を送り出す。', 'photorealistic portrait of a smiling Japanese receptionist at a taxi company office counter, warm light, 8k', 'いってらっしゃい', 'heal', 18),
('班長', 'art', 3, 1, 'fire', 150, 14, 150, 'シフト表を握る男。', 'photorealistic portrait of a stern but kind Japanese team leader in a taxi company uniform holding a clipboard, 8k', '班長の一喝', 'attack', 75),
('課長のハンコ', 'art', 3, 1, 'dark', 120, 17, 151, '押された書類は二度と戻らない。', 'photorealistic close-up of a Japanese wooden hanko seal stamping a document, dramatic lighting, 8k', '承認スタンプ', 'attack', 75),
('整備工場のラジオ', 'art', 3, 1, 'wood', 135, 14, 152, 'いつも同じ曲が流れている。', 'photorealistic old radio on a workbench in a car repair garage, warm light, 8k', 'ヒットチャート再生', 'attack', 70),
('休憩室のテレビ', 'art', 3, 1, 'light', 150, 12, 153, 'ワイドショーが止まらない。', 'photorealistic old television in a taxi drivers rest room with sofas, afternoon light, 8k', 'ワイドショー攻撃', 'attack', 65),
('自販機のコーヒー', 'art', 3, 1, 'fire', 125, 16, 154, '缶コーヒーの熱さは本気。', 'photorealistic hot canned coffee steaming next to a vending machine at night, 8k', 'ホット缶投げ', 'attack', 75),
('営業所の植木', 'art', 3, 1, 'wood', 160, 11, 155, '誰も水をやらないのに元気。', 'photorealistic potted plant in the corner of a taxi company office, sunlight through window, 8k', '光合成', 'heal', 18),
('駐車場の猫', 'art', 3, 1, 'dark', 115, 17, 156, 'タクシーの上で寝るのが好き。', 'photorealistic cat sleeping on the roof of a parked taxi in a parking lot at dusk, 8k', '屋根からの奇襲', 'attack', 75),
('定期点検のカレンダー', 'art', 3, 1, 'light', 140, 13, 157, '赤丸の日は逃がさない。', 'photorealistic wall calendar with red circles in a garage office, 8k', '点検日リマインド', 'heal', 18),
('無線機', 'art', 3, 1, 'dark', 130, 15, 158, '「どうぞ」。', 'photorealistic vintage taxi radio microphone on a dashboard at night, glowing dials, 8k', 'どうぞどうぞ', 'attack', 70),
('高速のETC', 'art', 3, 1, 'water', 135, 14, 159, 'ピンポーンの音で道が開く。', 'photorealistic ETC toll gate opening with a green light at night, long exposure, 8k', 'ピンポーン', 'attack', 70),
('営業所のポスター', 'art', 3, 1, 'fire', 145, 13, 160, '安全運転の標語がやたら熱い。', 'photorealistic motivational safety poster on a taxi company wall, dramatic light, 8k', '標語の熱弁', 'attack', 65);
INSERT INTO puzzle_enemies (name, element, hp, atk, is_boss, is_final, sort_order, description, art_prompt) VALUES
('行き先を言わない常連', 'dark', 620, 42, 0, 0, 216, '「いつもの」。初めて乗せる運転手には地獄。', 'photorealistic portrait of a smug regular passenger in a taxi back seat refusing to speak, night, 8k'),
('領収書ちょうだいマン', 'light', 640, 42, 0, 0, 217, '降りる直前に領収書を要求。後ろの車が鳴らしている。', 'photorealistic businessman leaning forward in a taxi demanding a receipt, impatient, 8k'),
('「近いけどいい？」おじさん', 'wood', 650, 43, 0, 0, 218, '300メートル先まで。しかも一万円札。', 'photorealistic portrait of an apologetic middle-aged Japanese man holding a 10000 yen bill at a taxi door, 8k'),
('深夜の値切り客', 'fire', 680, 44, 0, 0, 219, '「ちょっとまけてよ」。メーターは法律です。', 'photorealistic drunk Japanese man haggling with a taxi driver through the window at night, neon, 8k'),
('相席を要求する団体', 'water', 700, 44, 0, 0, 220, '5人で乗ろうとする。定員は4人。', 'photorealistic group of five party-goers trying to squeeze into one taxi at night, 8k'),
('車内で電話し続ける人', 'dark', 720, 45, 0, 0, 221, '降りる場所を言う暇がない。', 'photorealistic woman talking loudly on a phone in a taxi back seat, driver looking in mirror, 8k'),
('「急いで」連呼マン', 'fire', 740, 46, 0, 0, 222, '信号は変えられない。', 'photorealistic anxious businessman tapping his watch in a taxi back seat, stuck at a red light, 8k'),
('道案内する客（間違ってる）', 'wood', 760, 46, 0, 0, 223, '「そこ右」→一方通行。', 'photorealistic confused passenger pointing the wrong way at a one-way street sign from a taxi, 8k'),
('大荷物の帰省客', 'light', 780, 47, 0, 0, 224, 'トランクに入りきらないお土産。', 'photorealistic family with giant suitcases and gift boxes at a taxi stand near a station, winter, 8k'),
('無言で指差す客', 'dark', 800, 47, 0, 0, 225, 'どっちを指しているのか分からない。', 'photorealistic mysterious passenger pointing silently out of a taxi window at night, fog, 8k'),
('両替を要求する客', 'light', 820, 48, 0, 0, 226, '「一万円くずして」。千円札はもうない。', 'photorealistic passenger holding out a 10000 yen bill in a taxi, driver with an empty coin tray, 8k'),
('ペットを隠して乗る客', 'wood', 840, 48, 0, 0, 227, 'バッグが動いている。', 'photorealistic woman hiding a small dog in a handbag in a taxi back seat, 8k'),
('自転車を積みたい人', 'water', 860, 49, 0, 0, 228, '折りたためない自転車。', 'photorealistic man trying to fit a full-size bicycle into a taxi trunk, 8k'),
('吐き気の予兆マン', 'fire', 880, 49, 0, 0, 229, '顔色が緑。窓を全開に。', 'photorealistic pale sick young man in a taxi back seat with his hand over his mouth, green tint, 8k'),
('寝落ち常習犯', 'dark', 900, 50, 0, 0, 230, '家の前で起きない。', 'photorealistic drunk man sound asleep in a taxi back seat, mouth open, 8k'),
('「前の車についていって」客', 'light', 920, 50, 0, 0, 231, '前の車も分かっていない。', 'photorealistic taxi following another car on a dark road, passenger pointing ahead, cinematic, 8k'),
('深夜の大学生軍団', 'wood', 940, 51, 0, 0, 232, '全員が別の場所に帰る。', 'photorealistic group of rowdy university students piling into a taxi at night, 8k'),
('カラオケ帰りの合唱団', 'water', 960, 51, 0, 0, 233, '車内でアンコールが始まる。', 'photorealistic group of people singing loudly in a taxi after karaoke, night, 8k'),
('雪の日のスリップ魔', 'water', 980, 52, 0, 0, 234, 'チェーンなしで坂を登らせようとする。', 'photorealistic taxi sliding on a snowy Tokyo slope at night, snowflakes, cinematic, 8k'),
('首都高の渋滞ゴースト', 'dark', 1000, 52, 0, 0, 235, '事故もないのに動かない。', 'photorealistic ghostly figure standing in a jammed elevated highway at night, red tail lights, cinematic, 8k'),
('終電逃しの群れ', 'light', 1020, 53, 0, 0, 236, '駅前にあふれる手。', 'photorealistic crowd of people waving for taxis in front of a closed station at midnight, 8k'),
('クリスマスイブのカップル', 'fire', 1040, 53, 0, 0, 237, '目的地が決まっていない。', 'photorealistic couple in a taxi on Christmas Eve with illuminations outside, romantic, 8k'),
('初詣の大行列', 'light', 1060, 54, 0, 0, 238, '明治神宮の周りは動かない。', 'photorealistic enormous crowd at a shrine on New Year night with lanterns, cinematic, 8k'),
('福袋の争奪戦', 'fire', 1080, 54, 0, 0, 239, '開店前の百貨店。荷物が倍になって帰ってくる。', 'photorealistic crowd rushing into a department store at opening with lucky bags, 8k'),
('年始の二日酔いマン', 'wood', 1100, 55, 0, 0, 240, '1月2日の朝。全部が遅い。', 'photorealistic hungover Japanese man wearing sunglasses in a taxi on a bright morning, 8k'),
('消えた無線', 'dark', 1120, 55, 0, 0, 241, '配車が来ない。応答もない。', 'photorealistic dead taxi radio with no signal, dark dashboard, eerie, 8k'),
('バッテリー切れスマホ決済マン', 'water', 1140, 56, 0, 0, 242, '「スマホで払います」→電源が落ちる。', 'photorealistic man holding a dead smartphone with a black screen in a taxi, panicked, 8k'),
('大晦日のカウントダウン魔神', 'fire', 2200, 66, 1, 0, 304, '【ボス】0時の瞬間、渋谷の全道路を封鎖する。', 'photorealistic giant demon made of fireworks and countdown numbers over Shibuya at midnight, epic, cinematic, 8k'),
('元日の初詣大行列ボス', 'light', 2400, 70, 1, 0, 305, '【ボス】参道の人の波が巨大な竜になった。', 'photorealistic colossal dragon made of a crowd of people and lanterns at a shrine gate, New Year, epic, 8k'),
('繁忙期シフトの魔王', 'dark', 2600, 74, 1, 0, 306, '【ボス】12月のシフト表そのもの。休みのマスが存在しない。', 'photorealistic dark king on a throne made of calendars and shift schedules, red glow, epic fantasy, 8k');
