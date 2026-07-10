import { Hono } from 'hono';
import { layout, escHtml } from '../html/layout';
import { ADMIN_PATH } from '../config';
import type { Env } from '../auth';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

app.get('/manual-chat', async (c) => {
  // マニュアル一覧取得
  const manuals = await c.env.DB.prepare(
    `SELECT id, title, filename, created_at, (SELECT COUNT(*) FROM manual_chunks WHERE manual_id=manuals.id) as chunk_count FROM manuals ORDER BY id DESC`
  ).all<{ id: number; title: string; filename: string; created_at: string; chunk_count: number }>();

  const manualList = (manuals.results ?? []).map(m =>
    `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f3f4f6;">
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:600;color:#1f2937;">${escHtml(m.title)}</div>
        <div style="font-size:11px;color:#9ca3af;">${escHtml(m.filename)} &nbsp;—&nbsp; ${m.chunk_count}チャンク &nbsp;—&nbsp; ${escHtml(m.created_at)}</div>
      </div>
    </div>`
  ).join('');

  const content = `
<div style="font-family:'Hiragino Sans','Meiryo',sans-serif;max-width:960px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
    <div>
      <h2 style="font-size:16px;font-weight:700;color:#1a3a5c;margin:0 0 2px;">マニュアルチャットBot</h2>
      <div style="font-size:12px;color:#9ca3af;">登録済みマニュアルをもとにAIが回答します</div>
    </div>
  </div>

  <!-- カテゴリ選択ボタン -->
  <div style="margin-bottom:14px;">
    <div style="font-size:12px;color:#6b7280;margin-bottom:8px;font-weight:600;">よくある質問カテゴリ：</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;">
      <button onclick="askCategory('S.RIDEの操作方法を教えて')" style="padding:6px 12px;background:#e8f0fe;color:#1a3a5c;border:1px solid #c7d8f7;border-radius:20px;font-size:12px;cursor:pointer;font-weight:500;">S.RIDE・配車</button>
      <button onclick="askCategory('決済の方法を教えて')" style="padding:6px 12px;background:#e8f0fe;color:#1a3a5c;border:1px solid #c7d8f7;border-radius:20px;font-size:12px;cursor:pointer;font-weight:500;">決済・精算</button>
      <button onclick="askCategory('ナビの使い方を教えて')" style="padding:6px 12px;background:#e8f0fe;color:#1a3a5c;border:1px solid #c7d8f7;border-radius:20px;font-size:12px;cursor:pointer;font-weight:500;">ナビ操作</button>
      <button onclick="askCategory('エラーが出たときの対応を教えて')" style="padding:6px 12px;background:#e8f0fe;color:#1a3a5c;border:1px solid #c7d8f7;border-radius:20px;font-size:12px;cursor:pointer;font-weight:500;">エラー対応</button>
      <button onclick="askCategory('チケットの使い方を教えて')" style="padding:6px 12px;background:#e8f0fe;color:#1a3a5c;border:1px solid #c7d8f7;border-radius:20px;font-size:12px;cursor:pointer;font-weight:500;">チケット・券種</button>
      <button onclick="askCategory('メーターの操作方法を教えて')" style="padding:6px 12px;background:#e8f0fe;color:#1a3a5c;border:1px solid #c7d8f7;border-radius:20px;font-size:12px;cursor:pointer;font-weight:500;">メーター操作</button>
      <button onclick="askCategory('出庫入庫の手順を教えて')" style="padding:6px 12px;background:#e8f0fe;color:#1a3a5c;border:1px solid #c7d8f7;border-radius:20px;font-size:12px;cursor:pointer;font-weight:500;">出庫・入庫</button>
    </div>
  </div>

  <!-- チャットUI -->
  <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);overflow:hidden;margin-bottom:20px;">
    <!-- メッセージエリア -->
    <div id="chat-messages" style="height:420px;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:12px;">
      <div style="align-self:flex-start;max-width:80%;">
        <div style="background:#f3f4f6;border-radius:12px 12px 12px 0;padding:12px 16px;font-size:13px;color:#1f2937;line-height:1.6;">
          こんにちは！乗務員向けマニュアルについてのご質問にお答えします。<br>
          上のカテゴリボタンや、下の入力欄から直接質問できます。
        </div>
      </div>
    </div>

    <!-- 入力エリア -->
    <div style="border-top:1px solid #e5e7eb;padding:12px 16px;display:flex;gap:8px;background:#f9fafb;">
      <textarea id="chat-input" rows="2" placeholder="質問を入力してください…"
        style="flex:1;border:1px solid #d1d5db;border-radius:8px;padding:10px 12px;font-size:13px;font-family:inherit;resize:none;outline:none;"
        onkeydown="if((event.metaKey||event.ctrlKey)&&event.key==='Enter')sendChat()"></textarea>
      <button onclick="sendChat()" id="send-btn"
        style="padding:0 20px;background:#1a3a5c;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;align-self:flex-end;height:40px;">
        送信
      </button>
    </div>
    <div style="padding:4px 16px 10px;font-size:11px;color:#9ca3af;">Cmd+Enter または Ctrl+Enter で送信</div>
  </div>

  <!-- 登録済みマニュアル -->
  <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:16px 20px;">
    <div style="font-size:13px;font-weight:700;color:#1a3a5c;margin-bottom:10px;">登録済みマニュアル</div>
    ${manualList.length > 0 ? manualList : '<div style="color:#9ca3af;font-size:12px;">マニュアルが登録されていません</div>'}
  </div>
</div>

<script>
const ADMIN_PATH = '${ADMIN_PATH}';

function addMessage(role, text) {
  const wrap = document.getElementById('chat-messages');
  const isUser = role === 'user';
  const div = document.createElement('div');
  div.style.cssText = 'align-self:' + (isUser ? 'flex-end' : 'flex-start') + ';max-width:80%;';
  div.innerHTML = '<div style="background:' + (isUser ? '#1a3a5c' : '#f3f4f6') + ';color:' + (isUser ? 'white' : '#1f2937') + ';border-radius:' + (isUser ? '12px 12px 0 12px' : '12px 12px 12px 0') + ';padding:12px 16px;font-size:13px;line-height:1.6;white-space:pre-wrap;">' + escHtml(text) + '</div>';
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function addLoading() {
  const wrap = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.id = 'loading-bubble';
  div.style.cssText = 'align-self:flex-start;';
  div.innerHTML = '<div style="background:#f3f4f6;border-radius:12px 12px 12px 0;padding:12px 16px;font-size:13px;color:#9ca3af;">回答を生成中…</div>';
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function askCategory(question) {
  const input = document.getElementById('chat-input');
  input.value = question;
  sendChat();
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const question = input.value.trim();
  if (!question) return;

  addMessage('user', question);
  input.value = '';
  addLoading();

  const btn = document.getElementById('send-btn');
  btn.disabled = true;

  try {
    const res = await fetch('/api/manual-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, source: 'admin' }),
    });
    const json = await res.json();
    document.getElementById('loading-bubble')?.remove();
    if (res.ok) {
      addMessage('bot', json.answer);
    } else {
      addMessage('bot', 'エラーが発生しました: ' + (json.error || '不明'));
    }
  } catch (e) {
    document.getElementById('loading-bubble')?.remove();
    addMessage('bot', '通信エラーが発生しました: ' + e.message);
  } finally {
    btn.disabled = false;
    input.focus();
  }
}
</script>`;

  return c.html(layout('マニュアルBot', content, 'manual-chat'));
});

export default app;
