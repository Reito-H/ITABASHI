import { parseCrewShiftPdf } from '../utils/crew_shift_pdf';
(globalThis as unknown as { parseCrewShiftPdf: typeof parseCrewShiftPdf }).parseCrewShiftPdf = parseCrewShiftPdf;
