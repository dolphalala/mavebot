import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { commands } from '../src/commands.mjs';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const clearGuildCommandsId = process.env.DISCORD_CLEAR_GUILD_COMMANDS_ID;

if (!token) {
  throw new Error('DISCORD_TOKEN is required.');
}

if (!clientId) {
  throw new Error('DISCORD_CLIENT_ID is required.');
}

const rest = new REST({ version: '10' }).setToken(token);
const route = guildId
  ? Routes.applicationGuildCommands(clientId, guildId)
  : Routes.applicationCommands(clientId);

console.log(
  guildId
    ? `Registering ${commands.length} guild command(s) for ${guildId}.`
    : `Registering ${commands.length} global command(s).`
);

await rest.put(route, { body: commands });

if (!guildId && clearGuildCommandsId) {
  console.log(
    `Clearing stale guild command(s) for ${clearGuildCommandsId} because global commands are active.`
  );
  await rest.put(Routes.applicationGuildCommands(clientId, clearGuildCommandsId), {
    body: []
  });
}

console.log('Discord slash commands registered.');
