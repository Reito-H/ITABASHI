#!/usr/bin/env python3
"""
運行管理者・統括管理者用リッチメニュー（RICHMENU_ID_PATTERN2 = PATTERN3 共有）の画像を新デザインで生成する。
ボタンの位置・数・タップ時の動作は現行メニューと同じ（2行×3列、上段中央はボタンなしのロゴ枠）。

  上段: 報告 / （ロゴ） / 社員照会
  下段: 電話検索 / QR読取（売上確認） / その他機能

使い方:
  python3 scripts/gen_richmenu_manager_image.py      # scripts/richmenu_manager.jpg を出力
  → create_richmenu_manager.js で LINE に登録・対象ユーザーへ切り替え
※ LINEのリッチメニュー画像は 1MB 以下必須。2倍サイズで描いて縮小し、線をなめらかにしている。
"""
import math
import os
import random
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

W, H = 2500, 1686            # 現行メニューの size と同じ
S = 2                        # 2倍で描いて縮小（アンチエイリアス）
OUT = os.path.join(os.path.dirname(__file__), 'richmenu_manager.jpg')
F_BOLD = '/System/Library/Fonts/ヒラギノ角ゴシック W8.ttc'
F_MED = '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc'

WHITE = (255, 255, 255)
GOLD = (245, 196, 81)
# ボタンごとのアクセント色（アイコンの角丸バッジに使う）
ACCENT = {
    'report': ((255, 122, 89), (236, 72, 100)),     # コーラル→ローズ
    'staff': ((56, 189, 248), (59, 130, 246)),      # スカイ→ブルー
    'phone': ((45, 212, 191), (16, 163, 127)),      # ティール→エメラルド
    'qr': ((167, 139, 250), (124, 58, 237)),        # ラベンダー→バイオレット
    'other': ((251, 191, 36), (245, 140, 30)),      # アンバー→オレンジ
}


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(w, h, c0, c1, diagonal=True):
    g = Image.new('RGB', (w, h))
    px = g.load()
    for y in range(h):
        for x in range(w):
            t = ((x / w) * 0.6 + (y / h) * 0.4) if diagonal else y / h
            px[x, y] = lerp(c0, c1, t)
    return g


def star_points(cx, cy, r_out, r_in, n=5, rot=-math.pi / 2):
    pts = []
    for i in range(n * 2):
        r = r_out if i % 2 == 0 else r_in
        a = rot + i * math.pi / n
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


# ===== アイコン（線画。cx,cy中心・sizeの正方形内に描く） =====
def icon_report(d, cx, cy, s, lw):
    # 角丸三角形＋「!」
    top, left, right, bottom = (cx, cy - s * 0.42), (cx - s * 0.46, cy + s * 0.36), (cx + s * 0.46, cy + s * 0.36), cy + s * 0.36
    d.line([top, right, left, top], fill=WHITE, width=lw, joint='curve')
    for p in (top, left, right):
        d.ellipse((p[0] - lw / 2, p[1] - lw / 2, p[0] + lw / 2, p[1] + lw / 2), fill=WHITE)
    d.line([(cx, cy - s * 0.14), (cx, cy + s * 0.1)], fill=WHITE, width=lw)
    r = lw * 0.62
    d.ellipse((cx - r, cy + s * 0.22 - r, cx + r, cy + s * 0.22 + r), fill=WHITE)


def icon_staff(d, cx, cy, s, lw):
    # 人物＋虫めがね
    hx, hy, hr = cx - s * 0.1, cy - s * 0.18, s * 0.17
    d.ellipse((hx - hr, hy - hr, hx + hr, hy + hr), outline=WHITE, width=lw)
    d.arc((hx - s * 0.33, cy + s * 0.04, hx + s * 0.33, cy + s * 0.7), 180, 360, fill=WHITE, width=lw)
    mx, my, mr = cx + s * 0.24, cy + s * 0.2, s * 0.13
    d.ellipse((mx - mr, my - mr, mx + mr, my + mr), outline=WHITE, width=lw)
    d.line([(mx + mr * 0.72, my + mr * 0.72), (mx + mr * 1.75, my + mr * 1.75)], fill=WHITE, width=lw)


