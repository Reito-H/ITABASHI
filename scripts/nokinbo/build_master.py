#!/usr/bin/env python3
"""納金簿の下敷き画像を生成する。

元PDF（板橋営業所の「納金簿」スキャン, 例: ~/Downloads/20260830023214.pdf）から
埋め込みJPEGを取り出し、90°回転して正立させ、スキャンノイズ（紙のざらつき・網点シェード等）を
除去してクリーンにし、期間・個人で変わる記入欄（年 / 月 / 営業所 / 班 / コード / 氏名 / 曜日列）を
白でマスクする。出力を base64 で system/src/assets/nokinbo_form_bg.ts に書き込む。

使い方:  python3 scripts/nokinbo/build_master.py [PDFパス]
必要: pillow, numpy, scipy
"""
import base64
import io
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

PDF = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Downloads/20260830023214.pdf")
OUT_TS = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "system", "src", "assets", "nokinbo_form_bg.ts"))

data = open(PDF, "rb").read()
jpg = data[data.find(b"\xff\xd8\xff"):data.rfind(b"\xff\xd9") + 2]

im = Image.open(io.BytesIO(jpg)).rotate(90, expand=True).convert("L")  # 4964 x 7020 (A4 比率)
a = np.asarray(im).astype(np.float32)
H, W = a.shape

# 1) トーンカーブ: 紙のクリーム色を白に、線を濃くする（エッジのAAは残す）
a = np.clip((a - 116.0) / (196.0 - 116.0), 0, 1) * 255.0
a = a.astype(np.uint8)

# 2) 中間グレーを白へ（罫線・文字は <=140 なので安全）。網点シェード・ハーフトーンが消える
a = np.where((a >= 150) & (a < 253), 255, a)
a = np.where(a < 150, np.clip(a.astype(np.int16) - 30, 0, 255).astype(np.uint8), a)

# 3) 連結成分で小さな黒点（スキャンのざらつき・網点シェードの粒）を除去
m = a < 160
lbl, n = ndimage.label(m)
sz = ndimage.sum(np.ones_like(lbl, dtype=np.int32), lbl, index=np.arange(1, n + 1))
a[np.isin(lbl, np.where(sz < 45)[0] + 1)] = 255

img = Image.fromarray(a)
d = ImageDraw.Draw(img)

# 4) 3) で一緒に消える「行ごとの点線区切り」を描き直す（表本体 31 行）
TOP, PITCH = 989.0, (4942.0 - 989.0) / 31.0
for i in range(1, 31):
    y = round(TOP + i * PITCH)
    for x in range(192, 4674, 13):
        d.rectangle([x, y - 1, x + 6, y + 1], fill=95)


# 5) 期間・個人で変わる記入欄を白マスク（この上に nokinboPrintDoc がオーバーレイする）
def wc(x0, y0, x1, y1):
    d.rectangle([x0, y0, x1, y1], fill=255)


wc(150, 380, 545, 510)     # 年の値
wc(910, 380, 1240, 510)    # 月の値
wc(490, 545, 985, 715)     # 営業所名
wc(1540, 545, 1805, 715)   # 「営業所」右の班番号
wc(2035, 540, 2805, 722)   # 社員コード
wc(2805, 530, 3490, 728)   # 氏名
wc(4258, 515, 4440, 725)   # 右上「No. 班」の値
wc(382, 988, 558, 4948)    # 曜日列（表の本体）

target_w = 1500
sm = img.resize((target_w, round(target_w * H / W)), Image.LANCZOS)
buf = io.BytesIO()
sm.save(buf, format="JPEG", quality=88, optimize=True)
b64 = base64.b64encode(buf.getvalue()).decode()

ts = (
    "// 納金簿の元帳票スキャン（板橋営業所）を90°回転して正立させ、スキャンノイズ（紙のざらつき・\n"
    "// 網点シェード等）を除去してクリーンにし、期間・個人で変わる記入欄（年/月/営業所/班/コード/\n"
    "// 氏名/曜日列）を白マスクした下敷き画像。生成: scripts/nokinbo/build_master.py。\n"
    f"// {sm.size[0]}x{sm.size[1]} グレースケールJPEG（A4縦・比率 4964:7020）。\n"
    f"export const NOKINBO_FORM_BG_B64 = '{b64}';\n"
)
open(OUT_TS, "w").write(ts)
print("bytes:", len(buf.getvalue()), " b64 len:", len(b64), " -> ", OUT_TS)
