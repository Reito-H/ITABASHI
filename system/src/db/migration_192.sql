-- ===================================================
-- migration_192: バジル&ドラゴンズ（ホシコンパズル改め）
--   ・味方キャラを「写真（社員）」と「オリジナルキャラ（ガチャ入手）」の2種類に拡張（kind / rarity / in_gacha / description）
--   ・敵にボス・ラスボス・説明・報酬を追加し、タクシーあるあるの敵とボスを初期投入
--   ・育成: プレイヤーごとのキャラ所持・レベル・経験値（puzzle_player_chars）、プレイヤーのコイン
--   ・チート（admin専用 裏パネル）で遊んだ記録は cheated=1 にしてランキングから除外
--   画像（photo_r2_key）が無いキャラ・敵は、画像が登録されるまで仮の絵（SVG）で表示する。
-- ===================================================

-- 設定: タイトル初期値をゲーム名に（既に変えてある場合はそのまま）
UPDATE puzzle_settings SET title = 'バジル&ドラゴンズ' WHERE id = 1 AND title = 'ホシコンパズル';
ALTER TABLE puzzle_settings ADD COLUMN gacha_cost INTEGER NOT NULL DEFAULT 300;   -- 1回のコイン
ALTER TABLE puzzle_settings ADD COLUMN train_cost INTEGER NOT NULL DEFAULT 100;   -- 強化1回のコイン

-- 味方キャラの拡張
ALTER TABLE puzzle_allies ADD COLUMN kind TEXT NOT NULL DEFAULT 'photo';           -- photo=社員写真 / art=オリジナルキャラ
ALTER TABLE puzzle_allies ADD COLUMN rarity INTEGER NOT NULL DEFAULT 3;             -- ★1〜5
ALTER TABLE puzzle_allies ADD COLUMN in_gacha INTEGER NOT NULL DEFAULT 0;           -- 1=ガチャで出る（art のみ）
ALTER TABLE puzzle_allies ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE puzzle_allies ADD COLUMN art_prompt TEXT NOT NULL DEFAULT '';           -- 画像生成用の指示文（管理画面で表示）

-- 敵の拡張
ALTER TABLE puzzle_enemies ADD COLUMN is_boss INTEGER NOT NULL DEFAULT 0;           -- 1=ボス（演出が変わる）
ALTER TABLE puzzle_enemies ADD COLUMN is_final INTEGER NOT NULL DEFAULT 0;          -- 1=ラスボス（案内人バジルの真の姿）
ALTER TABLE puzzle_enemies ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE puzzle_enemies ADD COLUMN art_prompt TEXT NOT NULL DEFAULT '';

-- プレイヤーの拡張
ALTER TABLE puzzle_players ADD COLUMN coins INTEGER NOT NULL DEFAULT 500;           -- 初回500コイン（ガチャ1回ぶん）
ALTER TABLE puzzle_players ADD COLUMN is_cheater INTEGER NOT NULL DEFAULT 0;

-- 所持・育成（写真キャラは全員が最初から所持扱い。行があればそのレベル、無ければLv1）
CREATE TABLE IF NOT EXISTS puzzle_player_chars (
  player_id   INTEGER NOT NULL,
  ally_id     INTEGER NOT NULL,
  exp         INTEGER NOT NULL DEFAULT 0,
  obtained_at TEXT DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (player_id, ally_id)
);

ALTER TABLE puzzle_scores ADD COLUMN cheated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE puzzle_scores ADD COLUMN coins_earned INTEGER NOT NULL DEFAULT 0;

