# 提案書: ベンテンクラブシフト機能の Benten管理システム統合

> 作成日: 2026-07-11
> 対象: 中止になった「Bentenシフト」(Next.js + Firebase) の機能を、既存の Benten管理システム (Cloudflare Workers + D1 + LINE LIFF) に統合する

---

## 1. 目的

- 旧Bentenシフトの「メンバーがスマホでシフト入力 → シフト表閲覧 → LINEグループへ毎日自動送信」という機能を、**新規アプリを立てずに既存システムの LIFF 基盤に載せる**
- Firebase / Next.js / Cloudflare Pages は使わない。既存の **Workers + D1 + LIFF アクセストークン認証** に完全に寄せる

## 2. 権限設計（新ロール2つの追加）

`line_liff_users.role` は TEXT カラムなので、**スキーマ変更なしで値を2つ追加**するだけでよい。

| role | 表示名 | ベンテンクラブ機能 |
|---|---|---|
| `general_manager` | 統括管理者 | **全会員のシフト編集可**（シフトマスター相当）＋設定管理 |
| `operations_manager` | 運行管理者 | **アクセス不可**（従来機能のみ） |
| `vehicle_manager` | 車番管理者 | アクセス不可 |
| `newcomer` | 新人 | アクセス不可 |
| `benten_shift_master` | **ベンテンクラブシフトマスター**（新設） | **全会員のシフト編集可**＋シフト表閲覧 |
| `benten_member` | **ベンテンクラブ会員**（新設） | **自分のシフトのみ編集可**＋シフト表閲覧 |

### 権限マトリクス

| 機能 | 会員 | シフトマスター | 統括管理者 | 運行管理者 |
|---|---|---|---|---|
| 自分のシフト入力 | ○ | ○ | ○ | × |
| 他人のシフト編集・削除 | × | ○ | ○ | × |
| シフト表閲覧・PDF | ○ | ○ | ○ | × |
| グループ・シフト種別・期間設定 | × | × | ○ | × |
| 既存機能（忘れ物・事故・車番等） | × | × | ○ | ○（従来通り） |

> **注意点（兼務）:** 現在は1人1ロールの設計。運行管理者は要件上ベンテン機能にアクセスさせないので問題ないが、将来「管理者かつ会員」のような兼務が必要になったら `line_liff_users` に `benten_role` カラムを別途追加する方式に拡張する。

### 登録フロー（既存パターンを踏襲）

- 「ベンテン会員登録」→ 名前入力 → パスワード (`LINE_REG_PWD_BENTEN`) → `benten_member` として登録
- 「シフトマスター登録」→ 名前入力 → パスワード (`LINE_REG_PWD_BENTEN_MASTER`) → `benten_shift_master` として登録
- 登録後、管理画面 `/settings/liff` から `benten_members` テーブルの会員レコードと紐付け（または登録時に名前一致で自動紐付け）

## 3. DB設計（D1 / migration_025）

旧Firestoreの構造をそのままD1テーブルに写す。既存の `employees` とは**独立させる**（ベンテンクラブは社員と別集団のため）。

```sql
benten_groups        -- id, name, color, display_order
benten_shift_types   -- id, code, label, color, text_color,
                     --   is_absent, triggers_ake, display_order
benten_members       -- id, line_uid(nullable), name, group_id,
                     --   is_indoor, auto_ake, display_order,
                     --   allowed_shift_type_codes(JSON), is_active
benten_shifts        -- member_id, date(yyyy-MM-dd), shift_type_id(null=明け),
                     --   is_ake, input_by_uid, updated_at
                     --   PRIMARY KEY(member_id, date)
benten_schedule_ranges -- id, label, start_date, end_date, created_at
```

- 会員とLINEの紐付けは `benten_members.line_uid` ↔ `line_liff_users.line_uid`
- LINE設定（旧 `config/line`）は wrangler.toml の環境変数に寄せる（`BENTEN_LINE_GROUP_ID` 等）。Messaging APIチャンネルは既存Botを共用

## 4. 機能の移植方針

### 4-1. シフト入力・シフト表（LIFF ページ）

- 新規LIFFアプリ **`/liff/benten-shift`** を1つ追加（LINE Developers Console に登録）
- タブ2つ: **①カレンダー入力**（日付タップ→スタンプ選択→カーソル翌日前進、明け自動設定）**②Excel風シフト表**（土曜青・日曜赤・内勤黄色、セルタップでインライン編集、ズーム）
- 認証は既存方式そのまま: `liff.getAccessToken()` → `Authorization: Bearer` → サーバーで `/v2/profile` 検証 → `line_liff_users` のロール確認
- 会員はシフト表から自分のセルのみ編集可、マスター・統括は全セル編集可

