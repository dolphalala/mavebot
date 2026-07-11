import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  fetchClan,
  fetchClanWarLog,
  fetchCurrentCwlGroup,
  fetchCurrentWar,
  fetchCwlWar,
  fetchPlayer,
  normalizeClanTag,
  normalizePlayerTag
} from './coc.mjs';

const DEFAULT_STORE_PATH = '/shared/clash-history.json';
export const DEFAULT_CLASH_HISTORY_INTERVAL_MS = 2 * 60 * 1000;
export const DEFAULT_CLASH_HISTORY_PLAYER_INTERVAL_MS = 10 * 60 * 1000;
export const DEFAULT_CLASH_HISTORY_CLAN_INTERVAL_MS = 5 * 60 * 1000;
export const DEFAULT_CLASH_HISTORY_WAR_INTERVAL_MS = 2 * 60 * 1000;
const MAX_PLAYER_SNAPSHOTS = 3000;
const MAX_CLAN_SNAPSHOTS = 1000;
const MAX_ERRORS = 40;
let storeQueue = Promise.resolve();

async function withStoreLock(task) {
  const run = storeQueue.then(task, task);
  storeQueue = run.catch(() => {});
  return run;
}

function isoDate(value = new Date()) {
  return new Date(value).toISOString();
}

function numericOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function textOrNull(value) {
  const text = String(value || '').trim();
  return text || null;
}

function emptyStore() {
  return {
    version: 1,
    guilds: {},
    links: {},
    tracked: {
      players: {},
      clans: {},
      wars: {}
    },
    players: {},
    clans: {},
    wars: {},
    cwlGroups: {},
    rosters: {},
    scheduler: {
      cursor: 0,
      lastRunAt: null,
      lastAction: null,
      lastError: null
    }
  };
}

function objectMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeStore(parsed) {
  const store = {
    ...emptyStore(),
    ...(parsed && typeof parsed === 'object' ? parsed : {})
  };
  store.tracked =
    store.tracked && typeof store.tracked === 'object' ? { ...store.tracked } : {};
  store.tracked.players =
    store.tracked.players && typeof store.tracked.players === 'object'
      ? store.tracked.players
      : {};
  store.tracked.clans =
    store.tracked.clans && typeof store.tracked.clans === 'object' ? store.tracked.clans : {};
  store.tracked.wars =
    store.tracked.wars && typeof store.tracked.wars === 'object' ? store.tracked.wars : {};
  store.guilds = objectMap(store.guilds);
  for (const [guildId, guild] of Object.entries(store.guilds)) {
    if (!guild || typeof guild !== 'object' || Array.isArray(guild)) {
      delete store.guilds[guildId];
      continue;
    }
    guild.guildId = compactText(guild.guildId || guildId, 80) || guildId;
    guild.defaultClanTag = normalizeMaybeClanTag(guild.defaultClanTag);
    guild.defaultClanName = compactText(guild.defaultClanName, 120);
    guild.updatedBy = compactText(guild.updatedBy, 120);
    guild.createdAt = guild.createdAt || null;
    guild.updatedAt = guild.updatedAt || null;
  }
  store.links = objectMap(store.links);
  for (const [userId, link] of Object.entries(store.links)) {
    if (!link || typeof link !== 'object' || Array.isArray(link)) {
      delete store.links[userId];
      continue;
    }
    link.userId = compactText(link.userId || userId, 80) || userId;
    link.username = compactText(link.username, 120);
    link.primaryPlayerTag = normalizeMaybePlayerTag(link.primaryPlayerTag);
    link.players = normalizeLinkPlayers(link.players);
    if (!link.primaryPlayerTag || !link.players[link.primaryPlayerTag]) {
      link.primaryPlayerTag = Object.keys(link.players)[0] || null;
    }
    link.createdAt = link.createdAt || null;
    link.updatedAt = link.updatedAt || null;
  }
  store.players = objectMap(store.players);
  store.clans = objectMap(store.clans);
  store.wars = objectMap(store.wars);
  store.cwlGroups =
    store.cwlGroups && typeof store.cwlGroups === 'object' ? store.cwlGroups : {};
  store.rosters = store.rosters && typeof store.rosters === 'object' ? store.rosters : {};
  for (const [key, roster] of Object.entries(store.rosters)) {
    if (!roster || typeof roster !== 'object') {
      delete store.rosters[key];
      continue;
    }
    roster.signups =
      roster.signups && typeof roster.signups === 'object' ? roster.signups : {};
  }
  store.scheduler =
    store.scheduler && typeof store.scheduler === 'object'
      ? { ...emptyStore().scheduler, ...store.scheduler }
      : emptyStore().scheduler;
  return store;
}

export function clashHistoryStorePath() {
  return process.env.CLASH_HISTORY_STORE_PATH || DEFAULT_STORE_PATH;
}

export async function readClashHistoryStore(filePath = clashHistoryStorePath()) {
  let content = '';
  try {
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return emptyStore();
    }
    throw error;
  }

  try {
    return normalizeStore(JSON.parse(content));
  } catch {
    await rename(filePath, `${filePath}.corrupt-${Date.now()}`).catch(() => {});
    return emptyStore();
  }
}

