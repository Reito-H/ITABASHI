# 新人離職防止システム 詳細仕様書

> **⚠️ この文書は初期設計時（2026-06-04）の歴史的資料です。**
> その後、班長シフト・点検管理・マニュアルBot・報告センター（忘れ物/事故/違反）・ベンテンクラブシフト・売上/ODO・アカウント別権限などが追加され、現在の実装とは一致しません。
> 最新の使い方は管理画面の **設定 → チュートリアル** を参照してください。

**プロジェクト名**: 弁天クラブ 新人離職防止システム（現: Benten管理システム）  
**ドメイン**: bentenclub.com  
**作成日**: 2026-06-04  
**バージョン**: 0.1（凍結・更新停止）

---

## 1. システム概要

### 背景・目的
タクシー会社（弁天クラブ）における新人乗務員の離職防止を目的としたWebシステム。  
現行のExcel管理（月次手打ち）から脱却し、情報伝達の正確性向上・管理者負担軽減・新人のエンゲージメント向上を図る。

### システム全体構成

```
bentenclub.com（Cloudflare管理）
│
├── /admin/*         管理者専用ダッシュボード
│   ├── シフト管理
│   ├── 新卒Info管理
│   ├── LINE連携管理
│   └── 売上・分析画面
│
└── LINE公式アカウント「リフ」
    ├── 売上記録
    ├── 嫌なこと報告
    ├── 簡易面談チャット
    ├── アンケート
    └── シフト確認
```

### 月度の定義
**17日締め・18日スタート**  
例: 「6月度」= 5月18日〜6月17日  
※全データ（シフト・売上）はこの月度基準で管理する。

---

## 2. インフラ構成

| 項目 | 採用技術 | 理由 |
|------|---------|------|
| ホスティング | Cloudflare Pages | 既存bentenclub.comと同一環境 |
| APIサーバー | Cloudflare Workers | サーバーレス、低コスト |
| データベース | Cloudflare D1 (SQLite) | Workers連携最適、無料枠十分 |
| 画像生成 | html2canvas / Canvas API | 個人シフト表の画像出力 |
| 認証 | Workers + JWTセッション | 管理者1アカウント |
| LINE連携 | LINE Messaging API + LIFF | リフ公式アカウント |

### セキュリティ設計

| 対策 | 実装方法 |
|------|---------|
| 検索エンジン非表示 | `robots.txt: Disallow: /` + `X-Robots-Tag: noindex` |
| 日本国内限定アクセス | Cloudflare WAF 地域制限（JP以外をブロック） |
| 管理者認証 | Username/Password + セッショントークン（HttpOnly Cookie） |
| HTTPS強制 | Cloudflare SSL/TLS（Always Use HTTPS） |
| CSRFトークン | 全POSTリクエストに実装 |
| SQLインジェクション対策 | Prepared Statements（D1のパラメータバインド） |
| レートリミット | Cloudflare Workers Rate Limiting |
| LINE Webhook検証 | LINE署名検証（x-line-signature） |

---

## 3. シフト管理システム

### 3.1 概要

現行Excelと同等の操作性でWebブラウザから入力・閲覧できるシステム。

#### 現行Excel構造（参考）
```
シート名: YYYY.MM月度（例: 2026.06月度）

行構成:
  Row1: タイトル
  Row2: 区分説明（①キャリア入社 etc）
  Row3: ヘッダー（NO/課/班/配属日/初乗務/ロッカー番号/社員番号/氏名/ｶﾅ氏名 + 日付列）
  Row4: 曜日行
  Row5〜: 社員データ（1人2行）
    奇数行: メインスケジュール（実研/公休/初乗務/所長/座学/実務 etc）
    偶数行: 詳細（指導者名/配属先/備考）

日付範囲: 前月中旬〜翌月初旬（月度をまたいで表示、約36日分）
社員区分: ①キャリア入社 / 新卒（入社年度別にグループ分け）
```

### 3.2 DB設計（シフト関連）

