# ベンテンクラブ シフト機能 セットアップ手順

> 実装完了: 2026-07-11（提案書: PROPOSAL_BENTEN_SHIFT.md）
> ローカルで動作確認済み（LIFFページ表示・API権限制御・PDF生成・トークン検証）

## 実装内容の概要

| 区分 | 内容 |
|---|---|
| 新ロール | `benten_member`（会員・自分のシフトのみ）/ `benten_shift_master`（全会員編集可）。統括管理者も全編集可。**運行管理者はアクセス不可** |
| DB | `migration_025.sql`（benten_groups / shift_types / members / shifts / schedule_ranges / config + 通知設定行） |
| LIFF | `/liff/benten-shift`（カレンダー入力＋Excel風シフト表・ズーム・インライン編集） |
| Bot | 「ベンテン会員登録」「シフトマスター登録」＋パスワード登録。「シフト」でLIFF起動。グループ内「ベンテングループ登録」で送信先連携 |
| PDF | `/liff/benten-pdf?from&to&t=`（HMACトークン付き公開URL）。pdf-lib＋日本語TTF全埋め込み |
| Cron | `benten_shift_daily`（毎日 本日出勤者＋シフト表リンクをLINEグループへ。初期は無効） |
| 管理画面 | 設定 →「ベンテンクラブ シフト」（会員・グループ・種別・期間・通知・テスト送信） |

## デプロイ手順

### 1. マイグレーション適用（本番D1）

```bash
cd system
npx wrangler d1 execute staff-db --remote --file=src/db/migration_025.sql
```

### 2. 登録パスワードの設定

```bash
npx wrangler secret put LINE_REG_PWD_BENTEN         # ベンテンクラブ会員 用
npx wrangler secret put LINE_REG_PWD_BENTEN_MASTER  # シフトマスター 用
```

### 3. LIFFアプリの作成（LINE Developers Console）

1. 既存の **LINE Loginチャンネル**（忘れ物・事故と同じもの）に LIFFアプリを追加
2. Endpoint URL: `https://bentenclub.com/liff/benten-shift`
3. Size: Full / Scope: `profile`
4. 発行された LIFF ID を `wrangler.toml` の `LIFF_ID_BENTEN_SHIFT` に設定

### 4. デプロイ

```bash
npm run deploy
```

### 5. LINEグループ連携

1. ベンテンクラブのLINEグループにBotを招待
2. シフトマスターまたは統括管理者がグループ内で「**ベンテングループ登録**」と送信
3. 管理画面 設定 →「ベンテンクラブ シフト」で「連携済み」になっていることを確認

### 6. 日次自動送信の有効化

管理画面 設定 →「ベンテンクラブ シフト」→ LINE自動送信 で時刻を設定し「有効」にチェック → 保存。
「今すぐテスト送信」で動作確認できる。
※ cronは毎時0分実行のため、**分は0** にすること。

## 運用フロー

1. 管理画面でグループ・会員を登録（シフト種別 H/D/B/休/有 はデフォルト投入済み）
2. 会員がLINEで「ベンテン会員登録」→ 名前 → パスワード → 登録
   - **シフト表と同じ名前**で登録すると既存会員に自動紐付けされる（同名の未連携会員がいない場合は新規会員が作られる）
   - 紐付けの修正は管理画面から（LINE連携の解除→登録し直し）
3. 会員は「シフト」と送信 → LIFFでシフト入力・シフト表閲覧
4. 表示期間は管理画面で「8月度予定」等を追加（最新の1件が適用。未設定時は今日から45日間）

## PDFフォントについて

- `BENTEN_FONT_URL`（wrangler.toml）に動作確認済みの日本語TTF（Noto Sans CJK JP）を設定済み。**そのままで動く**
- ⚠️ フォントを変える場合は **TTF形式のみ**。OTF・可変フォント（`NotoSansJP[wght].ttf`）は pdf-lib のサブセット/グリフ問題で文字が欠ける（検証済み）
- 外部URLに依存したくない場合はR2に移行:
  ```bash
  npx wrangler r2 bucket create benten-fonts
  npx wrangler r2 object put benten-fonts/NotoSansJP-Regular.ttf --file=<TTFファイル> --remote
  # wrangler.toml の [[r2_buckets]] コメントを解除して再デプロイ（R2がURLより優先される）
  ```
- フォント未設定でもシフト機能自体は動く（PDFボタンとPDFリンクだけ無効になる）

## 権限マトリクス（実装済み・サーバー側で強制）

| 機能 | 会員 | シフトマスター | 統括管理者 | 運行管理者 |
|---|---|---|---|---|
| 自分のシフト入力・削除 | ○ | ○ | ○ | × |
| 他人のシフト編集・削除 | × | ○ | ○ | × |
| シフト表閲覧・PDF | ○ | ○ | ○ | × |
| 入力可能種別の制限 | 受ける | 受けない | 受けない | — |
| グループ登録コマンド | × | ○ | ○ | × |

## 残タスク（任意）

- [ ] ベンテン会員用リッチメニューの作成（`RICHMENU_ID_BENTEN` は現在空=メニューなし。テキスト「シフト」で起動可能）
- [ ] 統括管理者のリッチメニュー（PATTERN3）へのベンテンシフトボタン追加（現在は「ベンテンシフト」or「ベンテン」テキストで起動）
