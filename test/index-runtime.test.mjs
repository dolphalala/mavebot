import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { commands } from '../src/commands.mjs';

test('registered slash commands have runtime command branches', async () => {
  const source = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');

  for (const command of commands) {
    assert.match(
      source,
      new RegExp(`interaction\\.commandName === ['"]${command.name}['"]`),
      `${command.name} is registered but has no runtime handler branch`
    );
  }
});

test('loveu runtime sends a generated heart attachment and poem helper', async () => {
  const source = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');

  assert.match(source, /randomLoveuPoem/);
  assert.match(source, /loveu-heart\.png/);
  assert.match(source, /createLanaHeartPng/);
  assert.match(source, /allowedMentions: \{ users: \[targetUser\.id\] \}/);
});

test('player runtime replies before hydrating the heavier army image', async () => {
  const source = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');

  assert.match(source, /getString\('tag'\) \|\| interaction\.options\.getString\('player'\)/);
  assert.match(source, /armyImageLoading: true/);
  assert.match(source, /void hydratePlayerArmyCard\(view, player, tag\)/);
});

test('pictionary runtime handles guesses before Discord Codex intake', async () => {
  const source = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');

  assert.match(source, /handlePictionaryCommand\(interaction\)/);
  assert.match(source, /handlePictionaryGuessMessage\(message\)/);
  assert.match(source, /isCorrectPictionaryGuess/);
  assert.match(source, /recordPictionaryGame/);
  assert.ok(
    source.indexOf('handlePictionaryGuessMessage(message)') <
      source.indexOf('shouldHandleDiscordCodexMessage(message, discordCodexChannelId)'),
    'pictionary guesses should not be enqueued as Codex jobs'
  );
});

test('Discord Codex runtime exposes intake diagnostics in health output', async () => {
  const source = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');

  assert.match(source, /discordCodexLastCatchup/);
  assert.match(source, /discordCodexLastError/);
  assert.match(source, /discordCodexWorkerAuth/);
  assert.match(source, /discordCodexAuthBlockedJobs/);
  assert.match(source, /discordCodexWorkerQueue/);
  assert.match(source, /readDiscordCodexWorkerQueueSnapshot/);
  assert.match(source, /currentStage/);
  assert.match(source, /changedFileCount/);
  assert.match(source, /readDiscordCodexWorkerAuthState/);
  assert.match(source, /auth-retry-state\.json/);
  assert.match(source, /verifiedByExec/);
  assert.match(source, /discordCodexCatchupLimit/);
  assert.match(source, /discordCodexContextBackfillLimit/);
  assert.match(source, /discordCodexCatchupWindowMs/);
  assert.match(source, /discordCodexRecentContextWindowMs/);
  assert.match(source, /DISCORD_CODEX_RECENT_CONTEXT_WINDOW_MS \|\| String\(DEFAULT_DISCORD_CODEX_CATCHUP_WINDOW_MS\)/);
  assert.match(source, /discordCodexRecentContextLimit/);
  assert.match(source, /discordCodexRecentContextRows/);
  assert.match(source, /discordCodexContextLogPath/);
  assert.match(source, /discordCodexContextLogMaxRows/);
  assert.match(source, /discordCodexPersistentContextRows/);
  assert.match(source, /recentDiscordCodexContextRows/);
  assert.match(source, /discordContextLogWriteQueue/);
  assert.match(source, /summarizePendingDiscordCodexJobs/);
  assert.match(source, /discordCodexPendingRows/);
  assert.match(source, /discordCodexPendingFiles/);
  assert.match(source, /discordCodexPendingJobs/);
  assert.match(source, /isDiscordWorkingAckText/);
  assert.match(source, /appendDiscordContextRows/);
  assert.match(source, /readDiscordContextLog/);
  assert.match(source, /rememberDiscordCodexError\('catch-up'/);
  assert.match(source, /rememberDiscordCodexError\('enqueue'/);
  assert.match(source, /rememberDiscordCodexError\('attachment-download'/);
  assert.match(source, /rememberDiscordCodexError\('context-log'/);
  assert.match(source, /rememberDiscordCodexError\('message-create'/);
});

test('Discord Codex runtime treats auth-blocked jobs as handled records', async () => {
  const source = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');

  assert.match(source, /discordCodexWorkerRecordDirs/);
  assert.match(source, /discordCodexWorkerRecordDir\('auth-blocked'\)/);
  assert.match(source, /countDiscordCodexWorkerRecords\('auth-blocked'\)/);
});

test('Discord Codex runtime uses queue-aware human acknowledgements', async () => {
  const source = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');

  assert.match(source, /discordCodexWorkingAckMessage/);
  assert.match(source, /pendingBursts: Math\.max\(0, pendingDiscordCodexJobs\.size - 1\)/);
  assert.match(source, /discordWorkingMessageForQueue\(\{\s*\.\.\.snapshot,\s*pendingBursts\s*\}\)/);
  assert.match(source, /DISCORD_CODEX_FOLLOWUP_REACTION/);
  assert.match(source, /acknowledgeDiscordCodexFollowup/);
  assert.match(source, /message\.react\(reaction\)/);
  assert.match(source, /rememberDiscordCodexError\('followup-reaction'/);
  assert.match(source, /rememberDiscordCodexError\('working-ack-queue'/);
});

test('Discord Codex runtime answers simple queue status without spawning a worker job', async () => {
  const source = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');

  assert.match(source, /discordImmediateStatusKind/);
  assert.match(source, /buildDiscordCodexQueueStatusReply/);
  assert.match(source, /readDiscordCodexWorkerQueueSnapshot/);
  assert.match(source, /readDiscordCodexWorkerAuthState/);
  assert.match(source, /summarizePendingDiscordCodexJobs/);
  assert.match(source, /immediate-queue-status/);
  assert.match(source, /Nothing is running right now\. Send the next thing here\./);
  assert.ok(
    source.indexOf("kind === 'queue'") < source.indexOf('writeDiscordImmediateDoneRecord'),
    'queue status should be handled through the immediate done-record path before worker enqueue'
  );
});

test('roster runtime handles signup and status subcommands', async () => {
  const source = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');

  assert.match(source, /subcommand === 'signup'/);
  assert.match(source, /subcommand === 'status'/);
  assert.match(source, /signupClashRoster/);
  assert.match(source, /buildClashRosterStatusText/);
  assert.match(source, /interaction\.options\.getString\('player', true\)/);
});
