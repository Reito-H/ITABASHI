# 弁天クラブ 新人離職防止システム

タクシー会社（弁天クラブ）の新人乗務員離職防止を目的としたWebシステム。

## ドキュメント

- [詳細仕様書](docs/SPECIFICATION.md) — システム設計・DB設計・UI仕様
- [対話ログ](docs/DIALOGUE_LOG.md) — 設計決定の経緯・質疑応答の記録

## システム構成

| コンポーネント | 技術 |
|--------------|------|
| ホスティング | Cloudflare Pages |
| API | Cloudflare Workers |
| DB | Cloudflare D1 |
| LINE連携 | LINE Messaging API + LIFF |
| ドメイン | bentenclub.com |

## 月度ルール

**17日締め・18日スタート**  
例: 「6月度」= 5月18日〜6月17日
