import { FAVICON_DATA_URI } from './layout';
// 異常気象警報 注意喚起サイネージ（既存の交通安全サイネージとは別の専用モニター画面）
//   運用: 警報が発令された日にその記録（日付・警報名・エリア・注意文言）を入力する。
//   専用モニターは「本日(event_date=今日)」の記録だけを表示する。
//   1件の記録につき「日付＋警報名の見出しスライド」→「注意文言スライド」の2枚を
//   約10秒（5秒×2枚）で表示し、本日分が複数あれば順番に繰り返す。
//   present（管理画面プレビュー）・public（ログイン不要の専用URL）の両方から呼ばれる。

export interface WeatherNoticeAlertTemplate {
  id: number;
  name: string;
  caution_text: string;
  sort_order: number;
  is_active: number;
}

export interface WeatherNoticeEvent {
  id: number;
  event_date: string; // 'YYYY-MM-DD'
  warning_name: string;
  area: string | null;
  caution_text: string;
  sort_order: number;
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

// 'YYYY-MM-DD' → '2026年8月13日（木）'（曜日はローカル日付として計算。年またぎ等は考慮不要な短期運用のため簡易実装）
export function formatDateWithDow(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return dateStr;
  const [, y, mo, d] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  const dow = WEEKDAYS_JA[dt.getDay()];
  return `${Number(y)}年${Number(mo)}月${Number(d)}日（${dow}）`;
}

export const WEATHER_NOTICE_CSS = `
  :root{
    --wn-bg:#0B0C0D; --wn-paper:#FAFAF8; --wn-ink:#1B1D20; --wn-alert:#C8102E;
    --wn-mark:#F2B705; --wn-hush:#8A8D91;
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{height:100%;}
  body{background:var(--wn-bg);color:var(--wn-ink);font-family:"Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo",sans-serif;overflow:hidden;}
  .wn-viewport{position:fixed;inset:0;background:var(--wn-paper);}
  .wn-stage{position:absolute;inset:0;}
  .wn-card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:2.6vh;padding:4vh 4vw;opacity:0;visibility:hidden;transition:opacity .5s ease;background:var(--wn-paper);}
  .wn-card.is-active{opacity:1;visibility:visible;}
  .wn-card.alert{background:var(--wn-alert);color:#fff;}
  .wn-card.caution{background:var(--wn-paper);color:var(--wn-ink);border-top:1.4vh solid var(--wn-alert);}
  .wn-date{font-size:2.1vw;font-weight:700;letter-spacing:.06em;}
  .wn-card.alert .wn-date{color:rgba(255,255,255,.85);}
  .wn-card.caution .wn-date{color:var(--wn-hush);}
  .wn-icon{width:9vh;height:9vh;fill:#fff;}
  .wn-name{font-size:8vw;font-weight:900;letter-spacing:.02em;line-height:1.15;max-width:94vw;overflow-wrap:break-word;word-break:normal;}
  .wn-area{font-size:2.4vw;font-weight:700;letter-spacing:.03em;color:rgba(255,255,255,.9);}
  .wn-tag{font-size:2.2vw;font-weight:900;letter-spacing:.04em;color:var(--wn-alert);}
  .wn-caution{font-size:clamp(30px, 4.6vw, 90px);font-weight:900;line-height:1.6;max-width:92vw;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;color:var(--wn-ink);}
  .wn-none{color:var(--wn-hush);font-size:3vw;font-weight:700;text-align:center;padding:0 4vw;}
  .wn-dots{position:absolute;left:0;right:0;bottom:2vh;display:flex;justify-content:center;gap:.8vw;z-index:5;}
  .wn-dots i{width:.9vw;height:.9vw;border-radius:50%;background:rgba(120,120,120,.4);display:block;transition:background .3s ease,transform .3s ease;}
  .wn-dots i.on{background:var(--wn-alert);transform:scale(1.4);}
  @media print{ .wn-viewport{position:static;} }
`;

export const WEATHER_NOTICE_JS = `
(function(){
  var cards = Array.prototype.slice.call(document.querySelectorAll(".wn-card"));
  var dotsWrap = document.getElementById("wn-dots");
  if(!cards.length) return;
  var dots = [];
  if(dotsWrap){
    cards.forEach(function(){ dotsWrap.appendChild(document.createElement("i")); });
    dots = Array.prototype.slice.call(dotsWrap.children);
  }
  var idx = 0, total = cards.length;
  function render(){
    cards.forEach(function(el,n){ el.classList.toggle("is-active", n===idx); });
    dots.forEach(function(el,n){ el.classList.toggle("on", n===idx); });
  }
  render();
  if(total > 1){
    setInterval(function(){ idx = (idx+1) % total; render(); }, 5000);
  }
})();
`;

function warningIcon(): string {
  return `<svg class="wn-icon" viewBox="0 0 24 24"><path d="M12 2 1 21h22L12 2zm0 5.5 6.9 12H5.1L12 7.5zM11 10v5h2v-5h-2zm0 6.5v2h2v-2h-2z"/></svg>`;
}

// 1件の記録につき「見出しスライド」→「注意文言スライド」の2枚。画面いっぱいに使う全面塗りレイアウト。
export function weatherNoticeCards(dateLabel: string, events: WeatherNoticeEvent[]): string {
  if (!events.length) {
    return `<div class="wn-card caution is-active"><p class="wn-date">${esc(dateLabel)}</p><p class="wn-none">発令中の異常気象警報はありません</p></div>`;
  }
  const sorted = [...events].sort((a, b) => a.sort_order - b.sort_order);
  const slides: string[] = [];
  sorted.forEach((ev) => {
    slides.push(`
      <div class="wn-card alert">
        <p class="wn-date">${esc(dateLabel)}</p>
        ${warningIcon()}
        <p class="wn-name">${esc(ev.warning_name)}</p>
        ${ev.area ? `<p class="wn-area">対象エリア：${esc(ev.area)}</p>` : ''}
      </div>`);
    slides.push(`
      <div class="wn-card caution">
        <p class="wn-tag">${esc(ev.warning_name)}</p>
        <p class="wn-caution">${esc(ev.caution_text)}</p>
      </div>`);
  });
  slides[0] = slides[0].replace('class="wn-card alert"', 'class="wn-card alert is-active"');
  return slides.join('\n');
}

export function weatherNoticePresentPage(dateLabel: string, events: WeatherNoticeEvent[]): string {
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>異常気象警報 注意喚起サイネージ</title>
<link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
<style>${WEATHER_NOTICE_CSS}</style>
</head><body>
<div class="wn-viewport">
  <div class="wn-stage">
    ${weatherNoticeCards(dateLabel, events)}
  </div>
  <div class="wn-dots" id="wn-dots"></div>
</div>
<script>${WEATHER_NOTICE_JS}</script>
</body></html>`;
}
