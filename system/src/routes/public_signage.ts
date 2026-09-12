// 統合デジタルサイネージ（ログイン不要・完全公開・パスワードなしで直接表示）
// ページ: {SIGNAGE_PUBLIC_PATH}
// 管理画面ログイン（24時間でセッション切れ）だとモニターに映しっぱなしにする用途で翌日に
// 再ログインが必要になり運用が崩れるため、通常のadmin認証を一切通さない別ルートにしている。
// URLの推測困難なランダム文字列自体をアクセス制御として扱う（public_accidents_monitor.ts と同じ設計）。
//
// 再生するデッキ = signage_decks.is_monitor = 1（無ければ並び順が先頭のデッキ）。
// 'accidents' スライドがあるときだけ、その実データ（今月の事故件数）を取得して差し込む。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { SIGNAGE_PUBLIC_PATH } from '../config';
import {
  signagePublicPage,
  type SignageDeck, type SignageSlide, type SignageLiveCtx,
} from '../html/signage';
import { fetchPublicAccidentBoard } from './public_accidents_monitor';

const app = new Hono<{ Bindings: Env }>();

// is_monitor=1 のデッキを1つ返す。無ければ並び順先頭のデッキ。1件も無ければ null。
export async function loadMonitorDeck(
  db: D1Database,
): Promise<{ deck: SignageDeck; slides: SignageSlide[] } | null> {
  const deck = await db
    .prepare('SELECT * FROM signage_decks ORDER BY is_monitor DESC, sort_order, id LIMIT 1')
    .first<SignageDeck>();
  if (!deck) return null;
  const r = await db
    .prepare('SELECT * FROM signage_slides WHERE deck_id = ? ORDER BY sort_order, id')
    .bind(deck.id)
    .all<SignageSlide>();
  return { deck, slides: r.results ?? [] };
}

// スライド構成に応じて必要なライブデータだけ取りに行く
export async function buildSignageLiveCtx(
  db: D1Database,
  slides: SignageSlide[],
): Promise<SignageLiveCtx> {
  const needAcc = slides.some((s) => s.kind === 'accidents');
  const accidents = needAcc ? await fetchPublicAccidentBoard(db) : null;
  return { accidents };
}

app.get(SIGNAGE_PUBLIC_PATH, async (c) => {
  const loaded = await loadMonitorDeck(c.env.DB);
  if (!loaded) return c.text('サイネージのデッキがまだありません', 404);
  const ctx = await buildSignageLiveCtx(c.env.DB, loaded.slides);
  return c.html(signagePublicPage(loaded.deck, loaded.slides, ctx));
});

export default app;
