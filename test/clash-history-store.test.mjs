import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildClashPlayerHistoryText,
  readClashHistoryStore,
  recordClashPlayerSnapshot,
  trackClashHistoryClan,
  trackClashHistoryPlayer,
  trackNextClashHistorySubject
} from '../src/clash-history-store.mjs';

async function tempStore(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mavebot-clash-history-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return path.join(dir, 'clash-history.json');
}

function player(tag, trophies, extra = {}) {
  return {
    tag,
    name: extra.name || `Player ${tag}`,
    townHallLevel: extra.townHallLevel ?? 16,
    expLevel: 240,
    trophies,
    bestTrophies: Math.max(trophies, 6000),
    warStars: 900,
    attackWins: 40,
    defenseWins: 10,
    donations: extra.donations ?? 100,
    donationsReceived: extra.donationsReceived ?? 80,
    clan: extra.clan || { tag: '#CLAN1', name: 'Mave', clanLevel: 20 },
    role: 'member',
    league: {
      id: 29000022,
      name: 'Legend League',
      iconUrls: { medium: 'https://example.test/legend.png' }
    },
    heroes: [{ name: 'Archer Queen', level: 95, maxLevel: 100 }],
    heroEquipment: [{ name: 'Frozen Arrow', level: 18, maxLevel: 27 }],
    troops: [{ name: 'Root Rider', level: 3, maxLevel: 3, village: 'home' }],
    spells: [{ name: 'Rage Spell', level: 6, maxLevel: 6 }]
  };
}

function clan() {
  return {
    tag: '#CLAN1',
    name: 'Mave',
    clanLevel: 20,
    members: 2,
    clanPoints: 55555,
    clanBuilderBasePoints: 44444,
    requiredTrophies: 5000,
    isWarLogPublic: true,
    warLeague: { name: 'Champion League I' },
    memberList: [
      {
        tag: '#AAA111',
        name: 'Alpha',
        townHallLevel: 16,
        expLevel: 240,
        trophies: 5600,
        donations: 100,
        donationsReceived: 80,
        league: { name: 'Legend League' }
      },
      {
        tag: '#BBB222',
        name: 'Bravo',
        townHallLevel: 15,
        expLevel: 220,
        trophies: 5200,
        donations: 50,
        donationsReceived: 40,
        league: { name: 'Titan League I' }
      }
    ]
  };
}

function cwlGroup() {
  return {
    state: 'inWar',
    season: '2026-07',
    clans: [
      {
        tag: '#CLAN1',
        name: 'Mave',
        clanLevel: 20,
        members: [{ tag: '#AAA111', name: 'Alpha', townHallLevel: 16 }]
      },
      {
        tag: '#OPP1',
        name: 'Enemy',
        clanLevel: 18,
        members: [{ tag: '#CCC333', name: 'Charlie', townHallLevel: 16 }]
      }
    ],
    rounds: [{ warTags: ['#WAR123', '#0'] }]
  };
}

function war() {
  return {
    warTag: '#WAR123',
    state: 'warEnded',
    teamSize: 1,
    attacksPerMember: 1,
    preparationStartTime: '2026-07-01T00:00:00.000Z',
    startTime: '2026-07-02T00:00:00.000Z',
    endTime: '2026-07-03T00:00:00.000Z',
    clan: {
      tag: '#CLAN1',
      name: 'Mave',
      attacks: 1,
      stars: 3,
      destructionPercentage: 100,
      members: [
        {
          tag: '#AAA111',
          name: 'Alpha',
          townhallLevel: 16,
          mapPosition: 1,
          attacks: [
            {
              attackerTag: '#AAA111',
              defenderTag: '#CCC333',
              stars: 3,
              destructionPercentage: 100,
              order: 1
            }
          ]
        }
      ]
    },
    opponent: {
      tag: '#OPP1',
      name: 'Enemy',
      attacks: 1,
      stars: 2,
      destructionPercentage: 90,
      members: [
        {
          tag: '#CCC333',
          name: 'Charlie',
          townhallLevel: 16,
          mapPosition: 1,
          attacks: [
            {
              attackerTag: '#CCC333',
              defenderTag: '#AAA111',
              stars: 2,
              destructionPercentage: 90,
              order: 2
            }
          ]
        }
      ]
    }
  };
}

