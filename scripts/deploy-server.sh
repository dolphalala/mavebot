#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/opt/urba-apps/discord-bot/app}"
APP_ENV="${APP_ENV:-/opt/urba-apps/discord-bot/.env}"
LOG_DIR="${LOG_DIR:-/opt/urba-apps/discord-bot/shared/logs}"
LOCK_FILE="${LOCK_FILE:-/opt/urba-apps/discord-bot/shared/deploy.lock}"
BRANCH="${BRANCH:-main}"

mkdir -p "$LOG_DIR" "$(dirname "$LOCK_FILE")"
exec >>"$LOG_DIR/deploy.log" 2>&1

echo "=== deploy $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Deploy already running; exiting."
  exit 0
fi

if [ ! -d "$APP_ROOT/.git" ]; then
  echo "ERROR: $APP_ROOT is not a git checkout."
  exit 1
fi

if [ ! -f "$APP_ENV" ]; then
  echo "ERROR: missing $APP_ENV."
  exit 1
fi

git -C "$APP_ROOT" fetch origin "$BRANCH"
git -C "$APP_ROOT" checkout "$BRANCH"
git -C "$APP_ROOT" merge --ff-only "origin/$BRANCH"

docker compose -f "$APP_ROOT/docker-compose.yml" config --quiet
docker compose -f "$APP_ROOT/docker-compose.yml" build

has_value() {
  local key="$1"
  grep -Eq "^${key}=.+" "$APP_ENV"
}

if ! has_value DISCORD_TOKEN || ! has_value DISCORD_CLIENT_ID || ! has_value DISCORD_GUILD_ID; then
  echo "Discord credentials are not complete. Built image only; runtime start skipped."
  exit 0
fi

docker compose -f "$APP_ROOT/docker-compose.yml" run --rm discord-bot npm run register
docker compose -f "$APP_ROOT/docker-compose.yml" up -d

for _ in $(seq 1 20); do
  if curl --fail --silent --show-error http://127.0.0.1:4188/healthz >/dev/null; then
    echo "Health check passed."
    docker compose -f "$APP_ROOT/docker-compose.yml" ps
    exit 0
  fi
  sleep 2
done

echo "ERROR: health check failed."
docker compose -f "$APP_ROOT/docker-compose.yml" ps || true
docker logs --tail=100 urba-discord-bot || true
exit 1
