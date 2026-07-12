#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/opt/urba-apps/discord-bot/app}"
APP_ENV="${APP_ENV:-/opt/urba-apps/discord-bot/.env}"
CODEX_WORKER_ENV="${CODEX_WORKER_ENV:-/opt/urba-apps/discord-bot/codex-worker.env}"
CODEX_HOME_DIR="${CODEX_HOME_DIR:-/opt/urba-apps/discord-bot/codex-home}"
CODEX_WORKER_DIR="${CODEX_WORKER_DIR:-/opt/urba-apps/discord-bot/shared/codex-worker}"
CODEX_WORKER_RESTART="${CODEX_WORKER_RESTART:-auto}"
CODEX_WORKER_STALE_SECONDS="${CODEX_WORKER_STALE_SECONDS:-900}"
LEGENDS_STORE_FILE="${LEGENDS_STORE_FILE:-/opt/urba-apps/discord-bot/shared/legends-tracking.json}"
CLASH_HISTORY_STORE_FILE="${CLASH_HISTORY_STORE_FILE:-/opt/urba-apps/discord-bot/shared/clash-history.json}"
ELDER_STORE_FILE="${ELDER_STORE_FILE:-/opt/urba-apps/discord-bot/shared/elder-votes.json}"
PICTIONARY_STORE_FILE="${PICTIONARY_STORE_FILE:-/opt/urba-apps/discord-bot/shared/pictionary-leaderboard.json}"
BASE_MARKETPLACE_DB_PASSWORD_FILE="${BASE_MARKETPLACE_DB_PASSWORD_FILE:-/opt/urba-apps/discord-bot/shared/base-marketplace-db-password}"
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

if [ ! -f "$CODEX_WORKER_ENV" ]; then
  install -m 600 /dev/null "$CODEX_WORKER_ENV"
fi

env_has_value() {
  local file="$1"
  local key="$2"
  [ -f "$file" ] || return 1
  awk -F= -v key="$key" '
    $1 == key {
      value = substr($0, length($1) + 2)
      gsub(/[[:space:]]/, "", value)
      if (value != "") {
        found = 1
      }
    }
    END { exit found ? 0 : 1 }
  ' "$file"
}

env_value() {
  local file="$1"
  local key="$2"
  awk -F= -v key="$key" '
    $1 == key {
      print substr($0, length($1) + 2)
      exit
    }
  ' "$file"
}

if ! env_has_value "$CODEX_WORKER_ENV" GITHUB_TOKEN; then
  if env_has_value "$APP_ENV" GITHUB_TOKEN; then
    printf 'GITHUB_TOKEN=%s\n' "$(env_value "$APP_ENV" GITHUB_TOKEN)" >>"$CODEX_WORKER_ENV"
  fi
fi
chmod 600 "$CODEX_WORKER_ENV"

if [ ! -s "$LEGENDS_STORE_FILE" ]; then
  printf '{"version":1,"players":{},"scheduler":{"cursor":0}}\n' >"$LEGENDS_STORE_FILE"
fi
chmod 600 "$LEGENDS_STORE_FILE"
chown 1000:1000 "$LEGENDS_STORE_FILE" 2>/dev/null || true
if [ ! -s "$CLASH_HISTORY_STORE_FILE" ]; then
  printf '{"version":1,"tracked":{"players":{},"clans":{},"wars":{}},"players":{},"clans":{},"wars":{},"cwlGroups":{},"scheduler":{"cursor":0,"lastRunAt":null,"lastAction":null,"lastError":null}}\n' >"$CLASH_HISTORY_STORE_FILE"
fi
chmod 600 "$CLASH_HISTORY_STORE_FILE"
chown 1000:1000 "$CLASH_HISTORY_STORE_FILE" 2>/dev/null || true
if [ ! -s "$ELDER_STORE_FILE" ]; then
  printf '{"version":1,"guilds":{}}\n' >"$ELDER_STORE_FILE"
fi
chmod 600 "$ELDER_STORE_FILE"
chown 1000:1000 "$ELDER_STORE_FILE" 2>/dev/null || true
if [ ! -s "$PICTIONARY_STORE_FILE" ]; then
  printf '{"version":1,"guilds":{}}\n' >"$PICTIONARY_STORE_FILE"
fi
chmod 600 "$PICTIONARY_STORE_FILE"
chown 1000:1000 "$PICTIONARY_STORE_FILE" 2>/dev/null || true
if [ ! -s "$BASE_MARKETPLACE_DB_PASSWORD_FILE" ]; then
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24 >"$BASE_MARKETPLACE_DB_PASSWORD_FILE"
  else
    python3 - <<'PY' >"$BASE_MARKETPLACE_DB_PASSWORD_FILE"
