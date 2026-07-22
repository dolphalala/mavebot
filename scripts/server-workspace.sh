#!/usr/bin/env bash
set -Eeuo pipefail

BOT_ROOT="${MAVEBOT_ROOT:-/opt/urba-apps/discord-bot}"
APP_ROOT="${APP_ROOT:-$BOT_ROOT/app}"
WORKSPACE_ROOT="${WORKSPACE_ROOT:-$BOT_ROOT/workspace}"
SHARED_ROOT="${SHARED_ROOT:-$BOT_ROOT/shared}"
SSH_ROOT="${SSH_ROOT:-$BOT_ROOT/ssh}"
GITHUB_KEY="${GITHUB_KEY:-$SSH_ROOT/github-write}"
GITHUB_KNOWN_HOSTS="${GITHUB_KNOWN_HOSTS:-$SSH_ROOT/github_known_hosts}"
REPOSITORY="${REPOSITORY:-git@github.com:dolphalala/mavebot.git}"
BRANCH="${BRANCH:-main}"
LOCK_FILE="${LOCK_FILE:-$SHARED_ROOT/server-workspace.lock}"
BACKUP_ROOT="${BACKUP_ROOT:-$SHARED_ROOT/backups}"
BOT_HEALTH_URL="${BOT_HEALTH_URL:-http://127.0.0.1:4188/healthz}"
CHATWOOT_HEALTH_URL="${CHATWOOT_HEALTH_URL:-https://chat.urba.group/}"
BOOKKEEPER_HEALTH_URL="${BOOKKEEPER_HEALTH_URL:-http://127.0.0.1:4177/healthz}"
TEST_MIN_AVAILABLE_KB="${TEST_MIN_AVAILABLE_KB:-614400}"
TEST_HEADROOM_WAIT_SECONDS="${TEST_HEADROOM_WAIT_SECONDS:-300}"
DEPLOY_WAIT_SECONDS="${DEPLOY_WAIT_SECONDS:-600}"
TEST_IMAGE="${TEST_IMAGE:-node:24-alpine}"

export GIT_SSH_COMMAND="ssh -i $GITHUB_KEY -o IdentitiesOnly=yes -o UserKnownHostsFile=$GITHUB_KNOWN_HOSTS -o StrictHostKeyChecking=yes"

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

run_low_priority() {
  if command -v ionice >/dev/null 2>&1; then
    ionice -c2 -n7 nice -n 10 "$@"
  else
    nice -n 10 "$@"
  fi
}

validate_paths() {
  local resolved_bot resolved_app resolved_workspace resolved_shared resolved_ssh
  resolved_bot="$(realpath -m "$BOT_ROOT")"
  resolved_app="$(realpath -m "$APP_ROOT")"
  resolved_workspace="$(realpath -m "$WORKSPACE_ROOT")"
  resolved_shared="$(realpath -m "$SHARED_ROOT")"
  resolved_ssh="$(realpath -m "$SSH_ROOT")"

  [ "$resolved_app" = "$resolved_bot/app" ] || die "APP_ROOT must be $resolved_bot/app."
  [ "$resolved_workspace" = "$resolved_bot/workspace" ] || die "WORKSPACE_ROOT must be $resolved_bot/workspace."
  [ "$resolved_shared" = "$resolved_bot/shared" ] || die "SHARED_ROOT must be $resolved_bot/shared."
  [ "$resolved_ssh" = "$resolved_bot/ssh" ] || die "SSH_ROOT must be $resolved_bot/ssh."
  [ "$resolved_app" != "$resolved_workspace" ] || die "The editing workspace cannot be the production checkout."
}

require_workspace() {
  [ -d "$WORKSPACE_ROOT/.git" ] || die "Missing editing workspace at $WORKSPACE_ROOT. Run the installer first."
  [ -d "$APP_ROOT/.git" ] || die "Missing production checkout at $APP_ROOT."
  [ -r "$GITHUB_KEY" ] || die "Missing server repository key at $GITHUB_KEY."
  [ -r "$GITHUB_KNOWN_HOSTS" ] || die "Missing pinned GitHub host keys at $GITHUB_KNOWN_HOSTS."
  [ "$(git -C "$WORKSPACE_ROOT" remote get-url origin)" = "$REPOSITORY" ] || die "Workspace origin is not the expected Mavebot repository."
}

mem_available_kb() {
  awk '/^MemAvailable:/ { print $2; exit }' /proc/meminfo
}

