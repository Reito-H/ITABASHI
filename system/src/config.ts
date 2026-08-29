// 管理画面の秘密パス（変更したい場合はここだけ変える）
export const SECRET = 's7db8q6wys';
export const ADMIN_PATH = `/${SECRET}/admin`;

// アプリバージョン表示（右上ベル横のバッジ）。大きめの変更をデプロイするたびに手動で更新する。
// 更新ルールは docs/SPECIFICATION.md 6.3 を参照
export const APP_VERSION = '0.0.11';

// 希望休フォーム（ログイン不要の公開ページ）の秘密パス。推測されないよう複雑な文字列にする
export const KANCHO_WISH_PATH = '/kw-dea54792603559b9bb0e74ebb70188b4';

// 事故モニター表示（ログイン不要・専用パスワードで保護する公開ページ）の秘密パス
export const MONITOR_ACCIDENTS_PATH = '/mon-61b500053713bf4c69b959d7567202b4';

// 新人紹介モニター表示（ログイン不要・完全公開の公開ページ）の秘密パス
// 事故モニターと別の物理サイネージに映す用途のため別URLにしている。表示モード設定に関係なく常に新人紹介のみを表示する
export const MONITOR_NEWCOMERS_PATH = '/mon-nc-0b7d8c366e91a5f42c974c7810219585';

// 勉強会募集フォーム（ログイン不要・完全公開の掲示板ページ）の秘密パス。推測されないよう複雑な文字列にする
// 勉強会（開催回）ごとに個別発行はせず、ポスターのQR/URLは全て同じこの1つを指す（開いた先の掲示板で開催中の勉強会一覧から選ぶ）
export const STUDY_SESSION_PATH = '/study-45b471c74a7d9e9b5c99540302df04f0';
