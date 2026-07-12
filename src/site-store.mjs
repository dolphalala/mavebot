import fs from 'node:fs/promises';

import pg from 'pg';

const { Pool } = pg;

let poolPromise;
let schemaReady = false;

export const marketplaceSchemaSql = `
create table if not exists marketplace_builders (
  id text primary key,
  display_name text not null,
  specialty text not null,
  trust_score integer not null default 0,
  cadence text not null default '',
  proof_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists marketplace_base_listings (
  id text primary key,
  builder_id text not null references marketplace_builders(id) on delete cascade,
  title text not null,
  town_hall integer not null,
  mode text not null,
  price_cents integer not null default 0,
  currency text not null default 'USD',
  freshness_window_days integer not null default 14,
  status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists marketplace_base_fingerprints (
  id bigserial primary key,
  listing_id text not null references marketplace_base_listings(id) on delete cascade,
  algorithm_version text not null,
  normalized_hash text not null,
  feature_vector jsonb not null default '{}'::jsonb,
  protection_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (algorithm_version, normalized_hash)
);

create table if not exists marketplace_similarity_events (
  id bigserial primary key,
  candidate_listing_id text references marketplace_base_listings(id) on delete set null,
  matched_listing_id text references marketplace_base_listings(id) on delete set null,
  similarity_score numeric(5,4) not null,
  decision text not null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists marketplace_reviews (
  id bigserial primary key,
  listing_id text not null references marketplace_base_listings(id) on delete cascade,
  reviewer_discord_id text,
  rating integer not null check (rating between 1 and 5),
  review_text text not null default '',
  replay_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists marketplace_subscriptions (
  id bigserial primary key,
  builder_id text not null references marketplace_builders(id) on delete cascade,
  buyer_discord_id text,
  tier_name text not null,
  price_cents integer not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
`;

async function readSecret(path) {
  if (!path) return '';
  try {
    return (await fs.readFile(path, 'utf8')).trim();
  } catch {
    return '';
  }
}

export async function databaseConfigFromEnv(env = process.env) {
  if (env.DATABASE_URL) {
    return { connectionString: env.DATABASE_URL };
  }

  const password = env.BASE_MARKETPLACE_DB_PASSWORD || (await readSecret(env.BASE_MARKETPLACE_DB_PASSWORD_FILE));
  const host = env.BASE_MARKETPLACE_DB_HOST;
  const user = env.BASE_MARKETPLACE_DB_USER || 'base_marketplace';
  const database = env.BASE_MARKETPLACE_DB_NAME || 'base_marketplace';
  const port = Number(env.BASE_MARKETPLACE_DB_PORT || 5432);

  if (!host || !password) {
    return null;
  }

  return {
    host,
    port,
    user,
    password,
    database
  };
}

export async function getMarketplacePool(env = process.env) {
  if (!poolPromise) {
    poolPromise = (async () => {
      const config = await databaseConfigFromEnv(env);
      if (!config) return null;
      return new Pool({
        ...config,
        max: Number(env.BASE_MARKETPLACE_DB_POOL_MAX || 4),
        connectionTimeoutMillis: Number(env.BASE_MARKETPLACE_DB_CONNECT_TIMEOUT_MS || 2500)
      });
    })();
  }
  return poolPromise;
}

export async function ensureMarketplaceSchema(pool) {
  if (!pool || schemaReady) return false;
  await pool.query(marketplaceSchemaSql);
  schemaReady = true;
  return true;
}

export async function marketplaceDbHealth(pool) {
  if (!pool) {
    return { configured: false, ok: true, message: 'database not configured' };
  }

  const startedAt = Date.now();
  try {
    await ensureMarketplaceSchema(pool);
    const result = await pool.query('select now() as now');
    return {
      configured: true,
      ok: true,
      latencyMs: Date.now() - startedAt,
      now: result.rows[0]?.now?.toISOString?.() || String(result.rows[0]?.now || '')
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      latencyMs: Date.now() - startedAt,
      message: error.message
    };
  }
}

export function resetMarketplaceStoreForTests() {
  poolPromise = undefined;
  schemaReady = false;
}
