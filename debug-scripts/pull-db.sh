#!/usr/bin/env bash
set -euo pipefail

PKG="cc.getportal.portal"
SRC_DIR="files/SQLite"
DEST_DIR="."

adb exec-out run-as "$PKG" cat "$SRC_DIR/portal-app.db" > "$DEST_DIR/portal-app.db"
adb exec-out run-as "$PKG" cat "$SRC_DIR/portal-app.db-shm" > "$DEST_DIR/portal-app.db-shm" || true
adb exec-out run-as "$PKG" cat "$SRC_DIR/portal-app.db-wal" > "$DEST_DIR/portal-app.db-wal" || true

echo "Downloaded to:"
echo "  $DEST_DIR/portal-app.db"
echo "  $DEST_DIR/portal-app.db-shm (if present)"
echo "  $DEST_DIR/portal-app.db-wal (if present)"

