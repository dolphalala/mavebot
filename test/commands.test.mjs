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

test('allen command is guild-install only and creates a fresh love letter', () => {
  const allen = commands.find((command) => command.name === 'allen');

  assert.ok(allen);
  assert.match(allen.description, /fresh, heartfelt love letter/i);
  assert.deepEqual(allen.integration_types, [0]);
  assert.deepEqual(allen.contexts, [0]);
  assert.equal(allen.options, undefined);
});

test('loveu command is guild-install only and selects a Discord user', () => {
  const loveu = commands.find((command) => command.name === 'loveu');

  assert.ok(loveu);
  assert.match(loveu.description, /love poem/i);
  assert.deepEqual(loveu.integration_types, [0]);
  assert.deepEqual(loveu.contexts, [0]);
  assert.deepEqual(loveu.options, [
    {
      name: 'user',
      description: 'Discord user to receive the poem.',
      type: ApplicationCommandOptionType.User,
      required: true
    }
  ]);
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

test('config command exposes default-clan setup', () => {
  const config = commands.find((command) => command.name === 'config');

  assert.ok(config);
  assert.match(config.description, /sets up/i);
  assert.deepEqual(config.integration_types, [0]);
  assert.deepEqual(config.contexts, [0]);
  assert.deepEqual(config.options, [
    {
      name: 'clan',
      description: 'Configure the default Clash clan for this server.',
      type: ApplicationCommandOptionType.SubcommandGroup,
      options: [
        {
          name: 'set',
          description: 'Set the default clan used by summary, roster, war, and activity commands.',
          type: ApplicationCommandOptionType.Subcommand,
          options: [
            {
              name: 'tag',
              description: 'Clan tag, with or without #.',
              type: ApplicationCommandOptionType.String,
              required: true,
              min_length: 3,
              max_length: 20
            }
          ]
        },
        {
          name: 'status',
          description: 'Show the configured clan, tracking counts, and next useful commands.',
          type: ApplicationCommandOptionType.Subcommand
        }
      ]
    }
  ]);
});

test('link command exposes player account linking', () => {
  const link = commands.find((command) => command.name === 'link');

  assert.ok(link);
  assert.match(link.description, /links Discord users/i);
  assert.deepEqual(link.integration_types, [0]);
  assert.deepEqual(link.contexts, [0]);
  assert.deepEqual(
    link.options.map((option) => option.name),
    ['player', 'status', 'remove']
  );
  assert.equal(link.options[0].type, ApplicationCommandOptionType.Subcommand);
  assert.deepEqual(link.options[0].options[0], {
    name: 'tag',
    description: 'Player tag, with or without #.',
    type: ApplicationCommandOptionType.String,
    required: true,
    min_length: 3,
    max_length: 20
  });
  assert.deepEqual(link.options[1].options[0], {
    name: 'user',
    description: 'Discord user to check. Defaults to you.',
    type: ApplicationCommandOptionType.User,
    required: false
  });
  assert.equal(link.options[2].type, ApplicationCommandOptionType.Subcommand);
});

test('track command exposes player, clan, and status subcommands', () => {
  const track = commands.find((command) => command.name === 'track');

  assert.ok(track);
  assert.match(track.description, /history tracking/i);
  assert.deepEqual(track.integration_types, [0]);
  assert.deepEqual(track.contexts, [0]);
  assert.deepEqual(
    track.options.map((option) => option.name),
    ['player', 'clan', 'status']
  );
  assert.deepEqual(track.options[0], {
    name: 'player',
    description: 'Track a player and seed their first history snapshot.',
    type: ApplicationCommandOptionType.Subcommand,
    options: [
      {
        name: 'tag',
        description: 'Player tag, with or without #.',
        type: ApplicationCommandOptionType.String,
        required: true,
        min_length: 3,
        max_length: 20
      }
    ]
  });
  assert.deepEqual(track.options[1], {
    name: 'clan',
    description: 'Track a clan, seed its member list, and watch war/CWL data.',
    type: ApplicationCommandOptionType.Subcommand,
    options: [
      {
        name: 'tag',
        description: 'Clan tag, with or without #.',
        type: ApplicationCommandOptionType.String,
        required: true,
        min_length: 3,
        max_length: 20
      }
    ]
  });
  assert.deepEqual(track.options[2], {
    name: 'status',
    description: 'Show how many Clash players, clans, and wars are tracked.',
    type: ApplicationCommandOptionType.Subcommand
  });
});

test('history command exposes player history lookup', () => {
  const history = commands.find((command) => command.name === 'history');

  assert.ok(history);
  assert.match(history.description, /collected Clash history/i);
  assert.deepEqual(history.integration_types, [0]);
  assert.deepEqual(history.contexts, [0]);
  assert.deepEqual(history.options, [
    {
      name: 'player',
      description: 'Show trophy, donation, clan, and war history for a player.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'tag',
          description: 'Player tag, with or without #.',
          type: ApplicationCommandOptionType.String,
          required: true,
          min_length: 3,
          max_length: 20
        }
      ]
    }
  ]);
});

