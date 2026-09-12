// 学習ノート（個人用ノート教材）の共通ロジック。
// 管理画面API（api/study_notes.ts）と無人アップロードAPI（public_study_notes_upload.ts）の
// 両方から使う。

import { PDFDocument } from 'pdf-lib';
import type { Env } from '../auth';

export const MAX_PAGE_SIZE = 15 * 1024 * 1024; // 15MB/ページ

export type BookRow = { id: number; title: string; page_count: number };

export function extFor(mimeType: string): string | null {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg';
  return null;
}

function pad(n: number): string {
  return String(n).padStart(4, '0');
}

export async function listAllKeys(bucket: R2Bucket, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const listed: R2Objects = await bucket.list({ prefix, cursor });
    keys.push(...listed.objects.map((o) => o.key));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return keys;
}

export async function createBook(db: D1Database, title: string, createdBy: string | null): Promise<number> {
  const result = await db.prepare(
    'INSERT INTO study_note_books (title, created_by) VALUES (?, ?)'
  ).bind(title, createdBy).run();
  return result.meta.last_row_id as number;
}

// タイトル完全一致で既存タイトルを探し、なければ新規作成する（無人アップロードで複数回に分けて
// 撮影・送信しても同じ本に追記できるようにするため）
export async function findOrCreateBook(
  db: D1Database, title: string, createdBy: string | null
): Promise<{ id: number; created: boolean }> {
  const existing = await db.prepare('SELECT id FROM study_note_books WHERE title = ?')
    .bind(title).first<{ id: number }>();
  if (existing) return { id: existing.id, created: false };
  const id = await createBook(db, title, createdBy);
  return { id, created: true };
}

type AppendResult = { added: number; page_count: number } | { error: string; status: number };

export async function appendPages(env: Env, bookId: number, files: File[]): Promise<AppendResult> {
  const book = await env.DB.prepare('SELECT id, page_count FROM study_note_books WHERE id = ?')
    .bind(bookId).first<BookRow>();
  if (!book) return { error: '見つかりません', status: 404 };

  for (const file of files) {
    if (file.size > MAX_PAGE_SIZE) {
      return { error: `1ページあたり${MAX_PAGE_SIZE / 1024 / 1024}MB以下にしてください`, status: 400 };
    }
    if (!extFor(file.type)) {
      return { error: '対応していない画像形式です（PNG/JPEGのみ）', status: 400 };
    }
  }

  let nextIndex = book.page_count + 1;
  for (const file of files) {
    const ext = extFor(file.type)!;
    const key = `study-notes/${bookId}/page-${pad(nextIndex)}.${ext}`;
    await env.STUDY_NOTES_BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });
    nextIndex++;
  }

  const added = files.length;
  await env.DB.prepare(
    `UPDATE study_note_books SET page_count = page_count + ?, updated_at = datetime('now','+9 hours') WHERE id = ?`
  ).bind(added, bookId).run();

  return { added, page_count: book.page_count + added };
}

// Cloudflare Workerは1リクエストあたりのメモリが限られており（約128MB）、大きな本を
// 1回のPDF生成でまとめて処理すると「error code: 1102」（リソース超過）で落ちる。
// そのため1回のリクエストで処理できるページ数に上限を設け、大きい本は呼び出し側
// （管理画面/kindle_capture.sh）が from/to で範囲を分けて複数回呼び出し、結合する。
export const MAX_PAGES_PER_PDF = 60;

export type BookInfo = { id: number; title: string; page_count: number };

export async function getBookInfo(db: D1Database, bookId: number): Promise<BookInfo | null> {
  const row = await db.prepare('SELECT id, title, page_count FROM study_note_books WHERE id = ?')
    .bind(bookId).first<BookInfo>();
  return row ?? null;
}

type PdfResult =
  | { bytes: Uint8Array; title: string; from: number; to: number; page_count: number }
  | { error: string; status: number };

export async function buildBookPdf(env: Env, bookId: number, from?: number, to?: number): Promise<PdfResult> {
  const book = await env.DB.prepare('SELECT title, page_count FROM study_note_books WHERE id = ?')
    .bind(bookId).first<{ title: string; page_count: number }>();
  if (!book) return { error: '見つかりません', status: 404 };
  if (!book.page_count) return { error: 'ページがありません', status: 400 };

  const rangeFrom = from && from >= 1 ? from : 1;
  const rangeTo = to && to <= book.page_count ? to : book.page_count;
  if (rangeFrom > rangeTo) return { error: '範囲が不正です', status: 400 };
  if (rangeTo - rangeFrom + 1 > MAX_PAGES_PER_PDF) {
    return {
      error: `1回のリクエストで生成できるのは${MAX_PAGES_PER_PDF}ページまでです。from/toで範囲を分けて呼び出してください。`,
      status: 400,
    };
  }

  const allKeys = (await listAllKeys(env.STUDY_NOTES_BUCKET, `study-notes/${bookId}/`)).sort();
  const keys = allKeys.filter((key) => {
    const m = key.match(/page-(\d+)\./);
    if (!m) return false;
    const n = parseInt(m[1], 10);
    return n >= rangeFrom && n <= rangeTo;
  });

  const pdf = await PDFDocument.create();
  for (const key of keys) {
    const obj = await env.STUDY_NOTES_BUCKET.get(key);
    if (!obj) continue;
    const bytes = new Uint8Array(await obj.arrayBuffer());
    const img = key.endsWith('.png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const page = pdf.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }

  const bytes = await pdf.save();
  return { bytes, title: book.title, from: rangeFrom, to: rangeTo, page_count: book.page_count };
}

export async function deleteBook(env: Env, bookId: number): Promise<boolean> {
  const book = await env.DB.prepare('SELECT id FROM study_note_books WHERE id = ?').bind(bookId).first();
  if (!book) return false;

  const keys = await listAllKeys(env.STUDY_NOTES_BUCKET, `study-notes/${bookId}/`);
  await Promise.all(keys.map((k) => env.STUDY_NOTES_BUCKET.delete(k)));

  await env.DB.prepare('DELETE FROM study_note_books WHERE id = ?').bind(bookId).run();
  return true;
}
