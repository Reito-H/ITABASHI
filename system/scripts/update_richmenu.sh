#!/bin/bash
# リッチメニューのアクション設定を確認・更新するスクリプト
# 使い方: LINE_TOKEN="YOUR_TOKEN" bash scripts/update_richmenu.sh

LINE_TOKEN="${LINE_TOKEN:-}"
if [ -z "$LINE_TOKEN" ]; then
  echo "エラー: LINE_TOKEN 環境変数を設定してください"
  echo "例: LINE_TOKEN='YOUR_CHANNEL_ACCESS_TOKEN' bash scripts/update_richmenu.sh"
  exit 1
fi

MENU_ID_P1="richmenu-7ddc3e80e06b72a49103d5237a89a4ee"
MENU_ID_P2="richmenu-81a0e64f41558aeb4747a494537b80b4"

echo "=== PATTERN1 リッチメニュー構造 ==="
curl -s -H "Authorization: Bearer $LINE_TOKEN" \
  "https://api.line.me/v2/bot/richmenu/$MENU_ID_P1" | python3 -m json.tool

echo ""
echo "=== PATTERN2/3 リッチメニュー構造 ==="
curl -s -H "Authorization: Bearer $LINE_TOKEN" \
  "https://api.line.me/v2/bot/richmenu/$MENU_ID_P2" | python3 -m json.tool