-- ===== オリジナルキャラ（ガチャ）初期投入 =====
-- (name, rarity, element, hp, atk, description, art_prompt)
INSERT INTO puzzle_allies (name, kind, rarity, in_gacha, element, hp, atk, sort_order, description, art_prompt) VALUES
('黄金の運転手 ゴルドハンドル', 'art', 5, 1, 'light', 260, 34, 101, '伝説の売上王。金のハンドルを握ると渋滞すら道を譲る。', 'photorealistic portrait of a legendary Japanese taxi driver in his 50s holding a golden steering wheel, golden light aura, cinematic lighting, detailed face, dramatic, 8k'),
('深夜の帝王 ナイトロード', 'art', 5, 1, 'dark', 240, 36, 102, '終電後の街を支配する男。深夜料金はすべて彼のもの。', 'photorealistic portrait of a mysterious Japanese taxi driver at midnight in neon-lit Tokyo street, purple and black atmosphere, cinematic, detailed, 8k'),
('炎の配車オペレーター ヒノ', 'art', 5, 1, 'fire', 230, 38, 103, '無線で火を吹く。配車速度は音速。', 'photorealistic portrait of a fierce Japanese female radio dispatcher with headset surrounded by flames, dramatic lighting, cinematic, 8k'),
('蒼海の送迎師 ミナト', 'art', 5, 1, 'water', 270, 32, 104, '港の送迎なら誰にも負けない。雨の日ほど強い。', 'photorealistic portrait of a calm Japanese chauffeur standing in the rain at a harbor at night, blue tones, water reflections, cinematic, 8k'),
('森の交通整理人 グリーンマン', 'art', 5, 1, 'wood', 280, 30, 105, '緑の制服の守り神。すべての信号を青に変える。', 'photorealistic portrait of a heroic traffic controller in green uniform with glowing green baton, forest light, cinematic, 8k'),
('空港定額の守護者', 'art', 4, 1, 'light', 190, 24, 111, '羽田も成田も定額で守る。ゴネ客を黙らせる。', 'photorealistic portrait of a dignified Japanese airport taxi driver in white gloves at airport terminal, golden hour light, 8k'),
('高速料金の精霊', 'art', 4, 1, 'water', 180, 26, 112, 'ETCカードの化身。料金所を光の速さで抜ける。', 'photorealistic fantasy spirit made of blue light hovering over a highway toll gate at night, long exposure, cinematic, 8k'),
('洗車の達人 アワモリ', 'art', 4, 1, 'water', 200, 22, 113, '泡立ちが命。車体のキズすら消すという。', 'photorealistic portrait of a smiling Japanese man covered in soap foam washing a taxi, water splashes, bright daylight, 8k'),
('点呼の番人', 'art', 4, 1, 'fire', 170, 28, 114, 'アルコールチェックを逃れた者はいない。', 'photorealistic portrait of a stern Japanese operations manager holding a breathalyzer in a taxi garage office, warm lamp light, 8k'),
('整備士ドラゴン', 'art', 4, 1, 'wood', 210, 24, 115, '工場の奥に住む竜。オイル交換は3分。', 'photorealistic dragon wearing a mechanic jumpsuit holding a wrench in a car repair garage, oil stains, detailed scales, cinematic, 8k'),
('無線の魔術師', 'art', 4, 1, 'dark', 175, 27, 116, '「了解」の一言で配車が決まる。', 'photorealistic portrait of an old Japanese radio operator in a dark control room with glowing dials and headphones, dramatic, 8k'),
('釣り銭の魔法使い', 'art', 4, 1, 'light', 185, 23, 117, '一万円札にも動じない。小銭は無限。', 'photorealistic portrait of a cheerful Japanese taxi driver holding coins that glow with golden light, magical sparkles, 8k'),
('新人ドライバー', 'art', 3, 1, 'fire', 120, 16, 121, '道は知らないがやる気はある。', 'photorealistic portrait of a nervous young Japanese taxi driver in a brand new uniform, morning light, 8k'),
('班長の犬', 'art', 3, 1, 'wood', 140, 13, 122, '営業所で一番えらい（と思っている）。', 'photorealistic shiba inu dog wearing a small taxi driver cap sitting in a taxi driver seat, cute, 8k'),
('営業所の猫', 'art', 3, 1, 'dark', 110, 17, 123, '昼寝しかしないが、なぜか売上が上がる。', 'photorealistic black cat sleeping on the hood of a taxi in a garage, soft light, 8k'),
('自販機の精', 'art', 3, 1, 'water', 150, 12, 124, '休憩所の守り神。当たりはめったに出ない。', 'photorealistic fantasy spirit emerging from a Japanese vending machine at night, blue glow, cinematic, 8k'),
('カーナビ君', 'art', 3, 1, 'light', 125, 15, 125, '「300m先、右方向です」を信じるな。', 'photorealistic robot shaped like a car navigation device with a friendly screen face, mounted on a taxi dashboard, 8k'),
('休憩所のおじさん', 'art', 3, 1, 'wood', 160, 11, 126, '話が長い。でもたまにいいことを言う。', 'photorealistic portrait of a relaxed elderly Japanese taxi driver drinking canned coffee at a rest area, warm afternoon light, 8k');

