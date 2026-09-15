"""
S.RIDE管理画面（web.sride.taxi）APIの疎通検証スクリプト。

docs/SRIDE_API.md に記載した非公式APIが、実際にログイン〜データ取得まで
通るかを確認するためのもの。本番バッチ等には使わないこと（あくまで検証用）。

使い方:
    export SRIDE_USERNAME='k-yamashita@km-group.jp'
    export SRIDE_PASSWORD='********'
    python3 scripts/sride_api/verify_sride_api.py

    # 注文一覧の取得期間を変えたい場合
    python3 scripts/sride_api/verify_sride_api.py --date-from 2026-09-01 --date-to 2026-09-02

注意: パスワードをこのファイルや他のスクリプトに直接書き込まないこと。
必ず環境変数（またはシェルのヒストリに残らない方法）で渡すこと。

必要パッケージ: requests (pip install requests)
"""
from __future__ import annotations

import argparse
import hashlib
import html
import os
import re
import sys
from datetime import datetime
from urllib.parse import urljoin

import requests

AUTH_BASE = "https://auth.sride.jp"
API_BASE = "https://api.sride.taxi"
WEB_BASE = "https://web.sride.taxi"

LOGIN_FORM_ACTION_RE = re.compile(r'<form[^>]+id="kc-form-login"[^>]+action="([^"]+)"')

# ブラウザに近いヘッダーを送る（WAF等がbotとみなして弾く可能性を減らすため）
BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
}

REDIRECT_STATUSES = (301, 302, 303, 307, 308)


class SrideApiError(RuntimeError):
    pass


def login(session: requests.Session, username: str, password: str, verbose: bool = True) -> None:
    """
    docs/SRIDE_API.md の認証フローを1ホップずつ手動で辿る。

    requestsの自動リダイレクト追従(allow_redirects=True)だと、途中で想定外の
    URLに飛んだ場合にどこで失敗したか分からなくなるため、あえて1つずつ追う。
    """

    def session_fingerprint() -> str:
        # SESSION Cookieの値そのものは出さず、変化の有無だけ追えるように短縮ハッシュにする
        val = session.cookies.get("SESSION", domain="api.sride.taxi")
        if val is None:
            val = session.cookies.get("SESSION")
        if val is None:
            return "SESSION=(none)"
        return f"SESSION=…{hashlib.sha256(val.encode()).hexdigest()[:8]}"

    def hop(method: str, url: str, **kwargs) -> requests.Response:
        before = session_fingerprint()
        resp = session.request(method, url, allow_redirects=False, timeout=15, **kwargs)
        if verbose:
            location = resp.headers.get("Location", "")
            set_cookie_names = [c.name for c in resp.cookies]
            after = session_fingerprint()
            print(f"    [login] {method} {url}")
            print(f"            -> {resp.status_code} {location}")
            print(f"            cookie前: {before} / cookie後: {after} / Set-Cookie: {set_cookie_names}")
        return resp

    redirect_manager_url = f"{API_BASE}/v2/redirect/manager"
    url = redirect_manager_url
    method = "GET"
    kwargs: dict = {}
    login_attempted = False
    redirect_manager_retry_used = False

    for _hop_count in range(1, 16):
        resp = hop(method, url, **kwargs)

        if resp.status_code in REDIRECT_STATUSES:
            location = resp.headers.get("Location")
            if not location:
                raise SrideApiError(
                    f"{resp.status_code} 応答だがLocationヘッダーが無い（url={url}）"
                )
            url = urljoin(url, location)
            method, kwargs = "GET", {}
            continue

        if resp.status_code == 200 and "kc-form-login" in resp.text:
            if login_attempted:
                raise SrideApiError(
                    "ログインフォームに戻された＝ユーザー名またはパスワードが違う可能性"
                )
            m = LOGIN_FORM_ACTION_RE.search(resp.text)
            if not m:
                raise SrideApiError("ログインフォームのaction URLが見つからない（HTML構造が変わった可能性）")
            url = html.unescape(m.group(1))
            method = "POST"
            kwargs = {"data": {"username": username, "password": password, "credentialId": ""}}
            login_attempted = True
            continue

        # リダイレクトでもログインフォームでもない = ひとまずの着地点。
        # ログイン成功直後の着地点は環境によって "/" 等になり得る（実機ブラウザのHARでも
        # /v2/redirect/manager に2回アクセスして初めて web.sride.taxi に着地していた）。
        # まだ web.sride.taxi に到達しておらず、ログイン済みなら /v2/redirect/manager を
        # 1回だけ叩き直す。
        if url.rstrip("/") != WEB_BASE.rstrip("/") and not url.startswith(WEB_BASE):
            if login_attempted and not redirect_manager_retry_used:
                redirect_manager_retry_used = True
                url = redirect_manager_url
                method, kwargs = "GET", {}
                continue
            if resp.status_code >= 400:
                raise SrideApiError(
                    f"想定外のエラー応答 {resp.status_code}（url={url}）。"
                    "リダイレクトの連鎖がどこかで切れている可能性が高い。上のログを確認すること。"
                )
        break
    else:
        raise SrideApiError("リダイレクトが15回を超えた（無限ループの可能性）")

    if "SESSION" not in session.cookies.get_dict():
        raise SrideApiError(
            f"ログイン処理は完了したがSESSION Cookieが無い（最終URL={url}, status={resp.status_code}）"
        )


