#!/usr/bin/env python3
"""
板橋タクシー 乗降ピンデータ収集スクリプト（km-operator → ホシコン）

WindowsのPowerShell版(collect.ps1)の代わりに、Mac/Linuxでそのまま動くPython版。

重要: km-operatorは "X-CLTFT-Token" という独自ヘッダーを使った、毎回のやりとりで
値が変わる合言葉方式の認証を行っている。サーバーの応答ヘッダーに次回用の新しい値が
入っているので、それを次のリクエストのヘッダーとして送り返す必要がある
（Cookieだけでは認証が通らず401になることを実機検証で確認済み）。

使い方:
    python3 collect.py
"""
import json
import sys
import time
import urllib.request
import urllib.parse
import http.cookiejar
from datetime import datetime

HOSHIKON_BASE = "https://bentenclub.com"
UPLOAD_KEY = "pqHXGmaxfSIsakMPDTZcD6cNrEBsam6e"
KM_LOGIN_ID = "itabashi1"
KM_PASSWORD = "1111"

KM_BASE = "https://km-operator.smartaxicenter.com"
BATCH_SIZE = 20
SLEEP_SEC = 0.3

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"

# 回転する合言葉（X-CLTFT-Token）を保持する
_token_state = {"token": None}


def log(msg):
    print(f"{datetime.now():%Y-%m-%d %H:%M:%S} {msg}")


def http_get_json(url, headers=None):
    h = {"User-Agent": UA, **(headers or {})}
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=15) as res:
        return json.loads(res.read().decode("utf-8"))


def http_post_json(url, body, headers=None):
    data = json.dumps(body).encode("utf-8")
    h = {"Content-Type": "application/json", "User-Agent": UA, **(headers or {})}
    req = urllib.request.Request(url, data=data, headers=h, method="POST")
    with urllib.request.urlopen(req, timeout=15) as res:
        return json.loads(res.read().decode("utf-8"))


def _set_token_cookie(cj, token):
    """X-CLTFT-Tokenをヘッダーだけでなく、Cookieとしてもcookiejarに登録する。
    実機検証で、ヘッダーだけ送ってもAWS側の入口で401(Unauthorized)になり、
    Cookieとして同じ値を一緒に送る必要があることが分かった。"""
    cookie = http.cookiejar.Cookie(
        version=0, name="X-CLTFT-Token", value=token,
        port=None, port_specified=False,
        domain="km-operator.smartaxicenter.com", domain_specified=True, domain_initial_dot=False,
        path="/", path_specified=True,
        secure=True, expires=None, discard=True,
        comment=None, comment_url=None, rest={},
    )
    cj.set_cookie(cookie)


def km_open(opener, cj, url, method="GET", body=None, parse_json=True):
    """km-operatorへのリクエスト共通処理。X-CLTFT-Tokenの受け渡しを自動で行う。"""
    headers = {"User-Agent": UA, "X-Requested-With": "XMLHttpRequest", "X-Use-Cookie": "true"}
    if _token_state["token"]:
        headers["X-CLTFT-Token"] = _token_state["token"]
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    else:
        req = urllib.request.Request(url, headers=headers)

    with opener.open(req, timeout=15) as res:
        new_token = res.headers.get("X-CLTFT-Token")
        if new_token:
            _token_state["token"] = new_token
            _set_token_cookie(cj, new_token)
        raw = res.read()
        if not parse_json:
            return raw
        return json.loads(raw.decode("utf-8"))


def km_login(opener, cj):
    # ①ログイン画面GET（Cookie発行）→②JSON POSTでログイン→③実際の画面を開く(以後のAPIに必要)
    req = urllib.request.Request(f"{KM_BASE}/kmx/HS/HSHS/HSHS0199.do", headers={"User-Agent": UA})
    opener.open(req, timeout=15)

    result = km_open(opener, cj, f"{KM_BASE}/kmx/api/v1/auth/login", body={"loginName": KM_LOGIN_ID, "password": KM_PASSWORD})
    if not result.get("isSuccess"):
        msg = (result.get("msgs") or [{}])[0].get("msg", "")
        raise RuntimeError(f"km-operatorログイン失敗: {msg}")

    km_open(opener, cj, f"{KM_BASE}/kmx/HS/HSHS/HSHS9999.do?pageId=HSHS0062", parse_json=False)


# 戻り値: @{ driverName = ...; trips = @(...) } / 該当なし(勤怠なし等)は trips=[] / 通信失敗は None
def km_search_trip_infos(opener, cj, radio_no, date_param):
    qs = urllib.parse.urlencode({"wirelessLineNumber": radio_no, "userName": "", "date": date_param})
    url = f"{KM_BASE}/kmx/api/v1/trip_infos/search?{qs}"
    try:
        result = km_open(opener, cj, url)
    except Exception as e:
        log(f"  [車両{radio_no}] 通信エラー: {e}")
        return None
    if not result.get("isSuccess"):
        return {"driverName": None, "trips": []}
    return {"driverName": result.get("driverName"), "trips": result.get("tripInfoList") or []}


def send_batch(batch, run_id, error_count):
    if not batch:
        return run_id
    payload = {"runId": run_id, "vehicles": batch, "errors": error_count}
    try:
        res = http_post_json(
            f"{HOSHIKON_BASE}/api/public/km-pins/upload", payload, headers={"X-Upload-Key": UPLOAD_KEY}
        )
        log(f"  アップロード成功: {res.get('saved')}件保存（runId={res.get('runId')}）")
        return res.get("runId")
    except Exception as e:
        log(f"  アップロード失敗: {e}")
        return run_id


def main():
    log("===== 収集開始 =====")

    try:
        vehicles_res = http_get_json(
            f"{HOSHIKON_BASE}/api/public/km-pins/vehicles", headers={"X-Upload-Key": UPLOAD_KEY}
        )
        radio_numbers = vehicles_res["radioNumbers"]
        log(f"対象車両数: {len(radio_numbers)}")
    except Exception as e:
        log(f"車両一覧の取得に失敗しました: {e}")
        sys.exit(1)

    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

    try:
        km_login(opener, cj)
        log("km-operatorログイン成功")
    except Exception as e:
        log(f"km-operatorログインに失敗しました: {e}")
        sys.exit(1)

    date_param = datetime.now().strftime("%Y/%m/%d %H:%M")
    run_id = None
    batch = []
    error_count = 0
    processed = 0

    for radio_no in radio_numbers:
        result = km_search_trip_infos(opener, cj, radio_no, date_param)
        if result is None:
            error_count += 1
        elif result["trips"]:
            batch.append({"radioNo": radio_no, "driverName": result["driverName"], "trips": result["trips"]})
        processed += 1

        if len(batch) >= BATCH_SIZE:
            run_id = send_batch(batch, run_id, error_count)
            batch = []
            error_count = 0

        time.sleep(SLEEP_SEC)

    if batch:
        run_id = send_batch(batch, run_id, error_count)

    log(f"===== 収集完了（処理台数: {processed}） =====")


if __name__ == "__main__":
    main()
