import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchPlayer, normalizePlayerTag } from './coc.mjs';

const DEFAULT_STORE_PATH = '/shared/legends-tracking.json';
export const DEFAULT_LEGENDS_INTERVAL_MS = 2 * 60 * 1000;
const MAX_SNAPSHOTS_PER_PLAYER = 2000;
const MAX_ERRORS_PER_PLAYER = 20;
const MST_OFFSET_MS = 7 * 60 * 60 * 1000;
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

function numberText(value) {
  return Number.isFinite(value) ? value.toLocaleString('en-US') : 'Unknown';
}

function truncateText(value, limit = 1024) {
  const text = String(value || '').trim();
  if (!text) {
    return 'None yet.';
  }
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function playerLeagueIcon(player) {
  return (
    player?.league?.iconUrls?.medium ||
    player?.league?.iconUrls?.small ||
    player?.clan?.badgeUrls?.medium ||
    player?.clan?.badgeUrls?.small ||
    null
  );
}

function emptyStore() {
  return {
    version: 1,
    players: {},
    scheduler: {
      cursor: 0
    }
  };
}

export function legendsStorePath() {
  return process.env.LEGENDS_STORE_PATH || DEFAULT_STORE_PATH;
}

export async function readLegendsStore(filePath = legendsStorePath()) {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8'));
    return {
      ...emptyStore(),
      ...parsed,
      players: parsed?.players && typeof parsed.players === 'object' ? parsed.players : {},
      scheduler:
        parsed?.scheduler && typeof parsed.scheduler === 'object'
          ? { cursor: 0, ...parsed.scheduler }
          : { cursor: 0 }
    };
  } catch {
    return emptyStore();
  }
}

