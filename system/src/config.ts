// 管理画面の秘密パス（変更したい場合はここだけ変える）
export const SECRET = 's7db8q6wys';
export const ADMIN_PATH = `/${SECRET}/admin`;

// アプリバージョン表示（右上ベル横のバッジ）。大きめの変更をデプロイするたびに手動で更新する。
// 更新ルールは docs/SPECIFICATION.md 6.3 を参照
export const APP_VERSION = '0.0.43';

// 希望休フォーム（ログイン不要の公開ページ）の秘密パス。推測されないよう複雑な文字列にする
export const KANCHO_WISH_PATH = '/kw-dea54792603559b9bb0e74ebb70188b4';

// 事故モニター表示（ログイン不要・専用パスワードで保護する公開ページ）の秘密パス
export const MONITOR_ACCIDENTS_PATH = '/mon-61b500053713bf4c69b959d7567202b4';

// イベント参加申し込みフォーム（ログイン不要・完全公開の掲示板ページ）の秘密パス。推測されないよう複雑な文字列にする
// イベント（開催回）ごとに個別発行はせず、ポスターのQR/URLは全て同じこの1つを指す（開いた先の掲示板で開催中のイベント一覧から選ぶ）
export const STUDY_SESSION_PATH = '/study-45b471c74a7d9e9b5c99540302df04f0';

// 調整機能（調整さん風の日程調整・ログイン不要の回答ページ）の秘密パス接頭辞。
// 共有URLは `${CHOSEI_PATH}/<調整ごとの32桁トークン>` の形で、調整1件につき1本だけ発行する。
export const CHOSEI_PATH = '/cs-4e9b1d7a6c0f42e8b3a95172d84c0f6e';

// ヒヤリハット収集フォーム（ログイン不要・完全公開）の秘密パス。
// 全ポスター/QRがこの1本を指す。開いた先で社員番号を入れて1件ずつ投稿する。
export const HIYARI_PATH = '/hh-2738ceac08eac11269d76dc733598ba6';

// 統合デジタルサイネージ（ログイン不要・完全公開の投影ページ）の秘密パス。
// Fire TV 等の常時表示端末にはこのURL 1本だけを設定する。ログイン不要なのでセッション切れで止まらない。
// 再生する中身は signage_decks.is_monitor=1 を付けたデッキ（/signage 一覧画面で切替）。
// 印を別デッキへ付け替えても、このURL自体は今後変更しない。URLの推測困難さ自体をアクセス制御とする。
export const SIGNAGE_PUBLIC_PATH = '/sg-d8b62011db0a09c2c279a620202d9d45';

// 羽田空港 到着便一覧（ログイン不要・完全公開ページ）の秘密パス。
// タクシー乗務員が付け待ち中にタブレット等で開いてブックマークする想定。国内線・国際線の到着状況を一覧表示する。
export const HANEDA_ARRIVALS_PATH = '/hn-55ab0e5aa8fb480119a216d3bc702650';

// 異常気象警報 周知サイネージ（ログイン不要・完全公開の投影ページ）の秘密パス。
// 通常の交通安全サイネージ（SIGNAGE_PUBLIC_PATH）とは別画面。異常気象警報が出ている間だけ、
// モニターの表示先をこのURLへ手動で切り替える運用。どの日に表示するかは管理画面のカレンダーで事前指定する。
export const WEATHER_NOTICE_PUBLIC_PATH = '/wn-3f6a8d15c9247ee0a25de2fb4c02a19b';
