# チュートリアル用 画面写真の撮り直し手順

管理画面「設定 → チュートリアル」に載せている画面写真（赤丸番号つき）を、ローカル環境で自動撮影して R2 に置くためのツールです。
本文は `system/src/html/tutorial_content.ts`、表示ルートは `system/src/routes/admin_tutorial.ts`。

画面の見た目が変わったら、ここで撮り直して R2 の `tutorial/<name>.webp` を差し替えるだけで、本文のコードはそのまま使えます。

## 1. 準備（1回だけ）

```bash
pip3 install playwright pillow && python3 -m playwright install chromium
```

ローカルD1に `admin` アカウントが必要です（パスワードは自分で決めてローカルDBに設定する。本番の値は使わない）。

## 2. 開発サーバーを HTTPS で起動

```bash
cd system && npx wrangler dev --port 8787 --local-protocol https
```

HTTP だと bentenclub.com 向けのリダイレクトに当たるため、必ず `--local-protocol https`。撮影スクリプトは `CF-IPCountry: JP` ヘッダーを付けて国外ブロックも回避します。

## 3. 撮影

```bash
cd scripts/tutorial_screenshots
python3 spec.py                                  # 撮影リスト spec.json を生成
HOSHIKON_LOCAL_ADMIN_PW='（ローカルadminのパスワード）' python3 shoot.py spec.json out
```

`out/<name>.png`（赤丸つき）と `out/<name>.raw.png`（元画像）ができます。
赤丸の位置は `spec.py` の `marks`（CSSセレクタ or Playwright の `:has-text()`）で決めています。マークが見つからないと `mark failed` と出るので、セレクタを直して撮り直してください。

## 4. WebP に変換して R2 へ

```bash
python3 - <<'EOF'
from PIL import Image; from pathlib import Path
Path('final').mkdir(exist_ok=True)
for p in Path('out').glob('*.png'):
    if p.name.endswith('.raw.png'): continue
    im = Image.open(p).convert('RGB')
    if im.width > 2000: im = im.resize((2000, int(im.height * 2000 / im.width)), Image.LANCZOS)
    im.save(f'final/{p.stem}.webp', 'WEBP', quality=78, method=6)
EOF
```

ローカル確認用（ローカルR2）:

```bash
cd ../../system && for f in ../scripts/tutorial_screenshots/final/*.webp; do npx wrangler r2 object put "benten-documents/tutorial/$(basename $f)" --file="$f" --content-type image/webp --local; done
```

本番R2へは `cloudflare` スキル（`.claude/skills/cloudflare/cf-wrangler.sh r2 object put ... --remote`）経由で、必ず事前にユーザー確認を取ってから実行する。

## 注意

- 社員名が写るページ（社員管理・個人別シフト・出勤者ボード）は `spec.py` 側で名前らしい文字列をぼかしてから撮っています。
- 新しい節に写真を足すときは `tutorial_content.ts` の `figures[].img` と `spec.py` の `name` を同じにする。
