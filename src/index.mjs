import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits
} from 'discord.js';
import { fetchCocWikiImageMap } from './coc-assets.mjs';
import {
  CocApiError,
  buildPlayerProfilePages,
  fetchPlayer,
  normalizePlayerTag
} from './coc.mjs';
import { createLanaHeartPng, randomLoveLetter } from './lana-art.mjs';
import { playerArmyAssetNames, renderPlayerArmyCard } from './player-card.mjs';

const token = process.env.DISCORD_TOKEN;
const healthHost = process.env.HEALTH_HOST || '0.0.0.0';
const healthPort = Number.parseInt(process.env.HEALTH_PORT || '4188', 10);

if (!token) {
  throw new Error('DISCORD_TOKEN is required.');
}

let ready = false;
let readyUser = null;

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
const playerViews = new Map();
const playerViewTtlMs = 15 * 60 * 1000;

function createViewId() {
  return crypto.randomBytes(8).toString('hex');
}

function buildEmbed(page, footer) {
  const embed = new EmbedBuilder()
    .setColor(0x2f80ed)
    .setTitle(page.title)
    .setDescription(page.description)
    .addFields(page.fields)
    .setFooter({ text: footer || 'Clash of Clans player lookup' })
    .setTimestamp();

  if (page.thumbnailUrl) {
    embed.setThumbnail(page.thumbnailUrl);
  }
  if (page.imageUrl) {
    embed.setImage(page.imageUrl);
  }
  return embed;
}

function pageComponents(view, activePageId, { disabled = false } = {}) {
  const pageRow = new ActionRowBuilder().addComponents(
    view.pages.map((page) =>
      new ButtonBuilder()
        .setCustomId(`player:${view.id}:${page.id}`)
        .setLabel(page.label)
        .setStyle(page.id === activePageId ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(disabled || page.id === activePageId)
    )
  );

  const rows = [pageRow];
  if (view.profileUrl) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Open in Clash')
          .setStyle(ButtonStyle.Link)
          .setURL(view.profileUrl)
      )
    );
  }
  return rows;
}

function renderPlayerView(view, pageId, { disabled = false } = {}) {
  const page = view.pages.find((candidate) => candidate.id === pageId) || view.pages[0];
  const files = [];
  if (page.id === 'army' && view.armyImage) {
    files.push(
      new AttachmentBuilder(view.armyImage, {
        name: view.armyImageName
      })
    );
  }

  return {
    embeds: [buildEmbed(page, view.footer)],
    components: pageComponents(view, page.id, { disabled }),
    attachments: [],
    files
  };
}

function storePlayerView(view, message) {
  view.message = message;
  playerViews.set(view.id, view);

  const timer = setTimeout(() => {
    playerViews.delete(view.id);
    view.message
      ?.edit(renderPlayerView(view, view.activePageId, { disabled: true }))
      .catch(() => {});
  }, playerViewTtlMs);
  timer.unref?.();
}

async function handlePlayerButton(interaction) {
  const [, viewId, pageId] = interaction.customId.split(':');
  const view = playerViews.get(viewId);
  if (!view) {
    await interaction.reply({
      content: 'That player menu expired. Run /player again for a fresh one.',
      ephemeral: true
    });
    return;
  }

  if (interaction.user.id !== view.ownerId) {
    await interaction.reply({
      content: 'This player menu belongs to the person who ran /player.',
      ephemeral: true
    });
    return;
  }

  view.activePageId = pageId;
  await interaction.update(renderPlayerView(view, pageId));
}

client.once(Events.ClientReady, (readyClient) => {
  ready = true;
  readyUser = readyClient.user.tag;
  console.log(`Logged in as ${readyUser}.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton() && interaction.customId.startsWith('player:')) {
    await handlePlayerButton(interaction);
    return;
  }

  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (interaction.commandName === 'lana') {
    const letter = randomLoveLetter();
    const heartPng = createLanaHeartPng({
      variant: Math.floor(Math.random() * 1000)
    });
    const attachment = new AttachmentBuilder(heartPng, {
      name: 'lana-heart.png'
    });
    const embed = new EmbedBuilder()
      .setColor(0xe2557b)
      .setTitle(letter.title)
      .setDescription([
        'I drew Lana a heart.',
        '',
        letter.body,
        '',
        ':heart: :sparkling_heart: :heart:'
      ].join('\n'))
      .addFields({
        name: 'For Lana',
        value: letter.note
      })
      .setImage('attachment://lana-heart.png')
      .setFooter({ text: 'From Allen, always' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], files: [attachment] });
    return;
  }

  if (interaction.commandName === 'player') {
    const tag = interaction.options.getString('tag', true);
    await interaction.deferReply();

    try {
      const player = await fetchPlayer(normalizePlayerTag(tag));
      const assetUrls = await fetchCocWikiImageMap(playerArmyAssetNames(player), {
        limit: 80
      });
      let armyImage = null;
      const safeTag = normalizePlayerTag(player.tag || tag).replace(/^#/, '').toLowerCase();
      const armyImageName = `mavebot-player-army-${safeTag}.png`;
      try {
        armyImage = await renderPlayerArmyCard(player, { assetUrls });
      } catch (error) {
        console.error('Clash player army card render failed:', error);
      }

      const profile = buildPlayerProfilePages(player, {
        assetUrls,
        armyImageAttachment: armyImage ? armyImageName : null
      });
      const view = {
        id: createViewId(),
        ownerId: interaction.user.id,
        pages: profile.pages,
        profileUrl: profile.profileUrl,
        footer: profile.footer,
        armyImage,
        armyImageName,
        activePageId: 'overview'
      };

      const message = await interaction.editReply(renderPlayerView(view, view.activePageId));
      storePlayerView(view, message);
    } catch (error) {
      const message =
        error instanceof CocApiError
          ? error.message
          : 'I could not look up that player right now.';
      await interaction.editReply(message);
      console.error('Clash player lookup failed:', error);
    }
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
