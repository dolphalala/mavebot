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
  GatewayIntentBits,
  PermissionFlagsBits
} from 'discord.js';
import { fetchCocWikiImageMap } from './coc-assets.mjs';
import {
  CocApiError,
  buildPlayerProfilePages,
  fetchPlayer,
  normalizeClanTag,
  normalizePlayerTag
} from './coc.mjs';
import { createLanaHeartPng, randomLoveLetter, randomLoveuPoem } from './lana-art.mjs';
import {
  DEFAULT_LEGENDS_INTERVAL_MS,
  buildLegendsPages,
  ensureLegendsTracked,
  readLegendsStore,
  legendsStorePath,
  startLegendsTracker
} from './legends-store.mjs';
import {
  DEFAULT_CLASH_HISTORY_CLAN_INTERVAL_MS,
  DEFAULT_CLASH_HISTORY_INTERVAL_MS,
  DEFAULT_CLASH_HISTORY_PLAYER_INTERVAL_MS,
  DEFAULT_CLASH_HISTORY_WAR_INTERVAL_MS,
  buildClashActivityText,
  buildClashGuildConfigText,
  buildClashLinkStatusText,
  buildClashPlayerHistoryText,
  buildClashRosterExportText,
  buildClashRosterPlanText,
  buildClashRosterStatusText,
  buildClashSummaryText,
  buildClashWarStatsText,
  clashHistoryStorePath,
  linkClashPlayerToDiscord,
  readClashHistoryStore,
  recordClashPlayerSnapshot,
  removeClashPlayerLink,
  setClashGuildDefaultClan,
  signupClashRoster,
  startClashHistoryCollector,
  trackClashHistoryClan,
  trackClashHistoryPlayer
} from './clash-history-store.mjs';
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
import {
  DEFAULT_PICTIONARY_ROUND_SECONDS,
  DEFAULT_PICTIONARY_ROUNDS,
  buildPictionaryLeaderboard,
  formatPictionaryLeaderboard,
  isCorrectPictionaryGuess,
  normalizePictionaryDifficulty,
  normalizePictionaryRoundSeconds,
  normalizePictionaryRounds,
  pictionaryDifficultySettings,
  pictionaryStorePath,
  pictionaryTopicAssetNames,
  readPictionaryStore,
  recordPictionaryGame,
  renderPictionaryRoundImage,
  selectPictionaryTopic
} from './pictionary-game.mjs';
import { playerArmyAssetNames, renderPlayerArmyCard } from './player-card.mjs';

const token = process.env.DISCORD_TOKEN;
const healthHost = process.env.HEALTH_HOST || '0.0.0.0';
const healthPort = Number.parseInt(process.env.HEALTH_PORT || '4188', 10);
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
const clashHistoryIntervalMs = Number.parseInt(
  process.env.CLASH_HISTORY_INTERVAL_MS || String(DEFAULT_CLASH_HISTORY_INTERVAL_MS),
  10
);
const clashHistoryPlayerIntervalMs = Number.parseInt(
  process.env.CLASH_HISTORY_PLAYER_INTERVAL_MS || String(DEFAULT_CLASH_HISTORY_PLAYER_INTERVAL_MS),
  10
);
const clashHistoryClanIntervalMs = Number.parseInt(
  process.env.CLASH_HISTORY_CLAN_INTERVAL_MS || String(DEFAULT_CLASH_HISTORY_CLAN_INTERVAL_MS),
  10
);
const clashHistoryWarIntervalMs = Number.parseInt(
  process.env.CLASH_HISTORY_WAR_INTERVAL_MS || String(DEFAULT_CLASH_HISTORY_WAR_INTERVAL_MS),
  10
);

if (!token) {
  throw new Error('DISCORD_TOKEN is required.');
}

const DISCORD_GATEWAY_MESSAGE_CONTENT_FLAGS = {
  full: 262144,
  limited: 524288
};

function hasDiscordMessageContentIntentFlag(flags) {
  const value = Number(flags || 0);
  return Boolean(
    value & DISCORD_GATEWAY_MESSAGE_CONTENT_FLAGS.full ||
      value & DISCORD_GATEWAY_MESSAGE_CONTENT_FLAGS.limited
  );
}

let ready = false;
let readyUser = null;

async function detectMessageContentIntentAvailable() {
  if (discordMessageContentIntentPreference === '0') {
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
    return hasDiscordMessageContentIntentFlag(flags);
  } catch (error) {
    console.warn('Could not detect Discord Message Content Intent:', error);
    return false;
  }
}

const discordMessageContentIntentAvailable =
  await detectMessageContentIntentAvailable();
