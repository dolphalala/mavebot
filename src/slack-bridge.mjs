import 'dotenv/config';
import crypto from 'node:crypto';
import { mkdir, readFile, appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';

const signingSecret = process.env.SLACK_SIGNING_SECRET || '';
const clientId = process.env.SLACK_CLIENT_ID || '';
const clientSecret = process.env.SLACK_CLIENT_SECRET || '';
const botToken = process.env.SLACK_BOT_TOKEN || '';
const appToken = process.env.SLACK_APP_TOKEN || '';
const channelId = process.env.SLACK_CHANNEL_ID || '';
const codexTriggerChannelId = process.env.SLACK_CODEX_TRIGGER_CHANNEL_ID || channelId;
const host = process.env.SLACK_BRIDGE_HOST || '0.0.0.0';
const port = Number.parseInt(process.env.SLACK_BRIDGE_PORT || '4190', 10);
const eventPath = process.env.SLACK_BRIDGE_EVENT_PATH || '/slack/events';
const oauthStartPath =
  process.env.SLACK_OAUTH_START_PATH || '/mavebot/slack/oauth/start';
const oauthCallbackPath =
  process.env.SLACK_OAUTH_CALLBACK_PATH || '/mavebot/slack/oauth/callback';
const socketMode =
  process.env.SLACK_SOCKET_MODE === '1' ||
  (Boolean(appToken) && process.env.SLACK_SOCKET_MODE !== '0');
const memoryPath =
  process.env.SLACK_MEMORY_PATH || '/shared/slack-memory.jsonl';
const userTokenPath =
  process.env.SLACK_USER_TOKEN_PATH || '/shared/slack-user-tokens.json';
const contextPath =
  process.env.SLACK_CONTEXT_PATH || '/app/docs/context/operating-memory.md';
const codexStatePath =
  process.env.SLACK_CODEX_STATE_PATH || '/shared/codex-forward-state.json';
const autoReply = process.env.SLACK_BRIDGE_AUTOREPLY === '1';
const codexForward = process.env.SLACK_CODEX_FORWARD === '1';
const codexMirrorReplies = process.env.SLACK_CODEX_MIRROR_REPLIES !== '0';
const codexForwardInThread = process.env.SLACK_CODEX_FORWARD_IN_THREAD !== '0';
const codexDeleteForward = process.env.SLACK_CODEX_DELETE_FORWARD === '1';
const codexTriggerInBotChannel = codexTriggerChannelId === channelId;
const codexDeleteForwardDelayMs = Number.parseInt(
  process.env.SLACK_CODEX_DELETE_FORWARD_DELAY_MS || (codexTriggerInBotChannel ? '250' : '5000'),
  10
);
const codexUserId = process.env.SLACK_CODEX_USER_ID || '';
const codexEnvironment = process.env.SLACK_CODEX_ENVIRONMENT || 'mavebot';
const codexRepository = process.env.SLACK_CODEX_REPOSITORY || 'dolphalala/mavebot';
const codexMemoryLimit = Number.parseInt(
  process.env.SLACK_CODEX_MEMORY_LIMIT || '30',
  10
);
const oauthRedirectUri = process.env.SLACK_OAUTH_REDIRECT_URI || '';
const userScopes =
  process.env.SLACK_USER_SCOPES || 'chat:write';

const workingMessages = [
  'On it. I will bring it back here.',
  'I am on it. Tiny heart engine running.',
  'Got it. I am checking the repo now.',
  'Working on it for you now.',
  'I will check this and come right back.',
  'On it. Keeping everything right here in #bot.',
  'I am looking now. Soft little focus mode.',
  'Got you. I will make this feel like a real session.'
];

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

async function readBridgeState() {
  try {
    return JSON.parse(await readFile(codexStatePath, 'utf8'));
  } catch {
    return { forwarded: {} };
  }
}

async function writeBridgeState(state) {
  await mkdir(path.dirname(codexStatePath), { recursive: true });
  await writeFile(codexStatePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function oauthStateSecret() {
  return signingSecret || clientSecret || botToken || appToken;
}

function signStatePayload(encodedPayload) {
  return crypto
    .createHmac('sha256', oauthStateSecret())
    .update(encodedPayload)
    .digest('base64url');
}

function createOAuthState({ userId, teamId }) {
  const payload = base64UrlEncode(
    JSON.stringify({
      userId,
      teamId,
      ts: Date.now(),
      nonce: crypto.randomBytes(12).toString('hex')
    })
  );
  return `${payload}.${signStatePayload(payload)}`;
}

function parseOAuthState(state) {
  const [payload, signature] = String(state || '').split('.');
  if (!payload || !signature) {
    throw new Error('missing OAuth state');
  }

  const expected = signStatePayload(payload);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (
    expectedBuffer.length !== actualBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new Error('invalid OAuth state signature');
  }

  const parsed = JSON.parse(base64UrlDecode(payload));
  if (Date.now() - parsed.ts > 10 * 60 * 1000) {
    throw new Error('OAuth state expired');
  }

  return parsed;
}

async function readUserTokens() {
  try {
    const parsed = JSON.parse(await readFile(userTokenPath, 'utf8'));
    parsed.users ||= {};
    return parsed;
  } catch {
    return { users: {} };
  }
}

async function writeUserTokens(tokens) {
  await mkdir(path.dirname(userTokenPath), { recursive: true });
  await writeFile(userTokenPath, `${JSON.stringify(tokens, null, 2)}\n`, 'utf8');
}

async function getUserToken(userId) {
  const tokens = await readUserTokens();
  const entry = tokens.users?.[userId];
  return entry?.accessToken || '';
}

async function saveUserToken({ userId, teamId, accessToken, scopes }) {
  const tokens = await readUserTokens();
  tokens.users ||= {};
  tokens.users[userId] = {
    accessToken,
    teamId,
    scopes,
    authedAt: new Date().toISOString()
  };
  await writeUserTokens(tokens);
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

async function readRecentMemory(limit = codexMemoryLimit) {
  if (!Number.isFinite(limit) || limit <= 0) {
    return [];
  }

  try {
    const content = await readFile(memoryPath, 'utf8');
    return content
      .split('\n')
      .filter(Boolean)
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function postSlackApi({ method, token = botToken, body }) {
  if (!token) {
    console.log(`${method} skipped because a Slack token is missing.`);
    return null;
  }

  const response = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(body)
  });

  const result = await response.json();
  if (!result.ok) {
    console.error(`${method} failed:`, result.error);
    return null;
  }

  return result;
}

async function postMessage({ text, threadTs, token = botToken, channel = channelId, blocks }) {
  if (!token) {
    console.log('Slack token is missing; memory saved without Slack reply.');
    return null;
  }

  return postSlackApi({
    method: 'chat.postMessage',
    token,
    body: {
      channel,
      text,
      ...(blocks ? { blocks } : {}),
      unfurl_links: false,
      unfurl_media: false,
      ...(threadTs ? { thread_ts: threadTs } : {})
    }
  });
}

async function deleteMessage({ ts, token = botToken, channel = channelId }) {
  return postSlackApi({
    method: 'chat.delete',
    token,
    body: {
      channel,
      ts
    }
  });
}

function scheduleForwardDelete({ ts, token, channel = channelId }) {
  if (!codexDeleteForward || !ts || !token) {
    return;
  }

  const delayMs =
    Number.isFinite(codexDeleteForwardDelayMs) && codexDeleteForwardDelayMs >= 0
      ? codexDeleteForwardDelayMs
      : 5000;

  const timer = setTimeout(() => {
    deleteMessage({ ts, token, channel }).catch((error) => {
      console.error('Failed to delete Codex forwarding message:', error);
    });
  }, delayMs);
  timer.unref?.();
}

async function postEphemeral({ text, user, threadTs }) {
  return postSlackApi({
    method: 'chat.postEphemeral',
    body: {
      channel: channelId,
      user,
      text,
      ...(threadTs ? { thread_ts: threadTs } : {})
    }
  });
}

async function buildCodexPrompt(event) {
  const recentMemory = await readRecentMemory();
  const memoryLines = recentMemory
    .map((row) => {
      const speaker = row.user === event.user ? 'current user' : row.user || 'unknown';
      return `- ${row.receivedAt || row.ts || 'unknown time'} ${speaker}: ${row.text || ''}`;
    })
    .filter(Boolean);

  const parts = [
    `<@${codexUserId}>`,
    `Use the Codex cloud environment "${codexEnvironment}" for repository "${codexRepository}".`,
    `This came from Slack user <@${event.user}> in the #bot channel through mavebot, so they did not type @Codex directly.`,
    '',
    'Mavebot Slack session contract:',
    '- Treat this as one turn in the persistent #bot Slack session, even if Codex cloud starts a new task for each Slack mention.',
    '- Read docs/context/operating-memory.md first for stable project facts.',
    '- Read docs/context/slack-session.md next for durable channel memory, current goals, decisions, and open threads.',
    '- If the user asks to reset, start over, or create a new session, add a new dated section in docs/context/slack-session.md and use that as the active context.',
    '- Otherwise keep continuity by appending durable facts, decisions, and next steps to docs/context/slack-session.md whenever the turn changes what future Codex runs should know.',
    '- If code changes are needed, work in the connected GitHub repo so the server auto-deploy path can pick it up.',
    '- Reply for Slack as mavebot: direct, helpful, no ChatGPT promo text, no task links, no need to explain this bridge unless asked.',
    ''
  ];

  if (memoryLines.length > 0) {
    parts.push('Recent #bot memory:', ...memoryLines, '');
  }

  parts.push(
    `User <@${event.user}> said: ${event.text || ''}`
  );

  return parts.join('\n');
}

function buildOAuthAuthorizeUrl(event) {
  if (!clientId || !oauthRedirectUri || !oauthStateSecret()) {
    return '';
  }

  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('user_scope', userScopes);
  url.searchParams.set('redirect_uri', oauthRedirectUri);
  url.searchParams.set(
    'state',
    createOAuthState({ userId: event.user, teamId: event.team })
  );
  if (event.team) {
    url.searchParams.set('team', event.team);
  }
  return url.toString();
}

function buildVisibleForwardBlocks(text) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text
      }
    }
  ];
}

