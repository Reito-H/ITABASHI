# 車番検索システム 詳細仕様書

作成日: 2026-06-11  
対象: 新人離職防止システム（Cloudflare Workers + D1）

---

## 1. 概要

タクシー会社の車両情報をLINEまたはWebの管理画面から検索するシステム。  
**無線番号**または**ナンバープレート末尾4桁**を入力することで、該当車両の情報を返す。

---

## 2. Excelシートのロジック解析

元データは `☆車両検索 2.xlsx` のSheet1。以下の列が主要データソース。

### 主要列マッピング

| 列 | 記号 | 内容 | 備考 |
|----|------|------|------|
| Z (26) | — | 無線番号 | 主キー的存在 |
| AA (27) | — | ナンバープレート文字列 | 例: `品川502あ1988` |
| AU (47) | — | ナンバープレート末尾数字 | AAから抽出されたサフィックス |
| AC (29) | — | 車種名 | |
| AE (31) | — | 燃料種別 | |
| AH (34) | — | グレード | |
| AI (35) | — | 会社名 | |
| **AK (37)** | — | **営業所** | ← 正しいデータソース |
| AN (40) | — | 定員 | |
| AP (42) | — | 荷物スペース | 表示しない |
| AW (49) | — | 営業所2（別データソース） | ← **使用禁止** |
| AX (50) | — | 無線番号（課マッピング用） | 課の検索キー |
| AY (51) | — | 課 | AXとセットで使用 |

### ナンバープレート末尾数字の抽出ロジック（Excelの数式）

```
AT列 = MID(AA列, [最初の数字位置], LEN(AA列))
       → "品川502あ1988" → "1988"（末尾の純数字部分）

AU列 = RIGHT(AT列, LEN(AT列) - 4)
       → 4桁プレフィックス（"502あ"相当）を除いた残り

※ 検証済: AU列とI列（独立した末尾数字列）は全4998行で一致
```

### 課（division）の特殊ロジック ★重要

**誤解しやすいポイント**: 課は同一行のAY列から取得するのではなく、**二次VLOOKUP**で取得する。

```
Excelの数式（概念）:
= VLOOKUP(Z列[当該行の無線番号], AX:AY列[全行], 2, FALSE)
                                  ^^^^^^^^^^^^^^^^^^^^
                            ← 全行のAX列を検索キーとして、AY列を返す
```

#### 具体例: 車両1988（無線番号1988）

| 行 | Z列（無線番号） | AX列 | AY列 |
|----|----------------|------|------|
| 行A | 1988 | 0001 | 1課 |
| 行B | 5678 | 1988 | **2課** |

→ 無線番号1988の「課」を求める場合:  
　 AX列全体から「1988」を探すと**行B**が見つかり → AY列の**「2課」**が正解  
　（行Aの同列AY「1課」は**不正解**）

---

## 3. データベース設計

### `vehicles` テーブル

```sql
CREATE TABLE vehicles (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  radio_no  INTEGER,          -- 無線番号（Z列）
  plate_no  TEXT,             -- ナンバープレート全文（AA列）
  plate_num TEXT,             -- ナンバープレート末尾数字（AU列）
  car_type  TEXT,             -- 車種名（AC列）
  fuel      TEXT,             -- 燃料（AE列）
  grade     TEXT,             -- グレード（AH列）
  company   TEXT,             -- 会社名（AI列）
  office    TEXT,             -- 営業所（AK列）★正しいデータソース
  capacity  INTEGER,          -- 定員（AN列）
  luggage   TEXT,             -- 荷物スペース（AP列）※表示しない
  office2   TEXT,             -- 営業所2（AW列）※使用禁止
  radio_no2 INTEGER,          -- AX列（課マッピング用）
  division  TEXT              -- 課（migration_010でUPDATE済）
);

CREATE INDEX idx_vehicles_radio ON vehicles(radio_no);
CREATE INDEX idx_vehicles_plate ON vehicles(plate_num);
```

### `vehicle_search_admins` テーブル

```sql
CREATE TABLE vehicle_search_admins (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  line_uid   TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
```

### `instructors` テーブル（既存テーブルへの追加）

```sql
ALTER TABLE instructors ADD COLUMN can_vehicle_search INTEGER NOT NULL DEFAULT 0;
```

---

## 4. マイグレーション一覧

| ファイル | 内容 |
|---------|------|
| `migration_009.sql` | `vehicles`テーブル・`vehicle_search_admins`テーブル作成 |
| `migration_009_vehicles_data.sql` | 4998件の車両データINSERT（200行×25バッチ） |
| `migration_010.sql` | 4998件の`division`（課）を正しい値にUPDATE |
| `migration_011.sql` | `instructors`テーブルに`can_vehicle_search`列追加 |

#### migration_009_vehicles_dataの分割理由

D1の制限（SQLITE_TOOBIG）により、4998行を1回のINSERTで実行するとエラーになる。  
→ 200行ごと25バッチに分割して実行。

---

## 5. 検索ロジック

### 検索SQL

```sql
SELECT *,
  CASE WHEN CAST(radio_no AS TEXT) = ? THEN 0 ELSE 1 END AS _sort
FROM vehicles
WHERE CAST(radio_no AS TEXT) = ? OR plate_num = ?
ORDER BY _sort
LIMIT 10
```

- 第1パラメータ: ソート用のクエリ文字列
- 第2パラメータ: 無線番号完全一致チェック
- 第3パラメータ: ナンバー末尾完全一致チェック

