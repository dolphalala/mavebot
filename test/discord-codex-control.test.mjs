import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildDiscordCodexWorkerJob,
  buildDiscordMessageRow,
  DISCORD_CODEX_WORKING_MESSAGES,
  DISCORD_MESSAGE_CONTENT_SETUP_MESSAGE,
  DEFAULT_DISCORD_ATTACHMENT_DOWNLOAD_MAX_BYTES,
  discordCodexSetupBlocker,
  discordFilesToWorkerLines,
  groupDiscordCodexMessageBursts,
  discordJobContainsMessage,
  discordLiveBurstKey,
  discordMessageToWorkerText,
  discordRowsToWorkerText,
  enqueueDiscordCodexWorkerJob,
  hasDiscordMessageContentIntentFlag,
  materializeDiscordAttachments,
  planDiscordCodexCatchupBursts,
  randomWorkingMessage,
  recentDiscordCodexMessagesForCatchup,
  shouldHandleDiscordCodexMessage
} from '../src/discord-codex-control.mjs';

function attachmentMap(items) {
  return {
    values() {
      return items.values();
    }
  };
}

test('shouldHandleDiscordCodexMessage accepts real users only in the codex channel', () => {
  const message = {
    channelId: '1523893930993778698',
    content: 'make a command',
    author: { id: 'user-1', bot: false }
  };

  assert.equal(shouldHandleDiscordCodexMessage(message, '1523893930993778698'), true);
  assert.equal(shouldHandleDiscordCodexMessage({ ...message, channelId: 'other' }, '1523893930993778698'), false);
  assert.equal(shouldHandleDiscordCodexMessage({ ...message, author: { bot: true } }, '1523893930993778698'), false);
  assert.equal(shouldHandleDiscordCodexMessage({ ...message, content: '   ' }, '1523893930993778698'), false);
});

test('discordMessageToWorkerText preserves attachment URLs for Codex context', () => {
  const text = discordMessageToWorkerText({
    content: 'use this screenshot',
    attachments: attachmentMap([
      { name: 'screen.png', url: 'https://cdn.discordapp.com/screen.png' }
    ])
  });

  assert.match(text, /use this screenshot/);
  assert.match(text, /\[attachment: screen\.png\] https:\/\/cdn\.discordapp\.com\/screen\.png/);
});

test('hasDiscordMessageContentIntentFlag accepts full and limited Discord app flags', () => {
  assert.equal(hasDiscordMessageContentIntentFlag(262144), true);
  assert.equal(hasDiscordMessageContentIntentFlag(524288), true);
  assert.equal(hasDiscordMessageContentIntentFlag(262144 | 524288), true);
  assert.equal(hasDiscordMessageContentIntentFlag(0), false);
});

test('materializeDiscordAttachments downloads screenshots into local worker context', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mavebot-discord-files-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const files = await materializeDiscordAttachments(
    {
      id: 'msg-1',
      channelId: '1523893930993778698',
      attachments: attachmentMap([
        {
          id: 'att-1',
          name: 'screen.png',
          contentType: 'image/png',
          size: 5,
          url: 'https://cdn.discordapp.com/screen.png'
        }
      ])
    },
    {
      contextDir: dir,
      maxBytes: DEFAULT_DISCORD_ATTACHMENT_DOWNLOAD_MAX_BYTES,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4, 5]).buffer
      })
    }
  );

  assert.equal(files.length, 1);
  assert.match(files[0].localPath, /1523893930993778698.*msg-1.*screen\.png/);
  assert.equal(files[0].bytes, 5);
  assert.equal((await readFile(files[0].localPath)).length, 5);
  assert.deepEqual(discordFilesToWorkerLines(files), [
    `[file: screen.png | type: image/png | local: ${files[0].localPath} | discord: https://cdn.discordapp.com/screen.png]`
  ]);
});

test('buildDiscordCodexWorkerJob marks Discord source and stable channel id', () => {
  const job = buildDiscordCodexWorkerJob(
    {
      id: '12345',
      channelId: '1523893930993778698',
      guildId: 'guild-1',
      createdTimestamp: Date.parse('2026-07-07T04:00:00.000Z'),
      content: 'make /test',
      author: {
        id: 'user-1',
        tag: 'Allen#0001',
        bot: false
      }
    },
    { createdAt: '2026-07-07T04:00:01.000Z' }
  );

  assert.equal(job.id, '1523893930993778698-12345');
  assert.equal(job.source, 'discord');
  assert.equal(job.guildId, 'guild-1');
  assert.equal(job.channel, '1523893930993778698');
  assert.equal(job.user, 'user-1');
  assert.equal(job.username, 'Allen#0001');
  assert.equal(job.text, 'make /test');
  assert.deepEqual(job.messageIds, ['12345']);
  assert.equal(job.contextMessages.length, 1);
  assert.equal(job.contextMessages[0].id, '12345');
  assert.equal(discordJobContainsMessage(job, '12345'), true);
  assert.equal(discordJobContainsMessage(job, 'other'), false);
});

