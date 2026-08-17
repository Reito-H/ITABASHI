// crew_shift_pdf.ts をブラウザで実行できる形にesbuildでバンドルし、
// src/assets/crew_shift_pdf_client_bundle.ts に base64 として埋め込む。
// crew_shift_pdf.ts を編集したら必ず再実行すること: npm run build:crew-shift-pdf-bundle
import { build } from 'esbuild';
import { writeFileSync } from 'fs';

const result = await build({
  entryPoints: ['src/client/crew_shift_pdf_client_entry.ts'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  minify: true,
  write: false,
});

const js = result.outputFiles[0].contents;
const b64 = Buffer.from(js).toString('base64');
const out = `// crew_shift_pdf_client_entry.ts を esbuild でブラウザ向けにバンドルしたもの（base64）。
// 再生成: npm run build:crew-shift-pdf-bundle
export const CREW_SHIFT_PDF_CLIENT_JS_BASE64 = ${JSON.stringify(b64)};
`;
writeFileSync('src/assets/crew_shift_pdf_client_bundle.ts', out);
console.log('wrote src/assets/crew_shift_pdf_client_bundle.ts, base64 length', b64.length);
