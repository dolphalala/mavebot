import 'dotenv/config';
import crypto from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
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
  clashHistoryStorePath,
  readClashHistoryStore,
  recordClashPlayerSnapshot,
  startClashHistoryCollector
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
import {
  DEFAULT_DISCORD_ATTACHMENT_DOWNLOAD_MAX_BYTES,
  DEFAULT_DISCORD_CODEX_BURST_GAP_MS,
  DEFAULT_DISCORD_CODEX_CONTEXT_BACKFILL_LIMIT,
  DEFAULT_DISCORD_CODEX_CATCHUP_WINDOW_MS,
  DEFAULT_DISCORD_CODEX_JOB_DIR,
  DEFAULT_DISCORD_CONTEXT_LOG_MAX_ROWS,
  DEFAULT_DISCORD_CONTEXT_LOG_PATH,
  DEFAULT_DISCORD_FILE_CONTEXT_DIR,
  appendDiscordContextRows,
  buildDiscordCodexWorkerJob,
  buildDiscordMessageRow,
  discordJobContainsMessage,
  discordLiveBurstKey,
  discordCodexSetupBlocker,
  enqueueDiscordCodexWorkerJob,
  hasDiscordMessageContentIntentFlag,
  isDiscordCodexWorkingAckText,
  materializeDiscordAttachments,
  planDiscordCodexCatchupBursts,
  randomWorkingMessage,
  readDiscordContextLog,
  selectNearbyDiscordContextRows,
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
const discordCodexWorkerBaseDir = path.dirname(discordCodexWorkerJobDir);
const discordCodexAuthRetryStatePath =
  process.env.DISCORD_CODEX_AUTH_RETRY_STATE_PATH ||
  process.env.CODEX_WORKER_AUTH_RETRY_STATE_PATH ||
  path.join(discordCodexWorkerBaseDir, 'context/auth-retry-state.json');
const discordFileContextDir =
  process.env.DISCORD_FILE_CONTEXT_DIR || DEFAULT_DISCORD_FILE_CONTEXT_DIR;
const discordCodexContextLogPath =
  process.env.DISCORD_CODEX_CONTEXT_LOG_PATH || DEFAULT_DISCORD_CONTEXT_LOG_PATH;
const discordCodexContextLogMaxRows = Number.parseInt(
  process.env.DISCORD_CODEX_CONTEXT_LOG_MAX_ROWS || String(DEFAULT_DISCORD_CONTEXT_LOG_MAX_ROWS),
  10
);
const discordAttachmentDownloadMaxBytes = Number.parseInt(
  process.env.DISCORD_ATTACHMENT_DOWNLOAD_MAX_BYTES ||
    String(DEFAULT_DISCORD_ATTACHMENT_DOWNLOAD_MAX_BYTES),
  10
);
const discordCodexWorkerDebounceMs = Number.parseInt(
  process.env.DISCORD_CODEX_WORKER_DEBOUNCE_MS ||
    process.env.SLACK_CODEX_WORKER_DEBOUNCE_MS ||
    '3500',
  10
);
const discordCodexCatchupLimit = Number.parseInt(
  process.env.DISCORD_CODEX_CATCHUP_LIMIT || '12',
  10
);
const discordCodexContextBackfillLimit = Number.parseInt(
  process.env.DISCORD_CODEX_CONTEXT_BACKFILL_LIMIT ||
    String(DEFAULT_DISCORD_CODEX_CONTEXT_BACKFILL_LIMIT),
  10
);
const discordCodexCatchupWindowMs = Number.parseInt(
  process.env.DISCORD_CODEX_CATCHUP_WINDOW_MS || String(DEFAULT_DISCORD_CODEX_CATCHUP_WINDOW_MS),
  10
);
const discordCodexRecentContextWindowMs = Number.parseInt(
  process.env.DISCORD_CODEX_RECENT_CONTEXT_WINDOW_MS || String(DEFAULT_DISCORD_CODEX_CATCHUP_WINDOW_MS),
  10
);
const discordCodexRecentContextLimit = Number.parseInt(
  process.env.DISCORD_CODEX_RECENT_CONTEXT_LIMIT || '12',
  10
);
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

let ready = false;
let readyUser = null;
let discordCodexMessageCount = 0;
let discordCodexLastMessageAt = null;
let discordCodexIntentWarningSent = false;
let discordCodexLastError = null;
let discordCodexLastCatchup = null;
const pendingDiscordCodexJobs = new Map();
const recentDiscordCodexRows = [];
let discordContextLogWriteQueue = Promise.resolve([]);

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
const discordCodexSetupMessage = discordCodexSetupBlocker({
  channelIdConfigured: Boolean(discordCodexChannelId),
  messageContentIntentRequested: discordMessageContentIntentRequested
});
const activePictionaryGames = new Map();

const app = express();
app.get('/healthz', async (_req, res) => {
  let clashHistoryScheduler = null;
  let discordCodexPersistentContextRows = 0;
  const discordCodexAuthBlockedJobs = await countDiscordCodexWorkerRecords('auth-blocked');
  const discordCodexWorkerAuth = await readDiscordCodexWorkerAuthState({
    currentBlockedJobs: discordCodexAuthBlockedJobs
  });
  try {
    const clashHistoryStore = await readClashHistoryStore(clashHistoryStorePath());
    clashHistoryScheduler = clashHistoryStore.scheduler || null;
  } catch {}
  try {
    discordCodexPersistentContextRows = (
      await readDiscordContextLog(discordCodexContextLogPath, {
        channelId: discordCodexChannelId,
        limit: normalizedDiscordContextLogMaxRows()
      })
    ).length;
  } catch {}
  res.status(ready ? 200 : 503).json({
    ok: ready,
    botUser: readyUser,
    discordCodexChannelIdConfigured: Boolean(discordCodexChannelId),
    discordMessageContentIntentAvailable,
    discordMessageContentIntentRequested,
    discordCodexSetupReady: Boolean(discordCodexChannelId && discordMessageContentIntentRequested),
    discordCodexSetupMessage,
    discordCodexWorkerJobDir,
    discordFileContextDir,
    discordCodexContextLogPath,
    discordCodexContextLogMaxRows: normalizedDiscordContextLogMaxRows(),
    discordCodexPersistentContextRows,
    discordAttachmentDownloadMaxBytes,
    discordCodexWorkerDebounceMs,
    discordCodexCatchupLimit,
    discordCodexContextBackfillLimit: normalizedDiscordContextBackfillLimit(),
    discordCodexCatchupWindowMs,
    discordCodexRecentContextWindowMs,
    discordCodexRecentContextLimit,
    discordCodexRecentContextRows: recentDiscordCodexRows.length,
    discordCodexPendingBursts: pendingDiscordCodexJobs.size,
    discordCodexMessageCount,
    discordCodexLastMessageAt,
    discordCodexLastCatchup,
    discordCodexLastError,
    discordCodexWorkerAuth,
    discordCodexAuthBlockedJobs,
    pictionaryStorePath: pictionaryStorePath(),
    pictionaryActiveGames: activePictionaryGames.size,
    clashHistoryStorePath: clashHistoryStorePath(),
    clashHistoryIntervalMs,
    clashHistoryPlayerIntervalMs,
    clashHistoryClanIntervalMs,
    clashHistoryWarIntervalMs,
    clashHistoryScheduler,
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

function summarizeRuntimeError(error) {
  return String(error?.message || error || 'unknown error')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function rememberDiscordCodexError(scope, error) {
  discordCodexLastError = {
    at: new Date().toISOString(),
    scope,
    message: summarizeRuntimeError(error)
  };
}

function createViewId() {
  return crypto.randomBytes(8).toString('hex');
}

function pendingDiscordJobKey(message) {
  return discordLiveBurstKey(message, discordCodexChannelId || 'discord');
}

function normalizedDiscordRecentContextWindowMs() {
  return Number.isFinite(discordCodexRecentContextWindowMs) && discordCodexRecentContextWindowMs > 0
    ? discordCodexRecentContextWindowMs
    : DEFAULT_DISCORD_CODEX_CATCHUP_WINDOW_MS;
}

function normalizedDiscordRecentContextLimit() {
  return Number.isFinite(discordCodexRecentContextLimit) && discordCodexRecentContextLimit > 0
    ? discordCodexRecentContextLimit
    : 12;
}

function normalizedDiscordContextLogMaxRows() {
  return Number.isFinite(discordCodexContextLogMaxRows) && discordCodexContextLogMaxRows > 0
    ? discordCodexContextLogMaxRows
    : DEFAULT_DISCORD_CONTEXT_LOG_MAX_ROWS;
}

function normalizedDiscordCatchupLimit() {
  return Number.isFinite(discordCodexCatchupLimit) && discordCodexCatchupLimit > 0
    ? Math.min(discordCodexCatchupLimit, 100)
    : 12;
}

function normalizedDiscordContextBackfillLimit() {
  return Number.isFinite(discordCodexContextBackfillLimit) && discordCodexContextBackfillLimit > 0
    ? Math.min(discordCodexContextBackfillLimit, 100)
    : DEFAULT_DISCORD_CODEX_CONTEXT_BACKFILL_LIMIT;
}

function discordCodexWorkerRecordDir(name) {
  return path.join(discordCodexWorkerBaseDir, name);
}

function discordCodexWorkerRecordDirs() {
  return [
    discordCodexWorkerJobDir,
    discordCodexWorkerRecordDir('processing'),
    discordCodexWorkerRecordDir('done'),
    discordCodexWorkerRecordDir('failed'),
    discordCodexWorkerRecordDir('auth-blocked')
  ];
}

async function countDiscordCodexWorkerRecords(name) {
  try {
    return (await readdir(discordCodexWorkerRecordDir(name)))
      .filter((entry) => entry.endsWith('.json'))
      .length;
  } catch {
    return 0;
  }
}

async function readDiscordCodexWorkerAuthState({ currentBlockedJobs = null } = {}) {
  try {
    const state = JSON.parse(await readFile(discordCodexAuthRetryStatePath, 'utf8'));
    const lastProbeBlockedJobs = Number.parseInt(state.blockedJobs || '0', 10) || 0;
    return {
      at: state.at || '',
      ready: Boolean(state.ready),
      blockedJobs: Number.isFinite(currentBlockedJobs) ? currentBlockedJobs : lastProbeBlockedJobs,
      lastProbeBlockedJobs,
      reason: String(state.reason || '').slice(0, 300)
    };
  } catch {
    return null;
  }
}

function discordRowTime(row) {
  const parsed = Date.parse(row?.receivedAt || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function pruneRecentDiscordCodexRows(now = Date.now()) {
  const windowMs = normalizedDiscordRecentContextWindowMs();
  const keepAfter = now - windowMs;
  for (let i = recentDiscordCodexRows.length - 1; i >= 0; i -= 1) {
    const rowTime = discordRowTime(recentDiscordCodexRows[i]);
    if (rowTime && rowTime < keepAfter) {
      recentDiscordCodexRows.splice(i, 1);
    }
  }

  const maxRows = normalizedDiscordRecentContextLimit() * 3;
  while (recentDiscordCodexRows.length > maxRows) {
    recentDiscordCodexRows.shift();
  }
}

function rememberDiscordCodexRow(row) {
  if (!row?.id) {
    return;
  }
  const existingIndex = recentDiscordCodexRows.findIndex((recentRow) => recentRow?.id === row.id);
  if (existingIndex >= 0) {
    recentDiscordCodexRows.splice(existingIndex, 1);
  }
  recentDiscordCodexRows.push(row);
  pruneRecentDiscordCodexRows(discordRowTime(row) || Date.now());
}

async function persistDiscordCodexRows(rows = []) {
  const filtered = (rows || []).filter((row) => row?.id);
  if (!filtered.length) {
    return [];
  }
  filtered.forEach(rememberDiscordCodexRow);
  try {
    const write = () =>
      appendDiscordContextRows(discordCodexContextLogPath, filtered, {
        maxRows: normalizedDiscordContextLogMaxRows()
      });
    discordContextLogWriteQueue = discordContextLogWriteQueue.then(write, write);
    return await discordContextLogWriteQueue;
  } catch (error) {
    rememberDiscordCodexError('context-log', error);
    console.error('Discord Codex context log update failed:', error);
    return [];
  }
}

function discordContextMessageIsUseful(message) {
  if (!discordCodexChannelId || message?.channelId !== discordCodexChannelId) {
    return false;
  }
  if (message?.system || message?.webhookId) {
    return false;
  }
  const text = String(message?.content || '').trim();
  const attachments = message?.attachments;
  const hasAttachments = Boolean(attachments?.size || attachments?.length);
  if (!message?.author?.bot) {
    return Boolean(text || hasAttachments);
  }
  if (!text) {
    return false;
  }
  return !isDiscordWorkingAckText(text);
}

function isDiscordWorkingAckText(text) {
  return isDiscordCodexWorkingAckText(text);
}

function discordContextRowIsUseful(row) {
  if (!row?.bot) {
    return true;
  }
  return !isDiscordWorkingAckText(row.text || '');
}

async function buildDiscordContextRowForMessage(message, { downloadAttachments = false } = {}) {
  let files = [];
  if (downloadAttachments && !message?.author?.bot) {
    files = await materializeDiscordAttachments(message, {
      contextDir: discordFileContextDir,
      maxBytes: discordAttachmentDownloadMaxBytes
    });
  }
  return buildDiscordMessageRow(message, { files });
}

async function rememberDiscordCodexMessageContext(message, { downloadAttachments = false } = {}) {
  if (!discordContextMessageIsUseful(message)) {
    return null;
  }
  const row = await buildDiscordContextRowForMessage(message, { downloadAttachments });
  await persistDiscordCodexRows([row]);
  return row;
}

async function rememberDiscordCodexFetchedContext(messages = []) {
  const rows = [];
  const values = Array.isArray(messages) ? messages : [...(messages?.values?.() || [])];
  for (const message of values) {
    if (!discordContextMessageIsUseful(message)) {
      continue;
    }
    try {
      rows.push(await buildDiscordContextRowForMessage(message, {
        downloadAttachments: !message?.author?.bot
      }));
    } catch (error) {
      rememberDiscordCodexError('context-fetch', error);
      rows.push(buildDiscordMessageRow(message));
    }
  }
  if (rows.length) {
    await persistDiscordCodexRows(rows);
  }
  return rows;
}

async function recentDiscordCodexContextRows(message, activeRows = []) {
  pruneRecentDiscordCodexRows();

  const activeIds = new Set((activeRows || []).map((row) => row?.id).filter(Boolean));
  const channelId = message?.channelId || activeRows.at(-1)?.channel || discordCodexChannelId;
  const anchorTime =
    Date.parse(activeRows.at(-1)?.receivedAt || '') ||
    Number(message?.createdTimestamp || 0) ||
    Date.now();
  const windowMs = normalizedDiscordRecentContextWindowMs();
  const limit = normalizedDiscordRecentContextLimit();
  const persistentRows = await readDiscordContextLog(discordCodexContextLogPath, {
    channelId,
    limit: normalizedDiscordContextLogMaxRows()
  });

  const usefulRows = [...persistentRows, ...recentDiscordCodexRows].filter(discordContextRowIsUseful);
  return selectNearbyDiscordContextRows(usefulRows, {
    channelId,
    anchorTime,
    windowMs,
    limit,
    excludeIds: [...activeIds]
  });
}

async function discordCodexJobRecordExists(jobId) {
  if (!jobId) {
    return false;
  }

  const dirs = discordCodexWorkerRecordDirs();

  for (const dir of dirs) {
    try {
      await access(path.join(dir, `${jobId}.json`));
      return true;
    } catch {}
  }
  return false;
}

async function discordCodexMessageRecordExists(message) {
  if (!message?.id) {
    return false;
  }

  const exactJob = buildDiscordCodexWorkerJob(message);
  if (await discordCodexJobRecordExists(exactJob.id)) {
    return true;
  }

  const dirs = discordCodexWorkerRecordDirs();

  for (const dir of dirs) {
    let names = [];
    try {
      names = await readdir(dir);
    } catch {
      continue;
    }

    for (const name of names) {
      if (!name.endsWith('.json')) {
        continue;
      }
      try {
        const job = JSON.parse(await readFile(path.join(dir, name), 'utf8'));
        if (discordJobContainsMessage(job, message)) {
          return true;
        }
      } catch {}
    }
  }

  return false;
}

async function enqueueDiscordCodexMessage(message, { acknowledge = true, catchup = false } = {}) {
  let files = [];
  try {
    files = await materializeDiscordAttachments(message, {
      contextDir: discordFileContextDir,
      maxBytes: discordAttachmentDownloadMaxBytes
    });
  } catch (error) {
    rememberDiscordCodexError('attachment-download', error);
    throw error;
  }
  const row = buildDiscordMessageRow(message, { files });
  await persistDiscordCodexRows([row]);

  if (catchup) {
    const job = buildDiscordCodexWorkerJob(message, {
      messageRows: [row],
      nearbyRows: await recentDiscordCodexContextRows(message, [row])
    });
    if (await discordCodexMessageRecordExists(message)) {
      return { queued: false, duplicate: true };
    }
    const result = await enqueueDiscordCodexWorkerJob(discordCodexWorkerJobDir, job);
    if (result.queued) {
      discordCodexMessageCount += 1;
      discordCodexLastMessageAt = new Date().toISOString();
      if (acknowledge) {
        await message.channel?.send?.({
          content: "I caught this after restart. I'll work on it.",
          allowedMentions: { parse: [] }
        }).catch(() => {});
      }
    }
    return result;
  }

  const result = scheduleDiscordCodexWorkerJob(message, row);
  if (result.first) {
    discordCodexMessageCount += 1;
    discordCodexLastMessageAt = new Date().toISOString();
    if (acknowledge) {
      await message.channel.send({
        content: randomWorkingMessage(),
        allowedMentions: { parse: [] }
      });
    }
  }
  await result.promise;
  return result;
}

async function enqueueDiscordCodexMessageBurst(
  messages,
  { acknowledge = true, catchup = false, sourceMessageId = '' } = {}
) {
  const rows = [];
  for (const message of messages) {
    let files = [];
    try {
      files = await materializeDiscordAttachments(message, {
        contextDir: discordFileContextDir,
        maxBytes: discordAttachmentDownloadMaxBytes
      });
    } catch (error) {
      rememberDiscordCodexError('attachment-download', error);
      throw error;
    }
    rows.push(buildDiscordMessageRow(message, { files }));
  }
  rows.forEach(rememberDiscordCodexRow);
  await persistDiscordCodexRows(rows);

  const sourceMessage = messages.at(-1);
  const job = buildDiscordCodexWorkerJob(sourceMessage, {
    messageRows: rows,
    sourceMessageId,
    nearbyRows: await recentDiscordCodexContextRows(sourceMessage, rows)
  });
  const result = await enqueueDiscordCodexWorkerJob(discordCodexWorkerJobDir, job);
  if (result.queued) {
    discordCodexMessageCount += messages.length;
    discordCodexLastMessageAt = new Date().toISOString();
    if (acknowledge) {
      const content = catchup && messages.length > 1
        ? "I caught these after restart. I'll work on them together."
        : "I caught this after restart. I'll work on it.";
      await sourceMessage.channel?.send?.({
        content,
        allowedMentions: { parse: [] }
      }).catch(() => {});
    }
  }
  return result;
}

async function catchUpDiscordCodexChannel() {
  if (!discordCodexChannelId || !discordMessageContentIntentRequested) {
    return;
  }

  try {
    const catchupWindowMs = Number.isFinite(discordCodexCatchupWindowMs) && discordCodexCatchupWindowMs > 0
      ? discordCodexCatchupWindowMs
      : DEFAULT_DISCORD_CODEX_CATCHUP_WINDOW_MS;
    const catchupBurstGapMs = Number.isFinite(discordCodexWorkerDebounceMs) && discordCodexWorkerDebounceMs > 0
      ? Math.max(discordCodexWorkerDebounceMs, DEFAULT_DISCORD_CODEX_BURST_GAP_MS)
      : DEFAULT_DISCORD_CODEX_BURST_GAP_MS;
    const channel = await client.channels.fetch(discordCodexChannelId);
    if (!channel?.messages?.fetch) {
      return;
    }
    const catchupLimit = normalizedDiscordCatchupLimit();
    const backfillLimit = normalizedDiscordContextBackfillLimit();
    const messages = await channel.messages.fetch({
      limit: Math.max(catchupLimit, backfillLimit)
    });
    await rememberDiscordCodexFetchedContext(messages);
    const catchupMessages = [...(messages?.values?.() || [])]
      .sort((left, right) => Number(left?.createdTimestamp || 0) - Number(right?.createdTimestamp || 0))
      .slice(-catchupLimit);
    const plan = await planDiscordCodexCatchupBursts(catchupMessages, {
      channelId: discordCodexChannelId,
      windowMs: catchupWindowMs,
      gapMs: catchupBurstGapMs,
      handled: discordCodexMessageRecordExists
    });
    discordCodexLastCatchup = {
      at: new Date().toISOString(),
      scannedBursts: plan.scannedBursts,
      queuedBursts: plan.queuedBursts,
      skippedHandledBursts: plan.skippedHandledBursts,
      partialBursts: plan.partialBursts,
      handledMessages: plan.handledMessages,
      contextBackfilledMessages: messages.size ?? messages.length ?? 0,
      catchupMessages: catchupMessages.length
    };
    for (const entry of plan.entries) {
      await enqueueDiscordCodexMessageBurst(entry.messages, {
        catchup: true,
        sourceMessageId: entry.sourceMessageId
      });
    }
  } catch (error) {
    rememberDiscordCodexError('catch-up', error);
    console.error('Discord Codex catch-up failed:', error);
  }
}

function scheduleDiscordCodexWorkerJob(message, row) {
  const delayMs =
    Number.isFinite(discordCodexWorkerDebounceMs) && discordCodexWorkerDebounceMs > 0
      ? discordCodexWorkerDebounceMs
      : 0;
  if (delayMs <= 0) {
    const promise = (async () =>
      enqueueDiscordCodexWorkerJob(
        discordCodexWorkerJobDir,
        buildDiscordCodexWorkerJob(message, {
          messageRows: row ? [row] : [],
          nearbyRows: await recentDiscordCodexContextRows(message, row ? [row] : [])
        })
      ))();
    return {
      first: true,
      promise
    };
  }

  const key = pendingDiscordJobKey(message);
  let pending = pendingDiscordCodexJobs.get(key);
  const first = !pending;
  if (!pending) {
    pending = {
      message,
      rows: [],
      timer: null,
      resolve: null,
      reject: null,
      promise: null
    };
    pending.promise = new Promise((resolve, reject) => {
      pending.resolve = resolve;
      pending.reject = reject;
    });
    pendingDiscordCodexJobs.set(key, pending);
  }

  pending.message = message;
  if (row) {
    pending.rows.push(row);
  }
  if (pending.timer) {
    clearTimeout(pending.timer);
  }

  pending.timer = setTimeout(() => {
    pendingDiscordCodexJobs.delete(key);
    (async () => {
      const result = await enqueueDiscordCodexWorkerJob(
        discordCodexWorkerJobDir,
        buildDiscordCodexWorkerJob(pending.message, {
          messageRows: pending.rows,
          nearbyRows: await recentDiscordCodexContextRows(pending.message, pending.rows)
        })
      );
      pending.resolve?.(result);
    })().catch((error) => {
      pending.reject?.(error);
      rememberDiscordCodexError('enqueue', error);
      console.error('Discord Codex channel enqueue failed:', error);
      pending.message?.channel?.send?.({
        content: 'I could not start that yet. I saved the error in the server logs.',
        allowedMentions: { parse: [] }
      }).catch(() => {});
    });
  }, delayMs);
  pending.timer.unref?.();

  return { first, promise: pending.promise };
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
  catchUpDiscordCodexChannel();
});

client.on(Events.MessageCreate, async (message) => {
  if (message?.author?.bot && message?.channelId === discordCodexChannelId) {
    await rememberDiscordCodexMessageContext(message).catch((error) => {
      rememberDiscordCodexError('context-message', error);
    });
  }

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

  if (!shouldHandleDiscordCodexMessage(message, discordCodexChannelId)) {
    return;
  }

  try {
    await enqueueDiscordCodexMessage(message);
  } catch (error) {
    rememberDiscordCodexError('message-create', error);
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
