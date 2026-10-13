#!/usr/bin/env bash
# Cloudflare操作用ラッパー。リポジトリ直下の .env から認証情報を読み込み、
# system/ ディレクトリで wrangler を実行する。
#
# 使い方（引数はそのまま wrangler に渡す）:
#   .claude/skills/cloudflare/cf-wrangler.sh deploy
#   .claude/skills/cloudflare/cf-wrangler.sh d1 execute staff-db --remote --file=src/db/migration_156.sql
#   .claude/skills/cloudflare/cf-wrangler.sh secret put SR_PASSWORD
#   .claude/skills/cloudflare/cf-wrangler.sh tail
#
# 別のWorkerプロジェクト（例: km-ui/cloudflare-worker）を操作する場合は CF_WRANGLER_DIR で
# 実行ディレクトリをリポジトリ相対で指定する（この場合はバージョン自動更新をしない）:
#   CF_WRANGLER_DIR=km-ui/cloudflare-worker .claude/skills/cloudflare/cf-wrangler.sh deploy
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "エラー: $ENV_FILE が見つかりません。Cloudflare認証情報を .env に保存してください。" >&2
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

WORK_DIR="$ROOT_DIR/${CF_WRANGLER_DIR:-system}"

if [ "${1:-}" = "deploy" ] && [ -z "${CF_WRANGLER_DIR:-}" ]; then
  node "$ROOT_DIR/scripts/bump_version.mjs"
fi

cd "$WORK_DIR"
exec npx wrangler "$@"