### 重要: 完全一致のみ（LIKE使用禁止）

`LIKE '%1988%'` のようなあいまい検索をすると、無線番号1988を持つ車のほかに  
無線番号5334, 2334 などの**別の車両が誤ヒット**する。  
→ Excelの動作（完全一致）に合わせ、`= ?` による完全一致のみ使用。

### 優先順位

| 順位 | 条件 | ラベル（LINE表示） |
|------|------|-------------------|
| 1位 | `CAST(radio_no AS TEXT) = クエリ` | `【無線番号一致】` |
| 2位 | `plate_num = クエリ` | `【ナンバー一致】` |

---

## 6. 検索権限管理

### 権限チェックの優先順位（LINE bot）

```
1. vehicle_search_admins テーブルに line_uid が存在するか
         ↓ なければ
2. instructors テーブルに line_uid が存在し、can_vehicle_search = 1 かつ is_active = 1 か
         ↓ どちらにも該当しなければ
3. 通常の社員・管理者チェックへ（車番検索は利用不可）
```

#### UNION クエリ実装

```typescript
const vehicleAdmin = await env.DB.prepare(`
  SELECT id, name FROM vehicle_search_admins WHERE line_uid = ?
  UNION
  SELECT id, name FROM instructors WHERE line_uid = ? AND can_vehicle_search = 1 AND is_active = 1
  LIMIT 1
`).bind(lineUid, lineUid).first<{ id: number; name: string }>();
```

### 権限の種類

| 種別 | テーブル | 設定方法 |
|------|----------|----------|
| 車番検索専用管理者 | `vehicle_search_admins` | Web管理画面 `/vehicle-admins` から追加 |
| 班長・指導者（検索許可済） | `instructors.can_vehicle_search = 1` | Web管理画面 `/settings/instructors` のトグルで有効化 |

**車番検索専用管理者**は新人管理システムの他機能（シフト、社員情報等）にはアクセスできない。

---

## 7. LINE Botの動作仕様

### トリガー条件

- 権限を持つユーザーが **4桁の数字**を送信する
- 正規表現: `/^\d{4}$/`

### レスポンス形式

```
🚗 車両情報（2件）

▍無線番号: 1988
 【無線番号一致】
 車両番号: 品川502あ1988
 車種: JPN TAXI
 営業所: 国際自動車（城北）板橋営業所
 課: 2課
 定員: 5名
```

### UIDs確認コマンド

未登録ユーザーが `uid` と送信すると、自分のLINE UIDを返す機能。  
管理者がユーザーを登録する際の補助機能。

---

## 8. Web管理画面

### 車両検索ページ（`/vehicles`）

- URL: `/vehicles`
- 認証: セッションログイン必須
- 機能: 無線番号またはナンバー末尾4桁で検索、結果を表形式で表示
- 表示列: 無線番号、車両番号、車種、営業所、課、定員

### 車番検索管理者ページ（`/vehicle-admins`）

- URL: `/vehicle-admins`
- 機能: 車番検索専用管理者（LINE UID）の一覧・追加・削除

### 班長・指導者設定ページ（`/settings/instructors`）への統合

既存の班長・指導者登録ページに「車番検索」列を追加。

| 状態 | 表示 |
|------|------|
| LINE未連携 | 「連携後に設定可」（グレー文字） |
| LINE連携済・検索有効 | 「✓ 有効」（緑ボタン）→ クリックで無効化 |
| LINE連携済・検索無効 | 「無効」（グレーボタン）→ クリックで有効化 |

---

## 9. 表示する項目・しない項目

| 項目 | 表示 | 理由 |
|------|------|------|
| 無線番号 | ✅ | 主要検索キー |
| 車両番号（ナンバープレート全文） | ✅ | |
| 車種 | ✅ | |
| 営業所（AK列） | ✅ | 正しいデータソース |
| 課 | ✅ | migration_010で正値に更新済 |
| 定員 | ✅ | |
| 荷物スペース | ❌ | ユーザー指示で除外 |
| 営業所2（AW列） | ❌ | 別データソースで不正確（2047/4998行のみ値あり） |

---

## 10. 既知の注意事項

### 営業所（AW vs AK）

- `AW`列（office2）は別システムからの参照データで、4998台中2047台のみ値あり
- `AK`列（office）が正しい営業所名 → **必ずAK列を使用**

### 課（division）の精度

- migration_010でAX→AYマッピングに基づきUPDATE
- 4998件中2045件が正しい課名、残り2953件はNULL
- NULLの場合は「—」と表示

### 板橋2課の確認例

無線番号1988:
- 正: 板橋営業所 / 2課（AXマッピング正解）
- 誤: 板橋営業所 / 1課（同行AY列の値）

---

## 11. ファイル構成

```
system/src/
├── db/
│   ├── migration_009.sql                  テーブル作成
│   ├── migration_009_vehicles_data.sql    車両データ投入（25バッチ）
│   ├── migration_010.sql                  課データ修正
│   └── migration_011.sql                  can_vehicle_search列追加
├── routes/
│   ├── admin.ts                           /settings/instructors（車番検索トグル追加）
│   ├── admin_extra.ts                     /vehicles、/vehicle-admins
│   └── api/
│       └── instructors.ts                 PUT /api/instructors/:id（can_vehicle_search対応）
├── line_bot.ts                            LINEボット（車番検索ハンドラ）
└── html/
    └── layout.ts                          ナビゲーション（車両検索・車両検索管理者）
```
