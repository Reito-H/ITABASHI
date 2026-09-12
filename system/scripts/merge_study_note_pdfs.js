// 学習ノートの分割PDF（サーバー側がMAX_PAGES_PER_PDFずつ生成したチャンク）を
// ローカルで1つのPDFに結合するスクリプト。kindle_capture.sh から呼ばれる想定。
//
// 使い方: node merge_study_note_pdfs.js <出力先.pdf> <チャンク1.pdf> <チャンク2.pdf> ...
// （チャンクは渡した順番のままページが並ぶので、呼び出し側でページ順に並べて渡すこと）

const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

async function main() {
  const [, , outPath, ...chunkPaths] = process.argv;
  if (!outPath || chunkPaths.length === 0) {
    console.error('使い方: node merge_study_note_pdfs.js <出力先.pdf> <チャンク1.pdf> [チャンク2.pdf ...]');
    process.exit(1);
  }

  const merged = await PDFDocument.create();
  for (const chunkPath of chunkPaths) {
    const bytes = fs.readFileSync(chunkPath);
    const chunkDoc = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(chunkDoc, chunkDoc.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }

  const outBytes = await merged.save();
  fs.writeFileSync(outPath, outBytes);
  console.log(`結合完了: ${outPath}（${chunkPaths.length}チャンク）`);
}

main().catch((err) => {
  console.error('結合に失敗しました:', err.message);
  process.exit(1);
});