wait_for_test_headroom() {
  local available waited=0
  while true; do
    available="$(mem_available_kb)"
    if [ "${available:-0}" -ge "$TEST_MIN_AVAILABLE_KB" ]; then
      printf 'Memory headroom OK for tests: %skB available.\n' "$available"
      return 0
    fi
    if [ "$waited" -ge "$TEST_HEADROOM_WAIT_SECONDS" ]; then
      die "MemAvailable=${available}kB stayed below ${TEST_MIN_AVAILABLE_KB}kB for ${waited}s. No commit or push was made."
    fi
    printf 'Waiting for test headroom: %skB available; need %skB.\n' "$available" "$TEST_MIN_AVAILABLE_KB"
    sleep 10
    waited=$((waited + 10))
  done
}

make_backup() {
  local reason="$1" stamp destination
  mkdir -p "$BACKUP_ROOT"
  chmod 700 "$BACKUP_ROOT"
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  destination="$BACKUP_ROOT/server-workspace-${reason}-${stamp}.tgz"
  tar --exclude=.git --exclude=node_modules -czf "$destination" -C "$WORKSPACE_ROOT" .
  chmod 600 "$destination"
  printf '%s\n' "$destination"
}

restore_stash() {
  local had_stash="$1"
  [ "$had_stash" = "1" ] || return 0
  if ! git -C "$WORKSPACE_ROOT" stash pop --index; then
    die "Remote changes overlapped your edits. Your source backup is safe under $BACKUP_ROOT. Resolve the marked files, then run mavebot-ship again."
  fi
}

sync_workspace() {
  local status had_stash=0 local_sha remote_sha
  status="$(git -C "$WORKSPACE_ROOT" status --porcelain --untracked-files=normal)"
  if [ -n "$status" ]; then
    printf 'Backing up current edits before synchronization: %s\n' "$(make_backup pre-sync)"
    git -C "$WORKSPACE_ROOT" stash push --include-untracked --message "mavebot automatic sync $(date -u +%Y-%m-%dT%H:%M:%SZ)" >/dev/null
    had_stash=1
  fi

  if ! git -C "$WORKSPACE_ROOT" fetch origin "$BRANCH"; then
    restore_stash "$had_stash"
    die "Could not fetch origin/$BRANCH. The workspace edits were restored."
  fi

  local_sha="$(git -C "$WORKSPACE_ROOT" rev-parse HEAD)"
  remote_sha="$(git -C "$WORKSPACE_ROOT" rev-parse "origin/$BRANCH")"
  if [ "$local_sha" = "$remote_sha" ]; then
    :
  elif git -C "$WORKSPACE_ROOT" merge-base --is-ancestor "$local_sha" "$remote_sha"; then
    git -C "$WORKSPACE_ROOT" merge --ff-only "origin/$BRANCH"
  elif git -C "$WORKSPACE_ROOT" merge-base --is-ancestor "$remote_sha" "$local_sha"; then
    printf 'Workspace contains an unpublished local commit; preserving it for mavebot-ship.\n'
  else
    if ! git -C "$WORKSPACE_ROOT" rebase "origin/$BRANCH"; then
      git -C "$WORKSPACE_ROOT" rebase --abort || true
      restore_stash "$had_stash"
      die "An unpublished workspace commit conflicts with origin/$BRANCH. The rebase was aborted and your work was preserved."
    fi
  fi
  restore_stash "$had_stash"
}

reject_sensitive_paths() {
  local record path
  while IFS= read -r -d '' record; do
    path="${record:3}"
    case "$path" in
      *" -> "*) path="${path##* -> }" ;;
    esac
    case "$path" in
      .env.example) ;;
      .env|.env.*|*.pem|*.p12|*.pfx|*.jks|*.keystore|id_rsa|id_ed25519|*private-key*|*private_key*)
        die "Refusing sensitive file path: $path"
        ;;
    esac
  done < <(git -C "$WORKSPACE_ROOT" status --porcelain=v1 -z --untracked-files=normal)
}

