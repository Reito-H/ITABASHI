#!/usr/bin/env python3
"""
LINE リッチメニュー セットアップスクリプト
実行前に環境変数を設定:
  export LINE_CHANNEL_ACCESS_TOKEN=xxxxx
または実行時に入力プロンプトが表示されます。

実行:
  cd /Users/reito/NC/ITABASHI
  python3 scripts/setup_richmenu.py
"""

import os
import sys
import json
import urllib.request

IMAGE_PATTERN3 = "/Users/reito/.claude/image-cache/db4a75a0-534f-42f2-9236-decbc19a0f2b/1.png"
IMAGE_PATTERN2 = "/Users/reito/.claude/image-cache/db4a75a0-534f-42f2-9236-decbc19a0f2b/2.png"

# 実際の画像サイズ（PIL で確認済み）
SIZE_PATTERN3 = {"width": 2000, "height": 674}
SIZE_PATTERN2 = {"width": 2000, "height": 1349}

# パターン2 のセル計算
W = 2000
H2 = 1349
COL_W = W // 3           # 666
COL_W_LAST = W - COL_W * 2  # 668
ROW_H = H2 // 2          # 674
ROW_H_LAST = H2 - ROW_H  # 675

RICHMENU_PATTERN3 = {
    "size": SIZE_PATTERN3,
    "selected": True,
    "name": "パターン3_未連携",
    "chatBarText": "メニュー",
    "areas": [
        {
            "bounds": {"x": 0, "y": 0, "width": SIZE_PATTERN3["width"], "height": SIZE_PATTERN3["height"]},
            "action": {"type": "message", "text": "車番連携"}
        }
    ]
}

RICHMENU_PATTERN2 = {
    "size": SIZE_PATTERN2,
    "selected": True,
    "name": "パターン2_班長指導者",
    "chatBarText": "メニュー",
    "areas": [
        {
            "bounds": {"x": 0, "y": 0, "width": COL_W, "height": ROW_H},
            "action": {"type": "message", "text": "車番検索"}
        }
    ]
}


def line_api(method: str, path: str, token: str, data=None, binary=None, content_type="application/json"):
    url = f"https://api.line.me{path}"
    headers = {"Authorization": f"Bearer {token}"}

    if binary is not None:
        body = binary
        headers["Content-Type"] = content_type
    elif data is not None:
        body = json.dumps(data).encode()
        headers["Content-Type"] = "application/json"
    else:
        body = None

    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as e:
        print(f"  ERROR {e.code}: {e.read().decode()}")
        sys.exit(1)


def create_and_upload(token: str, menu_def: dict, image_path: str, label: str) -> str:
    print(f"\n[{label}] リッチメニューを作成中...")
    result = line_api("POST", "/v2/bot/richmenu", token, data=menu_def)
    menu_id = result["richMenuId"]
    print(f"  作成完了: {menu_id}")

    print(f"[{label}] 画像をアップロード中...")
    with open(image_path, "rb") as f:
        img_data = f.read()
    line_api("POST", f"/v2/bot/richmenu/{menu_id}/content", token,
             binary=img_data, content_type="image/png")
    print(f"  アップロード完了")
    return menu_id


def set_default(token: str, menu_id: str):
    print(f"\nパターン3をデフォルトメニューに設定中...")
    line_api("POST", f"/v2/bot/user/all/richmenu/{menu_id}", token)
    print(f"  設定完了")


def update_wrangler(p2_id: str, p3_id: str):
    toml_path = "/Users/reito/NC/ITABASHI/system/wrangler.toml"
    with open(toml_path, "r") as f:
        content = f.read()
    content = content.replace('RICHMENU_ID_PATTERN2 = ""', f'RICHMENU_ID_PATTERN2 = "{p2_id}"')
    content = content.replace('RICHMENU_ID_PATTERN3 = ""', f'RICHMENU_ID_PATTERN3 = "{p3_id}"')
    with open(toml_path, "w") as f:
        f.write(content)
    print(f"\nwrangler.toml を更新しました")


def main():
    token = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN", "").strip()
    if not token:
        token = input("LINE_CHANNEL_ACCESS_TOKEN を入力してください: ").strip()
    if not token:
        print("トークンが未入力です。終了します。")
        sys.exit(1)

    # パターン3 作成・アップロード・デフォルト設定
    p3_id = create_and_upload(token, RICHMENU_PATTERN3, IMAGE_PATTERN3, "パターン3（未連携）")
    set_default(token, p3_id)

    # パターン2 作成・アップロード
    p2_id = create_and_upload(token, RICHMENU_PATTERN2, IMAGE_PATTERN2, "パターン2（班長・指導者）")

    # wrangler.toml を自動更新
    update_wrangler(p2_id, p3_id)

    print("\n" + "="*50)
    print("セットアップ完了！")
    print(f"  RICHMENU_ID_PATTERN2 = {p2_id}")
    print(f"  RICHMENU_ID_PATTERN3 = {p3_id}")
    print("\n次のステップ:")
    print("  1. LINE OA Manager でパターン1（新人社員用）の既存メニューIDを確認")
    print("  2. wrangler.toml の RICHMENU_ID_PATTERN1 に記入")
    print("  3. cd system && npm run deploy")
    print("="*50)


if __name__ == "__main__":
    main()
