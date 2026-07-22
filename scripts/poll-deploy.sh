#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/opt/urba-apps/discord-bot/app}"
LOG_DIR="${LOG_DIR:-/opt/urba-apps/discord-bot/shared/logs}"
LOCK_FILE="${LOCK_FILE:-/opt/urba-apps/discord-bot/shared/poll-deploy.lock}"
DEPLOY_NEEDED_FILE="${DEPLOY_NEEDED_FILE:-/opt/urba-apps/discord-bot/shared/deploy-needed}"
DEPLOY_FAILED_AT_FILE="${DEPLOY_FAILED_AT_FILE:-/opt/urba-apps/discord-bot/shared/deploy-failed-at}"
DEPLOY_RETRY_SECONDS="${DEPLOY_RETRY_SECONDS:-900}"
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

working_tree_status="$(git -C "$APP_ROOT" status --porcelain --untracked-files=normal)"
if [ -n "$working_tree_status" ]; then
  echo "ERROR: refusing poll deploy because the production checkout has uncommitted changes."
  echo "Edit a local clone, commit the change, and push origin/$BRANCH instead of editing $APP_ROOT directly."
  printf '%s\n' "$working_tree_status"
  exit 1
fi

git -C "$APP_ROOT" fetch origin "$BRANCH"

local_sha="$(git -C "$APP_ROOT" rev-parse HEAD)"
remote_sha="$(git -C "$APP_ROOT" rev-parse "origin/$BRANCH")"

deploy_retry_allowed() {
  local failed_at
  local now

  [ -f "$DEPLOY_FAILED_AT_FILE" ] || return 0
  failed_at="$(cat "$DEPLOY_FAILED_AT_FILE" 2>/dev/null || echo 0)"
  case "$failed_at" in
    ''|*[!0-9]*) failed_at=0 ;;
  esac
  now="$(date +%s)"

  [ $((now - failed_at)) -ge "$DEPLOY_RETRY_SECONDS" ]
}

run_deploy() {
  touch "$DEPLOY_NEEDED_FILE"

  if ! deploy_retry_allowed; then
    echo "Deploy retry cooldown active; waiting before retrying."
    exit 0
  fi

  if bash "$APP_ROOT/scripts/deploy-server.sh"; then
    rm -f "$DEPLOY_NEEDED_FILE" "$DEPLOY_FAILED_AT_FILE"
    exit 0
  fi

  date +%s >"$DEPLOY_FAILED_AT_FILE"
  echo "Deploy failed; will retry after ${DEPLOY_RETRY_SECONDS}s."
  exit 1
}

if [ "$local_sha" = "$remote_sha" ]; then
  if [ -f "$DEPLOY_NEEDED_FILE" ]; then
    echo "Retrying previously failed deploy for $remote_sha."
    run_deploy
  fi
  echo "No changes: $local_sha."
  exit 0
fi

echo "Deploying $local_sha -> $remote_sha."
run_deploy
