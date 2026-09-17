#!/usr/bin/env python3
"""
板橋タクシー 乗降ピンデータ「過去分」バックフィルスクリプト（km-operator → ホシコン）

collect.py（trip_infos/search、車両ごとの"今のシフト"限定）とは別の入り口。
km-operatorの伝票検索(ticket_searches/search)はdateFrom/dateToで過去の日付範囲を
指定でき、実際に過去（実機検証では1ヶ月以上前）の完了済み配車データを取得できることを確認済み。
ただし配車依頼（電話・アプリ経由）分のみで、流し営業分の過去データはこの方法でも取得できない
（trip_infos/searchが"今のシフト"限定のため。docs/KM_OPERATOR_API.md参照）。

使い方:
    python3 backfill.py [さかのぼる日数（既定30）]

例: 過去60日分を取り込む
    python3 backfill.py 60
"""
import json
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
SLEEP_SEC = 0.3
CHUNK_DAYS = 7  # 何日分ずつ検索するか（1回のsearchで返る件数を抑えてページングを避ける）
BATCH_SIZE = 20

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"

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
    req = urllib.request.Request(f"{KM_BASE}/kmx/HS/HSHS/HSHS0199.do", headers={"User-Agent": UA})
    opener.open(req, timeout=15)
    result = km_open(opener, cj, f"{KM_BASE}/kmx/api/v1/auth/login", body={"loginName": KM_LOGIN_ID, "password": KM_PASSWORD})
    if not result.get("isSuccess"):
        msg = (result.get("msgs") or [{}])[0].get("msg", "")
        raise RuntimeError(f"km-operatorログイン失敗: {msg}")
    km_open(opener, cj, f"{KM_BASE}/kmx/HS/HSHS/HSHS9999.do?pageId=HSHS0062", parse_json=False)


SEARCH_DEFAULTS = {
    "ticketNumber": "", "operatorName": "", "selectDate": "1", "prearrangedSearchFlg": "0",
    "ticketType": "3", "channelList": "", "ticketStatusList": "",
    "customerLastNameKana": "", "customerFirstNameKana": "", "customerPhoneNumber": "", "customerPhoneNumber2": "",
    "passengerLastNameKana": "", "passengerFirstNameKana": "", "customerNumber": "", "customerCompanyName": "",
    "customerRankIdList": "", "customerKindList": "", "departureAddress": "", "bywayAddress": "", "destinationAddress": "",
    "selectProduct": "0", "packageIdList": "", "reportNeeded": "99", "lineList": "", "callingNumber": "",
    "nonNotification": "0", "trackingNeeded": "99", "throughNeeded": "99", "notSupposed": "99", "canceled": "99",
    "earlyReserved": "99", "reservedAutoDispatch": "99", "reservedFee": "99", "reservedConfirm": "99",
    "dispatchDriverName": "", "dispatchOperatorName": "", "dispatchStatus": "99", "gradeList": "", "colorList": "",
    "makerList": "", "carTypeList": "", "occurrenceAtFrom": "", "occurrenceAtTo": "", "number": "",
    "qaDriverName": "", "qaTargetList": "", "qaTypeList": "", "leftBehindTypeList": "",
    "order": "8", "limit": "100",
}


def search_tickets(opener, cj, date_from, date_to):
    """dateFrom〜dateTo(共に'YYYY/MM/DD HH:mm'形式)の完了済み伝票を全ページ取得"""
    all_tickets = []
    page = 1
    while True:
        params = dict(SEARCH_DEFAULTS, dateFrom=date_from, dateTo=date_to, pageNo=str(page))
        qs = urllib.parse.urlencode(params)
        url = f"{KM_BASE}/kmx/api/v1/ticket_searches/search?{qs}"
        result = km_open(opener, cj, url)
        if not result.get("isSuccess"):
            break
        tickets = result.get("ticketDatas", [])
        all_tickets.extend(tickets)
        total_pages = int(result.get("allPageCount") or 1)
        if page >= total_pages or not tickets:
            break
        page += 1
        time.sleep(SLEEP_SEC)
    return all_tickets


