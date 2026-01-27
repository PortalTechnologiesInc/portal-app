#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <path-to-js-file> [server_url]" >&2
  echo "Env: SERVER_URL (default: http://127.0.0.1:3500)" >&2
  exit 2
fi

FILE="$1"
SERVER_URL="${2:-${SERVER_URL:-http://127.0.0.1:3500}}"

if [[ ! -f "$FILE" ]]; then
  echo "Error: file not found: $FILE" >&2
  exit 1
fi

curl -sS -X POST "${SERVER_URL%/}/eval" \
  -H 'content-type: text/plain; charset=utf-8' \
  --data-binary @"$FILE"


