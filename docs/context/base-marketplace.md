# MaveBase Marketplace Context

This file is the durable product memory for the Clash of Clans base layout
marketplace website requested through Discord and then rescued from the failed
remote worker run.

## Product Goal

Build a real website, not another Discord-only command, for trading Clash of
Clans base layouts. The first product slice is a preview app called
`MaveBase`.

The website should help buyers find fresh, trustworthy bases and help builders
sell individual bases or subscriptions. It must support all major layout
categories over time: Town Hall, Builder Base, Capital Hall, war, CWL, Legend
League, trophy, farming, hybrid, and fun bases.

## Recovered User Requirements

- Use Tailwind CSS and plan the structure before building.
- Put the site on the same server as mavebot, but keep it isolated from
  Chatwoot, Bookkeeper, nginx, and other apps.
- Set up Docker and Postgres foundations, not just local static files.
- Provide a direct preview link.
- Make the visual direction animated, fantasy/game-like, mobile responsive,
  and inspired by Clash of Clans without copying copyrighted assets into the
  repo.
- Research existing base builders, pro-base subscription sellers, free layout
  sites, base packs, Patreon/Discord distribution patterns, and current market
  pain points.
- Main problem to solve: buyers do not know if a paid base pack is fresh,
  already leaked, worth renewing, or built by a reliable builder.
- Support individual paid bases around low-dollar prices and recurring builder
  subscriptions.
- Add reviews, comments, ratings, seller pages, and evidence from Clash API
  data where possible.
- Design an anti-repost system: compute a base layout identifier/fingerprint,
  compare similar layouts, and block or flag too-similar reposts inside a
  freshness window such as 14 days.

## Current Website Slice

- Service: `base-marketplace-web`.
- Public preview port: `4192`.
- Health endpoint: `/healthz`.
- Static UI: `web/public/`.
- API routes:
  - `/api/marketplace/summary`.
  - `/api/base-fingerprint/demo`.
- Runtime server: `src/site-server.mjs`.
- Product data and demo listings: `src/base-marketplace-data.mjs`.
- Optional Postgres schema/health layer: `src/site-store.mjs`.
- Internal Postgres service: `base-marketplace-db`.
- Database password file is generated on the server at
  `/opt/urba-apps/discord-bot/shared/base-marketplace-db-password`; never
  commit it.

## Competitive Notes

- Clash Champs positions its base section around downloading battle-tested,
  top-rated bases and offers pro war/trophy bases from a builder team.
- Blueprint CoC publishes free base links, pro base packs, coaching, and
  current CWL/Legend base collections; their own copy emphasizes that public
  free bases get stale quickly once widely shared.
- clashofclans-layouts.com focuses on large free browsing catalogs with copy
  links, town hall/category filters, sorting by date/views/rating, and user
  ratings.

These competitors validate demand, but the product opening is a marketplace
trust layer: freshness windows, seller proof, reviews tied to actual results,
duplicate/repost detection, and transparent subscription quality.

## Anti-Repost Model

Start with a review queue, not a perfect detector:

1. Normalize layout metadata and map structure when available.
2. Extract features such as town hall/mode, compartment graph, wall rings,
   high-defense coordinates, core shape, trap-density zones, and copy-link
   metadata.
3. Hash exact normalized matches.
4. Score approximate similarity for remixed layouts.
5. Block obvious reposts above a threshold during the paid freshness window.
6. Queue borderline matches for moderator/builder review.
7. Persist decisions in `marketplace_similarity_events` so future buyers can
   see why a base was allowed, blocked, or disputed.

## Implementation Rules

- Keep this website as a separate service from the Discord bot runtime.
- Do not use `chat.urba.group`; that domain belongs to Chatwoot.
- Do not touch Chatwoot, Bookkeeper, nginx, Docker daemon settings, or other
  app containers for this site unless Allen explicitly asks.
- Public IP preview is acceptable for the prototype. Add a real domain and TLS
  later only after Allen asks.
- Use external/researched assets carefully. Do not commit copyrighted Clash
  asset packs into this repo. Prefer generated map previews, documented source
  URLs, or server-side cached assets only after legal/source review.
- Future work should replace demo data with Postgres-backed listings,
  builders, reviews, subscriptions, and similarity events.
