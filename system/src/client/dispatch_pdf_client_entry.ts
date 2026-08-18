import { parseDispatchPdf } from '../utils/dispatch_pdf';
(globalThis as unknown as { parseDispatchPdf: typeof parseDispatchPdf }).parseDispatchPdf = parseDispatchPdf;
