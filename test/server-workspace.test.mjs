import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspaceTool = await readFile(
  new URL("../scripts/server-workspace.sh", import.meta.url),
  "utf8",
);
const installer = await readFile(
  new URL("../scripts/install-server-workspace.sh", import.meta.url),
  "utf8",
);

test("server editing uses a workspace separate from production", () => {
  assert.match(workspaceTool, /WORKSPACE_ROOT=.*BOT_ROOT\/workspace/);
  assert.match(workspaceTool, /APP_ROOT=.*BOT_ROOT\/app/);
  assert.match(workspaceTool, /editing workspace cannot be the production checkout/);
  assert.doesNotMatch(workspaceTool, /git -C "\$APP_ROOT" (add|commit|push)/);
});

test("ship backs up, tests, scans, pushes safely, and verifies shared services", () => {
  assert.match(workspaceTool, /make_backup pre-ship/);
  assert.match(workspaceTool, /npm run check/);
  assert.match(workspaceTool, /--memory 768m/);
  assert.match(workspaceTool, /reject_sensitive_paths/);
  assert.match(workspaceTool, /reject_staged_secrets/);
  assert.match(workspaceTool, /push origin "HEAD:\$BRANCH"/);
  assert.match(workspaceTool, /systemctl start urba-discord-poll-deploy\.service/);
  assert.match(workspaceTool, /CHATWOOT_HEALTH_URL/);
  assert.match(workspaceTool, /BOOKKEEPER_HEALTH_URL/);
  assert.match(workspaceTool, /State\.Health\.Status/);
});

test("ship never uses destructive repository or Docker shortcuts", () => {
  assert.doesNotMatch(workspaceTool, /git reset --hard/);
  assert.doesNotMatch(workspaceTool, /push[^\n]*(--force|-f\b)/);
  assert.doesNotMatch(workspaceTool, /docker (system|image|builder) prune/);
  assert.doesNotMatch(installer, /rm -rf/);
});

test("installer pins the server credential and installs only exact command links", () => {
  assert.match(installer, /SHA256:A8fa1Lr3mfwt2HnjbPrDjL7SaqhiphGVwAaUj144Imk/);
  assert.match(installer, /SHA256:\+DiY3wvvV6TuJJhbpZisF\/zLDA0zPMSvHdkr4UvCOqU/);
  assert.match(installer, /Official pinned GitHub ED25519 host key is missing/);
  assert.match(installer, /install_link mavebot-ship/);
  assert.match(installer, /install_link mavebot-sync/);
  assert.match(installer, /install_link mavebot-status/);
  assert.match(installer, /Mavebot Server Codex/);
});