reject_staged_secrets() {
  local staged_patch
  staged_patch="$(git -C "$WORKSPACE_ROOT" diff --cached --no-ext-diff --unified=0 -- . ':(exclude)package-lock.json')"
  if printf '%s\n' "$staged_patch" | grep -E '^\+.*BEGIN (OPENSSH|RSA|EC|DSA) PRIVATE KEY' >/dev/null; then
    die "A private-key marker was found in staged content. Nothing was pushed."
  fi
  if printf '%s\n' "$staged_patch" | grep -E '^\+.*(DISCORD_TOKEN|COC_API_TOKEN|GITHUB_TOKEN|GH_TOKEN)[[:space:]]*=[[:space:]]*[^[:space:]#`]' >/dev/null; then
    die "A non-empty secret assignment was found in staged content. Nothing was pushed."
  fi
}

run_checks() {
  wait_for_test_headroom
  printf 'Running the full Mavebot check in an isolated, resource-limited Node container.\n'
  run_low_priority docker run --rm \
    --memory 768m --memory-swap 1g --cpus 1 --pids-limit 256 \
    --volume "$WORKSPACE_ROOT:/workspace:ro" \
    --volume mavebot-workspace-npm-cache:/root/.npm \
    "$TEST_IMAGE" sh -eu -c '
      mkdir -p /work/source
      tar --exclude=.git --exclude=node_modules -cf - -C /workspace . | tar -xf - -C /work/source
      cd /work/source
      npm ci --include=optional
      npm run check
    '
}

rebase_if_remote_advanced() {
  local remote_sha
  git -C "$WORKSPACE_ROOT" fetch origin "$BRANCH"
  remote_sha="$(git -C "$WORKSPACE_ROOT" rev-parse "origin/$BRANCH")"
  if git -C "$WORKSPACE_ROOT" merge-base --is-ancestor "$remote_sha" HEAD; then
    return 1
  fi
  printf 'origin/%s advanced during this edit; rebasing the tested commit.\n' "$BRANCH"
  if ! git -C "$WORKSPACE_ROOT" rebase "origin/$BRANCH"; then
    git -C "$WORKSPACE_ROOT" rebase --abort || true
    die "The remote branch changed incompatibly. Your local commit and source backup remain safe; nothing was force-pushed."
  fi
  return 0
}

verify_shared_services() {
  curl --fail --silent --show-error --max-time 15 "$BOT_HEALTH_URL" >/dev/null || die "Mavebot health check failed at $BOT_HEALTH_URL."
  curl --fail --silent --show-error --max-time 15 "$CHATWOOT_HEALTH_URL" >/dev/null || die "Chatwoot health check failed after the Mavebot deploy."
  curl --fail --silent --show-error --max-time 15 "$BOOKKEEPER_HEALTH_URL" >/dev/null || die "Bookkeeper health check failed after the Mavebot deploy."
  [ -z "$(git -C "$APP_ROOT" status --porcelain --untracked-files=normal)" ] || die "Production checkout is dirty after deploy."
  [ "$(docker inspect --format '{{.State.Health.Status}}' urba-discord-bot 2>/dev/null)" = "healthy" ] || die "Mavebot container is not healthy."
}

wait_for_deploy() {
  local target_sha="$1" waited=0 production_sha
  systemctl reset-failed urba-discord-poll-deploy.service 2>/dev/null || true
  systemctl start urba-discord-poll-deploy.service || die "The Mavebot deploy service failed. See $SHARED_ROOT/logs/poll-deploy.log."
  while [ "$waited" -lt "$DEPLOY_WAIT_SECONDS" ]; do
    production_sha="$(git -C "$APP_ROOT" rev-parse HEAD)"
    if [ "$production_sha" = "$target_sha" ] && \
       curl --fail --silent --max-time 5 "$BOT_HEALTH_URL" >/dev/null && \
       [ "$(docker inspect --format '{{.State.Health.Status}}' urba-discord-bot 2>/dev/null)" = "healthy" ]; then
      verify_shared_services
      return 0
    fi
    sleep 5
    waited=$((waited + 5))
  done
  die "Timed out waiting for production to reach $target_sha. Check $SHARED_ROOT/logs/deploy.log."
}