def get_ticket_detail(opener, cj, ticket_number):
    # operatorIdは必須パラメータ（未指定だと"オペレーターIDに値が入力されていません"エラーになる）。
    # itabashi1アカウントに紐づく固定値135を使う（docs/KM_OPERATOR_API.md参照）。
    qs = urllib.parse.urlencode({"ticketNumber": ticket_number, "operatorId": "135", "fromDisplay": "0", "limit": "100", "pageNo": "1"})
    url = f"{KM_BASE}/kmx/api/v1/tickets/get?{qs}"
    try:
        result = km_open(opener, cj, url)
    except Exception as e:
        log(f"  [伝票{ticket_number}] 通信エラー: {e}")
        return None
    if not result.get("isSuccess"):
        return None
    return result


def ticket_to_trip_and_vehicle(detail):
    dt = detail.get("dispatchTicket") or {}
    dep_lat, dep_lng = dt.get("departureLatitude"), dt.get("departureLongitude")
    dst_lat, dst_lng = dt.get("destinationLatitude"), dt.get("destinationLongitude")
    if dep_lat is None and dst_lat is None:
        return None, None, None
    when = dt.get("reservedDate") or detail.get("createdAt")
    trip = {
        "tripId": f"ticket-{detail.get('ticketNumber')}",
        "ticketNumber": detail.get("ticketNumber"),
        "ticketStatus": "処理完了",
        "onServiceAt": when,
        "onServiceLatitude": dep_lat,
        "onServiceLongitude": dep_lng,
        "outServiceAt": when,
        "outServiceLatitude": dst_lat,
        "outServiceLongitude": dst_lng,
        "customerFullNameKana": (detail.get("customerLastNameKana") or "") + (detail.get("customerFirstNameKana") or ""),
        "passengerNameKana": dt.get("passengerNameKana"),
    }
    dispatches = dt.get("prearrangedDispatches") or []
    radio_no = None
    driver_name = None
    if dispatches:
        wln = dispatches[0].get("wirelessLineNumber")
        radio_no = int(wln) if wln and str(wln).isdigit() else None
        driver_name = dispatches[0].get("driverName")
    return trip, radio_no, driver_name


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
    days_back = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    log(f"===== バックフィル開始（過去{days_back}日分） =====")

    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    try:
        km_login(opener, cj)
        log("km-operatorログイン成功")
    except Exception as e:
        log(f"km-operatorログインに失敗しました: {e}")
        sys.exit(1)

    now = datetime.now()
    start = now - timedelta(days=days_back)

    run_id = None
    batch = []
    error_count = 0
    total_tickets = 0
    total_saved = 0

    cursor = start
    while cursor < now:
        chunk_end = min(cursor + timedelta(days=CHUNK_DAYS), now)
        date_from = cursor.strftime("%Y/%m/%d 00:00")
        date_to = chunk_end.strftime("%Y/%m/%d 23:59")
        log(f"検索中: {date_from} 〜 {date_to}")
        try:
            tickets = search_tickets(opener, cj, date_from, date_to)
        except Exception as e:
            log(f"  検索エラー: {e}")
            tickets = []
        completed = [t for t in tickets if t.get("ticketStatus") == "処理完了"]
        log(f"  該当 {len(tickets)}件（完了済み {len(completed)}件）")
        total_tickets += len(completed)

        for t in completed:
            detail = get_ticket_detail(opener, cj, t.get("ticketNumber"))
            if detail is None:
                error_count += 1
            else:
                trip, radio_no, driver_name = ticket_to_trip_and_vehicle(detail)
                if trip:
                    batch.append({"radioNo": radio_no, "driverName": driver_name, "trips": [trip]})
            if len(batch) >= BATCH_SIZE:
                run_id = send_batch(batch, run_id, error_count)
                total_saved += len(batch)
                batch = []
                error_count = 0
            time.sleep(SLEEP_SEC)

        cursor = chunk_end + timedelta(minutes=1)

    if batch:
        run_id = send_batch(batch, run_id, error_count)

    log(f"===== バックフィル完了（対象伝票 {total_tickets}件） =====")


if __name__ == "__main__":
    main()
