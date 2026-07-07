import { ApplicationCommandOptionType } from 'discord.js';

export const commands = [
  {
    name: 'lana',
    description: 'Draws a glowing heart image and love note for Lana.',
    integration_types: [0],
    contexts: [0]
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
