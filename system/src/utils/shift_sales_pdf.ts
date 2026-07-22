// 勤務実績+売上のPDF出力（紙帳票「勤務予定表」を模したレイアウト）
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Env } from '../auth';
import { loadBentenFont } from '../benten';

export type ShiftSalesRow = { date: string; amount: number; dutyCode: string | null };

export type ShiftSalesPdfParams = {
  env: Env;
  empName: string;
  empNo: string;
  division: number | null;
  team: number | null;
  year: number;
  month: number;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  rows: ShiftSalesRow[];
};

function weekdayLabelOf(dateStr: string): string {
  const labels = ['日', '月', '火', '水', '木', '金', '土'];
  return labels[new Date(dateStr).getDay()];
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayRange(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

function drawColumn(
  page: PDFPage, font: PDFFont, x: number, yTop: number, rowH: number,
  dates: string[], byDate: Map<string, ShiftSalesRow>, runningTotalStart: number,
  black: ReturnType<typeof rgb>, gray: ReturnType<typeof rgb>, lightGray: ReturnType<typeof rgb>,
): number {
  const colW = 240;
  const cDate = x, cWd = x + 32, cDuty = x + 60, cAmount = x + 92, cCum = x + 168;

  // ヘッダー行
  page.drawRectangle({ x, y: yTop - rowH, width: colW, height: rowH, color: lightGray });
  page.drawText('日付', { x: cDate + 4, y: yTop - rowH + 5, size: 8, font, color: gray });
  page.drawText('曜日', { x: cWd + 2, y: yTop - rowH + 5, size: 8, font, color: gray });
  page.drawText('勤務', { x: cDuty + 2, y: yTop - rowH + 5, size: 8, font, color: gray });
  page.drawText('営業収入', { x: cAmount + 4, y: yTop - rowH + 5, size: 8, font, color: gray });
  page.drawText('累計', { x: cCum + 10, y: yTop - rowH + 5, size: 8, font, color: gray });

  let y = yTop - rowH;
  let cum = runningTotalStart;
  for (const d of dates) {
    y -= rowH;
    const r = byDate.get(d);
    const wd = weekdayLabelOf(d);
    const isWeekend = wd === '日' || wd === '土';
    if (isWeekend) page.drawRectangle({ x, y, width: colW, height: rowH, color: rgb(0.96, 0.96, 0.96) });
    page.drawRectangle({ x, y, width: colW, height: rowH, borderColor: gray, borderWidth: 0.5, color: undefined });
    page.drawText(d.slice(8, 10), { x: cDate + 4, y: y + 5, size: 8, font, color: black });
    page.drawText(wd, { x: cWd + 4, y: y + 5, size: 8, font, color: isWeekend ? rgb(0.75, 0.2, 0.2) : black });
    if (r) {
      cum += r.amount;
      page.drawText(r.dutyCode ?? '', { x: cDuty + 4, y: y + 5, size: 8, font, color: black });
      page.drawText(r.amount.toLocaleString('ja-JP'), { x: cAmount + 4, y: y + 5, size: 8, font, color: black });
      page.drawText(cum.toLocaleString('ja-JP'), { x: cCum + 4, y: y + 5, size: 8, font, color: black });
    }
  }
  return cum;
}

export async function buildShiftSalesPdf(p: ShiftSalesPdfParams): Promise<Uint8Array | null> {
  const fontBytes = await loadBentenFont(p.env);
  if (!fontBytes) return null;

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: false });

  const PW = 841.89, PH = 595.28, M = 36; // A4横
  const page = pdf.addPage([PW, PH]);
  const black = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.45, 0.45, 0.45);
  const lightGray = rgb(0.9, 0.9, 0.9);

  let y = PH - M;
  page.drawText('勤務実績・売上表', { x: M, y, size: 18, font, color: black });
  y -= 22;
  const teamLabel = p.division ? `${p.division}課 ${p.team ?? ''}班` : '';
  page.drawText(`${p.year}年${p.month}月分（${p.start} 〜 ${p.end}）　${teamLabel}　${p.empNo} ${p.empName} 様`, { x: M, y, size: 11, font, color: gray });
  y -= 24;

  const byDate = new Map(p.rows.map(r => [r.date, r]));
  const allDates = dayRange(p.start, p.end);
  const mid = Math.ceil(allDates.length / 2);
  const leftDates = allDates.slice(0, mid);
  const rightDates = allDates.slice(mid);

  const rowH = 16;
  const colGap = 30;
  const leftX = M;
  const rightX = M + 240 + colGap;

  const leftFinal = drawColumn(page, font, leftX, y, rowH, leftDates, byDate, 0, black, gray, lightGray);
  drawColumn(page, font, rightX, y, rowH, rightDates, byDate, leftFinal, black, gray, lightGray);

  // フッター: 勤務日数・合計
  const dutyCount = p.rows.length;
  const total = p.rows.reduce((s, r) => s + r.amount, 0);
  const footerY = y - rowH - Math.max(leftDates.length, rightDates.length) * rowH - 24;
  page.drawText(`勤務日数: ${dutyCount}日　　売上合計（税込）: ${total.toLocaleString('ja-JP')}円`, { x: M, y: footerY, size: 11, font, color: black });

  return pdf.save();
}