async function askUserToAuthorize(event) {
  const authorizeUrl = buildOAuthAuthorizeUrl(event);
  const text = authorizeUrl
    ? `<@${event.user}> I got your message. To forward #bot messages to Codex as you, authorize mavebot once: ${authorizeUrl}`
    : `<@${event.user}> I got your message and saved it, but I cannot forward it to Codex yet. Slack requires each user to authorize mavebot before it can post the @Codex forwarding message as that user. No Slack OAuth redirect URL is configured right now.`;

  await postMessage({ text });
}

async function forwardToCodex(event) {
  if (!codexUserId) {
    await postMessage({
      text: 'Codex forwarding is enabled, but SLACK_CODEX_USER_ID is not configured.'
    });
    return;
  }

  const userToken = await getUserToken(event.user);
  if (!userToken) {
    await askUserToAuthorize(event);
    return;
  }

  const parentThreadTs = event.thread_ts || event.ts;
  const forwardThreadTs = codexForwardInThread ? parentThreadTs : undefined;
  const workingText = randomWorkingMessage();
  const result = await postMessage({
    text: await buildCodexPrompt(event),
    threadTs: forwardThreadTs,
    token: userToken,
    channel: codexTriggerChannelId,
    blocks: buildVisibleForwardBlocks(workingText)
  });
  if (!result?.ts) {
    return;
  }

  const state = await readBridgeState();
  state.forwarded ||= {};
  const forwarded = {
    sourceTs: event.ts,
    sourceUser: event.user,
    sourceText: event.text || '',
    triggerChannel: codexTriggerChannelId,
    statusAckedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };
  state.forwarded[result.ts] = forwarded;
  if (forwardThreadTs) {
    state.forwarded[forwardThreadTs] = forwarded;
  }
  await writeBridgeState(state);
  scheduleForwardDelete({ ts: result.ts, token: userToken, channel: codexTriggerChannelId });
  await postMessage({ text: workingText });
}

