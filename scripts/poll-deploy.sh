#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/opt/urba-apps/discord-bot/app}"
LOG_DIR="${LOG_DIR:-/opt/urba-apps/discord-bot/shared/logs}"
LOCK_FILE="${LOCK_FILE:-/opt/urba-apps/discord-bot/shared/poll-deploy.lock}"
BRANCH="${BRANCH:-main}"

mkdir -p "$LOG_DIR" "$(dirname "$LOCK_FILE")"
exec >>"$LOG_DIR/poll-deploy.log" 2>&1

echo "=== poll $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Deploy poll already running; exiting."
  exit 0
fi

if [ ! -d "$APP_ROOT/.git" ]; then
  echo "ERROR: $APP_ROOT is not a git checkout."
  exit 1
fi

git -C "$APP_ROOT" fetch origin "$BRANCH"

local_sha="$(git -C "$APP_ROOT" rev-parse HEAD)"
remote_sha="$(git -C "$APP_ROOT" rev-parse "origin/$BRANCH")"

if [ "$local_sha" = "$remote_sha" ]; then
  echo "No changes: $local_sha."
  exit 0
fi

echo "Deploying $local_sha -> $remote_sha."
exec "$APP_ROOT/scripts/deploy-server.sh"
