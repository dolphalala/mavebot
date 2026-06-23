import 'dotenv/config';
import crypto from 'node:crypto';
import { mkdir, readFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';

const signingSecret = process.env.SLACK_SIGNING_SECRET || '';
const botToken = process.env.SLACK_BOT_TOKEN || '';
const appToken = process.env.SLACK_APP_TOKEN || '';
const channelId = process.env.SLACK_CHANNEL_ID || '';
const host = process.env.SLACK_BRIDGE_HOST || '0.0.0.0';
const port = Number.parseInt(process.env.SLACK_BRIDGE_PORT || '4190', 10);
const eventPath = process.env.SLACK_BRIDGE_EVENT_PATH || '/slack/events';
const socketMode =
  process.env.SLACK_SOCKET_MODE === '1' ||
  (Boolean(appToken) && process.env.SLACK_SOCKET_MODE !== '0');
const memoryPath =
  process.env.SLACK_MEMORY_PATH || '/shared/slack-memory.jsonl';
const contextPath =
  process.env.SLACK_CONTEXT_PATH || '/app/docs/context/operating-memory.md';
const autoReply = process.env.SLACK_BRIDGE_AUTOREPLY === '1';

let messageCount = 0;
let lastEventAt = null;
let socketConnected = false;
let socketLastConnectedAt = null;
let socketReconnects = 0;
let contextReadable = false;

function hasSlackConfig() {
  if (socketMode) {
    return Boolean(appToken && channelId);
  }

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
    const context = await readFile(contextPath, 'utf8');
    contextReadable = true;
    return context;
  } catch {
    contextReadable = false;
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
  if (!event || !['message', 'app_mention'].includes(event.type)) {
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

async function openSocketUrl() {
  const response = await fetch('https://slack.com/api/apps.connections.open', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${appToken}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  const result = await response.json();
  if (!result.ok || !result.url) {
    throw new Error(
      `apps.connections.open failed: ${result.error || 'missing url'}`
    );
  }

  return result.url;
}

async function socketDataToText(data) {
  if (typeof data === 'string') {
    return data;
  }

  if (Buffer.isBuffer(data)) {
    return data.toString('utf8');
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }

  if (data && typeof data.text === 'function') {
    return data.text();
  }

  return String(data);
}

function acknowledgeSocketEnvelope(socket, envelope) {
  if (!envelope.envelope_id || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify({ envelope_id: envelope.envelope_id }));
}

async function handleSocketMessage(socket, data) {
  const envelope = JSON.parse(await socketDataToText(data));

  if (envelope.type === 'disconnect') {
    console.log(`Slack Socket Mode disconnect: ${envelope.reason || 'unknown'}`);
    socket.close();
    return;
  }

  acknowledgeSocketEnvelope(socket, envelope);

  if (envelope.type === 'events_api' && envelope.payload) {
    await handleSlackEvent(envelope.payload);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSocketMode() {
  if (!appToken) {
    console.log('SLACK_APP_TOKEN is missing; Socket Mode is disabled.');
    return;
  }

  let retryDelayMs = 1000;

  for (;;) {
    try {
      const socketUrl = await openSocketUrl();

      await new Promise((resolve) => {
        const socket = new WebSocket(socketUrl);

        socket.addEventListener('open', () => {
          socketConnected = true;
          socketLastConnectedAt = new Date().toISOString();
          retryDelayMs = 1000;
          console.log('Slack Socket Mode connected.');
        });

        socket.addEventListener('message', (event) => {
          void handleSocketMessage(socket, event.data).catch((error) => {
            console.error('Slack Socket Mode message failed:', error);
          });
        });

        socket.addEventListener('close', () => {
          socketConnected = false;
          socketReconnects += 1;
          resolve();
        });

        socket.addEventListener('error', (error) => {
          socketConnected = false;
          console.error('Slack Socket Mode socket error:', error.message);
          socket.close();
        });
      });
    } catch (error) {
      socketConnected = false;
      socketReconnects += 1;
      console.error('Slack Socket Mode connection failed:', error.message);
    }

    await sleep(retryDelayMs);
    retryDelayMs = Math.min(retryDelayMs * 2, 30000);
  }
}

const app = express();

app.get('/healthz', async (_req, res) => {
  await readContext();

  res.status(hasSlackConfig() ? 200 : 503).json({
    ok: hasSlackConfig(),
    channelIdConfigured: Boolean(channelId),
    signingSecretConfigured: Boolean(signingSecret),
    appTokenConfigured: Boolean(appToken),
    botTokenConfigured: Boolean(botToken),
    socketMode,
    socketConnected,
    socketLastConnectedAt,
    socketReconnects,
    contextReadable,
    contextPath,
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
    console.log(
      'Slack bridge is waiting for Slack config. HTTP mode needs SLACK_SIGNING_SECRET and SLACK_CHANNEL_ID; Socket Mode needs SLACK_APP_TOKEN and SLACK_CHANNEL_ID.'
    );
  }

  if (socketMode) {
    void runSocketMode();
  }
});
