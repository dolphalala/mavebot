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

## July 2026 Frontend Reset

The first remote-worker version looked too generic: dark cards, abstract copy,
and no clear Clash/base-trading product. That direction is rejected.

The website must look and read like a Clash of Clans base market from the first
viewport:

- Use a fantasy/war/base-building visual language: stone panels, gold buttons,
  grass-map texture, wall tiles, tower/core/trap markers, badges, and compact
  battle-board sections.
- Do not use a generic SaaS hero, marketing gradient, or vague marketplace
  copy.
- Show the actual marketplace mechanics immediately: fresh drops, low-dollar
  single-base buys, builder subscriptions, freshness shields, reviews, proof
  bands, leak risk, and similarity verdicts.
- Include Town Hall, Builder Base, and Capital Hall coverage in the visible
  filter model, not only in future notes.
- Make seller pages about cadence, subscription value, dispute/leak risk,
  review history, and proof quality.
- Treat anti-repost detection as a first-class product surface. The UI should
  show the signal list, threshold, blocked/queued/allowed verdicts, and why a
  duplicate was caught.
- Treat Clash API evidence as a first-class product surface. The UI should
  explain how player tags, clan tags, war/CWL, Legend stats, trophy bands, and
  Builder Base proof attach to a listing.
- Keep copyrighted Clash asset packs out of the repo. Generated/CSS map
  previews are acceptable for the prototype; if real icons are added later,
  document source URLs and review the asset policy before caching them.

Future Codex agents should read the recovered Discord requirement before
planning marketplace changes. If the user asks for a "ClashKing/ClashPerk-like"
site or base marketplace, they are asking for a visible, game-themed product
with proof, filters, reviews, and concrete command/database slices, not a thin
landing page.

## July 2026 Marketplace Correction

Allen rejected the heavier "war board" pass too. It looked themed, but it still
felt like an explainer instead of a useful marketplace. Future agents must start
from the product workflow, not visual decoration.

Required first-screen behavior:

- The page must read as a working base shop immediately: search, category
  filters, Town Hall filters, token wallet, top-up, submit-base, buy, preview,
  spotlight, reviews, and seller rows should all be visible or one click away.
- Remove low-value explanatory sections from the primary viewport. Buyers care
  about base type, price, freshness, proof, reviews, seller quality, and whether
  a private link is unlocked.
- Treat site tokens as a core product mechanic. The UI should show balances,
  token packs, buying with tokens, topping up with money, and spending tokens to
  spotlight bases.
- Treat sellers as marketplace participants. Include submission, review queue,
  boost/spotlight mechanics, seller scores, subscriptions, sales cadence, and
  eventual payout/accounting needs.
- Reviews must be part of the buyer loop: leave a review after using a base,
  surface ratings clearly, and connect review history to seller trust.
- Anti-repost/freshness protection stays important, but it should support the
  marketplace instead of dominating the whole page.
- Prefer compact app UI over oversized hero content. The page should feel like
  a Clash-focused marketplace dashboard that Lana or a non-technical user can
  operate, not a pitch deck.

## July 2026 Ten-Pass Product Polish

The next improvement pass made these surfaces mandatory in the prototype and in
future implementation work:

- Buyer library: after purchase, the user should see unlocked private links,
  copy/open actions, review reminders, and what they paid.
- Wallet ledger: token top-ups and spends need visible history so money-to-token
  behavior is obvious.
- Seller queue: submitted base links must land in a review/scanning queue with
  seller, price, status, ETA, and scan result.
- Spotlight queue: paid boosts must show slot timing and expected lift instead
  of being a vague button.
- Marketplace pipeline: submit, scan, list, unlock should be understandable at a
  glance without reading a paragraph.
- Top-up copy should say money and tokens together, for example `$12 for 70
  tokens`, not just a pack name.
- Buying a base should add it to the library and update the wallet/feed, even in
  demo mode.
- Submitting a base should update seller queue state, not just show a toast.
- Reviews should stay tied to the selected base and act like part of the buyer
  loop.
- Keep the anti-repost/freshness system visible, but secondary to the
  marketplace workflows.
