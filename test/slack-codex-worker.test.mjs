import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildCodexExecArgs,
  buildCodexWorkerPrompt,
  buildMovedJobRecord,
  buildWorkerRuntimeSnapshot,
  checkUrl,
  codexImagePathsForJob,
  compactTranscriptRows,
  commitMessageForJob,
  finalSlackMessage,
  isCodexImageFile,
  isCodexAuthError,
  isLowSignalTranscriptRow,
  isNonFastForwardPushError,
  pruneTranscriptRowsForStorage,
  readRepoContextBundle,
  workerFailureMessage
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
  assert.match(snapshot.session, /local-codex-parity\.md/);
  assert.match(snapshot.session, /Memory Maintenance/);
});

test('compactTranscriptRows suppresses low-signal smoke rows from prompt memory', () => {
  const rows = [
    {
      at: '2026-07-07T00:00:00.000Z',
      role: 'user',
      user: 'Allen',
      source: 'discord',
      channel: '1523893930993778698',
      text: 'make /player show better army cards'
    },
    {
      at: '2026-07-07T00:01:00.000Z',
      role: 'user',
      user: 'Codex smoke',
      source: 'discord',
      channel: '1523893930993778698',
      text: 'Smoke test from the local Codex app. Do not change files.'
    },
    {
      at: '2026-07-07T00:02:00.000Z',
      role: 'assistant',
      user: 'mavebot',
      source: 'discord',
      channel: '1523893930993778698',
      text: 'The Discord worker path is live.'
    },
    {
      at: '2026-07-07T00:03:00.000Z',
      role: 'assistant',
      user: 'mavebot',
      source: 'discord',
      channel: '1523893930993778698',
      text: 'I hit a real blocker while running this on the server.'
    },
    {
      at: '2026-07-07T00:04:00.000Z',
      role: 'assistant',
      user: 'mavebot',
      source: 'discord',
      channel: '1523893930993778698',
      text: 'Memory compaction is clean.'
    },
    {
      at: '2026-07-07T00:05:00.000Z',
      role: 'user',
      user: 'Codex desktop final vision verification',
      source: 'discord',
      channel: '1523893930993778698',
      text: 'Final live verification only. Do not change files.'
    },
    {
      at: '2026-07-07T00:06:00.000Z',
      role: 'assistant',
      user: 'mavebot',
      source: 'discord',
      channel: '1523893930993778698',
      text: 'FINAL VISION 842'
    },
    {
      at: '2026-07-07T00:07:00.000Z',
      role: 'assistant',
      user: 'mavebot',
      source: 'discord',
      channel: '1523893930993778698',
      jobId: 'discord-code-change-ack-123',
      text: 'Updated the Discord #codex working acknowledgements.'
    }
  ];

  assert.equal(isLowSignalTranscriptRow(rows[0]), false);
  assert.equal(isLowSignalTranscriptRow(rows[1]), true);
  assert.equal(isLowSignalTranscriptRow(rows[2]), true);
  assert.equal(isLowSignalTranscriptRow(rows[3]), true);
  assert.equal(isLowSignalTranscriptRow(rows[4]), true);
  assert.equal(isLowSignalTranscriptRow(rows[5]), true);
  assert.equal(isLowSignalTranscriptRow(rows[6]), true);
  assert.equal(isLowSignalTranscriptRow(rows[7]), true);

  const snapshot = compactTranscriptRows(rows, {
    recentLimit: 5,
    summaryLimit: 5,
    generatedAt: '2026-07-07T00:03:00.000Z'
  });

  assert.match(snapshot.recent, /make \/player show better army cards/);
  assert.doesNotMatch(snapshot.recent, /Smoke test from the local Codex app/);
  assert.doesNotMatch(snapshot.recent, /Discord worker path is live/);
  assert.doesNotMatch(snapshot.recent, /Memory compaction is clean/);
  assert.doesNotMatch(snapshot.recent, /working acknowledgements/);
  assert.match(snapshot.session, /Low-signal smoke\/verification turns suppressed from prompt memory: 7/);
});

test('compactTranscriptRows strips worker handoff boilerplate from retained memory', () => {
  const snapshot = compactTranscriptRows(
    [
      {
        at: '2026-07-07T00:00:00.000Z',
        role: 'assistant',
        user: 'mavebot',
        source: 'slack',
        channel: 'C0BCG0T838B',
        text: [
          'Added `/player` pages.',
          '',
          'Ready for the worker to commit/push/deploy.',
          '',
          'Done and live.'
        ].join('\n')
      }
    ],
    {
      recentLimit: 5,
      summaryLimit: 5,
      generatedAt: '2026-07-07T00:01:00.000Z'
    }
  );

  assert.match(snapshot.recent, /Added `\/player` pages/);
  assert.doesNotMatch(snapshot.recent, /Done and live/);
  assert.doesNotMatch(snapshot.recent, /Ready for the worker/);
});

