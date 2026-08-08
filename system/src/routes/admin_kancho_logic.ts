// 班長シフト ロジック仕様（閲覧専用の管理画面ページ）
// docs/KANCHO_SHIFT_LOGIC.md の内容を管理画面から見られるようにしたもの。
// 編集機能はない（内容を変更する場合はコードを調べて docs/KANCHO_SHIFT_LOGIC.md 側を更新し、
// このファイルのHTMLにも反映する）。ページ: /settings/kancho-logic 権限: settings.kancho-logic（閲覧のみ、.editキーなし）
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { ADMIN_PATH } from '../config';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

app.get('/settings/kancho-logic', (c) => {
  const html = `
<div class="no-print" style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
  <a href="${ADMIN_PATH}/settings/kancho" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 班長関連に戻る</a>
  <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">班長シフト ロジック仕様</h2>
</div>
<style>
  .kl-body { max-width:900px;color:#1f2937;line-height:1.75;font-size:13px; }
  .kl-lead { font-size:12px;color:#6b7280;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin-bottom:24px; }
  .kl-body h3 { font-size:15px;font-weight:800;color:#1e3a5f;margin:32px 0 10px;padding-bottom:6px;border-bottom:2px solid #dbeafe; }
  .kl-body h4 { font-size:13px;font-weight:700;color:#1e3a5f;margin:18px 0 6px; }
  .kl-body p { margin:6px 0; }
  .kl-body ul, .kl-body ol { margin:6px 0 6px 20px; padding:0; }
  .kl-body li { margin:3px 0; }
  .kl-table { width:100%;border-collapse:collapse;font-size:12px;margin:8px 0 14px; }
  .kl-table th { background:#1e3a5f;color:white;padding:6px 10px;text-align:left;font-weight:600; }
  .kl-table td { padding:6px 10px;border-bottom:1px solid #e5e7eb;vertical-align:top; }
  .kl-table tr:last-child td { border-bottom:none; }
  .kl-note { background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px 12px;font-size:12px;color:#92400e;margin:8px 0; }
  .kl-warn { background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:8px 12px;font-size:12px;color:#991b1b;margin:8px 0; }
  .kl-code { background:#f3f4f6;border-radius:4px;padding:1px 6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px; }
  .kl-toc { background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;margin-bottom:28px; }
  .kl-toc a { display:block;font-size:12px;color:#1e3a5f;text-decoration:none;padding:2px 0; }
  .kl-toc a:hover { text-decoration:underline; }
</style>

<div class="kl-body">
  <div class="kl-lead">状態: 実装済み・本番稼働中（コード調査に基づく as-built ドキュメント）。同内容はリポジトリの <span class="kl-code">docs/KANCHO_SHIFT_LOGIC.md</span> にも保存されている。</div>

  <div class="kl-toc no-print">
    <a href="#kl-1">1. データモデル</a>
    <a href="#kl-2">2. 月度ごとのコピー・伝播ロジック</a>
    <a href="#kl-3">3. 記号・勤務時間のルール</a>
    <a href="#kl-4">4. 班色ルール</a>
    <a href="#kl-5">5. 編集モード・コピペ編集モード</a>
    <a href="#kl-6">6. 名前D&amp;D並び替え・①②表開閉</a>
    <a href="#kl-7">7. 警告チェック機能</a>
    <a href="#kl-8">8. 権限モデル</a>
    <a href="#kl-9">9. 変更履歴（要点）</a>
    <a href="#kl-10">10. 実装上の注意点</a>
  </div>

  <h3 id="kl-1">1. データモデル</h3>
  <h4>kancho_members（枠＋現在の担当者を1行で表す名簿）</h4>
  <p>「行＝人」ではなく「行＝枠（役割・班色・並び順は固定）」で、担当者は月度ごとに変わり得る（2026-07-28の再設計で分離）。</p>
  <table class="kl-table">
    <tr><th>カラム</th><th>意味</th></tr>
    <tr><td>name</td><td>表示名。空き枠は「(空き枠)」固定文字列</td></tr>
    <tr><td>role</td><td>昼日勤班長／終業班長／教育班長／研修課出向／職員当直（意味を持つのはmainのみ）</td></tr>
    <tr><td>section</td><td>main（本表）／s1（①表）／s2（②表）</td></tr>
    <tr><td>sort_order</td><td>表内の並び順</td></tr>
    <tr><td>is_active</td><td>0で一覧から除外（過去シフトは残る論理削除）</td></tr>
    <tr><td>team_color</td><td>班色。2人1組の班を表す。NULL=班色なし</td></tr>
    <tr><td>is_indoor</td><td>1=内勤（表に表示）／0=乗務中（名簿には残すが非表示）</td></tr>
    <tr><td>is_rookie</td><td>「班長になって日が浅い新人班長」フラグ。当直禁忌ペアの自動判定専用。社員マスタ全体の「新人（研修中）」概念とは無関係</td></tr>
    <tr><td>year／month</td><td>名簿は月度ごとに完全独立したデータ</td></tr>
    <tr><td>emp_no</td><td>社員番号。employees.emp_noと直接紐づけ。希望休フォームの本人確認・個人別確認ページの検索キー</td></tr>
    <tr><td>slot_key</td><td>枠の月度をまたぐ同一性を追跡するキー。将来月度への自動伝播に使用（2章）</td></tr>
  </table>
  <p><span class="kl-code">prev_id</span>／<span class="kl-code">next_id</span>はテーブルの列ではない。ページ表示時にSQLで都度算出される仮想列（2-4節）。</p>

  <h4>kancho_shift_types（記号マスタ）</h4>
  <table class="kl-table">
    <tr><th>カラム</th><th>意味</th></tr>
    <tr><td>code</td><td>記号本体（直・遅など）。kancho_shifts.codeはテキストで直接保存するため、マスタを削除しても既存表示は残る</td></tr>
    <tr><td>daily_required</td><td>日別必要人数。0より大きい記号は「日別必要人数チェック行」として表に自動追加</td></tr>
    <tr><td>count_in_summary</td><td>旧集計フラグ。現在は未使用（互換のため残置のみ）</td></tr>
    <tr><td>use_team_color</td><td>1ならセル背景に班色を使う（初期値: 直・遅・早）</td></tr>
    <tr><td>counts_as_work／counts_as_off</td><td>出勤数／公休数カウント対象</td></tr>
    <tr><td>show_in_input</td><td>入力モーダルのプリセットボタンに表示するか</td></tr>
    <tr><td>year／month</td><td>記号一覧も月度ごとに独立データ</td></tr>
  </table>

  <h4>kancho_shifts（実シフトセル、1メンバー1日1件）</h4>
  <table class="kl-table">
    <tr><th>カラム</th><th>意味</th></tr>
    <tr><td>code</td><td>記号テキスト（空文字＝色マスのみの早日勤もあり得る）</td></tr>
    <tr><td>is_diagonal</td><td>斜め直（斜体表示）</td></tr>
    <tr><td>is_wish</td><td>希望休反映済み（赤文字）</td></tr>
    <tr><td>cell_color</td><td>セル個別色の上書き（他班ヘルプ等）。NULL=自動（班色 or 記号色）</td></tr>
    <tr><td>is_locked</td><td>確定ロック。1の間は内容変更をブロック</td></tr>
  </table>
  <div class="kl-warn"><b>重要な設計不変条件</b>（2026-08-08、ユーザー明示）: kancho_shiftsはmember_id（＝枠のid）に紐づいており、担当者の「人」には紐づいていない。担当者変更(<span class="kl-code">/api/kancho/members/:id/link</span>)はkancho_members.name／emp_noだけをUPDATEし、kancho_shiftsには一切触れない（コードで確認済み）。<b>人を入れ替えても、その枠に既に入力されているシフトは絶対に消えたり変わったりしてはならない</b>。唯一の例外は「並び替え（D&amp;D・sort_order変更）」で、これは枠自体の並び順を変えるだけの操作であり問題ない。</div>

  <h4>その他テーブル</h4>
  <ul>
    <li><b>kancho_memos</b>: kind=tokki（特記事項フリーテキスト）／kind=kibou（旧来のフリーテキスト希望休）。構造化されたkancho_wishesとは完全に別物（両者は同期しない）</li>
    <li><b>kancho_edit_logs</b>: actionはshift／member／type／memo／wish／notify。全編集操作を記録</li>
    <li><b>kancho_forbidden_pairs</b>: 当直禁忌ペア（member_id_a &lt; member_id_bで正規化）</li>
    <li><b>kancho_wishes</b>: 構造化希望休。「希望休を自動反映」ボタンの元データ</li>
    <li><b>kancho_wish_remarks</b>: 希望休フォームの「その他要望」欄。最新内容のみ保持（履歴なし）</li>
    <li><b>kancho_wish_notify_optin</b>: 希望休の提出・取消時に即時LINE通知する送信権限者（ロール制限なし）。0時の出勤者通知先kancho_notify_optinとは別テーブル（こちらはgeneral_manager／operations_managerのみ登録可）</li>
    <li><b>kancho_wish_settings</b>: id=1固定の単一行。募集対象月度・受付期間</li>
    <li><b>kancho_calendar_notes</b>: 個人別確認ページの「その他」自由記述欄</li>
    <li><b>kancho_crew_schedules</b>: 乗務班長用の個人スケジュール専用テーブル。現状は書き込みAPIが存在せず常に空（将来拡張の受け皿）</li>
  </ul>

  <h3 id="kl-2">2. 月度ごとのコピー・伝播ロジック</h3>
  <h4>ensureKanchoPeriod</h4>
  <p>新しい月度のページを開いたとき1回だけ実行される初期化:</p>
  <ol>
    <li>その年月のkancho_membersが0件なら、直前の月度（無ければ直後）を探し、全行を新IDでコピー（slot_keyはそのまま引き継ぎ＝同じ枠として継続）</li>
    <li>コピー元月度のkancho_forbidden_pairsのうち両者が同月度にいるペアだけ新IDにマッピングして複製</li>
    <li>kancho_shift_typesも0件ならコピー（単純複製）</li>
  </ol>

  <h4>slot_keyによる将来月度への自動伝播</h4>
  <p>「枠の設定は意図的に変更しない限り、既に開かれている将来の月度にも同じ設定を使い続ける」運用。</p>
  <ul>
    <li><b>propagateForward</b>: 対象メンバーのslot_keyが非NULLなら、既に存在するより後の月度で同じslot_keyを持つ行すべてに主要項目を一括UPDATE。呼び出し: メンバー編集・一括保存・担当者変更（移動元の空き枠化含む）・社員管理照合</li>
    <li><b>createInFuturePeriods</b>: 新規に枠を追加した時、既に存在する将来月度すべてに同じslot_keyの空き枠を複製挿入</li>
  </ul>
  <div class="kl-note">枠の編集はすべてslot_keyをキーに「未来の既存月度」へ伝播する。過去月度へは伝播しない。伝播先の月度自体がまだ開かれていなければensureKanchoPeriod実行時にコピーされる。</div>

  <h4>rowMatchSql（月またぎのグレー表示・氏名照合）</h4>
  <p>ページ表示SELECT時にのみ計算される読み取り専用のprev_id／next_id。emp_noが紐付いていればそれを最優先で前後月度から照合、未紐付けならsection／team_color／role／sort_orderの完全一致でフォールバック。自分のセルが空の場合だけ補完表示する（保存は常に自分のID宛て、視覚効果のみ）。</p>
  <p>旧「表示名の旧名→新名矢印」ロジックは2026-08-08に廃止済み。現在は常にkancho_members.nameをそのまま表示する。</p>

  <h4>印刷ページも前後3日分を表示（2026-08-08実装）</h4>
  <p>終業班長の締め日ずれ（3-6節）等のイレギュラーを確認できるよう、印刷ページも通常のシフト表画面と同じgetShiftDisplayRange（月度の前後3日）・prev_id/next_id照合を適用するように変更した。以前は印刷は月度内の日付のみで前後の余白日を含めなかった。月度外の日付列はヘッダーを半透明にして参考表示であることを示す。</p>

  <h3 id="kl-3">3. 記号・勤務時間のルール</h3>
  <table class="kl-table">
    <tr><th>記号／状態</th><th>時間帯</th></tr>
    <tr><td>直（通常）</td><td>9:00〜翌3:00</td></tr>
    <tr><td>直（斜め直・斜体表示）</td><td>14:00〜翌8:00</td></tr>
    <tr><td>遅</td><td>10:00〜19:00</td></tr>
    <tr><td>終業班長の空白＋班色（出勤扱い）</td><td>3:00〜12:00固定</td></tr>
    <tr><td>記号なし＋色付き（早日勤、役職不問）</td><td>7:30〜16:30</td></tr>
    <tr><td>空白（白マス）</td><td>未入力</td></tr>
  </table>

  <h4>セル背景色の決定優先順位</h4>
  <ol>
    <li>セル個別色上書き（他班ヘルプ等）が最優先</li>
    <li>記号がuse_team_colorかつ本人にteam_colorがあれば班色</li>
    <li>それ以外は記号マスタのcolor</li>
    <li>記号もセル個別色も無い完全な空欄は白＝未入力</li>
  </ol>
  <p>「早日勤で出勤」は記号なし＋cell_colorのみの状態として明示保存される。班色未設定なら保存を拒否しトースト表示。</p>

  <h4>「明」記号の廃止</h4>
  <p>「明」記号は制度上廃止され既存データは「非」へ一括変換済み。以降「非」記号が常に「明け」を意味する（個人別確認ページでは表示ラベルを「明け」に上書き表示）。</p>

  <h4>直の翌日に非を自動セット</h4>
  <p>以下3箇所で同一ロジック（重複実装）:</p>
  <ol>
    <li>通常のセル編集モーダル適用時: 直のセル確定後、翌日セルが白（未入力かつcell_colorも無し）でロックされていない場合のみ非を自動セット（斜め直ならis_diagonalも引き継ぐ）</li>
    <li>コピペ編集モードでの貼り付け時も同条件で発火</li>
    <li>「希望休を自動反映」実行時: 既存の直セルを全走査し、翌日が空白かつロックされていなければ非を自動設定（翌日に希望休が既にあれば公休優先でスキップ）</li>
  </ol>
  <div class="kl-note">いずれも確定（ロック）済みのセルには自動セットしない。</div>

  <h4>出勤・公休カウント（右端固定4列）</h4>
  <p>固定4列: 出勤／公休／直／遅。直列は<b>斜め直も同じ「直」コードなので合算される</b>。日別必要人数チェック行はdaily_required&gt;0の記号のみ表示、当日のmainセルで記号一致数をカウントしn/req表示、一致すれば緑、不一致なら赤。</p>

  <h4>斜め直・終業班長の運用ルール（2026-08-08追記、ユーザー説明）</h4>
  <p>斜め直（14:00〜翌8:00）と終業班長固定勤務（3:00〜12:00）の関係には、以下の実運用ルールがある。</p>
  <ul>
    <li><b>斜め直当日の12:00〜14:00の穴</b>: 終業班長は12:00に勤務終了、斜め直は14:00開始のため、同じ日に終業班長が出勤し、かつ夜から斜め直が入る場合、12:00〜14:00はどちらの勤務者もカバーしていない空白時間になる。この穴は、同じ課の別の昼日勤班長がその日に早日勤または遅日勤で出勤することで埋める必要がある（例: 18日に黄色＝2課の1人が斜め直に入るなら、もう1人の黄色枠の昼日勤班長がその日に早日勤か遅日勤で出勤している必要がある）。</li>
    <li><b>斜め直は終業班長に休みを与えるための勤務</b>: 斜め直が入った日の翌日は、その課の終業班長は休みになる（休みにするために斜め直を組む、という因果関係）。斜め直は翌朝8:00までしかカバーしないため、終業班長が休みのその翌日は8:00以降（本来なら終業班長が12:00まで担当する時間帯）も同じ課の別の昼日勤班長が早日勤として出勤している必要がある。これは既存の警告チェック（7章「課の3:00〜12:00カバレッジ」）の「前日斜め直＋当日同課の日勤→実質カバー」ヒューリスティックと整合する内容で、このヒューリスティックが存在する理由そのものにあたる。</li>
    <li><b>終業班長の勤務パターン</b>: 終業班長は当直・遅番等を持たず全て日勤（3:00〜12:00固定）のみ。月間の出勤日数は色付きマス（早日勤と同じ形式のセル）が25個あれば足りる。</li>
    <li><b>締め日と終業班長シフトの1日ずれ</b>: 締め日が17日（18日始まり）の運用で、その社員が17日に出勤した場合、その勤務実績は「18日の終業班長枠」の実績として扱う。つまり終業班長の枠だけ、表示上シフトが1日後ろにずれる（他の役職にはこのずれは無い）。</li>
  </ul>
  <div class="kl-note">2026-08-08実装: 「斜め直当日の12:00〜14:00の穴」を検知する自動警告を追加した（詳細は7章参照）。</div>

  <h3 id="kl-4">4. 班色ルール</h3>
  <ul>
    <li>班色初期値: 黄緑・黄色・水色・ピンク（以後は枠編集で自由設定）。色選択肢には赤・グレー・白も追加</li>
    <li>班色系記号（公・非・指公・○・直・遅・早）は素の記号色を白にし、実際の色は班色／セル個別色で決める。採・夏・Mは赤固定（休暇系を目立たせる）</li>
    <li>名前セル左端の縦バーで班色を可視化</li>
    <li>警告チェックの「課」判定（7章）はteam_colorを課色マップ（黄緑=1課、黄色=2課、水色=3課、ピンク=4課）にマッピングして使う。カスタム色は課判定の対象外</li>
    <li>セル個別色は「他班ヘルプ等」用途で班色・記号色より常に優先</li>
  </ul>

  <h3 id="kl-5">5. 編集モード・コピペ編集モード</h3>
  <h4>通常編集モード</h4>
  <ul>
    <li>セルタップでモーダルを開き、記号自由入力欄＋プリセットボタン・斜め直チェック・希望休反映チェック・セル色セレクト・ロックチェックを操作</li>
    <li>ロック中は記号入力・斜め直・希望休・色・クリア・プリセットをすべて無効化し、ロックのON/OFF自体と前後日付ナビだけ操作可能</li>
    <li>保存はローカルに溜め、「一括保存」でまとめて送信。ロック済みかつ内容変更ありのセルはサーバー側でブロックされ保存されない</li>
  </ul>
  <h4>コピペ編集モード</h4>
  <ul>
    <li>コピー元セル選択→貼り付け先を連続タップ、記号・斜め・希望休・セル色を丸ごとコピー</li>
    <li>ロック済みセルへの貼り付けは拒否。貼り付けた記号が直ならここでも「翌日に非」自動セットが発火</li>
  </ul>

  <h3 id="kl-6">6. 名前D&amp;D並び替え・①②表開閉</h3>
  <ul>
    <li><b>名前D&amp;D並び替え</b>: 編集モード中のみ有効。同じ表かつmainは同じ役割グループ内のみ並び替え可。ドロップした瞬間に即時保存（一括保存ボタン待ちではない）</li>
    <li><b>①②表の開閉トグル</b>: 見出しクリックで表全体を開閉。状態はDBでなくブラウザのlocalStorageに保存＝自分のブラウザだけ記憶、他の人の表示には影響しない</li>
    <li><b>印刷ボタンの位置（2026-08-08変更）</b>: 以前はツールバーに常設ボタンがあったが、⚙️歯車メニュー内の先頭項目（「印刷」）に格納された。閲覧権限のみでも利用可能</li>
  </ul>

  <h3 id="kl-7">7. 警告チェック機能</h3>
  <p>すべて警告表示のみで<b>保存はブロックしない</b>。対象はmain表かつ有効かつ内勤のメンバーのみ、①②表は対象外。</p>
  <ol>
    <li><b>当直・遅日勤の頭数不足</b>: 記号マスタのdaily_required（直=2、遅=1が初期値）と当日の実カウントを比較</li>
    <li><b>当直の禁忌ペア</b>: 当日の当直メンバー全組み合わせをチェック。新人班長フラグが両者ともONなら自動警告（登録不要）、加えて個別登録済みの禁忌ペアも理由付きで警告</li>
    <li><b>課の3:00〜12:00カバレッジ</b>: 各課の終業班長のうち誰か1人でも当日出勤していればカバー済み。カバー外の場合は「前日斜め直＋当日同課の日勤」で実質カバーとみなすヒューリスティック救済判定を追加で行う</li>
    <li><b>斜め直当日の12:00〜14:00カバレッジ（2026-08-08実装）</b>: 終業班長が当日出勤しており（3.でカバー済み判定）、かつ同課の誰かがその日に斜め直で入っている場合、終業班長の勤務終了(12:00)〜斜め直の開始(14:00)は誰もカバーしない穴になる。同課の別メンバー（終業班長本人は除外。終業班長の空欄＋班色セルは早日勤とデータ表現が同一のため誤カウントしないよう明示的に除く）がその日に遅日勤・早日勤・通常直（非斜め）のいずれかで出勤していればカバー済み。無ければ警告</li>
    <li><b>連勤検知</b>: 出勤（出勤扱いの記号・非・早日勤色マス）を日付順にカウントし、<b>連続10日に達した時点で警告</b>（明けも連勤日数に含む）</li>
  </ol>
  <div class="kl-warn">連勤警告の閾値は実装上「10連勤」。企画段階のヒアリングでは「7日間以上」という案もあったが、コード・UI文言とも一貫して10連勤で実装されている。</div>
  <div class="kl-note"><b>課の判定は日別の実効班色ベース（2026-08-08修正）</b>: 3.・4.の「課」グルーピングは、以前はメンバーのteam_color（月を通じて固定）だけで判定していたが、「1課の班長がその日だけ2課を手伝う」といった臨時のクロス課対応があり得る（ユーザー明示）ため、日別に「その日のセルのcell_color（他班ヘルプ用の個別色上書き）があればそちらを優先し、無ければteam_color」で所属課を判定するように修正した。ある班長がその日だけcell_colorを他課の色にして手伝った場合、その日はその課の一員として頭数・カバレッジ判定に数えられる（元の課には数えられない）。「前日斜め直」の判定も同様に前日時点の実効班色で再判定する。</div>

  <h3 id="kl-8">8. 権限モデル</h3>
  <p>admins.permissionsがNULLなら全権限。JSON配列を持つ制限アカウントは、キーXで閲覧(GET)のみ、X.editが無ければ非GETは全て拒否。</p>
  <table class="kl-table">
    <tr><th>キー</th><th>対象パス</th><th>用途</th></tr>
    <tr><td>kancho-shift</td><td>/kancho-shift（本体・印刷・個人別確認含む）、/api/kancho/*</td><td>班長シフト表の閲覧全般</td></tr>
    <tr><td>kancho-shift.edit</td><td>同上の非GET</td><td>シフト保存・名簿/記号編集・希望休登録など</td></tr>
    <tr><td>settings.kancho</td><td>/settings/kancho（ハブページ）</td><td>班長関連メニューのトップ</td></tr>
    <tr><td>settings.kancho-roster／.edit</td><td>/settings/kancho-roster, /api/kancho-roster*</td><td>班長リスト閲覧／班長登録解除の編集</td></tr>
    <tr><td>settings.kancho-wish／.edit</td><td>/settings/kancho-wish, /api/kancho-wish-settings*</td><td>希望休フォーム設定閲覧／編集</td></tr>
    <tr><td>settings.kancho-logic</td><td>/settings/kancho-logic</td><td>このロジック仕様書ページの閲覧（編集操作なしのため.editキーは無い）</td></tr>
  </table>
  <p>個人別確認ページのAPI(/api/kancho-personal/*)は例外的にグローバルの.edit必須ルールをバイパスし、閲覧権限（kancho-shift）のみでその他メモの書き込みまで許可する特殊対応になっている。</p>

  <h3 id="kl-9">9. 変更履歴（要点のみ）</h3>
  <ul>
    <li><b>2026-07-18</b>: 確定仕様策定。メイン表＋①②表＋自動集計＋特記事項＋希望休メモをWeb化する範囲を決定</li>
    <li><b>2026-07-19</b>: 記号ルール確定（明の廃止・直翌日の非自動セット・早日勤の空白+色ルール）、コピペ編集モード、希望休枠＋0時LINE通知</li>
    <li><b>2026-07-26</b>: 新人班長フラグ＋当直禁忌ペア、警告チェック機能、名簿・記号の月度別データ化、希望休フォーム全面リニューアル</li>
    <li><b>2026-07-27</b>: グレー日付の自動反映を人単位リンクから行ベース照合に変更</li>
    <li><b>2026-07-28</b>: 「枠」と「担当者」を分離する再設計（重複行事故の反省）。slot_keyによる将来月度への自動伝播を新設。班長リストを「班長登録の解除専用」に整理</li>
    <li><b>2026-08-05</b>: ⭐カレ（LIFF個人カレンダー）を廃止し「個人別確認」Webページに置き換え</li>
    <li><b>2026-08-08</b>: 枠設定ページを廃止しシフト表内モーダルへ統合。名前D&amp;D並び替え、①②表開閉トグル、旧名→新名矢印表示を廃止</li>
    <li><b>2026-08-08（追加）</b>: ロジック仕様書を作成し設定ページから閲覧可能に。印刷ページに前月度・次月度の枠（前後3日）の参考表示を追加。斜め直・終業班長の運用ルール、枠とシフトの結合原則をユーザーヒアリングに基づき文書化</li>
    <li><b>2026-08-08（さらに追加）</b>: 斜め直当日の12:00〜14:00カバレッジ警告を新規実装。課の判定を月固定のteam_colorから日別の実効班色（cell_color優先）に変更し、1課の班長が臨時で2課を手伝う等のクロス課対応を反映できるようにした。印刷ボタンをツールバーから⚙️歯車メニュー内に移動</li>
  </ul>

  <h3 id="kl-10">10. 実装上の注意点</h3>
  <ol>
    <li>count_in_summaryは現在未使用（互換のため残置のみ）。出勤/公休/直/遅カウントはcounts_as_work／counts_as_off／コード直接比較で行う</li>
    <li>kancho_memos(kind=kibou、フリーテキスト希望休)とkancho_wishes(構造化希望休)は名前が紛らわしいが完全に別データ・別UI</li>
    <li>kancho_crew_schedules（乗務班長の個人スケジュール）は現時点で書き込みAPIが存在せず、常に空テーブル</li>
    <li>prev_id／next_idはDBカラムではなく表示時に動的計算される仮想フィールド</li>
    <li>連勤警告の閾値は実装上「10連勤」。運用上どちらが正しいかは要確認</li>
  </ol>
</div>`;
  return c.html(layout('班長シフト ロジック仕様', html, 'settings'));
});

export default app;
