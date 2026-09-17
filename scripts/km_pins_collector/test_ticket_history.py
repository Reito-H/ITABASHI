import sys
sys.path.insert(0, ".")
import collect
from collect import km_login, km_open
import http.cookiejar
import urllib.request
import urllib.parse
import json

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
km_login(opener, cj)
print("login ok")

params = {
    "ticketNumber": "", "operatorName": "", "selectDate": "1", "prearrangedSearchFlg": "0",
    "dateFrom": "2026/08/17 00:00", "dateTo": "2026/09/17 23:59",
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
    "order": "8", "limit": "100", "pageNo": "1",
}
qs = urllib.parse.urlencode(params)
url = f"{collect.KM_BASE}/kmx/api/v1/ticket_searches/search?{qs}"
result = km_open(opener, cj, url)
print("isSuccess:", result.get("isSuccess"))
print("allRowCount:", result.get("allRowCount"))
print("allPageCount:", result.get("allPageCount"))
tickets = result.get("ticketDatas", [])
print("returned:", len(tickets))
for t in tickets[:5]:
    print(" -", t.get("ticketNumber"), t.get("receptionDate"), t.get("reservedDate"), t.get("departureAddress"))
if result.get("msgs"):
    print("msgs:", result["msgs"])
