const DEFAULT_COC_API_BASE_URL = 'https://api.clashofclans.com/v1';
const DEFAULT_COC_API_TIMEOUT_MS = 8000;

export class CocApiError extends Error {
  constructor(message, { status, reason } = {}) {
    super(message);
    this.name = 'CocApiError';
    this.status = status;
    this.reason = reason;
  }
}

export function normalizePlayerTag(value) {
  const compact = String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
  const tag = compact.startsWith('#') ? compact : `#${compact}`;

  if (!/^#[A-Z0-9]{3,20}$/.test(tag)) {
    throw new CocApiError('Please enter a valid Clash of Clans player tag.');
  }

  return tag;
}

export function encodeCocTag(tag) {
  return encodeURIComponent(normalizePlayerTag(tag));
}

function apiBaseUrl() {
  return (process.env.COC_API_BASE_URL || DEFAULT_COC_API_BASE_URL).replace(/\/+$/, '');
}

function apiToken() {
  return process.env.COC_API_TOKEN || '';
}

async function fetchCocJson(
  path,
  {
    fetchImpl = fetch,
    timeoutMs = DEFAULT_COC_API_TIMEOUT_MS,
    notFoundMessage = 'I could not find that Clash of Clans resource.'
  } = {}
) {
  const token = apiToken();
  if (!token) {
    throw new CocApiError('The Clash API token is not configured on the server yet.');
  }

  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  const timer =
    controller && Number.isFinite(timeoutMs) && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  let response;
  try {
    response = await fetchImpl(`${apiBaseUrl()}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      },
      ...(controller ? { signal: controller.signal } : {})
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new CocApiError('The Clash API did not respond quickly enough. Try again in a minute.');
    }
    throw error;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }

  try {
    return await parseCocResponse(response);
  } catch (error) {
    if (error instanceof CocApiError && error.status === 404) {
      throw new CocApiError(notFoundMessage, {
        status: error.status,
        reason: error.reason
      });
    }
    throw error;
  }
}

async function parseCocResponse(response) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (response.ok) {
    return body;
  }

  const reason = body?.reason || body?.message || response.statusText || 'unknown';
  if (response.status === 403) {
    throw new CocApiError(
      'The Clash API rejected this server. Check that the API token is valid and allowlisted for 5.78.127.221.',
      { status: response.status, reason }
    );
  }

  if (response.status === 404) {
    throw new CocApiError('I could not find that player tag.', {
      status: response.status,
      reason
    });
  }

  throw new CocApiError(`Clash API request failed: ${reason}`, {
    status: response.status,
    reason
  });
}

export async function fetchPlayer(
  tag,
  { fetchImpl = fetch, timeoutMs = DEFAULT_COC_API_TIMEOUT_MS } = {}
) {
  return fetchCocJson(`/players/${encodeCocTag(tag)}`, {
    fetchImpl,
    timeoutMs,
    notFoundMessage: 'I could not find that player tag.'
  });
}

export function normalizeClanTag(value) {
  try {
    return normalizePlayerTag(value);
  } catch (error) {
    if (error instanceof CocApiError) {
      throw new CocApiError('Please enter a valid Clash of Clans clan tag.');
    }
    throw error;
  }
}

export async function fetchClan(
  tag,
  { fetchImpl = fetch, timeoutMs = DEFAULT_COC_API_TIMEOUT_MS } = {}
) {
  return fetchCocJson(`/clans/${encodeCocTag(tag)}`, {
    fetchImpl,
    timeoutMs,
    notFoundMessage: 'I could not find that clan tag.'
  });
}

export async function fetchCurrentWar(
  clanTag,
  { fetchImpl = fetch, timeoutMs = DEFAULT_COC_API_TIMEOUT_MS } = {}
) {
  return fetchCocJson(`/clans/${encodeCocTag(clanTag)}/currentwar`, {
    fetchImpl,
    timeoutMs,
    notFoundMessage: 'I could not find current war data for that clan.'
  });
}

export async function fetchClanWarLog(
  clanTag,
  { fetchImpl = fetch, timeoutMs = DEFAULT_COC_API_TIMEOUT_MS, limit = 10 } = {}
) {
  const params = new URLSearchParams();
  if (Number.isFinite(limit) && limit > 0) {
    params.set('limit', String(Math.min(Math.floor(limit), 50)));
  }
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return fetchCocJson(`/clans/${encodeCocTag(clanTag)}/warlog${suffix}`, {
    fetchImpl,
    timeoutMs,
    notFoundMessage: 'I could not find war log data for that clan.'
  });
}

export async function fetchCurrentCwlGroup(
  clanTag,
  { fetchImpl = fetch, timeoutMs = DEFAULT_COC_API_TIMEOUT_MS } = {}
) {
  return fetchCocJson(`/clans/${encodeCocTag(clanTag)}/currentwar/leaguegroup`, {
    fetchImpl,
    timeoutMs,
    notFoundMessage: 'I could not find current CWL group data for that clan.'
  });
}

export async function fetchCwlWar(
  warTag,
  { fetchImpl = fetch, timeoutMs = DEFAULT_COC_API_TIMEOUT_MS } = {}
) {
  return fetchCocJson(`/clanwarleagues/wars/${encodeCocTag(warTag)}`, {
    fetchImpl,
    timeoutMs,
    notFoundMessage: 'I could not find that CWL war tag.'
  });
}

function numberText(value) {
  return Number.isFinite(value) ? value.toLocaleString('en-US') : 'Unknown';
}

function textValue(value, fallback = 'Unknown') {
  const text = String(value || '').trim();
  return text || fallback;
}

function labelText(value) {
  return textValue(value)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function truncateText(value, limit = 1024) {
  const text = String(value || '').trim();
  if (text.length <= limit) {
    return text || 'None';
  }

  return `${text.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function formatLevelItem(item) {
  const level = Number.isFinite(item?.level) ? item.level : null;
  const maxLevel = Number.isFinite(item?.maxLevel) ? item.maxLevel : null;
  const levelText = level === null ? '' : maxLevel ? ` ${level}/${maxLevel}` : ` ${level}`;
  return `${textValue(item?.name, 'Unknown')}${levelText}`;
}

function formatLabels(labels) {
  return truncateText((labels || []).map((label) => label.name).filter(Boolean).join(', '));
}

function achievementProgress(achievement) {
  const value = Number.isFinite(achievement?.value) ? achievement.value : null;
  const target = Number.isFinite(achievement?.target) ? achievement.target : null;
  if (value === null && target === null) {
    return '';
  }

  if (target === null) {
    return ` - ${numberText(value)}`;
  }

  return ` - ${numberText(value)}/${numberText(target)}`;
}

function formatAchievements(achievements, { limit = 5 } = {}) {
  const rows = (achievements || [])
    .slice()
    .sort((a, b) => (b.stars || 0) - (a.stars || 0) || (b.value || 0) - (a.value || 0))
    .slice(0, limit)
    .map((achievement) => {
      const stars = Number.isFinite(achievement.stars) ? `${achievement.stars}/3` : '?/3';
      return `${achievement.name || 'Achievement'} (${stars})${achievementProgress(achievement)}`;
    });

  return truncateText(rows.join('\n'));
}

function formatLegendStats(stats) {
  if (!stats) {
    return 'None';
  }

  const rows = [];
  if (Number.isFinite(stats.legendTrophies)) {
    rows.push(`Legend trophies: ${numberText(stats.legendTrophies)}`);
  }
  if (stats.currentSeason) {
    rows.push(
      `Current: ${numberText(stats.currentSeason.trophies)} trophies${
        Number.isFinite(stats.currentSeason.rank) ? `, rank ${numberText(stats.currentSeason.rank)}` : ''
      }`
    );
  }
  if (stats.bestSeason) {
    rows.push(
      `Best season: ${numberText(stats.bestSeason.trophies)} trophies${
        Number.isFinite(stats.bestSeason.rank) ? `, rank ${numberText(stats.bestSeason.rank)}` : ''
      }`
    );
  }
  if (stats.previousSeason) {
    rows.push(
      `Previous: ${numberText(stats.previousSeason.trophies)} trophies${
        Number.isFinite(stats.previousSeason.rank) ? `, rank ${numberText(stats.previousSeason.rank)}` : ''
      }`
    );
  }

  return truncateText(rows.join('\n'));
}

function clanDescription(clan) {
  if (!clan?.name) {
    return 'No clan';
  }

  const parts = [clan.name];
  if (clan.tag) {
    parts.push(clan.tag);
  }
  if (Number.isFinite(clan.clanLevel)) {
    parts.push(`Level ${clan.clanLevel}`);
  }
  return parts.join(' - ');
}

function clanSummary(player) {
  const clan = player.clan;
  if (!clan?.name) {
    return 'No clan';
  }

  return [
    `${clan.name}${clan.tag ? ` (${clan.tag})` : ''}`,
    Number.isFinite(clan.clanLevel) ? `Level ${clan.clanLevel}` : null,
    player.role ? labelText(player.role) : null,
    `Donated ${numberText(player.donations)} / received ${numberText(player.donationsReceived)}`
  ]
    .filter(Boolean)
    .join('\n');
}

function thumbnailUrl(player) {
  return (
    player.league?.iconUrls?.medium ||
    player.league?.iconUrls?.small ||
    player.clan?.badgeUrls?.medium ||
    player.clan?.badgeUrls?.small ||
    null
  );
}

export function buildPlayerProfileUrl(tag) {
  const cleanTag = normalizePlayerTag(tag).replace(/^#/, '');
  return `https://link.clashofclans.com/en?action=OpenPlayerProfile&tag=${cleanTag}`;
}

function formatTrophySnapshot(player, { league, builderLeague } = {}) {
  const rows = [
    `Home: ${numberText(player.trophies)} (best ${numberText(player.bestTrophies)})`,
    `League: ${league || 'Unranked'}`
  ];

  if (Number.isFinite(player.builderBaseTrophies) || player.builderBaseLeague?.name) {
    rows.push(
      `Builder: ${numberText(player.builderBaseTrophies)} (best ${numberText(player.bestBuilderBaseTrophies)})`,
      `Builder league: ${builderLeague || 'Unranked'}`
    );
  }

  if (Number.isFinite(player.legendStatistics?.legendTrophies)) {
    rows.push(`Legend trophies: ${numberText(player.legendStatistics.legendTrophies)}`);
  }

  return rows.join('\n');
}

function formatAttackProfile(player) {
  return [
    `War stars: ${numberText(player.warStars)}`,
    `Attack wins: ${numberText(player.attackWins)}`,
    `Defense wins: ${numberText(player.defenseWins)}`,
    `War preference: ${labelText(player.warPreference)}`
  ].join('\n');
}

function topItems(items, limit = 10) {
  return (items || [])
    .slice()
    .sort((a, b) => (b.level || 0) - (a.level || 0))
    .slice(0, limit);
}

function formatGroupedLevelList(items, { village, limit = 12, columns = 3 } = {}) {
  const rows = topItems(
    (items || []).filter((item) => !village || item?.village === village),
    limit
  ).map(formatLevelItem);

  if (!rows.length) {
    return 'None';
  }

  const lines = [];
  for (let index = 0; index < rows.length; index += columns) {
    lines.push(rows.slice(index, index + columns).join(' | '));
  }
  return truncateText(lines.join('\n'));
}

function field(name, value, inline = false) {
  return {
    name,
    value: truncateText(value),
    inline
  };
}

function pageThumbnail(player, assetUrls, preferredNames = []) {
  for (const name of preferredNames) {
    const url = assetUrls?.get?.(name) || assetUrls?.get?.(String(name).toLowerCase());
    if (url) {
      return url;
    }
  }
  return thumbnailUrl(player);
}

function profileDescription(player, { league, townHall, profileUrl }) {
  return [
    `TH ${townHall} - XP ${numberText(player.expLevel)} - ${league}`,
    `${clanDescription(player.clan)}${player.role ? ` (${labelText(player.role)})` : ''}`,
    profileUrl ? `[Open profile in Clash](${profileUrl})` : null
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildPlayerProfilePages(
  player,
  { assetUrls = new Map(), armyImageAttachment = null, armyImageLoading = false } = {}
) {
  const league = player.league?.name || 'Unranked';
  const builderLeague = player.builderBaseLeague?.name || 'Unranked';
  const townHall = player.townHallWeaponLevel
    ? `${player.townHallLevel || 'Unknown'} weapon ${player.townHallWeaponLevel}`
    : String(player.townHallLevel || 'Unknown');
  const profileUrl = player.tag ? buildPlayerProfileUrl(player.tag) : null;
  const description = profileDescription(player, { league, townHall, profileUrl });

  return {
    profileUrl,
    footer: 'Official Clash of Clans API + Clash Wiki/Fandom icons when available',
    pages: [
      {
        id: 'overview',
        label: 'Overview',
        title: `${player.name || 'Unknown player'} - Overview`,
        description,
        thumbnailUrl: thumbnailUrl(player),
        fields: [
          field('Trophies', formatTrophySnapshot(player, { league, builderLeague }), true),
          field('Clan', clanSummary(player), true),
          field('War', formatAttackProfile(player), true)
        ]
      },
      {
        id: 'army',
        label: 'Army',
        title: `${player.name || 'Unknown player'} - Army`,
        description: [
          `Fast scan of the strongest visible army levels for ${player.tag || 'this player'}.`,
          armyImageAttachment
            ? 'Rendered icon card attached below.'
            : armyImageLoading
              ? 'Icon card is still loading; text rows are ready now.'
              : 'Icon card unavailable; using text rows.'
        ].join('\n'),
        thumbnailUrl: pageThumbnail(player, assetUrls, ['Lightning Spell', 'Archer Queen', 'Barbarian King']),
        imageUrl: armyImageAttachment ? `attachment://${armyImageAttachment}` : null,
        fields: [
          field('Home Troops', formatGroupedLevelList(player.troops, { village: 'home', limit: 18 })),
          field('Spells', formatGroupedLevelList(player.spells, { limit: 18 })),
          field('Builder Base', formatGroupedLevelList(player.troops, { village: 'builderBase', limit: 12 }))
        ]
      },
      {
        id: 'heroes',
        label: 'Heroes',
        title: `${player.name || 'Unknown player'} - Heroes`,
        description: 'Hero, pet, and equipment levels split away from the main overview.',
        thumbnailUrl: pageThumbnail(player, assetUrls, ['Archer Queen', 'Barbarian King', 'Spiky Ball']),
        fields: [
          field('Heroes', formatGroupedLevelList(player.heroes, { limit: 8 })),
          field('Hero Equipment', formatGroupedLevelList(player.heroEquipment, { limit: 12 })),
          field('Labels', formatLabels(player.labels))
        ]
      },
      {
        id: 'progress',
        label: 'Progress',
        title: `${player.name || 'Unknown player'} - Progress`,
        description: 'Achievements, Legend stats, and long-term account progress.',
        thumbnailUrl: thumbnailUrl(player),
        fields: [
          field('Achievements', formatAchievements(player.achievements, { limit: 8 })),
          field('Legend League', formatLegendStats(player.legendStatistics)),
          field(
            'Donations',
            `Troops donated: ${numberText(player.donations)}\nTroops received: ${numberText(player.donationsReceived)}`
          )
        ]
      }
    ]
  };
}

export function buildPlayerEmbedData(player) {
  const profile = buildPlayerProfilePages(player);
  const page = profile.pages[0];
  return {
    title: page.title,
    description: page.description,
    thumbnailUrl: page.thumbnailUrl,
    profileUrl: profile.profileUrl,
    footer: profile.footer,
    fields: page.fields
  };
}
