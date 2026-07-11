import { ApplicationCommandOptionType } from 'discord.js';
import { PICTIONARY_DIFFICULTY_CHOICES } from './pictionary-game.mjs';

export const commands = [
  {
    name: 'lana',
    description: 'Draws a glowing heart image and love note for Lana.',
    integration_types: [0],
    contexts: [0]
  },
  {
    name: 'loveu',
    description: 'Writes a random love poem and draws a fresh heart for someone.',
    integration_types: [0],
    contexts: [0],
    options: [
      {
        name: 'user',
        description: 'Discord user to receive the poem.',
        type: ApplicationCommandOptionType.User,
        required: true
      }
    ]
  },
  {
    name: 'player',
    description: 'Shows a focused Clash of Clans player card by tag.',
    integration_types: [0],
    contexts: [0],
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
  },
  {
    name: 'legends',
    description: 'Tracks Legend League trophy changes for a Clash player.',
    integration_types: [0],
    contexts: [0],
    options: [
      {
        name: 'player',
        description: 'Player tag to track, with or without #.',
        type: ApplicationCommandOptionType.String,
        required: true,
        min_length: 3,
        max_length: 20
      }
    ]
  },
  {
    name: 'config',
    description: 'Sets up mavebot for this Discord server.',
    integration_types: [0],
    contexts: [0],
    options: [
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
    ]
  },
  {
    name: 'link',
    description: 'Links Discord users to Clash of Clans player tags.',
    integration_types: [0],
    contexts: [0],
    options: [
      {
        name: 'player',
        description: 'Link your Discord account to a Clash player tag.',
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
      },
      {
        name: 'status',
        description: 'Show linked Clash players for yourself or another Discord user.',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'user',
            description: 'Discord user to check. Defaults to you.',
            type: ApplicationCommandOptionType.User,
            required: false
          }
        ]
      },
      {
        name: 'remove',
        description: 'Remove one of your linked Clash player tags.',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'tag',
            description: 'Player tag to unlink, with or without #.',
            type: ApplicationCommandOptionType.String,
            required: true,
            min_length: 3,
            max_length: 20
          }
        ]
      }
    ]
  },
  {
    name: 'track',
    description: 'Starts Clash history tracking for a player or clan.',
    integration_types: [0],
    contexts: [0],
    options: [
      {
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
      },
      {
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
      },
      {
        name: 'status',
        description: 'Show how many Clash players, clans, and wars are tracked.',
        type: ApplicationCommandOptionType.Subcommand
      }
    ]
  },
  {
    name: 'history',
    description: 'Shows collected Clash history for a tracked player.',
    integration_types: [0],
    contexts: [0],
    options: [
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
    ]
  },
  {
    name: 'roster',
    description: 'Builds Clash roster planning views from tracked history.',
    integration_types: [0],
    contexts: [0],
    options: [
      {
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
      },
      {
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
      },
      {
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
      }
    ]
  },
  {
    name: 'warstats',
    description: 'Summarizes collected war and CWL stats for a tracked Clash clan.',
    integration_types: [0],
    contexts: [0],
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
  },
  {
    name: 'activity',
    description: 'Shows clan movement, donation deltas, and data gaps from tracking.',
    integration_types: [0],
    contexts: [0],
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
  },
  {
    name: 'summary',
    description: 'Shows a compact Clash operations summary for a tracked clan.',
    integration_types: [0],
    contexts: [0],
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
  },
  {
    name: 'pictionary',
    description: 'Starts a Clash of Clans picture guessing game.',
    integration_types: [0],
    contexts: [0],
    options: [
      {
        name: 'difficulty',
        description: 'How obscure and hidden the picture should be.',
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: PICTIONARY_DIFFICULTY_CHOICES
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
    ]
  },
  {
    name: 'elder',
    description: 'Allows a server member to use elder vote commands.',
    integration_types: [0],
    contexts: [0],
    options: [
      {
        name: 'user',
        description: 'Discord user to make an elder.',
        type: ApplicationCommandOptionType.User,
        required: true
      }
    ]
  },
  {
    name: 'mute',
    description: 'Elder vote to mute a server member for 5 minutes.',
    integration_types: [0],
    contexts: [0],
    options: [
      {
        name: 'user',
        description: 'Discord user to vote against.',
        type: ApplicationCommandOptionType.User,
        required: true
      }
    ]
  },
  {
    name: 'bench',
    description: 'Elder vote to give a server member the ugly yellow benched role.',
    integration_types: [0],
    contexts: [0],
    options: [
      {
        name: 'user',
        description: 'Discord user to vote against.',
        type: ApplicationCommandOptionType.User,
        required: true
      }
    ]
  }
];
