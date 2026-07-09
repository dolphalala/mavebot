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
    tracked: {
      players: {},
      clans: {},
      wars: {}
    },
    players: {},
    clans: {},
    wars: {},
    cwlGroups: {},
    scheduler: {
      cursor: 0,
      lastRunAt: null,
      lastAction: null,
      lastError: null
    }
  };
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
  store.players = store.players && typeof store.players === 'object' ? store.players : {};
  store.clans = store.clans && typeof store.clans === 'object' ? store.clans : {};
  store.wars = store.wars && typeof store.wars === 'object' ? store.wars : {};
  store.cwlGroups =
    store.cwlGroups && typeof store.cwlGroups === 'object' ? store.cwlGroups : {};
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
    fetchPlayerImpl = fetchPlayer
  } = options;
  const normalizedTag = normalizePlayerTag(tag);
  const tracked = ensureTrackedSubject(store.tracked.players, normalizedTag, {
    source: 'collector',
    now
  });
  try {
    const player = await fetchPlayerImpl(normalizedTag);
    const result = recordPlayerSnapshotInStore(store, player, { now, source: 'collector' });
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
    fetchClanImpl = fetchClan,
    fetchCurrentWarImpl = fetchCurrentWar,
    fetchCurrentCwlGroupImpl = fetchCurrentCwlGroup,
    fetchClanWarLogImpl = fetchClanWarLog
  } = options;
  const normalizedTag = normalizeClanTag(tag);
  const tracked = ensureTrackedSubject(store.tracked.clans, normalizedTag, {
    source: 'collector',
    now
  });
  try {
    const clan = await fetchClanImpl(normalizedTag);
    const result = recordClanSnapshotInStore(store, clan, { now, source: 'collector' });
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