test('readClashHistoryStore preserves malformed JSON as corrupt backup', async (t) => {
  const storePath = await tempStore(t);
  await writeFile(storePath, '{bad json', 'utf8');

  const store = await readClashHistoryStore(storePath);
  const files = await readdir(path.dirname(storePath));

  assert.equal(store.version, 1);
  assert.ok(files.some((name) => name.startsWith('clash-history.json.corrupt-')));
});

test('recordClashPlayerSnapshot stores current player data and trophy deltas', async (t) => {
  const storePath = await tempStore(t);
  const first = await recordClashPlayerSnapshot(player('#AAA111', 5600), {
    storePath,
    now: new Date('2026-07-01T00:00:00.000Z'),
    source: 'lookup'
  });
  const second = await recordClashPlayerSnapshot(player('#AAA111', 5632), {
    storePath,
    now: new Date('2026-07-01T00:05:00.000Z'),
    source: 'lookup'
  });

  assert.equal(first.appended, true);
  assert.equal(second.trophyDelta, 32);
  assert.equal(second.record.snapshots.length, 2);
  assert.equal(second.record.current.heroes[0].name, 'Archer Queen');
  assert.deepEqual(second.store.tracked.players['#AAA111'].sources, ['lookup']);
});

test('trackClashHistoryPlayer seeds a command-backed player snapshot', async (t) => {
  const storePath = await tempStore(t);

  const result = await trackClashHistoryPlayer('AAA111', {
    storePath,
    now: new Date('2026-07-01T00:00:00.000Z'),
    source: 'discord:user-1',
    fetchPlayerImpl: async (tag) => player(tag, 5600)
  });

  assert.equal(result.tag, '#AAA111');
  assert.equal(result.record.current.trophies, 5600);
  assert.deepEqual(result.store.tracked.players['#AAA111'].sources, ['discord:user-1']);
  assert.equal(result.store.tracked.players['#AAA111'].lastError, null);
});

test('trackClashHistoryClan seeds clan, members, and CWL war tracking', async (t) => {
  const storePath = await tempStore(t);

  const result = await trackClashHistoryClan('#CLAN1', {
    storePath,
    now: new Date('2026-07-01T00:00:00.000Z'),
    source: 'discord:user-1',
    fetchClanImpl: async () => clan(),
    fetchCurrentWarImpl: async () => ({ state: 'notInWar' }),
    fetchCurrentCwlGroupImpl: async () => cwlGroup(),
    fetchClanWarLogImpl: async () => ({ items: [] })
  });

  assert.equal(result.tag, '#CLAN1');
  assert.equal(result.record.current.memberTags.length, 2);
  assert.deepEqual(result.store.tracked.clans['#CLAN1'].sources, ['discord:user-1']);
  assert.ok(result.store.tracked.players['#AAA111']);
  assert.ok(result.store.tracked.players['#BBB222']);
  assert.ok(result.store.tracked.wars['#WAR123']);
});

