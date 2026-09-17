#!/usr/bin/env python3
"""
板橋タクシー 流し営業（配車を介さない乗車）ピンデータ収集スクリプト

km-operatorの「走行軌跡」画面API(running_paths/search)は、車両1台・1日分の
5秒おきの位置＋ステータス（0=空車/1=実車/2=迎車/4=支払...）の生ログを、過去日付でも
返すことを実機確認した（docs/KM_OPERATOR_API.md参照）。これを使い、「空車/迎車→実車」に
変わった瞬間＝乗車、「実車→それ以外」に変わった瞬間＝降車、として乗降イベントを再現する。

【通信量・負荷対策】
- 生ログ（1台1日で数千件）はこのマシン上だけで処理し、ホシコンへは
  「乗車・降車の変化点」だけを送る（生ログそのものは送らない）。
- 車両×日付の組み合わせごとに処理済みかどうかを progress.json に記録し、
  再実行時は未処理分だけを続きから処理する（同じ範囲を何度も取り直さない）。
- 1回の実行で処理する件数の上限（--max）を設け、km-operator側への
  短時間の大量アクセスを避ける（過去に大量アクセスで一時ブロックされた実績があるため）。

使い方:
    python3 running_paths_collector.py [--days 7] [--max 60]

例: 直近7日分を、1回の実行につき最大60件（車両×日付の組み合わせ）まで処理
    python3 running_paths_collector.py --days 7 --max 60
    （何度も実行すれば続きから進む。全部終わるまで日を分けて繰り返す想定）
"""
import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.parse
import http.cookiejar
from datetime import datetime, timedelta

HOSHIKON_BASE = "https://bentenclub.com"
UPLOAD_KEY = "pqHXGmaxfSIsakMPDTZcD6cNrEBsam6e"
KM_LOGIN_ID = "itabashi1"
KM_PASSWORD = "1111"

KM_BASE = "https://km-operator.smartaxicenter.com"
SLEEP_SEC = 0.5  # 生ログは重いので通常収集より間隔を長めに取る
BATCH_SIZE = 10  # 何(車両×日)分まとめて1回のアップロードにするか

PROGRESS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "running_paths_progress.json")

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"

STATUS_SERVICE = "1"  # 実車

_token_state = {"token": None}


def log(msg):
    print(f"{datetime.now():%Y-%m-%d %H:%M:%S} {msg}")


def load_progress():
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
            return set(json.load(f).get("done", []))
    return set()


def save_progress(done_set):
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump({"done": sorted(done_set)}, f, ensure_ascii=False, indent=0)


def http_get_json(url, headers=None):
    h = {"User-Agent": UA, **(headers or {})}
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.loads(res.read().decode("utf-8"))


def http_post_json(url, body, headers=None):
    data = json.dumps(body).encode("utf-8")
    h = {"Content-Type": "application/json", "User-Agent": UA, **(headers or {})}
    req = urllib.request.Request(url, data=data, headers=h, method="POST")
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.loads(res.read().decode("utf-8"))


def _set_token_cookie(cj, token):
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
    headers = {"User-Agent": UA, "X-Requested-With": "XMLHttpRequest", "X-Use-Cookie": "true"}
    if _token_state["token"]:
        headers["X-CLTFT-Token"] = _token_state["token"]
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    else:
        req = urllib.request.Request(url, headers=headers)
    with opener.open(req, timeout=20) as res:
        new_token = res.headers.get("X-CLTFT-Token")
        if new_token:
            _token_state["token"] = new_token
            _set_token_cookie(cj, new_token)
        raw = res.read()
        if not parse_json:
            return raw
        return json.loads(raw.decode("utf-8"))


def km_login(opener, cj):
    req = urllib.request.Request(f"{KM_BASE}/kmx/HS/HSHS/HSHS0199.do", headers={"User-Agent": UA})
    opener.open(req, timeout=20)
    result = km_open(opener, cj, f"{KM_BASE}/kmx/api/v1/auth/login", body={"loginName": KM_LOGIN_ID, "password": KM_PASSWORD})
    if not result.get("isSuccess"):
        msg = (result.get("msgs") or [{}])[0].get("msg", "")
        raise RuntimeError(f"km-operatorログイン失敗: {msg}")
    # 走行軌跡画面(HSHS0109)を一度開いておく
    km_open(opener, cj, f"{KM_BASE}/kmx/HS/HSHS/HSHS9999.do?pageId=HSHS0109", parse_json=False)


def fetch_running_path(opener, cj, radio_no, date_str):
    """date_str: 'YYYY/MM/DD'。その日1日分の生ログを返す"""
    params = {
        "wirelessLineNumber": radio_no,
        "dateFrom": f"{date_str} 00:00",
        "dateTo": f"{date_str} 23:59",
        "time": "10",
    }
    qs = urllib.parse.urlencode(params)
    url = f"{KM_BASE}/kmx/api/v1/running_paths/search?{qs}"
    result = km_open(opener, cj, url)
    if not result.get("isSuccess"):
        return None
    return result.get("runningPathList") or []