```sql
-- 社員マスタ
CREATE TABLE employees (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_no      TEXT NOT NULL UNIQUE,    -- 社員番号（例: 20263502）
  name        TEXT NOT NULL,           -- 氏名（例: 松井　亮斗）
  name_kana   TEXT,                    -- ｶﾅ氏名
  division    INTEGER,                 -- 課（1-4）
  team        INTEGER,                 -- 班
  locker_no   TEXT,                    -- ロッカー番号
  phone       TEXT,                    -- 電話番号
  entry_type  TEXT,                    -- 入社区分（新卒/キャリア/縁故）
  hire_date   TEXT,                    -- 配属日（YYYY-MM-DD）
  first_duty_date TEXT,                -- 初乗務日（YYYY-MM-DD）
  is_active   INTEGER DEFAULT 1,       -- 在籍フラグ
  created_at  TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at  TEXT DEFAULT (datetime('now', 'localtime'))
);

-- シフトエントリ（1行目：メインスケジュール）
CREATE TABLE shift_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id      INTEGER NOT NULL REFERENCES employees(id),
  date        TEXT NOT NULL,           -- YYYY-MM-DD
  entry_main  TEXT,                    -- 実研/公休/初乗務/所長/座学/実務/配属/休/？/未定/空白
  entry_sub   TEXT,                    -- 2行目の詳細（指導者名・配属先等）
  created_at  TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at  TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(emp_id, date)
);

-- 月度マスタ
CREATE TABLE monthly_periods (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  year        INTEGER NOT NULL,        -- 年度
  month       INTEGER NOT NULL,        -- 月度（1-12）
  start_date  TEXT NOT NULL,           -- 開始日（前月18日: YYYY-MM-DD）
  end_date    TEXT NOT NULL,           -- 終了日（当月17日: YYYY-MM-DD）
  UNIQUE(year, month)
);
```

### 3.3 スケジュール入力区分

| 表示値 | 意味 | 色 |
|-------|------|----|
| 実研 | 実地研修（指導者と同乗） | 青 |
| 公休 | 公休日 | グレー |
| 初乗務 | 初回単独乗務 | 金・強調 |
| 所長 | 所長同乗 | 紫 |
| 座学 | 教室研修 | 緑 |
| 実務 | 実務作業 | 水色 |
| 配属 | 配属日 | オレンジ |
| 休 | 休み | 薄グレー |
| ？ | 未確定 | 黄 |
| 未定 | 未定 | 黄 |
| （空白） | 未入力 | 白 |
| （自由入力） | 指導者名・備考 | 白 |

### 3.4 UI仕様

```
【シフト管理画面】

[月度選択: ◀ 2026年6月度 ▶]  [印刷] [CSV出力]

        ┌──┬─┬─┬────┬────┬──┬────┬────────┬─────────┬5/15┬5/16┬...┬6/17┐
        │NO│課│班│配属日│初乗務│ﾛｯｶｰ│社員番号│氏名      │ｶﾅ氏名    │金  │土  │...│水  │
        ├──┼─┼─┼────┼────┼──┼────┼────────┼─────────┼────┼────┼...┼────┤
  1行目 │7 │4│  │    │新卒│   │20263502│松井　亮斗│ﾏﾂｲ ﾘｮｳﾄ │公休│実研│...│    │
  2行目 │  │ │  │    │    │   │        │          │         │公休│大海│...│    │
        └──┴─┴─┴────┴────┴──┴────┴────────┴─────────┴────┴────┴...┴────┘

セルクリック→ドロップダウンから入力区分を選択
Ctrl+クリック→自由入力モード（指導者名等）
```

### 3.5 個人予定表（画像出力）機能

- 社員名をクリック → その月度の個人予定表をプレビュー
- 「画像保存」ボタン → PNG形式でダウンロード
- 形式: A4横向きに近いレイアウト
  - 社員名・社員番号・月度を表示
  - 日付・曜日・スケジュール（1行目のみ）を横一列で表示

---

## 4. 新卒Infoシステム

### 4.1 管理項目

| フィールド | 型 | 備考 |
|-----------|----|----|
| 課 | 数値（1-4） | |
| 班 | 数値 | |
| 社員番号 | テキスト | |
| 氏名 | テキスト | |
| 電話番号 | テキスト | |
| 趣味 | テキスト（自由） | |
| 好きな食べ物 | テキスト（自由） | |
| お酒 | 選択肢 + テキスト | 飲む/飲まない/機会があれば + コメント |
| 運転技術レポート | 選択肢（A/B/C/D/E） + テキスト | A=優秀、E=要注意 |
| メンタル面 | 選択肢（安定/注意/要フォロー/危険） + テキスト | |
| その他 | テキスト（自由） | |
| 更新日時 | 自動 | |