test('buildClashPlayerHistoryText explains current stats and collected deltas', async (t) => {
  const storePath = await tempStore(t);
  const first = await recordClashPlayerSnapshot(player('#AAA111', 5600), {
    storePath,
    now: new Date('2026-07-01T00:00:00.000Z'),
    source: 'lookup'
  });
  const second = await recordClashPlayerSnapshot(
    player('#AAA111', 5632, { donations: 130, donationsReceived: 90 }),
    {
      storePath,
      now: new Date('2026-07-01T00:10:00.000Z'),
      source: 'lookup'
    }
  );

  const text = buildClashPlayerHistoryText(second.record, {
    tracked: second.store.tracked.players['#AAA111']
  });

  assert.match(text, /Player #AAA111 \(#AAA111\) history/);
  assert.match(text, /2 snapshots/);
  assert.match(text, /Trophies: 5,632 \|\s+\+32 since last/);
  assert.match(text, /Donations: 130 \|\s+\+30 since last/);
  assert.match(text, /Mave \(#CLAN1\)/);
  assert.match(text, /No collected war\/CWL attack rows/);
  assert.equal(first.record.tag, '#AAA111');
});

test('buildClashPlayerHistoryText summarizes collected war rows', async (t) => {
  const storePath = await tempStore(t);

  const clanTick = await trackNextClashHistorySubject({
    storePath,
    now: new Date('2026-07-01T00:00:00.000Z'),
    configuredClanTags: ['#CLAN1'],
    configuredPlayerTags: [],
    fetchClanImpl: async () => clan(),
    fetchCurrentWarImpl: async () => ({ state: 'notInWar' }),
    fetchCurrentCwlGroupImpl: async () => cwlGroup(),
    fetchClanWarLogImpl: async () => ({ items: [] })
  });
  assert.equal(clanTick.type, 'clan');

  await trackNextClashHistorySubject({
    storePath,
    now: new Date('2026-07-01T00:00:01.000Z'),
    configuredClanTags: ['#CLAN1'],
    configuredPlayerTags: [],
    fetchCwlWarImpl: async () => war()
  });
  await recordClashPlayerSnapshot(player('#AAA111', 5610), {
    storePath,
    now: new Date('2026-07-01T00:00:02.000Z'),
    source: 'history'
  });
  const store = await readClashHistoryStore(storePath);
  const text = buildClashPlayerHistoryText(store.players['#AAA111'], {
    tracked: store.tracked.players['#AAA111']
  });

  assert.match(text, /1 war\/CWL row collected/);
  assert.match(text, /Attacks: 1, stars: 3, triples: 1, missed: 0/);
  assert.match(text, /Defenses seen: 1/);
});

test('trackNextClashHistorySubject rotates clan, CWL war, and player work', async (t) => {
  const storePath = await tempStore(t);
  const now = new Date('2026-07-01T00:00:00.000Z');

  const clanTick = await trackNextClashHistorySubject({
    storePath,
    now,
    configuredClanTags: ['#CLAN1'],
    configuredPlayerTags: [],
    fetchClanImpl: async () => clan(),
    fetchCurrentWarImpl: async () => ({ state: 'notInWar' }),
    fetchCurrentCwlGroupImpl: async () => cwlGroup(),
    fetchClanWarLogImpl: async () => ({
      items: [
        {
          endTime: '2026-06-28T00:00:00.000Z',
          teamSize: 50,
          attacksPerMember: 2,
          clan: { tag: '#CLAN1', name: 'Mave', stars: 120, destructionPercentage: 92 },
          opponent: { tag: '#OLD1', name: 'Old Enemy', stars: 110, destructionPercentage: 88 }
        }
      ]
    })
  });

  assert.equal(clanTick.type, 'clan');
  assert.equal(clanTick.store.clans['#CLAN1'].current.memberTags.length, 2);
  assert.ok(clanTick.store.tracked.players['#AAA111']);
  assert.ok(clanTick.store.tracked.wars['#WAR123']);
  assert.ok(clanTick.store.wars['warlog:2026-06-28T00:00:00.000Z:#CLAN1:#OLD1'].summaryOnly);

  const warTick = await trackNextClashHistorySubject({
    storePath,
    now: new Date('2026-07-01T00:00:01.000Z'),
    configuredClanTags: ['#CLAN1'],
    configuredPlayerTags: [],
    fetchCwlWarImpl: async () => war()
  });

  assert.equal(warTick.type, 'war');
  assert.equal(warTick.record.state, 'warEnded');
  assert.equal(warTick.store.tracked.wars['#WAR123'].completedAt, '2026-07-01T00:00:01.000Z');
  assert.equal(warTick.store.players['#AAA111'].warStats['war:#WAR123'].attacks[0].stars, 3);
  assert.equal(warTick.store.players['#AAA111'].warStats['war:#WAR123'].defenses[0].stars, 2);

  const playerTick = await trackNextClashHistorySubject({
    storePath,
    now: new Date('2026-07-01T00:00:02.000Z'),
    configuredClanTags: ['#CLAN1'],
    configuredPlayerTags: [],
    fetchPlayerImpl: async (tag) => player(tag, tag === '#AAA111' ? 5610 : 5210)
  });

  assert.equal(playerTick.type, 'player');
  assert.ok(['#AAA111', '#BBB222'].includes(playerTick.tag));
  assert.equal(playerTick.store.players[playerTick.tag].current.trophies, playerTick.snapshot.trophies);
});