function randomWorkingMessage() {
  return workingMessages[crypto.randomInt(workingMessages.length)];
}

function cleanCodexMirrorText(text) {
  return String(text || '')
    .replace(/<https:\/\/chatgpt\.com\/codex\/[^>|]+(?:\|[^>]+)?>/g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return true;
      }

      return !(
        trimmed === 'View task' ||
        trimmed === 'Show more' ||
        trimmed.startsWith('ChatGPT helps you get answers,') ||
        /^Wrong .*environment.*Tag me again mentioning the right one\.?$/i.test(trimmed) ||
        /^On it\. Kicked off a task in the .* environment\.?$/i.test(trimmed) ||
        /^Use mavebot environment for deployment$/i.test(trimmed) ||
        /^Today at .+ Added by /i.test(trimmed) ||
        /https:\/\/chatgpt\.com\/codex\//i.test(trimmed)
      );
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isCodexKickoffStatus(text) {
  return String(text || '').trim().startsWith('On it. Kicked off a task in the');
}

function isCodexStatusNoise(text) {
  const trimmed = String(text || '').trim();
  return (
    !cleanCodexMirrorText(trimmed) ||
    isCodexKickoffStatus(trimmed) ||
    /^Wrong .*environment.*Tag me again mentioning the right one\.?$/i.test(trimmed)
  );
}

async function mirrorCodexReply(event) {
  if (!codexMirrorReplies || event.user !== codexUserId || !event.thread_ts) {
    return false;
  }

  const state = await readBridgeState();
  const forwarded = state.forwarded?.[event.thread_ts];
  if (!forwarded) {
    return false;
  }

  if (isCodexKickoffStatus(event.text)) {
    if (!forwarded.statusAckedAt) {
      const acked = { ...forwarded, statusAckedAt: new Date().toISOString() };
      state.forwarded[event.thread_ts] = acked;
      await writeBridgeState(state);
      await postMessage({ text: randomWorkingMessage() });
    }
    return true;
  }

  if (isCodexStatusNoise(event.text)) {
    return true;
  }

  const text = cleanCodexMirrorText(event.text);
  await postMessage({ text });
  return true;
}

function isBridgeForward(event) {
  const text = event.text || '';
  return (
    text.startsWith(`<@${codexUserId}>`) &&
    text.includes('through mavebot')
  );
}

async function handleSlackEvent(payload) {
  const event = payload.event;
  if (!event || !['message', 'app_mention'].includes(event.type)) {
    return;
  }
  event.team ||= payload.team_id;

  const isBotChannel = event.channel === channelId;
  const isCodexTriggerChannel = event.channel === codexTriggerChannelId;
  if (!isBotChannel && !isCodexTriggerChannel) {
    return;
  }

  if (await mirrorCodexReply(event)) {
    return;
  }

  if (!isBotChannel) {
    return;
  }

  if (isBridgeForward(event)) {
    return;
  }

  if (event.bot_id || event.subtype) {
    return;
  }

  await rememberMessage(payload, event);

  if (codexForward) {
    await forwardToCodex(event);
    return;
  }

  if (autoReply) {
    const context = await readContext();
    const contextHint = context
      ? 'I saved this to mavebot memory. The coding runner is not wired yet.'
      : 'I saved this message, but repo context was not readable.';
    await postMessage({ text: contextHint });
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function exchangeOAuthCode(code) {
  const response = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      code,
      redirect_uri: oauthRedirectUri
    })
  });

  return response.json();
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

