// ホシコン発表資料 — Web版スライドビューア（フル権限adminのみ・印刷対応）
// パス /presentation は permissions.ts の PATH_PERMISSIONS に意図的に登録していない。
// これにより権限制限アカウントは自動的に403となり、permissions=NULLのフル権限adminだけが閲覧できる
// （src/routes/admin_line_usage.ts と同じ設計パターン）。
import { escHtml } from './layout';

type Slide = { eyebrow: string; body: string };

function beforeAfter(before: string, after: string, effect: string): string {
  return `
    <div class="ba-grid">
      <div class="ba-col ba-before">
        <div class="ba-label">BEFORE — 従来</div>
        <p>${before}</p>
      </div>
      <div class="ba-col ba-after">
        <div class="ba-label">AFTER — 導入後</div>
        <p>${after}</p>
      </div>
    </div>
    <div class="effect-bar">効果：${effect}</div>`;
}

function buildSlides(): Slide[] {
  return [
    // 1. 表紙
    {
      eyebrow: 'STAFF MANAGEMENT SYSTEM',
      body: `
        <div class="cover">
          <div class="cover-kicker">ホシコン発表資料</div>
          <h1 class="cover-title">現場のアナログ業務を、<br>デジタルで置き換える</h1>
          <div class="cover-bar"></div>
          <div class="cover-sub">板橋営業所 独自開発システムの取り組み紹介</div>
          <div class="cover-tags">
            <span>AI売上分析</span><span>引き継ぎシート電子化</span><span>班長シフト収集自動化</span><span>事故防止AI</span>
          </div>
        </div>`,
    },
    // 2. システム基盤・デジタルサイネージ連携
    {
      eyebrow: 'INFRASTRUCTURE',
      body: `
        <h1>システム基盤について</h1>
        <div class="lead">情報漏洩リスクを抑えるため、社内で完結する構成にしています</div>
        <ul class="plain-list">
          <li>会社が保有するサーバー上でシステムを稼働し、社内ネットワークを経由してアクセス</li>
          <li>外部のクラウド事業者に業務データを預けるのではなく、自社の管理下でシステムを運用</li>
        </ul>
        <div class="flow-title">例：事故データ → デジタルサイネージへの表示の流れ</div>
        <div class="flow">
          <div class="flow-box">① 事故データCSVを<br>社内PCの指定フォルダへ保存</div>
          <div class="flow-arrow">→</div>
          <div class="flow-box">② フォルダ監視スクリプトが<br>自動検知</div>
          <div class="flow-arrow">→</div>
          <div class="flow-box">③ 専用キー認証で<br>自社サーバーへ自動送信</div>
          <div class="flow-arrow">→</div>
          <div class="flow-box">④ サイネージ表示ページが<br>更新を自動検知</div>
          <div class="flow-arrow">→</div>
          <div class="flow-box flow-box-accent">⑤ 事務所のデジタルサイネージに<br>リアルタイム表示</div>
        </div>`,
    },
    // 3. AI売上分析システム
    {
      eyebrow: '01 / SALES ANALYTICS',
      body: `
        <h1>① AI売上分析システム</h1>
        ${beforeAfter(
          'タクコン等の売上管理ソフトは現在も活用しているが、乗務員一人ひとりに指導する際、都度データを見比べて分析する手間がかかっていた。',
          '全社員横断で自動集計。課別・班別の比較、曜日・天候等の要因別分析、前月比・ランキングを自動表示。個人ごとに強み・弱み・改善提案を自動生成し、指導用レポートとして印刷可能。',
          '個別指導の準備時間を短縮し、データに基づいた具体的な指導が可能に'
        )}`,
    },
    // 4. 引き継ぎシートのデジタル化
    {
      eyebrow: '02 / HANDOVER SHEET',
      body: `
        <h1>② 引き継ぎシートのデジタル化</h1>
        ${beforeAfter(
          '紙ベース、または課によってExcelを3〜4枚使い分けており、引き継ぎ業務が課の中だけで完結し、他課と共有できていなかった。',
          '板橋1〜4課の日次引き継ぎ（稼働・動態・当欠・事故車・点検・車両異常・乗務希望）をWeb上で一元化。項目単位でリアルタイム保存され、課内の複数アカウントによる同時編集や他端末での更新も自動検知。',
          '課をまたいだ引き継ぎ情報の可視化、紙・Excel管理からの脱却'
        )}`,
    },
    // 5. 班長希望シフトのWeb収集化
    {
      eyebrow: '03 / SHIFT COLLECTION',
      body: `
        <h1>③ 班長希望シフトのWeb収集化</h1>
        ${beforeAfter(
          '班長が一人ずつLINEでシフト作成者に希望を個別送付し、手作業で表に転記していた。',
          '専用フォームから社員番号で本人確認のうえ、希望休をカレンダーで送信。Web上で一元収集し、「希望休を自動反映」機能でワンクリックで表へ反映。連勤・当直禁忌ペア・必要人数不足も自動警告。',
          'LINEでの個別対応・手作業転記の削減、シフト作成業務の効率化'
        )}`,
    },
    // 6. 事故防止・事故研修のAI化
    {
      eyebrow: '04 / ACCIDENT PREVENTION',
      body: `
        <h1>④ 事故防止・事故研修のAI化と効率化</h1>
        ${beforeAfter(
          '事故データの傾向分析、研修対象者の抽出が手作業だった。',
          '個人別・課別で事故記録を自動集計・分析し、A4レポートを自動生成・印刷。研修対象者も事故件数のしきい値で自動抽出し、案内状を一括印刷。',
          '分析・資料作成の時間短縮、勘に頼らないデータに基づく事故防止指導'
        )}
        <div class="footnote">※「AI」は表示上の呼称です。外部AI/LLM APIへの通信は一切行わず、蓄積データの集計・しきい値判定によるルールベース処理で分析結果を生成しています。</div>`,
    },
    // 7. セキュリティ・運用体制
    {
      eyebrow: 'SECURITY & OPERATION',
      body: `
        <h1>セキュリティ・運用体制について</h1>
        <ul class="plain-list plain-list-lg">
          <li>システムは自社サーバー・社内ネットワーク上で完結。デジタルサイネージへの送受信も社内で完結する経路のみを使用</li>
          <li>①④で使用する分析ロジックはすべてルールベースで、外部AI/LLM APIへの通信は一切なし（「AI」は表示上の呼称）</li>
          <li>システムの開発・保守・運用は全て自分が担当</li>
        </ul>`,
    },
    // 8. 締め
    {
      eyebrow: 'THANK YOU',
      body: `
        <div class="cover">
          <h1 class="cover-title" style="font-size:38px;">ご清聴ありがとうございました</h1>
          <div class="cover-bar"></div>
        </div>`,
    },
  ];
}

