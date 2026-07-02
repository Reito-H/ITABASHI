# 実装記録

**プロジェクト**: 弁天クラブ 新人離職防止システム

---

## 開発フェーズ計画

### Phase 1: 基盤構築（優先）
- [ ] Cloudflare Workers + D1 プロジェクト作成
- [ ] DBスキーマ（DDL）作成
- [ ] 管理者認証（ログイン/セッション）
- [ ] 社員マスタ CRUD

### Phase 2: シフト管理
- [ ] シフトグリッドUI（スプレッドシート風）
- [ ] 月度切替・日付範囲計算（17日締め18日スタート）
- [ ] セル入力（ドロップダウン選択 + 自由入力）
- [ ] 指導者スケジュール（下部セクション）
- [ ] 個人予定表・画像出力

### Phase 3: 新卒Info
- [ ] 新卒Info一覧・編集フォーム
- [ ] CSV出力機能

### Phase 4: LINE連携
- [ ] LINE公式アカウント（リフ）開設ガイド
- [ ] Webhookサーバー実装
- [ ] 招待コード発行・紐付けフロー
- [ ] 売上記録Bot
- [ ] 嫌なこと報告Bot
- [ ] シフト確認LIFF

### Phase 5: 分析・管理画面強化
- [ ] 売上推移グラフ（Chart.js）
- [ ] 嫌なこと報告一覧・面談メモ
- [ ] アンケート配信機能

---

## 実装ログ

### 2026-06-04

**ヒアリング・設計**
- ユーザーヒアリング実施（インフラ・機能・ルール確認）
- Excelファイル解析完了（`こぴー2023年度 新人研修日数 2026.06作成②.xlsx`）
- 仕様書 v0.1 作成
- 全仕様確定（17日締め18日スタート、1〜4課、5月度から移行）

**Phase 1 + Phase 2 実装完了**

| ファイル | 内容 |
|---------|------|
| `wrangler.toml` | Cloudflare Workers設定 |
| `package.json` | 依存関係（Hono, Wrangler） |
| `tsconfig.json` | TypeScript設定 |
| `src/db/schema.sql` | 全テーブルDDL |
| `src/db/setup_admin.sql` | 管理者・指導者初期データ |
| `src/auth.ts` | パスワードハッシュ（PBKDF2）、セッション、招待コード、月度計算 |
| `src/middleware/auth.ts` | 認証ミドルウェア、日本国内制限 |
| `src/html/layout.ts` | 共通レイアウト、ログイン画面HTML |
| `src/html/shift.ts` | シフトグリッドUI（Excelライク） |
| `src/index.ts` | メインルーター、LINE Webhook基盤 |
| `src/routes/admin.ts` | 管理者画面（ダッシュボード/シフト/新卒Info/登録） |
| `src/routes/api/shift.ts` | シフトAPI（保存・月度取得） |
| `src/routes/api/employees.ts` | 社員CRUD API |
| `src/routes/api/sales.ts` | 売上記録・CSV出力API |
| `src/routes/api/info.ts` | 新卒Info更新API |
| `src/routes/api/instructor.ts` | 指導者スケジュールAPI |
| `SETUP_GUIDE.md` | デプロイ手順書 |

**Phase 3〜5 追加実装（2026-06-04 第2回）**

| ファイル | 内容 |
|---------|------|
| `src/html/sales.ts` | 売上管理UI（Chart.jsグラフ・月度一覧・日別詳細） |
| `src/routes/admin_extra.ts` | 売上管理・嫌なこと報告・LINE管理の画面ルート |
| `src/routes/api/events.ts` | 管理者メモ保存・報告取得API |
| `src/routes/api/line_api.ts` | 招待コード発行・アンケート一斉配信API |
| `src/line_bot.ts` | LINE Botステートマシン（売上記録・嫌なこと報告・シフト確認フロー完全実装） |
| `src/db/schema.sql` | line_conv_states テーブル追加 |
| `scripts/import_excel.py` | Excelデータ移行Pythonスクリプト |
| `scripts/import_test.sql` | 移行SQLテスト出力（社員40名・シフト778件） |

**LINEボット実装済みフロー**
- 売上記録: 金額→乗車回数→距離→確認→保存（5ステップ）
- 嫌なこと報告: カテゴリ選択→経緯→感想→保存（4ステップ）
- シフト確認: 当月度の予定をテキストで返信
- 招待コード紐付け: コード送信→社員紐付け完了

**残課題**
- LINE公式アカウント「リフ」の実際の開設（ユーザー側作業）
- LINE Messaging API チャネル設定（wrangler.tomlに環境変数追加）
- リッチメニュー設定（LINE Official Account Manager上で実施）
- bentenclub.com へのデプロイ実施