test('buildDiscordCodexWorkerJob bundles adjacent Discord messages and files', () => {
  const rows = [
    buildDiscordMessageRow({
      id: 'm1',
      channelId: '1523893930993778698',
      guildId: 'guild-1',
      createdTimestamp: Date.parse('2026-07-07T04:00:00.000Z'),
      content: 'first ask',
      author: { id: 'user-1', username: 'Allen', bot: false }
    }),
    buildDiscordMessageRow(
      {
        id: 'm2',
        channelId: '1523893930993778698',
        guildId: 'guild-1',
        createdTimestamp: Date.parse('2026-07-07T04:00:02.000Z'),
        content: '',
        author: { id: 'user-2', username: 'Lana', bot: false }
      },
      {
        files: [
          {
            name: 'screen.png',
            mimetype: 'image/png',
            localPath: '/shared/codex-worker/context/discord-files/C/m2/01-screen.png'
          }
        ]
      }
    )
  ];
  const job = buildDiscordCodexWorkerJob(
    {
      id: 'm2',
      channelId: '1523893930993778698',
      guildId: 'guild-1',
      author: { id: 'user-2', username: 'Lana' }
    },
    { messageRows: rows, createdAt: '2026-07-07T04:00:03.000Z' }
  );

  assert.equal(job.id, '1523893930993778698-m2');
  assert.equal(job.user, 'user-2');
  assert.match(job.text, /Allen: first ask/);
  assert.match(job.text, /Lana: \(no text\)/);
  assert.match(job.text, /discord-files\/C\/m2\/01-screen\.png/);
  assert.deepEqual(job.messageIds, ['m1', 'm2']);
  assert.equal(job.contextMessages.length, 2);
  assert.equal(job.files.length, 1);
  assert.match(discordRowsToWorkerText(rows), /screen\.png/);
  assert.equal(discordJobContainsMessage(job, 'm1'), true);
  assert.equal(discordJobContainsMessage(job, 'm2'), true);
  assert.equal(discordJobContainsMessage(job, 'm3'), false);
});

test('buildDiscordCodexWorkerJob keeps nearby channel context out of handled ids', () => {
  const activeRows = [
    buildDiscordMessageRow({
      id: 'active-1',
      channelId: '1523893930993778698',
      guildId: 'guild-1',
      createdTimestamp: Date.parse('2026-07-09T10:00:10.000Z'),
      content: 'what did you do with the screenshot above?',
      author: { id: 'user-1', username: 'Allen', bot: false }
    })
  ];
  const nearbyRows = [
    buildDiscordMessageRow(
      {
        id: 'nearby-1',
        channelId: '1523893930993778698',
        guildId: 'guild-1',
        createdTimestamp: Date.parse('2026-07-09T10:00:00.000Z'),
        content: 'this is the screenshot',
        author: { id: 'user-2', username: 'Lana', bot: false }
      },
      {
        files: [
          {
            name: 'screen.png',
            mimetype: 'image/png',
            localPath: '/shared/codex-worker/context/discord-files/C/nearby-1/01-screen.png'
          }
        ]
      }
    ),
    activeRows[0]
  ];

  const job = buildDiscordCodexWorkerJob(
    {
      id: 'active-1',
      channelId: '1523893930993778698',
      guildId: 'guild-1',
      author: { id: 'user-1', username: 'Allen' }
    },
    {
      messageRows: activeRows,
      nearbyRows,
      createdAt: '2026-07-09T10:00:12.000Z'
    }
  );

  assert.deepEqual(job.messageIds, ['active-1']);
  assert.equal(job.contextMessages.length, 1);
  assert.equal(job.nearbyContextMessages.length, 1);
  assert.equal(job.nearbyContextMessages[0].id, 'nearby-1');
  assert.match(job.nearbyText, /this is the screenshot/);
  assert.equal(job.nearbyContextMessages[0].username, 'Lana');
  assert.equal(job.nearbyFiles.length, 1);
  assert.equal(discordJobContainsMessage(job, 'active-1'), true);
  assert.equal(discordJobContainsMessage(job, 'nearby-1'), false);
});

