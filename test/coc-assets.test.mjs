import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cocWikiFileName,
  cocWikiFilePageUrl,
  cocWikiPageImageUrl,
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

test('fetchCocWikiImageUrl falls back to wiki page thumbnails', async () => {
  const calls = [];
  const url = await fetchCocWikiImageUrl('Fallback Tower Fixture', {
    fetchImpl: async (requestUrl) => {
      calls.push(requestUrl);
      if (calls.length === 1) {
        return Response.json({
          query: {
            pages: {
              '-1': {
                title: 'File:Fallback Tower Fixture info.png',
                missing: ''
              }
            }
          }
        });
      }
      return Response.json({
        query: {
          pages: {
            '2': {
              title: 'Fallback Tower Fixture',
              thumbnail: { source: 'https://static.example/fallback-tower.png' }
            }
          }
        }
      });
    }
  });

  assert.equal(url, 'https://static.example/fallback-tower.png');
  assert.match(calls[1], /prop=pageimages/);
  assert.match(cocWikiPageImageUrl('Fallback Tower Fixture'), /pithumbsize=512/);
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

test('fetchCocWikiImageMap uses page thumbnails for direct file misses', async () => {
  const imageMap = await fetchCocWikiImageMap(['Fallback Cannon Fixture'], {
    fetchImpl: async (requestUrl) => {
      if (String(requestUrl).includes('prop=imageinfo')) {
        return Response.json({
          query: {
            pages: {
              '-1': {
                title: 'File:Fallback Cannon Fixture info.png',
                missing: ''
              }
            }
          }
        });
      }
      return Response.json({
        query: {
          pages: {
            '3': {
              title: 'Fallback Cannon Fixture',
              original: { source: 'https://static.example/fallback-cannon.png' }
            }
          }
        }
      });
    }
  });

  assert.equal(imageMap.get('Fallback Cannon Fixture'), 'https://static.example/fallback-cannon.png');
  assert.equal(imageMap.get('fallback cannon fixture'), 'https://static.example/fallback-cannon.png');
});
