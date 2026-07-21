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

test('health endpoint does not parse the full Clash history store', async () => {
  const source = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');
  const healthRoute = source.slice(
    source.indexOf("app.get('/healthz'"),
    source.indexOf('const healthServer')
  );

  assert.doesNotMatch(healthRoute, /readClashHistoryStore/);
  assert.doesNotMatch(healthRoute, /await/);
});

test('pictionary runtime handles normal message guesses without control-channel intake', async () => {
  const source = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');

  assert.match(source, /handlePictionaryCommand\(interaction\)/);
  assert.match(source, /handlePictionaryGuessMessage\(message\)/);
  assert.match(source, /isCorrectPictionaryGuess/);
  assert.match(source, /recordPictionaryGame/);
  assert.doesNotMatch(source, /shouldHandleDiscordCodexMessage/);
  assert.doesNotMatch(source, /enqueueDiscordCodexMessage/);
});

test('runtime has no chat-control intake or worker diagnostics', async () => {
  const source = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');

  for (const forbidden of [
    'DISCORD_' + 'CODEX',
    'discord' + 'Codex'
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
});

test('roster runtime handles signup, status, and export subcommands', async () => {
  const source = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');

  assert.match(source, /subcommand === 'signup'/);
  assert.match(source, /subcommand === 'status'/);
  assert.match(source, /subcommand === 'export'/);
  assert.match(source, /signupClashRoster/);
  assert.match(source, /buildClashRosterStatusText/);
  assert.match(source, /buildClashRosterExportText/);
  assert.match(source, /interaction\.options\.getString\('player', true\)/);
  assert.match(source, /interaction\.options\.getString\('format'\) \|\| 'text'/);
});

test('config runtime handles default clan setup and status', async () => {
  const source = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');

  assert.match(source, /interaction\.commandName === 'config'/);
  assert.match(source, /getSubcommandGroup\(false\)/);
  assert.match(source, /setClashGuildDefaultClan/);
  assert.match(source, /buildClashGuildConfigText/);
  assert.match(source, /this server's default clan/);
});

test('link runtime handles player linking, status, and removal', async () => {
  const source = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');

  assert.match(source, /interaction\.commandName === 'link'/);
  assert.match(source, /linkClashPlayerToDiscord/);
  assert.match(source, /buildClashLinkStatusText/);
  assert.match(source, /removeClashPlayerLink/);
  assert.match(source, /This helps roster, activity, and future reminder features understand who is who/);
});

test('Clash operations report commands are handled at runtime', async () => {
  const source = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');

  assert.match(source, /interaction\.commandName === 'warstats'/);
  assert.match(source, /interaction\.commandName === 'activity'/);
  assert.match(source, /interaction\.commandName === 'summary'/);
  assert.match(source, /buildClashWarStatsText/);
  assert.match(source, /buildClashActivityText/);
  assert.match(source, /buildClashSummaryText/);
  assert.match(source, /interaction\.options\.getString\('clan'\)/);
  assert.match(source, /guildId: interaction\.guildId/);
  assert.match(source, /I started tracking this clan now/);
});