test('buildDiscordCodexWorkerJob can anchor bundled context to a specific source row', () => {
  const rows = [
    buildDiscordMessageRow({
      id: 'unhandled',
      channelId: '1523893930993778698',
      guildId: 'guild-1',
      createdTimestamp: Date.parse('2026-07-08T12:00:00.000Z'),
      content: 'new follow-up',
      author: { id: 'user-1', username: 'Allen', bot: false }
    }),
    buildDiscordMessageRow({
      id: 'already-handled',
      channelId: '1523893930993778698',
      guildId: 'guild-1',
      createdTimestamp: Date.parse('2026-07-08T12:00:05.000Z'),
      content: 'old handled context',
      author: { id: 'user-1', username: 'Allen', bot: false }
    })
  ];

  const job = buildDiscordCodexWorkerJob(
    {
      id: 'already-handled',
      channelId: '1523893930993778698',
      guildId: 'guild-1',
      author: { id: 'user-1', username: 'Allen' }
    },
    {
      messageRows: rows,
      sourceMessageId: 'unhandled',
      createdAt: '2026-07-08T12:00:06.000Z'
    }
  );

  assert.equal(job.id, '1523893930993778698-unhandled');
  assert.equal(job.ts, '2026-07-08T12:00:00.000Z');
  assert.deepEqual(job.messageIds, ['unhandled', 'already-handled']);
  assert.match(job.text, /new follow-up/);
  assert.match(job.text, /old handled context/);
});

test('recentDiscordCodexMessagesForCatchup selects recent unhandled human prompts', () => {
  const now = Date.parse('2026-07-08T11:20:00.000Z');
  const messages = [
    {
      id: 'old',
      channelId: '1523893930993778698',
      createdTimestamp: now - 31 * 60 * 1000,
      content: 'old prompt',
      author: { id: 'user-1', bot: false }
    },
    {
      id: 'recent-2',
      channelId: '1523893930993778698',
      createdTimestamp: now - 60 * 1000,
      content: 'second prompt',
      author: { id: 'user-2', bot: false }
    },
    {
      id: 'bot',
      channelId: '1523893930993778698',
      createdTimestamp: now - 30 * 1000,
      content: 'bot reply',
      author: { id: 'bot', bot: true }
    },
    {
      id: 'other',
      channelId: 'other',
      createdTimestamp: now - 20 * 1000,
      content: 'wrong channel',
      author: { id: 'user-3', bot: false }
    },
    {
      id: 'blank',
      channelId: '1523893930993778698',
      createdTimestamp: now - 10 * 1000,
      content: '   ',
      author: { id: 'user-4', bot: false }
    },
    {
      id: 'recent-1',
      channelId: '1523893930993778698',
      createdTimestamp: now - 2 * 60 * 1000,
      content: 'first prompt',
      author: { id: 'user-5', bot: false }
    }
  ];

  assert.deepEqual(
    recentDiscordCodexMessagesForCatchup(messages, {
      channelId: '1523893930993778698',
      now,
      windowMs: 30 * 60 * 1000
    }).map((message) => message.id),
    ['recent-1', 'recent-2']
  );
});

test('groupDiscordCodexMessageBursts keeps restart catch-up prompts together', () => {
  const now = Date.parse('2026-07-08T12:00:00.000Z');
  const messages = [
    {
      id: 'first',
      channelId: '1523893930993778698',
      createdTimestamp: now - 20_000,
      content: 'here is the issue',
      author: { id: 'user-1', bot: false }
    },
    {
      id: 'screen',
      channelId: '1523893930993778698',
      createdTimestamp: now - 12_000,
      content: '',
      attachments: attachmentMap([
        { id: 'att-1', name: 'screen.png', url: 'https://cdn.discordapp.com/screen.png' }
      ]),
      author: { id: 'user-1', bot: false }
    },
    {
      id: 'follow-up',
      channelId: '1523893930993778698',
      createdTimestamp: now - 2_000,
      content: 'and fix it like desktop would',
      author: { id: 'user-2', bot: false }
    },
    {
      id: 'later',
      channelId: '1523893930993778698',
      createdTimestamp: now + 30_000,
      content: 'separate request',
      author: { id: 'user-1', bot: false }
    }
  ];

  const bursts = groupDiscordCodexMessageBursts(messages, {
    channelId: '1523893930993778698',
    now: now + 30_000,
    windowMs: 60_000,
    gapMs: 15_000
  });

  assert.deepEqual(
    bursts.map((burst) => burst.map((message) => message.id)),
    [['first', 'screen', 'follow-up'], ['later']]
  );
});

