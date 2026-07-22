# Mavebot Context Map

This folder is the durable context surface for the mavebot Discord bot. Use it
from Codex Desktop/local git work before changing commands or server behavior.

## Load Order

1. Project `AGENTS.md`.
2. This context map.
3. `operating-memory.md`.
4. `code-map.md`.
5. `server-edit-workflow.md` when working from another computer or directly on
   the Mavebot server.
6. Relevant focused context files:
   `clash-product-delivery.md`, `clash-operations-roadmap.md`,
   `clash-competitor-research.md`, `clash-database-guidance.md`, and
   `clash-ui-guidance.md`.
6. Current source code and tests.

The source code and tests are the final authority when docs are stale.

## Files

- `operating-memory.md`: app identity, server paths, deploy behavior, command
  registration rules, durable state, and safety boundaries.
- `code-map.md`: source-file map and feature change recipes.
- `server-edit-workflow.md`: server SSH editing path, guarded ship commands,
  incident explanation, recovery behavior, and copy/paste instructions.
- `clash-product-delivery.md`: acceptance contract for broad ClashKing,
  ClashPerk, roster, CWL, war-history, and scheduled-collection asks.
- `clash-operations-roadmap.md`: concrete command roadmap for setup, linking,
  roster, war, activity, export, and leadership-command slices.
- `clash-competitor-research.md`: ClashKing/ClashPerk public-source research
  notes, product roadmap expectations, and response requirements.
- `clash-database-guidance.md`: ClashKing/ClashPerk-style durable data and
  collector guidance.
- `clash-ui-guidance.md`: Clash of Clans data, icon, and Discord UI guidance.

## Scope Boundary

This project is intentionally just the Discord bot. The guarded server editing
workspace is a deployment tool, not a chat-control bridge or autonomous coding
worker. Do not add chat-control bridges, website services, or database sidecars
unless Allen explicitly asks for that exact surface again.

## Maintenance Rules

- Add durable facts only when future Codex Desktop work will use them.
- Move repeated implementation rules into focused files instead of bloating
  `operating-memory.md`.
- Delete or rewrite duplicated stale notes after preserving the durable fact in
  the right file.
- Do not store secrets, raw `.env` values, OAuth tokens, private keys, cookies,
  or one-off temporary debugging chatter here.
- When behavior changes, update the docs that explain that behavior in the same
  commit as the code.
