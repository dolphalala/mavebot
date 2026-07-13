#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/opt/urba-apps/discord-bot/app}"
APP_ENV="${APP_ENV:-/opt/urba-apps/discord-bot/.env}"
LEGENDS_STORE_FILE="${LEGENDS_STORE_FILE:-/opt/urba-apps/discord-bot/shared/legends-tracking.json}"
CLASH_HISTORY_STORE_FILE="${CLASH_HISTORY_STORE_FILE:-/opt/urba-apps/discord-bot/shared/clash-history.json}"
ELDER_STORE_FILE="${ELDER_STORE_FILE:-/opt/urba-apps/discord-bot/shared/elder-votes.json}"
PICTIONARY_STORE_FILE="${PICTIONARY_STORE_FILE:-/opt/urba-apps/discord-bot/shared/pictionary-leaderboard.json}"
LOG_DIR="${LOG_DIR:-/opt/urba-apps/discord-bot/shared/logs}"
LOCK_FILE="${LOCK_FILE:-/opt/urba-apps/discord-bot/shared/deploy.lock}"
BRANCH="${BRANCH:-main}"
DEPLOY_MIN_AVAILABLE_KB="${DEPLOY_MIN_AVAILABLE_KB:-393216}"
DEPLOY_HEADROOM_WAIT_SECONDS="${DEPLOY_HEADROOM_WAIT_SECONDS:-300}"
CHATWOOT_HEALTH_URL="${CHATWOOT_HEALTH_URL:-https://chat.urba.group/}"
CHATWOOT_HEALTH_CHECK="${CHATWOOT_HEALTH_CHECK:-1}"

export COMPOSE_PARALLEL_LIMIT="${COMPOSE_PARALLEL_LIMIT:-1}"

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

run_low_priority() {
  if command -v ionice >/dev/null 2>&1; then
    ionice -c2 -n7 nice -n 10 "$@"
  else
    nice -n 10 "$@"
  fi
}

mem_available_kb() {
  awk '/^MemAvailable:/ { print $2; exit }' /proc/meminfo
}

wait_for_deploy_headroom() {
  local phase="$1"
  local available
  local waited=0

  while true; do
    available="$(mem_available_kb)"
    if [ "${available:-0}" -ge "$DEPLOY_MIN_AVAILABLE_KB" ]; then
      echo "Memory headroom OK for $phase: ${available}kB available."
      return 0
    fi

    if [ "$waited" -ge "$DEPLOY_HEADROOM_WAIT_SECONDS" ]; then
      echo "ERROR: refusing $phase; MemAvailable=${available}kB below DEPLOY_MIN_AVAILABLE_KB=${DEPLOY_MIN_AVAILABLE_KB}kB after ${waited}s."
      return 1
    fi

    echo "Waiting for memory headroom before $phase: ${available}kB available, need ${DEPLOY_MIN_AVAILABLE_KB}kB."
    sleep 10
    waited=$((waited + 10))
  done
}

check_chatwoot_health() {
  local phase="$1"

  [ "$CHATWOOT_HEALTH_CHECK" = "1" ] || return 0
  if curl --fail --silent --show-error --max-time 15 "$CHATWOOT_HEALTH_URL" >/dev/null; then
    echo "Chatwoot health OK during $phase."
    return 0
  fi

  echo "WARN: Chatwoot health check failed during $phase at $CHATWOOT_HEALTH_URL."
  return 0
}

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

git -C "$APP_ROOT" fetch origin "$BRANCH"
git -C "$APP_ROOT" checkout "$BRANCH"
git -C "$APP_ROOT" merge --ff-only "origin/$BRANCH"

check_chatwoot_health "pre-deploy"
docker compose -f "$APP_ROOT/docker-compose.yml" config --quiet
wait_for_deploy_headroom "Docker app build"
run_low_priority docker compose -f "$APP_ROOT/docker-compose.yml" build discord-bot

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

run_low_priority docker compose -f "$APP_ROOT/docker-compose.yml" run --rm discord-bot npm run register
run_low_priority docker compose -f "$APP_ROOT/docker-compose.yml" up -d --remove-orphans discord-bot

for _ in $(seq 1 20); do
  if curl --fail --silent --show-error http://127.0.0.1:4188/healthz >/dev/null; then
    echo "Health check passed."
    bot_health=1
    break
  fi
  sleep 2
done

if [ "${bot_health:-0}" = "1" ]; then
  check_chatwoot_health "post-deploy"
  docker compose -f "$APP_ROOT/docker-compose.yml" ps
  exit 0
fi

echo "ERROR: health check failed."
docker compose -f "$APP_ROOT/docker-compose.yml" ps || true
docker logs --tail=100 urba-discord-bot || true
exit 1