def icon_phone(d, cx, cy, s, lw):
    # 虫めがね＋キーパッド（3x3ドット）
    r = s * 0.3
    mx, my = cx - s * 0.06, cy - s * 0.06
    d.ellipse((mx - r, my - r, mx + r, my + r), outline=WHITE, width=lw)
    d.line([(mx + r * 0.72, my + r * 0.72), (mx + r * 1.45, my + r * 1.45)], fill=WHITE, width=int(lw * 1.15))
    dr, gap = s * 0.035, s * 0.12
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            x, y = mx + i * gap, my + j * gap
            d.ellipse((x - dr, y - dr, x + dr, y + dr), fill=WHITE)


def icon_qr(d, cx, cy, s, lw):
    # 読み取り枠（四隅のL字）＋QRの目印
    h = s * 0.38
    c = s * 0.15
    for sx in (-1, 1):
        for sy in (-1, 1):
            x0, y0 = cx + sx * h, cy + sy * h
            d.line([(x0, y0 - sy * c), (x0, y0), (x0 - sx * c, y0)], fill=WHITE, width=lw, joint='curve')
    q = s * 0.1
    for (ox, oy) in ((-1, -1), (1, -1), (-1, 1)):
        x, y = cx + ox * s * 0.12, cy + oy * s * 0.12
        d.rounded_rectangle((x - q, y - q, x + q, y + q), radius=q * 0.35, outline=WHITE, width=int(lw * 0.7))
    dd = s * 0.045
    d.rounded_rectangle((cx + s * 0.12 - dd, cy + s * 0.12 - dd, cx + s * 0.12 + dd, cy + s * 0.12 + dd), radius=dd * 0.3, fill=WHITE)
    # スキャンライン
    d.line([(cx - h * 0.85, cy), (cx + h * 0.85, cy)], fill=(255, 255, 255), width=max(2, lw // 3))


def icon_other(d, cx, cy, s, lw):
    # 2x2の角丸タイル
    t, g = s * 0.26, s * 0.08
    for i in (-1, 1):
        for j in (-1, 1):
            x = cx + i * (t / 2 + g / 2)
            y = cy + j * (t / 2 + g / 2)
            d.rounded_rectangle((x - t / 2, y - t / 2, x + t / 2, y + t / 2), radius=t * 0.28, outline=WHITE, width=lw)


ICONS = {'report': icon_report, 'staff': icon_staff, 'phone': icon_phone, 'qr': icon_qr, 'other': icon_other}


def main():
    w, h = W * S, H * S
    # 背景：深い夜空色のグラデーション＋右上の光
    img = gradient(w // 8, h // 8, (9, 16, 40), (30, 40, 98)).resize((w, h), Image.BICUBIC)
    glow = Image.new('RGB', (w, h), (0, 0, 0))
    ImageDraw.Draw(glow).ellipse((w * 0.55, -h * 0.5, w * 1.3, h * 0.45), fill=(80, 90, 200))
    glow = glow.resize((w // 8, h // 8)).filter(ImageFilter.GaussianBlur(40)).resize((w, h), Image.BICUBIC)
    # スクリーン合成でなめらかに明るくする（境界の出ない光）
    img = ImageChops.screen(img, glow.point(lambda v: int(v * 0.55)))
    d = ImageDraw.Draw(img)

    rnd = random.Random(11)
    for _ in range(220):
        x, y = rnd.randint(0, w), rnd.randint(0, h)
        r = rnd.choice([2, 3, 3, 4, 5]) * S / 2
        a = rnd.randint(90, 200)
        d.ellipse((x - r, y - r, x + r, y + r), fill=(a, a, min(255, a + 20)))

    # 現行メニューのタップ領域（x区切り 0/834/1667/2500、y区切り 0/843/1686）に合わせてタイルを置く
    xs = [0, 834, 1667, 2500]
    ys = [0, 843, 1686]
    pad = 26
    cells = {
        (0, 0): ('report', '報告', '忘れ物・事故・違反・一般'),
        (2, 0): ('staff', '社員照会', '社員情報・連絡先'),
        (0, 1): ('phone', '電話検索', '番号から案件を特定'),
        (1, 1): ('qr', 'QR読取', '売上確認'),
        (2, 1): ('other', 'その他機能', '示達・出勤班長・星予定'),
    }
    f_label = ImageFont.truetype(F_BOLD, 104 * S)
    f_sub = ImageFont.truetype(F_MED, 46 * S)

    tiles = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    td = ImageDraw.Draw(tiles)
    shadow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    for ci in range(3):
        for ri in range(2):
            x0, x1 = (xs[ci] + pad) * S, (xs[ci + 1] - pad) * S
            y0, y1 = (ys[ri] + pad) * S, (ys[ri + 1] - pad) * S
            sd.rounded_rectangle((x0, y0 + 18 * S, x1, y1 + 18 * S), radius=64 * S, fill=(0, 0, 10, 120))
            if (ci, ri) == (1, 0):
                # 上段中央：ボタンなし。ロゴ枠は控えめな枠線だけ
                td.rounded_rectangle((x0, y0, x1, y1), radius=64 * S, fill=(255, 255, 255, 10), outline=(255, 255, 255, 40), width=3 * S)
            else:
                td.rounded_rectangle((x0, y0, x1, y1), radius=64 * S, fill=(255, 255, 255, 24), outline=(255, 255, 255, 60), width=3 * S)
    shadow = shadow.filter(ImageFilter.GaussianBlur(28 * S))
    base = img.convert('RGBA')
    base = Image.alpha_composite(base, shadow)
    base = Image.alpha_composite(base, tiles)
    d = ImageDraw.Draw(base)

    for (ci, ri), (key, label, sub) in cells.items():
        cx = (xs[ci] + xs[ci + 1]) / 2 * S
        top = (ys[ri] + pad) * S
        # アイコンバッジ（アクセント色のグラデーション角丸）
        bs = 270 * S
        bx0, by0 = int(cx - bs / 2), int(top + 92 * S)
        c0, c1 = ACCENT[key]
        grad = gradient(bs // 4, bs // 4, c0, c1).resize((bs, bs), Image.BICUBIC)
        mask = Image.new('L', (bs, bs), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, bs - 1, bs - 1), radius=int(bs * 0.3), fill=255)
        glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(glow).rounded_rectangle((bx0, by0 + 20 * S, bx0 + bs, by0 + bs + 20 * S), radius=int(bs * 0.3), fill=c1 + (110,))
        base = Image.alpha_composite(base, glow.filter(ImageFilter.GaussianBlur(30 * S)))
        base.paste(grad, (bx0, by0), mask)
        d = ImageDraw.Draw(base)
        ICONS[key](d, cx, by0 + bs / 2, bs * 0.78, int(15 * S))
        # ラベル
        d.text((cx, by0 + bs + 120 * S), label, font=f_label, fill=WHITE, anchor='mm')
        d.text((cx, by0 + bs + 222 * S), sub, font=f_sub, fill=(196, 204, 238), anchor='mm')

    # 上段中央：ロゴ（星マーク＋ホシコン）
    cx, cy = (834 + 1667) / 2 * S, 843 / 2 * S
    d.polygon(star_points(cx, cy - 120 * S, 96 * S, 40 * S), fill=GOLD)
    d.text((cx, cy + 60 * S), 'ホシコン', font=ImageFont.truetype(F_BOLD, 120 * S), fill=WHITE, anchor='mm')
    d.text((cx, cy + 170 * S), '管理者メニュー', font=ImageFont.truetype(F_MED, 50 * S), fill=(176, 186, 230), anchor='mm')

    out = base.convert('RGB').resize((W, H), Image.LANCZOS)
    out.save(OUT, 'JPEG', quality=90)
    print(OUT, os.path.getsize(OUT), 'bytes')


if __name__ == '__main__':
    main()
