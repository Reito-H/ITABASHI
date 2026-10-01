-- migration_166: 個人別シフト表（1人1ページ形式PDF）の原本レイアウト再現用
--   個人別勤務予定表PDFは1ページを左右2カラムに分けて日付を並べているが、
--   左右何日ずつに分けるかは班一覧形式PDFの情報からは分からないため、
--   個人別PDF取込時にだけ検出できた「左カラムの日数」を乗務員ごとに保持する。
--   班一覧形式PDFの取込では常にNULLのまま（値を変更しない）。
ALTER TABLE crew_shift_members ADD COLUMN sheet_left_days INTEGER;
