#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/opt/urba-apps/discord-bot/app}"
APP_ENV="${APP_ENV:-/opt/urba-apps/discord-bot/.env}"
SLACK_ENV="${SLACK_ENV:-/opt/urba-apps/discord-bot/slack-bridge.env}"
SLACK_MEMORY_FILE="${SLACK_MEMORY_FILE:-/opt/urba-apps/discord-bot/shared/slack-memory.jsonl}"
SLACK_CODEX_STATE_FILE="${SLACK_CODEX_STATE_FILE:-/opt/urba-apps/discord-bot/shared/codex-forward-state.json}"
SLACK_USER_TOKEN_FILE="${SLACK_USER_TOKEN_FILE:-/opt/urba-apps/discord-bot/shared/slack-user-tokens.json}"
ENABLE_SLACK_BRIDGE="${ENABLE_SLACK_BRIDGE:-0}"
CODEX_HOME_DIR="${CODEX_HOME_DIR:-/opt/urba-apps/discord-bot/codex-home}"
CODEX_WORKER_DIR="${CODEX_WORKER_DIR:-/opt/urba-apps/discord-bot/shared/codex-worker}"
CODEX_WORKER_RESTART="${CODEX_WORKER_RESTART:-auto}"
CODEX_WORKER_STALE_SECONDS="${CODEX_WORKER_STALE_SECONDS:-900}"
LEGENDS_STORE_FILE="${LEGENDS_STORE_FILE:-/opt/urba-apps/discord-bot/shared/legends-tracking.json}"
CLASH_HISTORY_STORE_FILE="${CLASH_HISTORY_STORE_FILE:-/opt/urba-apps/discord-bot/shared/clash-history.json}"
ELDER_STORE_FILE="${ELDER_STORE_FILE:-/opt/urba-apps/discord-bot/shared/elder-votes.json}"
PICTIONARY_STORE_FILE="${PICTIONARY_STORE_FILE:-/opt/urba-apps/discord-bot/shared/pictionary-leaderboard.json}"
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

if [ ! -f "$SLACK_ENV" ]; then
  install -m 600 /dev/null "$SLACK_ENV"
fi

if [ "$ENABLE_SLACK_BRIDGE" = "1" ]; then
  mkdir -p "$(dirname "$SLACK_MEMORY_FILE")"
  touch "$SLACK_MEMORY_FILE"
  chmod 755 "$(dirname "$SLACK_MEMORY_FILE")"
  chmod 600 "$SLACK_MEMORY_FILE"
  chown 1000:1000 "$SLACK_MEMORY_FILE" 2>/dev/null || true
  if [ ! -s "$SLACK_CODEX_STATE_FILE" ]; then
    printf '{"forwarded":{}}\n' >"$SLACK_CODEX_STATE_FILE"
  fi
  chmod 600 "$SLACK_CODEX_STATE_FILE"
  chown 1000:1000 "$SLACK_CODEX_STATE_FILE" 2>/dev/null || true
  if [ ! -s "$SLACK_USER_TOKEN_FILE" ]; then
    printf '{"users":{}}\n' >"$SLACK_USER_TOKEN_FILE"
  fi
  chmod 600 "$SLACK_USER_TOKEN_FILE"
  chown 1000:1000 "$SLACK_USER_TOKEN_FILE" 2>/dev/null || true
fi
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
mkdir -p \
  "$CODEX_HOME_DIR" \
  "$CODEX_WORKER_DIR/jobs" \
  "$CODEX_WORKER_DIR/processing" \
  "$CODEX_WORKER_DIR/done" \
  "$CODEX_WORKER_DIR/failed" \
  "$CODEX_WORKER_DIR/context" \
  "$CODEX_WORKER_DIR/context/discord-files" \
  "$CODEX_WORKER_DIR/context/slack-files" \
  "$CODEX_WORKER_DIR/repo"
chmod 700 "$CODEX_HOME_DIR" "$CODEX_WORKER_DIR" || true
chown -R 1000:1000 "$CODEX_HOME_DIR" "$CODEX_WORKER_DIR" 2>/dev/null || true

git -C "$APP_ROOT" fetch origin "$BRANCH"
git -C "$APP_ROOT" checkout "$BRANCH"
git -C "$APP_ROOT" merge --ff-only "origin/$BRANCH"

docker compose -f "$APP_ROOT/docker-compose.yml" config --quiet
if [ "$ENABLE_SLACK_BRIDGE" = "1" ]; then
  docker compose -f "$APP_ROOT/docker-compose.yml" --profile codex-worker --profile legacy-slack build discord-bot slack-bridge codex-worker
else
  docker compose -f "$APP_ROOT/docker-compose.yml" --profile codex-worker build discord-bot codex-worker
fi

has_value() {
  local key="$1"
  awk -F= -v key="$key" '
    $1 == key {
      value = substr($0, length($1) + 2)
      gsub(/[[:space:]]/, "", value)
      if (value != "") {
        found = 1
      }
    }
    END { exit found ? 0 : 1 }
  ' "$APP_ENV"
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
if [ "$ENABLE_SLACK_BRIDGE" = "1" ]; then
  docker compose -f "$APP_ROOT/docker-compose.yml" --profile legacy-slack up -d discord-bot slack-bridge
else
  docker compose -f "$APP_ROOT/docker-compose.yml" up -d discord-bot
  docker compose -f "$APP_ROOT/docker-compose.yml" --profile legacy-slack stop slack-bridge >/dev/null 2>&1 || true
  docker compose -f "$APP_ROOT/docker-compose.yml" --profile legacy-slack rm -f slack-bridge >/dev/null 2>&1 || true
fi

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
    docker compose -f "$APP_ROOT/docker-compose.yml" ps
    exit 0
  fi
  sleep 2
done

echo "ERROR: health check failed."
docker compose -f "$APP_ROOT/docker-compose.yml" ps || true
docker logs --tail=100 urba-discord-bot || true
exit 1