export async function writeLegendsStore(store, filePath = legendsStorePath()) {
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

function mstParts(date) {
  const shifted = new Date(new Date(date).getTime() - MST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes()
  };
}

export function legendDayStartUtc(value = new Date()) {
  const date = new Date(value);
  const parts = mstParts(date);
  let localStart = Date.UTC(parts.year, parts.month, parts.day, 23, 0, 0, 0);
  if (parts.hour < 23) {
    localStart -= 24 * 60 * 60 * 1000;
  }
  return new Date(localStart + MST_OFFSET_MS);
}

export function formatMstTime(value) {
  const shifted = new Date(new Date(value).getTime() - MST_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  const hour = String(shifted.getUTCHours()).padStart(2, '0');
  const minute = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute} MST`;
}

export function legendDayLabel(value = new Date()) {
  return `${formatMstTime(legendDayStartUtc(value))} start`;
}

function snapshotFromPlayer(player, now = new Date()) {
  return {
    at: isoDate(now),
    tag: normalizePlayerTag(player.tag),
    name: player.name || 'Unknown player',
    trophies: numericOrNull(player.trophies),
    rank: numericOrNull(player.legendStatistics?.currentSeason?.rank),
    legendSeasonTrophies: numericOrNull(player.legendStatistics?.currentSeason?.trophies),
    league: player.league?.name || 'Unranked',
    leagueIconUrl: playerLeagueIcon(player),
    clanName: player.clan?.name || ''
  };
}

function createRecord(tag, now = new Date()) {
  return {
    tag,
    name: 'Unknown player',
    addedAt: isoDate(now),
    lastCheckedAt: null,
    nextDueAt: isoDate(now),
    current: null,
    snapshots: [],
    errors: []
  };
}

function shouldAppendSnapshot(record, snapshot) {
  const last = record.snapshots.at(-1);
  if (!last) {
    return true;
  }

  if (last.trophies !== snapshot.trophies || last.rank !== snapshot.rank) {
    return true;
  }

  if (last.name !== snapshot.name || last.clanName !== snapshot.clanName) {
    return true;
  }

  return legendDayStartUtc(last.at).getTime() !== legendDayStartUtc(snapshot.at).getTime();
}

export function recordLegendSnapshot(record, player, { now = new Date(), intervalMs = DEFAULT_LEGENDS_INTERVAL_MS } = {}) {
  const snapshot = snapshotFromPlayer(player, now);
  const previous = record.snapshots.at(-1) || null;
  const appended = shouldAppendSnapshot(record, snapshot);

  record.name = snapshot.name;
  record.lastCheckedAt = snapshot.at;
  record.nextDueAt = isoDate(new Date(new Date(now).getTime() + intervalMs));
  record.current = snapshot;
  record.lastError = null;

  if (appended) {
    record.snapshots.push(snapshot);
    if (record.snapshots.length > MAX_SNAPSHOTS_PER_PLAYER) {
      record.snapshots = record.snapshots.slice(-MAX_SNAPSHOTS_PER_PLAYER);
    }
  }

  return {
    snapshot,
    appended,
    delta:
      previous && Number.isFinite(previous.trophies) && Number.isFinite(snapshot.trophies)
        ? snapshot.trophies - previous.trophies
        : null
  };
}

function recordLegendError(record, error, { now = new Date(), intervalMs = DEFAULT_LEGENDS_INTERVAL_MS } = {}) {
  const row = {
    at: isoDate(now),
    message: String(error?.message || error || 'Unknown tracker error').slice(0, 500)
  };
  record.lastCheckedAt = row.at;
  record.nextDueAt = isoDate(new Date(new Date(now).getTime() + intervalMs));
  record.lastError = row;
  record.errors = [...(record.errors || []), row].slice(-MAX_ERRORS_PER_PLAYER);
}

export async function ensureLegendsTracked(
  tag,
  {
    storePath = legendsStorePath(),
    fetchPlayerImpl = fetchPlayer,
    now = new Date(),
    intervalMs = DEFAULT_LEGENDS_INTERVAL_MS
  } = {}
) {
  const normalizedTag = normalizePlayerTag(tag);
  const player = await fetchPlayerImpl(normalizedTag);
  return withStoreLock(async () => {
    const store = await readLegendsStore(storePath);
    const isNew = !store.players[normalizedTag];
    const record = store.players[normalizedTag] || createRecord(normalizedTag, now);
    const snapshotResult = recordLegendSnapshot(record, player, { now, intervalMs });
    store.players[normalizedTag] = record;
    await writeLegendsStore(store, storePath);
    return {
      store,
      record,
      player,
      isNew,
      ...snapshotResult
    };
  });
}

function orderedTrackedTags(store) {
  return Object.keys(store.players || {}).sort((a, b) => {
    const left = store.players[a]?.addedAt || '';
    const right = store.players[b]?.addedAt || '';
    return left.localeCompare(right) || a.localeCompare(b);
  });
}

function isDue(record, now) {
  return !record?.nextDueAt || new Date(record.nextDueAt).getTime() <= new Date(now).getTime();
}

export async function trackNextLegendPlayer({
  storePath = legendsStorePath(),
  fetchPlayerImpl = fetchPlayer,
  now = new Date(),
  intervalMs = DEFAULT_LEGENDS_INTERVAL_MS
} = {}) {
  return withStoreLock(async () => {
    const store = await readLegendsStore(storePath);
    const tags = orderedTrackedTags(store);
    if (!tags.length) {
      return { tracked: false, reason: 'no tracked players', store };
    }

    const start = Math.max(0, store.scheduler?.cursor || 0) % tags.length;
    let selectedTag = null;
    let selectedIndex = -1;
    for (let offset = 0; offset < tags.length; offset += 1) {
      const index = (start + offset) % tags.length;
      const tag = tags[index];
      if (isDue(store.players[tag], now)) {
        selectedTag = tag;
        selectedIndex = index;
        break;
      }
    }

    if (!selectedTag) {
      return { tracked: false, reason: 'no due players', store };
    }

    const record = store.players[selectedTag];
    store.scheduler.cursor = (selectedIndex + 1) % tags.length;
    try {
      const player = await fetchPlayerImpl(selectedTag);
      const result = recordLegendSnapshot(record, player, { now, intervalMs });
      await writeLegendsStore(store, storePath);
      return { tracked: true, tag: selectedTag, record, ...result };
    } catch (error) {
      recordLegendError(record, error, { now, intervalMs });
      await writeLegendsStore(store, storePath);
      return { tracked: false, tag: selectedTag, record, error };
    }
  });
}

function trophyDeltas(record) {
  const snapshots = record.snapshots || [];
  const rows = [];
  for (let index = 1; index < snapshots.length; index += 1) {
    const previous = snapshots[index - 1];
    const current = snapshots[index];
    if (!Number.isFinite(previous.trophies) || !Number.isFinite(current.trophies)) {
      continue;
    }
    const delta = current.trophies - previous.trophies;
    if (delta === 0) {
      continue;
    }
    rows.push({ previous, current, delta });
  }
  return rows;
}

function dailySnapshots(record, now = new Date()) {
  const start = legendDayStartUtc(now).getTime();
  return (record.snapshots || []).filter((snapshot) => new Date(snapshot.at).getTime() >= start);
}

export function buildLegendDayStats(record, now = new Date()) {
  const snapshots = dailySnapshots(record, now);
  if (!snapshots.length) {
    return {
      dayStart: legendDayStartUtc(now),
      snapshots,
      net: 0,
      gains: 0,
      losses: 0,
      high: null,
      low: null,
      changes: []
    };
  }

  let gains = 0;
  let losses = 0;
  const changes = [];
  for (let index = 1; index < snapshots.length; index += 1) {
    const previous = snapshots[index - 1];
    const current = snapshots[index];
    if (!Number.isFinite(previous.trophies) || !Number.isFinite(current.trophies)) {
      continue;
    }
    const delta = current.trophies - previous.trophies;
    if (delta > 0) {
      gains += delta;
    } else if (delta < 0) {
      losses += Math.abs(delta);
    }
    if (delta !== 0) {
      changes.push({ previous, current, delta });
    }
  }

  const trophyValues = snapshots.map((snapshot) => snapshot.trophies).filter(Number.isFinite);
  const first = snapshots[0];
  const latest = snapshots.at(-1);
  return {
    dayStart: legendDayStartUtc(now),
    snapshots,
    net:
      Number.isFinite(first?.trophies) && Number.isFinite(latest?.trophies)
        ? latest.trophies - first.trophies
        : 0,
    gains,
    losses,
    high: trophyValues.length ? Math.max(...trophyValues) : null,
    low: trophyValues.length ? Math.min(...trophyValues) : null,
    changes
  };
}

function signedNumber(value) {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return value > 0 ? `+${value}` : String(value);
}

function formatChangeRows(changes, limit = 10) {
  const rows = changes
    .slice(-limit)
    .reverse()
    .map(({ current, delta }) => {
      const trophies = Number.isFinite(current.trophies) ? ` -> ${numberText(current.trophies)}` : '';
      const rank = Number.isFinite(current.rank) ? `, rank #${numberText(current.rank)}` : '';
      return `${formatMstTime(current.at)}: ${signedNumber(delta)}${trophies}${rank}`;
    });
  return truncateText(rows.join('\n'));
}

