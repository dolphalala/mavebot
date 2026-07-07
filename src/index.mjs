import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import {
  ActionRowBuilder,
  ApplicationFlagsBitField,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits
} from 'discord.js';
import { fetchCocWikiImageMap } from './coc-assets.mjs';
import {
  CocApiError,
  buildPlayerProfilePages,
  fetchPlayer,
  normalizePlayerTag
} from './coc.mjs';
import { createLanaHeartPng, randomLoveLetter } from './lana-art.mjs';
import {
  DEFAULT_LEGENDS_INTERVAL_MS,
  buildLegendsPages,
  ensureLegendsTracked,
  legendsStorePath,
  startLegendsTracker
} from './legends-store.mjs';
import {
  BENCHED_ROLE_COLOR,
  BENCHED_ROLE_NAME,
  MUTE_DURATION_MS,
  VOTE_THRESHOLD,
  buildModerationRecordText,
  grantElder,
  isElder,
  moderationStorePath,
  recordModerationOutcome,
  submitModerationVote
} from './moderation-store.mjs';
import { playerArmyAssetNames, renderPlayerArmyCard } from './player-card.mjs';
import {
  DEFAULT_DISCORD_CODEX_JOB_DIR,
  buildDiscordCodexWorkerJob,
  discordCodexSetupBlocker,
  enqueueDiscordCodexWorkerJob,
  randomWorkingMessage,
  shouldHandleDiscordCodexMessage
} from './discord-codex-control.mjs';

const token = process.env.DISCORD_TOKEN;
const healthHost = process.env.HEALTH_HOST || '0.0.0.0';
const healthPort = Number.parseInt(process.env.HEALTH_PORT || '4188', 10);
const discordCodexChannelId = process.env.DISCORD_CODEX_CHANNEL_ID || '';
const discordCodexWorkerJobDir =
  process.env.DISCORD_CODEX_WORKER_JOB_DIR ||
  process.env.SLACK_CODEX_WORKER_JOB_DIR ||
  process.env.SLACK_WORKER_JOB_DIR ||
  DEFAULT_DISCORD_CODEX_JOB_DIR;
const discordMessageContentIntentPreference =
  process.env.DISCORD_MESSAGE_CONTENT_INTENT || 'auto';
const configuredLegendsIntervalMs = Number.parseInt(
  process.env.LEGENDS_TRACK_INTERVAL_MS || '',
  10
);
const legendsIntervalMs =
  Number.isFinite(configuredLegendsIntervalMs) && configuredLegendsIntervalMs > 0
    ? configuredLegendsIntervalMs
    : DEFAULT_LEGENDS_INTERVAL_MS;

if (!token) {
  throw new Error('DISCORD_TOKEN is required.');
}

let ready = false;
let readyUser = null;
let discordCodexMessageCount = 0;
let discordCodexLastMessageAt = null;
let discordCodexIntentWarningSent = false;

async function detectMessageContentIntentAvailable() {
  if (!discordCodexChannelId || discordMessageContentIntentPreference === '0') {
    return false;
  }
  if (discordMessageContentIntentPreference === '1') {
    return true;
  }

  try {
    const response = await fetch('https://discord.com/api/v10/applications/@me', {
      headers: { Authorization: `Bot ${token}` }
    });
    const application = await response.json();
    const flags = Number(application.flags || 0);
    return Boolean(flags & ApplicationFlagsBitField.Flags.GatewayMessageContent);
  } catch (error) {
    console.warn('Could not detect Discord Message Content Intent:', error);
    return false;
  }
}

const discordMessageContentIntentAvailable =
  await detectMessageContentIntentAvailable();
const discordMessageContentIntentRequested =
  Boolean(discordCodexChannelId && discordMessageContentIntentAvailable);
const discordCodexSetupMessage = discordCodexSetupBlocker({
  channelIdConfigured: Boolean(discordCodexChannelId),
  messageContentIntentRequested: discordMessageContentIntentRequested
});

const app = express();
app.get('/healthz', (_req, res) => {
  res.status(ready ? 200 : 503).json({
    ok: ready,
    botUser: readyUser,
    discordCodexChannelIdConfigured: Boolean(discordCodexChannelId),
    discordMessageContentIntentAvailable,
    discordMessageContentIntentRequested,
    discordCodexSetupReady: Boolean(discordCodexChannelId && discordMessageContentIntentRequested),
    discordCodexSetupMessage,
    discordCodexWorkerJobDir,
    discordCodexMessageCount,
    discordCodexLastMessageAt,
    uptimeSec: Math.floor(process.uptime())
  });
});

