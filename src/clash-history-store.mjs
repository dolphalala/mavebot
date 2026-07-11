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
    rosters: {},
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

function resolveRosterClanTag(store, { clanTag = null, playerRecord = null } = {}) {
  if (clanTag) {
    return normalizeClanTag(clanTag);
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
      playerRecord: playerResult.record
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
  const roster = selectRosterRecord(store, { guildId, clanTag: normalizedClanTag });
  const clan = selectRosterClan(store, normalizedClanTag || roster?.clanTag || null);
  const memberTags = uniqueRosterMemberTags(clan);
  const signups = Object.values(roster?.signups || {})
    .filter((signup) => signup?.playerTag)
    .sort((a, b) => String(a.signedUpAt || '').localeCompare(String(b.signedUpAt || '')));
  const signupTags = new Set(signups.map((signup) => signup.playerTag));
  const missing = memberTags.filter((tag) => !signupTags.has(tag)).slice(0, 8);
  const signedWithSnapshots = signups.filter((signup) => store.players?.[signup.playerTag]?.current).length;
  const clanName = clan?.name || clan?.current?.name || 'Clan';
  const displayedClanTag = normalizedClanTag || roster?.clanTag || clan?.tag || clan?.current?.tag || null;
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
  { clanTag = null, size = 15, style = 'balanced' } = {}
) {
  const clan = selectRosterClan(store, clanTag);
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
