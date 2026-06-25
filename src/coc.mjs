const DEFAULT_COC_API_BASE_URL = 'https://api.clashofclans.com/v1';

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

export async function fetchPlayer(tag, { fetchImpl = fetch } = {}) {
  const token = apiToken();
  if (!token) {
    throw new CocApiError('The Clash API token is not configured on the server yet.');
  }

  const response = await fetchImpl(`${apiBaseUrl()}/players/${encodeCocTag(tag)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });

  return parseCocResponse(response);
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

const UNIT_ICONS = new Map(
  [
    ['apprentice warden', '🔮'],
    ['archer', '🏹'],
    ['archer puppet', '🏹'],
    ['archer queen', '🏹'],
    ['baby dragon', '🐲'],
    ['balloon', '🎈'],
    ['barbarian', '⚔️'],
    ['barbarian king', '👑'],
    ['battle copter', '🚁'],
    ['battle machine', '🔨'],
    ['beta minion', '🦇'],
    ['bomber', '💣'],
    ['bowler', '🪨'],
    ['boxer giant', '🥊'],
    ['cannon cart', '🛞'],
    ['dark orb', '🟣'],
    ['dragon', '🐉'],
    ['dragon rider', '🐉'],
    ['druid', '🌿'],
    ['earthquake boots', '🥾'],
    ['electro boots', '⚡'],
    ['electro dragon', '⚡'],
    ['electro titan', '⚡'],
    ['electrofire wizard', '🔥'],
    ['eternal tome', '📖'],
    ['fireball', '🔥'],
    ['giant', '🪨'],
    ['giant arrow', '🏹'],
    ['giant gauntlet', '🧤'],
    ['goblin', '💰'],
    ['golem', '🪨'],
    ['grand warden', '🔮'],
    ['haste vial', '🧪'],
    ['head hunter', '🎯'],
    ['healer', '✨'],
    ['healer puppet', '✨'],
    ['healing tome', '📖'],
    ['henchmen puppet', '🦇'],
    ['hog glider', '🐗'],
    ['hog rider', '🐗'],
    ['hog rider puppet', '🐗'],
    ['ice golem', '❄️'],
    ['invisibility vial', '🧪'],
    ['lava hound', '🌋'],
    ['life gem', '💎'],
    ['magic mirror', '🪞'],
    ['miner', '⛏️'],
    ['minion', '🦇'],
    ['minion prince', '🦇'],
    ['night witch', '💀'],
    ['pekka', '🛡️'],
    ['raged barbarian', '⚔️'],
    ['rage gem', '💎'],
    ['rage vial', '🧪'],
    ['rocket spear', '🚀'],
    ['root rider', '🌿'],
    ['royal champion', '🛡️'],
    ['royal gem', '💎'],
    ['seeking shield', '🛡️'],
    ['sneaky archer', '🏹'],
    ['spiky ball', '🏐'],
    ['super pekka', '⚡'],
    ['thrower', '🪓'],
    ['valkyrie', '🪓'],
    ['vampstache', '🩸'],
    ['wall breaker', '💣'],
    ['witch', '💀'],
    ['wizard', '🔥'],
    ['yeti', '❄️']
  ].map(([name, icon]) => [name, icon])
);

function unitIcon(item, fallback = '▫️') {
  const name = String(item?.name || '').trim().toLowerCase();
  if (UNIT_ICONS.has(name)) {
    return UNIT_ICONS.get(name);
  }

  if (name.includes('dragon')) {
    return '🐉';
  }
  if (name.includes('spell') || name.includes('vial')) {
    return '🧪';
  }
  if (name.includes('tome')) {
    return '📖';
  }
  if (name.includes('gem')) {
    return '💎';
  }
  if (name.includes('machine') || name.includes('siege')) {
    return '🛠️';
  }

  return fallback;
}

function formatLevelItem(item) {
  const level = Number.isFinite(item?.level) ? item.level : null;
  const maxLevel = Number.isFinite(item?.maxLevel) ? item.maxLevel : null;
  const levelText = level === null ? '' : maxLevel ? ` ${level}/${maxLevel}` : ` ${level}`;
  return `${unitIcon(item)} ${textValue(item?.name, 'Unknown')}${levelText}`;
}

function formatLevelList(items, { village, limit = 8 } = {}) {
  const filtered = (items || [])
    .filter((item) => !village || item?.village === village)
    .sort((a, b) => (b.level || 0) - (a.level || 0))
    .slice(0, limit)
    .map(formatLevelItem);

  return truncateText(filtered.join(', '));
}

function formatHeroList(items, { limit = 8 } = {}) {
  const heroes = (items || [])
    .sort((a, b) => (b.level || 0) - (a.level || 0))
    .slice(0, limit)
    .map(formatLevelItem);

  return truncateText(heroes.join(', '));
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

function formatArmyComposition(player) {
  return [
    `Main: ${formatLevelList(player.troops, { village: 'home', limit: 8 })}`,
    `Spells: ${formatLevelList(player.spells, { limit: 8 })}`,
    `Builder: ${formatLevelList(player.troops, { village: 'builderBase', limit: 5 })}`
  ].join('\n');
}

export function buildPlayerEmbedData(player) {
  const league = player.league?.name || 'Unranked';
  const builderLeague = player.builderBaseLeague?.name || 'Unranked';
  const townHall = player.townHallWeaponLevel
    ? `${player.townHallLevel || 'Unknown'} weapon ${player.townHallWeaponLevel}`
    : String(player.townHallLevel || 'Unknown');
  const profileUrl = player.tag ? buildPlayerProfileUrl(player.tag) : null;
  const description = [
    `TH ${townHall} - XP ${numberText(player.expLevel)} - ${league}`,
    `${clanDescription(player.clan)}${player.role ? ` (${labelText(player.role)})` : ''}`,
    profileUrl ? `[Open profile in Clash](${profileUrl})` : null
  ]
    .filter(Boolean)
    .join('\n');

  return {
    title: `${player.name || 'Unknown player'} ${player.tag || ''}`.trim(),
    description,
    thumbnailUrl: thumbnailUrl(player),
    profileUrl,
    footer: 'Official Clash of Clans API',
    fields: [
      {
        name: '🏆 Trophies',
        value: formatTrophySnapshot(player, { league, builderLeague }),
        inline: true
      },
      {
        name: '🏰 Clan',
        value: clanSummary(player),
        inline: true
      },
      {
        name: '⚔️ Attack Profile',
        value: formatAttackProfile(player),
        inline: true
      },
      {
        name: '🛡️ Heroes',
        value: formatHeroList(player.heroes, { limit: 6 }),
        inline: false
      },
      {
        name: '🧰 Hero Equipment',
        value: formatLevelList(player.heroEquipment, { limit: 8 }),
        inline: false
      },
      {
        name: '🏹 Army Composition',
        value: formatArmyComposition(player),
        inline: false
      }
    ]
  };
}