const healthServer = app.listen(healthPort, healthHost, () => {
  console.log(`Health endpoint listening on ${healthHost}:${healthPort}.`);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    ...(discordMessageContentIntentRequested ? [GatewayIntentBits.MessageContent] : [])
  ]
});
const playerViews = new Map();
const legendsViews = new Map();
const playerViewTtlMs = 15 * 60 * 1000;
let stopLegendsTracker = null;

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

function userMention(userId) {
  return `<@${userId}>`;
}

function moderationReason(action, targetUser, voterUser) {
  return `mavebot /${action} vote passed for ${targetUser.tag || targetUser.id}; final vote by ${voterUser.tag || voterUser.id}`;
}

function buildModerationEmbed({ title, description, targetUser, record, activeVote = null, color = 0xc9b30a }) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .addFields({
      name: `${targetUser.username || targetUser.tag || targetUser.id}'s record`,
      value: buildModerationRecordText(record, activeVote)
    })
    .setFooter({ text: `${VOTE_THRESHOLD} unique elder votes are needed to pass.` })
    .setTimestamp();
}

async function fetchGuildMember(interaction, user) {
  if (!interaction.guild) {
    throw new Error('This command only works in a Discord server.');
  }
  return interaction.guild.members.fetch(user.id);
}

async function fetchBotMember(guild) {
  return guild.members.me || guild.members.fetch(client.user.id);
}

function memberHasAnyPermission(interaction, permissions) {
  return permissions.some((permission) => interaction.memberPermissions?.has(permission));
}

async function canManageElders(interaction) {
  if (!interaction.guildId) {
    return false;
  }
  if (
    memberHasAnyPermission(interaction, [
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.ManageGuild
    ])
  ) {
    return true;
  }
  return isElder(interaction.guildId, interaction.user.id, {
    storePath: moderationStorePath()
  });
}

async function canUseElderVote(interaction) {
  if (!interaction.guildId) {
    return false;
  }
  if (
    memberHasAnyPermission(interaction, [
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.ManageGuild
    ])
  ) {
    return true;
  }
  return isElder(interaction.guildId, interaction.user.id, {
    storePath: moderationStorePath()
  });
}

async function ensureCanTimeout(interaction, targetMember) {
  const botMember = await fetchBotMember(interaction.guild);
  if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    throw new Error('mavebot needs the Moderate Members permission before /mute votes can apply.');
  }
  if (targetMember.id === botMember.id) {
    throw new Error('mavebot cannot vote against itself.');
  }
  if (!targetMember.moderatable) {
    throw new Error('mavebot cannot mute that member because their role is too high or protected.');
  }
}

async function ensureBenchedRole(guild) {
  const botMember = await fetchBotMember(guild);
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('mavebot needs the Manage Roles permission before /bench votes can apply.');
  }

  let role = guild.roles.cache.find(
    (candidate) => candidate.name.toLowerCase() === BENCHED_ROLE_NAME
  );
  if (!role) {
    role = await guild.roles.create({
      name: BENCHED_ROLE_NAME,
      color: BENCHED_ROLE_COLOR,
      reason: 'mavebot /bench vote role'
    });
  }

  if (!role.editable) {
    throw new Error('mavebot cannot edit the benched role because it is above mavebot in the role list.');
  }

  if (role.color !== BENCHED_ROLE_COLOR || role.name !== BENCHED_ROLE_NAME) {
    role = await role.edit({
      name: BENCHED_ROLE_NAME,
      color: BENCHED_ROLE_COLOR,
      reason: 'mavebot /bench role color'
    });
  }

  const desiredPosition = Math.max(1, botMember.roles.highest.position - 1);
  if (role.position < desiredPosition) {
    try {
      role = await role.setPosition(desiredPosition, 'mavebot /bench role color priority');
    } catch (error) {
      console.warn('Could not raise benched role position:', error);
    }
  }

  if (role.position >= botMember.roles.highest.position) {
    throw new Error('The benched role is above mavebot, so mavebot cannot assign it.');
  }

  return role;
}

async function ensureCanBench(interaction, targetMember) {
  const botMember = await fetchBotMember(interaction.guild);
  if (targetMember.id === botMember.id) {
    throw new Error('mavebot cannot vote against itself.');
  }
  if (!targetMember.manageable) {
    throw new Error('mavebot cannot bench that member because their role is too high or protected.');
  }
  return ensureBenchedRole(interaction.guild);
}

