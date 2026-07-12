import express from 'express';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { marketplaceSummary, fingerprintDemo } from './base-marketplace-data.mjs';
import { getMarketplacePool, marketplaceDbHealth } from './site-store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const defaultPublicDir = path.join(repoRoot, 'web', 'public');

export function createSiteApp({ publicDir = defaultPublicDir, env = process.env } = {}) {
  const app = express();
  app.disable('x-powered-by');

  app.get('/healthz', async (_request, response) => {
    const pool = await getMarketplacePool(env);
    const db = await marketplaceDbHealth(pool);
    response.status(db.ok ? 200 : 503).json({
      ok: db.ok,
      service: 'base-marketplace-web',
      version: env.npm_package_version || '0.1.0',
      commit: env.APP_COMMIT || 'local',
      db
    });
  });

  app.get('/api/marketplace/summary', (_request, response) => {
    response.json(marketplaceSummary());
  });

  app.get('/api/base-fingerprint/demo', (_request, response) => {
    response.json(fingerprintDemo);
  });

  app.use(
    express.static(publicDir, {
      etag: true,
      maxAge: '5m'
    })
  );

  app.use((_request, response) => {
    response.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}

export async function startSiteServer({ env = process.env } = {}) {
  const host = env.SITE_HOST || '0.0.0.0';
  const port = Number(env.SITE_PORT || 4192);
  const app = createSiteApp({ env });
  const server = app.listen(port, host, () => {
    console.log(`base-marketplace-web listening on http://${host}:${port}`);
  });
  return { app, server };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startSiteServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
