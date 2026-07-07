import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_STORE_PATH = '/shared/elder-votes.json';
export const VOTE_THRESHOLD = 3;
export const MUTE_DURATION_MS = 5 * 60 * 1000;
export const BENCHED_ROLE_NAME = 'benched';
export const BENCHED_ROLE_COLOR = 0xb7aa08;
const MAX_RECORD_LINES = 8;
let storeQueue = Promise.resolve();

async function withStoreLock(task) {
  const run = storeQueue.then(task, task);
  storeQueue = run.catch(() => {});
  return run;
}

function emptyStore() {
  return {
    version: 1,
    guilds: {}
  };
}

function emptyGuild() {
  return {
    elders: {},
    activeVotes: {},
    records: {}
  };
}

function isoDate(value = new Date()) {
  return new Date(value).toISOString();
}

function userSnapshot(user) {
  return {
    id: user.id,
    tag: user.tag || user.username || user.id,
    username: user.username || user.tag || user.id
  };
}

function ensureGuild(store, guildId) {
  const guild = {
    ...emptyGuild(),
    ...(store.guilds[guildId] || {})
  };
  guild.elders = guild.elders && typeof guild.elders === 'object' ? guild.elders : {};
  guild.activeVotes =
    guild.activeVotes && typeof guild.activeVotes === 'object' ? guild.activeVotes : {};
  guild.records = guild.records && typeof guild.records === 'object' ? guild.records : {};
  store.guilds[guildId] = guild;
  return guild;
}

function ensureTargetRecord(guild, targetUser) {
  const targetId = targetUser.id;
  const record = {
    target: userSnapshot(targetUser),
    events: [],
    ...(guild.records[targetId] || {})
  };
  record.target = userSnapshot(targetUser);
  record.events = Array.isArray(record.events) ? record.events : [];
  guild.records[targetId] = record;
  return record;
}

function actionLabel(action) {
  return action === 'bench' ? 'bench' : 'mute';
}

function activeVoteKey(action, targetId) {
  return `${actionLabel(action)}:${targetId}`;
}

function emptyActiveVote(action, targetUser, now) {
  return {
    action: actionLabel(action),
    target: userSnapshot(targetUser),
    startedAt: isoDate(now),
    voters: {}
  };
}

function voteCount(vote) {
  return Object.keys(vote?.voters || {}).length;
}

function describeEvent(event) {
  const when = event.at ? new Date(event.at).toISOString().replace('T', ' ').slice(0, 16) : 'unknown';
  if (event.type === 'vote') {
    return `${when} - ${event.voter?.tag || event.voter?.id || 'Unknown'} voted ${event.action} (${event.voteCount}/${event.threshold})`;
  }
  if (event.type === 'applied') {
    return `${when} - ${event.action} applied (${event.result})`;
  }
  return `${when} - ${event.action || 'record'} ${event.type || ''}`.trim();
}

function summarizeCounts(events) {
  return events.reduce(
    (totals, event) => {
      if (event.type === 'vote' && event.action === 'mute') {
        totals.muteVotes += 1;
      }
      if (event.type === 'vote' && event.action === 'bench') {
        totals.benchVotes += 1;
      }
      if (event.type === 'applied' && event.action === 'mute' && event.result === 'success') {
        totals.mutes += 1;
      }
      if (event.type === 'applied' && event.action === 'bench' && event.result === 'success') {
        totals.benches += 1;
      }
      return totals;
    },
    { muteVotes: 0, benchVotes: 0, mutes: 0, benches: 0 }
  );
}

export function moderationStorePath() {
  return process.env.ELDER_STORE_PATH || DEFAULT_STORE_PATH;
}

export async function readModerationStore(filePath = moderationStorePath()) {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8'));
    return {
      ...emptyStore(),
      ...parsed,
      guilds: parsed?.guilds && typeof parsed.guilds === 'object' ? parsed.guilds : {}
    };
  } catch {
    return emptyStore();
  }
}