export function presentationPage(): string {
  const slides = buildSlides();
  const total = slides.length;

  const slidesHtml = slides.map((s, i) => `
    <section class="slide${i === 0 ? ' active' : ''}" data-index="${i}">
      <div class="slide-eyebrow">${escHtml(s.eyebrow)}</div>
      <div class="slide-body">${s.body}</div>
      <div class="slide-num">${i + 1} / ${total}</div>
    </section>`).join('');

  const dotsHtml = slides.map((_, i) => `<button type="button" class="dot${i === 0 ? ' active' : ''}" data-goto="${i}" aria-label="スライド${i + 1}"></button>`).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>ホシコン発表資料</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #111827; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; color: #1f2937; height: 100%; }

  .toolbar { position: sticky; top: 0; z-index: 20; background: #1e3a5f; padding: 10px 16px; display: flex; gap: 8px; align-items: center; }
  .toolbar a, .toolbar button { font-size: 13px; padding: 7px 16px; border-radius: 6px; border: none; cursor: pointer; text-decoration: none; font-weight: 600; }
  .toolbar a { background: #374151; color: #fff; }
  .toolbar button.print-btn { background: #2563eb; color: #fff; }
  .toolbar .nav-btn { background: #334155; color: #fff; }
  .toolbar .nav-btn:disabled { opacity: 0.4; cursor: default; }
  .toolbar .counter { color: #cbd5e1; font-size: 12px; margin: 0 4px; min-width: 52px; text-align: center; }
  .toolbar .hint { margin-left: auto; font-size: 12px; color: #94a3b8; }

  .stage { min-height: calc(100vh - 49px); display: flex; align-items: center; justify-content: center; padding: 32px 16px; }

  .slide { display: none; flex-direction: column; width: min(1150px, 92vw); aspect-ratio: 16 / 9; background: #fff;
    border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.35); padding: 52px 68px; position: relative; overflow: hidden; }
  .slide.active { display: flex; }

  .slide-eyebrow { font-size: 11px; font-weight: 800; letter-spacing: 0.14em; color: #9ca3af; margin-bottom: 18px; }
  .slide-body { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  .slide-num { position: absolute; bottom: 20px; right: 26px; font-size: 11px; color: #9ca3af; }

  .slide h1 { font-size: 32px; font-weight: 900; color: #1e3a5f; margin: 0 0 8px; line-height: 1.35; }
  .lead { font-size: 14px; color: #6b7280; margin-bottom: 24px; }

  .ba-grid { display: flex; gap: 22px; flex: 1; min-height: 0; }
  .ba-col { flex: 1; border-radius: 10px; padding: 20px 22px; }
  .ba-before { background: #f9fafb; border: 1px solid #e5e7eb; }
  .ba-after { background: #eff6ff; border: 1px solid #bfdbfe; }
  .ba-label { font-size: 11px; font-weight: 800; letter-spacing: 0.08em; margin-bottom: 10px; }
  .ba-before .ba-label { color: #9ca3af; }
  .ba-after .ba-label { color: #1d4ed8; }
  .ba-col p { font-size: 14px; line-height: 1.85; margin: 0; color: #374151; }

  .effect-bar { margin-top: 18px; background: #1e3a5f; color: #fff; border-radius: 8px; padding: 12px 18px; font-size: 13px; font-weight: 700; }
  .footnote { margin-top: 14px; font-size: 11px; color: #9ca3af; line-height: 1.6; }

  .plain-list { font-size: 15px; line-height: 2; color: #374151; padding-left: 22px; margin: 8px 0 0; }
  .plain-list-lg { font-size: 16px; line-height: 2.3; margin-top: 24px; }

  .flow-title { font-size: 12px; font-weight: 700; color: #6b7280; margin: 22px 0 10px; }
  .flow { display: flex; align-items: stretch; gap: 8px; flex-wrap: wrap; }
  .flow-box { background: #f8fafc; border: 1px solid #d1d5db; border-radius: 8px; padding: 12px 14px; font-size: 12px; line-height: 1.6;
    flex: 1; min-width: 150px; display: flex; align-items: center; color: #374151; }
  .flow-box-accent { background: #eff6ff; border-color: #bfdbfe; color: #1d4ed8; font-weight: 700; }
  .flow-arrow { font-size: 18px; color: #9ca3af; display: flex; align-items: center; }

  .cover { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .cover-kicker { font-size: 12px; letter-spacing: 0.18em; color: #9ca3af; margin-bottom: 18px; }
  .cover-title { font-size: 40px; font-weight: 900; color: #1e3a5f; line-height: 1.4; margin: 0; }
  .cover-bar { width: 56px; height: 4px; background: #1e3a5f; border-radius: 2px; margin: 22px 0; }
  .cover-sub { font-size: 14px; color: #6b7280; }
  .cover-tags { margin-top: 28px; display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
  .cover-tags span { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 999px; padding: 6px 14px; font-size: 12px; font-weight: 700; }

  .dots { display: flex; gap: 6px; justify-content: center; padding: 0 0 26px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; border: none; background: #475569; cursor: pointer; padding: 0; }
  .dot.active { background: #fff; }

  @media print {
    @page { size: A4 landscape; margin: 0; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { background: #fff !important; }
    .toolbar, .dots, .no-print { display: none !important; }
    .stage { display: block !important; padding: 0 !important; min-height: 0 !important; }
    .slide { display: flex !important; width: 297mm; height: 210mm; aspect-ratio: auto; border-radius: 0; box-shadow: none;
      padding: 18mm 22mm; page-break-after: always; break-after: page; margin: 0 auto; }
    .slide:last-child { page-break-after: auto; break-after: auto; }
  }
</style>
</head>
<body>
  <div class="toolbar no-print">
    <a href="javascript:history.back()">← 戻る</a>
    <button type="button" class="nav-btn" id="prev-btn">◀</button>
    <span class="counter" id="slide-counter">1 / ${total}</span>
    <button type="button" class="nav-btn" id="next-btn">▶</button>
    <button type="button" class="print-btn" onclick="window.print()">印刷 / PDF保存</button>
    <span class="hint">← → キーでも切り替えられます</span>
  </div>
  <div class="stage">
    ${slidesHtml}
  </div>
  <div class="dots no-print">${dotsHtml}</div>

<script>
(function () {
  var total = ${total};
  var current = 0;
  var slides = document.querySelectorAll('.slide');
  var dots = document.querySelectorAll('.dot');
  var counter = document.getElementById('slide-counter');
  var prevBtn = document.getElementById('prev-btn');
  var nextBtn = document.getElementById('next-btn');

  function show(i) {
    current = Math.max(0, Math.min(total - 1, i));
    slides.forEach(function (el, idx) { el.classList.toggle('active', idx === current); });
    dots.forEach(function (el, idx) { el.classList.toggle('active', idx === current); });
    counter.textContent = (current + 1) + ' / ' + total;
    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === total - 1;
  }

  prevBtn.addEventListener('click', function () { show(current - 1); });
  nextBtn.addEventListener('click', function () { show(current + 1); });
  dots.forEach(function (el) {
    el.addEventListener('click', function () { show(parseInt(el.dataset.goto, 10)); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === ' ') show(current + 1);
    if (e.key === 'ArrowLeft') show(current - 1);
  });

  show(0);
})();
</script>
</body>
</html>`;
}
