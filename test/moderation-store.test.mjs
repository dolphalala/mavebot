import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildModerationRecordText,
  grantElder,
  isElder,
  readModerationStore,
  recordModerationOutcome,
  submitModerationVote
} from '../src/moderation-store.mjs';

function user(id, username = id) {
  return {
    id,
    username,
    tag: username
  };
}

async function tempStore(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mavebot-elder-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return path.join(dir, 'elder-votes.json');
}

test('grantElder stores guild elder membership', async (t) => {
  const storePath = await tempStore(t);
  const result = await grantElder('guild-1', user('elder-1', 'Lana'), user('admin-1', 'Allen'), {
    storePath,
    now: new Date('2026-07-07T03:10:00.000Z')
  });

  assert.equal(result.alreadyElder, false);
  assert.equal(await isElder('guild-1', 'elder-1', { storePath }), true);
  assert.equal(await isElder('guild-1', 'outsider', { storePath }), false);
});

test('submitModerationVote counts unique voters and completes at three votes', async (t) => {
  const storePath = await tempStore(t);
  const target = user('target-1', 'Target');

  const first = await submitModerationVote('mute', 'guild-1', target, user('voter-1', 'A'), {
    storePath,
    now: new Date('2026-07-07T03:11:00.000Z')
  });
  const duplicate = await submitModerationVote('mute', 'guild-1', target, user('voter-1', 'A'), {
    storePath,
    now: new Date('2026-07-07T03:12:00.000Z')
  });
  const second = await submitModerationVote('mute', 'guild-1', target, user('voter-2', 'B'), {
    storePath,
    now: new Date('2026-07-07T03:13:00.000Z')
  });
  const third = await submitModerationVote('mute', 'guild-1', target, user('voter-3', 'C'), {
    storePath,
    now: new Date('2026-07-07T03:14:00.000Z')
  });

  assert.equal(first.voteCount, 1);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.voteCount, 1);
  assert.equal(second.voteCount, 2);
  assert.equal(third.completed, true);
  assert.equal(third.voteCount, 3);

  const store = await readModerationStore(storePath);
  assert.equal(Object.keys(store.guilds['guild-1'].activeVotes).length, 0);
  assert.equal(store.guilds['guild-1'].records['target-1'].events.length, 3);
});

test('recordModerationOutcome and summary show permanent target record', async (t) => {
  const storePath = await tempStore(t);
  const target = user('target-1', 'Target');

  await submitModerationVote('bench', 'guild-1', target, user('voter-1', 'A'), { storePath });
  await submitModerationVote('bench', 'guild-1', target, user('voter-2', 'B'), { storePath });
  await submitModerationVote('bench', 'guild-1', target, user('voter-3', 'C'), { storePath });
  const result = await recordModerationOutcome('bench', 'guild-1', target, 'success', {
    storePath,
    reason: 'test passed'
  });

  const summary = buildModerationRecordText(result.record);
  assert.match(summary, /Bench votes: 3/);
  assert.match(summary, /benches passed: 1/);
  assert.match(summary, /Recent record:/);
});