const discordMessageContentIntentRequested =
  Boolean(discordMessageContentIntentAvailable);
const activePictionaryGames = new Map();

const app = express();
app.get('/healthz', (_req, res) => {
  res.status(ready ? 200 : 503).json({
    ok: ready,
    botUser: readyUser,
    discordMessageContentIntentAvailable,
    discordMessageContentIntentRequested,
    pictionaryStorePath: pictionaryStorePath(),
    pictionaryActiveGames: activePictionaryGames.size,
    clashHistoryStorePath: clashHistoryStorePath(),
    clashHistoryIntervalMs,
    clashHistoryPlayerIntervalMs,
    clashHistoryClanIntervalMs,
    clashHistoryWarIntervalMs,
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
let stopClashHistoryCollector = null;

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

async function hydratePlayerArmyCard(view, player, tag) {
  try {
    const assetUrls = await fetchCocWikiImageMap(playerArmyAssetNames(player), {
      limit: 80
    });
    const safeTag = normalizePlayerTag(player.tag || tag).replace(/^#/, '').toLowerCase();
    const armyImageName = `mavebot-player-army-${safeTag}.png`;
    let armyImage = null;
    try {
      armyImage = await renderPlayerArmyCard(player, { assetUrls });
    } catch (error) {
      console.error('Clash player army card render failed:', error);
    }

    const profile = buildPlayerProfilePages(player, {
      assetUrls,
      armyImageAttachment: armyImage ? armyImageName : null
    });
    view.pages = profile.pages;
    view.profileUrl = profile.profileUrl;
    view.footer = profile.footer;
    view.armyImage = armyImage;
    view.armyImageName = armyImageName;

    if (playerViews.get(view.id) === view && view.message) {
      await view.message.edit(renderPlayerView(view, view.activePageId));
    }
  } catch (error) {
    console.error('Clash player asset hydration failed:', error);
    const profile = buildPlayerProfilePages(player);
    view.pages = profile.pages;
    view.profileUrl = profile.profileUrl;
    view.footer = profile.footer;
    if (playerViews.get(view.id) === view && view.message) {
      await view.message.edit(renderPlayerView(view, view.activePageId)).catch(() => {});
    }
  }
}

async function rememberClashPlayer(player, source) {
  try {
    await recordClashPlayerSnapshot(player, {
      storePath: clashHistoryStorePath(),
      source
    });
  } catch (error) {
    console.warn('Could not record Clash player history snapshot:', error);
  }
}

function intervalText(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return 'the configured schedule';
  }
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

function countObjectValues(value) {
  return value && typeof value === 'object' ? Object.keys(value).length : 0;
}

function trackedSnapshotCount(records) {
  return Object.values(records || {}).reduce(
    (total, record) => total + (Array.isArray(record?.snapshots) ? record.snapshots.length : 0),
    0
  );
}

function trackStatusText(store) {
  const trackedPlayers = countObjectValues(store.tracked?.players);
  const trackedClans = countObjectValues(store.tracked?.clans);
  const trackedWars = countObjectValues(store.tracked?.wars);
  const playerSnapshots = trackedSnapshotCount(store.players);
  const clanSnapshots = trackedSnapshotCount(store.clans);
  const warRecords = countObjectValues(store.wars);
  const configuredGuilds = countObjectValues(store.guilds);
  const linkedPlayers = Object.values(store.links || {}).reduce(
    (total, link) => total + countObjectValues(link?.players),
    0
  );
  const scheduler = store.scheduler || {};

  return [
    '**Clash tracking status**',
    `Setup: ${configuredGuilds} Discord server${configuredGuilds === 1 ? '' : 's'} configured, ${linkedPlayers} linked player${linkedPlayers === 1 ? '' : 's'}`,
    `Players: ${trackedPlayers} tracked, ${playerSnapshots} saved snapshot${playerSnapshots === 1 ? '' : 's'}`,
    `Clans: ${trackedClans} tracked, ${clanSnapshots} saved snapshot${clanSnapshots === 1 ? '' : 's'}`,
    `Wars/CWL: ${trackedWars} watched, ${warRecords} saved record${warRecords === 1 ? '' : 's'}`,
    `Schedule: one due subject every ${intervalText(clashHistoryIntervalMs)}; player refresh about every ${intervalText(clashHistoryPlayerIntervalMs)}, clan refresh about every ${intervalText(clashHistoryClanIntervalMs)}, war refresh about every ${intervalText(clashHistoryWarIntervalMs)}.`,
    `Last collector action: ${scheduler.lastAction || 'not run yet'}.`
  ].join('\n');
}

function trackWarningText(warnings = []) {
  const count = Array.isArray(warnings) ? warnings.length : 0;
  if (!count) {
    return '';
  }
  return `\nWar/CWL side checks returned ${count} warning${count === 1 ? '' : 's'}; that is normal when there is no active war, CWL is inactive, or the war log is private.`;
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

function pictionaryGameKey(guildId, channelId) {
  return `${guildId || 'dm'}:${channelId}`;
}

function discordDisplayName(user) {
  return user?.globalName || user?.username || user?.tag || user?.id || 'Unknown player';
}

function pictionaryScoreboardLines(game) {
  const players = [...game.players.values()].sort(
    (left, right) =>
      right.score - left.score ||
      String(left.name).localeCompare(String(right.name))
  );
  if (!players.length) {
    return 'No correct guesses yet.';
  }
  return players
    .map((player, index) => `${index + 1}. ${player.name} - ${player.score}`)
    .join('\n')
    .slice(0, 900);
}

function buildPictionaryRoundEmbed(game, topic) {
  const difficulty = pictionaryDifficultySettings(game.difficulty);
  return new EmbedBuilder()
    .setColor(Number.parseInt(String(topic.accent || '#4fc3f7').replace('#', ''), 16) || 0x4fc3f7)
    .setTitle(`Clash Pictionary - Round ${game.roundNumber}/${game.rounds}`)
    .setDescription([
      `Category: **${topic.category}**`,
      `Difficulty: **${difficulty.label}**. First exact guess in chat wins in **${game.roundSeconds}s**.`,
      '',
      'Type the Clash of Clans name, abbreviation, or common nickname.'
    ].join('\n'))
    .setImage('attachment://clash-pictionary.png')
    .addFields({
      name: 'This game',
      value: pictionaryScoreboardLines(game)
    })
    .setFooter({ text: `Hosted by ${game.hostName}` })
    .setTimestamp();
}

function buildPictionaryResultEmbed(game, { winnerUser = null, answer }) {
  const description = winnerUser
    ? `${userMention(winnerUser.id)} got it first. Answer: **${answer}**`
    : `Time. The answer was **${answer}**.`;
  return new EmbedBuilder()
    .setColor(winnerUser ? 0x67d5a5 : 0xffb454)
    .setTitle(winnerUser ? 'Round won' : 'Round ended')
    .setDescription(description)
    .addFields({
      name: 'Scores',
      value: pictionaryScoreboardLines(game)
    })
    .setFooter({ text: `Round ${game.roundNumber}/${game.rounds}` })
    .setTimestamp();
}

function buildPictionaryFinalEmbed(game, leaderboard) {
  const gameWinner = [...game.players.values()].sort(
    (left, right) =>
      right.score - left.score ||
      String(left.name).localeCompare(String(right.name))
  )[0];
  const winnerLine = gameWinner
    ? `Game winner: **${gameWinner.name}** with **${gameWinner.score}**.`
    : 'Nobody scored this game.';

  return new EmbedBuilder()
    .setColor(0xf0b13b)
    .setTitle('Clash Pictionary leaderboard')
    .setDescription([
      winnerLine,
      '',
      '**All-time stats**',
      formatPictionaryLeaderboard(leaderboard)
    ].join('\n'))
    .setFooter({ text: 'Stats are saved in the server leaderboard database.' })
    .setTimestamp();
}

async function endPictionaryGame(game) {
  if (game.ended) {
    return;
  }
  game.ended = true;
  activePictionaryGames.delete(game.key);
  if (game.roundTimer) {
    clearTimeout(game.roundTimer);
  }
  if (game.nextRoundTimer) {
    clearTimeout(game.nextRoundTimer);
  }

  const players = [...game.players.values()].map((player) => ({
    user: player.user,
    score: player.score
  }));
  const winner = players
    .filter((player) => player.score > 0)
    .sort((left, right) => right.score - left.score)[0];
  const result = await recordPictionaryGame(game.guildId, {
    channelId: game.channelId,
    gameId: game.id,
    startedAt: game.startedAt,
    rounds: game.rounds,
    winnerUser: winner?.user || null,
    players,
    storePath: pictionaryStorePath()
  });

  await game.channel.send({
    embeds: [buildPictionaryFinalEmbed(game, result.leaderboard)],
    allowedMentions: { parse: [] }
  });
}

async function finishPictionaryRound(game, { winnerUser = null } = {}) {
  if (game.ended || !game.accepting || !game.currentTopic) {
    return;
  }
  game.accepting = false;
  if (game.roundTimer) {
    clearTimeout(game.roundTimer);
    game.roundTimer = null;
  }

  if (winnerUser) {
    const existing = game.players.get(winnerUser.id);
    game.players.set(winnerUser.id, {
      user: winnerUser,
      name: discordDisplayName(winnerUser),
      score: (existing?.score || 0) + 1
    });
  }

  await game.channel.send({
    embeds: [
      buildPictionaryResultEmbed(game, {
        winnerUser,
        answer: game.currentTopic.answer
      })
    ],
    allowedMentions: winnerUser ? { users: [winnerUser.id] } : { parse: [] }
  });

  if (game.roundNumber >= game.rounds) {
    await endPictionaryGame(game);
    return;
  }

  game.nextRoundTimer = setTimeout(() => {
    game.nextRoundTimer = null;
    beginPictionaryRound(game).catch(async (error) => {
      console.error('/pictionary next round failed:', error);
      activePictionaryGames.delete(game.key);
      await game.channel.send({
        content: 'The Pictionary game hit an error and had to stop.',
        allowedMentions: { parse: [] }
      }).catch(() => {});
    });
  }, 3500);
  game.nextRoundTimer.unref?.();
}

async function beginPictionaryRound(game) {
  if (game.ended) {
    return;
  }
  game.roundNumber += 1;
  const topic = selectPictionaryTopic({
    usedTopicIds: game.usedTopicIds,
    previousCategory: game.previousCategory,
    difficulty: game.difficulty
  });
  game.usedTopicIds.push(topic.id);
  game.previousCategory = topic.category;
  game.currentTopic = topic;
  game.accepting = true;

  const assetUrls = await fetchCocWikiImageMap(pictionaryTopicAssetNames(topic), {
    limit: 8,
    timeoutMs: 2500
  });
  const image = await renderPictionaryRoundImage(topic, {
    round: game.roundNumber,
    totalRounds: game.rounds,
    seconds: game.roundSeconds,
    difficulty: game.difficulty,
    assetUrls
  });
  const attachment = new AttachmentBuilder(image, {
    name: 'clash-pictionary.png'
  });
  await game.channel.send({
    embeds: [buildPictionaryRoundEmbed(game, topic)],
    files: [attachment],
    allowedMentions: { parse: [] }
  });

  game.roundTimer = setTimeout(() => {
    finishPictionaryRound(game).catch(async (error) => {
      console.error('/pictionary timeout failed:', error);
      activePictionaryGames.delete(game.key);
      await game.channel.send({
        content: 'The Pictionary game hit an error and had to stop.',
        allowedMentions: { parse: [] }
      }).catch(() => {});
    });
  }, game.roundSeconds * 1000);
  game.roundTimer.unref?.();
}

async function handlePictionaryCommand(interaction) {
  if (!interaction.guildId || !interaction.channel) {
    await interaction.reply({
      content: '/pictionary only works inside a Discord server channel.',
      ephemeral: true
    });
    return;
  }

  if (!discordMessageContentIntentRequested) {
    await interaction.reply({
      content: 'I need Discord Message Content Intent enabled before I can read Pictionary guesses.',
      ephemeral: true
    });
    return;
  }

  const key = pictionaryGameKey(interaction.guildId, interaction.channelId);
  if (activePictionaryGames.has(key)) {
    await interaction.reply({
      content: 'A Clash Pictionary game is already running in this channel.',
      ephemeral: true
    });
    return;
  }

  const rounds = normalizePictionaryRounds(
    interaction.options.getInteger('rounds') || DEFAULT_PICTIONARY_ROUNDS
  );
  const difficulty = normalizePictionaryDifficulty(interaction.options.getString('difficulty'));
  const difficultySettings = pictionaryDifficultySettings(difficulty);
  const roundSeconds = normalizePictionaryRoundSeconds(
    interaction.options.getInteger('seconds') || difficultySettings.seconds || DEFAULT_PICTIONARY_ROUND_SECONDS
  );
  const store = await readPictionaryStore(pictionaryStorePath());
  const leaderboard = buildPictionaryLeaderboard(store, interaction.guildId, { limit: 5 });
  const game = {
    id: createViewId(),
    key,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    channel: interaction.channel,
    hostId: interaction.user.id,
    hostName: discordDisplayName(interaction.user),
    rounds,
    roundSeconds,
    difficulty,
    roundNumber: 0,
    usedTopicIds: [],
    previousCategory: '',
    currentTopic: null,
    accepting: false,
    ended: false,
    startedAt: new Date(),
    players: new Map(),
    roundTimer: null,
    nextRoundTimer: null
  };

  activePictionaryGames.set(key, game);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x4fc3f7)
        .setTitle('Clash Pictionary is starting')
        .setDescription([
          `${rounds} rounds. ${roundSeconds} seconds each. Difficulty: **${difficultySettings.label}**.`,
          'Guess the Clash of Clans picture in chat. First correct answer wins the round.',
          '',
          '**Leaderboard preview**',
          formatPictionaryLeaderboard(leaderboard)
        ].join('\n'))
        .setTimestamp()
    ],
    allowedMentions: { parse: [] }
  });

  beginPictionaryRound(game).catch(async (error) => {
    console.error('/pictionary start failed:', error);
    activePictionaryGames.delete(key);
    await interaction.channel.send({
      content: 'I could not start the Pictionary game right now.',
      allowedMentions: { parse: [] }
    }).catch(() => {});
  });
}

async function handlePictionaryGuessMessage(message) {
  if (!message.guildId || message.author?.bot || message.system || message.webhookId) {
    return false;
  }
  const game = activePictionaryGames.get(pictionaryGameKey(message.guildId, message.channelId));
  if (!game) {
    return false;
  }
  if (game.accepting && isCorrectPictionaryGuess(message.content, game.currentTopic)) {
    await finishPictionaryRound(game, { winnerUser: message.author });
  }
  return true;
}

client.once(Events.ClientReady, (readyClient) => {
  ready = true;
  readyUser = readyClient.user.tag;
  console.log(`Logged in as ${readyUser}.`);
  stopLegendsTracker = startLegendsTracker({
    storePath: legendsStorePath(),
    intervalMs: legendsIntervalMs
  });
  stopClashHistoryCollector = startClashHistoryCollector({
    storePath: clashHistoryStorePath(),
    intervalMs:
      Number.isFinite(clashHistoryIntervalMs) && clashHistoryIntervalMs > 0
        ? clashHistoryIntervalMs
        : DEFAULT_CLASH_HISTORY_INTERVAL_MS,
    playerIntervalMs:
      Number.isFinite(clashHistoryPlayerIntervalMs) && clashHistoryPlayerIntervalMs > 0
        ? clashHistoryPlayerIntervalMs
        : DEFAULT_CLASH_HISTORY_PLAYER_INTERVAL_MS,
    clanIntervalMs:
      Number.isFinite(clashHistoryClanIntervalMs) && clashHistoryClanIntervalMs > 0
        ? clashHistoryClanIntervalMs
        : DEFAULT_CLASH_HISTORY_CLAN_INTERVAL_MS,
    warIntervalMs:
      Number.isFinite(clashHistoryWarIntervalMs) && clashHistoryWarIntervalMs > 0
        ? clashHistoryWarIntervalMs
        : DEFAULT_CLASH_HISTORY_WAR_INTERVAL_MS,
    extraPlayerTagsProvider: async () => {
      const legendsStore = await readLegendsStore(legendsStorePath());
      const historyStore = await readClashHistoryStore(clashHistoryStorePath());
      return [
        ...Object.keys(legendsStore.players || {}),
        ...Object.keys(historyStore.players || {})
      ];
    }
  });
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (await handlePictionaryGuessMessage(message)) {
      return;
    }
  } catch (error) {
    console.error('/pictionary guess handling failed:', error);
    await message.channel?.send?.({
      content: 'I had trouble reading that Pictionary guess.',
      allowedMentions: { parse: [] }
    }).catch(() => {});
    return;
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

  if (interaction.commandName === 'loveu') {
    const targetUser = interaction.options.getUser('user', true);
    const targetMember = interaction.options.getMember?.('user');
    const targetName =
      targetMember?.displayName || targetUser.globalName || targetUser.username || 'you';
    const poem = randomLoveuPoem(targetName);
    const heartSeed = crypto.randomInt(1, 0x7fffffff);
    const heartPng = createLanaHeartPng({
      variant: heartSeed
    });
    const attachment = new AttachmentBuilder(heartPng, {
      name: 'loveu-heart.png'
    });
    const embed = new EmbedBuilder()
      .setColor(0xf06292)
      .setTitle(poem.title)
      .setDescription([
        `${userMention(targetUser.id)}, this one is for you.`,
        '',
        poem.body,
        '',
        ':heart: :sparkles: :two_hearts:'
      ].join('\n'))
      .addFields({
        name: 'Tiny note',
        value: poem.note
      })
      .setImage('attachment://loveu-heart.png')
      .setFooter({ text: 'A fresh poem and a new heart every time' })
      .setTimestamp();

    await interaction.reply({
      content: userMention(targetUser.id),
      embeds: [embed],
      files: [attachment],
      allowedMentions: { users: [targetUser.id] }
    });
    return;
  }

  if (interaction.commandName === 'player') {
    const tag = interaction.options.getString('tag') || interaction.options.getString('player');
    await interaction.deferReply();

    try {
      if (!tag) {
        await interaction.editReply('Please enter a Clash of Clans player tag.');
        return;
      }
      const player = await fetchPlayer(normalizePlayerTag(tag));
      void rememberClashPlayer(player, 'lookup');
      const profile = buildPlayerProfilePages(player, {
        armyImageLoading: true
      });
      const view = {
        id: createViewId(),
        ownerId: interaction.user.id,
        pages: profile.pages,
        profileUrl: profile.profileUrl,
        footer: profile.footer,
        armyImage: null,
        armyImageName: null,
        activePageId: 'overview'
      };

      const message = await interaction.editReply(renderPlayerView(view, view.activePageId));
      storePlayerView(view, message);
      void hydratePlayerArmyCard(view, player, tag);
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
      void rememberClashPlayer(result.player, 'legends');
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

  if (interaction.commandName === 'config') {
    const group = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand(true);
    await interaction.deferReply();

    try {
      if (!interaction.guildId) {
        await interaction.editReply('Use `/config` inside a Discord server so mavebot knows which server to configure.');
        return;
      }

      if (group === 'clan' && subcommand === 'set') {
        const tag = interaction.options.getString('tag', true);
        const result = await setClashGuildDefaultClan({
          guildId: interaction.guildId,
          clanTag: tag,
          actorId: interaction.user.id,
          actorName: interaction.user.tag || interaction.user.username,
          storePath: clashHistoryStorePath()
        });
        const current = result.record?.current || result.snapshot;
        const memberCount = current.memberTags?.length || current.members || 0;
        await interaction.editReply(
          [
            `Saved **${current.name}** (${current.tag}) as this server's default clan.`,
            `Seeded a clan snapshot now: level ${current.level || '?'} - ${memberCount} member${memberCount === 1 ? '' : 's'}.`,
            'Now `/summary`, `/activity`, `/warstats`, and `/roster plan` can work without repeating the clan tag.'
          ].join('\n')
        );
        return;
      }

      if (group === 'clan' && subcommand === 'status') {
        const store = await readClashHistoryStore(clashHistoryStorePath());
        await interaction.editReply(buildClashGuildConfigText(store, { guildId: interaction.guildId }));
        return;
      }

      await interaction.editReply('I do not know that `/config` subcommand yet.');
    } catch (error) {
      const message =
        error instanceof CocApiError
          ? error.message
          : 'I could not update this server setup right now.';
      await interaction.editReply(message);
      console.error('Clash config command failed:', error);
    }
    return;
  }

  if (interaction.commandName === 'link') {
    const subcommand = interaction.options.getSubcommand(true);
    await interaction.deferReply();

    try {
      if (subcommand === 'player') {
        const tag = interaction.options.getString('tag', true);
        const result = await linkClashPlayerToDiscord({
          playerTag: tag,
          guildId: interaction.guildId,
          userId: interaction.user.id,
          username: interaction.user.tag || interaction.user.username,
          storePath: clashHistoryStorePath()
        });
        const current = result.player?.current || result.snapshot;
        await interaction.editReply(
          [
            `Linked **${current.name}** (${current.tag}) to ${interaction.user}.`,
            `Seeded a player snapshot now: TH ${current.townHallLevel || '?'} - ${current.trophies ?? '?'} trophies - ${current.warStars ?? '?'} war stars.`,
            'This helps roster, activity, and future reminder features understand who is who.'
          ].join('\n')
        );
        return;
      }

      if (subcommand === 'status') {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const store = await readClashHistoryStore(clashHistoryStorePath());
        await interaction.editReply(
          buildClashLinkStatusText(store, {
            userId: targetUser.id,
            username: targetUser.tag || targetUser.username
          })
        );
        return;
      }

      if (subcommand === 'remove') {
        const tag = interaction.options.getString('tag', true);
        const result = await removeClashPlayerLink({
          playerTag: tag,
          userId: interaction.user.id,
          storePath: clashHistoryStorePath()
        });
        await interaction.editReply(
          result.removed
            ? `Removed ${result.playerTag} from your linked Clash players.`
            : `${result.playerTag} was not linked to you.`
        );
        return;
      }

      await interaction.editReply('I do not know that `/link` subcommand yet.');
    } catch (error) {
      const message =
        error instanceof CocApiError
          ? error.message
          : 'I could not update that player link right now.';
      await interaction.editReply(message);
      console.error('Clash link command failed:', error);
    }
    return;
  }

  if (interaction.commandName === 'track') {
    const subcommand = interaction.options.getSubcommand(true);
    await interaction.deferReply();

    try {
      if (subcommand === 'status') {
        const store = await readClashHistoryStore(clashHistoryStorePath());
        await interaction.editReply(trackStatusText(store));
        return;
      }

      const tag = interaction.options.getString('tag', true);
      const source = `discord:${interaction.user.id}`;

      if (subcommand === 'player') {
        const result = await trackClashHistoryPlayer(tag, {
          storePath: clashHistoryStorePath(),
          source,
          playerIntervalMs: clashHistoryPlayerIntervalMs
        });
        const current = result.record.current || result.snapshot;
        await interaction.editReply(
          [
            `Tracking **${current.name}** (${current.tag}).`,
            `Seeded the first player snapshot now: TH ${current.townHallLevel || '?'} - ${current.trophies ?? '?'} trophies - ${current.warStars ?? '?'} war stars.`,
            `mavebot will keep refreshing tracked players about every ${intervalText(clashHistoryPlayerIntervalMs)} when they are due. History starts from this snapshot.`
          ].join('\n')
        );
        return;
      }

      if (subcommand === 'clan') {
        const result = await trackClashHistoryClan(tag, {
          storePath: clashHistoryStorePath(),
          source,
          clanIntervalMs: clashHistoryClanIntervalMs
        });
        const current = result.record.current || result.snapshot;
        const memberCount = current.memberTags?.length || 0;
        await interaction.editReply(
          [
            `Tracking **${current.name}** (${current.tag}).`,
            `Seeded the clan snapshot now: level ${current.level || '?'} - ${memberCount} member${memberCount === 1 ? '' : 's'} - ${current.points ?? '?'} clan trophies.`,
            `Current members were queued for player history too, and mavebot will keep refreshing tracked clans about every ${intervalText(clashHistoryClanIntervalMs)} when due.${trackWarningText(result.warnings)}`,
            'History starts from this snapshot; older detailed attacks and trophy movement can only appear if mavebot had already collected them.'
          ].join('\n')
        );
        return;
      }

      await interaction.editReply('I do not know that `/track` subcommand yet.');
    } catch (error) {
      const message =
        error instanceof CocApiError
          ? error.message
          : 'I could not update Clash tracking right now.';
      await interaction.editReply(message);
      console.error('Clash tracking command failed:', error);
    }
    return;
  }

  if (interaction.commandName === 'history') {
    const subcommand = interaction.options.getSubcommand(true);
    await interaction.deferReply();

    try {
      if (subcommand !== 'player') {
        await interaction.editReply('I do not know that `/history` subcommand yet.');
        return;
      }

      const tag = interaction.options.getString('tag', true);
      const normalizedTag = normalizePlayerTag(tag);
      let store = await readClashHistoryStore(clashHistoryStorePath());
      let record = store.players?.[normalizedTag] || null;
      let seeded = false;

      if (!record?.current) {
        const result = await trackClashHistoryPlayer(normalizedTag, {
          storePath: clashHistoryStorePath(),
          source: `discord:${interaction.user.id}`,
          playerIntervalMs: clashHistoryPlayerIntervalMs
        });
        store = result.store;
        record = result.record;
        seeded = true;
      }

      const text = buildClashPlayerHistoryText(record, {
        tracked: store.tracked?.players?.[normalizedTag] || null
      });

      await interaction.editReply(
        [
          seeded
            ? 'I started tracking this player now, so older detailed history is not available yet.'
            : null,
          text || 'I do not have history for that player yet.'
        ]
          .filter(Boolean)
          .join('\n\n')
      );
    } catch (error) {
      const message =
        error instanceof CocApiError
          ? error.message
          : 'I could not read Clash history for that player right now.';
      await interaction.editReply(message);
      console.error('Clash history command failed:', error);
    }
    return;
  }

  if (interaction.commandName === 'roster') {
    const subcommand = interaction.options.getSubcommand(true);
    await interaction.deferReply();

    try {
      if (subcommand === 'plan') {
        const clan = interaction.options.getString('clan');
        const size = interaction.options.getInteger('size') || 15;
        const style = interaction.options.getString('style') || 'balanced';
        let store = await readClashHistoryStore(clashHistoryStorePath());
        let normalizedClanTag = null;
        let seeded = false;

        if (clan) {
          normalizedClanTag = normalizeClanTag(clan);
          if (!store.clans?.[normalizedClanTag]?.current) {
            const result = await trackClashHistoryClan(normalizedClanTag, {
              storePath: clashHistoryStorePath(),
              source: `discord:${interaction.user.id}`,
              clanIntervalMs: clashHistoryClanIntervalMs
            });
            store = result.store;
            seeded = true;
          }
        }

        const text = buildClashRosterPlanText(store, {
          clanTag: normalizedClanTag,
          size,
          style,
          guildId: interaction.guildId
        });

        await interaction.editReply(
          [
            seeded
              ? 'I started tracking this clan now, so the roster plan is based on the first snapshot.'
              : null,
            text ||
              'Track a clan first with `/track clan tag:#CLAN`, or pass a clan tag to `/roster plan clan:#CLAN`.'
          ]
            .filter(Boolean)
            .join('\n\n')
        );
        return;
      }

      if (subcommand === 'signup') {
        const player = interaction.options.getString('player', true);
        const clan = interaction.options.getString('clan');
        const note = interaction.options.getString('note');
        const result = await signupClashRoster({
          playerTag: player,
          clanTag: clan,
          guildId: interaction.guildId,
          userId: interaction.user.id,
          username: interaction.user.tag || interaction.user.username,
          note,
          storePath: clashHistoryStorePath()
        });
        const current = result.record?.current || result.snapshot || {};
        const title = result.roster?.clanTag
          ? `${current.name || current.tag} is signed up for ${result.roster.clanTag}.`
          : `${current.name || current.tag} is signed up.`;

        await interaction.editReply(
          [
            title,
            result.signup?.note ? `Note: ${result.signup.note}` : null,
            'Use `/roster status` to see the full signup board and missing players.'
          ]
            .filter(Boolean)
            .join('\n')
        );
        return;
      }

      if (subcommand === 'status') {
        const clan = interaction.options.getString('clan');
        const normalizedClanTag = clan ? normalizeClanTag(clan) : null;
        const store = await readClashHistoryStore(clashHistoryStorePath());
        const text = buildClashRosterStatusText(store, {
          clanTag: normalizedClanTag,
          guildId: interaction.guildId
        });

        await interaction.editReply(text);
        return;
      }

      if (subcommand === 'export') {
        const clan = interaction.options.getString('clan');
        const format = interaction.options.getString('format') || 'text';
        const normalizedClanTag = clan ? normalizeClanTag(clan) : null;
        const store = await readClashHistoryStore(clashHistoryStorePath());
        const text = buildClashRosterExportText(store, {
          clanTag: normalizedClanTag,
          guildId: interaction.guildId,
          format
        });

        await interaction.editReply(text);
        return;
      }

      await interaction.editReply('I do not know that `/roster` subcommand yet.');
    } catch (error) {
      const message =
        error instanceof CocApiError
          ? error.message
          : 'I could not update the Clash roster right now.';
      await interaction.editReply(message);
      console.error('Clash roster command failed:', error);
    }
    return;
  }

  if (
    interaction.commandName === 'warstats' ||
    interaction.commandName === 'activity' ||
    interaction.commandName === 'summary'
  ) {
    await interaction.deferReply();

    try {
      const clan = interaction.options.getString('clan');
      let store = await readClashHistoryStore(clashHistoryStorePath());
      let normalizedClanTag = clan ? normalizeClanTag(clan) : null;
      let seeded = false;

      if (normalizedClanTag && !store.clans?.[normalizedClanTag]?.current) {
        const result = await trackClashHistoryClan(normalizedClanTag, {
          storePath: clashHistoryStorePath(),
          source: `discord:${interaction.user.id}`,
          clanIntervalMs: clashHistoryClanIntervalMs
        });
        store = result.store;
        seeded = true;
      }

      const text =
        interaction.commandName === 'warstats'
          ? buildClashWarStatsText(store, { clanTag: normalizedClanTag, guildId: interaction.guildId })
          : interaction.commandName === 'activity'
            ? buildClashActivityText(store, { clanTag: normalizedClanTag, guildId: interaction.guildId })
            : buildClashSummaryText(store, { clanTag: normalizedClanTag, guildId: interaction.guildId });

      await interaction.editReply(
        [
          seeded
            ? 'I started tracking this clan now, so this first report is based on the first snapshot.'
            : null,
          text || 'Track a clan first with `/track clan tag:#CLAN`, or pass a clan tag to this command.'
        ]
          .filter(Boolean)
          .join('\n\n')
      );
    } catch (error) {
      const message =
        error instanceof CocApiError
          ? error.message
          : 'I could not read Clash operations data right now.';
      await interaction.editReply(message);
      console.error('Clash operations report command failed:', error);
    }
    return;
  }

  if (interaction.commandName === 'pictionary') {
    await handlePictionaryCommand(interaction);
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
  stopClashHistoryCollector?.();
  client.destroy();
  healthServer.close(() => process.exit(0));
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await client.login(token);
