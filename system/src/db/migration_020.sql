-- migration_020: パフォーマンス改善インデックス追加
-- 社員一覧の主要クエリ: WHERE is_active=1 ORDER BY division, team, seq_no, id
CREATE INDEX IF NOT EXISTS idx_employees_list
  ON employees(is_active, division, team, seq_no, id);

-- 在籍状態フィルター: WHERE is_active=1 AND enrollment_status=?
CREATE INDEX IF NOT EXISTS idx_employees_enrollment
  ON employees(is_active, enrollment_status);

-- 退職日フィルター: WHERE is_active=1 AND retirement_date >= ? AND retirement_date <= ?
CREATE INDEX IF NOT EXISTS idx_employees_retirement
  ON employees(is_active, retirement_date);

-- フリガナ未登録検索: WHERE is_active=1 AND (name_kana IS NULL OR name_kana='')
CREATE INDEX IF NOT EXISTS idx_employees_name_kana
  ON employees(is_active, name_kana);
