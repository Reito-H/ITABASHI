-- ===================================================
-- migration_091: 引き継ぎシート専用「メーター検査」フローティング表
--   点検管理ページの meter_inspections（vehicle_teams連動・全社共通の正式な検査台帳）とは
--   完全に独立した、引き継ぎシート上だけの簡易メモ台帳。行の追加・削除も自由に行える。
-- ===================================================

CREATE TABLE handover_meter_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  division INTEGER NOT NULL CHECK(division BETWEEN 1 AND 4),
  team INTEGER NOT NULL CHECK(team BETWEEN 1 AND 8),
  car_no TEXT NOT NULL DEFAULT '',
  tentative_assignee_name TEXT,
  inspection_date TEXT,
  tentative_limit TEXT,
  honkensa_assignee_name TEXT,
  honkensa_limit TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX idx_handover_meter_entries_team ON handover_meter_entries(team, sort_order);