def extract_trips(path_list, radio_no):
    """ステータスの変化点から乗車・降車イベントを抽出し、KmTripInfo互換のtrip一覧を返す"""
    trips = []
    pickup = None
    driver_name = None
    for p in path_list:
        status = p.get("status")
        if p.get("driver"):
            driver_name = p["driver"]
        if status == STATUS_SERVICE and pickup is None:
            pickup = p
        elif status != STATUS_SERVICE and pickup is not None:
            dropoff = p
            trips.append({
                "tripId": f"path-{radio_no}-{pickup.get('date', '').replace(' ', 'T')}",
                "onServiceAt": pickup.get("date", "").replace("-", "/"),
                "onServiceLatitude": pickup.get("latitude"),
                "onServiceLongitude": pickup.get("longitude"),
                "outServiceAt": dropoff.get("date", "").replace("-", "/"),
                "outServiceLatitude": dropoff.get("latitude"),
                "outServiceLongitude": dropoff.get("longitude"),
            })
            pickup = None
    return trips, driver_name


def send_batch(batch, run_id, error_count):
    if not batch:
        return run_id
    payload = {"runId": run_id, "vehicles": batch, "errors": error_count}
    try:
        res = http_post_json(f"{HOSHIKON_BASE}/api/public/km-pins/upload", payload, headers={"X-Upload-Key": UPLOAD_KEY})
        log(f"  アップロード成功: {res.get('saved')}件保存（runId={res.get('runId')}）")
        return res.get("runId")
    except Exception as e:
        log(f"  アップロード失敗: {e}")
        return run_id


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=7, help="何日前まで遡るか")
    parser.add_argument("--max", type=int, default=60, help="この実行で処理する(車両×日)の上限")
    args = parser.parse_args()

    log(f"===== 走行軌跡バックフィル開始（過去{args.days}日分、上限{args.max}件） =====")

    done = load_progress()
    log(f"処理済み: {len(done)}件（続きから実行）")

    try:
        vehicles_res = http_get_json(f"{HOSHIKON_BASE}/api/public/km-pins/vehicles", headers={"X-Upload-Key": UPLOAD_KEY})
        radio_numbers = vehicles_res["radioNumbers"]
    except Exception as e:
        log(f"車両一覧の取得に失敗しました: {e}")
        sys.exit(1)

    today = datetime.now().date()
    dates = [(today - timedelta(days=i)).strftime("%Y/%m/%d") for i in range(1, args.days + 1)]  # 今日は除く(未完了のため)

    # 未処理の(車両, 日付)ペアを作る
    pending = []
    for date_str in dates:
        for radio_no in radio_numbers:
            key = f"{radio_no}_{date_str}"
            if key not in done:
                pending.append((radio_no, date_str))
    log(f"未処理の組み合わせ: {len(pending)}件 / 今回処理: 最大{args.max}件")

    if not pending:
        log("===== 全て処理済みです =====")
        return

    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    try:
        km_login(opener, cj)
        log("km-operatorログイン成功")
    except Exception as e:
        log(f"km-operatorログインに失敗しました: {e}")
        sys.exit(1)

    run_id = None
    batch = []
    error_count = 0
    processed = 0
    total_trips = 0

    for radio_no, date_str in pending[: args.max]:
        key = f"{radio_no}_{date_str}"
        try:
            path_list = fetch_running_path(opener, cj, radio_no, date_str)
        except Exception as e:
            log(f"  [{key}] 通信エラー: {e}")
            error_count += 1
            time.sleep(SLEEP_SEC)
            continue

        if path_list:
            trips, driver_name = extract_trips(path_list, radio_no)
            if trips:
                batch.append({"radioNo": int(radio_no), "driverName": driver_name, "trips": trips})
                total_trips += len(trips)

        done.add(key)
        processed += 1

        if len(batch) >= BATCH_SIZE:
            run_id = send_batch(batch, run_id, error_count)
            batch = []
            error_count = 0
            save_progress(done)  # アップロードのたびに進捗保存（途中で止めても再開できる）

        time.sleep(SLEEP_SEC)

    if batch:
        run_id = send_batch(batch, run_id, error_count)
    save_progress(done)

    remaining = len(pending) - processed
    log(f"===== 完了（今回処理: {processed}件、抽出トリップ: {total_trips}件、残り: {remaining}件） =====")
    if remaining > 0:
        log("残りがあります。もう一度同じコマンドを実行すると続きから処理されます。")


if __name__ == "__main__":
    main()