def check(label: str, ok: bool, detail: str = "") -> bool:
    mark = "OK " if ok else "NG "
    print(f"[{mark}] {label}" + (f" - {detail}" if detail else ""))
    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date-from", default=None, help="注文検索の開始日 (YYYY-MM-DD)。省略時は当日")
    parser.add_argument("--date-to", default=None, help="注文検索の終了日 (YYYY-MM-DD)。省略時は当日")
    parser.add_argument("--quiet", action="store_true", help="ログイン時のホップ単位ログを表示しない")
    args = parser.parse_args()

    username = os.environ.get("SRIDE_USERNAME")
    password = os.environ.get("SRIDE_PASSWORD")
    if not username or not password:
        print("環境変数 SRIDE_USERNAME / SRIDE_PASSWORD を設定してください。", file=sys.stderr)
        return 2

    today = datetime.now().date()
    date_from = args.date_from or today.isoformat()
    date_to = args.date_to or today.isoformat()

    session = requests.Session()
    session.headers.update(BROWSER_HEADERS)
    session.headers.update(
        {
            "Origin": WEB_BASE,
            "Referer": f"{WEB_BASE}/",
        }
    )

    all_ok = True

    try:
        login(session, username, password, verbose=not args.quiet)
    except (requests.RequestException, SrideApiError) as e:
        check("ログイン", False, str(e))
        return 1
    all_ok &= check("ログイン（SESSION Cookie取得）", True)

    # /v2/auth/userinfo
    try:
        r = session.get(f"{API_BASE}/v2/auth/userinfo", timeout=15)
        data = r.json()
        ok = r.status_code == 200 and "email" in data
        all_ok &= check("GET /v2/auth/userinfo", ok, f"email={data.get('email')}")
    except (requests.RequestException, ValueError) as e:
        all_ok &= check("GET /v2/auth/userinfo", False, str(e))

    # /v2/order/accounts
    try:
        r = session.get(
            f"{API_BASE}/v2/order/accounts",
            params={
                "email_keyword": username,
                "include_organization": "true",
                "include_relation_all_type": "true",
            },
            timeout=15,
        )
        data = r.json()
        ok = r.status_code == 200 and data.get("totalCount", 0) >= 1
        all_ok &= check("GET /v2/order/accounts", ok, f"totalCount={data.get('totalCount')}")
    except (requests.RequestException, ValueError) as e:
        all_ok &= check("GET /v2/order/accounts", False, str(e))

    # /v2/order/orders (1ページ目のみ)
    try:
        r = session.get(
            f"{API_BASE}/v2/order/orders",
            params={
                "page": 1,
                "sort": "desc",
                "order_date_from": f"{date_from}T00:00",
                "order_date_to": f"{date_to}T23:59",
                "order_statuses": "",
            },
            timeout=15,
        )
        data = r.json()
        ok = r.status_code == 200 and "data" in data
        all_ok &= check(
            "GET /v2/order/orders",
            ok,
            f"totalCount={data.get('totalCount')} 件 ({date_from}〜{date_to})",
        )
        if ok and data["data"]:
            required_fields = {
                "order_date", "order_type", "order_status", "car_dispatch_status",
                "order_no", "actual_fare", "payment_method", "settlement_type",
            }
            missing = required_fields - set(data["data"][0].keys())
            all_ok &= check("orders レスポンスの必須フィールド", not missing, f"missing={missing}" if missing else "")
    except (requests.RequestException, ValueError) as e:
        all_ok &= check("GET /v2/order/orders", False, str(e))

    # /v2/order/orders/csv (件数だけ確認、本文は保存しない)
    try:
        r = session.get(
            f"{API_BASE}/v2/order/orders/csv",
            params={
                "order_date_from": f"{date_from}T00:00",
                "order_date_to": f"{date_to}T23:59",
                "order_statuses": "",
            },
            timeout=30,
        )
        ok = r.status_code == 200 and r.headers.get("content-type", "").startswith("text/csv")
        line_count = r.text.count("\n")
        all_ok &= check("GET /v2/order/orders/csv", ok, f"{line_count}行（ヘッダー含む）")
    except requests.RequestException as e:
        all_ok &= check("GET /v2/order/orders/csv", False, str(e))

    print()
    print("全体結果:", "OK" if all_ok else "一部NG")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