import secrets
print(secrets.token_hex(24))
PY
  fi
fi
chmod 600 "$BASE_MARKETPLACE_DB_PASSWORD_FILE"
chown 1000:1000 "$BASE_MARKETPLACE_DB_PASSWORD_FILE" 2>/dev/null || true
mkdir -p \
  "$CODEX_HOME_DIR" \
  "$CODEX_WORKER_DIR/jobs" \
  "$CODEX_WORKER_DIR/processing" \
  "$CODEX_WORKER_DIR/done" \
  "$CODEX_WORKER_DIR/failed" \
  "$CODEX_WORKER_DIR/context" \
  "$CODEX_WORKER_DIR/context/discord-files" \
  "$CODEX_WORKER_DIR/repo"
chmod 700 "$CODEX_HOME_DIR" "$CODEX_WORKER_DIR" || true
chown -R 1000:1000 "$CODEX_HOME_DIR" "$CODEX_WORKER_DIR" 2>/dev/null || true

git -C "$APP_ROOT" fetch origin "$BRANCH"
git -C "$APP_ROOT" checkout "$BRANCH"
git -C "$APP_ROOT" merge --ff-only "origin/$BRANCH"

docker compose -f "$APP_ROOT/docker-compose.yml" config --quiet
docker compose -f "$APP_ROOT/docker-compose.yml" --profile codex-worker build discord-bot codex-worker base-marketplace-web
docker compose -f "$APP_ROOT/docker-compose.yml" up -d base-marketplace-db

has_value() {
  env_has_value "$APP_ENV" "$1"
}

if ! has_value DISCORD_TOKEN || ! has_value DISCORD_CLIENT_ID; then
  echo "Discord token/client ID are not complete. Built image only; runtime start skipped."
  exit 0
fi

if has_value DISCORD_GUILD_ID; then
  echo "Registering guild-scoped slash commands."
else
  echo "Registering global slash commands because DISCORD_GUILD_ID is blank."
fi

docker compose -f "$APP_ROOT/docker-compose.yml" run --rm discord-bot npm run register
docker compose -f "$APP_ROOT/docker-compose.yml" up -d discord-bot base-marketplace-web

requeue_stale_worker_jobs() {
  local processing_dir="$CODEX_WORKER_DIR/processing"
  local jobs_dir="$CODEX_WORKER_DIR/jobs"

  [ -d "$processing_dir" ] || return 0
  find "$processing_dir" -maxdepth 1 -type f -name '*.json' -mmin "+$((CODEX_WORKER_STALE_SECONDS / 60))" -print0 |
    while IFS= read -r -d '' job_file; do
      echo "Requeueing stale worker job $(basename "$job_file")."
      mv "$job_file" "$jobs_dir/$(basename "$job_file")"
      chown 1000:1000 "$jobs_dir/$(basename "$job_file")" 2>/dev/null || true
    done
}

worker_has_processing_jobs() {
  find "$CODEX_WORKER_DIR/processing" -maxdepth 1 -type f -name '*.json' -print -quit | grep -q .
}

maybe_recreate_codex_worker() {
  local marker="$CODEX_WORKER_DIR/restart-needed"

  if [ "$CODEX_WORKER_RESTART" = "never" ]; then
    echo "Codex worker recreate skipped by CODEX_WORKER_RESTART=never."
    return 0
  fi

  requeue_stale_worker_jobs

  if [ "$CODEX_WORKER_RESTART" != "always" ] && worker_has_processing_jobs; then
    echo "Codex worker has active processing jobs; built image and deferred recreate."
    touch "$marker"
    chown 1000:1000 "$marker" 2>/dev/null || true
    return 0
  fi

  docker compose -f "$APP_ROOT/docker-compose.yml" --profile codex-worker up -d --no-deps --force-recreate codex-worker
  rm -f "$marker"
}

maybe_recreate_codex_worker

for _ in $(seq 1 20); do
  if curl --fail --silent --show-error http://127.0.0.1:4188/healthz >/dev/null; then
    echo "Health check passed."
    bot_health=1
    break
  fi
  sleep 2
done

for _ in $(seq 1 20); do
  if curl --fail --silent --show-error http://127.0.0.1:4192/healthz >/dev/null; then
    echo "Marketplace health check passed."
    marketplace_health=1
    break
  fi
  sleep 2
done

if [ "${bot_health:-0}" = "1" ] && [ "${marketplace_health:-0}" = "1" ]; then
  docker compose -f "$APP_ROOT/docker-compose.yml" ps
  exit 0
fi

echo "ERROR: health check failed."
docker compose -f "$APP_ROOT/docker-compose.yml" ps || true
docker logs --tail=100 urba-discord-bot || true
docker logs --tail=100 urba-base-marketplace-web || true
exit 1
