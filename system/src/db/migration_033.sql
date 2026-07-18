-- ===================================================
-- migration_033: 班長シフト 記号色をExcelと同じ配色に修正
--   Excelでは班色(直・遅・早・空白)と赤(採・夏・M)以外のセルは白。
--   独自に付けていたパステル色を廃止して同じ見た目にする。
-- ===================================================

UPDATE kancho_shift_types SET color = '#ffffff' WHERE code IN ('公', '非', '明', '指公', '○', '直', '遅', '早');
UPDATE kancho_shift_types SET color = '#ff0000' WHERE code IN ('採', '夏', 'M');
