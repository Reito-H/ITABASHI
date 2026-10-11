# チュートリアルに載せる画面写真の撮影リスト（どのページを・どこに赤丸を付けて撮るか）。
# python3 spec.py で spec.json を書き出し、shoot.py に渡す。詳細は README.md
import json
A = '/s7db8q6wys/admin'
def M(sel, label=None): return {'sel': sel, 'label': label}
NAV = lambda t: f'#sidebar a:has-text("{t}")'
spec = [
  # ログイン（PC）
  {'name': 'login', 'url': A + '/login?mode=pc', 'fresh': True, 'wait': 800,
   'marks': [M('input[placeholder=ID]', 1), M('input[type=password]', 2), M('button[type=submit]', 3), M('a:has-text("スマホ表示に切り替える")', 4)]},
  # ホーム
  {'name': 'home', 'url': A, 'marks': [M('input[placeholder*="社員名"]', 1), M('text=今日のオペレーション', 2), M('text=よく使う機能', 3), M('#report-fab-btn', 4), M('#phone-search-toggle-btn', 5), M('.desktop-header [aria-label*="お知らせ"], .desktop-header button, .notify-bell, #notify-bell', 6)]},
  # 画面の見方（サイドバー）
  {'name': 'sidebar', 'url': A, 'clip': '#sidebar', 'marks': [M(NAV('ホーム'), 1), M(NAV('引き継ぎシート'), 2), M(NAV('報告センター'), 3), M(NAV('点検管理'), 4), M(NAV('設定'), 5), M('#sidebar a:has-text("ポータル"), #nav-portal-trigger', 6), M(NAV('ログアウト'), 7)]},
  {'name': 'portal_menu', 'url': A, 'pre': ['click:#nav-portal-trigger', 'wait:0.8'], 'clip': '#sidebar'},
  # 右下ボタン
  {'name': 'fab_report', 'url': A, 'pre': ['click:#report-fab-btn', 'wait:1'], 'marks': [M('#qr-panel', 1)]},
  {'name': 'tel_search', 'url': A, 'pre': ['click:#phone-search-toggle-btn', 'wait:0.8'], 'marks': [M('#phone-search-input', 1), M('#phone-search-toggle-btn', 2)]},
  # 引き継ぎシート
  {'name': 'handover', 'url': A + '/handover', 'wait': 2000,
   'marks': [M(':text("板橋1課")', 1), M('button:has-text("翌日")', 2), M('button:has-text("やることリスト")', 3), M('button:has-text("リミット")', 4), M('button:has-text("車両管理")', 5), M('button:has-text("メーター検査")', 6), M('button:has-text("当欠記録を見る")', 7)]},
  {'name': 'handover_todo', 'url': A + '/handover', 'wait': 2000, 'pre': ['click:button:has-text("やることリスト")', 'wait:1.5']},
  {'name': 'handover_vehicle', 'url': A + '/handover', 'wait': 2000, 'pre': ['click:button:has-text("車両管理")', 'wait:1.5']},
  # 報告センター
  {'name': 'reports', 'url': A + '/settings/reports', 'wait': 1500,
   'marks': [M('a.rc-chip:has-text("すべて")', 1), M('a.rc-chip:has-text("対応中")', 2), M('button:has-text("忘れ物を登録")', 3), M('tr[onclick] >> nth=0', 4), M('tr[onclick] a:has-text("印刷") >> nth=0', 5)]},
  {'name': 'reports_new', 'url': A + '/settings/reports', 'wait': 1500, 'pre': ['click:button:has-text("忘れ物を登録")', 'wait:1.2']},
  {'name': 'reports_detail', 'url': A + '/settings/reports', 'wait': 1500, 'pre': ['click:tr[onclick] td >> nth=1', 'wait:1.5']},
  # 点検管理
  {'name': 'inspection', 'url': A + '/inspection', 'wait': 1500,
   'marks': [M('select:near(:text("年月"))', 1), M('button:has-text("1課")', 2), M('text=月次入力', 3), M('text=点検車検確認表', 4), M('text=メーター検査', 5), M('text=車検管理', 6), M('button:has-text("使用不可期間を追加")', 7)]},
  # 班長シフト
  {'name': 'kancho_shift', 'pre': ["eval:(()=>{const re=/^[一-龥々ァ-ヶー]{1,5}[ \u3000]+[一-龥々ァ-ヶー]{1,5}$/;for(const el of document.querySelectorAll('td,span,div,b,strong,a,label')){if(el.childElementCount===0&&re.test(el.textContent.trim())){el.style.filter='blur(6px)';}}})()"], 'url': A + '/kancho-shift', 'wait': 2000,
   'marks': [M('button:has-text("編集モードを開始")', 1), M('button:has-text("コピペ編集モード")', 2), M(':text("個人別確認")', 3), M('button:has-text("警告チェック")', 4), M('button:has-text("希望休")', 5), M('a.btn-nav-sm:has-text("◀")', 6)]},
  # 課長・職員シフト
  {'name': 'kanri_kobo', 'url': A + '/kanri-kobo', 'wait': 2000,
   'marks': [M('button:has-text("公休予定表")', 1), M('button:has-text("土日責任者")', 2), M('button:has-text("当直回数")', 3), M('button:has-text("編集モードを開始")', 4), M('a.kk-btn:has-text("印刷")', 5), M('.kk-btn:has-text("Excel取込")', 6), M('button.kk-btn:has-text("名簿")', 7)]},
  # 社員管理
  {'name': 'staff', 'pre': ["eval:(()=>{const re=/^[一-龥々ァ-ヶー]{1,5}[ \u3000]+[一-龥々ァ-ヶー]{1,5}$/;for(const el of document.querySelectorAll('td,span,div,b,strong,a,label')){if(el.childElementCount===0&&re.test(el.textContent.trim())){el.style.filter='blur(6px)';}}})()"], 'url': A + '/staff', 'wait': 1500,
   'marks': [M('input[placeholder*="氏名"]', 1), M('a.flt-tab:has-text("在籍")', 2), M(':text("詳細検索")', 3), M(':text("新規登録")', 4), M('a:has-text("乗務員シフト")', 5), M('table tbody tr:first-child', 6)]},
  {'name': 'staff_karte', 'url': A + '/staff/1', 'wait': 2000},
  # 総合新人管理
  {'name': 'newcomers', 'url': A + '/newcomers', 'marks': [M('a:has-text("新人シフト管理")', 1), M('a:has-text("新人リスト")', 2), M('a:has-text("フォローリスト")', 3), M('a:has-text("面談管理")', 4)]},
  {'name': 'newcomer_shift', 'url': A + '/shift', 'wait': 2000},
  # 課長ミッション
  {'name': 'kacho_mission', 'url': A + '/kacho-mission', 'marks': [M('a:has-text("労共契約")', 1), M('a:has-text("納金簿")', 2), M('a:has-text("乗務員証")', 3), M('a:has-text("ヒヤリハット")', 4)]},
  # AI売上分析
  {'name': 'sales_ai', 'url': A + '/sales-ai', 'wait': 2000, 'marks': [M('text=全社サマリー', 1), M('text=新人成長', 2), M('text=売上予想カレンダー', 3), M('text=運賃改定影響分析', 4), M('text=期間比較', 5), M('button:has-text("前月度")', 6)]},
  # 事故分析
  {'name': 'accidents', 'url': A + '/accidents', 'wait': 1500, 'marks': [M('text=月次一覧', 1), M('text=分析・ランキング', 2), M('text=予測カレンダー', 3), M('text=個人別レポート', 4), M('text=事故防止AI', 5), M('button:has-text("CSVインポート")', 6)]},
  # 板橋ページ
  {'name': 'study_sessions', 'url': A + '/settings/study-sessions', 'wait': 1500, 'marks': [M('text=イベント 参加申し込み', 1), M('text=ご意見版', 2), M('text=ヒヤリハット', 3), M('text=アンケート', 4), M('text=台本', 5), M('button:has-text("コピー")', 6), M('text=新しいイベントを作成', 7)]},
  # ポータル
  {'name': 'attendance_board', 'pre': ["eval:(()=>{const re=/^[一-龥々ァ-ヶー]{1,5}[ \u3000]+[一-龥々ァ-ヶー]{1,5}$/;for(const el of document.querySelectorAll('td,span,div,b,strong,a,label')){if(el.childElementCount===0&&re.test(el.textContent.trim())){el.style.filter='blur(6px)';}}})()"], 'url': A + '/attendance-board', 'wait': 1500, 'marks': [M('a:has-text("今日")', 1), M('a:has-text("全課")', 2), M('input[type=checkbox]', 3), M('button:has-text("印刷")', 4)]},
  {'name': 'personal_shift', 'pre': ["eval:(()=>{const re=/^[一-龥々ァ-ヶー]{1,5}[ \u3000]+[一-龥々ァ-ヶー]{1,5}$/;for(const el of document.querySelectorAll('td,span,div,b,strong,a,label')){if(el.childElementCount===0&&re.test(el.textContent.trim())){el.style.filter='blur(6px)';}}})()"], 'url': A + '/personal-shift', 'wait': 1500, 'marks': [M('input[placeholder*="氏名"]', 1), M('button:has-text("見る")', 2), M('button:has-text("取込実行")', 3)]},
  {'name': 'benri', 'url': A + '/benri', 'marks': [M('a:has-text("高速料金")', 1), M('a:has-text("空港・ディズニー")', 2), M('a:has-text("車庫見取り図")', 3), M('a:has-text("羽田空港")', 4)]},
  {'name': 'shuttle', 'url': A + '/shuttle', 'marks': [M('text=次の便', 1), M('button:has-text("便を追加")', 2)]},
  # 設定
  {'name': 'settings', 'url': A + '/settings', 'marks': [M('a:has-text("要望欄")', 1), M('a:has-text("管理者項目")', 2), M('a:has-text("シフト関連の設定")', 3), M('a:has-text("チュートリアル")', 4), M('a:has-text("サイバー")', 5)]},
  {'name': 'admin_tools', 'url': A + '/settings/admin-tools'},
  {'name': 'shift_settings', 'url': A + '/settings/shift'},
  {'name': 'documents', 'url': A + '/settings/documents', 'marks': [M('button:has-text("資料")', 1), M('button:has-text("社員CSV")', 2), M('button:has-text("点検写真AI取込")', 3), M('button:has-text("乗務員シフトPDF")', 4), M('button:has-text("動態表")', 5), M('button:has-text("資料を追加")', 6)]},
  {'name': 'announcements', 'url': A + '/announcements', 'marks': [M('input[placeholder*="研修スケジュール"]', 1), M('textarea', 2), M('text=配信先', 3), M('text=配信対象', 4)]},
  {'name': 'line', 'url': A + '/line', 'marks': [M('a:has-text("LINE連携ページを開く")', 1), M('button:has-text("全員に配信する")', 2)]},
  {'name': 'liff_settings', 'url': A + '/settings/liff', 'wait': 1500},
  {'name': 'accounts', 'url': A + '/settings/accounts', 'marks': [M('button:has-text("権限編集")', 1), M('button:has-text("パスワード再設定")', 2), M('text=新規アカウント作成', 3)]},
  {'name': 'cyber', 'url': A + '/settings/cyber', 'wait': 1500},
  {'name': 'cc_list', 'url': A + '/cc-list', 'marks': [M('input[type=password]', 1)]},
  # スマホ表示
  {'name': 'sp_home', 'url': A, 'viewport': [390, 844], 'marks': [M('.hamburger', 1)]},
  {'name': 'sp_menu', 'url': A, 'viewport': [390, 844], 'pre': ['click:.hamburger', 'wait:0.8']},
]
import os
json.dump(spec, open(os.path.join(os.path.dirname(__file__), 'spec.json'), 'w'), ensure_ascii=False, indent=1)
print(len(spec))