export async function writeClashHistoryStore(store, filePath = clashHistoryStorePath()) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  await writeFile(tempPath, `${JSON.stringify(normalizeStore(store), null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600
  });
  await rename(tempPath, filePath);
}

function splitTags(value) {
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function configuredClashHistoryClanTags() {
  return splitTags(process.env.CLASH_HISTORY_CLAN_TAGS).flatMap((tag) => {
    try {
      return [normalizeClanTag(tag)];
    } catch {
      return [];
    }
  });
}

export function configuredClashHistoryPlayerTags() {
  return splitTags(process.env.CLASH_HISTORY_PLAYER_TAGS).flatMap((tag) => {
    try {
      return [normalizePlayerTag(tag)];
    } catch {
      return [];
    }
  });
}

function ensureTrackedSubject(collection, key, { source, now, dueNow = false } = {}) {
  const at = isoDate(now);
  const record = collection[key] || {
    tag: key,
    sources: [],
    addedAt: at,
    updatedAt: at,
    lastCheckedAt: null,
    nextDueAt: dueNow ? at : null,
    errors: []
  };
  record.tag = record.tag || key;
  record.addedAt = record.addedAt || at;
  record.lastCheckedAt = record.lastCheckedAt || null;
  record.nextDueAt = record.nextDueAt ?? (dueNow ? at : null);
  record.sources = Array.isArray(record.sources) ? record.sources : [];
  if (source && !record.sources.includes(source)) {
    record.sources.push(source);
  }
  record.updatedAt = at;
  if (dueNow && !record.lastCheckedAt) {
    record.nextDueAt = at;
  }
  collection[key] = record;
  return record;
}

function markTrackedSuccess(record, { now, intervalMs }) {
  record.lastCheckedAt = isoDate(now);
  record.nextDueAt = isoDate(new Date(new Date(now).getTime() + intervalMs));
  record.lastError = null;
}

function markTrackedError(record, error, { now, intervalMs }) {
  const row = {
    at: isoDate(now),
    message: String(error?.message || error || 'Unknown collector error').slice(0, 500)
  };
  record.lastCheckedAt = row.at;
  record.nextDueAt = isoDate(new Date(new Date(now).getTime() + intervalMs));
  record.lastError = row;
  record.errors = [...(record.errors || []), row].slice(-MAX_ERRORS);
}

function levelItems(items) {
  return (items || [])
    .filter((item) => item?.name)
    .map((item) => ({
      name: item.name,
      level: numericOrNull(item.level),
      maxLevel: numericOrNull(item.maxLevel),
      village: textOrNull(item.village)
    }));
}

function leagueSnapshot(league) {
  if (!league?.name && !league?.id) {
    return null;
  }
  return {
    id: numericOrNull(league.id),
    name: textOrNull(league.name) || 'Unknown',
    iconUrl: league.iconUrls?.medium || league.iconUrls?.small || null
  };
}

function clanMiniSnapshot(clan) {
  if (!clan?.tag && !clan?.name) {
    return null;
  }
  return {
    tag: clan.tag || null,
    name: clan.name || null,
    level: numericOrNull(clan.clanLevel),
    badgeUrl: clan.badgeUrls?.medium || clan.badgeUrls?.small || null
  };
}

export function playerSnapshotFromApi(player, now = new Date()) {
  return {
    at: isoDate(now),
    tag: normalizePlayerTag(player.tag),
    name: player.name || 'Unknown player',
    townHallLevel: numericOrNull(player.townHallLevel),
    townHallWeaponLevel: numericOrNull(player.townHallWeaponLevel),
    expLevel: numericOrNull(player.expLevel),
    trophies: numericOrNull(player.trophies),
    bestTrophies: numericOrNull(player.bestTrophies),
    builderBaseTrophies: numericOrNull(player.builderBaseTrophies),
    bestBuilderBaseTrophies: numericOrNull(player.bestBuilderBaseTrophies),
    warStars: numericOrNull(player.warStars),
    attackWins: numericOrNull(player.attackWins),
    defenseWins: numericOrNull(player.defenseWins),
    donations: numericOrNull(player.donations),
    donationsReceived: numericOrNull(player.donationsReceived),
    clan: clanMiniSnapshot(player.clan),
    role: textOrNull(player.role),
    warPreference: textOrNull(player.warPreference),
    league: leagueSnapshot(player.league),
    builderBaseLeague: leagueSnapshot(player.builderBaseLeague),
    legendStatistics: player.legendStatistics || null,
    heroes: levelItems(player.heroes),
    heroEquipment: levelItems(player.heroEquipment),
    troops: levelItems(player.troops),
    spells: levelItems(player.spells)
  };
}

function snapshotComparable(snapshot) {
  const { at: _at, ...rest } = snapshot;
  return JSON.stringify(rest);
}

function shouldAppendSnapshot(snapshots, snapshot) {
  const last = snapshots.at(-1);
  if (!last) {
    return true;
  }
  return snapshotComparable(last) !== snapshotComparable(snapshot);
}

function ensurePlayerRecord(store, tag, now = new Date()) {
  const normalizedTag = normalizePlayerTag(tag);
  const record = {
    tag: normalizedTag,
    firstSeenAt: isoDate(now),
    lastSeenAt: null,
    current: null,
    snapshots: [],
    clanHistory: [],
    warStats: {},
    ...(store.players[normalizedTag] || {})
  };
  record.snapshots = Array.isArray(record.snapshots) ? record.snapshots : [];
  record.clanHistory = Array.isArray(record.clanHistory) ? record.clanHistory : [];
  record.warStats = record.warStats && typeof record.warStats === 'object' ? record.warStats : {};
  store.players[normalizedTag] = record;
  return record;
}

function recordPlayerClanHistory(record, snapshot, now = new Date()) {
  const clanTag = snapshot.clan?.tag || '#NOCLAN';
  const last = record.clanHistory.at(-1);
  if (last?.clanTag === clanTag) {
    last.lastSeenAt = isoDate(now);
    last.clanName = snapshot.clan?.name || last.clanName || null;
    return;
  }
  record.clanHistory.push({
    clanTag,
    clanName: snapshot.clan?.name || null,
    firstSeenAt: isoDate(now),
    lastSeenAt: isoDate(now)
  });
}

export function recordPlayerSnapshotInStore(store, player, { now = new Date(), source = 'collector' } = {}) {
  const snapshot = playerSnapshotFromApi(player, now);
  const record = ensurePlayerRecord(store, snapshot.tag, now);
  const previous = record.snapshots.at(-1) || null;
  const appended = shouldAppendSnapshot(record.snapshots, snapshot);
  record.name = snapshot.name;
  record.lastSeenAt = snapshot.at;
  record.current = snapshot;
  if (appended) {
    record.snapshots.push(snapshot);
    if (record.snapshots.length > MAX_PLAYER_SNAPSHOTS) {
      record.snapshots = record.snapshots.slice(-MAX_PLAYER_SNAPSHOTS);
    }
  }
  recordPlayerClanHistory(record, snapshot, now);
  ensureTrackedSubject(store.tracked.players, snapshot.tag, { source, now });
  return {
    record,
    snapshot,
    appended,
    trophyDelta:
      previous && Number.isFinite(previous.trophies) && Number.isFinite(snapshot.trophies)
        ? snapshot.trophies - previous.trophies
        : null
  };
}

export async function recordClashPlayerSnapshot(
  player,
  { storePath = clashHistoryStorePath(), now = new Date(), source = 'lookup' } = {}
) {
  return withStoreLock(async () => {
    const store = await readClashHistoryStore(storePath);
    const result = recordPlayerSnapshotInStore(store, player, { now, source });
    await writeClashHistoryStore(store, storePath);
    return { store, ...result };
  });
}

function clanSnapshotFromApi(clan, now = new Date()) {
  return {
    at: isoDate(now),
    tag: normalizeClanTag(clan.tag),
    name: clan.name || 'Unknown clan',
    level: numericOrNull(clan.clanLevel),
    members: numericOrNull(clan.members),
    points: numericOrNull(clan.clanPoints),
    builderBasePoints: numericOrNull(clan.clanBuilderBasePoints),
    capitalPoints: numericOrNull(clan.clanCapitalPoints),
    requiredTrophies: numericOrNull(clan.requiredTrophies),
    warFrequency: textOrNull(clan.warFrequency),
    warWinStreak: numericOrNull(clan.warWinStreak),
    warWins: numericOrNull(clan.warWins),
    warTies: numericOrNull(clan.warTies),
    warLosses: numericOrNull(clan.warLosses),
    publicWarLog: Boolean(clan.isWarLogPublic),
    warLeague: textOrNull(clan.warLeague?.name),
    capitalLeague: textOrNull(clan.capitalLeague?.name),
    location: clan.location ? { id: clan.location.id, name: clan.location.name } : null,
    badgeUrl: clan.badgeUrls?.medium || clan.badgeUrls?.small || null,
    memberTags: (clan.memberList || []).map((member) => member.tag).filter(Boolean)
  };
}

function memberSnapshot(member) {
  return {
    tag: member.tag,
    name: member.name || 'Unknown player',
    role: textOrNull(member.role),
    townHallLevel: numericOrNull(member.townHallLevel),
    expLevel: numericOrNull(member.expLevel),
    trophies: numericOrNull(member.trophies),
    builderBaseTrophies: numericOrNull(member.builderBaseTrophies),
    donations: numericOrNull(member.donations),
    donationsReceived: numericOrNull(member.donationsReceived),
    league: leagueSnapshot(member.league)
  };
}

function recordClanSnapshotInStore(store, clan, { now = new Date(), source = 'collector' } = {}) {
  const snapshot = clanSnapshotFromApi(clan, now);
  const record = {
    tag: snapshot.tag,
    firstSeenAt: isoDate(now),
    lastSeenAt: null,
    current: null,
    snapshots: [],
    members: {},
    ...(store.clans[snapshot.tag] || {})
  };
  record.snapshots = Array.isArray(record.snapshots) ? record.snapshots : [];
  record.members = record.members && typeof record.members === 'object' ? record.members : {};
  record.name = snapshot.name;
  record.lastSeenAt = snapshot.at;
  record.current = snapshot;
  if (shouldAppendSnapshot(record.snapshots, snapshot)) {
    record.snapshots.push(snapshot);
    if (record.snapshots.length > MAX_CLAN_SNAPSHOTS) {
      record.snapshots = record.snapshots.slice(-MAX_CLAN_SNAPSHOTS);
    }
  }
  for (const member of clan.memberList || []) {
    if (!member?.tag) {
      continue;
    }
    const tag = normalizePlayerTag(member.tag);
    record.members[tag] = {
      ...memberSnapshot(member),
      tag,
      lastSeenAt: isoDate(now)
    };
    ensureTrackedSubject(store.tracked.players, tag, {
      source: `clan:${snapshot.tag}`,
      now,
      dueNow: true
    });
  }
  store.clans[snapshot.tag] = record;
  ensureTrackedSubject(store.tracked.clans, snapshot.tag, { source, now });
  return { record, snapshot };
}

function warSideSummary(side) {
  return {
    tag: side?.tag || null,
    name: side?.name || null,
    badgeUrl: side?.badgeUrls?.medium || side?.badgeUrls?.small || null,
    clanLevel: numericOrNull(side?.clanLevel),
    attacks: numericOrNull(side?.attacks),
    stars: numericOrNull(side?.stars),
    destructionPercentage: numericOrNull(side?.destructionPercentage)
  };
}

function warMemberSnapshot(member, sideTag) {
  return {
    sideTag,
    tag: member.tag,
    name: member.name || 'Unknown player',
    mapPosition: numericOrNull(member.mapPosition),
    townHallLevel: numericOrNull(member.townhallLevel ?? member.townHallLevel),
    opponentAttacks: numericOrNull(member.opponentAttacks),
    bestOpponentAttack: member.bestOpponentAttack
      ? {
          attackerTag: member.bestOpponentAttack.attackerTag,
          defenderTag: member.bestOpponentAttack.defenderTag,
          stars: numericOrNull(member.bestOpponentAttack.stars),
          destructionPercentage: numericOrNull(member.bestOpponentAttack.destructionPercentage),
          order: numericOrNull(member.bestOpponentAttack.order)
        }
      : null
  };
}

function flattenWarMembers(war) {
  return [
    ...(war.clan?.members || []).map((member) => warMemberSnapshot(member, war.clan?.tag)),
    ...(war.opponent?.members || []).map((member) => warMemberSnapshot(member, war.opponent?.tag))
  ];
}

function flattenWarAttacks(war) {
  return [war.clan, war.opponent].flatMap((side) =>
    (side?.members || []).flatMap((member) =>
      (member.attacks || []).map((attack) => ({
        attackerTag: attack.attackerTag || member.tag,
        defenderTag: attack.defenderTag,
        stars: numericOrNull(attack.stars),
        destructionPercentage: numericOrNull(attack.destructionPercentage),
        order: numericOrNull(attack.order),
        duration: numericOrNull(attack.duration)
      }))
    )
  );
}

function seasonFromDate(value = new Date()) {
  return new Date(value).toISOString().slice(0, 7);
}

function warIdentityKey(war) {
  if (war.warTag && war.warTag !== '#0') {
    return `war:${normalizePlayerTag(war.warTag)}`;
  }
  const tags = [war.clan?.tag, war.opponent?.tag].filter(Boolean).sort().join(':');
  const start = war.preparationStartTime || war.startTime || war.endTime || 'unknown';
  return `war:${start}:${tags}`;
}

function updatePlayerWarStats(store, warRecord) {
  const members = new Map((warRecord.members || []).map((member) => [member.tag, member]));
  const sideByTag = new Map();
  for (const member of warRecord.members || []) {
    sideByTag.set(member.tag, member.sideTag);
  }
  for (const member of warRecord.members || []) {
    const record = ensurePlayerRecord(store, member.tag, warRecord.lastSeenAt);
    record.name = record.current?.name || member.name || record.name || member.tag;
    const sideTag = member.sideTag;
    const opponentTag =
      sideTag === warRecord.clan?.tag ? warRecord.opponent?.tag : warRecord.clan?.tag;
    const attacks = (warRecord.attacks || []).filter((attack) => attack.attackerTag === member.tag);
    const defenses = (warRecord.attacks || []).filter((attack) => attack.defenderTag === member.tag);
    record.warStats[warRecord.key] = {
      warKey: warRecord.key,
      warTag: warRecord.warTag,
      warType: warRecord.warType,
      season: warRecord.season,
      state: warRecord.state,
      clanTag: sideTag,
      opponentTag,
      startTime: warRecord.startTime,
      endTime: warRecord.endTime,
      mapPosition: member.mapPosition,
      townHallLevel: member.townHallLevel,
      attacksPerMember: warRecord.attacksPerMember,
      attacks: attacks.map((attack) => ({
        defenderTag: attack.defenderTag,
        defenderMapPosition: members.get(attack.defenderTag)?.mapPosition ?? null,
        defenderTownHallLevel: members.get(attack.defenderTag)?.townHallLevel ?? null,
        stars: attack.stars,
        destructionPercentage: attack.destructionPercentage,
        order: attack.order
      })),
      defenses: defenses.map((attack) => ({
        attackerTag: attack.attackerTag,
        attackerClanTag: sideByTag.get(attack.attackerTag) || null,
        stars: attack.stars,
        destructionPercentage: attack.destructionPercentage,
        order: attack.order
      })),
      missedAttacks: Number.isFinite(warRecord.attacksPerMember)
        ? Math.max(0, warRecord.attacksPerMember - attacks.length)
        : null
    };
  }
}

function recordWarInStore(
  store,
  war,
  { now = new Date(), warType = 'regular', season = null, cwlGroupKey = null } = {}
) {
  if (!war || war.state === 'notInWar') {
    return null;
  }
  const key = warIdentityKey(war);
  const record = {
    key,
    warTag: war.warTag && war.warTag !== '#0' ? normalizePlayerTag(war.warTag) : null,
    warType,
    season: season || seasonFromDate(war.endTime || war.startTime || now),
    cwlGroupKey,
    state: war.state || 'unknown',
    teamSize: numericOrNull(war.teamSize),
    attacksPerMember: numericOrNull(war.attacksPerMember),
    preparationStartTime: war.preparationStartTime || null,
    startTime: war.startTime || null,
    endTime: war.endTime || null,
    lastSeenAt: isoDate(now),
    clan: warSideSummary(war.clan),
    opponent: warSideSummary(war.opponent),
    members: flattenWarMembers(war),
    attacks: flattenWarAttacks(war)
  };
  store.wars[key] = record;
  updatePlayerWarStats(store, record);
  return record;
}

function clanWarLogKey(entry) {
  const tags = [entry.clan?.tag, entry.opponent?.tag].filter(Boolean).sort().join(':');
  const end = entry.endTime || 'unknown';
  return `warlog:${end}:${tags}`;
}

function recordWarLogInStore(store, warLog, { now = new Date() } = {}) {
  const entries = Array.isArray(warLog?.items) ? warLog.items : [];
  for (const entry of entries) {
    const key = clanWarLogKey(entry);
    store.wars[key] = {
      ...(store.wars[key] || {}),
      key,
      warTag: null,
      warType: 'regular-log',
      season: seasonFromDate(entry.endTime || now),
      state: 'warEnded',
      teamSize: numericOrNull(entry.teamSize),
      attacksPerMember: numericOrNull(entry.attacksPerMember),
      preparationStartTime: null,
      startTime: null,
      endTime: entry.endTime || null,
      lastSeenAt: isoDate(now),
      clan: warSideSummary(entry.clan),
      opponent: warSideSummary(entry.opponent),
      members: [],
      attacks: [],
      summaryOnly: true
    };
  }
}

function cwlGroupKey(group) {
  const season = group?.season || seasonFromDate();
  const clanTags = (group?.clans || []).map((clan) => clan.tag).filter(Boolean).sort().join(':');
  return `cwl:${season}:${clanTags}`;
}

function recordCwlGroupInStore(store, group, { now = new Date() } = {}) {
  if (!group || group.state === 'notInWar' || !Array.isArray(group.rounds)) {
    return null;
  }
  const key = cwlGroupKey(group);
  const warTags = group.rounds.flatMap((round) => round.warTags || []).filter((tag) => tag && tag !== '#0');
  const record = {
    key,
    state: group.state || 'unknown',
    season: group.season || seasonFromDate(now),
    lastSeenAt: isoDate(now),
    clans: (group.clans || []).map((clan) => ({
      tag: clan.tag,
      name: clan.name,
      clanLevel: numericOrNull(clan.clanLevel),
      badgeUrl: clan.badgeUrls?.medium || clan.badgeUrls?.small || null,
      members: (clan.members || []).map((member) => ({
        tag: member.tag,
        name: member.name,
        townHallLevel: numericOrNull(member.townHallLevel ?? member.townhallLevel)
      }))
    })),
    rounds: group.rounds.map((round, index) => ({
      round: index + 1,
      warTags: (round.warTags || []).filter(Boolean)
    })),
    warTags
  };
  store.cwlGroups[key] = record;
  for (const warTag of warTags) {
    ensureTrackedSubject(store.tracked.wars, normalizePlayerTag(warTag), {
      source: key,
      now,
      dueNow: true
    });
    store.tracked.wars[normalizePlayerTag(warTag)].warType = 'cwl';
    store.tracked.wars[normalizePlayerTag(warTag)].season = record.season;
    store.tracked.wars[normalizePlayerTag(warTag)].cwlGroupKey = key;
  }
  return record;
}

export function addConfiguredClashHistorySubjects(
  store,
  {
    clanTags = configuredClashHistoryClanTags(),
    playerTags = configuredClashHistoryPlayerTags(),
    now = new Date()
  } = {}
) {
  for (const clanTag of clanTags) {
    try {
      ensureTrackedSubject(store.tracked.clans, normalizeClanTag(clanTag), {
        source: 'env',
        now,
        dueNow: true
      });
    } catch {}
  }
  for (const playerTag of playerTags) {
    try {
      ensureTrackedSubject(store.tracked.players, normalizePlayerTag(playerTag), {
        source: 'env',
        now,
        dueNow: true
      });
    } catch {}
  }
}

async function collectPlayer(store, tag, options) {
  const {
    now,
    playerIntervalMs,
    source = 'collector',
    fetchPlayerImpl = fetchPlayer
  } = options;
  const normalizedTag = normalizePlayerTag(tag);
  const tracked = ensureTrackedSubject(store.tracked.players, normalizedTag, {
    source,
    now
  });
  try {
    const player = await fetchPlayerImpl(normalizedTag);
    const result = recordPlayerSnapshotInStore(store, player, { now, source });
    markTrackedSuccess(tracked, { now, intervalMs: playerIntervalMs });
    return { tracked: true, type: 'player', tag: normalizedTag, ...result };
  } catch (error) {
    markTrackedError(tracked, error, { now, intervalMs: playerIntervalMs });
    throw error;
  }
}

async function collectClan(store, tag, options) {
  const {
    now,
    clanIntervalMs,
    source = 'collector',
    fetchClanImpl = fetchClan,
    fetchCurrentWarImpl = fetchCurrentWar,
    fetchCurrentCwlGroupImpl = fetchCurrentCwlGroup,
    fetchClanWarLogImpl = fetchClanWarLog
  } = options;
  const normalizedTag = normalizeClanTag(tag);
  const tracked = ensureTrackedSubject(store.tracked.clans, normalizedTag, {
    source,
    now
  });
  try {
    const clan = await fetchClanImpl(normalizedTag);
    const result = recordClanSnapshotInStore(store, clan, { now, source });
    const warnings = [];
    try {
      const currentWar = await fetchCurrentWarImpl(normalizedTag);
      recordWarInStore(store, currentWar, { now, warType: 'regular' });
    } catch (error) {
      warnings.push({ scope: 'current-war', message: String(error?.message || error).slice(0, 300) });
    }
    try {
      const group = await fetchCurrentCwlGroupImpl(normalizedTag);
      recordCwlGroupInStore(store, group, { now });
    } catch (error) {
      warnings.push({ scope: 'cwl-group', message: String(error?.message || error).slice(0, 300) });
    }
    try {
      const warLog = await fetchClanWarLogImpl(normalizedTag);
      recordWarLogInStore(store, warLog, { now });
    } catch (error) {
      warnings.push({ scope: 'war-log', message: String(error?.message || error).slice(0, 300) });
    }
    tracked.warnings = warnings.slice(-MAX_ERRORS);
    markTrackedSuccess(tracked, { now, intervalMs: clanIntervalMs });
    return { tracked: true, type: 'clan', tag: normalizedTag, ...result, warnings };
  } catch (error) {
    markTrackedError(tracked, error, { now, intervalMs: clanIntervalMs });
    throw error;
  }
}

async function collectWar(store, tag, options) {
  const { now, warIntervalMs, fetchCwlWarImpl = fetchCwlWar } = options;
  const normalizedTag = normalizePlayerTag(tag);
  const tracked = ensureTrackedSubject(store.tracked.wars, normalizedTag, {
    source: 'collector',
    now
  });
  try {
    const war = await fetchCwlWarImpl(normalizedTag);
    const record = recordWarInStore(store, war, {
      now,
      warType: tracked.warType || 'cwl',
      season: tracked.season || null,
      cwlGroupKey: tracked.cwlGroupKey || null
    });
    if (record?.state === 'warEnded') {
      tracked.completedAt = isoDate(now);
      tracked.nextDueAt = null;
      tracked.lastCheckedAt = isoDate(now);
      tracked.lastError = null;
    } else {
      markTrackedSuccess(tracked, { now, intervalMs: warIntervalMs });
    }
    return { tracked: true, type: 'war', tag: normalizedTag, record };
  } catch (error) {
    markTrackedError(tracked, error, { now, intervalMs: warIntervalMs });
    throw error;
  }
}

export async function trackClashHistoryPlayer(
  tag,
  {
    storePath = clashHistoryStorePath(),
    now = new Date(),
    source = 'command',
    playerIntervalMs = DEFAULT_CLASH_HISTORY_PLAYER_INTERVAL_MS,
    fetchPlayerImpl = fetchPlayer
  } = {}
) {
  return withStoreLock(async () => {
    const store = await readClashHistoryStore(storePath);
    const result = await collectPlayer(store, tag, {
      now,
      source,
      playerIntervalMs,
      fetchPlayerImpl
    });
    await writeClashHistoryStore(store, storePath);
    return { store, ...result };
  });
}

export async function trackClashHistoryClan(
  tag,
  {
    storePath = clashHistoryStorePath(),
    now = new Date(),
    source = 'command',
    clanIntervalMs = DEFAULT_CLASH_HISTORY_CLAN_INTERVAL_MS,
    fetchClanImpl = fetchClan,
    fetchCurrentWarImpl = fetchCurrentWar,
    fetchCurrentCwlGroupImpl = fetchCurrentCwlGroup,
    fetchClanWarLogImpl = fetchClanWarLog
  } = {}
) {
  return withStoreLock(async () => {
    const store = await readClashHistoryStore(storePath);
    const result = await collectClan(store, tag, {
      now,
      source,
      clanIntervalMs,
      fetchClanImpl,
      fetchCurrentWarImpl,
      fetchCurrentCwlGroupImpl,
      fetchClanWarLogImpl
    });
    await writeClashHistoryStore(store, storePath);
    return { store, ...result };
  });
}

function numberText(value) {
  return Number.isFinite(value) ? value.toLocaleString('en-US') : '?';
}

function signedDeltaText(value) {
  if (!Number.isFinite(value) || value === 0) {
    return '0';
  }
  return value > 0 ? `+${numberText(value)}` : numberText(value);
}

function dateText(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'unknown';
  }
  return date.toISOString().slice(0, 10);
}

function valueChangeText(label, latest, previous, first) {
  const value = latest?.[label.key];
  if (!Number.isFinite(value)) {
    return `${label.name}: ?`;
  }
  const parts = [`${label.name}: ${numberText(value)}`];
  if (previous && Number.isFinite(previous[label.key])) {
    parts.push(`${signedDeltaText(value - previous[label.key])} since last`);
  }
  if (first && first !== previous && Number.isFinite(first[label.key])) {
    parts.push(`${signedDeltaText(value - first[label.key])} since first`);
  }
  return parts.join(' | ');
}

function summarizeWarStats(record) {
  const rows = Object.values(record?.warStats || {});
  if (!rows.length) {
    return 'No collected war/CWL attack rows for this player yet.';
  }
  const attacks = rows.flatMap((row) => row.attacks || []);
  const defenses = rows.flatMap((row) => row.defenses || []);
  const missed = rows.reduce(
    (total, row) => total + (Number.isFinite(row.missedAttacks) ? row.missedAttacks : 0),
    0
  );
  const stars = attacks.reduce(
    (total, attack) => total + (Number.isFinite(attack.stars) ? attack.stars : 0),
    0
  );
  const triples = attacks.filter((attack) => attack.stars === 3).length;
  const latest = rows
    .slice()
    .sort((a, b) => String(b.endTime || b.startTime || '').localeCompare(String(a.endTime || a.startTime || '')))
    .at(0);
  return [
    `${rows.length} war/CWL row${rows.length === 1 ? '' : 's'} collected.`,
    `Attacks: ${attacks.length}, stars: ${stars}, triples: ${triples}, missed: ${missed}.`,
    `Defenses seen: ${defenses.length}.`,
    latest ? `Latest: ${latest.warType || 'war'} vs ${latest.opponentTag || 'unknown'} (${latest.state || 'unknown'}).` : ''
  ]
    .filter(Boolean)
    .join(' ');
}

export function buildClashPlayerHistoryText(record, { tracked = null } = {}) {
  const current = record?.current || null;
  if (!current) {
    return null;
  }
  const snapshots = Array.isArray(record.snapshots) ? record.snapshots : [];
  const latest = snapshots.at(-1) || current;
  const previous = snapshots.length > 1 ? snapshots.at(-2) : null;
  const first = snapshots[0] || current;
  const clanRows = Array.isArray(record.clanHistory) ? record.clanHistory.slice(-4) : [];
  const lines = [
    `**${current.name || record.name || 'Player'} (${current.tag || record.tag}) history**`,
    `Tracking: ${snapshots.length} snapshot${snapshots.length === 1 ? '' : 's'} since ${dateText(record.firstSeenAt || first.at)}. History starts when mavebot first tracks the player.`
  ];

  if (tracked?.lastCheckedAt || tracked?.nextDueAt) {
    lines.push(
      `Collector: last checked ${dateText(tracked.lastCheckedAt)}, next due ${dateText(tracked.nextDueAt)}.`
    );
  }

  lines.push(
    '',
    '**Current**',
    `TH ${numberText(current.townHallLevel)} | XP ${numberText(current.expLevel)} | ${current.league?.name || 'Unranked'}`,
    `Trophies ${numberText(current.trophies)} | Best ${numberText(current.bestTrophies)} | War stars ${numberText(current.warStars)}`,
    `Donated ${numberText(current.donations)} | Received ${numberText(current.donationsReceived)} | Attacks won ${numberText(current.attackWins)} | Defenses won ${numberText(current.defenseWins)}`
  );

  if (previous || first !== latest) {
    lines.push(
      '',
      '**Changes**',
      valueChangeText({ key: 'trophies', name: 'Trophies' }, latest, previous, first),
      valueChangeText({ key: 'donations', name: 'Donations' }, latest, previous, first),
      valueChangeText({ key: 'donationsReceived', name: 'Received' }, latest, previous, first),
      valueChangeText({ key: 'warStars', name: 'War stars' }, latest, previous, first)
    );
  } else {
    lines.push('', '**Changes**', 'Only one snapshot exists so far. The useful deltas appear after more scheduled checks.');
  }

  lines.push('', '**Clan history**');
  if (clanRows.length) {
    lines.push(
      ...clanRows.map(
        (row) =>
          `${row.clanName || row.clanTag || 'No clan'} (${row.clanTag || 'unknown'}) ${dateText(row.firstSeenAt)} -> ${dateText(row.lastSeenAt)}`
      )
    );
  } else {
    lines.push('No clan movement collected yet.');
  }

  lines.push('', '**War/CWL**', summarizeWarStats(record));

  const text = lines.join('\n');
  return text.length > 1900 ? `${text.slice(0, 1880)}\n...` : text;
}

function latestPlayerForRoster(store, tag, clanMember = null) {
  const normalizedTag = normalizePlayerTag(tag);
  const record = store.players?.[normalizedTag] || null;
  const current = record?.current || null;
  return {
    tag: normalizedTag,
    record,
    current: current || clanMember || { tag: normalizedTag, name: normalizedTag },
    hasPlayerSnapshot: Boolean(current)
  };
}

function totalLevels(items = []) {
  return (items || []).reduce(
    (total, item) => total + (Number.isFinite(item?.level) ? item.level : 0),
    0
  );
}

function rosterWarSummary(record) {
  const rows = Object.values(record?.warStats || {});
  const attacks = rows.flatMap((row) => row.attacks || []);
  const defenses = rows.flatMap((row) => row.defenses || []);
  return {
    rows: rows.length,
    attacks: attacks.length,
    stars: attacks.reduce(
      (total, attack) => total + (Number.isFinite(attack.stars) ? attack.stars : 0),
      0
    ),
    triples: attacks.filter((attack) => attack.stars === 3).length,
    missed: rows.reduce(
      (total, row) => total + (Number.isFinite(row.missedAttacks) ? row.missedAttacks : 0),
      0
    ),
    defenses: defenses.length
  };
}

function rosterCandidate(store, tag, clanMember = null, style = 'balanced') {
  const { record, current, hasPlayerSnapshot } = latestPlayerForRoster(store, tag, clanMember);
  const snapshots = Array.isArray(record?.snapshots) ? record.snapshots : [];
  const war = rosterWarSummary(record);
  const townHall = Number.isFinite(current.townHallLevel) ? current.townHallLevel : 0;
  const heroScore = totalLevels(current.heroes);
  const equipmentScore = totalLevels(current.heroEquipment);
  const trophies = Number.isFinite(current.trophies) ? current.trophies : 0;
  const warStars = Number.isFinite(current.warStars) ? current.warStars : 0;
  const donations = Number.isFinite(current.donations) ? current.donations : 0;
  const attackWins = Number.isFinite(current.attackWins) ? current.attackWins : 0;
  const styleWeights = {
    safe: { townHall: 1100, heroes: 8, equipment: 5, war: 35, activity: 0.6 },
    balanced: { townHall: 1000, heroes: 7, equipment: 4, war: 25, activity: 0.8 },
    growth: { townHall: 900, heroes: 5, equipment: 3, war: 15, activity: 1.1 }
  };
  const weights = styleWeights[style] || styleWeights.balanced;
  const score =
    townHall * weights.townHall +
    heroScore * weights.heroes +
    equipmentScore * weights.equipment +
    war.stars * weights.war +
    war.triples * 45 -
    war.missed * 60 +
    trophies * 0.3 +
    warStars * 1.5 +
    donations * weights.activity * 0.15 +
    attackWins * weights.activity -
    (hasPlayerSnapshot ? 0 : 350);

  return {
    tag: normalizePlayerTag(current.tag || tag),
    name: current.name || tag,
    townHall,
    trophies,
    warStars,
    heroScore,
    equipmentScore,
    snapshots: snapshots.length,
    hasPlayerSnapshot,
    war,
    score
  };
}

function rosterReason(candidate) {
  const bits = [`TH ${candidate.townHall || '?'}`];
  if (candidate.heroScore) {
    bits.push(`heroes ${candidate.heroScore}`);
  }
  if (candidate.war.attacks) {
    bits.push(`${candidate.war.attacks} war attacks/${candidate.war.stars} stars`);
  }
  if (candidate.snapshots) {
    bits.push(`${candidate.snapshots} snapshots`);
  } else {
    bits.push('needs player snapshot');
  }
  return bits.join(', ');
}

function rosterLine(candidate, index) {
  return `${index}. ${candidate.name} (${candidate.tag}) - ${Math.round(candidate.score)} - ${rosterReason(candidate)}`;
}

function selectRosterClan(store, clanTag = null) {
  if (clanTag) {
    return store.clans?.[normalizeClanTag(clanTag)] || null;
  }
  const clans = Object.values(store.clans || {}).filter((record) => record?.current);
  if (!clans.length) {
    return null;
  }
  return clans.sort((a, b) => String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')))[0];
}

function compactText(value, max = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return null;
  }
  return text.length > max ? text.slice(0, Math.max(0, max - 1)).trimEnd() : text;
}

function normalizeLinkPlayers(players) {
  const entries = Array.isArray(players)
    ? players.map((player) => [player?.playerTag || player?.tag || player, player])
    : Object.entries(objectMap(players));
  const normalized = {};
  for (const [key, player] of entries) {
    const playerTag = normalizeMaybePlayerTag(player?.playerTag || player?.tag || key);
    if (!playerTag) {
      continue;
    }
    normalized[playerTag] = {
      playerTag,
      name: compactText(player?.name, 120),
      guildId: compactText(player?.guildId, 80),
      linkedAt: player?.linkedAt || null,
      updatedAt: player?.updatedAt || null
    };
  }
  return normalized;
}

function guildKeyFor(guildId = null) {
  return compactText(guildId, 80) || 'global';
}

function userKeyFor(userId = null) {
  return compactText(userId, 80) || 'unknown';
}

function ensureGuildConfig(store, { guildId = null, now = new Date() } = {}) {
  store.guilds = objectMap(store.guilds);
  const guildKey = guildKeyFor(guildId);
  const at = isoDate(now);
  const record = {
    guildId: guildKey,
    defaultClanTag: null,
    defaultClanName: null,
    createdAt: at,
    updatedAt: at,
    ...(store.guilds[guildKey] || {})
  };
  record.guildId = guildKey;
  record.createdAt = record.createdAt || at;
  record.updatedAt = at;
  record.defaultClanTag = normalizeMaybeClanTag(record.defaultClanTag);
  record.defaultClanName = compactText(record.defaultClanName, 120);
  record.updatedBy = compactText(record.updatedBy, 120);
  store.guilds[guildKey] = record;
  return record;
}

function ensureUserLink(store, { userId = null, username = null, now = new Date() } = {}) {
  store.links = objectMap(store.links);
  const userKey = userKeyFor(userId);
  const at = isoDate(now);
  const record = {
    userId: userKey,
    username: compactText(username, 120),
    primaryPlayerTag: null,
    players: {},
    createdAt: at,
    updatedAt: at,
    ...(store.links[userKey] || {})
  };
  record.userId = userKey;
  record.username = compactText(username, 120) || compactText(record.username, 120);
  record.players = normalizeLinkPlayers(record.players);
  record.primaryPlayerTag = normalizeMaybePlayerTag(record.primaryPlayerTag);
  record.createdAt = record.createdAt || at;
  record.updatedAt = at;
  if (!record.primaryPlayerTag || !record.players[record.primaryPlayerTag]) {
    record.primaryPlayerTag = Object.keys(record.players)[0] || null;
  }
  store.links[userKey] = record;
  return record;
}

function defaultClanTagForGuild(store, guildId = null) {
  const tag = store.guilds?.[guildKeyFor(guildId)]?.defaultClanTag;
  return normalizeMaybeClanTag(tag);
}

export async function setClashGuildDefaultClan({
  guildId,
  clanTag,
  actorId = null,
  actorName = null,
  storePath = clashHistoryStorePath(),
  now = new Date(),
  fetchClanImpl = fetchClan
} = {}) {
  const normalizedClanTag = normalizeClanTag(clanTag);
  const guildKey = guildKeyFor(guildId);
  const clan = await fetchClanImpl(normalizedClanTag);

  return withStoreLock(async () => {
    const store = await readClashHistoryStore(storePath);
    const clanResult = recordClanSnapshotInStore(store, clan, {
      now,
      source: `config:${guildKey}`
    });
    const guild = ensureGuildConfig(store, { guildId: guildKey, now });
    guild.defaultClanTag = clanResult.snapshot.tag;
    guild.defaultClanName = clanResult.snapshot.name;
    guild.updatedBy = compactText(actorName || actorId, 120);
    guild.updatedById = compactText(actorId, 80);
    guild.updatedAt = isoDate(now);
    await writeClashHistoryStore(store, storePath);
    return {
      store,
      guild,
      record: clanResult.record,
      snapshot: clanResult.snapshot,
      appended: clanResult.appended
    };
  });
}

export function buildClashGuildConfigText(store, { guildId = null } = {}) {
  const guildKey = guildKeyFor(guildId);
  const guild = store.guilds?.[guildKey] || null;
  const defaultTag = defaultClanTagForGuild(store, guildKey);
  const clan = defaultTag ? store.clans?.[defaultTag] || null : null;
  const linkedPlayers = Object.values(store.links || {}).reduce(
    (total, link) =>
      total +
      Object.values(link?.players || {}).filter((player) => player?.guildId === guildKey).length,
    0
  );

  if (!defaultTag) {
    return clippedDiscordText([
      '**Clash setup**',
      'No default clan is configured for this Discord server yet.',
      '',
      '**Start here**',
      'Use `/config clan set tag:#CLAN` so `/summary`, `/activity`, `/warstats`, and `/roster plan` know which clan to use by default.',
      'Then use `/link player tag:#PLAYER` to connect Discord members to their Clash accounts.'
    ]);
  }

  return clippedDiscordText([
    `**${clan?.name || guild?.defaultClanName || 'Configured clan'} (${defaultTag}) setup**`,
    `Default clan: ${clan?.name || guild?.defaultClanName || 'Clan'} (${defaultTag}).`,
    `Tracking: ${Object.keys(store.tracked?.players || {}).length} players, ${Object.keys(store.tracked?.clans || {}).length} clans, ${Object.keys(store.tracked?.wars || {}).length} war/CWL tags.`,
    `Linked players in this server: ${linkedPlayers}.`,
    guild?.updatedAt ? `Last updated ${comparableDateText(guild.updatedAt)}${guild.updatedBy ? ` by ${guild.updatedBy}` : ''}.` : null,
    '',
    '**Useful next commands**',
    '`/summary` - command center for this clan.',
    '`/roster signup player:#TAG` - add yourself to CWL/war planning.',
    '`/roster plan size:15` - build a first roster from tracked data.',
    '`/link player tag:#TAG` - connect a Discord user to a Clash account.'
  ]);
}

