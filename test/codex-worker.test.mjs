import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  activeRequestNeedsClashProductDiscovery,
  activeRequestNeedsDetailedAnswer,
  authBlockedJobExtra,
  buildCodexExecArgs,
  buildCodexWorkerPrompt,
  buildMovedJobRecord,
  buildWorkerRuntimeSnapshot,
  changedFilesFromGitStatus,
  checkUrl,
  codexLoginStatusLooksReady,
  codexImagePathsForJob,
  compactTranscriptRows,
  commitMessageForJob,
  deployWebhookPayload,
  detailedWorkerChannelMessage,
  errorDiagnosticText,
  finalChannelMessage,
  githubWebhookSignature,
  humanizeWorkerChannelMessage,
  isCodexImageFile,
  isCodexAuthError,
  isLowSignalTranscriptRow,
  isNonFastForwardPushError,
  pruneTranscriptRowsForStorage,
  readRecentWorkerJobHistory,
  readRepoContextBundle,
  shouldRunChecksForChangedFiles,
  triggerDeployWebhook,
  workerAuthStatusRecord,
  workerFailureMessage,
  workerProgressMessage
} from '../src/codex-worker.mjs';

test('compactTranscriptRows keeps recent turns bounded and older turns summarized', () => {
  const rows = Array.from({ length: 6 }, (_, index) => ({
    at: `2026-06-24T00:00:0${index}.000Z`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    user: index % 2 === 0 ? `U${index}` : 'mavebot',
    source: 'discord',
    channel: '1523893930993778698',
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
  assert.doesNotMatch(snapshot.recent, /turn 3/);
  assert.match(snapshot.session, /Recent turn count included in prompts: 2/);
  assert.match(snapshot.session, /Discord #codex jobs/);
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
    },
    {
      at: '2026-07-07T00:08:00.000Z',
      role: 'assistant',
      user: 'mavebot',
      source: 'discord',
      channel: '1523893930993778698',
      jobId: '1523893930993778698-codex-parity-live-123',
      text: 'Confirmed: I can read the attached image file and post a normal Discord channel reply.'
    },
    {
      at: '2026-07-07T00:09:00.000Z',
      role: 'user',
      user: 'Codex smoke',
      source: 'discord',
      channel: '1523893930993778698',
      jobId: 'discord-auth-smoke-1783591385380',
      text: 'Auth smoke test after worker diagnostics update. Do not change files.'
    },
    {
      at: '2026-07-07T00:10:00.000Z',
      role: 'user',
      user: 'Codex smoke',
      source: 'discord',
      channel: '1523893930993778698',
      jobId: 'discord-only-smoke-1783589874735',
      text: 'Discord-only worker smoke test after bridge removal. Do not change files.'
    },
    {
      at: '2026-07-09T12:28:58.864Z',
      role: 'user',
      user: 'codex-desktop-smoke',
      source: 'discord',
      channel: '0',
      text: 'Auth-blocked queue smoke test. Do not change files. Reply OK only.'
    },
    {
      at: '2026-07-09T08:40:06.133Z',
      role: 'user',
      user: 'dolphala',
      source: 'discord',
      channel: '1523893930993778698',
      text: 'research how clashking and clashperk both work in terms of collecting trophies in database and past cwl and war stats and create the same data structure so we can start collecitng on schedule all the necessary data about all players we ever care about'
    },
    {
      at: '2026-07-09T08:49:59.844Z',
      role: 'assistant',
      user: 'mavebot',
      source: 'discord',
      channel: '1523893930993778698',
      text: 'Added the ClashKing/ClashPerk-style backend collector.\n\nDone and live.'
    },
    {
      at: '2026-07-09T21:34:18.198Z',
      role: 'user',
      user: 'Codex desktop verification',
      source: 'discord',
      channel: '1523893930993778698',
      text: 'Live latency check from Codex desktop. Reply exactly: fast path works. Do not change files.'
    },
    {
      at: '2026-07-09T21:34:39.225Z',
      role: 'assistant',
      user: 'mavebot',
      source: 'discord',
      channel: '1523893930993778698',
      text: 'fast path works.'
    },
    {
      at: '2026-07-09T21:35:20.671Z',
      role: 'assistant',
      user: 'mavebot',
      source: 'discord',
      channel: '1523893930993778698',
      text: 'warm fast path works.'
    },
    {
      at: '2026-07-09T22:05:24.319Z',
      role: 'assistant',
      user: 'mavebot',
      source: 'discord',
      channel: '1523893930993778698',
      text: 'progress diagnostics smoke works'
    },
    {
      at: '2026-07-09T22:10:43.335Z',
      role: 'assistant',
      user: 'mavebot',
      source: 'discord',
      channel: '1523893930993778698',
      text: 'Plan was docs-only: add one durable note and leave app code untouched.\n\nNo app code changed.'
    },
    {
      at: '2026-07-10T23:24:02.086Z',
      role: 'assistant',
      user: 'mavebot',
      source: 'discord',
      channel: '1523893930993778698',
      text: 'Discord worker verification is ok. Context loaded, no files changed.'
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
  assert.equal(isLowSignalTranscriptRow(rows[8]), true);
  assert.equal(isLowSignalTranscriptRow(rows[9]), true);
  assert.equal(isLowSignalTranscriptRow(rows[10]), true);
  assert.equal(isLowSignalTranscriptRow(rows[11]), true);
  assert.equal(isLowSignalTranscriptRow(rows[12]), false);
  assert.equal(isLowSignalTranscriptRow(rows[13]), false);
  assert.equal(isLowSignalTranscriptRow(rows[14]), true);
  assert.equal(isLowSignalTranscriptRow(rows[15]), true);
  assert.equal(isLowSignalTranscriptRow(rows[16]), true);
  assert.equal(isLowSignalTranscriptRow(rows[17]), true);
  assert.equal(isLowSignalTranscriptRow(rows[18]), true);
  assert.equal(isLowSignalTranscriptRow(rows[19]), true);

  const snapshot = compactTranscriptRows(rows, {
    recentLimit: 5,
    summaryLimit: 5,
    generatedAt: '2026-07-07T00:03:00.000Z'
  });

  assert.match(snapshot.recent, /make \/player show better army cards/);
  assert.match(snapshot.recent, /research how clashking and clashperk/);
  assert.match(snapshot.recent, /Added the ClashKing\/ClashPerk-style backend collector/);
  assert.doesNotMatch(snapshot.recent, /Smoke test from the local Codex app/);
  assert.doesNotMatch(snapshot.recent, /Discord worker path is live/);
  assert.doesNotMatch(snapshot.recent, /Memory compaction is clean/);
  assert.doesNotMatch(snapshot.recent, /working acknowledgements/);
  assert.doesNotMatch(snapshot.recent, /attached image file/);
  assert.doesNotMatch(snapshot.recent, /Auth smoke test/);
  assert.doesNotMatch(snapshot.recent, /Auth-blocked queue smoke test/);
  assert.doesNotMatch(snapshot.recent, /Discord-only worker smoke/);
  assert.doesNotMatch(snapshot.recent, /fast path works/);
  assert.doesNotMatch(snapshot.recent, /progress diagnostics smoke/);
  assert.doesNotMatch(snapshot.recent, /Plan was docs-only/);
  assert.doesNotMatch(snapshot.recent, /Discord worker verification is ok/);
  assert.match(snapshot.session, /Low-signal smoke\/verification turns suppressed from prompt memory: 17/);
});

test('compactTranscriptRows strips worker handoff boilerplate from retained memory', () => {
  const snapshot = compactTranscriptRows(
    [
      {
        at: '2026-07-07T00:00:00.000Z',
        role: 'assistant',
        user: 'mavebot',
        source: 'discord',
        channel: '1523893930993778698',
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

test('compactTranscriptRows labels stale roster command examples in old assistant memory', () => {
  const snapshot = compactTranscriptRows(
    [
      {
        at: '2026-07-09T07:17:57.305Z',
        role: 'assistant',
        user: 'mavebot',
        source: 'discord',
        channel: '1523893930993778698',
        text: [
          'Plan:',
          '1. `/roster enroll clan:#JY99CJC8` saves the clan and starts snapshotting members.',
          '2. `/signup player:#TAG` links a Discord user to a CoC account for upcoming CWL.',
          '3. `/roster build size:15` ranks the signed-up pool.'
        ].join('\n')
      }
    ],
    {
      recentLimit: 5,
      summaryLimit: 5,
      generatedAt: '2026-07-09T07:20:00.000Z'
    }
  );

  assert.match(snapshot.recent, /Stale prior answer warning/);
  assert.match(snapshot.recent, /Current source uses \/track clan, \/roster plan, \/roster signup, and \/roster status/);
  assert.match(snapshot.recent, /\[stale roster-enroll example\]/);
  assert.match(snapshot.recent, /\[stale roster-build example\]/);
  assert.match(snapshot.recent, /\[stale signup example; current command is \/roster signup\]/);
  assert.doesNotMatch(snapshot.recent, /\/roster enroll clan:#JY99CJC8/);
  assert.doesNotMatch(snapshot.recent, /\/roster build size:15/);
});

test('compactTranscriptRows condenses long assistant reports for prompt memory', () => {
  const snapshot = compactTranscriptRows(
    [
      {
        at: '2026-07-07T00:00:00.000Z',
        role: 'assistant',
        user: 'mavebot',
        source: 'discord',
        channel: '1523893930993778698',
        text: [
          'Found and fixed another remote-runner parity gap. What happened: restart catch-up split a partly handled burst.',
          '',
          'Summary:',
          '- Updated queue tracking.',
          '- Added checks.',
          '',
          'Checks:',
          '- npm run check'
        ].join('\n')
      }
    ],
    {
      recentLimit: 5,
      summaryLimit: 5,
      generatedAt: '2026-07-07T00:01:00.000Z'
    }
  );

  assert.match(snapshot.recent, /Found and fixed another remote-runner parity gap\./);
  assert.doesNotMatch(snapshot.recent, /Summary|npm run check|partly handled burst/);
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
    },
    {
      at: '2026-07-07T00:04:00.000Z',
      role: 'assistant',
      user: 'mavebot',
      source: 'discord',
      channel: '1523893930993778698',
      text: [
        'Added `/player` pages.',
        '',
        'Ready for the worker to commit/push/deploy.',
        '',
        'Done and live.'
      ].join('\n')
    },
    {
      at: '2026-07-07T00:05:00.000Z',
      role: 'assistant',
      user: 'mavebot',
      source: 'discord',
      channel: '1523893930993778698',
      text: 'Remote Discord worker path is working.'
    },
    {
      at: '2026-07-07T00:06:00.000Z',
      role: 'assistant',
      user: 'mavebot',
      source: 'discord',
      channel: '1523893930993778698',
      jobId: '1523893930993778698-codex-desktop-parity-123',
      text: 'Confirmed: I can read the attached image file and post a normal Discord channel reply.'
    },
    {
      at: '2026-07-09T12:28:58.864Z',
      role: 'user',
      user: 'codex-desktop-smoke',
      source: 'discord',
      channel: '0',
      text: 'Auth-blocked queue smoke test. Do not change files. Reply OK only.'
    },
    {
      at: '2026-07-09T21:34:39.225Z',
      role: 'assistant',
      user: 'mavebot',
      source: 'discord',
      channel: '1523893930993778698',
      text: 'fast path works.'
    },
    {
      at: '2026-07-09T22:10:43.335Z',
      role: 'assistant',
      user: 'mavebot',
      source: 'discord',
      channel: '1523893930993778698',
      text: 'Plan was docs-only: add one durable note and leave app code untouched.'
    },
    {
      at: '2026-07-09T08:49:59.844Z',
      role: 'assistant',
      user: 'mavebot',
      source: 'discord',
      channel: '1523893930993778698',
      text: 'Added the ClashKing/ClashPerk-style backend collector.'
    }
  ];

  assert.deepEqual(
    pruneTranscriptRowsForStorage(rows).map((row) => row.text),
    [
      'make /player show better army cards',
      'Added `/player` pages.',
      'Added the ClashKing/ClashPerk-style backend collector.'
    ]
  );
});

test('buildCodexWorkerPrompt puts active Discord request before memory', () => {
  const prompt = buildCodexWorkerPrompt({
    job: {
      source: 'discord',
      user: 'UACTIVE',
      channel: '1523893930993778698',
      ts: '1782400000.000000',
      text: 'change /lana now',
      files: [
        {
          name: 'screen.png',
          mimetype: 'image/png',
          localPath: '/shared/codex-worker/context/discord-files/1523893930993778698/1782400000/01-screen.png'
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
    remoteSession: 'discord session',
    repoContextBundle: 'clash ui guidance',
  });

  assert.ok(
    prompt.indexOf('Active Discord request') < prompt.indexOf('# Worker Compacted Memory'),
    'active Discord request should be before compacted memory'
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
  assert.match(prompt, /Answer every explicit question in the active request/);
  assert.match(prompt, /multiple contextMessages/);
  assert.match(prompt, /Preserve speaker names, files, and every explicit ask/);
  assert.match(prompt, /multiple users are bundled/);
  assert.match(prompt, /unrelated independent requests/);
  assert.match(prompt, /For multi-part requests, track each part yourself/);
  assert.match(prompt, /asks for a plan\/demo\/how-it-works answer/i);
  assert.match(prompt, /image files are attached, inspect the image content/i);
  assert.match(prompt, /docs\/context\/remote-codex-session\.md/);
  assert.match(prompt, /Discord command changes must update both src\/commands\.mjs and src\/index\.mjs/);
  assert.match(prompt, /# Extra Repo Context Files/);
  assert.match(prompt, /clash ui guidance/);
  assert.match(prompt, /screen\.png/);
  assert.match(prompt, /\/shared\/codex-worker\/context\/discord-files\/1523893930993778698\/1782400000\/01-screen\.png/);
  assert.match(prompt, /extra setup context/);
});

test('buildCodexWorkerPrompt marks plan and demo requests for detailed answers', () => {
  const prompt = buildCodexWorkerPrompt({
    job: {
      source: 'discord',
      user: 'UACTIVE',
      username: 'Allen',
      channel: '1523893930993778698',
      ts: '2026-07-09T07:07:42.060Z',
      text: 'tell me the plan. is there a demo? hows this gonna work?',
      turn: {
        activeMessageCount: 1,
        activeUserCount: 1,
        lanes: ['planning'],
        multiStepLikely: true,
        multiAgentHelpful: false
      }
    },
    summary: '',
    recent: '',
    repoInstructions: '',
    contextIndex: '',
    runtimeSnapshot: '',
    operatingMemory: '',
    repoContextBundle: '',
  });

  assert.equal(activeRequestNeedsDetailedAnswer({ text: 'is there a demo?' }), true);
  assert.equal(activeRequestNeedsDetailedAnswer({ text: 'what did it change and why?' }), true);
  assert.equal(activeRequestNeedsDetailedAnswer({ text: 'design a database collector like clashking' }), true);
  assert.equal(activeRequestNeedsDetailedAnswer({ text: 'did u read everything i said?' }), true);
  assert.equal(activeRequestNeedsDetailedAnswer({ text: 'can u see this screenshot and explain?' }), true);
  assert.equal(activeRequestNeedsDetailedAnswer({ text: 'can u do this? also what about that?' }), true);
  assert.equal(
    activeRequestNeedsDetailedAnswer({
      source: 'discord',
      text: '[2026-07-09T10:00:00.000Z] Allen: make /roster\n[2026-07-09T10:00:02.000Z] Lana: also add screenshot support',
      contextMessages: [
        { user: 'allen', username: 'Allen', text: 'make /roster' },
        { user: 'lana', username: 'Lana', text: 'also add screenshot support' }
      ]
    }),
    true
  );
  assert.match(prompt, /Active request response mode:/);
  assert.match(prompt, /"turn":/);
  assert.match(prompt, /"lanes": \[/);
  assert.match(prompt, /asks for a plan\/demo\/how-it-works answer/);
  assert.match(prompt, /Do not answer with only an acknowledgement/);
  assert.match(prompt, /compact plan, a concrete demo\/example/);
  assert.match(prompt, /Use active request turn metadata/);
  assert.match(prompt, /# Active Turn Working Guidance/);
  assert.match(prompt, /Suggested working lanes/);
  assert.match(prompt, /planning lane/);
  assert.match(prompt, /This looks multi-step/);
});

test('buildCodexWorkerPrompt treats ClashKing and ClashPerk asks as product discovery', () => {
  const text = [
    'research how clashking and clashperk both work in terms of collecting trophies in database',
    'and past cwl and war stats and create the same data structure so we can start collecting',
    'on schedule all the necessary data about all players we ever care about'
  ].join(' ');
  const job = {
    source: 'discord',
    user: 'UACTIVE',
    username: 'Allen',
    channel: '1523893930993778698',
    ts: '2026-07-10T00:00:00.000Z',
    text,
    turn: {
      activeMessageCount: 1,
      activeUserCount: 1,
      lanes: ['implementation', 'domain-research', 'product-discovery'],
      multiStepLikely: true,
      multiAgentHelpful: true
    }
  };
  const prompt = buildCodexWorkerPrompt({
    job,
    summary: '',
    recent: '',
    repoInstructions: '',
    contextIndex: '',
    runtimeSnapshot: '',
    operatingMemory: '',
    repoContextBundle: [
      '## clash-product-delivery.md',
      'Use the completion gate.',
      '',
      '## clash-competitor-research.md',
      'Use competitor research.'
    ].join('\n'),
    workerJobHistory: ''
  });

  assert.equal(activeRequestNeedsClashProductDiscovery(job), true);
  assert.equal(activeRequestNeedsDetailedAnswer(job), true);
  assert.match(prompt, /product-discovery/);
  assert.match(prompt, /ClashKing, ClashPerk, roster, CWL, war history, activity/);
  assert.match(prompt, /docs\/context\/clash-product-delivery\.md/);
  assert.match(prompt, /docs\/context\/clash-competitor-research\.md/);
  assert.match(prompt, /completion gate/);
  assert.match(prompt, /source\/context audit/);
  assert.match(prompt, /visible command or honest blocker/);
  assert.match(prompt, /what you learned, what mavebot should build, what changed now, and a concrete demo/i);
  assert.match(prompt, /backend collector/i);
  assert.match(prompt, /If the user asks to start collecting or create the same data structure/);
  assert.match(prompt, /Backend-only work is incomplete/);
  assert.match(prompt, /current Clash data-collection entry point is \/track player, \/track clan, and \/track status/);
  assert.match(
    prompt,
    /\/history player, \/roster plan, \/roster signup, \/roster status, \/warstats, \/activity, and \/summary are the first reporting\/enrollment surfaces/,
  );
  assert.match(
    prompt,
    /Future richer roster\/player pages, exports, config\/default-clan setup, player linking, and deeper war\/activity pages should build from the same store/,
  );
  assert.match(prompt, /Use actual command names from src\/commands\.mjs and src\/index\.mjs/);
  assert.match(prompt, /Do not invent roster names such as \/roster enroll or \/roster build/);
  assert.match(prompt, /What I learned, Data reality, What mavebot should build, Current visible slice, Data model\/commands, Demo\/next command, and Still missing/);
  assert.match(prompt, /Prefer the next missing user-visible command slice over backend-only work/);
  assert.match(prompt, /Do not answer with only an acknowledgement, "backend collector added", or a bare live claim/);
});

test('buildCodexWorkerPrompt includes recent worker job history for follow-up audits', () => {
  const prompt = buildCodexWorkerPrompt({
    job: {
      source: 'discord',
      user: 'UACTIVE',
      username: 'Allen',
      channel: '1523893930993778698',
      ts: '2026-07-09T10:00:00.000Z',
      text: 'that didnt work, what did you do?'
    },
    summary: '',
    recent: '',
    repoInstructions: '',
    contextIndex: '',
    runtimeSnapshot: '',
    operatingMemory: '',
    repoContextBundle: '',
    workerJobHistory: 'Recent worker job records, newest first.\n- fixed /roster but did not answer the plan'
  });

  assert.equal(activeRequestNeedsDetailedAnswer({ text: 'that didnt work, what did you do?' }), true);
  assert.match(prompt, /# Recent Worker Job Records/);
  assert.match(prompt, /fixed \/roster but did not answer the plan/);
  assert.match(prompt, /audit nearby Discord context plus recent worker job records/);
});

test('readRecentWorkerJobHistory summarizes real jobs and skips smoke jobs', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mavebot-job-history-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const done = path.join(dir, 'done');
  const failed = path.join(dir, 'failed');
  const authBlocked = path.join(dir, 'auth-blocked');
  await mkdir(done);
  await mkdir(failed);
  await mkdir(authBlocked);

  await writeFile(
    path.join(done, 'real.json'),
    JSON.stringify({
      id: 'discord-real',
      completedAt: '2026-07-09T10:00:00.000Z',
      source: 'discord',
      username: 'Allen',
      text: 'make /roster and explain the plan',
      turn: {
        activeMessageCount: 2,
        activeUserCount: 1,
        activeFileCount: 1,
        nearbyContextCount: 3,
        lanes: ['audit', 'implementation', 'memory'],
        multiStepLikely: true,
        multiAgentHelpful: true,
        activeUsers: ['Allen']
      },
      finalMessage: 'I added the roster command and explained the signup flow.',
      codexMessage: 'Plan:\n- Add storage\n- Add command pages',
      pushResult: { pushed: true },
      deployResult: { matched: true },
      workerTiming: {
        stages: [
          { name: 'ensure-repo', durationMs: 100, ok: true },
          { name: 'codex-exec', durationMs: 4200, ok: true },
          { name: 'checks', durationMs: 900, ok: true },
          { name: 'deploy-trigger', durationMs: 12, ok: true },
          { name: 'deploy-wait', durationMs: 5000, ok: true }
        ]
      }
    })
  );
  await writeFile(
    path.join(done, 'smoke.json'),
    JSON.stringify({
      id: 'discord-live-verify-1',
      completedAt: '2026-07-09T10:01:00.000Z',
      text: 'Smoke test from the local Codex app. Do not change files.',
      finalMessage: 'Discord worker path is live.'
    })
  );

  const history = await readRecentWorkerJobHistory({
    dirs: [
      { dir: done, status: 'done' },
      { dir: failed, status: 'failed' },
      { dir: authBlocked, status: 'auth-blocked' }
    ],
    limit: 5,
    maxChars: 3000
  });

  assert.match(history, /discord-real/);
  assert.match(history, /turn: .*messages:2/);
  assert.match(history, /lanes:audit\|implementation\|memory/);
  assert.match(history, /multiAgentHelpful/);
  assert.match(history, /make \/roster and explain the plan/);
  assert.match(history, /I added the roster command/);
  assert.match(history, /timing: .*codex-exec 4200ms/);
  assert.match(history, /deploy-trigger 12ms/);
  assert.doesNotMatch(history, /unknown error/);
  assert.doesNotMatch(history, /Smoke test|discord-live-verify/);
});

test('buildCodexWorkerPrompt includes nearby Discord context as background only', () => {
  const prompt = buildCodexWorkerPrompt({
    job: {
      source: 'discord',
      user: 'UACTIVE',
      username: 'Allen',
      channel: '1523893930993778698',
      ts: '2026-07-09T10:00:10.000Z',
      text: 'what did you do with the screenshot above?',
      contextMessages: [
        {
          receivedAt: '2026-07-09T10:00:10.000Z',
          id: 'active-1',
          user: 'UACTIVE',
          username: 'Allen',
          text: 'what did you do with the screenshot above?'
        }
      ],
      nearbyText: '[2026-07-09T10:00:00.000Z] Lana: screenshot for context',
      nearbyFiles: [
        {
          name: 'screen.png',
          mimetype: 'image/png',
          localPath: '/shared/codex-worker/context/discord-files/C/nearby-1/01-screen.png'
        }
      ],
      nearbyContextMessages: [
        {
          receivedAt: '2026-07-09T10:00:00.000Z',
          id: 'nearby-1',
          user: 'ULANA',
          username: 'Lana',
          text: 'screenshot for context',
          files: [
            {
              name: 'screen.png',
              mimetype: 'image/png',
              localPath: '/shared/codex-worker/context/discord-files/C/nearby-1/01-screen.png'
            }
          ]
        }
      ]
    },
    summary: '',
    recent: '',
    repoInstructions: '',
    contextIndex: '',
    runtimeSnapshot: '',
    operatingMemory: '',
    repoContextBundle: '',
  });

  assert.equal(
    activeRequestNeedsDetailedAnswer({
      source: 'discord',
      text: '',
      files: [{ name: 'screen.png', mimetype: 'image/png', localPath: '/tmp/screen.png' }]
    }),
    true
  );
  assert.match(prompt, /nearbyContextMessages and nearbyText are background channel context only/);
  assert.match(prompt, /do not treat them as additional tasks unless the active request refers to them/);
  assert.match(prompt, /If image files are attached, inspect the image content/);
  assert.match(prompt, /Do not merely say you can see it/);
  assert.match(prompt, /screenshot for context/);
  assert.match(prompt, /nearbyFiles/);
});

test('buildCodexWorkerPrompt uses Discord session memory without legacy tail noise', () => {
  const prompt = buildCodexWorkerPrompt({
    job: {
      source: 'discord',
      user: 'UACTIVE',
      username: 'Allen',
      channel: '1523893930993778698',
      ts: '2026-07-09T10:00:00.000Z',
      text: 'fix the discord worker'
    },
    summary: 'summary memory',
    recent: 'recent memory',
    repoInstructions: 'AGENTS instructions',
    contextIndex: 'context map',
    runtimeSnapshot: 'runtime snapshot',
    operatingMemory: 'operating memory',
    remoteSession: 'discord session memory',
    repoContextBundle: 'remote session contract'
  });

  assert.match(prompt, /discord session memory/);
  assert.doesNotMatch(prompt, /Legacy Raw/);
  assert.doesNotMatch(prompt, /tail available/);
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
    summary: 'old request: work on a different command',
    recent: 'recent request: check a different command',
    repoInstructions: 'AGENTS instructions',
    contextIndex: 'context map',
    runtimeSnapshot: 'runtime snapshot',
    operatingMemory: 'operating memory',
    remoteSession: 'session memory',
    repoContextBundle: 'remote session contract',
  });

  assert.ok(
    prompt.indexOf('Active Discord request') < prompt.indexOf('# Worker Compacted Memory'),
    'active Discord request should be before compacted memory'
  );
  assert.ok(
    prompt.indexOf('use the screenshot to fix /player') < prompt.indexOf('old request: work on a different command'),
    'active Discord request should beat older memory'
  );
  assert.match(prompt, /player-screen\.png/);
  assert.match(prompt, /\/shared\/codex-worker\/context\/discord-files\/1523893930993778698\/123\/01-player-screen\.png/);
  assert.match(prompt, /remote session contract/);
});

test('Codex exec args attach image files from Discord jobs', () => {
  const imageFiles = [
    {
      name: 'discord-screen.png',
      mimetype: 'image/png',
      localPath: '/shared/codex-worker/context/discord-files/C/M/01-discord-screen.png'
    },
    {
      name: 'discord-nearby.webp',
      localPath: '/shared/codex-worker/context/discord-files/C/M/02-discord-nearby.webp'
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
  assert.deepEqual(
    codexImagePathsForJob({
      files: [],
      nearbyFiles: [imageFiles[1]]
    }),
    ['/shared/codex-worker/context/discord-files/C/M/02-discord-nearby.webp']
  );

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
  assert.ok(args.includes('/shared/codex-worker/context/discord-files/C/M/02-discord-nearby.webp'));
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
      source: 'web',
      text: '<@U123> fix /player'
    }),
    'Remote: fix /player'
  );
  assert.equal(commitMessageForJob({ text: '' }), 'Discord: Remote request');
});

test('changedFilesFromGitStatus parses normal, renamed, and quoted paths', () => {
  assert.deepEqual(
    changedFilesFromGitStatus(
      [
        ' M src/index.mjs',
        'A  docs/context/worker notes.md',
        'R  old-name.mjs -> src/new-name.mjs',
        '?? "docs/context/remote notes.md"'
      ].join('\n')
    ),
    [
      'src/index.mjs',
      'docs/context/worker notes.md',
      'src/new-name.mjs',
      'docs/context/remote notes.md'
    ]
  );
  assert.deepEqual(
    changedFilesFromGitStatus('M docs/context/discord-session.md'),
    ['docs/context/discord-session.md']
  );
});

test('shouldRunChecksForChangedFiles skips pure memory docs but checks app files', () => {
  assert.equal(shouldRunChecksForChangedFiles([]), false);
  assert.equal(
    shouldRunChecksForChangedFiles([
      'docs/context/discord-session.md',
      'docs/context/operating-memory.md'
    ]),
    false
  );
  assert.equal(shouldRunChecksForChangedFiles(['README.md']), false);
  assert.equal(shouldRunChecksForChangedFiles(['src/index.mjs']), true);
  assert.equal(shouldRunChecksForChangedFiles(['scripts/register-commands.mjs']), true);
  assert.equal(shouldRunChecksForChangedFiles(['package.json']), true);
});

test('finalChannelMessage always returns a human success message', () => {
  assert.equal(
    finalChannelMessage({
      codexMessage: '',
      checkOk: true,
      pushResult: { pushed: false },
      deployResult: { matched: false, reason: 'no push needed' },
      runtime: { botOk: true }
    }),
    'I checked that. No code changes were needed.'
  );

  assert.equal(
    finalChannelMessage({
      codexMessage: 'I updated /lana.',
      checkOk: true,
      pushResult: { pushed: true },
      deployResult: { matched: true },
      runtime: { botOk: true }
    }),
    "I updated /lana.\n\nIt's live now."
  );
});

test('finalChannelMessage only requires Discord runtime health', () => {
  assert.equal(
    finalChannelMessage({
      codexMessage: 'Updated the Discord worker.',
      checkOk: true,
      pushResult: { pushed: true },
      deployResult: { matched: true },
      runtime: { botOk: true }
    }),
    "Updated the Discord worker.\n\nIt's live now."
  );

  assert.equal(
    finalChannelMessage({
      codexMessage: 'Updated the Discord worker.',
      checkOk: true,
      pushResult: { pushed: true },
      deployResult: { matched: true },
      runtime: { botOk: false }
    }),
    'Updated the Discord worker.\n\nHealth check needs attention: Discord not ok.'
  );
});

test('finalChannelMessage strips worker handoff boilerplate from channel replies', () => {
  assert.equal(
    finalChannelMessage({
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
    "Updated the Discord #codex working acknowledgements.\n\nIt's live now."
  );
});

test('finalChannelMessage strips routine deploy/check chatter from Codex replies', () => {
  assert.equal(
    finalChannelMessage({
      codexMessage: [
        'Fixed the remote runner behavior.',
        'Checks passed: npm install and npm run check.',
        'Pushed to main: abc123def456.',
        'Server deploy picked it up: abc123def456.',
        'Runtime health: Discord ok.'
      ].join('\n'),
      checkOk: true,
      pushResult: { pushed: true },
      deployResult: { matched: true },
      runtime: { botOk: true, bridgeOk: true }
    }),
    "Fixed the remote runner behavior.\n\nIt's live now."
  );
});

test('workerProgressMessage keeps long-job updates short and human', () => {
  assert.equal(
    workerProgressMessage('codex-exec', 1),
    "Still on it. I'm working through the code now."
  );
  assert.equal(
    workerProgressMessage('deploy-wait', 2),
    'Still waiting on the server deploy to finish.'
  );
  assert.equal(
    workerProgressMessage('deploy-trigger', 1),
    'Changes are saved. I am telling the server to deploy now.'
  );
  assert.equal(
    workerProgressMessage('runtime-health', 1),
    'Still on it. I am checking the live bot now.'
  );
  assert.doesNotMatch(workerProgressMessage('checks', 1), /worker|queue|job|processing/i);
});

test('deploy webhook helpers send GitHub-style signed push events', async () => {
  const payload = deployWebhookPayload('abc123', { ref: 'refs/heads/main' });
  assert.equal(payload.ref, 'refs/heads/main');
  assert.equal(payload.after, 'abc123');
  assert.equal(payload.repository.full_name, 'dolphalala/mavebot');

  const body = JSON.stringify(payload);
  assert.match(githubWebhookSignature('secret', body), /^sha256=[a-f0-9]{64}$/);

  const calls = [];
  const result = await triggerDeployWebhook('abc123', {
    url: 'http://127.0.0.1:4189/discord-bot-deploy',
    secret: 'secret',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response('deploy started\n', { status: 202 });
    }
  });

  assert.equal(result.triggered, true);
  assert.equal(result.ok, true);
  assert.equal(result.status, 202);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['X-GitHub-Event'], 'push');
  assert.match(calls[0].options.headers['X-Hub-Signature-256'], /^sha256=[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), payload);
});

test('triggerDeployWebhook skips cleanly when not configured', async () => {
  const result = await triggerDeployWebhook('abc123', { url: '', secret: '' });
  assert.equal(result.triggered, false);
  assert.equal(result.skipped, true);
  assert.match(result.reason, /not configured/);
});

test('finalChannelMessage strips inline premature live claims before wrapper status', () => {
  assert.equal(
    finalChannelMessage({
      codexMessage: 'Updated `/pictionary` to use real asset cards. Done and live.',
      checkOk: true,
      pushResult: { pushed: true },
      deployResult: { matched: true },
      runtime: { botOk: true, bridgeOk: true }
    }),
    "Updated `/pictionary` to use real asset cards.\n\nIt's live now."
  );
});

test('humanizeWorkerChannelMessage keeps channel replies short and conversational', () => {
  const message = humanizeWorkerChannelMessage(
    [
      'Found and fixed another remote-runner parity gap. What happened: Discord restart/catch-up could still split a partly handled message burst, so screenshots or follow-up text could get replayed without the original prompt.',
      '',
      'Summary:',
      '- Updated burst membership tracking.',
      '- Added diagnostics.',
      '',
      'Checks:',
      '- npm run check'
    ].join('\n')
  );

  assert.equal(message, 'Found and fixed another remote-runner parity gap.');
});

test('humanizeWorkerChannelMessage drops malformed lead fragments', () => {
  assert.equal(
    humanizeWorkerChannelMessage('Yes, I can see it. png` lookup. The real fix is in the asset fallback.'),
    'Yes, I can see it. The real fix is in the asset fallback.'
  );
});

test('detailedWorkerChannelMessage preserves requested plan and demo structure', () => {
  const message = detailedWorkerChannelMessage(
    [
      'Plan:',
      '- Track a clan with `/track clan tag:#JY99CJC8`.',
      '- Let members opt into CWL with `/roster signup player:#TAG clan:#JY99CJC8 note:available`.',
      '',
      'Demo:',
      'A sample roster would show TH16 anchors, reliable two-star attackers, and bench candidates.',
      '',
      'Checks:',
      '- npm run check',
      '',
      'Verification:',
      '- health ok'
    ].join('\n')
  );

  assert.match(message, /Plan:/);
  assert.match(message, /\/track clan/);
  assert.match(message, /\/roster signup/);
  assert.match(message, /Demo:/);
  assert.doesNotMatch(message, /npm run check|health ok/);
});

test('finalChannelMessage preserves longer plan answers when requested', () => {
  assert.equal(
    finalChannelMessage({
      codexMessage: [
        'Plan:',
        '- `/track clan tag:#JY99CJC8` saves the clan and starts snapshots.',
        '- `/roster signup player:#PLAYER clan:#JY99CJC8 note:available` lets members opt into CWL.',
        '',
        'Demo:',
        'For Crystal CWL, the bot would rank top accounts by TH, heroes, war stars, donations, activity, and tracked hit reliability.'
      ].join('\n'),
      checkOk: true,
      pushResult: { pushed: false },
      deployResult: { matched: false, reason: 'no push needed' },
      runtime: { botOk: true, bridgeOk: true },
      job: { text: 'first plan and tell me how itd work and make some demo' }
    }),
    [
      'Plan:',
      '- `/track clan tag:#JY99CJC8` saves the clan and starts snapshots.',
      '- `/roster signup player:#PLAYER clan:#JY99CJC8 note:available` lets members opt into CWL.',
      '',
      'Demo:',
      'For Crystal CWL, the bot would rank top accounts by TH, heroes, war stars, donations, activity, and tracked hit reliability.'
    ].join('\n')
  );
});

test('finalChannelMessage preserves Clash product-delivery structure', () => {
  const message = finalChannelMessage({
    codexMessage: [
      'I found the gap: the old ClashKing/ClashPerk answer only added storage and skipped the user-visible command.',
      '',
      'Built now: `/roster status clan:#JY99CJC8` shows tracked members, missing signups, and shallow-history warnings.',
      'Data model: `/shared/clash-history.json` uses tracked.clans, tracked.players, clans, players, wars, and rosters.',
      'Try: `/roster status clan:#JY99CJC8`',
      'What it shows: a CWL pool summary, top accounts, bench/watch list, and what still needs more snapshots.',
      '',
      'Still missing: richer roster pages, exports, default-clan config, and deeper war/activity pages as scheduled data accumulates.',
      '',
      'Checks:',
      '- npm run check'
    ].join('\n'),
    checkOk: true,
    pushResult: { pushed: true },
    deployResult: { matched: true },
    runtime: { botOk: true },
    job: {
      text: 'research how clashking and clashperk collect trophies and past cwl and war stats and create the same data structure'
    }
  });

  assert.match(message, /I found the gap/);
  assert.match(message, /Built now: `\/roster status clan:#JY99CJC8`/);
  assert.match(message, /Data model: `\/shared\/clash-history\.json`/);
  assert.match(message, /Try: `\/roster status clan:#JY99CJC8`/);
  assert.match(message, /Still missing: richer roster pages/);
  assert.match(message, /It's live now\./);
  assert.doesNotMatch(message, /npm run check/);
});

test('finalChannelMessage condenses long implementation reports for channels', () => {
  assert.equal(
    finalChannelMessage({
      codexMessage: [
        'Found the remote-runner problems and tightened them up. The issues were mostly session-parity gaps, not `/player` or `/loveu` alone. Discord needed better restart recovery and screenshots needed to stay attached to the active prompt.',
        '',
        'Summary:',
        '- Added image attachment support.',
        '- Added retry handling.',
        '',
        'Checks:',
        '- npm run check'
      ].join('\n'),
      checkOk: true,
      pushResult: { pushed: true },
      deployResult: { matched: true },
      runtime: { botOk: true, bridgeOk: true }
    }),
    "Found the remote-runner problems and tightened them up. The issues were mostly session-parity gaps, not `/player` or `/loveu` alone.\n\nIt's live now."
  );
});

test('finalChannelMessage removes premature live claims when deploy is not verified', () => {
  assert.equal(
    finalChannelMessage({
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

test('workerFailureMessage detects Codex auth failures from command output', () => {
  const error = new Error('codex exec exited 1');
  error.result = {
    stdout:
      'ERROR: Your access token could not be refreshed because your refresh token was revoked. Please log out and sign in again.',
    stderr: ''
  };

  const message = workerFailureMessage(error);

  assert.match(message, /server login expired/);
  assert.doesNotMatch(message, /refresh token|access token|401/i);
});

test('codexLoginStatusLooksReady rejects logged-out status before retry probe', () => {
  assert.equal(codexLoginStatusLooksReady({ code: 0, stdout: 'Logged in using ChatGPT' }), true);
  assert.equal(codexLoginStatusLooksReady({ code: 1, stdout: 'Not logged in' }), false);
  assert.equal(codexLoginStatusLooksReady({ code: 0, stdout: 'Not logged in' }), false);
  assert.equal(codexLoginStatusLooksReady('Please sign in again'), false);
});

test('workerAuthStatusRecord distinguishes status heartbeat from exec probe', () => {
  assert.deepEqual(
    workerAuthStatusRecord(
      { ready: true, reason: 'Logged in using ChatGPT' },
      {
        at: '2026-07-09T20:00:00.000Z',
        blockedJobs: 0,
        verifiedByExec: false
      }
    ),
    {
      at: '2026-07-09T20:00:00.000Z',
      blockedJobs: 0,
      verifiedByExec: false,
      ready: true,
      reason: 'Logged in using ChatGPT'
    }
  );

  assert.equal(
    workerAuthStatusRecord(
      { ready: true, reason: 'Codex auth probe passed.' },
      { blockedJobs: 2, verifiedByExec: true }
    ).verifiedByExec,
    true
  );
});

test('auth-blocked job records can be cleaned when requeued', () => {
  const extra = authBlockedJobExtra(
    new Error('HTTP 401 Unauthorized: token_invalidated'),
    {
      at: '2026-07-09T12:30:00.000Z',
      retryAfterMs: 300000
    }
  );

  assert.equal(extra.authBlocked, true);
  assert.equal(extra.authBlockedAt, '2026-07-09T12:30:00.000Z');
  assert.equal(extra.authRetryAfterMs, 300000);
  assert.match(extra.error, /401|token_invalidated/i);

  const requeued = buildMovedJobRecord(
    {
      id: 'job-1',
      failedAt: 'old',
      error: 'old error',
      authBlocked: true,
      authBlockedAt: 'old',
      authRetryAfterMs: 300000,
      contextFiles: { summaryPath: '/shared/summary.md' },
      contextSize: 10
    },
    {
      authRequeuedAt: '2026-07-09T12:35:00.000Z'
    },
    { clearFailure: true }
  );

  assert.equal(requeued.id, 'job-1');
  assert.equal(requeued.authRequeuedAt, '2026-07-09T12:35:00.000Z');
  assert.equal(Object.hasOwn(requeued, 'authBlocked'), false);
  assert.equal(Object.hasOwn(requeued, 'authBlockedAt'), false);
  assert.equal(Object.hasOwn(requeued, 'authRetryAfterMs'), false);
  assert.equal(Object.hasOwn(requeued, 'error'), false);
});

test('errorDiagnosticText preserves start and end of failed process output', () => {
  const error = new Error('codex exec exited 1');
  error.result = {
    stdout: `token_invalidated\n${'x'.repeat(5000)}\nfinal prompt tail`,
    stderr: ''
  };

  const text = errorDiagnosticText(error, 500);

  assert.match(text, /token_invalidated/);
  assert.match(text, /final prompt tail/);
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
    channel: '1523893930993778698',
    turn: {
      lanes: ['audit', 'implementation'],
      multiAgentHelpful: true
    }
  });

  assert.match(snapshot, /origin\/main/);
  assert.match(snapshot, /scripts\/deploy-server\.sh/);
  assert.match(snapshot, /Discord #codex/);
  assert.match(snapshot, /authBlockedDir/);
  assert.match(snapshot, /npm run check/);
  assert.match(snapshot, /transcript is normalized/);
  assert.match(snapshot, /localSessionParity/);
  assert.match(snapshot, /activeTurn/);
  assert.match(snapshot, /multiAgentHelpful/);
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
  await writeFile(path.join(dir, 'discord-session.md'), 'do not include canonical session copy');
  await writeFile(path.join(dir, 'README.md'), 'do not include context map copy');
  await writeFile(path.join(dir, 'clash-ui-guidance.md'), '# Clash UI\nUse icon cards.');
  await writeFile(path.join(dir, 'remote-codex-session.md'), '# Remote Contract\nAct like a session.');
  await writeFile(path.join(dir, 'local-codex-parity.md'), '# Local Parity\nMatch local Codex.');
  await writeFile(path.join(dir, 'code-map.md'), '# Code Map\nUpdate index and commands.');
  await writeFile(path.join(dir, 'clash-product-delivery.md'), '# Clash Delivery\nUse delivery gates.');
  await writeFile(path.join(dir, 'clash-competitor-research.md'), '# Clash Competitors\nBuild real product plans.');
  await writeFile(path.join(dir, 'clash-database-guidance.md'), '# Clash DB\nUse polling snapshots.');
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
    bundle.indexOf('## code-map.md') < bundle.indexOf('## clash-product-delivery.md'),
    'source map should be loaded before Clash delivery guidance'
  );
  assert.ok(
    bundle.indexOf('## clash-product-delivery.md') < bundle.indexOf('## clash-competitor-research.md'),
    'Clash delivery guidance should be loaded before competitor research'
  );
  assert.ok(
    bundle.indexOf('## clash-competitor-research.md') < bundle.indexOf('## clash-database-guidance.md'),
    'competitor research should be loaded before database guidance'
  );
  assert.ok(
    bundle.indexOf('## clash-database-guidance.md') < bundle.indexOf('## clash-ui-guidance.md'),
    'database guidance should be loaded before UI guidance'
  );
  assert.match(bundle, /Act like a session/);
  assert.match(bundle, /Match local Codex/);
  assert.match(bundle, /Update index and commands/);
  assert.match(bundle, /## clash-product-delivery\.md/);
  assert.match(bundle, /Use delivery gates/);
  assert.match(bundle, /## clash-competitor-research\.md/);
  assert.match(bundle, /Build real product plans/);
  assert.match(bundle, /## clash-ui-guidance\.md/);
  assert.match(bundle, /## clash-database-guidance\.md/);
  assert.match(bundle, /Use icon cards/);
  assert.match(bundle, /Use polling snapshots/);
  assert.doesNotMatch(bundle, /do not include this copy/);
  assert.doesNotMatch(bundle, /canonical session copy/);
  assert.doesNotMatch(bundle, /do not include context map copy/);
});

test('codex-worker can be imported from stdin module scripts', () => {
  const result = spawnSync(process.execPath, ['--input-type=module'], {
    cwd: process.cwd(),
    input: "import './src/codex-worker.mjs';\nconsole.log('import ok');\n",
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /import ok/);
});

test('checkUrl supports a local health endpoint', async (t) => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"ok":true}');
  });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  } catch (error) {
    throw error;
  }

  t.after(
    () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  );

  const address = server.address();
  assert.equal(await checkUrl(`http://127.0.0.1:${address.port}/healthz`), true);
});
