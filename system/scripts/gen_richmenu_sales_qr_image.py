#!/usr/bin/env python3
"""
管理者用リッチメニュー画像の1セル（真ん中下＝現在「報告2」の重複ボタン）を
「QR読み取り（売上確認）」ボタンに描き替える。
（カメラ風アイコン＋白ボールドのラベル。他セルの線画アイコンに合わせた見た目）

前提: wire_sales_qr_richmenu.js を DRY_RUN=1 で実行し、
  --menu-size （リッチメニュー定義の size）と --bounds （置換対象エリアの bounds）を控える。
bounds はメニュー座標系なので、実画像サイズに合わせて自動スケールする。

使い方:
  python3 scripts/gen_richmenu_sales_qr_image.py \
    --in current_menu.jpg --out new_menu.jpg \
    --menu-size 2500,1686 --bounds 833,843,834,843

  # 出力を wire_sales_qr_richmenu.js の NEW_IMAGE_PATH に渡す
  # ※ LINEのリッチメニュー画像は 1MB 以下必須。このスクリプトはJPEGで1MB未満に収める。
"""

import argparse
import os
from PIL import Image, ImageDraw, ImageFont

BG = (14, 50, 95)       # 現行メニューの背景色
WHITE = (255, 255, 255)

FONT_CANDIDATES = [
    "/System/Library/Fonts/ヒラギノ角ゴシック W7.ttc",
    "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/Library/Fonts/Arial Unicode.ttf",
]


def load_font(size: int):
    for path in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_camera_icon(d: ImageDraw.ImageDraw, cx: int, cy: int, scale: float):
    """カメラ風アイコン（線画・白）: 本体の角丸四角＋レンズの円＋上部の小さな突起"""
    w, h = int(260 * scale), int(190 * scale)
    stroke = max(4, int(16 * scale))
    x0, y0 = cx - w // 2, cy - h // 2
    x1, y1 = cx + w // 2, cy + h // 2
    d.rounded_rectangle([x0, y0, x1, y1], radius=int(24 * scale), outline=WHITE, width=stroke)
    bw, bh = int(70 * scale), int(34 * scale)
    d.rounded_rectangle(
        [cx - bw // 2, y0 - bh + int(10 * scale), cx + bw // 2, y0 + int(10 * scale)],
        radius=int(8 * scale), outline=WHITE, width=stroke,
    )
    r = int(55 * scale)
    d.ellipse([cx - r, cy - r + int(8 * scale), cx + r, cy + r + int(8 * scale)], outline=WHITE, width=stroke)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", required=True)
    ap.add_argument("--menu-size", required=True, help="width,height （リッチメニュー定義の size）")
    ap.add_argument("--bounds", required=True, help="x,y,width,height （置換エリアの bounds）")
    ap.add_argument("--label", default="QR読取(売上確認)")
    args = ap.parse_args()

    img = Image.open(args.src).convert("RGB")
    IW, IH = img.size
    MW, MH = (int(v) for v in args.menu_size.split(","))
    bx, by, bw, bh = (int(v) for v in args.bounds.split(","))

    sx, sy = IW / MW, IH / MH
    x0, y0 = int(bx * sx), int(by * sy)
    x1, y1 = int((bx + bw) * sx), int((by + bh) * sy)
    cw, ch = x1 - x0, y1 - y0
    scale = min(cw, ch) / 843.0

    d = ImageDraw.Draw(img)
    d.rectangle([x0 + 2, y0 + 2, x1 - 2, y1 - 2], fill=BG)

    cx = x0 + cw // 2
    draw_camera_icon(d, cx, y0 + int(ch * 0.35), scale)

    font = load_font(int(120 * scale))
    tb = d.textbbox((0, 0), args.label, font=font)
    tw = tb[2] - tb[0]
    if tw > cw * 0.92:
        font = load_font(int(90 * scale))
        tb = d.textbbox((0, 0), args.label, font=font)
        tw = tb[2] - tb[0]
    d.text((cx - tw // 2 - tb[0], y0 + int(ch * 0.68)), args.label, font=font, fill=WHITE)

    q = 92
    while q >= 60:
        img.save(args.dst, "JPEG", quality=q)
        if os.path.getsize(args.dst) < 1024 * 1024:
            break
        q -= 6
    print(f"保存: {args.dst}  ({os.path.getsize(args.dst)} bytes, q={q}, cell {x0},{y0}-{x1},{y1})")


if __name__ == "__main__":
    main()