export async function linkClashPlayerToDiscord({
  playerTag,
  guildId = null,
  userId = null,
  username = null,
  storePath = clashHistoryStorePath(),
  now = new Date(),
  fetchPlayerImpl = fetchPlayer
} = {}) {
  const normalizedPlayerTag = normalizePlayerTag(playerTag);
  const guildKey = guildKeyFor(guildId);
  const userKey = userKeyFor(userId);
  const player = await fetchPlayerImpl(normalizedPlayerTag);

  return withStoreLock(async () => {
    const store = await readClashHistoryStore(storePath);
    const playerResult = recordPlayerSnapshotInStore(store, player, {
      now,
      source: `link:${guildKey}:${userKey}`
    });
    const link = ensureUserLink(store, { userId: userKey, username, now });
    link.players[normalizedPlayerTag] = {
      playerTag: normalizedPlayerTag,
      name: playerResult.snapshot.name,
      guildId: guildKey,
      linkedAt: link.players[normalizedPlayerTag]?.linkedAt || isoDate(now),
      updatedAt: isoDate(now)
    };
    link.primaryPlayerTag = link.primaryPlayerTag || normalizedPlayerTag;
    link.updatedAt = isoDate(now);
    await writeClashHistoryStore(store, storePath);
    return {
      store,
      link,
      player: playerResult.record,
      snapshot: playerResult.snapshot,
      appended: playerResult.appended
    };
  });
}

