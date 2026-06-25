import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cocWikiFileName,
  cocWikiFilePageUrl,
  fetchCocWikiImageMap,
  fetchCocWikiImageUrl,
  itemAssetUrl
} from '../src/coc-assets.mjs';

test('cocWikiFileName builds repeatable Clash wiki filenames', () => {
  assert.equal(cocWikiFileName('Lightning Spell'), 'Lightning_Spell_info.png');
  assert.equal(cocWikiFileName('Spiky Ball'), 'Spiky_Ball_info.png');
  assert.equal(cocWikiFileName('P.E.K.K.A'), 'P.E.K.K.A_info.png');
});

test('cocWikiFilePageUrl links to the Clash wiki file page', () => {
  assert.equal(
    cocWikiFilePageUrl('Archer Queen'),
    'https://clashofclans.fandom.com/wiki/File:Archer_Queen_info.png'
  );
});

test('fetchCocWikiImageUrl reads imageinfo URLs', async () => {
  const calls = [];
  const url = await fetchCocWikiImageUrl('Lightning Spell', {
    fetchImpl: async (requestUrl) => {
      calls.push(requestUrl);
      return Response.json({
        query: {
          pages: {
            '1': {
              title: 'File:Lightning Spell info.png',
              imageinfo: [{ url: 'https://static.example/lightning.png' }]
            }
          }
        }
      });
    }
  });

  assert.equal(url, 'https://static.example/lightning.png');
  assert.match(calls[0], /clashofclans\.fandom\.com\/api\.php/);
});

test('fetchCocWikiImageMap batches names and stores lower-case aliases', async () => {
  const imageMap = await fetchCocWikiImageMap(['Archer Queen', 'Spiky Ball'], {
    fetchImpl: async () =>
      Response.json({
        query: {
          pages: {
            '1': {
              title: 'File:Archer Queen info.png',
              imageinfo: [{ url: 'https://static.example/queen.png' }]
            },
            '2': {
              title: 'File:Spiky Ball.png',
              imageinfo: [{ url: 'https://static.example/spiky.png' }]
            }
          }
        }
      })
  });

  assert.equal(imageMap.get('Archer Queen'), 'https://static.example/queen.png');
  assert.equal(imageMap.get('archer queen'), 'https://static.example/queen.png');
  assert.equal(itemAssetUrl({ name: 'Spiky Ball' }, imageMap), 'https://static.example/spiky.png');
});
