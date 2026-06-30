import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildLegendDayStats,
  buildLegendsPages,
  ensureLegendsTracked,
  formatMstTime,
  legendDayStartUtc,
  readLegendsStore,
  trackNextLegendPlayer
} from '../src/legends-store.mjs';

function player(tag, trophies, extra = {}) {
  return {
    name: extra.name || `Player ${tag}`,
    tag,
    trophies,
    league: {
      name: 'Legend League',
      iconUrls: { medium: 'https://example.test/legend.png' }
    },
    legendStatistics: {
      currentSeason: {
        rank: extra.rank ?? 1234,
        trophies
      }
    },
    clan: extra.clan ? { name: extra.clan } : undefined
  };
}

async function tempStore(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mavebot-legends-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return path.join(dir, 'legends.json');
}

test('legend day starts at fixed 11 PM MST', () => {
  assert.equal(
    legendDayStartUtc('2026-06-30T05:59:00.000Z').toISOString(),
    '2026-06-29T06:00:00.000Z'
  );
  assert.equal(
    legendDayStartUtc('2026-06-30T06:00:00.000Z').toISOString(),
    '2026-06-30T06:00:00.000Z'
  );
  assert.equal(formatMstTime('2026-06-30T06:00:00.000Z'), '2026-06-29 23:00 MST');
});

test('ensureLegendsTracked stores a first snapshot and does not duplicate unchanged polls', async (t) => {
  const storePath = await tempStore(t);
  const fetchPlayerImpl = async (tag) => player(tag, 5123, { name: 'Dolph' });

  const first = await ensureLegendsTracked('#vy98cqy8', {
    storePath,
    fetchPlayerImpl,
    now: new Date('2026-06-30T21:00:00.000Z')
  });
  const second = await ensureLegendsTracked('#VY98CQY8', {
    storePath,
    fetchPlayerImpl,
    now: new Date('2026-06-30T21:01:00.000Z')
  });

  assert.equal(first.isNew, true);
  assert.equal(second.isNew, false);
  assert.equal(second.record.snapshots.length, 1);
  assert.equal(second.record.current.trophies, 5123);
});

test('trackNextLegendPlayer rotates one due tracked player per tick', async (t) => {
  const storePath = await tempStore(t);
  const calls = [];
  const trophyMap = new Map([
    ['#AAA111', 5000],
    ['#BBB222', 5100]
  ]);
  const fetchPlayerImpl = async (tag) => {
    calls.push(tag);
    return player(tag, trophyMap.get(tag), { name: tag });
  };

  await ensureLegendsTracked('#AAA111', {
    storePath,
    fetchPlayerImpl,
    now: new Date('2026-06-30T21:00:00.000Z'),
    intervalMs: 120000
  });
  await ensureLegendsTracked('#BBB222', {
    storePath,
    fetchPlayerImpl,
    now: new Date('2026-06-30T21:00:00.000Z'),
    intervalMs: 120000
  });

  trophyMap.set('#AAA111', 5015);
  trophyMap.set('#BBB222', 5080);

  const firstTick = await trackNextLegendPlayer({
    storePath,
    fetchPlayerImpl,
    now: new Date('2026-06-30T21:02:00.000Z'),
    intervalMs: 120000
  });
  const secondTick = await trackNextLegendPlayer({
    storePath,
    fetchPlayerImpl,
    now: new Date('2026-06-30T21:02:10.000Z'),
    intervalMs: 120000
  });

  assert.equal(firstTick.tracked, true);
  assert.equal(secondTick.tracked, true);
  assert.notEqual(firstTick.tag, secondTick.tag);
  const store = await readLegendsStore(storePath);
  assert.equal(store.players['#AAA111'].snapshots.length, 2);
  assert.equal(store.players['#BBB222'].snapshots.length, 2);
});

test('buildLegendsPages formats timeline and daily ups and downs', async (t) => {
  const storePath = await tempStore(t);
  let trophies = 5000;
  const fetchPlayerImpl = async (tag) => player(tag, trophies, { name: 'Dolph', rank: 42 });

  await ensureLegendsTracked('#VY98CQY8', {
    storePath,
    fetchPlayerImpl,
    now: new Date('2026-06-30T06:01:00.000Z')
  });
  trophies = 5030;
  const updated = await ensureLegendsTracked('#VY98CQY8', {
    storePath,
    fetchPlayerImpl,
    now: new Date('2026-06-30T08:00:00.000Z')
  });
  trophies = 5018;
  const final = await ensureLegendsTracked('#VY98CQY8', {
    storePath,
    fetchPlayerImpl,
    now: new Date('2026-06-30T10:00:00.000Z')
  });

  const stats = buildLegendDayStats(final.record, new Date('2026-06-30T10:00:00.000Z'));
  assert.equal(updated.delta, 30);
  assert.equal(final.delta, -12);
  assert.equal(stats.net, 18);
  assert.equal(stats.gains, 30);
  assert.equal(stats.losses, 12);

  const pages = buildLegendsPages(final.record, {
    now: new Date('2026-06-30T10:00:00.000Z'),
    trackedCount: 3,
    intervalMs: 120000
  });

  assert.deepEqual(pages.pages.map((page) => page.id), ['timeline', 'day']);
  assert.match(pages.pages[0].fields[0].value, /\+30/);
  assert.match(pages.pages[0].fields[0].value, /-12/);
  assert.match(pages.pages[1].fields[0].value, /Net: \+18/);
  assert.match(pages.pages[1].description, /11:00 PM MST|23:00 MST/);
});