export async function removeClashPlayerLink({
  playerTag,
  userId = null,
  storePath = clashHistoryStorePath(),
  now = new Date()
} = {}) {
  const normalizedPlayerTag = normalizePlayerTag(playerTag);
  const userKey = userKeyFor(userId);

  return withStoreLock(async () => {
    const store = await readClashHistoryStore(storePath);
    if (!store.links?.[userKey]) {
      return {
        store,
        link: null,
        playerTag: normalizedPlayerTag,
        removed: false
      };
    }
    const link = ensureUserLink(store, { userId: userKey, now });
    const removed = Boolean(link.players[normalizedPlayerTag]);
    delete link.players[normalizedPlayerTag];
    if (link.primaryPlayerTag === normalizedPlayerTag) {
      link.primaryPlayerTag = Object.keys(link.players)[0] || null;
    }
    link.updatedAt = isoDate(now);
    await writeClashHistoryStore(store, storePath);
    return {
      store,
      link,
      playerTag: normalizedPlayerTag,
      removed
    };
  });
}

export function buildClashLinkStatusText(store, { userId = null, username = null } = {}) {
  const userKey = userKeyFor(userId);
  const link = store.links?.[userKey] || null;
  const displayName = compactText(username || link?.username, 80) || 'This Discord user';
  const players = Object.values(link?.players || {}).sort((a, b) =>
    String(a.linkedAt || '').localeCompare(String(b.linkedAt || ''))
  );

  if (!players.length) {
    return clippedDiscordText([
      `**${displayName} has no linked Clash players yet**`,
      'Use `/link player tag:#PLAYER` to connect a Discord member to a Clash account.',
      'Linked players let roster, activity, and future reminders understand who is who.'
    ]);
  }

  return clippedDiscordText([
    `**${displayName} linked Clash players**`,
    ...players.slice(0, 12).map((player, index) => {
      const record = store.players?.[player.playerTag] || null;
      const current = record?.current || null;
      const primary = link?.primaryPlayerTag === player.playerTag ? ' primary' : '';
      const clan = current?.clan?.name ? ` | ${current.clan.name}` : '';
      return `${index + 1}. ${current?.name || player.name || 'Player'} (${player.playerTag})${primary} - TH ${numberText(current?.townHallLevel)} | ${numberText(current?.trophies)} trophies${clan}`;
    }),
    players.length > 12 ? `...${players.length - 12} more linked player${players.length - 12 === 1 ? '' : 's'} hidden.` : null,
    '',
    'Use `/link remove tag:#PLAYER` if a linked account is wrong.'
  ]);
}