async function handleElderCommand(interaction) {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: '/elder only works inside a Discord server.',
      ephemeral: true
    });
    return;
  }

  if (!(await canManageElders(interaction))) {
    await interaction.reply({
      content: 'Only server admins or existing elders can grant elder commands.',
      ephemeral: true
    });
    return;
  }

  const targetUser = interaction.options.getUser('user', true);
  if (targetUser.bot) {
    await interaction.reply({
      content: 'Bots do not need elder commands.',
      ephemeral: true
    });
    return;
  }

  const result = await grantElder(interaction.guildId, targetUser, interaction.user, {
    storePath: moderationStorePath()
  });
  const description = result.alreadyElder
    ? `${userMention(targetUser.id)} is already an elder. They can use /mute and /bench.`
    : `${userMention(targetUser.id)} is now an elder. They can use /mute and /bench.`;
  const embed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle('Elder granted')
    .setDescription(description)
    .setFooter({ text: 'Elder commands use 3 unique votes before applying.' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleModerationVoteCommand(interaction, action) {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: `/${action} only works inside a Discord server.`,
      ephemeral: true
    });
    return;
  }

  if (!(await canUseElderVote(interaction))) {
    await interaction.reply({
      content: `Only elders can use /${action}. Ask a server admin or elder to run /elder for you.`,
      ephemeral: true
    });
    return;
  }

  const targetUser = interaction.options.getUser('user', true);
  if (targetUser.id === interaction.user.id) {
    await interaction.reply({
      content: `You cannot /${action} yourself.`,
      ephemeral: true
    });
    return;
  }
  if (targetUser.bot) {
    await interaction.reply({
      content: `/${action} votes are only for server members, not bots.`,
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply();

  try {
    const targetMember = await fetchGuildMember(interaction, targetUser);
    let benchedRole = null;
    if (action === 'mute') {
      await ensureCanTimeout(interaction, targetMember);
    } else {
      benchedRole = await ensureCanBench(interaction, targetMember);
    }

    const vote = await submitModerationVote(action, interaction.guildId, targetUser, interaction.user, {
      storePath: moderationStorePath()
    });
    const activeVote = vote.completed ? null : vote.activeVote;

    if (!vote.completed) {
      const description = vote.duplicate
        ? `${userMention(interaction.user.id)} already voted to ${action} ${userMention(targetUser.id)}.`
        : `${userMention(interaction.user.id)} voted to ${action} ${userMention(targetUser.id)}.`;
      await interaction.editReply({
        embeds: [
          buildModerationEmbed({
            title: `/${action} vote: ${vote.voteCount}/${vote.threshold}`,
            description,
            targetUser,
            record: vote.record,
            activeVote
          })
        ]
      });
      return;
    }

    const reason = moderationReason(action, targetUser, interaction.user);
    if (action === 'mute') {
      let result;
      try {
        await targetMember.timeout(MUTE_DURATION_MS, reason);
        result = await recordModerationOutcome('mute', interaction.guildId, targetUser, 'success', {
          storePath: moderationStorePath(),
          reason,
          actorUser: interaction.user
        });
      } catch (applyError) {
        await recordModerationOutcome('mute', interaction.guildId, targetUser, 'failed', {
          storePath: moderationStorePath(),
          reason: applyError?.message || reason,
          actorUser: interaction.user
        });
        throw applyError;
      }
      await interaction.editReply({
        embeds: [
          buildModerationEmbed({
            title: '/mute vote passed',
            description: `${userMention(targetUser.id)} is muted for 5 minutes after ${vote.threshold}/${vote.threshold} elder votes.`,
            targetUser,
            record: result.record,
            color: 0xe06c75
          })
        ]
      });
      return;
    }

    let result;
    try {
      await targetMember.roles.add(benchedRole, reason);
      result = await recordModerationOutcome('bench', interaction.guildId, targetUser, 'success', {
        storePath: moderationStorePath(),
        reason,
        actorUser: interaction.user
      });
    } catch (applyError) {
      await recordModerationOutcome('bench', interaction.guildId, targetUser, 'failed', {
        storePath: moderationStorePath(),
        reason: applyError?.message || reason,
        actorUser: interaction.user
      });
      throw applyError;
    }
    await interaction.editReply({
      embeds: [
        buildModerationEmbed({
          title: '/bench vote passed',
          description: `${userMention(targetUser.id)} now has the ${BENCHED_ROLE_NAME} role after ${vote.threshold}/${vote.threshold} elder votes.`,
          targetUser,
          record: result.record,
          color: BENCHED_ROLE_COLOR
        })
      ]
    });
  } catch (error) {
    console.error(`/${action} command failed:`, error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(String(error?.message || `I could not run /${action} right now.`));
    } else {
      await interaction.reply({
        content: String(error?.message || `I could not run /${action} right now.`),
        ephemeral: true
      });
    }
  }
}

function pageComponents(view, activePageId, { disabled = false, customIdPrefix = 'player' } = {}) {
  const pageRow = new ActionRowBuilder().addComponents(
    view.pages.map((page) =>
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}:${view.id}:${page.id}`)
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
    components: pageComponents(view, page.id, { disabled, customIdPrefix: 'player' }),
    attachments: [],
    files
  };
}

function renderLegendsView(view, pageId, { disabled = false } = {}) {
  const page = view.pages.find((candidate) => candidate.id === pageId) || view.pages[0];
  return {
    embeds: [buildEmbed(page, view.footer)],
    components: pageComponents(view, page.id, { disabled, customIdPrefix: 'legends' })
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

function storeLegendsView(view, message) {
  view.message = message;
  legendsViews.set(view.id, view);

  const timer = setTimeout(() => {
    legendsViews.delete(view.id);
    view.message
      ?.edit(renderLegendsView(view, view.activePageId, { disabled: true }))
      .catch(() => {});
  }, playerViewTtlMs);
  timer.unref?.();
}

async function handleLegendsButton(interaction) {
  const [, viewId, pageId] = interaction.customId.split(':');
  const view = legendsViews.get(viewId);
  if (!view) {
    await interaction.reply({
      content: 'That legends menu expired. Run /legends again for a fresh one.',
      ephemeral: true
    });
    return;
  }

  if (interaction.user.id !== view.ownerId) {
    await interaction.reply({
      content: 'This legends menu belongs to the person who ran /legends.',
      ephemeral: true
    });
    return;
  }

  view.activePageId = pageId;
  await interaction.update(renderLegendsView(view, pageId));
}

client.once(Events.ClientReady, (readyClient) => {
  ready = true;
  readyUser = readyClient.user.tag;
  console.log(`Logged in as ${readyUser}.`);
  stopLegendsTracker = startLegendsTracker({
    storePath: legendsStorePath(),
    intervalMs: legendsIntervalMs
  });
});

client.on(Events.MessageCreate, async (message) => {
  const isConfiguredCodexChannel =
    Boolean(discordCodexChannelId) &&
    message?.channelId === discordCodexChannelId &&
    !message?.author?.bot &&
    !message?.system &&
    !message?.webhookId;
  if (isConfiguredCodexChannel && !discordMessageContentIntentRequested) {
    if (!discordCodexIntentWarningSent) {
      discordCodexIntentWarningSent = true;
      await message.channel.send({
        content: discordCodexSetupMessage || 'I need Message Content Intent turned on before I can read messages here.',
        allowedMentions: { parse: [] }
      }).catch(() => {});
    }
    return;
  }

  if (!shouldHandleDiscordCodexMessage(message, discordCodexChannelId)) {
    return;
  }

  try {
    const job = buildDiscordCodexWorkerJob(message);
    const result = await enqueueDiscordCodexWorkerJob(discordCodexWorkerJobDir, job);
    if (result.queued) {
      discordCodexMessageCount += 1;
      discordCodexLastMessageAt = new Date().toISOString();
      await message.channel.send({
        content: randomWorkingMessage(),
        allowedMentions: { parse: [] }
      });
    }
  } catch (error) {
    console.error('Discord Codex channel enqueue failed:', error);
    await message.channel.send({
      content: 'I could not start that yet. I saved the error in the server logs.',
      allowedMentions: { parse: [] }
    }).catch(() => {});
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton() && interaction.customId.startsWith('player:')) {
    await handlePlayerButton(interaction);
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('legends:')) {
    await handleLegendsButton(interaction);
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
    return;
  }

  if (interaction.commandName === 'legends') {
    const tag = interaction.options.getString('player', true);
    await interaction.deferReply();

    try {
      const result = await ensureLegendsTracked(tag, {
        storePath: legendsStorePath(),
        intervalMs: legendsIntervalMs
      });
      const trackedCount = Object.keys(result.store.players || {}).length;
      const profile = buildLegendsPages(result.record, {
        trackedCount,
        intervalMs: legendsIntervalMs
      });
      const view = {
        id: createViewId(),
        ownerId: interaction.user.id,
        pages: profile.pages,
        profileUrl: profile.profileUrl,
        footer: profile.footer,
        activePageId: 'timeline'
      };

      const message = await interaction.editReply(renderLegendsView(view, view.activePageId));
      storeLegendsView(view, message);
    } catch (error) {
      const message =
        error instanceof CocApiError
          ? error.message
          : 'I could not start legends tracking for that player right now.';
      await interaction.editReply(message);
      console.error('Legend tracker command failed:', error);
    }
    return;
  }

  if (interaction.commandName === 'elder') {
    await handleElderCommand(interaction);
    return;
  }

  if (interaction.commandName === 'mute') {
    await handleModerationVoteCommand(interaction, 'mute');
    return;
  }

  if (interaction.commandName === 'bench') {
    await handleModerationVoteCommand(interaction, 'bench');
  }
});

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down.`);
  ready = false;
  stopLegendsTracker?.();
  client.destroy();
  healthServer.close(() => process.exit(0));
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await client.login(token);