app.get(oauthStartPath, (req, res) => {
  const user = String(req.query.user || '');
  const team = String(req.query.team || '');
  if (!user) {
    res.status(400).send('missing user\n');
    return;
  }

  const authorizeUrl = buildOAuthAuthorizeUrl({ user, team });
  if (!authorizeUrl) {
    res.status(503).send('Slack OAuth is not configured.\n');
    return;
  }

  res.redirect(authorizeUrl);
});

app.get(oauthCallbackPath, async (req, res) => {
  try {
    if (!clientId || !clientSecret || !oauthRedirectUri) {
      res.status(503).send('Slack OAuth is not configured.\n');
      return;
    }

    const code = String(req.query.code || '');
    if (!code) {
      res.status(400).send('missing OAuth code\n');
      return;
    }

    const state = parseOAuthState(req.query.state);
    const result = await exchangeOAuthCode(code);
    if (!result.ok) {
      throw new Error(result.error || 'oauth.v2.access failed');
    }

    const authedUser = result.authed_user || {};
    if (!authedUser.id || authedUser.id !== state.userId) {
      throw new Error('Slack authorized user did not match the requesting user');
    }

    const teamId = result.team?.id || state.teamId || '';
    if (state.teamId && teamId && teamId !== state.teamId) {
      throw new Error('Slack authorized team did not match the requesting team');
    }

    if (!authedUser.access_token) {
      throw new Error('Slack did not return a user access token');
    }

    await saveUserToken({
      userId: authedUser.id,
      teamId,
      accessToken: authedUser.access_token,
      scopes: authedUser.scope || result.scope || userScopes
    });

    res.type('html').send(
      '<!doctype html><meta charset="utf-8"><title>mavebot connected</title>' +
        '<body style="font-family: system-ui, sans-serif; margin: 2rem;">' +
        '<h1>mavebot is connected</h1>' +
        '<p>You can close this tab and go back to Slack. Your normal messages in #bot can now be forwarded to Codex as you.</p>' +
        '</body>'
    );
  } catch (error) {
    res.status(400).type('html').send(
      '<!doctype html><meta charset="utf-8"><title>mavebot connection failed</title>' +
        '<body style="font-family: system-ui, sans-serif; margin: 2rem;">' +
        '<h1>mavebot connection failed</h1>' +
        `<p>${escapeHtml(error.message)}</p>` +
        '</body>'
    );
  }
});