function trackingIntervalText(trackedCount, intervalMs) {
  const minutes = Math.max(1, Math.round(intervalMs / 60000));
  if (trackedCount <= 1) {
    return `1 player tracked. This player is checked about every ${minutes} minute(s).`;
  }
  return `${trackedCount} players tracked. mavebot checks one due player every ${minutes} minute(s), round-robin.`;
}

export function buildLegendsPages(record, { now = new Date(), trackedCount = 1, intervalMs = DEFAULT_LEGENDS_INTERVAL_MS } = {}) {
  const current = record.current || record.snapshots?.at(-1) || {};
  const changes = trophyDeltas(record);
  const day = buildLegendDayStats(record, now);
  const rankText = Number.isFinite(current.rank) ? `#${numberText(current.rank)}` : 'Unknown';
  const latestTrophies = numberText(current.trophies);
  const latestChecked = current.at ? formatMstTime(current.at) : 'Not checked yet';
  const titleBase = `${record.name || current.name || 'Tracked player'} (${record.tag})`;

  return {
    profileUrl: `https://link.clashofclans.com/en?action=OpenPlayerProfile&tag=${record.tag.replace(/^#/, '')}`,
    footer: 'Legend tracking starts at 11:00 PM MST. One due tracked player is checked per cycle.',
    pages: [
      {
        id: 'timeline',
        label: 'Timeline',
        title: `${titleBase} - Legends tracker`,
        description: `Latest: ${latestTrophies} trophies, rank ${rankText}.\nLast checked: ${latestChecked}.`,
        thumbnailUrl: current.leagueIconUrl || null,
        fields: [
          {
            name: 'Recent trophy changes',
            value: formatChangeRows(changes, 10)
          },
          {
            name: 'Tracking',
            value: [
              trackingIntervalText(trackedCount, intervalMs),
              `Started: ${record.addedAt ? formatMstTime(record.addedAt) : 'Unknown'}`,
              record.lastError ? `Last error: ${record.lastError.message}` : null
            ]
              .filter(Boolean)
              .join('\n')
          }
        ]
      },
      {
        id: 'day',
        label: 'Today',
        title: `${titleBase} - Legends day`,
        description: `Current Legend day: ${legendDayLabel(now)}.\nCurrent standing: ${latestTrophies} trophies, rank ${rankText}.`,
        thumbnailUrl: current.leagueIconUrl || null,
        fields: [
          {
            name: 'Daily ups and downs',
            value: [
              `Net: ${signedNumber(day.net)}`,
              `Gained: +${numberText(day.gains)}`,
              `Lost: -${numberText(day.losses)}`,
              `High/low: ${numberText(day.high)} / ${numberText(day.low)}`
            ].join('\n'),
            inline: true
          },
          {
            name: 'Daily changes',
            value: formatChangeRows(day.changes, 10)
          }
        ]
      }
    ]
  };
}

export function startLegendsTracker({
  storePath = legendsStorePath(),
  fetchPlayerImpl = fetchPlayer,
  intervalMs = DEFAULT_LEGENDS_INTERVAL_MS,
  onError = (error) => console.error('Legend tracker failed:', error)
} = {}) {
  let running = false;
  const run = async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      await trackNextLegendPlayer({ storePath, fetchPlayerImpl, intervalMs });
    } catch (error) {
      onError(error);
    } finally {
      running = false;
    }
  };

  const firstTimer = setTimeout(run, Math.min(intervalMs, 15000));
  firstTimer.unref?.();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return () => {
    clearTimeout(firstTimer);
    clearInterval(timer);
  };
}