-- ===== 敵（タクシーあるある＋ボス）初期投入 =====
-- 既存の敵があればその後ろに並ぶ
INSERT INTO puzzle_enemies (name, element, hp, atk, is_boss, is_final, sort_order, description, art_prompt) VALUES
('ワンメーターババア', 'dark', 220, 20, 0, 0, 201, '駅前からワンメーター。釣り銭は1円単位で要求してくる。', 'photorealistic portrait of a grumpy elderly Japanese woman with a shopping bag at a taxi stand, scowling, dramatic lighting, 8k'),
('ミドリムシ', 'wood', 260, 24, 0, 0, 202, '駐禁取り締まりの緑の人。停めた瞬間に現れる。', 'photorealistic portrait of a Japanese parking enforcement officer in green uniform and cap writing a ticket, cold expression, cinematic, 8k'),
('道を言わない客', 'water', 280, 22, 0, 0, 203, '「いつもの所」しか言わない。', 'photorealistic portrait of a Japanese businessman in the back seat of a taxi looking at his phone and ignoring the driver, night, 8k'),
('酔っ払いサラリーマン', 'fire', 300, 26, 0, 0, 204, '終電を逃した。家の場所を覚えていない。', 'photorealistic portrait of a drunk Japanese salaryman with loosened tie asleep in a taxi back seat, neon night light, 8k'),
('乗り逃げマン', 'dark', 320, 30, 0, 0, 205, '「コンビニでお金おろしてくる」と言って消える。', 'photorealistic photo of a shady man running away from a taxi at a convenience store at night, motion blur, cinematic, 8k'),
('渋滞マン', 'wood', 360, 26, 0, 0, 206, '彼が乗ると首都高が止まる。', 'photorealistic giant humanoid made of traffic jam cars standing on the Tokyo expressway, cinematic, 8k'),
('ゲリラ豪雨', 'water', 380, 28, 0, 0, 207, '傘を持たない人を全員タクシーに向かわせる。', 'photorealistic dramatic storm cloud monster with a face pouring rain over Tokyo street, cinematic, 8k'),
('高速嫌いの客', 'light', 400, 30, 0, 0, 208, '「下道で行って」。到着まで2時間。', 'photorealistic portrait of a stubborn middle-aged Japanese man crossing his arms in a taxi back seat, 8k'),
('ETCカード忘れ', 'light', 420, 32, 0, 0, 209, '料金所の前で気づく絶望。', 'photorealistic photo of a panicked taxi driver searching his wallet at a highway toll gate, red lights, cinematic, 8k'),
('深夜のゲロ客', 'dark', 450, 34, 0, 0, 210, '乗った瞬間に不穏な顔色。', 'photorealistic portrait of a pale sick Japanese young man covering his mouth in a taxi back seat at night, 8k'),
('クレーマー課長', 'fire', 480, 36, 0, 0, 211, '「お宅の運転手がね」から始まる電話が30分。', 'photorealistic portrait of an angry Japanese middle manager shouting into a phone, office background, dramatic, 8k'),
('配車アプリの鬼キャンセル', 'water', 500, 36, 0, 0, 212, '到着1分前にキャンセル。', 'photorealistic smartphone monster with a glowing cancel button face floating over a taxi, cinematic, 8k'),
('空港定額ゴネ客', 'light', 540, 38, 0, 0, 213, '「定額って聞いてない」。聞いてる。', 'photorealistic portrait of a complaining tourist with suitcases arguing at an airport taxi stand, 8k'),
('赤信号ラッシュ', 'fire', 560, 40, 0, 0, 214, '全部赤。すべて赤。', 'photorealistic monster made of glowing red traffic lights towering over a city intersection at night, cinematic, 8k'),
('教習所の鬼教官', 'wood', 600, 42, 0, 0, 215, '「はい、今の減点」。', 'photorealistic portrait of a strict Japanese driving instructor with sunglasses holding a clipboard, dramatic, 8k'),
('年末繁忙期の悪魔', 'dark', 1200, 55, 1, 0, 301, '【ボス】12月、営業所に降臨する。休みは消える。', 'photorealistic demonic figure made of calendar pages and taxi receipts rising over a December night city, cinematic, 8k'),
('渋滞大魔王', 'wood', 1600, 60, 1, 0, 302, '【ボス】全ての道を一本道にする。', 'photorealistic giant dark king monster sitting on a throne of jammed cars on an expressway, cinematic, 8k'),
('伝説のタクシーセンター審査官', 'light', 2000, 65, 1, 0, 303, '【ボス】1ミリの違反も見逃さない。', 'photorealistic portrait of a legendary stern Japanese inspector in a white uniform with glowing eyes in a dark office, cinematic, 8k'),
('バジル【真の姿】', 'wood', 3000, 80, 1, 1, 999, '【ラスボス】案内役の妖精バジル。その正体は、すべての敵を操っていた黒幕だった。', 'photorealistic dark fairy queen made of basil leaves and green flames with glowing eyes, giant wings, epic fantasy boss, cinematic, 8k');
