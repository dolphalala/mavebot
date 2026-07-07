import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildCodexWorkerPrompt,
  checkUrl,
  compactTranscriptRows,
  isCodexAuthError,
  readRepoContextBundle
} from '../src/slack-codex-worker.mjs';

test('compactTranscriptRows keeps recent turns bounded and older turns summarized', () => {
  const rows = Array.from({ length: 6 }, (_, index) => ({
    at: `2026-06-24T00:00:0${index}.000Z`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    user: index % 2 === 0 ? `U${index}` : 'mavebot',
    source: index % 2 === 0 ? 'discord' : 'slack',
    channel: index % 2 === 0 ? '1523893930993778698' : 'C0BCG0T838B',
    text: `turn ${index}`
  }));

  const snapshot = compactTranscriptRows(rows, {
    recentLimit: 2,
    summaryLimit: 3,
    generatedAt: '2026-06-24T00:01:00.000Z'
  });

  assert.match(snapshot.summary, /Compacted Older Turns/);
  assert.match(snapshot.summary, /turn 1/);
  assert.match(snapshot.summary, /turn 3/);
  assert.doesNotMatch(snapshot.summary, /turn 0/);
  assert.match(snapshot.recent, /turn 4/);
  assert.match(snapshot.recent, /turn 5/);
  assert.match(snapshot.recent, /\[discord\/1523893930993778698\]/);
  assert.match(snapshot.recent, /\[slack\/C0BCG0T838B\]/);
  assert.doesNotMatch(snapshot.recent, /turn 3/);
  assert.match(snapshot.session, /Recent turn count included in prompts: 2/);
  assert.match(snapshot.session, /Slack and Discord jobs/);
  assert.match(snapshot.session, /Memory Maintenance/);
});

test('buildCodexWorkerPrompt puts active Slack request before memory', () => {
  const prompt = buildCodexWorkerPrompt({
    job: {
      user: 'UACTIVE',
      channel: 'CBOT',
      ts: '1782400000.000000',
      text: 'change /lana now'
    },
    summary: 'old request: change /player',
    recent: 'recent request: check /ping',
    operatingMemory: 'operating memory',
    slackSession: 'slack session',
    repoContextBundle: 'clash ui guidance',
    slackMemoryTail: 'raw memory'
  });

  assert.ok(
    prompt.indexOf('Active Slack request') < prompt.indexOf('# Worker Compacted Memory'),
    'active Slack request should be before compacted memory'
  );
  assert.ok(
    prompt.indexOf('change /lana now') < prompt.indexOf('old request: change /player'),
    'active request text should come before older memory'
  );
  assert.match(prompt, /Do not commit or push/);
  assert.match(prompt, /persistent Codex session/);
  assert.match(prompt, /Be as capable as a local Codex Desktop session/);
  assert.match(prompt, /docs\/context\/remote-codex-session\.md/);
  assert.match(prompt, /Discord command changes must update both src\/commands\.mjs and src\/index\.mjs/);
  assert.match(prompt, /# Extra Repo Context Files/);
  assert.match(prompt, /clash ui guidance/);
});

test('isCodexAuthError detects expired server-side Codex login failures', () => {
  assert.equal(
    isCodexAuthError(
      'Failed to refresh token: Your access token could not be refreshed because your refresh token was already used.'
    ),
    true
  );
  assert.equal(isCodexAuthError('failed to connect to websocket: HTTP error: 401 Unauthorized'), true);
  assert.equal(isCodexAuthError('npm test failed'), false);
});

test('readRepoContextBundle loads bounded extra docs/context markdown files', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mavebot-context-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  await writeFile(path.join(dir, 'operating-memory.md'), 'do not include this copy');
  await writeFile(path.join(dir, 'slack-session.md'), 'do not include this copy either');
  await writeFile(path.join(dir, 'clash-ui-guidance.md'), '# Clash UI\nUse icon cards.');
  await writeFile(path.join(dir, 'remote-codex-session.md'), '# Remote Contract\nAct like a session.');
  await writeFile(path.join(dir, 'z-extra.md'), '# Extra\nLess important.');

  const bundle = await readRepoContextBundle({ dir, maxChars: 1000 });

  assert.ok(
    bundle.indexOf('## remote-codex-session.md') < bundle.indexOf('## clash-ui-guidance.md'),
    'remote session contract should be loaded before domain guidance'
  );
  assert.match(bundle, /Act like a session/);
  assert.match(bundle, /## clash-ui-guidance\.md/);
  assert.match(bundle, /Use icon cards/);
  assert.doesNotMatch(bundle, /do not include this copy/);
});

test('slack-codex-worker can be imported from stdin module scripts', () => {
  const result = spawnSync(process.execPath, ['--input-type=module'], {
    cwd: process.cwd(),
    input: "import './src/slack-codex-worker.mjs';\nconsole.log('import ok');\n",
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /import ok/);
});

test('checkUrl supports the Slack bridge health port', async (t) => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"ok":true}');
  });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(4190, '127.0.0.1', resolve);
    });
  } catch (error) {
    if (error?.code === 'EADDRINUSE') {
      t.skip('port 4190 is already in use on this machine');
      return;
    }
    throw error;
  }

  t.after(
    () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  );

  assert.equal(await checkUrl('http://127.0.0.1:4190/healthz'), true);
});
