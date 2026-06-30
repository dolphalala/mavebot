#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/opt/urba-apps/discord-bot/app}"
LOG_DIR="${LOG_DIR:-/opt/urba-apps/discord-bot/shared/logs}"
LOCK_FILE="${LOCK_FILE:-/opt/urba-apps/discord-bot/shared/poll-deploy.lock}"
CODEX_WORKER_DIR="${CODEX_WORKER_DIR:-/opt/urba-apps/discord-bot/shared/codex-worker}"
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
  if [ -f "$CODEX_WORKER_DIR/restart-needed" ] &&
    ! find "$CODEX_WORKER_DIR/processing" -maxdepth 1 -type f -name '*.json' -print -quit | grep -q .; then
    echo "Completing deferred Codex worker recreate."
    CODEX_WORKER_RESTART=always exec bash "$APP_ROOT/scripts/deploy-server.sh"
  fi
  echo "No changes: $local_sha."
  exit 0
fi

echo "Deploying $local_sha -> $remote_sha."
exec bash "$APP_ROOT/scripts/deploy-server.sh"