function rosterIdFor({ guildId = null, clanTag = null } = {}) {
  const guildKey = compactText(guildId, 80) || 'global';
  const clanKey = clanTag ? normalizeClanTag(clanTag) : 'unassigned';
  return `${guildKey}:${clanKey}`;
}

function playerCurrentClanTag(record) {
  const tag = record?.current?.clan?.tag || null;
  if (!tag) {
    return null;
  }
  try {
    return normalizeClanTag(tag);
  } catch {
    return null;
  }
}

function resolveRosterClanTag(store, { clanTag = null, playerRecord = null, guildId = null } = {}) {
  if (clanTag) {
    return normalizeClanTag(clanTag);
  }
  const defaultClanTag = defaultClanTagForGuild(store, guildId);
  if (defaultClanTag) {
    return defaultClanTag;
  }
  const selectedClan = selectRosterClan(store);
  if (selectedClan?.tag || selectedClan?.current?.tag) {
    return normalizeClanTag(selectedClan.tag || selectedClan.current.tag);
  }
  return playerCurrentClanTag(playerRecord);
}

function ensureRosterRecord(store, { guildId = null, clanTag = null, now = new Date() } = {}) {
  const normalizedClanTag = clanTag ? normalizeClanTag(clanTag) : null;
  const id = rosterIdFor({ guildId, clanTag: normalizedClanTag });
  const at = isoDate(now);
  const record = {
    id,
    guildId: compactText(guildId, 80) || 'global',
    clanTag: normalizedClanTag,
    createdAt: at,
    updatedAt: at,
    signups: {},
    ...(store.rosters?.[id] || {})
  };
  record.id = id;
  record.guildId = compactText(record.guildId, 80) || 'global';
  record.clanTag = normalizedClanTag;
  record.createdAt = record.createdAt || at;
  record.updatedAt = at;
  record.signups = record.signups && typeof record.signups === 'object' ? record.signups : {};
  store.rosters[id] = record;
  return record;
}

function selectRosterRecord(store, { guildId = null, clanTag = null } = {}) {
  const normalizedClanTag = clanTag ? normalizeClanTag(clanTag) : null;
  const guildKey = compactText(guildId, 80) || null;
  const rosters = Object.values(store.rosters || {}).filter((record) => {
    if (!record || typeof record !== 'object') {
      return false;
    }
    if (guildKey && record.guildId && record.guildId !== guildKey) {
      return false;
    }
    if (normalizedClanTag && record.clanTag !== normalizedClanTag) {
      return false;
    }
    return true;
  });
  return rosters.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] || null;
}

