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
  }
];