app.get('/healthz', async (_req, res) => {
  await readContext();
  const userTokens = await readUserTokens();

  res.status(hasSlackConfig() ? 200 : 503).json({
    ok: hasSlackConfig(),
    channelIdConfigured: Boolean(channelId),
    codexTriggerChannelIdConfigured: Boolean(codexTriggerChannelId),
    codexTriggerChannelMatchesBot: codexTriggerInBotChannel,
    signingSecretConfigured: Boolean(signingSecret),
    clientIdConfigured: Boolean(clientId),
    clientSecretConfigured: Boolean(clientSecret),
    appTokenConfigured: Boolean(appToken),
    botTokenConfigured: Boolean(botToken),
    oauthRedirectConfigured: Boolean(oauthRedirectUri),
    oauthStartPath,
    oauthCallbackPath,
    userScopes,
    userTokenCount: Object.keys(userTokens.users || {}).length,
    socketMode,
    socketConnected,
    socketLastConnectedAt,
    socketReconnects,
    contextReadable,
    contextPath,
    autoReply,
    codexForward,
    codexMirrorReplies,
    codexForwardInThread,
    codexDeleteForward,
    codexDeleteForwardDelayMs,
    codexMemoryLimit,
    codexUserIdConfigured: Boolean(codexUserId),
    codexEnvironment,
    codexRepository,
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