function uniqueRosterMemberTags(clan) {
  return [
    ...(clan?.current?.memberTags || []),
    ...Object.keys(clan?.members || {})
  ].flatMap((tag) => {
    try {
      return [normalizePlayerTag(tag)];
    } catch {
      return [];
    }
  }).filter((tag, index, tags) => tags.indexOf(tag) === index);
}

function signupDisplayName(signup) {
  return compactText(signup?.username, 80) || compactText(signup?.userId, 80) || 'Discord user';
}

function rosterSignupLine(store, signup, index) {
  const candidate = rosterCandidate(store, signup.playerTag);
  const note = signup.note ? ` | ${signup.note}` : '';
  return `${index}. ${candidate.name} (${candidate.tag}) - ${signupDisplayName(signup)} - ${rosterReason(candidate)}${note}`;
}

export async function signupClashRoster({
  playerTag,
  clanTag = null,
  guildId = null,
  userId = null,
  username = null,
  note = null,
  storePath = clashHistoryStorePath(),
  now = new Date(),
  fetchPlayerImpl = fetchPlayer
} = {}) {
  const normalizedPlayerTag = normalizePlayerTag(playerTag);
  const player = await fetchPlayerImpl(normalizedPlayerTag);

  return withStoreLock(async () => {
    const store = await readClashHistoryStore(storePath);
    const playerResult = recordPlayerSnapshotInStore(store, player, {
      now,
      source: `roster:${compactText(guildId, 80) || 'global'}:${compactText(userId, 80) || 'unknown'}`
    });
    const resolvedClanTag = resolveRosterClanTag(store, {
      clanTag,
      playerRecord: playerResult.record,
      guildId
    });
    const roster = ensureRosterRecord(store, {
      guildId,
      clanTag: resolvedClanTag,
      now
    });
    roster.signups[normalizedPlayerTag] = {
      playerTag: normalizedPlayerTag,
      userId: compactText(userId, 80),
      username: compactText(username, 80),
      note: compactText(note, 120),
      signedUpAt: roster.signups[normalizedPlayerTag]?.signedUpAt || isoDate(now),
      updatedAt: isoDate(now)
    };
    await writeClashHistoryStore(store, storePath);
    return {
      store,
      roster,
      signup: roster.signups[normalizedPlayerTag],
      record: playerResult.record,
      snapshot: playerResult.snapshot,
      appended: playerResult.appended
    };
  });
}

export function buildClashRosterStatusText(store, { clanTag = null, guildId = null } = {}) {
  const normalizedClanTag = clanTag ? normalizeClanTag(clanTag) : null;
  const selectedClanTag = normalizedClanTag || defaultClanTagForGuild(store, guildId);
  const roster = selectRosterRecord(store, { guildId, clanTag: selectedClanTag });
  const clan = selectRosterClan(store, selectedClanTag || roster?.clanTag || null);
  const memberTags = uniqueRosterMemberTags(clan);
  const signups = Object.values(roster?.signups || {})
    .filter((signup) => signup?.playerTag)
    .sort((a, b) => String(a.signedUpAt || '').localeCompare(String(b.signedUpAt || '')));
  const signupTags = new Set(signups.map((signup) => signup.playerTag));
  const missing = memberTags.filter((tag) => !signupTags.has(tag)).slice(0, 8);
  const signedWithSnapshots = signups.filter((signup) => store.players?.[signup.playerTag]?.current).length;
  const clanName = clan?.name || clan?.current?.name || 'Clan';
  const displayedClanTag = selectedClanTag || roster?.clanTag || clan?.tag || clan?.current?.tag || null;
  const lines = [
    `**${displayedClanTag ? `${clanName} (${displayedClanTag})` : 'Roster'} status**`,
    `Signups: ${signups.length}. Clan pool: ${memberTags.length || 'unknown'}. Signed player snapshots: ${signedWithSnapshots}/${signups.length}.`,
    '',
    '**Signed up**'
  ];

  if (signups.length) {
    lines.push(...signups.slice(0, 12).map((signup, index) => rosterSignupLine(store, signup, index + 1)));
    if (signups.length > 12) {
      lines.push(`...${signups.length - 12} more signup${signups.length - 12 === 1 ? '' : 's'} hidden to keep Discord readable.`);
    }
  } else {
    lines.push('No one has signed up yet. Use `/roster signup player:#TAG clan:#CLAN note:available for CWL`.');
  }

  lines.push('', '**Missing from signup**');
  if (missing.length) {
    lines.push(
      ...missing.map((tag) => {
        const candidate = rosterCandidate(store, tag, clan?.members?.[tag] || null);
        return `${candidate.name} (${candidate.tag}) - ${rosterReason(candidate)}`;
      })
    );
  } else if (memberTags.length) {
    lines.push('Every tracked clan member has a roster signup.');
  } else {
    lines.push('Track a clan with `/track clan tag:#CLAN` to compare signups against the current member list.');
  }

  lines.push(
    '',
    '**Data note**',
    'Roster status gets smarter as `/track clan`, `/track player`, and `/history player` add snapshots and war/CWL rows.'
  );

  const text = lines.join('\n');
  return text.length > 1900 ? `${text.slice(0, 1880)}\n...` : text;
}

export function buildClashRosterPlanText(
  store,
  { clanTag = null, size = 15, style = 'balanced', guildId = null } = {}
) {
  const selectedClanTag = clanTag || defaultClanTagForGuild(store, guildId);
  const clan = selectRosterClan(store, selectedClanTag);
  if (!clan?.current) {
    return null;
  }

  const rosterSize = Math.min(50, Math.max(5, Number.isFinite(size) ? size : 15));
  const normalizedStyle = ['safe', 'balanced', 'growth'].includes(style) ? style : 'balanced';
  const memberTags = [
    ...(clan.current.memberTags || []),
    ...Object.keys(clan.members || {})
  ];
  const uniqueTags = [
    ...new Set(
      memberTags.flatMap((tag) => {
        try {
          return [normalizePlayerTag(tag)];
        } catch {
          return [];
        }
      })
    )
  ];
  const candidates = uniqueTags
    .map((tag) => rosterCandidate(store, tag, clan.members?.[tag] || null, normalizedStyle))
    .sort((a, b) => b.score - a.score || b.townHall - a.townHall || b.heroScore - a.heroScore);
  const starters = candidates.slice(0, rosterSize);
  const displayedStarters = starters.slice(0, Math.min(rosterSize, 20));
  const bench = candidates.slice(rosterSize, rosterSize + 5);
  const snapshotCount = candidates.filter((candidate) => candidate.hasPlayerSnapshot).length;
  const warCount = candidates.filter((candidate) => candidate.war.rows > 0).length;
  const missing = candidates.filter((candidate) => !candidate.hasPlayerSnapshot).slice(0, 8);
  const lines = [
    `**${clan.name || clan.current.name || 'Clan'} (${clan.tag || clan.current.tag}) roster plan**`,
    `Style: ${normalizedStyle}. Target size: ${rosterSize}. Pool: ${candidates.length} member${candidates.length === 1 ? '' : 's'}.`,
    `Data: ${snapshotCount}/${candidates.length} have player snapshots, ${warCount}/${candidates.length} have collected war/CWL rows.`,
    '',
    '**Suggested lineup**',
    ...(displayedStarters.length
      ? displayedStarters.map((candidate, index) => rosterLine(candidate, index + 1))
      : ['No members found in the tracked clan snapshot.'])
  ];

  if (displayedStarters.length < starters.length) {
    lines.push(`...${starters.length - displayedStarters.length} more starter${starters.length - displayedStarters.length === 1 ? '' : 's'} hidden to keep Discord readable.`);
  }

  lines.push('', '**Bench watch**');
  if (bench.length) {
    lines.push(...bench.map((candidate, index) => rosterLine(candidate, rosterSize + index + 1)));
  } else {
    lines.push('No bench candidates outside the selected roster size yet.');
  }

  lines.push('', '**Needs more data**');
  if (missing.length) {
    lines.push(
      ...missing.map(
        (candidate) =>
          `${candidate.name} (${candidate.tag}) needs /history player or another scheduled player snapshot.`
      )
    );
  } else {
    lines.push('Every listed member has at least one player snapshot.');
  }

  lines.push(
    '',
    'This is a planning aid, not a final war call. It gets better as `/track clan`, `/track player`, and `/history player` collect more snapshots and war rows.'
  );

  const text = lines.join('\n');
  return text.length > 1900 ? `${text.slice(0, 1880)}\n...` : text;
}

function clippedDiscordText(lines) {
  const text = lines.filter((line) => line !== null && line !== undefined).join('\n');
  return text.length > 1900 ? `${text.slice(0, 1880)}\n...` : text;
}

function normalizeMaybeClanTag(tag) {
  if (!tag) {
    return null;
  }
  try {
    return normalizeClanTag(tag);
  } catch {
    return null;
  }
}

function normalizeMaybePlayerTag(tag) {
  if (!tag) {
    return null;
  }
  try {
    return normalizePlayerTag(tag);
  } catch {
    return null;
  }
}

function selectReportClanTag(store, { clanTag = null, guildId = null } = {}) {
  if (clanTag) {
    return normalizeClanTag(clanTag);
  }
  const defaultClanTag = defaultClanTagForGuild(store, guildId);
  if (defaultClanTag) {
    return defaultClanTag;
  }
  const clan = selectRosterClan(store);
  if (clan?.tag || clan?.current?.tag) {
    return normalizeClanTag(clan.tag || clan.current.tag);
  }
  const tracked = Object.keys(store.tracked?.clans || {}).sort();
  return tracked[0] ? normalizeClanTag(tracked[0]) : null;
}

function reportClanLabel(store, clanTag) {
  const clan = store.clans?.[clanTag] || null;
  return `${clan?.name || clan?.current?.name || 'Clan'} (${clanTag})`;
}

function comparableDateText(value) {
  return value ? dateText(value) : 'unknown';
}

function sortedSnapshots(record) {
  return Array.isArray(record?.snapshots)
    ? record.snapshots.slice().sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')))
    : [];
}

function memberName(store, tag, clan = null) {
  const normalizedTag = normalizeMaybePlayerTag(tag) || tag;
  return (
    store.players?.[normalizedTag]?.current?.name ||
    store.players?.[normalizedTag]?.name ||
    clan?.members?.[normalizedTag]?.name ||
    normalizedTag
  );
}

function latestMemberTags(clan) {
  return uniqueRosterMemberTags(clan);
}

