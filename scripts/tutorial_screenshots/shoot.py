#!/usr/bin/env python3
"""ホシコン管理画面のスクリーンショット撮影ツール（チュートリアル用）

前提: `npx wrangler dev --port 8787 --local-protocol https` が起動していること。詳細は同じフォルダの README.md

使い方:
  python3 shoot.py spec.json out_dir
spec.json: [{ "name": "home", "url": "/s7db8q6wys/admin", "wait": 1500,
              "pre": ["click:css", "hide:css", "eval:js", "scroll:css", "type:css|text"],
              "clip": "css"(任意・この要素だけ切り抜き), "full": true(任意・ページ全体),
              "marks": [{"sel": "css", "label": "1"}, ...](任意・赤枠と番号),
              "viewport": [w,h](任意) }, ...]
出力: out_dir/<name>.png（注釈つき）, out_dir/<name>.raw.png（元画像）
"""
import json, sys, os, time
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont

BASE = 'https://localhost:8787'
ADMIN = '/s7db8q6wys/admin'
# ローカルD1の admin パスワードは環境変数 HOSHIKON_LOCAL_ADMIN_PW で渡す（ファイルに書かない）
ADMIN_PW = os.environ.get('HOSHIKON_LOCAL_ADMIN_PW', '')
DPR = 2
FONT = '/System/Library/Fonts/Helvetica.ttc'

HIDE_ALWAYS = ['#limit-alert-overlay', '#cm-popup-overlay', '#birthday-overlay', '.seasonal-fx', '#seasonal-fx']


def annotate(png_path, marks):
    im = Image.open(png_path).convert('RGB')
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype(FONT, 22 * DPR // 2 + 8)
    except Exception:
        font = ImageFont.load_default()
    for m in marks:
        x, y, w, h = [v * DPR for v in m['box']]
        pad = 6
        d.rounded_rectangle([x - pad, y - pad, x + w + pad, y + h + pad], radius=10, outline=(220, 38, 38), width=5)
        if m.get('label'):
            r = 22
            cx, cy = x - pad, y - pad
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(220, 38, 38))
            tw = d.textlength(str(m['label']), font=font)
            d.text((cx - tw / 2, cy - r + 6), str(m['label']), fill='white', font=font)
    im.save(png_path)


def run(spec, out):
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    pw = ADMIN_PW
    if not pw:
        raise SystemExit('HOSHIKON_LOCAL_ADMIN_PW が未設定です（README参照）')
    with sync_playwright() as p:
        br = p.chromium.launch()
        ctx = br.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=DPR,
                             ignore_https_errors=True, extra_http_headers={'CF-IPCountry': 'JP'},
                             locale='ja-JP')
        page = ctx.new_page()
        page.goto(BASE + ADMIN + '/login?mode=pc')
        page.fill('input[name=username], input[placeholder=ID]', 'admin')
        page.fill('input[type=password]', pw)
        page.click('button[type=submit]')
        page.wait_for_load_state('networkidle')
        fresh_ctx = None
        for s in spec:
            name = s['name']
            if s.get('fresh'):
                # 未ログイン状態の画面（ログイン画面など）は別コンテキストで撮る
                fresh_ctx = br.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=DPR,
                                           ignore_https_errors=True, extra_http_headers={'CF-IPCountry': 'JP'}, locale='ja-JP')
                page_main, page = page, fresh_ctx.new_page()
            if s.get('viewport'):
                page.set_viewport_size({'width': s['viewport'][0], 'height': s['viewport'][1]})
            else:
                page.set_viewport_size({'width': 1440, 'height': 900})
            url = s['url'] if s['url'].startswith('http') else BASE + s['url']
            try:
                page.goto(url, wait_until='networkidle', timeout=30000)
            except Exception as e:
                print(f'[{name}] goto warn: {e}')
            time.sleep(s.get('wait', 1200) / 1000)
            page.add_style_tag(content=','.join(HIDE_ALWAYS) + '{display:none !important}')
            for step in s.get('pre', []):
                kind, _, arg = step.partition(':')
                try:
                    if kind == 'click':
                        page.click(arg, timeout=5000)
                    elif kind == 'hide':
                        page.add_style_tag(content=arg + '{display:none !important}')
                    elif kind == 'eval':
                        page.evaluate(arg)
                    elif kind == 'scroll':
                        page.locator(arg).first.scroll_into_view_if_needed(timeout=5000)
                    elif kind == 'type':
                        sel, _, text = arg.partition('|')
                        page.fill(sel, text, timeout=5000)
                    elif kind == 'wait':
                        time.sleep(float(arg))
                    elif kind == 'hover':
                        page.hover(arg, timeout=5000)
                except Exception as e:
                    print(f'[{name}] pre "{step}" failed: {e}')
                time.sleep(0.4)
            time.sleep(0.5)
            marks = []
            for m in s.get('marks', []):
                try:
                    loc = page.locator(m['sel']).first
                    bb = loc.bounding_box(timeout=4000)
                    if bb:
                        marks.append({'box': [bb['x'], bb['y'], bb['width'], bb['height']], 'label': m.get('label')})
                    else:
                        print(f'[{name}] mark not visible: {m["sel"]}')
                except Exception as e:
                    print(f'[{name}] mark failed {m["sel"]}: {e}')
            raw = out / f'{name}.raw.png'
            if s.get('clip'):
                page.locator(s['clip']).first.screenshot(path=str(raw))
                # clip時は座標がずれるので注釈は要素基準に補正
                cb = page.locator(s['clip']).first.bounding_box()
                for m in marks:
                    m['box'][0] -= cb['x']; m['box'][1] -= cb['y']
            else:
                page.screenshot(path=str(raw), full_page=bool(s.get('full')))
            final = out / f'{name}.png'
            import shutil; shutil.copy(raw, final)
            if marks:
                annotate(final, marks)
            print(f'[{name}] ok ({len(marks)} marks) -> {final}')
            if s.get('fresh'):
                page.close(); fresh_ctx.close(); page = page_main
        br.close()


if __name__ == '__main__':
    spec = json.loads(Path(sys.argv[1]).read_text())
    run(spec, sys.argv[2])
