import crypto from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_DISCORD_CODEX_JOB_DIR = '/shared/codex-worker/jobs';
export const DEFAULT_DISCORD_FILE_CONTEXT_DIR = '/shared/codex-worker/context/discord-files';
export const DEFAULT_DISCORD_ATTACHMENT_DOWNLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const DEFAULT_DISCORD_CODEX_CATCHUP_WINDOW_MS = 30 * 60 * 1000;
export const DEFAULT_DISCORD_CODEX_BURST_GAP_MS = 15000;
export const DISCORD_GATEWAY_MESSAGE_CONTENT_FLAGS = {
  full: 262144,
  limited: 524288
};

export const DISCORD_CODEX_WORKING_MESSAGES = [
  "Got it, checking now.",
  "On it. I'll take a look.",
  "One sec, I'm looking.",
  "I got you. Working through it now.",
  "I'll dig into that now."
];
export const DISCORD_MESSAGE_CONTENT_SETUP_MESSAGE =
  'Enable Message Content Intent in the Discord Developer Portal for mavebot, save it, then restart the bot so I can read normal messages in #codex.';

function safeIdPart(value) {
  return String(value || 'missing')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 96);
}

function safeFileName(value, fallback = 'discord-file') {
  const cleaned = String(value || fallback)
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return cleaned || fallback;
}

export function randomWorkingMessage(randomInt = crypto.randomInt) {
  return DISCORD_CODEX_WORKING_MESSAGES[randomInt(DISCORD_CODEX_WORKING_MESSAGES.length)];
}

export function discordLiveBurstKey(message, fallbackChannelId = 'discord') {
  const channel = safeIdPart(message?.channelId || fallbackChannelId || 'discord');
  const author = safeIdPart(message?.author?.id || message?.user || 'unknown-user');
  return `${channel}:${author}`;
}

export function hasDiscordMessageContentIntentFlag(flags) {
  const value = Number(flags || 0);
  return Boolean(
    value &
      (DISCORD_GATEWAY_MESSAGE_CONTENT_FLAGS.full |
        DISCORD_GATEWAY_MESSAGE_CONTENT_FLAGS.limited)
  );
}

export function discordCodexSetupBlocker({
  channelIdConfigured,
  messageContentIntentRequested
} = {}) {
  if (!channelIdConfigured) {
    return '';
  }
  if (messageContentIntentRequested) {
    return '';
  }
  return DISCORD_MESSAGE_CONTENT_SETUP_MESSAGE;
}

function collectionValues(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value.values === 'function') {
    return [...value.values()];
  }
  return [];
}

export function discordAttachmentReferences(message) {
  return collectionValues(message?.attachments)
    .map((attachment) => {
      const name = safeFileName(
        attachment.name || attachment.filename || attachment.id || 'attachment'
      );
      return {
        id: attachment.id || '',
        name,
        mimetype: attachment.contentType || attachment.content_type || '',
        size: Number.parseInt(attachment.size || '0', 10) || 0,
        url: attachment.url || '',
        proxyUrl: attachment.proxyURL || attachment.proxy_url || ''
      };
    })
    .filter((attachment) => attachment.url || attachment.proxyUrl || attachment.id);
}

export function discordFilesToWorkerLines(files = []) {
  return (files || [])
    .map((file) => {
      const parts = [`file: ${file.name || file.id || 'attachment'}`];
      if (file.mimetype) {
        parts.push(`type: ${file.mimetype}`);
      }
      if (file.localPath) {
        parts.push(`local: ${file.localPath}`);
      }
      if (file.url) {
        parts.push(`discord: ${file.url}`);
      }
      if (file.downloadError) {
        parts.push(`download: ${file.downloadError}`);
      }
      return `[${parts.join(' | ')}]`;
    })
    .filter(Boolean);
}

