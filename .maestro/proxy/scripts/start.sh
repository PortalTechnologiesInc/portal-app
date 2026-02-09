#!/usr/bin/env bash
set -euo pipefail

# Resolve paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROXY_ROOT="${SCRIPT_DIR%/scripts}"
PID_FILE="${SCRIPT_DIR}/server.pid"

# Generate a random TCP port in the ephemeral range
PORT=$(( (RANDOM % 20000) + 40000 ))

# Start the proxy server in the background with the chosen port
(
  cd "${PROXY_ROOT}"

  # Auto-install dependencies on first run
  if [[ ! -d node_modules ]]; then
    npm install >/dev/null 2>&1
  fi

  PORT="${PORT}" HOST="127.0.0.1" npm run start >/dev/null 2>&1 &
  echo $! > "${PID_FILE}"
)

# Print the port to stdout for the caller (Maestro) to consume
echo "${PORT}"