show_status() {
  validate_paths
  printf 'Mavebot server editing status\n'
  if [ -d "$WORKSPACE_ROOT/.git" ]; then
    printf '\nEditing workspace: %s\n' "$WORKSPACE_ROOT"
    printf 'Workspace commit: %s\n' "$(git -C "$WORKSPACE_ROOT" rev-parse --short HEAD)"
    git -C "$WORKSPACE_ROOT" status --short --branch
  else
    printf '\nEditing workspace: NOT INSTALLED (%s)\n' "$WORKSPACE_ROOT"
  fi
  if [ -d "$APP_ROOT/.git" ]; then
    printf '\nProduction checkout: %s\n' "$APP_ROOT"
    printf 'Production commit: %s\n' "$(git -C "$APP_ROOT" rev-parse --short HEAD)"
    if [ -z "$(git -C "$APP_ROOT" status --porcelain --untracked-files=normal)" ]; then
      printf 'Production checkout: clean\n'
    else
      printf 'Production checkout: DIRTY (deploys are blocked)\n'
      git -C "$APP_ROOT" status --short
    fi
  fi
  printf '\nServices\n'
  docker ps --filter name=urba-discord-bot --filter name=urba-bookkeeper --filter name=chatwoot-rails --format '{{.Names}}: {{.Status}}'
  for endpoint in "$BOT_HEALTH_URL" "$CHATWOOT_HEALTH_URL" "$BOOKKEEPER_HEALTH_URL"; do
    if curl --fail --silent --max-time 10 "$endpoint" >/dev/null; then
      printf 'OK %s\n' "$endpoint"
    else
      printf 'FAILED %s\n' "$endpoint"
    fi
  done
}

run_sync() {
  validate_paths
  require_workspace
  mkdir -p "$SHARED_ROOT"
  exec 9>"$LOCK_FILE"
  flock -n 9 || die "Another Mavebot workspace operation is running. Try again shortly."
  sync_workspace
  printf 'Workspace synchronized safely.\n'
  git -C "$WORKSPACE_ROOT" status --short --branch
}

run_ship() {
  local message="${1:-Mavebot server edit $(date -u +%Y-%m-%dT%H:%M:%SZ)}"
  local backup commit_sha attempt
  validate_paths
  require_workspace
  [ "$(id -u)" -eq 0 ] || die "mavebot-ship must run through the root mavebot-prod SSH account."
  mkdir -p "$SHARED_ROOT"
  exec 9>"$LOCK_FILE"
  flock -n 9 || die "Another Mavebot workspace operation is running. Try again shortly."

  sync_workspace
  if [ -z "$(git -C "$WORKSPACE_ROOT" status --porcelain --untracked-files=normal)" ] && \
     git -C "$WORKSPACE_ROOT" merge-base --is-ancestor HEAD "origin/$BRANCH"; then
    printf 'Nothing new to ship. Production status follows.\n'
    show_status
    return 0
  fi

  backup="$(make_backup pre-ship)"
  printf 'Source backup created: %s\n' "$backup"
  reject_sensitive_paths
  git -C "$WORKSPACE_ROOT" diff --check
  run_checks

  git -C "$WORKSPACE_ROOT" add --all
  reject_staged_secrets
  if ! git -C "$WORKSPACE_ROOT" diff --cached --quiet; then
    git -C "$WORKSPACE_ROOT" commit -m "$message"
  else
    printf 'No uncommitted file changes; shipping the existing unpublished commit.\n'
  fi

  if rebase_if_remote_advanced; then
    run_checks
  fi

  for attempt in 1 2; do
    if git -C "$WORKSPACE_ROOT" push origin "HEAD:$BRANCH"; then
      break
    fi
    [ "$attempt" -eq 1 ] || die "Push was rejected twice. Your commit and backup remain safe; no force push was attempted."
    printf 'Push raced with another change; synchronizing once and testing again.\n'
    if rebase_if_remote_advanced; then
      run_checks
    fi
  done

  commit_sha="$(git -C "$WORKSPACE_ROOT" rev-parse HEAD)"
  printf 'Pushed %s. Deploying only the Discord bot.\n' "$commit_sha"
  wait_for_deploy "$commit_sha"
  printf '\nSUCCESS: Mavebot %s is live and healthy.\n' "$(git -C "$WORKSPACE_ROOT" rev-parse --short HEAD)"
  printf 'Backup: %s\n' "$backup"
  printf 'Chatwoot and Bookkeeper health checks also passed.\n'
}

command_name="$(basename "$0")"
case "$command_name" in
  mavebot-status) show_status ;;
  mavebot-sync) run_sync ;;
  mavebot-ship) shift 0; run_ship "${1:-}" ;;
  *)
    case "${1:-}" in
      status) shift; show_status "$@" ;;
      sync) shift; run_sync "$@" ;;
      ship) shift; run_ship "${1:-}" ;;
      *) die "Invoke this script as mavebot-status, mavebot-sync, or mavebot-ship [message]." ;;
    esac
    ;;
esac
