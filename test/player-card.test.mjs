import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { playerArmyAssetNames, renderPlayerArmyCard } from '../src/player-card.mjs';

function samplePlayer() {
  return {
    name: 'Dolph',
    tag: '#VY98CQY8',
    townHallLevel: 18,
    heroes: [
      { name: 'Barbarian King', level: 102, maxLevel: 105 },
      { name: 'Archer Queen', level: 105, maxLevel: 105 }
    ],
    heroEquipment: [{ name: 'Spiky Ball', level: 27, maxLevel: 27 }],
    troops: [
      { name: 'L.A.S.S.I', level: 15, maxLevel: 15, village: 'home' },
      { name: 'Root Rider', level: 3, maxLevel: 3, village: 'home' },
      { name: 'Wall Wrecker', level: 5, maxLevel: 5, village: 'home' },
      { name: 'Night Witch', level: 20, maxLevel: 20, village: 'builderBase' }
    ],
    spells: [{ name: 'Lightning Spell', level: 12, maxLevel: 12 }]
  };
}

test('playerArmyAssetNames includes heroes, pets, spells, equipment, and siege machines', () => {
  const names = playerArmyAssetNames(samplePlayer());

  assert.ok(names.includes('Archer Queen'));
  assert.ok(names.includes('L.A.S.S.I'));
  assert.ok(names.includes('Lightning Spell'));
  assert.ok(names.includes('Spiky Ball'));
  assert.ok(names.includes('Wall Wrecker'));
  assert.equal(names.includes('Night Witch'), false);
});

test('renderPlayerArmyCard returns a valid PNG even without icon URLs', async () => {
  const card = await renderPlayerArmyCard(samplePlayer(), {
    assetUrls: new Map()
  });
  const metadata = await sharp(card).metadata();

  assert.equal(card.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(metadata.width, 920);
  assert.ok(metadata.height >= 360);
});