export async function writeModerationStore(store, filePath = moderationStorePath()) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600
  });
  await rename(tempPath, filePath);
}

export async function grantElder(
  guildId,
  targetUser,
  grantedByUser,
  { storePath = moderationStorePath(), now = new Date() } = {}
) {
  return withStoreLock(async () => {
    const store = await readModerationStore(storePath);
    const guild = ensureGuild(store, guildId);
    const previous = guild.elders[targetUser.id] || null;
    guild.elders[targetUser.id] = {
      user: userSnapshot(targetUser),
      grantedBy: userSnapshot(grantedByUser),
      grantedAt: previous?.grantedAt || isoDate(now),
      updatedAt: isoDate(now)
    };
    await writeModerationStore(store, storePath);
    return {
      store,
      elder: guild.elders[targetUser.id],
      alreadyElder: Boolean(previous)
    };
  });
}

export async function isElder(
  guildId,
  userId,
  { storePath = moderationStorePath() } = {}
) {
  const store = await readModerationStore(storePath);
  return Boolean(store.guilds?.[guildId]?.elders?.[userId]);
}

export async function submitModerationVote(
  action,
  guildId,
  targetUser,
  voterUser,
  { storePath = moderationStorePath(), now = new Date(), threshold = VOTE_THRESHOLD } = {}
) {
  return withStoreLock(async () => {
    const store = await readModerationStore(storePath);
    const guild = ensureGuild(store, guildId);
    const record = ensureTargetRecord(guild, targetUser);
    const voteKey = activeVoteKey(action, targetUser.id);
    const activeVote =
      guild.activeVotes[voteKey] || emptyActiveVote(action, targetUser, now);
    const duplicate = Boolean(activeVote.voters[voterUser.id]);

    if (!duplicate) {
      activeVote.voters[voterUser.id] = {
        user: userSnapshot(voterUser),
        at: isoDate(now)
      };
    }

    const count = voteCount(activeVote);
    const completed = count >= threshold;
    if (!duplicate) {
      record.events.push({
        type: 'vote',
        action: actionLabel(action),
        at: isoDate(now),
        voter: userSnapshot(voterUser),
        voteCount: count,
        threshold,
        completed
      });
    }

    if (completed) {
      delete guild.activeVotes[voteKey];
    } else {
      guild.activeVotes[voteKey] = activeVote;
    }

    await writeModerationStore(store, storePath);
    return {
      store,
      record,
      activeVote,
      duplicate,
      completed,
      voteCount: count,
      threshold
    };
  });
}

export async function recordModerationOutcome(
  action,
  guildId,
  targetUser,
  result,
  {
    storePath = moderationStorePath(),
    now = new Date(),
    reason = '',
    actorUser = null
  } = {}
) {
  return withStoreLock(async () => {
    const store = await readModerationStore(storePath);
    const guild = ensureGuild(store, guildId);
    const record = ensureTargetRecord(guild, targetUser);
    record.events.push({
      type: 'applied',
      action: actionLabel(action),
      at: isoDate(now),
      result,
      reason: String(reason || '').slice(0, 400),
      actor: actorUser ? userSnapshot(actorUser) : null
    });
    await writeModerationStore(store, storePath);
    return { store, record };
  });
}

export function buildModerationRecordText(record, activeVote = null) {
  const events = Array.isArray(record?.events) ? record.events : [];
  const totals = summarizeCounts(events);
  const lines = [
    `Mute votes: ${totals.muteVotes} | mutes passed: ${totals.mutes}`,
    `Bench votes: ${totals.benchVotes} | benches passed: ${totals.benches}`
  ];

  if (activeVote) {
    lines.push(
      `Active ${activeVote.action} vote: ${voteCount(activeVote)}/${VOTE_THRESHOLD}`
    );
  }

  const recent = events.slice(-MAX_RECORD_LINES).reverse().map(describeEvent);
  if (recent.length) {
    lines.push('', 'Recent record:', ...recent);
  }

  return lines.join('\n').slice(0, 1024);
}
