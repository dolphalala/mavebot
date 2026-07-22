#!/usr/bin/env bash
set -Eeuo pipefail

BOT_ROOT="${MAVEBOT_ROOT:-/opt/urba-apps/discord-bot}"
APP_ROOT="${APP_ROOT:-$BOT_ROOT/app}"
WORKSPACE_ROOT="${WORKSPACE_ROOT:-$BOT_ROOT/workspace}"
SHARED_ROOT="${SHARED_ROOT:-$BOT_ROOT/shared}"
SSH_ROOT="${SSH_ROOT:-$BOT_ROOT/ssh}"
GITHUB_KEY="${GITHUB_KEY:-$SSH_ROOT/github-write}"
GITHUB_KNOWN_HOSTS="${GITHUB_KNOWN_HOSTS:-$SSH_ROOT/github_known_hosts}"
EXPECTED_KEY_FINGERPRINT="${EXPECTED_KEY_FINGERPRINT:-SHA256:A8fa1Lr3mfwt2HnjbPrDjL7SaqhiphGVwAaUj144Imk}"
REPOSITORY="${REPOSITORY:-git@github.com:dolphalala/mavebot.git}"
BRANCH="${BRANCH:-main}"
BIN_ROOT="${BIN_ROOT:-/usr/local/bin}"
WORKSPACE_TOOL="$APP_ROOT/scripts/server-workspace.sh"

export GIT_SSH_COMMAND="ssh -i $GITHUB_KEY -o IdentitiesOnly=yes -o UserKnownHostsFile=$GITHUB_KNOWN_HOSTS -o StrictHostKeyChecking=yes"

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

validate_paths() {
  local resolved_bot
  resolved_bot="$(realpath -m "$BOT_ROOT")"
  [ "$(realpath -m "$APP_ROOT")" = "$resolved_bot/app" ] || die "Unexpected production app path."
  [ "$(realpath -m "$WORKSPACE_ROOT")" = "$resolved_bot/workspace" ] || die "Unexpected editing workspace path."
  [ "$(realpath -m "$SHARED_ROOT")" = "$resolved_bot/shared" ] || die "Unexpected shared path."
  [ "$(realpath -m "$SSH_ROOT")" = "$resolved_bot/ssh" ] || die "Unexpected SSH credential path."
  [ "$(realpath -m "$APP_ROOT")" != "$(realpath -m "$WORKSPACE_ROOT")" ] || die "Workspace and production checkout must be different."
}

install_link() {
  local name="$1" link="$BIN_ROOT/$name"
  if [ -e "$link" ] || [ -L "$link" ]; then
    [ -L "$link" ] || die "$link already exists and is not a symlink."
    [ "$(readlink -f "$link")" = "$(readlink -f "$WORKSPACE_TOOL")" ] || die "$link points somewhere unexpected."
    return 0
  fi
  ln -s "$WORKSPACE_TOOL" "$link"
}

[ "$(id -u)" -eq 0 ] || die "Run this installer as root."
validate_paths
[ -d "$APP_ROOT/.git" ] || die "Missing production checkout at $APP_ROOT."
[ -x "$WORKSPACE_TOOL" ] || die "Missing executable workspace tool at $WORKSPACE_TOOL."
[ -s "$GITHUB_KEY" ] || die "Missing server repository key at $GITHUB_KEY."
[ -s "$GITHUB_KEY.pub" ] || die "Missing server repository public key at $GITHUB_KEY.pub."
[ -s "$GITHUB_KNOWN_HOSTS" ] || die "Missing pinned GitHub known_hosts file."

actual_fingerprint="$(ssh-keygen -lf "$GITHUB_KEY.pub" | awk '{print $2}')"
[ "$actual_fingerprint" = "$EXPECTED_KEY_FINGERPRINT" ] || die "Server repository key fingerprint mismatch."
grep -F 'github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqHj6Q5U2eR4VWg3EclbCQ30V4b45wHhIVhgT7vwC' "$GITHUB_KNOWN_HOSTS" >/dev/null || die "Official pinned GitHub ED25519 host key is missing."
chmod 700 "$SSH_ROOT"
chmod 600 "$GITHUB_KEY" "$GITHUB_KNOWN_HOSTS"
chmod 644 "$GITHUB_KEY.pub"
mkdir -p "$SHARED_ROOT/backups"
chmod 700 "$SHARED_ROOT/backups"

git ls-remote "$REPOSITORY" HEAD >/dev/null
if [ ! -e "$WORKSPACE_ROOT" ]; then
  git clone --branch "$BRANCH" --single-branch "$REPOSITORY" "$WORKSPACE_ROOT"
elif [ ! -d "$WORKSPACE_ROOT/.git" ]; then
  die "$WORKSPACE_ROOT exists but is not a Git checkout; refusing to overwrite it."
fi

[ "$(git -C "$WORKSPACE_ROOT" remote get-url origin)" = "$REPOSITORY" ] || die "Existing workspace origin is unexpected; refusing to replace it."
git -C "$WORKSPACE_ROOT" config user.name 'Mavebot Server Codex'
git -C "$WORKSPACE_ROOT" config user.email 'mavebot-server-codex@users.noreply.github.com'
git -C "$WORKSPACE_ROOT" config pull.ff only

if [ -z "$(git -C "$WORKSPACE_ROOT" status --porcelain --untracked-files=normal)" ]; then
  git -C "$WORKSPACE_ROOT" fetch origin "$BRANCH"
  if git -C "$WORKSPACE_ROOT" merge-base --is-ancestor HEAD "origin/$BRANCH"; then
    git -C "$WORKSPACE_ROOT" merge --ff-only "origin/$BRANCH"
  fi
else
  printf 'Existing workspace has edits; preserving them without synchronization.\n'
fi

mkdir -p "$BIN_ROOT"
install_link mavebot-ship
install_link mavebot-sync
install_link mavebot-status

printf 'Mavebot server editing workspace is ready.\n'
printf 'Edit: %s\n' "$WORKSPACE_ROOT"
printf 'Ship: mavebot-ship "describe the change"\n'
printf 'Status: mavebot-status\n'
