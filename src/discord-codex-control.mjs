import crypto from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_DISCORD_CODEX_JOB_DIR = '/shared/codex-worker/jobs';

const workingMessages = [
  'On it.',
  'Got it, checking now.',
  'I am looking.',
  'Working on it.',
  'I will handle it.'
];
export const DISCORD_MESSAGE_CONTENT_SETUP_MESSAGE =
  'Enable Message Content Intent in the Discord Developer Portal for mavebot, save it, then restart the bot so I can read normal messages in #codex.';

function safeIdPart(value) {
  return String(value || 'missing')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 96);
}

export function randomWorkingMessage(randomInt = crypto.randomInt) {
  return workingMessages[randomInt(workingMessages.length)];
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

export function discordMessageToWorkerText(message) {
  const text = String(message?.content || '').trim();
  const attachments = [...(message?.attachments?.values?.() || [])]
    .map((attachment) => {
      const name = attachment.name || attachment.filename || 'attachment';
      return `[attachment: ${name}] ${attachment.url}`;
    })
    .filter(Boolean);

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

export function buildDiscordCodexWorkerJob(message, { createdAt = new Date().toISOString() } = {}) {
  const sourceTs = message?.id || String(Date.now());
  return {
    id: [safeIdPart(message?.channelId || 'discord'), safeIdPart(sourceTs)].join('-'),
    source: 'discord',
    createdAt,
    teamId: '',
    guildId: message?.guildId || '',
    channel: message?.channelId || '',
    user: message?.author?.id || '',
    username: message?.author?.tag || message?.author?.username || '',
    ts: message?.createdTimestamp
      ? new Date(message.createdTimestamp).toISOString()
      : sourceTs,
    threadTs: '',
    text: discordMessageToWorkerText(message)
  };
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
