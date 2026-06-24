import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CocApiError,
  buildPlayerEmbedData,
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

test('buildPlayerEmbedData formats core player stats', () => {
  const embed = buildPlayerEmbedData({
    name: 'Allen',
    tag: '#ABC123',
    townHallLevel: 16,
    trophies: 5123,
    bestTrophies: 6000,
    warStars: 321,
    attackWins: 44,
    builderHallLevel: 10,
    clan: { name: 'mave' },
    role: 'leader'
  });

  assert.equal(embed.title, 'Allen #ABC123');
  assert.equal(embed.description, 'mave (leader)');
  assert.deepEqual(
    embed.fields.map((field) => field.value),
    ['16', '5,123', '6,000', '321', '44', '10']
  );
});
