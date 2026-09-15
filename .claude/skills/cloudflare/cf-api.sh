#!/usr/bin/env bash
# Cloudflare REST API 直接呼び出し用ラッパー（wranglerコマンドでカバーできない操作向け）。
# リポジトリ直下の .env から認証情報を読み込む。
#
# 使い方:
#   .claude/skills/cloudflare/cf-api.sh <METHOD> <path> [JSON body]
#
# <path> 中の {account_id} は自動的に .env の CLOUDFLARE_ACCOUNT_ID に置換される。
#
# 例:
#   .claude/skills/cloudflare/cf-api.sh GET /accounts/{account_id}/workers/scripts
#   .claude/skills/cloudflare/cf-api.sh GET /accounts/{account_id}/d1/database
#   .claude/skills/cloudflare/cf-api.sh GET /user/tokens/verify
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "エラー: $ENV_FILE が見つかりません。" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "エラー: CLOUDFLARE_API_TOKEN が .env に設定されていません。" >&2
  exit 1
fi

METHOD="${1:?METHOD (GET/POST/PUT/PATCH/DELETE) を指定してください}"
PATH_RAW="${2:?APIパス (例: /accounts/ACCOUNT_ID/workers/scripts) を指定してください}"
BODY="${3:-}"

PATH_RESOLVED="${PATH_RAW//\{account_id\}/$CLOUDFLARE_ACCOUNT_ID}"

if [ -n "$BODY" ]; then
  curl -sS -X "$METHOD" "https://api.cloudflare.com/client/v4${PATH_RESOLVED}" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "$BODY"
else
  curl -sS -X "$METHOD" "https://api.cloudflare.com/client/v4${PATH_RESOLVED}" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"
fi
echo