function warSideForClan(war, clanTag) {
  const ownIsClan = normalizeMaybeClanTag(war?.clan?.tag) === clanTag;
  const ownIsOpponent = normalizeMaybeClanTag(war?.opponent?.tag) === clanTag;
  if (!ownIsClan && !ownIsOpponent) {
    return { own: null, enemy: null };
  }
  return ownIsClan
    ? { own: war.clan || null, enemy: war.opponent || null }
    : { own: war.opponent || null, enemy: war.clan || null };
}

function warsForClan(store, clanTag) {
  return Object.values(store.wars || {})
    .filter((war) => {
      const { own } = warSideForClan(war, clanTag);
      return Boolean(own);
    })
    .sort((a, b) =>
      String(b.endTime || b.startTime || b.lastSeenAt || '').localeCompare(
        String(a.endTime || a.startTime || a.lastSeenAt || '')
      )
    );
}

function warResultForClan(war, clanTag) {
  const { own, enemy } = warSideForClan(war, clanTag);
  if (!own || !enemy) {
    return 'seen';
  }
  if (Number.isFinite(own.stars) && Number.isFinite(enemy.stars) && own.stars !== enemy.stars) {
    return own.stars > enemy.stars ? 'win' : 'loss';
  }
  if (
    Number.isFinite(own.destructionPercentage) &&
    Number.isFinite(enemy.destructionPercentage) &&
    own.destructionPercentage !== enemy.destructionPercentage
  ) {
    return own.destructionPercentage > enemy.destructionPercentage ? 'win' : 'loss';
  }
  return 'tie';
}

function resultCounts(rows, clanTag) {
  return rows.reduce(
    (counts, war) => {
      const result = warResultForClan(war, clanTag);
      counts[result] = (counts[result] || 0) + 1;
      return counts;
    },
    { win: 0, loss: 0, tie: 0, seen: 0 }
  );
}

function sideMemberTags(war, clanTag) {
  return new Set(
    (war?.members || [])
      .filter((member) => normalizeMaybeClanTag(member.sideTag) === clanTag)
      .map((member) => normalizeMaybePlayerTag(member.tag))
      .filter(Boolean)
  );
}

function clanAttacksForWar(war, clanTag) {
  const tags = sideMemberTags(war, clanTag);
  return (war?.attacks || []).filter((attack) => tags.has(normalizeMaybePlayerTag(attack.attackerTag)));
}

function aggregateWarRows(rows, clanTag) {
  return rows.reduce(
    (total, war) => {
      const { own } = warSideForClan(war, clanTag);
      const attacks = clanAttacksForWar(war, clanTag);
      const members = sideMemberTags(war, clanTag);
      total.attacks += Number.isFinite(own?.attacks) ? own.attacks : attacks.length;
      total.stars += Number.isFinite(own?.stars)
        ? own.stars
        : attacks.reduce((sum, attack) => sum + (Number.isFinite(attack.stars) ? attack.stars : 0), 0);
      total.triples += attacks.filter((attack) => attack.stars === 3).length;
      if (Number.isFinite(war?.attacksPerMember) && members.size) {
        total.missed += Math.max(0, members.size * war.attacksPerMember - attacks.length);
      }
      if (!war?.summaryOnly && (war?.attacks || []).length) {
        total.fullRows += 1;
      } else {
        total.summaryRows += 1;
      }
      return total;
    },
    { attacks: 0, stars: 0, triples: 0, missed: 0, fullRows: 0, summaryRows: 0 }
  );
}

function topWarAttackers(store, clanTag, limit = 5) {
  const rows = [];
  for (const record of Object.values(store.players || {})) {
    const playerRows = Object.values(record?.warStats || {}).filter(
      (row) => normalizeMaybeClanTag(row.clanTag) === clanTag
    );
    if (!playerRows.length) {
      continue;
    }
    const attacks = playerRows.flatMap((row) => row.attacks || []);
    rows.push({
      tag: record.tag,
      name: record.current?.name || record.name || record.tag,
      attacks: attacks.length,
      stars: attacks.reduce((total, attack) => total + (Number.isFinite(attack.stars) ? attack.stars : 0), 0),
      triples: attacks.filter((attack) => attack.stars === 3).length,
      missed: playerRows.reduce(
        (total, row) => total + (Number.isFinite(row.missedAttacks) ? row.missedAttacks : 0),
        0
      )
    });
  }
  return rows
    .sort((a, b) => b.stars - a.stars || b.triples - a.triples || a.missed - b.missed || b.attacks - a.attacks)
    .slice(0, limit);
}

export function buildClashWarStatsText(store, { clanTag = null, guildId = null } = {}) {
  const selectedClanTag = selectReportClanTag(store, { clanTag, guildId });
  if (!selectedClanTag) {
    return null;
  }

  const rows = warsForClan(store, selectedClanTag);
  const counts = resultCounts(rows, selectedClanTag);
  const aggregate = aggregateWarRows(rows, selectedClanTag);
  const topAttackers = topWarAttackers(store, selectedClanTag);
  const recentRows = rows.slice(0, 5).map((war) => {
    const { own, enemy } = warSideForClan(war, selectedClanTag);
    const result = warResultForClan(war, selectedClanTag);
    const score =
      Number.isFinite(own?.stars) && Number.isFinite(enemy?.stars)
        ? `${own.stars}-${enemy.stars}`
        : 'score unknown';
    return `- ${comparableDateText(war.endTime || war.startTime || war.lastSeenAt)} ${result} vs ${enemy?.name || enemy?.tag || 'opponent'} (${score})`;
  });

  const lines = [
    `**${reportClanLabel(store, selectedClanTag)} war stats**`,
    rows.length
      ? `${rows.length} war/CWL row${rows.length === 1 ? '' : 's'} collected: ${counts.win}W-${counts.loss}L-${counts.tie}T.`
      : 'No collected war/CWL rows for this clan yet.',
    rows.length
      ? `Attacks ${numberText(aggregate.attacks)} | Stars ${numberText(aggregate.stars)} | Triples ${numberText(aggregate.triples)} | Missed ${numberText(aggregate.missed)}`
      : 'Use `/track clan tag:#CLAN` so current wars, CWL war tags, and public war-log summaries can start collecting.',
    aggregate.summaryRows && !aggregate.fullRows
      ? 'Data note: current rows are public war-log summaries only. Attack-level missed-hit stats start once mavebot sees current wars or CWL wars while polling.'
      : null,
    '',
    '**Recent wars**',
    ...(recentRows.length ? recentRows : ['No recent war rows in the store yet.']),
    '',
    '**Top attackers from full rows**',
    ...(topAttackers.length
      ? topAttackers.map(
          (row, index) =>
            `${index + 1}. ${row.name} (${row.tag}) - ${row.stars} stars, ${row.triples} triples, ${row.missed} missed`
        )
      : ['No attack-level rows collected yet.'])
  ];

  return clippedDiscordText(lines);
}

function playerSnapshotDelta(store, tag) {
  const normalizedTag = normalizeMaybePlayerTag(tag);
  const snapshots = sortedSnapshots(store.players?.[normalizedTag]);
  const latest = snapshots.at(-1) || store.players?.[normalizedTag]?.current || null;
  const previous = snapshots.length > 1 ? snapshots.at(-2) : null;
  const first = snapshots[0] || null;
  return {
    tag: normalizedTag,
    name: memberName(store, normalizedTag),
    snapshots: snapshots.length,
    latest,
    previous,
    first,
    donationsDelta:
      previous && Number.isFinite(latest?.donations) && Number.isFinite(previous.donations)
        ? latest.donations - previous.donations
        : null,
    receivedDelta:
      previous && Number.isFinite(latest?.donationsReceived) && Number.isFinite(previous.donationsReceived)
        ? latest.donationsReceived - previous.donationsReceived
        : null,
    trophiesDelta:
      previous && Number.isFinite(latest?.trophies) && Number.isFinite(previous.trophies)
        ? latest.trophies - previous.trophies
        : null,
    trophiesTotalDelta:
      first && latest && first !== latest && Number.isFinite(latest.trophies) && Number.isFinite(first.trophies)
        ? latest.trophies - first.trophies
        : null,
    latestSeenAt: store.players?.[normalizedTag]?.lastSeenAt || latest?.at || null
  };
}

function topPlayerDeltas(rows, key, limit = 5) {
  return rows
    .filter((row) => Number.isFinite(row[key]) && row[key] !== 0)
    .sort((a, b) => Math.abs(b[key]) - Math.abs(a[key]))
    .slice(0, limit);
}

function deltaLine(row, key, label) {
  return `${row.name} (${row.tag}) ${label} ${signedDeltaText(row[key])}`;
}

export function buildClashActivityText(store, { clanTag = null, guildId = null } = {}) {
  const selectedClanTag = selectReportClanTag(store, { clanTag, guildId });
  if (!selectedClanTag) {
    return null;
  }
  const clan = store.clans?.[selectedClanTag] || null;
  if (!clan?.current) {
    return clippedDiscordText([
      `**${reportClanLabel(store, selectedClanTag)} activity**`,
      'Track this clan first with `/track clan tag:#CLAN`. Activity needs at least one clan snapshot.'
    ]);
  }

  const snapshots = sortedSnapshots(clan);
  const latest = snapshots.at(-1) || clan.current;
  const previous = snapshots.length > 1 ? snapshots.at(-2) : null;
  const latestTags = new Set((latest.memberTags || []).map(normalizeMaybePlayerTag).filter(Boolean));
  const previousTags = new Set((previous?.memberTags || []).map(normalizeMaybePlayerTag).filter(Boolean));
  const joined = [...latestTags].filter((tag) => previous && !previousTags.has(tag));
  const left = [...previousTags].filter((tag) => previous && !latestTags.has(tag));
  const memberTags = latestMemberTags(clan);
  const deltas = memberTags.map((tag) => playerSnapshotDelta(store, tag));
  const donationRows = topPlayerDeltas(deltas, 'donationsDelta');
  const receivedRows = topPlayerDeltas(deltas, 'receivedDelta');
  const trophyRows = topPlayerDeltas(deltas, 'trophiesDelta');
  const missingSnapshots = deltas.filter((row) => !row.snapshots).slice(0, 6);

  const lines = [
    `**${reportClanLabel(store, selectedClanTag)} activity**`,
    `Clan snapshots: ${snapshots.length}. Latest: ${comparableDateText(latest.at || clan.lastSeenAt)}. Members: ${numberText(latest.memberTags?.length || clan.current.members)}.`,
    previous
      ? `Movement since last clan snapshot: ${joined.length} joined, ${left.length} left.`
      : 'Only one clan snapshot exists so far. Join/leave movement appears after the next clan poll.',
    '',
    '**Member movement**',
    joined.length
      ? `Joined: ${joined.map((tag) => `${memberName(store, tag, clan)} (${tag})`).slice(0, 8).join(', ')}`
      : 'Joined: none seen since the last snapshot.',
    left.length
      ? `Left: ${left.map((tag) => `${memberName(store, tag, clan)} (${tag})`).slice(0, 8).join(', ')}`
      : 'Left: none seen since the last snapshot.',
    '',
    '**Donations and trophies**',
    ...(donationRows.length
      ? donationRows.map((row) => `- ${deltaLine(row, 'donationsDelta', 'donated')}`)
      : ['- Donation deltas need at least two player snapshots.']),
    ...(receivedRows.length
      ? receivedRows.slice(0, 3).map((row) => `- ${deltaLine(row, 'receivedDelta', 'received')}`)
      : []),
    ...(trophyRows.length
      ? trophyRows.slice(0, 3).map((row) => `- ${deltaLine(row, 'trophiesDelta', 'trophies')}`)
      : []),
    '',
    '**Needs more data**',
    ...(missingSnapshots.length
      ? missingSnapshots.map(
          (row) =>
            `${memberName(store, row.tag, clan)} (${row.tag}) needs /history player or the scheduled player poll.`
        )
      : ['Every current member has at least one player snapshot.'])
  ];

  return clippedDiscordText(lines);
}

