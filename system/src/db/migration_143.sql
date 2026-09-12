-- ===================================================
-- migration_143: 板橋イベント — 「当日のご案内」チラシ（自由配置エディタ）
--   ・「イベント 参加申し込み」タブの各イベントに、当日配布/掲示用の「ご案内」チラシを
--     パワポ風に部品を自由配置して作れるエディタを追加する。
--   ・配置データ（layout_json）はイベントごとに1つ保存（study_session_guide_layouts）。
--   ・「テンプレートとして保存」で名前を付けて使い回せる（study_session_guide_templates）。
--   ・宛先ブロックは、印刷時に「参加者を選ぶ」と選んだ人数分「◯課◯班 氏名 様」へ置換して連続印刷。
--   ・画像はエディタ側で縮小してから data URL として layout_json に埋め込む（別テーブル/R2は使わない）。
--   ・権限は既存の study-sessions 系（/api/study-sessions・/settings/study-sessions）にそのまま乗る。
-- ===================================================

-- イベントごとの保存済みレイアウト（1イベント1レコード）
CREATE TABLE IF NOT EXISTS study_session_guide_layouts (
  session_id   INTEGER PRIMARY KEY REFERENCES study_sessions(id),
  paper        TEXT    NOT NULL DEFAULT 'a4p',   -- a4p / a4l / a3p
  layout_json  TEXT    NOT NULL DEFAULT '{}',    -- { paper, elements: [...] }
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 名前付きテンプレート（他イベントへ使い回す雛形）
CREATE TABLE IF NOT EXISTS study_session_guide_templates (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  paper        TEXT    NOT NULL DEFAULT 'a4p',
  layout_json  TEXT    NOT NULL DEFAULT '{}',
  created_by   TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