export function discordMessageToWorkerText(message, { files } = {}) {
  const text = String(message?.content || '').trim();
  const attachments = Array.isArray(files)
    ? discordFilesToWorkerLines(files)
    : discordAttachmentReferences(message).map(
        (attachment) => `[attachment: ${attachment.name}] ${attachment.url || attachment.proxyUrl}`
      );

  return [text, ...attachments].filter(Boolean).join('\n').trim();
}

export function shouldHandleDiscordCodexMessage(message, channelId) {
  if (!channelId || message?.channelId !== channelId) {
    return false;
  }
  if (message?.author?.bot || message?.system || message?.webhookId) {
    return false;
  }
  return Boolean(discordMessageToWorkerText(message));
}

export async function downloadDiscordAttachment(
  attachment,
  {
    channel,
    messageId,
    index = 0,
    contextDir = DEFAULT_DISCORD_FILE_CONTEXT_DIR,
    maxBytes = DEFAULT_DISCORD_ATTACHMENT_DOWNLOAD_MAX_BYTES,
    fetchImpl = fetch
  } = {}
) {
  const reference = {
    id: attachment?.id || '',
    name: safeFileName(attachment?.name || attachment?.filename || attachment?.id || 'attachment'),
    mimetype: attachment?.mimetype || attachment?.contentType || attachment?.content_type || '',
    size: Number.parseInt(attachment?.size || '0', 10) || 0,
    url: attachment?.url || '',
    proxyUrl: attachment?.proxyUrl || attachment?.proxyURL || attachment?.proxy_url || ''
  };
  const url = reference.url || reference.proxyUrl;
  if (!url) {
    return { ...reference, downloadError: 'Discord did not provide a downloadable attachment URL.' };
  }
  if (
    Number.isFinite(maxBytes) &&
    maxBytes > 0 &&
    reference.size > maxBytes
  ) {
    return {
      ...reference,
      downloadError: `Attachment is larger than DISCORD_ATTACHMENT_DOWNLOAD_MAX_BYTES (${maxBytes}).`
    };
  }

  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      return { ...reference, downloadError: `Discord attachment download failed with HTTP ${response.status}.` };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (Number.isFinite(maxBytes) && maxBytes > 0 && buffer.length > maxBytes) {
      return {
        ...reference,
        downloadError: `Downloaded attachment is larger than DISCORD_ATTACHMENT_DOWNLOAD_MAX_BYTES (${maxBytes}).`
      };
    }
    const dir = path.join(
      contextDir,
      safeIdPart(channel || 'channel'),
      safeIdPart(messageId || 'message')
    );
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${String(index + 1).padStart(2, '0')}-${reference.name}`);
    await writeFile(filePath, buffer, { mode: 0o600 });
    await chmod(filePath, 0o600).catch(() => {});
    return { ...reference, localPath: filePath, bytes: buffer.length };
  } catch (error) {
    return { ...reference, downloadError: String(error?.message || error) };
  }
}

export async function materializeDiscordAttachments(
  message,
  {
    contextDir = DEFAULT_DISCORD_FILE_CONTEXT_DIR,
    maxBytes = DEFAULT_DISCORD_ATTACHMENT_DOWNLOAD_MAX_BYTES,
    fetchImpl = fetch
  } = {}
) {
  const attachments = discordAttachmentReferences(message);
  if (!attachments.length) {
    return [];
  }
  return Promise.all(
    attachments.map((attachment, index) =>
      downloadDiscordAttachment(attachment, {
        channel: message?.channelId,
        messageId: message?.id,
        index,
        contextDir,
        maxBytes,
        fetchImpl
      })
    )
  );
}

export function buildDiscordMessageRow(message, { files = [] } = {}) {
  return {
    receivedAt: message?.createdTimestamp
      ? new Date(message.createdTimestamp).toISOString()
      : new Date().toISOString(),
    id: message?.id || String(Date.now()),
    guildId: message?.guildId || '',
    channel: message?.channelId || '',
    user: message?.author?.id || '',
    username: message?.author?.tag || message?.author?.username || '',
    text: String(message?.content || '').trim(),
    ...(files.length ? { files } : {})
  };
}

export function recentDiscordCodexMessagesForCatchup(
  messages = [],
  {
    channelId,
    now = Date.now(),
    windowMs = DEFAULT_DISCORD_CODEX_CATCHUP_WINDOW_MS
  } = {}
) {
  const values = collectionValues(messages);
  const cutoff =
    Number.isFinite(windowMs) && windowMs > 0
      ? Number(now) - windowMs
      : Number.NEGATIVE_INFINITY;

  return values
    .filter((message) => shouldHandleDiscordCodexMessage(message, channelId))
    .filter((message) => {
      const created = Number(message?.createdTimestamp || 0);
      return Number.isFinite(created) && created >= cutoff;
    })
    .sort((left, right) => Number(left?.createdTimestamp || 0) - Number(right?.createdTimestamp || 0));
}

export function groupDiscordCodexMessageBursts(
  messages = [],
  {
    channelId,
    now = Date.now(),
    windowMs = DEFAULT_DISCORD_CODEX_CATCHUP_WINDOW_MS,
    gapMs = DEFAULT_DISCORD_CODEX_BURST_GAP_MS
  } = {}
) {
  const recentMessages = recentDiscordCodexMessagesForCatchup(messages, {
    channelId,
    now,
    windowMs
  });
  const maxGap = Number.isFinite(gapMs) && gapMs >= 0 ? gapMs : DEFAULT_DISCORD_CODEX_BURST_GAP_MS;
  const bursts = [];

  for (const message of recentMessages) {
    const previousBurst = bursts.at(-1);
    const previousMessage = previousBurst?.at(-1);
    const previousTimestamp = Number(previousMessage?.createdTimestamp || 0);
    const currentTimestamp = Number(message?.createdTimestamp || 0);
    const sameBurst =
      previousBurst &&
      Number.isFinite(previousTimestamp) &&
      Number.isFinite(currentTimestamp) &&
      currentTimestamp - previousTimestamp <= maxGap;

    if (sameBurst) {
      previousBurst.push(message);
    } else {
      bursts.push([message]);
    }
  }

  return bursts;
}

export async function planDiscordCodexCatchupBursts(
  messages = [],
  {
    channelId,
    now = Date.now(),
    windowMs = DEFAULT_DISCORD_CODEX_CATCHUP_WINDOW_MS,
    gapMs = DEFAULT_DISCORD_CODEX_BURST_GAP_MS,
    handled = async () => false
  } = {}
) {
  const bursts = groupDiscordCodexMessageBursts(messages, {
    channelId,
    now,
    windowMs,
    gapMs
  });
  const planned = [];
  let skippedHandledBursts = 0;
  let partialBursts = 0;
  let handledMessages = 0;

  for (const burst of bursts) {
    const statuses = await Promise.all(
      burst.map(async (message) => {
        try {
          return Boolean(await handled(message));
        } catch {
          return false;
        }
      })
    );
    const handledCount = statuses.filter(Boolean).length;
    handledMessages += handledCount;

    if (handledCount === burst.length) {
      skippedHandledBursts += 1;
      continue;
    }

    if (handledCount > 0) {
      partialBursts += 1;
    }

    const sourceMessage = burst.findLast((message, index) => !statuses[index]) || burst.at(-1);

    // Keep the whole partially handled burst as context. The queued job may
    // include an already-handled row, but this preserves the local-session
    // shape better than replaying the remaining rows as stale fragments.
    planned.push({
      messages: burst,
      sourceMessageId: sourceMessage?.id || ''
    });
  }

  return {
    bursts: planned.map((entry) => entry.messages),
    entries: planned,
    scannedBursts: bursts.length,
    queuedBursts: planned.length,
    skippedHandledBursts,
    partialBursts,
    handledMessages
  };
}

export function discordRowsToWorkerText(rows = []) {
  const normalizedRows = (rows || []).filter(Boolean);
  if (!normalizedRows.length) {
    return '';
  }
  if (normalizedRows.length === 1) {
    const [row] = normalizedRows;
    return [
      row.text || '',
      ...discordFilesToWorkerLines(row.files)
    ].filter(Boolean).join('\n').trim();
  }

  return normalizedRows
    .map((row) => {
      const speaker = row.username || row.user || 'unknown';
      const text = row.text || '(no text)';
      const files = discordFilesToWorkerLines(row.files);
      return [
        `[${row.receivedAt || row.id || 'unknown time'}] ${speaker}: ${text}`,
        ...files.map((line) => `  ${line}`)
      ].join('\n');
    })
    .join('\n')
    .trim();
}

export function discordRowsToContextMessages(rows = []) {
  return (rows || []).filter(Boolean).map((row) => ({
    receivedAt: row.receivedAt || '',
    id: row.id || '',
    guildId: row.guildId || '',
    channel: row.channel || '',
    user: row.user || '',
    username: row.username || '',
    text: row.text || '',
    ...(row.files?.length ? { files: row.files } : {})
  }));
}

export function buildDiscordCodexWorkerJob(
  message,
  {
    createdAt = new Date().toISOString(),
    files = [],
    messageRows = [],
    sourceMessageId = '',
    nearbyRows = []
  } = {}
) {
  const rows = messageRows.length ? messageRows : [buildDiscordMessageRow(message, { files })];
  const sourceRow =
    (sourceMessageId ? rows.find((row) => row?.id === sourceMessageId) : null) ||
    rows.at(-1) ||
    {};
  const sourceTs = sourceRow.id || message?.id || String(Date.now());
  const allFiles = rows.flatMap((row) => row?.files || []);
  const messageIds = rows.map((row) => row?.id).filter(Boolean);
  const contextMessages = discordRowsToContextMessages(rows);
  const activeMessageIds = new Set(messageIds);
  const nearbyContextRows = (nearbyRows || [])
    .filter((row) => row?.id && !activeMessageIds.has(row.id));
  const nearbyFiles = nearbyContextRows.flatMap((row) => row?.files || []);
  return {
    id: [safeIdPart(sourceRow.channel || message?.channelId || 'discord'), safeIdPart(sourceTs)].join('-'),
    source: 'discord',
    createdAt,
    teamId: '',
    guildId: sourceRow.guildId || message?.guildId || '',
    channel: sourceRow.channel || message?.channelId || '',
    user: sourceRow.user || message?.author?.id || '',
    username: sourceRow.username || message?.author?.tag || message?.author?.username || '',
    ts: sourceRow.receivedAt || sourceTs,
    threadTs: '',
    text: discordRowsToWorkerText(rows),
    messageIds,
    contextMessages,
    ...(nearbyContextRows.length
      ? {
          nearbyText: discordRowsToWorkerText(nearbyContextRows),
          nearbyContextMessages: discordRowsToContextMessages(nearbyContextRows)
        }
      : {}),
    ...(allFiles.length ? { files: allFiles } : {}),
    ...(nearbyFiles.length ? { nearbyFiles } : {})
  };
}

export function discordJobContainsMessage(job = {}, messageOrId) {
  const messageId = typeof messageOrId === 'string' ? messageOrId : messageOrId?.id;
  if (!messageId) {
    return false;
  }

  if ((job.messageIds || []).includes(messageId)) {
    return true;
  }

  if ((job.contextMessages || []).some((row) => row?.id === messageId)) {
    return true;
  }

  return String(job.id || '').endsWith(`-${safeIdPart(messageId)}`);
}

export async function enqueueDiscordCodexWorkerJob(jobDir, job) {
  await mkdir(jobDir, { recursive: true });
  const jobPath = path.join(jobDir, `${job.id}.json`);

  try {
    await writeFile(jobPath, `${JSON.stringify(job, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx'
    });
    await chmod(jobPath, 0o600).catch(() => {});
    return { job, queued: true };
  } catch (error) {
    if (error?.code === 'EEXIST') {
      return { job, queued: false };
    }
    throw error;
  }
}
