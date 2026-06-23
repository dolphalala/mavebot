import 'dotenv/config';
import express from 'express';
import { Client, EmbedBuilder, Events, GatewayIntentBits } from 'discord.js';

const token = process.env.DISCORD_TOKEN;
const healthHost = process.env.HEALTH_HOST || '0.0.0.0';
const healthPort = Number.parseInt(process.env.HEALTH_PORT || '4188', 10);

if (!token) {
  throw new Error('DISCORD_TOKEN is required.');
}

let ready = false;
let readyUser = null;

const loveLetters = [
  {
    title: 'For Lana, From Allen',
    body:
      'Lana, if love had a map, Allen would trace it from Korea to Croatia and still say the best place on it is wherever you are.',
    note:
      'A Korean heart and a Croatian heart, somehow speaking the same language.'
  },
  {
    title: 'A Small Forever',
    body:
      'Allen loves Lana in the quiet ways that last: in every check-in, every smile, every ordinary day that feels better because she is in it.',
    note:
      'Some love stories do not need noise. They just keep choosing each other.'
  },
  {
    title: 'Across Every Distance',
    body:
      'From Korean roots to Croatian grace, Lana and Allen are proof that the right person can make the world feel smaller and warmer at the same time.',
    note:
      'Different places, same home.'
  },
  {
    title: 'Dear Lana',
    body:
      'Allen would like the record to show that Lana is lovely, brilliant, and dangerously easy to adore. This bot has reviewed the evidence and agrees.',
    note:
      'Case closed.'
  },
  {
    title: 'The Best Translation',
    body:
      'Some things do not need perfect translation: the way Allen looks at Lana, the way she makes a room softer, the way love becomes obvious.',
    note:
      'Korean, Croatian, and completely understood.'
  }
];

function randomLoveLetter() {
  return loveLetters[Math.floor(Math.random() * loveLetters.length)];
}

const app = express();
app.get('/healthz', (_req, res) => {
  res.status(ready ? 200 : 503).json({
    ok: ready,
    botUser: readyUser,
    uptimeSec: Math.floor(process.uptime())
  });
});

const healthServer = app.listen(healthPort, healthHost, () => {
  console.log(`Health endpoint listening on ${healthHost}:${healthPort}.`);
});

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (readyClient) => {
  ready = true;
  readyUser = readyClient.user.tag;
  console.log(`Logged in as ${readyUser}.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (interaction.commandName === 'ping') {
    await interaction.reply(
      `Pong. WebSocket latency: ${Math.round(client.ws.ping)}ms.`
    );
    return;
  }

  if (interaction.commandName === 'iloveyou') {
    const letter = randomLoveLetter();
    const embed = new EmbedBuilder()
      .setColor(0xe2557b)
      .setTitle(letter.title)
      .setDescription(letter.body)
      .addFields({
        name: 'Little note',
        value: letter.note
      })
      .setFooter({ text: 'For Lana and Allen' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
});

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down.`);
  ready = false;
  client.destroy();
  healthServer.close(() => process.exit(0));
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await client.login(token);
