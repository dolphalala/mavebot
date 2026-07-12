import assert from 'node:assert/strict';
import { test } from 'node:test';

import { marketplaceSummary, fingerprintDemo } from '../src/base-marketplace-data.mjs';
import { createSiteApp } from '../src/site-server.mjs';
import { databaseConfigFromEnv, resetMarketplaceStoreForTests } from '../src/site-store.mjs';

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
    server.once('error', reject);
  });
}

async function withServer(app, callback) {
  const server = await listen(app);
  try {
    const { port } = server.address();
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test('marketplace summary includes core product surfaces', () => {
  const summary = marketplaceSummary();
  assert.ok(summary.listings.length >= 3);
  assert.ok(summary.builders.length >= 3);
  assert.ok(summary.roadmap.some((item) => item.toLowerCase().includes('similarity')));
  assert.ok(summary.findings.some((item) => item.body.toLowerCase().includes('fresh')));
});

test('fingerprint demo has a blocking verdict and an allowed verdict', () => {
  assert.ok(fingerprintDemo.threshold > 0.5);
  assert.ok(fingerprintDemo.verdicts.some((verdict) => verdict.status.toLowerCase().includes('blocked')));
  assert.ok(fingerprintDemo.verdicts.some((verdict) => verdict.status.toLowerCase().includes('allowed')));
});

test('site health, API, and static shell respond without a database', async () => {
  resetMarketplaceStoreForTests();
  const app = createSiteApp({ env: {} });

  await withServer(app, async (baseUrl) => {
    const health = await fetch(`${baseUrl}/healthz`);
    assert.equal(health.status, 200);
    const healthJson = await health.json();
    assert.equal(healthJson.ok, true);
    assert.equal(healthJson.db.configured, false);

    const summaryResponse = await fetch(`${baseUrl}/api/marketplace/summary`);
    assert.equal(summaryResponse.status, 200);
    const summaryJson = await summaryResponse.json();
    assert.ok(summaryJson.listings[0].title.includes('TH'));

    const pageResponse = await fetch(`${baseUrl}/`);
    assert.equal(pageResponse.status, 200);
    const html = await pageResponse.text();
    assert.match(html, /MaveBase/);
    assert.match(html, /@tailwindcss\/browser@4/);
  });
});

test('database config stays disabled unless host and password are present', async () => {
  assert.equal(await databaseConfigFromEnv({}), null);
  assert.equal(await databaseConfigFromEnv({ BASE_MARKETPLACE_DB_HOST: 'db' }), null);
  assert.deepEqual(await databaseConfigFromEnv({ BASE_MARKETPLACE_DB_HOST: 'db', BASE_MARKETPLACE_DB_PASSWORD: 'secret' }), {
    host: 'db',
    port: 5432,
    user: 'base_marketplace',
    password: 'secret',
    database: 'base_marketplace'
  });
});
