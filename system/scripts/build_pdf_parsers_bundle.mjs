// pdf_parsers_client_entry.ts（配車PDF・乗務員シフトPDF・退職者名簿PDFの共通パーサー）を
// ブラウザで実行できる形にesbuildでバンドルし、src/assets/pdf_parsers_client_bundle.ts に
// base64 として埋め込む。
// dispatch_pdf.ts / crew_shift_pdf.ts / retiree_pdf.ts のいずれかを編集したら必ず再実行すること:
// npm run build:pdf-parsers-bundle
import { build } from 'esbuild';
import { writeFileSync } from 'fs';

const result = await build({
  entryPoints: ['src/client/pdf_parsers_client_entry.ts'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  minify: true,
  write: false,
});

const js = result.outputFiles[0].contents;
const b64 = Buffer.from(js).toString('base64');
const out = `// pdf_parsers_client_entry.ts を esbuild でブラウザ向けにバンドルしたもの（base64）。
// 配車PDF・乗務員シフトPDF・退職者名簿PDFの3機能で共有する（unpdfの重複バンドルを避けるため）。
// 再生成: npm run build:pdf-parsers-bundle
export const PDF_PARSERS_CLIENT_JS_BASE64 = ${JSON.stringify(b64)};
`;
writeFileSync('src/assets/pdf_parsers_client_bundle.ts', out);
console.log('wrote src/assets/pdf_parsers_client_bundle.ts, base64 length', b64.length);
