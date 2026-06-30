import test from 'node:test';
import assert from 'node:assert/strict';
import { ApplicationCommandOptionType } from 'discord.js';
import { commands } from '../src/commands.mjs';

test('public command list excludes the old ping test command', () => {
  assert.equal(commands.some((command) => command.name === 'ping'), false);
});

test('lana command replaces the old iloveyou command', () => {
  const lana = commands.find((command) => command.name === 'lana');

  assert.ok(lana);
  assert.match(lana.description, /heart image/i);
  assert.equal(commands.some((command) => command.name === 'iloveyou'), false);
  assert.deepEqual(lana.integration_types, [0]);
  assert.deepEqual(lana.contexts, [0]);
});

test('player command is guild-install only and requires a tag option', () => {
  const player = commands.find((command) => command.name === 'player');

  assert.ok(player);
  assert.match(player.description, /focused Clash of Clans player card/i);
  assert.deepEqual(player.integration_types, [0]);
  assert.deepEqual(player.contexts, [0]);
  assert.deepEqual(player.options, [
    {
      name: 'tag',
      description: 'Player tag, with or without #.',
      type: ApplicationCommandOptionType.String,
      required: true,
      min_length: 3,
      max_length: 20
    }
  ]);
});

test('legends command is guild-install only and requires a player tag option', () => {
  const legends = commands.find((command) => command.name === 'legends');

  assert.ok(legends);
  assert.match(legends.description, /Legend League trophy changes/i);
  assert.deepEqual(legends.integration_types, [0]);
  assert.deepEqual(legends.contexts, [0]);
  assert.deepEqual(legends.options, [
    {
      name: 'player',
      description: 'Player tag to track, with or without #.',
      type: ApplicationCommandOptionType.String,
      required: true,
      min_length: 3,
      max_length: 20
    }
  ]);
});
