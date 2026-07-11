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
