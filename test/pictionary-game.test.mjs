import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {
  buildPictionaryLeaderboard,
  formatPictionaryLeaderboard,
  isCorrectPictionaryGuess,
  normalizePictionaryRoundSeconds,
  normalizePictionaryRounds,
  readPictionaryStore,
  recordPictionaryGame,
  renderPictionaryRoundImage,
  selectPictionaryTopic
} from '../src/pictionary-game.mjs';

function user(id, username = id) {
  return {
    id,
    username,
    tag: username,
    globalName: username
  };
}

async function tempStore(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mavebot-pictionary-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return path.join(dir, 'pictionary.json');
}

test('pictionary answer matching accepts names and common aliases only', () => {
  const topic = {
    answer: 'Electro Dragon',
    aliases: ['edrag', 'e drag']
  };

  assert.equal(isCorrectPictionaryGuess('electro dragon', topic), true);
  assert.equal(isCorrectPictionaryGuess('E-DRAG', topic), true);
  assert.equal(isCorrectPictionaryGuess('dragon', topic), false);
});

test('pictionary round settings clamp to safe values', () => {
  assert.equal(normalizePictionaryRounds(1), 3);
  assert.equal(normalizePictionaryRounds(99), 10);
  assert.equal(normalizePictionaryRounds(undefined), 5);
  assert.equal(normalizePictionaryRoundSeconds(2), 15);
  assert.equal(normalizePictionaryRoundSeconds(1000), 90);
  assert.equal(normalizePictionaryRoundSeconds(undefined), 45);
});

test('selectPictionaryTopic avoids used topics and repeats categories only when needed', () => {
  const first = selectPictionaryTopic({ random: () => 0 });
  const second = selectPictionaryTopic({
    usedTopicIds: [first.id],
    previousCategory: first.category,
    random: () => 0
  });

  assert.notEqual(second.id, first.id);
  assert.notEqual(second.category, first.category);
});

test('recordPictionaryGame persists leaderboard stats and corrupt backups', async (t) => {
  const storePath = await tempStore(t);
  await writeFile(storePath, '{broken json', 'utf8');

  const empty = await readPictionaryStore(storePath);
  const files = await readdir(path.dirname(storePath));
  assert.deepEqual(empty, { version: 1, guilds: {} });
  assert.ok(files.some((name) => name.startsWith('pictionary.json.corrupt-')));

  const result = await recordPictionaryGame('guild-1', {
    channelId: 'channel-1',
    gameId: 'game-1',
    startedAt: new Date('2026-07-08T13:00:00.000Z'),
    endedAt: new Date('2026-07-08T13:05:00.000Z'),
    rounds: 5,
    winnerUser: user('u1', 'Allen'),
    players: [
      { user: user('u1', 'Allen'), score: 3 },
      { user: user('u2', 'Lana'), score: 2 }
    ],
    storePath
  });

  assert.equal(result.leaderboard[0].user.id, 'u1');
  assert.equal(result.leaderboard[0].points, 3);
  assert.equal(result.leaderboard[0].gamesWon, 1);
  assert.match(formatPictionaryLeaderboard(result.leaderboard), /Allen - 3 pts/);

  const leaderboard = buildPictionaryLeaderboard(await readPictionaryStore(storePath), 'guild-1');
  assert.equal(leaderboard.length, 2);
});

test('renderPictionaryRoundImage returns a valid Discord PNG card', async () => {
  const topic = selectPictionaryTopic({ random: () => 0 });
  const image = await renderPictionaryRoundImage(topic, {
    round: 2,
    totalRounds: 5,
    seconds: 30
  });
  const metadata = await sharp(image).metadata();

  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(metadata.width, 960);
  assert.equal(metadata.height, 540);
});
