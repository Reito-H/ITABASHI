#!/usr/bin/env python3
"""
ロール「R」（hoshi_viewer）用リッチメニュー画像を生成する。
ボタンは「星 予定表」1つだけ（画像全体が1つのタップエリア）。星専用引き継ぎシートと同じ夜空のデザイン。

使い方:
  python3 scripts/gen_richmenu_r_image.py            # scripts/richmenu_r.jpg を出力
  # → create_richmenu_r.js で LINE に登録する
※ LINEのリッチメニュー画像は 1MB 以下必須。JPEGで出力する。
"""
import math
import os
import random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 2500, 843
OUT = os.path.join(os.path.dirname(__file__), 'richmenu_r.jpg')
FONT_BOLD = '/System/Library/Fonts/ヒラギノ角ゴシック W8.ttc'
FONT_SUB = '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc'
GOLD = (245, 196, 81)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def star_points(cx, cy, r_out, r_in, n=5, rot=-math.pi / 2):
    pts = []
    for i in range(n * 2):
        r = r_out if i % 2 == 0 else r_in
        a = rot + i * math.pi / n
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def main():
    # 背景: 左上 #0b1430 → 右下 #2f3488 の斜めグラデーション
    img = Image.new('RGB', (W, H))
    px = img.load()
    c0, c1, c2 = (11, 20, 48), (24, 36, 90), (47, 52, 136)
    for y in range(H):
        for x in range(W):
            t = (x / W) * 0.7 + (y / H) * 0.3
            px[x, y] = lerp(c0, c1, t / 0.55) if t < 0.55 else lerp(c1, c2, (t - 0.55) / 0.45)

    # 右上のぼんやりした光
    glow = Image.new('RGB', (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((1500, -500, 3000, 500), fill=(90, 100, 200))
    glow = glow.filter(ImageFilter.GaussianBlur(220))
    img = Image.blend(img, Image.composite(glow, img, Image.new('L', (W, H), 255)), 0.35)

    d = ImageDraw.Draw(img)
    # 小さな星の点
    rnd = random.Random(7)
    for _ in range(140):
        x, y = rnd.randint(0, W), rnd.randint(0, H)
        r = rnd.choice([1.5, 2, 2.5, 3, 4])
        a = rnd.randint(120, 255)
        col = (255, 236, 170) if rnd.random() < 0.15 else (a, a, min(255, a + 10))
        d.ellipse((x - r, y - r, x + r, y + r), fill=col)

    # 左の星マーク（角丸の枠＋金の星）
    bx, by, bs = 330, H // 2, 300
    d.rounded_rectangle((bx - bs // 2, by - bs // 2, bx + bs // 2, by + bs // 2), radius=70,
                        fill=(36, 48, 110), outline=(90, 104, 180), width=4)
    d.polygon(star_points(bx, by + 6, 112, 48), fill=GOLD)

    # 文字
    f_title = ImageFont.truetype(FONT_BOLD, 230)
    f_sub = ImageFont.truetype(FONT_SUB, 78)
    tx = 600
    d.text((tx, by - 40), '星 予定表', font=f_title, fill=(255, 255, 255), anchor='lm')
    d.text((tx + 8, by + 150), 'シフト・出勤時間・予定メモ', font=f_sub, fill=(205, 210, 240), anchor='lm')

    # 右端の「開く」矢印
    ax = W - 230
    d.ellipse((ax - 110, by - 110, ax + 110, by + 110), outline=(150, 160, 220), width=8)
    d.line([(ax - 25, by - 50), (ax + 30, by), (ax - 25, by + 50)], fill=(255, 255, 255), width=16, joint='curve')

    img.save(OUT, 'JPEG', quality=88)
    print(OUT, os.path.getsize(OUT), 'bytes')


if __name__ == '__main__':
    main()
