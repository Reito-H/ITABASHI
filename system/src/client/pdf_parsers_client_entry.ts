// 複数のPDF取込機能（配車PDF・乗務員シフトPDF・退職者名簿PDF）で共有するクライアント側バンドル。
// いずれも unpdf を使うため個別にバンドルすると各2MB超が重複し、Workerサイズ上限（3MiB）を
// 超えてしまう。1つのバンドルにまとめ unpdf 分の重複を排除する。
// 編集後は必ず再生成すること: npm run build:pdf-parsers-bundle
import { parseDispatchPdf } from '../utils/dispatch_pdf';
import { parseCrewShiftPdf } from '../utils/crew_shift_pdf';
import { parseRetireePdf } from '../utils/retiree_pdf';

(globalThis as unknown as {
  parseDispatchPdf: typeof parseDispatchPdf;
  parseCrewShiftPdf: typeof parseCrewShiftPdf;
  parseRetireePdf: typeof parseRetireePdf;
}).parseDispatchPdf = parseDispatchPdf;
(globalThis as unknown as { parseCrewShiftPdf: typeof parseCrewShiftPdf }).parseCrewShiftPdf = parseCrewShiftPdf;
(globalThis as unknown as { parseRetireePdf: typeof parseRetireePdf }).parseRetireePdf = parseRetireePdf;