test('planDiscordCodexCatchupBursts keeps partially handled bursts intact', async () => {
  const now = Date.parse('2026-07-08T12:00:00.000Z');
  const messages = [
    {
      id: 'already-queued',
      channelId: '1523893930993778698',
      createdTimestamp: now - 20_000,
      content: 'look into what happened',
      author: { id: 'user-1', bot: false }
    },
    {
      id: 'screenshot',
      channelId: '1523893930993778698',
      createdTimestamp: now - 12_000,
      content: '',
      attachments: attachmentMap([
        { id: 'att-1', name: 'screen.png', url: 'https://cdn.discordapp.com/screen.png' }
      ]),
      author: { id: 'user-1', bot: false }
    },
    {
      id: 'follow-up',
      channelId: '1523893930993778698',
      createdTimestamp: now - 2_000,
      content: 'this is the same issue',
      author: { id: 'user-1', bot: false }
    },
    {
      id: 'all-handled',
      channelId: '1523893930993778698',
      createdTimestamp: now + 30_000,
      content: 'old handled ask',
      author: { id: 'user-1', bot: false }
    }
  ];

  const plan = await planDiscordCodexCatchupBursts(messages, {
    channelId: '1523893930993778698',
    now: now + 30_000,
    windowMs: 60_000,
    gapMs: 15_000,
    handled: async (message) => ['already-queued', 'all-handled'].includes(message.id)
  });

  assert.deepEqual(
    plan.bursts.map((burst) => burst.map((message) => message.id)),
    [['already-queued', 'screenshot', 'follow-up']]
  );
  assert.deepEqual(
    plan.entries.map((entry) => entry.sourceMessageId),
    ['follow-up']
  );
  assert.equal(plan.scannedBursts, 2);
  assert.equal(plan.queuedBursts, 1);
  assert.equal(plan.skippedHandledBursts, 1);
  assert.equal(plan.partialBursts, 1);
  assert.equal(plan.handledMessages, 2);
});

test('enqueueDiscordCodexWorkerJob writes one private worker job', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mavebot-discord-job-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const job = {
    id: 'channel-message',
    source: 'discord',
    channel: 'channel',
    user: 'user',
    text: 'hello'
  };

  const first = await enqueueDiscordCodexWorkerJob(dir, job);
  const second = await enqueueDiscordCodexWorkerJob(dir, job);
  const saved = JSON.parse(await readFile(path.join(dir, 'channel-message.json'), 'utf8'));

  assert.equal(first.queued, true);
  assert.equal(second.queued, false);
  assert.deepEqual(saved, job);
});

test('randomWorkingMessage can be deterministic for tests', () => {
  assert.equal(randomWorkingMessage(() => 0), 'Got it, checking now.');
  assert.equal(
    randomWorkingMessage(() => DISCORD_CODEX_WORKING_MESSAGES.length - 1),
    "I'll dig into that now."
  );
});

test('discordLiveBurstKey bundles one user but separates simultaneous users', () => {
  const first = {
    channelId: '1523893930993778698',
    author: { id: 'user-1' }
  };
  const followUp = {
    channelId: '1523893930993778698',
    author: { id: 'user-1' }
  };
  const otherUser = {
    channelId: '1523893930993778698',
    author: { id: 'user-2' }
  };

  assert.equal(
    discordLiveBurstKey(first),
    discordLiveBurstKey(followUp),
    'same author in the same channel should stay in one live burst'
  );
  assert.notEqual(
    discordLiveBurstKey(first),
    discordLiveBurstKey(otherUser),
    'different users should not be merged into one live burst'
  );
  assert.equal(
    discordLiveBurstKey({ author: { id: 'user-1' } }, 'fallback-channel'),
    'fallback-channel:user-1'
  );
  assert.equal(
    discordLiveBurstKey({ channelId: 'channel-only' }),
    'channel-only:unknown-user'
  );
});

test('Discord Codex working messages stay short and human', () => {
  assert.ok(DISCORD_CODEX_WORKING_MESSAGES.length >= 4);
  for (const message of DISCORD_CODEX_WORKING_MESSAGES) {
    assert.equal(message.length <= 36, true);
    assert.doesNotMatch(message, /queued|worker|job|status|processing/i);
  }
});

test('discordCodexSetupBlocker explains the required portal setting only when needed', () => {
  assert.equal(
    discordCodexSetupBlocker({
      channelIdConfigured: true,
      messageContentIntentRequested: false
    }),
    DISCORD_MESSAGE_CONTENT_SETUP_MESSAGE
  );
  assert.equal(
    discordCodexSetupBlocker({
      channelIdConfigured: true,
      messageContentIntentRequested: true
    }),
    ''
  );
  assert.equal(
    discordCodexSetupBlocker({
      channelIdConfigured: false,
      messageContentIntentRequested: false
    }),
    ''
  );
});