### 4.2 DB設計

```sql
CREATE TABLE new_employee_info (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id          INTEGER NOT NULL REFERENCES employees(id),
  hobbies         TEXT,
  favorite_food   TEXT,
  alcohol         TEXT,                -- 飲む/飲まない/機会があれば
  alcohol_note    TEXT,
  driving_skill   TEXT,                -- A/B/C/D/E
  driving_note    TEXT,
  mental_status   TEXT,                -- 安定/注意/要フォロー/危険
  mental_note     TEXT,
  other_notes     TEXT,
  updated_at      TEXT DEFAULT (datetime('now', 'localtime'))
);
```

### 4.3 CSV出力形式

```
課,班,社員番号,氏名,電話番号,趣味,好きな食べ物,お酒,お酒備考,運転技術,運転技術備考,メンタル,メンタル備考,その他,更新日時
```

---

## 5. LINE リフ 連携システム

### 5.1 社員紐付け（招待コード方式）

```
フロー:
管理者が招待コード発行（6桁英数字）
  ↓
コードを新人に手渡し or 口頭伝達
  ↓
新人がリフにコードを送信
  ↓
システムがコードを検証 → LINE IDと社員レコードを紐付け
  ↓
機能が利用可能になる
```

```sql
CREATE TABLE invite_codes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,    -- 6桁英数字
  emp_id      INTEGER REFERENCES employees(id),  -- 対象社員
  is_used     INTEGER DEFAULT 0,
  used_at     TEXT,
  expires_at  TEXT NOT NULL,           -- 有効期限（発行から7日）
  created_at  TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE line_users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  line_uid    TEXT NOT NULL UNIQUE,    -- LINE User ID
  emp_id      INTEGER REFERENCES employees(id),
  linked_at   TEXT DEFAULT (datetime('now', 'localtime'))
);
```

### 5.2 ① 売上記録システム

- **入力**: リフのリッチメニューから「売上記録」→ 金額・乗車回数・走行距離を入力
- **月度**: 17日締め18日スタートに準拠
- **入力フロー（LINE）**:
  1. 「売上記録」タップ
  2. 「本日の売上を入力してください」→ 金額（円）
  3. 「乗車回数は？」→ 回数（整数）
  4. 「走行距離は？」→ km（整数）
  5. 確認メッセージ → 保存完了
- **管理者ページ**:
  - 社員別・日別売上一覧
  - 月度別売上推移グラフ（折れ線・金額/回数/距離 切替）
  - CSV出力（社員×日付のマトリクス形式）

```sql
CREATE TABLE sales_records (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id       INTEGER NOT NULL REFERENCES employees(id),
  date         TEXT NOT NULL,           -- YYYY-MM-DD
  amount       INTEGER NOT NULL,        -- 売上金額（円）
  ride_count   INTEGER,                 -- 乗車回数
  distance_km  INTEGER,                 -- 走行距離（km）
  period_year  INTEGER,                 -- 月度年
  period_month INTEGER,                 -- 月度月（17日締め基準）
  created_at   TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(emp_id, date)
);
```

### 5.3 ② 嫌なこと報告フォーム

- リッチメニューから「嫌なこと報告」
- 入力項目:
  - カテゴリ（クレーマー/交通トラブル/社内の出来事/その他）
  - 経緯（自由テキスト、最大1000文字）
  - 気持ち・感想（自由テキスト、最大500文字）
- 管理者は一覧閲覧・面談メモ追加・CSV出力可能

```sql
CREATE TABLE bad_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id      INTEGER NOT NULL REFERENCES employees(id),
  category    TEXT NOT NULL,
  content     TEXT NOT NULL,
  feeling     TEXT,
  admin_memo  TEXT,
  created_at  TEXT DEFAULT (datetime('now', 'localtime'))
);
```

### 5.4 ③ 簡易面談チャット

- リフのチャット欄で管理者と直接メッセージのやり取り
- LINE公式アカウントの「チャット機能」を活用
- 管理者はLINE Official Account Managerから返信
- **簡易面談**: テキストチャット
- **対談面談**: ビデオ通話（LINEのビデオ通話機能）

### 5.5 ④ アンケート機能

