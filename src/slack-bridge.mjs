import 'dotenv/config';
import crypto from 'node:crypto';
import { mkdir, readFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';

const signingSecret = process.env.SLACK_SIGNING_SECRET || '';
const botToken = process.env.SLACK_BOT_TOKEN || '';
const channelId = process.env.SLACK_CHANNEL_ID || '';
const host = process.env.SLACK_BRIDGE_HOST || '0.0.0.0';
const port = Number.parseInt(process.env.SLACK_BRIDGE_PORT || '4190', 10);
const eventPath = process.env.SLACK_BRIDGE_EVENT_PATH || '/slack/events';
const memoryPath =
  process.env.SLACK_MEMORY_PATH || '/shared/slack-memory.jsonl';
const contextPath =
  process.env.SLACK_CONTEXT_PATH || '/app/docs/context/operating-memory.md';
const autoReply = process.env.SLACK_BRIDGE_AUTOREPLY === '1';

let messageCount = 0;
let lastEventAt = null;

function hasSlackConfig() {
  return Boolean(signingSecret && channelId);
}

function verifySlackRequest(req, body) {
  if (!signingSecret) {
    return false;
  }

  const timestamp = req.header('x-slack-request-timestamp');
  const signature = req.header('x-slack-signature');
  if (!timestamp || !signature) {
    return false;
  }

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) {
    return false;
  }

  const baseString = `v0:${timestamp}:${body.toString('utf8')}`;
  const expected = `v0=${crypto
    .createHmac('sha256', signingSecret)
    .update(baseString)
    .digest('hex')}`;

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

async function readContext() {
  try {
    return await readFile(contextPath, 'utf8');
  } catch {
    return '';
  }
}

async function rememberMessage(payload, event) {
  await mkdir(path.dirname(memoryPath), { recursive: true });
  const row = {
    receivedAt: new Date().toISOString(),
    teamId: payload.team_id,
    channel: event.channel,
    user: event.user,
    ts: event.ts,
    threadTs: event.thread_ts,
    text: event.text || ''
  };
  await appendFile(memoryPath, `${JSON.stringify(row)}\n`, 'utf8');
  messageCount += 1;
  lastEventAt = row.receivedAt;
}

async function postMessage(text) {
  if (!botToken) {
    console.log('SLACK_BOT_TOKEN is missing; memory saved without Slack reply.');
    return;
  }

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({
      channel: channelId,
      text
    })
  });

  const result = await response.json();
  if (!result.ok) {
    console.error('chat.postMessage failed:', result.error);
  }
}

async function handleSlackEvent(payload) {
  const event = payload.event;
  if (!event || event.type !== 'message') {
    return;
  }

  if (event.channel !== channelId) {
    return;
  }

  if (event.bot_id || event.subtype) {
    return;
  }

  await rememberMessage(payload, event);

  if (autoReply) {
    const context = await readContext();
    const contextHint = context
      ? 'I saved this to mavebot memory. The coding runner is not wired yet.'
      : 'I saved this message, but repo context was not readable.';
    await postMessage(contextHint);
  }
}

const app = express();

app.get('/healthz', (_req, res) => {
  res.status(hasSlackConfig() ? 200 : 503).json({
    ok: hasSlackConfig(),
    channelIdConfigured: Boolean(channelId),
    signingSecretConfigured: Boolean(signingSecret),
    botTokenConfigured: Boolean(botToken),
    autoReply,
    messageCount,
    lastEventAt
  });
});

app.post(eventPath, express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const body = req.body;
  if (!verifySlackRequest(req, body)) {
    res.status(401).send('invalid signature\n');
    return;
  }

  let payload;
  try {
    payload = JSON.parse(body.toString('utf8'));
  } catch {
    res.status(400).send('invalid json\n');
    return;
  }

  if (payload.type === 'url_verification') {
    res.type('text/plain').send(payload.challenge);
    return;
  }

  if (payload.type === 'event_callback') {
    res.status(200).send('ok\n');
    void handleSlackEvent(payload).catch((error) => {
      console.error('Slack event handler failed:', error);
    });
    return;
  }

  res.status(200).send('ignored\n');
});

app.listen(port, host, () => {
  console.log(`Slack bridge listening on ${host}:${port}${eventPath}.`);
  if (!hasSlackConfig()) {
    console.log('Slack bridge is waiting for SLACK_SIGNING_SECRET and SLACK_CHANNEL_ID.');
  }
});