test('roster command exposes plan, signup, status, and export options', () => {
  const roster = commands.find((command) => command.name === 'roster');

  assert.ok(roster);
  assert.match(roster.description, /roster planning/i);
  assert.deepEqual(roster.integration_types, [0]);
  assert.deepEqual(roster.contexts, [0]);
  assert.deepEqual(
    roster.options.map((option) => option.name),
    ['plan', 'signup', 'status', 'export']
  );
  assert.deepEqual(roster.options[0], {
    name: 'plan',
    description: 'Suggest a CWL or war lineup from tracked clan and player history.',
    type: ApplicationCommandOptionType.Subcommand,
    options: [
      {
        name: 'clan',
        description: "Clan tag, with or without #. Defaults to this server's configured clan.",
        type: ApplicationCommandOptionType.String,
        required: false,
        min_length: 3,
        max_length: 20
      },
      {
        name: 'size',
        description: 'Roster size to plan for.',
        type: ApplicationCommandOptionType.Integer,
        required: false,
        min_value: 5,
        max_value: 50
      },
      {
        name: 'style',
        description: 'How aggressive the roster recommendation should be.',
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: 'Balanced', value: 'balanced' },
          { name: 'Safe', value: 'safe' },
          { name: 'Growth', value: 'growth' }
        ]
      }
    ]
  });
  assert.deepEqual(roster.options[1], {
    name: 'signup',
    description: 'Sign a Discord member up for a Clash roster with their player tag.',
    type: ApplicationCommandOptionType.Subcommand,
    options: [
      {
        name: 'player',
        description: 'Player tag to add to the roster, with or without #.',
        type: ApplicationCommandOptionType.String,
        required: true,
        min_length: 3,
        max_length: 20
      },
      {
        name: 'clan',
        description: "Clan tag for this roster. Defaults to this server's configured clan.",
        type: ApplicationCommandOptionType.String,
        required: false,
        min_length: 3,
        max_length: 20
      },
      {
        name: 'note',
        description: 'Optional roster note, such as availability, army, or role.',
        type: ApplicationCommandOptionType.String,
        required: false,
        max_length: 120
      }
    ]
  });
  assert.deepEqual(roster.options[2], {
    name: 'status',
    description: 'Show roster signups, missing clan members, and data readiness.',
    type: ApplicationCommandOptionType.Subcommand,
    options: [
      {
        name: 'clan',
        description: "Clan tag, with or without #. Defaults to this server's configured clan.",
        type: ApplicationCommandOptionType.String,
        required: false,
        min_length: 3,
        max_length: 20
      }
    ]
  });
  assert.deepEqual(roster.options[3], {
    name: 'export',
    description: 'Export roster signups and missing members for leaders to copy.',
    type: ApplicationCommandOptionType.Subcommand,
    options: [
      {
        name: 'clan',
        description: "Clan tag, with or without #. Defaults to this server's configured clan.",
        type: ApplicationCommandOptionType.String,
        required: false,
        min_length: 3,
        max_length: 20
      },
      {
        name: 'format',
        description: 'Export format.',
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: 'Readable text', value: 'text' },
          { name: 'CSV', value: 'csv' }
        ]
      }
    ]
  });
});

test('Clash operations commands expose optional clan tags', () => {
  for (const name of ['warstats', 'activity', 'summary']) {
    const command = commands.find((entry) => entry.name === name);

    assert.ok(command, `${name} command should exist`);
    assert.deepEqual(command.integration_types, [0]);
    assert.deepEqual(command.contexts, [0]);
    assert.deepEqual(command.options, [
      {
        name: 'clan',
        description: "Clan tag, with or without #. Defaults to this server's configured clan.",
        type: ApplicationCommandOptionType.String,
        required: false,
        min_length: 3,
        max_length: 20
      }
    ]);
  }
});

test('pictionary command is guild-install only and allows round settings', () => {
  const pictionary = commands.find((command) => command.name === 'pictionary');

  assert.ok(pictionary);
  assert.match(pictionary.description, /picture guessing game/i);
  assert.deepEqual(pictionary.integration_types, [0]);
  assert.deepEqual(pictionary.contexts, [0]);
  assert.deepEqual(pictionary.options, [
    {
      name: 'difficulty',
      description: 'How obscure and hidden the picture should be.',
      type: ApplicationCommandOptionType.String,
      required: false,
      choices: [
        { name: 'Easy', value: 'easy' },
        { name: 'Normal', value: 'normal' },
        { name: 'Hard (default)', value: 'hard' },
        { name: 'Expert', value: 'expert' },
        { name: 'Mixed', value: 'mixed' }
      ]
    },
    {
      name: 'rounds',
      description: 'Number of rounds for this game.',
      type: ApplicationCommandOptionType.Integer,
      required: false,
      min_value: 3,
      max_value: 10
    },
    {
      name: 'seconds',
      description: 'Seconds allowed for each round.',
      type: ApplicationCommandOptionType.Integer,
      required: false,
      min_value: 15,
      max_value: 90
    }
  ]);
});

test('elder command is guild-install only and selects a Discord user', () => {
  const elder = commands.find((command) => command.name === 'elder');

  assert.ok(elder);
  assert.match(elder.description, /elder vote commands/i);
  assert.deepEqual(elder.integration_types, [0]);
  assert.deepEqual(elder.contexts, [0]);
  assert.deepEqual(elder.options, [
    {
      name: 'user',
      description: 'Discord user to make an elder.',
      type: ApplicationCommandOptionType.User,
      required: true
    }
  ]);
});

test('elder vote commands are guild-install only and select Discord users', () => {
  for (const name of ['mute', 'bench']) {
    const command = commands.find((candidate) => candidate.name === name);

    assert.ok(command);
    assert.deepEqual(command.integration_types, [0]);
    assert.deepEqual(command.contexts, [0]);
    assert.deepEqual(command.options, [
      {
        name: 'user',
        description: 'Discord user to vote against.',
        type: ApplicationCommandOptionType.User,
        required: true
      }
    ]);
  }
});