### 4-2. LINE Bot

- 「シフト」「シフト表」→ LIFF URL を返信（**ロールが会員・マスター・統括のときのみ**）
- リッチメニュー: 会員用に新パターン（PATTERN_BENTEN）を用意。統括管理者のPATTERN3にはボタン追加を検討（後回し可）

### 4-3. 毎日の自動送信（Cron）

既存 `cron.ts` に日次ジョブを追加:

1. 当日出勤者（`is_ake=0` かつ `shift_type.is_absent=0`）を列挙
2. シフト表PDFを生成
3. ベンテンクラブのLINEグループに「本日出勤」＋PDFリンクを送信

**PDFの生成先:** Firebase Storage の代わりに **R2** に保存し、Workers経由で配信（`/benten/pdf/{date}.pdf`）。pdf-lib は純JSなのでWorkersで動作するが、**Noto Sans JP フォント（数MB）はバンドルせず R2 に置いて実行時に読む**（Workersのサイズ制限対策）。

### 4-4. 管理機能（既存 /settings 配下に追加）

- `/settings/benten-members` — 会員CRUD・グループ配属・LINE連携状況・連携解除
- `/settings/benten-shift-types` — シフト種別CRUD（色・明けフラグ等）
- `/settings/benten-groups` / 表示期間設定 — 同ページ内にまとめてよい
- アクセス権: 既存管理画面と同じBasic認証（Web側）。LIFF側の設定変更は統括管理者のみ

## 5. APIエンドポイント（/api/liff/benten/*）

| メソッド | パス | 権限 | 説明 |
|---|---|---|---|
| GET | /api/liff/benten/me | 会員・マスター・統括 | 自分の会員情報・ロール取得 |
| GET | /api/liff/benten/shifts?from&to | 会員・マスター・統括 | 期間内の全員シフト＋マスタ取得 |
| PUT | /api/liff/benten/shifts/:memberId/:date | 本人 or マスター・統括 | シフト登録・更新（明け含む） |
| DELETE | /api/liff/benten/shifts/:memberId/:date | マスター・統括 | シフト削除 |
| GET | /api/liff/benten/pdf | 会員・マスター・統括 | シフト表PDF取得 |

サーバー側は全エンドポイントで「運行管理者・車番管理者・新人・unknown は 403」を徹底する（UIで隠すだけにしない）。

## 6. 実装フェーズ

| フェーズ | 内容 | 規模感 |
|---|---|---|
| **Phase 1** | migration_025（テーブル＋ロール追加）、Bot登録コマンド2種、権限チェック共通化 | 小 |
| **Phase 2** | LIFF `/liff/benten-shift`（カレンダー入力＋シフト表＋API一式） | **大（中核）** |
| **Phase 3** | PDF生成（R2＋pdf-lib）＋Cron日次送信 | 中 |
| **Phase 4** | 管理画面（会員・シフト種別・期間）、リッチメニュー対応 | 中 |

Phase 1+2 が完成すれば手動運用で使い始められる。Phase 3 以降は運用しながら追加できる。

## 7. 旧Bentenシフトから引き継ぐ仕様・捨てる仕様

**引き継ぐ:** シフト種別の色・明け自動設定（triggers_ake × auto_ake）・内勤フラグ・表示期間（最新レコード優先、デフォルト45日）・出勤者コメントの `is_absent` 除外ルール・PDFレイアウト（A4横）

**捨てる:** Firebase一式（Auth/Firestore/Storage）・Next.js・LINEログイン(OIDC)・オンボーディング画面（→ Bot登録コマンド＋管理画面紐付けで代替）・独立ドメイン bshift.bentenclub.com（→ 既存 bentenclub.com に統合）

## 8. 決めておきたいこと

1. **登録時の会員紐付け方法** — 名前の完全一致で自動紐付けか、管理画面で手動紐付けか（推奨: 自動を試みて失敗時は未紐付けで登録、管理画面で修正）
2. **ベンテン用LINEグループ** — 自動送信先グループのIDの取得方法（既存Webhookでグループ参加イベントから取得可能）
3. **シフトマスターの管理範囲** — シフト種別・期間設定まで触らせるか（本提案では統括のみとした）
