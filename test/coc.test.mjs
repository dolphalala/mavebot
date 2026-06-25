import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CocApiError,
  buildPlayerEmbedData,
  buildPlayerProfileUrl,
  encodeCocTag,
  fetchPlayer,
  normalizePlayerTag
} from '../src/coc.mjs';

test('normalizePlayerTag accepts tags with or without leading hash', () => {
  assert.equal(normalizePlayerTag('#abc123'), '#ABC123');
  assert.equal(normalizePlayerTag(' abc123 '), '#ABC123');
});

test('normalizePlayerTag rejects invalid tags', () => {
  assert.throws(() => normalizePlayerTag(''), CocApiError);
  assert.throws(() => normalizePlayerTag('@@@'), CocApiError);
});

test('encodeCocTag safely encodes the leading hash', () => {
  assert.equal(encodeCocTag('#ABC123'), '%23ABC123');
});

test('buildPlayerProfileUrl creates an in-game Clash profile link', () => {
  assert.equal(
    buildPlayerProfileUrl('#ABC123'),
    'https://link.clashofclans.com/en?action=OpenPlayerProfile&tag=ABC123'
  );
});

test('fetchPlayer sends an encoded tag and bearer token', async () => {
  process.env.COC_API_TOKEN = 'test-token';
  process.env.COC_API_BASE_URL = 'https://api.example.test/v1/';

  const calls = [];
  const player = await fetchPlayer('#ABC123', {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return Response.json({ name: 'Lana', tag: '#ABC123' });
    }
  });

  assert.equal(player.name, 'Lana');
  assert.equal(calls[0].url, 'https://api.example.test/v1/players/%23ABC123');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token');

  delete process.env.COC_API_TOKEN;
  delete process.env.COC_API_BASE_URL;
});

test('fetchPlayer fails clearly when token is missing', async () => {
  delete process.env.COC_API_TOKEN;
  await assert.rejects(() => fetchPlayer('#ABC123'), {
    name: 'CocApiError',
    message: 'The Clash API token is not configured on the server yet.'
  });
});

test('buildPlayerEmbedData formats a rich player stat card', () => {
  const embed = buildPlayerEmbedData({
    name: 'Allen',
    tag: '#ABC123',
    townHallLevel: 16,
    townHallWeaponLevel: 5,
    expLevel: 244,
    trophies: 5123,
    bestTrophies: 6000,
    warStars: 321,
    attackWins: 44,
    defenseWins: 12,
    builderHallLevel: 10,
    builderBaseTrophies: 4100,
    bestBuilderBaseTrophies: 4500,
    clan: {
      name: 'mave',
      tag: '#CLAN',
      clanLevel: 18,
      badgeUrls: { medium: 'https://example.test/clan.png' }
    },
    role: 'leader',
    warPreference: 'in',
    donations: 1234,
    donationsReceived: 987,
    league: {
      name: 'Legend League',
      iconUrls: { medium: 'https://example.test/legend.png' }
    },
    builderBaseLeague: { name: 'Emerald League' },
    legendStatistics: {
      legendTrophies: 500,
      currentSeason: { trophies: 5400, rank: 12345 },
      bestSeason: { trophies: 6010, rank: 900 }
    },
    labels: [{ name: 'Clan Wars' }, { name: 'Trophy Pushing' }],
    heroes: [
      { name: 'Barbarian King', level: 95, maxLevel: 100 },
      { name: 'Archer Queen', level: 96, maxLevel: 100 }
    ],
    heroEquipment: [{ name: 'Giant Gauntlet', level: 18, maxLevel: 27 }],
    troops: [
      { name: 'Root Rider', level: 3, maxLevel: 3, village: 'home' },
      { name: 'Electro Dragon', level: 7, maxLevel: 7, village: 'home' },
      { name: 'Night Witch', level: 20, maxLevel: 20, village: 'builderBase' }
    ],
    spells: [{ name: 'Rage Spell', level: 6, maxLevel: 6 }],
    achievements: [
      { name: 'War Hero', stars: 3, value: 321, target: 1000 },
      { name: 'Friend in Need', stars: 2, value: 5000, target: 25000 }
    ]
  });

  assert.equal(embed.title, 'Allen #ABC123');
  assert.match(embed.description, /TH 16 weapon 5 - XP 244 - Legend League/);
  assert.match(embed.description, /mave - #CLAN - Level 18 \(Leader\)/);
  assert.match(embed.description, /Open profile in Clash/);
  assert.equal(embed.thumbnailUrl, 'https://example.test/legend.png');
  assert.equal(embed.profileUrl, 'https://link.clashofclans.com/en?action=OpenPlayerProfile&tag=ABC123');
  assert.equal(embed.footer, 'Official Clash of Clans API');
  assert.equal(embed.fields.length, 6);
  assert.match(embed.fields.find((field) => field.name === '🏆 Trophies').value, /Home: 5,123 \(best 6,000\)/);
  assert.match(embed.fields.find((field) => field.name === '🏆 Trophies').value, /Emerald League/);
  assert.match(embed.fields.find((field) => field.name === '🏰 Clan').value, /Donated 1,234 \/ received 987/);
  assert.match(embed.fields.find((field) => field.name === '⚔️ Attack Profile').value, /Defense wins: 12/);
  assert.match(embed.fields.find((field) => field.name === '🛡️ Heroes').value, /🏹 Archer Queen 96\/100/);
  assert.match(embed.fields.find((field) => field.name === '🏹 Army Composition').value, /⚡ Electro Dragon 7\/7/);
});