function rosterSummaryCounts(store, clanTag) {
  const clan = store.clans?.[clanTag] || null;
  const memberTags = latestMemberTags(clan);
  const rosters = Object.values(store.rosters || {}).filter((record) => record?.clanTag === clanTag);
  const latestRoster = rosters.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] || null;
  const signups = Object.values(latestRoster?.signups || {}).filter((signup) => signup?.playerTag);
  const signedTags = new Set(signups.map((signup) => signup.playerTag));
  return {
    signups: signups.length,
    missing: memberTags.filter((tag) => !signedTags.has(tag)).length,
    memberCount: memberTags.length
  };
}

export function buildClashSummaryText(store, { clanTag = null, guildId = null } = {}) {
  const selectedClanTag = selectReportClanTag(store, { clanTag, guildId });
  if (!selectedClanTag) {
    return clippedDiscordText([
      '**Clash operations summary**',
      'No tracked clan yet. Start with `/track clan tag:#CLAN`, then use `/summary`, `/activity`, `/warstats`, and `/roster plan`.'
    ]);
  }

  const clan = store.clans?.[selectedClanTag] || null;
  const tracked = store.tracked?.clans?.[selectedClanTag] || null;
  const clanSnapshots = sortedSnapshots(clan).length;
  const playerSnapshots = Object.values(store.players || {}).reduce(
    (total, record) => total + (Array.isArray(record?.snapshots) ? record.snapshots.length : 0),
    0
  );
  const rows = warsForClan(store, selectedClanTag);
  const counts = resultCounts(rows, selectedClanTag);
  const aggregate = aggregateWarRows(rows, selectedClanTag);
  const roster = rosterSummaryCounts(store, selectedClanTag);
  const latest = clan?.current || null;
  const lines = [
    `**${reportClanLabel(store, selectedClanTag)} command center**`,
    latest
      ? `Clan: level ${numberText(latest.level)} | ${numberText(latest.memberTags?.length || latest.members)} members | ${latest.warLeague || 'war league unknown'}`
      : 'Clan: tracked but no clan snapshot has completed yet.',
    `Tracking: ${Object.keys(store.tracked?.players || {}).length} players, ${Object.keys(store.tracked?.clans || {}).length} clans, ${Object.keys(store.tracked?.wars || {}).length} CWL/current-war tags.`,
    `Snapshots: ${clanSnapshots} clan, ${playerSnapshots} player. Last checked ${comparableDateText(tracked?.lastCheckedAt)}; next due ${comparableDateText(tracked?.nextDueAt)}.`,
    '',
    '**Roster**',
    roster.memberCount
      ? `${roster.signups} signed up, ${roster.missing} current clan member${roster.missing === 1 ? '' : 's'} missing signup. Use /roster status clan:${selectedClanTag}.`
      : 'Use `/track clan` to seed the member pool, then `/roster signup` and `/roster plan`.',
    '',
    '**War/CWL**',
    rows.length
      ? `${rows.length} row${rows.length === 1 ? '' : 's'}: ${counts.win}W-${counts.loss}L-${counts.tie}T, ${numberText(aggregate.stars)} stars, ${numberText(aggregate.missed)} missed attacks from available full rows. Use /warstats clan:${selectedClanTag}.`
      : `No war rows yet. Keep /track clan tag:${selectedClanTag} running so current wars and public war-log summaries can collect.`,
    '',
    '**Activity**',
    clanSnapshots > 1
      ? `Activity has ${clanSnapshots} clan snapshots. Use /activity clan:${selectedClanTag} for joins/leaves and player deltas.`
      : 'Activity is shallow until the next scheduled clan/player snapshots.',
    '',
    'Best next checks: /activity, /warstats, /roster plan, and /history player for specific members.'
  ];

  return clippedDiscordText(lines);
}

function isDue(record, now) {
  if (record?.completedAt) {
    return false;
  }
  return !record?.nextDueAt || new Date(record.nextDueAt).getTime() <= new Date(now).getTime();
}

function workItems(store) {
  return [
    ...Object.keys(store.tracked.clans || {})
      .sort()
      .map((tag) => ({ type: 'clan', tag, record: store.tracked.clans[tag] })),
    ...Object.keys(store.tracked.wars || {})
      .sort()
      .map((tag) => ({ type: 'war', tag, record: store.tracked.wars[tag] })),
    ...Object.keys(store.tracked.players || {})
      .sort()
      .map((tag) => ({ type: 'player', tag, record: store.tracked.players[tag] }))
  ];
}

export async function trackNextClashHistorySubject({
  storePath = clashHistoryStorePath(),
  now = new Date(),
  configuredClanTags: clanTags = configuredClashHistoryClanTags(),
  configuredPlayerTags: playerTags = configuredClashHistoryPlayerTags(),
  extraPlayerTags = [],
  playerIntervalMs = DEFAULT_CLASH_HISTORY_PLAYER_INTERVAL_MS,
  clanIntervalMs = DEFAULT_CLASH_HISTORY_CLAN_INTERVAL_MS,
  warIntervalMs = DEFAULT_CLASH_HISTORY_WAR_INTERVAL_MS,
  fetchPlayerImpl = fetchPlayer,
  fetchClanImpl = fetchClan,
  fetchCurrentWarImpl = fetchCurrentWar,
  fetchCurrentCwlGroupImpl = fetchCurrentCwlGroup,
  fetchClanWarLogImpl = fetchClanWarLog,
  fetchCwlWarImpl = fetchCwlWar
} = {}) {
  return withStoreLock(async () => {
    const store = await readClashHistoryStore(storePath);
    addConfiguredClashHistorySubjects(store, {
      clanTags,
      playerTags: [...playerTags, ...extraPlayerTags],
      now
    });
    const items = workItems(store);
    if (!items.length) {
      store.scheduler.lastRunAt = isoDate(now);
      store.scheduler.lastAction = 'idle:no-tracked-subjects';
      await writeClashHistoryStore(store, storePath);
      return { tracked: false, reason: 'no tracked subjects', store };
    }

    const start = Math.max(0, store.scheduler.cursor || 0) % items.length;
    let selected = null;
    let selectedIndex = -1;
    for (let offset = 0; offset < items.length; offset += 1) {
      const index = (start + offset) % items.length;
      if (isDue(items[index].record, now)) {
        selected = items[index];
        selectedIndex = index;
        break;
      }
    }

    if (!selected) {
      store.scheduler.lastRunAt = isoDate(now);
      store.scheduler.lastAction = 'idle:no-due-subjects';
      await writeClashHistoryStore(store, storePath);
      return { tracked: false, reason: 'no due subjects', store };
    }

    store.scheduler.cursor = (selectedIndex + 1) % items.length;
    store.scheduler.lastRunAt = isoDate(now);
    try {
      const options = {
        now,
        playerIntervalMs,
        clanIntervalMs,
        warIntervalMs,
        fetchPlayerImpl,
        fetchClanImpl,
        fetchCurrentWarImpl,
        fetchCurrentCwlGroupImpl,
        fetchClanWarLogImpl,
        fetchCwlWarImpl
      };
      const result =
        selected.type === 'clan'
          ? await collectClan(store, selected.tag, options)
          : selected.type === 'war'
            ? await collectWar(store, selected.tag, options)
            : await collectPlayer(store, selected.tag, options);
      store.scheduler.lastAction = `${selected.type}:${selected.tag}`;
      store.scheduler.lastError = null;
      await writeClashHistoryStore(store, storePath);
      return { ...result, store };
    } catch (error) {
      store.scheduler.lastAction = `${selected.type}:${selected.tag}`;
      store.scheduler.lastError = {
        at: isoDate(now),
        message: String(error?.message || error || 'Unknown collector error').slice(0, 500)
      };
      await writeClashHistoryStore(store, storePath);
      return { tracked: false, type: selected.type, tag: selected.tag, error, store };
    }
  });
}

export function startClashHistoryCollector({
  storePath = clashHistoryStorePath(),
  intervalMs = DEFAULT_CLASH_HISTORY_INTERVAL_MS,
  playerIntervalMs = DEFAULT_CLASH_HISTORY_PLAYER_INTERVAL_MS,
  clanIntervalMs = DEFAULT_CLASH_HISTORY_CLAN_INTERVAL_MS,
  warIntervalMs = DEFAULT_CLASH_HISTORY_WAR_INTERVAL_MS,
  extraPlayerTagsProvider = async () => [],
  onError = (error) => console.error('Clash history collector failed:', error)
} = {}) {
  let running = false;
  const run = async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      const extraPlayerTags = await extraPlayerTagsProvider();
      await trackNextClashHistorySubject({
        storePath,
        extraPlayerTags,
        playerIntervalMs,
        clanIntervalMs,
        warIntervalMs
      });
    } catch (error) {
      onError(error);
    } finally {
      running = false;
    }
  };

  const firstTimer = setTimeout(run, Math.min(intervalMs, 20000));
  firstTimer.unref?.();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return () => {
    clearTimeout(firstTimer);
    clearInterval(timer);
  };
}
