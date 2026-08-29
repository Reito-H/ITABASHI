#!/usr/bin/env python3
"""
管理者用リッチメニュー画像の1セルだけを「電話検索」ボタンに描き替える。
（虫めがね＋電話キーパッド風3x3ドット＋白ボールドのラベル。他セルの線画アイコンに合わせた見た目）

前提: add_richmenu_case_search.js を確認モード（--target 付き）で実行し、
  --menu-size （リッチメニュー定義の size）と --bounds （置換エリアの bounds）を控える。
bounds はメニュー座標系なので、実画像サイズに合わせて自動スケールする。

使い方:
  # 現行画像をLINEから取得
  curl -s -H "Authorization: Bearer $LINE_TOKEN" \
    https://api-data.line.me/v2/bot/richmenu/<MENU_ID>/content -o current_menu.jpg

  python3 scripts/gen_richmenu_case_search_image.py \
    --in current_menu.jpg --out new_menu.jpg \
    --menu-size 2500,1686 --bounds 0,843,834,843

  # 出力を add_richmenu_case_search.js の --image に渡す
  # ※ LINEのリッチメニュー画像は 1MB 以下必須。このスクリプトはJPEGで1MB未満に収める。
"""

import argparse
import math
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


def draw_icon(d: ImageDraw.ImageDraw, cx: int, cy: int, scale: float):
    """虫めがね＋中に3x3のキーパッドドット（線画・白）"""
    r = int(155 * scale)
    stroke = max(4, int(16 * scale))
    gx, gy = cx, cy
    d.ellipse([gx - r, gy - r, gx + r, gy + r], outline=WHITE, width=stroke)
    a = math.radians(45)
    d.line([gx + int(r * math.cos(a)), gy + int(r * math.sin(a)),
            gx + int((r + 100 * scale) * math.cos(a)), gy + int((r + 100 * scale) * math.sin(a))],
           fill=WHITE, width=stroke + int(8 * scale))
    gap, dot = int(52 * scale), max(3, int(15 * scale))
    for row in range(3):
        for col in range(3):
            px, py = gx + (col - 1) * gap, gy + (row - 1) * gap
            d.ellipse([px - dot, py - dot, px + dot, py + dot], fill=WHITE)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", required=True)
    ap.add_argument("--menu-size", required=True, help="width,height （リッチメニュー定義の size）")
    ap.add_argument("--bounds", required=True, help="x,y,width,height （置換エリアの bounds）")
    ap.add_argument("--label", default="電話検索")
    args = ap.parse_args()

    img = Image.open(args.src).convert("RGB")
    IW, IH = img.size
    MW, MH = (int(v) for v in args.menu_size.split(","))
    bx, by, bw, bh = (int(v) for v in args.bounds.split(","))

    # メニュー座標 → 実画像ピクセルへスケール
    sx, sy = IW / MW, IH / MH
    x0, y0 = int(bx * sx), int(by * sy)
    x1, y1 = int((bx + bw) * sx), int((by + bh) * sy)
    cw, ch = x1 - x0, y1 - y0
    scale = min(cw, ch) / 843.0  # 2500x1686メニューの1セル基準

    d = ImageDraw.Draw(img)
    # セルを背景色で塗る（グリッド線は残すため内側2px）
    d.rectangle([x0 + 2, y0 + 2, x1 - 2, y1 - 2], fill=BG)

    cx = x0 + cw // 2
    draw_icon(d, cx, y0 + int(ch * 0.35), scale)

    font = load_font(int(150 * scale))
    tb = d.textbbox((0, 0), args.label, font=font)
    d.text((cx - (tb[2] - tb[0]) // 2 - tb[0], y0 + int(ch * 0.66)), args.label, font=font, fill=WHITE)

    # LINEのリッチメニュー画像は 1MB 以下。JPEGで品質を落として収める。
    q = 92
    while q >= 60:
        img.save(args.dst, "JPEG", quality=q)
        if os.path.getsize(args.dst) < 1024 * 1024:
            break
        q -= 6
    print(f"保存: {args.dst}  ({os.path.getsize(args.dst)} bytes, q={q}, cell {x0},{y0}-{x1},{y1})")


if __name__ == "__main__":
    main()
