import { ApplicationCommandOptionType } from 'discord.js';

export const commands = [
  {
    name: 'iloveyou',
    description: 'Sends a random love letter for Lana and Allen.',
    integration_types: [0],
    contexts: [0]
  },
  {
    name: 'player',
    description: 'Looks up a Clash of Clans player by tag.',
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