- 管理者がGoogle Forms URLをリフから一斉配信
- 対象者選択（全員 / 特定月度入社者 / 個別）
- 配信ログ管理（誰に送ったか・日時）

### 5.6 ⑤ シフト確認機能

- リッチメニューから「シフト確認」
- 当月度のその社員のシフト一覧を表示（LIFF画面）
- 表示項目: 日付・曜日・スケジュール（1行目のみ）

---

## 6. 管理者システム

### 6.1 ログイン

- URL: `bentenclub.com/admin/login`（非公開URL）
- 認証: ユーザー名 + パスワード
- セッション: HttpOnly Cookie（24時間有効）
- ブルートフォース対策: 5回失敗で15分ロック

### 6.2 管理者専用メニュー構成

```
ダッシュボード（トップ）
├── シフト管理
│   ├── 月度一覧・切替
│   ├── グリッド入力
│   └── 個人予定表出力
├── 新卒Info
│   ├── 社員一覧・検索
│   ├── 詳細編集
│   └── CSV出力
├── 新人登録
│   ├── 社員情報入力
│   └── 招待コード発行
├── LINE管理
│   ├── 紐付け状況一覧
│   ├── アンケート配信
│   └── 招待コード管理
├── 売上管理
│   ├── 月度別一覧
│   ├── グラフ・分析
│   └── CSV出力
└── 嫌なこと報告
    ├── 一覧（新着順）
    ├── 詳細・メモ追加
    └── CSV出力
```

---

## 7. 技術実装方針

### フロントエンド

- **フレームワーク**: Vanilla JS（シフトグリッド）+ Alpine.js（軽量リアクティブ）
- **スタイル**: Tailwind CSS（CDN）
- **グリッド**: カスタム実装（CSS Grid + JS）
- **画像出力**: html2canvas ライブラリ
- **グラフ**: Chart.js

### バックエンド（Cloudflare Workers）

```
workers/
├── src/
│   ├── index.ts          -- ルーター
│   ├── auth.ts           -- 認証ミドルウェア
│   ├── shift.ts          -- シフトAPI
│   ├── employee.ts       -- 社員API
│   ├── sales.ts          -- 売上API
│   ├── line.ts           -- LINE Webhook
│   └── db/
│       ├── schema.sql    -- DDL
│       └── seed.sql      -- 初期データ
```

### LINE連携

- **Webhook**: `bentenclub.com/api/line/webhook`
- **LIFF URL**: シフト確認画面
- **リッチメニュー**: 売上記録 / 嫌なこと報告 / シフト確認 / その他

---

## 8. 確定事項・未確定事項

### 確定済み

| # | 項目 | 決定内容 |
|---|------|---------|
| 1 | インフラ | Cloudflare Workers + D1 |
| 2 | 管理者デバイス | PC / スマホ / タブレット（レスポンシブ対応必須） |
| 3 | LINE状況 | 新規開設（これから作成） |
| 4 | 売上記録項目 | 金額（円）+ 乗車回数 + 走行距離（km） |
| 5 | 指導者スケジュール | システムに含める |
| 6 | 月度ルール | 17日締め・18日スタート |
| 7 | LINE紐付け | 招待コード方式（6桁、有効期限7日） |
| 8 | 運転技術/メンタル | 選択肢 + テキスト形式 |
| 9 | データ移行 | 一部のみ移行（詳細調整中） |
| 10 | 管理者URL | bentenclub.com/admin |
| 11 | 社員区分管理 | 新卒・キャリア・縁故を同一画面で管理（色やラベルで区分表示） |
| 12 | 売上入力時間 | 当日中ならいつでも入力可能（翌日以降は管理者のみ修正可） |

### 未確定事項（要確認）

| # | 項目 | 状態 |
|---|------|------|
| 1 | bentenclub.com の現在のCloudflare構成詳細 | ❓ 要確認 |
| 2 | 課の正式な数（1〜4課？それ以上？）| ❓ 要確認 |
| 3 | 新卒とキャリア入社でシステム上の扱いを変えるか | ❓ 要確認 |
| 4 | 管理者画面のURLパス（/admin か subdomain か）| ❓ 要確認 |
| 5 | データ移行する月度の範囲 | ❓ 要確認 |
| 6 | LINE Messaging APIの利用プラン（メッセージ数の上限確認）| ❓ 要確認 |