test('pruneTranscriptRowsForStorage removes low-signal rows from durable storage', () => {
  const rows = [
    {
      at: '2026-07-07T00:00:00.000Z',
      role: 'user',
      user: 'Allen',
      source: 'discord',
      channel: '1523893930993778698',
      text: 'make /player show better army cards'
    },
    {
      at: '2026-07-07T00:01:00.000Z',
      role: 'user',
      user: 'Codex smoke',
      source: 'discord',
      channel: '1523893930993778698',
      text: 'Smoke test from the local Codex app. Do not change files.'
    },
    {
      at: '2026-07-07T00:02:00.000Z',
      role: 'assistant',
      user: 'mavebot',
      source: 'discord',
      channel: '1523893930993778698',
      text: 'Memory compaction is clean.'
    },
    {
      at: '2026-07-07T00:03:00.000Z',
      role: 'assistant',
      user: 'mavebot',
      source: 'discord',
      channel: '1523893930993778698',
      jobId: 'discord-live-verify-123',
      text: 'live verification only ok'
    }
  ];

  assert.deepEqual(
    pruneTranscriptRowsForStorage(rows).map((row) => row.text),
    ['make /player show better army cards']
  );
});

test('buildCodexWorkerPrompt puts active Slack request before memory', () => {
  const prompt = buildCodexWorkerPrompt({
    job: {
      user: 'UACTIVE',
      channel: 'CBOT',
      ts: '1782400000.000000',
      text: 'change /lana now',
      files: [
        {
          name: 'screen.png',
          mimetype: 'image/png',
          localPath: '/shared/codex-worker/context/slack-files/CBOT/1782400000/01-screen.png'
        }
      ],
      contextMessages: [
        {
          receivedAt: '2026-07-07T05:59:00.000Z',
          user: 'UACTIVE',
          text: 'extra setup context'
        }
      ]
    },
    summary: 'old request: change /player',
    recent: 'recent request: check /ping',
    repoInstructions: 'AGENTS instructions',
    contextIndex: 'context map',
    runtimeSnapshot: 'runtime snapshot',
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
    prompt.indexOf('# Project AGENTS.md') < prompt.indexOf('# Worker Compacted Memory'),
    'project instructions should be loaded before compacted memory'
  );
  assert.ok(
    prompt.indexOf('# Context Map') < prompt.indexOf('# Worker Compacted Memory'),
    'context map should be loaded before compacted memory'
  );
  assert.ok(
    prompt.indexOf('change /lana now') < prompt.indexOf('old request: change /player'),
    'active request text should come before older memory'
  );
  assert.match(prompt, /AGENTS instructions/);
  assert.match(prompt, /context map/);
  assert.match(prompt, /runtime snapshot/);
  assert.match(prompt, /Do not commit or push/);
  assert.match(prompt, /persistent Codex session/);
  assert.match(prompt, /Be as capable as a local Codex Desktop session/);
  assert.match(prompt, /local-codex-parity\.md/);
  assert.match(prompt, /Do not say the work is ready for the worker to commit, push, deploy, or verify/);
  assert.match(prompt, /docs\/context\/remote-codex-session\.md/);
  assert.match(prompt, /Discord command changes must update both src\/commands\.mjs and src\/index\.mjs/);
  assert.match(prompt, /# Extra Repo Context Files/);
  assert.match(prompt, /clash ui guidance/);
  assert.match(prompt, /screen\.png/);
  assert.match(prompt, /\/shared\/codex-worker\/context\/slack-files\/CBOT\/1782400000\/01-screen\.png/);
  assert.match(prompt, /extra setup context/);
});

test('buildCodexWorkerPrompt puts active Discord screenshots before memory', () => {
  const prompt = buildCodexWorkerPrompt({
    job: {
      source: 'discord',
      user: 'UACTIVE',
      username: 'Allen',
      channel: '1523893930993778698',
      ts: '2026-07-08T10:00:00.000Z',
      text: 'use the screenshot to fix /player',
      files: [
        {
          name: 'player-screen.png',
          mimetype: 'image/png',
          localPath: '/shared/codex-worker/context/discord-files/1523893930993778698/123/01-player-screen.png'
        }
      ]
    },
    summary: 'old request: work on Slack bridge',
    recent: 'recent request: check a different command',
    repoInstructions: 'AGENTS instructions',
    contextIndex: 'context map',
    runtimeSnapshot: 'runtime snapshot',
    operatingMemory: 'operating memory',
    slackSession: 'session memory',
    repoContextBundle: 'remote session contract',
    slackMemoryTail: 'raw memory'
  });

  assert.ok(
    prompt.indexOf('Active Discord request') < prompt.indexOf('# Worker Compacted Memory'),
    'active Discord request should be before compacted memory'
  );
  assert.ok(
    prompt.indexOf('use the screenshot to fix /player') < prompt.indexOf('old request: work on Slack bridge'),
    'active Discord request should beat older memory'
  );
  assert.match(prompt, /player-screen\.png/);
  assert.match(prompt, /\/shared\/codex-worker\/context\/discord-files\/1523893930993778698\/123\/01-player-screen\.png/);
  assert.match(prompt, /remote session contract/);
});

test('Codex exec args attach image files from Discord or Slack jobs', () => {
  const imageFiles = [
    {
      name: 'discord-screen.png',
      mimetype: 'image/png',
      localPath: '/shared/codex-worker/context/discord-files/C/M/01-discord-screen.png'
    },
    {
      name: 'slack-screen.webp',
      localPath: '/shared/codex-worker/context/slack-files/C/M/02-slack-screen.webp'
    },
    {
      name: 'notes.txt',
      mimetype: 'text/plain',
      localPath: '/shared/codex-worker/context/discord-files/C/M/03-notes.txt'
    },
    {
      name: 'animated.gif',
      mimetype: 'image/gif',
      localPath: '/shared/codex-worker/context/discord-files/C/M/04-animated.gif'
    }
  ];

  assert.equal(isCodexImageFile(imageFiles[0]), true);
  assert.equal(isCodexImageFile(imageFiles[1]), true);
  assert.equal(isCodexImageFile(imageFiles[2]), false);
  assert.equal(isCodexImageFile(imageFiles[3]), false);

  const imagePaths = codexImagePathsForJob({ files: imageFiles }, { maxImages: 1 });
  assert.deepEqual(imagePaths, ['/shared/codex-worker/context/discord-files/C/M/01-discord-screen.png']);

  const args = buildCodexExecArgs({
    repoDir: '/repo',
    outputPath: '/tmp/out.txt',
    model: 'gpt-test',
    imagePaths: codexImagePathsForJob({ files: imageFiles })
  });
  assert.deepEqual(
    args.filter((arg) => arg === '--image'),
    ['--image', '--image']
  );
  assert.ok(args.includes('/shared/codex-worker/context/discord-files/C/M/01-discord-screen.png'));
  assert.ok(args.includes('/shared/codex-worker/context/slack-files/C/M/02-slack-screen.webp'));
  assert.ok(!args.includes('/shared/codex-worker/context/discord-files/C/M/03-notes.txt'));
  assert.equal(args.at(-1), '-');
});

test('commitMessageForJob labels commits by the channel source', () => {
  assert.equal(
    commitMessageForJob({
      source: 'discord',
      text: 'make /lana more beautiful, please!'
    }),
    'Discord: make /lana more beautiful please'
  );
  assert.equal(
    commitMessageForJob({
      source: 'slack',
      text: '<@U123> fix /player'
    }),
    'Slack: fix /player'
  );
  assert.equal(commitMessageForJob({ text: '' }), 'Remote: Remote request');
});

test('finalSlackMessage always returns a human success message', () => {
  assert.equal(
    finalSlackMessage({
      codexMessage: '',
      checkOk: true,
      pushResult: { pushed: false },
      deployResult: { matched: false, reason: 'no push needed' },
      runtime: { botOk: true, bridgeOk: true }
    }),
    'I checked that. No code changes were needed.'
  );

  assert.equal(
    finalSlackMessage({
      codexMessage: 'I updated /lana.',
      checkOk: true,
      pushResult: { pushed: true },
      deployResult: { matched: true },
      runtime: { botOk: true, bridgeOk: true }
    }),
    'I updated /lana.\n\nDone and live.'
  );
});

test('finalSlackMessage strips worker handoff boilerplate from channel replies', () => {
  assert.equal(
    finalSlackMessage({
      codexMessage: [
        'Updated the Discord #codex working acknowledgements.',
        '',
        'Added test coverage. Ready for the worker to commit, push, deploy, and verify live.'
      ].join('\n'),
      checkOk: true,
      pushResult: { pushed: true },
      deployResult: { matched: true },
      runtime: { botOk: true, bridgeOk: true }
    }),
    'Updated the Discord #codex working acknowledgements.\n\nAdded test coverage.\n\nDone and live.'
  );
});

test('finalSlackMessage removes premature live claims when deploy is not verified', () => {
  assert.equal(
    finalSlackMessage({
      codexMessage: [
        'Fixed the worker behavior.',
        '',
        'Done and live.'
      ].join('\n'),
      checkOk: true,
      pushResult: { pushed: true },
      deployResult: { matched: false, reason: 'live app stayed at oldsha' },
      runtime: { botOk: true, bridgeOk: true }
    }),
    'Fixed the worker behavior.\n\nI pushed the change, but I could not confirm it is live yet: live app stayed at oldsha.'
  );
});

test('workerFailureMessage keeps channel failures short and non-secret', () => {
  const message = workerFailureMessage(
    new Error('npm run check exited 1\nSECRET_TOKEN=abc123\nfull stack trace')
  );

  assert.match(message, /test\/check failure/);
  assert.doesNotMatch(message, /SECRET_TOKEN|stack trace|npm run check exited/i);
});

test('buildMovedJobRecord clears stale failed fields after successful retry', () => {
  const record = buildMovedJobRecord(
    {
      id: 'job-1',
      failedAt: '2026-07-08T11:23:48.039Z',
      error: 'push failed',
      contextFiles: { recentPath: '/shared/recent.md' },
      contextSize: 1000
    },
    {
      completedAt: '2026-07-08T11:38:08.485Z',
      pushResult: { pushed: true }
    },
    { clearFailure: true }
  );

  assert.equal(record.id, 'job-1');
  assert.equal(record.completedAt, '2026-07-08T11:38:08.485Z');
  assert.deepEqual(record.pushResult, { pushed: true });
  assert.equal('failedAt' in record, false);
  assert.equal('error' in record, false);
  assert.equal('contextFiles' in record, false);
  assert.equal('contextSize' in record, false);
});

test('buildWorkerRuntimeSnapshot explains deploy and safety boundaries without secrets', () => {
  const snapshot = buildWorkerRuntimeSnapshot({
    source: 'discord',
    channel: '1523893930993778698'
  });

  assert.match(snapshot, /origin\/main/);
  assert.match(snapshot, /scripts\/deploy-server\.sh/);
  assert.match(snapshot, /npm run check/);
  assert.match(snapshot, /transcript is normalized/);
  assert.match(snapshot, /localSessionParity/);
  assert.match(snapshot, /do not touch Chatwoot/);
  assert.doesNotMatch(snapshot, /TOKEN|SECRET|xox|github_pat/i);
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

test('isNonFastForwardPushError detects Git push races only', () => {
  assert.equal(
    isNonFastForwardPushError(
      new Error("! [rejected] HEAD -> main (fetch first)\nerror: failed to push some refs\nUpdates were rejected because the remote contains work that you do not have locally.")
    ),
    true
  );
  assert.equal(
    isNonFastForwardPushError({
      result: {
        stderr: 'error: failed to push some refs\nhint: non-fast-forward'
      }
    }),
    true
  );
  assert.equal(isNonFastForwardPushError(new Error('npm run check failed')), false);
});

test('readRepoContextBundle loads bounded extra docs/context markdown files', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mavebot-context-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  await writeFile(path.join(dir, 'operating-memory.md'), 'do not include this copy');
  await writeFile(path.join(dir, 'slack-session.md'), 'do not include this copy either');
  await writeFile(path.join(dir, 'README.md'), 'do not include context map copy');
  await writeFile(path.join(dir, 'clash-ui-guidance.md'), '# Clash UI\nUse icon cards.');
  await writeFile(path.join(dir, 'remote-codex-session.md'), '# Remote Contract\nAct like a session.');
  await writeFile(path.join(dir, 'local-codex-parity.md'), '# Local Parity\nMatch local Codex.');
  await writeFile(path.join(dir, 'code-map.md'), '# Code Map\nUpdate index and commands.');
  await writeFile(path.join(dir, 'z-extra.md'), '# Extra\nLess important.');

  const bundle = await readRepoContextBundle({ dir, maxChars: 1000 });

  assert.ok(
    bundle.indexOf('## remote-codex-session.md') < bundle.indexOf('## local-codex-parity.md'),
    'remote session contract should be loaded before local parity contract'
  );
  assert.ok(
    bundle.indexOf('## local-codex-parity.md') < bundle.indexOf('## code-map.md'),
    'local parity contract should be loaded before source map'
  );
  assert.ok(
    bundle.indexOf('## code-map.md') < bundle.indexOf('## clash-ui-guidance.md'),
    'source map should be loaded before domain guidance'
  );
  assert.match(bundle, /Act like a session/);
  assert.match(bundle, /Match local Codex/);
  assert.match(bundle, /Update index and commands/);
  assert.match(bundle, /## clash-ui-guidance\.md/);
  assert.match(bundle, /Use icon cards/);
  assert.doesNotMatch(bundle, /do not include this copy/);
  assert.doesNotMatch(bundle, /do not include context map copy/);
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
