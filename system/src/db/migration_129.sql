-- ===================================================
-- migration_129: アンケート機能（板橋ページ）
--
--   設定「板橋」→「アンケート」タブで、管理者がアンケートを細かく組み立てる。
--   設問タイプ: 単一選択(radio) / 複数選択(checkbox) / 短文(text) / 長文(textarea)
--               / 段階評価(scale) / はい・いいえ(yesno) / 数値(number) / 日付(date)
--   各設問に「必須/任意」「補足説明」を共通で持てる。
--   乗務員は既存の「イベント参加申し込み」公開ページ（STUDY_SESSION_PATH）の
--   メニューから「アンケート」を開き、社員番号を入れて回答する。回答は何回でも可
--   （重複制限なし・氏名は保存しない・社員番号照合で課/班だけ控える）。
--
--   公開ページ : {STUDY_SESSION_PATH}（既存ページにメニュー追加）
--   公開API    : /api/public/surveys*                （認証なし・社員番号照合のみ）
--   管理API    : /{SECRET}/admin/api/surveys*         （権限: settings.study-sessions）
--
--   study_sessions / office_opinions / hiyari_reports 等とはテーブルを共有しない完全新規。
--   （旧「お知らせ配信」の survey_logs＝外部URL配信ログとも無関係）
-- ===================================================

CREATE TABLE IF NOT EXISTS surveys (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id   INTEGER NOT NULL DEFAULT 1,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_closed   INTEGER NOT NULL DEFAULT 0,          -- 1 = 受付終了（一覧に出さない）
  created_by  TEXT NOT NULL DEFAULT '',            -- 作成した管理アカウント名
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_surveys_office ON surveys(office_id, is_closed, created_at);

CREATE TABLE IF NOT EXISTS survey_questions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id     INTEGER NOT NULL REFERENCES surveys(id),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  qtype         TEXT NOT NULL,                     -- radio|checkbox|text|textarea|scale|yesno|number|date
  label         TEXT NOT NULL,
  help          TEXT NOT NULL DEFAULT '',
  required      INTEGER NOT NULL DEFAULT 0,
  settings_json TEXT NOT NULL DEFAULT '{}'         -- 型ごとの追加設定（選択肢・段階の上限下限・単位 等）
);
CREATE INDEX IF NOT EXISTS idx_survey_questions_survey ON survey_questions(survey_id, sort_order);

CREATE TABLE IF NOT EXISTS survey_responses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id  INTEGER NOT NULL REFERENCES surveys(id),
  emp_no     TEXT NOT NULL DEFAULT '',
  division   INTEGER,
  team       INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey ON survey_responses(survey_id, created_at);

CREATE TABLE IF NOT EXISTS survey_answers (
  response_id INTEGER NOT NULL REFERENCES survey_responses(id),
  question_id INTEGER NOT NULL REFERENCES survey_questions(id),
  value_text  TEXT NOT NULL DEFAULT '',            -- checkbox は JSON 配列文字列、その他は素の値
  PRIMARY KEY (response_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_survey_answers_q ON survey_answers(question_id);
