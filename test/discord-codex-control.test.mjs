import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildDiscordCodexWorkerJob,
  discordMessageToWorkerText,
  enqueueDiscordCodexWorkerJob,
  randomWorkingMessage,
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
  assert.equal(randomWorkingMessage(() => 0), 'On it.');
});
